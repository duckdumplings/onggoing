import { describe, expect, it, vi } from 'vitest';
import {
  fetchAtlanRouteFallback,
  getAtlanRouteFeatureCollection,
} from './atlanRouteFallback';

const from = { latitude: 37.48, longitude: 126.88, address: '가산' };
const to = { latitude: 37.40, longitude: 127.11, address: '판교' };

describe('Atlan route proxy fallback', () => {
  it('설정이 없으면 외부 호출 없이 비활성화된다', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchAtlanRouteFallback(from, to, {
      proxyUrl: '',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('검증된 거리·시간만 route feature로 변환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        distanceMeters: 30_700,
        durationSeconds: 2_460,
        geometry: { type: 'LineString', coordinates: [] },
      }),
    });
    const result = await getAtlanRouteFeatureCollection(from, to, {
      proxyUrl: 'https://route-proxy.example.test/atlan',
      proxyKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result?.features[0]).toMatchObject({
      properties: {
        totalDistance: 30_700,
        totalTime: 2_460,
        routeProvider: 'atlan-proxy',
      },
    });
    const request = fetchImpl.mock.calls[0][1];
    expect(request.headers.Authorization).toBe('Bearer test-key');
  });

  it('음수나 비수치 응답은 견적 엔진에 전달하지 않는다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ distanceMeters: -1, durationSeconds: 'unknown' }),
    });
    await expect(
      fetchAtlanRouteFallback(from, to, {
        proxyUrl: 'https://route-proxy.example.test/atlan',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBeNull();
  });
});
