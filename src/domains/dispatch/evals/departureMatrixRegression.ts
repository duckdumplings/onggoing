/**
 * 출발시간×요일 매트릭스 프리셋 해석 회귀 검증.
 *
 * - 평일 프리셋은 평일(월~금), 주말 프리셋은 주말(토/일)로 해석되어야 한다.
 * - 해석된 시각은 모두 기준(now) 이후여야 한다(과거 시각으로 견적 금지).
 * - 기본 프리셋은 4종(평일 한산/출근/퇴근 + 주말 한산).
 */
import {
  DEFAULT_DEPARTURE_PRESETS,
  resolveDeparturePresets,
  assessDeadlineFeasibility,
} from '@/domains/dispatch/utils/departureMatrix';

interface MatrixCase {
  name: string;
  run: () => void;
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function isWeekend(iso: string): boolean {
  const day = new Date(iso).getDay();
  return day === 0 || day === 6;
}

export const DEPARTURE_MATRIX_REGRESSION_CASES: MatrixCase[] = [
  {
    name: '기본 프리셋 4종(평일 한산/출근/퇴근 + 주말 한산)',
    run: () => {
      assert(DEFAULT_DEPARTURE_PRESETS.length === 4, 'presetCount');
      const ids = DEFAULT_DEPARTURE_PRESETS.map((p) => p.id).sort();
      assert(
        JSON.stringify(ids) ===
          JSON.stringify(['weekday-evening', 'weekday-morning', 'weekday-offpeak', 'weekend-offpeak']),
        'presetIds'
      );
    },
  },
  {
    name: '요일유형 일치: 평일 프리셋은 평일, 주말 프리셋은 주말로 해석',
    run: () => {
      // 일요일(2026-05-31 09:00) 기준으로 고정해 결정론적으로 검증.
      const now = new Date('2026-05-31T09:00:00+09:00');
      const resolved = resolveDeparturePresets(DEFAULT_DEPARTURE_PRESETS, now);
      for (const r of resolved) {
        if (r.dayType === 'weekend') assert(isWeekend(r.iso), `weekend:${r.id}`);
        else assert(!isWeekend(r.iso), `weekday:${r.id}`);
        assert(new Date(r.iso).getTime() > now.getTime(), `future:${r.id}`);
      }
    },
  },
  {
    name: '모든 프리셋 시각은 기준(now) 이후',
    run: () => {
      const now = new Date();
      const resolved = resolveDeparturePresets(DEFAULT_DEPARTURE_PRESETS, now);
      for (const r of resolved) {
        assert(new Date(r.iso).getTime() > now.getTime(), `future:${r.id}`);
        assert(typeof r.dateLabel === 'string' && r.dateLabel.length > 0, `label:${r.id}`);
      }
    },
  },
  {
    name: '데드라인 충족: 09:00 출발 + 120분 소요, 마감 15:00 → 충족(여유 240분)',
    run: () => {
      // 로컬 벽시계 09:00 출발(호스트 TZ 무관하게 결정론적). 마감은 로컬 HH:mm로 해석된다.
      const dep = new Date(2026, 5, 1, 9, 0, 0).toISOString();
      const f = assessDeadlineFeasibility(dep, 120, '15:00');
      assert(f !== null, 'notNull');
      assert(f!.arrivalLabel === '11:00', `arrival=${f!.arrivalLabel}`);
      assert(f!.meetsDeadline === true, 'meets');
      assert(f!.slackMinutes === 240, `slack=${f!.slackMinutes}`);
    },
  },
  {
    name: '데드라인 초과: 13:00 출발 + 180분 소요, 마감 15:00 → 미충족(초과 -60분)',
    run: () => {
      const dep = new Date(2026, 5, 1, 13, 0, 0).toISOString();
      const f = assessDeadlineFeasibility(dep, 180, '15:00');
      assert(f !== null, 'notNull');
      assert(f!.arrivalLabel === '16:00', `arrival=${f!.arrivalLabel}`);
      assert(f!.meetsDeadline === false, 'notMeets');
      assert(f!.slackMinutes === -60, `slack=${f!.slackMinutes}`);
    },
  },
  {
    name: '잘못된 데드라인 형식은 null',
    run: () => {
      const dep = new Date(2026, 5, 1, 9, 0, 0).toISOString();
      assert(assessDeadlineFeasibility(dep, 60, '오후 3시') === null, 'badFormat');
      assert(assessDeadlineFeasibility(dep, 60, '25:00') === null, 'badHour');
      assert(assessDeadlineFeasibility('not-a-date', 60, '15:00') === null, 'badDate');
    },
  },
];

export function assertDepartureMatrixRegression() {
  const failures: string[] = [];
  for (const c of DEPARTURE_MATRIX_REGRESSION_CASES) {
    try {
      c.run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`✗ ${c.name}: ${msg}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Departure matrix regression failed:\n${failures.join('\n')}`);
  }
}
