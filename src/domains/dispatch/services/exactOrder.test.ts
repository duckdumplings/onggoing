import { describe, it, expect } from 'vitest';
import { solveExactOrder, EXACT_ORDER_MAX_STOPS, type ExactOrderInput } from './exactOrder';

/** 주어진 순서의 총 이동시간(0=출발 → order → 마지막). */
function score(time: number[][], order: number[]): number {
  let t = 0;
  let cur = 0;
  for (const nxt of order) {
    t += time[cur][nxt];
    cur = nxt;
  }
  return t;
}

/** 브루트포스 최적(작은 n): stopIndices의 모든 순열 중 최소. precedence/fixedFinal 반영. */
function bruteForce(input: ExactOrderInput): { order: number[]; total: number } {
  const { time, stopIndices, pickupIndices, precedence, fixedFinalIndex } = input;
  const pickup = new Set(pickupIndices);
  let best: number[] = [];
  let bestT = Infinity;
  const permute = (arr: number[], acc: number[]) => {
    if (arr.length === 0) {
      if (fixedFinalIndex != null && acc[acc.length - 1] !== fixedFinalIndex) return;
      if (precedence) {
        // 모든 픽업이 첫 비픽업보다 앞에 와야 함
        let seenNonPickup = false;
        for (const g of acc) {
          if (pickup.has(g)) {
            if (seenNonPickup) return; // 픽업이 비픽업 뒤에 → 위반
          } else {
            seenNonPickup = true;
          }
        }
      }
      const t = score(time, acc);
      if (t < bestT) { bestT = t; best = [...acc]; }
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const next = arr[i];
      permute([...arr.slice(0, i), ...arr.slice(i + 1)], [...acc, next]);
    }
  };
  permute(stopIndices, []);
  return { order: best, total: bestT };
}

describe('solveExactOrder — 정확해 순서 솔버', () => {
  it('n=0/n=1 경계', () => {
    expect(solveExactOrder({ time: [[0]], stopIndices: [], pickupIndices: [], precedence: false, fixedFinalIndex: null }).order).toEqual([]);
    const one = solveExactOrder({ time: [[0, 5], [5, 0]], stopIndices: [1], pickupIndices: [], precedence: false, fixedFinalIndex: null });
    expect(one.order).toEqual([1]);
    expect(one.totalTimeSec).toBe(5);
  });

  it('Held-Karp 한도 초과 시 skipped=true', () => {
    const n = EXACT_ORDER_MAX_STOPS + 1;
    const size = n + 1;
    const time = Array.from({ length: size }, () => new Array(size).fill(1));
    const res = solveExactOrder({
      time,
      stopIndices: Array.from({ length: n }, (_, i) => i + 1),
      pickupIndices: [],
      precedence: false,
      fixedFinalIndex: null,
    });
    expect(res.skipped).toBe(true);
    expect(res.order).toEqual([]);
  });

  it('비대칭 행렬에서 브루트포스 최적과 일치(precedence 없음)', () => {
    // 방향성 있는 4지점 비대칭 시간(0=출발). 최적은 브루트포스로 검증.
    const time = [
      [0, 3, 9, 8, 7],
      [3, 0, 2, 9, 6],
      [9, 2, 0, 1, 8],
      [8, 9, 1, 0, 2],
      [7, 6, 8, 2, 0],
    ];
    const input: ExactOrderInput = { time, stopIndices: [1, 2, 3, 4], pickupIndices: [], precedence: false, fixedFinalIndex: null };
    const exact = solveExactOrder(input);
    const bf = bruteForce(input);
    expect(exact.totalTimeSec).toBe(bf.total);
    expect(score(time, exact.order)).toBe(bf.total);
    // 유효 순열
    expect([...exact.order].sort()).toEqual([1, 2, 3, 4]);
  });

  it('precedence: 모든 픽업이 비픽업보다 먼저 (브루트포스 대조)', () => {
    // 픽업(1)이 출발지에서 멀지만, 상차 전 배송 금지라 반드시 먼저.
    const time = [
      [0, 20, 3, 4],
      [20, 0, 5, 6],
      [3, 5, 0, 2],
      [4, 6, 2, 0],
    ];
    const input: ExactOrderInput = { time, stopIndices: [1, 2, 3], pickupIndices: [1], precedence: true, fixedFinalIndex: null };
    const exact = solveExactOrder(input);
    const bf = bruteForce(input);
    expect(exact.totalTimeSec).toBe(bf.total);
    // 픽업(1)이 첫 번째여야 함(유일 픽업)
    expect(exact.order[0]).toBe(1);
  });

  it('fixedFinalIndex: 지정 지점이 마지막', () => {
    const time = [
      [0, 3, 9, 8, 7],
      [3, 0, 2, 9, 6],
      [9, 2, 0, 1, 8],
      [8, 9, 1, 0, 2],
      [7, 6, 8, 2, 0],
    ];
    const input: ExactOrderInput = { time, stopIndices: [1, 2, 3, 4], pickupIndices: [], precedence: false, fixedFinalIndex: 2 };
    const exact = solveExactOrder(input);
    expect(exact.order[exact.order.length - 1]).toBe(2);
    const bf = bruteForce(input);
    expect(exact.totalTimeSec).toBe(bf.total);
  });

  it('정확해는 어떤 순열보다 나쁘지 않다(불변식)', () => {
    const time = [
      [0, 5, 7, 12, 3, 9],
      [5, 0, 4, 8, 6, 2],
      [7, 4, 0, 3, 9, 5],
      [12, 8, 3, 0, 7, 4],
      [3, 6, 9, 7, 0, 8],
      [9, 2, 5, 4, 8, 0],
    ];
    const input: ExactOrderInput = { time, stopIndices: [1, 2, 3, 4, 5], pickupIndices: [], precedence: false, fixedFinalIndex: null };
    const exact = solveExactOrder(input);
    const bf = bruteForce(input);
    expect(exact.totalTimeSec).toBe(bf.total);
    expect(exact.totalTimeSec).toBeLessThanOrEqual(score(time, [1, 2, 3, 4, 5]));
  });
});
