import React from 'react';
import { cn } from '@/utils/cn';

/**
 * Skeleton — 로딩 placeholder
 *
 * shimmer 그라디언트는 정체성 5축의 '활기'에 해당 (정적 X, 마이크로 인터랙션).
 * .cursor/rules/30-anti-slop-design.mdc §5 그라디언트 allowlist에 등록됨.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'rect' | 'text' | 'circle';
  width?: string | number;
  height?: string | number;
}

const variantClasses: Record<NonNullable<SkeletonProps['variant']>, string> = {
  rect: 'rounded-md',
  text: 'rounded h-4',
  circle: 'rounded-full',
};

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ variant = 'rect', width, height, className, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'animate-pulse bg-muted',
          variantClasses[variant],
          className,
        )}
        style={{ width, height, ...style }}
        aria-hidden="true"
        {...props}
      />
    );
  },
);

Skeleton.displayName = 'Skeleton';

export default Skeleton;
