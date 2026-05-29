# AGENTS.md — 옹고잉 스마트 물류 플랫폼 리포지터리 맵

> "1,000페이지의 설명서가 아닌 맵을 제공" — OpenAI Harness Engineering
>
> AI 에이전트가 본 리포지터리에서 작업할 때 처음 보아야 할 1페이지 문서.
> PRD/TRD/가이드라인 등 상세 룰은 `.cursor/rules/` 에 있고, 본 문서는 **위치 정보**가 핵심.

> **Living Document**: 본 문서는 시점-종속 정보(거대 파일 LOC, 도메인 폴더 상태, API route 목록)를
> 포함한다. 다음 트리거가 발생하면 즉시 갱신:
> - API route 추가/삭제 → §"API Routes 목록" 갱신
> - 도메인 폴더가 채워짐 (`dispatch/auth/tracking/admin`) → §"도메인 폴더" 갱신
> - Edge Function 추가 → §"Supabase Edge Functions" 갱신
> - 거대 파일 LOC 변동 → §"거대 파일 명단" 갱신 (`.cursor/rules/31-anti-slop-code.mdc` §2와 동기화)
> - Phase 전환 (MVP → 고도화 → 확장) → §"프로젝트 Phase" 갱신
>
> 갱신 시 PR 본문에 `[agents-md]` 라벨 + 트리거 명시.

## 필독 파일 (작업 시작 전)

1. `.cursor/rules/00-karpathy-guidelines.mdc` — 최우선 행동 룰
2. `.cursor/rules/10-product-requirements.mdc` — 제품 요구사항 (요금제, 차종 가중치, 인수기준)
3. `.cursor/rules/11-architecture.mdc` — 기술 아키텍처
4. `.cursor/rules/20-git-commit-message.mdc` — 커밋 메시지 룰
5. `.cursor/rules/30-anti-slop-design.mdc` — 디자인 슬롭 방지
6. `.cursor/rules/31-anti-slop-code.mdc` — 코드 구조 슬롭 방지 (거대 파일 명단 포함)
7. `.cursor/rules/32-domain-workflow-priority.mdc` — 도메인 워크플로 검증 절차

## 아키텍처 레이어

```
Types → Domain Services → Hooks → Components → API Routes / Server Actions → Supabase Edge Functions
```

- **Frontend**: Next.js 15 (App Router) + React 18 + TypeScript + Tailwind v3
- **Backend**: Next.js API Routes + Supabase (Postgres + Auth + Storage + Edge Functions/Deno)
- **외부 API**: Tmap 다중경유지, Tmap POI 검색, Atlan (백업), LLM (AI Quote Chat)

## 도메인 폴더 (`src/domains/`)

> **현 상태 (2026-05)**: `dispatch/auth/tracking/admin`은 `index.ts`만 있고 비어 있다.
> `quote/`만 실제 구현. 신규 도메인 코드는 `src/domains/<domain>/` 에 채워 넣는다
> (가이드라인의 Domain-Driven Organization 원칙).

| 도메인 | 위치 | 상태 | 비고 |
|---|---|---|---|
| `quote` | `src/domains/quote/` | 구현됨 | `pricing.ts`, `services/`, `knowledge/`, `types/`, `evals/` |
| `dispatch` | `src/domains/dispatch/` | 부분 구현 | 시나리오 비교·정기 빈도·역할(pickup/drop) 모델 구현(`types/routePlan.ts`, `utils/frequency.ts`, `services/scenario*.ts`, `components/`). 경로 최적화 본체는 여전히 `route-optimization/route.ts` 인라인 |
| `tracking` | `src/domains/tracking/` | 미구현 | 실시간 위치 추적 (Phase 3) |
| `auth` | `src/domains/auth/` | 미구현 | 현 인증 로직은 `src/libs/auth.tsx` |
| `admin` | `src/domains/admin/` | 미구현 | 관리자 대시보드 (Phase 2~3) |

### `src/domains/quote/` 세부

