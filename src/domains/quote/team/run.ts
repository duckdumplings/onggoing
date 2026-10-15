import { z } from 'zod';
import { geocodeStopAddresses, type GeocodedStop } from '@/domains/dispatch/services/stopGeocoder';
import { postRouteOptimizationCached, describeRouteOptFailure } from '@/domains/dispatch/services/routeOptCache';
import { type TeamQuoteRequest, type TeamQuoteCase } from './input';
import { processStop, instant, checkBuffer, type TeamTimelineRow } from './timeline';

const evidence = z.object({
  source: z.enum(['database', 'static-fallback']), effectiveFrom: z.string(), sourceDoc: z.string(),
});
const priceSchema = z.object({
  success: z.literal(true),
  plans: z.object({ hourly: z.object({
    total: z.number().nonnegative(), billMinutes: z.number().positive(), ratePerHour: z.number().positive(),
    fuelSurcharge: z.number().nonnegative(), rateTable: evidence, fuelSurchargeRateTable: evidence,
  }) }),
});
const legSchema = z.object({ data: z.object({
  summary: z.object({
    totalDistance: z.number().nonnegative(), travelTime: z.number().nonnegative(),
    predictionAttemptedSegments: z.number().int().nonnegative(),
    predictionFallbackSegments: z.number().int().nonnegative(),
    validation: z.object({ hasErrors: z.boolean(), errors: z.array(z.string()), warnings: z.array(z.string()) }),
  }),
}) });

export interface TeamQuoteCaseReport {
  label: string;
  vehicleType: TeamQuoteCase['vehicleType'];
  status: 'feasible' | 'tight' | 'infeasible' | 'unverified' | 'error';
  issues: string[];
  price?: z.infer<typeof priceSchema>['plans']['hourly'];
  baselineExVat?: number;
  difference?: number;
  distanceKm?: number;
  driveMinutes?: number;
  workMinutes?: number;
  waitMinutes?: number;
  totalMinutes?: number;
  reservedMinutes?: number;
  reservedFinish?: string;
  traffic?: { segments: number; prediction: number; fallback: number };
  timeline?: TeamTimelineRow[];
  bufferCheck?: ReturnType<typeof checkBuffer>;
  geocodes?: Array<{ input: string; resolved: string; latitude: number; longitude: number }>;
}

export interface TeamQuoteReport {
  generatedAt: string;
  request: TeamQuoteRequest;
  cases: TeamQuoteCaseReport[];
}

export function assertLocalBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('견적 서버는 인증정보 없는 로컬 HTTP 주소만 사용할 수 있습니다. 예: http://127.0.0.1:3101');
  }
  return url.origin;
}

