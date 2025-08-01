'use client';

import React, { useEffect, useRef, useState } from 'react';

interface TmapMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  routeData?: any;
  className?: string;
  height?: string;
}

declare global {
  interface Window {
    Tmap: any;
    TmapCallback: () => void;
  }
}

export default function TmapMap({
  center = { lat: 37.5665, lng: 126.9780 },
  zoom = 10,
  routeData,
  className = "w-full",
  height = "h-96"
}: TmapMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isContainerReady, setIsContainerReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const addDebugInfo = (info: string) => {
    setDebugInfo(prev => prev + `\n${new Date().toLocaleTimeString()}: ${info}`);
  };

  // 컨테이너 준비 상태 확인
  useEffect(() => {
    const checkContainer = () => {
      if (mapRef.current) {
        console.log('지도 컨테이너 준비됨');
        setIsContainerReady(true);
      } else {
        console.log('지도 컨테이너 아직 준비되지 않음');
        // 100ms 후 다시 확인
        setTimeout(checkContainer, 100);
      }
    };

    checkContainer();
  }, []);

  // Tmap 스크립트 로드 (콜백 방식)
  useEffect(() => {
    const loadTmapScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.Tmap) {
          console.log('Tmap 스크립트 이미 로드됨');
          setIsScriptLoaded(true);
          resolve();
          return;
        }

        const apiKey = process.env.NEXT_PUBLIC_TMAP_API_KEY;

        if (!apiKey) {
          reject(new Error('Tmap API 키가 설정되지 않았습니다.'));
          return;
        }

        console.log(`API 키 확인됨: ${apiKey.substring(0, 10)}...`);

        // 콜백 함수 설정
        window.TmapCallback = function () {
          console.log('Tmap 콜백 호출됨 - 초기화 완료');
          setIsScriptLoaded(true);
          resolve();
        };

        const script = document.createElement('script');
        script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}&callback=TmapCallback`;
        script.onload = () => {
          console.log('Tmap 스크립트 로드 완료');
        };
        script.onerror = () => reject(new Error('Tmap 스크립트 로드 실패'));
        document.head.appendChild(script);
      });
    };

    loadTmapScript().catch((error) => {
      console.error('Tmap 스크립트 로드 실패:', error);
      setError(error instanceof Error ? error.message : 'Tmap 스크립트 로드 실패');
      setIsLoading(false);
    });
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (!isScriptLoaded) {
      console.log('스크립트가 아직 로드되지 않음');
      return;
    }

    if (!isContainerReady) {
      console.log('지도 컨테이너가 아직 준비되지 않음');
      return;
    }

    console.log('지도 초기화 시작');

    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // 기존 지도 인스턴스 정리
        if (mapInstance.current) {
          mapInstance.current = null;
        }

        console.log(`Tmap 지도 초기화 중... center: ${center.lat}, ${center.lng}, zoom: ${zoom}`);

        // Tmap 지도 초기화
        mapInstance.current = new window.Tmap.Map(mapRef.current, {
          center: new window.Tmap.LatLng(center.lat, center.lng),
          zoom: zoom,
          width: "100%",
          height: "100%"
        });

        console.log('Tmap 지도 초기화 완료');

        // 경로 데이터가 있으면 그리기
        if (routeData && routeData.features && routeData.features.length > 0) {
          console.log(`경로 데이터 그리기 시작: ${routeData.features.length}개 경로`);

          routeData.features.forEach((feature: any, index: number) => {
            if (feature.geometry && feature.geometry.coordinates) {
              const path = feature.geometry.coordinates.map((coord: number[]) =>
                new window.Tmap.LatLng(coord[1], coord[0])
              );

              // 경로 색상 (여러 경로가 있을 경우 다른 색상 사용)
              const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFA500', '#800080'];
              const color = colors[index % colors.length];

              const polyline = new window.Tmap.Polyline({
                path: path,
                strokeColor: color,
                strokeWeight: 4,
                strokeOpacity: 0.8
              });

              polyline.setMap(mapInstance.current);

              // 시작점과 끝점에 마커 추가
              if (path.length > 0) {
                // 시작점 마커
                const startMarker = new window.Tmap.Marker({
                  position: path[0],
                  map: mapInstance.current,
                  icon: new window.Tmap.Icon({
                    url: 'https://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_s.png',
                    size: new window.Tmap.Size(24, 24),
                    anchor: new window.Tmap.Point(12, 12)
                  })
                });

                // 끝점 마커
                const endMarker = new window.Tmap.Marker({
                  position: path[path.length - 1],
                  map: mapInstance.current,
                  icon: new window.Tmap.Icon({
                    url: 'https://tmapapi.sktelecom.com/upload/tmap/marker/pin_r_m_e.png',
                    size: new window.Tmap.Size(24, 24),
                    anchor: new window.Tmap.Point(12, 12)
                  })
                });
              }
            }
          });
        } else {
          console.log('경로 데이터 없음');
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Tmap 지도 초기화 실패:', error);
        setError(error instanceof Error ? error.message : '지도 로드 실패');
        setIsLoading(false);
      }
    };

    // 약간의 지연을 두고 초기화 (DOM이 완전히 준비되도록)
    const timer = setTimeout(initializeMap, 200);

    return () => {
      clearTimeout(timer);
      if (mapInstance.current) {
        mapInstance.current = null;
      }
    };
  }, [isScriptLoaded, isContainerReady, center, zoom, routeData]);

  if (error) {
    return (
      <div className={`${className} bg-red-50 border border-red-200 rounded-lg flex items-center justify-center`} style={{ height }}>
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️</div>
          <p className="text-gray-600 text-sm">{error}</p>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm text-gray-500">디버그 정보</summary>
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs whitespace-pre-wrap">
              {debugInfo}
            </div>
          </details>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`${className} bg-gray-100 rounded-lg flex items-center justify-center`} style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-600 text-sm">
            {isScriptLoaded ? '지도를 불러오는 중...' : '스크립트를 불러오는 중...'}
          </p>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm text-gray-500">디버그 정보</summary>
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs whitespace-pre-wrap">
              {debugInfo}
            </div>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} rounded-lg overflow-hidden border border-gray-200`} style={{ height }}>
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
} 