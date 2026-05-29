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

import { geocodeStopAddresses } from '@/domains/dispatch/services/stopGeocoder';
import { annualizePrice, formatFrequency } from '@/domains/dispatch/utils/frequency';
import { resolveDeparturePresets } from '@/domains/dispatch/utils/departureMatrix';
import type { Frequency } from '@/domains/dispatch/types/routePlan';
import { retrieveRagContext } from '@/domains/quote/services/ragRetriever';
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
            address: hit?.address ?? a,
            latitude: hit?.latitude ?? null,
            longitude: hit?.longitude ?? null,
          };
        });
        track('geocode_addresses', { addresses }, results);
        return { results };
      },
    }),

    optimize_route: tool({
      description:
        '역할 태깅된 경유지로 최적 경로를 계산해 거리(km)/주행시간/순서를 반환한다. 출발지는 첫 pickup, 종착지는 마지막 drop으로 고정된다. 좌표가 없으면 내부에서 지오코딩한다.',
      inputSchema: z.object({
        stops: z.array(RouteStopSchema).min(2),
        vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
        roadOption: z.enum(['time-first', 'free-first', 'highway-first']).default('time-first'),
      }),
      execute: async ({ stops, vehicleType, roadOption }) => {
        const domainStops = toDomainStops(stops);
        const cache = await geocodeStopAddresses(domainStops.map((s) => s.address));
        const toPoint = (address: string) => {
          const hit = cache.get(address.trim());
          if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
            return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
          }
          return address;
        };
        const pickups = domainStops.filter((s) => s.role === 'pickup');
        const drops = domainStops.filter((s) => s.role === 'drop');
        const originStop = pickups[0] ?? domainStops[0];
        const finalDrop = drops[drops.length - 1];
        const remaining = domainStops.filter((s) => s !== originStop);
        const ordered = finalDrop ? [...remaining.filter((s) => s !== finalDrop), finalDrop] : remaining;

        const payload = {
          origins: [toPoint(originStop.address)],
          destinations: ordered.map((s) => toPoint(s.address)),
          finalDestinationAddress: finalDrop ? finalDrop.address : null,
          useExplicitDestination: Boolean(finalDrop),
          vehicleType,
          optimizeOrder: true,
          returnToOrigin: false,
          roadOption,
          // 견적 산정과 지도 미리보기 결과 일치를 위해 출발 시각을 고정.
          departureAt: ctx.departureAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          dwellMinutes: ordered.map((s) => s.dwellMinutes ?? 0),
        };

        const res = await fetch(new URL('/api/route-optimization', ctx.baseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const failed = body?.diagnostics?.failedAddresses;
          const message = Array.isArray(failed) && failed.length
            ? `주소를 찾지 못했어요: ${failed.map((f: any) => f?.address).filter(Boolean).join(', ')}`
            : body?.error || body?.message || `경로 계산 실패 (HTTP ${res.status})`;
          track('optimize_route', payload, { error: message });
          return { error: message };
        }
        const json = await res.json();
        const summary = json?.data?.summary;
        const out = {
          km: Number(summary?.totalDistance || 0) / 1000,
          driveMinutes: Math.round(Number(summary?.travelTime || 0) / 60),
          dwellMinutes: Math.round(Number(summary?.dwellTime || 0) / 60),
          optimizedOrder: summary?.optimizationInfo?.optimizedOrder ?? null,
          // 지도 렌더용 경로 페이로드(좌표 해석본). 클라이언트가 그대로 재사용한다.
          routeRequest: { ...payload, useRealtimeTraffic: true },
        };
        track('optimize_route', payload, { km: out.km, driveMinutes: out.driveMinutes });
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
      }),
      execute: async ({ km, driveMinutes, dwellMinutes, stopsCount, vehicleType, scheduleType, frequency, customHourlyRate }) => {
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
        const out = {
          plans: json?.plans ?? null,
          recommendedPlan,
          rateOverride,
          oneTimePrice: representative,
          annualPrice: annualizePrice(representative, freq),
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
