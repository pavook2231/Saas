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

const BellIcon = ({ enabled }: { enabled: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 3.75a4.5 4.5 0 0 0-4.5 4.5v1.01c0 .8-.22 1.58-.63 2.26l-1.24 2.07A2.25 2.25 0 0 0 7.56 17h8.88a2.25 2.25 0 0 0 1.93-3.41l-1.24-2.07a4.37 4.37 0 0 1-.63-2.26V8.25a4.5 4.5 0 0 0-4.5-4.5Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M9.75 18.25a2.25 2.25 0 0 0 4.5 0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    {!enabled ? (
      <path
        d="M6 5.75 18 17.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    ) : null}
  </svg>
);

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
  onNotice,
  onError,
}: BrowserNotificationsSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<WebPushSubscriptionItem[]>([]);
  const [config, setConfig] = useState<WebPushClientConfig | null>(null);
  const [permission, setPermission] = useState(browserPush.getPermission());
  const [hasDeviceSubscription, setHasDeviceSubscription] = useState(false);

  const supported = browserPush.isSupported();

  const syncDeviceSubscription = useCallback(async () => {
    if (!supported) {
      setPermission(browserPush.getPermission());
      setHasDeviceSubscription(false);
      return null;
    }

    try {
      const subscription = await browserPush.getSubscription();
      setPermission(browserPush.getPermission());
      setHasDeviceSubscription(Boolean(subscription));
      return subscription;
    } catch {
      setPermission(browserPush.getPermission());
      setHasDeviceSubscription(false);
      return null;
    }
  }, [supported]);

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
          : 'Не удалось получить настройки браузерных уведомлений.',
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
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось загрузить push-подписки.');
    }
  }, [accessToken, onError]);

  useEffect(() => {
    if (!accessToken) {
      setSubscriptions([]);
      setConfig(null);
      setHasDeviceSubscription(false);
      setPermission(browserPush.getPermission());
      return;
    }

    void Promise.all([loadConfig(), loadSubscriptions(), syncDeviceSubscription()]);
  }, [accessToken, loadConfig, loadSubscriptions, syncDeviceSubscription]);

  const handleToggle = async (nextValue: boolean) => {
    if (!accessToken) {
      onError('Нужна активная сессия.');
      return;
    }

    if (!supported) {
      onError('Этот браузер не поддерживает push-уведомления.');
      return;
    }

    setLoading(true);

    try {
      if (nextValue) {
        const runtimeConfig = (await loadConfig()) ?? config;

        if (!runtimeConfig?.enabled || !runtimeConfig.publicKey) {
          throw new Error('На сервере пока не настроены браузерные push-уведомления.');
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

        await Promise.all([syncDeviceSubscription(), loadSubscriptions()]);
        onNotice('Push-уведомления включены для этого устройства.');
      } else {
        const endpoint = await browserPush.unsubscribe();

        if (endpoint) {
          await notificationsApi.unregisterWebPushSubscription({
            accessToken,
            endpoint,
          });
        }

        await Promise.all([syncDeviceSubscription(), loadSubscriptions()]);
        onNotice('Push-уведомления выключены на этом устройстве.');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось обновить push-уведомления.');
    } finally {
      setLoading(false);
    }
  };

  const stateLabel = useMemo(() => {
    if (!supported) {
      return 'Этот браузер не поддерживает push-уведомления.';
    }

    if (config && (!config.enabled || !config.publicKey)) {
      return 'Push-уведомления еще не настроены на сервере.';
    }

    if (permission === 'denied') {
      return 'Разрешение на уведомления заблокировано в браузере.';
    }

    return hasDeviceSubscription
      ? 'Push-уведомления подключены на этом устройстве.'
      : 'Push-уведомления пока не подключены.';
  }, [config, hasDeviceSubscription, permission, supported]);

  const toggleHint = useMemo(() => {
    if (!accessToken) {
      return 'Нужна активная сессия';
    }

    if (!supported) {
      return 'Недоступно в этом браузере';
    }

    if (config && (!config.enabled || !config.publicKey)) {
      return 'Сервер push еще не настроен';
    }

    if (permission === 'denied') {
      return 'Разрешение заблокировано в браузере';
    }

    return hasDeviceSubscription
      ? 'Нажмите, чтобы выключить'
      : 'Нажмите, чтобы включить';
  }, [accessToken, config, hasDeviceSubscription, permission, supported]);

  const canToggle =
    Boolean(accessToken) &&
    supported &&
    permission !== 'denied' &&
    !(config && (!config.enabled || !config.publicKey));

  return (
    <div className="account-browser-push">
      <div className="account-browser-push__header">
        <button
          type="button"
          className={`account-browser-push__switch ${hasDeviceSubscription ? 'is-enabled' : 'is-disabled'}`}
          onClick={() => void handleToggle(!hasDeviceSubscription)}
          disabled={loading || !canToggle}
          role="switch"
          aria-checked={hasDeviceSubscription}
          aria-label={
            hasDeviceSubscription
              ? 'Выключить push-уведомления'
              : 'Включить push-уведомления'
          }
        >
          <span
            className={`account-browser-push__bell ${hasDeviceSubscription ? 'is-enabled' : 'is-disabled'}`}
          >
            <BellIcon enabled={hasDeviceSubscription} />
          </span>
          <span className="account-browser-push__switch-copy">
            <strong>
              {hasDeviceSubscription ? 'Уведомления включены' : 'Уведомления выключены'}
            </strong>
            <small>{loading ? 'Сохраняем...' : toggleHint}</small>
          </span>
        </button>
        <Badge variant={hasDeviceSubscription ? 'success' : 'error'}>{stateLabel}</Badge>
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

      <div className="account-browser-push__actions">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void Promise.all([loadSubscriptions(), syncDeviceSubscription()])}
          loading={loading}
        >
          Обновить статус
        </Button>
      </div>
    </div>
  );
}
