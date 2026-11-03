// ============================================================
//  Daily auto-fetch: NSE + BSE F&O bhavcopy (daily settlement)
//  → NIFTY & SENSEX triangle levels → Firestore "levels/latest"
//
//  Runs on GitHub Actions every weekday evening (see .github/workflows/daily-levels.yml).
//  On your PC (VS Code terminal, inside the scripts folder):
//    npm install                         (first time only)
//    node fetch-levels.mjs --local       → yesterday's settlement → ../levels.json for triangle.html
//    node fetch-levels.mjs --dry         → only prints the result
//    node fetch-levels.mjs --key=service-account.json   → saves to Firestore from your PC
//    node fetch-levels.mjs --local --date=2026-10-23    → a specific settlement day
// ============================================================
import AdmZip from "adm-zip";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv, computeLevels, basicLevels } from "../triangle-calc.js";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const DRY = !!args.dry;
const LOCAL = !!args.local;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Official daily bhavcopy files (UDiFF format). {D} = YYYYMMDD
const SOURCES = {
  NIFTY: {
    urls: ["https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{D}_F_0000.csv.zip"],
    headers: { "User-Agent": UA, Referer: "https://www.nseindia.com/", Accept: "*/*" }
  },
  SENSEX: {
    urls: [
      "https://www.bseindia.com/download/Bhavcopy/Derivative/BhavCopy_BSE_FO_0_0_0_{D}_F_0000.CSV",
      "https://www.bseindia.com/download/Bhavcopy/Derivative/BhavCopy_BSE_FO_0_0_0_{D}_F_0000.csv"
    ],
    headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/", Accept: "*/*" }
  }
};

// If an exchange changes its file address, set NSE_URL / BSE_URL in the workflow (use {D} for the date)
if (process.env.NSE_URL) SOURCES.NIFTY.urls = [process.env.NSE_URL];
if (process.env.BSE_URL) SOURCES.SENSEX.urls = [process.env.BSE_URL];

function istToday() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
const iso = d => d.toISOString().slice(0, 10);

async function download(url, headers) {
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error("empty file");
  // Zip → first CSV inside; plain CSV → as is
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const zip = new AdmZip(buf);
    const entry = zip.getEntries().find(e => /\.csv$/i.test(e.entryName));
    if (!entry) throw new Error("no CSV in zip");
    return entry.getData().toString("utf8");
  }
  const text = buf.toString("utf8");
  if (/<html/i.test(text.slice(0, 500))) throw new Error("got a web page, not a CSV");
  return text;
}

// Latest available trading day, going back up to 7 days for weekends/holidays
async function latestBhavcopy(index, start) {
  const src = SOURCES[index];
  for (let back = 0; back < 7; back++) {
    const d = new Date(start.getTime() - back * 86400000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    for (const u of src.urls) {
      const url = u.replace("{D}", ymd(d));
      try {
        const csv = await download(url, src.headers);
        console.log(`✓ ${index}: ${url}`);
        return { csv, date: iso(d), url };
      } catch (e) {
        console.log(`  ${index} ${iso(d)}: ${e.message}`);
      }
    }
  }
  throw new Error(`${index}: no bhavcopy found in the last 7 days`);
}

async function main() {
  // Latest settlement available: today's file once NSE/BSE publish it (~6 pm IST),
  // otherwise the previous trading day (skips weekends / holidays).
  // The levels are for the next trading session after that settlement.
  // --date=YYYY-MM-DD uses that exact settlement day instead.
  const start = args.date ? new Date(args.date + "T00:00:00Z") : istToday();
  const out = { updatedAt: new Date().toISOString(), source: "auto" };
  const errors = [];

  for (const index of ["NIFTY", "SENSEX"]) {
    try {
      const { csv, date, url } = await latestBhavcopy(index, start);
      const lv = computeLevels(parseCsv(csv), index);
      lv.tradeDate = lv.tradeDate || date;
      lv.file = url.split("/").pop();
      out[index.toLowerCase()] = lv;
      console.log(`  ${index} ${lv.tradeDate} exp ${lv.expiry}: ATM ${lv.atm}, PDC avg ${lv.pdcAvg} → ±${lv.rounded}, short ${lv.short.ce.strike}/${lv.short.pe.strike}, wide ${lv.wide.ce.strike}/${lv.wide.pe.strike}`);
    } catch (e) {
      errors.push(`${index}: ${e.message}`);
      console.error(`✗ ${index}: ${e.message}`);
    }
  }

  if (!out.nifty && !out.sensex) {
    console.error("Nothing to save.");
    process.exit(1);
  }
  if (errors.length) out.errors = errors;

  if (DRY) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (LOCAL) {
    const file = fileURLToPath(new URL("../levels.json", import.meta.url));
    writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`Saved ${file} — open triangle.html with Live Server to see it.`);
    return;
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const sa = JSON.parse(args.key ? readFileSync(args.key, "utf8") : (process.env.FIREBASE_SERVICE_ACCOUNT || "{}"));
  if (!sa.project_id) throw new Error("No Firebase key. Use --local to test without Firebase, or --key=service-account.json.");
  initializeApp({ credential: cert(sa) });
  const db = getFirestore();

  // merge so a failed index keeps yesterday's values instead of being wiped
  // Nothing new since the last run (e.g. the 8:40 pm retry after a 6:40 pm success) → skip
  const prev = (await db.doc("levels/latest").get()).data() || {};
  const same = k => !out[k] || (prev[k] && prev[k].tradeDate === out[k].tradeDate && prev[k].atm === out[k].atm && prev[k].wide?.width === out[k].wide?.width);
  if (!args.force && same("nifty") && same("sensex")) {
    console.log("Levels already up to date — nothing to save.");
    return;
  }
  await db.doc("levels/latest").set(out, { merge: true });
  const pub = { updatedAt: out.updatedAt };
  if (out.nifty) pub.nifty = basicLevels(out.nifty);
  if (out.sensex) pub.sensex = basicLevels(out.sensex);
  await db.doc("levels/public").set(pub, { merge: true });
  const day = out.nifty?.tradeDate || out.sensex?.tradeDate;
  await db.doc(`levels/${day}`).set(out, { merge: true });
  console.log(`Saved levels/latest and levels/${day}`);
  if (errors.length) process.exitCode = 2; // marks the run yellow/red so you notice
}

main().catch(e => { console.error(e); process.exit(1); });
