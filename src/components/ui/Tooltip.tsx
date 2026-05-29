import React, { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

/**
 * Tooltip — hover/focus 보조 설명
 *
 * 정체성 5축: 정밀(짧은 보조 정보) + 진중(절제된 등장 150ms)
 * 접근성: trigger에 aria-describedby 연결. focus로도 표시.
 * 포털로 body에 렌더링 → 패널 overflow 클리핑 회피.
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §1 (토큰)
 */
export interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
  className?: string;
}

const OFFSET = 8;

const Tooltip: React.FC<TooltipProps> = ({ content, side = 'top', children, className }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const positions: Record<string, { top: number; left: number }> = {
      top: { top: r.top - OFFSET, left: r.left + r.width / 2 },
      bottom: { top: r.bottom + OFFSET, left: r.left + r.width / 2 },
      left: { top: r.top + r.height / 2, left: r.left - OFFSET },
      right: { top: r.top + r.height / 2, left: r.right + OFFSET },
    };
    setCoords(positions[side]);
  }, [side]);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => setOpen(false), []);

  const transforms: Record<string, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  };

  const trigger = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const { ref } = children as unknown as { ref?: React.Ref<HTMLElement> };
      if (typeof ref === 'function') ref(node);
      else if (ref && 'current' in ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
    },
    'aria-describedby': open ? tooltipId : undefined,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  });

  return (
    <>
      {trigger}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{ top: coords.top, left: coords.left, transform: transforms[side] }}
            className={cn(
              'pointer-events-none fixed z-[100] max-w-xs rounded-md px-2.5 py-1.5',
              'bg-foreground text-xs font-medium text-background shadow-md',
              'animate-tooltip-in',
              className,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
};

export default Tooltip;
