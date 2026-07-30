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
    expect(q.recommendedPlan).toBe('hourly');

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
    expect(q.perJobTotal).toBe(
      Number(q.perJobBreakdown.base) + Number(q.perJobBreakdown.stopFee),
    );
    expect(q.perJobBreakdown.effectiveStopsCount).toBe(Math.max(0, q.destinationCount - 1));
  });

  it('대표 견적은 금액 비교와 무관하게 시간당 운임이다', () => {
    const q = computeRouteQuote(summary, 2);
    expect(q).not.toBeNull();
    if (!q) return;

    expect(q.recommendedPlan).toBe('hourly');
    expect(q.totalPrice).toBe(q.hourlyTotal);
  });

  it('waitTime(현장 대기)이 구속시간과 요금에 반영된다', () => {
    // 조기배송 금지로 발생한 대기 60분(3600초)은 구속시간에 포함되어 과금돼야 한다.
    const withWait = computeRouteQuote({ ...summary, waitTime: 3600 }, 2);
    const noWait = computeRouteQuote(summary, 2);
    expect(withWait).not.toBeNull();
    expect(noWait).not.toBeNull();
    if (!withWait || !noWait) return;

    // waitTotalMin = round(3600/60) = 60
    expect(withWait.waitTotalMin).toBe(60);
    expect(noWait.waitTotalMin).toBe(0);
    // 구속시간 = 주행 + 체류 + 대기
    expect(withWait.totalBillMinutes).toBe(withWait.driveMinutes + withWait.dwellTotalMin + withWait.waitTotalMin);
    expect(withWait.totalBillMinutes).toBe(noWait.totalBillMinutes + 60);
    // 대기가 붙으면 과금분·시간당 요금이 줄지 않는다(단조 증가).
    expect(withWait.billMinutes).toBeGreaterThanOrEqual(noWait.billMinutes);
    expect(withWait.hourlyTotal).toBeGreaterThanOrEqual(noWait.hourlyTotal);
  });

  it('waitTime 미지정 시 기존 동작과 동일하다(하위호환)', () => {
    const q = computeRouteQuote(summary, 2);
    expect(q?.waitTotalMin).toBe(0);
    expect(q?.totalBillMinutes).toBe((q?.driveMinutes ?? 0) + (q?.dwellTotalMin ?? 0));
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

  it('8시간 운임표 범위를 넘으면 마지막 단가로 자동 연장하지 않는다', () => {
    const q = computeRouteQuote(
      { ...summary, travelTime: 9 * 60 * 60, dwellTime: 0, waitTime: 0 },
      2,
    );
    expect(q).toBeNull();
  });

  it('60km 초과는 시간당 견적만 유지하고 단건 참고값은 미제공한다', () => {
    const q = computeRouteQuote(
      { totalDistance: 70_000, travelTime: 7_200, dwellTime: 0, vehicleTypeCode: '1' },
      2,
    );
    expect(q?.recommendedPlan).toBe('hourly');
    expect(q?.totalPrice).toBe(q?.hourlyTotal);
    expect(q?.perJobTotal).toBeNull();
    expect(q?.perJobBreakdown.available).toBe(false);
  });
});
