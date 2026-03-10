import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SESSION_ID', message: 'session id가 필요합니다.' } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_messages')
      .select('id, session_id, role, content, metadata, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'QUERY_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '메시지 조회 실패',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SESSION_ID', message: 'session id가 필요합니다.' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const role = String(body?.role || '').trim();
    const content = String(body?.content || '').trim();
    const metadata = typeof body?.metadata === 'object' && body?.metadata ? body.metadata : {};

    if (!['user', 'assistant', 'system'].includes(role)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_ROLE', message: 'role은 user/assistant/system 중 하나여야 합니다.' } },
        { status: 400 }
      );
    }
    if (!content) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CONTENT', message: 'content가 필요합니다.' } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_messages')
      .insert([
        {
          session_id: id,
          role,
          content,
          metadata,
        },
      ])
      .select('id, session_id, role, content, metadata, created_at')
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'INSERT_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '메시지 저장 실패',
        },
      },
      { status: 500 }
    );
  }
}

