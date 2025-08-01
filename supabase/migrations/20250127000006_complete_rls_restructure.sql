-- 완전한 RLS 정책 재구성
-- 생성일: 2025-01-27
-- 목적: 모든 Auth RLS Initialization Plan 경고 완전 해결

-- 1. 모든 기존 RLS 정책 완전 삭제
-- user_profiles 정책 삭제
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can create own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.user_profiles;

-- vehicles 정책 삭제
DROP POLICY IF EXISTS "Authenticated users can view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can manage vehicles" ON public.vehicles;

-- destinations 정책 삭제
DROP POLICY IF EXISTS "Authenticated users can view destinations" ON public.destinations;
DROP POLICY IF EXISTS "Admins can manage destinations" ON public.destinations;

-- quotes 정책 삭제
DROP POLICY IF EXISTS "Users can view own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can create quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can update own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can delete own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Admins can manage quotes" ON public.quotes;

-- quote_routes 정책 삭제
DROP POLICY IF EXISTS "Users can view own quote routes" ON public.quote_routes;
DROP POLICY IF EXISTS "Users can create quote routes" ON public.quote_routes;
DROP POLICY IF EXISTS "Users can update own quote routes" ON public.quote_routes;
DROP POLICY IF EXISTS "Users can delete own quote routes" ON public.quote_routes;
DROP POLICY IF EXISTS "Admins can manage quote routes" ON public.quote_routes;

-- quote_stops 정책 삭제
DROP POLICY IF EXISTS "Users can view own quote stops" ON public.quote_stops;
DROP POLICY IF EXISTS "Users can create quote stops" ON public.quote_stops;
DROP POLICY IF EXISTS "Users can update own quote stops" ON public.quote_stops;
DROP POLICY IF EXISTS "Admins can manage quote stops" ON public.quote_stops;

-- quote_tracking 정책 삭제
DROP POLICY IF EXISTS "Users can view own quote tracking" ON public.quote_tracking;
DROP POLICY IF EXISTS "Users can update own quote tracking" ON public.quote_tracking;
DROP POLICY IF EXISTS "Admins can manage quote tracking" ON public.quote_tracking;

-- quote_details 정책 삭제
DROP POLICY IF EXISTS "Users can view own quote details" ON public.quote_details;
DROP POLICY IF EXISTS "Users can create quote details" ON public.quote_details;
DROP POLICY IF EXISTS "Admins can manage quote details" ON public.quote_details;

-- system_logs 정책 삭제
DROP POLICY IF EXISTS "Users can view own logs" ON public.system_logs;
DROP POLICY IF EXISTS "Users can create logs" ON public.system_logs;
DROP POLICY IF EXISTS "Users can update logs" ON public.system_logs;
DROP POLICY IF EXISTS "Users can delete logs" ON public.system_logs;

-- 2. 최적화된 정책 재생성 (서브쿼리 사용)
-- user_profiles 정책
CREATE POLICY "user_profiles_select_policy" ON public.user_profiles
    FOR SELECT USING (
        id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
    );

CREATE POLICY "user_profiles_insert_policy" ON public.user_profiles
    FOR INSERT WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "user_profiles_update_policy" ON public.user_profiles
    FOR UPDATE USING (id = (SELECT auth.uid()));

CREATE POLICY "user_profiles_delete_policy" ON public.user_profiles
    FOR DELETE USING (id = (SELECT auth.uid()));

-- vehicles 정책
CREATE POLICY "vehicles_select_policy" ON public.vehicles
    FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "vehicles_manage_policy" ON public.vehicles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- destinations 정책
CREATE POLICY "destinations_select_policy" ON public.destinations
    FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "destinations_manage_policy" ON public.destinations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quotes 정책
CREATE POLICY "quotes_select_policy" ON public.quotes
    FOR SELECT USING (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quotes_insert_policy" ON public.quotes
    FOR INSERT WITH CHECK (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quotes_update_policy" ON public.quotes
    FOR UPDATE USING (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quotes_delete_policy" ON public.quotes
    FOR DELETE USING (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_routes 정책
CREATE POLICY "quote_routes_select_policy" ON public.quote_routes
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM public.quotes WHERE customer_id = (SELECT auth.uid())
        ) OR
        created_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quote_routes_insert_policy" ON public.quote_routes
    FOR INSERT WITH CHECK (
        created_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quote_routes_update_policy" ON public.quote_routes
    FOR UPDATE USING (
        created_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quote_routes_delete_policy" ON public.quote_routes
    FOR DELETE USING (
        created_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_stops 정책
CREATE POLICY "quote_stops_select_policy" ON public.quote_stops
    FOR SELECT USING (
        quote_route_id IN (
            SELECT id FROM public.quote_routes 
            WHERE quote_id IN (
                SELECT id FROM public.quotes WHERE customer_id = (SELECT auth.uid())
            )
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quote_stops_insert_policy" ON public.quote_stops
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quote_stops_update_policy" ON public.quote_stops
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_tracking 정책
CREATE POLICY "quote_tracking_select_policy" ON public.quote_tracking
    FOR SELECT USING (
        quote_route_id IN (
            SELECT id FROM public.quote_routes 
            WHERE quote_id IN (
                SELECT id FROM public.quotes WHERE customer_id = (SELECT auth.uid())
            )
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quote_tracking_update_policy" ON public.quote_tracking
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_details 정책
CREATE POLICY "quote_details_select_policy" ON public.quote_details
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM public.quotes WHERE customer_id = (SELECT auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "quote_details_insert_policy" ON public.quote_details
    FOR INSERT WITH CHECK (
        quote_id IN (
            SELECT id FROM public.quotes WHERE customer_id = (SELECT auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- system_logs 정책
CREATE POLICY "system_logs_select_policy" ON public.system_logs
    FOR SELECT USING (
        user_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "system_logs_insert_policy" ON public.system_logs
    FOR INSERT WITH CHECK (
        user_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "system_logs_update_policy" ON public.system_logs
    FOR UPDATE USING (
        user_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "system_logs_delete_policy" ON public.system_logs
    FOR DELETE USING (
        user_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    ); 