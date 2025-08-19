# 도메인별 디렉토리 구조 가이드라인

## 개요
이 문서는 옹고잉 스마트 물류 플랫폼의 Domain-Driven Organization Strategy에 따른 디렉토리 구조와 개발 가이드라인을 설명합니다.

## 디렉토리 구조

```
src/domains/
├── dispatch/          # 배차 최적화 도메인
│   ├── components/    # 배차 관련 UI 컴포넌트
│   ├── services/      # 배차 최적화 비즈니스 로직
│   ├── types/         # 배차 관련 타입 정의
│   ├── utils/         # 배차 관련 유틸리티 함수
│   └── index.ts       # 타입 export
├── quote/             # 견적 계산 도메인
│   ├── components/    # 견적 관련 UI 컴포넌트
│   ├── services/      # 견적 계산 비즈니스 로직
│   ├── types/         # 견적 관련 타입 정의
│   ├── utils/         # 견적 관련 유틸리티 함수
│   └── index.ts       # 타입 export
├── tracking/          # 실시간 추적 도메인
│   ├── components/    # 추적 관련 UI 컴포넌트
│   ├── services/      # 추적 비즈니스 로직
│   ├── types/         # 추적 관련 타입 정의
│   ├── utils/         # 추적 관련 유틸리티 함수
│   └── index.ts       # 타입 export
├── auth/              # 인증 및 사용자 관리 도메인
│   ├── components/    # 인증 관련 UI 컴포넌트
│   ├── services/      # 인증 비즈니스 로직
│   ├── types/         # 인증 관련 타입 정의
│   ├── utils/         # 인증 관련 유틸리티 함수
│   └── index.ts       # 타입 export
└── admin/             # 관리자 대시보드 도메인
    ├── components/    # 관리자 관련 UI 컴포넌트
    ├── services/      # 관리자 비즈니스 로직
    ├── types/         # 관리자 관련 타입 정의
    ├── utils/         # 관리자 관련 유틸리티 함수
    └── index.ts       # 타입 export
```

> 계획(Planned) 도메인 및 상태
>
> - `constraints/` (계획): 제약조건 스키마/검증/프리셋 관리. 초기에는 경로 최적화 패널의 옵션으로 통합 노출
> - `time-optimizer/` (계획): 단일 기사 동선 최소화 알고리즘. `dispatch/optimization` 하위 통합 예정
> - (제외) `tracking/`: 차량 위치/ETA 실시간 갱신은 현 MVP 범위에서 제외
> - (보류 스코프 축소) `dispatch/vehicles`, `dispatch/drivers`: 기사/차량 관리는 별도 과제로 분리하고 MVP에서는 미노출

## 파일 명명 규칙

### 컴포넌트 파일
- **파일명**: `kebab-case.tsx`
- **예시**: `route-optimizer.tsx`, `quote-calculator.tsx`

### 서비스 파일
- **파일명**: `camelCase.ts`
- **예시**: `routeOptimizer.ts`, `quoteCalculator.ts`

### 타입 파일
- **파일명**: `camelCase.ts`
- **예시**: `routeTypes.ts`, `quoteTypes.ts`

### 유틸리티 파일
- **파일명**: `camelCase.ts`
- **예시**: `routeUtils.ts`, `quoteUtils.ts`

## 도메인별 책임

### Dispatch Domain (배차 최적화)
- **목적**: 다중 경유지 최적 경로 계산
- **주요 기능**:
  - Tmap/Atlan API 연동
  - 경로 최적화 알고리즘
  - 제약조건 모델링
  - 실시간 교통정보 반영

### Quote Domain (견적 계산)
- **목적**: 옹고잉 요금제 기반 견적 자동화
- **주요 기능**:
  - 시간당/단건퀵/건당 요금제 계산
  - 차종별 가중치 적용
  - PDF/Excel 문서 생성
  - 견적 이력 관리

### Tracking Domain (실시간 추적)
- **목적**: 차량 위치 실시간 모니터링
- **주요 기능**:
  - 실시간 위치 추적
  - ETA 계산 및 업데이트
  - 배송 상태 관리
  - 경로 시각화

