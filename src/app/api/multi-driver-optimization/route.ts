import { NextRequest, NextResponse } from 'next/server';

interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

interface DriverRoute {
  driverId: string;
  driverIndex: number;
  origin: Location;
  destinations: Location[];
  routeData: any;
  totalDistance: number;
  totalTime: number;
  travelTime: number;
  dwellTime: number;
}

interface MultiDriverOptimizationRequest {
  origin: Location;
  destinations: Location[];
  driverCount: number;
  vehicleType: '레이' | '스타렉스';
  optimizeOrder?: boolean;
  useRealtimeTraffic?: boolean;
  departureAt?: string | null;
  deliveryTimes?: string[];
  isNextDayFlags?: boolean[];
  dwellMinutes?: number[];
}

interface MultiDriverOptimizationResponse {
  success: boolean;
  drivers: DriverRoute[];
  summary: {
    totalDistance: number;
    totalTime: number;
    averageDistance: number;
    averageTime: number;
    balanceScore: number; // 0~1, 1에 가까울수록 균형적
  };
}

// 균등 분배 알고리즘: 경유지를 n등분하여 배송원에게 배정
function distributeDestinations(
  destinations: Location[],
  driverCount: number
): Location[][] {
  const result: Location[][] = [];
  const destinationsPerDriver = Math.ceil(destinations.length / driverCount);

  for (let i = 0; i < driverCount; i++) {
    const startIndex = i * destinationsPerDriver;
    const endIndex = Math.min(startIndex + destinationsPerDriver, destinations.length);
    result.push(destinations.slice(startIndex, endIndex));
  }

  return result;
}

// 균형도 점수 계산 (표준편차 기반)
function calculateBalanceScore(distances: number[]): number {
  if (distances.length === 0) return 0;
  if (distances.length === 1) return 1;

  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length;
  const stdDev = Math.sqrt(variance);

  // 표준편차가 작을수록 균형적 (0~1 스케일)
  const maxStdDev = mean * 0.5; // 최대 표준편차 추정
  const score = Math.max(0, Math.min(1, 1 - (stdDev / maxStdDev)));

  return score;
}

