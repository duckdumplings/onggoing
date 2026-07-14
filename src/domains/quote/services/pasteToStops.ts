/**
 * 붙여넣은 표/메모 텍스트 → 편집용 지점 초안 배열(순수 함수).
 *
 * 1) 우선 탭 구분 표를 직접 파싱한다. 한 줄에 탭 셀이 여러 개면 앞쪽 주소형 셀을 상차,
 *    다음 주소형 셀을 하차로 보고, 각 주소 뒤 근처의 HH:mm 토큰을 그 지점 deliveryTime,
 *    숫자/개수 토큰을 quantity 로 매핑한다.(휴리스틱)
 * 2) 탭 표가 아니면 parseStructuredLogisticsMemo 로 폴백해 origin/destinations 를 변환한다.
 * 3) 저신뢰(lowConfidence) 필드만 true 로 표시한다.
 *
 * DOM/next/React 의존이 없어 서버·클라이언트 어디서든 호출할 수 있다.
 */
import type { StopRole } from '@/domains/dispatch/types/routePlan';
import {
  normalizeKoreanStreetLine,
  parseStructuredLogisticsMemo,
} from '@/domains/quote/services/structuredLogisticsParser';

export interface ParsedStopDraft {
  address: string;
  role: StopRole; // 'pickup' | 'drop' | 'return' | 'waypoint'
  deliveryTime?: string; // 'HH:mm'
  quantity?: number;
  memo?: string;
  /** 저신뢰 필드만 true. */
  lowConfidence: { address?: boolean; role?: boolean; time?: boolean };
}

const RETURN_RE = /반납|회수|return/i;
const PICKUP_RE = /상차|출발|픽업|pickup/i;
const DROP_RE = /하차|배송|도착|drop/i;

/** 전화번호로 보이는 셀(숫자 9자리 이상 + 숫자/기호로만 구성) */
function isPhoneLike(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  return digits.length >= 9 && /^[\d()+\-\s]+$/.test(s.trim());
}

/** 도로명/지번/행정구역 패턴이 보이면 주소형 셀로 본다. */
function isAddressLike(s: string): boolean {
  const t = (s || '').trim();
  if (!t) return false;
  if (isPhoneLike(t)) return false;
  if (/(?:로|길|대로)\s*\d/.test(t)) return true; // 도로명 + 번호
  if (/[가-힣]+동\s*\d+(?:-\d+)?/.test(t)) return true; // 지번(동 + 번지)
  if (/\d+-\d+/.test(t) && /[가-힣]/.test(t) && /(?:동|리|가)/.test(t)) return true; // 지번 range
  if (/[가-힣]{1,}(?:특별시|광역시|시|구|군|동)\s/.test(t)) return true; // 구/동/시 단위 + 공백
  return false;
}

/** 숫자 없이 구/동/시 단위로만 보이거나 비었으면 저신뢰 주소. */
function isVagueAddress(addr: string): boolean {
  const t = (addr || '').trim();
  if (!t) return true;
  if (!/\d/.test(t) && /(?:구|동|읍|면|리|시|군)/.test(t)) return true;
  return false;
}

/** 셀 배열에서 첫 HH:mm 토큰을 찾아 'HH:mm' 로 정규화. */
function findTime(cells: string[]): string | undefined {
  for (const c of cells) {
    const m = c.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
    if (m) {
      const h = String(Number(m[1])).padStart(2, '0');
      return `${h}:${m[2]}`;
    }
  }
  return undefined;
}

/** 셀 배열에서 수량(숫자만/개수 토큰)을 찾는다. 시각·전화·지번은 제외. */
function findQuantity(cells: string[]): number | undefined {
  for (const c of cells) {
    const s = c.trim();
    if (!s || s.includes(':') || s.includes('-')) continue;
    const m = s.match(/^(\d{1,4})\s*(?:개|박스|박|건|팩|봉|ea|box)?$/i);
    if (m) {
      const n = Number(m[1]);
      if (n > 0 && n <= 9999) return n;
    }
  }
  return undefined;
}

/** 탭 표(한 줄에 탭 셀 2개 이상 + 주소형 셀 존재)가 하나라도 있는지. */
function hasTabTable(lines: string[]): boolean {
  return lines.some((l) => {
    if (!l.includes('\t') || !l.trim()) return false;
    const cells = l.split('\t');
    if (cells.length < 2) return false;
    return cells.some((c) => isAddressLike(c));
  });
}

