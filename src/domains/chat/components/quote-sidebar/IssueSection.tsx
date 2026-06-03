'use client';

import React from 'react';
import { Download, FileText, Paperclip, Check, Circle } from 'lucide-react';
import type { QuoteIssuer } from '@/domains/quote/services/chatFileGenerator';
import type { GeneratedFile, ChatStructuredPayload } from '@/domains/chat/types';

interface IssueSectionProps {
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
  generatedFiles: GeneratedFile[];
  isGeneratingFile: boolean;
  onGenerateFile: (type: GeneratedFile['file_type'], override?: { structured?: ChatStructuredPayload }) => void;
  currentSessionId: string | null;
}

const inputCls =
  'w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15';

/** 발행 탭 본문: 견적서 옵션 + 발행처(공급자) 설정 + 파일 생성 버튼 + 생성 파일 목록. */
export default function IssueSection({
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
  currentSessionId,
}: IssueSectionProps) {
  const checklist = [
    { label: '수신처(화주사)', done: Boolean(docRecipient?.trim()) },
    { label: '발행처(공급자)', done: Boolean(issuer.name?.trim()) },
    { label: '유효기간', done: docValidDays >= 1 },
  ];
  const sortedFiles = [...generatedFiles].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-muted-foreground">견적서 발행</div>
        <button
          type="button"
          onClick={() => setDocOptionsOpen((v) => !v)}
          className="text-[10px] font-semibold text-primary hover:text-primary/80"
        >
          {docOptionsOpen ? '옵션 접기' : '옵션 설정'}
        </button>
      </div>

      {/* 발행 준비도: 발송 전 빠진 항목 확인(차단하지 않음) */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 rounded-lg border border-border bg-card px-3 py-2">
        {checklist.map((c) => (
          <span
            key={c.label}
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${c.done ? 'text-success' : 'text-muted-foreground'}`}
          >
            {c.done ? <Check className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
            {c.label}
          </span>
        ))}
      </div>

      {docOptionsOpen && (
        <div className="bg-card rounded-xl border border-border p-3 shadow-sm space-y-2.5 text-xs animate-in fade-in duration-200">
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground mb-1">수신처 (화주사)</label>
            <input value={docRecipient} onChange={(e) => setDocRecipient(e.target.value)} placeholder="예: (주)한진로지스틱스" className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground mb-1">담당자 / 연락처</label>
            <input value={docRecipientContact} onChange={(e) => setDocRecipientContact(e.target.value)} placeholder="예: 구매팀 김영식 차장" className={inputCls} />
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
                className={inputCls}
              />
            </div>
            <label className="flex items-center gap-1.5 mt-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={docIncludeVat}
                onChange={(e) => setDocIncludeVat(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary/20"
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
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="pt-1 border-t border-border">
            <button
              type="button"
              onClick={() => setIssuerOpen((v) => !v)}
              className="w-full flex items-center justify-between py-1.5 text-[11px] font-bold text-foreground"
            >
              <span>발행처(공급자) 설정</span>
              <span className="text-[10px] font-semibold text-primary">{issuerOpen ? '접기' : '펼치기'}</span>
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
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/20 text-[10px] font-semibold text-primary hover:bg-primary/10 cursor-pointer">
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
                        className="block text-[10px] text-muted-foreground hover:text-error"
                      >
                        로고 제거
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">발행처명</label>
                  <input value={issuer.name || ''} onChange={(e) => updateIssuer({ name: e.target.value })} placeholder="예: 옹고잉 물류" className={inputCls} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-muted-foreground mb-1">사업자번호</label>
                    <input value={issuer.bizNumber || ''} onChange={(e) => updateIssuer({ bizNumber: e.target.value })} placeholder="000-00-00000" className={inputCls} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-muted-foreground mb-1">연락처</label>
                    <input value={issuer.contact || ''} onChange={(e) => updateIssuer({ contact: e.target.value })} placeholder="02-0000-0000" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">이메일</label>
                  <input value={issuer.email || ''} onChange={(e) => updateIssuer({ email: e.target.value })} placeholder="info@company.com" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground mb-1">주소</label>
                  <input value={issuer.address || ''} onChange={(e) => updateIssuer({ address: e.target.value })} placeholder="서울특별시 ..." className={inputCls} />
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
              className="px-2 py-1 rounded-md border border-primary/20 text-[10px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-44 overflow-y-auto space-y-1">
        {sortedFiles.map((file) => (
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
          <div className="px-2 py-2 text-[11px] text-muted-foreground">아직 생성한 견적서가 없어요.</div>
        )}
      </div>
    </div>
  );
}
