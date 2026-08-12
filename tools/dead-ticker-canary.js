#!/usr/bin/env node
'use strict';
/**
 * dead-ticker-canary.js — ตรวจว่าทุก symbol ใน reports/ ยัง "มีตัวตนบนกระดาน" อยู่จริง
 *
 * ทำไมต้องมี: Yahoo ไม่ 404 เมื่อหุ้นตาย — มัน serve ราคาปิดวันสุดท้ายค้างไปเรื่อย ๆ ⇒ cron ราคา
 * เห็น drift 0% ⇒ ไม่มี flag (เคสจริง 8 ส.ค. 2569: EA ปิดดีล take-private, BPP ควบบริษัทกับ BANPU)
 * TradingView scanner ตรงข้าม: ticker ที่หมดสภาพ **หายจากผลลัพธ์** (ไม่ค้างราคา) → ใช้เป็นตัวจับ
 * แหล่งที่สอง ที่ล้มแบบดัง ไม่ล้มแบบเงียบ · ตัว detectStaleQuotes ใน update-prices.js จับจาก
 * timestamp ค้าง (รายวัน ฟรี) — สองสัญญาณนี้เสริมกัน ตัวนี้ยืนยันด้วยแหล่งอิสระรายสัปดาห์
 *
 * ใช้:  node tools/dead-ticker-canary.js [--write] [SYMBOL ...]
 *   ไม่มี --write = dry-run (ไม่แตะไฟล์) · --write = อัปเดต price-flags.json + cache ticker
 *   flag reason `not-on-exchange` → triage = **ยืนยันด้วยมือแล้วลบรายงาน** ไม่ใช่ re-analyze
 *   (ดู .claude/skills/stock-analyzer/SKILL.md STEP 0 · docs/price-refresh.md)
 *
 * ข้อจำกัดที่ตั้งใจ: endpoint นี้ไม่มี doc ทางการ (ความเสี่ยงระดับเดียวกับ Yahoo chart API ที่ cron
 * ใช้อยู่แล้ว) · ยิงล้มทั้งรอบ = ไม่เขียนอะไรเลย ไม่เดาว่า "หาย = ตาย" (กัน mass-flag ผิดเวลา
 * TradingView บล็อก IP ของ Actions) · **ไม่ทำ stale cache** ทั้งที่ต้นทางล่มได้ — canary วัด
 * "ยังมีตัวตนไหม" การเสิร์ฟผลเก่าตอนต้นทางล่มคือ false negative ที่ห้ามเกิดกับเครื่องมือประเภทนี้
 */
const fs = require('fs');
const path = require('path');

const REPORTS = path.join(__dirname, '..', 'reports');
const FLAGS = path.join(__dirname, '..', 'price-flags.json');
const CACHE = path.join(__dirname, 'tv-tickers.json');
const SCAN_URL = 'https://scanner.tradingview.com/global/scan';
const CHUNK = 1200;          // ต่อ 1 request (เพดาน scanner ~2000 — เผื่อไว้)
const REQ_TIMEOUT_MS = 20000; // undici default ~300 วิ — ยิงเดียวค้างกินงบ job (15 นาที) ไปหนึ่งในสาม
const RETRY_DELAYS = [1000, 4000]; // ลองใหม่ 2 ครั้งแบบ backoff ก่อนยอมแพ้ (ค่าเดียวกับที่ tradingview-mcp ใช้)
const MIN_ALIVE_RATIO = 0.8; // ถ้า sweep เต็มเจอ "เป็น" < 80% ของที่ถาม = น่าจะโดนบล็อก/โครงเปลี่ยน → ยกเลิกรอบ
const GUARD_MIN_PROBES = 20; // ต่ำกว่านี้ อัตราส่วนไม่มีความหมายทางสถิติ → ไม่ใช้ยาม

// exchange ที่หุ้น US ในรีโปนี้เคยอยู่จริง (วัดจากการ resolve 579 ตัว 8 ส.ค. 2569):
// NASDAQ/NYSE ส่วนใหญ่ · AMEX บางตัว · OTC = ADR ญี่ปุ่น/ยุโรป (FANUY, ABBNY, KYCCF) · CBOE:CBOE
const US_EXCHANGES = ['NASDAQ', 'NYSE', 'AMEX', 'OTC', 'CBOE'];

