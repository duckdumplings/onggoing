-- 최적화 실행 결과 저장 테이블 생성
-- 생성일: 2025-01-27
-- 목적: 경로 최적화 요청/결과를 저장하고 최근 실행 리스트를 조회

-- 1. 최적화 실행 결과 테이블 생성
CREATE TABLE IF NOT EXISTS public.optimization_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 요청 정보
    request_data JSONB NOT NULL, -- 원본 요청 데이터 (origins, destinations, vehicleType, optimizeOrder, departureAt, useRealtimeTraffic)
    
    -- 결과 정보
    result_data JSONB NOT NULL, -- 최적화 결과 데이터 (routeData)
    
    -- 메타데이터
    total_distance DECIMAL(10,2), -- km
    total_time INTEGER, -- minutes
    vehicle_type TEXT CHECK (vehicle_type IN ('레이', '스타렉스')),
    optimize_order BOOLEAN DEFAULT false,
    used_traffic BOOLEAN DEFAULT true,
    departure_at TIMESTAMPTZ,
    
    -- 엔진 정보
    engine_used TEXT DEFAULT 'tmap', -- 사용된 엔진 (tmap, atlan, fallback)
    fallback_used BOOLEAN DEFAULT false, -- 폴백 사용 여부
    
    -- 사용자 정보
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_optimization_runs_created_by ON public.optimization_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_optimization_runs_created_at ON public.optimization_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_optimization_runs_vehicle_type ON public.optimization_runs(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_optimization_runs_optimize_order ON public.optimization_runs(optimize_order);

-- 3. 업데이트 트리거 생성
CREATE TRIGGER update_optimization_runs_updated_at 
    BEFORE UPDATE ON public.optimization_runs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS 정책 (MVP 단계에서는 비활성화)
ALTER TABLE public.optimization_runs DISABLE ROW LEVEL SECURITY;

-- 5. 뷰 생성 (최적화 실행 요약)
CREATE OR REPLACE VIEW public.optimization_summary AS
SELECT 
    opt.id,
    opt.total_distance,
    opt.total_time,
    opt.vehicle_type,
    opt.optimize_order,
    opt.used_traffic,
    opt.departure_at,
    opt.engine_used,
    opt.fallback_used,
    opt.created_at,
    up.full_name as user_name,
    up.company_name as user_company
FROM public.optimization_runs opt
LEFT JOIN public.user_profiles up ON opt.created_by = up.id
ORDER BY opt.created_at DESC;

-- 6. 함수 생성 (최적화 실행 통계)
CREATE OR REPLACE FUNCTION public.get_optimization_stats(
    user_id UUID DEFAULT NULL,
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_runs BIGINT,
    avg_distance DECIMAL(10,2),
    avg_time INTEGER,
    total_distance_saved DECIMAL(10,2),
    optimization_rate DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_runs,
        AVG(total_distance) as avg_distance,
        AVG(total_time) as avg_time,
        SUM(
            CASE 
                WHEN request_data->>'optimizeOrder' = 'true' 
                AND result_data->'summary'->>'optimizationInfo' IS NOT NULL
                THEN (result_data->'summary'->'optimizationInfo'->>'distanceSaved')::DECIMAL(10,2)
                ELSE 0
            END
        ) as total_distance_saved,
        ROUND(
            (COUNT(*) FILTER (WHERE request_data->>'optimizeOrder' = 'true'))::DECIMAL / 
            COUNT(*)::DECIMAL * 100, 2
        ) as optimization_rate
    FROM public.optimization_runs
    WHERE created_at >= NOW() - INTERVAL '1 day' * days_back
    AND (user_id IS NULL OR created_by = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
