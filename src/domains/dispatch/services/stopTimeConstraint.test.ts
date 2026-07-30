import { describe, expect, it } from 'vitest';
import {
  buildStopConstraintViolation,
  evaluateStopTimeConstraint,
  resolveStopTimeConstraint,
  toRouteOptimizationConstraint,
} from '@/domains/dispatch/services/stopTimeConstraint';

const target = new Date('2026-07-31T03:00:00.000Z');
const arrival = new Date('2026-07-31T02:55:00.000Z');
const serviceStart = arrival;
const completion = new Date('2026-07-31T03:07:00.000Z');

describe('evaluateStopTimeConstraint', () => {
  it('도착 마감은 도착시각으로 판정한다', () => {
    const result = evaluateStopTimeConstraint({
      type: 'arrival-deadline',
      target,
      arrival,
      serviceStart,
      completion,
    });
    expect(result.violated).toBe(false);
    expect(result.subjectLabel).toBe('도착');
  });

  it('완료 마감은 체류가 끝난 시각으로 판정한다', () => {
    const result = evaluateStopTimeConstraint({
      type: 'completion-deadline',
      target,
      arrival,
      serviceStart,
      completion,
    });
    expect(result.violated).toBe(true);
    expect(result.subjectLabel).toBe('작업 완료');
    expect(Math.ceil(result.latenessMinutes)).toBe(7);
  });

  it('물품 준비시각은 상한 마감으로 판정하지 않는다', () => {
    const result = evaluateStopTimeConstraint({
      type: 'ready',
      target,
      arrival,
      serviceStart,
      completion,
    });
    expect(result.applies).toBe(false);
    expect(result.violated).toBe(false);
  });
});

describe('toRouteOptimizationConstraint', () => {
  it('완료 마감을 체류시간만큼 앞선 도착 마감으로 바꾼다', () => {
    expect(toRouteOptimizationConstraint({
      type: 'completion-deadline',
      time: '12:00',
      isNextDay: false,
      dwellMinutes: 15,
    })).toEqual({ time: '11:45', isNextDay: false });
  });

  it('익일 완료 마감이 자정을 넘으면 당일 도착 제약으로 바꾼다', () => {
    expect(toRouteOptimizationConstraint({
      type: 'completion-deadline',
      time: '00:10',
      isNextDay: true,
      dwellMinutes: 20,
    })).toEqual({ time: '23:50', isNextDay: false });
  });

  it('물품 준비 시각은 순서 최적화의 상한 제약에서 제외한다', () => {
    expect(toRouteOptimizationConstraint({
      type: 'ready',
      time: '10:00',
      isNextDay: false,
      dwellMinutes: 15,
    })).toEqual({ time: '', isNextDay: false });
  });
});

describe('resolved stop constraint', () => {
  it('구형 예약 플래그를 appointment 의미로 보존한다', () => {
    expect(resolveStopTimeConstraint({
      deliveryTime: '10:00',
      rawType: null,
      isNextDay: false,
      earlyDeliveryForbidden: true,
      earlyToleranceMinutes: undefined,
      defaultEarlyToleranceMinutes: 15,
    })).toMatchObject({
      type: 'appointment',
      earlyToleranceMinutes: 15,
    });
  });

  it('완료 마감 위반 메시지를 완료시각 기준으로 만든다', () => {
    const constraint = resolveStopTimeConstraint({
      deliveryTime: '12:00',
      rawType: 'completion-deadline',
      isNextDay: false,
      earlyDeliveryForbidden: false,
      defaultEarlyToleranceMinutes: 15,
    });
    const violation = buildStopConstraintViolation({
      constraint,
      target: new Date('2026-07-30T03:00:00.000Z'),
      arrival: new Date('2026-07-30T02:55:00.000Z'),
      serviceStart: new Date('2026-07-30T02:55:00.000Z'),
      completion: new Date('2026-07-30T03:10:00.000Z'),
      stopNumber: 2,
      previousAddress: '송파구 위례순환로 387',
      address: '송파구 백제고분로 488',
    });

    expect(violation?.message).toContain('12:00 작업 완료');
    expect(violation?.message).toContain('최소 12:10');
    expect(violation?.latenessMinutes).toBe(10);
  });
});
