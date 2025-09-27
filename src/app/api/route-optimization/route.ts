import { NextRequest, NextResponse } from 'next/server';

// 좌표 유효성 검사 함수 추가
function isValidCoordinate(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng);
}

// 거리 계산 정확성 검증 함수 추가
function validateDistanceCalculation(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
  calculatedDistance: number
): boolean {
  const haversineDistance = haversineMeters(start.latitude, start.longitude, end.latitude, end.longitude);
  const tolerance = 0.1; // 10% 허용 오차
  const difference = Math.abs(calculatedDistance - haversineDistance);
  return difference <= haversineDistance * tolerance;
}

// ===== Multi-Objective Optimization 관련 타입 및 함수들 =====

interface TimeConstraint {
  waypointIndex: number;
  deliveryTime: string; // "14:30" 형식
  isNextDay: boolean;
}

interface RouteSolution {
  route: Array<{ latitude: number; longitude: number; address: string }>;
  totalDistance: number;
  timePenalty: number;
  objectiveValue: number;
}

interface OptimizationParams {
  alpha: number; // 거리 가중치 (기본값: 1.0)
  beta: number;  // 시간제약 위반 패널티 가중치 (기본값: 1000.0)
  maxIterations: number; // 최대 반복 횟수 (기본값: 1000)
  temperature: number; // Simulated Annealing 초기 온도 (기본값: 1000)
  coolingRate: number; // 냉각률 (기본값: 0.95)
}

// 목적함수 계산 (거리 + 시간제약 패널티)
function calculateObjectiveValue(
  route: Array<{ latitude: number; longitude: number; address: string }>,
  timeConstraints: TimeConstraint[],
  params: OptimizationParams
): { totalDistance: number; timePenalty: number; objectiveValue: number } {
  const totalDistance = calculateTotalRouteDistance(route);
  const timePenalty = calculateTimeConstraintViolation(route, timeConstraints);
  const objectiveValue = params.alpha * totalDistance + params.beta * timePenalty;

  return { totalDistance, timePenalty, objectiveValue };
}

// 총 경로 거리 계산
function calculateTotalRouteDistance(
  route: Array<{ latitude: number; longitude: number; address: string }>
): number {
  if (route.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < route.length - 1; i++) {
    totalDistance += haversineMeters(
      route[i].latitude, route[i].longitude,
      route[i + 1].latitude, route[i + 1].longitude
    );
  }
  return totalDistance;
}

// 시간제약 위반 패널티 계산
function calculateTimeConstraintViolation(
  route: Array<{ latitude: number; longitude: number; address: string }>,
  timeConstraints: TimeConstraint[]
): number {
  let penalty = 0;

  for (const constraint of timeConstraints) {
    const waypointIndex = constraint.waypointIndex;
    if (waypointIndex >= route.length) continue;

    // 해당 경유지까지의 도착시간 계산 (간단한 추정)
    const arrivalTime = estimateArrivalTime(route, waypointIndex);
    const requiredTime = parseTimeString(constraint.deliveryTime, constraint.isNextDay);

    if (arrivalTime > requiredTime) {
      // 시간제약 위반 시 패널티 (초과 시간에 비례)
      const violationMinutes = arrivalTime - requiredTime;
      penalty += violationMinutes * 1000; // 1분당 1000점 패널티
    }
  }

  return penalty;
}

// 시간 문자열을 분 단위로 변환 (다음날 고려)
function parseTimeString(timeString: string, isNextDay: boolean): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  let totalMinutes = hours * 60 + minutes;

  if (isNextDay) {
    totalMinutes += 24 * 60; // 다음날이면 24시간(1440분) 추가
  }

  return totalMinutes;
}

// 시간 문자열 직접 비교 (더 정확한 검증)
function isTimeEarlierOrEqual(time1: string, time2: string): boolean {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);

  const minutes1 = h1 * 60 + m1;
  const minutes2 = h2 * 60 + m2;

  return minutes1 <= minutes2;
}

// 거리 기반 동적 최소시간 계산
function calculateMinimumTravelTime(
  startLocation: { latitude: number; longitude: number },
  waypointLocation: { latitude: number; longitude: number },
  waypointIndex: number
): number {
  // 실제 거리 계산
  const distance = haversineMeters(
    startLocation.latitude, startLocation.longitude,
    waypointLocation.latitude, waypointLocation.longitude
  );

  // 거리 기반 최소 이동시간 계산
  let minimumTime = 0;

  if (waypointIndex === 0) {
    // 첫 번째 경유지: 출발지 체류시간 + 이동시간
    minimumTime += 10; // 출발지 체류시간
  }

  // 거리별 최소 이동시간 (현실적인 기준)
  if (distance < 100) {
    minimumTime += 5; // 100m 미만: 5분 (같은 건물/단지)
  } else if (distance < 500) {
    minimumTime += 10; // 500m 미만: 10분 (인근 상가/건물)
  } else if (distance < 1000) {
    minimumTime += 15; // 1km 미만: 15분 (도보 가능 거리)
  } else if (distance < 5000) {
    minimumTime += 20; // 5km 미만: 20분 (자동차 단거리)
  } else {
    minimumTime += 30; // 5km 이상: 30분 (자동차 장거리)
  }

  return minimumTime;
}

// 시간제약이 물리적으로 불가능한지 빠른 검증 (거리 기반 동적 최소시간)
function isPhysicallyImpossible(
  startTime: string,
  deliveryTime: string,
  startLocation: { latitude: number; longitude: number },
  waypointLocation: { latitude: number; longitude: number },
  waypointIndex: number = 0
): boolean {
  // 1. 시간 순서 검증
  if (!isTimeEarlierOrEqual(startTime, deliveryTime)) {
    return true; // 출발시간이 배송완료시간보다 늦으면 물리적으로 불가능
  }

  // 2. 거리 기반 동적 최소 이동시간 검증
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [deliveryHours, deliveryMinutes] = deliveryTime.split(':').map(Number);

  const startTotalMinutes = startHours * 60 + startMinutes;
  const deliveryTotalMinutes = deliveryHours * 60 + deliveryMinutes;
  const timeDifference = deliveryTotalMinutes - startTotalMinutes;

  // 거리 기반 동적 최소 이동시간 계산
  const minimumTravelTime = calculateMinimumTravelTime(startLocation, waypointLocation, waypointIndex);

  if (timeDifference < minimumTravelTime) {
    return true; // 시간 차이가 동적 최소 이동시간보다 작으면 물리적으로 불가능
  }

  return false;
}

// ===== Tmap 기반 시간창 우선 최적화 핵심 헬퍼 =====

// 교통 앵커 모드: 오늘/내일/자동(과거시간→내일, 미래시간→오늘)
type TrafficAnchorMode = 'today' | 'tomorrow' | 'auto';

function setTimeOfDay(base: Date, timeSource: Date): Date {
  const d = new Date(base);
  d.setHours(timeSource.getHours(), timeSource.getMinutes(), timeSource.getSeconds(), 0);
  return d;
}

function anchorDepartureTime(desired: Date, mode: TrafficAnchorMode, now: Date = new Date()): Date {
  const desiredTime = desired.getHours() * 60 + desired.getMinutes();
  const nowTime = now.getHours() * 60 + now.getMinutes();

  if (mode === 'today') {
    // 과거 시각이어도 그대로 오늘의 해당 시각으로 사용
    return setTimeOfDay(now, desired);
  }

  if (mode === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return setTimeOfDay(tomorrow, desired);
  }

  // auto: 과거 시각이면 내일, 아니면 오늘
  if (desiredTime <= nowTime) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return setTimeOfDay(tomorrow, desired);
  }
  return setTimeOfDay(now, desired);
}

type Waypoint = { latitude: number; longitude: number; address: string };
type TimeWindow = { due?: Date | null };

function makeDepartureBucket(date: Date, minutes: number = 5) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  const rounded = Math.floor(m / minutes) * minutes;
  d.setMinutes(rounded);
  return d.toISOString(); // 버킷 키
}

function coordKey(a: Waypoint, b: Waypoint) {
  return `${a.latitude.toFixed(6)},${a.longitude.toFixed(6)}->${b.latitude.toFixed(6)},${b.longitude.toFixed(6)}`;
}

async function fetchSegmentTravel(
  cache: Map<string, { timeSec: number; distM: number }>,
  from: Waypoint,
  to: Waypoint,
  departAt: Date,
  tmapKey: string,
  vehicleTypeCode: string,
  trafficMode: 'realtime' | 'standard',
  trafficAnchor: TrafficAnchorMode,
): Promise<{ timeSec: number; distM: number; mode?: 'prediction' | 'routes-fallback' }> {
  const anchored = anchorDepartureTime(departAt, trafficAnchor);
  const bucket = makeDepartureBucket(anchored, 5);
  const key = `${coordKey(from, to)}@${bucket}@${trafficMode}@${vehicleTypeCode}`;
  const hit = cache.get(key);
  if (hit) {
    console.log(`🎯 [Tmap 캐시 히트] ${from.address} → ${to.address}`);
    return { ...hit, mode: 'prediction' };
  }

  console.log(`🚗 [Tmap 예측 호출] ${from.address} → ${to.address} (${anchored.toISOString()})`);

  // 1) Prediction 재시도
  const backoffs = [400, 900, 1600];
  for (let i = 0; i < backoffs.length; i++) {
    const result = await getTmapRoute(
      { x: from.longitude, y: from.latitude },
      { x: to.longitude, y: to.latitude },
      tmapKey,
      {
        vehicleTypeCode,
        trafficInfo: trafficMode === 'realtime' ? 'Y' : 'N',
        departureAt: anchored.toISOString()
      }
    ).catch((e) => null);
    if (result && Array.isArray(result.features)) {
      let timeSec = 0, distM = 0;
      for (const f of result.features) {
        if (f?.properties?.totalTime) timeSec += f.properties.totalTime;
        if (f?.properties?.totalDistance) distM += f.properties.totalDistance;
      }
      const val = { timeSec, distM };
      cache.set(key, val);
      console.log(`✅ [Tmap 예측 완료] ${from.address} → ${to.address}: ${timeSec}초, ${distM}m`);
      return { ...val, mode: 'prediction' };
    }
    await sleep(backoffs[i]);
  }

  // 2) 일반 routes 대체 (departureAt 없이 trafficInfo만)
  console.warn(`⚠️ [Prediction 실패 → routes 대체 시도] ${from.address} → ${to.address}`);
  for (let i = 0; i < 2; i++) {
    const result = await getTmapRoute(
      { x: from.longitude, y: from.latitude },
      { x: to.longitude, y: to.latitude },
      tmapKey,
      {
        vehicleTypeCode,
        trafficInfo: trafficMode === 'realtime' ? 'Y' : 'N',
        departureAt: null
      }
    ).catch((e) => null);
    if (result && Array.isArray(result.features)) {
      let timeSec = 0, distM = 0;
      for (const f of result.features) {
        if (f?.properties?.totalTime) timeSec += f.properties.totalTime;
        if (f?.properties?.totalDistance) distM += f.properties.totalDistance;
      }
      const val = { timeSec, distM };
      cache.set(key, val);
      console.log(`✅ [routes 대체 성공] ${from.address} → ${to.address}: ${timeSec}초, ${distM}m`);
      return { ...val, mode: 'routes-fallback' };
    }
    await sleep(600 + i * 900);
  }

  // 3) 모든 시도 실패 → 오류 throw (Haversine 폴백 사용하지 않음)
  throw new Error(`TMAP_UNAVAILABLE: ${from.address} → ${to.address}`);
}

