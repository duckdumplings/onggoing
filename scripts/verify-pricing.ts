/* eslint-disable no-console */
/**
 * 운임표 회귀 검증 진입점. CI/로컬에서 `npm run verify:pricing` 으로 호출.
 *
 * 검증 범위:
 *   - HOURLY_RATE_REGRESSION_CASES (시간당 단가/일일/20일 운임)
 *   - FUEL_SURCHARGE_REGRESSION_CASES (유류 할증)
 *   - ADVISOR_REGRESSION_CASES (인버전 추천 헬퍼)
 *   - HOURLY_RATE_TABLE invariant (13 행 × 30분 단위)
 *   - 30분 단위 올림 helper invariant
 *
 * PPTX 원본과 코드가 다른 항목(운영팀 컨펌 필요)은 PPTX_DISCREPANCIES 에서 안내한다.
 */
import {
  ADVISOR_REGRESSION_CASES,
  FUEL_SURCHARGE_REGRESSION_CASES,
  HOURLY_RATE_REGRESSION_CASES,
  PPTX_DISCREPANCIES,
  UNRESOLVED_PPTX_DISCREPANCIES,
  assertPricingRegression,
} from '../src/domains/quote/evals/pricingRegression';

try {
  assertPricingRegression();
  console.log('✓ pricing regression OK');
  console.log(`  - hourly rate cases: ${HOURLY_RATE_REGRESSION_CASES.length}`);
  console.log(`  - fuel surcharge cases: ${FUEL_SURCHARGE_REGRESSION_CASES.length}`);
  console.log(`  - advisor cases: ${ADVISOR_REGRESSION_CASES.length}`);

  const resolved = PPTX_DISCREPANCIES.filter((d) => d.resolvedAt);
  if (resolved.length > 0) {
    console.log(`\nℹ PPTX 차이 이력 (운영팀 컴펀 완료 ${resolved.length}건):`);
    for (const d of resolved) {
      console.log(`  - [${d.resolvedAt}] ${d.field}: pptx=${d.pptxValue} → 정답=${d.codeValue}`);
    }
  }

  if (UNRESOLVED_PPTX_DISCREPANCIES.length > 0) {
    console.log(`\n⚠ PPTX 운임표와 코드 차이 (운영팀 확인 필요, ${UNRESOLVED_PPTX_DISCREPANCIES.length}건):`);
    for (const d of UNRESOLVED_PPTX_DISCREPANCIES) {
      console.log(`  - ${d.field}: pptx=${d.pptxValue}, code=${d.codeValue}`);
      console.log(`    ${d.note}`);
    }
  }
} catch (e) {
  console.error('✗ pricing regression FAILED');
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
