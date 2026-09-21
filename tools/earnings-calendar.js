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
 *  `next` ที่ส่งเข้ามาเป็น null ได้ = "ถามแล้ว Yahoo ไม่ให้วันที่" ⇒ ล้างของเก่า (วันที่ที่เลยไปแล้วไม่ใช่ "ถัดไป")
 *  ★ กรณี "ถามไม่ได้" (ยิงล้ม) เป็นหน้าที่ของ **ผู้เรียก** ที่ต้องส่ง `prev.next` กลับเข้ามาเอง — ดู build() */
function roll(prev, next, today) {
  const p = prev || { last: null, next: null };
  const last = p.next && p.next <= today ? p.next : (p.last || null);
  return { last, next: next || null };
}

/** สร้างปฏิทินทั้งคลัง · symbols = [[SYM, ysym], …] (เรียงแล้ว — ลำดับ key ในไฟล์ตามนี้ ให้ diff อ่านรู้เรื่อง)
 *  fetchNext(ysym) → ISO|null (ฉีดได้ = เทส offline) · ล้มติดกัน ABORT_AFTER ครั้ง → throw ทั้งรอบ
 *  ★★ แยก "ถามแล้วไม่มี" ออกจาก "ถามไม่ได้" (รีวิว Task 17):
 *     - ยิงล้ม (throw/timeout/เน็ตสะดุด) = **ถามไม่ได้** ⇒ **ยก `prev.next` มาต่อ** ไม่ใช่ลบทิ้ง — `last` เกิดได้ทางเดียว
 *       คือ `next` ที่เก็บไว้เดินผ่านวัน ⇒ ถ้ารอบสุดท้ายก่อนวันประกาศดันล้มแล้วเราล้าง `next` วันนั้นก็หายถาวร
 *       และ escalation ที่ฟีเจอร์นี้มีไว้ผลิตจะไม่เกิดขึ้นเลยแบบเงียบ ๆ · ยัง roll ตามปกติ (next เก่าที่เลยวันแล้ว → last)
 *     - ยิงสำเร็จแต่ไม่มีวันที่ = **คำตอบจริง** ⇒ `next = null` (ล้างของเก่า) และนับเป็น nodate
 *     - ตัวที่ล้มไม่นับใน nodate (มันเป็นข้อผิดพลาดของ transport ไม่ใช่ความครอบคลุมของแหล่ง) ⇒ total = dated + nodate + failed */
