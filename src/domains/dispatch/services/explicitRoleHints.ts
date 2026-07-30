import type { RouteStop, StopOperation } from '@/domains/dispatch/types/routePlan';

const RETURN_BEFORE_RE =
  /(?:반납(?:지|처|장소)?|복귀)\s*[:：]?\s*(?:[가-힣0-9]+(?:시|도|군|구|읍|면|동|리)?\s*){0,3}$/;
const RETURN_AFTER_RE = /^\s*(?:반납(?:지|처|장소)?|복귀)/;
const ROAD_ANCHOR_RE = /([가-힣A-Za-z0-9]+(?:로|길)\s*\d+(?:-\d+)?)/;

function compact(value: string): string {
  return value.replace(/[ \t]+/g, ' ').trim();
}

function addressAnchor(address: string): string {
  return compact(address).match(ROAD_ANCHOR_RE)?.[1] ?? compact(address);
}

function hasReturnHint(sourceText: string, address: string): boolean {
  const source = compact(sourceText);
  const anchor = addressAnchor(address);
  if (!anchor) return false;
  let cursor = source.indexOf(anchor);
  while (cursor >= 0) {
    const leftBoundaries = [
      source.lastIndexOf('\n', cursor),
      source.lastIndexOf('→', cursor),
      source.lastIndexOf('->', cursor),
      source.lastIndexOf(';', cursor),
    ];
    const clauseStart = Math.max(...leftBoundaries) + 1;
    const rightBoundaries = [
      source.indexOf('\n', cursor + anchor.length),
      source.indexOf('→', cursor + anchor.length),
      source.indexOf('->', cursor + anchor.length),
      source.indexOf(';', cursor + anchor.length),
    ].filter((index) => index >= 0);
    const clauseEnd = rightBoundaries.length ? Math.min(...rightBoundaries) : source.length;
    const before = source.slice(Math.max(clauseStart, cursor - 36), cursor);
    const after = source.slice(
      cursor + anchor.length,
      Math.min(clauseEnd, cursor + anchor.length + 16),
    );
    if (RETURN_BEFORE_RE.test(before) || RETURN_AFTER_RE.test(after)) return true;
    cursor = source.indexOf(anchor, cursor + anchor.length);
  }
  return false;
}

/**
 * 사용자 원문이 주소를 "반납/복귀"로 명시했는데 모델이 drop으로 태깅한 경우를 보정한다.
 * 일반 "수거"는 배송지 복합 작업일 수 있으므로 반납 힌트로 사용하지 않는다.
 */
export function applyExplicitReturnHints(
  stops: RouteStop[],
  sourceText?: string,
): RouteStop[] {
  if (!sourceText?.trim()) return stops;
  return stops.map((stop) => {
    if (!hasReturnHint(sourceText, stop.address)) return stop;
    const operations: StopOperation[] = (stop.operations ?? [])
      .filter((operation) => operation.type !== 'drop')
      .map((operation) => ({ ...operation }));
    if (!operations.some((operation) => operation.type === 'return')) {
      operations.push({
        type: 'return',
        quantity: stop.quantity,
        weightKg: stop.weightKg,
      });
    }
    return {
      ...stop,
      role: 'return',
      operations,
    };
  });
}
