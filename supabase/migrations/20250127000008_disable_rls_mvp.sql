-- MVP 단계 RLS 비활성화
-- 생성일: 2025-01-27
-- 목적: MVP 단계에서 RLS를 비활성화하여 성능 최적화

-- 1. 모든 RLS 정책 삭제
-- user_profiles 정책 삭제
DROP POLICY IF EXISTS "user_profiles_policy" ON public.user_profiles;

-- vehicles 정책 삭제
DROP POLICY IF EXISTS "vehicles_policy" ON public.vehicles;

-- destinations 정책 삭제
DROP POLICY IF EXISTS "destinations_policy" ON public.destinations;

-- quotes 정책 삭제
DROP POLICY IF EXISTS "quotes_policy" ON public.quotes;

-- quote_routes 정책 삭제
DROP POLICY IF EXISTS "quote_routes_policy" ON public.quote_routes;

-- quote_stops 정책 삭제
DROP POLICY IF EXISTS "quote_stops_policy" ON public.quote_stops;

-- quote_tracking 정책 삭제
DROP POLICY IF EXISTS "quote_tracking_policy" ON public.quote_tracking;

-- quote_details 정책 삭제
DROP POLICY IF EXISTS "quote_details_policy" ON public.quote_details;

-- system_logs 정책 삭제
DROP POLICY IF EXISTS "system_logs_policy" ON public.system_logs;

-- 2. RLS 비활성화 (MVP 단계에서는 애플리케이션 레벨에서 권한 관리)
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_routes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_stops DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_tracking DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_details DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs DISABLE ROW LEVEL SECURITY;

-- 3. 대신 애플리케이션 레벨에서 권한을 관리하기 위한 함수 생성
CREATE OR REPLACE FUNCTION public.check_user_permission(user_id UUID, required_role TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    -- 기본적으로 인증된 사용자만 허용
    IF (SELECT auth.role()) != 'authenticated' THEN
        RETURN FALSE;
    END IF;
    
    -- 특정 역할이 요구되는 경우
    IF required_role IS NOT NULL THEN
        RETURN (
            SELECT role = required_role OR role = 'admin'
            FROM public.user_profiles 
            WHERE id = user_id
        );
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. 사용자 권한 확인 함수
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT role 
        FROM public.user_profiles 
        WHERE id = (SELECT auth.uid())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. 관리자 권한 확인 함수
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT role IN ('admin', 'manager')
        FROM public.user_profiles 
        WHERE id = (SELECT auth.uid())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''; 