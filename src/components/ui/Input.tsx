import React from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({
    className,
    label,
    error,
    leftIcon,
    rightIcon,
    helperText,
    id,
    ...props
  }, ref) => {
    // useId 훅을 사용하여 고유 ID 생성 (hydration 안전)
    const uniqueId = React.useId();
    const inputId = id || `input-${uniqueId}`;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="type-label block text-surface-variant"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-muted-foreground">{leftIcon}</span>
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              `
                min-h-11 w-full rounded-xl border bg-surface-lowest px-3.5 text-sm text-foreground
                focus:outline-none focus:ring-2 focus:ring-ring
                placeholder:text-muted-foreground
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-[border-color,box-shadow,background-color] duration-base ease-standard
              `,
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error
                ? 'border-error focus:border-error focus:ring-error/25'
                : 'border-outline-variant hover:border-outline/65 focus:border-primary',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-muted-foreground">{rightIcon}</span>
            </div>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="text-xs text-error"
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p
            id={`${inputId}-helper`}
            className="text-xs text-surface-variant"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
