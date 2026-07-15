import { NextResponse } from 'next/server';
import { CHAT_EVAL_CASES } from '@/domains/quote/evals/chatEvalCases';
import { createInitialSlotState, mergeSlotState } from '@/domains/quote/services/conversationStateManager';
import { parseStructuredLogisticsMemo } from '@/domains/quote/services/structuredLogisticsParser';
import { createServerClient } from '@/libs/supabase-client';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pendingOnly = url.searchParams.get('pending') === '1';

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
    tags: unknown;
    approvedForEval: boolean;
    createdAt: string;
  }> = [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('quote_chat_failure_cases')
      .select('id, error_code, reason, tags, approved_for_eval, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    sampledFailures = (data || []).map((row: any) => ({
      id: String(row.id),
      errorCode: String(row.error_code || ''),
      reason: row.reason ? String(row.reason) : null,
      tags: row.tags ?? [],
      approvedForEval: Boolean(row.approved_for_eval),
      createdAt: String(row.created_at || ''),
    }));
  } catch {
    sampledFailures = [];
  }

  let pendingFeedback: Array<{
    id: string;
    userInput: string;
    reason: string | null;
    tags: unknown;
    createdAt: string;
  }> = [];
  if (pendingOnly) {
    try {
      const supabase = createServerClient();
      const { data } = await supabase
        .from('quote_chat_failure_cases')
        .select('id, user_input, reason, tags, created_at')
        .eq('approved_for_eval', false)
        .eq('error_code', 'USER_FEEDBACK_NEGATIVE')
        .order('created_at', { ascending: false })
        .limit(50);
      pendingFeedback = (data || []).map((row: any) => ({
        id: String(row.id),
        userInput: String(row.user_input || ''),
        reason: row.reason ? String(row.reason) : null,
        tags: row.tags ?? [],
        createdAt: String(row.created_at || ''),
      }));
    } catch {
      pendingFeedback = [];
    }
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
      pendingFeedbackCount: pendingFeedback.length,
    },
    rows,
    sampledFailures,
    pendingFeedback,
  });
}

/**
 * 부정 피드백 케이스를 eval 골든셋으로 승격/취소한다(내부 운영 도구, 인증 없음).
 * body: { id: string, approved?: boolean(기본 true), evalExpectation?: object }
 */
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ success: false, error: 'id는 비어있지 않은 문자열이어야 합니다.' }, { status: 400 });
  }

  const approved = body?.approved === undefined ? true : Boolean(body.approved);
  const update: { approved_for_eval: boolean; eval_expectation?: unknown } = {
    approved_for_eval: approved,
  };
  if (body?.evalExpectation !== undefined) {
    update.eval_expectation = body.evalExpectation;
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_failure_cases')
      .update(update)
      .eq('id', id)
      .select('id, approved_for_eval, eval_expectation')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, updated: data });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown error' },
      { status: 500 }
    );
  }
}

