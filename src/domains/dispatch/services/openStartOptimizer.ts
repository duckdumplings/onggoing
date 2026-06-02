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
  /** 제약(시간창/용량)을 만족하는 해가 있으면 true. 제약 미사용 시 항상 true. */
  feasible: boolean;
  /** feasible=false일 때 어떤 제약이 막혔는지(사용자 안내용). */
  infeasibleReason?: string;
}

/**
 * 제약조건(시간창/용량) — 모두 optional. 미지정 시 솔버는 기존(이동시간 최소)과 동일하게 동작한다.
 *
 * 시간창은 "출발(t=0) 기준 각 픽업 도착 허용 구간(초)"이다. earliest 이전 도착은 대기로 흡수하고,
 * latest 초과 도착은 위반(infeasible)이다. serviceTimeSec는 각 픽업의 작업(체류)시간으로,
 * 다음 지점 도착시각 누적에 더해진다.
 *
 * 용량은 픽업 적재량(demands) 누적이 capacity를 넘으면 위반이다. 현재 open-start 패턴은
 * "픽업 N → 단일 하차"라 적재가 단조 증가하므로 사실상 총 demand ≤ capacity와 같지만,
 * 일반형(경로 중 하차로 적재 변동)에도 대비해 전이마다 검사한다.
 */