async function build({ symbols, prev, today, fetchNext, delayMs, onProgress }) {
  const out = {
    updatedAt: new Date().toISOString(), symbols: {},
    stats: { total: 0, dated: 0, nodate: 0, failed: 0, th: { total: 0, dated: 0, failed: 0 }, us: { total: 0, dated: 0, failed: 0 } },
  };
  const prevSyms = (prev && prev.symbols) || {};
  let streak = 0, i = 0;
  for (const [sym, ysym] of symbols) {
    const st = out.stats;
    st.total++;
    const g = isTH(ysym) ? st.th : st.us;
    g.total++;
    const p = prevSyms[sym];
    let next = null, failed = false;
    try { next = await fetchNext(ysym); streak = 0; }
    catch (e) {
      failed = true;
      next = (p && p.next) || null;   // ★ ถามไม่ได้ = ไม่มีข่าวใหม่ ไม่ใช่ "ไม่มีวันประกาศ" — ของเดิมต้องอยู่ต่อ
      st.failed++; g.failed++;
      if (++streak >= ABORT_AFTER) throw new Error(`ยิง Yahoo ล้มติดกัน ${streak} ตัว (ล่าสุด ${ysym}: ${e.message}) — หยุดรอบ (session ตาย/โดนบล็อก?) ไม่เขียนไฟล์`);
    }
    out.symbols[sym] = { ...roll(p, next, today), src: 'yahoo' };
    if (failed) { /* ไม่นับ dated/nodate — อยู่ใน failed อย่างเดียว */ }
    else if (next) { st.dated++; g.dated++; }
    else st.nodate++;
    if (onProgress) onProgress(++i, st);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return out;
}

/** สัดส่วน "ไม่มีวันที่" ที่ใช้ตัดสิน fallback = nodate / (total − failed) — **ตัวหารไม่รวมตัวที่ยิงไม่สำเร็จ**
 *  เพราะเราวัด "แหล่งให้วันที่ครบไหม" ไม่ใช่ "เน็ตวันนั้นดีไหม" · ถามไม่ได้เลยสักตัว (ตัวหาร 0) = ตัดสินไม่ได้ → 1 (ไม่ผ่าน) */
function nodateRatio(stats) {
  const base = stats.total - stats.failed;
  return base > 0 ? stats.nodate / base : 1;
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


// ───────────────────────── "มีงบใหม่หลังวันที่ footer ไหม" (กฎ UPDATE-LIGHT/FULL · docs/decisions.md §9) ─────────────────────────
// นิยาม: "งบ" = งบรายไตรมาส/รายปีเท่านั้น (8-K/guidance/M&A ไม่นับ — ช่องโหว่ที่รู้แล้ว) · ตัดสินไม่ได้ = null ⇒ triage ถือเป็น FULL
/** เส้นตายส่งงบของ SET — ตารางปรับได้ (ไม่ใช่ค่าตายตัวในโค้ด) · ตรวจกับ set.or.th 22 ก.ย. 69:
 *  https://www.set.or.th/en/listing/listed-company/simplified-regulations/disclosure/periodic-disclosure
 *  - งบไตรมาส (สอบทานแล้ว) ภายใน 45 วันหลังสิ้นไตรมาส · งบประจำปี (ตรวจสอบแล้ว) ภายใน 2 เดือน (ไม่มีงบ Q4) หรือ 3 เดือน (มีงบ Q4)
 *  - งบที่ยังไม่สอบทาน/ตรวจสอบ ส่งได้ภายใน 30 วัน (ทางเลือก) · เส้นตายตรงวันหยุด เลื่อนไปวันทำการถัดไป (ไม่คิดที่นี่)
 *  ใช้ 45/60 = เส้นตายที่เร็วกว่าของแต่ละชนิด (ผิดทางปลอดภัย: เจอเส้นตายเร็ว ⇒ FULL บ่อยขึ้น) · ไตรมาสสิ้น 31 มี.ค./30 มิ.ย./30 ก.ย. = quarterDays · 31 ธ.ค. = annualDays
 *  ★ ข้อจำกัด: บริษัทที่ยื่นก่อนเส้นตายและ footer อยู่ระหว่างวันยื่นกับเส้นตาย จะถูกมองว่า "ยังไม่มีงบใหม่" */
const TH_FILING = { quarterDays: 45, annualDays: 60, quarterEnds: ['03-31', '06-30', '09-30'], annualEnd: '12-31' };
const addDaysISO = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
/** เส้นตายส่งงบ SET ที่ตกในช่วง (fromIso, toIso] — เรียงเก่า→ใหม่ */
function thDeadlinesBetween(fromIso, toIso, table) {
  const t = table || TH_FILING;
  const y0 = +String(fromIso).slice(0, 4) - 1, y1 = +String(toIso).slice(0, 4);
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (const md of t.quarterEnds) out.push(addDaysISO(`${y}-${md}`, t.quarterDays));
    out.push(addDaysISO(`${y}-${t.annualEnd}`, t.annualDays));
  }
  return out.filter((d) => d > fromIso && d <= toIso).sort();
}

const SEC_STATEMENT_FORMS = /^(10-K|10-KT|10-Q|20-F|40-F)$/;   // ฉบับแก้ไข (/A) และ 6-K/8-K ไม่นับ
// ★ SEC fair-access policy: `www.sec.gov` (company_tickers.json) ตอบ 403 ถ้า User-Agent ไม่ประกาศ "ชื่อ + ช่องทางติดต่อ" (Mozilla/5.0 เปล่า ๆ ก็ 403)
//   ส่วน `data.sec.gov` (submissions) รับ UA อะไรก็ได้ ⇒ UA มาจาก env `SEC_USER_AGENT` เท่านั้น (เจ้าของเป็นคนกำหนด — ห้ามฝังค่าใน repo)
//   ไม่ตั้ง env = ห้ามดึงแผนที่ ticker→CIK จาก www.sec.gov (kind 'no-ua') · ดึง submissions ด้วย CIK ที่รู้อยู่แล้วจาก tools/sec-ciks.json ได้ด้วย UA เปล่า ๆ
const SEC_FALLBACK_UA = 'Mozilla/5.0';   // ใช้กับ data.sec.gov เท่านั้น เมื่อไม่มี env และรู้ CIK จากแผนที่ที่ commit แล้ว
const CIKS_FILE = path.join(__dirname, 'sec-ciks.json');   // { "AAPL": "0000320193", … } เฉพาะ ticker US ที่มีรายงาน · สร้างด้วย --sec-refresh-ciks
const secUA = () => (process.env.SEC_USER_AGENT || '').trim() || null;
/** curl -A — ดึงทีละ URL แบบ sync · เทสฉีด fetchText(url, ua) แทนตัวนี้เสมอ (ห้ามยิง network) */
function curlText(url, ua) {
  return require('child_process').execFileSync('curl', ['-sSL', '--fail', '--max-time', '20', '-A', ua || SEC_FALLBACK_UA, url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
/** แผนที่ ticker→CIK ที่ commit ไว้ → object | null (ไม่มีไฟล์/พัง = null · ไม่ throw) */
function loadCiks(file) {
  try { const j = JSON.parse(fs.readFileSync(file || CIKS_FILE, 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; }
  catch (_) { return null; }
}
const pad10 = (n) => String(n).padStart(10, '0');
/** วันยื่นงบล่าสุด (10-K/10-Q/20-F/40-F) จาก SEC submissions → { date: 'YYYY-MM-DD'|null, kind, cik } (ไม่ throw)
 *  kind: null (เจอวัน) · 'no-ua' (ไม่มี env SEC_USER_AGENT และไม่มีแผนที่ CIK ที่ commit ⇒ **ไม่ยิง network เลย**) · 'fetch-failed' (curl/SEC ล้ม/JSON พัง)
 *  · 'no-cik' (ไม่มี ticker ในแผนที่) · '6k-only' (มี 6-K แต่ไม่พบฟอร์มงบ = FPI) · 'no-statement-forms' (มี filing แต่ไม่มีฟอร์มงบเลย)
 *  opts: fetchText(url, ua) → string (sync) · cache = Map · ua (override env — เทส) · ciks (override ไฟล์: object | null = ไม่มีแผนที่) */
function secLookup(sym, opts) {
  const o = opts || {};
  const fetchText = o.fetchText || curlText;
  const cache = o.cache || new Map();
  const ua = o.ua !== undefined ? o.ua : secUA();
  const key = String(sym).toUpperCase();
  try {
    const ciks = o.ciks !== undefined ? o.ciks : loadCiks();
    let cik = null;
    if (ciks) {
      cik = ciks[key] || ciks[key.replace(/\./g, '-')] || null;   // มีแผนที่ที่ commit = ใช้เป็นหลัก ไม่ยิง network ขอแผนที่
      if (!cik) return { date: null, kind: 'no-cik', cik: null };
    } else {
      if (!ua) return { date: null, kind: 'no-ua', cik: null };   // www.sec.gov ต้องมี UA ที่ประกาศตัวตน — ไม่มี = ไม่ลอง (ไม่ใช่ 403)
      if (!cache.has('__tickers')) {
        const j = JSON.parse(fetchText('https://www.sec.gov/files/company_tickers.json', ua));
        const m = {};
        for (const e of Object.values(j)) if (e && e.ticker) m[String(e.ticker).toUpperCase()] = e.cik_str;
        cache.set('__tickers', m);
      }
      cik = cache.get('__tickers')[key.replace(/\./g, '-')];
      if (!cik) return { date: null, kind: 'no-cik', cik: null };
    }
    const sub = JSON.parse(fetchText(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`, ua || SEC_FALLBACK_UA));
    const r = sub && sub.filings && sub.filings.recent;
    if (!r || !Array.isArray(r.form) || !Array.isArray(r.filingDate)) return { date: null, kind: 'fetch-failed', cik: pad10(cik) };
    let best = null, has6k = false;
    r.form.forEach((f, i) => {
      if (f === '6-K') has6k = true;
      const d = r.filingDate[i];
      if (SEC_STATEMENT_FORMS.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(d) && (!best || d > best)) best = d;
    });
    return best ? { date: best, kind: null, cik: pad10(cik) } : { date: null, kind: has6k ? '6k-only' : 'no-statement-forms', cik: pad10(cik) };
  } catch (_) { return { date: null, kind: 'fetch-failed', cik: null }; }
}
/** เหมือน secLookup แต่คืนแค่วัน (เข้ากันได้กับผู้เรียกเดิม) */
const secLastStatement = (sym, opts) => secLookup(sym, opts).date;

/** --sec-refresh-ciks: ดึง company_tickers.json (ต้อง SEC_USER_AGENT) แล้วเขียน tools/sec-ciks.json เฉพาะ ticker US ของเรา
 *  ดึงไม่ได้/ไม่มี UA = ไม่แตะไฟล์เดิม คืน { ok:false, why } · opts: fetchText, ua, file, symbols (ทั้งหมดที่มีรายงาน = [[SYM, ysym]]) */
function secRefreshCiks(opts) {
  const o = opts || {};
  const ua = o.ua !== undefined ? o.ua : secUA();
  const file = o.file || CIKS_FILE;
  if (!ua) return { ok: false, why: 'no-ua — ตั้ง env SEC_USER_AGENT (ชื่อ + ช่องทางติดต่อ ที่เจ้าของกำหนด) ก่อน · ไฟล์เดิมไม่ถูกแตะ' };
  let tickers;
  try {
    const j = JSON.parse((o.fetchText || curlText)('https://www.sec.gov/files/company_tickers.json', ua));
    tickers = {};
    for (const e of Object.values(j)) if (e && e.ticker) tickers[String(e.ticker).toUpperCase()] = e.cik_str;
    if (!Object.keys(tickers).length) throw new Error('company_tickers.json ว่าง');
  } catch (e) { return { ok: false, why: `fetch-failed — ${e.message} · ไฟล์เดิมไม่ถูกแตะ` }; }
  const syms = (o.symbols || reportSymbols()).filter(([, y]) => !isTH(y)).map(([s]) => s).sort();
  const out = {}, missing = [];
  for (const s of syms) {
    const c = tickers[s.toUpperCase()] || tickers[s.toUpperCase().replace(/\./g, '-')];
    if (c) out[s] = pad10(c); else missing.push(s);
  }
  // ผลตัดแล้วว่าง (map ของ SEC ไม่ว่างแต่ไม่ตรงสักตัว เช่นรูปแบบ JSON เปลี่ยน) = เหมือน map ว่าง: ไม่เขียน — เขียน `{}` จะทำให้ loadCiks ถือว่าทุก ticker US เป็น no-cik ตลอดไปโดยไม่มีอะไรฟ้อง
  if (!Object.keys(out).length) return { ok: false, why: `ไม่มี ticker ของเราตรงกับ company_tickers.json สักตัว (${syms.length} ticker US ที่มีรายงาน · SEC ${Object.keys(tickers).length}) — รูปแบบข้อมูลเปลี่ยน? · ไฟล์เดิมไม่ถูกแตะ` };
  const tmp = file + '.tmp';   // เขียนแล้ว rename ทับ (atomic) — ล้มกลางคันไม่ทิ้งไฟล์ครึ่งเดียว
  try { fs.writeFileSync(tmp, JSON.stringify(out, null, 1) + '\n'); fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch (_) { /* ไม่มี tmp */ } return { ok: false, why: `เขียนไฟล์ไม่สำเร็จ — ${e.message} · ไฟล์เดิมไม่ถูกแตะ` }; }
  return { ok: true, n: Object.keys(out).length, missing, file };
}

/** --sec-probe: พิมพ์ต่อ ticker — CIK · วันยื่นงบล่าสุด · kind (ok|6k-only|no-cik|fetch-failed|no-ua|no-statement-forms) → string[] */
function secProbe(syms, opts) {
  const cache = new Map();
  return syms.map((s) => {
    const r = secLookup(s, { ...(opts || {}), cache });
    return `${String(s).toUpperCase().padEnd(8)} cik=${r.cik || '-'} latest=${r.date || '-'} kind=${r.date ? 'ok' : r.kind}`;
  });
}

/**
 * มีงบไตรมาส/ปีใหม่หลังวันที่ footer ไหม (ส่วนบริสุทธิ์ — ไม่แตะดิสก์/network เอง)
 * → { after: true|false|null, source, last, detail } — null = ตัดสินไม่ได้ (⇒ FULL)
 * ลำดับ: ปฏิทิน Yahoo (`last`) → [TH] เส้นตาย SET → [US] SEC submissions (ฉีด opts.sec ได้เท่านั้น) → null
 * TH: after=true ถ้าปฏิทินบอก หรือมีเส้นตายตกระหว่าง footer..วันนี้ · ไม่มีทั้งสอง = false (เส้นตายเป็นกฎหมาย ตัดสินได้เสมอ)
 * opts: { footerIso, today, th, cal:{symbols}, sec:(sym)→'YYYY-MM-DD'|null, table }
 */
function statementAfter(sym, opts) {
  const o = opts || {};
  if (!o.footerIso) return { after: null, source: null, last: null, kind: 'footer-unreadable', detail: 'footer-unreadable — อ่านวันที่ footer ไม่ได้' };
  const e = ((o.cal && o.cal.symbols) || {})[sym];
  const calLast = e && e.last ? e.last : null;
  const calAfter = calLast ? o.footerIso < calLast : null;
  if (o.th) {
    const dl = thDeadlinesBetween(o.footerIso, o.today, o.table);
    if (calAfter) return { after: true, source: 'calendar', last: calLast, detail: `ปฏิทิน: ประกาศงบ ${calLast} หลัง footer ${o.footerIso}` };
    if (dl.length) return { after: true, source: 'set-deadline', last: dl[dl.length - 1], detail: `เส้นตายส่งงบ SET ${dl.join(',')} ตกหลัง footer ${o.footerIso}` };
    return { after: false, source: calLast ? 'calendar+set-deadline' : 'set-deadline', last: calLast, detail: `ไม่มีเส้นตายส่งงบ SET ระหว่าง ${o.footerIso}..${o.today}${calLast ? ` · ปฏิทิน last ${calLast}` : ''}` };
  }
  if (calLast) return { after: calAfter, source: 'calendar', last: calLast, detail: `ปฏิทิน: ประกาศงบ ${calLast} ${calAfter ? 'หลัง' : 'ก่อน/ตรงกับ'} footer ${o.footerIso}` };
  const raw = o.sec ? o.sec(sym) : null;   // string (วัน) | { date, kind } | null
  const s = raw && typeof raw === 'object' ? raw.date : raw;
  if (s) return { after: o.footerIso < s, source: 'sec', last: s, detail: `SEC: 10-K/10-Q ล่าสุดยื่น ${s} ${o.footerIso < s ? 'หลัง' : 'ก่อน/ตรงกับ'} footer ${o.footerIso}` };
  const kind = !o.sec ? 'no-source' : (raw && typeof raw === 'object' && raw.kind) || 'no-cik';
  return { after: null, source: null, last: null, kind, detail: `${kind} — ไม่รู้วันงบล่าสุด (ไม่มีวันที่ในปฏิทิน${o.sec ? ' · SEC ไม่มีข้อมูล' : ' · ไม่ได้ใช้ SEC'})` };
}

const argVal = (flag, dflt) => { const i = process.argv.indexOf(flag); return i > 0 && process.argv[i + 1] != null ? process.argv[i + 1] : dflt; };

async function main() {
  if (process.argv.includes('--sec-refresh-ciks')) {
    const r = secRefreshCiks();
    if (!r.ok) { console.error('✗ sec-refresh-ciks: ' + r.why); process.exit(1); }
    console.log(`sec-refresh-ciks: เขียน ${r.file} · ${r.n} ticker US${r.missing.length ? ` · ไม่พบ CIK ${r.missing.length}: ${r.missing.slice(0, 15).join(' ')}${r.missing.length > 15 ? ' …' : ''}` : ''}`);
    return;
  }
  if (process.argv.includes('--sec-probe')) {
    const syms = process.argv.slice(process.argv.indexOf('--sec-probe') + 1).filter((x) => !x.startsWith('--'));
    if (!syms.length) throw new Error('--sec-probe ต้องมี ticker อย่างน้อยหนึ่งตัว');
    for (const l of secProbe(syms)) console.log(l);
    return;
  }
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
  const r = nodateRatio(s);
  console.log(`earnings-calendar: ${s.dated}/${s.total} มีวันที่ · ไม่มี ${s.nodate} · ล้ม ${s.failed} · TH ${s.th.dated}/${s.th.total} · US ${s.us.dated}/${s.us.total}`);
  console.log(`เกณฑ์ fallback: ไม่มีวันที่ / (ทั้งหมด − ยิงล้ม) = ${s.nodate}/${s.total - s.failed} = ${(r * 100).toFixed(1)}% (เกิน 20% = ไม่เปิดใช้ปฏิทิน)`);
  if (r > 0.2) console.log('⚠ วันที่ครอบคลุม <80% — นโยบายอายุอย่างเดียวยังเป็นหลัก (ดู docs/open-items.md #24)');
  if (write || outFile !== FILE) {
    fs.writeFileSync(outFile, JSON.stringify(cal, null, 1) + '\n');
    console.log('เขียน ' + outFile);
  }
}

module.exports = { fetchNextEarnings, roll, build, nodateRatio, load, reportSymbols, FILE, ABORT_AFTER, RETRY_DELAYS, TH_FILING, thDeadlinesBetween, secLookup, secLastStatement, secRefreshCiks, secProbe, loadCiks, CIKS_FILE, statementAfter };
if (require.main === module) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
