import { describe, expect, it } from 'vitest';
import {
  calculateFuelSurchargeFromPayload,
  calculatePerJobReferenceFromPayloads,
  calculateRecurringHourlyTotals,
  type FuelSurchargePayload,
  type PerJobRateTablePayload,
} from './rateTableCalculations';

const fuelPayload: FuelSurchargePayload = {
  currency: 'KRW',
  baseKmPerHour: 10,
  stepKm: 10,
  stepCharge: 2000,
  bins: [],
};

const rayPerJob: PerJobRateTablePayload = {
  currency: 'KRW',
  maxKm: 60,
  stopFee: 5000,
  tiers: [{ fromKm: 0, toKm: 60, baseFare: 40_000 }],
  regularPolicy: { mode: 'vehicle-table', vehicle: 'starex' },
};

const starexPerJob: PerJobRateTablePayload = {
  currency: 'KRW',
  maxKm: 60,
  stopFee: 7000,
  tiers: [{ fromKm: 0, toKm: 60, baseFare: 53_000 }],
  regularPolicy: { mode: 'factor', factor: 1.2 },
};

describe('DB rate-table payload calculations', () => {
  it('20회 합계에 매회 유류할증을 포함한다', () => {
    expect(
      calculateRecurringHourlyTotals({
        baseFare: 69_000,
        fuelSurcharge: 2_000,
        visits: 20,
      }),
    ).toEqual({
      perVisit: 71_000,
      recurringTotal: 1_420_000,
      visits: 20,
    });
  });

  it('포함거리 초과분에만 10km 단위 유류할증을 적용한다', () => {
    expect(calculateFuelSurchargeFromPayload('ray', fuelPayload, 30.7, 120)).toMatchObject({
      includedDistanceKm: 20,
      chargedBins: 2,
      total: 4000,
    });
  });

  it('레이 정기는 DB 스타렉스 참고표와 경유비를 사용한다', () => {
    expect(
      calculatePerJobReferenceFromPayloads({
        vehicle: 'ray',
        scheduleType: 'regular',
        km: 30.7,
        stopsCount: 1,
        own: rayPerJob,
        starex: starexPerJob,
      }),
    ).toMatchObject({
      available: true,
      referenceOnly: true,
      base: 53_000,
      stopFee: 7000,
      total: 60_000,
    });
  });

  it('60km 초과는 마지막 구간으로 뭉개지 않고 참고 불가로 반환한다', () => {
    expect(
      calculatePerJobReferenceFromPayloads({
        vehicle: 'ray',
        scheduleType: 'ad-hoc',
        km: 61,
        stopsCount: 0,
        own: rayPerJob,
        starex: starexPerJob,
      }),
    ).toMatchObject({
      available: false,
      total: null,
      base: null,
      stopFee: null,
    });
  });
});
