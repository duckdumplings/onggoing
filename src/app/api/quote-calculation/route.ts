import { NextRequest, NextResponse } from 'next/server'

type QuoteInput = {
  distance: number // meters
  time: number // seconds
  vehicleType?: string
  dwellMinutes?: number[] // per-stop dwell/handling minutes
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QuoteInput
    const distance = Number(body.distance || 0)
    const time = Number(body.time || 0)
    const vehicleType = String(body.vehicleType || '레이')
    const dwellMinutes = Array.isArray(body.dwellMinutes) ? body.dwellMinutes.map((n) => Math.max(0, Number(n || 0))) : []

    if (!Number.isFinite(distance) || !Number.isFinite(time)) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'distance/time invalid' } }, { status: 400 })
    }

    // 기본 단가 (임시 정책): 차량 가중치, 거리/km, 시간/분
    const vehicleWeight = vehicleType === '스타렉스' ? 1.2 : 1.0
    const baseRate = 3000 // 기본료
    const perKm = 100 // km당
    const perMin = 50 // 분당(주행)
    const dwellTotalMin = dwellMinutes.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)

    const km = distance / 1000
    const driveMinutes = Math.ceil(time / 60)

    const distanceCharge = km * perKm
    const timeCharge = driveMinutes * perMin
    const dwellCharge = dwellTotalMin * perMin

    const subtotal = baseRate + distanceCharge + timeCharge + dwellCharge
    const totalPrice = Math.round(subtotal * vehicleWeight)

    const formattedTotal = `₩${totalPrice.toLocaleString('ko-KR')}`

    return NextResponse.json({
      success: true,
      quote: {
        totalPrice,
        formattedTotal,
        currency: 'KRW',
        breakdown: {
          baseRate,
          distanceCharge,
          timeCharge,
          dwellCharge,
          vehicleWeight
        },
        distance,
        time,
        dwellMinutes
      }
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: e?.message || 'unknown' } }, { status: 500 })
  }
}


