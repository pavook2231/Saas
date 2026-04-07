import type { HTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '@/lib/cn';

type CardTone = 'default' | 'subtle' | 'interactive';

type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    tone?: CardTone;
  }
>;

export function Card({ children, className, tone = 'default', ...props }: CardProps) {
  return (
    <div className={cn('ui-card', `ui-card--${tone}`, className)} {...props}>
      {children}
    </div>
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
