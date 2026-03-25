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
import { retrieveFeedbackGuidance, retrieveRagContext, retrieveSimilarQueryCandidate } from '@/domains/quote/services/ragRetriever';
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

function sanitizeAssistantWebClaim(params: {
  assistantMessage?: string;
  requestedWeb: boolean;
  webSourceCount: number;
}): string | undefined {
  const raw = String(params.assistantMessage || '').trim();
  if (!raw) return undefined;
  const deniesWeb =
    /실시간\s*웹\s*검색\s*기능이\s*없|웹\s*검색\s*기능이\s*없|직접\s*찾아드리기\s*어려워|웹검색\s*불가/i.test(raw);
  if (!deniesWeb) return raw;
  if (!params.requestedWeb) {
    return raw.replace(/실시간\s*웹\s*검색\s*기능이\s*없[^.!\n]*[.!\n]?/gi, '').trim();
  }
  if (params.webSourceCount > 0) {
    return '웹 검색 결과를 바탕으로 확인 가능한 공개 정보를 정리해드릴게요.';
  }
  return '웹 검색을 시도했지만, 현재 질의에 대해 신뢰 가능한 공개 결과를 충분히 찾지 못했습니다. 원하시면 공식 사이트/보도자료 중심으로 다시 좁혀서 찾아볼게요.';
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
      '주소를 좌표로 바꾸는 단계에서 실패했습니다.',
      '',
      `${roleLabel}를 시스템이 아직 좌표로 못 찾았어요:`,
      failedAddr ? `「${failedAddr}」` : firstReason,
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

function parseKoreanCountToken(token?: string): number | null {
  if (!token) return null;
  const normalized = token.trim();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const map: Record<string, number> = {
    한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4,
    다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
  };
  return map[normalized] ?? null;
}

function extractExpectedRouteCounts(message: string): {
  pickupCount?: number;
  deliveryCount?: number;
  returnCount?: number;
  totalStopsCount?: number;
} {
  const result: { pickupCount?: number; deliveryCount?: number; returnCount?: number; totalStopsCount?: number } = {};
  const pickup = message.match(/상차(?:지)?(?:는|:)?\s*(\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*곳/i);
  const delivery = message.match(/배송(?:지)?(?:는|:)?\s*(\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*곳/i);
  const returns = message.match(/반납(?:지)?(?:는|:)?\s*(\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*곳/i);
  const totalStops = message.match(/총\s*경유지(?:가)?\s*(\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*곳/i);
  const p = parseKoreanCountToken(pickup?.[1]);
  const d = parseKoreanCountToken(delivery?.[1]);
  const r = parseKoreanCountToken(returns?.[1]);
  const t = parseKoreanCountToken(totalStops?.[1]);
  if (p !== null) result.pickupCount = p;
  if (d !== null) result.deliveryCount = d;
  if (r !== null) result.returnCount = r;
  if (t !== null) result.totalStopsCount = t;
  return result;
}

function applyExpectedCountHeuristics(extracted: any, expected: { pickupCount?: number; deliveryCount?: number; returnCount?: number; totalStopsCount?: number }) {
  const hasAnyExpected =
    Number.isFinite(expected.pickupCount) ||
    Number.isFinite(expected.deliveryCount) ||
    Number.isFinite(expected.returnCount) ||
    Number.isFinite(expected.totalStopsCount);
  if (!hasAnyExpected) {
    return { adjusted: extracted, mismatchReason: null as string | null };
  }

  const originAddress = extracted?.origin?.address || '';
  const destinations = Array.isArray(extracted?.destinations) ? extracted.destinations : [];
  if (!originAddress || destinations.length === 0) {
    return { adjusted: extracted, mismatchReason: null as string | null };
  }

  const expectedTotalStops = Number.isFinite(expected.totalStopsCount)
    ? Number(expected.totalStopsCount)
    : (expected.pickupCount ?? 1) - 1 + (expected.deliveryCount ?? 0) + (expected.returnCount ?? 0);
  const actualStops = destinations.length;

  if (expectedTotalStops > 0 && actualStops !== expectedTotalStops) {
    return {
      adjusted: extracted,
      mismatchReason: `요청하신 구성(상차 ${expected.pickupCount ?? '?'} / 배송 ${expected.deliveryCount ?? '?'} / 반납 ${expected.returnCount ?? '?'})과 현재 인식 결과(출발 1 + 경유 ${actualStops})가 다릅니다.`,
    };
  }

  return { adjusted: extracted, mismatchReason: null as string | null };
}

type IntentInterpretation = {
  expectedCounts: { pickupCount?: number; deliveryCount?: number; returnCount?: number; totalStopsCount?: number };
  addressCandidates: string[];
  pickupCandidates: string[];
  intentionalRevisitAddresses: string[];
  roleTagged: {
    pickup: string[];
    delivery: string[];
    returns: string[];
  };
  notes: string[];
};

type OperationalIntent =
  | 'default'
  | 'acknowledge'
  | 'recalculate'
  | 'cause-analysis'
  | 'config-change'
  | 'validation-request'
  | 'info-request';

type ResponseMode = 'conversational' | 'structured';

type GuardrailResult = {
  isValid: boolean;
  issues: string[];
  missingFields: string[];
};

type ReadinessResult = {
  score: number;
  isReady: boolean;
  reasons: string[];
  singleQuestion?: string;
};

type AutoFixReport = {
  removedAsOriginDuplicates: string[];
  removedAsDestinationDuplicates: string[];
  insertedLeadingPickup: string[];
};

function detectOperationalIntent(message: string): OperationalIntent {
  const s = String(message || '').trim();
  if (!s) return 'default';
  if (
    /^(이제\s*)?문제없|확인했어|오케이|좋아|좋네요|완료|고마워|감사/.test(s) ||
    /(동일한\s*실수|재발|안\s*하는거야|문제없지|괜찮은거야|보장)/.test(s)
  ) {
    return 'acknowledge';
  }
  if (/(왜|원인|이유|문제|잘못|오류|원인파악)/.test(s)) {
    return 'cause-analysis';
  }
  if (/(재검토|다시 계산|재계산|재시도|다시 해)/.test(s)) {
    return 'recalculate';
  }
  if (/(검증|확인|체크|맞는지|검토)/.test(s)) {
    return 'validation-request';
  }
  if (/(무슨\s*정보|어떤\s*정보|추가로\s*필요|필요한\s*정보|뭐가\s*더\s*필요)/.test(s)) {
    return 'info-request';
  }
  if (/(정기|비정기|레이|스타렉스|시간우선|무료도로|스케줄|차량)/.test(s) && !hasAddressLikeToken(s)) {
    return 'config-change';
  }
  return 'default';
}

function hasStrongQuoteSignal(message: string): boolean {
  const s = String(message || '').trim();
  return /(견적|요금|금액|비용|배송|경유|동선|경로|차량|정기|비정기|출발|도착|주소|ETA|계산)/i.test(s) || hasAddressLikeToken(s);
}

function isGeneralKnowledgeRequest(message: string): boolean {
  const s = String(message || '').trim();
  if (!s) return false;
  const hasGeneralCue =
    /(알려줘|설명해|뭐야|무엇|소개|비교|특징|장단점|서비스|회사|브랜드|풀필먼트|위펀)/i.test(s);
  if (!hasGeneralCue) return false;
  return !hasStrongQuoteSignal(s);
}

function isKnowledgeFollowUpQuestion(message: string): boolean {
  const s = String(message || '').trim();
  if (!s) return false;
  return /(어떤\s*내용|무엇을\s*확인|뭘\s*확인|어떻게\s*확인|왜\s*못\s*찾|다시\s*찾아|검색해봐)/.test(s);
}

function extractKnowledgeTopicHint(message: string): string | undefined {
  const m = String(message || '').match(/([가-힣A-Za-z0-9]+)\s*(기업|회사|서비스|브랜드|풀필먼트)/);
  if (!m) return undefined;
  return `${m[1]} ${m[2]}`.trim();
}

function isValidationResponseLoop(history: ChatHistoryItem[]): boolean {
  const recentAssistants = history
    .filter((h) => h.role === 'assistant')
    .map((h) => String(h.content || '').trim())
    .filter(Boolean)
    .slice(-3);
  if (recentAssistants.length < 2) return false;
  const repeatedValidation = recentAssistants.filter((text) =>
    /경유지 누락|계산 보류|핵심 정보만 한 번 더|필수 정보/.test(text)
  );
  return repeatedValidation.length >= 2;
}

function updateKnowledgeModeState(params: {
  prev: SlotState;
  message: string;
  hardGeneralOverride: boolean;
}): Pick<SlotState, 'responseMode' | 'responseModeLockTurns' | 'knowledgeTopic'> {
  const prevMode = params.prev.responseMode || 'quote';
  const prevLock = Number(params.prev.responseModeLockTurns || 0);
  const topicHint = extractKnowledgeTopicHint(params.message);
  if (params.hardGeneralOverride) {
    return {
      responseMode: 'knowledge',
      responseModeLockTurns: 3,
      knowledgeTopic: topicHint || params.prev.knowledgeTopic,
    };
  }
  if (prevMode === 'knowledge' && prevLock > 0 && !hasStrongQuoteSignal(params.message)) {
    return {
      responseMode: 'knowledge',
      responseModeLockTurns: Math.max(0, prevLock - 1),
      knowledgeTopic: params.prev.knowledgeTopic,
    };
  }
  return {
    responseMode: 'quote',
    responseModeLockTurns: 0,
    knowledgeTopic: params.prev.knowledgeTopic,
  };
}

function shouldUseStructuredMode(params: {
  message: string;
  operationalIntent: OperationalIntent;
  blockedByValidation: boolean;
}): ResponseMode {
  const s = String(params.message || '').trim();
  if (params.operationalIntent === 'cause-analysis' || params.operationalIntent === 'validation-request') {
    return 'structured';
  }
  if (/(근거|분석|검증|리포트|상세|블록|diff|원인|왜)/i.test(s)) {
    return 'structured';
  }
  if (params.blockedByValidation && /(왜|원인|문제|실패|검토)/.test(s)) {
    return 'structured';
  }
  return 'conversational';
}

function normalizeLogisticsText(message: string): string {
  return String(message || '')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[()]/g, ' ')
    // "/ 주5회(월~금)" 토큰만 제거하고 뒤쪽 주소열은 보존
    .replace(/\/\s*주\d+회(?:\s*\([^)]*\))?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeExpectedCounts(
  current: { pickupCount?: number; deliveryCount?: number; returnCount?: number; totalStopsCount?: number },
  previous?: { pickupCount?: number; deliveryCount?: number; returnCount?: number; totalStopsCount?: number }
): { pickupCount?: number; deliveryCount?: number; returnCount?: number; totalStopsCount?: number } {
  const merged = {
    pickupCount: current.pickupCount ?? previous?.pickupCount,
    deliveryCount: current.deliveryCount ?? previous?.deliveryCount,
    returnCount: current.returnCount ?? previous?.returnCount,
    totalStopsCount: current.totalStopsCount ?? previous?.totalStopsCount,
  };
  return merged;
}

function extractRoleTaggedAddressesFromMessage(message: string): {
  pickup: string[];
  delivery: string[];
  returns: string[];
} {
  const pickup: string[] = [];
  const delivery: string[] = [];
  const returns: string[] = [];
  const lines = String(message || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const addressRegex = /(?:(?:서울(?:특별시|시)?|경기|인천|부산|대구|광주|대전|울산|세종)\s+)?(?:[가-힣0-9]+(?:시|구|군)\s+)?[가-힣0-9\s-]*(?:(?:로|길|대로)\s*\d+(?:-\d+)?|[가-힣0-9]+동\s*\d+(?:-\d+)?)/g;

  const push = (bucket: string[], raw: string) => {
    const v = normalizeAddressForGeocode(raw);
    if (!v || !looksResolvableAddressText(v)) return;
    if (!bucket.includes(v)) bucket.push(v);
  };

  for (const line of lines) {
    const normalizedLine = normalizeLogisticsText(line);
    const addresses = (normalizedLine.match(addressRegex) || []).map((a) => a.trim());
    if (!addresses.length) continue;
    const hasPickupLabel = /(상차지|상차|출발지|출발|픽업)/.test(normalizedLine);
    const hasDeliveryLabel = /(배송지|배송|하차지|목적지|도착)/.test(normalizedLine);
    const hasReturnLabel = /(\[회수\]|회수|반납지|반납|복귀|수거)/.test(normalizedLine);
    const looksTabular = /\s{2,}/.test(line) || /\d{1,2}:\d{2}/.test(line);

    if (hasReturnLabel) {
      for (const addr of addresses) push(returns, addr);
      continue;
    }
    if (hasPickupLabel) {
      for (const addr of addresses) push(pickup, addr);
      continue;
    }
    if (hasDeliveryLabel) {
      for (const addr of addresses) push(delivery, addr);
      continue;
    }
    if (looksTabular && addresses.length >= 2) {
      push(pickup, addresses[0]);
      for (const addr of addresses.slice(1)) push(delivery, addr);
      continue;
    }
  }

  return { pickup, delivery, returns };
}

function extractAddressCandidatesFromMessage(message: string): string[] {
  const regex = /(?:(?:서울(?:특별시)?|경기|인천|부산|대구|광주|대전|울산|세종)\s+)?(?:[가-힣0-9]+(?:시|구|군)\s+)?[가-힣0-9\s-]*(?:로|길|대로)\s*\d+(?:-\d+)?/g;
  const matches = message.match(regex) || [];
  const uniq: string[] = [];
  for (const raw of matches) {
    const addr = raw.trim().replace(/\s+/g, ' ');
    if (!addr || uniq.includes(addr)) continue;
    uniq.push(addr);
  }
  return uniq;
}

function extractPickupCandidatesFromMessage(message: string): string[] {
  const candidates: string[] = [];
  const timedCandidates: Array<{ address: string; minutes: number; order: number }> = [];
  const addressRegex = /(?:(?:서울(?:특별시|시)?|경기|인천|부산|대구|광주|대전|울산|세종)\s+)?(?:[가-힣0-9]+(?:시|구|군)\s+)?[가-힣0-9\s-]*(?:(?:로|길|대로)\s*\d+(?:-\d+)?|[가-힣0-9]+동\s*\d+(?:-\d+)?)/g;
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean);

  const push = (value: string) => {
    const v = value.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (!candidates.includes(v)) candidates.push(v);
  };
  const parseTimeToMinutes = (line: string): number | null => {
    const m = line.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };
  const pushTimed = (value: string, minutes: number | null, order: number) => {
    if (minutes === null) return;
    const v = value.trim().replace(/\s+/g, ' ');
    if (!v) return;
    timedCandidates.push({ address: v, minutes, order });
  };

  for (const [idx, line] of lines.entries()) {
    let addresses = (line.match(addressRegex) || []).map((a) => a.trim().replace(/\s+/g, ' '));
    if (addresses.length === 0 && /\t| {2,}/.test(line)) {
      // raw 표 라인에서 주소 토큰이 누락되는 케이스 보정
      const fallback = line.match(/(?:서울(?:특별시|시)?\s*)?[가-힣0-9]+구\s+[가-힣0-9\s]+(?:로|길|대로)\s*\d+(?:-\d+)?/g) || [];
      addresses = fallback.map((a) => a.trim().replace(/\s+/g, ' '));
    }
    if (!addresses.length) continue;
    const isReturnLine = /\[회수\]|반납|복귀|수거/.test(line);
    const isDeliveryLabel = /배송지\s*[:：]|하차지\s*[:：]|목적지\s*[:：]/.test(line);
    const isPickupLabel = /상차지\s*[:：]|상차\s*[:：]|출발지\s*[:：]|출발\s*[:：]|픽업\s*[:：]/.test(line);
    const looksTabular = /\t| {2,}/.test(line);

    if (isReturnLine) continue;
    if (isPickupLabel) {
      const lineMinutes = parseTimeToMinutes(line);
      for (const addr of addresses) push(addr);
      for (const addr of addresses) pushTimed(addr, lineMinutes, idx);
      continue;
    }
    if (isDeliveryLabel) continue;
    // raw 표 라인은 보통 [상차주소 ... 배송주소] 구조이므로 첫 주소만 상차 후보로 사용
    if (looksTabular && addresses.length >= 2) {
      push(addresses[0]);
      const lineMinutes = parseTimeToMinutes(line);
      pushTimed(addresses[0], lineMinutes, idx);
    }
  }

  if (timedCandidates.length > 0) {
    const earliestByAddress = new Map<string, { minutes: number; order: number }>();
    for (const tc of timedCandidates) {
      const prev = earliestByAddress.get(tc.address);
      if (!prev || tc.minutes < prev.minutes || (tc.minutes === prev.minutes && tc.order < prev.order)) {
        earliestByAddress.set(tc.address, { minutes: tc.minutes, order: tc.order });
      }
    }
    const sortedByTime = [...earliestByAddress.entries()]
      .sort((a, b) => (a[1].minutes - b[1].minutes) || (a[1].order - b[1].order))
      .map(([addr]) => addr);
    const rest = candidates.filter((c) => !sortedByTime.includes(c));
    return [...sortedByTime, ...rest];
  }

  return candidates;
}

function buildIntentInterpretation(message: string, expectedCounts: { pickupCount?: number; deliveryCount?: number; returnCount?: number }): IntentInterpretation {
  const intentionalRevisitAddresses: string[] = [];
  const lines = message.split('\n');
  const addressRegex = /(?:(?:서울(?:특별시)?|경기|인천|부산|대구|광주|대전|울산|세종)\s+)?(?:[가-힣0-9]+(?:시|구|군)\s+)?[가-힣0-9\s-]*(?:로|길|대로)\s*\d+(?:-\d+)?/g;
  for (const line of lines) {
    if (!/(회수|반납|복귀|맞수거)/.test(line)) continue;
    const matched = line.match(addressRegex) || [];
    for (const m of matched.map((v) => v.trim().replace(/\s+/g, ' '))) {
      if (m && !intentionalRevisitAddresses.includes(m)) intentionalRevisitAddresses.push(m);
    }
  }
  const notes: string[] = [];
  if (Number.isFinite(expectedCounts.pickupCount)) notes.push(`상차 ${expectedCounts.pickupCount}곳`);
  if (Number.isFinite(expectedCounts.deliveryCount)) notes.push(`배송 ${expectedCounts.deliveryCount}곳`);
  if (Number.isFinite(expectedCounts.returnCount)) notes.push(`반납 ${expectedCounts.returnCount}곳`);
  const roleTagged = extractRoleTaggedAddressesFromMessage(message);
  return {
    expectedCounts,
    addressCandidates: extractAddressCandidatesFromMessage(message),
    pickupCandidates: extractPickupCandidatesFromMessage(message),
    intentionalRevisitAddresses,
    roleTagged,
    notes,
  };
}

function runGuardrailValidation(extracted: any, interpretation: IntentInterpretation): GuardrailResult {
  const issues: string[] = [];
  const missingFields: string[] = [];
  const originAddress = extracted?.origin?.address || '';
  const destinations = Array.isArray(extracted?.destinations) ? extracted.destinations : [];

  if (!originAddress || !looksResolvableAddressText(originAddress)) {
    issues.push('출발지 유효성 검증 실패');
    missingFields.push('origin');
  }
  if (destinations.length === 0) {
    issues.push('경유지 누락');
    missingFields.push('destinations');
  }
  const invalidDestinations = destinations.filter((d: any) => !looksResolvableAddressText(String(d?.address || ''))).length;
  if (invalidDestinations > 0) {
    issues.push(`유효하지 않은 경유지 ${invalidDestinations}건`);
  }
  const destinationKeys = destinations.map((d: any) => canonicalAddressKey(String(d?.address || ''))).filter(Boolean);
  const duplicateKeys = destinationKeys.filter((key: string, idx: number) => destinationKeys.indexOf(key) !== idx);
  if (duplicateKeys.length > 0) {
    issues.push(`중복 경유지 ${new Set(duplicateKeys).size}건`);
  }
  const originKey = canonicalAddressKey(originAddress);
  if (originKey && destinationKeys.includes(originKey)) {
    issues.push('출발지와 동일한 경유지가 포함됨');
  }

  const expected = interpretation.expectedCounts;
  const hasExpected = Number.isFinite(expected.pickupCount) || Number.isFinite(expected.deliveryCount) || Number.isFinite(expected.returnCount);
  if (hasExpected) {
    const expectedStops = (expected.pickupCount ?? 1) - 1 + (expected.deliveryCount ?? 0) + (expected.returnCount ?? 0);
    if (expectedStops > 0 && destinations.length !== expectedStops) {
      issues.push(`요청 개수와 인식 개수 불일치(기대 ${expectedStops}, 인식 ${destinations.length})`);
    }
  }
  if (Number.isFinite(expected.deliveryCount)) {
    const pickupCount = expected.pickupCount ?? 1;
    const returnCount = expected.returnCount ?? 0;
    const inferredDeliveryCount = Math.max(0, destinations.length - (pickupCount >= 2 ? 1 : 0) - returnCount);
    if (inferredDeliveryCount !== expected.deliveryCount) {
      issues.push(`배송지 개수 불일치(기대 ${expected.deliveryCount}, 인식 ${inferredDeliveryCount})`);
    }
  }

  return { isValid: issues.length === 0, issues, missingFields };
}

function applyRoleTaggedHybridResolution(extracted: any, interpretation: IntentInterpretation): any {
  const pickup = interpretation.roleTagged.pickup || [];
  const delivery = interpretation.roleTagged.delivery || [];
  const returns = interpretation.roleTagged.returns || [];
  if (pickup.length === 0 && delivery.length === 0 && returns.length === 0) {
    return extracted;
  }

  const origin = pickup[0] || extracted?.origin?.address || '';
  const restPickups = pickup.slice(1);
  const orderedDestinations: Array<{ address: string }> = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const address = normalizeAddressForGeocode(raw);
    const key = canonicalAddressKey(address);
    if (!address || !key || seen.has(key)) return;
    seen.add(key);
    orderedDestinations.push({ address });
  };

  for (const addr of restPickups) push(addr);
  for (const addr of delivery) push(addr);
  for (const addr of returns) push(addr);

  // 역할 기반 재구성이 불완전하면 기존 추출값 보존
  if (!looksResolvableAddressText(origin) || orderedDestinations.length === 0) {
    return extracted;
  }
  return normalizeExtractedQuoteInfo({
    ...extracted,
    origin: { address: origin },
    destinations: orderedDestinations,
  });
}

function buildRouteDiffItems(before: any, after: any): string[] {
  const diffs: string[] = [];
  const beforeOrigin = String(before?.origin?.address || '').trim();
  const afterOrigin = String(after?.origin?.address || '').trim();
  if (beforeOrigin !== afterOrigin) {
    diffs.push(`출발지: ${beforeOrigin || '-'} → ${afterOrigin || '-'}`);
  }
  const beforeDest = Array.isArray(before?.destinations) ? before.destinations.map((d: any) => String(d?.address || '').trim()).filter(Boolean) : [];
  const afterDest = Array.isArray(after?.destinations) ? after.destinations.map((d: any) => String(d?.address || '').trim()).filter(Boolean) : [];
  if (beforeDest.length !== afterDest.length) {
    diffs.push(`경유지 수: ${beforeDest.length} → ${afterDest.length}`);
  }
  const beforeLast = beforeDest[beforeDest.length - 1] || '-';
  const afterLast = afterDest[afterDest.length - 1] || '-';
  if (beforeLast !== afterLast) {
    diffs.push(`반납/최종 도착: ${beforeLast} → ${afterLast}`);
  }
  if (JSON.stringify(beforeDest) !== JSON.stringify(afterDest)) {
    diffs.push(`경유 순서: ${beforeDest.join(' → ') || '-'} → ${afterDest.join(' → ') || '-'}`);
  }
  return diffs.slice(0, 4);
}

function formatRoleSummary(extracted: any, interpretation: IntentInterpretation): string {
  const pickupCount = interpretation.expectedCounts.pickupCount ?? 1;
  const returnCount = interpretation.expectedCounts.returnCount ?? 0;
  const origin = String(extracted?.origin?.address || '-');
  const allDest = Array.isArray(extracted?.destinations)
    ? extracted.destinations.map((d: any) => String(d?.address || '').trim()).filter(Boolean)
    : [];
  const leadPickup = pickupCount >= 2 && allDest.length > 0 ? allDest[0] : null;
  const deliveryStart = leadPickup ? 1 : 0;
  const deliveryEnd = Math.max(deliveryStart, allDest.length - (returnCount > 0 ? 1 : 0));
  const deliveries = allDest.slice(deliveryStart, deliveryEnd);
  const returns = returnCount > 0 && allDest.length > 0 ? [allDest[allDest.length - 1]] : [];
  return [
    `- 상차: ${pickupCount}곳 (출발 ${origin}${leadPickup ? `, 선행상차 ${leadPickup}` : ''})`,
    `- 배송: ${interpretation.expectedCounts.deliveryCount ?? deliveries.length}곳 (${deliveries.join(' → ') || '-'})`,
    `- 반납: ${interpretation.expectedCounts.returnCount ?? returns.length}곳 (${returns.join(' → ') || '-'})`,
  ].join('\n');
}

function formatValidationSummary(guardrail: GuardrailResult, readiness: ReadinessResult, countMismatchReason: string | null): string {
  const lines: string[] = [];
  lines.push(`- 개수 검증: ${countMismatchReason ? `실패 (${countMismatchReason})` : '통과'}`);
  lines.push(`- 주소성 검증: ${guardrail.issues.some((i) => i.includes('유효')) || guardrail.missingFields.length > 0 ? '실패' : '통과'}`);
  lines.push(`- 중복/역할 검증: ${guardrail.issues.some((i) => i.includes('중복') || i.includes('동일') || i.includes('불일치')) ? '실패' : '통과'}`);
  lines.push(`- 준비도: ${readiness.score} (${readiness.isReady ? '통과' : '실패'})`);
  if (guardrail.issues.length > 0) {
    lines.push(`- 상세 이슈: ${guardrail.issues.slice(0, 3).join(', ')}`);
  }
  return lines.join('\n');
}

function autoFixExtractedRoute(extracted: any, interpretation: IntentInterpretation): { fixed: any; report: AutoFixReport } {
  const fixed = sanitizeExtractedRouteForAutoFix(extracted);
  const expectedPickupCount = interpretation.expectedCounts.pickupCount ?? 1;
  const candidates = interpretation.addressCandidates.filter((addr) => looksResolvableAddressText(addr));
  const pickupCandidates = interpretation.pickupCandidates.filter((addr) => looksResolvableAddressText(addr));
  const report: AutoFixReport = {
    removedAsOriginDuplicates: [],
    removedAsDestinationDuplicates: [],
    insertedLeadingPickup: [],
  };

  let origin = fixed?.origin?.address ? fixed.origin : undefined;
  if (pickupCandidates.length > 0 && expectedPickupCount >= 2) {
    // 상차가 2곳 이상이면 상차 후보 중 "가장 이른 시간" 주소를 출발지로 강제
    origin = { address: pickupCandidates[0] };
  } else if (!origin && pickupCandidates.length > 0) {
    origin = { address: pickupCandidates[0] };
  } else if (!origin && candidates.length > 0) {
    origin = { address: candidates[0] };
  }

  let destinations = Array.isArray(fixed?.destinations) ? fixed.destinations : [];
  let leadPickupAddress: string | null = null;
  if (expectedPickupCount >= 2) {
    const originKey = canonicalAddressKey(String(origin?.address || ''));
    const secondPickup = pickupCandidates.find((addr) => canonicalAddressKey(addr) !== originKey);
    if (secondPickup && !destinations.some((d: any) => canonicalAddressKey(d?.address) === canonicalAddressKey(secondPickup))) {
      leadPickupAddress = secondPickup;
      report.insertedLeadingPickup.push(secondPickup);
    } else if (secondPickup) {
      leadPickupAddress = secondPickup;
    }
  }

  const originAddress = String(origin?.address || '').trim();
  const originKey = canonicalAddressKey(originAddress);
  const deduped: Array<{ address: string }> = [];
  const seen = new Set<string>();
  const leadPickupKey = leadPickupAddress ? canonicalAddressKey(leadPickupAddress) : null;
  for (const d of destinations) {
    const address = String(d?.address || '').trim();
    if (!address) continue;
    const key = canonicalAddressKey(address);
    if (originAddress && key === originKey) {
      report.removedAsOriginDuplicates.push(address);
      continue;
    }
    // 선행상차는 배송 목록에서 제거 후 맨 앞에 1회만 삽입
    if (leadPickupKey && key === leadPickupKey) {
      continue;
    }
    if (seen.has(key)) {
      const intentional = interpretation.intentionalRevisitAddresses.some((a) => key === canonicalAddressKey(a));
      if (!intentional) {
        report.removedAsDestinationDuplicates.push(address);
        continue;
      }
      deduped.push({ address });
      continue;
    }
    seen.add(key);
    deduped.push({ address });
  }

  if (leadPickupAddress) {
    deduped.unshift({ address: leadPickupAddress });
  }

  return {
    fixed: {
      ...fixed,
      origin,
      destinations: deduped,
    },
    report,
  };
}

function buildRoleResolutionTable(extracted: any, interpretation: IntentInterpretation) {
  const rows: Array<{ role: string; address: string; reason: string }> = [];
  const origin = String(extracted?.origin?.address || '').trim();
  const destinations: string[] = (extracted?.destinations || []).map((d: any) => String(d?.address || '').trim()).filter(Boolean);
  const pickupCount = interpretation.expectedCounts.pickupCount ?? 1;
  const returnCount = interpretation.expectedCounts.returnCount ?? 0;
  if (origin) {
    rows.push({ role: '출발', address: origin, reason: '첫 상차지 또는 출발지로 인식' });
  }
  let startIdx = 0;
  if (pickupCount >= 2 && destinations.length > 0) {
    rows.push({ role: '선행상차', address: destinations[0], reason: '두 번째 상차지를 선행 경유지로 배치' });
    startIdx = 1;
  }
  const endIdxExclusive = returnCount > 0 && destinations.length > startIdx ? destinations.length - 1 : destinations.length;
  for (let i = startIdx; i < endIdxExclusive; i++) {
    rows.push({ role: '배송', address: destinations[i], reason: '배송/경유지로 분류' });
  }
  if (returnCount > 0 && destinations.length > startIdx) {
    rows.push({ role: '반납', address: destinations[destinations.length - 1], reason: '회수/반납 키워드 기반 종착지' });
  }
  return rows;
}

function evaluateRouteReadiness(params: {
  extracted: any;
  interpretation: IntentInterpretation;
  guardrail: GuardrailResult;
}): ReadinessResult {
  const { extracted, interpretation, guardrail } = params;
  let score = 1.0;
  const reasons: string[] = [];

  const origin = String(extracted?.origin?.address || '').trim();
  const destinations = Array.isArray(extracted?.destinations) ? extracted.destinations : [];
  const validDestinations = destinations.filter((d: any) => looksResolvableAddressText(String(d?.address || '')));
  const timedDestinations = destinations.filter((d: any) => Boolean(d?.deliveryTime)).length;

  if (!origin || !looksResolvableAddressText(origin)) {
    score -= 0.35;
    reasons.push('출발지 유효성 낮음');
  }
  if (validDestinations.length === 0) {
    score -= 0.35;
    reasons.push('유효 경유지 없음');
  }

  const expected = interpretation.expectedCounts;
  const expectedStops = Number.isFinite(expected.totalStopsCount)
    ? Number(expected.totalStopsCount)
    : (expected.pickupCount ?? 1) - 1 + (expected.deliveryCount ?? 0) + (expected.returnCount ?? 0);
  if (expectedStops > 0 && validDestinations.length !== expectedStops) {
    score -= 0.25;
    reasons.push(`요청 개수(${expectedStops})와 인식 개수(${validDestinations.length}) 불일치`);
  }

  if (guardrail.issues.length > 0) {
    score -= Math.min(0.2, guardrail.issues.length * 0.08);
    reasons.push('가드레일 이슈 존재');
  }

  // 시간 정보가 일부라도 있으면 신뢰도 가산
  if (timedDestinations > 0) {
    score += 0.05;
  }

  const bounded = Math.max(0, Math.min(1, score));
  const isReady = bounded >= 0.75;
  let singleQuestion: string | undefined;
  if (!isReady) {
    if (!origin || !looksResolvableAddressText(origin)) {
      singleQuestion = '출발지 1곳만 도로명+번지로 확인해 주세요.';
    } else {
      singleQuestion = '누락/중복이 의심되는 경유지 1곳만 확인해 주세요.';
    }
  }

  return {
    score: Number(bounded.toFixed(2)),
    isReady,
    reasons,
    singleQuestion,
  };
}

function looksResolvableAddressText(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  if (/주소\s*필요|미정|unknown|tbd|placeholder|\(.*필요.*\)/i.test(s)) return false;
  const hasRoad = /(?:로|길|대로)\s*\d+/.test(s);
  const hasLot = /[가-힣0-9]+동\s*\d+(?:-\d+)?/.test(s);
  const hasRegion = /(?:서울|경기|인천|부산|대구|광주|대전|울산|세종|[가-힣]{2,4}(?:시|구|군))/.test(s);
  return (hasRoad || hasLot) && hasRegion;
}

function canonicalAddressKey(raw?: string): string {
  let s = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(로|길|대로)(\d)/g, '$1 $2')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\s*층\b/g, ' ')
    .replace(/\b\d+\s*호\b/g, ' ')
    .replace(/\b(?:msmr|아란의원|하루반상|나이스\s*샐러드|주식회사\s*그래픽)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^서울\s/, '서울특별시 ');
  s = s.replace(/\b(\d+)\s*길\s*(\d+)\b/g, '$1길 $2');
  s = s.replace(/\b(\d+)\s*가길\s*(\d+)\b/g, '$1가길 $2');
  // 상호명이 앞에 붙은 경우 "구/군/시 + 도로명/지번"부터 주소 코어를 다시 추출
  const districtRoad = s.match(/([가-힣0-9]{2,6}(?:구|군|시)\s+.+?(?:로|길|대로)\s*\d+(?:-\d+)?(?:\s*(?:길|로|대로)\s*\d+(?:-\d+)?)?)/);
  if (districtRoad?.[1]) s = districtRoad[1].trim();
  const districtLot = s.match(/([가-힣0-9]{2,6}(?:구|군|시)\s+[가-힣0-9]+동\s*\d+(?:-\d+)?)/);
  if (!districtRoad?.[1] && districtLot?.[1]) s = districtLot[1].trim();

  const road = s.match(/(.+?(?:로|길|대로)\s*\d+(?:-\d+)?(?:\s*(?:길|로|대로)\s*\d+(?:-\d+)?)?)/);
  if (road?.[1]) return road[1].trim();
  const lot = s.match(/(.+?동\s*\d+(?:-\d+)?)/);
  return (lot?.[1] || s).trim();
}

function sanitizeExtractedRouteForAutoFix(extracted: any) {
  const origin = extracted?.origin;
  const destinations = Array.isArray(extracted?.destinations) ? extracted.destinations : [];
  const cleanedDestinations = destinations
    .filter((d: any) => typeof d?.address === 'string' && looksResolvableAddressText(d.address))
    .filter((d: any, idx: number, arr: any[]) => {
      const key = canonicalAddressKey(d.address);
      return arr.findIndex((x: any) => canonicalAddressKey(x?.address) === key) === idx;
    });
  return {
    ...extracted,
    origin: (origin?.address && looksResolvableAddressText(origin.address)) ? origin : extracted?.origin,
    destinations: cleanedDestinations,
  };
}

function normalizeAddressForGeocode(address: string): string {
  const compact = String(address || '')
    .trim()
    // 역할 라벨이 주소 본문에 섞여 들어오는 케이스 제거
    .replace(/\b(?:출발지?|출발|선행상차|상차지?|배송지?|배송|반납지?|반납|도착)\s*[:：]?\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(로|길|대로)(\d)/g, '$1 $2')
    .replace(/(로)\s*(\d+)\s*가길\s*(\d+)/g, '$1$2가길 $3')
    .replace(/(\d+)\s*충/g, '$1층')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(?:지하\s*)?\d+\s*(?:층|충)/g, ' ')
    .replace(/\d+\s*호/g, ' ')
    .replace(/\d+\s*동/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // "하루반상 서울특별시 성동구 성수일로 10" 처럼 상호명이 앞에 붙은 경우 주소 코어만 사용
  const regionStart = compact.match(
    /(서울특별시|서울|경기도|경기|인천|부산|대구|광주|대전|울산|세종|[가-힣0-9]{2,8}(?:시|구|군)\s+)/
  );
  const sliced = regionStart?.index !== undefined ? compact.slice(regionStart.index).trim() : compact;

  return sliced
    .replace(/\s+/g, ' ')
    .replace(/^서울\s/, '서울특별시 ')
    .trim();
}

function hasAddressLikeToken(message: string): boolean {
  const s = String(message || '');
  if (!s.trim()) return false;
  const hasRoad = /(?:로|길|대로)\s*\d+/.test(s);
  const hasLot = /[가-힣0-9]+동\s*\d+(?:-\d+)?/.test(s);
  const hasDistrict = /[가-힣0-9]{2,8}(?:시|구|군)/.test(s);
  return (hasRoad || hasLot) && hasDistrict;
}

function isVehicleScheduleOnlyUpdate(message: string): boolean {
  const s = String(message || '').trim();
  if (!s) return false;
  const hasVehicleOrSchedule = /(레이|스타렉스|정기|비정기)/.test(s);
  return hasVehicleOrSchedule && !hasAddressLikeToken(s);
}

async function callRouteOptimization(
  request: NextRequest,
  payload: Record<string, unknown>,
  timeoutMs = 25000
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(new URL('/api/route-optimization', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildConversationalAssistantMessage(params: {
  assistantResponse?: string;
  missingFields: string[];
  extracted: {
    vehicleType?: '레이' | '스타렉스';
    scheduleType?: 'regular' | 'ad-hoc';
    origin?: { address?: string };
    destinations?: Array<{ address?: string }>;
    departureTime?: string;
  };
  isMultiScenario: boolean;
  quote?: any;
}): string {
  if (params.quote) {
    const q = params.quote;
    const destCount = params.extracted.destinations?.length || 0;

    let summary = `요청하신 경로에 대한 견적 계산이 완료되었습니다.\n\n`;
    summary += `📍 **경로 요약**\n`;
    summary += `- 출발: ${params.extracted.origin?.address || '-'}\n`;
    if (destCount > 0) {
      const destList = params.extracted.destinations!.map(d => d.address).join(' → ');
      summary += `- 경유/도착: ${destList}\n`;
    }
    summary += `- 차량/일정: ${params.extracted.vehicleType || '-'} · ${params.extracted.scheduleType === 'regular' ? '정기' : '비정기'}\n`;
    summary += `- 주행 거리: ${q.basis.distanceKm}km\n`;
    summary += `- 총 소요 시간: ${q.basis.totalBillMinutes}분 (운행 ${q.basis.driveMinutes}분 + 체류 ${q.basis.dwellTotalMinutes}분)\n\n`;

    summary += `💰 **예상 기준 운임**\n`;
    summary += `- 시간당 요금제: **${q.hourly?.formatted}**\n`;
    summary += `- 단건 요금제: **${q.perJob?.formatted}**\n\n`;
    summary += `우측 패널의 '전체 운임 시나리오 비교'를 통해 차량/스케줄 변경 시의 운임 차이도 확인해보세요. \n*(출발지로 인식된 곳 외의 추가 상차지가 있다면 경유지에 포함되어 계산되었습니다.)*`;
    return summary;
  }

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

function buildDeterministicRouteDraftMessage(params: {
  extracted: {
    origin?: { address?: string };
    destinations?: Array<{ address?: string }>;
    vehicleType?: '레이' | '스타렉스';
    scheduleType?: 'regular' | 'ad-hoc';
  };
  interpretation: IntentInterpretation;
  missingFields: string[];
  pickupCandidates?: string[];
}): string {
  const pickupCount = params.interpretation.expectedCounts.pickupCount ?? 1;
  const deliveryCount = params.interpretation.expectedCounts.deliveryCount ?? 0;
  const returnCount = params.interpretation.expectedCounts.returnCount ?? 0;
  const origin = params.extracted.origin?.address || '-';
  const allDest = (params.extracted.destinations || []).map((d) => d.address).filter(Boolean) as string[];
  const originKey = canonicalAddressKey(origin);
  const secondPickup = (params.pickupCandidates || []).find((a) => canonicalAddressKey(a) !== originKey);
  const pickupLead = pickupCount >= 2 && secondPickup ? [secondPickup] : [];
  const deliveryStart = pickupLead.length;
  const deliveryEnd = Math.max(deliveryStart, allDest.length - (returnCount > 0 ? 1 : 0));
  const deliveries = allDest.slice(deliveryStart, deliveryEnd);
  const returns = returnCount > 0 && allDest.length > 0 ? [allDest[allDest.length - 1]] : [];

  let msg = `입력해주신 메모를 기준으로 경로를 먼저 구조화했습니다.\n\n`;
  msg += `- 상차: ${pickupCount}곳 (출발 ${origin}${pickupLead[0] ? `, 선행상차 ${pickupLead[0]}` : ''})\n`;
  msg += `- 배송: ${deliveryCount || deliveries.length}곳 (${deliveries.join(' → ') || '-'})\n`;
  msg += `- 반납: ${returnCount || returns.length}곳 (${returns.join(' → ') || '-'})\n`;

  const ask: string[] = [];
  // 차량/스케줄이 비어 있어도 기본값(레이/비정기)으로 1차 계산은 진행한다.
  const needsCoreRouteData =
    params.missingFields.includes('origin') || params.missingFields.includes('destinations');
  if (needsCoreRouteData) {
    msg += `\n주소 구성만 확정되면 차량/스케줄 입력 없이도 1차 계산을 먼저 진행할 수 있습니다.`;
  }
  return msg;
}

function buildInfoRequestConversationMessage(params: {
  interpretation: IntentInterpretation;
  extracted: any;
  missingFields: string[];
}): string {
  const required: string[] = [];
  const optional: string[] = [];
  const expected = params.interpretation.expectedCounts;
  const tagged = params.interpretation.roleTagged;

  if ((expected.pickupCount ?? 0) >= 2 && tagged.pickup.length < (expected.pickupCount || 0)) {
    required.push(`상차지 ${expected.pickupCount}곳의 정확한 주소`);
  }
  if ((expected.deliveryCount ?? 0) > 0 && tagged.delivery.length < (expected.deliveryCount || 0)) {
    required.push(`배송지 ${expected.deliveryCount}곳의 정확한 주소`);
  }
  if ((expected.returnCount ?? 0) > 0 && tagged.returns.length < (expected.returnCount || 0)) {
    required.push(`반납지 ${expected.returnCount}곳의 정확한 주소`);
  }

  if (params.missingFields.includes('origin')) required.push('출발지 주소');
  if (params.missingFields.includes('destinations')) required.push('경유/도착지 주소');
  if (!params.extracted?.vehicleType) optional.push('차량 타입(기본값: 레이)');
  if (!params.extracted?.scheduleType) optional.push('스케줄(기본값: 비정기)');
  if (!params.extracted?.departureTime) optional.push('출발시간(없으면 현재시각 기준)');

  const uniqRequired = Array.from(new Set(required)).slice(0, 4);
  const uniqOptional = Array.from(new Set(optional)).slice(0, 3);

  const lines: string[] = [];
  lines.push('좋아요. 현재 정보 기준으로 보면 아래만 추가되면 바로 정확한 계산이 가능합니다.');
  if (uniqRequired.length > 0) {
    lines.push('');
    lines.push('필수 정보');
    for (const item of uniqRequired) lines.push(`- ${item}`);
  }
  if (uniqOptional.length > 0) {
    lines.push('');
    lines.push('선택 정보');
    for (const item of uniqOptional) lines.push(`- ${item}`);
  }
  if (uniqRequired.length === 0) {
    lines.push('');
    lines.push('필수 누락은 없고, 원하시면 지금 상태로 바로 1차 견적 계산을 진행할 수 있어요.');
  }
  return lines.join('\n');
}

function buildValidationBlockedConversationMessage(params: {
  interpretation: IntentInterpretation;
  extracted: any;
  missingFields: string[];
  blockedReason: string;
}): string {
  const origin = String(params.extracted?.origin?.address || '').trim();
  const destinations = Array.isArray(params.extracted?.destinations)
    ? params.extracted.destinations.map((d: any) => String(d?.address || '').trim()).filter(Boolean)
    : [];
  const lines: string[] = [];
  lines.push('좋아요. 지금 바로 계산하려면 핵심 정보만 한 번 더 맞추면 됩니다.');
  if (origin || destinations.length > 0) {
    lines.push('');
    lines.push(`현재 인식: 출발 ${origin || '-'} / 경유·도착 ${destinations.length}곳`);
  }
  lines.push('');
  lines.push(`검증 결과: ${params.blockedReason}`);
  lines.push('');
  lines.push(
    buildInfoRequestConversationMessage({
      interpretation: params.interpretation,
      extracted: params.extracted,
      missingFields: params.missingFields,
    })
  );
  return lines.join('\n');
}

function buildGeneralKnowledgeReply(params: {
  assistantResponse?: string;
  ragHint?: string;
  requestedWeb: boolean;
  webSourceCount: number;
  knowledgeTopic?: string;
}): string {
  // 웹검색을 명시 요청했는데 근거가 0개면, 추측/학습기반 단정 답변을 금지한다.
  if (params.requestedWeb && params.webSourceCount === 0) {
    return `웹 검색을 시도했지만 현재 질의에 대해 신뢰 가능한 공개 결과를 충분히 찾지 못했습니다.${params.knowledgeTopic ? `\n\n확인 정확도를 높이려면 '${params.knowledgeTopic}'의 공식 사이트/법인명/서비스명(예: 조식24, 런치24) 중 한 가지를 함께 알려주세요.` : '\n\n검색어를 더 구체화(회사명+서비스명, 공식 사이트)해주시면 다시 찾아볼게요.'}`;
  }
  const sanitized = sanitizeAssistantWebClaim({
    assistantMessage: params.assistantResponse,
    requestedWeb: params.requestedWeb,
    webSourceCount: params.webSourceCount,
  });
  if (sanitized) return sanitized;
  if (params.ragHint) {
    return `요청하신 내용을 확인했어요. 현재 참고 가능한 정보 기준으로 정리하면 아래와 같습니다.\n${params.ragHint}`;
  }
  if (params.requestedWeb) {
    return '웹 검색을 시도했지만 현재 질의로는 신뢰 가능한 공개 결과가 부족합니다. 검색어를 더 구체화해주시면 다시 찾아볼게요.';
  }
  return '요청하신 내용을 확인했어요. 지금은 참고 가능한 내부/외부 근거가 제한적이라 핵심만 간단히 안내드렸습니다.';
}

function buildWebSearchGroundedReply(params: {
  web: { snippets: string[]; sources: Array<{ title: string; url: string }> };
  requestedWeb: boolean;
  ragHint?: string;
}): string {
  if (params.web.sources.length === 0) {
    return buildGeneralKnowledgeReply({
      requestedWeb: params.requestedWeb,
      webSourceCount: 0,
      ragHint: params.ragHint,
      assistantResponse: '',
    });
  }
  const bullets = params.web.sources
    .slice(0, 3)
    .map((s, idx) => `- ${idx + 1}. ${s.title} (${s.url})`);
  return [
    '웹 검색 기반으로 확인한 공개 정보만 요약해드릴게요.',
    '',
    '확인된 출처',
    ...bullets,
    '',
    '원하시면 위 출처 기준으로 사실관계(회사 소개/서비스 범위/운영 여부)만 다시 간단히 정리해드릴게요.',
  ].join('\n');
}

function pickExtractionModel(params: {
  message: string;
  interpretation: IntentInterpretation;
  operationalIntent: OperationalIntent;
  validationLoopDetected: boolean;
}): string | undefined {
  const complexBySize = params.message.length > 260 || /\n/.test(params.message) || /\t/.test(params.message);
  const complexByCounts =
    Number(params.interpretation.expectedCounts.pickupCount || 0) >= 2 ||
    Number(params.interpretation.expectedCounts.deliveryCount || 0) >= 3 ||
    Number(params.interpretation.expectedCounts.returnCount || 0) >= 1;
  const taggedStopCount =
    params.interpretation.roleTagged.pickup.length +
    params.interpretation.roleTagged.delivery.length +
    params.interpretation.roleTagged.returns.length;
  const complexByStops = taggedStopCount >= 5;
  const complexByIntent = params.operationalIntent === 'recalculate' || params.operationalIntent === 'cause-analysis';
  const shouldUpgrade = complexBySize || complexByCounts || complexByStops || complexByIntent || params.validationLoopDetected;
  if (!shouldUpgrade) return undefined;
  return process.env.OPENAI_QUOTE_MODEL_COMPLEX || 'gpt-4.1';
}

function buildCauseAnalysisMessage(params: {
  interpretation: IntentInterpretation;
  guardrail: GuardrailResult;
  routeDiffItems: string[];
  history: ChatHistoryItem[];
}): string {
  const historyText = params.history
    .slice(-8)
    .map((h) => String(h?.content || ''))
    .join('\n');
  const previousWrongSignals: string[] = [];
  if (/요청하신 구성.*다릅니다|개수 불일치/.test(historyText)) previousWrongSignals.push('요청 개수와 인식 개수 불일치');
  if (/출발지.*좌표로 못 찾|지오코딩/.test(historyText)) previousWrongSignals.push('주소 정규화/지오코딩 실패');
  if (/중복|선행상차|경유/.test(historyText)) previousWrongSignals.push('역할 분류 또는 순서 중복');
  if (previousWrongSignals.length === 0 && params.guardrail.issues.length > 0) {
    previousWrongSignals.push(...params.guardrail.issues.slice(0, 2));
  }

  const lines: string[] = [];
  lines.push('아래처럼 원인을 재분석했습니다.');
  lines.push('');
  lines.push('1) 이전 해석 오류 지점');
  lines.push(`- ${previousWrongSignals.slice(0, 3).join(', ') || '대화 이력 기준으로 명확한 실패 신호가 부족합니다.'}`);
  lines.push('');
  lines.push('2) 이번에 적용한 수정 규칙');
  lines.push('- 역할 분리 파서(상차/배송/반납) 우선 적용');
  lines.push('- 개수/중복/주소 유효성 검증 통과 전 계산 차단');
  lines.push('- 상차 2곳 이상일 때 선행상차를 배송 앞단으로 강제');
  lines.push('');
  lines.push('3) 결과 변화(전/후)');
  const diffItems = params.routeDiffItems.slice(0, 4);
  if (diffItems.length === 0) {
    lines.push('- 변경 없음(동일 입력/동일 규칙)');
  } else {
    for (const item of diffItems) {
      lines.push(`- ${item}`);
    }
  }
  return lines.join('\n');
}

function classifyValidationFailureTags(guardrail: GuardrailResult, countMismatchReason: string | null): string[] {
  const tags = new Set<string>(['validation']);
  const issues = guardrail.issues.join(' ');
  if (countMismatchReason || /개수 불일치/.test(issues)) tags.add('count-mismatch');
  if (/중복|동일/.test(issues)) tags.add('duplicate');
  if (/유효|주소/.test(issues) || guardrail.missingFields.includes('origin') || guardrail.missingFields.includes('destinations')) {
    tags.add('address-quality');
  }
  if (/배송지 개수 불일치|역할/.test(issues)) tags.add('role-misclassification');
  return [...tags];
}

function buildFourBlockResultMessage(params: {
  extracted: any;
  interpretation: IntentInterpretation;
  guardrail: GuardrailResult;
  readiness: ReadinessResult;
  routeDiffItems: string[];
  quote?: {
    hourly?: { formatted?: string };
    perJob?: { formatted?: string };
    basis?: {
      distanceKm?: number;
      totalBillMinutes?: number;
      driveMinutes?: number;
      dwellTotalMinutes?: number;
    };
  } | null;
  blockedReason?: string | null;
  assumptions?: string[];
  countMismatchReason?: string | null;
}): string {
  const lines: string[] = [];
  lines.push('1) 해석 결과 요약');
  lines.push(formatRoleSummary(params.extracted, params.interpretation));
  lines.push('');
  lines.push('2) 검증 결과');
  lines.push(formatValidationSummary(params.guardrail, params.readiness, params.countMismatchReason || null));
  lines.push('');
  lines.push('3) 수정 내역 (전/후 diff)');
  const diffItems = params.routeDiffItems.slice(0, 4);
  if (diffItems.length === 0) {
    lines.push('- 변경 없음');
  } else {
    for (const item of diffItems) {
      lines.push(`- ${item}`);
    }
  }
  lines.push('');
  lines.push('4) 최종 계산 결과');
  if (params.quote && !params.blockedReason) {
    lines.push(`- 주행 거리: ${params.quote.basis?.distanceKm ?? '-'}km`);
    lines.push(
      `- 총 소요 시간: ${params.quote.basis?.totalBillMinutes ?? '-'}분 (운행 ${params.quote.basis?.driveMinutes ?? '-'}분 + 체류 ${params.quote.basis?.dwellTotalMinutes ?? '-'}분)`
    );
    lines.push(`- 시간당 요금제: ${params.quote.hourly?.formatted ?? '-'}`);
    lines.push(`- 단건 요금제: ${params.quote.perJob?.formatted ?? '-'}`);
    const oneLineAssumption = (params.assumptions || []).slice(0, 1).join(' ');
    lines.push(`- 가정: ${oneLineAssumption || '입력된 주소/역할 기준으로 계산했습니다.'}`);
  } else {
    lines.push(`- 계산 보류: ${params.blockedReason || '검증을 통과하지 못해 계산을 중단했습니다.'}`);
    lines.push('- 가정: 누락/오인 1건만 보정되면 즉시 재계산 가능합니다.');
  }
  return lines.join('\n');
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
  tags?: string[];
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
        tags: params.tags && params.tags.length ? params.tags : ['api'],
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

  const calcPricingForScenario = (veh: 'ray' | 'starex', schedule: 'regular' | 'ad-hoc') => {
    const calcHourlyRate = pickHourlyRate(veh, billMinutes);
    const calcHourlyBase = Math.round((billMinutes / 60) * calcHourlyRate);
    const calcHourlyFuel = fuelSurchargeHourlyCorrect(veh, km, billMinutes);
    const calcHourlyTotal = calcHourlyBase + calcHourlyFuel;

    let calcPerJobBase = 0;
    if (schedule === 'regular') {
      calcPerJobBase = perJobRegularPrice(veh, km);
    } else {
      calcPerJobBase = perJobBasePrice(veh, km);
    }
    const calcEffectiveStops = Math.max(0, params.destinationCount - 1);
    let calcPerJobStopFee = 0;
    if (schedule === 'regular') {
      calcPerJobStopFee = veh === 'ray' ? calcEffectiveStops * STOP_FEE.starex : calcEffectiveStops * Math.round(STOP_FEE.starex * 1.2);
    } else {
      calcPerJobStopFee = calcEffectiveStops * STOP_FEE[veh];
    }
    const calcPerJobTotal = calcPerJobBase + calcPerJobStopFee;

    return {
      hourlyTotal: calcHourlyTotal,
      perJobTotal: calcPerJobTotal,
      hourlyBreakdown: { billMinutes, hourlyRate: calcHourlyRate, base: calcHourlyBase, fuelSurcharge: calcHourlyFuel },
      perJobBreakdown: { base: calcPerJobBase, stopFee: calcPerJobStopFee, effectiveStopsCount: calcEffectiveStops }
    };
  };

  const scenarios = {
    ray: {
      'ad-hoc': calcPricingForScenario('ray', 'ad-hoc'),
      regular: calcPricingForScenario('ray', 'regular')
    },
    starex: {
      'ad-hoc': calcPricingForScenario('starex', 'ad-hoc'),
      regular: calcPricingForScenario('starex', 'regular')
    }
  };

  const currentScenario = scenarios[vehicleKey][params.scheduleType];
  const isHourlyRecommended = currentScenario.hourlyTotal <= currentScenario.perJobTotal;
  const recommendedPlan: 'hourly' | 'perJob' = isHourlyRecommended ? 'hourly' : 'perJob';
  const totalPrice = isHourlyRecommended ? currentScenario.hourlyTotal : currentScenario.perJobTotal;

  return {
    recommendedPlan,
    totalPrice,
    totalPriceFormatted: formatWon(totalPrice),
    scenarios,
    hourly: {
      total: currentScenario.hourlyTotal,
      formatted: formatWon(currentScenario.hourlyTotal),
      billMinutes: currentScenario.hourlyBreakdown.billMinutes,
      ratePerHour: currentScenario.hourlyBreakdown.hourlyRate,
      fuelSurcharge: currentScenario.hourlyBreakdown.fuelSurcharge,
    },
    perJob: {
      total: currentScenario.perJobTotal,
      formatted: formatWon(currentScenario.perJobTotal),
      base: currentScenario.perJobBreakdown.base,
      stopFee: currentScenario.perJobBreakdown.stopFee,
      effectiveStopsCount: currentScenario.perJobBreakdown.effectiveStopsCount,
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
    const operationalIntent = detectOperationalIntent(message);
    const validationLoopDetected = isValidationResponseLoop(history);
    let hardGeneralOverride = isGeneralKnowledgeRequest(message);
    const previousSlotState = await loadSessionContext(sessionId);
    const knowledgeLockActive =
      previousSlotState.responseMode === 'knowledge' &&
      Number(previousSlotState.responseModeLockTurns || 0) > 0 &&
      (!hasStrongQuoteSignal(message) || isKnowledgeFollowUpQuestion(message));
    if (knowledgeLockActive) {
      hardGeneralOverride = true;
    }
    if (validationLoopDetected && !hasStrongQuoteSignal(message) && operationalIntent === 'default') {
      hardGeneralOverride = true;
    }
    const modeState = updateKnowledgeModeState({
      prev: previousSlotState,
      message,
      hardGeneralOverride,
    });

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
      rawIntentHint === 'general' && !isTimeSensitiveQuery && operationalIntent === 'default' && !hardGeneralOverride
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

    const preferenceInstruction = buildPreferenceInstruction(previousSlotState);

    const shouldUseRag = rawIntentHint === 'business' || attachmentIds.length > 0 || message.length > 120;
    const rag = shouldUseRag
      ? await retrieveRagContext({
        query: message,
        sessionId,
        limit: attachmentIds.length > 0 ? 4 : 2,
      })
      : { snippets: [], sources: [] };
    const feedbackGuidance = await retrieveFeedbackGuidance({
      sessionId,
      query: message,
      limit: 5,
    });

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
    const requestedWeb = /웹\s*검색|검색해서|찾아본\s*후|실시간\s*검색/.test(message);
    if (hardGeneralOverride) {
      const evidence = buildEvidencePayload({
        ragSources: rag.sources || [],
        webSources: web.sources || [],
        usedWeb: Boolean(web.sources?.length),
        usedRag: Boolean(rag.sources?.length),
        hasSessionSummary: Boolean(sessionSummary),
      });
      await upsertSessionContext(sessionId, {
        ...previousSlotState,
        ...modeState,
      });
      return NextResponse.json({
        success: true,
        extracted: {},
        missingFields: [],
        followUpQuestions: [],
        assistantMessage:
          web.sources.length > 0
            ? buildWebSearchGroundedReply({
              web,
              requestedWeb,
              ragHint: rag.snippets.slice(0, 2).join('\n'),
            })
            : buildGeneralKnowledgeReply({
              assistantResponse: '',
              ragHint: rag.snippets.slice(0, 2).join('\n'),
              requestedWeb,
              webSourceCount: 0,
              knowledgeTopic: modeState.knowledgeTopic,
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
      });
    }
    const expectedCountsForModel = mergeExpectedCounts(
      extractExpectedRouteCounts(message),
      previousSlotState.expectedCounts
    );
    const interpretationForModel = buildIntentInterpretation(message, expectedCountsForModel);
    const extractionModel = pickExtractionModel({
      message,
      interpretation: interpretationForModel,
      operationalIntent,
      validationLoopDetected,
    });

    const finalPromptText = [
      llmPromptText,
      '[도구 정책] 이 시스템은 웹 검색 도구를 사용할 수 있습니다. 웹 근거가 없으면 없다고 명시하되, "웹 검색 기능이 없다"라고 답변하지 마세요.',
      ...(feedbackGuidance.snippets || []).map((snippet, idx) => `[피드백학습${idx + 1}] ${snippet}`),
      ...(web.snippets || []).map((snippet, idx) => `[웹참고${idx + 1}] ${snippet}`),
    ]
      .filter(Boolean)
      .join('\n\n');
    const extraction = await extractQuoteInfo(finalPromptText, true, history, {
      model: extractionModel,
    });
    let extracted = normalizeExtractedQuoteInfo({
      ...extraction.extractedData,
      vehicleType: extraction.extractedData.vehicleType || conversationContext.vehicleType,
      scheduleType: extraction.extractedData.scheduleType || conversationContext.scheduleType,
    });
    // 일반 지식 질의에서는 이전 견적 슬롯의 경로를 주입하지 않는다(컨텍스트 감쇠)
    if (!hardGeneralOverride) {
      extracted = mergeWithSlotExtracted(extracted, previousSlotState);
    }

    const structuredMemo = parseStructuredLogisticsMemo(message);
    const hasStructuredMemo = Boolean(structuredMemo?.extracted?.origin?.address && structuredMemo?.extracted?.destinations?.length);
    let replaceRouteFromMemo = false;
    if (hasStructuredMemo && structuredMemo) {
      replaceRouteFromMemo = structuredMemo.replaceRoute;
      extracted = normalizeExtractedQuoteInfo({
        ...extracted,
        origin: structuredMemo.extracted.origin,
        destinations: structuredMemo.extracted.destinations,
      });
    }
    // 대화 중간에 LLM이 경로를 과도하게 축소해 덮어쓰는 현상 방지
    const previousDestinations = previousSlotState.destinations || [];
    const currentDestinations = extracted.destinations || [];
    const looksLikeResetIntent = /초기화|새로|리셋|다시 시작|경로 변경|노선 변경/.test(message);
    if (!replaceRouteFromMemo && !looksLikeResetIntent && previousDestinations.length >= 3 && currentDestinations.length > 0 && currentDestinations.length < previousDestinations.length) {
      extracted = normalizeExtractedQuoteInfo({
        ...extracted,
        origin: extracted.origin?.address ? extracted.origin : (previousSlotState.origin ? { address: previousSlotState.origin } : extracted.origin),
        destinations: previousDestinations.map((addr) => ({ address: addr })),
      });
    }
    const expectedCounts = expectedCountsForModel;
    // 1단계: LLM 해석 결과 + 사용자 입력에서 의도/개수/주소 후보 해석
    const interpretation = buildIntentInterpretation(message, expectedCounts);
    const beforeValidationExtracted = normalizeExtractedQuoteInfo(extracted);

    // 2단계: 역할 분리(상차/배송/반납) + 가드레일 + 자동 보정
    extracted = applyRoleTaggedHybridResolution(extracted, interpretation);
    extracted = sanitizeExtractedRouteForAutoFix(extracted);
    let guardrail = runGuardrailValidation(extracted, interpretation);
    let autoFixResult = autoFixExtractedRoute(extracted, interpretation);
    extracted = autoFixResult.fixed;
    guardrail = runGuardrailValidation(extracted, interpretation);

    // 3단계: Plan-Check-Act 루프 (최대 2회)
    for (let attempt = 0; attempt < 2; attempt++) {
      const countProbe = applyExpectedCountHeuristics(extracted, expectedCounts);
      const readinessProbe = evaluateRouteReadiness({
        extracted,
        interpretation,
        guardrail,
      });
      const shouldRetry = !guardrail.isValid || Boolean(countProbe.mismatchReason) || !readinessProbe.isReady;
      if (!shouldRetry) break;

      const fromRoleTagged = applyRoleTaggedHybridResolution(extracted, interpretation);
      const fromRoleTaggedFixed = autoFixExtractedRoute(fromRoleTagged, interpretation);
      extracted = fromRoleTaggedFixed.fixed;

      if (hasStructuredMemo && structuredMemo?.extracted?.origin?.address && structuredMemo.extracted?.destinations?.length) {
        extracted = normalizeExtractedQuoteInfo({
          ...extracted,
          origin: structuredMemo.extracted.origin,
          destinations: structuredMemo.extracted.destinations,
        });
      }
      extracted = sanitizeExtractedRouteForAutoFix(extracted);
      autoFixResult = autoFixExtractedRoute(extracted, interpretation);
      extracted = autoFixResult.fixed;
      guardrail = runGuardrailValidation(extracted, interpretation);
    }

    const roleResolution = buildRoleResolutionTable(extracted, interpretation);
    const readiness = evaluateRouteReadiness({
      extracted,
      interpretation,
      guardrail,
    });
    let countCheck = applyExpectedCountHeuristics(extracted, expectedCounts);
    if (countCheck.mismatchReason) {
      extracted = sanitizeExtractedRouteForAutoFix(countCheck.adjusted);
      autoFixResult = autoFixExtractedRoute(extracted, interpretation);
      extracted = autoFixResult.fixed;
      guardrail = runGuardrailValidation(extracted, interpretation);
      countCheck = applyExpectedCountHeuristics(extracted, expectedCounts);
    }
    const routeDiffItems = buildRouteDiffItems(beforeValidationExtracted, extracted);

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

    // "레이, 정기"처럼 차량/일정만 보정한 메시지에서는
    // 이전 턴에서 확정한 경로(origin/destinations)를 절대 덮어쓰지 않는다.
    if (
      isVehicleScheduleOnlyUpdate(message) &&
      previousSlotState.origin &&
      Array.isArray(previousSlotState.destinations) &&
      previousSlotState.destinations.length > 0
    ) {
      extracted = normalizeExtractedQuoteInfo({
        ...extracted,
        origin: { address: previousSlotState.origin },
        destinations: previousSlotState.destinations.map((addr) => ({ address: addr })),
      });
    }

    if (feedbackGuidance.policyHints.addressNormalizationBoost) {
      extracted = normalizeExtractedQuoteInfo({
        ...extracted,
        origin: extracted.origin?.address
          ? { ...extracted.origin, address: normalizeAddressForGeocode(extracted.origin.address) }
          : extracted.origin,
        destinations: (extracted.destinations || []).map((d: any) => ({
          ...d,
          address: normalizeAddressForGeocode(String(d?.address || '')),
        })),
      });
    }

    let slotState = mergeSlotState(previousSlotState, extracted, message, {
      replaceRoute: replaceRouteFromMemo,
    });
    slotState = {
      ...slotState,
      expectedCounts,
      ...modeState,
    };
    const isMultiScenario = detectMultiScenarioInput(message);

    const missingFields: string[] = getMissingSlots(slotState, false);

    const followUpQuestions = buildFollowUpQuestions(extracted, missingFields);
    const departureAt = buildDepartureIso(extracted.departureTime);

    const isNonQuoteIntent = slotState.lastUserIntent === 'document' || slotState.lastUserIntent === 'general';
    const evidence = buildEvidencePayload({
      ragSources: [...(rag.sources || []), ...(feedbackGuidance.sources || [])],
      webSources: web.sources || [],
      usedWeb: Boolean(web.sources?.length),
      usedRag: Boolean((rag.sources?.length || 0) + (feedbackGuidance.sources?.length || 0)),
      hasSessionSummary: Boolean(sessionSummary),
    });

    if (operationalIntent === 'acknowledge' && !hasAddressLikeToken(message)) {
      await upsertSessionContext(sessionId, slotState);
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions: [],
        assistantMessage: '확인 감사합니다. 현재 구성으로는 문제 없이 계산 가능합니다. 필요하시면 동일 조건으로 차량/스케줄만 바꿔 비교해드릴게요.',
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
      });
    }

    if (operationalIntent === 'cause-analysis' && !hasAddressLikeToken(message)) {
      await upsertSessionContext(sessionId, slotState);
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions: [],
        assistantMessage: buildCauseAnalysisMessage({
          interpretation,
          guardrail,
          routeDiffItems,
          history,
        }),
        quote: null,
        routeSummary: null,
        assumptions: [],
        roleResolution,
        pipeline: {
          stage1Interpretation: interpretation,
          stage2Guardrail: guardrail,
          stage3AutoFixApplied: true,
          stage3AutoFixReport: autoFixResult.report,
          stage4RouteOptimizationCalled: false,
          stageState: 'completed',
          readiness,
          llmModel: extractionModel || process.env.OPENAI_QUOTE_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        },
        evidence: {
          ...evidence,
          fetchedAt: web.fetchedAt,
        },
        actions: {
          canApplyToPanel: false,
          canPreviewMap: false,
        },
      });
    }

    if (operationalIntent === 'info-request') {
      await upsertSessionContext(sessionId, slotState);
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions,
        assistantMessage: buildInfoRequestConversationMessage({
          interpretation,
          extracted,
          missingFields,
        }),
        quote: null,
        routeSummary: null,
        assumptions: [],
        roleResolution,
        pipeline: {
          stage1Interpretation: interpretation,
          stage2Guardrail: guardrail,
          stage3AutoFixApplied: true,
          stage3AutoFixReport: autoFixResult.report,
          stage4RouteOptimizationCalled: false,
          stageState: 'need-input',
          readiness,
          llmModel: extractionModel || process.env.OPENAI_QUOTE_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        },
        evidence: {
          ...evidence,
          fetchedAt: web.fetchedAt,
        },
        actions: {
          canApplyToPanel: false,
          canPreviewMap: false,
        },
      });
    }

    // 일반/문서/지식 질의는 견적 루프를 강제로 우회한다.
    if ((isNonQuoteIntent && missingFields.includes('origin') && missingFields.includes('destinations')) || hardGeneralOverride) {
      const ragHint = rag.snippets.slice(0, 2).join('\n');
      await upsertSessionContext(sessionId, slotState);
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions: [],
        assistantMessage:
          buildGeneralKnowledgeReply({
            assistantResponse: extracted.assistantResponse,
            ragHint,
            requestedWeb,
            webSourceCount: web.sources.length,
            knowledgeTopic: slotState.knowledgeTopic,
          }),
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

    // P0: 구조 검증 게이트 강제. 검증 실패 시 경로 계산 호출 금지.
    const blockedByValidation = Boolean(countCheck.mismatchReason || !guardrail.isValid || !readiness.isReady);
    const responseMode = shouldUseStructuredMode({
      message,
      operationalIntent,
      blockedByValidation,
    });
    const shouldHardBlock = isMultiScenario || blockedByValidation;

    if (shouldHardBlock) {
      await upsertSessionContext(sessionId, slotState);
      const firstIssue = countCheck.mismatchReason || guardrail.issues[0] || '경로 구성 검증에 실패했습니다.';
      const expectedStops = Number.isFinite(interpretation.expectedCounts.totalStopsCount)
        ? Number(interpretation.expectedCounts.totalStopsCount)
        : (interpretation.expectedCounts.pickupCount ?? 1) - 1 + (interpretation.expectedCounts.deliveryCount ?? 0) + (interpretation.expectedCounts.returnCount ?? 0);
      const actualStops = Array.isArray(extracted?.destinations) ? extracted.destinations.length : 0;
      const stopDelta = expectedStops > 0 ? actualStops - expectedStops : 0;
      const minimalQuestion = stopDelta > 0
        ? `중복으로 보이는 경유지 ${stopDelta}건만 확인해 주세요.`
        : (readiness.singleQuestion || (guardrail.missingFields.includes('origin')
          ? '출발지 1곳만 정확한 도로명+번지로 확인해 주세요.'
          : '누락된 주소 1곳만 확인해 주세요.'));
      const blockedReason = `${firstIssue} ${minimalQuestion}`.trim();
      await logFailureCase({
        sessionId,
        userInput: message,
        assistantOutput: blockedReason,
        errorCode: 'VALIDATION_BLOCKED',
        reason: firstIssue,
        tags: classifyValidationFailureTags(guardrail, countCheck.mismatchReason),
        metadata: {
          operationalIntent,
          readiness,
          countMismatchReason: countCheck.mismatchReason,
          guardrailIssues: guardrail.issues,
        },
      });
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions,
        assistantMessage:
          responseMode === 'structured'
            ? buildFourBlockResultMessage({
              extracted,
              interpretation,
              guardrail,
              readiness,
              routeDiffItems,
              blockedReason,
              countMismatchReason: countCheck.mismatchReason,
            })
            : buildValidationBlockedConversationMessage({
              interpretation,
              extracted,
              missingFields,
              blockedReason,
            }),
        quote: null,
        routeSummary: null,
        assumptions: [],
        roleResolution,
        pipeline: {
          stage1Interpretation: interpretation,
          stage2Guardrail: guardrail,
          stage3AutoFixApplied: true,
          stage3AutoFixReport: autoFixResult.report,
          stage4RouteOptimizationCalled: false,
          stageState: 'blocked',
          readiness,
          llmModel: extractionModel || process.env.OPENAI_QUOTE_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        },
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
    const softValidationWarnings: string[] = [];

    if (isMultiScenario || missingFields.includes('origin') || missingFields.includes('destinations')) {
      await upsertSessionContext(sessionId, slotState);
      const draftMessage = hasStructuredMemo
        ? buildDeterministicRouteDraftMessage({
          extracted,
          interpretation,
          missingFields,
          pickupCandidates: interpretation.pickupCandidates,
        })
        : buildConversationalAssistantMessage({
          assistantResponse: extracted.assistantResponse,
          missingFields,
          extracted,
          isMultiScenario,
        });
      const routedMessage =
        operationalIntent === 'validation-request'
          ? `${draftMessage}\n\n검증 요청으로 인식했어요. 개수/중복/주소 유효성만 먼저 맞춘 뒤 계산을 진행하겠습니다.`
          : operationalIntent === 'recalculate'
            ? `${draftMessage}\n\n재계산 요청으로 인식했어요. 누락된 핵심 주소 확인 후 즉시 다시 계산합니다.`
            : draftMessage;
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions,
        assistantMessage: routedMessage,
        quote: null,
        routeSummary: null,
        assumptions: [],
        roleResolution,
        pipeline: {
          stage1Interpretation: interpretation,
          stage2Guardrail: guardrail,
          stage3AutoFixApplied: true,
          stage3AutoFixReport: autoFixResult.report,
          stage4RouteOptimizationCalled: false,
          stageState: 'need-input',
          readiness,
        },
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

    const originAddressRaw = extracted.origin!.address;
    const destinationAddressesRaw = extracted.destinations!.map((d) => d.address).slice(0, 20);
    const originAddress = normalizeAddressForGeocode(originAddressRaw);
    const destinationAddresses = destinationAddressesRaw.map((addr) => normalizeAddressForGeocode(addr));
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
    let effectiveRoutePayload = routePayload;
    let usedSanitizedPayload = false;

    let routeRes: Response = await callRouteOptimization(request, routePayload);

    // 지오코딩 실패 시 1회 자동 재시도: 층/호/오타(충) 제거한 주소로 재요청
    if (!routeRes.ok) {
      const errBody = await routeRes.json().catch(() => ({}));
      const diagCode = String(errBody?.diagnostics?.code || '');
      const shouldRetryGeocode = diagCode.startsWith('GEOCODE_');
      if (shouldRetryGeocode) {
        const sanitizedOrigin = normalizeAddressForGeocode(originAddress);
        const sanitizedDestinations = destinationAddresses.map((addr) => normalizeAddressForGeocode(addr));
        const hasSanitizedDiff =
          sanitizedOrigin !== originAddress ||
          sanitizedDestinations.some((addr, idx) => addr !== destinationAddresses[idx]);

        if (hasSanitizedDiff) {
          const retryPayload = {
            ...routePayload,
            origins: [sanitizedOrigin],
            destinations: sanitizedDestinations,
            finalDestinationAddress: sanitizedDestinations[sanitizedDestinations.length - 1] || null,
          };
          const retried = await callRouteOptimization(request, retryPayload);
          if (retried.ok) {
            routeRes = retried;
            effectiveRoutePayload = retryPayload;
            usedSanitizedPayload = true;
          } else {
            routeRes = new Response(JSON.stringify(errBody), { status: routeRes.status });
          }
        } else {
          routeRes = new Response(JSON.stringify(errBody), { status: routeRes.status });
        }
      } else {
        routeRes = new Response(JSON.stringify(errBody), { status: routeRes.status });
      }
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
    assumptions.push(...softValidationWarnings);
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
      assistantMessage:
        responseMode === 'structured'
          ? buildFourBlockResultMessage({
            extracted: {
              ...extracted,
              vehicleType,
              scheduleType,
            },
            interpretation,
            guardrail,
            readiness,
            routeDiffItems,
            quote: {
              basis: quote.basis,
              hourly: quote.hourly,
              perJob: quote.perJob,
            },
            assumptions,
            countMismatchReason: countCheck.mismatchReason,
          })
          : buildConversationalAssistantMessage({
            assistantResponse: extracted.assistantResponse,
            missingFields,
            extracted: {
              ...extracted,
              vehicleType,
              scheduleType,
            },
            isMultiScenario,
            quote: {
              basis: quote.basis,
              hourly: quote.hourly,
              perJob: quote.perJob,
            },
          }),
      roleResolution,
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
        scenarios: quote.scenarios,
        hourly: quote.hourly as QuotePlan & Record<string, unknown>,
        perJob: quote.perJob as QuotePlan & Record<string, unknown>,
        basis: quote.basis,
      },
      assumptions,
      pipeline: {
        stage1Interpretation: interpretation,
        stage2Guardrail: guardrail,
        stage3AutoFixApplied: true,
        stage3AutoFixReport: autoFixResult.report,
        stage4RouteOptimizationCalled: true,
        stageState: 'completed',
        readiness,
        llmModel: extractionModel || process.env.OPENAI_QUOTE_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      },
      evidence: {
        ...evidence,
        fetchedAt: web.fetchedAt,
      },
      routeRequestMeta: {
        usedSanitizedPayload,
      },
      routeRequest: effectiveRoutePayload,
      rag: {
        sources: rag.sources,
        attachmentIds,
      },
      learning: {
        feedbackSignals: {
          positiveCount: feedbackGuidance.positiveCount,
          negativeCount: feedbackGuidance.negativeCount,
          appliedAddressNormalizationBoost: feedbackGuidance.policyHints.addressNormalizationBoost,
          appliedDuplicateGuardBoost: feedbackGuidance.policyHints.duplicateGuardBoost,
        },
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

