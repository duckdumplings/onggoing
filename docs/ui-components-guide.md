# UI 컴포넌트 사용 가이드라인

## 개요
이 문서는 옹고잉 스마트 물류 플랫폼의 공통 UI 컴포넌트 라이브러리 사용법을 설명합니다.

## 설치된 컴포넌트

### 1. Button 컴포넌트

#### 기본 사용법
```tsx
import { Button } from '@/components/ui';

// Primary 버튼 (기본)
<Button>확인</Button>

// Secondary 버튼
<Button variant="secondary">취소</Button>

// Danger 버튼
<Button variant="danger">삭제</Button>

// Ghost 버튼
<Button variant="ghost">링크</Button>
```

#### 크기 옵션
```tsx
// Small
<Button size="sm">작은 버튼</Button>

// Medium (기본)
<Button size="md">중간 버튼</Button>

// Large
<Button size="lg">큰 버튼</Button>
```

#### 로딩 상태
```tsx
<Button isLoading>저장 중...</Button>
```

#### 아이콘과 함께 사용
```tsx
import { PlusIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

<Button leftIcon={<PlusIcon className="w-4 h-4" />}>
  새로 만들기
</Button>

<Button rightIcon={<ArrowRightIcon className="w-4 h-4" />}>
  다음으로
</Button>
```

### 2. Input 컴포넌트

#### 기본 사용법
```tsx
import { Input } from '@/components/ui';

// 기본 입력
<Input 
  label="이메일"
  placeholder="이메일을 입력하세요"
  type="email"
/>

// 오류 상태
<Input 
  label="이메일"
  error="올바른 이메일 형식이 아닙니다"
  type="email"
/>

// 도움말 텍스트
<Input 
  label="비밀번호"
  helperText="8자 이상 입력해주세요"
  type="password"
/>
```

#### 아이콘과 함께 사용
```tsx
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline';

<Input 
  label="이메일"
  leftIcon={<EnvelopeIcon className="w-4 h-4" />}
  type="email"
/>

<Input 
  label="비밀번호"
  rightIcon={<LockClosedIcon className="w-4 h-4" />}
  type="password"
/>
```

### 3. Select 컴포넌트

#### 기본 사용법
```tsx
import { Select } from '@/components/ui';

const vehicleOptions = [
  { value: 'truck-1', label: '트럭 1호' },
  { value: 'truck-2', label: '트럭 2호' },
  { value: 'truck-3', label: '트럭 3호' }
];

<Select 
  label="차량 선택"
  options={vehicleOptions}
  placeholder="차량을 선택하세요"
/>
```

### 4. Card 컴포넌트

#### 기본 사용법
```tsx
import { Card } from '@/components/ui';

// 기본 카드
<Card>
  <h3 className="text-lg font-semibold mb-2">카드 제목</h3>
  <p className="text-gray-600">카드 내용입니다.</p>
</Card>

// 상호작용 카드
<Card variant="interactive" onClick={() => console.log('클릭됨')}>
  <h3 className="text-lg font-semibold mb-2">클릭 가능한 카드</h3>
  <p className="text-gray-600">클릭해보세요.</p>
</Card>

// 상태별 카드
<Card status="success">
  <div className="flex items-center">
    <CheckCircleIcon className="w-5 h-5 text-success-500 mr-2" />
    <h3 className="text-lg font-semibold">배송 완료</h3>
  </div>
  <p className="text-gray-600 mt-2">배송이 성공적으로 완료되었습니다.</p>
</Card>
```

### 5. Modal 컴포넌트

#### 기본 사용법
```tsx
import { Modal, Button } from '@/components/ui';
import { useState } from 'react';

const MyComponent = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        모달 열기
      </Button>
      
      <Modal 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="확인"
      >
        <p>모달 내용입니다.</p>
        <div className="flex justify-end space-x-3 mt-4">
          <Button variant="secondary" onClick={() => setIsOpen(false)}>
            취소
          </Button>
          <Button onClick={() => setIsOpen(false)}>
            확인
          </Button>
        </div>
      </Modal>
    </>
  );
};
```

