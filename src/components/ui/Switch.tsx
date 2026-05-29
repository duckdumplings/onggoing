import React from 'react';
import { cn } from '@/utils/cn';

/**
 * Switch — on/off 토글
 *
 * 정체성 5축: 활기(마이크로 인터랙션) + 진중(timing 절제 200ms)
 * 접근성: role="switch" + aria-checked. label 클릭으로도 토글 가능.
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §1 (토큰), north-star §0
 * 인라인 `peer sr-only` 패턴 직접 작성 금지 — 본 컴포넌트 사용.
 */
export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  className?: string;
}

const trackSize = {
  sm: 'h-4 w-7',
  md: 'h-5 w-9',
};

const thumbSize = {
  sm: 'h-3 w-3 data-[state=checked]:translate-x-3',
  md: 'h-4 w-4 data-[state=checked]:translate-x-4',
};

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled = false, id, size = 'md', className, ...props }, ref) => {
    const state = checked ? 'checked' : 'unchecked';
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        data-state={state}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex flex-none cursor-pointer items-center rounded-full',
          'transition-colors duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
          trackSize[size],
          className,
        )}
        {...props}
      >
        <span
          data-state={state}
          className={cn(
            'pointer-events-none ml-0.5 inline-block transform rounded-full bg-white shadow-sm',
            'transition-transform duration-200 ease-out',
            thumbSize[size],
          )}
        />
      </button>
    );
  },
);

Switch.displayName = 'Switch';

export default Switch;
