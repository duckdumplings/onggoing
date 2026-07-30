'use client';

import React, { useMemo, useState } from 'react';
import { Check, X, Map as MapIcon, ChevronDown, AlertTriangle, Clock } from 'lucide-react';
import CaseRouteSchematic from '@/domains/dispatch/components/CaseRouteSchematic';
import QuoteBookOverview from '@/domains/dispatch/components/QuoteBookOverview';
import type { CaseBoardResult, CaseBoardCaseResult } from '@/domains/dispatch/services/caseBoard';
import { formatStopOperations, formatStopSchedule } from '@/domains/dispatch/services/stopSemantics';

interface CaseBoardCardProps {
  board: CaseBoardResult;
  onPreviewRoute: (routeRequest: unknown) => void;
}

function won(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return `₩${Math.round(v).toLocaleString('ko-KR')}`;
}

/** 조회 시각 ISO → KST "MM/DD HH:mm". */
function formatQueriedAt(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const k = new Date(t + 9 * 3600 * 1000);
  const mm = String(k.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(k.getUTCDate()).padStart(2, '0');
  const hh = String(k.getUTCHours()).padStart(2, '0');
  const mi = String(k.getUTCMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
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

type RiskGrade = NonNullable<CaseBoardCaseResult['riskGrade']>;

const RISK_STYLE: Record<RiskGrade, { label: string; cls: string }> = {
  safe: { label: '안정', cls: 'bg-success-muted text-success-600' },
  caution: { label: '주의', cls: 'bg-warning-muted text-warning' },
  danger: { label: '위험', cls: 'bg-warning-muted text-warning' },
  recheck: { label: '구조 재검토', cls: 'bg-error-muted text-error-600' },
  infeasible: { label: '마감 초과', cls: 'bg-error-muted text-error-600' },
  none: { label: '마감 없음', cls: 'bg-muted text-muted-foreground' },
};

function slackLabel(min?: number | null): string {
  if (min == null || !Number.isFinite(min)) return '';
  if (min < 0) return `${Math.abs(min)}분 초과`;
  return `여유 ${min}분`;
}

function DeadlineBadge({ c }: { c: CaseBoardCaseResult }) {
  if (!c.deadline && c.riskGrade !== 'infeasible') {
    return <span className="text-[11px] text-muted-foreground">마감 없음</span>;
  }
  const grade: RiskGrade = c.riskGrade ?? (c.meetsDeadline ? 'safe' : 'infeasible');
  const style = RISK_STYLE[grade];
  const ok = grade !== 'infeasible' && grade !== 'recheck';
  const deadlineLabel = c.deadline ?? '배송시각 제약';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.cls}`}
      title={`마감 ${deadlineLabel} / 마지막 배송 ${c.deliveryArrival ?? '-'} · ${slackLabel(c.deadlineSlackMinutes)}`}
    >
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {style.label} · 배송 {c.deliveryArrival ?? '-'}/마감 {deadlineLabel}
      {c.deadlineSlackMinutes != null && <span className="font-normal opacity-80">({slackLabel(c.deadlineSlackMinutes)})</span>}
    </span>
  );
}

function CaseTile({ c, onPreviewRoute }: { c: CaseBoardCaseResult; onPreviewRoute: (rr: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const planLabel = '시간당';

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
      <CaseRouteSchematic points={c.schematic} polyline={c.routeGeometry} />
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{c.label}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {c.departureWasSuggested && c.pickupStartLabel
              ? `권장 상차 ${c.pickupStartLabel} · 출발 ${c.departureLabel ?? '-'}`
              : c.departureLabel
                ? `출발 ${c.departureLabel}`
                : '출발 미지정'} · {c.vehicleType}
            {c.operatingWeekdaysLabel ? ` · ${c.operatingWeekdaysLabel}` : ''}
          </div>
          {c.departureWasSuggested && (
            <div className="mt-0.5 text-[10px] text-primary">
              배송 마감에서 안전여유 {c.departureSafetyMinutes ?? 15}분을 두고 역산했어요.
            </div>
          )}
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
        {Boolean(c.predictionFallbackSegments && c.predictionFallbackSegments > 0) && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-warning-muted px-2 py-0.5 text-[10px] font-medium text-warning"
            title="이 케이스 일부 구간은 출발시각 예측 대신 호출 시점 교통으로 계산됐어요. 정체를 덜 반영했을 수 있어 소요시간이 실제보다 짧게 나올 수 있어요."
          >
            <AlertTriangle className="h-3 w-3" />
            교통 예측 일부 미반영 {c.predictionFallbackSegments}/{c.predictionAttemptedSegments ?? '?'}
          </span>
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

      {/* 타임라인은 신뢰의 근거 — '상세' 펼침과 무관하게 항상 노출한다(요청 반영). */}
      {Boolean(c.timeline?.length) && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            경유지 타임라인
          </div>
          <ol className="space-y-0.5 text-[11px]">
            {c.timeline!.map((t) => {
              const operationLabel = t.operations?.length
                ? formatStopOperations(t.operations)
                : ROLE_LABEL[t.role ?? 'waypoint'];
              const scheduleLabel = formatStopSchedule(t.schedule);
              return (
                <li key={t.seq} className="flex items-center gap-2">
                  <span className={`w-9 text-right tabular-nums ${ROLE_DOT_CLASS[t.role ?? 'waypoint']}`}>
                    {t.arrival ?? '-'}
                  </span>
                  <span className={`rounded px-1 text-[9px] font-semibold ${ROLE_DOT_CLASS[t.role ?? 'waypoint']}`}>
                    {operationLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{t.address ?? '-'}</span>
                  {scheduleLabel && (
                    <span className="hidden whitespace-nowrap text-[9px] text-muted-foreground sm:inline">
                      {scheduleLabel}
                    </span>
                  )}
                  {t.waitMinutes != null && t.waitMinutes > 0 && (
                    <span
                      className="whitespace-nowrap rounded bg-warning-muted px-1 text-[9px] font-medium text-warning"
                      title="조기배송 금지로 현장 대기 후 배송(구속시간에 과금)"
                    >
                      대기 {t.waitMinutes}분
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" /> 소요
          </div>
          <div className="text-right tabular-nums text-foreground">
            주행 {c.driveMinutes ?? '-'}분 · 체류 {c.dwellMinutes ?? '-'}분
            {c.waitMinutes != null && c.waitMinutes > 0 ? ` · 대기 ${c.waitMinutes}분` : ''}
          </div>
          <div className="text-muted-foreground">총 거리</div>
          <div className="text-right tabular-nums text-foreground">{c.km != null ? `${c.km}km` : '-'}</div>
          {c.billMinutes != null && c.ratePerHour != null && (
            <>
              <div className="text-muted-foreground">시간당 산식</div>
              <div className="text-right tabular-nums text-foreground">
                과금 {c.billMinutes}분 × {c.ratePerHour.toLocaleString('ko-KR')}원/h
                {c.fuelSurcharge ? ` + 유류 ${c.fuelSurcharge.toLocaleString('ko-KR')}` : ''}
              </div>
              {c.fuelSurchargeBreakdown && (
                <>
                  <div className="text-muted-foreground">유류할증 기준</div>
                  <div className="text-right tabular-nums text-foreground">
                    기본 {c.fuelSurchargeBreakdown.includedDistanceKm.toFixed(1)}km
                    {c.fuelSurchargeBreakdown.excessDistanceKm > 0
                      ? ` · 초과 ${c.fuelSurchargeBreakdown.excessDistanceKm.toFixed(1)}km · ${c.fuelSurchargeBreakdown.stepKm}km ${c.fuelSurchargeBreakdown.chargedBins}구간`
                      : ' 이내'}
                  </div>
                </>
              )}
            </>
          )}
          {c.riskReason && (
            <>
              <div className="text-muted-foreground">리스크 사유</div>
              <div className="text-right text-foreground">{c.riskReason}</div>
            </>
          )}
          {c.recommendedAction && (
            <>
              <div className="text-muted-foreground">권장 대응</div>
              <div className="text-right text-foreground">{c.recommendedAction}</div>
            </>
          )}
          <div className="text-muted-foreground">시간당</div>
          <div className="text-right tabular-nums text-foreground">{won(c.hourlyTotal)}</div>
          {c.includePerJobReference && (
            <>
              <div className="text-muted-foreground">단건 참고</div>
              <div className="text-right tabular-nums text-foreground">
                {c.perJobTotal == null ? '운임표 범위 밖' : won(c.perJobTotal)}
              </div>
            </>
          )}
          {c.monthBasisLabel && (
            <>
              <div className="text-muted-foreground">월 기준</div>
              <div className="text-right tabular-nums text-foreground">{c.monthBasisLabel}</div>
            </>
          )}
          {c.monthlyVisits != null && (
            <>
              <div className="text-muted-foreground">월 {c.monthlyVisits}회 합계</div>
              <div className="text-right tabular-nums text-foreground">{won(c.monthlyTotal)}</div>
            </>
          )}
          {(c.predictionAttemptedSegments != null || c.queriedAt) && (
            <>
              <div className="text-muted-foreground">Tmap 증빙</div>
              <div className="text-right tabular-nums text-foreground">
                예측 {Math.max(0, (c.predictionAttemptedSegments ?? 0) - (c.predictionFallbackSegments ?? 0))}/
                {c.predictionAttemptedSegments ?? 0} 구간
                {c.queriedAt ? ` · 조회 ${formatQueriedAt(c.queriedAt)}` : ''}
              </div>
            </>
          )}
          {Boolean(c.lowPrecisionStops?.length) && (
            <div className="col-span-2 mt-1 inline-flex items-start gap-1 text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>구 단위 추정 주소 포함: {c.lowPrecisionStops!.join(', ')}</span>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export default function CaseBoardCard({ board, onPreviewRoute }: CaseBoardCardProps) {
  const cases = useMemo(() => board.cases ?? [], [board.cases]);
  const [selectedCaseId, setSelectedCaseId] = useState(() => cases[0]?.id ?? '');

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
  const quotePackage = board.quotePackage;
  const selectedCase = cases.find((result) => result.id === selectedCaseId) ?? cases[0];
  const showGroupLabel = groups.length > 1 || (groups.length === 1 && groups[0].key !== '기타');

  return (
    <div className="glass-panel w-full p-4">
      <QuoteBookOverview
        board={board}
        selectedCase={selectedCase}
        onSelect={setSelectedCaseId}
        onPreviewRoute={onPreviewRoute}
      />

      {Array.isArray(r.contractBreakdown) && r.contractBreakdown.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">월별 영업일 반영</span>
          {r.contractBreakdown.map((m) => (
            <span key={m.month} className="tabular-nums">
              {m.month} {won(m.total)}
            </span>
          ))}
        </div>
      )}

      {quotePackage?.operatingBasis?.length ? (
        <div className="mb-3 rounded-lg border border-border bg-card px-2.5 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            월 운영 기준
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {quotePackage.operatingBasis.map((basis) => (
              <span key={`${basis.weekdaysLabel ?? 'basis'}-${basis.monthlyVisits ?? 'n'}`} className="rounded-md bg-muted px-2 py-1">
                {basis.weekdaysLabel ?? '운영일'} · 월 {basis.monthlyVisits ?? '-'}회
                {basis.includeHolidays === true ? ' · 공휴일 포함' : basis.includeHolidays === false ? ' · 공휴일 제외' : ''}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {quotePackage?.groupRollups?.length ? (
        <div className="mb-3 overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border bg-muted px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground">
            <span>권역</span>
            <span className="text-right">월 견적</span>
            <span className="text-right">상태</span>
          </div>
          {quotePackage.groupRollups.map((g) => (
            <div key={g.group} className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border px-2.5 py-1.5 text-[11px] last:border-b-0">
              <span className="truncate font-medium text-foreground">{g.group}</span>
              <span className="text-right tabular-nums text-foreground">
                {g.monthlyTotal == null ? '미산정' : won(g.monthlyTotal)}
              </span>
              <span className="text-right text-muted-foreground">{g.riskLabel}</span>
            </div>
          ))}
        </div>
      ) : null}

      {r.infeasibleLabels.length > 0 && (
        <div className="mb-3 inline-flex items-start gap-1.5 rounded-lg bg-error-muted/50 px-2.5 py-1.5 text-[11px] text-error-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>마감 초과 케이스: {r.infeasibleLabels.join(', ')} — 출발을 앞당기거나 지점 분할 검토가 필요해요.</span>
        </div>
      )}

      {quotePackage?.risks?.length ? (
        <div className="mb-3 space-y-1.5 rounded-lg border border-warning/30 bg-warning-muted/30 px-2.5 py-2">
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            확인 필요한 라인
          </div>
          {quotePackage.risks.map((risk) => (
            <div key={risk.caseId} className="text-[11px] leading-relaxed text-foreground">
              <span className="font-semibold">{risk.label}</span>
              <span className="text-muted-foreground"> · {risk.labelText} · {risk.reason} {risk.recommendedAction}</span>
            </div>
          ))}
        </div>
      ) : null}

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
