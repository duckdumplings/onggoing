# 공통 UI 컴포넌트 가이드

> Design System v2 · 2026-08-02

공통 primitive는 `src/components/ui/`에 있고, 도메인 조합 컴포넌트는 `src/domains/<domain>/components/`에 둔다.
전체 토큰 계약은 [design-system.md](./design-system.md)를 참고한다.

## 가져오기

```tsx
import { Button, Card, Input, Select, Badge, Modal } from '@/components/ui';
```

## Button

```tsx
<Button>견적 계산</Button>
<Button variant="secondary">저장</Button>
<Button variant="tonal">조건 수정</Button>
<Button variant="outline">취소</Button>
<Button variant="danger">삭제</Button>
<Button variant="ghost" size="icon" aria-label="패널 닫기"><X /></Button>
```

`isLoading` 중에는 중복 클릭이 막히고 `aria-busy`가 설정된다. icon-only 버튼은 반드시 `aria-label`을 가진다.

## Card와 Surface

```tsx
<Card>
  <CardHeader>
    <CardTitle>남풍산업</CardTitle>
    <CardDescription>10:00 배송 마감</CardDescription>
  </CardHeader>
  <CardContent>{/* 선택 라인의 핵심 정보 */}</CardContent>
</Card>
```

일반 정보 그룹은 `Card`, 앱 구조 표면은 `surface-low/base/raised/floating/overlay` 유틸을 쓴다.
`GlassCard`는 레거시 호환 wrapper이며 신규 화면의 기본 선택이 아니다.

## Input과 Select

```tsx
<Input label="상차지" value={origin} onChange={...} error={originError} />
<Select label="차종" options={vehicleOptions} value={vehicle} onChange={...} />
```

오류는 해당 필드에 연결한다. 읽기 전용 결과를 비활성 input으로 표현하지 않고 정의 목록이나 데이터 행을 쓴다.

## Badge

```tsx
<Badge variant="error">지각 예상</Badge>
<Badge variant="warning">재검토</Badge>
<Badge variant="success">마감 여유 18분</Badge>
<Badge variant="info">AI 제안</Badge>
```

Badge는 짧은 상태만 표현한다. 긴 설명이나 행동은 inline alert 또는 상세 패널에 둔다.

## Modal과 BottomSheet

같은 도메인 상세을 desktop에서는 `Modal`, compact에서는 `BottomSheet`로 노출할 수 있다. 제목과 닫기 버튼,
focus 이동, Escape 닫기를 유지한다. 확인 버튼은 오른쪽 또는 하단 sticky 영역에 일관되게 둔다.

## 도메인 조합 규칙

- 견적 목록 행: `상태 → 고객명 → 권장 상차/마감 → 시간당 견적`.
- 지도 marker: 번호와 작업 종류를 함께 표시.
- 타임라인: `도착 11:32 → 작업 8분 → 완료 11:40` 형식.
- 운임 근거: 운임표 시행일, 기본 시간, 초과 시간, 유류할증을 한 패널에 둔다.
- 단건 운임은 기본 대표값으로 강조하지 않는다.

## 완료 체크

- keyboard focus와 accessible name이 있는가?
- hover·selected·disabled·loading·error 상태가 있는가?
- compact에서 44px 터치 영역과 한 손 조작이 가능한가?
- 한국어 주소·금액·10개 이상 라인에서도 정보 순서가 유지되는가?
- `npm run lint:design:strict`를 통과하는가?
