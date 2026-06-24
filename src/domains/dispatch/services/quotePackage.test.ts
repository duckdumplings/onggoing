import { describe, expect, it } from 'vitest';

import { countAverageMonthlyOperatingDays } from '@/domains/dispatch/utils/monthlyBasis';
import { buildQuotePackage } from '@/domains/dispatch/services/quotePackageBuilder';
import { guardCaseBoardResponse } from '@/domains/quote/services/quoteResponseGuard';
import { BABTTABONG_CASE_BOARD_GOLDEN } from '@/domains/quote/evals/caseBoardGoldenCases';

describe('QuotePackage monthly quote invariants', () => {
  it('uses average monthly operating days instead of a 4-week shortcut', () => {
    expect(countAverageMonthlyOperatingDays({ weekdays: [1], includeHolidays: true }).operatingDays).toBe(4.35);
    expect(countAverageMonthlyOperatingDays({ weekdays: [1, 2, 3, 4, 5], includeHolidays: true }).operatingDays).toBe(21.73);
  });

  it('preserves fixed departures, vehicle types, pickup dwell timeline, and group rollups', () => {
    const pkg = buildQuotePackage(BABTTABONG_CASE_BOARD_GOLDEN);

    expect(pkg.summary.monthlyTotal).toBe(BABTTABONG_CASE_BOARD_GOLDEN.rollup.monthlyTotal);
    expect(pkg.groupRollups).toHaveLength(2);
    expect(pkg.customerRows.map((row) => row.slot)).toEqual(['점심', '저녁']);
    expect(BABTTABONG_CASE_BOARD_GOLDEN.cases.map((c) => c.departureLabel)).toEqual(['09:00', '14:00']);
    expect(BABTTABONG_CASE_BOARD_GOLDEN.cases[1].vehicleType).toBe('스타렉스');
    expect(BABTTABONG_CASE_BOARD_GOLDEN.cases[0].timeline?.[0]).toMatchObject({
      role: 'pickup',
      arrival: '08:50',
      departure: '09:00',
      dwellMinutes: 10,
    });
  });

  it('appends an authoritative case-board summary when a preset departure leaks into text', () => {
    const guarded = guardCaseBoardResponse(
      '08:00 출발 기준으로는 가능하고 강남&대치 라인은 레이로 보면 됩니다.',
      BABTTABONG_CASE_BOARD_GOLDEN
    );

    expect(guarded).toContain('월 합계는 케이스 보드 산출값');
    expect(guarded).toContain('09:00 / 14:00 기준');
    expect(guarded).toContain('강남&대치 저녁: 스타렉스');
    expect(guarded).toContain('보조 프리셋 시간이 보였다면 무시');
  });
});
