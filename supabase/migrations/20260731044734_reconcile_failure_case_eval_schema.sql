-- 운영 DB에는 이미 반영됐지만 migration history에서 누락된
-- 실패사례 평가 승격 컬럼을 멱등성 DDL로 다시 기록한다.
-- quote-documents 버킷의 공개 여부는 데이터 노출 정책이므로 이 보정에 포함하지 않는다.

ALTER TABLE public.quote_chat_failure_cases
    ADD COLUMN IF NOT EXISTS approved_for_eval BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.quote_chat_failure_cases
    ADD COLUMN IF NOT EXISTS eval_expectation JSONB;

CREATE INDEX IF NOT EXISTS idx_failure_cases_approved
    ON public.quote_chat_failure_cases(approved_for_eval)
    WHERE approved_for_eval = true;
