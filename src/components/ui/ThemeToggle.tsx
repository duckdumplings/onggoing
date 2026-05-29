'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/utils/cn';

type Theme = 'light' | 'dark';

/**
 * ThemeToggle — 라이트/다크 전환
 *
 * - 초기값: localStorage > prefers-color-scheme
 * - .dark 클래스를 <html>에 토글, 선택은 localStorage에 영속
 * - FOUC 방지는 layout의 인라인 스크립트가 담당 (여기선 상태만 동기화)
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §1 (토큰), §4 (lucide)
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem('theme') as Theme | null) ?? null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: Theme = stored ?? (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', initial === 'dark');
    setTheme(initial);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className={cn(
        'p-2 rounded-lg text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {/* mount 전에는 라이트 기준 아이콘으로 고정 (hydration 불일치 방지) */}
      {mounted && theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
