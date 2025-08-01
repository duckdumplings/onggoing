import { NextRequest, NextResponse } from 'next/server';
import { tmapApiClient } from '@/libs/tmap-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origins, destinations, vehicleType } = body;

    console.log('API 요청 받음:', { origins, destinations, vehicleType });

    // 입력 검증
    if (!origins || !destinations || origins.length === 0 || destinations.length === 0) {
      return NextResponse.json(
        { error: '출발지와 목적지가 필요합니다' },
        { status: 400 }
      );
    }

    // 출발지 주소를 좌표로 변환
    console.log('출발지 Geocoding 시작:', origins[0].address);
    const startLocation = await tmapApiClient.geocode(origins[0].address);
    console.log('출발지 좌표:', startLocation);

    // 목적지 주소들을 좌표로 변환
    console.log('목적지 Geocoding 시작');
    const destinationCoords = await Promise.all(
      destinations.map(async (dest: { address: string }, index: number) => {
        try {
          console.log(`목적지 ${index + 1} Geocoding:`, dest.address);
          const coords = await tmapApiClient.geocode(dest.address);
          console.log(`목적지 ${index + 1} 좌표:`, coords);
          return coords;
        } catch (error) {
          console.error(`목적지 ${index + 1} Geocoding 실패:`, dest.address, error);
          // 기본 좌표 반환 (서울)
          return { latitude: 37.5665, longitude: 126.9780, address: dest.address };
        }
      })
    );

    console.log('모든 목적지 좌표:', destinationCoords);

    // 경로 최적화 실행
    console.log('경로 최적화 시작');
    const optimizationResult = await tmapApiClient.optimizeRoute({
      startLocation,
      destinations: destinationCoords,
      vehicleType: vehicleType === '스타렉스' ? '5' : '1', // 1: 자동차, 5: 트럭
    });

    console.log('경로 최적화 결과:', optimizationResult);

    // 결과 포맷팅
    const formattedResult = {
      route: {
        type: 'FeatureCollection',
        features: optimizationResult.routes.map((route: any, index: number) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: route.features?.[0]?.geometry?.coordinates || []
          },
          properties: {
            totalDistance: route.features?.reduce((sum: number, feature: any) =>
              sum + (feature.properties?.totalDistance || 0), 0) || 0,
            totalTime: route.features?.reduce((sum: number, feature: any) =>
              sum + (feature.properties?.totalTime || 0), 0) || 0,
            index
          }
        }))
      },
      totalDistance: optimizationResult.totalDistance,
      totalTime: optimizationResult.totalTime,
      optimizedOrder: Array.from({ length: destinations.length }, (_, i) => i), // 순서대로
    };

    console.log('포맷된 결과:', formattedResult);

    return NextResponse.json({
      success: true,
      data: formattedResult,
    });

  } catch (error) {
    console.error('Route optimization error:', error);
    return NextResponse.json(
      {
        success: false,
        error: '경로 최적화에 실패했습니다',
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