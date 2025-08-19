'use client';

import React from 'react';
import TmapMap from './TmapMap';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

export default function TmapMainMap() {
  const { routeData, waypoints, isLoading, setOrigins, setDestinations, reset } = useRouteOptimization();

  return (
    <div className="relative w-full h-full">
      <TmapMap routeData={routeData as any} waypoints={waypoints as any} className="w-full" height="h-full" />

      {/* 우측 상단 컨트롤(임시) */}
      <div className="absolute top-4 right-4 space-y-2">
        <button
          className="glass-panel px-3 py-2 text-sm"
          onClick={() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition((pos) => {
              const { latitude, longitude } = pos.coords as GeolocationCoordinates;
              setOrigins({ lat: latitude, lng: longitude });
            });
          }}
        >
          📍 현재 위치
        </button>
        <button
          className="glass-panel px-3 py-2 text-sm"
          onClick={() => {
            reset();
          }}
        >
          🔄 초기화
        </button>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
          <div className="glass-panel p-4">최적 경로 계산 중…</div>
        </div>
      )}
    </div>
  );
}


