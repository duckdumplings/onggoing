import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isHelpful = Boolean(body?.isHelpful);
    if (isHelpful) {
      return NextResponse.json({ success: true, data: { skipped: true } });
    }

    const userInput = String(body?.userInput || '').trim();
    const assistantOutput = String(body?.assistantOutput || '').trim();
    const reason = body?.reason ? String(body.reason).trim().slice(0, 500) : null;
    const sessionId = body?.sessionId ? String(body.sessionId) : null;
    const rawMessageId = body?.messageId ? String(body.messageId) : null;
    const messageId =
      rawMessageId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawMessageId)
        ? rawMessageId
        : null;
    const tags = Array.isArray(body?.tags) ? body.tags.map((tag: unknown) => String(tag)) : [];

    if (!userInput) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'userInput이 필요합니다.' } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_failure_cases')
      .insert([
        {
          session_id: sessionId,
          message_id: messageId,
          user_input: userInput,
          assistant_output: assistantOutput || null,
          error_code: 'USER_FEEDBACK_NEGATIVE',
          reason,
          tags,
          metadata: {
            source: 'ui-feedback',
          },
        },
      ])
      .select('id')
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'INSERT_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '피드백 저장 실패',
        },
      },
      { status: 500 }
    );
  }
}

