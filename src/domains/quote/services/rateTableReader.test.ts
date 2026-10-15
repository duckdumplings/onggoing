import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const AS_OF = new Date('2026-10-16T01:00:00Z');
const ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.test_signature';
const hourlyRow = {
  vehicle_type: 'ray',
  pricing_plan: 'hourly',
  effective_from: '2026-10-01',
  effective_to: null,
  source_doc: 'team rate fixture',
  payload: {
    currency: 'KRW', unitMinutes: 30, minBillMinutes: 120,
    tiers: [{ maxMinutes: 180, ratePerHour: 30000 }],
  },
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://team-rate-test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'must-never-be-sent');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('read-only rate table lookup', () => {
  it('서비스 롤 키가 있어도 anon 키로 시행일에 맞는 운임표만 GET 조회한다', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return new Response(JSON.stringify([hourlyRow]), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const { resolveHourlyRateTable } = await import('./rateTableService');

    const result = await resolveHourlyRateTable('ray', AS_OF);

    expect(result).toEqual({
      vehicle: 'ray', effectiveFrom: '2026-10-01', source: 'database',
      sourceDoc: 'team rate fixture', payload: hourlyRow.payload,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].headers.get('apikey')).toBe(ANON_KEY);
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${ANON_KEY}`);
    const query = new URL(requests[0].url);
    expect(query.pathname).toBe('/rest/v1/rate_tables');
    expect(query.searchParams.get('vehicle_type')).toBe('eq.ray');
    expect(query.searchParams.get('pricing_plan')).toBe('eq.hourly');
    expect(query.searchParams.get('effective_from')).toBe('lte.2026-10-16');
    expect(query.searchParams.get('or')).toBe('(effective_to.is.null,effective_to.gte.2026-10-16)');
    expect(query.searchParams.get('order')).toBe('effective_from.desc');
    expect(query.searchParams.get('limit')).toBe('1');
    await resolveHourlyRateTable('ray', AS_OF);
    expect(requests).toHaveLength(1);
  });

  it('서비스 롤 키 없이도 공개 읽기 권한으로 DB 운임표를 사용한다', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([hourlyRow])));
    const { resolveHourlyRateTable } = await import('./rateTableService');

    expect((await resolveHourlyRateTable('ray', AS_OF)).source).toBe('database');
  });

  it.each([
    ['service_role JWT', `header.${Buffer.from('{"role":"service_role"}').toString('base64url')}.signature`],
    ['secret key', 'sb_secret_never-send-this'],
    ['authenticated JWT', `header.${Buffer.from('{"role":"authenticated"}').toString('base64url')}.signature`],
  ])('anon 항목에 %s가 잘못 설정되면 전송 없이 정적표로 종료한다', async (_kind, key) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', key);
    const fetch = vi.fn(async () => new Response(JSON.stringify([hourlyRow])));
    vi.stubGlobal('fetch', fetch);
    const { resolveHourlyRateTable } = await import('./rateTableService');

    const result = await resolveHourlyRateTable('ray', AS_OF);

    expect(fetch).not.toHaveBeenCalled();
    expect(result.source).toBe('static-fallback');
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).not.toContain(key);
  });

  it('publishable 공개키는 운임표 조회에 사용할 수 있다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_test-only');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([hourlyRow])));
    const { resolveHourlyRateTable } = await import('./rateTableService');

    expect((await resolveHourlyRateTable('ray', AS_OF)).source).toBe('database');
  });

  it('공개 설정이 없으면 모듈 로딩을 실패시키거나 관리자 키로 전환하지 않고 정적표를 사용한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const fetch = vi.fn(async () => new Response(JSON.stringify([hourlyRow])));
    vi.stubGlobal('fetch', fetch);
    const loadAndResolve = async () => {
      const { resolveHourlyRateTable } = await import('./rateTableService');
      return resolveHourlyRateTable('ray', AS_OF);
    };

    await expect(loadAndResolve()).resolves.toMatchObject({ source: 'static-fallback' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('DB 응답이 10초 넘게 멈추면 요청을 취소하고 정적표로 종료한다', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
      });
    });
    const { resolveHourlyRateTable } = await import('./rateTableService');

    const pending = resolveHourlyRateTable('ray', AS_OF);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(signal?.aborted).toBe(true);
    await expect(pending).resolves.toMatchObject({ source: 'static-fallback' });
  });
});
