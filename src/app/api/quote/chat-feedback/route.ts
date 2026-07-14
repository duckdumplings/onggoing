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
    // sendBeacon은 text/plain(Content-Type)으로 보내므로 request.json()이 실패할 수 있다.
    // 실패 시 request.text() 후 JSON.parse로 폴백한다.
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      try {
        const raw = await request.text();
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
      }
    }
    const feedbackType = body?.feedbackType === 'positive' ? 'positive' : 'negative';

    const userInput = String(body?.userInput || '').trim();
    const assistantOutput = String(body?.assistantOutput || '').trim();
    const reason = body?.reason ? String(body.reason).trim().slice(0, 500) : null;
    const sessionId = body?.sessionId ? String(body.sessionId) : null;
    const anonId = body?.anonId ? String(body.anonId).slice(0, 100) : null;
    const extraMetadata =
      body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    const quoteSnapshot = extraMetadata?.quote ? String(extraMetadata.quote).slice(0, 200) : null;
    const structuredKeys = Array.isArray(extraMetadata?.structuredKeys)
      ? (extraMetadata.structuredKeys as unknown[]).map((k) => String(k)).slice(0, 30)
      : null;
    const evidenceSourceCount =
      typeof extraMetadata?.evidenceSourceCount === 'number' ? extraMetadata.evidenceSourceCount : null;
    const sourceUserText = extraMetadata?.sourceUserText ? String(extraMetadata.sourceUserText).slice(0, 4000) : null;
    const rawMessageId = body?.messageId
      ? String(body.messageId)
      : extraMetadata?.messageIdRaw
        ? String(extraMetadata.messageIdRaw)
        : extraMetadata?.messageId
          ? String(extraMetadata.messageId)
          : null;
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

    // 결과 카드만 있는 피드백을 막지 않도록 완화 — 견적 결과(assistantOutput) 또는 견적 스냅샷이 있으면 통과.
    if (!userInput && !assistantOutput && !quoteSnapshot) {
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
          // user_input은 NOT NULL 컬럼 — 완화 경로에서도 채워지도록 방어적 폴백.
          user_input: userInput || sourceUserText || quoteSnapshot || 'unknown',
          assistant_output: assistantOutput || null,
          error_code: feedbackType === 'positive' ? 'USER_FEEDBACK_POSITIVE' : 'USER_FEEDBACK_NEGATIVE',
          reason,
          tags: mergedTags,
          metadata: {
            source: 'ui-feedback',
            feedback_type: feedbackType,
            raw_message_id: rawMessageId,
            anon_id: anonId,
            ...(quoteSnapshot ? { quote: quoteSnapshot } : {}),
            ...(structuredKeys ? { structured_keys: structuredKeys } : {}),
            ...(evidenceSourceCount != null ? { evidence_source_count: evidenceSourceCount } : {}),
            ...(sourceUserText ? { source_user_text: sourceUserText } : {}),
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

