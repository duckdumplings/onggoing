/**
 * 멀티 케이스 견적 보드 산출 서비스.
 *
 * 밥따봉식 메모(N권역 × 점심/저녁 × 요일 패턴)처럼 여러 케이스를 한꺼번에 요청할 때,
 * 케이스별로 경로(교통 반영 소요)+배송 마감 판정+견적+지도용 경로를 결정론적으로 산출하고
 * 월간/계약 롤업까지 한 번에 돌려준다. LLM은 입력 해석/케이스 분해만 하고, 수치는 전부 이 서비스가 만든다.
 *
 * 외부 API 가드(룰 §3): route-optimization 호출은 postRouteOptimizationCached(정규화 TTL 캐시)를 쓰고,
 * 케이스 폭증 시 Tmap 버스트를 막기 위해 동시성 풀(CASE_CONCURRENCY)로 제한한다.
 */

import { z } from 'zod';

import { geocodeStopAddresses } from '@/domains/dispatch/services/stopGeocoder';
import { applyExplicitReturnHints } from '@/domains/dispatch/services/explicitRoleHints';
import {
  buildDeadlineSeedDepartureAt,
  deriveDeadlineDepartureSuggestion,
  type DeadlineDepartureSuggestion,
} from '@/domains/dispatch/services/deadlineScheduler';
import {
  buildRolePayload,
  countIntermediateStops,
} from '@/domains/dispatch/services/rolePayload';
import { postRouteOptimizationCached, describeRouteOptFailure } from '@/domains/dispatch/services/routeOptCache';
import { buildQuotePackage, buildRiskAction, buildRiskReason } from '@/domains/dispatch/services/quotePackageBuilder';
import { annualizePrice, formatFrequency } from '@/domains/dispatch/utils/frequency';
import {
  type DeadlineTarget,
  nextIsoAtHHMM,
  kstHHmm,
  buildAddressRoleMap,
  pickTargetCompletionIso,
  judgeDeadline,
} from '@/domains/dispatch/utils/deliveryDeadline';
import {
  type OperatingPattern,
  countAverageMonthlyOperatingDays,
  countOperatingDays,
  consecutiveMonths,
  describeWeekdays,
} from '@/domains/dispatch/utils/monthlyBasis';
import type {
  Frequency,
  StopOperation,
  StopRole,
  StopSchedule,
} from '@/domains/dispatch/types/routePlan';
import { FrequencySchema, RouteStopSchema, toDomainStops } from '@/domains/quote/agent/workingMemory';
import type { QuotePackage, QuotePackageGroupRollup } from '@/domains/dispatch/types/quotePackage';

const CASE_CONCURRENCY = 4;

/** route-optimization이 시간제약 불가로 400을 낼 때의 에러 코드(불투명 실패 대신 infeasible로 유지). */
const TIME_CONSTRAINT_ERROR_CODES: readonly string[] = [
  'TIME_CONSTRAINT_VIOLATION',
  'DIRECT_FEASIBILITY_FAILED',
  'PHYSICALLY_IMPOSSIBLE_TIME',
];

