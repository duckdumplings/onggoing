import {
  HOURLY_RATE_EFFECTIVE_FROM,
  HOURLY_RATE_TABLE,
  fuelSurchargeHourlyCorrect,
  pickHourlyRate,
  roundUpTo30Minutes,
  suggestCheaperNextTier,
  type Vehicle,
} from '@/domains/quote/pricing';

export type PricingRegressionCase = {
  id: string;
  description: string;
  vehicle: Vehicle;
  billMinutes: number;
  /** 운임표상 "시간당 운임" 컬럼 */
  expectedRatePerHour: number;
  /** 운임표상 "일일 운임" 컬럼 = 시간당 × 시간 */
  expectedDailyFare: number;
  /** 운임표상 "20일 기준 운임" 컬럼 = 일일 × 20 */
  expectedMonthly20dFare: number;
};

/**
 * PPTX 원본 운임표와 코드 lookup이 의도적으로 다르거나, 오타로 확인된 항목 이력.
 * 운영팀 컴펀이 끝난 항목은 resolvedAt 으로 마감하고, 미해결 항목만 verify 출력에 노출된다.
 */
export const PPTX_DISCREPANCIES: ReadonlyArray<{
  source: string;
  field: string;
  pptxValue: number | string;
  codeValue: number | string;
  note: string;
  /** 운영팀 컴펀 완료 일자 (있으면 verify 출력에서 제외). */
  resolvedAt?: string;
}> = [
  {
    source: '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx — slide2(스타렉스)',
    field: '3시간 반 일일 운임',
    pptxValue: 94500,
    codeValue: 105000,
    note:
      'PPTX 원본 표에 일일 94,500 / 20일 1,890,000으로 적혀 있던 것은 오타로 확인됨. ' +
      '운영팀 컴펀(2026-05-29): 시간당 30,000원 × 3.5h = 105,000원, 월 2,100,000원이 정답. ' +
      '코드/DB rate_tables 모두 정답 기준으로 적용됨. PPTX 마스터 자료는 영업팀에서 별도 정정 필요.',
    resolvedAt: '2026-05-29',
  },
];

/** 운영팀 컴펀이 아직 완료되지 않은 PPTX 차이만 추출 (verify 출력 용). */
export const UNRESOLVED_PPTX_DISCREPANCIES = PPTX_DISCREPANCIES.filter((d) => !d.resolvedAt);

export type FuelSurchargeRegressionCase = {
  id: string;
  description: string;
  vehicle: Vehicle;
  billMinutes: number;
  actualKm: number;
  expectedSurcharge: number;
};

/**
 * 2025-06-01 시행 신규 운임표(스타렉스 인상 후) 회귀 케이스.
 * 향후 단가 개정이 들어왔을 때 이 표가 자동으로 깨지면서 신호를 준다.
 */
