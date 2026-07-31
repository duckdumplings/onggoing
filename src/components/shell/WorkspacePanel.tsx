'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, MapPin, MessageSquare, Truck, X, Maximize2, Minimize2, Lock } from 'lucide-react';
import AIQuoteChatModal from '@/components/modals/AIQuoteChatModal';
import MultiDriverResultsPanel from '@/components/panels/MultiDriverResultsPanel';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

interface WorkspacePanelProps {
  /** 데스크톱: 우측 슬라이드오버 / 모바일: 전체 화면 */
  isDesktop: boolean;
}

/**
 * 우측 워크스페이스 — 대화/배차 결과를 하나의 탭 패널로 통합한다.
 * 지도 위에 떠 있던 여러 우측 패널(채팅 슬라이드오버 + 다중배송 상세)을 한 표면으로 흡수해
 * 동시에 보이는 큰 표면 수를 줄인다.
 */
export default function WorkspacePanel({ isDesktop }: WorkspacePanelProps) {
  const { workspaceOpen, workspaceTab, setWorkspaceTab, closeWorkspace, multiDriverResult, routeData, setRouteSlotEl, quoteSummary } =
    useRouteOptimization();
  // 정보 밀도가 높은 화면(케이스 보드/비교표)에서 패널을 넓게 펼친다. 데스크톱 전용.
  const [expanded, setExpanded] = React.useState(false);

  const hasResult = !!(multiDriverResult && multiDriverResult.success);
  const hasRoute = !!routeData?.summary;
  const hasQuote = !!quoteSummary?.hasQuote;
  // 사용할 수 없는 탭이 active면 대화 탭으로 폴백한다.
  const activeTab =
    (workspaceTab === 'result' && !hasResult) ||
    (workspaceTab === 'route' && !hasRoute) ||
    (workspaceTab === 'quote' && !hasQuote)
      ? 'chat'
      : workspaceTab;

  const panel = (
    <div className="flex h-full w-full flex-col bg-card">
      {/* 헤더는 항상 렌더해 닫기(X)를 상시 노출한다(탭이 없을 때 닫기 불가 갭 방지). */}
      <div className="flex flex-none items-center gap-1 bg-card/95 px-2.5 pt-2 backdrop-blur-sm">
        {/* 4개 탭을 항상 노출한다. 데이터가 없는 탭은 잠금 상태(비활성+힌트)로 보여
            "이런 능력이 있다"를 미리 알린다(발견성). 잠금 탭은 클릭해도 전환되지 않는다. */}
        <div role="tablist" aria-label="워크스페이스 탭" className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
          <TabButton
            label="대화"
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            active={activeTab === 'chat'}
            compact={!isDesktop}
            onClick={() => setWorkspaceTab('chat')}
          />
          <TabButton
            label="견적"
            icon={<Calculator className="h-3.5 w-3.5" />}
            active={activeTab === 'quote'}
            locked={!hasQuote}
            compact={!isDesktop}
            lockHint="AI 견적챗에서 견적을 받으면 열려요"
            onClick={() => setWorkspaceTab('quote')}
          />
          <TabButton
            label="경로"
            icon={<MapPin className="h-3.5 w-3.5" />}
            active={activeTab === 'route'}
            locked={!hasRoute}
            compact={!isDesktop}
            lockHint="경로를 계산하면 열려요"
            onClick={() => setWorkspaceTab('route')}
          />
          <TabButton
            label="배차 결과"
            compactLabel="배차"
            icon={<Truck className="h-3.5 w-3.5" />}
            active={activeTab === 'result'}
            locked={!hasResult}
            compact={!isDesktop}
            lockHint="다중 배송원 배차를 실행하면 열려요"
            onClick={() => setWorkspaceTab('result')}
          />
        </div>
        {isDesktop && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="focus-ring-inset ml-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={expanded ? '패널 좁히기' : '패널 넓히기'}
            aria-pressed={expanded}
            title={expanded ? '패널 좁히기' : '패널 넓히기'}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={closeWorkspace}
          className={`focus-ring-inset mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground ${isDesktop ? '' : 'ml-auto'}`}
          aria-label="워크스페이스 닫기"
          title="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* 대화/견적 탭 — AIQuoteChatModal은 항상 마운트해 상태를 보존하고, 내부에서 대화/견적 뷰를 전환한다. */}
        <div className={activeTab === 'chat' || activeTab === 'quote' ? 'h-full' : 'hidden'}>
          <AIQuoteChatModal docked compact isOpen onClose={closeWorkspace} />
        </div>

        {/* 경로 탭 — 본문은 TmapMainMap이 portal로 주입(아래 div가 slot) */}
        {hasRoute && (
          <div
            ref={setRouteSlotEl}
            className={activeTab === 'route' ? 'h-full border-t border-border' : 'hidden'}
          />
        )}

        {/* 배차 결과 탭 */}
        {hasResult && (
          <div className={activeTab === 'result' ? 'flex h-full flex-col' : 'hidden'}>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-muted/40 border-t border-border">
              <MultiDriverResultsPanel result={multiDriverResult} />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <AnimatePresence>
        {workspaceOpen && (
          <motion.aside
            key="workspace"
            initial={{ opacity: 0, scale: 0.96, x: 32, y: 28 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, x: 24, y: 20 }}
            transition={{ duration: 0.34, ease: [0.2, 0, 0, 1] }}
            style={{ transformOrigin: 'bottom right' }}
            className={`absolute right-0 top-0 z-50 h-full w-full overflow-hidden border-l border-border bg-card shadow-2xl transition-[width] duration-300 ${
              expanded ? 'sm:w-[680px] lg:w-[820px] xl:w-[960px]' : 'sm:w-[440px] lg:w-[500px] xl:w-[560px]'
            }`}
          >
            {panel}
          </motion.aside>
        )}
      </AnimatePresence>
    );
  }

  // 모바일: 전체 화면 오버레이
  if (!workspaceOpen) return null;
  return <div className="fixed inset-0 z-[4000] bg-card">{panel}</div>;
}

function TabButton({
  label,
  icon,
  active,
  onClick,
  locked = false,
  lockHint,
  compact = false,
  compactLabel,
}: {
  label: string;
  compactLabel?: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  locked?: boolean;
  lockHint?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active && !locked}
      aria-disabled={locked}
      // 잠금 탭은 onClick을 비워 전환을 막되 disabled 속성은 쓰지 않아 hover 힌트(title)가 뜨게 한다.
      onClick={locked ? undefined : onClick}
      title={locked ? lockHint : undefined}
      className={`focus-ring-inset relative -mb-px inline-flex items-center whitespace-nowrap rounded-t-lg font-semibold transition ${
        compact ? 'gap-1 px-2 py-2 text-xs' : 'gap-1.5 px-3.5 py-2 text-sm'
      } ${
        locked
          ? 'cursor-not-allowed text-muted-foreground/40'
          : active
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {compact ? compactLabel ?? label : label}
      {locked && !compact && <Lock className="h-3 w-3 opacity-70" />}
      {active && !locked && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
    </button>
  );
}
