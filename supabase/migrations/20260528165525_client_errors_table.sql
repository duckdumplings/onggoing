-- 클라이언트 측 에러 및 액션 실패 수집 테이블
-- 생성일: 2026-05-29
-- 목적: 사용자 수가 적어 운영자가 직접 발견하기 어려운 UI 오류/액션 실패를
--       Supabase에 누적하여 대시보드에서 직접 조회할 수 있게 한다.
--       (외부 SaaS 의존 없이 자체 호스팅 형태)

CREATE TABLE IF NOT EXISTS public.client_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 발생 시점 (서버 수신 시각)
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 에러 분류
    -- 'js_error'              : window.onerror 글로벌 핸들러
    -- 'unhandled_rejection'   : window.onunhandledrejection
    -- 'react_error_boundary'  : React ErrorBoundary
    -- 'action_failure'        : 명시적으로 보고된 액션 실패 (경로 계산, POI 검색 등)
    error_type TEXT NOT NULL CHECK (error_type IN (
        'js_error',
        'unhandled_rejection',
        'react_error_boundary',
        'action_failure'
    )),

    -- 발생 위치/맥락
    source TEXT,           -- ex) 'route_optimization', 'poi_search', 'quote_calculation'
    action TEXT,           -- action_failure의 경우 구체적 액션명 (ex: 'optimize_single_route')

    -- 본문
    message TEXT NOT NULL,
    stack TEXT,
    context JSONB,         -- 추가 디버깅 정보 (요청 payload, 응답 status 등)

    -- 환경
    url TEXT,
    user_agent TEXT,
    client_session_id TEXT,  -- 클라이언트가 탭별로 생성한 임시 ID

    -- 메타
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_occurred_at ON public.client_errors (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_error_type ON public.client_errors (error_type);
CREATE INDEX IF NOT EXISTS idx_client_errors_source ON public.client_errors (source);
CREATE INDEX IF NOT EXISTS idx_client_errors_session ON public.client_errors (client_session_id);

-- MVP: RLS 비활성화 (다른 테이블과 동일한 정책. 운영 시 admin 전용으로 강화 예정)
ALTER TABLE public.client_errors DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.client_errors IS '클라이언트 JS 에러 및 액션 실패 수집. 사용자 수가 적어 운영자가 인지 못하는 사일런트 오류를 누적 관찰하는 용도.';
COMMENT ON COLUMN public.client_errors.error_type IS 'js_error / unhandled_rejection / react_error_boundary / action_failure';
COMMENT ON COLUMN public.client_errors.source IS '발생 도메인 (route_optimization, poi_search, quote_calculation 등)';
COMMENT ON COLUMN public.client_errors.action IS 'action_failure 시 구체적 액션명';
COMMENT ON COLUMN public.client_errors.context IS '디버깅용 추가 컨텍스트 (요청 payload, 응답 status 등)';
COMMENT ON COLUMN public.client_errors.client_session_id IS '클라이언트가 탭별로 생성하는 임시 세션 ID';
