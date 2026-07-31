import { describe, expect, it } from 'vitest';
import type { CaseBoardCaseResult } from '@/domains/dispatch/services/caseBoard';
import {
  countQuoteBookStatuses,
  filterQuoteBookCases,
  getQuoteBookStatus,
  sortQuoteBookCases,
} from './quoteBookPresentation';

function makeCase(
  id: string,
  patch: Partial<CaseBoardCaseResult> = {},
): CaseBoardCaseResult {
  return {
    id,
    label: id,
    vehicleType: '레이',
    ...patch,
  };
}

describe('quoteBookPresentation', () => {
  it('shows blocked and attention cases before complete cases', () => {
    const cases = [
      makeCase('safe', { riskGrade: 'safe', deadlineSlackMinutes: 70 }),
      makeCase('caution', { riskGrade: 'caution', deadlineSlackMinutes: 35 }),
      makeCase('error', { error: '주소 오류' }),
      makeCase('late', { riskGrade: 'infeasible', deadlineSlackMinutes: -5 }),
    ];

    expect(sortQuoteBookCases(cases).map((result) => result.id)).toEqual([
      'error',
      'late',
      'caution',
      'safe',
    ]);
  });

  it('sorts cases with the same status by the smallest deadline slack', () => {
    const cases = [
      makeCase('wide', { riskGrade: 'danger', deadlineSlackMinutes: 25 }),
      makeCase('tight', { riskGrade: 'recheck', deadlineSlackMinutes: 8 }),
    ];

    expect(sortQuoteBookCases(cases).map((result) => result.id)).toEqual([
      'tight',
      'wide',
    ]);
  });

  it('groups blocked cases into the attention filter', () => {
    const cases = [
      makeCase('safe', { riskGrade: 'safe' }),
      makeCase('warning', { riskGrade: 'danger' }),
      makeCase('late', { riskGrade: 'infeasible' }),
    ];

    expect(filterQuoteBookCases(cases, 'attention').map((result) => result.id)).toEqual([
      'warning',
      'late',
    ]);
    expect(countQuoteBookStatuses(cases)).toEqual({
      complete: 1,
      attention: 1,
      blocked: 1,
    });
    expect(getQuoteBookStatus(cases[2])).toBe('blocked');
  });
});
