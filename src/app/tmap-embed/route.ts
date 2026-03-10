import { NextResponse } from 'next/server'

export async function GET() {
  // 환경변수 디버깅 강화
  const nextPublicKey = process.env.NEXT_PUBLIC_TMAP_API_KEY
  const tmapKey = process.env.TMAP_API_KEY
  const appKey = nextPublicKey || tmapKey || ''

  // 디버깅용 로그 (프로덕션에서는 제거 필요)
  console.log('[tmap-embed] NEXT_PUBLIC_TMAP_API_KEY exists:', !!nextPublicKey)
  console.log('[tmap-embed] NEXT_PUBLIC_TMAP_API_KEY length:', nextPublicKey?.length || 0)
  console.log('[tmap-embed] TMAP_API_KEY exists:', !!tmapKey)
  console.log('[tmap-embed] TMAP_API_KEY length:', tmapKey?.length || 0)
  console.log('[tmap-embed] Final key exists:', !!appKey)
  console.log('[tmap-embed] Final key length:', appKey.length)
  console.log('[tmap-embed] All env keys:', Object.keys(process.env).filter(k => k.includes('TMAP')))

  if (!appKey) {
    console.error('[tmap-embed] TMAP API key not found in any environment variable')
    return new NextResponse('TMAP API key not configured. Please check Vercel environment variables.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    })
  }

  const html = `
      <!DOCTYPE html>
      <html>
<head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Tmap Map</title>
          <style>
            body, html {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
            }
            
            #map {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
              position: absolute;
              top: 0;
              left: 0;
            }
          </style>
</head>
<body>
  <div id="map"></div>
          <script src="https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${appKey}"></script>
  <script>
            console.log('[TmapEmbed] Script loaded, appKey:', '${appKey ? 'EXISTS' : 'MISSING'}');
            
            let map = null;
            let routePolylines = []; // 경로 polyline들을 배열로 관리
            let segmentPolylines = []; // 세그먼트 강조용
            let markers = [];
            let infoWindows = [];
            let segmentInteracts = []; // {center, line, badge, metaIdx}
            let markerInteracts = [];  // {marker, tip, position, address, label}
            try { window.segmentInteracts = segmentInteracts; window.markerInteracts = markerInteracts; } catch(e){}
            let overlayLayer = null;   // DOM overlay layer
            let overlayBadge = null;   // segment badge div
            let overlayTip = null;     // marker tooltip div
            let lastMarkerKey = null;  // 토글 상태 추적용
            let lastSegmentKey = null; // 토글 상태 추적용
            let lastRenderRequestId = null;
            let lastPayloadHash = null;
            
            // 전역 디버그 노출 (초기 no-op)
            try { window.toggleNearest = function(){ console.log('[TmapEmbed] toggleNearest noop (not ready)'); }; } catch(e){}

            // Tmapv2 로딩 대기
            function waitForTmap() {
              if (typeof window.Tmapv2 !== 'undefined') {
                console.log('[TmapEmbed] Tmapv2 loaded, initializing map');
                initMap();
              } else {
                console.log('[TmapEmbed] Tmapv2 not ready, waiting...');
                setTimeout(waitForTmap, 100);
              }
            }
            
            function initMap() {
              try {
                console.log('[TmapEmbed] Initializing map...');
                console.log('[TmapEmbed] Tmapv2 객체 확인:', {
                  Tmapv2: typeof Tmapv2,
                  Tmapv2Map: typeof Tmapv2.Map,
                  Tmapv2LatLng: typeof Tmapv2.LatLng,
                  Tmapv2Polyline: typeof Tmapv2.Polyline,
                  Tmapv2Marker: typeof Tmapv2.Marker
                });
                
                // 지도 생성
                map = new Tmapv2.Map("map", {
                  center: new Tmapv2.LatLng(37.566535, 126.9779692),
                  width: "100%",
                  height: "100%",
                  zoom: 14,
                  zoomControl: true,
                  scrollwheel: true
                });
                
                console.log('[TmapEmbed] Map created successfully');
                console.log('[TmapEmbed] Map 객체 메서드 확인:', {
                  setCenter: typeof map.setCenter,
                  setZoom: typeof map.setZoom,
                  addOverlay: typeof map.addOverlay,
                  removeOverlay: typeof map.removeOverlay
                });
                console.log('[TmapEmbed] Event availability:', {
                  Event: typeof Tmapv2.Event,
                  addListener: Tmapv2.Event && typeof Tmapv2.Event.addListener
                });
                
                // 메시지 리스너 설정
                window.addEventListener('message', handleMessage);
                
                // 초기화 완료 메시지
                window.parent.postMessage({ type: 'mapReady' }, '*');
                // 전역 인터랙션 설치
                try { installGlobalInteraction(true); } catch (e) { console.warn('[TmapEmbed] installGlobalInteraction failed at init', e); }
                try { console.log('[TmapEmbed] After init, toggleNearest type =', typeof window.toggleNearest); } catch(e){}
                
              } catch (error) {
                console.error('[TmapEmbed] Map initialization failed:', error);
                window.parent.postMessage({ type: 'mapError', error: error.message }, '*');
              }
            }
            
            function handleMessage(event) {
              try {
                console.log('[TmapEmbed] Message received:', event.data);
                const { type, routeData, center, waypoints, multiDriverMode, requestId, payloadHash } = event.data;
                
                switch (type) {
                  case 'init':
                    console.log('[TmapEmbed] Handling init message:', { center, map: !!map });
                    if (center && map) {
                      map.setCenter(new Tmapv2.LatLng(center.lat, center.lng));
                      console.log('[TmapEmbed] Map center updated');
                    }
                    break;
                    
                  case 'route':
                    console.log('[TmapEmbed] Handling route message:', { 
                      routeData: !!routeData, 
                      waypoints: !!waypoints, 
                      waypointsCount: waypoints?.length,
                      multiDriverMode: !!multiDriverMode,
                      isRouteDataArray: Array.isArray(routeData),
                      requestId
                    });
                    let renderApplied = false;
                    if (routeData || waypoints) {
                      if (multiDriverMode && Array.isArray(routeData)) {
                        renderApplied = drawMultiDriverRoutes(routeData, waypoints);
                      } else {
                        renderApplied = drawRoute(routeData, waypoints);
                      }
                    } else {
                      console.log('[TmapEmbed] No route data or waypoints provided');
                      clearOverlays();
                      renderApplied = true;
                    }
                    lastRenderRequestId = requestId || null;
                    lastPayloadHash = payloadHash || null;
                    window.parent.postMessage({
                      type: 'routeRendered',
                      requestId: lastRenderRequestId,
                      payloadHash: lastPayloadHash,
                      applied: renderApplied
                    }, '*');
                    break;

                  case 'focusWaypoint':
                    if (event.data?.waypoint && map) {
                      const wp = event.data.waypoint;
                      if (wp.lat && wp.lng) {
                        map.setCenter(new Tmapv2.LatLng(wp.lat, wp.lng));
                        try { map.setZoom(Math.max(map.getZoom(), 15)); } catch (e) {}
                      }
                    }
                    break;
                    
                  default:
                    console.log('[TmapEmbed] Unknown message type:', type);
                }
              } catch (error) {
                console.error('[TmapEmbed] Message handling error:', error);
              }
            }
            
            function clearOverlays() {
              // 기존 마커 제거
              if (markers.length > 0) {
                markers.forEach(m => { try { m.setMap(null); } catch (e) {} });
                markers = [];
              }
              // 기존 경로 제거
              if (routePolylines.length > 0) {
                routePolylines.forEach(l => { try { l.setMap(null); } catch (e) {} });
                routePolylines = [];
              }
              if (segmentPolylines.length > 0) {
                segmentPolylines.forEach(l => { try { l.setMap(null); } catch (e) {} });
                segmentPolylines = [];
              }
              if (infoWindows.length > 0) {
                infoWindows.forEach(w => { try { w.setMap(null); } catch (e) {} });
                infoWindows = [];
              }
              segmentInteracts = [];
              markerInteracts = [];
              try { window.segmentInteracts = segmentInteracts; window.markerInteracts = markerInteracts; } catch(e){}
              if (overlayBadge) { try { overlayBadge.remove(); } catch(e){} overlayBadge = null; }
              if (overlayTip) { try { overlayTip.remove(); } catch(e){} overlayTip = null; }
            }

            // 다중 배송원 경로 그리기
            function drawMultiDriverRoutes(routeDataArray, waypoints) {
              try {
                console.log('[TmapEmbed] drawMultiDriverRoutes 시작:', { 
                  driversCount: routeDataArray.length,
                  waypointsCount: waypoints?.length || 0
                });
                
                clearOverlays();
                
                const driverColors = [
                  '#3B82F6', // 파란색
                  '#EF4444', // 빨간색
                  '#10B981', // 초록색
                  '#F59E0B', // 노란색
                  '#8B5CF6', // 보라색
                  '#EC4899', // 핑크색
                  '#06B6D4', // 청록색
                  '#F97316', // 주황색
                  '#14B8A6', // 틸색
                  '#6366F1', // 인디고색
                ];
                
                // 각 배송원별로 경로 그리기
                routeDataArray.forEach((driverRouteData, driverIndex) => {
                  const color = driverRouteData.color || driverColors[driverIndex % driverColors.length];
                  const driverId = driverRouteData.driverId || \`driver-\${driverIndex + 1}\`;
                  
                  console.log(\`[TmapEmbed] 배송원 \${driverId} 경로 그리기:\`, {
                    color,
                    featuresCount: driverRouteData.features?.length || 0
                  });
                  
                  if (driverRouteData.features && driverRouteData.features.length > 0) {
                    // 전체 경로 좌표 수집
                    const fullPath = [];
                    driverRouteData.features.forEach((feature) => {
                      if (!feature.geometry || !feature.geometry.coordinates) return;
                      const coords = feature.geometry.coordinates;
                      if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                        coords.forEach((c) => fullPath.push(new Tmapv2.LatLng(c[1], c[0])));
                      } else if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
                        const flat = coords.flat(1);
                        flat.forEach((c) => fullPath.push(new Tmapv2.LatLng(c[1], c[0])));
                      }
                    });
                    
                    // 배송원별 색상으로 폴리라인 그리기
                    if (fullPath.length > 1) {
                      const polyline = new Tmapv2.Polyline({ 
                        path: fullPath, 
                        strokeColor: color, 
                        strokeWeight: 6, 
                        strokeOpacity: 0.8, 
                        map 
                      });
                      routePolylines.push(polyline);
                    }
                  }
                });
                
                // waypoints 마커 표시 (배송원별 색상 적용 및 툴팁)
                if (waypoints && waypoints.length > 0) {
                  console.log('[TmapEmbed] 다중 배송원 waypoints:', waypoints.length, '개');
                  waypoints.forEach((wp, wpIndex) => {
                    if (!wp || !wp.lat || !wp.lng) {
                      console.warn('[TmapEmbed] 잘못된 waypoint:', wp);
                      return;
                    }
                    
                    const wpColor = wp.color || '#3B82F6';
                    const wpLabel = wp.label || '';
                    const wpIcon = wp.icon || '📍';
                    const driverIndex = wp.driverIndex !== undefined ? wp.driverIndex : -1;
                    const wpAddress = wp.address || '';
                    
                    try {
                      console.log('[TmapEmbed] 마커 생성:', { lat: wp.lat, lng: wp.lng, label: wpLabel, address: wpAddress });
                      const marker = new Tmapv2.Marker({
                        position: new Tmapv2.LatLng(wp.lat, wp.lng),
                        map: map,
                        icon: wpIcon,
                        iconSize: new Tmapv2.Size(32, 32),
                        label: wpLabel,
                        title: wpAddress || wpLabel
                      });
                      
                      markers.push(marker);
                      
                      // 툴팁 생성 (기존 drawRoute와 동일한 방식)
                      try {
                        const tipPos = new Tmapv2.LatLng(wp.lat, wp.lng);
                        const tipText = wpAddress || wpLabel || \`경유지 \${wpIndex + 1}\`;
                        const tipLabel = driverIndex >= 0 ? \`배송원 \${driverIndex + 1} - \${tipText}\` : tipText;
                        
                        markerInteracts.push({ 
                          marker: marker, 
                          position: tipPos, 
                          address: wpAddress, 
                          label: tipLabel,
                          driverIndex: driverIndex,
                          color: wpColor
                        });
                        
                        // 마커 클릭/터치 이벤트로 툴팁 토글
                        const bind = (obj, event, handler) => {
                          try {
                            if (Tmapv2 && Tmapv2.Event && typeof Tmapv2.Event.addListener === 'function') {
                              Tmapv2.Event.addListener(obj, event, handler);
                            } else if (obj.addEventListener) {
                              obj.addEventListener(event, handler);
                            }
                          } catch(e) { console.warn('[TmapEmbed] 이벤트 바인딩 실패', e); }
                        };
                        
                        const toggleTip = () => {
                          try {
                            const layer = marker.getLayer ? marker.getLayer() : null;
                            if (!layer) return;
                            
                            let tip = layer.querySelector('._markerTip');
                            if (!tip) {
                              tip = document.createElement('div');
                              tip.className = '_markerTip';
                              tip.style.position = 'absolute';
                              tip.style.transform = 'translate(-50%, -120%)';
                              tip.style.background = driverIndex >= 0 ? wpColor : '#111';
                              tip.style.color = '#fff';
                              tip.style.padding = '8px 12px';
                              tip.style.borderRadius = '8px';
                              tip.style.fontSize = '12px';
                              tip.style.fontWeight = '500';
                              tip.style.boxShadow = '0 2px 8px rgba(0,0,0,.3)';
                              tip.style.whiteSpace = 'nowrap';
                              tip.style.zIndex = '1000';
                              tip.textContent = tipLabel;
                              layer.appendChild(tip);
                            }
                            
                            tip.style.display = (tip.style.display === 'block') ? 'none' : 'block';
                          } catch(e) {
                            console.warn('[TmapEmbed] 툴팁 토글 실패', e);
                          }
                        };
                        
                        bind(marker, 'click', toggleTip);
                        bind(marker, 'touchstart', () => { setTimeout(toggleTip, 0); });
                      } catch(e) {
                        console.warn('[TmapEmbed] 마커 툴팁 생성 실패', e);
                      }
                    } catch(e) {
                      console.warn('[TmapEmbed] 마커 생성 실패:', wp, e);
                    }
                  });
                  
                  console.log('[TmapEmbed] 다중 배송원 마커 그리기 완료:', markers.length, '개 마커');
                  try { window.markerInteracts = markerInteracts; } catch(e){}
                }
                
                // 모든 경로를 포함하도록 지도 범위 조정
                if (routePolylines.length > 0 || markers.length > 0) {
                  const bounds = new Tmapv2.LatLngBounds();
                  routePolylines.forEach(polyline => {
                    if (polyline.getPath && polyline.getPath().getArray) {
                      polyline.getPath().getArray().forEach(latlng => bounds.extend(latlng));
                    }
                  });
                  markers.forEach(marker => {
                    if (marker.getPosition) bounds.extend(marker.getPosition());
                  });
                  if (!bounds.isEmpty()) {
                    map.fitBounds(bounds);
                    map.setZoom(Math.min(map.getZoom(), 14)); // 너무 확대되지 않도록
                  }
                }
                
                console.log('[TmapEmbed] drawMultiDriverRoutes 완료:', {
                  polylines: routePolylines.length,
                  markers: markers.length
                });
                return true;
              } catch (error) {
                console.error('[TmapEmbed] drawMultiDriverRoutes 오류:', error);
                return false;
              }
            }

            function drawRoute(routeData, waypoints) {
              try {
                console.log('[TmapEmbed] drawRoute 시작:', { 
                  hasRouteData: !!routeData, 
                  routeDataFeatures: routeData?.features?.length || 0,
                  hasWaypoints: !!waypoints, 
                  waypointsCount: waypoints?.length || 0 
                });
                
                clearOverlays();
                try { window.__segmentSummary = routeData && routeData.segmentSummary ? routeData.segmentSummary : null; } catch(e) {}
                
                // 경로 그리기 (routeData가 있을 때만)
                if (routeData && routeData.features && routeData.features.length > 0) {
                  console.log('[TmapEmbed] 경로 그리기 시작:', routeData.features.length, '개 feature');

                  // 1) 전체 경로 좌표 풀어 수집
                  const fullPath = [];
                  routeData.features.forEach((feature) => {
                    if (!feature.geometry || !feature.geometry.coordinates) return;
                    const coords = feature.geometry.coordinates;
                    if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                      coords.forEach((c) => fullPath.push(new Tmapv2.LatLng(c[1], c[0])));
                    } else if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
                      const flat = coords.flat(1);
                      flat.forEach((c) => fullPath.push(new Tmapv2.LatLng(c[1], c[0])));
                    }
                  });

                  // 2) 세그먼트 분리: waypoints 위치를 fullPath 내 가장 가까운 인덱스로 매핑하여 슬라이스
                  const wp = (waypoints || []).map(p => new Tmapv2.LatLng(p.lat, p.lng));
                  // 좌표 안전 접근 헬퍼
                  const getLatSafe = (p) => {
                    try {
                      if (p && typeof p.getLat === 'function') return p.getLat();
                      if (p && typeof p.lat === 'function') return p.lat();
                      if (p && typeof p.lat === 'number') return p.lat;
                      if (p && typeof p.y === 'number') return p.y;
                      if (p && p._lat !== undefined) return p._lat; // 내부 값 대비
                    } catch (e) {}
                    return NaN;
                  };
                  const getLngSafe = (p) => {
                    try {
                      if (p && typeof p.getLng === 'function') return p.getLng();
                      if (p && typeof p.lng === 'function') return p.lng();
                      if (p && typeof p.lng === 'number') return p.lng;
                      if (p && typeof p.x === 'number') return p.x;
                      if (p && p._lng !== undefined) return p._lng; // 내부 값 대비
                    } catch (e) {}
                    return NaN;
                  };
                  const idxOf = (ll) => {
                    let best = 0, bestD = Infinity;
                    for (let i = 0; i < fullPath.length; i++) {
                      const aLat = getLatSafe(fullPath[i]);
                      const aLng = getLngSafe(fullPath[i]);
                      const bLat = getLatSafe(ll);
                      const bLng = getLngSafe(ll);
                      if (isNaN(aLat) || isNaN(aLng) || isNaN(bLat) || isNaN(bLng)) continue;
                      const dLat = aLat - bLat;
                      const dLng = aLng - bLng;
                      const d = dLat*dLat + dLng*dLng;
                      if (d < bestD) { bestD = d; best = i; }
                    }
                    return best;
                  };
                  const anchors = wp.map(idxOf);
                  // 정렬 보정 및 유니크
                  const ordered = Array.from(new Set(anchors)).sort((a,b)=>a-b);

                  // 외곽선 + 본선 2중 라인으로 가독성 강화
                  if (fullPath.length > 1) {
                    const outline = new Tmapv2.Polyline({
                      path: fullPath,
                      strokeColor: '#FFFFFF',
                      strokeWeight: 14,
                      strokeOpacity: 0.98,
                      map
                    });
                    routePolylines.push(outline);

                    const mainLine = new Tmapv2.Polyline({
                      path: fullPath,
                      strokeColor: '#7C3AED',
                      strokeWeight: 7,
                      strokeOpacity: 0.98,
                      map
                    });
                    routePolylines.push(mainLine);
                  }

                  // 경로 방향 보조(화살표)
                  const step = Math.max(7, Math.floor(fullPath.length / 12));
                  const mercatorY = (lat) => {
                    const clamped = Math.max(-85, Math.min(85, lat));
                    const rad = clamped * Math.PI / 180;
                    return Math.log(Math.tan(Math.PI / 4 + rad / 2));
                  };
                  for (let i = step; i < fullPath.length - 2; i += step) {
                    const curr = fullPath[i];
                    const next = fullPath[i + 1];
                    if (!curr || !next) continue;
                    const currLng = getLngSafe(curr);
                    const currLat = getLatSafe(curr);
                    const nextLng = getLngSafe(next);
                    const nextLat = getLatSafe(next);
                    if ([currLng, currLat, nextLng, nextLat].some(v => isNaN(v))) continue;

                    // 지도(메르카토르) 화면 축 기준으로 각도를 계산해 화살표 뒤집힘을 방지
                    const dx = nextLng - currLng;
                    const dyMerc = mercatorY(nextLat) - mercatorY(currLat);
                    const screenDy = -dyMerc;
                    const angle = Math.atan2(screenDy, dx) * 180 / Math.PI;
                    const arrowMarker = new Tmapv2.Marker({
                      position: new Tmapv2.LatLng(currLat, currLng),
                      icon: createDirectionArrowIcon(angle),
                      iconSize: new Tmapv2.Size(22, 22),
                      map: map
                    });
                    markers.push(arrowMarker);
                  }

                  for (let si = 0; si < ordered.length - 1; si++) {
                    const a = ordered[si];
                    const b = ordered[si+1];
                    if (b - a < 2) continue; // 너무 짧으면 스킵
                    const segment = fullPath.slice(a, b+1);
                    const color = '#7C3AED';
                    const segLine = new Tmapv2.Polyline({ path: segment, strokeColor: color, strokeWeight: 7, strokeOpacity: 0.25, map });
                    routePolylines.push(segLine);
                    // 이벤트 캡처 라인은 제거 (DOM overlay로 대체)

                    // 호버 강조 + 배지
                    try {
                      const mid = segment[Math.floor(segment.length / 2)];
                      const meta = (routeData.segmentSummary && routeData.segmentSummary[si]) || null;
                      const badgeHtml = '<div style="background:rgba(0,0,0,.75);color:#fff;padding:4px 8px;border-radius:8px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap">' +
                        (meta && meta.distM ? (meta.distM/1000).toFixed(1) + 'km · ' : '') + (meta && meta.timeSec ? Math.round(meta.timeSec/60) + '분' : ('구간 ' + (si+1))) +
                        '</div>';
                      // 전역 인터랙션용 목록에 저장 (배지는 DOM으로 표시)
                      segmentInteracts.push({ center: mid, line: segLine, metaIdx: si });
                      // 클릭/탭으로 토글(hover 폴백)
                      try {
                        const bind = (target, type, handler) => {
                          try { if (Tmapv2.Event && typeof Tmapv2.Event.addListener === 'function') { Tmapv2.Event.addListener(target, type, handler); return true; } } catch(e) {}
                          return false;
                        };
                        const toggle = () => {
                          try {
                            const meta = (window.__segmentSummary && window.__segmentSummary[si]) || null;
                            const container = document.getElementById('map'); if (!container) return;
                            const rect = container.getBoundingClientRect();
                            const zoom = (typeof map.getZoom === 'function') ? map.getZoom() : 14;
                            const center = (typeof map.getCenter === 'function') ? map.getCenter() : { getLat: () => 37.5665, getLng: () => 126.978 };
                            const worldScale = 256 * Math.pow(2, zoom);
                            const project = (lt, lg) => { const x = (lg + 180) / 360 * worldScale; const siny = Math.sin(lt * Math.PI / 180); const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * worldScale; return { x, y }; };
                            const c = project(center.getLat(), center.getLng());
                            const p = project(mid.getLat(), mid.getLng());
                            const px = (p.x - c.x) + rect.width / 2; const py = (p.y - c.y) + rect.height / 2;
                            // ensure overlay
                            let layer = document.querySelector('#map > div[style*="z-index: 9999"]');
                            if (!layer) { /* 강제 생성 */ const ev = new Event('mousemove'); document.getElementById('map')?.dispatchEvent(ev); layer = document.querySelector('#map > div[style*="z-index: 9999"]'); }
                            if (!layer) return;
                            let badge = layer.querySelector('._segBadge');
                            if (!badge) { badge = document.createElement('div'); badge.className = '_segBadge'; badge.style.position = 'absolute'; badge.style.transform = 'translate(-50%, -100%)'; badge.style.background = 'rgba(0,0,0,0.75)'; badge.style.color = '#fff'; badge.style.padding = '4px 8px'; badge.style.borderRadius = '8px'; badge.style.fontSize = '12px'; badge.style.boxShadow = '0 2px 8px rgba(0,0,0,.25)'; layer.appendChild(badge); }
                            badge.textContent = meta && meta.distM ? (meta.distM/1000).toFixed(1) + 'km · ' + Math.round(meta.timeSec/60) + '분' : ('구간 ' + (si+1));
                            badge.style.left = px + 'px'; badge.style.top = py + 'px';
                            badge.style.display = (badge.style.display === 'block') ? 'none' : 'block';
                          } catch(e) {}
                        };
                        bind(segLine, 'click', toggle);
                        bind(segLine, 'touchstart', () => { setTimeout(toggle, 0); });
                      } catch(e) {}
                    } catch(e) { console.warn('[TmapEmbed] 세그먼트 배지 생성 실패', e); }
                  }

                  console.log('[TmapEmbed] 경로 그리기 완료');
                  try { window.segmentInteracts = segmentInteracts; window.markerInteracts = markerInteracts; } catch(e){}
                } else {
                  console.log('[TmapEmbed] 경로 데이터 없음 - 경로 그리기 건너뜀');
                }
                
                // 핀 그리기 (waypoints가 있으면 항상 표시)
                if (waypoints && waypoints.length > 0) {
                  console.log('[TmapEmbed] 핀 그리기 시작:', waypoints.length, '개 waypoint');
                  waypoints.forEach((point, index) => {
                    if (point.lat && point.lng) {
                      const marker = new Tmapv2.Marker({
                        position: new Tmapv2.LatLng(point.lat, point.lng),
                        icon: createPinIcon(point.label || String(index + 1), point.etaLabel, point.riskColor),
                        iconSize: new Tmapv2.Size(70, 56),
                        map: map
                      });
                      
                      markers.push(marker);
                      console.log('[TmapEmbed] 핀 ' + (index + 1) + ' 추가됨:', { lat: point.lat, lng: point.lng, label: point.label });

                      // 핀 클릭/롱프레스 툴팁 (주소/라벨)
                      try {
                        const tipHtml = '<div style="background:#111;color:#fff;padding:6px 8px;border-radius:8px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap">' +
                          (point.address ? point.address : '') + (point.label ? ' · ' + point.label : '') +
                          '</div>';
                        const tipPos = new Tmapv2.LatLng(point.lat, point.lng);
                        // 전역 인터랙션용 목록 저장 (툴팁은 DOM으로 표시)
                        markerInteracts.push({ marker: marker, position: tipPos, address: point.address || '', label: point.label || '' });

                        const bind = (target, type, handler) => { try { if (Tmapv2.Event && typeof Tmapv2.Event.addListener === 'function') { Tmapv2.Event.addListener(target, type, handler); return true; } } catch(e){} return false; };
                        const toggleTip = () => {
                          try {
                            const container = document.getElementById('map'); if (!container) return;
                            let layer = container.querySelector('div[style*="z-index: 9999"]');
                            if (!layer) { const ev = new Event('mousemove'); container.dispatchEvent(ev); layer = container.querySelector('div[style*="z-index: 9999"]'); }
                            if (!layer) return;
                            let tip = layer.querySelector('._markerTip');
                            if (!tip) { tip = document.createElement('div'); tip.className = '_markerTip'; tip.style.position = 'absolute'; tip.style.transform = 'translate(-50%, -120%)'; tip.style.background = '#111'; tip.style.color = '#fff'; tip.style.padding = '6px 8px'; tip.style.borderRadius = '8px'; tip.style.fontSize = '12px'; tip.style.boxShadow = '0 2px 8px rgba(0,0,0,.25)'; layer.appendChild(tip); }
                            tip.textContent = (point.address || '') + (point.label ? ' · ' + point.label : '');
                            const rect = container.getBoundingClientRect();
                            const zoom = (typeof map.getZoom === 'function') ? map.getZoom() : 14;
                            const center = (typeof map.getCenter === 'function') ? map.getCenter() : { getLat: () => 37.5665, getLng: () => 126.978 };
                            const worldScale = 256 * Math.pow(2, zoom);
                            const project = (lt, lg) => { const x = (lg + 180) / 360 * worldScale; const siny = Math.sin(lt * Math.PI / 180); const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * worldScale; return { x, y }; };
                            const c = project(center.getLat(), center.getLng());
                            const p = project(point.lat, point.lng);
                            const px = (p.x - c.x) + rect.width / 2; const py = (p.y - c.y) + rect.height / 2;
                            tip.style.left = px + 'px'; tip.style.top = py + 'px';
                            tip.style.display = (tip.style.display === 'block') ? 'none' : 'block';
                          } catch(e) {}
                        };
                        bind(marker, 'click', toggleTip);
                        bind(marker, 'touchstart', () => { setTimeout(toggleTip, 0); });
                      } catch(e) { console.warn('[TmapEmbed] 핀 툴팁 생성 실패', e); }
                    } else {
                      console.warn('[TmapEmbed] Waypoint ' + (index + 1) + ' 좌표 누락:', point);
                    }
                  });
                  console.log('[TmapEmbed] 핀 그리기 완료:', markers.length, '개 핀');
                  try { window.segmentInteracts = segmentInteracts; window.markerInteracts = markerInteracts; } catch(e){}
                } else {
                  console.log('[TmapEmbed] Waypoints 없음 - 핀 그리기 건너뜀');
                }
                
                // 자동 뷰맞춤: 모든 경로와 핀을 포함하는 뷰로 조정
                if (routePolylines.length > 0 || markers.length > 0) {
                  console.log('[TmapEmbed] 자동 뷰맞춤 시작');
                  console.log('[TmapEmbed] 뷰맞춤 대상:', { 
                    routePolylinesCount: routePolylines.length, 
                    markersCount: markers.length 
                  });
                  
                  try {
                    // 모든 좌표 수집
                    const allCoords = [];
                    
                    // 경로 좌표 추가 - Tmap 공식 메서드 사용
                    routePolylines.forEach((polyline, index) => {
                      console.log('[TmapEmbed] 경로 ' + (index + 1) + ' 처리 중...');
                      
                      try {
                        // Tmapv2.Polyline의 공식 메서드 사용
                        if (polyline && typeof polyline.getPath === 'function') {
                          const path = polyline.getPath();
                          console.log('[TmapEmbed] 경로 ' + (index + 1) + ' getPath() 반환값:', path);
                          console.log('[TmapEmbed] 경로 ' + (index + 1) + ' getPath() 타입:', typeof path);
                          
                          if (path && Array.isArray(path) && path.length > 0) {
                            console.log('[TmapEmbed] 경로 ' + (index + 1) + ' getPath() 성공:', path.length, '개 좌표');
                            allCoords.push(...path);
                          } else {
                            console.warn('[TmapEmbed] 경로 ' + (index + 1) + ' getPath() 반환값이 유효하지 않음:', path);
                            
                            // Tmap 내부 객체 구조 분석 - 더 자세히
                            if (path && typeof path === 'object') {
                              console.log('[TmapEmbed] 경로 ' + (index + 1) + ' path 객체 상세 분석:');
                              console.log('[TmapEmbed] 경로 ' + (index + 1) + ' path 속성들:', Object.keys(path));
                              
                              // path가 배열이 아닌 경우, 내부 구조 확인
                              if (path.coordinates && Array.isArray(path.coordinates)) {
                                console.log('[TmapEmbed] 경로 ' + (index + 1) + ' path.coordinates 발견:', path.coordinates.length, '개');
                                allCoords.push(...path.coordinates);
                              } else if (path.points && Array.isArray(path.points)) {
                                console.log('[TmapEmbed] 경로 ' + (index + 1) + ' path.points 발견:', path.points.length, '개');
                                allCoords.push(...path.points);
                              } else if (path.vertices && Array.isArray(path.vertices)) {
                                console.log('[TmapEmbed] 경로 ' + (index + 1) + ' path.vertices 발견:', path.vertices.length, '개');
                                allCoords.push(...path.vertices);
                              }
                            }
                          }
                        } else {
                          console.warn('[TmapEmbed] 경로 ' + (index + 1) + '에 getPath 메서드가 없음');
                          
                          // polyline 자체에서 좌표 찾기 시도
                          if (polyline.coordinates && Array.isArray(polyline.coordinates)) {
                            console.log('[TmapEmbed] 경로 ' + (index + 1) + ' polyline.coordinates 발견:', polyline.coordinates.length, '개');
                            allCoords.push(...polyline.coordinates);
                          } else if (polyline.points && Array.isArray(polyline.points)) {
                            console.log('[TmapEmbed] 경로 ' + (index + 1) + ' polyline.points 발견:', polyline.points.length, '개');
                            allCoords.push(...polyline.points);
                          }
                        }
                      } catch (e) {
                        console.error('[TmapEmbed] 경로 ' + (index + 1) + ' 처리 중 오류:', e);
                      }
                    });
                    
                    // 핀 좌표 추가 - Tmap 공식 메서드 사용
                    markers.forEach((marker, index) => {
                      console.log('[TmapEmbed] 핀 ' + (index + 1) + ' 처리 중...');
                      
                      try {
                        // Tmapv2.Marker의 공식 메서드 사용
                        if (marker && typeof marker.getPosition === 'function') {
                          const position = marker.getPosition();
                          console.log('[TmapEmbed] 핀 ' + (index + 1) + ' getPosition() 반환값:', position);
                          console.log('[TmapEmbed] 핀 ' + (index + 1) + ' getPosition() 타입:', typeof position);
                          
                          // Tmap 내부 객체가 실제로는 Tmapv2.LatLng 객체일 수 있음
                          // 직접 메서드 호출 시도
                          if (position && typeof position.getLat === 'function' && typeof position.getLng === 'function') {
                            try {
                              const lat = position.getLat();
                              const lng = position.getLng();
                              console.log('[TmapEmbed] 핀 ' + (index + 1) + ' getLat/getLng 성공:', { lat, lng });
                              allCoords.push(position);
                            } catch (e) {
                              console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' getLat/getLng 호출 실패:', e);
                            }
                          } else {
                            // Tmap 내부 객체 구조 분석
                            console.log('[TmapEmbed] 핀 ' + (index + 1) + ' position 객체 상세 분석:');
                            if (position && typeof position === 'object') {
                              // 가능한 모든 속성 시도
                              const possibleProps = ['lat', 'lng', 'latitude', 'longitude', 'x', 'y', 'coordinate'];
                              let foundCoord = false;
                              
                              for (const prop of possibleProps) {
                                if (position[prop] !== undefined) {
                                  console.log('[TmapEmbed] 핀 ' + (index + 1) + '에서 속성 발견:', prop, '=', position[prop]);
                                  if (prop === 'lat' || prop === 'latitude') {
                                    // Tmap의 lat/lng이 함수인 경우 함수 호출
                                    let lat, lng;
                                    if (typeof position[prop] === 'function') {
                                      try {
                                        lat = position[prop]();
                                        console.log('[TmapEmbed] 핀 ' + (index + 1) + ' lat 함수 호출 성공:', lat);
                                      } catch (e) {
                                        console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' lat 함수 호출 실패:', e);
                                        lat = undefined;
                                      }
                                    } else {
                                      lat = position[prop];
                                    }
                                    
                                    // lng 값 찾기
                                    if (typeof position.lng === 'function') {
                                      try {
                                        lng = position.lng();
                                        console.log('[TmapEmbed] 핀 ' + (index + 1) + ' lng 함수 호출 성공:', lng);
                                      } catch (e) {
                                        console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' lng 함수 호출 실패:', e);
                                        lng = undefined;
                                      }
                                    } else if (typeof position.longitude === 'function') {
                                      try {
                                        lng = position.longitude();
                                      } catch (e) {
                                        console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' longitude 함수 호출 실패:', e);
                                        lng = undefined;
                                      }
                                    } else {
                                      lng = position.lng || position.longitude || position.y;
                                    }
                                    
                                    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
                                      console.log('[TmapEmbed] 핀 ' + (index + 1) + ' 직접 속성 접근 성공:', { lat, lng });
                                      // Tmapv2.LatLng 객체 생성
                                      const latLng = new Tmapv2.LatLng(lat, lng);
                                      allCoords.push(latLng);
                                      foundCoord = true;
                                      break;
                                    } else {
                                      console.warn('[TmapEmbed] 핀 ' + (index + 1) + '에서 유효하지 않은 좌표:', { lat, lng });
                                    }
                                  }
                                }
                              }
                              
                              if (!foundCoord) {
                                console.warn('[TmapEmbed] 핀 ' + (index + 1) + '에서 좌표를 찾을 수 없음');
                                // 마지막 수단: marker 자체에서 좌표 찾기
                                if (marker.lat !== undefined && marker.lng !== undefined) {
                                  let lat, lng;
                                  if (typeof marker.lat === 'function') {
                                    try {
                                      lat = marker.lat();
                                    } catch (e) {
                                      console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' marker.lat 함수 호출 실패:', e);
                                      lat = undefined;
                                    }
                                  } else {
                                    lat = marker.lat;
                                  }
                                  
                                  if (typeof marker.lng === 'function') {
                                    try {
                                      lng = marker.lng();
                                    } catch (e) {
                                      console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' marker.lng 함수 호출 실패:', e);
                                      lng = undefined;
                                    }
                                  } else {
                                    lng = marker.lng;
                                  }
                                  
                                  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
                                    console.log('[TmapEmbed] 핀 ' + (index + 1) + ' marker 직접 속성 성공:', { lat, lng });
                                    const latLng = new Tmapv2.LatLng(lat, lng);
                                    allCoords.push(latLng);
                                  }
                                } else if (marker.latitude !== undefined && marker.longitude !== undefined) {
                                  let lat, lng;
                                  if (typeof marker.latitude === 'function') {
                                    try {
                                      lat = marker.latitude();
                                    } catch (e) {
                                      console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' marker.latitude 함수 호출 실패:', e);
                                      lat = undefined;
                                    }
                                  } else {
                                    lat = marker.latitude;
                                  }
                                  
                                  if (typeof marker.longitude === 'function') {
                                    try {
                                      lng = marker.longitude();
                                    } catch (e) {
                                      console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' marker.longitude 함수 호출 실패:', e);
                                      lng = undefined;
                                    }
                                  } else {
                                    lng = marker.longitude;
                                  }
                                  
                                  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
                                    console.log('[TmapEmbed] 핀 ' + (index + 1) + ' marker latitude/longitude 성공:', { lat, lng });
                                    const latLng = new Tmapv2.LatLng(lat, lng);
                                    allCoords.push(latLng);
                                  }
                                }
                              }
                            } else {
                              console.warn('[TmapEmbed] 핀 ' + (index + 1) + ' getPosition() 반환값이 유효하지 않음:', position);
                            }
                          }
                        } else {
                          console.warn('[TmapEmbed] 핀 ' + (index + 1) + '에 getPosition 메서드가 없음');
                        }
                      } catch (e) {
                        console.error('[TmapEmbed] 핀 ' + (index + 1) + ' 처리 중 오류:', e);
                      }
                    });
                    
                    console.log('[TmapEmbed] 수집된 총 좌표:', allCoords.length, allCoords);
                    
                    if (allCoords.length > 0) {
                      // 경계 계산
                      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
                      allCoords.forEach((coord, index) => {
                        try {
                          console.log('[TmapEmbed] 좌표 ' + index + ' 분석:', coord, '타입:', typeof coord);
                          
                          if (coord && typeof coord.getLat === 'function' && typeof coord.getLng === 'function') {
                            // Tmapv2.LatLng 객체인 경우
                            try {
                              const lat = coord.getLat();
                              const lng = coord.getLng();
                              if (!isNaN(lat) && !isNaN(lng)) {
                                minLat = Math.min(minLat, lat);
                                maxLat = Math.max(maxLat, lat);
                                minLng = Math.min(minLng, lng);
                                maxLng = Math.max(maxLng, lng);
                                console.log('[TmapEmbed] 좌표 ' + index + ' getLat/getLng 성공:', { lat, lng });
                              } else {
                                console.warn('[TmapEmbed] 좌표 ' + index + '에서 NaN 값 발견:', { lat, lng });
                              }
                            } catch (e) {
                              console.warn('[TmapEmbed] 좌표 ' + index + ' getLat/getLng 호출 실패:', e);
                            }
                          } else if (coord && coord.lat !== undefined && coord.lng !== undefined) {
                            // 일반 객체 형태
                            let lat, lng;
                            if (typeof coord.lat === 'function') {
                              try {
                                lat = coord.lat();
                              } catch (e) {
                                console.warn('[TmapEmbed] 좌표 ' + index + ' coord.lat 함수 호출 실패:', e);
                                lat = undefined;
                              }
                            } else {
                              lat = parseFloat(coord.lat);
                            }
                            
                            if (typeof coord.lng === 'function') {
                              try {
                                lng = coord.lng();
                              } catch (e) {
                                console.warn('[TmapEmbed] 좌표 ' + index + ' coord.lng 함수 호출 실패:', e);
                                lng = undefined;
                              }
                            } else {
                              lng = parseFloat(coord.lng);
                            }
                            
                            if (!isNaN(lat) && !isNaN(lng)) {
                              minLat = Math.min(minLat, lat);
                              maxLat = Math.max(maxLat, lat);
                              minLng = Math.min(minLng, lng);
                              maxLng = Math.max(maxLng, lng);
                              console.log('[TmapEmbed] 좌표 ' + index + ' 직접 속성 성공:', { lat, lng });
                            } else {
                              console.warn('[TmapEmbed] 좌표 ' + index + ' 파싱 실패:', { lat, lng });
                            }
                          } else {
                            console.warn('[TmapEmbed] 좌표 ' + index + '가 유효하지 않음:', coord);
                          }
                        } catch (e) {
                          console.error('[TmapEmbed] 좌표 ' + index + ' 처리 중 오류:', e);
                        }
                      });
                      
                      console.log('[TmapEmbed] 계산된 경계:', { minLat, maxLat, minLng, maxLng });
                      
                      // 유효한 경계가 있는지 확인
                      if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
                        console.error('[TmapEmbed] 경계 계산 실패 - NaN 값 발견');
                        return;
                      }
                      
                      // 중심점 계산
                      const centerLat = (minLat + maxLat) / 2;
                      const centerLng = (minLng + maxLng) / 2;
                      
                      // 줌 레벨 계산
                      const latDiff = maxLat - minLat;
                      const lngDiff = maxLng - minLng;
                      const maxDiff = Math.max(latDiff, lngDiff);
                      
                      let zoom = 14;
                      if (maxDiff > 1) zoom = 9;
                      else if (maxDiff > 0.5) zoom = 10;
                      else if (maxDiff > 0.2) zoom = 11;
                      else if (maxDiff > 0.1) zoom = 12;
                      else if (maxDiff > 0.05) zoom = 13;
                      
                      console.log('[TmapEmbed] 뷰맞춤 설정:', { centerLat, centerLng, zoom, maxDiff, latDiff, lngDiff });
                      
                      // 지도 중심과 줌 설정
                      if (map && typeof map.setCenter === 'function' && typeof map.setZoom === 'function') {
                        map.setCenter(new Tmapv2.LatLng(centerLat, centerLng));
        map.setZoom(zoom);
                        console.log('[TmapEmbed] 뷰맞춤 완료 - 지도 업데이트됨');
                      } else {
                        console.error('[TmapEmbed] map 객체에 setCenter 또는 setZoom 메서드가 없음:', map);
                      }
                    } else {
                      console.warn('[TmapEmbed] 뷰맞춤할 좌표가 없음');
                    }
                  } catch (e) {
                    console.error('[TmapEmbed] 뷰맞춤 중 오류:', e);
                  }
                } else {
                  console.log('[TmapEmbed] 뷰맞춤 건너뜀 - 경로나 핀이 없음');
                }
                
                console.log('[TmapEmbed] drawRoute 완료');
                return true;
                
              } catch (error) {
                console.error('[TmapEmbed] drawRoute 오류:', error);
                return false;
              }
            }

            // 맵 전역 이벤트(hover 대체) — 마우스 위치 기준 최근접 세그먼트/마커 강조
            function installGlobalInteraction(fromInit) {
              if (!map || typeof Tmapv2 === 'undefined') { console.log('[TmapEmbed] installGlobalInteraction skipped (map not ready)'); return; }
              console.log('[TmapEmbed] installGlobalInteraction', { fromInit, alreadyBound: !!installGlobalInteraction._bound });

              const getLatSafe = (p) => {
                try { if (p && typeof p.getLat === 'function') return p.getLat(); if (p && p.lat) return (typeof p.lat === 'function') ? p.lat() : p.lat; } catch(e){}
                return NaN;
              };
              const getLngSafe = (p) => {
                try { if (p && typeof p.getLng === 'function') return p.getLng(); if (p && p.lng) return (typeof p.lng === 'function') ? p.lng() : p.lng; } catch(e){}
                return NaN;
              };

              const toLatLngFromDom = (px, py) => {
                try {
                  if (map && typeof map.screenToLatLng === 'function') return map.screenToLatLng(px, py);
                  if (map && typeof map.fromPointToLatLng === 'function') return map.fromPointToLatLng({ x: px, y: py });
                  if (map && typeof map.getProjection === 'function') {
                    const proj = map.getProjection();
                    if (proj && typeof proj.fromContainerPixelToLatLng === 'function') return proj.fromContainerPixelToLatLng(new Tmapv2.Point(px, py));
                    if (proj && typeof proj.fromDivPixelToLatLng === 'function') return proj.fromDivPixelToLatLng(new Tmapv2.Point(px, py));
                    if (proj && typeof proj.fromPointToLatLng === 'function') return proj.fromPointToLatLng(new Tmapv2.Point(px, py));
                  }
                } catch(e) {}
                return null;
              };

              // DOM overlay layer to draw tooltip/badge without SDK events
              const ensureOverlay = () => {
                const root = document.getElementById('map');
                if (!root) return null;
                if (!overlayLayer) {
                  overlayLayer = document.createElement('div');
                  overlayLayer.style.position = 'absolute';
                  overlayLayer.style.inset = '0';
                  overlayLayer.style.pointerEvents = 'none';
                  overlayLayer.style.zIndex = '9999';
                  root.appendChild(overlayLayer);
                }
                if (!overlayBadge) {
                  overlayBadge = document.createElement('div');
                  overlayBadge.style.position = 'absolute';
                  overlayBadge.style.transform = 'translate(-50%, -100%)';
                  overlayBadge.style.background = 'rgba(0,0,0,0.75)';
                  overlayBadge.style.color = '#fff';
                  overlayBadge.style.padding = '4px 8px';
                  overlayBadge.style.borderRadius = '8px';
                  overlayBadge.style.fontSize = '12px';
                  overlayBadge.style.boxShadow = '0 2px 8px rgba(0,0,0,.25)';
                  overlayBadge.style.display = 'none';
                  overlayLayer.appendChild(overlayBadge);
                }
                if (!overlayTip) {
                  overlayTip = document.createElement('div');
                  overlayTip.style.position = 'absolute';
                  overlayTip.style.transform = 'translate(-50%, -120%)';
                  overlayTip.style.background = '#111';
                  overlayTip.style.color = '#fff';
                  overlayTip.style.padding = '6px 8px';
                  overlayTip.style.borderRadius = '8px';
                  overlayTip.style.fontSize = '12px';
                  overlayTip.style.boxShadow = '0 2px 8px rgba(0,0,0,.25)';
                  overlayTip.style.display = 'none';
                  overlayLayer.appendChild(overlayTip);
                }
                return overlayLayer;
              };

              const showNearest = (evt) => {
                // 호버 기능 비활성화 (성능 최적화)
                return;
                try {
                  const pos = evt && (evt.latLng || evt._latlng || evt._latLng);
                  let lat, lng;
                  const container = document.getElementById('map');
                  if (!container) return;
                  const rect = container.getBoundingClientRect();
                  const cx = (evt.clientX !== undefined ? evt.clientX : 0) - rect.left;
                  const cy = (evt.clientY !== undefined ? evt.clientY : 0) - rect.top;
                  if (pos) {
                    lat = getLatSafe(pos); lng = getLngSafe(pos);
                  } else {
                    const ll = toLatLngFromDom(cx, cy);
                    if (!ll) return;
                    lat = getLatSafe(ll); lng = getLngSafe(ll);
                  }
                  if (isNaN(lat) || isNaN(lng)) return;

                  const layer = ensureOverlay();
                  if (!layer) return;

                  // Projection: Web Mercator approximation
                  const zoom = (typeof map.getZoom === 'function') ? map.getZoom() : 14;
                  const center = (typeof map.getCenter === 'function') ? map.getCenter() : { lat: 37.5665, lng: 126.978 };
                  const worldScale = 256 * Math.pow(2, zoom);
                  const project = (lt, lg) => {
                    const x = (lg + 180) / 360 * worldScale;
                    const siny = Math.sin(lt * Math.PI / 180);
                    const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * worldScale;
                    return { x, y };
                  };
                  const cLat = (center && (center.getLat ? center.getLat() : (center.lat ? center.lat() : center._lat))) ?? 37.5665;
                  const cLng = (center && (center.getLng ? center.getLng() : (center.lng ? center.lng() : center._lng))) ?? 126.978;
                  const c = project(cLat, cLng);
                  const toPx = (lt, lg) => {
                    const p = project(lt, lg);
                    return { x: (p.x - c.x) + rect.width / 2, y: (p.y - c.y) + rect.height / 2 };
                  };

                  // Nearest marker
                  let bestM = null; let bestMd = Infinity; let bestMPx = null;
                  for (let i=0;i<markerInteracts.length;i++) {
                    const p = markerInteracts[i].position;
                    const ml = p && (p.lat ? p.lat() : p._lat);
                    const mg = p && (p.lng ? p.lng() : p._lng);
                    if (ml == null || mg == null) continue;
                    const pp = toPx(ml, mg);
                    const d = Math.hypot(pp.x - cx, pp.y - cy);
                    if (d < bestMd) { bestMd = d; bestM = markerInteracts[i]; bestMPx = pp; }
                  }
                  if (bestM && bestMd < 48) {
                    overlayTip.textContent = (bestM.address || '') + (bestM.label ? ' · ' + bestM.label : '');
                    overlayTip.style.left = bestMPx.x + 'px';
                    overlayTip.style.top = bestMPx.y + 'px';
                    overlayTip.style.display = 'block';
                    lastMarkerKey = bestM.address + '|' + bestM.label;
                  } else {
                    overlayTip.style.display = 'none';
                    lastMarkerKey = null;
                  }

                  // Nearest segment by mid point
                  let bestS = null; let bestSd = Infinity; let bestSPx = null;
                  for (let i=0;i<segmentInteracts.length;i++) {
                    const cpos = segmentInteracts[i].center;
                    const sl = cpos && (cpos.lat ? cpos.lat() : cpos._lat);
                    const sg = cpos && (cpos.lng ? cpos.lng() : cpos._lng);
                    if (sl == null || sg == null) continue;
                    const sp = toPx(sl, sg);
                    const d = Math.hypot(sp.x - cx, sp.y - cy);
                    if (d < bestSd) { bestSd = d; bestS = segmentInteracts[i]; bestSPx = sp; }
                  }
                  if (bestS && bestSd < 72) {
                    const meta = (window.__segmentSummary && window.__segmentSummary[bestS.metaIdx]) || null;
                    // meta가 없으면 텍스트 기본값
                    overlayBadge.textContent = meta && meta.distM ? (meta.distM/1000).toFixed(1) + 'km · ' + Math.round(meta.timeSec/60) + '분' : ('구간 ' + (bestS.metaIdx + 1));
                    overlayBadge.style.left = bestSPx.x + 'px';
                    overlayBadge.style.top = bestSPx.y + 'px';
                    overlayBadge.style.display = 'block';
                    try { bestS.line.setStrokeWeight(10); } catch(e){}
                    lastSegmentKey = String(bestS.metaIdx);
                  } else {
                    overlayBadge.style.display = 'none';
                    lastSegmentKey = null;
                  }
                } catch(e) { console.warn('global hover error', e); }
              };

              // 클릭/탭 기반 토글: 가장 가까운 마커/세그먼트를 찾아 같은 대상이면 숨김, 아니면 표시
              const toggleNearest = (evt) => {
                try {
                  const container = document.getElementById('map');
                  if (!container) return;
                  const rect = container.getBoundingClientRect();
                  const cx = (evt.clientX !== undefined ? evt.clientX : 0) - rect.left;
                  const cy = (evt.clientY !== undefined ? evt.clientY : 0) - rect.top;

                  const zoom = (typeof map.getZoom === 'function') ? map.getZoom() : 14;
                  const center = (typeof map.getCenter === 'function') ? map.getCenter() : { lat: 37.5665, lng: 126.978 };
                  const worldScale = 256 * Math.pow(2, zoom);
                  const project = (lt, lg) => { const x = (lg + 180) / 360 * worldScale; const siny = Math.sin(lt * Math.PI / 180); const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * worldScale; return { x, y }; };
                  const cLat = (typeof center === 'object') ? ( (center.getLat ? center.getLat() : (center.lat ? center.lat() : (center._lat ?? 37.5665))) ) : 37.5665;
                  const cLng = (typeof center === 'object') ? ( (center.getLng ? center.getLng() : (center.lng ? center.lng() : (center._lng ?? 126.978))) ) : 126.978;
                  const c = project(cLat, cLng);
                  const toPx = (lt, lg) => { const p = project(lt, lg); return { x: (p.x - c.x) + rect.width / 2, y: (p.y - c.y) + rect.height / 2 }; };

                  // 소스 배열 결정 (window에 노출된 참조가 최신일 수 있음)
                  const MI = (window.markerInteracts && window.markerInteracts.length) ? window.markerInteracts : markerInteracts;
                  const SI = (window.segmentInteracts && window.segmentInteracts.length) ? window.segmentInteracts : segmentInteracts;

                  // nearest marker
                  let bestM = null; let bestMd = Infinity; let bestMPx = null;
                  for (let i=0;i<MI.length;i++) {
                    const p = MI[i].position; 
                    const ml = p && (p.lat ? p.lat() : p._lat); 
                    const mg = p && (p.lng ? p.lng() : p._lng);
                    if (ml == null || mg == null) continue;
                    const pp = toPx(ml, mg); const d = Math.hypot(pp.x - cx, pp.y - cy);
                    if (d < bestMd) { bestMd = d; bestM = MI[i]; bestMPx = pp; }
                  }

                  // nearest segment by mid
                  let bestS = null; let bestSd = Infinity; let bestSPx = null;
                  for (let i=0;i<SI.length;i++) {
                    const cp = SI[i].center; 
                    const sl = cp && (cp.lat ? cp.lat() : cp._lat); 
                    const sg = cp && (cp.lng ? cp.lng() : cp._lng);
                    if (sl == null || sg == null) continue;
                    const sp = toPx(sl, sg); const d = Math.hypot(sp.x - cx, sp.y - cy);
                    if (d < bestSd) { bestSd = d; bestS = SI[i]; bestSPx = sp; }
                  }

                  const layer = ensureOverlay(); if (!layer) return;
                  // console.log('[TmapEmbed] toggleNearest', { cx, cy, bestMd, bestSd, hasM: !!bestM, hasS: !!bestS, miLen: MI.length, siLen: SI.length });

                  if (bestM && bestMd < 96) {
                    const key = (bestM.address || '') + '|' + (bestM.label || '');
                    if (lastMarkerKey === key && overlayTip && overlayTip.style.display === 'block') {
                      overlayTip.style.display = 'none'; 
                      lastMarkerKey = null; return;
                    }
                    overlayTip.textContent = (bestM.address || '') + (bestM.label ? ' · ' + bestM.label : '');
                    overlayTip.style.left = bestMPx.x + 'px'; overlayTip.style.top = bestMPx.y + 'px'; overlayTip.style.display = 'block';
                    lastMarkerKey = key;
                    return; // 마커 우선 토글
                  }

                  if (bestS) {
                    const key = String(bestS.metaIdx);
                    const meta = (window.__segmentSummary && window.__segmentSummary[bestS.metaIdx]) || null;
                    if (lastSegmentKey === key && overlayBadge && overlayBadge.style.display === 'block') {
                      overlayBadge.style.display = 'none'; lastSegmentKey = null; return;
                    }
                    overlayBadge.textContent = meta && meta.distM ? (meta.distM/1000).toFixed(1) + 'km · ' + Math.round(meta.timeSec/60) + '분' : ('구간 ' + (bestS.metaIdx + 1));
                    overlayBadge.style.left = bestSPx.x + 'px'; overlayBadge.style.top = bestSPx.y + 'px'; overlayBadge.style.display = 'block';
                    try { bestS.line.setStrokeWeight(10); } catch(e){}
                    lastSegmentKey = key;
                  }
                } catch(e) { console.warn('toggleNearest error', e); }
              };

              const hideAll = () => {
                // 클릭으로 고정된 툴팁/배지가 있으면 숨기지 않음
                if (lastMarkerKey || lastSegmentKey) {
                  return;
                }
                
                try { if (overlayTip) overlayTip.style.display = 'none'; } catch(e){}
                try { if (overlayBadge) overlayBadge.style.display = 'none'; } catch(e){}
                segmentInteracts.forEach(si => { try { si.line.setStrokeWeight(7); } catch(e){} });
              };

              // 바인딩 (한 번만)
              const bind = (target, type, handler) => {
                try {
                  if (Tmapv2.Event && typeof Tmapv2.Event.addListener === 'function') { Tmapv2.Event.addListener(target, type, handler); return true; }
                } catch(e) {}
                return false;
              };
              if (!(installGlobalInteraction._bound)) {
                const mapEl = document.getElementById('map');
                const ok1 = bind(map, 'mousemove', showNearest) || (mapEl && mapEl.addEventListener('mousemove', showNearest, { capture: true, passive: true }));
                const ok2 = bind(map, 'mouseover', showNearest) || (mapEl && mapEl.addEventListener('mouseover', showNearest, { capture: true, passive: true }));
                const ok3 = bind(map, 'mouseout', hideAll) || (mapEl && mapEl.addEventListener('mouseout', hideAll, { capture: true, passive: true }));
                const ok4 = bind(map, 'click', toggleNearest) || (mapEl && mapEl.addEventListener('click', toggleNearest, { capture: true, passive: false }));

                // 최후 수단: 문서 전역 리스너(캡처 단계)로 좌표 계산
                let rafId = null;
                const docMove = (e) => {
                  const el = document.getElementById('map');
                  if (!el) return;
                  const r = el.getBoundingClientRect();
                  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
                  if (!inside) { hideAll(); return; }
                  if (rafId) cancelAnimationFrame(rafId);
                  rafId = requestAnimationFrame(() => showNearest(e));
                };
                const docLeave = (e) => { hideAll(); };
                document.addEventListener('mousemove', docMove, true);
                document.addEventListener('mouseleave', docLeave, true);
                document.addEventListener('click', toggleNearest, true);
                try { window.toggleNearest = toggleNearest; console.log('[TmapEmbed] toggleNearest exported'); } catch(e){}
                installGlobalInteraction._bound = true;
              }
            }
            try { installGlobalInteraction(false); } catch (e) { console.warn('[TmapEmbed] installGlobalInteraction failed at module tail', e); }
            
            function createPinIcon(label, etaLabel, riskColor) {
              const canvas = document.createElement('canvas');
              canvas.width = 70;
              canvas.height = 56;
              const ctx = canvas.getContext('2d');
              if (!ctx) return '';

              const etaText = etaLabel || '';
              if (etaText) {
                const bg = riskColor || '#22C55E';
                drawRoundedRect(ctx, 9, 0, 52, 19, 9, bg);
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = 1;
                drawRoundedRect(ctx, 9, 0, 52, 19, 9, null, true);
                ctx.fillStyle = '#F9FAFB';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(etaText, 35, 9);
              }
              
              // 원형 배경
              ctx.fillStyle = '#3B82F6';
              ctx.beginPath();
              ctx.arc(35, 36, 16, 0, 2 * Math.PI);
              ctx.fill();
              
              // 흰색 테두리
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 2;
              ctx.stroke();
              
              // 텍스트
              ctx.fillStyle = '#FFFFFF';
              ctx.font = 'bold 11px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, 35, 36);
              
              return canvas.toDataURL();
            }

            function drawRoundedRect(ctx, x, y, w, h, r, fillColor, strokeOnly) {
              const rr = Math.min(r, h / 2, w / 2);
              ctx.beginPath();
              ctx.moveTo(x + rr, y);
              ctx.lineTo(x + w - rr, y);
              ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
              ctx.lineTo(x + w, y + h - rr);
              ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
              ctx.lineTo(x + rr, y + h);
              ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
              ctx.lineTo(x, y + rr);
              ctx.quadraticCurveTo(x, y, x + rr, y);
              ctx.closePath();
              if (strokeOnly) {
                ctx.stroke();
              } else {
                ctx.fillStyle = fillColor;
                ctx.fill();
              }
            }

            function createDirectionArrowIcon(angle) {
              const canvas = document.createElement('canvas');
              canvas.width = 24;
              canvas.height = 24;
              const ctx = canvas.getContext('2d');
              if (!ctx) return '';
              ctx.translate(12, 12);
              ctx.rotate((angle * Math.PI) / 180);

              // 가시성 확보용 배경원
              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.beginPath();
              ctx.arc(0, 0, 9, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = 'rgba(124,58,237,0.45)';
              ctx.lineWidth = 1.2;
              ctx.stroke();

              ctx.fillStyle = 'rgba(124,58,237,0.95)';
              ctx.beginPath();
              ctx.moveTo(6.5, 0);
              ctx.lineTo(-4.5, -4);
              ctx.lineTo(-4.5, 4);
              ctx.closePath();
              ctx.fill();
              return canvas.toDataURL();
            }
            
            // Tmapv2 로딩 대기 시작
            waitForTmap();
  </script>
</body>
      </html>
    `;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}

