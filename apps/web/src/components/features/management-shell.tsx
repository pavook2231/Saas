'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { type PropsWithChildren, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { canAccessControlPanel, roleLabels } from '@/lib/organization-access';

import { PageHeader } from './page-header';
import { useActiveWorkspace } from './use-active-workspace';
import { useMobileViewport } from './use-mobile-viewport';
import { WorkspaceOrgEmpty } from './workspace-org-empty';

const sections = [
  { href: '/control/participants' as Route, label: 'Участники' },
  { href: '/control/plays' as Route, label: 'Спектакли' },
  { href: '/control/schedule' as Route, label: 'План' },
];

type ManagementShellProps = PropsWithChildren<{
  title: string;
  description?: string;
}>;

export function ManagementShell({ title, description, children }: ManagementShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeOrganization, activeOrganizationId, activeRole } = useActiveWorkspace();
  const hasAccess = Boolean(activeOrganizationId && canAccessControlPanel(activeRole));
  const isMobileViewport = useMobileViewport();

  useEffect(() => {
    if (!hasAccess) {
      router.replace('/calendar');
    }
  }, [hasAccess, router]);

  if (!activeOrganizationId) {
    return (
      <section className="app-page">
        {isMobileViewport ? null : (
          <PageHeader eyebrow="Панель управления" title={title} description={description} />
        )}
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  if (!hasAccess) {
    return null;
  }

  if (isMobileViewport) {
    return (
      <section className="app-page management-mobile-shell">
        <div className="management-mobile-shell__meta">
          <div>
            <span>Панель управления</span>
            <strong>{activeOrganization?.name}</strong>
          </div>
          <Badge variant="primary">
            {roleLabels[activeRole as keyof typeof roleLabels] ?? activeRole}
          </Badge>
        </div>

        <div className="management-mobile-tabs">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={`management-mobile-tabs__item${pathname === section.href ? ' is-active' : ''}`}
            >
              {section.label}
            </Link>
          ))}
        </div>

        {children}
      </section>
    );
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Панель управления"
        title={title}
        description={description}
      />

      <Card className="control-shell">
        <div className="control-shell__header">
          <div>
            <strong>{activeOrganization?.name}</strong>
            <span>{activeOrganization?.slug}</span>
          </div>
          <div className="control-shell__tabs">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className={`control-tab${pathname === section.href ? ' is-active' : ''}`}
              >
                {section.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="control-shell__body">{children}</div>
      </Card>
    </section>
  );
}
