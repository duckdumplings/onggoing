import { NextRequest, NextResponse } from 'next/server';
import {
  buildFollowUpQuestions,
  extractQuoteInfo,
  normalizeExtractedQuoteInfo,
  ChatHistoryItem,
} from '@/domains/quote/services/quoteInfoExtractor';
import {
  STOP_FEE,
  fuelSurchargeHourlyCorrect,
  perJobBasePrice,
  perJobRegularPrice,
  pickHourlyRate,
  roundUpTo30Minutes,
} from '@/domains/quote/pricing';
import { createServerClient } from '@/libs/supabase-client';
import {
  buildConversationSummary,
  createInitialSlotState,
  getMissingSlots,
  mergeSlotState,
  SlotState,
  toExtractedFromSlots,
} from '@/domains/quote/services/conversationStateManager';
import { resolvePoiHintsFromText, saveToolCallLog } from '@/domains/quote/services/toolRouter';
import { retrieveRagContext, retrieveSimilarQueryCandidate } from '@/domains/quote/services/ragRetriever';
import { searchWebKnowledge } from '@/domains/quote/services/webKnowledgeRetriever';
import { parseStructuredLogisticsMemo } from '@/domains/quote/services/structuredLogisticsParser';

type ExtractedContext = {
  vehicleType?: '레이' | '스타렉스';
  scheduleType?: 'regular' | 'ad-hoc';
  knownAddresses?: string[];
};

type SessionContextRow = {
  session_id: string;
  slot_state: SlotState;
  summary: string | null;
  updated_at: string;
};

type QuotePlan = {
  total: number;
  formatted: string;
};

type RouteErrorSuggestion = {
  type?: string;
  title?: string;
  description?: string;
};

type EvidenceSource = {
  type: 'internal' | 'attachment' | 'web';
  label: string;
  url?: string;
};

type EvidencePayload = {
  basis: string[];
  sources: EvidenceSource[];
  fetchedAt?: string;
};

function buildEvidencePayload(params: {
  ragSources: string[];
  webSources?: Array<{ title: string; url: string }>;
  usedWeb: boolean;
  usedRag: boolean;
  hasSessionSummary: boolean;
}): EvidencePayload {
  const basis: string[] = [];
  const sources: EvidenceSource[] = [];

  if (params.usedRag) basis.push('내부 지식/세션 컨텍스트를 우선 반영했습니다.');
  if (params.hasSessionSummary) basis.push('세션 요약 메모리를 반영해 맥락을 유지했습니다.');
  if (params.usedWeb) basis.push('부족한 일반 지식은 웹 검색 결과를 보강해 반영했습니다.');

  const uniqueRag = Array.from(new Set(params.ragSources));
  for (const src of uniqueRag) {
    if (src.startsWith('attachment:')) {
      sources.push({ type: 'attachment', label: src.replace('attachment:', '') });
      continue;
    }
    sources.push({ type: 'internal', label: src.replace(/^knowledge:/, 'knowledge: ') });
  }

  for (const web of params.webSources || []) {
    sources.push({ type: 'web', label: web.title || web.url, url: web.url });
  }

  return {
    basis: basis.length ? basis : ['사용자 입력과 세션 컨텍스트를 기반으로 응답했습니다.'],
    sources: sources.slice(0, 8),
  };
}

function buildPreferenceInstruction(slotState: SlotState): string {
  const lines: string[] = [];
  const responseStyle = slotState.preferences?.responseStyle;
  if (responseStyle === 'concise') {
    lines.push('답변은 2~4문장으로 간결하게 작성하세요.');
  } else if (responseStyle === 'detailed') {
    lines.push('답변은 핵심 요약 후 상세 설명을 포함해 작성하세요.');
  }
  if (slotState.preferences?.preferredVehicleType) {
    lines.push(`차량 정보가 누락되면 ${slotState.preferences.preferredVehicleType}를 우선 제안하세요.`);
  }
  if (slotState.preferences?.preferredScheduleType) {
    lines.push(
      `스케줄 정보가 누락되면 ${slotState.preferences.preferredScheduleType === 'regular' ? '정기' : '비정기'}를 우선 제안하세요.`
    );
  }
  return lines.join('\n');
}

