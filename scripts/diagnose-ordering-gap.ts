/* eslint-disable no-console */
/**
 * 순서 계산 손실 진단 (셰도우 마이그레이션 go/no-go 근거).
 *
 * 목적: route.ts의 shipped NN 휴리스틱(`nearestNeighborOrder`, Haversine 기반 순서결정)이
 * 실측 Tmap 도로시간 위에서 정확해(Held-Karp) 대비 실제로 몇 분을 잃는지 측정한다.
 * route.ts는 건드리지 않는다. 동일한 실측 비대칭 행렬 위에서 네 가지 순서를 점수 매겨 비교:
 *   1) shipped-NN(Haversine)  : 현재 배포된 순서결정 로직을 그대로 포팅
 *   2) NN(real-time greedy)    : 같은 그리디지만 Haversine 대신 실측시간으로 선택
 *   3) exact(precedence)       : 선행제약(모든 픽업 → 그다음 나머지) 하 최적. shipped-NN과 공정 비교
 *   4) exact(unconstrained)    : 선행제약 무시 순수 최소시간(선행규칙 자체의 비용 상한)
 *
 * 분해:
 *   shipped-NN gap  = (1)-(3)  ← 현재 배포본이 잃는 총 분
 *   Haversine 페널티 = (1)-(2)  ← 직선거리로 순서를 정해서 잃는 분
 *   greedy 페널티    = (2)-(3)  ← 그리디라서 잃는 분
 *   선행규칙 비용    = (3)-(4)  ← "모든 픽업 먼저" 규칙 자체가 잃는 분
 *
 * 실행: npx tsx scripts/diagnose-ordering-gap.ts
 * (실측 Tmap 호출 → TMAP_API_KEY 필요, .env.local 자동 로드. 인스턴스당 수십 초.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDirectedMatrix } from '../src/domains/dispatch/services/routeMatrix';
import { haversineMeters, type Waypoint } from '../src/domains/dispatch/services/segmentTravel';

// ---- .env.local 로더 (의존성 없음) ----
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* .env.local 없으면 실제 환경변수에 의존 */
  }
}

// ---- 실제 서울 좌표 (WGS84) ----
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
interface Instance {
  name: string;
  start: keyof typeof P;
  stops: Array<{ at: keyof typeof P; role: Role }>;
  /** 마지막 하차지를 tail로 고정(useExplicitDestination 모사). */
  fixedFinal?: keyof typeof P;
}

const d = (at: keyof typeof P): { at: keyof typeof P; role: Role } => ({ at, role: 'drop' });
const w = (at: keyof typeof P): { at: keyof typeof P; role: Role } => ({ at, role: 'waypoint' });
const pk = (at: keyof typeof P): { at: keyof typeof P; role: Role } => ({ at, role: 'pickup' });

const INSTANCES: Instance[] = [
  { name: '1픽업→5하차 (강북 분산)', start: '시청', stops: [pk('성수'), d('수유'), d('노원'), d('왕십리'), d('건대'), d('신촌')] },
  { name: '1픽업→4하차 (강남 분산)', start: '여의도', stops: [pk('구로'), d('강남역'), d('대치'), d('사당'), d('잠실')] },
  { name: '무픽업 6경유 (도심 순회)', start: '시청', stops: [w('신촌'), w('홍대'), w('여의도'), w('목동'), w('구로'), w('사당')] },
  { name: '2픽업→3하차 (혼합)', start: '홍대', stops: [pk('신촌'), pk('여의도'), d('강남역'), d('잠실'), d('왕십리')] },
  { name: '1픽업→6하차 (광역 분산)', start: '구로', stops: [pk('목동'), d('노원'), d('수유'), d('잠실'), d('건대'), d('성수'), d('왕십리')] },
  { name: '무픽업 5경유 (동서 횡단)', start: '목동', stops: [w('여의도'), w('시청'), w('왕십리'), w('건대'), w('잠실')] },
  { name: '1픽업→5하차 (강남권)', start: '사당', stops: [pk('강남역'), d('대치'), d('잠실'), d('건대'), d('성수'), d('왕십리')] },
  { name: '2픽업→4하차 (광역 혼합)', start: '노원', stops: [pk('수유'), pk('왕십리'), d('성수'), d('건대'), d('잠실'), d('강남역')] },
];

