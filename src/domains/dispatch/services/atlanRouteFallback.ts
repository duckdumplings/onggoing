export type RouteFallbackPoint = {
  latitude: number;
  longitude: number;
  address?: string;
};

export type AtlanRouteFallbackResult = {
  provider: 'atlan-proxy';
  distanceMeters: number;
  durationSeconds: number;
  geometry?: Record<string, unknown> | null;
};

type FetchLike = typeof fetch;

export type AtlanRouteFallbackOptions = {
  departureAt?: string | null;
  vehicleTypeCode?: string;
  fetchImpl?: FetchLike;
  proxyUrl?: string;
  proxyKey?: string;
  timeoutMs?: number;
};

/**
 * Atlan 연동은 공급사별 계약 스펙을 route 엔진에 직접 박지 않고 사내 proxy 계약으로 격리한다.
 * proxy 응답 계약: { distanceMeters, durationSeconds, geometry? }.
 */
export async function fetchAtlanRouteFallback(
  from: RouteFallbackPoint,
  to: RouteFallbackPoint,
  options: AtlanRouteFallbackOptions = {},
): Promise<AtlanRouteFallbackResult | null> {
  const proxyUrl = options.proxyUrl ?? process.env.ATLAN_ROUTE_PROXY_URL;
  if (!proxyUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const proxyKey = options.proxyKey ?? process.env.ATLAN_ROUTE_PROXY_KEY;
    const response = await (options.fetchImpl ?? fetch)(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(proxyKey ? { Authorization: `Bearer ${proxyKey}` } : {}),
      },
      body: JSON.stringify({
        origin: {
          latitude: from.latitude,
          longitude: from.longitude,
          address: from.address,
        },
        destination: {
          latitude: to.latitude,
          longitude: to.longitude,
          address: to.address,
        },
        departureAt: options.departureAt ?? null,
        vehicleType: options.vehicleTypeCode === '2' ? 'starex' : 'ray',
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const raw = await response.json();
    const data = raw?.data ?? raw;
    const distanceMeters = Number(data?.distanceMeters);
    const durationSeconds = Number(data?.durationSeconds);
    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0
    ) {
      return null;
    }

    return {
      provider: 'atlan-proxy',
      distanceMeters,
      durationSeconds,
      geometry:
        data?.geometry && typeof data.geometry === 'object'
          ? data.geometry
          : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAtlanRouteFeatureCollection(
  from: RouteFallbackPoint,
  to: RouteFallbackPoint,
  options: AtlanRouteFallbackOptions = {},
): Promise<{ type: 'FeatureCollection'; features: Array<Record<string, unknown>> } | null> {
  const result = await fetchAtlanRouteFallback(from, to, options);
  if (!result) return null;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: result.geometry ?? null,
        properties: {
          totalDistance: result.distanceMeters,
          totalTime: result.durationSeconds,
          routeProvider: result.provider,
        },
      },
    ],
  };
}
