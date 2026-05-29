'use client';

import React from 'react';
import { Lightbulb, ShieldCheck } from 'lucide-react';
import type { SavingsTip } from '@/domains/dispatch/services/scenarioInsights';

interface SavingsCoachCardProps {
  tips: SavingsTip[];
  /** CTA가 있는 팁을 클릭했을 때 호출(예: 재견적). */
  onApply?: (tip: SavingsTip) => void;
}

/**
 * 절감/안정성 제안 카드. 화주에게 "더 줄일 수 있는 방법 / 가격 안정성"을 먼저 알려
 * 신뢰를 만든다. 제안이 없으면 렌더하지 않는다.
 */
export default function SavingsCoachCard({ tips, onApply }: SavingsCoachCardProps) {
  if (!tips.length) return null;

  return (
    <div className="space-y-2">
      {tips.map((tip) => {
        const positive = tip.tone === 'positive';
        return (
          <div
            key={tip.id}
            className={
              positive
                ? 'flex gap-2.5 rounded-lg border border-success-200 bg-success-50 p-3'
                : 'flex gap-2.5 rounded-lg border border-info-200 bg-info-50 p-3'
            }
          >
            {positive ? (
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
            ) : (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className={positive ? 'text-sm text-success-800' : 'text-sm text-info-800'}>
                {tip.message}
              </p>
              {tip.cta && onApply && (
                <button
                  type="button"
                  onClick={() => onApply(tip)}
                  className="mt-1.5 text-xs font-semibold text-success-700 underline-offset-2 hover:underline"
                >
                  {tip.cta}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
