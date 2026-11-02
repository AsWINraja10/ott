// ============================================================
//  Option Tricky Trade — app service worker
//  1) lets the site install as an app and open offline
//  2) shows push notifications (Firebase Cloud Messaging) when the app is closed
//  Must stay in the website ROOT folder (same place as index.html).
// ============================================================
const VERSION = "ott-v1";              // change this after uploading new files to refresh phones
const SHELL = [
  "/dashboard.html", "/login.html", "/offline.html",
  "/auth.css", "/firebase-config.js", "/triangle-view.js", "/pwa.js",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-96.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (always fresh levels/pages), cached copy when offline
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return caches.match("/offline.html");
      return Response.error();
    })
  );
});

// ---------- push notifications ----------
// Firebase config arrives in the registration URL (sw.js?cfg=...), so it lives only in firebase-config.js
try {
  const cfg = JSON.parse(new URL(self.location.href).searchParams.get("cfg") || "null");
  if (cfg && cfg.apiKey && !cfg.apiKey.startsWith("PASTE")) {
    importScripts(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
    );
    firebase.initializeApp(cfg);
    const messaging = firebase.messaging();
    // Messages with a "notification" part are shown automatically.
    // Data-only messages are shown here:
    messaging.onBackgroundMessage(p => {
      if (p.notification) return;
      const d = p.data || {};
      self.registration.showNotification(d.title || "Option Tricky Trade", {
        body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
        data: { link: d.link || "/dashboard.html" }, tag: d.tag || undefined
      });
    });
  }
} catch (err) { /* notifications unavailable; app still works */ }

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const link = (e.notification.data && (e.notification.data.link || (e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.fcmOptions && e.notification.data.FCM_MSG.fcmOptions.link))) || "/dashboard.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if (c.url.includes("/dashboard.html") && "focus" in c) { c.navigate(link); return c.focus(); }
      return self.clients.openWindow(link);
    })
  );
});
