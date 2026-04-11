'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  organizationsApi,
  type OrganizationDetails,
} from '@/app/lib/api/organizations';
import { MetricCard } from '@/components/features/metric-card';
import { PageHeader } from '@/components/features/page-header';
import { useToastFeedback } from '@/components/features/use-toast-feedback';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { useActiveWorkspace } from './use-active-workspace';
import { WorkspaceOrgEmpty } from './workspace-org-empty';

export function PointsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    errorText,
    errorTitle: 'Баллы',
  });

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
        meta: 'Настройка и запуск расчета баллов зависят от роли в организации.',
      },
      {
        label: 'Часовой пояс',
        value: loading || !organization ? '—' : organization.timezone || 'UTC',
        meta: 'Используется для расписания и расчета периодов баллов.',
      },
      {
        label: 'Статус модуля',
        value: 'Баллы без финансов',
        meta: 'В системе оставлен только контур будущего подсчета баллов.',
      },
    ],
    [activeRole, loading, organization],
  );

  const canManagePoints =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  if (!activeOrganizationId || !accessToken) {
    return (
      <section className="app-page">
        <PageHeader
          eyebrow="Баллы"
          title="Баллы"
          description="Рабочая страница уже готова, осталось выбрать активную организацию."
        />
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Баллы"
        title="Баллы и расчет активности"
        description="Финансовый слой удален. В рабочем пространстве остается только контур будущего подсчета баллов."
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
          <CardTitle>{organization?.name || 'Пространство баллов организации'}</CardTitle>
          <CardDescription>
            Рабочее пространство уже привязано к текущей сессии, поэтому здесь не нужно вручную вводить токен и ID организации.
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

      {canManagePoints ? (
        <Card>
          <CardHeader>
            <CardTitle>Что осталось в модуле</CardTitle>
            <CardDescription>
              Автоматические и ручные баллы можно развивать дальше без ставок за балл, доходов, payroll и выплат.
            </CardDescription>
          </CardHeader>
          <CardContent className="resource-inline-panel__content">
            <div className="resource-inline-info">
              <strong>Сохранено</strong>
              <span>конфигурация баллов, расчеты по событиям, ручные корректировки и история баллов</span>
            </div>
            <div className="resource-inline-info">
              <strong>Удалено</strong>
              <span>ставки за балл, расчет дохода, экспорт дохода, payroll-периоды и выплаты</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Доступ к настройкам баллов ограничен</CardTitle>
            <CardDescription>
              Работать с модулем баллов могут только ADMIN, DIRECTOR и ASSISTANT.
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
