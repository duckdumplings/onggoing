/**
 * 클라이언트 측 에러/액션 실패 리포팅 헬퍼.
 *
 * 외부 SaaS(Sentry 등) 의존 없이 자체 `/api/client-errors` 엔드포인트로 송신한다.
 * - JS 글로벌 에러는 `installGlobalErrorReporting`이 자동 수집
 * - React ErrorBoundary는 `reportClientError({ type: 'react_error_boundary', ... })`
 * - 명시적 액션 실패는 `reportActionFailure({ source, action, error, context })`
 */

export type ClientErrorType =
  | 'js_error'
  | 'unhandled_rejection'
  | 'react_error_boundary'
  | 'action_failure';

export interface ReportClientErrorInput {
  type: ClientErrorType;
  source?: string;
  action?: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown> | null;
}

const SESSION_STORAGE_KEY = 'ai-onggoing.clientSessionId';
const REPORT_PATH = '/api/client-errors';

/**
 * 탭별로 유지되는 임시 세션 ID. 동일 탭에서 발생한 에러들을 묶어서 보기 위함.
 * sessionStorage가 없는 환경(SSR, 시크릿 모드 일부)에서는 메모리에만 유지.
 */
let memorySessionId: string | null = null;

export function getClientSessionId(): string {
  if (typeof window === 'undefined') {
    if (!memorySessionId) memorySessionId = generateSessionId();
    return memorySessionId;
  }
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = generateSessionId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    if (!memorySessionId) memorySessionId = generateSessionId();
    return memorySessionId;
  }
}

function generateSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `cs_${Date.now().toString(36)}_${rand}`;
}

/**
 * 에러를 서버로 송신. 실패해도 사용자 UX에 영향을 주지 않도록 항상 silent.
 */
export async function reportClientError(input: ReportClientErrorInput): Promise<void> {
  if (typeof window === 'undefined') return;

  const payload = {
    error_type: input.type,
    source: input.source ?? null,
    action: input.action ?? null,
    message: truncate(input.message, 4000),
    stack: input.stack ? truncate(input.stack, 8000) : null,
    context: input.context ?? null,
    url: window.location?.href ?? null,
    user_agent: navigator?.userAgent ?? null,
    client_session_id: getClientSessionId(),
  };

  try {
    // sendBeacon은 페이지 unload 중에도 전송 가능. 단, 일부 환경에서 비활성.
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(REPORT_PATH, blob);
      if (ok) return;
    }
    await fetch(REPORT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // 보고 자체 실패는 무시 (사용자 UX 영향 X)
  }
}

/**
 * 명시적 액션 실패 보고용. catch 블록에서 호출.
 */
export function reportActionFailure(args: {
  source: string;
  action: string;
  error: unknown;
  context?: Record<string, unknown> | null;
}): void {
  const { source, action, error, context } = args;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  void reportClientError({
    type: 'action_failure',
    source,
    action,
    message: message || `${action} failed`,
    stack,
    context: context ?? null,
  });
}

let globalHandlersInstalled = false;

/**
 * window.onerror / unhandledrejection 글로벌 핸들러를 1회 등록.
 * 클라이언트 루트에서 useEffect로 호출.
 */
export function installGlobalErrorReporting(): void {
  if (typeof window === 'undefined') return;
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    const err = event?.error;
    void reportClientError({
      type: 'js_error',
      source: 'window.onerror',
      message: err instanceof Error ? err.message : (event?.message || 'Unknown error'),
      stack: err instanceof Error ? err.stack : undefined,
      context: {
        filename: event?.filename ?? null,
        lineno: event?.lineno ?? null,
        colno: event?.colno ?? null,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection');
    const stack = reason instanceof Error ? reason.stack : undefined;
    void reportClientError({
      type: 'unhandled_rejection',
      source: 'window.onunhandledrejection',
      message,
      stack,
      context: null,
    });
  });
}

function truncate(text: string, max: number): string {
  if (!text) return text;
  if (text.length <= max) return text;
  return text.slice(0, max) + `…(+${text.length - max})`;
}
