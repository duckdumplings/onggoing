# 옹라우팅 Design System v2

> 구현 계약 · 2026-08-02
> 방향성은 [North Star](./design-system/north-star.md), 코드 가드는 [Design Guard](../.cursor/rules/30-anti-slop-design.mdc)를 따른다.

## 기반

- 서체: self-hosted Pretendard. 외부 Google Font 요청을 만들지 않는다.
- 색상: OKLCH 기반 역할 토큰. 실제 값은 `src/app/globals.css`에서 관리한다.
- 구현: Tailwind v3 역할 매핑은 `tailwind.config.ts`, 공통 primitive는 `src/components/ui/`.
- 모션: `--motion-fast/standard/emphasized`, reduced motion 지원.
- 공식 참고: [Material 3 Expressive](https://m3.material.io/), [M3 canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview).

## 역할 토큰

### Surface

| 역할 | 용도 |
|---|---|
| `surface-lowest` | 입력, 데이터 표, 지도 아래의 가장 밝은 작업 면 |
| `surface-low` | 앱 배경과 보조 영역 |
| `surface-base` | 기본 콘텐츠 영역 |
| `surface-raised` | 선택 가능한 카드·목록 |
| `surface-floating` | 지도 범례, command dock, popover |
| `surface-overlay` | modal, bottom sheet |

`surface-*` 유틸은 배경·테두리·elevation을 함께 제공한다. 새 코드에서 `glass-*`는 쓰지 않는다.
기존 `glass-*` 클래스는 전환 기간의 호환 alias일 뿐이다.

### Color roles

| 역할 | 의미 |
|---|---|
| `primary` / `primary-container` | 핵심 행동, 현재 선택 |
| `secondary-container` | 보조 행동, 필터 칩 |
| `tertiary-container` | AI 해석·추천처럼 구분이 필요한 보조 맥락 |
| `success-*` | 실행 가능, 마감 여유 |
| `warning-*` | 확인 필요, 여유 부족 |
| `error-*` | 실행 불가, 지각, 잘못된 입력 |
| `info-*` | 중립 안내, 경로 정보 |
| `outline` / `outline-variant` | 구조 구분과 비활성 경계 |

상태에는 텍스트 또는 아이콘을 병기한다. 지도 데이터 색은 `route-pin-*`, `route-line-*` 역할을 쓴다.

### Shape and elevation

| 토큰 | 기본 대상 |
|---|---|
| extra-small / `rounded-xs` | 작은 상태 표식 |
| small / `rounded-md` | 입력, 행 내부 컨트롤 |
| medium / `rounded-lg` | 카드 내부 그룹 |
| large / `rounded-xl` | 카드와 패널 |
| extra-large / `rounded-2xl` | workspace, modal, sheet |
| full / `rounded-full` | 버튼, 필터 chip, 상태 pill |

elevation은 `shadow-1/2/3`만 사용한다. 색이 들어간 그림자는 데이터 시각화 외에는 추가하지 않는다.

## 공통 컴포넌트

### Button

```tsx
<Button>견적 계산</Button>
<Button variant="tonal">조건 수정</Button>
<Button variant="outline">근거 보기</Button>
<Button variant="ghost" size="icon" aria-label="닫기"><X /></Button>
```

- 한 영역의 primary action은 하나만 둔다.
- `secondary`는 표면형 보조 행동, `tonal`은 현재 맥락의 추천 행동에 쓴다.
- 최소 높이 40px, 주요 행동은 44~48px.

### Input / Select

- label, 도움말, 오류문은 필드와 함께 제공한다.
- placeholder를 label로 쓰지 않는다.
- 시각은 `HH:mm`, 금액은 천 단위 구분과 `tabular-nums`를 쓴다.

### Card / list row

- Card는 정보 그룹, list row는 비교·선택을 위한 구조다.
- 다중 견적에서 각 행에 전체 지도나 전체 타임라인을 반복하지 않는다.
- 선택 행은 `primary-container` 또는 왼쪽 indicator로 표시하고 `aria-current`/`aria-selected`를 제공한다.

### Modal / BottomSheet

- desktop은 modal, compact는 bottom sheet를 우선한다.
- title, 설명, 닫기 accessible name, focus trap, Escape 닫기가 필요하다.
- destructive action은 기본 focus가 될 수 없다.

## 견적 화면 패턴

1. 요청 입력
2. AI 해석 확인: 주소, 작업 종류, 수량, 시각 의미
3. 경로·운임 계산
4. 예외 우선 결과 검토
5. 저장 또는 PDF 발행

목록에는 상태·고객·권장 상차·마감 여유·대표 시간당 견적만 둔다. 선택 상세에서 지도,
`도착 → 작업 → 완료`, 운임표 시행일, 유류할증 공식, 가정값을 확인한다. 단건 운임은 요청할 때만
대표값으로 전환하고, 그 외에는 참고값으로 표시한다.

## 적응형 레이아웃

- compact `< 768px`: 단일 흐름, sticky action, 상세 bottom sheet.
- medium `768~1199px`: 목록 + 선택 상세. 지도는 상세 상단.
- expanded `≥ 1200px`: 목록 + 지도 + 타임라인/운임 근거.

breakpoint보다 내용이 먼저다. 한국어 주소와 10개 이상 라인에서도 가로 스크롤 없이 핵심 행동이 보여야 한다.

## 검증

```bash
npm run lint:design:strict
npx tsc --noEmit
npm test
npm run build
```

desktop과 compact viewport에서 입력, 로딩, 오류, 빈 상태, 다중 라인, modal을 직접 확인한다.
