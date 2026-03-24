-- Quote chat RLS hardening
-- NOTE: API currently uses service-role client for server operations.
-- These policies protect direct DB access paths and future anon/auth flows.

ALTER TABLE public.quote_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_chat_session_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_chat_attachment_parses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_generated_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_chat_failure_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_chat_sessions_select_own ON public.quote_chat_sessions;
CREATE POLICY quote_chat_sessions_select_own
ON public.quote_chat_sessions
FOR SELECT
USING (created_by = auth.uid());

DROP POLICY IF EXISTS quote_chat_sessions_insert_own ON public.quote_chat_sessions;
CREATE POLICY quote_chat_sessions_insert_own
ON public.quote_chat_sessions
FOR INSERT
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS quote_chat_sessions_update_own ON public.quote_chat_sessions;
CREATE POLICY quote_chat_sessions_update_own
ON public.quote_chat_sessions
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS quote_chat_sessions_delete_own ON public.quote_chat_sessions;
CREATE POLICY quote_chat_sessions_delete_own
ON public.quote_chat_sessions
FOR DELETE
USING (created_by = auth.uid());

DROP POLICY IF EXISTS quote_chat_messages_select_own ON public.quote_chat_messages;
CREATE POLICY quote_chat_messages_select_own
ON public.quote_chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_chat_messages.session_id
      AND s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS quote_chat_messages_insert_own ON public.quote_chat_messages;
CREATE POLICY quote_chat_messages_insert_own
ON public.quote_chat_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_chat_messages.session_id
      AND s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS quote_chat_session_contexts_all_own ON public.quote_chat_session_contexts;
CREATE POLICY quote_chat_session_contexts_all_own
ON public.quote_chat_session_contexts
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_chat_session_contexts.session_id
      AND s.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_chat_session_contexts.session_id
      AND s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS quote_chat_attachments_all_own ON public.quote_chat_attachments;
CREATE POLICY quote_chat_attachments_all_own
ON public.quote_chat_attachments
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_chat_attachments.session_id
      AND s.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_chat_attachments.session_id
      AND s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS quote_chat_attachment_parses_all_own ON public.quote_chat_attachment_parses;
CREATE POLICY quote_chat_attachment_parses_all_own
ON public.quote_chat_attachment_parses
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_attachments a
    JOIN public.quote_chat_sessions s ON s.id = a.session_id
    WHERE a.id = quote_chat_attachment_parses.attachment_id
      AND s.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_attachments a
    JOIN public.quote_chat_sessions s ON s.id = a.session_id
    WHERE a.id = quote_chat_attachment_parses.attachment_id
      AND s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS quote_generated_files_all_own ON public.quote_generated_files;
CREATE POLICY quote_generated_files_all_own
ON public.quote_generated_files
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_generated_files.session_id
      AND s.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_generated_files.session_id
      AND s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS quote_chat_failure_cases_select_own ON public.quote_chat_failure_cases;
CREATE POLICY quote_chat_failure_cases_select_own
ON public.quote_chat_failure_cases
FOR SELECT
USING (
  session_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_chat_failure_cases.session_id
      AND s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS quote_chat_failure_cases_insert_own ON public.quote_chat_failure_cases;
CREATE POLICY quote_chat_failure_cases_insert_own
ON public.quote_chat_failure_cases
FOR INSERT
WITH CHECK (
  session_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.quote_chat_sessions s
    WHERE s.id = quote_chat_failure_cases.session_id
      AND s.created_by = auth.uid()
  )
);

