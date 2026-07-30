'use client';

/**
 * 단순 견적 뷰 (/quote) — AI 견적챗과 별개 경로.
 * 좌측 통합 지점 리스트(역할/주소/시각/체류/수량, 셀 복붙 + 저신뢰 배지)가 곧 폼이고,
 * "견적 계산"은 LLM 중간층 없이 /api/route-optimization을 직접 호출한다(useRouteOptimization.optimizeRouteWith).
 * 지도는 순수 컴포넌트 TmapMap으로 경로 결과를 렌더하고, 견적은 routeData에서 computeRouteQuote로 산출한다.
 */

import Link from 'next/link';
import { useMemo, useState, useCallback } from 'react';
import TmapMap from '@/components/map/TmapMap';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';
import { computeRouteQuote, type RouteQuote } from '@/domains/quote/services/quoteFromRoute';
import { parsePastedStops } from '@/domains/quote/services/pasteToStops';
import type { StopRole } from '@/domains/dispatch/types/routePlan';

interface StopRow {
  id: string;
  role: StopRole;
  name: string; // 상호/지점명(복붙 시 memo에서 채움)
  address: string;
  selected: AddressSelection | null; // 자동완성으로 확정된 좌표
  time: string; // 'HH:mm' — pickup=준비시각, drop/return=도착 마감
  dwellMinutes: string; // 문자열 입력(빈값=기본)
  quantity: string;
  lowConfidence: { address?: boolean; role?: boolean; time?: boolean };
}

const ROLE_OPTIONS: Array<{ value: StopRole; label: string }> = [
  { value: 'pickup', label: '상차' },
  { value: 'drop', label: '하차' },
  { value: 'return', label: '반납' },
  { value: 'waypoint', label: '경유' },
];

const DEFAULT_DWELL: Record<StopRole, number> = { pickup: 15, drop: 12, return: 8, waypoint: 5 };

const ROLE_LABEL: Record<string, string> = { pickup: '상차', drop: '하차', return: '반납', waypoint: '경유' };
const ROLE_TONE: Record<string, string> = {
  pickup: 'bg-emerald-100 text-emerald-700',
  drop: 'bg-blue-100 text-blue-700',
  return: 'bg-purple-100 text-purple-700',
  waypoint: 'bg-muted text-muted-foreground',
};
// S9 마감 여유 톤: 초과=위반, 15~20분=이상적, <15=빡빡, >20=너무 이름(대기·컴플레인)
const SLACK_TONE: Record<string, string> = {
  late: 'bg-danger-100 text-danger-700',
  ideal: 'bg-emerald-100 text-emerald-700',
  tight: 'bg-amber-100 text-amber-700',
  early: 'bg-sky-100 text-sky-700',
};

let rowSeq = 0;
const newRow = (role: StopRole = 'waypoint'): StopRow => ({
  id: `row-${rowSeq++}`,
  role,
  name: '',
  address: '',
  selected: null,
  time: '',
  dwellMinutes: '',
  quantity: '',
  lowConfidence: {},
});

const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