#### 크기 옵션
```tsx
<Modal size="sm">작은 모달</Modal>
<Modal size="md">중간 모달 (기본)</Modal>
<Modal size="lg">큰 모달</Modal>
<Modal size="xl">매우 큰 모달</Modal>
```

### 6. Loading 컴포넌트

#### 기본 사용법
```tsx
import { Loading } from '@/components/ui';

// Spinner
<Loading variant="spinner" text="로딩 중..." />

// Skeleton
<Loading variant="skeleton" lines={3} />

// 크기 조정
<Loading variant="spinner" size="lg" />
```

### 7. ErrorBoundary 컴포넌트

#### 기본 사용법
```tsx
import { ErrorBoundary } from '@/components/ui';

<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>
```

#### 커스텀 Fallback
```tsx
<ErrorBoundary 
  fallback={
    <div className="p-4 bg-red-50 border border-red-200 rounded">
      <h3 className="text-red-800">커스텀 에러 메시지</h3>
    </div>
  }
>
  <MyComponent />
</ErrorBoundary>
```

## 디자인 시스템 적용

### 색상 팔레트
모든 컴포넌트는 디자인 시스템의 색상 팔레트를 사용합니다:

- **Primary**: `primary-500`, `primary-600` 등
- **Secondary**: `secondary-100`, `secondary-200` 등
- **Success**: `success-500`, `success-600` 등
- **Warning**: `warning-500`, `warning-600` 등
- **Error**: `error-500`, `error-600` 등
- **Info**: `info-500`, `info-600` 등

### 접근성 (Accessibility)
모든 컴포넌트는 WCAG AA 가이드라인을 준수합니다:

- **ARIA 속성**: 적절한 `aria-*` 속성 사용
- **키보드 네비게이션**: Tab 키로 모든 요소 접근 가능
- **포커스 표시**: 명확한 포커스 인디케이터
- **스크린 리더**: 적절한 `role`과 `aria-label` 사용

### 반응형 디자인
모든 컴포넌트는 모바일 우선 반응형 디자인을 적용합니다:

- **모바일**: 기본 스타일
- **태블릿**: `md:` 브레이크포인트 이상
- **데스크톱**: `lg:` 브레이크포인트 이상

## 사용 시 주의사항

### 1. TypeScript 사용
모든 컴포넌트는 TypeScript로 작성되었으므로 타입 안전성을 보장합니다.

### 2. Tailwind CSS 클래스
커스텀 스타일링은 `className` prop을 통해 Tailwind CSS 클래스를 사용하세요.

### 3. 접근성 고려
컴포넌트 사용 시 접근성을 고려하여 적절한 `aria-label`과 `role`을 추가하세요.

### 4. 성능 최적화
불필요한 리렌더링을 방지하기 위해 `React.memo`를 사용하거나 `useCallback`을 활용하세요.

## 예시 코드

### 폼 예시
```tsx
import { Button, Input, Select } from '@/components/ui';

const QuoteForm = () => {
  const [formData, setFormData] = useState({
    email: '',
    vehicleType: '',
    distance: ''
  });

  const vehicleOptions = [
    { value: '레이', label: '레이' },
    { value: '스타렉스', label: '스타렉스' }
  ];

  return (
    <form className="space-y-4">
      <Input
        label="이메일"
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        required
      />
      
      <Select
        label="차량 타입"
        options={vehicleOptions}
        value={formData.vehicleType}
        onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
        required
      />
      
      <Input
        label="거리 (km)"
        type="number"
        value={formData.distance}
        onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
        required
      />
      
      <Button type="submit" isLoading>
        견적 요청
      </Button>
    </form>
  );
};
```

---

**마지막 업데이트**: 2025-01-27
**버전**: 1.0.0 