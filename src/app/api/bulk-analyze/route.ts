import { NextRequest, NextResponse } from 'next/server'

/*
  POST /api/bulk-analyze
  body: { headers: string[]; rows: any[] } // rows: 샘플 최대 20행 권장
  resp: { mapping: Record<string, string>; reasons: Record<string, string>; confidence: Record<string, number> }
*/

const NORMALIZE = (s: string) => s.replace(/\s+/g, '').replace(/_/g, '').toLowerCase()

const FALLBACK_ALIASES: Record<string, string> = {
  address: 'address', 주소: 'address', 위치: 'address', place: 'address', name: 'address', address1: 'address',
  lat: 'latitude', latitude: 'latitude', 위도: 'latitude', y: 'latitude',
  lon: 'longitude', lng: 'longitude', longitude: 'longitude', 경도: 'longitude', x: 'longitude',
  delivery: 'deliveryTime', deliverytime: 'deliveryTime', duetime: 'deliveryTime', due: 'deliveryTime', 배송완료시간: 'deliveryTime', 완료시간: 'deliveryTime', 도착시간: 'deliveryTime',
  dwell: 'dwellMinutes', dwellminutes: 'dwellMinutes', 체류시간: 'dwellMinutes', 대기시간: 'dwellMinutes',
  memo: 'meta', 메모: 'meta', 비고: 'meta', 고객명: 'meta', 고객: 'meta', 요청시간: 'meta'
}

function heuristicSuggest(headers: string[], rows: any[]) {
  const mapping: Record<string, string> = {}
  const reasons: Record<string, string> = {}
  const confidence: Record<string, number> = {}
  headers.forEach(h => {
    const key = FALLBACK_ALIASES[NORMALIZE(h)]
    if (key) {
      mapping[h] = key
      reasons[h] = '사전 정의된 별칭 매핑 규칙에 일치'
      confidence[h] = 0.65
      return
    }
    // 값 패턴 기반 휴리스틱
    const sampleVals = rows.map(r => String(r?.[h] ?? '')).filter(Boolean).slice(0, 10)
    const isLat = sampleVals.every(v => /^(-?\d{1,3}(\.\d{3,8})?)$/.test(v)) && sampleVals.some(v => Math.abs(parseFloat(v)) <= 90)
    const isLng = sampleVals.every(v => /^(-?\d{1,3}(\.\d{3,8})?)$/.test(v)) && sampleVals.some(v => Math.abs(parseFloat(v)) <= 180)
    const isTime = sampleVals.some(v => /^\d{1,2}:\d{2}$/.test(v))
    const looksAddress = sampleVals.some(v => /\d|동|로|길|구|군|시|도|번지|아파트|호/.test(v))
    if (isLat) { mapping[h] = 'latitude'; reasons[h] = '숫자/소수 패턴 및 위도 범위'; confidence[h] = 0.55; return }
    if (isLng) { mapping[h] = 'longitude'; reasons[h] = '숫자/소수 패턴 및 경도 범위'; confidence[h] = 0.55; return }
    if (isTime) { mapping[h] = 'deliveryTime'; reasons[h] = 'HH:mm 패턴'; confidence[h] = 0.5; return }
    if (looksAddress) { mapping[h] = 'address'; reasons[h] = '주소 형태 한글 토큰/숫자 포함'; confidence[h] = 0.5; return }
    mapping[h] = 'meta'; reasons[h] = '특정 패턴 미일치 → 메타로 보존'; confidence[h] = 0.3
  })
  return { mapping, reasons, confidence }
}

export async function POST(req: NextRequest) {
  try {
    const { headers, rows } = await req.json()
    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    }

    const key = process.env.OPENAI_API_KEY
    if (!key) {
      const fb = heuristicSuggest(headers, rows)
      return NextResponse.json({ ...fb, provider: 'heuristic' })
    }

    // OpenAI 호출
    const system = `너는 데이터 헤더 의미를 추론하는 도우미야. 다음 필드 중 하나로 매핑해: address | latitude | longitude | deliveryTime | dwellMinutes | meta(보존). deliveryTime은 HH:mm.`
    const user = JSON.stringify({ headers, sample: rows.slice(0, 20) })

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `헤더와 샘플을 분석해 JSON만 반환해. 형식: {"mapping":Record<string,string>, "reasons":Record<string,string>, "confidence":Record<string,number>}\n${user}` }
        ],
        temperature: 0.2
      })
    })
    if (!res.ok) {
      const fb = heuristicSuggest(headers, rows)
      return NextResponse.json({ ...fb, provider: 'heuristic', warning: `openai ${res.status}` })
    }
    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content ?? ''
    try {
      const parsed = JSON.parse(content)
      // 결과 정합성 보정
      const fb = heuristicSuggest(headers, rows)
      const mapping = { ...fb.mapping, ...(parsed?.mapping || {}) }
      const reasons = { ...fb.reasons, ...(parsed?.reasons || {}) }
      const confidence = { ...fb.confidence, ...(parsed?.confidence || {}) }
      return NextResponse.json({ mapping, reasons, confidence, provider: 'openai' })
    } catch {
      const fb = heuristicSuggest(headers, rows)
      return NextResponse.json({ ...fb, provider: 'heuristic', warning: 'parse-failed' })
    }
  } catch (e) {
    return NextResponse.json({ error: 'unexpected' }, { status: 500 })
  }
}





