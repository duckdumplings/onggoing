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

type ExtractedContext = {
  vehicleType?: '레이' | '스타렉스';
  scheduleType?: 'regular' | 'ad-hoc';
  knownAddresses?: string[];
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

function buildRouteFailureConversation(errorPayload: any): {
  assistantMessage: string;
  suggestedPrompts: string[];
} {
  const details = errorPayload?.details || {};
  const errors: string[] = Array.isArray(details?.errors) ? details.errors : [];
  const suggestions: RouteErrorSuggestion[] = Array.isArray(details?.suggestions) ? details.suggestions : [];

  const firstReason = errors[0] || errorPayload?.message || '경로 계산 중 충돌이 발생했습니다.';
  const assistantMessage = [
    '좋은 질문이에요. 지금 계산이 멈춘 이유를 먼저 설명드릴게요.',
    firstReason,
    errors.length > 1 ? `추가로 ${errors.length - 1}개의 충돌이 더 있어요.` : '',
    '아래 해결안 중 하나로 바로 다시 계산해볼 수 있어요.'
  ].filter(Boolean).join('\n');

  const suggestedPrompts = suggestions.map((s) => {
    const title = s.title || '해결안 적용';
    const desc = s.description ? `(${s.description})` : '';
    return `${title} ${desc}`.trim();
  }).slice(0, 4);

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

    const extraction = await extractQuoteInfo(message, true, history);
    const extracted = normalizeExtractedQuoteInfo({
      ...extraction.extractedData,
      vehicleType: extraction.extractedData.vehicleType || conversationContext.vehicleType,
      scheduleType: extraction.extractedData.scheduleType || conversationContext.scheduleType,
    });
    const isMultiScenario = detectMultiScenarioInput(message);

    const missingFields: string[] = [];
    if (!extracted.origin?.address) missingFields.push('origin');
    if (!extracted.destinations || extracted.destinations.length === 0) missingFields.push('destinations');
    if (!extracted.vehicleType) missingFields.push('vehicleType');
    if (!extracted.scheduleType) missingFields.push('scheduleType');

    const followUpQuestions = buildFollowUpQuestions(extracted, missingFields);
    const departureAt = buildDepartureIso(extracted.departureTime);

    // 핵심 필드가 부족하거나 멀티 시나리오 입력이면 계산을 생략
    if (isMultiScenario || missingFields.includes('origin') || missingFields.includes('destinations')) {
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
        actions: {
          canApplyToPanel: false,
          canPreviewMap: false,
        },
      });
    }

    const originAddress = extracted.origin!.address;
    const destinationAddresses = extracted.destinations!.map((d) => d.address).slice(0, 20);
    const deliveryTimes = extracted.destinations!.map((d) => d.deliveryTime || '');
    const isNextDayFlags = extracted.destinations!.map((d) => Boolean(d.isNextDay));
    const dwellMinutes = [10, ...extracted.destinations!.map((d) => d.dwellMinutes || 10)];
    const vehicleType = extracted.vehicleType || '레이';
    const scheduleType = extracted.scheduleType || 'ad-hoc';

    // 동일 서버 내부 API 호출
    const routePayload = {
      origins: [originAddress],
      destinations: destinationAddresses,
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
      const err = await routeRes.json().catch(() => ({}));
      const failure = buildRouteFailureConversation(err);
      return NextResponse.json(
        {
          success: false,
          assistantMessage: failure.assistantMessage,
          suggestedPrompts: failure.suggestedPrompts,
          extracted,
          missingFields,
          followUpQuestions,
          error: {
            code: 'ROUTE_OPTIMIZATION_FAILED',
            message: err?.message || err?.error || '경로 계산에 실패했습니다.',
            details: err?.details,
          },
        },
        { status: routeRes.status >= 400 && routeRes.status < 600 ? routeRes.status : 500 }
      );
    }

    const routeJson = await routeRes.json();
    if (!routeJson?.success || !routeJson?.data?.summary) {
      const failure = buildRouteFailureConversation({
        message: '경로 계산 응답 형식이 올바르지 않습니다.',
      });
      return NextResponse.json(
        {
          success: false,
          assistantMessage: failure.assistantMessage,
          suggestedPrompts: failure.suggestedPrompts,
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
      routeRequest: routePayload,
      actions: {
        canApplyToPanel: true,
        canPreviewMap: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    const code = message.includes('OPENAI') ? 'OPENAI_ERROR' : 'INTERNAL_ERROR';
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

