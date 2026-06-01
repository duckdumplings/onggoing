'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Compass, Sparkles } from 'lucide-react';

interface TopBarProps {
  onOpenChat: () => void;
  chatOpen?: boolean;
}

/**
 * 컨셉 A 셸의 떠 있는 미니 탑바.
 * 지도 위에 얹혀 브랜드(좌)와 핵심 액션(우)만 노출한다. 패널이 아니라 오버레이라
 * pointer-events는 실제 컨트롤에만 부여해 지도 조작을 가리지 않는다.
 */
export default function TopBar({ onOpenChat, chatOpen = false }: TopBarProps) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between px-4 py-3 md:px-5 md:py-4">
      {/* 브랜드 */}
      <motion.div
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
        className="pointer-events-auto flex items-center gap-2.5 rounded-2xl glass-launcher px-3 py-2 shadow-sm"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Compass className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-1.5 leading-none">
          <span className="text-[15px] font-black tracking-tight text-foreground">옹라우팅</span>
          <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary">
            BETA
          </span>
        </div>
      </motion.div>

      {/* 액션 — 챗이 열려 있으면 슬라이드오버가 덮으므로 숨긴다 */}
      {!chatOpen && (
        <motion.button
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: 0.05 }}
          type="button"
          onClick={onOpenChat}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-2xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4" />
          AI 견적챗
        </motion.button>
      )}
    </header>
  );
}
