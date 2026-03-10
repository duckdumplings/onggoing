-- 견적안 리스크 리포트 저장 테이블 생성
-- 생성일: 2025-12-22
-- 목적: LLM으로 생성한 리스크 리포트 내용 저장

-- 1. 견적안 리스크 리포트 테이블 생성
CREATE TABLE IF NOT EXISTS public.quote_risk_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 검증 결과 참조
    validation_id UUID NOT NULL REFERENCES public.quote_validations(id) ON DELETE CASCADE,
    
    -- 리포트 내용
    report_content TEXT NOT NULL, -- 마크다운 형식
    
    -- 리스크 요약 (JSONB)
    risk_summary JSONB,
    
    -- 타임스탬프
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_quote_risk_reports_validation_id ON public.quote_risk_reports(validation_id);
CREATE INDEX IF NOT EXISTS idx_quote_risk_reports_generated_at ON public.quote_risk_reports(generated_at DESC);

-- 3. RLS 정책 (MVP 단계에서는 비활성화)
ALTER TABLE public.quote_risk_reports DISABLE ROW LEVEL SECURITY;



