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
  dwellMinutes: z.number().optional().describe('상하차/작업 체류 시간(분).'),
  deliveryTime: z.string().optional().describe('"HH:mm" 도착 데드라인.'),
  memo: z.string().optional(),
});

export const VehicleLabelSchema = z.enum(['레이', '스타렉스']);
export const ScheduleTypeSchema = z.enum(['regular', 'ad-hoc']);

export const QuoteScenarioSchema = z.object({
  label: z.string().min(1).describe('비교 테이블 라벨. 예: "3개 지점".'),
  stops: z.array(RouteStopSchema).min(1),
  vehicleType: VehicleLabelSchema.default('레이'),
  scheduleType: ScheduleTypeSchema.default('ad-hoc'),
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

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  const readinessScore = Math.max(0, Math.min(1, 1 - errorCount * 0.5 - warnCount * 0.12));
  return { isReady: errorCount === 0, readinessScore: Number(readinessScore.toFixed(2)), issues, counts };
}
