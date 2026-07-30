const QUOTE_INTENT_RE = /견적|운임|요금|비용|계산|산출/;
const LINE_MARKER_RE =
  /(?:(?:[A-Z가-힣0-9][A-Z가-힣0-9 _-]{0,24})\s*라인|라인\s*[A-Z0-9가-힣]+)\s*[:：]/gim;
const NUMBERED_SECTION_RE = /(?:^|\n)\s*\d+[.)]\s+[^\n]{1,80}/gm;
const MULTI_REQUEST_RE =
  /동시|한꺼번에|일괄|(?:두|2개|여러|다수|복수)\s*(?:개의?\s*)?(?:배송\s*)?(?:라인|건|견적)/;

/**
 * 모델의 도구 선택에만 맡기면 다중 라인을 단일 경로로 쪼개는 경우가 있어,
 * 명시적인 2개 이상 라인 견적 요청을 결정론적으로 감지한다.
 */
export function shouldForceQuoteCaseBoard(message: string): boolean {
  const text = message.trim();
  if (!text || !QUOTE_INTENT_RE.test(text)) return false;

  const markers = text.match(LINE_MARKER_RE) ?? [];
  if (markers.length >= 2) return true;

  const numberedSections = text.match(NUMBERED_SECTION_RE) ?? [];
  return numberedSections.length >= 2 && MULTI_REQUEST_RE.test(text);
}
