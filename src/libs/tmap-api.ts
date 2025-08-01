// Tmap API 클라이언트
export class TmapApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://apis.openapi.sk.com';
  }

  // 주소를 좌표로 변환 (Geocoding)
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

    console.log('Geocoding 요청:', `${url}?${params}`);

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'appKey': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    console.log('Geocoding 응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Geocoding 에러 응답:', errorText);
      throw new Error(`Tmap Geocoding error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Geocoding 응답 데이터:', data);

    if (data.searchPoiInfo && data.searchPoiInfo.pois && data.searchPoiInfo.pois.poi.length > 0) {
      const poi = data.searchPoiInfo.pois.poi[0];
      return {
        latitude: parseFloat(poi.frontLat),
        longitude: parseFloat(poi.frontLon),
        address: poi.name,
      };
    }

    // 주소를 찾을 수 없는 경우 기본 좌표 반환
    console.warn(`주소를 찾을 수 없습니다: ${address}`);
    return {
      latitude: 37.5665,
      longitude: 126.9780,
      address: address,
    };
  }

  // 단일 경로 검색
  async getSingleRoute(request: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    vehicleType?: string;
    trafficInfo?: string;
  }) {
    const url = `${this.baseUrl}/tmap/routes/pedestrian`;
    const params = new URLSearchParams({
      startX: request.startX.toString(),
      startY: request.startY.toString(),
      endX: request.endX.toString(),
      endY: request.endY.toString(),
      vehicleType: request.vehicleType || '1',
      trafficInfo: request.trafficInfo || 'Y',
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      version: '1',
    });

    console.log('Route 요청:', `${url}?${params}`);

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'appKey': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    console.log('Route 응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Route 에러 응답:', errorText);
      throw new Error(`Tmap API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  // 다중 경유지 경로 검색
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

  // 경로 최적화 (여러 목적지)
  async optimizeRoute(request: {
    startLocation: { latitude: number; longitude: number };
    destinations: Array<{ latitude: number; longitude: number; address?: string }>;
    vehicleType?: string;
  }) {
    try {
      console.log('경로 최적화 시작:', request);

      // 첫 번째 목적지까지의 경로
      const firstRoute = await this.getSingleRoute({
        startX: request.startLocation.longitude,
        startY: request.startLocation.latitude,
        endX: request.destinations[0].longitude,
        endY: request.destinations[0].latitude,
        vehicleType: request.vehicleType,
      });

      // 나머지 목적지들에 대한 경로들
      const additionalRoutes = [];
      for (let i = 0; i < request.destinations.length - 1; i++) {
        const route = await this.getSingleRoute({
          startX: request.destinations[i].longitude,
          startY: request.destinations[i].latitude,
          endX: request.destinations[i + 1].longitude,
          endY: request.destinations[i + 1].latitude,
          vehicleType: request.vehicleType,
        });
        additionalRoutes.push(route);
      }

      return {
        routes: [firstRoute, ...additionalRoutes],
        totalDistance: firstRoute.features.reduce((sum: number, feature: any) =>
          sum + (feature.properties.totalDistance || 0), 0),
        totalTime: firstRoute.features.reduce((sum: number, feature: any) =>
          sum + (feature.properties.totalTime || 0), 0),
      };
    } catch (error) {
      console.error('경로 최적화 실패:', error);
      throw error;
    }
  }

  // 실시간 교통 정보 조회
  async getTrafficInfo(location: { latitude: number; longitude: number }) {
    const url = `${this.baseUrl}/tmap/traffic`;
    const params = new URLSearchParams({
      version: '1',
      centerLat: location.latitude.toString(),
      centerLon: location.longitude.toString(),
      radius: '1000',
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'appKey': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Traffic info error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
}

// 싱글톤 인스턴스 생성
export const tmapApiClient = new TmapApiClient(
  process.env.NEXT_PUBLIC_TMAP_API_KEY || ''
); 