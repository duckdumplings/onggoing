import type { CaseBoardResult } from '@/domains/dispatch/services/caseBoard';

export interface SavedQuoteSummary {
  id: string;
  title: string;
  customerName: string | null;
  totalAmount: number;
  caseCount: number;
  vehicleTypes: string[];
  rateEffectiveFrom: string | null;
  createdAt: string;
}

export interface SavedQuoteDetail extends SavedQuoteSummary {
  quoteBook: CaseBoardResult;
}

export interface SaveQuoteInput {
  quoteBook: CaseBoardResult;
  title?: string;
  customerName?: string;
}