export const HOURLY_RATE_REGRESSION_CASES: PricingRegressionCase[] = [
  // ─── 레이 (변동 없음, 동일 검증) ───
  { id: 'ray-2h',    description: '레이 2시간',    vehicle: 'ray', billMinutes: 120, expectedRatePerHour: 26500, expectedDailyFare: 53000,  expectedMonthly20dFare: 1060000 },
  { id: 'ray-2.5h',  description: '레이 2시간 반', vehicle: 'ray', billMinutes: 150, expectedRatePerHour: 26500, expectedDailyFare: 66250,  expectedMonthly20dFare: 1325000 },
  { id: 'ray-3h',    description: '레이 3시간',    vehicle: 'ray', billMinutes: 180, expectedRatePerHour: 23000, expectedDailyFare: 69000,  expectedMonthly20dFare: 1380000 },
  { id: 'ray-4h',    description: '레이 4시간',    vehicle: 'ray', billMinutes: 240, expectedRatePerHour: 22000, expectedDailyFare: 88000,  expectedMonthly20dFare: 1760000 },
  { id: 'ray-5h',    description: '레이 5시간',    vehicle: 'ray', billMinutes: 300, expectedRatePerHour: 21000, expectedDailyFare: 105000, expectedMonthly20dFare: 2100000 },
  { id: 'ray-8h',    description: '레이 8시간',    vehicle: 'ray', billMinutes: 480, expectedRatePerHour: 21000, expectedDailyFare: 168000, expectedMonthly20dFare: 3360000 },

  // ─── 스타렉스 (2025-06-01 신규 인상) ───
  { id: 'starex-2h',   description: '스타렉스 2시간',    vehicle: 'starex', billMinutes: 120, expectedRatePerHour: 36000, expectedDailyFare: 72000,  expectedMonthly20dFare: 1440000 },
  { id: 'starex-2.5h', description: '스타렉스 2시간 반 (단가 인버전 구간)', vehicle: 'starex', billMinutes: 150, expectedRatePerHour: 34000, expectedDailyFare: 85000,  expectedMonthly20dFare: 1700000 },
  { id: 'starex-3h',   description: '스타렉스 3시간',    vehicle: 'starex', billMinutes: 180, expectedRatePerHour: 30000, expectedDailyFare: 90000,  expectedMonthly20dFare: 1800000 },
  // 운영팀 컴펀(2026-05-29): PPTX 원본의 일일 94,500 / 20일 1,890,000 표기가 오타이며,
  // 시간당 30,000원 × 3.5h = 105,000원 / 월 2,100,000원이 정답으로 확인됨.
  { id: 'starex-3.5h', description: '스타렉스 3시간 반 (운영팀 컴펀 완료: PPTX 오타 보정)', vehicle: 'starex', billMinutes: 210, expectedRatePerHour: 30000, expectedDailyFare: 105000, expectedMonthly20dFare: 2100000 },
  { id: 'starex-4h',   description: '스타렉스 4시간',    vehicle: 'starex', billMinutes: 240, expectedRatePerHour: 27000, expectedDailyFare: 108000, expectedMonthly20dFare: 2160000 },
  { id: 'starex-4.5h', description: '스타렉스 4시간 반', vehicle: 'starex', billMinutes: 270, expectedRatePerHour: 27000, expectedDailyFare: 121500, expectedMonthly20dFare: 2430000 },
  { id: 'starex-5h',   description: '스타렉스 5시간',    vehicle: 'starex', billMinutes: 300, expectedRatePerHour: 26000, expectedDailyFare: 130000, expectedMonthly20dFare: 2600000 },
  { id: 'starex-5.5h', description: '스타렉스 5시간 반', vehicle: 'starex', billMinutes: 330, expectedRatePerHour: 26000, expectedDailyFare: 143000, expectedMonthly20dFare: 2860000 },
  { id: 'starex-6h',   description: '스타렉스 6시간',    vehicle: 'starex', billMinutes: 360, expectedRatePerHour: 25000, expectedDailyFare: 150000, expectedMonthly20dFare: 3000000 },
  { id: 'starex-7h',   description: '스타렉스 7시간',    vehicle: 'starex', billMinutes: 420, expectedRatePerHour: 25000, expectedDailyFare: 175000, expectedMonthly20dFare: 3500000 },
  { id: 'starex-8h',   description: '스타렉스 8시간',    vehicle: 'starex', billMinutes: 480, expectedRatePerHour: 25000, expectedDailyFare: 200000, expectedMonthly20dFare: 4000000 },
];

/**
 * 유류할증표 회귀 케이스. PPTX 본문 예시(레이 5h 계약 50km 기본, 54km 운행 → 2,000원)도 포함.
 */
export const FUEL_SURCHARGE_REGRESSION_CASES: FuelSurchargeRegressionCase[] = [
  { id: 'fuel-ray-within-base',  description: '레이 5h(기본 50km), 49km 운행 → 0원',     vehicle: 'ray',    billMinutes: 300, actualKm: 49,  expectedSurcharge: 0 },
  { id: 'fuel-ray-pptx-example', description: '레이 5h(기본 50km), 54km 운행 → 2,000원 (PPTX 예시)', vehicle: 'ray', billMinutes: 300, actualKm: 54, expectedSurcharge: 2000 },
  { id: 'fuel-ray-bin-2',        description: '레이 3h(기본 30km), 45km 운행 → 4,000원',  vehicle: 'ray',    billMinutes: 180, actualKm: 45,  expectedSurcharge: 4000 },
  { id: 'fuel-starex-bin-1',     description: '스타렉스 4h(기본 40km), 45km 운행 → 2,800원', vehicle: 'starex', billMinutes: 240, actualKm: 45,  expectedSurcharge: 2800 },
  { id: 'fuel-starex-bin-3',     description: '스타렉스 2h(기본 20km), 45km 운행 → 8,400원', vehicle: 'starex', billMinutes: 120, actualKm: 45,  expectedSurcharge: 8400 },
];

export type AdvisorRegressionCase = {
  id: string;
  description: string;
  vehicle: Vehicle;
  billMinutes: number;
  /** null = 추천 없어야 함, 객체 = 권장 단가/시간 검증 */
  expected:
    | null
    | {
        suggestedBillMinutes: number;
        suggestedRatePerHour: number;
        ratePerHourDelta: number;
      };
};

/**
 * 인버전 추천(suggestCheaperNextTier) 회귀 케이스.
 * 운임표가 다음에 바뀔 때 단가 인하 구간이 사라지거나 새로 생기면 즉시 잡힌다.
 */
