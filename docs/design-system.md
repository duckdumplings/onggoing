# 디자인 시스템

> **구문서 안내**: 본 문서는 v1.0(2025-01)로, 토큰·정체성의 상위 정의는 [`docs/design-system/north-star.md`](./design-system/north-star.md)와 [`.cursor/rules/30-anti-slop-design.mdc`](../.cursor/rules/30-anti-slop-design.mdc)에 있다. 본 문서는 Phase 2 컴포넌트 카탈로그가 정착될 때까지 참고용으로 유지한다.

## iOS Glass 디자인 가이드(신규)

본 프로젝트는 지도 중심 SaaS 전환과 함께 iOS 글래스(유리질감) 스타일을 기본 테마로 채택한다. 글래스 UI는 반투명 배경, 블러, 미세한 보더/하이라이트, 소프트 섀도우, 고채도 포인트 컬러를 특징으로 한다.

### 디자인 토큰
- 색상
  - `--glass-surface`: rgba(255,255,255,0.6)
  - `--glass-border`: rgba(255,255,255,0.35)
  - `--glass-highlight`: rgba(255,255,255,0.8)
  - `--glass-shadow`: 0 10px 30px rgba(2, 6, 23, 0.08)
  - `--primary`: #2563eb
- 효과
  - `--backdrop-blur`: blur(16px)
  - `--ring`: 1px solid rgba(255,255,255,0.4)

### Tailwind 설정 예시
```ts
// tailwind.config.ts (발췌)
theme: {
  extend: {
    colors: {
      primary: {
        500: '#2563eb',
        600: '#1d4ed8'
      }
    },
    boxShadow: {
      glass: '0 10px 30px rgba(2, 6, 23, 0.08)'
    },
    backdropBlur: {
      xl: '16px'
    },
    backgroundColor: {
      'glass-surface': 'rgba(255,255,255,0.6)'
    },
    borderColor: {
      'glass': 'rgba(255,255,255,0.35)'
    }
  }
}
```

### 유틸리티 클래스(Globals)
```css
/* src/app/globals.css (발췌) */
.glass-panel {
  @apply bg-glass-surface backdrop-blur-xl border border-glass shadow-glass rounded-2xl;
}
.glass-card {
  @apply glass-panel p-4 md:p-6;
}
.glass-button-primary {
  @apply inline-flex items-center justify-center rounded-lg px-4 py-2 font-semibold text-white bg-primary-500 hover:bg-primary-600 shadow-glass;
}
.glass-floating {
  @apply glass-panel ring-1 ring-white/40;
}
```

### 컴포넌트 가이드
- 패널(`glass-panel`)을 좌측 기능 패널 및 지도 오버레이 카드 기본 스타일로 사용
- 버튼은 `glass-button-primary`를 1차 CTA에 적용, 보조는 투명/라이트 변형 사용
- 섀도/블러는 과도하지 않게 유지하여 가독성 확보

### 접근성 주의사항
- 반투명 배경 대비 이슈를 방지하기 위해 텍스트는 최소 WCAG AA 대비를 보장
- 배경 이미지/지도 위 텍스트에는 반투명 오버레이를 추가하여 대비 확보

### 통화 표기(KRW 고정)
- 정책: MVP 기간 동안 통화는 KRW 고정
- 포맷: `₩${value.toLocaleString('ko-KR')}` (소수점 제거, 천단위 구분)
- API: 응답에 `currency: "KRW"`, `formattedTotal`(선택) 포함 가능
- 문서/화면의 모든 금액 표기는 위 규칙을 따른다

## Ongoing Smart Logistics Platform

> **버전**: 1.0  
> **최종 수정일**: 2025-01-27  
> **참고**: Material Design, Fluent Design, Tailwind UI

---

## 목차

