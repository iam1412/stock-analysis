#!/usr/bin/env node
'use strict';
/**
 * earnings-calendar.js — ปฏิทินงบต่อหุ้น (WS6 ข้อ 2: trigger LLM ตาม "เหตุการณ์ธุรกิจ" ไม่ใช่ราคา)
 *   node tools/earnings-calendar.js [--write] [--out <path>] [--limit N] [--delay ms]
 *     → earnings-calendar.json { updatedAt, symbols: { SYM: { last, next, src } }, stats }
 *
 * แหล่ง: Yahoo quoteSummary `modules=calendarEvents` (crumb flow เดียวกับ fetch-fundamentals — `yahooSession()`)
 *   `next` = วันประกาศงบถัดไปที่ Yahoo บอก (อาจเป็น "ประมาณการ" — `isEarningsDateEstimate` · เราไม่แยกเก็บ)
 *   `last` = `next` ของรอบก่อนที่ผ่านวันไปแล้ว — **ไม่มีแหล่งไหนให้ "วันประกาศครั้งล่าสุด" ตรง ๆ** จึงต้อง
 *            สะสมเองรายสัปดาห์ (`roll`) ⇒ ★ ไฟล์รอบแรก `last` เป็น null ทุกตัวโดยธรรมชาติ preflight ยังไม่ได้อะไร
 *            จนกว่าจะมีงบงวดแรกเดินผ่าน (หลายสัปดาห์) — เป็นดีไซน์ ไม่ใช่บั๊ก
 *
 * preflight ใช้: footer "ข้อมูล ณ" < `last` ⇒ งบออกหลังวันวิเคราะห์ ⇒ mos-sign-flip ยกจาก PREPATCH เป็น
 *   UPDATE-LIGHT (`escalated:'earnings'` · tools/queue/triage.js) · `last` null / ไม่มีไฟล์นี้ ⇒ null =
 *   นโยบายอายุอย่างเดียว (footerAge > STALE_DAYS) — ระบบต้องเดินได้เหมือนเดิมเมื่อปฏิทินหาย
 */
const fs = require('fs');
const path = require('path');
const { yahooSession } = require('./fetch-fundamentals.js');
const { withRetry } = require('./dead-ticker-canary.js');
const { toYahooSymbol } = require('./update-prices.js');
const { readStockMeta } = require('./report-meta.js');

const FILE = path.join(__dirname, '..', 'earnings-calendar.json');
const H = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', accept: 'application/json' };
const REQ_TIMEOUT_MS = 20000;   // undici default ~300 วิ — ยิงเดียวค้างกินงบ job ทั้งก้อน (เหตุผลเดียวกับ update-prices.js)
const RETRY_DELAYS = [1000, 4000];
const DELAY_MS = 300;           // หน่วงระหว่าง call — 908 ตัว ≈ 5 นาทีขึ้นไป
const ABORT_AFTER = 10;         // ล้มติดกันเท่านี้ = session ตาย/โดนบล็อก → หยุดทั้งรอบ (อย่าไล่ backoff จนครบ 908)
const isTH = (ysym) => /\.BK$/i.test(String(ysym));
const isoUTC = (epoch) => new Date(epoch * 1000).toISOString().slice(0, 10);

/** วันประกาศงบถัดไปของ ysym → 'YYYY-MM-DD' | null (ไม่มีวันที่ = null ไม่ใช่ error)
 *  ★ ใช้ `fmt` ก่อน `raw`: `raw` ของ Yahoo เป็นเที่ยงคืน UTC ของวันถัดไปได้ (AAPL raw 1793318400 = 30 ต.ค.
 *    แต่ fmt = 29 ต.ค. ตามเวลาตลาด) ⇒ แปลง epoch ตรง ๆ จะเลื่อนวันไปหนึ่งวันทั้งคลัง
 *  ★ 404 = ไม่รู้จัก ticker → null ทันที ไม่ throw (ไม่งั้น withRetry ยิงซ้ำ + หน่วง 5 วิ ต่อ ticker ที่ตายแล้ว) */
