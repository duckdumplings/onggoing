'use client';

import React, { useMemo, useState } from 'react';
import { Check, X, Map as MapIcon, ChevronDown, AlertTriangle, Clock, Layers } from 'lucide-react';
import type { CaseBoardResult, CaseBoardCaseResult, CaseSchematicPoint } from '@/domains/dispatch/services/caseBoard';

interface CaseBoardCardProps {
  board: CaseBoardResult;
  onPreviewRoute: (routeRequest: unknown) => void;
}

function won(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return `₩${Math.round(v).toLocaleString('ko-KR')}`;
}

const ROLE_DOT_CLASS: Record<string, string> = {
  pickup: 'text-primary',
  drop: 'text-success-600',
  return: 'text-warning',
  waypoint: 'text-muted-foreground',
};

const ROLE_LABEL: Record<string, string> = {
  pickup: '상차',
  drop: '배송',
  return: '반납',
  waypoint: '경유',
};

/** 케이스 경로의 격자 스키매틱 미니맵(Tmap 없이 좌표만 정규화해 한눈에 비교). */
function CaseSchematicMap({ points }: { points?: CaseSchematicPoint[] }) {
  const geom = useMemo(() => {
    const pts = (points ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (pts.length === 0) return null;
    const W = 132;
    const H = 84;
    const PAD = 10;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLat = maxLat - minLat || 1;
    const spanLng = maxLng - minLng || 1;
    const project = (p: CaseSchematicPoint) => ({
      x: pts.length === 1 ? W / 2 : PAD + ((p.lng - minLng) / spanLng) * (W - 2 * PAD),
      y: pts.length === 1 ? H / 2 : PAD + ((maxLat - p.lat) / spanLat) * (H - 2 * PAD),
      role: p.role,
    });
    return { W, H, nodes: pts.map(project) };
  }, [points]);

  if (!geom) {
    return (
      <div className="flex h-[84px] w-full items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
        경로 미리보기 없음
      </div>
    );
  }

  const path = geom.nodes.map((n, i) => `${i === 0 ? 'M' : 'L'}${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${geom.W} ${geom.H}`}
      className="h-[84px] w-full rounded-lg bg-muted"
      role="img"
      aria-label="경로 개략도"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-primary/40" strokeLinejoin="round" />
      {geom.nodes.map((n, i) => (
        <g key={i} className={ROLE_DOT_CLASS[n.role] ?? 'text-muted-foreground'}>
          <circle cx={n.x} cy={n.y} r={i === 0 ? 3.4 : 2.6} fill="currentColor" />
          {i === 0 && <circle cx={n.x} cy={n.y} r={5.2} fill="none" stroke="currentColor" strokeWidth={1} className="opacity-50" />}
        </g>
      ))}
    </svg>
  );
}

