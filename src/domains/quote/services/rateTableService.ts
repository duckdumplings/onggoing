import 'server-only';

import {
  FUEL_SURCHARGE_HOURLY,
  HOURLY_RATE_EFFECTIVE_FROM,
  HOURLY_RATE_TABLE,
  PER_JOB_REGULAR_FACTOR,
  PER_JOB_TABLE,
  STOP_FEE,
  type Vehicle,
} from '@/domains/quote/pricing';
import { createServerClient } from '@/libs/supabase-client';
import { formatKstDate } from '@/domains/dispatch/utils/kstDateTime';
import {
  calculateFuelSurchargeFromPayload,
  calculatePerJobReferenceFromPayloads,
  calculateRecurringHourlyTotals,
  pickHourlyRateFromPayload,
  type FuelSurchargePayload,
  type HourlyRateTablePayload,
  type PerJobRateTablePayload,
} from './rateTableCalculations';

export {
  calculateFuelSurchargeFromPayload,
  calculatePerJobReferenceFromPayloads,
  calculateRecurringHourlyTotals,
  pickHourlyRateFromPayload,
};
export type {
  FuelSurchargePayload,
  HourlyRateTablePayload,
  PerJobRateTablePayload,
} from './rateTableCalculations';

export type RateTierRow = { maxMinutes: number; ratePerHour: number };
export type RateTablePayload = HourlyRateTablePayload;

export type ResolvedTable<TPayload> = {
  vehicle: Vehicle;
  effectiveFrom: string;
  source: 'database' | 'static-fallback';
  sourceDoc: string;
  payload: TPayload;
};

export type ResolvedRateTable = ResolvedTable<RateTablePayload>;
export type ResolvedFuelSurchargeTable = ResolvedTable<FuelSurchargePayload>;
export type ResolvedPerJobRateTable = ResolvedTable<PerJobRateTablePayload>;

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: ResolvedTable<unknown>; expiresAt: number }>();
const SOURCE_DOC = '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx';

function staticFallbackPayload(vehicle: Vehicle): RateTablePayload {
  const tiers = HOURLY_RATE_TABLE[vehicle];
  return {
    currency: 'KRW',
    unitMinutes: 30,
    minBillMinutes: 120,
    tiers: tiers.map((t) => ({
      maxMinutes: t.maxMinutes,
      ratePerHour: t.ratePerHour,
      dailyFare: Math.round((t.maxMinutes / 60) * t.ratePerHour),
      monthly20dFare: Math.round((t.maxMinutes / 60) * t.ratePerHour) * 20,
    })),
  };
}

function staticFallback(vehicle: Vehicle): ResolvedRateTable {
  return {
    vehicle,
    effectiveFrom: HOURLY_RATE_EFFECTIVE_FROM,
    source: 'static-fallback',
    sourceDoc: `${SOURCE_DOC} (static fallback)`,
    payload: staticFallbackPayload(vehicle),
  };
}

function staticFuelFallback(vehicle: Vehicle): ResolvedFuelSurchargeTable {
  const stepCharge = vehicle === 'ray' ? 2000 : 2800;
  return {
    vehicle,
    effectiveFrom: HOURLY_RATE_EFFECTIVE_FROM,
    source: 'static-fallback',
    sourceDoc: `${SOURCE_DOC} (static fallback)`,
    payload: {
      currency: 'KRW',
      baseKmPerHour: 10,
      stepKm: 10,
      stepCharge,
      bins: staticFuelSurchargeBins(vehicle),
    },
  };
}

