'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { CreateOrganizationAction } from '@/components/features/create-organization-action';
import { DesignSystemShowcase } from '@/components/features/design-system-showcase';
import { MetricCard } from '@/components/features/metric-card';
import { PageHeader } from '@/components/features/page-header';
import { WorkspaceOrgEmpty } from '@/components/features/workspace-org-empty';
import { useActiveWorkspace } from '@/components/features/use-active-workspace';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const shortcuts = [
  {
    href: '/calendar',
    title: 'Открыть календарь',
    description: 'Неделя, месяц, drag and drop и быстрые изменения прямо в сетке.',
    badge: 'Основной сценарий',
  },
  {
    href: '/templates',
    title: 'Спектакли и шаблоны',
    description: 'Подготовьте составы, роли и шаблоны постановок для ускоренного планирования.',
    badge: 'Templates',
  },
  {
    href: '/events',
    title: 'Репетиции и события',
    description: 'Создавайте новые слоты и держите под рукой конфликты, статусы и участников.',
    badge: 'Events',
  },
] as const satisfies ReadonlyArray<{
  href: Route;
  title: string;
  description: string;
  badge: string;
}>;

const workstreams = [
  {
    title: 'Планирование недели',
    description: 'Сначала собираем календарь, потом быстро уточняем состав и статусы по каждому слоту.',
    items: ['Календарь и сетка событий', 'Быстрые изменения', 'Напоминания и уведомления'],
  },
  {
    title: 'Подготовка спектаклей',
    description: 'Шаблоны становятся базой для повторяемых процессов и уменьшают число ручных действий.',
    items: ['Фиксированные составы', 'Роли внутри шаблона', 'Подстановка в события'],
  },
];

export default function DashboardPage() {
  const { organizations, activeOrganization, activeRole } = useActiveWorkspace();
  const hasOrganizations = organizations.length > 0;

  const overviewCards = [
    {
      label: 'Активная организация',
      value: activeOrganization?.name ?? 'Не выбрана',
      meta: activeOrganization
        ? `${activeOrganization.slug} · ${activeRole ?? activeOrganization.role}`
        : 'Создайте первое рабочее пространство, чтобы открыть расписание и процессы команды.',
    },
    {
      label: 'Организаций в аккаунте',
      value: String(organizations.length),
      meta:
        organizations.length > 1
          ? 'Можно быстро переключаться между командами из верхней панели.'
          : 'Когда появятся новые организации, их можно будет переключать без выхода из аккаунта.',
    },
    {
      label: 'Состояние рабочей среды',
      value: hasOrganizations ? 'Готово к работе' : 'Нужна первая организация',
      meta: hasOrganizations
        ? 'Календарь, участники, спектакли и события уже работают на живых данных.'
        : 'После создания первой организации все разделы сразу станут активными.',
    },
    {
      label: 'Синхронизация',
      value: 'Realtime online',
      meta: 'Обновления приходят без перезагрузки страницы и уже привязаны к активной организации.',
    },
  ];

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Dashboard"
        title={
          activeOrganization
            ? `Главная панель · ${activeOrganization.name}`
            : 'Главная панель управления'
        }
        description={
          activeOrganization
            ? 'Здесь начинается рабочий день: календарь, постановки, участники и точки внимания собраны вокруг выбранной организации.'
            : 'Сначала создадим рабочее пространство, чтобы календарь, участники и постановки получили живой контекст.'
        }
        actions={
          hasOrganizations ? (
            <div className="feature-page-header__action-row">
              <Link className="ui-button ui-button--ghost ui-button--md" href="/templates">
                <span className="ui-button__content">Открыть спектакли</span>
              </Link>
              <Link className="ui-button ui-button--primary ui-button--md" href="/calendar">
                <span className="ui-button__content">Перейти в календарь</span>
              </Link>
            </div>
          ) : (
            <CreateOrganizationAction />
          )
        }
      />

      <div className="page-grid page-grid--four">
        {overviewCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} meta={card.meta} />
        ))}
      </div>

      {!hasOrganizations ? (
        <>
          <WorkspaceOrgEmpty />
          <DesignSystemShowcase />
        </>
      ) : (
        <>
          <div className="page-grid page-grid--two">
            {shortcuts.map((item) => (
              <Link key={item.href} href={item.href} className="shortcut-card">
                <div className="shortcut-card__head">
                  <Badge variant="neutral">{item.badge}</Badge>
                  <span>Быстрый переход</span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </Link>
            ))}

            <Card className="status-card">
              <CardHeader>
                <CardTitle>Фокус на сегодня</CardTitle>
                <CardDescription>
                  Минимум визуального шума и только те блоки, которые помогают двигать команду вперед.
                </CardDescription>
              </CardHeader>
              <CardContent className="status-card__list">
                <div>
                  <strong>Проверить пересечения</strong>
                  <p>Перед вечерним блоком стоит перепроверить загрузку актеров и занятость площадок.</p>
                </div>
                <div>
                  <strong>Собрать состав спектакля</strong>
                  <p>Шаблоны уже готовы под быстрый перенос в расписание без ручной пересборки.</p>
                </div>
                <div>
                  <strong>Синхронизировать уведомления</strong>
                  <p>Изменения по репетициям должны уйти в чат и напоминания единым потоком.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="page-grid page-grid--two">
            {workstreams.map((stream) => (
              <Card key={stream.title}>
                <CardHeader>
                  <CardTitle>{stream.title}</CardTitle>
                  <CardDescription>{stream.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="info-list">
                    {stream.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <DesignSystemShowcase />
        </>
      )}
    </section>
  );
}
