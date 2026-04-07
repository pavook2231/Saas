import Link from 'next/link';
import type { Route } from 'next';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type EmptyStateCardProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  onClick?: () => void;
  href?: Route;
};

export function EmptyStateCard({
  title,
  description,
  ctaLabel,
  onClick,
  href,
}: EmptyStateCardProps) {
  return (
    <Card className="empty-state-card">
      <div className="empty-state-card__marker" />
      <div className="empty-state-card__copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {ctaLabel ? (
        href ? (
          <Link className="ui-button ui-button--primary ui-button--md" href={href}>
            <span className="ui-button__content">{ctaLabel}</span>
          </Link>
        ) : (
          <Button type="button" onClick={onClick}>
            {ctaLabel}
          </Button>
        )
      ) : null}
    </Card>
  );
}
