'use client';

import React, { useEffect, useRef, useState } from 'react';

const MAX_RENDER_RETRY = 3;
const RENDER_ACK_TIMEOUT_MS = 5000;

type RenderPayload = {
  type: 'route';
  routeData: any;
  center: { lat: number; lng: number };
  waypoints?: {
    lat: number;
    lng: number;
    label?: string;
    icon?: string;
    color?: string;
    priority?: number;
    isPreview?: boolean;
    driverId?: string;
    driverIndex?: number;
    address?: string;
    arrivalTime?: string;
    departureTime?: string;
    dwellTime?: number;
    etaLabel?: string;
    riskColor?: string;
  }[];
  multiDriverMode: boolean;
  requestId: string;
  payloadHash: string;
};

interface TmapMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  routeData?: any; // Tmap REST or GeoJSON 유사 구조 { features: [...] } 또는 다중 배송원 배열
  waypoints?: {
    lat: number;
    lng: number;
    label?: string;
    icon?: string;
    color?: string;
    priority?: number;
    isPreview?: boolean;
    driverId?: string;
    driverIndex?: number;
    address?: string;
    arrivalTime?: string;
    departureTime?: string;
    dwellTime?: number;
  }[];
  useExplicitDestination?: boolean;
  className?: string;
  height?: string;
  multiDriverMode?: boolean;
  focusedWaypoint?: { lat: number; lng: number; label?: string } | null;
}

