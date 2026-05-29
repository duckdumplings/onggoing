import { NextRequest, NextResponse } from 'next/server';
import { generateText, stepCountIs } from 'ai';

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

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const message: string = String(body?.message || '').trim();
    const sessionId: string | null = body?.sessionId ? String(body.sessionId) : null;
    const history: ChatHistoryItem[] = Array.isArray(body?.history) ? body.history : [];
    const departureAt: string | undefined = body?.departureAt ? String(body.departureAt) : undefined;

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

    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      temperature: AGENT_DEFAULTS.temperature,
      stopWhen: stepCountIs(AGENT_DEFAULTS.maxSteps),
    });

    // 도구 결과에서 구조화 산출물 수집(마지막 호출 우선)
    // generateText의 result.toolResults는 "마지막 스텝"의 결과만 담으므로,
    // 모든 스텝의 toolResults를 순서대로 평탄화해 누락을 방지한다.
    let scenarioComparison: any = null;
    let scenarioRouteErrors: any[] = [];
    let agentQuote: any = null;
    let askedQuestion: string | null = null;

    const allToolResults = (result.steps ?? []).flatMap(
      (s: any) => (s.toolResults ?? []) as Array<{ toolName: string; output: any }>
    );

    for (const tr of allToolResults) {
      if (tr.toolName === 'compare_scenarios' && tr.output?.comparison) {
        scenarioComparison = tr.output.comparison;
        scenarioRouteErrors = tr.output.routeErrors || [];
      } else if (tr.toolName === 'calculate_quote' && tr.output && !tr.output.error) {
        agentQuote = buildAgentQuote(tr.output.plans);
      } else if (tr.toolName === 'ask_user' && tr.output?.question) {
        askedQuestion = tr.output.question;
      }
    }

    const toolNames = trace.map((t) => t.tool);
    const missingFields = askedQuestion ? ['clarification'] : [];

    // 대화 영속(베스트 에포트)
    if (sessionId) {
      try {
        const supabase = createServerClient();
        await supabase.from('quote_chat_messages').insert([
          { session_id: sessionId, role: 'user', content: message },
          {
            session_id: sessionId,
            role: 'assistant',
            content: result.text,
            metadata: {
              kind: 'agent-response',
              provider,
              model: modelId,
              steps: result.steps.length,
              tools: toolNames,
              hasScenarioComparison: Boolean(scenarioComparison),
            },
          },
        ]);
      } catch {
        /* 영속 실패 무시 */
      }
    }

    return NextResponse.json({
      success: true,
      assistantMessage: result.text,
      quote: agentQuote,
      scenarioComparison,
      scenarioRouteErrors,
      missingFields,
      followUpQuestions: askedQuestion ? [{ field: 'clarification', question: askedQuestion }] : [],
      assumptions: [],
      pipeline: {
        mode: 'agent',
        provider,
        llmModel: modelId,
        steps: result.steps.length,
        toolCalls: toolNames,
        finishReason: result.finishReason,
        elapsedMs: Date.now() - startedAt,
      },
      trace,
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
