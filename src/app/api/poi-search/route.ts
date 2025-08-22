import { NextRequest, NextResponse } from 'next/server'

type Suggestion = {
  name: string
  address: string // 도로명주소 우선(없으면 지번)
  latitude: number
  longitude: number
}

// 고급 TTL 메모리 캐시 (프로세스 생명주기 동안)
const cache = new Map<string, { ts: number; data: Suggestion[]; hitCount: number }>()
const TTL_MS = 5 * 60_000 // 5분으로 단축 (더 자주 업데이트)
const MAX_CACHE_SIZE = 1000 // 최대 캐시 크기 제한

// 레이트리밋 추적 (메모리 기반)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1분
const MAX_REQUESTS_PER_WINDOW = 10 // 1분당 최대 10개 요청

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() || ''
  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] }, { status: 200 })
  }

  const now = Date.now()

  // 레이트리밋 체크
  const clientIP = req.headers.get('x-forwarded-for') || 'unknown'
  const clientRateLimit = rateLimitMap.get(clientIP)

  if (clientRateLimit && now < clientRateLimit.resetTime) {
    if (clientRateLimit.count >= MAX_REQUESTS_PER_WINDOW) {
      console.warn(`[POI Search] Rate limit exceeded for IP: ${clientIP}`)
      return NextResponse.json({
        error: 'Rate limit exceeded. Please try again later.',
        suggestions: []
      }, { status: 429 })
    }
    clientRateLimit.count++
  } else {
    rateLimitMap.set(clientIP, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    })
  }

  const cacheKey = q.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached && now - cached.ts < TTL_MS) {
    // 캐시 히트 시 hitCount 증가
    cached.hitCount++
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

    // 캐시 크기 제한 체크 및 LRU 정책 적용
    if (cache.size >= MAX_CACHE_SIZE) {
      // 가장 오래된 항목 제거
      const oldestKey = Array.from(cache.entries())
        .sort(([, a], [, b]) => a.ts - b.ts)[0]?.[0]
      if (oldestKey) {
        cache.delete(oldestKey)
      }
    }

    cache.set(cacheKey, { ts: now, data: suggestions, hitCount: 1 })
    return NextResponse.json({ suggestions }, { status: 200 })
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 200 })
  }
}



