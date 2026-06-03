export type Vehicle = 'ray' | 'starex';

// 운임표 시행일: 2025-06-01 (참고 자료: "[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx")
// 30분 단위 lookup, 시간당 단가 × 과금시간(분/60)으로 시간당 요금 산출.
// 스타렉스 2시간(36,000) > 2시간 반(34,000) 인버전 구간은 운임표 원본 의도 그대로 유지.
//
// [운영팀 컴펀 이력 — 2026-05-29]
// 스타렉스 3시간 반: PPTX 원본 일일 94,500 / 20일 1,890,000 표기는 오타.
// 정답은 시간당 30,000원 × 3.5h = 105,000원 / 20일 2,100,000원 (영업/운영팀 확인 완료).
// 코드와 DB rate_tables 모두 정답 기준으로 적용됨.
export const HOURLY_RATE_EFFECTIVE_FROM = '2025-06-01';

export const HOURLY_RATE_TABLE: Record<Vehicle, Array<{ maxMinutes: number; ratePerHour: number }>> = {
  ray: [
    { maxMinutes: 120, ratePerHour: 26500 },
    { maxMinutes: 150, ratePerHour: 26500 },
    { maxMinutes: 180, ratePerHour: 23000 },
    { maxMinutes: 210, ratePerHour: 23000 },
    { maxMinutes: 240, ratePerHour: 22000 },
    { maxMinutes: 270, ratePerHour: 22000 },
    { maxMinutes: 300, ratePerHour: 21000 },
    { maxMinutes: 330, ratePerHour: 21000 },
    { maxMinutes: 360, ratePerHour: 21000 },
    { maxMinutes: 390, ratePerHour: 21000 },
    { maxMinutes: 420, ratePerHour: 21000 },
    { maxMinutes: 450, ratePerHour: 21000 },
    { maxMinutes: 480, ratePerHour: 21000 },
  ],
  starex: [
    { maxMinutes: 120, ratePerHour: 36000 },
    { maxMinutes: 150, ratePerHour: 34000 },
    { maxMinutes: 180, ratePerHour: 30000 },
    { maxMinutes: 210, ratePerHour: 30000 },
    { maxMinutes: 240, ratePerHour: 27000 },
    { maxMinutes: 270, ratePerHour: 27000 },
    { maxMinutes: 300, ratePerHour: 26000 },
    { maxMinutes: 330, ratePerHour: 26000 },
    { maxMinutes: 360, ratePerHour: 25000 },
    { maxMinutes: 390, ratePerHour: 25000 },
    { maxMinutes: 420, ratePerHour: 25000 },
    { maxMinutes: 450, ratePerHour: 25000 },
    { maxMinutes: 480, ratePerHour: 25000 },
  ],
};

export const FUEL_SURCHARGE_HOURLY: Array<{ toKm: number; ray: number; starex: number }> = [
  { toKm: 10, ray: 2000, starex: 2800 },
  { toKm: 20, ray: 4000, starex: 5600 },
  { toKm: 30, ray: 6000, starex: 8400 },
  { toKm: 40, ray: 8000, starex: 11200 },
];

export const STOP_FEE: Record<Vehicle, number> = {
  ray: 5000,
  starex: 7000,
};

export const PER_JOB_TABLE: Array<{ fromKm: number; toKm: number; ray: number; starex: number }> = [
  { fromKm: 0, toKm: 5, ray: 24000, starex: 31000 },
  { fromKm: 5, toKm: 10, ray: 27000, starex: 34000 },
  { fromKm: 10, toKm: 15, ray: 30000, starex: 37000 },
  { fromKm: 15, toKm: 20, ray: 33000, starex: 40000 },
  { fromKm: 20, toKm: 25, ray: 36000, starex: 43000 },
  // 25km 초과 시 1,000원 단위로 깔끔하게 계산
  { fromKm: 25, toKm: 30, ray: 40000, starex: 48000 },
  { fromKm: 30, toKm: 35, ray: 45000, starex: 53000 },
  { fromKm: 35, toKm: 40, ray: 50000, starex: 58000 },
  { fromKm: 40, toKm: 45, ray: 55000, starex: 63000 },
  { fromKm: 45, toKm: 50, ray: 60000, starex: 68000 },
  { fromKm: 50, toKm: 55, ray: 65000, starex: 73000 },
  { fromKm: 55, toKm: 60, ray: 70000, starex: 78000 },
];

