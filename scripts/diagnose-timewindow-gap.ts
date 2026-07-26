/* eslint-disable no-console */
/**
 * 시간제약 경로 손실 진단 (셰도우 마이그레이션 rec #2).
 *
 * 대상: route.ts의 `buildRouteWithAnchors` — 마감(due) 있는 경로의 순서를 정하는 그리디 휴리스틱.
 * 순서결정은 Haversine(직선거리)로 후보를 고르고(마감순 정렬 + slack 삽입), 타이밍만 실측 Tmap을 쓴다.
 *
 * 방법(오프라인, 라이브 서버 불필요): 동일한 실측 비대칭 행렬 위에서
 *   - 휴리스틱: buildRouteWithAnchors의 순서결정 로직을 충실히 포팅(Haversine 후보선택 유지)
 *   - 정확해 : 모든 순열(픽업 선행 제약 하) 브루트포스 → 총 마감지각 최소(동률 시 총 이동시간 최소)
 * 두 순서를 같은 행렬로 점수 매겨 비교.
 *
 * 핵심 메트릭: "회피 가능한 마감 지각(분)" = 휴리스틱 지각 − 정확해 최소지각.
 *   그리디라서 놓친 마감을, 최적 순서였다면 지켰을 분. 배송업의 실손실(배송창 미준수).
 *
 * 한계(정직): 단일 스냅샷 행렬(경로 내 시간대별 교통 변동 미반영 — NN 진단과 동일 단순화).
 * 휴리스틱/정확해가 같은 행렬을 쓰므로 "순서 품질" 비교로는 공정. 합성 인스턴스(이력 0행).
 *
 * 실행: npx tsx scripts/diagnose-timewindow-gap.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDirectedMatrix } from '../src/domains/dispatch/services/routeMatrix';
import { haversineMeters, type Waypoint } from '../src/domains/dispatch/services/segmentTravel';

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* noop */ }
}

const P: Record<string, Waypoint> = {
  시청: { address: '서울시청', latitude: 37.5663, longitude: 126.9779 },
  강남역: { address: '강남역', latitude: 37.4979, longitude: 127.0276 },
  여의도: { address: '여의도역', latitude: 37.5215, longitude: 126.9242 },
  잠실: { address: '잠실역', latitude: 37.5133, longitude: 127.1 },
  홍대: { address: '홍대입구역', latitude: 37.5572, longitude: 126.9245 },
  성수: { address: '성수역', latitude: 37.5447, longitude: 127.0557 },
  구로: { address: '구로디지털단지역', latitude: 37.4853, longitude: 126.9014 },
  노원: { address: '노원역', latitude: 37.6542, longitude: 127.0568 },
  왕십리: { address: '왕십리역', latitude: 37.5614, longitude: 127.0378 },
  사당: { address: '사당역', latitude: 37.4766, longitude: 126.9816 },
  수유: { address: '수유역', latitude: 37.6379, longitude: 127.0254 },
  목동: { address: '목동', latitude: 37.53, longitude: 126.8752 },
  건대: { address: '건대입구역', latitude: 37.5405, longitude: 127.07 },
  대치: { address: '대치동', latitude: 37.4994, longitude: 127.0628 },
  신촌: { address: '신촌역', latitude: 37.5551, longitude: 126.9368 },
};

type Role = 'pickup' | 'drop' | 'waypoint';
interface Stop { at: keyof typeof P; role: Role; due?: string } // due = "HH:mm" (없으면 무제약)
interface Instance { name: string; start: keyof typeof P; depart: string; stops: Stop[] }

const INSTANCES: Instance[] = [
  {
    name: '3마감+2경유 (도심→광역)', start: '시청', depart: '09:00',
    stops: [
      { at: '강남역', role: 'drop', due: '11:00' },
      { at: '잠실', role: 'drop', due: '12:30' },
      { at: '노원', role: 'drop', due: '14:00' },
      { at: '여의도', role: 'drop' },
      { at: '성수', role: 'drop' },
    ],
  },
  {
    name: '2마감+3경유 (강남권)', start: '여의도', depart: '09:00',
    stops: [
      { at: '잠실', role: 'drop', due: '11:30' },
      { at: '사당', role: 'drop', due: '13:00' },
      { at: '강남역', role: 'drop' },
      { at: '대치', role: 'drop' },
      { at: '건대', role: 'drop' },
    ],
  },
  {
    name: '1픽업(무마감)+3마감', start: '홍대', depart: '09:00',
    stops: [
      { at: '신촌', role: 'pickup' },
      { at: '강남역', role: 'drop', due: '12:00' },
      { at: '왕십리', role: 'drop', due: '13:30' },
      { at: '잠실', role: 'drop', due: '15:00' },
    ],
  },
  {
    name: '4마감 촘촘', start: '구로', depart: '09:00',
    stops: [
      { at: '여의도', role: 'drop', due: '10:30' },
      { at: '시청', role: 'drop', due: '11:15' },
      { at: '왕십리', role: 'drop', due: '12:30' },
      { at: '건대', role: 'drop', due: '13:30' },
      { at: '목동', role: 'drop' },
    ],
  },
  {
    name: '3마감+2경유 (광역 북)', start: '노원', depart: '09:00',
    stops: [
      { at: '수유', role: 'drop', due: '10:30' },
      { at: '성수', role: 'drop', due: '12:00' },
      { at: '강남역', role: 'drop', due: '14:00' },
      { at: '건대', role: 'drop' },
      { at: '왕십리', role: 'drop' },
    ],
  },
];

