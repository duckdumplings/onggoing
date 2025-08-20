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
];

export const PER_JOB_OVERAGE_PER_KM: Record<Vehicle, number> = {
  ray: Number(process.env.PER_JOB_OVERAGE_RAY_PER_KM ?? 1000),
  starex: Number(process.env.PER_JOB_OVERAGE_STAREX_PER_KM ?? 1200),
};

export function pickHourlyRate(vehicle: Vehicle, billMinutes: number): number {
  const table = HOURLY_RATE_TABLE[vehicle];
  for (const row of table) {
    if (billMinutes <= row.maxMinutes) return row.ratePerHour;
  }
  return table[table.length - 1].ratePerHour;
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

export function perJobBasePrice(vehicle: Vehicle, km: number): number {
  for (const r of PER_JOB_TABLE) {
    if (km >= r.fromKm && km <= r.toKm) return vehicle === 'ray' ? r.ray : r.starex;
  }
  // 초과분
  const last = PER_JOB_TABLE[PER_JOB_TABLE.length - 1];
  const overKm = Math.max(0, km - last.toKm);
  const base = vehicle === 'ray' ? last.ray : last.starex;
  return Math.round(base + overKm * PER_JOB_OVERAGE_PER_KM[vehicle]);
}

export function perJobRegularPrice(vehicle: Vehicle, km: number): number {
  // 정기 요금: 레이 정기는 스타렉스 요금표 사용, 스타렉스 정기는 기본 요금 + 가산율
  if (vehicle === 'ray') {
    // 레이 정기: 스타렉스 요금표 그대로 사용
    for (const r of PER_JOB_TABLE) {
      if (km >= r.fromKm && km <= r.toKm) return r.starex;
    }
    // 초과분
    const last = PER_JOB_TABLE[PER_JOB_TABLE.length - 1];
    const overKm = Math.max(0, km - last.toKm);
    return Math.round(last.starex + overKm * PER_JOB_OVERAGE_PER_KM.starex);
  } else {
    // 스타렉스 정기: 기본 요금에 정기 가산율 적용
    const basePrice = perJobBasePrice(vehicle, km);
    const regularFactor = Number(process.env.PER_JOB_REGULAR_FACTOR ?? 1.2);
    return Math.round(basePrice * regularFactor);
  }
}


