'use client';

import React from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';

export default function RouteResultsCard() {
  const { routeData } = useRouteOptimization();
  const summary = routeData?.summary;

  if (!summary) return null;

  return (
    <div className="glass-panel p-4 w-full">
      <div className="text-sm text-gray-700">총 거리</div>
      <div className="text-lg font-semibold text-gray-900">{(summary.totalDistance / 1000).toFixed(1)}km</div>
      <div className="mt-1 text-sm text-gray-700">예상 시간</div>
      <div className="text-lg font-semibold text-gray-900">{Math.round(summary.totalTime / 60)}분</div>
    </div>
  );
}