const DWELL_MIN = 10; // buildRouteWithAnchors의 기본 dwell(?? 10)과 일치. 양측 동일 적용.

/** "HH:mm" → 출발 기준일(내일 depart일)의 절대 ms. */
function dueMs(baseDay: Date, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(baseDay);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/** buildRouteWithAnchors 순서 로직 포팅(행렬 기반). index 0 = start, 1..n = stops. */
function anchorsHeuristic(
  time: number[][],
  points: Waypoint[],
  stops: Stop[],
  dues: (number | null)[], // stops와 동일 인덱스(1..n 대응). null=무제약
  baseNowMs: number,
): { order: number[]; latenessMin: number; travelSec: number } {
  const hav = (a: number, b: number) => haversineMeters(points[a].latitude, points[a].longitude, points[b].latitude, points[b].longitude);
  const idxAll = stops.map((_, i) => i + 1);
  const constrained = idxAll.filter((gi) => dues[gi - 1] != null).sort((a, b) => (dues[a - 1]! - dues[b - 1]!));
  let unconstrained = idxAll.filter((gi) => dues[gi - 1] == null);

  const order: number[] = [];
  let cur = 0;
  let now = baseNowMs;
  let travelSec = 0;
  let latenessMin = 0;
  const step = (to: number) => { travelSec += time[cur][to]; now += time[cur][to] * 1000 + DWELL_MIN * 60000; cur = to; };

  // leading pickups (무마감 픽업 먼저, Haversine NN)
  const isPickup = (gi: number) => stops[gi - 1].role === 'pickup';
  const leadPk = unconstrained.filter(isPickup);
  unconstrained = unconstrained.filter((gi) => !isPickup(gi));
  const remPk = [...leadPk];
  while (remPk.length) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < remPk.length; i++) { const d = hav(cur, remPk[i]); if (d < bestD) { bestD = d; best = i; } }
    const p = remPk.splice(best, 1)[0];
    order.push(p); step(p);
  }

  // 각 마감 앵커 사이에 비제약 slack 삽입
  for (const anchor of constrained) {
    const due = dues[anchor - 1]!;
    while (true) {
      const directArrive = now + time[cur][anchor] * 1000;
      if (due - directArrive <= 0) break; // slack 없음
      const sorted = [...unconstrained].sort((x, y) => hav(cur, x) - hav(cur, y)).slice(0, Math.min(3, unconstrained.length));
      let bestGi = -1, bestArr = -1;
      for (const cand of sorted) {
        const departCand = now + time[cur][cand] * 1000 + DWELL_MIN * 60000;
        const arriveAnchor = departCand + time[cand][anchor] * 1000;
        if (arriveAnchor <= due && arriveAnchor > bestArr) { bestArr = arriveAnchor; bestGi = cand; }
      }
      if (bestGi === -1) break;
      unconstrained = unconstrained.filter((gi) => gi !== bestGi);
      order.push(bestGi); step(bestGi);
    }
    const arriveAt = now + time[cur][anchor] * 1000;
    latenessMin += Math.max(0, Math.ceil((arriveAt - due) / 60000));
    order.push(anchor);
    travelSec += time[cur][anchor]; now = arriveAt + DWELL_MIN * 60000; cur = anchor;
  }

  // 남은 비제약: Haversine NN
  while (unconstrained.length) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < unconstrained.length; i++) { const d = hav(cur, unconstrained[i]); if (d < bestD) { bestD = d; best = i; } }
    const nx = unconstrained.splice(best, 1)[0];
    order.push(nx); step(nx);
  }

  return { order, latenessMin, travelSec };
}