function DeadlineBadge({ c }: { c: CaseBoardCaseResult }) {
  if (!c.deadline) {
    return <span className="text-[11px] text-muted-foreground">마감 없음</span>;
  }
  const ok = c.meetsDeadline;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ok ? 'bg-success-muted text-success-600' : 'bg-error-muted text-error-600'
      }`}
    >
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      배송 {c.deliveryArrival ?? '-'} / 마감 {c.deadline}
    </span>
  );
}

function CaseTile({ c, onPreviewRoute }: { c: CaseBoardCaseResult; onPreviewRoute: (rr: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const planLabel = c.recommendedPlan === 'perJob' ? '단건' : '시간당';

  if (c.error) {
    return (
      <div className="rounded-xl border border-error/30 bg-error-muted/40 p-3">
        <div className="text-sm font-semibold text-foreground">{c.label}</div>
        <div className="mt-1 inline-flex items-start gap-1 text-xs text-error-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{c.error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <CaseSchematicMap points={c.schematic} />
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{c.label}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {c.departureLabel ? `출발 ${c.departureLabel}` : '출발 미지정'} · {c.vehicleType}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold tabular-nums text-foreground">{won(c.oneTimePrice)}</div>
          <div className="text-[10px] text-muted-foreground">{planLabel} · 1회</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <DeadlineBadge c={c} />
        {c.returnArrival && (
          <span className="text-[10px] text-muted-foreground">반납완료 {c.returnArrival}</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          상세
        </button>
        {Boolean(c.routeRequest) && (
          <button
            type="button"
            onClick={() => onPreviewRoute(c.routeRequest)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            title="이 경로를 지도에 표시만 합니다."
          >
            <MapIcon className="h-3 w-3" />
            지도에서 보기
          </button>
        )}
      </div>

      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" /> 소요
          </div>
          <div className="text-right tabular-nums text-foreground">
            주행 {c.driveMinutes ?? '-'}분 · 체류 {c.dwellMinutes ?? '-'}분
          </div>
          <div className="text-muted-foreground">총 거리</div>
          <div className="text-right tabular-nums text-foreground">{c.km != null ? `${c.km}km` : '-'}</div>
          <div className="text-muted-foreground">시간당</div>
          <div className="text-right tabular-nums text-foreground">{won(c.hourlyTotal)}</div>
          <div className="text-muted-foreground">단건</div>
          <div className="text-right tabular-nums text-foreground">{won(c.perJobTotal)}</div>
          {c.monthlyVisits != null && (
            <>
              <div className="text-muted-foreground">월 {c.monthlyVisits}회</div>
              <div className="text-right tabular-nums text-foreground">{won(c.monthlyTotal)}</div>
            </>
          )}
          {Boolean(c.lowPrecisionStops?.length) && (
            <div className="col-span-2 mt-1 inline-flex items-start gap-1 text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>구 단위 추정 주소 포함: {c.lowPrecisionStops!.join(', ')}</span>
            </div>
          )}
          {Boolean(c.timeline?.length) && (
            <div className="col-span-2 mt-1.5 border-t border-border pt-1.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                경유지 타임라인
              </div>
              <ol className="space-y-0.5">
                {c.timeline!.map((t) => (
                  <li key={t.seq} className="flex items-center gap-2">
                    <span className={`w-7 text-right tabular-nums ${ROLE_DOT_CLASS[t.role ?? 'waypoint']}`}>
                      {t.arrival ?? '-'}
                    </span>
                    <span
                      className={`rounded px-1 text-[9px] font-semibold ${ROLE_DOT_CLASS[t.role ?? 'waypoint']}`}
                    >
                      {ROLE_LABEL[t.role ?? 'waypoint']}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{t.address ?? '-'}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export default function CaseBoardCard({ board, onPreviewRoute }: CaseBoardCardProps) {
  const cases = board.cases ?? [];

  // group 키별로 묶되, 입력 순서를 보존한다.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, CaseBoardCaseResult[]>();
    for (const c of cases) {
      const key = c.group?.trim() || '기타';
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(c);
    }
    return order.map((key) => ({ key, items: map.get(key)! }));
  }, [cases]);

  if (!cases.length) return null;

  const r = board.rollup;
  const showGroupLabel = groups.length > 1 || (groups.length === 1 && groups[0].key !== '기타');

  return (
    <div className="glass-panel w-full p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Layers className="h-4 w-4 text-muted-foreground" />
          케이스 견적 보드
        </div>
        <span className="text-[11px] text-muted-foreground">{cases.length}개 케이스</span>
      </div>

      {/* 롤업 요약 */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RollupChip label="1회 합계" value={won(r.oneTimeTotal)} />
        <RollupChip label="월 합계" value={r.monthlyTotal != null ? won(r.monthlyTotal) : '미산정'} />
        <RollupChip
          label={r.contractMonths != null ? `계약 ${r.contractMonths}개월` : '계약 합계'}
          value={r.contractTotal != null ? won(r.contractTotal) : '미산정'}
        />
        <RollupChip label="연 합계" value={r.annualTotal != null ? won(r.annualTotal) : '미산정'} />
      </div>

      {r.infeasibleLabels.length > 0 && (
        <div className="mb-3 inline-flex items-start gap-1.5 rounded-lg bg-error-muted/50 px-2.5 py-1.5 text-[11px] text-error-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>마감 초과 케이스: {r.infeasibleLabels.join(', ')} — 출발을 앞당기거나 지점 분할 검토가 필요해요.</span>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.key}>
            {showGroupLabel && (
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.key}</div>
            )}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((c) => (
                <CaseTile key={c.id} c={c} onPreviewRoute={onPreviewRoute} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] leading-relaxed text-muted-foreground">{board.basis}</div>
    </div>
  );
}

function RollupChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
