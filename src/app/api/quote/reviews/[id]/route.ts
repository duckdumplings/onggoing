import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

// 특정 검토 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('quote_risk_reports')
      .select(`
        *,
        quote_validations!inner(
          *,
          quote_extractions!inner(
            *,
            quote_documents!inner(*)
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '검토 결과를 찾을 수 없습니다',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('검토 상세 조회 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '검토 상세 조회에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}

// 검토 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const { error } = await supabase
      .from('quote_risk_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('검토 삭제 실패:', error);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DELETE_ERROR',
            message: '검토 삭제에 실패했습니다',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '검토가 삭제되었습니다',
    });
  } catch (error) {
    console.error('검토 삭제 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '검토 삭제에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}