/** 브루트포스 정확해: 픽업 선행 하 모든 순열 중 (총지각 최소, 동률 시 총이동 최소). */
function exactTimeWindow(
  time: number[][],
  stops: Stop[],
  dues: (number | null)[],
  baseNowMs: number,
): { order: number[]; latenessMin: number; travelSec: number } {
  const idxAll = stops.map((_, i) => i + 1);
  const isPickup = (gi: number) => stops[gi - 1].role === 'pickup';
  let best: { order: number[]; lateness: number; travel: number } | null = null;

  const scoreOrder = (order: number[]) => {
    let cur = 0, now = baseNowMs, travel = 0, lateness = 0;
    for (const gi of order) {
      const arrive = now + time[cur][gi] * 1000;
      travel += time[cur][gi];
      const due = dues[gi - 1];
      if (due != null) lateness += Math.max(0, Math.ceil((arrive - due) / 60000));
      now = arrive + DWELL_MIN * 60000; cur = gi;
    }
    return { lateness, travel };
  };

  const permute = (rest: number[], acc: number[]) => {
    if (rest.length === 0) {
      // 픽업 선행 검증
      let seenNon = false;
      for (const gi of acc) { if (isPickup(gi)) { if (seenNon) return; } else seenNon = true; }
      const s = scoreOrder(acc);
      if (!best || s.lateness < best.lateness || (s.lateness === best.lateness && s.travel < best.travel)) {
        best = { order: [...acc], lateness: s.lateness, travel: s.travel };
      }
      return;
    }
    for (let i = 0; i < rest.length; i++) permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
  };
  permute(idxAll, []);
  return { order: best!.order, latenessMin: best!.lateness, travelSec: best!.travel };
}

async function run() {
  loadEnvLocal();
  const tmapKey = process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY;
  if (!tmapKey) { console.error('TMAP_API_KEY 없음'); process.exit(1); }

  const rows: Array<Record<string, string | number>> = [];
  const avoidableLate: number[] = [];
  const travelDelta: number[] = [];

  for (const inst of INSTANCES) {
    const startWp = P[inst.start];
    const stopWps = inst.stops.map((s) => P[s.at]);
    const points = [startWp, ...stopWps];
    // 재현성: 내일, depart 시각.
    const baseDay = new Date();
    baseDay.setDate(baseDay.getDate() + 1);
    const [dh, dm] = inst.depart.split(':').map(Number);
    baseDay.setHours(dh, dm, 0, 0);
    const dues = inst.stops.map((s) => (s.due ? dueMs(baseDay, s.due) : null));

    let matrix;
    try {
      matrix = await buildDirectedMatrix({
        points, departAt: baseDay, tmapKey, vehicleTypeCode: '1', trafficMode: 'standard', trafficAnchor: 'tomorrow', concurrency: 4,
      });
    } catch (e) {
      console.warn(`⚠ ${inst.name}: 행렬 실패 → 스킵 (${e instanceof Error ? e.message : e})`);
      continue;
    }
    const time = matrix.timeSec;
    const heur = anchorsHeuristic(time, points, inst.stops, dues, baseDay.getTime());
    const exact = exactTimeWindow(time, inst.stops, dues, baseDay.getTime());

    const avoid = heur.latenessMin - exact.latenessMin;
    const tDelta = Math.round((heur.travelSec - exact.travelSec) / 60);
    avoidableLate.push(avoid);
    travelDelta.push(tDelta);

    rows.push({
      인스턴스: inst.name,
      마감수: inst.stops.filter((s) => s.due).length,
      휴리스틱지각: heur.latenessMin,
      정확해지각: exact.latenessMin,
      '회피가능지각': avoid,
      '이동차(분)': tDelta,
      순서일치: JSON.stringify(heur.order) === JSON.stringify(exact.order) ? 'Y' : 'N',
    });
  }

  console.log('\n=== 시간제약 경로 손실 진단 (실측 Tmap, 내일 출발 기준) ===\n');
  console.table(rows);

  const stat = (a: number[]) => {
    if (!a.length) return { median: 0, p90: 0, max: 0, mean: 0 };
    const s = [...a].sort((x, y) => x - y);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { median: q(0.5), p90: q(0.9), max: s[s.length - 1], mean: Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 };
  };
  console.log('\n=== 집계 ===');
  console.log('회피 가능한 마감 지각(분):', stat(avoidableLate));
  console.log('이동시간 차 휴리스틱−정확해(분):', stat(travelDelta));
  console.log('\n해석: 회피가능지각 median/max가 크면 시간제약 경로가 진짜 문제(마감 놓침) → 솔버 값어치 큼.');
  console.log('0에 가까우면 그리디로 충분. NN 경로와 달리 여기 손실은 "지각=배송창 미준수"라 사업 영향이 더 직접적.');
}

run().catch((e) => { console.error(e); process.exit(1); });
