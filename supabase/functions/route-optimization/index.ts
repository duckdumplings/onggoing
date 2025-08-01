import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Tmap API 클라이언트
class TmapApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://apis.openapi.sk.com';
  }

  async getMultiRoute(request: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    waypoints: string;
    vehicleType?: string;
    trafficInfo?: string;
  }) {
    const url = `${this.baseUrl}/tmap/routes/pedestrian`;
    const params = new URLSearchParams({
      startX: request.startX.toString(),
      startY: request.startY.toString(),
      endX: request.endX.toString(),
      endY: request.endY.toString(),
      waypoints: request.waypoints,
      vehicleType: request.vehicleType || '1',
      trafficInfo: request.trafficInfo || 'Y',
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      version: '1',
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'appKey': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Tmap API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async geocode(address: string) {
    const url = `${this.baseUrl}/tmap/geo/geocoding`;
    const params = new URLSearchParams({
      version: '1',
      searchKeyword: address,
      searchType: 'all',
      searchtypCd: 'A',
      radius: '1',
      page: '1',
      count: '1',
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'appKey': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Tmap Geocoding error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.searchPoiInfo && data.searchPoiInfo.pois && data.searchPoiInfo.pois.poi.length > 0) {
      const poi = data.searchPoiInfo.pois.poi[0];
      return {
        latitude: parseFloat(poi.frontLat),
        longitude: parseFloat(poi.frontLon),
      };
    }

    throw new Error('Address not found');
  }
}

interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

interface OptimizationRequest {
  origins: Location[];
  destinations: Location[];
  vehicleType: '레이' | '스타렉스';
  constraints?: {
    maxDistance?: number;
    maxTime?: number;
    capacity?: number;
  };
}

// Supabase 클라이언트 생성 함수
function createSupabaseEdgeClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

interface OptimizationResult {
  routes: {
    driverId: string;
    destinations: Location[];
    path: Location[];
    estimatedDistance: number;
    estimatedTime: number;
  }[];
  totalDistance: number;
  totalTime: number;
  optimizationScore: number;
}

serve(async (req: Request) => {
  // CORS 헤더 설정
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  // POST 요청만 허용
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers, status: 405 }
    );
  }

  try {
    const supabase = createSupabaseEdgeClient();
    const requestData: OptimizationRequest = await req.json();

    // 입력 검증
    if (!requestData.origins || !requestData.destinations) {
      return new Response(
        JSON.stringify({ error: 'Origins and destinations are required' }),
        { headers, status: 400 }
      );
    }

    // MVP에서는 기사 정보 대신 기본 차량 정보 사용
    const vehicles = [
      { id: 'vehicle-1', type: '레이', capacity: 1000, is_active: true },
      { id: 'vehicle-2', type: '스타렉스', capacity: 2000, is_active: true }
    ];

    // 경로 최적화 알고리즘 (간단한 버전)
    const optimizedRoutes = await optimizeRoutes(
      requestData.origins,
      requestData.destinations,
      vehicles,
      requestData.vehicleType,
      requestData.constraints
    );

    // 결과를 데이터베이스에 저장 (quote_routes 테이블 사용)
    const { error: saveError } = await supabase
      .from('quote_routes')
      .insert(optimizedRoutes.map(route => ({
        quote_id: null, // 견적 ID는 나중에 연결
        route_name: `Optimized Route ${new Date().toISOString()}`,
        status: 'planned',
        total_distance: route.estimatedDistance,
        total_time: route.estimatedTime,
        vehicle_id: route.driverId, // vehicle_id로 변경
        created_by: req.headers.get('authorization')?.split(' ')[1] || null,
      })));

    if (saveError) {
      console.error('Failed to save routes:', saveError);
    }

    const result: OptimizationResult = {
      routes: optimizedRoutes,
      totalDistance: optimizedRoutes.reduce((sum, route) => sum + route.estimatedDistance, 0),
      totalTime: optimizedRoutes.reduce((sum, route) => sum + route.estimatedTime, 0),
      optimizationScore: calculateOptimizationScore(optimizedRoutes),
    };

    return new Response(JSON.stringify(result), { headers, status: 200 });
  } catch (error) {
    console.error('Route optimization error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers, status: 500 }
    );
  }
});