const { entryFor } = require('./symbol-map.js');
const { readStockMeta } = require('./report-meta.js');

// ไฟล์ไม่มี = รอบแรก → fallback · **มีไฟล์แต่ parse ไม่ผ่าน ต้องแยกตามว่าไฟล์นั้นสร้างใหม่ได้ไหม**
// (ตัวอ่านนี้ใช้กับสองไฟล์ที่ราคาของการเดาผิดต่างกันคนละชั้น จึงไม่มีนโยบายเดียวที่ถูกทั้งคู่):
//   cache (tv-tickers.json) = ผลลัพธ์ที่รอบนี้ยิงใหม่ได้เอง (alive ทุกตัวเขียนกลับอยู่แล้ว) → เตือนแล้วไปต่อ
//     — ดับ canary ทั้งสัปดาห์เพราะ cache เสียคือเสียการตรวจโดยไม่จำเป็น
//   flags (price-flags.json) = คิวสะสมที่สร้างใหม่จากศูนย์ไม่ได้ → คืน [] เท่ากับให้ mergeDeadFlags
//     ทิ้งคิวทั้งใบแล้วเขียนทับตอน --write (รวม not-on-exchange ที่ถอนได้ 3 ทางเท่านั้น) ⇒ ล้มทั้งรอบดีกว่า
// default = เข้มไว้ก่อน: ไฟล์ใหม่ที่มาใช้ตัวอ่านนี้ต้อง "เลือก" ที่จะยอมเสียข้อมูล ไม่ใช่ได้ฟรีเพราะลืมคิด
const loadJson = (p, fallback, { rebuildable = false } = {}) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return fallback;
    if (!rebuildable) throw new Error(`อ่าน ${p} ไม่ได้ (${e.message}) — ไฟล์เสีย/เขียนค้าง ยกเลิกรอบนี้ ไม่เขียนทับคิวด้วยของว่าง`);
    console.log(`⚠ ${p} เสีย (${e.message}) — สร้างใหม่จากผลรอบนี้`);
    return fallback;
  }
};

// เขียน state file แบบ atomic: temp ในโฟลเดอร์เดียวกันแล้ว rename ทับ (rename ข้าม filesystem ไม่ atomic
// จึงต้องเป็น dir เดียวกัน · ใส่ pid กันสองรอบที่รันพร้อมกันเขียน temp ใบเดียวกันแล้ว rename ของครึ่งใบทับ)
// เขียนตรง ๆ แล้วถูกตัดกลางคัน = เหลือ JSON ครึ่งใบ ซึ่งเป็น input ที่ทำให้ loadJson ล้มทั้งรอบถัดไปพอดี
function writeJsonAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** ticker ที่ resolve ได้รอบก่อน (tools/tv-tickers.json) — cron รายวันก็ใช้ร่วม ไม่ต้องยิงทุกกระดานซ้ำ */
const loadTickerCache = () => loadJson(CACHE, {}, { rebuildable: true });

// ---------- pure helpers (ทดสอบใน test/dead-ticker-test.js) ----------

// ชื่อฐานที่จะยิง TradingView จาก entry ของ symbol-map · สัญญาของไฟล์นั้น (ดู `_readme`) คือ
// **Yahoo override** — `sa` เป็นฟิลด์เสริมของ stockanalysis ที่ไม่มีอะไรบังคับให้ใส่ ⇒ entry ที่ใส่
// แค่ `{"yahoo": "NEWCO.BK"}` ถูกต้องตามสัญญาทุกประการ แต่เดิมจะทำให้ตัวนี้กลับไปยิงชื่อไฟล์เดิม
// เงียบ ๆ → ไม่เจอ → flag not-on-exchange ที่ triage คือ "ลบรายงาน" บนหุ้นที่แค่เปลี่ยนชื่อ
// ⇒ ลำดับ: `tv` (override ตรงตัวถ้าวันหนึ่ง TradingView ใช้ชื่อต่างจากทั้งสองแหล่ง) → `sa` →
//    `yahoo` ถอด suffix ตลาด (BKIH.BK → BKIH) → ชื่อไฟล์
function tvBaseName(symbol, entry = {}) {
  const fromYahoo = entry.yahoo ? String(entry.yahoo).replace(/\.[A-Za-z]+$/, '') : null;
  return String(entry.tv || entry.sa || fromYahoo || symbol).toUpperCase();
}