function staticPerJobFallback(vehicle: Vehicle): ResolvedPerJobRateTable {
  return {
    vehicle,
    effectiveFrom: HOURLY_RATE_EFFECTIVE_FROM,
    source: 'static-fallback',
    sourceDoc: `${SOURCE_DOC} (static fallback)`,
    payload: {
      currency: 'KRW',
      maxKm: PER_JOB_TABLE[PER_JOB_TABLE.length - 1].toKm,
      stopFee: STOP_FEE[vehicle],
      tiers: PER_JOB_TABLE.map((tier) => ({
        fromKm: tier.fromKm,
        toKm: tier.toKm,
        baseFare: vehicle === 'ray' ? tier.ray : tier.starex,
      })),
      regularPolicy:
        vehicle === 'ray'
          ? { mode: 'vehicle-table', vehicle: 'starex' }
          : { mode: 'factor', factor: PER_JOB_REGULAR_FACTOR },
    },
  };
}

function isHourlyPayload(value: unknown): value is RateTablePayload {
  const payload = value as RateTablePayload;
  return Boolean(
    payload &&
      Number.isFinite(payload.unitMinutes) &&
      payload.unitMinutes > 0 &&
      Number.isFinite(payload.minBillMinutes) &&
      payload.minBillMinutes > 0 &&
      Array.isArray(payload.tiers) &&
      payload.tiers.length > 0 &&
      payload.tiers.every(
        (tier) => Number.isFinite(tier.maxMinutes) && Number.isFinite(tier.ratePerHour),
      ),
  );
}

function isFuelPayload(value: unknown): value is FuelSurchargePayload {
  const payload = value as FuelSurchargePayload;
  return Boolean(
    payload &&
      Number.isFinite(payload.baseKmPerHour) &&
      payload.baseKmPerHour > 0 &&
      Number.isFinite(payload.stepKm) &&
      payload.stepKm > 0 &&
      Number.isFinite(payload.stepCharge) &&
      payload.stepCharge >= 0,
  );
}

function isPerJobPayload(value: unknown): value is PerJobRateTablePayload {
  const payload = value as PerJobRateTablePayload;
  return Boolean(
    payload &&
      Number.isFinite(payload.maxKm) &&
      payload.maxKm > 0 &&
      Number.isFinite(payload.stopFee) &&
      payload.stopFee >= 0 &&
      Array.isArray(payload.tiers) &&
      payload.tiers.length > 0 &&
      payload.tiers.every(
        (tier) =>
          Number.isFinite(tier.fromKm) &&
          Number.isFinite(tier.toKm) &&
          Number.isFinite(tier.baseFare),
      ),
  );
}

async function resolveEffectiveTable<TPayload>(
  vehicle: Vehicle,
  pricingPlan: 'hourly' | 'fuel_surcharge' | 'per_job',
  fallback: ResolvedTable<TPayload>,
  isPayload: (value: unknown) => value is TPayload,
  asOfDate: Date = new Date(),
): Promise<ResolvedTable<TPayload>> {
  const asOfIso = formatKstDate(asOfDate);
  const cacheKey = `${vehicle}|${pricingPlan}|${asOfIso}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as ResolvedTable<TPayload>;
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('rate_tables')
      .select('vehicle_type, pricing_plan, effective_from, effective_to, source_doc, payload')
      .eq('vehicle_type', vehicle)
      .eq('pricing_plan', pricingPlan)
      .lte('effective_from', asOfIso)
      .or(`effective_to.is.null,effective_to.gte.${asOfIso}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(`[rateTableService] ${pricingPlan} DB 조회 실패, 정적 fallback 사용:`, error.message);
      cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
      return fallback;
    }

    if (!data || !isPayload(data.payload)) {
      cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
      return fallback;
    }

    const resolved: ResolvedTable<TPayload> = {
      vehicle,
      effectiveFrom: String(data.effective_from),
      source: 'database',
      sourceDoc: String(data.source_doc || ''),
      payload: data.payload,
    };
    cache.set(cacheKey, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
    return resolved;
  } catch (e) {
    console.warn(`[rateTableService] ${pricingPlan} 예외, 정적 fallback 사용:`, e instanceof Error ? e.message : e);
    cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }
}

/**
 * 효력 있는 시간당 운임표를 가져온다. DB 실패·행 누락·payload 손상 시 검증된 정적표로 폴백한다.
 */
