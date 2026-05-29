import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { RouteOptimizationProvider } from '@/hooks/useRouteOptimization.tsx'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  fallback: ['system-ui', 'arial'],
  preload: false,
  adjustFontFallback: true,
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: '옹고잉 스마트 물류 플랫폼',
  description: '최적 동선 및 견적 제공 프로그램',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://apis.openapi.sk.com" />
        <link rel="preconnect" href="https://topopentile3.tmap.co.kr" />
        {/* FOUC 방지: 페인트 전에 테마 클래스 적용 (localStorage > prefers-color-scheme) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">
        <RouteOptimizationProvider>
          {children}
        </RouteOptimizationProvider>
      </body>
    </html>
  )
} 