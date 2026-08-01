'use client';

import React, { useEffect, useRef } from 'react';
import {
  ChevronDown,
  KeyRound,
  LogIn,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react';

interface TeamAccessControlProps {
  email: string;
  password: string;
  userEmail: string | null;
  loading: boolean;
  error: string | null;
  open: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onClearError: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

/**
 * 견적 계산은 익명으로 열어 두고, 팀 공용 기록·파일 기능만 로그인으로 활성화한다.
 * 헤더 한 곳에서 현재 상태와 다음 행동을 함께 보여주는 소형 접근 제어 UI다.
 */
export default function TeamAccessControl({
  email,
  password,
  userEmail,
  loading,
  error,
  open,
  onEmailChange,
  onPasswordChange,
  onOpenChange,
  onClearError,
  onSignIn,
  onSignOut,
}: TeamAccessControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onOpenChange, open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          onOpenChange(!open);
          onClearError();
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`focus-ring-inset inline-flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
          userEmail
            ? 'border-success/30 bg-success-muted text-success-600 hover:border-success/50'
            : 'border-border bg-card text-foreground hover:border-primary/40 hover:text-primary'
        }`}
      >
        {userEmail ? (
          <ShieldCheck className="h-3.5 w-3.5" />
        ) : (
          <KeyRound className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">{userEmail ? '팀 연결됨' : '팀 로그인'}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="팀 계정"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(340px,calc(100vw-24px))] rounded-xl border border-border bg-card p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {userEmail ? '팀 공용 작업공간' : '팀 계정 연결'}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {userEmail
                  ? '공용 견적 기록과 보호된 첨부·발행 파일을 사용할 수 있습니다.'
                  : '견적 계산은 로그인 없이 가능하며, 기록 저장과 파일 기능에만 계정이 필요합니다.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="팀 계정 창 닫기"
              className="focus-ring-inset rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {userEmail ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-success/20 bg-success-muted px-3 py-2.5">
                <div className="text-[10px] font-semibold text-success-600">연결 계정</div>
                <div className="mt-0.5 truncate text-xs font-medium text-foreground" title={userEmail}>
                  {userEmail}
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                disabled={loading}
                className="focus-ring-inset inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-3.5 w-3.5" />
                {loading ? '연결 해제 중' : '로그아웃'}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold text-foreground">
                  이메일
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="team@example.com"
                  className="focus-ring-inset min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold text-foreground">
                  비밀번호
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onSignIn();
                    }
                  }}
                  placeholder="비밀번호"
                  className="focus-ring-inset min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              {error && (
                <p role="alert" className="rounded-lg bg-error-muted px-3 py-2 text-[11px] text-error-600">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={onSignIn}
                disabled={loading}
                className="focus-ring-inset inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogIn className="h-3.5 w-3.5" />
                {loading ? '연결 중' : '로그인하고 기록 사용'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
