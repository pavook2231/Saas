'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import {
  notificationsApi,
  type NotificationItem,
  type NotificationsListResponse,
  type ScheduleChangesFeedResponse,
} from '@/app/lib/api/notifications';
import { apiBaseUrl } from '@/app/lib/api/config';
import { sanitizeInternalPath } from '@/lib/safe-url';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type NotificationsInboxCardProps = {
  accessToken: string | null;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

const defaultSocketBaseUrl = apiBaseUrl.replace(/\/api$/, '');

const typeLabels: Record<NotificationItem['notification']['type'], string> = {
  EVENT_ASSIGNED: 'Назначение',
  EVENT_UPDATED: 'Изменение',
  EVENT_URGENT_CHANGE: 'Срочно',
  EVENT_REMINDER: 'Напоминание',
  SYSTEM: 'Система',
};

const typeVariants: Record<
  NotificationItem['notification']['type'],
  'primary' | 'success' | 'warning' | 'error' | 'neutral'
> = {
  EVENT_ASSIGNED: 'primary',
  EVENT_UPDATED: 'neutral',
  EVENT_URGENT_CHANGE: 'warning',
  EVENT_REMINDER: 'success',
  SYSTEM: 'neutral',
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const resolveNotificationUrl = (item: NotificationItem): string | null => {
  const rawUrl = item.notification.payload?.url;
  return typeof rawUrl === 'string' ? sanitizeInternalPath(rawUrl) : null;
};

export function NotificationsInboxCard({
  accessToken,
  onNotice,
  onError,
}: NotificationsInboxCardProps) {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationsListResponse | null>(null);
  const [scheduleChanges, setScheduleChanges] = useState<ScheduleChangesFeedResponse | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const loadInbox = useCallback(async () => {
    if (!accessToken) {
      setNotifications(null);
      setScheduleChanges(null);
      return;
    }

    setLoading(true);

    try {
      const [notificationsResponse, scheduleChangesResponse] = await Promise.all([
        notificationsApi.listMyNotifications({
          accessToken,
          limit: 8,
        }),
        notificationsApi.listMyScheduleChanges({
          accessToken,
          limit: 6,
        }),
      ]);

      setNotifications(notificationsResponse);
      setScheduleChanges(scheduleChangesResponse);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось загрузить уведомления.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, onError]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      return;
    }

    const socket = io(`${defaultSocketBaseUrl}/notifications`, {
      auth: {
        token: accessToken,
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('notifications:error', (payload: { message?: string }) => {
      setSocketConnected(false);
      onError(payload.message ?? 'Не удалось подключить realtime уведомления.');
    });

    socket.on('notifications:new', () => {
      void loadInbox();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [accessToken, loadInbox, onError]);

  const handleMarkAsRead = async (recipientId: string) => {
    if (!accessToken) {
      return;
    }

    setMarkingId(recipientId);

    try {
      await notificationsApi.markAsRead({
        accessToken,
        recipientId,
      });

      setNotifications((current) =>
        current
          ? {
              ...current,
              unreadCount: Math.max(
                0,
                current.unreadCount - (current.items.find((item) => item.recipientId === recipientId)?.status === 'READ' ? 0 : 1),
              ),
              items: current.items.map((item) =>
                item.recipientId === recipientId
                  ? {
                      ...item,
                      status: 'READ',
                      readAt: item.readAt ?? new Date().toISOString(),
                    }
                  : item,
              ),
            }
          : current,
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось отметить уведомление как прочитанное.');
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkScheduleSeen = async () => {
    if (!accessToken || !scheduleChanges || scheduleChanges.unreadCount === 0) {
      return;
    }

    try {
      const response = await notificationsApi.markScheduleChangesSeen({ accessToken });
      setScheduleChanges((current) =>
        current
          ? {
              ...current,
              seenAt: response.seenAt,
              unreadCount: 0,
            }
          : current,
      );
      onNotice('Изменения расписания отмечены как просмотренные.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось отметить изменения расписания как просмотренные.');
    }
  };

  const unreadNotifications = notifications?.unreadCount ?? 0;
  const unreadScheduleChanges = scheduleChanges?.unreadCount ?? 0;

  const connectionBadge = useMemo(
    () =>
      socketConnected ? (
        <Badge variant="success">Realtime подключен</Badge>
      ) : (
        <Badge variant="neutral">Realtime офлайн</Badge>
      ),
    [socketConnected],
  );

  return (
    <div className="account-notifications-inbox">
      <div className="account-notifications-inbox__header">
        <div className="account-notifications-inbox__header-copy">
          <strong>Лента уведомлений</strong>
          <span>Здесь видно, что реально дошло до аккаунта.</span>
        </div>
        <div className="account-notifications-inbox__header-actions">
          {connectionBadge}
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadInbox()} loading={loading}>
            Обновить
          </Button>
        </div>
      </div>

      <div className="account-notifications-inbox__meta">
        <Badge variant={unreadNotifications > 0 ? 'primary' : 'neutral'}>
          Непрочитано: {unreadNotifications}
        </Badge>
        <Badge variant={unreadScheduleChanges > 0 ? 'warning' : 'neutral'}>
          Изменения расписания: {unreadScheduleChanges}
        </Badge>
      </div>

      <div className="account-notifications-inbox__section">
        <div className="account-notifications-inbox__section-head">
          <strong>Последние уведомления</strong>
        </div>

        {!notifications || notifications.items.length === 0 ? (
          <p className="empty-state">Уведомлений пока нет.</p>
        ) : (
          <div className="account-notifications-inbox__list">
            {notifications.items.map((item) => {
              const targetUrl = resolveNotificationUrl(item);

              return (
                <article
                  key={item.recipientId}
                  className={`account-notification-item${item.status === 'READ' ? '' : ' is-unread'}`}
                >
                  <div className="account-notification-item__head">
                    <div className="account-notification-item__title">
                      <strong>{item.notification.title}</strong>
                      <Badge variant={typeVariants[item.notification.type]}>
                        {typeLabels[item.notification.type]}
                      </Badge>
                    </div>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>
                  <p>{item.notification.body}</p>
                  <div className="account-notification-item__actions">
                    {targetUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                          onClick={() => router.push(targetUrl as Route)}
                      >
                        Открыть
                      </Button>
                    ) : null}
                    {item.status !== 'READ' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleMarkAsRead(item.recipientId)}
                        loading={markingId === item.recipientId}
                      >
                        Прочитано
                      </Button>
                    ) : (
                      <Badge variant="neutral">Прочитано</Badge>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="account-notifications-inbox__section">
        <div className="account-notifications-inbox__section-head">
          <strong>Изменения расписания</strong>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void handleMarkScheduleSeen()}
            disabled={unreadScheduleChanges === 0}
          >
            Отметить просмотренным
          </Button>
        </div>

        {!scheduleChanges || scheduleChanges.items.length === 0 ? (
          <p className="empty-state">Изменений расписания пока нет.</p>
        ) : (
          <div className="account-notifications-inbox__list">
            {scheduleChanges.items.map((item) => (
              <article key={`schedule-${item.recipientId}`} className="account-notification-item account-notification-item--compact">
                <div className="account-notification-item__head">
                  <strong>{item.notification.title}</strong>
                  <span>{formatDateTime(item.createdAt)}</span>
                </div>
                <p>{item.notification.body}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
