import { describe, expect, it } from 'vitest';

import { pickTargetCompletionIso } from './deliveryDeadline';

describe('pickTargetCompletionIso', () => {
  it('마지막 배송의 도착이 아니라 작업 완료시각을 반환한다', () => {
    const roleMap = new Map([
      ['상차지', 'pickup' as const],
      ['배송지', 'drop' as const],
      ['반납지', 'return' as const],
    ]);
    const result = pickTargetCompletionIso([
      { address: '배송지', arrivalTime: '2026-07-30T02:30:00.000Z', departureTime: '2026-07-30T02:42:00.000Z' },
      { address: '반납지', arrivalTime: '2026-07-30T03:00:00.000Z', departureTime: '2026-07-30T03:08:00.000Z' },
    ], roleMap, 'delivery');

    expect(result).toBe('2026-07-30T02:42:00.000Z');
  });
});
