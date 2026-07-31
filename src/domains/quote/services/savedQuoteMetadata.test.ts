import { describe, expect, it } from 'vitest';

import type { CaseBoardResult } from '@/domains/dispatch/services/caseBoard';
import { deriveSavedQuoteMetadata } from '@/domains/quote/services/savedQuoteMetadata';

function board(): CaseBoardResult {
  return {
    cases: [
      {
        id: 'line-a',
        label: '남풍산업 오전',
        vehicleType: '레이',
        oneTimePrice: 70_000,
        pricingEvidence: {
          hourly: {
            source: 'database',
            effectiveFrom: '2025-06-01',
            sourceDoc: 'ongoing-rate.pptx',
          },
          fuelSurcharge: {
            source: 'database',
            effectiveFrom: '2025-06-01',
            sourceDoc: 'ongoing-rate.pptx',
          },
        },
      },
      {
        id: 'line-b',
        label: '송파 오후',
        vehicleType: '스타렉스',
        oneTimePrice: 91_000,
        pricingEvidence: {
          hourly: {
            source: 'static-fallback',
            effectiveFrom: '2025-07-01',
            sourceDoc: 'fallback',
          },
        },
      },
    ],
    rollup: {
      oneTimeTotal: 161_000.4,
      monthlyTotal: null,
      annualTotal: null,
      contractMonths: null,
      contractTotal: null,
      targetMonth: '2026-08',
      allMeetDeadline: true,
      infeasibleLabels: [],
    },
    basis: '테스트 기준',
  };
}

describe('deriveSavedQuoteMetadata', () => {
  it('다중 라인 제목·합계·차종·최신 시행일을 저장용 메타로 만든다', () => {
    expect(deriveSavedQuoteMetadata({ quoteBook: board() })).toEqual({
      title: '남풍산업 오전 외 1개 라인',
      customerName: null,
      totalAmount: 161_000,
      caseCount: 2,
      vehicleTypes: ['레이', '스타렉스'],
      rateEffectiveFrom: '2025-07-01',
    });
  });

  it('사용자 제목과 고객사명은 공백을 제거해 우선 사용한다', () => {
    const result = deriveSavedQuoteMetadata({
      quoteBook: board(),
      title: '  8월 정기배송 견적  ',
      customerName: '  남풍산업  ',
    });

    expect(result.title).toBe('8월 정기배송 견적');
    expect(result.customerName).toBe('남풍산업');
  });
});
