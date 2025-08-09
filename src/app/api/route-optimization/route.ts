import { NextRequest, NextResponse } from 'next/server';
// Tmap 의존성 제거. Nominatim(오픈스트리트맵) 기반 서버사이드 지오코딩으로 대체

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origins, destinations, vehicleType = '레이' } = body;

    console.log('API 요청 받음:', { origins, destinations, vehicleType });

    // 더 이상 Tmap API 키 필요 없음

    // 입력 검증
    if (!origins || !destinations || origins.length === 0 || destinations.length === 0) {
      return NextResponse.json(
        { error: '출발지와 목적지가 필요합니다' },
        { status: 400 }
      );
    }

    // 출발지 좌표 변환 (Nominatim)
    const startAddress = typeof origins[0] === 'string' ? origins[0] : origins[0].address;
    const startLocation = await geocodeWithNominatim(startAddress);
    console.log('출발지 좌표:', startLocation);

    // 목적지 좌표 변환 (Nominatim)
    const destinationCoords = [] as Array<{ latitude: number; longitude: number; address: string }>;
    for (const destination of destinations) {
      const destAddress = typeof destination === 'string' ? destination : destination.address;
      const coord = await geocodeWithNominatim(destAddress);
      destinationCoords.push(coord);
    }

    console.log('모든 목적지 좌표:', destinationCoords);

    // 경로 최적화 실행 (더미 데이터 사용)
    console.log('더미 데이터 사용 (Tmap API 호출은 나중에 구현)');

    // 더 현실적인 더미 데이터 생성 (직선 보간)
    const generateRealisticRoute = (start: any, destinations: any[]) => {
      const routes = [];
      let currentPoint = start;

      for (const dest of destinations) {
        // 실제 거리에 기반한 좌표 생성
        const distance = Math.sqrt(
          Math.pow(dest.longitude - currentPoint.longitude, 2) +
          Math.pow(dest.latitude - currentPoint.latitude, 2)
        );

        // 경로 중간점들 생성 (더 자연스러운 경로)
        const steps = Math.max(3, Math.floor(distance * 100));
        const coordinates = [];

        for (let i = 0; i <= steps; i++) {
          const ratio = i / steps;
          const lat = currentPoint.latitude + (dest.latitude - currentPoint.latitude) * ratio;
          const lng = currentPoint.longitude + (dest.longitude - currentPoint.longitude) * ratio;
          coordinates.push([lng, lat]);
        }

        routes.push({
          type: "Feature",
          properties: {
            totalDistance: Math.floor(distance * 111000), // km 단위로 변환
            totalTime: Math.floor(distance * 111000 / 50), // 시속 50km 가정
          },
          geometry: {
            type: "LineString",
            coordinates: coordinates
          }
        });

        currentPoint = dest;
      }

      return routes;
    };

    const routeFeatures = generateRealisticRoute(startLocation, destinationCoords);
    const totalDistance = routeFeatures.reduce((sum, route) => sum + route.properties.totalDistance, 0);
    const totalTime = routeFeatures.reduce((sum, route) => sum + route.properties.totalTime, 0);

    const routeData = {
      type: "FeatureCollection",
      features: routeFeatures,
      summary: {
        totalDistance: totalDistance,
        totalTime: totalTime
      }
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

// 서버사이드 Nominatim 지오코딩
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

export async function GET() {
  return NextResponse.json(
    { message: 'Route optimization API is running' },
    { status: 200 }
  );
} 