// ============================================================
//  Option Tricky Trade — app install + phone alerts
//  Used by login.html and dashboard.html
// ============================================================
import { app, db, firebaseConfig, SITE } from "./firebase-config.js";
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ua = navigator.userAgent || "";
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/.test(ua);
const isInApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/.test(ua);
const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua) && !isInApp;
export const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const TOKEN_KEY = "ott_push_token";
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} }
};

// ---------- service worker ----------
let swReg = null;
export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register("/sw.js?cfg=" + encodeURIComponent(JSON.stringify(firebaseConfig)), { scope: "/" });
    await navigator.serviceWorker.ready;
  } catch (e) { console.warn("Service worker not registered", e); }
  return swReg;
}

// ---------- install ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; document.dispatchEvent(new Event("ott-installable")); });
window.addEventListener("appinstalled", () => { deferredPrompt = null; document.dispatchEvent(new Event("ott-installed")); });

function sheet(html) {
  let el = document.getElementById("ottSheet");
  if (!el) {
    el = document.createElement("div");
    el.id = "ottSheet";
    el.className = "ott-sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    document.body.appendChild(el);
    el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-close]")) el.hidden = true; });
  }
  el.innerHTML = `<div class="ott-sheet-card">${html}<button class="btn block" data-close>Close</button></div>`;
  el.hidden = false;
}

const SHARE_ICON = `<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true" style="vertical-align:-4px"><path d="M9 1v13M4.5 5.5 9 1l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 9H2v12h14V9h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

export function showInstallHelp() {
  if (isIOS && !isIOSSafari) {
    sheet(`<h2>Open in Safari</h2><p>To install on iPhone, open <b>optiontrickytrade.com</b> in <b>Safari</b>, then tap ${SHARE_ICON} Share → <b>Add to Home Screen</b>.</p>`);
  } else if (isIOS) {
    sheet(`<h2>Install on iPhone</h2>
      <ol class="ott-steps">
        <li>Tap the <b>Share</b> button ${SHARE_ICON} at the bottom of Safari.</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
        <li>Tap <b>Add</b>. The OTT app appears on your home screen.</li>
      </ol>
      <p class="muted small">Open the app from the home screen, then tap <b>Turn on alerts</b> to get notifications.</p>`);
  } else if (isInApp) {
    sheet(`<h2>Open in Chrome</h2><p>You're inside another app's browser. Tap the <b>⋮</b> menu and choose <b>Open in Chrome</b> (or your browser), then tap <b>Install app</b>.</p>`);
  } else {
    sheet(`<h2>Install the app</h2>
      <ol class="ott-steps">
        <li>Tap the <b>⋮</b> menu in Chrome.</li>
        <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
        <li>Tap <b>Install</b>.</li>
      </ol>`);
  }
}

export async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
  } else {
    showInstallHelp();
  }
}

// ---------- alerts ----------
let messaging = null;
async function getMsg() {
  if (messaging) return messaging;
  if (!(await isSupported().catch(() => false))) return null;
  messaging = getMessaging(app);
  onMessage(messaging, p => {
    const n = p.notification || p.data || {};
    document.dispatchEvent(new CustomEvent("ott-push", { detail: n }));
  });
  return messaging;
}

export async function alertsState() {
  if (isIOS && !isInstalled()) return "install-first";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (!(await getMsg())) return "unsupported";
  if (!SITE.vapidKey || SITE.vapidKey.startsWith("PASTE")) return "not-configured";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "granted" && store.get(TOKEN_KEY)) return "on";
  return "off";
}

export async function enableAlerts(user) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications are blocked. Allow them in your phone's settings for this app." : "Notifications were not allowed.");
  const m = await getMsg();
  const reg = swReg || await registerSW();
  const token = await getToken(m, { vapidKey: SITE.vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error("Could not get a notification token. Try again.");
  await setDoc(doc(db, "pushTokens", token), {
    uid: user.uid,
    platform: isIOS ? "ios" : isAndroid ? "android" : "desktop",
    updatedAt: serverTimestamp()
  });
  store.set(TOKEN_KEY, token);
  return token;
}

export async function disableAlerts() {
  const token = store.get(TOKEN_KEY);
  if (token) {
    try { await deleteDoc(doc(db, "pushTokens", token)); } catch {}
  }
  try { const m = await getMsg(); if (m) await deleteToken(m); } catch {}
  store.del(TOKEN_KEY);
}

// Call before signing out, so the next person on this phone doesn't get your alerts
export async function removeDeviceToken() {
  const token = store.get(TOKEN_KEY);
  if (!token) return;
  try { await deleteDoc(doc(db, "pushTokens", token)); } catch {}
  store.del(TOKEN_KEY);
}

// ---------- ready-made app bar ----------
// mountAppBar(el, { user }) fills el with Install / Alerts buttons and keeps them in sync
export async function mountAppBar(el, opts = {}) {
  if (!el) return;
  await registerSW();
  const render = async () => {
    const installed = isInstalled();
    const st = opts.user ? await alertsState() : null;
    const parts = [];
    if (!installed) parts.push(`<button class="btn sm accent" data-act="install">📱 Install app</button>`);
    if (opts.user) {
      const label = {
        "on": `<span class="badge ok">🔔 Alerts on</span> <button class="link small" data-act="off">Turn off</button>`,
        "off": `<button class="btn sm primary" data-act="on">🔔 Turn on alerts</button>`,
        "blocked": `<span class="small muted">Alerts are blocked. Allow notifications for this site in your phone settings.</span>`,
        "install-first": `<span class="small muted">On iPhone, install the app first to get alerts.</span>`,
        "unsupported": `<span class="small muted">This browser can't show alerts. Use Chrome on Android or the installed app on iPhone.</span>`,
        "not-configured": ``
      }[st];
      if (label) parts.push(label);
    }
    el.innerHTML = parts.length ? `<div class="appbar-in"><span class="appbar-txt">${installed ? "OTT app" : "Get the OTT app on your phone"}</span><div class="appbar-act">${parts.join("")}</div></div><p class="msg small" data-msg></p>` : "";
    el.hidden = !parts.length;
  };
  el.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const msg = el.querySelector("[data-msg]");
    try {
      b.disabled = true;
      if (b.dataset.act === "install") await installApp();
      if (b.dataset.act === "on") { await enableAlerts(opts.user); if (msg) { msg.textContent = "Alerts are on for this phone."; msg.className = "msg small ok"; } }
      if (b.dataset.act === "off") await disableAlerts();
    } catch (err) {
      if (msg) { msg.textContent = err.message; msg.className = "msg small err"; }
    } finally {
      b.disabled = false;
      if (b.dataset.act !== "on" || !msg || msg.classList.contains("ok")) await render();
    }
  });
  document.addEventListener("ott-installable", render);
  document.addEventListener("ott-installed", render);
  await render();
}
