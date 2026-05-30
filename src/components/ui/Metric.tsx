import React from 'react';
import { cn } from '@/utils/cn';

/**
 * Metric — 인라인 소형 수치 표기 (숫자 주인공 패턴)
 *
 * 정체성 5축: 표현(정밀). North Star §0 "단위(원/km/분) 정렬·축소 표시".
 * - 값은 `.tabular`(tabular-nums + slashed-zero) + 굵게 → 자릿수 정렬·가독성
 * - 단위는 한 단계 작은 크기 + muted → 숫자가 시각적 주인공
 * - 큰 KPI는 `SummaryCard`, 표/카드 내 인라인 수치는 본 컴포넌트.
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §6, north-star §0
 */
export interface MetricProps {
  value: string | number;
  unit?: string;
  /** sm: 표 셀 · md: 본문 · lg: 강조 행 */
  size?: 'sm' | 'md' | 'lg';
  /** 값 색상 등 추가 클래스(배송원 카테고리 색 등) */
  valueClassName?: string;
  className?: string;
}

const valueSize: Record<NonNullable<MetricProps['size']>, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl',
};

const unitSize: Record<NonNullable<MetricProps['size']>, string> = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
};

export default function Metric({ value, unit, size = 'md', valueClassName, className }: MetricProps) {
  return (
    <span className={cn('inline-flex items-baseline gap-0.5', className)}>
      <span className={cn('tabular font-semibold leading-none', valueSize[size], valueClassName)}>
        {value}
      </span>
      {unit && (
        <span className={cn('font-medium text-muted-foreground leading-none', unitSize[size])}>
          {unit}
        </span>
      )}
    </span>
  );
}
