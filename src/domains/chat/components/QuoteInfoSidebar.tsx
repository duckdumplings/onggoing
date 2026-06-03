'use client';

import React from 'react';
import { Calculator, FileText, MapPin, Loader2, X, AlertTriangle } from 'lucide-react';
import type { QuoteIssuer } from '@/domains/quote/services/chatFileGenerator';
import type {
  AIQuoteResponse,
  ChatSession,
  ChatAttachment,
  GeneratedFile,
  ChatStructuredPayload,
} from '@/domains/chat/types';
import ResultSection from './quote-sidebar/ResultSection';
import IssueSection from './quote-sidebar/IssueSection';
import ManageSection from './quote-sidebar/ManageSection';

interface QuoteInfoSidebarProps {
  compact: boolean;
  infoSheetOpen: boolean;
  onCloseInfoSheet: () => void;
  onClose: () => void;
  // 대화방
  sessions: ChatSession[];
  currentSessionId: string | null;
  isSessionLoading: boolean;
  sessionPersistenceEnabled: boolean;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  // 첨부
  attachments: ChatAttachment[];
  // 견적서 발행 옵션
  docOptionsOpen: boolean;
  setDocOptionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  docRecipient: string;
  setDocRecipient: React.Dispatch<React.SetStateAction<string>>;
  docRecipientContact: string;
  setDocRecipientContact: React.Dispatch<React.SetStateAction<string>>;
  docValidDays: number;
  setDocValidDays: React.Dispatch<React.SetStateAction<number>>;
  docIncludeVat: boolean;
  setDocIncludeVat: React.Dispatch<React.SetStateAction<boolean>>;
  docNotes: string;
  setDocNotes: React.Dispatch<React.SetStateAction<string>>;
  issuer: QuoteIssuer;
  issuerOpen: boolean;
  setIssuerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  updateIssuer: (patch: Partial<QuoteIssuer>) => void;
  // 생성 파일
  generatedFiles: GeneratedFile[];
  isGeneratingFile: boolean;
  onGenerateFile: (type: GeneratedFile['file_type'], override?: { structured?: ChatStructuredPayload }) => void;
  // 결과
  loading: boolean;
  latestResult: AIQuoteResponse | null;
  onScenarioSelect: (label: string) => void;
  onSend: (message: string) => void;
  onFillInput: (text: string) => void;
  previewMode: 'input-order' | 'optimized-order';
  setPreviewMode: React.Dispatch<React.SetStateAction<'input-order' | 'optimized-order'>>;
  isPreviewLoading: boolean;
  previewError: string | null;
  onPreviewOnMap: (useSanitizedFallback?: boolean) => void;
  onOpenQuoteDetail: () => void;
}

type SidebarTab = 'result' | 'issue' | 'manage';

/**
 * 우측 견적 현황·발행 패널. 결과/발행/관리를 탭으로 분리하고, 상단 요약·하단 발행 바를 고정한다.
 * compact 모드에서는 하단에서 올라오는 바텀시트로 동작한다.
 */
