import type { HTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '@/lib/cn';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

type BadgeProps = PropsWithChildren<
  HTMLAttributes<HTMLSpanElement> & {
    variant?: BadgeVariant;
  }
>;

export function Badge({
  children,
  className,
  variant = 'neutral',
  ...props
}: BadgeProps) {
  return (
    <span className={cn('ui-badge', `ui-badge--${variant}`, className)} {...props}>
      {children}
    </span>
  );
}
