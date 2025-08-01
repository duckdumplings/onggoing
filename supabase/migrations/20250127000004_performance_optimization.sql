-- 성능 최적화 마이그레이션
-- 생성일: 2025-01-27
-- 목적: Auth RLS Initialization Plan 경고 해결

-- 1. vehicles 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Authenticated users can view vehicles" ON public.vehicles;
CREATE POLICY "Authenticated users can view vehicles" ON public.vehicles
    FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

-- 2. destinations 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Authenticated users can view destinations" ON public.destinations;
CREATE POLICY "Authenticated users can view destinations" ON public.destinations
    FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

-- 3. user_profiles 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles" ON public.user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role = 'admin'
        )
    );

-- 4. quotes 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Users can view own quotes" ON public.quotes;
CREATE POLICY "Users can view own quotes" ON public.quotes
    FOR SELECT USING (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Users can create quotes" ON public.quotes;
CREATE POLICY "Users can create quotes" ON public.quotes
    FOR INSERT WITH CHECK (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Users can update own quotes" ON public.quotes;
CREATE POLICY "Users can update own quotes" ON public.quotes
    FOR UPDATE USING (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- 5. quote_routes 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Users can view own quote routes" ON public.quote_routes;
CREATE POLICY "Users can view own quote routes" ON public.quote_routes
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

-- 6. quote_stops 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Users can view own quote stops" ON public.quote_stops;
CREATE POLICY "Users can view own quote stops" ON public.quote_stops
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

-- 7. quote_tracking 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Users can view own quote tracking" ON public.quote_tracking;
CREATE POLICY "Users can view own quote tracking" ON public.quote_tracking
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

-- 8. quote_details 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Users can view own quote details" ON public.quote_details;
CREATE POLICY "Users can view own quote details" ON public.quote_details
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM public.quotes WHERE customer_id = (SELECT auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- 9. system_logs 테이블 RLS 정책 최적화
DROP POLICY IF EXISTS "Users can view own logs" ON public.system_logs;
CREATE POLICY "Users can view own logs" ON public.system_logs
    FOR SELECT USING (
        user_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    ); 