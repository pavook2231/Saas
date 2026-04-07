import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    fullWidth?: boolean;
  }
>;

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        fullWidth && 'ui-button--full',
        loading && 'is-loading',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      <span className="ui-button__content">{children}</span>
    </button>
  );
}
