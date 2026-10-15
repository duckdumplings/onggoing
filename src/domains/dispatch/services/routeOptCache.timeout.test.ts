import { afterEach, describe, expect, it, vi } from 'vitest';
import { postRouteOptimizationCached } from './routeOptCache';

afterEach(() => vi.unstubAllGlobals());

describe('cached route request cancellation', () => {
  it('요청 취소가 실제 HTTP 조회에 전달되고 취소 응답을 캐시하지 않는다', async () => {
    const controller = new AbortController();
    const reason = new Error('route request timed out');
    const payload = { origins: ['timeout-origin'], destinations: ['timeout-destination'] };
    let requests = 0;
    vi.stubGlobal('fetch', (_url: URL, init?: RequestInit) => {
      requests += 1;
      if (!init?.signal) return Promise.resolve(new Response('{"attempt":2}'));
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      });
    });

    const pending = postRouteOptimizationCached('http://127.0.0.1:3101', payload, controller.signal);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    const next = await postRouteOptimizationCached('http://127.0.0.1:3101', payload);
    expect(next.cached).toBe(false);
    expect(next.json).toEqual({ attempt: 2 });
    expect(requests).toBe(2);
  });

  it('이미 취소된 요청은 새 HTTP 조회를 시작하지 않는다', async () => {
    const controller = new AbortController();
    const reason = new Error('route request already timed out');
    controller.abort(reason);
    let requested = false;
    vi.stubGlobal('fetch', () => {
      requested = true;
      return Promise.resolve(new Response('{}'));
    });

    await expect(postRouteOptimizationCached('http://127.0.0.1:3101', {
      origins: ['already-cancelled-origin'], destinations: ['already-cancelled-destination'],
    }, controller.signal)).rejects.toBe(reason);
    expect(requested).toBe(false);
  });

  it('응답 본문을 읽는 중 취소해도 빈 성공 응답으로 바꾸지 않는다', async () => {
    const controller = new AbortController();
    const reason = new Error('response body timed out');
    vi.stubGlobal('fetch', async () => ({
      ok: true, status: 200,
      json: async () => { controller.abort(reason); throw reason; },
    }));

    await expect(postRouteOptimizationCached('http://127.0.0.1:3101', {
      origins: ['body-cancelled-origin'], destinations: ['body-cancelled-destination'],
    }, controller.signal)).rejects.toBe(reason);
  });
});
