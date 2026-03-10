# 견적안 리스크 검토 시스템 설정 가이드

## 개요
화주사 견적안 검토 및 견적 생성 시스템 구현이 완료되었습니다. 다음 설정을 진행해주세요.

## 1. Supabase Storage 버킷 생성

Supabase Dashboard에서 다음 버킷을 생성하세요:

- **버킷 이름**: `quote-documents`
- **공개 여부**: 비공개 (Private)
- **파일 크기 제한**: 50MB
- **허용된 MIME 타입**: 
  - `application/pdf`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx)
  - `application/vnd.ms-excel` (.xls)
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
  - `application/msword` (.doc)
  - `image/png`, `image/jpeg`, `image/jpg`, `image/gif`, `image/webp`

### Storage 버킷 정책 설정 (선택사항)
RLS 정책을 활성화하려면 다음 정책을 추가하세요:

```sql
-- 업로드 정책
CREATE POLICY "Users can upload quote documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quote-documents');

-- 읽기 정책
CREATE POLICY "Users can read quote documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'quote-documents');
```

## 2. 환경 변수 설정

`.env.local` 파일에 다음 환경 변수가 설정되어 있는지 확인하세요:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=quote-documents

# OpenAI (LLM 사용)
OPENAI_API_KEY=your_openai_api_key

# Tmap API
TMAP_API_KEY=your_tmap_api_key
# 또는
NEXT_PUBLIC_TMAP_API_KEY=your_tmap_api_key
```

## 3. 필요한 패키지 설치

다음 패키지들을 설치해주세요:

```bash
npm install pdf-parse mammoth
npm install --save-dev @types/pdf-parse
```

**참고**: 이미지 OCR의 경우 OpenAI Vision API를 사용하므로 추가 패키지가 필요하지 않습니다.
다만, 로컬 OCR이 필요하다면 `tesseract.js`를 추가로 설치할 수 있습니다.

## 4. 데이터베이스 마이그레이션 실행

다음 마이그레이션 파일들을 Supabase에서 실행하세요:

1. `supabase/migrations/20251222104703_quote_documents_table.sql`
2. `supabase/migrations/20251222104800_quote_extractions_table.sql`
3. `supabase/migrations/20251222105057_quote_validations_table.sql`
4. `supabase/migrations/20251222105130_quote_risk_reports_table.sql`

또는 Supabase CLI를 사용한다면:

```bash
supabase db push
```

## 5. API 엔드포인트 확인

다음 API 엔드포인트들이 구현되었습니다:

- `POST /api/quote/document-upload` - 문서 업로드
- `POST /api/quote/parse-document` - 문서 파싱
- `POST /api/quote/extract-quote-info` - LLM 정보 추출
- `POST /api/quote/validate-route` - Tmap 경로 검증
- `POST /api/quote/generate-risk-report` - 리스크 리포트 생성
- `POST /api/quote/generate-from-customer-data` - 견적 생성
- `POST /api/quote/compare-quotes` - 견적 비교
- `GET /api/quote/reviews` - 검토 이력 목록
- `GET /api/quote/reviews/[id]` - 검토 상세 조회
- `DELETE /api/quote/reviews/[id]` - 검토 삭제

## 6. UI 컴포넌트 사용

다음 컴포넌트들을 페이지에 추가하여 사용할 수 있습니다:

- `QuoteRiskReviewPanel` - 견적안 리스크 검토 메인 패널
- `QuoteFromCustomerDataPanel` - 화주사 배송정보 기반 견적 생성 패널
- `QuoteReviewHistoryPanel` - 검토 이력 관리 대시보드
- `RiskReportModal` - 리스크 리포트 모달

## 7. 사용 워크플로우

### 견적안 리스크 검토
1. `QuoteRiskReviewPanel`에서 파일 업로드
2. 자동으로 문서 파싱 → 정보 추출 → 경로 검증 → 리포트 생성
3. 리포트 모달에서 상세 내용 확인

### 화주사 배송정보 기반 견적 생성
1. `QuoteFromCustomerDataPanel`에서 배송정보 입력
2. 견적 생성 버튼 클릭
3. 경로 최적화 및 견적 계산 자동 실행
4. PDF 다운로드 가능

### 검토 이력 관리
1. `QuoteReviewHistoryPanel`에서 과거 검토 이력 확인
2. 리포트 재조회 또는 삭제 가능

## 8. 주의사항

- OpenAI API 사용 시 비용이 발생할 수 있습니다 (gpt-4o-mini 사용)
- Tmap API 사용 시 호출 한도에 주의하세요
- 이미지 OCR의 경우 OpenAI Vision API를 사용하므로 API 비용이 추가로 발생할 수 있습니다
- Supabase Storage 사용량에 따라 스토리지 비용이 발생할 수 있습니다

## 9. 트러블슈팅

### 파일 업로드 실패
- Supabase Storage 버킷이 생성되었는지 확인
- 버킷 이름이 `quote-documents`인지 확인
- 파일 크기가 50MB 이하인지 확인

### 문서 파싱 실패
- 필요한 패키지(pdf-parse, mammoth)가 설치되었는지 확인
- 파일 형식이 지원되는 형식인지 확인

### LLM 추출 실패
- OpenAI API 키가 올바르게 설정되었는지 확인
- API 키에 충분한 잔액이 있는지 확인

### 경로 검증 실패
- Tmap API 키가 올바르게 설정되었는지 확인
- API 호출 한도를 초과하지 않았는지 확인



