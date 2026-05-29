import React from 'react';
import { cn } from '@/utils/cn';

/**
 * Tabs — 세그먼트 탭 (단일 선택, 콘텐츠 전환)
 *
 * 정체성 5축: 활기(active 전환) + 진중(채워진 pill 강조 절제)
 * 접근성: role="tablist" + role="tab" + aria-selected. 좌우 화살표 이동.
 *
 * RadioGroup과 구분: Tabs는 "보기/모드 전환"(차량 타입, 미리보기 순서),
 * RadioGroup은 "설정 값 선택"(도로 옵션, 종료 정책)에 사용.
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §1 (토큰)
 */
export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: TabItem<T>[];
  size?: 'sm' | 'md';
  'aria-label'?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'p-0.5 text-xs',
  md: 'p-1 text-sm',
};

const tabPadding = {
  sm: 'px-2.5 py-1',
  md: 'px-3 py-1.5',
};

function TabsInner<T extends string>(
  { value, onValueChange, items, size = 'md', className, ...props }: TabsProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const enabled = items.filter((i) => !i.disabled);
    const currentIdx = enabled.findIndex((i) => i.value === items[index].value);
    const next = enabled[(currentIdx + dir + enabled.length) % enabled.length];
    if (next) onValueChange(next.value);
  };

  return (
    <div
      ref={ref}
      role="tablist"
      className={cn('inline-flex rounded-lg bg-muted', sizeClasses[size], className)}
      {...props}
    >
      {items.map((item, idx) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={item.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md font-semibold',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              tabPadding[size],
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const Tabs = React.forwardRef(TabsInner) as <T extends string>(
  props: TabsProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement;

export default Tabs;