// ชื่อ ticker ที่ TradingView ใช้ ≠ ชื่อไฟล์รายงานได้ 3 แบบ:
//   1. บริษัทเปลี่ยนชื่อ/ticker → tools/symbol-map.json (BKI→BKIH, STEC→STECON, LANC→MZTI)
//   2. หุ้นสองคลาส: ไฟล์ใช้ขีด (BRK-B) แต่ TradingView ใช้จุด (BRK.B)
//   3. ไม่รู้ว่าอยู่กระดานไหน → ยิงทุก exchange ที่เป็นไปได้ ตัวไหนตอบมาถือว่าอยู่กระดานนั้น
function tvCandidates(symbol, currency, opts = {}) {
  const base = tvBaseName(symbol, entryFor(symbol));
  const names = base.includes('-') ? [base.replace(/-/g, '.'), base] : [base];
  const out = [];
  if (opts.cached) out.push(String(opts.cached).toUpperCase());   // ที่ resolve ได้รอบก่อน — ถามก่อนเสมอ
  if (currency === 'THB') for (const n of names) out.push(`SET:${n}`);
  else for (const ex of US_EXCHANGES) for (const n of names) out.push(`${ex}:${n}`);
  return [...new Set(out)];
}

// { totalCount, data: [{ s: 'NASDAQ:NVDA', d: [223.96, 'USD'] }] } → Map ticker → { price, currency }
function parseRows(json) {
  const rows = new Map();
  for (const r of (json && json.data) || []) {
    if (!r || !r.s) continue;
    rows.set(String(r.s).toUpperCase(), { price: (r.d || [])[0], currency: (r.d || [])[1] });
  }
  return rows;
}

// จับคู่ผลลัพธ์กลับเป็น symbol → ticker ที่ยังมีตัวตน · ตัวที่ไม่มี candidate ไหนตอบ = ต้องสงสัย
function classify(probes, rows) {
  const alive = new Map(), dead = [];
  for (const p of probes) {
    const hit = p.candidates.find((c) => rows.has(c));
    if (hit) alive.set(p.symbol, { ticker: hit, ...rows.get(hit) });
    else dead.push(p);
  }
  return { alive, dead };
}

// flag ของ canary นี้ merge แบบ "เติม/ทับตัวที่ตาย + ล้างของตัวที่ฟื้น" — ห้ามใช้ mergeFlags ของ
// update-prices.js เพราะอันนั้นถือว่า symbol ที่ประมวลแล้วไม่มี flag = เคลียร์ ⇒ จะลบ flag drift
// ของหุ้นที่ยังเทรดอยู่ทิ้งหมด (canary นี้ไม่รู้เรื่อง drift เลย)
// ยามกัน mass-flag เวลา TradingView บล็อก IP ของ Actions / เปลี่ยนโครง response
// ใช้เฉพาะ sweep เต็มที่ตัวอย่างมากพอ — รันเจาะจง (`… EA BPP`) ผู้ใช้ตั้งใจถามตัวนั้นอยู่แล้ว
// "ตายทั้ง 2 ตัวที่ถาม" คือคำตอบที่ถูก ไม่ใช่สัญญาณว่าโดนบล็อก (ยามเดิมเตะ debug run ทิ้ง)
function shouldAbort({ onlyMode, probed, aliveCount }) {
  if (onlyMode || probed < GUARD_MIN_PROBES) return false;
  return aliveCount / probed < MIN_ALIVE_RATIO;
}

