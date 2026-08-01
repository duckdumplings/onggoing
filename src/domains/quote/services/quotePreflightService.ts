import 'server-only';

import { generateObject } from 'ai';
import { z } from 'zod';
import { resolveModel } from '@/libs/llm/provider';
import { validatePlan } from '@/domains/quote/agent/workingMemory';
import type { QuotePreflightDraft } from '@/domains/quote/types/quotePreflight';
import { createDeterministicQuotePreflight } from '@/domains/quote/services/quotePreflightFallback';

// 에이전트의 전체 RouteStopSchema는 provider의 JSON schema 한도를 넘을 수 있다.
// 계산 전 확인에는 필요한 필드만 전부 required + nullable로 제한한다.
const LlmPreflightSchema = z.object({
  cases: z.array(z.object({
    label: z.string(),
    vehicleType: z.enum(['레이', '스타렉스']),
    scheduleType: z.enum(['regular', 'ad-hoc']),
    frequency: z.object({
      per: z.enum(['day', 'week', 'month', 'quarter', 'year']),
      count: z.number(),
      contractMonths: z.number().nullable(),
    }).nullable(),
    stops: z.array(z.object({
      address: z.string(),
      role: z.enum(['pickup', 'drop', 'return', 'waypoint']),
      quantity: z.number().nullable(),
      operations: z.array(z.enum(['pickup', 'drop', 'return'])),
      schedule: z.object({
        type: z.enum([
          'ready',
          'service-start',
          'departure',
          'arrival-deadline',
          'completion-deadline',
          'appointment',
        ]),
        time: z.string(),
      }).nullable(),
    })),
    assumptions: z.array(z.string()),
    openQuestions: z.array(z.string()),
  })).min(1).max(20),
  confidence: z.enum(['high', 'medium', 'low']),
  reviewReasons: z.array(z.string()),
});

const SYSTEM_PROMPT = `당신은 한국 라스트마일 물류 견적의 계산 전 입력 검수기다.
사용자의 원문을 계산하지 말고 구조화만 한다.

원칙:
1. 서로 독립적인 배송라인은 cases로 분리한다. 한 라인의 경유지는 실제 운행 순서대로 둔다.
2. 사용자가 적은 주소/POI 문자열을 고치거나 지오코딩하지 말고 그대로 보존한다.
3. role은 상차·픽업·수거=pickup, 배송·하차=drop, 반납=return, 단순 경유=waypoint다.
4. 한 지점에서 "배송 및 수거"처럼 복합 작업이면 operations에 drop과 pickup을 모두 넣는다.
5. 시각 의미를 구분한다:
   - 물품 준비=ready
   - 상차/작업 시작=service-start
   - 차량 출발=departure
   - 도착 마감=arrival-deadline
   - 작업/배송 완료 마감=completion-deadline
   - 조기 도착이 금지된 예약시각=appointment
6. "10:00 상차", "11:40 배송"처럼 의미가 하나로 확정되지 않으면 가장 자연스러운 값을 넣되
   openQuestions에 사용자가 확인할 짧은 질문을 남긴다. 마감을 appointment로 임의 해석하지 않는다.
7. 입력에 없는 주소, 물량, 시각, 빈도, 체류시간은 만들어내지 않는다.
8. 차종 미지정은 레이, 정기 여부 미지정은 ad-hoc으로 두고 assumptions에 적는다.
9. 단건 운임은 추출 대상이 아니다. 이 단계에서는 거리·시간·금액을 계산하지 않는다.`;

export async function createQuotePreflight(
  message: string,
  modelSlug?: string,
): Promise<QuotePreflightDraft> {
  const deterministic = createDeterministicQuotePreflight(message);
  if (deterministic) return deterministic;

  const resolved = resolveModel(
    modelSlug ||
      process.env.QUOTE_PREFLIGHT_MODEL ||
      process.env.QUOTE_AGENT_MODEL,
  );
  const { object } = await generateObject({
    model: resolved.model,
    schema: LlmPreflightSchema,
    system: SYSTEM_PROMPT,
    prompt: `다음 요청을 구조화하라.\n\n<request>\n${message}\n</request>`,
    temperature: 0,
    maxOutputTokens: 5000,
    abortSignal: AbortSignal.timeout(30_000),
    providerOptions: {
      openai: {
        // optional 필드가 많은 물류 스키마를 OpenAI strict schema가 거부하지 않게 한다.
        strictJsonSchema: false,
      },
    },
  });

  const cases = object.cases.map(({ frequency, stops, ...item }) => ({
    ...item,
    ...(frequency
      ? {
          frequency: {
            per: frequency.per,
            count: frequency.count,
            ...(frequency.contractMonths == null
              ? {}
              : { contractMonths: frequency.contractMonths }),
          },
        }
      : {}),
    stops: stops.map((stop) => ({
      address: stop.address,
      role: stop.role,
      ...(stop.quantity == null ? {} : { quantity: stop.quantity }),
      ...(stop.operations.length
        ? { operations: stop.operations.map((type) => ({ type })) }
        : {}),
      ...(stop.schedule ? { schedule: stop.schedule } : {}),
    })),
  }));
  const validationIssues = cases.flatMap((item, caseIndex) =>
    validatePlan(item.stops, item.frequency ?? undefined).issues.map((issue) => ({
      caseIndex,
      severity: issue.severity,
      message: issue.message,
    })),
  );

  return {
    cases,
    confidence: object.confidence,
    reviewReasons: object.reviewReasons,
    validationIssues,
  };
}
