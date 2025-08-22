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
            let markers = [];
            
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
                
                // 메시지 리스너 설정
                window.addEventListener('message', handleMessage);
                
                // 초기화 완료 메시지
                window.parent.postMessage({ type: 'mapReady' }, '*');
                
              } catch (error) {
                console.error('[TmapEmbed] Map initialization failed:', error);
                window.parent.postMessage({ type: 'mapError', error: error.message }, '*');
              }
            }
            
            function handleMessage(event) {
              try {
                console.log('[TmapEmbed] Message received:', event.data);
                const { type, routeData, center, waypoints } = event.data;
                
                switch (type) {
                  case 'init':
                    console.log('[TmapEmbed] Handling init message:', { center, map: !!map });
                    if (center && map) {
                      map.setCenter(new Tmapv2.LatLng(center.lat, center.lng));
                      console.log('[TmapEmbed] Map center updated');
                    }
                    break;
                    
                  case 'route':
                    console.log('[TmapEmbed] Handling route message:', { routeData: !!routeData, waypoints: !!waypoints, waypointsCount: waypoints?.length });
                    if (routeData || waypoints) {
                      drawRoute(routeData, waypoints);
                    } else {
                      console.log('[TmapEmbed] No route data or waypoints provided');
                    }
                    break;
                    
                  default:
                    console.log('[TmapEmbed] Unknown message type:', type);
                }
              } catch (error) {
                console.error('[TmapEmbed] Message handling error:', error);
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
                
                // 기존 마커 제거
                if (markers.length > 0) {
                  console.log('[TmapEmbed] 기존 마커 제거 중:', markers.length);
                  markers.forEach(marker => {
                    try {
                      if (marker && typeof marker.setMap === 'function') {
                        marker.setMap(null);
                      }
                    } catch (e) {
                      console.warn('[TmapEmbed] 마커 제거 중 오류:', e);
                    }
                  });
                  markers = [];
                }
                
                // 기존 경로 제거
                if (routePolylines.length > 0) {
                  console.log('[TmapEmbed] 기존 경로 제거 중:', routePolylines.length);
                  routePolylines.forEach(polyline => {
                    try {
                      if (polyline && typeof polyline.setMap === 'function') {
                        polyline.setMap(null);
                      }
                    } catch (e) {
                      console.warn('[TmapEmbed] 경로 제거 중 오류:', e);
                    }
                  });
                  routePolylines = [];
                }
                
                // 경로 그리기 (routeData가 있을 때만)
                if (routeData && routeData.features && routeData.features.length > 0) {
                  console.log('[TmapEmbed] 경로 그리기 시작:', routeData.features.length, '개 feature');
                  
                  routeData.features.forEach((feature, index) => {
                    if (feature.geometry && feature.geometry.coordinates) {
                      const path = feature.geometry.coordinates.map(coord => 
                        new Tmapv2.LatLng(coord[1], coord[0])
                      );
                      
                      const polyline = new Tmapv2.Polyline({
                        path: path,
                        strokeColor: "#FF0000",
                        strokeWeight: 6,
                        strokeOpacity: 0.8,
                        map: map
                      });
                      
                      routePolylines.push(polyline); // 개별 polyline을 배열에 추가
                      console.log('[TmapEmbed] Feature ' + (index + 1) + ' 경로 추가됨:', path.length, '개 좌표');
                    }
                  });
                  
                  console.log('[TmapEmbed] 경로 그리기 완료');
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
                        icon: createPinIcon(point.label || String(index + 1)),
                        map: map
                      });
                      
                      markers.push(marker);
                      console.log('[TmapEmbed] 핀 ' + (index + 1) + ' 추가됨:', { lat: point.lat, lng: point.lng, label: point.label });
                    } else {
                      console.warn('[TmapEmbed] Waypoint ' + (index + 1) + ' 좌표 누락:', point);
                    }
                  });
                  console.log('[TmapEmbed] 핀 그리기 완료:', markers.length, '개 핀');
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
                
              } catch (error) {
                console.error('[TmapEmbed] drawRoute 오류:', error);
              }
            }
            
            function createPinIcon(label) {
              const canvas = document.createElement('canvas');
              canvas.width = 40;
              canvas.height = 40;
              const ctx = canvas.getContext('2d');
              
              // 원형 배경
              ctx.fillStyle = '#3B82F6';
              ctx.beginPath();
              ctx.arc(20, 20, 18, 0, 2 * Math.PI);
              ctx.fill();
              
              // 흰색 테두리
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 2;
              ctx.stroke();
              
              // 텍스트
              ctx.fillStyle = '#FFFFFF';
              ctx.font = 'bold 12px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, 20, 20);
              
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

