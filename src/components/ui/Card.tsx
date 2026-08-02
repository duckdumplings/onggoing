import React from 'react';
import { cn } from '@/utils/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'basic' | 'interactive' | 'status';
  status?: 'success' | 'warning' | 'error' | 'info';
  onClick?: () => void;
  children: React.ReactNode;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({
    className,
    variant = 'basic',
    status,
    onClick,
    children,
    ...props
  }, ref) => {
    const baseClasses = `
      surface-raised shape-large text-card-foreground
      transition-[box-shadow,transform,border-color,background-color] duration-base ease-standard
    `;

    const variantClasses = {
      basic: '',
      interactive: `
        cursor-pointer hover:-translate-y-0.5
        hover:border-outline/55 hover:shadow-2 active:translate-y-0
      `,
      status: ''
    };

    const statusClasses = {
      success: 'border-success/30 bg-success-muted',
      warning: 'border-warning/30 bg-warning-muted',
      error: 'border-error/30 bg-error-muted',
      info: 'border-info/30 bg-info-muted'
    };

    return (
      <div
        ref={ref}
        className={cn(
          baseClasses,
          variantClasses[variant],
          status && statusClasses[status],
          onClick && 'focus-ring focus-visible:ring-offset-2',
          className
        )}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        } : undefined}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
