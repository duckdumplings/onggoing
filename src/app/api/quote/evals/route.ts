import { NextResponse } from 'next/server';
import { CHAT_EVAL_CASES } from '@/domains/quote/evals/chatEvalCases';
import { createInitialSlotState, mergeSlotState } from '@/domains/quote/services/conversationStateManager';
import { createServerClient } from '@/libs/supabase-client';

export async function GET() {
  const rows = CHAT_EVAL_CASES.map((testCase) => {
    const merged = mergeSlotState(
      createInitialSlotState(),
      {
        origin: /에서/.test(testCase.input) ? { address: testCase.input.split('에서')[0].trim() } : undefined,
        destinations: /에서/.test(testCase.input) && /가는/.test(testCase.input)
          ? [{ address: testCase.input.split('에서')[1].split('가는')[0].trim() }]
          : undefined,
      } as any,
      testCase.input
    );

    const passIntent = !testCase.expected.shouldInferIntent || merged.lastUserIntent === testCase.expected.shouldInferIntent;
    const passOrigin = testCase.expected.shouldHaveOrigin === undefined
      ? true
      : Boolean(merged.origin) === testCase.expected.shouldHaveOrigin;
    const passDestination = testCase.expected.shouldHaveDestination === undefined
      ? true
      : Boolean(merged.destinations.length) === testCase.expected.shouldHaveDestination;
    const passed = passIntent && passOrigin && passDestination;

    return {
      id: testCase.id,
      input: testCase.input,
      expected: testCase.expected,
      actual: {
        lastUserIntent: merged.lastUserIntent,
        origin: merged.origin || null,
        destinationCount: merged.destinations.length,
      },
      passed,
    };
  });

  let sampledFailures: Array<{
    id: string;
    errorCode: string;
    reason: string | null;
    createdAt: string;
  }> = [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('quote_chat_failure_cases')
      .select('id, error_code, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    sampledFailures = (data || []).map((row: any) => ({
      id: String(row.id),
      errorCode: String(row.error_code || ''),
      reason: row.reason ? String(row.reason) : null,
      createdAt: String(row.created_at || ''),
    }));
  } catch {
    sampledFailures = [];
  }

  return NextResponse.json({
    success: true,
    summary: {
      total: rows.length,
      passed: rows.filter((row) => row.passed).length,
      failed: rows.filter((row) => !row.passed).length,
      sampledFailureCount: sampledFailures.length,
    },
    rows,
    sampledFailures,
  });
}

