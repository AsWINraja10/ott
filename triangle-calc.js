// ============================================================
//  Option Tricky Trade — Triangle levels (PDC Avg Short & Wide Range)
//  Same logic as the "PDC Avg S/W" TradingView indicator, "Today" mode:
//  yesterday's daily settlement → today's levels.
//  Works in the browser (admin upload) and in Node (daily auto-fetch).
// ============================================================

export const INDEX_SETTINGS = {
  NIFTY:  { symbol: "NIFTY",  step: 50,  exchange: "NSE" },
  SENSEX: { symbol: "SENSEX", step: 100, exchange: "BSE" }
};

export const DEFAULTS = {
  scanN: 3,              // Auto Scan ± strikes around the underlying close
  wideMult: 2,           // Wide range = (PDC Avg × N) rounded to the strike step
  roundMode: "Nearest",  // Nearest | Up | Down
  priceField: "settlement", // settlement | close  (settlement falls back to close when 0)
  ladderMax: 30          // max ladder rows (ATM → Wide)
};

// ---------- CSV ----------
export function parseCsv(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const split = l => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const head = split(lines[0]);
  return lines.slice(1).map(l => {
    const v = split(l), o = {};
    head.forEach((h, i) => { o[h] = v[i]; });
    return o;
  });
}

// Column names differ between UDiFF (2024+) and older bhavcopy formats — match any of these
const COLS = {
  symbol: ["TckrSymb", "SYMBOL", "Symbol"],
  instr:  ["FinInstrmTp", "INSTRUMENT", "Instrument"],
  expiry: ["XpryDt", "EXPIRY_DT", "Expiry Date", "ExpiryDate"],
  strike: ["StrkPric", "STRIKE_PR", "Strike Price", "StrikePrice"],
  optType:["OptnTp", "OPTION_TYP", "Option Type", "OptionType"],
  close:  ["ClsPric", "CLOSE", "Close Price", "ClosePrice"],
  settle: ["SttlmPric", "SETTLE_PR", "Settlement Price"],
  high:   ["HghPric", "HIGH", "High Price"],
  low:    ["LwPric", "LOW", "Low Price"],
  under:  ["UndrlygPric", "UNDERLYING_VALUE", "Underlying Price"],
  date:   ["TradDt", "TIMESTAMP", "Trade Date"]
};

function pick(row, key) {
  for (const k of COLS[key]) if (row[k] !== undefined && row[k] !== "") return row[k];
  // case-insensitive fallback
  const want = COLS[key].map(s => s.toLowerCase());
  for (const k of Object.keys(row)) if (want.includes(k.toLowerCase()) && row[k] !== "") return row[k];
  return undefined;
}

const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; };

