import type { CaseBoardResult } from '@/domains/dispatch/services/caseBoard';

function won(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : '-';
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
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
