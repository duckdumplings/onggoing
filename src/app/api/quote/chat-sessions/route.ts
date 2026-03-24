import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { resolveUserIdFromRequest, unauthorizedResponse } from '@/app/api/quote/_auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 30), 1), 100);

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_sessions')
      .select('id, title, last_summary, created_at, updated_at')
      .eq('created_by', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUERY_FAILED',
            message: error.message,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '대화방 목록 조회 실패',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const title = String(body?.title || '새 견적 대화').trim().slice(0, 120) || '새 견적 대화';

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_sessions')
      .insert([
        {
          title,
          created_by: userId,
        },
      ])
      .select('id, title, last_summary, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INSERT_FAILED',
            message: error.message,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '대화방 생성 실패',
        },
      },
      { status: 500 }
    );
  }
}

