'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Truck, X } from 'lucide-react';
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
  const { workspaceOpen, workspaceTab, setWorkspaceTab, closeWorkspace, multiDriverResult } =
    useRouteOptimization();

  const hasResult = !!(multiDriverResult && multiDriverResult.success);
  // 결과 탭이 있어야만 의미가 있으므로, 결과가 없으면 항상 대화 탭으로 강제한다.
  const activeTab = workspaceTab === 'result' && !hasResult ? 'chat' : workspaceTab;
  const showTabs = hasResult;

  const panel = (
    <div className="flex h-full w-full flex-col bg-card">
      {showTabs && (
        <div className="flex flex-none items-center gap-1 bg-card/95 px-2.5 pt-2 backdrop-blur-sm">
          <TabButton
            label="대화"
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            active={activeTab === 'chat'}
            onClick={() => setWorkspaceTab('chat')}
          />
          <TabButton
            label="배차 결과"
            icon={<Truck className="h-3.5 w-3.5" />}
            active={activeTab === 'result'}
            onClick={() => setWorkspaceTab('result')}
          />
          <button
            type="button"
            onClick={closeWorkspace}
            className="focus-ring-inset ml-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="워크스페이스 닫기"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {/* 대화 탭 — AIQuoteChatModal은 항상 마운트해 대화 상태를 보존한다. */}
        <div className={activeTab === 'chat' ? 'h-full' : 'hidden'}>
          <AIQuoteChatModal docked compact isOpen onClose={closeWorkspace} />
        </div>

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
            className="absolute right-0 top-0 z-50 h-full w-full overflow-hidden border-l border-border bg-card shadow-2xl sm:w-[440px] lg:w-[500px] xl:w-[560px]"
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
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring-inset relative -mb-px inline-flex items-center gap-1.5 rounded-t-lg px-3.5 py-2 text-sm font-semibold transition ${
        active
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
    </button>
  );
}
