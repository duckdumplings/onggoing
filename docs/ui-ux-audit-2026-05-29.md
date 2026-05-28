# UI/UX · 디자인 시스템 · 라이브러리 종합 검토 (2026-05-29)

> 본 문서는 옹고잉 스마트 물류 플랫폼의 **현재 화면·코드 상태**를 디자인 시스템 룰(`.cursor/rules/30-anti-slop-design.mdc`, `docs/design-system/north-star.md`)과 대조하고, **즉시-단기-중기 개선안**을 우선순위와 함께 제시한다.
>
> 범위: `src/app/**`, `src/components/**`, `tailwind.config.ts`, `src/app/globals.css`, `package.json`, `docs/design-system/**`.

---

## 0. TL;DR — 핵심 진단

| 영역 | 현재 점수 | 1줄 진단 |
|---|---|---|
| **디자인 토큰/Tailwind** | ★★★★☆ | OKLCH 시맨틱 + GlassCard tier까지 잘 정의됐지만, **실제 코드에서 사용처가 거의 0**. |
| **UI 컴포넌트 라이브러리** | ★★★☆☆ | `ui/` 12종 컴포넌트 완성도 양호. 단 **앱 본문 패널들이 이 라이브러리를 거의 import하지 않음**. |
| **레이아웃/IA** | ★★☆☆☆ | `layout/Header·Sidebar·Layout·Footer·Navigation`이 작성돼 있으나 **앱에서 한 번도 사용되지 않는 데드코드**. 실제 IA는 단일 페이지 + 모달 패턴. |
| **anti-slop 룰 준수** | ★★☆☆☆ | 룰은 정의됐지만 **이모지 80+곳, 인라인 글래스 30+곳, 그라디언트 hero 20+곳** 잔존. |
| **접근성** | ★★☆☆☆ | Modal focus trap, Input aria 등 기본만 있고 키보드/스크린리더 종합 테스트 부재. |
| **거대 컴포넌트** | ★☆☆☆☆ | `AIQuoteChatModal 1,883줄`, `RouteOptimizerPanel 1,249줄`, `TmapMainMap 1,214줄`. **유지보수 한계 임박**. |
| **다크모드** | ★★★☆☆ | 토큰은 `.dark`까지 매핑됐으나 **토글 UI도, prefers-color-scheme 감지도 없음**. |

> **결론**: "디자인 시스템 설계는 좋은데, 적용이 안 됐다." 본 문서 §5의 **마이그레이션 플랜**이 가장 큰 임팩트를 낸다.

---

## 1. 현황 분석 (Codebase Findings)

### 1.1 디렉토리 구조

```
src/
├── app/                     # 라우트 (실제로는 / 한 페이지에 모든 기능 집중)
│   ├── page.tsx             # Home → HomePageClient
│   ├── HomePageClient.tsx   # 좌측 패널 + 지도 + 모달 (page.tsx와 거의 동일 — 중복)
│   ├── globals.css          # OKLCH 토큰, .dark, glass tier, .tabular 정의
│   └── api/                 # 30+개 API 라우트 (견적/배차/PDF 등)
├── components/
│   ├── ui/                  # 12개 디자인 시스템 컴포넌트 (잘 만들어짐)
│   ├── layout/              # 5개 레이아웃 컴포넌트 (전부 데드코드 — import 0회)
│   ├── panels/              # 9개 핵심 패널 (앱 본문)
│   ├── modals/              # 3개 거대 모달
│   ├── map/                 # 지도 4개 (TmapMainMap 1,214줄)
│   └── AddressAutocomplete.tsx (501줄, 잘 설계됨)
├── domains/                 # dispatch / quote / auth / admin / tracking
├── hooks/  libs/  utils/  types/
```

### 1.2 디자인 토큰 — 정의는 견고하나 사용처 0에 가까움

`src/app/globals.css` :root + `.dark` 양쪽에 풀세트 정의:
- 색: `--primary/--success/--warning/--error/--info/--muted/--destructive` + foreground/muted 변종
- 차트/지도: `--chart-1~5`, `--route-line`, `--route-pin-*`
- 글래스 tier: `.glass-launcher / .glass-card / .glass-canvas / .glass-overlay`
- 정밀 표현: `.tabular` (font-variant-numeric: tabular-nums slashed-zero)
- 라디우스: `--radius: 0.75rem`

**문제**: 정작 패널·모달은 다음과 같이 토큰을 우회한다.

```20:20:src/app/HomePageClient.tsx
className="hidden md:flex flex-col z-30 w-[28rem] bg-white/80 backdrop-blur-2xl border-r border-white/50 shadow-2xl shadow-indigo-500/5"
```

