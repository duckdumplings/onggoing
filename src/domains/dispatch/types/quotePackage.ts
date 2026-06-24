import type { DeadlineRiskGrade } from '@/domains/dispatch/services/caseBoard';

export type QuoteDocumentView = 'customer-summary' | 'calculation-basis' | 'internal-risk' | 'email-draft';

export interface QuotePackageSummary {
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
  monthlyTotal: number;
  vatAmount: number;
  monthlyTotalWithVat: number;
  riskLabel: string;
}

export interface QuotePackageCustomerRow {
  group: string;
  operatingDays: string;
  slot: string;
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
