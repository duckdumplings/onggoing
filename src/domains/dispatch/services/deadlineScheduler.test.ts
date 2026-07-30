import { describe, expect, it } from 'vitest';

import {
  buildDeadlineSeedDepartureAt,
  deriveDeadlineDepartureSuggestion,
} from './deadlineScheduler';

describe('deadlineScheduler', () => {
  it('가장 이른 배송 마감에서 초기 경로 조회 시각을 잡는다', () => {
    const seed = buildDeadlineSeedDepartureAt({
      referenceDate: new Date('2026-07-30T00:00:00.000Z'),
      schedules: [
        { type: 'completion-deadline', time: '11:40' },
        { type: 'completion-deadline', time: '12:00' },
      ],
    });

    expect(seed).toBe('2026-07-30T00:40:00.000Z');
  });

  it('여러 마감 중 가장 빡빡한 지점에서 상차와 출발 시각을 역산한다', () => {
    const suggestion = deriveDeadlineDepartureSuggestion({
      seedDepartureAt: '2026-07-30T01:00:00.000Z',
      originDwellMinutes: 15,
      safetyMinutes: 15,
      timeline: [
        {
          address: '송파구 위례순환로 387',
          arrivalTime: '2026-07-30T02:20:00.000Z',
          departureTime: '2026-07-30T02:35:00.000Z',
          schedule: { type: 'completion-deadline', time: '11:40' },
        },
        {
          address: '송파구 백제고분로 488',
          arrivalTime: '2026-07-30T02:55:00.000Z',
          departureTime: '2026-07-30T03:10:00.000Z',
          schedule: { type: 'completion-deadline', time: '12:00' },
        },
      ],
    });

    expect(suggestion).toMatchObject({
      departureLabel: '09:35',
      pickupStartLabel: '09:20',
      safetyMinutes: 15,
      bindingDeadline: '12:00',
      bindingAddress: '송파구 백제고분로 488',
    });
  });

  it('지점별 schedule이 없으면 케이스 마감을 마지막 완료 시각에 적용한다', () => {
    const suggestion = deriveDeadlineDepartureSuggestion({
      seedDepartureAt: '2026-07-30T01:00:00.000Z',
      timeline: [],
      fallbackDeadline: '12:00',
      fallbackEvaluatedAt: '2026-07-30T02:30:00.000Z',
      originDwellMinutes: 15,
    });

    expect(suggestion?.departureLabel).toBe('10:15');
    expect(suggestion?.pickupStartLabel).toBe('10:00');
  });
});
