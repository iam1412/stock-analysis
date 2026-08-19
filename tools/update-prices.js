#!/usr/bin/env node
'use strict';
/**
 * update-prices.js — cron refresh: ดึงราคาล่าสุด (Yahoo chart 1y/1mo) มาอัปเดตรายงานทุกตัว
 *
 * อัปเดตเฉพาะ "ตัวเลขโครงสร้าง" ที่ gate คุม (ราคา header + วันที่ราคา + กราฟ ~1 ปี + ป้าย % รอบปี
 * + gauge.cur + MOS + เครื่องคิดเลข + stock-meta) — **ไม่แตะ prose วิเคราะห์ / EPS / Fair Value**
 *
 * Freeze + flag (ไม่แตะไฟล์ เขียนลง price-flags.json รอ re-analysis) เมื่อ:
 *   ราคาต่างจากในรายงาน >15% · MOS พลิกเครื่องหมายเกิน dead-band ±3 จุด ·
 *   ต่าง >25% / currency ไม่ตรง (สงสัย split/ticker) · fetch/patch ไม่สำเร็จ
 *   + `bad-chart`: ซีรีส์กราฟจาก Yahoo **ผสมสองฐาน** — split ที่ Yahoo ยังไม่ปรับย้อนหลังให้ครบ
 *   (detectMixedBasis: มี bar ในหน้าต่าง 52 สัปดาห์หลุดกรอบ fiftyTwoWeekLow/High เกิน 10%)
 *   เคสจริง MNST 12 ส.ค. 2569 split 2:1: ก.ย.–ธ.ค. 25 ยังไม่ปรับ ปนกับ ม.ค. 26 ที่ปรับแล้ว ⇒ กราฟมี
 *   หน้าผา −50% ปลอม + ป้าย % รอบปี **พลิกเครื่องหมาย** (▼ −32.4% ทั้งที่จริง ▲ +35.3%) · drift ราคา ~0
 *   ⇒ ไม่มีเกณฑ์ freeze ข้ออื่นจับได้ และ gate ก็จับไม่ได้ (E36 เทียบป้ายกับปลายกราฟ = ผิดพร้อมกันทั้งคู่)
 *   ตัวที่ติด flag นี้ **ไม่ถูก patch** เพื่อกันเขียนทับกราฟที่คนแก้ถูกไว้แล้ว · flag หายเองเมื่อ Yahoo
 *   ปรับ adjclose ครบ (รอบถัดไป detectMixedBasis ผ่าน) — ไม่ต้องถอนมือ · `--force` ยังประทับ
 *   ราคา/วันที่ได้แต่คงกราฟเดิมในไฟล์ (price-only) เพราะ SKILL STEP 1 สั่ง --force ทุกรอบ re-analysis
 *   (MOS พลิกใน ±3 จุด = แกว่งรอบ FV → patch ผ่าน · ราคาหลุดขอบ gauge → ขยายขอบเอง ไม่ freeze)
 *   + `not-on-exchange`: quote ค้างหลัง cohort เดียวกัน ≥3 session (detectStaleQuotes)
 *   **และ** TradingView ยืนยันว่าไม่พบ ticker บนกระดานใด (confirmDead) — สองชั้นเพราะ
 *   regularMarketTime ค้างที่ "วันซื้อขายล่าสุด" ไม่ใช่ "session ล่าสุด" ⇒ หุ้นสภาพคล่องต่ำ
 *   หน้าตาเหมือนหุ้นตาย (วัดจริง: flag จาก timestamp เพียว ๆ = FP 99/248 วัน)
 *   ตัวที่ติด flag นี้อยู่แล้ว **หยุด patch** — ราคาเป็น no-op จริง แต่หน้าต่างกราฟ 1 ปีเลื่อน
 *   ทุกครั้งที่ข้ามเดือน ⇒ ป้าย % รอบปี/สี/chart.data จะถูกเขียนใหม่ทั้งที่หุ้นไม่ได้เทรด
 *
 * ข้าม (ไม่แตะไฟล์ ไม่เขียน flag) เมื่อ **ตลาดของตัวนั้นยังเปิดอยู่** — ราคาที่ได้เป็น intraday
 *   ไม่ใช่ราคาปิด (isIntradayQuote) · cron ตั้งเวลาให้ได้ราคาปิดอยู่แล้ว แต่ workflow_dispatch/รันมือ
 *   ตอนเย็นไทย = กลาง session US ⇒ เดิมจะ patch ราคากลางวันลงรายงานทั้งกระดาน (เคสจริง 11 ส.ค. 2569:
 *   ยิงทดสอบ 13:38 ET → patch 899 ตัว + freeze 6 ตัวจากราคา intraday) · ข้าม --allow-intraday/--force/--alive
 *
 * ใช้:  node tools/update-prices.js [--write] [--force] [--allow-intraday] [SYMBOL ...]
 *   ไม่มี --write = dry-run · หลัง --write: npm run build → node tools/preserve-dates.js
 *   → npm run build → npm run verify (คงวันที่ "วิเคราะห์" เดิม — ราคา refresh ไม่ใช่ re-analysis)
 *   --force = ข้าม freeze drift/mos-flip/gauge/suspect (ใช้ตอน re-analysis UPDATE mode ที่ agent
 *   ยืนยัน cross-source แล้ว) — บังคับระบุ SYMBOL ชัด ๆ ห้ามใช้กับ full run · currency/bad-price/bad-report-price ยัง freeze
 *   --alive = ยืนยันด้วยมือว่า "ยังอยู่บนกระดานจริง" → ปลด `not-on-exchange` แล้ว patch ต่อ (เคส mapping
 *   เพี้ยนใน SKILL STEP 0 ที่ห้ามลบรายงาน) · **แยกจาก --force โดยตั้งใจ**: SKILL สั่ง `--force` เป็นคำสั่ง
 *   ประจำของ re-analysis ทุกครั้ง (STEP 1/5B/5C) ถ้าผูกกับ --force หุ้นตายจะถูก patch + ปลด flag เงียบ ๆ
 *   ทุกครั้งที่มีคนสั่ง "วิเคราะห์ X" = เปิดจุดบอด EA/BPP คืนทางประตูหลัง · ปลด flag เฉพาะตัวที่รอบนี้
 *   ไม่ได้ล้มแบบ plumbing (fetch/patch/meta) — ไม่งั้น net error ตอน --alive จะลดระดับ triage เงียบ ๆ
 *   --allow-intraday = ยอมรับราคา intraday (ตลาดยังเปิด) · --force/--alive ข้าม guard นี้ให้เองอยู่แล้ว
 *   เพราะ SKILL สั่ง `--force` ทุกรอบ re-analysis และเจ้าของรีโปทำงานตอนเย็นไทย = กลาง session US
 */
const fs = require('fs');
const path = require('path');
// ยืนยัน "ticker ตายจริงไหม" ด้วยแหล่งอิสระ — ใช้ helper ร่วมกับ canary รายสัปดาห์ (ไม่มี require วน:
// dead-ticker-canary ไม่ได้ require ไฟล์นี้ · main() ของมันรันเฉพาะเมื่อถูกเรียกเป็น entry point)
const { tvCandidates, scan: scanTickers, classify: classifyTickers, loadTickerCache } = require('./dead-ticker-canary.js');
const { entryFor } = require('./symbol-map.js');
const { readStockMeta, STOCK_META_PARTS_RE } = require('./report-meta.js');

const REPORTS = path.join(__dirname, '..', 'reports');
const FLAGS = path.join(__dirname, '..', 'price-flags.json');

// ชื่อเดือน + ตัวหา "วันที่ราคา" มาจาก tools/price-date.js ที่เดียว (ใช้ร่วมกับ gate — อย่าทำสำเนา)
// ค่าที่ derive จากราคา (P/E · % ของราคาเป้า) — กติกาเดียวกับที่ gate ใช้ตรวจ E41/E42/W15 (ห้ามทำสำเนาความรู้)
const { patchDerived } = require('./derived-values.js');
const { findPriceDate, findRestatedDate, renderThaiDate, THAI_MONTHS, MONTH_ALT } = require('./price-date.js');
const MAX_PTS = 13;          // กราฟรายเดือน ~1 ปี (E37)
const FLAT_PP = 0.75;        // |% รอบปี| < 0.75 → "ทรงตัว" (ตาม migrate-annual-chg)
const DRIFT_FREEZE = 0.15;   // ราคาใหม่ต่างจากในรายงาน > 15% → freeze (prose จะผิดความหมาย · เดิม 10% — ขยับขึ้นลดภาระ re-analysis)
const SUSPECT_FREEZE = 0.25; // ต่าง > 25% → สงสัย split/ticker เปลี่ยน/ข้อมูลเพี้ยน
const MOS_FLIP_DEADBAND_PP = 3; // MOS พลิกเครื่องหมายแต่ทั้งเก่า-ใหม่อยู่ใน ±3 จุด = แกว่งรอบ FV → patch ผ่าน ไม่ freeze
                                // (3 = dead-band เดียวกับ gate W06 — prose "ถูก/แพงเล็กน้อย" ไม่ขัด gate ในช่วงนี้)
