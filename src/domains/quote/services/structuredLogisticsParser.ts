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
  /** "위펀푸드 서초구 …" 처럼 앞에 상호가 있을 때만, 구~번지 구간만 남김 */
  const roadRe = /([가-힣]{2,4}(?:구|군|시)\s+.+?(?:로|길|대로)\s*\d+(?:-\d+)?)/;
  const roadMatch = roadRe.exec(s);
  if (roadMatch?.[1] && roadMatch.index !== undefined && roadMatch.index > 0) {
    s = roadMatch[1].trim();
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

/**
 * 라벨이 둘 이상이면 스펙을 새로 쓴 것으로 보고 route 슬롯을 통째로 교체한다.
 */
export function parseStructuredLogisticsMemo(text: string): {
  extracted: Partial<ExtractedQuoteInfo>;
  replaceRoute: boolean;
} | null {
  const t = text.trim();
  if (t.length < 12) return null;

  const pickup = firstLineValue(
    t,
    /(?:^|\n)\s*(?:상차지|상차|출발지|출발|픽업|상차장)\s*[:：]\s*(.+?)(?=\n|$)/im
  );
  const labeledAddress = firstLineValue(
    t,
    /(?:^|\n)\s*주소\s*[:：]\s*(.+?)(?=\n|$)/im
  );
  const returnAddr = firstLineValue(
    t,
    /(?:^|\n)\s*(?:반납지|반납|회수품\s*반납|수거품\s*반납|복귀지)\s*[:：]\s*(.+?)(?=\n|$)/im
  );
  const deliveryOnly = firstLineValue(
    t,
    /(?:^|\n)\s*(?:배송지|하차지|목적지|방문지)\s*[:：]\s*(.+?)(?=\n|$)/im
  );

  /** 일반적인 순서: 상차 → (주소/배송지) → 반납 */
  const destinations: Array<{ address: string }> = [];
  const add = (raw: string | null) => {
    if (!raw) return;
    const line = normalizeKoreanStreetLine(raw);
    if (!destinations.some((d) => d.address === line)) {
      destinations.push({ address: line });
    }
  };

  if (labeledAddress) add(labeledAddress);
  if (deliveryOnly && deliveryOnly !== labeledAddress) add(deliveryOnly);
  if (returnAddr) add(returnAddr);

  const labelCount = [pickup, labeledAddress, returnAddr, deliveryOnly].filter(Boolean).length;

  if (!pickup || destinations.length === 0) {
    return null;
  }

  const extracted: Partial<ExtractedQuoteInfo> = {
    origin: { address: normalizeKoreanStreetLine(pickup) },
    destinations,
  };

  /** 상차+주소+반납 등 라벨이 2개 이상이면 이전 세션 경로와 병합하지 않음 */
  const replaceRoute = labelCount >= 2;

  return { extracted, replaceRoute };
}
