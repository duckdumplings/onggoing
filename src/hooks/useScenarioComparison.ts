'use client';

import { useCallback, useState } from 'react';
import type { ScenarioComparison } from '@/domains/dispatch/services/scenarioComparison';
import type { ComparisonSortKey } from '@/domains/dispatch/services/scenarioComparison';
import type { QuoteScenario } from '@/domains/dispatch/types/routePlan';

interface ScenarioRouteError {
  label: string;
  message: string;
}

interface UseScenarioComparisonResult {
  comparison: ScenarioComparison | null;
  routeErrors: ScenarioRouteError[];
  loading: boolean;
  error: string | null;
  /** 시나리오 배열을 보내 병렬 견적·비교를 수행한다. */
  run: (
    scenarios: QuoteScenario[],
    options?: { sortKey?: ComparisonSortKey; departureAt?: string }
  ) => Promise<ScenarioComparison | null>;
  reset: () => void;
}

/**
 * /api/dispatch/scenario-quote를 호출해 다중 시나리오(3/5/10개 지점) 병렬 비교를 수행한다.
 * AI 채팅 모달·좌측 패널 어디서든 동일하게 사용.
 */
export function useScenarioComparison(): UseScenarioComparisonResult {
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);
  const [routeErrors, setRouteErrors] = useState<ScenarioRouteError[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback<UseScenarioComparisonResult['run']>(async (scenarios, options) => {
    setLoading(true);
    setError(null);
    setRouteErrors([]);
    try {
      const res = await fetch('/api/dispatch/scenario-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarios,
          sortKey: options?.sortKey,
          departureAt: options?.departureAt,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        const message = json?.error?.message || `요청 실패 (HTTP ${res.status})`;
        setError(message);
        return null;
      }
      setComparison(json.comparison as ScenarioComparison);
      if (Array.isArray(json.routeErrors)) setRouteErrors(json.routeErrors);
      return json.comparison as ScenarioComparison;
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setComparison(null);
    setRouteErrors([]);
    setError(null);
  }, []);

  return { comparison, routeErrors, loading, error, run, reset };
}
