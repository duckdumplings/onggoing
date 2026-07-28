/**
 * route-optimization 응답 summary + 경유지 수 → 기본 견적(순수 계산).
 *
 * TmapMainMap.tsx 의 routeQuoteDetail useMemo 에서 기본(비인터랙티브) 계산만
 * 그대로 추출한 것이다. 슬라이더/시나리오 4조합/aiInsight 등 UI 전용 파생은 제외한다.
 * DOM/next/React 의존이 없어 서버·클라이언트 어디서든 호출할 수 있다.
 *
 * 가격 함수는 TmapMainMap 과 동일하게 @/domains/quote/pricing 의 실제 export 를 사용한다.
 */
import {
  STOP_FEE,
  fuelSurchargeHourlyCorrect,
  perJobBasePrice,
  pickHourlyRate,
  roundUpTo30Minutes,
} from '@/domains/quote/pricing';
import { toVehicleKey } from '@/domains/dispatch/types/routePlan';

export interface RouteQuote {
  vehicleTypeLabel: '레이' | '스타렉스';
  distanceKm: number; // 소수1자리
  driveMinutes: number; // ceil(travelTime/60)
  dwellTotalMin: number; // round(dwellTime/60)
  waitTotalMin: number; // round(waitTime/60) — 조기배송 금지 현장 대기(구속시간 포함)
  totalBillMinutes: number; // driveMinutes + dwellTotalMin + waitTotalMin
  billMinutes: number; // roundUpTo30Minutes(totalBillMinutes)
  destinationCount: number; // max(0, waypointCount - 1)
  hourlyTotal: number;
  perJobTotal: number;
  recommendedPlan: 'hourly' | 'perJob'; // hourlyTotal <= perJobTotal ? hourly : perJob
  totalPrice: number;
  hourlyBreakdown: { billMinutes: number; hourlyRate: number; base: number; fuelSurcharge: number };
  perJobBreakdown: { base: number; stopFee: number; effectiveStopsCount: number };
}

/**
 * summary 로부터 기본 견적을 계산한다. summary 가 없으면 null.
 *
 * summary 필드(TmapMainMap 과 동일하게 사용):
 * - totalDistance: 총 거리(m)
 * - travelTime || totalTime: 이동 시간(sec)
 * - dwellTime: 체류 시간 합(sec)
 * - vehicleTypeCode: '2' 이면 스타렉스, 그 외 레이
 */
export function computeRouteQuote(summary: any, waypointCount: number): RouteQuote | null {
  if (!summary) return null;

  const totalDistanceM = Number(summary.totalDistance || 0);
  const totalTimeSec = Number(summary.travelTime || summary.totalTime || 0);
  const destinationCount = Math.max(0, waypointCount - 1);
  const dwellTotalMin = Math.round(Number(summary.dwellTime || 0) / 60);
  const waitTotalMin = Math.round(Number(summary.waitTime || 0) / 60);
  const vehicleTypeLabel: '레이' | '스타렉스' = summary?.vehicleTypeCode === '2' ? '스타렉스' : '레이';
  const vehicleKey = toVehicleKey(vehicleTypeLabel);

  const distanceKm = totalDistanceM / 1000;
  const driveMinutes = Math.ceil(totalTimeSec / 60);
  const totalBillMinutes = driveMinutes + dwellTotalMin + waitTotalMin;

  const billMinutes = roundUpTo30Minutes(totalBillMinutes);
  const hourlyRate = pickHourlyRate(vehicleKey, billMinutes);
  const hourlyBase = Math.round((billMinutes / 60) * hourlyRate);
  const hourlyFuelSurcharge = fuelSurchargeHourlyCorrect(vehicleKey, distanceKm, billMinutes);
  const hourlyTotal = hourlyBase + hourlyFuelSurcharge;

  const perJobBase = perJobBasePrice(vehicleKey, distanceKm);
  const effectiveStopsCount = Math.max(0, destinationCount - 1);
  const perJobStopFee = effectiveStopsCount * STOP_FEE[vehicleKey];
  const perJobTotal = perJobBase + perJobStopFee;

  const recommendedPlan: 'hourly' | 'perJob' = hourlyTotal <= perJobTotal ? 'hourly' : 'perJob';
  const totalPrice = recommendedPlan === 'hourly' ? hourlyTotal : perJobTotal;

  return {
    vehicleTypeLabel,
    distanceKm: Number(distanceKm.toFixed(1)),
    driveMinutes,
    dwellTotalMin,
    waitTotalMin,
    totalBillMinutes,
    billMinutes,
    destinationCount,
    hourlyTotal,
    perJobTotal,
    recommendedPlan,
    totalPrice,
    hourlyBreakdown: {
      billMinutes,
      hourlyRate,
      base: hourlyBase,
      fuelSurcharge: hourlyFuelSurcharge,
    },
    perJobBreakdown: {
      base: perJobBase,
      stopFee: perJobStopFee,
      effectiveStopsCount,
    },
  };
}
