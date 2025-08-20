'use client';

import React, { useMemo, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';

export default function RouteOptimizerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const {
    optimizeRouteWith,
    isLoading,
    setOrigins,
    setDestinations,
    destinations,
    origins,
    error,
    setDwellMinutes,
    options,
    setOptions,
  } = useRouteOptimization();

  // 선택 상태
  const [originSelection, setOriginSelection] = useState<AddressSelection | null>(null);
  const [pendingDestSelections, setPendingDestSelections] = useState<Array<AddressSelection | null>>([null, null]);
  const [useExplicitDestination, setUseExplicitDestination] = useState(false);
  const [destinationSelection, setDestinationSelection] = useState<AddressSelection | null>(null);
  // 표시용(좌표 대신 라벨)
  const [destDisplay, setDestDisplay] = useState<Array<{ lat: number; lng: number; label: string }>>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  // 자동순서최적화 상태
  const [optimizeOrder, setOptimizeOrder] = useState(false);

  // 날짜/시간 설정
  const [departureDateTime, setDepartureDateTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30); // 30분 후로 기본 설정
    return now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM 형식
  });
  const [useRealtimeTraffic, setUseRealtimeTraffic] = useState(true);

  const coordEqual = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, eps = 1e-6) =>
    Math.abs(a.lat - b.lat) <= eps && Math.abs(a.lng - b.lng) <= eps;

  // 스테이징용 목적지 추가(지도 반영은 계산 시점)
  const addDestination = (sel: AddressSelection) => {
    const point = { lat: sel.latitude, lng: sel.longitude };
    const label = sel.name && sel.name.trim().length > 0 ? sel.name : sel.address;
    setDestDisplay((prev) => {
      const dup = prev.some((d) => coordEqual(d, point));
      if (dup) return prev;
      return [...prev, { ...point, label }];
    });
  };

  const removeDestinationAt = (idx: number) => {
    setDestDisplay((prev) => prev.filter((_, i) => i !== idx));
  };

  const displayOriginValue: AddressSelection | null = useMemo(() => {
    if (originSelection) return originSelection;
    if (origins) {
      return {
        name: '',
        address: `${origins.lat.toFixed(5)}, ${origins.lng.toFixed(5)}`,
        latitude: origins.lat,
        longitude: origins.lng,
      };
    }
    return null;
  }, [originSelection, origins]);

  return (
    <section className="glass-card border-b border-white/40 bg-gradient-to-br from-blue-50/30 to-indigo-50/30">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-4"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-blue-100">🗺️</span>
          <span className="font-semibold text-gray-900">경로 최적화</span>
        </div>
        <svg className={`w-5 h-5 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {/* 출발지 */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <AddressAutocomplete
                label="출발지"
                placeholder="출발지를 검색하세요"
                value={displayOriginValue}
                onSelect={(v) => {
                  setOriginSelection(v);
                  setOrigins({ lat: v.latitude, lng: v.longitude });
                }}
              />
            </div>
          </div>

          {/* 자동 순서 최적화 / 도착지 토글 */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={optimizeOrder}
                onChange={(e) => setOptimizeOrder(e.target.checked)}
              />
              자동 순서 최적화
              <span className="text-gray-400">(기본 OFF)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="accent-blue-600" checked={useExplicitDestination} onChange={(e) => setUseExplicitDestination(e.target.checked)} />
              도착지 별도 설정
            </label>
          </div>

          {/* 목적지 입력 슬롯 (드래그 정렬) */}
          <div className="space-y-4">
            {pendingDestSelections.map((sel, idx) => (
              <div key={idx} className="p-3 bg-gray-50/30 rounded-lg border border-gray-100 hover:bg-gray-50/50 hover:border-gray-200 hover:shadow-sm transition-all duration-200 cursor-move">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <AddressAutocomplete
                      label={`경유지 ${idx + 1}`}
                      placeholder="목적지를 검색하세요"
                      value={sel}
                      onSelect={(v) => {
                        // 선택 즉시 입력란에만 반영(지도 반영은 계산 시점)
                        const next = [...pendingDestSelections];
                        next[idx] = v;
                        setPendingDestSelections(next);
                      }}
                    />
                    <div className="mt-1">
                      <label className="text-xs text-gray-600 mr-2">체류시간</label>
                      <input type="number" min={0} step={5} defaultValue={10} className="w-24 h-8 border rounded px-2 text-sm dwell-time-input" onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value || '0', 10));
                        setDwellMinutes((Array.from({ length: Math.max(idx + 1, 0) }, (_, i) => i)).map((i) => (i === idx ? val : 10)));
                      }} />
                      <span className="ml-1 text-xs text-gray-500">분</span>
                    </div>
                  </div>
                  <div className="w-16 flex justify-end pt-6">
                    {(idx >= 0 && (pendingDestSelections.length > 1 || sel)) && (
                      <button
                        className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 bg-white text-gray-700 text-xl leading-none hover:bg-gray-50"
                        onClick={() => {
                          const next = [...pendingDestSelections];
                          if (next.length > 1) {
                            next.splice(idx, 1);
                          } else {
                            next[0] = null;
                          }
                          setPendingDestSelections(next);
                          setDestDisplay((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        aria-label="입력란 제거"
                        title="입력란 제거"
                      >
                        −
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 입력란 추가 버튼 */}
          <div className="pt-3 flex justify-center">
            <button
              className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-blue-200 bg-blue-50 text-blue-600 text-lg font-bold leading-none hover:bg-blue-100 hover:border-blue-300 transition-colors duration-200 shadow-sm"
              onClick={() => setPendingDestSelections((cur) => [...cur, null])}
              aria-label="경유지 입력란 추가"
              title="경유지 입력란 추가"
            >
              +
            </button>
          </div>

          {/* 섹션 구분선 */}
          <div className="border-t border-gray-200 my-4"></div>

          {/* 날짜/시간 설정 */}
          <div className="space-y-3 p-3 bg-gray-50/50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">출발 시간 설정</span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={useRealtimeTraffic}
                  onChange={(e) => setUseRealtimeTraffic(e.target.checked)}
                />
                실시간 교통정보
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-600">출발 날짜 및 시간</label>
              <input
                type="datetime-local"
                value={departureDateTime}
                onChange={(e) => setDepartureDateTime(e.target.value)}
                className="w-full h-9 border border-gray-300 rounded px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={useRealtimeTraffic}
              />
              <div className="text-xs text-gray-500">
                {useRealtimeTraffic ? '실시간 교통정보 사용 중' : '설정된 시간의 교통정보 반영'}
              </div>
            </div>
          </div>

          {useExplicitDestination && (
            <div className="space-y-2 border-t pt-3">
              <AddressAutocomplete
                label="도착지"
                placeholder="도착지를 검색하세요"
                value={destinationSelection}
                onSelect={(v) => setDestinationSelection(v)}
              />
            </div>
          )}

          {/* 스테이징 목적지 라벨 목록 */}
          {destDisplay.length > 0 && (
            <ul className="text-sm text-gray-700 divide-y divide-gray-100 border rounded">
              {destDisplay.map((d, i) => (
                <li key={`${d.lat}-${d.lng}-${i}`} className="px-3 py-2 flex items-center justify-between">
                  <span>{d.label}</span>
                  <button
                    className="text-xs text-red-600"
                    onClick={() => {
                      setDestDisplay((prev) => prev.filter((_, idx) => idx !== i));
                      const next = [...pendingDestSelections];
                      if (i < next.length) next.splice(i, 1);
                      setPendingDestSelections(next.length ? next : [null]);
                    }}
                  >삭제</button>
                </li>
              ))}
            </ul>
          )}

          {(localError || error) && (
            <div className="text-sm text-red-600">{localError || error}</div>
          )}

          <button
            onClick={async () => {
              setLocalError(null);
              if (!origins) {
                setLocalError('출발지를 먼저 선택하세요.');
                return;
              }
              // 입력란 기준으로 목적지 배열(중복 제거)
              const staged = pendingDestSelections
                .filter(Boolean)
                .map((v) => ({ lat: (v as AddressSelection).latitude, lng: (v as AddressSelection).longitude }));
              const dedup: { lat: number; lng: number }[] = [];
              for (const p of staged) {
                if (!dedup.some((d) => coordEqual(d, p))) dedup.push(p);
              }
              if (dedup.length === 0) {
                setLocalError('목적지를 하나 이상 추가하세요.');
                return;
              }
              // 도착지 별도 설정이 켜진 경우 마지막에 도착지를 붙임
              const finalDest = useExplicitDestination && destinationSelection
                ? [...dedup, { lat: destinationSelection.latitude, lng: destinationSelection.longitude }]
                : dedup;

              // 체류시간 수집 (입력란에서 현재 값들을 가져와서 설정)
              const dwellInputs = document.querySelectorAll('.dwell-time-input');
              const collectedDwellMinutes: number[] = [];

              // 실제 경유지 수만큼만 체류시간 수집
              const actualWaypointCount = finalDest.length;
              dwellInputs.forEach((input, idx) => {
                if (idx < actualWaypointCount) {
                  const value = parseInt((input as HTMLInputElement).value || '10', 10);
                  collectedDwellMinutes[idx] = Math.max(0, value);
                }
              });

              // 디버그: 체류시간 수집 확인
              console.log('Dwell time collection debug:', {
                totalInputs: dwellInputs.length,
                actualWaypointCount,
                collectedDwellMinutes,
                finalDestLength: finalDest.length
              });

              // 디버그: 최적화 옵션 확인
              console.log('Optimization options debug:', {
                optimizeOrder,
                useRealtimeTraffic,
                departureDateTime,
                useExplicitDestination,
                finalDestCount: finalDest.length
              });

              setDwellMinutes(collectedDwellMinutes);

              setDestinations(finalDest);
              await optimizeRouteWith({
                destinations: finalDest,
                options: {
                  useExplicitDestination,
                  optimizeOrder,
                  useRealtimeTraffic,
                  departureAt: useRealtimeTraffic ? null : departureDateTime
                },
                dwellMinutes: collectedDwellMinutes
              });

              // 자동견적 영역으로 스크롤
              setTimeout(() => {
                const quoteSection = document.querySelector('[data-section="quote"]');
                if (quoteSection) {
                  quoteSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                  });
                }
              }, 500); // 계산 완료 후 0.5초 뒤 스크롤
            }}
            disabled={isLoading}
            className="glass-button-primary w-full h-12 text-base !bg-blue-600 !text-white !rounded-lg"
          >
            {isLoading ? '최적 경로 계산 중…' : '최적 경로 계산'}
          </button>
        </div>
      )}
    </section>
  );
}


