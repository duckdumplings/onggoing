/* eslint-disable no-console */
/**
 * 경로 최적화 payload 회귀 검증 진입점. `npm run verify:route-payload`로 호출.
 *
 * P0-1 (우측 패널 도로 옵션 재계산 시 좌측 패널 시간 설정이 누락되는 버그) 회귀 방지용.
 */
import {
  PAYLOAD_REGRESSION_CASES,
  assertRoutePayloadRegression,
} from '../src/domains/dispatch/evals/routePayloadRegression';

try {
  assertRoutePayloadRegression();
  console.log('✓ route payload regression OK');
  console.log(`  - payload cases: ${PAYLOAD_REGRESSION_CASES.length}`);
} catch (e) {
  console.error('✗ route payload regression failed');
  if (e instanceof Error) {
    console.error(e.message);
  }
  process.exit(1);
}
