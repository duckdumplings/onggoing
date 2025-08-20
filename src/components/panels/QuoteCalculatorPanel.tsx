'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

export default function QuoteCalculatorPanel() {
  const { routeData, dwellMinutes, destinations } = useRouteOptimization();
  const [total, setTotal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [plans, setPlans] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'hourly' | 'perjob' | 'settings'>('summary');
  const [vehicle, setVehicle] = useState<'ray' | 'starex'>('ray');
  const [bulk, setBulk] = useState(false);
  const [scheduleType, setScheduleType] = useState<'regular' | 'ad-hoc'>('ad-hoc');

  const stopsCount = useMemo(() => Math.max(0, (destinations?.length || 0) - 1), [destinations]);

  useEffect(() => {
    if (!routeData?.summary) return;
    const { totalDistance, totalTime } = routeData.summary as any;
    const call = async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch('/api/quote-calculation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            distance: totalDistance,
            time: totalTime,
            vehicleType: vehicle === 'starex' ? '스타렉스' : '레이',
            dwellMinutes,
            stopsCount,
            bulk,
            scheduleType
          })
        });
        const data = await res.json();
        if (data?.success) {
          setTotal(data.quote.formattedTotal);
          setDetail(data.quote.breakdown);
          setPlans(data.plans);
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
  }, [routeData?.summary?.totalDistance, routeData?.summary?.totalTime, vehicle, bulk, scheduleType, stopsCount, dwellMinutes.join(',')]);

  return (
    <section className="glass-card border-b border-white/40 max-h-[40vh] overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">💰 자동 견적</h3>
          <div className="flex items-center gap-2">
            <select
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value as 'ray' | 'starex')}
              className="h-8 border rounded px-2 text-sm"
              aria-label="차종 선택"
            >
              <option value="ray">레이</option>
              <option value="starex">스타렉스</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-700">
              <input type="checkbox" className="accent-blue-600" checked={bulk} onChange={(e) => setBulk(e.target.checked)} />
              단건 벌크
            </label>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-3 text-sm">
          <button className={`px-3 py-1 rounded ${activeTab === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('summary')}>요약</button>
          <button className={`px-3 py-1 rounded ${activeTab === 'hourly' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('hourly')}>시간당</button>
          <button className={`px-3 py-1 rounded ${activeTab === 'perjob' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('perjob')}>단건</button>
          <button className={`px-3 py-1 rounded ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('settings')}>설정</button>
        </div>
        {loading && <div className="text-sm text-gray-500">계산 중…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && (
          <div className="bg-blue-50 rounded-lg p-3 text-sm">
            {activeTab === 'summary' && (
              <div>
                <div className="text-xl md:text-2xl font-extrabold text-gray-900 tracking-tight">
                  {plans?.hourly?.total && plans?.perJob?.total
                    ? `${plans.hourly.total > plans.perJob.total ? '추천 · 시간당 · ' + plans.hourly.formatted : '추천 · 단건 · ' + plans.perJob.formatted}`
                    : (total ?? '—')}
                </div>
                <ul className="mt-2 text-blue-800 space-y-1">
                  <li>차종: {vehicle === 'starex' ? '스타렉스' : '레이'}</li>
                  <li>총 운행시간: {(detail?.driveMinutes ?? 0) + (detail?.dwellTotalMinutes ?? 0)}분 (주행 {detail?.driveMinutes ?? 0}· 체류 {detail?.dwellTotalMinutes ?? 0})</li>
                  <li>주행거리: {(detail?.km ?? 0).toFixed?.(1)}km</li>
                  {detail?.fuel && (
                    <li>예상 유류비(참고): ₩{detail.fuel.fuelCost.toLocaleString('ko-KR')}</li>
                  )}
                </ul>
              </div>
            )}
            {activeTab === 'hourly' && plans?.hourly && (
              <div>
                <div>과금시간: {plans.hourly.billMinutes}분 (30분 올림, 최소 120분)</div>
                <div>시간당 단가: ₩{(plans.hourly.ratePerHour ?? 0).toLocaleString('ko-KR')}</div>
                <div>유류비 할증: ₩{(plans.hourly.fuelSurcharge ?? 0).toLocaleString('ko-KR')}</div>
                <div className="mt-1 font-semibold">시간당 총액: {plans.hourly.formatted}</div>
              </div>
            )}
            {activeTab === 'perjob' && plans?.perJob && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-1 text-xs text-gray-700">
                    <input type="radio" name="schedule" checked={scheduleType === 'ad-hoc'} onChange={() => setScheduleType('ad-hoc')} /> 비정기(하루)
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-700">
                    <input type="radio" name="schedule" checked={scheduleType === 'regular'} onChange={() => setScheduleType('regular')} /> 정기(일주일+)
                  </label>
                </div>
                <div>
                  기본요금(구간): {plans.perJob.isBulkAndRegular || plans.perJob.bulk ? '??' : `₩${(plans.perJob.baseEffective ?? plans.perJob.base ?? 0).toLocaleString('ko-KR')}`}
                </div>
                <div>
                  경유지 정액({stopsCount}개): {plans.perJob.isBulkAndRegular || plans.perJob.bulk ? '??' : `₩${(plans.perJob.stopFeeEffective ?? plans.perJob.stopFee ?? 0).toLocaleString('ko-KR')}`}
                </div>
                <div className="mt-1 font-semibold">단건 총액: {plans.perJob.formatted}</div>
              </div>
            )}
            {activeTab === 'settings' && (
              <div>
                <div className="text-xs text-gray-700">현재 환경설정(유류가, 연비 등)은 .env 기반입니다. 추후 업로드/모달로 대체 예정.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}


