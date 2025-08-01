import React, { useState } from 'react';
import { cn } from '@/utils/cn';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { Loading, ErrorBoundary } from '@/components/ui';

export interface LayoutProps {
  children: React.ReactNode;
  className?: string;
  showSidebar?: boolean;
  sidebarItems?: any[];
  isLoading?: boolean;
  error?: Error | null;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  className,
  showSidebar = false,
  sidebarItems = [],
  isLoading = false,
  error = null
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  // 기본 사이드바 아이템
  const defaultSidebarItems = [
    {
      id: 'dispatch',
      label: '배차 관리',
      href: '/dispatch',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3" />
        </svg>
      ),
      children: [
        {
          id: 'route-optimization',
          label: '경로 최적화',
          href: '/dispatch/optimization'
        },
        {
          id: 'driver-management',
          label: '기사 관리',
          href: '/dispatch/drivers'
        },
        {
          id: 'vehicle-management',
          label: '차량 관리',
          href: '/dispatch/vehicles'
        }
      ]
    },
    {
      id: 'quote',
      label: '견적 산출',
      href: '/quote',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
      ),
      children: [
        {
          id: 'quick-quote',
          label: '빠른 견적',
          href: '/quote/quick'
        },
        {
          id: 'detailed-quote',
          label: '상세 견적',
          href: '/quote/detailed'
        },
        {
          id: 'quote-history',
          label: '견적 이력',
          href: '/quote/history'
        }
      ]
    },
    {
      id: 'tracking',
      label: '실시간 추적',
      href: '/tracking',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3" />
        </svg>
      ),
      children: [
        {
          id: 'live-tracking',
          label: '실시간 위치',
          href: '/tracking/live'
        },
        {
          id: 'delivery-status',
          label: '배송 상태',
          href: '/tracking/status'
        }
      ]
    },
    {
      id: 'admin',
      label: '관리 대시보드',
      href: '/admin',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      children: [
        {
          id: 'analytics',
          label: '분석',
          href: '/admin/analytics'
        },
        {
          id: 'reports',
          label: '보고서',
          href: '/admin/reports'
        },
        {
          id: 'settings',
          label: '설정',
          href: '/admin/settings'
        }
      ]
    }
  ];

  const items = sidebarItems.length > 0 ? sidebarItems : defaultSidebarItems;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <Loading variant="spinner" size="lg" text="페이지를 불러오는 중..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">오류가 발생했습니다</h2>
            <p className="text-gray-600 mb-4">{error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors duration-200"
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={cn('min-h-screen bg-gray-50', className)}>
        <Header
          onMenuToggle={handleMenuToggle}
          isMenuOpen={isMobileMenuOpen}
        />

        <div className="flex">
          {/* 사이드바 */}
          {showSidebar && (
            <Sidebar
              items={items}
              isOpen={isSidebarOpen}
              onClose={handleSidebarClose}
            />
          )}

          {/* 메인 콘텐츠 */}
          <main className={cn(
            'flex-1',
            showSidebar ? 'lg:ml-64' : ''
          )}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </div>
          </main>
        </div>

        <Footer />
      </div>
    </ErrorBoundary>
  );
};

export default Layout; 