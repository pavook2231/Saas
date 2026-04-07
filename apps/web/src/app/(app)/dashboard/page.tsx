'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { CreateOrganizationAction } from '@/components/features/create-organization-action';
import { PageHeader } from '@/components/features/page-header';
import { WorkspaceOrgEmpty } from '@/components/features/workspace-org-empty';
import { useActiveWorkspace } from '@/components/features/use-active-workspace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canAccessControlPanel, roleLabels } from '@/lib/organization-access';

const createHomeCards = (showControlPanel: boolean) => [
  {
    href: '/calendar' as Route,
    title: 'Календарь',
    description: 'Просмотр расписания организации.',
  },
  ...(showControlPanel
    ? [
        {
          href: '/control/schedule' as Route,
          title: 'Панель управления',
          description: 'Участники, спектакли, приглашения и составление расписания.',
        },
      ]
    : []),
  {
    href: '/profile' as Route,
    title: 'Профиль',
    description: 'Организации, приглашения и ваши права доступа.',
  },
] as const;

export default function DashboardPage() {
  const { organizations, activeOrganization, activeRole } = useActiveWorkspace();
  const hasOrganizations = organizations.length > 0;
  const showControlPanel = canAccessControlPanel(activeRole);
  const homeCards = createHomeCards(showControlPanel);

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Главная"
        title={activeOrganization ? activeOrganization.name : 'Театральная служба'}
        description={
          activeOrganization
            ? 'Все ключевые действия собраны в трех понятных разделах.'
            : 'Создайте организацию или примите приглашение, чтобы начать работу.'
        }
        actions={
          hasOrganizations ? (
            <Link className="ui-button ui-button--primary ui-button--md" href="/calendar">
              <span className="ui-button__content">Открыть календарь</span>
            </Link>
          ) : (
            <CreateOrganizationAction />
          )
        }
      />

      {!hasOrganizations ? (
        <WorkspaceOrgEmpty />
      ) : (
        <>
          <div className="dashboard-action-grid">
            {homeCards.map((action) => (
              <Link key={action.href} href={action.href} className="shortcut-card dashboard-action-card">
                <strong>{action.title}</strong>
                <p>{action.description}</p>
              </Link>
            ))}
          </div>

          <div className="page-grid page-grid--two">
            <Card className="dashboard-mini-card">
              <CardHeader>
                <CardTitle>Текущая организация</CardTitle>
                <CardDescription>Рабочий контекст и роль, с которой вы вошли.</CardDescription>
              </CardHeader>
              <CardContent className="resource-card__meta">
                <div className="resource-inline-info">
                  <strong>{activeOrganization?.name ?? 'Организация не выбрана'}</strong>
                  <span>
                    {activeOrganization
                      ? `${roleLabels[(activeRole ?? activeOrganization.role) as keyof typeof roleLabels] ?? activeRole ?? activeOrganization.role} · ${activeOrganization.slug}`
                      : 'Организацию можно выбрать в верхней панели.'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-mini-card">
              <CardHeader>
                <CardTitle>Коротко о сервисе</CardTitle>
                <CardDescription>Минимум сущностей и только нужные действия.</CardDescription>
              </CardHeader>
              <CardContent className="resource-card__list">
                <div className="resource-inline-info">
                  <strong>Главная</strong>
                  <span>Короткий вход в рабочее пространство.</span>
                </div>
                <div className="resource-inline-info">
                  <strong>Календарь</strong>
                  <span>Просмотр готового расписания для всех ролей.</span>
                </div>
                <div className="resource-inline-info">
                  <strong>Профиль</strong>
                  <span>Организации и приглашения без лишних экранов.</span>
                </div>
                {showControlPanel ? (
                  <div className="resource-inline-info">
                    <strong>Панель управления</strong>
                    <span>Доступна только админу, директору и помрежу.</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}