function quickEtaMinutes(from: Waypoint, to: Waypoint): number {
  const d = haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude);
  const vKmh = 35; // 보수적 평균속도
  return Math.max(10, Math.round((d / 1000) / vKmh * 60));
}

async function selectNextStop(
  now: Date,
  current: Waypoint,
  candidates: Waypoint[],
  windows: Map<string, TimeWindow>,
  tmapCache: Map<string, { timeSec: number; distM: number }>,
  tmapKey: string,
  vehicleTypeCode: string,
  trafficMode: 'realtime' | 'standard',
  trafficAnchor: TrafficAnchorMode,
  topK: number = 3,
  preSelectN: number = 8
): Promise<{ next: Waypoint; travel: { timeSec: number; distM: number }; latenessMin: number }> {
  // 1) 전 후보에 대해 근사 ETA(quickEtaMinutes)로 프리선정
  const preSorted = [...candidates].sort((a, b) => {
    const ea = quickEtaMinutes(current, a);
    const eb = quickEtaMinutes(current, b);
    return ea - eb;
  }).slice(0, Math.max(1, Math.min(preSelectN, candidates.length)));

  // 2) 프리선정된 상위 후보 중 topK개를 Tmap 정밀 평가
  const sorted = preSorted.slice(0, Math.max(1, Math.min(topK, preSorted.length)));
  console.log(`🎯 [후보 선택] 프리선정 ${preSorted.length}개 → 정밀평가 ${sorted.length}개:`, sorted.map(s => s.address));

  let best: { next: Waypoint; travel: { timeSec: number; distM: number }; score: number; latenessMin: number } | null = null;

  for (const cand of sorted) {
    const travel = await fetchSegmentTravel(tmapCache, current, cand, now, tmapKey, vehicleTypeCode, trafficMode, trafficAnchor);
    const arrival = new Date(now.getTime() + travel.timeSec * 1000);
    const due = windows.get(cand.address)?.due ?? null;

    const latenessMin = due ? Math.max(0, Math.round((arrival.getTime() - due.getTime()) / 60000)) : 0;
    // 스코어: lateness 우선(분당 큰 가중치), 보조로 시간/거리
    const score = latenessMin * 100000 + travel.timeSec + travel.distM / 10;

    console.log(`📊 [후보 평가] ${cand.address}: 지각 ${latenessMin}분, 점수 ${score}, 이동시간 ${travel.timeSec}초`);

    if (!best || score < best.score) {
      best = { next: cand, travel, score, latenessMin };
    }
  }

  // 후보가 0인 경우(이론상 없음) 안전장치
  if (!best) {
    const cand = candidates[0];
    const travel = await fetchSegmentTravel(tmapCache, current, cand, now, tmapKey, vehicleTypeCode, trafficMode, trafficAnchor);
    return { next: cand, travel, latenessMin: 0 };
  }

  console.log(`✅ [최적 후보 선택] ${best.next.address}: 지각 ${best.latenessMin}분, 점수 ${best.score}`);
  return { next: best.next, travel: best.travel, latenessMin: best.latenessMin };
}

