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
import { buildRolePayload } from '@/domains/dispatch/services/rolePayload';
import { postRouteOptimizationCached } from '@/domains/dispatch/services/routeOptCache';
import { annualizePrice, formatFrequency } from '@/domains/dispatch/utils/frequency';
import {
  type DeadlineTarget,
  nextIsoAtHHMM,
  kstHHmm,
  buildAddressRoleMap,
  pickTargetArrivalIso,
  judgeDeadline,
} from '@/domains/dispatch/utils/deliveryDeadline';
import {
  type OperatingPattern,
  countOperatingDays,
  consecutiveMonths,
  describeWeekdays,
} from '@/domains/dispatch/utils/monthlyBasis';
import type { Frequency, StopRole } from '@/domains/dispatch/types/routePlan';
import { FrequencySchema, RouteStopSchema, toDomainStops } from '@/domains/quote/agent/workingMemory';

const CASE_CONCURRENCY = 4;

/** 케이스 1건 입력 스키마(에이전트 도구가 그대로 재사용). */
export const CaseBoardCaseInputSchema = z.object({
  label: z.string().min(1).describe('표에 노출할 케이스 라벨. 예: "강동&잠실&송파&하남 점심".'),
  group: z.string().optional().describe('그룹핑 키(권역/라인). 같은 group은 한 묶음으로 표시. 예: "권역1".'),
  stops: z.array(RouteStopSchema).min(2).describe('역할 태깅된 경유지(수거/배송/반납). 월요일처럼 반납이 없으면 return을 넣지 마라.'),
  vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
  scheduleType: z.enum(['regular', 'ad-hoc']).default('regular'),
  planPreference: z
    .enum(['auto', 'hourly', 'perJob'])
    .default('auto')
    .describe('대표 운임 선택. auto=옹고잉 유리(시간당/단건 중 높은 쪽). 사용자가 "시간당만/단건만"으로 지정하면 hourly/perJob로 고정하라.'),
  departureTime: z.string().optional().describe('출발 시각 "HH:mm". 점심/저녁은 케이스를 나눠 각각 출발시각을 넣어라.'),
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
  /** 월 고정 견적 기준 월("YYYY-MM"). 이 달의 실제 달력으로 운행 횟수를 센다. 없으면 다음 달. */
  targetMonth?: string;
  /** 케이스에 출발시각이 없을 때 쓸 폴백 ISO(견적-지도 일치용 고정 스냅샷). */
  departureFallback?: string;
}

export type DeadlineRiskGrade = 'safe' | 'caution' | 'danger' | 'recheck' | 'infeasible' | 'none';

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
  meetsDeadline?: boolean | null;
  deadlineSlackMinutes?: number | null;
  oneTimePrice?: number;
  recommendedPlan?: 'hourly' | 'perJob';
  /** 대표 운임 선택 방식(auto면 옹고잉 유리). */
  planPreference?: 'auto' | 'hourly' | 'perJob';
  hourlyTotal?: number;
  perJobTotal?: number;
  /** 시간당 산식 투명화: 과금분(30분 올림·최소 120), 시간당 단가, 유류할증. */
  billMinutes?: number | null;
  ratePerHour?: number | null;
  fuelSurcharge?: number | null;
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
  /** Tmap 증빙: 견적 산출(조회) 시각 ISO. */
  queriedAt?: string;
  frequencyLabel?: string | null;
  /** 경유지별 도착/출발 타임라인(역할 포함). */
  timeline?: CaseTimelineEntry[];
  /** 격자 미니맵용 정규화 폴리라인(출발 + 최적 순서 경유지). */
  schematic?: CaseSchematicPoint[];
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
    /** 계약 기간 각 월의 영업일/금액 분해(월별 영업일 상이 반영). */
    contractBreakdown?: Array<{ month: string; total: number }>;
    /** 마감을 지정한 케이스가 모두 충족하는지. 마감 지정 케이스가 없으면 null. */
    allMeetDeadline: boolean | null;
    infeasibleLabels: string[];
  };
  basis: string;
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
  idx: number
): Promise<CaseBoardCaseResult> {
  const id = `case-${idx + 1}`;
  const baseInfo = { id, label: c.label, group: c.group, vehicleType: c.vehicleType };
  try {
    const domainStops = toDomainStops(c.stops);
    const cache = await geocodeStopAddresses(domainStops.map((s) => s.address));
    const toPoint = (address: string) => {
      const hit = cache.get(address.trim());
      if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
        return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
      }
      return address;
    };
    const departureIso = c.departureTime ? nextIsoAtHHMM(c.departureTime) : departureFallback;
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

    const { ok, status, json: body } = await postRouteOptimizationCached(baseUrl, payload);
    if (!ok) {
      const failed = body?.diagnostics?.failedAddresses;
      const message = Array.isArray(failed) && failed.length
        ? `주소를 찾지 못했어요: ${failed.map((f: any) => f?.address).filter(Boolean).join(', ')}`
        : body?.error || body?.message || `경로 계산 실패 (HTTP ${status})`;
      return { ...baseInfo, error: message };
    }

    const summary = body?.data?.summary;
    const waypoints: any[] = Array.isArray(body?.data?.waypoints) ? body.data.waypoints : [];
    const roleMap = buildAddressRoleMap(domainStops, cache);
    const hasReturn = Array.from(roleMap.values()).includes('return');
    const target: DeadlineTarget = c.deadlineTarget ?? 'delivery';
    const deliveryArrivalIso = pickTargetArrivalIso(waypoints, roleMap, 'delivery');
    const returnArrivalIso = pickTargetArrivalIso(waypoints, roleMap, 'return');
    const targetArrivalIso = pickTargetArrivalIso(waypoints, roleMap, target);
    const { meetsDeadline, slackMinutes } = c.deadline
      ? judgeDeadline(targetArrivalIso, c.deadline)
      : { meetsDeadline: null, slackMinutes: null };

    const km = Number(summary?.totalDistance || 0) / 1000;
    const driveMinutes = Math.round(Number(summary?.travelTime || 0) / 60);
    const dwellMinutes = Math.round(Number(summary?.dwellTime || 0) / 60);
    const predictionAttemptedSegments = Number(summary?.predictionAttemptedSegments ?? 0) || 0;
    const predictionFallbackSegments = Number(summary?.predictionFallbackSegments ?? 0) || 0;
    const stopsCount = Math.max(0, payload.destinations.length - (payload.useExplicitDestination ? 1 : 0));

    const quoteRes = await fetch(new URL('/api/quote-calculation', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distance: km * 1000,
        time: driveMinutes * 60,
        vehicleType: c.vehicleType,
        dwellMinutes: payload.dwellMinutes,
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
    const perJobTotal = Number(quoteJson?.plans?.perJob?.total ?? 0);
    // 시간당 산식 투명화: 과금분/단가/유류할증(quote-calculation 응답 그대로).
    const billMinutes = Number.isFinite(Number(hourly?.billMinutes)) ? Number(hourly.billMinutes) : null;
    const ratePerHour = Number.isFinite(Number(hourly?.ratePerHour)) ? Number(hourly.ratePerHour) : null;
    const fuelSurcharge = Number.isFinite(Number(hourly?.fuelSurcharge)) ? Number(hourly.fuelSurcharge) : null;
    // 대표 운임: 사용자가 지정(hourly/perJob)하면 그대로, auto면 옹고잉 유리(높은 쪽).
    const pref = c.planPreference ?? 'auto';
    const recommendedPlan: 'hourly' | 'perJob' =
      pref === 'hourly' ? 'hourly' : pref === 'perJob' ? 'perJob' : hourlyTotal >= perJobTotal ? 'hourly' : 'perJob';
    const oneTimePrice = recommendedPlan === 'hourly' ? hourlyTotal : perJobTotal;
    const freq = c.frequency as Frequency | undefined;

    // 월 운행 횟수: operatingWeekdays + targetMonth 실제 달력이 우선. 없으면 monthlyVisits 폴백.
    const hasPattern = Array.isArray(c.operatingWeekdays) && c.operatingWeekdays.length > 0;
    const pattern: OperatingPattern | null = hasPattern
      ? { weekdays: c.operatingWeekdays as number[], includeHolidays: c.includeHolidays ?? true }
      : null;
    const monthCount = pattern ? countOperatingDays(targetMonth, pattern) : null;
    const monthlyVisits = monthCount ? monthCount.operatingDays : c.monthlyVisits;
    const monthlyTotal = monthlyVisits ? oneTimePrice * monthlyVisits : undefined;
    const operatingWeekdaysLabel = pattern ? describeWeekdays(pattern.weekdays) : null;
    const monthBasisLabel = monthCount
      ? `${targetMonth} 실제 달력 · 운행 ${monthCount.operatingDays}일${monthCount.excludedHolidays ? ` (공휴일 ${monthCount.excludedHolidays}일 제외)` : ''}`
      : c.monthlyVisits
        ? `월 ${c.monthlyVisits}회(직접 지정)`
        : null;
    // 연 합계는 월간(×12)이 가장 정확. 없으면 frequency 기반, 둘 다 없으면 미산정(null).
    const annualPrice = monthlyTotal != null ? monthlyTotal * 12 : freq ? annualizePrice(oneTimePrice, freq) : undefined;

    // 경유지별 타임라인(역할 포함) — route-optimization 실측 도착/출발 시각 그대로.
    const timeline: CaseTimelineEntry[] = waypoints.map((w, i) => ({
      seq: i + 1,
      address: w?.address ?? null,
      role: (w?.address ? roleMap.get(String(w.address).trim()) : undefined) ?? null,
      arrival: kstHHmm(w?.arrivalTime),
      departure: kstHHmm(w?.departureTime),
      dwellMinutes: Number.isFinite(Number(w?.dwellTime)) ? Number(w.dwellTime) : null,
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

    const lowPrecisionStops = domainStops
      .map((s) => s.address)
      .filter((addr) => cache.get(addr.trim())?.lowPrecision);

    return {
      ...baseInfo,
      departureLabel: kstHHmm(departureIso),
      km: Number(km.toFixed(1)),
      driveMinutes,
      dwellMinutes,
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
      planPreference: pref,
      hourlyTotal,
      perJobTotal,
      billMinutes,
      ratePerHour,
      fuelSurcharge,
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
      routeRequest: { ...payload, useRealtimeTraffic: true },
      lowPrecisionStops,
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
  const results = await mapPool(input.cases, CASE_CONCURRENCY, (c, idx) =>
    computeCase(baseUrl, c, departureFallback, targetMonth, idx)
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
    if (patternCases.length) {
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

  const deadlineCases = results.filter((r) => r.deadline);
  const infeasibleLabels = deadlineCases.filter((r) => r.meetsDeadline === false).map((r) => r.label);
  const allMeetDeadline = deadlineCases.length ? infeasibleLabels.length === 0 : null;

  return {
    cases: results,
    rollup: {
      oneTimeTotal,
      monthlyTotal,
      annualTotal,
      contractMonths,
      contractTotal,
      targetMonth,
      contractBreakdown,
      allMeetDeadline,
      infeasibleLabels,
    },
    basis: `${targetMonth} 실제 달력 기준 월 운행 횟수 · 교통 반영(Tmap 예측) 소요시간 · 마감은 마지막 배송 완료 기준(반납 복귀는 업무 종료, 마감 없음) · 옹고잉 요금엔 심야/주말 할증 없음`,
  };
}
