// 서버사이드 Tmap API 클라이언트 (HTTP API 기반)
export class TmapServerApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://apis.openapi.sk.com';
  }

  // 주소를 좌표로 변환 (Geocoding)
  async geocode(address: string): Promise<{ latitude: number; longitude: number; address: string }> {
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

    console.log('서버사이드 Geocoding 요청:', `${url}?${params}`);

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'appKey': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    console.log('서버사이드 Geocoding 응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('서버사이드 Geocoding 에러 응답:', errorText);
      throw new Error(`Tmap Geocoding error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('서버사이드 Geocoding 응답 데이터:', data);

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
      latitude: 37.566826,
      longitude: 126.9786567,
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
  }): Promise<any> {
    const url = `${this.baseUrl}/tmap/routes`;

    const requestBody = {
      startX: request.startX.toString(),
      startY: request.startY.toString(),
      endX: request.endX.toString(),
      endY: request.endY.toString(),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      searchOption: '0', // 0: 추천, 1: 최단거리, 2: 최단시간
      trafficInfo: 'Y',
      vehicleType: request.vehicleType || '1'
    };

    console.log('서버사이드 Route 요청:', url, requestBody);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'appKey': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log('서버사이드 Route 응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('서버사이드 Route 에러 응답:', errorText);
      throw new Error(`Tmap API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  // 경로 최적화 (여러 목적지)
  async optimizeRoute(request: {
    startLocation: { latitude: number; longitude: number };
    destinations: Array<{ latitude: number; longitude: number; address?: string }>;
    vehicleType?: string;
  }): Promise<any> {
    try {
      console.log('서버사이드 경로 최적화 시작:', request);

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
        totalDistance: firstRoute.features?.reduce((sum: number, feature: any) =>
          sum + (feature.properties?.totalDistance || 0), 0) || 0,
        totalTime: firstRoute.features?.reduce((sum: number, feature: any) =>
          sum + (feature.properties?.totalTime || 0), 0) || 0,
      };
    } catch (error) {
      console.error('서버사이드 경로 최적화 실패:', error);
      throw error;
    }
  }
}

// 서버사이드 싱글톤 인스턴스 생성
export const tmapServerApiClient = new TmapServerApiClient(
  process.env.NEXT_PUBLIC_TMAP_API_KEY || ''
); 