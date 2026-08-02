'use client';

import React from 'react';
import { AlertTriangle, Database, FileCheck2 } from 'lucide-react';

export interface RateEvidenceItem {
  label: string;
  evidence?: {
    source?: 'database' | 'static-fallback' | string;
    effectiveFrom?: string;
    sourceDoc?: string;
  } | null;
}

interface RateTableEvidencePanelProps {
  items: RateEvidenceItem[];
  compact?: boolean;
}

function formatEffectiveDate(value?: string): string {
  if (!value) return '시행일 미확인';
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? value;
}

/** 운임 계산에 실제로 채택된 DB/폴백 표와 시행일·원문 근거를 한곳에 표시한다. */
export default function RateTableEvidencePanel({
  items,
  compact = false,
}: RateTableEvidencePanelProps) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-warning/25 bg-warning-muted/40 px-3 py-2.5 text-[11px] text-warning">
        적용 운임표의 시행일 근거를 확인하지 못했습니다. 견적 확정 전 운영팀 검토가 필요합니다.
      </div>
    );
  }

  const hasFallback = items.some(
    (item) => item.evidence?.source === 'static-fallback',
  );
  const hasMissing = items.some((item) => !item.evidence);

  return (
    <div className="space-y-2">
      {(hasFallback || hasMissing) && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-muted/50 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
          <p className="text-[10px] leading-relaxed text-foreground">
            {hasFallback
              ? 'DB 운임표 조회 실패로 정적 폴백이 포함되었습니다. 발행 전 시행 운임표를 다시 확인하세요.'
              : '일부 운임표의 시행일 근거가 누락되었습니다. 발행 전 계산 응답을 다시 확인하세요.'}
          </p>
        </div>
      )}

      <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
        {items.map((item) => {
          const database = item.evidence?.source === 'database';
          const missing = !item.evidence;
          return (
            <div
              key={item.label}
              className="rounded-lg border border-outline-variant bg-surface-lowest px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {item.label}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    missing
                      ? 'bg-error-muted text-error-600'
                      : database
                      ? 'bg-success-muted text-success-600'
                      : 'bg-warning-muted text-warning'
                  }`}
                >
                  {database && !missing ? (
                    <Database className="h-2.5 w-2.5" />
                  ) : (
                    <AlertTriangle className="h-2.5 w-2.5" />
                  )}
                  {missing ? '근거 미확인' : database ? 'DB 운임표' : '정적 폴백'}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <FileCheck2 className="h-3 w-3 text-primary" />
                {formatEffectiveDate(item.evidence?.effectiveFrom)} 시행
              </div>
              <p
                className="mt-1 truncate text-[10px] text-muted-foreground"
                title={item.evidence?.sourceDoc}
              >
                {item.evidence?.sourceDoc || '근거 문서 미기재'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
