// 역할 태깅된 stops → /api/route-optimization 페이로드 변환 공용 헬퍼.
// 기존엔 tools.ts(optimize_route, compare_departure_times)와 scenario-quote route에
// 동일 로직(originStop = pickups[0], finalDrop 고정)이 3곳 중복돼 있었다. 단일화 + open-start 기본 규칙 적용.

import type { RouteStop, StopRole } from '@/domains/dispatch/types/routePlan';

/**
 * 역할별 기본 체류(상하차/작업) 시간(분). 미지정 stop에 적용.
 * 과거엔 0으로 보내 route-optimization이 일괄 10분으로 처리 → 대량/급식 배송이 비현실적으로 짧게 나왔다.
 * 에이전트가 stop별 dwellMinutes를 주면 그 값이 우선한다(대량 배송은 15~20분 권장).
 */
function defaultDwellForRole(role: StopRole): number {
  switch (role) {
    case 'pickup':
      return 15; // 출발지 적재
    case 'drop':
      return 12; // 배송 하차
    case 'return':
      return 8; // 반납
    default:
      return 5; // 단순 경유
  }
}

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
  /**
   * 입력 순서를 그대로 존중(재최적화 안 함). 기본 false.
   * 파일/메일에 배송 시각·순번이 명확해 순서 흐름을 보존해야 할 때 true.
   * 이 경우 첫 stop이 출발지, 나머지는 입력 순서대로 방문, 마지막이 종착지가 되며 open-start/재정렬을 적용하지 않는다.
   */
  preserveOrder?: boolean;
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
    preserveOrder = false,
  } = opts;

  // 입력 순서 존중: 역할 기반 재배치/open-start 없이 받은 순서를 그대로 경로로 사용한다.
  // 시간·순번이 명확한 라인(파일/메일)에서 흐름을 깨지 않기 위함.
  if (preserveOrder && stops.length >= 2) {
    const origin = stops[0];
    const rest = stops.slice(1);
    const finalStop = rest[rest.length - 1] ?? null;
    return {
      origins: [toPoint(origin.address)],
      destinations: rest.map((s) => toPoint(s.address)),
      finalDestinationAddress: finalStop ? finalStop.address : null,
      useExplicitDestination: Boolean(finalStop),
      vehicleType,
      optimizeOrder: false,
      returnToOrigin: false,
      roadOption,
      departureAt,
      dwellMinutes: rest.map((s) => s.dwellMinutes ?? defaultDwellForRole(s.role)),
      openStart: false,
      startCandidateCount: 1,
      fastOrder: false,
      ...(useRealtimeTraffic !== undefined ? { useRealtimeTraffic } : {}),
    };
  }

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
    dwellMinutes: ordered.map((s) => s.dwellMinutes ?? defaultDwellForRole(s.role)),
    openStart,
    // 출발지 후보를 픽업으로 제한(origin + 그 외 픽업). 배송지/반납지는 출발지가 될 수 없다.
    startCandidateCount: pickups.length,
    fastOrder: openStart ? fastOrder : false,
    ...(useRealtimeTraffic !== undefined ? { useRealtimeTraffic } : {}),
  };
}
