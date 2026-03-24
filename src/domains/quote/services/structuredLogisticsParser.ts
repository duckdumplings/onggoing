import type { ExtractedQuoteInfo } from '@/domains/quote/types/quoteExtraction';

/**
 * "상차지 / 주소 / 반납지" 등 라벨형 메모를 규칙으로 파싱해
 * LLM·이전 세션과 섞인 잘못된 주소를 덮어쓸 때 사용한다.
 */

function firstLineValue(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m?.[1]?.trim().replace(/\s+/g, ' ') || null;
}

/** 도로명 위주로 지오코딩이 잘 되도록 최소 정규화 */
export function normalizeKoreanStreetLine(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return s;
  s = s.replace(/(로|길|대로)(\d)/g, '$1 $2');
  // 앞에 상호/설명 텍스트가 붙은 경우, 지역 토큰(시/구/군)부터 보존해 잘라낸다.
  // 도로 체계를 축약하지 않기 위해 "반포대로 21길 17" 같은 후속 구간은 그대로 유지한다.
  const regionStart = s.search(/(?:서울(?:특별시|시)?|경기|인천|부산|대구|광주|대전|울산|세종|[가-힣0-9]{2,6}(?:시|구|군))\s/);
  if (regionStart > 0) {
    s = s.slice(regionStart).trim();
  }
  if (
    /^(서초|강남|송파|양천|구로|마포|종로|영등포|동작|관악|서대문|은평|노원|강북|성북|동대문|중랑|광진|성동|강동|강서|금천|중구|용산)구\s/.test(s) &&
    !/^(서울|경기|인천|부산|대구|광주|대전|울산|세종)/.test(s)
  ) {
    return `서울특별시 ${s}`;
  }
  if (/^가마산로\s/.test(s) && !/^(서울|경기)/.test(s)) {
    return `서울특별시 구로구 ${s}`;
  }
  return s;
}

function canonicalAddressKey(raw: string): string {
  let s = normalizeKoreanStreetLine(raw)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\s*층\b/g, ' ')
    .replace(/\b\d+\s*호\b/g, ' ')
    .replace(/\b(?:msmr|아란의원|하루반상|나이스\s*샐러드|주식회사\s*그래픽)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^서울\s/, '서울특별시 ');
  s = s.replace(/\b(\d+)\s*길\s*(\d+)\b/g, '$1길 $2');
  s = s.replace(/\b(\d+)\s*가길\s*(\d+)\b/g, '$1가길 $2');
  return s;
}

function looksLikeAddressText(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/두\s*곳|가방|동일|시범운영|정규계약|주\d+회/i.test(s)) return false;
  const hasRoad = /(?:로|길|대로)\s*\d+(?:-\d+)?/.test(s);
  const hasLot = /[가-힣0-9]+동\s*\d+(?:-\d+)?/.test(s);
  const hasRegion = /(?:서울|경기|인천|부산|대구|광주|대전|울산|세종|[가-힣]{2,4}(?:시|구|군))/.test(s);
  return (hasRoad || hasLot) && hasRegion;
}

function extractAddressCandidatesFromText(text: string): string[] {
  const candidates: string[] = [];
  const parts = text.split(/\n|\t/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (!looksLikeAddressText(part)) continue;
    const normalized = normalizeKoreanStreetLine(part);
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  }
  return candidates;
}

function extractAddressTokens(line: string): string[] {
  const roadRe = /(?:(?:서울(?:특별시)?|경기|인천|부산|대구|광주|대전|울산|세종)\s+)?(?:[가-힣0-9]+(?:시|구|군)\s+)?[가-힣0-9\s-]*(?:로|길|대로)\s*\d+(?:-\d+)?(?:\s*[가-힣0-9층호동-]*)?/g;
  const lotRe = /(?:(?:서울(?:특별시)?|경기|인천|부산|대구|광주|대전|울산|세종)\s+)?(?:[가-힣0-9]+(?:시|구|군)\s+)?[가-힣0-9]+동\s*\d+(?:-\d+)?/g;
  const matches = [...(line.match(roadRe) || []), ...(line.match(lotRe) || [])];
  return matches
    .map((m) => normalizeKoreanStreetLine(m))
    .filter((m) => looksLikeAddressText(m));
}

