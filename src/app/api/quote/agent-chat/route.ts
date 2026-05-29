import { NextRequest, NextResponse } from 'next/server';
import { streamText, stepCountIs } from 'ai';

import { resolveModel, AGENT_DEFAULTS } from '@/libs/llm/provider';
import { buildQuoteAgentTools } from '@/domains/quote/agent/tools';
import { saveToolCallLog } from '@/domains/quote/services/toolRouter';
import { createServerClient } from '@/libs/supabase-client';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SYSTEM_PROMPT = `당신은 "옹고잉" 사륜차량 물류 서비스의 견적 에이전트입니다. 사용자의 자연어 요청(메일 붙여넣기, 표, 손글씨 메모 등 어떤 형식이든)을 추론으로 해석해 경로를 구성하고 견적을 제공합니다.

[핵심 원칙 — 반드시 지킬 것]
1. 좌표와 요금은 절대 추측하지 마라. 좌표는 geocode_addresses, 경로는 optimize_route, 요금은 calculate_quote, 다중 비교는 compare_scenarios 도구로만 산출한다.
2. 메시지 "형식"에 의존하지 말고 "의미"로 판단하라. 번호가 1.인지 1)인지, 표인지 문장인지는 중요하지 않다. 무엇을 수거(pickup)/하차(drop)/반납(return)하는지 역할을 추론해 태깅하라.
3. 사용자가 여러 경우(예: 3개/5개/10개 지점)를 물으면 각각을 시나리오로 만들어 compare_scenarios로 동시에 비교하라. 절대 "한 번에 하나만" 식으로 막지 마라.
4. 정기 수거 빈도(예: "분기 1회 = 연 4회", "주 2회")를 인식해 frequency로 넘기고 연 환산 비용을 제시하라.
5. validate_plan은 차단 게이트가 아니라 점검 피드백이다. 이슈가 보이면 스스로 보정하라. 정말로 진행 불가한 단 1가지가 빠졌을 때만 ask_user로 질문하라(질문 예산: 최대 1개). 그 외에는 합리적 가정을 명시하고 진행하라. 단, 출발지·목적지 등 견적의 최소 입력이 아예 없는 막연한 요청(예: "견적 좀 내줘")이면 추측하지 말고 반드시 ask_user로 핵심 1가지(어디서 어디로/무엇을)를 물어라.
6. 첨부 문서가 관련되면 read_attachments로 내용을 읽어라.

[차종/요금 메모]
- 차종: 레이(기본) / 스타렉스. 명시 없으면 물량(kg)·지점 수로 추론하되 불확실하면 레이로 가정하고 그렇게 밝혀라.
- 금액은 calculate_quote/compare_scenarios가 돌려준 값만 사용하고, 직접 더하거나 추정하지 마라.
- 요금제는 시간당/단건 두 가지가 있다. 둘 다 도구가 함께 돌려주므로 한쪽만 "불가"라고 답하지 말고 필요한 요금제를 제시하라.
- 사용자가 협의 단가(예: "시간당 35,000원 고정")를 제시하면 거부하지 말고 calculate_quote의 customHourlyRate에 그 값을 넣어 "협의가 기준" 견적을 산출하라. 단가는 사용자가 말한 값만 쓰고, 임의로 지어내지 마라. 가능하면 공식 요금표 기준 견적과 협의가 기준 견적을 나란히 안내하라.

[지도/경로 표시]
- 경로를 지도에 보여달라는 요청에는 네이버/카카오/구글 등 외부 지도 앱 사용을 절대 안내하지 마라. 옹고잉 앱에 지도가 내장되어 있다.
- 비교표(시나리오)나 견적 카드 아래의 "지도에서 보기" 버튼을 누르면 해당 경로가 앱 지도에 표시된다고 안내하라. (경로 좌표/순서는 시스템이 이미 계산해 두었다.)
- 방문 순서를 글로 장황하게 나열하지 마라. 특히 첫 수거지를 "경로 최적화 시 제외됨"처럼 표현하지 마라 — 출발지(첫 수거지)도 엄연한 방문지(1번)다. 누락처럼 오해될 표현 금지.

[최종 응답]
- 한국어로 간결하고 친절하게. 어떤 가정을 했는지, 추천 시나리오와 그 이유(연 비용 등)를 명확히 적어라.
- 일부 지점 지오코딩 실패 등 부분 오류가 있으면 솔직히 알리고 가능한 부분까지 견적을 제시하라.`;

function buildAgentQuote(plans: any): any {
  if (!plans) return null;
  return {
    plans,
    hourly: plans.hourly ?? null,
    perJob: plans.perJob ?? null,
  };
}

type CollectedOutputs = {
  scenarioComparison: any;
  scenarioRouteErrors: any[];
  scenarioRoutes: any[];
  agentQuote: any;
  routeRequest: any;
  askedQuestion: string | null;
};

/** 도구 결과 1건을 누적 산출물에 반영(마지막 호출 우선). */
function applyToolResult(acc: CollectedOutputs, toolName: string, output: any): void {
  if (toolName === 'compare_scenarios' && output?.comparison) {
    acc.scenarioComparison = output.comparison;
    acc.scenarioRouteErrors = output.routeErrors || [];
    acc.scenarioRoutes = output.scenarioRoutes || [];
  } else if (toolName === 'calculate_quote' && output && !output.error) {
    acc.agentQuote = buildAgentQuote(output.plans);
  } else if (toolName === 'optimize_route' && output?.routeRequest) {
    acc.routeRequest = output.routeRequest;
  } else if (toolName === 'ask_user' && output?.question) {
    acc.askedQuestion = output.question;
  }
}

