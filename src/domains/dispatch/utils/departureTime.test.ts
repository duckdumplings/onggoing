import { describe, expect, it } from 'vitest';
import {
  describeRelativeDay,
  formatDepartureLabel,
  resolveDepartureDateTime,
} from './departureTime';

describe('departureTime KST policy', () => {
  it('UTC instant가 가리키는 KST 당일의 미래 시각을 선택한다', () => {
    const now = new Date('2026-07-30T01:00:00.000Z'); // 목요일 10:00 KST
    const result = resolveDepartureDateTime('11:30', now);
    expect(result?.iso).toBe('2026-07-30T02:30:00.000Z');
    expect(result?.isoLocal).toBe('2026-07-30T11:30');
    expect(result?.rolledToNextDay).toBe(false);
  });

  it('지난 금요일 시각은 주말을 건너 월요일로 보정한다', () => {
    const now = new Date('2026-07-31T03:00:00.000Z'); // 금요일 12:00 KST
    const result = resolveDepartureDateTime('10:00', now);
    expect(result?.iso).toBe('2026-08-03T01:00:00.000Z');
    expect(result?.adjustedForWeekend).toBe(true);
    expect(result && formatDepartureLabel(result.date)).toBe('8/3(월) 10:00');
    expect(result && describeRelativeDay(result.date, now)).toBeNull();
  });
});
