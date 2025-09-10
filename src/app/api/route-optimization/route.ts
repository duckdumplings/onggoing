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
  console.log('🔥 [API] POST 요청 시작');
  try {
    const body = await request.json();
    console.log('📥 [API] 요청 body 파싱 완료');
    const { origins, destinations, vehicleType = '레이', optimizeOrder = true, departureAt, useRealtimeTraffic, deliveryTimes = [], isNextDayFlags = [], dwellMinutes = [] } = body;

    console.log('=== API 요청 받음 ===');
    console.log('origins:', origins);
    console.log('destinations:', destinations);
    console.log('vehicleType:', vehicleType);
    console.log('deliveryTimes:', deliveryTimes);
    console.log('isNextDayFlags:', isNextDayFlags);
    console.log('departureAt:', departureAt);
    console.log('useRealtimeTraffic:', useRealtimeTraffic);
    console.log('========================');

    // 배송완료시간 검증 (다음날 체크박스 고려)
    const now = new Date();
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

    console.log('배송완료시간 검증 시작:', {
      currentTime: now.toLocaleString(),
      currentTimeInMinutes,
      deliveryTimes,
      isNextDayFlags
    });

    const invalidDeliveryTimes = deliveryTimes.filter((time: string, index: number) => {
      if (!time) return false;
      const [hours, minutes] = time.split(':').map(Number);
      const timeInMinutes = hours * 60 + minutes;
      const isNextDay = isNextDayFlags[index] || false;

      console.log(`경유지 ${index} 검증:`, {
        time,
        timeInMinutes,
        isNextDay,
        currentTimeInMinutes,
        timeDifference: timeInMinutes - currentTimeInMinutes
      });

      // 다음날 체크박스가 체크된 경우: 다음날 00:00 ~ 23:59까지 허용
      if (isNextDay) {
        // 다음날 배송은 항상 유효 (00:00 ~ 23:59)
        console.log(`다음날 배송 시간 유효: ${time}`);
        return false;
      }

      // 당일 배송인 경우: 과거 시간 체크 (현재 시간보다 30분 이전)
      if (timeInMinutes < currentTimeInMinutes - 30) {
        console.log(`당일 배송 과거 시간: ${time} (${timeInMinutes}분 < ${currentTimeInMinutes - 30}분)`);
        return true;
      }

      // 비현실적인 시간 체크 (24시간 후)
      if (timeInMinutes > currentTimeInMinutes + 24 * 60) {
        console.log(`당일 배송 시간 초과: ${time} (${timeInMinutes}분 > ${currentTimeInMinutes + 24 * 60}분)`);
        return true;
      }

      console.log(`당일 배송 시간 유효: ${time}`);
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

    console.log('=== 교통 모드 결정 ===');
    console.log('departureAt:', departureAt);
    console.log('useRealtimeTraffic:', useRealtimeTraffic);
    console.log('usedTraffic:', usedTraffic);
    console.log('hasDepartureAt:', !!departureAt);
    console.log('========================');

    // 목적지 순서 최적화 (배송완료시간 고려)
    console.log('순서 최적화 시작:', {
      optimizeOrder,
      deliveryTimes,
      isNextDayFlags,
      originalDestinations: destinationCoords.map(d => d.address)
    });

    let orderedDestinations;
    if (optimizeOrder) {
      console.log('nearestNeighborOrderWithTimeConstraints 함수 호출 시작');
      orderedDestinations = nearestNeighborOrderWithTimeConstraints(startLocation, destinationCoords, deliveryTimes, isNextDayFlags);
      console.log('nearestNeighborOrderWithTimeConstraints 함수 호출 완료');
    } else {
      console.log('순서 최적화 비활성화됨');
      orderedDestinations = destinationCoords;
    }

    console.log('순서 최적화 완료:', {
      originalOrder: destinationCoords.map(d => d.address),
      optimizedOrder: orderedDestinations.map(d => d.address),
      orderChanged: JSON.stringify(destinationCoords) !== JSON.stringify(orderedDestinations)
    });

    const segmentFeatures: any[] = [];
    const waypoints: Array<{ latitude: number; longitude: number }> = [];
    let totalDistance = 0;
    let totalTime = 0;
    let validationErrors: string[] = [];

    let current = startLocation;
    let currentTime = departureAt ? new Date(departureAt) : new Date();

    for (let i = 0; i < orderedDestinations.length; i++) {
      const dest = orderedDestinations[i];

      // 배송완료시간이 있는 경우 해당 시간을 고려한 출발시간 계산
      let segmentDepartureTime = currentTime;
      let targetDeliveryTime = null;

      if (deliveryTimes && deliveryTimes[i]) {
        const deliveryTime = deliveryTimes[i];
        const isNextDay = isNextDayFlags && isNextDayFlags[i];

        if (deliveryTime) {
          const [hours, minutes] = deliveryTime.split(':').map(Number);
          const deliveryDateTime = new Date(currentTime);

          if (isNextDay) {
            // 다음날 배송인 경우
            deliveryDateTime.setDate(deliveryDateTime.getDate() + 1);
          }

          deliveryDateTime.setHours(hours, minutes, 0, 0);
          targetDeliveryTime = deliveryDateTime;

          // 배송완료시간까지 도착해야 하므로, 반복 계산으로 정확한 출발시간 계산
          segmentDepartureTime = await calculateAccurateDepartureTime(
            current,
            dest,
            deliveryDateTime,
            tmapKey,
            vehicleTypeCode,
            usedTraffic,
            vehicleType
          );
        }
      }

      console.log('=== Tmap API 호출 ===');
      console.log('from:', { x: current.longitude, y: current.latitude });
      console.log('to:', { x: dest.longitude, y: dest.latitude });
      console.log('departureAt:', segmentDepartureTime.toISOString());
      console.log('trafficInfo:', usedTraffic);
      console.log('vehicleTypeCode:', vehicleTypeCode);
      console.log('====================');

      const seg = await getTmapRoute(
        { x: current.longitude, y: current.latitude },
        { x: dest.longitude, y: dest.latitude },
        tmapKey,
        {
          vehicleTypeCode,
          trafficInfo: usedTraffic === 'realtime' ? 'Y' : 'N',
          departureAt: segmentDepartureTime.toISOString()
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

        // 배송완료시간이 있는 경우, 실제 도착시간이 목표 시간과 맞는지 확인
        if (targetDeliveryTime) {
          const actualArrivalTime = new Date(segmentDepartureTime.getTime() + (segmentTime * 1000));
          const timeDifference = targetDeliveryTime.getTime() - actualArrivalTime.getTime();

          // 목표 시간과 5분 이상 차이나면 경고 로그
          if (Math.abs(timeDifference) > 5 * 60 * 1000) {
            console.warn(`배송완료시간 불일치: 목표=${targetDeliveryTime.toLocaleString()}, 실제=${actualArrivalTime.toLocaleString()}, 차이=${Math.round(timeDifference / 60000)}분`);
          }
        }

        // 다음 구간을 위한 현재 시간 업데이트 (이동시간 + 체류시간)
        const dwellTime = dwellMinutes[i + 1] || 10; // 경유지 체류시간
        currentTime = new Date(currentTime.getTime() + (segmentTime * 1000) + (dwellTime * 60 * 1000));
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

        // 폴백 구간도 시간 업데이트
        const dwellTime = dwellMinutes[i + 1] || 10;
        currentTime = new Date(currentTime.getTime() + (approxTime * 1000) + (dwellTime * 60 * 1000));
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
        localTime: departureDate.toString(),
        timezone: 'KST+0900'
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
  console.log('nearestNeighborOrderWithTimeConstraints 호출:', {
    points: points.map(p => p.address),
    deliveryTimes,
    isNextDayFlags
  });

  // 배송완료시간이 있는 목적지들을 시간순으로 정렬 (다음날 체크박스 고려)
  const timeConstrainedPoints = points
    .map((point, index) => ({
      ...point,
      deliveryTime: deliveryTimes[index] || null,
      isNextDay: isNextDayFlags[index] || false,
      originalIndex: index
    }))
    .filter(point => point.deliveryTime && point.deliveryTime.trim() !== '');

  console.log('timeConstrainedPoints:', timeConstrainedPoints.map(p => ({
    address: p.address,
    deliveryTime: p.deliveryTime,
    isNextDay: p.isNextDay
  })));

  const sortedTimeConstrainedPoints = timeConstrainedPoints.sort((a, b) => {
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
      // 다음날 배송이 당일 배송보다 나중에 와야 함
      return a.isNextDay ? 1 : -1; // 다음날이면 1 (나중), 당일이면 -1 (먼저)
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

  // 1단계: 시간 제약이 없는 목적지들을 먼저 최근접 이웃으로 배치
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

  // 2단계: 시간 제약이 있는 목적지들을 마지막에 배치 (다음날 배송이 마지막)
  for (const point of sortedTimeConstrainedPoints) {
    ordered.push({
      latitude: point.latitude,
      longitude: point.longitude,
      address: point.address
    });
    cur = { lat: point.latitude, lng: point.longitude };
  }

  console.log('배송완료시간 고려한 최적화 결과:', {
    timeConstrained: sortedTimeConstrainedPoints.map(p => ({
      address: p.address,
      time: p.deliveryTime,
      isNextDay: p.isNextDay
    })),
    unconstrained: unconstrainedPoints.map(p => ({ address: p.address })),
    finalOrder: ordered.map((p, index) => ({
      order: index + 1,
      address: p.address
    })),
    strategy: '1단계: 시간제약 없는 목적지 최적화 → 2단계: 시간제약 있는 목적지 마지막 배치'
  });

  // 최종 결과를 강제로 로그에 출력
  console.log('=== 최종 최적화 결과 ===');
  console.log('원래 순서:', points.map(p => p.address));
  console.log('최적화된 순서:', ordered.map(p => p.address));
  console.log('순서가 바뀌었는가?', JSON.stringify(points) !== JSON.stringify(ordered));
  console.log('timeConstrainedPoints 개수:', sortedTimeConstrainedPoints.length);
  console.log('unconstrainedPoints 개수:', unconstrainedPoints.length);
  console.log('ordered 개수:', ordered.length);

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

// 거리 기반 + 시간대별 예상 이동시간 계산 함수
function calculateEstimatedTravelTime(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  targetTime: Date,
  vehicleType: string = '레이'
): number {
  // 직선 거리 계산 (미터)
  const distance = haversineMeters(startLat, startLng, endLat, endLng);
  const distanceKm = distance / 1000;

  // 시간대별 평균 속도 (km/h)
  const hour = targetTime.getHours();
  let averageSpeed: number;

  if (hour >= 7 && hour <= 9) {
    averageSpeed = 25; // 출근시간 (혼잡)
  } else if (hour >= 18 && hour <= 20) {
    averageSpeed = 30; // 퇴근시간 (혼잡)
  } else if (hour >= 22 || hour <= 6) {
    averageSpeed = 50; // 야간 (원활)
  } else if (hour >= 10 && hour <= 17) {
    averageSpeed = 40; // 주간 (보통)
  } else {
    averageSpeed = 35; // 기타 시간
  }

  // 차량 타입별 속도 조정
  if (vehicleType === '스타렉스') {
    averageSpeed *= 0.9; // 화물차는 승용차보다 느림
  }

  // 예상 이동시간 계산 (분)
  const estimatedMinutes = (distanceKm / averageSpeed) * 60;

  // 최소 10분, 최대 120분으로 제한
  const clampedMinutes = Math.max(10, Math.min(120, estimatedMinutes));

  console.log(`예상 이동시간 계산: 거리=${distanceKm.toFixed(1)}km, 시간대=${hour}시, 속도=${averageSpeed.toFixed(1)}km/h, 예상시간=${clampedMinutes.toFixed(1)}분`);

  return clampedMinutes * 60 * 1000; // 밀리초로 변환
}

// 반복 계산으로 정확한 출발시간 계산 함수
async function calculateAccurateDepartureTime(
  start: { latitude: number; longitude: number },
  dest: { latitude: number; longitude: number },
  targetDeliveryTime: Date,
  tmapKey: string,
  vehicleTypeCode: string,
  usedTraffic: 'realtime' | 'standard',
  vehicleType: string
): Promise<Date> {
  // 1차: 예상 시간으로 계산
  const estimatedTravelTime = calculateEstimatedTravelTime(
    start.latitude, start.longitude,
    dest.latitude, dest.longitude,
    targetDeliveryTime,
    vehicleType
  );

  let segmentDepartureTime = new Date(targetDeliveryTime.getTime() - estimatedTravelTime);

  console.log(`1차 예상 출발시간: ${segmentDepartureTime.toLocaleString()}, 예상 이동시간: ${Math.round(estimatedTravelTime / 60000)}분`);

  // 2차: Tmap API로 실제 시간 확인
  try {
    const seg = await getTmapRoute(
      { x: start.longitude, y: start.latitude },
      { x: dest.longitude, y: dest.latitude },
      tmapKey,
      {
        vehicleTypeCode,
        trafficInfo: usedTraffic === 'realtime' ? 'Y' : 'N',
        departureAt: segmentDepartureTime.toISOString()
      }
    );

    if (seg && Array.isArray(seg.features)) {
      let actualTravelTime = 0;
      for (const f of seg.features) {
        if (f?.properties?.totalTime) actualTravelTime += f.properties.totalTime;
      }

      const actualTravelTimeMs = actualTravelTime * 1000; // 초를 밀리초로 변환
      const timeDifference = actualTravelTimeMs - estimatedTravelTime;

      console.log(`2차 실제 이동시간: ${Math.round(actualTravelTimeMs / 60000)}분, 차이: ${Math.round(timeDifference / 60000)}분`);

      // 3차: 5분 이상 차이나면 출발시간 조정
      if (Math.abs(timeDifference) > 5 * 60 * 1000) {
        segmentDepartureTime = new Date(targetDeliveryTime.getTime() - actualTravelTimeMs);
        console.log(`3차 조정된 출발시간: ${segmentDepartureTime.toLocaleString()}`);

        // 최종 검증: 조정된 시간으로 다시 한 번 확인
        const finalSeg = await getTmapRoute(
          { x: start.longitude, y: start.latitude },
          { x: dest.longitude, y: dest.latitude },
          tmapKey,
          {
            vehicleTypeCode,
            trafficInfo: usedTraffic === 'realtime' ? 'Y' : 'N',
            departureAt: segmentDepartureTime.toISOString()
          }
        );

        if (finalSeg && Array.isArray(finalSeg.features)) {
          let finalTravelTime = 0;
          for (const f of finalSeg.features) {
            if (f?.properties?.totalTime) finalTravelTime += f.properties.totalTime;
          }

          const finalArrivalTime = new Date(segmentDepartureTime.getTime() + (finalTravelTime * 1000));
          const finalDifference = targetDeliveryTime.getTime() - finalArrivalTime.getTime();

          console.log(`최종 검증: 목표시간=${targetDeliveryTime.toLocaleString()}, 실제도착시간=${finalArrivalTime.toLocaleString()}, 차이=${Math.round(finalDifference / 60000)}분`);
        }
      }
    }
  } catch (error) {
    console.warn(`반복 계산 중 Tmap API 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}, 예상 시간 사용`);
  }

  return segmentDepartureTime;
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