// 경로 검증 및 리스크 분석 서비스

export interface RouteSegment {
  from: { latitude: number; longitude: number; address: string };
  to: { latitude: number; longitude: number; address: string };
  actualDistance: number; // meters
  actualTime: number; // seconds
  targetDeliveryTime?: Date;
  dwellMinutes?: number;
}

export interface RouteValidationResult {
  segments: RouteSegment[];
  totalDistance: number; // meters
  totalTime: number; // seconds (이동 시간만)
  totalDwellTime: number; // seconds (체류 시간)
  totalTimeWithDwell: number; // seconds (총 시간)
  risks: RiskItem[];
  riskScore: number; // 0-100 (높을수록 위험)
}

export interface RiskItem {
  type: 'TIME_VIOLATION' | 'DISTANCE_MISMATCH' | 'TIME_CRITICAL' | 'SCHEDULE_UNCERTAIN';
  severity: 'high' | 'medium' | 'low';
  message: string;
  details?: Record<string, any>;
}

/**
 * Tmap API를 호출하여 두 지점 간 경로 정보 조회
 */
async function getTmapRouteSegment(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  tmapKey: string,
  vehicleTypeCode: string = '1',
  departureAt?: Date
): Promise<{ distance: number; time: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    let url: string;
    let body: any;

    if (departureAt) {
      // 타임머신 API 사용
      url = 'https://apis.openapi.sk.com/tmap/routes/prediction?version=1';
      const departureDate = new Date(departureAt);
      const year = departureDate.getFullYear();
      const month = String(departureDate.getMonth() + 1).padStart(2, '0');
      const day = String(departureDate.getDate()).padStart(2, '0');
      const hours = String(departureDate.getHours()).padStart(2, '0');
      const minutes = String(departureDate.getMinutes()).padStart(2, '0');
      const seconds = String(departureDate.getSeconds()).padStart(2, '0');
      const predictionTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+0900`;

      body = {
        routesInfo: {
          departure: {
            name: 'start',
            lon: String(from.longitude),
            lat: String(from.latitude),
          },
          destination: {
            name: 'end',
            lon: String(to.longitude),
            lat: String(to.latitude),
          },
          predictionType: 'departure',
          predictionTime: predictionTime,
        },
      };
    } else {
      // 일반 API 사용
      url = 'https://apis.openapi.sk.com/tmap/routes';
      body = {
        startX: String(from.longitude),
        startY: String(from.latitude),
        endX: String(to.longitude),
        endY: String(to.latitude),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: '0',
        trafficInfo: 'Y',
        vehicleType: vehicleTypeCode,
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        appKey: tmapKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Tmap API 오류: ${res.status}`);
    }

    const result = await res.json();

    if (!result.features || !Array.isArray(result.features) || result.features.length === 0) {
      throw new Error('Tmap API에서 경로를 찾을 수 없습니다');
    }

    let totalDistance = 0;
    let totalTime = 0;

    for (const feature of result.features) {
      if (feature.properties?.totalDistance) {
        totalDistance += feature.properties.totalDistance;
      }
      if (feature.properties?.totalTime) {
        totalTime += feature.properties.totalTime;
      }
    }

    return {
      distance: totalDistance,
      time: totalTime,
    };
  } catch (error) {
    console.error('Tmap API 호출 실패:', error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 주소를 좌표로 변환 (간단한 버전, Tmap geocoding 사용)
 */
async function geocodeAddress(address: string, tmapKey: string): Promise<{
  latitude: number;
  longitude: number;
  address: string;
}> {
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
    headers: { appKey: tmapKey, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error('Tmap geocoding failed');
  }

  const data = await res.json();
  const poi = data?.searchPoiInfo?.pois?.poi?.[0];

  if (!poi) {
    throw new Error('주소를 찾을 수 없습니다');
  }

  return {
    latitude: parseFloat(poi.frontLat),
    longitude: parseFloat(poi.frontLon),
    address: poi.name || address,
  };
}

/**
 * 경로 검증 및 리스크 분석
 */
export async function validateRoute(
  origin: { address: string; latitude?: number; longitude?: number },
  destinations: Array<{
    address: string;
    latitude?: number;
    longitude?: number;
    deliveryTime?: string; // HH:mm
    dwellMinutes?: number;
  }>,
  tmapKey: string,
  vehicleType: '레이' | '스타렉스' = '레이',
  departureTime?: Date
): Promise<RouteValidationResult> {
  const vehicleTypeCode = vehicleType === '스타렉스' ? '2' : '1';
  const segments: RouteSegment[] = [];
  const risks: RiskItem[] = [];

  // 출발지 좌표 확보
  let currentLocation: { latitude: number; longitude: number; address: string };
  if (origin.latitude && origin.longitude) {
    currentLocation = {
      latitude: origin.latitude,
      longitude: origin.longitude,
      address: origin.address,
    };
  } else {
    currentLocation = await geocodeAddress(origin.address, tmapKey);
  }

  let currentTime = departureTime || new Date();
  let totalDistance = 0;
  let totalTime = 0;
  let totalDwellTime = 0;

  // 각 목적지에 대해 경로 검증
  for (let i = 0; i < destinations.length; i++) {
    const dest = destinations[i];

    // 목적지 좌표 확보
    let destLocation: { latitude: number; longitude: number; address: string };
    if (dest.latitude && dest.longitude) {
      destLocation = {
        latitude: dest.latitude,
        longitude: dest.longitude,
        address: dest.address,
      };
    } else {
      try {
        destLocation = await geocodeAddress(dest.address, tmapKey);
      } catch (error) {
        risks.push({
          type: 'SCHEDULE_UNCERTAIN',
          severity: 'medium',
          message: `목적지 주소를 찾을 수 없습니다: ${dest.address}`,
          details: { destinationIndex: i, address: dest.address },
        });
        continue;
      }
    }

    // Tmap API로 경로 조회
    try {
      const routeInfo = await getTmapRouteSegment(
        currentLocation,
        destLocation,
        tmapKey,
        vehicleTypeCode,
        currentTime
      );

      const dwellMinutes = dest.dwellMinutes || 0;
      const dwellSeconds = dwellMinutes * 60;

      // 배송 목표 시간 검증
      let targetDeliveryTime: Date | undefined;
      if (dest.deliveryTime) {
        const [hours, minutes] = dest.deliveryTime.split(':').map(Number);
        targetDeliveryTime = new Date(currentTime);
        targetDeliveryTime.setHours(hours, minutes, 0, 0);
        
        // 목표 시간이 출발 시간보다 이전이면 다음 날로 설정
        if (targetDeliveryTime < currentTime) {
          targetDeliveryTime.setDate(targetDeliveryTime.getDate() + 1);
        }
      }

      const estimatedArrival = new Date(currentTime.getTime() + routeInfo.time * 1000);

      // 시간 위반 체크
      if (targetDeliveryTime) {
        const delayMinutes = (estimatedArrival.getTime() - targetDeliveryTime.getTime()) / 60000;
        
        if (delayMinutes > 10) {
          risks.push({
            type: 'TIME_VIOLATION',
            severity: 'high',
            message: `${dest.address} 배송 시간 목표를 ${Math.round(delayMinutes)}분 초과할 가능성이 있습니다`,
            details: {
              destinationIndex: i,
              targetTime: targetDeliveryTime.toISOString(),
              estimatedArrival: estimatedArrival.toISOString(),
              delayMinutes: Math.round(delayMinutes),
            },
          });
        } else if (delayMinutes > 0) {
          risks.push({
            type: 'TIME_CRITICAL',
            severity: 'medium',
            message: `${dest.address} 배송 시간이 촉박합니다 (${Math.round(delayMinutes)}분 여유)`,
            details: {
              destinationIndex: i,
              targetTime: targetDeliveryTime.toISOString(),
              estimatedArrival: estimatedArrival.toISOString(),
              delayMinutes: Math.round(delayMinutes),
            },
          });
        }
      }

      segments.push({
        from: currentLocation,
        to: destLocation,
        actualDistance: routeInfo.distance,
        actualTime: routeInfo.time,
        targetDeliveryTime,
        dwellMinutes,
      });

      totalDistance += routeInfo.distance;
      totalTime += routeInfo.time;
      totalDwellTime += dwellSeconds;

      // 다음 세그먼트를 위한 출발 시간 업데이트
      currentTime = new Date(estimatedArrival.getTime() + dwellSeconds * 1000);
      currentLocation = destLocation;
    } catch (error) {
      risks.push({
        type: 'SCHEDULE_UNCERTAIN',
        severity: 'high',
        message: `${dest.address}로의 경로를 검증할 수 없습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        details: { destinationIndex: i, address: dest.address },
      });
    }
  }

  // 리스크 점수 계산
  const riskScore = calculateRiskScore(risks, totalTime, totalDwellTime);

  return {
    segments,
    totalDistance,
    totalTime,
    totalDwellTime,
    totalTimeWithDwell: totalTime + totalDwellTime,
    risks,
    riskScore,
  };
}

/**
 * 리스크 점수 계산 (0-100, 높을수록 위험)
 */
function calculateRiskScore(risks: RiskItem[], totalTime: number, totalDwellTime: number): number {
  let score = 0;

  // 리스크 항목별 점수 추가
  for (const risk of risks) {
    switch (risk.severity) {
      case 'high':
        score += 25;
        break;
      case 'medium':
        score += 10;
        break;
      case 'low':
        score += 5;
        break;
    }
  }

  // 시간 제약 위반이 많을수록 점수 증가
  const timeViolations = risks.filter(r => r.type === 'TIME_VIOLATION').length;
  score += timeViolations * 15;

  // 점수 제한 (최대 100)
  return Math.min(100, score);
}

