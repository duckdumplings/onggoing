/**
 * 출발 시각(HH:mm) → 실제 계산에 사용할 날짜/시각 해석 유틸.
 *
 * 기존 로직은 출발시간을 입력하면 무조건 "내일"로 앵커링했는데, 이는 사용자 직관과
 * 어긋나 ETA 신뢰도를 떨어뜨렸다(메모 5). 여기서는:
 *   - 입력한 시각이 현재 이후이면 오늘로 둔다.
 *   - 이미 지난 시각이면 다음날로 넘긴다.
 *   - 주말(토/일)은 운영 가정상 다음 평일(월)로 보정한다.
 * 보정 결과는 metadata로 함께 반환하여 UI가 "기준 날짜"를 사용자에게 그대로 노출할 수 있게 한다.
 */

export interface ResolvedDeparture {
  /** "YYYY-MM-DDTHH:mm" 로컬 표현 (datetime-local 호환) */
  isoLocal: string;
  /** ISO 문자열 (UTC). 백엔드 전송/표시에 사용 */
  iso: string;
  /** 해석된 Date 객체 (로컬) */
  date: Date;
  /** 입력 시각이 이미 지나서 다음날로 넘겼는지 */
  rolledToNextDay: boolean;
  /** 주말이라 다음 평일로 보정했는지 */
  adjustedForWeekend: boolean;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * 주말이면 다음 평일(월요일)로 보정. 평일이면 그대로.
 * @returns 보정 발생 여부
 */
function adjustWeekendInPlace(date: Date): boolean {
  const day = date.getDay(); // 0=일, 6=토
  if (day === 0) {
    date.setDate(date.getDate() + 1);
    return true;
  }
  if (day === 6) {
    date.setDate(date.getDate() + 2);
    return true;
  }
  return false;
}

/**
 * HH:mm 입력을 오늘/내일 자동 판정 + 주말 보정하여 해석한다.
 *
 * @param timeHHmm "14:30" 형태
 * @param now 기준 현재 시각 (테스트 주입용; 기본 new Date())
 */
export function resolveDepartureDateTime(timeHHmm: string, now: Date = new Date()): ResolvedDeparture | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeHHmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);

  // 이미 지난 시각이면 다음날로
  let rolledToNextDay = false;
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
    rolledToNextDay = true;
  }

  const adjustedForWeekend = adjustWeekendInPlace(candidate);

  return {
    isoLocal: toIsoLocal(candidate),
    iso: candidate.toISOString(),
    date: candidate,
    rolledToNextDay,
    adjustedForWeekend,
  };
}

/**
 * "5/30(금) 14:30" 형태의 간결한 한국어 라벨.
 */
export function formatDepartureLabel(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${month}/${day}(${weekday}) ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * 기준 날짜가 오늘/내일/그 이후 중 무엇인지 사람이 읽기 쉬운 라벨로.
 */
export function describeRelativeDay(date: Date, now: Date = new Date()): '오늘' | '내일' | '모레' | null {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '내일';
  if (diffDays === 2) return '모레';
  return null;
}
