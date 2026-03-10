-- 견적안 문서 저장 테이블 생성
-- 생성일: 2025-12-22
-- 목적: 화주사가 제공한 견적안 문서를 저장하고 관리

-- 1. 견적안 문서 테이블 생성
CREATE TABLE IF NOT EXISTS public.quote_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 파일 정보
    file_url TEXT NOT NULL, -- Supabase Storage URL
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'excel', 'word', 'image')),
    file_size INTEGER NOT NULL, -- bytes
    mime_type TEXT, -- MIME 타입 (예: application/pdf)
    
    -- 사용자 정보
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_quote_documents_uploaded_by ON public.quote_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_quote_documents_created_at ON public.quote_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_documents_file_type ON public.quote_documents(file_type);

-- 3. 업데이트 트리거 생성
DROP TRIGGER IF EXISTS update_quote_documents_updated_at ON public.quote_documents;
CREATE TRIGGER update_quote_documents_updated_at 
    BEFORE UPDATE ON public.quote_documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS 정책 (MVP 단계에서는 비활성화)
ALTER TABLE public.quote_documents DISABLE ROW LEVEL SECURITY;



