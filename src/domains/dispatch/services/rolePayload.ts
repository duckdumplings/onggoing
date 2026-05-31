// 역할 태깅된 stops → /api/route-optimization 페이로드 변환 공용 헬퍼.
// 기존엔 tools.ts(optimize_route, compare_departure_times)와 scenario-quote route에
// 동일 로직(originStop = pickups[0], finalDrop 고정)이 3곳 중복돼 있었다. 단일화 + open-start 기본 규칙 적용.

import type { RouteStop } from '@/domains/dispatch/types/routePlan';

export type RoutePointInput =
  | string
  | { name: string; address: string; latitude: number; longitude: number };

export interface BuildRolePayloadOptions {
  stops: RouteStop[];
  /** 주소 → 좌표 해석 결과(해석 실패 시 주소 문자열). */
  toPoint: (address: string) => RoutePointInput;
  vehicleType: '레이' | '스타렉스';
  roadOption?: string;
  departureAt?: string;
  useRealtimeTraffic?: boolean;
  /** 사용자가 출발지를 고정 지정한 경우 open-start 비활성. 기본 false. */
  forceFixedOrigin?: boolean;
  /** 출발매트릭스처럼 빠른 순서가 필요할 때 true(NN). 기본 false(정확해). */
  fastOrder?: boolean;
}

/**
 * open-start 적용 규칙: 픽업 후보 ≥2 + 단일 고정 하차 + 출발지 고정 지정 없음.
 * 이 조건에서 route-optimization이 시작점도 비용 최소화 변수로 선택한다.
 */
export function buildRolePayload(opts: BuildRolePayloadOptions) {
  const {
    stops,
    toPoint,
    vehicleType,
    roadOption = 'time-first',
    departureAt,
    useRealtimeTraffic,
    forceFixedOrigin = false,
    fastOrder = false,
  } = opts;

  const pickups = stops.filter((s) => s.role === 'pickup');
  const drops = stops.filter((s) => s.role === 'drop');
  const originStop = pickups[0] ?? stops[0];
  const finalDrop = drops[drops.length - 1];
  const remaining = stops.filter((s) => s !== originStop);
  const ordered = finalDrop ? [...remaining.filter((s) => s !== finalDrop), finalDrop] : remaining;

  const openStart = !forceFixedOrigin && Boolean(finalDrop) && pickups.length >= 2;

  return {
    origins: [toPoint(originStop.address)],
    destinations: ordered.map((s) => toPoint(s.address)),
    finalDestinationAddress: finalDrop ? finalDrop.address : null,
    useExplicitDestination: Boolean(finalDrop),
    vehicleType,
    optimizeOrder: true,
    returnToOrigin: false,
    roadOption,
    departureAt,
    dwellMinutes: ordered.map((s) => s.dwellMinutes ?? 0),
    openStart,
    fastOrder: openStart ? fastOrder : false,
    ...(useRealtimeTraffic !== undefined ? { useRealtimeTraffic } : {}),
  };
}
