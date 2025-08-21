'use client';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';
import WaypointList from './WaypointList';

export default function RouteOptimizerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const {
    optimizeRouteWith,
    isLoading,
    setDestinations,
    destinations,
    error,
    setDwellMinutes,
    options,
    setOptions,
    setOrigins,
  } = useRouteOptimization();

  // 선택 상태
  const [originSelection, setOriginSelection] = useState<AddressSelection | null>(null);

  // originSelection이 변경될 때 origins 동기화
  useEffect(() => {
    if (originSelection) {
      setOrigins({ lat: originSelection.latitude, lng: originSelection.longitude });
    } else {
      setOrigins(null);
    }
  }, [originSelection, setOrigins]);
  const [waypoints, setWaypoints] = useState<Array<{ id: string; selection: AddressSelection | null; dwellTime: number }>>([
    { id: 'waypoint-1', selection: null, dwellTime: 10 },
    { id: 'waypoint-2', selection: null, dwellTime: 10 }
  ]);
  const [useExplicitDestination, setUseExplicitDestination] = useState(false);
  const [destinationSelection, setDestinationSelection] = useState<AddressSelection | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // 자동순서최적화 상태
  const [optimizeOrder, setOptimizeOrder] = useState(false);

  // 날짜/시간 설정 - 한국 시간 기준
  const [departureDateTime, setDepartureDateTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30); // 30분 후로 기본 설정

    // 한국 시간대로 변환 (YYYY-MM-DDTHH:MM 형식)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [useRealtimeTraffic, setUseRealtimeTraffic] = useState(true);

  // 주말인 경우 다음주 월요일로 조정하는 헬퍼 함수
  const getNextWeekday = (date: Date): Date => {
    const day = date.getDay(); // 0 = 일요일, 6 = 토요일
    if (day === 0) { // 일요일인 경우 월요일로
      date.setDate(date.getDate() + 1);
    } else if (day === 6) { // 토요일인 경우 월요일로
      date.setDate(date.getDate() + 2);
    }
    return date;
  };

  const coordEqual = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, eps = 1e-6) =>
    Math.abs(a.lat - b.lat) <= eps && Math.abs(a.lng - b.lng) <= eps;

  const displayOriginValue: AddressSelection | null = useMemo(() => {
    return originSelection;
  }, [originSelection]);

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

          {/* 교통정보 설정 - 깔끔한 버전 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">교통정보 설정</span>
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

            {!useRealtimeTraffic && (
              <div className="space-y-3 p-3 bg-blue-50/30 rounded-lg border border-blue-100">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">타임머신 출발 시간</label>
                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                    {departureDateTime ? new Date(departureDateTime).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    }) : '시간 미설정'}
                  </span>
                </div>

                {/* 빠른 시간 선택 버튼들 - 한 행 배치 (주말 자동 조정) */}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      let targetDate = new Date();
                      targetDate.setDate(targetDate.getDate() + 1);
                      targetDate.setHours(0, 0, 0, 0);
                      targetDate = getNextWeekday(targetDate); // 주말 처리

                      // 한국 시간대로 변환
                      const year = targetDate.getFullYear();
                      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
                      const day = String(targetDate.getDate()).padStart(2, '0');
                      const hours = String(targetDate.getHours()).padStart(2, '0');
                      const minutes = String(targetDate.getMinutes()).padStart(2, '0');

                      const newTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                      console.log('Setting time to (KST):', newTime);
                      setDepartureDateTime(newTime);
                    }}
                    className="flex-1 px-2 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors border"
                  >
                    🌙 0시
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      let targetDate = new Date();
                      targetDate.setDate(targetDate.getDate() + 1);
                      targetDate.setHours(6, 0, 0, 0);
                      targetDate = getNextWeekday(targetDate); // 주말 처리

                      // 한국 시간대로 변환
                      const year = targetDate.getFullYear();
                      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
                      const day = String(targetDate.getDate()).padStart(2, '0');
                      const hours = String(targetDate.getHours()).padStart(2, '0');
                      const minutes = String(targetDate.getMinutes()).padStart(2, '0');

                      const newTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                      console.log('Setting time to (KST):', newTime);
                      setDepartureDateTime(newTime);
                    }}
                    className="flex-1 px-2 py-2 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors border"
                  >
                    🌅 6시
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      let targetDate = new Date();
                      targetDate.setDate(targetDate.getDate() + 1);
                      targetDate.setHours(9, 0, 0, 0);
                      targetDate = getNextWeekday(targetDate); // 주말 처리

                      // 한국 시간대로 변환
                      const year = targetDate.getFullYear();
                      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
                      const day = String(targetDate.getDate()).padStart(2, '0');
                      const hours = String(targetDate.getHours()).padStart(2, '0');
                      const minutes = String(targetDate.getMinutes()).padStart(2, '0');

                      const newTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                      console.log('Setting time to (KST):', newTime);
                      setDepartureDateTime(newTime);
                    }}
                    className="flex-1 px-2 py-2 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors border"
                  >
                    ☀️ 9시
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      let targetDate = new Date();
                      targetDate.setDate(targetDate.getDate() + 1);
                      targetDate.setHours(14, 0, 0, 0);
                      targetDate = getNextWeekday(targetDate); // 주말 처리

                      // 한국 시간대로 변환
                      const year = targetDate.getFullYear();
                      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
                      const day = String(targetDate.getDate()).padStart(2, '0');
                      const hours = String(targetDate.getHours()).padStart(2, '0');
                      const minutes = String(targetDate.getMinutes()).padStart(2, '0');

                      const newTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                      console.log('Setting time to (KST):', newTime);
                      setDepartureDateTime(newTime);
                    }}
                    className="flex-1 px-2 py-2 text-xs bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors border"
                  >
                    🌆 2시
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      let targetDate = new Date();
                      targetDate.setDate(targetDate.getDate() + 1);
                      targetDate.setHours(18, 0, 0, 0);
                      targetDate = getNextWeekday(targetDate); // 주말 처리

                      // 한국 시간대로 변환
                      const year = targetDate.getFullYear();
                      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
                      const day = String(targetDate.getDate()).padStart(2, '0');
                      const hours = String(targetDate.getHours()).padStart(2, '0');
                      const minutes = String(targetDate.getMinutes()).padStart(2, '0');

                      const newTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                      console.log('Setting time to (KST):', newTime);
                      setDepartureDateTime(newTime);
                    }}
                    className="flex-1 px-2 py-2 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors border"
                  >
                    🌇 6시
                  </button>
                </div>
              </div>
            )}

            {useRealtimeTraffic && (
              <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                📡 현재 시간 기준 실시간 교통정보 사용
              </div>
            )}
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
              if (!originSelection) {
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
                departureAt: useRealtimeTraffic ? null : departureDateTime,
                useExplicitDestination,
                finalDestCount: finalDest.length
              });

              setDwellMinutes(dwellMinutes);
              setDestinations(finalDest);

              await optimizeRouteWith({
                origins: originSelection ? { lat: originSelection.latitude, lng: originSelection.longitude } : null,
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


