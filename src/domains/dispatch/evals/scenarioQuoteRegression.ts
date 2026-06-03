/**
 * 시나리오 견적(역할 인지 + 정기 빈도 연환산 + 다중 비교) 회귀 검증.
 *
 * P0 (다중 수거→단일 하차, 연 N회 빈도, 3/5/10 시나리오 비교) 핵심 로직을 고정한다.
 */
import {
  annualVisits,
  annualizePrice,
  formatFrequency,
  parseFrequency,
} from '@/domains/dispatch/utils/frequency';
import { calculateScenarioQuote, deriveStopsCount } from '@/domains/dispatch/services/scenarioPricing';
import { compareScenarios } from '@/domains/dispatch/services/scenarioComparison';
import {
  analyzeDistanceTier,
  assessQuoteConfidence,
  buildPriceBreakdownRows,
  buildEtaBand,
  buildCostTransparency,
  summarizeComparison,
} from '@/domains/dispatch/services/scenarioInsights';
import { estimatedFuelCost } from '@/domains/quote/pricing';
import {
  perJobBasePrice,
  perJobRegularPrice,
  STOP_FEE,
} from '@/domains/quote/pricing';
import type { QuoteScenario, RouteMetrics } from '@/domains/dispatch/types/routePlan';

interface ScenarioCase {
  name: string;
  run: () => void;
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`[${label}] expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const KM20: RouteMetrics = { km: 20, driveMinutes: 60, dwellMinutes: 30, stopsCount: 0 };

/** 테라사이클 메일 기반: N개 수거지 + 문래역 단일 하차. */
function makeCollectionScenario(
  label: string,
  pickupCount: number,
  vehicleType: '레이' | '스타렉스',
  scheduleType: 'regular' | 'ad-hoc',
  metrics: RouteMetrics,
  frequency?: QuoteScenario['frequency']
): QuoteScenario {
  const stops: QuoteScenario['stops'] = [];
  for (let i = 0; i < pickupCount; i++) {
    stops.push({ address: `수거지${i + 1}`, role: 'pickup', weightKg: 15 });
  }
  stops.push({ address: '문래역', role: 'drop' });
  return { label, stops, vehicleType, scheduleType, frequency, routeMetrics: metrics };
}

export const SCENARIO_QUOTE_REGRESSION_CASES: ScenarioCase[] = [
  {
    name: '빈도 연환산: 분기 1회=4, 주 2회=104, 월 1회=12, 연 1회=1',
    run: () => {
      assertEqual(annualVisits({ per: 'quarter', count: 1 }), 4, 'quarter');
      assertEqual(annualVisits({ per: 'week', count: 2 }), 104, 'week2');
      assertEqual(annualVisits({ per: 'month', count: 1 }), 12, 'month');
      assertEqual(annualVisits({ per: 'year', count: 1 }), 1, 'year');
    },
  },
  {
    name: '연 비용 환산: 1회 100,000 × 분기1회 = 400,000',
    run: () => {
      assertEqual(annualizePrice(100000, { per: 'quarter', count: 1 }), 400000, 'annualize');
      assertEqual(annualizePrice(100000, undefined), 100000, 'no-frequency');
    },
  },
  {
    name: '빈도 자연어 파싱: "3개월 1회"/"분기 1회"/"연 4회"/"주 2회"',
    run: () => {
      assertEqual(parseFrequency('3개월 1회로 견적')?.per, 'quarter', '3개월→quarter');
      assertEqual(parseFrequency('분기 1회')?.count, 1, '분기 count');
      const yr = parseFrequency('연간 4회');
      assertEqual(yr?.per, 'year', '연간→year');
      assertEqual(yr?.count, 4, '연 4회 count');
      assertEqual(parseFrequency('주 2회 수거')?.count, 2, '주 2회');
      assertEqual(parseFrequency('아무 빈도 없음'), null, 'none');
    },
  },
  {
    name: '빈도 라벨: 분기 1회 → "연 4회 (분기 1회)"',
    run: () => {
      assertEqual(formatFrequency({ per: 'quarter', count: 1 }), '연 4회 (분기 1회)', 'label');
      assertEqual(formatFrequency(undefined), null, 'null');
    },
  },
  {
    name: '중간 경유지 수 추정: 3수거+1하차 → 2, 10수거+1하차 → 9',
    run: () => {
      assertEqual(deriveStopsCount(4), 2, '4stops');
      assertEqual(deriveStopsCount(11), 9, '11stops');
      assertEqual(deriveStopsCount(2), 0, '2stops');
    },
  },
  {
    name: '레이 비정기 견적: 단건 base33,000+경유비10,000 / 시간당 53,000 → 옹고잉 유리(시간당) 대표',
    run: () => {
      const s = makeCollectionScenario('3개 지점', 3, '레이', 'ad-hoc', KM20, { per: 'quarter', count: 1 });
      const r = calculateScenarioQuote(s);
      const expectedPerJobBase = perJobBasePrice('ray', 20); // 33,000
      const expectedPerJobStopFee = STOP_FEE.ray * 2; // 10,000
      assertEqual(r.plans.perJob.base, expectedPerJobBase, 'perJobBase');
      assertEqual(r.plans.perJob.stopFee, expectedPerJobStopFee, 'perJobStopFee');
      assertEqual(r.plans.perJob.total, expectedPerJobBase + expectedPerJobStopFee, 'perJobTotal');
      // 시간당: 90분(주행60+체류30) → 과금120분, 레이 26,500/h × 2h = 53,000, 유류할증 0(20km≤20km)
      assertEqual(r.plans.hourly.billMinutes, 120, 'billMinutes');
      assertEqual(r.plans.hourly.total, 53000, 'hourlyTotal');
      // 옹고잉 유리 = 높은 쪽(시간당 53,000)
      assertEqual(r.recommendedPlan, 'hourly', 'recommendedPlan');
      assertEqual(r.oneTimePrice, 53000, 'oneTime');
      assertEqual(r.annualPrice, 53000 * 4, 'annual');
      assertEqual(r.counts.pickup, 3, 'pickupCount');
      assertEqual(r.counts.drop, 1, 'dropCount');
      assertEqual(r.frequencyLabel, '연 4회 (분기 1회)', 'freqLabel');
    },
  },
  {
    name: '스타렉스 정기 견적: 단건 정기 가산(base×1.2+경유비×1.2) 산출 + 옹고잉 유리 대표값',
    run: () => {
      const s = makeCollectionScenario('3개 지점', 3, '스타렉스', 'regular', KM20);
      const r = calculateScenarioQuote(s);
      // 단건 정기 요금은 plans.perJob에 그대로 보존된다.
      assertEqual(r.plans.perJob.base, perJobRegularPrice('starex', 20), 'regularBase');
      assertEqual(r.plans.perJob.stopFee, Math.round(STOP_FEE.starex * 2 * 1.2), 'regularStopFee');
      // 대표값은 두 요금제 중 높은 쪽과 일치해야 한다.
      const higher = Math.max(r.plans.hourly.total, r.plans.perJob.total);
      assertEqual(r.oneTimePrice, higher, 'favorableRepresentative');
      assert(
        r.recommendedPlan === (r.plans.hourly.total >= r.plans.perJob.total ? 'hourly' : 'perJob'),
        'recommendedPlanMatchesHigher'
      );
    },
  },
  {
    name: '다중 비교: 3/5/10 지점 → 연 비용 최소(3개)가 추천',
    run: () => {
      const scenarios: QuoteScenario[] = [
        makeCollectionScenario('3개 지점', 3, '레이', 'ad-hoc', { km: 20, driveMinutes: 60, dwellMinutes: 30, stopsCount: 0 }, { per: 'quarter', count: 1 }),
        makeCollectionScenario('5개 지점', 5, '레이', 'ad-hoc', { km: 35, driveMinutes: 100, dwellMinutes: 50, stopsCount: 0 }, { per: 'quarter', count: 1 }),
        makeCollectionScenario('10개 지점', 10, '레이', 'ad-hoc', { km: 60, driveMinutes: 200, dwellMinutes: 100, stopsCount: 0 }, { per: 'quarter', count: 1 }),
      ];
      const cmp = compareScenarios(scenarios);
      assertEqual(cmp.results.length, 3, 'count');
      assertEqual(cmp.recommendedLabel, '3개 지점', 'recommended');
      assert(cmp.results[0].annualPrice < cmp.results[2].annualPrice, 'monotonic');
    },
  },
  {
    name: '운임 분해: 행 합계가 1회/연 운임과 일치',
    run: () => {
      const s = makeCollectionScenario('3개 지점', 3, '레이', 'ad-hoc', KM20, { per: 'quarter', count: 1 });
      const r = calculateScenarioQuote(s);
      const rows = buildPriceBreakdownRows(r);
      const components = rows.filter((row) => !row.isTotal).reduce((sum, row) => sum + row.amount, 0);
      assertEqual(components, r.oneTimePrice, 'componentsSum');
      const oneTimeRow = rows.find((row) => row.key === 'oneTime');
      assertEqual(oneTimeRow?.amount, r.oneTimePrice, 'oneTimeRow');
      const annualRow = rows.find((row) => row.key === 'annual');
      assertEqual(annualRow?.amount, r.annualPrice, 'annualRow');
    },
  },
  {
    name: '거리 구간: 레이 12km → 10~15km 구간, 다음 구간까지 3km 여유',
    run: () => {
      const tier = analyzeDistanceTier('ray', 12);
      assert(tier !== null, 'tierExists');
      assertEqual(tier!.currentFromKm, 10, 'from');
      assertEqual(tier!.currentToKm, 15, 'to');
      assertEqual(tier!.headroomKm, 3, 'headroom');
      assert((tier!.nextTierDelta ?? 0) > 0, 'nextDelta');
    },
  },
  {
    name: '신뢰도: km>0 → 최소 보통, km=0 → 낮음',
    run: () => {
      const ok = makeCollectionScenario('정상', 3, '레이', 'regular', KM20, { per: 'quarter', count: 1 });
      const okConf = assessQuoteConfidence(calculateScenarioQuote(ok), { realtimeTraffic: true });
      assertEqual(okConf.level, 'high', 'highWhenAllSignals');

      const zero: QuoteScenario = makeCollectionScenario('실패', 3, '레이', 'ad-hoc', {
        km: 0,
        driveMinutes: 0,
        dwellMinutes: 0,
        stopsCount: 0,
      });
      const lowConf = assessQuoteConfidence(calculateScenarioQuote(zero), { hasRouteError: true });
      assertEqual(lowConf.level, 'low', 'lowWhenNoRoute');
    },
  },
  {
    name: '비교 요약: 추천안 절감액 0, 차순위 양수',
    run: () => {
      const scenarios: QuoteScenario[] = [
        makeCollectionScenario('3개 지점', 3, '레이', 'ad-hoc', { km: 20, driveMinutes: 60, dwellMinutes: 30, stopsCount: 0 }, { per: 'quarter', count: 1 }),
        makeCollectionScenario('10개 지점', 10, '레이', 'ad-hoc', { km: 60, driveMinutes: 200, dwellMinutes: 100, stopsCount: 0 }, { per: 'quarter', count: 1 }),
      ];
      const cmp = compareScenarios(scenarios);
      const summary = summarizeComparison(cmp);
      assertEqual(summary.annualExtraByLabel['3개 지점'], 0, 'recommendedZero');
      assert((summary.annualExtraByLabel['10개 지점'] ?? 0) > 0, 'otherPositive');
      assert(typeof summary.rationale === 'string' && summary.rationale.length > 0, 'rationale');
    },
  },
  {
    name: 'ETA 밴드: 실시간 반영 시 마진이 더 좁고 정시 확률이 더 높다',
    run: () => {
      const metrics = { km: 30, driveMinutes: 90, dwellMinutes: 30, stopsCount: 1 };
      const live = buildEtaBand(metrics, { realtimeTraffic: true });
      const avg = buildEtaBand(metrics, { realtimeTraffic: false });
      assert(live !== null && avg !== null, 'bandsExist');
      assertEqual(live!.expectedMinutes, 120, 'expectedMinutes');
      assert(live!.marginMinutes < avg!.marginMinutes, 'tighterMargin');
      assert(live!.onTimeProbability > avg!.onTimeProbability, 'higherProb');
      assertEqual(live!.lowerMinutes, 120 - live!.marginMinutes, 'lower');
      assertEqual(buildEtaBand({ km: 0, driveMinutes: 0, dwellMinutes: 0, stopsCount: 0 }), null, 'zeroNull');
    },
  },
  {
    name: '운임 투명성: 실비(유류·통행료)가 pricing 함수와 일치하며 청구에 포함 명시',
    run: () => {
      const s = makeCollectionScenario('3개 지점', 3, '스타렉스', 'ad-hoc', {
        km: 30,
        driveMinutes: 90,
        dwellMinutes: 30,
        stopsCount: 1,
      });
      const r = calculateScenarioQuote(s);
      const cost = buildCostTransparency(r);
      assert(cost !== null, 'costExists');
      assertEqual(cost!.chargedOneTime, r.oneTimePrice, 'charged');
      assertEqual(cost!.estimatedFuel, estimatedFuelCost('starex', 30), 'fuel');
      // 통행료는 추정하지 않는다. Tmap 실측을 안 넘기면 null(실비 정산)이어야 한다.
      assertEqual(cost!.estimatedToll, null, 'toll');
      assertEqual(cost!.tollSource, 'unavailable', 'tollSource');
    },
  },
];

export function assertScenarioQuoteRegression() {
  const failures: string[] = [];
  for (const c of SCENARIO_QUOTE_REGRESSION_CASES) {
    try {
      c.run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`✗ ${c.name}: ${msg}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Scenario quote regression failed:\n${failures.join('\n')}`);
  }
}
