// 방향 거리/시간 행렬 빌더.
// route-optimization의 구간 실측(fetchSegmentTravel) + 캐시를 재사용해 모든 지점 쌍의
// 비대칭(A→B ≠ B→A) 이동시간/거리를 구성한다. open-start 솔버의 입력으로 쓰인다.

import {
  fetchSegmentTravel,
  type SegmentTravel,
  type TrafficAnchorMode,
  type Waypoint,
} from './segmentTravel';

export interface DirectedMatrix {
  points: Waypoint[];
  /** timeSec[i][j] = i→j 이동시간(초). i===j 는 0. */
  timeSec: number[][];
  /** distM[i][j] = i→j 이동거리(m). i===j 는 0. */
  distM: number[][];
}

export interface BuildMatrixOptions {
  points: Waypoint[];
  departAt: Date;
  tmapKey: string;
  vehicleTypeCode: string;
  trafficMode: 'realtime' | 'standard';
  trafficAnchor: TrafficAnchorMode;
  /** 실측 호출 동시성 한도 (Tmap rate limit 보호). 기본 4. */
  concurrency?: number;
  /** 호출 간 공유 캐시. 미지정 시 내부 생성. */
  cache?: Map<string, SegmentTravel>;
}

const DEFAULT_CONCURRENCY = 4;

/**
 * 모든 지점 쌍(i→j, i≠j)의 실측 행렬을 만든다.
 * 한 쌍이라도 Tmap에서 실측 실패하면 throw (Haversine 추정 폴백 없음).
 */
export async function buildDirectedMatrix(opts: BuildMatrixOptions): Promise<DirectedMatrix> {
  const {
    points,
    departAt,
    tmapKey,
    vehicleTypeCode,
    trafficMode,
    trafficAnchor,
    concurrency = DEFAULT_CONCURRENCY,
    cache = new Map<string, SegmentTravel>(),
  } = opts;

  const n = points.length;
  const timeSec: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const distM: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  const pairs: Array<{ i: number; j: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) pairs.push({ i, j });
    }
  }

  let cursor = 0;
  const worker = async () => {
    while (cursor < pairs.length) {
      const idx = cursor++;
      const { i, j } = pairs[idx];
      const travel = await fetchSegmentTravel(
        cache,
        points[i],
        points[j],
        departAt,
        tmapKey,
        vehicleTypeCode,
        trafficMode,
        trafficAnchor,
      );
      timeSec[i][j] = travel.timeSec;
      distM[i][j] = travel.distM;
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, pairs.length)) }, () => worker());
  await Promise.all(workers);

  return { points, timeSec, distM };
}
