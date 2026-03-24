const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 상위 디렉터리(예: ~/package-lock.json)가 있을 때 워크스페이스 루트 추론이 틀어지면
  // dev 청크 경로·트레이싱이 꼬일 수 있어 이 앱 폴더를 명시한다.
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['pdf-parse'],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'localhost:3001',
        'localhost:5173',
        'localhost:5174',
      ],
    },
  },
  images: {
    domains: ['localhost'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 서버 사이드에서 pdf-parse 관련 모듈을 외부로 처리
      config.externals = config.externals || [];
      config.externals.push('pdf-parse');
    }
    return config;
  },
}

module.exports = nextConfig 