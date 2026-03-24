import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

function inferFeedbackTags(params: {
  feedbackType: 'positive' | 'negative';
  userInput: string;
  assistantOutput: string;
}): string[] {
  const tags = new Set<string>();
  if (params.feedbackType === 'positive') {
    tags.add('feedback-positive');
    return [...tags];
  }
  tags.add('feedback-negative');
  const text = `${params.userInput}\n${params.assistantOutput}`;
  if (/상차|배송|반납|출발|도착|선행상차/.test(text) && /중복|순서|불일치|오인|틀렸/.test(text)) {
    tags.add('role-misclassification');
  }
  if (/주소|좌표|지오코딩|못 찾|강 위|한강/.test(text)) {
    tags.add('address-contamination');
  }
  if (/경유\s*\d|숫자|표기|순서/.test(text)) {
    tags.add('route-ordering');
  }
  if (/느리|응답|반응|피드백/.test(text)) {
    tags.add('ux-response');
  }
  return [...tags];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const feedbackType = body?.feedbackType === 'positive' ? 'positive' : 'negative';

    const userInput = String(body?.userInput || '').trim();
    const assistantOutput = String(body?.assistantOutput || '').trim();
    const reason = body?.reason ? String(body.reason).trim().slice(0, 500) : null;
    const sessionId = body?.sessionId ? String(body.sessionId) : null;
    const rawMessageId = body?.messageId ? String(body.messageId) : (body?.metadata?.messageId ? String(body.metadata.messageId) : null);
    const messageId =
      rawMessageId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawMessageId)
        ? rawMessageId
        : null;
    const tags = Array.isArray(body?.tags) ? body.tags.map((tag: unknown) => String(tag)) : [];
    const inferredTags = inferFeedbackTags({
      feedbackType,
      userInput,
      assistantOutput,
    });
    const mergedTags = Array.from(new Set([...tags, ...inferredTags]));

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
          error_code: feedbackType === 'positive' ? 'USER_FEEDBACK_POSITIVE' : 'USER_FEEDBACK_NEGATIVE',
          reason,
          tags: mergedTags,
          metadata: {
            source: 'ui-feedback',
            feedback_type: feedbackType,
            raw_message_id: rawMessageId,
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