export interface OpenStartConstraints {
  /** demands[i] = 픽업 i 적재량(kg 등). 미지정 시 0. */
  demands?: number[];
  /** 차량 적재 한도. 미지정 시 무제한. */
  capacity?: number;
  /** windows[i] = 픽업 i 도착 허용 구간(출발 기준 초). null/미지정이면 무제약. */
  windows?: Array<{ earliestSec?: number; latestSec?: number } | null>;
  /** serviceTimeSec[i] = 픽업 i 작업(체류)시간 초. 미지정 시 0. */
  serviceTimeSec?: number[];
  /** 하차지 도착 허용 구간(출발 기준 초). 미지정 시 무제약. */
  destWindow?: { earliestSec?: number; latestSec?: number } | null;
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
  /**
   * 시작점으로 선택 가능한 후보 수(앞에서부터 N개). 미지정 시 전체.
   * 픽업만 출발지가 될 수 있도록 제한할 때 사용한다(배송지/반납지가 출발지로 뽑히는 것 방지).
   * 시작 후보가 아닌 지점도 경로상에서는 모두 방문된다(순서만 솔버가 최적화).
   */
  startEligibleCount?: number;
  /** 시간창/용량 제약(optional). 미지정 시 기존 이동시간-최소 동작과 동일. */
  constraints?: OpenStartConstraints;
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

/** 시간창 컨텍스트(솔버 내부 전달용). null이면 시간창 미적용(기존 이동시간 최소). */
type TimeWindowCtx = {
  /** service[i] = 픽업 i 작업시간 초. */
  service: number[];
  /** windows[i] = 픽업 i 도착 허용 구간(출발 기준 초). */
  windows: Array<{ earliestSec?: number; latestSec?: number } | null>;
  /** 하차지 도착 허용 구간. */
  destWindow: { earliestSec?: number; latestSec?: number } | null;
} | null;

/** earliest 이전 도착은 대기로 흡수(도착시각을 earliest로 올림). */
function clampEarliest(t: number, w?: { earliestSec?: number; latestSec?: number } | null): number {
  return w?.earliestSec != null && t < w.earliestSec ? w.earliestSec : t;
}

/** latest 초과 도착이면 위반(true). */
function violatesLatest(t: number, w?: { earliestSec?: number; latestSec?: number } | null): boolean {
  return w?.latestSec != null && t > w.latestSec;
}

/**
 * 시작점 고정 Held-Karp: 모든 픽업을 거쳐 dest 직전까지의 최소 이동시간 경로.
 * tw가 주어지면 dp는 "최소 도착시각"(대기·작업시간 포함)을 추적하고 시간창 위반을 가지치기한다.
 * tw가 없으면 dp는 곧 누적 이동시간과 같아 기존 동작과 동일하다.
 */
function heldKarpFixedStart(
  n: number,
  time: number[][],
  toDestTime: number[],
  start: number,
  tw: TimeWindowCtx,
): { total: number; order: number[] } {
  const full = (1 << n) - 1;
  const startMask = 1 << start;
  // dp[mask][i]: start에서 출발해 mask를 방문하고 현재 i에 있을 때 최소 이동시간(tw 있으면 최소 도착시각).
  const dp: number[][] = Array.from({ length: 1 << n }, () => new Array<number>(n).fill(Infinity));
  const parent: number[][] = Array.from({ length: 1 << n }, () => new Array<number>(n).fill(-1));

  const startArr = tw ? clampEarliest(0, tw.windows[start]) : 0;
  if (tw && violatesLatest(startArr, tw.windows[start])) return { total: Infinity, order: [] };
  dp[startMask][start] = startArr;

  for (let mask = 0; mask <= full; mask++) {
    if (!(mask & startMask)) continue;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const cur = dp[mask][i];
      if (cur === Infinity) continue;
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        const nextMask = mask | (1 << j);
        let cand = cur + (tw ? tw.service[i] : 0) + time[i][j];
        if (tw) {
          cand = clampEarliest(cand, tw.windows[j]);
          if (violatesLatest(cand, tw.windows[j])) continue;
        }
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
    if (dp[full][i] === Infinity) continue;
    let cand = dp[full][i] + (tw ? tw.service[i] : 0) + toDestTime[i];
    if (tw) {
      cand = clampEarliest(cand, tw.destWindow);
      if (violatesLatest(cand, tw.destWindow)) continue;
    }
    if (cand < best) {
      best = cand;
      bestEnd = i;
    }
  }
  if (bestEnd === -1) return { total: Infinity, order: [] };

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

/**
 * NN(시작 고정) → 2-opt 개선. 픽업 순서만 재배열, dest는 항상 마지막 뒤에 붙는다.
 * tw가 주어지면 pathTotal은 도착시각(대기·작업 포함)을 누적하며 시간창 위반 시 Infinity를 반환한다.
 */
function nnTwoOptFixedStart(
  n: number,
  time: number[][],
  toDestTime: number[],
  start: number,
  tw: TimeWindowCtx,
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
    // tw 없으면 누적 이동시간(기존). tw 있으면 도착시각(대기·작업 포함) + 시간창 위반 시 Infinity.
    let t = tw ? clampEarliest(0, tw.windows[ord[0]]) : 0;
    if (tw && violatesLatest(t, tw.windows[ord[0]])) return Infinity;
    for (let i = 0; i + 1 < ord.length; i++) {
      t += (tw ? tw.service[ord[i]] : 0) + time[ord[i]][ord[i + 1]];
      if (tw) {
        t = clampEarliest(t, tw.windows[ord[i + 1]]);
        if (violatesLatest(t, tw.windows[ord[i + 1]])) return Infinity;
      }
    }
    const last = ord[ord.length - 1];
    let destT = t + (tw ? tw.service[last] : 0) + toDestTime[last];
    if (tw) {
      destT = clampEarliest(destT, tw.destWindow);
      if (violatesLatest(destT, tw.destWindow)) return Infinity;
    }
    return destT;
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

/** 용량 게이트: 픽업 적재 누적이 capacity를 넘는지(픽업-단조 모델에선 총합 검사와 동일). */
function assessCapacity(input: OpenStartInput): { exceeded: boolean; total: number; capacity: number | null } {
  const c = input.constraints;
  const capacity = c?.capacity ?? null;
  const demands = c?.demands;
  if (capacity == null || !demands?.length) return { exceeded: false, total: 0, capacity };
  const total = demands.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return { exceeded: total > capacity, total, capacity };
}

/** constraints에서 시간창 컨텍스트를 구성. 유효한 윈도우가 하나도 없으면 null(기존 동작 유지). */
function buildTimeWindowCtx(input: OpenStartInput): TimeWindowCtx {
  const c = input.constraints;
  if (!c) return null;
  const n = input.labels.length;
  const hasStopWindow = c.windows?.some((w) => w && (w.earliestSec != null || w.latestSec != null));
  const hasDestWindow = c.destWindow && (c.destWindow.earliestSec != null || c.destWindow.latestSec != null);
  if (!hasStopWindow && !hasDestWindow) return null;
  return {
    service: c.serviceTimeSec ?? new Array<number>(n).fill(0),
    windows: c.windows ?? new Array(n).fill(null),
    destWindow: c.destWindow ?? null,
  };
}

export function solveOpenStart(input: OpenStartInput): OpenStartSolution {
  const n = input.labels.length;
  const mode = input.mode ?? 'auto';
  const cap = assessCapacity(input);
  const capReason = cap.exceeded
    ? `적재 용량 초과(총 ${cap.total} / 한도 ${cap.capacity}). 차종 상향 또는 분할 배차가 필요해요.`
    : undefined;

  if (n === 0) {
    return { order: [], chosenOriginIndex: -1, totalTimeSec: 0, totalDistM: 0, originRationale: null, method: 'exact', feasible: !cap.exceeded, infeasibleReason: capReason };
  }
  if (n === 1) {
    return {
      order: [0],
      chosenOriginIndex: 0,
      totalTimeSec: input.toDestTime[0],
      totalDistM: input.toDestDist[0],
      originRationale: null,
      method: 'exact',
      feasible: !cap.exceeded,
      infeasibleReason: capReason,
    };
  }

  const useExact = mode === 'exact' || (mode === 'auto' && n <= EXACT_LIMIT);
  const solver = useExact ? heldKarpFixedStart : nnTwoOptFixedStart;
  const method: 'exact' | 'fast' = useExact ? 'exact' : 'fast';
  const tw = buildTimeWindowCtx(input);

  // 시작 후보를 픽업으로 제한할 수 있다(앞에서 N개). 미지정/범위초과 시 전체 후보.
  const startMax = Math.min(input.startEligibleCount ?? n, n);
  const eligible = startMax >= 1 ? startMax : n;

  // 각 시작 후보별 최적 총비용을 구해 최선/차선을 비교(근거 산출).
  const perStart: Array<{ start: number; total: number; order: number[] }> = [];
  for (let s = 0; s < eligible; s++) {
    const r = solver(n, input.time, input.toDestTime, s, tw);
    perStart.push({ start: s, total: r.total, order: r.order });
  }

  // 시간창을 만족(유한 total)하는 시작만 후보. 모두 위반이면 표시용으로 시간창 무시 해를 폴백.
  const feasibleStarts = perStart.filter((p) => Number.isFinite(p.total) && p.order.length > 0);
  const windowsInfeasible = tw != null && feasibleStarts.length === 0;

  let pool = feasibleStarts;
  if (pool.length === 0) {
    // 표시용 폴백: 시간창을 무시한 이동시간-최소 해(사용자에게 "왜 안 되는지" 보여주되 경로는 제시).
    pool = [];
    for (let s = 0; s < eligible; s++) {
      const r = solver(n, input.time, input.toDestTime, s, null);
      if (r.order.length > 0) pool.push({ start: s, total: r.total, order: r.order });
    }
  }
  pool.sort((a, b) => a.total - b.total);

  const winner = pool[0] ?? { start: 0, total: Infinity, order: [] };
  const runnerUp = pool.length > 1 ? pool[1] : null;

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

  const feasible = !cap.exceeded && !windowsInfeasible;
  const infeasibleReason = capReason ?? (windowsInfeasible ? '시간창을 만족하는 방문 순서가 없어요. 출발을 앞당기거나 마감을 늦춰야 해요.' : undefined);

  return {
    order: winner.order,
    chosenOriginIndex: winner.start,
    totalTimeSec: totalTimeForOrder(winner.order, input),
    totalDistM: chosenDist,
    originRationale: rationale,
    method,
    feasible,
    infeasibleReason,
  };
}
