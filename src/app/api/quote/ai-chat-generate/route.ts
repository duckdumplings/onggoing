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
  const pickup = message.match(/상차지(?:는)?\s*(\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*곳/i);
  const delivery = message.match(/배송지(?:는)?\s*(\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*곳/i);
  const returns = message.match(/반납지(?:는)?\s*(\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*곳/i);
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
  notes: string[];
};

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
  return {
    expectedCounts,
    addressCandidates: extractAddressCandidatesFromMessage(message),
    pickupCandidates: extractPickupCandidatesFromMessage(message),
    intentionalRevisitAddresses,
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

  const expected = interpretation.expectedCounts;
  const hasExpected = Number.isFinite(expected.pickupCount) || Number.isFinite(expected.deliveryCount) || Number.isFinite(expected.returnCount);
  if (hasExpected) {
    const expectedStops = (expected.pickupCount ?? 1) - 1 + (expected.deliveryCount ?? 0) + (expected.returnCount ?? 0);
    if (expectedStops > 0 && destinations.length !== expectedStops) {
      issues.push(`요청 개수와 인식 개수 불일치(기대 ${expectedStops}, 인식 ${destinations.length})`);
    }
  }

  return { isValid: issues.length === 0, issues, missingFields };
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

function canProceedWithMinimalRoute(extracted: any): boolean {
  const origin = String(extracted?.origin?.address || '').trim();
  const destinations = Array.isArray(extracted?.destinations) ? extracted.destinations : [];
  const validOrigin = looksResolvableAddressText(origin);
  const validDestinations = destinations.filter((d: any) =>
    looksResolvableAddressText(String(d?.address || ''))
  );
  return validOrigin && validDestinations.length > 0;
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
    const finalPromptText = [
      llmPromptText,
      ...(feedbackGuidance.snippets || []).map((snippet, idx) => `[피드백학습${idx + 1}] ${snippet}`),
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
    const expectedCounts = extractExpectedRouteCounts(message);
    // 1단계: LLM 해석 결과 + 사용자 입력에서 의도/개수/주소 후보 해석
    const interpretation = buildIntentInterpretation(message, expectedCounts);
    // 2단계: 규칙 검증 전 자동 정리
    extracted = sanitizeExtractedRouteForAutoFix(extracted);
    let guardrail = runGuardrailValidation(extracted, interpretation);
    // 3단계: 자동 보정
    const autoFixResult = autoFixExtractedRoute(extracted, interpretation);
    extracted = autoFixResult.fixed;
    guardrail = runGuardrailValidation(extracted, interpretation);
    const roleResolution = buildRoleResolutionTable(extracted, interpretation);
    const readiness = evaluateRouteReadiness({
      extracted,
      interpretation,
      guardrail,
    });
    // 기존 개수 가드 유지
    let countCheck = applyExpectedCountHeuristics(extracted, expectedCounts);
    if (countCheck.mismatchReason) {
      extracted = sanitizeExtractedRouteForAutoFix(countCheck.adjusted);
      countCheck = applyExpectedCountHeuristics(extracted, expectedCounts);
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

    // 주소 핵심 정보가 살아있으면(출발+유효 경유지 1개 이상) 경고가 있어도 1차 계산을 진행한다.
    // 멀티 시나리오 혹은 핵심 주소 자체가 없는 경우만 하드 블록한다.
    const blockedByValidation = Boolean(countCheck.mismatchReason || !guardrail.isValid || !readiness.isReady);
    const hasCriticalMissing =
      guardrail.missingFields.includes('origin') || guardrail.missingFields.includes('destinations');
    const canProceedMinimal = canProceedWithMinimalRoute(extracted);
    const shouldHardBlock = isMultiScenario || hasCriticalMissing || !canProceedMinimal;

    if (blockedByValidation && shouldHardBlock) {
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
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions,
        assistantMessage: `${firstIssue}\n\n자동 보정을 먼저 시도했습니다. ${minimalQuestion}`,
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
    if (blockedByValidation && !shouldHardBlock) {
      softValidationWarnings.push(
        '입력 경로에 일부 불확실성이 있어 자동 보정한 주소 기준으로 1차 견적을 계산했습니다.'
      );
    }

    if (isMultiScenario || missingFields.includes('origin') || missingFields.includes('destinations')) {
      await upsertSessionContext(sessionId, slotState);
      return NextResponse.json({
        success: true,
        extracted,
        missingFields,
        followUpQuestions,
        assistantMessage: hasStructuredMemo
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
      assistantMessage: buildConversationalAssistantMessage({
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
        }
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

