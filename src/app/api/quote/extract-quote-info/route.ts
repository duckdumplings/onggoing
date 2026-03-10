import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { extractQuoteInfo } from '@/domains/quote/services/quoteInfoExtractor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, text, preferLLM = true } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '추출할 텍스트가 필요합니다',
          },
        },
        { status: 400 }
      );
    }

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

    // 문서 존재 확인
    const supabase = createServerClient();
    const { data: document, error: docError } = await supabase
      .from('quote_documents')
      .select('id')
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

    // 정보 추출 실행
    const extractionResult = await extractQuoteInfo(text, preferLLM);

    // 추출 결과를 데이터베이스에 저장
    const { data: dbData, error: dbError } = await supabase
      .from('quote_extractions')
      .insert([
        {
          document_id: documentId,
          extracted_data: extractionResult.extractedData,
          confidence_score: extractionResult.confidenceScore,
          extraction_method: extractionResult.method,
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error('데이터베이스 저장 실패:', dbError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: `데이터베이스 저장에 실패했습니다: ${dbError.message}`,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: dbData.id,
        extracted_data: dbData.extracted_data,
        confidence_score: dbData.confidence_score,
        extraction_method: dbData.extraction_method,
      },
    });
  } catch (error) {
    console.error('정보 추출 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXTRACTION_ERROR',
          message: error instanceof Error ? error.message : '정보 추출에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}



