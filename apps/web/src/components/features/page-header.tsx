import type { PropsWithChildren, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type PageHeaderProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}>;

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
}: PageHeaderProps) {
  return (
    <header className={cn('feature-page-header', className)}>
      <div className="feature-page-header__copy">
        <p className="feature-page-header__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="feature-page-header__actions">{actions}</div> : null}
    </header>
  );
}
