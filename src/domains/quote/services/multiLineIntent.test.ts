import { describe, expect, it } from 'vitest';
import {
  shouldConfirmQuoteInput,
  shouldForceQuoteCaseBoard,
} from '@/domains/quote/services/multiLineIntent';

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

describe('shouldConfirmQuoteInput', () => {
  it('독립 배송라인 2개는 계산 전 확인 대상으로 본다', () => {
    expect(shouldConfirmQuoteInput(
      'A라인: 가산 상차 → 중구 배송\nB라인: 서초 상차 → 송파 배송',
    )).toBe(true);
  });

  it('상차·배송에 붙은 시각 의미가 모호하면 확인한다', () => {
    expect(shouldConfirmQuoteInput(
      '가산 상차 → 11:40 송파 배송 → 12:00 치과 배송 견적',
    )).toBe(true);
  });

  it('상차 시각이 준비·출발 중 무엇인지 모호하면 확인한다', () => {
    expect(shouldConfirmQuoteInput(
      '10:00 가산 상차 -> 11:30 판교 배송 견적',
    )).toBe(true);
  });

  it('출발과 완료 마감 의미가 명시된 단일 라인은 즉시 계산한다', () => {
    expect(shouldConfirmQuoteInput(
      '가산에서 10:00 출발, 판교 11:30 배송 완료 마감으로 견적',
    )).toBe(false);
  });

  it('다중 라인 가능 여부만 묻는 질문은 확인 단계를 열지 않는다', () => {
    expect(shouldConfirmQuoteInput(
      '두 배송라인을 한꺼번에 견적낼 수 있어?',
    )).toBe(false);
  });
});
