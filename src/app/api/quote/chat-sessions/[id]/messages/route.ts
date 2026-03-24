import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { resolveUserIdFromRequest, unauthorizedResponse } from '@/app/api/quote/_auth';

type Params = { params: Promise<{ id: string }> };

async function ensureOwnedSession(sessionId: string, userId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('quote_chat_sessions')
    .select('id, created_by')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500 as const, message: error.message };
  if (!data) return { ok: false as const, status: 404 as const, message: '대화방을 찾을 수 없습니다.' };
  if (String(data.created_by || '') !== userId) {
    return { ok: false as const, status: 403 as const, message: '대화방 접근 권한이 없습니다.' };
  }
  return { ok: true as const };
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await resolveUserIdFromRequest(_request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SESSION_ID', message: 'session id가 필요합니다.' } },
        { status: 400 }
      );
    }

    const ownership = await ensureOwnedSession(id, userId);
    if (!ownership.ok) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: ownership.message } },
        { status: ownership.status }
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
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SESSION_ID', message: 'session id가 필요합니다.' } },
        { status: 400 }
      );
    }

    const ownership = await ensureOwnedSession(id, userId);
    if (!ownership.ok) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: ownership.message } },
        { status: ownership.status }
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

