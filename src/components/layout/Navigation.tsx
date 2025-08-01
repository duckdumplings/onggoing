import React, { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
  children?: NavigationItem[];
}

export interface NavigationProps {
  items: NavigationItem[];
  className?: string;
  variant?: 'horizontal' | 'vertical';
  isMobile?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({
  items,
  className,
  variant = 'horizontal',
  isMobile = false
}) => {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 현재 경로에 따라 활성 아이템 설정
    const currentPath = window.location.pathname;
    const findActiveItem = (items: NavigationItem[]): string | null => {
      for (const item of items) {
        if (item.href === currentPath) {
          return item.id;
        }
        if (item.children) {
          const childActive = findActiveItem(item.children);
          if (childActive) {
            setExpandedItems(prev => new Set([...prev, item.id]));
            return childActive;
          }
        }
      }
      return null;
    };

    const active = findActiveItem(items);
    setActiveItem(active);
  }, [items]);

  const handleItemClick = (itemId: string, hasChildren: boolean) => {
    if (hasChildren) {
      setExpandedItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(itemId)) {
          newSet.delete(itemId);
        } else {
          newSet.add(itemId);
        }
        return newSet;
      });
    } else {
      setActiveItem(itemId);
    }
  };

  const renderNavigationItem = (item: NavigationItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    const isActive = activeItem === item.id;

    return (
      <div key={item.id} className="relative">
        <a
          href={item.href}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault();
              handleItemClick(item.id, true);
            } else {
              handleItemClick(item.id, false);
            }
          }}
          className={cn(
            'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200',
            variant === 'horizontal'
              ? 'text-gray-700 hover:text-primary-600 hover:bg-primary-50'
              : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50',
            isActive && 'bg-primary-100 text-primary-700',
            level > 0 && 'ml-4'
          )}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-current={isActive ? 'page' : undefined}
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
            <svg
              className={cn(
                'ml-auto w-4 h-4 transition-transform duration-200',
                isExpanded && 'rotate-90'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </a>

        {hasChildren && isExpanded && (
          <div className={cn(
            'mt-1',
            variant === 'horizontal' ? 'ml-4' : ''
          )}>
            {item.children!.map(child => renderNavigationItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isMobile) {
    return (
      <nav className={cn('space-y-1', className)}>
        {items.map(item => renderNavigationItem(item))}
      </nav>
    );
  }

  return (
    <nav className={cn(
      variant === 'horizontal' ? 'flex space-x-8' : 'space-y-1',
      className
    )}>
      {items.map(item => renderNavigationItem(item))}
    </nav>
  );
};

export default Navigation; 