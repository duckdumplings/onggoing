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
  const returns = stops.filter((s) => s.role === 'return');

  // 종착 고정: 반납(return)이 있으면 항상 마지막 1회 방문지로 고정. 없으면 마지막 drop.
  const finalStop = returns[returns.length - 1] ?? drops[drops.length - 1] ?? null;
  const originStop = pickups[0] ?? stops.find((s) => s !== finalStop) ?? stops[0];

  // 중간 경유: 픽업(출발 제외) → 배송지 순. 솔버가 순서를 최적화하되, 후보 정렬을 픽업 우선으로 둔다.
  const otherPickups = pickups.filter((s) => s !== originStop);
  const middleDrops = drops.filter((s) => s !== finalStop);
  const orderedMiddle = [...otherPickups, ...middleDrops, ...returns.filter((s) => s !== finalStop)];
  const ordered = finalStop ? [...orderedMiddle, finalStop] : orderedMiddle;

  const openStart = !forceFixedOrigin && Boolean(finalStop) && pickups.length >= 2;

  return {
    origins: [toPoint(originStop.address)],
    destinations: ordered.map((s) => toPoint(s.address)),
    finalDestinationAddress: finalStop ? finalStop.address : null,
    useExplicitDestination: Boolean(finalStop),
    vehicleType,
    optimizeOrder: true,
    returnToOrigin: false,
    roadOption,
    departureAt,
    dwellMinutes: ordered.map((s) => s.dwellMinutes ?? 0),
    openStart,
    // 출발지 후보를 픽업으로 제한(origin + 그 외 픽업). 배송지/반납지는 출발지가 될 수 없다.
    startCandidateCount: pickups.length,
    fastOrder: openStart ? fastOrder : false,
    ...(useRealtimeTraffic !== undefined ? { useRealtimeTraffic } : {}),
  };
}