export const ADVISOR_REGRESSION_CASES: AdvisorRegressionCase[] = [
  // 레이: 단가가 떨어지는 구간만 추천
  { id: 'advisor-ray-2h-no-change',    description: '레이 2h → 2.5h (단가 동일, 추천 없음)', vehicle: 'ray',    billMinutes: 120, expected: null },
  { id: 'advisor-ray-2.5h-to-3h',      description: '레이 2.5h → 3h (26,500 → 23,000)',     vehicle: 'ray',    billMinutes: 150, expected: { suggestedBillMinutes: 180, suggestedRatePerHour: 23000, ratePerHourDelta: -3500 } },
  { id: 'advisor-ray-3.5h-to-4h',      description: '레이 3.5h → 4h (23,000 → 22,000)',     vehicle: 'ray',    billMinutes: 210, expected: { suggestedBillMinutes: 240, suggestedRatePerHour: 22000, ratePerHourDelta: -1000 } },
  { id: 'advisor-ray-4.5h-to-5h',      description: '레이 4.5h → 5h (22,000 → 21,000)',     vehicle: 'ray',    billMinutes: 270, expected: { suggestedBillMinutes: 300, suggestedRatePerHour: 21000, ratePerHourDelta: -1000 } },
  { id: 'advisor-ray-5h-no-change',    description: '레이 5h → 5.5h (단가 동일, 추천 없음)', vehicle: 'ray',    billMinutes: 300, expected: null },
  { id: 'advisor-ray-8h-cap',          description: '레이 8h (구간 끝, 추천 없음)',           vehicle: 'ray',    billMinutes: 480, expected: null },

  // 스타렉스: 2025-06-01 신규 인버전 구간 (2h→2.5h, 5.5h→6h 등)
  { id: 'advisor-starex-2h-to-2.5h',   description: '스타렉스 2h → 2.5h (36,000 → 34,000)',  vehicle: 'starex', billMinutes: 120, expected: { suggestedBillMinutes: 150, suggestedRatePerHour: 34000, ratePerHourDelta: -2000 } },
  { id: 'advisor-starex-2.5h-to-3h',   description: '스타렉스 2.5h → 3h (34,000 → 30,000)',  vehicle: 'starex', billMinutes: 150, expected: { suggestedBillMinutes: 180, suggestedRatePerHour: 30000, ratePerHourDelta: -4000 } },
  { id: 'advisor-starex-3.5h-to-4h',   description: '스타렉스 3.5h → 4h (30,000 → 27,000)',  vehicle: 'starex', billMinutes: 210, expected: { suggestedBillMinutes: 240, suggestedRatePerHour: 27000, ratePerHourDelta: -3000 } },
  { id: 'advisor-starex-4.5h-to-5h',   description: '스타렉스 4.5h → 5h (27,000 → 26,000)',  vehicle: 'starex', billMinutes: 270, expected: { suggestedBillMinutes: 300, suggestedRatePerHour: 26000, ratePerHourDelta: -1000 } },
  { id: 'advisor-starex-5.5h-to-6h',   description: '스타렉스 5.5h → 6h (26,000 → 25,000)',  vehicle: 'starex', billMinutes: 330, expected: { suggestedBillMinutes: 360, suggestedRatePerHour: 25000, ratePerHourDelta: -1000 } },
  { id: 'advisor-starex-6h-no-change', description: '스타렉스 6h → 6.5h (단가 동일, 추천 없음)', vehicle: 'starex', billMinutes: 360, expected: null },
  { id: 'advisor-starex-8h-cap',       description: '스타렉스 8h (구간 끝, 추천 없음)',         vehicle: 'starex', billMinutes: 480, expected: null },
];

export type PricingAssertion = {
  caseId: string;
  field: string;
  expected: number;
  actual: number;
};

/**
 * 코드의 실제 계산 결과와 운임표 회귀 케이스를 대조한다.
 * 불일치가 1건이라도 있으면 실패 목록과 함께 throw.
 */
