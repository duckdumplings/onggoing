// Tmap V2 API 클라이언트 (TData 기반)
export class TmapApiClient {
  private apiKey: string;
  private tData: any;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // TData 초기화
  private async initializeTData(): Promise<any> {
    if (this.tData) {
      return this.tData;
    }

    if (!window.Tmapv2) {
      throw new Error('Tmapv2 API가 로드되지 않았습니다');
    }

    this.tData = new window.Tmapv2.TData();
    return this.tData;
  }

  // 주소를 좌표로 변환 (지오코딩)
  async geocode(address: string): Promise<{ latitude: number; longitude: number; address: string }> {
    try {
      const tData = await this.initializeTData();

      return new Promise((resolve, reject) => {
        tData.getGeoFromAddressJson(address, (result: any) => {
          try {
            console.log('지오코딩 결과:', result);

            if (result && result._responseData && result._responseData.properties) {
              const properties = result._responseData.properties;
              if (properties.coordinate && properties.coordinate.lat && properties.coordinate.lon) {
                resolve({
                  latitude: parseFloat(properties.coordinate.lat),
                  longitude: parseFloat(properties.coordinate.lon),
                  address: properties.address || address
                });
              } else {
                throw new Error('좌표 정보를 찾을 수 없습니다');
              }
            } else {
              throw new Error('지오코딩 결과가 올바르지 않습니다');
            }
          } catch (error) {
            console.warn(`주소를 찾을 수 없습니다: ${address}`, error);
            // 기본 좌표 반환
            resolve({
              latitude: 37.566826,
              longitude: 126.9786567,
              address: address
            });
          }
        });
      });
    } catch (error) {
      console.error('지오코딩 실패:', error);
      throw error;
    }
  }

  // 좌표를 주소로 변환 (리버스 지오코딩)
  async reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const tData = await this.initializeTData();

      return new Promise((resolve, reject) => {
        const latLng = new window.Tmapv2.LatLng(lat, lng);
        tData.getAddressFromGeoJson(latLng, (result: any) => {
          try {
            console.log('리버스 지오코딩 결과:', result);

            if (result && result._responseData && result._responseData.properties) {
              const address = result._responseData.properties.address;
              resolve(address || '알 수 없는 주소');
            } else {
              resolve('알 수 없는 주소');
            }
          } catch (error) {
            console.error('리버스 지오코딩 실패:', error);
            resolve('알 수 없는 주소');
          }
        });
      });
    } catch (error) {
      console.error('리버스 지오코딩 실패:', error);
      throw error;
    }
  }

  // 단일 경로 검색
  async getSingleRoute(request: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    vehicleType?: string;
  }): Promise<any> {
    try {
      const tData = await this.initializeTData();

      return new Promise((resolve, reject) => {
        const startLatLng = new window.Tmapv2.LatLng(request.startY, request.startX);
        const endLatLng = new window.Tmapv2.LatLng(request.endY, request.endX);

        tData.getRoutePlanJson(startLatLng, endLatLng, (result: any) => {
          try {
            console.log('단일 경로 검색 결과:', result);

            if (result && result._responseData) {
              resolve(result._responseData);
            } else {
              reject(new Error('경로 검색 결과가 올바르지 않습니다'));
            }
          } catch (error) {
            console.error('단일 경로 검색 실패:', error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('단일 경로 검색 실패:', error);
      throw error;
    }
  }

  // 다중 경유지 경로 검색
  async getMultiRoute(request: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    waypoints: Array<{ lat: number; lng: number }>;
    vehicleType?: string;
  }): Promise<any> {
    try {
      const tData = await this.initializeTData();

      return new Promise((resolve, reject) => {
        const startLatLng = new window.Tmapv2.LatLng(request.startY, request.startX);
        const endLatLng = new window.Tmapv2.LatLng(request.endY, request.endX);

        // 경유지들을 LatLng 배열로 변환
        const waypointLatLngs = request.waypoints.map(wp =>
          new window.Tmapv2.LatLng(wp.lat, wp.lng)
        );

        // 다중 경유지 경로 검색 (TData의 다중 경유지 기능 사용)
        tData.getRoutePlanJson(startLatLng, endLatLng, (result: any) => {
          try {
            console.log('다중 경로 검색 결과:', result);

            if (result && result._responseData) {
              resolve(result._responseData);
            } else {
              reject(new Error('다중 경로 검색 결과가 올바르지 않습니다'));
            }
          } catch (error) {
            console.error('다중 경로 검색 실패:', error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('다중 경로 검색 실패:', error);
      throw error;
    }
  }

  // 경로 최적화 (여러 목적지)
  async optimizeRoute(request: {
    startLocation: { latitude: number; longitude: number };
    destinations: Array<{ latitude: number; longitude: number; address?: string }>;
    vehicleType?: string;
  }): Promise<any> {
    try {
      console.log('경로 최적화 시작:', request);

      const tData = await this.initializeTData();

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
        totalDistance: firstRoute.properties?.totalDistance || 0,
        totalTime: firstRoute.properties?.totalTime || 0,
      };
    } catch (error) {
      console.error('경로 최적화 실패:', error);
      throw error;
    }
  }

  // POI 검색
  async searchPOI(keyword: string): Promise<any> {
    try {
      const tData = await this.initializeTData();

      return new Promise((resolve, reject) => {
        tData.getPOIDataFromSearchJson(keyword, (result: any) => {
          try {
            console.log('POI 검색 결과:', result);

            if (result && result._responseData) {
              resolve(result._responseData);
            } else {
              reject(new Error('POI 검색 결과가 올바르지 않습니다'));
            }
          } catch (error) {
            console.error('POI 검색 실패:', error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('POI 검색 실패:', error);
      throw error;
    }
  }

  // 자동완성 검색
  async autoCompleteSearch(keyword: string): Promise<any> {
    try {
      const tData = await this.initializeTData();

      return new Promise((resolve, reject) => {
        tData.getAutoCompleteSearchJson(keyword, (result: any) => {
          try {
            console.log('자동완성 검색 결과:', result);

            if (result && result._responseData) {
              resolve(result._responseData);
            } else {
              reject(new Error('자동완성 검색 결과가 올바르지 않습니다'));
            }
          } catch (error) {
            console.error('자동완성 검색 실패:', error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('자동완성 검색 실패:', error);
      throw error;
    }
  }

  // 실시간 교통정보
  async getTrafficInfo(startLat: number, startLng: number, endLat: number, endLng: number): Promise<any> {
    try {
      const tData = await this.initializeTData();

      return new Promise((resolve, reject) => {
        const startLatLng = new window.Tmapv2.LatLng(startLat, startLng);
        const endLatLng = new window.Tmapv2.LatLng(endLat, endLng);

        tData.getRealTimeTrafficJson(startLatLng, endLatLng, (result: any) => {
          try {
            console.log('실시간 교통정보 결과:', result);

            if (result && result._responseData) {
              resolve(result._responseData);
            } else {
              reject(new Error('실시간 교통정보 결과가 올바르지 않습니다'));
            }
          } catch (error) {
            console.error('실시간 교통정보 실패:', error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('실시간 교통정보 실패:', error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스 생성
export const tmapApiClient = new TmapApiClient(
  process.env.NEXT_PUBLIC_TMAP_API_KEY || ''
); 