import React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tonal' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-1 hover:bg-primary-hover hover:shadow-2',
  secondary:
    'bg-secondary text-secondary-foreground shadow-1 hover:bg-secondary/90 hover:shadow-2',
  tonal:
    'bg-primary-container text-primary-on-container hover:bg-primary-container/80',
  outline:
    'border border-outline bg-surface-lowest text-primary hover:bg-primary-container/45',
  danger:
    'bg-error text-error-foreground shadow-1 hover:bg-error/90 hover:shadow-2',
  ghost: 'bg-transparent text-foreground hover:bg-surface-high',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'min-h-9 px-3.5 text-xs',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-[background-color,color,box-shadow,transform,border-color] duration-base ease-standard active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {!isLoading && leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  ),
);

Button.displayName = 'Button';

export default Button;