export function assertPricingRegression(): { ok: true } {
  const failures: PricingAssertion[] = [];

  for (const c of HOURLY_RATE_REGRESSION_CASES) {
    const actualRate = pickHourlyRate(c.vehicle, c.billMinutes);
    if (actualRate !== c.expectedRatePerHour) {
      failures.push({ caseId: c.id, field: 'ratePerHour', expected: c.expectedRatePerHour, actual: actualRate });
    }
    const actualDaily = Math.round((actualRate * c.billMinutes) / 60);
    if (actualDaily !== c.expectedDailyFare) {
      failures.push({ caseId: c.id, field: 'dailyFare', expected: c.expectedDailyFare, actual: actualDaily });
    }
    const actualMonthly = actualDaily * 20;
    if (actualMonthly !== c.expectedMonthly20dFare) {
      failures.push({ caseId: c.id, field: 'monthly20dFare', expected: c.expectedMonthly20dFare, actual: actualMonthly });
    }
  }

  for (const c of FUEL_SURCHARGE_REGRESSION_CASES) {
    const actual = fuelSurchargeHourlyCorrect(c.vehicle, c.actualKm, c.billMinutes);
    if (actual !== c.expectedSurcharge) {
      failures.push({ caseId: c.id, field: 'fuelSurcharge', expected: c.expectedSurcharge, actual });
    }
  }

  // Advisor (인버전 추천) 회귀 검증
  for (const c of ADVISOR_REGRESSION_CASES) {
    const actual = suggestCheaperNextTier(c.vehicle, c.billMinutes);
    if (c.expected === null) {
      if (actual !== null) {
        failures.push({
          caseId: c.id,
          field: 'advisor (expected null)',
          expected: 0,
          actual: actual.suggestedRatePerHour,
        });
      }
      continue;
    }
    if (actual === null) {
      failures.push({ caseId: c.id, field: 'advisor (expected non-null)', expected: c.expected.suggestedRatePerHour, actual: 0 });
      continue;
    }
    if (actual.suggestedBillMinutes !== c.expected.suggestedBillMinutes) {
      failures.push({ caseId: c.id, field: 'advisor.suggestedBillMinutes', expected: c.expected.suggestedBillMinutes, actual: actual.suggestedBillMinutes });
    }
    if (actual.suggestedRatePerHour !== c.expected.suggestedRatePerHour) {
      failures.push({ caseId: c.id, field: 'advisor.suggestedRatePerHour', expected: c.expected.suggestedRatePerHour, actual: actual.suggestedRatePerHour });
    }
    if (actual.ratePerHourDelta !== c.expected.ratePerHourDelta) {
      failures.push({ caseId: c.id, field: 'advisor.ratePerHourDelta', expected: c.expected.ratePerHourDelta, actual: actual.ratePerHourDelta });
    }
  }

  // 인버전 invariant: 스타렉스 2시간 단가 > 2시간 반 단가 (운임표 의도)
  const starex2h = pickHourlyRate('starex', 120);
  const starex25h = pickHourlyRate('starex', 150);
  if (!(starex2h > starex25h)) {
    failures.push({
      caseId: 'invariant-starex-inversion',
      field: 'rate(2h) > rate(2.5h)',
      expected: 1,
      actual: 0,
    });
  }

  // 운임표 시행일이 비어 있으면 안 됨
  if (!HOURLY_RATE_EFFECTIVE_FROM) {
    failures.push({ caseId: 'invariant-effective-from', field: 'HOURLY_RATE_EFFECTIVE_FROM', expected: 1, actual: 0 });
  }

  // 30분 단위 lookup 무결성: 테이블이 120~480분(2~8시간) 13구간을 모두 커버해야 함
  for (const v of ['ray', 'starex'] as Vehicle[]) {
    const table = HOURLY_RATE_TABLE[v];
    const expectedSteps = Array.from({ length: 13 }, (_, i) => 120 + i * 30);
    for (let i = 0; i < expectedSteps.length; i++) {
      if (table[i]?.maxMinutes !== expectedSteps[i]) {
        failures.push({
          caseId: `invariant-table-shape-${v}-step-${i}`,
          field: 'maxMinutes',
          expected: expectedSteps[i],
          actual: table[i]?.maxMinutes ?? -1,
        });
      }
    }
  }

  // 과금 시간 반올림 invariant: 최소 120분 보장 + 30분 단위 ceil
  if (roundUpTo30Minutes(5) !== 120) {
    failures.push({ caseId: 'invariant-roundup-min', field: 'roundUpTo30Minutes(5)', expected: 120, actual: roundUpTo30Minutes(5) });
  }
  if (roundUpTo30Minutes(121) !== 150) {
    failures.push({ caseId: 'invariant-roundup-step', field: 'roundUpTo30Minutes(121)', expected: 150, actual: roundUpTo30Minutes(121) });
  }

  if (failures.length > 0) {
    const detail = failures
      .map((f) => `  - [${f.caseId}] ${f.field}: expected=${f.expected}, actual=${f.actual}`)
      .join('\n');
    throw new Error(
      `Pricing regression failed (${failures.length} mismatch${failures.length > 1 ? 'es' : ''}):\n${detail}\n` +
        `운임표 시행일: ${HOURLY_RATE_EFFECTIVE_FROM}. 단가 개정 시 src/domains/quote/pricing.ts와 ` +
        `src/domains/quote/evals/pricingRegression.ts 회귀 표를 함께 갱신하세요.`,
    );
  }

  return { ok: true };
}
