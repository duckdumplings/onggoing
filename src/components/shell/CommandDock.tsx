'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Calculator, ChevronDown, ChevronUp, Map, Route, Sparkles } from 'lucide-react';
import RouteOptimizerPanel from '@/components/panels/RouteOptimizerPanel';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';
import { buildRouteQuotePrompt } from '@/domains/dispatch/utils/routeQuotePrompt';

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="tabular text-sm font-black leading-none text-foreground">
        {value}
        <span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}

interface CommandDockProps {
  /** 자연어 입력만 하고 경로 시트를 토글한다. 자유 입력은 챗으로 전송된다. */
  onOpenChat: () => void;
  /** 우측 챗 슬라이드오버가 열려 있으면 독을 좌측으로 밀어 가시 영역 중앙에 둔다. */
  chatOpen?: boolean;
}

const QUICK_CHIPS = [
  '마포 3곳에서 픽업해 강남 1곳으로, 스타렉스로 견적 비교해줘',
  '매주 화·목 정기배송 월 견적 뽑아줘',
  '오전 9시 출발 기준 도착시간과 톨비 알려줘',
];

/**
 * 컨셉 A 셸의 하단 중앙 커맨드 독.
 * - idle: 자연어 입력 + 빠른 예시 칩 (탭 → 챗으로 즉시 전송)
 * - route: '경로 입력' 토글 시 위로 펼쳐지는 시트에 RouteOptimizerPanel(dock variant) 호스팅
 * 결과 KPI는 지도 오버레이가 담당하므로 독은 입력에만 집중한다.
 */
export default function CommandDock({ onOpenChat, chatOpen = false }: CommandDockProps) {
  const { sendChatPrompt, routeData, destinations, origins, vehicleType, routeDetailOpen, setRouteDetailOpen } =
    useRouteOptimization();
  const [prompt, setPrompt] = useState('');
  const [routeOpen, setRouteOpen] = useState(false);

  const summary = routeData?.summary as
    | { totalDistance?: number; totalTime?: number; roadComparisons?: Array<{ estimatedToll?: number; isSelected?: boolean }> }
    | undefined;
  const hasResult = !!summary && Number.isFinite(summary.totalDistance);
  const km = hasResult ? ((summary!.totalDistance as number) / 1000).toFixed(1) : '0';
  const min = hasResult ? Math.ceil((summary!.totalTime as number) / 60) : 0;
  const selectedToll = summary?.roadComparisons?.find((r) => r.isSelected)?.estimatedToll;
  const stops = destinations?.length ?? 0;

  const submitPrompt = () => {
    const text = prompt.trim();
    if (!text) {
      onOpenChat();
      return;
    }
    sendChatPrompt(text);
    setPrompt('');
  };

  const quoteFromResult = () => {
    sendChatPrompt(
      buildRouteQuotePrompt({
        vehicleType,
        originAddress: (origins as { address?: string } | undefined)?.address,
        destinationAddresses: (destinations || []).map((d) => (d as { address?: string }).address),
        totalDistanceMeters: summary?.totalDistance ?? null,
        totalTimeSeconds: summary?.totalTime ?? null,
      }),
    );
  };

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5 transition-[padding] duration-300 ${
        chatOpen ? 'lg:pr-[480px]' : ''
      }`}
    >
      <div className="pointer-events-auto w-full max-w-[680px]">
        {/* 경로 입력 시트 — 위로 펼침 */}
        {routeOpen && (
          <div className="mb-3 max-h-[62vh] overflow-y-auto custom-scrollbar rounded-3xl glass-canvas p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Map className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-foreground">경로 최적화</span>
              </div>
              <button
                type="button"
                onClick={() => setRouteOpen(false)}
                className="focus-ring-inset flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="경로 입력 닫기"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <RouteOptimizerPanel variant="dock" />
          </div>
        )}

        {/* 메인 독 */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
          className="rounded-3xl glass-canvas p-2 shadow-2xl"
        >
          {/* 결과 KPI 스트립 — 경로 계산 후 표시 */}
          <AnimatePresence initial={false}>
            {hasResult && (
              <motion.div
                key="kpi-strip"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
                className="overflow-hidden"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-muted/70 px-3.5 py-2.5">
                  <Metric label="거리" value={km} unit="km" />
                  <span className="h-3.5 w-px bg-border" />
                  <Metric label="시간" value={String(min)} unit="분" />
                  {Number.isFinite(selectedToll) && (
                    <>
                      <span className="h-3.5 w-px bg-border" />
                      <Metric label="톨" value={(selectedToll as number).toLocaleString()} unit="원" />
                    </>
                  )}
                  <span className="h-3.5 w-px bg-border" />
                  <Metric label="경유" value={String(stops)} unit="곳" />

                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRouteDetailOpen(!routeDetailOpen)}
                      className="focus-ring-inset inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                    >
                      {routeDetailOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                      상세
                    </button>
                    <button
                      type="button"
                      onClick={quoteFromResult}
                      className="focus-ring-inset inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.98]"
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      이 경로로 견적
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRouteOpen((v) => !v)}
              className={`focus-ring-inset inline-flex flex-none items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                routeOpen
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-secondary'
              }`}
            >
              <Route className="h-4 w-4" />
              <span className="hidden sm:inline">경로 입력</span>
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
              <Sparkles className="h-4 w-4 flex-none text-primary/70" />
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submitPrompt();
                  }
                }}
                placeholder="어디서 어디로 보낼까요? 자연어로 물어보세요"
                className="focus-ring-inset min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <button
              type="button"
              onClick={submitPrompt}
              className="focus-ring-inset flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/90 active:scale-95"
              aria-label="견적챗으로 전송"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>

          {/* 빠른 예시 칩 */}
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-0.5 custom-scrollbar">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => sendChatPrompt(chip)}
                className="focus-ring-inset flex-none rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                {chip}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
