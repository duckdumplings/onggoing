'use client';

import React from 'react';
import { toVehicleKey, type VehicleLabel } from '@/domains/dispatch/types/routePlan';
import {
  buildEtaBand,
  buildCostTransparencyFrom,
} from '@/domains/dispatch/services/scenarioInsights';
import EtaConfidenceCard from './EtaConfidenceCard';
import CostTransparencyCard from './CostTransparencyCard';

interface SingleQuoteInsightsProps {
  vehicleType?: VehicleLabel | string;
  distanceKm?: number;
  driveMinutes?: number;
  dwellMinutes?: number;
  /** 청구 1회 운임(원). 알면 투명성 카드에 함께 표시. */
  chargedOneTime?: number;
  departureAt?: string;
  realtimeTraffic?: boolean;
}

/**
 * 단일(시간제/단건) 견적 결과용 신뢰 인사이트: 도착 신뢰 구간 + 운임 투명성.
 * 운임 분해/절감 코치는 단일 견적 카드에서 이미 별도로 노출되므로 중복을 피한다.
 */
export default function SingleQuoteInsights({
  vehicleType,
  distanceKm,
  driveMinutes,
  dwellMinutes,
  chargedOneTime,
  departureAt,
  realtimeTraffic,
}: SingleQuoteInsightsProps) {
  const km = Number(distanceKm) || 0;
  const drive = Number(driveMinutes) || 0;
  const dwell = Number(dwellMinutes) || 0;
  const vehicle = toVehicleKey(vehicleType);

  const etaBand = buildEtaBand(
    { km, driveMinutes: drive, dwellMinutes: dwell, stopsCount: 0 },
    { realtimeTraffic }
  );
  const cost = buildCostTransparencyFrom(vehicle, km, chargedOneTime);

  if (!etaBand && !cost) return null;

  return (
    <div className="space-y-3">
      {etaBand && <EtaConfidenceCard band={etaBand} departureAt={departureAt} />}
      {cost && <CostTransparencyCard cost={cost} />}
    </div>
  );
}
