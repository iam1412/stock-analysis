#!/usr/bin/env node
'use strict';
/**
 * median-multiples.js — ตัวคูณมัธยฐานย้อนหลังของหุ้นตัวเอง (CLAUDE.md §8 ชั้น 0.4b · 0.4e)
 *
 * ทำไมต้องมี: worker ที่ไม่มีมัธยฐานย้อนหลังจะ "ประมาณเอง" แล้วลงเอยที่ตัวคูณ **ปัจจุบัน**
 * ⇒ ขา FV คืนราคาตลาดกลับมาโดยโครงสร้าง = สมอตายวนกลับ (W18) · วัดจริง 9 ก.ย. 2569 เคส ODFL:
 * "P/E เป้าหมาย ~36x — ใกล้เคียง P/E ปัจจุบัน" ทั้งที่ปัจจุบัน 36.0x พอดี ⇒ ขานั้นห่างราคา 0.1%
 * คำเตือนเปล่า ๆ ใน prompt ไม่พอ — ต้อง **ส่งตัวเลขที่วัดจริงไปให้** (บทเรียนเดียวกับ prep-stock)
 *
 * นิยาม (ห้ามเปลี่ยนโดยไม่แก้เอกสาร):
 *   ตัวคูณของ FY หนึ่ง = ราคาปิด**เฉลี่ย**ตลอดหน้าต่าง 12 เดือนที่จบที่วันสิ้นงวดนั้น ÷ EPS(diluted) ของ FY นั้น
 *   ★ ต้องเป็นราคาเฉลี่ยของงวด **ไม่ใช่ราคา spot วันนี้** — spot ÷ EPS ย้อนหลัง = ตัวคูณปัจจุบัน ไม่ใช่ประวัติ
 *   ★ หน้าต่างผูกกับวันสิ้นงวดจริงของบริษัท (datekey) ไม่ใช่ปีปฏิทิน — บริษัทที่ FY ไม่ตรงปฏิทิน
 *     (LULU สิ้น ม.ค. · ODFL สิ้น ธ.ค.) ถ้าใช้ปีปฏิทินจะจับคู่ราคากับกำไรคนละงวด
 *   ★ ข้าม FY ที่ EPS ≤ 0 — P/E ติดลบไม่มีความหมาย (§0.4b เคส PAAS: มัธยฐาน 5.1x จากปีขาดทุน 2/5 ปี)
 *
 * ใช้:
 *   node tools/median-multiples.js ODFL LULU EXPE
 *   node tools/median-multiples.js SCC --th            # หุ้นไทย (stockanalysis.com/quote/bkk/<SYM>)
 *   node tools/median-multiples.js UMC:2303.TW         # ADR: งบสกุลท้องถิ่น → ต้องใช้ราคากระดานท้องถิ่น
 *
 * ★ ADR/หุ้นสองกระดาน: งบของ SA เป็นสกุลท้องถิ่น (UMC = NT$) แต่ราคา ADR เป็น USD และ 1 ADR = N หุ้น
 *   ⇒ ต้องระบุ `SYM:<yahoo ticker กระดานท้องถิ่น>` ไม่งั้นได้ตัวคูณผสมสองฐาน (เคส UMC 9 ก.ย. 69:
 *   ผสมฐานได้ 20.8x · ฐาน NT$ ที่ถูกคือ 10.5x)
 */
const { fetchFinPage, finRow } = require('./fetch-fundamentals.js');

const MIN_POINTS = 3;          // < 3 จุด = ประวัติสั้นเกินสรุปมัธยฐาน (CRDO/GWRE/PATH 9 ก.ย. 69)
const YH = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };

const med = (a) => { const s = [...a].sort((x, y) => x - y); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const asNum = (v) => (typeof v === 'number' && isFinite(v) ? v : (v && typeof v === 'object' && isFinite(+v.value) ? +v.value : null));

// ราคาปิดรายเดือน 8 ปี — ต้องยาวกว่าหน้าต่างงบ (SA ให้ ~6 FY) เผื่อหน้าต่างแรกกินเดือนก่อนหน้า
async function monthlyCloses(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=8y&interval=1mo`;
  const r = await fetch(url, { headers: YH });
  if (!r.ok) throw new Error(`Yahoo chart HTTP ${r.status} (${ticker})`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(`Yahoo ไม่คืนข้อมูลราคา (${ticker})`);
  const ts = res.timestamp || [], cl = res.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) if (typeof cl[i] === 'number' && isFinite(cl[i])) out.push({ t: ts[i] * 1000, c: cl[i] });
  if (out.length < 12) throw new Error(`ราคารายเดือนสั้นเกินไป (${out.length} จุด · ${ticker})`);
  return out;
}

// ราคาเฉลี่ยของหน้าต่าง 12 เดือนที่จบที่ end (ms)
function avgWindow(closes, end) {
  const start = end - 365 * 24 * 3600 * 1000;
  const win = closes.filter((p) => p.t > start && p.t <= end);
  return win.length >= 6 ? { avg: win.reduce((s, p) => s + p.c, 0) / win.length, n: win.length } : null;
}

async function oneSymbol(spec, th) {
  const [sym, priceTickerRaw] = spec.split(':');
  // หุ้นไทย: Yahoo ใช้ `SYMBOL.BK` (เหมือน fetch-facts/update-prices) · ระบุกระดานเองแล้วใช้ตามนั้น
  const priceTicker = priceTickerRaw || (th ? `${sym}.BK` : sym);
  const page = await fetchFinPage(sym, th, ['income-statement/', '']);
  const eps = finRow(page, ['epsDiluted', 'epsdil']);
  const dk = finRow(page, ['datekey']);
  if (!eps || !dk) throw new Error('อ่านแถว EPS(dil)/datekey จากงบไม่ได้');
  const closes = await monthlyCloses(priceTicker);

  const rows = [];
  for (let i = 0; i < dk.length; i++) {
    const key = String(dk[i] || '');
    if (!key || key === 'TTM') continue;                       // TTM = งวดวิ่ง ไม่ใช่ FY ปิดงบ
    const end = Date.parse(key);
    if (!isFinite(end)) continue;
    const e = asNum(eps[i]);
    const w = avgWindow(closes, end);
    const skip = e == null ? 'ไม่มี EPS' : (e <= 0 ? 'EPS ≤ 0 (ปีขาดทุน — P/E ไร้ความหมาย)' : (!w ? 'ราคาไม่ครอบคลุมงวด' : null));
    rows.push({ key, eps: e, avg: w ? w.avg : null, months: w ? w.n : 0, pe: skip ? null : w.avg / e, skip });
  }
  const used = rows.filter((r) => r.pe != null).map((r) => r.pe);
  return { sym, priceTicker, rows, used, median: used.length ? med(used) : null };
}

function report(r) {
  const L = [];
  const tag = r.priceTicker !== r.sym ? ` (ราคา: ${r.priceTicker})` : '';
  // ★ หัวบล็อกต้องขึ้นต้นด้วย "=== ตัวคูณมัธยฐานย้อนหลัง" ให้ตรงกับช่อง {{MEDIANS}} ใน
  //   `_template/agent-prompt.md` และที่ SKILL.md STEP 3 อ้างถึง — worker หาบล็อกนี้ด้วยชื่อ
  L.push(`=== ตัวคูณมัธยฐานย้อนหลัง: ${r.sym}${tag} — P/E (ราคาเฉลี่ยของงวด ÷ EPS diluted ของงวดนั้น) ===`);
  for (const row of r.rows) {
    if (row.pe != null) L.push(`  ${row.key}  EPS ${row.eps.toFixed(2)}  ราคาเฉลี่ย ${row.avg.toFixed(2)} (${row.months} เดือน)  →  P/E ${row.pe.toFixed(1)}x`);
    else L.push(`  ${row.key}  — ข้าม: ${row.skip}`);
  }
  if (r.median == null || r.used.length < MIN_POINTS) {
    L.push(`  ⚠️ ใช้ไม่ได้: มีจุดที่วัดได้ ${r.used.length} จุด (ต้อง ≥ ${MIN_POINTS})`);
    L.push('  ⇒ **ห้ามตั้งตัวคูณเป้าหมายเอง** — ใช้ peer ที่วัดจริง หรือตระกูลอื่น (EV/Sales, DDM) เป็นขาแทน');
  } else {
    const lo = Math.min(...r.used), hi = Math.max(...r.used);
    L.push(`  ★ มัธยฐาน ${r.median.toFixed(1)}x   (ช่วง ${lo.toFixed(1)}–${hi.toFixed(1)}x · ${r.used.length} จุด)`);
    if (hi / lo > 3) L.push(`  ⚠️ ช่วงกว้าง ${(hi / lo).toFixed(1)} เท่า — มีปีผิดปกติ (กำไรก้อนเดียว/เปลี่ยนสเกล) ดูรายปีก่อนใช้มัธยฐาน`);
  }
  return L.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const th = argv.includes('--th');
  const specs = argv.filter((a) => !a.startsWith('--'));
  if (!specs.length) { console.error('ใช้: node tools/median-multiples.js <SYM>[:<yahoo ticker>] … [--th]'); process.exit(1); }
  let bad = 0;
  for (const spec of specs) {
    try { console.log(report(await oneSymbol(spec, th)) + '\n'); }
    catch (e) { bad++; console.log(`=== ตัวคูณมัธยฐานย้อนหลัง: ${spec} ===\n  ✗ ดึงไม่สำเร็จ: ${e.message}\n  ⇒ **ห้ามเดาตัวคูณจากค่าปัจจุบัน** — ใช้ peer ที่วัดจริง หรือตระกูลอื่นเป็นขาแทน\n`); }
  }
  console.log('— ตัวคูณนี้เป็น "สมอที่วัดจริง" สำหรับขา FV · ห้ามตั้งเป้าหมายจากตัวคูณปัจจุบัน (W18 · §8 ชั้น 0.4e) —');
  process.exit(bad === specs.length ? 1 : 0);
}

module.exports = { oneSymbol, avgWindow, monthlyCloses, MIN_POINTS };
if (require.main === module) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
