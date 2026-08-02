import { createHash } from 'node:crypto';
import type { QuotePreflightDraft } from '@/domains/quote/types/quotePreflight';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

type CacheEntry = {
  expiresAt: number;
  value: Promise<QuotePreflightDraft>;
};

const cache = new Map<string, CacheEntry>();

/** 고객사 주소가 포함될 수 있는 원문을 캐시 Map의 key로 그대로 보관하지 않는다. */
export function buildQuotePreflightCacheKey(
  modelSlug: string,
  message: string,
): string {
  return createHash('sha256')
    .update(modelSlug)
    .update('\0')
    .update(message)
    .digest('hex');
}

function prune(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

/** 같은 복잡 입력의 동시·반복 LLM 해석을 한 번의 요청으로 합친다. */
export async function getCachedQuotePreflight(
  key: string,
  create: () => Promise<QuotePreflightDraft>,
  now = Date.now(),
): Promise<QuotePreflightDraft> {
  prune(now);
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.value;

  const value = create();
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  try {
    return await value;
  } catch (error) {
    if (cache.get(key)?.value === value) cache.delete(key);
    throw error;
  }
}

export function clearQuotePreflightCache(): void {
  cache.clear();
}
