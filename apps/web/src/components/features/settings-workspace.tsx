'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  organizationsApi,
  type OrganizationDetails,
  type OrganizationJoinRequestAdminRecord,
  type OrganizationMember,
  type OrganizationOutgoingInvitation,
  type OrganizationRole,
} from '@/app/lib/api/organizations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { MetricCard } from './metric-card';
import { PageHeader } from './page-header';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';
import { WorkspaceOrgEmpty } from './workspace-org-empty';

type OrganizationFormState = {
  name: string;
  description: string;
  timezone: string;
};

type InviteFormState = {
  email: string;
  role: OrganizationRole;
};

type JoinRequestFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type InvitationFilter = 'ALL' | 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

const initialFormState: OrganizationFormState = {
  name: '',
  description: '',
  timezone: 'UTC',
};

const displayMemberName = (member: OrganizationMember) => {
  const fullName = [member.user.firstName, member.user.lastName].filter(Boolean).join(' ').trim();
  return fullName || member.user.email;
};

const displayRequesterName = (request: OrganizationJoinRequestAdminRecord) => {
  const fullName = [request.requester.firstName, request.requester.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || request.requester.email;
};

const joinRequestStatusLabel: Record<string, string> = {
  PENDING: 'Ожидает решения',
  APPROVED: 'Одобрено',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отменено',
};

const invitationStatusLabel: Record<string, string> = {
  PENDING: 'Активно',
  ACCEPTED: 'Принято',
  REVOKED: 'Отозвано',
  EXPIRED: 'Истекло',
};

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getInvitationBadgeVariant = (
  status: InvitationFilter | OrganizationOutgoingInvitation['status'],
) => {
  if (status === 'ACCEPTED') {
    return 'success';
  }

  if (status === 'REVOKED') {
    return 'error';
  }

  if (status === 'EXPIRED') {
    return 'neutral';
  }

  return 'warning';
};

const getRequestBadgeVariant = (
  status: JoinRequestFilter | OrganizationJoinRequestAdminRecord['status'],
) => {
  if (status === 'APPROVED') {
    return 'success';
  }

  if (status === 'REJECTED') {
    return 'error';
  }

  return 'warning';
};

const upsertInvitation = (
  invitations: OrganizationOutgoingInvitation[],
  invitation: OrganizationOutgoingInvitation,
) => [invitation, ...invitations.filter((item) => item.invitationId !== invitation.invitationId)];

export function SettingsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<OrganizationJoinRequestAdminRecord[]>([]);
  const [invitations, setInvitations] = useState<OrganizationOutgoingInvitation[]>([]);
  const [joinRequestSearch, setJoinRequestSearch] = useState('');
  const [joinRequestFilter, setJoinRequestFilter] = useState<JoinRequestFilter>('ALL');
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteFilter, setInviteFilter] = useState<InvitationFilter>('PENDING');
  const [form, setForm] = useState<OrganizationFormState>(initialFormState);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    email: '',
    role: 'MEMBER',
  });
  const [inviteLinkById, setInviteLinkById] = useState<Record<string, string>>({});
  const [latestInvite, setLatestInvite] = useState<{
    invitationId: string;
    email: string;
    inviteLink: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const canManageSettings = activeRole === 'ADMIN' || activeRole === 'DIRECTOR';
  const canViewMemberships =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Настройки',
    errorTitle: 'Настройки',
  });

  useEffect(() => {
    if (activeRole === 'DIRECTOR') {
      setInviteForm((current) =>
        current.role === 'ADMIN' || current.role === 'DIRECTOR'
          ? { ...current, role: 'MEMBER' }
          : current,
      );
    }
  }, [activeRole]);

  const roleOptions = useMemo<OrganizationRole[]>(
    () =>
      activeRole === 'ADMIN'
        ? ['ADMIN', 'DIRECTOR', 'ASSISTANT', 'MEMBER']
        : ['ASSISTANT', 'MEMBER'],
    [activeRole],
  );

  const loadData = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setOrganization(null);
      setMemberships([]);
      setJoinRequests([]);
      setInvitations([]);
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
      const joinRequestsPromise = canManageSettings
        ? organizationsApi.listOrganizationJoinRequests({
            accessToken,
            organizationId: activeOrganizationId,
          })
        : Promise.resolve([]);
      const invitationsPromise = canManageSettings
        ? organizationsApi.listOrganizationInvitations({
            accessToken,
            organizationId: activeOrganizationId,
          })
        : Promise.resolve([]);

      const [
        organizationResponse,
        membershipResponse,
        joinRequestsResponse,
        invitationsResponse,
      ] = await Promise.all([
        organizationPromise,
        membershipsPromise,
        joinRequestsPromise,
        invitationsPromise,
      ]);

      setOrganization(organizationResponse);
      setMemberships(membershipResponse);
      setJoinRequests(joinRequestsResponse);
      setInvitations(invitationsResponse);
      setForm({
        name: organizationResponse.name,
        description: organizationResponse.description ?? '',
        timezone: organizationResponse.timezone ?? 'UTC',
      });
      setErrorText(null);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось загрузить настройки организации.',
      );
      setJoinRequests([]);
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId, canManageSettings, canViewMemberships]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const activeMembers = memberships.filter((membership) => membership.status === 'ACTIVE').length;
    const pendingJoinRequests = joinRequests.filter((request) => request.status === 'PENDING').length;
    const activeInvitations = invitations.filter((invitation) => invitation.status === 'PENDING').length;

    return [
      {
        label: 'Моя роль',
        value: activeRole ?? '—',
        meta: 'От роли зависит, можно ли менять состав, инвайты и основные настройки.',
      },
      {
        label: 'Активные участники команды',
        value: loading ? '—' : String(activeMembers),
        meta: 'В ежедневной работе участвуют только membership со статусом ACTIVE.',
      },
      {
        label: 'Открытые invite и заявки',
        value: loading ? '—' : String(activeInvitations + pendingJoinRequests),
        meta: 'Здесь собраны активные инвайты по email и входящие запросы на вступление.',
      },
    ];
  }, [activeRole, invitations, joinRequests, loading, memberships]);

  const filteredJoinRequests = useMemo(() => {
    const search = normalizeSearch(joinRequestSearch);

    return joinRequests.filter((request) => {
      const matchesStatus =
        joinRequestFilter === 'ALL' || request.status === joinRequestFilter;
      const matchesSearch =
        search.length === 0 ||
        [
          request.requester.email,
          request.requester.firstName,
          request.requester.lastName,
          request.message,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(search));

      return matchesStatus && matchesSearch;
    });
  }, [joinRequestFilter, joinRequestSearch, joinRequests]);

  const filteredInvitations = useMemo(() => {
    const search = normalizeSearch(inviteSearch);

    return invitations.filter((invitation) => {
      const matchesStatus = inviteFilter === 'ALL' || invitation.status === inviteFilter;
      const matchesSearch =
        search.length === 0 || invitation.email.toLowerCase().includes(search);

      return matchesStatus && matchesSearch;
    });
  }, [inviteFilter, inviteSearch, invitations]);

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

  const handleCopyInviteLink = async (inviteLink: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setNoticeText('Ссылка приглашения скопирована.');
    } catch {
      setErrorText('Не удалось скопировать ссылку приглашения.');
    }
  };

  const handleSendInvitation = async (
    payload?: InviteFormState,
    currentInvitationId?: string,
  ) => {
    if (!accessToken || !activeOrganizationId || !canManageSettings) {
      return;
    }

    const nextInvite = payload ?? inviteForm;
    const email = nextInvite.email.trim().toLowerCase();

    setErrorText(null);
    setNoticeText(null);
    setInvitationActionId(currentInvitationId ?? null);
    setSendingInvite(!currentInvitationId);

    try {
      if (!email) {
        throw new Error('Укажите email для приглашения.');
      }

      const response = await organizationsApi.inviteOrganizationMember({
        accessToken,
        organizationId: activeOrganizationId,
        payload: {
          email,
          role: nextInvite.role,
        },
      });

      setInvitations((current) =>
        upsertInvitation(current, {
          invitationId: response.invitationId,
          email: response.email,
          role: response.role,
          status: response.status,
          invitedAt: response.invitedAt,
          expiresAt: response.expiresAt,
          acceptedAt: response.acceptedAt,
          revokedAt: response.revokedAt,
          invitedBy: response.invitedBy,
          acceptedBy: response.acceptedBy,
        }),
      );
      setInviteLinkById((current) => ({
        ...current,
        [response.invitationId]: response.inviteLink,
      }));
      setLatestInvite({
        invitationId: response.invitationId,
        email: response.email,
        inviteLink: response.inviteLink,
      });
      setInviteForm((current) => ({
        ...current,
        email: '',
      }));
      setNoticeText(`Приглашение для ${response.email} подготовлено.`);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось создать приглашение.',
      );
    } finally {
      setInvitationActionId(null);
      setSendingInvite(false);
    }
  };

  const handleRevokeInvitation = async (invitation: OrganizationOutgoingInvitation) => {
    if (!accessToken || !activeOrganizationId || !canManageSettings) {
      return;
    }

    setInvitationActionId(invitation.invitationId);
    setErrorText(null);
    setNoticeText(null);

    try {
      const response = await organizationsApi.revokeOrganizationInvitation({
        accessToken,
        organizationId: activeOrganizationId,
        invitationId: invitation.invitationId,
      });

      setInvitations((current) =>
        current.map((item) =>
          item.invitationId === invitation.invitationId
            ? {
                ...item,
                status: response.status,
                revokedAt:
                  response.status === 'REVOKED' ? new Date().toISOString() : item.revokedAt,
              }
            : item,
        ),
      );
      setNoticeText(
        response.status === 'REVOKED'
          ? `Приглашение для ${invitation.email} отозвано.`
          : `У приглашения для ${invitation.email} уже истек срок действия.`,
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось отозвать приглашение.',
      );
    } finally {
      setInvitationActionId(null);
    }
  };

  const handleReviewJoinRequest = async (
    request: OrganizationJoinRequestAdminRecord,
    status: 'APPROVED' | 'REJECTED',
  ) => {
    if (!accessToken || !activeOrganizationId || !canManageSettings) {
      return;
    }

    setReviewingRequestId(request.requestId);
    setErrorText(null);
    setNoticeText(null);

    try {
      await organizationsApi.reviewJoinRequest({
        accessToken,
        organizationId: activeOrganizationId,
        requestId: request.requestId,
        payload: {
          status,
        },
      });

      await loadData();
      setNoticeText(
        status === 'APPROVED'
          ? `Заявка от ${displayRequesterName(request)} одобрена.`
          : `Заявка от ${displayRequesterName(request)} отклонена.`,
      );
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось обработать заявку на вступление.',
      );
    } finally {
      setReviewingRequestId(null);
    }
  };

  if (!activeOrganizationId || !accessToken) {
    return (
      <section className="app-page">
        <PageHeader
          eyebrow="Настройки"
          title="Настройки организации"
          description="Рабочий экран уже готов, осталось выбрать активную организацию."
        />
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Настройки"
        title="Настройки организации и доступов"
        description="Организация, роли, заявки и email-приглашения собраны в один рабочий экран без лишних переходов."
        actions={
          canManageSettings ? (
            <Button type="button" onClick={() => void handleSave()} loading={saving}>
              Сохранить изменения
            </Button>
          ) : undefined
        }
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
        <div className="settings-layout__main">
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

                  {!canManageSettings ? (
                    <p className="empty-state">
                      Изменять настройки организации могут только ADMIN и DIRECTOR.
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Приглашения по email</CardTitle>
              <CardDescription>
                Приглашайте людей напрямую по email, копируйте свежую ссылку и управляйте активными инвайтами.
              </CardDescription>
            </CardHeader>
            <CardContent className="profile-stack">
              {!canManageSettings ? (
                <div className="resource-empty-inline">
                  <strong>Недостаточно прав</strong>
                  <p>Отправлять инвайты могут только ADMIN и DIRECTOR.</p>
                </div>
              ) : (
                <>
                  <div className="settings-invite-form">
                    <Input
                      label="Email для приглашения"
                      type="email"
                      value={inviteForm.email}
                      onChange={(event) =>
                        setInviteForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="user@example.com"
                    />
                    <Select
                      label="Роль"
                      value={inviteForm.role}
                      onChange={(event) =>
                        setInviteForm((current) => ({
                          ...current,
                          role: event.target.value as OrganizationRole,
                        }))
                      }
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      onClick={() => void handleSendInvitation()}
                      loading={sendingInvite}
                    >
                      Отправить приглашение
                    </Button>
                  </div>

                  {latestInvite ? (
                    <div className="settings-invite-link">
                      <div className="resource-inline-info">
                        <strong>Ссылка готова</strong>
                        <span>{latestInvite.email}</span>
                        <span className="truncate">{latestInvite.inviteLink}</span>
                      </div>
                      <div className="resource-card__actions">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleCopyInviteLink(latestInvite.inviteLink)}
                        >
                          Копировать ссылку
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {loading ? (
                    <div className="resource-skeleton-grid">
                      {Array.from({ length: 2 }, (_, index) => (
                        <Skeleton key={index} className="resource-skeleton-card" />
                      ))}
                    </div>
                  ) : invitations.length === 0 ? (
                    <div className="resource-empty-inline">
                      <strong>Активных приглашений пока нет</strong>
                      <p>Первый инвайт появится тут сразу после отправки.</p>
                    </div>
                  ) : (
                    <div className="profile-stack">
                      <div className="profile-toolbar">
                        <div className="profile-toolbar__row">
                          <Input
                            label="Поиск по инвайтам"
                            value={inviteSearch}
                            onChange={(event) => setInviteSearch(event.target.value)}
                            placeholder="Email приглашенного"
                          />
                          <Select
                            label="Статус"
                            value={inviteFilter}
                            onChange={(event) =>
                              setInviteFilter(event.target.value as InvitationFilter)
                            }
                          >
                            <option value="ALL">Все</option>
                            <option value="PENDING">Активные</option>
                            <option value="ACCEPTED">Принятые</option>
                            <option value="REVOKED">Отозванные</option>
                            <option value="EXPIRED">Истекшие</option>
                          </Select>
                        </div>
                        <p className="profile-toolbar__meta">
                          Найдено приглашений: {filteredInvitations.length}
                        </p>
                      </div>

                      {filteredInvitations.length === 0 ? (
                        <div className="resource-empty-inline">
                          <strong>Ничего не найдено</strong>
                          <p>Попробуйте другой email или измените фильтр статуса.</p>
                        </div>
                      ) : (
                        <div className="resource-card__list">
                          {filteredInvitations.map((invitation) => (
                            <div key={invitation.invitationId} className="profile-item-card">
                              <div className="resource-inline-info">
                                <strong>{invitation.email}</strong>
                                <span>Роль: {invitation.role}</span>
                                <span>
                                  {invitation.status === 'ACCEPTED'
                                    ? `Принято ${formatDateTime(invitation.acceptedAt)}`
                                    : invitation.status === 'REVOKED'
                                      ? `Отозвано ${formatDateTime(invitation.revokedAt)}`
                                      : `Действует до ${formatDateTime(invitation.expiresAt)}`}
                                </span>
                              </div>
                              <div className="resource-card__actions">
                                <Badge variant={getInvitationBadgeVariant(invitation.status)}>
                                  {invitationStatusLabel[invitation.status] ?? invitation.status}
                                </Badge>
                                {invitation.status === 'PENDING' ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        void handleSendInvitation(
                                          {
                                            email: invitation.email,
                                            role: invitation.role,
                                          },
                                          invitation.invitationId,
                                        )
                                      }
                                      loading={invitationActionId === invitation.invitationId}
                                    >
                                      Обновить ссылку
                                    </Button>
                                    {inviteLinkById[invitation.invitationId] ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          void handleCopyInviteLink(
                                            inviteLinkById[invitation.invitationId],
                                          )
                                        }
                                      >
                                        Копировать
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="danger"
                                      size="sm"
                                      onClick={() => void handleRevokeInvitation(invitation)}
                                      loading={invitationActionId === invitation.invitationId}
                                    >
                                      Отозвать
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

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
                <strong>Код входа</strong>
                <span>{organization?.inviteCode || '—'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Заявки на вступление</CardTitle>
              <CardDescription>
                Новые запросы от пользователей, которые хотят войти в вашу организацию.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!canManageSettings ? (
                <div className="resource-empty-inline">
                  <strong>Недостаточно прав</strong>
                  <p>Обрабатывать заявки на вступление могут только ADMIN и DIRECTOR.</p>
                </div>
              ) : loading ? (
                <div className="resource-skeleton-grid">
                  {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="resource-skeleton-card" />
                  ))}
                </div>
              ) : joinRequests.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Новых заявок нет</strong>
                  <p>Когда кто-то отправит запрос на вступление, он появится здесь.</p>
                </div>
              ) : (
                <div className="profile-stack">
                  <div className="profile-toolbar">
                    <div className="profile-toolbar__row">
                      <Input
                        label="Поиск по заявкам"
                        value={joinRequestSearch}
                        onChange={(event) => setJoinRequestSearch(event.target.value)}
                        placeholder="Имя, email или комментарий"
                      />
                      <Select
                        label="Статус"
                        value={joinRequestFilter}
                        onChange={(event) =>
                          setJoinRequestFilter(event.target.value as JoinRequestFilter)
                        }
                      >
                        <option value="ALL">Все</option>
                        <option value="PENDING">Ожидает решения</option>
                        <option value="APPROVED">Одобрено</option>
                        <option value="REJECTED">Отклонено</option>
                        <option value="CANCELLED">Отменено</option>
                      </Select>
                    </div>
                    <p className="profile-toolbar__meta">
                      Найдено заявок: {filteredJoinRequests.length}
                    </p>
                  </div>

                  {filteredJoinRequests.length === 0 ? (
                    <div className="resource-empty-inline">
                      <strong>Ничего не найдено</strong>
                      <p>Попробуйте изменить фильтр или текст поиска.</p>
                    </div>
                  ) : (
                    <div className="resource-card__list">
                      {filteredJoinRequests.map((request) => (
                        <div key={request.requestId} className="profile-item-card">
                          <div className="resource-inline-info">
                            <strong>{displayRequesterName(request)}</strong>
                            <span>{request.requester.email}</span>
                            <span>
                              {joinRequestStatusLabel[request.status] ?? request.status} ·{' '}
                              {formatDateTime(request.createdAt)}
                            </span>
                            {request.message ? <span>{request.message}</span> : null}
                          </div>
                          <div className="resource-card__actions">
                            <Badge variant={getRequestBadgeVariant(request.status)}>
                              {joinRequestStatusLabel[request.status] ?? request.status}
                            </Badge>
                            {request.status === 'PENDING' ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleReviewJoinRequest(request, 'APPROVED')}
                                  loading={reviewingRequestId === request.requestId}
                                >
                                  Одобрить
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleReviewJoinRequest(request, 'REJECTED')}
                                  loading={reviewingRequestId === request.requestId}
                                >
                                  Отклонить
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

