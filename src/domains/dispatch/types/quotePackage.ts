import type { DeadlineRiskGrade } from '@/domains/dispatch/services/caseBoard';

export type QuoteDocumentView = 'customer-summary' | 'calculation-basis' | 'internal-risk';

export interface QuotePackageSummary {
  oneTimeTotal: number;
  oneTimeVatAmount: number;
  oneTimeTotalWithVat: number;
  monthlyTotal: number | null;
  vatAmount: number | null;
  monthlyTotalWithVat: number | null;
  contractMonths: number | null;
  contractTotal: number | null;
  targetMonth: string | null;
  vatRate: number;
}

export interface QuotePackageOperatingBasis {
  label: string;
  weekdaysLabel: string | null;
  monthlyVisits: number | null;
  includeHolidays: boolean | null;
}

export interface QuotePackageGroupRollup {
  group: string;
  oneTimeTotal: number;
  oneTimeVatAmount: number;
  oneTimeTotalWithVat: number;
  monthlyTotal: number | null;
  vatAmount: number | null;
  monthlyTotalWithVat: number | null;
  riskLabel: string;
}

export interface QuotePackageCustomerRow {
  group: string;
  operatingDays: string;
  slot: string;
  oneTimeTotal: number | null;
  oneTimeTotalWithVat: number | null;
  monthlyTotal: number | null;
  monthlyTotalWithVat: number | null;
  note: string;
}

export interface QuotePackageRisk {
  caseId: string;
  label: string;
  grade: DeadlineRiskGrade;
  labelText: string;
  reason: string;
  recommendedAction: string;
}

export interface QuotePackageDocumentViewSpec {
  view: QuoteDocumentView;
  fields: string[];
}

export interface QuotePackage {
  summary: QuotePackageSummary;
  operatingBasis: QuotePackageOperatingBasis[];
  groupRollups: QuotePackageGroupRollup[];
  customerRows: QuotePackageCustomerRow[];
  risks: QuotePackageRisk[];
  documentViews: QuotePackageDocumentViewSpec[];
}
