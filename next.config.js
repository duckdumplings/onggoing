/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001'],
    },
    serverComponentsExternalPackages: ['pdf-parse'],
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