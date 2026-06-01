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
import { resolveDeparturePresets, assessDeadlineFeasibility } from '@/domains/dispatch/utils/departureMatrix';
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

    optimize_route: tool({
      description:
        '역할 태깅된 경유지로 최적 경로를 계산해 거리(km)/주행시간/순서를 반환한다. 출발지는 픽업(pickup) 중 시스템이 비용 최소로 자동 선택(open-start)하며 배송지/반납지는 출발지가 되지 않는다. 종착지는 반납(return)이 있으면 마지막 반납으로, 없으면 마지막 drop으로 고정된다(반납이 여러 번이면 그 외 반납은 중간 방문). 좌표가 없으면 내부에서 지오코딩한다.',
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
        // 출발지/순서/open-start 규칙은 buildRolePayload로 단일화. 일반 경로는 정확해(fastOrder=false).
        const payload = buildRolePayload({
          stops: domainStops,
          toPoint,
          vehicleType,
          roadOption,
          // 견적 산정과 지도 미리보기 결과 일치를 위해 출발 시각을 고정.
          departureAt: ctx.departureAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          fastOrder: false,
        });

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
        // 구/동 단위로만 해석돼 실제 배송 지점이 불확실한 지점을 모아 에이전트에 알린다.
        const lowPrecisionStops = domainStops
          .map((s) => s.address)
          .filter((addr) => cache.get(addr.trim())?.lowPrecision);
        const out = {
          km: Number(summary?.totalDistance || 0) / 1000,
          driveMinutes: Math.round(Number(summary?.travelTime || 0) / 60),
          dwellMinutes: Math.round(Number(summary?.dwellTime || 0) / 60),
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

    compare_departure_times: tool({
      description:
        '단일 경로(역할 태깅된 stops)를 평일/주말 × 시간대(한산/출근/퇴근) 프리셋별로 계산해, 출발시간에 따른 소요시간·시간당 견적 차이를 매트릭스로 돌려준다. 사용자가 "출발시간/요일에 따라 견적이 달라지냐", "주말 기준으로도 내줘", "오후 3시까지 도착해야 한다" 등을 물으면 사용하라. 시간당 요금제 기준이며, 금액은 도구 결과만 사용하라. deadline(도착 마감 시각)을 주면 각 출발시간의 예상 도착시각과 마감 충족 여부를 함께 돌려주고, 마감을 지키는 출발 중 가장 저렴한 것을 추천한다.',
      inputSchema: z.object({
        stops: z.array(RouteStopSchema).min(2),
        vehicleType: z.enum(['레이', '스타렉스']).default('레이'),
        scheduleType: z.enum(['regular', 'ad-hoc']).default('ad-hoc'),
        frequency: FrequencySchema.optional(),
        deadline: z
          .string()
          .optional()
          .describe('최종 지점 도착 마감 시각 "HH:mm"(24시간제). 예: "15:00". 사용자가 도착 마감을 말하면 채워라.'),
      }),
      execute: async ({ stops, vehicleType, scheduleType, frequency, deadline }) => {
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
              const routeRes = await fetch(new URL('/api/route-optimization', ctx.baseUrl), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (!routeRes.ok) {
                const b = await routeRes.json().catch(() => ({}));
                return { ...base, error: b?.error || b?.message || `경로 계산 실패 (HTTP ${routeRes.status})` };
              }
              const routeJson = await routeRes.json();
              const summary = routeJson?.data?.summary;
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
              const feasibility = deadline ? assessDeadlineFeasibility(preset.iso, totalMinutes, deadline) : null;
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
                      arrivalLabel: feasibility.arrivalLabel,
                      meetsDeadline: feasibility.meetsDeadline,
                      deadlineSlackMinutes: feasibility.slackMinutes,
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

        const out = {
          matrix: rows,
          recommendedId: recommended?.id ?? null,
          frequencyLabel: formatFrequency(freq),
          deadline: deadline ?? null,
          deadlineInfeasible,
          deadlineNote: deadline
            ? deadlineInfeasible
              ? `도착 마감 ${deadline}을 지키는 출발 프리셋이 없다. 출발을 앞당기거나 체류시간 단축/지점 분할을 검토해야 한다(아래는 마감 무관 최저가).`
              : `도착 마감 ${deadline}을 지키는 출발 중 최저가를 추천했다.`
            : null,
          basis: '시간당 요금제 기준 · 출발시간별 교통량(Tmap 예측) 반영 · 옹고잉 요금엔 심야/주말 할증 없음',
        };
        track(
          'compare_departure_times',
          { stopCount: stops.length, presets: presets.length, deadline: deadline ?? null },
          { recommendedId: out.recommendedId, valid: valid.length, deadlineInfeasible }
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
