-- Row Level Security (RLS) 정책
-- 생성일: 2025-01-27

-- RLS 활성화
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- 사용자 프로필 정책
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 차량 정책
CREATE POLICY "Authenticated users can view vehicles" ON public.vehicles
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage vehicles" ON public.vehicles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 기사 정책
CREATE POLICY "Authenticated users can view drivers" ON public.drivers
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Drivers can view own profile" ON public.drivers
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can manage drivers" ON public.drivers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 배송지 정책
CREATE POLICY "Authenticated users can view destinations" ON public.destinations
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage destinations" ON public.destinations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 배차 경로 정책
CREATE POLICY "Authenticated users can view routes" ON public.dispatch_routes
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Drivers can view assigned routes" ON public.dispatch_routes
    FOR SELECT USING (
        driver_id IN (
            SELECT id FROM public.drivers WHERE user_id = auth.uid()
        ) OR
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can manage routes" ON public.dispatch_routes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 경유지 정책
CREATE POLICY "Authenticated users can view route stops" ON public.route_stops
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage route stops" ON public.route_stops
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 견적 정책
CREATE POLICY "Users can view own quotes" ON public.quotes
    FOR SELECT USING (
        customer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Users can create quotes" ON public.quotes
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own quotes" ON public.quotes
    FOR UPDATE USING (customer_id = auth.uid());

CREATE POLICY "Admins can manage all quotes" ON public.quotes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 견적 상세 정책
CREATE POLICY "Users can view own quote details" ON public.quote_details
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM public.quotes WHERE customer_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can manage quote details" ON public.quote_details
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 배송 추적 정책
CREATE POLICY "Authenticated users can view tracking" ON public.delivery_tracking
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Drivers can update own tracking" ON public.delivery_tracking
    FOR UPDATE USING (
        driver_id IN (
            SELECT id FROM public.drivers WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage tracking" ON public.delivery_tracking
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 시스템 로그 정책 (읽기 전용)
CREATE POLICY "Admins can view system logs" ON public.system_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 함수: 사용자 역할 확인
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT role 
        FROM public.user_profiles 
        WHERE id = user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 함수: 사용자 권한 확인
CREATE OR REPLACE FUNCTION public.has_permission(required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        EXISTS (
            SELECT 1 
            FROM public.user_profiles 
            WHERE id = auth.uid() AND role = required_role
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 