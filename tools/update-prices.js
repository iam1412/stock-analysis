#!/usr/bin/env node
'use strict';
/**
 * update-prices.js — cron refresh: ดึงราคาล่าสุด (Yahoo chart 1y/1mo) มาอัปเดตรายงานทุกตัว
 *
 * อัปเดตเฉพาะ "ตัวเลขโครงสร้าง" ที่ gate คุม (ราคา header + วันที่ราคา + กราฟ ~1 ปี + ป้าย % รอบปี
 * + gauge.cur + MOS + เครื่องคิดเลข + stock-meta) — **ไม่แตะ prose วิเคราะห์ / EPS / Fair Value**
 *
 * Freeze + flag (ไม่แตะไฟล์ เขียนลง price-flags.json รอ re-analysis) เมื่อ:
 *   ราคาต่างจากในรายงาน >10% · MOS พลิกเครื่องหมาย · ราคาหลุดช่วง gauge ·
 *   ต่าง >25% / currency ไม่ตรง (สงสัย split/ticker) · fetch/patch ไม่สำเร็จ
 *
 * ใช้:  node tools/update-prices.js [--write] [SYMBOL ...]
 *   ไม่มี --write = dry-run · หลัง --write: npm run build → node tools/preserve-dates.js
 *   → npm run build → npm run verify (คงวันที่ "วิเคราะห์" เดิม — ราคา refresh ไม่ใช่ re-analysis)
 */
const fs = require('fs');
const path = require('path');

const REPORTS = path.join(__dirname, '..', 'reports');
const FLAGS = path.join(__dirname, '..', 'price-flags.json');

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// บางรายงานเขียนวันที่ด้วยชื่อเดือนเต็ม ("1 กรกฎาคม 2569") — รับทั้งสองแบบ แต่เขียนกลับเป็นตัวย่อเสมอ
// (canonical: ตัวย่อคือแบบเดียวที่ parsePriceAge ของ gate อ่านออก → staleness check เห็นไฟล์นั้นด้วย)
const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MAX_PTS = 13;          // กราฟรายเดือน ~1 ปี (E37)
const FLAT_PP = 0.75;        // |% รอบปี| < 0.75 → "ทรงตัว" (ตาม migrate-annual-chg)
const DRIFT_FREEZE = 0.15;   // ราคาใหม่ต่างจากในรายงาน > 15% → freeze (prose จะผิดความหมาย · เดิม 10% — ขยับขึ้นลดภาระ re-analysis)
const SUSPECT_FREEZE = 0.25; // ต่าง > 25% → สงสัย split/ticker เปลี่ยน/ข้อมูลเพี้ยน
const FETCH_DELAY_MS = 450;  // throttle Yahoo (~2 req/s)
const UP = { bg: 'var(--green-soft)', col: '#1e8e3e' };
const DOWN = { bg: 'var(--red-soft)', col: '#c5221f' };

// ---------- utils ----------
const round = (v, d) => { const k = Math.pow(10, d); return Math.round(v * k) / k; };
const num4 = (v) => +v.toFixed(6); // ตัดเศษ float ก่อนลง JSON

// format ราคาสำหรับโชว์: 2 ตำแหน่งเสมอ + comma เมื่อ ≥1000 (สไตล์เดิมของรายงาน)
function fmtPrice(p) {
  const s = round(p, 2).toFixed(2);
  const [i, d] = s.split('.');
  return (Math.abs(p) >= 1000 ? Number(i).toLocaleString('en-US') : i) + '.' + d;
}

// format ตัวเลขตามสไตล์เดิม (นับตำแหน่งทศนิยมจากข้อความเก่า)
function fmtLike(p, oldText) {
  const m = String(oldText).replace(/,/g, '').match(/\.(\d+)/);
  const d = m ? m[1].length : 0;
  const s = round(p, d).toFixed(d);
  const [i, dec] = s.split('.');
  return (Math.abs(p) >= 1000 ? Number(i).toLocaleString('en-US') : i) + (dec ? '.' + dec : '');
}

