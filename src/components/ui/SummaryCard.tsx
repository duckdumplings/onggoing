import React from 'react';
import { cn } from '@/utils/cn';

/**
 * SummaryCard — 대시보드 KPI 카드
 *
 * 정체성 5축: 표현(정밀) + 톤(진중)
 * - 큰 숫자가 주인공: text-3xl + .tabular (tabular-nums slashed-zero)
 * - 단위(원/건/%/km/분)는 별도 폰트 weight로 시각적 분리
 * - 트렌드는 옵션. 의미 없는 trend 표시는 슬롭 (예: 항상 ↑ 아이콘)
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §6, north-star §0
 */
export type Trend = {
  direction: 'up' | 'down' | 'flat';
  label: string; // e.g. "지난 달 대비 +12%"
};

export interface SummaryCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  trend?: Trend;
  icon?: React.ReactNode;
  loading?: boolean;
}

const trendStyles: Record<Trend['direction'], string> = {
  up: 'text-success',
  down: 'text-error',
  flat: 'text-muted-foreground',
};

const SummaryCard = React.forwardRef<HTMLDivElement, SummaryCardProps>(
  ({ label, value, unit, hint, trend, icon, loading, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'surface-base p-5 flex flex-col gap-3',
          'transition-colors hover:border-foreground/10',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>

        {loading ? (
          <div className="h-9 w-24 animate-pulse rounded bg-muted" aria-hidden="true" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="tabular text-3xl font-semibold text-foreground">{value}</span>
            {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
          </div>
        )}

        {(trend || hint) && (
          <div className="flex items-center justify-between gap-2 text-xs">
            {trend && (
              <span className={cn('font-medium', trendStyles[trend.direction])}>
                {trend.label}
              </span>
            )}
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </div>
        )}
      </div>
    );
  },
);

SummaryCard.displayName = 'SummaryCard';

export default SummaryCard;