function buildRouteFailureConversation(errorPayload: any): {
  assistantMessage: string;
  suggestedPrompts: string[];
} {
  const details = errorPayload?.details || {};
  const errors: string[] = Array.isArray(details?.errors) ? details.errors : [];
  const suggestions: RouteErrorSuggestion[] = Array.isArray(details?.suggestions) ? details.suggestions : [];
  const diag = errorPayload?.diagnostics;
  const diagCode = typeof diag?.code === 'string' ? diag.code : '';
  const diagActions: string[] = Array.isArray(diag?.nextBestActions) ? diag.nextBestActions : [];
  const addressHints: string[] = Array.isArray(diag?.suggestedAddressHints)
    ? diag.suggestedAddressHints.filter((s: unknown) => typeof s === 'string' && s.trim())
    : [];
  const failedAddr =
    Array.isArray(diag?.failedAddresses) && diag.failedAddresses[0]?.address
      ? String(diag.failedAddresses[0].address)
      : '';

  const firstReason =
    errors[0] ||
    errorPayload?.error ||
    errorPayload?.message ||
    (typeof details === 'string' ? details : '') ||
    '경로 계산 중 충돌이 발생했습니다.';

  // 지오코딩 실패: LLM이 아니라 API 템플릿이었던 문구를, 사용자 입력(raw)을 존중하는 톤으로 정리
  if (diagCode.startsWith('GEOCODE_')) {
    const roleLabel =
      diagCode === 'GEOCODE_DESTINATION_FAILED' || diagCode === 'GEOCODE_DESTINATION_INVALID'
        ? '목적지'
        : '출발지';
    const lines = [
      '메모처럼 길게 적어 주셔도 괜찮아요. 지도·경로를 그리려면 **주소를 좌표로 바꾸는 단계**가 한 번 더 필요한데, 방금은 그 단계에서만 막혔어요.',
      '',
      `${roleLabel}를 시스템이 아직 좌표로 못 찾았어요:`,
      failedAddr ? `「${failedAddr}」` : firstReason,
      '',
      '보통은 **건물명·층·괄호 설명만 잠시 빼고**, 도로명+번지 위주로 한 줄만 보내 주시면 같은 배송이라도 바로 잡혀요. 아래 줄을 그대로 복사해서 다시 말씀해 주셔도 됩니다.',
    ];
    const assistantMessage = lines.filter(Boolean).join('\n');

    const suggestedPrompts =
      addressHints.length > 0
        ? addressHints.slice(0, 5)
        : diagActions.length > 0
          ? diagActions.slice(0, 4)
          : [`${roleLabel}: 서울특별시 OO구 OO로 123`];

    return { assistantMessage, suggestedPrompts };
  }

  const assistantMessage = [
    '좋은 질문이에요. 지금 계산이 멈춘 이유를 먼저 설명드릴게요.',
    firstReason,
    errors.length > 1 ? `추가로 ${errors.length - 1}개의 충돌이 더 있어요.` : '',
    diagActions.length ? '아래 안내대로 주소만 다듬어서 다시 시도해 보세요.' : '아래 해결안 중 하나로 바로 다시 계산해볼 수 있어요.',
  ].filter(Boolean).join('\n');

  const suggestedPrompts =
    diagActions.length > 0
      ? diagActions.slice(0, 4)
      : suggestions
          .map((s) => {
            const title = s.title || '해결안 적용';
            const desc = s.description ? `(${s.description})` : '';
            return `${title} ${desc}`.trim();
          })
          .slice(0, 4);

  return { assistantMessage, suggestedPrompts };
}

function detectMultiScenarioInput(message: string): boolean {
  const numberedBlocks = message.match(/(^|\n)\s*\d+\.\s+/g)?.length ?? 0;
  const lineMentions = message.match(/배송라인|라인\s*변경|라인\s*신설/g)?.length ?? 0;
  return numberedBlocks >= 2 || lineMentions >= 2;
}

