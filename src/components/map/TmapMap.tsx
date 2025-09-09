'use client';

import React, { useEffect, useRef, useState } from 'react';

interface TmapMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  routeData?: any; // Tmap REST or GeoJSON 유사 구조 { features: [...] }
  waypoints?: {
    lat: number;
    lng: number;
    label?: string;
    icon?: string;
    color?: string;
    priority?: number;
  }[];
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
  height = 'h-screen',
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
        // 캐시 방지를 위한 타임스탬프 추가
        url.searchParams.set('v', Date.now().toString());
        iframe.src = url.toString();
        // 디버그 로그
        console.log('[TmapMap] iframe src =', iframe.src);
      } catch (err) {
        console.error('[TmapMap] URL 생성 실패:', err);
        iframe.src = `/tmap-embed.html?appKey=${encodeURIComponent(process.env.NEXT_PUBLIC_TMAP_API_KEY || '')}&v=${Date.now()}`;
      }
      iframe.onload = () => {
        console.log('[TmapMap] iframe loaded successfully');
        setReady(true);
        // 초기 중심 전달
        iframe.contentWindow?.postMessage({ type: 'init', center }, '*');
      };

      iframe.onerror = (err) => {
        console.error('[TmapMap] iframe load error:', err);
        setError('지도 로딩 실패');
      };

      containerRef.current.appendChild(iframe);
      iframeRef.current = iframe;

      console.log('[TmapMap] iframe appended to container');
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
    if (!ready || !iframeRef.current) {
      console.log('[TmapMap] iframe not ready:', { ready, iframeRef: !!iframeRef.current });
      return;
    }

    console.log('[TmapMap] Drawing route/waypoints:', { routeData, waypoints, center });

    // waypoints 데이터를 그대로 사용 (TmapMainMap에서 이미 올바르게 설정됨)
    const enhancedWaypoints = waypoints;

    // 임베드된 iframe에 postMessage로 경로 그리기 전달
    const message = { type: 'route', routeData, center, waypoints: enhancedWaypoints };
    console.log('[TmapMap] Sending message to iframe:', message);

    try {
      if (iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage(message, '*');
        console.log('[TmapMap] Message sent successfully to iframe');
      } else {
        console.error('[TmapMap] iframe contentWindow is null');
      }
    } catch (error) {
      console.error('[TmapMap] Failed to send message to iframe:', error);
    }
  }, [ready, routeData, waypoints, center]);

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
    <div className={`${className} ${height} map-container`} style={{ height: '100vh', margin: 0, padding: 0 }}>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ height: '100vh', margin: 0, padding: 0 }}
      />
      {error && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-600 font-semibold">지도 오류</div>
            <div className="text-gray-600 text-sm">{error}</div>
          </div>
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


