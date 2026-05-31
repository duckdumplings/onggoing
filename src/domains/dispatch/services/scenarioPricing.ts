/**
 * 시나리오 견적 계산: 역할(pickup/drop) 인지 + 정기 빈도 연환산.
 *
 * 다중 수거 → 단일 하차 운행은 "단건(per-job)" 요금제가 가장 잘 맞는다
 * (거리 구간표 + 중간 경유지당 정액). 본 모듈은 경로 메트릭과 시나리오를 받아
 * 1회 운임과 연 환산 운임을 산출한다. 요율 자체는 src/domains/quote/pricing.ts를
 * 단일 진실원으로 재사용한다(이중 정의 방지).
 */

import {
  perJobBasePrice,
  perJobRegularPrice,
  pickHourlyRate,
  roundUpTo30Minutes,
  fuelSurchargeHourlyCorrect,
  STOP_FEE,
  type Vehicle as PricingVehicle,
} from '@/domains/quote/pricing';
import {
  countStopRoles,
  toVehicleKey,
  type QuoteScenario,
  type RouteMetrics,
  type ScenarioQuoteResult,
} from '@/domains/dispatch/types/routePlan';
import { annualVisits, annualizePrice, formatFrequency } from '@/domains/dispatch/utils/frequency';

/** 스타렉스 정기 가산율(quote-calculation의 PER_JOB_REGULAR_FACTOR 기본값과 동일). */
const PER_JOB_REGULAR_FACTOR = 1.2;

/**
 * 중간 경유지 수(정액 경유비 대상)를 역할 구성으로 추정한다.
 * 출발지(시스템이 open-start로 고른 첫 수거지)와 최종 하차지를 제외한 나머지가 정액 대상.
 * open-start로 출발지가 바뀌어도 "총 지점 - 2"라는 정액 대상 수는 불변이므로 본 계산은 그대로 유효하다.
 */
export function deriveStopsCount(totalStops: number): number {
  return Math.max(0, totalStops - 2);
}

/** 정기/비정기 + 차종에 따른 중간 경유지 정액 합계. */
function resolveStopFee(vehicle: PricingVehicle, stopsCount: number, isRegular: boolean): number {
  const baseStopFee = STOP_FEE[vehicle] * Math.max(0, stopsCount);
  if (!isRegular) return baseStopFee;
  // 레이 정기: 스타렉스 경유지 정액 사용 / 스타렉스 정기: 기본 + 가산율
  return vehicle === 'ray'
    ? STOP_FEE.starex * Math.max(0, stopsCount)
    : Math.round(baseStopFee * PER_JOB_REGULAR_FACTOR);
}

/**
 * 한 시나리오의 1회/연 운임을 계산한다.
 *
 * @param scenario 시나리오 입력(역할 태깅된 stops + 차종 + 스케줄 + 빈도)
 * @param metrics 경로 메트릭. 시나리오에 routeMetrics가 있으면 그것을 우선.
 */
export function calculateScenarioQuote(
  scenario: QuoteScenario,
  metrics?: RouteMetrics
): ScenarioQuoteResult {
  const resolved: RouteMetrics =
    scenario.routeMetrics ?? metrics ?? { km: 0, driveMinutes: 0, dwellMinutes: 0, stopsCount: 0 };

  const counts = countStopRoles(scenario.stops);
  const vehicle = toVehicleKey(scenario.vehicleType);
  const isRegular = scenario.scheduleType === 'regular';

  const stopsCount =
    Number.isFinite(resolved.stopsCount) && resolved.stopsCount > 0
      ? resolved.stopsCount
      : deriveStopsCount(counts.totalStops);

  // ── 단건(per-job) 요금제: 거리 구간표 + 중간 경유지 정액. 유류분은 구간표에 내재. ──
  const perJobBase = isRegular
    ? perJobRegularPrice(vehicle, resolved.km)
    : perJobBasePrice(vehicle, resolved.km);
  const perJobStopFee = resolveStopFee(vehicle, stopsCount, isRegular);
  const perJobTotal = perJobBase + perJobStopFee;

  // ── 시간당(hourly) 요금제: 30분 단위 과금 × 시간당 단가 + 유류할증(초과거리). ──
  // quote-calculation(지도/패널)과 동일 공식을 써서 카드와 패널 금액이 일치하도록 한다.
  const totalMinutes = resolved.driveMinutes + resolved.dwellMinutes;
  const billMinutes = roundUpTo30Minutes(totalMinutes);
  const ratePerHour = pickHourlyRate(vehicle, billMinutes);
  const hourlyBase = Math.round(ratePerHour * (billMinutes / 60));
  const hourlyFuel = fuelSurchargeHourlyCorrect(vehicle, resolved.km, billMinutes);
  const hourlyTotal = hourlyBase + hourlyFuel;

  // ── 기본 추천은 "옹고잉 유리" = 두 요금제 중 높은 쪽. (화주에게는 둘 다 제시) ──
  const recommendedPlan: 'hourly' | 'perJob' = hourlyTotal >= perJobTotal ? 'hourly' : 'perJob';
  const oneTimePrice = recommendedPlan === 'hourly' ? hourlyTotal : perJobTotal;
  const annualPrice = annualizePrice(oneTimePrice, scenario.frequency);
  const annualVisitsCount = scenario.frequency ? annualVisits(scenario.frequency) : 1;

  const breakdown =
    recommendedPlan === 'hourly'
      ? { base: hourlyBase, stopFee: 0, fuelSurcharge: hourlyFuel, annualVisits: annualVisitsCount }
      : { base: perJobBase, stopFee: perJobStopFee, fuelSurcharge: 0, annualVisits: annualVisitsCount };

  return {
    label: scenario.label,
    vehicleType: scenario.vehicleType,
    scheduleType: scenario.scheduleType,
    metrics: { ...resolved, stopsCount },
    counts,
    oneTimePrice,
    annualPrice,
    frequencyLabel: formatFrequency(scenario.frequency),
    recommendedPlan,
    plans: {
      hourly: {
        total: hourlyTotal,
        billMinutes,
        ratePerHour,
        base: hourlyBase,
        fuelSurcharge: hourlyFuel,
      },
      perJob: {
        total: perJobTotal,
        base: perJobBase,
        stopFee: perJobStopFee,
      },
    },
    breakdown,
  };
}