- `bg-white/80` + `backdrop-blur-2xl` = **인라인 글래스** → `.glass-canvas` 우회 (룰 §2 위반)
- `shadow-indigo-500/5` = **컬러 셰도우** → north-star §1 슬롭 리스트 ("모든 항목 컬러 shadow") 위반

이런 패턴이 `RouteOptimizerPanel`, `MultiDriverResultsPanel`, `RiskReportModal`, `DriverRouteDetailModal`, `TmapMainMap`, `AIQuoteChatModal` 전반에서 30+ 위치 반복.

### 1.3 이모지 사용 — 룰 §4 정면 위반

`.cursor/rules/30-anti-slop-design.mdc §4`에서 **운영 UI 이모지 전면 금지**를 선언했음에도, 핵심 패널이 다음과 같이 사용 중:

| 위치 | 사용 사례 |
|---|---|
| `RouteOptimizerPanel.tsx:471` | 로고 `🧭` `🗺️` |
| `RouteOptimizerPanel.tsx:496-509` | 모드 탭 `🚗` `🚛` |
| `RouteOptimizerPanel.tsx:672-674` | 종료 정책 `↩️` `🏁` `🛑` |
| `RouteOptimizerPanel.tsx:724-726` | 도로 옵션 `⏱️` `💰` `🛣️` |
| `RouteOptimizerPanel.tsx:747` `754` | 토글 `🔄` `📡` |
| `RouteOptimizerPanel.tsx:770` | 에러 `🚫` `⚠️` |
| `RouteOptimizerPanel.tsx:1133` | CTA `🚀 최적 경로 계산` |
| `MultiDriverResultsPanel.tsx:64,130,196,215,236` | `📊` `👉` `💡` `⚠️` `🔄` |
| `AIQuoteChatModal.tsx:844` | 시스템 메시지 `💡` |
| `HomePageClient.tsx:29` | 로고 `🧭` |

→ 이모지를 lucide-react 아이콘으로 1:1 치환 (예: `🚗 → <Car/>`, `🚛 → <Truck/>`, `🚀 → <Rocket/>`(혹은 제거), `⚠️ → <AlertTriangle/>`, `🏁 → <Flag/>`, `🛑 → <StopCircle/>`, `↩️ → <CornerDownLeft/>`, `🔄 → <RefreshCw/>`).

### 1.4 그라디언트 — allowlist 외 다수 사용

allowlist (`north-star §1 자산`): 로그인 hero(1개), 스켈레톤 shimmer, 지도 폴리라인.

위반 사례:
- `RouteOptimizerPanel.tsx:470` 로고 박스 `bg-gradient-to-br from-indigo-600 to-indigo-700`
- `RouteOptimizerPanel.tsx:1120` CTA 버튼 `bg-gradient-to-r from-indigo-600 to-indigo-700`
- `RouteOptimizerPanel.tsx:34` 텍스트 그라디언트 `bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 animate-gradient-x`
- `AIQuoteLauncher.tsx:11` 카드 배경 `bg-gradient-to-br from-violet-50/30 to-indigo-50/30`
- 그 외 5개 파일 20+ 위치

→ CTA 버튼은 단색 `bg-primary` + hover `bg-primary/90`로 충분. 텍스트 그라디언트는 **B2B 어드민 톤 위반**.

### 1.5 컴포넌트 라이브러리 — 만들어졌지만 적용 안 됨

`src/components/ui/`에 다음이 존재:

| 컴포넌트 | 상태 | 본문 패널의 import 횟수 |
|---|---|---|
| `Button` | 완성, 4 variant·3 size·loading·icon 슬롯 지원 | **0회** (모든 패널이 raw `<button className="...">`로 직접 작성) |
| `Input` | label·error·helperText·icon 슬롯 + useId | **0회** |
| `Select` | label·error·helperText·options + useId | **0회** |
| `Card` | basic/interactive/status variant | **0회** |
| `Modal` | focus trap·Escape·overlay close | **0회** (3개 모달 전부 인라인 구현) |
| `GlassCard` | launcher/card/canvas tier | **0회** |
| `Badge` | 7 variant·token 기반 | **0회** |
| `Skeleton` | rect/text/circle | **0회** (모든 로딩이 raw `animate-pulse` + 인라인) |
| `EmptyState` | icon·title·description·action | **0회** |
| `SummaryCard` | KPI + .tabular + trend | **0회** |

`OptimizationHistoryPanel`, `QuoteRiskReviewPanel` 등 일부 신규 패널만 ui/를 import. **모든 신규 작업이 ui/를 거치지 않고 raw Tailwind를 직접 박는 슬롭 사이클**이 형성됨.

### 1.6 레이아웃 컴포넌트 — 데드코드

