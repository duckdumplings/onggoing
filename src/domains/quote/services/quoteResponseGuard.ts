import type { CaseBoardResult } from '@/domains/dispatch/services/caseBoard';

function won(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : '-';
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function collectNumericValues(value: unknown, out = new Set<number>(), seen = new Set<unknown>()): Set<number> {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.add(Math.round(value));
    return out;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectNumericValues(item, out, seen));
    return out;
  }
  Object.values(value as Record<string, unknown>).forEach((item) => collectNumericValues(item, out, seen));
  return out;
}

function extractWonAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(/(?:₩\s*([\d,]+)|([\d,]+)\s*원)/g)) {
    const raw = match[1] || match[2];
    const value = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(value)) amounts.push(Math.round(value));
  }
  return amounts;
}

function fuelSurchargeLine(quote: any): string {
  const fuel = quote?.hourly?.fuelSurchargeBreakdown ?? quote?.plans?.hourly?.fuelSurchargeBreakdown;
  const total = Number(quote?.hourly?.fuelSurcharge ?? quote?.plans?.hourly?.fuelSurcharge ?? fuel?.total ?? 0);
  if (!fuel) return `- 유류할증: ${won(total)}`;
  const included = Number(fuel.includedDistanceKm ?? 0);
  const excess = Number(fuel.excessDistanceKm ?? 0);
  const bins = Number(fuel.chargedBins ?? 0);
  const stepKm = Number(fuel.stepKm ?? 10);
  const stepCharge = Number(fuel.stepCharge ?? 0);
  return excess > 0
    ? `- 유류할증: 기본거리 ${included.toFixed(1)}km 초과 ${excess.toFixed(1)}km → ${stepKm}km 구간 ${bins}회 × ${won(stepCharge)} = ${won(total)}`
    : `- 유류할증: 기본거리 ${included.toFixed(1)}km 이내라 ${won(total)}`;
}

function canonicalSingleQuote(quote: any): string {
  const hourly = quote?.hourly ?? quote?.plans?.hourly ?? {};
  const perJob = quote?.perJob ?? quote?.plans?.perJob ?? {};
  const basis = quote?.basis ?? {};
  const recommendedPlan = quote?.recommendedPlan === 'perJob' ? 'perJob' : 'hourly';
  const representative = Number(
    quote?.oneTimePrice ?? (recommendedPlan === 'hourly' ? hourly?.total : perJob?.total) ?? 0,
  );
  const rawMinutes = Number(
    basis.rawTotalMinutes ??
      Number(basis.driveMinutes ?? 0) +
        Number(basis.dwellTotalMinutes ?? 0) +
        Number(basis.waitTotalMinutes ?? 0),
  );
  const planLabel = recommendedPlan === 'hourly' ? '시간당' : '단건';

  return [
    `운임표 기준 추천 견적은 ${won(representative)} (${planLabel})입니다.`,
    '',
    `- 시간당 요금제: ${won(hourly?.total)} — 과금 ${Number(hourly?.billMinutes ?? 0)}분 × ${won(hourly?.ratePerHour)}/시간`,
    fuelSurchargeLine(quote),
    `- 단건 요금제: ${won(perJob?.total)}`,
    `- 운행 기준: ${Number(basis.distanceKm ?? 0).toFixed(1)}km · 실제 구속 ${rawMinutes}분 (주행 ${Number(basis.driveMinutes ?? 0)}분 + 체류 ${Number(basis.dwellTotalMinutes ?? 0)}분 + 예약 대기 ${Number(basis.waitTotalMinutes ?? 0)}분)`,
  ].join('\n');
}

/**
 * 단일 견적 본문의 원화 숫자를 결정론적 calculate_quote 결과와 대조한다.
 * 하나라도 도구 결과에 없는 금액이면 본문 전체를 안전한 표준 요약으로 교체한다.
 */
export function guardSingleQuoteResponse(text: string, quote?: any): string {
  if (!quote?.hourly || !quote?.perJob) return text;
  const allowedAmounts = collectNumericValues(quote);
  const unsupportedAmount = extractWonAmounts(text).some((amount) => !allowedAmounts.has(amount));
  if (!text.trim() || unsupportedAmount) return canonicalSingleQuote(quote);
  if (!text.includes('유류할증')) {
    return `${text.trim()}\n\n운임표 유류할증 확인:\n${fuelSurchargeLine(quote)}`;
  }
  return text;
}

function containsUnsupportedDeparture(text: string, allowedDepartures: string[]): boolean {
  const times = unique(Array.from(text.matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)).map((m) => m[0]));
  const allowed = new Set(allowedDepartures);
  return times.some((time) => !allowed.has(time) && ['08:00', '10:00', '18:00'].includes(time));
}

export function guardCaseBoardResponse(text: string, board?: CaseBoardResult | null): string {
  if (!board?.cases?.length) return text;

  const validCases = board.cases.filter((c) => !c.error);
  const departures = unique(validCases.map((c) => c.departureLabel).filter((v): v is string => Boolean(v)));
  const vehiclePairs = unique(validCases.map((c) => `${c.label}: ${c.vehicleType}`));
  const monthlyTotal = board.rollup.monthlyTotal;
  const packageMonthly = board.quotePackage?.summary.monthlyTotal;
  const authoritativeMonthly = packageMonthly ?? monthlyTotal;
  const unsupportedDeparture = containsUnsupportedDeparture(text, departures);

  const guardLines = [
    '',
    '기준 확인:',
    `- 월 합계는 케이스 보드 산출값 ${won(authoritativeMonthly)} 기준입니다.`,
    departures.length ? `- 출발시각은 ${departures.join(' / ')} 기준이며, 다른 프리셋 출발시각으로 대체하지 않았습니다.` : null,
    vehiclePairs.length ? `- 차종은 ${vehiclePairs.join(' · ')} 기준입니다.` : null,
    unsupportedDeparture ? '- 본문에 보조 프리셋 시간이 보였다면 무시하고, 위 케이스 보드의 고정 출발시각을 기준으로 보세요.' : null,
  ].filter(Boolean);

  const guardText = guardLines.join('\n');
  if (text.includes('기준 확인:')) return text;
  return `${text.trim()}\n${guardText}`;
}
