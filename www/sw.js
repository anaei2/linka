self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'Linka';
  const options = {
    body: data.body || 'Nova mensagem',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.data?.chatId ? 'linka-chat-' + data.data.chatId : 'linka-message',
    renotify: true,
    data: data.data || {}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const chatId = event.notification.data?.chatId || '';
  const url = chatId ? '/?chat=' + encodeURIComponent(chatId) : '/';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clients) {
      if ('focus' in client) {
        if (chatId && 'navigate' in client) await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