export async function POST(request: NextRequest) {
  console.log('🔥 [Multi-Driver API] POST 요청 시작');
  
  try {
    const body: MultiDriverOptimizationRequest = await request.json();
    const {
      origin,
      destinations,
      driverCount,
      vehicleType,
      optimizeOrder = true,
      useRealtimeTraffic = true,
      departureAt,
      deliveryTimes = [],
      isNextDayFlags = [],
      dwellMinutes = []
    } = body;

    console.log('📥 [Multi-Driver API] 요청 데이터:', {
      driverCount,
      destinationsCount: destinations.length,
      vehicleType
    });

    // 입력 검증
    if (!origin || !destinations || destinations.length === 0) {
      return NextResponse.json(
        { error: '출발지와 목적지가 필요합니다' },
        { status: 400 }
      );
    }

    if (driverCount < 2 || driverCount > 10) {
      return NextResponse.json(
        { error: '배송원 수는 2~10명 사이여야 합니다' },
        { status: 400 }
      );
    }

    if (destinations.length < driverCount) {
      return NextResponse.json(
        { error: `경유지 수(${destinations.length})가 배송원 수(${driverCount})보다 적습니다` },
        { status: 400 }
      );
    }

    // 1단계: 경유지 분배
    const distributedDestinations = distributeDestinations(destinations, driverCount);
    console.log('📊 [Multi-Driver API] 경유지 분배 완료:', {
      배송원별경유지수: distributedDestinations.map((d, i) => `배송원${i + 1}: ${d.length}개`)
    });

    // 2단계: 각 배송원별 경로 최적화 (병렬 처리)
    const driverRoutes: DriverRoute[] = [];
    const optimizationPromises = distributedDestinations.map(async (driverDests, driverIndex) => {
      if (driverDests.length === 0) {
        return null;
      }

      const driverId = `driver-${driverIndex + 1}`;
      console.log(`🚗 [배송원 ${driverId}] 경로 최적화 시작 (${driverDests.length}개 경유지)`);

      try {
        // 기존 route-optimization API 호출
        const response = await fetch(`${request.nextUrl.origin}/api/route-optimization`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origins: [origin],
            destinations: driverDests,
            vehicleType,
            optimizeOrder,
            useRealtimeTraffic,
            departureAt,
            deliveryTimes: driverDests.map((_, idx) => {
              // 원본 destinations 인덱스 찾기
              const originalIdx = destinations.findIndex(d => 
                d.address === driverDests[idx].address &&
                Math.abs(d.latitude - driverDests[idx].latitude) < 0.0001 &&
                Math.abs(d.longitude - driverDests[idx].longitude) < 0.0001
              );
              return originalIdx >= 0 ? (deliveryTimes[originalIdx] || '') : '';
            }),
            isNextDayFlags: driverDests.map((_, idx) => {
              const originalIdx = destinations.findIndex(d => 
                d.address === driverDests[idx].address &&
                Math.abs(d.latitude - driverDests[idx].latitude) < 0.0001 &&
                Math.abs(d.longitude - driverDests[idx].longitude) < 0.0001
              );
              return originalIdx >= 0 ? (isNextDayFlags[originalIdx] || false) : false;
            }),
            dwellMinutes: driverDests.length > 0 
              ? [dwellMinutes[0] || 10, ...driverDests.map((_, idx) => {
                  const originalIdx = destinations.findIndex(d => 
                    d.address === driverDests[idx].address &&
                    Math.abs(d.latitude - driverDests[idx].latitude) < 0.0001 &&
                    Math.abs(d.longitude - driverDests[idx].longitude) < 0.0001
                  );
                  return originalIdx >= 0 ? (dwellMinutes[originalIdx + 1] || 10) : 10;
                })]
              : [dwellMinutes[0] || 10]
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(`❌ [배송원 ${driverId}] 최적화 실패:`, errorData);
          throw new Error(`배송원 ${driverId} 최적화 실패: ${errorData.message || errorData.error || '알 수 없는 오류'}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.data) {
          throw new Error(`배송원 ${driverId} 최적화 실패: 응답 형식 오류`);
        }

        const routeData = data.data;
        const summary = routeData.summary || {};

        const driverRoute: DriverRoute = {
          driverId,
          driverIndex,
          origin,
          destinations: driverDests,
          routeData,
          totalDistance: summary.totalDistance || 0,
          totalTime: summary.totalTime || 0,
          travelTime: summary.travelTime || 0,
          dwellTime: summary.dwellTime || 0
        };

        console.log(`✅ [배송원 ${driverId}] 최적화 완료:`, {
          거리: `${(driverRoute.totalDistance / 1000).toFixed(1)}km`,
          시간: `${Math.round(driverRoute.totalTime / 60)}분`,
          경유지수: driverDests.length
        });

        return driverRoute;
      } catch (error) {
        console.error(`❌ [배송원 ${driverId}] 최적화 오류:`, error);
        throw error;
      }
    });

    // 모든 배송원의 최적화 결과 대기
    const results = await Promise.all(optimizationPromises);
    const validRoutes = results.filter((r): r is DriverRoute => r !== null);

    if (validRoutes.length === 0) {
      return NextResponse.json(
        { error: '모든 배송원의 경로 최적화에 실패했습니다' },
        { status: 500 }
      );
    }

    // 3단계: 요약 통계 계산
    const totalDistance = validRoutes.reduce((sum, r) => sum + r.totalDistance, 0);
    const totalTime = validRoutes.reduce((sum, r) => sum + r.totalTime, 0);
    const distances = validRoutes.map(r => r.totalDistance);
    const times = validRoutes.map(r => r.totalTime);

    const balanceScore = (calculateBalanceScore(distances) + calculateBalanceScore(times)) / 2;

    const response: MultiDriverOptimizationResponse = {
      success: true,
      drivers: validRoutes,
      summary: {
        totalDistance,
        totalTime,
        averageDistance: totalDistance / validRoutes.length,
        averageTime: totalTime / validRoutes.length,
        balanceScore
      }
    };

    console.log('✅ [Multi-Driver API] 모든 배송원 최적화 완료:', {
      배송원수: validRoutes.length,
      총거리: `${(totalDistance / 1000).toFixed(1)}km`,
      총시간: `${Math.round(totalTime / 60)}분`,
      균형도: balanceScore.toFixed(2)
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ [Multi-Driver API] 오류:', error);
    return NextResponse.json(
      {
        error: '다중 배송원 최적화 중 오류가 발생했습니다',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Multi-driver optimization API is running' },
    { status: 200 }
  );
}

