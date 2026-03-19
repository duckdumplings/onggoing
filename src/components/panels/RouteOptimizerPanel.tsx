'use client';

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';
import WaypointList, { type Waypoint } from './WaypointList';
import MultiDriverResultsPanel from './MultiDriverResultsPanel';
import { ChevronDown, ChevronUp, Settings, X } from 'lucide-react';

type OptimizationMode = 'single' | 'multi';
type SavedOptimizationRun = {
  id: string;
  created_at?: string;
  createdAt?: string;
  total_distance?: number;
  vehicle_type?: string;
  request_data?: any;
  requestData?: any;
};

export default function RouteOptimizerPanel() {
  const shouldPersistOptimizationRun =
    typeof window !== 'undefined' && window.location.hostname !== 'localhost';
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('single');
  const [driverCount, setDriverCount] = useState(2);
  const [multiDriverResult, setMultiDriverResult] = useState<any>(null);
  const [isMultiDriverLoading, setIsMultiDriverLoading] = useState(false);
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);
  const [isOptionsOpen, setIsOptionsOpen] = useState(true); // 옵션 아코디언 상태 (기본 펼침)

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
    routeData,
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

    const hasExplicitDestination = Boolean(requestData.useExplicitDestination || requestData.finalDestinationAddress);
    if (hasExplicitDestination) {
      setDestinationPolicy('explicit');
      setUseExplicitDestination(true);
      setReturnToOrigin(false);
    } else if (requestData.returnToOrigin) {
      setDestinationPolicy('return-origin');
      setUseExplicitDestination(false);
      setReturnToOrigin(true);
    } else {
      setDestinationPolicy(null);
      setUseExplicitDestination(false);
      setReturnToOrigin(false);
    }

    // 경유지 설정 (destinations를 waypoints로 변환)
    if (requestData.destinations && requestData.destinations.length > 0) {
      const allDestinations = requestData.destinations as string[];
      const explicitDestinationAddress =
        typeof requestData.finalDestinationAddress === 'string' && requestData.finalDestinationAddress.trim()
          ? requestData.finalDestinationAddress.trim()
          : hasExplicitDestination
            ? allDestinations[allDestinations.length - 1]
            : null;
      const waypointAddresses = explicitDestinationAddress
        ? allDestinations.filter((address, index) => index < allDestinations.length - 1)
        : allDestinations;

      const newWaypoints = waypointAddresses.map((dest: string, index: number) => ({
        id: `waypoint-${index + 1}`,
        selection: { latitude: 0, longitude: 0, address: dest, name: dest },
        dwellTime: 10,
        deliveryTime: undefined
      }));
      setWaypoints(newWaypoints);

      if (explicitDestinationAddress) {
        setDestinationSelection({
          latitude: 0,
          longitude: 0,
          address: explicitDestinationAddress,
          name: explicitDestinationAddress,
        });
      } else {
        setDestinationSelection(null);
      }
    }
  }, [setVehicleType]);

  // 전역에서 접근할 수 있도록 window 객체에 등록
  useEffect(() => {
    (window as any).setRouteOptimizerInput = setInputFromHistory;
    return () => {
      delete (window as any).setRouteOptimizerInput;
    };
  }, [setInputFromHistory]);

  useEffect(() => {
    const onAiApply = (event: Event) => {
      const customEvent = event as CustomEvent<{ requestData?: any }>;
      if (!customEvent?.detail?.requestData) return;
      setInputFromHistory(customEvent.detail.requestData);
    };
    window.addEventListener('ai-quote-apply', onAiApply as EventListener);
    return () => window.removeEventListener('ai-quote-apply', onAiApply as EventListener);
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
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyRuns, setHistoryRuns] = useState<SavedOptimizationRun[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const hasHardFailure = Boolean(localError || error || (lastError?.details?.errors?.length ?? 0) > 0);
  const hasWarning = !hasHardFailure && Boolean(lastError?.message || lastError?.error);

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

  // 고급 설정 요약 텍스트 생성
  const getAdvancedSettingsSummary = () => {
    const parts = [];
    parts.push(roadOption === 'time-first' ? '시간 우선' : roadOption === 'toll-saving' ? '요금 절약' : '무료 우선');
    parts.push(destinationPolicy === 'return-origin' ? '출발지 복귀' : destinationPolicy === 'explicit' ? '별도 도착지' : '마지막 종료');
    parts.push(optimizeOrder ? '자동 순서' : '수동 순서');
    return parts.join(' · ');
  };

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
  const [roadOption, setRoadOption] = useState<'time-first' | 'toll-saving' | 'free-road-first'>('time-first');
  const [returnToOrigin, setReturnToOrigin] = useState(false);
  const [destinationPolicy, setDestinationPolicy] = useState<'return-origin' | 'explicit' | null>(null);

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

  // 경로 계산 결과가 없을 때만, 확정된 입력값을 지도 프리뷰 핀으로 동기화
  useEffect(() => {
    if (routeData) {
      return;
    }

    const previewDestinations = waypoints
      .filter((w) => !!w.selection)
      .map((w) => ({
        lat: w.selection!.latitude,
        lng: w.selection!.longitude,
        address: w.selection!.address || w.selection!.name
      }));

    if (useExplicitDestination && destinationSelection) {
      previewDestinations.push({
        lat: destinationSelection.latitude,
        lng: destinationSelection.longitude,
        address: destinationSelection.address || destinationSelection.name
      });
    }

    setDestinations(previewDestinations);
  }, [routeData, waypoints, useExplicitDestination, destinationSelection, setDestinations]);

  // 지도/후속 로직에서 옵션 상태를 일관되게 사용하도록 동기화
  useEffect(() => {
    setOptions({
      useExplicitDestination,
      optimizeOrder,
      useRealtimeTraffic,
      roadOption,
      returnToOrigin
    });
  }, [useExplicitDestination, optimizeOrder, useRealtimeTraffic, roadOption, returnToOrigin, setOptions]);

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

  const extractSavedRuns = (result: any): SavedOptimizationRun[] => {
    if (!result?.success) return [];
    if (Array.isArray(result?.data?.runs)) return result.data.runs;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.runs)) return result.runs;
    return [];
  };

  const applySavedRunToInputs = (run: SavedOptimizationRun) => {
    const requestData = run.request_data || run.requestData || {};

    if (requestData.origin) {
      setOriginSelection({
        latitude: requestData.origin.latitude,
        longitude: requestData.origin.longitude,
        address: requestData.origin.address,
        name: requestData.origin.address
      });
    } else if (requestData.origins?.[0]) {
      const origin = requestData.origins[0];
      if (typeof origin === 'string') {
        setOriginSelection({
          latitude: 0,
          longitude: 0,
          address: origin,
          name: origin
        });
      } else {
        setOriginSelection({
          latitude: origin.latitude || origin.lat || 0,
          longitude: origin.longitude || origin.lng || 0,
          address: origin.address || '',
          name: origin.address || ''
        });
      }
    }

    if (requestData.vehicleType) {
      setVehicleType(requestData.vehicleType);
    }

    if (requestData.destinations && requestData.destinations.length > 0) {
      const newWaypoints = requestData.destinations.map((dest: any, idx: number) => ({
        id: `waypoint-${idx + 1}`,
        selection: {
          latitude: dest.latitude || dest.lat || 0,
          longitude: dest.longitude || dest.lng || 0,
          address: dest.address || (typeof dest === 'string' ? dest : ''),
          name: dest.address || (typeof dest === 'string' ? dest : '')
        },
        dwellTime: requestData.dwellMinutes?.[idx + 1] || 10,
        deliveryTime: requestData.deliveryTimes?.[idx] || undefined
      }));
      setWaypoints(newWaypoints);
    }

    if (requestData.optimizeOrder !== undefined) {
      setOptimizeOrder(requestData.optimizeOrder);
    }
    if (requestData.useRealtimeTraffic !== undefined) {
      setUseRealtimeTraffic(requestData.useRealtimeTraffic);
    }

    setHistoryNotice('저장된 경로를 불러왔습니다. 최적 경로 계산을 눌러 재실행하세요.');
  };

  const openSavedRouteModal = async () => {
    setHistoryNotice(null);
    setHistoryError(null);
    setIsHistoryLoading(true);
    setIsHistoryModalOpen(true);

    try {
      const response = await fetch('/api/optimization-runs?limit=20');
      const result = await response.json();
      const runs = extractSavedRuns(result).sort((a, b) => {
        const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
        const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setHistoryRuns(runs);

      if (runs.length === 0) {
        setHistoryError('저장된 경로가 없습니다. 최적화 실행 시 자동 저장됩니다.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '알 수 없는 오류';
      setHistoryError(`저장된 경로를 불러오지 못했습니다. (${message})`);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  return (
    <section className="flex flex-col bg-white/90 backdrop-blur-xl border-r border-slate-200/60 shadow-2xl shadow-indigo-500/5 font-sans transition-all duration-300">
      {/* Header */}
      <div className="flex-none px-5 py-5 border-b border-slate-100 bg-white/60 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl shadow-lg shadow-indigo-200 text-white flex items-center justify-center">
              <span className="text-lg">🗺️</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">경로 최적화</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content (Scrollable) */}
      <div className="p-5 space-y-6 pb-6">
        {/* 1. Resource Section (Mode & Vehicle) */}
        <div className="bg-slate-50/80 rounded-xl border border-slate-200 p-4 space-y-4">
          {/* 모드 선택 */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setOptimizationMode('single');
                setMultiDriverResult(null);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-lg border transition-all ${optimizationMode === 'single'
                ? 'bg-white border-indigo-200 text-indigo-700 shadow-sm ring-1 ring-indigo-500/20'
                : 'bg-transparent border-transparent text-slate-500 hover:bg-white hover:text-slate-700'
                }`}
            >
              <span className="text-lg mb-1">🚗</span>
              <span className="text-xs font-bold">단일 차량</span>
            </button>
            <button
              onClick={() => {
                setOptimizationMode('multi');
                setMultiDriverResult(null);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-lg border transition-all ${optimizationMode === 'multi'
                ? 'bg-white border-indigo-200 text-indigo-700 shadow-sm ring-1 ring-indigo-500/20'
                : 'bg-transparent border-transparent text-slate-500 hover:bg-white hover:text-slate-700'
                }`}
            >
              <span className="text-lg mb-1">🚛</span>
              <span className="text-xs font-bold">다중 배송원</span>
            </button>
          </div>

          {/* 차량 타입 선택 (탭 스타일) */}
          <div className="flex bg-slate-200/50 p-1 rounded-lg">
            <button
              onClick={() => setVehicleType('레이')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${vehicleType === '레이'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              레이 (승용)
            </button>
            <button
              onClick={() => setVehicleType('스타렉스')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${vehicleType === '스타렉스'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              스타렉스 (화물)
            </button>
          </div>

          {/* 다중 배송원 모드일 때만 표시: 배송원 수 */}
          {optimizationMode === 'multi' && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/50">
              <span className="text-xs font-medium text-slate-600">배송원 수</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="2"
                  max="10"
                  value={driverCount}
                  onChange={(e) => setDriverCount(parseInt(e.target.value))}
                  className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <span className="text-xs font-bold text-indigo-600 w-8 text-right">{driverCount}명</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. Route Section (Origin & Waypoints) */}
        <div className="space-y-4 relative">
          {/* 타임라인 연결선 (출발지부터 경유지까지) */}
          <div className="absolute left-[11px] top-6 bottom-[100px] w-0.5 bg-slate-200/60 -z-10 rounded-full" />
          
          {/* 출발지 입력 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] z-10 -ml-[5px] ring-4 ring-white"></div>
              출발지 정보
            </label>
            <div className="relative group ml-4">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl opacity-0 group-hover:opacity-10 transition duration-500 blur"></div>
              <div className="relative bg-white rounded-xl shadow-sm border border-slate-200/60">
                <AddressAutocomplete
                  label=""
                  placeholder="출발지를 검색하세요"
                  value={displayOriginValue}
                  onSelect={(v) => {
                    setOriginSelection(v);
                  }}
                />
              </div>
            </div>

            {/* 출발지 시간 설정 (인라인 배치) */}
            {originSelection && (
              <div className="flex gap-2 ml-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex-1 flex items-center gap-2 bg-white shadow-sm px-3 py-2 rounded-lg border border-slate-200/60">
                  <span className="text-[10px] font-semibold text-slate-500 whitespace-nowrap">체류</span>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={originDwellTime}
                    onChange={(e) => setOriginDwellTime(Math.max(0, parseInt(e.target.value || '0')))}
                    className="w-full bg-transparent text-xs text-center font-bold text-slate-700 focus:outline-none border-b border-transparent focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">분</span>
                </div>
                <div className={`flex-[1.5] shadow-sm flex items-center gap-2 bg-white px-3 py-2 rounded-lg border transition-colors ${isOriginDepartureTimeRequired && !originDepartureTime ? 'border-rose-300 bg-rose-50' : 'border-slate-200/60'}`}>
                  <span className={`text-[10px] font-semibold whitespace-nowrap ${isOriginDepartureTimeRequired ? 'text-rose-600' : 'text-slate-500'}`}>
                    출발 {isOriginDepartureTimeRequired && '*'}
                  </span>
                  <input
                    type="time"
                    value={originDepartureTime}
                    onChange={(e) => setOriginDepartureTime(e.target.value)}
                    className="w-full bg-transparent text-xs text-center font-bold text-slate-700 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 경유지 리스트 Header & Bulk Actions */}
          <div className="flex items-center justify-between pt-2 ml-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full border-2 border-slate-300 bg-white z-10 -ml-[25px] ring-4 ring-white"></div>
              경유지 목록
            </label>
            <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setWaypoints(prev => prev.map(w => ({ ...w, dwellTime: 10 })))}
                className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded transition-colors"
                title="모든 경유지 체류시간을 10분으로 통일"
              >
                10분 통일
              </button>
              <button
                type="button"
                onClick={() => setWaypoints(prev => prev.map(w => ({ ...w, deliveryTime: undefined })))}
                className="text-[10px] font-medium bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-600 px-2 py-1 rounded transition-colors"
                title="모든 도착시간 설정 초기화"
              >
                시간 초기화
              </button>
            </div>
          </div>

          {/* 경유지 리스트 Content */}
          <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-1 ml-4 shadow-sm">
            <WaypointList
              waypoints={waypoints}
              onWaypointsChange={setWaypoints}
              hasAnyDeliveryTime={hasAnyDeliveryTime}
              errorByIndex={fieldErrors}
            />
          </div>
        </div>

        {/* 3. Strategy Section (Options Accordion) */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setIsOptionsOpen(!isOptionsOpen)}
            className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-700">
              <Settings className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-bold">고급 설정</span>
              {!isOptionsOpen && (
                <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-2">
                  {getAdvancedSettingsSummary()}
                </span>
              )}
            </div>
            {isOptionsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {isOptionsOpen && (
            <div className="p-4 bg-slate-50/50 border-t border-slate-200 space-y-5 animate-in slide-in-from-top-2">
              {/* 종료 정책 */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">종료 정책</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'return-origin', label: '출발지 복귀', icon: '↩️' },
                    { id: 'explicit', label: '별도 도착지', icon: '🏁' },
                    { id: null, label: '마지막 종료', icon: '🛑' }
                  ].map((option) => (
                    <button
                      key={String(option.id)}
                      onClick={() => {
                        if (option.id === 'return-origin') {
                          setDestinationPolicy('return-origin');
                          setUseExplicitDestination(false);
                          setReturnToOrigin(true);
                        } else if (option.id === 'explicit') {
                          setDestinationPolicy('explicit');
                          setUseExplicitDestination(true);
                          setReturnToOrigin(false);
                        } else {
                          setDestinationPolicy(null);
                          setUseExplicitDestination(false);
                          setReturnToOrigin(false);
                        }
                      }}
                      className={`flex flex-col items-center justify-center py-2 rounded-lg border transition-all ${(option.id === 'return-origin' && destinationPolicy === 'return-origin') ||
                          (option.id === 'explicit' && destinationPolicy === 'explicit') ||
                          (option.id === null && destinationPolicy === null)
                          ? 'bg-white border-indigo-500 text-indigo-700 shadow-sm ring-1 ring-indigo-500/20'
                          : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
                        }`}
                    >
                      <span className="text-sm mb-0.5">{option.icon}</span>
                      <span className="text-[10px] font-bold">{option.label}</span>
                    </button>
                  ))}
                </div>

                {/* 별도 도착지 입력창 */}
                {useExplicitDestination && (
                  <div className="mt-2 animate-in fade-in">
                    <AddressAutocomplete
                      label=""
                      placeholder="도착지 검색"
                      value={destinationSelection}
                      onSelect={(v) => setDestinationSelection(v)}
                    />
                  </div>
                )}
              </div>

              {/* 도로 옵션 */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">도로 옵션</span>
                <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                  {[
                    { id: 'time-first', label: '⏱️ 시간우선' },
                    { id: 'toll-saving', label: '💰 요금절약' },
                    { id: 'free-road-first', label: '🛣️ 무료우선' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setRoadOption(opt.id as any)}
                      className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${roadOption === opt.id
                          ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 기타 옵션 (스위치) */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">기타 설정</span>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <span className="text-xs font-medium text-slate-700">🔄 자동 순서 최적화</span>
                    <div className="relative flex items-center">
                      <input type="checkbox" className="peer sr-only" checked={optimizeOrder} onChange={(e) => setOptimizeOrder(e.target.checked)} />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>
                  <label className={`flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer ${!!originDepartureTime || hasAnyDeliveryTime ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <span className="text-xs font-medium text-slate-700">📡 실시간 교통정보</span>
                    <div className="relative flex items-center">
                      <input type="checkbox" className="peer sr-only" checked={useRealtimeTraffic} onChange={(e) => setUseRealtimeTraffic(e.target.checked)} disabled={!!originDepartureTime || hasAnyDeliveryTime} />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 메시지 영역 */}
        {(hasHardFailure || hasWarning || (lastError?.details?.errors?.length ?? 0) > 0) && (
          <div className={`rounded-xl p-4 border shadow-sm animate-in shake duration-300 ${hasHardFailure ? 'bg-rose-50 border-rose-100 text-rose-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
            <div className="flex items-start gap-3">
              <div className="text-xl mt-0.5">{hasHardFailure ? '🚫' : '⚠️'}</div>
              <div className="space-y-1">
                <div className="font-bold text-sm">{hasHardFailure ? '최적화 실패' : '주의 필요'}</div>
                <div className="text-xs leading-relaxed opacity-90">{localError || error || lastError?.message || lastError?.error}</div>
                {lastError?.details?.errors && (
                  <ul className="mt-2 text-[11px] bg-white/50 p-2 rounded-lg space-y-1 list-disc list-inside">
                    {lastError.details.errors.map((err: string, idx: number) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Footer Action Button */}
      <div className="sticky bottom-0 p-5 bg-white/80 backdrop-blur-md border-t border-slate-200 z-30">
        <button
          ref={optimizeButtonRef}
          onClick={async () => {
            console.log('🎯 [RouteOptimizerPanel] 최적 경로 계산 버튼 클릭됨');
            console.log('🔍 [RouteOptimizerPanel] 현재 상태:', {
              optimizationMode,
              driverCount,
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

            // 주소 미확정 경유지 차단
            const unconfirmedIdx: number[] = [];
            waypoints.forEach((w, i) => { if (!w.selection) unconfirmedIdx.push(i + 1); });
            if (unconfirmedIdx.length > 0) {
              console.log('❌ [RouteOptimizerPanel] 미확정 경유지 존재:', unconfirmedIdx);
              setLocalError(`주소가 확정되지 않은 경유지(${unconfirmedIdx.join(', ')})가 있습니다. 각 경유지에서 검색 후 Enter로 자동 확정하거나 목록에서 선택해 "확정됨" 상태로 만들어주세요.`);
              const fe: Record<number, string> = {};
              unconfirmedIdx.forEach((idx) => { fe[idx - 1] = '주소 미확정: 검색 후 Enter로 확정하거나 제안 목록에서 선택해주세요.'; });
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

            // 다중 배송원 모드 검증
            if (optimizationMode === 'multi') {
              if (driverCount < 2 || driverCount > 10) {
                setLocalError('배송원 수는 2~10명 사이여야 합니다.');
                return;
              }
              if (validWaypoints.length < driverCount) {
                setLocalError(`경유지 수(${validWaypoints.length})가 배송원 수(${driverCount})보다 적습니다.`);
                return;
              }
            }

            // 시간제약 기반 최적화를 위한 출발지 배송출발시간 필수 검증
            if (isOriginDepartureTimeRequired && !originDepartureTime) {
              console.log('❌ [RouteOptimizerPanel] 출발지 배송출발시간이 필수인데 비어있음');
              setLocalError('시간제약 기반 최적화를 위해 출발지 배송출발시간을 입력해주세요.');
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
                return false;
              }
              const [hours, minutes] = time.split(':').map(Number);
              const timeInMinutes = hours * 60 + minutes;
              return timeInMinutes < originTimeInMinutes;
            });

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
              finalUseRealtimeTraffic = false;
            }

            setDwellMinutes(allDwellTimes);
            setDestinations(finalDest);

            // 배송완료시간 및 다음날 배송 여부를 options에 추가
            const originDepartureDateTime = new Date();
            if (originDepartureTime) {
              const [originH, originM] = originDepartureTime.split(':').map(Number);
              originDepartureDateTime.setHours(originH, originM, 0, 0);
            } else {
              originDepartureDateTime.setHours(now.getHours(), now.getMinutes(), 0, 0);
            }

            const optionsWithDeliveryTimes = {
              useExplicitDestination,
              optimizeOrder,
              useRealtimeTraffic: finalUseRealtimeTraffic,
              departureAt: finalUseRealtimeTraffic ? null : new Date(departureDateTime).toISOString(),
              roadOption,
              returnToOrigin,
              deliveryTimes: deliveryTimes.map(t => t || ''),
              isNextDayFlags: isNextDayFlags
            };

            if (optimizationMode === 'multi') {
              // 다중 배송원 최적화
              console.log('🚛 [RouteOptimizerPanel] 다중 배송원 최적화 시작');
              setIsMultiDriverLoading(true);
              setMultiDriverResult(null);

              try {
                const origin = {
                  latitude: originSelection.latitude,
                  longitude: originSelection.longitude,
                  address: originSelection.address || originSelection.name || ''
                };

                const destinationsForMulti = finalDest.map(d => ({
                  latitude: d.lat,
                  longitude: d.lng,
                  address: d.address || ''
                }));

                const response = await fetch('/api/multi-driver-optimization', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    origin,
                    destinations: destinationsForMulti,
                    driverCount,
                    vehicleType,
                    optimizeOrder,
                    useRealtimeTraffic: finalUseRealtimeTraffic,
                    roadOption,
                    returnToOrigin,
                    departureAt: finalUseRealtimeTraffic ? null : new Date(departureDateTime).toISOString(),
                    deliveryTimes: deliveryTimes.map(t => t || ''),
                    isNextDayFlags: isNextDayFlags,
                    dwellMinutes: allDwellTimes
                  })
                });

                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({}));
                  throw new Error(errorData.error || errorData.message || '다중 배송원 최적화 실패');
                }

                const result = await response.json();
                console.log('✅ [RouteOptimizerPanel] 다중 배송원 최적화 완료:', result);
                setMultiDriverResult(result);
                setFieldErrors({});

                try {
                  (window as any).multiDriverResult = result;
                } catch (e) {
                  console.warn('전역 상태 저장 실패:', e);
                }

                if (shouldPersistOptimizationRun) {
                  try {
                    const saveResponse = await fetch('/api/optimization-runs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        requestData: {
                          origin,
                          destinations: destinationsForMulti,
                          driverCount,
                          vehicleType,
                          optimizeOrder,
                          useRealtimeTraffic: finalUseRealtimeTraffic,
                          roadOption,
                          returnToOrigin,
                          departureAt: finalUseRealtimeTraffic ? null : new Date(departureDateTime).toISOString(),
                          deliveryTimes: deliveryTimes.map(t => t || ''),
                          isNextDayFlags: isNextDayFlags,
                          dwellMinutes: allDwellTimes
                        },
                        resultData: result,
                        mode: 'multi-driver'
                      })
                    });

                    if (saveResponse.ok) {
                      const saveData = await saveResponse.json();
                      setSavedRouteId(saveData.data?.id || saveData.id);
                      console.log('✅ [RouteOptimizerPanel] 최적화 결과 저장 완료');
                    }
                  } catch (saveError) {
                    console.warn('최적화 결과 저장 실패:', saveError);
                  }
                }
              } catch (error) {
                console.error('❌ [RouteOptimizerPanel] 다중 배송원 최적화 오류:', error);
                setLocalError('다중 배송원 최적화 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
              } finally {
                setIsMultiDriverLoading(false);
              }
            } else {
              // 단일 차량 최적화
              console.log('🚀 [RouteOptimizerPanel] 단일 차량 최적화 시작');

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

                setTimeout(async () => {
                  try {
                    const currentRouteData = routeData;
                    if (shouldPersistOptimizationRun && currentRouteData && currentRouteData.summary) {
                      const saveResponse = await fetch('/api/optimization-runs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          requestData: {
                            origins: originSelection ? {
                              lat: originSelection.latitude,
                              lng: originSelection.longitude,
                              address: originSelection.address || originSelection.name
                            } : null,
                            destinations: finalDest,
                            vehicleType,
                            optimizeOrder,
                            useRealtimeTraffic: finalUseRealtimeTraffic,
                            roadOption,
                            returnToOrigin,
                            departureAt: finalUseRealtimeTraffic ? null : new Date(departureDateTime).toISOString(),
                            deliveryTimes: deliveryTimes.map(t => t || ''),
                            isNextDayFlags: isNextDayFlags,
                            dwellMinutes: allDwellTimes
                          },
                          resultData: currentRouteData,
                          mode: 'single'
                        })
                      });

                      if (saveResponse.ok) {
                        const saveData = await saveResponse.json();
                        setSavedRouteId(saveData.data?.id || saveData.id);
                        console.log('✅ [RouteOptimizerPanel] 단일 차량 최적화 결과 저장 완료');
                      }
                    }
                  } catch (saveError) {
                    console.warn('단일 차량 최적화 결과 저장 실패:', saveError);
                  }
                }, 1000);
              } catch (error) {
                console.error('❌ [RouteOptimizerPanel] optimizeRouteWith 오류:', error);
                setLocalError('경로 최적화 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
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
            }

            setTimeout(() => {
              const quoteSection = document.querySelector('[data-section="quote"]');
              if (quoteSection) {
                quoteSection.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }
            }, 500);
          }}
          disabled={isLoading || isMultiDriverLoading}
          className={`w-full h-14 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center gap-2 ${isLoading || isMultiDriverLoading
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:shadow-indigo-300 hover:-translate-y-0.5'
            }`}
        >
          {isLoading || isMultiDriverLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {optimizationMode === 'multi' ? `${driverCount}명 배송원 경로 계산 중…` : '최적 경로 계산 중…'}
            </>
          ) : (
            <>
              <span>🚀</span>
              {optimizationMode === 'multi' ? `${driverCount}명 배송원 경로 계산` : '최적 경로 계산'}
            </>
          )}
        </button>
      </div>

      {/* 다중 배송원 결과 표시 (Floating Modal처럼 표시하거나 별도 영역으로) */}
      {optimizationMode === 'multi' && multiDriverResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-800">다중 배송원 최적화 결과</h3>
              <button
                onClick={() => setMultiDriverResult(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronDown className="rotate-180" />
              </button>
            </div>
            <div className="p-4">
              <MultiDriverResultsPanel result={multiDriverResult} />
            </div>
          </div>
        </div>
      )}

      {/* 저장된 경로 불러오기 (하단 숨김 버튼) */}
      <div className="p-5 pt-2 text-center">
        <button
          onClick={openSavedRouteModal}
          className="text-xs text-slate-400 hover:text-indigo-600 transition-colors underline decoration-slate-200 underline-offset-2"
        >
          최근 저장된 경로 불러오기
        </button>
      </div>

      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/60 bg-white/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">최근 저장된 경로</h3>
                <p className="text-xs text-slate-500 mt-0.5">불러올 경로를 선택하세요</p>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-2">
              {isHistoryLoading && (
                <div className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-4">
                  저장 경로를 불러오는 중입니다...
                </div>
              )}

              {!isHistoryLoading && historyError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-4">
                  {historyError}
                </div>
              )}

              {!isHistoryLoading && !historyError && historyRuns.map((run, idx) => {
                const requestData = run.request_data || run.requestData || {};
                const mode = requestData.mode || (requestData.driverCount ? 'multi-driver' : 'single');
                const modeText = mode === 'multi-driver' ? '다중 배송원' : '단일 차량';
                const distanceText = run.total_distance ? `${(run.total_distance / 1000).toFixed(1)}km` : '거리 없음';
                const created = run.created_at || run.createdAt;
                const dateText = created
                  ? new Date(created).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '시간 정보 없음';

                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      applySavedRunToInputs(run);
                      setIsHistoryModalOpen(false);
                    }}
                    className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-800">{idx + 1}. {modeText}</div>
                      <div className="text-[11px] text-slate-500">{dateText}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {run.vehicle_type || '차량 미상'} · {distanceText}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {historyNotice && (
        <div className="px-5 pb-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 text-xs px-3 py-2">
            {historyNotice}
          </div>
        </div>
      )}

    </section>
  );
}
