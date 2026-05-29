/**
 * 출발시간×요일 견적 매트릭스용 프리셋 시각 생성.
 *
 * 옹고잉 요금엔 심야·주말 할증이 없지만, 시간당 요금제는 "소요시간"으로 과금되므로
 * 출발시간/요일에 따른 교통량 차이가 견적을 바꾼다(세션 인사이트). 본 유틸은
 * 평일/주말 × 한산/출근/퇴근 프리셋의 실제 미래 ISO 시각을 만든다. 생성된 시각은
 * roadOption='time-first'로 route-optimization에 넘기면 Tmap 예측(prediction)에서
 * 요일/시간대별 소요시간을 반영한다.
 */

export type DepartureDayType = 'weekday' | 'weekend';

export interface DeparturePreset {
  id: string;
  /** 사람이 읽는 라벨. 예: "평일 출근(혼잡)". */
  label: string;
  dayType: DepartureDayType;
  hour: number;
  minute: number;
  /** 교통 상황 라벨. 예: "한산" / "출근 혼잡". */
  trafficLabel: string;
}

export interface ResolvedDeparturePreset extends DeparturePreset {
  /** ISO 문자열(UTC). route-optimization departureAt에 사용. */
  iso: string;
  /** "6/1(월) 10:00" 형태의 기준 일시 라벨. */
  dateLabel: string;
}

/** 기본 프리셋: 평일 한산/출근/퇴근 + 주말 한산. */
export const DEFAULT_DEPARTURE_PRESETS: DeparturePreset[] = [
  { id: 'weekday-offpeak', label: '평일 오전(한산)', dayType: 'weekday', hour: 10, minute: 0, trafficLabel: '한산' },
  { id: 'weekday-morning', label: '평일 출근(혼잡)', dayType: 'weekday', hour: 8, minute: 0, trafficLabel: '출근 혼잡' },
  { id: 'weekday-evening', label: '평일 퇴근(혼잡)', dayType: 'weekday', hour: 18, minute: 0, trafficLabel: '퇴근 혼잡' },
  { id: 'weekend-offpeak', label: '주말 오전(한산)', dayType: 'weekend', hour: 10, minute: 0, trafficLabel: '매우 한산' },
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** now 이후, 지정 요일유형·시각의 가장 가까운 날짜를 만든다. */
function nextOccurrence(now: Date, dayType: DepartureDayType, hour: number, minute: number): Date {
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);
  // 최대 14일 내에서 조건(요일유형 + now 초과)을 만족하는 첫 날을 찾는다.
  for (let i = 0; i < 14; i++) {
    const matchesDayType = dayType === 'weekend' ? isWeekend(candidate) : !isWeekend(candidate);
    if (matchesDayType && candidate.getTime() > now.getTime()) return candidate;
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(hour, minute, 0, 0);
  }
  return candidate;
}

function formatDateLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAY_LABELS[date.getDay()]}) ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 프리셋 목록을 실제 미래 ISO 시각으로 해석한다. */
export function resolveDeparturePresets(
  presets: DeparturePreset[] = DEFAULT_DEPARTURE_PRESETS,
  now: Date = new Date()
): ResolvedDeparturePreset[] {
  return presets.map((p) => {
    const date = nextOccurrence(now, p.dayType, p.hour, p.minute);
    return { ...p, iso: date.toISOString(), dateLabel: formatDateLabel(date) };
  });
}

/** 도착 데드라인 충족 여부 판정 결과. */
export interface DeadlineFeasibility {
  /** 예상 도착 ISO(출발 + 총 소요시간). */
  arrivalIso: string;
  /** "HH:mm" 도착 라벨. */
  arrivalLabel: string;
  /** 데드라인 충족 여부. */
  meetsDeadline: boolean;
  /** 데드라인까지 남는(+)/초과(-) 분. */
  slackMinutes: number;
}

/**
 * 출발 ISO + 총 소요시간(분) + 도착 데드라인("HH:mm")으로 도착 가능성을 판정한다.
 * 데드라인은 출발 날짜와 동일 일자의 해당 시각으로 해석한다(익일 데드라인은 미지원, null 반환).
 *
 * @returns 데드라인 형식이 잘못되면 null
 */
export function assessDeadlineFeasibility(
  departureIso: string,
  totalMinutes: number,
  deadlineHHmm: string
): DeadlineFeasibility | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(deadlineHHmm).trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  const departure = new Date(departureIso);
  if (Number.isNaN(departure.getTime())) return null;

  const arrival = new Date(departure.getTime() + Math.max(0, totalMinutes) * 60_000);
  const deadline = new Date(departure);
  deadline.setHours(h, m, 0, 0);

  const slackMinutes = Math.round((deadline.getTime() - arrival.getTime()) / 60_000);
  return {
    arrivalIso: arrival.toISOString(),
    arrivalLabel: `${pad2(arrival.getHours())}:${pad2(arrival.getMinutes())}`,
    meetsDeadline: slackMinutes >= 0,
    slackMinutes,
  };
}
