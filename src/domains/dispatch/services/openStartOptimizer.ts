// open-start 경로 솔버: 시작점 자유 / 종착 고정.
// 픽업 N개 중 어디서 출발하든(open-start) 모든 픽업을 거쳐 고정 하차지(dest)에 도달하는
// 최소 비용(이동시간 우선) 경로와 그 시작점을 동시에 산출한다.
//
// 세션 결함("메일 첫 줄을 기계적으로 출발지로 고정 → 번복")을 근본 제거하기 위한 엔진.

const EXACT_LIMIT = 10; // 픽업 N≤10 까지 Held-Karp 정확해, 초과 시 NN+2-opt

export interface OriginRationale {
  chosenIndex: number;
  chosenLabel: string;
  runnerUpIndex: number | null;
  runnerUpLabel: string | null;
  /** runnerUp 총 이동시간 − chosen 총 이동시간 (분, 양수면 chosen이 그만큼 빠름). */
  deltaMin: number;
  /** runnerUp 총 이동거리 − chosen 총 이동거리 (km). */
  deltaKm: number;
}

export interface OpenStartSolution {
  /** 픽업 방문 순서(픽업 인덱스 배열). order[0]가 선택된 출발지. */
  order: number[];
  chosenOriginIndex: number;
  totalTimeSec: number;
  totalDistM: number;
  originRationale: OriginRationale | null;
  method: 'exact' | 'fast';
}

export interface OpenStartInput {
  /** 픽업 라벨(주소 등). length = 픽업 수 n. */
  labels: string[];
  /** time[i][j] = 픽업 i→j 이동시간(초). i===j 는 사용 안 함. */
  time: number[][];
  /** dist[i][j] = 픽업 i→j 이동거리(m). */
  dist: number[][];
  /** toDestTime[i] = 픽업 i→하차지 이동시간(초). */
  toDestTime: number[];
  /** toDestDist[i] = 픽업 i→하차지 이동거리(m). */
  toDestDist: number[];
  /** 'auto'면 N≤10 정확해, 초과 시 fast. */
  mode?: 'exact' | 'fast' | 'auto';
}

function totalDistForOrder(order: number[], input: OpenStartInput): number {
  let d = 0;
  for (let i = 0; i + 1 < order.length; i++) {
    d += input.dist[order[i]][order[i + 1]];
  }
  if (order.length > 0) d += input.toDestDist[order[order.length - 1]];
  return d;
}

function totalTimeForOrder(order: number[], input: OpenStartInput): number {
  let t = 0;
  for (let i = 0; i + 1 < order.length; i++) {
    t += input.time[order[i]][order[i + 1]];
  }
  if (order.length > 0) t += input.toDestTime[order[order.length - 1]];
  return t;
}

/** 시작점 고정 Held-Karp: 모든 픽업을 거쳐 dest 직전까지의 최소 이동시간 경로. */
function heldKarpFixedStart(
  n: number,
  time: number[][],
  toDestTime: number[],
  start: number,
): { total: number; order: number[] } {
  const full = (1 << n) - 1;
  const startMask = 1 << start;
  // dp[mask][i]: start에서 출발해 mask를 방문하고 현재 i에 있을 때 최소 이동시간.
  const dp: number[][] = Array.from({ length: 1 << n }, () => new Array<number>(n).fill(Infinity));
  const parent: number[][] = Array.from({ length: 1 << n }, () => new Array<number>(n).fill(-1));
  dp[startMask][start] = 0;

  for (let mask = 0; mask <= full; mask++) {
    if (!(mask & startMask)) continue;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const cur = dp[mask][i];
      if (cur === Infinity) continue;
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        const nextMask = mask | (1 << j);
        const cand = cur + time[i][j];
        if (cand < dp[nextMask][j]) {
          dp[nextMask][j] = cand;
          parent[nextMask][j] = i;
        }
      }
    }
  }

  let bestEnd = -1;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const cand = dp[full][i] + toDestTime[i];
    if (cand < best) {
      best = cand;
      bestEnd = i;
    }
  }

  // 경로 복원
  const order: number[] = [];
  let mask = full;
  let cur = bestEnd;
  while (cur !== -1) {
    order.push(cur);
    const prev = parent[mask][cur];
    mask &= ~(1 << cur);
    cur = prev;
  }
  order.reverse();
  return { total: best, order };
}

