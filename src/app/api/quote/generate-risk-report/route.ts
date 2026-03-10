import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { generateRiskReport } from '@/domains/quote/services/riskReportGenerator';
import { ExtractedQuoteInfo } from '@/domains/quote/types/quoteExtraction';
import { RouteValidationResult } from '@/domains/quote/services/routeValidator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { validationId, extractedData, validationResults } = body;

    if (!validationId || typeof validationId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '검증 ID가 필요합니다',
          },
        },
        { status: 400 }
      );
    }

    if (!extractedData || !validationResults) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '추출된 데이터와 검증 결과가 필요합니다',
          },
        },
        { status: 400 }
      );
    }

    // 검증 결과 존재 확인
    const supabase = createServerClient();
    const { data: validation, error: valError } = await supabase
      .from('quote_validations')
      .select('*')
      .eq('id', validationId)
      .single();

    if (valError || !validation) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_NOT_FOUND',
            message: '검증 결과를 찾을 수 없습니다',
          },
        },
        { status: 404 }
      );
    }

    // 리포트 생성
    const quoteInfo = extractedData as ExtractedQuoteInfo;
    const validationResult = {
      segments: validationResults.segments || [],
      risks: validationResults.risks || [],
      totalDistance: validation.total_distance ? validation.total_distance * 1000 : 0,
      totalTime: validation.total_time || 0,
      totalDwellTime: validation.total_dwell_time || 0,
      totalTimeWithDwell: validation.total_time_with_dwell || 0,
      riskScore: validation.risk_score || 0,
    } as RouteValidationResult;

    const reportResult = await generateRiskReport(quoteInfo, validationResult);

    // 리포트를 데이터베이스에 저장
    const { data: dbData, error: dbError } = await supabase
      .from('quote_risk_reports')
      .insert([
        {
          validation_id: validationId,
          report_content: reportResult.reportContent,
          risk_summary: reportResult.riskSummary,
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
        report_content: dbData.report_content,
        risk_summary: dbData.risk_summary,
        generated_at: dbData.generated_at,
      },
    });
  } catch (error) {
    console.error('리스크 리포트 생성 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'REPORT_GENERATION_ERROR',
          message: error instanceof Error ? error.message : '리스크 리포트 생성에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}