export default function SimpleQuotePage() {
  const { routeData, optimizeRouteWith, isLoading } = useRouteOptimization();
  const [rows, setRows] = useState<StopRow[]>([newRow('pickup'), newRow('drop')]);
  const [vehicleType, setVehicleType] = useState<'레이' | '스타렉스'>('레이');
  const [departureTime, setDepartureTime] = useState(''); // 'HH:mm'
  const [optimizeOrder, setOptimizeOrder] = useState(false); // 기본: 입력 순서 존중
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [violation, setViolation] = useState<{ errors: string[]; suggestions: string[] } | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const updateRow = useCallback((id: string, patch: Partial<StopRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);
  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((r) => r.id !== id)));
  }, []);
  const addRow = useCallback(() => setRows((prev) => [...prev, newRow('drop')]), []);

  const applyPaste = useCallback(() => {
    const drafts = parsePastedStops(pasteText);
    if (!drafts.length) return;
    setRows(
      drafts.map((d) => ({
        ...newRow(d.role),
        role: d.role,
        name: d.memo ?? '',
        address: d.address,
        time: d.deliveryTime ?? '',
        quantity: d.quantity != null ? String(d.quantity) : '',
        lowConfidence: d.lowConfidence ?? {},
      }) as StopRow)
    );
    setShowPaste(false);
  }, [pasteText]);

  // 지도 프리뷰용 waypoints (경로 계산 결과 우선, 없으면 확정 좌표 프리뷰)
  const waypoints = useMemo(() => buildQuoteWaypoints(routeData, rows), [routeData, rows]);
  const quote: RouteQuote | null = useMemo(
    () => (routeData?.summary ? computeRouteQuote(routeData.summary, (routeData as any)?.waypoints?.length ?? waypoints.length) : null),
    [routeData, waypoints.length]
  );
  const [showBreakdown, setShowBreakdown] = useState(false);

  // 경로 타임라인 + 마감 여유(S9): 지점별 도착시각과 마감 대비 여유를 눈으로 확인.
  const timelineRows = useMemo(() => buildTimeline(routeData), [routeData]);

  const canCalc = rows.filter((r) => r.address.trim()).length >= 2;

  const runQuote = useCallback(async () => {
    setViolation(null);
    setCalcError(null);
    const filled = rows.filter((r) => r.address.trim());
    if (filled.length < 2) return;

    const origin = filled[0];
    const dests = filled.slice(1);
    const allResolved = filled.every((r) => r.selected?.latitude != null && r.selected?.longitude != null);

    // pickup 시각은 준비시각(not-before)이라 도착 마감(deliveryTimes)에 넣지 않는다.
    const deliveryTimes = dests.map((r) => (r.role === 'pickup' ? '' : r.time.trim()));
    const dwellMinutes = dests.map((r) =>
      r.dwellMinutes.trim() ? Math.max(0, Number(r.dwellMinutes)) : DEFAULT_DWELL[r.role]
    );
    const stopRoles = dests.map((r) => r.role);
    const lastRole = dests[dests.length - 1]?.role;
    const useExplicitDestination = lastRole === 'drop' || lastRole === 'return';

    const options = {
      optimizeOrder,
      useRealtimeTraffic: true,
      useExplicitDestination,
      returnToOrigin: false,
      roadOption: 'time-first' as const,
      deliveryTimes,
      isNextDayFlags: dests.map(() => false),
      originDwellMinutes: origin.dwellMinutes.trim()
        ? Math.max(0, Number(origin.dwellMinutes))
        : DEFAULT_DWELL[origin.role],
      stopRoles,
      originRole: origin.role,
      departureAt: departureTime.trim() ? hhmmToNextIso(departureTime.trim()) : null,
    };

    const override = allResolved
      ? {
          origins: { lat: origin.selected!.latitude, lng: origin.selected!.longitude, address: origin.selected!.address },
          destinations: dests.map((r) => ({ lat: r.selected!.latitude, lng: r.selected!.longitude, address: r.selected!.address })),
          vehicleType,
          dwellMinutes,
          options,
        }
      : {
          rawOrigins: [origin.address.trim()],
          rawDestinations: dests.map((r) => r.address.trim()),
          vehicleType,
          dwellMinutes,
          options,
        };

    const result: any = await optimizeRouteWith(override as any);
    if (result && result.success === false) {
      const d = result.details || {};
      const errs: string[] = Array.isArray(d?.details?.errors) ? d.details.errors : Array.isArray(d?.errors) ? d.errors : [];
      const sugg: string[] = Array.isArray(d?.details?.suggestions)
        ? d.details.suggestions.map((s: any) => s?.description || s?.title).filter(Boolean)
        : [];
      if (errs.length) setViolation({ errors: errs, suggestions: sugg });
      else setCalcError(result.error || '견적 계산에 실패했어요.');
    }
  }, [rows, vehicleType, departureTime, optimizeOrder, optimizeRouteWith]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans">
      {/* 좌측: 지점 리스트 = 폼 */}
      <aside className="flex h-full w-[440px] min-w-[440px] flex-col border-r border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">간편 견적</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">AI 챗 없이 직접 계산</span>
          </div>
          <Link href="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            홈으로
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* 셀 복붙 */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              className="w-full rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            >
              {showPaste ? '표 붙여넣기 닫기' : '＋ 표/셀 데이터 붙여넣기'}
            </button>
            {showPaste && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="엑셀/시트에서 복사한 배송라인을 그대로 붙여넣으세요 (탭 구분)"
                  className="h-24 w-full resize-y rounded-md border border-border bg-background p-2 text-xs"
                />
                <button
                  type="button"
                  onClick={applyPaste}
                  disabled={!pasteText.trim()}
                  className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
                >
                  리스트로 채우기
                </button>
              </div>
            )}
          </div>

          {/* 지점 행 */}
          <ol className="space-y-2">
            {rows.map((row, idx) => (
              <li key={row.id} className="rounded-lg border border-border bg-background p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[11px] font-medium text-foreground">
                      {idx + 1}
                    </span>
                    <select
                      value={row.role}
                      onChange={(e) => updateRow(row.id, { role: e.target.value as StopRole, lowConfidence: { ...row.lowConfidence, role: false } })}
                      className={`rounded-md border px-1.5 py-0.5 text-xs ${row.lowConfidence.role ? 'border-amber-400 bg-amber-50' : 'border-border bg-card'}`}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {row.lowConfidence.role && <span className="text-[10px] text-amber-600">역할 확인</span>}
                  </div>
                  <button type="button" onClick={() => removeRow(row.id)} className="text-xs text-muted-foreground hover:text-danger-600" aria-label="행 삭제">✕</button>
                </div>

                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  placeholder="상호/지점명 (선택)"
                  className="mb-1 w-full rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground"
                />

                <AddressAutocomplete
                  label=""
                  placeholder={idx === 0 ? '출발/첫 지점 주소' : '지점 주소'}
                  value={row.selected}
                  onSelect={(v) =>
                    updateRow(row.id, {
                      selected: v,
                      address: v?.address ?? row.address,
                      lowConfidence: { ...row.lowConfidence, address: false },
                    })
                  }
                />
                {/* 붙여넣기로 채워졌으나 미확정인 주소 */}
                {!row.selected && row.address && (
                  <div className={`mt-1 flex items-center gap-1 rounded px-1.5 py-1 text-[11px] ${row.lowConfidence.address ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                    <span className="truncate">{row.address}</span>
                    {row.lowConfidence.address && <span className="whitespace-nowrap">· 주소 확인 필요</span>}
                  </div>
                )}

                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">{row.role === 'pickup' ? '준비시각' : '도착마감'}</span>
                    <input
                      type="time"
                      value={row.time}
                      onChange={(e) => updateRow(row.id, { time: e.target.value })}
                      className={`rounded-md border px-1.5 py-1 text-xs ${row.lowConfidence.time ? 'border-amber-400 bg-amber-50' : 'border-border bg-card'}`}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">체류(분)</span>
                    <input
                      type="number"
                      min={0}
                      value={row.dwellMinutes}
                      onChange={(e) => updateRow(row.id, { dwellMinutes: e.target.value })}
                      placeholder={String(DEFAULT_DWELL[row.role])}
                      className="rounded-md border border-border bg-card px-1.5 py-1 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">수량</span>
                    <input
                      type="number"
                      min={0}
                      value={row.quantity}
                      onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                      className="rounded-md border border-border bg-card px-1.5 py-1 text-xs"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ol>

          <button type="button" onClick={addRow} className="mt-2 w-full rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
            ＋ 지점 추가
          </button>

          {/* 옵션 */}
          <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">차종</span>
                <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as any)} className="rounded-md border border-border bg-card px-1.5 py-1 text-xs">
                  <option value="레이">레이</option>
                  <option value="스타렉스">스타렉스</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">출발 시각(선택)</span>
                <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className="rounded-md border border-border bg-card px-1.5 py-1 text-xs" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" checked={optimizeOrder} onChange={(e) => setOptimizeOrder(e.target.checked)} />
              경로 순서 자동 최적화 (끄면 입력 순서 유지)
            </label>
          </div>
        </div>

        {/* 하단 고정: 견적 실행 + 결과 요약 */}
        <div className="border-t border-border bg-card px-4 py-3">
          {violation && (
            <div className="mb-2 rounded-md border border-danger-300 bg-danger-50 p-2 text-[11px] text-danger-700">
              <p className="font-medium">이 순서·시각으로는 마감을 지킬 수 없어요</p>
              {violation.errors.slice(0, 2).map((e, i) => (<p key={i} className="mt-0.5">· {e}</p>))}
              {violation.suggestions.length > 0 && <p className="mt-1 text-danger-600">제안: {violation.suggestions.join(' / ')}</p>}
            </div>
          )}
          {calcError && <div className="mb-2 rounded-md border border-danger-300 bg-danger-50 p-2 text-[11px] text-danger-700">{calcError}</div>}

          {timelineRows.length > 0 && (
            <div className="mb-2 max-h-44 overflow-y-auto rounded-md border border-border bg-background p-2">
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">경로 타임라인</p>
              <ol className="space-y-1">
                {timelineRows.map((t, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-[11px]">
                    <span className={`rounded px-1 py-0.5 text-[10px] ${ROLE_TONE[t.role] ?? 'bg-muted text-muted-foreground'}`}>{ROLE_LABEL[t.role] ?? '경유'}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{t.address}</span>
                    <span className="tabular-nums text-muted-foreground">{t.arrival ?? '—'}</span>
                    {t.wait != null && t.wait > 0 && (
                      <span className="whitespace-nowrap rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700" title="조기배송 금지로 현장 대기 후 배송(구속시간 과금)">
                        대기 {t.wait}분
                      </span>
                    )}
                    {t.slack != null && (
                      <span className={`whitespace-nowrap rounded px-1 py-0.5 text-[10px] ${SLACK_TONE[t.tone]}`}>
                        {t.slack < 0 ? `${-t.slack}분 초과` : `여유 ${t.slack}분`}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {quote && (
            <div className="mb-2 rounded-md border border-border bg-background p-2.5 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">공식 견적 (시간당)</span>
                <span className="text-lg font-semibold text-foreground">{won(quote.totalPrice)}</span>
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>옹고잉 시간당 운임표 기준</span>
                <button type="button" onClick={() => setShowBreakdown((v) => !v)} className="underline-offset-2 hover:underline">
                  {showBreakdown ? '접기' : '상세'}
                </button>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {quote.distanceKm}km · 주행 {quote.driveMinutes}분 + 체류 {quote.dwellTotalMin}분 · 과금 {quote.billMinutes}분
              </div>
              {showBreakdown && (
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                  <p className="font-medium text-foreground">시간당 요금제</p>
                  <p>· {won(quote.hourlyBreakdown.hourlyRate)}/시간 × {(quote.hourlyBreakdown.billMinutes / 60).toFixed(1)}시간 = {won(quote.hourlyBreakdown.base)}</p>
                  <p>· 유류할증 {won(quote.hourlyBreakdown.fuelSurcharge)}</p>
                  <p className="mt-1 text-muted-foreground">단건 운임은 요청 시 견적 챗에서 참고값으로 확인할 수 있습니다.</p>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={runQuote}
            disabled={!canCalc || isLoading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {isLoading ? '계산 중…' : '견적 계산'}
          </button>
        </div>
      </aside>

      {/* 우측: 지도 */}
      <main className="relative flex-1">
        <TmapMap routeData={routeData} waypoints={waypoints} height="h-full" className="h-full w-full" />
      </main>
    </div>
  );
}

/** 'HH:mm' → 다음 도래 시각 ISO(KST 기준 근사, 로컬 시간대 사용). 서버가 예측 교통 앵커로 사용. */
function hhmmToNextIso(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** 경로 결과(있으면) 또는 확정 좌표 프리뷰로 지도 마커 배열을 만든다(단일 차량). */
function buildQuoteWaypoints(routeData: any, rows: StopRow[]) {
  const points: Array<{ lat: number; lng: number; label?: string; color?: string; address?: string; arrivalTime?: string; etaLabel?: string; riskColor?: string }> = [];
  const rwp: any[] = Array.isArray(routeData?.waypoints) ? routeData.waypoints : [];
  if (rwp.length) {
    rwp.forEach((wp: any, i: number) => {
      const isLast = i === rwp.length - 1;
      points.push({
        lat: wp.latitude,
        lng: wp.longitude,
        label: String(i + 1),
        color: isLast ? '#EF4444' : '#3B82F6',
        address: wp.address || '',
        arrivalTime: wp.arrivalTime,
        etaLabel: wp.arrivalTime ? formatHm(wp.arrivalTime) : undefined,
        riskColor: '#22C55E',
      });
    });
    return points;
  }
  // 계산 전 프리뷰: 확정 좌표가 있는 행만
  rows.forEach((r, i) => {
    if (r.selected?.latitude != null && r.selected?.longitude != null) {
      points.push({ lat: r.selected.latitude, lng: r.selected.longitude, label: String(i + 1), color: i === 0 ? '#10B981' : '#3B82F6', address: r.selected.address });
    }
  });
  return points;
}

function formatHm(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface TimelineRow {
  role: string;
  address: string;
  arrival?: string;
  wait?: number; // 조기배송 금지로 인한 현장 대기(분). 구속시간에 과금됨.
  slack: number | null; // 마감까지 남는 분(음수=초과)
  tone: string;
}

/** routeData.timeline(역할·도착) + waypoints(도착 마감)로 지점별 도착시각·마감 여유를 만든다. */
function buildTimeline(routeData: any): TimelineRow[] {
  const tl: any[] = Array.isArray(routeData?.timeline) ? routeData.timeline : [];
  if (!tl.length) return [];
  const wps: any[] = Array.isArray(routeData?.waypoints) ? routeData.waypoints : [];
  const dueByAddr = new Map<string, string>();
  for (const w of wps) {
    if (w?.address && w?.deliveryTime) dueByAddr.set(String(w.address), String(w.deliveryTime));
  }
  return tl.map((t) => {
    const address = String(t.address ?? '');
    const arrivalIso: string | undefined = t.arrivalTime;
    const arrival = formatHm(arrivalIso);
    const due = dueByAddr.get(address);
    let slack: number | null = null;
    let tone = '';
    if (due && arrivalIso) {
      const [dh, dm] = due.split(':').map(Number);
      const ad = new Date(arrivalIso);
      if (!Number.isNaN(ad.getTime()) && Number.isFinite(dh) && Number.isFinite(dm)) {
        slack = dh * 60 + dm - (ad.getHours() * 60 + ad.getMinutes());
        tone = slack < 0 ? 'late' : slack > 20 ? 'early' : slack >= 15 ? 'ideal' : 'tight';
      }
    }
    const wait = Number.isFinite(Number(t.waitMinutes)) ? Number(t.waitMinutes) : 0;
    return { role: String(t.role ?? 'waypoint'), address, arrival, wait, slack, tone };
  });
}
