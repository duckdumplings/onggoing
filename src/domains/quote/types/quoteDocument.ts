// 견적안 문서 관련 타입 정의

export type DocumentFileType = 'pdf' | 'excel' | 'word' | 'image';

export interface QuoteDocument {
  id: string;
  file_url: string;
  file_name: string;
  file_type: DocumentFileType;
  file_size: number;
  mime_type?: string | null;
  uploaded_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteDocumentInsert {
  file_url: string;
  file_name: string;
  file_type: DocumentFileType;
  file_size: number;
  mime_type?: string | null;
  uploaded_by?: string | null;
}

export interface QuoteDocumentUploadResult {
  success: boolean;
  data?: {
    id: string;
    file_url: string;
    file_name: string;
    file_type: DocumentFileType;
    file_size: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

// 파일 타입 감지 헬퍼
export function detectFileType(fileName: string, mimeType?: string): DocumentFileType | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  if (mimeType) {
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('sheet')) return 'excel';
    if (mimeType.includes('word') || mimeType.includes('document') || mimeType.includes('msword')) return 'word';
    if (mimeType.startsWith('image/')) return 'image';
  }
  
  if (ext === 'pdf') return 'pdf';
  if (['xlsx', 'xls'].includes(ext || '')) return 'excel';
  if (['docx', 'doc'].includes(ext || '')) return 'word';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return 'image';
  
  return null;
}

// 허용된 MIME 타입 목록
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB



