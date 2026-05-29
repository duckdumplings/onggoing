/**
 * 견적 신뢰 인사이트 순수 로직.
 *
 * 화주사에게 "왜 이 금액인지 / 믿을 수 있는지 / 더 줄일 수 있는지"를 보여주기 위한
 * 데이터를 만든다. 모든 함수는 순수 함수이며 요율 단일 진실원(`quote/pricing.ts`)과
 * 시나리오 견적 결과(`ScenarioQuoteResult`)만 입력으로 받는다(이중 정의 방지).
 */

import {
  PER_JOB_TABLE,
  suggestCheaperNextTier,
  estimatedFuelCost,
  highwayTollCost,
  type Vehicle as PricingVehicle,
} from '@/domains/quote/pricing';
import {
  toVehicleKey,
  type RouteMetrics,
  type ScenarioQuoteResult,
} from '@/domains/dispatch/types/routePlan';
import type {
  ScenarioComparison,
  ComparisonSortKey,
} from '@/domains/dispatch/services/scenarioComparison';

/** 운임 분해 워터폴의 한 줄. */
export interface PriceBreakdownRow {
  key: 'base' | 'stopFee' | 'fuelSurcharge' | 'oneTime' | 'annual';
  label: string;
  /** 항목 금액(원). */
  amount: number;
  /** 누적 합계(원). 워터폴 막대 위치 산정용. */
  cumulative: number;
  /** 합계/소계 행 여부(굵게 표시). */
  isTotal?: boolean;
  /** "왜?" 보조 설명. */
  hint?: string;
}

/**
 * 시나리오 견적 결과를 워터폴 행 배열로 분해한다.
 * base → +경유비 → (+유류할증) → 1회 운임 → ×연N회 → 연 운임.
 */
export function buildPriceBreakdownRows(result: ScenarioQuoteResult): PriceBreakdownRow[] {
  const { breakdown, oneTimePrice, annualPrice, metrics, counts } = result;
  const rows: PriceBreakdownRow[] = [];
  let cumulative = 0;

  cumulative += breakdown.base;
  rows.push({
    key: 'base',
    label: '기본 운임',
    amount: breakdown.base,
    cumulative,
    hint: `${result.vehicleType} ${metrics.km.toFixed(1)}km 거리 구간 요율`,
  });

  if (breakdown.stopFee > 0) {
    cumulative += breakdown.stopFee;
    rows.push({
      key: 'stopFee',
      label: `경유지 정액 ${metrics.stopsCount}곳`,
      amount: breakdown.stopFee,
      cumulative,
      hint: '출발·최종 하차지를 제외한 중간 경유지당 정액',
    });
  }

  if (breakdown.fuelSurcharge > 0) {
    cumulative += breakdown.fuelSurcharge;
    rows.push({
      key: 'fuelSurcharge',
      label: '유류할증',
      amount: breakdown.fuelSurcharge,
      cumulative,
      hint: '기본 주행거리 초과분',
    });
  }

  rows.push({
    key: 'oneTime',
    label: '1회 운임',
    amount: oneTimePrice,
    cumulative: oneTimePrice,
    isTotal: true,
    hint: `${counts.pickup ? `수거 ${counts.pickup}` : ''}${counts.drop ? ` · 하차 ${counts.drop}` : ''}`.trim() || undefined,
  });

  if (annualPrice !== oneTimePrice && breakdown.annualVisits > 1) {
    rows.push({
      key: 'annual',
      label: `연 운임 (×${breakdown.annualVisits}회)`,
      amount: annualPrice,
      cumulative: annualPrice,
      isTotal: true,
      hint: result.frequencyLabel ?? undefined,
    });
  }

  return rows;
}

/** 거리 구간 위치/여유 인사이트. 가격 예측 가능성을 보여준다. */
export interface DistanceTierInsight {
  vehicle: PricingVehicle;
  km: number;
  /** 현재 구간 [fromKm, toKm]. */
  currentFromKm: number;
  currentToKm: number;
  /** 다음 구간 경계까지 남은 거리(km). 없으면 null(마지막 구간). */
  headroomKm: number | null;
  /** 다음 구간 진입 시 1회 기본운임 증가액(원). 없으면 null. */
  nextTierDelta: number | null;
}

