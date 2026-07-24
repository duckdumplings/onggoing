'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, Calculator, Route, X, ChevronRight, Compass } from 'lucide-react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';

const DISMISS_KEY = 'onboarding-hero-dismissed-v1';

/**
 * 콜드스타트 온보딩 히어로 — 데스크톱 첫 화면(데이터 0)에서만 지도 위에 뜬다.
 * 가치문구 + 능력별 시작카드 3장(AI 견적챗 / 간편 견적 / 경로 최적화)으로
 * "무엇을 할 수 있고 어떻게 시작하는지"를 노출한다(발견성 붕괴 해소).
 * 데이터가 생기거나 워크스페이스가 열리면 사라지고, X로 닫으면 다시 뜨지 않는다.
 */
export default function StartHero() {
  const { routeData, multiDriverResult, quoteSummary, workspaceOpen, openWorkspace, requestRouteInput } =
    useRouteOptimization();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') setHidden(true);
    } catch {}
  }, []);

  const dismissPersist = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };

  const isColdStart =
    !routeData?.summary &&
    !(multiDriverResult && multiDriverResult.success) &&
    !quoteSummary?.hasQuote;

  if (!isColdStart || workspaceOpen || hidden) return null;

  const cards: Array<{
    key: string;
    icon: typeof Sparkles;
    title: string;
    desc: string;
    cta: string;
    href?: string;
    onClick?: () => void;
  }> = [
    {
      key: 'chat',
      icon: Sparkles,
      title: 'AI 견적챗',
      desc: '자연어로 조건을 말하면 경로·소요시간·견적안을 자동으로 도출합니다.',
      cta: '대화로 시작',
      onClick: () => openWorkspace('chat'),
    },
    {
      key: 'quote',
      icon: Calculator,
      title: '간편 견적',
      desc: '주소를 직접 입력하거나 표를 그대로 붙여넣어 즉시 견적을 냅니다.',
      cta: '주소로 견적',
      href: '/quote',
    },
    {
      key: 'route',
      icon: Route,
      title: '경로 최적화',
      desc: '여러 상·하차지를 최적 순서로 묶어 거리·도착시간을 계산합니다.',
      cta: '경로 입력',
      onClick: () => {
        requestRouteInput();
        setHidden(true);
      },
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center px-4 pt-20 md:pt-24">
      <motion.section
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.34, ease: [0.2, 0, 0, 1] }}
        className="glass-canvas pointer-events-auto relative w-full max-w-2xl rounded-3xl p-5 shadow-2xl md:p-6"
        aria-label="시작하기"
      >
        <button
          type="button"
          onClick={dismissPersist}
          aria-label="시작 안내 닫기"
          className="focus-ring-inset absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Compass className="h-4 w-4" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">옹라우팅</span>
        </div>

        <h1 className="mt-3 text-xl font-black leading-tight tracking-tight text-foreground md:text-2xl">
          복잡한 배송, 주소만 넣으면<br className="hidden sm:block" /> 경로·소요시간·견적까지 한 번에.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          원하는 방식으로 시작하세요. 언제든 방식을 바꿔가며 이어갈 수 있어요.
        </p>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            const inner = (
              <>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="mt-2.5 text-sm font-bold text-foreground">{c.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
                <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-bold text-primary">
                  {c.cta}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </>
            );
            const className =
              'focus-ring-inset group flex h-full flex-col rounded-2xl border border-border bg-card/70 p-3.5 text-left transition hover:border-primary/40 hover:bg-card hover:shadow-md active:scale-[0.99]';
            return c.href ? (
              <Link key={c.key} href={c.href} className={className}>
                {inner}
              </Link>
            ) : (
              <button key={c.key} type="button" onClick={c.onClick} className={className}>
                {inner}
              </button>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}
