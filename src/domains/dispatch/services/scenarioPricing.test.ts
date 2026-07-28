import { describe, expect, it } from 'vitest';
import { calculateScenarioQuote } from '@/domains/dispatch/services/scenarioPricing';
import type { QuoteScenario, RouteMetrics } from '@/domains/dispatch/types/routePlan';

/**
 * 현장 대기(구속시간) 과금 회귀.
 * 조기배송 금지로 발생한 대기(waitMinutes)는 시간당 요금제의 과금분(billMinutes)에
 * 반드시 포함되어야 한다. 이게 스프레드 마감 라인 과소청구의 원인이었다.
 */
// 주행90+체류30 = 120분(30분 배수·최소과금 120분 바닥값)으로 잡아 30분 올림/바닥 간섭 제거.
const baseMetrics: RouteMetrics = { km: 30, driveMinutes: 90, dwellMinutes: 30, stopsCount: 2 };

function scenario(metrics: RouteMetrics): QuoteScenario {
  return {
    label: 'wait-test',
    stops: [
      { address: '수거지', role: 'pickup', weightKg: 10 },
      { address: '하차1', role: 'drop' },
      { address: '하차2', role: 'drop' },
    ],
    vehicleType: '레이',
    scheduleType: 'ad-hoc',
    routeMetrics: metrics,
  };
}

describe('calculateScenarioQuote — 현장 대기(구속시간) 과금', () => {
  it('waitMinutes가 시간당 과금분(billMinutes)에 그대로 더해진다', () => {
    const noWait = calculateScenarioQuote(scenario(baseMetrics));
    const withWait = calculateScenarioQuote(scenario({ ...baseMetrics, waitMinutes: 60 }));

    // 구속시간 = 주행60 + 체류30 (+대기). 대기 60분 → 과금분 60분 증가.
    expect(withWait.plans.hourly.billMinutes - noWait.plans.hourly.billMinutes).toBe(60);
    expect(withWait.plans.hourly.total).toBeGreaterThan(noWait.plans.hourly.total);
  });

  it('waitMinutes 미지정/0이면 과거와 동일(하위호환)', () => {
    const a = calculateScenarioQuote(scenario(baseMetrics));
    const b = calculateScenarioQuote(scenario({ ...baseMetrics, waitMinutes: 0 }));
    expect(a.plans.hourly.total).toBe(b.plans.hourly.total);
    expect(a.plans.hourly.billMinutes).toBe(b.plans.hourly.billMinutes);
  });
});
