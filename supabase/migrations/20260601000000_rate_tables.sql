-- 옹고잉 운임표 시점별 매트릭스 (차종 × 요금제 × 시점)
-- 도입 배경: "[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx" 시행으로 단가 개정.
-- 이전에는 src/domains/quote/pricing.ts 상수만으로 lookup. 향후 시점별 비교/소급 계산을
-- 위해 DB 로도 같은 운임표를 동기화한다. 코드의 정적 상수는 fallback 으로 유지된다.

CREATE TABLE IF NOT EXISTS public.rate_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('ray', 'starex')),
    pricing_plan TEXT NOT NULL CHECK (pricing_plan IN ('hourly', 'per_job', 'fuel_surcharge', 'daily', 'monthly_20d')),
    contract_min_months INTEGER NOT NULL DEFAULT 3,
    effective_from DATE NOT NULL,
    effective_to DATE,
    source_doc TEXT NOT NULL,
    payload JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rate_tables_effective_range_check
        CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_rate_tables_lookup
    ON public.rate_tables (vehicle_type, pricing_plan, effective_from DESC);

-- 같은 차종/요금제/시작일 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_tables_unique_vehicle_plan_from
    ON public.rate_tables (vehicle_type, pricing_plan, effective_from);

ALTER TABLE public.rate_tables DISABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────
-- Seed: 2025-06-01 시행 운임표 (PPTX 원본 기준 + 1건 오타 보정)
-- 일일 운임 컬럼은 (시간당 × 시간)을 그대로 두되, 스타렉스 3시간 반은 PPTX
-- 원본에 94,500 으로 적혀 있던 것이 오타로 확인됨 (운영팀 컴펀 2026-05-29).
-- 시간당 30,000원 × 3.5h = 105,000원 / 20일 2,100,000원 으로 시드.
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO public.rate_tables
    (vehicle_type, pricing_plan, contract_min_months, effective_from, source_doc, payload, notes)
