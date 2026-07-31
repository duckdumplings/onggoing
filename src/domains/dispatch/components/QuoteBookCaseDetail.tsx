'use client';

import React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  ExternalLink,
  Map as MapIcon,
  Route,
} from 'lucide-react';
import CaseRouteSchematic from '@/domains/dispatch/components/CaseRouteSchematic';
import type {
  CaseBoardCaseResult,
  DeadlineRiskGrade,
} from '@/domains/dispatch/services/caseBoard';
import {
  getQuoteBookStatus,
  getQuoteBookStatusLabel,
} from '@/domains/dispatch/services/quoteBookPresentation';
import {
  formatStopOperations,
  formatStopSchedule,
} from '@/domains/dispatch/services/stopSemantics';
import type { RoutePreviewHandler } from '@/domains/dispatch/types/routePreview';

interface QuoteBookCaseDetailProps {
  result: CaseBoardCaseResult;
  onPreviewRoute: RoutePreviewHandler;
}

const ROLE_LABEL: Record<string, string> = {
  pickup: '상차',
  drop: '배송',
  return: '반납',
  waypoint: '경유',
};

const ROLE_STYLE: Record<string, string> = {
  pickup: 'border-primary/30 bg-primary/5 text-primary',
  drop: 'border-success/30 bg-success-muted text-success-600',
  return: 'border-warning/30 bg-warning-muted text-warning',
  waypoint: 'border-border bg-muted text-muted-foreground',
};

const STATUS_STYLE = {
  complete: 'bg-success-muted text-success-600',
  attention: 'bg-warning-muted text-warning',
  blocked: 'bg-error-muted text-error-600',
};

const RISK_LABEL: Record<DeadlineRiskGrade, string> = {
  safe: '마감 안정',
  caution: '마감 주의',
  danger: '마감 여유 부족',
  recheck: '일정 재검토',
  infeasible: '마감 초과',
  none: '마감 없음',
};

function won(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '미산정';
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

function formatQueriedAt(iso?: string): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '';
  const kst = new Date(parsed + 9 * 3600 * 1000);
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hour = String(kst.getUTCHours()).padStart(2, '0');
  const minute = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

function slackLabel(minutes?: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '여유 미산정';
  if (minutes < 0) return `${Math.abs(minutes)}분 초과`;
  return `여유 ${minutes}분`;
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="min-w-0 border-b border-r border-border px-3 py-2.5">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-bold tabular-nums text-foreground" title={value}>
        {value}
      </div>
      {helper && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{helper}</div>}
    </div>
  );
}