```text
src/components/layout/
├── Header.tsx       # 옹라우팅 헤더 + 4개 메뉴 (배차/견적/추적/관리)
├── Sidebar.tsx
├── Layout.tsx       # Header + Sidebar + Footer 래퍼
├── Navigation.tsx
├── Footer.tsx
└── index.ts
```

전수 grep 결과 `app/`에서 import 0회. 실제 IA는 단일 `/` 페이지 + Modal 패턴이므로 이 5개 파일은 **삭제 후보**.

또한 `Layout.tsx` 안의 `defaultSidebarItems`가 `/dispatch/optimization`, `/quote/quick`, `/tracking/live` 등 **존재하지 않는 경로 24개**를 정의 — IA 문서 (`docs/design-guide-ia.md`)에 명시된 "지도 중심 SaaS, 단일 페이지 + 좌측 패널" 방향과 충돌.

### 1.7 거대 컴포넌트 — 유지보수 위험

| 파일 | 줄 수 | 주요 책임 (분리 필요) |
|---|---|---|
| `AIQuoteChatModal.tsx` | **1,883** | 채팅 UI · 세션 관리 · 첨부 파일 · 파일 생성 · 인증 · 미리보기 · 피드백 (7개 책임) |
| `RouteOptimizerPanel.tsx` | **1,249** | 입력 폼 · 옵션 아코디언 · 검증 · 단일/멀티 호출 · 히스토리 모달 · 결과 모달 (6개 책임) |
| `TmapMainMap.tsx` | **1,214** | 지도 init · 라우트 폴리라인 · 핀 · 결과 오버레이 · 차량 선택 (5개 책임) |
| `AddressAutocomplete.tsx` | 501 | 검색 · 캐시 · 디바운스 · 키보드 핸들링 — 단일 책임 OK |

### 1.8 Tailwind config — 토큰과 팔레트가 충돌

`tailwind.config.ts`의 `primary`가 두 가지 형태로 정의됨:
```ts
primary: {
  DEFAULT: 'var(--primary)',          // OKLCH 토큰 (시맨틱)
  foreground: 'var(--primary-foreground)',
  50: '#eff6ff',                      // ← 정적 hex (구 blue-50)
  500: '#3b82f6',                     // ← OKLCH primary(#4f46e5 indigo)와 hue 불일치
  ...
}
```

→ `bg-primary`(인디고)와 `bg-primary-500`(블루)이 **다른 색을 가리킴**. anti-slop §1에서 경고한 "임시 fallback" 부채가 그대로 남아있음.

### 1.9 카피 톤 — 룰 §6과 충돌하는 표현 잔존

룰: "잠시만 기다려 주세요" → "경로 최적화 중…"; "오류가 발생했습니다" → "Tmap 호출에 실패했어요".

위반 잔존:
- `RouteOptimizerPanel.tsx:1027` `'다중 배송원 최적화 중 오류가 발생했습니다: '`
- `RouteOptimizerPanel.tsx:1091` `'경로 최적화 중 오류가 발생했습니다: '`
- `RouteOptimizerPanel.tsx:1129` `'최적 경로 계산 중…'` (OK)
- `QuoteFromCustomerDataPanel.tsx:68` `'알 수 없는 오류가 발생했습니다'`
- `AIQuoteChatModal.tsx:851` `'죄송합니다. 서버 통신 중 문제가 발생했습니다.'`
- `Layout.tsx:162` `'오류가 발생했습니다'` (데드코드)

### 1.10 의존성 — 정리 필요

`package.json`에서 발견한 이슈:

| 패키지 | 버전 | 검토 |
|---|---|---|
| `react` `react-dom` | `^18` | Next 15 + React 19 이행 보류는 의도적인지 확인 필요 |
| `next` | `^15.5.13` | OK |
| `framer-motion` | `^12.35` | Motion v12 — 일부 패널에서만 사용. Tree-shaking 확인 필요 |
| `pdfkit` `jspdf` `pdf-parse` | 모두 포함 | **PDF 라이브러리 3개** 동시 사용 — 합리화 필요 |
| `xlsx` `papaparse` `docx` `mammoth` | 포함 | 문서 처리 4종, 각각 용도 명확하면 OK |
| `html2canvas` | `^1.4` | PDF 렌더에 쓰는지 확인. jspdf와 중복 가능성 |
| `lucide-react` | `^0.541` | 룰 §4 권장 아이콘 라이브러리 — OK |
| `clsx` + `tailwind-merge` | OK | `cn()` 유틸 (`src/utils/cn.ts`)에서 사용 — OK |
| `@dnd-kit/*` | OK | WaypointList 드래그 정렬 — OK |
| **(누락 가능성)** `@types/papaparse` `@types/xlsx` | — | DevDeps에서 일부 누락 가능 |
| **(누락)** ESLint design rule plugin | — | 룰을 사람이 지키지 못함 → 자동 검사 필요 |

