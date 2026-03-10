-- 견적안 문서 저장을 위한 Storage 버킷 생성

-- Storage 버킷 생성 (이미 존재하면 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-documents',
  'quote-documents',
  false, -- 비공개 버킷
  52428800, -- 50MB (50 * 1024 * 1024 bytes)
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', -- .xlsx
    'application/vnd.ms-excel', -- .xls
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
    'application/msword', -- .doc
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage 버킷 정책 설정 (선택사항 - RLS가 활성화된 경우)
-- 현재 RLS가 비활성화되어 있으므로 정책 설정은 선택사항입니다
-- 필요시 Supabase Dashboard에서 수동으로 정책을 추가할 수 있습니다

-- 참고: RLS가 활성화된 경우 다음 정책을 추가할 수 있습니다:
-- CREATE POLICY "Users can upload quote documents"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'quote-documents');
--
-- CREATE POLICY "Users can read quote documents"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (bucket_id = 'quote-documents');