async function buildTimeWindowAwareRoute(
  start: Waypoint,
  waypoints: Waypoint[],
  deliveryTimes: string[],
  isNextDayFlags: boolean[],
  departureAt: string,
  tmapKey: string,
  vehicleTypeCode: string,
  trafficMode: 'realtime' | 'standard',
  trafficAnchor: TrafficAnchorMode,
  dwellMinutes: number[] = []
): Promise<{ ordered: Waypoint[]; totalLatenessMin: number }> {
  const order: Waypoint[] = [];
  const remaining = [...waypoints];
  const tmapCache = new Map<string, { timeSec: number; distM: number }>();
  let now = anchorDepartureTime(new Date(departureAt), trafficAnchor);
  let cur = start;
  let totalLatenessMin = 0;

  console.log('🚀 [시간창 우선 최적화] 시작:', {
    출발지: start.address,
    경유지수: waypoints.length,
    출발시간: now.toISOString(),
    차량타입: vehicleTypeCode,
    교통모드: trafficMode
  });

  // 시간창 맵 구성 (모든 배송완료시간을 앵커된 기준 날짜(now)로 해석)
  const windows = new Map<string, TimeWindow>();
  for (let i = 0; i < waypoints.length; i++) {
    const dueStr = (deliveryTimes[i] || '').trim();
    if (dueStr) {
      const [h, m] = dueStr.split(':').map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      windows.set(waypoints[i].address, { due: d });
      console.log(`⏰ [시간제약] ${waypoints[i].address}: ${d.toISOString()}`);
    } else {
      windows.set(waypoints[i].address, { due: null });
    }
  }

  while (remaining.length) {
    // 1) 우선순위 후보 구성: 시간창이 있는 경유지 우선
    const constrained = remaining.filter(w => windows.get(w.address)?.due);
    const unconstrained = remaining.filter(w => !windows.get(w.address)?.due);

    let candidates: Waypoint[] = constrained.length ? constrained : remaining;

    console.log(`🔄 [경로 구성] 남은 경유지 ${remaining.length}개, 시간제약 ${constrained.length}개, 자유 ${unconstrained.length}개`);

    // 2) 후보 선택(최대 K개에 대해 Tmap 예측 사용)
    const { next, travel, latenessMin } = await selectNextStop(
      now, cur, candidates, windows, tmapCache, tmapKey, vehicleTypeCode, trafficMode, trafficAnchor, 3, 8
    );

    // 3) 상태 업데이트
    const dwell = dwellMinutes[order.length + 1] ?? 10;
    now = new Date(now.getTime() + travel.timeSec * 1000 + dwell * 60 * 1000);
    cur = next;
    totalLatenessMin += Math.max(0, latenessMin);

    console.log(`📍 [경유지 방문] ${next.address}, 도착시간: ${now.toISOString()}, 체류: ${dwell}분`);

    // 4) 방문 처리
    order.push(next);
    const idx = remaining.findIndex(w => w.address === next.address);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  console.log('✅ [시간창 우선 최적화] 완료:', {
    최종경로: order.map(w => w.address),
    총지각분: totalLatenessMin,
    Tmap캐시크기: tmapCache.size
  });

  return { ordered: order, totalLatenessMin };
}

// 경로에서 특정 경유지까지의 도착시간 추정
function estimateArrivalTime(
  route: Array<{ latitude: number; longitude: number; address: string }>,
  targetIndex: number,
  startTime: string = '11:56'
): number {
  // 출발시간을 분 단위로 변환
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const baseTime = startHours * 60 + startMinutes;

  // 실제 거리를 고려한 시간 추정 (체류 미고려)
  let totalTravelTime = 0;

  // 출발지 좌표가 없으므로, 경유지 간 세그먼트만 누적 (0→1→...→targetIndex)
  // targetIndex가 0이면 이동시간 0으로 간주
  for (let i = 1; i <= targetIndex; i++) {
    const prev = route[i - 1];
    const cur = route[i];
    if (!prev || !cur) continue;
    const distance = haversineMeters(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
    const travelTime = Math.max(5, Math.ceil(distance / 600)); // 분 단위(≈시속 36km/h)
    totalTravelTime += travelTime;
  }

  return baseTime + totalTravelTime;
}

// ===== 시간제약 검증 및 스마트 제안 시스템 =====

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  suggestions: TimeAdjustmentSuggestion[];
}

interface TimeAdjustmentSuggestion {
  type: 'departure_time' | 'delivery_time' | 'ignore_constraints' | 'manual_edit';
  title: string;
  description: string;
  action: () => void;
}

interface TimeConstraintValidation {
  waypointIndex: number;
  deliveryTime: string;
  isNextDay: boolean;
  estimatedArrivalTime: number;
  requiredTime: number;
  isFeasible: boolean;
  violationMinutes: number;
}

// 시간제약 검증 및 스마트 제안 생성
function validateTimeConstraintsAndSuggest(
  startTime: string,
  waypoints: Array<{ latitude: number; longitude: number; address: string }>,
  timeConstraints: TimeConstraint[]
): ValidationResult {
  console.log('🔍 [시간제약 검증] 시작');
  console.log('검증 파라미터:', {
    startTime,
    waypointsCount: waypoints.length,
    timeConstraintsCount: timeConstraints.length,
    waypoints: waypoints.map(w => w.address),
    timeConstraints: timeConstraints.map(tc => ({
      waypointIndex: tc.waypointIndex,
      deliveryTime: tc.deliveryTime,
      isNextDay: tc.isNextDay
    }))
  });

  const validations: TimeConstraintValidation[] = [];
  const errors: string[] = [];
  const suggestions: TimeAdjustmentSuggestion[] = [];

  // 1단계: 개별 시간제약 검증
  for (const constraint of timeConstraints) {
    const waypointIndex = constraint.waypointIndex;
    if (waypointIndex >= waypoints.length) continue;

    const estimatedArrivalTime = estimateArrivalTime(waypoints, waypointIndex, startTime);
    const requiredTime = parseTimeString(constraint.deliveryTime, constraint.isNextDay);
    const violationMinutes = Math.max(0, estimatedArrivalTime - requiredTime);
    const isFeasible = violationMinutes === 0;

    validations.push({
      waypointIndex,
      deliveryTime: constraint.deliveryTime,
      isNextDay: constraint.isNextDay,
      estimatedArrivalTime,
      requiredTime,
      isFeasible,
      violationMinutes
    });

    if (!isFeasible) {
      const estimatedTimeString = `${Math.floor(estimatedArrivalTime / 60).toString().padStart(2, '0')}:${(estimatedArrivalTime % 60).toString().padStart(2, '0')}`;
      errors.push(
        `경유지 ${waypointIndex + 1}: ${constraint.deliveryTime} 도착은 불가능합니다. 
        최소 ${estimatedTimeString}에 도착 예상됩니다.`
      );
    }

    console.log(`🔍 [시간제약 검증] 경유지 ${waypointIndex + 1}:`, {
      요구시간: constraint.deliveryTime,
      예상도착시간: `${Math.floor(estimatedArrivalTime / 60).toString().padStart(2, '0')}:${(estimatedArrivalTime % 60).toString().padStart(2, '0')}`,
      위반분: violationMinutes,
      가능여부: isFeasible
    });
  }

  // 2단계: 스마트 제안 생성
  if (errors.length > 0) {
    suggestions.push(...generateSmartSuggestions(startTime, validations));
  }

  console.log('✅ [시간제약 검증] 완료:', {
    검증결과: validations.length,
    오류수: errors.length,
    제안수: suggestions.length,
    검증상세: validations.map(v => ({
      경유지: v.waypointIndex + 1,
      요구시간: v.deliveryTime,
      예상도착시간: `${Math.floor(v.estimatedArrivalTime / 60).toString().padStart(2, '0')}:${(v.estimatedArrivalTime % 60).toString().padStart(2, '0')}`,
      가능여부: v.isFeasible,
      위반분: v.violationMinutes
    })),
    오류내용: errors,
    제안내용: suggestions.map(s => s.title)
  });

  return {
    isValid: errors.length === 0,
    errors,
    suggestions
  };
}

// 스마트 제안 생성
function generateSmartSuggestions(
  startTime: string,
  validations: TimeConstraintValidation[]
): TimeAdjustmentSuggestion[] {
  const suggestions: TimeAdjustmentSuggestion[] = [];
  const failedConstraints = validations.filter(v => !v.isFeasible);

  if (failedConstraints.length === 0) return suggestions;

  // 제안 1: 출발시간을 앞당기기
  const maxViolationMinutes = Math.max(...failedConstraints.map(v => v.violationMinutes));
  const suggestedDepartureTime = adjustTimeString(startTime, -maxViolationMinutes - 30); // 30분 여유 추가

  suggestions.push({
    type: 'departure_time',
    title: '출발시간을 앞당기기',
    description: `출발시간을 ${suggestedDepartureTime}으로 앞당기면 모든 시간제약을 만족할 수 있습니다.`,
    action: () => {
      // 출발시간 조정 로직
      console.log('출발시간 조정:', suggestedDepartureTime);
    }
  });

  // 제안 2: 시간제약을 늦추기
  const averageViolationMinutes = Math.ceil(
    failedConstraints.reduce((sum, v) => sum + v.violationMinutes, 0) / failedConstraints.length
  );

  suggestions.push({
    type: 'delivery_time',
    title: '시간제약을 늦추기',
    description: `모든 시간제약을 ${averageViolationMinutes + 30}분 늦추면 현실적으로 가능합니다.`,
    action: () => {
      // 시간제약 조정 로직
      console.log('시간제약 조정:', averageViolationMinutes + 30);
    }
  });

  // 제안 3: 문제가 되는 경유지만 조정
  if (failedConstraints.length < validations.length) {
    suggestions.push({
      type: 'delivery_time',
      title: '문제가 되는 경유지만 조정',
      description: `${failedConstraints.length}개 경유지의 시간제약만 조정합니다.`,
      action: () => {
        // 선택적 시간제약 조정 로직
        console.log('선택적 시간제약 조정');
      }
    });
  }

  // 제안 4: 시간제약 무시
  suggestions.push({
    type: 'ignore_constraints',
    title: '시간제약을 무시하고 거리 최적화만 수행',
    description: '시간제약을 무시하고 거리 기반으로만 경로를 최적화합니다.',
    action: () => {
      // 시간제약 무시 로직
      console.log('시간제약 무시');
    }
  });

  // 제안 5: 수동 수정
  suggestions.push({
    type: 'manual_edit',
    title: '수동으로 시간 수정하기',
    description: '사용자가 직접 시간제약을 수정합니다.',
    action: () => {
      // 수동 수정 모드 활성화
      console.log('수동 수정 모드');
    }
  });

  return suggestions;
}

// 시간 문자열 조정 (분 단위)
function adjustTimeString(timeString: string, minutes: number): string {
  const [hours, mins] = timeString.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;

  // 음수 처리 (전날로 넘어가는 경우)
  if (totalMinutes < 0) {
    const adjustedMinutes = totalMinutes + 24 * 60;
    const newHours = Math.floor(adjustedMinutes / 60);
    const newMins = adjustedMinutes % 60;
    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
  }

  // 24시간 초과 처리
  if (totalMinutes >= 24 * 60) {
    const adjustedMinutes = totalMinutes - 24 * 60;
    const newHours = Math.floor(adjustedMinutes / 60);
    const newMins = adjustedMinutes % 60;
    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
  }

  const newHours = Math.floor(totalMinutes / 60);
  const newMins = totalMinutes % 60;
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
}

// ===== Simulated Annealing 최적화 알고리즘 =====

// Multi-Objective Route Optimization 메인 함수
async function multiObjectiveRouteOptimization(
  start: { latitude: number; longitude: number },
  waypoints: Array<{ latitude: number; longitude: number; address: string }>,
  timeConstraints: TimeConstraint[],
  params: OptimizationParams = {
    alpha: 1.0,
    beta: 1000.0,
    maxIterations: 1000,
    temperature: 1000,
    coolingRate: 0.95
  }
): Promise<RouteSolution> {
  console.log('🎯 [Multi-Objective 최적화] 시작');
  console.log('경유지 수:', waypoints.length);
  console.log('시간제약 수:', timeConstraints.length);
  console.log('최적화 파라미터:', params);

  // 1. 초기 해 생성 (시간제약 순서로)
  let currentRoute = generateInitialRoute(start, waypoints, timeConstraints);
  let currentScore = calculateObjectiveValue(currentRoute, timeConstraints, params);

  let bestRoute = [...currentRoute];
  let bestScore = currentScore;

  let temperature = params.temperature;
  let iteration = 0;

  console.log('초기 해:', {
    경로: currentRoute.map(p => p.address),
    거리: currentScore.totalDistance,
    시간패널티: currentScore.timePenalty,
    목적함수값: currentScore.objectiveValue
  });

  // 2. Simulated Annealing 반복
  while (iteration < params.maxIterations && temperature > 0.1) {
    // 3. 이웃 해 생성 (경유지 순서 변경)
    const neighborRoute = generateNeighborRoute(currentRoute, timeConstraints);
    const neighborScore = calculateObjectiveValue(neighborRoute, timeConstraints, params);

    // 4. 수용 기준 결정
    const delta = neighborScore.objectiveValue - currentScore.objectiveValue;
    const acceptanceProbability = Math.exp(-delta / temperature);

    // 5. 더 나은 해이거나 확률적으로 수용
    if (delta < 0 || Math.random() < acceptanceProbability) {
      currentRoute = neighborRoute;
      currentScore = neighborScore;

      // 6. 최적 해 업데이트
      if (currentScore.objectiveValue < bestScore.objectiveValue) {
        bestRoute = [...currentRoute];
        bestScore = currentScore;

        console.log(`🔄 [반복 ${iteration}] 새로운 최적해 발견:`, {
          목적함수값: bestScore.objectiveValue,
          거리: bestScore.totalDistance,
          시간패널티: bestScore.timePenalty
        });
      }
    }

    // 7. 온도 냉각
    temperature *= params.coolingRate;
    iteration++;
  }

  console.log('✅ [Multi-Objective 최적화] 완료:', {
    총반복횟수: iteration,
    최종온도: temperature,
    최적해: bestRoute.map(p => p.address),
    최적목적함수값: bestScore.objectiveValue,
    최적거리: bestScore.totalDistance,
    최적시간패널티: bestScore.timePenalty
  });

  return {
    route: bestRoute,
    totalDistance: bestScore.totalDistance,
    timePenalty: bestScore.timePenalty,
    objectiveValue: bestScore.objectiveValue
  };
}

// 초기 해 생성 (거리와 시간제약을 모두 고려한 스마트 배치)
function generateInitialRoute(
  start: { latitude: number; longitude: number },
  waypoints: Array<{ latitude: number; longitude: number; address: string }>,
  timeConstraints: TimeConstraint[]
): Array<{ latitude: number; longitude: number; address: string }> {
  const route: Array<{ latitude: number; longitude: number; address: string }> = [];

  // 모든 경유지를 거리와 시간제약을 고려하여 정렬
  const allWaypoints = waypoints.map((waypoint, index) => {
    const constraint = timeConstraints.find(c => c.waypointIndex === index);
    const distance = haversineMeters(
      start.latitude, start.longitude,
      waypoint.latitude, waypoint.longitude
    );

    return {
      waypoint,
      constraint,
      distance,
      originalIndex: index
    };
  });

  // 스마트 정렬: 거리 우선, 시간제약은 보조 고려
  allWaypoints.sort((a, b) => {
    // 1. 시간제약이 있는 경우 우선순위 계산
    if (a.constraint && b.constraint) {
      // 둘 다 시간제약이 있으면 거리순으로 정렬 (가까운 곳 먼저)
      return a.distance - b.distance;
    } else if (a.constraint && !b.constraint) {
      // a만 시간제약이 있으면 거리 차이가 크지 않으면 a를 먼저
      if (a.distance <= b.distance * 1.5) { // 50% 이내 차이면 시간제약 우선
        return -1;
      } else {
        return a.distance - b.distance; // 거리 차이가 크면 거리 우선
      }
    } else if (!a.constraint && b.constraint) {
      // b만 시간제약이 있으면 거리 차이가 크지 않으면 b를 먼저
      if (b.distance <= a.distance * 1.5) { // 50% 이내 차이면 시간제약 우선
        return 1;
      } else {
        return a.distance - b.distance; // 거리 차이가 크면 거리 우선
      }
    } else {
      // 둘 다 시간제약이 없으면 거리순으로 정렬
      return a.distance - b.distance;
    }
  });

  console.log('🧠 [스마트 초기해 생성] 정렬 결과:', allWaypoints.map(w => ({
    주소: w.waypoint.address,
    거리: `${Math.round(w.distance)}m`,
    시간제약: w.constraint ? `${w.constraint.deliveryTime}${w.constraint.isNextDay ? '(다음날)' : ''}` : '없음',
    원본인덱스: w.originalIndex
  })));

  // 정렬된 순서대로 경로에 추가
  for (const { waypoint } of allWaypoints) {
    route.push(waypoint);
  }

  return route;
}

// 이웃 해 생성 (경유지 순서 변경)
function generateNeighborRoute(
  currentRoute: Array<{ latitude: number; longitude: number; address: string }>,
  timeConstraints: TimeConstraint[]
): Array<{ latitude: number; longitude: number; address: string }> {
  const neighborRoute = [...currentRoute];

  // 시간제약이 있는 경유지들의 주소 찾기
  const constrainedAddresses = new Set<string>();
  for (const constraint of timeConstraints) {
    // waypointIndex를 사용하여 해당 경유지의 주소 찾기
    const waypointAddress = currentRoute[constraint.waypointIndex]?.address;
    if (waypointAddress) {
      constrainedAddresses.add(waypointAddress);
    }
  }

  // 시간제약이 없는 경유지들 중에서 두 개를 선택하여 교환
  const unconstrainedIndices = neighborRoute
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => !constrainedAddresses.has(point.address))
    .map(({ index }) => index);

  if (unconstrainedIndices.length >= 2) {
    const i = unconstrainedIndices[Math.floor(Math.random() * unconstrainedIndices.length)];
    const j = unconstrainedIndices[Math.floor(Math.random() * unconstrainedIndices.length)];

    // 두 경유지 교환
    [neighborRoute[i], neighborRoute[j]] = [neighborRoute[j], neighborRoute[i]];
  }

  return neighborRoute;
}

