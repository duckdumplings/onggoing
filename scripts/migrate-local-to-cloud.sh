#!/usr/bin/env bash
# 로컬 Supabase(Postgres)의 public 스키마 데이터를 덤프하고, 클라우드로 옮기기 위한 단계를 안내합니다.
#
# 사전 준비
# 1) Docker로 로컬 Supabase가 떠 있어야 합니다 (supabase start).
# 2) 클라우드 프로젝트 DB 비밀번호: Supabase Dashboard → Project Settings → Database.
# 3) 호스트의 pg_dump 버전이 Postgres 17과 다르면 실패할 수 있어, 이 스크립트는 DB 컨테이너 안의 pg_dump를 사용합니다.
#
# 스키마(마이그레이션) 적용은 별도로:
#   supabase login
#   supabase link --project-ref <PROJECT_REF>   # DB 비밀번호 입력
#   supabase db push
#
# 데이터 적용(덤프 후):
#   export CLOUD_DATABASE_URL='postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres'
#   psql "$CLOUD_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/.migration-output/public_data.sql
#
# 주의
# - auth.users(로그인 계정)는 이 덤프에 포함되지 않습니다. 계정은 클라우드에서 다시 만들거나 별도 마이그레이션이 필요합니다.
# - Storage(파일 바이너리)는 DB와 별개입니다. quote-documents 등 버킷 객체는 Supabase Storage에서 별도 복사가 필요할 수 있습니다.
# - 클라우드에 이미 같은 PK 데이터가 있으면 충돌합니다. 필요 시 클라우드 public 테이블을 비우거나 새 프로젝트에만 넣으세요.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/scripts/.migration-output"
CONTAINER_NAME="${SUPABASE_DB_CONTAINER:-supabase_db_ai_onggoing}"
DUMP_FILE="${OUT_DIR}/public_data.sql"

mkdir -p "${OUT_DIR}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker가 실행 중이 아닙니다. Docker를 켠 뒤 다시 실행하세요."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "컨테이너 '${CONTAINER_NAME}' 을(를) 찾지 못했습니다."
  echo "프로젝트에서 supabase start 후 이름을 확인하거나 SUPABASE_DB_CONTAINER 환경 변수로 지정하세요."
  exit 1
fi

echo "→ 로컬 DB(public 데이터만) 덤프 중…"
docker exec "${CONTAINER_NAME}" \
  pg_dump -U postgres -d postgres \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  -f /tmp/public_data.sql

docker cp "${CONTAINER_NAME}:/tmp/public_data.sql" "${DUMP_FILE}"

echo "→ 저장됨: ${DUMP_FILE}"
echo ""
echo "다음 단계:"
echo "  1) 스키마: supabase link 후 supabase db push"
echo "  2) 데이터: CLOUD_DATABASE_URL 설정 후"
echo "       psql \"\$CLOUD_DATABASE_URL\" -v ON_ERROR_STOP=1 -f ${DUMP_FILE}"
echo ""
echo "클라우드 연결 문자열은 Dashboard → Database → Connection string → URI (Direct, port 5432) 권장."
