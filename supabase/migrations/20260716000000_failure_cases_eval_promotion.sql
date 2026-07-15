-- 부정 피드백 케이스 → eval 골든셋 승격(사람 승인) 지원 컬럼

ALTER TABLE public.quote_chat_failure_cases
    ADD COLUMN IF NOT EXISTS approved_for_eval BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.quote_chat_failure_cases
    ADD COLUMN IF NOT EXISTS eval_expectation JSONB;

CREATE INDEX IF NOT EXISTS idx_failure_cases_approved
    ON public.quote_chat_failure_cases(approved_for_eval)
    WHERE approved_for_eval = true;
