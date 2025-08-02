'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTmap } from '@/components/TmapProvider';

interface TmapMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  routeData?: any;
  className?: string;
  height?: string;
}

function TmapMapComponent({
  center = { lat: 37.566826, lng: 126.9786567 },
  zoom = 15,
  routeData,
  className = "w-full",
  height = "h-96"
}: TmapMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const { isLoaded, error: tmapError } = useTmap();
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 지도 초기화 (한 번만 실행)
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) {
      return;
    }

    console.log('🗺️ Tmapv2 지도 초기화 시작');

    const initializeMap = async () => {
      try {
        setError(null);
        const startTime = Date.now();

        console.log(`📍 지도 설정: center(${center.lat}, ${center.lng}), zoom(${zoom})`);

        // Tmapv2 지도 초기화 (공식 방식)
        mapInstance.current = new window.Tmapv2.Map(mapRef.current, {
          center: new window.Tmapv2.LatLng(center.lat, center.lng),
          width: "100%",
          height: "100%",
          zoom: zoom,
          zoomControl: true,
          scrollwheel: true
        });

        const initTime = Date.now() - startTime;
        console.log(`✅ Tmapv2 지도 초기화 완료 (${initTime}ms)`);
        setIsMapInitialized(true);

        // 경로 데이터가 있으면 그리기
        if (routeData && routeData.features && routeData.features.length > 0) {
          console.log(`경로 데이터 그리기 시작: ${routeData.features.length}개 경로`);

          routeData.features.forEach((feature: any, index: number) => {
            if (feature.geometry && feature.geometry.coordinates) {
              // 좌표 배열을 Tmapv2.LatLng 객체로 변환
              const path = feature.geometry.coordinates.map((coord: number[]) =>
                new window.Tmapv2.LatLng(coord[1], coord[0])
              );

              // 경로 색상 (여러 경로가 있을 경우 다른 색상 사용)
              const colors = ['#DD0000', '#00DD00', '#0000DD', '#DDAA00', '#AA00DD'];
              const color = colors[index % colors.length];

              // Tmapv2.Polyline으로 경로 그리기
              const polyline = new window.Tmapv2.Polyline({
                path: path,
                strokeColor: color,
                strokeWeight: 6,
                map: mapInstance.current
              });

              // 시작점과 끝점에 마커 추가
              if (path.length > 0) {
                // 시작점 마커
                const startMarker = new window.Tmapv2.Marker({
                  position: path[0],
                  icon: "http://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_s.png",
                  iconSize: new window.Tmapv2.Size(24, 38),
                  map: mapInstance.current
                });

                // 끝점 마커
                const endMarker = new window.Tmapv2.Marker({
                  position: path[path.length - 1],
                  icon: "http://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_e.png",
                  iconSize: new window.Tmapv2.Size(24, 38),
                  map: mapInstance.current
                });
              }
            }
          });
        } else {
          console.log('경로 데이터 없음');
        }
      } catch (error) {
        console.error('Tmapv2 지도 초기화 실패:', error);
        setError(error instanceof Error ? error.message : '지도 로드 실패');
      }
    };

    initializeMap();
  }, [isLoaded]); // center, zoom, routeData, isMapInitialized 제거

  // 경로 데이터 업데이트 (별도 useEffect)
  useEffect(() => {
    if (!mapInstance.current || !routeData || !isMapInitialized) {
      return;
    }

    console.log('🔄 경로 데이터 업데이트 시작');

    try {
      // 기존 경로 및 마커 제거 (실제 구현에서는 기존 요소들을 추적하여 제거)

      // 새로운 경로 데이터 그리기
      if (routeData.features && routeData.features.length > 0) {
        console.log(`📍 경로 데이터 그리기: ${routeData.features.length}개 경로`);

        routeData.features.forEach((feature: any, index: number) => {
          if (feature.geometry && feature.geometry.coordinates) {
            // 좌표 배열을 Tmapv2.LatLng 객체로 변환
            const path = feature.geometry.coordinates.map((coord: number[]) =>
              new window.Tmapv2.LatLng(coord[1], coord[0])
            );

            // 경로 색상 (여러 경로가 있을 경우 다른 색상 사용)
            const colors = ['#DD0000', '#00DD00', '#0000DD', '#DDAA00', '#AA00DD'];
            const color = colors[index % colors.length];

            // Tmapv2.Polyline으로 경로 그리기
            const polyline = new window.Tmapv2.Polyline({
              path: path,
              strokeColor: color,
              strokeWeight: 6,
              map: mapInstance.current
            });

            // 시작점과 끝점에 마커 추가
            if (path.length > 0) {
              // 시작점 마커
              const startMarker = new window.Tmapv2.Marker({
                position: path[0],
                icon: "http://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_s.png",
                iconSize: new window.Tmapv2.Size(24, 38),
                map: mapInstance.current
              });

              // 끝점 마커
              const endMarker = new window.Tmapv2.Marker({
                position: path[path.length - 1],
                icon: "http://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_e.png",
                iconSize: new window.Tmapv2.Size(24, 38),
                map: mapInstance.current
              });
            }
          }
        });
      } else {
        console.log('경로 데이터 없음');
      }
    } catch (error) {
      console.error('경로 데이터 업데이트 실패:', error);
    }
  }, [routeData, isMapInitialized]);

  // Tmap 스크립트 로드 에러
  if (tmapError) {
    return (
      <div className={`${className} ${height} bg-gray-100 flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">Tmap 스크립트 로드 실패</div>
          <div className="text-gray-600 text-sm">{tmapError}</div>
        </div>
      </div>
    );
  }

  // 지도 초기화 에러
  if (error) {
    return (
      <div className={`${className} ${height} bg-gray-100 flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">지도 로드 실패</div>
          <div className="text-gray-600 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  // 로딩 중
  if (!isLoaded) {
    return (
      <div className={`${className} ${height} bg-gray-100 flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-blue-500 text-lg font-semibold mb-2">🗺️ Tmap 로딩 중...</div>
          <div className="text-gray-600 text-sm">PostScribe를 통해 지도 API를 불러오는 중입니다</div>
          <div className="mt-2">
            <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} ${height} relative`}>
      <div
        ref={mapRef}
        className="w-full h-full"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}

// Dynamic Import로 감싸기
import dynamic from 'next/dynamic';

const TmapMap = dynamic(() => Promise.resolve(TmapMapComponent), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="text-blue-500 text-lg font-semibold mb-2">🗺️ 지도 컴포넌트 로딩 중...</div>
        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
      </div>
    </div>
  )
});

export default TmapMap; 