import type { StopScheduleType } from '@/domains/dispatch/types/routePlan';
import { formatKstHHmm } from '@/domains/dispatch/utils/kstDateTime';

export interface ResolvedStopTimeConstraint {
  deliveryTime: string;
  isNextDay: boolean;
  earlyDeliveryForbidden: boolean;
  type: StopScheduleType;
  earlyToleranceMinutes: number;
}

export type StopTimeConstraintResult = {
  applies: boolean;
  violated: boolean;
  evaluatedAt: Date | null;
  latenessMinutes: number;
  subjectLabel: '도착' | '작업 시작' | '작업 완료' | '출발';
};

const SCHEDULE_TYPES: StopScheduleType[] = [
  'ready',
  'service-start',
  'departure',
  'arrival-deadline',
  'completion-deadline',
  'appointment',
];

export function resolveStopTimeConstraint(input: {
  deliveryTime: string;
  rawType?: unknown;
  isNextDay: boolean;
  earlyDeliveryForbidden: boolean;
  earlyToleranceMinutes?: unknown;
  defaultEarlyToleranceMinutes: number;
}): ResolvedStopTimeConstraint {
  const type = typeof input.rawType === 'string' && SCHEDULE_TYPES.includes(input.rawType as StopScheduleType)
    ? input.rawType as StopScheduleType
    : input.earlyDeliveryForbidden
      ? 'appointment'
      : 'arrival-deadline';
  const stopTolerance = Number(input.earlyToleranceMinutes);
  return {
    deliveryTime: input.deliveryTime,
    isNextDay: input.isNextDay,
    earlyDeliveryForbidden: input.earlyDeliveryForbidden,
    type,
    earlyToleranceMinutes: Number.isFinite(stopTolerance)
      ? Math.max(0, stopTolerance)
      : input.defaultEarlyToleranceMinutes,
  };
}

/**
 * 경로 순서 최적화기는 도착시각 제약만 이해한다. 완료/출발 마감은 체류시간만큼
 * 앞선 도착 마감으로 변환해, 사후 검증 전에 올바른 순서를 찾도록 돕는다.
 */
export function toRouteOptimizationConstraint(input: {
  type: StopScheduleType;
  time: string;
  isNextDay: boolean;
  dwellMinutes: number;
}): { time: string; isNextDay: boolean } {
  if (input.type === 'ready') return { time: '', isNextDay: input.isNextDay };
  if (input.type !== 'completion-deadline' && input.type !== 'departure') {
    return { time: input.time, isNextDay: input.isNextDay };
  }

  const match = input.time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { time: input.time, isNextDay: input.isNextDay };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { time: input.time, isNextDay: input.isNextDay };

  const dwellMinutes = Number.isFinite(input.dwellMinutes)
    ? Math.max(0, Math.round(input.dwellMinutes))
    : 0;
  let absoluteMinutes = hour * 60 + minute + (input.isNextDay ? 24 * 60 : 0) - dwellMinutes;
  // 전일 도착을 표현할 수 없는 당일 요청은 원문을 유지하고 사후 의미 검증에 맡긴다.
  if (absoluteMinutes < 0) return { time: input.time, isNextDay: input.isNextDay };
  absoluteMinutes %= 2 * 24 * 60;

  const isNextDay = absoluteMinutes >= 24 * 60;
  const minuteOfDay = absoluteMinutes % (24 * 60);
  const adjustedHour = Math.floor(minuteOfDay / 60);
  const adjustedMinute = minuteOfDay % 60;
  return {
    time: `${String(adjustedHour).padStart(2, '0')}:${String(adjustedMinute).padStart(2, '0')}`,
    isNextDay,
  };
}

export function evaluateStopTimeConstraint(input: {
  type: StopScheduleType;
  target: Date | null;
  arrival: Date;
  serviceStart: Date;
  completion: Date;
}): StopTimeConstraintResult {
  const subject = (() => {
    switch (input.type) {
      case 'completion-deadline':
        return { evaluatedAt: input.completion, subjectLabel: '작업 완료' as const };
      case 'departure':
        return { evaluatedAt: input.completion, subjectLabel: '출발' as const };
      case 'service-start':
      case 'appointment':
        return { evaluatedAt: input.serviceStart, subjectLabel: '작업 시작' as const };
      case 'arrival-deadline':
        return { evaluatedAt: input.arrival, subjectLabel: '도착' as const };
      case 'ready':
        return null;
    }
  })();

  if (!input.target || !subject) {
    return {
      applies: false,
      violated: false,
      evaluatedAt: null,
      latenessMinutes: 0,
      subjectLabel: '도착',
    };
  }

  const dueEndMs = Math.floor(input.target.getTime() / 60000) * 60000 + 59_999;
  const latenessMinutes = Math.max(
    0,
    (subject.evaluatedAt.getTime() - Math.floor(input.target.getTime() / 60000) * 60000) / 60_000,
  );
  return {
    applies: true,
    violated: subject.evaluatedAt.getTime() > dueEndMs,
    evaluatedAt: subject.evaluatedAt,
    latenessMinutes,
    subjectLabel: subject.subjectLabel,
  };
}

export function buildStopConstraintViolation(input: {
  constraint?: ResolvedStopTimeConstraint;
  target: Date | null;
  arrival: Date;
  serviceStart: Date;
  completion: Date;
  stopNumber: number;
  previousAddress: string;
  address: string;
}): { message: string; latenessMinutes: number } | null {
  if (!input.constraint) return null;
  const evaluated = evaluateStopTimeConstraint({
    type: input.constraint.type,
    target: input.target,
    arrival: input.arrival,
    serviceStart: input.serviceStart,
    completion: input.completion,
  });
  if (!evaluated.violated || !evaluated.evaluatedAt) return null;

  const evaluatedCeilMin = Math.ceil(evaluated.evaluatedAt.getTime() / 60_000);
  const minimumLabel = formatKstHHmm(new Date(evaluatedCeilMin * 60_000));
  const subjectWithParticle = evaluated.subjectLabel === '작업 완료'
    ? '작업 완료는'
    : `${evaluated.subjectLabel}은`;
  return {
    message: `경유지 ${input.stopNumber}: ${input.constraint.deliveryTime} ${subjectWithParticle} 불가능합니다. 최소 ${minimumLabel} 예상입니다. (구간: ${input.previousAddress} → ${input.address})`,
    latenessMinutes: evaluated.latenessMinutes,
  };
}
