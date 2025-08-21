'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';
import WaypointList from './WaypointList';

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
  const [waypoints, setWaypoints] = useState<Array<{ id: string; selection: AddressSelection | null; dwellTime: number }>>([
    { id: 'waypoint-1', selection: null, dwellTime: 10 },
    { id: 'waypoint-2', selection: null, dwellTime: 10 }
  ]);
  const [useExplicitDestination, setUseExplicitDestination] = useState(false);
  const [destinationSelection, setDestinationSelection] = useState<AddressSelection | null>(null);
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

          {/* 드래그 앤 드롭 목적지 리스트 */}
          <WaypointList
            waypoints={waypoints}
            onWaypointsChange={setWaypoints}
          />

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

              // waypoints에서 유효한 목적지 추출
              const validWaypoints = waypoints.filter(w => w.selection);
              if (validWaypoints.length === 0) {
                setLocalError('목적지를 하나 이상 추가하세요.');
                return;
              }

              // 중복 제거
              const destinations: { lat: number; lng: number }[] = [];
              for (const waypoint of validWaypoints) {
                const point = { lat: waypoint.selection!.latitude, lng: waypoint.selection!.longitude };
                if (!destinations.some(d => coordEqual(d, point))) {
                  destinations.push(point);
                }
              }

              // 도착지 별도 설정이 켜진 경우 마지막에 도착지를 붙임
              const finalDest = useExplicitDestination && destinationSelection
                ? [...destinations, { lat: destinationSelection.latitude, lng: destinationSelection.longitude }]
                : destinations;

              // 체류시간 수집
              const dwellMinutes = validWaypoints.map(w => w.dwellTime);

              // 디버그: 최적화 옵션 확인
              console.log('Optimization options debug:', {
                optimizeOrder,
                useRealtimeTraffic,
                departureDateTime,
                useExplicitDestination,
                finalDestCount: finalDest.length
              });

              setDwellMinutes(dwellMinutes);
              setDestinations(finalDest);

              await optimizeRouteWith({
                destinations: finalDest,
                options: {
                  useExplicitDestination,
                  optimizeOrder,
                  useRealtimeTraffic,
                  departureAt: useRealtimeTraffic ? null : departureDateTime
                },
                dwellMinutes
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


