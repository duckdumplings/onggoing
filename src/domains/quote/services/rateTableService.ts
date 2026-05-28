import 'server-only';

import {
  FUEL_SURCHARGE_HOURLY,
  HOURLY_RATE_EFFECTIVE_FROM,
  HOURLY_RATE_TABLE,
  type Vehicle,
} from '@/domains/quote/pricing';
import { createServerClient } from '@/libs/supabase-client';

export type RateTierRow = { maxMinutes: number; ratePerHour: number };
export type RateTablePayload = {
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

export type ResolvedRateTable = {
  vehicle: Vehicle;
  effectiveFrom: string;
  source: 'database' | 'static-fallback';
  sourceDoc: string;
  payload: RateTablePayload;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: ResolvedRateTable; expiresAt: number }>();

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
    sourceDoc: '[26년]옹고잉 배송 서비스 제공 운임(25.6.1).pptx (static fallback)',
    payload: staticFallbackPayload(vehicle),
  };
}

/**
 * 효력 있는 시간당 운임표를 가져온다.
 * 1) DB rate_tables 에서 효력 있는 가장 최신 행을 조회 (60초 in-memory 캐시)
 * 2) 실패하거나 행이 없으면 코드 정적 fallback (HOURLY_RATE_TABLE)
 *
 * 절대 throw 하지 않는다 — 운임표는 견적 핵심 경로이므로 fallback 으로 견적이 멈추면 안 됨.
 */
export async function resolveHourlyRateTable(
  vehicle: Vehicle,
  asOfDate: Date = new Date(),
): Promise<ResolvedRateTable> {
  const asOfIso = asOfDate.toISOString().slice(0, 10);
  const cacheKey = `${vehicle}|${asOfIso}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('rate_tables')
      .select('vehicle_type, pricing_plan, effective_from, effective_to, source_doc, payload')
      .eq('vehicle_type', vehicle)
      .eq('pricing_plan', 'hourly')
      .lte('effective_from', asOfIso)
      .or(`effective_to.is.null,effective_to.gte.${asOfIso}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[rateTableService] DB 조회 실패, 정적 fallback 사용:', error.message);
      const fallback = staticFallback(vehicle);
      cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
      return fallback;
    }

    if (!data || !data.payload) {
      const fallback = staticFallback(vehicle);
      cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
      return fallback;
    }

    const resolved: ResolvedRateTable = {
      vehicle,
      effectiveFrom: String(data.effective_from),
      source: 'database',
      sourceDoc: String(data.source_doc || ''),
      payload: data.payload as RateTablePayload,
    };
    cache.set(cacheKey, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
    return resolved;
  } catch (e) {
    console.warn('[rateTableService] 예외 발생, 정적 fallback 사용:', e instanceof Error ? e.message : e);
    const fallback = staticFallback(vehicle);
    cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }
}

/**
 * resolveHourlyRateTable 결과에서 시간당 단가를 lookup 한다. pickHourlyRate 와 동일한 의미.
 */
export function pickHourlyRateFromPayload(payload: RateTablePayload, billMinutes: number): number {
  for (const tier of payload.tiers) {
    if (billMinutes <= tier.maxMinutes) return tier.ratePerHour;
  }
  return payload.tiers[payload.tiers.length - 1].ratePerHour;
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
 * 현재는 코드 fuelSurchargeHourlyCorrect 에 직접 의존하지만, 시점별 비교를 위해 export.
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
