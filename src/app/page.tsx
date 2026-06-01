'use client';

import TmapMainMap from '@/components/map/TmapMainMap';
import RouteOptimizerPanel from '@/components/panels/RouteOptimizerPanel';
import AIQuoteLauncher from '@/components/panels/AIQuoteLauncher';
import AIQuoteChatModal from '@/components/modals/AIQuoteChatModal';
import BottomSheet from '@/components/ui/BottomSheet';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Compass } from 'lucide-react';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

export default function Home() {
  const [isAiQuoteModalOpen, setIsAiQuoteModalOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const { quoteFromRouteRequest } = useRouteOptimization();

  // "이 경로로 견적" 요청이 오면 챗(도크/모달)을 자동으로 연다.
  const lastQuoteOpenNonce = useRef(0);
  useEffect(() => {
    if (quoteFromRouteRequest && quoteFromRouteRequest.nonce !== lastQuoteOpenNonce.current) {
      lastQuoteOpenNonce.current = quoteFromRouteRequest.nonce;
      setIsAiQuoteModalOpen(true);
    }
  }, [quoteFromRouteRequest?.nonce]);

  // 데스크톱에서 챗을 열면 우측 인라인 도크로 표시하고, 좌측 입력 패널은 접어 지도 공간을 확보한다.
  const docked = isDesktop && isAiQuoteModalOpen;

  return (
    <div className="h-screen bg-background flex overflow-hidden font-sans">
      {/* 좌측 패널 (도크가 열리면 접힘) */}
      <motion.aside
        initial={{ x: -16, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className={`${docked ? 'hidden' : 'hidden md:flex'} flex-col z-30 w-[28rem] bg-card border-r border-border shadow-xl`}
      >
        <header className="px-6 py-5 flex-shrink-0 border-b border-border">
          <div className="flex items-center gap-3 select-none group cursor-default">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground shadow-lg">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-1">
                <span className="text-primary">옹라우팅</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold tracking-wide border border-primary/20">BETA</span>
              </h1>
            </div>
          </div>
        </header>

        {/* 통합 기능 패널 - 스크롤 영역 */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-2">
          <RouteOptimizerPanel />

          {/* 섹션 구분선 */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4 mx-4"></div>

          <AIQuoteLauncher onOpen={() => setIsAiQuoteModalOpen(true)} />
        </div>

      </motion.aside>

      {/* 우측 지도 - 모바일에서는 전체 화면, 데스크톱에서는 잔여 영역 */}
      <main className="relative flex-1 h-full bg-muted min-w-0">
        <TmapMainMap />
      </main>

      {/* 데스크톱: 우측 인라인 도킹 패널 (챗) */}
      {docked && (
        <motion.aside
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="hidden lg:flex h-full w-[720px] xl:w-[860px] flex-shrink-0 border-l border-border bg-card shadow-xl z-30"
        >
          <AIQuoteChatModal docked isOpen={isAiQuoteModalOpen} onClose={() => setIsAiQuoteModalOpen(false)} />
        </motion.aside>
      )}

      {/* 모바일 하단 시트 — 지도를 가리지 않고 제어판을 띄운다 */}
      <BottomSheet aria-label="경로·견적 제어판">
        <div className="space-y-3 pt-1">
          <AIQuoteLauncher onOpen={() => setIsAiQuoteModalOpen(true)} />
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <RouteOptimizerPanel />
        </div>
      </BottomSheet>

      {/* 모바일/태블릿: 오버레이 모달 (데스크톱 도크가 아닐 때만) */}
      {!docked && (
        <AIQuoteChatModal isOpen={isAiQuoteModalOpen} onClose={() => setIsAiQuoteModalOpen(false)} />
      )}
    </div>
  );
}
