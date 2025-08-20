import { NextRequest, NextResponse } from 'next/server'
import { perJobBasePrice, STOP_FEE, fuelSurchargeHourly, pickHourlyRate } from '@/domains/quote/pricing'

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
    const vehicleKey = vehicleType === '스타렉스' ? 'starex' : 'ray'
    const dwellMinutes = Array.isArray(body.dwellMinutes) ? body.dwellMinutes.map((n) => Math.max(0, Number(n || 0))) : []

    if (!Number.isFinite(distance) || !Number.isFinite(time)) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'distance/time invalid' } }, { status: 400 })
    }

    // 단가/가중치/연료비: 환경변수 기반(없으면 기본값)
    const baseRate = Number(process.env.QUOTE_BASE_RATE ?? 3000) // 기본료
    const perKm = Number(process.env.QUOTE_PER_KM ?? 100) // km당 요금
    const perMin = Number(process.env.QUOTE_PER_MIN ?? 50) // 분당(주행)
    const weightRay = Number(process.env.VEHICLE_WEIGHT_RAY ?? 1.0)
    const weightStarex = Number(process.env.VEHICLE_WEIGHT_STAREX ?? 1.2)
    const fuelPricePerL = Number(process.env.FUEL_PRICE_PER_L ?? 1650) // KRW/L
    const fuelEfficiencyKmPerL = Number(process.env.FUEL_EFFICIENCY_KM_PER_L ?? 10) // km/L

    const vehicleWeight = vehicleType === '스타렉스' ? weightStarex : weightRay
    const dwellTotalMin = dwellMinutes.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)

    const km = distance / 1000
    const driveMinutes = Math.ceil(time / 60)

    const distanceCharge = km * perKm
    const timeCharge = driveMinutes * perMin
    const dwellCharge = dwellTotalMin * perMin

    const subtotal = baseRate + distanceCharge + timeCharge + dwellCharge
    const totalPrice = Math.round(subtotal * vehicleWeight)

    const liters = fuelEfficiencyKmPerL > 0 ? km / fuelEfficiencyKmPerL : 0
    const fuelCost = Math.round(liters * fuelPricePerL)

    const formattedTotal = `₩${totalPrice.toLocaleString('ko-KR')}`

    return NextResponse.json({
      success: true,
      quote: {
        totalPrice,
        formattedTotal,
        currency: 'KRW',
        breakdown: {
          planName: '기본+거리/시간 혼합 요금',
          baseRate,
          perKm,
          perMin,
          vehicleType,
          vehicleWeight,
          distanceCharge,
          timeCharge,
          dwellCharge,
          km,
          driveMinutes,
          dwellTotalMinutes: dwellTotalMin,
          fuel: {
            liters: Number(liters.toFixed(2)),
            fuelEfficiencyKmPerL,
            fuelPricePerL,
            fuelCost
          }
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


