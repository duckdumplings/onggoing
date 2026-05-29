/**
 * 견적 에이전트 응답 채점기.
 *
 * agent-chat 응답 JSON을 받아 골든셋 기대치 대비 통과 여부를 계산한다.
 * 결정론 채점(엔티티/가격/명확화)만 수행하며, LLM-judge는 선택적으로 별도 추가 가능.
 */

import type { AgentEvalCase, AgentEvalExpectation } from '@/domains/quote/evals/agentEvalCases';

export interface AgentResponseLike {
  assistantMessage?: string;
  quote?: unknown;
  scenarioComparison?: {
    results?: Array<{
      label: string;
      counts?: { pickup?: number; drop?: number; return?: number; totalStops?: number };
      annualPrice?: number;
      oneTimePrice?: number;
    }>;
    recommendedLabel?: string | null;
  } | null;
  scenarioRouteErrors?: Array<{ label: string; message: string }>;
  followUpQuestions?: Array<{ field?: string; question: string }> | string[];
  missingFields?: string[];
}

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface ScoredCase {
  id: string;
  passed: boolean;
  checks: CheckResult[];
}

function check(name: string, passed: boolean, detail?: string): CheckResult {
  return { name, passed, detail };
}

export function scoreAgentResponse(
  testCase: AgentEvalCase,
  response: AgentResponseLike
): ScoredCase {
  const e: AgentEvalExpectation = testCase.expected;
  const checks: CheckResult[] = [];
  const text = String(response.assistantMessage || '');
  const comparison = response.scenarioComparison;
  const results = comparison?.results || [];
  // 명확화 신호: ask_user 도구(구조화) 또는, 산출물(견적/비교) 없이 본문으로 되물은 경우.
  // 에이전트가 도구 대신 자연어로 되묻는 것도 정상 동작이므로 둘 다 인정한다.
  const producedResult = Boolean(response.quote) || results.length > 0;
  const askedViaTool =
    (response.followUpQuestions?.length || 0) > 0 || (response.missingFields || []).includes('clarification');
  const askedViaText = !producedResult && /[?？]/.test(text);
  const asked = askedViaTool || askedViaText;

  if (e.scenarioCount !== undefined) {
    checks.push(
      check('scenarioCount', results.length === e.scenarioCount, `expected ${e.scenarioCount}, got ${results.length}`)
    );
  }

  if (e.scenarioPickups) {
    for (const [label, expectedPickups] of Object.entries(e.scenarioPickups)) {
      const r = results.find((x) => x.label === label || x.label.includes(label));
      const actual = r?.counts?.pickup;
      checks.push(
        check(`pickups:${label}`, actual === expectedPickups, `expected ${expectedPickups}, got ${actual ?? 'none'}`)
      );
    }
  }

  if (e.mustContainAddresses) {
    const haystack = [text, JSON.stringify(comparison || {})].join(' ');
    for (const token of e.mustContainAddresses) {
      checks.push(check(`contains:${token}`, haystack.includes(token)));
    }
  }

  if (e.shouldHaveQuote) {
    const hasQuote = Boolean(response.quote) || results.length > 0 || /₩\s?[\d,]/.test(text);
    checks.push(check('hasQuote', hasQuote));
  }

  if (e.shouldBeRecurring) {
    const recurringInResults = results.some((r) => (r.annualPrice ?? 0) !== (r.oneTimePrice ?? 0));
    const recurringInText = /(연\s?\d|연간|연 환산|주\s?\d회|분기)/.test(text);
    checks.push(check('recurring', recurringInResults || recurringInText));
  }

  if (e.shouldNotAskUser) {
    checks.push(check('noAskUser', !asked, asked ? '불필요한 명확화 질문 발생' : undefined));
  }

  if (e.shouldAskUser) {
    checks.push(check('asksUser', asked, !asked ? '명확화 질문이 필요했으나 없음' : undefined));
  }

  const passed = checks.every((c) => c.passed);
  return { id: testCase.id, passed, checks };
}

export function summarize(scored: ScoredCase[]) {
  return {
    total: scored.length,
    passed: scored.filter((s) => s.passed).length,
    failed: scored.filter((s) => !s.passed).length,
  };
}
