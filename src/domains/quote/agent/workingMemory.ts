/**
 * 견적 에이전트 워킹 메모리 + 공유 zod 스키마.
 *
 * 기존 파이프라인의 "정규식 슬롯 채우기"(conversationStateManager)를 대체한다.
 * 에이전트는 사용자 메시지를 추론으로 해석해 RoutePlanDraft / Scenario 구조를 직접
 * 만들고, 도구 경계에서 본 스키마로 검증한다(zod). 모든 도구가 이 스키마를 공유해
 * 타입 정합성을 유지한다.
 */

import { z } from 'zod';
import type {
  Frequency,
  QuoteScenario,
  RouteStop,
  StopRole,
} from '@/domains/dispatch/types/routePlan';

export const StopRoleSchema = z.enum(['pickup', 'drop', 'return', 'waypoint']);
export const StopOperationSchema = z.object({
  type: z.enum(['pickup', 'drop', 'return']).describe('이 지점에서 수행할 실제 작업. 배송 후 수거면 drop과 pickup을 둘 다 넣고, 반납지는 return을 쓴다.'),
  label: z.string().optional().describe('화물/업무 구분명. 예: 도시락 배송, 빈 가방 수거.'),
  quantity: z.number().nonnegative().optional(),
  weightKg: z.number().nonnegative().optional(),
});
export const StopScheduleSchema = z.object({
  type: z
    .enum([
      'ready',
      'service-start',
      'departure',
      'arrival-deadline',
      'completion-deadline',
      'appointment',
    ])
    .describe('ready=물품 준비, service-start=작업 시작, departure=차량 출발, arrival-deadline=도착 마감, completion-deadline=작업 완료 마감, appointment=예약시각.'),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).describe('24시간제 HH:mm.'),
  isNextDay: z.boolean().optional(),
});

export const FrequencySchema = z.object({
  per: z.enum(['day', 'week', 'month', 'quarter', 'year']),
  count: z.number().int().positive().describe('해당 주기당 횟수. 분기 1회면 1, 주 2회면 2.'),
  contractMonths: z.number().int().positive().optional().describe('최소 계약 개월. 정기 기본 3.'),
});

