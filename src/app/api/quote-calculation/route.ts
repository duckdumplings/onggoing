import { NextRequest, NextResponse } from 'next/server'
import { perJobBasePrice, perJobRegularPrice, STOP_FEE, fuelSurchargeHourly, pickHourlyRate } from '@/domains/quote/pricing'

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

    // 디버그: 체류시간 계산 확인
    console.log('Dwell time debug:', {
      dwellMinutes,
      dwellTotalMin,
      stopsCount,
      scheduleType,
      inputLength: dwellMinutes.length,
      expectedLength: stopsCount + 1 // 출발지 제외한 목적지 수
    })

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

    // 2) 단건(구간표 + 초과km, 경유지 정액, 정기/비정기 구분)
    const perJobBase = perJobBasePrice(vehicleKey, km)
    const perJobStopFee = STOP_FEE[vehicleKey] * Math.max(0, stopsCount)

    // 디버그: 단건 요금 계산 확인
    console.log('Per-job pricing debug:', {
      km,
      vehicleKey,
      scheduleType,
      perJobBase,
      perJobStopFee,
      stopsCount,
      regularFactor: scheduleType === 'regular' ? Number(process.env.PER_JOB_REGULAR_FACTOR ?? 1.2) : 1,
      regularBase: scheduleType === 'regular' ? perJobRegularPrice(vehicleKey, km) : null,
      regularStopFee: scheduleType === 'regular' ? (vehicleKey === 'ray' ? STOP_FEE.starex * Math.max(0, stopsCount) : Math.round(perJobStopFee * (Number(process.env.PER_JOB_REGULAR_FACTOR ?? 1.2)))) : null
    })

    // 정기/비정기 구분: 정기는 요금표 기반, 비정기는 기본 요금
    let perJobTotal: number
    let baseEffective: number
    let stopFeeEffective: number

    if (scheduleType === 'regular') {
      // 정기 요금: 요금표 기반으로 계산
      const regularBase = perJobRegularPrice(vehicleKey, km)
      // 레이 정기는 스타렉스 경유지 정액 사용, 스타렉스 정기는 기본 경유지 정액 + 가산율
      const regularStopFee = vehicleKey === 'ray'
        ? STOP_FEE.starex * Math.max(0, stopsCount)  // 레이 정기: 스타렉스 경유지 정액
        : Math.round(perJobStopFee * (Number(process.env.PER_JOB_REGULAR_FACTOR ?? 1.2)))  // 스타렉스 정기: 기본 + 가산율
      perJobTotal = regularBase + regularStopFee
      baseEffective = regularBase
      stopFeeEffective = regularStopFee
    } else {
      // 비정기 요금: 기본 요금
      perJobTotal = perJobBase + perJobStopFee
      baseEffective = perJobBase
      stopFeeEffective = perJobStopFee
    }

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
          scheduleType,
          regularFactor: scheduleType === 'regular' ? Number(process.env.PER_JOB_REGULAR_FACTOR ?? 1.2) : 1,
        }
      }
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: e?.message || 'unknown' } }, { status: 500 })
  }
}


