import { ExtractedQuoteInfo } from '@/domains/quote/types/quoteExtraction';

export type SlotState = {
  origin?: string;
  destinations: string[];
  expectedCounts?: {
    pickupCount?: number;
    deliveryCount?: number;
    returnCount?: number;
    totalStopsCount?: number;
  };
  vehicleType?: '레이' | '스타렉스';
  scheduleType?: 'regular' | 'ad-hoc';
  departureTime?: string;
  constraints: string[];
  preferences: {
    responseStyle?: 'concise' | 'detailed';
    preferredVehicleType?: '레이' | '스타렉스';
    preferredScheduleType?: 'regular' | 'ad-hoc';
  };
  lastUserIntent?: 'quote' | 'route' | 'document' | 'general';
  lastUpdatedAt?: string;
};

export type MissingSlot =
  | 'origin'
  | 'destinations'
  | 'vehicleType'
  | 'scheduleType'
  | 'departureTime';

const MAX_DESTINATIONS = 20;

export function createInitialSlotState(): SlotState {
  return {
    destinations: [],
    expectedCounts: {},
    constraints: [],
    preferences: {},
  };
}

export function inferIntent(text: string): SlotState['lastUserIntent'] {
  if (/견적|요금|금액|비용/.test(text)) return 'quote';
  if (/경로|동선|ETA|도착/.test(text)) return 'route';
  if (/파일|문서|업로드|리포트|엑셀|pdf|docx|json/i.test(text)) return 'document';
  return 'general';
}

export function mergeSlotState(
  prev: SlotState,
  extracted: ExtractedQuoteInfo,
  userText: string,
  options?: { replaceRoute?: boolean }
): SlotState {
  const replaceRoute = Boolean(options?.replaceRoute);

  const next: SlotState = {
    ...prev,
    destinations: replaceRoute ? [] : [...(prev.destinations || [])],
    constraints: [...(prev.constraints || [])],
    preferences: { ...(prev.preferences || {}) },
    lastUserIntent: inferIntent(userText),
    lastUpdatedAt: new Date().toISOString(),
  };

  if (replaceRoute) {
    next.origin = extracted.origin?.address?.trim() || undefined;
  } else if (extracted.origin?.address?.trim()) {
    next.origin = extracted.origin.address.trim();
  }

  if (replaceRoute && Array.isArray(extracted.destinations)) {
    next.destinations = extracted.destinations
      .map((d) => d?.address?.trim())
      .filter((a): a is string => Boolean(a))
      .slice(0, MAX_DESTINATIONS);
  } else if (Array.isArray(extracted.destinations)) {
    for (const dest of extracted.destinations) {
      const addr = dest?.address?.trim();
      if (!addr) continue;
      if (!next.destinations.includes(addr)) {
        next.destinations.push(addr);
      }
      if (next.destinations.length >= MAX_DESTINATIONS) break;
    }
  }
  if (extracted.vehicleType) next.vehicleType = extracted.vehicleType;
  if (extracted.scheduleType) next.scheduleType = extracted.scheduleType;
  if (extracted.departureTime) next.departureTime = extracted.departureTime;
  if (extracted.vehicleType) next.preferences.preferredVehicleType = extracted.vehicleType;
  if (extracted.scheduleType) next.preferences.preferredScheduleType = extracted.scheduleType;

  if (/간단|짧게|요약만|핵심만|한줄|짧은 답변/.test(userText)) {
    next.preferences.responseStyle = 'concise';
  } else if (/자세히|상세히|길게|설명해|근거까지|풀어서/.test(userText)) {
    next.preferences.responseStyle = 'detailed';
  }

  if (Array.isArray(extracted.specialRequirements)) {
    for (const requirement of extracted.specialRequirements) {
      const normalized = String(requirement || '').trim();
      if (!normalized) continue;
      if (!next.constraints.includes(normalized)) {
        next.constraints.push(normalized);
      }
    }
  }

  return next;
}

export function toExtractedFromSlots(slotState: SlotState): Partial<ExtractedQuoteInfo> {
  return {
    origin: slotState.origin ? { address: slotState.origin } : undefined,
    destinations: slotState.destinations.map((address) => ({ address })),
    vehicleType: slotState.vehicleType,
    scheduleType: slotState.scheduleType,
    departureTime: slotState.departureTime,
    specialRequirements: slotState.constraints,
  };
}

export function getMissingSlots(slotState: SlotState, requireDepartureTime = false): MissingSlot[] {
  const missing: MissingSlot[] = [];
  if (!slotState.origin) missing.push('origin');
  if (!slotState.destinations.length) missing.push('destinations');
  if (!slotState.vehicleType) missing.push('vehicleType');
  if (!slotState.scheduleType) missing.push('scheduleType');
  if (requireDepartureTime && !slotState.departureTime) missing.push('departureTime');
  return missing;
}

export function buildConversationSummary(slotState: SlotState): string {
  const lines: string[] = [];
  if (slotState.expectedCounts?.pickupCount || slotState.expectedCounts?.deliveryCount || slotState.expectedCounts?.returnCount) {
    lines.push(
      `구성: 상차 ${slotState.expectedCounts?.pickupCount ?? '?'} / 배송 ${slotState.expectedCounts?.deliveryCount ?? '?'} / 반납 ${slotState.expectedCounts?.returnCount ?? '?'}`
    );
  }
  if (slotState.origin) lines.push(`출발지: ${slotState.origin}`);
  if (slotState.destinations.length) lines.push(`목적지: ${slotState.destinations.join(', ')}`);
  if (slotState.vehicleType) lines.push(`차량: ${slotState.vehicleType}`);
  if (slotState.scheduleType) lines.push(`스케줄: ${slotState.scheduleType === 'regular' ? '정기' : '비정기'}`);
  if (slotState.departureTime) lines.push(`출발시간: ${slotState.departureTime}`);
  if (slotState.constraints.length) lines.push(`제약: ${slotState.constraints.join(', ')}`);
  if (slotState.preferences?.responseStyle) lines.push(`응답스타일: ${slotState.preferences.responseStyle}`);
  if (slotState.preferences?.preferredVehicleType) lines.push(`선호차량: ${slotState.preferences.preferredVehicleType}`);
  if (slotState.preferences?.preferredScheduleType) lines.push(`선호스케줄: ${slotState.preferences.preferredScheduleType === 'regular' ? '정기' : '비정기'}`);
  return lines.join(' | ');
}

