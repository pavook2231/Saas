export type BrowserPushSubscriptionPayload = {
  endpoint: string;
  userAgent?: string;
  deviceLabel?: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const SERVICE_WORKER_URL = '/sw.js';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

export const browserPush = {
  isSupported() {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  },

  getPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported' as const;
    }

    return Notification.permission;
  },

  async ensureServiceWorker() {
    if (!this.isSupported()) {
      throw new Error('Браузер не поддерживает push-уведомления');
    }

    return navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: '/',
      updateViaCache: 'none',
    });
  },

  async getSubscription() {
    const registration = await this.ensureServiceWorker();
    return registration.pushManager.getSubscription();
  },

  async subscribe(publicKey: string, deviceLabel?: string | null): Promise<BrowserPushSubscriptionPayload> {
    if (!this.isSupported()) {
      throw new Error('Браузер не поддерживает push-уведомления');
    }

    if (!publicKey) {
      throw new Error('Web push пока не настроен на сервере');
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      throw new Error('Разрешение на уведомления не выдано');
    }

    const registration = await this.ensureServiceWorker();
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;

    if (!json.endpoint || !p256dh || !auth) {
      throw new Error('Не удалось получить данные push-подписки');
    }

    return {
      endpoint: json.endpoint,
      userAgent: navigator.userAgent,
      deviceLabel: deviceLabel?.trim() || undefined,
      keys: {
        p256dh,
        auth,
      },
    };
  },

  async unsubscribe(): Promise<string | null> {
    if (!this.isSupported()) {
      return null;
    }

    const registration = await this.ensureServiceWorker();
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return null;
    }

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    return endpoint;
  },
};

