-- quote-documents 버킷을 공개로 전환
-- 코드 전반(generated-files / attachments / document-upload)이 getPublicUrl 기반 공개 URL을
-- file_url로 저장해 사용한다. 버킷이 비공개(public=false)이면 공개 엔드포인트가
-- {"statusCode":"404","error":"Bucket not found"}를 반환해 견적 파일 다운로드가 실패한다.
-- MVP 단계(RLS 비활성화)에서 공개 URL 전제와 정합을 맞추기 위해 공개로 전환한다.

UPDATE storage.buckets
SET public = true
WHERE id = 'quote-documents';
