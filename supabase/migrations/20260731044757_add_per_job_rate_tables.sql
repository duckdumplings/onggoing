-- 단건 참고 운임도 시간당/유류할증과 같은 시행일 기반 rate_tables에서 관리한다.
-- 공식 대표 견적은 시간당 운임이며, 이 표는 사용자가 요청한 경우의 참고 비교값이다.

INSERT INTO public.rate_tables
    (vehicle_type, pricing_plan, contract_min_months, effective_from, source_doc, payload, notes)
VALUES
(
    'ray',
    'per_job',
    3,
    DATE '2025-06-01',
    '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx',
    '{
      "currency": "KRW",
      "maxKm": 60,
      "stopFee": 5000,
      "tiers": [
        {"fromKm": 0, "toKm": 5, "baseFare": 24000},
        {"fromKm": 5, "toKm": 10, "baseFare": 27000},
        {"fromKm": 10, "toKm": 15, "baseFare": 30000},
        {"fromKm": 15, "toKm": 20, "baseFare": 33000},
        {"fromKm": 20, "toKm": 25, "baseFare": 36000},
        {"fromKm": 25, "toKm": 30, "baseFare": 40000},
        {"fromKm": 30, "toKm": 35, "baseFare": 45000},
        {"fromKm": 35, "toKm": 40, "baseFare": 50000},
        {"fromKm": 40, "toKm": 45, "baseFare": 55000},
        {"fromKm": 45, "toKm": 50, "baseFare": 60000},
        {"fromKm": 50, "toKm": 55, "baseFare": 65000},
        {"fromKm": 55, "toKm": 60, "baseFare": 70000}
      ],
      "regularPolicy": {"mode": "vehicle-table", "vehicle": "starex"}
    }'::jsonb,
    '레이 단건 참고 운임. 정기 레이는 스타렉스 단건표와 경유비를 사용.'
),
(
    'starex',
    'per_job',
    3,
    DATE '2025-06-01',
    '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx',
    '{
      "currency": "KRW",
      "maxKm": 60,
      "stopFee": 7000,
      "tiers": [
        {"fromKm": 0, "toKm": 5, "baseFare": 31000},
        {"fromKm": 5, "toKm": 10, "baseFare": 34000},
        {"fromKm": 10, "toKm": 15, "baseFare": 37000},
        {"fromKm": 15, "toKm": 20, "baseFare": 40000},
        {"fromKm": 20, "toKm": 25, "baseFare": 43000},
        {"fromKm": 25, "toKm": 30, "baseFare": 48000},
        {"fromKm": 30, "toKm": 35, "baseFare": 53000},
        {"fromKm": 35, "toKm": 40, "baseFare": 58000},
        {"fromKm": 40, "toKm": 45, "baseFare": 63000},
        {"fromKm": 45, "toKm": 50, "baseFare": 68000},
        {"fromKm": 50, "toKm": 55, "baseFare": 73000},
        {"fromKm": 55, "toKm": 60, "baseFare": 78000}
      ],
      "regularPolicy": {"mode": "factor", "factor": 1.2}
    }'::jsonb,
    '스타렉스 단건 참고 운임. 정기는 기본표와 경유비에 1.2배 적용.'
)
ON CONFLICT (vehicle_type, pricing_plan, effective_from) DO UPDATE
SET payload = EXCLUDED.payload,
    source_doc = EXCLUDED.source_doc,
    notes = EXCLUDED.notes,
    updated_at = NOW();
