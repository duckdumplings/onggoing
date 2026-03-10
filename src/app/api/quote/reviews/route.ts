import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

// 검토 이력 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const daysBack = parseInt(searchParams.get('daysBack') || '30', 10);

    const supabase = createServerClient();

    // 최근 검토 이력 조회 (quote_risk_reports 기준)
    const { data, error } = await supabase
      .from('quote_risk_reports')
      .select(`
        id,
        validation_id,
        report_content,
        risk_summary,
        generated_at,
        quote_validations!inner(
          id,
          risk_score,
          total_distance,
          total_time,
          created_at,
          quote_extractions!inner(
            id,
            document_id,
            confidence_score,
            quote_documents!inner(
              id,
              file_name,
              file_type,
              created_at
            )
          )
        )
      `)
      .gte('generated_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('검토 이력 조회 실패:', error);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUERY_ERROR',
            message: '검토 이력 조회에 실패했습니다',
          },
        },
        { status: 500 }
      );
    }

    // 데이터 정리
    const reviews = (data || []).map((report: any) => ({
      id: report.id,
      documentId: report.quote_validations?.quote_extractions?.document_id,
      fileName: report.quote_validations?.quote_extractions?.quote_documents?.file_name,
      fileType: report.quote_validations?.quote_extractions?.quote_documents?.file_type,
      riskScore: report.quote_validations?.risk_score,
      totalDistance: report.quote_validations?.total_distance,
      totalTime: report.quote_validations?.total_time,
      confidenceScore: report.quote_validations?.quote_extractions?.confidence_score,
      generatedAt: report.generated_at,
      riskSummary: report.risk_summary,
    }));

    return NextResponse.json({
      success: true,
      data: {
        reviews,
        pagination: {
          limit,
          offset,
          total: reviews.length,
        },
      },
    });
  } catch (error) {
    console.error('검토 이력 조회 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '검토 이력 조회에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}

