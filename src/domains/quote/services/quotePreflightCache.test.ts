import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildQuotePreflightCacheKey,
  clearQuotePreflightCache,
  getCachedQuotePreflight,
} from '@/domains/quote/services/quotePreflightCache';
import type { QuotePreflightDraft } from '@/domains/quote/types/quotePreflight';

const result = {
  cases: [],
  confidence: 'high',
  reviewReasons: [],
  validationIssues: [],
} as unknown as QuotePreflightDraft;

describe('quotePreflightCache', () => {
  beforeEach(clearQuotePreflightCache);

  it('고객사 원문을 노출하지 않는 안정적인 캐시 키를 만든다', () => {
    const source = '고객사 주소 서울시 중구 퇴계로 19';
    const first = buildQuotePreflightCacheKey('model-a', source);
    expect(first).toHaveLength(64);
    expect(first).not.toContain(source);
    expect(buildQuotePreflightCacheKey('model-a', source)).toBe(first);
    expect(buildQuotePreflightCacheKey('model-b', source)).not.toBe(first);
  });

  it('같은 입력의 동시 요청을 한 번으로 합친다', async () => {
    const create = vi.fn(async () => result);
    const [first, second] = await Promise.all([
      getCachedQuotePreflight('same', create, 0),
      getCachedQuotePreflight('same', create, 0),
    ]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(first).toBe(result);
    expect(second).toBe(result);
  });

  it('실패한 요청은 캐시에 남기지 않는다', async () => {
    const failed = vi.fn(async () => {
      throw new Error('provider failed');
    });
    await expect(getCachedQuotePreflight('retry', failed, 0)).rejects.toThrow();

    const recovered = vi.fn(async () => result);
    await expect(getCachedQuotePreflight('retry', recovered, 1)).resolves.toBe(result);
    expect(recovered).toHaveBeenCalledTimes(1);
  });
});