function parseTabTable(lines: string[]): ParsedStopDraft[] {
  const drafts: ParsedStopDraft[] = [];

  for (const line of lines) {
    if (!line.trim()) continue; // 빈 줄 건너뜀
    const cells = line.split('\t').map((c) => c.trim());
    if (cells.length < 2) continue; // 탭 표 행이 아니면 건너뜀

    const addrIdxs = cells.map((c, i) => (isAddressLike(c) ? i : -1)).filter((i) => i >= 0);
    if (addrIdxs.length === 0) continue; // 헤더/주소 없는 줄 건너뜀

    for (let k = 0; k < addrIdxs.length; k++) {
      const idx = addrIdxs[k];
      const nextIdx = k + 1 < addrIdxs.length ? addrIdxs[k + 1] : cells.length;
      const segment = cells.slice(idx, nextIdx); // 이 주소 ~ 다음 주소 직전

      const address = normalizeKoreanStreetLine(cells[idx]);
      const deliveryTime = findTime(segment);
      const quantity = findQuantity(segment);

      // 주소 바로 앞 셀을 상호/라벨(memo)로 취급 (전화/숫자/시각 제외)
      let memo: string | undefined;
      if (idx > 0) {
        const prev = cells[idx - 1];
        if (
          prev &&
          !isAddressLike(prev) &&
          !isPhoneLike(prev) &&
          !prev.includes(':') &&
          !/^\d+$/.test(prev)
        ) {
          memo = prev;
        }
      }

      // 역할: 키워드가 있으면 키워드 기준, 없으면 위치(첫 주소=상차, 이후=하차) 기준.
      const scanText = [memo ?? '', ...segment].join(' ');
      let role: StopRole;
      let roleByPositionOnly = false;
      if (RETURN_RE.test(scanText)) role = 'return';
      else if (PICKUP_RE.test(scanText)) role = 'pickup';
      else if (DROP_RE.test(scanText)) role = 'drop';
      else {
        role = k === 0 ? 'pickup' : 'drop';
        roleByPositionOnly = true;
      }

      const lowConfidence: ParsedStopDraft['lowConfidence'] = {};
      if (isVagueAddress(address)) lowConfidence.address = true;
      if (roleByPositionOnly) lowConfidence.role = true;
      // 상차 시각은 준비시각이라 마감 아님 → 없어도 time 저신뢰로 두지 않는다.
      if (!deliveryTime && role !== 'pickup') lowConfidence.time = true;

      const draft: ParsedStopDraft = { address, role, lowConfidence };
      if (deliveryTime) draft.deliveryTime = deliveryTime;
      if (quantity !== undefined) draft.quantity = quantity;
      if (memo) draft.memo = memo;
      drafts.push(draft);
    }
  }

  return drafts;
}

function fromStructuredMemo(text: string): ParsedStopDraft[] {
  const parsed = parseStructuredLogisticsMemo(text);
  if (!parsed) return [];

  const drafts: ParsedStopDraft[] = [];
  const origin = parsed.extracted.origin;
  const destinations = (parsed.extracted.destinations || []) as Array<{
    address: string;
    deliveryTime?: string;
  }>;
  const departureTime = parsed.extracted.departureTime;

  if (origin?.address) {
    const address = normalizeKoreanStreetLine(origin.address);
    const lowConfidence: ParsedStopDraft['lowConfidence'] = {};
    if (isVagueAddress(address)) lowConfidence.address = true;
    // 라벨(상차지)로 역할이 정해졌으므로 role 저신뢰 아님.
    // 상차 시각은 준비시각이라 없어도 time 저신뢰 아님.
    const draft: ParsedStopDraft = { address, role: 'pickup', lowConfidence };
    if (departureTime) draft.deliveryTime = departureTime;
    drafts.push(draft);
  }

  for (const dest of destinations) {
    if (!dest?.address) continue;
    const address = normalizeKoreanStreetLine(dest.address);
    const deliveryTime = dest.deliveryTime;
    const lowConfidence: ParsedStopDraft['lowConfidence'] = {};
    if (isVagueAddress(address)) lowConfidence.address = true;
    if (!deliveryTime) lowConfidence.time = true; // 하차 마감이 없으면 저신뢰
    const draft: ParsedStopDraft = { address, role: 'drop', lowConfidence };
    if (deliveryTime) draft.deliveryTime = deliveryTime;
    drafts.push(draft);
  }

  return drafts;
}

export function parsePastedStops(text: string): ParsedStopDraft[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/);

  if (hasTabTable(lines)) {
    const drafts = parseTabTable(lines);
    if (drafts.length > 0) return drafts;
  }

  return fromStructuredMemo(text);
}
