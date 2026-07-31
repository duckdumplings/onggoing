import 'server-only';

import { z } from 'zod';

import type { CaseBoardResult } from '@/domains/dispatch/services/caseBoard';
import { createServerClient } from '@/libs/supabase-client';
import type {
  SaveQuoteInput,
  SavedQuoteDetail,
  SavedQuoteSummary,
} from '@/domains/quote/types/savedQuote';
import { deriveSavedQuoteMetadata } from '@/domains/quote/services/savedQuoteMetadata';

const RateTableEvidenceSchema = z.object({
  source: z.enum(['database', 'static-fallback']),
  effectiveFrom: z.string().date(),
  sourceDoc: z.string().min(1).max(500),
});

const SavedCaseSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(300),
  vehicleType: z.enum(['레이', '스타렉스']),
  oneTimePrice: z.number().finite().nonnegative().optional(),
  pricingEvidence: z
    .object({
      hourly: RateTableEvidenceSchema.optional(),
      fuelSurcharge: RateTableEvidenceSchema.optional(),
      perJob: RateTableEvidenceSchema.optional(),
    })
    .optional(),
}).passthrough();

export const SaveQuoteInputSchema = z.object({
  quoteBook: z.object({
    cases: z.array(SavedCaseSchema).min(1).max(100),
    rollup: z.object({
      oneTimeTotal: z.number().finite().nonnegative(),
    }).passthrough(),
    basis: z.string().min(1).max(5_000),
  }).passthrough(),
  title: z.string().trim().min(1).max(120).optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
}).superRefine((value, context) => {
  const byteLength = Buffer.byteLength(JSON.stringify(value.quoteBook), 'utf8');
  if (byteLength > 2_000_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quoteBook'],
      message: '견적 기록은 최대 2MB까지 저장할 수 있습니다.',
    });
  }
});

type SavedQuoteRow = {
  id: string;
  title: string;
  customer_name: string | null;
  total_amount: number | string;
  case_count: number;
  vehicle_types: string[] | null;
  rate_effective_from: string | null;
  created_at: string;
  quote_book?: unknown;
};

function mapSummary(row: SavedQuoteRow): SavedQuoteSummary {
  return {
    id: row.id,
    title: row.title,
    customerName: row.customer_name,
    totalAmount: Number(row.total_amount),
    caseCount: row.case_count,
    vehicleTypes: row.vehicle_types ?? [],
    rateEffectiveFrom: row.rate_effective_from,
    createdAt: row.created_at,
  };
}

export async function listSavedQuotes(limit = 50): Promise<SavedQuoteSummary[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('saved_quotes')
    .select('id, title, customer_name, total_amount, case_count, vehicle_types, rate_effective_from, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) throw new Error(error.message);
  return ((data ?? []) as SavedQuoteRow[]).map(mapSummary);
}

export async function getSavedQuote(id: string): Promise<SavedQuoteDetail | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('saved_quotes')
    .select('id, title, customer_name, total_amount, case_count, vehicle_types, rate_effective_from, created_at, quote_book')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as SavedQuoteRow;
  return {
    ...mapSummary(row),
    quoteBook: row.quote_book as CaseBoardResult,
  };
}

export async function createSavedQuote(input: unknown): Promise<SavedQuoteDetail> {
  const parsed = SaveQuoteInputSchema.parse(input);
  const metadata = deriveSavedQuoteMetadata(parsed as unknown as SaveQuoteInput);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('saved_quotes')
    .insert({
      title: metadata.title,
      customer_name: metadata.customerName,
      quote_book: parsed.quoteBook,
      total_amount: metadata.totalAmount,
      case_count: metadata.caseCount,
      vehicle_types: metadata.vehicleTypes,
      rate_effective_from: metadata.rateEffectiveFrom,
    })
    .select('id, title, customer_name, total_amount, case_count, vehicle_types, rate_effective_from, created_at, quote_book')
    .single();

  if (error) throw new Error(error.message);
  const row = data as SavedQuoteRow;
  return {
    ...mapSummary(row),
    quoteBook: row.quote_book as CaseBoardResult,
  };
}