export async function resolveHourlyRateTable(
  vehicle: Vehicle,
  asOfDate: Date = new Date(),
): Promise<ResolvedRateTable> {
  return resolveEffectiveTable(vehicle, 'hourly', staticFallback(vehicle), isHourlyPayload, asOfDate);
}

export async function resolveFuelSurchargeTable(
  vehicle: Vehicle,
  asOfDate: Date = new Date(),
): Promise<ResolvedFuelSurchargeTable> {
  return resolveEffectiveTable(
    vehicle,
    'fuel_surcharge',
    staticFuelFallback(vehicle),
    isFuelPayload,
    asOfDate,
  );
}

export async function resolvePerJobRateTable(
  vehicle: Vehicle,
  asOfDate: Date = new Date(),
): Promise<ResolvedPerJobRateTable> {
  return resolveEffectiveTable(
    vehicle,
    'per_job',
    staticPerJobFallback(vehicle),
    isPerJobPayload,
    asOfDate,
  );
}

/**
 * 코드의 정적 HOURLY_RATE_TABLE 과 DB rate_tables 의 시드/현재 행이 일치하는지 검증.
 * 단가 개정 PR에서 두 곳을 따로 갱신해 빠지지 않도록 회귀 검증 진입점으로 사용.
 *
 * @returns 불일치 detail (없으면 빈 배열)
 */
export async function diffStaticVsDbHourlyTable(): Promise<
  Array<{ vehicle: Vehicle; field: string; staticValue: unknown; dbValue: unknown }>
> {
  const diffs: Array<{ vehicle: Vehicle; field: string; staticValue: unknown; dbValue: unknown }> = [];
  for (const vehicle of ['ray', 'starex'] as Vehicle[]) {
    const resolved = await resolveHourlyRateTable(vehicle, new Date(HOURLY_RATE_EFFECTIVE_FROM));
    if (resolved.source !== 'database') {
      diffs.push({
        vehicle,
        field: 'source',
        staticValue: 'expected database row',
        dbValue: resolved.source,
      });
      continue;
    }
    const staticTiers = HOURLY_RATE_TABLE[vehicle];
    const dbTiers = resolved.payload.tiers;
    if (staticTiers.length !== dbTiers.length) {
      diffs.push({
        vehicle,
        field: 'tiers.length',
        staticValue: staticTiers.length,
        dbValue: dbTiers.length,
      });
    }
    const len = Math.min(staticTiers.length, dbTiers.length);
    for (let i = 0; i < len; i++) {
      if (staticTiers[i].maxMinutes !== dbTiers[i].maxMinutes) {
        diffs.push({
          vehicle,
          field: `tiers[${i}].maxMinutes`,
          staticValue: staticTiers[i].maxMinutes,
          dbValue: dbTiers[i].maxMinutes,
        });
      }
      if (staticTiers[i].ratePerHour !== dbTiers[i].ratePerHour) {
        diffs.push({
          vehicle,
          field: `tiers[${i}].ratePerHour`,
          staticValue: staticTiers[i].ratePerHour,
          dbValue: dbTiers[i].ratePerHour,
        });
      }
    }
  }
  return diffs;
}

/**
 * 유류 할증표 정적 fallback (DB rate_tables 의 fuel_surcharge 행이 없을 때 사용).
 * DB 행이 없을 때도 같은 산식으로 안전하게 계산하기 위한 정적 payload.
 */
export function staticFuelSurchargeBins(vehicle: Vehicle): Array<{ toKm: number; charge: number }> {
  return FUEL_SURCHARGE_HOURLY.map((b) => ({
    toKm: b.toKm,
    charge: vehicle === 'ray' ? b.ray : b.starex,
  }));
}

/**
 * 캐시 비우기 (테스트/관리 도구 용).
 */
export function clearRateTableCache(): void {
  cache.clear();
}
