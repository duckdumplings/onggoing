import { NextResponse } from 'next/server'

export async function GET() {
  const appKey = process.env.NEXT_PUBLIC_TMAP_API_KEY || ''
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tmap Embed</title>
  <style>html,body,#map{height:100%;margin:0;padding:0}</style>
  <script>
    // document.write로 삽입되는 하위 스크립트 URL을 동일 출처 프록시로 교체해 크로스사이트 파서 차단을 회피
    (function(){
      var originalWrite = document.write;
      document.write = function(html){
        try {
          html = String(html).replace(/https:\/\/topopentile\d+\.tmap\.co\.kr[^"']+/g, function(m){
            return '/api/tmap-proxy?u=' + encodeURIComponent(m);
          });
        } catch (e) {}
        return originalWrite.call(document, html);
      };
    })();
  </script>
  <script src="https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${appKey}"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = null; var polylines = []; var markers = [];
    function clearMap(){polylines.forEach(function(p){p.setMap(null)});markers.forEach(function(m){m.setMap(null)});polylines=[];markers=[]}
    function drawRoute(routeData){ if(!routeData) return; var features=routeData.features||[]; var T=window.Tmapv2; clearMap(); var firstCoord=null; features.forEach(function(feature){var coords=feature&&feature.geometry&&feature.geometry.coordinates; if(!coords||!coords.length) return; var flat=Array.isArray(coords[0][0])?coords.flat(1):coords; var path=flat.map(function(c){return new T.LatLng(c[1],c[0])}); var poly=new T.Polyline({path:path,strokeColor:'#FF1744',strokeWeight:5,map:map}); polylines.push(poly); if(path.length>0){markers.push(new T.Marker({position:path[0],map:map})); markers.push(new T.Marker({position:path[path.length-1],map:map})); if(!firstCoord) firstCoord=flat[0];}}); if(firstCoord){ map.setCenter(new T.LatLng(firstCoord[1], firstCoord[0]))}}
    function ensureMap(center){ if(map||!window.Tmapv2) return; var T=window.Tmapv2; var c=center||{lat:37.566535,lng:126.9779692}; map=new T.Map(document.getElementById('map'),{center:new T.LatLng(c.lat,c.lng), width:'100%', height:'100%', zoom:14, zoomControl:true, scrollwheel:true}); }
    window.addEventListener('message', function(ev){ try{ var data=ev.data||{}; if(data.type==='init'){ ensureMap(data.center) } else if(data.type==='route'){ ensureMap(data.center); drawRoute(data.routeData)} } catch(e){} });
    if(window.Tmapv2) ensureMap();
  </script>
</body>
</html>`
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}


