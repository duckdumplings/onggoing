import { NextRequest, NextResponse } from 'next/server';
import {
  compareScenarios,
  type ComparisonSortKey,
} from '@/domains/dispatch/services/scenarioComparison';
import {
  geocodeStopAddresses,
  type GeocodedStop,
} from '@/domains/dispatch/services/stopGeocoder';
import type {
  QuoteScenario,
  RouteMetrics,
  RouteStop,
  StopRole,
} from '@/domains/dispatch/types/routePlan';

/**
 * 다중 시나리오 병렬 견적 API.
 *
 * 입력: { scenarios: QuoteScenario[], sortKey?, departureAt? }
 * 동작: 시나리오별로 (routeMetrics가 없으면) 내부 /api/route-optimization을 호출해
 *       경로 메트릭을 채운 뒤, 역할/빈도 인지 견적을 병렬 계산·비교한다.
 *
 * 비즈니스 로직은 domains/dispatch/services에 위치하고, 본 라우트는 I/O·오케스트레이션만 담당한다.
 */

const VALID_ROLES: StopRole[] = ['pickup', 'drop', 'return', 'waypoint'];

interface ScenarioRouteError {
  label: string;
  message: string;
}

function sanitizeStop(raw: unknown): RouteStop | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const address = String(r.address || '').trim();
  if (!address) return null;
  const role = VALID_ROLES.includes(r.role as StopRole) ? (r.role as StopRole) : 'waypoint';
  return {
    address,
    role,
    latitude: Number.isFinite(r.latitude as number) ? Number(r.latitude) : undefined,
    longitude: Number.isFinite(r.longitude as number) ? Number(r.longitude) : undefined,
    weightKg: Number.isFinite(r.weightKg as number) ? Number(r.weightKg) : undefined,
    dwellMinutes: Number.isFinite(r.dwellMinutes as number) ? Number(r.dwellMinutes) : undefined,
    deliveryTime: r.deliveryTime ? String(r.deliveryTime) : undefined,
    memo: r.memo ? String(r.memo) : undefined,
  };
}

function sanitizeScenario(raw: unknown, index: number): QuoteScenario | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const stops = Array.isArray(r.stops)
    ? r.stops.map(sanitizeStop).filter((s): s is RouteStop => Boolean(s))
    : [];
  if (stops.length === 0) return null;
  const vehicleType = r.vehicleType === '스타렉스' ? '스타렉스' : '레이';
  const scheduleType = r.scheduleType === 'regular' ? 'regular' : 'ad-hoc';
  return {
    label: String(r.label || `시나리오 ${index + 1}`),
    stops,
    vehicleType,
    scheduleType,
    frequency: (r.frequency as QuoteScenario['frequency']) || undefined,
    routeMetrics: (r.routeMetrics as RouteMetrics) || undefined,
  };
}

/** 좌표가 해석된 stop은 객체로(지오코딩 생략), 아니면 주소 문자열로 변환. */
function toRoutePoint(address: string, geocodeCache: Map<string, GeocodedStop>) {
  const hit = geocodeCache.get(address.trim());
  if (hit?.resolved && hit.latitude != null && hit.longitude != null) {
    return { name: hit.address || address, address: hit.address || address, latitude: hit.latitude, longitude: hit.longitude };
  }
  return address;
}

/** 시나리오의 stops를 route-optimization 페이로드(출발지 1 + 경유지 N + 종착 고정)로 변환. */
function buildRoutePayload(
  scenario: QuoteScenario,
  geocodeCache: Map<string, GeocodedStop>,
  departureAt?: string
) {
  const pickups = scenario.stops.filter((s) => s.role === 'pickup');
  const drops = scenario.stops.filter((s) => s.role === 'drop');

  // 출발지: 첫 수거지(없으면 첫 stop)
  const originStop = pickups[0] ?? scenario.stops[0];
  const remaining = scenario.stops.filter((s) => s !== originStop);
  // 종착지: 단일 하차지(있으면 맨 끝 고정)
  const finalDrop = drops[drops.length - 1];
  const orderedRemaining = finalDrop
    ? [...remaining.filter((s) => s !== finalDrop), finalDrop]
    : remaining;

  return {
    origins: [toRoutePoint(originStop.address, geocodeCache)],
    destinations: orderedRemaining.map((s) => toRoutePoint(s.address, geocodeCache)),
    finalDestinationAddress: finalDrop ? finalDrop.address : null,
    useExplicitDestination: Boolean(finalDrop),
    vehicleType: scenario.vehicleType,
    optimizeOrder: true,
    returnToOrigin: false,
    useRealtimeTraffic: true,
    roadOption: 'time-first',
    departureAt: departureAt ?? undefined,
    dwellMinutes: orderedRemaining.map((s) => s.dwellMinutes ?? 0),
  };
}

