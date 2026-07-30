import { describe, expect, it } from 'vitest';
import { guardSingleQuoteResponse } from '@/domains/quote/services/quoteResponseGuard';

const quote = {
  recommendedPlan: 'hourly',
  oneTimePrice: 57000,
  basis: {
    distanceKm: 30.7,
    driveMinutes: 41,
    dwellTotalMinutes: 27,
    waitTotalMinutes: 0,
  },
  hourly: {
    total: 57000,
    billMinutes: 120,
    ratePerHour: 26500,
    fuelSurcharge: 4000,
    fuelSurchargeBreakdown: {
      includedDistanceKm: 20,
      excessDistanceKm: 10.7,
      stepKm: 10,
      stepCharge: 2000,
      chargedBins: 2,
      total: 4000,
    },
  },
  perJob: { total: 53000 },
};

describe('guardSingleQuoteResponse', () => {
  it('도구 결과에 없는 금액이 있으면 표준 계산 요약으로 교체한다', () => {
    const guarded = guardSingleQuoteResponse('시간당 요금은 25,200원입니다.', quote);
    expect(guarded).not.toContain('25,200원');
    expect(guarded).toContain('57,000원');
    expect(guarded).toContain('유류할증');
    expect(guarded).toContain('초과 10.7km');
  });

  it('금액은 맞지만 유류할증 설명이 빠지면 산식 한 줄을 보강한다', () => {
    const guarded = guardSingleQuoteResponse('추천 견적은 57,000원입니다.', quote);
    expect(guarded).toContain('운임표 유류할증 확인');
    expect(guarded).toContain('10km 구간 2회');
    expect(guarded).toContain('4,000원');
  });
});
