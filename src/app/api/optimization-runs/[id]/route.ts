import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

// 개별 최적화 실행 결과 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    if (!id) {
      return NextResponse.json(
        { error: '최적화 실행 ID가 필요합니다' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('optimization_runs')
      .select(`
        id,
        request_data,
        result_data,
        total_distance,
        total_time,
        vehicle_type,
        optimize_order,
        used_traffic,
        departure_at,
        engine_used,
        fallback_used,
        created_at,
        updated_at
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '최적화 실행 결과를 찾을 수 없습니다' },
          { status: 404 }
        );
      }

      console.error('최적화 실행 결과 조회 실패:', error);
      return NextResponse.json(
        { error: '데이터 조회에 실패했습니다' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('최적화 실행 결과 조회 API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// 개별 최적화 실행 결과 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    if (!id) {
      return NextResponse.json(
        { error: '최적화 실행 ID가 필요합니다' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('optimization_runs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('최적화 실행 결과 삭제 실패:', error);
      return NextResponse.json(
        { error: '데이터 삭제에 실패했습니다' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '최적화 실행 결과가 삭제되었습니다'
    });

  } catch (error) {
    console.error('최적화 실행 결과 삭제 API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
