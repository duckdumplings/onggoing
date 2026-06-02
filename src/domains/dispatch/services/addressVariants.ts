// 주소 문자열 정규화/변형 — 지오코딩 재시도 쿼리와 사용자 노출 힌트 생성.
// 순수 문자열 함수만 모은다(네트워크/모듈 상태 의존 없음). route-optimization 핸들러에서 분리.

/** "브랜드명 ○○구 도로명 번지" 형태에서 행정구역+도로명 코어를 뽑고, 서울 접두 변형을 더한다. */
export function stripLeadingBrandToDistrictRoadVariants(raw: string): string[] {
  const t = raw.trim().replace(/\s+/g, ' ');
  const out: string[] = [];
  const push = (s: string) => {
    const x = s.trim();
    if (x && !out.includes(x)) out.push(x);
  };
  const m = t.match(
    /([가-힣]{2,4}(?:구|군|시)\s+.+?(?:로|길|대로)\s*\d+(?:-\d+)?)/
  );
  if (m?.[1]) {
    const core = m[1].trim();
    push(core);
    if (!/^(서울|경기|인천|부산|대구|광주|대전|울산|세종)/.test(core)) {
      push(`서울특별시 ${core}`);
      push(`서울 ${core}`);
    }
  }
  return out;
}

/** 지오코딩 재시도용 쿼리 변형 목록(표준화/접두 제거/도로명 코어/오타 교정 등). */
export function buildGeocodeQueryVariants(raw: string): string[] {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return [];
  const out: string[] = [];
  const push = (s: string) => {
    const x = s.trim();
    if (x && !out.includes(x)) out.push(x);
  };
  push(t);
  // "서울시" 표기를 "서울특별시"로 표준화
  const normalizedSeoul = t.replace(/^서울시\s+/, '서울특별시 ');
  if (normalizedSeoul !== t) push(normalizedSeoul);
  // 광역시/도 접두를 제거한 코어 주소도 시도 (예: "서울특별시 서초구 ..." -> "서초구 ...")
  const noMetroPrefix = t.replace(/^(서울특별시|서울시|서울|경기도|경기|인천|부산|대구|광주|대전|울산|세종)\s+/, '');
  if (noMetroPrefix !== t) push(noMetroPrefix);
  // 도로명+번지 코어 우선 추출: "서울특별시 금천구 가마산로 96 대륭테크노타운" -> "서울특별시 금천구 가마산로 96"
  const roadCore = t.match(/^(.*?(?:로|길|대로)\s*\d+(?:-\d+)?)/)?.[1]?.trim();
  if (roadCore && roadCore !== t) push(roadCore);
  // "반포대로 21길 17" -> "반포대로21길 17" 형태 보정
  const mergedRoadSubroad = t.replace(/(대로|로|길)\s*(\d+)\s*길\s*(\d+)/g, '$1$2길 $3');
  if (mergedRoadSubroad !== t) push(mergedRoadSubroad);
  // "1충" 오타를 "1층"으로 교정해 재시도
  const typoFloorFixed = t.replace(/(\d+)\s*충\b/g, '$1층');
  if (typoFloorFixed !== t) push(typoFloorFixed);
  // "성수일로10" 같이 도로명과 번지가 붙은 표기를 분리해 재시도
  const roadNumberSpaced = t.replace(/(로|길|대로)(\d)/g, '$1 $2');
  if (roadNumberSpaced !== t) push(roadNumberSpaced);
  // "회나무로 13가길 64" -> "회나무로13가길 64" 형태 보정
  const mergedGaGil = t.replace(/(로)\s*(\d+)\s*가길\s*(\d+)/g, '$1$2가길 $3');
  if (mergedGaGil !== t) push(mergedGaGil);
  // 층/호/동 상세 제거 버전도 재시도
  const strippedUnit = t
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:지하\s*)?\d+\s*(?:층|충)\b/g, ' ')
    .replace(/\b\d+\s*호\b/g, ' ')
    .replace(/\b\d+\s*동\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (strippedUnit && strippedUnit !== t) push(strippedUnit);
  const strippedUnitNoMetroPrefix = strippedUnit.replace(/^(서울특별시|서울시|서울|경기도|경기|인천|부산|대구|광주|대전|울산|세종)\s+/, '');
  if (strippedUnitNoMetroPrefix && strippedUnitNoMetroPrefix !== strippedUnit) push(strippedUnitNoMetroPrefix);
  const strippedUnitMergedRoadSubroad = strippedUnit.replace(/(대로|로|길)\s*(\d+)\s*길\s*(\d+)/g, '$1$2길 $3');
  if (strippedUnitMergedRoadSubroad && strippedUnitMergedRoadSubroad !== strippedUnit) push(strippedUnitMergedRoadSubroad);
  const strippedRoadCore = strippedUnit.match(/^(.*?(?:로|길|대로)\s*\d+(?:-\d+)?)/)?.[1]?.trim();
  if (strippedRoadCore && strippedRoadCore !== strippedUnit) push(strippedRoadCore);
  const strippedUnitFloorFixed = strippedUnit.replace(/(\d+)\s*충\b/g, '$1층');
  if (strippedUnitFloorFixed && strippedUnitFloorFixed !== strippedUnit) push(strippedUnitFloorFixed);
  const strippedUnitMergedGaGil = strippedUnit.replace(/(로)\s*(\d+)\s*가길\s*(\d+)/g, '$1$2가길 $3');
  if (strippedUnitMergedGaGil && strippedUnitMergedGaGil !== strippedUnit) push(strippedUnitMergedGaGil);
  for (const v of stripLeadingBrandToDistrictRoadVariants(t)) {
    push(v);
  }
  // "서초동동아빌라트" → "서초동 동아빌라트" 등 동명 중복 붙여쓰기 보정
  const normalizedDup = t.replace(/([가-힣]+동)동([가-힣])/g, '$1 $2');
  if (normalizedDup !== t) push(normalizedDup);
  // 광역 접두 없이 구/군으로 시작하면 서울·경기 등 접두 시도 (AI가 '서초구 …'만 줄 때)
  if (/^(서울특별시|서울|경기도|인천|부산|대구|광주|대전|울산|세종)/.test(t) === false) {
    if (/^(서초|강남|송파|양천|구로|마포|종로|영등포|동작|관악|서대문|은평|노원|강북|성북|동대문|중랑|광진|성동|강동|강서|금천|중구|용산|광진|성동)구/.test(t)) {
      push(`서울특별시 ${t}`);
      push(`서울 ${t}`);
    }
  }
  return out;
}

/** 내부 재시도와 별도로, 사용자에게 보여 줄 '한 줄 주소' 힌트 (건물명 제거 등) */
export function buildUserFacingAddressHints(raw: string): string[] {
  const fromVariants = buildGeocodeQueryVariants(raw);
  const hints = new Set<string>(fromVariants);
  const t = raw.trim().replace(/\s+/g, ' ');
  // 도로명+번지까지만 추출 (뒤 건물·동·층 설명 제거)
  const roadMatch = t.match(/^(.+?(?:로|길)\s*\d+(?:-\d+)?)\b/);
  if (roadMatch?.[1]) {
    const core = roadMatch[1].trim();
    if (!/^(서울|경기|인천|부산|대구|광주|대전|울산|세종)/.test(core)) {
      hints.add(`서울특별시 ${core}`);
      hints.add(`서울 ${core}`);
    }
    hints.add(core);
  }
  return [...hints].filter((s) => s.length >= 6).slice(0, 6);
}
