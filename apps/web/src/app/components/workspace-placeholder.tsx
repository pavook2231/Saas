import Link from 'next/link';
import type { Route } from 'next';

type WorkspacePlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: Route;
};

export function WorkspacePlaceholder({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
}: WorkspacePlaceholderProps) {
  return (
    <section className="workspace-page">
      <header className="workspace-page-header">
        <p className="workspace-page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      {ctaLabel && ctaHref ? (
        <div className="workspace-page-actions">
          <Link href={ctaHref} className="workspace-primary-link">
            {ctaLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
