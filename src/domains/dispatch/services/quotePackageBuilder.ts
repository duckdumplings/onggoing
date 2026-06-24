import type { CaseBoardCaseResult, CaseBoardResult, DeadlineRiskGrade } from '@/domains/dispatch/services/caseBoard';
import type {
  QuoteDocumentView,
  QuotePackage,
  QuotePackageCustomerRow,
  QuotePackageGroupRollup,
  QuotePackageOperatingBasis,
  QuotePackageRisk,
} from '@/domains/dispatch/types/quotePackage';

const DEFAULT_VAT_RATE = 0.1;

const RISK_LABEL: Record<DeadlineRiskGrade, string> = {
  safe: '안정',
  caution: '주의',
  danger: '주의',
  recheck: '운영 협의 필요',
  infeasible: '마감 초과',
  none: '마감 없음',
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function withVat(amount: number | null, vatRate: number): number | null {
  return amount == null ? null : Math.round(amount * (1 + vatRate));
}

function vatOf(amount: number | null, vatRate: number): number | null {
  return amount == null ? null : Math.round(amount * vatRate);
}

function slotLabel(label: string, departureLabel?: string | null): string {
  if (label.includes('점심')) return '점심';
  if (label.includes('저녁')) return '저녁';
  if (departureLabel?.startsWith('09')) return '점심';
  if (departureLabel?.startsWith('14')) return '저녁';
  return departureLabel ? `${departureLabel} 출발` : '운행';
}

export function riskLabelText(grade?: DeadlineRiskGrade): string {
  return RISK_LABEL[grade ?? 'none'];
}

export function buildRiskReason(c: CaseBoardCaseResult): string {
  if (c.error) return c.error;
  if (c.meetsDeadline === false) {
    const over = c.deadlineSlackMinutes != null ? `${Math.abs(c.deadlineSlackMinutes)}분 초과` : '마감 초과';
    return `배송 마감 ${c.deadline ?? '-'} 기준 ${over}입니다.`;
  }
  if (c.riskGrade === 'recheck') {
    return `배송 마감 여유가 ${c.deadlineSlackMinutes ?? 0}분으로 매우 짧습니다.`;
  }
  if (c.riskGrade === 'danger') {
    return `배송 마감 여유가 ${c.deadlineSlackMinutes ?? 0}분이라 현장 지연에 민감합니다.`;
  }
  if (c.riskGrade === 'caution') {
    return '주차, 건물 진입, 하차 대기 같은 현장 변수 확인이 필요합니다.';
  }
  if (c.predictionFallbackSegments && c.predictionFallbackSegments > 0) {
    return '일부 구간이 출발시각 예측 대신 호출 시점 교통으로 계산됐습니다.';
  }
  return '현재 입력 조건 기준으로 안정 운영 가능 범위입니다.';
}

export function buildRiskAction(c: CaseBoardCaseResult): string {
  if (c.meetsDeadline === false || c.riskGrade === 'recheck') {
    return '출발시간 조정 또는 권역 분리를 검토하세요.';
  }
  if (c.riskGrade === 'danger' || c.riskGrade === 'caution') {
    return '현장 대기/주차 버퍼와 전달 동선을 운영 전 확인하세요.';
  }
  if (c.predictionFallbackSegments && c.predictionFallbackSegments > 0) {
    return '확정 전 같은 출발시각으로 재조회해 예측 반영 여부를 확인하세요.';
  }
  return '현재 조건으로 제안 가능합니다.';
}

function customerNote(cases: CaseBoardCaseResult[]): string {
  const worst = cases.find((c) => c.riskGrade === 'infeasible' || c.riskGrade === 'recheck')
    ?? cases.find((c) => c.riskGrade === 'danger' || c.riskGrade === 'caution')
    ?? cases.find((c) => c.predictionFallbackSegments && c.predictionFallbackSegments > 0);
  return worst ? riskLabelText(worst.riskGrade) : '안정 운영 가능';
}

function buildOperatingBasis(cases: CaseBoardCaseResult[]): QuotePackageOperatingBasis[] {
  const seen = new Set<string>();
  const out: QuotePackageOperatingBasis[] = [];
  for (const c of cases) {
    if (c.error) continue;
    const key = `${c.operatingWeekdaysLabel ?? ''}|${c.monthlyVisits ?? ''}|${c.includeHolidays ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: c.monthBasisLabel ?? `${c.operatingWeekdaysLabel ?? '운영일'} 기준`,
      weekdaysLabel: c.operatingWeekdaysLabel ?? null,
      monthlyVisits: isFiniteNumber(c.monthlyVisits) ? c.monthlyVisits : null,
      includeHolidays: typeof c.includeHolidays === 'boolean' ? c.includeHolidays : null,
    });
  }
  return out;
}

function documentViews(): QuotePackage['documentViews'] {
  const make = (view: QuoteDocumentView, fields: string[]) => ({ view, fields });
  return [
    make('customer-summary', ['summary', 'customerRows', 'operatingBasis.minimal', 'vat', 'notes']),
    make('calculation-basis', ['summary', 'cases', 'pricingBreakdown', 'operatingBasis', 'timeline']),
    make('internal-risk', ['risks', 'timeline', 'deadlineSlack', 'predictionFallback', 'actions']),
    make('email-draft', ['summary', 'customerRows', 'notes']),
  ];
}

export function buildQuotePackage(board: CaseBoardResult, vatRate = DEFAULT_VAT_RATE): QuotePackage {
  const validCases = (board.cases ?? []).filter((c) => !c.error);
  const monthlyTotal = board.rollup.monthlyTotal ?? null;
  const groupMap = new Map<string, CaseBoardCaseResult[]>();

  for (const c of validCases) {
    const key = c.group?.trim() || c.label.split(' ')[0] || '기타';
    groupMap.set(key, [...(groupMap.get(key) ?? []), c]);
  }

  const groupRollups: QuotePackageGroupRollup[] = Array.from(groupMap.entries()).map(([group, items]) => {
    const groupMonthly = items.reduce((sum, c) => sum + (isFiniteNumber(c.monthlyTotal) ? c.monthlyTotal : 0), 0);
    return {
      group,
      monthlyTotal: Math.round(groupMonthly),
      vatAmount: vatOf(groupMonthly, vatRate) ?? 0,
      monthlyTotalWithVat: withVat(groupMonthly, vatRate) ?? 0,
      riskLabel: customerNote(items),
    };
  });

  const customerRows: QuotePackageCustomerRow[] = validCases.map((c) => ({
    group: c.group?.trim() || c.label,
    operatingDays: c.operatingWeekdaysLabel ?? '-',
    slot: slotLabel(c.label, c.departureLabel),
    monthlyTotal: isFiniteNumber(c.monthlyTotal) ? Math.round(c.monthlyTotal) : null,
    monthlyTotalWithVat: withVat(isFiniteNumber(c.monthlyTotal) ? c.monthlyTotal : null, vatRate),
    note: riskLabelText(c.riskGrade),
  }));

  const risks: QuotePackageRisk[] = validCases
    .filter((c) => c.riskGrade && c.riskGrade !== 'safe' && c.riskGrade !== 'none')
    .map((c) => ({
      caseId: c.id,
      label: c.label,
      grade: c.riskGrade ?? 'none',
      labelText: riskLabelText(c.riskGrade),
      reason: buildRiskReason(c),
      recommendedAction: buildRiskAction(c),
    }));

  return {
    summary: {
      monthlyTotal,
      vatAmount: vatOf(monthlyTotal, vatRate),
      monthlyTotalWithVat: withVat(monthlyTotal, vatRate),
      contractMonths: board.rollup.contractMonths,
      contractTotal: board.rollup.contractTotal,
      targetMonth: board.rollup.targetMonth,
      vatRate,
    },
    operatingBasis: buildOperatingBasis(validCases),
    groupRollups,
    customerRows,
    risks,
    documentViews: documentViews(),
  };
}
