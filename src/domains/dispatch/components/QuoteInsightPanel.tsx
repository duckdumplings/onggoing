'use client';

import React from 'react';
import type { ScenarioQuoteResult } from '@/domains/dispatch/types/routePlan';
import {
  assessQuoteConfidence,
  buildScenarioSavingsTips,
  buildEtaBand,
  buildCostTransparency,
  type ConfidenceInput,
  type SavingsTip,
} from '@/domains/dispatch/services/scenarioInsights';
import PriceBreakdownCard from './PriceBreakdownCard';
import SavingsCoachCard from './SavingsCoachCard';
import ConfidenceBadge from './ConfidenceBadge';
import EtaConfidenceCard from './EtaConfidenceCard';
import CostTransparencyCard from './CostTransparencyCard';

interface QuoteInsightPanelProps {
  result: ScenarioQuoteResult;
  confidenceInput?: ConfidenceInput;
  /** 출발 시각(ISO). ETA 밴드에 도착 시각을 표시할 때 사용. */
  departureAt?: string;
  onApplyTip?: (tip: SavingsTip) => void;
}

/**
 * 한 견적안의 신뢰 인사이트 묶음: 운임 분해 · 절감/안정성 코치 · 도착 신뢰 구간 ·
 * 운임 투명성 · 신뢰도 배지. 시나리오 비교 행 펼침, 견적 상세보기 어디서든 재사용한다.
 */
export default function QuoteInsightPanel({
  result,
  confidenceInput,
  departureAt,
  onApplyTip,
}: QuoteInsightPanelProps) {
  const tips = buildScenarioSavingsTips(result);
  const confidence = assessQuoteConfidence(result, confidenceInput);
  const etaBand = buildEtaBand(result.metrics, { realtimeTraffic: confidenceInput?.realtimeTraffic });
  const cost = buildCostTransparency(result);

  return (
    <div className="space-y-3">
      <PriceBreakdownCard result={result} />
      <SavingsCoachCard tips={tips} onApply={onApplyTip} />
      {etaBand && <EtaConfidenceCard band={etaBand} departureAt={departureAt} />}
      {cost && <CostTransparencyCard cost={cost} />}
      <ConfidenceBadge confidence={confidence} />
    </div>
  );
}
