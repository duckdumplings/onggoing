import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { parseDocument } from '@/domains/quote/services/documentParser';
import { DocumentFileType } from '@/domains/quote/types/quoteDocument';

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'quote-documents';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId } = body;

    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '문서 ID가 필요합니다',
          },
        },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // 문서 메타데이터 조회
    const { data: document, error: docError } = await supabase
      .from('quote_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: '문서를 찾을 수 없습니다',
          },
        },
        { status: 404 }
      );
    }

    // Supabase Storage에서 파일 다운로드
    // file_url에서 경로 추출 (URL에서 버킷명 이후 부분)
    const urlObj = new URL(document.file_url);
    const pathParts = urlObj.pathname.split('/');
    const bucketIndex = pathParts.findIndex(part => part === STORAGE_BUCKET);
    
    if (bucketIndex === -1 || bucketIndex === pathParts.length - 1) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_FILE_URL',
            message: '파일 URL이 유효하지 않습니다',
          },
        },
        { status: 400 }
      );
    }

    const filePath = pathParts.slice(bucketIndex + 1).join('/');

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('파일 다운로드 실패:', downloadError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DOWNLOAD_FAILED',
            message: `파일 다운로드에 실패했습니다: ${downloadError?.message || '알 수 없는 오류'}`,
          },
        },
        { status: 500 }
      );
    }

    // 파일을 Buffer로 변환
    const arrayBuffer = await fileData.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 문서 파싱
    const parsedResult = await parseDocument(
      fileBuffer,
      document.file_type as DocumentFileType,
      document.mime_type || undefined
    );

    return NextResponse.json({
      success: true,
      data: {
        documentId: document.id,
        text: parsedResult.text,
        metadata: parsedResult.metadata,
      },
    });
  } catch (error) {
    console.error('문서 파싱 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PARSING_ERROR',
          message: error instanceof Error ? error.message : '문서 파싱에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}