/**
 * 현재 거리가 PER_JOB 요율표의 어느 구간에 있는지, 다음 구간까지 여유가 얼마인지 계산한다.
 * "조금 멀어져도 요금이 폭등하지 않는다"는 단계적 구조를 화주에게 보여주기 위함.
 */
export function analyzeDistanceTier(
  vehicle: PricingVehicle,
  km: number
): DistanceTierInsight | null {
  if (!(km > 0)) return null;
  const idx = PER_JOB_TABLE.findIndex((r) => km >= r.fromKm && km <= r.toKm);
  if (idx < 0) {
    // 마지막 구간 초과(추가 요금 없음)
    const last = PER_JOB_TABLE[PER_JOB_TABLE.length - 1];
    return {
      vehicle,
      km,
      currentFromKm: last.toKm,
      currentToKm: Infinity,
      headroomKm: null,
      nextTierDelta: null,
    };
  }
  const current = PER_JOB_TABLE[idx];
  const next = PER_JOB_TABLE[idx + 1];
  const priceOf = (r: (typeof PER_JOB_TABLE)[number]) => (vehicle === 'ray' ? r.ray : r.starex);
  return {
    vehicle,
    km,
    currentFromKm: current.fromKm,
    currentToKm: current.toKm,
    headroomKm: next ? Math.max(0, current.toKm - km) : null,
    nextTierDelta: next ? priceOf(next) - priceOf(current) : null,
  };
}

const won = (v: number) => `₩${Math.round(v).toLocaleString('ko-KR')}`;

/** 절감/안정성 제안 한 건. SavingsCoachCard가 렌더한다. */
export interface SavingsTip {
  id: string;
  message: string;
  /** positive=절감 가능, info=안정성/참고. */
  tone: 'positive' | 'info';
  /** 클릭 시 재견적 등 액션 라벨(선택). */
  cta?: string;
}

/**
 * 시나리오 견적 결과 기반 절감/안정성 제안을 만든다.
 * 단건(per-job) 요금제는 거리 구간 안정성 인사이트가 핵심이다.
 */
export function buildScenarioSavingsTips(result: ScenarioQuoteResult): SavingsTip[] {
  const tips: SavingsTip[] = [];
  const vehicle = toVehicleKey(result.vehicleType);
  const tier = analyzeDistanceTier(vehicle, result.metrics.km);

  if (tier && tier.headroomKm != null && tier.nextTierDelta != null && tier.nextTierDelta > 0) {
    const headroom = tier.headroomKm;
    if (headroom >= 1) {
      tips.push({
        id: 'distance-headroom',
        tone: 'info',
        message:
          `현재 ${tier.currentFromKm}~${tier.currentToKm}km 구간 운임이에요. ` +
          `다음 구간까지 ${headroom.toFixed(1)}km 여유가 있어 경로가 다소 늘어도 ` +
          `운임이 ${won(tier.nextTierDelta)} 이상 오르지 않아요.`,
      });
    } else {
      tips.push({
        id: 'distance-near-boundary',
        tone: 'info',
        message:
          `다음 거리 구간 경계(${tier.currentToKm}km)에 근접했어요. ` +
          `경로가 ${headroom.toFixed(1)}km만 늘어도 1회 운임이 ${won(tier.nextTierDelta)} 오를 수 있어요.`,
      });
    }
  }

  return tips;
}

/**
 * 시간제(hourly) 견적의 단가 절감 제안. `suggestCheaperNextTier`를 그대로 카드용으로 변환한다.
 * 단건 시나리오에는 해당하지 않으며, 시간제 견적 화면에서 사용한다.
 */
