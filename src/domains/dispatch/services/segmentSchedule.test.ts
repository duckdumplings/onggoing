import { describe, expect, it } from 'vitest';
import { resolveSegmentSchedule } from '@/domains/dispatch/services/segmentSchedule';

describe('resolveSegmentSchedule', () => {
  it('고정 출발시각과 배송 마감이 함께 있어도 실제 출발시각으로 교통을 예측한다', () => {
    const result = resolveSegmentSchedule({
      timelineDepartureTime: new Date('2026-07-31T01:00:00.000Z'),
      deliveryTime: '11:30',
    });

    expect(result.trafficDepartureTime.toISOString()).toBe('2026-07-31T01:00:00.000Z');
    expect(result.targetDeliveryTime?.toISOString()).toBe('2026-07-31T02:30:00.000Z');
    expect(result.invalidDeliveryTime).toBe(false);
  });

  it('잘못된 배송시각은 출발시각을 바꾸지 않고 검증 오류로 표시한다', () => {
    const result = resolveSegmentSchedule({
      timelineDepartureTime: new Date('2026-07-31T01:00:00.000Z'),
      deliveryTime: '25:00',
    });

    expect(result.trafficDepartureTime.toISOString()).toBe('2026-07-31T01:00:00.000Z');
    expect(result.targetDeliveryTime).toBeNull();
    expect(result.invalidDeliveryTime).toBe(true);
  });
});
