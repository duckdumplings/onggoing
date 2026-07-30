import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { suggestCheaperNextTier } from '@/domains/quote/pricing'
import {
  calculateFuelSurchargeFromPayload,
  calculatePerJobReferenceFromPayloads,
  pickHourlyRateFromPayload,
  resolveFuelSurchargeTable,
  resolveHourlyRateTable,
  resolvePerJobRateTable,
} from '@/domains/quote/services/rateTableService'

const QuoteInputSchema = z.object({
  distance: z.number().finite().nonnegative(), // meters
  time: z.number().finite().nonnegative(), // seconds
  vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
  dwellMinutes: z.array(z.number().finite().nonnegative()).default([]),
  waitMinutes: z.number().finite().nonnegative().default(0),
  stopsCount: z.number().int().nonnegative().default(0),
  scheduleType: z.enum(['regular', 'ad-hoc']).default('ad-hoc'),
  hourlyRateOverride: z.number().finite().positive().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = QuoteInputSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '거리·시간·차종·체류시간 입력을 확인해 주세요.',
          details: parsed.error.issues,
        },
      }, { status: 400 })
    }
    const body = parsed.data
    const { distance, time, vehicleType, dwellMinutes, waitMinutes, stopsCount, scheduleType } = body
    const vehicleKey = vehicleType === '스타렉스' ? 'starex' : 'ray'

    const dwellTotalMin = dwellMinutes.reduce((a, b) => a + b, 0)

    const km = distance / 1000
    const driveMinutes = Math.ceil(time / 60)
    // 구속시간 = 주행 + 체류 + 현장 대기(조기배송 금지). 시간당 과금 기준.
    const totalMinutes = driveMinutes + dwellTotalMin + waitMinutes

    // 요금제별 계산
    // 1) 시간당(30분 올림, 최소 120분, 유류할증은 과금시간 기반 초과거리에만 적용)
    // DB rate_tables 우선 lookup, 실패 시 코드 정적 fallback 자동 적용.
    const asOf = new Date()
    const perJobOwnPromise = resolvePerJobRateTable(vehicleKey, asOf)
    const [hourlyRateTable, fuelSurchargeTable, perJobOwn, perJobStarex] = await Promise.all([
      resolveHourlyRateTable(vehicleKey, asOf),
      resolveFuelSurchargeTable(vehicleKey, asOf),
      perJobOwnPromise,
      vehicleKey === 'starex' ? perJobOwnPromise : resolvePerJobRateTable('starex', asOf),
    ])
    const unitMinutes = hourlyRateTable.payload.unitMinutes
    const billMinutes = Math.max(
      hourlyRateTable.payload.minBillMinutes,
      Math.ceil(totalMinutes / unitMinutes) * unitMinutes,
    )
    // 협의 단가(시간당) 지정 시 운임표 대신 사용. 임의 추정이 아니라 호출자가 명시한 값만 반영.
    const overrideRate = body.hourlyRateOverride
    const useRateOverride = overrideRate != null
    const maxTableMinutes = hourlyRateTable.payload.tiers.at(-1)?.maxMinutes ?? 0
    if (!useRateOverride && billMinutes > maxTableMinutes) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'RATE_TABLE_RANGE_EXCEEDED',
          message: `시간당 운임표는 최대 ${maxTableMinutes / 60}시간까지 자동 견적을 지원합니다. ${billMinutes / 60}시간 운행은 운영팀 확인이 필요합니다.`,
          details: { billMinutes, maxTableMinutes, vehicleType },
        },
      }, { status: 422 })
    }
    const tableRatePerHour = useRateOverride
      ? null
      : pickHourlyRateFromPayload(hourlyRateTable.payload, billMinutes)
    const ratePerHour = overrideRate ?? Number(tableRatePerHour)
    const hourlyBase = ratePerHour * (billMinutes / 60)
    // 유류할증 단일화: 포함거리·초과거리·10km 구간 수와 합계를 같은 함수에서 산출한다.
    const fuelSurchargeBreakdown = calculateFuelSurchargeFromPayload(
      vehicleKey,
      fuelSurchargeTable.payload,
      km,
      billMinutes,
    )
    const hourlyFuelSurcharge = fuelSurchargeBreakdown.total
    const hourlyTotal = Math.round(hourlyBase + hourlyFuelSurcharge)

    // 단건은 공식 대표값이 아니라 요청 시 제공하는 참고 운임이다.
    const perJobReference = calculatePerJobReferenceFromPayloads({
      vehicle: vehicleKey,
      scheduleType,
      km,
      stopsCount,
      own: perJobOwn.payload,
      starex: perJobStarex.payload,
    })

    return NextResponse.json({
      success: true,
      // 옹고잉 운임표 기반 요금제(시간당/단건). 거리·시간 메타는 디버깅/표시용.
      meta: {
        vehicleType,
        km,
        driveMinutes,
        dwellTotalMinutes: dwellTotalMin,
        waitMinutes,
        totalMinutes,
        dwellMinutes,
        distance,
        time,
      },
      plans: {
        hourly: (() => {
          const selectedTier = hourlyRateTable.payload.tiers.find(
            (tier) => billMinutes <= tier.maxMinutes,
          )
          const dailyFromTable = useRateOverride
            ? Math.round(ratePerHour * (billMinutes / 60))
            : Number(selectedTier?.dailyFare ?? Math.round(ratePerHour * (billMinutes / 60)))
          const monthly20dFromTable = useRateOverride
            ? dailyFromTable * 20
            : Number(selectedTier?.monthly20dFare ?? dailyFromTable * 20)
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
            fuelSurchargeBreakdown,
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
            fuelSurchargeRateTable: {
              source: fuelSurchargeTable.source,
              effectiveFrom: fuelSurchargeTable.effectiveFrom,
              sourceDoc: fuelSurchargeTable.sourceDoc,
            },
          }
        })(),
        perJob: {
          ...perJobReference,
          formatted: perJobReference.total == null
            ? null
            : `₩${perJobReference.total.toLocaleString('ko-KR')}`,
          scheduleType,
          rateTable: {
            source: perJobOwn.source,
            effectiveFrom: perJobOwn.effectiveFrom,
            sourceDoc: perJobOwn.sourceDoc,
          },
        }
      }
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: e?.message || 'unknown' } }, { status: 500 })
  }
}
