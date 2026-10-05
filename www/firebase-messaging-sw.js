importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

/* O servidor do Linka injeta a configuração pública do Firebase nesta rota. */
const firebaseConfig = self.__LINKA_FIREBASE_CONFIG__;
if (firebaseConfig && firebaseConfig.projectId) firebase.initializeApp(firebaseConfig);

if (firebase.apps.length) {
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    const n = payload.notification || {};
    const title = d.title || n.title || 'Linka';
    const body = d.body || n.body || 'Nova notificação';
    const data = {...d};
    const chat = data.chatId ? `/?chat=${encodeURIComponent(data.chatId)}` : '/';
    self.registration.showNotification(title, {
      body,
      icon: n.icon || '/icon-192.png',
      badge: n.badge || '/icon-192.png',
      tag: data.type === 'call' ? (data.callId ? `linka-call-${data.callId}` : 'linka-call') : (data.chatId ? `linka-${data.chatId}` : 'linka'),
      renotify: true,
      requireInteraction: data.type === 'call',
      data: {...data, url: chat}
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.url || (d.chatId ? `/?chat=${encodeURIComponent(d.chatId)}` : '/');
  event.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
