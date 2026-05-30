# 옹라우팅

Next.js 기반 반응형 웹(PWA)과 Supabase 백엔드를 활용해 배송 루트 최적화, 제약조건 모델링, 자동 견적·배차 추천, 실시간 차량 위치 추적, 관리자 대시보드를 제공하는 B2B 물류 솔루션입니다.

> **에이전트/개발자 시작점**: [`AGENTS.md`](./AGENTS.md) — 리포지터리 맵
> **디자인 정체성**: [`docs/design-system/north-star.md`](./docs/design-system/north-star.md)
> **작업 룰**: [`.cursor/rules/`](./.cursor/rules/) — Karpathy 가이드라인 + anti-slop + 도메인 워크플로

## 핵심 기능

### 1. 최적배차 시스템
- Tmap/Atlan API 연동 — 실시간 교통정보 반영 경로 최적화
- 다중 경유지 — n명의 배송원과 m개 배송지 자동 배정
- 제약조건 모델링 — 차종, 적재중량, 작업시간 고려
- 성능 지표 — 동일 입력 대비 3분 내 결과, 총 이동거리 10% 이상 감소

### 2. 견적 자동화
- 옹고잉 요금제 기반 — 시간당 / 단건 퀵 / 건당 고정 요금제
- 차종별 가중치 — 레이(1.0), 스타렉스(1.2)
- 실시간 계산 — 견적 생성 10초 이내, 계산 오류율 0.1% 이하
- AI Chat — 견적 의뢰 문서 업로드 → 정보 추출 → 견적 생성 → 리스크 리포트

### 3. 지도 시각화
- Tmap 기반 — 실시간 경로/마커/폴리라인
- 출발지/경유지/도착지 — 토큰 기반 컬러 분리 (`route-pin-origin`/`waypoint`/`destination`)
- 경로 정보 오버레이 — 거리, 시간, 최적화 효과 표시

## 기술 스택

### Frontend
- **Next.js 15** — App Router, ISR, Server Actions
- **React 18** + **TypeScript**
- **Tailwind CSS v3** — OKLCH 시맨틱 토큰 + 다크모드(`darkMode: 'class'`)
- **lucide-react** — 아이콘 (이모지 사용 금지)
- **framer-motion** — 마이크로 인터랙션

### Backend
- **Supabase** — PostgreSQL, Auth, Storage, Edge Functions
- **Tmap API** — 경로 최적화, POI 검색, 지오코딩
- **Atlan API** — 백업 경로 최적화

### Deployment
- **Vercel** — Next.js 최적화 배포
- **GitHub Actions** — CI/CD

## 프로젝트 구조

```
.cursor/rules/                # Cursor 룰 (anti-slop + Karpathy + 도메인 워크플로)
AGENTS.md                     # 리포 맵 (필독)
docs/
├── design-system/north-star.md  # 디자인 정체성 5축
├── design-system.md
├── design-guide-ia.md
├── domain-structure-guide.md
└── ...
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes (route-optimization, quote/*, poi-search, ...)
│   ├── globals.css           # 시맨틱 토큰 + 글래스 tier + 유틸리티
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                   # 도메인 무관 기본 UI
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── GlassCard.tsx     # tier: launcher / card / canvas
│   │   ├── Badge.tsx         # 상태 표시
│   │   ├── Skeleton.tsx      # 로딩 placeholder
│   │   ├── EmptyState.tsx
│   │   ├── SummaryCard.tsx   # KPI (tabular-nums)
│   │   └── ...
│   ├── map/                  # TmapMainMap, TmapMap
│   ├── modals/               # AIQuoteChatModal 등
│   └── panels/               # 도메인 종속 패널 (향후 domains/로 이동)
├── domains/                  # Domain-Driven Organization
│   ├── quote/                # 견적 도메인 (구현됨)
│   │   ├── pricing.ts
│   │   ├── services/
│   │   ├── knowledge/
│   │   ├── types/
│   │   └── evals/
│   ├── dispatch/             # 배차 (미구현, 현재 API route에 인라인)
│   ├── tracking/             # 실시간 추적 (Phase 3)
│   ├── auth/                 # 인증 (미구현, 현재 libs/auth.tsx)
│   └── admin/                # 관리자 대시보드 (Phase 2~3)
├── hooks/                    # 커스텀 React Hooks
├── libs/                     # 외부 라이브러리 래퍼 (Supabase, auth)
├── types/                    # 외부 라이브러리 타입 보강
└── utils/                    # 공통 유틸 (cn)
supabase/
├── functions/                # Edge Functions (현재 route-optimization 1개)
└── migrations/               # DB 스키마 (19개)
```

## 디자인 시스템

자세한 정체성과 슬롭 판정 기준은 [`docs/design-system/north-star.md`](./docs/design-system/north-star.md) 참조.

### 시맨틱 토큰

색상은 hex literal 직접 입력 금지. `globals.css`의 CSS 변수와 `tailwind.config.ts` 매핑을 사용한다.

| 그룹 | 사용 예 | 다크모드 자동 매핑 |
|---|---|---|
| `primary` | `bg-primary`, `text-primary-foreground` | ✓ |
| `success` / `warning` / `error` / `info` | `bg-success-muted text-success` | ✓ |
| `muted` | `text-muted-foreground` | ✓ |
| `border` / `ring` | `border-border`, `focus-visible:ring-ring` | ✓ |
| `chart-1~5` | `text-chart-1` | ✓ |
| `route-*` | `text-route-pin-origin` (지도 마커) | ✓ |

### 글래스 tier

