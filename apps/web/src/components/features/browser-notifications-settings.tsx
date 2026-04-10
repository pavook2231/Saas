'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  notificationsApi,
  type WebPushClientConfig,
  type WebPushSubscriptionItem,
} from '@/app/lib/api/notifications';
import { browserPush } from '@/app/lib/notifications/browser-push';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type BrowserNotificationsSettingsProps = {
  accessToken: string | null;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

const detectDeviceLabel = () => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return /iphone|android|mobile/i.test(navigator.userAgent)
    ? 'Мобильный браузер'
    : 'Браузер';
};

const formatLastSeenAt = (value: string | null | undefined) => {
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

export function BrowserNotificationsSettings({
  accessToken,
  enabled,
  onEnabledChange,
  onNotice,
  onError,
}: BrowserNotificationsSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<WebPushSubscriptionItem[]>([]);
  const [config, setConfig] = useState<WebPushClientConfig | null>(null);
  const [permission, setPermission] = useState(browserPush.getPermission());

  const supported = browserPush.isSupported();

  const loadConfig = useCallback(async () => {
    if (!accessToken) {
      setConfig(null);
      return null;
    }

    try {
      const nextConfig = await notificationsApi.getWebPushConfig({ accessToken });
      setConfig(nextConfig);
      return nextConfig;
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : 'Не удалось получить настройки браузерных уведомлений',
      );
      return null;
    }
  }, [accessToken, onError]);

  const loadSubscriptions = useCallback(async () => {
    if (!accessToken) {
      setSubscriptions([]);
      return;
    }

    try {
      const items = await notificationsApi.listWebPushSubscriptions({ accessToken });
      setSubscriptions(items);

      if (items.some((item) => item.isActive) && !enabled) {
        onEnabledChange(true);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось загрузить push-подписки');
    }
  }, [accessToken, enabled, onEnabledChange, onError]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleToggle = async (nextValue: boolean) => {
    if (!accessToken) {
      onError('Нужна активная сессия');
      return;
    }

    if (!supported) {
      onError('Браузер не поддерживает push-уведомления');
      return;
    }

    setLoading(true);

    try {
      if (nextValue) {
        const runtimeConfig = (await loadConfig()) ?? config;

        if (!runtimeConfig?.enabled || !runtimeConfig.publicKey) {
          throw new Error('На сервере пока не настроены браузерные push-уведомления');
        }

        const subscription = await browserPush.subscribe(
          runtimeConfig.publicKey,
          detectDeviceLabel(),
        );

        await notificationsApi.registerWebPushSubscription({
          accessToken,
          endpoint: subscription.endpoint,
          userAgent: subscription.userAgent,
          deviceLabel: subscription.deviceLabel,
          keys: subscription.keys,
        });

        setPermission(browserPush.getPermission());
        onEnabledChange(true);
        await loadSubscriptions();
        onNotice('Браузерные уведомления включены');
      } else {
        const endpoint = await browserPush.unsubscribe();

        if (endpoint) {
          await notificationsApi.unregisterWebPushSubscription({
            accessToken,
            endpoint,
          });
        }

        setPermission(browserPush.getPermission());
        onEnabledChange(false);
        await loadSubscriptions();
        onNotice('Браузерные уведомления отключены');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось обновить browser push');
    } finally {
      setLoading(false);
    }
  };

  const stateLabel = useMemo(() => {
    if (!supported) {
      return 'Этот браузер не поддерживает push-уведомления';
    }

    if (config && (!config.enabled || !config.publicKey)) {
      return 'Push-уведомления еще не настроены на сервере';
    }

    if (permission === 'denied') {
      return 'Разрешение на уведомления заблокировано в браузере';
    }

    if (subscriptions.some((item) => item.isActive)) {
      return 'Push-уведомления подключены';
    }

    return 'Push-уведомления пока не подключены';
  }, [config, permission, subscriptions, supported]);

  return (
    <div className="account-browser-push">
      <div className="account-browser-push__header">
        <label className="checkbox-row account-browser-push__toggle">
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading || !accessToken}
            onChange={(event) => void handleToggle(event.target.checked)}
          />
          <span>
            <strong>Push-уведомления</strong>
            <small>Изменения расписания и напоминания в браузере</small>
          </span>
        </label>
        <Badge variant={enabled ? 'success' : 'neutral'}>{stateLabel}</Badge>
      </div>

      <div className="account-browser-push__meta">
        {permission === 'default' ? (
          <span>После включения браузер попросит разрешение на уведомления.</span>
        ) : null}
        {permission === 'denied' ? (
          <span>Разрешение можно вернуть в настройках браузера.</span>
        ) : null}
        <span>На iPhone push работает после добавления сайта на экран Домой.</span>
      </div>

      {subscriptions.length > 0 ? (
        <div className="account-browser-push__subscriptions">
          {subscriptions.map((subscription) => (
            <div key={subscription.id} className="account-browser-push__subscription">
              <div className="account-browser-push__subscription-copy">
                <strong>{subscription.deviceLabel || 'Браузер'}</strong>
                <span>Последняя активность: {formatLastSeenAt(subscription.lastSeenAt)}</span>
              </div>
              <Badge variant={subscription.isActive ? 'success' : 'neutral'}>
                {subscription.isActive ? 'Активна' : 'Выключена'}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}

      {enabled ? (
        <div className="account-browser-push__actions">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void loadSubscriptions()}
            loading={loading}
          >
            Обновить подписки
          </Button>
        </div>
      ) : null}
    </div>
  );
}
