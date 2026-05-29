'use client';

import React from 'react';
import { Clock, Radio } from 'lucide-react';
import type { EtaBand } from '@/domains/dispatch/services/scenarioInsights';

interface EtaConfidenceCardProps {
  band: EtaBand;
  /** 출발 시각(ISO). 있으면 도착 시각 밴드(시:분)를 함께 보여준다. */
  departureAt?: string;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function formatClock(base: Date, addMinutes: number): string {
  const d = new Date(base.getTime() + addMinutes * 60_000);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * 도착 시간 신뢰 밴드. 단일 ETA 대신 "예상 ± 마진 / 정시 확률"을 제시해
 * 화주가 도착 시간을 신뢰할 수 있게 한다.
 */
export default function EtaConfidenceCard({ band, departureAt }: EtaConfidenceCardProps) {
  const departure = departureAt ? new Date(departureAt) : null;
  const hasClock = departure && !Number.isNaN(departure.getTime());

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          도착 시간 신뢰 구간
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            band.realtimeTraffic
              ? 'bg-success-50 text-success-700'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Radio className="h-3 w-3" />
          {band.realtimeTraffic ? '실시간 교통 반영' : '평균 소요 기준'}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-foreground">
          {formatDuration(band.expectedMinutes)}
        </span>
        <span className="text-sm text-muted-foreground">± {band.marginMinutes}분</span>
      </div>

      {hasClock && (
        <div className="mt-0.5 text-sm text-foreground/80">
          예상 도착{' '}
          <span className="font-semibold tabular-nums">
            {formatClock(departure!, band.lowerMinutes)} ~ {formatClock(departure!, band.upperMinutes)}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={band.realtimeTraffic ? 'h-full bg-success-500' : 'h-full bg-warning-400'}
            style={{ width: `${band.onTimeProbability}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          정시 도착 {band.onTimeProbability}%
        </span>
      </div>
    </div>
  );
}
