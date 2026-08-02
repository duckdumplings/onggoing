-- 문서 기반 견적 워크플로는 사용자별 소유권이 아니라 팀 공용 데이터다.
-- 브라우저 직접 접근은 닫고, 인증을 검증한 Next.js API가 service role로만 읽고 쓴다.

UPDATE storage.buckets
SET public = false
WHERE id = 'quote-documents';

ALTER TABLE public.quote_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_risk_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.quote_documents FROM anon, authenticated;
REVOKE ALL ON TABLE public.quote_extractions FROM anon, authenticated;
REVOKE ALL ON TABLE public.quote_validations FROM anon, authenticated;
REVOKE ALL ON TABLE public.quote_risk_reports FROM anon, authenticated;

COMMENT ON TABLE public.quote_documents IS
  '팀 공용 견적 문서. 인증된 앱 서버 API를 통해서만 접근한다.';
COMMENT ON TABLE public.quote_extractions IS
  '팀 공용 문서 추출 결과. 인증된 앱 서버 API를 통해서만 접근한다.';
COMMENT ON TABLE public.quote_validations IS
  '팀 공용 경로 검증 결과. 인증된 앱 서버 API를 통해서만 접근한다.';
COMMENT ON TABLE public.quote_risk_reports IS
  '팀 공용 견적 검토 결과. 인증된 앱 서버 API를 통해서만 접근한다.';
