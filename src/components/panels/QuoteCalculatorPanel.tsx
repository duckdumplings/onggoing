'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';

export default function QuoteCalculatorPanel() {
  const { routeData, dwellMinutes, destinations } = useRouteOptimization();
  const [total, setTotal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [plans, setPlans] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'hourly' | 'perjob' | 'settings'>('summary');
  const [vehicle, setVehicle] = useState<'ray' | 'starex'>('ray');
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
  }, [routeData?.summary?.totalDistance, routeData?.summary?.totalTime, vehicle, scheduleType, stopsCount, dwellMinutes.join(',')]);

  return (
    <section className="glass-card border-b border-white/40 bg-gradient-to-br from-green-50/30 to-emerald-50/30 transition-all duration-300" data-section="quote">
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
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-center">
                    <div className="text-xs text-blue-600 font-medium mb-1">추천 요금제</div>
                    <div className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                      {plans?.hourly?.total && plans?.perJob?.total
                        ? (plans.hourly.total > plans.perJob.total ? '시간당 요금제' : '단건 요금제')
                        : '—'}
                    </div>
                    <div className="text-lg md:text-xl font-semibold text-blue-600 mt-1">
                      {plans?.hourly?.total && plans?.perJob?.total
                        ? (plans.hourly.total > plans.perJob.total ? plans.hourly.formatted : plans.perJob.formatted)
                        : (total ?? '—')}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 text-blue-800 space-y-2">
                  <li className="flex justify-between">
                    <span>차종:</span>
                    <span className="font-medium">{vehicle === 'starex' ? '스타렉스' : '레이'}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>총 운행시간:</span>
                    <span className="font-medium">{(detail?.driveMinutes ?? 0) + (detail?.dwellTotalMinutes ?? 0)}분</span>
                  </li>
                  <li className="text-sm text-gray-600 pl-2">
                    주행 {detail?.driveMinutes ?? 0}분 · 체류 {detail?.dwellTotalMinutes ?? 0}분
                  </li>
                  <li className="flex justify-between">
                    <span>주행거리:</span>
                    <span className="font-medium">{(detail?.km ?? 0).toFixed?.(1)}km</span>
                  </li>
                  {detail?.fuel && (
                    <li className="flex justify-between">
                      <span>예상 유류비:</span>
                      <span className="font-medium">₩{detail.fuel.fuelCost.toLocaleString('ko-KR')}</span>
                    </li>
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
                  기본요금(구간): ₩{(plans.perJob.baseEffective ?? plans.perJob.base ?? 0).toLocaleString('ko-KR')}
                </div>
                <div>
                  경유지 정액({stopsCount}개): ₩{(plans.perJob.stopFeeEffective ?? plans.perJob.stopFee ?? 0).toLocaleString('ko-KR')}
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


