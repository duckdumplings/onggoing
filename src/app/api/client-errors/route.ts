import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

/**
 * 클라이언트 에러/액션 실패 수집 엔드포인트.
 *
 * 인증 없이 POST 허용(MVP 가정). 외부 끌개봇 차단을 위해 간단한 in-memory rate limit을 둔다.
 * 운영자가 Supabase 대시보드에서 `client_errors` 테이블을 직접 조회한다.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClientErrorPayload {
  error_type: 'js_error' | 'unhandled_rejection' | 'react_error_boundary' | 'action_failure';
  source?: string | null;
  action?: string | null;
  message: string;
  stack?: string | null;
  context?: unknown;
  url?: string | null;
  user_agent?: string | null;
  client_session_id?: string | null;
}

const VALID_ERROR_TYPES: ClientErrorPayload['error_type'][] = [
  'js_error',
  'unhandled_rejection',
  'react_error_boundary',
  'action_failure',
];

const MAX_MESSAGE_LEN = 4000;
const MAX_STACK_LEN = 8000;
const MAX_CONTEXT_BYTES = 16_000;

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_PER_KEY = 30;
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

function getRateLimitKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_PER_KEY;
}

function truncate(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  if (text.length <= max) return text;
  return text.slice(0, max) + `…(+${text.length - max})`;
}

function safeContext(value: unknown): unknown {
  if (value == null) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_CONTEXT_BYTES) {
      return { truncated: true, preview: json.slice(0, MAX_CONTEXT_BYTES) };
    }
    return value;
  } catch {
    return { unserializable: true };
  }
}

export async function POST(request: NextRequest) {
  try {
    const key = getRateLimitKey(request);
    if (!checkRateLimit(key)) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429 }
      );
    }

    const payload = (await request.json().catch(() => null)) as ClientErrorPayload | null;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { success: false, error: 'invalid_payload' },
        { status: 400 }
      );
    }

    if (!VALID_ERROR_TYPES.includes(payload.error_type)) {
      return NextResponse.json(
        { success: false, error: 'invalid_error_type' },
        { status: 400 }
      );
    }
    if (!payload.message || typeof payload.message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'invalid_message' },
        { status: 400 }
      );
    }

    const row = {
      error_type: payload.error_type,
      source: typeof payload.source === 'string' ? payload.source : null,
      action: typeof payload.action === 'string' ? payload.action : null,
      message: truncate(payload.message, MAX_MESSAGE_LEN) ?? '',
      stack: truncate(typeof payload.stack === 'string' ? payload.stack : null, MAX_STACK_LEN),
      context: safeContext(payload.context),
      url: typeof payload.url === 'string' ? payload.url.slice(0, 2000) : null,
      user_agent: typeof payload.user_agent === 'string' ? payload.user_agent.slice(0, 500) : null,
      client_session_id: typeof payload.client_session_id === 'string' ? payload.client_session_id.slice(0, 100) : null,
    };

    const supabase = createServerClient();
    const { error } = await supabase.from('client_errors').insert([row]);

    if (error) {
      // 에러 수집기 자체가 또 다른 에러로 시끄러워지는 것을 막기 위해 200 success:false로 반환
      console.warn('[client-errors] insert failed:', error.code, error.message);
      return NextResponse.json(
        { success: false, error: 'insert_failed' },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    console.warn('[client-errors] handler error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { success: false, error: 'handler_error' },
      { status: 200 }
    );
  }
}