export const RouteStopSchema = z.object({
  address: z.string().min(1).describe('주소 또는 POI명(예: "노원구청", "서울시 강남구 테헤란로 152").'),
  role: StopRoleSchema.describe('물류 역할: pickup(상차/수거), drop(하차/배송), return(반납), waypoint(단순 경유).'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  weightKg: z.number().optional().describe('지점별 물량(kg).'),
  quantity: z.number().optional().describe('지점별 물량 개수(예: 도시락 30). weightKg(kg)와 별개. 차종·체류시간 판단 참고용.'),
  dwellMinutes: z.number().optional().describe('상하차/작업 체류 시간(분).'),
  operations: z
    .array(StopOperationSchema)
    .optional()
    .describe('한 지점의 복합 작업. "배송 및 수거"는 [{type:"drop"},{type:"pickup"}]처럼 둘 다 넣는다. role은 경로상의 대표 역할로 유지한다.'),
  schedule: StopScheduleSchema
    .optional()
    .describe('시각의 운영 의미. "10:20 상차"가 상차 시작이면 service-start, "10:20 출발"이면 departure로 구분한다.'),
  deliveryTime: z.string().optional().describe("'HH:mm' 배송(drop) 도착 마감 전용. 상차(pickup)의 '물품 준비 시각'은 여기 넣지 마라(도착 마감으로 오인돼 비현실 충돌을 유발) — 준비시각은 출발시각/방문 순서로 다뤄라."),
  deliveryTimeType: z
    .enum(['deadline', 'appointment'])
    .optional()
    .describe("deadline='그 시각까지'라 조기 도착 대기 없음(기본). appointment='그 시각 예약/정시 배송'이라 조기배송 금지 대기 적용."),
  isNextDay: z.boolean().optional().describe('deliveryTime이 익일 기준이면 true.'),
  memo: z.string().optional(),
});

export const VehicleLabelSchema = z.enum(['레이', '스타렉스']);
export const ScheduleTypeSchema = z.enum(['regular', 'ad-hoc']);

export const QuoteScenarioSchema = z.object({
  label: z.string().min(1).describe('비교 테이블 라벨. 예: "3개 지점".'),
  stops: z.array(RouteStopSchema).min(1),
  vehicleType: VehicleLabelSchema.default('레이'),
  scheduleType: ScheduleTypeSchema.default('ad-hoc'),
  includePerJobReference: z
    .boolean()
    .default(false)
    .describe('사용자가 단건 운임 비교를 명시적으로 요청한 경우에만 true. 공식 대표 견적은 항상 시간당.'),
  frequency: FrequencySchema.optional(),
});

export const RouteMetricsSchema = z.object({
  km: z.number().nonnegative(),
  driveMinutes: z.number().nonnegative(),
  dwellMinutes: z.number().nonnegative().default(0),
  stopsCount: z.number().nonnegative().default(0),
});

/** 대화 동안 누적되는 견적 초안(working memory). */
export const RoutePlanDraftSchema = z.object({
  stops: z.array(RouteStopSchema).default([]),
  vehicleType: VehicleLabelSchema.optional(),
  scheduleType: ScheduleTypeSchema.optional(),
  frequency: FrequencySchema.optional(),
  openQuestions: z.array(z.string()).default([]),
});

export type RoutePlanDraft = z.infer<typeof RoutePlanDraftSchema>;

/** zod 입력을 도메인 타입으로 좁히는 헬퍼(런타임 동일, 타입만 정리). */
export function toDomainStops(stops: z.infer<typeof RouteStopSchema>[]): RouteStop[] {
  return stops.map((s) => ({ ...s, role: s.role as StopRole }));
}

export function toDomainScenario(s: z.infer<typeof QuoteScenarioSchema>): QuoteScenario {
  return {
    label: s.label,
    stops: toDomainStops(s.stops),
    vehicleType: s.vehicleType,
    scheduleType: s.scheduleType,
    includePerJobReference: s.includePerJobReference,
    frequency: s.frequency as Frequency | undefined,
  };
}

export interface PlanValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface PlanValidationResult {
  isReady: boolean;
  readinessScore: number;
  issues: PlanValidationIssue[];
  counts: { pickup: number; drop: number; return: number; waypoint: number; total: number };
}

const ROAD_ADDRESS_HINT = /(로|길|대로|번길|\d+-\d+|\d+번지|읍|면|동\s*\d+)/;

/**
 * 경로 계획을 검증한다 — 하드 게이트가 아니라 "이슈 피드백"으로 쓰인다.
 * 에이전트는 issues를 보고 보정/질문/진행을 스스로 결정한다.
 */
export function validatePlan(stops: RouteStop[], frequency?: Frequency): PlanValidationResult {
  const issues: PlanValidationIssue[] = [];
  const counts = { pickup: 0, drop: 0, return: 0, waypoint: 0, total: stops.length };
  for (const s of stops) counts[s.role] += 1;

  if (stops.length === 0) {
    issues.push({ code: 'NO_STOPS', message: '경유지가 하나도 없습니다.', severity: 'error' });
  }
  if (counts.pickup === 0 && counts.waypoint === 0) {
    issues.push({ code: 'NO_ORIGIN', message: '출발(수거/상차) 지점이 없습니다.', severity: 'error' });
  }
  if (counts.drop === 0 && counts.return === 0 && counts.total > 1) {
    issues.push({ code: 'NO_DESTINATION', message: '하차/반납 지점이 없습니다.', severity: 'warning' });
  }

  // 주소성: 좌표가 없고 도로명/번지 힌트도 없는 모호 주소 카운트
  const vague = stops.filter(
    (s) => s.latitude == null && !ROAD_ADDRESS_HINT.test(s.address) && s.address.length < 4
  );
  if (vague.length > 0) {
    issues.push({
      code: 'VAGUE_ADDRESS',
      message: `주소가 모호한 지점 ${vague.length}건: ${vague.map((v) => v.address).join(', ')}`,
      severity: 'warning',
    });
  }

  // 중복 주소
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const s of stops) {
    const key = s.address.trim();
    if (seen.has(key)) dups.push(key);
    seen.add(key);
  }
  if (dups.length > 0) {
    issues.push({
      code: 'DUPLICATE_STOP',
      message: `중복 지점 ${dups.length}건: ${dups.join(', ')}`,
      severity: 'warning',
    });
  }

  if (frequency && frequency.count <= 0) {
    issues.push({ code: 'BAD_FREQUENCY', message: '빈도 횟수가 올바르지 않습니다.', severity: 'error' });
  }

  // 물량(개수) 하한 참고: 총 물량이 많으면 레이 적재 한계를 넘을 수 있어 차종/체류시간 상향 검토를 권고한다.
  // severity는 'warning'이라 isReady를 바꾸지 않는다(차종 비교 판단은 프롬프트에 맡김).
  const totalQuantity = stops.reduce((acc, s) => acc + (s.quantity ?? 0), 0);
  if (totalQuantity > 40) {
    issues.push({
      code: 'HIGH_QUANTITY',
      message: `총 물량 ${totalQuantity}개 — 레이 적재 한계 확인 또는 스타렉스 검토 권장`,
      severity: 'warning',
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  const readinessScore = Math.max(0, Math.min(1, 1 - errorCount * 0.5 - warnCount * 0.12));
  return { isReady: errorCount === 0, readinessScore: Number(readinessScore.toFixed(2)), issues, counts };
}
