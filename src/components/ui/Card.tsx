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
      bg-white border rounded-lg shadow-sm
      transition-all duration-200
    `;

    const variantClasses = {
      basic: '',
      interactive: `
        hover:shadow-md cursor-pointer
        hover:border-gray-300
      `,
      status: ''
    };

    const statusClasses = {
      success: 'border-success-200 bg-success-50',
      warning: 'border-warning-200 bg-warning-50',
      error: 'border-error-200 bg-error-50',
      info: 'border-info-200 bg-info-50'
    };

    return (
      <div
        ref={ref}
        className={cn(
          baseClasses,
          variantClasses[variant],
          status && statusClasses[status],
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