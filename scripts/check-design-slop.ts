/**
 * Design Slop Scanner
 *
 * 룰 위반(이모지, 인라인 글래스, 컬러 셰도우, hex literal 등)을 정적 스캔한다.
 * `.cursor/rules/30-anti-slop-design.mdc` 의 §1~§5를 코드 시점에서 가드.
 *
 * 사용:
 *   npx tsx scripts/check-design-slop.ts            # warn (exit 0)
 *   npx tsx scripts/check-design-slop.ts --strict   # 위반 있으면 exit 1
 *
 * 출력 형식: file:line :: rule :: snippet
 */

import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STRICT = process.argv.includes('--strict');

type Rule = {
  id: string;
  description: string;
  pattern: RegExp;
  fileGlob?: RegExp;
  allow?: (filePath: string, line: string) => boolean;
};

/**
 * 진짜 이모지 픽토그램만 매칭 (Extended_Pictographic 유니코드 속성).
 * 화살표(→), 말줄임표(…), 꺽쇠(「」) 등 일반 텍스트 기호는 자동 제외.
 */
const EMOJI_RE = /\p{Extended_Pictographic}/u;

const RULES: Rule[] = [
  {
    id: 'emoji',
    description: '룰 §4: 이모지 금지 (lucide-react 아이콘 사용)',
    pattern: EMOJI_RE,
    allow: (filePath) => {
      // 룰/문서/타입선언/스크립트 파일은 메타 마크 허용
      if (/\.(md|mdx|json|d\.ts)$/.test(filePath)) return true;
      if (/scripts\//.test(filePath)) return true;
      if (/docs\//.test(filePath)) return true;
      return false;
    },
  },
  {
    id: 'inline-glass',
    description: '룰 §2: 인라인 글래스 금지 (<GlassCard tier="..."> 또는 .glass-* 사용)',
    pattern: /(bg-white\/\d+|bg-slate-\d{3}\/\d+|bg-black\/\d+)[^"'`]*backdrop-blur/,
    fileGlob: /\.(tsx|jsx|ts)$/,
  },
  {
    id: 'hex-literal',
    description: '룰 §1: hex literal 직접 입력 금지 (시맨틱 토큰 사용)',
    pattern: /bg-\[#[0-9a-fA-F]{3,8}\]|text-\[#[0-9a-fA-F]{3,8}\]|border-\[#[0-9a-fA-F]{3,8}\]/,
    fileGlob: /\.(tsx|jsx)$/,
  },
  {
    id: 'color-shadow',
    description: 'north-star §1 슬롭: 모든 항목 컬러 그림자 (depth 인플레이션)',
    pattern: /shadow-(indigo|blue|emerald|rose|amber|violet|cyan|sky|fuchsia|lime)-\d{3}\/\d+/,
    fileGlob: /\.(tsx|jsx)$/,
  },
  {
    id: 'gradient-box',
    description: '룰 §5: 그라디언트 박스는 allowlist 외 금지 (단색 surface 사용)',
    pattern: /bg-gradient-to-(r|l|t|b|tr|tl|br|bl)\s+from-(indigo|blue|violet|emerald|rose|amber|primary)/,
    fileGlob: /\.(tsx|jsx)$/,
    allow: (filePath) => {
      // 추후 allowlist: login hero, skeleton shimmer
      if (/login|onboarding|hero/i.test(filePath)) return true;
      return false;
    },
  },
  {
    id: 'window-global',
    description: '룰 외: window.* 전역 의존 금지 (context/props 사용)',
    pattern: /window\.(setRouteOptimizerInput|multiDriverResult|lastOptimizationError)/,
    fileGlob: /\.(tsx|jsx|ts)$/,
  },
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

type Violation = {
  file: string;
  line: number;
  rule: Rule;
  snippet: string;
};

async function main() {
  const here =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..');
  const targets = ['src'];

  const allFiles = targets.flatMap((t) => walk(path.join(root, t)));
  const violations: Violation[] = [];

  for (const file of allFiles) {
    const rel = path.relative(root, file);
    const content = await readFile(file, 'utf8');
    const lines = content.split('\n');

    for (const rule of RULES) {
      if (rule.fileGlob && !rule.fileGlob.test(file)) continue;
      lines.forEach((line, idx) => {
        if (!rule.pattern.test(line)) return;
        if (rule.allow && rule.allow(rel, line)) return;
        violations.push({
          file: rel,
          line: idx + 1,
          rule,
          snippet: line.trim().slice(0, 120),
        });
      });
    }
  }

  if (violations.length === 0) {
    console.log('[design-slop] 룰 위반 없음.');
    return;
  }

  const byRule = new Map<string, Violation[]>();
  for (const v of violations) {
    const arr = byRule.get(v.rule.id) ?? [];
    arr.push(v);
    byRule.set(v.rule.id, arr);
  }

  for (const [id, arr] of byRule) {
    const desc = arr[0].rule.description;
    console.log(`\n[${id}] ${desc} — ${arr.length}건`);
    for (const v of arr.slice(0, 20)) {
      console.log(`  ${v.file}:${v.line} :: ${v.snippet}`);
    }
    if (arr.length > 20) console.log(`  ... +${arr.length - 20}건`);
  }

  console.log(`\n총 ${violations.length}건 위반.`);

  if (STRICT) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
