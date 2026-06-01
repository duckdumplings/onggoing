'use client';

import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef, useState } from 'react';
import { reportActionFailure } from '@/libs/errorReporting';

export interface Coordinate { lat: number; lng: number; address?: string }

export interface RouteSummary {
  totalDistance: number; // meters
  totalTime: number; // seconds
  vehicleTypeCode?: string;
  optimizeOrder?: boolean;
  usedTraffic?: 'realtime' | 'standard';
  departureAt?: string | null;
  roadOptionApplied?: 'time-first' | 'toll-saving' | 'free-road-first';
  roadComparisons?: Array<{
    option: 'time-first' | 'toll-saving' | 'free-road-first';
    label: string;
    estimatedDistance: number;
    estimatedTime: number;
    estimatedToll: number;
    tollSource?: 'api' | 'estimated';
    isSelected: boolean;
  }>;
}

export interface RouteData {
  type?: string;
  features?: any[];
  summary?: RouteSummary;
  waypoints?: Array<{
    latitude: number;
    longitude: number;
    address?: string;
    arrivalTime?: string;
    departureTime?: string;
    dwellTime?: number;
    deliveryTime?: string | null;
    isNextDay?: boolean;
  }>;
}

export interface OptimizationOptions {
  optimizeOrder: boolean;
  useRealtimeTraffic: boolean;
  departureAt?: string | null;
  useExplicitDestination?: boolean; // 도착지 별도 입력 사용
  roadOption?: 'time-first' | 'toll-saving' | 'free-road-first';
  returnToOrigin?: boolean;
  deliveryTimes?: string[]; // 배송완료시간 배열 (24시간 형식: "14:30")
  isNextDayFlags?: boolean[]; // 다음날 배송 여부 배열
}

export interface RouteOptimizationPayload {
  origins: Array<{ latitude?: number; longitude?: number; address: string }>;
  destinations: Array<{ latitude?: number; longitude?: number; address: string }>;
  finalDestinationAddress: string | null;
  vehicleType: string;
  optimizeOrder: boolean;
  useRealtimeTraffic: boolean;
  departureAt: string | null | undefined;
  useExplicitDestination: boolean;
  roadOption: 'time-first' | 'toll-saving' | 'free-road-first';
  returnToOrigin: boolean;
  dwellMinutes: number[];
  deliveryTimes: string[];
  isNextDayFlags: boolean[];
}

export interface RouteOptimizationBaseState {
  origins: Coordinate | null;
  destinations: Coordinate[];
  vehicleType: string;
  options: OptimizationOptions;
  dwellMinutes: number[];
}

export interface RouteOptimizationOverride {
  origins?: Coordinate | null;
  destinations?: Coordinate[];
  rawOrigins?: string[];
  rawDestinations?: string[];
  vehicleType?: string;
  options?: Partial<OptimizationOptions>;
  dwellMinutes?: number[];
}

/**
 * 경로 최적화 API 요청 payload를 생성하는 순수 함수.
 * 훅 외부에서도 회귀 검증을 위해 직접 호출할 수 있도록 분리한다.
 */
export function buildRouteOptimizationPayload(
  state: RouteOptimizationBaseState,
  override?: RouteOptimizationOverride
): RouteOptimizationPayload {
  const o = override?.origins ?? state.origins;
  const d = override?.destinations ?? state.destinations;
  const rawOrigins = override?.rawOrigins;
  const rawDestinations = override?.rawDestinations;
  const v = override?.vehicleType ?? state.vehicleType;
  const opt: OptimizationOptions = { ...state.options, ...(override?.options || {}) };
  const dm = override?.dwellMinutes ?? state.dwellMinutes;

  const originPayload = Array.isArray(rawOrigins)
    ? rawOrigins.map((address) => ({ address }))
    : (o ? [{ latitude: o.lat, longitude: o.lng, address: o.address || 'origin' }] : []);
  const destPayload = Array.isArray(rawDestinations)
    ? rawDestinations.map((address) => ({ address }))
    : d.map(dt => ({ latitude: dt.lat, longitude: dt.lng, address: dt.address || 'dest' }));

  return {
    origins: originPayload,
    destinations: destPayload,
    finalDestinationAddress: opt.useExplicitDestination
      ? (Array.isArray(rawDestinations) && rawDestinations.length
        ? rawDestinations[rawDestinations.length - 1]
        : (d.length ? d[d.length - 1]?.address || null : null))
      : null,
    vehicleType: v,
    optimizeOrder: opt.optimizeOrder,
    useRealtimeTraffic: opt.useRealtimeTraffic,
    departureAt: opt.departureAt,
    useExplicitDestination: Boolean(opt.useExplicitDestination),
    roadOption: opt.roadOption || 'time-first',
    returnToOrigin: opt.returnToOrigin ?? true,
    dwellMinutes: dm,
    deliveryTimes: opt.deliveryTimes || [],
    isNextDayFlags: opt.isNextDayFlags || [],
  };
}

