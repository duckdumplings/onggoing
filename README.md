# 옹고잉 스마트 물류 플랫폼

## 📋 프로젝트 개요

"옹고잉 스마트 물류 플랫폼"은 Next.js 기반 반응형 웹(PWA)과 Supabase 백엔드를 활용해 배송 루트 최적화, 제약조건 모델링, 자동 견적·배차 추천, 실시간 차량 위치 추적, 관리자 대시보드, 다국어 지원 기능을 제공하는 물류 솔루션입니다.

## 🎯 핵심 기능

### 1. 최적배차 시스템
- **Tmap/Atlan API 연동**: 실시간 교통정보 반영 경로 최적화
- **다중 경유지 지원**: n명의 배송원과 m개 배송지 자동 배정
- **제약조건 모델링**: 차종, 적재중량, 작업시간 고려
- **성능 지표**: 동일 입력 대비 3분 내 결과, 총 이동거리 10% 이상 감소

### 2. 견적 자동화
- **옹고잉 요금제 기반**: 시간당, 단건 퀵, 건당 고정 요금제
- **차종별 가중치**: 레이(1.0), 스타렉스(1.2)
- **실시간 계산**: 견적 생성 10초 이내, 계산 오류율 0.1% 이하
- **상세 분석**: 경쟁력 분석, 비용 효율성 팁 제공

### 3. 지도 시각화
- **Mapbox GL**: 고성능 벡터 타일 지도
- **실시간 경로 표시**: 최적화된 경로와 핀 시각화
- **직관적 UI**: 출발지(🚀), 경유지(📍), 도착지(🎯) 구분
- **경로 정보 오버레이**: 거리, 시간, 최적화 효과 표시

## 🏗️ 기술 스택

### Frontend
- **Next.js 15**: App Router, ISR, Server Actions
- **React 18**: Hooks, Context API
- **TypeScript**: 타입 안전성
- **Tailwind CSS**: 유틸리티 기반 스타일링
- **Lucide React**: 아이콘 라이브러리

### Backend
- **Supabase**: PostgreSQL, Auth, Storage, Edge Functions
- **Tmap API**: 경로 최적화, POI 검색, 지오코딩
- **Atlan API**: 백업 경로 최적화

### Deployment
- **Vercel**: Next.js 최적화 배포
- **GitHub Actions**: CI/CD 파이프라인

## 📁 프로젝트 구조

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── route-optimization/  # 경로 최적화 API
│   │   └── quote-calculation/   # 견적 계산 API
│   ├── globals.css        # 전역 스타일
│   ├── layout.tsx         # 루트 레이아웃
│   └── page.tsx           # 메인 페이지
├── components/            # 공통 UI 컴포넌트
│   ├── map/              # 지도 관련 컴포넌트
│   ├── modals/           # 모달 컴포넌트
│   ├── panels/           # 패널 컴포넌트
│   └── ui/               # 기본 UI 컴포넌트
├── domains/              # 도메인별 기능
│   ├── dispatch/         # 배차 관련 로직
│   ├── quote/            # 견적 계산 및 문서
│   ├── auth/             # 인증 및 사용자 관리
│   └── admin/            # 관리자 대시보드
├── hooks/                # 커스텀 React Hooks
├── libs/                 # 외부 라이브러리 래퍼
├── styles/               # Tailwind 설정
└── utils/                # 공통 유틸리티
```

## 🎨 디자인 시스템

### 색상 팔레트
- **Primary**: Blue (#3B82F6)
- **Success**: Green (#10B981)
- **Warning**: Yellow (#F59E0B)
- **Error**: Red (#EF4444)
- **Purple**: Purple (#8B5CF6)

### 컴포넌트 스타일
- **Glass Effect**: `backdrop-blur-md bg-white/90`
- **Gradient**: `bg-gradient-to-br from-blue-500 to-blue-600`
- **Border**: `border border-white/60`
- **Shadow**: `shadow-2xl`

### 아이콘 시스템
- **출발지**: 🚀 (초록색)
- **경유지**: 📍 (파란색/보라색)
- **도착지**: 🎯 (빨간색)
- **최적화**: 🔄
- **차량**: 🚗 레이, 🚐 스타렉스

## 🚀 시작하기

### 1. 환경 설정
```bash
# 저장소 클론
git clone [repository-url]
cd ai_onggoing

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env.local
```

### 2. 환경 변수 설정
```env
# Tmap API
NEXT_PUBLIC_TMAP_API_KEY=your_tmap_api_key
TMAP_API_KEY=your_tmap_api_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 개발 서버 실행
```bash
# 개발 서버 시작
npm run dev

# 또는 자동 재시작 스크립트 사용
./dev-restart.sh
```

## 📊 성능 지표

### 목표 성능
- **API 응답 시간**: P95 < 800ms
- **동시 세션**: 2,000개 처리
- **배차/견적 소요시간**: 70% 감소
- **ETA 오차**: ±5분 이내 90% 달성
- **실시간 위치 갱신**: 지연 ≤ 15초
- **다국어 UI 전환**: < 200ms

### 현재 성능
- **경로 최적화**: 3분 내 결과
- **견적 계산**: 10초 이내
- **지도 렌더링**: < 1초
- **API 응답**: 평균 500ms

## 🔧 주요 API

### 경로 최적화 API
```typescript
POST /api/route-optimization
{
  origins: Address[],
  destinations: Address[],
  vehicleType: '레이' | '스타렉스',
  optimizeOrder: boolean,
  departureAt?: string,
  useRealtimeTraffic?: boolean
}
```

### 견적 계산 API
```typescript
POST /api/quote-calculation
{
  routeData: RouteData,
  vehicle: 'ray' | 'starex',
  scheduleType: 'regular' | 'irregular',
  pricingPlan: 'hourly' | 'perJob'
}
```

## 📝 개발 가이드

### 코드 컨벤션
- **파일명**: kebab-case (컴포넌트), camelCase (유틸리티)
- **컴포넌트명**: PascalCase
- **함수명**: camelCase
- **상수**: UPPER_SNAKE_CASE

### 커밋 메시지
```
feat(domain): add new feature
fix(component): resolve bug
docs(readme): update documentation
refactor(api): improve code structure
```

### 테스트
```bash
# 타입 체크
npm run type-check

# 린트 검사
npm run lint

# 빌드 테스트
npm run build
```

## 🚀 배포

### Vercel 배포
```bash
# 자동 배포 (GitHub 연동)
git push origin main

# 수동 배포
vercel --prod
```

### 환경별 설정
- **Development**: `localhost:3000`
- **Staging**: `staging.ongoing.app`
- **Production**: `app.ongoing.app`

## 📈 로드맵

### Phase 1: MVP (완료)
- ✅ 기본 레이아웃 및 네비게이션
- ✅ 경로 최적화 시스템
- ✅ 견적 계산 시스템
- ✅ 지도 시각화

### Phase 2: 고도화 (진행 중)
- 🔄 제약조건 모델러
- 🔄 견적서 PDF 생성
- 🔄 실시간 위치 추적
- 🔄 관리자 대시보드

### Phase 3: 확장
- 📋 PWA 기능 완성
- 📋 다국어 지원
- 📋 AI 기반 예측
- 📋 IoT 기기 연동

## 🤝 기여하기

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 📞 문의

- **개발팀**: dev@ongoing.example
- **기술문서**: [Wiki](https://github.com/ongoing/ai_onggoing/wiki)
- **이슈 리포트**: [GitHub Issues](https://github.com/ongoing/ai_onggoing/issues)

---

**옹고잉 스마트 물류 플랫폼** - 더 나은 물류를 위한 AI 솔루션 🚀