// ---- shipped NN 포팅 (route.ts:2458 nearestNeighborOrder 그대로) ----
function shippedNearestNeighbor(
  start: { latitude: number; longitude: number },
  points: Waypoint[],
  roles: string[],
): Waypoint[] {
  const withRole = points.map((p, i) => ({ p, role: roles[i] }));
  const pickups = withRole.filter((x) => x.role === 'pickup').map((x) => x.p);
  const rest = withRole.filter((x) => x.role !== 'pickup').map((x) => x.p);
  const sweep = (from: { lat: number; lng: number }, pts: Waypoint[]): Waypoint[] => {
    const remaining = [...pts];
    const out: Waypoint[] = [];
    let cur = from;
    while (remaining.length) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i];
        const dd = haversineMeters(cur.lat, cur.lng, p.latitude, p.longitude);
        if (dd < bestDist) { bestDist = dd; bestIdx = i; }
      }
      const [chosen] = remaining.splice(bestIdx, 1);
      out.push(chosen);
      cur = { lat: chosen.latitude, lng: chosen.longitude };
    }
    return out;
  };
  const start2 = { lat: start.latitude, lng: start.longitude };
  if (pickups.length === 0) return sweep(start2, points);
  const orderedPickups = sweep(start2, pickups);
  const lastPickup = orderedPickups[orderedPickups.length - 1];
  const afterPickup = lastPickup ? { lat: lastPickup.latitude, lng: lastPickup.longitude } : start2;
  const orderedRest = sweep(afterPickup, rest);
  return [...orderedPickups, ...orderedRest];
}

// ---- NN greedy on REAL time (같은 그리디, 선택 기준만 실측시간) ----
// startIdx=0(출발지), 나머지 인덱스는 1..N. roles는 stops 기준.
function nnRealTime(time: number[][], stopIdx: number[], pickupSet: Set<number>): number[] {
  const sweep = (from: number, pts: number[]): number[] => {
    const remaining = [...pts];
    const out: number[] = [];
    let cur = from;
    while (remaining.length) {
      let bestK = 0;
      let best = Infinity;
      for (let k = 0; k < remaining.length; k++) {
        const t = time[cur][remaining[k]];
        if (t < best) { best = t; bestK = k; }
      }
      const [chosen] = remaining.splice(bestK, 1);
      out.push(chosen);
      cur = chosen;
    }
    return out;
  };
  const pickups = stopIdx.filter((i) => pickupSet.has(i));
  const rest = stopIdx.filter((i) => !pickupSet.has(i));
  if (pickups.length === 0) return sweep(0, stopIdx);
  const op = sweep(0, pickups);
  const after = op.length ? op[op.length - 1] : 0;
  return [...op, ...sweep(after, rest)];
}

// ---- 경로 총 이동시간(초): 0(start) → order → (end open) ----
function scoreOrder(time: number[][], order: number[]): number {
  let t = 0;
  let cur = 0;
  for (const nxt of order) { t += time[cur][nxt]; cur = nxt; }
  return t;
}

// ---- Held-Karp: 고정 출발(0), 나머지 stopIdx 방문, open-end 최소시간 ----
// precedence=true면 픽업(pickupSet)이 모두 방문돼야 비픽업 방문 가능.
// fixedFinal(인덱스)이 주어지면 그 지점이 반드시 마지막.
function heldKarp(
  time: number[][],
  stopIdx: number[],
  pickupSet: Set<number>,
  precedence: boolean,
  fixedFinal: number | null,
): { order: number[]; total: number } {
  const n = stopIdx.length;
  const local = stopIdx; // local position p → global index local[p]
  const pickupMask = local.reduce((m, gi, p) => (pickupSet.has(gi) ? m | (1 << p) : m), 0);
  const finalPos = fixedFinal == null ? -1 : local.indexOf(fixedFinal);
  const full = (1 << n) - 1;
  const dp: number[][] = Array.from({ length: 1 << n }, () => new Array<number>(n).fill(Infinity));
  const par: number[][] = Array.from({ length: 1 << n }, () => new Array<number>(n).fill(-1));

  const canVisit = (mask: number, p: number): boolean => {
    if (precedence && !(pickupMask & (1 << p))) {
      // 비픽업: 모든 픽업이 이미 mask에 있어야
      if ((mask & pickupMask) !== pickupMask) return false;
    }
    return true;
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
        const nextMask = mask | (1 << j);
        if (!canVisit(mask, j)) continue;
        const cand = cur + time[local[i]][local[j]];
        if (cand < dp[nextMask][j]) { dp[nextMask][j] = cand; par[nextMask][j] = i; }
      }
    }
  }
  let bestEnd = -1;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    if (finalPos >= 0 && i !== finalPos) continue;
    if (dp[full][i] < best) { best = dp[full][i]; bestEnd = i; }
  }
  const orderLocal: number[] = [];
  let mask = full;
  let cur = bestEnd;
  while (cur !== -1) { orderLocal.push(cur); const prev = par[mask][cur]; mask &= ~(1 << cur); cur = prev; }
  orderLocal.reverse();
  return { order: orderLocal.map((p) => local[p]), total: best };
}

function pinFinal(order: number[], finalIdx: number | null): number[] {
  if (finalIdx == null) return order;
  const rest = order.filter((i) => i !== finalIdx);
  return [...rest, finalIdx];
}

