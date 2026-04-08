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
import { WorkspaceOrgEmpty } from './workspace-org-empty';

const sections = [
  { href: '/control/participants' as Route, label: 'Участники' },
  { href: '/control/plays' as Route, label: 'Спектакли' },
  { href: '/control/schedule' as Route, label: 'Составить расписание' },
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

  useEffect(() => {
    if (!hasAccess) {
      router.replace('/calendar');
    }
  }, [hasAccess, router]);

  if (!activeOrganizationId) {
    return (
      <section className="app-page">
        <PageHeader eyebrow="Панель управления" title={title} description={description} />
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Панель управления"
        title={title}
        description={description}
        actions={
          <Badge variant="primary">
            {roleLabels[activeRole as keyof typeof roleLabels] ?? activeRole}
          </Badge>
        }
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


