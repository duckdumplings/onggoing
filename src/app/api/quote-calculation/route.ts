import { NextRequest, NextResponse } from 'next/server'
import { perJobBasePrice, perJobRegularPrice, STOP_FEE, fuelSurchargeHourlyCorrect, suggestCheaperNextTier } from '@/domains/quote/pricing'
import { pickHourlyRateFromPayload, resolveHourlyRateTable } from '@/domains/quote/services/rateTableService'

type QuoteInput = {
  distance: number // meters
  time: number // seconds
  vehicleType?: string
  dwellMinutes?: number[] // per-stop dwell/handling minutes
  stopsCount?: number // optional, 중간 경유지 개수(도착지 제외)
  scheduleType?: 'regular' | 'ad-hoc' // 단건: 정기/비정기
  hourlyRateOverride?: number // 협의 단가(시간당 KRW). 지정 시 운임표 대신 사용.
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

    const dwellTotalMin = dwellMinutes.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)

    const km = distance / 1000
    const driveMinutes = Math.ceil(time / 60)
    const totalMinutes = driveMinutes + dwellTotalMin

    // 요금제별 계산
    // 1) 시간당(30분 올림, 최소 120분, 유류할증은 과금시간 기반 초과거리에만 적용)
    // DB rate_tables 우선 lookup, 실패 시 코드 정적 fallback 자동 적용.
    const billMinutes = Math.max(120, Math.ceil(totalMinutes / 30) * 30)
    const hourlyRateTable = await resolveHourlyRateTable(vehicleKey, new Date())
    const tableRatePerHour = pickHourlyRateFromPayload(hourlyRateTable.payload, billMinutes)
    // 협의 단가(시간당) 지정 시 운임표 대신 사용. 임의 추정이 아니라 호출자가 명시한 값만 반영.
    const overrideRate = Number(body.hourlyRateOverride)
    const useRateOverride = Number.isFinite(overrideRate) && overrideRate > 0
    const ratePerHour = useRateOverride ? overrideRate : tableRatePerHour
    const hourlyBase = ratePerHour * (billMinutes / 60)
    // 유류할증 단일화: pricing.fuelSurchargeHourlyCorrect 사용(과금시간×10km 포함거리, 초과분 10km당 정액).
    const hourlyFuelSurcharge = fuelSurchargeHourlyCorrect(vehicleKey, km, billMinutes)
    const hourlyTotal = Math.round(hourlyBase + hourlyFuelSurcharge)

    // 2) 단건(구간표 + 초과km, 경유지 정액, 정기/비정기 구분)
    const perJobBase = perJobBasePrice(vehicleKey, km)
    const perJobStopFee = STOP_FEE[vehicleKey] * Math.max(0, stopsCount)

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
      // 옹고잉 운임표 기반 요금제(시간당/단건). 거리·시간 메타는 디버깅/표시용.
      meta: {
        vehicleType,
        km,
        driveMinutes,
        dwellTotalMinutes: dwellTotalMin,
        totalMinutes,
        dwellMinutes,
        distance,
        time,
      },
      plans: {
        hourly: (() => {
          const dailyFromTable = Math.round(ratePerHour * (billMinutes / 60))
          const monthly20dFromTable = dailyFromTable * 20
          // 협의 단가 적용 시 운임표 기반 절감 조언은 의미가 없으므로 생략.
          const tierAdvice = useRateOverride ? null : suggestCheaperNextTier(vehicleKey, billMinutes)
          return {
            total: hourlyTotal,
            formatted: `₩${hourlyTotal.toLocaleString('ko-KR')}`,
            billMinutes,
            ratePerHour,
            rateOverride: useRateOverride,
            tableRatePerHour,
            fuelSurcharge: hourlyFuelSurcharge,
            tiers: {
              perTrip: {
                value: hourlyTotal,
                formatted: `₩${hourlyTotal.toLocaleString('ko-KR')}`,
                note: '유류할증 포함 1회 견적',
              },
              perDay: {
                value: dailyFromTable,
                formatted: `₩${dailyFromTable.toLocaleString('ko-KR')}`,
                note: '운임표 일일 운임 (시간당 × 시간, 유류할증 제외)',
              },
              perMonth20d: {
                value: monthly20dFromTable,
                formatted: `₩${monthly20dFromTable.toLocaleString('ko-KR')}`,
                note: '운임표 20일 기준 (일일 × 20, 유류할증 제외)',
              },
            },
            advisor: tierAdvice,
            rateTable: {
              source: hourlyRateTable.source,
              effectiveFrom: hourlyRateTable.effectiveFrom,
              sourceDoc: hourlyRateTable.sourceDoc,
            },
          }
        })(),
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