/** NN(시작 고정) → 2-opt 개선. 픽업 순서만 재배열, dest는 항상 마지막 뒤에 붙는다. */
function nnTwoOptFixedStart(
  n: number,
  time: number[][],
  toDestTime: number[],
  start: number,
): { total: number; order: number[] } {
  const visited = new Array<boolean>(n).fill(false);
  const order: number[] = [start];
  visited[start] = true;
  let cur = start;
  for (let step = 1; step < n; step++) {
    let bestJ = -1;
    let bestT = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      if (time[cur][j] < bestT) {
        bestT = time[cur][j];
        bestJ = j;
      }
    }
    if (bestJ === -1) break;
    visited[bestJ] = true;
    order.push(bestJ);
    cur = bestJ;
  }

  const pathTotal = (ord: number[]): number => {
    let t = 0;
    for (let i = 0; i + 1 < ord.length; i++) t += time[ord[i]][ord[i + 1]];
    t += toDestTime[ord[ord.length - 1]];
    return t;
  };

  // 2-opt: start(인덱스 0)는 고정, 나머지 구간만 뒤집기.
  let improved = true;
  let bestTotal = pathTotal(order);
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const candidate = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
        const candTotal = pathTotal(candidate);
        if (candTotal + 1e-6 < bestTotal) {
          for (let x = 0; x < order.length; x++) order[x] = candidate[x];
          bestTotal = candTotal;
          improved = true;
        }
      }
    }
  }

  return { total: bestTotal, order };
}

export function solveOpenStart(input: OpenStartInput): OpenStartSolution {
  const n = input.labels.length;
  const mode = input.mode ?? 'auto';

  if (n === 0) {
    return { order: [], chosenOriginIndex: -1, totalTimeSec: 0, totalDistM: 0, originRationale: null, method: 'exact' };
  }
  if (n === 1) {
    return {
      order: [0],
      chosenOriginIndex: 0,
      totalTimeSec: input.toDestTime[0],
      totalDistM: input.toDestDist[0],
      originRationale: null,
      method: 'exact',
    };
  }

  const useExact = mode === 'exact' || (mode === 'auto' && n <= EXACT_LIMIT);
  const solver = useExact ? heldKarpFixedStart : nnTwoOptFixedStart;
  const method: 'exact' | 'fast' = useExact ? 'exact' : 'fast';

  // 각 시작 후보별 최적 총비용을 구해 최선/차선을 비교(근거 산출).
  const perStart: Array<{ start: number; total: number; order: number[] }> = [];
  for (let s = 0; s < n; s++) {
    const r = solver(n, input.time, input.toDestTime, s);
    perStart.push({ start: s, total: r.total, order: r.order });
  }
  perStart.sort((a, b) => a.total - b.total);

  const winner = perStart[0];
  const runnerUp = perStart.length > 1 ? perStart[1] : null;

  const chosenDist = totalDistForOrder(winner.order, input);
  const rationale: OriginRationale | null = runnerUp
    ? {
        chosenIndex: winner.start,
        chosenLabel: input.labels[winner.start],
        runnerUpIndex: runnerUp.start,
        runnerUpLabel: input.labels[runnerUp.start],
        deltaMin: Math.round((runnerUp.total - winner.total) / 60),
        deltaKm: Math.round((totalDistForOrder(runnerUp.order, input) - chosenDist) / 100) / 10,
      }
    : null;

  return {
    order: winner.order,
    chosenOriginIndex: winner.start,
    totalTimeSec: totalTimeForOrder(winner.order, input),
    totalDistM: chosenDist,
    originRationale: rationale,
    method,
  };
}
