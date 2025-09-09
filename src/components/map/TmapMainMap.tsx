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
      // 출발지 추가 (더 명확한 아이콘과 색상)
      if (origins) {
        console.log('[TmapMainMap] Adding origin pin:', { lat: origins.lat, lng: origins.lng, label: '출발' });
        points.push({
          lat: origins.lat,
          lng: origins.lng,
          label: '출발',
          icon: '🚀', // 출발 아이콘
          color: '#10B981', // 초록색
          priority: 1
        });
      } else {
        console.log('[TmapMainMap] No origins data available');
      }

      // 목적지들 추가 (순서와 중요도에 따른 시각적 구분)
      destinations.forEach((dest, index) => {
        const isLastDestination = index === destinations.length - 1;
        const isFirstDestination = index === 0;

        let label, icon, color, priority;

        if (isLastDestination) {
          // 최종 도착지
          label = '도착';
          icon = '🎯';
          color = '#EF4444'; // 빨간색
          priority = 3;
        } else {
          // 경유지들 (최적화된 순서 번호 표시)
          label = String(index + 1);
          icon = '📍';
          color = '#3B82F6'; // 파란색
          priority = 2;
        }

        points.push({
          lat: dest.lat,
          lng: dest.lng,
          label,
          icon,
          color,
          priority
        });
      });
    } else {
      console.log('[TmapMainMap] No route data - pins will not be shown');
    }

    console.log('[TmapMainMap] Final waypoints:', points);
    return points;
  }, [origins, destinations, options?.useExplicitDestination, routeData]);

  // 경로 최적화 효과 계산
  const optimizationEffect = useMemo(() => {
    if (!routeData?.summary) return null;

    const summary = routeData.summary as any;
    if (!summary.optimizationInfo) return null;

    const { distanceSaved, originalOrder, optimizedOrder } = summary.optimizationInfo;
    const savingsPercent = originalOrder && optimizedOrder
      ? ((distanceSaved / (summary.totalDistance + distanceSaved)) * 100).toFixed(1)
      : null;

    return {
      distanceSaved,
      savingsPercent,
      hasOptimization: summary.optimizeOrder
    };
  }, [routeData]);

  return (
    <div className="relative w-full map-container" style={{ height: '100vh', margin: 0, padding: 0 }}>
      <TmapMap
        routeData={routeData as any}
        waypoints={waypoints as any}
        useExplicitDestination={options?.useExplicitDestination}
        className="w-full"
        height="h-screen"
      />

      {/* 우측 하단 오버레이 - 경로 정보 (개선된 디자인) */}
      {routeData?.summary && (
        <div className="absolute bottom-6 right-6">
          <div className="bg-white/95 backdrop-blur-md border border-white/60 shadow-2xl rounded-2xl p-5 min-w-[300px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white text-lg">🗺️</span>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">경로 정보</h3>
                <p className="text-xs text-gray-500">실시간 최적화 결과</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* 주요 정보 카드 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 border border-blue-200">
                  <div className="text-xs text-blue-600 font-medium mb-1">총 거리</div>
                  <div className="text-lg font-bold text-blue-900">
                    {((routeData.summary as any).totalDistance / 1000).toFixed(1)}km
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 border border-green-200">
                  <div className="text-xs text-green-600 font-medium mb-1">이동 시간</div>
                  <div className="text-lg font-bold text-green-900">
                    {Math.ceil((routeData.summary as any).totalTime / 60)}분
                  </div>
                </div>
              </div>

              {/* 경유지 정보 */}
              <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm font-medium">경유지</span>
                  <span className="font-bold text-gray-900">
                    {waypoints?.length ? waypoints.length - 2 : 0}개
                  </span>
                </div>
              </div>

              {/* 최적화 효과 표시 (개선된 디자인) */}
              {optimizationEffect?.hasOptimization && (
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-3 border border-purple-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-purple-600 text-sm">🔄</span>
                    <span className="text-purple-700 font-semibold text-sm">최적화 효과</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-purple-600 text-xs">절약 거리</span>
                    <span className="text-purple-900 font-bold">
                      +{(optimizationEffect.distanceSaved / 1000).toFixed(1)}km
                    </span>
                  </div>
                  {optimizationEffect.savingsPercent && (
                    <div className="text-xs text-purple-600 mt-1">
                      {optimizationEffect.savingsPercent}% 효율성 향상
                    </div>
                  )}
                </div>
              )}

              {/* 상태 정보 */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center py-2 px-3 bg-blue-50/70 rounded-lg">
                  <span className="text-blue-600 font-medium text-sm">최적화</span>
                  <span className="text-blue-800 font-semibold text-sm">
                    {(routeData.summary as any)?.optimizeOrder ? '🔄 자동 순서' : '📍 수동 순서'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 px-3 bg-green-50/70 rounded-lg">
                  <span className="text-green-600 font-medium text-sm">차량</span>
                  <span className="text-green-800 font-semibold text-sm">
                    {(routeData.summary as any)?.vehicleTypeCode === '2' ? '🚐 스타렉스' : '🚗 레이'}
                  </span>
                </div>
              </div>
            </div>

            {/* 교통정보 상태 */}
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-xs text-gray-600 text-center bg-gray-50/50 rounded-lg py-2">
                {(routeData.summary as any)?.usedTraffic === 'realtime'
                  ? '📡 실시간 교통정보 반영'
                  : '⏰ 타임머신 경로 안내 (설정된 시간의 교통정보)'
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 로딩 오버레이 (개선된 디자인) */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
          <div className="glass-panel p-8 text-center rounded-2xl">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <div className="text-gray-900 font-bold text-lg mb-2">최적 경로 계산 중...</div>
            <div className="text-sm text-gray-600">Tmap API를 통해 실시간 교통정보를 반영하여 계산하고 있습니다</div>
          </div>
        </div>
      )}
    </div>
  );
}


