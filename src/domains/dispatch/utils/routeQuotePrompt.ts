/**
 * 지도에 표시된 현재 경로를 견적챗 프롬프트(자연어)로 직렬화한다.
 * 지도 결과 오버레이와 커맨드 독의 "이 경로로 견적" CTA가 공용으로 사용한다.
 */
export interface RouteQuotePromptInput {
  vehicleType?: string | null;
  originAddress?: string | null;
  destinationAddresses?: Array<string | null | undefined>;
  totalDistanceMeters?: number | null;
  totalTimeSeconds?: number | null;
}

export function buildRouteQuotePrompt(input: RouteQuotePromptInput): string {
  const { vehicleType, originAddress, destinationAddresses, totalDistanceMeters, totalTimeSeconds } = input;

  const km = Number.isFinite(totalDistanceMeters as number)
    ? ((totalDistanceMeters as number) / 1000).toFixed(1)
    : null;
  const min = Number.isFinite(totalTimeSeconds as number)
    ? Math.ceil((totalTimeSeconds as number) / 60)
    : null;

  const origin = originAddress?.trim();
  const dests = (destinationAddresses || [])
    .map((d) => d?.trim())
    .filter(Boolean) as string[];

  const lines: string[] = ['지금 지도에 표시된 경로 그대로 견적을 내줘.'];
  lines.push(`- 차량: ${vehicleType || '레이'}`);
  if (origin) lines.push(`- 출발지: ${origin}`);
  if (dests.length) lines.push(`- 도착/경유지: ${dests.join(' → ')}`);
  if (km || min) lines.push(`- 참고(현재 최적화 결과): 총거리 ${km ?? '?'}km, 예상 ${min ?? '?'}분`);
  lines.push('요금제별로 비교하고 추천안도 함께 제시해줘.');
  return lines.join('\n');
}

export interface MapRouteContext {
  source: 'map';
  vehicleType: string;
  origin: string | null;
  /** 지도에 확정된 도착/경유지 주소(표시 순서). 토씨 그대로 사용해야 한다. */
  stops: string[];
  totalDistanceKm: number | null;
  totalTimeMin: number | null;
}

/**
 * 지도 경로를 자연어 프롬프트와 함께 전달할 "권위 있는 구조화 컨텍스트"로 직렬화한다.
 * 에이전트가 NL을 재파싱/재지오코딩하며 주소를 훼손하지 않도록, 확정 주소를 그대로 넘긴다.
 */
export function buildRouteQuoteContext(input: RouteQuotePromptInput): MapRouteContext {
  const { vehicleType, originAddress, destinationAddresses, totalDistanceMeters, totalTimeSeconds } = input;
  const origin = originAddress?.trim() || null;
  const stops = (destinationAddresses || []).map((d) => d?.trim()).filter(Boolean) as string[];
  return {
    source: 'map',
    vehicleType: vehicleType || '레이',
    origin,
    stops,
    totalDistanceKm: Number.isFinite(totalDistanceMeters as number)
      ? Math.round(((totalDistanceMeters as number) / 1000) * 10) / 10
      : null,
    totalTimeMin: Number.isFinite(totalTimeSeconds as number)
      ? Math.ceil((totalTimeSeconds as number) / 60)
      : null,
  };
}
