-- MVP 스키마 수정 마이그레이션
-- 생성일: 2025-01-27
-- 목적: MVP 요구사항에 맞게 불필요한 필드 제거 및 테이블 정리

-- 1. 차량 정보 테이블에서 name 필드 제거
ALTER TABLE public.vehicles DROP COLUMN IF EXISTS name;

-- 2. 기사 정보 테이블 삭제 (MVP에서는 불필요)
DROP TABLE IF EXISTS public.drivers CASCADE;

-- 3. 배차 정보 테이블에서 driver_id 필드 제거
ALTER TABLE public.dispatch_routes DROP COLUMN IF EXISTS driver_id;

-- 4. 배송 추적 정보 테이블에서 driver_id 필드 제거
ALTER TABLE public.delivery_tracking DROP COLUMN IF EXISTS driver_id;

-- 5. 배차 정보 테이블을 견적 경로 테이블로 변경
ALTER TABLE public.dispatch_routes RENAME TO quote_routes;

-- 6. 견적 경로 테이블 구조 수정
ALTER TABLE public.quote_routes 
    ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS route_type TEXT CHECK (route_type IN ('single', 'multi')) DEFAULT 'single',
    DROP COLUMN IF EXISTS route_name;

-- 7. 경유지 테이블 이름 변경
ALTER TABLE public.route_stops RENAME TO quote_stops;

-- 8. 경유지 테이블에서 route_id를 quote_route_id로 변경
ALTER TABLE public.quote_stops 
    RENAME COLUMN route_id TO quote_route_id;

-- 9. 배송 추적 테이블 이름 변경
ALTER TABLE public.delivery_tracking RENAME TO quote_tracking;

-- 10. 배송 추적 테이블에서 route_id를 quote_route_id로 변경
ALTER TABLE public.quote_tracking 
    RENAME COLUMN route_id TO quote_route_id;

-- 11. 인덱스 업데이트
DROP INDEX IF EXISTS idx_dispatch_routes_driver_id;
DROP INDEX IF EXISTS idx_dispatch_routes_status;
DROP INDEX IF EXISTS idx_route_stops_route_id;
DROP INDEX IF EXISTS idx_delivery_tracking_route_id;

CREATE INDEX IF NOT EXISTS idx_quote_routes_quote_id ON public.quote_routes(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_routes_status ON public.quote_routes(status);
CREATE INDEX IF NOT EXISTS idx_quote_stops_quote_route_id ON public.quote_stops(quote_route_id);
CREATE INDEX IF NOT EXISTS idx_quote_tracking_quote_route_id ON public.quote_tracking(quote_route_id);

-- 12. RLS 정책 업데이트 (기사 관련 정책 제거)
-- 기사 테이블이 이미 삭제되었으므로 정책 삭제는 불필요
-- DROP POLICY IF EXISTS "Drivers can view own profile" ON public.drivers;
-- DROP POLICY IF EXISTS "Admins can manage drivers" ON public.drivers;
-- DROP POLICY IF EXISTS "Drivers can view assigned routes" ON public.dispatch_routes;
-- DROP POLICY IF EXISTS "Drivers can update own tracking" ON public.delivery_tracking;

-- 13. 견적 경로 정책 추가
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

CREATE POLICY "Admins can manage quote routes" ON public.quote_routes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 14. 견적 경유지 정책 추가
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

CREATE POLICY "Admins can manage quote stops" ON public.quote_stops
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 15. 견적 추적 정책 추가
CREATE POLICY "Users can view own quote tracking" ON public.quote_tracking
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

CREATE POLICY "Admins can manage quote tracking" ON public.quote_tracking
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- 16. 트리거 업데이트
-- 기사 테이블이 이미 삭제되었으므로 트리거 삭제는 불필요
-- DROP TRIGGER IF EXISTS update_drivers_updated_at ON public.drivers;
-- DROP TRIGGER IF EXISTS update_dispatch_routes_updated_at ON public.dispatch_routes;
-- DROP TRIGGER IF EXISTS update_route_stops_updated_at ON public.route_stops;
-- DROP TRIGGER IF EXISTS update_delivery_tracking_updated_at ON public.delivery_tracking;

CREATE TRIGGER update_quote_routes_updated_at BEFORE UPDATE ON public.quote_routes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quote_stops_updated_at BEFORE UPDATE ON public.quote_stops FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quote_tracking_updated_at BEFORE UPDATE ON public.quote_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 17. 함수 업데이트 (기사 관련 함수 제거)
DROP FUNCTION IF EXISTS public.get_driver_location(UUID);
DROP FUNCTION IF EXISTS public.update_driver_location(UUID, DECIMAL, DECIMAL);

-- 18. 뷰 생성 (견적 요약)
CREATE OR REPLACE VIEW public.quote_summary AS
SELECT 
    q.id as quote_id,
    q.quote_number,
    q.quote_type,
    q.origin_address,
    q.destination_address,
    q.total_fare,
    q.status,
    q.created_at,
    up.full_name as customer_name,
    up.company_name as customer_company
FROM public.quotes q
LEFT JOIN public.user_profiles up ON q.customer_id = up.id;

-- 19. 뷰에 대한 RLS 정책 (뷰에는 RLS를 적용할 수 없으므로 제거)
-- CREATE POLICY "Users can view own quote summary" ON public.quote_summary
--     FOR SELECT USING (
--         customer_id = auth.uid() OR
--         EXISTS (
--             SELECT 1 FROM public.user_profiles 
--             WHERE id = auth.uid() AND role IN ('admin', 'manager')
--         )
--     ); 