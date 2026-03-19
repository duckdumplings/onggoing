-- AI 챗 파일 워크플로우 확장 스키마
-- 생성일: 2026-03-10

CREATE TABLE IF NOT EXISTS public.quote_chat_session_contexts (
    session_id UUID PRIMARY KEY REFERENCES public.quote_chat_sessions(id) ON DELETE CASCADE,
    slot_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quote_chat_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.quote_chat_sessions(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.quote_documents(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'excel', 'word', 'image', 'text', 'json', 'other')),
    file_size BIGINT NOT NULL DEFAULT 0,
    mime_type TEXT,
    parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending', 'parsed', 'failed')),
    parse_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quote_chat_attachment_parses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id UUID NOT NULL REFERENCES public.quote_chat_attachments(id) ON DELETE CASCADE,
    parsed_text TEXT NOT NULL DEFAULT '',
    summary TEXT,
    structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quote_generated_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.quote_chat_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.quote_chat_messages(id) ON DELETE SET NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'xlsx', 'md', 'txt', 'docx', 'json')),
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_chat_attachments_session_created
    ON public.quote_chat_attachments(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_chat_attachments_document_id
    ON public.quote_chat_attachments(document_id);
CREATE INDEX IF NOT EXISTS idx_quote_chat_attachment_parses_attachment_id
    ON public.quote_chat_attachment_parses(attachment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_generated_files_session_created
    ON public.quote_generated_files(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_generated_files_message_id
    ON public.quote_generated_files(message_id);

-- session updated_at 동기화
CREATE OR REPLACE FUNCTION public.touch_quote_chat_session_updated_at_by_session_id()
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

DROP TRIGGER IF EXISTS trg_touch_quote_chat_session_on_attachment ON public.quote_chat_attachments;
CREATE TRIGGER trg_touch_quote_chat_session_on_attachment
    AFTER INSERT ON public.quote_chat_attachments
    FOR EACH ROW EXECUTE FUNCTION public.touch_quote_chat_session_updated_at_by_session_id();

DROP TRIGGER IF EXISTS trg_touch_quote_chat_session_on_generated_file ON public.quote_generated_files;
CREATE TRIGGER trg_touch_quote_chat_session_on_generated_file
    AFTER INSERT ON public.quote_generated_files
    FOR EACH ROW EXECUTE FUNCTION public.touch_quote_chat_session_updated_at_by_session_id();

DROP TRIGGER IF EXISTS trg_update_quote_chat_session_contexts_updated_at ON public.quote_chat_session_contexts;
CREATE TRIGGER trg_update_quote_chat_session_contexts_updated_at
    BEFORE UPDATE ON public.quote_chat_session_contexts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.quote_chat_session_contexts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_chat_attachments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_chat_attachment_parses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_generated_files DISABLE ROW LEVEL SECURITY;
