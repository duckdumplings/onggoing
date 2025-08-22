import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/libs/supabase/server';

// 최적화 실행 결과 저장
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    const {
      requestData,    // 원본 요청 데이터
      resultData,     // 최적화 결과 데이터
      userId          // 사용자 ID (선택사항)
    } = body;

    // 입력 검증
    if (!requestData || !resultData) {
      return NextResponse.json(
        { error: '요청 데이터와 결과 데이터가 필요합니다' },
        { status: 400 }
      );
    }

    // 메타데이터 추출
    const totalDistance = resultData.summary?.totalDistance || 0;
    const totalTime = resultData.summary?.totalTime || 0;
    const vehicleType = resultData.summary?.vehicleTypeCode === '1' ? '레이' : '스타렉스';
    const optimizeOrder = requestData.optimizeOrder || false;
    const usedTraffic = resultData.summary?.usedTraffic || true;
    const departureAt = requestData.departureAt ? new Date(requestData.departureAt) : null;
    
    // 엔진 정보 (현재는 Tmap만 사용)
    const engineUsed = 'tmap';
    const fallbackUsed = false;

    // 데이터베이스에 저장
    const { data, error } = await supabase
      .from('optimization_runs')
      .insert([{
        request_data: requestData,
        result_data: resultData,
        total_distance: totalDistance,
        total_time: totalTime,
        vehicle_type: vehicleType,
        optimize_order: optimizeOrder,
        used_traffic: usedTraffic,
        departure_at: departureAt,
        engine_used: engineUsed,
        fallback_used: fallbackUsed,
        created_by: userId || null
      }])
      .select()
      .single();

    if (error) {
      console.error('최적화 실행 결과 저장 실패:', error);
      return NextResponse.json(
        { error: '데이터 저장에 실패했습니다' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        message: '최적화 실행 결과가 저장되었습니다'
      }
    });

  } catch (error) {
    console.error('최적화 실행 결과 저장 API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// 최적화 실행 결과 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    // 쿼리 파라미터
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const vehicleType = searchParams.get('vehicleType');
    const optimizeOrder = searchParams.get('optimizeOrder');
    const daysBack = parseInt(searchParams.get('daysBack') || '30');

    // 기본 쿼리
    let query = supabase
      .from('optimization_runs')
      .select(`
        id,
        total_distance,
        total_time,
        vehicle_type,
        optimize_order,
        used_traffic,
        departure_at,
        engine_used,
        fallback_used,
        created_at,
        request_data,
        result_data
      `)
      .gte('created_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 필터 적용
    if (vehicleType) {
      query = query.eq('vehicle_type', vehicleType);
    }
    
    if (optimizeOrder !== null) {
      query = query.eq('optimize_order', optimizeOrder === 'true');
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('최적화 실행 결과 조회 실패:', error);
      return NextResponse.json(
        { error: '데이터 조회에 실패했습니다' },
        { status: 500 }
      );
    }

    // 통계 정보 조회
    const { data: statsData } = await supabase
      .rpc('get_optimization_stats', { days_back: daysBack });

    return NextResponse.json({
      success: true,
      data: {
        runs: data || [],
        pagination: {
          limit,
          offset,
          total: count || 0
        },
        stats: statsData?.[0] || null
      }
    });

  } catch (error) {
    console.error('최적화 실행 결과 조회 API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
