// 고정 출발지 정확해 순서 솔버 (open path Held-Karp).
//
// open-start 솔버(openStartOptimizer.ts)는 "출발지도 선택 + 단일 고정 하차"에 특화돼 있다.
// 이 모듈은 그 사촌으로, "출발지 고정 + 모든 지점 방문 + open-end(또는 고정 종착)"의
// 최소 이동시간 순서를 정확히 푼다. 시간제약 없는 거리기반 최적화 경로(route.ts의
// nearestNeighborOrder 대체 후보)에서 쓴다. Haversine이 아니라 실측 시간 행렬 위에서 계산한다.
//
// 진단(scripts/diagnose-ordering-gap.ts) 결과: 분산된 6~9지점 경로에서 Haversine NN이
// 실측 최적 대비 최대 ~10%(15~17분)를 잃었고, 그 상당 부분이 "직선거리로 순서결정" 탓이었다.
// 이 솔버는 그 손실을 제거한다(N이 Held-Karp 한도 이내일 때).

/** Held-Karp 실용 상한. n(방문 지점 수) 초과 시 skipped=true로 반환 → 호출측이 휴리스틱 폴백. */
export const EXACT_ORDER_MAX_STOPS = 12;

export interface ExactOrderInput {
  /** time[i][j] = i→j 이동시간(초). 인덱스 0 = 출발지(고정). 1..n = 방문 지점. 비대칭 허용. */
  time: number[][];
  /** 방문할 지점의 인덱스들(보통 [1..n]). */
  stopIndices: number[];
  /** 픽업인 지점 인덱스들. precedence=true일 때만 의미. */
  pickupIndices: number[];
  /** true면 "모든 픽업 방문 후에야 비픽업 방문 가능"(상차 전 배송 금지). */
  precedence: boolean;
  /** 반드시 마지막에 방문할 지점 인덱스(고정 종착). 없으면 null. */
  fixedFinalIndex: number | null;
}

export interface ExactOrderResult {
  /** 방문 순서(stopIndices의 순열). skipped/실패 시 빈 배열. */
  order: number[];
  /** 출발지→...→마지막 지점 총 이동시간(초). */
  totalTimeSec: number;
  /** Held-Karp 한도 초과로 계산하지 않음(호출측이 폴백해야 함). */
  skipped: boolean;
}

/**
 * 고정 출발(0) → stopIndices 전부 방문 → open-end(또는 fixedFinalIndex) 최소 이동시간 순서.
 * precedence=true면 모든 픽업이 방문돼야 비픽업 방문 가능(전이 단계에서 가지치기).
 */
export function solveExactOrder(input: ExactOrderInput): ExactOrderResult {
  const { time, stopIndices, pickupIndices, precedence, fixedFinalIndex } = input;
  const n = stopIndices.length;

  if (n === 0) return { order: [], totalTimeSec: 0, skipped: false };
  if (n > EXACT_ORDER_MAX_STOPS) return { order: [], totalTimeSec: 0, skipped: true };
  if (n === 1) return { order: [stopIndices[0]], totalTimeSec: time[0][stopIndices[0]] ?? 0, skipped: false };

  // local position p(0..n-1) ↔ global index local[p]
  const local = stopIndices;
  const pickupGlobal = new Set(pickupIndices);
  const pickupMask = local.reduce((m, gi, p) => (pickupGlobal.has(gi) ? m | (1 << p) : m), 0);
  const finalPos = fixedFinalIndex == null ? -1 : local.indexOf(fixedFinalIndex);
  const full = (1 << n) - 1;

  const dp: number[][] = Array.from({ length: 1 << n }, () => new Array<number>(n).fill(Infinity));
  const par: number[][] = Array.from({ length: 1 << n }, () => new Array<number>(n).fill(-1));

  // precedence: 비픽업 p는 모든 픽업이 mask에 있어야 방문 가능.
  const canVisit = (mask: number, p: number): boolean => {
    if (!precedence) return true;
    if (pickupMask & (1 << p)) return true; // 픽업은 언제나 가능
    return (mask & pickupMask) === pickupMask; // 비픽업: 픽업 전부 선행
  };

  for (let p = 0; p < n; p++) {
    if (!canVisit(0, p)) continue;
    dp[1 << p][p] = time[0][local[p]];
  }
  for (let mask = 1; mask <= full; mask++) {
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const cur = dp[mask][i];
      if (cur === Infinity) continue;
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        if (!canVisit(mask, j)) continue;
        const nextMask = mask | (1 << j);
        const cand = cur + time[local[i]][local[j]];
        if (cand < dp[nextMask][j]) {
          dp[nextMask][j] = cand;
          par[nextMask][j] = i;
        }
      }
    }
  }

  let bestEnd = -1;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    if (finalPos >= 0 && i !== finalPos) continue;
    if (dp[full][i] < best) {
      best = dp[full][i];
      bestEnd = i;
    }
  }
  if (bestEnd === -1) return { order: [], totalTimeSec: 0, skipped: false };

  const orderLocal: number[] = [];
  let mask = full;
  let cur = bestEnd;
  while (cur !== -1) {
    orderLocal.push(cur);
    const prev = par[mask][cur];
    mask &= ~(1 << cur);
    cur = prev;
  }
  orderLocal.reverse();
  return { order: orderLocal.map((p) => local[p]), totalTimeSec: best, skipped: false };
}