| 위치 | 설명 |
|---|---|
| `pricing.ts` | 옹고잉 요금제(시간당/단건퀵/건당) 기반 견적 계산 핵심 로직 |
| `knowledge/pricingRules.ts` | 요금제 규칙 정의 |
| `knowledge/serviceInfo.ts` | 서비스 메타 정보 |
| `services/quoteInfoExtractor.ts` | 견적 정보 추출 (372줄) |
| `services/routeValidator.ts` | 경로 검증 (367줄) |
| `services/documentParser.ts` | 견적 의뢰 문서 파싱 (275줄) |
| `services/ragRetriever.ts` | RAG 기반 정보 검색 (271줄) |
| `services/structuredLogisticsParser.ts` | 구조화 물류 데이터 파싱 (275줄) |
| `services/riskReportGenerator.ts` | 견적 리스크 리포트 생성 |
| `services/conversationStateManager.ts` | AI Chat 세션 상태 관리 |
| `services/chatFileGenerator.ts` | Chat 첨부 파일 생성 |
| `services/toolRouter.ts` | LLM tool calling 라우팅 |
| `services/webKnowledgeRetriever.ts` | 웹 지식 검색 |
| `agent/` | 견적 에이전트(tool-calling): `tools.ts`(8개 도구), `workingMemory.ts`(zod RoutePlanDraft + validatePlan) |
| `types/` | `quoteDocument.ts`, `quoteExtraction.ts`, `riskReport.ts` |
| `evals/chatEvalCases.ts` | (구) 규칙 추출 평가 케이스 |
| `evals/agentEvalCases.ts` / `evals/agentScorer.ts` | 에이전트 골든셋 + 채점기 (`npm run eval:agent`) |

## API Routes 목록 (`src/app/api/`)

| 경로 | 설명 | LOC | 위험도 |
|---|---|---|---|
| `route-optimization/route.ts` | 단일/다중 경유지 경로 최적화 (Tmap) | **2875** | **매우 높음** |
| `multi-driver-optimization/route.ts` | 다중 기사 배차 | 281 | 높음 |
| `dispatch/scenario-quote/route.ts` | 다중 시나리오(3/5/10지점) 병렬 견적·비교 | — | 중간 |
| `dispatch/scenario-groups/route.ts` | 시나리오 비교 결과 저장/조회 | — | 낮음 |
| `dispatch/customers/route.ts` | 고객사(화주) 마스터 조회/생성 | — | 낮음 |
| `quote/agent-chat/route.ts` | AI 견적 에이전트(tool-calling, 추론 기반) 메인 핸들러 | ~170 | 높음 |
| `quote/extract-quote-info/route.ts` | 견적 정보 추출 | — | 중간 |
| `quote/parse-document/route.ts` | 견적 의뢰 문서 파싱 | — | 중간 |
| `quote/document-upload/route.ts` | 견적 문서 업로드 | — | 중간 |
| `quote/validate-route/route.ts` | 경로 검증 | — | 중간 |
| `quote/generate-from-text/route.ts` | 텍스트 기반 견적 생성 | — | 중간 |
| `quote/generate-from-customer-data/route.ts` | 고객 데이터 기반 견적 | — | 중간 |
| `quote/generate-risk-report/route.ts` | 리스크 리포트 생성 | — | 중간 |
| `quote/compare-quotes/route.ts` | 견적 비교 | — | 낮음 |
| `quote/chat-sessions/route.ts` | AI Chat 세션 CRUD | — | 중간 |
| `quote/chat-feedback/route.ts` | AI Chat 피드백 수집 | — | 낮음 |
| `quote/reviews/route.ts` | 견적 검토 이력 | — | 낮음 |
| `quote/pdf/route.ts` | 견적서 PDF 생성 | 317 | 중간 |
| `quote/pdf-v2/route.ts` | 견적서 PDF v2 | — | 중간 |
| `quote/evals/route.ts` | AI Chat 평가 실행 | — | 낮음 |
| `quote-calculation/route.ts` | 단순 견적 계산 (legacy?) | — | 낮음 |
| `poi-search/route.ts` | Tmap POI 검색 프록시 | — | 중간 |
| `tmap-proxy/route.ts` | Tmap 일반 프록시 | — | 중간 |
| `bulk-analyze/route.ts` | 일괄 분석 | — | 낮음 |
| `optimization-runs/route.ts` | 최적화 실행 이력 CRUD | — | 낮음 |
| `quote/_auth.ts` | quote API 공통 인증 헬퍼 | — | — |

> **인증 헬퍼**: `src/app/api/quote/_auth.ts` 사용. quote 도메인의 인증 일관성은 이 파일을 통한다.

## 거대 파일 명단 (`.cursor/rules/31-anti-slop-code.mdc` §2 참조)

