import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { RouteOptimizationProvider } from '@/hooks/useRouteOptimization.tsx'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  fallback: ['system-ui', 'arial']
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
    <html lang="ko">
      <head />
      <body className={inter.className}>
        <RouteOptimizationProvider>
          {children}
        </RouteOptimizationProvider>
      </body>
    </html>
  )
} 