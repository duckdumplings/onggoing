'use client';

import React, { useEffect, useRef, useState } from 'react';

interface TmapMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  routeData?: any; // Tmap REST or GeoJSON 유사 구조 { features: [...] }
  waypoints?: { lat: number; lng: number; label?: string }[];
  useExplicitDestination?: boolean;
  className?: string;
  height?: string;
}

export default function TmapMap({
  center = { lat: 37.566535, lng: 126.9779692 },
  zoom = 14,
  routeData,
  waypoints,
  useExplicitDestination = false,
  className = 'w-full',
  height = 'h-96',
}: TmapMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // 환경변수 디버깅
    console.log('[TmapMap] TMAP API KEY:', process.env.NEXT_PUBLIC_TMAP_API_KEY ? 'EXISTS' : 'MISSING');

    // iframe 기반 임베드로 전환하여 document.write 문제 회피
    if (containerRef.current && !iframeRef.current) {
      const iframe = document.createElement('iframe');
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.style.border = '0';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      try {
        const origin = window.location.origin;
        // 앱 라우트 기반 임베드 페이지로 전환 (문서 파서 컨트롤 강화)
        const url = new URL('/tmap-embed', origin);
        iframe.src = url.toString();
        // 디버그 로그
        console.log('[TmapMap] iframe src =', iframe.src);
      } catch (err) {
        console.error('[TmapMap] URL 생성 실패:', err);
        iframe.src = `/tmap-embed.html?appKey=${encodeURIComponent(process.env.NEXT_PUBLIC_TMAP_API_KEY || '')}`;
      }
      iframe.onload = () => {
        setReady(true);
        // 초기 중심 전달
        iframe.contentWindow?.postMessage({ type: 'init', center }, '*');
      };
      containerRef.current.appendChild(iframe);
      iframeRef.current = iframe;
    }

    return () => {
      mounted = false;
      // iframe 정리
      if (iframeRef.current && iframeRef.current.parentNode) {
        iframeRef.current.parentNode.removeChild(iframeRef.current);
        iframeRef.current = null;
      }
    };
  }, [center.lat, center.lng, zoom]);

  // 경로 그리기
  useEffect(() => {
    if (!ready || !iframeRef.current || !routeData) return;

    // 출발지와 도착지 정보를 포함한 waypoints 데이터 생성
    const enhancedWaypoints = waypoints?.map((waypoint, index) => {
      if (index === 0) {
        return { ...waypoint, label: '출발' };
      } else if (index === waypoints.length - 1 && useExplicitDestination) {
        return { ...waypoint, label: '도착' };
      } else {
        return { ...waypoint, label: String(index) };
      }
    });

    // 임베드된 iframe에 postMessage로 경로 그리기 전달
    const message = { type: 'route', routeData, center, waypoints: enhancedWaypoints };
    iframeRef.current.contentWindow?.postMessage(message, '*');
  }, [ready, routeData, waypoints?.length, useExplicitDestination]);

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

  return (
    <div className={`${className} ${height} relative`}>
      <div ref={containerRef} className="w-full h-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-gray-700">
          Tmap 로딩 중...
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    Tmapv2: any;
  }
}


