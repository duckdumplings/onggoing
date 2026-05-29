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
  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      // 서버 사이드에서 pdf-parse 관련 모듈을 외부로 처리
      config.externals = config.externals || [];
      config.externals.push('pdf-parse');
    }
    // 개발 모드의 webpack 영속(filesystem) 캐시가 .pack.gz 손상
    // ("invalid code lengths set" / rename ENOENT)을 반복 유발하므로
    // 메모리 캐시로 전환해 구조적으로 차단한다. (세션마다 재빌드)
    if (dev) {
      config.cache = { type: 'memory' };
    }
    return config;
  },
}

module.exports = nextConfig 