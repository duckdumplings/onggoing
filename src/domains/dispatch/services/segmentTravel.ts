// 구간 실측 + 캐시 프리미티브 (route-optimization 모놀리스에서 추출한 공용 모듈).
// route-optimization route.ts와 routeMatrix.ts가 동일 소스를 공유해 중복/표류를 막는다.

export type Waypoint = { latitude: number; longitude: number; address: string };
export type TrafficAnchorMode = 'today' | 'tomorrow' | 'auto';

export function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function quickEtaMinutes(from: Waypoint, to: Waypoint): number {
  const d = haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude);
  const vKmh = 35; // 보수적 평균속도
  return Math.max(10, Math.round((d / 1000) / vKmh * 60));
}

function setTimeOfDay(base: Date, timeSource: Date): Date {
  const d = new Date(base);
  d.setHours(timeSource.getHours(), timeSource.getMinutes(), timeSource.getSeconds(), 0);
  return d;
}

export function anchorDepartureTime(desired: Date, mode: TrafficAnchorMode, now: Date = new Date()): Date {
  const desiredTime = desired.getHours() * 60 + desired.getMinutes();
  const nowTime = now.getHours() * 60 + now.getMinutes();

  if (mode === 'today') {
    // 과거 시각이어도 그대로 오늘의 해당 시각으로 사용
    return setTimeOfDay(now, desired);
  }

  if (mode === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return setTimeOfDay(tomorrow, desired);
  }

  // auto: 과거 시각이면 내일, 아니면 오늘
  if (desiredTime <= nowTime) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return setTimeOfDay(tomorrow, desired);
  }
  return setTimeOfDay(now, desired);
}

export function makeDepartureBucket(date: Date, minutes: number = 5) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  const rounded = Math.floor(m / minutes) * minutes;
  d.setMinutes(rounded);
  return d.toISOString(); // 버킷 키
}

export function coordKey(a: Waypoint, b: Waypoint) {
  return `${a.latitude.toFixed(6)},${a.longitude.toFixed(6)}->${b.latitude.toFixed(6)},${b.longitude.toFixed(6)}`;
}

