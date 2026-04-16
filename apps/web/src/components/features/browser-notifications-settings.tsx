'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  notificationsApi,
  type WebPushClientConfig,
  type WebPushSubscriptionItem,
} from '@/app/lib/api/notifications';
import { browserPush } from '@/app/lib/notifications/browser-push';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type BrowserNotificationsSettingsProps = {
  accessToken: string | null;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
};

const detectDeviceLabel = () => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return /iphone|android|mobile/i.test(navigator.userAgent)
    ? 'Мобильный браузер'
    : 'Браузер';
};

const detectPushPlatform = () => {
  if (typeof navigator === 'undefined') {
    return {
      label: 'Устройство',
      hint: 'Откройте страницу на нужном устройстве, чтобы проверить поддержку push.',
      variant: 'neutral' as const,
    };
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isIphone = /iphone/.test(userAgent);
  const isIpad =
    /ipad/.test(userAgent) ||
    (/macintosh/.test(userAgent) &&
      typeof document !== 'undefined' &&
      'ontouchend' in document);
  const isAndroid = /android/.test(userAgent);
  const isChrome = /chrome|crios/.test(userAgent) && !/edg|opr|opera/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome|crios|android/.test(userAgent);

  if (isIphone || isIpad) {
    return {
      label: 'iPhone / iPad',
      hint: 'На iPhone и iPad web push надежнее работает после добавления сайта на экран домой и запуска как отдельного веб-приложения.',
      variant: 'warning' as const,
    };
  }

  if (isAndroid && isChrome) {
    return {
      label: 'Android / Chrome',
      hint: 'На Android push работает прямо в браузере, а запуск с домашнего экрана делает сервис удобнее как приложение.',
      variant: 'success' as const,
    };
  }

  if (isChrome) {
    return {
      label: 'Chrome',
      hint: 'Push поддерживается прямо в браузере. Достаточно выдать разрешение на уведомления.',
      variant: 'success' as const,
    };
  }

  if (isSafari) {
    return {
      label: 'Safari',
      hint: 'На Mac push работает в Safari. На iPhone и iPad нужен запуск с экрана домой.',
      variant: 'warning' as const,
    };
  }

  return {
    label: 'Браузер',
    hint: 'Поддержка push зависит от браузера и системных разрешений.',
    variant: 'neutral' as const,
  };
};

const isIosFamily = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isIphone = /iphone/.test(userAgent);
  const isIpad =
    /ipad/.test(userAgent) ||
    (/macintosh/.test(userAgent) &&
      typeof document !== 'undefined' &&
      'ontouchend' in document);

  return isIphone || isIpad;
};

const getStandaloneMode = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
};

