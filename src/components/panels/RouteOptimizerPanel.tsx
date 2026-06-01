'use client';

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';
import WaypointList, { type Waypoint } from './WaypointList';
import MultiDriverResultsPanel from './MultiDriverResultsPanel';
import {
  ChevronDown,
  ChevronUp,
  Settings,
  X,
  Map,
  Car,
  Truck,
  Calendar,
  CornerUpLeft,
  Flag,
  MapPin,
  Clock,
  Coins,
  Route,
  Shuffle,
  Radio,
  Navigation,
  Ban,
  AlertTriangle,
} from 'lucide-react';
import { Tabs, RadioGroup, Switch } from '@/components/ui';
import { cn } from '@/utils/cn';
import { reportActionFailure } from '@/libs/errorReporting';
import { resolveDepartureDateTime, formatDepartureLabel, describeRelativeDay } from '@/domains/dispatch/utils/departureTime';

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

interface RouteOptimizerPanelProps {
  /** 'rail'(좌측 풀하이트) | 'dock'(커맨드 독 시트 내부 — 자체 크롬/테두리 제거) */
  variant?: 'rail' | 'dock';
}

export default function RouteOptimizerPanel({ variant = 'rail' }: RouteOptimizerPanelProps = {}) {
  const isDock = variant === 'dock';
  // 최적화 실행 결과는 환경(localhost 포함)과 무관하게 항상 저장한다.
  // (이전엔 localhost에서 저장이 비활성화되어 "저장된 경로 불러오기"가 항상 비어 있었음)
  const shouldPersistOptimizationRun = true;
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('single');
  const [driverCount, setDriverCount] = useState(2);
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
    multiDriverResult,
    setMultiDriverResult,
    inputApplyRequest,
  } = useRouteOptimization();

  // 외부에서 입력값을 설정할 수 있는 함수들
  const setInputFromHistory = useCallback((requestData: any) => {
    console.log('setInputFromHistory 호출됨:', requestData);

    // 경로 지점은 문자열(주소) 또는 좌표 객체({name,address,latitude,longitude}) 둘 다 올 수 있다.
    // 둘 다 안전하게 selection으로 정규화한다(좌표가 있으면 보존).
    const toSelection = (p: any) => {
      if (p && typeof p === 'object') {
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        const address = String(p.address ?? p.name ?? '');
        return {
          latitude: Number.isFinite(lat) ? lat : 0,
          longitude: Number.isFinite(lng) ? lng : 0,
          address,
          name: String(p.name ?? p.address ?? address),
        };
      }
      const s = String(p ?? '');
      return { latitude: 0, longitude: 0, address: s, name: s };
    };
    const toAddress = (p: any) =>
      p && typeof p === 'object' ? String(p.address ?? p.name ?? '') : String(p ?? '');

    // 출발지 설정
    if (requestData.origins?.[0]) {
      setOriginSelection(toSelection(requestData.origins[0]));
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
      const allPoints = requestData.destinations as any[];
      const explicitDestinationAddress =
        typeof requestData.finalDestinationAddress === 'string' && requestData.finalDestinationAddress.trim()
          ? requestData.finalDestinationAddress.trim()
          : hasExplicitDestination
            ? toAddress(allPoints[allPoints.length - 1])
            : null;
      const waypointPoints = explicitDestinationAddress
        ? allPoints.filter((_, index) => index < allPoints.length - 1)
        : allPoints;

      const newWaypoints = waypointPoints.map((p: any, index: number) => ({
        id: `waypoint-${index + 1}`,
        selection: toSelection(p),
        dwellTime: 10,
        deliveryTime: undefined
      }));
      setWaypoints(newWaypoints);

      if (explicitDestinationAddress) {
        // 마지막 지점의 좌표가 있으면 보존(없으면 0,0).
        const lastSel = toSelection(allPoints[allPoints.length - 1]);
        setDestinationSelection({
          latitude: lastSel.latitude,
          longitude: lastSel.longitude,
          address: explicitDestinationAddress,
          name: explicitDestinationAddress,
        });
      } else {
        setDestinationSelection(null);
      }
    }
  }, [setVehicleType]);

  // 견적챗/이력에서 입력 적용을 요청하면 컨텍스트의 inputApplyRequest가 갱신된다.
  // (이전엔 전역 함수 등록 + CustomEvent 방식으로 처리했음)
  useEffect(() => {
    if (!inputApplyRequest?.data) return;
    setInputFromHistory(inputApplyRequest.data);
  }, [inputApplyRequest, setInputFromHistory]);

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
      console.log('[useEffect] 시간 설정 감지 - 실시간 교통정보 자동 비활성화');
      setUseRealtimeTraffic(false);
    }
  }, [originDepartureTime, hasAnyDeliveryTime, useRealtimeTraffic]);

  // 출발지 배송출발시간이 설정되면 실시간 교통정보 자동 비활성화 (다음날 기준 계산)
  useEffect(() => {
    if (originDepartureTime && useRealtimeTraffic) {
      console.log('[useEffect] 출발지 배송출발시간 설정 - 실시간 교통정보 자동 비활성화 (다음날 기준)');
      setUseRealtimeTraffic(false);
    }
  }, [originDepartureTime, useRealtimeTraffic]);

  // 출발지 배송출발시간이 설정되면 계산 기준 시각을 자동 해석한다.
  // 입력 시각이 미래이면 오늘, 이미 지났으면 다음날(주말이면 다음 평일)로 판정한다.
  const resolvedDeparture = useMemo(
    () => (originDepartureTime ? resolveDepartureDateTime(originDepartureTime) : null),
    [originDepartureTime]
  );

  useEffect(() => {
    if (resolvedDeparture) {
      setDepartureDateTime(resolvedDeparture.isoLocal);
    }
  }, [resolvedDeparture]);

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
    <section className={isDock
      ? 'flex flex-col bg-transparent font-sans'
      : 'flex flex-col glass-card rounded-none border-0 border-r border-border font-sans transition-all duration-300'}>
      {/* Header — 도크 모드에서는 독이 자체 헤더를 제공하므로 숨김 */}
      {!isDock && (
        <div className="flex-none px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary rounded-xl text-primary-foreground flex items-center justify-center">
              <Map className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground tracking-tight leading-tight">경로 최적화</h2>
            </div>
          </div>
        </div>
      )}

      {/* Main Content (Scrollable) */}
      <div className={isDock ? 'p-1 space-y-6' : 'p-5 space-y-6 pb-6'}>
        {/* 1. Resource Section (Mode & Vehicle) */}
        <div className={isDock ? 'rounded-2xl border border-border bg-card/40 p-3.5 space-y-3.5' : 'bg-muted rounded-xl border border-border p-4 space-y-4'}>
          {/* 모드 선택 */}
          <RadioGroup
            value={optimizationMode}
            onValueChange={(value) => {
              setOptimizationMode(value);
              setMultiDriverResult(null);
            }}
            variant="cards"
            columns={2}
            aria-label="최적화 모드"
            options={[
              { value: 'single', label: '단일 차량', icon: <Car className="w-4 h-4" /> },
              { value: 'multi', label: '다중 배송원', icon: <Truck className="w-4 h-4" /> },
            ]}
          />

          {/* 차량 타입 선택 */}
          <Tabs
            value={vehicleType}
            onValueChange={(value) => setVehicleType(value)}
            size="sm"
            aria-label="차량 타입"
            className="flex w-full"
            items={[
              { value: '레이', label: '레이 (승용)' },
              { value: '스타렉스', label: '스타렉스 (화물)' },
            ]}
          />

          {/* 다중 배송원 모드일 때만 표시: 배송원 수 */}
          {optimizationMode === 'multi' && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs font-medium text-muted-foreground">배송원 수</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="2"
                  max="10"
                  value={driverCount}
                  onChange={(e) => setDriverCount(parseInt(e.target.value))}
                  className="w-24 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <span className="text-xs font-bold text-primary w-8 text-right">{driverCount}명</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. Route Section (Origin & Waypoints) */}
        <div className="space-y-4 relative">
          {/* 타임라인 연결선 (출발지부터 경유지까지) */}
          <div className="absolute left-[11px] top-6 bottom-[100px] w-0.5 bg-border -z-10 rounded-full" />
          
          {/* 출발지 입력 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] z-10 -ml-[5px] ring-4 ring-white"></div>
              출발지 정보
            </label>
            <div className="relative group ml-4">
              <div className="relative bg-card rounded-xl shadow-sm border border-border transition-colors group-focus-within:border-primary/40">
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
              <div className="ml-4 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-card shadow-sm px-3 py-2 rounded-lg border border-border">
                    <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">체류</span>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={originDwellTime}
                      onChange={(e) => setOriginDwellTime(Math.max(0, parseInt(e.target.value || '0')))}
                      className="w-full bg-transparent text-xs text-center font-bold text-foreground focus:outline-none border-b border-transparent focus:border-primary"
                    />
                    <span className="text-[10px] text-muted-foreground">분</span>
                  </div>
                  <div className={`flex-[1.5] shadow-sm flex items-center gap-2 bg-card px-3 py-2 rounded-lg border transition-colors ${isOriginDepartureTimeRequired && !originDepartureTime ? 'border-rose-300 bg-rose-50' : 'border-border'}`}>
                    <span className={`text-[10px] font-semibold whitespace-nowrap ${isOriginDepartureTimeRequired ? 'text-rose-600' : 'text-muted-foreground'}`}>
                      출발 {isOriginDepartureTimeRequired && '*'}
                    </span>
                    <input
                      type="time"
                      value={originDepartureTime}
                      onChange={(e) => setOriginDepartureTime(e.target.value)}
                      className="w-full bg-transparent text-xs text-center font-bold text-foreground focus:outline-none"
                    />
                  </div>
                </div>

                {/* 계산 기준 날짜 안내: 입력 시각의 today/tomorrow/주말보정 결과를 투명하게 노출 */}
                {resolvedDeparture && (
                  <div className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
                    <Calendar className="w-3 h-3 text-indigo-500" />
                    <span>
                      계산 기준{' '}
                      <span className="font-bold text-foreground">
                        {describeRelativeDay(resolvedDeparture.date)
                          ? `${describeRelativeDay(resolvedDeparture.date)} · `
                          : ''}
                        {formatDepartureLabel(resolvedDeparture.date)}
                      </span>
                      {' '}출발
                    </span>
                    {resolvedDeparture.adjustedForWeekend && (
                      <span className="text-amber-600 font-semibold">(주말→평일 보정)</span>
                    )}
                    <span className="ml-auto text-muted-foreground">예측 교통</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 경유지 리스트 Header & Bulk Actions */}
          <div className="flex items-center justify-between pt-2 ml-4">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full border-2 border-border bg-card z-10 -ml-[25px] ring-4 ring-background"></div>
              경유지 목록
            </label>
            <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setWaypoints(prev => prev.map(w => ({ ...w, dwellTime: 10 })))}
                className="text-[10px] font-medium bg-muted hover:bg-accent text-foreground px-2 py-1 rounded transition-colors"
                title="모든 경유지 체류시간을 10분으로 통일"
              >
                10분 통일
              </button>
              <button
                type="button"
                onClick={() => setWaypoints(prev => prev.map(w => ({ ...w, deliveryTime: undefined })))}
                className="text-[10px] font-medium bg-muted hover:bg-error-muted hover:text-error text-foreground px-2 py-1 rounded transition-colors"
                title="모든 도착시간 설정 초기화"
              >
                시간 초기화
              </button>
            </div>
          </div>

          {/* 경유지 리스트 Content */}
          <div className={isDock ? 'rounded-2xl p-1 ml-4' : 'bg-muted/50 rounded-2xl border border-border p-1 ml-4 shadow-sm'}>
            <WaypointList
              waypoints={waypoints}
              onWaypointsChange={setWaypoints}
              hasAnyDeliveryTime={hasAnyDeliveryTime}
              errorByIndex={fieldErrors}
            />
          </div>
        </div>

        {/* 3. Strategy Section (Options Accordion) */}
        <div className="border border-border rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setIsOptionsOpen(!isOptionsOpen)}
            className="w-full flex items-center justify-between p-4 bg-card hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-2 text-foreground">
              <Settings className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-bold">고급 설정</span>
              {!isOptionsOpen && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-2">
                  {getAdvancedSettingsSummary()}
                </span>
              )}
            </div>
            {isOptionsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {isOptionsOpen && (
            <div className="p-4 bg-muted/50 border-t border-border space-y-5 animate-in slide-in-from-top-2">
              {/* 종료 정책 */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">종료 정책</span>
                <RadioGroup
                  value={destinationPolicy ?? 'last-stop'}
                  onValueChange={(value) => {
                    if (value === 'return-origin') {
                      setDestinationPolicy('return-origin');
                      setUseExplicitDestination(false);
                      setReturnToOrigin(true);
                    } else if (value === 'explicit') {
                      setDestinationPolicy('explicit');
                      setUseExplicitDestination(true);
                      setReturnToOrigin(false);
                    } else {
                      setDestinationPolicy(null);
                      setUseExplicitDestination(false);
                      setReturnToOrigin(false);
                    }
                  }}
                  variant="cards"
                  columns={3}
                  aria-label="종료 정책"
                  options={[
                    { value: 'return-origin', label: '출발지 복귀', icon: <CornerUpLeft className="w-4 h-4" /> },
                    { value: 'explicit', label: '별도 도착지', icon: <Flag className="w-4 h-4" /> },
                    { value: 'last-stop', label: '마지막 종료', icon: <MapPin className="w-4 h-4" /> },
                  ]}
                />

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
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">도로 옵션</span>
                <RadioGroup
                  value={roadOption}
                  onValueChange={(value) => setRoadOption(value)}
                  variant="segmented"
                  aria-label="도로 옵션"
                  options={[
                    { value: 'time-first', label: '시간우선', icon: <Clock className="w-3 h-3" />, description: '유료도로 포함, 최단 소요시간' },
                    { value: 'toll-saving', label: '요금절약', icon: <Coins className="w-3 h-3" />, description: '시간 일부 양보, 통행료 최소화' },
                    { value: 'free-road-first', label: '무료우선', icon: <Route className="w-3 h-3" />, description: '유료도로 회피, 시간 무관' },
                  ]}
                />
                <p className="text-[10px] text-muted-foreground leading-snug px-1">
                  {roadOption === 'time-first' && '유료도로를 포함해 가장 빠른 경로. 통행료가 발생할 수 있습니다.'}
                  {roadOption === 'toll-saving' && '시간을 조금 양보하는 대신 통행료를 줄이는 절충안.'}
                  {roadOption === 'free-road-first' && '유료도로를 회피합니다. 시간은 더 걸릴 수 있습니다.'}
                </p>
              </div>

              {/* 기타 옵션 (스위치) */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">기타 설정</span>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between p-2 bg-card rounded-lg border border-border">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <Shuffle className="w-3.5 h-3.5 text-muted-foreground" />
                      자동 순서 최적화
                    </span>
                    <Switch
                      checked={optimizeOrder}
                      onCheckedChange={setOptimizeOrder}
                      size="sm"
                      aria-label="자동 순서 최적화"
                    />
                  </div>
                  <div
                    className={cn(
                      'flex items-center justify-between p-2 bg-card rounded-lg border border-border',
                      (!!originDepartureTime || hasAnyDeliveryTime) && 'opacity-60',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <Radio className="w-3.5 h-3.5 text-muted-foreground" />
                      실시간 교통정보
                    </span>
                    <Switch
                      checked={useRealtimeTraffic}
                      onCheckedChange={setUseRealtimeTraffic}
                      disabled={!!originDepartureTime || hasAnyDeliveryTime}
                      size="sm"
                      aria-label="실시간 교통정보"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 메시지 영역 */}
        {(hasHardFailure || hasWarning || (lastError?.details?.errors?.length ?? 0) > 0) && (
          <div className={`rounded-xl p-4 border shadow-sm animate-in shake duration-300 ${hasHardFailure ? 'bg-error-muted border-error/20 text-error' : 'bg-warning-muted border-warning/20 text-warning'}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{hasHardFailure ? <Ban className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}</div>
              <div className="space-y-1">
                <div className="font-bold text-sm">{hasHardFailure ? '최적화 실패' : '주의 필요'}</div>
                <div className="text-xs leading-relaxed opacity-90">{localError || error || lastError?.message || lastError?.error}</div>
                {lastError?.details?.errors && (
                  <ul className="mt-2 text-[11px] bg-background/40 p-2 rounded-lg space-y-1 list-disc list-inside">
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
      <div className={isDock ? 'sticky bottom-0 z-30 -mx-1 px-1 pt-4 pb-1 bg-gradient-to-t from-card via-card/90 to-transparent' : 'sticky bottom-0 p-5 bg-card border-t border-border z-30'}>
        <button
          ref={optimizeButtonRef}
          onClick={async () => {
            console.log('[RouteOptimizerPanel] 최적 경로 계산 버튼 클릭됨');
            console.log('[RouteOptimizerPanel] 현재 상태:', {
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
              console.log('[RouteOptimizerPanel] 출발지가 선택되지 않음');
              setLocalError('출발지를 먼저 선택하세요.');
              return;
            }

            // 주소 미확정 경유지 차단
            const unconfirmedIdx: number[] = [];
            waypoints.forEach((w, i) => { if (!w.selection) unconfirmedIdx.push(i + 1); });
            if (unconfirmedIdx.length > 0) {
              console.log('[RouteOptimizerPanel] 미확정 경유지 존재:', unconfirmedIdx);
              setLocalError(`주소가 확정되지 않은 경유지(${unconfirmedIdx.join(', ')})가 있습니다. 각 경유지에서 검색 후 Enter로 자동 확정하거나 목록에서 선택해 "확정됨" 상태로 만들어주세요.`);
              const fe: Record<number, string> = {};
              unconfirmedIdx.forEach((idx) => { fe[idx - 1] = '주소 미확정: 검색 후 Enter로 확정하거나 제안 목록에서 선택해주세요.'; });
              setFieldErrors(fe);
              return;
            }

            // waypoints에서 유효한 목적지 추출
            const validWaypoints: Waypoint[] = waypoints.filter(w => w.selection);
            console.log('[RouteOptimizerPanel] 유효한 waypoints:', validWaypoints);

            if (validWaypoints.length === 0) {
              console.log('[RouteOptimizerPanel] 유효한 목적지가 없음');
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
              console.log('[RouteOptimizerPanel] 출발지 배송출발시간이 필수인데 비어있음');
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
              console.log('[RouteOptimizerPanel] 시간 설정 감지 - 실시간 교통정보 자동 비활성화');
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

            // 우측 패널의 도로 옵션 재계산 등 후속 호출에서 좌측 패널의 시간/배송완료/다음날 플래그가
            // 누락되지 않도록, 계산 직전에 hook state로 스냅샷을 함께 반영한다.
            setOptions(optionsWithDeliveryTimes);

            if (optimizationMode === 'multi') {
              // 다중 배송원 최적화
              console.log('[RouteOptimizerPanel] 다중 배송원 최적화 시작');
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
                console.log('[RouteOptimizerPanel] 다중 배송원 최적화 완료:', result);
                setMultiDriverResult(result);
                setFieldErrors({});

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
                      console.log('[RouteOptimizerPanel] 최적화 결과 저장 완료');
                    }
                  } catch (saveError) {
                    console.warn('최적화 결과 저장 실패:', saveError);
                  }
                }
              } catch (error) {
                console.error('[RouteOptimizerPanel] 다중 배송원 최적화 오류:', error);
                setLocalError('다중 배송원 최적화가 중단됐어요: ' + (error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요'));
                reportActionFailure({
                  source: 'route_optimization',
                  action: 'multi_driver_optimization',
                  error,
                  context: {
                    driverCount,
                    vehicleType,
                    destinationCount: finalDest.length,
                    roadOption,
                    useRealtimeTraffic: finalUseRealtimeTraffic,
                  },
                });
              } finally {
                setIsMultiDriverLoading(false);
              }
            } else {
              // 단일 차량 최적화
              console.log('[RouteOptimizerPanel] 단일 차량 최적화 시작');

              try {
                const optimizeResult = await optimizeRouteWith({
                  origins: originSelection ? {
                    lat: originSelection.latitude,
                    lng: originSelection.longitude,
                    address: originSelection.address || originSelection.name
                  } : null,
                  destinations: finalDest,
                  options: optionsWithDeliveryTimes,
                  dwellMinutes: allDwellTimes
                });
                console.log('[RouteOptimizerPanel] optimizeRouteWith 호출 완료');
                setFieldErrors({});

                // optimizeRouteWith가 반환한 최신 결과로 저장한다.
                // (이전엔 stale 클로저의 routeData를 읽어 항상 저장이 누락됐음)
                const savedRouteData = optimizeResult?.data;
                try {
                  if (shouldPersistOptimizationRun && optimizeResult?.success && savedRouteData?.summary) {
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
                        resultData: savedRouteData,
                        mode: 'single'
                      })
                    });

                    if (saveResponse.ok) {
                      const saveData = await saveResponse.json();
                      setSavedRouteId(saveData.data?.id || saveData.id);
                      console.log('[RouteOptimizerPanel] 단일 차량 최적화 결과 저장 완료');
                    }
                  }
                } catch (saveError) {
                  console.warn('단일 차량 최적화 결과 저장 실패:', saveError);
                }
              } catch (error) {
                console.error('[RouteOptimizerPanel] optimizeRouteWith 오류:', error);
                setLocalError('경로 최적화가 중단됐어요: ' + (error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요'));
                reportActionFailure({
                  source: 'route_optimization',
                  action: 'optimize_single_panel_exception',
                  error,
                  context: {
                    vehicleType,
                    destinationCount: finalDest.length,
                    roadOption,
                    useRealtimeTraffic: finalUseRealtimeTraffic,
                  },
                });
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
          className={cn(
            'w-full h-14 rounded-xl font-bold text-lg shadow-lg transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center gap-2',
            isLoading || isMultiDriverLoading
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:brightness-110 hover:-translate-y-0.5',
          )}
        >
          {isLoading || isMultiDriverLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {optimizationMode === 'multi' ? `${driverCount}명 배송원 경로 계산 중…` : '최적 경로 계산 중…'}
            </>
          ) : (
            <>
              <Navigation className="w-5 h-5" />
              {optimizationMode === 'multi' ? `${driverCount}명 배송원 경로 계산` : '최적 경로 계산'}
            </>
          )}
        </button>
      </div>

      {/* 다중 배송원 결과 표시 (Floating Modal처럼 표시하거나 별도 영역으로) */}
      {optimizationMode === 'multi' && multiDriverResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-overlay p-4">
          <div className="bg-card rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-border flex justify-between items-center sticky top-0 bg-card z-10">
              <h3 className="text-lg font-bold text-foreground">다중 배송원 최적화 결과</h3>
              <button
                onClick={() => setMultiDriverResult(null)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
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
          className="text-xs text-muted-foreground hover:text-primary transition-colors underline decoration-border underline-offset-2"
        >
          최근 저장된 경로 불러오기
        </button>
      </div>

      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center glass-overlay p-4">
          <div className="w-full max-w-2xl rounded-2xl glass-canvas overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">최근 저장된 경로</h3>
                <p className="text-xs text-muted-foreground mt-0.5">불러올 경로를 선택하세요</p>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-2 rounded-lg text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-2">
              {isHistoryLoading && (
                <div className="text-sm text-muted-foreground bg-muted border border-border rounded-xl p-4">
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
                    className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">{idx + 1}. {modeText}</div>
                      <div className="text-[11px] text-muted-foreground">{dateText}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
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
