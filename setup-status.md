# 견적안 리스크 검토 시스템 설정 상태

## ✅ 완료된 작업

### 1. Supabase Storage 버킷 생성
- ✅ 버킷 이름: `quote-documents`
- ✅ 공개 여부: 비공개 (Private)
- ✅ 파일 크기 제한: 50MB
- ✅ 허용된 MIME 타입: PDF, Excel, Word, 이미지 파일

### 2. 환경 변수 설정
- ✅ `SUPABASE_STORAGE_BUCKET=quote-documents` 설정 완료
- ✅ `TMAP_API_KEY` 이미 설정됨
- ⚠️  `OPENAI_API_KEY` 설정 필요 (LLM 기능 사용 시)

### 3. 필요한 패키지
- ✅ `pdf-parse`, `mammoth` 이미 설치됨

### 4. 데이터베이스 마이그레이션
- ✅ 테이블 마이그레이션 파일 확인됨

## 📋 다음 단계

### OPENAI API 키 설정 (필수)
`.env.local` 파일에 다음을 추가하세요:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

OpenAI API 키는 [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)에서 발급받을 수 있습니다.

## 🎯 테스트 방법

1. 개발 서버 재시작 (환경 변수 변경 반영):
   ```bash
   npm run dev
   ```

2. 브라우저에서 `http://localhost:3000` 접속

3. "화주사 견적안 리스크 검토" 패널에서 PDF 파일 업로드 테스트

## 📝 참고사항

- Storage 버킷 정책은 현재 RLS가 비활성화되어 있어 설정하지 않았습니다
- 필요시 Supabase Studio (http://127.0.0.1:54323)에서 정책을 추가할 수 있습니다