function pickFirstRouteCoordinate(routeData: any): { lat: number; lng: number } | null {
  const features = Array.isArray(routeData?.features) ? routeData.features : [];
  for (const feature of features) {
    const geom = feature?.geometry;
    if (!geom) continue;
    if (geom.type === 'Point' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
      const [lng, lat] = geom.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
      const first = geom.coordinates[0];
      if (Array.isArray(first) && first.length >= 2) {
        const [lng, lat] = first;
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
    }
  }
  return null;
}

/**
 * 경로 최적화 요청의 수명주기를 단일 상태 머신으로 관리한다.
 * isLoading/error/lastError/routeData가 개별 useState로 흩어져 서로 어긋나던 문제를
 * 하나의 상태 전이 규칙으로 통합한다.
 */
export type RouteRequestStatus = 'idle' | 'loading' | 'success' | 'error';

interface RouteRequestState {
  status: RouteRequestStatus;
  routeData: RouteData | null;
  error: string | null;
  lastError: any | null;
}

type RouteRequestAction =
  | { type: 'START' }
  | { type: 'SUCCESS'; routeData: RouteData }
  | { type: 'ERROR'; error: string; lastError?: any }
  | { type: 'VALIDATION_ERROR'; error: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' }
  | { type: 'SET_ROUTE_DATA'; routeData: RouteData | null };

const initialRequestState: RouteRequestState = {
  status: 'idle',
  routeData: null,
  error: null,
  lastError: null,
};

function routeRequestReducer(state: RouteRequestState, action: RouteRequestAction): RouteRequestState {
  switch (action.type) {
    case 'START':
      return { ...state, status: 'loading', error: null };
    case 'SUCCESS':
      return { status: 'success', routeData: action.routeData, error: null, lastError: null };
    case 'ERROR':
      return {
        ...state,
        status: 'error',
        error: action.error,
        lastError: action.lastError !== undefined ? action.lastError : state.lastError,
      };
    case 'VALIDATION_ERROR':
      return { ...state, status: 'error', error: action.error };
    case 'CANCEL':
      return { ...state, status: state.status === 'loading' ? 'idle' : state.status };
    case 'RESET':
      return { ...initialRequestState };
    case 'SET_ROUTE_DATA':
      return { ...state, routeData: action.routeData };
    default:
      return state;
  }
}

export interface RouteOptimizationState {
  origins: Coordinate | null;
  destinations: Coordinate[];
  routeData: RouteData | null;
  status: RouteRequestStatus;
  isLoading: boolean;
  error: string | null;
  vehicleType: '레이' | '스타렉스' | string;
  options: OptimizationOptions;
  waypoints: Coordinate[];
  dwellMinutes: number[];
  setOrigins: (c: Coordinate | null) => void;
  setDestinations: (list: Coordinate[]) => void;
  setVehicleType: (v: RouteOptimizationState['vehicleType']) => void;
  setOptions: (o: Partial<OptimizationOptions>) => void;
  setRouteData: (d: RouteData | null) => void;
  setDwellMinutes: (list: number[]) => void;
  optimizeRoute: () => Promise<{ success: boolean; error?: string; details?: any; data?: any }>;
  optimizeRouteWith: (override?: Partial<{
    origins: Coordinate | null;
    destinations: Coordinate[];
    rawOrigins: string[];
    rawDestinations: string[];
    vehicleType: RouteOptimizationState['vehicleType'];
    options: Partial<OptimizationOptions>;
    dwellMinutes: number[];
  }>) => Promise<{ success: boolean; error?: string; details?: any; data?: any }>;
  retry: () => Promise<{ success: boolean; error?: string; details?: any; data?: any }>;
  cancel: () => void;
  reset: () => void;
  lastError: any | null;
  // 다중 배송원 결과 — RouteOptimizerPanel, TmapMainMap, AIQuoteChat 간 공유 (window 전역 대체)
  multiDriverResult: any;
  setMultiDriverResult: (result: any) => void;
  // 외부(견적챗/이력)에서 RouteOptimizerPanel 입력을 채우는 요청 (window 전역 대체)
  inputApplyRequest: { data: any; nonce: number } | null;
  requestInputApply: (data: any) => void;
  // 임의 텍스트를 견적챗으로 전송하는 요청 (지도 CTA / 커맨드 독 입력 → 챗, 단방향)
  chatPromptRequest: { text: string; nonce: number } | null;
  sendChatPrompt: (text: string) => void;

  // 경로 결과 상세 오버레이 표시 여부 (커맨드 독 상세 버튼과 지도 상세 패널이 공유)
  routeDetailOpen: boolean;
  setRouteDetailOpen: (open: boolean) => void;

  // 우측 워크스페이스(탭 패널): 대화/배차 결과를 하나의 표면에서 전환한다.
  workspaceOpen: boolean;
  workspaceTab: 'chat' | 'result';
  openWorkspace: (tab?: 'chat' | 'result') => void;
  closeWorkspace: () => void;
  setWorkspaceTab: (tab: 'chat' | 'result') => void;
}

const RouteOptimizationContext = createContext<RouteOptimizationState | null>(null);

export function RouteOptimizationProvider({ children }: { children: React.ReactNode }) {
  const [origins, setOrigins] = useState<Coordinate | null>(null);
  const [destinations, setDestinations] = useState<Coordinate[]>([]);
  const [vehicleType, setVehicleType] = useState<'레이' | '스타렉스' | string>('레이');
  const [options, setOptionsState] = useState<OptimizationOptions>({
    optimizeOrder: true,
    useRealtimeTraffic: true,
    departureAt: null,
    useExplicitDestination: false,
    roadOption: 'time-first',
    returnToOrigin: true,
    deliveryTimes: []
  });
  const [request, dispatch] = useReducer(routeRequestReducer, initialRequestState);
  const { routeData, error, lastError } = request;
  const isLoading = request.status === 'loading';
  const setRouteData = useCallback(
    (d: RouteData | null) => dispatch({ type: 'SET_ROUTE_DATA', routeData: d }),
    []
  );
  const [dwellMinutesState, setDwellMinutesState] = useState<number[]>([]);
  const [multiDriverResult, setMultiDriverResult] = useState<any>(null);
  const [inputApplyRequest, setInputApplyRequest] = useState<{ data: any; nonce: number } | null>(null);
  const [chatPromptRequest, setChatPromptRequest] = useState<{ text: string; nonce: number } | null>(null);
  const [routeDetailOpen, setRouteDetailOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<'chat' | 'result'>('chat');
  const openWorkspace = useCallback((tab: 'chat' | 'result' = 'chat') => {
    setWorkspaceTab(tab);
    setWorkspaceOpen(true);
  }, []);
  const closeWorkspace = useCallback(() => setWorkspaceOpen(false), []);
  const abortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<any | null>(null);
  const inputNonceRef = useRef(0);
  const quoteNonceRef = useRef(0);

  const requestInputApply = useCallback((data: any) => {
    inputNonceRef.current += 1;
    setInputApplyRequest({ data, nonce: inputNonceRef.current });
  }, []);

  const sendChatPrompt = useCallback((text: string) => {
    quoteNonceRef.current += 1;
    setChatPromptRequest({ text, nonce: quoteNonceRef.current });
  }, []);

  const setOptions = useCallback((o: Partial<OptimizationOptions>) => {
    setOptionsState(prev => ({ ...prev, ...o }));
  }, []);

  const buildPayload = useCallback((ovr?: RouteOptimizationOverride) => {
    return buildRouteOptimizationPayload(
      {
        origins,
        destinations,
        vehicleType,
        options,
        dwellMinutes: dwellMinutesState,
      },
      ovr
    );
  }, [origins, destinations, vehicleType, options, dwellMinutesState]);

  const optimizeRouteWith = useCallback(async (override?: Partial<{
    origins: Coordinate | null;
    destinations: Coordinate[];
    rawOrigins: string[];
    rawDestinations: string[];
    vehicleType: RouteOptimizationState['vehicleType'];
    options: Partial<OptimizationOptions>;
    dwellMinutes: number[];
  }>) => {
    const payload = buildPayload(override);
    console.log('[useRouteOptimization] optimizeRouteWith 호출됨, payload:', payload);
    console.log('[useRouteOptimization] 배송완료시간 상세:', {
      deliveryTimes: payload.deliveryTimes,
      isNextDayFlags: payload.isNextDayFlags,
      currentTime: new Date().toLocaleString()
    });
    lastPayloadRef.current = payload;

    if (!payload.origins?.length || !payload.destinations?.length) {
      console.log('[useRouteOptimization] 유효하지 않은 payload:', { origins: payload.origins, destinations: payload.destinations });
      dispatch({ type: 'VALIDATION_ERROR', error: '출발지와 목적지를 입력하세요.' });
      return { success: false, error: '출발지와 목적지를 입력하세요.' };
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'START' });

    try {
      console.log('[useRouteOptimization] API 호출 시작:', '/api/route-optimization');
      const res = await fetch('/api/route-optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      console.log('[useRouteOptimization] API 응답 상태:', res.status, res.ok);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('[useRouteOptimization] 서버 오류 응답:', err);
        dispatch({ type: 'ERROR', error: err?.message || err?.error || `HTTP_${res.status}`, lastError: err });
        // UI에서 배너와 인라인 가이드를 띄우기 위해 throw 대신 상태로 전달하고 조용히 종료
        try { (window as any).lastOptimizationError = err; } catch { }
        reportActionFailure({
          source: 'route_optimization',
          action: 'optimize_route',
          error: new Error(err?.message || err?.error || `HTTP_${res.status}`),
          context: {
            httpStatus: res.status,
            roadOption: payload.roadOption,
            useRealtimeTraffic: payload.useRealtimeTraffic,
            departureAt: payload.departureAt,
            destinationCount: payload.destinations.length,
            errorDetails: err?.details ?? null,
          },
        });
        return {
          success: false,
          error: err?.message || err?.error || `HTTP_${res.status}`,
          details: err,
        };
      }

      const data = await res.json();
      console.log('[useRouteOptimization] API 응답 데이터:', data);

      // 최적화 결과를 전역에 저장 (저장 기능용)
      try {
        (window as any).lastOptimizationResult = data?.data || data;
      } catch (e) {
        console.warn('최적화 결과 전역 저장 실패:', e);
      }

      if (data?.success && data?.data) {
        console.log('[useRouteOptimization] routeData 설정:', data.data);
        // 성공 시 routeData 설정 + 에러 상태 초기화를 단일 전이로 처리
        dispatch({ type: 'SUCCESS', routeData: data.data as RouteData });
        try { (window as any).lastOptimizationError = null; } catch { }

        const isInvalidCoord = (lat: number, lng: number) =>
          !Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001);

        const responseWaypoints = Array.isArray(data.data.waypoints) ? data.data.waypoints : [];
        const isRawPreviewRequest = Array.isArray(override?.rawOrigins) && override.rawOrigins.length > 0;

        if (isRawPreviewRequest && responseWaypoints.length > 0) {
          const normalizedFromApi = responseWaypoints
            .map((wp: any) => ({
              lat: Number(wp?.latitude),
              lng: Number(wp?.longitude),
              address: String(wp?.address || '').trim(),
            }))
            .filter((wp: any) => Number.isFinite(wp.lat) && Number.isFinite(wp.lng));

          if (normalizedFromApi.length > 0) {
            console.log('[useRouteOptimization] API waypoint 기준 destinations 동기화:', normalizedFromApi);
            setDestinations(normalizedFromApi);
          }

          const startCoord = pickFirstRouteCoordinate(data.data);
          const originAddress = String(payload?.origins?.[0]?.address || override?.rawOrigins?.[0] || '').trim();
          if (startCoord && originAddress) {
            setOrigins({
              lat: startCoord.lat,
              lng: startCoord.lng,
              address: originAddress,
            });
          }
        } else if (data.data.summary?.optimizationInfo?.optimizedOrder) {
          // 최적화된 순서로 destinations 업데이트
          const optimizedOrder = data.data.summary.optimizationInfo.optimizedOrder;
          const optimizedDestinations = optimizedOrder.map((item: any) => {
            const originalDest = payload.destinations.find((dest: any) => dest.address === item.address);
            if (originalDest) {
              const hasLatLng = 'latitude' in originalDest && 'longitude' in originalDest;
              const rawLat = hasLatLng ? Number((originalDest as any).latitude) : Number.NaN;
              const rawLng = hasLatLng ? Number((originalDest as any).longitude) : Number.NaN;
              if (hasLatLng && !isInvalidCoord(rawLat, rawLng)) {
                return { lat: rawLat, lng: rawLng, address: originalDest.address };
              }
            }
            const matchedWaypoint = responseWaypoints.find((wp: any) => wp?.address === item.address);
            if (matchedWaypoint) {
              return {
                lat: Number(matchedWaypoint.latitude),
                lng: Number(matchedWaypoint.longitude),
                address: matchedWaypoint.address || item.address
              };
            }
            return null;
          }).filter(Boolean);

          console.log('[useRouteOptimization] 최적화된 destinations 업데이트:', optimizedDestinations);
          setDestinations(optimizedDestinations);
        }
      } else {
        throw new Error('INVALID_RESPONSE');
      }
      return { success: true, data: data.data };
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // 취소는 cancel()이 CANCEL 전이를 담당하거나, 더 새 요청의 START가 상태를 가져간다.
        return { success: false, error: '요청이 취소되었습니다.' };
      }
      console.error('[useRouteOptimization] API 호출 오류:', e);
      dispatch({ type: 'ERROR', error: e?.message || '경로 최적화 실패' });
      reportActionFailure({
        source: 'route_optimization',
        action: 'optimize_route_exception',
        error: e,
        context: {
          roadOption: payload.roadOption,
          useRealtimeTraffic: payload.useRealtimeTraffic,
          departureAt: payload.departureAt,
          destinationCount: payload.destinations.length,
        },
      });
      return {
        success: false,
        error: e?.message || '경로 최적화 실패',
        details: e,
      };
    }
  }, [buildPayload]);

  const optimizeRoute = useCallback(async () => {
    return optimizeRouteWith();
  }, [optimizeRouteWith]);

  const retry = useCallback(async () => {
    if (lastPayloadRef.current) {
      return optimizeRoute();
    }
    return { success: false, error: '재시도할 요청이 없습니다.' };
  }, [optimizeRoute]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'CANCEL' });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setOrigins(null);
    setDestinations([]);
    dispatch({ type: 'RESET' });
  }, []);

  const waypoints = useMemo(() => [origins, ...destinations].filter(Boolean) as Coordinate[], [origins, destinations]);

  const setDwellMinutes = (list: number[]) => setDwellMinutesState(list);

  const value: RouteOptimizationState = {
    origins,
    destinations,
    routeData,
    status: request.status,
    isLoading,
    error,
    vehicleType,
    options,
    waypoints,
    dwellMinutes: dwellMinutesState,
    setOrigins,
    setDestinations,
    setVehicleType,
    setOptions,
    setRouteData,
    setDwellMinutes,
    optimizeRoute,
    optimizeRouteWith,
    retry,
    cancel,
    reset,
    lastError,
    multiDriverResult,
    setMultiDriverResult,
    inputApplyRequest,
    requestInputApply,
    chatPromptRequest,
    sendChatPrompt,
    routeDetailOpen,
    setRouteDetailOpen,
    workspaceOpen,
    workspaceTab,
    openWorkspace,
    closeWorkspace,
    setWorkspaceTab,
  };

  return (
    <RouteOptimizationContext.Provider value={value}>{children}</RouteOptimizationContext.Provider>
  );
}

export function useRouteOptimization(): RouteOptimizationState {
  const ctx = useContext(RouteOptimizationContext);
  if (!ctx) throw new Error('useRouteOptimization must be used within RouteOptimizationProvider');
  return ctx;
}

export type UseRouteOptimizationReturn = RouteOptimizationState;


