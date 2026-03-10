-- 견적안 정보 추출 결과 저장 테이블 생성
-- 생성일: 2025-12-22
-- 목적: LLM 또는 휴리스틱 방법으로 추출한 견적안 정보 저장

-- 1. 견적안 정보 추출 테이블 생성
CREATE TABLE IF NOT EXISTS public.quote_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 문서 참조
    document_id UUID NOT NULL REFERENCES public.quote_documents(id) ON DELETE CASCADE,
    
    -- 추출된 데이터 (JSONB)
    extracted_data JSONB NOT NULL,
    
    -- 추출 품질 정보
    confidence_score DECIMAL(3,2), -- 0.00 ~ 1.00
    extraction_method TEXT NOT NULL CHECK (extraction_method IN ('llm', 'heuristic')),
    
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_quote_extractions_document_id ON public.quote_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_quote_extractions_created_at ON public.quote_extractions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_extractions_method ON public.quote_extractions(extraction_method);
CREATE INDEX IF NOT EXISTS idx_quote_extractions_confidence ON public.quote_extractions(confidence_score DESC);

-- 3. RLS 정책 (MVP 단계에서는 비활성화)
ALTER TABLE public.quote_extractions DISABLE ROW LEVEL SECURITY;



