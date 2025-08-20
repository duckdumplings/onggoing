'use client';

import React, { useEffect, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

export default function QuoteCalculatorPanel() {
  const { routeData, dwellMinutes } = useRouteOptimization();
  const [total, setTotal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!routeData?.summary) return;
    const { totalDistance, totalTime, vehicleTypeCode } = routeData.summary as any;
    const call = async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch('/api/quote-calculation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            distance: totalDistance,
            time: totalTime,
            vehicleType: vehicleTypeCode === '2' ? '스타렉스' : '레이',
            dwellMinutes
          })
        });
        const data = await res.json();
        if (data?.success) {
          setTotal(data.quote.formattedTotal);
        } else {
          setError(data?.error?.message || '견적 계산 실패');
        }
      } catch (e: any) {
        setError(e?.message || '네트워크 오류');
      } finally {
        setLoading(false);
      }
    };
    call();
  }, [routeData?.summary?.totalDistance, routeData?.summary?.totalTime, routeData?.summary?.vehicleTypeCode, dwellMinutes.join(',')]);

  return (
    <section className="glass-card border-b border-white/40 max-h-[40vh] overflow-y-auto">
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-2">💰 자동 견적</h3>
        {loading && <div className="text-sm text-gray-500">계산 중…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {total && !loading && !error ? (
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-lg font-bold text-blue-900">{total}</div>
            <div className="text-xs text-blue-700">경로 최적화 결과 기반 임시 계산</div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">경로 최적화 후 자동 계산됩니다</div>
        )}
      </div>
    </section>
  );
}


