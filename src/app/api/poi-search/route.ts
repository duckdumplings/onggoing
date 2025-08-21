import { NextRequest, NextResponse } from 'next/server'

type Suggestion = {
  name: string
  address: string // 도로명주소 우선(없으면 지번)
  latitude: number
  longitude: number
}

// 간단 TTL 메모리 캐시 (프로세스 생명주기 동안)
const cache = new Map<string, { ts: number; data: Suggestion[] }>()
const TTL_MS = 60_000

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() || ''
  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] }, { status: 200 })
  }

  const cacheKey = q.toLowerCase()
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && now - cached.ts < TTL_MS) {
    return NextResponse.json({ suggestions: cached.data }, { status: 200 })
  }

  const tmapKey = process.env.NEXT_PUBLIC_TMAP_API_KEY || process.env.TMAP_API_KEY || ''

  // 디버깅 로그 추가
  console.log('[POI Search] Query:', q)
  console.log('[POI Search] TMAP Key exists:', !!tmapKey)
  console.log('[POI Search] TMAP Key length:', tmapKey.length)

  if (!tmapKey) {
    console.error('[POI Search] No TMAP key found in environment variables')
    return NextResponse.json({
      error: 'TMAP API key not configured',
      suggestions: []
    }, { status: 500 })
  }

  try {
    const url = new URL('https://apis.openapi.sk.com/tmap/pois')
    url.searchParams.set('version', '1')
    url.searchParams.set('searchKeyword', q)
    url.searchParams.set('searchType', 'all')
    url.searchParams.set('reqCoordType', 'WGS84GEO')
    url.searchParams.set('resCoordType', 'WGS84GEO')
    url.searchParams.set('count', '10')

    const res = await fetch(url.toString(), {
      headers: { appKey: tmapKey, 'Content-Type': 'application/json' },
      next: { revalidate: 0 },
    })

    console.log('[POI Search] TMAP API response status:', res.status)

    if (!res.ok) {
      console.log('[POI Search] TMAP API failed:', res.status, res.statusText)
      return NextResponse.json({ suggestions: [] }, { status: 200 })
    }

    const data = await res.json()
    const pois = data?.searchPoiInfo?.pois?.poi || []
    const suggestions: (Suggestion & { label: string })[] = pois.slice(0, 10).map((p: any) => {
      const road = p?.newAddressList?.newAddress?.[0]?.fullAddressRoad
      const jibun = [p.upperAddrName, p.middleAddrName, p.lowerAddrName, p.detailAddrName]
        .filter(Boolean)
        .join(' ')
      return {
        name: p.name,
        address: road || jibun,
        latitude: parseFloat(p.noorLat ?? p.frontLat ?? p.newLat ?? p.lat),
        longitude: parseFloat(p.noorLon ?? p.frontLon ?? p.newLon ?? p.lon),
        label: p.name ? `${p.name} · ${road || jibun}` : (road || jibun)
      }
    }).filter((s: Suggestion) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))

    cache.set(cacheKey, { ts: now, data: suggestions })
    return NextResponse.json({ suggestions }, { status: 200 })
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 200 })
  }
}



