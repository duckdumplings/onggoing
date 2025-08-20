'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export interface Coordinate { lat: number; lng: number }

export interface RouteSummary {
  totalDistance: number; // meters
  totalTime: number; // seconds
  vehicleTypeCode?: string;
  optimizeOrder?: boolean;
  usedTraffic?: 'realtime' | 'standard';
}

export interface RouteData {
  type?: string;
  features?: any[];
  summary?: RouteSummary;
  waypoints?: Array<{ latitude: number; longitude: number }>
}

export interface OptimizationOptions {
  optimizeOrder: boolean;
  useRealtimeTraffic: boolean;
  departureAt?: string | null;
  useExplicitDestination?: boolean; // 도착지 별도 입력 사용
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
  }>) => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

const RouteOptimizationContext = createContext<RouteOptimizationState | null>(null);

export function RouteOptimizationProvider({ children }: { children: React.ReactNode }) {
  const [origins, setOrigins] = useState<Coordinate | null>(null);
  const [destinations, setDestinations] = useState<Coordinate[]>([]);
  const [vehicleType, setVehicleType] = useState<'레이' | '스타렉스' | string>('레이');
  const [options, setOptionsState] = useState<OptimizationOptions>({ optimizeOrder: false, useRealtimeTraffic: true, departureAt: null, useExplicitDestination: false });
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dwellMinutesState, setDwellMinutesState] = useState<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<any | null>(null);

  const setOptions = useCallback((o: Partial<OptimizationOptions>) => {
    setOptionsState(prev => ({ ...prev, ...o }));
  }, []);

  const buildPayload = useCallback((ovr?: Partial<{ origins: Coordinate | null; destinations: Coordinate[]; vehicleType: RouteOptimizationState['vehicleType']; options: Partial<OptimizationOptions> }>) => {
    const o = ovr?.origins ?? origins;
    const d = ovr?.destinations ?? destinations;
    const v = ovr?.vehicleType ?? vehicleType;
    const opt = { ...options, ...(ovr?.options || {}) };
    const originPayload = o ? [{ latitude: o.lat, longitude: o.lng, address: 'origin' }] : [];
    const destPayload = d.map(dt => ({ latitude: dt.lat, longitude: dt.lng, address: 'dest' }));
    return {
      origins: originPayload,
      destinations: destPayload,
      vehicleType: v,
      optimizeOrder: opt.optimizeOrder,
      useRealtimeTraffic: opt.useRealtimeTraffic,
      departureAt: opt.departureAt,
    };
  }, [origins, destinations, vehicleType, options]);

  const optimizeRouteWith = useCallback(async (override?: Partial<{ origins: Coordinate | null; destinations: Coordinate[]; vehicleType: RouteOptimizationState['vehicleType']; options: Partial<OptimizationOptions> }>) => {
    const payload = buildPayload(override);
    lastPayloadRef.current = payload;
    if (!payload.origins?.length || !payload.destinations?.length) {
      setError('출발지와 목적지를 입력하세요.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/route-optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP_${res.status}`);
      }
      const data = await res.json();
      if (data?.success && data?.data) {
        setRouteData(data.data as RouteData);
      } else {
        throw new Error('INVALID_RESPONSE');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // 취소
      setError(e?.message || '경로 최적화 실패');
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


