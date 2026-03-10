-- AI 견적 챗 대화방/메시지 저장 테이블
-- 생성일: 2026-03-10

CREATE TABLE IF NOT EXISTS public.quote_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT '새 견적 대화',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quote_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.quote_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_chat_sessions_created_at
    ON public.quote_chat_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_chat_sessions_updated_at
    ON public.quote_chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_chat_messages_session_id_created_at
    ON public.quote_chat_messages(session_id, created_at ASC);

-- 공용 updated_at 트리거 함수가 이미 존재한다고 가정
DROP TRIGGER IF EXISTS update_quote_chat_sessions_updated_at ON public.quote_chat_sessions;
CREATE TRIGGER update_quote_chat_sessions_updated_at
    BEFORE UPDATE ON public.quote_chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.touch_quote_chat_session_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.quote_chat_sessions
    SET updated_at = NOW()
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_quote_chat_session_updated_at ON public.quote_chat_messages;
CREATE TRIGGER trg_touch_quote_chat_session_updated_at
    AFTER INSERT ON public.quote_chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.touch_quote_chat_session_updated_at();

-- MVP 정책: 기존 quote 관련 테이블과 동일하게 RLS 비활성
ALTER TABLE public.quote_chat_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_chat_messages DISABLE ROW LEVEL SECURITY;