// PER_JOB_OVERAGE_PER_KM 제거 - 1,000원 단위 테이블 기반 계산으로 변경

export function pickHourlyRate(vehicle: Vehicle, billMinutes: number): number {
  const table = HOURLY_RATE_TABLE[vehicle];
  for (const row of table) {
    if (billMinutes <= row.maxMinutes) return row.ratePerHour;
  }
  return table[table.length - 1].ratePerHour;
}

export type HourlyTierAdvice = {
  vehicle: Vehicle;
  currentBillMinutes: number;
  currentRatePerHour: number;
  currentDailyFare: number;
  suggestedBillMinutes: number;
  suggestedRatePerHour: number;
  suggestedDailyFare: number;
  /** 시간당 단가 변화 (음수면 단가 인하) */
  ratePerHourDelta: number;
  /** 일일 운임 변화 (보통 양수: 추가 30분 작업분의 비용) */
  dailyFareDelta: number;
  /** 화주/영업 응답에 그대로 붙일 한 줄 안내 */
  message: string;
};

/**
 * 같은 차종 안에서 30분을 늘렸을 때 시간당 단가가 더 떨어지는 인버전 구간을 찾는다.
 * 스타렉스 2시간(36,000원/h) → 2.5시간(34,000원/h)처럼 단가가 내려가는 다음 구간이
 * 있으면, "30분 더 늘리면 단가가 X원/h 떨어진다"는 영업 권유 문구를 만든다.
 */
export function suggestCheaperNextTier(vehicle: Vehicle, billMinutes: number): HourlyTierAdvice | null {
  if (billMinutes <= 0) return null;
  const currentBill = Math.max(120, Math.ceil(billMinutes / 30) * 30);
  if (currentBill >= 480) return null;
  const nextBill = currentBill + 30;

  const currentRate = pickHourlyRate(vehicle, currentBill);
  const suggestedRate = pickHourlyRate(vehicle, nextBill);
  if (suggestedRate >= currentRate) return null;

  const currentDaily = Math.round((currentBill / 60) * currentRate);
  const suggestedDaily = Math.round((nextBill / 60) * suggestedRate);
  const ratePerHourDelta = suggestedRate - currentRate;
  const dailyFareDelta = suggestedDaily - currentDaily;

  const formatWon = (v: number) => `${Math.abs(v).toLocaleString('ko-KR')}원`;
  const labelHours = (m: number) =>
    m % 60 === 0 ? `${m / 60}시간` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
  const deltaText =
    dailyFareDelta > 0
      ? `30분 추가 비용 +${formatWon(dailyFareDelta)}`
      : dailyFareDelta < 0
        ? `${formatWon(dailyFareDelta)} 절감`
        : '일일 운임 동일';

  const message =
    `${labelHours(nextBill)} 계약으로 늘리면 시간당 단가가 ` +
    `${currentRate.toLocaleString('ko-KR')}원 → ${suggestedRate.toLocaleString('ko-KR')}원으로 ` +
    `${formatWon(ratePerHourDelta)}/h 낮아져요 (${deltaText}).`;

  return {
    vehicle,
    currentBillMinutes: currentBill,
    currentRatePerHour: currentRate,
    currentDailyFare: currentDaily,
    suggestedBillMinutes: nextBill,
    suggestedRatePerHour: suggestedRate,
    suggestedDailyFare: suggestedDaily,
    ratePerHourDelta,
    dailyFareDelta,
    message,
  };
}

// 과금시간을 30분 단위로 올림하는 함수
export function roundUpTo30Minutes(minutes: number): number {
  // 최소 120분(2시간) 보장
  const minMinutes = Math.max(minutes, 120);

  // 30분 단위로 올림
  return Math.ceil(minMinutes / 30) * 30;
}