function mergeDeadFlags(prev, dead, aliveSymbols, today) {
  const by = new Map((prev || []).map((f) => [f.symbol, f]));
  for (const sym of aliveSymbols) {
    const old = by.get(sym);
    if (old && old.reason === 'not-on-exchange') by.delete(sym);  // เคยสงสัย แต่กลับมาแล้ว → ถอน
  }
  for (const d of dead) {
    const old = by.get(d.symbol);
    by.set(d.symbol, { ...d, flaggedAt: old && old.reason === d.reason ? old.flaggedAt : today });
  }
  return [...by.values()].sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
}

// ---------- io ----------
const readMeta = (file) => readStockMeta(fs.readFileSync(path.join(REPORTS, file), 'utf8'));

// scanner สะอึกเป็นช่วง ๆ (~30-90 วิ) แล้วคืน body ว่าง → JSON.parse ระเบิด · ของเดิมยิงครั้งเดียว
// แล้วโยนทิ้ง = เสีย canary ไปทั้งสัปดาห์เพราะสะดุดชั่วขณะ (รันสัปดาห์ละครั้ง ไม่มีรอบถัดไปให้แก้ตัว)
// ลองใหม่แบบ backoff ก่อน — ไม่ใส่ jitter เพราะ canary ยิงทีละ chunk ตามลำดับ ไม่มี caller ขนาน
async function withRetry(fn, { delays = RETRY_DELAYS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last;
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i >= delays.length) throw last;
      console.log(`· ยิงไม่ผ่าน (${e.message}) — ลองใหม่ใน ${delays[i] / 1000} วิ [${i + 1}/${delays.length}]`);
      await sleep(delays[i]);
    }
  }
}

// deps = ช่องฉีดของ test เท่านั้น (offline) — โปรดักชันใช้ fetch/หน่วงจริง
async function scan(tickers, deps = {}) {
  const doFetch = deps.fetch || fetch;
  return withRetry(async () => {
    const res = await doFetch(SCAN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        origin: 'https://www.tradingview.com',
      },
      body: JSON.stringify({ symbols: { tickers }, columns: ['close', 'currency'], range: [0, tickers.length] }),
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.trim()) throw new Error('body ว่าง (scanner สะอึกชั่วคราว)');
    let json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error(`JSON เสีย: ${text.slice(0, 60)}`); }
    return parseRows(json);
  }, deps);
}