// Accepts 2026-10-27, 27-Oct-2026, 27-OCT-26, 27/10/2026, 20261027
export function toIsoDate(s) {
  s = String(s || "").trim();
  if (!s) return "";
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  if ((m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/](\d{2,4})/))) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${String(MON[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

// ---------- extract index options from a bhavcopy ----------
export function extractOptions(rows, symbol, priceField = DEFAULTS.priceField) {
  const out = [];
  let under = NaN, tradeDate = "";
  for (const r of rows) {
    const sym = String(pick(r, "symbol") || "").trim().toUpperCase();
    if (sym !== symbol) continue;
    const ot = String(pick(r, "optType") || "").trim().toUpperCase();
    if (ot !== "CE" && ot !== "PE") continue;
    const instr = String(pick(r, "instr") || "").toUpperCase();
    if (/FUT|IDF|STF/.test(instr)) continue; // futures rows never carry CE/PE, but skip to be safe
    const close = num(pick(r, "close")), settle = num(pick(r, "settle"));
    const price = priceField === "settlement" && settle > 0 ? settle : close;
    out.push({
      expiry: toIsoDate(pick(r, "expiry")),
      strike: num(pick(r, "strike")),
      type: ot,
      price,
      high: num(pick(r, "high")),
      low: num(pick(r, "low"))
    });
    const u = num(pick(r, "under"));
    if (u > 0 && !(under > 0)) under = u;
    if (!tradeDate) tradeDate = toIsoDate(pick(r, "date"));
  }
  return { options: out.filter(o => o.expiry && Number.isFinite(o.strike)), underlying: under, tradeDate };
}

// Next Mon–Fri after a settlement date (exchange holidays are not known here)
export function nextWeekday(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

// ---------- the Pine logic ----------
export function computeLevels(rows, indexName, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const ix = INDEX_SETTINGS[indexName];
  if (!ix) throw new Error("Unknown index " + indexName);
  const step = cfg.step || ix.step;

  const { options, underlying, tradeDate } = extractOptions(rows, ix.symbol, cfg.priceField);
  if (!options.length) throw new Error(`No ${ix.symbol} options found in this file. Check it is the ${ix.exchange} F&O bhavcopy.`);

  // Nearest expiry that is still alive after the trade date
  const expiries = [...new Set(options.map(o => o.expiry))].sort();
  const expiry = cfg.expiry || expiries.find(e => !tradeDate || e > tradeDate) || expiries[expiries.length - 1];

  const book = new Map(); // strike → {CE, PE}
  for (const o of options) {
    if (o.expiry !== expiry) continue;
    const b = book.get(o.strike) || {};
    b[o.type] = o;
    book.set(o.strike, b);
  }
  const has = k => { const b = book.get(k); return b && b.CE && b.PE && b.CE.price > 0 && b.PE.price > 0; };

  // Auto ATM: min |CE PDC − PE PDC| within ±scanN strikes of the underlying close
  let center = underlying > 0 ? Math.round(underlying / step) * step : NaN;
  let candidates;
  if (Number.isFinite(center)) {
    candidates = [];
    for (let i = -cfg.scanN; i <= cfg.scanN; i++) candidates.push(center + i * step);
  } else {
    candidates = [...book.keys()]; // no underlying in file → scan every strike
  }
  let atm = NaN, best = Infinity;
  for (const k of candidates) {
    if (!has(k)) continue;
    const d = Math.abs(book.get(k).CE.price - book.get(k).PE.price);
    if (d < best) { best = d; atm = k; }
  }
  if (!Number.isFinite(atm)) throw new Error(`Could not find ATM strike for ${ix.symbol} ${expiry}.`);

  const cP = book.get(atm).CE.price, pP = book.get(atm).PE.price;
  const pdcAvg = (cP + pP) / 2;
  const synBase = atm + (cP - pP);
  // Round a raw width to the strike step (Nearest / Up / Down)
  const roundStep = v => {
    const x = v / step;
    const n = cfg.roundMode === "Up" ? Math.ceil(x) : cfg.roundMode === "Down" ? Math.floor(x) : Math.round(x);
    return Math.max(n * step, step);
  };
  // Short = PDC Avg rounded (e.g. 115.6 → 100)
  const pdcRnd = cfg.manualRounded > 0 ? cfg.manualRounded : roundStep(pdcAvg);

  // Wide = (PDC Avg × N) rounded, not Short × N (e.g. 115.6 + 115.6 = 231.2 → 250)
  const shortW = pdcRnd, wideW = cfg.manualRounded > 0 ? pdcRnd * cfg.wideMult : roundStep(pdcAvg * cfg.wideMult);
  const priceOf = (k, t) => { const b = book.get(k); return b && b[t] ? b[t].price : null; };

  const leg = (w) => {
    const ceK = atm - w, peK = atm + w;
    return {
      width: w,
      range: peK - ceK,
      ce: { strike: ceK, pdc: priceOf(ceK, "CE"), iv: synBase - ceK },
      pe: { strike: peK, pdc: priceOf(peK, "PE"), iv: peK - synBase }
    };
  };

  // Ladder ATM → Wide
  const ladder = [];
  const n = Math.min(Math.round(wideW / step) + 1, cfg.ladderMax);
  for (let i = 0; i < n; i++) {
    const d = i * step, ceK = atm - d, peK = atm + d;
    ladder.push({
      dist: d,
      tag: d === 0 ? "ATM" : d === wideW ? "WIDE" : d === shortW ? "SHORT" : "",
      range: peK - ceK,
      ceStrike: ceK, cePdc: priceOf(ceK, "CE"), ceIv: synBase - ceK,
      peStrike: peK, pePdc: priceOf(peK, "PE"), peIv: peK - synBase
    });
  }

  // ATM PDH / PDL, Highest High / Lowest Low, HL BEP
  const ce = book.get(atm).CE, pe = book.get(atm).PE;
  const hh = Math.max(ce.high, pe.high), ll = Math.min(ce.low, pe.low);
  const hl = Number.isFinite(hh) && Number.isFinite(ll) ? {
    cePdh: ce.high, cePdl: ce.low, pePdh: pe.high, pePdl: pe.low,
    hh, ll, hhFrom: ce.high >= pe.high ? "CE PDH" : "PE PDH", llFrom: ce.low <= pe.low ? "CE PDL" : "PE PDL",
    bep: (hh + ll) / 2
  } : null;

  const r2 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
  const clean = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === "number" ? r2(v) : v));

  return clean({
    index: indexName,
    exchange: ix.exchange,
    tradeDate,                // settlement date used (yesterday)
    forDate: nextWeekday(tradeDate), // session these levels are for (today)
    expiry,
    step,
    underlying: underlying > 0 ? underlying : null,
    scanCenter: Number.isFinite(center) ? center : null,
    atm, cePdc: cP, pePdc: pP, ceMinusPe: Math.abs(cP - pP),
    pdcAvg, rounded: pdcRnd, synBase,
    wideMult: cfg.wideMult,
    short: leg(shortW),
    wide: leg(wideW),
    ladder,
    hl
  });
}
