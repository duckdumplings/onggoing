import { describe, it, expect } from 'vitest';
import { buildRolePayload, countIntermediateStops } from './rolePayload';
import type { RouteStop } from '@/domains/dispatch/types/routePlan';

const toPoint = (address: string) => address;

/** 배송라인 축약본: 상차 2곳(두 번째에 도착 데드라인) + 하차 3곳(각 데드라인). */
function lineStops(): RouteStop[] {
  return [
    { address: '가산디지털1로 70', role: 'pickup', dwellMinutes: 10 },
    { address: '선릉로129길 9-6', role: 'pickup', deliveryTime: '11:00', dwellMinutes: 10 },
    { address: '선릉로 513', role: 'drop', deliveryTime: '11:30', deliveryTimeType: 'appointment', dwellMinutes: 5 },
    { address: '언주로 871', role: 'drop', deliveryTime: '11:50', isNextDay: true, dwellMinutes: 5 },
    { address: '선릉로 830', role: 'drop', deliveryTime: '12:50', dwellMinutes: 5 },
  ];
}

describe('buildRolePayload deliveryTimes 배선', () => {
  it('출발지와 단일 최종 목적지만 있으면 중간 경유지는 0개다', () => {
    const payload = buildRolePayload({
      stops: [
        { address: '가산디지털1로 70', role: 'pickup' },
        { address: '네오위즈', role: 'drop' },
      ],
      toPoint,
      vehicleType: '레이',
    });
    expect(countIntermediateStops(payload)).toBe(0);
  });

  it('역할 기반 경로: destinations와 인덱스 정합으로 deliveryTimes/isNextDayFlags를 내보낸다', () => {
    const payload = buildRolePayload({ stops: lineStops(), toPoint, vehicleType: '레이' });
    // ordered = [상차2, 중간 drop들..., 마지막 drop(종착)]
    expect(payload.destinations).toEqual(['선릉로129길 9-6', '선릉로 513', '언주로 871', '선릉로 830']);
    expect(payload.deliveryTimes).toEqual(['11:00', '11:30', '11:50', '12:50']);
    expect(payload.earlyDeliveryForbiddenFlags).toEqual([false, true, false, false]);
    expect(payload.isNextDayFlags).toEqual([false, false, true, false]);
  });

  it('역할 기반 경로: stopRoles/originRole을 destinations와 인덱스 정합으로 내보낸다', () => {
    const payload = buildRolePayload({ stops: lineStops(), toPoint, vehicleType: '레이' });
    // ordered = [상차2(pickup), drop, drop, drop]
    expect(payload.stopRoles).toEqual(['pickup', 'drop', 'drop', 'drop']);
    expect(payload.originRole).toBe('pickup');
  });

  it('preserveOrder 경로: 입력 순서 그대로 deliveryTimes/stopRoles를 내보낸다', () => {
    const payload = buildRolePayload({ stops: lineStops(), toPoint, vehicleType: '레이', preserveOrder: true });
    expect(payload.destinations).toEqual(['선릉로129길 9-6', '선릉로 513', '언주로 871', '선릉로 830']);
    expect(payload.deliveryTimes).toEqual(['11:00', '11:30', '11:50', '12:50']);
    expect(payload.earlyDeliveryForbiddenFlags).toEqual([false, true, false, false]);
    expect(payload.isNextDayFlags).toEqual([false, false, true, false]);
    expect(payload.stopRoles).toEqual(['pickup', 'drop', 'drop', 'drop']);
    expect(payload.originRole).toBe('pickup');
  });

  it('시각이 없는 stop은 빈 문자열(제약 없음)로 채워 인덱스 정합을 유지한다', () => {
    const stops: RouteStop[] = [
      { address: 'A', role: 'pickup' },
      { address: 'B', role: 'drop' },
      { address: 'C', role: 'drop', deliveryTime: '15:00' },
    ];
    const payload = buildRolePayload({ stops, toPoint, vehicleType: '레이' });
    expect(payload.destinations).toEqual(['B', 'C']);
    expect(payload.deliveryTimes).toEqual(['', '15:00']);
    expect(payload.earlyDeliveryForbiddenFlags).toEqual([false, false]);
    expect(payload.isNextDayFlags).toEqual([false, false]);
  });
});