/** 케이스 1건 입력 스키마(에이전트 도구가 그대로 재사용). */
export const CaseBoardCaseInputSchema = z.object({
  label: z.string().min(1).describe('표에 노출할 케이스 라벨. 예: "강동&잠실&송파&하남 점심".'),
  group: z.string().optional().describe('그룹핑 키(권역/라인). 같은 group은 한 묶음으로 표시. 예: "권역1".'),
  stops: z.array(RouteStopSchema).min(2).describe('역할 태깅된 경유지(수거/배송/반납). 월요일처럼 반납이 없으면 return을 넣지 마라.'),
  vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
  scheduleType: z.enum(['regular', 'ad-hoc']).default('regular'),
  planPreference: z
    .enum(['auto', 'hourly', 'perJob'])
    .default('hourly')
    .describe('하위호환 입력. 대표 운임은 항상 hourly이며 perJob은 단건 참고 요청으로만 해석한다.'),
  includePerJobReference: z
    .boolean()
    .default(false)
    .describe('사용자가 단건 운임 비교를 명시적으로 요청한 경우에만 true.'),
  departureTime: z.string().optional().describe('출발 시각 "HH:mm". 없고 마감이 있으면 시스템이 15분 안전여유로 권장 상차·출발을 역산한다.'),
  deadline: z.string().optional().describe('마감 시각 "HH:mm". 기준은 deadlineTarget(기본=마지막 배송 완료).'),
  deadlineTarget: z.enum(['delivery', 'return', 'final']).default('delivery'),
  frequency: FrequencySchema.optional(),
  operatingWeekdays: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .describe('이 라인이 운행하는 요일(0=일,1=월,...,6=토). 예: 월~토 점심=[1,2,3,4,5,6], 월~금 저녁=[1,2,3,4,5], 월요일만(반납없음 케이스)=[1]. 월 운행 횟수는 targetMonth 달력으로 시스템이 센다.'),
  includeHolidays: z
    .boolean()
    .optional()
    .describe('공휴일에도 운행하면 true(공휴일 포함). false면 운행 요일이어도 공휴일은 빼고 센다. 사용자가 "공휴일 포함"이라 하면 true.'),
  monthlyVisits: z
    .number()
    .positive()
    .optional()
    .describe('월간 운행 횟수 직접 지정(권장하지 않음). operatingWeekdays+targetMonth가 있으면 그 달력 계산이 우선한다. 둘 다 없을 때의 폴백.'),
  preserveOrder: z.boolean().default(false),
});

export type CaseBoardCaseInput = z.infer<typeof CaseBoardCaseInputSchema>;

export interface CaseBoardInput {
  cases: CaseBoardCaseInput[];
  contractMonths?: number;
  /** 월 산정 기준: calendar=대상 월 실제 달력, average=연간 평균 주수 기반 월 평균. */
  monthlyBasis?: 'calendar' | 'average';
  /** 월 고정 견적 기준 월("YYYY-MM"). 이 달의 실제 달력으로 운행 횟수를 센다. 없으면 다음 달. */
  targetMonth?: string;
  /** 케이스에 출발시각이 없을 때 쓸 폴백 ISO(견적-지도 일치용 고정 스냅샷). */
  departureFallback?: string;
  /** 역할 오분류 보정용 사용자 원문. 반납/복귀처럼 명시적인 힌트만 사용한다. */
  sourceText?: string;
}

export type DeadlineRiskGrade = 'safe' | 'caution' | 'danger' | 'recheck' | 'infeasible' | 'none';

export interface RateTableEvidence {
  source: 'database' | 'static-fallback';
  effectiveFrom: string;
  sourceDoc: string;
}

export interface CasePricingEvidence {
  hourly?: RateTableEvidence;
  fuelSurcharge?: RateTableEvidence;
  perJob?: RateTableEvidence;
}

/** 마감 여유(분) → 운영 리스크 등급. 단순 O/X 대신 현장 변수 여지를 등급으로 노출. */
function deadlineRiskGrade(slackMinutes: number | null | undefined, meetsDeadline: boolean | null | undefined): DeadlineRiskGrade {
  if (meetsDeadline === false) return 'infeasible';
  if (slackMinutes == null) return 'none';
  if (slackMinutes >= 60) return 'safe';
  if (slackMinutes >= 30) return 'caution';
  if (slackMinutes >= 15) return 'danger';
  return 'recheck';
}

export interface CaseSchematicPoint {
  lat: number;
  lng: number;
  role: StopRole;
}

export interface CaseTimelineEntry {
  seq: number;
  address: string | null;
  role: StopRole | null;
  arrival: string | null;
  departure: string | null;
  dwellMinutes: number | null;
  /** 조기배송 금지로 인한 현장 대기(분). 구속시간에 과금됨. */
  waitMinutes?: number | null;
  operations?: StopOperation[];
  schedule?: StopSchedule | null;
}

