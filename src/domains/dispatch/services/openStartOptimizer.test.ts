import { describe, it, expect } from 'vitest';
import { solveOpenStart, type OpenStartInput } from './openStartOptimizer';
import { OPEN_START_REGRESSION_CASES } from '@/domains/dispatch/evals/openStartRegression';

/** 1차원 위치 → 대칭 시간/거리 행렬 + 하차지 거리 배열. */
function linearInput(positions: number[], destPos: number): OpenStartInput {
  const time = positions.map((pi) => positions.map((pj) => Math.abs(pi - pj)));
  return {
    labels: positions.map((_, i) => `P${i}`),
    time,
    dist: time.map((row) => row.map((v) => v * 1000)),
    toDestTime: positions.map((p) => Math.abs(p - destPos)),
    toDestDist: positions.map((p) => Math.abs(p - destPos) * 1000),
  };
}

describe('openStartOptimizer 회귀 케이스', () => {
  for (const c of OPEN_START_REGRESSION_CASES) {
    it(c.name, () => {
      expect(() => c.run()).not.toThrow();
    });
  }
});

describe('solveOpenStart 기본 불변식', () => {
  it('order[0]는 항상 선택된 출발지와 같다', () => {
    const sol = solveOpenStart(linearInput([5, 40, 15, 0, 25], 50));
    expect(sol.order[0]).toBe(sol.chosenOriginIndex);
  });

  it('제약 미지정이면 feasible=true(기존 동작 보존)', () => {
    const sol = solveOpenStart(linearInput([0, 10, 20], 30));
    expect(sol.feasible).toBe(true);
    expect(sol.infeasibleReason).toBeUndefined();
  });

  it('용량 초과는 infeasible이지만 표시용 경로는 산출한다', () => {
    const base = linearInput([0, 10, 20], 30);
    const over = solveOpenStart({ ...base, constraints: { demands: [100, 100, 100], capacity: 250 } });
    expect(over.feasible).toBe(false);
    expect(over.infeasibleReason).toBeTruthy();
    expect(over.order).toHaveLength(3);
  });
});
