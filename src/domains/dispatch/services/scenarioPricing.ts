/**
 * 시나리오 견적 계산: 역할(pickup/drop) 인지 + 정기 빈도 연환산.
 *
 * 공식 대표 견적은 시간당 운임표로 산출하고, 단건(per-job)은 요청 시 참고값으로 보존한다.
 * 본 모듈은 경로 메트릭과 시나리오를 받아
 * 1회 운임과 연 환산 운임을 산출한다. 요율 자체는 src/domains/quote/pricing.ts를
 * 단일 진실원으로 재사용한다(이중 정의 방지).
 */

import {
  perJobBasePrice,
  perJobRegularPrice,
  PER_JOB_REGULAR_FACTOR,
  pickHourlyRate,
  roundUpTo30Minutes,
  calculateHourlyFuelSurcharge,
  isHourlyRateSupported,
  isPerJobRateSupported,
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
import {
  calculateFuelSurchargeFromPayload,
  calculatePerJobReferenceFromPayloads,
  pickHourlyRateFromPayload,
  type FuelSurchargePayload,
  type HourlyRateTablePayload,
  type PerJobRateTablePayload,
} from '@/domains/quote/services/rateTableCalculations';

export type ScenarioRateTables = {
  hourly: HourlyRateTablePayload;
  fuelSurcharge: FuelSurchargePayload;
  perJob: PerJobRateTablePayload;
  starexPerJob: PerJobRateTablePayload;
};

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
  metrics?: RouteMetrics,
  rateTables?: ScenarioRateTables,
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
  const perJobReference = rateTables
    ? calculatePerJobReferenceFromPayloads({
        vehicle,
        scheduleType: scenario.scheduleType,
        km: resolved.km,
        stopsCount,
        own: rateTables.perJob,
        starex: rateTables.starexPerJob,
      })
    : (() => {
        const available = isPerJobRateSupported(resolved.km);
        const base = available
          ? isRegular
            ? perJobRegularPrice(vehicle, resolved.km)
            : perJobBasePrice(vehicle, resolved.km)
          : null;
        const stopFee = available ? resolveStopFee(vehicle, stopsCount, isRegular) : null;
        return {
          available,
          referenceOnly: true as const,
          total: base != null && stopFee != null ? base + stopFee : null,
          base,
          stopFee,
          ...(!available
            ? { unavailableReason: '단건 운임표는 60km까지만 참고 견적을 지원합니다.' }
            : {}),
        };
      })();

  // ── 시간당(hourly) 요금제: 30분 단위 과금 × 시간당 단가 + 유류할증(초과거리). ──
  // quote-calculation(지도/패널)과 동일 공식을 써서 카드와 패널 금액이 일치하도록 한다.
  // 구속시간 = 주행 + 체류 + 현장 대기(조기배송 금지). 대기 미지정 시 0(과거 동작).
  const totalMinutes = resolved.driveMinutes + resolved.dwellMinutes + (resolved.waitMinutes ?? 0);
  const billMinutes = rateTables
    ? Math.max(
        rateTables.hourly.minBillMinutes,
        Math.ceil(totalMinutes / rateTables.hourly.unitMinutes) * rateTables.hourly.unitMinutes,
      )
    : roundUpTo30Minutes(totalMinutes);
  if (!rateTables && !isHourlyRateSupported(vehicle, billMinutes)) {
    throw new RangeError(`시간당 운임표 범위 초과: ${billMinutes}분 운행은 운영팀 확인이 필요합니다.`);
  }
  const ratePerHour = rateTables
    ? pickHourlyRateFromPayload(rateTables.hourly, billMinutes)
    : pickHourlyRate(vehicle, billMinutes);
  const hourlyBase = Math.round(ratePerHour * (billMinutes / 60));
  const fuelSurchargeBreakdown = rateTables
    ? calculateFuelSurchargeFromPayload(
        vehicle,
        rateTables.fuelSurcharge,
        resolved.km,
        billMinutes,
      )
    : calculateHourlyFuelSurcharge(vehicle, resolved.km, billMinutes);
  const hourlyFuel = fuelSurchargeBreakdown.total;
  const hourlyTotal = hourlyBase + hourlyFuel;

  // 공식 견적은 시간당 운임 기준. 단건은 사용자가 요청한 경우에만 참고값으로 노출한다.
  const recommendedPlan = 'hourly' as const;
  const oneTimePrice = hourlyTotal;
  const annualPrice = annualizePrice(oneTimePrice, scenario.frequency);
  const annualVisitsCount = scenario.frequency ? annualVisits(scenario.frequency) : 1;

  const breakdown = {
    base: hourlyBase,
    stopFee: 0,
    fuelSurcharge: hourlyFuel,
    annualVisits: annualVisitsCount,
  };

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
    includePerJobReference: Boolean(scenario.includePerJobReference),
    plans: {
      hourly: {
        total: hourlyTotal,
        billMinutes,
        ratePerHour,
        base: hourlyBase,
        fuelSurcharge: hourlyFuel,
        fuelSurchargeBreakdown,
      },
      perJob: {
        ...perJobReference,
      },
    },
    breakdown,
  };
}
