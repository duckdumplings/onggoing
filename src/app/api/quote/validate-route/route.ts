import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { validateRoute } from '@/domains/quote/services/routeValidator';
import { ExtractedQuoteInfo } from '@/domains/quote/types/quoteExtraction';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { extractionId, extractedData } = body;

    if (!extractionId || typeof extractionId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '추출 ID가 필요합니다',
          },
        },
        { status: 400 }
      );
    }

    if (!extractedData) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '추출된 데이터가 필요합니다',
          },
        },
        { status: 400 }
      );
    }

    const quoteInfo = extractedData as ExtractedQuoteInfo;

    // Tmap API 키 확인
    const tmapKey = process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY || '';
    if (!tmapKey) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'Tmap API 키가 설정되지 않았습니다',
          },
        },
        { status: 500 }
      );
    }

    // 추출 결과 존재 확인
    const supabase = createServerClient();
    const { data: extraction, error: extError } = await supabase
      .from('quote_extractions')
      .select('id, extracted_data')
      .eq('id', extractionId)
      .single();

    if (extError || !extraction) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXTRACTION_NOT_FOUND',
            message: '추출 결과를 찾을 수 없습니다',
          },
        },
        { status: 404 }
      );
    }

    // 필수 데이터 검증
    if (!quoteInfo.origin?.address && (!quoteInfo.destinations || quoteInfo.destinations.length === 0)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_DATA',
            message: '출발지 또는 목적지 정보가 없습니다',
          },
        },
        { status: 400 }
      );
    }

    // 출발지가 없으면 첫 번째 목적지를 출발지로 사용
    const origin = quoteInfo.origin || {
      address: quoteInfo.destinations?.[0]?.address || '',
    };

    // 목적지가 없으면 빈 배열
    const destinations = quoteInfo.destinations || [];

    // 출발 시간 설정
    let departureTime: Date | undefined;
    if (quoteInfo.departureTime) {
      const [hours, minutes] = quoteInfo.departureTime.split(':').map(Number);
      departureTime = new Date();
      departureTime.setHours(hours, minutes, 0, 0);
      
      // 과거 시간이면 다음 날로 설정
      if (departureTime < new Date()) {
        departureTime.setDate(departureTime.getDate() + 1);
      }
    }

    // 차량 타입
    const vehicleType = quoteInfo.vehicleType || '레이';

    // 경로 검증 실행
    const validationResult = await validateRoute(
      {
        address: origin.address,
        latitude: origin.latitude,
        longitude: origin.longitude,
      },
      destinations.map(dest => ({
        address: dest.address,
        latitude: dest.latitude,
        longitude: dest.longitude,
        deliveryTime: dest.deliveryTime,
        dwellMinutes: dest.dwellMinutes,
      })),
      tmapKey,
      vehicleType,
      departureTime
    );

    // 검증 결과를 데이터베이스에 저장
    const { data: dbData, error: dbError } = await supabase
      .from('quote_validations')
      .insert([
        {
          extraction_id: extractionId,
          validation_results: {
            segments: validationResult.segments,
            risks: validationResult.risks,
          },
          risk_score: validationResult.riskScore,
          total_distance: validationResult.totalDistance / 1000, // meters to km
          total_time: validationResult.totalTime,
          total_dwell_time: validationResult.totalDwellTime,
          total_time_with_dwell: validationResult.totalTimeWithDwell,
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
        validation_results: {
          segments: validationResult.segments,
          risks: validationResult.risks,
        },
        risk_score: validationResult.riskScore,
        total_distance: validationResult.totalDistance,
        total_time: validationResult.totalTime,
        total_dwell_time: validationResult.totalDwellTime,
        total_time_with_dwell: validationResult.totalTimeWithDwell,
      },
    });
  } catch (error) {
    console.error('경로 검증 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : '경로 검증에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}

