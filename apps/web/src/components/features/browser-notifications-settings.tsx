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
    ? 'РњРѕР±РёР»СЊРЅС‹Р№ Р±СЂР°СѓР·РµСЂ'
    : 'Р‘СЂР°СѓР·РµСЂ';
};

const detectPushPlatform = () => {
  if (typeof navigator === 'undefined') {
    return {
      label: 'РЈСЃС‚СЂРѕР№СЃС‚РІРѕ',
      hint: 'РћС‚РєСЂРѕР№С‚Рµ СЃС‚СЂР°РЅРёС†Сѓ РЅР° РЅСѓР¶РЅРѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ, С‡С‚РѕР±С‹ РїСЂРѕРІРµСЂРёС‚СЊ РїРѕРґРґРµСЂР¶РєСѓ push.',
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
      hint: 'РќР° iPhone Рё iPad web push РЅР°РґРµР¶РЅРµРµ СЂР°Р±РѕС‚Р°РµС‚ РїРѕСЃР»Рµ РґРѕР±Р°РІР»РµРЅРёСЏ СЃР°Р№С‚Р° РЅР° СЌРєСЂР°РЅ РґРѕРјРѕР№ Рё Р·Р°РїСѓСЃРєР° РєР°Рє РѕС‚РґРµР»СЊРЅРѕРіРѕ РІРµР±-РїСЂРёР»РѕР¶РµРЅРёСЏ.',
      variant: 'warning' as const,
    };
  }

  if (isAndroid && isChrome) {
    return {
      label: 'Android / Chrome',
      hint: 'РќР° Android push СЂР°Р±РѕС‚Р°РµС‚ РїСЂСЏРјРѕ РІ Р±СЂР°СѓР·РµСЂРµ, Р° Р·Р°РїСѓСЃРє СЃ РґРѕРјР°С€РЅРµРіРѕ СЌРєСЂР°РЅР° РґРµР»Р°РµС‚ СЃРµСЂРІРёСЃ СѓРґРѕР±РЅРµРµ РєР°Рє РїСЂРёР»РѕР¶РµРЅРёРµ.',
      variant: 'success' as const,
    };
  }

  if (isChrome) {
    return {
      label: 'Chrome',
      hint: 'Push РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ РїСЂСЏРјРѕ РІ Р±СЂР°СѓР·РµСЂРµ. Р”РѕСЃС‚Р°С‚РѕС‡РЅРѕ РІС‹РґР°С‚СЊ СЂР°Р·СЂРµС€РµРЅРёРµ РЅР° СѓРІРµРґРѕРјР»РµРЅРёСЏ.',
      variant: 'success' as const,
    };
  }

  if (isSafari) {
    return {
      label: 'Safari',
      hint: 'РќР° Mac push СЂР°Р±РѕС‚Р°РµС‚ РІ Safari. РќР° iPhone Рё iPad РЅСѓР¶РµРЅ Р·Р°РїСѓСЃРє СЃ СЌРєСЂР°РЅР° РґРѕРјРѕР№.',
      variant: 'warning' as const,
    };
  }

  return {
    label: 'Р‘СЂР°СѓР·РµСЂ',
    hint: 'РџРѕРґРґРµСЂР¶РєР° push Р·Р°РІРёСЃРёС‚ РѕС‚ Р±СЂР°СѓР·РµСЂР° Рё СЃРёСЃС‚РµРјРЅС‹С… СЂР°Р·СЂРµС€РµРЅРёР№.',
    variant: 'neutral' as const,
  };
};