// 경로 최적화 함수 (Tmap API 사용)
async function optimizeRoutes(
  origins: Location[],
  destinations: Location[],
  vehicles: any[],
  vehicleType: '레이' | '스타렉스',
  constraints?: any
): Promise<OptimizationResult['routes']> {
  const routes: OptimizationResult['routes'] = [];
  const availableVehicles = vehicles.filter(vehicle =>
    vehicle.is_active && vehicle.type === vehicleType
  );

  // Tmap API 클라이언트 생성
  const tmapApiKey = Deno.env.get('TMAP_API_KEY') || '';
  const tmapClient = new TmapApiClient(tmapApiKey);

  // 각 차량에게 배정할 목적지 수 계산
  const destinationsPerVehicle = Math.ceil(destinations.length / availableVehicles.length);

  for (const vehicle of availableVehicles) {
    const startIndex = routes.length * destinationsPerVehicle;
    const endIndex = Math.min(startIndex + destinationsPerVehicle, destinations.length);
    const assignedDestinations = destinations.slice(startIndex, endIndex);

    if (assignedDestinations.length > 0) {
      try {
        // 주소를 좌표로 변환
        const originCoords = await tmapClient.geocode(origins[0].address);

        // 경유지 생성 (첫 번째 목적지를 제외한 나머지)
        const waypoints = assignedDestinations.slice(1)
          .map(dest => `${dest.longitude},${dest.latitude}`)
          .join(';');

        // Tmap API로 경로 계산
        const routeResponse = await tmapClient.getMultiRoute({
          startX: originCoords.longitude,
          startY: originCoords.latitude,
          endX: assignedDestinations[0].longitude,
          endY: assignedDestinations[0].latitude,
          waypoints,
          vehicleType: '1', // 자동차
          trafficInfo: 'Y',
        });

        // 경로 정보 추출
        const totalDistance = routeResponse.features.reduce((sum: number, feature: any) => {
          return sum + (feature.properties.totalDistance || 0);
        }, 0);

        const totalTime = routeResponse.features.reduce((sum: number, feature: any) => {
          return sum + (feature.properties.totalTime || 0);
        }, 0);

        routes.push({
          driverId: vehicle.id,
          destinations: assignedDestinations,
          path: [origins[0], ...assignedDestinations],
          estimatedDistance: totalDistance,
          estimatedTime: totalTime,
        });

      } catch (error) {
        console.error(`Tmap API error for vehicle ${vehicle.id}:`, error);

        // API 실패 시 기본 계산 사용
        const estimatedDistance = calculateDistance(origins[0], assignedDestinations[0]);
        const estimatedTime = estimatedDistance * 2; // km당 2분 가정

        routes.push({
          driverId: vehicle.id,
          destinations: assignedDestinations,
          path: [origins[0], ...assignedDestinations],
          estimatedDistance,
          estimatedTime,
        });
      }
    }
  }

  return routes;
}

// 거리 계산 함수 (Haversine formula)
function calculateDistance(point1: Location, point2: Location): number {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
  const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 최적화 점수 계산
function calculateOptimizationScore(routes: OptimizationResult['routes']): number {
  if (routes.length === 0) return 0;

  const totalDistance = routes.reduce((sum, route) => sum + route.estimatedDistance, 0);
  const totalTime = routes.reduce((sum, route) => sum + route.estimatedTime, 0);

  // 간단한 점수 계산 (거리와 시간을 고려)
  const distanceScore = Math.max(0, 100 - totalDistance);
  const timeScore = Math.max(0, 100 - totalTime / 60); // 시간을 시간 단위로 변환

  return (distanceScore + timeScore) / 2;
} 