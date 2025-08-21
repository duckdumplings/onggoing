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

  // 환경변수 디버깅 강화
  const nextPublicKey = process.env.NEXT_PUBLIC_TMAP_API_KEY
  const tmapKey = process.env.TMAP_API_KEY
  const finalKey = nextPublicKey || tmapKey || ''
  
  console.log('[POI Search] Query:', q)
  console.log('[POI Search] NEXT_PUBLIC_TMAP_API_KEY exists:', !!nextPublicKey)
  console.log('[POI Search] NEXT_PUBLIC_TMAP_API_KEY length:', nextPublicKey?.length || 0)
  console.log('[POI Search] TMAP_API_KEY exists:', !!tmapKey)
  console.log('[POI Search] TMAP_API_KEY length:', tmapKey?.length || 0)
  console.log('[POI Search] Final key exists:', !!finalKey)
  console.log('[POI Search] Final key length:', finalKey.length)
  console.log('[POI Search] All env keys:', Object.keys(process.env).filter(k => k.includes('TMAP')))

  if (!finalKey) {
    console.error('[POI Search] No TMAP key found in any environment variable')
    return NextResponse.json({
      error: 'TMAP API key not configured. Please check Vercel environment variables.',
      suggestions: [],
      debug: {
        nextPublicExists: !!nextPublicKey,
        tmapExists: !!tmapKey,
        envKeys: Object.keys(process.env).filter(k => k.includes('TMAP'))
      }
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
      headers: { appKey: finalKey, 'Content-Type': 'application/json' },
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



