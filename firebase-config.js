// ============================================================
//  Option Tricky Trade — Firebase setup (shared by all pages)
// ============================================================
//  STEP 1: Paste your Firebase web app config below.
//  (Firebase console → Project settings → General → Your apps → Web app → Config)
// ------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD-GCQDp6OPlX3KegHnfCNoDfgMlEW3vmY",
  authDomain: "optiontrickytrade-b85e2.firebaseapp.com",
  projectId: "optiontrickytrade-b85e2",
  storageBucket: "optiontrickytrade-b85e2.firebasestorage.app",
  messagingSenderId: "601739588725",
  appId: "1:601739588725:web:0cd44641738f5d0376f43c"
};

// Site settings
export const SITE = {
  brand: "Option Tricky Trade",
  ownerWhatsApp: "919842610908",   // used for "Request membership" button
  membershipDays: 30,              // 1 month = 30 days
  // Phone alerts: Firebase console → Project settings → Cloud Messaging → Web Push certificates → "Key pair"
  vapidKey: "PASTE_YOUR_WEB_PUSH_KEY"
};

// Membership plans (activated by the admin; no online payment)
export const PLANS = {
  basic:    { key: "basic",    name: "Basic",    level: 1, label: "Level 1 – Basic",    icon: "🟢" },
  triangle: { key: "triangle", name: "Triangle", level: 2, label: "Level 2 – Triangle", icon: "🔵" }
};
// Members activated before the plans existed have no "plan" field → Triangle (full access)
export function planOf(user) { return user && user.plan === "basic" ? "basic" : "triangle"; }

// false until the real keys are pasted above
export const firebaseReady = !String(firebaseConfig.apiKey).startsWith("PASTE");
if (!firebaseReady) console.warn("Firebase keys missing in firebase-config.js — login and saved data will not work. For a local triangle test use triangle.html.");

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ---------- small helpers ----------
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d) {
  if (!d) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function memberUntil(user) {
  const t = user && user.memberUntil;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
}

export function isActiveMember(user) {
  const d = memberUntil(user);
  return !!d && d.getTime() > Date.now();
}

export function daysLeft(user) {
  const d = memberUntil(user);
  if (!d) return 0;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
}

// Only allow http(s) links to be placed in href/src
export function safeUrl(u) {
  try {
    const x = new URL(String(u || "").trim());
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : "";
  } catch { return ""; }
}

// Turn any YouTube link (watch, youtu.be, live, shorts) into an embed URL
export function ytEmbed(url) {
  const u = String(url || "").trim();
  const m = u.match(/(?:youtu\.be\/|v=|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0` : "";
}
