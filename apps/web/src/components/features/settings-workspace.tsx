'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  organizationsApi,
  type OrganizationDetails,
  type OrganizationMember,
} from '@/app/lib/api/organizations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { MetricCard } from './metric-card';
import { PageHeader } from './page-header';
import { useActiveWorkspace } from './use-active-workspace';
import { WorkspaceOrgEmpty } from './workspace-org-empty';

type OrganizationFormState = {
  name: string;
  description: string;
  timezone: string;
  financeEnabled: boolean;
};

const initialFormState: OrganizationFormState = {
  name: '',
  description: '',
  timezone: 'UTC',
  financeEnabled: false,
};

const displayMemberName = (member: OrganizationMember) => {
  const fullName = [member.user.firstName, member.user.lastName].filter(Boolean).join(' ').trim();
  return fullName || member.user.email;
};

export function SettingsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMember[]>([]);
  const [form, setForm] = useState<OrganizationFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const canManageSettings = activeRole === 'ADMIN' || activeRole === 'DIRECTOR';
  const canViewMemberships =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  const loadData = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setOrganization(null);
      setMemberships([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const organizationPromise = organizationsApi.getOrganization({
        accessToken,
        organizationId: activeOrganizationId,
      });
      const membershipsPromise = canViewMemberships
        ? organizationsApi.listMemberships({
            accessToken,
            organizationId: activeOrganizationId,
          })
        : Promise.resolve([]);

      const [organizationResponse, membershipResponse] = await Promise.all([
        organizationPromise,
        membershipsPromise,
      ]);

      setOrganization(organizationResponse);
      setMemberships(membershipResponse);
      setForm({
        name: organizationResponse.name,
        description: organizationResponse.description ?? '',
        timezone: organizationResponse.timezone ?? 'UTC',
        financeEnabled: organizationResponse.financeEnabled,
      });
      setErrorText(null);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось загрузить настройки организации.',
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId, canViewMemberships]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const activeMembers = memberships.filter((membership) => membership.status === 'ACTIVE').length;
    const admins = memberships.filter((membership) => membership.role === 'ADMIN').length;

    return [
      {
        label: 'Моя роль',
        value: activeRole ?? '—',
        meta: 'От роли зависит возможность менять состав, роли и финансовые настройки.',
      },
      {
        label: 'Активные участники команды',
        value: loading ? '—' : String(activeMembers),
        meta: 'Только участники со статусом ACTIVE участвуют в ежедневной работе.',
      },
      {
        label: 'Администраторы',
        value: loading ? '—' : String(admins),
        meta: 'Организация должна сохранять хотя бы одного активного администратора.',
      },
    ];
  }, [activeRole, loading, memberships]);

  const handleSave = async () => {
    if (!accessToken || !activeOrganizationId || !canManageSettings) {
      return;
    }

    setSaving(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      if (form.name.trim().length < 2) {
        throw new Error('Название организации должно содержать минимум 2 символа.');
      }

      if (form.timezone.trim().length === 0) {
        throw new Error('Укажите часовой пояс.');
      }

      const updated = await organizationsApi.updateOrganization({
        accessToken,
        organizationId: activeOrganizationId,
        payload: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          timezone: form.timezone.trim(),
          financeEnabled: form.financeEnabled,
        },
      });

      setOrganization(updated);
      setNoticeText('Настройки организации сохранены.');
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось сохранить настройки организации.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!activeOrganizationId || !accessToken) {
    return (
      <section className="app-page">
        <PageHeader
          eyebrow="Settings"
          title="Настройки организации"
          description="Рабочая страница уже готова, осталось выбрать активную организацию."
        />
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Settings"
        title="Настройки организации и доступов"
        description="Организация, роли, часовой пояс и опциональные модули собраны в один понятный экран без лишнего шума."
        actions={canManageSettings ? (
          <Button type="button" onClick={() => void handleSave()} loading={saving}>
            Сохранить изменения
          </Button>
        ) : undefined}
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

      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <div className="settings-layout">
        <Card>
          <CardHeader>
            <CardTitle>Основные параметры</CardTitle>
            <CardDescription>
              Название, описание и операционные настройки организации.
            </CardDescription>
          </CardHeader>
          <CardContent className="settings-card__content">
            {loading ? (
              <div className="resource-skeleton-grid">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="resource-skeleton-card" />
                ))}
              </div>
            ) : (
              <>
                <Input
                  label="Название организации"
                  value={form.name}
                  disabled={!canManageSettings}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />

                <label className="ui-field-group">
                  <span className="ui-field-group__label">Описание</span>
                  <textarea
                    className="ui-field"
                    value={form.description}
                    disabled={!canManageSettings}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Кратко опишите формат организации и рабочий контекст команды"
                  />
                </label>

                <Input
                  label="Часовой пояс"
                  value={form.timezone}
                  disabled={!canManageSettings}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, timezone: event.target.value }))
                  }
                />

                <label className="checkbox-row">
                  <input
                    checked={form.financeEnabled}
                    type="checkbox"
                    disabled={!canManageSettings}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        financeEnabled: event.target.checked,
                      }))
                    }
                  />
                  <span>Включить финансовый модуль для этой организации</span>
                </label>

                {!canManageSettings ? (
                  <p className="empty-state">
                    Изменять настройки организации могут только ADMIN и DIRECTOR.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <div className="settings-layout__aside">
          <Card>
            <CardHeader>
              <CardTitle>Контекст организации</CardTitle>
              <CardDescription>
                Текущая активная организация и быстрый операционный статус.
              </CardDescription>
            </CardHeader>
            <CardContent className="resource-inline-panel__content">
              <div className="resource-inline-info">
                <strong>Название</strong>
                <span>{organization?.name || '—'}</span>
              </div>
              <div className="resource-inline-info">
                <strong>Slug</strong>
                <span>{organization?.slug || '—'}</span>
              </div>
              <div className="resource-inline-info">
                <strong>Финансы</strong>
                <span>{organization?.financeEnabled ? 'Включены' : 'Отключены'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Команда и роли</CardTitle>
              <CardDescription>
                Состав активной организации с ролями и текущими статусами membership.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="resource-skeleton-grid">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="resource-skeleton-card" />
                  ))}
                </div>
              ) : memberships.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Состав пока пуст</strong>
                  <p>
                    {canViewMemberships
                      ? 'Когда в организации появятся участники команды, они отобразятся здесь.'
                      : 'Просматривать состав команды можно с ролью ASSISTANT и выше.'}
                  </p>
                </div>
              ) : (
                <div className="member-list">
                  {memberships.map((membership) => (
                    <div key={membership.id} className="member-list__item">
                      <div className="member-list__copy">
                        <strong>{displayMemberName(membership)}</strong>
                        <span>{membership.user.email}</span>
                      </div>
                      <div className="member-list__badges">
                        <Badge variant="primary">{membership.role}</Badge>
                        <Badge
                          variant={
                            membership.status === 'ACTIVE'
                              ? 'success'
                              : membership.status === 'INVITED'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {membership.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