type ScenarioRoutePayload = ReturnType<typeof buildRoutePayload>;

/** route-optimization 에러 본문에서 사람이 읽을 메시지를 뽑는다. */
function describeRouteError(status: number, body: unknown): string {
  const b = (body || {}) as Record<string, any>;
  const failed = b?.diagnostics?.failedAddresses;
  if (Array.isArray(failed) && failed.length > 0) {
    const names = failed.map((f: any) => f?.address).filter(Boolean).join(', ');
    return `주소를 찾지 못했어요: ${names}`;
  }
  if (typeof b?.error === 'string' && b.error) return b.error;
  if (typeof b?.message === 'string' && b.message) return b.message;
  return `경로 계산 실패 (HTTP ${status})`;
}

async function resolveMetrics(
  request: NextRequest,
  scenario: QuoteScenario,
  payload: ScenarioRoutePayload
): Promise<{ metrics?: RouteMetrics; error?: string }> {
  if (scenario.routeMetrics) return { metrics: scenario.routeMetrics };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(new URL('/api/route-optimization', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: describeRouteError(res.status, body) };
    }
    const json = await res.json();
    const summary = json?.data?.summary;
    if (!summary) return { error: '경로 요약 정보를 받지 못했습니다.' };
    return {
      metrics: {
        km: Number(summary.totalDistance || 0) / 1000,
        driveMinutes: Math.round(Number(summary.travelTime || 0) / 60),
        dwellMinutes: Math.round(Number(summary.dwellTime || 0) / 60),
        stopsCount: 0, // 0이면 scenarioPricing이 역할 구성에서 자동 추정
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '경로 계산 중 오류' };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawScenarios = Array.isArray(body?.scenarios) ? body.scenarios : [];
    const scenarios = rawScenarios
      .map((s: unknown, i: number) => sanitizeScenario(s, i))
      .filter((s: QuoteScenario | null): s is QuoteScenario => Boolean(s));

    if (scenarios.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '유효한 시나리오가 없습니다.' } },
        { status: 400 }
      );
    }

    const sortKey: ComparisonSortKey = ['annualPrice', 'oneTimePrice', 'km', 'totalMinutes'].includes(
      body?.sortKey
    )
      ? body.sortKey
      : 'annualPrice';
    // 견적 산정과 지도 미리보기가 동일 결과를 내도록 출발 시각을 한 번 고정한다.
    // (미설정 시 현재+5분 스냅샷 → 동일 페이로드 재실행 시 교통 변동에 의한 불일치 방지)
    const departureAt = body?.departureAt
      ? String(body.departureAt)
      : new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const metricsByLabel: Record<string, RouteMetrics> = {};
    const routeErrors: ScenarioRouteError[] = [];
    // 각 시나리오의 지도 렌더용 경로 페이로드(좌표 해석본). 클라이언트가 그대로 재사용한다.
    const scenarioRoutes: Array<{ label: string; routeRequest: ScenarioRoutePayload }> = [];

    // 모든 시나리오의 주소를 한 번에 좌표로 해석(중복 캐시 공유) → 지오코딩 실패 최소화
    const allAddresses = scenarios.flatMap((s: QuoteScenario) => s.stops.map((st) => st.address));
    const geocodeCache = await geocodeStopAddresses(allAddresses);

    await Promise.all(
      scenarios.map(async (scenario: QuoteScenario) => {
        const routeRequest = buildRoutePayload(scenario, geocodeCache, departureAt);
        scenarioRoutes.push({ label: scenario.label, routeRequest });
        const { metrics, error } = await resolveMetrics(request, scenario, routeRequest);
        if (metrics) metricsByLabel[scenario.label] = metrics;
        if (error) routeErrors.push({ label: scenario.label, message: error });
      })
    );

    const comparison = compareScenarios(scenarios, metricsByLabel, sortKey);

    // comparison.results 순서에 맞춰 scenarioRoutes를 정렬(라벨 매칭).
    const orderedRoutes = comparison.results
      .map((r) => scenarioRoutes.find((sr) => sr.label === r.label))
      .filter((x): x is { label: string; routeRequest: ScenarioRoutePayload } => Boolean(x));

    return NextResponse.json({
      success: true,
      comparison,
      scenarioRoutes: orderedRoutes,
      routeErrors: routeErrors.length > 0 ? routeErrors : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'unknown' } },
      { status: 500 }
    );
  }
}
