import { NextRequest, NextResponse } from 'next/server';
import { streamText, stepCountIs } from 'ai';

import { resolveModel, AGENT_DEFAULTS } from '@/libs/llm/provider';
import { buildQuoteAgentTools } from '@/domains/quote/agent/tools';
import { saveToolCallLog } from '@/domains/quote/services/toolRouter';
import {
  guardCaseBoardResponse,
  guardSingleQuoteResponse,
} from '@/domains/quote/services/quoteResponseGuard';
import { shouldForceQuoteCaseBoard } from '@/domains/quote/services/multiLineIntent';
import { SYSTEM_PROMPT } from '@/domains/quote/agent/systemPrompt';
import { retrieveFeedbackGuidance } from '@/domains/quote/services/ragRetriever';
import { createServerClient } from '@/libs/supabase-client';
import {
  getClientRateLimitKey,
  InMemoryRateLimiter,
} from '@/libs/server/inMemoryRateLimit';

export const runtime = 'nodejs';
export const maxDuration = 120;

const limiter = new InMemoryRateLimiter({ windowMs: 60_000, limit: 20 });
const MAX_MESSAGE_CHARS = 12_000;
const MAX_HISTORY_CHARS = 24_000;

interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}


function buildAgentQuote(output: any): any {
  const plans = output?.plans;
  if (!plans) return null;
  return {
    plans,
    recommendedPlan: output?.recommendedPlan ?? null,
    oneTimePrice: output?.oneTimePrice ?? null,
    annualPrice: output?.annualPrice ?? null,
    formattedOneTime: output?.formattedOneTime ?? null,
    formattedAnnual: output?.formattedAnnual ?? null,
    hourly: plans.hourly ?? null,
    perJobReferenceRequested: Boolean(output?.perJobReferenceRequested),
    perJob: output?.perJobReferenceRequested ? plans.perJob ?? null : null,
    // 견적 카드(거리/시간/차종)와 실비 투명성 카드 렌더용. calculate_quote가 결정적으로 채운다.
    basis: output?.basis ?? null,
    costReference: output?.costReference ?? null,
  };
}

type CollectedOutputs = {
  scenarioComparison: any;
  scenarioRouteErrors: any[];
  scenarioRoutes: any[];
  agentQuote: any;
  routeRequest: any;
  departureMatrix: any;
  auditTimeline: any;
  caseBoard: any;
  askedQuestion: string | null;
};

/** 도구 결과 1건을 누적 산출물에 반영(마지막 호출 우선). */
function applyToolResult(acc: CollectedOutputs, toolName: string, output: any): void {
  if (toolName === 'compare_scenarios' && output?.comparison) {
    acc.scenarioComparison = output.comparison;
    acc.scenarioRouteErrors = output.routeErrors || [];
    acc.scenarioRoutes = output.scenarioRoutes || [];
  } else if (toolName === 'calculate_quote' && output && !output.error) {
    acc.agentQuote = buildAgentQuote(output);
  } else if (toolName === 'optimize_route' && output?.routeRequest) {
    acc.routeRequest = output.routeRequest;
  } else if (toolName === 'audit_delivery_timeline' && output && !output.error) {
    // 사후 진단 결과를 카드로 렌더하도록 전체 산출물 보존 + 지도용 routeRequest 노출.
    acc.auditTimeline = output;
    if (output.routeRequest) acc.routeRequest = output.routeRequest;
  } else if (toolName === 'compare_departure_times' && Array.isArray(output?.matrix)) {
    acc.departureMatrix = output;
  } else if (toolName === 'quote_case_board' && Array.isArray(output?.cases)) {
    acc.caseBoard = output;
    // 첫 유효 케이스 경로를 지도 기본 미리보기로 노출(없으면 유지).
    const firstWithRoute = output.cases.find((c: any) => c?.routeRequest && !c?.error);
    if (firstWithRoute?.routeRequest && !acc.routeRequest) acc.routeRequest = firstWithRoute.routeRequest;
  } else if (toolName === 'forecast_route_timeline' && output?.routeRequest) {
    // 타임라인 산출 경로를 지도("지도에서 보기")에서 그대로 볼 수 있게 노출.
    acc.routeRequest = output.routeRequest;
  } else if (toolName === 'ask_user' && output?.question) {
    acc.askedQuestion = output.question;
  }
}

