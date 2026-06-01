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

/** 견적서 발행 주체(공급자) 정보. 미지정 시 기본값 사용. */
export type QuoteIssuer = {
  name?: string;
  email?: string;
  contact?: string;
  bizNumber?: string;
  address?: string;
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

  // --- 화주사 전달용 정식 견적서 메타(사용자 희망 형태로 커스터마이즈) ---
  /** 견적번호. 미지정 시 자동 생성(Q-YYYYMMDD-XXXX). */
  quoteNumber?: string;
  /** 수신처(화주사명). 미지정 시 customerName 사용. */
  recipientName?: string;
  /** 수신처 담당/연락처. */
  recipientContact?: string;
  /** 유효기간(발행일 기준 일수). 기본 14일. */
  validUntilDays?: number;
  /** 공급자(발행처) 정보. */
  issuer?: QuoteIssuer;
  /** 비고/특이사항. */
  notes?: string;
  /** 부가세율(기본 0.1). */
  taxRate?: number;
  /** 부가세 표기 여부(기본 true). */
  includeVat?: boolean;
};

const won = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? `₩${Math.round(n).toLocaleString('ko-KR')}` : '-';
};

const planLabel = (p?: 'hourly' | 'perJob'): string =>
  p === 'hourly' ? '시간당' : p === 'perJob' ? '단건' : '-';

const DEFAULT_ISSUER: Required<Pick<QuoteIssuer, 'name' | 'email'>> & QuoteIssuer = {
  name: '옹고잉 물류',
  email: 'info@naeyil.com',
};

