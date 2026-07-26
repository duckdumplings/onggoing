# 경로 순서 계산 → 솔버 셰도우 마이그레이션 설계

> 목적: 현재 순서(ordering) 계산을 걷어내지 않고, **일반 VRP 솔버 후보를 옆에 붙여(shadow mode)** 동일 입력에 대해 두 결과를 비교·기록한다. 사용자 응답에는 절대 영향을 주지 않는다. 셰도우 데이터가 "후보가 항상 같거나 낫다"를 증명하면, 그때 케이스별로 권한(authority)을 넘긴다.
>
> 작성 기준: `feat/map-ux-rendering` 브랜치. 참조 라인은 작성 시점 기준이며 리팩터링 후 갱신 필요.

---

## 0. 먼저: 지금 엔진은 "원시적"이 아니다 (정확한 현황)

셰도우 설계의 전제는 "무엇이 이미 최적이고 무엇이 휴리스틱인가"를 정확히 아는 것이다. 실제 코드 기준:

| 케이스 | 현재 처리 | 라인 | 품질 |
|---|---|---|---|
| open-start (픽업≥2 → 단일 고정 하차, **시간제약 없음**) | `solveOpenStart` — Held-Karp **정확해 DP**(N≤10), 초과 시 NN+2-opt. 실측 비대칭 NxN 행렬 위에서 계산 | [route.ts:1080](../src/app/api/route-optimization/route.ts#L1080), [openStartOptimizer.ts:291](../src/domains/dispatch/services/openStartOptimizer.ts#L291) | **정확(작은 N)** — 원시적 아님 |
| 시간제약(due) 있는 경로 | `buildRouteWithAnchors` — due 정렬 + 여유(slack) 삽입 그리디, 온디맨드 Tmap 구간 조회 | [route.ts:1314](../src/app/api/route-optimization/route.ts#L1314) (정의 :2662) | **휴리스틱** |
| optimizeOrder, 시간제약 없음, open-start 아님 | `nearestNeighborOrder` — **Haversine(직선거리)만**으로 NN, 픽업 그룹 선행 | [route.ts:1338](../src/app/api/route-optimization/route.ts#L1338) (정의 :2458) | **휴리스틱 + 순서결정에 실측 교통 미반영** |
| 다중 차량 | `distributeDestinations` — 목적지를 연속 청크로 분할 후 기사별 `/route-optimization` 개별 호출. 기사 간 교차 최적화 없음 | [multi-driver-optimization/route.ts:47](../src/app/api/multi-driver-optimization/route.ts#L47) | **거친 휴리스틱** |

핵심: open-start 경로는 **이미 진짜 소형 VRP 솔버**다(시간창·용량·작업시간 제약 코드까지 존재). "손으로 짠 원시적 로직"은 시간제약 경로·NN 경로·다중차량 경로에 국한된다.

### 솔버(일반형)가 유일하게 이기는 지점
1. **일반 pickup-delivery 페어링(goods-flow)** — 지금은 "모든 픽업 → 단일 하차"만 모델링. "A픽업 물건→C, B픽업 물건→D, 적재량 오르내림 + i픽업이 자기 배송 j보다 선행"은 표현 불가. 현재 선행 제약은 "모든 픽업 → 모든 비픽업"으로 거칠다([route.ts:2466](../src/app/api/route-optimization/route.ts#L2466)).
2. **다중 차량 동시 최적화(배분+경로)** — 지금은 연속 청크 분할로 근사.
3. **10개 초과 스케일** — Held-Karp가 N≤10에서 정확, 초과 시 NN 폴백([openStartOptimizer.ts:7](../src/domains/dispatch/services/openStartOptimizer.ts#L7)).
4. **시간제약 경로의 순서 최적화** — 지금은 그리디. 시간창·용량·선행이 동시에 얽히면 그리디가 놓치는 해가 생긴다.

> 요금 결정론(pricing.ts)·교통 외주(Tmap)·피드백 반자동 루프는 이 마이그레이션 대상이 **아니다**. 순서 계산 층만 다룬다.

---

## 1. 설계 원칙 (셰도우의 불변식)

1. **사용자 무영향.** 셰도우 후보 결과는 응답·견적·타임라인에 절대 반영되지 않는다. 기록만 한다.
2. **핫패스 지연 0.** 후보 계산은 응답을 만든 뒤 비동기(fire-and-forget)로 돈다. 사용자 대기시간에 더해지지 않는다.
3. **행렬 재사용.** 비교는 동일한 실측 행렬 위에서 해야 공정하다. open-start는 이미 행렬을 만든다([route.ts:1069](../src/app/api/route-optimization/route.ts#L1069)); 다른 경로는 셰도우 태스크 안에서(핫패스 밖) 공유 캐시를 활용해 만든다.
4. **백엔드 무관.** 봉합점·비교 하니스는 후보 솔버가 OR-Tools든 TS 확장이든 **동일**하다. 백엔드 선택은 Phase 3로 미루고, 셰도우 데이터로 결정한다. 심지어 후보 2개(OR-Tools, TS확장)를 동시에 셰도우로 돌려 비교할 수 있다.
5. **데이터가 결정한다.** "후보로 갈아탄다"는 감이 아니라 수용 게이트(§6)를 통과할 때만.

---

## 2. 봉합점(seam)과 중립 DTO

**봉합 위치:** [route.ts:1138-1360](../src/app/api/route-optimization/route.ts#L1138) 블록. 세 producer가 `orderedDestinations: Waypoint[]`를 만든 직후, ETA 루프([:1445](../src/app/api/route-optimization/route.ts#L1445))가 소비하기 전.

**중립 DTO** — 기존 솔버와 미래 일반 솔버가 둘 다 말할 수 있는 상위집합. `src/domains/dispatch/solver/types.ts`(신규)에 정의:

```ts
import type { StopRole, VehicleLabel } from '@/domains/dispatch/types/routePlan';
import type { Waypoint } from '@/domains/dispatch/services/segmentTravel';
import type { DirectedMatrix } from '@/domains/dispatch/services/routeMatrix';

export interface OrderStop {
  waypoint: Waypoint;
  role: StopRole;
  dwellMin: number;
  loadKg?: number;
  due?: { at: string; isNextDay: boolean } | null; // "not-after"(마감). 현재 유일하게 배선된 시간제약
  notBefore?: string | null;                        // "earliest". 솔버엔 있으나 미배선 — 예약 필드
  pairId?: string;                                  // P&D 페어링(goods-flow). 예약 필드
}

export interface RouteOrderRequest {
  start: Waypoint | null;          // null이면 open-start(솔버가 출발지 선택)
  stops: OrderStop[];              // 출발지 제외 전 지점
  matrix: DirectedMatrix;          // [start?, ...stops] 인덱스 정합 실측 NxN
  vehicle: { type: VehicleLabel; capacityKg?: number };
  departureAt: string | null;
  fixedFinalIndex?: number;        // 고정 종착(현 useExplicitDestination)
  startEligibleIndices?: number[]; // 출발 후보 제한(픽업만 등)
  returnToOrigin?: boolean;
}

export interface RouteOrderResult {
  order: number[];                 // stops 인덱스의 방문 순서
  chosenStartIndex?: number;       // open-start 선택 출발지
  feasible: boolean;
  infeasibleReason?: string;
  totalTimeSec: number;
  totalDistM: number;
  totalLatenessMin: number;
  rationale?: unknown;             // 기존 OriginRationale 호환
  engine: string;                  // 'heuristic:anchors' | 'exact:held-karp' | 'ortools:cpsat' | 'ts:pdp'
  computeMs: number;
}

export interface RouteOrderer {
  name: string;
  supports(req: RouteOrderRequest): boolean; // 이 솔버가 표현 가능한 케이스인지
  order(req: RouteOrderRequest): Promise<RouteOrderResult>;
}
```

이 `RouteOrderer` 인터페이스가 이 설계의 심장이다. **"경로 짜는 방법"이라는 3개의 producer를, "경로가 만족할 조건"이라는 DTO를 받는 어댑터로 바꾼다.**

---

## 3. 아키텍처 (어댑터 + 셰도우 러너 + 비교 싱크)

```
route.ts POST
  │
  ├─ (기존) 3 producer → orderedDestinations  ← 여전히 authoritative, 응답에 사용
  │
  ├─ 응답 조립 & return  ← 사용자에게 나감 (지연 영향 없음)
  │
  └─ void runShadow(req, authoritative)  ← fire-and-forget, 비동기
        │  (샘플링 게이트 통과 시에만)
        ├─ 행렬 확보(있으면 재사용, 없으면 캐시 활용해 build)
        ├─ candidateOrderer.order(req)   ← RouteOrderer (Phase별로 교체 가능)
        ├─ compare(authoritative, candidate)  ← §6 지표 계산
        └─ INSERT solver_shadow_runs         ← §5 싱크
```

- **어댑터(Phase 0):** 기존 3 producer를 `RouteOrderer`로 감싼다. 동작 불변. `AnchorsOrderer`(buildRouteWithAnchors), `NearestNeighborOrderer`, `OpenStartOrderer`(solveOpenStart).
- **셰도우 러너(Phase 1):** authoritative 결과와 request를 받아 후보를 돌리고 비교를 기록. 예외는 전부 삼킨다(셰도우 실패가 사용자 경로에 절대 전파 안 됨).
- **후보 솔버(Phase 3):** `RouteOrderer` 구현체. 백엔드는 이때 결정(§7).

---

## 4. 단계별 계획

### Phase 0 — 봉합점 추출 (동작 불변, 순수 리팩터링)
- `src/domains/dispatch/solver/types.ts` — 위 DTO.
- `src/domains/dispatch/solver/adapters/` — 기존 3 producer를 `RouteOrderer`로 래핑.
- [route.ts:1138-1360](../src/app/api/route-optimization/route.ts#L1138)을 "request DTO 구성 → 적절한 producer 어댑터 호출 → `orderedDestinations` 복원"으로 재배선.
- **수용 기준:** 기존 회귀 테스트(`openStartRegression`, `routePayloadRegression`, `departureTimeRegression` 등) 전부 그대로 통과. 응답 바이트 동일.
- **리스크:** 낮음(구조만 변경). PR 1개.

### Phase 1 — 셰도우 하니스 (관측만, 후보=no-op 또는 개선된 exact)
- `solver_shadow_runs` 테이블 마이그레이션(§5).
- `runShadow()` + 샘플링 게이트(env `SHADOW_ORDERING_SAMPLE_RATE`, 기본 0 = 꺼짐).
- 첫 후보는 **저렴한 것부터**: open-start 경로에서 이미 만든 행렬을 재사용해 "현재 시간제약 경로도 Held-Karp로 풀면 어떤 순서가 나오나"를 비교. Tmap 추가비용 최소.
- **수용 기준:** 셰도우 on/off가 응답·지연·에러율에 무영향(계측으로 확인). 셰도우 예외는 로그만.
- **킬 스위치:** env 하나로 즉시 off.

### Phase 2 — 비교 eval + 리플레이 부트스트랩
- **리플레이:** `optimization_runs.request_data`(JSONB 이력, [테이블](../supabase/migrations/20250127000009_optimization_runs_table.sql))를 오프라인 스크립트로 후보에 재투입 → 사용자 영향 0으로 비교 데이터셋 확보. `scripts/replay-shadow.ts`.
- 비교 지표 집계(§6) + 간단한 대시보드/CLI 리포트.
- **수용 기준:** "어떤 케이스에서 후보가 다르고/낫고/나쁜가"를 표로 볼 수 있음.

### Phase 3 — 진짜 일반 솔버 후보 투입 (백엔드 결정)
- §7의 백엔드(OR-Tools 사이드카 **또는** TS 확장)를 `RouteOrderer`로 구현.
- 여기서 §0의 진짜 승부처(P&D 페어링, 다중차량, 시간제약 순서)를 후보가 표현.
- 후보 2개를 동시에 셰도우로 돌려 비교 가능.

### Phase 4 — 케이스별 권한 이양 (플래그 뒤)
- 수용 게이트(§6) 통과한 **케이스 클래스에 한해**, feature flag로 authoritative를 후보로 전환.
- 기존 휴리스틱은 **폴백으로 유지**(후보 실패·타임아웃 시 자동 복귀).
- 점진 롤아웃: 케이스 클래스 하나씩.

---

## 5. 셰도우 싱크 — `solver_shadow_runs`

```sql
CREATE TABLE IF NOT EXISTS public.solver_shadow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  case_class TEXT,               -- 'open-start' | 'time-window' | 'nn' | 'multi-driver'
  stop_count INT,
  authoritative_engine TEXT,     -- 'heuristic:anchors' 등
  candidate_engine TEXT,         -- 'ortools:cpsat' 등
  request_data JSONB,            -- RouteOrderRequest(행렬 제외 또는 요약)
  authoritative JSONB,           -- {order,totalTimeSec,totalDistM,totalLatenessMin,feasible}
  candidate JSONB,               -- 동일 스키마
  comparison JSONB,              -- §6 지표
  candidate_error TEXT,          -- 후보 예외 메시지(있으면)
  sampled_reason TEXT            -- 왜 이 요청이 샘플됐는지
);
CREATE INDEX ON public.solver_shadow_runs (created_at DESC);
CREATE INDEX ON public.solver_shadow_runs (case_class);
ALTER TABLE public.solver_shadow_runs DISABLE ROW LEVEL SECURITY; -- 기존 관례 따름(MVP)
```

행렬 전체는 크므로 `request_data`엔 좌표+제약만, 행렬은 해시/요약만 저장(재현 필요 시 리플레이로 재생성).

---

## 6. 비교 지표 & 수용 게이트

**요청당 기록 지표(`comparison`):**
- `orderMatch`: 순서 완전 일치 여부 + `kendallTau`(불일치 정도).
- `feasibilityDelta`: 두 솔버의 feasible 일치/불일치(가장 흥미로운 케이스: 하나만 feasible).
- `timeDeltaSec` = candidate − authoritative (음수 = 후보가 빠름), `distDeltaM`, `latenessDeltaMin`.
- `constraintOk`: 후보 순서가 선행/시간창/용량을 실제로 지키는지 재검증(솔버 주장 아닌 독립 검증).
- `computeMs` 양쪽.

**권한 이양(Phase 4) 수용 게이트 — 케이스 클래스별로, 최소 N개 표본에서:**
1. **정확성:** 후보가 선행/시간창/용량을 위반한 표본 = **0** (하드 게이트).
2. **비열등:** `timeDelta`가 +ε(예: +60초) 넘게 나쁜 표본 비율 ≤ 임계치.
3. **feasibility ≥ 휴리스틱:** 휴리스틱이 feasible인데 후보가 infeasible인 표본 = 0.
4. **개선 근거:** 후보가 유의미하게 나은(시간/거리/feasibility) 표본이 존재(이양의 명분).
5. **성능:** 후보 p95 `computeMs` ≤ 예산(예: 2s), 타임아웃 시 폴백 검증됨.

---

## 7. Phase 3 백엔드 선택 (지금 결정 불필요)

셰도우 하니스는 백엔드 무관이므로 이 결정은 미룬다. 두 후보:

### 옵션 A — OR-Tools Python 사이드카
- **적합:** 진짜 다중차량 VRP + 일반 P&D + 큰 N으로 갈 때. 성숙·검증된 솔버.
- **비용:** 신규 배포 아티팩트(Python 서비스). 현 스택은 순수 Node/Next.js + Supabase, Python 런타임 없음 → Cloud Run / Fly / Railway 등에 컨테이너로 별도 호스팅. 스택에 새 언어·운영 부담.
- **연결:** `POST /solve`에 `RouteOrderRequest`(행렬 포함) JSON → `RouteOrderResult`. 셰도우라 지연 무관, 인증은 내부 토큰.

### 옵션 B — TS 인프로세스 확장
- **적합:** 실제 인스턴스가 작을 때(현 Held-Karp N≤10과 동급 규모). 신규 서비스·언어 없음, 행렬 재사용, 현 배포에 그대로.
- **방법:** (1) P&D 페어링 = Held-Karp DP에 pair 선행/적재 상태 추가(작은 N에서 실용적). (2) 다중차량 = 집합분할 + 차량별 exact.
- **비용:** 솔버 기능을 손으로 구현(경계 사례·유지보수). 단 좁은 범위·작은 N에 한정.

**권고:** Phase 0–2를 백엔드 무관으로 먼저 짓고, Phase 3에서 **두 후보를 동시에 셰도우로 돌려** 실제 인스턴스 분포로 결정. 현 규모가 작다면 B로 충분할 가능성이 높고, 다중차량 수요가 실측되면 A로.

---

## 8. 안전장치

- **킬 스위치:** `SHADOW_ORDERING_SAMPLE_RATE=0`으로 즉시 전면 off.
- **비용 통제:** 샘플링(요청 일부만) + 지점수 하한(예: stops≥4) + 공유 Tmap 캐시 재사용으로 셰도우 행렬 비용 최소화. 리플레이는 캐시 히트 위주.
- **격리:** `runShadow`의 모든 예외·타임아웃은 삼켜지고 로그만. 사용자 경로에 전파 불가.
- **Phase 4 폴백:** 권한 이양 후에도 후보 실패 시 휴리스틱으로 자동 복귀. 휴리스틱 코드는 제거하지 않는다.
- **관측:** 셰도우 on/off A/B로 응답 지연·에러율 회귀 없음을 계측 확인.

---

## 8.5. 진단 결과 (2026-07-23, 실측 Tmap)

증거우선 원칙(§1.5)에 따라 두 휴리스틱 경로의 실제 손실을 측정했다. optimization_runs가 0행이라 이력 리플레이 대신 서울 실좌표 합성 인스턴스 사용(통계적으로 얇음 — 방향성 신호).

### NN 경로 (`nearestNeighborOrder`) — `scripts/diagnose-ordering-gap.ts`
8개 인스턴스, 실측 행렬 위 shipped-NN(Haversine) vs 정확해(Held-Karp):
- 손실 median **2분**, p90/max **17분(~10%)**. 8개 중 5개는 이미 최적(손실 0).
- 큰 손실은 분산된 6~9지점에서 발생, 상당수가 Haversine(직선거리) 순서결정 탓.
- **조치: 적응형 NN 배포됨**(§아래). 6~9지점은 실측 행렬+정확해, 그 외 Haversine 폴백.

### 시간제약 경로 (`buildRouteWithAnchors`) — `scripts/diagnose-timewindow-gap.ts`
5개 인스턴스, 마감순 그리디 vs 브루트포스 정확해(총지각 최소→총이동 최소):
- **회피 가능한 마감 지각: 0분 (전 인스턴스).** 그리디는 마감을 안 놓친다 — 핵심 임무는 정상.
- **이동시간: 정확해보다 median 36분·max 58분 더 씀.** 마감은 지키되 경로가 비효율(마감순 강제 정렬로 지리적 왕복).
- **한계(중요):** 인스턴스 마감이 느슨해서(09시 출발·14시 마감 등) 낭비가 과장됨. 마감이 빡빡하면 격차 축소. 또한 단일 스냅샷 행렬이라 **시간대별 교통 변동 미반영** — 이 경로의 진짜 존재이유(출발시각별 예측)를 진단이 못 담았다. 실측 시간의존 교통에선 정확해 순서가 마감을 어길 수도 있다.
- **결론: NN보다 손실 크기(이동)는 크지만, 배포는 더 위험**(시간의존 교통 하 마감유지 보장 필요). 코드 변경 보류. 다음 검증: (a) 빡빡한 마감 재측정, (b) 시간의존 검증 또는 라이브 엔드포인트 셰도우.

### 종합 판정
OR-Tools 사이드카/풀 마이그레이션은 여전히 근거 부족 → 보류. NN 경로는 저비용 적응형 정확해로 즉시 개선(배포됨). 시간제약 경로는 잠재 이득은 크나 위험도 커서 추가 증거 후 결정.

---

## 8.6. 배포된 것: 적응형 NN (2026-07-23)

`src/domains/dispatch/services/exactOrder.ts` (Held-Karp, 브루트포스 대조 테스트) + `route.ts`의 `optimizeOrderDistanceBased` 디스패처. 시간제약 없는 거리기반 경로에서:
- 지점 < `ORDER_EXACT_MIN_STOPS`(기본 6): 기존 Haversine NN (값싸고 이미 최적 근접).
- 6..`ORDER_EXACT_MAX_STOPS`(기본 9): 실측 행렬 + 정확해.
- 초과/실패: Haversine NN 폴백. 킬 스위치 `ORDER_EXACT_ENABLED=false`.
개방-시작(open-start)·시간제약 경로는 **미변경**. 라이브 검증 완료(6지점 요청에서 정확해 경로 실행 확인).

---

## 9. 첫 PR (Phase 0) 파일 목록

- `src/domains/dispatch/solver/types.ts` (신규) — DTO + `RouteOrderer`.
- `src/domains/dispatch/solver/adapters/openStart.ts` / `anchors.ts` / `nearestNeighbor.ts` (신규) — 기존 3 producer 래핑.
- `src/app/api/route-optimization/route.ts` — [:1138-1360](../src/app/api/route-optimization/route.ts#L1138) 재배선(request DTO 구성 → 어댑터 호출 → 복원).
- 기존 회귀 테스트 그대로 통과 확인 + 어댑터 단위 테스트 추가.
- **동작·응답 불변**이 Phase 0의 유일한 수용 기준.
</content>
</invoke>