export default function TmapMap({
  center = { lat: 37.566535, lng: 126.9779692 },
  zoom = 14,
  routeData,
  waypoints,
  useExplicitDestination = false,
  className = 'w-full',
  height = 'h-screen',
  multiDriverMode = false,
  focusedWaypoint = null,
}: TmapMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const requestSeqRef = useRef(0);
  const isMapReadyRef = useRef(false);
  const pendingPayloadRef = useRef<RenderPayload | null>(null);
  const lastAckedPayloadRef = useRef<RenderPayload | null>(null);
  const inflightRequestIdRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const ackTimerRef = useRef<number | null>(null);
  const mapReadyFallbackTimerRef = useRef<number | null>(null);
  const lastQueuedPayloadHashRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<'idle' | 'waiting-ack' | 'ok' | 'failed'>('idle');
  const [isMapReadyState, setIsMapReadyState] = useState(false);

  const clearAckTimer = () => {
    if (ackTimerRef.current !== null) {
      window.clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
  };
  const clearMapReadyFallbackTimer = () => {
    if (mapReadyFallbackTimerRef.current !== null) {
      window.clearTimeout(mapReadyFallbackTimerRef.current);
      mapReadyFallbackTimerRef.current = null;
    }
  };

  const buildPayloadHash = (route: any, waypointList: any, isMultiDriver: boolean) => {
    try {
      const raw = JSON.stringify({
        route: route ?? null,
        waypoints: waypointList ?? null,
        multiDriverMode: isMultiDriver,
      });
      let hash = 0;
      for (let i = 0; i < raw.length; i += 1) {
        hash = (hash * 31 + raw.charCodeAt(i)) | 0;
      }
      return `h${Math.abs(hash)}`;
    } catch {
      return `h${Date.now()}`;
    }
  };

  const postPayloadToIframe = (payload: RenderPayload, isRetry: boolean) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      setError('지도 프레임 접근 실패');
      return;
    }

    inflightRequestIdRef.current = payload.requestId;
    setRenderStatus('waiting-ack');
    win.postMessage(payload, '*');

    clearAckTimer();
    ackTimerRef.current = window.setTimeout(() => {
      if (inflightRequestIdRef.current !== payload.requestId) return;

      if (retryCountRef.current < MAX_RENDER_RETRY - 1) {
        retryCountRef.current += 1;
        postPayloadToIframe(payload, true);
        return;
      }

      inflightRequestIdRef.current = null;
      setRenderStatus('failed');
      setError('지도 반영이 지연되고 있습니다. 다시 시도해 주세요.');
      console.error('[TmapMap] routeRendered ACK timeout', {
        requestId: payload.requestId,
        retries: retryCountRef.current,
        isRetry,
      });
    }, RENDER_ACK_TIMEOUT_MS + retryCountRef.current * 400);
  };

  const flushPendingPayload = () => {
    const payload = pendingPayloadRef.current;
    if (!payload || !isMapReadyRef.current || !iframeRef.current) return;

    retryCountRef.current = 0;
    setError(null);
    postPayloadToIframe(payload, false);
  };

  useEffect(() => {
    if (containerRef.current && !iframeRef.current) {
      const iframe = document.createElement('iframe');
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.style.border = '0';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      try {
        const origin = window.location.origin;
        const url = new URL('/tmap-embed', origin);
        url.searchParams.set('v', Date.now().toString());
        iframe.src = url.toString();
      } catch (err) {
        iframe.src = `/tmap-embed.html?appKey=${encodeURIComponent(process.env.NEXT_PUBLIC_TMAP_API_KEY || '')}&v=${Date.now()}`;
      }
      iframe.onload = () => {
        setReady(true);
        setError(null);
        isMapReadyRef.current = false;
        setIsMapReadyState(false);
        iframe.contentWindow?.postMessage({ type: 'init', center }, '*');
        clearMapReadyFallbackTimer();
        mapReadyFallbackTimerRef.current = window.setTimeout(() => {
          if (isMapReadyRef.current) return;
          // mapReady 미수신 상황에서도 마지막 payload를 강제로 전달해 복구 시도
          const payload = pendingPayloadRef.current;
          if (!payload) return;
          setError('지도 준비 신호 지연: 렌더 복구 시도 중');
          retryCountRef.current = 0;
          postPayloadToIframe(payload, false);
        }, 4000);
      };

      iframe.onerror = () => {
        setError('지도 로딩 실패');
      };

      containerRef.current.appendChild(iframe);
      iframeRef.current = iframe;
    }

    const handleFrameMessage = (event: MessageEvent) => {
      const sameSource = event.source === iframeRef.current?.contentWindow;
      const sameOrigin = event.origin === window.location.origin;
      if (!sameSource && !sameOrigin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'mapReady') {
        isMapReadyRef.current = true;
        setIsMapReadyState(true);
        setError(null);
        clearMapReadyFallbackTimer();
        flushPendingPayload();
        return;
      }

      if (data.type === 'routeRendered') {
        if (data.requestId && data.requestId === inflightRequestIdRef.current) {
          clearAckTimer();
          inflightRequestIdRef.current = null;
          retryCountRef.current = 0;
          setRenderStatus('ok');
          setError(null);
          if (!isMapReadyRef.current) {
            isMapReadyRef.current = true;
            setIsMapReadyState(true);
          }
          if (pendingPayloadRef.current?.requestId === data.requestId) {
            lastAckedPayloadRef.current = pendingPayloadRef.current;
          }
        }
        return;
      }

      if (data.type === 'mapError') {
        setRenderStatus('failed');
        setError(data.error || '지도 렌더링 오류');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) return;
      if (!isMapReadyRef.current) return;

      const payload = pendingPayloadRef.current || lastAckedPayloadRef.current;
      if (!payload) return;
      retryCountRef.current = 0;
      postPayloadToIframe(payload, false);
    };

    window.addEventListener('message', handleFrameMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('message', handleFrameMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearAckTimer();
      clearMapReadyFallbackTimer();

      if (iframeRef.current && iframeRef.current.parentNode) {
        iframeRef.current.parentNode.removeChild(iframeRef.current);
        iframeRef.current = null;
      }
    };
  }, [center.lat, center.lng, zoom]);

  useEffect(() => {
    if (!ready || !iframeRef.current) {
      return;
    }

    requestSeqRef.current += 1;
    const requestId = `route-${Date.now()}-${requestSeqRef.current}`;
    const payloadHash = buildPayloadHash(routeData, waypoints, multiDriverMode);
    const sameAsQueued = lastQueuedPayloadHashRef.current === payloadHash;
    const sameAsAcked = lastAckedPayloadRef.current?.payloadHash === payloadHash;
    if (sameAsQueued && sameAsAcked && !inflightRequestIdRef.current) {
      return;
    }

    const message: RenderPayload = {
      type: 'route',
      routeData,
      center,
      waypoints,
      multiDriverMode,
      requestId,
      payloadHash,
    };
    pendingPayloadRef.current = message;
    lastQueuedPayloadHashRef.current = payloadHash;
    setRenderStatus('idle');

    // mapReady 신호가 누락되어도 route 메시지는 전송한다.
    // ACK 기반 재시도로 결국 동기화되도록 보장한다.
    retryCountRef.current = 0;
    postPayloadToIframe(message, false);
  }, [ready, routeData, waypoints, center.lat, center.lng, multiDriverMode]);

  useEffect(() => {
    if (!ready || !iframeRef.current || !focusedWaypoint) return;
    iframeRef.current.contentWindow?.postMessage(
      { type: 'focusWaypoint', waypoint: focusedWaypoint },
      '*'
    );
  }, [ready, focusedWaypoint]);

  return (
    <div className={`${className} ${height} map-container`} style={{ height: '100vh', margin: 0, padding: 0 }}>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ height: '100vh', margin: 0, padding: 0 }}
      />
      {ready && (
        <div className="absolute top-2 right-2 rounded bg-white/80 px-2 py-1 text-xs text-gray-600">
          {isMapReadyState ? (renderStatus === 'waiting-ack' ? '지도 반영 중...' : '지도 준비됨') : '지도 초기화 중...'}
        </div>
      )}
      {error && (
        <div className="absolute top-10 right-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
          {error}
        </div>
      )}
      {!ready && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-700 font-semibold">지도 로딩 중</div>
            <div className="text-gray-500 text-sm">잠시만 기다려 주세요</div>
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


