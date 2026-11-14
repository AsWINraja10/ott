// ============================================================
//  Option Tricky Trade — Triangle levels view (SVG + tables)
//  renderTriangle(levels) → HTML string. Used by dashboard.html and admin.html.
// ============================================================

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f = (v, d = 2) => v == null || !Number.isFinite(+v) ? "—" : (+v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d });
const k = v => v == null ? "—" : (+v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function fmtIsoDate(s) {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return isNaN(d) ? s : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function renderTriangle(L, opts = {}) {
  if (!L || !L.atm) return `<p class="muted">Levels are not available yet.</p>`;

  // ---------- SVG geometry ----------
  const W = 680, H = 470, cx = W / 2;
  const apexY = 78, shortY = 238, wideY = 388, halfBase = 250;
  const xAt = y => halfBase * (y - apexY) / (wideY - apexY);
  const sx = xAt(shortY);

  // Simple triangle: apex = ATM + Syn PDC, corners = strike + IV, lines = ranges
  const svg = `
<svg class="tri" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L.index)} triangle: ATM ${L.atm}, Syn PDC ${f(L.synBase, 1)}, short ${L.short.ce.strike} to ${L.short.pe.strike}, wide ${L.wide.ce.strike} to ${L.wide.pe.strike}">
  <polygon points="${cx},${apexY} ${cx - halfBase},${wideY} ${cx + halfBase},${wideY}" class="tr-fill"/>
  <polygon points="${cx},${apexY} ${cx - sx},${shortY} ${cx + sx},${shortY}" class="tr-fill2"/>
  <line x1="${cx}" y1="${apexY}" x2="${cx - halfBase}" y2="${wideY}" class="tr-ce"/>
  <line x1="${cx}" y1="${apexY}" x2="${cx + halfBase}" y2="${wideY}" class="tr-pe"/>
  <line x1="${cx - sx}" y1="${shortY}" x2="${cx + sx}" y2="${shortY}" class="tr-short"/>
  <line x1="${cx - halfBase}" y1="${wideY}" x2="${cx + halfBase}" y2="${wideY}" class="tr-wide"/>

  <!-- apex: ATM strike + synthetic PDC -->
  <circle cx="${cx}" cy="${apexY}" r="8" class="tr-dot-atm"/>
  <text x="${cx}" y="${apexY - 44}" class="tr-t tr-b" text-anchor="middle">ATM ${k(L.atm)}</text>
  <text x="${cx}" y="${apexY - 20}" class="tr-t tr-s" text-anchor="middle">Syn PDC ${f(L.synBase, 1)}</text>

  <!-- ranges -->
  <text x="${cx}" y="${shortY - 12}" class="tr-t tr-rng" text-anchor="middle">Short range ${k(L.short.range)}</text>
  <text x="${cx}" y="${wideY - 12}" class="tr-t tr-rng" text-anchor="middle">Wide range ${k(L.wide.range)}</text>

  <!-- short corners -->
  <circle cx="${cx - sx}" cy="${shortY}" r="7" class="tr-dot-ce"/>
  <circle cx="${cx + sx}" cy="${shortY}" r="7" class="tr-dot-pe"/>
  <text x="${cx - sx - 36}" y="${shortY - 2}" class="tr-t tr-b tr-cec" text-anchor="end">${k(L.short.ce.strike)} CE</text>
  <text x="${cx - sx - 36}" y="${shortY + 20}" class="tr-t tr-s" text-anchor="end">IV ${f(L.short.ce.iv, 1)}</text>
  <text x="${cx + sx + 36}" y="${shortY - 2}" class="tr-t tr-b tr-pec">${k(L.short.pe.strike)} PE</text>
  <text x="${cx + sx + 36}" y="${shortY + 20}" class="tr-t tr-s">IV ${f(L.short.pe.iv, 1)}</text>

  <!-- wide corners -->
  <circle cx="${cx - halfBase}" cy="${wideY}" r="7" class="tr-dot-ce"/>
  <circle cx="${cx + halfBase}" cy="${wideY}" r="7" class="tr-dot-pe"/>
  <text x="${cx - halfBase - 4}" y="${wideY + 30}" class="tr-t tr-b tr-cec">${k(L.wide.ce.strike)} CE</text>
  <text x="${cx - halfBase - 4}" y="${wideY + 52}" class="tr-t tr-s">IV ${f(L.wide.ce.iv, 1)}</text>
  <text x="${cx + halfBase + 4}" y="${wideY + 30}" class="tr-t tr-b tr-pec" text-anchor="end">${k(L.wide.pe.strike)} PE</text>
  <text x="${cx + halfBase + 4}" y="${wideY + 52}" class="tr-t tr-s" text-anchor="end">IV ${f(L.wide.pe.iv, 1)}</text>
</svg>`;

  // Free users: the triangle only (no chips, range table, PDH/PDL, HL BEP or ladder)
  if (opts.basic) {
    return `<div class="tr-wrap">${svg}</div>` +
      `<p class="tr-upsell">🔵 Triangle plan (₹5,000/month) also gets the triangle levels calculation, edge levels, wide levels analysis, HL BEP and the full strike ladder.</p>`;
  }

  // ---------- summary chips ----------
  const chips = `
<div class="tr-chips">
  <div><span>ATM</span><b>${k(L.atm)}</b></div>
  <div><span>CE − PE diff</span><b>${f(L.ceMinusPe)}</b></div>
  <div><span>PDC Avg</span><b>${f(L.pdcAvg)}</b></div>
  <div><span>Rounded</span><b>±${k(L.rounded)}</b></div>
  <div><span>Syn PDC</span><b>${f(L.synBase, 1)}</b></div>
  <div><span>${esc(L.index)} close</span><b>${f(L.underlying)}</b></div>
</div>`;

  // ---------- range table ----------
  const rangeRow = (name, R, cls) => `
<tr class="${cls}"><th scope="row">${name} <small>±${k(R.width)}</small></th><td class="num">${k(R.range)} pts</td>
<td class="cec">${k(R.ce.strike)} CE</td><td class="num">${f(R.ce.iv, 1)}</td><td class="num">${f(R.ce.pdc)}</td>
<td class="pec">${k(R.pe.strike)} PE</td><td class="num">${f(R.pe.iv, 1)}</td><td class="num">${f(R.pe.pdc)}</td></tr>`;
  const ranges = `
<div class="tr-tablewrap"><table class="tr-table">
<thead><tr><th>Range</th><th>Width</th><th>Call strike</th><th>CE IV</th><th>CE PDC</th><th>Put strike</th><th>PE IV</th><th>PE PDC</th></tr></thead>
<tbody>${rangeRow("Short", L.short, "r-short")}${rangeRow("Wide", L.wide, "r-wide")}</tbody></table></div>`;

  // ---------- ladder ----------
  const ladder = `
<details class="tr-ladder"><summary>Strike ladder (ATM → Wide) · ${L.ladder.length} strikes</summary>
<div class="tr-tablewrap"><table class="tr-table">
<thead><tr><th>Tag</th><th>Dist ±</th><th>Range</th><th>CE strike</th><th>CE PDC</th><th>CE IV</th><th>PE strike</th><th>PE PDC</th><th>PE IV</th></tr></thead>
<tbody>${L.ladder.map(r => `<tr class="${r.tag ? "t-" + r.tag.toLowerCase() : ""}"><td><b>${r.tag}</b></td><td class="num">${k(r.dist)}</td><td class="num">${k(r.range)}</td><td class="cec">${k(r.ceStrike)}</td><td class="num">${f(r.cePdc)}</td><td class="num">${f(r.ceIv, 1)}</td><td class="pec">${k(r.peStrike)}</td><td class="num">${f(r.pePdc)}</td><td class="num">${f(r.peIv, 1)}</td></tr>`).join("")}</tbody>
</table></div></details>`;

  // ---------- ATM high / low ----------
  const hl = L.hl ? `
<div class="tr-hl">
  <div><span>ATM CE PDH / PDL</span><b class="cec">${f(L.hl.cePdh)} / ${f(L.hl.cePdl)}</b></div>
  <div><span>ATM PE PDH / PDL</span><b class="pec">${f(L.hl.pePdh)} / ${f(L.hl.pePdl)}</b></div>
  <div><span>Highest High <small>${esc(L.hl.hhFrom)}</small></span><b>${f(L.hl.hh)}</b></div>
  <div><span>Lowest Low <small>${esc(L.hl.llFrom)}</small></span><b>${f(L.hl.ll)}</b></div>
  <div><span>HL BEP</span><b>${f(L.hl.bep)}</b></div>
</div>` : "";

  return `<div class="tr-wrap">${svg}</div>${chips}${ranges}${hl}${ladder}`;
}

export const TRIANGLE_CSS = `
.tr-wrap{width:100%;max-width:720px;margin:0 auto}
.tri{width:100%;height:auto;display:block}
.tri .tr-fill{fill:var(--tr-fill,rgba(18,53,91,.06))}
.tri .tr-fill2{fill:var(--tr-fill2,rgba(200,149,46,.12))}
.tri .tr-ce{stroke:var(--tr-ce,#0f8a7e);stroke-width:3}
.tri .tr-pe{stroke:var(--tr-pe,#d9731a);stroke-width:3}
.tri .tr-short{stroke:var(--tr-short,#2563c9);stroke-width:2.5;stroke-dasharray:8 6}
.tri .tr-wide{stroke:var(--tr-wide,#7a3fb8);stroke-width:3}
.tri .tr-axis{stroke:var(--muted,#5d6874);stroke-width:1;stroke-dasharray:3 5;opacity:.6}
.tri .tr-tick{stroke:var(--muted,#5d6874);stroke-width:1.5;opacity:.7}
.tri .tr-dot-atm{fill:var(--accent,#c8952e);stroke:var(--surface,#fff);stroke-width:3}
.tri .tr-dot-ce{fill:var(--tr-ce,#0f8a7e);stroke:var(--surface,#fff);stroke-width:3}
.tri .tr-dot-pe{fill:var(--tr-pe,#d9731a);stroke:var(--surface,#fff);stroke-width:3}
.tri .tr-t{fill:var(--ink,#14202e);font-family:inherit;paint-order:stroke;stroke:var(--surface,#fff);stroke-width:6px;stroke-linejoin:round}
.tri .tr-b{font-size:21px;font-weight:800}
.tri .tr-s{font-size:17px;font-weight:600}
.tri .tr-xs{font-size:15px;font-weight:600}
.tri .tr-m{fill:var(--muted,#5d6874)}
.tri .tr-rng{font-size:17px;font-weight:800;fill:var(--tr-short,#2563c9)}
.tri text.tr-cec,.tri .tr-cec{fill:var(--tr-ce,#0f8a7e)}
.tri text.tr-pec,.tri .tr-pec{fill:var(--tr-pe,#d9731a)}
.tr-chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr));gap:8px;margin:12px 0}
.tr-chips div,.tr-hl div{border:1px solid var(--line,#e2ddd2);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:2px;background:var(--surface,#fff);min-width:0}
.tr-chips span,.tr-hl span{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#5d6874);font-weight:700}
.tr-chips b,.tr-hl b{font-variant-numeric:tabular-nums;font-size:1rem}
.tr-hl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;margin:12px 0}
.tr-tablewrap{overflow-x:auto;margin:8px 0}
.tr-table{width:100%;border-collapse:collapse;font-size:.86rem;min-width:620px;font-variant-numeric:tabular-nums}
.tr-table th,.tr-table td{padding:8px;border-bottom:1px solid var(--line,#e2ddd2);text-align:left;white-space:nowrap}
.tr-table thead th{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#5d6874)}
.tr-table th small{color:var(--muted,#5d6874);font-weight:600}
.tr-table .cec{color:var(--tr-ce,#0f8a7e);font-weight:700}
.tr-table .pec{color:var(--tr-pe,#d9731a);font-weight:700}
.tr-table tr.r-short th,.tr-table tr.t-short td:first-child{color:var(--tr-short,#2563c9)}
.tr-table tr.r-wide th,.tr-table tr.t-wide td:first-child{color:var(--tr-wide,#7a3fb8)}
.tr-table tr.t-atm td:first-child{color:var(--accent,#c8952e)}
.tr-table tr.t-atm,.tr-table tr.t-short,.tr-table tr.t-wide{background:var(--tr-row,rgba(18,53,91,.04))}
.tr-ladder summary{cursor:pointer;font-weight:700;padding:8px 0}
.tr-upsell{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:var(--warn-bg,#fdf1dc);font-size:.9rem;text-align:center}
`;