function resolveIssuer(issuer?: QuoteIssuer): QuoteIssuer {
  return { ...DEFAULT_ISSUER, ...(issuer || {}) };
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveQuoteNumber(input: GenerationInput, now: Date): string {
  if (input.quoteNumber) return input.quoteNumber;
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const seq = pad(Math.floor(Math.random() * 10000), 4);
  return `Q-${datePart}-${seq}`;
}

/** 견적서 대표 금액(공급가액 기준). 추천 시나리오 1회 운임 → quote.totalPrice 순으로 채택. */
function pickQuoteAmount(input: GenerationInput): number | null {
  const recommended = (input.scenarios || []).find((s) => s.label === input.recommendedScenarioLabel);
  const candidate =
    recommended?.oneTimePrice ??
    (input.scenarios || [])[0]?.oneTimePrice ??
    input.quote?.totalPrice;
  const n = Number(candidate);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function pickAnnualAmount(input: GenerationInput): number | null {
  const recommended = (input.scenarios || []).find((s) => s.label === input.recommendedScenarioLabel);
  const candidate = recommended?.annualPrice ?? (input.scenarios || [])[0]?.annualPrice;
  const n = Number(candidate);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const scheduleLabel = (s?: string): string =>
  s === 'regular' ? '정기' : s === 'ad-hoc' || s === 'adhoc' ? '비정기' : s || '-';

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
  const now = new Date();
  const issuer = resolveIssuer(input.issuer);
  const quoteNumber = resolveQuoteNumber(input, now);
  const validDays = input.validUntilDays ?? 14;
  const validUntil = addDays(now, validDays);
  const recipient = input.recipientName || input.customerName || '';
  const taxRate = typeof input.taxRate === 'number' ? input.taxRate : 0.1;
  const includeVat = input.includeVat !== false;
  const supply = pickQuoteAmount(input);
  const vat = supply != null && includeVat ? Math.round(supply * taxRate) : 0;
  const total = supply != null ? supply + vat : null;

  const lines: string[] = [];
  lines.push('# 견적서');
  lines.push('');
  lines.push(`발행: **${issuer.name}**${issuer.email ? ` · ${issuer.email}` : ''}`);
  lines.push('');
  lines.push(`- 견적번호: ${quoteNumber}`);
  lines.push(`- 발행일: ${formatDate(now)}`);
  lines.push(`- 유효기간: ${formatDate(validUntil)} 까지 (${validDays}일)`);
  if (recipient) lines.push(`- 수신: ${recipient} 귀하`);
  if (input.vehicleType) lines.push(`- 차종: ${input.vehicleType}`);
  if (input.scheduleType) lines.push(`- 운행 유형: ${scheduleLabel(input.scheduleType)}`);
  if (input.frequencyLabel) lines.push(`- 빈도: ${input.frequencyLabel}`);
  lines.push('');

  lines.push('## 견적 금액');
  lines.push('| 항목 | 금액 |');
  lines.push('|---|---|');
  lines.push(`| 운임 공급가액 | ${supply != null ? won(supply) : '별도 협의'} |`);
  if (includeVat) lines.push(`| 부가세 (${Math.round(taxRate * 100)}%) | ${supply != null ? won(vat) : '-'} |`);
  lines.push(`| **합계${includeVat ? ' (VAT 포함)' : ''}** | **${total != null ? won(total) : '별도 협의'}** |`);
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

// 견적서 색상 팔레트(화면 토큰과 정합)
const PDF_INK = '#0f172a';
const PDF_MUTED = '#64748b';
const PDF_LINE = '#e2e8f0';
const PDF_ACCENT = '#4f46e5';
const PDF_ACCENT_SOFT = '#eef2ff';
const PDF_HEAD = '#f1f5f9';

async function generatePdf(input: GenerationInput): Promise<GeneratedFile> {
  const baseName = defaultBaseName(input);
  const now = new Date();
  const issuer = resolveIssuer(input.issuer);
  const quoteNumber = resolveQuoteNumber(input, now);
  const validDays = input.validUntilDays ?? 14;
  const validUntil = addDays(now, validDays);
  const recipient = input.recipientName || input.customerName || '';
  const taxRate = typeof input.taxRate === 'number' ? input.taxRate : 0.1;
  const includeVat = input.includeVat !== false;
  const supply = pickQuoteAmount(input);
  const vat = supply != null && includeVat ? Math.round(supply * taxRate) : 0;
  const total = supply != null ? supply + vat : null;
  const annual = pickAnnualAmount(input);

  const MARGIN = 40;
  const PAGE_W = 595.28;
  const CONTENT_W = PAGE_W - MARGIN * 2; // 515.28
  const X0 = MARGIN;
  const X1 = PAGE_W - MARGIN;

  const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve());
    doc.on('error', reject);

    const koreanFont = loadKoreanFont();
    if (koreanFont) {
      doc.registerFont('KR', koreanFont);
      doc.font('KR');
    }

    let y = MARGIN;

    const ensureSpace = (need: number) => {
      if (y + need > 841.89 - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
    };

    const text = (
      value: string,
      x: number,
      yy: number,
      opts: { width?: number; align?: 'left' | 'right' | 'center'; size?: number; color?: string } = {}
    ) => {
      doc.fontSize(opts.size ?? 9).fillColor(opts.color ?? PDF_INK);
      doc.text(value, x, yy, { width: opts.width, align: opts.align, lineBreak: opts.width != null });
    };

    const sectionTitle = (label: string) => {
      ensureSpace(28);
      doc.save();
      doc.rect(X0, y, 3, 12).fill(PDF_ACCENT);
      doc.restore();
      text(label, X0 + 10, y, { size: 11, color: PDF_INK });
      y += 22;
    };

    // 표 한 줄 그리기(셀 수직 중앙 근사 정렬)
    const tableRow = (
      cols: { w: number; text: string; align?: 'left' | 'right' | 'center'; color?: string }[],
      opts: { h?: number; fill?: string; size?: number } = {}
    ) => {
      const h = opts.h ?? 22;
      const size = opts.size ?? 9;
      const rowW = cols.reduce((a, c) => a + c.w, 0);
      ensureSpace(h);
      if (opts.fill) {
        doc.save();
        doc.rect(X0, y, rowW, h).fill(opts.fill);
        doc.restore();
      }
      let cx = X0;
      for (const c of cols) {
        doc.fontSize(size).fillColor(c.color ?? PDF_INK);
        doc.text(c.text, cx + 6, y + (h - size) / 2 - 1, {
          width: c.w - 12,
          align: c.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
        cx += c.w;
      }
      doc.save();
      doc.lineWidth(0.5).strokeColor(PDF_LINE);
      doc.rect(X0, y, rowW, h).stroke();
      doc.restore();
      y += h;
    };

    // ── 헤더: 좌측 타이틀 / 우측 발행처 ──
    text('견 적 서', X0, y, { size: 24, color: PDF_ACCENT });
    text(issuer.name || '', X0, y + 4, { width: CONTENT_W, align: 'right', size: 13, color: PDF_INK });
    const issuerMeta = [issuer.email, issuer.contact, issuer.bizNumber ? `사업자 ${issuer.bizNumber}` : '']
      .filter(Boolean)
      .join('  ·  ');
    text(issuerMeta, X0, y + 24, { width: CONTENT_W, align: 'right', size: 9, color: PDF_MUTED });
    text('QUOTATION', X0, y + 30, { size: 9, color: PDF_MUTED });
    y += 50;

    // ── 메타 바: 견적번호 / 발행일 / 유효기간 ──
    doc.save();
    doc.rect(X0, y, CONTENT_W, 26).fill(PDF_HEAD);
    doc.restore();
    const metaW = CONTENT_W / 3;
    const metaCol = (idx: number, label: string, value: string) => {
      const mx = X0 + metaW * idx + 10;
      text(label, mx, y + 5, { size: 8, color: PDF_MUTED });
      text(value, mx, y + 14, { size: 9, color: PDF_INK });
    };
    metaCol(0, '견적번호', quoteNumber);
    metaCol(1, '발행일', formatDate(now));
    metaCol(2, '유효기간', `${formatDate(validUntil)} 까지 (${validDays}일)`);
    y += 38;

    // ── 수신처 ──
    if (recipient) {
      text(`수신: ${recipient} 귀하`, X0, y, { size: 11, color: PDF_INK });
      if (input.recipientContact) {
        text(input.recipientContact, X0, y, { width: CONTENT_W, align: 'right', size: 9, color: PDF_MUTED });
      }
      y += 20;
    }
    text('아래와 같이 견적을 제출합니다.', X0, y, { size: 9, color: PDF_MUTED });
    y += 22;

    // ── 견적 개요 ──
    sectionTitle('견적 개요');
    const overview: { k: string; v: string }[] = [
      { k: '차종', v: input.vehicleType || input.quote?.basis?.vehicleType || '-' },
      { k: '운행 유형', v: scheduleLabel(input.scheduleType || input.quote?.basis?.scheduleType) },
      { k: '운행 빈도', v: input.frequencyLabel || '-' },
      { k: '총 거리', v: input.quote?.basis?.distanceKm != null ? `${input.quote.basis.distanceKm} km` : '-' },
      { k: '과금 시간', v: input.quote?.basis?.totalBillMinutes != null ? `${input.quote.basis.totalBillMinutes} 분` : '-' },
      { k: '추천 시나리오', v: input.recommendedScenarioLabel || '-' },
    ];
    const ovColW = CONTENT_W / 2;
    for (let i = 0; i < overview.length; i += 2) {
      const left = overview[i];
      const right = overview[i + 1];
      tableRow([
        { w: ovColW * 0.4, text: left.k, color: PDF_MUTED },
        { w: ovColW * 0.6, text: left.v },
        { w: ovColW * 0.4, text: right ? right.k : '', color: PDF_MUTED },
        { w: ovColW * 0.6, text: right ? right.v : '' },
      ]);
    }
    y += 14;

    // ── 견적 금액 ──
    sectionTitle('견적 금액');
    tableRow(
      [
        { w: CONTENT_W * 0.6, text: '항목', color: PDF_MUTED },
        { w: CONTENT_W * 0.4, text: '금액 (VAT 별도)', align: 'right', color: PDF_MUTED },
      ],
      { fill: PDF_HEAD, size: 9 }
    );
    tableRow([
      { w: CONTENT_W * 0.6, text: '운임 공급가액' },
      { w: CONTENT_W * 0.4, text: supply != null ? won(supply) : '별도 협의', align: 'right' },
    ]);
    if (includeVat) {
      tableRow([
        { w: CONTENT_W * 0.6, text: `부가세 (${Math.round(taxRate * 100)}%)`, color: PDF_MUTED },
        { w: CONTENT_W * 0.4, text: supply != null ? won(vat) : '-', align: 'right', color: PDF_MUTED },
      ]);
    }
    tableRow(
      [
        { w: CONTENT_W * 0.6, text: includeVat ? '합계 (VAT 포함)' : '합계', color: PDF_ACCENT },
        { w: CONTENT_W * 0.4, text: total != null ? won(total) : '별도 협의', align: 'right', color: PDF_ACCENT },
      ],
      { fill: PDF_ACCENT_SOFT, h: 26, size: 11 }
    );
    if (annual != null) {
      tableRow([
        { w: CONTENT_W * 0.6, text: '참고: 연간 예상 운임 (정기 기준)', color: PDF_MUTED },
        { w: CONTENT_W * 0.4, text: won(annual), align: 'right', color: PDF_MUTED },
      ]);
    }
    y += 14;

    // ── 시나리오 비교 ──
    if (Array.isArray(input.scenarios) && input.scenarios.length) {
      sectionTitle('시나리오 비교');
      const cw = [CONTENT_W * 0.26, CONTENT_W * 0.14, CONTENT_W * 0.12, CONTENT_W * 0.12, CONTENT_W * 0.18, CONTENT_W * 0.18];
      tableRow(
        [
          { w: cw[0], text: '시나리오', color: PDF_MUTED },
          { w: cw[1], text: '요금제', color: PDF_MUTED },
          { w: cw[2], text: '거리', align: 'right', color: PDF_MUTED },
          { w: cw[3], text: '소요', align: 'right', color: PDF_MUTED },
          { w: cw[4], text: '1회 운임', align: 'right', color: PDF_MUTED },
          { w: cw[5], text: '연 운임', align: 'right', color: PDF_MUTED },
        ],
        { fill: PDF_HEAD }
      );
      for (const s of input.scenarios) {
        const isRec = s.label === input.recommendedScenarioLabel;
        tableRow(
          [
            { w: cw[0], text: `${s.label}${isRec ? ' (추천)' : ''}`, color: isRec ? PDF_ACCENT : PDF_INK },
            { w: cw[1], text: planLabel(s.recommendedPlan) },
            { w: cw[2], text: s.km != null ? `${s.km.toFixed(1)}km` : '-', align: 'right' },
            { w: cw[3], text: s.totalMinutes != null ? `${s.totalMinutes}분` : '-', align: 'right' },
            { w: cw[4], text: won(s.oneTimePrice), align: 'right' },
            { w: cw[5], text: won(s.annualPrice), align: 'right' },
          ],
          isRec ? { fill: PDF_ACCENT_SOFT } : {}
        );
      }
      y += 14;
    }

    // ── 산출 근거 / 가정 ──
    if (input.assumptions?.length) {
      sectionTitle('산출 근거 및 가정');
      doc.fontSize(9).fillColor(PDF_INK);
      for (const item of input.assumptions) {
        ensureSpace(16);
        doc.text(`•  ${item}`, X0 + 4, y, { width: CONTENT_W - 8 });
        y = doc.y + 4;
      }
      y += 10;
    }

    // ── 유의사항 ──
    sectionTitle('유의사항');
    const disclaimers = [
      '본 견적은 입력하신 조건과 Tmap 실시간/예측 교통정보를 기반으로 산출된 추정치이며, 실제 운행 시점의 교통·대기·작업 시간에 따라 변동될 수 있습니다.',
      `견적 유효기간은 발행일로부터 ${validDays}일이며, 기간 경과 시 재산정이 필요합니다.`,
      '통행료는 실제 경로/차종에 따라 달라질 수 있으며, 별도 정산될 수 있습니다.',
      input.notes,
    ].filter(Boolean) as string[];
    doc.fontSize(8.5).fillColor(PDF_MUTED);
    for (const line of disclaimers) {
      ensureSpace(14);
      doc.text(`-  ${line}`, X0 + 4, y, { width: CONTENT_W - 8 });
      y = doc.y + 3;
    }
    y += 10;

    // ── 푸터: 발행처 ──
    ensureSpace(40);
    doc.save();
    doc.lineWidth(0.5).strokeColor(PDF_LINE);
    doc.moveTo(X0, y).lineTo(X1, y).stroke();
    doc.restore();
    y += 8;
    text(`발행: ${issuer.name}`, X0, y, { size: 9, color: PDF_INK });
    const footMeta = [issuer.email, issuer.contact].filter(Boolean).join('  ·  ');
    if (footMeta) text(footMeta, X0, y, { width: CONTENT_W, align: 'right', size: 9, color: PDF_MUTED });

    doc.end();
  });

  return {
    fileType: 'pdf',
    fileName: `${baseName}_견적서.pdf`,
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