export default function QuoteInfoSidebar(props: QuoteInfoSidebarProps) {
  const { compact, infoSheetOpen, onCloseInfoSheet, onClose, latestResult, loading } = props;
  const [tab, setTab] = React.useState<SidebarTab>('result');

  const hasResult = Boolean(latestResult?.quote || latestResult?.scenarioComparison);

  // 새 견적/시나리오가 도착하면 결과 탭으로 되돌려 핵심을 먼저 보여준다.
  const prevHasResult = React.useRef(false);
  React.useEffect(() => {
    if (hasResult && !prevHasResult.current) setTab('result');
    prevHasResult.current = hasResult;
  }, [hasResult]);

  // compact 드로어가 열려 있을 때 ESC로 닫는다(모달형 표면의 표준 탈출구).
  React.useEffect(() => {
    if (!compact || !infoSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseInfoSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, infoSheetOpen, onCloseInfoSheet]);

  const quote = latestResult?.quote;

  // 발행 준비도: 수신처·발행처가 비면 불완전(차단하지 않고 안내만).
  const issueIncomplete = !props.docRecipient?.trim() || !props.issuer?.name?.trim();

  // 모바일(좁은 뷰포트)에서만 바텀시트, 데스크톱 도크는 우측 슬라이드오버.
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // compact 드로어 열림 시 포커스를 드로어로 옮기고, 닫히면 직전 요소로 되돌린다.
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const prevFocusRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!compact) return;
    if (infoSheetOpen) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      panelRef.current?.focus();
    } else {
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    }
  }, [compact, infoSheetOpen]);

  const tabs: { id: SidebarTab; label: string; dot?: boolean; count?: number }[] = [
    { id: 'result', label: '견적', dot: hasResult },
    { id: 'issue', label: '발행', count: props.generatedFiles.length },
    { id: 'manage', label: '관리', count: props.sessions.length },
  ];

  // 탭 좌우 화살표 이동(roving tabindex).
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === tab);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`qs-tab-${tabs[next].id}`)?.focus();
  };

  // compact 드로어 내부 포커스 트랩.
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (!compact || e.key !== 'Tab' || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const slideHidden = isMobile ? 'translate-y-full pointer-events-none' : 'translate-x-full pointer-events-none';
  const slideShown = isMobile ? 'translate-y-0' : 'translate-x-0';

  return (
    <>
      {compact && infoSheetOpen && (
        <button
          type="button"
          aria-label="견적 패널 닫기"
          onClick={onCloseInfoSheet}
          className="absolute inset-0 z-30 bg-foreground/15"
        />
      )}
      <div
        ref={panelRef}
        tabIndex={compact ? -1 : undefined}
        role={compact ? 'dialog' : undefined}
        aria-label={compact ? '실시간 견적 현황' : undefined}
        aria-modal={compact && infoSheetOpen ? true : undefined}
        onKeyDown={onPanelKeyDown}
        className={
          compact
            ? `absolute z-40 flex flex-col border-border bg-muted shadow-2xl outline-none transition-transform duration-300 motion-reduce:transition-none ${isMobile
              ? 'inset-x-0 bottom-0 max-h-[88%] rounded-t-2xl border-t'
              : 'inset-y-0 right-0 w-[86%] max-w-[380px] border-l'
            } ${infoSheetOpen ? slideShown : slideHidden}`
            : 'hidden md:flex w-[340px] lg:w-[420px] xl:w-[500px] 2xl:w-[560px] flex-shrink-0 flex-col border-l border-border bg-muted/40'
        }
      >
        {compact && isMobile && (
          <button
            type="button"
            aria-label="견적 패널 닫기"
            onClick={onCloseInfoSheet}
            className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50"
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/60 backdrop-blur-sm">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            실시간 견적 현황
          </h3>
          <button
            onClick={() => (compact ? onCloseInfoSheet() : onClose())}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={compact ? '닫기' : '견적챗 닫기'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 스티키 요약: 견적 탭이 아닐 때만(견적 탭은 히어로 카드와 중복) 가격을 상단에 고정 노출 */}
        {quote && tab !== 'result' && (
          <button
            type="button"
            onClick={() => setTab('result')}
            className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-border bg-primary/5 text-left hover:bg-primary/10 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-muted-foreground">시간당 1회 · {quote.basis?.vehicleType}</div>
              <div className="text-base font-black tracking-tight text-primary tabular-nums truncate">{quote.hourly?.formatted}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-semibold text-muted-foreground">단건</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{quote.perJob?.formatted}</div>
            </div>
          </button>
        )}

        {/* 탭 */}
        <div className="px-3 pt-3">
          <div role="tablist" aria-label="견적 현황 보기" onKeyDown={onTabKeyDown} className="flex gap-1 rounded-lg bg-muted p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                id={`qs-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                aria-controls={`qs-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`relative flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                {t.label}
                {typeof t.count === 'number' && t.count > 0 && (
                  <span className="rounded-full bg-muted-foreground/15 px-1 text-[9px] font-bold leading-4 text-muted-foreground tabular-nums">{t.count}</span>
                )}
                {t.dot && tab !== t.id && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 본문 (스크롤) */}
        <div
          id={`qs-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`qs-tab-${tab}`}
          tabIndex={0}
          className="flex-1 overflow-y-auto p-5 custom-scrollbar outline-none"
        >
          {tab === 'result' && (
            <ResultSection
              loading={loading}
              latestResult={latestResult}
              onScenarioSelect={props.onScenarioSelect}
              onSend={props.onSend}
              onFillInput={props.onFillInput}
              onGenerateFile={props.onGenerateFile}
              isGeneratingFile={props.isGeneratingFile}
              previewMode={props.previewMode}
              setPreviewMode={props.setPreviewMode}
              isPreviewLoading={props.isPreviewLoading}
              previewError={props.previewError}
              onPreviewOnMap={props.onPreviewOnMap}
              onOpenQuoteDetail={props.onOpenQuoteDetail}
            />
          )}
          {tab === 'issue' && (
            <IssueSection
              docOptionsOpen={props.docOptionsOpen}
              setDocOptionsOpen={props.setDocOptionsOpen}
              docRecipient={props.docRecipient}
              setDocRecipient={props.setDocRecipient}
              docRecipientContact={props.docRecipientContact}
              setDocRecipientContact={props.setDocRecipientContact}
              docValidDays={props.docValidDays}
              setDocValidDays={props.setDocValidDays}
              docIncludeVat={props.docIncludeVat}
              setDocIncludeVat={props.setDocIncludeVat}
              docNotes={props.docNotes}
              setDocNotes={props.setDocNotes}
              issuer={props.issuer}
              issuerOpen={props.issuerOpen}
              setIssuerOpen={props.setIssuerOpen}
              updateIssuer={props.updateIssuer}
              generatedFiles={props.generatedFiles}
              isGeneratingFile={props.isGeneratingFile}
              onGenerateFile={props.onGenerateFile}
              currentSessionId={props.currentSessionId}
            />
          )}
          {tab === 'manage' && (
            <ManageSection
              sessions={props.sessions}
              currentSessionId={props.currentSessionId}
              isSessionLoading={props.isSessionLoading}
              sessionPersistenceEnabled={props.sessionPersistenceEnabled}
              onNewSession={props.onNewSession}
              onSelectSession={props.onSelectSession}
              onDeleteSession={props.onDeleteSession}
              attachments={props.attachments}
            />
          )}
        </div>

        {/* 스티키 발행 바: 견적이 있으면 어느 탭에서도 한 번에 발행/미리보기 */}
        {quote && (
          <div className="border-t border-border bg-card/80 backdrop-blur-sm p-3 space-y-2">
            {issueIncomplete && (
              <button
                type="button"
                onClick={() => { setTab('issue'); props.setDocOptionsOpen(true); }}
                className="flex w-full items-center gap-1.5 rounded-lg bg-warning-muted px-2.5 py-1.5 text-left text-[11px] font-medium text-warning"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                수신처·발행처를 입력하면 더 완전한 견적서가 돼요
              </button>
            )}
            <div className="flex gap-2">
            <button
              type="button"
              onClick={() => props.onGenerateFile('pdf')}
              disabled={props.isGeneratingFile}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {props.isGeneratingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              PDF 견적서 발행
            </button>
            <button
              type="button"
              onClick={() => props.onPreviewOnMap(false)}
              disabled={props.isPreviewLoading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-60"
            >
              {props.isPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              지도
            </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
