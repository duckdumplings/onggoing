/**
 * 견적 에이전트 도구 레이어 (AI SDK function-calling).
 *
 * 원칙: LLM은 추론/계획만, 좌표·요금 등 사실은 전부 이 도구들이 결정론적으로 산출한다.
 * 각 도구는 기존 도메인 서비스/내부 API에 위임한다(로직 이중화 방지).
 *
 * 요청 컨텍스트(baseUrl/sessionId)가 필요하므로 요청마다 buildQuoteAgentTools로 생성한다.
 */

import { tool } from 'ai';
import { z } from 'zod';

import { createServerClient } from '@/libs/supabase-client';
import { geocodeStopAddresses } from '@/domains/dispatch/services/stopGeocoder';
import { buildRolePayload } from '@/domains/dispatch/services/rolePayload';
import { annualizePrice, formatFrequency } from '@/domains/dispatch/utils/frequency';
import { resolveDeparturePresets } from '@/domains/dispatch/utils/departureMatrix';
import type { Frequency } from '@/domains/dispatch/types/routePlan';
import {
  type DeadlineTarget,
  parseHHMM,
  nextIsoAtHHMM,
  kstMinutesOfDay,
  kstHHmm,
  buildAddressRoleMap,
  pickTargetArrivalIso,
  judgeDeadline,
} from '@/domains/dispatch/utils/deliveryDeadline';
import { postRouteOptimizationCached } from '@/domains/dispatch/services/routeOptCache';
import { computeCaseBoard, CaseBoardCaseInputSchema } from '@/domains/dispatch/services/caseBoard';
import { retrieveRagContext } from '@/domains/quote/services/ragRetriever';
import {
  estimatedFuelCost,
  FUEL_EFFICIENCY_KM_PER_L,
  type Vehicle as PricingVehicle,
} from '@/domains/quote/pricing';
import { getFuelPricePerLiter } from '@/domains/quote/services/fuelPriceProvider';
import {
  FrequencySchema,
  QuoteScenarioSchema,
  RouteStopSchema,
  toDomainStops,
  validatePlan,
} from '@/domains/quote/agent/workingMemory';

export interface AgentToolContext {
  baseUrl: string;
  sessionId?: string | null;
  departureAt?: string;
  /** 도구 호출 추적용 콜백(트레이싱). */
  onToolEvent?: (event: { tool: string; input: unknown; output: unknown }) => void;
}

function won(v: number): string {
  return `₩${Math.round(v).toLocaleString('ko-KR')}`;
}

/** 유가 출처를 사람이 읽을 라벨로(오피넷이면 유종/거래일 포함). */
function fuelSourceLabelOf(
  fuel: { source: 'manual' | 'opinet' | 'default'; tradeDate?: string },
  vehicleKey: PricingVehicle
): string {
  if (fuel.source === 'opinet') {
    return `오피넷 전국 평균(${vehicleKey === 'ray' ? '휘발유' : '경유'}${fuel.tradeDate ? ` ${fuel.tradeDate}` : ''})`;
  }
  if (fuel.source === 'manual') return '수동 설정 유가';
  return '기본 가정 유가';
}

