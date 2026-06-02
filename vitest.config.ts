import { defineConfig } from 'vitest/config';
import path from 'node:path';

// 순수 도메인 로직 단위 테스트용. Next/React 환경 없이 node에서 빠르게 실행한다.
// '@/' alias는 tsconfig paths와 동일하게 src로 매핑.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    globals: false,
  },
});