export function buildHourlySavingsTip(
  vehicle: PricingVehicle,
  billMinutes: number
): SavingsTip | null {
  const advice = suggestCheaperNextTier(vehicle, billMinutes);
  if (!advice) return null;
  return {
    id: 'hourly-tier',
    tone: 'positive',
    message: advice.message.replace(/^\u{1F4A1}\s*/u, ''),
    cta: '이 조건으로 재견적',
  };
}

/** 견적 신뢰도 등급. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceSignal {
  ok: boolean;
  label: string;
}

export interface QuoteConfidence {
  level: ConfidenceLevel;
  /** 0~100. */
  score: number;
  signals: ConfidenceSignal[];
}

export interface ConfidenceInput {
  /** 해당 시나리오의 경로 계산 실패 여부. */
  hasRouteError?: boolean;
  /** 실시간 교통 반영 여부. */
  realtimeTraffic?: boolean;
}

/**
 * 시나리오 견적의 신뢰도를 산정한다.
 * 경로 계산 성공, 차종/스케줄 확정, 정기 빈도 확정, 실시간 교통 반영을 신호로 사용한다.
 */
export function assessQuoteConfidence(
  result: ScenarioQuoteResult,
  input: ConfidenceInput = {}
): QuoteConfidence {
  const routeComputed = !input.hasRouteError && result.metrics.km > 0;
  const signals: ConfidenceSignal[] = [
    { ok: routeComputed, label: routeComputed ? '경로 거리·시간 산출 완료' : '경로 계산 실패(거리 미확정)' },
    { ok: true, label: `${result.vehicleType} · ${result.scheduleType === 'regular' ? '정기' : '비정기'} 확정` },
    {
      ok: Boolean(result.frequencyLabel),
      label: result.frequencyLabel ? `정기 빈도 확정 (${result.frequencyLabel})` : '연 운임은 빈도 가정값',
    },
    {
      ok: Boolean(input.realtimeTraffic),
      label: input.realtimeTraffic ? '실시간 교통 반영' : '실시간 교통 미반영(평균 소요)',
    },
  ];

  const score = Math.round((signals.filter((s) => s.ok).length / signals.length) * 100);
  const level: ConfidenceLevel = !routeComputed ? 'low' : score >= 75 ? 'high' : 'medium';
  return { level, score, signals };
}

const SORT_KEY_NOUN: Record<ComparisonSortKey, string> = {
  annualPrice: '연 비용',
  oneTimePrice: '1회 운임',
  km: '이동 거리',
  totalMinutes: '소요 시간',
};

/** 시나리오 비교 요약: 추천 근거 + 추천안 대비 절감액. */
export interface ComparisonSummary {
  /** 추천 근거 한 줄. */
  rationale: string | null;
  /** 라벨 → 추천안 대비 연 비용 추가액(원, >=0). 추천안은 0. */
  annualExtraByLabel: Record<string, number>;
  /** 막대 정규화를 위한 최대 추가액(원). */
  maxAnnualExtra: number;
}

/**
 * 비교 결과에서 추천 근거 문구와 "추천안 대비 각 시나리오가 연간 얼마 더 드는지"를 계산한다.
 * 화주에게 추천이 자의적이지 않음을 보여주기 위함.
 */
export function summarizeComparison(comparison: ScenarioComparison): ComparisonSummary {
  const { results, recommendedLabel, sortedBy } = comparison;
  const recommended = results.find((r) => r.label === recommendedLabel) ?? null;
  const annualExtraByLabel: Record<string, number> = {};
  let maxAnnualExtra = 0;

  if (recommended) {
    for (const r of results) {
      const extra = Math.max(0, r.annualPrice - recommended.annualPrice);
      annualExtraByLabel[r.label] = extra;
      if (extra > maxAnnualExtra) maxAnnualExtra = extra;
    }
  }

  let rationale: string | null = null;
  if (recommended) {
    const others = results.filter((r) => r.label !== recommended.label);
    const cheapestOther = others.reduce<ScenarioQuoteResult | null>((best, cur) => {
      if (!best) return cur;
      return cur.annualPrice < best.annualPrice ? cur : best;
    }, null);
    const noun = SORT_KEY_NOUN[sortedBy] ?? '연 비용';
    if (cheapestOther) {
      const gap = Math.max(0, cheapestOther.annualPrice - recommended.annualPrice);
      rationale =
        gap > 0
          ? `${noun} 최저 — 차순위(${cheapestOther.label}) 대비 연 ${won(gap)} 절감`
          : `${noun} 기준 가장 효율적인 구성`;
    } else {
      rationale = `${noun} 기준 추천`;
    }
  }

  return { rationale, annualExtraByLabel, maxAnnualExtra };
}