export function buildQuoteAgentTools(ctx: AgentToolContext) {
  const track = (toolName: string, input: unknown, output: unknown) => {
    try {
      ctx.onToolEvent?.({ tool: toolName, input, output });
    } catch {
      /* 추적 실패는 무시 */
    }
  };

  return {
    geocode_addresses: tool({
      description:
        '주소/POI명을 좌표로 해석한다. 주소가 모호하거나 POI명("노원구청")일 때 먼저 호출해 좌표를 확정하라. 좌표는 절대 추측하지 말고 이 도구만 사용.',
      inputSchema: z.object({
        addresses: z.array(z.string().min(1)).min(1).describe('해석할 주소/POI명 목록'),
      }),
      execute: async ({ addresses }) => {
        const cache = await geocodeStopAddresses(addresses);
        const results = addresses.map((a) => {
          const hit = cache.get(a.trim());
          return {
            query: a,
            resolved: Boolean(hit?.resolved),
            // 구/동 단위로만 해석됨 → 실제 배송 지점 아님. 정확한 주소 재확인 필요.
            lowPrecision: Boolean(hit?.lowPrecision),
            address: hit?.address ?? a,
            latitude: hit?.latitude ?? null,
            longitude: hit?.longitude ?? null,
          };
        });
        track('geocode_addresses', { addresses }, results);
        return { results };
      },
    }),

    get_fuel_price: tool({
      description:
        '경로/견적 없이도 현재 차종별 유가(L당 원)를 조회한다. 사용자가 "지금 유가 얼마야", "기름값 얼마", "현재 휘발유/경유 가격" 등 유가 자체를 물으면 견적을 강요하지 말고 이 도구를 호출해 답하라. 유가 수치는 절대 추측하지 말고 이 도구 결과만 인용한다(출처/기준일 포함).',
      inputSchema: z.object({
        vehicleType: z
          .enum(['레이', '스타렉스'])
          .default('레이')
          .describe('레이=휘발유, 스타렉스=경유. 차종 언급 없이 유가만 물으면 둘 다 안내해도 된다.'),
      }),
      execute: async ({ vehicleType }) => {
        const vehicleKey: PricingVehicle = vehicleType === '스타렉스' ? 'starex' : 'ray';
        const fuel = await getFuelPricePerLiter(vehicleKey);
        const out = {
          vehicleType,
          fuelType: vehicleKey === 'ray' ? '휘발유' : '경유',
          pricePerLiter: fuel.pricePerLiter,
          source: fuel.source,
          sourceLabel: fuelSourceLabelOf(fuel, vehicleKey),
          tradeDate: fuel.tradeDate ?? null,
          fuelEfficiencyKmPerL: FUEL_EFFICIENCY_KM_PER_L[vehicleKey],
          note: '유가는 일 단위로 갱신되는 참고치이며, 실제 주유 시점·지역에 따라 달라질 수 있다. 견적의 유류할증과는 별개 개념이다.',
        };
        track('get_fuel_price', { vehicleType }, { pricePerLiter: out.pricePerLiter, source: out.source });
        return out;
      },
    }),

    optimize_route: tool({
      description:
        '역할 태깅된 경유지로 최적 경로를 계산해 거리(km)/주행시간/순서와 Tmap 경로 실측 통행료(tollAmount/tollSource)를 반환한다. 출발지는 픽업(pickup) 중 시스템이 비용 최소로 자동 선택(open-start)하며 배송지/반납지는 출발지가 되지 않는다. 종착지는 반납(return)이 있으면 마지막 반납으로, 없으면 마지막 drop으로 고정된다(반납이 여러 번이면 그 외 반납은 중간 방문). 좌표가 없으면 내부에서 지오코딩한다. 입력(파일/메일)에 방문 시각·순번이 명확해 그 순서를 그대로 지켜야 하면 preserveOrder=true로 호출해 재정렬 없이 받은 순서대로 계산하라. 이어서 calculate_quote를 호출할 땐 여기서 받은 tollAmount/tollSource를 그대로 넘겨 실측 통행료가 반영되게 하라.',
      inputSchema: z.object({
        stops: z.array(RouteStopSchema).min(2),
        vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
        roadOption: z.enum(['time-first', 'free-first', 'highway-first']).default('time-first'),
        preserveOrder: z
          .boolean()
          .default(false)
          .describe('입력 순서를 그대로 존중(재최적화 안 함). 배송 시각/순번이 명확한 라인일 때만 true. 첫 stop=출발, 마지막=종착으로 고정된다.'),
      }),
      execute: async ({ stops, vehicleType, roadOption, preserveOrder }) => {
        const domainStops = toDomainStops(stops);
        const cache = await geocodeStopAddresses(domainStops.map((s) => s.address));
        const toPoint = (address: string) => {
          const hit = cache.get(address.trim());
          if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
            return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
          }
          return address;
        };
        // 출발지/순서/open-start 규칙은 buildRolePayload로 단일화. 일반 경로는 정확해(fastOrder=false).
        // preserveOrder=true면 입력 순서를 그대로 존중(재정렬/open-start 없음).
        const payload = buildRolePayload({
          stops: domainStops,
          toPoint,
          vehicleType,
          roadOption,
          // 견적 산정과 지도 미리보기 결과 일치를 위해 출발 시각을 고정.
          departureAt: ctx.departureAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          fastOrder: false,
          preserveOrder,
        });

        const { ok, status, json: body } = await postRouteOptimizationCached(ctx.baseUrl, payload);
        if (!ok) {
          const failed = body?.diagnostics?.failedAddresses;
          const message = Array.isArray(failed) && failed.length
            ? `주소를 찾지 못했어요: ${failed.map((f: any) => f?.address).filter(Boolean).join(', ')}`
            : body?.error || body?.message || `경로 계산 실패 (HTTP ${status})`;
          track('optimize_route', payload, { error: message });
          return { error: message };
        }
        const json = body;
        const summary = json?.data?.summary;
        // 구/동 단위로만 해석돼 실제 배송 지점이 불확실한 지점을 모아 에이전트에 알린다.
        const lowPrecisionStops = domainStops
          .map((s) => s.address)
          .filter((addr) => cache.get(addr.trim())?.lowPrecision);
        // 선택된 도로옵션의 통행료. Tmap segment fare 합산이면 'api'(실측, 무료도로 0원 포함).
        // 실측이 없으면(주로 API 실패) 추정하지 않고 'unavailable'로 둔다(실비 정산).
        const selectedRoad = Array.isArray(summary?.roadComparisons)
          ? summary.roadComparisons.find((c: any) => c?.isSelected)
          : null;
        const tollIsApi = selectedRoad?.tollSource === 'api' && Number.isFinite(Number(selectedRoad?.estimatedToll));
        const tollAmount = tollIsApi ? Math.round(Number(selectedRoad.estimatedToll)) : null;
        const tollSource: 'api' | 'unavailable' | null =
          tollIsApi ? 'api' : selectedRoad ? 'unavailable' : null;
        const out = {
          km: Number(summary?.totalDistance || 0) / 1000,
          driveMinutes: Math.round(Number(summary?.travelTime || 0) / 60),
          dwellMinutes: Math.round(Number(summary?.dwellTime || 0) / 60),
          // Tmap 경로 실측 통행료(있으면). calculate_quote에 tollAmount/tollSource로 그대로 넘겨라.
          tollAmount,
          tollSource,
          optimizedOrder: summary?.optimizationInfo?.optimizedOrder ?? null,
          // open-start로 시스템이 고른 출발지/근거(메일 순서 고정이 아님).
          openStart: Boolean(summary?.openStart),
          chosenOrigin: summary?.chosenOrigin ?? null,
          originRationale: summary?.originRationale ?? null,
          // 구/동 단위로만 해석된 지점(정확한 좌표 아님). 비어있지 않으면 거리/요금을 확정값처럼 단정하지 말 것.
          lowPrecisionStops,
          // 지도 렌더용 경로 페이로드(좌표 해석본). 클라이언트가 그대로 재사용한다.
          routeRequest: { ...payload, useRealtimeTraffic: true },
        };
        track('optimize_route', payload, { km: out.km, driveMinutes: out.driveMinutes, openStart: out.openStart });
        return out;
      },
    }),

    calculate_quote: tool({
      description:
        '경로 메트릭(km/주행분)과 차종/스케줄로 시간당·단건 요금을 결정론적으로 계산한다. 금액 산술은 절대 추론하지 말고 이 도구만 사용. 정기 빈도가 있으면 연 환산도 함께 반환.',
      inputSchema: z.object({
        km: z.number().nonnegative(),
        driveMinutes: z.number().nonnegative(),
        dwellMinutes: z.array(z.number().nonnegative()).optional().describe('지점별 체류 시간(분) 배열'),
        stopsCount: z.number().nonnegative().optional().describe('중간 경유지 수(종착지 제외)'),
        vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
        scheduleType: z.enum(['regular', 'ad-hoc']).default('ad-hoc'),
        frequency: FrequencySchema.optional(),
        customHourlyRate: z
          .number()
          .positive()
          .optional()
          .describe('사용자가 명시한 협의 시간당 단가(KRW/시간). 지정되면 시간당 요금제를 이 단가로 계산하고 추천 요금제로 삼는다. 절대 임의로 지어내지 말 것.'),
        tollAmount: z
          .number()
          .nonnegative()
          .optional()
          .describe('optimize_route가 돌려준 Tmap 실측 통행료(원, 무료도로는 0). 실측이 있으면 반드시 그대로 넘겨라. 임의 추정 금지.'),
        tollSource: z
          .enum(['api', 'unavailable'])
          .optional()
          .describe("optimize_route의 tollSource 값('api'=Tmap 실측, 'unavailable'=산출 불가). tollAmount와 함께 그대로 넘겨라."),
      }),
      execute: async ({ km, driveMinutes, dwellMinutes, stopsCount, vehicleType, scheduleType, frequency, customHourlyRate, tollAmount, tollSource }) => {
        const body = {
          distance: km * 1000,
          time: driveMinutes * 60,
          vehicleType,
          dwellMinutes: dwellMinutes ?? [],
          stopsCount: stopsCount ?? (dwellMinutes?.length ?? 0),
          scheduleType,
          hourlyRateOverride: customHourlyRate,
        };
        const res = await fetch(new URL('/api/quote-calculation', ctx.baseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const message = err?.error?.message || `견적 계산 실패 (HTTP ${res.status})`;
          track('calculate_quote', body, { error: message });
          return { error: message };
        }
        const json = await res.json();
        const perJobTotal = Number(json?.plans?.perJob?.total ?? 0);
        const hourlyTotal = Number(json?.plans?.hourly?.total ?? 0);
        const rateOverride = Boolean(json?.plans?.hourly?.rateOverride);
        const freq = frequency as Frequency | undefined;
        // 추천/대표값 정책:
        // - 협의 단가가 지정되면 시간당(협의가) 요금제를 대표값으로 사용.
        // - 그 외 기본은 "옹고잉 유리" = 두 요금제 중 높은 쪽. (화주에게는 둘 다 제시)
        const recommendedPlan: 'hourly' | 'perJob' = rateOverride
          ? 'hourly'
          : hourlyTotal >= perJobTotal
            ? 'hourly'
            : 'perJob';
        const representative = recommendedPlan === 'hourly' ? hourlyTotal : perJobTotal;

        // 견적 카드(거리/시간/차종)와 실비 투명성 카드가 채워지도록 basis를 결정적으로 구성한다.
        const vehicleKey: PricingVehicle = vehicleType === '스타렉스' ? 'starex' : 'ray';
        const meta = json?.meta ?? {};
        const distanceKm = Number(meta.km ?? km);
        const driveMins = Number(meta.driveMinutes ?? driveMinutes);
        const dwellTotalMinutes = Number(meta.dwellTotalMinutes ?? (dwellMinutes?.reduce((a, b) => a + b, 0) ?? 0));
        const totalBillMinutes = Number(json?.plans?.hourly?.billMinutes ?? 0);
        const destinationCount = Math.max(1, (stopsCount ?? dwellMinutes?.length ?? 0) + 1);
        const basis = {
          vehicleType,
          scheduleType,
          distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(1)) : 0,
          driveMinutes: driveMins,
          dwellTotalMinutes,
          totalBillMinutes,
          destinationCount,
        };

        // 실비 참고치(요금제 청구액과 별개): 현재 유가 기준 예상 유류비 + 예상 통행료.
        // 유가는 오피넷(한국석유공사) 라이브 유종별 평균가 → 키 없으면 기본값 폴백.
        const fuel = await getFuelPricePerLiter(vehicleKey);
        const fuelSourceLabel = fuelSourceLabelOf(fuel, vehicleKey);
        // 통행료: optimize_route의 Tmap 실측(tollSource='api', 무료도로 0원 포함)만 사용한다.
        // 실측이 없으면 추정하지 않고 null로 둔다(통행료는 견적서 항목이 아니라 실주행 하이패스 실비 정산).
        const hasApiToll = tollSource === 'api' && Number.isFinite(Number(tollAmount));
        const tollValue: number | null = hasApiToll ? Math.round(Number(tollAmount)) : null;
        const tollSourceResolved: 'api' | 'unavailable' = hasApiToll ? 'api' : 'unavailable';
        const tollSourceLabel = hasApiToll ? 'Tmap 경로 실측 통행료' : '실주행 하이패스 실비 정산(경로 기반 산출 불가)';
        const tollNote = hasApiToll
          ? (tollValue === 0 ? '예상 통행료는 Tmap 경로 실측 기준 0원(무료도로)' : '예상 통행료는 Tmap 경로 실측 기준')
          : '통행료는 실주행 하이패스 실비로 정산되며, 이번 경로는 실측값을 산출하지 못해 금액을 단정하지 않는다';
        const costReference = distanceKm > 0
          ? {
              estimatedFuel: estimatedFuelCost(vehicleKey, distanceKm, fuel.pricePerLiter),
              estimatedToll: tollValue,
              tollSource: tollSourceResolved,
              tollSourceLabel,
              fuelPricePerLiter: fuel.pricePerLiter,
              fuelEfficiencyKmPerL: FUEL_EFFICIENCY_KM_PER_L[vehicleKey],
              fuelPriceSource: fuel.source,
              fuelPriceSourceLabel: fuelSourceLabel,
              note: `예상 유류비는 ${fuelSourceLabel} 기준 실주행 연료비 추정(유류할증과 다른 개념). ${tollNote}. 모두 참고용이며 유가·경로에 따라 달라질 수 있다.`,
            }
          : null;

        const out = {
          plans: json?.plans ?? null,
          recommendedPlan,
          rateOverride,
          oneTimePrice: representative,
          annualPrice: annualizePrice(representative, freq),
          basis,
          costReference,
          hourly: {
            total: hourlyTotal,
            ratePerHour: Number(json?.plans?.hourly?.ratePerHour ?? 0),
            billMinutes: Number(json?.plans?.hourly?.billMinutes ?? 0),
            rateOverride,
            formatted: won(hourlyTotal),
          },
          perJob: { total: perJobTotal, formatted: won(perJobTotal) },
          frequencyLabel: formatFrequency(freq),
          formattedOneTime: won(representative),
          formattedAnnual: won(annualizePrice(representative, freq)),
        };
        track('calculate_quote', body, { recommendedPlan, oneTimePrice: representative, rateOverride });
        return out;
      },
    }),

    compare_scenarios: tool({
      description:
        '여러 시나리오(예: 3/5/10개 지점)를 동시에 경로 계산·견적해 비교 테이블을 만든다. 각 시나리오는 역할 태깅된 stops를 가진다. 사용자가 여러 경우를 요청하면 이 도구를 사용하라.',
      inputSchema: z.object({
        scenarios: z.array(QuoteScenarioSchema).min(2),
        sortKey: z.enum(['annualPrice', 'oneTimePrice', 'km', 'totalMinutes']).default('annualPrice'),
      }),
      execute: async ({ scenarios, sortKey }) => {
        const res = await fetch(new URL('/api/dispatch/scenario-quote', ctx.baseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenarios, sortKey, departureAt: ctx.departureAt }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const message = err?.error?.message || `시나리오 비교 실패 (HTTP ${res.status})`;
          track('compare_scenarios', { count: scenarios.length }, { error: message });
          return { error: message };
        }
        const json = await res.json();
        const out = {
          comparison: json?.comparison ?? null,
          routeErrors: json?.routeErrors ?? [],
          scenarioRoutes: json?.scenarioRoutes ?? [],
        };
        track('compare_scenarios', { count: scenarios.length, sortKey }, { ...out, scenarioRoutes: out.scenarioRoutes.length });
        return out;
      },
    }),

    quote_case_board: tool({
      description:
        '여러 케이스(예: 권역×점심/저녁×요일)를 한꺼번에 받아 케이스별로 교통 반영 소요시간·마지막 배송 마감 충족(O/X)·견적(시간당/단건)·지도 경로를 한 "보드"로 산출하고, 월간/계약 합계 롤업까지 돌려준다. 사용자가 밥따봉 메모처럼 다수 라인/시간대를 한 번에 견적 요청하면(여러 권역, 점심/저녁, 요일 패턴) 라인마다 따로 산문으로 나열하지 말고 반드시 이 도구를 써라. 각 케이스는 역할 태깅된 stops를 가진다. 마감은 기본적으로 "마지막 배송(drop) 완료" 기준이며(deadlineTarget), 서초 반납 복귀는 마감 없는 업무 종료 시각이다. 월요일처럼 반납이 없으면 그 케이스에 return stop을 넣지 마라. 점심/저녁은 출발시각만 다른 별도 케이스로 나눠라. 월간 합계가 필요하면 각 케이스의 monthlyVisits(그 달 운행 횟수)와 contractMonths를 채워라(합산은 도구가 한다, 본문에서 곱하지 마라).',
      inputSchema: z.object({
        cases: z.array(CaseBoardCaseInputSchema).min(2),
        contractMonths: z.number().positive().optional().describe('계약 기간(개월). 계약 총액 롤업에 사용. 예: 3개월 계약이면 3.'),
      }),
      execute: async ({ cases, contractMonths }) => {
        const out = await computeCaseBoard(ctx.baseUrl, {
          cases,
          contractMonths,
          departureFallback: ctx.departureAt,
        });
        track(
          'quote_case_board',
          { count: cases.length, contractMonths: contractMonths ?? null },
          { cases: out.cases.length, infeasible: out.rollup.infeasibleLabels.length }
        );
        return out;
      },
    }),

    compare_departure_times: tool({
      description:
        '단일 경로(역할 태깅된 stops)를 평일/주말 × 시간대(한산/출근/퇴근) 프리셋별로 계산해, 출발시간에 따른 소요시간·시간당 견적 차이를 매트릭스로 돌려준다. 사용자가 "출발시간/요일에 따라 견적이 달라지냐", "주말 기준으로도 내줘", "오후 3시까지 도착해야 한다" 등을 물으면 사용하라. 시간당 요금제 기준이며, 금액은 도구 결과만 사용하라. deadline(마감 시각)을 주면 각 출발시간의 예상 도착시각과 마감 충족 여부를 함께 돌려주고, 마감을 지키는 출발 중 가장 저렴한 것을 추천한다. 마감 기준은 기본적으로 "마지막 배송(drop) 완료"이며(deadlineTarget="delivery"), 서초 반납 복귀(업무 종료)는 마감 대상이 아니다. 반납 완료가 마감 기준이면 "return", 반납 포함 최종 도착이 기준이면 "final"로 지정하라.',
      inputSchema: z.object({
        stops: z.array(RouteStopSchema).min(2),
        vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
        scheduleType: z.enum(['regular', 'ad-hoc']).default('ad-hoc'),
        frequency: FrequencySchema.optional(),
        deadline: z
          .string()
          .optional()
          .describe('마감 시각 "HH:mm"(24시간제). 예: "15:00". 사용자가 도착 마감을 말하면 채워라. 기준 지점은 deadlineTarget으로 정한다(기본=마지막 배송 완료).'),
        deadlineTarget: z
          .enum(['delivery', 'return', 'final'])
          .default('delivery')
          .describe('마감 판정 기준. delivery=마지막 배송 완료(기본). return=반납 완료. final=반납 포함 최종 도착.'),
      }),
      execute: async ({ stops, vehicleType, scheduleType, frequency, deadline, deadlineTarget }) => {
        const domainStops = toDomainStops(stops);
        const cache = await geocodeStopAddresses(domainStops.map((s) => s.address));
        const toPoint = (address: string) => {
          const hit = cache.get(address.trim());
          if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
            return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
          }
          return address;
        };
        // 출발매트릭스는 프리셋마다 경로를 돌리므로 행렬 폭증 방지를 위해 fastOrder(NN) 사용.
        const basePayload = buildRolePayload({
          stops: domainStops,
          toPoint,
          vehicleType,
          roadOption: 'time-first',
          useRealtimeTraffic: true,
          fastOrder: true,
        });
        const dwellMinutesArr = basePayload.dwellMinutes;
        const stopsCount = Math.max(0, basePayload.destinations.length - (basePayload.useExplicitDestination ? 1 : 0));
        const freq = frequency as Frequency | undefined;
        const roleMap = buildAddressRoleMap(domainStops, cache);
        const target: DeadlineTarget = deadlineTarget ?? 'delivery';
        const hasReturn = Array.from(roleMap.values()).includes('return');

        const presets = resolveDeparturePresets();

        const rows = await Promise.all(
          presets.map(async (preset) => {
            const base = {
              id: preset.id,
              label: preset.label,
              dayType: preset.dayType,
              trafficLabel: preset.trafficLabel,
              dateLabel: preset.dateLabel,
              departureAt: preset.iso,
            };
            const payload = { ...basePayload, departureAt: preset.iso };
            try {
              const { ok, status, json: routeJson } = await postRouteOptimizationCached(ctx.baseUrl, payload);
              if (!ok) {
                return { ...base, error: routeJson?.error || routeJson?.message || `경로 계산 실패 (HTTP ${status})` };
              }
              const summary = routeJson?.data?.summary;
              const wps: any[] = Array.isArray(routeJson?.data?.waypoints) ? routeJson.data.waypoints : [];
              const km = Number(summary?.totalDistance || 0) / 1000;
              const driveMinutes = Math.round(Number(summary?.travelTime || 0) / 60);
              const dwellMinutesTotal = Math.round(Number(summary?.dwellTime || 0) / 60);

              const quoteRes = await fetch(new URL('/api/quote-calculation', ctx.baseUrl), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  distance: km * 1000,
                  time: driveMinutes * 60,
                  vehicleType,
                  dwellMinutes: dwellMinutesArr,
                  stopsCount,
                  scheduleType,
                }),
              });
              if (!quoteRes.ok) {
                const b = await quoteRes.json().catch(() => ({}));
                return { ...base, error: b?.error?.message || `견적 계산 실패 (HTTP ${quoteRes.status})` };
              }
              const quoteJson = await quoteRes.json();
              const hourly = quoteJson?.plans?.hourly ?? {};
              const oneTimePrice = Number(hourly.total ?? 0);
              const totalMinutes = driveMinutes + dwellMinutesTotal;
              // 마감 판정: deadlineTarget 기준 도착(기본=마지막 배송 완료). 반납 복귀는 마감 대상 아님.
              const targetArrivalIso = deadline ? pickTargetArrivalIso(wps, roleMap, target) : null;
              const returnArrivalIso = hasReturn ? pickTargetArrivalIso(wps, roleMap, 'return') : null;
              const feasibility = deadline ? judgeDeadline(targetArrivalIso, deadline) : null;
              return {
                ...base,
                km: Number(km.toFixed(1)),
                driveMinutes,
                dwellMinutes: dwellMinutesTotal,
                totalMinutes,
                billMinutes: Number(hourly.billMinutes ?? 0),
                ratePerHour: Number(hourly.ratePerHour ?? 0),
                fuelSurcharge: Number(hourly.fuelSurcharge ?? 0),
                oneTimePrice,
                formattedOneTime: won(oneTimePrice),
                annualPrice: annualizePrice(oneTimePrice, freq),
                formattedAnnual: won(annualizePrice(oneTimePrice, freq)),
                ...(feasibility
                  ? {
                      arrivalLabel: kstHHmm(targetArrivalIso) ?? undefined,
                      deliveryArrivalLabel: kstHHmm(targetArrivalIso) ?? undefined,
                      returnArrivalLabel: kstHHmm(returnArrivalIso) ?? undefined,
                      meetsDeadline: feasibility.meetsDeadline ?? undefined,
                      deadlineSlackMinutes: feasibility.slackMinutes ?? undefined,
                    }
                  : {}),
              };
            } catch (e) {
              return { ...base, error: e instanceof Error ? e.message : '계산 중 오류' };
            }
          })
        );

        const valid = rows.filter((r) => !('error' in r) && Number((r as any).oneTimePrice) > 0) as Array<
          Extract<(typeof rows)[number], { oneTimePrice: number }>
        >;
        const cheapest = (list: typeof valid) =>
          list.reduce<(typeof valid)[number] | null>((best, cur) => {
            if (!best) return cur;
            return cur.oneTimePrice < best.oneTimePrice ? cur : best;
          }, null);

        // 데드라인이 있으면 마감을 지키는 출발 중 최저가를 추천. 모두 불가면 전체 최저가로 폴백하고 안내.
        const feasible = deadline ? valid.filter((r) => (r as any).meetsDeadline === true) : valid;
        const deadlineInfeasible = Boolean(deadline) && feasible.length === 0;
        const recommended = cheapest(deadlineInfeasible ? valid : feasible);

        const targetLabel =
          target === 'return' ? '반납 완료' : target === 'final' ? '최종 도착(반납 포함)' : '마지막 배송 완료';
        const out = {
          matrix: rows,
          recommendedId: recommended?.id ?? null,
          frequencyLabel: formatFrequency(freq),
          deadline: deadline ?? null,
          deadlineTarget: target,
          deadlineInfeasible,
          deadlineNote: deadline
            ? deadlineInfeasible
              ? `${targetLabel} 마감 ${deadline}을 지키는 출발 프리셋이 없다. 출발을 앞당기거나 체류시간 단축/지점 분할을 검토해야 한다(아래는 마감 무관 최저가).${hasReturn && target === 'delivery' ? ' 서초 반납 복귀(업무 종료)는 마감 대상이 아니다.' : ''}`
              : `${targetLabel} 마감 ${deadline}을 지키는 출발 중 최저가를 추천했다.${hasReturn && target === 'delivery' ? ' 서초 반납 복귀(업무 종료)는 마감 없이 이어진다.' : ''}`
            : null,
          basis: '시간당 요금제 기준 · 출발시간별 교통량(Tmap 예측) 반영 · 옹고잉 요금엔 심야/주말 할증 없음',
        };
        track(
          'compare_departure_times',
          { stopCount: stops.length, presets: presets.length, deadline: deadline ?? null, deadlineTarget: target },
          { recommendedId: out.recommendedId, valid: valid.length, deadlineInfeasible }
        );
        return out;
      },
    }),

    forecast_route_timeline: tool({
      description:
        '역할 태깅된 경유지로 최적 경로를 계산해, 출발시각 기준 "경유지별 예상 도착/출발 시각" 타임라인을 돌려준다. 사용자가 "타임라인", "경유지별 도착시각", "몇 시에 어디 도착", "9시 출발하면 11시까지 가능?" 등 시각표/마감 가능성을 물으면 반드시 이 도구로 산출하라. 절대 분 단위 도착시각을 본문에서 지어내지 마라. departureTime("HH:mm")을 주면 그 시각 기준으로, 없으면 평일 오전 한산 가정으로 계산한다. deadline("HH:mm")을 주면 마감 충족 여부를 판정한다. 중요: 마감은 기본적으로 "마지막 배송(drop) 완료" 기준으로 판정한다(deadlineTarget="delivery"). 서초 반납 복귀는 마감이 없는 "업무 종료(반납완료) 시각"으로 별도 표기되며 마감 판정에 포함하지 않는다. 다만 사용자 메시지상 반납 완료 자체가 마감 기준이면 deadlineTarget="return", 전 과정(반납 포함) 최종 도착이 기준이면 "final"로 지정하라. 입력에 방문 순번/시각이 명확하면 preserveOrder=true로 받은 순서를 존중하라.',
      inputSchema: z.object({
        stops: z.array(RouteStopSchema).min(2),
        vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
        departureTime: z
          .string()
          .optional()
          .describe('출발 시각 "HH:mm"(24h). 예 "09:00". 사용자가 출발시각을 말하면 채워라. 없으면 평일 오전 한산 가정.'),
        deadline: z
          .string()
          .optional()
          .describe('마감 시각 "HH:mm". 예 "11:00". 사용자가 "11시까지" 등 마감을 말하면 채워라. 기준 지점은 deadlineTarget으로 정한다(기본=마지막 배송 완료).'),
        deadlineTarget: z
          .enum(['delivery', 'return', 'final'])
          .default('delivery')
          .describe('마감 판정 기준. delivery=마지막 배송(drop) 완료(기본, 가장 흔함). return=반납 완료. final=반납 포함 최종 도착. 사용자가 "배송은 11시까지, 반납은 상관없음"이면 delivery, "반납까지 11시"면 return.'),
        preserveOrder: z
          .boolean()
          .default(false)
          .describe('입력 순서를 그대로 존중(재최적화 안 함). 방문 시각/순번이 명확한 라인일 때만 true.'),
      }),
      execute: async ({ stops, vehicleType, departureTime, deadline, deadlineTarget, preserveOrder }) => {
        const domainStops = toDomainStops(stops);
        const cache = await geocodeStopAddresses(domainStops.map((s) => s.address));
        const toPoint = (address: string) => {
          const hit = cache.get(address.trim());
          if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
            return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
          }
          return address;
        };
        // 출발시각: 사용자가 준 "HH:mm"의 다음 도래 시각(교통 예측 현실성). 없으면 컨텍스트/근미래.
        const departureIso = departureTime
          ? nextIsoAtHHMM(departureTime)
          : ctx.departureAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString();
        // optimize_route와 동일한 정확해(fastOrder=false) 경로. 견적/지도와 결과가 일치한다.
        const payload = buildRolePayload({
          stops: domainStops,
          toPoint,
          vehicleType,
          roadOption: 'time-first',
          departureAt: departureIso,
          fastOrder: false,
          preserveOrder,
        });

        const { ok, status, json: body } = await postRouteOptimizationCached(ctx.baseUrl, payload);
        if (!ok) {
          const message = body?.error || body?.message || `경로 계산 실패 (HTTP ${status})`;
          track('forecast_route_timeline', { stops: domainStops.length, departureTime }, { error: message });
          return { error: message };
        }
        const summary = body?.data?.summary;
        const waypoints: any[] = Array.isArray(body?.data?.waypoints) ? body.data.waypoints : [];
        const roleMap = buildAddressRoleMap(domainStops, cache);
        // 경유지별 도착/출발 시각은 route-optimization이 departureAt 기점으로 Tmap 실측 산출한 값 그대로.
        const timeline = waypoints.map((w, i) => ({
          seq: i + 1,
          address: w?.address ?? null,
          role: (w?.address ? roleMap.get(String(w.address).trim()) : undefined) ?? null,
          arrival: kstHHmm(w?.arrivalTime),
          departure: kstHHmm(w?.departureTime),
          dwellMinutes: Number.isFinite(Number(w?.dwellTime)) ? Number(w.dwellTime) : null,
        }));
        // 종착(반납 포함) 최종 도착 = 업무 종료 시각. 마감 판정엔 기본적으로 쓰지 않는다.
        const finalArrivalIso: string | null = waypoints.length ? waypoints[waypoints.length - 1]?.arrivalTime ?? null : null;
        const deliveryArrivalIso = pickTargetArrivalIso(waypoints, roleMap, 'delivery');
        const returnArrivalIso = pickTargetArrivalIso(waypoints, roleMap, 'return');
        const hasReturn = Array.from(roleMap.values()).includes('return');
        const km = Number(summary?.totalDistance || 0) / 1000;
        const driveMinutes = Math.round(Number(summary?.travelTime || 0) / 60);
        const dwellMinutes = Math.round(Number(summary?.dwellTime || 0) / 60);
        const totalMinutes = driveMinutes + dwellMinutes;

        // 마감 판정: deadlineTarget 기준 도착 시각을 같은 KST 일자의 마감과 직접 비교(타임라인과 일치).
        // 기본(delivery)은 마지막 배송 완료 기준이며, 반납 복귀(업무 종료)는 마감 대상이 아니다.
        const target: DeadlineTarget = deadlineTarget ?? 'delivery';
        const targetArrivalIso = pickTargetArrivalIso(waypoints, roleMap, target);
        const { meetsDeadline, slackMinutes: deadlineSlackMinutes } = judgeDeadline(targetArrivalIso, deadline);
        const targetLabel =
          target === 'return' ? '반납 완료' : target === 'final' ? '최종 도착(반납 포함)' : '마지막 배송 완료';
        const targetArrivalHHmm = kstHHmm(targetArrivalIso);

        const lowPrecisionStops = domainStops
          .map((s) => s.address)
          .filter((addr) => cache.get(addr.trim())?.lowPrecision);

        const out = {
          departureAt: departureIso,
          departureLabel: kstHHmm(departureIso),
          timeline,
          // 마지막 배송 완료 시각(마감 기본 기준).
          deliveryArrival: kstHHmm(deliveryArrivalIso),
          // 반납 완료(=업무 종료) 시각. 반납이 없으면 null. 마감 없음.
          returnArrival: hasReturn ? kstHHmm(returnArrivalIso) : null,
          // 반납 포함 최종 도착(업무 종료 시각과 동일하게 마감 대상 아님).
          finalArrival: kstHHmm(finalArrivalIso),
          km: Number(km.toFixed(1)),
          driveMinutes,
          dwellMinutes,
          totalMinutes,
          deadline: deadline ?? null,
          deadlineTarget: target,
          meetsDeadline,
          deadlineSlackMinutes,
          deadlineNote:
            meetsDeadline === false
              ? `출발 ${kstHHmm(departureIso)} 기준 ${targetLabel}이 ${targetArrivalHHmm}로 마감 ${deadline}을 ${Math.abs(deadlineSlackMinutes ?? 0)}분 초과한다. 출발을 앞당기거나 체류시간 단축/지점 분할이 필요하다(불가능한 마감을 가능한 것처럼 말하지 마라). 대안 출발시간은 compare_departure_times로 확인하라.${hasReturn && target === 'delivery' ? ` 참고: 서초 반납 복귀(업무 종료)는 ${kstHHmm(returnArrivalIso)}이며 마감 대상이 아니다.` : ''}`
              : meetsDeadline === true
                ? `출발 ${kstHHmm(departureIso)} 기준 ${targetLabel} ${targetArrivalHHmm}로 마감 ${deadline}을 ${deadlineSlackMinutes}분 여유로 충족한다.${hasReturn && target === 'delivery' ? ` 서초 반납 복귀(업무 종료)는 ${kstHHmm(returnArrivalIso)}이며 마감 없이 이어진다.` : ''}`
                : null,
          assumption: departureTime
            ? `출발 ${kstHHmm(departureIso)} · Tmap 예측 교통 반영`
            : '출발 시각 미지정 — 평일 오전 한산 가정 · Tmap 예측 교통 반영',
          lowPrecisionStops,
          // 지도 렌더용(같은 경로를 지도에서 확인 가능).
          routeRequest: { ...payload, useRealtimeTraffic: true },
        };
        track(
          'forecast_route_timeline',
          { stops: domainStops.length, vehicleType, departureTime, deadline, deadlineTarget: target },
          { deliveryArrival: out.deliveryArrival, returnArrival: out.returnArrival, totalMinutes, meetsDeadline }
        );
        return out;
      },
    }),

    audit_delivery_timeline: tool({
      description:
        '이미 완료된 배송의 실측 타임라인과, 같은 지점들의 "이론상 최소 소요시간"을 비교해 지연이 구조적으로 불가피했는지 판정한다. 사용자가 "지연이 불가피했나/우리가 늦은 거냐/보수적으로 봐도 문제없었나" 같은 사후 진단을 물을 때 사용. 금액이 아니라 소요시간·거리·지연 판정을 돌려준다. 수치는 본문에서 만들지 말고 이 도구 결과만 써라. 사용자가 지점별 완료시각을 줬고 "경유지별 운행/체류 시간"을 원하면 stopTimeline에 방문순서대로 넣어라 — 구간별 이론 주행시간과 실측 간격을 분해한 표(legs)를 돌려준다.',
      inputSchema: z.object({
        stops: z.array(RouteStopSchema).min(2),
        vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
        startTime: z.string().optional().describe('실제 출발 시각 "HH:mm"(24h). 예 "07:40"'),
        endTime: z.string().optional().describe('실제 마지막 배송 완료 시각 "HH:mm". 예 "13:11"'),
        actualElapsedMinutes: z
          .number()
          .positive()
          .optional()
          .describe('실측 총 소요(분). startTime/endTime 대신 직접 줄 때.'),
        reloadCount: z
          .number()
          .int()
          .nonnegative()
          .default(0)
          .describe('중간 상차지 재방문(재상차) 횟수. 이론 최소값에 미반영되므로 caveat로 표기된다.'),
        deadlines: z
          .array(z.object({ label: z.string(), time: z.string() }))
          .optional()
          .describe('마감이 있는 고객사 목록 [{label, time "HH:mm"}]. 예: [{label:"호라이즌", time:"12:00"}]'),
        stopTimeline: z
          .array(
            z.object({
              label: z.string().optional().describe('상호/표시명(선택)'),
              address: z.string().min(1).describe('지점 주소(상호 아닌 도로명/지번)'),
              completedAt: z.string().describe('이 지점 완료(또는 출발)시각 "HH:mm"'),
            })
          )
          .optional()
          .describe(
            '지점별 실제 타임라인(방문 순서대로). 첫 항목은 출발(상차)지점이고 completedAt은 출발시각, 이후는 각 배송 완료시각. 주어지면 경유지별 운행/체류 분해표를 산출한다.'
          ),
      }),
      execute: async ({ stops, vehicleType, startTime, endTime, actualElapsedMinutes, reloadCount, deadlines, stopTimeline }) => {
        // 경유지별 분해 경로: 실제 방문순서(고정)대로 구간 주행시간을 산출하고,
        // 실측 완료시각 간격과 비교해 구간별 운행/체류를 분해한다.
        if (stopTimeline && stopTimeline.length >= 2) {
          const tlAddresses = stopTimeline.map((t) => t.address);
          const tlCache = await geocodeStopAddresses(tlAddresses);
          const toPt = (address: string) => {
            const hit = tlCache.get(address.trim());
            if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
              return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
            }
            return { address };
          };
          const departureIso = nextIsoAtHHMM(startTime || stopTimeline[0].completedAt);
          // 실제 방문순서 그대로(optimizeOrder=false). 첫 항목=출발지, 나머지=배송지.
          const payload = {
            origins: [toPt(stopTimeline[0].address)],
            destinations: stopTimeline.slice(1).map((t) => toPt(t.address)),
            vehicleType,
            optimizeOrder: false,
            useRealtimeTraffic: true,
            returnToOrigin: false,
            departureAt: departureIso,
            roadOption: 'time-first',
          };
          const { ok, status, json: body } = await postRouteOptimizationCached(ctx.baseUrl, payload);
          if (!ok) {
            const message = body?.error || body?.message || `경로 계산 실패 (HTTP ${status})`;
            track('audit_delivery_timeline', { mode: 'timeline', stops: stopTimeline.length }, { error: message });
            return { error: message };
          }
          const waypoints: any[] = Array.isArray(body?.data?.waypoints) ? body.data.waypoints : [];
          const depMin = parseHHMM(startTime || stopTimeline[0].completedAt);

          const rows: Array<{
            seq: number;
            from: string;
            to: string;
            theoreticalDriveMin: number | null;
            actualIntervalMin: number | null;
            inferredDwellMin: number | null;
          }> = [];
          let prevDepartureMs: number | null = waypoints.length ? new Date(departureIso).getTime() : null;
          let prevCompleted = parseHHMM(stopTimeline[0].completedAt);

          for (let j = 1; j < stopTimeline.length; j++) {
            const wp = waypoints[j - 1];
            let theoreticalDriveMin: number | null = null;
            if (wp?.arrivalTime && prevDepartureMs != null) {
              theoreticalDriveMin = Math.round((new Date(wp.arrivalTime).getTime() - prevDepartureMs) / 60000);
              if (theoreticalDriveMin < 0) theoreticalDriveMin = null;
            }
            // 다음 구간 기준점: 이 지점의 (이론) 출발시각.
            prevDepartureMs = wp?.departureTime ? new Date(wp.departureTime).getTime() : prevDepartureMs;

            const curCompleted = parseHHMM(stopTimeline[j].completedAt);
            let actualIntervalMin: number | null = null;
            if (curCompleted != null && prevCompleted != null) {
              let d = curCompleted - prevCompleted;
              if (d < 0) d += 24 * 60;
              actualIntervalMin = d;
            }
            prevCompleted = curCompleted;

            const inferredDwellMin =
              actualIntervalMin != null && theoreticalDriveMin != null
                ? Math.max(0, actualIntervalMin - theoreticalDriveMin)
                : null;

            rows.push({
              seq: j,
              from: stopTimeline[j - 1].label || stopTimeline[j - 1].address,
              to: stopTimeline[j].label || stopTimeline[j].address,
              theoreticalDriveMin,
              actualIntervalMin,
              inferredDwellMin,
            });
          }

          const sum = (key: 'theoreticalDriveMin' | 'actualIntervalMin' | 'inferredDwellMin') =>
            rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
          const firstC = parseHHMM(stopTimeline[0].completedAt);
          const lastC = parseHHMM(stopTimeline[stopTimeline.length - 1].completedAt);
          let actualTotalMin: number | null = null;
          if (firstC != null && lastC != null) {
            let d = lastC - firstC;
            if (d < 0) d += 24 * 60;
            actualTotalMin = d;
          }
          const theoreticalDriveTotal = sum('theoreticalDriveMin');
          const inferredDwellTotal = sum('inferredDwellMin');
          const km = Number(body?.data?.summary?.totalDistance || 0) / 1000;
          const avgDrive = rows.length ? Math.round((theoreticalDriveTotal / rows.length) * 10) / 10 : 0;
          const avgDwell = rows.length ? Math.round((inferredDwellTotal / rows.length) * 10) / 10 : 0;

          const out = {
            mode: 'per_stop_timeline' as const,
            legs: rows,
            stopsCount: stopTimeline.length,
            km: Number(km.toFixed(1)),
            theoreticalDriveTotal,
            inferredDwellTotal,
            actualTotalMin,
            avgDriveMinPerLeg: avgDrive,
            avgDwellMinPerStop: avgDwell,
            depMin,
            caveats: [
              '구간별 이론 주행시간은 실제 방문순서(재배열 없음) 기준 Tmap 예측이다. 체류시간은 실측 간격에서 이론 주행을 뺀 추정값이라, 신호/주차/엘리베이터 대기가 섞여 있다.',
              ...(reloadCount > 0 ? [`재상차 ${reloadCount}회는 이 표에 별도 구간으로 반영되지 않았을 수 있다.`] : []),
            ],
            routeRequest: { ...payload, useRealtimeTraffic: true },
          };
          track(
            'audit_delivery_timeline',
            { mode: 'timeline', stops: stopTimeline.length, vehicleType },
            { legs: rows.length, theoreticalDriveTotal, inferredDwellTotal, actualTotalMin }
          );
          return out;
        }

        const domainStops = toDomainStops(stops);
        const cache = await geocodeStopAddresses(domainStops.map((s) => s.address));
        const toPoint = (address: string) => {
          const hit = cache.get(address.trim());
          if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
            return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
          }
          return address;
        };
        // 다지점(수십 곳) 사후 분석이므로 정확해(Held-Karp) 대신 휴리스틱(fastOrder)으로 폭증 방지.
        const payload = buildRolePayload({
          stops: domainStops,
          toPoint,
          vehicleType,
          roadOption: 'time-first',
          useRealtimeTraffic: true,
          fastOrder: true,
          departureAt: ctx.departureAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });
        const { ok, status, json: body } = await postRouteOptimizationCached(ctx.baseUrl, payload);
        if (!ok) {
          const message = body?.error || body?.message || `경로 계산 실패 (HTTP ${status})`;
          track('audit_delivery_timeline', { stops: domainStops.length }, { error: message });
          return { error: message };
        }
        const summary = body?.data?.summary;
        const km = Number(summary?.totalDistance || 0) / 1000;
        const driveMinutes = Math.round(Number(summary?.travelTime || 0) / 60);
        const dwellMinutes = Math.round(Number(summary?.dwellTime || 0) / 60);
        const theoreticalMinMinutes = driveMinutes + dwellMinutes;

        const parseHM = (s?: string): number | null => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
          if (!m) return null;
          const h = Number(m[1]);
          const mi = Number(m[2]);
          if (h > 23 || mi > 59) return null;
          return h * 60 + mi;
        };

        let actualMinutes: number | null = null;
        if (typeof actualElapsedMinutes === 'number' && Number.isFinite(actualElapsedMinutes)) {
          actualMinutes = Math.round(actualElapsedMinutes);
        } else {
          const a = parseHM(startTime);
          const b = parseHM(endTime);
          if (a != null && b != null) {
            let d = b - a;
            if (d < 0) d += 24 * 60; // 자정 넘김 보정
            actualMinutes = d;
          }
        }

        const lowPrecisionStops = domainStops
          .map((s) => s.address)
          .filter((addr) => cache.get(addr.trim())?.lowPrecision);

        let deltaMinutes: number | null = null;
        let slackRatio: number | null = null;
        let verdict: 'tight' | 'moderate' | 'loose' | 'unknown' = 'unknown';
        let verdictLabel = '실측 소요시간 정보(출발/완료 시각)가 없어 지연 판정을 내릴 수 없다.';
        if (actualMinutes != null && theoreticalMinMinutes > 0) {
          deltaMinutes = actualMinutes - theoreticalMinMinutes;
          slackRatio = deltaMinutes / theoreticalMinMinutes;
          const tightThreshold = Math.max(20, Math.round(theoreticalMinMinutes * 0.1));
          if (deltaMinutes <= tightThreshold) {
            verdict = 'tight';
            verdictLabel =
              '실측이 이론상 최소 소요와 거의 같다 — 매우 타이트하게 진행됐고, 1대 기준으로는 지연이 구조적으로 불가피했을 가능성이 높다.';
          } else if (deltaMinutes <= theoreticalMinMinutes * 0.25) {
            verdict = 'moderate';
            verdictLabel =
              '실측이 이론 최소보다 다소 길다 — 약간의 여유가 있었을 수 있으나, 재상차·현장 대기·실측 교통을 감안하면 정상 범위일 수 있다.';
          } else {
            verdict = 'loose';
            verdictLabel =
              '실측이 이론 최소보다 크게 길다 — 경로/운영상 단축 여지가 있었을 가능성이 있다(단, 재상차·대기·당일 교통 변수 확인 필요).';
          }
        }

        const caveats: string[] = [];
        if (reloadCount > 0) {
          caveats.push(`재상차 ${reloadCount}회(중간 상차지 재방문)는 이론 최소 소요에 반영되지 않았다. 실제 운행은 그만큼 더 걸린다.`);
        }
        caveats.push('이론 최소 소요시간은 최적 방문순서·예측 교통 기준이며, 당일 실측 교통/엘리베이터·주차 대기/수령 지연 등 현장 변수는 포함하지 않는다.');
        if (lowPrecisionStops.length) {
          caveats.push(`구/동 단위로만 해석된 지점이 ${lowPrecisionStops.length}곳 있어 이론값 정밀도가 낮다.`);
        }

        // 구간별 도착시각은 제공되지 않으므로 마감은 거친 총량 신호 + 정밀 분석 경로 안내만.
        let deadlineNote: string | null = null;
        if (deadlines?.length) {
          const start = parseHM(startTime);
          const earliest = deadlines.reduce<{ label: string; t: number } | null>((min, d) => {
            const t = parseHM(d.time);
            if (t == null) return min;
            return !min || t < min.t ? { label: d.label, t } : min;
          }, null);
          if (start != null && earliest != null) {
            const windowMin = earliest.t - start;
            deadlineNote =
              `가장 이른 마감은 ${earliest.label} ${deadlines.find((d) => parseHM(d.time) === earliest.t)?.time}이며, 출발(${startTime})부터 가용시간은 약 ${windowMin}분이다. ` +
              `전체 이론 최소 소요가 ${theoreticalMinMinutes}분인 점을 감안하면, 마감 고객사가 경로 후반부에 있을수록 1대로는 마감 준수가 구조적으로 어려웠을 수 있다. ` +
              '지점별 정밀 도착시각·마감 충족(O/X)은 compare_departure_times(deadline)로 이어서 확인하라.';
          } else {
            deadlineNote = '마감 고객사가 있다. 지점별 정밀 도착시각·마감 충족 여부는 compare_departure_times(deadline)로 확인하라.';
          }
        }

        const out = {
          theoreticalMinMinutes,
          driveMinutes,
          dwellMinutes,
          km: Number(km.toFixed(1)),
          stopsCount: domainStops.length,
          actualMinutes,
          deltaMinutes,
          slackRatio: slackRatio != null ? Number(slackRatio.toFixed(2)) : null,
          verdict,
          verdictLabel,
          caveats,
          deadlines: deadlines ?? null,
          deadlineNote,
          lowPrecisionStops,
          // 지도 렌더용(감사한 최적 경로를 지도에서 확인 가능).
          routeRequest: { ...payload, useRealtimeTraffic: true },
        };
        track(
          'audit_delivery_timeline',
          { stops: domainStops.length, vehicleType, startTime, endTime, reloadCount },
          { verdict, theoreticalMinMinutes, actualMinutes, deltaMinutes }
        );
        return out;
      },
    }),

    search_knowledge: tool({
      description:
        '옹고잉 요금정책/서비스/차종 정보를 검색한다. 요금제 규칙·차종 가중치·서비스 범위 등 사실 확인이 필요할 때 사용.',
      inputSchema: z.object({
        query: z.string().min(1),
      }),
      execute: async ({ query }) => {
        const rag = await retrieveRagContext({ query, sessionId: ctx.sessionId, limit: 5 });
        track('search_knowledge', { query }, { sources: rag.sources });
        return { snippets: rag.snippets, sources: rag.sources };
      },
    }),

    read_attachments: tool({
      description:
        '이 세션에 업로드된 문서(견적 의뢰서/엑셀/이미지 OCR)의 내용을 읽는다. 사용자가 첨부 파일을 참조하거나 "업로드한 파일"을 언급하면 사용.',
      inputSchema: z.object({
        focus: z.string().optional().describe('찾고자 하는 내용(예: "배송지 주소", "수거 주기")'),
      }),
      execute: async ({ focus }) => {
        const rag = await retrieveRagContext({
          query: focus || '첨부 문서 전체 내용 주소 수거 배송',
          sessionId: ctx.sessionId,
          limit: 12,
        });
        const attachmentIdx = rag.sources
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => !s.startsWith('knowledge:'));
        const snippets = attachmentIdx.map(({ i }) => rag.snippets[i]).filter(Boolean);
        const out = {
          hasAttachments: snippets.length > 0,
          snippets,
          sources: attachmentIdx.map(({ s }) => s),
        };
        track('read_attachments', { focus }, { count: snippets.length });
        return out;
      },
    }),

    validate_plan: tool({
      description:
        '구성한 경로 계획의 문제(누락/모호 주소/중복/역할 불일치)를 점검해 이슈 목록을 돌려준다. 이것은 차단 게이트가 아니라 피드백이다. 이슈를 보고 보정하거나, 정말 필요한 1가지만 사용자에게 물어라.',
      inputSchema: z.object({
        stops: z.array(RouteStopSchema).min(1),
        frequency: FrequencySchema.optional(),
      }),
      execute: async ({ stops, frequency }) => {
        const result = validatePlan(toDomainStops(stops), frequency as Frequency | undefined);
        track('validate_plan', { stopCount: stops.length }, result);
        return result;
      },
    }),

    recall_recent_quotes: tool({
      description:
        '현재 사용자의 과거 견적 대화를 최근순으로 조회한다. 사용자가 "지난번 견적", "저번에 했던 거", "이전 견적 다시", "과거 견적 재사용", "전에 노원구청 경로 그대로" 등 과거 작업을 참조할 때 호출하라. 목록(제목/요약/일시)을 받아 어떤 견적을 재사용할지 사용자에게 확인하라. 금액·경로 같은 사실은 요약을 그대로 베끼지 말고, 사용자가 고른 뒤 주소/차종/빈도 등을 확인해 도구(geocode/optimize/compare/calculate)로 다시 산출하라.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(10).default(5).describe('가져올 최근 견적 대화 수'),
      }),
      execute: async ({ limit }) => {
        if (!ctx.sessionId) {
          track('recall_recent_quotes', { limit }, { available: false });
          return { available: false, reason: '저장된 대화가 없어 과거 견적을 불러올 수 없어요(로그인 시 대화가 저장됩니다).', quotes: [] as unknown[] };
        }
        try {
          const supabase = createServerClient();
          // 현재 세션 소유자 역추적(인증 헤더 없이 sessionId만으로 사용자 스코프 확보).
          const { data: cur } = await supabase
            .from('quote_chat_sessions')
            .select('created_by')
            .eq('id', ctx.sessionId)
            .maybeSingle();
          const userId = cur?.created_by;
          if (!userId) {
            track('recall_recent_quotes', { limit }, { available: false });
            return { available: false, reason: '현재 대화의 사용자 정보를 확인할 수 없어요.', quotes: [] as unknown[] };
          }
          const { data: sessions } = await supabase
            .from('quote_chat_sessions')
            .select('id, title, last_summary, updated_at')
            .eq('created_by', userId)
            .neq('id', ctx.sessionId)
            .order('updated_at', { ascending: false })
            .limit(limit);
          const list = sessions ?? [];
          const quotes = await Promise.all(
            list.map(async (s) => {
              let summary = String(s.last_summary || '').trim();
              if (!summary) {
                // 요약이 비면 시나리오 비교를 담은 최신 어시스턴트 메시지에서 보강.
                const { data: msgs } = await supabase
                  .from('quote_chat_messages')
                  .select('content, metadata, created_at')
                  .eq('session_id', s.id)
                  .eq('role', 'assistant')
                  .order('created_at', { ascending: false })
                  .limit(3);
                const rows = msgs ?? [];
                const withScenario = rows.find((m: { metadata?: { hasScenarioComparison?: boolean } }) => m?.metadata?.hasScenarioComparison) ?? rows[0];
                summary = String(withScenario?.content || '').replace(/\s+/g, ' ').slice(0, 220);
              }
              return { sessionId: s.id, title: s.title || '제목 없음', updatedAt: s.updated_at, summary };
            })
          );
          track('recall_recent_quotes', { limit }, { available: true, count: quotes.length });
          return { available: true, count: quotes.length, quotes };
        } catch (e) {
          track('recall_recent_quotes', { limit }, { error: true });
          return { available: false, reason: e instanceof Error ? e.message : '과거 견적 조회 중 오류', quotes: [] as unknown[] };
        }
      },
    }),

    ask_user: tool({
      description:
        '경로/견적을 확정하기 위해 반드시 필요한 정보가 빠졌을 때만, 단 하나의 핵심 질문을 한다. 추측으로 진행 가능한 경우엔 호출하지 말고 가정을 명시하며 진행하라.',
      inputSchema: z.object({
        question: z.string().min(1),
        missingField: z.string().optional(),
      }),
      execute: async ({ question, missingField }) => {
        track('ask_user', { missingField }, { question });
        return { asked: true, question, missingField: missingField ?? null };
      },
    }),
  };
}

export type QuoteAgentTools = ReturnType<typeof buildQuoteAgentTools>;
