'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export interface Coordinate { lat: number; lng: number; address?: string }

export interface RouteSummary {
  totalDistance: number; // meters
  totalTime: number; // seconds
  vehicleTypeCode?: string;
  optimizeOrder?: boolean;
  usedTraffic?: 'realtime' | 'standard';
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

export interface RouteOptimizationState {
  origins: Coordinate | null;
  destinations: Coordinate[];
  routeData: RouteData | null;
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
  optimizeRoute: () => Promise<void>;
  optimizeRouteWith: (override?: Partial<{
    origins: Coordinate | null;
    destinations: Coordinate[];
    vehicleType: RouteOptimizationState['vehicleType'];
    options: Partial<OptimizationOptions>;
    dwellMinutes: number[];
  }>) => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
  lastError: any | null;
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
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<any | null>(null);
  const [dwellMinutesState, setDwellMinutesState] = useState<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<any | null>(null);

  const setOptions = useCallback((o: Partial<OptimizationOptions>) => {
    setOptionsState(prev => ({ ...prev, ...o }));
  }, []);

  const buildPayload = useCallback((ovr?: Partial<{ origins: Coordinate | null; destinations: Coordinate[]; vehicleType: RouteOptimizationState['vehicleType']; options: Partial<OptimizationOptions>; dwellMinutes: number[] }>) => {
    const o = ovr?.origins ?? origins;
    const d = ovr?.destinations ?? destinations;
    const v = ovr?.vehicleType ?? vehicleType;
    const opt = { ...options, ...(ovr?.options || {}) };
    const dm = ovr?.dwellMinutes ?? dwellMinutesState;
    const originPayload = o ? [{ latitude: o.lat, longitude: o.lng, address: o.address || 'origin' }] : [];
    const destPayload = d.map(dt => ({ latitude: dt.lat, longitude: dt.lng, address: dt.address || 'dest' }));
    return {
      origins: originPayload,
      destinations: destPayload,
      vehicleType: v,
      optimizeOrder: opt.optimizeOrder,
      useRealtimeTraffic: opt.useRealtimeTraffic,
      departureAt: opt.departureAt,
      roadOption: opt.roadOption || 'time-first',
      returnToOrigin: opt.returnToOrigin ?? true,
      dwellMinutes: dm,
      deliveryTimes: opt.deliveryTimes || [],
      isNextDayFlags: opt.isNextDayFlags || [],
    };
  }, [origins, destinations, vehicleType, options, dwellMinutesState]);

  const optimizeRouteWith = useCallback(async (override?: Partial<{ origins: Coordinate | null; destinations: Coordinate[]; vehicleType: RouteOptimizationState['vehicleType']; options: Partial<OptimizationOptions>; dwellMinutes: number[] }>) => {
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
      setError('출발지와 목적지를 입력하세요.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);

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
        setLastError(err);
        setError(err?.message || err?.error || `HTTP_${res.status}`);
        // UI에서 배너와 인라인 가이드를 띄우기 위해 throw 대신 상태로 전달하고 조용히 종료
        try { (window as any).lastOptimizationError = err; } catch { }
        return;
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
        setRouteData(data.data as RouteData);
        // 성공 시 에러 상태 초기화
        setLastError(null);
        setError(null);
        try { (window as any).lastOptimizationError = null; } catch { }

        const isInvalidCoord = (lat: number, lng: number) =>
          !Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001);

        // 최적화된 순서로 destinations 업데이트
        if (data.data.summary?.optimizationInfo?.optimizedOrder) {
          const optimizedOrder = data.data.summary.optimizationInfo.optimizedOrder;
          const responseWaypoints = Array.isArray(data.data.waypoints) ? data.data.waypoints : [];
          const optimizedDestinations = optimizedOrder.map((item: any) => {
            // 원본 destinations에서 해당 주소를 찾아서 좌표 정보 복원
            const originalDest = payload.destinations.find((dest: any) =>
              dest.address === item.address
            );
            if (originalDest) {
              const rawLat = Number(originalDest.latitude);
              const rawLng = Number(originalDest.longitude);
              if (!isInvalidCoord(rawLat, rawLng)) {
                return {
                  lat: rawLat,
                  lng: rawLng,
                  address: originalDest.address
                };
              }
            }

            // AI 챗 프리뷰처럼 payload 좌표가 0,0인 경우 API 응답 waypoint 좌표를 우선 사용
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
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // 취소
      console.error('[useRouteOptimization] API 호출 오류:', e);
      if (!lastError) setError(e?.message || '경로 최적화 실패');
      try { if (lastError) (window as any).lastOptimizationError = lastError; } catch { }
    } finally {
      setIsLoading(false);
    }
  }, [buildPayload]);

  const optimizeRoute = useCallback(async () => {
    await optimizeRouteWith();
  }, [optimizeRouteWith]);

  const retry = useCallback(async () => {
    if (lastPayloadRef.current) {
      await optimizeRoute();
    }
  }, [optimizeRoute]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setOrigins(null);
    setDestinations([]);
    setRouteData(null);
    setError(null);
  }, []);

  const waypoints = useMemo(() => [origins, ...destinations].filter(Boolean) as Coordinate[], [origins, destinations]);

  const setDwellMinutes = (list: number[]) => setDwellMinutesState(list);

  const value: RouteOptimizationState = {
    origins,
    destinations,
    routeData,
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


