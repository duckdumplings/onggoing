/* eslint-disable no-console */
/**
 * PPTX 운임표 → Supabase rate_tables 임포터.
 *
 * 사용 예:
 *   npx tsx scripts/import-rate-table.ts \
 *     --pptx "/path/to/[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx"
 *   (dry-run: 콘솔에 diff 만 출력)
 *
 *   npx tsx scripts/import-rate-table.ts \
 *     --pptx "/path/to/...pptx" \
 *     --effective-from 2025-06-01 \
 *     --apply                                  (실제 DB 적용)
 *
 * 동작:
 *   1) PPTX 의 ppt/slides/*.xml 추출 (CLI unzip 사용, 추가 npm 의존성 없음)
 *   2) 표 셀 순서로 (시간 / 시간당 / 일일 / 20일) 행 파싱
 *   3) 레이/스타렉스 hourly 운임표 payload JSON 생성
 *   4) 시행일 결정: --effective-from 우선, 없으면 파일명에서 (yy.m.d) 또는 (YYYY-MM-DD) 추출 시도
 *   5) DB 의 동일 (vehicle_type, pricing_plan, effective_from) 행과 diff 출력
 *   6) --apply 면 upsert
 *
 * 추가 npm 의존성 없이 동작 (Node 18+, mac/linux 의 unzip CLI 가정).
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSupabaseServerClient } from '../supabase/config';

type VehicleKey = 'ray' | 'starex';

type HourlyTier = {
  maxMinutes: number;
  ratePerHour: number;
  dailyFare: number;
  monthly20dFare: number;
};

type HourlyPayload = {
  currency: 'KRW';
  unitMinutes: 30;
  minBillMinutes: 120;
  tiers: HourlyTier[];
};

type ParsedTable = {
  vehicle: VehicleKey;
  slideTitle: string;
  rows: Array<{ label: string; ratePerHour: number; dailyFare: number; monthly20dFare: number }>;
};

function parseArgs(argv: string[]): { pptx?: string; effectiveFrom?: string; apply: boolean; sourceDoc?: string } {
  const out: { pptx?: string; effectiveFrom?: string; apply: boolean; sourceDoc?: string } = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pptx') out.pptx = argv[++i];
    else if (a === '--effective-from') out.effectiveFrom = argv[++i];
    else if (a === '--source-doc') out.sourceDoc = argv[++i];
    else if (a === '--apply') out.apply = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: tsx scripts/import-rate-table.ts --pptx <path> [--effective-from YYYY-MM-DD] [--source-doc <label>] [--apply]',
      );
      process.exit(0);
    }
  }
  return out;
}

function extractEffectiveFromFilename(filename: string): string | null {
  // (25.6.1) 또는 (2025-06-01) 또는 (2025.06.01) 형식 지원
  const isoMatch = filename.match(/\((\d{4})-(\d{2})-(\d{2})\)/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dotMatch = filename.match(/\((\d{2,4})\.(\d{1,2})\.(\d{1,2})\)/);
  if (dotMatch) {
    const y = dotMatch[1].length === 2 ? `20${dotMatch[1]}` : dotMatch[1];
    const m = dotMatch[2].padStart(2, '0');
    const d = dotMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function unzipPptx(pptxPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rate-import-'));
  const result = spawnSync('unzip', ['-o', pptxPath, '-d', dir], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`unzip 실패 (${pptxPath}): ${result.stderr || result.stdout}`);
  }
  return dir;
}

function parseSlideTables(slideXml: string): Array<{ rows: string[][] }> {
  const tables: Array<{ rows: string[][] }> = [];
  // 표 단위, 행 단위 정규식 (multiline, ungreedy)
  const tblRegex = /<a:tbl\b[\s\S]*?<\/a:tbl>/g;
  const trRegex = /<a:tr\b[\s\S]*?<\/a:tr>/g;
  const tcRegex = /<a:tc\b[\s\S]*?<\/a:tc>/g;
  const textRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;

  const tblMatches = slideXml.match(tblRegex) || [];
  for (const tbl of tblMatches) {
    const rows: string[][] = [];
    const trMatches = tbl.match(trRegex) || [];
    for (const tr of trMatches) {
      const cells: string[] = [];
      const tcMatches = tr.match(tcRegex) || [];
      for (const tc of tcMatches) {
        const texts: string[] = [];
        let m: RegExpExecArray | null;
        const localRegex = new RegExp(textRegex.source, 'g');
        while ((m = localRegex.exec(tc)) !== null) {
          if (m[1]) texts.push(m[1]);
        }
        cells.push(texts.join(' ').trim());
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push({ rows });
  }
  return tables;
}

function detectVehicleFromSlide(slideXml: string): VehicleKey | null {
  // 슬라이드 제목/문구에서 차종 식별
  if (/스타렉스/.test(slideXml)) return 'starex';
  if (/레이/.test(slideXml)) return 'ray';
  return null;
}

function toInt(s: string): number {
  return Number(String(s).replace(/[,\s]/g, ''));
}

function parseHourLabelToMinutes(label: string): number | null {
  // "2시간", "2시간 반", "3시간 반"
  const m = label.match(/(\d+)\s*시간(\s*반)?/);
  if (!m) return null;
  const hours = Number(m[1]);
  const half = m[2] ? 30 : 0;
  return hours * 60 + half;
}

function parsePptx(pptxPath: string): ParsedTable[] {
  const dir = unzipPptx(pptxPath);
  try {
    const slidesDir = join(dir, 'ppt', 'slides');
    const files = readdirSync(slidesDir)
      .filter((f) => /^slide\d+\.xml$/.test(f))
      .sort();

    const tables: ParsedTable[] = [];
    for (const file of files) {
      const xml = readFileSync(join(slidesDir, file), 'utf-8');
      const vehicle = detectVehicleFromSlide(xml);
      if (!vehicle) continue;

      const slideTables = parseSlideTables(xml);
      // 시간당 운임표는 헤더가 "운임 시간" 으로 시작하는 표를 찾음
      for (const tbl of slideTables) {
        const headerCells = tbl.rows[0] || [];
        const headerJoined = headerCells.join(' ');
        if (!/운임 시간|시간 당 운임/.test(headerJoined)) continue;

        const parsedRows: ParsedTable['rows'] = [];
        for (let i = 1; i < tbl.rows.length; i++) {
          const r = tbl.rows[i];
          if (r.length < 4) continue;
          const minutes = parseHourLabelToMinutes(r[0]);
          if (minutes === null) continue;
          const ratePerHour = toInt(r[1]);
          const dailyFare = toInt(r[2]);
          const monthly20dFare = toInt(r[3]);
          if (!Number.isFinite(ratePerHour) || !Number.isFinite(dailyFare)) continue;
          parsedRows.push({ label: r[0], ratePerHour, dailyFare, monthly20dFare });
        }
        if (parsedRows.length > 0) {
          tables.push({ vehicle, slideTitle: file, rows: parsedRows });
        }
      }
    }
    return tables;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function toHourlyPayload(parsed: ParsedTable): HourlyPayload {
  const tiers: HourlyTier[] = parsed.rows.map((row) => {
    const minutes = parseHourLabelToMinutes(row.label);
    return {
      maxMinutes: minutes ?? 0,
      ratePerHour: row.ratePerHour,
      dailyFare: row.dailyFare,
      monthly20dFare: row.monthly20dFare,
    };
  });
  return {
    currency: 'KRW',
    unitMinutes: 30,
    minBillMinutes: 120,
    tiers,
  };
}

function diffPayload(label: string, before: HourlyPayload | null, after: HourlyPayload): string[] {
  const lines: string[] = [];
  if (!before) {
    lines.push(`  ${label}: (신규) ${after.tiers.length} 행 추가`);
    return lines;
  }
  const len = Math.max(before.tiers.length, after.tiers.length);
  for (let i = 0; i < len; i++) {
    const b = before.tiers[i];
    const a = after.tiers[i];
    if (!b) {
      lines.push(`  ${label}[${i}]: + 신규 ${a.maxMinutes}분 rate=${a.ratePerHour}`);
      continue;
    }
    if (!a) {
      lines.push(`  ${label}[${i}]: - 제거됨 (${b.maxMinutes}분 rate=${b.ratePerHour})`);
      continue;
    }
    if (b.maxMinutes !== a.maxMinutes) {
      lines.push(`  ${label}[${i}].maxMinutes: ${b.maxMinutes} → ${a.maxMinutes}`);
    }
    if (b.ratePerHour !== a.ratePerHour) {
      const delta = a.ratePerHour - b.ratePerHour;
      const sign = delta >= 0 ? '+' : '';
      lines.push(`  ${label}[${a.maxMinutes}분].ratePerHour: ${b.ratePerHour.toLocaleString()} → ${a.ratePerHour.toLocaleString()} (${sign}${delta.toLocaleString()})`);
    }
    if (b.dailyFare !== a.dailyFare) {
      lines.push(`  ${label}[${a.maxMinutes}분].dailyFare: ${b.dailyFare.toLocaleString()} → ${a.dailyFare.toLocaleString()}`);
    }
  }
  return lines;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pptx) {
    console.error('Error: --pptx <path> 인자가 필요합니다. (--help 로 사용법 확인)');
    process.exit(1);
  }

  const filename = args.pptx.split('/').pop() || args.pptx;
  const effectiveFrom = args.effectiveFrom || extractEffectiveFromFilename(filename);
  if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    console.error(
      `Error: 시행일(effective_from)을 파일명에서 추출할 수 없습니다. --effective-from YYYY-MM-DD 로 지정하세요. (filename="${filename}")`,
    );
    process.exit(1);
  }
  const sourceDoc = args.sourceDoc || filename;

  console.log(`\n[import-rate-table] PPTX 파싱: ${args.pptx}`);
  console.log(`  시행일: ${effectiveFrom}`);
  console.log(`  source_doc: ${sourceDoc}`);
  console.log(`  모드: ${args.apply ? 'APPLY (DB 적용)' : 'dry-run (DB 변경 없음)'}\n`);

  const parsed = parsePptx(args.pptx);
  if (parsed.length === 0) {
    console.error('Error: PPTX 에서 운임표를 1개도 추출하지 못했습니다.');
    process.exit(1);
  }

  console.log(`✓ 운임표 ${parsed.length} 개 추출됨:`);
  for (const t of parsed) {
    console.log(`  - ${t.vehicle} (${t.slideTitle}) : ${t.rows.length} 행`);
  }
  console.log('');

  // DB 조회 & diff
  let supabase: ReturnType<typeof createSupabaseServerClient> | null = null;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    console.warn(
      `[import-rate-table] Supabase 환경 변수 미설정 → DB diff/적용 건너뜀: ${e instanceof Error ? e.message : e}`,
    );
  }

  for (const table of parsed) {
    const payload = toHourlyPayload(table);
    console.log(`──── ${table.vehicle} hourly @${effectiveFrom} ────`);

    let beforePayload: HourlyPayload | null = null;
    if (supabase) {
      const { data, error } = await supabase
        .from('rate_tables')
        .select('payload, effective_from, source_doc')
        .eq('vehicle_type', table.vehicle)
        .eq('pricing_plan', 'hourly')
        .eq('effective_from', effectiveFrom)
        .maybeSingle();
      if (error) {
        console.warn(`  DB 조회 실패: ${error.message}`);
      } else if (data?.payload) {
        beforePayload = data.payload as HourlyPayload;
        console.log(`  기존 DB 행 발견: source_doc="${data.source_doc}"`);
      } else {
        console.log('  기존 DB 행 없음 (신규 행으로 추가됩니다)');
      }
    }

    const diffs = diffPayload(table.vehicle, beforePayload, payload);
    if (diffs.length === 0) {
      console.log('  변경 없음 ✓');
    } else {
      console.log('  변경 내역:');
      for (const d of diffs) console.log(d);
    }

    if (args.apply && supabase) {
      const { error } = await supabase
        .from('rate_tables')
        .upsert(
          {
            vehicle_type: table.vehicle,
            pricing_plan: 'hourly',
            contract_min_months: 3,
            effective_from: effectiveFrom,
            source_doc: sourceDoc,
            payload,
            notes: `Imported by scripts/import-rate-table.ts at ${new Date().toISOString()}`,
          },
          { onConflict: 'vehicle_type,pricing_plan,effective_from' },
        );
      if (error) {
        console.error(`  ✗ APPLY 실패: ${error.message}`);
        process.exitCode = 1;
      } else {
        console.log('  ✓ APPLY 완료');
      }
    }
    console.log('');
  }

  if (!args.apply) {
    console.log('\nℹ dry-run 종료. 실제 DB 적용은 동일 명령에 --apply 플래그를 추가하세요.');
  }
}

void main().catch((e) => {
  console.error('[import-rate-table] 예외:', e);
  process.exit(1);
});
