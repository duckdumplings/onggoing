import { describe, expect, it } from 'vitest';
import {
  formatStopOperations,
  resolveOriginDepartureAt,
  resolveStopOperations,
  resolveStopSchedule,
} from '@/domains/dispatch/services/stopSemantics';
import type { RouteStop } from '@/domains/dispatch/types/routePlan';

describe('stop semantics', () => {
  it('같은 지점의 배송 후 수거를 복합 작업으로 보존한다', () => {
    const stop: RouteStop = {
      address: '남풍산업',
      role: 'drop',
      operations: [
        { type: 'drop', quantity: 4 },
        { type: 'pickup', quantity: 4, label: '빈 가방' },
      ],
    };

    expect(resolveStopOperations(stop)).toHaveLength(2);
    expect(formatStopOperations(stop.operations)).toBe('배송·수거');
  });

  it('구형 deliveryTime을 도착 마감 스케줄로 변환한다', () => {
    const stop: RouteStop = {
      address: '배송지',
      role: 'drop',
      deliveryTime: '11:30',
    };

    expect(resolveStopSchedule(stop)).toEqual({
      type: 'arrival-deadline',
      time: '11:30',
      isNextDay: undefined,
    });
    expect(resolveStopOperations(stop)).toEqual([
      { type: 'drop', quantity: undefined, weightKg: undefined },
    ]);
  });

  it('반납 역할을 배송이 아닌 반납 작업으로 보존한다', () => {
    const stop: RouteStop = {
      address: '금천구 가마산로 96',
      role: 'return',
    };
    const operations = resolveStopOperations(stop);

    expect(operations).toEqual([
      { type: 'return', quantity: undefined, weightKg: undefined },
    ]);
    expect(formatStopOperations(operations)).toBe('반납');
  });

  it('10:20 상차 시작과 15분 체류를 10:35 실제 출발로 계산한다', () => {
    const stop: RouteStop = {
      address: '서초대로 350',
      role: 'pickup',
      dwellMinutes: 15,
      schedule: { type: 'service-start', time: '10:20' },
    };

    expect(resolveOriginDepartureAt(stop, '2026-07-31T00:00:00.000Z')).toBe(
      '2026-07-31T01:35:00.000Z',
    );
  });
});