---

## 2. UX/플로우 검토

### 2.1 메인 플로우 (지도 + 좌측 패널)

```
사용자 진입 → 좌측 패널 "경로 최적화"
  ├─ 차량 모드 (단일/다중) + 차종 (레이/스타렉스)
  ├─ 출발지 검색 + 체류/출발시간
  ├─ 경유지 목록 (드래그 정렬) + 체류/도착시간
  ├─ 고급 설정 아코디언 (종료 정책 · 도로 옵션 · 토글 2종)
  └─ "최적 경로 계산" (sticky footer)
→ 우측 지도에 폴리라인 표시
→ 다중 모드면 결과 모달, 단일 모드면 결과가 어디로 가는지 불명확
```

#### 이슈

- **결과 surface가 두 갈래**: 단일은 `data-section="quote"`로 스크롤이동, 다중은 fixed full-screen modal — 일관성 없음.
- **상태 머신 불명확**: 입력 → 검증 → 계산 중 → 결과 → 오류 → 재시도 전이가 UI에 명시되지 않고 `localError`/`fieldErrors`/`lastError`/`hasHardFailure`/`hasWarning` 5개 변수가 흩어져 분기됨.
- **고급 설정**의 종료 정책 라벨 `마지막 종료`가 모호 ("도착지 미설정"으로 변경 권장).
- **window 전역 의존**: `window.setRouteOptimizerInput`, `window.multiDriverResult`, `window.lastOptimizationError` 등 4곳 — 테스트성·SSR·타입안전성 저하.
- **데스크탑/모바일 분기**: 좌측 패널을 모바일에서 단순 상단 노출(`md:hidden`)만 함. 800줄짜리 입력폼이 모바일 상단에 그대로 펼쳐지면 지도까지 도달하기 어려움. **Bottom Sheet 패턴**(Tossface, KakaoNavi) 도입 권장.

### 2.2 AI 견적챗 모달

- 1,883줄에 채팅·세션·첨부·생성파일·인증·미리보기·피드백이 모두 들어있음.
- 세션 LocalStorage fallback + Supabase 양쪽 분기 → 동기화 코드 복잡.
- 첨부 업로드 흐름이 모달 하단 입력창과 분리돼 시야가 갈라짐.
- 평가용 evidence 패널은 룰 §0 "정밀(표현)"에 잘 맞는 자산 — **유지하되 컴포넌트 분리** 권장.

### 2.3 견적 결과 카드 / 다중 배송원 결과

`MultiDriverResultsPanel` 자체는 정보 구성이 좋다(요약 3종 + 배송원별 카드 + 분배 방식 설명). 그러나:
- 모든 KPI가 raw `<div>` (SummaryCard 미사용) → 토큰/`.tabular`/trend 표현이 빠짐.
- 배송원 색상 `DRIVER_COLORS[10]`이 `bg-indigo-50` 같은 정적 팔레트 — `--chart-1~5` 토큰을 확장해야 함 (10명 지원이면 chart-1~10).

### 2.4 접근성 (a11y) 빠진 점

- `Modal.tsx`에는 focus trap·aria가 있으나, **앱이 그 Modal을 안 씀**. 인라인 모달들은 focus trap·`role="dialog"`·`aria-modal`·focus restore 없음.
- 토글 스위치(`peer sr-only` 패턴): `role="switch"` + `aria-checked` 누락.
- 색상 대비: 글래스 표면 위 `text-slate-500/400` 다수 — 지도 위에서 WCAG AA 미달 가능.
- `prefers-reduced-motion`: `globals.css`에 정의됨(✓). 단 framer-motion `animate` props는 별도 가드 필요.
- 키보드: 출발지/경유지 ↔ 액션 영역 탭 순서가 시각 순서와 일치하는지 검증 필요.

### 2.5 다크모드

토큰은 `.dark` 클래스로 풀세트 매핑(✓). 단 **토글 UI 없음 / `prefers-color-scheme` 자동 감지 없음**. 운영자가 새벽 배차 시 사용한다면 다크모드 가치가 크다 — Phase 3 도입 항목으로 명시되어 있음.

---

## 3. 디자인 시스템 — 강점과 약점

### 강점 (유지)
1. **OKLCH + .dark 시맨틱 토큰** 풀세트
2. **GlassCard tier (launcher/card/canvas)** + `.glass-overlay` 정의
3. **.tabular** 유틸 (slashed-zero) — B2B 정밀 요구 정확히 반영
4. **anti-slop 룰** 자체가 잘 작성됨 (`.cursor/rules/30-anti-slop-design.mdc`)
5. **north-star 5축 체크리스트** — 정체성 가드가 명문화됨
6. **lucide-react** 아이콘 표준 채택
7. **`AddressAutocomplete`** — 상태 머신·캐시·디바운스가 잘 분리된 모범 사례

