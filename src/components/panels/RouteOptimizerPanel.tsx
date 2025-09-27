'use client';

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';
import WaypointList, { type Waypoint } from './WaypointList';

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
    vehicleType,
    setVehicleType,
    lastError,
  } = useRouteOptimization();

  // 외부에서 입력값을 설정할 수 있는 함수들
  const setInputFromHistory = useCallback((requestData: any) => {
    console.log('setInputFromHistory 호출됨:', requestData);

    // 출발지 설정
    if (requestData.origins?.[0]) {
      setOriginSelection({
        latitude: 0,
        longitude: 0,
        address: requestData.origins[0],
        name: requestData.origins[0]
      });
    }

    // 차량 타입 설정
    if (requestData.vehicleType) {
      setVehicleType(requestData.vehicleType);
    }

    // 옵션 설정
    if (requestData.optimizeOrder !== undefined) {
      setOptimizeOrder(requestData.optimizeOrder);
    }

    if (requestData.useRealtimeTraffic !== undefined) {
      setUseRealtimeTraffic(requestData.useRealtimeTraffic);
    }

    if (requestData.departureAt) {
      setDepartureDateTime(requestData.departureAt);
    }

    // 경유지 설정 (destinations를 waypoints로 변환)
    if (requestData.destinations && requestData.destinations.length > 0) {
      const newWaypoints = requestData.destinations.map((dest: string, index: number) => ({
        id: `waypoint-${index + 1}`,
        selection: { latitude: 0, longitude: 0, address: dest, name: dest },
        dwellTime: 10,
        deliveryTime: undefined
      }));
      setWaypoints(newWaypoints);
    }
  }, [setVehicleType]);

  // 전역에서 접근할 수 있도록 window 객체에 등록
  useEffect(() => {
    (window as any).setRouteOptimizerInput = setInputFromHistory;
    return () => {
      delete (window as any).setRouteOptimizerInput;
    };
  }, [setInputFromHistory]);

  // 선택 상태
  const [originSelection, setOriginSelection] = useState<AddressSelection | null>(null);
  const [originDwellTime, setOriginDwellTime] = useState(10);
  const [originDepartureTime, setOriginDepartureTime] = useState(''); // 출발지 배송출발시간 (기본값: 미입력)

  // originSelection이 변경될 때 origins 동기화
  useEffect(() => {
    if (originSelection) {
      setOrigins({
        lat: originSelection.latitude,
        lng: originSelection.longitude,
        address: originSelection.address || originSelection.name
      });
    } else {
      setOrigins(null);
    }
  }, [originSelection, setOrigins]);
  const [waypoints, setWaypoints] = useState<Array<{ id: string; selection: AddressSelection | null; dwellTime: number; deliveryTime?: string }>>([
    { id: 'waypoint-1', selection: null, dwellTime: 10, deliveryTime: undefined },
    { id: 'waypoint-2', selection: null, dwellTime: 10, deliveryTime: undefined }
  ]);
  const [useExplicitDestination, setUseExplicitDestination] = useState(false);
  const [destinationSelection, setDestinationSelection] = useState<AddressSelection | null>(null);
  const [destinationDwellTime, setDestinationDwellTime] = useState(10); // 도착지 체류시간
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({});

  // 경유지 선택 변경 시 해당 인덱스의 에러 제거
  useEffect(() => {
    if (!fieldErrors || Object.keys(fieldErrors).length === 0) return;
    const next: Record<number, string> = { ...fieldErrors };
    waypoints.forEach((w, i) => {
      if (w.selection && next[i]) delete next[i];
    });
    if (Object.keys(next).length !== Object.keys(fieldErrors).length) {
      setFieldErrors(next);
    }
  }, [waypoints]);

  // 에러 → 인라인 필드 에러 매핑
  useEffect(() => {
    const byIndex: Record<number, string> = {};
    const le: any = lastError;
    if (le?.details?.errors && Array.isArray(le.details.errors)) {
      le.details.errors.forEach((msg: string) => {
        const match = msg.match(/경유지\s(\d+)/);
        if (match) {
          const idx = parseInt(match[1], 10) - 1;
          byIndex[idx] = msg.replace(/경유지\s\d+:\s?/, '');
        }
      });
    }
    setFieldErrors(byIndex);
  }, [lastError]);

  // 시간 문자열 보정 헬퍼
  const adjustHHMM = useCallback((time: string, deltaMin: number) => {
    const [h, m] = time.split(':').map(Number);
    let total = h * 60 + m + deltaMin;
    total = (total % (24 * 60) + 24 * 60) % (24 * 60);
    const nh = String(Math.floor(total / 60)).padStart(2, '0');
    const nm = String(total % 60).padStart(2, '0');
    return `${nh}:${nm}`;
  }, []);

  const quickFixAdvanceDeparture = useCallback((minutes: number) => {
    const base = originDepartureTime || (() => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    })();
    const updated = adjustHHMM(base, -minutes);
    setOriginDepartureTime(updated);
    // 수정 후 자동 재시도
    setTimeout(() => optimizeButtonRef.current?.click(), 50);
  }, [originDepartureTime, adjustHHMM]);

  const quickFixDelayFirstErroredStop = useCallback((minutes: number) => {
    const indices = Object.keys(fieldErrors).map(k => parseInt(k, 10)).sort((a, b) => a - b);
    if (indices.length === 0) return;
    const idx = indices[0];
    setWaypoints(prev => prev.map((w, i) => {
      if (i !== idx) return w;
      const base = w.deliveryTime || originDepartureTime || '09:00';
      return { ...w, deliveryTime: adjustHHMM(base, minutes) };
    }));
    // 수정 후 자동 재시도
    setTimeout(() => optimizeButtonRef.current?.click(), 50);
  }, [fieldErrors, originDepartureTime, adjustHHMM]);

  // 자동순서최적화 상태
  const [optimizeOrder, setOptimizeOrder] = useState(true);

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

  // 시간 설정 감지 (컴포넌트 상단에서 계산)
  const hasAnyDeliveryTime = waypoints.some(w => w.deliveryTime && w.deliveryTime.trim() !== '');

  // 출발지 배송출발시간 필수 입력 여부 (경유지에 배송완료시간이 하나라도 있으면 필수)
  const isOriginDepartureTimeRequired = hasAnyDeliveryTime;

  // 시간 설정이 있을 때 실시간 교통정보 자동 비활성화
  useEffect(() => {
    const hasTimeSettings = originDepartureTime || hasAnyDeliveryTime;
    if (hasTimeSettings && useRealtimeTraffic) {
      console.log('⏰ [useEffect] 시간 설정 감지 - 실시간 교통정보 자동 비활성화');
      setUseRealtimeTraffic(false);
    }
  }, [originDepartureTime, hasAnyDeliveryTime, useRealtimeTraffic]);

  // 출발지 배송출발시간이 설정되면 실시간 교통정보 자동 비활성화 (다음날 기준 계산)
  useEffect(() => {
    if (originDepartureTime && useRealtimeTraffic) {
      console.log('🚀 [useEffect] 출발지 배송출발시간 설정 - 실시간 교통정보 자동 비활성화 (다음날 기준)');
      setUseRealtimeTraffic(false);
    }
  }, [originDepartureTime, useRealtimeTraffic]);

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

  // 출발지 배송출발시간을 설정하면 타임머신 출발시각을 자동 동기화(다음날 동일 HH:mm)
  useEffect(() => {
    if (!originDepartureTime) return;
    try {
      const [h, m] = originDepartureTime.split(':').map(Number);
      let target = new Date();
      target.setDate(target.getDate() + 1); // 시간제약 존재 시 내일 앵커에 맞춤
      target = getNextWeekday(target);
      target.setHours(h, m, 0, 0);
      const year = target.getFullYear();
      const month = String(target.getMonth() + 1).padStart(2, '0');
      const day = String(target.getDate()).padStart(2, '0');
      const hh = String(target.getHours()).padStart(2, '0');
      const mm = String(target.getMinutes()).padStart(2, '0');
      setDepartureDateTime(`${year}-${month}-${day}T${hh}:${mm}`);
    } catch { }
  }, [originDepartureTime]);

  const coordEqual = (a: { lat: number; lng: number; address?: string }, b: { lat: number; lng: number; address?: string }, eps = 1e-6) =>
    Math.abs(a.lat - b.lat) <= eps && Math.abs(a.lng - b.lng) <= eps;

  const displayOriginValue: AddressSelection | null = useMemo(() => {
    return originSelection;
  }, [originSelection]);

  // 최적경로 계산 메인 버튼 ref (부동 액션 버튼에서 재사용)
  const optimizeButtonRef = useRef<HTMLButtonElement | null>(null);

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
          <div className="space-y-2">
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
            {originSelection && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">출발지 체류시간</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={originDwellTime}
                    onChange={(e) => {
                      const value = Math.max(0, parseInt(e.target.value || '10', 10));
                      setOriginDwellTime(value);
                    }}
                    className="w-24 h-8 border rounded px-2 text-sm"
                  />
                  <span className="text-xs text-gray-500">분</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`text-xs ${isOriginDepartureTimeRequired ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                    배송출발시간
                    {isOriginDepartureTimeRequired && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <input
                    type="time"
                    value={originDepartureTime}
                    onChange={(e) => setOriginDepartureTime(e.target.value)}
                    className={`w-32 h-8 border rounded px-2 text-sm ${isOriginDepartureTimeRequired && !originDepartureTime
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-200'
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                      }`}
                    placeholder={isOriginDepartureTimeRequired ? "필수 입력" : "미설정시 현재시간"}
                    required={isOriginDepartureTimeRequired}
                  />
                  {originDepartureTime && (
                    <button
                      type="button"
                      onClick={() => setOriginDepartureTime('')}
                      className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      title="시간 초기화"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {isOriginDepartureTimeRequired && !originDepartureTime && (
                  <div className="text-xs text-red-600 mt-1">
                    ⚠️ 시간제약 기반 최적화를 위해 출발지 배송출발시간을 입력해주세요
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 자동 순서 최적화 / 도착지 토글 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={optimizeOrder}
                  onChange={(e) => setOptimizeOrder(e.target.checked)}
                />
                자동 순서 최적화
                <span className="text-gray-400">(기본 ON)</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="accent-blue-600" checked={useExplicitDestination} onChange={(e) => setUseExplicitDestination(e.target.checked)} />
                도착지 별도 설정
              </label>
            </div>
          </div>

          {/* 차량 타입 선택 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">차량 타입</label>
            <div className="flex gap-2">
              {/* 레이 버튼 */}
              <button
                type="button"
                onClick={() => setVehicleType('레이')}
                className={`relative px-2 py-1.5 rounded-md border-2 transition-all duration-200 group flex-1 ${vehicleType === '레이'
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-25'
                  }`}
              >
                <div className="text-center space-y-0.5">
                  <div className="text-base">🚗</div>
                  <div className="font-medium text-xs text-gray-900">레이</div>
                  <div className="text-xs text-gray-500">승용차</div>
                </div>

                {/* 선택 표시 */}
                {vehicleType === '레이' && (
                  <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}

                {/* 호버 효과 */}
                <div className="absolute inset-0 rounded-md bg-gradient-to-br from-blue-500/0 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              </button>

              {/* 스타렉스 버튼 */}
              <button
                type="button"
                onClick={() => setVehicleType('스타렉스')}
                className={`relative px-2 py-1.5 rounded-md border-2 transition-all duration-200 group flex-1 ${vehicleType === '스타렉스'
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-25'
                  }`}
              >
                <div className="text-center space-y-0.5">
                  <div className="text-base">🚐</div>
                  <div className="font-medium text-xs text-gray-900">스타렉스</div>
                  <div className="text-xs text-gray-500">화물차</div>
                </div>

                {/* 선택 표시 */}
                {vehicleType === '스타렉스' && (
                  <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}

                {/* 호버 효과 */}
                <div className="absolute inset-0 rounded-md bg-gradient-to-br from-blue-500/0 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              </button>
            </div>
          </div>

          {/* 드래그 앤 드롭 목적지 리스트 */}
          <WaypointList
            waypoints={waypoints}
            onWaypointsChange={setWaypoints}
            hasAnyDeliveryTime={hasAnyDeliveryTime}
            errorByIndex={fieldErrors}
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
                  disabled={!!originDepartureTime || hasAnyDeliveryTime}
                />
                실시간 교통정보
                {originDepartureTime && (
                  <span className="text-xs text-amber-600 ml-1">(출발시간 설정 시 자동 비활성화)</span>
                )}
                {hasAnyDeliveryTime && !originDepartureTime && (
                  <span className="text-xs text-amber-600 ml-1">(경유지 시간제약 시 자동 비활성화)</span>
                )}
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

            {!useRealtimeTraffic && originDepartureTime && (
              <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                🚀 출발시간 설정 감지 - 타임머신 교통정보 사용 (다음날 기준 최적화)
              </div>
            )}
            {!useRealtimeTraffic && hasAnyDeliveryTime && !originDepartureTime && (
              <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                ⏰ 경유지 시간제약 감지 - 타임머신 교통정보 사용 (시간제약 기반 최적화)
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
              {destinationSelection && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">도착지 체류시간</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={destinationDwellTime}
                    onChange={(e) => {
                      const value = Math.max(0, parseInt(e.target.value || '10', 10));
                      setDestinationDwellTime(value);
                    }}
                    className="w-24 h-8 border rounded px-2 text-sm"
                  />
                  <span className="text-xs text-gray-500">분</span>
                </div>
              )}
            </div>
          )}



          {(localError || error) && (
            <div className="text-sm text-red-600">{localError || error}</div>
          )}

          {/* 서버 에러 요약 배너 + 빠른수정 */}
          {lastError && (
            <div className="p-3 rounded-lg border bg-red-50 border-red-200 text-sm text-red-800 space-y-2">
              <div className="font-medium">오류: {lastError.message || lastError.error}</div>
              {Array.isArray(lastError?.details?.errors) && lastError.details.errors.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5">
                  {lastError.details.errors.map((e: string, i: number) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => quickFixAdvanceDeparture(30)}
                  className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
                >출발시간 30분 앞당기기</button>
                <button
                  type="button"
                  onClick={() => quickFixDelayFirstErroredStop(30)}
                  className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
                >문제 경유지 +30분</button>
                <button
                  type="button"
                  onClick={() => setLocalError(null)}
                  className="ml-auto px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
                >닫기</button>
              </div>
            </div>
          )}

          <button
            ref={optimizeButtonRef}
            onClick={async () => {
              console.log('🎯 [RouteOptimizerPanel] 최적 경로 계산 버튼 클릭됨');
              console.log('🔍 [RouteOptimizerPanel] 현재 상태:', {
                originSelection,
                waypoints,
                vehicleType,
                optimizeOrder,
                useRealtimeTraffic
              });
              setLocalError(null);
              setFieldErrors({});

              if (!originSelection) {
                console.log('❌ [RouteOptimizerPanel] 출발지가 선택되지 않음');
                setLocalError('출발지를 먼저 선택하세요.');
                return;
              }

              // 시간제약 기반 최적화를 위한 출발지 배송출발시간 필수 검증
              if (isOriginDepartureTimeRequired && !originDepartureTime) {
                console.log('❌ [RouteOptimizerPanel] 출발지 배송출발시간이 필수인데 비어있음');
                setLocalError('시간제약 기반 최적화를 위해 출발지 배송출발시간을 입력해주세요.');
                return;
              }

              // 주소 미확정 경유지 차단
              const unconfirmedIdx: number[] = [];
              waypoints.forEach((w, i) => { if (!w.selection) unconfirmedIdx.push(i + 1); });
              if (unconfirmedIdx.length > 0) {
                console.log('❌ [RouteOptimizerPanel] 미확정 경유지 존재:', unconfirmedIdx);
                setLocalError(`주소가 확정되지 않은 경유지(${unconfirmedIdx.join(', ')})가 있습니다. 각 경유지에서 검색 후 항목을 선택해 "확정됨" 상태로 만들어주세요.`);
                const fe: Record<number, string> = {};
                unconfirmedIdx.forEach((idx) => { fe[idx - 1] = '주소 미확정: 검색 후 제안 목록에서 선택해주세요.'; });
                setFieldErrors(fe);
                return;
              }

              // waypoints에서 유효한 목적지 추출
              const validWaypoints: Waypoint[] = waypoints.filter(w => w.selection);
              console.log('📍 [RouteOptimizerPanel] 유효한 waypoints:', validWaypoints);

              if (validWaypoints.length === 0) {
                console.log('❌ [RouteOptimizerPanel] 유효한 목적지가 없음');
                setLocalError('목적지를 하나 이상 추가하세요.');
                return;
              }

              // 중복 제거
              const destinations: { lat: number; lng: number; address?: string }[] = [];
              for (const waypoint of validWaypoints) {
                const point = {
                  lat: waypoint.selection!.latitude,
                  lng: waypoint.selection!.longitude,
                  address: waypoint.selection!.address || waypoint.selection!.name
                };
                if (!destinations.some(d => coordEqual(d, point))) {
                  destinations.push(point);
                }
              }
              console.log('[RouteOptimizerPanel] 중복 제거된 destinations:', destinations);

              // 도착지 별도 설정이 켜진 경우 마지막에 도착지를 붙임
              const finalDest = useExplicitDestination && destinationSelection
                ? [...destinations, {
                  lat: destinationSelection.latitude,
                  lng: destinationSelection.longitude,
                  address: destinationSelection.address || destinationSelection.name
                }]
                : destinations;
              console.log('[RouteOptimizerPanel] 최종 destinations:', finalDest);

              // 체류시간, 배송완료시간 수집
              const dwellMinutes = validWaypoints.map(w => w.dwellTime);
              const deliveryTimes = validWaypoints.map(w => w.deliveryTime);

              // 출발시간 기반 다음날 판단 (미입력 시 현재 시간 사용)
              const now = new Date();
              const originTimeInMinutes = originDepartureTime
                ? (() => {
                  const [originHours, originMinutes] = originDepartureTime.split(':').map(Number);
                  return originHours * 60 + originMinutes;
                })()
                : now.getHours() * 60 + now.getMinutes();

              const isNextDayFlags = deliveryTimes.map(time => {
                if (!time) {
                  // 배송완료시간이 없는 경우: 당일 배송으로 처리
                  return false;
                }

                const [hours, minutes] = time.split(':').map(Number);
                const timeInMinutes = hours * 60 + minutes;

                // 배송완료시간이 출발시간보다 이르면 다음날 배송
                // 배송완료시간이 출발시간보다 늦으면 당일 배송
                return timeInMinutes < originTimeInMinutes;
              });

              console.log('=== RouteOptimizerPanel 수집된 데이터 ===');
              console.log('deliveryTimes:', deliveryTimes);
              console.log('isNextDayFlags:', isNextDayFlags);
              console.log('hasAnyDeliveryTime:', hasAnyDeliveryTime);
              console.log('originDepartureTime:', originDepartureTime || '미입력(현재시간 사용)');
              console.log('originTimeInMinutes:', originTimeInMinutes);
              console.log('validWaypoints:', validWaypoints.map(w => ({
                id: w.id,
                deliveryTime: w.deliveryTime,
                isNextDay: w.isNextDay
              })));
              console.log('==========================================');

              // 출발지와 도착지 체류시간 포함
              const allDwellTimes = [originDwellTime, ...dwellMinutes];
              if (useExplicitDestination && destinationSelection) {
                allDwellTimes.push(destinationDwellTime);
              }

              // 시간 설정이 있는 경우 실시간 교통정보 자동 비활성화
              const hasTimeSettings = originDepartureTime || hasAnyDeliveryTime;
              let finalUseRealtimeTraffic = useRealtimeTraffic;

              if (hasTimeSettings && useRealtimeTraffic) {
                console.log('⏰ [RouteOptimizerPanel] 시간 설정 감지 - 실시간 교통정보 자동 비활성화');
                setUseRealtimeTraffic(false);
                finalUseRealtimeTraffic = false; // 즉시 반영
              }

              console.log('[RouteOptimizerPanel] 체류시간 (출발지+경유지+도착지):', allDwellTimes);
              console.log('[RouteOptimizerPanel] 배송완료시간:', deliveryTimes);

              // 디버그: 최적화 옵션 확인
              console.log('[RouteOptimizerPanel] Optimization options debug:', {
                optimizeOrder,
                useRealtimeTraffic: finalUseRealtimeTraffic,
                departureDateTime,
                departureAt: finalUseRealtimeTraffic ? null : departureDateTime,
                useExplicitDestination,
                finalDestCount: finalDest.length
              });

              setDwellMinutes(allDwellTimes);
              setDestinations(finalDest);

              // 배송완료시간 및 다음날 배송 여부를 options에 추가
              // 출발시간을 ISO 형식으로 변환 (미입력 시 현재 시간 사용)
              const originDepartureDateTime = new Date();
              if (originDepartureTime) {
                const [originH, originM] = originDepartureTime.split(':').map(Number);
                originDepartureDateTime.setHours(originH, originM, 0, 0);
              } else {
                // 미입력 시 현재 시간 사용
                originDepartureDateTime.setHours(now.getHours(), now.getMinutes(), 0, 0);
              }

              // 출발시간은 당일로 유지 (배송완료시간만 다음날 처리)
              // 다음날 배송 로직은 서버에서 isNextDayFlags로 처리

              const optionsWithDeliveryTimes = {
                useExplicitDestination,
                optimizeOrder,
                useRealtimeTraffic: finalUseRealtimeTraffic,
                // 타임머신 출발 시간 UI(departureDateTime)를 그대로 사용
                departureAt: finalUseRealtimeTraffic ? null : new Date(departureDateTime).toISOString(),
                // 인덱스 정합성을 위해 빈 문자열로 채워 전달
                deliveryTimes: deliveryTimes.map(t => t || ''),
                isNextDayFlags: isNextDayFlags
              };

              console.log('🚀 [RouteOptimizerPanel] optimizeRouteWith 호출 시작');
              console.log('📤 전송할 데이터:', {
                origins: originSelection ? {
                  lat: originSelection.latitude,
                  lng: originSelection.longitude,
                  address: originSelection.address || originSelection.name
                } : null,
                destinations: finalDest,
                options: optionsWithDeliveryTimes,
                dwellMinutes: allDwellTimes
              });

              try {
                await optimizeRouteWith({
                  origins: originSelection ? {
                    lat: originSelection.latitude,
                    lng: originSelection.longitude,
                    address: originSelection.address || originSelection.name
                  } : null,
                  destinations: finalDest,
                  options: optionsWithDeliveryTimes,
                  dwellMinutes: allDwellTimes
                });
                console.log('✅ [RouteOptimizerPanel] optimizeRouteWith 호출 완료');
                setFieldErrors({});
              } catch (error) {
                console.error('❌ [RouteOptimizerPanel] optimizeRouteWith 오류:', error);
                setLocalError('경로 최적화 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
                // 서버 lastError를 UI에 매핑
                const le: any = (window as any).lastOptimizationError || null;
                const byIndex: Record<number, string> = {};
                if (le?.details?.errors && Array.isArray(le.details.errors)) {
                  le.details.errors.forEach((msg: string) => {
                    const match = msg.match(/경유지\s(\d+)/);
                    if (match) {
                      const idx = parseInt(match[1], 10) - 1;
                      byIndex[idx] = msg.replace(/경유지\s\d+:\s?/, '');
                    }
                  });
                }
                setFieldErrors(byIndex);
              }

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
          {/* 고정 버튼 제거: 상단 메인 버튼만 사용 */}
        </div>
      )}
    </section>
  );
}


