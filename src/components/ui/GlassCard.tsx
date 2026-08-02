import React from 'react';
import { cn } from '@/utils/cn';

/**
 * GlassCard — 기존 API 호환용 surface wrapper
 *
 * tier:
 * - launcher: 가장 가벼움. 사이드바/런처/배경 표면
 * - card:     일반 카드. 기본 surface (기본값)
 * - canvas:   가장 강조. 모달/오버레이 컨텐츠 wrapper
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §2
 * Design System v2에서는 글래스가 아니라 역할 기반 불투명 surface로 매핑된다.
 */
export type GlassTier = 'launcher' | 'card' | 'canvas';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: GlassTier;
  as?: keyof JSX.IntrinsicElements;
  children: React.ReactNode;
}

const tierClasses: Record<GlassTier, string> = {
  launcher: 'surface-floating',
  card: 'surface-raised',
  canvas: 'surface-overlay',
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