/** 사람이 읽을 수 있는 단계 라벨(진행 칩 표시용). */
const STEP_LABELS: Record<string, string> = {
  geocode_addresses: '주소 좌표 변환',
  optimize_route: '경로 최적화',
  compare_scenarios: '시나리오 비교 계산',
  calculate_quote: '견적 산출',
  validate_plan: '계획 점검',
  read_attachments: '첨부 문서 읽기',
  ask_user: '추가 질문 준비',
};

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const message: string = String(body?.message || '').trim();
    const sessionId: string | null = body?.sessionId ? String(body.sessionId) : null;
    const history: ChatHistoryItem[] = Array.isArray(body?.history) ? body.history : [];
    const departureAt: string | undefined = body?.departureAt ? String(body.departureAt) : undefined;
    const conversationContext = body?.conversationContext ?? null;

    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '메시지가 비어 있습니다.' } },
        { status: 400 }
      );
    }

    const { model, provider, modelId } = resolveModel(body?.model);

    const trace: Array<{ tool: string; input: unknown; output: unknown }> = [];
    const tools = buildQuoteAgentTools({
      baseUrl: request.url,
      sessionId,
      departureAt,
      onToolEvent: (e) => {
        trace.push(e);
        void saveToolCallLog({ sessionId, tool: e.tool, input: e.input as any, output: e.output as any });
      },
    });

    const messages = [
      ...history
        .filter((h) => h.role === 'user' || h.role === 'assistant')
        .slice(-12)
        .map((h) => ({ role: h.role as 'user' | 'assistant', content: String(h.content || '') })),
      { role: 'user' as const, content: message },
    ];

    // 멀티턴 메모리: 직전 결과(차종/스케줄/주소/시나리오)를 컨텍스트로 주입.
    const contextNote = conversationContext
      ? `\n\n[직전 견적 컨텍스트 — 후속 요청 시 기본값으로 이어서 사용하고, 사용자가 바꾼 항목만 갱신하라]\n${JSON.stringify(conversationContext).slice(0, 1500)}`
      : '';

    const result = streamText({
      model,
      system: SYSTEM_PROMPT + contextNote,
      messages,
      tools,
      temperature: AGENT_DEFAULTS.temperature,
      stopWhen: stepCountIs(AGENT_DEFAULTS.maxSteps),
    });

    const acc: CollectedOutputs = {
      scenarioComparison: null,
      scenarioRouteErrors: [],
      scenarioRoutes: [],
      agentQuote: null,
      routeRequest: null,
      askedQuestion: null,
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => {
          try {
            controller.enqueue(sse(obj));
          } catch {
            /* 컨트롤러 종료 후 enqueue 무시 */
          }
        };

        let fullText = '';
        let streamError: string | null = null;

        try {
          for await (const part of result.fullStream) {
            switch (part.type) {
              case 'text-delta':
                fullText += part.text;
                send({ type: 'text', delta: part.text });
                break;
              case 'tool-call':
                send({ type: 'step', name: part.toolName, label: STEP_LABELS[part.toolName] || part.toolName, phase: 'start' });
                break;
              case 'tool-result':
                applyToolResult(acc, part.toolName, (part as any).output);
                send({ type: 'step', name: part.toolName, label: STEP_LABELS[part.toolName] || part.toolName, phase: 'done' });
                break;
              case 'tool-error':
                send({ type: 'step', name: part.toolName, label: STEP_LABELS[part.toolName] || part.toolName, phase: 'error' });
                break;
              case 'error':
                streamError = String((part as any).error ?? 'stream error');
                break;
              default:
                break;
            }
          }
        } catch (err) {
          streamError = err instanceof Error ? err.message : String(err);
        }

        const toolNames = trace.map((t) => t.tool);
        let finishReason = 'stop';
        let stepCount = 0;
        try {
          finishReason = await result.finishReason;
          stepCount = (await result.steps).length;
        } catch {
          /* 무시 */
        }

        const succeeded = !streamError || Boolean(fullText);

        const finalPayload = {
          success: succeeded,
          assistantMessage: fullText,
          quote: acc.agentQuote,
          scenarioComparison: acc.scenarioComparison,
          scenarioRouteErrors: acc.scenarioRouteErrors,
          scenarioRoutes: acc.scenarioRoutes,
          routeRequest: acc.routeRequest,
          missingFields: acc.askedQuestion ? ['clarification'] : [],
          followUpQuestions: acc.askedQuestion ? [{ field: 'clarification', question: acc.askedQuestion }] : [],
          assumptions: [],
          error: succeeded
            ? undefined
            : { code: 'LLM_ERROR', message: '견적 에이전트 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', details: streamError },
          pipeline: {
            mode: 'agent',
            provider,
            llmModel: modelId,
            steps: stepCount,
            toolCalls: toolNames,
            finishReason,
            elapsedMs: Date.now() - startedAt,
          },
          trace,
        };

        send({ type: 'final', payload: finalPayload });
        controller.close();

        // 대화 영속(베스트 에포트, 스트림 종료 후)
        if (sessionId && fullText) {
          try {
            const supabase = createServerClient();
            await supabase.from('quote_chat_messages').insert([
              { session_id: sessionId, role: 'user', content: message },
              {
                session_id: sessionId,
                role: 'assistant',
                content: fullText,
                metadata: {
                  kind: 'agent-response',
                  provider,
                  model: modelId,
                  steps: stepCount,
                  tools: toolNames,
                  hasScenarioComparison: Boolean(acc.scenarioComparison),
                },
              },
            ]);
          } catch {
            /* 영속 실패 무시 */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'unknown';
    console.error('[agent-chat] 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: messageText.includes('ANTHROPIC') || messageText.includes('OPENAI') ? 'LLM_ERROR' : 'INTERNAL_ERROR',
          message: '견적 에이전트 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
          details: messageText,
        },
      },
      { status: 500 }
    );
  }
}