export async function POST(request: NextRequest) {
  console.log('🔥 [API] POST 요청 시작');
  try {
    const body = await request.json();
    console.log('📥 [API] 요청 body 파싱 완료');
    const { origins, destinations, vehicleType = '레이', optimizeOrder = true, departureAt, useRealtimeTraffic, deliveryTimes = [], isNextDayFlags = [], dwellMinutes = [] } = body;

    console.log('=== API 요청 받음 ===');
    console.log('origins:', origins);
    console.log('destinations:', destinations);
    console.log('vehicleType:', vehicleType);
    console.log('deliveryTimes:', deliveryTimes);
    console.log('isNextDayFlags:', isNextDayFlags);
    console.log('departureAt:', departureAt);
    console.log('useRealtimeTraffic:', useRealtimeTraffic);
    console.log('========================');

    // 기존: 현재시각 기준으로 과거/비현실 시간 차단하던 로직 제거
    // 사전검증(Tmap 직행)과 사후검증(최종 ETA 비교)에서 일관된 규칙으로 판단합니다.
    console.log('배송완료시간 사전 필터링 생략: 후속 Tmap 사전/사후 검증으로 판단');

    const tmapKey =
      process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY || '';
    if (!tmapKey) {
      return NextResponse.json(
        { error: 'Tmap API 키가 설정되지 않았습니다 (.env.local에 TMAP_API_KEY 또는 NEXT_PUBLIC_TMAP_API_KEY).' },
        { status: 500 }
      );
    }

    // 입력 검증 강화
    if (!origins || !destinations || origins.length === 0 || destinations.length === 0) {
      return NextResponse.json(
        { error: '출발지와 목적지가 필요합니다' },
        { status: 400 }
      );
    }

    // 출발지 좌표 변환 (Tmap 우선, 실패 시 Nominatim)
    const startAddress = typeof origins[0] === 'string' ? origins[0] : (origins[0] as any).name || (origins[0] as any).address;
    let startLocation = (origins[0] as any).latitude && (origins[0] as any).longitude
      ? { latitude: (origins[0] as any).latitude, longitude: (origins[0] as any).longitude, address: startAddress }
      : await geocodeWithTmap(startAddress, tmapKey).catch(() => geocodeWithNominatim(startAddress));

    // 좌표 유효성 검사
    if (!isValidCoordinate(startLocation.latitude, startLocation.longitude)) {
      return NextResponse.json(
        { error: '출발지 좌표가 유효하지 않습니다' },
        { status: 400 }
      );
    }

    console.log('출발지 좌표:', startLocation);

    // 목적지 좌표 변환 (Tmap 우선, 실패 시 Nominatim)
    const destinationCoords = [] as Array<{ latitude: number; longitude: number; address: string }>;
    for (const destination of destinations) {
      const destAddress = typeof destination === 'string' ? destination : ((destination as any).name || (destination as any).address);
      let preset = (destination as any).latitude && (destination as any).longitude
        ? { latitude: (destination as any).latitude, longitude: (destination as any).longitude, address: destAddress }
        : await geocodeWithTmap(destAddress, tmapKey).catch(() => geocodeWithNominatim(destAddress));

      // 좌표 유효성 검사
      if (!isValidCoordinate(preset.latitude, preset.longitude)) {
        console.warn(`목적지 좌표가 유효하지 않음: ${destAddress}`);
        // 기본값으로 서울 시청 좌표 사용
        preset = { latitude: 37.566535, longitude: 126.9779692, address: destAddress };
      }

      destinationCoords.push(preset);
    }

    console.log('모든 목적지 좌표:', destinationCoords);

    // 차량 타입 매핑 (간단 매핑: 레이=1(승용), 스타렉스=2(화물))
    const vehicleTypeCode = vehicleType === '스타렉스' ? '2' : '1';

    // 출발 시각 기반 교통 반영 결정 (토글이 우선)
    const usedTraffic = typeof useRealtimeTraffic === 'boolean'
      ? (useRealtimeTraffic ? 'realtime' : 'standard')
      : decideTrafficMode(departureAt);

    console.log('=== 교통 모드 결정 ===');
    console.log('departureAt:', departureAt);
    console.log('useRealtimeTraffic:', useRealtimeTraffic);
    console.log('usedTraffic:', usedTraffic);
    console.log('hasDepartureAt:', !!departureAt);
    console.log('========================');

    // 목적지 순서 최적화 (배송완료시간 고려)
    console.log('순서 최적화 시작:', {
      optimizeOrder,
      deliveryTimes,
      isNextDayFlags,
      originalDestinations: destinationCoords.map(d => d.address)
    });

    let orderedDestinations;
    if (optimizeOrder) {
      console.log('🎯 [Multi-Objective 최적화] 함수 호출 시작');

      // 시간제약 데이터 준비 (인덱스 정합성 유지)
      const timeConstraints: TimeConstraint[] = [];
      for (let i = 0; i < deliveryTimes.length; i++) {
        const dt = (deliveryTimes[i] || '').trim();
        if (dt !== '') {
          timeConstraints.push({
            waypointIndex: i,
            deliveryTime: dt,
            isNextDay: !!isNextDayFlags[i]
          });
        }
      }

      console.log('시간제약 데이터:', timeConstraints);
      console.log('출발시간 정보:', {
        departureAt,
        departureAtType: typeof departureAt,
        parsedTime: departureAt ? new Date(departureAt).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '없음'
      });

      // 1단계: 시간제약이 있는 경우에만 검증 수행
      if (timeConstraints.length > 0) {
        console.log('🔍 [시간제약 검증] 시작 - 시간제약이 있음');

        const startTime = departureAt ? new Date(departureAt).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '11:56';
        console.log('검증에 사용할 출발시간:', startTime);

        // 추가 검증: 출발시간이 설정되어 있는지 확인
        if (!departureAt) {
          console.log('⚠️ [시간제약 검증] 출발시간이 설정되지 않음');
          return NextResponse.json({
            success: false,
            error: 'MISSING_DEPARTURE_TIME',
            message: '시간제약이 있는 경우 출발시간을 설정해야 합니다.',
            details: {
              errors: ['출발지 배송출발시간을 설정해주세요.'],
              suggestions: []
            }
          }, { status: 400 });
        }

        // today 앵커 모드일 때: 배송완료시간이 출발시간보다 이르면 즉시 오류
        // (교통 앵커가 today로 강제되는 경우를 대비한 방어 로직)
        // 현재 기본 앵커는 auto이므로 today 전용 검증은 비활성화(필요 시 today로 전환하면 활성화)
        const isTodayAnchor = false; // 향후 요청 옵션에 따라 동적으로 결정 가능

        if (isTodayAnchor) {
          const invalidBeforeDeparture: string[] = [];
          for (const constraint of timeConstraints) {
            if (!isTimeEarlierOrEqual(startTime, constraint.deliveryTime)) {
              invalidBeforeDeparture.push(`경유지 ${constraint.waypointIndex + 1}: 배송완료시간(${constraint.deliveryTime})이 출발시간(${startTime}) 이전입니다.`);
            }
          }
          if (invalidBeforeDeparture.length) {
            return NextResponse.json({
              success: false,
              error: 'DELIVERY_TIME_BEFORE_DEPARTURE',
              message: '당일 교통 기준에서는 출발시간 이전 배송완료시간을 허용하지 않습니다.',
              details: {
                errors: invalidBeforeDeparture,
                suggestions: [
                  { type: 'departure_time', title: '출발시간을 앞당기기', description: '출발을 더 이른 시각으로 설정해주세요.' },
                  { type: 'delivery_time', title: '배송완료시간 늦추기', description: '각 경유지 배송완료시간을 출발 이후로 조정하세요.' },
                  { type: 'anchor_mode', title: '교통 앵커 auto/내일로 전환', description: '내일 교통 기준으로 재계산합니다.' }
                ]
              }
            }, { status: 400 });
          }
        }

        // 1) Tmap 기반 직행 가능성 사전검증 (시간제약 경유지 대상)
        const preErrors = await precheckDirectFeasibility(
          startLocation,
          destinationCoords,
          deliveryTimes,
          isNextDayFlags,
          departureAt as string,
          (dwellMinutes[0] ?? 10),
          tmapKey,
          vehicleTypeCode,
          usedTraffic,
          'tomorrow'
        );
        if (preErrors.length > 0) {
          return NextResponse.json({
            success: false,
            error: 'DIRECT_FEASIBILITY_FAILED',
            message: '직행 기준으로도 시간제약을 만족할 수 없습니다.',
            details: {
              errors: preErrors, suggestions: [
                { type: 'departure_time', title: '출발시간 앞당기기', description: '출발을 더 이른 시각으로 설정하면 충돌이 해소될 수 있습니다.' },
                { type: 'delivery_time', title: '문제 경유지 시간 늦추기', description: '안내된 최소 도착시각 이후로 설정하세요.' }
              ]
            }
          }, { status: 400 });
        }

        // 2) 거리기반 휴리스틱 물리 불가능 검증은 비활성화 (Tmap 우선)
        const ENABLE_HEURISTIC = false;
        if (ENABLE_HEURISTIC) {
          for (const constraint of timeConstraints) {
            const waypointLocation = destinationCoords[constraint.waypointIndex];
            const minimumTime = calculateMinimumTravelTime(startLocation, waypointLocation, constraint.waypointIndex);
            if (isPhysicallyImpossible(startTime, constraint.deliveryTime, startLocation, waypointLocation, constraint.waypointIndex)) {
              const timeDiff = (constraint.deliveryTime.split(':').map(Number)[0] * 60 + constraint.deliveryTime.split(':').map(Number)[1]) -
                (startTime.split(':').map(Number)[0] * 60 + startTime.split(':').map(Number)[1]);
              const distance = haversineMeters(startLocation.latitude, startLocation.longitude, waypointLocation.latitude, waypointLocation.longitude);
              return NextResponse.json({
                success: false,
                error: 'PHYSICALLY_IMPOSSIBLE_TIME',
                message: '물리적으로 불가능한 시간제약이 감지되었습니다.',
                details: { errors: [`경유지 ${constraint.waypointIndex + 1}: 출발시간(${startTime})에서 배송완료시간(${constraint.deliveryTime})까지 시간이 부족합니다. 거리 ${Math.round(distance)}m 기준 최소 ${minimumTime}분이 필요합니다.`] }
              }, { status: 400 });
            }
          }
        }

        const validationResult = validateTimeConstraintsAndSuggest(
          startTime,
          destinationCoords,
          timeConstraints
        );

        if (!validationResult.isValid) {
          console.log('⚠️ [시간제약 검증] 실패:', {
            오류수: validationResult.errors.length,
            제안수: validationResult.suggestions.length,
            오류내용: validationResult.errors,
            제안내용: validationResult.suggestions.map(s => s.title)
          });

          // 검증 실패 시 에러 응답 반환
          return NextResponse.json({
            success: false,
            error: 'TIME_CONSTRAINT_VIOLATION',
            message: '시간제약 충돌이 감지되었습니다.',
            details: {
              errors: validationResult.errors,
              suggestions: validationResult.suggestions
            }
          }, { status: 400 });
        }

        console.log('✅ [시간제약 검증] 통과 - 모든 시간제약이 현실적으로 가능함');
      } else {
        console.log('📝 [시간제약 검증] 건너뜀 - 시간제약이 없음');
      }

      // 2단계: Tmap 기반 시간창 우선 최적화 실행
      if (timeConstraints.length > 0) {
        // 시간제약이 있는 경우: Tmap 기반 시간창 우선 최적화
        console.log('🎯 [시간창 우선 최적화] 실행 - Tmap 예측 사용');

        const depAtStr = departureAt as string;
        const { ordered, totalLatenessMin } = await buildRouteWithAnchors(
          startLocation,
          destinationCoords,
          deliveryTimes,
          isNextDayFlags,
          depAtStr,
          tmapKey,
          vehicleTypeCode,
          usedTraffic,
          'tomorrow',
          dwellMinutes
        );

        orderedDestinations = ordered;

        console.log('✅ [시간창 우선 최적화] 완료:', {
          최적경로: orderedDestinations.map(p => p.address),
          총지각분: totalLatenessMin
        });
      } else {
        // 시간제약이 없는 경우: 단순 거리 기반 최적화
        console.log('📏 [거리 기반 최적화] 실행 - 시간제약 없음');

        orderedDestinations = nearestNeighborOrder(startLocation, destinationCoords);

        console.log('✅ [거리 기반 최적화] 완료:', {
          최적경로: orderedDestinations.map(p => p.address),
          전략: '최근접 이웃 알고리즘'
        });
      }
    } else {
      console.log('📝 [순서 최적화] 비활성화됨');
      orderedDestinations = destinationCoords;
    }

    console.log('순서 최적화 완료:', {
      originalOrder: destinationCoords.map(d => d.address),
      optimizedOrder: orderedDestinations.map(d => d.address),
      orderChanged: JSON.stringify(destinationCoords) !== JSON.stringify(orderedDestinations)
    });

    const segmentFeatures: any[] = [];
    const waypoints: Array<{ latitude: number; longitude: number }> = [];
    let totalDistance = 0;
    let totalTime = 0;
    let validationErrors: string[] = [];
    let validationWarnings: string[] = [];
    let tmapFallbackUsed = false;

    let current = startLocation;
    let currentTime = departureAt ? new Date(departureAt) : new Date();

    // 주소 → 시간제약 매핑 (최종 순서에서도 정확한 매칭 보장)
    const constraintByAddress = new Map<string, { deliveryTime: string; isNextDay: boolean }>();
    const originalIndexByAddress = new Map<string, number>();
    for (let idx = 0; idx < destinationCoords.length; idx++) {
      const raw = (deliveryTimes[idx] as any) as string | undefined;
      const dt = (raw || '').trim();
      const addr = destinationCoords[idx].address;
      originalIndexByAddress.set(addr, idx);
      if (dt) {
        constraintByAddress.set(addr, { deliveryTime: dt, isNextDay: !!isNextDayFlags[idx] });
      }
    }

    const postOrderViolations: string[] = [];

    // 검증용 시계: 체류 미고려(요청사항)
    let validationClock = new Date(currentTime);

    for (let i = 0; i < orderedDestinations.length; i++) {
      const dest = orderedDestinations[i];
      const prevAddress = i === 0 ? startLocation.address : orderedDestinations[i - 1].address;

      // 배송완료시간이 있는 경우 해당 시간을 고려한 출발시간 계산
      let segmentDepartureTime = currentTime;
      let targetDeliveryTime = null as Date | null;

      const cForDest = constraintByAddress.get(dest.address);
      if (cForDest) {
        const deliveryTime = cForDest.deliveryTime;
        const isNextDay = cForDest.isNextDay;

        if (deliveryTime) {
          const [hours, minutes] = deliveryTime.split(':').map(Number);
          const deliveryDateTime = new Date(currentTime);

          if (isNextDay) {
            // 다음날 배송인 경우
            deliveryDateTime.setDate(deliveryDateTime.getDate() + 1);
          }

          deliveryDateTime.setHours(hours, minutes, 0, 0);
          targetDeliveryTime = deliveryDateTime;

          // 배송완료시간까지 도착해야 하므로, 반복 계산으로 정확한 출발시간 계산
          segmentDepartureTime = await calculateAccurateDepartureTime(
            current,
            dest,
            deliveryDateTime,
            tmapKey,
            vehicleTypeCode,
            usedTraffic,
            vehicleType
          );
        }
      }

      console.log('=== Tmap API 호출 ===');
      console.log('from:', { x: current.longitude, y: current.latitude });
      console.log('to:', { x: dest.longitude, y: dest.latitude });
      console.log('departureAt:', segmentDepartureTime.toISOString());
      console.log('trafficInfo:', usedTraffic);
      console.log('vehicleTypeCode:', vehicleTypeCode);
      console.log('====================');

      const seg = await getTmapRoute(
        { x: current.longitude, y: current.latitude },
        { x: dest.longitude, y: dest.latitude },
        tmapKey,
        {
          vehicleTypeCode,
          trafficInfo: usedTraffic === 'realtime' ? 'Y' : 'N',
          departureAt: segmentDepartureTime.toISOString()
        }
      ).catch((error) => {
        console.warn(`Tmap API 호출 실패: ${error.message}`);
        return null as any;
      });

      if (seg && Array.isArray(seg.features)) {
        // 거리 계산 정확성 검증
        let segmentDistance = 0;
        let segmentTime = 0;

        for (const f of seg.features) {
          if (f?.properties?.totalDistance) segmentDistance += f.properties.totalDistance;
          if (f?.properties?.totalTime) segmentTime += f.properties.totalTime;
          segmentFeatures.push(f);
        }

        // 거리 계산 검증
        if (!validateDistanceCalculation(current, dest, segmentDistance)) {
          validationWarnings.push(`거리 검증 경고: ${current.address} → ${dest.address} (경로거리와 직선거리 차이가 큼)`);
          console.warn(`거리 계산 검증 경고: 계산값=${segmentDistance}m, 예상값=${haversineMeters(current.latitude, current.longitude, dest.latitude, dest.longitude)}m`);
          tmapFallbackUsed = true;
        }

        totalDistance += segmentDistance;
        totalTime += segmentTime;
        waypoints.push({ latitude: dest.latitude, longitude: dest.longitude });

        // 배송완료시간이 있는 경우, 실제 도착시간이 목표 시간과 맞는지 확인
        if (targetDeliveryTime) {
          // 검증 기준 출발시각: validationClock (체류 미고려, 앞 구간 실제 주행 후 시각)
          const actualArrival = new Date(validationClock.getTime() + (segmentTime * 1000));
          // 동일 분 내(<= HH:MM:59)는 허용: dueEndMs와 비교
          const dueMinMs = Math.floor(targetDeliveryTime.getTime() / 60000) * 60000;
          const dueEndMs = dueMinMs + 59999;
          if (actualArrival.getTime() > dueEndMs) {
            const arrivalCeilMin = Math.ceil(actualArrival.getTime() / 60000);
            const ceilDate = new Date(arrivalCeilMin * 60000);
            const hh = String(ceilDate.getHours()).padStart(2, '0');
            const mm = String(ceilDate.getMinutes()).padStart(2, '0');
            const originIdx = originalIndexByAddress.get(dest.address);
            const idxForUser = typeof originIdx === 'number' ? originIdx + 1 : (i + 1);
            const cdt = (cForDest && cForDest.deliveryTime) || `${hh}:${mm}`;
            postOrderViolations.push(`경유지 ${idxForUser}: ${cdt} 도착은 불가능합니다. 최소 ${hh}:${mm}에 도착 예상됩니다. (구간: ${prevAddress} → ${dest.address})`);
          }
        }

        // 다음 구간을 위한 현재 시간 업데이트 (이동시간 + 체류시간)
        const dwellTime = dwellMinutes[i + 1] || 10; // 경유지 체류시간
        currentTime = new Date(currentTime.getTime() + (segmentTime * 1000) + (dwellTime * 60 * 1000));

        // 검증용 시계 업데이트: 체류 미고려(운전시간만)
        validationClock = new Date(validationClock.getTime() + (segmentTime * 1000));
      } else {
        // 예측 실패 → 일반 routes 재시도
        const routesSeg = await getTmapRoute(
          { x: current.longitude, y: current.latitude },
          { x: dest.longitude, y: dest.latitude },
          tmapKey,
          {
            vehicleTypeCode,
            trafficInfo: usedTraffic === 'realtime' ? 'Y' : 'N',
            departureAt: null
          }
        ).catch(() => null as any);

        if (routesSeg && Array.isArray(routesSeg.features)) {
          let segmentDistance = 0;
          let segmentTime = 0;
          for (const f of routesSeg.features) {
            if (f?.properties?.totalDistance) segmentDistance += f.properties.totalDistance;
            if (f?.properties?.totalTime) segmentTime += f.properties.totalTime;
            segmentFeatures.push(f);
          }
          totalDistance += segmentDistance;
          totalTime += segmentTime;
          waypoints.push({ latitude: dest.latitude, longitude: dest.longitude });

          // routes 대체 사용 경고만 남김
          tmapFallbackUsed = true;
          validationWarnings.push(`예측 불가로 일반 routes 사용: ${current.address} → ${dest.address}`);

          // 시간 업데이트(체류 포함), 검증시계(체류 미포함)
          const dwellTime = dwellMinutes[i + 1] || 10;
          currentTime = new Date(currentTime.getTime() + (segmentTime * 1000) + (dwellTime * 60 * 1000));
          validationClock = new Date(validationClock.getTime() + (segmentTime * 1000));
        } else {
          // 모든 시도 실패 → 하드 에러(폴백 미사용)
          throw new Error(`TMAP_UNAVAILABLE: ${current.address} → ${dest.address}`);
        }
      }
      current = dest;
    }

    // 체류시간 계산 (경유지당 5분, 도착지 10분)
    const dwellTimePerWaypoint = 5; // 분
    const dwellTimeAtDestination = 10; // 분
    const totalDwellTime = (destinations.length - 1) * dwellTimePerWaypoint + dwellTimeAtDestination;
    const totalTimeWithDwell = totalTime + totalDwellTime;

    // 최적화된 경유지 순서 정보 생성
    const optimizationInfo = optimizeOrder ? {
      originalOrder: destinations.map((d: any, i: number) => ({ index: i, address: d.address })),
      optimizedOrder: orderedDestinations.map((d: any, i: number) => ({ index: i, address: d.address })),
      distanceSaved: calculateDistanceSavings(startLocation, destinationCoords, orderedDestinations),
    } : null;

    // 최적 경로 산출 후, 실제 도착 시각 기준으로 시간제약 위반이 있으면 에러 반환
    if (postOrderViolations.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'TIME_CONSTRAINT_VIOLATION',
        message: '시간제약 충돌이 감지되었습니다.',
        details: {
          errors: postOrderViolations,
          suggestions: [
            { type: 'departure_time', title: '출발시간을 앞당기기', description: '지각분만큼 앞당기면 충돌을 해소할 수 있습니다.' },
            { type: 'delivery_time', title: '문제 경유지 배송완료시간 늦추기', description: '경유지의 시간을 여유 있게 조정하세요.' }
          ]
        }
      }, { status: 400 });
    }

    const routeData = {
      type: 'FeatureCollection',
      features: segmentFeatures,
      summary: {
        totalDistance,
        totalTime: totalTimeWithDwell, // 체류시간 포함
        travelTime: totalTime, // 이동시간만
        dwellTime: totalDwellTime, // 체류시간
        optimizeOrder,
        usedTraffic,
        vehicleTypeCode,
        optimizationInfo,
        validation: {
          hasErrors: validationErrors.length > 0,
          errors: validationErrors,
          warnings: validationWarnings
        }
      },
      waypoints,
    };

    return NextResponse.json({
      success: true,
      data: routeData,
      warnings: validationWarnings.length > 0 ? validationWarnings : undefined
    });

  } catch (error) {
    console.error('경로 최적화 API 오류:', error);
    return NextResponse.json(
      {
        error: '경로 최적화 중 오류가 발생했습니다',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      },
      { status: (error instanceof Error && error.message.startsWith('TMAP_UNAVAILABLE')) ? 502 : 500 }
    );
  }
}

