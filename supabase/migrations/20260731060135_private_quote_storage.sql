-- 견적 첨부·발행 파일을 공개 URL 대신 객체 경로 + 만료형 서명 URL로 제공한다.
ALTER TABLE public.quote_documents
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE public.quote_chat_attachments
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- 과거 공개 URL을 보존한 채 객체 키만 별도 열에 역채움한다.
UPDATE public.quote_documents
SET storage_path = split_part(
  file_url,
  '/storage/v1/object/public/quote-documents/',
  2
)
WHERE storage_path IS NULL
  AND file_url LIKE '%/storage/v1/object/public/quote-documents/%';

UPDATE public.quote_chat_attachments
SET storage_path = split_part(
  file_url,
  '/storage/v1/object/public/quote-documents/',
  2
)
WHERE storage_path IS NULL
  AND file_url LIKE '%/storage/v1/object/public/quote-documents/%';

UPDATE storage.buckets
SET public = false
WHERE id = 'quote-documents';

COMMENT ON COLUMN public.quote_documents.storage_path IS
  'Private quote-documents bucket object key. Download URLs are generated as expiring signed URLs.';

COMMENT ON COLUMN public.quote_chat_attachments.storage_path IS
  'Private quote-documents bucket object key. Download URLs are generated as expiring signed URLs.';
