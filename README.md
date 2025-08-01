# 옹고잉 스마트 물류 플랫폼

최적 동선 및 견적 제공 프로그램

## 기술 스택

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **External APIs**: Tmap API, Atlan API
- **Deployment**: Vercel

## 주요 기능

- 🚛 **최적 배차**: 다중 경유지 최적 경로 계산
- 💰 **견적 자동화**: 실시간 견적 계산 및 문서 생성
- 📍 **실시간 추적**: 차량 위치 실시간 모니터링
- 📊 **관리 대시보드**: 운영 현황 및 통계 분석
- 🌐 **웹앱 중심**: 모든 디바이스에서 최적화된 웹 경험

## 개발 환경 설정

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env.local` 파일을 생성하고 다음 변수들을 설정하세요:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Tmap API Configuration
NEXT_PUBLIC_TMAP_API_KEY=your_tmap_api_key_here

# Atlan API Configuration
NEXT_PUBLIC_ATLAN_API_KEY=your_atlan_api_key_here
```

### 3. 개발 서버 실행
```bash
npm run dev
```

### 4. 개발 가이드 참조
프로젝트 개발 시 다음 문서를 참조하세요:
- `docs/design-guide-ia.md` - 디자인 가이드 및 IA 문서

## 프로젝트 구조

```
src/
├── app/                 # Next.js App Router
├── components/          # 재사용 가능한 UI 컴포넌트
├── domains/            # 도메인별 로직
│   ├── dispatch/       # 배차 관련 (최적배차, 시간 최적화)
│   ├── time-optimizer/ # 단일 기사 시간 최적화
│   ├── constraints/    # 제약조건 모델러
│   ├── quote/          # 견적 관련
│   ├── tracking/       # 추적 관련
│   └── admin/          # 관리자 기능
├── libs/               # 외부 라이브러리 설정
└── utils/              # 공통 유틸리티

docs/
├── design-guide-ia.md  # 디자인 가이드 및 IA 문서
└── ...                 # 기타 문서들
```

## 배포

이 프로젝트는 Vercel을 통해 웹앱 형태로 배포됩니다. 모든 디바이스에서 브라우저를 통해 접근 가능합니다.

## 라이선스

MIT License 