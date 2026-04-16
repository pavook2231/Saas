'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  notificationsApi,
  type TestWebPushResponse,
  type WebPushClientConfig,
  type WebPushSubscriptionItem,
} from '@/app/lib/api/notifications';
import { browserPush } from '@/app/lib/notifications/browser-push';
import { usePwaInstallPrompt } from '@/app/providers/pwa-install-provider';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type BrowserNotificationsSettingsProps = {
  accessToken: string | null;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

type BrowserInstallGuide = {
  browserLabel: string;
  note: string;
  menuStep: string;
  actionStep: string;
  confirmStep: string;
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

const detectInstallGuide = (): BrowserInstallGuide => {
  if (typeof navigator === 'undefined') {
    return {
      browserLabel: 'Браузер',
      note: 'Если браузер не показывает системную установку, добавить сайт можно через его меню.',
      menuStep: 'Откройте меню браузера на этой странице.',
      actionStep: 'Найдите пункт «Установить приложение» или «Добавить на экран домой».',
      confirmStep: 'Подтвердите добавление сайта.',
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
  const isEdge = /edg|edgios|edga/.test(userAgent);
  const isSamsung = /samsungbrowser/.test(userAgent);
  const isFirefox = /firefox|fxios/.test(userAgent);
  const isChrome = /chrome|crios/.test(userAgent) && !isEdge && !isSamsung && !/opr|opera/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !isChrome && !isAndroid && !isEdge;

  if (isIphone || isIpad) {
    return {
      browserLabel: 'Safari на iPhone / iPad',
      note: 'На iPhone и iPad системный prompt не открывается кнопкой сайта, поэтому добавление делается через меню Safari.',
      menuStep: 'Нажмите кнопку «Поделиться» в Safari.',
      actionStep: 'Выберите «На экран Домой».',
      confirmStep: 'Подтвердите добавление и потом открывайте сервис уже с иконки на экране.',
    };
  }

  if (isSamsung) {
    return {
      browserLabel: 'Samsung Internet',
      note: 'В Samsung Internet установка сайта чаще всего доступна прямо в меню браузера.',
      menuStep: 'Откройте меню Samsung Internet.',
      actionStep: 'Найдите пункт «Добавить страницу на» или «Установить приложение».',
      confirmStep: 'Подтвердите добавление на главный экран.',
    };
  }

  if (isEdge) {
    return {
      browserLabel: 'Microsoft Edge',
      note: 'Edge обычно предлагает установку сам, но её можно открыть и вручную через меню браузера.',
      menuStep: 'Откройте меню Edge.',
      actionStep: 'Выберите «Приложения» и затем «Установить этот сайт как приложение».',
      confirmStep: 'Подтвердите установку.',
    };
  }

  if (isFirefox) {
    return {
      browserLabel: isAndroid ? 'Firefox на Android' : 'Firefox',
      note: 'В Firefox поддержка установки и web push зависит от платформы, поэтому иногда доступно только добавление ярлыка.',
      menuStep: 'Откройте меню Firefox.',
      actionStep: 'Найдите «Добавить на главный экран» или похожий пункт с ярлыком сайта.',
      confirmStep: 'Подтвердите добавление и затем проверьте push на этом устройстве.',
    };
  }

  if (isChrome) {
    return {
      browserLabel: isAndroid ? 'Chrome на Android' : 'Chrome',
      note: 'Chrome обычно умеет и системную установку, и ручное добавление сайта через меню.',
      menuStep: 'Откройте меню Chrome.',
      actionStep: 'Выберите «Установить приложение» или «Добавить на главный экран».',
      confirmStep: 'Подтвердите добавление и откройте сервис уже с домашнего экрана.',
    };
  }

  if (isSafari) {
    return {
      browserLabel: 'Safari',
      note: 'В Safari способ установки зависит от устройства, но чаще всего это делается через меню браузера.',
      menuStep: 'Откройте меню Safari или кнопку «Поделиться».',
      actionStep: 'Найдите «Добавить на экран Домой».',
      confirmStep: 'Подтвердите добавление сайта.',
    };
  }

  return {
    browserLabel: 'Текущий браузер',
    note: 'Если браузер не показывает системную установку, добавить сайт можно через его меню.',
    menuStep: 'Откройте меню браузера на этой странице.',
    actionStep: 'Найдите пункт «Установить приложение» или «Добавить на экран домой».',
    confirmStep: 'Подтвердите добавление сайта.',
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
  const [configState, setConfigState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [permission, setPermission] = useState(browserPush.getPermission());
  const [hasBrowserSubscription, setHasBrowserSubscription] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const { installPromptEvent, standaloneMode } = usePwaInstallPrompt();

  const supported = browserPush.isSupported();
  const platformInfo = useMemo(() => detectPushPlatform(), []);
  const installGuide = useMemo(() => detectInstallGuide(), []);
  const iosFamily = useMemo(() => isIosFamily(), []);
  const currentDeviceId = useMemo(() => browserPush.getClientDeviceId(), []);
  const hasServerDeviceSubscription = useMemo(
    () =>
      subscriptions.some(
        (subscription) =>
          subscription.isActive &&
          subscription.clientDeviceId !== null &&
          subscription.clientDeviceId === currentDeviceId,
      ),
    [currentDeviceId, subscriptions],
  );
  const hasDeviceSubscription = hasBrowserSubscription && hasServerDeviceSubscription;

  const syncDeviceSubscription = useCallback(async () => {
    if (!supported) {
      setPermission(browserPush.getPermission());
      setHasBrowserSubscription(false);
      return null;
    }

    try {
      const subscription = await browserPush.getSubscription();
      setPermission(browserPush.getPermission());
      setHasBrowserSubscription(Boolean(subscription));
      return subscription;
    } catch {
      setPermission(browserPush.getPermission());
      setHasBrowserSubscription(false);
      return null;
    }
  }, [supported]);

  const loadConfig = useCallback(async () => {
    if (!accessToken) {
      setConfig(null);
      setConfigState('idle');
      return null;
    }

    try {
      setConfigState('loading');
      const nextConfig = await notificationsApi.getWebPushConfig({ accessToken });
      setConfig(nextConfig);
      setConfigState('ready');
      return nextConfig;
    } catch (error) {
      setConfigState('error');
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
      setConfigState('idle');
      setHasBrowserSubscription(false);
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
      }

      return;
    }

    setInstallModalOpen(true);
  };

  const handleTestNotification = async () => {
    if (!accessToken) {
      onError('Нужна активная сессия.');
      return;
    }

    if (configState === 'loading') {
      onError('Подождите, пока загрузятся настройки push.');
      return;
    }

    if (configState === 'error' || !config?.enabled || !config?.publicKey) {
      onError('Сервер web push сейчас не готов.');
      return;
    }

    setTestingNotification(true);

    try {
      const response: TestWebPushResponse = await notificationsApi.sendTestWebPush({
        accessToken,
        clientDeviceId: browserPush.getClientDeviceId() ?? undefined,
      });

      if (!response.hasActiveSubscription) {
        onError('Для этого устройства нет активной push-подписки. Сначала включите уведомления.');
        return;
      }

      if (response.success) {
        onNotice('Тестовое уведомление отправлено именно на это устройство. Если push включен, оно должно прийти как обычное системное уведомление.');
        return;
      }

      if (response.pendingCount > 0) {
        onNotice('Тест отправлен на это устройство, но провайдер еще не подтвердил доставку. Проверь уведомления через несколько секунд.');
        return;
      }

      onError('Сервер попробовал отправить тест, но доставка не подтвердилась.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось отправить тестовое уведомление.');
    } finally {
      setTestingNotification(false);
    }
  };

  const stateLabel = useMemo(() => {
    if (!supported) {
      return 'Этот браузер не поддерживает push-уведомления.';
    }

    if (configState === 'loading') {
      return 'Проверяем настройки push на сервере.';
    }

    if (configState === 'error') {
      return 'Не удалось загрузить настройки push с сервера.';
    }

    if (config && (!config.enabled || !config.publicKey)) {
      return 'Push-уведомления еще не настроены на сервере.';
    }

    if (permission === 'denied') {
      return 'Разрешение на уведомления заблокировано в браузере.';
    }

    if (hasBrowserSubscription && !hasServerDeviceSubscription) {
      return 'На устройстве есть локальная подписка, но серверу нужна перепривязка. Включите push заново.';
    }

    return hasDeviceSubscription
      ? 'Push-уведомления подключены на этом устройстве.'
      : 'Push-уведомления пока не подключены.';
  }, [config, configState, hasBrowserSubscription, hasDeviceSubscription, hasServerDeviceSubscription, permission, supported]);

  const toggleHint = useMemo(() => {
    if (!accessToken) {
      return 'Нужна активная сессия';
    }

    if (!supported) {
      return 'Недоступно в этом браузере';
    }

    if (configState === 'loading') {
      return 'Проверяем настройки сервера';
    }

    if (configState === 'error') {
      return 'Не удалось проверить сервер push';
    }

    if (config && (!config.enabled || !config.publicKey)) {
      return 'Сервер push еще не настроен';
    }

    if (permission === 'denied') {
      return 'Разрешение заблокировано в браузере';
    }

    if (hasBrowserSubscription && !hasServerDeviceSubscription) {
      return 'Нажмите, чтобы перепривязать это устройство к серверу push';
    }

    return hasDeviceSubscription
      ? 'Нажмите, чтобы выключить'
      : 'Нажмите, чтобы включить';
  }, [accessToken, config, configState, hasBrowserSubscription, hasDeviceSubscription, hasServerDeviceSubscription, permission, supported]);

  const canToggle =
    Boolean(accessToken) &&
    supported &&
    configState !== 'loading' &&
    configState !== 'error' &&
    permission !== 'denied' &&
    !(config && (!config.enabled || !config.publicKey));

  const installLabel = standaloneMode
    ? 'Сайт уже работает как приложение'
    : installPromptEvent
      ? 'Можно установить прямо из этого блока'
      : iosFamily
        ? `Покажем шаги именно для ${installGuide.browserLabel}`
        : `Если системной кнопки нет, покажем шаги для ${installGuide.browserLabel}`;

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
      value:
        configState === 'loading'
          ? 'Проверяем'
          : configState === 'error'
            ? 'Ошибка проверки'
            : config && (!config.enabled || !config.publicKey)
              ? 'Не настроен'
              : 'Готов',
      tone:
        configState === 'loading'
          ? ('neutral' as const)
          : configState === 'error' || (config && (!config.enabled || !config.publicKey))
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
          <strong>Как настроить уведомления без путаницы</strong>
          <span>1. Добавьте сайт на экран домой, если кнопка выше это предлагает.</span>
          <span>2. Включите push именно на этом устройстве и дайте браузеру разрешение.</span>
          <span>3. Нажмите тест: он проверяет серверную доставку только для текущего телефона или браузера.</span>
          <span>{`4. Инструкция ниже подобрана именно для ${installGuide.browserLabel}.`}</span>
        </div>

        <div className="account-browser-push__meta">
          <span>На телефон приходят изменения расписания, срочные переносы и публикация новой недели.</span>
          <span>Напоминания о событиях включаются отдельным переключателем в этом же разделе.</span>
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
            disabled={testingNotification || !accessToken || configState === 'loading'}
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
        description={`Шаги ниже подобраны для ${installGuide.browserLabel}. Так сервис удобнее открывать как приложение, а web push на телефоне работает стабильнее.`}
        footer={
          <Button type="button" variant="ghost" onClick={() => setInstallModalOpen(false)}>
            Понятно
          </Button>
        }
      >
        <div className="account-browser-push__guide">
          <div className="account-browser-push__guide-note">
            <Badge variant={iosFamily ? 'warning' : 'neutral'}>{installGuide.browserLabel}</Badge>
            <span>{installGuide.note}</span>
          </div>
          <ol className="account-browser-push__guide-steps">
            <li>{installGuide.menuStep}</li>
            <li>{installGuide.actionStep}</li>
            <li>{installGuide.confirmStep}</li>
            <li>Потом открывайте сервис уже с иконки на домашнем экране.</li>
          </ol>
        </div>
      </Modal>
    </>
  );
}


