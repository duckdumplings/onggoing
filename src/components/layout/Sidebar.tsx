import React from 'react';
import { cn } from '@/utils/cn';

export interface SidebarItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
  children?: SidebarItem[];
}

export interface SidebarProps {
  items: SidebarItem[];
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  items,
  isOpen = false,
  onClose,
  className
}) => {
  const renderSidebarItem = (item: SidebarItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.id}>
        <a
          href={item.href}
          className={cn(
            'flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200',
            level === 0
              ? 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
              : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50',
            level > 0 && 'ml-4'
          )}
        >
          {item.icon && (
            <span className="mr-3 flex-shrink-0">
              {item.icon}
            </span>
          )}
          <span className="flex-1">{item.label}</span>
          {item.badge && (
            <span className="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
              {item.badge}
            </span>
          )}
          {hasChildren && (
            <svg className="ml-auto w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </a>
        {hasChildren && (
          <div className="mt-1">
            {item.children!.map(child => renderSidebarItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* 모바일 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* 사이드바 */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          className
        )}
      >
        <div className="flex flex-col h-full">
          {/* 사이드바 헤더 */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">메뉴</h2>
            <button
              onClick={onClose}
              className="lg:hidden p-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
              aria-label="사이드바 닫기"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 네비게이션 메뉴 */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {items.map(item => renderSidebarItem(item))}
          </nav>

          {/* 사이드바 푸터 */}
          <div className="p-4 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              <p>옹고잉 스마트 물류</p>
              <p>버전 1.0.0</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar; 