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

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: payload.data || {},
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
