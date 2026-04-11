self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload = {
    title: 'Уведомление',
    body: '',
    data: {},
  };

  try {
    payload = JSON.parse(event.data.text());
  } catch {
    payload = {
      title: 'Уведомление',
      body: event.data.text(),
      data: {},
    };
  }

  const data = payload.data || {};
  const tag =
    typeof data.tag === 'string' && data.tag.length > 0
      ? data.tag
      : typeof data.eventId === 'string' && data.eventId.length > 0
        ? `schedule-${data.eventId}`
        : typeof data.notificationId === 'string' && data.notificationId.length > 0
          ? `notification-${data.notificationId}`
          : 'schedule-alert';

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon?v=calendar-hierarchy-20260411b',
      badge: '/icon?v=calendar-hierarchy-20260411b',
      tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [240, 120, 240, 120, 320],
      data,
      actions: [
        {
          action: 'open',
          title: 'Открыть календарь',
        },
      ],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl =
    typeof data.url === 'string' && data.url.startsWith('/')
      ? data.url
      : '/calendar';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const matched = clients.find((client) => 'focus' in client);

        if (matched) {
          matched.navigate(targetUrl);
          return matched.focus();
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