| tier | 사용처 | CSS 클래스 | React 컴포넌트 |
|---|---|---|---|
| `launcher` | 사이드바, 런처 표면 | `.glass-launcher` | `<GlassCard tier="launcher">` |
| `card` (기본) | 일반 카드 | `.glass-card` | `<GlassCard tier="card">` |
| `canvas` | 모달, 강조 오버레이 | `.glass-canvas` | `<GlassCard tier="canvas">` |

### 카피 톤

토스/채널톡/카카오모빌리티 어드민 톤. 친절체("~요"), 도메인 명사 명시, 다음 행동 제시.

```
[금지] 확인하시겠습니까?       [권장] 경로를 최적화할까요?
[금지] 오류가 발생했습니다.    [권장] Tmap 호출에 실패했어요.
[금지] 데이터가 없습니다.      [권장] 최근 배차 이력이 없어요.
```

### 금지 패턴

- hex literal 직접 입력 (`bg-[#3B82F6]`)
- 인라인 글래스 (`bg-white/55 backdrop-blur-xl`) — `GlassCard` 또는 `.glass-*` 유틸리티 사용
- UI/코드/주석 이모지 — `lucide-react` 아이콘 사용
- 모든 카드 좌측 accent bar / 컬러 shadow 인플레이션
- "🚀 더 나은 …" 같은 hero 그라디언트 박스

상세: [`.cursor/rules/30-anti-slop-design.mdc`](./.cursor/rules/30-anti-slop-design.mdc).

## 시작하기

### 환경 설정
```bash
git clone [repository-url]
cd ai_onggoing
npm install
cp .env.local.example .env.local  # 또는 직접 작성
```

### 환경 변수
```env
NEXT_PUBLIC_TMAP_API_KEY=
TMAP_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 개발 서버
```bash
npm run dev
# 또는
./dev-restart.sh
```

### 빌드 검증
```bash
npx tsc --noEmit       # 타입 체크
npx next build         # 프로덕션 빌드
```

## 성능 지표

| 항목 | 목표 | 현재 |
|---|---|---|
| API 응답 시간 (P95) | < 800ms | ~500ms 평균 |
| 동시 세션 | 2,000 | — |
| 배차/견적 소요시간 감소 | 70% | — |
| ETA 오차 | ±5분 이내 90% | — |
| 실시간 위치 갱신 지연 | ≤ 15초 | (Phase 3) |
| 견적 계산 | 10초 이내 | — |

## 주요 API

| Endpoint | 설명 |
|---|---|
| `POST /api/route-optimization` | 단일/다중 경유지 경로 최적화 (Tmap) |
| `POST /api/multi-driver-optimization` | 다중 기사 배차 |
| `POST /api/quote-calculation` | 단순 견적 계산 |
| `POST /api/quote/ai-chat-generate` | AI 견적 챗봇 메인 |
| `POST /api/quote/extract-quote-info` | 견적 정보 추출 |
| `POST /api/quote/generate-risk-report` | 견적 리스크 리포트 |
| `POST /api/quote/pdf` | 견적서 PDF 생성 |
| `GET  /api/poi-search` | Tmap POI 검색 프록시 |

전체 목록은 [`AGENTS.md`](./AGENTS.md) §"API Routes 목록" 참조.

## 개발 가이드

### 코드 컨벤션
- 파일명: `PascalCase.tsx` (컴포넌트), `camelCase.ts` (유틸/서비스)
- 컴포넌트명: `PascalCase`
- 함수명: `camelCase`
- 상수: `UPPER_SNAKE_CASE`
- 절대 경로 import 사용 (`@/...`)

### 커밋 메시지
[`.cursor/rules/20-git-commit-message.mdc`](./.cursor/rules/20-git-commit-message.mdc) 준수.

```
feat(quote): add risk report generator
fix(route-optimization): handle empty waypoints array
docs(readme): align with design system tokens
refactor(panels): split RouteOptimizerPanel into 3 files
```

### 작업 흐름
새 화면/기능 추가 시:
1. **얇은 컨테이너 먼저** — Panel/Modal은 200줄 한도 의식
2. **데이터는 훅으로** — `hooks/useXxx.ts`
3. **순수 계산은 도메인 서비스로** — `src/domains/<domain>/services/`
4. **API route는 핸들러만** — 비즈 로직은 services에서 import
5. **거대 파일에 라인 추가 시 분리 계획 명시** — [`.cursor/rules/31-anti-slop-code.mdc`](./.cursor/rules/31-anti-slop-code.mdc) §1

## 배포

### Vercel
```bash
git push origin main          # 자동 배포
vercel --prod                  # 수동 배포
```

### 환경별 URL
- Development: `localhost:3000`
- Staging: `staging.ongoing.app`
- Production: `app.ongoing.app`

## 로드맵

PRD §10 마일스톤과 동기화. 자세한 Phase별 디자인 시스템 진화는 [`docs/design-system/north-star.md`](./docs/design-system/north-star.md) §3 참조.

### Phase 1 (MVP) — 완료/진행 중
- 기본 레이아웃, 경로 최적화, 견적 계산, 지도 시각화

### Phase 2 (고도화) — 현재 위치
- 디자인 토큰 시스템(OKLCH, 다크모드, GlassCard tier), Badge/Skeleton/EmptyState/SummaryCard 도입
- 제약조건 모델러, 견적서 PDF/Excel, 관리자 대시보드 (예정)

### Phase 3 (확장)
- PWA 완성, 다국어, 실시간 위치 추적, AI 예측

## 기여

1. Fork the repository
2. Create feature branch (`git checkout -b feat/your-feature`)
3. 작업 전 [`.cursor/rules/`](./.cursor/rules/) 및 [`AGENTS.md`](./AGENTS.md) 확인
4. 커밋 메시지 룰 준수
5. Push to branch & open Pull Request

## 라이선스

MIT
