# 레이아웃 컴포넌트 사용 가이드라인

## 개요
이 문서는 옹고잉 스마트 물류 플랫폼의 레이아웃 컴포넌트 사용법을 설명합니다.

## 설치된 컴포넌트

### 1. Header 컴포넌트

#### 기본 사용법
```tsx
import { Header } from '@/components/layout';

const MyPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <Header 
      onMenuToggle={() => setIsMenuOpen(!isMenuOpen)}
      isMenuOpen={isMenuOpen}
    />
  );
};
```

#### 주요 기능
- **로고 및 브랜드**: 옹고잉 브랜드 표시
- **네비게이션 메뉴**: 배차 관리, 견적 산출, 실시간 추적, 관리 대시보드
- **사용자 메뉴**: 프로필, 설정, 로그아웃
- **알림**: 알림 아이콘 (향후 기능 확장)
- **반응형**: 모바일에서 햄버거 메뉴 지원

### 2. Sidebar 컴포넌트

#### 기본 사용법
```tsx
import { Sidebar } from '@/components/layout';

const sidebarItems = [
  {
    id: 'dispatch',
    label: '배차 관리',
    href: '/dispatch',
    icon: <DispatchIcon />,
    children: [
      {
        id: 'route-optimization',
        label: '경로 최적화',
        href: '/dispatch/optimization'
      }
    ]
  }
];

const MyPage = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <Sidebar
      items={sidebarItems}
      isOpen={isSidebarOpen}
      onClose={() => setIsSidebarOpen(false)}
    />
  );
};
```

#### 주요 기능
- **계층적 메뉴**: 하위 메뉴 지원
- **아이콘 지원**: 각 메뉴 아이템에 아이콘 추가 가능
- **배지**: 알림이나 상태 표시용 배지
- **반응형**: 모바일에서 오버레이 형태로 표시
- **접근성**: 키보드 네비게이션 지원

### 3. Footer 컴포넌트

#### 기본 사용법
```tsx
import { Footer } from '@/components/layout';

const MyPage = () => {
  return <Footer />;
};
```

#### 주요 기능
- **회사 정보**: 옹고잉 스마트 물류 소개
- **서비스 링크**: 주요 서비스 페이지 링크
- **지원 링크**: 도움말, 문의, 개인정보처리방침 등
- **연락처**: 이메일, 전화 아이콘
- **저작권**: 버전 정보 포함

### 4. Layout 컴포넌트

#### 기본 사용법
```tsx
import { Layout } from '@/components/layout';

const MyPage = () => {
  return (
    <Layout showSidebar>
      <h1>메인 콘텐츠</h1>
      <p>페이지 내용입니다.</p>
    </Layout>
  );
};
```

#### 로딩 상태
```tsx
<Layout isLoading>
  {/* 로딩 중에는 표시되지 않음 */}
</Layout>
```

#### 에러 상태
```tsx
<Layout error={new Error('페이지를 불러올 수 없습니다')}>
  {/* 에러 상태에서는 에러 메시지가 표시됨 */}
</Layout>
```

#### 사이드바 커스터마이징
```tsx
const customSidebarItems = [
  {
    id: 'custom',
    label: '커스텀 메뉴',
    href: '/custom',
    icon: <CustomIcon />
  }
];

<Layout showSidebar sidebarItems={customSidebarItems}>
  {/* 커스텀 사이드바와 함께 표시 */}
</Layout>
```

### 5. Navigation 컴포넌트

#### 기본 사용법
```tsx
import { Navigation } from '@/components/layout';

const navigationItems = [
  {
    id: 'home',
    label: '홈',
    href: '/',
    icon: <HomeIcon />
  }
];

const MyPage = () => {
  return (
    <Navigation 
      items={navigationItems}
      variant="horizontal"
    />
  );
};
```

#### 수직 네비게이션
```tsx
<Navigation 
  items={navigationItems}
  variant="vertical"
/>
```

#### 모바일 네비게이션
```tsx
<Navigation 
  items={navigationItems}
  isMobile
/>
```

## 레이아웃 조합 예시

### 1. 기본 레이아웃
```tsx
import { Layout } from '@/components/layout';

const App = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">옹고잉 스마트 물류</h1>
        <p className="text-gray-600">
          최적화된 배송 경로와 합리적인 견적으로 물류 효율을 극대화합니다.
        </p>
      </div>
    </Layout>
  );
};
```

### 2. 사이드바가 있는 레이아웃
```tsx
const DashboardPage = () => {
  return (
    <Layout showSidebar>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-2">오늘의 배송</h3>
            <p className="text-3xl font-bold text-primary-600">24</p>
          </div>
          {/* 추가 카드들 */}
        </div>
      </div>
    </Layout>
  );
};
```

### 3. 로딩 상태가 있는 레이아웃
```tsx
const DataPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        // 데이터 로딩 로직
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIsLoading(false);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <Layout isLoading={isLoading} error={error}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">데이터 페이지</h1>
        {/* 실제 콘텐츠 */}
      </div>
    </Layout>
  );
};
```

## 반응형 디자인

### 브레이크포인트
- **모바일**: `< 768px` - 햄버거 메뉴, 세로 네비게이션
- **태블릿**: `768px - 1024px` - 가로 네비게이션, 사이드바 숨김
- **데스크톱**: `> 1024px` - 전체 레이아웃 표시

### 모바일 최적화
- **햄버거 메뉴**: 모바일에서 네비게이션 메뉴를 햄버거 아이콘으로 표시
- **터치 친화적**: 충분한 터치 영역과 간격
- **스와이프 제스처**: 향후 확장 가능

## 접근성 (Accessibility)

### 키보드 네비게이션
- **Tab 키**: 모든 인터랙티브 요소에 접근 가능
- **Enter/Space**: 버튼과 링크 활성화
- **Escape**: 모달과 드롭다운 닫기

### 스크린 리더 지원
- **ARIA 라벨**: 모든 버튼과 링크에 적절한 라벨
- **상태 표시**: `aria-expanded`, `aria-current` 등
- **의미론적 HTML**: 적절한 HTML 태그 사용

### 색상 대비
- **WCAG AA 준수**: 4.5:1 이상의 색상 대비
- **색상 독립성**: 색상만으로 정보 전달하지 않음

## 다크모드 지원 준비

### CSS 변수 활용
```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #1f2937;
  --border-primary: #e5e7eb;
}

[data-theme="dark"] {
  --bg-primary: #1f2937;
  --text-primary: #f9fafb;
  --border-primary: #374151;
}
```

### 컴포넌트 적용
모든 레이아웃 컴포넌트는 CSS 변수를 사용하여 다크모드 전환을 쉽게 할 수 있도록 설계되었습니다.

## 성능 최적화

### 코드 스플리팅
- **동적 임포트**: 필요한 컴포넌트만 로드
- **지연 로딩**: 사이드바 메뉴 아이템 지연 로딩

### 메모이제이션
- **React.memo**: 불필요한 리렌더링 방지
- **useCallback**: 이벤트 핸들러 메모이제이션

## 사용 시 주의사항

### 1. 반응형 고려
- 모든 레이아웃 컴포넌트는 모바일 우선으로 설계
- 테스트 시 다양한 화면 크기에서 확인

### 2. 접근성 확인
- 키보드만으로 모든 기능 사용 가능한지 확인
- 스크린 리더로 테스트

### 3. 성능 모니터링
- 큰 메뉴 구조에서 성능 확인
- 메모리 누수 방지를 위한 정리 로직 확인

---

**마지막 업데이트**: 2025-01-27
**버전**: 1.0.0 