export interface CaseBoardCaseResult {
  id: string;
  label: string;
  group?: string;
  vehicleType: '레이' | '스타렉스';
  departureLabel?: string | null;
  km?: number;
  driveMinutes?: number;
  dwellMinutes?: number;
  waitMinutes?: number;
  /** 출발시각 예측(타임머신)을 시도한 구간 수. */
  predictionAttemptedSegments?: number;
  /** 예측 실패로 호출시점 교통으로 대체한 구간 수(>0이면 그만큼 소요가 비예측). */
  predictionFallbackSegments?: number;
  deadline?: string | null;
  deadlineTarget?: DeadlineTarget;
  /** 마지막 배송 완료 시각(마감 기본 기준). */
  deliveryArrival?: string | null;
  /** 반납 완료(=업무 종료) 시각. 반납 없으면 null. 마감 대상 아님. */
  returnArrival?: string | null;
  /** 상차 시각 미입력 시 배송 마감에서 역산한 권장 시각. */
  departureWasSuggested?: boolean;
  pickupStartLabel?: string | null;
  departureSafetyMinutes?: number | null;
  meetsDeadline?: boolean | null;
  deadlineSlackMinutes?: number | null;
  oneTimePrice?: number;
  recommendedPlan?: 'hourly';
  /** 단건 참고값 노출 여부. */
  includePerJobReference?: boolean;
  /** 하위호환 입력값. 대표 운임은 항상 시간당이다. */
  planPreference?: 'auto' | 'hourly' | 'perJob';
  hourlyTotal?: number;
  perJobTotal?: number;
  /** 시간당 산식 투명화: 과금분(30분 올림·최소 120), 시간당 단가, 유류할증. */
  billMinutes?: number | null;
  ratePerHour?: number | null;
  fuelSurcharge?: number | null;
  fuelSurchargeBreakdown?: {
    includedDistanceKm: number;
    excessDistanceKm: number;
    stepKm: number;
    stepCharge: number;
    chargedBins: number;
    total: number;
  } | null;
  /** 저장 견적에서 당시 시행 운임표와 fallback 여부를 재현하기 위한 근거. */
  pricingEvidence?: CasePricingEvidence;
  annualPrice?: number;
  monthlyTotal?: number;
  monthlyVisits?: number;
  /** 운행 요일 라벨(예: "월~토"). */
  operatingWeekdaysLabel?: string | null;
  /** 월 기준 근거 라벨(예: "2026-06 실제 달력 · 운행 24일"). */
  monthBasisLabel?: string | null;
  /** 계약 합산 재계산용 원본 패턴. */
  operatingWeekdays?: number[];
  includeHolidays?: boolean;
  /** 마감 리스크 등급(현장 변수 여지 반영). */
  riskGrade?: DeadlineRiskGrade;
  /** 리스크 사유와 운영 대응(내부/고객용 문서가 같은 문구를 사용). */
  riskReason?: string;
  recommendedAction?: string;
  /** Tmap 증빙: 견적 산출(조회) 시각 ISO. */
  queriedAt?: string;
  frequencyLabel?: string | null;
  /** 경유지별 도착/출발 타임라인(역할 포함). */
  timeline?: CaseTimelineEntry[];
  /** 격자 미니맵의 지점 노드(출발 + 최적 순서 경유지). 역할 점 표시용. */
  schematic?: CaseSchematicPoint[];
  /** 미니맵용 실도로 폴리라인(Tmap 경로 지오메트리, [lng,lat] 아님·{lat,lng} 정규화). 직선이 아니라 실제 도로 모양. */
  routeGeometry?: { lat: number; lng: number }[];
  /** 단일 상세 지도 렌더용 경로 페이로드. */
  routeRequest?: unknown;
  lowPrecisionStops?: string[];
  error?: string;
}

export interface CaseBoardResult {
  cases: CaseBoardCaseResult[];
  rollup: {
    oneTimeTotal: number;
    monthlyTotal: number | null;
    annualTotal: number | null;
    contractMonths: number | null;
    contractTotal: number | null;
    /** 월 고정 견적 기준 월("YYYY-MM"). */
    targetMonth: string | null;
    /** 월 산정 기준. */
    monthlyBasis?: 'calendar' | 'average';
    /** 계약 기간 각 월의 영업일/금액 분해(월별 영업일 상이 반영). */
    contractBreakdown?: Array<{ month: string; total: number }>;
    /** 권역별 월 합계(VAT 포함/리스크 텍스트 포함). */
    groupRollups?: QuotePackageGroupRollup[];
    /** 마감을 지정한 케이스가 모두 충족하는지. 마감 지정 케이스가 없으면 null. */
    allMeetDeadline: boolean | null;
    infeasibleLabels: string[];
  };
  basis: string;
  quotePackage?: QuotePackage;
}

