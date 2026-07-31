-- 고객사(화주) 마스터 + 정기 수거 스케줄 + 시나리오 견적 그룹 테이블 생성
-- 생성일: 2026-05-29
-- 목적: 1회성 견적 파이프라인을 넘어, 재사용 가능한 고객사 이력 / 정기(연 N회) 스케줄 /
--       다중 시나리오(3·5·10개 지점) 비교 견적을 정규 엔티티로 저장한다.

-- 1. 고객사(화주) 마스터
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    memo TEXT,

    -- 로그인 사용자와 연결(선택). 비로그인 화주는 NULL 허용.
    linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_company_name ON public.customers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON public.customers(created_by);

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. 정기 수거 스케줄 (연 N회 빈도 정량화)
CREATE TABLE IF NOT EXISTS public.recurring_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,

    -- 빈도: { per, count } (예: 분기 1회 → 'quarter', 1)
    frequency_per TEXT NOT NULL CHECK (frequency_per IN ('day', 'week', 'month', 'quarter', 'year')),
    frequency_count INTEGER NOT NULL DEFAULT 1 CHECK (frequency_count > 0),
    -- 연 환산 방문 횟수(파생값, 조회/집계 편의). 분기 1회 → 4
    annual_visits INTEGER,
    contract_months INTEGER DEFAULT 3,

    next_pickup_date DATE,

    -- 역할 태깅된 경유지 목록 (RouteStop[] 직렬화)
    stops JSONB NOT NULL DEFAULT '[]'::jsonb,
    vehicle_type TEXT CHECK (vehicle_type IN ('레이', '스타렉스')),

    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_customer_id ON public.recurring_schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_next_pickup ON public.recurring_schedules(next_pickup_date);
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_active ON public.recurring_schedules(is_active);

CREATE TRIGGER update_recurring_schedules_updated_at
    BEFORE UPDATE ON public.recurring_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. 시나리오 견적 그룹 (3/5/10개 지점을 한 견적 요청으로 묶음)
CREATE TABLE IF NOT EXISTS public.quote_scenario_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    title TEXT,
    -- 요청 출처: 'chat' | 'panel' | 'document' | 'manual'
    request_source TEXT DEFAULT 'manual',
    -- 비교 추천 기준 및 추천 시나리오 라벨
    sorted_by TEXT DEFAULT 'annualPrice',
    recommended_label TEXT,

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenario_groups_customer_id ON public.quote_scenario_groups(customer_id);
CREATE INDEX IF NOT EXISTS idx_scenario_groups_created_at ON public.quote_scenario_groups(created_at DESC);

CREATE TRIGGER update_quote_scenario_groups_updated_at
    BEFORE UPDATE ON public.quote_scenario_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. 시나리오 개별 견적 (그룹에 N건)
CREATE TABLE IF NOT EXISTS public.quote_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    group_id UUID NOT NULL REFERENCES public.quote_scenario_groups(id) ON DELETE CASCADE,

    label TEXT NOT NULL, -- "3개 지점", "5개 지점", "10개 지점"
    -- 역할 태깅된 경유지 목록 (RouteStop[] 직렬화)
    stops JSONB NOT NULL DEFAULT '[]'::jsonb,
    vehicle_type TEXT CHECK (vehicle_type IN ('레이', '스타렉스')),
    schedule_type TEXT CHECK (schedule_type IN ('regular', 'ad-hoc')),
    -- 빈도 직렬화 ({ per, count, contractMonths })
    frequency JSONB,

    -- 경로 메트릭
    total_km DECIMAL(10,2),
    drive_minutes INTEGER,
    dwell_minutes INTEGER,
    stops_count INTEGER,

    -- 산출 결과
    one_time_price INTEGER,
    annual_price INTEGER,
    breakdown JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_scenarios_group_id ON public.quote_scenarios(group_id);

-- 5. RLS 정책 (MVP 단계에서는 비활성화 — Production 전환 시 재활성화 필요)
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_scenario_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_scenarios DISABLE ROW LEVEL SECURITY;
