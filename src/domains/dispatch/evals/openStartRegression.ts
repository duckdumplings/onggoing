/**
 * open-start 솔버 회귀 검증.
 *
 * - 비대칭 행렬에서 Held-Karp 정확해는 NN+2-opt 폴백보다 같거나 우수해야 한다.
 * - "한쪽 끝에서 출발해 하차지 방향으로 쓸어담는" 배치에서 올바른 시작점을 선택해야 한다.
 * - order는 모든 픽업의 유효 순열이고 order[0]가 chosenOriginIndex와 일치해야 한다.
 * - 시작점이 메일 첫 줄(인덱스 0)로 고정되지 않음을 확인(세션 결함 회귀 방지).
 */
import { solveOpenStart, type OpenStartInput } from '@/domains/dispatch/services/openStartOptimizer';

interface OpenStartCase {
  name: string;
  run: () => void;
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

/** 1차원 위치로부터 대칭 시간/거리 행렬과 하차지 거리 배열을 만든다. */
function linearInput(positions: number[], destPos: number): OpenStartInput {
  const n = positions.length;
  const time = positions.map((pi) => positions.map((pj) => Math.abs(pi - pj)));
  return {
    labels: positions.map((_, i) => `P${i}`),
    time,
    dist: time.map((row) => row.map((v) => v * 1000)),
    toDestTime: positions.map((p) => Math.abs(p - destPos)),
    toDestDist: positions.map((p) => Math.abs(p - destPos) * 1000),
  };
}

function isPermutation(order: number[], n: number): boolean {
  if (order.length !== n) return false;
  const seen = new Set(order);
  if (seen.size !== n) return false;
  for (let i = 0; i < n; i++) if (!seen.has(i)) return false;
  return true;
}

export const OPEN_START_REGRESSION_CASES: OpenStartCase[] = [
  {
    name: '선형 배치: 하차지 반대편 끝에서 출발(쓸어담기)',
    // P0..P2 = 0,10,20 / 하차지 30. 최적은 P0에서 출발해 30 방향으로.
    run: () => {
      const input = linearInput([0, 10, 20], 30);
      const sol = solveOpenStart(input);
      assert(sol.chosenOriginIndex === 0, `chosenOrigin=${sol.chosenOriginIndex}`);
      assert(JSON.stringify(sol.order) === JSON.stringify([0, 1, 2]), `order=${sol.order}`);
      assert(sol.totalTimeSec === 30, `total=${sol.totalTimeSec}`);
    },
  },
  {
    name: '시작점이 메일 첫 줄(인덱스 0)로 고정되지 않음',
    // P0가 하차지에 가장 가깝게 배치 → 시작점은 P0가 아니어야 한다.
    run: () => {
      const input = linearInput([30, 20, 10, 0], 35); // 하차지 35, P0=30(가까움), P3=0(멈)
      const sol = solveOpenStart(input);
      assert(sol.chosenOriginIndex !== 0, `시작점이 0으로 고정됨(${sol.chosenOriginIndex})`);
      assert(sol.chosenOriginIndex === 3, `expected start P3, got ${sol.chosenOriginIndex}`);
    },
  },
  {
    name: 'startEligibleCount: 비후보(배송지/반납지)는 출발지로 선택되지 않음',
    // P0..P3 = 30,20,10,0 / 하차지 35. 비용만 보면 P3(0)이 최적 출발지지만,
    // startEligibleCount=2로 픽업(P0,P1)만 출발 후보로 제한하면 그 안에서만 골라야 한다.
    run: () => {
      const input = linearInput([30, 20, 10, 0], 35);
      const restricted = solveOpenStart({ ...input, startEligibleCount: 2 });
      assert(
        restricted.chosenOriginIndex < 2,
        `eligible 밖에서 출발지 선택됨(${restricted.chosenOriginIndex})`
      );
      assert(isPermutation(restricted.order, 4), `not permutation: ${restricted.order}`);
      assert(restricted.order[0] === restricted.chosenOriginIndex, 'order[0]!=chosen');
      // 제한이 없으면 P3가 선택되던 케이스와 대비된다.
      const unrestricted = solveOpenStart(input);
      assert(unrestricted.chosenOriginIndex === 3, `대조군 기대 P3, got ${unrestricted.chosenOriginIndex}`);
    },
  },
  {
    name: 'order는 유효 순열이고 order[0]===chosenOriginIndex',
    run: () => {
      const input = linearInput([5, 40, 15, 0, 25], 50);
      const sol = solveOpenStart(input);
      assert(isPermutation(sol.order, 5), `not permutation: ${sol.order}`);
      assert(sol.order[0] === sol.chosenOriginIndex, `order[0]!=chosen`);
    },
  },
  {
    name: '비대칭 행렬에서 정확해 ≤ fast 폴백',
    run: () => {
      // 비대칭(교통 방향성 모사) 행렬.
      const time = [
        [0, 1, 9, 8],
        [9, 0, 1, 9],
        [8, 9, 0, 1],
        [1, 8, 9, 0],
      ];
      const input: OpenStartInput = {
        labels: ['A', 'B', 'C', 'D'],
        time,
        dist: time.map((r) => r.map((v) => v * 1000)),
        toDestTime: [5, 5, 5, 5],
        toDestDist: [5000, 5000, 5000, 5000],
      };
      const exact = solveOpenStart({ ...input, mode: 'exact' });
      const fast = solveOpenStart({ ...input, mode: 'fast' });
      assert(exact.method === 'exact' && fast.method === 'fast', 'method tags');
      assert(exact.totalTimeSec <= fast.totalTimeSec, `exact ${exact.totalTimeSec} > fast ${fast.totalTimeSec}`);
    },
  },
  {
    name: '근거(originRationale): 차선 대비 절감이 음수가 아님',
    run: () => {
      const input = linearInput([0, 10, 20], 30);
      const sol = solveOpenStart(input);
      assert(sol.originRationale != null, 'rationale null');
      assert((sol.originRationale?.deltaMin ?? -1) >= 0, `deltaMin<0`);
      assert(Boolean(sol.originRationale?.runnerUpLabel), 'no runnerUp');
    },
  },
  {
    name: '단일 픽업: 근거 없음, 그대로 하차지로',
    run: () => {
      const input = linearInput([0], 30);
      const sol = solveOpenStart(input);
      assert(sol.chosenOriginIndex === 0, 'single start');
      assert(sol.originRationale === null, 'single rationale should be null');
      assert(sol.totalTimeSec === 30, `single total=${sol.totalTimeSec}`);
    },
  },
  {
    name: '제약 미지정: feasible=true(기존 동작 보존)',
    run: () => {
      const input = linearInput([0, 10, 20], 30);
      const sol = solveOpenStart(input);
      assert(sol.feasible === true, 'feasible should default true');
      assert(sol.infeasibleReason === undefined, 'no reason when feasible');
    },
  },
  {
    name: '용량: 총 적재 ≤ 한도면 feasible, 초과면 infeasible',
    run: () => {
      const base = linearInput([0, 10, 20], 30);
      const ok = solveOpenStart({ ...base, constraints: { demands: [100, 100, 100], capacity: 400 } });
      assert(ok.feasible === true, `용량 여유인데 infeasible: ${ok.infeasibleReason}`);
      // 동일 demands여도 한도 미달이면 위반 + 경로는 표시용으로 그대로 산출.
      const over = solveOpenStart({ ...base, constraints: { demands: [100, 100, 100], capacity: 250 } });
      assert(over.feasible === false, '용량 초과인데 feasible');
      assert(Boolean(over.infeasibleReason), '용량 초과 사유 없음');
      assert(isPermutation(over.order, 3), `용량초과 표시용 경로 누락: ${over.order}`);
    },
  },
  {
    name: '시간창: 위반 순서는 배제하고 만족하는 순서를 고른다',
    run: () => {
      // P0..P2 = 0,10,20 / 하차지 30. 시간창 없으면 시작 P0(쓸어담기).
      // P2에 "도착 5초 이내" 빡센 창을 주면 P0 출발(P2 도착=20초)은 위반 → P2에서 시작해야 함.
      const base = linearInput([0, 10, 20], 30);
      const tw = solveOpenStart({
        ...base,
        constraints: { windows: [null, null, { latestSec: 5 }] },
      });
      assert(tw.feasible === true, `시간창 만족 해가 있어야 함: ${tw.infeasibleReason}`);
      assert(tw.chosenOriginIndex === 2, `시간창 위반 회피 실패, start=${tw.chosenOriginIndex}`);
      assert(tw.order[0] === tw.chosenOriginIndex, 'order[0]!=chosen');
    },
  },
  {
    name: '시간창: 어떤 순서로도 만족 불가면 infeasible + 표시용 경로',
    run: () => {
      // 모든 픽업에 "도착 0초" 창을 주면(시작점만 0초 가능) 불가능.
      const base = linearInput([0, 10, 20], 30);
      const infeasible = solveOpenStart({
        ...base,
        constraints: { windows: [{ latestSec: 0 }, { latestSec: 0 }, { latestSec: 0 }] },
      });
      assert(infeasible.feasible === false, '불가능한 시간창인데 feasible');
      assert(Boolean(infeasible.infeasibleReason), '시간창 위반 사유 없음');
      assert(isPermutation(infeasible.order, 3), `표시용 폴백 경로 누락: ${infeasible.order}`);
    },
  },
];

export function assertOpenStartRegression() {
  const failures: string[] = [];
  for (const c of OPEN_START_REGRESSION_CASES) {
    try {
      c.run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`✗ ${c.name}: ${msg}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Open-start regression failed:\n${failures.join('\n')}`);
  }
}
