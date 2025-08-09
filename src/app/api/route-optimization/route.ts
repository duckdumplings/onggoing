import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origins, destinations, vehicleType = '레이' } = body;

    console.log('API 요청 받음:', { origins, destinations, vehicleType });

    const tmapKey =
      process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY || '';
    if (!tmapKey) {
      return NextResponse.json(
        { error: 'Tmap API 키가 설정되지 않았습니다 (.env.local에 TMAP_API_KEY 또는 NEXT_PUBLIC_TMAP_API_KEY).'},
        { status: 500 }
      );
    }

    // 입력 검증
    if (!origins || !destinations || origins.length === 0 || destinations.length === 0) {
      return NextResponse.json(
        { error: '출발지와 목적지가 필요합니다' },
        { status: 400 }
      );
    }

    // 출발지 좌표 변환 (Tmap 우선, 실패 시 Nominatim)
    const startAddress = typeof origins[0] === 'string' ? origins[0] : origins[0].address;
    const startLocation = await geocodeWithTmap(startAddress, tmapKey).catch(() => geocodeWithNominatim(startAddress));
    console.log('출발지 좌표:', startLocation);

    // 목적지 좌표 변환 (Tmap 우선, 실패 시 Nominatim)
    const destinationCoords = [] as Array<{ latitude: number; longitude: number; address: string }>;
    for (const destination of destinations) {
      const destAddress = typeof destination === 'string' ? destination : destination.address;
      const coord = await geocodeWithTmap(destAddress, tmapKey).catch(() => geocodeWithNominatim(destAddress));
      destinationCoords.push(coord);
    }

    console.log('모든 목적지 좌표:', destinationCoords);

    // Tmap 자동차 경로안내를 구간별로 호출 (순서 최적화 없음, 입력 순서대로)
    const segmentFeatures: any[] = [];
    let totalDistance = 0;
    let totalTime = 0;

    let current = startLocation;
    for (const dest of destinationCoords) {
      const seg = await getTmapRoute(
        { x: current.longitude, y: current.latitude },
        { x: dest.longitude, y: dest.latitude },
        tmapKey
      ).catch(() => null);

      if (seg && Array.isArray(seg.features)) {
        // 합산
        for (const f of seg.features) {
          if (f?.properties?.totalDistance) totalDistance += f.properties.totalDistance;
          if (f?.properties?.totalTime) totalTime += f.properties.totalTime;
          segmentFeatures.push(f);
        }
      } else {
        // 폴백: 직선 보간 한 구간 추가
        const coordinates = [
          [current.longitude, current.latitude],
          [dest.longitude, dest.latitude],
        ];
        const approx = haversineMeters(current.latitude, current.longitude, dest.latitude, dest.longitude);
        totalDistance += approx;
        totalTime += Math.floor(approx / (50 * 1000) * 3600); // 50km/h 가정
        segmentFeatures.push({
          type: 'Feature',
          properties: { totalDistance: approx, totalTime: Math.floor(approx / (50 * 1000) * 3600) },
          geometry: { type: 'LineString', coordinates },
        });
      }
      current = dest;
    }

    const routeData = {
      type: 'FeatureCollection',
      features: segmentFeatures,
      summary: { totalDistance, totalTime },
    };

    return NextResponse.json({
      success: true,
      data: routeData
    });

  } catch (error) {
    console.error('경로 최적화 API 오류:', error);
    return NextResponse.json(
      {
        error: '경로 최적화 중 오류가 발생했습니다',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      },
      { status: 500 }
    );
  }
}

// 서버사이드 Nominatim 지오코딩 (백업)
async function geocodeWithNominatim(address: string): Promise<{ latitude: number; longitude: number; address: string }> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'ai-onggoing/1.0 (contact: dev@ongoing.example)'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status} ${response.statusText}`);
    }

    const results = await response.json();
    if (Array.isArray(results) && results.length > 0) {
      const item = results[0];
      return {
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        address: item.display_name || address
      };
    }

    // 실패 시 서울 시청 좌표 기본값
    return { latitude: 37.566535, longitude: 126.9779692, address };
  } catch (e) {
    // 네트워크/기타 에러 시 기본값
    return { latitude: 37.566535, longitude: 126.9779692, address };
  }
}

// 서버사이드 Tmap 지오코딩 (우선)
async function geocodeWithTmap(address: string, appKey: string): Promise<{ latitude: number; longitude: number; address: string }> {
  const url = new URL('https://apis.openapi.sk.com/tmap/geo/geocoding');
  url.searchParams.set('version', '1');
  url.searchParams.set('searchKeyword', address);
  url.searchParams.set('searchType', 'all');
  url.searchParams.set('searchtypCd', 'A');
  url.searchParams.set('radius', '0');
  url.searchParams.set('page', '1');
  url.searchParams.set('count', '1');
  url.searchParams.set('reqCoordType', 'WGS84GEO');
  url.searchParams.set('resCoordType', 'WGS84GEO');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { appKey: appKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Tmap geocoding failed');
  const data = await res.json();
  const poi = data?.searchPoiInfo?.pois?.poi?.[0];
  if (!poi) throw new Error('Address not found');
  return {
    latitude: parseFloat(poi.frontLat),
    longitude: parseFloat(poi.frontLon),
    address: poi.name || address,
  };
}

// Tmap 자동차 경로안내
async function getTmapRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  appKey: string
) {
  const url = 'https://apis.openapi.sk.com/tmap/routes';
  const body = {
    startX: String(start.x),
    startY: String(start.y),
    endX: String(end.x),
    endY: String(end.y),
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    searchOption: '0',
    trafficInfo: 'Y',
    vehicleType: '1',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { appKey: appKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Tmap route failed: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET() {
  return NextResponse.json(
    { message: 'Route optimization API is running' },
    { status: 200 }
  );
} 