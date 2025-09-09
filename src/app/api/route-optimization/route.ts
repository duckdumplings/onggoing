import { NextRequest, NextResponse } from 'next/server';

// 좌표 유효성 검사 함수 추가
function isValidCoordinate(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng);
}

// 거리 계산 정확성 검증 함수 추가
function validateDistanceCalculation(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
  calculatedDistance: number
): boolean {
  const haversineDistance = haversineMeters(start.latitude, start.longitude, end.latitude, end.longitude);
  const tolerance = 0.1; // 10% 허용 오차
  const difference = Math.abs(calculatedDistance - haversineDistance);
  return difference <= haversineDistance * tolerance;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origins, destinations, vehicleType = '레이', optimizeOrder = true, departureAt, useRealtimeTraffic, deliveryTimes = [], isNextDayFlags = [] } = body;

    console.log('API 요청 받음:', { origins, destinations, vehicleType, deliveryTimes, isNextDayFlags });

    // 배송완료시간 검증 (다음날 체크박스 고려)
    const now = new Date();
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
    const invalidDeliveryTimes = deliveryTimes.filter((time: string, index: number) => {
      if (!time) return false;
      const [hours, minutes] = time.split(':').map(Number);
      const timeInMinutes = hours * 60 + minutes;
      const isNextDay = isNextDayFlags[index] || false;

      // 다음날 체크박스가 체크된 경우: 24시간 후까지 허용
      if (isNextDay) {
        if (timeInMinutes > currentTimeInMinutes + 24 * 60) {
          return true;
        }
        return false;
      }

      // 당일 배송인 경우: 과거 시간 체크 (현재 시간보다 30분 이전)
      if (timeInMinutes < currentTimeInMinutes - 30) {
        return true;
      }

      // 비현실적인 시간 체크 (24시간 후)
      if (timeInMinutes > currentTimeInMinutes + 24 * 60) {
        return true;
      }

      return false;
    });

    if (invalidDeliveryTimes.length > 0) {
      return NextResponse.json(
        { error: '배송완료시간이 과거 시간이거나 비현실적인 시간입니다. 다음날 배송 체크박스를 활용해주세요.' },
        { status: 400 }
      );
    }

    const tmapKey =
      process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY || '';
    if (!tmapKey) {
      return NextResponse.json(
        { error: 'Tmap API 키가 설정되지 않았습니다 (.env.local에 TMAP_API_KEY 또는 NEXT_PUBLIC_TMAP_API_KEY).' },
        { status: 500 }
      );
    }

    // 입력 검증 강화
    if (!origins || !destinations || origins.length === 0 || destinations.length === 0) {
      return NextResponse.json(
        { error: '출발지와 목적지가 필요합니다' },
        { status: 400 }
      );
    }

    // 출발지 좌표 변환 (Tmap 우선, 실패 시 Nominatim)
    const startAddress = typeof origins[0] === 'string' ? origins[0] : (origins[0] as any).name || (origins[0] as any).address;
    let startLocation = (origins[0] as any).latitude && (origins[0] as any).longitude
      ? { latitude: (origins[0] as any).latitude, longitude: (origins[0] as any).longitude, address: startAddress }
      : await geocodeWithTmap(startAddress, tmapKey).catch(() => geocodeWithNominatim(startAddress));

    // 좌표 유효성 검사
    if (!isValidCoordinate(startLocation.latitude, startLocation.longitude)) {
      return NextResponse.json(
        { error: '출발지 좌표가 유효하지 않습니다' },
        { status: 400 }
      );
    }

    console.log('출발지 좌표:', startLocation);

    // 목적지 좌표 변환 (Tmap 우선, 실패 시 Nominatim)
    const destinationCoords = [] as Array<{ latitude: number; longitude: number; address: string }>;
    for (const destination of destinations) {
      const destAddress = typeof destination === 'string' ? destination : ((destination as any).name || (destination as any).address);
      let preset = (destination as any).latitude && (destination as any).longitude
        ? { latitude: (destination as any).latitude, longitude: (destination as any).longitude, address: destAddress }
        : await geocodeWithTmap(destAddress, tmapKey).catch(() => geocodeWithNominatim(destAddress));

      // 좌표 유효성 검사
      if (!isValidCoordinate(preset.latitude, preset.longitude)) {
        console.warn(`목적지 좌표가 유효하지 않음: ${destAddress}`);
        // 기본값으로 서울 시청 좌표 사용
        preset = { latitude: 37.566535, longitude: 126.9779692, address: destAddress };
      }

      destinationCoords.push(preset);
    }

    console.log('모든 목적지 좌표:', destinationCoords);

    // 차량 타입 매핑 (간단 매핑: 레이=1(승용), 스타렉스=2(화물))
    const vehicleTypeCode = vehicleType === '스타렉스' ? '2' : '1';

    // 출발 시각 기반 교통 반영 결정 (토글이 우선)
    const usedTraffic = typeof useRealtimeTraffic === 'boolean'
      ? (useRealtimeTraffic ? 'realtime' : 'standard')
      : decideTrafficMode(departureAt);

    // 목적지 순서 최적화 (배송완료시간 고려)
    const orderedDestinations = optimizeOrder
      ? nearestNeighborOrderWithTimeConstraints(startLocation, destinationCoords, deliveryTimes, isNextDayFlags)
      : destinationCoords;

    const segmentFeatures: any[] = [];
    const waypoints: Array<{ latitude: number; longitude: number }> = [];
    let totalDistance = 0;
    let totalTime = 0;
    let validationErrors: string[] = [];

    let current = startLocation;
    for (const dest of orderedDestinations) {
      const seg = await getTmapRoute(
        { x: current.longitude, y: current.latitude },
        { x: dest.longitude, y: dest.latitude },
        tmapKey,
        {
          vehicleTypeCode,
          trafficInfo: usedTraffic === 'realtime' ? 'Y' : 'N',
          departureAt: departureAt || null
        }
      ).catch((error) => {
        console.warn(`Tmap API 호출 실패: ${error.message}`);
        return null;
      });

      if (seg && Array.isArray(seg.features)) {
        // 거리 계산 정확성 검증
        let segmentDistance = 0;
        let segmentTime = 0;

        for (const f of seg.features) {
          if (f?.properties?.totalDistance) segmentDistance += f.properties.totalDistance;
          if (f?.properties?.totalTime) segmentTime += f.properties.totalTime;
          segmentFeatures.push(f);
        }

        // 거리 계산 검증
        if (!validateDistanceCalculation(current, dest, segmentDistance)) {
          validationErrors.push(`거리 계산 오류: ${current.address} → ${dest.address}`);
          console.warn(`거리 계산 검증 실패: 계산값=${segmentDistance}m, 예상값=${haversineMeters(current.latitude, current.longitude, dest.latitude, dest.longitude)}m`);
        }

        totalDistance += segmentDistance;
        totalTime += segmentTime;
        waypoints.push({ latitude: dest.latitude, longitude: dest.longitude });
      } else {
        // 폴백: 직선 보간 한 구간 추가
        const coordinates = [
          [current.longitude, current.latitude],
          [dest.longitude, dest.latitude],
        ];
        const approx = haversineMeters(current.latitude, current.longitude, dest.latitude, dest.longitude);
        const approxTime = Math.floor(approx / (50 * 1000) * 3600); // 50km/h 가정

        totalDistance += approx;
        totalTime += approxTime;
        segmentFeatures.push({
          type: 'Feature',
          properties: { totalDistance: approx, totalTime: approxTime },
          geometry: { type: 'LineString', coordinates },
        });
        waypoints.push({ latitude: dest.latitude, longitude: dest.longitude });

        console.warn(`Tmap API 실패로 직선 거리 사용: ${current.address} → ${dest.address}`);
      }
      current = dest;
    }

    // 체류시간 계산 (경유지당 5분, 도착지 10분)
    const dwellTimePerWaypoint = 5; // 분
    const dwellTimeAtDestination = 10; // 분
    const totalDwellTime = (destinations.length - 1) * dwellTimePerWaypoint + dwellTimeAtDestination;
    const totalTimeWithDwell = totalTime + totalDwellTime;

    // 최적화된 경유지 순서 정보 생성
    const optimizationInfo = optimizeOrder ? {
      originalOrder: destinations.map((d: any, i: number) => ({ index: i, address: d.address })),
      optimizedOrder: orderedDestinations.map((d: any, i: number) => ({ index: i, address: d.address })),
      distanceSaved: calculateDistanceSavings(startLocation, destinationCoords, orderedDestinations),
    } : null;

    const routeData = {
      type: 'FeatureCollection',
      features: segmentFeatures,
      summary: {
        totalDistance,
        totalTime: totalTimeWithDwell, // 체류시간 포함
        travelTime: totalTime, // 이동시간만
        dwellTime: totalDwellTime, // 체류시간
        optimizeOrder,
        usedTraffic,
        vehicleTypeCode,
        optimizationInfo,
        validation: {
          hasErrors: validationErrors.length > 0,
          errors: validationErrors,
          warnings: validationErrors.length > 0 ? ['일부 경로에서 Tmap API 실패로 직선 거리 사용됨'] : []
        }
      },
      waypoints,
    };

    // 최적화 실행 결과 저장 로직 제거 - 고도화 필요로 인한 일시 중단
    // 추후 견적서 PDF/모달 생성 시에만 이력 저장 예정

    return NextResponse.json({
      success: true,
      data: routeData,
      warnings: validationErrors.length > 0 ? validationErrors : undefined
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

// Tmap 자동차 경로안내 (타임머신 기능 포함)
async function getTmapRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  appKey: string,
  opts?: { vehicleTypeCode?: string; trafficInfo?: 'Y' | 'N'; departureAt?: string | null }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    // 출발시간이 설정된 경우 타임머신 API 사용
    if (opts?.departureAt) {
      const url = 'https://apis.openapi.sk.com/tmap/routes/prediction?version=1';

      // ISO 8601 형식으로 변환 (예: 2024-12-01T14:00:00+0900)
      // 입력된 시간을 한국 시간대로 직접 변환
      const departureDate = new Date(opts.departureAt);

      // 한국 시간대로 변환 (YYYY-MM-DDTHH:MM:SS+0900)
      const year = departureDate.getFullYear();
      const month = String(departureDate.getMonth() + 1).padStart(2, '0');
      const day = String(departureDate.getDate()).padStart(2, '0');
      const hours = String(departureDate.getHours()).padStart(2, '0');
      const minutes = String(departureDate.getMinutes()).padStart(2, '0');
      const seconds = String(departureDate.getSeconds()).padStart(2, '0');

      const predictionTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+0900`;

      const body = {
        routesInfo: {
          departure: {
            name: 'start',
            lon: String(start.x),
            lat: String(start.y)
          },
          destination: {
            name: 'end',
            lon: String(end.x),
            lat: String(end.y)
          },
          predictionType: 'departure',
          predictionTime: predictionTime
        }
      };

      console.log('타임머신 API 호출:', {
        predictionTime,
        originalTime: opts.departureAt,
        departureDate: departureDate.toISOString(),
        localTime: departureDate.toString()
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          appKey: appKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Tmap prediction failed: ${res.status}`);
      const result = await res.json();

      console.log('타임머신 API 응답:', {
        status: res.status,
        featuresCount: result.features?.length,
        totalTime: result.features?.[0]?.properties?.totalTime
      });

      return result;
    } else {
      // 실시간 교통정보 사용 시 기존 API
      const url = 'https://apis.openapi.sk.com/tmap/routes';
      const body: any = {
        startX: String(start.x),
        startY: String(start.y),
        endX: String(end.x),
        endY: String(end.y),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: opts?.trafficInfo === 'N' ? '1' : '0',
        trafficInfo: opts?.trafficInfo ?? 'Y',
        vehicleType: opts?.vehicleTypeCode ?? '1',
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { appKey: appKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Tmap route failed: ${res.status}`);
      const result = await res.json();

      console.log('일반 API 응답:', {
        status: res.status,
        featuresCount: result.features?.length,
        trafficInfo: body.trafficInfo,
        searchOption: body.searchOption
      });

      return result;
    }
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

function decideTrafficMode(departureAt?: string | null): 'realtime' | 'standard' {
  if (!departureAt) return 'realtime'
  try {
    const dep = new Date(departureAt)
    const now = new Date()
    // 오늘 ±12시간 범위는 실시간, 그 외는 standard
    const diff = dep.getTime() - now.getTime()
    const twelveHours = 12 * 3600 * 1000
    return Math.abs(diff) <= twelveHours ? 'realtime' : 'standard'
  } catch {
    return 'realtime'
  }
}

function nearestNeighborOrderWithTimeConstraints(
  start: { latitude: number; longitude: number },
  points: Array<{ latitude: number; longitude: number; address: string }>,
  deliveryTimes: string[],
  isNextDayFlags: boolean[] = []
) {
  // 배송완료시간이 있는 목적지들을 시간순으로 정렬 (다음날 체크박스 고려)
  const timeConstrainedPoints = points
    .map((point, index) => ({
      ...point,
      deliveryTime: deliveryTimes[index] || null,
      isNextDay: isNextDayFlags[index] || false,
      originalIndex: index
    }))
    .filter(point => point.deliveryTime)
    .sort((a, b) => {
      const timeA = a.deliveryTime!.split(':').map(Number);
      const timeB = b.deliveryTime!.split(':').map(Number);
      let minutesA = timeA[0] * 60 + timeA[1];
      let minutesB = timeB[0] * 60 + timeB[1];

      // 다음날 체크박스가 체크된 경우 24시간(1440분) 추가
      if (a.isNextDay) minutesA += 24 * 60;
      if (b.isNextDay) minutesB += 24 * 60;

      // 다음날 배송인 경우: 오름차순 정렬 (이른 시간이 먼저)
      // 당일 배송인 경우: 내림차순 정렬 (늦은 시간이 먼저)
      if (a.isNextDay && b.isNextDay) {
        return minutesA - minutesB; // 다음날 배송끼리는 오름차순
      } else if (!a.isNextDay && !b.isNextDay) {
        return minutesB - minutesA; // 당일 배송끼리는 내림차순
      } else {
        return minutesA - minutesB; // 다음날이 당일보다 나중
      }
    });

  // 배송완료시간이 없는 목적지들
  const unconstrainedPoints = points
    .map((point, index) => ({
      ...point,
      deliveryTime: deliveryTimes[index] || null,
      originalIndex: index
    }))
    .filter(point => !point.deliveryTime);

  // 시간 제약이 없는 목적지들에 대해 최근접 이웃 알고리즘 적용
  const remaining = [...unconstrainedPoints];
  const ordered: typeof points = [];
  let cur = { lat: start.latitude, lng: start.longitude };

  // 시간 제약이 있는 목적지들을 먼저 배치
  for (const point of timeConstrainedPoints) {
    ordered.push({
      latitude: point.latitude,
      longitude: point.longitude,
      address: point.address
    });
    cur = { lat: point.latitude, lng: point.longitude };
  }

  // 나머지 목적지들에 대해 최근접 이웃 알고리즘 적용
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const d = haversineMeters(cur.lat, cur.lng, p.latitude, p.longitude);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1);
    ordered.push({
      latitude: chosen.latitude,
      longitude: chosen.longitude,
      address: chosen.address
    });
    cur = { lat: chosen.latitude, lng: chosen.longitude };
  }

  console.log('배송완료시간 고려한 최적화 결과:', {
    timeConstrained: timeConstrainedPoints.map(p => ({ address: p.address, time: p.deliveryTime })),
    unconstrained: unconstrainedPoints.map(p => ({ address: p.address })),
    finalOrder: ordered.map(p => ({ address: p.address }))
  });

  return ordered;
}

function nearestNeighborOrder(
  start: { latitude: number; longitude: number },
  points: Array<{ latitude: number; longitude: number; address: string }>
) {
  const remaining = [...points]
  const ordered: typeof points = []
  let cur = { lat: start.latitude, lng: start.longitude }
  while (remaining.length) {
    let bestIdx = 0
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]
      const d = haversineMeters(cur.lat, cur.lng, p.latitude, p.longitude)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1)
    ordered.push(chosen)
    cur = { lat: chosen.latitude, lng: chosen.longitude }
  }
  return ordered
}

// 최적화로 절약된 거리 계산
function calculateDistanceSavings(
  start: { latitude: number; longitude: number },
  originalOrder: Array<{ latitude: number; longitude: number; address: string }>,
  optimizedOrder: Array<{ latitude: number; longitude: number; address: string }>
): number {
  // 원래 순서로 계산된 총 거리
  let originalDistance = 0;
  let current = start;

  for (const dest of originalOrder) {
    originalDistance += haversineMeters(current.latitude, current.longitude, dest.latitude, dest.longitude);
    current = dest;
  }

  // 최적화된 순서로 계산된 총 거리
  let optimizedDistance = 0;
  current = start;

  for (const dest of optimizedOrder) {
    optimizedDistance += haversineMeters(current.latitude, current.longitude, dest.latitude, dest.longitude);
    current = dest;
  }

  // 절약된 거리 (미터 단위)
  return Math.max(0, originalDistance - optimizedDistance);
}

export async function GET() {
  return NextResponse.json(
    { message: 'Route optimization API is running' },
    { status: 200 }
  );
} 