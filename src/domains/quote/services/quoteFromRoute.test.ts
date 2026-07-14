import { describe, expect, it } from 'vitest';
import { computeRouteQuote } from '@/domains/quote/services/quoteFromRoute';

describe('computeRouteQuote', () => {
  // 대표 summary 입력: 실제 pricing 함수를 그대로 호출(모킹 없음).
  const summary = {
    totalDistance: 24000, // m
    travelTime: 2760, // sec
    dwellTime: 1620, // sec
    vehicleTypeCode: '1', // 레이
  };

  it('summary 가 없으면 null 을 반환한다', () => {
    expect(computeRouteQuote(null, 2)).toBeNull();
    expect(computeRouteQuote(undefined, 2)).toBeNull();
    expect(computeRouteQuote(0 as any, 2)).toBeNull();
  });

  it('모든 필드가 존재하고 타입이 맞는다', () => {
    const q = computeRouteQuote(summary, 2);
    expect(q).not.toBeNull();
    if (!q) return;

    expect(q.vehicleTypeLabel).toBe('레이');
    expect(typeof q.distanceKm).toBe('number');
    expect(typeof q.driveMinutes).toBe('number');
    expect(typeof q.dwellTotalMin).toBe('number');
    expect(typeof q.totalBillMinutes).toBe('number');
    expect(typeof q.billMinutes).toBe('number');
    expect(typeof q.destinationCount).toBe('number');
    expect(typeof q.hourlyTotal).toBe('number');
    expect(typeof q.perJobTotal).toBe('number');
    expect(typeof q.totalPrice).toBe('number');
    expect(['hourly', 'perJob']).toContain(q.recommendedPlan);

    // hourlyBreakdown
    expect(typeof q.hourlyBreakdown.billMinutes).toBe('number');
    expect(typeof q.hourlyBreakdown.hourlyRate).toBe('number');
    expect(typeof q.hourlyBreakdown.base).toBe('number');
    expect(typeof q.hourlyBreakdown.fuelSurcharge).toBe('number');

    // perJobBreakdown
    expect(typeof q.perJobBreakdown.base).toBe('number');
    expect(typeof q.perJobBreakdown.stopFee).toBe('number');
    expect(typeof q.perJobBreakdown.effectiveStopsCount).toBe('number');
  });

  it('파생값이 TmapMainMap 계산식과 일치한다', () => {
    const q = computeRouteQuote(summary, 2);
    expect(q).not.toBeNull();
    if (!q) return;

    expect(q.distanceKm).toBe(24); // 24000m → 24.0km
    expect(q.driveMinutes).toBe(Math.ceil(2760 / 60)); // 46
    expect(q.dwellTotalMin).toBe(Math.round(1620 / 60)); // 27
    expect(q.totalBillMinutes).toBe(q.driveMinutes + q.dwellTotalMin);
    expect(q.destinationCount).toBe(1); // max(0, 2 - 1)
    expect(q.billMinutes).toBeGreaterThanOrEqual(120); // roundUpTo30Minutes 최소 120분
    expect(q.hourlyBreakdown.billMinutes).toBe(q.billMinutes);
    expect(q.hourlyTotal).toBe(q.hourlyBreakdown.base + q.hourlyBreakdown.fuelSurcharge);
    expect(q.perJobTotal).toBe(q.perJobBreakdown.base + q.perJobBreakdown.stopFee);
    expect(q.perJobBreakdown.effectiveStopsCount).toBe(Math.max(0, q.destinationCount - 1));
  });

  it('recommendedPlan 규칙: hourlyTotal <= perJobTotal ? hourly : perJob', () => {
    const q = computeRouteQuote(summary, 2);
    expect(q).not.toBeNull();
    if (!q) return;

    const expectedPlan = q.hourlyTotal <= q.perJobTotal ? 'hourly' : 'perJob';
    expect(q.recommendedPlan).toBe(expectedPlan);
    expect(q.totalPrice).toBe(expectedPlan === 'hourly' ? q.hourlyTotal : q.perJobTotal);
  });

  it("vehicleTypeCode '2' 는 스타렉스로 매핑된다", () => {
    const q = computeRouteQuote({ ...summary, vehicleTypeCode: '2' }, 2);
    expect(q?.vehicleTypeLabel).toBe('스타렉스');
  });

  it('travelTime 이 없으면 totalTime 을 사용한다', () => {
    const q = computeRouteQuote(
      { totalDistance: 24000, totalTime: 2760, dwellTime: 1620, vehicleTypeCode: '1' },
      2,
    );
    expect(q?.driveMinutes).toBe(Math.ceil(2760 / 60));
  });
});