### 약점 (수정)
1. **사용처 0**: 시스템이 본문 코드에 침투하지 못함
2. **Tailwind primary 이중정의**: `var(--primary)` (인디고) vs `primary-500: #3b82f6` (블루)
3. **레이아웃 컴포넌트 데드코드**
4. **다크모드 토글 UI 부재**
5. **자동 lint·CI 가드 없음**: 룰 위반이 PR 단계에서 잡히지 않음
6. **카피·아이콘 표준 미적용**: 이모지·"오류가 발생했습니다" 잔존
7. **컴포넌트 카탈로그 없음**: Storybook/Ladle 같은 시각 카탈로그 부재 → 신규 작업자가 raw로 짜는 사이클을 끊지 못함

---

## 4. 권장 디자인 시스템 표준 (확장)

### 4.1 토큰 추가 (Phase 3 일부 선행)

```css
/* globals.css :root에 추가 */
:root {
  /* === Spacing scale (toss-style 8px grid) === */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
  --space-8: 32px; --space-10: 40px;

  /* === Elevation (semantic) === */
  --elevation-flat: 0 0 0 1px var(--border);
  --elevation-low:  0 1px 2px rgb(0 0 0 / 0.04);
  --elevation-mid:  0 4px 12px -2px rgb(0 0 0 / 0.06);
  --elevation-high: 0 24px 48px -12px rgb(0 0 0 / 0.18);

  /* === Z-index scale === */
  --z-base: 1; --z-sticky: 20; --z-overlay: 40;
  --z-modal: 50; --z-popover: 60; --z-toast: 70;

  /* === Driver palette 확장 (현재 4종, 최대 10명 지원) === */
  --driver-1: var(--chart-1);
  --driver-2: oklch(0.72 0.19 28);   /* rose */
  --driver-3: var(--chart-2);
  --driver-4: var(--chart-3);
  --driver-5: oklch(0.65 0.22 296);  /* violet */
  /* ... 10까지 */
}
```

### 4.2 Tailwind primary 충돌 해소

```ts
// tailwind.config.ts — 두 가지 선택지

// 옵션 A: primary는 시맨틱 토큰 단일, 정적 팔레트는 brand-blue로 분리
primary: {
  DEFAULT: 'var(--primary)',
  foreground: 'var(--primary-foreground)',
},
'brand-blue': { 50: '#eff6ff', 500: '#3b82f6', ... },

// 옵션 B: primary-50~900을 indigo 톤으로 맞춤 (#4f46e5 베이스)
primary: {
  DEFAULT: 'var(--primary)',
  foreground: 'var(--primary-foreground)',
  50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe',
  300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1',
  600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81',
},
```

