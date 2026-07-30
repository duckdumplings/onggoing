import { describe, expect, it } from 'vitest';
import {
  atKstMinutesOfDay,
  atKstTime,
  formatKstHHmm,
  kstMinutesOfDay,
} from '@/domains/dispatch/utils/kstDateTime';

describe('KST date-time helpers', () => {
  it('UTC 서버에서도 KST 벽시계의 같은 날짜에 시각을 설정한다', () => {
    const departure = new Date('2026-07-31T01:00:00.000Z'); // 10:00 KST
    const due = atKstTime(departure, '11:30');

    expect(due?.toISOString()).toBe('2026-07-31T02:30:00.000Z');
    expect(due && formatKstHHmm(due)).toBe('11:30');
  });

  it('익일 지정은 KST 달력 날짜를 하루 넘긴다', () => {
    const departure = new Date('2026-07-31T15:30:00.000Z'); // 8/1 00:30 KST
    const due = atKstTime(departure, '01:15', 1);

    expect(due?.toISOString()).toBe('2026-08-01T16:15:00.000Z');
  });

  it('KST 자정 기준 분을 서버 시간대와 무관하게 계산한다', () => {
    const instant = new Date('2026-07-31T01:20:00.000Z'); // 10:20 KST
    expect(kstMinutesOfDay(instant)).toBe(620);
    expect(atKstMinutesOfDay(instant, 11 * 60 + 30).toISOString()).toBe('2026-07-31T02:30:00.000Z');
  });
});
