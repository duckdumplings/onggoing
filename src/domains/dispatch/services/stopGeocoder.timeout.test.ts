import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeStopAddresses, resolveStopAddress } from './stopGeocoder';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('geocoder request cancellation', () => {
  it.each(['서울 금천구 가산디지털1로 70', '위펀푸드'])('취소된 %s 조회는 다른 검색 방식으로 재시도하지 않는다', async (address) => {
    const requests: string[] = [];
    const controller = new AbortController();
    const reason = new Error('quote request timed out');
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      requests.push(String(url));
      if (!init?.signal) return Promise.resolve(new Response('{}'));
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      });
    });

    const pending = resolveStopAddress(address, 'test-key', controller.signal);
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(requests).toHaveLength(1);
  });

  it('여러 주소 조회에서도 취소를 null 결과나 캐시 항목으로 바꾸지 않는다', async () => {
    vi.stubEnv('TMAP_API_KEY', 'test-key');
    const controller = new AbortController();
    const reason = new Error('quote request timed out');
    const cache = new Map();
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      if (!init?.signal) return Promise.resolve(new Response('{}'));
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      });
    });

    const pending = geocodeStopAddresses(['서울 금천구 가산디지털1로 70'], cache, controller.signal);
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(cache.size).toBe(0);
  });

  it('취소가 아닌 주소 검색 실패에는 기존 대체 검색을 유지한다', async () => {
    vi.stubGlobal('fetch', (url: string) => Promise.resolve(new Response(JSON.stringify(
      String(url).includes('/geo/fullAddrGeo')
        ? {}
        : { searchPoiInfo: { pois: { poi: [{ noorLat: '37.47', noorLon: '126.88', name: '위펀푸드' }] } } },
    ))));

    await expect(resolveStopAddress('서울 금천구 가산디지털1로 70', 'test-key')).resolves.toEqual({
      latitude: 37.47, longitude: 126.88, address: '위펀푸드',
    });
  });
});
