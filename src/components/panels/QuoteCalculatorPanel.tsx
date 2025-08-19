'use client';

import React, { useEffect, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

export default function QuoteCalculatorPanel() {
  const { routeData } = useRouteOptimization();
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!routeData?.summary) return;
    const { totalDistance, totalTime, vehicleTypeCode } = routeData.summary;
    // 임시 계산식: 후속 태스크(T-034)에서 API 연동
    const base = vehicleTypeCode === 'STAREX' ? 1200 : 800;
    const distanceCharge = (totalDistance / 1000) * (vehicleTypeCode === 'STAREX' ? 150 : 100);
    const timeCharge = (totalTime / 60) * 50;
    setTotal(Math.round(base + distanceCharge + timeCharge));
  }, [routeData?.summary?.totalDistance, routeData?.summary?.totalTime, routeData?.summary?.vehicleTypeCode]);

  return (
    <section className="glass-card border-b border-white/40 max-h-[40vh] overflow-y-auto">
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-2">💰 자동 견적</h3>
        {total ? (
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-lg font-bold text-blue-900">{`₩${total.toLocaleString('ko-KR')}`}</div>
            <div className="text-xs text-blue-700">경로 최적화 결과 기반 임시 계산</div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">경로 최적화 후 자동 계산됩니다</div>
        )}
      </div>
    </section>
  );
}


