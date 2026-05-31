/**
 * 배차 도메인 1급 타입: 역할(pickup/drop/return) 기반 경유지 + 정기 빈도 + 시나리오.
 *
 * 기존 견적 모델은 "출발지 1개 + 목적지 배열"로 평탄화되어 있어
 *   (1) 다중 수거 → 단일 하차의 의미 구분,
 *   (2) 정기 수거 빈도(분기 1회 = 연 4회)의 정량화,
 *   (3) 3/5/10개 지점 시나리오 동시 비교
 * 를 다루지 못했다. 본 모듈은 이 세 가지를 정식 타입으로 도입한다.
 */

export type Vehicle = 'ray' | 'starex';
export type VehicleLabel = '레이' | '스타렉스';
export type ScheduleType = 'regular' | 'ad-hoc';

/** 경유지의 물류 역할. 수거/하차/반납/단순경유를 구분한다. */
export type StopRole = 'pickup' | 'drop' | 'return' | 'waypoint';

export interface RouteStop {
  address: string;
  latitude?: number;
  longitude?: number;
  /** 물류 역할. 미지정 시 waypoint로 취급. */
  role: StopRole;
  /** 지점별 물량(kg). 적재량/차종 판단 및 향후 분할 운행에 사용. */
  weightKg?: number;
  /** 체류/상하차 작업 시간(분). */
  dwellMinutes?: number;
  /** "HH:mm" 도착 데드라인(선택). */
  deliveryTime?: string;
  /** deliveryTime이 익일 기준인지. */
  isNextDay?: boolean;
  priority?: 'high' | 'medium' | 'low';
  memo?: string;
}

/** 정기 수거 빈도. "분기 1회"는 { per: 'quarter', count: 1 }. */
export interface Frequency {
  per: 'day' | 'week' | 'month' | 'quarter' | 'year';
  /** 해당 주기당 횟수. 분기 1회면 1, 주 2회면 2. */
  count: number;
  /** 최소 계약 기간(개월). 옹고잉 기본 정기 계약은 3개월. */
  contractMonths?: number;
}

/** 경로 산출 결과(거리/시간/경유지 수). Tmap 또는 사전 계산값에서 채워진다. */
export interface RouteMetrics {
  /** 총 거리(km). */
  km: number;
  /** 주행 시간(분, 체류 제외). */
  driveMinutes: number;
  /** 체류 시간 합(분). */
  dwellMinutes: number;
  /** 중간 경유지 수(최종 하차지 제외). 정액 경유비 산정 기준. */
  stopsCount: number;
  /** open-start로 시스템이 선택한 출발지(주소). 미사용 시 undefined. */
  chosenOrigin?: string;
  /** 출발지 선택 근거(대안 대비 절감). open-start 미사용 시 null/undefined. */
  originRationale?: OriginRationale | null;
}

/**
 * open-start 출발지 선택 근거(대안 대비 절감).
 * 엔진(openStartOptimizer)이 산출한 값을 UI/문서가 그대로 소비한다.
 */
export interface OriginRationale {
  /** 선택된 출발지 라벨(주소). */
  chosenLabel: string;
  /** 차선 출발지 라벨. 후보가 1개뿐이면 null. */
  runnerUpLabel: string | null;
  /** 차선 대비 단축된 총 이동시간(분, 양수면 그만큼 빠름). */
  deltaMin: number;
  /** 차선 대비 단축된 총 이동거리(km). */
  deltaKm: number;
}

/** 한 건의 견적 시나리오 입력. (예: "3개 지점 수거 → 문래역 하차") */
export interface QuoteScenario {
  /** 비교 테이블에 노출할 라벨. 예: "3개 지점". */
  label: string;
  stops: RouteStop[];
  vehicleType: VehicleLabel;
  scheduleType: ScheduleType;
  frequency?: Frequency;
  /** 사전 계산된 경로 메트릭(있으면 Tmap 재호출 생략). */
  routeMetrics?: RouteMetrics;
}

/** 시나리오 견적 산출 결과. */
export interface ScenarioQuoteResult {
  label: string;
  vehicleType: VehicleLabel;
  scheduleType: ScheduleType;
  metrics: RouteMetrics;
  counts: {
    pickup: number;
    drop: number;
    return: number;
    totalStops: number;
  };
  /** 1회 운행 운임(원). 기본은 옹고잉 유리(시간당/단건 중 높은) 요금제 기준. */
  oneTimePrice: number;
  /** 연 환산 운임(원). frequency 없으면 oneTimePrice와 동일. */
  annualPrice: number;
  /** 빈도를 사람이 읽는 라벨. 예: "연 4회 (분기 1회)". */
  frequencyLabel: string | null;
  /** 대표값(oneTimePrice)으로 채택된 요금제. 기본은 옹고잉 유리(higher). */
  recommendedPlan: 'hourly' | 'perJob';
  /** 두 요금제 모두의 산출 결과. 화주 객관성/투명성 비교용. */
  plans: {
    hourly: {
      total: number;
      /** 30분 단위 과금 시간(분). */
      billMinutes: number;
      ratePerHour: number;
      base: number;
      fuelSurcharge: number;
    };
    perJob: {
      total: number;
      base: number;
      stopFee: number;
    };
  };
  breakdown: {
    base: number;
    stopFee: number;
    fuelSurcharge: number;
    annualVisits: number;
  };
}

export function toVehicleKey(label: VehicleLabel | string | undefined): Vehicle {
  return label === '스타렉스' ? 'starex' : 'ray';
}

export function countStopRoles(stops: RouteStop[]): ScenarioQuoteResult['counts'] {
  const counts = { pickup: 0, drop: 0, return: 0, totalStops: stops.length };
  for (const stop of stops) {
    if (stop.role === 'pickup') counts.pickup += 1;
    else if (stop.role === 'drop') counts.drop += 1;
    else if (stop.role === 'return') counts.return += 1;
  }
  return counts;
}
