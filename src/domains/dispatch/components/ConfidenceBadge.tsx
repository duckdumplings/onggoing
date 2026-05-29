'use client';

import React from 'react';
import { Check, X, ShieldCheck } from 'lucide-react';
import type { QuoteConfidence, ConfidenceLevel } from '@/domains/dispatch/services/scenarioInsights';

interface ConfidenceBadgeProps {
  confidence: QuoteConfidence;
  /** 신호 목록까지 펼쳐 보여줄지(기본 true). false면 한 줄 배지만. */
  showSignals?: boolean;
}

const LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

const LEVEL_CLASS: Record<ConfidenceLevel, string> = {
  high: 'bg-success-50 text-success-700 border-success-200',
  medium: 'bg-warning-50 text-warning-700 border-warning-200',
  low: 'bg-error-50 text-error-700 border-error-200',
};

/**
 * 견적 신뢰도 배지. 점수와 함께 어떤 근거로 신뢰할 수 있는지(경로 산출/실시간 교통/빈도 확정)를
 * 신호 체크리스트로 노출해 화주의 견적 수용성을 높인다.
 */
export default function ConfidenceBadge({ confidence, showSignals = true }: ConfidenceBadgeProps) {
  const { level, score, signals } = confidence;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${LEVEL_CLASS[level]}`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          견적 신뢰도 {LEVEL_LABEL[level]}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{score}점</span>
      </div>

      {showSignals && (
        <ul className="space-y-1">
          {signals.map((signal) => (
            <li key={signal.label} className="flex items-center gap-1.5 text-xs">
              {signal.ok ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-success-600" />
              ) : (
                <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className={signal.ok ? 'text-foreground/80' : 'text-muted-foreground'}>
                {signal.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
