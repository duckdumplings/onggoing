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

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-sm text-gray-700">이동 시간(주행)</div>
          <div className="text-lg font-semibold text-gray-900">{Math.round((summary as any).travelTime / 60)}분</div>
        </div>
        <div>
          <div className="text-sm text-gray-700">체류 시간</div>
          <div className="text-lg font-semibold text-gray-900">{Math.round((summary as any).dwellTime / 60)}분</div>
        </div>
        <div>
          <div className="text-sm text-gray-700">총 소요시간</div>
          <div className="text-lg font-semibold text-gray-900">{Math.round((summary as any).totalTime / 60)}분</div>
        </div>
      </div>
    </div>
  );
}