async function runCase(request: TeamQuoteRequest, route: TeamQuoteCase, baseUrl: string,
  geoCache: Map<string, GeocodedStop>): Promise<TeamQuoteCaseReport> {
  const issues: string[] = [];
  const geo = await geocodeStopAddresses(route.stops.map((stop) => stop.address), geoCache, AbortSignal.timeout(30_000));
  const points = route.stops.map((stop) => {
    const found = geo.get(stop.address.trim());
    if (!found?.resolved || found.lowPrecision || found.latitude == null || found.longitude == null) {
      throw new Error(`${stop.name}: 건물 단위 주소를 확인할 수 없습니다. 주소를 보완하세요.`);
    }
    return { name: stop.name, address: stop.address, latitude: found.latitude, longitude: found.longitude };
  });
  let current = instant(request.serviceDate, route.pickupStart);
  let distanceMeters = 0;
  const driveSeconds: number[] = [];
  const traffic = { segments: 0, prediction: 0, fallback: 0 };
  let routeNeedsReview = false;
  const timeline: TeamTimelineRow[] = [];
  for (let index = 0; index < route.stops.length; index += 1) {
    const sameLocation = index > 0 && points[index - 1].latitude === points[index].latitude
      && points[index - 1].longitude === points[index].longitude;
    if (index > 0 && sameLocation) driveSeconds.push(0);
    if (index > 0 && !sameLocation) {
      traffic.segments += 1;
      const result = await postRouteOptimizationCached(baseUrl, {
        origins: [points[index - 1]], destinations: [points[index]],
        vehicleType: route.vehicleType, roadOption: 'time-first',
        departureAt: new Date(current).toISOString(), useRealtimeTraffic: true,
        optimizeOrder: false, openStart: false, fastOrder: false,
        returnToOrigin: false, useExplicitDestination: true,
        finalDestinationAddress: points[index].address,
        originDwellMinutes: 0, dwellMinutes: [0], deliveryTimes: [''],
      }, AbortSignal.timeout(60_000));
      if (!result.ok) throw new Error(describeRouteOptFailure(result.status, result.json));
      const parsed = legSchema.safeParse(result.json);
      if (!parsed.success) throw new Error('경로 응답에 거리·순수 주행시간·교통 근거가 없습니다. 재조회가 필요합니다.');
      // totalTime에는 경로 API의 기본 체류가 들어갈 수 있어 순수 주행시간만 소비한다.
      const summary = parsed.data.data.summary;
      if (summary.totalDistance <= 0 || summary.travelTime <= 0) throw new Error('서로 다른 지점 사이의 거리·주행시간이 누락되었습니다.');
      if (summary.validation.hasErrors || summary.validation.errors.length) {
        throw new Error(`경로 검증 실패: ${summary.validation.errors.join(' / ') || '도로 경로 재확인 필요'}`);
      }
      if (summary.validation.warnings.length) {
        routeNeedsReview = true;
        issues.push(...summary.validation.warnings.map((warning) => `${points[index - 1].name}→${points[index].name}: ${warning}`));
      }
      driveSeconds.push(summary.travelTime);
      distanceMeters += summary.totalDistance;
      traffic.prediction += summary.predictionAttemptedSegments;
      traffic.fallback += summary.predictionFallbackSegments;
      current += summary.travelTime * 1000;
    }
    const row = processStop(route.stops[index], current, request);
    timeline.push(row);
    current = new Date(row.finish).getTime();
  }
  const bufferCheck = checkBuffer(request, route, driveSeconds);
  const driveMinutes = driveSeconds.reduce((sum, value) => sum + value, 0) / 60;
  const workMinutes = timeline.reduce((sum, row) => sum + row.workMinutes, 0);
  const waitMinutes = timeline.reduce((sum, row) => sum + row.waitMinutes, 0);
  const totalMinutes = driveMinutes + workMinutes + waitMinutes;
  const reservedMinutes = totalMinutes + request.bufferMinutes;
  const priceResponse = await fetch(new URL('/api/quote-calculation', baseUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      distance: distanceMeters, time: driveMinutes * 60,
      vehicleType: route.vehicleType, scheduleType: route.scheduleType,
      dwellMinutes: timeline.map((row) => row.workMinutes),
      waitMinutes: waitMinutes + request.bufferMinutes,
      stopsCount: Math.max(0, route.stops.length - 2),
    }),
  });
  const rawPrice = await priceResponse.json();
  const parsedPrice = priceSchema.safeParse(rawPrice);
  if (!priceResponse.ok || !parsedPrice.success) {
    throw new Error(typeof rawPrice?.error?.message === 'string' ? rawPrice.error.message : '운임표 계산에 실패했습니다.');
  }
  const price = parsedPrice.data.plans.hourly;
  const late = timeline.filter((row) => row.slackMinutes != null && row.slackMinutes < 0);
  const bufferLate = bufferCheck.filter((row) => row.slackMinutes != null && row.slackMinutes < 0);
  for (const row of late) issues.push(`${row.name}: 전달/작업 완료가 마감보다 ${Math.ceil(-row.slackMinutes!)}분 늦습니다.`);
  for (const row of bufferLate) issues.push(`${row.name}: ${request.bufferMinutes}분 지연시험 시 마감 ${Math.ceil(-row.slackMinutes!)}분 초과.`);
  const unverified = routeNeedsReview || traffic.prediction !== traffic.segments || traffic.fallback > 0
    || price.rateTable.source !== 'database' || price.fuelSurchargeRateTable.source !== 'database';
  if (traffic.prediction !== traffic.segments || traffic.fallback > 0) issues.push('일부 구간은 운행일 예측 교통으로 확인되지 않았습니다.');
  if (price.rateTable.source !== 'database' || price.fuelSurchargeRateTable.source !== 'database') issues.push('DB 운임표 대신 정적 참고 운임이 포함되었습니다.');
  if (!route.stops.some((stop) => stop.deadline)) issues.push('마감이 없어 시간 준수 여부를 판단할 수 없습니다.');
  for (const stop of route.stops) {
    if (stop.role === 'return' && !stop.deadline) issues.push(`${stop.name}: 반납 마감 미입력.`);
    if (stop.role === 'drop' && stop.bags == null) issues.push(`${stop.name}: 가방 수량 미확인, 차종 적재 검토 필요.`);
  }
  const baselineExVat = route.baseline?.vat === 'excluded' ? route.baseline.amount
    : route.baseline?.vat === 'included' ? route.baseline.amount / 1.1 : undefined;
  if (route.baseline?.vat === 'unknown') issues.push('기존 금액의 VAT 기준이 없어 증감액 비교를 보류했습니다.');
  const hasUnspecifiedDeadline = !route.stops.some((stop) => stop.deadline)
    || route.stops.some((stop) => stop.role === 'return' && !stop.deadline);
  const missingQuantity = route.stops.some((stop) => stop.role === 'drop' && stop.bags == null);
  return {
    label: route.label, vehicleType: route.vehicleType,
    status: late.length ? 'infeasible' : unverified || hasUnspecifiedDeadline || missingQuantity ? 'unverified' : bufferLate.length ? 'tight' : 'feasible',
    issues, price, baselineExVat, difference: baselineExVat != null ? price.total - baselineExVat : undefined,
    distanceKm: distanceMeters / 1000, driveMinutes, workMinutes, waitMinutes, totalMinutes, reservedMinutes,
    reservedFinish: new Date(current + request.bufferMinutes * 60_000).toISOString(), traffic, timeline, bufferCheck,
    geocodes: route.stops.map((stop, index) => ({ input: stop.address, resolved: geo.get(stop.address.trim())!.address,
      latitude: points[index].latitude, longitude: points[index].longitude })),
  };
}

export async function runTeamQuote(request: TeamQuoteRequest, rawBaseUrl: string): Promise<TeamQuoteReport> {
  const baseUrl = assertLocalBaseUrl(rawBaseUrl);
  const cases: TeamQuoteCaseReport[] = [];
  const geoCache = new Map<string, GeocodedStop>();
  // 같은 프로세스의 주소·경로 캐시를 공유하며 유료 API 동시 호출을 억제한다.
  for (const route of request.cases) {
    try { cases.push(await runCase(request, route, baseUrl, geoCache)); }
    catch (error) { cases.push({ label: route.label, vehicleType: route.vehicleType, status: 'error',
      issues: [error instanceof Error ? error.message : '견적 계산 실패'] }); }
  }
  return { generatedAt: new Date().toISOString(), request, cases };
}
