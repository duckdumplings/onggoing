/**
 * 경유지 주소/POI명을 좌표로 해석한다.
 *
 * 시나리오 견적의 stops는 "노원구청", "문래역"처럼 도로명 주소가 아닌 POI명이 많다.
 * route-optimization의 주소 지오코딩은 이런 POI명에 약해 일부 시나리오가 400(GEOCODE)으로
 * 실패한다. 여기서는 Tmap POI 검색으로 좌표를 먼저 붙여, route-optimization이 좌표를
 * 그대로 쓰도록 한다(지오코딩 생략 → 실패율 감소).
 */

export interface GeocodedStop {
  address: string;
  latitude?: number;
  longitude?: number;
  /** 좌표 해석 성공 여부. */
  resolved: boolean;
  /**
   * 구/동 단위 등 건물 미만 정밀도로만 해석된 경우 true.
   * 좌표는 해당 행정구역 중심이라 실제 배송 지점이 아니므로, 호출측이 정확한 주소를 재확인해야 한다.
   */
  lowPrecision: boolean;
}

/**
 * 쿼리가 행정구역(구/군/동 등) 단위만 담고 있어 건물 좌표를 특정할 수 없는지 판정한다.
 * 숫자(번지/건물번호)가 있으면 상세 주소로 보고, POI명("역삼역", "노원구청")은 저정밀로 보지 않는다.
 */
export function isRegionOnlyQuery(q: string): boolean {
  const s = q.trim();
  if (!s) return false;
  if (/\d/.test(s)) return false; // 번지/건물번호 등 숫자가 있으면 상세 주소로 간주
  // 마지막 토큰이 행정구역 접미사(시/군/구/읍/면/동/리)면 구역 단위만 지정된 것.
  return /(시|군|구|읍|면|동|리)$/.test(s);
}

function getTmapKey(): string | undefined {
  return process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY;
}

interface GeoHit {
  latitude: number;
  longitude: number;
  address: string;
}

/** Tmap POI 검색으로 단일 키워드를 좌표로 해석. POI명("노원구청")에 강함. 실패 시 null. */
export async function geocodeViaTmapPoi(query: string): Promise<GeoHit | null> {
  const appKey = getTmapKey();
  const keyword = query.trim();
  if (!appKey || !keyword) return null;
  try {
    const url = new URL('https://apis.openapi.sk.com/tmap/pois');
    url.searchParams.set('version', '1');
    url.searchParams.set('searchKeyword', keyword);
    url.searchParams.set('searchType', 'all');
    url.searchParams.set('reqCoordType', 'WGS84GEO');
    url.searchParams.set('resCoordType', 'WGS84GEO');
    url.searchParams.set('count', '1');
    const res = await fetch(url.toString(), {
      headers: { appKey, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const poi = data?.searchPoiInfo?.pois?.poi?.[0];
    if (!poi) return null;
    const road = poi?.newAddressList?.newAddress?.[0]?.fullAddressRoad;
    const jibun = [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.detailAddrName]
      .filter(Boolean)
      .join(' ');
    const latitude = Number(poi.noorLat ?? poi.frontLat ?? poi.newLat ?? poi.lat);
    const longitude = Number(poi.noorLon ?? poi.frontLon ?? poi.newLon ?? poi.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude, address: road || jibun || keyword };
  } catch {
    return null;
  }
}

/** Tmap 전체주소 지오코딩. 도로명/지번 주소("마포구 월드컵북로 396")에 강함. 실패 시 null. */
export async function geocodeViaTmapFullAddr(query: string): Promise<GeoHit | null> {
  const appKey = getTmapKey();
  const fullAddr = query.trim();
  if (!appKey || !fullAddr) return null;
  try {
    const url = new URL('https://apis.openapi.sk.com/tmap/geo/fullAddrGeo');
    url.searchParams.set('version', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('coordType', 'WGS84GEO');
    url.searchParams.set('fullAddr', fullAddr);
    const res = await fetch(url.toString(), {
      headers: { appKey, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const coord = data?.coordinateInfo?.coordinate?.[0];
    if (!coord) return null;
    // 도로명 좌표(newLat/newLon)를 우선, 없으면 지번 좌표(lat/lon).
    const latitude = Number(coord.newLat || coord.lat);
    const longitude = Number(coord.newLon || coord.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const resolvedAddr =
      [coord.city_do, coord.gu_gun, coord.eup_myun, coord.legalDong, coord.roadName, coord.buildingIndex]
        .filter(Boolean)
        .join(' ') || fullAddr;
    return { latitude, longitude, address: resolvedAddr };
  } catch {
    return null;
  }
}

/** 도로명/지번 주소처럼 보이는지(숫자 번지 + 로/길 토큰). POI명과 구분해 지오코딩 순서를 정한다. */
function looksLikeStreetAddress(q: string): boolean {
  const s = q.trim();
  const hasRoadToken = /(로|길)\s*\d/.test(s) || /\d+(번길|길|로)/.test(s);
  const hasJibun = /\d+-\d+/.test(s) || /\d+\s*번지/.test(s);
  const hasSiDo = /(특별시|광역시|특별자치|도\s|시\s)/.test(s);
  return hasRoadToken || hasJibun || (hasSiDo && /\d/.test(s));
}

/**
 * 단일 주소/POI를 좌표로 해석한다. 입력 형태에 따라 적합한 엔진을 먼저 시도하고
 * 실패 시 다른 엔진으로 폴백한다(도로명 주소·POI명 양쪽 모두 강건).
 */
export async function resolveStopAddress(query: string): Promise<GeoHit | null> {
  if (looksLikeStreetAddress(query)) {
    return (await geocodeViaTmapFullAddr(query)) ?? (await geocodeViaTmapPoi(query));
  }
  return (await geocodeViaTmapPoi(query)) ?? (await geocodeViaTmapFullAddr(query));
}

/**
 * 주소 목록을 좌표로 해석한다(중복 주소는 캐시 공유).
 * 좌표 해석에 실패한 항목은 resolved=false로 두어, 호출측이 주소 문자열 폴백을 쓰게 한다.
 */
export async function geocodeStopAddresses(
  addresses: string[],
  cache: Map<string, GeocodedStop> = new Map()
): Promise<Map<string, GeocodedStop>> {
  const unique = Array.from(new Set(addresses.map((a) => a.trim()).filter(Boolean)));
  const pending = unique.filter((a) => !cache.has(a));
  await Promise.all(
    pending.map(async (address) => {
      const lowPrecision = isRegionOnlyQuery(address);
      const hit = await resolveStopAddress(address);
      cache.set(
        address,
        hit ? { ...hit, resolved: true, lowPrecision } : { address, resolved: false, lowPrecision }
      );
    })
  );
  return cache;
}
