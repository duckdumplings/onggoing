export type Vehicle = 'ray' | 'starex';

export const HOURLY_RATE_TABLE: Record<Vehicle, Array<{ maxMinutes: number; ratePerHour: number }>> = {
  // 30분 스텝, 테이블 구간의 시간당 단가 × 과금시간(분/60)
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
    { maxMinutes: 120, ratePerHour: 35000 },
    { maxMinutes: 150, ratePerHour: 35000 },
    { maxMinutes: 180, ratePerHour: 29000 },
    { maxMinutes: 210, ratePerHour: 29000 },
    { maxMinutes: 240, ratePerHour: 26500 },
    { maxMinutes: 270, ratePerHour: 26500 },
    { maxMinutes: 300, ratePerHour: 25000 },
    { maxMinutes: 330, ratePerHour: 25000 },
    { maxMinutes: 360, ratePerHour: 24500 },
    { maxMinutes: 390, ratePerHour: 24500 },
    { maxMinutes: 420, ratePerHour: 24500 },
    { maxMinutes: 450, ratePerHour: 24500 },
    { maxMinutes: 480, ratePerHour: 24500 },
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

// 과금시간을 30분 단위로 올림하는 함수
export function roundUpTo30Minutes(minutes: number): number {
  // 최소 120분(2시간) 보장
  const minMinutes = Math.max(minutes, 120);

  // 30분 단위로 올림
  return Math.ceil(minMinutes / 30) * 30;
}

export function fuelSurchargeHourly(vehicle: Vehicle, km: number): number {
  for (const r of FUEL_SURCHARGE_HOURLY) {
    if (km <= r.toKm) return vehicle === 'ray' ? r.ray : r.starex;
  }
  // 40km 초과 시 10km 단위로 증분
  const last = FUEL_SURCHARGE_HOURLY[FUEL_SURCHARGE_HOURLY.length - 1];
  const stepRay = last.ray - FUEL_SURCHARGE_HOURLY[FUEL_SURCHARGE_HOURLY.length - 2].ray; // 2000
  const stepStarex = last.starex - FUEL_SURCHARGE_HOURLY[FUEL_SURCHARGE_HOURLY.length - 2].starex; // 2800
  const extraBins = Math.ceil((km - last.toKm) / 10);
  return (vehicle === 'ray' ? last.ray + stepRay * extraBins : last.starex + stepStarex * extraBins);
}

// 올바른 유류할증 계산 함수 (과금시간 기반)
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

// 실제 예상 유류비 계산 (견적에 포함되지 않음)
export function estimatedFuelCost(vehicle: Vehicle, km: number): number {
  // 차종별 연비 (km/L)
  const fuelEfficiency = vehicle === 'ray' ? 8 : 6; // 레이 8km/L, 스타렉스 6km/L

  // 현재 유류가 (L당 1,700원)
  const fuelPricePerLiter = 1700;

  // 소모 연료량 (L)
  const fuelConsumption = km / fuelEfficiency;

  // 예상 유류비
  return Math.round(fuelConsumption * fuelPricePerLiter);
}

// 실제 유료도로 하이패스 비용 계산 (견적에 포함됨)
export function highwayTollCost(km: number): number {
  // 고속도로 이용률 (전체 거리의 70% 가정)
  const highwayRatio = 0.7;
  const highwayDistance = km * highwayRatio;

  // 한국 유료도로 요금 체계 (2024년 기준)
  // - 경부선: 서울~부산 약 417km, 요금 약 25,000원 (약 60원/km)
  // - 경부선: 서울~대구 약 325km, 요금 약 19,000원 (약 58원/km)
  // - 중부선: 서울~대전 약 167km, 요금 약 10,000원 (약 60원/km)
  // - 영동선: 강릉~부산 약 400km, 요금 약 24,000원 (약 60원/km)
  // 평균적으로 km당 약 60원으로 계산

  const tollPerKm = 60;

  // 기본 요금 (최소 요금)
  const baseToll = 1000;

  // 거리별 요금 계산
  const distanceToll = Math.round(highwayDistance * tollPerKm);

  // 기본 요금과 거리 요금 중 높은 값 반환
  return Math.max(baseToll, distanceToll);
}

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


