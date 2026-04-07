'use client';

import type { PropsWithChildren, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type TooltipProps = PropsWithChildren<{
  content: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  className?: string;
}>;

export function Tooltip({
  children,
  content,
  side = 'top',
  className,
}: TooltipProps) {
  return (
    <span className={cn('ui-tooltip', className)}>
      <span className="ui-tooltip__trigger">{children}</span>
      <span className={cn('ui-tooltip__content', `ui-tooltip__content--${side}`)} role="tooltip">
        {content}
      </span>
    </span>
  );
}
