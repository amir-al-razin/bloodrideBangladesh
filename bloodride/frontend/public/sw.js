// BloodRide service worker: shows donor alerts sent by web push and opens the alert page on tap.
self.addEventListener("push", (event) => {
  let data = { title: "BloodRide", body: "A patient near you needs blood.", url: "/donor" };
  try { data = { ...data, ...event.data.json() }; } catch (e) { /* keep the default text */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    data: { url: data.url },
    tag: data.url,              // one notification per alert, even if sent twice
    requireInteraction: true,
    vibrate: [200, 100, 200],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/donor";
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const tab of tabs) {
      if (tab.url === url && "focus" in tab) return tab.focus();
    }
    return self.clients.openWindow(url);
  })());
});
