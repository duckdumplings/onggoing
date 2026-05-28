import React from 'react';
import { cn } from '@/utils/cn';

/**
 * EmptyState — 빈 상태 / 결과 없음 표시
 *
 * 카피 톤: .cursor/rules/30-anti-slop-design.mdc §6
 * "데이터가 없습니다" 금지 → "최근 배차 이력이 없어요" 같은 도메인 명사 + 친절체
 *
 * 슬롭 방지: 이모지 사용 금지. 아이콘은 lucide-react를 props로 받음.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: {
    container: 'py-8 gap-2',
    iconWrap: 'h-10 w-10',
    title: 'text-sm font-medium',
    description: 'text-xs',
  },
  md: {
    container: 'py-12 gap-3',
    iconWrap: 'h-12 w-12',
    title: 'text-base font-semibold',
    description: 'text-sm',
  },
};

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, size = 'md', className, ...props }, ref) => {
    const styles = sizeClasses[size];
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center text-center',
          styles.container,
          className,
        )}
        role="status"
        {...props}
      >
        {icon && (
          <div className={cn('flex items-center justify-center rounded-full bg-muted text-muted-foreground', styles.iconWrap)}>
            {icon}
          </div>
        )}
        <div className="flex flex-col items-center gap-1">
          <h3 className={cn('text-foreground', styles.title)}>{title}</h3>
          {description && (
            <p className={cn('text-muted-foreground max-w-sm', styles.description)}>{description}</p>
          )}
        </div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  },
);

EmptyState.displayName = 'EmptyState';

export default EmptyState;
