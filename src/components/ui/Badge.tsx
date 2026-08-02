import React from 'react';
import { cn } from '@/utils/cn';

/**
 * Badge — 상태/카테고리 표시
 *
 * variant:
 * - default:     중립 (대기/일반)
 * - primary:     강조 (활성 상태)
 * - success:     완료/체결
 * - warning:     주의 (지연/검토 필요)
 * - error:       실패/반려
 * - info:        정보 (예: 시스템 안내)
 * - outline:     강조 없는 outline 표시 (필터 칩 등)
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §1 (토큰 우회 금지)
 */
export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-high text-surface-variant',
  primary: 'bg-primary-container text-primary-on-container',
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  error: 'bg-error-muted text-error',
  info: 'bg-info-muted text-info',
  outline: 'border border-outline-variant bg-surface-lowest text-foreground',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'sm', className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold tracking-[-0.01em]',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </span>
    );
  },
);

Badge.displayName = 'Badge';

export default Badge;
