'use client';

import React from 'react';
import { MapPin, Truck, Clock, Calculator, Loader2, Download, FileText, Trash2, Paperclip, X } from 'lucide-react';
import ScenarioComparisonCard from '@/domains/dispatch/components/ScenarioComparisonCard';
import SingleQuoteInsights from '@/domains/dispatch/components/SingleQuoteInsights';
import ConfidenceBadge from '@/domains/dispatch/components/ConfidenceBadge';
import type { QuoteIssuer } from '@/domains/quote/services/chatFileGenerator';
import type {
  AIQuoteResponse,
  ChatSession,
  ChatAttachment,
  GeneratedFile,
  ChatStructuredPayload,
} from '@/domains/chat/types';

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

/**
 * 우측 견적 현황·발행 패널. 대화방/첨부/견적서 발행 옵션/진행상태/추출정보/
 * 시나리오 비교/견적 결과 카드를 렌더한다. compact 모드에서는 슬라이드 드로어로 동작.
 */
export default function QuoteInfoSidebar({
  compact,
  infoSheetOpen,
  onCloseInfoSheet,
  onClose,
  sessions,
  currentSessionId,
  isSessionLoading,
  sessionPersistenceEnabled,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  attachments,
  docOptionsOpen,
  setDocOptionsOpen,
  docRecipient,
  setDocRecipient,
  docRecipientContact,
  setDocRecipientContact,
  docValidDays,
  setDocValidDays,
  docIncludeVat,
  setDocIncludeVat,
  docNotes,
  setDocNotes,
  issuer,
  issuerOpen,
  setIssuerOpen,
  updateIssuer,
  generatedFiles,
  isGeneratingFile,
  onGenerateFile,
  loading,
  latestResult,
  onScenarioSelect,
  onSend,
  onFillInput,
  previewMode,
  setPreviewMode,
  isPreviewLoading,
  previewError,
  onPreviewOnMap,
  onOpenQuoteDetail,
}: QuoteInfoSidebarProps) {
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
        className={
          compact
            ? `absolute inset-y-0 right-0 z-40 flex w-[92%] max-w-[400px] flex-col border-l border-border bg-muted shadow-2xl transition-transform duration-300 ${infoSheetOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`
            : 'hidden md:flex w-[340px] lg:w-[420px] xl:w-[500px] 2xl:w-[560px] flex-shrink-0 flex-col border-l border-border bg-muted/40'
        }
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card/60 backdrop-blur-sm">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            실시간 견적 현황
          </h3>
          <button
            onClick={() => (compact ? onCloseInfoSheet() : onClose())}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-muted-foreground transition-colors"
            title={compact ? '닫기' : '견적챗 닫기'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">대화방</div>
              <button
                onClick={onNewSession}
                className="text-[11px] font-semibold text-primary hover:text-primary/80"
              >
                + 새 대화
              </button>
            </div>
            <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-48 overflow-y-auto space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`w-full text-left px-2 py-2 rounded-lg transition-colors ${currentSessionId === session.id
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'hover:bg-muted text-foreground'
                    }`}
                >
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className="w-full text-left px-1"
                  >
                    <div className="text-xs font-semibold truncate">{session.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(session.updated_at).toLocaleString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </button>
                  <div className="mt-1 flex justify-end">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      삭제
                    </button>
                  </div>
                </div>
              ))}
              {!sessions.length && (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">저장된 대화가 없습니다.</div>
              )}
            </div>
            {isSessionLoading && (
              <div className="text-[11px] text-muted-foreground">대화를 불러오는 중...</div>
            )}
            {!sessionPersistenceEnabled && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                서버 대화 저장이 비활성화되어 로컬 임시 대화로 동작 중입니다.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">첨부 파일</div>
            <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-40 overflow-y-auto space-y-1">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="px-2 py-1.5 rounded-lg border border-border bg-muted">
                  <div className="text-[11px] font-semibold text-foreground truncate">{attachment.file_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {attachment.file_type} · {(attachment.file_size / 1024).toFixed(1)}KB · {attachment.parse_status}
                  </div>
                </div>
              ))}
              {!attachments.length && (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">첨부된 파일이 없습니다.</div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">견적서 발행</div>
              <button
                type="button"
                onClick={() => setDocOptionsOpen((v) => !v)}
                className="text-[10px] font-semibold text-primary hover:text-primary/80"
              >
                {docOptionsOpen ? '옵션 접기' : '옵션 설정'}
              </button>
            </div>
            {docOptionsOpen && (
              <div className="bg-card rounded-xl border border-border p-3 shadow-sm space-y-2.5 text-xs animate-in fade-in duration-200">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">수신처 (화주사)</label>
                  <input
                    value={docRecipient}
                    onChange={(e) => setDocRecipient(e.target.value)}
                    placeholder="예: (주)한진로지스틱스"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">담당자 / 연락처</label>
                  <input
                    value={docRecipientContact}
                    onChange={(e) => setDocRecipientContact(e.target.value)}
                    placeholder="예: 구매팀 김영식 차장"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-muted-foreground mb-1">유효기간 (일)</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={docValidDays}
                      onChange={(e) => setDocValidDays(Math.max(1, Math.min(365, Number(e.target.value) || 14)))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 mt-4 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={docIncludeVat}
                      onChange={(e) => setDocIncludeVat(e.target.checked)}
                      className="rounded border-border text-indigo-600 focus:ring-indigo-200"
                    />
                    <span className="text-[11px] text-foreground">VAT 포함</span>
                  </label>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">비고</label>
                  <textarea
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    rows={2}
                    placeholder="견적서에 함께 표기할 메모"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 resize-none"
                  />
                </div>

                {/* 발행처(공급자) 설정 — 로고/사업자번호 등, localStorage 보관 */}
                <div className="pt-1 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIssuerOpen((v) => !v)}
                    className="w-full flex items-center justify-between py-1.5 text-[11px] font-bold text-foreground"
                  >
                    <span>발행처(공급자) 설정</span>
                    <span className="text-[10px] font-semibold text-indigo-600">{issuerOpen ? '접기' : '펼치기'}</span>
                  </button>
                  {issuerOpen && (
                    <div className="space-y-2.5 pt-1 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2.5">
                        <div className="w-14 h-14 flex-none rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
                          {issuer.logoDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={issuer.logoDataUrl} alt="발행처 로고" className="w-full h-full object-contain" />
                          ) : (
                            <FileText className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50 cursor-pointer">
                            <Paperclip className="w-3 h-3" />
                            로고 업로드
                            <input
                              type="file"
                              accept="image/png,image/jpeg"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => updateIssuer({ logoDataUrl: String(reader.result || '') });
                                reader.readAsDataURL(file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {issuer.logoDataUrl && (
                            <button
                              type="button"
                              onClick={() => updateIssuer({ logoDataUrl: '' })}
                              className="block text-[10px] text-muted-foreground hover:text-rose-600"
                            >
                              로고 제거
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-muted-foreground mb-1">발행처명</label>
                        <input
                          value={issuer.name || ''}
                          onChange={(e) => updateIssuer({ name: e.target.value })}
                          placeholder="예: 옹고잉 물류"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">사업자번호</label>
                          <input
                            value={issuer.bizNumber || ''}
                            onChange={(e) => updateIssuer({ bizNumber: e.target.value })}
                            placeholder="000-00-00000"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">연락처</label>
                          <input
                            value={issuer.contact || ''}
                            onChange={(e) => updateIssuer({ contact: e.target.value })}
                            placeholder="02-0000-0000"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-muted-foreground mb-1">이메일</label>
                        <input
                          value={issuer.email || ''}
                          onChange={(e) => updateIssuer({ email: e.target.value })}
                          placeholder="info@company.com"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-muted-foreground mb-1">주소</label>
                        <input
                          value={issuer.address || ''}
                          onChange={(e) => updateIssuer({ address: e.target.value })}
                          placeholder="서울특별시 ..."
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">이 기기에 저장되어 모든 견적서에 자동 반영됩니다.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {currentSessionId && !currentSessionId.startsWith('local-') ? '생성 후 저장됨' : '저장 없이 바로 다운로드'}
              </span>
              <div className="flex items-center gap-1">
                {(['pdf', 'xlsx', 'md', 'docx', 'json'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onGenerateFile(type)}
                    disabled={isGeneratingFile}
                    className="px-2 py-1 rounded-md border border-indigo-200 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-44 overflow-y-auto space-y-1">
              {generatedFiles.map((file) => (
                <a
                  key={file.id}
                  href={file.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-between px-2 py-2 rounded-lg border border-border hover:bg-muted"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-foreground truncate">{file.file_name}</div>
                    <div className="text-[10px] text-muted-foreground">{file.file_type.toUpperCase()} · {(file.file_size / 1024).toFixed(1)}KB</div>
                  </div>
                  <Download className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </a>
              ))}
              {!generatedFiles.length && (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">생성된 파일이 없습니다.</div>
              )}
            </div>
          </div>

          {/* Status Status */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">진행 상태</div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${latestResult?.extracted ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <span className={`text-sm ${latestResult?.extracted ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>입력 정보 분석</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${latestResult?.routeSummary ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <span className={`text-sm ${latestResult?.routeSummary ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>경로 최적화 (Tmap)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${latestResult?.quote ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                <span className={`text-sm ${latestResult?.quote ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>최종 견적 산출</span>
              </div>
            </div>
          </div>

          {/* Extracted Info Card */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">추출 정보</div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-indigo-500 mt-0.5" />
                <div className="w-full min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5">경유지 정보</div>
                  <div className="space-y-1.5 mt-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">출발</span>
                      <span className="text-sm font-medium text-foreground truncate">{latestResult?.extracted?.origin?.address || '-'}</span>
                    </div>
                    {latestResult?.extracted?.destinations?.map((d: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 relative">
                        <div className="absolute -top-1.5 left-2 w-px h-1.5 bg-gray-200"></div>
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${idx === (latestResult.extracted.destinations.length - 1)
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-blue-100 text-blue-700'
                          }`}>
                          {idx === (latestResult.extracted.destinations.length - 1) ? '도착' : `경유 ${idx + 1}`}
                        </span>
                        <span className="text-sm font-medium text-foreground truncate">{d.address || '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Truck className="w-4 h-4 text-indigo-500 mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">차량 정보</div>
                  <div className="text-sm font-medium text-foreground">
                    {latestResult?.extracted?.vehicleType || '-'}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-indigo-500 mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">일정</div>
                  <div className="text-sm font-medium text-foreground">
                    {latestResult?.extracted?.departureTime || '-'} 출발 · {latestResult?.extracted?.scheduleType === 'regular' ? '정기' : '비정기'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scenario Comparison (다중 시나리오: 3/5/10개 지점) */}
          {latestResult?.scenarioComparison && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">시나리오 비교</div>
              <ScenarioComparisonCard
                comparison={latestResult.scenarioComparison}
                routeErrors={latestResult.scenarioRouteErrors}
                onSelect={(r) => onScenarioSelect(r.label)}
              />
            </div>
          )}

          {/* 결과 빠른 액션 칩 */}
          {!loading && (latestResult?.quote || latestResult?.scenarioComparison) && (
            <div className="flex flex-wrap gap-2 animate-in fade-in duration-500">
              <button
                type="button"
                onClick={() => onSend('같은 조건으로 레이와 스타렉스를 모두 비교해줘')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Truck className="w-3.5 h-3.5" />
                다른 차종으로 비교
              </button>
              <button
                type="button"
                onClick={() => onSend('시간당 요금제와 단건 요금제를 모두 보여줘')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Calculator className="w-3.5 h-3.5" />
                다른 요금제로 보기
              </button>
              <button
                type="button"
                onClick={() => onGenerateFile('pdf')}
                disabled={isGeneratingFile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                {isGeneratingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                PDF 견적서
              </button>
            </div>
          )}

          {/* 지오코딩 실패 복구: 실패한 지점의 정확한 주소를 직접 지정하도록 유도 */}
          {!loading && !!latestResult?.scenarioRouteErrors?.length && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2 animate-in fade-in duration-500">
              <div className="font-semibold">일부 지점의 좌표를 찾지 못했어요. 정확한 도로명 주소로 다시 시도해 보세요.</div>
              <div className="flex flex-wrap gap-2">
                {latestResult.scenarioRouteErrors.map((e) => (
                  <button
                    key={e.label}
                    type="button"
                    onClick={() => onFillInput(`${e.label} 시나리오에서 좌표를 못 찾은 지점의 정확한 도로명 주소를 알려줄게(예: 서울 ○○구 ○○로 12): `)}
                    className="px-2.5 py-1 rounded-full border border-amber-300 bg-card text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    {e.label} 주소 직접 지정
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 견적 신뢰도 배지 + 가정/전제 — 단일/시나리오 응답 공통 노출 */}
          {!loading && (latestResult?.confidence || !!latestResult?.assumptions?.length) && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-3 animate-in fade-in duration-500">
              {latestResult?.confidence && <ConfidenceBadge confidence={latestResult.confidence} />}
              {!!latestResult?.assumptions?.length && (
                <div className="space-y-1 border-t border-border pt-2">
                  <div className="text-[11px] font-semibold text-muted-foreground">견적 가정·전제</div>
                  <ul className="space-y-1">
                    {latestResult.assumptions.map((assumption, idx) => (
                      <li key={idx} className="flex gap-1.5 text-[11px] leading-relaxed text-foreground/80">
                        <span className="text-muted-foreground">·</span>
                        <span>{assumption}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Quote Result Card (Highlight) */}
          {latestResult?.quote && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>예상 견적</span>
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium normal-case">
                  기준: {latestResult.quote.basis?.vehicleType} · {latestResult.quote.basis?.scheduleType === 'regular' ? '정기' : '비정기'}
                </span>
              </div>
              <div className="bg-primary rounded-2xl p-5 text-white shadow-xl">

                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-1">시간당 1회</div>
                    <div className="text-xl font-black tracking-tight">
                      {latestResult.quote.hourly?.formatted}
                    </div>
                    {latestResult.quote.hourly?.tiers && (
                      <div className="mt-1.5 space-y-0.5 text-[10px] text-indigo-100/90 leading-tight">
                        <div>
                          일일 <span className="font-semibold text-white">{latestResult.quote.hourly.tiers.perDay?.formatted}</span>
                        </div>
                        <div>
                          20일 <span className="font-semibold text-white">{latestResult.quote.hourly.tiers.perMonth20d?.formatted}</span>
                        </div>
                        <div className="text-indigo-200/70 text-[9px]">유류할증 제외 · 운임표 기준</div>
                      </div>
                    )}
                  </div>
                  <div className="w-px self-stretch bg-indigo-400/30 mx-3"></div>
                  <div className="text-right">
                    <div className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-1">단건 요금제</div>
                    <div className="text-xl font-black tracking-tight">
                      {latestResult.quote.perJob?.formatted}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white/10 rounded-lg p-2">
                    <div className="text-[10px] text-indigo-200">운행 거리</div>
                    <div className="text-sm font-bold">{latestResult.quote.basis?.distanceKm}km</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2">
                    <div className="text-[10px] text-indigo-200">총 소요 시간</div>
                    <div className="text-sm font-bold">
                      {latestResult.quote.basis?.totalBillMinutes}분
                      <div className="text-[9px] font-normal text-indigo-200/80 mt-0.5">
                        운행 {latestResult.quote.basis?.driveMinutes}분 + 체류 {latestResult.quote.basis?.dwellTotalMinutes}분
                      </div>
                    </div>
                  </div>
                </div>

                {latestResult.quote.hourly?.advisor?.message && (
                  <div className="mb-4 rounded-lg bg-amber-50/95 border border-amber-200 px-3 py-2 text-[11px] leading-snug text-amber-900 shadow-sm">
                    <span className="font-semibold">단가 인하 구간 안내</span>
                    <span className="block mt-0.5 text-amber-800">
                      {latestResult.quote.hourly.advisor.message.replace(/^\u{1F4A1}\s*/u, '')}
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('input-order')}
                      className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${previewMode === 'input-order'
                          ? 'bg-card text-indigo-700 border-indigo-300'
                          : 'bg-indigo-50/60 text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                        }`}
                    >
                      입력순 미리보기
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('optimized-order')}
                      className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${previewMode === 'optimized-order'
                          ? 'bg-card text-indigo-700 border-indigo-300'
                          : 'bg-indigo-50/60 text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                        }`}
                    >
                      최적화순 미리보기
                    </button>
                  </div>
                  <button
                    onClick={() => onPreviewOnMap(false)}
                    disabled={isPreviewLoading}
                    className="w-full bg-card text-indigo-700 py-3 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                    {isPreviewLoading ? '지도 반영 중...' : '지도에서 경로 확인하기'}
                  </button>
                  {previewError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 space-y-2">
                      <div>{previewError}</div>
                      <button
                        type="button"
                        onClick={() => onPreviewOnMap(true)}
                        disabled={isPreviewLoading}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-card px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        <Loader2 className={`w-3 h-3 ${isPreviewLoading ? 'animate-spin' : ''}`} />
                        자동 수정으로 재시도
                      </button>
                    </div>
                  )}
                  <button
                    onClick={onOpenQuoteDetail}
                    className="w-full bg-indigo-100/70 text-indigo-800 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-100 transition-colors"
                  >
                    전체 운임 시나리오 비교
                  </button>
                </div>
              </div>

              <SingleQuoteInsights
                vehicleType={latestResult.quote.basis?.vehicleType}
                distanceKm={latestResult.quote.basis?.distanceKm}
                driveMinutes={latestResult.quote.basis?.driveMinutes}
                dwellMinutes={latestResult.quote.basis?.dwellTotalMinutes}
              />
            </div>
          )}

        </div>
      </div>
    </>
  );
}
