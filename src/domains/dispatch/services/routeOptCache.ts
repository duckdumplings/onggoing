/**
 * /api/route-optimization 호출 정규화 + TTL 캐시 (배차 도메인 공용).
 *
 * 도메인 룰 §3: 동일 입력(좌표·차종·옵션·출발 분(分))의 Tmap 중복 호출을 막는다.
 * 좌표는 ~1m로, 출발시각은 분 단위로 정규화해 캐시 키를 만든다.
 * 에이전트 도구(tools.ts)와 케이스 보드 서비스(caseBoard.ts)가 같은 캐시를 공유한다.
 */

type RouteOptCacheEntry = { at: number; status: number; ok: boolean; json: any };

const ROUTE_OPT_CACHE = new Map<string, RouteOptCacheEntry>();
const ROUTE_OPT_TTL_MS = 5 * 60 * 1000;
const ROUTE_OPT_CACHE_MAX = 200;

function roundCoord(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 1e5) / 1e5 : null; // ~1m 정밀도
}

/** 좌표는 ~1m로, 출발시각은 분 단위로 정규화해 캐시 키를 만든다(룰: 분 단위 라운딩). */
export function normalizeRouteKey(payload: any): string {
  const pickPoint = (p: any) =>
    p && typeof p === 'object'
      ? { lat: roundCoord(p.latitude), lon: roundCoord(p.longitude), a: typeof p.address === 'string' ? p.address.trim() : undefined }
      : { a: String(p ?? '').trim() };
  const origins = Array.isArray(payload?.origins) ? payload.origins.map(pickPoint) : pickPoint(payload?.origins);
  const destinations = Array.isArray(payload?.destinations) ? payload.destinations.map(pickPoint) : [];
  const dep = payload?.departureAt ? new Date(payload.departureAt) : null;
  const departureMin = dep && !Number.isNaN(dep.getTime()) ? Math.floor(dep.getTime() / 60000) : null;
  return JSON.stringify({
    origins,
    destinations,
    vehicleType: payload?.vehicleType ?? null,
    roadOption: payload?.roadOption ?? null,
    useRealtimeTraffic: Boolean(payload?.useRealtimeTraffic),
    trafficAnchor: payload?.trafficAnchor ?? null,
    fastOrder: Boolean(payload?.fastOrder),
    optimizeOrder: Boolean(payload?.optimizeOrder),
    openStart: Boolean(payload?.openStart),
    startCandidateCount: payload?.startCandidateCount ?? null,
    returnToOrigin: Boolean(payload?.returnToOrigin),
    useExplicitDestination: Boolean(payload?.useExplicitDestination),
    finalDestinationAddress:
      typeof payload?.finalDestinationAddress === 'string'
        ? payload.finalDestinationAddress.trim()
        : null,
    dwellMinutes: payload?.dwellMinutes ?? null,
    originDwellMinutes: payload?.originDwellMinutes ?? null,
    // 시간제약도 키에 포함 — 같은 경로라도 시각 없이 계산된 캐시가
    // 시각 달린 재계산에 히트되면 시간제약 검증이 통째로 우회된다.
    deliveryTimes: payload?.deliveryTimes ?? null,
    timeConstraintTypes: payload?.timeConstraintTypes ?? null,
    earlyDeliveryForbiddenFlags: payload?.earlyDeliveryForbiddenFlags ?? null,
    earlyToleranceMinutes: payload?.earlyToleranceMinutes ?? null,
    earlyToleranceMinutesByStop: payload?.earlyToleranceMinutesByStop ?? null,
    isNextDayFlags: payload?.isNextDayFlags ?? null,
    stopRoles: payload?.stopRoles ?? null,
    stopOperations: payload?.stopOperations ?? null,
    stopSchedules: payload?.stopSchedules ?? null,
    originRole: payload?.originRole ?? null,
    originOperations: payload?.originOperations ?? null,
    originSchedule: payload?.originSchedule ?? null,
    loadKg: payload?.loadKg ?? null,
    vehicleCapacityKg: payload?.vehicleCapacityKg ?? null,
    departureMin,
  });
}

/**
 * route-optimization 실패 본문 → 사람이 읽을 메시지.
 * 코드 문자열(TIME_CONSTRAINT_VIOLATION 등)보다 한글 message·지점별 사유(details.errors)·
 * 조정 제안(details.suggestions)을 우선한다 — LLM/사용자가 원인과 다음 행동을 알 수 있게.
 */
export function describeRouteOptFailure(status: number, body: any): string {
  const failed = body?.diagnostics?.failedAddresses;
  if (Array.isArray(failed) && failed.length) {
    return `주소를 찾지 못했어요: ${failed.map((f: any) => f?.address).filter(Boolean).join(', ')}`;
  }
  const parts: string[] = [];
  if (typeof body?.message === 'string' && body.message.trim()) parts.push(body.message.trim());
  const errors = body?.details?.errors;
  if (Array.isArray(errors)) parts.push(...errors.filter((e: unknown): e is string => typeof e === 'string'));
  const suggestions = body?.details?.suggestions;
  if (Array.isArray(suggestions)) {
    const desc = suggestions.map((s: any) => s?.description).filter(Boolean);
    if (desc.length) parts.push(`조정 제안: ${desc.join(' / ')}`);
  }
  if (parts.length) return parts.join(' ');
  if (typeof body?.error === 'string' && body.error) return body.error;
  return `경로 계산 실패 (HTTP ${status})`;
}

/** route-optimization POST 호출(성공 응답만 TTL 캐시). 응답 JSON과 캐시 적중 여부를 반환. */
export async function postRouteOptimizationCached(
  baseUrl: string,
  payload: any
): Promise<{ ok: boolean; status: number; json: any; cached: boolean }> {
  const key = normalizeRouteKey(payload);
  const now = Date.now();
  const hit = ROUTE_OPT_CACHE.get(key);
  if (hit && now - hit.at < ROUTE_OPT_TTL_MS) {
    return { ok: hit.ok, status: hit.status, json: hit.json, cached: true };
  }
  const res = await fetch(new URL('/api/route-optimization', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    if (ROUTE_OPT_CACHE.size >= ROUTE_OPT_CACHE_MAX) {
      const oldestKey = ROUTE_OPT_CACHE.keys().next().value;
      if (oldestKey) ROUTE_OPT_CACHE.delete(oldestKey);
    }
    ROUTE_OPT_CACHE.set(key, { at: now, status: res.status, ok: res.ok, json });
  }
  return { ok: res.ok, status: res.status, json, cached: false };
}