// ---------- main ----------
async function main() {
  const WRITE = process.argv.includes('--write');
  const ONLY = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--'))
    .map((s) => s.replace(/\.html$/i, '').toUpperCase()));

  const cache = loadTickerCache();
  const files = fs.readdirSync(REPORTS).filter((x) => /\.html$/i.test(x)).sort();
  const probes = [];
  for (const f of files) {
    const symbol = f.replace(/\.html$/i, '');
    if (ONLY.size && !ONLY.has(symbol.toUpperCase())) continue;
    const meta = readMeta(f);
    if (!meta) { console.log(`⚠ ${symbol} — ไม่มี stock-meta ข้าม (gate จับเองอยู่แล้ว)`); continue; }
    probes.push({
      symbol, currency: meta.currency, reportPrice: meta.price != null ? meta.price : null,
      candidates: tvCandidates(symbol, meta.currency, { cached: cache[symbol.toUpperCase()] }),
    });
  }
  if (!probes.length) { console.log('ไม่มีรายงานให้ตรวจ'); return; }

  // รอบ 1: ถาม ticker ที่น่าจะถูกที่สุดตัวเดียวต่อ symbol (cache → ไม่มี cache ใช้ตัวแรกของ candidates)
  // รอบ 2: เฉพาะตัวที่ยังไม่เจอ ค่อยยิง candidate ที่เหลือทั้งหมด — กันเดา "ตาย" เพราะย้ายกระดาน
  const rows = new Map();
  const ask = async (list, label) => {
    for (let i = 0; i < list.length; i += CHUNK) {
      const part = list.slice(i, i + CHUNK);
      const got = await scan(part);
      for (const [k, v] of got) rows.set(k, v);
      console.log(`· ${label}: ถาม ${part.length} ticker → เจอ ${got.size}`);
    }
  };
  await ask(probes.map((p) => p.candidates[0]), 'รอบ 1');
  const round1 = classify(probes, rows);
  const retry = round1.dead.flatMap((p) => p.candidates.slice(1));
  if (retry.length) await ask([...new Set(retry)], 'รอบ 2 (ยิงทุกกระดาน)');

  const { alive, dead } = classify(probes, rows);
  for (const p of dead) console.log(`☠ ${p.symbol.padEnd(10)} ไม่พบบนกระดานใดเลย (ถาม ${p.candidates.length}: ${p.candidates.join(', ')})`);

  // ยาม: "เป็น" น้อยผิดปกติใน sweep เต็ม = โดนบล็อก/โครงเปลี่ยน ไม่ใช่หุ้นตายพร้อมกันทั้งรีโป
  if (shouldAbort({ onlyMode: ONLY.size > 0, probed: probes.length, aliveCount: alive.size })) {
    console.error(`✗ เจอ alive แค่ ${alive.size}/${probes.length} (${(alive.size / probes.length * 100).toFixed(0)}%) — น่าจะโดนบล็อกหรือ response เปลี่ยนโครง ยกเลิกรอบนี้ ไม่เขียน flag`);
    process.exit(2);
  }

  for (const [sym, hit] of alive) cache[sym.toUpperCase()] = hit.ticker;

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD เวลาไทย
  const newFlags = dead.map((p) => ({
    symbol: p.symbol, reason: 'not-on-exchange', reportPrice: p.reportPrice,
    marketPrice: null, diffPct: null, probed: p.candidates.length,
  }));
  // flag ของรายงานที่ถูกลบไปแล้ว (= ปลายทางของ triage not-on-exchange) ต้องตัดทิ้งเหมือนที่
  // update-prices.js ทำ — mergeDeadFlags พา flag เดิมมาทุกตัวโดยไม่รู้ว่าไฟล์ยังอยู่ไหม ⇒ ถ้ารัน
  // canary หลังลบรายงานแต่ก่อน cron รอบถัดไป flag ที่เคลียร์ไปแล้วจะถูก commit กลับเข้าคิว
  const reportExists = new Set(files.map((f) => f.replace(/\.html$/i, '').toUpperCase()));
  const flags = mergeDeadFlags(loadJson(FLAGS, []), newFlags, [...alive.keys()], today)
    .filter((f) => reportExists.has(String(f.symbol).toUpperCase()));

  if (WRITE) {
    writeJsonAtomic(FLAGS, JSON.stringify(flags, null, 2) + '\n');
    cache._readme = 'ticker ที่ TradingView ใช้จริงต่อ symbol — dead-ticker-canary.js เขียนเอง (cache กันยิงหลายกระดานซ้ำ) ห้ามแก้มือ';
    writeJsonAtomic(CACHE, JSON.stringify(cache, null, 2) + '\n');
  }

  const line = `${WRITE ? 'เขียนแล้ว' : '[dry-run]'} ตรวจ ${probes.length} · อยู่บนกระดาน ${alive.size} · ต้องสงสัย ${dead.length}`;
  console.log('\n' + line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    let md = `## Dead-ticker canary\n${line}\n`;
    if (dead.length) {
      md += `\n### ☠ ไม่พบบนกระดาน (${dead.length}) — ยืนยันด้วยมือก่อนลบรายงาน\n| Symbol | สกุลเงิน | ราคาในรายงาน | ticker ที่ถาม |\n|---|---|---|---|\n`;
      for (const p of dead) md += `| ${p.symbol} | ${p.currency} | ${p.reportPrice != null ? p.reportPrice : '-'} | ${p.candidates.join(' · ')} |\n`;
      md += `\nflag \`not-on-exchange\` ลง \`price-flags.json\` แล้ว — triage: ยืนยันจากแหล่งปฐมภูมิ (SEC Form 25 / ประกาศตลาด) แล้ว**ลบรายงาน** ไม่ใช่ re-analyze\n`;
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  }
  if (!WRITE) console.log('ใส่ --write เพื่อเขียน price-flags.json + cache');
}

module.exports = { tvBaseName, tvCandidates, parseRows, classify, mergeDeadFlags, shouldAbort, scan, withRetry, loadTickerCache };

if (require.main === module) main().catch((e) => { console.error(`✗ canary ล้ม: ${e.message}`); process.exit(1); });