/** KST(Asia/Seoul) "M월 D일 HH:mm" 라벨. 출발시간 가정 노출용. */
function formatDepartureKST(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * 견적 가정/전제를 도구 산출물에서 결정적으로 구성한다(LLM 생성 아님 — 환각 방지).
 * 요금제/협의단가/출발시간/실시간 교통·유류할증 포함 여부를 사실 그대로 한 줄씩 노출한다.
 */
function buildAssumptions(acc: CollectedOutputs, departureAt?: string): string[] {
  const out: string[] = [];
  const hourly = acc.agentQuote?.hourly;
  const scheduleType = acc.agentQuote?.basis?.scheduleType;

  if (hourly?.rateOverride) {
    out.push('협의 단가(시간당) 기준으로 산출했어요. 공식 운임표 기준과 다를 수 있어요.');
  }
  if (scheduleType) {
    out.push(
      scheduleType === 'regular'
        ? '정기(regular) 배송의 시간당 운임표 기준이에요.'
        : '비정기(ad-hoc) 배송의 시간당 운임표 기준이에요.'
    );
  }
  // 케이스 보드는 케이스마다 출발시각을 지정해 그 시각의 Tmap 예측 교통을 반영한다.
  // 전역 departureAt이 비어 있어도 "평일 한산 가정"이라 말하면 안 된다(보드가 실제로 시간대 교통을 반영함).
  const boardDepartures: string[] = Array.isArray(acc.caseBoard?.cases)
    ? Array.from(new Set(acc.caseBoard.cases.map((c: any) => c?.departureLabel).filter(Boolean)))
    : [];
  if (boardDepartures.length) {
    out.push(`각 케이스 출발시각(${boardDepartures.join(' · ')}) 기준 Tmap 예측 교통을 반영한 소요시간이에요.`);
    // 일부 구간이 예측 실패로 호출시점 교통으로 대체됐으면 솔직히 알린다(여유가 과장될 수 있음).
    const fallbackCases = Array.isArray(acc.caseBoard?.cases)
      ? acc.caseBoard.cases.filter((c: any) => Number(c?.predictionFallbackSegments) > 0).length
      : 0;
    if (fallbackCases > 0) {
      out.push(`일부 케이스(${fallbackCases}개)는 예측 실패로 호출 시점 교통으로 대체된 구간이 있어 실제 정체가 덜 반영됐을 수 있어요.`);
    }
    out.push('유류할증은 과금시간 기반 초과거리에 포함했어요.');
  } else {
    out.push(
      departureAt
        ? `출발 시각 ${formatDepartureKST(departureAt)} 기준 소요시간이에요.`
        : '평일 오전 한산 시간대 기준 소요시간을 가정했어요.'
    );
    out.push('실시간 교통을 반영했고, 유류할증은 과금시간 기반 초과거리에 포함했어요.');
  }
  return out;
}

/**
 * 견적 신뢰도(배지)를 도구 산출물 신호로 산정한다. ConfidenceBadge가 기대하는 형태.
 * 경로 산출 실패면 무조건 low, 그 외 충족 신호 비율로 high/medium 구분.
 */
function buildConfidence(acc: CollectedOutputs, departureAt?: string) {
  const routeComputed = Boolean(acc.routeRequest) || Boolean(acc.scenarioComparison);
  const quoted = Boolean(acc.agentQuote) || Boolean(acc.scenarioComparison);
  const signals = [
    { ok: routeComputed, label: routeComputed ? '경로 거리·시간 산출 완료' : '경로 미산출(거리 추정)' },
    { ok: quoted, label: quoted ? '옹고잉 운임표 기반 요금 산출' : '요금 미산출' },
    {
      ok: Boolean(departureAt),
      label: departureAt ? '출발 시각 지정' : '출발 시각 미지정(평일 한산 가정)',
    },
    { ok: true, label: '실시간 교통 반영' },
  ];
  const score = Math.round((signals.filter((s) => s.ok).length / signals.length) * 100);
  const level: 'high' | 'medium' | 'low' = !routeComputed ? 'low' : score >= 75 ? 'high' : 'medium';
  return { level, score, signals };
}

/**
 * 후속 제안 칩(컴포저 상단). 결정적 UI 어포던스이며 사실(금액/거리)을 만들지 않는다.
 * 신뢰도 낮음(주소 저정밀/경로 미산출)이면 정확 주소 재입력을 최우선 제안한다.
 */
function buildSuggestedPrompts(acc: CollectedOutputs, confidenceLevel?: 'high' | 'medium' | 'low'): string[] {
  const out: string[] = [];
  if (confidenceLevel === 'low') {
    out.push('정확한 도로명 주소로 다시 견적 내줘');
  }
  if (acc.scenarioComparison) {
    out.push('가장 저렴한 시나리오로 PDF 만들어줘');
    out.push('출발시간대별 차이도 보여줘');
  } else if (acc.agentQuote) {
    out.push('스타렉스로도 비교해줘');
    out.push('출발시간대별로 비교해줘');
    out.push('정기 배송이면 월 견적은?');
  }
  if (acc.departureMatrix) {
    out.push('가장 빠른 출발 기준으로 확정해줘');
  }
  // 중복 제거 + 최대 4개.
  return Array.from(new Set(out)).slice(0, 4);
}

/** 사람이 읽을 수 있는 단계 라벨(진행 칩 표시용). */
const STEP_LABELS: Record<string, string> = {
  geocode_addresses: '주소 좌표 변환',
  optimize_route: '경로 최적화',
  compare_scenarios: '시나리오 비교 계산',
  quote_case_board: '다중 라인 견적책 산출',
  calculate_quote: '견적 산출',
  forecast_route_timeline: '도착시각 타임라인',
  audit_delivery_timeline: '지연 진단 분석',
  validate_plan: '계획 점검',
  read_attachments: '첨부 문서 읽기',
  recall_recent_quotes: '과거 견적 조회',
  ask_user: '추가 질문 준비',
};

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

/** 여러 줄 텍스트를 한 줄 요약으로(공백 정규화 + 최대 n자). 세션 롤링 요약용. */
function oneLine(text: string, max: number): string {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const rate = limiter.consume(getClientRateLimitKey(request.headers));
    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: '견적 요청이 잠시 몰렸습니다. 잠시 후 다시 시도해 주세요.',
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSeconds) },
        },
      );
    }
    const body = await request.json();
    const message: string = String(body?.message || '').trim();
    const sessionId: string | null = body?.sessionId ? String(body.sessionId) : null;
    const history: ChatHistoryItem[] = Array.isArray(body?.history)
      ? body.history
          .filter(
            (item: unknown): item is ChatHistoryItem =>
              Boolean(
                item &&
                  typeof item === 'object' &&
                  ['user', 'assistant', 'system'].includes(
                    String((item as ChatHistoryItem).role),
                  ),
              ),
          )
          .slice(-12)
      : [];
    const departureAt: string | undefined = body?.departureAt ? String(body.departureAt) : undefined;
    const conversationContext = body?.conversationContext ?? null;
    const mapRouteContext = body?.mapRouteContext ?? null;
    const sessionSummary: string | null = body?.sessionSummary ? String(body.sessionSummary) : null;

    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '메시지가 비어 있습니다.' } },
        { status: 400 }
      );
    }

    const historyCharacters = history.reduce(
      (total, item) => total + String(item.content || '').length,
      0,
    );
    if (message.length > MAX_MESSAGE_CHARS || historyCharacters > MAX_HISTORY_CHARS) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: '요청이 너무 깁니다. 배송 라인별 핵심 주소·작업·시각만 남겨 다시 보내 주세요.',
          },
        },
        { status: 413 },
      );
    }

    const { model, provider, modelId } = resolveModel();

    const trace: Array<{ tool: string; input: unknown; output: unknown }> = [];
    const tools = buildQuoteAgentTools({
      baseUrl: request.url,
      sessionId,
      departureAt,
      sourceText: message,
      onToolEvent: (e) => {
        trace.push(e);
        void saveToolCallLog({ sessionId, tool: e.tool, input: e.input as any, output: e.output as any });
      },
    });

    const messages = [
      ...history
        .filter((h) => h.role === 'user' || h.role === 'assistant')
        .map((h) => ({ role: h.role as 'user' | 'assistant', content: String(h.content || '') })),
      { role: 'user' as const, content: message },
    ];

    // 멀티턴 메모리: 직전 결과(차종/스케줄/주소/시나리오)를 컨텍스트로 주입.
    const contextNote = conversationContext
      ? `\n\n[직전 견적 컨텍스트 — 후속 요청 시 기본값으로 이어서 사용하고, 사용자가 바꾼 항목만 갱신하라]\n${JSON.stringify(conversationContext).slice(0, 1500)}`
      : '';

    // 지도 "이 경로로 견적": 지도에 이미 확정된 주소를 권위 있게 전달 → 재파싱/재지오코딩 훼손 방지.
    const mapRouteNote = mapRouteContext
      ? `\n\n[지도에 표시된 현재 경로 — 권위 있는 입력]\n사용자가 "지도에 표시된 경로 그대로" 견적을 요청했다. 아래 origin/stops 주소는 지도에서 이미 확정된 것이다. 이 주소 문자열을 토씨 하나 바꾸지 말고 그대로 optimize_route에 사용하라(상호명으로 재구성하거나 동/번지를 추가/삭제하지 마라). 메시지 본문에 주소가 축약(예: "서울 용산구")돼 있어도, 여기 stops의 정식 주소를 우선 사용하라. 역할(상차/배송/반납)은 사용자의 이전 맥락과 본문을 따르되, 주소는 이 목록을 신뢰하라.\n${JSON.stringify(mapRouteContext).slice(0, 1800)}`
      : '';

    // 장기 대화 요약: 최근 history 윈도우(8개) 밖의 맥락을 복원한다(세션 연속성).
    const summaryNote = sessionSummary
      ? `\n\n[이전 대화 요약 — 최근 메시지 밖의 맥락. 참고용이며, 현재 사용자 메시지/새 문서가 우선한다]\n${sessionSummary.slice(0, 1200)}`
      : '';

    // 재귀개선: 과거 사용자 피드백(전역)에서 이번 요청과 유사한 반복 실패 패턴을 끌어와 프롬프트에 주입.
    // 부정 피드백 우선 + 태그(주소오염/역할오분류/순서 등)로 정책 힌트를 준다. 실패해도 조용히 진행(fail-open).
    let feedbackNote = '';
    try {
      const guidance = await retrieveFeedbackGuidance({ query: message, limit: 4 });
      const negatives = guidance.snippets.filter((s) => s.startsWith('[개선피드백]')).slice(0, 4);
      const hints: string[] = [];
      if (guidance.policyHints.addressNormalizationBoost) {
        hints.push('과거 유사 요청에서 주소 해석 문제가 있었다 — 사용자가 준 도로명/지번을 토씨 그대로 쓰고 구/동 단위로 뭉개지지 않게 주의.');
      }
      if (guidance.policyHints.duplicateGuardBoost) {
        hints.push('과거 유사 요청에서 역할/순서 문제가 있었다 — 상차(pickup)를 배송보다 먼저 두고, 지점별 역할을 정확히 태깅하라.');
      }
      if (negatives.length || hints.length) {
        feedbackNote =
          `\n\n[반복 피드백 반영 — 참고용, 과거 유사 요청에서 사용자가 아쉬워한 점. 같은 실수를 피하되 현재 입력이 우선한다]\n` +
          [...hints.map((h) => `- ${h}`), ...negatives.map((s) => `- ${s}`)].join('\n');
      }
    } catch {
      /* 피드백 조회 실패 시 무시 */
    }

    const systemPrompt = SYSTEM_PROMPT + contextNote + mapRouteNote + summaryNote + feedbackNote;
    const forceQuoteCaseBoard = shouldForceQuoteCaseBoard(message);

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      temperature: AGENT_DEFAULTS.temperature,
      stopWhen: stepCountIs(AGENT_DEFAULTS.maxSteps),
      prepareStep: forceQuoteCaseBoard
        ? ({ stepNumber }) =>
            stepNumber === 0
              ? {
                  activeTools: ['quote_case_board'],
                  toolChoice: { type: 'tool', toolName: 'quote_case_board' },
                }
              : {}
        : undefined,
    });

    const acc: CollectedOutputs = {
      scenarioComparison: null,
      scenarioRouteErrors: [],
      scenarioRoutes: [],
      agentQuote: null,
      routeRequest: null,
      departureMatrix: null,
      auditTimeline: null,
      caseBoard: null,
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

        // streamText 결과 1건을 소비하며 텍스트/도구이벤트를 클라이언트로 흘려보낸다.
        const consume = async (
          res: typeof result
        ): Promise<{ fullText: string; tailText: string; streamError: string | null }> => {
          let fullText = '';
          // tailText: 마지막 도구 이벤트 이후의 텍스트만. 도구 호출 사이의 예고성 중간 멘트("~하겠습니다")를
          // 최종 답에서 제거하기 위함(라이브 스트림에는 전부 그대로 흘려보낸다).
          let tailText = '';
          let streamError: string | null = null;
          try {
            for await (const part of res.fullStream) {
              switch (part.type) {
                case 'text-delta':
                  fullText += part.text;
                  tailText += part.text;
                  send({ type: 'text', delta: part.text });
                  break;
                case 'tool-call':
                  tailText = ''; // 도구 호출 직전까지의 예고성 텍스트는 최종 답에서 버린다
                  send({ type: 'step', name: part.toolName, label: STEP_LABELS[part.toolName] || part.toolName, phase: 'start' });
                  break;
                case 'tool-result':
                  tailText = ''; // 도구 결과 이후 새로 쓰는 텍스트만 최종 답으로 인정
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
          return { fullText, tailText, streamError };
        };

        const c1 = await consume(result);
        let fullText = c1.fullText;
        let tailText = c1.tailText;
        let streamError = c1.streamError;
        let finishReason = 'stop';
        let stepCount = 0;
        try {
          finishReason = await result.finishReason;
          stepCount = (await result.steps).length;
        } catch {
          /* 무시 */
        }

        // P1 stall 가드: 도구를 하나도 호출하지 않고 산출물도 없이 텍스트(예고)만 낸 경우,
        // 1회에 한해 "지금 도구를 호출하라"는 넛지로 재시도한다(빈 예고가 최종 답이 되는 것을 방지).
        const hasAnyOutput = () =>
          Boolean(acc.agentQuote || acc.scenarioComparison || acc.routeRequest || acc.departureMatrix || acc.caseBoard || acc.askedQuestion);
        const stalled = trace.length === 0 && !hasAnyOutput() && !streamError && Boolean(fullText);
        if (stalled) {
          send({ type: 'step', name: 'retry', label: '분석 이어서 진행', phase: 'start' });
          const nudge =
            '\n\n[시스템 지시 — 매우 중요] 방금 너는 예고만 하고 도구를 호출하지 않은 채 답을 끝냈다. 지금 즉시 필요한 도구(geocode_addresses / optimize_route / audit_delivery_timeline / compare_departure_times 등)를 호출해 실제 수치를 산출하고, 그 결과로만 결론을 작성하라. 다시 "~하겠습니다"라고만 답하지 마라.';
          const retryMessages = [
            ...messages,
            { role: 'assistant' as const, content: fullText },
            { role: 'user' as const, content: '예고만 하지 말고, 지금 도구를 호출해서 분석을 끝까지 진행해줘.' },
          ];
          const retry = streamText({
            model,
            system: systemPrompt + nudge,
            messages: retryMessages,
            tools,
            temperature: AGENT_DEFAULTS.temperature,
            stopWhen: stepCountIs(AGENT_DEFAULTS.maxSteps),
          });
          send({ type: 'text', delta: '\n\n' });
          const c2 = await consume(retry);
          send({ type: 'step', name: 'retry', label: '분석 이어서 진행', phase: c2.streamError ? 'error' : 'done' });
          fullText = `${fullText}\n\n${c2.fullText}`.trim();
          tailText = c2.tailText; // 재시도 후 최종 답은 재시도 스트림의 tail
          if (c2.streamError && !streamError) streamError = c2.streamError;
          try {
            finishReason = await retry.finishReason;
            stepCount += (await retry.steps).length;
          } catch {
            /* 무시 */
          }
        }

        const toolNames = trace.map((t) => t.tool);
        const succeeded = !streamError || Boolean(fullText);
        // 최종 답은 마지막 도구 이후 텍스트(tail)만 사용해 예고성 중간 멘트를 제거한다. 비면 전체 텍스트로 폴백.
        let finalMessage = tailText.trim() || fullText;
        const singleQuoteGuarded = guardSingleQuoteResponse(finalMessage, acc.agentQuote);
        const guardedFinal = guardCaseBoardResponse(singleQuoteGuarded, acc.caseBoard);
        if (guardedFinal !== finalMessage) {
          // 가드가 덧붙인 안내를 라이브 스트림에도 반영(최종 payload는 finalMessage 사용).
          send({ type: 'text', delta: guardedFinal.slice(finalMessage.length) });
          finalMessage = guardedFinal;
        }

        // 견적/시나리오가 산출된 경우에만 가정·신뢰도를 노출(질문만 한 턴 등에는 미노출).
        const hasQuoteOutput = Boolean(acc.agentQuote) || Boolean(acc.scenarioComparison) || Boolean(acc.caseBoard);
        const assumptions = hasQuoteOutput ? buildAssumptions(acc, departureAt) : [];
        const confidence = hasQuoteOutput ? buildConfidence(acc, departureAt) : undefined;
        // 재시도 후에도 도구 0건·산출물 0건이면(여전히 stall) 사용자가 막히지 않도록 재시도 칩을 제시.
        const stillStalled = trace.length === 0 && !hasAnyOutput();
        const suggestedPrompts = hasQuoteOutput
          ? buildSuggestedPrompts(acc, confidence?.level)
          : stillStalled
            ? ['최적 경로로 다시 분석해줘']
            : [];

        const finalPayload = {
          success: succeeded,
          assistantMessage: finalMessage,
          suggestedPrompts,
          quote: acc.agentQuote,
          scenarioComparison: acc.scenarioComparison,
          scenarioRouteErrors: acc.scenarioRouteErrors,
          scenarioRoutes: acc.scenarioRoutes,
          routeRequest: acc.routeRequest,
          departureMatrix: acc.departureMatrix,
          auditTimeline: acc.auditTimeline,
          caseBoard: acc.caseBoard,
          departureAt: departureAt ?? null,
          missingFields: acc.askedQuestion ? ['clarification'] : [],
          followUpQuestions: acc.askedQuestion ? [{ field: 'clarification', question: acc.askedQuestion }] : [],
          assumptions,
          confidence,
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
        if (sessionId && finalMessage) {
          try {
            const supabase = createServerClient();
            await supabase.from('quote_chat_messages').insert([
              { session_id: sessionId, role: 'user', content: message },
              {
                session_id: sessionId,
                role: 'assistant',
                content: finalMessage,
                metadata: {
                  kind: 'agent-response',
                  provider,
                  model: modelId,
                  steps: stepCount,
                  tools: toolNames,
                  hasScenarioComparison: Boolean(acc.scenarioComparison),
                  // 구조화 결과 영속 → 세션 재진입 시 카드/지도 복원.
                  structured: {
                    quote: acc.agentQuote ?? undefined,
                    scenarioComparison: acc.scenarioComparison ?? undefined,
                    scenarioRoutes: acc.scenarioRoutes?.length ? acc.scenarioRoutes : undefined,
                    scenarioRouteErrors: acc.scenarioRouteErrors?.length ? acc.scenarioRouteErrors : undefined,
                    routeRequest: acc.routeRequest ?? undefined,
                    departureMatrix: acc.departureMatrix ?? undefined,
                    auditTimeline: acc.auditTimeline ?? undefined,
                    caseBoard: acc.caseBoard ?? undefined,
                    departureAt: departureAt ?? undefined,
                    realtimeTraffic: true,
                    assumptions: assumptions.length ? assumptions : undefined,
                    confidence,
                  },
                },
              },
            ]);

            // 세션 롤링 요약 갱신: 최근 히스토리 윈도우(8개) 밖의 맥락을 다음 턴에 복원(sessionSummary로 읽힘).
            // 결정적 1줄(Q요약→A요약)을 누적하고 최근 ~1000자만 유지. 로컬 임시 세션은 제외.
            if (!sessionId.startsWith('local-')) {
              const turnLine = `- Q: ${oneLine(message, 80)} → A: ${oneLine(finalMessage, 140)}`;
              const prev = typeof sessionSummary === 'string' ? sessionSummary : '';
              const rolled = (prev ? `${prev}\n${turnLine}` : turnLine).slice(-1000);
              await supabase.from('quote_chat_sessions').update({ last_summary: rolled }).eq('id', sessionId);
            }
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
