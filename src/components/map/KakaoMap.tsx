'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Map, MapMarker, Polyline, useKakaoLoader } from 'react-kakao-maps-sdk';

interface KakaoMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  routeData?: any;
  className?: string;
  height?: string;
}

export default function KakaoMap({
  center = { lat: 37.566826, lng: 126.9786567 },
  zoom = 15,
  routeData,
  className = "w-full",
  height = "h-96"
}: KakaoMapProps) {
  // 공식 로더 사용: 환경변수에서 키 주입
  const [loading, loaderError] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY || '',
    libraries: ['services', 'clusterer']
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computedCenter = useMemo(() => {
    try {
      if (routeData && routeData.features && routeData.features.length > 0) {
        const first = routeData.features[0];
        const coords = first?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length > 0) {
          return { lat: coords[0][1], lng: coords[0][0] };
        }
      }
    } catch { }
    return center;
  }, [routeData, center]);

  useEffect(() => {
    if (loaderError) {
      setError(`카카오맵 스크립트 로드 실패: ${String(loaderError)}`);
      return;
    }
    if (loading) return; // 아직 로딩 중
    if (typeof window !== 'undefined' && (window as any).kakao && (window as any).kakao.maps) {
      setIsLoaded(true);
      setError(null);
    } else {
      setError('카카오맵 스크립트가 로드되지 않았습니다');
    }
  }, [loading]);

  const debugInfo = useMemo(() => {
    const appkey = (process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY || '').slice(0, 6) + '...';
    return {
      href: typeof window !== 'undefined' ? window.location.href : '',
      appkey,
    };
  }, []);

  // 로딩 중
  if (!isLoaded && !error) {
    return (
      <div className={`${className} ${height} bg-gray-100 flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-blue-500 text-lg font-semibold mb-2">🗺️ 카카오맵 로딩 중...</div>
          <div className="text-gray-600 text-sm">지도 API를 불러오는 중입니다</div>
          <div className="mt-2">
            <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
          <div className="mt-3 text-xs text-gray-500">{debugInfo.href} / key {debugInfo.appkey}</div>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className={`${className} ${height} bg-gray-100 flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">지도 로드 실패</div>
          <div className="text-gray-600 text-sm">{error}</div>
          <div className="mt-2 text-xs text-gray-500">{debugInfo.href} / key {debugInfo.appkey}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} ${height} relative`}>
      <Map
        center={computedCenter}
        level={zoom}
        style={{ width: "100%", height: "100%" }}
      >
        {/* 경로 데이터가 있으면 표시 */}
        {routeData && routeData.features && routeData.features.length > 0 && (
          <>
            {/* 경로 라인 */}
            {routeData.features.map((feature: any, index: number) => {
              if (feature.geometry && feature.geometry.coordinates) {
                const path = feature.geometry.coordinates.map((coord: number[]) => ({
                  lat: coord[1],
                  lng: coord[0]
                }));

                return (
                  <Polyline
                    key={`route-${index}`}
                    path={path}
                    strokeColor="#FF0000"
                    strokeWeight={3}
                    strokeOpacity={0.8}
                  />
                );
              }
              return null;
            })}

            {/* 시작점과 끝점 마커 */}
            {routeData.features.map((feature: any, index: number) => {
              if (feature.geometry && feature.geometry.coordinates) {
                const coordinates = feature.geometry.coordinates;
                const startCoord = coordinates[0];
                const endCoord = coordinates[coordinates.length - 1];

                return (
                  <React.Fragment key={`markers-${index}`}>
                    <MapMarker
                      position={{ lat: startCoord[1], lng: startCoord[0] }}
                      image={{
                        src: "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png",
                        size: { width: 22, height: 22 }
                      }}
                    />
                    <MapMarker
                      position={{ lat: endCoord[1], lng: endCoord[0] }}
                      image={{
                        src: "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_black.png",
                        size: { width: 22, height: 22 }
                      }}
                    />
                  </React.Fragment>
                );
              }
              return null;
            })}
          </>
        )}
      </Map>
    </div>
  );
}

// 타입 선언
declare global {
  interface Window {
    kakao: any;
  }
} 