→ **옵션 B 권장** (DEFAULT(#4f46e5)와 600(#4f46e5) 일치).

### 4.3 컴포넌트 추가 (필수)

| 컴포넌트 | 용도 | 우선순위 |
|---|---|---|
| `Switch` | 토글 (현재 `peer sr-only`로 매번 인라인) | P1 |
| `RadioGroup` | 종료 정책·도로 옵션 (현재 grid+button 인라인) | P1 |
| `Tabs` | 단일/다중 모드, 차량 타입 (현재 button 그룹) | P1 |
| `Tooltip` | 균형도 ?, 옵션 설명 (현재 `group:hover` div 인라인) | P1 |
| `Toast` | 저장/로드 알림 (현재 `historyNotice` 인라인 박스) | P2 |
| `Dialog` (라디오 모달) | `Modal` 확장. portal·focus trap·scroll lock | P1 |
| `Sheet` (Bottom Sheet) | 모바일 패널, 모바일에서 입력 폼 | P2 |
| `Stepper` | 출발→경유→옵션→실행 진척도 시각화 | P3 |
| `DataTable` | 견적 이력, 다중 결과 표 | P2 |
| `Chart` (recharts wrapper) | 거리/시간/요금 비교 | P3 |

### 4.4 컴포넌트 카탈로그 (Storybook 또는 Ladle)

신규 작업자가 ui/ 컴포넌트를 raw 인라인 대신 사용하도록 유도.
- `/storybook` 라우트 또는 별도 빌드
- 각 컴포넌트당 stories: variant matrix + 다크모드 토글 + 한국어 카피 예시

---

## 5. 마이그레이션 플랜 (우선순위·임팩트·공수)

### Phase α — Hygiene (1주 이내, 5% 시각 변화 — polish 등급) — **완료 (2026-05-29)**

목표: **anti-slop 룰을 코드에서 가시화**. 시각 변화는 작지만 부채를 멈춤.

| Task | 영향 파일 | 상태 |
|---|---|---|
| α-1. `layout/` 5개 컴포넌트 삭제 (데드코드) | `components/layout/**` | ✓ 완료 |
| α-2. Tailwind `primary` 팔레트를 indigo 톤으로 정렬 (옵션 B) | `tailwind.config.ts` | ✓ 완료 (#6366f1/#4f46e5 정렬) |
| α-3. README/문서 이모지 일괄 제거 | `README.md`, `AGENTS.md`, `SETUP_COMPLETE.md`, `setup-status.md`, `docs/design-system.md`, `docs/design-guide-ia.md` | ✓ 완료 (헤더 정리, v1 구문서 안내 추가) |
| α-4. 카피 톤 일괄 치환 | 16곳 (panels 4 + modals 4 + map 2 + api 6) | ✓ 완료 |
| α-5. ESLint + design-slop 스캐너 도입 | `.eslintrc.json`, `scripts/check-design-slop.ts`, `package.json` | ✓ 완료 |

#### Phase α 종료 시점 슬롭 카운트 (베이스라인)

`npm run lint:design` 출력 기준.

| 카테고리 | 위반 수 | 목표 (Phase β 종료) |
|---|---|---|
| 이모지 (UI/console) | 137건 | 30건 이하 |
| 인라인 글래스 | 25건 | 5건 이하 |
| 컬러 셰도우 | 10건 | 3건 이하 |
| 그라디언트 박스 | 16건 | 5건 이하 (login/skeleton/route polyline만) |
| window.* 전역 | 3건 | 0건 |

> **회귀 검증**: `npx tsc --noEmit` 통과 / `next lint` 신규 에러 없음.

### Phase β — 디자인 시스템 적용 (2-3주, noticeable 등급)

목표: ui/ 컴포넌트 사용률 0% → 60%+, 룰 위반 30+곳 → 5곳 이하.

| Task | 영향 | 공수 |
|---|---|---|
| β-1. `Switch`/`RadioGroup`/`Tabs`/`Tooltip` 컴포넌트 신규 추가 | `components/ui/*` | 1d |
| β-2. `RouteOptimizerPanel` 리팩토링: 이모지 → lucide / 인라인 글래스 → `GlassCard` / 종료정책·도로옵션 → RadioGroup / 토글 → Switch / CTA 그라디언트 제거 → 단색 `bg-primary` | `RouteOptimizerPanel.tsx` | 1.5d |
| β-3. `MultiDriverResultsPanel` 리팩토링: 요약 → SummaryCard / 드라이버 카드 → `Card` + `Badge` / `?` 툴팁 → Tooltip / 이모지 제거 | `MultiDriverResultsPanel.tsx` | 1d |
| β-4. `AIQuoteChatModal` 분할: `chat/` 도메인으로 옮기고 `Sessions`, `Messages`, `Attachments`, `Auth`, `Preview` 5개로 쪼개기 | `domains/quote/chat/**` 신규 | 3d |
| β-5. `Modal` 컴포넌트로 3개 모달 일괄 치환 (`AIQuoteChatModal`/`RiskReportModal`/`DriverRouteDetailModal`) | `modals/**` | 1d |
| β-6. raw `animate-pulse` → `Skeleton`, raw 빈 상태 → `EmptyState` 치환 | 전 패널 | 1d |
| β-7. KPI 표시 `<div className="text-lg font-black ...">` → `SummaryCard` + `.tabular` | `MultiDriverResultsPanel`, `RouteResultsCard` 등 | 1d |

### Phase γ — UX·접근성 (2주, obvious 등급)

| Task | 임팩트 | 공수 |
|---|---|---|
| γ-1. 모바일 Bottom Sheet 패턴 도입 (좌측 패널 → 모바일에선 swipe-up sheet) | 모바일 사용성 1차 결정 | 3d |
| γ-2. 다크모드 토글 UI + `prefers-color-scheme` 자동 감지 + localStorage 영속 | 야간 운영자 UX | 1d |
| γ-3. 키보드/스크린리더 종합 점검 (axe-core, NVDA·VoiceOver) — focus trap·tab order·aria-live for 결과 | WCAG AA 준수 | 2d |
| γ-4. `optimizeRouteWith` 상태 머신화 (xstate 또는 가벼운 reducer): `idle / validating / requesting / success / error` 단일 진실원 | 5개 흩어진 변수 제거 | 1.5d |
| γ-5. `window.*` 전역 이벤트 제거 → context/zustand로 RouteOptimizer ↔ AIQuoteChat 통신 | 타입안전 | 1d |
| γ-6. Storybook 도입 + ui/ 12종 + 신규 4종 스토리 작성 | 신규 작업자 가드 | 2d |

### Phase δ — 라이브러리 정리 (1주)

| Task | 공수 |
|---|---|
| δ-1. PDF 라이브러리 합리화: `pdfkit`(서버) + `jspdf`(클라) + `html2canvas` 중 실제 사용처 확정, 미사용 제거 | 1d |
| δ-2. `framer-motion` 사용 패턴 검토 (단순 transition은 CSS로 대체 가능한 부분 식별) | 0.5d |
| δ-3. `next/font/google` Inter + (Phase 3) Pretendard Variable 도입 | 0.5d |
| δ-4. recharts (또는 Visx) 도입 — 견적/배차 비교 차트 컴포넌트 | 1d |

---

## 6. 즉시 실행 가능한 코드 변경 예시

### 6.1 anti-slop ESLint 가드 (Phase α-5)

```js
// .eslintrc.js (발췌)
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "JSXAttribute[name.name='className'] > Literal[value=/backdrop-blur/]",
        message: '인라인 글래스 금지. <GlassCard tier=".."> 또는 .glass-* 유틸리티 사용.',
      },
      {
        selector: "JSXAttribute[name.name='className'] > Literal[value=/bg-gradient-to-/]",
        message: '그라디언트 박스는 allowlist(로그인 hero, skeleton shimmer, 지도 폴리라인)만 허용.',
      },
    ],
    'no-restricted-properties': [
      'error',
      { object: 'window', property: 'setRouteOptimizerInput', message: 'context로 이전' },
    ],
  },
};
```

추가로 별도 스크립트로 이모지 검사:

```ts
// scripts/check-emoji.ts
import { glob } from 'glob';
import fs from 'fs';

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{1F000}-\u{1F02F}]/u;
const files = await glob('src/**/*.{ts,tsx}');
const violations: string[] = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (EMOJI_RE.test(line)) violations.push(`${f}:${i + 1} ${line.trim()}`);
  });
}
if (violations.length) {
  console.error('이모지 사용 금지 (룰 §4):\n' + violations.join('\n'));
  process.exit(1);
}
```

`package.json` script:
```json
"lint:design": "eslint src && tsx scripts/check-emoji.ts"
```

### 6.2 `RouteOptimizerPanel` 헤더 리팩토링 예시 (β-2 발췌)

현재:
```467:478:src/components/panels/RouteOptimizerPanel.tsx
      <div className="flex-none px-5 py-5 border-b border-slate-100 bg-white/60 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl shadow-lg shadow-indigo-200 text-white flex items-center justify-center">
              <span className="text-lg">🗺️</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">경로 최적화</h2>
            </div>
          </div>
        </div>
      </div>
```

목표:
```tsx
import { Map } from 'lucide-react';
import { GlassCard } from '@/components/ui';

<GlassCard tier="launcher" className="flex-none px-5 py-5 border-b border-border">
  <div className="flex items-center gap-3">
    <div className="p-2.5 bg-primary text-primary-foreground rounded-lg">
      <Map className="w-5 h-5" />
    </div>
    <h2 className="text-lg font-semibold text-foreground tracking-tight">경로 최적화</h2>
  </div>
</GlassCard>
```

룰 통과: §1(토큰 사용), §2(GlassCard), §4(lucide), §5(그라디언트 제거).

### 6.3 CTA 버튼 (β-2 발췌)

현재 ((1118)):
```tsx
className={`w-full h-14 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 ...
  : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:shadow-indigo-300 hover:-translate-y-0.5'`}
```

목표:
```tsx
import { Button } from '@/components/ui';

<Button
  ref={optimizeButtonRef}
  size="lg"
  isLoading={isLoading || isMultiDriverLoading}
  onClick={...}
  className="w-full h-14"
>
  {optimizationMode === 'multi' ? `${driverCount}명 배송원 경로 계산` : '최적 경로 계산'}
</Button>
```

### 6.4 KPI → SummaryCard (β-7 발췌)

현재 `MultiDriverResultsPanel:87`:
```tsx
<div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm text-center">
  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">총 거리</div>
  <div className="text-lg font-black text-slate-800">{(summary.totalDistance / 1000).toFixed(1)}<span className="text-xs font-medium text-slate-400 ml-0.5">km</span></div>
</div>
```

목표:
```tsx
import { SummaryCard } from '@/components/ui';

<SummaryCard
  label="총 거리"
  value={(summary.totalDistance / 1000).toFixed(1)}
  unit="km"
/>
```

→ 자동으로 `.tabular`, slashed-zero, 토큰화된 라벨 색, hover 효과 적용.

### 6.5 다크모드 토글 (γ-2 발췌)

```tsx
// src/components/ui/ThemeToggle.tsx
'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = stored ?? (prefers ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', initial === 'dark');
    setTheme(initial);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? '라이트모드로 전환' : '다크모드로 전환'}
      className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
```

좌측 패널 헤더 우측에 배치.

---

## 7. 측정 지표 (Phase 진입 전/후)

PR마다 다음을 기록한다.

| 지표 | 측정 방법 | 목표 (Phase β 완료) |
|---|---|---|
| ui/ 컴포넌트 사용률 | `rg "from '@/components/ui'" src/components/panels src/components/modals` 파일 수 / 전체 패널·모달 파일 수 | 60%+ |
| 인라인 글래스 위반 | `rg "bg-white/\\d+.*backdrop-blur" src/` | 0건 (현재 30+) |
| 그라디언트 위반 | `rg "bg-gradient-to-" src/` (allowlist 제외) | 5건 이하 (현재 20+) |
| 이모지 위반 | `scripts/check-emoji.ts` | 0건 (현재 80+) |
| Lighthouse a11y (지도 페이지) | CI에서 측정 | 95+ |
| 거대 컴포넌트 (>800줄) | `find src -name "*.tsx" \| xargs wc -l \| awk '$1 > 800'` | 0개 (현재 3개) |
| 다크모드 토글 동작 | 수동 QA | OK |
| TypeScript strict 에러 | `tsc --noEmit` | 0 |

---

## 8. 결정 필요 항목 (사용자 확인)

다음은 단독으로 결정하기 어려우므로 컨펌이 필요합니다.

1. **Phase α-1 (layout/ 삭제)**: 정말 데드코드라면 5개 파일 삭제 — 향후 멀티 페이지로 확장 계획이 있다면 보존.
2. **Tailwind primary 옵션 A/B**: 옵션 B(인디고 정렬) 권장 — 동의 시 진행.
3. **다중 결과 surface 통일**: full-screen modal → 좌측 패널 하단 슬롯 또는 우측 지도 위 floating panel 중 선택.
4. **모바일 패턴**: Bottom Sheet 채택 — 디자인 시안 필요시 별도 패스.
5. **Storybook vs Ladle**: 무게(Ladle) vs 생태계(Storybook). 권장은 Ladle (빌드 빠름, B2B 어드민 규모에 적합).
6. **거대 모달 분할 범위**: AIQuoteChatModal 1,883줄을 통째로 도메인 이전 → 1주 이상 소요. 동의 시 별도 PR 시리즈로 진행.

---

## 9. 즉시 시작 가능한 PR 후보 (작은 PR 시리즈)

위 마이그레이션 플랜에 따라, 다음 순서로 PR을 쪼개면 리뷰가 쉽습니다.

1. **PR-1 `chore(design)`: layout/ 데드코드 삭제 + Tailwind primary 정렬** (α-1, α-2)
2. **PR-2 `chore(design)`: ESLint design 가드 + 이모지 스캔 스크립트** (α-5)
3. **PR-3 `refactor(copy)`: "오류가 발생했습니다" 등 카피 톤 일괄 치환** (α-4)
4. **PR-4 `feat(ui)`: Switch / RadioGroup / Tabs / Tooltip 컴포넌트 추가** (β-1)
5. **PR-5 `refactor(panel)`: RouteOptimizerPanel 헤더·CTA·옵션 → 토큰화** (β-2)
6. **PR-6 `refactor(panel)`: MultiDriverResultsPanel → SummaryCard/Card/Badge** (β-3, β-7)
7. **PR-7 `feat(ui)`: ThemeToggle + prefers-color-scheme** (γ-2)
8. **PR-8 `refactor(modal)`: 3개 모달 → 통합 Modal 컴포넌트** (β-5)
9. **PR-9 `refactor(chat)`: AIQuoteChatModal 1,883줄 → domains/quote/chat 분할** (β-4)
10. **PR-10 `feat(mobile)`: Bottom Sheet + 모바일 UX 패스** (γ-1)

---

## 10. 참고

- `.cursor/rules/30-anti-slop-design.mdc` — 룰 (시점-무관 §1~§8 + 시점-종속 [현재 상태 스냅샷])
- `docs/design-system/north-star.md` — 정체성 5축 + 자산/슬롭 판정 기준
- `docs/design-guide-ia.md` — IA 정의 (지도 중심 SaaS)
- `docs/design-system.md` — 컴포넌트 카탈로그 (구문서, 위 north-star가 상위)

> **다음 단계 제안**: 본 문서를 기준으로 §8 결정 항목을 답해 주시면, §9 PR-1부터 순차 진행하겠습니다.
