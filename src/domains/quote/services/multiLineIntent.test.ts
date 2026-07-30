import { describe, expect, it } from 'vitest';
import { shouldForceQuoteCaseBoard } from '@/domains/quote/services/multiLineIntent';

describe('shouldForceQuoteCaseBoard', () => {
  it('A/B 두 배송라인 견적을 견적책 요청으로 감지한다', () => {
    expect(shouldForceQuoteCaseBoard(
      '두 라인 한꺼번에 견적해줘.\nA라인: 서초 상차 → 송파 배송\nB라인: 가산 상차 → 중구 배송',
    )).toBe(true);
  });

  it('이름이 붙은 복수 라인도 감지한다', () => {
    expect(shouldForceQuoteCaseBoard(
      '정기 운임 계산\n남풍 라인: 가산 → 중구 → 가산\n송파 라인: 서초 → 압구정 → 송파',
    )).toBe(true);
  });

  it('한 줄에 이어 쓴 A/B 라인도 감지한다', () => {
    expect(shouldForceQuoteCaseBoard(
      'A라인: 서초에서 송파, B라인: 가산에서 중구로 운임 계산',
    )).toBe(true);
  });

  it('고객사 이름만 번호로 구분한 동시 견적도 감지한다', () => {
    expect(shouldForceQuoteCaseBoard(
      '하기 2개 견적을 한꺼번에 내줘.\n1. 남풍산업 가산 상차 → 중구 배송\n2. 네오위즈 가산 상차 → 판교 배송',
    )).toBe(true);
  });

  it('3개·5개·10개 지점 시나리오 비교는 견적책으로 오인하지 않는다', () => {
    expect(shouldForceQuoteCaseBoard(
      '3개, 5개, 10개 지점일 때 각각 견적 비교해줘',
    )).toBe(false);
  });

  it('입력 없이 다중 라인 가능 여부만 묻는 질문은 도구를 강제하지 않는다', () => {
    expect(shouldForceQuoteCaseBoard(
      '두 배송라인을 한꺼번에 견적낼 수 있어?',
    )).toBe(false);
  });
});