const permissionLabel: Record<NotificationPermission | 'unsupported', string> = {
  default: 'Разрешение еще не выдано',
  denied: 'Разрешение заблокировано',
  granted: 'Разрешение выдано',
  unsupported: 'Браузер не поддерживает web push',
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
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [standaloneMode, setStandaloneMode] = useState(getStandaloneMode);
  const [testingNotification, setTestingNotification] = useState(false);

  const supported = browserPush.isSupported();
  const platformInfo = useMemo(() => detectPushPlatform(), []);
  const iosFamily = useMemo(() => isIosFamily(), []);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const syncStandaloneMode = () => {
      setStandaloneMode(getStandaloneMode());
    };

    syncStandaloneMode();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      syncStandaloneMode();
    };

    const handleInstalled = () => {
      setInstallPromptEvent(null);
      syncStandaloneMode();
      onNotice('Сайт добавлен на экран домой. Лучше открывать сервис именно оттуда.');
    };

    mediaQuery.addEventListener('change', syncStandaloneMode);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      mediaQuery.removeEventListener('change', syncStandaloneMode);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [onNotice]);

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
        const clientDeviceId = browserPush.getClientDeviceId() ?? undefined;

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
          clientDeviceId,
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
            clientDeviceId: browserPush.getClientDeviceId() ?? undefined,
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

  const handleInstall = async () => {
    if (standaloneMode) {
      onNotice('Сайт уже открыт как приложение с экрана домой.');
      return;
    }

    if (installPromptEvent) {
      try {
        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;

        if (choice.outcome === 'accepted') {
          onNotice('Сайт добавлен на экран домой. Открывайте его как приложение.');
        } else {
          onNotice('Установка не подтверждена. Инструкцию можно открыть снова в этом блоке.');
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Не удалось открыть установку сайта.');
      } finally {
        setInstallPromptEvent(null);
      }

      return;
    }

    setInstallModalOpen(true);
  };

  const handleTestNotification = async () => {
    if (!supported) {
      onError('Этот браузер не поддерживает web push-уведомления.');
      return;
    }

    if (!hasDeviceSubscription) {
      onError('Сначала включите push-уведомления для этого устройства.');
      return;
    }

    if (permission !== 'granted') {
      onError('Браузер пока не выдал разрешение на уведомления.');
      return;
    }

    setTestingNotification(true);

    try {
      const registration = await browserPush.ensureServiceWorker();
      await registration.showNotification('Тест уведомлений', {
        body: 'Это локальная проверка web push. Если карточка видна, устройство готово к уведомлениям.',
        tag: 'local-web-push-test',
        requireInteraction: false,
        icon: '/calendar-icon',
        badge: '/calendar-icon',
        data: {
          url: '/profile',
        },
      });
      onNotice('Тестовое уведомление отправлено на это устройство.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось показать тестовое уведомление.');
    } finally {
      setTestingNotification(false);
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

  const installLabel = standaloneMode
    ? 'Сайт уже работает как приложение'
    : installPromptEvent
      ? 'Можно установить прямо из этого блока'
      : iosFamily
        ? 'Нужна инструкция через меню "Поделиться"'
        : 'Если браузер не показал кнопку, откроем инструкцию';

  const statusItems = [
    {
      label: 'Устройство',
      value: platformInfo.label,
      tone: 'neutral' as const,
    },
    {
      label: 'Установка на экран',
      value: standaloneMode ? 'Уже добавлен' : 'Пока в браузере',
      tone: standaloneMode ? ('success' as const) : ('warning' as const),
    },
    {
      label: 'Push в браузере',
      value: supported ? 'Поддерживается' : 'Не поддерживается',
      tone: supported ? ('success' as const) : ('error' as const),
    },
    {
      label: 'Разрешение',
      value: permissionLabel[permission],
      tone:
        permission === 'granted'
          ? ('success' as const)
          : permission === 'denied'
            ? ('error' as const)
            : ('neutral' as const),
    },
    {
      label: 'Сервер push',
      value: config && (!config.enabled || !config.publicKey) ? 'Не настроен' : 'Готов',
      tone:
        config && (!config.enabled || !config.publicKey)
          ? ('error' as const)
          : ('success' as const),
    },
    {
      label: 'Это устройство',
      value: hasDeviceSubscription ? 'Подписано' : 'Не подписано',
      tone: hasDeviceSubscription ? ('success' as const) : ('warning' as const),
    },
  ];

  return (
    <>
      <div className="account-browser-push">
        <div className="account-browser-push__header">
          <button
            type="button"
            className={`account-browser-push__switch ${hasDeviceSubscription ? 'is-enabled' : 'is-disabled'}`}
            onClick={() => void handleToggle(!hasDeviceSubscription)}
            disabled={loading || !canToggle}
            role="switch"
            aria-checked={hasDeviceSubscription}
            aria-label={hasDeviceSubscription ? 'Выключить push-уведомления' : 'Включить push-уведомления'}
          >
            <span
              className={`account-browser-push__bell ${hasDeviceSubscription ? 'is-enabled' : 'is-disabled'}`}
            >
              <BellIcon enabled={hasDeviceSubscription} />
            </span>
            <span className="account-browser-push__switch-copy">
              <strong>{hasDeviceSubscription ? 'Уведомления включены' : 'Уведомления выключены'}</strong>
              <small>{loading ? 'Сохраняем...' : toggleHint}</small>
            </span>
          </button>
          <Badge variant={hasDeviceSubscription ? 'success' : 'error'}>{stateLabel}</Badge>
        </div>

        <div className="account-browser-push__platform">
          <Badge variant={platformInfo.variant}>{platformInfo.label}</Badge>
          <span>{platformInfo.hint}</span>
        </div>

        <div className="account-browser-push__install">
          <div className="account-browser-push__install-copy">
            <strong>Добавить на экран домой</strong>
            <span>{installLabel}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant={standaloneMode ? 'ghost' : 'primary'}
            onClick={() => void handleInstall()}
          >
            {standaloneMode ? 'Уже добавлен' : 'Добавить'}
          </Button>
        </div>

        <div className="account-browser-push__status-grid">
          {statusItems.map((item) => (
            <div key={item.label} className="account-browser-push__status-item">
              <span>{item.label}</span>
              <Badge variant={item.tone}>{item.value}</Badge>
            </div>
          ))}
        </div>

        <div className="account-browser-push__summary">
          <strong>Что придет на телефон</strong>
          <span>Изменения расписания, срочные переносы и публикация новой недели.</span>
          <span>Напоминания приходят отдельно и зависят от переключателя выше.</span>
        </div>

        <div className="account-browser-push__meta">
          {permission === 'default' ? (
            <span>После включения браузер попросит разрешение на уведомления.</span>
          ) : null}
          {permission === 'denied' ? (
            <span>Разрешение можно вернуть в настройках браузера и устройства.</span>
          ) : null}
          {!supported ? (
            <span>На этом устройстве браузер не дает оформить web push-подписку.</span>
          ) : null}
          {standaloneMode ? (
            <span>Сайт уже установлен. Для лучшей доставки открывайте сервис именно с иконки на домашнем экране.</span>
          ) : null}
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
            onClick={() => void handleTestNotification()}
            loading={testingNotification}
            disabled={!hasDeviceSubscription || permission !== 'granted'}
          >
            Тест уведомления
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void Promise.all([loadSubscriptions(), syncDeviceSubscription(), loadConfig()])}
            loading={loading}
          >
            Обновить статус
          </Button>
        </div>
      </div>

      <Modal
        open={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        title="Добавить на экран домой"
        description="Так сервис удобнее открывать как приложение, а web push на телефоне работает стабильнее."
        footer={
          <Button type="button" variant="ghost" onClick={() => setInstallModalOpen(false)}>
            Понятно
          </Button>
        }
      >
        <div className="account-browser-push__guide">
          <div className="account-browser-push__guide-note">
            <Badge variant={iosFamily ? 'warning' : 'neutral'}>
              {iosFamily ? 'iPhone / iPad' : 'Браузер'}
            </Badge>
            <span>
              {iosFamily
                ? 'В iPhone браузер не дает открыть установку кнопкой сайта, поэтому добавление делается через меню Safari.'
                : 'Если браузер не показал системное окно установки, можно добавить сайт вручную через меню браузера.'}
            </span>
          </div>
          <ol className="account-browser-push__guide-steps">
            <li>Откройте меню браузера на этой странице.</li>
            <li>
              {iosFamily
                ? 'Нажмите "Поделиться".'
                : 'Найдите пункт "Установить приложение" или "Добавить на экран домой".'}
            </li>
            <li>{iosFamily ? 'Выберите "На экран Домой".' : 'Подтвердите добавление сайта.'}</li>
            <li>Потом открывайте сервис уже с иконки на домашнем экране.</li>
          </ol>
        </div>
      </Modal>
    </>
  );
}
