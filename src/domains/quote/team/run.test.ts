import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTeamQuoteRequest } from './input';
import { assertLocalBaseUrl, runTeamQuote } from './run';
import { formatTeamQuoteReport } from './report';

let sequence = 0;
let geoRequests: string[];
let routes: Array<Record<string, unknown>>;
let prices: Array<Record<string, unknown>>;
let routeSummary: Record<string, unknown>;
let rateSource: 'database' | 'static-fallback';

function request() {
  sequence += 1;
  return parseTeamQuoteRequest({ title: '금요일 견적', serviceDate: '2026-10-16', cases: [{
    label: '기본안', vehicleType: '레이', pickupStart: '09:00',
    baseline: { amount: 110000, vat: 'included' },
    stops: [
      { name: '상차', address: `서울 서초구 서운로 ${sequence}`, role: 'pickup', bags: 2 },
      { name: '배송', address: `서울 마포구 백범로 ${sequence}`, role: 'drop', bags: 2, deadline: '11:30' },
    ],
  }] });
}

beforeEach(() => {
  geoRequests = []; routes = []; prices = []; rateSource = 'database';
  routeSummary = { totalDistance: 15000, travelTime: 1800, totalTime: 99999,
    predictionAttemptedSegments: 1, predictionFallbackSegments: 0,
    validation: { hasErrors: false, errors: [], warnings: [] } };
  vi.stubEnv('TMAP_API_KEY', 'test-key');
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.includes('fullAddrGeo')) {
      const address = url.searchParams.get('fullAddr')!;
      geoRequests.push(address);
      return Response.json({ coordinateInfo: { coordinate: [{
        newLat: address.includes('서초구') ? '37.48' : '37.55', newLon: '126.97',
      }] } });
    }
    const body = JSON.parse(String(init?.body));
    if (url.pathname === '/api/route-optimization') {
      routes.push(body);
      return Response.json({ success: true, data: { summary: routeSummary } });
    }
    if (url.pathname === '/api/quote-calculation') {
      prices.push(body);
      const billMinutes = Math.max(120, Math.ceil((Math.ceil(body.time / 60)
        + body.dwellMinutes.reduce((sum: number, value: number) => sum + value, 0) + body.waitMinutes) / 30) * 30);
      const evidence = { source: rateSource, effectiveFrom: '2026-07-01', sourceDoc: '테스트 운임' };
      return Response.json({ success: true, plans: { hourly: {
        total: billMinutes * 600, billMinutes, ratePerHour: 36000, fuelSurcharge: 0,
        rateTable: evidence, fuelSurchargeRateTable: evidence,
      } } });
    }
    throw new Error(`예상하지 못한 외부 요청: ${url.pathname}`);
  }));
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('팀 견적 실행', () => {
  it('순수 주행 초를 사용하고 대기·작업·버퍼를 중복 없이 청구한다', async () => {
    const result = await runTeamQuote(request(), 'http://127.0.0.1:3101');
    const item = result.cases[0];
    expect(item.status).toBe('feasible');
    expect(item.distanceKm).toBe(15);
    expect(item.driveMinutes).toBe(30);
    expect(item.workMinutes).toBe(20);
    expect(item.waitMinutes).toBe(89);
    expect(item.totalMinutes).toBe(139);
    expect(item.reservedMinutes).toBe(159);
    expect(prices[0]).toMatchObject({ time: 1800, distance: 15000, dwellMinutes: [10, 10], waitMinutes: 109 });
    expect(item.price).toMatchObject({ total: 108000, billMinutes: 180 });
    expect(item.baselineExVat).toBeCloseTo(100000);
    expect(item.difference).toBeCloseTo(8000);
    const markdown = formatTeamQuoteReport(result);
    expect(markdown).toContain('108,000원');
    expect(markdown).toContain('159분');
    expect(markdown).toContain('15.0km');
    expect(markdown).toContain('VAT 제외');
  });

  it('맞수거 대기가 끝난 다음 시각으로 후속 구간을 조회한다', async () => {
    const input = request();
    input.cases[0].stops[1].collection = { readyAt: '12:31', minutes: 5 };
    input.cases[0].stops.push({ name: '반납', address: '서울 서초구 서운로 1', role: 'return', deadline: '13:00' });
    const result = await runTeamQuote(input, 'http://127.0.0.1:3101');
    expect(routes[1].departureAt).toBe('2026-10-16T03:36:00.000Z');
    expect(result.cases[0].timeline?.[1].deliveryComplete).toBe('2026-10-16T02:19:00.000Z');
    expect(result.cases[0].timeline?.[2].slackMinutes).toBe(-16);
    expect(result.cases[0].status).toBe('infeasible');
  });

  it('동일 주소를 쓰는 여러 라인은 지오코딩을 공유한다', async () => {
    const input = request();
    input.cases.push({ ...input.cases[0], label: '비교안' });
    const result = await runTeamQuote(input, 'http://127.0.0.1:3101');
    expect(result.cases.map((item) => item.status)).toEqual(['feasible', 'feasible']);
    expect(geoRequests).toHaveLength(2);
  });

  it('같은 좌표의 연속 작업은 주행 조회나 교통 미검증이 필요 없다', async () => {
    const input = request();
    input.cases[0].stops[1].address = input.cases[0].stops[0].address;
    const result = await runTeamQuote(input, 'http://127.0.0.1:3101');
    expect(result.cases[0].distanceKm).toBe(0);
    expect(result.cases[0].traffic?.segments).toBe(0);
    expect(result.cases[0].status).toBe('feasible');
    expect(routes).toHaveLength(0);
  });

  it('서로 다른 좌표의 거리·시간 누락은 견적 오류다', async () => {
    routeSummary.totalDistance = 0; routeSummary.travelTime = 0;
    const result = await runTeamQuote(request(), 'http://127.0.0.1:3101');
    expect(result.cases[0].status).toBe('error');
    expect(result.cases[0].price).toBeUndefined();
  });

  it('경로 검증 경고를 숨기지 않고 재확인 상태로 남긴다', async () => {
    routeSummary.validation = { hasErrors: false, errors: [], warnings: ['거리 검증 필요'] };
    const result = await runTeamQuote(request(), 'http://127.0.0.1:3101');
    expect(result.cases[0].status).toBe('unverified');
    expect(result.cases[0].issues.join(' ')).toContain('거리 검증 필요');
  });

  it('경로 검증 오류가 있으면 가격을 계산하지 않는다', async () => {
    routeSummary.validation = { hasErrors: true, errors: ['거리 오류'], warnings: [] };
    const result = await runTeamQuote(request(), 'http://127.0.0.1:3101');
    expect(result.cases[0].status).toBe('error');
    expect(prices).toHaveLength(0);
  });

  it('교통 fallback 또는 정적 운임은 재확인 상태로 구분한다', async () => {
    routeSummary.predictionFallbackSegments = 1; rateSource = 'static-fallback';
    const result = await runTeamQuote(request(), 'http://127.0.0.1:3101');
    expect(result.cases[0].status).toBe('unverified');
    expect(result.cases[0].issues).toHaveLength(2);
  });

  it('초 단위 마감 위반을 분 표시에서 정상 완료처럼 잘라내지 않는다', async () => {
    const input = request();
    input.cases[0].pickupStart = '10:30';
    routeSummary.travelTime = 2401;
    const result = await runTeamQuote(input, 'http://127.0.0.1:3101');
    expect(result.cases[0].status).toBe('infeasible');
    expect(result.cases[0].timeline?.[1].deliveryComplete).toBe('2026-10-16T02:30:01.000Z');
    expect(formatTeamQuoteReport(result)).toContain('| 11:21 | 11:21 | 11:31 |');
  });

  it('미확인 수량은 정상 확정 상태로 표시하지 않고 VAT 불명 금액은 비교를 보류한다', async () => {
    const input = request();
    delete input.cases[0].stops[1].bags;
    input.cases[0].baseline!.vat = 'unknown';
    const result = await runTeamQuote(input, 'http://127.0.0.1:3101');
    expect(result.cases[0].status).toBe('unverified');
    expect(result.cases[0].difference).toBeUndefined();
  });

  it('외부 또는 인증정보가 들어간 서버 주소는 거부한다', () => {
    for (const address of ['https://127.0.0.1', 'http://example.com', 'http://a:b@localhost', 'http://localhost/api']) {
      expect(() => assertLocalBaseUrl(address)).toThrow();
    }
    expect(assertLocalBaseUrl('http://127.0.0.1:3101/')).toBe('http://127.0.0.1:3101');
  });
});
