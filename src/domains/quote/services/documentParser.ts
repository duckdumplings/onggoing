// 문서 파싱 서비스
// PDF, Excel, Word, 이미지 파일에서 텍스트/데이터 추출

import { DocumentFileType } from '../types/quoteDocument';
import * as XLSX from 'xlsx';

// Next.js 서버 사이드에서 CommonJS 모듈 로드
// 동적 require를 사용하여 런타임에 로드
let pdfParse: any;
let mammoth: any;
let PDFParseClass: any;

// 서버 사이드에서만 실행되도록 체크
if (typeof window === 'undefined') {
  try {
    // @ts-ignore - Node.js 환경에서만 작동
    pdfParse = require('pdf-parse');
    // @ts-ignore - Node.js 환경에서만 작동
    mammoth = require('mammoth');

    // PDFParse 클래스 추출
    PDFParseClass = pdfParse.PDFParse || (pdfParse as any).PDFParse;

    // Node.js 환경에서는 워커 설정 (pdf-parse v2는 내부적으로 pdf.js를 사용하며 워커 경로가 필요)
    // 실제로 Node.js에서는 워커를 사용하지 않지만, 경로 설정은 필요함
    if (PDFParseClass && PDFParseClass.setWorker && typeof PDFParseClass.setWorker === 'function') {
      try {
        // data URI를 사용하여 더미 워커 경로 설정 (Node.js에서는 실제로 워커를 로드하지 않음)
        PDFParseClass.setWorker('data:application/javascript,');

        // 추가로 pdf.js의 GlobalWorkerOptions를 직접 설정 (Next.js 환경에서 필요할 수 있음)
        try {
          // @ts-ignore - 동적 require
          const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
          if (pdfjs && pdfjs.GlobalWorkerOptions) {
            pdfjs.GlobalWorkerOptions.workerSrc = 'data:application/javascript,';
          }
        } catch (pdfjsError) {
          // pdf.js 직접 로드 실패는 무시 (setWorker로 충분할 수 있음)
        }
      } catch (workerError) {
        // 워커 설정 실패는 무시 (Node.js 환경에서는 워커가 필수가 아님)
        console.warn('PDF 워커 설정 경고 (무시됨):', workerError);
      }
    }
  } catch (e) {
    console.error('패키지 로드 실패:', e);
  }
}

export interface ParsedDocument {
  text: string;
  metadata?: {
    pageCount?: number;
    sheetNames?: string[];
    imageText?: string; // OCR 결과
  };
}

/**
 * PDF 파일 파싱
 */
export async function parsePDF(fileBuffer: Buffer): Promise<ParsedDocument> {
  if (!PDFParseClass) {
    throw new Error('pdf-parse 패키지가 설치되지 않았습니다. npm install pdf-parse를 실행해주세요.');
  }

  // Node.js 환경에서 워커 설정 확인 및 설정 (매번 확인하여 안전하게 처리)
  if (typeof window === 'undefined' && PDFParseClass && PDFParseClass.isNodeJS) {
    try {
      // pdf.js 모듈을 먼저 로드하고 globalThis에 설정
      try {
        // @ts-ignore - 동적 require
        const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');

        // globalThis.pdfjs 설정 (pdf-parse가 이를 사용함)
        if (typeof globalThis !== 'undefined') {
          (globalThis as any).pdfjs = pdfjs;
        }

        // GlobalWorkerOptions.workerSrc 설정
        if (pdfjs && pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = 'data:application/javascript,';
        }
      } catch (pdfjsError) {
        // pdf.js 로드 실패 시 경고만 출력
        console.warn('pdf.js 직접 로드 실패 (setWorker 사용):', pdfjsError);
      }

      // pdf-parse의 setWorker 메서드도 호출 (이중 보안)
      if (PDFParseClass.setWorker && typeof PDFParseClass.setWorker === 'function') {
        PDFParseClass.setWorker('data:application/javascript,');
      }
    } catch (workerError) {
      // 워커 설정 실패는 로그만 남기고 계속 진행
      console.warn('PDF 워커 설정 경고 (계속 진행):', workerError);
    }
  }

  try {
    // PDFParse 인스턴스 생성 및 텍스트 추출
    const parser = new PDFParseClass({ data: fileBuffer });
    const result = await parser.getText();

    // 파서 정리
    await parser.destroy();

    return {
      text: result.text || '',
      metadata: {
        pageCount: result.total || 0,
      },
    };
  } catch (error) {
    console.error('PDF 파싱 오류:', error);
    throw new Error(`PDF 파싱에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * Excel 파일 파싱 (.xlsx, .xls)
 */
export async function parseExcel(fileBuffer: Buffer): Promise<ParsedDocument> {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;

    // 모든 시트의 데이터를 텍스트로 변환
    const textParts: string[] = [];

    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', header: 1 }) as any[][];

      // 시트 이름 추가
      textParts.push(`=== 시트: ${sheetName} ===\n`);

      // 헤더가 있다면 포함
      if (jsonData.length > 0) {
        const header = jsonData[0];
        if (Array.isArray(header)) {
          textParts.push(header.join('\t') + '\n');
        }

        // 데이터 행 추가
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (Array.isArray(row)) {
            textParts.push(row.map(cell => String(cell || '')).join('\t') + '\n');
          }
        }
      }

      textParts.push('\n');
    }

    return {
      text: textParts.join(''),
      metadata: {
        sheetNames,
      },
    };
  } catch (error) {
    console.error('Excel 파싱 오류:', error);
    throw new Error(`Excel 파싱에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * Word 파일 파싱 (.docx, .doc)
 */
export async function parseWord(fileBuffer: Buffer): Promise<ParsedDocument> {
  if (!mammoth) {
    throw new Error('mammoth 패키지가 설치되지 않았습니다. npm install mammoth를 실행해주세요.');
  }

  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });

    return {
      text: result.value,
    };
  } catch (error) {
    console.error('Word 파싱 오류:', error);
    throw new Error(`Word 파싱에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * 이미지 파일 OCR (OpenAI Vision API 사용)
 */
export async function parseImage(fileBuffer: Buffer, mimeType?: string): Promise<ParsedDocument> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다. 이미지 OCR을 사용하려면 OPENAI_API_KEY 환경 변수가 필요합니다.');
    }

    // 이미지를 base64로 인코딩
    const base64Image = fileBuffer.toString('base64');
    const imageMimeType = mimeType || 'image/png';

    // OpenAI Vision API 호출
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Vision 지원 모델
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '이 이미지에서 텍스트를 모두 추출해주세요. 견적서나 배송 관련 문서인 경우 주소, 시간, 금액 등의 정보도 함께 추출해주세요.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${imageMimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API 오류: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content || '';

    return {
      text: extractedText,
      metadata: {
        imageText: extractedText,
      },
    };
  } catch (error) {
    console.error('이미지 OCR 오류:', error);
    throw new Error(`이미지 OCR에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * 파일 타입에 따라 적절한 파서 선택 및 실행
 */
export async function parseDocument(
  fileBuffer: Buffer,
  fileType: DocumentFileType,
  mimeType?: string
): Promise<ParsedDocument> {
  switch (fileType) {
    case 'pdf':
      return parsePDF(fileBuffer);
    case 'excel':
      return parseExcel(fileBuffer);
    case 'word':
      return parseWord(fileBuffer);
    case 'image':
      return parseImage(fileBuffer, mimeType);
    default:
      throw new Error(`지원되지 않는 파일 타입: ${fileType}`);
  }
}

