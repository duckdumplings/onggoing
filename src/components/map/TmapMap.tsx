'use client';

import React, { useEffect, useRef, useState } from 'react';

interface TmapMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  routeData?: any; // Tmap REST or GeoJSON 유사 구조 { features: [...] }
  className?: string;
  height?: string;
}

export default function TmapMap({
  center = { lat: 37.566535, lng: 126.9779692 },
  zoom = 14,
  routeData,
  className = 'w-full',
  height = 'h-96',
}: TmapMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const ensureTmap = () => {
      if (typeof window === 'undefined') return;
      if ((window as any).Tmapv2 && (window as any).Tmapv2.Map) {
        return true;
      }
      return false;
    };

    const init = () => {
      if (!mounted || !containerRef.current || !ensureTmap()) return;
      try {
        setError(null);
        mapRef.current = new (window as any).Tmapv2.Map(containerRef.current, {
          center: new (window as any).Tmapv2.LatLng(center.lat, center.lng),
          width: '100%',
          height: '100%',
          zoom,
          zoomControl: true,
          scrollwheel: true,
        });
        setReady(true);
      } catch (e: any) {
        setError(e?.message || '지도 초기화 실패');
      }
    };

    // 폴링로딩 (SDK 준비될 때까지 대기)
    const start = Date.now();
    const timer = setInterval(() => {
      if (ensureTmap()) {
        clearInterval(timer);
        init();
      } else if (Date.now() - start > 15000) {
        clearInterval(timer);
        setError('Tmap 스크립트 로드 타임아웃');
      }
    }, 300);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [center.lat, center.lng, zoom]);

  // 경로 그리기
  useEffect(() => {
    if (!ready || !mapRef.current || !routeData) return;
    try {
      const features = routeData.features || [];
      const Tmapv2 = (window as any).Tmapv2;

      const polylines: any[] = [];
      const markers: any[] = [];

      features.forEach((feature: any, idx: number) => {
        const coords = feature?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length === 0) return;

        // 일부 응답은 배열 중첩일 수 있음(MultiLineString). 1차원 배열로 통일
        const flat: number[][] = Array.isArray(coords[0][0]) ? coords.flat(1) : coords;

        const path = flat.map((c: number[]) => new Tmapv2.LatLng(c[1], c[0]));
        const polyline = new Tmapv2.Polyline({
          path,
          strokeColor: '#FF1744',
          strokeWeight: 5,
          map: mapRef.current,
        });
        polylines.push(polyline);

        if (path.length > 0) {
          const startMarker = new Tmapv2.Marker({ position: path[0], map: mapRef.current });
          const endMarker = new Tmapv2.Marker({ position: path[path.length - 1], map: mapRef.current });
          markers.push(startMarker, endMarker);
        }
      });

      // 첫 좌표로 중심 이동
      const first = features?.[0]?.geometry?.coordinates?.[0];
      if (first) {
        const firstCoord = Array.isArray(first[0]) ? first[0] : first; // nested or not
        mapRef.current.setCenter(new Tmapv2.LatLng(firstCoord[1], firstCoord[0]));
      }

      return () => {
        polylines.forEach((p) => p.setMap(null));
        markers.forEach((m) => m.setMap(null));
      };
    } catch (e) {
      // ignore
    }
  }, [ready, routeData]);

  if (error) {
    return (
      <div className={`${className} ${height} bg-gray-100 flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-red-600 font-semibold">지도 오류</div>
          <div className="text-gray-600 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={`${className} ${height} bg-gray-100 flex items-center justify-center`}>
        <div className="text-gray-700">Tmap 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className={`${className} ${height}`}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}