// 서버사이드 Nominatim 지오코딩 (백업)
async function geocodeWithNominatim(address: string): Promise<{ latitude: number; longitude: number; address: string }> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'ai-onggoing/1.0 (contact: dev@ongoing.example)'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status} ${response.statusText}`);
    }

    const results = await response.json();
    if (Array.isArray(results) && results.length > 0) {
      const item = results[0];
      return {
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        address: item.display_name || address
      };
    }

    // 실패 시 서울 시청 좌표 기본값
    return { latitude: 37.566535, longitude: 126.9779692, address };
  } catch (e) {
    // 네트워크/기타 에러 시 기본값
    return { latitude: 37.566535, longitude: 126.9779692, address };
  }
}

// 서버사이드 Tmap 지오코딩 (우선)
async function geocodeWithTmap(address: string, appKey: string): Promise<{ latitude: number; longitude: number; address: string }> {
  const url = new URL('https://apis.openapi.sk.com/tmap/geo/geocoding');
  url.searchParams.set('version', '1');
  url.searchParams.set('searchKeyword', address);
  url.searchParams.set('searchType', 'all');
  url.searchParams.set('searchtypCd', 'A');
  url.searchParams.set('radius', '0');
  url.searchParams.set('page', '1');
  url.searchParams.set('count', '1');
  url.searchParams.set('reqCoordType', 'WGS84GEO');
  url.searchParams.set('resCoordType', 'WGS84GEO');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { appKey: appKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Tmap geocoding failed');
  const data = await res.json();
  const poi = data?.searchPoiInfo?.pois?.poi?.[0];
  if (!poi) throw new Error('Address not found');
  return {
    latitude: parseFloat(poi.frontLat),
    longitude: parseFloat(poi.frontLon),
    address: poi.name || address,
  };
}

// Tmap 자동차 경로안내 (타임머신 기능 포함)
async function getTmapRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  appKey: string,
  opts?: { vehicleTypeCode?: string; trafficInfo?: 'Y' | 'N'; departureAt?: string | null }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    // 출발시간이 설정된 경우 타임머신 API 사용
    if (opts?.departureAt) {
      const url = 'https://apis.openapi.sk.com/tmap/routes/prediction?version=1';

      // ISO 8601 형식으로 변환 (예: 2024-12-01T14:00:00+0900)
      // 입력된 시간을 한국 시간대로 직접 변환
      const departureDate = new Date(opts.departureAt);

      // 한국 시간대로 변환 (YYYY-MM-DDTHH:MM:SS+0900)
      const year = departureDate.getFullYear();
      const month = String(departureDate.getMonth() + 1).padStart(2, '0');
      const day = String(departureDate.getDate()).padStart(2, '0');
      const hours = String(departureDate.getHours()).padStart(2, '0');
      const minutes = String(departureDate.getMinutes()).padStart(2, '0');
      const seconds = String(departureDate.getSeconds()).padStart(2, '0');

      const predictionTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+0900`;

      const body = {
        routesInfo: {
          departure: {
            name: 'start',
            lon: String(start.x),
            lat: String(start.y)
          },
          destination: {
            name: 'end',
            lon: String(end.x),
            lat: String(end.y)
          },
          predictionType: 'departure',
          predictionTime: predictionTime
        }
      };

      console.log('타임머신 API 호출:', {
        predictionTime,
        originalTime: opts.departureAt,
        departureDate: departureDate.toISOString(),
        localTime: departureDate.toString(),
        timezone: 'KST+0900'
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          appKey: appKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Tmap prediction failed: ${res.status}`);
      const result = await res.json();

      console.log('타임머신 API 응답:', {
        status: res.status,
        featuresCount: result.features?.length,
        totalTime: result.features?.[0]?.properties?.totalTime
      });

      return result;
    } else {
      // 실시간 교통정보 사용 시 기존 API
      const url = 'https://apis.openapi.sk.com/tmap/routes';
      const body: any = {
        startX: String(start.x),
        startY: String(start.y),
        endX: String(end.x),
        endY: String(end.y),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: opts?.trafficInfo === 'N' ? '1' : '0',
        trafficInfo: opts?.trafficInfo ?? 'Y',
        vehicleType: opts?.vehicleTypeCode ?? '1',
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { appKey: appKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Tmap route failed: ${res.status}`);
      const result = await res.json();

      console.log('일반 API 응답:', {
        status: res.status,
        featuresCount: result.features?.length,
        trafficInfo: body.trafficInfo,
        searchOption: body.searchOption
      });

      return result;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function decideTrafficMode(departureAt?: string | null): 'realtime' | 'standard' {
  if (!departureAt) return 'realtime'
  try {
    const dep = new Date(departureAt)
    const now = new Date()
    // 오늘 ±12시간 범위는 실시간, 그 외는 standard
    const diff = dep.getTime() - now.getTime()
    const twelveHours = 12 * 3600 * 1000
    return Math.abs(diff) <= twelveHours ? 'realtime' : 'standard'
  } catch {
    return 'realtime'
  }
}

async function nearestNeighborOrderWithTimeConstraints(
  start: { latitude: number; longitude: number },
  points: Array<{ latitude: number; longitude: number; address: string }>,
  deliveryTimes: string[],
  isNextDayFlags: boolean[] = []
): Promise<Array<{ latitude: number; longitude: number; address: string }>> {
  console.log('🚀 [고급 시간제약 최적화] 함수 호출:', {
    points: points.map(p => p.address),
    deliveryTimes,
    isNextDayFlags
  });

  // 1단계: 시간 제약이 있는 경유지들을 시간순으로 정렬
  const timeConstrainedPoints = points
    .map((point, index) => ({
      ...point,
      deliveryTime: deliveryTimes[index] || null,
      isNextDay: isNextDayFlags[index] || false,
      originalIndex: index
    }))
    .filter(point => point.deliveryTime && point.deliveryTime.trim() !== '');

  console.log('⏰ [시간제약 경유지] 원본:', timeConstrainedPoints.map(p => ({
    address: p.address,
    deliveryTime: p.deliveryTime,
    isNextDay: p.isNextDay
  })));

  // 시간순으로 정렬 (다음날 배송 고려)
  const sortedTimeConstrainedPoints = timeConstrainedPoints.sort((a, b) => {
    const timeA = a.deliveryTime!.split(':').map(Number);
    const timeB = b.deliveryTime!.split(':').map(Number);
    let minutesA = timeA[0] * 60 + timeA[1];
    let minutesB = timeB[0] * 60 + timeB[1];

    // 다음날 배송인 경우 24시간(1440분) 추가
    if (a.isNextDay) minutesA += 24 * 60;
    if (b.isNextDay) minutesB += 24 * 60;

    return minutesA - minutesB; // 오름차순 정렬 (이른 시간이 먼저)
  });

  console.log('📅 [시간제약 경유지] 정렬 후:', sortedTimeConstrainedPoints.map(p => ({
    address: p.address,
    deliveryTime: p.deliveryTime,
    isNextDay: p.isNextDay
  })));

  // 2단계: 시간 제약이 없는 경유지들
  const unconstrainedPoints = points
    .map((point, index) => ({
      ...point,
      deliveryTime: deliveryTimes[index] || null,
      originalIndex: index
    }))
    .filter(point => !point.deliveryTime);

  console.log('🔄 [시간제약 없는 경유지]:', unconstrainedPoints.map(p => p.address));

  // 3단계: 구간별 최적화 수행
  const ordered = await optimizeWithTimeSegments(
    start,
    sortedTimeConstrainedPoints as Array<{ latitude: number; longitude: number; address: string; deliveryTime: string; isNextDay: boolean; originalIndex: number }>,
    unconstrainedPoints
  );

  console.log('✅ [고급 시간제약 최적화] 완료:', {
    원래순서: points.map(p => p.address),
    최적화순서: ordered.map(p => p.address),
    시간제약경유지: sortedTimeConstrainedPoints.map(p => p.address),
    시간제약없는경유지: unconstrainedPoints.map(p => p.address),
    전략: '구간별 동선최적화 + 시간제약 고려'
  });

  return ordered;
}

// 구간별 최적화 함수
async function optimizeWithTimeSegments(
  start: { latitude: number; longitude: number },
  timeConstrainedPoints: Array<{ latitude: number; longitude: number; address: string; deliveryTime: string; isNextDay: boolean; originalIndex: number }>,
  unconstrainedPoints: Array<{ latitude: number; longitude: number; address: string; originalIndex: number }>
): Promise<Array<{ latitude: number; longitude: number; address: string }>> {
  console.log('🎯 [구간별 최적화] 시작');

  const ordered: Array<{ latitude: number; longitude: number; address: string }> = [];
  let currentPosition = { lat: start.latitude, lng: start.longitude };
  const remainingUnconstrained = [...unconstrainedPoints];

  // 시간 제약이 있는 경유지가 없는 경우: 단순 최근접 이웃 알고리즘
  if (timeConstrainedPoints.length === 0) {
    console.log('📝 [구간별 최적화] 시간제약 없음 - 단순 최적화');
    return nearestNeighborOrder({ latitude: currentPosition.lat, longitude: currentPosition.lng }, unconstrainedPoints);
  }

  // 각 시간 제약 구간별로 최적화
  for (let i = 0; i < timeConstrainedPoints.length; i++) {
    const currentTimeConstraint = timeConstrainedPoints[i];
    const nextTimeConstraint = timeConstrainedPoints[i + 1];

    console.log(`🔄 [구간 ${i + 1}] 처리 중:`, {
      현재시간제약: currentTimeConstraint.address,
      다음시간제약: nextTimeConstraint?.address || '없음'
    });

    // 현재 구간에 삽입 가능한 시간제약 없는 경유지들 찾기
    const insertablePoints = await findInsertablePoints(
      currentPosition,
      currentTimeConstraint,
      nextTimeConstraint,
      remainingUnconstrained
    );

    console.log(`📍 [구간 ${i + 1}] 삽입 가능한 경유지:`, insertablePoints.map(p => p.address));

    // 시간제약 경유지를 먼저 추가 (시간제약이 있으므로 우선순위)
    ordered.push({
      latitude: currentTimeConstraint.latitude,
      longitude: currentTimeConstraint.longitude,
      address: currentTimeConstraint.address
    });

    // 현재 구간의 시간제약 없는 경유지들을 최적화
    if (insertablePoints.length > 0) {
      const optimizedSegment = await optimizeSegment(currentPosition, insertablePoints, currentTimeConstraint);

      // 최적화된 경로를 결과에 추가
      for (const point of optimizedSegment) {
        ordered.push(point);
        // remainingUnconstrained에서 제거
        const index = remainingUnconstrained.findIndex(p => p.address === point.address);
        if (index !== -1) {
          remainingUnconstrained.splice(index, 1);
        }
      }
    }

    // 현재 위치 업데이트
    currentPosition = {
      lat: currentTimeConstraint.latitude,
      lng: currentTimeConstraint.longitude
    };
  }

  // 남은 시간제약 없는 경유지들을 마지막에 추가
  if (remainingUnconstrained.length > 0) {
    console.log('🔚 [구간별 최적화] 남은 경유지 처리:', remainingUnconstrained.map(p => p.address));
    const finalOptimized = nearestNeighborOrder({ latitude: currentPosition.lat, longitude: currentPosition.lng }, remainingUnconstrained);
    ordered.push(...finalOptimized);
  }

  console.log('✅ [구간별 최적화] 완료:', ordered.map((p, index) => ({
    순서: index + 1,
    주소: p.address
  })));

  return ordered;
}

// 구간에 삽입 가능한 경유지들 찾기
async function findInsertablePoints(
  currentPosition: { lat: number; lng: number },
  currentTimeConstraint: { latitude: number; longitude: number; deliveryTime: string; isNextDay: boolean },
  nextTimeConstraint: { latitude: number; longitude: number; deliveryTime: string; isNextDay: boolean } | undefined,
  unconstrainedPoints: Array<{ latitude: number; longitude: number; address: string; originalIndex: number }>
): Promise<Array<{ latitude: number; longitude: number; address: string; originalIndex: number }>> {
  const insertable: Array<{ latitude: number; longitude: number; address: string; originalIndex: number }> = [];

  // 현재 시간제약까지의 예상 이동시간 계산
  const currentTimeInMinutes = currentTimeConstraint.deliveryTime.split(':').map(Number);
  const targetMinutes = currentTimeInMinutes[0] * 60 + currentTimeInMinutes[1];

  // 다음날 배송인 경우 24시간 추가
  const adjustedTargetMinutes = currentTimeConstraint.isNextDay ? targetMinutes + 24 * 60 : targetMinutes;

  for (const point of unconstrainedPoints) {
    // 현재 위치에서 해당 경유지를 거쳐 시간제약 경유지까지 가는 경로가 가능한지 확인
    const isInsertable = await canInsertPoint(
      currentPosition,
      point,
      currentTimeConstraint,
      adjustedTargetMinutes
    );

    if (isInsertable) {
      insertable.push(point);
    }
  }

  return insertable;
}

// 특정 경유지 삽입 가능 여부 확인
async function canInsertPoint(
  start: { lat: number; lng: number },
  point: { latitude: number; longitude: number; address: string },
  target: { latitude: number; longitude: number; deliveryTime: string; isNextDay: boolean },
  targetMinutes: number
): Promise<boolean> {
  // 간단한 거리 기반 추정 (실제로는 Tmap API 호출 필요)
  const distanceToPoint = haversineMeters(start.lat, start.lng, point.latitude, point.longitude);
  const distanceFromPointToTarget = haversineMeters(point.latitude, point.longitude, target.latitude, target.longitude);

  // 평균 속도 30km/h로 가정하여 시간 계산
  const timeToPoint = (distanceToPoint / 1000) / 30 * 60; // 분 단위
  const timeFromPointToTarget = (distanceFromPointToTarget / 1000) / 30 * 60; // 분 단위

  const totalTime = timeToPoint + timeFromPointToTarget;

  // 현재 시간에서 목표 시간까지의 여유 시간 계산 (간단한 추정)
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const availableTime = targetMinutes - currentMinutes;

  // 여유 시간이 충분한지 확인 (최소 30분 여유)
  return availableTime >= totalTime + 30;
}

// 구간 내 최적화 (최근접 이웃 알고리즘)
async function optimizeSegment(
  start: { lat: number; lng: number },
  points: Array<{ latitude: number; longitude: number; address: string; originalIndex?: number }>,
  timeConstraint: { latitude: number; longitude: number; address: string; deliveryTime: string; isNextDay: boolean }
): Promise<Array<{ latitude: number; longitude: number; address: string }>> {
  const remaining = [...points];
  const ordered: Array<{ latitude: number; longitude: number; address: string }> = [];
  let current = start;

  // 시간제약 경유지는 마지막에 배치
  const timeConstraintIndex = remaining.findIndex(p => p.address === timeConstraint.address);
  if (timeConstraintIndex !== -1) {
    remaining.splice(timeConstraintIndex, 1);
  }

  // 나머지 경유지들을 최근접 이웃으로 배치
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const d = haversineMeters(current.lat, current.lng, p.latitude, p.longitude);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const [chosen] = remaining.splice(bestIdx, 1);
    ordered.push({
      latitude: chosen.latitude,
      longitude: chosen.longitude,
      address: chosen.address
    });
    current = { lat: chosen.latitude, lng: chosen.longitude };
  }

  return ordered;
}

