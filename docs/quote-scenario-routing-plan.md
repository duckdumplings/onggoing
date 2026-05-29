# 견적 시나리오·라우팅 고도화 계획서

> 작성일: 2026-05-29
> 트리거: 테라사이클코리아 견적 요청(다중 수거 → 단일 하차 / 분기 1회 정기 / 3·5·10개 지점 비교)
> 목적: 복잡한 견적 요청을 운영자가 "붙여넣기 → 자동 분해 → 병렬 비교 → 재사용"으로 빠르게 처리.

---

## 1. 문제 정의 (현행 한계)

| # | 한계 | 코드 근거 |
|---|---|---|
| ① | 다중 수거 → 단일 하차의 **역할 구분 없음** (origin 단수 + destinations 평탄화) | `quoteExtraction.ts`, `route-optimization/route.ts:975` |
| ② | 정기 수거 **빈도(연 N회) 정량화 불가** (regular/ad-hoc 플래그뿐, 월비용 `일일×20` 하드코딩) | `quote-calculation/route.ts:176` |
| ③ | **3/5/10개 시나리오 동시 비교 차단** ("한 번에 하나만") | `ai-chat-generate/route.ts:294, 1208` |
| ④ | 고객사·정기스케줄·시나리오 **재사용/이력 저장 구조 없음** | `supabase/migrations/*` |

---

## 2. 설계 원칙

- **거대 파일 비침습**: `route-optimization`(2875줄)·`ai-chat-generate`(2661줄)는 직접 수정하지 않고, `src/domains/dispatch/`에 신규 도메인 레이어 + 신규 API + 경량 UI로 추가 (AGENTS.md 금지 패턴 §"route.ts 비즈니스 로직 200줄+" 준수).
- **요율 단일 진실원**: 가격 산식은 `src/domains/quote/pricing.ts`를 재사용해 이중 정의 방지.
- **순수 함수 + 회귀 테스트**: 핵심 로직은 도메인 순수 함수로 두고 `evals/*Regression.ts`로 고정, `npm run verify:route-payload`에 연결.

---

## 3. 구현 현황 (Phase 0 — 완료)

### 3.1 데이터 모델 (`src/domains/dispatch/types/routePlan.ts`)
- `StopRole = 'pickup' | 'drop' | 'return' | 'waypoint'`, `RouteStop`(역할·물량·체류·시간창)
- `Frequency = { per, count, contractMonths }` (분기 1회 → `{ per: 'quarter', count: 1 }`)
- `QuoteScenario`, `ScenarioQuoteResult`, `RouteMetrics`
- `ExtractedQuoteInfo`에 `destinations[].role`, `destinations[].weightKg`, `frequency` 추가(하위호환).

### 3.2 빈도 유틸 (`src/domains/dispatch/utils/frequency.ts`)
- `annualVisits` (분기1회→4, 주2회→104), `annualizePrice`, `formatFrequency`("연 4회 (분기 1회)")
- `parseFrequency`: "3개월 1회"/"분기 1회"/"연 4회"/"주 2회" 자연어 파싱.

### 3.3 시나리오 가격 (`src/domains/dispatch/services/scenarioPricing.ts`)
- `calculateScenarioQuote(scenario, metrics)`: 단건 요금제 기반, 역할 인지 경유비 + 정기 가산 + 연 환산.
- `deriveStopsCount`: 출발지·최종 하차지 제외한 중간 경유지 수 추정.

### 3.4 시나리오 비교 (`src/domains/dispatch/services/scenarioComparison.ts`)
- `compareScenarios(scenarios, metricsByLabel, sortKey)`: N개 병렬 견적 + 기준(연비용/거리/시간) 정렬·추천.

### 3.5 API (`src/app/api/dispatch/scenario-quote/route.ts`)
- `POST { scenarios, sortKey?, departureAt? }` → 시나리오별 내부 `/api/route-optimization` 호출로 메트릭 채운 뒤 비교 반환.
- I/O·오케스트레이션만 담당(비즈니스 로직은 도메인 서비스).

### 3.6 UI (재사용 컴포넌트 + 훅)
- `src/domains/dispatch/components/ScenarioComparisonCard.tsx`: 비교 표(구성/거리/소요/1회·연 운임, 추천 하이라이트).
- `src/hooks/useScenarioComparison.ts`: `run(scenarios)` 호출 훅 (채팅·패널 공용).

### 3.7 DB (`supabase/migrations/20260529000000_customers_recurring_scenarios.sql`)
- `customers`(화주 마스터), `recurring_schedules`(빈도+다음수거일+stops), `quote_scenario_groups`/`quote_scenarios`(시나리오 묶음·결과). MVP RLS 비활성화(Production 전환 시 재활성화).

