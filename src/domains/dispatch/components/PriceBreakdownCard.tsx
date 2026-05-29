'use client';

import React from 'react';
import type { ScenarioQuoteResult } from '@/domains/dispatch/types/routePlan';
import { buildPriceBreakdownRows } from '@/domains/dispatch/services/scenarioInsights';

interface PriceBreakdownCardProps {
  result: ScenarioQuoteResult;
}

const won = (v: number) => `₩${Math.round(v).toLocaleString('ko-KR')}`;

/**
 * 운임 분해 워터폴. "왜 이 금액인지"를 요율 근거와 함께 보여준다.
 * 합계 행(1회/연 운임)은 막대 길이를 기준값(=합계)으로 정규화한다.
 */
export default function PriceBreakdownCard({ result }: PriceBreakdownCardProps) {
  const rows = buildPriceBreakdownRows(result);
  const oneTime = result.oneTimePrice || 1;

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        운임 산정 근거
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const widthPct = Math.min(100, Math.max(4, (row.amount / oneTime) * 100));
          const isAnnual = row.key === 'annual';
          return (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={
                    row.isTotal
                      ? 'text-sm font-semibold text-foreground'
                      : 'text-sm text-foreground/80'
                  }
                >
                  {row.isTotal ? '' : '+ '}
                  {row.label}
                </span>
                <span
                  className={
                    row.isTotal
                      ? 'text-sm font-bold text-foreground tabular-nums'
                      : 'text-sm text-foreground/80 tabular-nums'
                  }
                >
                  {won(row.amount)}
                </span>
              </div>
              {!isAnnual && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={row.isTotal ? 'h-full bg-primary' : 'h-full bg-primary/40'}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              )}
              {row.hint && (
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{row.hint}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