// serialize report-data สไตล์เดิม (จุดกราฟ/array ตัวเลขบรรทัดเดียว) — ตาม migrate-annual-chg.js
function styledRD(rd) {
  let s = JSON.stringify(rd, null, 2);
  s = s.replace(/\[\n\s*("(?:[^"\\]|\\.)*"),\n\s*(-?\d+(?:\.\d+)?)\n\s*\]/g, '[$1, $2]');
  s = s.replace(/\[\n\s*((?:-?\d+(?:\.\d+)?,\n\s*)*-?\d+(?:\.\d+)?)\n\s*\]/g,
    (m, body) => '[' + body.replace(/,\n\s*/g, ', ') + ']');
  return s;
}

const toYahooSymbol = (symbol, currency) => currency === 'THB' ? `${symbol}.BK` : symbol;

// ---------- Yahoo fetch ----------
async function fetchChart(ysym, attempt = 0) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=1y&interval=1mo`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } });
  } catch (e) {
    if (attempt < 3) { await sleep(2000 * Math.pow(3, attempt)); return fetchChart(ysym, attempt + 1); }
    throw new Error(`network: ${e.message}`);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) { await sleep(2000 * Math.pow(3, attempt)); return fetchChart(ysym, attempt + 1); }
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.meta) throw new Error(j && j.chart && j.chart.error ? j.chart.error.description : 'ไม่มีข้อมูล');
  const meta = r.meta;
  const ts = r.timestamp || [];
  const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const bars = [];
  for (let i = 0; i < ts.length; i++) if (Number.isFinite(closes[i])) bars.push({ ts: ts[i], close: closes[i] });
  if (!Number.isFinite(meta.regularMarketPrice)) throw new Error('ไม่มี regularMarketPrice');
  return {
    price: meta.regularMarketPrice,
    currency: meta.currency,
    marketTime: meta.regularMarketTime,      // epoch วินาที ของราคาล่าสุด
    gmtoffset: meta.gmtoffset || 0,          // tz ตลาด — ใช้แปลงเป็น "วันที่ราคา"
    bars,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- chart ----------
// bars รายเดือนจาก Yahoo → จุดกราฟ ≤13 จุด label ไทย "มิ.ย.25" · จุดท้าย = ราคาปัจจุบันเป๊ะ
function buildChartData(bars, currentPrice, gmtoffset) {
  const byMonth = new Map(); // "YYYY-MM" → {y, m, close} เก็บค่าท้ายสุดของเดือน (กัน bar ซ้ำเดือน)
  for (const b of bars) {
    const d = new Date((b.ts + gmtoffset) * 1000);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    byMonth.set(`${y}-${m}`, { y, m, close: b.close });
  }
  let pts = [...byMonth.values()].slice(-MAX_PTS);
  if (pts.length < 2) throw new Error(`กราฟรายเดือนมี ${pts.length} จุด (<2 — IPO ใหม่มาก?) คงกราฟเดิมไว้`);
  const data = pts.map((p) => [`${THAI_MONTHS[p.m]}${String(p.y).slice(-2)}`, round(p.close, 2)]);
  data[data.length - 1][1] = round(currentPrice, 2); // จุดท้าย = ราคา header (check-site: จุดสุดท้าย≈ราคา)
  return data;
}

// ขอบเขต + gridline สวย ๆ ครอบข้อมูล + เส้น fair value
function niceBounds(values, fairLine) {
  const all = Number.isFinite(fairLine) ? values.concat([fairLine]) : values.slice();
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < Math.abs(hi) * 0.02 + 1e-9) { lo -= Math.abs(lo) * 0.02 + 0.01; hi += Math.abs(hi) * 0.02 + 0.01; }
  const niceStep = (raw) => {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const f of [1, 2, 2.5, 5, 10]) if (raw <= f * p * 1.0001) return f * p;
    return 10 * p;
  };
  let step = niceStep((hi - lo) / 4);
  let min, max, grid;
  for (let i = 0; i < 6; i++) { // ขยาย step จน grid ≤ 5 เส้น
    const pad = (hi - lo) * 0.06;
    min = Math.floor((lo - pad) / step) * step;
    max = Math.ceil((hi + pad) / step) * step;
    if (min < 0 && lo >= 0) min = 0;
    grid = [];
    for (let g = min + step; g < max - step * 0.01; g += step) grid.push(num4(g));
    if (grid.length <= 5) break;
    step = niceStep(step * 1.6);
  }
  return { min: num4(min), max: num4(max), grid };
}

// ป้าย % รอบปี + ทิศทาง (logic เดียวกับ tools/migrate-annual-chg.js)
function annualChg(data, suffix) {
  const first = data[0][1], last = data[data.length - 1][1];
  let pct = first > 0 ? (last - first) / first * 100 : null;
  if (pct == null || Math.abs(pct) < FLAT_PP) return { text: `≈ ทรงตัว ${suffix}`, dir: 'flat', pct };
  if (pct > 0) return { text: `▲ +${pct.toFixed(1)}% ${suffix}`, dir: 'up', pct };
  return { text: `▼ −${Math.abs(pct).toFixed(1)}% ${suffix}`, dir: 'down', pct };
}

// ---------- ตัดสิน update / freeze ----------
function decide(ctx) {
  const { oldPrice, newPrice, fv, gaugeMin, gaugeMax, currencyOk } = ctx;
  if (!currencyOk) return { freeze: 'currency-mismatch' };
  if (!Number.isFinite(newPrice) || newPrice <= 0) return { freeze: 'bad-price' };
  const drift = Math.abs(newPrice - oldPrice) / oldPrice;
  if (drift > SUSPECT_FREEZE) return { freeze: 'suspect-split-or-data', drift };
  if (drift > DRIFT_FREEZE) return { freeze: `drift-gt-${Math.round(DRIFT_FREEZE * 100)}pct`, drift };
  if (Number.isFinite(fv) && fv > 0) {
    const mosOld = fv - oldPrice, mosNew = fv - newPrice;
    if (mosOld * mosNew < 0) return { freeze: 'mos-sign-flip', drift };
  }
  if (Number.isFinite(gaugeMin) && Number.isFinite(gaugeMax) && (newPrice < gaugeMin || newPrice > gaugeMax))
    return { freeze: 'outside-gauge-range', drift };
  return { update: true, drift };
}

// ---------- patch รายงานหนึ่งไฟล์ ----------
// คืน { html, changed } — ทุก pattern ต้อง match ไม่งั้น throw (ไป flag เป็น patch-failed)
function patchReport(html, p) {
  const { newPrice, dateParts /* {day, monIdx, yearCE} */, chartData } = p;
  const need = (re, where) => { if (!re.test(html)) throw new Error(`patch ไม่เจอ pattern: ${where}`); };

  // --- stock-meta (FV เป็น source of truth ของการคำนวณ mos/upside) ---
  const smM = html.match(/(<script[^>]*\bid=["']stock-meta["'][^>]*>)([\s\S]*?)(<\/script>)/i);
  if (!smM) throw new Error('ไม่มีบล็อก stock-meta');
  const sm = JSON.parse(smM[2]);
  const fv = sm.fairValue;
  if (!Number.isFinite(fv) || fv <= 0) throw new Error('stock-meta.fairValue ใช้ไม่ได้');
  const mos = (fv - newPrice) / fv * 100;
  const upside = (fv - newPrice) / newPrice * 100;

  // --- report-data: กราฟใหม่ทั้งเส้น + bounds + highlight + gauge.cur + สีป้ายตามทิศ ---
  const rdM = html.match(/(<script[^>]*\bid=["']report-data["'][^>]*>)([\s\S]*?)(<\/script>)/i);
  if (!rdM) throw new Error('ไม่มีบล็อก report-data');
  const rd = JSON.parse(rdM[2]);
  if (!rd.chart || !Array.isArray(rd.chart.data)) throw new Error('report-data.chart ใช้ไม่ได้');

  const oldChg = (html.match(/<div class="chg"[^>]*>([\s\S]*?)<\/div>/i) || [, ''])[1].replace(/<[^>]*>/g, ' ').trim();
  const title2 = (html.match(/<div class="n">2<\/div><h2>([\s\S]*?)<\/h2>/) || [, ''])[1];
  const suffix = (/IPO/i.test(oldChg) || /IPO/i.test(title2)) ? '(ตั้งแต่ IPO)' : '(รอบปี)';
  const chg = annualChg(chartData, suffix);

  rd.chart.data = chartData;
  const prices = chartData.map((d) => d[1]);
  const b = niceBounds(prices, Number.isFinite(rd.chart.fairLine) ? rd.chart.fairLine : null);
  rd.chart.min = b.min; rd.chart.max = b.max; rd.chart.grid = b.grid;
  let iMin = 0, iMax = 0;
  prices.forEach((v, i) => { if (v < prices[iMin]) iMin = i; if (v > prices[iMax]) iMax = i; });
  rd.chart.highlight = [...new Set([iMin, iMax])].sort((x, y) => x - y);
  if (rd.gauge) rd.gauge.cur = round(newPrice, 2);
  const theme = chg.dir === 'up' ? UP : chg.dir === 'down' ? DOWN : null;
  if (theme && rd.theme) { rd.theme.chgBg = theme.bg; rd.theme.chgColor = theme.col; }

  let out = html.replace(/(<script[^>]*\bid=["']report-data["'][^>]*>)[\s\S]*?(<\/script>)/i,
    (m, a, z) => a + '\n' + styledRD(rd) + '\n' + z);

  // --- stock-meta: price/mos/upside (คีย์อื่นคงเดิม — freshHash ไม่นับบล็อกนี้อยู่แล้ว) ---
  sm.price = round(newPrice, 2); sm.mos = round(mos, 1); sm.upside = round(upside, 1);
  out = out.replace(/(<script[^>]*\bid=["']stock-meta["'][^>]*>)[\s\S]*?(<\/script>)/i,
    (m, a, z) => a + '\n' + JSON.stringify(sm) + '\n' + z);

  // --- header: ราคา .px ---
  need(/(<div class="px">\s*[฿$])([\d.,]+)/, 'ราคา header (.px)');
  out = out.replace(/(<div class="px">\s*[฿$])([\d.,]+)/, (m, a) => a + fmtPrice(newPrice));

  // --- header: วันที่ราคา (แทนทุก date-token ไทยใน <header> — คงรูปแบบ พ.ศ./ค.ศ. เดิม) ---
  // รับเดือนตัวย่อ + ชื่อเต็ม (ชื่อเต็มไว้ก่อนใน alternation กัน match ครึ่งเดียว) — เขียนกลับเป็นตัวย่อเสมอ
  const monthAlt = THAI_MONTHS_FULL.concat(THAI_MONTHS.map((x) => x.replace(/\./g, '\\.'))).join('|');
  const dateRe = new RegExp(`\\d{1,2}(?:\\s*[–\\-]\\s*\\d{1,2})?\\s*(?:${monthAlt})\\s*(20\\d\\d|25\\d\\d|26\\d\\d)`, 'g');
  const headM = out.match(/<header[\s\S]*?<\/header>/i);
  if (!headM) throw new Error('ไม่มี <header>');
  const newDate = (yr) => {
    const era = parseInt(yr, 10) >= 2400 ? dateParts.yearCE + 543 : dateParts.yearCE;
    return `${dateParts.day} ${THAI_MONTHS[dateParts.monIdx]} ${era}`;
  };
  let newHeader = headM[0];
  if (dateRe.test(newHeader)) {
    newHeader = newHeader.replace(dateRe, (m, yr) => newDate(yr));
  } else {
    // บางรายงานลงวันที่แบบไม่มีวัน ("ราคา ณ มิถุนายน 2569" / "ณ ก.พ. 2569 (ก.พ. 2026)")
    // จำกัดการแทนแบบนี้ไว้ใน .px-meta เท่านั้น — เดือน+ปีลอย ๆ ที่อื่น (เช่นใน tag) อาจไม่ใช่วันที่ราคา
    const moYrRe = new RegExp(`(?:${monthAlt})\\s*(20\\d\\d|25\\d\\d|26\\d\\d)`, 'g');
    const pmM = newHeader.match(/<div class="px-meta">[\s\S]*?<\/div>/i);
    if (!pmM || !moYrRe.test(pmM[0])) throw new Error('ไม่เจอวันที่ราคาใน header');
    newHeader = newHeader.replace(pmM[0], pmM[0].replace(moYrRe, (m, yr) => newDate(yr)));
  }
  out = out.replace(headM[0], newHeader);

  // --- disclaimer: "ราคา ณ <วันที่>" (ถ้ามี) ---
  out = out.replace(/(<div class="disc">[\s\S]*?<\/div>)/i, (block) =>
    block.replace(new RegExp(`(ราคา[^0-9<]{0,25})(\\d{1,2}(?:\\s*[–\\-]\\s*\\d{1,2})?\\s*(?:${monthAlt})\\s*(20\\d\\d|25\\d\\d|26\\d\\d))`, 'g'),
      (m, pre, tok, yr) => {
        const era = parseInt(yr, 10) >= 2400 ? dateParts.yearCE + 543 : dateParts.yearCE;
        return `${pre}${dateParts.day} ${THAI_MONTHS[dateParts.monIdx]} ${era}`;
      }));

  // --- ป้าย .chg ---
  need(/<div class="chg"[^>]*>[\s\S]*?<\/div>/i, 'ป้าย .chg');
  out = out.replace(/<div class="chg"[^>]*>[\s\S]*?<\/div>/i, `<div class="chg">${chg.text}</div>`);

  // --- gauge label "ปัจจุบัน $X" (เฉพาะ marker #mCur) ---
  need(/(id="mCur"><div class="lab">ปัจจุบัน\s*[฿$]?)([\d.,]+)/, 'gauge label ปัจจุบัน');
  out = out.replace(/(id="mCur"><div class="lab">ปัจจุบัน\s*[฿$]?)([\d.,]+)/, (m, a, old) => a + fmtLike(newPrice, old));

  // --- MOS .big (เครื่องหมายเดิม −/+ · sign flip ถูก freeze ก่อนถึงจุดนี้) ---
  need(/(<div class="big">)\s*[+\-−–]?\s*[\d.]+\s*%(<\/div>)/, 'MOS .big');
  const mosTxt = (mos < 0 ? '−' : '+') + (Math.abs(mos) >= 2 ? Math.abs(mos).toFixed(0) : Math.abs(mos).toFixed(1)) + '%';
  out = out.replace(/(<div class="big">)\s*[+\-−–]?\s*[\d.]+\s*%(<\/div>)/, (m, a, z) => a + mosTxt + z);

  // --- เครื่องคิดเลข: ค่าตั้งต้น pxIn (E23) ---
  need(/(id="pxIn"[^>]*\bvalue=")[^"]*(")/, 'pxIn value');
  out = out.replace(/(id="pxIn"[^>]*\bvalue=")[^"]*(")/, (m, a, z) => a + String(round(newPrice, 2)) + z);

  return { html: out, changed: out !== html, chg, mos: round(mos, 1) };
}

// ---------- flags ----------
function loadFlags() {
  try { return JSON.parse(fs.readFileSync(FLAGS, 'utf8')); } catch (e) { return []; }
}
// snapshot: flag ของ symbol ที่ประมวลรอบนี้ = ผลรอบนี้ (เคลียร์เองเมื่อหาย) · symbol นอกรอบ (--only) คงเดิม
function mergeFlags(prev, processed, newFlags) {
  const today = new Date().toISOString().slice(0, 10);
  const prevBy = new Map(prev.map((f) => [f.symbol, f]));
  const kept = prev.filter((f) => !processed.has(f.symbol));
  const fresh = newFlags.map((f) => {
    const old = prevBy.get(f.symbol);
    return { ...f, flaggedAt: old && old.reason === f.reason ? old.flaggedAt : today };
  });
  return kept.concat(fresh).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// ---------- commit body (log ถาวรต่อหุ้นใน git history) ----------
// บรรทัดต่อหุ้นที่เปลี่ยน + ตัวที่ freeze — workflow เอาไปต่อท้าย commit message (git commit -F)
function commitBody(updated, frozen) {
  const fmt = (x) => `${x.symbol} ${x.old} → ${x.new} (${x.diffPct > 0 ? '+' : ''}${x.diffPct}%)`;
  const lines = updated.map(fmt);
  if (frozen.length) {
    lines.push('');
    for (const f of frozen) lines.push(`freeze ${f.symbol} [${f.reason}]${f.marketPrice != null ? ` ${f.reportPrice} → ${f.marketPrice} (${f.diffPct > 0 ? '+' : ''}${f.diffPct}%)` : ''}`);
  }
  return lines.join('\n');
}

// ---------- main ----------
async function main() {
  const WRITE = process.argv.includes('--write');
  const ONLY = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')).map((s) => s.replace(/\.html$/i, '').toUpperCase()));

  const files = fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).sort()
    .filter((f) => !ONLY.size || ONLY.has(f.replace(/\.html$/i, '').toUpperCase()));

  const updated = [], skipped = [], frozen = [], failed = [];
  let fetchFails = 0, done = 0;

  for (const f of files) {
    const symbol = f.replace(/\.html$/i, '');
    const fp = path.join(REPORTS, f);
    const html = fs.readFileSync(fp, 'utf8');
    done++;

    // abort ทั้งรอบถ้าโดนบล็อก (fetch พังเกินครึ่งใน 20 ตัวแรก) — กัน mass-flag ผิด ๆ
    if (done === 21 && fetchFails > 10) { console.error('✗ fetch พังเกินครึ่งใน 20 ตัวแรก — น่าจะโดน rate-limit, ยกเลิกทั้งรอบ'); process.exit(2); }

    let sm;
    try { sm = JSON.parse((html.match(/<script[^>]*\bid=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i) || [])[1]); }
    catch (e) { failed.push({ symbol, reason: 'no-stock-meta' }); continue; }

    let q;
    try {
      q = await fetchChart(toYahooSymbol(symbol, sm.currency));
      await sleep(FETCH_DELAY_MS);
    } catch (e) {
      fetchFails++;
      frozen.push({ symbol, reason: 'fetch-failed', detail: e.message, reportPrice: sm.price, marketPrice: null, diffPct: null });
      console.log(`⚠ ${symbol.padEnd(10)} fetch fail: ${e.message}`);
      continue;
    }

    const rdRaw = (html.match(/<script[^>]*\bid=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i) || [])[1];
    let gauge = {};
    try { gauge = (JSON.parse(rdRaw) || {}).gauge || {}; } catch (e) { /* patchReport จะ throw เอง */ }

    const d = decide({
      oldPrice: sm.price, newPrice: q.price, fv: sm.fairValue,
      gaugeMin: gauge.min, gaugeMax: gauge.max,
      currencyOk: !q.currency || q.currency === sm.currency,
    });
    const diffPct = round((q.price - sm.price) / sm.price * 100, 1);

    if (d.freeze) {
      frozen.push({ symbol, reason: d.freeze, reportPrice: sm.price, marketPrice: round(q.price, 2), diffPct });
      console.log(`❄ ${symbol.padEnd(10)} freeze [${d.freeze}] ${sm.price} → ${round(q.price, 2)} (${diffPct > 0 ? '+' : ''}${diffPct}%)`);
      continue;
    }

    // วันที่ราคา = วันของ regularMarketTime ตาม tz ตลาด (วันหยุดได้วันปิดล่าสุดจริง ไม่โกงวันที่)
    const md = new Date((q.marketTime + q.gmtoffset) * 1000);
    const dateParts = { day: md.getUTCDate(), monIdx: md.getUTCMonth(), yearCE: md.getUTCFullYear() };

    try {
      const chartData = buildChartData(q.bars, q.price, q.gmtoffset);
      const r = patchReport(html, { newPrice: q.price, dateParts, chartData });
      if (!r.changed) { skipped.push(symbol); continue; }
      if (WRITE) fs.writeFileSync(fp, r.html);
      updated.push({ symbol, old: sm.price, new: round(q.price, 2), diffPct });
      console.log(`${WRITE ? '✓' : '·'} ${symbol.padEnd(10)} ${sm.price} → ${round(q.price, 2)} (${diffPct > 0 ? '+' : ''}${diffPct}%) · ${r.chg.text} · MOS ${r.mos}%`);
    } catch (e) {
      frozen.push({ symbol, reason: 'patch-failed', detail: e.message, reportPrice: sm.price, marketPrice: round(q.price, 2), diffPct });
      console.log(`⚠ ${symbol.padEnd(10)} patch fail: ${e.message}`);
    }
  }

  // เขียน flags (เฉพาะ --write — dry-run ไม่ทิ้งร่องรอย)
  const flags = mergeFlags(loadFlags(), new Set(files.map((f) => f.replace(/\.html$/i, ''))), frozen.concat(failed.map((x) => ({ ...x, reportPrice: null, marketPrice: null, diffPct: null }))));
  if (WRITE) fs.writeFileSync(FLAGS, JSON.stringify(flags, null, 2) + '\n');

  // log ต่อหุ้นสำหรับ commit body (ถาวรใน git history — Actions log หายใน ~90 วัน)
  if (WRITE && process.env.PRICE_COMMIT_BODY)
    fs.writeFileSync(process.env.PRICE_COMMIT_BODY, commitBody(updated, frozen) + '\n');

  const line = `${WRITE ? 'เขียนแล้ว' : '[dry-run]'} อัปเดต ${updated.length} · ไม่เปลี่ยน ${skipped.length} · freeze ${frozen.length} · error ${failed.length} (ทั้งหมด ${files.length})`;
  console.log('\n' + line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    let mdOut = `## Price refresh\n${line}\n`;
    if (flags.length) {
      mdOut += `\n### ⚠️ Flags รอ re-analysis (${flags.length})\n| Symbol | เหตุผล | ราคาในรายงาน | ราคาตลาด | ต่าง | ตั้งแต่ |\n|---|---|---|---|---|---|\n`;
      for (const x of flags) mdOut += `| ${x.symbol} | ${x.reason} | ${x.reportPrice ?? '-'} | ${x.marketPrice ?? '-'} | ${x.diffPct != null ? x.diffPct + '%' : '-'} | ${x.flaggedAt} |\n`;
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, mdOut);
  }
  if (!WRITE) console.log('ใส่ --write เพื่อเขียนจริง');
}

module.exports = { fmtPrice, fmtLike, toYahooSymbol, buildChartData, niceBounds, annualChg, decide, patchReport, mergeFlags, styledRD, commitBody };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