export default function QuoteBookCaseDetail({
  result,
  onPreviewRoute,
}: QuoteBookCaseDetailProps) {
  const status = getQuoteBookStatus(result);
  const riskGrade = result.riskGrade ?? 'none';
  const predictionSuccess = Math.max(
    0,
    (result.predictionAttemptedSegments ?? 0) -
      (result.predictionFallbackSegments ?? 0),
  );

  if (result.error) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-error/30 bg-error-muted/30 px-6 text-center">
        <AlertTriangle className="h-6 w-6 text-error-600" />
        <h3 className="mt-2 text-sm font-bold text-foreground">{result.label}</h3>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-error-600">{result.error}</p>
        <p className="mt-3 text-[11px] text-muted-foreground">
          주소나 시각 조건을 수정한 뒤 이 라인만 다시 계산해 주세요.
        </p>
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-foreground">{result.label}</h3>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-semibold ${STATUS_STYLE[status]}`}
            >
              {getQuoteBookStatusLabel(result)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{result.vehicleType}</span>
            {result.operatingWeekdaysLabel && <span>{result.operatingWeekdaysLabel}</span>}
            <span>{RISK_LABEL[riskGrade]}</span>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xl font-bold tabular-nums text-foreground">
            {won(result.oneTimePrice)}
          </div>
          <div className="text-[10px] text-muted-foreground">시간당 운임 · 1회</div>
        </div>
      </header>

      <div className="grid grid-cols-2 border-b border-border [&>*:nth-child(even)]:border-r-0 [&>*:nth-child(n+3)]:border-b-0">
        <Metric
          label={result.departureWasSuggested ? '권장 상차' : '출발'}
          value={
            result.departureWasSuggested
              ? result.pickupStartLabel ?? '미지정'
              : result.departureLabel ?? '미지정'
          }
          helper={
            result.departureWasSuggested && result.departureLabel
              ? `출발 ${result.departureLabel}`
              : undefined
          }
        />
        <Metric
          label="배송 완료"
          value={result.deliveryArrival ?? '미산정'}
          helper={result.deadline ? `마감 ${result.deadline}` : '마감 없음'}
        />
        <Metric
          label="마감 여유"
          value={slackLabel(result.deadlineSlackMinutes)}
          helper={RISK_LABEL[riskGrade]}
        />
        <Metric
          label="운행"
          value={result.km != null ? `${result.km}km` : '미산정'}
          helper={result.driveMinutes != null ? `주행 ${result.driveMinutes}분` : undefined}
        />
      </div>

      <div className="grid 2xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="min-w-0 border-b border-border p-3 2xl:border-b-0 2xl:border-r">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-foreground">경로 개요</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                번호는 실제 운행 순서예요.
              </div>
            </div>
            {Boolean(result.routeRequest) && (
              <button
                type="button"
                onClick={() =>
                  onPreviewRoute(result.routeRequest, {
                    closeOnSuccess: false,
                    silent: true,
                  })
                }
                className="focus-ring-inset inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
              >
                <MapIcon className="h-3.5 w-3.5" />
                지도에 반영
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
          <CaseRouteSchematic
            points={result.schematic}
            polyline={result.routeGeometry}
            className="h-[190px] sm:h-[220px]"
          />

          {(result.riskReason || result.recommendedAction) && (
            <div
              className={`mt-3 rounded-lg px-3 py-2.5 ${
                status === 'blocked'
                  ? 'bg-error-muted/50'
                  : status === 'attention'
                    ? 'bg-warning-muted/50'
                    : 'bg-success-muted/50'
              }`}
            >
              {result.riskReason && (
                <p className="text-[11px] font-medium leading-relaxed text-foreground">
                  {result.riskReason}
                </p>
              )}
              {result.recommendedAction && (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  권장 대응 · {result.recommendedAction}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 p-3">
          <div className="mb-2">
            <div className="text-xs font-bold text-foreground">경유지 타임라인</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              도착부터 작업 완료까지 확인할 수 있어요.
            </div>
          </div>
          {result.timeline?.length ? (
            <ol className="space-y-1" aria-label={`${result.label} 경유지 타임라인`}>
              {result.timeline.map((entry, index) => {
                const role = entry.role ?? 'waypoint';
                const operationLabel = entry.operations?.length
                  ? formatStopOperations(entry.operations)
                  : ROLE_LABEL[role];
                const scheduleLabel = formatStopSchedule(entry.schedule);
                return (
                  <li
                    key={`${entry.seq}-${entry.address ?? index}`}
                    className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 rounded-lg px-1.5 py-2 transition hover:bg-muted/70"
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums ${ROLE_STYLE[role]}`}
                    >
                      {entry.seq || index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-foreground">
                          {operationLabel}
                        </span>
                        {scheduleLabel && (
                          <span className="text-[9px] text-muted-foreground">{scheduleLabel}</span>
                        )}
                      </span>
                      <span
                        className="mt-0.5 block truncate text-[11px] text-muted-foreground"
                        title={entry.address ?? undefined}
                      >
                        {entry.address ?? '주소 미확인'}
                      </span>
                      {entry.waitMinutes != null && entry.waitMinutes > 0 && (
                        <span className="mt-1 inline-flex rounded bg-warning-muted px-1.5 py-0.5 text-[9px] font-medium text-warning">
                          현장 대기 {entry.waitMinutes}분
                        </span>
                      )}
                    </span>
                    <span className="pt-0.5 text-right text-[10px] tabular-nums text-foreground">
                      <span className="block font-semibold">{entry.arrival ?? '-'}</span>
                      <span className="block text-muted-foreground">
                        → {entry.departure ?? entry.arrival ?? '-'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-lg bg-muted text-[11px] text-muted-foreground">
              경유지 타임라인을 계산하지 못했어요.
            </div>
          )}
        </div>
      </div>

      <details className="group border-t border-border">
        <summary className="focus-ring-inset flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold text-foreground transition hover:bg-muted/60">
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            운임·계산 근거
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <dl className="grid grid-cols-1 gap-x-5 gap-y-2 border-t border-border bg-muted/30 px-4 py-3 text-[11px] sm:grid-cols-2">
          <CalculationRow
            label="총 소요"
            value={`주행 ${result.driveMinutes ?? '-'}분 · 체류 ${result.dwellMinutes ?? '-'}분${
              result.waitMinutes ? ` · 대기 ${result.waitMinutes}분` : ''
            }`}
          />
          <CalculationRow
            label="시간당 산식"
            value={
              result.billMinutes != null && result.ratePerHour != null
                ? `과금 ${result.billMinutes}분 × ${result.ratePerHour.toLocaleString('ko-KR')}원/h`
                : '산식 미확인'
            }
          />
          <CalculationRow
            label="유류할증"
            value={
              result.fuelSurchargeBreakdown
                ? `${won(result.fuelSurcharge)} · 기본 ${result.fuelSurchargeBreakdown.includedDistanceKm.toFixed(1)}km / 초과 ${result.fuelSurchargeBreakdown.excessDistanceKm.toFixed(1)}km`
                : won(result.fuelSurcharge)
            }
          />
          <CalculationRow label="시간당 합계" value={won(result.hourlyTotal)} />
          {result.includePerJobReference && (
            <CalculationRow label="단건 참고" value={won(result.perJobTotal)} />
          )}
          {result.monthBasisLabel && (
            <CalculationRow label="월 기준" value={result.monthBasisLabel} />
          )}
          {result.monthlyVisits != null && (
            <CalculationRow
              label={`월 ${result.monthlyVisits}회 합계`}
              value={won(result.monthlyTotal)}
            />
          )}
          {(result.predictionAttemptedSegments != null || result.queriedAt) && (
            <CalculationRow
              label="경로 증빙"
              value={`교통 예측 ${predictionSuccess}/${result.predictionAttemptedSegments ?? 0}구간${
                result.queriedAt ? ` · 조회 ${formatQueriedAt(result.queriedAt)}` : ''
              }`}
            />
          )}
          {Boolean(result.lowPrecisionStops?.length) && (
            <div className="inline-flex items-start gap-1.5 text-warning sm:col-span-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>주소 정밀도 확인 필요: {result.lowPrecisionStops!.join(', ')}</span>
            </div>
          )}
        </dl>
      </details>
    </article>
  );
}

function CalculationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 last:border-b-0">
      <dt className="flex items-center gap-1 text-muted-foreground">
        {label === '총 소요' && <Route className="h-3 w-3" />}
        {label}
      </dt>
      <dd className="max-w-[68%] text-right tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
