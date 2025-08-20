'use client';

import React, { useEffect, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

export default function QuoteCalculatorPanel() {
  const { routeData, dwellMinutes } = useRouteOptimization();
  const [total, setTotal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

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
          setDetail(data.quote.breakdown);
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
            <div className="mt-2 text-xs text-blue-700">
              {detail?.planName} · 차량가중치 {detail?.vehicleWeight}
            </div>
            <ul className="mt-2 text-xs text-blue-800 space-y-1">
              <li>주행거리: {(detail?.km ?? 0).toFixed?.(1)}km</li>
              <li>주행시간: {detail?.driveMinutes ?? 0}분</li>
              <li>총 체류시간: {detail?.dwellTotalMinutes ?? 0}분</li>
              <li>기본료: ₩{(detail?.baseRate ?? 0).toLocaleString('ko-KR')}</li>
              <li>거리요금(₩{detail?.perKm ?? 0}/km): ₩{(detail?.distanceCharge ?? 0).toLocaleString('ko-KR')}</li>
              <li>시간요금(₩{detail?.perMin ?? 0}/분): ₩{(detail?.timeCharge ?? 0).toLocaleString('ko-KR')}</li>
              <li>체류요금(₩{detail?.perMin ?? 0}/분): ₩{(detail?.dwellCharge ?? 0).toLocaleString('ko-KR')}</li>
              {detail?.fuel && (
                <li>예상 유류비: {detail.fuel.liters}L × ₩{detail.fuel.fuelPricePerL.toLocaleString('ko-KR')} = ₩{detail.fuel.fuelCost.toLocaleString('ko-KR')}</li>
              )}
            </ul>
          </div>
        ) : (
          <div className="text-sm text-gray-500">경로 최적화 후 자동 계산됩니다</div>
        )}
      </div>
    </section>
  );
}


