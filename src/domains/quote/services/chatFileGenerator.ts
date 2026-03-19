import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export type GeneratedFileType = 'pdf' | 'xlsx' | 'md' | 'txt' | 'docx' | 'json';

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
};

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
  lines.push('# AI 견적 결과');
  lines.push('');
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
    lines.push('## 견적 요약');
    lines.push(`- 총액: ${input.quote.totalPriceFormatted || input.quote.totalPrice || '-'}`);
    lines.push(`- 추천 플랜: ${input.quote.recommendedPlan || '-'}`);
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

    doc.fontSize(18).text('AI 견적 상세 리포트');
    doc.moveDown();
    doc.fontSize(11).text(`생성 시각: ${new Date().toLocaleString('ko-KR')}`);
    doc.moveDown();
    if (input.userRequest) {
      doc.fontSize(13).text('사용자 요청', { underline: true });
      doc.fontSize(10).text(input.userRequest);
      doc.moveDown();
    }
    if (input.quote) {
      doc.fontSize(13).text('견적 요약', { underline: true });
      doc.fontSize(10).text(`총액: ${input.quote.totalPriceFormatted || input.quote.totalPrice || '-'}`);
      doc.fontSize(10).text(`추천 플랜: ${input.quote.recommendedPlan || '-'}`);
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
    ['총액', input.quote?.totalPriceFormatted || input.quote?.totalPrice || '-'],
    ['추천플랜', input.quote?.recommendedPlan || '-'],
    ['거리(km)', input.quote?.basis?.distanceKm ?? '-'],
    ['과금시간(분)', input.quote?.basis?.totalBillMinutes ?? '-'],
    ['차량', input.quote?.basis?.vehicleType ?? '-'],
    ['스케줄', input.quote?.basis?.scheduleType ?? '-'],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

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