// Tmap 자동차 경로안내 (타임머신 기능 포함)
export async function getTmapRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  appKey: string,
  opts?: {
    vehicleTypeCode?: string;
    trafficInfo?: 'Y' | 'N';
    departureAt?: string | null;
    roadOption?: 'time-first' | 'toll-saving' | 'free-road-first';
  }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    // 출발시간이 있어도 도로 옵션이 time-first가 아니면 일반 routes API를 사용해 옵션을 반영한다.
    const shouldUsePrediction = Boolean(opts?.departureAt) && (opts?.roadOption || 'time-first') === 'time-first';

    // 출발시간이 설정되고 time-first인 경우 타임머신 API 사용
    if (shouldUsePrediction) {
      const departureAtValue = opts?.departureAt;
      if (!departureAtValue) {
        throw new Error('PREDICTION_DEPARTURE_TIME_REQUIRED');
      }
      const url = 'https://apis.openapi.sk.com/tmap/routes/prediction?version=1';

      // 출발 instant를 KST(+0900) 벽시계로 포맷한다.
      // 주의: getFullYear/getHours 등은 "서버 로컬 시간대"를 따른다. Vercel 등 UTC 서버에서는
      // 09:00 KST(=00:00Z) 출발이 00:00으로 해석돼 Tmap이 새벽(빈 도로) 교통을 예측하는 버그가 났다.
      // instant + 9시간 후 getUTC*를 쓰면 서버 TZ와 무관하게 항상 KST 벽시계가 나온다.
      const departureInstant = new Date(departureAtValue);
      const kst = new Date(departureInstant.getTime() + 9 * 3600 * 1000);
      const year = kst.getUTCFullYear();
      const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
      const day = String(kst.getUTCDate()).padStart(2, '0');
      const hours = String(kst.getUTCHours()).padStart(2, '0');
      const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
      const seconds = String(kst.getUTCSeconds()).padStart(2, '0');

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
      return result;
    } else {
      // 실시간 교통정보 사용 시 기존 API
      const url = 'https://apis.openapi.sk.com/tmap/routes';
      const roadOption = opts?.roadOption || 'time-first';
      // Tmap routes API의 searchOption은 한 자리 값에 leading zero를 붙이면 400을 반환한다.
      // (검증: '0'/'1'/'2'/'4' → 200, '00'/'01'/'02'/'04' → 400, '10'/'12'는 두 자리라 정상)
      const searchOptionByRoadOption: Record<string, string> = {
        'time-first': opts?.trafficInfo === 'N' ? '2' : '0',
        'toll-saving': '10',
        'free-road-first': '1',
      };
      const selectedSearchOption = searchOptionByRoadOption[roadOption] || searchOptionByRoadOption['time-first'];
      const tollgateCarTypeByVehicleCode: Record<string, string> = {
        '1': 'car',
        '2': 'mediumvan',
      };

      const body: Record<string, unknown> = {
        startX: String(start.x),
        startY: String(start.y),
        endX: String(end.x),
        endY: String(end.y),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: selectedSearchOption,
        trafficInfo: opts?.trafficInfo ?? 'Y',
        vehicleType: opts?.vehicleTypeCode ?? '1',
        tollgateCarType: tollgateCarTypeByVehicleCode[opts?.vehicleTypeCode ?? '1'] || 'car',
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { appKey: appKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Tmap route failed: ${res.status}`);
      const result = await res.json();
      return result;
    }
  } finally {
    clearTimeout(timeout);
  }
}

export type SegmentTravel = { timeSec: number; distM: number };

export async function fetchSegmentTravel(
  cache: Map<string, SegmentTravel>,
  from: Waypoint,
  to: Waypoint,
  departAt: Date,
  tmapKey: string,
  vehicleTypeCode: string,
  trafficMode: 'realtime' | 'standard',
  trafficAnchor: TrafficAnchorMode,
): Promise<{ timeSec: number; distM: number; mode?: 'prediction' | 'routes-fallback' }> {
  const anchored = anchorDepartureTime(departAt, trafficAnchor);
  const bucket = makeDepartureBucket(anchored, 5);
  const key = `${coordKey(from, to)}@${bucket}@${trafficMode}@${vehicleTypeCode}`;
  const hit = cache.get(key);
  if (hit) {
    return { ...hit, mode: 'prediction' };
  }

  // 1) Prediction 재시도
  const backoffs = [400, 900, 1600];
  for (let i = 0; i < backoffs.length; i++) {
    const result = await getTmapRoute(
      { x: from.longitude, y: from.latitude },
      { x: to.longitude, y: to.latitude },
      tmapKey,
      {
        vehicleTypeCode,
        trafficInfo: trafficMode === 'realtime' ? 'Y' : 'N',
        departureAt: anchored.toISOString()
      }
    ).catch(() => null);
    if (result && Array.isArray(result.features)) {
      let timeSec = 0, distM = 0;
      for (const f of result.features) {
        if (f?.properties?.totalTime) timeSec += f.properties.totalTime;
        if (f?.properties?.totalDistance) distM += f.properties.totalDistance;
      }
      const val = { timeSec, distM };
      cache.set(key, val);
      return { ...val, mode: 'prediction' };
    }
    await sleep(backoffs[i]);
  }

  // 2) 일반 routes 대체 (departureAt 없이 trafficInfo만)
  for (let i = 0; i < 2; i++) {
    const result = await getTmapRoute(
      { x: from.longitude, y: from.latitude },
      { x: to.longitude, y: to.latitude },
      tmapKey,
      {
        vehicleTypeCode,
        trafficInfo: trafficMode === 'realtime' ? 'Y' : 'N',
        departureAt: null
      }
    ).catch(() => null);
    if (result && Array.isArray(result.features)) {
      let timeSec = 0, distM = 0;
      for (const f of result.features) {
        if (f?.properties?.totalTime) timeSec += f.properties.totalTime;
        if (f?.properties?.totalDistance) distM += f.properties.totalDistance;
      }
      const val = { timeSec, distM };
      cache.set(key, val);
      return { ...val, mode: 'routes-fallback' };
    }
    await sleep(600 + i * 900);
  }

  // 3) 모든 시도 실패 → 오류 throw (Haversine 폴백 사용하지 않음)
  throw new Error(`TMAP_UNAVAILABLE: ${from.address} → ${to.address}`);
}
