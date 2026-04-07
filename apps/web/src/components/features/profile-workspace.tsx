'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { notificationsApi, type NotificationItem } from '@/app/lib/api/notifications';
import {
  organizationsApi,
  type DiscoverOrganizationRecord,
  type OrganizationInvitation,
  type OrganizationJoinRequestRecord,
} from '@/app/lib/api/organizations';
import { useAuth } from '@/app/providers/auth-provider';
import { Avatar } from '@/components/ui/avatar';
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

type JoinRequestFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type NotificationFilter = 'ALL' | 'UNREAD' | 'READ';

const joinRequestStatusLabels: Record<string, string> = {
  PENDING: 'Ожидает решения',
  APPROVED: 'Одобрено',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отменено',
};

const notificationTypeLabels: Record<string, string> = {
  EVENT_ASSIGNED: 'Назначение',
  EVENT_UPDATED: 'Обновление',
  EVENT_REMINDER: 'Напоминание',
  SYSTEM: 'Система',
};

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

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const matchText = (search: string, values: Array<string | null | undefined>) => {
  if (!search) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(search));
};

const getOrganizationSecondaryLine = (organization: {
  description: string | null;
  inviteCode?: string;
  slug: string;
}) => {
  if (organization.description?.trim()) {
    return organization.description.trim();
  }

  if (organization.inviteCode) {
    return `Код входа: ${organization.inviteCode}`;
  }

  return `Slug: ${organization.slug}`;
};

