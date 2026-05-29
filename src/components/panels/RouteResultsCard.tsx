'use client';

import React from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';
import { SummaryCard } from '@/components/ui';

export default function RouteResultsCard() {
  const { routeData } = useRouteOptimization();
  const summary = routeData?.summary;

  if (!summary) return null;

  const detail = summary as unknown as { travelTime: number; dwellTime: number; totalTime: number };

  return (
    <div className="grid w-full grid-cols-2 gap-3">
      <SummaryCard label="총 거리" value={(summary.totalDistance / 1000).toFixed(1)} unit="km" />
      <SummaryCard label="주행 시간" value={Math.round(detail.travelTime / 60)} unit="분" />
      <SummaryCard label="체류 시간" value={Math.round(detail.dwellTime / 60)} unit="분" />
      <SummaryCard label="총 소요" value={Math.round(detail.totalTime / 60)} unit="분" />
    </div>
  );
}