async function fetchNextEarnings(ysym, sess, fetchImpl) {
  const f = fetchImpl || fetch;
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ysym)}` +
    `?modules=calendarEvents&crumb=${encodeURIComponent(sess.crumb)}`;
  const r = await f(url, { headers: { ...H, cookie: sess.cookie }, signal: AbortSignal.timeout(REQ_TIMEOUT_MS) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('quoteSummary HTTP ' + r.status);
  const j = await r.json();
  const res = j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
  const d = res && res.calendarEvents && res.calendarEvents.earnings && res.calendarEvents.earnings.earningsDate;
  const e = Array.isArray(d) ? d[0] : null;
  if (!e) return null;
  if (typeof e.fmt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.fmt)) return e.fmt;
  return Number.isFinite(e.raw) ? isoUTC(e.raw) : null;
}

/** สะสม last จาก next ของรอบก่อน (ส่วนบริสุทธิ์) — `prev.next` ที่ถึง/ผ่านวันนี้แล้ว = งบออกแล้ว กลายเป็น `last`
 *  `next` ใหม่ null ได้ (Yahoo ไม่ให้วันที่รอบนี้) — ไม่ค้างค่าเก่าไว้ เพราะวันที่เก่าที่เลยไปแล้วไม่ใช่ "ถัดไป" */
function roll(prev, next, today) {
  const p = prev || { last: null, next: null };
  const last = p.next && p.next <= today ? p.next : (p.last || null);
  return { last, next: next || null };
}

/** สร้างปฏิทินทั้งคลัง · symbols = [[SYM, ysym], …] (เรียงแล้ว — ลำดับ key ในไฟล์ตามนี้ ให้ diff อ่านรู้เรื่อง)
 *  fetchNext(ysym) → ISO|null (ฉีดได้ = เทส offline) · ล้มติดกัน ABORT_AFTER ครั้ง → throw ทั้งรอบ */
async function build({ symbols, prev, today, fetchNext, delayMs, onProgress }) {
  const out = {
    updatedAt: new Date().toISOString(), symbols: {},
    stats: { total: 0, dated: 0, nodate: 0, failed: 0, th: { total: 0, dated: 0 }, us: { total: 0, dated: 0 } },
  };
  const prevSyms = (prev && prev.symbols) || {};
  let streak = 0, i = 0;
  for (const [sym, ysym] of symbols) {
    const st = out.stats;
    st.total++;
    const g = isTH(ysym) ? st.th : st.us;
    g.total++;
    let next = null;
    try { next = await fetchNext(ysym); streak = 0; }
    catch (e) {
      st.failed++;
      if (++streak >= ABORT_AFTER) throw new Error(`ยิง Yahoo ล้มติดกัน ${streak} ตัว (ล่าสุด ${ysym}: ${e.message}) — หยุดรอบ (session ตาย/โดนบล็อก?) ไม่เขียนไฟล์`);
    }
    out.symbols[sym] = { ...roll(prevSyms[sym], next, today), src: 'yahoo' };
    if (next) { st.dated++; g.dated++; } else st.nodate++;
    if (onProgress) onProgress(++i, st);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return out;
}

/** อ่านปฏิทิน — ไม่มีไฟล์/ไฟล์พัง = { symbols: {} } (ไม่ throw: ระบบต้องเดินได้ด้วยนโยบายอายุอย่างเดียว) */
function load(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file || FILE, 'utf8'));
    return c && c.symbols ? c : { symbols: {} };
  } catch (_) { return { symbols: {} }; }
}

/** [SYM, ysym] ของทุกรายงานใน reports/ (เรียงตามชื่อไฟล์) — currency จาก stock-meta (THB → .BK ผ่าน symbol-map) */
function reportSymbols(dir) {
  const d = dir || path.join(__dirname, '..', 'reports');
  return fs.readdirSync(d).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '')).sort()
    .map((s) => {
      const sm = readStockMeta(fs.readFileSync(path.join(d, s + '.html'), 'utf8'));
      return [s, toYahooSymbol(s, sm && sm.currency)];
    });
}

const argVal = (flag, dflt) => { const i = process.argv.indexOf(flag); return i > 0 && process.argv[i + 1] != null ? process.argv[i + 1] : dflt; };

async function main() {
  const write = process.argv.includes('--write');
  const outFile = argVal('--out', FILE);
  const limit = +argVal('--limit', 0) || 0;
  const delayMs = +argVal('--delay', DELAY_MS);
  if (write && limit) throw new Error('--write คู่กับ --limit ไม่ได้ (ปฏิทินจะไม่ครบคลัง) — ใช้ --out <path> ตอนลองสุ่ม');
  let symbols = reportSymbols();
  if (limit) {   // ตัวอย่างกระจายทั่วตัวอักษร (ไม่ใช่ N ตัวแรก) — ให้ได้ทั้ง TH/US ตอน smoke test
    const step = Math.max(1, Math.floor(symbols.length / limit));
    symbols = symbols.filter((_, i) => i % step === 0).slice(0, limit);
  }
  const sess = await yahooSession();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  console.log(`earnings-calendar: ${symbols.length} symbols · หน่วง ${delayMs} ms · ${today}`);
  const cal = await build({
    symbols, prev: load(outFile), today, delayMs,
    fetchNext: (y) => withRetry(() => fetchNextEarnings(y, sess), { delays: RETRY_DELAYS }),
    // พิมพ์ความคืบหน้า — รอบเต็มกินเวลาหลายนาที ถ้าถูกตัดกลางคันยังเหลือฐานให้ตัดสิน fallback
    onProgress: (i, st) => { if (i % 50 === 0 || i === symbols.length) console.log(`  ${i}/${symbols.length} · มีวันที่ ${st.dated} · ไม่มี ${st.nodate} · ล้ม ${st.failed} · TH ${st.th.dated}/${st.th.total} · US ${st.us.dated}/${st.us.total}`); },
  });
  const s = cal.stats;
  console.log(`earnings-calendar: ${s.dated}/${s.total} มีวันที่ · ไม่มี ${s.nodate} · ล้ม ${s.failed} · TH ${s.th.dated}/${s.th.total} · US ${s.us.dated}/${s.us.total}`);
  if (s.nodate / s.total > 0.2) console.log('⚠ วันที่ครอบคลุม <80% — นโยบายอายุอย่างเดียวยังเป็นหลัก (ดู docs/open-items.md)');
  if (write || outFile !== FILE) {
    fs.writeFileSync(outFile, JSON.stringify(cal, null, 1) + '\n');
    console.log('เขียน ' + outFile);
  }
}

module.exports = { fetchNextEarnings, roll, build, load, reportSymbols, FILE, ABORT_AFTER, RETRY_DELAYS };
if (require.main === module) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