function extractTimesFromLine(line: string): string[] {
  const times = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g) || [];
  return times.map((t) => {
    const [h, m] = t.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
}

function addressCoreKey(raw: string): string {
  const normalized = canonicalAddressKey(raw).replace(/^서울특별시\s+/, '').replace(/^서울\s+/, '');
  const road = normalized.match(/(.+?(?:로|길|대로)\s*\d+(?:-\d+)?(?:\s*(?:길|로|대로)\s*\d+(?:-\d+)?)?)/);
  if (road?.[1]) return road[1].trim();
  const lot = normalized.match(/(.+?동\s*\d+(?:-\d+)?)/);
  return (lot?.[1] || normalized).trim();
}

function parseTabularScheduleHints(text: string): {
  pickups: string[];
  deliveries: string[];
  returns: string[];
} {
  const pickups: string[] = [];
  const deliveries: string[] = [];
  const returns: string[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const pushUnique = (arr: string[], value: string) => {
    if (!arr.includes(value)) arr.push(value);
  };

  for (const line of lines) {
    const tokens = extractAddressTokens(line);
    if (tokens.length === 0) continue;

    const hasReturnHint = /\[회수\]|반납|복귀|수거/i.test(line);
    const hasPickupHint = /상차|출발|픽업/i.test(line);
    const hasDeliveryHint = /배송|하차|도착|경유/i.test(line);

    if (tokens.length >= 2) {
      const pickup = tokens[0];
      const drop = tokens[1];
      if (hasReturnHint) {
        pushUnique(pickups, pickup);
        pushUnique(returns, drop);
        continue;
      }
      if (hasPickupHint || hasDeliveryHint || /\t| {2,}/.test(line)) {
        pushUnique(pickups, pickup);
        pushUnique(deliveries, drop);
        continue;
      }
    }

    const single = tokens[0];
    if (hasReturnHint) {
      pushUnique(returns, single);
    } else if (hasPickupHint) {
      pushUnique(pickups, single);
    } else if (hasDeliveryHint) {
      pushUnique(deliveries, single);
    }
  }

  return { pickups, deliveries, returns };
}

/**
 * 라벨이 둘 이상이면 스펙을 새로 쓴 것으로 보고 route 슬롯을 통째로 교체한다.
 */
export function parseStructuredLogisticsMemo(text: string): {
  extracted: Partial<ExtractedQuoteInfo>;
  replaceRoute: boolean;
} | null {
  const t = text.trim();
  if (t.length < 12) return null;

  // 정규식으로 복수 매칭이 가능하도록 변경 (g 플래그 없는 match는 첫번째만 찾음, 여기서는 여러 상차지를 잡기 위해 matchAll 사용 고려, 그러나 일단 간단하게)
  const pickupMatches = [...t.matchAll(/(?:^|\n)\s*(?:상차지|상차|출발지|출발|픽업|상차장)\s*[:：]\s*(.+?)(?=\n|$)/gim)];
  const deliveryMatches = [...t.matchAll(/(?:^|\n)\s*(?:배송지|하차지|목적지|방문지|주소|경유지)\s*[:：]\s*(.+?)(?=\n|$)/gim)];
  const returnMatches = [...t.matchAll(/(?:^|\n)\s*(?:반납지|반납|회수품\s*반납|수거품\s*반납|복귀지)\s*[:：]\s*(.+?)(?=\n|$)/gim)];

  const destinations: Array<{ address: string }> = [];
  let originAddress: string | null = null;
  const pickupTimeByAddress = new Map<string, string>();
  const deliveryTimeByAddress = new Map<string, string>();

  const add = (raw: string | null) => {
    if (!raw) return;
    const line = normalizeKoreanStreetLine(raw);
    const key = canonicalAddressKey(line);
    if (!destinations.some((d) => canonicalAddressKey(d.address) === key)) {
      destinations.push({ address: line });
    }
  };

  // 상차지가 여러 개일 경우, 유효한 첫 상차지를 origin에 넣고, 나머지는 destinations 앞에 추가
  if (pickupMatches.length > 0) {
    const normalizedPickups = pickupMatches
      .map((m) => normalizeKoreanStreetLine(m[1]))
      .filter((p) => looksLikeAddressText(p));
    if (normalizedPickups.length > 0) {
      originAddress = normalizedPickups[0];
      for (let i = 1; i < normalizedPickups.length; i++) {
        add(normalizedPickups[i]);
      }
    }
  }

  // 배송지 추가
  for (const m of deliveryMatches) {
    add(m[1]);
  }

  // 반납지 추가
  for (const m of returnMatches) {
    add(m[1]);
  }

  // 표 형태(탭/다중 공백) 스케줄 라인이 들어와도 자동 인식
  const tabularHints = parseTabularScheduleHints(t);
  if (!originAddress && tabularHints.pickups.length > 0) {
    originAddress = tabularHints.pickups[0];
    for (let i = 1; i < tabularHints.pickups.length; i++) {
      add(tabularHints.pickups[i]);
    }
  } else {
    for (const p of tabularHints.pickups) {
      if (canonicalAddressKey(p) !== canonicalAddressKey(originAddress || '')) add(p);
    }
  }
  for (const d of tabularHints.deliveries) add(d);
  for (const r of tabularHints.returns) add(r);

  // raw 표 라인에서 시간 힌트 추출: [상차주소, 배송주소]와 [상차시간, 배송시간]을 짝지어 저장
  const rawLines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of rawLines) {
    const addresses = extractAddressTokens(line);
    const times = extractTimesFromLine(line);
    if (addresses.length >= 2 && times.length >= 2) {
      const pickupKey = addressCoreKey(addresses[0]);
      const deliveryKey = addressCoreKey(addresses[1]);
      if (!pickupTimeByAddress.has(pickupKey)) pickupTimeByAddress.set(pickupKey, times[0]);
      if (!deliveryTimeByAddress.has(deliveryKey)) deliveryTimeByAddress.set(deliveryKey, times[1]);
      continue;
    }
    if (addresses.length >= 1 && times.length >= 1) {
      const key = addressCoreKey(addresses[0]);
      if (/\[회수\]|반납|복귀|수거/i.test(line)) {
        if (!deliveryTimeByAddress.has(key)) deliveryTimeByAddress.set(key, times[times.length - 1]);
      } else if (/(상차|출발|픽업)/.test(line)) {
        if (!pickupTimeByAddress.has(key)) pickupTimeByAddress.set(key, times[0]);
      } else if (/(배송|하차|도착|경유)/.test(line)) {
        if (!deliveryTimeByAddress.has(key)) deliveryTimeByAddress.set(key, times[times.length - 1]);
      }
    }
  }

  const labelCount = pickupMatches.length + deliveryMatches.length + returnMatches.length;

  // 상차 라벨은 있으나 주소가 메모성 문구(예: "두 곳(가정집과 동일)")였던 경우
  // 전체 텍스트에서 주소 후보를 추출해 origin/destination으로 보정
  if (!originAddress) {
    const addrCandidates = extractAddressCandidatesFromText(t);
    if (addrCandidates.length > 0) {
      originAddress = addrCandidates[0];
      for (let i = 1; i < addrCandidates.length; i++) {
        add(addrCandidates[i]);
      }
    }
  }

  if (!originAddress || destinations.length === 0) {
    return null;
  }

  const originKey = addressCoreKey(originAddress);
  const departureTime = pickupTimeByAddress.get(originKey);
  const destinationsWithTime = destinations.map((d) => {
    const key = addressCoreKey(d.address);
    const deliveryTime = deliveryTimeByAddress.get(key);
    return deliveryTime ? { ...d, deliveryTime } : d;
  });

  const extracted: Partial<ExtractedQuoteInfo> = {
    origin: { address: originAddress },
    destinations: destinationsWithTime,
    departureTime,
  };

  /** 상차+주소+반납 등 라벨이 2개 이상이면 이전 세션 경로와 병합하지 않음 */
  const replaceRoute = labelCount >= 2;

  return { extracted, replaceRoute };
}
