-- 보안 경고 해결 마이그레이션
-- 생성일: 2025-01-27
-- 목적: Function Search Path Mutable 경고 해결

-- 1. get_user_role 함수 보안 강화
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT role 
        FROM public.user_profiles 
        WHERE id = user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. has_permission 함수 보안 강화
CREATE OR REPLACE FUNCTION public.has_permission(required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT role = required_role OR role = 'admin'
        FROM public.user_profiles 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. update_updated_at_column 함수는 이미 SECURITY DEFINER로 설정되어 있으므로
-- search_path만 추가로 설정
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER SET search_path = '';

-- 4. RLS 정책 최적화 (불필요한 auth 호출 제거)
-- user_profiles 정책 최적화
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

-- vehicles 정책 최적화
DROP POLICY IF EXISTS "Admins can manage vehicles" ON public.vehicles;
CREATE POLICY "Admins can manage vehicles" ON public.vehicles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- destinations 정책 최적화
DROP POLICY IF EXISTS "Users can view destinations" ON public.destinations;
CREATE POLICY "Users can view destinations" ON public.destinations
    FOR SELECT USING (true);

-- quote_routes 정책 최적화
DROP POLICY IF EXISTS "Users can view own quote routes" ON public.quote_routes;
CREATE POLICY "Users can view own quote routes" ON public.quote_routes
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM public.quotes WHERE customer_id = auth.uid()
        ) OR
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- quote_stops 정책 최적화
DROP POLICY IF EXISTS "Users can view own quote stops" ON public.quote_stops;
CREATE POLICY "Users can view own quote stops" ON public.quote_stops
    FOR SELECT USING (
        quote_route_id IN (
            SELECT id FROM public.quote_routes 
            WHERE quote_id IN (
                SELECT id FROM public.quotes WHERE customer_id = auth.uid()
            )
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    ); 