// 유류할증(시간당 요금제): 과금시간×10km 포함거리, 초과분 10km당 정액(레이 2,000 / 스타렉스 2,800).
// 시간당 요금제의 유일한 유류할증 계산 경로. (구 거리-단독 fuelSurchargeHourly는 2026-06 제거)
export function fuelSurchargeHourlyCorrect(vehicle: Vehicle, km: number, billMinutes: number): number {
  // 기본거리 = 과금시간 × 10km
  const baseDistance = (billMinutes / 60) * 10;

  // 기본거리 이내면 유류할증 없음
  if (km <= baseDistance) return 0;

  // 초과거리 = 총거리 - 기본거리
  const excessDistance = km - baseDistance;

  // 초과거리가 10km 이하면 첫 번째 구간 요금
  if (excessDistance <= 10) {
    return vehicle === 'ray' ? 2000 : 2800;
  }

  // 10km 초과 시 10km 단위로 추가 요금
  const extraBins = Math.ceil(excessDistance / 10);
  const stepRay = 2000;
  const stepStarex = 2800;

  return vehicle === 'ray' ? stepRay * extraBins : stepStarex * extraBins;
}

// 차종별 연비 (km/L). 레이 8km/L, 스타렉스 6km/L.
export const FUEL_EFFICIENCY_KM_PER_L: Record<Vehicle, number> = {
  ray: 8,
  starex: 6,
};

// 기본 유가(L당 원). 운영팀이 현재 유가로 갱신할 수 있도록 단일 진실원으로 둔다.
// 호출부는 NEXT_PUBLIC_FUEL_PRICE_PER_LITER 등으로 현재 유가를 주입할 수 있다.
// 라이브 유가(오피넷) 연동 전까지 쓰는 고정 가정값.
export const DEFAULT_FUEL_PRICE_PER_LITER = 2000;

// 실제 예상 유류비 계산 (요금제 청구액과 별개의 운영 참고치 — 유류할증과 다른 개념).
// 현재 유가(fuelPricePerLiter)를 주입하면 그 유가 기준으로 실주행 연료비를 추정한다.
export function estimatedFuelCost(
  vehicle: Vehicle,
  km: number,
  fuelPricePerLiter: number = DEFAULT_FUEL_PRICE_PER_LITER
): number {
  const fuelEfficiency = FUEL_EFFICIENCY_KM_PER_L[vehicle];
  const price = Number.isFinite(fuelPricePerLiter) && fuelPricePerLiter > 0 ? fuelPricePerLiter : DEFAULT_FUEL_PRICE_PER_LITER;
  const fuelConsumption = km / fuelEfficiency;
  return Math.round(fuelConsumption * price);
}

// 통행료는 거리 기반 추정을 쓰지 않는다(견적서 청구 항목이 아니라 실주행 하이패스 실비 정산).
// 표시용 통행료는 Tmap 경로 실측(route-optimization)만 사용한다.

export function perJobBasePrice(vehicle: Vehicle, km: number): number {
  for (const r of PER_JOB_TABLE) {
    if (km >= r.fromKm && km <= r.toKm) return vehicle === 'ray' ? r.ray : r.starex;
  }
  // 60km 초과 시 마지막 구간 요금 사용 (추가 요금 없음)
  const last = PER_JOB_TABLE[PER_JOB_TABLE.length - 1];
  return vehicle === 'ray' ? last.ray : last.starex;
}

export function perJobRegularPrice(vehicle: Vehicle, km: number): number {
  // 정기 요금: 레이 정기는 스타렉스 요금표 사용, 스타렉스 정기는 기본 요금 + 가산율
  if (vehicle === 'ray') {
    // 레이 정기: 스타렉스 요금표 그대로 사용
    for (const r of PER_JOB_TABLE) {
      if (km >= r.fromKm && km <= r.toKm) return r.starex;
    }
    // 60km 초과 시 마지막 구간 요금 사용 (추가 요금 없음)
    const last = PER_JOB_TABLE[PER_JOB_TABLE.length - 1];
    return last.starex;
  } else {
    // 스타렉스 정기: 기본 요금에 정기 가산율 적용 (1.2배)
    const basePrice = perJobBasePrice(vehicle, km);
    return Math.round(basePrice * 1.2);
  }
}