function buildConversationalAssistantMessage(params: {
  assistantResponse?: string;
  missingFields: string[];
  extracted: {
    vehicleType?: '레이' | '스타렉스';
    scheduleType?: 'regular' | 'ad-hoc';
    origin?: { address?: string };
    destinations?: Array<{ address?: string }>;
  };
  isMultiScenario: boolean;
}): string {
  if (params.assistantResponse?.trim()) {
    return params.assistantResponse.trim();
  }

  if (params.isMultiScenario) {
    return '메모에 서로 다른 배송 시나리오가 여러 건 섞여 있어요. 한 번에 하나의 라인만 계산할 수 있어서, 먼저 1번/2번/3번 중 어떤 건을 견적할지 알려주세요.';
  }

  const knownVehicle = params.extracted.vehicleType
    ? `차량은 ${params.extracted.vehicleType}로 반영했어요. `
    : '';
  const knownSchedule =
    params.extracted.scheduleType === 'regular'
      ? '정기 기준으로 보고 있어요. '
      : params.extracted.scheduleType === 'ad-hoc'
        ? '비정기 기준으로 보고 있어요. '
        : '';

  const askParts: string[] = [];
  if (params.missingFields.includes('origin')) askParts.push('출발지 주소');
  if (params.missingFields.includes('destinations')) askParts.push('목적지(경유지) 주소');
  if (params.missingFields.includes('vehicleType')) askParts.push('차량 타입(레이/스타렉스)');
  if (params.missingFields.includes('scheduleType')) askParts.push('정기/비정기 구분');

  if (askParts.length === 0) {
    return '좋아요. 필요한 정보가 확인되어 견적 계산을 진행할게요.';
  }

  return `${knownVehicle}${knownSchedule}정확한 계산을 위해 ${askParts.join(', ')}를 알려주세요.`;
}

function toVehicleKey(vehicleType?: '레이' | '스타렉스'): 'ray' | 'starex' {
  return vehicleType === '스타렉스' ? 'starex' : 'ray';
}

