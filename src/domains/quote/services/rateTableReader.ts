import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Vehicle } from '@/domains/quote/pricing';
import { isPublicSupabaseKey } from './publicSupabaseKey';

const READ_TIMEOUT_MS = 10_000;

/** 공개 SELECT 정책으로만 운임표를 읽는다. 관리자 키나 사용자 세션을 사용하지 않는다. */
export async function readEffectiveRateTable(
  vehicle: Vehicle,
  pricingPlan: 'hourly' | 'fuel_surcharge' | 'per_job',
  asOfIso: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('운임표 공개 읽기 설정이 없습니다.');
  if (!isPublicSupabaseKey(anonKey)) {
    throw new Error('운임표 조회에는 anon 또는 publishable 공개키만 사용할 수 있습니다.');
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    return await client
      .from('rate_tables')
      .select('vehicle_type, pricing_plan, effective_from, effective_to, source_doc, payload')
      .eq('vehicle_type', vehicle)
      .eq('pricing_plan', pricingPlan)
      .lte('effective_from', asOfIso)
      .or(`effective_to.is.null,effective_to.gte.${asOfIso}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .abortSignal(controller.signal)
      .maybeSingle();
  } finally {
    clearTimeout(timer);
  }
}
