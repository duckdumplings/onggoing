'use client';

import TmapMainMap from '@/components/map/TmapMainMap';
import RouteOptimizerPanel from '@/components/panels/RouteOptimizerPanel';
import AIQuoteLauncher from '@/components/panels/AIQuoteLauncher';
import AIQuoteChatModal from '@/components/modals/AIQuoteChatModal';
import BottomSheet from '@/components/ui/BottomSheet';
import TopBar from '@/components/shell/TopBar';
import CommandDock from '@/components/shell/CommandDock';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

/**
 * 컨셉 A — "Map Canvas + Floating Command Dock"
 * 지도를 풀블리드 히어로로 두고, 입력(커맨드 독)·브랜드(탑바)·AI 챗(우측 슬라이드오버)을
 * 지도 위 오버레이로 띄운다. 챗은 지도를 밀지 않고 덮어 지도 캔버스를 항상 유지한다.
 */
export default function Home() {
  const [isAiQuoteModalOpen, setIsAiQuoteModalOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const { chatPromptRequest } = useRouteOptimization();

  const openChat = useCallback(() => setIsAiQuoteModalOpen(true), []);
  const closeChat = useCallback(() => setIsAiQuoteModalOpen(false), []);

  // 지도 CTA / 커맨드 독 입력이 챗 프롬프트를 보내면 챗을 자동으로 연다.
  const lastPromptNonce = useRef(0);
  useEffect(() => {
    if (chatPromptRequest && chatPromptRequest.nonce !== lastPromptNonce.current) {
      lastPromptNonce.current = chatPromptRequest.nonce;
      setIsAiQuoteModalOpen(true);
    }
  }, [chatPromptRequest?.nonce]);

  // 데스크톱(lg+)에서는 우측 슬라이드오버, 그 외에는 전체 모달.
  const docked = isDesktop && isAiQuoteModalOpen;

  return (
    <div className="relative h-screen overflow-hidden bg-muted font-sans">
      {/* 풀블리드 지도 캔버스 */}
      <main className="absolute inset-0">
        <TmapMainMap />
      </main>

      {/* 지도 가장자리 스크림 — 떠 있는 UI의 가독성과 깊이를 위해 (지도 조작은 가리지 않음) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-background/55 via-background/15 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40 bg-gradient-to-t from-background/55 via-background/15 to-transparent" />

      {/* 떠 있는 탑바 (브랜드 + AI 견적챗) */}
      <TopBar onOpenChat={openChat} chatOpen={docked} />

      {/* 하단 중앙 커맨드 독 (태블릿/데스크톱) */}
      <div className="hidden md:block">
        <CommandDock onOpenChat={openChat} chatOpen={docked} />
      </div>

      {/* 데스크톱 우측 챗 슬라이드오버 — 지도를 덮는 오버레이 */}
      {isDesktop && (
        <AnimatePresence>
          {isAiQuoteModalOpen && (
            <motion.aside
              key="chat-slideover"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
              className="absolute right-0 top-0 z-50 h-full w-full border-l border-border bg-card shadow-2xl sm:w-[440px] lg:w-[460px]"
            >
              <AIQuoteChatModal docked compact isOpen onClose={closeChat} />
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* 모바일 하단 시트 — 지도를 가리지 않고 제어판을 띄운다 */}
      <div className="md:hidden">
        <BottomSheet aria-label="경로·견적 제어판">
          <div className="space-y-3 pt-1">
            <AIQuoteLauncher onOpen={openChat} />
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            <RouteOptimizerPanel />
          </div>
        </BottomSheet>
      </div>

      {/* 모바일/태블릿: 오버레이 모달 (데스크톱 슬라이드오버가 아닐 때만) */}
      {!docked && (
        <AIQuoteChatModal isOpen={isAiQuoteModalOpen} onClose={closeChat} />
      )}
    </div>
  );
}