function nearestNeighborOrder(
  start: { latitude: number; longitude: number },
  points: Array<{ latitude: number; longitude: number; address: string }>
) {
  const remaining = [...points]
  const ordered: typeof points = []
  let cur = { lat: start.latitude, lng: start.longitude }
  while (remaining.length) {
    let bestIdx = 0
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]
      const d = haversineMeters(cur.lat, cur.lng, p.latitude, p.longitude)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1)
    ordered.push(chosen)
    cur = { lat: chosen.latitude, lng: chosen.longitude }
  }
  return ordered
}

// 거리 기반 + 시간대별 예상 이동시간 계산 함수
function calculateEstimatedTravelTime(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  targetTime: Date,
  vehicleType: string = '레이'
): number {
  // 직선 거리 계산 (미터)
  const distance = haversineMeters(startLat, startLng, endLat, endLng);
  const distanceKm = distance / 1000;

  // 시간대별 평균 속도 (km/h)
  const hour = targetTime.getHours();
  let averageSpeed: number;

  if (hour >= 7 && hour <= 9) {
    averageSpeed = 25; // 출근시간 (혼잡)
  } else if (hour >= 18 && hour <= 20) {
    averageSpeed = 30; // 퇴근시간 (혼잡)
  } else if (hour >= 22 || hour <= 6) {
    averageSpeed = 50; // 야간 (원활)
  } else if (hour >= 10 && hour <= 17) {
    averageSpeed = 40; // 주간 (보통)
  } else {
    averageSpeed = 35; // 기타 시간
  }

  // 차량 타입별 속도 조정
  if (vehicleType === '스타렉스') {
    averageSpeed *= 0.9; // 화물차는 승용차보다 느림
  }

  // 예상 이동시간 계산 (분)
  const estimatedMinutes = (distanceKm / averageSpeed) * 60;

  // 최소 10분, 최대 120분으로 제한
  const clampedMinutes = Math.max(10, Math.min(120, estimatedMinutes));

  console.log(`예상 이동시간 계산: 거리=${distanceKm.toFixed(1)}km, 시간대=${hour}시, 속도=${averageSpeed.toFixed(1)}km/h, 예상시간=${clampedMinutes.toFixed(1)}분`);

  return clampedMinutes * 60 * 1000; // 밀리초로 변환
}