VALUES (
    'ray',
    'hourly',
    3,
    DATE '2025-06-01',
    '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx',
    '{
        "currency": "KRW",
        "unitMinutes": 30,
        "minBillMinutes": 120,
        "tiers": [
            {"maxMinutes": 120, "ratePerHour": 26500, "dailyFare":  53000, "monthly20dFare": 1060000},
            {"maxMinutes": 150, "ratePerHour": 26500, "dailyFare":  66250, "monthly20dFare": 1325000},
            {"maxMinutes": 180, "ratePerHour": 23000, "dailyFare":  69000, "monthly20dFare": 1380000},
            {"maxMinutes": 210, "ratePerHour": 23000, "dailyFare":  80500, "monthly20dFare": 1610000},
            {"maxMinutes": 240, "ratePerHour": 22000, "dailyFare":  88000, "monthly20dFare": 1760000},
            {"maxMinutes": 270, "ratePerHour": 22000, "dailyFare":  99000, "monthly20dFare": 1980000},
            {"maxMinutes": 300, "ratePerHour": 21000, "dailyFare": 105000, "monthly20dFare": 2100000},
            {"maxMinutes": 330, "ratePerHour": 21000, "dailyFare": 115500, "monthly20dFare": 2310000},
            {"maxMinutes": 360, "ratePerHour": 21000, "dailyFare": 126000, "monthly20dFare": 2520000},
            {"maxMinutes": 390, "ratePerHour": 21000, "dailyFare": 136500, "monthly20dFare": 2730000},
            {"maxMinutes": 420, "ratePerHour": 21000, "dailyFare": 147000, "monthly20dFare": 2940000},
            {"maxMinutes": 450, "ratePerHour": 21000, "dailyFare": 157500, "monthly20dFare": 3150000},
            {"maxMinutes": 480, "ratePerHour": 21000, "dailyFare": 168000, "monthly20dFare": 3360000}
        ]
    }'::jsonb,
    '레이 시간당 운임 - 2025-06-01 시행 (단가 변동 없음).'
),
(
    'starex',
    'hourly',
    3,
    DATE '2025-06-01',
    '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx',
    '{
        "currency": "KRW",
        "unitMinutes": 30,
        "minBillMinutes": 120,
        "tiers": [
            {"maxMinutes": 120, "ratePerHour": 36000, "dailyFare":  72000, "monthly20dFare": 1440000},
            {"maxMinutes": 150, "ratePerHour": 34000, "dailyFare":  85000, "monthly20dFare": 1700000},
            {"maxMinutes": 180, "ratePerHour": 30000, "dailyFare":  90000, "monthly20dFare": 1800000},
            {"maxMinutes": 210, "ratePerHour": 30000, "dailyFare": 105000, "monthly20dFare": 2100000},
            {"maxMinutes": 240, "ratePerHour": 27000, "dailyFare": 108000, "monthly20dFare": 2160000},
            {"maxMinutes": 270, "ratePerHour": 27000, "dailyFare": 121500, "monthly20dFare": 2430000},
            {"maxMinutes": 300, "ratePerHour": 26000, "dailyFare": 130000, "monthly20dFare": 2600000},
            {"maxMinutes": 330, "ratePerHour": 26000, "dailyFare": 143000, "monthly20dFare": 2860000},
            {"maxMinutes": 360, "ratePerHour": 25000, "dailyFare": 150000, "monthly20dFare": 3000000},
            {"maxMinutes": 390, "ratePerHour": 25000, "dailyFare": 162500, "monthly20dFare": 3250000},
            {"maxMinutes": 420, "ratePerHour": 25000, "dailyFare": 175000, "monthly20dFare": 3500000},
            {"maxMinutes": 450, "ratePerHour": 25000, "dailyFare": 187500, "monthly20dFare": 3750000},
            {"maxMinutes": 480, "ratePerHour": 25000, "dailyFare": 200000, "monthly20dFare": 4000000}
        ]
    }'::jsonb,
    '스타렉스 시간당 운임 - 2025-06-01 인상. 2시간(36,000) > 2시간 반(34,000) 단가 인버전 구간 의도적 유지. 3시간 반 일일 운임은 PPTX 원본 94,500(오타)이 아닌 105,000이 정답 — 운영팀 컴펀 완료(2026-05-29).'
),
(
    'ray',
    'fuel_surcharge',
    3,
    DATE '2025-06-01',
    '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx',
    '{
        "currency": "KRW",
        "baseKmPerHour": 10,
        "stepKm": 10,
        "stepCharge": 2000,
        "bins": [
            {"toKm": 10, "charge": 2000},
            {"toKm": 20, "charge": 4000},
            {"toKm": 30, "charge": 6000},
            {"toKm": 40, "charge": 8000}
        ]
    }'::jsonb,
    '레이 유류 할증. 기본 주행거리 = 과금시간 × 10km, 초과분 10km 단위 가산.'
),
(
    'starex',
    'fuel_surcharge',
    3,
    DATE '2025-06-01',
    '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx',
    '{
        "currency": "KRW",
        "baseKmPerHour": 10,
        "stepKm": 10,
        "stepCharge": 2800,
        "bins": [
            {"toKm": 10, "charge": 2800},
            {"toKm": 20, "charge": 5600},
            {"toKm": 30, "charge": 8400},
            {"toKm": 40, "charge": 11200}
        ]
    }'::jsonb,
    '스타렉스 유류 할증. 기본 주행거리 = 과금시간 × 10km, 초과분 10km 단위 가산.'
)
ON CONFLICT (vehicle_type, pricing_plan, effective_from) DO UPDATE
SET payload = EXCLUDED.payload,
    source_doc = EXCLUDED.source_doc,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- 갱신 시 updated_at 자동 갱신용 트리거
CREATE OR REPLACE FUNCTION public.set_rate_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_tables_set_updated_at ON public.rate_tables;
CREATE TRIGGER trg_rate_tables_set_updated_at
    BEFORE UPDATE ON public.rate_tables
    FOR EACH ROW
    EXECUTE FUNCTION public.set_rate_tables_updated_at();
