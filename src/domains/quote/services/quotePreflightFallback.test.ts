import { describe, expect, it } from 'vitest';
import { createDeterministicQuotePreflight } from '@/domains/quote/services/quotePreflightFallback';

describe('createDeterministicQuotePreflight', () => {
  it('괄호 주소와 모호한 배송 시각을 즉시 구조화한다', () => {
    const result = createDeterministicQuotePreflight(
      '가산 상차(금천구 가산디지털1로 70) → 11:40 송파 배송(송파구 위례순환로 387) → 12:00 치과 배송(송파구 백제고분로 488) 견적',
    );

    expect(result?.cases).toHaveLength(1);
    expect(result?.cases[0].stops.map((stop) => stop.address)).toEqual([
      '금천구 가산디지털1로 70',
      '송파구 위례순환로 387',
      '송파구 백제고분로 488',
    ]);
    expect(result?.cases[1]).toBeUndefined();
    expect(result?.cases[0].stops[1].schedule).toEqual({
      type: 'completion-deadline',
      time: '11:40',
    });
    expect(result?.cases[0].openQuestions).toHaveLength(2);
    expect(result?.confidence).toBe('medium');
  });

  it('명시적 완료 마감은 추가 질문 없이 보존한다', () => {
    const result = createDeterministicQuotePreflight(
      '가산 상차(금천구 가산디지털1로 70) → 11:40까지 배송 완료(송파구 위례순환로 387) 레이 비정기 견적',
    );
    expect(result?.cases[0].stops[1].schedule?.type).toBe('completion-deadline');
    expect(result?.cases[0].openQuestions).toEqual([]);
    expect(result?.confidence).toBe('high');
  });

  it('이름이 있는 두 라인을 분리하고 수량·차종을 적용한다', () => {
    const result = createDeterministicQuotePreflight(
      [
        '남풍 라인: 가방 4개 가산 상차(금천구 가산디지털1로 70) → 중구 배송(서울시 중구 퇴계로 19) → 가산 반납(금천구 가마산로 96)',
        '송파 라인: 서초 상차(서울시 서초구 서초대로 350) → 송파 배송(서울시 송파구 백제고분로 488)',
        '스타렉스 정기 견적',
      ].join('\n'),
    );

    expect(result?.cases).toHaveLength(2);
    expect(result?.cases[0].label).toBe('남풍 라인');
    expect(result?.cases[0].stops[0].quantity).toBe(4);
    expect(result?.cases[0].stops[2].role).toBe('return');
    expect(result?.cases[1].vehicleType).toBe('스타렉스');
    expect(result?.cases[1].scheduleType).toBe('regular');
  });

  it('일부 구간 주소를 확정할 수 없으면 LLM 보조 대상으로 남긴다', () => {
    expect(
      createDeterministicQuotePreflight('가산 상차 → 송파 배송 견적'),
    ).toBeNull();
  });
});
