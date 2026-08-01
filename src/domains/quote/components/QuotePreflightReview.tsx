'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import type {
  QuotePreflightCase,
  QuotePreflightDraft,
} from '@/domains/quote/types/quotePreflight';

interface QuotePreflightReviewProps {
  sourceText: string;
  draft: QuotePreflightDraft | null;
  loading: boolean;
  error: string | null;
  onChange: (draft: QuotePreflightDraft) => void;
  onRetry: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const ROLE_LABEL = {
  pickup: '상차·수거',
  drop: '배송·하차',
  return: '반납',
  waypoint: '경유',
} as const;

const SCHEDULE_LABEL = {
  ready: '물품 준비',
  'service-start': '작업 시작',
  departure: '차량 출발',
  'arrival-deadline': '도착 마감',
  'completion-deadline': '완료 마감',
  appointment: '예약 시각',
} as const;

type Stop = QuotePreflightCase['stops'][number];

function updateCase(
  draft: QuotePreflightDraft,
  caseIndex: number,
  patch: Partial<QuotePreflightCase>,
): QuotePreflightDraft {
  return {
    ...draft,
    cases: draft.cases.map((item, index) =>
      index === caseIndex ? { ...item, ...patch } : item,
    ),
  };
}

function updateStop(
  draft: QuotePreflightDraft,
  caseIndex: number,
  stopIndex: number,
  patch: Partial<Stop>,
): QuotePreflightDraft {
  const target = draft.cases[caseIndex];
  return updateCase(draft, caseIndex, {
    stops: target.stops.map((stop, index) =>
      index === stopIndex ? { ...stop, ...patch } : stop,
    ),
  });
}

function ConfidenceBadge({ value }: { value: QuotePreflightDraft['confidence'] }) {
  const label = value === 'high' ? '해석 신뢰 높음' : value === 'medium' ? '일부 확인 필요' : '확인 필요';
  const tone =
    value === 'high'
      ? 'bg-success-muted text-success-600'
      : value === 'medium'
        ? 'bg-warning-muted text-warning'
        : 'bg-error-muted text-error-600';
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export default function QuotePreflightReview({
  sourceText,
  draft,
  loading,
  error,
  onChange,
  onRetry,
  onCancel,
  onConfirm,
}: QuotePreflightReviewProps) {
  const blockingReason = useMemo(() => {
    if (!draft) return null;
    for (const item of draft.cases) {
      if (item.stops.length < 2) return '각 라인에는 상차와 배송 등 최소 2개 지점이 필요합니다.';
      for (const stop of item.stops) {
        if (!stop.address.trim()) return '비어 있는 주소를 입력해 주세요.';
        if (stop.schedule && !/^\d{1,2}:\d{2}$/.test(stop.schedule.time)) {
          return '시각은 24시간제 HH:mm 형식으로 입력해 주세요.';
        }
      }
    }
    return null;
  }, [draft]);

  return (
    <section className="flex-shrink-0 border-t border-border bg-muted/30" aria-label="계산 전 입력 확인">
      <div className="mx-auto max-h-[58vh] max-w-5xl overflow-y-auto px-4 py-4 md:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">계산 전 입력 확인</h3>
              {draft && <ConfidenceBadge value={draft.confidence} />}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              라인·작업·시각 의미가 맞는지 확인하세요. 확정 후에만 경로와 운임을 계산합니다.
            </p>
          </div>
          <div className="max-w-full truncate rounded-md border border-border bg-card px-2.5 py-1.5 text-[10px] text-muted-foreground sm:max-w-[42%]" title={sourceText}>
            원문 · {sourceText}
          </div>
        </div>

        {loading && (
          <div className="mt-4 flex min-h-36 flex-col items-center justify-center rounded-xl border border-border bg-card text-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="mt-2 text-xs font-semibold text-foreground">주소와 시각 의미를 분리하고 있습니다</p>
            <p className="mt-1 text-[10px] text-muted-foreground">거리와 금액은 아직 계산하지 않습니다.</p>
          </div>
        )}

        {error && !loading && (
          <div className="mt-4 rounded-xl border border-error/30 bg-error-muted/40 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-error-600" />
              <div>
                <p className="text-xs font-semibold text-foreground">입력 해석을 완료하지 못했습니다</p>
                <p className="mt-1 text-[11px] leading-relaxed text-error-600">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="focus-ring-inset mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              다시 해석
            </button>
          </div>
        )}

        {draft && !loading && (
          <div className="mt-4 space-y-3">
            {(draft.reviewReasons.length > 0 ||
              draft.cases.some((item) => item.openQuestions.length > 0)) && (
              <div className="rounded-lg border border-warning/25 bg-warning-muted/50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  특히 확인할 항목
                </div>
                <ul className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-foreground">
                  {[...draft.reviewReasons, ...draft.cases.flatMap((item) => item.openQuestions)]
                    .filter(Boolean)
                    .map((reason, index) => (
                      <li key={`${reason}-${index}`}>· {reason}</li>
                    ))}
                </ul>
              </div>
            )}

            {draft.cases.map((item, caseIndex) => (
              <article key={`${item.label}-${caseIndex}`} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="grid gap-2 border-b border-border p-3 md:grid-cols-[minmax(180px,1fr)_130px_130px]">
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold text-muted-foreground">라인명</span>
                    <input
                      value={item.label}
                      onChange={(event) =>
                        onChange(updateCase(draft, caseIndex, { label: event.target.value }))
                      }
                      className="focus-ring-inset min-h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground outline-none"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold text-muted-foreground">차종</span>
                    <select
                      value={item.vehicleType}
                      onChange={(event) =>
                        onChange(updateCase(draft, caseIndex, {
                          vehicleType: event.target.value as QuotePreflightCase['vehicleType'],
                        }))
                      }
                      className="focus-ring-inset min-h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground outline-none"
                    >
                      <option value="레이">레이</option>
                      <option value="스타렉스">스타렉스</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold text-muted-foreground">운행 형태</span>
                    <select
                      value={item.scheduleType}
                      onChange={(event) =>
                        onChange(updateCase(draft, caseIndex, {
                          scheduleType: event.target.value as QuotePreflightCase['scheduleType'],
                        }))
                      }
                      className="focus-ring-inset min-h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground outline-none"
                    >
                      <option value="regular">정기</option>
                      <option value="ad-hoc">비정기</option>
                    </select>
                  </label>
                </div>

                <div className="divide-y divide-border">
                  {item.stops.map((stop, stopIndex) => (
                    <div
                      key={`${stop.address}-${stopIndex}`}
                      className="grid gap-2 p-3 md:grid-cols-[42px_118px_minmax(210px,1fr)_76px_128px_94px]"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold tabular-nums text-foreground">
                        {stopIndex + 1}
                      </div>
                      <label>
                        <span className="sr-only">작업 유형</span>
                        <select
                          value={stop.role}
                          onChange={(event) =>
                            onChange(updateStop(draft, caseIndex, stopIndex, {
                              role: event.target.value as Stop['role'],
                              operations: undefined,
                            }))
                          }
                          className="focus-ring-inset min-h-9 w-full rounded-lg border border-border bg-card px-2 text-[11px] font-semibold text-foreground outline-none"
                        >
                          {Object.entries(ROLE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        {stop.operations && stop.operations.length > 1 && (
                          <span className="mt-1 block text-[9px] font-medium leading-tight text-primary">
                            복합 · {stop.operations.map((operation) => ROLE_LABEL[operation.type]).join(' + ')}
                          </span>
                        )}
                      </label>
                      <label className="relative">
                        <MapPin className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <span className="sr-only">주소</span>
                        <input
                          value={stop.address}
                          onChange={(event) =>
                            onChange(updateStop(draft, caseIndex, stopIndex, {
                              address: event.target.value,
                            }))
                          }
                          className="focus-ring-inset min-h-9 w-full rounded-lg border border-border bg-card pl-8 pr-2.5 text-[11px] text-foreground outline-none"
                        />
                      </label>
                      <label className="relative">
                        <span className="sr-only">수량</span>
                        <input
                          type="number"
                          min={0}
                          value={stop.quantity ?? ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            onChange(updateStop(draft, caseIndex, stopIndex, {
                              quantity: value === '' ? undefined : Number(value),
                            }));
                          }}
                          placeholder="수량"
                          className="focus-ring-inset min-h-9 w-full rounded-lg border border-border bg-card px-2 pr-6 text-[11px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
                        />
                        <span className="pointer-events-none absolute right-2 top-2.5 text-[10px] text-muted-foreground">개</span>
                      </label>
                      <label className="relative">
                        <Clock3 className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <span className="sr-only">시각 의미</span>
                        <select
                          value={stop.schedule?.type ?? ''}
                          onChange={(event) => {
                            const type = event.target.value as NonNullable<Stop['schedule']>['type'] | '';
                            onChange(updateStop(draft, caseIndex, stopIndex, {
                              schedule: type
                                ? { type, time: stop.schedule?.time ?? '' }
                                : undefined,
                            }));
                          }}
                          className="focus-ring-inset min-h-9 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-[10px] text-foreground outline-none"
                        >
                          <option value="">시각 없음</option>
                          {Object.entries(SCHEDULE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="sr-only">시각</span>
                        <input
                          type="time"
                          disabled={!stop.schedule}
                          value={stop.schedule?.time ?? ''}
                          onChange={(event) =>
                            stop.schedule &&
                            onChange(updateStop(draft, caseIndex, stopIndex, {
                              schedule: { ...stop.schedule, time: event.target.value },
                            }))
                          }
                          className="focus-ring-inset min-h-9 w-full rounded-lg border border-border bg-card px-2 text-[11px] tabular-nums text-foreground outline-none disabled:bg-muted disabled:text-muted-foreground"
                        />
                      </label>
                    </div>
                  ))}
                </div>

                {item.assumptions.length > 0 && (
                  <div className="border-t border-border bg-muted/40 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                    가정 · {item.assumptions.join(' · ')}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring-inset inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          입력으로 돌아가기
        </button>
        <div className="flex min-w-0 items-center justify-end gap-3">
          {blockingReason && (
            <span className="hidden truncate text-[10px] text-error-600 sm:block" title={blockingReason}>
              {blockingReason}
            </span>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={!draft || loading || Boolean(error) || Boolean(blockingReason)}
            className="focus-ring-inset inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            이 조건으로 계산
          </button>
        </div>
      </div>
    </section>
  );
}
