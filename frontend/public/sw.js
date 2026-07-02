/* global clients */
// frontend/public/sw.js
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'CRM АХЧ';
    const options = {
      body: data.body || '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: { link: data.link || '/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('Ошибка обработки push:', e);
    event.waitUntil(
      self.registration.showNotification('CRM АХЧ', {
        body: '',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        data: { link: '/' },
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const targetPathname = new URL(link, self.location.origin).pathname;
      for (const client of windowClients) {
        if (new URL(client.url).pathname === targetPathname && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(link);
      }
    })
  );
});
