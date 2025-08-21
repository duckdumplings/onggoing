'use client';

import React, { useMemo } from 'react';
import TmapMap from './TmapMap';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';

export default function TmapMainMap() {
  const { routeData, isLoading, options, origins, destinations } = useRouteOptimization();
  const waypoints = useMemo(() => {
    const points = [];

    // 디버깅 로그 추가
    console.log('[TmapMainMap] origins:', origins);
    console.log('[TmapMainMap] destinations:', destinations);
    console.log('[TmapMainMap] routeData exists:', !!routeData);

    // 경로 계산이 완료되었을 때만 핀 표시 (직관성을 위해)
    if (routeData) {
      // 출발지 추가
      if (origins) {
        console.log('[TmapMainMap] Adding origin pin:', { lat: origins.lat, lng: origins.lng, label: '출발' });
        points.push({ lat: origins.lat, lng: origins.lng, label: '출발' });
      } else {
        console.log('[TmapMainMap] No origins data available');
      }

      // 목적지들 추가 (도착지 별도 설정 고려)
      destinations.forEach((dest, index) => {
        const isLastDestination = index === destinations.length - 1;
        const shouldShowDestination = options?.useExplicitDestination && isLastDestination;

        if (shouldShowDestination) {
          points.push({ lat: dest.lat, lng: dest.lng, label: '도착' });
        } else {
          points.push({ lat: dest.lat, lng: dest.lng, label: String(index + 1) });
        }
      });
    } else {
      console.log('[TmapMainMap] No route data - pins will not be shown');
    }

    console.log('[TmapMainMap] Final waypoints:', points);
    return points;
  }, [origins, destinations, options?.useExplicitDestination, routeData]);

  return (
    <div className="relative w-full h-full">
      <TmapMap
        routeData={routeData as any}
        waypoints={waypoints as any}
        useExplicitDestination={options?.useExplicitDestination}
        className="w-full"
        height="h-full"
      />

      {/* 우측 하단 오버레이 - 경로 정보 */}
      {routeData?.summary && (
        <div className="absolute bottom-4 right-4">
          <div className="bg-white/90 backdrop-blur-md border border-white/50 shadow-xl rounded-2xl p-4 min-w-[280px]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-sm">🗺️</span>
              </div>
              <h3 className="font-semibold text-gray-900 text-base">경로 정보</h3>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50/50 rounded-lg">
                <span className="text-gray-600 text-sm font-medium">총 거리</span>
                <span className="font-bold text-gray-900">
                  {((routeData.summary as any).totalDistance / 1000).toFixed(1)}km
                </span>
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-gray-50/50 rounded-lg">
                <span className="text-gray-600 text-sm font-medium">편도 이동 시간</span>
                <span className="font-bold text-gray-900">
                  {Math.ceil((routeData.summary as any).totalTime / 60)}분
                </span>
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-gray-50/50 rounded-lg">
                <span className="text-gray-600 text-sm font-medium">경유지</span>
                <span className="font-bold text-gray-900">
                  {waypoints?.length ? waypoints.length - 2 : 0}개
                </span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs text-gray-500 text-center">
                {(routeData.summary as any)?.usedTraffic === 'realtime'
                  ? '📡 실시간 교통정보 반영'
                  : '⏰ 타임머신 경로 안내 (설정된 시간의 교통정보)'
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center">
          <div className="glass-panel p-6 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            <div className="text-gray-900 font-medium">최적 경로 계산 중...</div>
            <div className="text-sm text-gray-600 mt-1">잠시만 기다려주세요</div>
          </div>
        </div>
      )}
    </div>
  );
}


