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
      bg-card text-card-foreground border rounded-lg shadow-sm
      transition-all duration-base ease-standard
    `;

    const variantClasses = {
      basic: '',
      interactive: `
        hover:shadow-md cursor-pointer
        hover:border-muted-foreground/40
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
          onClick && 'focus-ring',
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