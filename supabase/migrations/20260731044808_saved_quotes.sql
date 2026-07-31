-- 대화 세션과 분리된 팀 공용 견적 기록.
-- 저장 당시 계산 결과를 그대로 복원하며 상태·버전 관리는 두지 않는다.

CREATE TABLE IF NOT EXISTS public.saved_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    customer_name TEXT,
    quote_book JSONB NOT NULL,
    total_amount BIGINT NOT NULL,
    case_count INTEGER NOT NULL,
    vehicle_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    rate_effective_from DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT saved_quotes_title_length_check
        CHECK (char_length(title) BETWEEN 1 AND 120),
    CONSTRAINT saved_quotes_customer_name_length_check
        CHECK (customer_name IS NULL OR char_length(customer_name) <= 120),
    CONSTRAINT saved_quotes_quote_book_object_check
        CHECK (jsonb_typeof(quote_book) = 'object'),
    CONSTRAINT saved_quotes_total_amount_check
        CHECK (total_amount >= 0),
    CONSTRAINT saved_quotes_case_count_check
        CHECK (case_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_saved_quotes_created_at
    ON public.saved_quotes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_quotes_customer_name
    ON public.saved_quotes (customer_name)
    WHERE customer_name IS NOT NULL;

ALTER TABLE public.saved_quotes ENABLE ROW LEVEL SECURITY;

-- 앱 서버가 인증을 검증한 뒤 service role로만 접근한다.
REVOKE ALL ON TABLE public.saved_quotes FROM anon, authenticated;

COMMENT ON TABLE public.saved_quotes IS
    '대화 세션과 독립된 팀 공용 견적 기록. quote_book은 저장 당시 CaseBoardResult 스냅샷.';
