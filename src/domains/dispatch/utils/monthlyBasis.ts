/**
 * 월 고정 견적용 "실제 달력 기준" 영업일 산정.
 *
 * 월 환산을 LLM 암산("주6회×4주=24회")에 맡기지 않고, 대상 월의 실제 달력 + 라인별 운행 요일 +
 * 공휴일 포함 여부로 결정론적으로 운행 횟수를 센다. 주말 포함 여부는 operatingWeekdays에 토(6)/일(0)을
 * 넣는지로 표현한다. 공휴일 포함 여부는 includeHolidays로 토글한다.
 *
 * 요일 규약: JS getUTCDay() — 0=일, 1=월, ... 6=토. (KST 날짜 기준 계산을 위해 UTC+9 보정 후 getUTC* 사용)
 */

/**
 * 대한민국 관공서 공휴일(대체공휴일 포함). 2026년 확정분.
 * 출처: 한국천문연구원 2026 월력요항 / 관공서의 공휴일에 관한 규정(2026.05.11 개정, 노동절·제헌절 추가).
 * 운영팀이 임시공휴일/연도 추가 시 여기서 갱신한다(단일 진실원).
 */
export const KR_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-01': '노동절',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '제9회 전국동시지방선거',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '기독탄신일',
};

export function isHoliday(isoDate: string): boolean {
  return isoDate in KR_HOLIDAYS;
}

export interface OperatingPattern {
  /** 운행 요일(0=일 ... 6=토). 예: 월~토 = [1,2,3,4,5,6], 월~금 = [1,2,3,4,5], 월요일만 = [1]. */
  weekdays: number[];
  /** 공휴일에도 운행하면 true(공휴일 포함). false면 운행 요일이어도 공휴일은 제외. */
  includeHolidays: boolean;
}

export interface MonthOperatingCount {
  /** "YYYY-MM" */
  month: string;
  /** 운행 일수(= 그 달 운행 횟수). */
  operatingDays: number;
  /** 운행 요일이지만 공휴일이라 제외된 날 수(includeHolidays=false일 때만 >0). */
  excludedHolidays: number;
  /** 운행 날짜 목록("YYYY-MM-DD"). */
  dates: string[];
}

export interface AverageMonthlyOperatingCount {
  /** 월 평균 환산 기준. */
  month: 'average';
  /** 주당 운행 요일 × 52.142857주 / 12개월. */
  operatingDays: number;
  excludedHolidays: 0;
  dates: [];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM" → {year, month0(0-based)} */
function parseYearMonth(yearMonth: string): { year: number; month0: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month1 = Number(m[2]);
  if (month1 < 1 || month1 > 12) return null;
  return { year, month0: month1 - 1 };
}

/** 대상 월의 운행 일수를 실제 달력으로 센다. */
export function countOperatingDays(yearMonth: string, pattern: OperatingPattern): MonthOperatingCount {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) {
    return { month: yearMonth, operatingDays: 0, excludedHolidays: 0, dates: [] };
  }
  const { year, month0 } = parsed;
  const weekdaySet = new Set(pattern.weekdays);
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

  const dates: string[] = [];
  let excludedHolidays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month0, day));
    const dow = d.getUTCDay();
    if (!weekdaySet.has(dow)) continue;
    const iso = `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
    if (!pattern.includeHolidays && isHoliday(iso)) {
      excludedHolidays += 1;
      continue;
    }
    dates.push(iso);
  }
  return { month: yearMonth, operatingDays: dates.length, excludedHolidays, dates };
}

/** 특정 월이 아니라 연간 평균 주수(365/7/12)로 월 평균 운행 횟수를 환산한다. */
export function countAverageMonthlyOperatingDays(pattern: OperatingPattern): AverageMonthlyOperatingCount {
  const weeklyRuns = new Set(pattern.weekdays).size;
  const operatingDays = Math.round(weeklyRuns * (365 / 7 / 12) * 100) / 100;
  return { month: 'average', operatingDays, excludedHolidays: 0, dates: [] };
}

/** targetMonth부터 연속 N개월의 "YYYY-MM" 목록. 계약 기간(실제 월별 영업일 상이) 합산용. */
export function consecutiveMonths(startYearMonth: string, count: number): string[] {
  const parsed = parseYearMonth(startYearMonth);
  if (!parsed || count <= 0) return [];
  const out: string[] = [];
  let { year, month0 } = parsed;
  for (let i = 0; i < count; i++) {
    out.push(`${year}-${pad2(month0 + 1)}`);
    month0 += 1;
    if (month0 > 11) {
      month0 = 0;
      year += 1;
    }
  }
  return out;
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

/** 운행 요일 배열을 사람이 읽는 라벨로. 예: [1,2,3,4,5,6] → "월~토". */
export function describeWeekdays(weekdays: number[]): string {
  const uniq = Array.from(new Set(weekdays)).sort((a, b) => a - b);
  if (uniq.length === 0) return '운행 없음';
  // 연속 구간이면 "월~토"처럼, 아니면 개별 나열.
  const isContiguous = uniq.every((v, i) => i === 0 || v === uniq[i - 1] + 1);
  if (uniq.length >= 3 && isContiguous) {
    return `${WEEKDAY_LABEL[uniq[0]]}~${WEEKDAY_LABEL[uniq[uniq.length - 1]]}`;
  }
  return uniq.map((d) => WEEKDAY_LABEL[d]).join('·');
}
