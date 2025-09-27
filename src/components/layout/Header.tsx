import React, { useState } from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui';

export interface HeaderProps {
  className?: string;
  onMenuToggle?: () => void;
  isMenuOpen?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  className,
  onMenuToggle,
  isMenuOpen = false
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  return (
    <header className={cn(
      'bg-white border-b border-gray-200 sticky top-0 z-40',
      className
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* 로고 및 브랜드 */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center space-x-2">
                {/* optional logo at /logo.png - hide until loaded, suppress alt fallback */}
                <img
                  src="/logo.png"
                  alt=""
                  className="h-7 w-7 object-contain hidden sm:block"
                  style={{ visibility: 'hidden' }}
                  onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'visible'; }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <h1 className="text-xl font-bold text-primary-600">옹라우팅</h1>
              </div>
            </div>
            <div className="hidden md:block ml-8">
              <nav className="flex space-x-8">
                <a
                  href="/dispatch"
                  className="text-gray-700 hover:text-primary-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                >
                  배차 관리
                </a>
                <a
                  href="/quote"
                  className="text-gray-700 hover:text-primary-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                >
                  견적 산출
                </a>
                <a
                  href="/tracking"
                  className="text-gray-700 hover:text-primary-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                >
                  실시간 추적
                </a>
                <a
                  href="/admin"
                  className="text-gray-700 hover:text-primary-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                >
                  관리 대시보드
                </a>
              </nav>
            </div>
          </div>

          {/* 우측 메뉴 */}
          <div className="flex items-center space-x-4">
            {/* 알림 */}
            <button
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
              aria-label="알림"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </button>

            {/* 사용자 메뉴 */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center space-x-2 p-2 text-gray-700 hover:text-gray-900 transition-colors duration-200"
                aria-label="사용자 메뉴"
                aria-expanded={isUserMenuOpen}
              >
                <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">사용자</span>
                </div>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
                  <a
                    href="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    프로필
                  </a>
                  <a
                    href="/settings"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    설정
                  </a>
                  <hr className="my-1" />
                  <button
                    onClick={() => {
                      // 로그아웃 로직
                      setIsUserMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>

            {/* 모바일 메뉴 버튼 */}
            <div className="md:hidden">
              <button
                onClick={onMenuToggle}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                aria-label="메뉴 열기"
                aria-expanded={isMenuOpen}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 모바일 네비게이션 */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-gray-200">
            <a
              href="/dispatch"
              className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50"
            >
              배차 관리
            </a>
            <a
              href="/quote"
              className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50"
            >
              견적 산출
            </a>
            <a
              href="/tracking"
              className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50"
            >
              실시간 추적
            </a>
            <a
              href="/admin"
              className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50"
            >
              관리 대시보드
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header; 