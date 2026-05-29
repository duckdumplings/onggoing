import React from 'react';
import type { Preview, Decorator } from '@storybook/nextjs';
import '../src/app/globals.css';

/** 라이트/다크 토큰 셋을 스토리 래퍼에 적용한다(.dark 클래스 토글). */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme ?? 'light';
  return (
    <div
      className={theme === 'dark' ? 'dark' : ''}
      style={{ fontFamily: "var(--font-pretendard), system-ui, sans-serif" }}
    >
      <div className="bg-background text-foreground min-h-[200px] p-6">
        <Story />
      </div>
    </div>
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: '디자인 토큰 테마',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
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