async function run() {
  loadEnvLocal();
  const tmapKey = process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY;
  if (!tmapKey) { console.error('TMAP_API_KEY 없음 (.env.local 확인)'); process.exit(1); }

  // 재현성: 내일 10:00 KST 출발.
  const dep = new Date();
  dep.setDate(dep.getDate() + 1);
  dep.setHours(10, 0, 0, 0);

  const rows: Array<Record<string, number | string>> = [];
  const agg = { shippedGap: [] as number[], hav: [] as number[], greedy: [] as number[], precRule: [] as number[] };

  for (const inst of INSTANCES) {
    const startWp = P[inst.start];
    const stopWps = inst.stops.map((s) => P[s.at]);
    const roles = inst.stops.map((s) => s.role);
    const points = [startWp, ...stopWps];
    let matrix;
    try {
      matrix = await buildDirectedMatrix({
        points, departAt: dep, tmapKey, vehicleTypeCode: '1', trafficMode: 'standard', trafficAnchor: 'tomorrow', concurrency: 4,
      });
    } catch (e) {
      console.warn(`⚠ ${inst.name}: 행렬 실패 → 스킵 (${e instanceof Error ? e.message : e})`);
      continue;
    }
    const time = matrix.timeSec; // (N+1)x(N+1), index 0 = start
    const stopIdx = stopWps.map((_, i) => i + 1); // 1..N
    const pickupSet = new Set<number>(inst.stops.map((s, i) => (s.role === 'pickup' ? i + 1 : -1)).filter((x) => x > 0));
    const finalIdx = inst.fixedFinal ? stopWps.findIndex((wp) => wp.address === P[inst.fixedFinal!].address) + 1 : null;

    // 1) shipped NN (Haversine) → 지점 시퀀스를 글로벌 인덱스로
    const shippedWps = shippedNearestNeighbor(startWp, stopWps, roles);
    let shippedOrder = shippedWps.map((wp) => points.findIndex((p) => p.address === wp.address));
    shippedOrder = pinFinal(shippedOrder, finalIdx);
    const tShipped = scoreOrder(time, shippedOrder);

    // 2) NN real-time greedy
    let nnRt = nnRealTime(time, stopIdx, pickupSet);
    nnRt = pinFinal(nnRt, finalIdx);
    const tNnRt = scoreOrder(time, nnRt);

    // 3) exact + precedence, 4) exact unconstrained
    const exactPrec = heldKarp(time, stopIdx, pickupSet, true, finalIdx);
    const exactFree = heldKarp(time, stopIdx, pickupSet, false, finalIdx);

    const min = (s: number) => Math.round(s / 60);
    const shippedGap = min(tShipped) - min(exactPrec.total);
    const havPenalty = min(tShipped) - min(tNnRt);
    const greedyPenalty = min(tNnRt) - min(exactPrec.total);
    const precRuleCost = min(exactPrec.total) - min(exactFree.total);
    agg.shippedGap.push(shippedGap); agg.hav.push(havPenalty); agg.greedy.push(greedyPenalty); agg.precRule.push(precRuleCost);

    rows.push({
      인스턴스: inst.name,
      N: stopIdx.length,
      shipped분: min(tShipped),
      정확해분: min(exactPrec.total),
      '손실분': shippedGap,
      '손실%': exactPrec.total > 0 ? Math.round((shippedGap / min(exactPrec.total)) * 100) : 0,
      'Haversine분': havPenalty,
      'greedy분': greedyPenalty,
      '선행규칙분': precRuleCost,
      순서일치: JSON.stringify(shippedOrder) === JSON.stringify(exactPrec.order) ? 'Y' : 'N',
    });
  }

  console.log('\n=== 순서 계산 손실 진단 (실측 Tmap, 내일 10:00 출발 기준) ===\n');
  console.table(rows);

  const stat = (a: number[]) => {
    if (!a.length) return { median: 0, p90: 0, max: 0, mean: 0 };
    const s = [...a].sort((x, y) => x - y);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { median: q(0.5), p90: q(0.9), max: s[s.length - 1], mean: Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 };
  };
  console.log('\n=== 집계 (분) ===');
  console.log('shipped-NN 손실(vs 정확해+선행):', stat(agg.shippedGap));
  console.log('  ├ Haversine 페널티:', stat(agg.hav));
  console.log('  └ greedy 페널티   :', stat(agg.greedy));
  console.log('선행규칙 자체 비용(선행 정확해 − 무제약 정확해):', stat(agg.precRule));
  console.log('\n해석: shipped-NN 손실 median/p90/max이 크면 마이그레이션 가치 있음. 작으면 현행 유지가 정답.');
  console.log('Haversine 페널티가 손실의 대부분이면, 솔버 없이 NN의 거리기준만 실측시간으로 바꿔도 큰 개선.');
}

run().catch((e) => { console.error(e); process.exit(1); });
