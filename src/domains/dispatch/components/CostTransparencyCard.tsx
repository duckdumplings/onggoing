'use client';

import React from 'react';
import { Receipt } from 'lucide-react';
import type { CostTransparency } from '@/domains/dispatch/services/scenarioInsights';

interface CostTransparencyCardProps {
  cost: CostTransparency;
}

const won = (v: number) => `₩${Math.round(v).toLocaleString('ko-KR')}`;

/**
 * 운임 vs 실비 투명성. 청구 운임에 유류비·통행료가 포함됨을 명시해
 * "숨은 추가비 없음"을 선언, 계약 전환 신뢰를 높인다(실비는 참고값).
 */
export default function CostTransparencyCard({ cost }: CostTransparencyCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Receipt className="h-3.5 w-3.5" />
        운임 투명성
      </div>

      {cost.chargedOneTime != null && (
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-foreground">청구 1회 운임</span>
          <span className="text-sm font-bold text-foreground tabular-nums">{won(cost.chargedOneTime)}</span>
        </div>
      )}

      <dl
        className={`space-y-1 text-xs ${
          cost.chargedOneTime != null ? 'mt-2 border-t border-border/60 pt-2' : ''
        }`}
      >
        <div className="flex items-baseline justify-between text-muted-foreground">
          <dt>참고: 예상 유류비</dt>
          <dd className="tabular-nums">~{won(cost.estimatedFuel)}</dd>
        </div>
        <div className="text-[10px] text-muted-foreground/80">
          유가 {cost.fuelPricePerLiter.toLocaleString('ko-KR')}원/L · 연비 {cost.fuelEfficiencyKmPerL}km/L 기준
        </div>
        <div className="flex items-baseline justify-between text-muted-foreground">
          <dt>참고: 예상 통행료</dt>
          <dd className="tabular-nums">
            {cost.tollSource === 'api' ? '' : '~'}{won(cost.estimatedToll)}
          </dd>
        </div>
        <div className="text-[10px] text-muted-foreground/80">
          {cost.tollSource === 'api' ? 'Tmap 경로 실측 기준' : '거리 기반 추정'}
        </div>
      </dl>

      <p className="mt-2 text-[11px] leading-snug text-success-700">{cost.includedNote}</p>
    </div>
  );
}
