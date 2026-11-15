// Service worker: shows push notifications and opens the right chat when tapped
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Inbox', body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    if (d.unread && self.navigator.setAppBadge) { try { await self.navigator.setAppBadge(d.unread); } catch {} }
    await self.registration.showNotification(d.title || 'New message', {
      body: d.body || '',
      tag: d.room_id || 'inbox',
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { room_id: d.room_id },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const room = e.notification.data && e.notification.data.room_id;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (room) w.postMessage({ openRoom: room });
      return w.focus();
    }
    return self.clients.openWindow(room ? '/?room=' + encodeURIComponent(room) : '/');
  })());
});
