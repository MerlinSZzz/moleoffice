// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/*
 * THE OFFICE'S PUSH WORKER: IT SHOWS A SUMMONS ON A DEVICE WHERE THE PERSON ALLOWED NOTIFICATIONS. The office's side
 * is src/server/lib/push.ts, and the press that registers this worker is src/web/components/AllowNotifications.tsx.
 *
 * It is served at the page's root so its scope is every page of the office. It does one thing on a push, shows the
 * notification the office sent, and one on a click, brings the office page forward or opens it. It keeps nothing, caches
 * nothing and asks nothing of the network, so an office page never depends on it.
 */
self.addEventListener('push', (event) => {
  let notice = { title: 'Mole Office', body: '', urgency: 'now', tag: 'summons' }
  try {
    const sent = event.data === null ? {} : event.data.json()
    notice = { ...notice, ...sent }
  } catch {
    // A BODY THAT IS NOT THE OFFICE'S JSON is still a push from the office: it is shown as its words, under the
    // office's name, rather than dropped (the inspector's note on run OGuDPi3JTLzQ).
    notice = { ...notice, body: event.data === null ? '' : event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(String(notice.title), {
      body: String(notice.body),
      tag: String(notice.tag),
      renotify: true,
      // A SUMMONS THAT IS URGENT STAYS until they look at it, where the device lets a notification stay.
      requireInteraction: notice.urgency === 'now',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const one of open) {
        if ('focus' in one) return one.focus()
      }
      return self.clients.openWindow('/')
    })(),
  )
})
