import { createServerClient } from '@/libs/supabase-client';

type PoiCandidate = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

const POI_PATTERN = /([가-힣A-Za-z0-9]+(?:역|병원|의원|센터|빌딩|타워|사무소|법률사무소))/g;

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function extractPoiKeywords(text: string): string[] {
  const matched = text.match(POI_PATTERN) || [];
  return uniq(matched.map((v) => v.trim()).filter(Boolean)).slice(0, 5);
}

async function searchTmapPoi(keyword: string): Promise<PoiCandidate | null> {
  const appKey = process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY;
  if (!appKey) return null;
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
    const address = road || jibun;
    const latitude = Number(poi.noorLat ?? poi.frontLat ?? poi.newLat ?? poi.lat);
    const longitude = Number(poi.noorLon ?? poi.frontLon ?? poi.newLon ?? poi.lon);
    if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      name: poi.name || keyword,
      address,
      latitude,
      longitude,
    };
  } catch {
    return null;
  }
}

export async function resolvePoiHintsFromText(text: string): Promise<PoiCandidate[]> {
  const keywords = extractPoiKeywords(text);
  if (!keywords.length) return [];
  const results = await Promise.all(keywords.map((keyword) => searchTmapPoi(keyword)));
  return results.filter((v): v is PoiCandidate => Boolean(v));
}

export async function saveToolCallLog(params: {
  sessionId?: string | null;
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}) {
  if (!params.sessionId) return;
  try {
    const supabase = createServerClient();
    await supabase.from('quote_chat_messages').insert([
      {
        session_id: params.sessionId,
        role: 'system',
        content: `[tool:${params.tool}]`,
        metadata: {
          kind: 'tool-call',
          tool: params.tool,
          input: params.input,
          output: params.output,
        },
      },
    ]);
  } catch {
    // 로그 저장 실패는 무시
  }
}

