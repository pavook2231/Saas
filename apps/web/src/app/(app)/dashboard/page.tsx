'use client';

import Link from 'next/link';

import { CreateOrganizationAction } from '@/components/features/create-organization-action';
import { PageHeader } from '@/components/features/page-header';
import { WorkspaceOrgEmpty } from '@/components/features/workspace-org-empty';
import { useActiveWorkspace } from '@/components/features/use-active-workspace';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const quickActions = [
  {
    href: '/calendar',
    badge: '1 клик',
    title: 'Открыть расписание',
    description: 'Сразу перейти в календарь и работать с сеткой без промежуточных экранов.',
  },
  {
    href: '/calendar?compose=1&kind=EVENT',
    badge: '3 шага',
    title: 'Создать событие',
    description: 'Быстрая форма с датой, временем и умными значениями по умолчанию.',
  },
  {
    href: '/templates?quick=1',
    badge: 'Быстрый старт',
    title: 'Добавить спектакль',
    description: 'Создать шаблон постановки и затем сразу поставить его в расписание.',
  },
] as const;

export default function DashboardPage() {
  const { organizations, activeOrganization, activeRole } = useActiveWorkspace();
  const hasOrganizations = organizations.length > 0;

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Главное"
        title={activeOrganization ? `Быстрый старт · ${activeOrganization.name}` : 'Начнем с рабочего пространства'}
        description={
          activeOrganization
            ? 'Главные действия собраны в одном месте: открыть расписание, создать событие или быстро добавить спектакль.'
            : 'Сначала создадим организацию. После этого календарь, участники и спектакли откроются сразу без лишних шагов.'
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
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href} className="shortcut-card dashboard-action-card">
                <div className="shortcut-card__head">
                  <Badge variant="primary">{action.badge}</Badge>
                  <span>Основной сценарий</span>
                </div>
                <strong>{action.title}</strong>
                <p>{action.description}</p>
              </Link>
            ))}
          </div>

          <div className="page-grid page-grid--two">
            <Card className="dashboard-mini-card">
              <CardHeader>
                <CardTitle>Активная организация</CardTitle>
                <CardDescription>
                  Контекст уже выбран. Все действия ниже будут выполнены внутри текущего рабочего пространства.
                </CardDescription>
              </CardHeader>
              <CardContent className="resource-card__meta">
                <div className="resource-inline-info">
                  <strong>{activeOrganization?.name ?? 'Организация не выбрана'}</strong>
                  <span>
                    {activeOrganization
                      ? `${activeOrganization.slug} · ${activeRole ?? activeOrganization.role}`
                      : 'Выберите организацию в верхней панели.'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-mini-card">
              <CardHeader>
                <CardTitle>Как пользоваться быстрее</CardTitle>
                <CardDescription>Оставили только короткий путь без лишних решений.</CardDescription>
              </CardHeader>
              <CardContent className="resource-card__list">
                <div className="resource-inline-info">
                  <strong>Расписание</strong>
                  <span>Открывается сразу из меню и с этого экрана.</span>
                </div>
                <div className="resource-inline-info">
                  <strong>Событие</strong>
                  <span>Создается в быстром режиме, дополнительные поля скрыты по умолчанию.</span>
                </div>
                <div className="resource-inline-info">
                  <strong>Спектакль</strong>
                  <span>После создания его можно одной кнопкой отправить в расписание.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
