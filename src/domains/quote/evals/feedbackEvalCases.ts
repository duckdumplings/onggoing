/**
 * 부정 피드백 → eval 골든셋 승격 로더.
 *
 * quote_chat_failure_cases 중 사람이 승인(approved_for_eval=true)한 부정 피드백
 * (USER_FEEDBACK_NEGATIVE) 행을 AgentEvalCase로 변환해 골든셋에 병합한다.
 * DB 실패/빈 결과는 [] 반환(fail-open)하여 러너가 정적 골든셋만으로도 돌게 한다.
 */

import { createServerClient } from '@/libs/supabase-client';
import type { AgentEvalCase, AgentEvalExpectation } from '@/domains/quote/evals/agentEvalCases';

const MAX_PROMOTED = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 명시 기대치가 없을 때 원 대화 결과 기준으로 최소 불변식을 파생한다. */
function deriveExpectation(metadata: unknown): AgentEvalExpectation {
  const hadQuote = isPlainObject(metadata) && Boolean((metadata as Record<string, unknown>).quote);
  return hadQuote
    ? { shouldHaveQuote: true, shouldNotAskUser: true }
    : { shouldNotAskUser: true };
}

export async function loadPromotedEvalCases(): Promise<AgentEvalCase[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_failure_cases')
      .select('id, user_input, eval_expectation, tags, metadata')
      .eq('approved_for_eval', true)
      .eq('error_code', 'USER_FEEDBACK_NEGATIVE')
      .order('created_at', { ascending: false })
      .limit(MAX_PROMOTED);

    if (error || !data) return [];

    const cases: AgentEvalCase[] = [];
    for (const row of data as any[]) {
      const metadata = row.metadata;
      const input =
        (typeof row.user_input === 'string' && row.user_input.trim()) ||
        (isPlainObject(metadata) && typeof metadata.source_user_text === 'string'
          ? metadata.source_user_text.trim()
          : '');
      if (!input) continue;

      const expected: AgentEvalExpectation = isPlainObject(row.eval_expectation)
        ? (row.eval_expectation as AgentEvalExpectation)
        : deriveExpectation(metadata);

      cases.push({ id: `fb-${row.id}`, input, expected });
    }
    return cases;
  } catch {
    return [];
  }
}