const detectInstallGuide = (): BrowserInstallGuide => {
  if (typeof navigator === 'undefined') {
    return {
      browserLabel: 'Р‘СЂР°СѓР·РµСЂ',
      note: 'Р•СЃР»Рё Р±СЂР°СѓР·РµСЂ РЅРµ РїРѕРєР°Р·С‹РІР°РµС‚ СЃРёСЃС‚РµРјРЅСѓСЋ СѓСЃС‚Р°РЅРѕРІРєСѓ, РґРѕР±Р°РІРёС‚СЊ СЃР°Р№С‚ РјРѕР¶РЅРѕ С‡РµСЂРµР· РµРіРѕ РјРµРЅСЋ.',
      menuStep: 'РћС‚РєСЂРѕР№С‚Рµ РјРµРЅСЋ Р±СЂР°СѓР·РµСЂР° РЅР° СЌС‚РѕР№ СЃС‚СЂР°РЅРёС†Рµ.',
      actionStep: 'РќР°Р№РґРёС‚Рµ РїСѓРЅРєС‚ В«РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РїСЂРёР»РѕР¶РµРЅРёРµВ» РёР»Рё В«Р”РѕР±Р°РІРёС‚СЊ РЅР° СЌРєСЂР°РЅ РґРѕРјРѕР№В».',
      confirmStep: 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ РґРѕР±Р°РІР»РµРЅРёРµ СЃР°Р№С‚Р°.',
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
      browserLabel: 'Safari РЅР° iPhone / iPad',
      note: 'РќР° iPhone Рё iPad СЃРёСЃС‚РµРјРЅС‹Р№ prompt РЅРµ РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ РєРЅРѕРїРєРѕР№ СЃР°Р№С‚Р°, РїРѕСЌС‚РѕРјСѓ РґРѕР±Р°РІР»РµРЅРёРµ РґРµР»Р°РµС‚СЃСЏ С‡РµСЂРµР· РјРµРЅСЋ Safari.',
      menuStep: 'РќР°Р¶РјРёС‚Рµ РєРЅРѕРїРєСѓ В«РџРѕРґРµР»РёС‚СЊСЃСЏВ» РІ Safari.',
      actionStep: 'Р’С‹Р±РµСЂРёС‚Рµ В«РќР° СЌРєСЂР°РЅ Р”РѕРјРѕР№В».',
      confirmStep: 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ РґРѕР±Р°РІР»РµРЅРёРµ Рё РїРѕС‚РѕРј РѕС‚РєСЂС‹РІР°Р№С‚Рµ СЃРµСЂРІРёСЃ СѓР¶Рµ СЃ РёРєРѕРЅРєРё РЅР° СЌРєСЂР°РЅРµ.',
    };
  }

  if (isSamsung) {
    return {
      browserLabel: 'Samsung Internet',
      note: 'Р’ Samsung Internet СѓСЃС‚Р°РЅРѕРІРєР° СЃР°Р№С‚Р° С‡Р°С‰Рµ РІСЃРµРіРѕ РґРѕСЃС‚СѓРїРЅР° РїСЂСЏРјРѕ РІ РјРµРЅСЋ Р±СЂР°СѓР·РµСЂР°.',
      menuStep: 'РћС‚РєСЂРѕР№С‚Рµ РјРµРЅСЋ Samsung Internet.',
      actionStep: 'РќР°Р№РґРёС‚Рµ РїСѓРЅРєС‚ В«Р”РѕР±Р°РІРёС‚СЊ СЃС‚СЂР°РЅРёС†Сѓ РЅР°В» РёР»Рё В«РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РїСЂРёР»РѕР¶РµРЅРёРµВ».',
      confirmStep: 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ РґРѕР±Р°РІР»РµРЅРёРµ РЅР° РіР»Р°РІРЅС‹Р№ СЌРєСЂР°РЅ.',
    };
  }

  if (isEdge) {
    return {
      browserLabel: 'Microsoft Edge',
      note: 'Edge РѕР±С‹С‡РЅРѕ РїСЂРµРґР»Р°РіР°РµС‚ СѓСЃС‚Р°РЅРѕРІРєСѓ СЃР°Рј, РЅРѕ РµС‘ РјРѕР¶РЅРѕ РѕС‚РєСЂС‹С‚СЊ Рё РІСЂСѓС‡РЅСѓСЋ С‡РµСЂРµР· РјРµРЅСЋ Р±СЂР°СѓР·РµСЂР°.',
      menuStep: 'РћС‚РєСЂРѕР№С‚Рµ РјРµРЅСЋ Edge.',
      actionStep: 'Р’С‹Р±РµСЂРёС‚Рµ В«РџСЂРёР»РѕР¶РµРЅРёСЏВ» Рё Р·Р°С‚РµРј В«РЈСЃС‚Р°РЅРѕРІРёС‚СЊ СЌС‚РѕС‚ СЃР°Р№С‚ РєР°Рє РїСЂРёР»РѕР¶РµРЅРёРµВ».',
      confirmStep: 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ СѓСЃС‚Р°РЅРѕРІРєСѓ.',
    };
  }

  if (isFirefox) {
    return {
      browserLabel: isAndroid ? 'Firefox РЅР° Android' : 'Firefox',
      note: 'Р’ Firefox РїРѕРґРґРµСЂР¶РєР° СѓСЃС‚Р°РЅРѕРІРєРё Рё web push Р·Р°РІРёСЃРёС‚ РѕС‚ РїР»Р°С‚С„РѕСЂРјС‹, РїРѕСЌС‚РѕРјСѓ РёРЅРѕРіРґР° РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ РґРѕР±Р°РІР»РµРЅРёРµ СЏСЂР»С‹РєР°.',
      menuStep: 'РћС‚РєСЂРѕР№С‚Рµ РјРµРЅСЋ Firefox.',
      actionStep: 'РќР°Р№РґРёС‚Рµ В«Р”РѕР±Р°РІРёС‚СЊ РЅР° РіР»Р°РІРЅС‹Р№ СЌРєСЂР°РЅВ» РёР»Рё РїРѕС…РѕР¶РёР№ РїСѓРЅРєС‚ СЃ СЏСЂР»С‹РєРѕРј СЃР°Р№С‚Р°.',
      confirmStep: 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ РґРѕР±Р°РІР»РµРЅРёРµ Рё Р·Р°С‚РµРј РїСЂРѕРІРµСЂСЊС‚Рµ push РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ.',
    };
  }

  if (isChrome) {
    return {
      browserLabel: isAndroid ? 'Chrome РЅР° Android' : 'Chrome',
      note: 'Chrome РѕР±С‹С‡РЅРѕ СѓРјРµРµС‚ Рё СЃРёСЃС‚РµРјРЅСѓСЋ СѓСЃС‚Р°РЅРѕРІРєСѓ, Рё СЂСѓС‡РЅРѕРµ РґРѕР±Р°РІР»РµРЅРёРµ СЃР°Р№С‚Р° С‡РµСЂРµР· РјРµРЅСЋ.',
      menuStep: 'РћС‚РєСЂРѕР№С‚Рµ РјРµРЅСЋ Chrome.',
      actionStep: 'Р’С‹Р±РµСЂРёС‚Рµ В«РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РїСЂРёР»РѕР¶РµРЅРёРµВ» РёР»Рё В«Р”РѕР±Р°РІРёС‚СЊ РЅР° РіР»Р°РІРЅС‹Р№ СЌРєСЂР°РЅВ».',
      confirmStep: 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ РґРѕР±Р°РІР»РµРЅРёРµ Рё РѕС‚РєСЂРѕР№С‚Рµ СЃРµСЂРІРёСЃ СѓР¶Рµ СЃ РґРѕРјР°С€РЅРµРіРѕ СЌРєСЂР°РЅР°.',
    };
  }

  if (isSafari) {
    return {
      browserLabel: 'Safari',
      note: 'Р’ Safari СЃРїРѕСЃРѕР± СѓСЃС‚Р°РЅРѕРІРєРё Р·Р°РІРёСЃРёС‚ РѕС‚ СѓСЃС‚СЂРѕР№СЃС‚РІР°, РЅРѕ С‡Р°С‰Рµ РІСЃРµРіРѕ СЌС‚Рѕ РґРµР»Р°РµС‚СЃСЏ С‡РµСЂРµР· РјРµРЅСЋ Р±СЂР°СѓР·РµСЂР°.',
      menuStep: 'РћС‚РєСЂРѕР№С‚Рµ РјРµРЅСЋ Safari РёР»Рё РєРЅРѕРїРєСѓ В«РџРѕРґРµР»РёС‚СЊСЃСЏВ».',
      actionStep: 'РќР°Р№РґРёС‚Рµ В«Р”РѕР±Р°РІРёС‚СЊ РЅР° СЌРєСЂР°РЅ Р”РѕРјРѕР№В».',
      confirmStep: 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ РґРѕР±Р°РІР»РµРЅРёРµ СЃР°Р№С‚Р°.',
    };
  }

  return {
    browserLabel: 'РўРµРєСѓС‰РёР№ Р±СЂР°СѓР·РµСЂ',
    note: 'Р•СЃР»Рё Р±СЂР°СѓР·РµСЂ РЅРµ РїРѕРєР°Р·С‹РІР°РµС‚ СЃРёСЃС‚РµРјРЅСѓСЋ СѓСЃС‚Р°РЅРѕРІРєСѓ, РґРѕР±Р°РІРёС‚СЊ СЃР°Р№С‚ РјРѕР¶РЅРѕ С‡РµСЂРµР· РµРіРѕ РјРµРЅСЋ.',
    menuStep: 'РћС‚РєСЂРѕР№С‚Рµ РјРµРЅСЋ Р±СЂР°СѓР·РµСЂР° РЅР° СЌС‚РѕР№ СЃС‚СЂР°РЅРёС†Рµ.',
    actionStep: 'РќР°Р№РґРёС‚Рµ РїСѓРЅРєС‚ В«РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РїСЂРёР»РѕР¶РµРЅРёРµВ» РёР»Рё В«Р”РѕР±Р°РІРёС‚СЊ РЅР° СЌРєСЂР°РЅ РґРѕРјРѕР№В».',
    confirmStep: 'РџРѕРґС‚РІРµСЂРґРёС‚Рµ РґРѕР±Р°РІР»РµРЅРёРµ СЃР°Р№С‚Р°.',
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
  default: 'Р Р°Р·СЂРµС€РµРЅРёРµ РµС‰Рµ РЅРµ РІС‹РґР°РЅРѕ',
  denied: 'Р Р°Р·СЂРµС€РµРЅРёРµ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅРѕ',
  granted: 'Р Р°Р·СЂРµС€РµРЅРёРµ РІС‹РґР°РЅРѕ',
  unsupported: 'Р‘СЂР°СѓР·РµСЂ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ web push',
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
    return 'вЂ”';
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
          : 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё Р±СЂР°СѓР·РµСЂРЅС‹С… СѓРІРµРґРѕРјР»РµРЅРёР№.',
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
      onError(error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ push-РїРѕРґРїРёСЃРєРё.');
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
      onError('РќСѓР¶РЅР° Р°РєС‚РёРІРЅР°СЏ СЃРµСЃСЃРёСЏ.');
      return;
    }

    if (!supported) {
      onError('Р­С‚РѕС‚ Р±СЂР°СѓР·РµСЂ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ push-СѓРІРµРґРѕРјР»РµРЅРёСЏ.');
      return;
    }

    setLoading(true);

    try {
      if (nextValue) {
        const runtimeConfig = (await loadConfig()) ?? config;
        const clientDeviceId = browserPush.getClientDeviceId() ?? undefined;

        if (!runtimeConfig?.enabled || !runtimeConfig.publicKey) {
          throw new Error('РќР° СЃРµСЂРІРµСЂРµ РїРѕРєР° РЅРµ РЅР°СЃС‚СЂРѕРµРЅС‹ Р±СЂР°СѓР·РµСЂРЅС‹Рµ push-СѓРІРµРґРѕРјР»РµРЅРёСЏ.');
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
        onNotice('Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РІРєР»СЋС‡РµРЅС‹ РґР»СЏ СЌС‚РѕРіРѕ СѓСЃС‚СЂРѕР№СЃС‚РІР°.');
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
        onNotice('Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РІС‹РєР»СЋС‡РµРЅС‹ РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ.');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ push-СѓРІРµРґРѕРјР»РµРЅРёСЏ.');
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async () => {
    if (standaloneMode) {
      onNotice('РЎР°Р№С‚ СѓР¶Рµ РѕС‚РєСЂС‹С‚ РєР°Рє РїСЂРёР»РѕР¶РµРЅРёРµ СЃ СЌРєСЂР°РЅР° РґРѕРјРѕР№.');
      return;
    }

    if (installPromptEvent) {
      try {
        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;

        if (choice.outcome === 'accepted') {
          onNotice('РЎР°Р№С‚ РґРѕР±Р°РІР»РµРЅ РЅР° СЌРєСЂР°РЅ РґРѕРјРѕР№. РћС‚РєСЂС‹РІР°Р№С‚Рµ РµРіРѕ РєР°Рє РїСЂРёР»РѕР¶РµРЅРёРµ.');
        } else {
          onNotice('РЈСЃС‚Р°РЅРѕРІРєР° РЅРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅР°. РРЅСЃС‚СЂСѓРєС†РёСЋ РјРѕР¶РЅРѕ РѕС‚РєСЂС‹С‚СЊ СЃРЅРѕРІР° РІ СЌС‚РѕРј Р±Р»РѕРєРµ.');
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ СѓСЃС‚Р°РЅРѕРІРєСѓ СЃР°Р№С‚Р°.');
      }

      return;
    }

    setInstallModalOpen(true);
  };

  const handleTestNotification = async () => {
    if (!accessToken) {
      onError('РќСѓР¶РЅР° Р°РєС‚РёРІРЅР°СЏ СЃРµСЃСЃРёСЏ.');
      return;
    }

    if (configState === 'loading') {
      onError('РџРѕРґРѕР¶РґРёС‚Рµ, РїРѕРєР° Р·Р°РіСЂСѓР·СЏС‚СЃСЏ РЅР°СЃС‚СЂРѕР№РєРё push.');
      return;
    }

    if (configState === 'error' || !config?.enabled || !config?.publicKey) {
      onError('РЎРµСЂРІРµСЂ web push СЃРµР№С‡Р°СЃ РЅРµ РіРѕС‚РѕРІ.');
      return;
    }

    setTestingNotification(true);

    try {
      const response: TestWebPushResponse = await notificationsApi.sendTestWebPush({
        accessToken,
        clientDeviceId: browserPush.getClientDeviceId() ?? undefined,
      });

      if (!response.hasActiveSubscription) {
        onError('Р”Р»СЏ СЌС‚РѕРіРѕ СѓСЃС‚СЂРѕР№СЃС‚РІР° РЅРµС‚ Р°РєС‚РёРІРЅРѕР№ push-РїРѕРґРїРёСЃРєРё. РЎРЅР°С‡Р°Р»Р° РІРєР»СЋС‡РёС‚Рµ СѓРІРµРґРѕРјР»РµРЅРёСЏ.');
        return;
      }

      if (response.success) {
        onNotice('РўРµСЃС‚РѕРІРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ РѕС‚РїСЂР°РІР»РµРЅРѕ РёРјРµРЅРЅРѕ РЅР° СЌС‚Рѕ СѓСЃС‚СЂРѕР№СЃС‚РІРѕ. Р•СЃР»Рё push РІРєР»СЋС‡РµРЅ, РѕРЅРѕ РґРѕР»Р¶РЅРѕ РїСЂРёР№С‚Рё РєР°Рє РѕР±С‹С‡РЅРѕРµ СЃРёСЃС‚РµРјРЅРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ.');
        return;
      }

      if (response.pendingCount > 0) {
        onNotice('РўРµСЃС‚ РѕС‚РїСЂР°РІР»РµРЅ РЅР° СЌС‚Рѕ СѓСЃС‚СЂРѕР№СЃС‚РІРѕ, РЅРѕ РїСЂРѕРІР°Р№РґРµСЂ РµС‰Рµ РЅРµ РїРѕРґС‚РІРµСЂРґРёР» РґРѕСЃС‚Р°РІРєСѓ. РџСЂРѕРІРµСЂСЊ СѓРІРµРґРѕРјР»РµРЅРёСЏ С‡РµСЂРµР· РЅРµСЃРєРѕР»СЊРєРѕ СЃРµРєСѓРЅРґ.');
        return;
      }

      onError('РЎРµСЂРІРµСЂ РїРѕРїСЂРѕР±РѕРІР°Р» РѕС‚РїСЂР°РІРёС‚СЊ С‚РµСЃС‚, РЅРѕ РґРѕСЃС‚Р°РІРєР° РЅРµ РїРѕРґС‚РІРµСЂРґРёР»Р°СЃСЊ.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ С‚РµСЃС‚РѕРІРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ.');
    } finally {
      setTestingNotification(false);
    }
  };

  const stateLabel = useMemo(() => {
    if (!supported) {
      return 'Р­С‚РѕС‚ Р±СЂР°СѓР·РµСЂ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ push-СѓРІРµРґРѕРјР»РµРЅРёСЏ.';
    }

    if (configState === 'loading') {
      return 'РџСЂРѕРІРµСЂСЏРµРј РЅР°СЃС‚СЂРѕР№РєРё push РЅР° СЃРµСЂРІРµСЂРµ.';
    }

    if (configState === 'error') {
      return 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё push СЃ СЃРµСЂРІРµСЂР°.';
    }

    if (config && (!config.enabled || !config.publicKey)) {
      return 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РµС‰Рµ РЅРµ РЅР°СЃС‚СЂРѕРµРЅС‹ РЅР° СЃРµСЂРІРµСЂРµ.';
    }

    if (permission === 'denied') {
      return 'Р Р°Р·СЂРµС€РµРЅРёРµ РЅР° СѓРІРµРґРѕРјР»РµРЅРёСЏ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅРѕ РІ Р±СЂР°СѓР·РµСЂРµ.';
    }

    if (hasBrowserSubscription && !hasServerDeviceSubscription) {
      return 'РќР° СѓСЃС‚СЂРѕР№СЃС‚РІРµ РµСЃС‚СЊ Р»РѕРєР°Р»СЊРЅР°СЏ РїРѕРґРїРёСЃРєР°, РЅРѕ СЃРµСЂРІРµСЂСѓ РЅСѓР¶РЅР° РїРµСЂРµРїСЂРёРІСЏР·РєР°. Р’РєР»СЋС‡РёС‚Рµ push Р·Р°РЅРѕРІРѕ.';
    }

    return hasDeviceSubscription
      ? 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РїРѕРґРєР»СЋС‡РµРЅС‹ РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ.'
      : 'Push-СѓРІРµРґРѕРјР»РµРЅРёСЏ РїРѕРєР° РЅРµ РїРѕРґРєР»СЋС‡РµРЅС‹.';
  }, [config, configState, hasBrowserSubscription, hasDeviceSubscription, hasServerDeviceSubscription, permission, supported]);

  const toggleHint = useMemo(() => {
    if (!accessToken) {
      return 'РќСѓР¶РЅР° Р°РєС‚РёРІРЅР°СЏ СЃРµСЃСЃРёСЏ';
    }

    if (!supported) {
      return 'РќРµРґРѕСЃС‚СѓРїРЅРѕ РІ СЌС‚РѕРј Р±СЂР°СѓР·РµСЂРµ';
    }

    if (configState === 'loading') {
      return 'РџСЂРѕРІРµСЂСЏРµРј РЅР°СЃС‚СЂРѕР№РєРё СЃРµСЂРІРµСЂР°';
    }

    if (configState === 'error') {
      return 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ СЃРµСЂРІРµСЂ push';
    }

    if (config && (!config.enabled || !config.publicKey)) {
      return 'РЎРµСЂРІРµСЂ push РµС‰Рµ РЅРµ РЅР°СЃС‚СЂРѕРµРЅ';
    }

    if (permission === 'denied') {
      return 'Р Р°Р·СЂРµС€РµРЅРёРµ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅРѕ РІ Р±СЂР°СѓР·РµСЂРµ';
    }

    if (hasBrowserSubscription && !hasServerDeviceSubscription) {
      return 'РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ РїРµСЂРµРїСЂРёРІСЏР·Р°С‚СЊ СЌС‚Рѕ СѓСЃС‚СЂРѕР№СЃС‚РІРѕ Рє СЃРµСЂРІРµСЂСѓ push';
    }

    return hasDeviceSubscription
      ? 'РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ РІС‹РєР»СЋС‡РёС‚СЊ'
      : 'РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ РІРєР»СЋС‡РёС‚СЊ';
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
      label: 'РЈСЃС‚СЂРѕР№СЃС‚РІРѕ',
      value: platformInfo.label,
      tone: 'neutral' as const,
    },
    {
      label: 'РЈСЃС‚Р°РЅРѕРІРєР° РЅР° СЌРєСЂР°РЅ',
      value: standaloneMode ? 'РЈР¶Рµ РґРѕР±Р°РІР»РµРЅ' : 'РџРѕРєР° РІ Р±СЂР°СѓР·РµСЂРµ',
      tone: standaloneMode ? ('success' as const) : ('warning' as const),
    },
    {
      label: 'Push РІ Р±СЂР°СѓР·РµСЂРµ',
      value: supported ? 'РџРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ' : 'РќРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ',
      tone: supported ? ('success' as const) : ('error' as const),
    },
    {
      label: 'Р Р°Р·СЂРµС€РµРЅРёРµ',
      value: permissionLabel[permission],
      tone:
        permission === 'granted'
          ? ('success' as const)
          : permission === 'denied'
            ? ('error' as const)
            : ('neutral' as const),
    },
    {
      label: 'РЎРµСЂРІРµСЂ push',
      value:
        configState === 'loading'
          ? 'РџСЂРѕРІРµСЂСЏРµРј'
          : configState === 'error'
            ? 'РћС€РёР±РєР° РїСЂРѕРІРµСЂРєРё'
            : config && (!config.enabled || !config.publicKey)
              ? 'РќРµ РЅР°СЃС‚СЂРѕРµРЅ'
              : 'Р“РѕС‚РѕРІ',
      tone:
        configState === 'loading'
          ? ('neutral' as const)
          : configState === 'error' || (config && (!config.enabled || !config.publicKey))
          ? ('error' as const)
          : ('success' as const),
    },
    {
      label: 'Р­С‚Рѕ СѓСЃС‚СЂРѕР№СЃС‚РІРѕ',
      value: hasDeviceSubscription ? 'РџРѕРґРїРёСЃР°РЅРѕ' : 'РќРµ РїРѕРґРїРёСЃР°РЅРѕ',
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
            aria-label={hasDeviceSubscription ? 'Р’С‹РєР»СЋС‡РёС‚СЊ push-СѓРІРµРґРѕРјР»РµРЅРёСЏ' : 'Р’РєР»СЋС‡РёС‚СЊ push-СѓРІРµРґРѕРјР»РµРЅРёСЏ'}
          >
            <span
              className={`account-browser-push__bell ${hasDeviceSubscription ? 'is-enabled' : 'is-disabled'}`}
            >
              <BellIcon enabled={hasDeviceSubscription} />
            </span>
            <span className="account-browser-push__switch-copy">
              <strong>{hasDeviceSubscription ? 'РЈРІРµРґРѕРјР»РµРЅРёСЏ РІРєР»СЋС‡РµРЅС‹' : 'РЈРІРµРґРѕРјР»РµРЅРёСЏ РІС‹РєР»СЋС‡РµРЅС‹'}</strong>
              <small>{loading ? 'РЎРѕС…СЂР°РЅСЏРµРј...' : toggleHint}</small>
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
            <strong>Р”РѕР±Р°РІРёС‚СЊ РЅР° СЌРєСЂР°РЅ РґРѕРјРѕР№</strong>
            <span>{installLabel}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant={standaloneMode ? 'ghost' : 'primary'}
            onClick={() => void handleInstall()}
          >
            {standaloneMode ? 'РЈР¶Рµ РґРѕР±Р°РІР»РµРЅ' : 'Р”РѕР±Р°РІРёС‚СЊ'}
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
          <span>РќР° С‚РµР»РµС„РѕРЅ РїСЂРёС…РѕРґСЏС‚ РёР·РјРµРЅРµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ, СЃСЂРѕС‡РЅС‹Рµ РїРµСЂРµРЅРѕСЃС‹ Рё РїСѓР±Р»РёРєР°С†РёСЏ РЅРѕРІРѕР№ РЅРµРґРµР»Рё.</span>
          <span>РќР°РїРѕРјРёРЅР°РЅРёСЏ Рѕ СЃРѕР±С‹С‚РёСЏС… РІРєР»СЋС‡Р°СЋС‚СЃСЏ РѕС‚РґРµР»СЊРЅС‹Рј РїРµСЂРµРєР»СЋС‡Р°С‚РµР»РµРј РІ СЌС‚РѕРј Р¶Рµ СЂР°Р·РґРµР»Рµ.</span>
          {permission === 'default' ? (
            <span>РџРѕСЃР»Рµ РІРєР»СЋС‡РµРЅРёСЏ Р±СЂР°СѓР·РµСЂ РїРѕРїСЂРѕСЃРёС‚ СЂР°Р·СЂРµС€РµРЅРёРµ РЅР° СѓРІРµРґРѕРјР»РµРЅРёСЏ.</span>
          ) : null}
          {permission === 'denied' ? (
            <span>Р Р°Р·СЂРµС€РµРЅРёРµ РјРѕР¶РЅРѕ РІРµСЂРЅСѓС‚СЊ РІ РЅР°СЃС‚СЂРѕР№РєР°С… Р±СЂР°СѓР·РµСЂР° Рё СѓСЃС‚СЂРѕР№СЃС‚РІР°.</span>
          ) : null}
          {!supported ? (
            <span>РќР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ Р±СЂР°СѓР·РµСЂ РЅРµ РґР°РµС‚ РѕС„РѕСЂРјРёС‚СЊ web push-РїРѕРґРїРёСЃРєСѓ.</span>
          ) : null}
          {standaloneMode ? (
            <span>РЎР°Р№С‚ СѓР¶Рµ СѓСЃС‚Р°РЅРѕРІР»РµРЅ. Р”Р»СЏ Р»СѓС‡С€РµР№ РґРѕСЃС‚Р°РІРєРё РѕС‚РєСЂС‹РІР°Р№С‚Рµ СЃРµСЂРІРёСЃ РёРјРµРЅРЅРѕ СЃ РёРєРѕРЅРєРё РЅР° РґРѕРјР°С€РЅРµРј СЌРєСЂР°РЅРµ.</span>
          ) : null}
        </div>

        {subscriptions.length > 0 ? (
          <div className="account-browser-push__subscriptions">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="account-browser-push__subscription">
                <div className="account-browser-push__subscription-copy">
                  <strong>{subscription.deviceLabel || 'Р‘СЂР°СѓР·РµСЂ'}</strong>
                  <span>РџРѕСЃР»РµРґРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ: {formatLastSeenAt(subscription.lastSeenAt)}</span>
                </div>
                <Badge variant={subscription.isActive ? 'success' : 'neutral'}>
                  {subscription.isActive ? 'РђРєС‚РёРІРЅР°' : 'Р’С‹РєР»СЋС‡РµРЅР°'}
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
            РўРµСЃС‚ СѓРІРµРґРѕРјР»РµРЅРёСЏ
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void Promise.all([loadSubscriptions(), syncDeviceSubscription(), loadConfig()])}
            loading={loading}
          >
            РћР±РЅРѕРІРёС‚СЊ СЃС‚Р°С‚СѓСЃ
          </Button>
        </div>
      </div>

      <Modal
        open={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        title="Р”РѕР±Р°РІРёС‚СЊ РЅР° СЌРєСЂР°РЅ РґРѕРјРѕР№"
        description={`Шаги ниже подобраны для ${installGuide.browserLabel}. Так сервис удобнее открывать как приложение, а web push на телефоне работает стабильнее.`}
        footer={
          <Button type="button" variant="ghost" onClick={() => setInstallModalOpen(false)}>
            РџРѕРЅСЏС‚РЅРѕ
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

