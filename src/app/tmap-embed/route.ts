import { NextResponse } from 'next/server'

export async function GET() {
  const appKey = process.env.NEXT_PUBLIC_TMAP_API_KEY || ''

  // 디버깅용 로그 (프로덕션에서는 제거 필요)
  console.log('[tmap-embed] API Key exists:', !!appKey)
  console.log('[tmap-embed] API Key length:', appKey.length)
  console.log('[tmap-embed] Process env keys:', Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC')))

  if (!appKey) {
    console.error('[tmap-embed] TMAP API key not found in environment variables')
    return new NextResponse('TMAP API key not configured', { status: 500 })
  }

  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tmap Embed</title>
  <style>html,body,#map{height:100%;margin:0;padding:0}</style>
  <!-- SDK를 먼저 로드하고, 내부 document.write가 호출되기 전 전역 훅으로 마커 생성 차단 -->
  <script src="https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${appKey}"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = null; var polylines = []; var markers = []; var infoWindows = [];
    var pendingCenter = null; var pendingRoute = null; var pendingWaypoints = null;
    function clearMap(){
      polylines.forEach(function(p){p.setMap(null)});
      markers.forEach(function(m){m.setMap(null)});
      infoWindows.forEach(function(w){ try{ w.setMap(null) }catch(e){} });
      polylines=[];markers=[];infoWindows=[];
    }
    function badge(latLng, text){
      return new window.Tmapv2.InfoWindow({ position: latLng, content: '<div style="background:#1f2937;color:#fff;border-radius:12px;padding:2px 6px;font-size:12px;">'+text+'</div>', type: 2, map: map });
    }
    function drawRoute(routeData, waypoints){
      if(!routeData) return; var features=routeData.features||[]; var T=window.Tmapv2; clearMap();
      var minLat=90, maxLat=-90, minLng=180, maxLng=-180;
      for(var i=0;i<features.length;i++){
        var f=features[i]; var coords=f&&f.geometry&&f.geometry.coordinates; if(!coords||!coords.length) continue;
        var flat=Array.isArray(coords[0][0])?coords.flat(1):coords; var path=flat.map(function(c){
          var lat=c[1], lng=c[0];
          if(lat<minLat)minLat=lat; if(lat>maxLat)maxLat=lat; if(lng<minLng)minLng=lng; if(lng>maxLng)maxLng=lng;
          return new T.LatLng(lat,lng)
        });
        polylines.push(new T.Polyline({path:path,strokeColor:'#FF1744',strokeWeight:5,map:map}));
      }
      // 숫자 배지는 경유지 개수만큼만 출력
      if(Array.isArray(waypoints)){
        for(var j=0;j<waypoints.length;j++){
          var w=waypoints[j];
          if(typeof w.lat==='number' && typeof w.lng==='number'){
            var ll=new T.LatLng(w.lat,w.lng);
            infoWindows.push(badge(ll, String(j+1)));
            if(w.lat<minLat)minLat=w.lat; if(w.lat>maxLat)maxLat=w.lat; if(w.lng<minLng)minLng=w.lng; if(w.lng>maxLng)maxLng=w.lng;
          }
        }
      }
      // 뷰 맞춤: 경계 기반 중심/줌 설정 (간이 구현)
      if(isFinite(minLat) && isFinite(maxLat) && isFinite(minLng) && isFinite(maxLng)){
        var centerLat=(minLat+maxLat)/2; var centerLng=(minLng+maxLng)/2;
        var span=Math.max(maxLat-minLat, maxLng-minLng);
        var zoom=14; if(span>1) zoom=9; else if(span>0.5) zoom=10; else if(span>0.2) zoom=11; else if(span>0.1) zoom=12; else if(span>0.05) zoom=13; else zoom=14;
        map.setCenter(new T.LatLng(centerLat, centerLng));
        map.setZoom(zoom);
      }
    }
    function ensureMap(center){
      pendingCenter = center || pendingCenter;
      if(map){ return; }
      if(!window.Tmapv2){
        // SDK 로드 대기 후 재시도
        return setTimeout(function(){ ensureMap(pendingCenter); }, 50);
      }
      var T=window.Tmapv2; var c=pendingCenter||{lat:37.566535,lng:126.9779692};
      map=new T.Map(document.getElementById('map'),{center:new T.LatLng(c.lat,c.lng), width:'100%', height:'100%', zoom:14, zoomControl:true, scrollwheel:true});
      // 초기 pending 데이터가 있으면 그리기
      if(pendingRoute){ drawRoute(pendingRoute, pendingWaypoints); }
    }
    window.addEventListener('message', function(ev){ try{ var data=ev.data||{}; if(data.type==='init'){ pendingCenter=data.center||pendingCenter; ensureMap(pendingCenter) } else if(data.type==='route'){ pendingCenter=data.center||pendingCenter; pendingRoute=data.routeData; pendingWaypoints=data.waypoints||[]; ensureMap(pendingCenter); if(map){ drawRoute(pendingRoute, pendingWaypoints) } } } catch(e){} });
    // SDK가 이미 로드되어 있으면 즉시 초기화
    if(window.Tmapv2) ensureMap();
  </script>
</body>
</html>`
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}

