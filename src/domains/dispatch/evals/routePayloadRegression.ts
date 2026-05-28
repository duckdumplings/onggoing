/**
 * 경로 최적화 payload 회귀 검증.
 *
 * P0-1 (좌측 패널 시간 설정이 우측 패널 재계산에서 무시되는 버그) 회귀 방지를 위해,
 * `buildRouteOptimizationPayload`가 hook state(좌측 패널 스냅샷)와 부분 override(우측 패널 재계산)을
 * 합성하는 방식이 의도대로 동작하는지 검증한다.
 */
import {
  buildRouteOptimizationPayload,
  type OptimizationOptions,
  type RouteOptimizationBaseState,
  type RouteOptimizationOverride,
} from '@/hooks/useRouteOptimization';

interface PayloadCase {
  name: string;
  state: RouteOptimizationBaseState;
  override?: RouteOptimizationOverride;
  expect: (payload: ReturnType<typeof buildRouteOptimizationPayload>) => void;
}

const baseOptions: OptimizationOptions = {
  optimizeOrder: true,
  useRealtimeTraffic: false,
  departureAt: '2026-05-30T14:30:00.000Z',
  useExplicitDestination: false,
  roadOption: 'time-first',
  returnToOrigin: true,
  deliveryTimes: ['15:00', '', '17:00'],
  isNextDayFlags: [false, false, false],
};

const baseState: RouteOptimizationBaseState = {
  origins: { lat: 37.5, lng: 127.0, address: '서울특별시 강남구 출발지' },
  destinations: [
    { lat: 37.51, lng: 127.01, address: '경유지 1' },
    { lat: 37.52, lng: 127.02, address: '경유지 2' },
    { lat: 37.53, lng: 127.03, address: '경유지 3' },
  ],
  vehicleType: '스타렉스',
  options: baseOptions,
  dwellMinutes: [10, 15, 10, 20],
};

function assertEqual<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`[${label}] expected ${e}, got ${a}`);
  }
}

export const PAYLOAD_REGRESSION_CASES: PayloadCase[] = [
  {
    name: '좌측 패널 스냅샷만 있을 때 base state 그대로 반영',
    state: baseState,
    expect: (payload) => {
      assertEqual(payload.departureAt, baseOptions.departureAt, 'departureAt');
      assertEqual(payload.deliveryTimes, baseOptions.deliveryTimes, 'deliveryTimes');
      assertEqual(payload.isNextDayFlags, baseOptions.isNextDayFlags, 'isNextDayFlags');
      assertEqual(payload.roadOption, 'time-first', 'roadOption');
      assertEqual(payload.useRealtimeTraffic, false, 'useRealtimeTraffic');
      assertEqual(payload.returnToOrigin, true, 'returnToOrigin');
      assertEqual(payload.vehicleType, '스타렉스', 'vehicleType');
      assertEqual(payload.dwellMinutes, [10, 15, 10, 20], 'dwellMinutes');
      assertEqual(payload.origins.length, 1, 'origins.length');
      assertEqual(payload.destinations.length, 3, 'destinations.length');
    },
  },
  {
    name: '우측 패널 도로 옵션 재계산 시, 좌측 패널 시간 설정 보존',
    state: baseState,
    override: { options: { roadOption: 'toll-saving' } },
    expect: (payload) => {
      assertEqual(payload.roadOption, 'toll-saving', 'roadOption');
      assertEqual(payload.departureAt, baseOptions.departureAt, 'departureAt 보존');
      assertEqual(payload.deliveryTimes, baseOptions.deliveryTimes, 'deliveryTimes 보존');
      assertEqual(payload.isNextDayFlags, baseOptions.isNextDayFlags, 'isNextDayFlags 보존');
      assertEqual(payload.useRealtimeTraffic, false, 'useRealtimeTraffic 보존');
      assertEqual(payload.dwellMinutes, [10, 15, 10, 20], 'dwellMinutes 보존');
    },
  },
  {
    name: 'free-road-first 옵션도 동일하게 base state 보존',
    state: baseState,
    override: { options: { roadOption: 'free-road-first' } },
    expect: (payload) => {
      assertEqual(payload.roadOption, 'free-road-first', 'roadOption');
      assertEqual(payload.departureAt, baseOptions.departureAt, 'departureAt 보존');
      assertEqual(payload.deliveryTimes, baseOptions.deliveryTimes, 'deliveryTimes 보존');
    },
  },
  {
    name: '시간 설정이 비어있는 초기 state는 그대로 빈값 유지',
    state: {
      ...baseState,
      options: {
        ...baseOptions,
        departureAt: null,
        deliveryTimes: [],
        isNextDayFlags: [],
        useRealtimeTraffic: true,
      },
    },
    override: { options: { roadOption: 'time-first' } },
    expect: (payload) => {
      assertEqual(payload.departureAt, null, 'departureAt null');
      assertEqual(payload.deliveryTimes, [], 'deliveryTimes empty');
      assertEqual(payload.isNextDayFlags, [], 'isNextDayFlags empty');
      assertEqual(payload.useRealtimeTraffic, true, 'useRealtimeTraffic true');
    },
  },
  {
    name: 'override의 options와 dwellMinutes는 명시적으로 덮어쓴다',
    state: baseState,
    override: {
      options: { departureAt: '2026-06-01T09:00:00.000Z', roadOption: 'toll-saving' },
      dwellMinutes: [5, 5, 5, 5],
    },
    expect: (payload) => {
      assertEqual(payload.departureAt, '2026-06-01T09:00:00.000Z', 'departureAt override');
      assertEqual(payload.roadOption, 'toll-saving', 'roadOption override');
      assertEqual(payload.dwellMinutes, [5, 5, 5, 5], 'dwellMinutes override');
      assertEqual(payload.deliveryTimes, baseOptions.deliveryTimes, 'deliveryTimes 보존');
    },
  },
  {
    name: 'useExplicitDestination true + rawDestinations 미사용 시 마지막 목적지 주소를 finalDestinationAddress로',
    state: {
      ...baseState,
      options: { ...baseOptions, useExplicitDestination: true },
    },
    expect: (payload) => {
      assertEqual(payload.useExplicitDestination, true, 'useExplicitDestination');
      assertEqual(payload.finalDestinationAddress, '경유지 3', 'finalDestinationAddress');
    },
  },
];

export function assertRoutePayloadRegression() {
  const failures: string[] = [];
  for (const c of PAYLOAD_REGRESSION_CASES) {
    const payload = buildRouteOptimizationPayload(c.state, c.override);
    try {
      c.expect(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`✗ ${c.name}: ${msg}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Route payload regression failed:\n${failures.join('\n')}`);
  }
}