/** 도착 시간 신뢰 밴드. 단일 ETA 대신 구간 + 정시 도착 확률을 제시한다. */
export interface EtaBand {
  /** 예상 소요(분, 주행+체류). */
  expectedMinutes: number;
  /** 신뢰 구간 하한(분). */
  lowerMinutes: number;
  /** 신뢰 구간 상한(분). */
  upperMinutes: number;
  /** ± 마진(분). */
  marginMinutes: number;
  /** 정시 도착 확률 추정(%). */
  onTimeProbability: number;
  realtimeTraffic: boolean;
}

/**
 * 경로 메트릭으로 도착 시간 신뢰 밴드를 만든다.
 * 실시간 교통을 반영하면 마진을 좁히고 정시 확률을 높인다(PRD: ETA 오차 ±5분 90% 목표).
 * 마진은 주행 시간에 비례하되 최소값을 둔다(짧은 경로의 과신 방지).
 */
export function buildEtaBand(
  metrics: RouteMetrics,
  opts: { realtimeTraffic?: boolean } = {}
): EtaBand | null {
  const expectedMinutes = Math.round(metrics.driveMinutes + metrics.dwellMinutes);
  if (!(expectedMinutes > 0)) return null;

  const realtimeTraffic = Boolean(opts.realtimeTraffic);
  const ratio = realtimeTraffic ? 0.08 : 0.15;
  const floor = realtimeTraffic ? 5 : 10;
  const marginMinutes = Math.max(floor, Math.round(metrics.driveMinutes * ratio));

  return {
    expectedMinutes,
    lowerMinutes: Math.max(0, expectedMinutes - marginMinutes),
    upperMinutes: expectedMinutes + marginMinutes,
    marginMinutes,
    onTimeProbability: realtimeTraffic ? 90 : 75,
    realtimeTraffic,
  };
}

/** 운임 vs 실비 투명성. "청구 운임에 유류·통행료 포함, 숨은 추가비 없음"을 보여준다. */
export interface CostTransparency {
  /** 청구 1회 운임(원). 모를 경우 null(투명성 안내만 표시). */
  chargedOneTime: number | null;
  /** 참고: 예상 유류비(원, 청구에 포함). */
  estimatedFuel: number;
  /** 참고: 예상 통행료(원, 청구에 포함). */
  estimatedToll: number;
  /** 안내 문구. */
  includedNote: string;
}

/**
 * 차종·거리(·선택적 청구액)로 실비(예상 유류비·통행료)를 추정해 투명성 데이터를 만든다.
 * 실비 수치는 참고용이며 청구 운임에 이미 포함된다(별도 청구 없음).
 */
export function buildCostTransparencyFrom(
  vehicle: PricingVehicle,
  km: number,
  chargedOneTime?: number
): CostTransparency | null {
  if (!(km > 0)) return null;
  return {
    chargedOneTime: Number.isFinite(chargedOneTime) ? Number(chargedOneTime) : null,
    estimatedFuel: estimatedFuelCost(vehicle, km),
    estimatedToll: highwayTollCost(km),
    includedNote: '청구 운임에 유류비·통행료가 포함되어 별도 추가 청구가 없어요.',
  };
}

/** 시나리오 견적 결과로 투명성 데이터를 만든다(원시값 빌더 위임). */
export function buildCostTransparency(result: ScenarioQuoteResult): CostTransparency | null {
  return buildCostTransparencyFrom(
    toVehicleKey(result.vehicleType),
    result.metrics.km,
    result.oneTimePrice
  );
}
