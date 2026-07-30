import { describe, expect, it } from 'vitest';
import { scoreAgentResponse } from './agentScorer';
import type { AgentEvalCase } from './agentEvalCases';

const testCase: AgentEvalCase = {
  id: 'quote-policy',
  input: '견적',
  expected: {
    shouldHaveQuote: true,
    recommendedPlan: 'hourly',
    perJobReferenceRequested: false,
    maxWaitMinutes: 0,
    forbiddenWonAmounts: [231000],
  },
};

describe('agentScorer quote policy checks', () => {
  it('시간당·무대기·단건 비노출 응답을 통과시킨다', () => {
    const scored = scoreAgentResponse(testCase, {
      assistantMessage: '공식 견적은 57,000원입니다.',
      quote: {
        recommendedPlan: 'hourly',
        perJobReferenceRequested: false,
        perJob: null,
        basis: { waitTotalMinutes: 0 },
      },
    });
    expect(scored.passed).toBe(true);
  });

  it('유령 대기·단건 노출·오견적 금액을 모두 검출한다', () => {
    const scored = scoreAgentResponse(testCase, {
      assistantMessage: '견적은 231,000원입니다.',
      quote: {
        recommendedPlan: 'perJob',
        perJobReferenceRequested: true,
        perJob: { total: 60000 },
        basis: { waitTotalMinutes: 574 },
      },
    });
    expect(scored.passed).toBe(false);
    expect(scored.checks.filter((check) => !check.passed).map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'recommendedPlan',
        'perJobReferenceRequested',
        'maxWaitMinutes',
        'forbiddenAmount:231000',
      ]),
    );
  });

  it('다중 라인 요청은 지정한 수의 견적책 라인이 있어야 통과시킨다', () => {
    const multiLineCase: AgentEvalCase = {
      id: 'multi-line',
      input: '두 라인 견적',
      expected: {
        caseBoardCount: 2,
        shouldHaveQuote: true,
        shouldNotAskUser: true,
      },
    };
    const passed = scoreAgentResponse(multiLineCase, {
      caseBoard: {
        cases: [
          { label: 'A라인', oneTimePrice: 60_000 },
          { label: 'B라인', oneTimePrice: 72_000 },
        ],
      },
    });
    const failed = scoreAgentResponse(multiLineCase, {
      quote: { recommendedPlan: 'hourly' },
    });

    expect(passed.passed).toBe(true);
    expect(failed.passed).toBe(false);
    expect(failed.checks.find((check) => check.name === 'caseBoardCount')?.passed).toBe(false);
  });
});
