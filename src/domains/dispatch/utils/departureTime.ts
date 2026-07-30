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
import {
  atKstTime,
  formatKstDateTimeLocal,
  kstCalendarDayNumber,
  kstParts,
  kstWeekday,
} from './kstDateTime';

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

  let candidate = atKstTime(now, timeHHmm);
  if (!candidate) return null;

  // 이미 지난 시각이면 다음날로
  let rolledToNextDay = false;
  if (candidate.getTime() <= now.getTime()) {
    candidate = atKstTime(now, timeHHmm, 1)!;
    rolledToNextDay = true;
  }

  let adjustedForWeekend = false;
  let dayOffset = rolledToNextDay ? 1 : 0;
  while (kstWeekday(candidate) === 0 || kstWeekday(candidate) === 6) {
    dayOffset += 1;
    candidate = atKstTime(now, timeHHmm, dayOffset)!;
    adjustedForWeekend = true;
  }

  return {
    isoLocal: formatKstDateTimeLocal(candidate),
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
  const parts = kstParts(date);
  const weekday = WEEKDAY_LABELS[kstWeekday(date)];
  return `${parts.monthIndex + 1}/${parts.day}(${weekday}) ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/**
 * 기준 날짜가 오늘/내일/그 이후 중 무엇인지 사람이 읽기 쉬운 라벨로.
 */
export function describeRelativeDay(date: Date, now: Date = new Date()): '오늘' | '내일' | '모레' | null {
  const diffDays = kstCalendarDayNumber(date) - kstCalendarDayNumber(now);
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '내일';
  if (diffDays === 2) return '모레';
  return null;
}