### Auth Domain (인증 및 사용자 관리)
- **목적**: 사용자 인증 및 권한 관리
- **주요 기능**:
  - Supabase Auth 연동
  - 사용자 프로필 관리
  - 권한 기반 접근 제어
  - 세션 관리

### Admin Domain (관리자 대시보드)
- **목적**: 운영 현황 및 통계 분석
- **주요 기능**:
  - KPI 대시보드
  - 사용 현황 통계
  - 시스템 모니터링
  - 관리자 권한 관리

## 개발 가이드라인

### 1. 도메인 간 의존성
- 도메인 간 직접적인 import 금지
- 공통 기능은 `src/utils/` 또는 `src/libs/`에 배치
- 도메인 간 통신은 이벤트 기반 또는 API 호출 방식 사용

### 2. 타입 정의
- 각 도메인의 `types/` 디렉토리에 도메인 특화 타입 정의
- `index.ts`에서 타입을 export하여 다른 도메인에서 import 가능
- 공통 타입은 `src/types/`에 정의

### 3. 컴포넌트 개발
- 도메인별 컴포넌트는 해당 도메인의 `components/` 디렉토리에 배치
- 공통 컴포넌트는 `src/components/`에 배치
- 컴포넌트는 단일 책임 원칙을 따름

### 4. 서비스 개발
- 비즈니스 로직은 해당 도메인의 `services/` 디렉토리에 배치
- API 호출은 서비스 레이어에서 처리
- 에러 처리 및 로깅 포함

### 5. 유틸리티 함수
- 도메인 특화 유틸리티는 해당 도메인의 `utils/` 디렉토리에 배치
- 공통 유틸리티는 `src/utils/`에 배치
- 순수 함수로 작성하여 테스트 용이성 확보

### 6. 지도 중심 앱 합의 사항(MVP)
- 홈(`/`)은 지도 중심 메인 화면이며 좌측 패널에 경로 최적화/자동 견적을 통합한다.
- 지도 상호작용(클릭 추가/드래그 재정렬)은 훅(`useMapInteraction`)과 서비스 레이어로 분리한다.
- 비즈니스 연계: 경로 결과 요약이 변경되면 자동 견적이 재계산되어야 한다.
 - 실시간 추적 및 기사/차량 관리는 MVP 범위에서 제외한다(문서/메뉴 미노출).

## 코드 예시

### 도메인 타입 정의
```typescript
// src/domains/dispatch/types/routeTypes.ts
export interface RouteOptimizationRequest {
  drivers: Driver[];
  destinations: Destination[];
  constraints: OptimizationConstraints;
}
```

### 도메인 서비스
```typescript
// src/domains/dispatch/services/routeOptimizer.ts
import { RouteOptimizationRequest, RouteOptimizationResult } from '../types';

export class RouteOptimizer {
  async optimizeRoute(request: RouteOptimizationRequest): Promise<RouteOptimizationResult> {
    // 비즈니스 로직 구현
  }
}
```

### 도메인 컴포넌트
```typescript
// src/domains/dispatch/components/route-optimizer.tsx
import { RouteOptimizer } from '../services/routeOptimizer';

export const RouteOptimizer: React.FC = () => {
  // 컴포넌트 구현
};
```

## 검증 체크리스트

- [ ] 모든 도메인 디렉토리가 생성됨
- [ ] 각 도메인별 하위 디렉토리 구조가 올바름
- [ ] 도메인별 index.ts 파일이 타입을 export함
- [ ] 파일 명명 규칙이 준수됨
- [ ] 도메인 간 의존성이 최소화됨
- [ ] 타입 정의가 도메인 특화됨

## 향후 확장 계획

1. **도메인별 테스트 구조**: 각 도메인에 `__tests__/` 디렉토리 추가
2. **도메인별 문서화**: 각 도메인에 `README.md` 파일 추가
3. **도메인별 설정**: 각 도메인에 `config.ts` 파일 추가
4. **도메인별 상수**: 각 도메인에 `constants.ts` 파일 추가
5. **iOS 글래스 디자인 시스템**: 공통 유리질감 토큰/컴포넌트(`glass-panel`, `glass-button`, `glass-card`) 도입

---

**마지막 업데이트**: 2025-01-27
**버전**: 1.0.0 