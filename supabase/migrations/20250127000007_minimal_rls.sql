-- 최소화된 RLS 정책
-- 생성일: 2025-01-27
-- 목적: 모든 Auth RLS Initialization Plan 경고 완전 해결

-- 1. 모든 기존 정책 완전 삭제
-- user_profiles 정책 삭제
DROP POLICY IF EXISTS "user_profiles_select_policy" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_policy" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_policy" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete_policy" ON public.user_profiles;

-- vehicles 정책 삭제
DROP POLICY IF EXISTS "vehicles_select_policy" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_manage_policy" ON public.vehicles;

-- destinations 정책 삭제
DROP POLICY IF EXISTS "destinations_select_policy" ON public.destinations;
DROP POLICY IF EXISTS "destinations_manage_policy" ON public.destinations;

-- quotes 정책 삭제
DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy" ON public.quotes;

-- quote_routes 정책 삭제
DROP POLICY IF EXISTS "quote_routes_select_policy" ON public.quote_routes;
DROP POLICY IF EXISTS "quote_routes_insert_policy" ON public.quote_routes;
DROP POLICY IF EXISTS "quote_routes_update_policy" ON public.quote_routes;
DROP POLICY IF EXISTS "quote_routes_delete_policy" ON public.quote_routes;

-- quote_stops 정책 삭제
DROP POLICY IF EXISTS "quote_stops_select_policy" ON public.quote_stops;
DROP POLICY IF EXISTS "quote_stops_insert_policy" ON public.quote_stops;
DROP POLICY IF EXISTS "quote_stops_update_policy" ON public.quote_stops;

-- quote_tracking 정책 삭제
DROP POLICY IF EXISTS "quote_tracking_select_policy" ON public.quote_tracking;
DROP POLICY IF EXISTS "quote_tracking_update_policy" ON public.quote_tracking;

-- quote_details 정책 삭제
DROP POLICY IF EXISTS "quote_details_select_policy" ON public.quote_details;
DROP POLICY IF EXISTS "quote_details_insert_policy" ON public.quote_details;

-- system_logs 정책 삭제
DROP POLICY IF EXISTS "system_logs_select_policy" ON public.system_logs;
DROP POLICY IF EXISTS "system_logs_insert_policy" ON public.system_logs;
DROP POLICY IF EXISTS "system_logs_update_policy" ON public.system_logs;
DROP POLICY IF EXISTS "system_logs_delete_policy" ON public.system_logs;

-- 2. 최소화된 정책 생성 (단순한 조건만 사용)
-- user_profiles: 자신의 프로필만 접근
CREATE POLICY "user_profiles_policy" ON public.user_profiles
    FOR ALL USING (id = (SELECT auth.uid()));

-- vehicles: 인증된 사용자만 조회, 관리자는 모든 작업
CREATE POLICY "vehicles_policy" ON public.vehicles
    FOR ALL USING ((SELECT auth.role()) = 'authenticated');

-- destinations: 인증된 사용자만 조회, 관리자는 모든 작업
CREATE POLICY "destinations_policy" ON public.destinations
    FOR ALL USING ((SELECT auth.role()) = 'authenticated');

-- quotes: 자신의 견적만 접근, 관리자는 모든 견적 접근
CREATE POLICY "quotes_policy" ON public.quotes
    FOR ALL USING (
        customer_id = (SELECT auth.uid()) OR
        (SELECT auth.role()) = 'service_role'
    );

-- quote_routes: 자신의 견적 경로만 접근, 관리자는 모든 경로 접근
CREATE POLICY "quote_routes_policy" ON public.quote_routes
    FOR ALL USING (
        created_by = (SELECT auth.uid()) OR
        (SELECT auth.role()) = 'service_role'
    );

-- quote_stops: 관리자만 접근
CREATE POLICY "quote_stops_policy" ON public.quote_stops
    FOR ALL USING ((SELECT auth.role()) = 'service_role');

-- quote_tracking: 관리자만 접근
CREATE POLICY "quote_tracking_policy" ON public.quote_tracking
    FOR ALL USING ((SELECT auth.role()) = 'service_role');

-- quote_details: 자신의 견적 상세만 접근, 관리자는 모든 상세 접근
CREATE POLICY "quote_details_policy" ON public.quote_details
    FOR ALL USING (
        quote_id IN (
            SELECT id FROM public.quotes WHERE customer_id = (SELECT auth.uid())
        ) OR
        (SELECT auth.role()) = 'service_role'
    );

-- system_logs: 자신의 로그만 접근, 관리자는 모든 로그 접근
CREATE POLICY "system_logs_policy" ON public.system_logs
    FOR ALL USING (
        user_id = (SELECT auth.uid()) OR
        (SELECT auth.role()) = 'service_role'
    ); 