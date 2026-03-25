-- public 스키마의 모든 테이블 데이터를 비웁니다. (운영 DB에서는 신중히 사용)
-- 사용: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/truncate-public-all.sql
DO $$
BEGIN
  EXECUTE (
    SELECT 'TRUNCATE TABLE ' ||
           string_agg(format('%I.%I', schemaname, tablename), ', ') ||
           ' RESTART IDENTITY CASCADE'
    FROM pg_tables
    WHERE schemaname = 'public'
  );
END;
$$;
