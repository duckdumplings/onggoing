import type { CaseBoardCaseResult } from '@/domains/dispatch/services/caseBoard';

export type QuoteBookStatus = 'complete' | 'attention' | 'blocked';
export type QuoteBookFilter = 'all' | 'attention' | 'complete';

const STATUS_PRIORITY: Record<QuoteBookStatus, number> = {
  blocked: 0,
  attention: 1,
  complete: 2,
};

export function getQuoteBookStatus(result: CaseBoardCaseResult): QuoteBookStatus {
  if (result.error || result.riskGrade === 'infeasible') return 'blocked';
  if (['caution', 'danger', 'recheck'].includes(result.riskGrade ?? '')) return 'attention';
  return 'complete';
}

export function getQuoteBookStatusLabel(result: CaseBoardCaseResult): string {
  if (result.error) return '계산 오류';
  if (result.riskGrade === 'infeasible') return '마감 초과';
  return getQuoteBookStatus(result) === 'attention' ? '확인 필요' : '산출 완료';
}

export function sortQuoteBookCases(cases: CaseBoardCaseResult[]): CaseBoardCaseResult[] {
  return cases
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const statusDifference =
        STATUS_PRIORITY[getQuoteBookStatus(a.result)] -
        STATUS_PRIORITY[getQuoteBookStatus(b.result)];
      if (statusDifference !== 0) return statusDifference;

      if (Boolean(a.result.error) !== Boolean(b.result.error)) {
        return a.result.error ? -1 : 1;
      }

      const aSlack = a.result.deadlineSlackMinutes ?? Number.POSITIVE_INFINITY;
      const bSlack = b.result.deadlineSlackMinutes ?? Number.POSITIVE_INFINITY;
      if (aSlack !== bSlack) return aSlack - bSlack;
      return a.index - b.index;
    })
    .map(({ result }) => result);
}

export function filterQuoteBookCases(
  cases: CaseBoardCaseResult[],
  filter: QuoteBookFilter,
): CaseBoardCaseResult[] {
  if (filter === 'all') return cases;
  if (filter === 'attention') {
    return cases.filter((result) => getQuoteBookStatus(result) !== 'complete');
  }
  return cases.filter((result) => getQuoteBookStatus(result) === 'complete');
}

export function countQuoteBookStatuses(cases: CaseBoardCaseResult[]) {
  return cases.reduce(
    (counts, result) => {
      counts[getQuoteBookStatus(result)] += 1;
      return counts;
    },
    { complete: 0, attention: 0, blocked: 0 },
  );
}
