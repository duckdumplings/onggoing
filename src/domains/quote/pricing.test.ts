import { describe, it, expect } from 'vitest';
import {
  pickHourlyRate,
  roundUpTo30Minutes,
  fuelSurchargeHourlyCorrect,
  perJobBasePrice,
  perJobRegularPrice,
} from './pricing';

describe('roundUpTo30Minutes', () => {
  it('최소 120분(2시간)을 보장한다', () => {
    expect(roundUpTo30Minutes(0)).toBe(120);
    expect(roundUpTo30Minutes(90)).toBe(120);
    expect(roundUpTo30Minutes(120)).toBe(120);
  });
  it('30분 단위로 올림한다', () => {
    expect(roundUpTo30Minutes(121)).toBe(150);
    expect(roundUpTo30Minutes(150)).toBe(150);
    expect(roundUpTo30Minutes(151)).toBe(180);
  });
});

describe('pickHourlyRate', () => {
  it('구간 단가를 반환한다', () => {
    expect(pickHourlyRate('ray', 120)).toBe(26500);
    expect(pickHourlyRate('starex', 120)).toBe(36000);
  });
  it('스타렉스 2.5시간 인버전(단가 인하)을 보존한다', () => {
    expect(pickHourlyRate('starex', 150)).toBe(34000);
    expect(pickHourlyRate('starex', 150)).toBeLessThan(pickHourlyRate('starex', 120));
  });
  it('표 범위를 넘으면 마지막 구간 단가로 폴백한다', () => {
    expect(pickHourlyRate('ray', 1000)).toBe(21000);
  });
});

describe('fuelSurchargeHourlyCorrect', () => {
  it('기본거리(과금시간×10km) 이내면 0', () => {
    // 120분 → 기본거리 20km
    expect(fuelSurchargeHourlyCorrect('ray', 10, 120)).toBe(0);
    expect(fuelSurchargeHourlyCorrect('ray', 20, 120)).toBe(0);
  });
  it('초과 10km 이하는 첫 구간 정액', () => {
    expect(fuelSurchargeHourlyCorrect('ray', 30, 120)).toBe(2000);
    expect(fuelSurchargeHourlyCorrect('starex', 30, 120)).toBe(2800);
  });
  it('초과 10km 단위로 누적한다', () => {
    // 45km, 기본 20km → 초과 25km → ceil(25/10)=3 bins
    expect(fuelSurchargeHourlyCorrect('ray', 45, 120)).toBe(6000);
    expect(fuelSurchargeHourlyCorrect('starex', 45, 120)).toBe(8400);
  });
});

describe('perJobBasePrice / perJobRegularPrice', () => {
  it('구간별 단건 요금', () => {
    expect(perJobBasePrice('ray', 3)).toBe(24000);
    expect(perJobBasePrice('starex', 3)).toBe(31000);
  });
  it('60km 초과는 마지막 구간 요금으로 폴백', () => {
    expect(perJobBasePrice('ray', 100)).toBe(70000);
  });
  it('레이 정기는 스타렉스 단건 요금표를 따른다', () => {
    expect(perJobRegularPrice('ray', 3)).toBe(31000);
  });
  it('스타렉스 정기는 단건의 1.2배', () => {
    expect(perJobRegularPrice('starex', 3)).toBe(Math.round(31000 * 1.2));
  });
});
