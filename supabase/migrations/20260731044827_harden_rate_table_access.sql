-- 1차 RLS 강화: 공개 읽기가 필요한 운임표는 읽기만 허용하고
-- 브라우저 역할의 직접 수정 권한을 제거한다.

ALTER TABLE public.rate_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_tables_public_read ON public.rate_tables;

REVOKE ALL ON TABLE public.rate_tables FROM anon, authenticated;
GRANT SELECT ON TABLE public.rate_tables TO anon, authenticated;

CREATE POLICY rate_tables_public_read
    ON public.rate_tables
    FOR SELECT
    TO anon, authenticated
    USING (true);

ALTER FUNCTION public.set_rate_tables_updated_at()
    SET search_path = public, pg_temp;