| 파일 | LOC | 우선 분리 대상 |
|---|---|---|
| `src/app/api/route-optimization/route.ts` | 2875 | 비즈니스 로직 → `domains/dispatch/services/` |
| `src/components/modals/AIQuoteChatModal.tsx` | 1863 | 스텝/메시지 컴포넌트 분리 |
| `src/app/tmap-embed/route.ts` | 1377 | HTML 템플릿 분리 |
| `src/components/panels/RouteOptimizerPanel.tsx` | 1245 | 입력/결과/지도 컨트롤 3분할 |
| `src/components/map/TmapMainMap.tsx` | 1214 | 지도 초기화/마커/폴리라인 hook 분리 |

## Supabase Edge Functions

| 함수 | 위치 | 위험도 |
|---|---|---|
| `route-optimization` | `supabase/functions/route-optimization/` | 높음 (Tmap 호출 + DB write) |

> 그 외 견적·AI 챗봇은 모두 **Next.js API Routes** (`src/app/api/`)로 구현되어 있다.
> Edge Function 추가 시 `.cursor/rules/31-anti-slop-code.mdc` §9 임포트 위생 룰 준수
> (`@/` alias 금지, `_shared/` 또는 자체 `lib/` 사용).

## DB 마이그레이션 (`supabase/migrations/`)

19개 마이그레이션. 주요 테이블:

- `quote_documents` — 견적 의뢰 원본 문서
- `quote_extractions` — 추출된 견적 정보
- `quote_validations` — 견적 검증 결과
- `quote_risk_reports` — 견적 리스크 리포트
- `quote_chat_sessions` / `quote_chat_messages` — AI Chat 세션
- `quote_chat_failure_cases` — AI Chat 실패 케이스 (디버깅용)
- `optimization_runs` — 경로 최적화 실행 이력

> RLS는 MVP 단계에서 의도적으로 일부 비활성화 (`20250127000008_disable_rls_mvp.sql`).
> Production 전환 시 RLS 재활성화 필수 (PRD §7 비기능 요구사항).

## 외부 API 환경 변수

- `NEXT_PUBLIC_TMAP_API_KEY`, `TMAP_API_KEY` — Tmap 다중경유지/POI/지오코딩
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- LLM 키 (`agent-chat` 에이전트 사용): `ANTHROPIC_API_KEY`(기본) 또는 OpenAI 키(폴백) — `.env.local` 확인. 모델은 `QUOTE_AGENT_MODEL`로 지정, provider 추상화는 `src/libs/llm/provider.ts`

## 라이브러리/유틸 위치

| 위치 | 설명 |
|---|---|
| `src/libs/supabase-client.ts` | Supabase 클라이언트 (CSR) — 337줄, 비대 주의 |
| `src/libs/supabase.ts` | Supabase 헬퍼 |
| `src/libs/auth.tsx` | 인증 컨텍스트/훅 — 362줄, 향후 `domains/auth/`로 이동 후보 |
| `src/libs/auth.ts` | 인증 유틸 |
| `src/libs/realtime.ts` | Supabase Realtime 구독 — 255줄 |
| `src/hooks/useRouteOptimization.tsx` | 경로 최적화 hook — 388줄 |
| `src/hooks/usePoiCache.ts` | POI 검색 캐시 hook — 255줄 |
| `src/utils/cn.ts` | className 병합 (tailwind-merge + clsx) |
| `src/types/papaparse.d.ts`, `postscribe.d.ts` | 외부 라이브러리 타입 보강 |

## 컴포넌트 위치

> 도메인 종속 컴포넌트(예: `RouteOptimizerPanel`)가 `src/components/` 에 있는 것은 임시 상태.
> 신규 도메인 컴포넌트는 `src/domains/<domain>/components/` 로 작성한다.

| 위치 | 용도 |
|---|---|
| `src/components/ui/` | 도메인 무관 기본 UI (Button, Card, Input, Modal, Select, Loading, ErrorBoundary) |
| `src/components/layout/` | Layout, Header, Footer, Sidebar, Navigation |
| `src/components/map/` | TmapMainMap, TmapMap (지도 컴포넌트) |
| `src/components/panels/` | 도메인 종속 패널 (RouteOptimizer, MultiDriverResults, QuoteFromCustomerData, QuoteRiskReview, OptimizationHistory 등) — 향후 도메인 폴더로 이동 |
| `src/components/modals/` | AIQuoteChatModal, DriverRouteDetailModal, RiskReportModal |
| `src/components/AddressAutocomplete.tsx` | 주소 자동완성 (501줄, panels/로 이동 후보) |

## 테스트 (현 상태: 미도입)