export function ProfileWorkspace() {
  const { refreshSession } = useAuth();
  const {
    accessToken,
    user,
    organizations,
    activeOrganizationId,
    setActiveOrganizationId,
    refreshOrganizations,
  } = useActiveWorkspace();

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [joinRequests, setJoinRequests] = useState<OrganizationJoinRequestRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoverResults, setDiscoverResults] = useState<DiscoverOrganizationRecord[]>([]);
  const [joinRequestSearch, setJoinRequestSearch] = useState('');
  const [joinRequestFilter, setJoinRequestFilter] = useState<JoinRequestFilter>('ALL');
  const [notificationSearch, setNotificationSearch] = useState('');
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('ALL');
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Профиль',
    errorTitle: 'Профиль',
  });

  const loadProfileData = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setInvitations([]);
      setJoinRequests([]);
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);

    try {
      const [inviteResponse, requestResponse, notificationResponse] = await Promise.all([
        organizationsApi.listMyInvitations({ accessToken }),
        organizationsApi.listMyJoinRequests({ accessToken }),
        notificationsApi.listMyNotifications({ accessToken, limit: 20 }),
      ]);

      setInvitations(inviteResponse);
      setJoinRequests(requestResponse);
      setNotifications(notificationResponse.items);
      setUnreadCount(notificationResponse.unreadCount);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить профиль.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadDiscoverResults = useCallback(async () => {
    if (!accessToken) {
      setDiscoverResults([]);
      return;
    }

    setDiscovering(true);

    try {
      const response = await organizationsApi.discoverOrganizations({
        accessToken,
        search: discoverSearch,
        limit: 18,
      });

      setDiscoverResults(response);
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить организации для вступления.',
      );
    } finally {
      setDiscovering(false);
    }
  }, [accessToken, discoverSearch]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDiscoverResults();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [loadDiscoverResults]);

  const metrics = useMemo(() => {
    const pendingRequests = joinRequests.filter((request) => request.status === 'PENDING').length;

    return [
      {
        label: 'Организации',
        value: String(organizations.length),
        meta: 'Все активные организации, в которых у вас сейчас есть доступ.',
      },
      {
        label: 'Приглашения',
        value: String(invitations.length),
        meta: 'Новые инвайты появляются здесь и принимаются в один клик.',
      },
      {
        label: 'Заявки',
        value: String(pendingRequests),
        meta: 'Текущие запросы на вступление и их статус.',
      },
    ];
  }, [invitations.length, joinRequests, organizations.length]);

  const displayName = useMemo(() => {
    const parts = [user?.firstName, user?.lastName].filter(Boolean);
    return parts.join(' ').trim() || user?.email || 'Пользователь';
  }, [user?.email, user?.firstName, user?.lastName]);

  const filteredJoinRequests = useMemo(() => {
    const search = normalizeSearch(joinRequestSearch);

    return joinRequests.filter((request) => {
      const matchesStatus = joinRequestFilter === 'ALL' || request.status === joinRequestFilter;
      const matchesQuery = matchText(search, [
        request.organization.name,
        request.organization.slug,
        request.organization.description,
        request.message,
      ]);

      return matchesStatus && matchesQuery;
    });
  }, [joinRequestFilter, joinRequestSearch, joinRequests]);

  const filteredNotifications = useMemo(() => {
    const search = normalizeSearch(notificationSearch);

    return notifications.filter((item) => {
      const matchesStatus =
        notificationFilter === 'ALL' ||
        (notificationFilter === 'READ' ? item.status === 'READ' : item.status !== 'READ');
      const matchesQuery = matchText(search, [
        item.notification.title,
        item.notification.body,
        notificationTypeLabels[item.notification.type] ?? item.notification.type,
      ]);

      return matchesStatus && matchesQuery;
    });
  }, [notificationFilter, notificationSearch, notifications]);

  const handleAcceptInvitation = async (invitation: OrganizationInvitation) => {
    if (!accessToken) {
      return;
    }

    setProcessingId(invitation.invitationId);
    setErrorText(null);
    setNoticeText(null);

    try {
      await organizationsApi.acceptInvitation({
        accessToken,
        invitationId: invitation.invitationId,
      });
      await refreshSession();
      await refreshOrganizations();
      setActiveOrganizationId(invitation.organization.id);
      await Promise.all([loadProfileData(), loadDiscoverResults()]);
      setNoticeText(`Вы вступили в организацию «${invitation.organization.name}».`);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось принять приглашение.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleLeaveOrganization = async (organizationId: string, organizationName: string) => {
    if (!accessToken) {
      return;
    }

    const confirmed = window.confirm(`Выйти из организации «${organizationName}»?`);
    if (!confirmed) {
      return;
    }

    setProcessingId(organizationId);
    setErrorText(null);
    setNoticeText(null);

    try {
      await organizationsApi.leaveOrganization({
        accessToken,
        organizationId,
      });
      await refreshSession();
      await refreshOrganizations();
      await Promise.all([loadProfileData(), loadDiscoverResults()]);
      setNoticeText(`Вы вышли из организации «${organizationName}».`);
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось выйти из организации.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleCreateJoinRequest = async (organization: DiscoverOrganizationRecord) => {
    if (!accessToken) {
      return;
    }

    setProcessingId(organization.id);
    setErrorText(null);
    setNoticeText(null);

    try {
      const created = await organizationsApi.createJoinRequest({
        accessToken,
        organizationId: organization.id,
      });

      setJoinRequests((current) => [created, ...current.filter((item) => item.requestId !== created.requestId)]);
      setDiscoverResults((current) =>
        current.map((item) =>
          item.id === organization.id
            ? { ...item, joinRequestStatus: created.status }
            : item,
        ),
      );
      setNoticeText(`Запрос в «${organization.name}» отправлен администратору.`);
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить запрос на вступление.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkNotificationRead = async (recipientId: string) => {
    if (!accessToken) {
      return;
    }

    try {
      await notificationsApi.markAsRead({
        accessToken,
        recipientId,
      });

      setNotifications((current) =>
        current.map((item) =>
          item.recipientId === recipientId
            ? { ...item, status: 'READ', readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : 'Не удалось отметить уведомление как прочитанное.',
      );
    }
  };

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Профиль"
        title="Профиль и доступ в организации"
        description="Здесь собраны ваши организации, входящие приглашения, заявки на вступление и рабочие уведомления."
        actions={
          <Button
            type="button"
            variant="ghost"
            onClick={() => void Promise.all([loadProfileData(), loadDiscoverResults()])}
          >
            Обновить
          </Button>
        }
      />

      <div className="page-grid page-grid--three">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} meta={metric.meta} />
        ))}
      </div>

      <div className="profile-hero-card">
        <Avatar name={displayName} src={user?.avatarUrl} size="lg" />
        <div className="profile-hero-card__copy">
          <strong>{displayName}</strong>
          <span>{user?.email ?? '—'}</span>
        </div>
        <div className="profile-hero-card__meta">
          <Badge variant="neutral">
            {activeOrganizationId ? 'Есть активная организация' : 'Организация не выбрана'}
          </Badge>
          <Badge variant={unreadCount > 0 ? 'warning' : 'neutral'}>
            Непрочитанных: {unreadCount}
          </Badge>
        </div>
      </div>

      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <div className="profile-layout">
        <div className="profile-column profile-column--main">
          <Card>
            <CardHeader>
              <CardTitle>Мои организации</CardTitle>
              <CardDescription>
                Быстрый доступ к активным организациям и выход из любой из них.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {organizations.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Организаций пока нет</strong>
                  <p>Сначала примите приглашение или отправьте запрос на вступление.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {organizations.map((organization) => (
                    <div key={organization.id} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{organization.name}</strong>
                        <span>{organization.role} · {organization.slug}</span>
                        <span>{getOrganizationSecondaryLine(organization)}</span>
                      </div>
                      <div className="resource-card__actions">
                        {activeOrganizationId === organization.id ? (
                          <Badge variant="primary">Активная</Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveOrganizationId(organization.id)}
                          >
                            Сделать активной
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleLeaveOrganization(organization.id, organization.name)}
                          loading={processingId === organization.id}
                        >
                          Выйти
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Приглашения в организации</CardTitle>
              <CardDescription>
                Все входящие инвайты появляются здесь и принимаются в один клик.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="resource-skeleton-grid">
                  {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="resource-skeleton-card" />
                  ))}
                </div>
              ) : invitations.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Приглашений пока нет</strong>
                  <p>Когда вас пригласят в организацию, инвайт сразу появится в этом разделе.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {invitations.map((invitation) => (
                    <div key={invitation.invitationId} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{invitation.organization.name}</strong>
                        <span>Роль: {invitation.role}</span>
                        <span>Действует до {formatDateTime(invitation.expiresAt)}</span>
                      </div>
                      <div className="resource-card__actions">
                        <Badge variant="warning">Ожидает</Badge>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleAcceptInvitation(invitation)}
                          loading={processingId === invitation.invitationId}
                        >
                          Принять
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Мои заявки</CardTitle>
              <CardDescription>
                Поиск и фильтр по всем вашим запросам на вступление в организации.
              </CardDescription>
            </CardHeader>
            <CardContent className="profile-stack">
              <div className="profile-toolbar">
                <div className="profile-toolbar__row">
                  <Input
                    label="Поиск по заявкам"
                    value={joinRequestSearch}
                    onChange={(event) => setJoinRequestSearch(event.target.value)}
                    placeholder="Название организации или комментарий"
                  />
                  <Select
                    label="Статус"
                    value={joinRequestFilter}
                    onChange={(event) => setJoinRequestFilter(event.target.value as JoinRequestFilter)}
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

              {loading ? (
                <div className="resource-skeleton-grid">
                  {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="resource-skeleton-card" />
                  ))}
                </div>
              ) : joinRequests.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Заявок пока нет</strong>
                  <p>Когда вы отправите запрос на вступление, он появится здесь.</p>
                </div>
              ) : filteredJoinRequests.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Ничего не найдено</strong>
                  <p>Попробуйте изменить фильтр или текст поиска.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {filteredJoinRequests.map((request) => (
                    <div key={request.requestId} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{request.organization.name}</strong>
                        <span>{getOrganizationSecondaryLine(request.organization)}</span>
                        <span>
                          {joinRequestStatusLabels[request.status] ?? request.status} · {formatDateTime(request.createdAt)}
                        </span>
                      </div>
                      <div className="resource-card__actions">
                        <Badge
                          variant={
                            request.status === 'APPROVED'
                              ? 'success'
                              : request.status === 'REJECTED'
                                ? 'error'
                                : 'warning'
                          }
                        >
                          {joinRequestStatusLabels[request.status] ?? request.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="profile-column profile-column--side">
          <Card>
            <CardHeader>
              <CardTitle>Найти организацию</CardTitle>
              <CardDescription>
                Ищите по названию и отправляйте запрос. Админ увидит его в настройках организации.
              </CardDescription>
            </CardHeader>
            <CardContent className="profile-stack">
              <Input
                label="Поиск организации"
                value={discoverSearch}
                onChange={(event) => setDiscoverSearch(event.target.value)}
                placeholder="Начните вводить название"
              />

              {discovering ? (
                <div className="resource-skeleton-grid">
                  {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="resource-skeleton-card" />
                  ))}
                </div>
              ) : discoverResults.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Ничего не найдено</strong>
                  <p>Попробуйте другое название или сократите запрос.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {discoverResults.map((organization) => (
                    <div key={organization.id} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{organization.name}</strong>
                        <span>{getOrganizationSecondaryLine(organization)}</span>
                      </div>
                      <div className="resource-card__actions">
                        {organization.joinRequestStatus ? (
                          <Badge variant="warning">
                            {joinRequestStatusLabels[organization.joinRequestStatus] ?? organization.joinRequestStatus}
                          </Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleCreateJoinRequest(organization)}
                            loading={processingId === organization.id}
                          >
                            Отправить запрос
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Уведомления</CardTitle>
              <CardDescription>
                Здесь собраны приглашения, системные сигналы и ответы по вашим заявкам.
              </CardDescription>
            </CardHeader>
            <CardContent className="profile-stack">
              <div className="profile-toolbar">
                <div className="profile-toolbar__row">
                  <Input
                    label="Поиск по уведомлениям"
                    value={notificationSearch}
                    onChange={(event) => setNotificationSearch(event.target.value)}
                    placeholder="Тема или текст уведомления"
                  />
                  <Select
                    label="Показать"
                    value={notificationFilter}
                    onChange={(event) => setNotificationFilter(event.target.value as NotificationFilter)}
                  >
                    <option value="ALL">Все</option>
                    <option value="UNREAD">Только непрочитанные</option>
                    <option value="READ">Только прочитанные</option>
                  </Select>
                </div>
                <p className="profile-toolbar__meta">
                  Показано уведомлений: {filteredNotifications.length}
                </p>
              </div>

              {loading ? (
                <div className="resource-skeleton-grid">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="resource-skeleton-card" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Уведомлений пока нет</strong>
                  <p>Когда появятся системные события или заявки, они будут видны тут.</p>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Ничего не найдено</strong>
                  <p>Попробуйте изменить фильтр или текст поиска.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {filteredNotifications.map((item) => (
                    <div key={item.recipientId} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{item.notification.title}</strong>
                        <span>
                          {notificationTypeLabels[item.notification.type] ?? item.notification.type} · {formatDateTime(item.notification.createdAt)}
                        </span>
                        <span>{item.notification.body}</span>
                      </div>
                      <div className="resource-card__actions">
                        {item.status === 'READ' ? (
                          <Badge variant="neutral">Прочитано</Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleMarkNotificationRead(item.recipientId)}
                          >
                            Отметить прочитанным
                          </Button>
                        )}
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
