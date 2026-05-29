import React from 'react';
import { cn } from '@/utils/cn';

/**
 * GlassCard — tier 시스템 글래스모피즘 카드
 *
 * tier:
 * - launcher: 가장 가벼움. 사이드바/런처/배경 표면
 * - card:     일반 카드. 기본 surface (기본값)
 * - canvas:   가장 강조. 모달/오버레이 컨텐츠 wrapper
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §2
 * 반투명 표면을 만들 때 Tailwind 불투명도 + blur 조합을 인라인으로 직접 쓰지 말 것.
 * 본 컴포넌트 또는 globals.css의 .glass-* 유틸리티만 사용.
 */
export type GlassTier = 'launcher' | 'card' | 'canvas';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: GlassTier;
  as?: keyof JSX.IntrinsicElements;
  children: React.ReactNode;
}

const tierClasses: Record<GlassTier, string> = {
  launcher: 'glass-launcher',
  card: 'glass-card',
  canvas: 'glass-canvas',
};

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ tier = 'card', as: Component = 'div', className, children, ...props }, ref) => {
    const Tag = Component as React.ElementType;
    return (
      <Tag ref={ref} className={cn(tierClasses[tier], className)} {...props}>
        {children}
      </Tag>
    );
  },
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;