// 반복 계산으로 정확한 출발시간 계산 함수
async function calculateAccurateDepartureTime(
  start: { latitude: number; longitude: number },
  dest: { latitude: number; longitude: number },
  targetDeliveryTime: Date,
  tmapKey: string,
  vehicleTypeCode: string,
  usedTraffic: 'realtime' | 'standard',
  vehicleType: string
): Promise<Date> {
  // 1차: 예상 시간으로 계산
  const estimatedTravelTime = calculateEstimatedTravelTime(
    start.latitude, start.longitude,
    dest.latitude, dest.longitude,
    targetDeliveryTime,
    vehicleType
  );

  let segmentDepartureTime = new Date(targetDeliveryTime.getTime() - estimatedTravelTime);

  console.log(`1차 예상 출발시간: ${segmentDepartureTime.toLocaleString()}, 예상 이동시간: ${Math.round(estimatedTravelTime / 60000)}분`);

  // 2차: Tmap API로 실제 시간 확인
  try {
    const seg = await getTmapRoute(
      { x: start.longitude, y: start.latitude },
      { x: dest.longitude, y: dest.latitude },
      tmapKey,
      {
        vehicleTypeCode,
        trafficInfo: usedTraffic === 'realtime' ? 'Y' : 'N',
        departureAt: segmentDepartureTime.toISOString()
      }
    );

    if (seg && Array.isArray(seg.features)) {
      let actualTravelTime = 0;
      for (const f of seg.features) {
        if (f?.properties?.totalTime) actualTravelTime += f.properties.totalTime;
      }

      const actualTravelTimeMs = actualTravelTime * 1000; // 초를 밀리초로 변환
      const timeDifference = actualTravelTimeMs - estimatedTravelTime;

      console.log(`2차 실제 이동시간: ${Math.round(actualTravelTimeMs / 60000)}분, 차이: ${Math.round(timeDifference / 60000)}분`);

      // 3차: 5분 이상 차이나면 출발시간 조정
      if (Math.abs(timeDifference) > 5 * 60 * 1000) {
        segmentDepartureTime = new Date(targetDeliveryTime.getTime() - actualTravelTimeMs);
        console.log(`3차 조정된 출발시간: ${segmentDepartureTime.toLocaleString()}`);

        // 최종 검증: 조정된 시간으로 다시 한 번 확인
        const finalSeg = await getTmapRoute(
          { x: start.longitude, y: start.latitude },
          { x: dest.longitude, y: dest.latitude },
          tmapKey,
          {
            vehicleTypeCode,
            trafficInfo: usedTraffic === 'realtime' ? 'Y' : 'N',
            departureAt: segmentDepartureTime.toISOString()
          }
        );

        if (finalSeg && Array.isArray(finalSeg.features)) {
          let finalTravelTime = 0;
          for (const f of finalSeg.features) {
            if (f?.properties?.totalTime) finalTravelTime += f.properties.totalTime;
          }

          const finalArrivalTime = new Date(segmentDepartureTime.getTime() + (finalTravelTime * 1000));
          const finalDifference = targetDeliveryTime.getTime() - finalArrivalTime.getTime();

          console.log(`최종 검증: 목표시간=${targetDeliveryTime.toLocaleString()}, 실제도착시간=${finalArrivalTime.toLocaleString()}, 차이=${Math.round(finalDifference / 60000)}분`);
        }
      }
    }
  } catch (error) {
    console.warn(`반복 계산 중 Tmap API 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}, 예상 시간 사용`);
  }

  return segmentDepartureTime;
}

