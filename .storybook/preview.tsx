import React from 'react';
import type { Preview, Decorator } from '@storybook/nextjs';
import '../src/app/globals.css';

/** 라이트 전용 디자인 토큰을 스토리 래퍼에 적용한다(지도 기반 제품 — 다크모드 미운영). */
const withTokens: Decorator = (Story) => (
  <div style={{ fontFamily: 'var(--font-pretendard), system-ui, sans-serif' }}>
    <div className="bg-background text-foreground min-h-[200px] p-6">
      <Story />
    </div>
  </div>
);

const preview: Preview = {
  decorators: [withTokens],
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: { test: 'error' },
  },
};

export default preview;
