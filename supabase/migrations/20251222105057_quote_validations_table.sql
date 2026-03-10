-- 견적안 경로 검증 결과 저장 테이블 생성
-- 생성일: 2025-12-22
-- 목적: Tmap API를 통한 경로 검증 결과 및 리스크 점수 저장

-- 1. 견적안 경로 검증 테이블 생성
CREATE TABLE IF NOT EXISTS public.quote_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 추출 결과 참조
    extraction_id UUID NOT NULL REFERENCES public.quote_extractions(id) ON DELETE CASCADE,
    
    -- 검증 결과 (JSONB)
    validation_results JSONB NOT NULL,
    
    -- 리스크 정보
    risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100), -- 0-100
    
    -- 경로 정보
    total_distance DECIMAL(10,2), -- meters
    total_time INTEGER, -- seconds (이동 시간만)
    total_dwell_time INTEGER, -- seconds (체류 시간)
    total_time_with_dwell INTEGER, -- seconds (총 시간)
    
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_quote_validations_extraction_id ON public.quote_validations(extraction_id);
CREATE INDEX IF NOT EXISTS idx_quote_validations_created_at ON public.quote_validations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_validations_risk_score ON public.quote_validations(risk_score DESC);

-- 3. RLS 정책 (MVP 단계에서는 비활성화)
ALTER TABLE public.quote_validations DISABLE ROW LEVEL SECURITY;



