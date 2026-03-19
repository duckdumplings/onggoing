import { NextRequest, NextResponse } from 'next/server'

type Suggestion = {
  name: string
  address: string // 도로명주소 우선(없으면 지번)
  latitude: number
  longitude: number
  confidence: number
  matchType: 'name_prefix' | 'address_prefix' | 'name_contains' | 'address_contains' | 'fuzzy' | 'unknown'
  normalizedQuery: string
}

type ApiStatus = 'ok' | 'no_results' | 'rate_limited' | 'error'

type ApiResponse = {
  status: ApiStatus
  suggestions: Suggestion[]
  normalizedQuery: string
  message?: string
}

const cache = new Map<string, { ts: number; data: Suggestion[]; hitCount: number }>()
const TTL_MS = 5 * 60_000
const MAX_CACHE_SIZE = 1000

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 10
const DEV_MODE = process.env.NODE_ENV === 'development'

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '').trim()

function rankSuggestion(rawQuery: string, name: string, address: string): Pick<Suggestion, 'confidence' | 'matchType' | 'normalizedQuery'> {
  const normalizedQuery = normalize(rawQuery)
  const normalizedName = normalize(name)
  const normalizedAddress = normalize(address)

  if (!normalizedQuery) {
    return { confidence: 0, matchType: 'unknown', normalizedQuery }
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return { confidence: 0.95, matchType: 'name_prefix', normalizedQuery }
  }
  if (normalizedAddress.startsWith(normalizedQuery)) {
    return { confidence: 0.9, matchType: 'address_prefix', normalizedQuery }
  }
  if (normalizedName.includes(normalizedQuery)) {
    return { confidence: 0.82, matchType: 'name_contains', normalizedQuery }
  }
  if (normalizedAddress.includes(normalizedQuery)) {
    return { confidence: 0.74, matchType: 'address_contains', normalizedQuery }
  }
  if (normalizedQuery.length >= 2) {
    const n = normalizedQuery.slice(0, 2)
    if (normalizedName.includes(n) || normalizedAddress.includes(n)) {
      return { confidence: 0.62, matchType: 'fuzzy', normalizedQuery }
    }
  }
  return { confidence: 0.5, matchType: 'unknown', normalizedQuery }
}

function okResponse(payload: ApiResponse, status = 200) {
  return NextResponse.json(payload, { status })
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() || ''
  const normalizedQuery = normalize(q)

  if (!q || q.length < 2) {
    return okResponse({ status: 'no_results', suggestions: [], normalizedQuery })
  }

  const now = Date.now()

  const clientIP = req.headers.get('x-forwarded-for') || 'unknown'
  const clientRateLimit = rateLimitMap.get(clientIP)

  if (clientRateLimit && now < clientRateLimit.resetTime) {
    if (clientRateLimit.count >= MAX_REQUESTS_PER_WINDOW) {
      return okResponse(
        {
          status: 'rate_limited',
          suggestions: [],
          normalizedQuery,
          message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
        },
        429
      )
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
    cached.hitCount++
    return okResponse({
      status: cached.data.length > 0 ? 'ok' : 'no_results',
      suggestions: cached.data,
      normalizedQuery,
    })
  }

  const nextPublicKey = process.env.NEXT_PUBLIC_TMAP_API_KEY
  const tmapKey = process.env.TMAP_API_KEY
  const finalKey = nextPublicKey || tmapKey || ''

  if (!finalKey) {
    return okResponse(
      {
        status: 'error',
        suggestions: [],
        normalizedQuery,
        message: '지도 검색 키가 설정되지 않았습니다.',
      },
      500
    )
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

    if (!res.ok) {
      if (DEV_MODE) {
        console.warn('[POI Search] TMAP API failed', res.status, res.statusText)
      }
      return okResponse({
        status: 'error',
        suggestions: [],
        normalizedQuery,
        message: '검색 API 호출에 실패했습니다.',
      })
    }

    const data = await res.json()
    const pois = data?.searchPoiInfo?.pois?.poi || []
    const rawSuggestions: Suggestion[] = pois.slice(0, 15).map((p: any) => {
      const road = p?.newAddressList?.newAddress?.[0]?.fullAddressRoad || ''
      const jibun = [p.upperAddrName, p.middleAddrName, p.lowerAddrName, p.detailAddrName]
        .filter(Boolean)
        .join(' ')
      const address = road || jibun
      const ranked = rankSuggestion(q, p.name ?? '', address)
      return {
        name: p.name ?? '',
        address,
        latitude: parseFloat(p.noorLat ?? p.frontLat ?? p.newLat ?? p.lat),
        longitude: parseFloat(p.noorLon ?? p.frontLon ?? p.newLon ?? p.lon),
        confidence: ranked.confidence,
        matchType: ranked.matchType,
        normalizedQuery: ranked.normalizedQuery,
      }
    }).filter((s: Suggestion) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))

    const deduped = new Map<string, Suggestion>()
    for (const suggestion of rawSuggestions) {
      const key = `${suggestion.latitude.toFixed(6)}:${suggestion.longitude.toFixed(6)}:${suggestion.address}`
      const existing = deduped.get(key)
      if (!existing || suggestion.confidence > existing.confidence) {
        deduped.set(key, suggestion)
      }
    }

    const suggestions = [...deduped.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)

    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = Array.from(cache.entries())
        .sort(([, a], [, b]) => a.ts - b.ts)[0]?.[0]
      if (oldestKey) {
        cache.delete(oldestKey)
      }
    }

    cache.set(cacheKey, { ts: now, data: suggestions, hitCount: 1 })
    return okResponse({
      status: suggestions.length > 0 ? 'ok' : 'no_results',
      suggestions,
      normalizedQuery,
      message: suggestions.length > 0 ? undefined : '검색 결과가 없습니다.',
    })
  } catch (error) {
    if (DEV_MODE) {
      console.warn('[POI Search] unexpected error', error)
    }
    return okResponse({
      status: 'error',
      suggestions: [],
      normalizedQuery,
      message: '검색 처리 중 오류가 발생했습니다.',
    })
  }
}
