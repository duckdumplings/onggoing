/**
 * 출발 시각 해석(resolveDepartureDateTime) 회귀 검증.
 *
 * P2 (출발시간 today/tomorrow 자동 판정) 핵심 로직을 고정한다.
 * "now"를 명시적으로 주입해 결정적으로 검증한다.
 */
import {
  describeRelativeDay,
  formatDepartureLabel,
  resolveDepartureDateTime,
} from '@/domains/dispatch/utils/departureTime';

interface DepartureCase {
  name: string;
  run: () => void;
}

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(label);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`[${label}] expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// 기준 현재 시각: 2026-05-29(금) 10:00 (로컬)
const FRIDAY_10AM = new Date(2026, 4, 29, 10, 0, 0, 0);

export const DEPARTURE_TIME_REGRESSION_CASES: DepartureCase[] = [
  {
    name: '미래 시각(오늘 14:30)은 오늘로 유지',
    run: () => {
      const r = resolveDepartureDateTime('14:30', FRIDAY_10AM);
      assert(r !== null, 'should resolve');
      assertEqual(r!.date.getDate(), 29, 'day');
      assertEqual(r!.rolledToNextDay, false, 'rolledToNextDay');
      assertEqual(r!.adjustedForWeekend, false, 'adjustedForWeekend');
      assertEqual(describeRelativeDay(r!.date, FRIDAY_10AM), '오늘', 'relativeDay');
    },
  },
  {
    name: '이미 지난 시각(오늘 09:00)은 다음날로 → 토요일이므로 주말 보정으로 월요일',
    run: () => {
      const r = resolveDepartureDateTime('09:00', FRIDAY_10AM);
      assert(r !== null, 'should resolve');
      // 금요일 09:00은 지났으므로 토요일(30일)로 → 주말 보정 → 월요일(6/1)
      assertEqual(r!.rolledToNextDay, true, 'rolledToNextDay');
      assertEqual(r!.adjustedForWeekend, true, 'adjustedForWeekend');
      assertEqual(r!.date.getMonth(), 5, 'month(6월=5)');
      assertEqual(r!.date.getDate(), 1, 'day(1일)');
      assertEqual(r!.date.getDay(), 1, 'weekday(월=1)');
    },
  },
  {
    name: '정확히 현재 시각이면 다음날로 롤오버',
    run: () => {
      const r = resolveDepartureDateTime('10:00', FRIDAY_10AM);
      assert(r !== null, 'should resolve');
      assertEqual(r!.rolledToNextDay, true, 'rolledToNextDay');
    },
  },
  {
    name: '평일 미래 시각은 주말 보정 없음 (월요일 기준 화요일 검증)',
    run: () => {
      const monday = new Date(2026, 5, 1, 8, 0, 0, 0); // 2026-06-01(월) 08:00
      const r = resolveDepartureDateTime('09:00', monday);
      assert(r !== null, 'should resolve');
      assertEqual(r!.rolledToNextDay, false, 'rolledToNextDay');
      assertEqual(r!.adjustedForWeekend, false, 'adjustedForWeekend');
      assertEqual(r!.date.getDate(), 1, 'day stays monday');
    },
  },
  {
    name: '토요일 기준 미래 시각도 월요일로 보정',
    run: () => {
      const saturday = new Date(2026, 4, 30, 8, 0, 0, 0); // 2026-05-30(토) 08:00
      const r = resolveDepartureDateTime('14:00', saturday);
      assert(r !== null, 'should resolve');
      // 오늘(토) 14:00은 미래지만 주말이라 월요일(6/1)로
      assertEqual(r!.rolledToNextDay, false, 'rolledToNextDay');
      assertEqual(r!.adjustedForWeekend, true, 'adjustedForWeekend');
      assertEqual(r!.date.getDate(), 1, 'day(월 1일)');
      assertEqual(r!.date.getDay(), 1, 'weekday(월)');
    },
  },
  {
    name: 'isoLocal 포맷이 datetime-local 호환',
    run: () => {
      const r = resolveDepartureDateTime('14:30', FRIDAY_10AM);
      assert(r !== null, 'should resolve');
      assertEqual(r!.isoLocal, '2026-05-29T14:30', 'isoLocal');
    },
  },
  {
    name: '잘못된 입력은 null',
    run: () => {
      assertEqual(resolveDepartureDateTime('', FRIDAY_10AM), null, 'empty');
      assertEqual(resolveDepartureDateTime('25:00', FRIDAY_10AM), null, 'invalid hour');
      assertEqual(resolveDepartureDateTime('abc', FRIDAY_10AM), null, 'non-numeric');
    },
  },
  {
    name: 'formatDepartureLabel 한국어 라벨',
    run: () => {
      const label = formatDepartureLabel(new Date(2026, 4, 29, 14, 30, 0, 0));
      assertEqual(label, '5/29(금) 14:30', 'label');
    },
  },
];

export function assertDepartureTimeRegression() {
  const failures: string[] = [];
  for (const c of DEPARTURE_TIME_REGRESSION_CASES) {
    try {
      c.run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`✗ ${c.name}: ${msg}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Departure time regression failed:\n${failures.join('\n')}`);
  }
}
