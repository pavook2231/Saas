'use client';

import type { HTMLAttributes, PropsWithChildren } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

import { cn } from '@/lib/cn';

type CardTone = 'default' | 'subtle' | 'interactive';

type CardProps = PropsWithChildren<
  HTMLMotionProps<'div'> & {
    tone?: CardTone;
  }
>;

export function Card({ children, className, tone = 'default', ...props }: CardProps) {
  const prefersReducedMotion = useReducedMotion();
  const interactive = tone === 'interactive';

  return (
    <motion.div
      className={cn('ui-card', `ui-card--${tone}`, className)}
      whileHover={
        interactive && !prefersReducedMotion
          ? { y: -4, boxShadow: '0 24px 56px rgba(15, 23, 42, 0.12)' }
          : undefined
      }
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ui-card__header', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('ui-card__title', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('ui-card__description', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ui-card__content', className)} {...props}>
      {children}
    </div>
  );
}
