'use client';

import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, animate, useDragControls, type PanInfo } from 'framer-motion';
import { cn } from '@/utils/cn';

export type BottomSheetSnap = 'peek' | 'full';

export interface BottomSheetProps {
  children: React.ReactNode;
  /** 접힌 상태에서 화면에 보이는 높이(px) */
  peekHeight?: number;
  /** 펼친 상태의 시트 높이(viewport 높이 대비 %) */
  fullHeightVh?: number;
  initialSnap?: BottomSheetSnap;
  className?: string;
  'aria-label'?: string;
}

/**
 * BottomSheet — 모바일 전용 드래그 가능 하단 시트
 *
 * 지도를 가리지 않고 제어판을 띄우는 모바일 패턴. 핸들/오버레이로 peek와 full을
 * 전환하며, 본문 스크롤과 시트 드래그가 충돌하지 않도록 드래그는 핸들에서만
 * 시작된다(useDragControls). md 이상에서는 렌더되지 않는다.
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §1(토큰)
 */
export default function BottomSheet({
  children,
  peekHeight = 104,
  fullHeightVh = 88,
  initialSnap = 'peek',
  className,
  'aria-label': ariaLabel = '제어판',
}: BottomSheetProps) {
  const [snap, setSnap] = useState<BottomSheetSnap>(initialSnap);
  const [viewportHeight, setViewportHeight] = useState(0);
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  const sheetHeight = viewportHeight ? viewportHeight * (fullHeightVh / 100) : 0;
  const collapsedY = Math.max(sheetHeight - peekHeight, 0);

  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!sheetHeight) return;
    const target = snap === 'full' ? 0 : collapsedY;
    const controls = animate(y, target, { type: 'spring', stiffness: 420, damping: 42 });
    return controls.stop;
  }, [snap, sheetHeight, collapsedY, y]);

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    if (velocity.y > 480 || offset.y > sheetHeight * 0.22) {
      setSnap('peek');
    } else if (velocity.y < -480 || offset.y < -sheetHeight * 0.1) {
      setSnap('full');
    } else {
      setSnap(y.get() > collapsedY / 2 ? 'peek' : 'full');
    }
  };

  return (
    <>
      {snap === 'full' && (
        <motion.div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setSnap('peek')}
          aria-hidden="true"
        />
      )}
      <motion.div
        role="dialog"
        aria-label={ariaLabel}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 md:hidden flex flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl',
          className,
        )}
        style={{ height: sheetHeight || undefined, y }}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: collapsedY }}
        dragElastic={0.04}
        onDragEnd={handleDragEnd}
      >
        <button
          type="button"
          onPointerDown={(e) => dragControls.start(e)}
          onClick={() => setSnap((s) => (s === 'full' ? 'peek' : 'full'))}
          className="flex-shrink-0 flex w-full touch-none cursor-grab justify-center pt-3 pb-2 active:cursor-grabbing focus-visible:outline-none"
          aria-label={snap === 'full' ? '제어판 접기' : '제어판 펼치기'}
          aria-expanded={snap === 'full'}
        >
          <span className="h-1.5 w-10 rounded-full bg-border" />
        </button>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </motion.div>
    </>
  );
}