// 최적화로 절약된 거리 계산
function calculateDistanceSavings(
  start: { latitude: number; longitude: number },
  originalOrder: Array<{ latitude: number; longitude: number; address: string }>,
  optimizedOrder: Array<{ latitude: number; longitude: number; address: string }>
): number {
  // 원래 순서로 계산된 총 거리
  let originalDistance = 0;
  let current = start;

  for (const dest of originalOrder) {
    originalDistance += haversineMeters(current.latitude, current.longitude, dest.latitude, dest.longitude);
    current = dest;
  }

  // 최적화된 순서로 계산된 총 거리
  let optimizedDistance = 0;
  current = start;

  for (const dest of optimizedOrder) {
    optimizedDistance += haversineMeters(current.latitude, current.longitude, dest.latitude, dest.longitude);
    current = dest;
  }

  // 절약된 거리 (미터 단위)
  return Math.max(0, originalDistance - optimizedDistance);
}

export async function GET() {
  return NextResponse.json(
    { message: 'Route optimization API is running' },
    { status: 200 }
  );
}

async function buildRouteWithAnchors(
  start: Waypoint,
  waypoints: Waypoint[],
  deliveryTimes: string[],
  isNextDayFlags: boolean[],
  departureAt: string,
  tmapKey: string,
  vehicleTypeCode: string,
  trafficMode: 'realtime' | 'standard',
  trafficAnchor: 'today' | 'tomorrow' | 'auto',
  dwellMinutes: number[] = []
): Promise<{ ordered: Waypoint[]; totalLatenessMin: number }> {
  const tmapCache = new Map<string, { timeSec: number; distM: number }>();
  const ordered: Waypoint[] = [];
  const validationWarnings: string[] = [];

  // 분류
  const constrained: { idx: number; wp: Waypoint; due: Date }[] = [];
  const unconstrained: { idx: number; wp: Waypoint }[] = [];

  const baseNow = anchorDepartureTime(new Date(departureAt), trafficAnchor);
  for (let i = 0; i < waypoints.length; i++) {
    const dt = (deliveryTimes[i] || '').trim();
    if (dt) {
      const [h, m] = dt.split(':').map(Number);
      const due = new Date(baseNow);
      if (isNextDayFlags[i]) due.setDate(due.getDate() + 1);
      due.setHours(h, m, 0, 0);
      constrained.push({ idx: i, wp: waypoints[i], due });
    } else {
      unconstrained.push({ idx: i, wp: waypoints[i] });
    }
  }

  // 제약 경유지 시간순
  constrained.sort((a, b) => a.due.getTime() - b.due.getTime());

  let cur = start;
  let now = new Date(baseNow);
  let totalLatenessMin = 0;

  // 유틸: 세그먼트 이동시간
  const move = async (a: Waypoint, b: Waypoint, depart: Date) =>
    fetchSegmentTravel(tmapCache, a, b, depart, tmapKey, vehicleTypeCode, trafficMode, trafficAnchor);

  // 각 제약 사이에 비제약 삽입
  for (let i = 0; i < constrained.length; i++) {
    const anchor = constrained[i];

    // 엄격 앵커 모드: 앵커 이전에 어떠한 비제약도 삽입하지 않음
    const STRICT_ANCHOR = false;
    if (!STRICT_ANCHOR) {
      // 슬랙 내 삽입 루프 (비활성화 시 건너뜀)
      while (true) {
        // 직행 시간
        const direct = await move(cur, anchor.wp, now);
        const directArrive = new Date(now.getTime() + direct.timeSec * 1000);
        const slackMs = anchor.due.getTime() - directArrive.getTime();
        const SAFETY_BUFFER_MS = 0; // 버퍼 0분: Tmap ETA 기준으로만 판단
        if (slackMs <= SAFETY_BUFFER_MS) break; // 여유가 부족하면 삽입 금지

        // 후보 평가(K=3 가까운 순)
        const sorted = [...unconstrained].sort((x, y) =>
          haversineMeters(cur.latitude, cur.longitude, x.wp.latitude, x.wp.longitude) -
          haversineMeters(cur.latitude, cur.longitude, y.wp.latitude, y.wp.longitude)
        ).slice(0, Math.min(3, unconstrained.length));

        let bestIdx = -1;
        let bestArrivalToAnchor: Date | null = null;
        for (let c = 0; c < sorted.length; c++) {
          const cand = sorted[c];
          const toCand = await move(cur, cand.wp, now);
          const dwell = dwellMinutes[cand.idx + 1] ?? 10; // 경유지 체류 기본 10
          const departFromCand = new Date(now.getTime() + toCand.timeSec * 1000 + dwell * 60 * 1000);
          const candToAnchor = await move(cand.wp, anchor.wp, departFromCand);
          const arriveAnchor = new Date(departFromCand.getTime() + candToAnchor.timeSec * 1000);
          // 안전 여유 포함해서 앵커 시간 이내여야 삽입 허용
          if (arriveAnchor.getTime() + SAFETY_BUFFER_MS <= anchor.due.getTime()) {
            if (!bestArrivalToAnchor || arriveAnchor.getTime() > bestArrivalToAnchor.getTime()) {
              bestArrivalToAnchor = arriveAnchor;
              bestIdx = unconstrained.findIndex(u => u.idx === cand.idx);
            }
          }
        }

        if (bestIdx === -1) break; // 더 이상 삽입 불가

        // 삽입 실행
        const chosen = unconstrained.splice(bestIdx, 1)[0];
        const toChosen = await move(cur, chosen.wp, now);
        ordered.push(chosen.wp);
        const dwellChosen = dwellMinutes[chosen.idx + 1] ?? 10;
        now = new Date(now.getTime() + toChosen.timeSec * 1000 + dwellChosen * 60 * 1000);
        cur = chosen.wp;
      }
    }

    // 앵커 경유지 이동
    const toAnchor = await move(cur, anchor.wp, now);
    if (toAnchor.mode === 'routes-fallback') {
      validationWarnings.push(`예측 불가로 일반 routes 사용: ${cur.address} → ${anchor.wp.address}`);
    }
    const arriveAt = new Date(now.getTime() + toAnchor.timeSec * 1000);
    const lateness = Math.max(0, Math.ceil((arriveAt.getTime() - anchor.due.getTime()) / 60000));
    totalLatenessMin += lateness;
    ordered.push(anchor.wp);
    const dwellAnchor = dwellMinutes[anchor.idx + 1] ?? 10;
    now = new Date(arriveAt.getTime() + dwellAnchor * 60 * 1000);
    cur = anchor.wp;
  }

  // 남은 비제약은 순차적으로(가까운 순) 배치
  while (unconstrained.length) {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < unconstrained.length; i++) {
      const d = haversineMeters(cur.latitude, cur.longitude, unconstrained[i].wp.latitude, unconstrained[i].wp.longitude);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const next = unconstrained.splice(best, 1)[0];
    const toNext = await move(cur, next.wp, now);
    if (toNext.mode === 'routes-fallback') {
      validationWarnings.push(`예측 불가로 일반 routes 사용: ${cur.address} → ${next.wp.address}`);
    }
    ordered.push(next.wp);
    const dwellNext = dwellMinutes[next.idx + 1] ?? 10;
    now = new Date(now.getTime() + toNext.timeSec * 1000 + dwellNext * 60 * 1000);
    cur = next.wp;
  }

  return { ordered, totalLatenessMin };
}

// Tmap 기반 직행 가능성 사전검증: 출발지에서 각 시간제약 경유지로 바로 이동했을 때 목표시간 내 도달 가능한지 확인
async function precheckDirectFeasibility(
  start: { latitude: number; longitude: number; address: string },
  waypoints: Array<{ latitude: number; longitude: number; address: string }>,
  deliveryTimes: string[],
  isNextDayFlags: boolean[],
  departureAt: string,
  originDwellMinutes: number,
  tmapKey: string,
  vehicleTypeCode: string,
  trafficMode: 'realtime' | 'standard',
  trafficAnchor: 'today' | 'tomorrow' | 'auto'
): Promise<string[]> {
  const cache = new Map<string, { timeSec: number; distM: number }>();
  const base = anchorDepartureTime(new Date(departureAt), trafficAnchor);
  // 출발지 체류 반영
  const depart = new Date(base.getTime() + originDwellMinutes * 60 * 1000);

  const errors: string[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    const dt = (deliveryTimes[i] || '').trim();
    if (!dt) continue; // 시간제약 없는 경유지는 사전검증 대상 아님

    const toWp = await fetchSegmentTravel(
      cache,
      { latitude: start.latitude, longitude: start.longitude, address: start.address },
      { latitude: waypoints[i].latitude, longitude: waypoints[i].longitude, address: waypoints[i].address },
      depart,
      tmapKey,
      vehicleTypeCode,
      trafficMode,
      trafficAnchor
    );

    const [h, m] = dt.split(':').map(Number);
    const due = new Date(base);
    if (isNextDayFlags[i]) due.setDate(due.getDate() + 1);
    due.setHours(h, m, 0, 0);

    const arrive = new Date(depart.getTime() + toWp.timeSec * 1000);
    // 동일 분 내(<= HH:MM:59)는 허용
    const dueMinMs = Math.floor(due.getTime() / 60000) * 60000;
    const dueEndMs = dueMinMs + 59999;
    if (arrive.getTime() > dueEndMs) {
      const arrivalCeilMin = Math.ceil(arrive.getTime() / 60000);
      const ceilDate = new Date(arrivalCeilMin * 60000);
      const ah = String(ceilDate.getHours()).padStart(2, '0');
      const am = String(ceilDate.getMinutes()).padStart(2, '0');
      errors.push(`경유지 ${i + 1}: 직행 기준 ${dt} 도착은 불가능합니다. 최소 ${ah}:${am} 도착.`);
    }
  }
  return errors;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
} 