#!/bin/bash

echo "🔍 Supabase 연결 상태 확인 중..."
echo ""

# 환경 변수 확인
if [ ! -f .env.local ]; then
  echo "❌ .env.local 파일을 찾을 수 없습니다."
  exit 1
fi

# Docker 상태 확인
if ! docker ps > /dev/null 2>&1; then
  echo "❌ Docker 데몬이 실행 중이지 않습니다."
  echo "   Docker Desktop을 실행해주세요."
  exit 1
fi

echo "✅ Docker 데몬 실행 중"
echo ""

# Supabase 상태 확인
echo "📊 Supabase 로컬 인스턴스 상태:"
supabase status 2>&1 | head -20

echo ""
echo "💡 Supabase를 시작하려면: supabase start"
echo "💡 Supabase를 중지하려면: supabase stop"