1. [디자인 원칙](#디자인-원칙)
2. [색상 시스템](#색상-시스템)
3. [타이포그래피](#타이포그래피)
4. [컴포넌트 라이브러리](#컴포넌트-라이브러리)
5. [아이콘 시스템](#아이콘-시스템)
6. [레이아웃 및 그리드](#레이아웃-및-그리드)
7. [반응형 디자인](#반응형-디자인)
8. [물류 특화 컴포넌트](#물류-특화-컴포넌트)

---

## 디자인 원칙

### 핵심 가치
1. **명확성 (Clarity)** - 복잡한 물류 정보를 직관적으로 전달
2. **효율성 (Efficiency)** - 빠른 작업 완료를 위한 최적화된 UI
3. **신뢰성 (Reliability)** - 정확한 정보와 안정적인 시스템
4. **접근성 (Accessibility)** - 모든 사용자가 쉽게 이용 가능
5. **확장성 (Scalability)** - 다양한 물류 시나리오에 대응

### 디자인 철학
- **정보 우선**: 데이터와 기능이 시각적 요소보다 우선
- **일관성**: 모든 화면에서 동일한 패턴과 언어 사용
- **피드백**: 사용자 액션에 대한 즉각적인 시각적 피드백
- **단순성**: 불필요한 요소 제거로 핵심 기능에 집중

---

## 색상 시스템

### 브랜드 색상
```css
/* Primary Colors */
--primary-50: #eff6ff;
--primary-100: #dbeafe;
--primary-200: #bfdbfe;
--primary-300: #93c5fd;
--primary-400: #60a5fa;
--primary-500: #3b82f6;  /* 메인 브랜드 컬러 */
--primary-600: #2563eb;
--primary-700: #1d4ed8;
--primary-800: #1e40af;
--primary-900: #1e3a8a;

/* Secondary Colors */
--secondary-50: #f8fafc;
--secondary-100: #f1f5f9;
--secondary-200: #e2e8f0;
--secondary-300: #cbd5e1;
--secondary-400: #94a3b8;
--secondary-500: #64748b;
--secondary-600: #475569;
--secondary-700: #334155;
--secondary-800: #1e293b;
--secondary-900: #0f172a;
```

### 기능별 색상
```css
/* Success - 완료, 성공 */
--success-50: #f0fdf4;
--success-500: #22c55e;
--success-600: #16a34a;

/* Warning - 경고, 주의 */
--warning-50: #fffbeb;
--warning-500: #f59e0b;
--warning-600: #d97706;

/* Error - 오류, 실패 */
--error-50: #fef2f2;
--error-500: #ef4444;
--error-600: #dc2626;

/* Info - 정보, 알림 */
--info-50: #eff6ff;
--info-500: #3b82f6;
--info-600: #2563eb;
```

### 상태별 색상
```css
/* 배송 상태 색상 */
--status-pending: #f59e0b;    /* 대기중 */
--status-in-transit: #3b82f6; /* 운송중 */
--status-delivered: #22c55e;  /* 배송완료 */
--status-failed: #ef4444;     /* 배송실패 */

/* 차량 상태 색상 */
--vehicle-available: #22c55e;   /* 사용가능 */
--vehicle-busy: #f59e0b;       /* 운송중 */
--vehicle-offline: #6b7280;     /* 오프라인 */
--vehicle-maintenance: #ef4444; /* 정비중 */
```

### 사용 가이드라인
- **Primary**: 주요 액션 버튼, 브랜딩 요소
- **Secondary**: 보조 액션, 배경 요소
- **Success**: 완료 상태, 성공 메시지
- **Warning**: 경고 메시지, 주의사항
- **Error**: 오류 메시지, 실패 상태
- **Info**: 정보 표시, 알림

---

## 타이포그래피

### 폰트 스택
```css
/* 기본 폰트 */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* 코드 폰트 */
font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
```

### 타이포그래피 스케일
```css
/* Display */
.text-display-2xl { font-size: 4.5rem; line-height: 1.1; font-weight: 700; }
.text-display-xl { font-size: 3.75rem; line-height: 1.1; font-weight: 700; }
.text-display-lg { font-size: 3rem; line-height: 1.2; font-weight: 600; }

/* Headings */
.text-h1 { font-size: 2.25rem; line-height: 1.2; font-weight: 600; }
.text-h2 { font-size: 1.875rem; line-height: 1.3; font-weight: 600; }
.text-h3 { font-size: 1.5rem; line-height: 1.4; font-weight: 600; }
.text-h4 { font-size: 1.25rem; line-height: 1.5; font-weight: 600; }
.text-h5 { font-size: 1.125rem; line-height: 1.5; font-weight: 600; }
.text-h6 { font-size: 1rem; line-height: 1.5; font-weight: 600; }

/* Body */
.text-body-lg { font-size: 1.125rem; line-height: 1.6; font-weight: 400; }
.text-body { font-size: 1rem; line-height: 1.6; font-weight: 400; }
.text-body-sm { font-size: 0.875rem; line-height: 1.5; font-weight: 400; }

/* Caption */
.text-caption { font-size: 0.75rem; line-height: 1.4; font-weight: 400; }
.text-caption-sm { font-size: 0.625rem; line-height: 1.4; font-weight: 400; }
```

### 사용 가이드라인
- **Display**: 페이지 제목, 대형 헤더
- **Headings**: 섹션 제목, 카드 제목
- **Body**: 본문 텍스트, 설명
- **Caption**: 부가 정보, 라벨

---

## 🧩 컴포넌트 라이브러리

### 버튼 (Buttons)

#### 기본 버튼
```tsx
// Primary Button
<button className="
  px-4 py-2 
  bg-primary-500 hover:bg-primary-600 
  text-white font-medium 
  rounded-lg 
  transition-colors duration-200
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
">
  기본 버튼
</button>

// Secondary Button
<button className="
  px-4 py-2 
  bg-secondary-100 hover:bg-secondary-200 
  text-secondary-700 font-medium 
  rounded-lg 
  transition-colors duration-200
  focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:ring-offset-2
">
  보조 버튼
</button>

// Danger Button
<button className="
  px-4 py-2 
  bg-error-500 hover:bg-error-600 
  text-white font-medium 
  rounded-lg 
  transition-colors duration-200
  focus:outline-none focus:ring-2 focus:ring-error-500 focus:ring-offset-2
">
  위험 버튼
</button>
```

#### 버튼 크기
```tsx
// Small
<button className="px-3 py-1.5 text-sm">작은 버튼</button>

// Medium (기본)
<button className="px-4 py-2">중간 버튼</button>

// Large
<button className="px-6 py-3 text-lg">큰 버튼</button>

// Icon Button
<button className="
  p-2 
  bg-primary-500 hover:bg-primary-600 
  text-white 
  rounded-lg
  transition-colors duration-200
">
  <Icon className="w-5 h-5" />
</button>
```

### 입력 폼 (Input Forms)

#### 텍스트 입력
```tsx
// 기본 입력
<div className="space-y-2">
  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
    이메일
  </label>
  <input
    type="email"
    id="email"
    className="
      w-full px-3 py-2 
      border border-gray-300 rounded-lg 
      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
      placeholder-gray-400
    "
    placeholder="이메일을 입력하세요"
  />
</div>

// 오류 상태
<div className="space-y-2">
  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
    이메일
  </label>
  <input
    type="email"
    id="email"
    className="
      w-full px-3 py-2 
      border border-error-300 rounded-lg 
      focus:outline-none focus:ring-2 focus:ring-error-500 focus:border-error-500
      placeholder-gray-400
    "
    placeholder="이메일을 입력하세요"
  />
  <p className="text-sm text-error-600">올바른 이메일 형식이 아닙니다.</p>
</div>
```

#### 선택 입력
```tsx
// Select
<div className="space-y-2">
  <label htmlFor="vehicle" className="block text-sm font-medium text-gray-700">
    차량 선택
  </label>
  <select
    id="vehicle"
    className="
      w-full px-3 py-2 
      border border-gray-300 rounded-lg 
      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
      bg-white
    "
  >
    <option value="">차량을 선택하세요</option>
    <option value="truck-1">트럭 1호</option>
    <option value="truck-2">트럭 2호</option>
  </select>
</div>
```

### 카드 (Cards)

#### 기본 카드
```tsx
// 기본 카드
<div className="
  bg-white 
  border border-gray-200 
  rounded-lg 
  shadow-sm 
  p-6
">
  <h3 className="text-h5 text-gray-900 mb-2">카드 제목</h3>
  <p className="text-body text-gray-600">카드 내용입니다.</p>
</div>

// 상호작용 카드
<div className="
  bg-white 
  border border-gray-200 
  rounded-lg 
  shadow-sm 
  p-6
  hover:shadow-md 
  transition-shadow duration-200
  cursor-pointer
">
  <h3 className="text-h5 text-gray-900 mb-2">상호작용 카드</h3>
  <p className="text-body text-gray-600">클릭 가능한 카드입니다.</p>
</div>
```

#### 상태별 카드
```tsx
// 성공 카드
<div className="
  bg-success-50 
  border border-success-200 
  rounded-lg 
  p-4
">
  <div className="flex items-center">
    <CheckCircleIcon className="w-5 h-5 text-success-500 mr-2" />
    <h3 className="text-h6 text-success-800">배송 완료</h3>
  </div>
  <p className="text-body-sm text-success-700 mt-1">
    배송이 성공적으로 완료되었습니다.
  </p>
</div>

// 경고 카드
<div className="
  bg-warning-50 
  border border-warning-200 
  rounded-lg 
  p-4
">
  <div className="flex items-center">
    <ExclamationTriangleIcon className="w-5 h-5 text-warning-500 mr-2" />
    <h3 className="text-h6 text-warning-800">주의사항</h3>
  </div>
  <p className="text-body-sm text-warning-700 mt-1">
    배송 지연이 예상됩니다.
  </p>
</div>
```

### 모달 (Modals)

```tsx
// 기본 모달
<div className="
  fixed inset-0 
  bg-black bg-opacity-50 
  flex items-center justify-center 
  z-50
">
  <div className="
    bg-white 
    rounded-lg 
    shadow-xl 
    max-w-md w-full 
    mx-4 
    p-6
  ">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-h5 text-gray-900">모달 제목</h3>
      <button className="text-gray-400 hover:text-gray-600">
        <XMarkIcon className="w-5 h-5" />
      </button>
    </div>
    <p className="text-body text-gray-600 mb-4">
      모달 내용입니다.
    </p>
    <div className="flex justify-end space-x-3">
      <button className="px-4 py-2 text-gray-600 hover:text-gray-800">
        취소
      </button>
      <button className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
        확인
      </button>
    </div>
  </div>
</div>
```

---

## 아이콘 시스템

### 아이콘 라이브러리
- **Heroicons**: 기본 UI 아이콘
- **Lucide React**: 추가 UI 아이콘
- **Custom Icons**: 물류 특화 아이콘

### 아이콘 크기
```css
/* 아이콘 크기 */
.icon-xs { width: 0.75rem; height: 0.75rem; }
.icon-sm { width: 1rem; height: 1rem; }
.icon-md { width: 1.25rem; height: 1.25rem; }
.icon-lg { width: 1.5rem; height: 1.5rem; }
.icon-xl { width: 2rem; height: 2rem; }
```

### 물류 특화 아이콘
```tsx
// 배송 아이콘
<TruckIcon className="w-6 h-6 text-primary-500" />

// 위치 아이콘
<MapPinIcon className="w-5 h-5 text-gray-500" />

// 시간 아이콘
<ClockIcon className="w-5 h-5 text-gray-500" />

// 거리 아이콘
<ArrowPathIcon className="w-5 h-5 text-gray-500" />

// 상태 아이콘
<CheckCircleIcon className="w-5 h-5 text-success-500" />
<ExclamationTriangleIcon className="w-5 h-5 text-warning-500" />
<XCircleIcon className="w-5 h-5 text-error-500" />
```

---

## 레이아웃 및 그리드

### 그리드 시스템
```css
/* 12컬럼 그리드 */
.grid-12 { display: grid; grid-template-columns: repeat(12, 1fr); }

/* 반응형 그리드 */
.grid-responsive {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 768px) {
  .grid-responsive {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .grid-responsive {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1280px) {
  .grid-responsive {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

### 레이아웃 컴포넌트

#### 헤더
```tsx
<header className="
  bg-white 
  border-b border-gray-200 
  px-4 py-3
">
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-4">
      <img src="/logo.svg" alt="옹고잉" className="h-8" />
      <nav className="hidden md:flex space-x-6">
        <a href="/dispatch" className="text-gray-700 hover:text-primary-600">배차</a>
        <a href="/quote" className="text-gray-700 hover:text-primary-600">견적</a>
        <a href="/tracking" className="text-gray-700 hover:text-primary-600">추적</a>
      </nav>
    </div>
    <div className="flex items-center space-x-3">
      <button className="p-2 text-gray-500 hover:text-gray-700">
        <BellIcon className="w-5 h-5" />
      </button>
      <button className="p-2 text-gray-500 hover:text-gray-700">
        <UserCircleIcon className="w-5 h-5" />
      </button>
    </div>
  </div>
</header>
```

#### 사이드바
```tsx
<aside className="
  w-64 
  bg-white 
  border-r border-gray-200 
  h-screen 
  p-4
">
  <nav className="space-y-2">
    <a href="/dashboard" className="
      flex items-center px-3 py-2 
      text-gray-700 rounded-lg 
      hover:bg-gray-100
    ">
      <HomeIcon className="w-5 h-5 mr-3" />
      대시보드
    </a>
    <a href="/dispatch" className="
      flex items-center px-3 py-2 
      text-gray-700 rounded-lg 
      hover:bg-gray-100
    ">
      <TruckIcon className="w-5 h-5 mr-3" />
      배차 관리
    </a>
    <a href="/quote" className="
      flex items-center px-3 py-2 
      text-gray-700 rounded-lg 
      hover:bg-gray-100
    ">
      <CalculatorIcon className="w-5 h-5 mr-3" />
      견적 관리
    </a>
  </nav>
</aside>
```

#### 메인 콘텐츠
```tsx
<main className="
  flex-1 
  bg-gray-50 
  p-6
">
  <div className="max-w-7xl mx-auto">
    {/* 페이지 콘텐츠 */}
  </div>
</main>
```

---

## 반응형 디자인

### 브레이크포인트
```css
/* Tailwind CSS 브레이크포인트 */
sm: 640px   /* 모바일 가로 */
md: 768px   /* 태블릿 */
lg: 1024px  /* 데스크톱 */
xl: 1280px  /* 대형 데스크톱 */
2xl: 1536px /* 초대형 화면 */
```

### 반응형 유틸리티 클래스
```css
/* 컨테이너 */
.container {
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding-left: 1rem;
  padding-right: 1rem;
}

@media (min-width: 640px) {
  .container { max-width: 640px; }
}

@media (min-width: 768px) {
  .container { max-width: 768px; }
}

@media (min-width: 1024px) {
  .container { max-width: 1024px; }
}

@media (min-width: 1280px) {
  .container { max-width: 1280px; }
}
```

### 스페이싱 시스템
```css
/* 스페이싱 스케일 */
.space-xs { gap: 0.25rem; }
.space-sm { gap: 0.5rem; }
.space-md { gap: 1rem; }
.space-lg { gap: 1.5rem; }
.space-xl { gap: 2rem; }
.space-2xl { gap: 3rem; }

/* 패딩 스케일 */
.p-xs { padding: 0.25rem; }
.p-sm { padding: 0.5rem; }
.p-md { padding: 1rem; }
.p-lg { padding: 1.5rem; }
.p-xl { padding: 2rem; }
.p-2xl { padding: 3rem; }

/* 마진 스케일 */
.m-xs { margin: 0.25rem; }
.m-sm { margin: 0.5rem; }
.m-md { margin: 1rem; }
.m-lg { margin: 1.5rem; }
.m-xl { margin: 2rem; }
.m-2xl { margin: 3rem; }
```

---

## 물류 특화 컴포넌트

### ETA 카드 (Estimated Time of Arrival)
```tsx
const ETACard = ({ 
  estimatedTime, 
  currentTime, 
  status, 
  location 
}: ETACardProps) => {
  return (
    <div className="
      bg-white 
      border border-gray-200 
      rounded-lg 
      p-4 
      shadow-sm
    ">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h6 text-gray-900">예상 도착 시간</h3>
        <span className={`
          px-2 py-1 
          text-xs font-medium 
          rounded-full
          ${status === 'on-time' ? 'bg-success-100 text-success-800' : ''}
          ${status === 'delayed' ? 'bg-warning-100 text-warning-800' : ''}
          ${status === 'early' ? 'bg-info-100 text-info-800' : ''}
        `}>
          {status === 'on-time' && '정시'}
          {status === 'delayed' && '지연'}
          {status === 'early' && '조기'}
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <ClockIcon className="w-4 h-4 text-gray-500" />
          <span className="text-body font-medium">
            {estimatedTime}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <MapPinIcon className="w-4 h-4 text-gray-500" />
          <span className="text-body-sm text-gray-600">
            {location}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <ArrowPathIcon className="w-4 h-4 text-gray-500" />
          <span className="text-body-sm text-gray-600">
            남은 시간: {currentTime}
          </span>
        </div>
      </div>
    </div>
  );
};
```

### 경로 시각화 컴포넌트
```tsx
const RouteVisualization = ({ 
  waypoints, 
  currentLocation, 
  optimizedRoute 
}: RouteVisualizationProps) => {
  return (
    <div className="
      bg-white 
      border border-gray-200 
      rounded-lg 
      p-4
    ">
      <h3 className="text-h6 text-gray-900 mb-4">최적 경로</h3>
      
      <div className="space-y-3">
        {waypoints.map((waypoint, index) => (
          <div key={waypoint.id} className="flex items-center space-x-3">
            <div className={`
              w-8 h-8 
              rounded-full 
              flex items-center justify-center 
              text-sm font-medium
              ${index === 0 ? 'bg-primary-500 text-white' : ''}
              ${index === waypoints.length - 1 ? 'bg-success-500 text-white' : ''}
              ${index > 0 && index < waypoints.length - 1 ? 'bg-gray-300 text-gray-700' : ''}
            `}>
              {index + 1}
            </div>
            
            <div className="flex-1">
              <p className="text-body font-medium">{waypoint.name}</p>
              <p className="text-body-sm text-gray-600">{waypoint.address}</p>
            </div>
            
            {index < waypoints.length - 1 && (
              <div className="text-body-sm text-gray-500">
                → {optimizedRoute[index]?.distance}km
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-body-sm">
          <span className="text-gray-600">총 거리</span>
          <span className="font-medium">{optimizedRoute.totalDistance}km</span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-gray-600">예상 시간</span>
          <span className="font-medium">{optimizedRoute.totalTime}분</span>
        </div>
      </div>
    </div>
  );
};
```

### 견적 요약 UI
```tsx
const QuoteSummary = ({ 
  items, 
  subtotal, 
  tax, 
  total, 
  discount 
}: QuoteSummaryProps) => {
  return (
    <div className="
      bg-white 
      border border-gray-200 
      rounded-lg 
      p-6
    ">
      <h3 className="text-h5 text-gray-900 mb-4">견적 요약</h3>
      
      <div className="space-y-3 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between">
            <div>
              <p className="text-body font-medium">{item.name}</p>
              <p className="text-body-sm text-gray-600">{item.description}</p>
            </div>
            <span className="text-body font-medium">
              {item.price.toLocaleString()}원
            </span>
          </div>
        ))}
      </div>
      
      <div className="space-y-2 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-body-sm">
          <span className="text-gray-600">소계</span>
          <span>{subtotal.toLocaleString()}원</span>
        </div>
        
        {discount > 0 && (
          <div className="flex justify-between text-body-sm">
            <span className="text-gray-600">할인</span>
            <span className="text-success-600">-{discount.toLocaleString()}원</span>
          </div>
        )}
        
        <div className="flex justify-between text-body-sm">
          <span className="text-gray-600">세금</span>
          <span>{tax.toLocaleString()}원</span>
        </div>
        
        <div className="flex justify-between text-h6 font-semibold pt-2 border-t border-gray-200">
          <span>총계</span>
          <span>{total.toLocaleString()}원</span>
        </div>
      </div>
    </div>
  );
};
```

### 시간·거리 필터
```tsx
const TimeDistanceFilter = ({ 
  onFilterChange 
}: TimeDistanceFilterProps) => {
  const [timeRange, setTimeRange] = useState('all');
  const [distanceRange, setDistanceRange] = useState('all');
  
  return (
    <div className="
      bg-white 
      border border-gray-200 
      rounded-lg 
      p-4
    ">
      <h3 className="text-h6 text-gray-900 mb-4">필터</h3>
      
      <div className="space-y-4">
        {/* 시간 필터 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            시간 범위
          </label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="
              w-full px-3 py-2 
              border border-gray-300 rounded-lg 
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
            "
          >
            <option value="all">전체</option>
            <option value="1h">1시간 이내</option>
            <option value="3h">3시간 이내</option>
            <option value="6h">6시간 이내</option>
            <option value="24h">24시간 이내</option>
          </select>
        </div>
        
        {/* 거리 필터 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            거리 범위
          </label>
          <select
            value={distanceRange}
            onChange={(e) => setDistanceRange(e.target.value)}
            className="
              w-full px-3 py-2 
              border border-gray-300 rounded-lg 
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
            "
          >
            <option value="all">전체</option>
            <option value="10km">10km 이내</option>
            <option value="30km">30km 이내</option>
            <option value="50km">50km 이내</option>
            <option value="100km">100km 이내</option>
          </select>
        </div>
        
        {/* 필터 적용 버튼 */}
        <button
          onClick={() => onFilterChange({ timeRange, distanceRange })}
          className="
            w-full px-4 py-2 
            bg-primary-500 hover:bg-primary-600 
            text-white font-medium 
            rounded-lg 
            transition-colors duration-200
          "
        >
          필터 적용
        </button>
      </div>
    </div>
  );
};
```

### 차량 상태 카드
```tsx
const VehicleStatusCard = ({ 
  vehicle 
}: VehicleStatusCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-success-100 text-success-800 border-success-200';
      case 'busy':
        return 'bg-warning-100 text-warning-800 border-warning-200';
      case 'offline':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'maintenance':
        return 'bg-error-100 text-error-800 border-error-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckCircleIcon className="w-5 h-5" />;
      case 'busy':
        return <ClockIcon className="w-5 h-5" />;
      case 'offline':
        return <XCircleIcon className="w-5 h-5" />;
      case 'maintenance':
        return <WrenchIcon className="w-5 h-5" />;
      default:
        return <QuestionMarkCircleIcon className="w-5 h-5" />;
    }
  };
  
  return (
    <div className="
      bg-white 
      border border-gray-200 
      rounded-lg 
      p-4 
      hover:shadow-md 
      transition-shadow duration-200
    ">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h6 text-gray-900">{vehicle.name}</h3>
        <span className={`
          px-2 py-1 
          text-xs font-medium 
          rounded-full 
          border
          ${getStatusColor(vehicle.status)}
        `}>
          {vehicle.status === 'available' && '사용가능'}
          {vehicle.status === 'busy' && '운송중'}
          {vehicle.status === 'offline' && '오프라인'}
          {vehicle.status === 'maintenance' && '정비중'}
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          {getStatusIcon(vehicle.status)}
          <span className="text-body-sm text-gray-600">
            {vehicle.driver || '배정되지 않음'}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <MapPinIcon className="w-4 h-4 text-gray-500" />
          <span className="text-body-sm text-gray-600">
            {vehicle.currentLocation || '위치 정보 없음'}
          </span>
        </div>
        
        {vehicle.lastUpdate && (
          <div className="flex items-center space-x-2">
            <ClockIcon className="w-4 h-4 text-gray-500" />
            <span className="text-body-sm text-gray-600">
              {vehicle.lastUpdate}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## 사용 가이드라인

### 컴포넌트 사용 원칙
1. **일관성**: 동일한 기능은 동일한 컴포넌트 사용
2. **접근성**: 모든 컴포넌트는 접근성 가이드라인 준수
3. **반응형**: 모든 컴포넌트는 모바일부터 데스크톱까지 반응형 지원
4. **성능**: 불필요한 리렌더링 방지 및 최적화

### 커스터마이징 가이드
- **색상**: 브랜드 색상 팔레트 내에서만 변경
- **크기**: 기존 스케일을 우선 사용
- **간격**: 스페이싱 시스템 준수
- **타이포그래피**: 정의된 스케일 사용

### 접근성 체크리스트
- [ ] 키보드 네비게이션 지원
- [ ] 스크린 리더 호환성
- [ ] 충분한 색상 대비
- [ ] 포커스 표시
- [ ] ARIA 속성 적용

---

> **Version**: 1.0  
> **Last Updated**: 2025-01-27  
> **Next Review**: 2025-02-27 