### 3.8 회귀 테스트 (`src/domains/dispatch/evals/scenarioQuoteRegression.ts`)
- 빈도 환산/파싱, 역할 경유비, 정기 가산, 3/5/10 비교 추천 — 8케이스. `npm run verify:route-payload` 통과.

---

## 4. 통합 현황 (Phase 1)

### 모듈: AI 채팅 다중 시나리오 연동 — 완료
- [x] `ai-chat-generate`의 다중 시나리오 차단 직전에 **비교 모드 분기** 삽입: `parseScenarioRequest(message)`로 시나리오 분해 → `runScenarioComparisonViaApi` → 응답에 `scenarioComparison` 포함(차단 메시지 없음).
- [x] `AIQuoteChatModal` 우측 패널에 `ScenarioComparisonCard` 렌더.
- 분기/메시지 로직은 `domains/dispatch/services/scenarioChatBridge.ts`로 분리(거대 핸들러 비대화 방지, +약 35줄만 추가).
- **인수기준**: 메일 본문 붙여넣기 → 3개 시나리오 표 1회 응답으로 산출, 차단 안내 없음. (파서 회귀 케이스로 고정)

### 모듈: 시나리오 비교 위치 — 채팅 전용
- [x] 좌측 패널은 좁아 비교 UX에 부적합 → **AI 채팅 에이전트가 전담**(패널 섹션 제거). 패널은 단일 경로 최적화에 집중.
- 비교 입력/결과/저장 모두 채팅 흐름에서 처리. 3/5/10은 사용자가 실제 입력한 시나리오일 뿐, UI 기본값으로 노출하지 않는다.

### 모듈: 지오코딩 견고화 (400 실패 대응) — 완료
- [x] `stopGeocoder.ts`: "노원구청"·"문래역" 같은 POI명을 **Tmap POI 검색으로 좌표 선해석** 후 route-optimization에 좌표 객체로 전달 → 지오코딩 실패(400) 최소화.
- [x] 실패 시 `diagnostics.failedAddresses`를 읽어 "주소를 찾지 못했어요: 관악구청"처럼 **구체적 메시지** 반환. 일부 시나리오가 실패해도 나머지는 정상 비교(부분 실패 격리).

### 모듈: 재사용/이력 — 완료
- [x] 비교 결과 저장 `POST /api/dispatch/scenario-groups`(+고객사 자동 생성) / 조회 `GET`.
- [x] 고객사 마스터 `GET·POST /api/dispatch/customers`.
- [ ] (후속) "동일 조건 재견적" 1클릭(정기 스케줄 → 시나리오 자동 복원) UI.

### 모듈: 라우팅 페이로드 역할 전달 — 부분 완료
- [x] 역할(pickup/drop) → 페이로드 매핑을 **브리지/엔드포인트 계층**에서 처리: `scenario-quote`의 `buildRoutePayload`가 첫 수거지를 출발지, 단일 하차지를 `useExplicitDestination`으로 종착 고정.
- [ ] (후속·고위험) `route-optimization` 내부에 역할 기반 적재량 누적·픽업 선행 강제(현 2875줄 파일 분리 후 진행 권장).

---

## 5. 예상 UI/UX 플로우

### AI 채팅 — 통째로 붙여넣기
```
운영자: (메일 본문 + 표 붙여넣기 / 파일 첨부)
AI: 다중 수거→단일 하차 / 분기 1회(연 4회) 감지. 3개 시나리오 동시 견적할까요?
    [3개] [5개] [10개]  [전체 비교]
AI: (ScenarioComparisonCard 표) 거리·소요·1회·연 운임 + 추천
    [지도 보기] [패널로] [PDF] [Excel]
```

### 좌측 패널 — 역할 라벨 + 시나리오 탭
- 경유지마다 수거/하차/반납, 단일 하차지 고정, 정기 빈도+계약개월 → 연환산 자동.

### 파일 업로드
- 현재 `.pdf/.xlsx/.docx/이미지` 첨부 가능(`AIQuoteChatModal:1470`). 표 구조 보존 파서 개선 시 "엑셀 드롭 → 자동 시나리오 분해".

---

## 6. 운영 플로우

```
수신(메일/카톡/엑셀) → 채팅 붙여넣기/첨부 → 자동 분해(역할·빈도·시나리오)
→ 병렬 견적(3/5/10 동시) → 패널 미세조정/리스크 검증 → PDF/Excel 산출
→ 고객사+정기스케줄 저장 → 다음 분기 1클릭 재견적
```

메일 연동 불필요(복붙/업로드로 충분), 회신은 운영자가 결과 복사.
