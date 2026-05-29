/**
 * 다중 시나리오 병렬 비교.
 *
 * 기존 챗봇은 "한 번에 하나의 라인만" 정책으로 다중 시나리오를 차단했다.
 * 본 모듈은 N개 시나리오(예: 3/5/10개 지점)를 각각 견적한 뒤 비교 테이블을
 * 만들고, 기준(연 비용 등)으로 정렬·추천한다.
 */

import { calculateScenarioQuote } from '@/domains/dispatch/services/scenarioPricing';
import type {
  QuoteScenario,
  RouteMetrics,
  ScenarioQuoteResult,
} from '@/domains/dispatch/types/routePlan';

export type ComparisonSortKey = 'annualPrice' | 'oneTimePrice' | 'km' | 'totalMinutes';

export interface ScenarioComparison {
  results: ScenarioQuoteResult[];
  /** 정렬 기준에서 가장 저렴/짧은 시나리오 라벨. */
  recommendedLabel: string | null;
  sortedBy: ComparisonSortKey;
}

function metricValue(r: ScenarioQuoteResult, key: ComparisonSortKey): number {
  switch (key) {
    case 'oneTimePrice':
      return r.oneTimePrice;
    case 'km':
      return r.metrics.km;
    case 'totalMinutes':
      return r.metrics.driveMinutes + r.metrics.dwellMinutes;
    case 'annualPrice':
    default:
      return r.annualPrice;
  }
}

/**
 * 시나리오 배열을 병렬 견적하고 비교 결과를 만든다.
 *
 * @param scenarios 시나리오 입력
 * @param metricsByLabel 라벨→경로메트릭 매핑(시나리오 내 routeMetrics가 우선)
 * @param sortKey 추천/정렬 기준(기본: 연 비용)
 */
export function compareScenarios(
  scenarios: QuoteScenario[],
  metricsByLabel: Record<string, RouteMetrics> = {},
  sortKey: ComparisonSortKey = 'annualPrice'
): ScenarioComparison {
  const results = scenarios.map((s) =>
    calculateScenarioQuote(s, metricsByLabel[s.label])
  );

  const recommended = results.reduce<ScenarioQuoteResult | null>((best, cur) => {
    if (!best) return cur;
    return metricValue(cur, sortKey) < metricValue(best, sortKey) ? cur : best;
  }, null);

  return {
    results,
    recommendedLabel: recommended?.label ?? null,
    sortedBy: sortKey,
  };
}