/** 동시성 제한 map(외부 API 버스트 방지). */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function isPointObject(p: unknown): p is { latitude: number; longitude: number; address?: string } {
  return Boolean(p) && typeof p === 'object' && Number.isFinite((p as any).latitude) && Number.isFinite((p as any).longitude);
}

async function computeCase(
  baseUrl: string,
  c: CaseBoardCaseInput,
  departureFallback: string,
  targetMonth: string,
  monthlyBasis: 'calendar' | 'average',
  idx: number,
  sourceText?: string,
): Promise<CaseBoardCaseResult> {
  const id = `case-${idx + 1}`;
  const baseInfo = { id, label: c.label, group: c.group, vehicleType: c.vehicleType };
  try {
    const domainStops = applyExplicitReturnHints(toDomainStops(c.stops), sourceText);
    const cache = await geocodeStopAddresses(domainStops.map((s) => s.address));
    const toPoint = (address: string) => {
      const hit = cache.get(address.trim());
      if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
        return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
      }
      return address;
    };
    const deadlineSeed = c.departureTime
      ? null
      : buildDeadlineSeedDepartureAt({
          schedules: domainStops.map((stop) => stop.schedule),
          fallbackDeadline: c.deadline,
        });
    const departureIso = c.departureTime
      ? nextIsoAtHHMM(c.departureTime)
      : deadlineSeed ?? departureFallback;
    const payload = buildRolePayload({
      stops: domainStops,
      toPoint,
      vehicleType: c.vehicleType,
      roadOption: 'time-first',
      departureAt: departureIso,
      fastOrder: false,
      preserveOrder: c.preserveOrder,
      useRealtimeTraffic: true,
    });
    const roleMap = buildAddressRoleMap(domainStops, cache);
    const target: DeadlineTarget = c.deadlineTarget ?? 'delivery';
    const shouldSuggestDeparture =
      !c.departureTime &&
      Boolean(deadlineSeed) &&
      !payload.originSchedule;
    let departureSuggestion: DeadlineDepartureSuggestion | null = null;
    let activePayload = payload;

    if (shouldSuggestDeparture) {
      const seedPayload = {
        ...payload,
        deliveryTimes: Array.isArray(payload.deliveryTimes)
          ? payload.deliveryTimes.map(() => '')
          : payload.deliveryTimes,
      };
      const seed = await postRouteOptimizationCached(baseUrl, seedPayload);
      if (seed.ok) {
        const seedTimeline: any[] = Array.isArray(seed.json?.data?.timeline)
          ? seed.json.data.timeline
          : [];
        const seedWaypoints: any[] = Array.isArray(seed.json?.data?.waypoints)
          ? seed.json.data.waypoints
          : [];
        const fallbackCompletion = c.deadline
          ? pickTargetCompletionIso(seedWaypoints, roleMap, target)
          : null;
        departureSuggestion = deriveDeadlineDepartureSuggestion({
          seedDepartureAt: payload.departureAt ?? departureIso,
          timeline: seedTimeline,
          fallbackDeadline: c.deadline,
          fallbackEvaluatedAt: fallbackCompletion,
          originDwellMinutes: Number(payload.originDwellMinutes ?? 0),
          safetyMinutes: 15,
        });
        if (departureSuggestion) {
          activePayload = {
            ...payload,
            departureAt: departureSuggestion.departureAt,
          };
        }
      }
    }

    let routeRequestPayload = activePayload;
    let { ok, status, json: body } = await postRouteOptimizationCached(baseUrl, activePayload);
    // 시간제약 위반 케이스: 불투명 에러로 버리지 않고, 참고가 있는 infeasible 케이스로 유지한다.
    let deadlineInfeasible = false;
    let infeasibleReason: string | undefined;
    if (!ok) {
      const code = typeof body?.error === 'string' ? body.error : undefined;
      if (status === 400 && code && TIME_CONSTRAINT_ERROR_CODES.includes(code)) {
        deadlineInfeasible = true;
        const errs = Array.isArray(body?.details?.errors)
          ? (body.details.errors as unknown[]).filter((e): e is string => typeof e === 'string')
          : [];
        infeasibleReason = errs.length ? errs.join(' ') : describeRouteOptFailure(status, body);
        // 시각 제약을 모두 비운 페이로드로 1회 재시도해 참고용 summary/waypoints/timeline/가격을 얻는다.
        const retryPayload = {
          ...activePayload,
          deliveryTimes: Array.isArray(activePayload.deliveryTimes)
            ? activePayload.deliveryTimes.map(() => '')
            : activePayload.deliveryTimes,
        };
        const retry = await postRouteOptimizationCached(baseUrl, retryPayload);
        if (!retry.ok) {
          return { ...baseInfo, error: describeRouteOptFailure(retry.status, retry.json) };
        }
        routeRequestPayload = retryPayload;
        ok = retry.ok;
        status = retry.status;
        body = retry.json;
      } else {
        return { ...baseInfo, error: describeRouteOptFailure(status, body) };
      }
    }

    const summary = body?.data?.summary;
    const waypoints: any[] = Array.isArray(body?.data?.waypoints) ? body.data.waypoints : [];
    const hasReturn = Array.from(roleMap.values()).includes('return');
    const deliveryArrivalIso = pickTargetCompletionIso(waypoints, roleMap, 'delivery');
    const returnArrivalIso = pickTargetCompletionIso(waypoints, roleMap, 'return');
    const targetArrivalIso = pickTargetCompletionIso(waypoints, roleMap, target);
    const judged = c.deadline
      ? judgeDeadline(targetArrivalIso, c.deadline)
      : { meetsDeadline: null, slackMinutes: null };
    // 시간제약 불가 케이스는 마감 미충족으로 고정(참고가는 살리되 판정은 infeasible).
    const meetsDeadline = deadlineInfeasible ? false : judged.meetsDeadline;
    const slackMinutes = judged.slackMinutes;

    const km = Number(summary?.totalDistance || 0) / 1000;
    const driveMinutes = Math.round(Number(summary?.travelTime || 0) / 60);
    const dwellMinutes = Math.round(Number(summary?.dwellTime || 0) / 60);
    const waitMinutes = Math.round(Number(summary?.waitTime || 0) / 60);
    const predictionAttemptedSegments = Number(summary?.predictionAttemptedSegments ?? 0) || 0;
    const predictionFallbackSegments = Number(summary?.predictionFallbackSegments ?? 0) || 0;
    const stopsCount = countIntermediateStops(payload);

    const quoteRes = await fetch(new URL('/api/quote-calculation', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distance: km * 1000,
        time: driveMinutes * 60,
        vehicleType: c.vehicleType,
        dwellMinutes: [
          Number(payload.originDwellMinutes ?? 0),
          ...(Array.isArray(payload.dwellMinutes) ? payload.dwellMinutes : []),
        ],
        waitMinutes,
        stopsCount,
        scheduleType: c.scheduleType,
      }),
    });
    if (!quoteRes.ok) {
      const b = await quoteRes.json().catch(() => ({}));
      return { ...baseInfo, error: b?.error?.message || `견적 계산 실패 (HTTP ${quoteRes.status})` };
    }
    const quoteJson = await quoteRes.json();
    const hourly = quoteJson?.plans?.hourly ?? {};
    const hourlyTotal = Number(hourly?.total ?? 0);
    const perJobRaw = quoteJson?.plans?.perJob ?? null;
    const perJobTotal =
      perJobRaw?.total != null && Number.isFinite(Number(perJobRaw.total))
        ? Number(perJobRaw.total)
        : undefined;
    // 시간당 산식 투명화: 과금분/단가/유류할증(quote-calculation 응답 그대로).
    const billMinutes = Number.isFinite(Number(hourly?.billMinutes)) ? Number(hourly.billMinutes) : null;
    const ratePerHour = Number.isFinite(Number(hourly?.ratePerHour)) ? Number(hourly.ratePerHour) : null;
    const fuelSurcharge = Number.isFinite(Number(hourly?.fuelSurcharge)) ? Number(hourly.fuelSurcharge) : null;
    const fuelSurchargeBreakdown = hourly?.fuelSurchargeBreakdown ?? null;
    const toRateTableEvidence = (value: unknown): RateTableEvidence | undefined => {
      if (!value || typeof value !== 'object') return undefined;
      const record = value as Record<string, unknown>;
      const source = record.source;
      const effectiveFrom = record.effectiveFrom;
      const sourceDoc = record.sourceDoc;
      if (
        (source !== 'database' && source !== 'static-fallback') ||
        typeof effectiveFrom !== 'string' ||
        typeof sourceDoc !== 'string'
      ) {
        return undefined;
      }
      return { source, effectiveFrom, sourceDoc };
    };
    const pricingEvidence: CasePricingEvidence = {
      hourly: toRateTableEvidence(hourly?.rateTable),
      fuelSurcharge: toRateTableEvidence(hourly?.fuelSurchargeRateTable),
      perJob: toRateTableEvidence(perJobRaw?.rateTable),
    };
    // 공식 대표 운임은 항상 시간당. 과거 planPreference=perJob은 참고값 노출 요청으로만 해석한다.
    const pref = c.planPreference ?? 'hourly';
    const includePerJobReference = c.includePerJobReference || pref === 'perJob';
    const recommendedPlan = 'hourly' as const;
    const oneTimePrice = hourlyTotal;
    const freq = c.frequency as Frequency | undefined;

    // 월 운행 횟수: operatingWeekdays + targetMonth 실제 달력이 우선. 없으면 monthlyVisits 폴백.
    const hasPattern = Array.isArray(c.operatingWeekdays) && c.operatingWeekdays.length > 0;
    const pattern: OperatingPattern | null = hasPattern
      ? { weekdays: c.operatingWeekdays as number[], includeHolidays: c.includeHolidays ?? true }
      : null;
    const monthCount = pattern
      ? monthlyBasis === 'average'
        ? countAverageMonthlyOperatingDays(pattern)
        : countOperatingDays(targetMonth, pattern)
      : null;
    const monthlyVisits = monthCount ? monthCount.operatingDays : c.monthlyVisits;
    const monthlyTotal = monthlyVisits ? oneTimePrice * monthlyVisits : undefined;
    const operatingWeekdaysLabel = pattern ? describeWeekdays(pattern.weekdays) : null;
    const monthBasisLabel = monthCount
      ? monthlyBasis === 'average'
        ? `월 평균 운영일수 · ${monthCount.operatingDays}회`
        : `${targetMonth} 실제 달력 · 운행 ${monthCount.operatingDays}일${monthCount.excludedHolidays ? ` (공휴일 ${monthCount.excludedHolidays}일 제외)` : ''}`
      : c.monthlyVisits
        ? `월 ${c.monthlyVisits}회(직접 지정)`
        : null;
    // 연 합계는 월간(×12)이 가장 정확. 없으면 frequency 기반, 둘 다 없으면 미산정(null).
    const annualPrice = monthlyTotal != null ? monthlyTotal * 12 : freq ? annualizePrice(oneTimePrice, freq) : undefined;

    // 경유지별 타임라인(역할 포함) — route-optimization 실측 도착/출발 시각 그대로.
    const routeTimeline: any[] = Array.isArray(body?.data?.timeline) ? body.data.timeline : [];
    const timelineSource = routeTimeline.length ? routeTimeline : waypoints;
    const timeline: CaseTimelineEntry[] = timelineSource.map((w, i) => ({
      seq: Number.isFinite(Number(w?.seq)) ? Number(w.seq) : i + 1,
      address: w?.address ?? null,
      role: w?.role ?? ((w?.address ? roleMap.get(String(w.address).trim()) : undefined) ?? null),
      arrival: kstHHmm(w?.arrivalTime),
      departure: kstHHmm(w?.departureTime),
      dwellMinutes: Number.isFinite(Number(w?.dwellTime)) ? Number(w.dwellTime) : null,
      waitMinutes: Number.isFinite(Number(w?.waitMinutes))
        ? Number(w.waitMinutes)
        : Number.isFinite(Number(w?.waitTime))
          ? Number(w.waitTime)
          : null,
      operations: Array.isArray(w?.operations) ? w.operations : [],
      schedule: w?.schedule && typeof w.schedule === 'object' ? w.schedule : null,
    }));

    // 격자 미니맵용 폴리라인: 출발지 + 최적 순서 경유지(좌표).
    const schematic: CaseSchematicPoint[] = [];
    const originPt = Array.isArray(payload.origins) ? payload.origins[0] : null;
    if (isPointObject(originPt)) schematic.push({ lat: originPt.latitude, lng: originPt.longitude, role: 'pickup' });
    for (const w of waypoints) {
      if (Number.isFinite(w?.latitude) && Number.isFinite(w?.longitude)) {
        schematic.push({
          lat: Number(w.latitude),
          lng: Number(w.longitude),
          role: (w?.address ? roleMap.get(String(w.address).trim()) : undefined) ?? 'waypoint',
        });
      }
    }

    // 실도로 폴리라인: Tmap 경로 features의 LineString 좌표를 순서대로 이어붙인다(직선 아님).
    // SVG 부담을 줄이려 최대 ~180점으로 균등 다운샘플. 좌표는 [lng,lat] → {lat,lng} 정규화.
    const rawGeom: { lat: number; lng: number }[] = [];
    const feats: any[] = Array.isArray((body as any)?.data?.features) ? (body as any).data.features : [];
    for (const f of feats) {
      const g = f?.geometry;
      if (g?.type === 'LineString' && Array.isArray(g.coordinates)) {
        for (const co of g.coordinates) {
          if (Array.isArray(co) && co.length >= 2 && Number.isFinite(Number(co[0])) && Number.isFinite(Number(co[1]))) {
            rawGeom.push({ lng: Number(co[0]), lat: Number(co[1]) });
          }
        }
      }
    }
    const MAX_GEOM = 180;
    const routeGeometry =
      rawGeom.length <= MAX_GEOM
        ? rawGeom
        : (() => {
            const step = rawGeom.length / MAX_GEOM;
            const out: { lat: number; lng: number }[] = [];
            for (let i = 0; i < MAX_GEOM; i++) out.push(rawGeom[Math.floor(i * step)]);
            out.push(rawGeom[rawGeom.length - 1]); // 종점 보존
            return out;
          })();

    const lowPrecisionStops = domainStops
      .map((s) => s.address)
      .filter((addr) => cache.get(addr.trim())?.lowPrecision);

    const result: CaseBoardCaseResult = {
      ...baseInfo,
      departureLabel: kstHHmm(activePayload.departureAt ?? departureIso),
      departureWasSuggested: Boolean(departureSuggestion),
      pickupStartLabel: departureSuggestion
        ? timeline[0]?.arrival ?? departureSuggestion.pickupStartLabel
        : null,
      departureSafetyMinutes: departureSuggestion?.safetyMinutes ?? null,
      km: Number(km.toFixed(1)),
      driveMinutes,
      dwellMinutes,
      waitMinutes,
      predictionAttemptedSegments,
      predictionFallbackSegments,
      deadline: c.deadline ?? null,
      deadlineTarget: target,
      deliveryArrival: kstHHmm(deliveryArrivalIso),
      returnArrival: hasReturn ? kstHHmm(returnArrivalIso) : null,
      meetsDeadline,
      deadlineSlackMinutes: slackMinutes,
      riskGrade: deadlineRiskGrade(slackMinutes, meetsDeadline),
      oneTimePrice,
      recommendedPlan,
      includePerJobReference,
      planPreference: pref,
      hourlyTotal,
      perJobTotal,
      billMinutes,
      ratePerHour,
      fuelSurcharge,
      fuelSurchargeBreakdown,
      pricingEvidence,
      annualPrice,
      monthlyTotal,
      monthlyVisits,
      operatingWeekdaysLabel,
      monthBasisLabel,
      operatingWeekdays: pattern?.weekdays,
      includeHolidays: pattern?.includeHolidays,
      queriedAt: new Date().toISOString(),
      frequencyLabel: formatFrequency(freq),
      timeline,
      schematic,
      routeGeometry,
      // 마감 불가 케이스는 제약 없는 참고 경로로 지도만 렌더한다.
      // 원 제약을 다시 보내면 미리보기 API도 같은 400으로 실패해 지도가 열리지 않는다.
      routeRequest: { ...routeRequestPayload, useRealtimeTraffic: true },
      lowPrecisionStops,
    };
    return {
      ...result,
      riskReason: deadlineInfeasible ? (infeasibleReason ?? buildRiskReason(result)) : buildRiskReason(result),
      recommendedAction: buildRiskAction(result),
    };
  } catch (e) {
    return { ...baseInfo, error: e instanceof Error ? e.message : '계산 중 오류' };
  }
}

