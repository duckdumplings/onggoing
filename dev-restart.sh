#!/bin/bash

echo "🔄 Next.js 개발 서버 재시작 중..."
echo "📋 404 에러 방지 프로세스 시작"

# 1. 모든 Next.js 프로세스 종료
echo "1️⃣ Next.js 프로세스 종료 중..."
pkill -f "next" 2>/dev/null || true
pkill -f "node.*dev" 2>/dev/null || true

# 2. 포트 3000 사용 중인 프로세스 강제 종료
echo "2️⃣ 포트 3000 프로세스 종료 중..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 3. 잠시 대기
echo "3️⃣ 프로세스 정리 대기 중..."
sleep 3

# 4. 모든 캐시 제거
echo "4️⃣ 캐시 제거 중..."
rm -rf .next 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf .vercel 2>/dev/null || true

# 5. 포트 3000 사용 여부 확인
echo "5️⃣ 포트 3000 상태 확인 중..."
if lsof -ti:3000 >/dev/null 2>&1; then
    echo "⚠️  포트 3000이 여전히 사용 중입니다. 강제 종료합니다."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# 6. 개발 서버 시작
echo "6️⃣ 개발 서버 시작 중..."
npm run dev &

# 7. 서버 시작 대기
echo "7️⃣ 서버 시작 대기 중..."
sleep 15

# 8. 서버 상태 확인
echo "8️⃣ 서버 상태 확인 중..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo "✅ 서버가 정상적으로 시작되었습니다!"
    echo "🌐 http://localhost:3000 에서 확인하세요"
else
    echo "❌ 서버 시작에 실패했습니다. 수동으로 확인해주세요."
    echo "💡 다음 명령어를 시도해보세요:"
    echo "   npm run dev"
fi

echo "🎉 404 에러 방지 프로세스 완료!"
