/**
 * 유가 제공 서비스 — 한국석유공사 오피넷(Opinet) 전국 평균 판매가 연동.
 *
 * 우선순위:
 *   1) FUEL_PRICE_PER_LITER 환경변수(운영팀 수동 고정값) — 지정 시 그대로 사용
 *   2) OPINET_API_KEY 가 있으면 오피넷 라이브 유가(유종별, TTL 캐시)
 *   3) 둘 다 없으면 pricing.ts 기본값
 *
 * 유종 매핑: 레이=휘발유(B027), 스타렉스=자동차경유(D047).
 * 유가는 일 단위로 갱신되므로 호출 비용 절감을 위해 6시간 TTL 캐시한다.
 * (도메인 룰 §3: 외부 API 동일 입력 반복 호출 차단)
 */

import { DEFAULT_FUEL_PRICE_PER_LITER, type Vehicle } from '@/domains/quote/pricing';

export type FuelPriceSource = 'manual' | 'opinet' | 'default';

export interface FuelPriceResult {
  pricePerLiter: number;
  source: FuelPriceSource;
  /** 오피넷 기준 거래일(YYYYMMDD). 라이브일 때만. */
  tradeDate?: string;
}

// 오피넷 제품구분코드(PRODCD)
const PRODCD_BY_VEHICLE: Record<Vehicle, string> = {
  ray: 'B027', // 보통휘발유
  starex: 'D047', // 자동차경유
};

const OPINET_ENDPOINT = 'https://www.opinet.co.kr/api/avgAllPrice.do';
const TTL_MS = 6 * 60 * 60 * 1000; // 6시간

type OpinetCache = {
  at: number;
  pricesByProdcd: Record<string, number>;
  tradeDate?: string;
};

let opinetCache: OpinetCache | null = null;
let inflight: Promise<OpinetCache | null> | null = null;

function manualOverride(): number | null {
  const v = Number(process.env.FUEL_PRICE_PER_LITER);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 오피넷 전국 평균가를 1회 조회해 제품코드별 가격 맵으로 캐시한다(실패 시 null). */
async function fetchOpinet(): Promise<OpinetCache | null> {
  const key = process.env.OPINET_API_KEY;
  if (!key) return null;

  const now = Date.now();
  if (opinetCache && now - opinetCache.at < TTL_MS) return opinetCache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const url = `${OPINET_ENDPOINT}?out=json&code=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return opinetCache; // 실패 시 직전 캐시(있으면) 유지
      const json: any = await res.json();
      const oils: any[] = Array.isArray(json?.RESULT?.OIL) ? json.RESULT.OIL : [];
      if (!oils.length) return opinetCache;

      const pricesByProdcd: Record<string, number> = {};
      let tradeDate: string | undefined;
      for (const oil of oils) {
        const prodcd = String(oil?.PRODCD || '').trim();
        const price = Number(oil?.PRICE);
        if (prodcd && Number.isFinite(price) && price > 0) {
          pricesByProdcd[prodcd] = price;
          if (!tradeDate && oil?.TRADE_DT) tradeDate = String(oil.TRADE_DT);
        }
      }
      if (!Object.keys(pricesByProdcd).length) return opinetCache;

      opinetCache = { at: Date.now(), pricesByProdcd, tradeDate };
      return opinetCache;
    } catch {
      return opinetCache; // 네트워크/타임아웃 실패는 직전 캐시 또는 null
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * 차종에 맞는 현재 유가(L당 원)를 반환한다. 항상 사용 가능한 값을 돌려준다(폴백 보장).
 */
export async function getFuelPricePerLiter(vehicle: Vehicle): Promise<FuelPriceResult> {
  const manual = manualOverride();
  if (manual != null) {
    return { pricePerLiter: manual, source: 'manual' };
  }

  const cache = await fetchOpinet();
  if (cache) {
    const price = cache.pricesByProdcd[PRODCD_BY_VEHICLE[vehicle]];
    if (Number.isFinite(price) && price > 0) {
      return { pricePerLiter: price, source: 'opinet', tradeDate: cache.tradeDate };
    }
  }

  return { pricePerLiter: DEFAULT_FUEL_PRICE_PER_LITER, source: 'default' };
}
