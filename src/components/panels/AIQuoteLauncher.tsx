'use client';

import React from 'react';

interface AIQuoteLauncherProps {
  onOpen: () => void;
}

export default function AIQuoteLauncher({ onOpen }: AIQuoteLauncherProps) {
  return (
    <section className="glass-card border-b border-border">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">AI 텍스트 견적챗</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              출발지, 경유지, 시간 조건을 자연어로 입력하면 견적안을 자동 도출합니다.
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
            OpenAI + Tmap
          </span>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          AI 견적챗 열기
        </button>
      </div>
    </section>
  );
}

