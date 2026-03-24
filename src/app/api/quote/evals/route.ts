import { NextResponse } from 'next/server';
import { CHAT_EVAL_CASES } from '@/domains/quote/evals/chatEvalCases';
import { createInitialSlotState, mergeSlotState } from '@/domains/quote/services/conversationStateManager';
import { parseStructuredLogisticsMemo } from '@/domains/quote/services/structuredLogisticsParser';
import { createServerClient } from '@/libs/supabase-client';

export async function GET() {
  const rows = CHAT_EVAL_CASES.map((testCase) => {
    const structured = parseStructuredLogisticsMemo(testCase.input);
    const heuristicExtracted = /에서/.test(testCase.input) && /가는/.test(testCase.input)
      ? {
          origin: { address: testCase.input.split('에서')[0].trim() },
          destinations: [{ address: testCase.input.split('에서')[1].split('가는')[0].trim() }],
        }
      : {};
    const extractedForEval = structured?.extracted || (heuristicExtracted as any);
    const merged = mergeSlotState(
      createInitialSlotState(),
      extractedForEval as any,
      testCase.input
    );

    const passIntent = !testCase.expected.shouldInferIntent || merged.lastUserIntent === testCase.expected.shouldInferIntent;
    const passOrigin = testCase.expected.shouldHaveOrigin === undefined
      ? true
      : Boolean(merged.origin) === testCase.expected.shouldHaveOrigin;
    const passDestination = testCase.expected.shouldHaveDestination === undefined
      ? true
      : Boolean(merged.destinations.length) === testCase.expected.shouldHaveDestination;
    const passMinDestinationCount = testCase.expected.minDestinationCount === undefined
      ? true
      : merged.destinations.length >= testCase.expected.minDestinationCount;
    const passStructuredMemo = testCase.expected.shouldUseStructuredMemo === undefined
      ? true
      : Boolean(structured) === testCase.expected.shouldUseStructuredMemo;
    const passContainAddresses = (testCase.expected.shouldContainAddresses || []).every((token) =>
      [merged.origin || '', ...merged.destinations].some((addr) => String(addr).includes(token))
    );

    const passed = passIntent && passOrigin && passDestination && passMinDestinationCount && passStructuredMemo && passContainAddresses;
    const routeReady = Boolean(merged.origin && merged.destinations.length > 0);

    return {
      id: testCase.id,
      input: testCase.input,
      expected: testCase.expected,
      actual: {
        lastUserIntent: merged.lastUserIntent,
        origin: merged.origin || null,
        destinationCount: merged.destinations.length,
        destinations: merged.destinations,
        usedStructuredMemo: Boolean(structured),
        routeReady,
      },
      checks: {
        passIntent,
        passOrigin,
        passDestination,
        passMinDestinationCount,
        passStructuredMemo,
        passContainAddresses,
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
      routeReadyCount: rows.filter((row: any) => row.actual.routeReady).length,
      structuredMemoUsedCount: rows.filter((row: any) => row.actual.usedStructuredMemo).length,
      sampledFailureCount: sampledFailures.length,
    },
    rows,
    sampledFailures,
  });
}

