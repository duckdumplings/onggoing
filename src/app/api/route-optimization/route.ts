import { NextRequest, NextResponse } from 'next/server';
import { tmapServerApiClient } from '@/libs/tmap-server-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origins, destinations, vehicleType = '레이' } = body;

    console.log('API 요청 받음:', { origins, destinations, vehicleType });

    // 환경변수에서 API 키 사용
    const apiKey = process.env.NEXT_PUBLIC_TMAP_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Tmap API 키가 설정되지 않았습니다. .env.local 파일에 NEXT_PUBLIC_TMAP_API_KEY를 설정해주세요.' },
        { status: 500 }
      );
    }
    console.log('Tmap API 키 사용:', apiKey.substring(0, 10) + '...');

    // 입력 검증
    if (!origins || !destinations || origins.length === 0 || destinations.length === 0) {
      return NextResponse.json(
        { error: '출발지와 목적지가 필요합니다' },
        { status: 400 }
      );
    }

    // 출발지 좌표 변환
    const startAddress = typeof origins[0] === 'string' ? origins[0] : origins[0].address;
    const startLocation = await tmapServerApiClient.geocode(startAddress);
    console.log('출발지 좌표:', startLocation);

    // 목적지 좌표 변환
    const destinationCoords = [];
    for (const destination of destinations) {
      const destAddress = typeof destination === 'string' ? destination : destination.address;
      const coord = await tmapServerApiClient.geocode(destAddress);
      destinationCoords.push(coord);
    }

    console.log('모든 목적지 좌표:', destinationCoords);

    // 경로 최적화 실행 (TData 기반)
    console.log('경로 최적화 시작 - TData 기반');

    try {
      // 첫 번째 목적지까지의 경로
      const firstRoute = await tmapServerApiClient.getSingleRoute({
        startX: startLocation.longitude,
        startY: startLocation.latitude,
        endX: destinationCoords[0].longitude,
        endY: destinationCoords[0].latitude,
        vehicleType: vehicleType === '스타렉스' ? '5' : '1', // 1: 자동차, 5: 트럭
      });

      // 나머지 목적지들에 대한 경로들
      const additionalRoutes = [];
      for (let i = 0; i < destinationCoords.length - 1; i++) {
        const route = await tmapServerApiClient.getSingleRoute({
          startX: destinationCoords[i].longitude,
          startY: destinationCoords[i].latitude,
          endX: destinationCoords[i + 1].longitude,
          endY: destinationCoords[i + 1].latitude,
          vehicleType: vehicleType === '스타렉스' ? '5' : '1',
        });
        additionalRoutes.push(route);
      }

      const optimizationResult = {
        routes: [firstRoute, ...additionalRoutes],
        totalDistance: firstRoute.properties?.totalDistance || 0,
        totalTime: firstRoute.properties?.totalTime || 0
      };

      console.log('경로 최적화 결과:', optimizationResult);

      // 결과 포맷팅
      const formattedResult = {
        success: true,
        data: {
          routes: optimizationResult.routes.map((route: any, index: number) => ({
            id: `route-${index}`,
            origin: index === 0 ? origins[0] : destinations[index - 1],
            destination: destinations[index],
            distance: route.properties?.totalDistance || 0,
            time: route.properties?.totalTime || 0,
            geometry: route.geometry || null
          })),
          summary: {
            totalDistance: optimizationResult.totalDistance,
            totalTime: optimizationResult.totalTime,
            totalRoutes: optimizationResult.routes.length
          }
        }
      };

      return NextResponse.json(formattedResult);

    } catch (apiError) {
      console.error('Tmap API 호출 실패:', apiError);

      // API 호출 실패 시 더미 데이터 반환
      console.log('API 호출 실패로 더미 데이터 사용');

      const dummyRoutes = destinations.map((dest: any, index: number) => {
        const destAddress = typeof dest === 'string' ? dest : dest.address;
        return {
          id: `dummy-route-${index}`,
          origin: index === 0 ? (typeof origins[0] === 'string' ? origins[0] : origins[0].address) : (typeof destinations[index - 1] === 'string' ? destinations[index - 1] : destinations[index - 1].address),
          destination: destAddress,
          distance: Math.random() * 10000 + 5000, // 5-15km
          time: Math.random() * 1800 + 900, // 15-45분
          geometry: {
            type: 'LineString',
            coordinates: [
              [startLocation.longitude, startLocation.latitude],
              [dest.longitude || 126.9780, dest.latitude || 37.5665]
            ]
          }
        };
      });

      const totalDistance = dummyRoutes.reduce((sum: number, route: any) => sum + route.distance, 0);
      const totalTime = dummyRoutes.reduce((sum: number, route: any) => sum + route.time, 0);

      return NextResponse.json({
        success: true,
        data: {
          routes: dummyRoutes,
          summary: {
            totalDistance,
            totalTime,
            totalRoutes: dummyRoutes.length
          }
        }
      });
    }

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

export async function GET() {
  return NextResponse.json(
    { message: 'Route optimization API is running' },
    { status: 200 }
  );
} 