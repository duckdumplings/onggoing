export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  maxKeys?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

type Bucket = {
  windowStartedAt: number;
  count: number;
};

/**
 * 서버리스 인스턴스 단위의 완만한 버스트 가드다.
 * 분산 전역 제한은 아니지만 외부 LLM 엔드포인트의 단순 반복 호출을 즉시 흡수한다.
 */
export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxKeys: number;

  constructor(private readonly options: RateLimitOptions) {
    this.maxKeys = options.maxKeys ?? 2000;
  }

  consume(key: string, now = Date.now()): RateLimitDecision {
    this.prune(now);
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartedAt >= this.options.windowMs) {
      this.buckets.set(key, { windowStartedAt: now, count: 1 });
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: Math.max(0, this.options.limit - 1),
      };
    }

    bucket.count += 1;
    const allowed = bucket.count <= this.options.limit;
    return {
      allowed,
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil((bucket.windowStartedAt + this.options.windowMs - now) / 1000)),
      remaining: Math.max(0, this.options.limit - bucket.count),
    };
  }

  clear(): void {
    this.buckets.clear();
  }

  private prune(now: number): void {
    if (this.buckets.size < this.maxKeys) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStartedAt >= this.options.windowMs) {
        this.buckets.delete(key);
      }
    }
    while (this.buckets.size >= this.maxKeys) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }
}

export function getClientRateLimitKey(headers: Pick<Headers, 'get'>): string {
  const forwarded = headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}
