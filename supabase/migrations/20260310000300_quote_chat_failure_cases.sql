-- AI 챗 실패 케이스 수집 테이블

CREATE TABLE IF NOT EXISTS public.quote_chat_failure_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.quote_chat_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.quote_chat_messages(id) ON DELETE SET NULL,
    user_input TEXT NOT NULL,
    assistant_output TEXT,
    error_code TEXT NOT NULL,
    reason TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_chat_failure_cases_session_created
    ON public.quote_chat_failure_cases(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_chat_failure_cases_error_code
    ON public.quote_chat_failure_cases(error_code, created_at DESC);

ALTER TABLE public.quote_chat_failure_cases DISABLE ROW LEVEL SECURITY;