| 패턴 | 권장 |
|---|---|
| `*.test.ts` | Vitest 도입 권장 — `src/domains/quote/pricing.ts` 같은 순수 계산은 우선 대상 |
| `*.spec.ts` | E2E는 Playwright 권장 |

> 신규 기능에 테스트를 함께 작성하라(`00-karpathy-guidelines.mdc` §4 Goal-Driven Execution).
> 견적 계산 / 경로 검증 / 캐시 키 정규화는 순수 함수 분리 가능성이 높아 테스트 우선 대상.

## 금지 패턴

| 금지 패턴 | 올바른 사용 |
|---|---|
| 컴포넌트 본문에 hex literal (`bg-[#3B82F6]`) | Tailwind 토큰 (`bg-primary-500`) 또는 `tailwind.config.ts` 확장 후 사용 |
| 인라인 글래스 (`bg-white/55 backdrop-blur-xl`) | `glass-panel` / `glass-card` 유틸리티 |
| UI/코드/주석 이모지 | lucide-react 아이콘 또는 텍스트 |
| `src/app/api/**/route.ts` 안의 비즈니스 로직 200줄+ | `src/domains/<domain>/services/` 로 분리 |
| Edge Function 내 `from '@/'` | `_shared/` 또는 자체 `lib/` |
| Tmap API 동일 입력 중복 호출 | `usePoiCache` 패턴 또는 서버 측 TTL 캐시 |
| 기본 Tailwind 색상 그라디언트 hero (`bg-gradient-to-br from-blue-500 to-blue-600`) | 단색 surface + `glass-panel` |

## 정합성 점검 (수동, 현 단계)

자동 검사 스크립트는 아직 없다. PR 검토 시 다음 항목 수동 확인:

- [ ] 거대 파일 명단의 LOC가 변경됐는지 (`.cursor/rules/31-anti-slop-code.mdc` §2 갱신)
- [ ] 신규 hex literal/이모지/인라인 글래스 추가 없는지
- [ ] API route 200줄+ 추가 시 services 분리 계획 명시됐는지
- [ ] Tmap/LLM 호출에 캐시 키 정규화 적용됐는지

## 아카이빙 / 참조 주의

- `dist/`, `.next/` → 빌드 산출물 (참조하지 말 것)
- `setup-status.md`, `SETUP_COMPLETE.md`, `QUOTE_RISK_REVIEW_SETUP.md` → 1회성 셋업 메모 (현행 사실과 불일치 가능, 참조 시 git log 확인)

## 프로젝트 Phase

PRD §10 마일스톤과 매핑. **현재 Phase가 바뀌면 본 섹션과 룰의 시점-종속 표를 함께 갱신.**

| Phase | 기간 | 주요 산출물 | 룰 적응 |
|---|---|---|---|
| **Phase 1 (MVP)** | ~M+2 | 최적배차, 단일 기사 시간 최적화, 기초 견적 | 토큰 시스템 단계적 도입, 거대 파일 분리 우선 |
| **Phase 2 (고도화)** | ~M+4 | 제약조건 모델러, PDF/Excel 견적서, 대시보드 | 시맨틱 토큰 완성, 다크모드, GlassCard tier 정착, 테스트 도입 |
| **Phase 3 (확장)** | ~M+6 | 실시간 위치 추적, 다국어, PWA, AI 예측 강화 | i18n 카피 톤 확장, RLS 활성화, Edge Function 분리, 모니터링 |

**현재 위치**: Phase 1 후반 ~ Phase 2 시작 (디자인 시스템 정착 중, 견적 도메인 구현 완료, 배차/추적/관리자는 미구현)

## 변경 이력

| 날짜 | 변경 | 트리거 |
|---|---|---|
| 2026-05-29 | 초기 작성 | ongManagement 룰 도입 |
| 2026-05-29 | Phase 2 디자인 토큰 도입 | OKLCH 시맨틱 토큰, 다크모드, GlassCard tier 시스템 |
| 2026-05-29 | dispatch 도메인 부분 구현 | 시나리오 비교/정기 빈도/역할 모델 + 신규 API 3종 + customers/recurring/scenario 마이그레이션 |
| 2026-05-29 | 견적 챗 에이전트 전환 + 구 파이프라인 제거 | `quote/agent-chat`(tool-calling) 신설, `quote/ai-chat-generate`(2661줄 규칙 파이프라인) 삭제, 지오코더 fullAddrGeo 폴백, eval:agent 6/6 |