function buildDepartureIso(timeHHMM?: string): string | null {
  if (!timeHHMM) return null;
  const [h, m] = timeHHMM.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function formatWon(value: number): string {
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

async function loadSessionContext(sessionId?: string | null): Promise<SlotState> {
  if (!sessionId) return createInitialSlotState();
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('quote_chat_session_contexts')
      .select('session_id, slot_state, summary, updated_at')
      .eq('session_id', sessionId)
      .maybeSingle();
    const row = data as SessionContextRow | null;
    if (!row?.slot_state) return createInitialSlotState();
    return {
      ...createInitialSlotState(),
      ...row.slot_state,
      destinations: Array.isArray(row.slot_state.destinations) ? row.slot_state.destinations : [],
      constraints: Array.isArray(row.slot_state.constraints) ? row.slot_state.constraints : [],
    };
  } catch {
    return createInitialSlotState();
  }
}

async function upsertSessionContext(sessionId: string | null | undefined, slotState: SlotState) {
  if (!sessionId) return;
  try {
    const supabase = createServerClient();
    await supabase.from('quote_chat_session_contexts').upsert(
      [
        {
          session_id: sessionId,
          slot_state: slotState,
          summary: buildConversationSummary(slotState),
        },
      ],
      { onConflict: 'session_id' }
    );
    await supabase
      .from('quote_chat_sessions')
      .update({ last_summary: buildConversationSummary(slotState).slice(0, 500) })
      .eq('id', sessionId);
  } catch {
    // 컨텍스트 저장 실패는 메인 플로우를 막지 않음
  }
}

async function logFailureCase(params: {
  sessionId?: string | null;
  userInput: string;
  assistantOutput?: string;
  errorCode: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createServerClient();
    await supabase.from('quote_chat_failure_cases').insert([
      {
        session_id: params.sessionId || null,
        user_input: params.userInput,
        assistant_output: params.assistantOutput || null,
        error_code: params.errorCode,
        reason: params.reason || null,
        tags: ['api'],
        metadata: params.metadata || {},
      },
    ]);
  } catch {
    // 실패 수집 로깅 실패는 메인 플로우를 방해하지 않음
  }
}

function mergeWithSlotExtracted(extracted: any, slotState: SlotState) {
  const slotExtracted = toExtractedFromSlots(slotState);
  return normalizeExtractedQuoteInfo({
    ...slotExtracted,
    ...extracted,
    origin: extracted?.origin || slotExtracted.origin,
    destinations: extracted?.destinations?.length ? extracted.destinations : slotExtracted.destinations,
    vehicleType: extracted?.vehicleType || slotExtracted.vehicleType,
    scheduleType: extracted?.scheduleType || slotExtracted.scheduleType,
    departureTime: extracted?.departureTime || slotExtracted.departureTime,
    specialRequirements: extracted?.specialRequirements?.length
      ? extracted.specialRequirements
      : slotExtracted.specialRequirements,
  });
}

function calculateQuoteFromRoute(params: {
  totalDistanceM: number;
  totalTimeSec: number;
  destinationCount: number;
  dwellMinutes: number[];
  vehicleType: '레이' | '스타렉스';
  scheduleType: 'regular' | 'ad-hoc';
}) {
  const vehicleKey = toVehicleKey(params.vehicleType);
  const km = params.totalDistanceM / 1000;
  const driveMinutes = Math.ceil(params.totalTimeSec / 60);
  const dwellTotalMinutes = params.dwellMinutes.reduce((acc, cur) => acc + cur, 0);
  const totalBillMinutes = driveMinutes + dwellTotalMinutes;

  const billMinutes = roundUpTo30Minutes(totalBillMinutes);
  const hourlyRate = pickHourlyRate(vehicleKey, billMinutes);
  const hourlyBase = Math.round((billMinutes / 60) * hourlyRate);
  const hourlyFuelSurcharge = fuelSurchargeHourlyCorrect(vehicleKey, km, billMinutes);
  const hourlyTotal = hourlyBase + hourlyFuelSurcharge;

  const perJobBase =
    params.scheduleType === 'regular'
      ? perJobRegularPrice(vehicleKey, km)
      : perJobBasePrice(vehicleKey, km);
  const effectiveStopsCount = Math.max(0, params.destinationCount - 1);
  let perJobStopFee = 0;
  if (params.scheduleType === 'regular') {
    perJobStopFee =
      vehicleKey === 'ray'
        ? effectiveStopsCount * STOP_FEE.starex
        : effectiveStopsCount * Math.round(STOP_FEE.starex * 1.2);
  } else {
    perJobStopFee = effectiveStopsCount * STOP_FEE[vehicleKey];
  }
  const perJobTotal = perJobBase + perJobStopFee;

  const isHourlyRecommended = hourlyTotal <= perJobTotal;
  const recommendedPlan: 'hourly' | 'perJob' = isHourlyRecommended ? 'hourly' : 'perJob';
  const totalPrice = isHourlyRecommended ? hourlyTotal : perJobTotal;

  return {
    recommendedPlan,
    totalPrice,
    hourly: {
      total: hourlyTotal,
      formatted: formatWon(hourlyTotal),
      billMinutes,
      ratePerHour: hourlyRate,
      fuelSurcharge: hourlyFuelSurcharge,
    },
    perJob: {
      total: perJobTotal,
      formatted: formatWon(perJobTotal),
      base: perJobBase,
      stopFee: perJobStopFee,
      effectiveStopsCount,
    },
    basis: {
      distanceKm: Number(km.toFixed(1)),
      driveMinutes,
      dwellTotalMinutes,
      totalBillMinutes,
      destinationCount: params.destinationCount,
      vehicleType: params.vehicleType,
      scheduleType: params.scheduleType,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = String(body?.message || '').trim();
    const history = (body?.history || []) as ChatHistoryItem[];
    const conversationContext = (body?.conversationContext || {}) as ExtractedContext;
    const sessionId = body?.sessionId ? String(body.sessionId) : null;
    const sessionSummary = body?.sessionSummary ? String(body.sessionSummary) : '';
    const attachmentIds = Array.isArray(body?.attachmentIds)
      ? body.attachmentIds.map((id: unknown) => String(id))
      : [];

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'message가 필요합니다.' },
        },
        { status: 400 }
      );
    }

    if (message.length > 6000) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INPUT_TOO_LONG', message: '입력 텍스트는 6000자를 초과할 수 없습니다.' },
        },
        { status: 400 }
      );
    }

    const rawIntentHint =
      /견적|요금|금액|비용|배송|경유|동선|경로|차량|정기|비정기|출발|도착|주소|ETA/i.test(message)
        ? 'business'
        : 'general';
    const isTimeSensitiveQuery = /오늘|내일|지금|현재|방금|이번주|다음주|오늘자|최신|업데이트|시각|시간/i.test(message);
    const similarCandidate =
      rawIntentHint === 'general' && !isTimeSensitiveQuery
        ? await retrieveSimilarQueryCandidate({
          sessionId,
          query: message,
          threshold: 0.78,
          limit: 100,
        })
        : null;
    if (similarCandidate && similarCandidate.similarityScore >= 0.78) {
      return NextResponse.json({
        success: true,
        extracted: {},
        missingFields: [],
        followUpQuestions: [],
        assistantMessage: `${similarCandidate.assistantText}\n\n(이전 유사 요청 답변을 재사용했어요. 최신성/정확성이 중요하면 “다시 검색해서 답변해줘”라고 말씀해주세요.)`,
        quote: null,
        routeSummary: null,
        assumptions: [],
        evidence: {
          basis: ['세션 내 유사 질의-응답 이력을 우선 재사용했습니다.'],
          sources: [
            {
              type: 'internal',
              label: `session-similarity:${similarCandidate.similarityScore.toFixed(2)}`,
            },
          ],
        },
        actions: {
          canApplyToPanel: false,
          canPreviewMap: false,
        },
      });
    }

    const previousSlotState = await loadSessionContext(sessionId);
    const preferenceInstruction = buildPreferenceInstruction(previousSlotState);

    const shouldUseRag = rawIntentHint === 'business' || attachmentIds.length > 0 || message.length > 120;
    const rag = shouldUseRag
      ? await retrieveRagContext({
        query: message,
        sessionId,
        limit: attachmentIds.length > 0 ? 4 : 2,
      })
      : { snippets: [], sources: [] };

    const llmPromptText = [
      sessionSummary ? `[세션 요약]\n${sessionSummary}` : '',
      preferenceInstruction ? `[응답 선호]\n${preferenceInstruction}` : '',
      `[현재 입력]\n${message}`,
      ...(rag.snippets || []).map((snippet, idx) => `[참고${idx + 1}] ${snippet}`),
    ]
      .filter(Boolean)
      .join('\n\n');
    const shouldUseWebSearch =
      rawIntentHint === 'general' ||
      /회사|주식회사|브랜드|뉴스|최신|요약|정의|뜻|누구|무엇|비교|설명/i.test(message);
    const web = shouldUseWebSearch
      ? await searchWebKnowledge({ query: message, maxResults: 3, timeoutMs: 3500 })
      : { snippets: [], sources: [], fetchedAt: new Date().toISOString() };
    const finalPromptText = [
      llmPromptText,
      ...(web.snippets || []).map((snippet, idx) => `[웹참고${idx + 1}] ${snippet}`),
    ]
      .filter(Boolean)
      .join('\n\n');
    const extraction = await extractQuoteInfo(finalPromptText, true, history);
    let extracted = normalizeExtractedQuoteInfo({
      ...extraction.extractedData,
      vehicleType: extraction.extractedData.vehicleType || conversationContext.vehicleType,
      scheduleType: extraction.extractedData.scheduleType || conversationContext.scheduleType,
    });
    extracted = mergeWithSlotExtracted(extracted, previousSlotState);

    const structuredMemo = parseStructuredLogisticsMemo(message);
    let replaceRouteFromMemo = false;
    if (structuredMemo?.extracted?.origin?.address && structuredMemo.extracted.destinations?.length) {
      replaceRouteFromMemo = structuredMemo.replaceRoute;
      extracted = normalizeExtractedQuoteInfo({
        ...extracted,
        origin: structuredMemo.extracted.origin,
        destinations: structuredMemo.extracted.destinations,
      });
    }

    if ((!extracted.origin?.address || !extracted.destinations?.length) && message.length <= 120) {
      const poiCandidates = await resolvePoiHintsFromText(message);
      if (poiCandidates.length) {
        if (!extracted.origin?.address) {
          extracted.origin = { address: poiCandidates[0].address };
        }
        if ((!extracted.destinations || extracted.destinations.length === 0) && poiCandidates.length > 1) {
          extracted.destinations = poiCandidates.slice(1).map((poi) => ({ address: poi.address }));
        }
        await saveToolCallLog({
          sessionId,
          tool: 'tmapGeocodeTool',
          input: { message },
          output: {
            count: poiCandidates.length,
            resolved: poiCandidates.map((poi) => ({ name: poi.name, address: poi.address })),
          },
        });
      }
    }

    let slotState = mergeSlotState(previousSlotState, extracted, message, {
      replaceRoute: replaceRouteFromMemo,
    });
    const isMultiScenario = detectMultiScenarioInput(message);

    const missingFields: string[] = getMissingSlots(slotState, false);

    const followUpQuestions = buildFollowUpQuestions(extracted, missingFields);
    const departureAt = buildDepartureIso(extracted.departureTime);

    const isNonQuoteIntent = slotState.lastUserIntent === 'document' || slotState.lastUserIntent === 'general';
    const evidence = buildEvidencePayload({
      ragSources: rag.sources || [],
      webSources: web.sources || [],
      usedWeb: Boolean(web.sources?.length),
      usedRag: Boolean(rag.sources?.length),
      hasSessionSummary: Boolean(sessionSummary),
    });

    // 문서/일반 질의는 견적 필드 강제 없이 대화형으로 응답
    if (isNonQuoteIntent && missingFields.includes('origin') && missingFields.includes('destinations')) {
      const ragHint = rag.snippets.slice(0, 2).join('\n');
      await upsertSessionContext(sessionId, slotState);
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions: [],
        assistantMessage: extracted.assistantResponse || `요청하신 내용을 확인했어요. 참고 가능한 내부 문서를 기반으로 정리하면 아래와 같습니다.\n${ragHint || '현재 세션에서 참고할 문서가 부족해요. 파일을 업로드하면 더 정확히 도와드릴 수 있어요.'}`,
        evidence: {
          ...evidence,
          fetchedAt: web.fetchedAt,
        },
        quote: null,
        routeSummary: null,
        assumptions: [],
        rag: {
          sources: rag.sources,
          attachmentIds,
        },
        actions: {
          canApplyToPanel: false,
          canPreviewMap: false,
        },
      });
    }

    // 핵심 필드가 부족하거나 멀티 시나리오 입력이면 계산을 생략
    if (isMultiScenario || missingFields.includes('origin') || missingFields.includes('destinations')) {
      await upsertSessionContext(sessionId, slotState);
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions,
        assistantMessage: buildConversationalAssistantMessage({
          assistantResponse: extracted.assistantResponse,
          missingFields,
          extracted,
          isMultiScenario,
        }),
        quote: null,
        routeSummary: null,
        assumptions: [],
        evidence: {
          ...evidence,
          fetchedAt: web.fetchedAt,
        },
        actions: {
          canApplyToPanel: false,
          canPreviewMap: false,
        },
        rag: {
          sources: rag.sources,
        },
      });
    }

    const originAddress = extracted.origin!.address;
    const destinationAddresses = extracted.destinations!.map((d) => d.address).slice(0, 20);
    const deliveryTimes = extracted.destinations!.map((d) => d.deliveryTime || '');
    const isNextDayFlags = extracted.destinations!.map((d) => Boolean(d.isNextDay));
    const dwellMinutes = [10, ...extracted.destinations!.map((d) => d.dwellMinutes || 10)];
    const vehicleType = extracted.vehicleType || slotState.vehicleType || '레이';
    const scheduleType = extracted.scheduleType || slotState.scheduleType || 'ad-hoc';
    slotState = {
      ...slotState,
      origin: originAddress,
      destinations: destinationAddresses,
      vehicleType,
      scheduleType,
      departureTime: extracted.departureTime || slotState.departureTime,
      lastUpdatedAt: new Date().toISOString(),
    };

    // 동일 서버 내부 API 호출
    const routePayload = {
      origins: [originAddress],
      destinations: destinationAddresses,
      finalDestinationAddress: destinationAddresses[destinationAddresses.length - 1] || null,
      useExplicitDestination: destinationAddresses.length > 0,
      vehicleType,
      optimizeOrder: true,
      useRealtimeTraffic: !departureAt,
      departureAt: departureAt || undefined,
      deliveryTimes,
      isNextDayFlags,
      dwellMinutes,
      returnToOrigin: false,
      roadOption: 'time-first',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let routeRes: Response;
    try {
      routeRes = await fetch(new URL('/api/route-optimization', request.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routePayload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!routeRes.ok) {
      await upsertSessionContext(sessionId, slotState);
      const err = await routeRes.json().catch(() => ({}));
      const failure = buildRouteFailureConversation(err);
      await logFailureCase({
        sessionId,
        userInput: message,
        assistantOutput: failure.assistantMessage,
        errorCode: 'ROUTE_OPTIMIZATION_FAILED',
        reason: err?.message || err?.error || 'route optimization failed',
        metadata: { details: err?.details || null },
      });
      return NextResponse.json(
        {
          success: false,
          assistantMessage: failure.assistantMessage,
          suggestedPrompts: failure.suggestedPrompts,
          evidence: {
            ...evidence,
            fetchedAt: web.fetchedAt,
          },
          extracted,
          missingFields,
          followUpQuestions,
          error: {
            code: 'ROUTE_OPTIMIZATION_FAILED',
            message: err?.message || err?.error || '경로 계산에 실패했습니다.',
            details: err?.details,
            diagnostics: err?.diagnostics,
          },
        },
        { status: routeRes.status >= 400 && routeRes.status < 600 ? routeRes.status : 500 }
      );
    }

    const routeJson = await routeRes.json();
    if (!routeJson?.success || !routeJson?.data?.summary) {
      await upsertSessionContext(sessionId, slotState);
      const failure = buildRouteFailureConversation({
        message: '경로 계산 응답 형식이 올바르지 않습니다.',
      });
      await logFailureCase({
        sessionId,
        userInput: message,
        assistantOutput: failure.assistantMessage,
        errorCode: 'ROUTE_RESULT_INVALID',
        reason: '경로 계산 응답 형식이 올바르지 않습니다.',
      });
      return NextResponse.json(
        {
          success: false,
          assistantMessage: failure.assistantMessage,
          suggestedPrompts: failure.suggestedPrompts,
          evidence: {
            ...evidence,
            fetchedAt: web.fetchedAt,
          },
          extracted,
          missingFields,
          followUpQuestions,
          error: {
            code: 'ROUTE_RESULT_INVALID',
            message: '경로 계산 응답 형식이 올바르지 않습니다.',
          },
        },
        { status: 500 }
      );
    }

    const routeSummary = routeJson.data.summary;
    const quote = calculateQuoteFromRoute({
      totalDistanceM: Number(routeSummary.totalDistance || 0),
      totalTimeSec: Number(routeSummary.travelTime || routeSummary.totalTime || 0),
      destinationCount: destinationAddresses.length,
      dwellMinutes: dwellMinutes.slice(1),
      vehicleType,
      scheduleType,
    });

    const assumptions: string[] = [];
    if (!extracted.departureTime) assumptions.push('출발시간 미기재로 현재시각 기준(실시간 교통)으로 계산했습니다.');
    if (!extracted.destinations?.some((d) => Number.isFinite(d.dwellMinutes))) assumptions.push('체류시간 미기재 목적지는 기본 10분으로 계산했습니다.');
    if (!extracted.scheduleType) assumptions.push('스케줄 타입 미기재로 비정기(ad-hoc) 기준으로 계산했습니다.');
    if (!extracted.vehicleType) assumptions.push('차량 타입 미기재로 레이 기준으로 계산했습니다.');

    await upsertSessionContext(sessionId, slotState);
    return NextResponse.json({
      success: true,
      extracted: {
        ...extracted,
        vehicleType,
        scheduleType,
      },
      missingFields,
      followUpQuestions,
      assistantMessage: buildConversationalAssistantMessage({
        assistantResponse: extracted.assistantResponse,
        missingFields,
        extracted: {
          ...extracted,
          vehicleType,
          scheduleType,
        },
        isMultiScenario,
      }),
      routeSummary: {
        totalDistance: routeSummary.totalDistance,
        totalTime: routeSummary.totalTime,
        travelTime: routeSummary.travelTime,
        dwellTime: routeSummary.dwellTime,
      },
      quote: {
        recommendedPlan: quote.recommendedPlan,
        totalPrice: quote.totalPrice,
        totalPriceFormatted: formatWon(quote.totalPrice),
        hourly: quote.hourly as QuotePlan & Record<string, unknown>,
        perJob: quote.perJob as QuotePlan & Record<string, unknown>,
        basis: quote.basis,
      },
      assumptions,
      evidence: {
        ...evidence,
        fetchedAt: web.fetchedAt,
      },
      routeRequest: routePayload,
      rag: {
        sources: rag.sources,
        attachmentIds,
      },
      actions: {
        canApplyToPanel: true,
        canPreviewMap: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    const code = message.includes('OPENAI') ? 'OPENAI_ERROR' : 'INTERNAL_ERROR';
    await logFailureCase({
      sessionId: null,
      userInput: 'unknown',
      assistantOutput: '일시적인 시스템 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
      errorCode: code,
      reason: message,
      metadata: { stage: 'catch' },
    });
    return NextResponse.json(
      {
        success: false,
        assistantMessage: '일시적인 시스템 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
        error: {
          code,
          message,
        },
      },
      { status: 500 }
    );
  }
}

