import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun } from 'docx';

/**
 * pdfkit 기본 폰트(Helvetica)는 한글 글리프가 없어 PDF에서 한글이 깨진다.
 * public/fonts에 번들한 Pretendard(OTF/CFF)를 임베드해 한글을 정상 렌더한다.
 * 폰트 파일이 없으면(번들 누락 등) 예외 대신 기본 폰트로 graceful degrade.
 */
const KOREAN_FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'Pretendard-Regular.otf');
let cachedKoreanFont: Buffer | null | undefined;
function loadKoreanFont(): Buffer | null {
  if (cachedKoreanFont !== undefined) return cachedKoreanFont;
  try {
    cachedKoreanFont = fs.readFileSync(KOREAN_FONT_PATH);
  } catch {
    cachedKoreanFont = null;
  }
  return cachedKoreanFont;
}

export type GeneratedFileType = 'pdf' | 'xlsx' | 'md' | 'txt' | 'docx' | 'json';

/** 견적서에 실을 시나리오 1건 요약(요금제 비교 포함). */
export type ScenarioDocSummary = {
  label: string;
  recommendedPlan?: 'hourly' | 'perJob';
  oneTimePrice?: number;
  annualPrice?: number;
  hourlyTotal?: number;
  perJobTotal?: number;
  km?: number;
  totalMinutes?: number;
};

export type GenerationInput = {
  sessionTitle?: string;
  userRequest?: string;
  assistantMessage?: string;
  quote?: any;
  routeSummary?: any;
  extracted?: any;
  assumptions?: string[];
  ragSources?: string[];
  ragSnippets?: string[];
  /** 고객/서비스 메타(있으면 견적서 머리말에 노출). */
  customerName?: string;
  vehicleType?: string;
  scheduleType?: string;
  frequencyLabel?: string | null;
  /** 다중 시나리오 비교(요금제별). */
  scenarios?: ScenarioDocSummary[];
  recommendedScenarioLabel?: string | null;
};

const won = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? `₩${Math.round(n).toLocaleString('ko-KR')}` : '-';
};

const planLabel = (p?: 'hourly' | 'perJob'): string =>
  p === 'hourly' ? '시간당' : p === 'perJob' ? '단건' : '-';