function defaultTargetMonth(): string {
  // 다음 달을 기본 기준 월로(요청 시점이 월말이어도 다가오는 달 견적이 흔함).
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1; // 1-based
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export async function computeCaseBoard(baseUrl: string, input: CaseBoardInput): Promise<CaseBoardResult> {
  const departureFallback = input.departureFallback ?? new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const targetMonth = input.targetMonth ?? defaultTargetMonth();
  const monthlyBasis = input.monthlyBasis ?? 'calendar';
  const results = await mapPool(input.cases, CASE_CONCURRENCY, (c, idx) =>
    computeCase(baseUrl, c, departureFallback, targetMonth, monthlyBasis, idx, input.sourceText)
  );

  const valid = results.filter((r) => !r.error && typeof r.oneTimePrice === 'number');
  const sum = (vals: Array<number | undefined>) => vals.reduce<number>((a, b) => a + (Number.isFinite(b) ? (b as number) : 0), 0);
  const oneTimeTotal = sum(valid.map((r) => r.oneTimePrice));
  const monthlyVals = valid.map((r) => r.monthlyTotal).filter((n): n is number => typeof n === 'number');
  const monthlyTotal = monthlyVals.length ? sum(monthlyVals) : null;
  // 연 합계: 월간이 있으면 ×12, 없으면 frequency 기반 케이스 합. 근거 없으면 null(미산정).
  const annualVals = valid.map((r) => r.annualPrice).filter((n): n is number => typeof n === 'number');
  const annualTotal = monthlyTotal != null ? monthlyTotal * 12 : annualVals.length ? sum(annualVals) : null;
  const contractMonths = input.contractMonths ?? null;

  // 계약 합계: 각 월의 실제 영업일이 다르므로 연속 월을 따로 세서 합산(월별 분해 노출).
  let contractTotal: number | null = null;
  let contractBreakdown: Array<{ month: string; total: number }> | undefined;
  if (contractMonths != null) {
    const months = consecutiveMonths(targetMonth, contractMonths);
    const patternCases = valid.filter(
      (r) => Array.isArray(r.operatingWeekdays) && r.operatingWeekdays.length > 0 && typeof r.oneTimePrice === 'number'
    );
    if (monthlyBasis === 'average' && monthlyTotal != null) {
      contractTotal = monthlyTotal * contractMonths;
      contractBreakdown = Array.from({ length: contractMonths }, (_, idx) => ({
        month: `평균 ${idx + 1}개월차`,
        total: monthlyTotal,
      }));
    } else if (patternCases.length) {
      contractBreakdown = months.map((month) => {
        const total = patternCases.reduce((acc, r) => {
          const days = countOperatingDays(month, {
            weekdays: r.operatingWeekdays as number[],
            includeHolidays: r.includeHolidays ?? true,
          }).operatingDays;
          return acc + (r.oneTimePrice as number) * days;
        }, 0);
        return { month, total };
      });
      contractTotal = contractBreakdown.reduce((a, b) => a + b.total, 0);
    } else if (monthlyTotal != null) {
      // 패턴이 없으면 근사(월간×개월).
      contractTotal = monthlyTotal * contractMonths;
    }
  }

  const deadlineCases = results.filter((r) => r.deadline || r.meetsDeadline === false);
  const infeasibleLabels = deadlineCases.filter((r) => r.meetsDeadline === false).map((r) => r.label);
  const allMeetDeadline = deadlineCases.length ? infeasibleLabels.length === 0 : null;

  const baseResult: CaseBoardResult = {
    cases: results,
    rollup: {
      oneTimeTotal,
      monthlyTotal,
      annualTotal,
      contractMonths,
      contractTotal,
      targetMonth,
      monthlyBasis,
      contractBreakdown,
      allMeetDeadline,
      infeasibleLabels,
    },
    basis: `${monthlyBasis === 'average' ? '월 평균 운영일수' : `${targetMonth} 실제 달력`} 기준 월 운행 횟수 · 교통 반영(Tmap 예측) 소요시간 · 마감은 마지막 배송 완료 기준(반납 복귀는 업무 종료, 마감 없음) · 옹고잉 요금엔 심야/주말 할증 없음`,
  };
  const quotePackage = buildQuotePackage(baseResult);
  return {
    ...baseResult,
    rollup: {
      ...baseResult.rollup,
      groupRollups: quotePackage.groupRollups,
    },
    quotePackage,
  };
}
