'use client';

import TmapMainMap from '@/components/map/TmapMainMap';
import RouteOptimizerPanel from '@/components/panels/RouteOptimizerPanel';
import AIQuoteLauncher from '@/components/panels/AIQuoteLauncher';
import AIQuoteChatModal from '@/components/modals/AIQuoteChatModal';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const [isAiQuoteModalOpen, setIsAiQuoteModalOpen] = useState(false);

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden font-sans">
      {/* 좌측 패널 */}
      <motion.aside
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="hidden md:flex flex-col z-30 w-[28rem] bg-white/80 backdrop-blur-2xl border-r border-white/50 shadow-2xl shadow-indigo-500/5"
      >
        <header className="px-6 py-5 flex-shrink-0 border-b border-slate-100/50 bg-white/40 backdrop-blur-sm">
          <div className="flex items-center gap-3 select-none group cursor-default">
            <motion.div
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 text-white"
            >
              <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="text-xl filter drop-shadow-md">🧭</span>
            </motion.div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-1">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 animate-gradient-x">옹라우팅</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 font-bold tracking-wide border border-indigo-100">BETA</span>
              </h1>
            </div>
          </div>
        </header>

        {/* 통합 기능 패널 - 스크롤 영역 */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-2">
          <RouteOptimizerPanel />

          {/* 섹션 구분선 */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-4 mx-4"></div>

          <AIQuoteLauncher onOpen={() => setIsAiQuoteModalOpen(true)} />
        </div>

      </motion.aside>

      {/* 모바일 상단 패널 */}
      <div className="md:hidden w-full p-4 space-y-3 bg-slate-50">
        <RouteOptimizerPanel />
        <AIQuoteLauncher onOpen={() => setIsAiQuoteModalOpen(true)} />

      </div>

      {/* 우측 지도 - 전체 화면 차지 */}
      <main className="relative flex-1 h-full bg-slate-100">
        <TmapMainMap />
      </main>

      <AIQuoteChatModal isOpen={isAiQuoteModalOpen} onClose={() => setIsAiQuoteModalOpen(false)} />
    </div>
  );
}
