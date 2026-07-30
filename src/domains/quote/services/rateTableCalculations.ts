import type { Vehicle } from '@/domains/quote/pricing';

export type HourlyRateTablePayload = {
  currency: string;
  unitMinutes: number;
  minBillMinutes: number;
  tiers: Array<{
    maxMinutes: number;
    ratePerHour: number;
    dailyFare?: number;
    monthly20dFare?: number;
  }>;
};

export type FuelSurchargePayload = {
  currency: string;
  baseKmPerHour: number;
  stepKm: number;
  stepCharge: number;
  bins: Array<{ toKm: number; charge: number }>;
};

export type PerJobRateTablePayload = {
  currency: string;
  maxKm: number;
  stopFee: number;
  tiers: Array<{ fromKm: number; toKm: number; baseFare: number }>;
  regularPolicy:
    | { mode: 'vehicle-table'; vehicle: 'starex' }
    | { mode: 'factor'; factor: number };
};

export function pickHourlyRateFromPayload(
  payload: HourlyRateTablePayload,
  billMinutes: number,
): number {
  for (const tier of payload.tiers) {
    if (billMinutes <= tier.maxMinutes) return tier.ratePerHour;
  }
  const maxMinutes = payload.tiers[payload.tiers.length - 1]?.maxMinutes ?? 0;
  throw new RangeError(`시간당 운임표는 ${maxMinutes}분까지만 자동 견적을 지원합니다.`);
}

export function calculateFuelSurchargeFromPayload(
  vehicle: Vehicle,
  payload: FuelSurchargePayload,
  km: number,
  billMinutes: number,
) {
  const actualDistanceKm = Math.max(0, Number(km) || 0);
  const includedDistanceKm = (billMinutes / 60) * payload.baseKmPerHour;
  const excessDistanceKm = Math.max(0, actualDistanceKm - includedDistanceKm);
  const chargedBins =
    excessDistanceKm > 0 ? Math.ceil(excessDistanceKm / payload.stepKm) : 0;
  return {
    vehicle,
    actualDistanceKm,
    includedDistanceKm,
    excessDistanceKm,
    stepKm: payload.stepKm,
    stepCharge: payload.stepCharge,
    chargedBins,
    total: chargedBins * payload.stepCharge,
  };
}

export function calculatePerJobReferenceFromPayloads(params: {
  vehicle: Vehicle;
  scheduleType: 'regular' | 'ad-hoc';
  km: number;
  stopsCount: number;
  own: PerJobRateTablePayload;
  starex: PerJobRateTablePayload;
}): {
  available: boolean;
  referenceOnly: true;
  total: number | null;
  base: number | null;
  stopFee: number | null;
  unavailableReason?: string;
} {
  const { vehicle, scheduleType, km, stopsCount, own, starex } = params;
  if (!Number.isFinite(km) || km < 0 || km > own.maxKm) {
    return {
      available: false,
      referenceOnly: true,
      total: null,
      base: null,
      stopFee: null,
      unavailableReason: `단건 운임표는 ${own.maxKm}km까지만 참고 견적을 지원합니다.`,
    };
  }
  const lookup = (payload: PerJobRateTablePayload) =>
    payload.tiers.find((tier) => km >= tier.fromKm && km <= tier.toKm)?.baseFare;
  let base: number | undefined;
  let stopFee: number;
  if (scheduleType === 'regular' && vehicle === 'ray') {
    base = lookup(starex);
    stopFee = starex.stopFee * Math.max(0, stopsCount);
  } else {
    base = lookup(own);
    const factor =
      scheduleType === 'regular' && own.regularPolicy.mode === 'factor'
        ? own.regularPolicy.factor
        : 1;
    if (base != null) base = Math.round(base * factor);
    stopFee = Math.round(own.stopFee * Math.max(0, stopsCount) * factor);
  }
  if (base == null) {
    return {
      available: false,
      referenceOnly: true,
      total: null,
      base: null,
      stopFee: null,
      unavailableReason: `${km}km에 해당하는 단건 운임 구간이 없습니다.`,
    };
  }
  return {
    available: true,
    referenceOnly: true,
    total: base + stopFee,
    base,
    stopFee,
  };
}
