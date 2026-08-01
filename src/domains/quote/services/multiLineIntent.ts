const QUOTE_INTENT_RE = /견적|운임|요금|비용|계산|산출/;
const LINE_MARKER_RE =
  /(?:(?:[A-Z가-힣0-9][A-Z가-힣0-9 _-]{0,24})\s*라인|라인\s*[A-Z0-9가-힣]+)\s*[:：]/gim;
const NUMBERED_SECTION_RE = /(?:^|\n)\s*\d+[.)]\s+[^\n]{1,80}/gm;
const MULTI_REQUEST_RE =
  /동시|한꺼번에|일괄|(?:두|2개|여러|다수|복수)\s*(?:개의?\s*)?(?:배송\s*)?(?:라인|건|견적)/;
const LOGISTICS_OPERATION_RE = /상차|픽업|수거|배송|하차|반납|경유/;
const ROUTE_SHAPE_RE = /→|->|주소\s*[:：]|(?:로|길|대로|번길)\s*\d*/;
const CLOCK_RE = /(?:^|[^\d])((?:[01]?\d|2[0-3]):[0-5]\d)(?!\d)/g;
const EXPLICIT_TIME_MEANING_RE =
  /까지|마감|완료|준비|시작|출발|도착\s*(?:마감|완료|전)|예약|정시|이전|이후/;

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

function hasIndependentRouteLines(text: string): boolean {
  const namedLines = text.match(LINE_MARKER_RE) ?? [];
  const numberedSections = text.match(NUMBERED_SECTION_RE) ?? [];
  if (namedLines.length < 2 && numberedSections.length < 2) return false;

  const routeEvidence = text
    .split(/\n+/)
    .filter((line) => LOGISTICS_OPERATION_RE.test(line) && ROUTE_SHAPE_RE.test(line));
  return routeEvidence.length >= 2;
}

/**
 * 계산 전에 사람이 구조화 입력을 확인해야 하는 요청만 선별한다.
 *
 * - 독립 배송라인이 2개 이상이면 라인 병합 오류를 막기 위해 확인한다.
 * - "10:00 상차", "11:40 배송"처럼 시각의 의미가 시작/마감/예약 중 무엇인지
 *   명시되지 않은 경우만 확인한다.
 * - 단순 가능 여부 질문과 의미가 이미 분명한 단일 견적은 즉시 계산한다.
 */
export function shouldConfirmQuoteInput(message: string): boolean {
  const text = message.trim();
  if (!text || text.length < 8) return false;
  if (shouldForceQuoteCaseBoard(text) || hasIndependentRouteLines(text)) return true;
  if (!LOGISTICS_OPERATION_RE.test(text) || !ROUTE_SHAPE_RE.test(text)) return false;

  for (const match of text.matchAll(CLOCK_RE)) {
    const clock = match[1];
    const clockOffset = match.index == null ? 0 : match.index + match[0].indexOf(clock);
    const context = text.slice(
      Math.max(0, clockOffset - 18),
      Math.min(text.length, clockOffset + clock.length + 28),
    );
    if (
      LOGISTICS_OPERATION_RE.test(context) &&
      !EXPLICIT_TIME_MEANING_RE.test(context)
    ) {
      return true;
    }
  }
  return false;
}
