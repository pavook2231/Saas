'use client';

import type { PropsWithChildren } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = PropsWithChildren<
  HTMLMotionProps<'button'> & {
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
  const prefersReducedMotion = useReducedMotion();
  const isDisabled = disabled || loading;

  return (
    <motion.button
      className={cn(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        fullWidth && 'ui-button--full',
        loading && 'is-loading',
        className,
      )}
      disabled={isDisabled}
      whileHover={prefersReducedMotion || isDisabled ? undefined : { scale: 1.02, y: -1 }}
      whileTap={prefersReducedMotion || isDisabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      <span className="ui-button__content">{children}</span>
    </motion.button>
  );
}
