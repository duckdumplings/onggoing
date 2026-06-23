/**
 * 마감(deadline) 판정 + KST 시각 헬퍼 (배차 도메인 공용).
 *
 * 운영상 마감은 보통 "마지막 배송(drop) 완료"에 적용되고, 서초 반납(return) 복귀는 마감이 없는
 * "업무 종료(반납완료) 시각"이다. 단, 반납 자체가 마감 기준인 견적도 존재하므로 target으로 분기한다.
 * tools.ts(에이전트 도구)와 caseBoard 서비스가 동일 로직을 공유하도록 단일화(중복/표류 방지).
 */

import type { RouteStop, StopRole } from '@/domains/dispatch/types/routePlan';
import type { GeocodedStop } from '@/domains/dispatch/services/stopGeocoder';

export type DeadlineTarget = 'delivery' | 'return' | 'final';

/** "HH:mm"(24h) → 자정 기준 분. 형식 오류면 null. */
export function parseHHMM(s?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** KST 기준 "HH:mm"의 다음 도래 시각 ISO. Tmap 예측 교통 현실성을 위해 과거가 아닌 가까운 미래로. */
export function nextIsoAtHHMM(hhmm?: string): string {
  const mins = parseHHMM(hhmm);
  if (mins == null) return new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kstNow.getUTCFullYear();
  const mo = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  let targetUtcMs = Date.UTC(y, mo, d, Math.floor(mins / 60) - 9, mins % 60, 0, 0);
  if (targetUtcMs <= now.getTime()) targetUtcMs += 24 * 3600 * 1000;
  return new Date(targetUtcMs).toISOString();
}

/** ISO → KST 자정 기준 분(00:00=0). 같은 날 도착 마감 비교용. 형식 오류면 null. */
export function kstMinutesOfDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** ISO → KST "HH:mm". 형식 오류면 null. */
export function kstHHmm(iso?: string | null): string | null {
  if (!iso) return null;
  const m = kstMinutesOfDay(iso);
  if (m == null) return null;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 입력 stop 주소(원본 + 지오코딩 해석본)를 역할로 매핑한다. waypoint.address 매칭에 사용. */
export function buildAddressRoleMap(
  stops: RouteStop[],
  cache: Map<string, GeocodedStop>
): Map<string, StopRole> {
  const map = new Map<string, StopRole>();
  for (const s of stops) {
    const raw = s.address.trim();
    if (raw) map.set(raw, s.role);
    const hit = cache.get(raw);
    const resolved = hit?.address?.trim();
    if (resolved) map.set(resolved, s.role);
  }
  return map;
}

export type RouteWaypointLite = { address?: string | null; arrivalTime?: string | null };

/**
 * deadlineTarget에 해당하는 "마지막 도착 ISO"를 waypoints에서 고른다.
 * - delivery: 역할이 drop인 마지막 waypoint(없으면 반납 존재 시 끝-1, 아니면 마지막).
 * - return: 역할이 return인 마지막 waypoint(없으면 마지막).
 * - final: 마지막 waypoint(반납 포함 최종 도착).
 * waypoints 마지막은 buildRolePayload가 종착(반납 우선)으로 고정한다.
 */
export function pickTargetArrivalIso(
  waypoints: RouteWaypointLite[],
  roleMap: Map<string, StopRole>,
  target: DeadlineTarget
): string | null {
  if (!waypoints.length) return null;
  const roleOf = (wp: RouteWaypointLite): StopRole | undefined =>
    wp?.address ? roleMap.get(wp.address.trim()) : undefined;
  const lastArrival = waypoints[waypoints.length - 1]?.arrivalTime ?? null;

  if (target === 'final') return lastArrival;

  if (target === 'return') {
    for (let i = waypoints.length - 1; i >= 0; i--) {
      if (roleOf(waypoints[i]) === 'return') return waypoints[i].arrivalTime ?? null;
    }
    return lastArrival;
  }

  // delivery(기본): 마지막 drop 도착.
  for (let i = waypoints.length - 1; i >= 0; i--) {
    if (roleOf(waypoints[i]) === 'drop') return waypoints[i].arrivalTime ?? null;
  }
  // 역할 매칭이 안 되면 구조적 폴백: 반납이 있으면 마지막 직전이 마지막 배송.
  const hasReturn = waypoints.some((wp) => roleOf(wp) === 'return') ||
    Array.from(roleMap.values()).includes('return');
  if (hasReturn && waypoints.length >= 2) return waypoints[waypoints.length - 2]?.arrivalTime ?? null;
  return lastArrival;
}

/** 도착 ISO(KST)와 마감 "HH:mm"으로 충족 여부·여유(분)를 판정. */
export function judgeDeadline(
  arrivalIso: string | null,
  deadlineHHmm?: string
): { meetsDeadline: boolean | null; slackMinutes: number | null } {
  const deadlineMin = deadlineHHmm ? parseHHMM(deadlineHHmm) : null;
  const arrivalMin = arrivalIso ? kstMinutesOfDay(arrivalIso) : null;
  if (deadlineMin == null || arrivalMin == null) return { meetsDeadline: null, slackMinutes: null };
  return { meetsDeadline: arrivalMin <= deadlineMin, slackMinutes: deadlineMin - arrivalMin };
}
