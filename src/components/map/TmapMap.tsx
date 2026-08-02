'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

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

function getTargetOrigin() {
  if (typeof window === 'undefined') return '*';
  return window.location.origin;
}

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
    etaLabel?: string;
    riskColor?: string;
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
  const [fatalError, setFatalError] = useState<string | null>(null); // SDK 로드 실패 등 재시도가 필요한 하드 에러
  const [reloadNonce, setReloadNonce] = useState(0); // 증가 시 iframe을 재생성(SDK 재시도)
  const [renderStatus, setRenderStatus] = useState<'idle' | 'waiting-ack' | 'ok' | 'failed'>('idle');
  const [legendOpen, setLegendOpen] = useState(true);

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
    win.postMessage(payload, getTargetOrigin());

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
      iframe.title = '경로 지도';
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
        iframe.contentWindow?.postMessage({ type: 'init', center }, getTargetOrigin());
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
        setFatalError('지도를 불러오지 못했습니다. 다시 시도해 주세요.');
      };

      containerRef.current.appendChild(iframe);
      iframeRef.current = iframe;
    }

    const handleFrameMessage = (event: MessageEvent) => {
      const sameSource = event.source === iframeRef.current?.contentWindow;
      const sameOrigin = event.origin === window.location.origin;
      if (!sameSource || !sameOrigin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'mapReady') {
        isMapReadyRef.current = true;
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
          }
          if (pendingPayloadRef.current?.requestId === data.requestId) {
            lastAckedPayloadRef.current = pendingPayloadRef.current;
          }
        }
        return;
      }

      if (data.type === 'mapError') {
        setRenderStatus('failed');
        if (data.error === 'SDK_LOAD_TIMEOUT') {
          // SDK가 끝내 로드되지 않음 → 빈 지도에 갇히지 않도록 재시도 UI 노출
          setFatalError('지도 SDK를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
        } else {
          setError(data.error || '지도 렌더링 오류');
        }
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
  }, [center.lat, center.lng, zoom, reloadNonce]);

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
      getTargetOrigin()
    );
  }, [ready, focusedWaypoint]);

  // SDK 로드 실패 등 하드 에러 후 iframe을 처음부터 재생성해 복구를 시도한다.
  const reloadMap = () => {
    setError(null);
    setFatalError(null);
    setReady(false);
    setRenderStatus('idle');
    isMapReadyRef.current = false;
    lastAckedPayloadRef.current = null;
    lastQueuedPayloadHashRef.current = null;
    inflightRequestIdRef.current = null;
    retryCountRef.current = 0;
    clearAckTimer();
    clearMapReadyFallbackTimer();
    setReloadNonce((n) => n + 1);
  };

  // '전체 경로 보기' — 사용자가 확대/이동한 뒤 다시 전체 경로에 뷰를 맞춘다.
  const fitAllInView = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'fitView' }, getTargetOrigin());
  };

  // 지도 위 범례 데이터(모드별). 표시할 지점이 없으면 null.
  const legend = useMemo(() => {
    const pts = waypoints || [];
    if (pts.length === 0) return null;
    if (multiDriverMode) {
      const byDriver = new Map<number, string>();
      pts.forEach((p) => {
        if (typeof p.driverIndex === 'number' && p.label !== '출발') {
          if (!byDriver.has(p.driverIndex)) byDriver.set(p.driverIndex, p.color || '#3B82F6');
        }
      });
      const drivers = Array.from(byDriver.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([idx, color]) => ({ color, label: `배송원 ${idx + 1}` }));
      return { mode: 'multi' as const, drivers };
    }
    // 단일 모드 핀은 전부 파란 원이고 라벨(출발/순번/도착)로 구분된다(색 구분 아님).
    // 색으로 구분되는 유일한 요소는 각 핀 위 ETA 배지(마감 대비 위험)뿐이다.
    const hasEta = pts.some((p) => !!p.etaLabel);
    return { mode: 'single' as const, hasDestination: !!useExplicitDestination, hasEta };
  }, [waypoints, multiDriverMode, useExplicitDestination]);

  // 단일 모드: 파란 핀 안의 라벨로 지점 종류를 구분함을 그대로 표현
  const singlePinItems = [
    { glyph: '출', label: '출발지' },
    { glyph: '1', label: '방문 순번' },
    ...(legend?.mode === 'single' && legend.hasDestination ? [{ glyph: '도', label: '도착지' }] : []),
  ];
  // ETA 배지 색 = 마감 대비 도착 위험
  const riskItems = [
    { color: '#22C55E', label: '여유' },
    { color: '#F59E0B', label: '임박 (20분↓)' },
    { color: '#EF4444', label: '마감 초과' },
  ];

  return (
    <div className={`relative ${className} ${height} map-container`}>
      <div
        ref={containerRef}
        className="w-full h-full"
      />
      {/* 렌더 반영 중에만 잠깐 노출되는 트랜지언트 표시(상시 배지 제거) */}
      {ready && renderStatus === 'waiting-ack' && (
        <div className="absolute top-2 right-2 z-[1200] flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          반영 중
        </div>
      )}

      {/* 일시적 렌더 오류 토스트(하드 에러가 아닌 경우만) */}
      {error && !fatalError && (
        <div className="absolute top-2 left-1/2 z-[1300] -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 shadow">
          {error}
        </div>
      )}

      {/* 지도 범례 */}
      {ready && legend && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1200] max-w-[min(15rem,calc(100%-1.5rem))]">
          <div className="surface-floating pointer-events-auto rounded-xl px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-foreground">범례</span>
              <button
                type="button"
                onClick={() => setLegendOpen((v) => !v)}
                className="text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {legendOpen ? '접기' : '펼치기'}
              </button>
            </div>

            {legendOpen && (
              <div className="mt-2 space-y-2">
                {legend.mode === 'single' ? (
                  <>
                    <div className="space-y-1">
                      {singlePinItems.map((it) => (
                        <div key={it.label} className="flex items-center gap-2">
                          <span className="inline-flex h-4 w-4 flex-none items-center justify-center rounded-full bg-route-pin-waypoint text-[8px] font-bold text-white ring-1 ring-white/70">{it.glyph}</span>
                          <span className="text-muted-foreground">{it.label}</span>
                        </div>
                      ))}
                    </div>
                    {legend.hasEta && (
                      <div className="border-t border-border pt-2">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">ETA 배지 (마감 대비)</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {riskItems.map((it) => (
                            <div key={it.label} className="flex items-center gap-1.5">
                              <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: it.color }} />
                              <span className="text-muted-foreground">{it.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: '#10B981' }} />
                      <span className="text-muted-foreground">출발 (공통)</span>
                    </div>
                    {legend.drivers.map((d) => (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: d.color }} />
                        <span className="text-muted-foreground">{d.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                  <span className="text-[10px] text-muted-foreground">핀·경로 클릭 → 상세</span>
                  <button
                    type="button"
                    onClick={fitAllInView}
                    className="whitespace-nowrap text-[10px] font-bold text-primary hover:underline"
                  >
                    전체 경로 보기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 로딩 오버레이(하드 에러가 아닐 때만) */}
      {!ready && !fatalError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="text-center">
            <div className="font-semibold text-foreground">지도 로딩 중</div>
            <div className="text-sm text-muted-foreground">지도를 불러오는 중…</div>
          </div>
        </div>
      )}

      {/* SDK 로드 실패 등 하드 에러 → 재시도 UI(빈 지도에 갇히지 않도록) */}
      {fatalError && (
        <div className="absolute inset-0 z-[1500] flex items-center justify-center bg-muted px-4">
          <div className="max-w-xs text-center">
            <div className="mb-1 text-base font-bold text-foreground">지도를 표시할 수 없어요</div>
            <div className="mb-4 text-sm leading-relaxed text-muted-foreground">{fatalError}</div>
            <button
              type="button"
              onClick={reloadMap}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.99]"
            >
              다시 시도
            </button>
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

