/**
 * 정기 수거 빈도(Frequency) 정량화 유틸.
 *
 * 기존 시스템은 scheduleType('regular'|'ad-hoc') 플래그만 있어 "연 4회" 같은
 * 빈도를 가격에 반영하지 못했다. 여기서는 빈도를 연간 방문 횟수로 환산하고,
 * 1회 운임을 연 비용으로 펼친다. 또한 한국어 자연어("분기 1회", "연 4회",
 * "주 2회")에서 빈도를 파싱한다.
 */

import type { Frequency } from '@/domains/dispatch/types/routePlan';

const PERIODS_PER_YEAR: Record<Frequency['per'], number> = {
  day: 365,
  week: 52,
  month: 12,
  quarter: 4,
  year: 1,
};

/**
 * 연간 방문(운행) 횟수로 환산한다.
 * 분기 1회 → 4, 주 2회 → 104, 월 1회 → 12.
 */
export function annualVisits(freq: Frequency): number {
  const periods = PERIODS_PER_YEAR[freq.per] ?? 1;
  return Math.max(0, Math.round(periods * freq.count));
}

/**
 * 1회 운임을 연 비용으로 환산한다.
 */
export function annualizePrice(oneTimePrice: number, freq?: Frequency): number {
  if (!freq) return oneTimePrice;
  return oneTimePrice * annualVisits(freq);
}

const PER_LABELS: Record<Frequency['per'], string> = {
  day: '일',
  week: '주',
  month: '월',
  quarter: '분기',
  year: '연',
};

/**
 * "연 4회 (분기 1회)" 같은 사람이 읽는 라벨.
 */
export function formatFrequency(freq?: Frequency): string | null {
  if (!freq) return null;
  const visits = annualVisits(freq);
  const perLabel = PER_LABELS[freq.per] ?? freq.per;
  const detail = `${perLabel} ${freq.count}회`;
  if (freq.per === 'year' && freq.count === 1) return '연 1회';
  return `연 ${visits}회 (${detail})`;
}

const KOREAN_NUMERALS: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

function parseCount(raw: string | undefined): number {
  if (!raw) return 1;
  const numeric = Number(raw.replace(/[^\d]/g, ''));
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return KOREAN_NUMERALS[raw] ?? 1;
}

/**
 * 한국어 자연어에서 빈도를 추출한다. 못 찾으면 null.
 *
 * 지원 예시: "분기 1회", "분기별 1회", "3개월 1회", "연 4회", "연간 4회",
 *            "월 2회", "주 1회", "매주", "매월", "매일".
 */
export function parseFrequency(text: string): Frequency | null {
  const t = text.replace(/\s+/g, ' ');

  // "3개월 1회" / "3개월에 1회" → 분기 환산(3개월=분기)
  const everyNMonths = t.match(/(\d+)\s*개월(?:에|마다|당|별)?\s*(\d+|한|두|세|네)?\s*회?/);
  if (everyNMonths) {
    const months = Number(everyNMonths[1]);
    const count = parseCount(everyNMonths[2]);
    if (months > 0) {
      // 분기(3개월)는 quarter로, 그 외는 연환산을 month 기준으로 표현
      if (months === 3) return { per: 'quarter', count };
      if (months === 12) return { per: 'year', count };
      return { per: 'year', count: Math.round((12 / months) * count) };
    }
  }

  const quarter = t.match(/분기(?:별|마다|당)?\s*(\d+|한|두|세|네)?\s*회/);
  if (quarter) return { per: 'quarter', count: parseCount(quarter[1]) };

  const year = t.match(/(?:연간|연|1년|일년|매년)(?:에|당)?\s*(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)?\s*회/);
  if (year) return { per: 'year', count: parseCount(year[1]) };

  const month = t.match(/(?:매월|월간|월)(?:에|당|마다)?\s*(\d+|한|두|세|네|다섯)?\s*회?/);
  if (month && /월/.test(month[0])) return { per: 'month', count: parseCount(month[1]) };

  const week = t.match(/(?:매주|주간|주)(?:에|당|마다)?\s*(\d+|한|두|세|네|다섯)?\s*회?/);
  if (week && /주/.test(week[0])) return { per: 'week', count: parseCount(week[1]) };

  const day = t.match(/(?:매일|일간|하루)(?:에|당)?\s*(\d+|한|두|세)?\s*회?/);
  if (day) return { per: 'day', count: parseCount(day[1]) };

  return null;
}