const GAUGE_PAD = 0.05;      // ราคาหลุดขอบ gauge → ขยายขอบเป็น ราคา±5% (ขอบเป็น display scaffolding — engine วาดจาก report-data.gauge)
const FETCH_DELAY_MS = 450;  // throttle Yahoo (~2 req/s)
const ABORT_CONSEC_FAILS = 11; // fetch พังติดกันครบ N ตัว = ต้นทางล่ม/โดนบล็อก ไม่ใช่ ticker รายตัวมีปัญหา → ยกเลิกทั้งรอบ
                               // นับ "ติดกัน" ไม่ใช่ยอดรวม: ยิงผ่าน 1 ตัว = ต้นทางยังดี → รีเซ็ตตัวนับ ⇒ หุ้นที่ล้มประปราย
                               // ทั้งรีโป (ticker เปลี่ยนชื่อ/ประวัติหาย) ไม่มีวันสะสมจนยกเลิกรอบ
                               // 11 = ค่าต่ำสุดที่ไม่ไวกว่ายามเดิม ("พังเกิน 10 ใน 20 ตัวแรก" ⇒ ต้องพัง ≥11 ถึงยกเลิก)
                               // แต่ยามเดิมเช็คครั้งเดียวที่ตัวที่ 21 ⇒ ต้นทางล่มหลังตัวที่ ~200 ไม่มีอะไรจับเลย
                               // retry backoff กินงบ job 45 นาทีจนหมดแล้วตายโดยไม่ commit อะไรสักตัว
const STALE_QUOTE_SESSIONS = 3; // ตลาดเดินหน้าไป ≥3 session แล้ว quote ตัวนี้ยังค้าง → flag stale-quote
                                // (3 = ทนสุดสัปดาห์ + วันหยุดยาว/ไม่มีเทรด 1 วันได้ แต่จับ EA ได้ในวันที่ 4 หลังปิดดีล)
const STALE_MIN_COHORT = 5;     // cohort เล็กกว่านี้ = คาลิเบรตไม่ได้ (รัน --only ไม่กี่ตัว) → ไม่ flag
const UP = { bg: 'var(--green-soft)', col: '#137333' };
const DOWN = { bg: 'var(--red-soft)', col: '#c5221f' };

// ---------- utils ----------
const round = (v, d) => { const k = Math.pow(10, d); return Math.round(v * k) / k; };
const num4 = (v) => +v.toFixed(6); // ตัดเศษ float ก่อนลง JSON
// โซนของกล่อง verdict จาก MOS (%) — **นิยามเดียวในรีโป**: cron ใช้ sync class · W04 ใน check-reports import ไปตรวจ
// (เดิมกติกาซ้ำอยู่ 3 ที่: check-reports · agent-prompt · templates.md — ถ้าแก้ตัวเลขต้องแก้ที่นี่ที่เดียว)
const mosBand = (mos) => (mos < 10 ? 'bad' : mos < 20 ? 'ok' : 'good');

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

// ticker ที่ Yahoo ใช้คนละชื่อกับชื่อไฟล์รายงาน (บริษัทปรับโครงสร้าง/เปลี่ยนชื่อ) — override ที่ tools/symbol-map.json
const toYahooSymbol = (symbol, currency) => {
  const m = entryFor(symbol);
  if (m.yahoo) return m.yahoo;
  return currency === 'THB' ? `${symbol}.BK` : symbol;
};

// ---------- Yahoo fetch ----------
const REQ_TIMEOUT_MS = 20000; // undici default ~300 วิ — ยิงเดียวค้างกินงบ job (45 นาที); ตัดเองที่ 20 วิ (ค่าเดียวกับ dead-ticker-canary)
async function fetchChart(ysym, attempt = 0, interval = '1mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=1y&interval=${interval}`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }, signal: AbortSignal.timeout(REQ_TIMEOUT_MS) });
  } catch (e) {
    if (attempt < 3) { await sleep(2000 * Math.pow(3, attempt)); return fetchChart(ysym, attempt + 1, interval); }
    throw new Error(`network: ${e.message}`);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) { await sleep(2000 * Math.pow(3, attempt)); return fetchChart(ysym, attempt + 1, interval); }
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
  const reg = (meta.currentTradingPeriod && meta.currentTradingPeriod.regular) || {};
  return {
    price: meta.regularMarketPrice,
    currency: meta.currency,
    marketTime: meta.regularMarketTime,      // epoch วินาที ของราคาล่าสุด
    gmtoffset: meta.gmtoffset || 0,          // tz ตลาด — ใช้แปลงเป็น "วันที่ราคา"
    regularStart: reg.start,                 // ขอบ session ปกติ (epoch วินาที) — ป้อน isIntradayQuote
    regularEnd: reg.end,
    // กรอบ 52 สัปดาห์จาก meta ชุดเดียวกัน — Yahoo ปรับ split ให้แล้ว **แม้ตอนที่ซีรีส์ close ยังไม่ปรับ**
    // จึงใช้เป็นตัวชี้ขาดฐานราคาของ bars ได้ (ป้อน detectMixedBasis) · v8 chart ส่งมาให้อยู่แล้ว ไม่ต้องยิง
    // endpoint quote แยก (ซึ่งต้องใช้ crumb/cookie และล้มบ่อย)
    week52Low: meta.fiftyTwoWeekLow,
    week52High: meta.fiftyTwoWeekHigh,
    bars,
  };
}

