import { NextRequest, NextResponse } from 'next/server'
import { perJobBasePrice, STOP_FEE, fuelSurchargeHourly, pickHourlyRate } from '@/domains/quote/pricing'

type QuoteInput = {
  distance: number // meters
  time: number // seconds
  vehicleType?: string
  dwellMinutes?: number[] // per-stop dwell/handling minutes
  stopsCount?: number // optional, 중간 경유지 개수(도착지 제외)
  scheduleType?: 'regular' | 'ad-hoc' // 단건: 정기/비정기
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QuoteInput
    const distance = Number(body.distance || 0)
    const time = Number(body.time || 0)
    const vehicleType = String(body.vehicleType || '레이')
    const vehicleKey = vehicleType === '스타렉스' ? 'starex' : 'ray'
    const dwellMinutes = Array.isArray(body.dwellMinutes) ? body.dwellMinutes.map((n) => Math.max(0, Number(n || 0))) : []
    const stopsCount = Number.isFinite(body.stopsCount as any) ? Number(body.stopsCount) : dwellMinutes.length
    const scheduleType = (body.scheduleType as 'regular' | 'ad-hoc') || 'ad-hoc'

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
    const totalMinutes = driveMinutes + dwellTotalMin

    const distanceCharge = km * perKm
    const timeCharge = driveMinutes * perMin
    const dwellCharge = dwellTotalMin * perMin

    const subtotal = baseRate + distanceCharge + timeCharge + dwellCharge
    const totalPrice = Math.round(subtotal * vehicleWeight)

    const liters = fuelEfficiencyKmPerL > 0 ? km / fuelEfficiencyKmPerL : 0
    const fuelCost = Math.round(liters * fuelPricePerL)

    const formattedTotal = `₩${totalPrice.toLocaleString('ko-KR')}`

    // 추가: 요금제별 계산
    // 1) 시간당(30분 올림, 최소 120분, 유류비 할증표만 적용, 벌크 미적용)
    const billMinutes = Math.max(120, Math.ceil(totalMinutes / 30) * 30)
    const ratePerHour = pickHourlyRate(vehicleKey, billMinutes)
    const hourlyBase = ratePerHour * (billMinutes / 60)
    // 포함거리 = 10km * 과금시간(시간)
    const includedKm = 10 * (billMinutes / 60)
    const surchargeKm = Math.max(0, km - includedKm)
    const bins = Math.ceil(surchargeKm / 10)
    const binCharge = vehicleKey === 'ray' ? 2000 : 2800
    const hourlyFuelSurcharge = bins * binCharge
    const hourlyTotal = Math.round(hourlyBase + hourlyFuelSurcharge)

    // 2) 단건(구간표 + 초과km, 경유지 정액, 벌크 적용 가능)
    const perJobBase = perJobBasePrice(vehicleKey, km)
    const perJobStopFee = STOP_FEE[vehicleKey] * Math.max(0, stopsCount)
    // 정기/비정기 가산(환경변수, 기본 1.0)
    const perJobRegularFactor = Number(process.env.PER_JOB_REGULAR_FACTOR ?? 1.0)
    const rawSum = perJobBase + perJobStopFee
    const perJobBasicTotal = Math.round(rawSum * (scheduleType === 'regular' ? perJobRegularFactor : 1))
    // 표시용 분해값(정기 가산 반영시 합계가 정확히 일치하도록 배분)
    let baseEffective: number | null = perJobBase
    let stopFeeEffective: number | null = perJobStopFee
    if (scheduleType === 'regular') {
      const scale = rawSum > 0 ? perJobBasicTotal / rawSum : 1
      baseEffective = Math.round(perJobBase * scale)
      stopFeeEffective = perJobBasicTotal - baseEffective
    }
    // 벌크 로직(시간당 미적용): Ray_bulk = Starex_basic, Starex_bulk = Starex_basic*(1+r)
    // r = (S_basic - R_basic)/R_basic
    const rayBasic = perJobBasePrice('ray', km) + STOP_FEE['ray'] * Math.max(0, stopsCount)
    const starexBasic = perJobBasePrice('starex', km) + STOP_FEE['starex'] * Math.max(0, stopsCount)
    const r = rayBasic > 0 ? (starexBasic - rayBasic) / rayBasic : 0
    const perJobBulkRay = starexBasic
    const perJobBulkStarex = Math.round(starexBasic * (1 + r))

    const perJobTotal = perJobBasicTotal

    return NextResponse.json({
      success: true,
      // 기존 UI 호환: 기본표시는 시간당 총액
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
          totalMinutes,
          dwellMinutes,
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
      },
      plans: {
        hourly: {
          total: hourlyTotal,
          formatted: `₩${hourlyTotal.toLocaleString('ko-KR')}`,
          billMinutes,
          ratePerHour,
          fuelSurcharge: hourlyFuelSurcharge,
        },
        perJob: {
          total: perJobTotal,
          formatted: `₩${perJobTotal.toLocaleString('ko-KR')}`,
          base: perJobBase,
          stopFee: perJobStopFee,
          baseEffective: baseEffective,
          stopFeeEffective: stopFeeEffective,
          bulk: false, // 벌크 로직 제거
          bulkRay: perJobBulkRay,
          bulkStarex: perJobBulkStarex,
          rayBasic,
          starexBasic,
          scheduleType,
          regularFactor: scheduleType === 'regular' ? perJobRegularFactor : 1,
          isBulkAndRegular: false, // 벌크 로직 제거
        }
      }
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: e?.message || 'unknown' } }, { status: 500 })
  }
}


