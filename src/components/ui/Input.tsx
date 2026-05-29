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
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground"
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
                w-full px-3 py-2 
                border rounded-lg text-foreground
                focus:outline-none focus:ring-2 focus:ring-offset-0
                placeholder:text-muted-foreground
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200
              `,
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error
                ? 'border-error-300 focus:ring-error-500 focus:border-error-500'
                : 'border-input focus:ring-primary-500 focus:border-primary-500',
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
            className="text-sm text-error-600"
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p
            id={`${inputId}-helper`}
            className="text-sm text-muted-foreground"
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