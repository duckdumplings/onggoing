-- 포괄적 성능 최적화 마이그레이션
-- 생성일: 2025-01-27
-- 목적: 모든 Auth RLS Initialization Plan 경고 해결

-- 1. 모든 관리자 정책 최적화
-- vehicles 관리자 정책
DROP POLICY IF EXISTS "Admins can manage vehicles" ON public.vehicles;
CREATE POLICY "Admins can manage vehicles" ON public.vehicles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- destinations 관리자 정책
DROP POLICY IF EXISTS "Admins can manage destinations" ON public.destinations;
CREATE POLICY "Admins can manage destinations" ON public.destinations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quotes 관리자 정책
DROP POLICY IF EXISTS "Admins can manage quotes" ON public.quotes;
CREATE POLICY "Admins can manage quotes" ON public.quotes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_routes 관리자 정책
DROP POLICY IF EXISTS "Admins can manage quote routes" ON public.quote_routes;
CREATE POLICY "Admins can manage quote routes" ON public.quote_routes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_stops 관리자 정책
DROP POLICY IF EXISTS "Admins can manage quote stops" ON public.quote_stops;
CREATE POLICY "Admins can manage quote stops" ON public.quote_stops
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_tracking 관리자 정책
DROP POLICY IF EXISTS "Admins can manage quote tracking" ON public.quote_tracking;
CREATE POLICY "Admins can manage quote tracking" ON public.quote_tracking
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_details 관리자 정책
DROP POLICY IF EXISTS "Admins can manage quote details" ON public.quote_details;
CREATE POLICY "Admins can manage quote details" ON public.quote_details
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- 2. INSERT 정책 최적화
-- quotes 생성 정책
DROP POLICY IF EXISTS "Users can create quotes" ON public.quotes;
CREATE POLICY "Users can create quotes" ON public.quotes
    FOR INSERT WITH CHECK (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_routes 생성 정책
DROP POLICY IF EXISTS "Users can create quote routes" ON public.quote_routes;
CREATE POLICY "Users can create quote routes" ON public.quote_routes
    FOR INSERT WITH CHECK (
        created_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_stops 생성 정책
DROP POLICY IF EXISTS "Users can create quote stops" ON public.quote_stops;
CREATE POLICY "Users can create quote stops" ON public.quote_stops
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_details 생성 정책
DROP POLICY IF EXISTS "Users can create quote details" ON public.quote_details;
CREATE POLICY "Users can create quote details" ON public.quote_details
    FOR INSERT WITH CHECK (
        quote_id IN (
            SELECT id FROM public.quotes WHERE customer_id = (SELECT auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- 3. UPDATE 정책 최적화
-- quote_routes 수정 정책
DROP POLICY IF EXISTS "Users can update own quote routes" ON public.quote_routes;
CREATE POLICY "Users can update own quote routes" ON public.quote_routes
    FOR UPDATE USING (
        created_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_stops 수정 정책
DROP POLICY IF EXISTS "Users can update own quote stops" ON public.quote_stops;
CREATE POLICY "Users can update own quote stops" ON public.quote_stops
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_tracking 수정 정책
DROP POLICY IF EXISTS "Users can update own quote tracking" ON public.quote_tracking;
CREATE POLICY "Users can update own quote tracking" ON public.quote_tracking
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- 4. DELETE 정책 최적화
-- quotes 삭제 정책
DROP POLICY IF EXISTS "Users can delete own quotes" ON public.quotes;
CREATE POLICY "Users can delete own quotes" ON public.quotes
    FOR DELETE USING (
        customer_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- quote_routes 삭제 정책
DROP POLICY IF EXISTS "Users can delete own quote routes" ON public.quote_routes;
CREATE POLICY "Users can delete own quote routes" ON public.quote_routes
    FOR DELETE USING (
        created_by = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- 5. user_profiles 추가 정책 최적화
-- 사용자 프로필 생성 정책
DROP POLICY IF EXISTS "Users can create own profile" ON public.user_profiles;
CREATE POLICY "Users can create own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (id = (SELECT auth.uid()));

-- 사용자 프로필 삭제 정책
DROP POLICY IF EXISTS "Users can delete own profile" ON public.user_profiles;
CREATE POLICY "Users can delete own profile" ON public.user_profiles
    FOR DELETE USING (id = (SELECT auth.uid()));

-- 6. system_logs 추가 정책 최적화
-- 시스템 로그 생성 정책
DROP POLICY IF EXISTS "Users can create logs" ON public.system_logs;
CREATE POLICY "Users can create logs" ON public.system_logs
    FOR INSERT WITH CHECK (
        user_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- 시스템 로그 수정 정책
DROP POLICY IF EXISTS "Users can update logs" ON public.system_logs;
CREATE POLICY "Users can update logs" ON public.system_logs
    FOR UPDATE USING (
        user_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    );

-- 시스템 로그 삭제 정책
DROP POLICY IF EXISTS "Users can delete logs" ON public.system_logs;
CREATE POLICY "Users can delete logs" ON public.system_logs
    FOR DELETE USING (
        user_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'manager')
        )
    ); 