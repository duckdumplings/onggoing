import { describe, expect, it } from 'vitest';
import {
  getClientRateLimitKey,
  InMemoryRateLimiter,
} from '@/libs/server/inMemoryRateLimit';

describe('InMemoryRateLimiter', () => {
  it('허용량 이후 호출을 남은 윈도우 동안 차단한다', () => {
    const limiter = new InMemoryRateLimiter({ windowMs: 60_000, limit: 2 });

    expect(limiter.consume('ip:1', 1_000).allowed).toBe(true);
    expect(limiter.consume('ip:1', 2_000).allowed).toBe(true);
    expect(limiter.consume('ip:1', 3_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 58,
      remaining: 0,
    });
  });

  it('윈도우가 지나면 새 요청으로 초기화한다', () => {
    const limiter = new InMemoryRateLimiter({ windowMs: 1_000, limit: 1 });
    limiter.consume('ip:1', 0);

    expect(limiter.consume('ip:1', 1_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it('프록시 목록의 첫 번째 IP를 호출 키로 사용한다', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.8, 10.0.0.2' });
    expect(getClientRateLimitKey(headers)).toBe('ip:203.0.113.8');
  });
});