export type GeneratedFile = {
  fileType: GeneratedFileType;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

function sanitizeName(name: string): string {
  return name.replace(/[^\w\-가-힣]+/g, '_').slice(0, 80) || 'output';
}

function defaultBaseName(input: GenerationInput): string {
  return sanitizeName(input.sessionTitle || 'ai_quote');
}

function buildMarkdown(input: GenerationInput): string {
  const lines: string[] = [];
  lines.push('# 옹고잉 물류 견적서');
  lines.push('');
  lines.push(`- 생성 시각: ${new Date().toLocaleString('ko-KR')}`);
  if (input.customerName) lines.push(`- 고객: ${input.customerName}`);
  if (input.vehicleType) lines.push(`- 차종: ${input.vehicleType}`);
  if (input.scheduleType) lines.push(`- 운행 유형: ${input.scheduleType === 'regular' ? '정기' : '비정기'}`);
  if (input.frequencyLabel) lines.push(`- 빈도: ${input.frequencyLabel}`);
  lines.push('');

  if (Array.isArray(input.scenarios) && input.scenarios.length) {
    lines.push('## 시나리오 비교');
    lines.push('> 1회 운임은 옹고잉 유리(시간당/단건 중 높은) 요금제 기준이며, 두 요금제를 함께 표기합니다.');
    lines.push('');
    lines.push('| 시나리오 | 채택 요금제 | 거리 | 소요 | 1회 운임 | 연 운임 | 시간당 | 단건 |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const s of input.scenarios) {
      const star = s.label === input.recommendedScenarioLabel ? ' (추천)' : '';
      lines.push(
        `| ${s.label}${star} | ${planLabel(s.recommendedPlan)} | ${s.km != null ? `${s.km.toFixed(1)}km` : '-'} | ${s.totalMinutes != null ? `${s.totalMinutes}분` : '-'} | ${won(s.oneTimePrice)} | ${won(s.annualPrice)} | ${won(s.hourlyTotal)} | ${won(s.perJobTotal)} |`
      );
    }
    lines.push('');
  }

  if (input.userRequest) {
    lines.push('## 사용자 요청');
    lines.push(input.userRequest);
    lines.push('');
  }
  if (input.assistantMessage) {
    lines.push('## AI 응답');
    lines.push(input.assistantMessage);
    lines.push('');
  }
  if (input.quote) {
    lines.push('## 견적 요약 (기준)');
    lines.push(`- 기준 예상 운임: ${input.quote.totalPriceFormatted || input.quote.totalPrice || '-'}`);
    lines.push(`- 거리: ${input.quote?.basis?.distanceKm ?? '-'} km`);
    lines.push(`- 과금시간: ${input.quote?.basis?.totalBillMinutes ?? '-'} 분`);
    lines.push('');
  }
  if (input.routeSummary) {
    lines.push('## 경로 요약');
    lines.push(`- 총 거리: ${input.routeSummary.totalDistance ?? '-'} m`);
    lines.push(`- 총 시간: ${input.routeSummary.totalTime ?? '-'} s`);
    lines.push('');
  }
  if (Array.isArray(input.assumptions) && input.assumptions.length) {
    lines.push('## 가정');
    for (const assumption of input.assumptions) {
      lines.push(`- ${assumption}`);
    }
    lines.push('');
  }
  if (Array.isArray(input.ragSources) && input.ragSources.length) {
    lines.push('## 참고 소스');
    for (const source of input.ragSources) {
      lines.push(`- ${source}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function generatePdf(input: GenerationInput): Promise<GeneratedFile> {
  const baseName = defaultBaseName(input);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve());
    doc.on('error', reject);

    // 한글 폰트 임베드(없으면 기본 폰트 유지). 등록 후 기본 폰트로 지정해 모든 text에 적용.
    const koreanFont = loadKoreanFont();
    if (koreanFont) {
      doc.registerFont('Pretendard', koreanFont);
      doc.font('Pretendard');
    }

    doc.fontSize(18).text('AI 견적 상세 리포트');
    doc.moveDown();
    doc.fontSize(11).text(`생성 시각: ${new Date().toLocaleString('ko-KR')}`);
    doc.moveDown();
    if (input.userRequest) {
      doc.fontSize(13).text('사용자 요청', { underline: true });
      doc.fontSize(10).text(input.userRequest);
      doc.moveDown();
    }
    if (Array.isArray(input.scenarios) && input.scenarios.length) {
      doc.fontSize(13).text('시나리오 비교 (옹고잉 유리 기준)', { underline: true });
      for (const s of input.scenarios) {
        const star = s.label === input.recommendedScenarioLabel ? ' [추천]' : '';
        doc
          .fontSize(10)
          .text(
            `${s.label}${star} · ${planLabel(s.recommendedPlan)} · 1회 ${won(s.oneTimePrice)} · 연 ${won(s.annualPrice)} (시간당 ${won(s.hourlyTotal)} / 단건 ${won(s.perJobTotal)})`
          );
      }
      doc.moveDown();
    }
    if (input.quote) {
      doc.fontSize(13).text('견적 요약 (기준)', { underline: true });
      doc.fontSize(10).text(`기준 예상 운임: ${input.quote.totalPriceFormatted || input.quote.totalPrice || '-'}`);
      doc.fontSize(10).text(`거리: ${input.quote?.basis?.distanceKm ?? '-'} km`);
      doc.fontSize(10).text(`과금시간: ${input.quote?.basis?.totalBillMinutes ?? '-'} 분`);
      doc.moveDown();
    }
    if (input.assistantMessage) {
      doc.fontSize(13).text('AI 코멘트', { underline: true });
      doc.fontSize(10).text(input.assistantMessage);
      doc.moveDown();
    }
    if (input.assumptions?.length) {
      doc.fontSize(13).text('가정', { underline: true });
      for (const item of input.assumptions) {
        doc.fontSize(10).text(`- ${item}`);
      }
    }
    doc.end();
  });

  return {
    fileType: 'pdf',
    fileName: `${baseName}_quote_report.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.concat(chunks),
  };
}

function generateXlsx(input: GenerationInput): GeneratedFile {
  const baseName = defaultBaseName(input);
  const wb = XLSX.utils.book_new();
  const summaryRows = [
    ['항목', '값'],
    ['기준 예상 운임', input.quote?.totalPriceFormatted || input.quote?.totalPrice || '-'],
    ['거리(km)', input.quote?.basis?.distanceKm ?? '-'],
    ['과금시간(분)', input.quote?.basis?.totalBillMinutes ?? '-'],
    ['차량', input.quote?.basis?.vehicleType ?? '-'],
    ['스케줄', input.quote?.basis?.scheduleType ?? '-'],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  if (Array.isArray(input.scenarios) && input.scenarios.length) {
    const scenarioRows: (string | number)[][] = [
      ['시나리오', '채택 요금제', '거리(km)', '소요(분)', '1회 운임', '연 운임', '시간당', '단건', '추천'],
      ...input.scenarios.map((s) => [
        s.label,
        planLabel(s.recommendedPlan),
        s.km ?? '-',
        s.totalMinutes ?? '-',
        Number.isFinite(Number(s.oneTimePrice)) ? Math.round(Number(s.oneTimePrice)) : '-',
        Number.isFinite(Number(s.annualPrice)) ? Math.round(Number(s.annualPrice)) : '-',
        Number.isFinite(Number(s.hourlyTotal)) ? Math.round(Number(s.hourlyTotal)) : '-',
        Number.isFinite(Number(s.perJobTotal)) ? Math.round(Number(s.perJobTotal)) : '-',
        s.label === input.recommendedScenarioLabel ? '추천' : '',
      ]),
    ];
    const scenarioSheet = XLSX.utils.aoa_to_sheet(scenarioRows);
    XLSX.utils.book_append_sheet(wb, scenarioSheet, 'Scenarios');
  }

  const noteText = buildMarkdown(input);
  const noteSheet = XLSX.utils.aoa_to_sheet(
    noteText.split('\n').map((line) => [line])
  );
  XLSX.utils.book_append_sheet(wb, noteSheet, 'Notes');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return {
    fileType: 'xlsx',
    fileName: `${baseName}_route_summary.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  };
}

async function generateDocx(input: GenerationInput): Promise<GeneratedFile> {
  const baseName = defaultBaseName(input);
  const text = buildMarkdown(input);
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: text.split('\n').map((line) =>
          new Paragraph({
            children: [new TextRun(line || ' ')],
          })
        ),
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  return {
    fileType: 'docx',
    fileName: `${baseName}_customer_proposal.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  };
}

export async function generateFile(
  type: GeneratedFileType,
  input: GenerationInput
): Promise<GeneratedFile> {
  const baseName = defaultBaseName(input);
  switch (type) {
    case 'pdf':
      return generatePdf(input);
    case 'xlsx':
      return generateXlsx(input);
    case 'md': {
      const content = buildMarkdown(input);
      return {
        fileType: 'md',
        fileName: `${baseName}_ops_brief.md`,
        mimeType: 'text/markdown',
        buffer: Buffer.from(content, 'utf-8'),
      };
    }
    case 'txt': {
      const content = buildMarkdown(input).replace(/[#*`]/g, '');
      return {
        fileType: 'txt',
        fileName: `${baseName}_ops_brief.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from(content, 'utf-8'),
      };
    }
    case 'docx':
      return generateDocx(input);
    case 'json': {
      const payload = JSON.stringify(input, null, 2);
      return {
        fileType: 'json',
        fileName: `${baseName}_structured.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(payload, 'utf-8'),
      };
    }
    default:
      throw new Error(`지원하지 않는 파일 타입: ${type}`);
  }
}

