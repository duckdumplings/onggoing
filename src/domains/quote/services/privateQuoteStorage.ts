import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  QUOTE_STORAGE_BUCKET,
  resolveQuoteStoragePath,
  type QuoteStorageRow,
} from '@/domains/quote/services/quoteStoragePath';

export {
  extractQuoteStoragePath,
  QUOTE_STORAGE_BUCKET,
  resolveQuoteStoragePath,
} from '@/domains/quote/services/quoteStoragePath';
export const QUOTE_SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function createQuoteSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = QUOTE_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(QUOTE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || '파일 다운로드 링크를 발급하지 못했습니다.');
  }
  return data.signedUrl;
}

export async function withQuoteSignedUrls<T extends QuoteStorageRow>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<Array<T & { file_url: string }>> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = resolveQuoteStoragePath(row);
      if (!storagePath) {
        throw new Error('저장 파일 경로가 올바르지 않습니다.');
      }
      return {
        ...row,
        storage_path: storagePath,
        file_url: await createQuoteSignedUrl(supabase, storagePath),
      };
    }),
  );
}
