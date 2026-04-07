'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  organizationsApi,
  type OrganizationDetails,
} from '@/app/lib/api/organizations';
import { PageHeader } from '@/components/features/page-header';
import { MetricCard } from '@/components/features/metric-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { PointsIncomePanel } from '../../app/components/points-income-panel';
import { useActiveWorkspace } from './use-active-workspace';
import { WorkspaceOrgEmpty } from './workspace-org-empty';

export function PointsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadOrganization = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await organizationsApi.getOrganization({
        accessToken,
        organizationId: activeOrganizationId,
      });

      setOrganization(response);
      setErrorText(null);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось загрузить данные организации.',
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId]);

  useEffect(() => {
    void loadOrganization();
  }, [loadOrganization]);

  const metrics = useMemo(
    () => [
      {
        label: 'Роль в организации',
        value: activeRole ?? '—',
        meta: 'Доступ к ставке балла, расчетам и экспорту определяется ролью.',
      },
      {
        label: 'Финансовый модуль',
        value:
          loading || !organization
            ? 'Проверяем...'
            : organization.financeEnabled
              ? 'Включен'
              : 'Отключен',
        meta: 'Финансы полностью опциональны и не мешают расписанию, если выключены.',
      },
      {
        label: 'Часовой пояс',
        value: loading || !organization ? '—' : organization.timezone || 'UTC',
        meta: 'Используется для отчетного и операционного контекста организации.',
      },
    ],
    [activeRole, loading, organization],
  );
  const canAccessFinance =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  if (!activeOrganizationId || !accessToken) {
    return (
      <section className="app-page">
        <PageHeader
          eyebrow="Points"
          title="Баллы и финансы"
          description="Рабочая страница уже готова, осталось выбрать активную организацию."
        />
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Points"
        title="Баллы, ставка и расчет дохода"
        description="Ставка балла, расчет периода 25–25 и экспорт уже подключены к текущей организации и сессии."
      />

      <div className="page-grid page-grid--three">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            meta={metric.meta}
          />
        ))}
      </div>

      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {organization?.name || 'Финансовый контур организации'}
          </CardTitle>
          <CardDescription>
            Рабочее пространство уже привязано к текущей сессии, поэтому здесь больше не нужно вручную вводить токен и ID организации.
          </CardDescription>
        </CardHeader>
        <CardContent className="resource-inline-panel__content">
          <div className="resource-inline-info">
            <strong>ID организации</strong>
            <span>{activeOrganizationId}</span>
          </div>
          <div className="resource-inline-info">
            <strong>Slug</strong>
            <span>{organization?.slug || '—'}</span>
          </div>
        </CardContent>
      </Card>

      {canAccessFinance ? (
        <PointsIncomePanel
          organizationId={activeOrganizationId}
          accessToken={accessToken}
          lockWorkspace
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Доступ к финансовым операциям ограничен</CardTitle>
            <CardDescription>
              Просматривать и менять ставки, расчеты и экспорт могут только ADMIN, DIRECTOR и ASSISTANT.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="resource-inline-info">
              <strong>Текущая роль</strong>
              <span>{activeRole ?? 'MEMBER'}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
