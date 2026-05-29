/**
 * 견적 에이전트 eval 러너.
 *
 * 실행 중인 Next 서버의 /api/quote/agent-chat 를 호출해 골든셋을 채점한다.
 * (에이전트는 내부적으로 route-optimization/quote-calculation 등을 호출하므로 dev 서버 + API 키 필요)
 *
 * 사용:
 *   npm run dev               # 다른 터미널에서 서버 기동
 *   npm run eval:agent        # 본 러너
 *   AGENT_EVAL_URL=https://staging.example.com npm run eval:agent
 */

import { AGENT_EVAL_CASES } from '../src/domains/quote/evals/agentEvalCases';
import { scoreAgentResponse, summarize, type ScoredCase } from '../src/domains/quote/evals/agentScorer';

const BASE_URL =
  process.env.AGENT_EVAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** SSE 스트림에서 최종 payload(또는 JSON 응답)를 추출한다. */
async function readAgentResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    return res.json();
  }
  const text = await res.text();
  let final: any = null;
  for (const chunk of text.split('\n\n')) {
    const line = chunk.trim();
    if (!line.startsWith('data:')) continue;
    try {
      const data = JSON.parse(line.slice(5).trim());
      if (data.type === 'final') final = data.payload;
    } catch {
      /* 부분 파싱 무시 */
    }
  }
  return final;
}

async function runOne(testCase: (typeof AGENT_EVAL_CASES)[number]): Promise<ScoredCase> {
  const res = await fetch(new URL('/api/quote/agent-chat', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: testCase.input, history: testCase.history || [] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      id: testCase.id,
      passed: false,
      checks: [{ name: 'http', passed: false, detail: `HTTP ${res.status} ${body.slice(0, 200)}` }],
    };
  }
  const json = await readAgentResponse(res);
  if (!json) {
    return {
      id: testCase.id,
      passed: false,
      checks: [{ name: 'stream', passed: false, detail: 'final payload 누락(스트림 파싱 실패)' }],
    };
  }
  return scoreAgentResponse(testCase, json);
}

async function main() {
  console.log(`[agent-evals] base=${BASE_URL}  cases=${AGENT_EVAL_CASES.length}\n`);

  // 사전 헬스 체크
  try {
    await fetch(new URL('/api/quote/agent-chat', BASE_URL), { method: 'OPTIONS' }).catch(() => {});
  } catch {
    /* ignore */
  }

  const scored: ScoredCase[] = [];
  for (const testCase of AGENT_EVAL_CASES) {
    process.stdout.write(`- ${testCase.id} ... `);
    try {
      const result = await runOne(testCase);
      scored.push(result);
      console.log(result.passed ? 'PASS' : 'FAIL');
      if (!result.passed) {
        for (const c of result.checks.filter((x) => !x.passed)) {
          console.log(`    x ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
        }
      }
    } catch (e) {
      scored.push({
        id: testCase.id,
        passed: false,
        checks: [{ name: 'exception', passed: false, detail: e instanceof Error ? e.message : 'unknown' }],
      });
      console.log('ERROR');
      console.log(`    x ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  const s = summarize(scored);
  console.log(`\n[agent-evals] passed ${s.passed}/${s.total} (failed ${s.failed})`);
  if (s.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('[agent-evals] 러너 오류:', e);
  process.exit(1);
});
