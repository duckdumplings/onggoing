import React from 'react';
import { cn } from '@/utils/cn';

/**
 * RadioGroup — 단일 선택 옵션 그룹
 *
 * 두 가지 레이아웃:
 * - segmented: 한 줄 세그먼트 컨트롤 (도로 옵션 등)
 * - cards: 아이콘 + 라벨 카드 그리드 (종료 정책 등)
 *
 * 접근성: role="radiogroup" + 각 옵션 role="radio" + aria-checked.
 * 키보드: 좌우 화살표로 이동.
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §1 (토큰), §4 (아이콘은 lucide)
 * 인라인 button 그룹 직접 작성 금지 — 본 컴포넌트 사용.
 */
export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: RadioOption<T>[];
  variant?: 'segmented' | 'cards';
  columns?: number;
  'aria-label'?: string;
  className?: string;
}

function RadioGroupInner<T extends string>(
  { value, onValueChange, options, variant = 'segmented', columns, className, ...props }: RadioGroupProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const enabled = options.filter((o) => !o.disabled);
    const currentIdx = enabled.findIndex((o) => o.value === options[index].value);
    const next = enabled[(currentIdx + dir + enabled.length) % enabled.length];
    if (next) onValueChange(next.value);
  };

  if (variant === 'segmented') {
    return (
      <div
        ref={ref}
        role="radiogroup"
        className={cn('flex rounded-lg border border-border bg-card p-1', className)}
        {...props}
      >
        {options.map((opt, idx) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={opt.disabled}
              title={opt.description}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(opt.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5',
                'text-xs font-medium transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                selected
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      className={cn('grid gap-2', className)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      {...props}
    >
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5',
              'transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
                : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/20',
            )}
          >
            {opt.icon && <span className="flex h-4 w-4 items-center justify-center">{opt.icon}</span>}
            <span className="text-xs font-semibold">{opt.label}</span>
            {opt.description && (
              <span className="text-[10px] font-normal leading-tight text-muted-foreground">{opt.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const RadioGroup = React.forwardRef(RadioGroupInner) as <T extends string>(
  props: RadioGroupProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement;

export default RadioGroup;