// ---------- guard: ราคานี้เป็นราคาปิดจริง หรือ intraday? ----------
// ★ v8 chart **ไม่มี field `marketState`** (วัดจริง 11 ส.ค. 2569: AAPL + IIG.BK ได้ undefined ทั้งคู่)
// ⇒ ตัดสินจาก `currentTradingPeriod.regular` แทน · Yahoo **เลื่อนหน้าต่างไป session ถัดไปทันทีที่ปิด**
// (วัดจริง: IIG.BK ปิด 16:30 ICT แล้ว regular = 10:00–16:30 ของ *วันรุ่งขึ้น* แต่ regularMarketTime
// ยังเป็นราคาปิดวันนี้) — เลยต้องเช็คสองเงื่อนไขคู่กัน ไม่ใช่ข้อใดข้อเดียว:
//   1) marketTime ≥ regularStart = tick ล่าสุดอยู่ในหน้าต่างที่ระบบชี้อยู่ (ยังไม่เลื่อน = session นี้)
//   2) now < regularEnd        = หน้าต่างนั้นยังไม่จบ
// ปิดแล้วแต่ยังไม่เลื่อนหน้าต่าง → (1) จริง (2) เท็จ = ราคาปิด ✓ · ปิดแล้วเลื่อนแล้ว → (1) เท็จ ✓
// pre-market / หุ้นสภาพคล่องต่ำที่ยังไม่เทรดวันนี้ → marketTime = ปิดครั้งก่อน < start ⇒ (1) เท็จ
// = patch ด้วยราคาปิดเดิมตามปกติ (ไม่ false-skip — บทเรียนเดียวกับ FP 99/248 วันของ stale-quote)
// ★ ไม่มี currentTradingPeriod (Yahoo เปลี่ยนโครง) = **fail-open** ถือว่าเป็นราคาปิด — ตั้งใจต่างจาก
// currencyMatches ที่ fail-closed: currency หายแปลว่า "ticker น่าสงสัย" (freeze ตัวเดียว) แต่ field นี้
// หายแปลว่า "Yahoo เปลี่ยน schema" ⇒ fail-closed = cron ข้ามทั้งกระดานทุกวันเงียบ ๆ เสียหายกว่า
function isIntradayQuote({ marketTime, regularStart, regularEnd, nowSec }) {
  if (![marketTime, regularStart, regularEnd].every(Number.isFinite)) return false;
  const now = Number.isFinite(nowSec) ? nowSec : Math.floor(Date.now() / 1000);
  return marketTime >= regularStart && now < regularEnd;
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

// ---------- guard: ซีรีส์กราฟ "ผสมสองฐาน" (split ที่ Yahoo ยังไม่ปรับย้อนหลัง) ----------
// เคสจริง MNST 12 ส.ค. 2569 (split 2:1): v8 chart ส่ง close ที่ **ยังไม่ปรับ** สำหรับ ก.ย.–ธ.ค. 25
// (67–77) ปนกับเดือนที่ปรับแล้วตั้งแต่ ม.ค. 26 (36–48) ในซีรีส์เดียวกัน · `close === adjclose` ทุกจุด
// (ไม่มีสัญญาณว่าปรับแล้วหรือยัง) และ `events.splits` **หายไปแล้ว** ตอนวัด ⇒ เชื่อ metadata ไม่ได้เลย
// ผลถ้าปล่อยผ่าน: กราฟมีหน้าผา −50% ปลอม + ป้าย % รอบปี **พลิกเครื่องหมาย** (▼ −32.4% ทั้งที่จริง ▲ +35.3%)
// และ gate จับไม่ได้ (E36 เทียบป้ายกับปลายกราฟ — ผิดพร้อมกันทั้งคู่จึงผ่าน 39/39)
//
// ตัวชี้ขาดที่เชื่อได้ = `fiftyTwoWeekLow/High` ใน meta ชุดเดียวกัน ซึ่ง Yahoo ปรับ split แล้ว:
// bar ที่อยู่ **ในหน้าต่าง 52 สัปดาห์** ต้องอยู่ในกรอบนี้เสมอโดยนิยาม (close รายเดือน = close รายวัน
// ของวันสิ้นเดือน) ⇒ หลุดกรอบเกิน tol = ฐานคนละชุด ไม่ใช่ราคาแกว่ง
// ★ ตรวจเฉพาะ bar ในหน้าต่าง 52 สัปดาห์: range=1y คืน bar เก่ากว่านั้นได้ ซึ่งกรอบนี้ไม่ใช่ขอบเขตของมัน
//   (ts ของ bar รายเดือน = ต้นเดือน แต่ close = สิ้นเดือน ⇒ ใช้ ts ตัดเป็นการกันฝั่งปลอดภัย)
// ★ tol = ระยะกันชนล้วน ๆ **ไม่ใช่ค่าที่จูนให้พอดีข้อมูล** — วัดจริง 12 ส.ค. 2569 (สุ่ม 227/908 ตัว
//   ทั้ง USD/THB): **ทุกตัวมีจุดหลุดกรอบ = 0 แม้ตั้ง tol = 0** (ratio 1.0000 ยกแผง) ยืนยันว่า bar ใน
//   หน้าต่าง 52 สัปดาห์ถูกกรอบนี้ครอบโดยนิยามจริง ๆ · dry-run เต็มรีโป 908 ตัว → trip ตัวเดียวคือ MNST
//   ที่ 10% จึงเป็นกันชนสำหรับเคสที่ไม่ได้อยู่ในกลุ่มตัวอย่าง: **วันที่ราคา gap ทำจุดสูงใหม่แล้ว field
//   52wk ของ Yahoo ยังตามไม่ทัน** (bar ล่าสุดจะโผล่เหนือ high ชั่วคราว) · split เล็กสุดที่พบจริง
//   (5:4 = 1.25× · 3:2 = 1.5×) ยังสูงกว่า 1.10 ทุกตัว ⇒ กันชนนี้ไม่ได้แลกความไวมาเลย
// ⚠ ข้อจำกัดที่รู้ตัว: split ที่ตัวคูณเล็กพอจะยังตกในกรอบ 52wk ที่กว้างมาก จะรอดสายตาเช็คนี้ —
//   เป็น **ตัวชี้ให้ไปดู ไม่ใช่คำตัดสิน** (ปรัชญาเดียวกับ canary หุ้นตาย)
const CHART_BASIS_TOL = 0.10;
const WEEK52_SEC = 52 * 7 * 86400;

function detectMixedBasis({ bars, low, high, nowSec, gmtoffset = 0, tol = CHART_BASIS_TOL }) {
  const out = { checked: false, mixed: false, bad: [], worst: null, low, high, text: '' };
  // ไม่มี/เสีย = **fail-open** (เหตุผลเดียวกับ currentTradingPeriod ที่ isIntradayQuote): field หาย
  // แปลว่า "Yahoo เปลี่ยน schema" ⇒ fail-closed = cron freeze ทั้งกระดานทุกวันเงียบ ๆ เสียหายกว่า
  if (![low, high].every(Number.isFinite) || low <= 0 || high < low) return out;
  out.checked = true;
  const now = Number.isFinite(nowSec) ? nowSec : Math.floor(Date.now() / 1000);
  const from = now - WEEK52_SEC;
  const hiLim = high * (1 + tol), loLim = low * (1 - tol);
  for (const b of bars || []) {
    if (!Number.isFinite(b.ts) || !Number.isFinite(b.close) || b.close <= 0 || b.ts < from) continue;
    // ratio = "หลุดกรอบกี่เท่า" (>1 เสมอเมื่อหลุด) — เทียบขนาดได้ทั้งฝั่งสูง (split) และฝั่งต่ำ (reverse split)
    const ratio = b.close > hiLim ? b.close / high : b.close < loLim ? low / b.close : 0;
    if (ratio) out.bad.push({ ts: b.ts, close: b.close, ratio });
  }
  if (!out.bad.length) return out;
  out.mixed = true;
  out.worst = out.bad.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const d = new Date((out.worst.ts + gmtoffset) * 1000);
  const lab = `${THAI_MONTHS[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(-2)}`;
  out.text = `${lab} ${round(out.worst.close, 2)} หลุดกรอบ 52 สัปดาห์ ${round(low, 2)}–${round(high, 2)} `
    + `(${out.bad.length}/${bars.length} จุดคนละฐาน — สงสัย split ที่ Yahoo ยังไม่ปรับย้อนหลัง)`;
  return out;
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

// currency: Yahoo ไม่ส่ง currency = สงสัย → ไม่ผ่าน (freeze) · ไม่ fail-open (v8 chart ส่ง currency แทบทุกครั้งกับ ticker จริง)
const currencyMatches = (qCur, smCur) => qCur === smCur;

// ---------- ตัดสิน update / freeze ----------
function decide(ctx) {
  const { oldPrice, newPrice, fv, currencyOk, force } = ctx;
  if (!currencyOk) return { freeze: 'currency-mismatch' };
  if (!Number.isFinite(newPrice) || newPrice <= 0) return { freeze: 'bad-price' };
  // ราคาเดิมมาจาก stock-meta ของรายงานเอง — เสียเมื่อไร drift เสียตาม: 0 → Infinity · ไม่ใช่ตัวเลข → NaN
  // · **ติดลบ → drift ติดลบ** ซึ่งเทียบ `>` กับทุกเกณฑ์ freeze แล้วเป็นเท็จหมด ⇒ ตกไปทาง update
  // = patch ราคาใหม่ทับโดยยามทุกตัวถูกข้ามพร้อมกัน (เคสที่เงียบที่สุดของสามแบบ)
  // ต้องกันก่อนคิด drift และก่อน --force ด้วยเหตุผลเดียวกับ currency/bad-price: เป็นความไม่สมประกอบ
  // ของข้อมูล ไม่ใช่เกณฑ์เชิงนโยบายที่ agent ยืนยัน cross-source แล้วข้ามได้
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) return { freeze: 'bad-report-price' };
  const drift = Math.abs(newPrice - oldPrice) / oldPrice;
  if (force) return { update: true, drift }; // re-analysis ยืนยันแล้ว — ข้าม freeze เชิงนโยบาย (currency/bad-price/bad-report-price กันไว้ก่อนถึงบรรทัดนี้)
  if (drift > SUSPECT_FREEZE) return { freeze: 'suspect-split-or-data', drift };
  if (drift > DRIFT_FREEZE) return { freeze: `drift-gt-${Math.round(DRIFT_FREEZE * 100)}pct`, drift };
  if (Number.isFinite(fv) && fv > 0) {
    const mosOld = (fv - oldPrice) / fv * 100, mosNew = (fv - newPrice) / fv * 100;
    const inDeadband = Math.abs(mosOld) <= MOS_FLIP_DEADBAND_PP && Math.abs(mosNew) <= MOS_FLIP_DEADBAND_PP;
    if (mosOld * mosNew < 0 && !inDeadband) return { freeze: 'mos-sign-flip', drift };
  }
  // ราคาหลุดขอบ gauge ไม่ freeze แล้ว — patchReport ขยายขอบเอง (drift ใหญ่จริงโดนเกณฑ์ 15%/25% ก่อนเสมอ)
  return { update: true, drift };
}

// ---------- canary: quote ค้าง = หุ้นหยุดเทรด/เพิกถอน ----------
// จุดบอดที่ฟังก์ชันนี้ปิด: หุ้นตายแล้ว Yahoo **ไม่ 404** — มัน serve ราคาปิดวันสุดท้ายค้างไปเรื่อย ๆ
// ⇒ drift = 0% ⇒ ไม่มีเกณฑ์ freeze ข้อไหนจับได้เลย (เคสจริง 8 ส.ค. 2569: EA ปิดดีล take-private,
// BPP ควบบริษัทกับ BANPU — ทั้งคู่อยู่ในรีโปมาหลายวันโดยไม่มี flag)
// วิธีวัด: เทียบ regularMarketTime กับ cohort สกุลเงินเดียวกัน**ในรอบเดียวกัน** แล้วนับ session ที่พลาด
// — relative จึงไม่ต้องมีปฏิทินวันหยุดของแต่ละตลาด · เสาร์-อาทิตย์ไม่นับ (ไม่มีใครเทรด ไม่ใช่สัญญาณ)
const localDay = (marketTime, gmtoffset) => Math.floor((marketTime + (gmtoffset || 0)) / 86400);
const dowOf = (day) => (day + 4) % 7;   // epoch day 0 = 1 ม.ค. 1970 = พฤหัส → 0=อาทิตย์ … 6=เสาร์
function missedSessions(fromDay, toDay) {
  let n = 0;
  for (let d = fromDay + 1; d <= toDay; d++) { const w = dowOf(d); if (w >= 1 && w <= 5) n++; }
  return n;
}
// ★ ข้อจำกัดสำคัญที่วัดมาแล้ว (8 ส.ค. 2569): `regularMarketTime` ค้างที่ **"วันที่มีการซื้อขายล่าสุด"**
// ไม่ใช่ "session ล่าสุดของตลาด" — ตรวจหุ้นไทยในรีโป 204/205 ตัว ตรงกับ bar ล่าสุดที่ volume > 0 เป๊ะ
// ⇒ หุ้นสภาพคล่องต่ำที่ไม่มีใครเทรดหลายวัน (ในรีโปนี้: NRF, PB, ZEN) หน้าตาเหมือนหุ้นตายทุกประการ
// replay 248 session จริงย้อนหลัง 1 ปี: ถ้าเอาผลนี้ไป flag ตรง ๆ จะ false positive **99/248 วัน**
// (NRF ติดยาว 55 session ติด) และไม่มี threshold ไหนต่ำกว่า 56 ที่ทำให้เป็นศูนย์
// ⇒ ผลของฟังก์ชันนี้เป็น **candidate ไปถาม TradingView ต่อ** (confirmDead) ไม่ใช่ข้อสรุปว่าตาย
function detectStaleQuotes(quotes, opts = {}) {
  const sessions = Number.isFinite(opts.sessions) ? opts.sessions : STALE_QUOTE_SESSIONS;
  const minCohort = Number.isFinite(opts.minCohort) ? opts.minCohort : STALE_MIN_COHORT;
  const cohorts = new Map();
  for (const q of quotes) {
    if (!Number.isFinite(q.marketTime)) continue;   // meta ไม่มี timestamp → วัดไม่ได้ ข้ามเงียบ ๆ
    const key = q.currency || '?';
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push({ ...q, day: localDay(q.marketTime, q.gmtoffset) });
  }
  const out = [];
  for (const [cohort, list] of cohorts) {
    if (list.length < minCohort) continue;
    const ref = list.reduce((mx, q) => Math.max(mx, q.day), -Infinity); // session ล่าสุดที่ตลาดนี้เดินถึง
    for (const q of list) {
      const missed = missedSessions(q.day, ref);
      if (missed < sessions) continue;
      out.push({
        symbol: q.symbol, signal: 'stale-quote',   // ★ `signal` ไม่ใช่ `reason` — ห้ามเขียนลง flag ตรง ๆ
        reportPrice: q.reportPrice ?? null,
        marketPrice: q.marketPrice ?? null,
        diffPct: q.diffPct ?? null,
        missedSessions: missed, cohort,
      });
    }
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// เพดานจำนวน candidate ที่ยอมเชื่อว่าเป็นเรื่องจริง — เกินนี้คือ "การวัดเพี้ยน" ไม่ใช่หุ้นตายยกแผง
// (เคสที่ทำให้เพี้ยนได้จริง: quote ตัวหนึ่งมี timestamp อนาคตดัน ref ไปข้างหน้า · รอบที่คร่อม
// session boundary · ตลาดหยุดยาวหลายวัน) → log แล้วไม่ถาม ไม่ flag ปล่อย canary รายสัปดาห์จัดการ
const probeCap = (cohortSize) => Math.max(5, Math.round(cohortSize * 0.05));

// ★ เพดานต้องคิด **ต่อ cohort** ไม่ใช่ต่อทั้งรอบ — cohort คือหน่วยที่ detectStaleQuotes ใช้วัด
// (ตลาดเดียวกัน ปฏิทินเดียวกัน) เหตุที่ทำให้เพี้ยนก็เกิดต่อตลาด: SET หยุดยาวไม่ทำให้ NYSE เพี้ยน
// ป้อน quotes.length ทั้งรีโป (~782) จะได้เพดาน 39 เท่ากันทั้งสองตลาด = 5% ของ US (~578) แต่เป็น
// **19% ของ SET (~204)** ⇒ ยามที่ตั้งใจกัน 10 ตัวปล่อยผ่านได้ถึง 39 ตัวในตลาดเล็ก
function capByCohort(candidates, quotes) {
  const size = new Map();
  for (const q of quotes) {
    if (!Number.isFinite(q.marketTime)) continue;   // นับให้ตรงกับที่ detectStaleQuotes สร้าง cohort
    const k = q.currency || '?';
    size.set(k, (size.get(k) || 0) + 1);
  }
  const byCohort = new Map();
  for (const c of candidates) {
    if (!byCohort.has(c.cohort)) byCohort.set(c.cohort, []);
    byCohort.get(c.cohort).push(c);
  }
  const kept = [], over = [];
  for (const [cohort, list] of byCohort) {
    const cap = probeCap(size.get(cohort) || 0);
    if (list.length > cap) over.push({ cohort, count: list.length, cap });
    else kept.push(...list);
  }
  return { kept: kept.sort((a, b) => a.symbol.localeCompare(b.symbol)), over };
}

// ticker ที่ "ต้องเจอเสมอ" ต่อ cohort — ตัวชี้ว่า scanner ตอบจริงหรือตอบเปล่า
// **หลายตัวต่อ cohort ขอแค่ตัวใดตัวหนึ่งตอบ**: control ก็เป็นหุ้นที่ควบ/เปลี่ยนชื่อได้เหมือนกัน (เคส BKI→BKIH
// ที่ symbol-map มีไว้แก้พอดี) ถ้าใช้ตัวเดียวแล้ววันหนึ่งมันหายไป ยามจะดับการตรวจของทั้ง cohort อย่างเงียบ ๆ
const CONTROL_TICKERS = { USD: ['NASDAQ:AAPL', 'NYSE:JPM'], THB: ['SET:PTT', 'SET:AOT'] };
const controlTickers = (candidates) =>
  [...new Set(candidates.flatMap((c) => CONTROL_TICKERS[c.cohort] || []))];

// ★ ยามคู่กับ shouldAbort ของ canary รายสัปดาห์: scanner **ตอบ HTTP 200 พร้อม data ว่างได้**
// (โดนบล็อก / เปลี่ยนโครง response) — scan() ไม่ throw เพราะ body ไม่ว่างและ JSON ไม่เสีย
// ⇒ rows ว่าง ⇒ classifyStale เห็น "ไม่มี candidate ไหนอยู่บนกระดาน" = flag ยกชุด ทั้งที่ยังเทรดกันอยู่
// เช็คจาก control ticker แทน rows.size ล้วน ๆ เพราะ "candidate ตายจริงทุกตัว" (เช่นรอบที่มี candidate
// ตัวเดียวคือ EA) ก็ทำให้ rows ว่างได้เหมือนกัน — ตัวนั้นต้อง flag ได้ ไม่ใช่โดนยามเตะทิ้ง
// คืน **เซ็ตของ cohort ที่ยืนยันไม่ได้** ไม่ใช่ boolean ทั้งรอบ: เหตุที่ทำให้ scanner เงียบเกิดต่อกระดาน
// (SET หายไม่ได้แปลว่า NASDAQ หาย) และ cohort ที่ไม่มี control เลย (สกุลเงินนอก USD/THB) ต้อง
// fail closed **เฉพาะตัวมันเอง** — ไม่ลากทั้งรอบทิ้ง และไม่ปล่อยผ่านเพราะ cohort อื่นมี control
function unverifiedCohorts(candidates, rows) {
  const bad = new Set();
  for (const c of candidates) {
    const ctl = CONTROL_TICKERS[c.cohort] || [];
    if (!ctl.length || !ctl.some((t) => rows.has(t))) bad.add(c.cohort);
  }
  return bad;
}

// แยก candidate เป็น "ตายจริง (TradingView ไม่มี ticker)" กับ "แค่ไม่มีคนเทรด (ยังอยู่บนกระดาน)"
// flag ที่ออกใช้ reason `not-on-exchange` เดียวกับ canary รายสัปดาห์ — triage จึงเหมือนกันเป๊ะ
// การจับคู่ ticker→row ใช้ classify() ของ canary ตัวเดียวกัน: กฎว่า "แถวแบบไหนนับว่ายังอยู่บนกระดาน"
// ต้องมีคำตอบเดียวทั้งระบบ ไม่งั้น cron รายวันกับ canary รายสัปดาห์ตัดสินหุ้นตัวเดียวกันไม่ตรงกัน
function classifyStale(candidates, rows, probeMap) {
  const { alive } = classifyTickers(
    candidates.map((c) => ({ symbol: c.symbol, candidates: probeMap.get(c.symbol) || [] })), rows);
  const dead = [], quiet = [];
  for (const c of candidates) {
    const hit = alive.get(c.symbol);
    if (hit) quiet.push({ ...c, ticker: hit.ticker });
    else dead.push({
      symbol: c.symbol, reason: 'not-on-exchange',
      reportPrice: c.reportPrice, marketPrice: c.marketPrice, diffPct: c.diffPct,
      missedSessions: c.missedSessions, detail: 'quote ค้าง + TradingView ไม่พบ ticker',
    });
  }
  return { dead, quiet };
}

// ---------- patch รายงานหนึ่งไฟล์ ----------
// คืน { html, changed } — ทุก pattern ต้อง match ไม่งั้น throw (ไป flag เป็น patch-failed)
function patchReport(html, p) {
  const { newPrice, dateParts /* {day, monIdx, yearCE} */ } = p;
  let { chartData } = p;
  const need = (re, where) => { if (!re.test(html)) throw new Error(`patch ไม่เจอ pattern: ${where}`); };

  // --- stock-meta (FV เป็น source of truth ของการคำนวณ mos/upside) ---
  const smM = html.match(STOCK_META_PARTS_RE);
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

  // price-only fallback: Yahoo ไม่มีประวัติพอ (ล้างประวัติ/IPO ใหม่มาก) → คงกราฟเดิม อัปเดตเฉพาะจุดท้ายเป็นราคาปัจจุบัน
  // (เดือนท้ายกราฟตรงเดือนราคา → แทนค่า · คนละเดือน → ต่อจุดใหม่แล้วตัดหัวให้ ≤MAX_PTS)
  if (!chartData) {
    const old = rd.chart.data;
    if (!Array.isArray(old) || old.length < 2) throw new Error('กราฟใหม่ไม่พอจุด และกราฟเดิมใช้ไม่ได้');
    const lab = `${THAI_MONTHS[dateParts.monIdx]}${String(dateParts.yearCE).slice(-2)}`;
    chartData = old.map((d) => [d[0], d[1]]);
    if (chartData[chartData.length - 1][0] === lab) chartData[chartData.length - 1][1] = round(newPrice, 2);
    else chartData = chartData.concat([[lab, round(newPrice, 2)]]).slice(-MAX_PTS);
  }

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
  if (rd.gauge) {
    rd.gauge.cur = round(newPrice, 2);
    // ราคาหลุด/ชิดขอบ gauge → ขยายขอบฝั่งนั้นเป็น ราคา±GAUGE_PAD (คงจำนวนทศนิยมเดิมของขอบ · ขยายอย่างเดียว ไม่หด)
    // check-site เตือนเมื่อ marker ชิดขอบ (v >= gmax / v <= gmin) — ×(1±5%) วางราคาไว้ในขอบแบบ strict เสมอ
    const decOf = (v) => (String(v).split('.')[1] || '').length;
    if (Number.isFinite(rd.gauge.max) && rd.gauge.cur >= rd.gauge.max) {
      const k = Math.pow(10, decOf(rd.gauge.max));
      rd.gauge.max = Math.ceil(rd.gauge.cur * (1 + GAUGE_PAD) * k) / k;
    }
    if (Number.isFinite(rd.gauge.min) && rd.gauge.cur <= rd.gauge.min) {
      const k = Math.pow(10, decOf(rd.gauge.min));
      rd.gauge.min = Math.max(0, Math.floor(rd.gauge.cur * (1 - GAUGE_PAD) * k) / k);
    }
  }
  const theme = chg.dir === 'up' ? UP : chg.dir === 'down' ? DOWN : null;
  if (theme && rd.theme) { rd.theme.chgBg = theme.bg; rd.theme.chgColor = theme.col; }

  let out = html.replace(/(<script[^>]*\bid=["']report-data["'][^>]*>)[\s\S]*?(<\/script>)/i,
    (m, a, z) => a + '\n' + styledRD(rd) + '\n' + z);

  // --- stock-meta: price/mos/upside (คีย์อื่นคงเดิม — freshHash ไม่นับบล็อกนี้อยู่แล้ว) ---
  sm.price = round(newPrice, 2); sm.mos = round(mos, 1); sm.upside = round(upside, 1);
  // ใช้ regex ตัวเดียวกับตอนอ่าน (report-meta.js) — เดิมเป็นสำเนาแยกที่ไม่มี need() คุม ⇒ ถ้า skeleton
  // เปลี่ยนวิธีฝัง แล้วมีคนแก้แค่ฝั่งอ่าน ตัวเขียนจะ replace ไม่โดนแล้ว "สำเร็จ" เงียบ ๆ = ราคา/กราฟถูก
  // patch แต่ stock-meta.price/mos/upside ค้างค่าเก่า (self-inconsistency ที่ gate มีไว้จับพอดี)
  need(STOCK_META_PARTS_RE, 'stock-meta (เขียนกลับ)');   // ไม่มี guard = replace ไม่โดนแล้วผ่านเงียบ ๆ
  out = out.replace(STOCK_META_PARTS_RE,
    (m, a, b, z) => a + '\n' + JSON.stringify(sm) + '\n' + z);   // 3 กลุ่ม: หัว/เนื้อ/ท้าย

  // --- header: ราคา .px ---
  need(/(<div class="px">\s*[฿$])([\d.,]+)/, 'ราคา header (.px)');
  out = out.replace(/(<div class="px">\s*[฿$])([\d.,]+)/, (m, a) => a + fmtPrice(newPrice));

  // --- header: วันที่ราคา (แทน **เฉพาะ token ของราคา** ตัวเดียว — คงรูปแบบ พ.ศ./ค.ศ. เดิม) ---
  // เดิมแทน date-token *ทุกตัว* ใน <header> ⇒ วันที่ที่เป็นข้อเท็จจริงในอดีต (จุดสูงสุดตลอดกาล ·
  // วันมีผลของ split/เปลี่ยนสัญลักษณ์/spin-off · วันประกาศงบ) ถูกประทับเป็นวันที่รันทุกวัน
  // — ตัวหา token อยู่ที่ tools/price-date.js ที่เดียว ใช้ร่วมกับตัวอ่านของ gate (parsePriceAge)
  const headM = out.match(/<header[\s\S]*?<\/header>/i);
  if (!headM) throw new Error('ไม่มี <header>');
  const hit = findPriceDate(headM[0]);
  // หาไม่เจอ = ถ้อยคำหน้าวันที่แปลกจนไม่มั่นใจว่าตัวไหนคือวันที่ราคา → ยอม patch-failed ให้เห็นในคิว
  // (เดาแล้วเขียนทับผิดคือบั๊กเดิม — เงียบและกลับมาเองทุกวัน)
  if (!hit || hit.monIdx < 0) throw new Error('ไม่เจอวันที่ราคาใน header');
  // เขียนกลับเป็น "วัน เดือนย่อ ปี" เสมอ แม้ของเดิมจะเป็นเดือน+ปีลอย ๆ ("ราคา ณ มิถุนายน 2569")
  // — ตัวย่อพร้อมวันคือแบบเดียวที่ parsePriceAge อ่านออก
  // + วันที่ที่ "ทวนซ้ำ" ในวงเล็บติดกัน (คนละศักราช) ต้องขยับตามด้วย ไม่งั้นหัวรายงานขัดกันเอง
  // เขียนจากขวาไปซ้าย — index ของตัวซ้ายจะได้ไม่ขยับตามความยาวที่เปลี่ยนของตัวขวา
  const restate = findRestatedDate(headM[0], hit);
  for (const t of [restate, hit].filter(Boolean)) {
    const abs = headM.index + t.index;
    out = out.slice(0, abs)
      + renderThaiDate(dateParts.day, dateParts.monIdx, dateParts.yearCE, t.isBE)
      + out.slice(abs + t.length);
  }

  // --- disclaimer: "ราคา ณ <วันที่>" (ถ้ามี) ---
  out = out.replace(/(<div class="disc">[\s\S]*?<\/div>)/i, (block) =>
    block.replace(new RegExp(`(ราคา(?![^0-9<]{0,25}เป้า)[^0-9<]{0,25})(\\d{1,2}(?:\\s*[–\\-]\\s*\\d{1,2})?\\s*(?:${MONTH_ALT})\\s*(20\\d\\d|25\\d\\d|26\\d\\d))`, 'g'),
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

  // --- ช่องสรุป "ส่วนต่างจากราคา" — patch เฉพาะ "ตัวเลข" ห้ามแตะคำบอกทิศทาง (แก้ต้นเหตุ W06) ---
  // ช่องนี้เป็นข้อความที่คนเขียนตอนวิเคราะห์ แต่ตัวเลขในนั้นคือ MOS ซึ่งเป็นค่าที่คำนวณได้
  // ⇒ ปล่อยไว้มันจะเพี้ยนขึ้นเรื่อย ๆ ตามราคาที่ patch ทุกวัน (วัดจริง 17 ส.ค. 2569: W06 ยิง 519/908 ใบ)
  // ★ กฎความปลอดภัย — patch ได้ต่อเมื่อ "คำบอกทิศทาง" ในช่องยังตรงกับเครื่องหมายของ MOS ใหม่:
  //   ถ้าขัดกัน (เขียน "ถูก" แต่ MOS ใหม่ติดลบ) = เรื่องของ **เนื้อหา** ไม่ใช่ตัวเลข → ไม่แตะ ปล่อยให้ W08/W06 เตือนต่อ
  //   การสลับคำเองเท่ากับ cron เขียน prose ซึ่ง §9 ห้ามเด็ดขาด — ต้องให้คนตัดสิน
  // ★ แทนที่เฉพาะใน text node (ข้ามเนื้อในแท็ก) กัน `width:50%` ใน inline style โดนแทนแทนตัวเลขจริง
  out = out.replace(/(ส่วนต่างจากราคา<\/div>\s*<div class="v"[^>]*>)([\s\S]*?)(<\/div>)/, (m, a, cell, z) => {
    const plain = cell.replace(/<[^>]*>/g, ' ');
    // ทิศทางอ่านได้ 2 ทาง: จาก "คำ" (แพง/ถูก) หรือจาก "เครื่องหมายหน้าตัวเลข" — เครื่องหมายชัดกว่าคำด้วยซ้ำ
    const sign = (plain.match(/([+\-−–])\s*[\d.]+\s*%/) || [, ''])[1];
    const cheap = /ถูก|undervalued|ต่ำกว่ามูลค่า/.test(plain) || sign === '+';
    const pricey = /แพง|เต็มมูลค่า|overvalued|สูงกว่ามูลค่า/.test(plain) || /[\-−–]/.test(sign);
    if (cheap === pricey) return m;             // ไม่มีตัวบอกทิศเลย หรือขัดกันเอง → ไม่เดา
    if ((mos >= 0) !== cheap) return m;         // ทิศขัดกับ MOS ใหม่ → เนื้อหา ไม่ใช่ตัวเลข
    let done = false;
    const patched = cell.replace(/(<[^>]*>)|([^<]+)/g, (seg, tag, text) => {
      if (tag || done || !/-?[\d.]+\s*%/.test(text)) return seg;
      done = true;
      return text.replace(/(-?)([\d.]+)(\s*%)/, (mm, sg, old, pc) => sg + fmtLike(Math.abs(mos), old) + pc);
    });
    return done ? a + patched + z : m;          // ไม่มีตัวเลขให้ patch → ปล่อยไว้
  });

  // --- สีกล่อง verdict `class="mos-verdict bad|ok|good"` — sync ให้ตรงโซน MOS ใหม่ (แก้ต้นเหตุ W04) ---
  // class นี้เป็นฟังก์ชันล้วนของ MOS ไม่มีดุลพินิจ (bad <10 / ok 10–20 / good ≥20 — กติกาเดียวกับ W04 และ agent-prompt)
  // ต่างจากช่อง "ส่วนต่างจากราคา" ข้างบนที่มี "คำ" — ตรงนี้ไม่มีอะไรให้ cron ต้องเดา จึง sync ได้ทุกครั้ง
  // ★ แตะเฉพาะ 3 ค่ามาตรฐานเท่านั้น — คลาสอื่น (ถ้ามีใครตั้งใจใช้) ปล่อยไว้ให้ gate ตัดสิน
  out = out.replace(/class="mos-verdict (bad|ok|good)"/, () => `class="mos-verdict ${mosBand(mos)}"`);

  // --- เครื่องคิดเลข: ค่าตั้งต้น pxIn (E23) ---
  need(/(id="pxIn"[^>]*\bvalue=")[^"]*(")/, 'pxIn value');
  out = out.replace(/(id="pxIn"[^>]*\bvalue=")[^"]*(")/, (m, a, z) => a + String(round(newPrice, 2)) + z);

  // --- ค่าที่ derive จากราคาล้วน ๆ: P/E (การ์ด + stock-meta.pe) + % ของราคาเป้าในการ์ด (E41/E42) ---
  // เหตุผลเดียวกับช่อง "ส่วนต่างจากราคา" ข้างบน: ตัวตั้งคือราคาที่เพิ่ง patch ไป ส่วนตัวหาร/ตัวลบ
  // (EPS · ราคาเป้า) เป็นข้อเท็จจริงที่รายงานพิมพ์ไว้เอง ⇒ ไม่ใช่ prose ไม่มีอะไรให้ cron เดา
  // ปล่อยไว้ = ค้างสะสมทุกวันที่ราคาขยับ (วัด 19 ส.ค. 69 ก่อนแก้: P/E เพี้ยน 233/908 ใบ)
  // ★ prose ไม่แตะ (§9) — % ของราคาเป้าที่เขียนในย่อหน้าเป็นหน้าที่ของคน (W15 เตือน · `--heal-derived --prose` ที่คนสั่งเอง)
  const dv = patchDerived(out, newPrice);
  out = dv.html;

  return { html: out, changed: out !== html, chg, mos: round(mos, 1), derived: dv.changes };
}

// ---------- flags ----------
// ไฟล์ไม่มี = รอบแรกจริง ๆ → คิวว่าง · **มีไฟล์แต่ parse ไม่ผ่าน = ล้มทั้งรอบ ห้ามคืน [] เงียบ ๆ**
// เพราะ mergeFlags(prev=[]) จะเขียนทับคิวทั้งใบตอน --write ⇒ คิวหายยกชุด รวม not-on-exchange ที่
// ถอนได้ 3 ทางเท่านั้น (TradingView เจอ ticker กลับมา · รายงานถูกลบ · --alive) — "ไฟล์เสีย/เขียนค้าง"
// ไม่ใช่หนึ่งในนั้น · แยกด้วย e.code: ENOENT = ไม่มีไฟล์ · JSON เสีย/อ่านไม่ได้ = มีไฟล์แต่เชื่อไม่ได้
function loadFlags() {
  try { return JSON.parse(fs.readFileSync(FLAGS, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Error(`อ่าน ${FLAGS} ไม่ได้ (${e.message}) — ไฟล์เสีย/เขียนค้าง ยกเลิกรอบนี้ ไม่เขียนทับคิวด้วยของว่าง`);
  }
}

// เขียน state file แบบ atomic: temp ในโฟลเดอร์เดียวกันแล้ว rename ทับ (rename ข้าม filesystem ไม่ atomic
// จึงต้องเป็น dir เดียวกัน · ใส่ pid กันสองรอบที่รันพร้อมกันเขียน temp ใบเดียวกันแล้ว rename ของครึ่งใบทับ)
// เขียนตรง ๆ แล้วถูกตัดกลางคัน (job timeout 45 นาที / เครื่องดับ) = เหลือ JSON ครึ่งใบ ซึ่งเป็น input
// ที่ทำให้ loadFlags ล้มทั้งรอบถัดไปพอดี — คิวนี้สร้างใหม่จากศูนย์ไม่ได้
function writeJsonAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
// เหตุผลที่เครื่องมืออื่นเป็นเจ้าของ (tools/dead-ticker-canary.js รายสัปดาห์) — cron ราคารายวัน
// ตรวจเรื่องนี้เองไม่ได้ ห้ามเคลียร์ทิ้งเวลาเห็นว่า "ตัวนี้ไม่มี freeze รอบนี้" ไม่งั้น canary เขียน
// flag คืนวันจันทร์ แล้วเช้าวันอังคารหายเกลี้ยง (หุ้นตายกลับไปเงียบเหมือนเดิม)
// ถอนได้ 3 ทาง: TradingView เจอ ticker กลับมา · รายงานถูกลบ · `--force <SYM>` (ยืนยันด้วยมือ)
// — ทั้งสามทางถอนที่ตัวเรียก (prevFlags) ก่อนถึง mergeFlags ตัวนี้จึงกันแค่การเคลียร์แบบเงียบ ๆ
const EXTERNAL_REASONS = new Set(['not-on-exchange']);

// snapshot: flag ของ symbol ที่ประมวลรอบนี้ = ผลรอบนี้ (เคลียร์เองเมื่อหาย) · symbol นอกรอบ (--only) คงเดิม
function mergeFlags(prev, processed, newFlags) {
  // เวลาไทยเสมอ (CLAUDE.md §7) — ไฟล์เดียวกันนี้ถูกเขียนโดย dead-ticker-canary.js ด้วย ซึ่งใช้
  // Asia/Bangkok · ถ้าตัวนี้ใช้ UTC ตาราง "ตั้งแต่" ในคิวจะปนสองปฏิทิน (รันมือ 00:00-07:00 น. ไทย
  // จะได้วันที่ของเมื่อวาน = flag ดูเหมือนเกิดก่อนเหตุที่ทำให้เกิด)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const prevBy = new Map(prev.map((f) => [f.symbol, f]));
  const external = prev.filter((f) => processed.has(f.symbol) && EXTERNAL_REASONS.has(f.reason));
  const externalSyms = new Set(external.map((f) => f.symbol));
  const kept = prev.filter((f) => !processed.has(f.symbol));
  const fresh = newFlags.filter((f) => !externalSyms.has(f.symbol)).map((f) => {
    const old = prevBy.get(f.symbol);
    return { ...f, flaggedAt: old && old.reason === f.reason ? old.flaggedAt : today };
  });
  return kept.concat(external, fresh).sort((a, b) => a.symbol.localeCompare(b.symbol));
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
// ---------- โหมดซ่อมค่าที่ derive จากราคา (one-off / หลัง migrate) ----------
// ใช้ "ราคาที่พิมพ์อยู่ในไฟล์แล้ว" เป็นตัวตั้ง — ไม่ยิง Yahoo เลย ⇒ รันกลาง session ได้ ไม่ชน intraday guard
// และไม่เปลี่ยนราคา/วันที่/กราฟ (แตะเฉพาะค่าที่คำนวณจากของที่พิมพ์ไว้แล้ว: P/E · stock-meta.pe · % ของราคาเป้า)
//   node tools/update-prices.js --heal-derived              # dry-run ทั้งคลัง
//   node tools/update-prices.js --heal-derived --write      # เขียนจริง (การ์ด + stock-meta เท่านั้น)
//   node tools/update-prices.js --heal-derived --prose --write   # + % ของราคาเป้าที่เขียนในย่อหน้า (ต้องรีวิว diff)
// ★ หลังเขียน: npm run build → node tools/preserve-dates.js → npm run build (คืนวันที่ "อัปเดตล่าสุด" เดิม —
//   ซ่อมค่า derive ไม่ใช่ re-analysis จึงห้ามดันทั้งคลังขึ้นหน้าแรก)
function healDerived(opts) {
  const files = fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).sort()
    .filter((f) => !opts.only.size || opts.only.has(f.replace(/\.html$/i, '').toUpperCase()));
  let touched = 0, total = 0, noPrice = 0;
  for (const f of files) {
    const fp = path.join(REPORTS, f);
    const html = fs.readFileSync(fp, 'utf8');
    // ราคาที่ใช้เป็นตัวตั้ง = ราคาใน header (.px) — ตัวเดียวกับที่ gate ใช้เทียบ (E41/E42) ไม่ใช่ stock-meta
    const m = html.match(/<div class="px">\s*[฿$]?\s*([\d.,]+)/);
    const px = m ? parseFloat(m[1].replace(/,/g, '')) : null;
    if (!(px > 0)) { noPrice++; continue; }
    const r = patchDerived(html, px, { prose: opts.prose });
    if (!r.changes.length || r.html === html) continue;
    touched++; total += r.changes.length;
    console.log(`${opts.write ? '✎' : '·'} ${f.replace(/\.html$/i, '').padEnd(10)} ราคา ${px}`);
    for (const c of r.changes) console.log(`    ${c}`);
    if (opts.write) fs.writeFileSync(fp, r.html);
  }
  console.log('\n' + '─'.repeat(50));
  console.log(`heal-derived: ${touched}/${files.length} ไฟล์มีค่าค้าง • แก้ ${total} จุด${opts.prose ? ' (รวม prose)' : ''}${noPrice ? ` • ข้าม ${noPrice} ไฟล์ (อ่านราคาไม่ได้)` : ''}`);
  if (!opts.write) console.log('(dry-run — ใส่ --write เพื่อเขียนจริง)');
  console.log('');
}

async function main() {
  const WRITE = process.argv.includes('--write');
  const FORCE = process.argv.includes('--force');
  const ALIVE = process.argv.includes('--alive');
  // --force/--alive ข้าม guard ให้เองด้วย: SKILL สั่ง --force ทุกรอบ re-analysis (STEP 1/5B/5C) และ
  // เจ้าของรีโปทำงานตอนเย็นไทย = กลาง session US ⇒ ถ้า guard คุมทางนั้นด้วย "วิเคราะห์ <US SYM>"
  // ตอนเย็นจะเลิกประทับราคาเงียบ ๆ ทุกครั้ง · ทั้งสอง flag บังคับระบุ SYMBOL + มีคน/agent ยืนยันแล้ว
  const ALLOW_INTRADAY = process.argv.includes('--allow-intraday') || FORCE || ALIVE;
  const ONLY = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')).map((s) => s.replace(/\.html$/i, '').toUpperCase()));
  // โหมดซ่อมค่าที่ derive จากราคา — คนละทางเดินกับ cron (ไม่ fetch ไม่แตะราคา/วันที่/กราฟ/คิว flags)
  if (process.argv.includes('--heal-derived')) {
    healDerived({ write: WRITE, prose: process.argv.includes('--prose'), only: ONLY });
    return;
  }
  if (FORCE && !ONLY.size) { console.error('✗ --force ต้องระบุ SYMBOL ชัด ๆ (กันข้าม freeze ทั้งรีโป)'); process.exit(1); }
  if (ALIVE && !ONLY.size) { console.error('✗ --alive ต้องระบุ SYMBOL ชัด ๆ (ปลด not-on-exchange ทั้งรีโปคือลบหลักฐานหุ้นตายทิ้ง)'); process.exit(1); }

  const files = fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).sort()
    .filter((f) => !ONLY.size || ONLY.has(f.replace(/\.html$/i, '').toUpperCase()));

  const updated = [], skipped = [], frozen = [], failed = [], intraday = [];
  const quotes = [];   // ทุกตัวที่ fetch สำเร็จ (รวมตัวที่ freeze) — ป้อน detectStaleQuotes หลังจบลูป
  // อ่าน flags ครั้งเดียวต่อรอบแล้วใช้ snapshot เดียวกันตลอด — เดิมอ่านสองครั้งคร่อมลูป fetch ~8 นาที
  // ถ้า canary/รันมือเขียนไฟล์คั่นกลาง สอง snapshot จะไม่ตรงกัน (ตัวหนึ่งข้าม patch อีกตัวไม่เห็น flag)
  const prevAll = loadFlags();
  // หุ้นที่รอบก่อน (cron หรือ canary รายสัปดาห์) ยืนยันแล้วว่าไม่อยู่บนกระดาน → ไม่ patch อีก
  const deadAlready = new Set(prevAll.filter((f) => f.reason === 'not-on-exchange').map((f) => f.symbol));
  // --alive = ผู้ใช้ยืนยันด้วยมือว่ายังอยู่บนกระดาน → patch ต่อได้ + ปลด flag (ทางออกของเคส "mapping
  // เพี้ยน" ที่เดิมไม่มีเลยนอกจากแก้ price-flags.json มือ) · ปลดจริงหลังจบลูปเฉพาะตัวที่ไม่ล้ม plumbing
  const aliveAsserted = new Set(ALIVE ? files.map((f) => f.replace(/\.html$/i, '')) : []);
  let consecFails = 0;

  for (const f of files) {
    const symbol = f.replace(/\.html$/i, '');
    const fp = path.join(REPORTS, f);
    const html = fs.readFileSync(fp, 'utf8');

    const sm = readStockMeta(html);
    if (!sm) { failed.push({ symbol, reason: 'no-stock-meta' }); continue; }

    let q;
    try {
      q = await fetchChart(toYahooSymbol(symbol, sm.currency));
      consecFails = 0;   // ยิงผ่าน = ต้นทางยังดี → เริ่มนับใหม่ (ยามจับ "พังติดกัน" ไม่ใช่ยอดรวมทั้งรอบ)
      await sleep(FETCH_DELAY_MS);
    } catch (e) {
      frozen.push({ symbol, reason: 'fetch-failed', detail: e.message, reportPrice: sm.price, marketPrice: null, diffPct: null });
      console.log(`⚠ ${symbol.padEnd(10)} fetch fail: ${e.message}`);
      // ยกเลิกทั้งรอบเมื่อพังติดกันครบเกณฑ์ — ยิงต่อได้แต่จะได้ flag fetch-failed ผิด ๆ ทั้งรีโป
      // และ retry backoff ของ fetchChart กินงบ job จนหมดก่อนถึงตัวสุดท้าย (เช็คตรงนี้ = จับ outage
      // ที่เริ่มตอนไหนของรอบก็ได้ ไม่ใช่แค่ 20 ตัวแรกแบบยามเดิม)
      if (++consecFails >= ABORT_CONSEC_FAILS) {
        console.error(`✗ fetch พังติดกัน ${consecFails} ตัว (ล่าสุด ${symbol}) — น่าจะโดน rate-limit/ต้นทางล่ม ยกเลิกทั้งรอบ`);
        process.exit(2);
      }
      continue;
    }

    // ตลาดของตัวนี้ยังเปิด → ราคาเป็น intraday ไม่ใช่ราคาปิด: ข้ามทั้งตัว **ก่อน** quotes.push
    // เจตนา 2 อย่างของการ push ทีหลัง: (1) ไม่เอา session ที่ยังเดินอยู่ไปเป็น cohort ให้ detectStaleQuotes
    // — ตอนตลาดเปิด marketTime ของตัวที่เทรดจะนำหน้าตัวสภาพคล่องต่ำที่ยังไม่มี tick วันนี้ = FP ยกแผง
    // (รันมือกลาง session cohort จะเหลือ < STALE_MIN_COHORT เอง → ไม่วัด = ถูกต้อง)
    // (2) ไม่ freeze/ไม่เขียน flag เพราะยังไม่ได้ "ตัดสิน" อะไร — แค่เลื่อนไปรอบที่มีราคาปิดจริง
    if (!ALLOW_INTRADAY && isIntradayQuote(q)) {
      intraday.push(symbol);
      console.log(`⏳ ${symbol.padEnd(10)} ข้าม — ตลาดยังเปิด (session ปิด ${new Date(q.regularEnd * 1000).toISOString().slice(11, 16)} UTC) ราคา ${round(q.price, 2)} เป็น intraday ไม่ใช่ราคาปิด · ต้องการจริงใช้ --allow-intraday`);
      continue;
    }

    const d = decide({
      oldPrice: sm.price, newPrice: q.price, fv: sm.fairValue,
      currencyOk: currencyMatches(q.currency, sm.currency),
      force: FORCE,
    });
    const diffPct = sm.price > 0 ? round((q.price - sm.price) / sm.price * 100, 1) : null; // sm.price ≤ 0 (corrupt) → null ไม่ให้ Infinity/NaN ซ่อน magnitude ใน triage
    // เก็บก่อนแยกทาง freeze/patch — canary ต้องเห็นทุกตัวที่ fetch ได้ ไม่ใช่แค่ตัวที่ patch
    quotes.push({
      symbol, currency: q.currency || sm.currency, marketTime: q.marketTime, gmtoffset: q.gmtoffset,
      reportPrice: sm.price, marketPrice: round(q.price, 2), diffPct,
    });

    // หุ้นที่ยืนยันแล้วว่าไม่อยู่บนกระดาน: หยุด patch ทันที — ราคาเป็น no-op จริง แต่ **หน้าต่างกราฟ 1 ปี
    // เลื่อนทุกครั้งที่ข้ามเดือน** ⇒ ป้าย % รอบปี/สี/chart.data ถูกเขียนใหม่แล้ว push ขึ้นเว็บได้เรื่อย ๆ
    // ทั้งที่หุ้นไม่ได้เทรด (เคสจริง BPP: ป้ายจะพลิก +47% → −6%) · ยัง fetch ไว้เพื่อให้ canary เห็น
    // ว่ามันกลับมาเทรดหรือยัง (กลับมา = TradingView เจอ ticker → ถอน flag → รอบหน้า patch ต่อเอง)
    // ★ เงื่อนไขคือ --alive ไม่ใช่ --force: SKILL สั่ง --force เป็นคำสั่งประจำของ re-analysis ทุกครั้ง
    // (STEP 1/5B/5C) ⇒ ถ้าผูกกับ --force แค่สั่ง "วิเคราะห์ X" ตามปกติก็ patch หุ้นตายจากราคาค้างของ
    // Yahoo แล้วลบ flag ทิ้งเงียบ ๆ = จุดบอด EA/BPP กลับมาทางประตูหลัง
    if (deadAlready.has(symbol) && !ALIVE) {
      skipped.push(symbol);
      console.log(`⏸ ${symbol.padEnd(10)} ข้าม patch — ติด flag not-on-exchange อยู่ (ยืนยัน/ลบรายงาน · ถ้ายังเทรดจริงใช้ --alive)`);
      continue;
    }
    if (deadAlready.has(symbol)) console.log(`↻ ${symbol.padEnd(10)} --alive ทับ flag not-on-exchange — patch ต่อแล้วปลด flag (ยืนยันด้วยมือแล้ว)`);

    if (d.freeze) {
      frozen.push({ symbol, reason: d.freeze, reportPrice: sm.price, marketPrice: round(q.price, 2), diffPct });
      console.log(`❄ ${symbol.padEnd(10)} freeze [${d.freeze}] ${sm.price} → ${round(q.price, 2)} (${diffPct > 0 ? '+' : ''}${diffPct}%)`);
      continue;
    }

    // วันที่ราคา = วันของ regularMarketTime ตาม tz ตลาด (วันหยุดได้วันปิดล่าสุดจริง ไม่โกงวันที่)
    const md = new Date((q.marketTime + q.gmtoffset) * 1000);
    const dateParts = { day: md.getUTCDate(), monIdx: md.getUTCMonth(), yearCE: md.getUTCFullYear() };

    // เดือนไม่พอจุด (ประวัติสั้น/Yahoo ล้างประวัติ — เคส BK) → ลองรายสัปดาห์ → ยังไม่ได้ = null ให้ patchReport ใช้กราฟเดิม+จุดท้ายใหม่
    // (ย้ายออกมานอก try ของ patchReport: ต้องรู้ว่า "bars ชุดไหนสร้างกราฟนี้" เพื่อตรวจฐานราคาต่อ
    //  และ freeze bad-chart ต้องเป็นเหตุผลของตัวเอง ไม่ใช่ patch-failed)
    let chartData = null, chartSrc = '1mo', chartBars = q.bars, chartGmt = q.gmtoffset;
    try { chartData = buildChartData(q.bars, q.price, q.gmtoffset); }
    catch (e1) {
      try {
        const qw = await fetchChart(toYahooSymbol(symbol, sm.currency), 0, '1wk');
        await sleep(FETCH_DELAY_MS);
        chartData = buildChartData(qw.bars, q.price, qw.gmtoffset);
        chartSrc = '1wk'; chartBars = qw.bars; chartGmt = qw.gmtoffset;
      } catch (e2) { chartSrc = 'old-chart'; chartBars = []; }
    }

    // ซีรีส์ต้นทางผสมสองฐาน (split ที่ Yahoo ยังไม่ปรับย้อนหลัง) → **ห้ามเขียนกราฟนี้ลงไฟล์**
    // ไม่ใช่เกณฑ์เชิงนโยบายแบบ drift/mos-flip แต่เป็น "ข้อมูลต้นทางไม่สมประกอบ" เหมือน bad-price
    // ⇒ freeze ทั้งตัวเพื่อกันไม่ให้ patch ทับกราฟที่คนแก้ถูกไว้แล้ว (เคส MNST: drift ~0 ⇒ ไม่มียามตัวอื่นจับได้เลย)
    const basis = detectMixedBasis({ bars: chartBars, low: q.week52Low, high: q.week52High, gmtoffset: chartGmt });
    if (basis.mixed) {
      // --force = re-analysis ที่ agent ยืนยัน cross-source แล้ว: ยอมให้ประทับ "ราคา/วันที่" ต่อได้
      // แต่ยัง **ห้ามเขียนกราฟจากซีรีส์นี้** → chartData = null = ทาง price-only ที่คงกราฟเดิมในไฟล์
      // (SKILL STEP 1 สั่ง `--write --force <SYM>` เป็นคำสั่งประจำ ถ้า hard-block ทางนี้ UPDATE จะทำต่อไม่ได้เลย)
      if (!FORCE) {
        frozen.push({ symbol, reason: 'bad-chart', detail: basis.text, reportPrice: sm.price, marketPrice: round(q.price, 2), diffPct });
        console.log(`❄ ${symbol.padEnd(10)} freeze [bad-chart] ${basis.text}`);
        continue;
      }
      chartData = null; chartSrc = 'old-chart(bad-chart)';
      console.log(`⚠ ${symbol.padEnd(10)} bad-chart + --force → ประทับเฉพาะราคา/วันที่ คงกราฟเดิมในไฟล์ · ${basis.text}`);
    }

    try {
      const r = patchReport(html, { newPrice: q.price, dateParts, chartData });
      if (!r.changed) { skipped.push(symbol); continue; }
      if (WRITE) fs.writeFileSync(fp, r.html);
      updated.push({ symbol, old: sm.price, new: round(q.price, 2), diffPct });
      console.log(`${WRITE ? '✓' : '·'} ${symbol.padEnd(10)} ${sm.price} → ${round(q.price, 2)} (${diffPct > 0 ? '+' : ''}${diffPct}%) · ${r.chg.text} · MOS ${r.mos}%${chartSrc !== '1mo' ? ` · chart:${chartSrc}` : ''}`);
    } catch (e) {
      frozen.push({ symbol, reason: 'patch-failed', detail: e.message, reportPrice: sm.price, marketPrice: round(q.price, 2), diffPct });
      console.log(`⚠ ${symbol.padEnd(10)} patch fail: ${e.message}`);
    }
  }

  // quote ค้าง → **ถาม TradingView ยืนยันก่อน** ห้าม flag จาก timestamp เพียว ๆ (ดูคอมเมนต์
  // detectStaleQuotes: หุ้นสภาพคล่องต่ำหน้าตาเหมือนหุ้นตาย — วัดแล้ว FP 99/248 วันถ้า flag ตรง ๆ)
  const { kept: candidates, over } = capByCohort(detectStaleQuotes(quotes), quotes);
  for (const o of over)
    console.log(`⚠ quote ค้าง ${o.count} ตัวใน cohort ${o.cohort} เกินเพดาน ${o.cap} — ถือว่าการวัดเพี้ยน (ไม่ใช่หุ้นตายยกแผง) ไม่ถาม TradingView ไม่ flag`);
  let deadConfirmed = [], quietSyms = new Set();
  if (candidates.length) {
    try {
      const tvCache = loadTickerCache();   // ticker ที่ canary resolve ไว้แล้ว → ยิงตัวเดียวแทนทุกกระดาน
      const probeMap = new Map(candidates.map((c) =>
        [c.symbol, tvCandidates(c.symbol, c.cohort, { cached: tvCache[c.symbol.toUpperCase()] })]));
      const controls = controlTickers(candidates);
      const rows = await scanTickers([...new Set([...[...probeMap.values()].flat(), ...controls])]);
      const unverified = unverifiedCohorts(candidates, rows);
      for (const co of unverified)
        console.log(`⚠ cohort ${co}: control ticker ไม่ตอบเลย — scanner โดนบล็อก/เปลี่ยนโครง (หรือ cohort นี้ไม่มี control) ไม่ flag cohort นี้รอบนี้`);
      const verified = candidates.filter((c) => !unverified.has(c.cohort));
      if (!verified.length) throw new Error('ไม่มี cohort ไหนยืนยันได้เลย — ไม่ flag ทั้งรอบ');
      const res = classifyStale(verified, rows, probeMap);
      deadConfirmed = res.dead;
      quietSyms = new Set(res.quiet.map((q) => q.symbol));
      for (const q of res.quiet)
        console.log(`· ${q.symbol.padEnd(10)} quote ค้าง ${q.missedSessions} session แต่ ${q.ticker} ยังอยู่บนกระดาน = ไม่มีคนเทรด ไม่ใช่หุ้นตาย`);
      for (const d of deadConfirmed)
        console.log(`☠ ${d.symbol.padEnd(10)} quote ค้าง ${d.missedSessions} session + TradingView ไม่พบ ticker → flag not-on-exchange (ยืนยันด้วยมือก่อนลบ)`);
    } catch (e) {
      console.log(`⚠ ถาม TradingView ไม่สำเร็จ (${e.message}) — ไม่ flag รอบนี้ ปล่อย canary รายสัปดาห์จัดการ · candidate: ${candidates.map((c) => c.symbol).join(', ')}`);
    }
  }
  // ถอน not-on-exchange เดิมทิ้ง (ไม่ค้างคิวตลอด) เมื่อ TradingView เจอ ticker กลับมา หรือผู้ใช้ยืนยันด้วย --alive
  // --alive ปลดเฉพาะตัวที่รอบนี้ไม่ได้ล้มแบบ plumbing — net error ระหว่างรัน --alive ไม่ควรแปลง flag
  // "ยืนยันเพิกถอนแล้วลบรายงาน" ให้กลายเป็น fetch-failed = "plumbing ไม่ใช้ agent" โดยไม่มีหลักฐานว่ายังเป็น
  const plumbingFail = new Set([...failed.map((x) => x.symbol),
    ...frozen.filter((f) => f.reason === 'fetch-failed' || f.reason === 'patch-failed').map((f) => f.symbol)]);
  const aliveConfirmed = new Set([...aliveAsserted].filter((s) => !plumbingFail.has(s)));
  for (const s of aliveAsserted) if (plumbingFail.has(s)) console.log(`⚠ ${s.padEnd(10)} --alive แต่รอบนี้ล้มแบบ plumbing — คง flag not-on-exchange ไว้ก่อน (ยังไม่มีหลักฐานว่ายังเทรด)`);
  const prevFlags = prevAll.filter((f) => !((quietSyms.has(f.symbol) || aliveConfirmed.has(f.symbol)) && f.reason === 'not-on-exchange'));
  const deadSyms = new Set(deadConfirmed.map((f) => f.symbol));
  const frozenAll = frozen.filter((f) => !deadSyms.has(f.symbol)).concat(deadConfirmed);

  // เขียน flags (เฉพาะ --write — dry-run ไม่ทิ้งร่องรอย) · flag ของรายงานที่ถูกลบแล้ว (หุ้นเพิกถอน) ตัดทิ้ง — ไม่งั้นค้างในคิวตลอด
  const reportExists = new Set(fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '').toUpperCase()));
  // ★ processed = ตัวที่ "ตัดสินแล้วรอบนี้" ต้อง **หักตัวที่ข้ามเพราะตลาดเปิด** ออก — mergeFlags เคลียร์
  // flag ของทุก symbol ใน processed ที่ไม่มี freeze รอบนี้ ⇒ ถ้าใส่ตัว intraday เข้าไปด้วย การรันมือ
  // กลาง session จะล้าง drift/mos-flip ที่ค้างคิวอยู่ทิ้งทั้งที่ยังไม่ได้ประเมินซ้ำเลย (คิวหายเงียบ)
  const evaluated = new Set(files.map((f) => f.replace(/\.html$/i, '')).filter((s) => !intraday.includes(s)));
  const flags = mergeFlags(prevFlags, evaluated, frozenAll.concat(failed.map((x) => ({ ...x, reportPrice: null, marketPrice: null, diffPct: null }))))
    .filter((f) => reportExists.has(String(f.symbol).toUpperCase()));
  if (WRITE) writeJsonAtomic(FLAGS, JSON.stringify(flags, null, 2) + '\n');

  // log ต่อหุ้นสำหรับ commit body (ถาวรใน git history — Actions log หายใน ~90 วัน)
  if (WRITE && process.env.PRICE_COMMIT_BODY)
    fs.writeFileSync(process.env.PRICE_COMMIT_BODY, commitBody(updated, frozenAll) + '\n');

  const line = `${WRITE ? 'เขียนแล้ว' : '[dry-run]'} อัปเดต ${updated.length} · ไม่เปลี่ยน ${skipped.length}${intraday.length ? ` · ข้ามเพราะตลาดเปิด ${intraday.length}` : ''} · freeze ${frozenAll.length}${deadConfirmed.length ? ` (ในนั้น not-on-exchange ${deadConfirmed.length})` : ''} · error ${failed.length} (ทั้งหมด ${files.length})`;
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

module.exports = { mosBand, fmtPrice, fmtLike, toYahooSymbol, fetchChart, buildChartData, niceBounds, annualChg, decide, currencyMatches, isIntradayQuote, detectMixedBasis, detectStaleQuotes, missedSessions, probeCap, capByCohort, controlTickers, unverifiedCohorts, classifyStale, patchReport, mergeFlags, styledRD, commitBody, THAI_MONTHS };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
