'use strict';
/**
 * sidecar.js — `.queue/prep/<SYM>.json` ข้อมูลเครื่องอ่านของ prep (spec §6.4 · Plan 2b)
 *   อินพุตเดียวของ `node tools/report.js init` (ห้าม regex ไฟล์ .md ซึ่งเป็น prompt ของ LLM — ruling 4)
 *   ประกอบจาก fetch-facts --json (ราคา/กราฟ/ชื่อ/ตลาด) + fetch-fundamentals --json (งบ TTM/FY/หุ้นคงเหลือ/ปันผล)
 *   + parseVendor (เป้า/52wk vendor/กับดัก) + MM.oneSymbol (มัธยฐาน P/E) + parseDeltas (Δ ราคา/EPS ของ CROSS-VERIFY)
 *   ส่วนบริสุทธิ์ทั้งหมด (ไม่ยิง network ไม่อ่าน .md) · `market` ใช้ตอน save ของใบใหม่เท่านั้น — ไม่เข้า .work/
 * ★ ห้าม require state.js (อ่าน env/git ตอน require) — ผู้เรียกส่งโฟลเดอร์มาเอง
 * buildSidecar throw เมื่อข้อมูลไม่พอ (ไม่มีราคา/งบ/สกุลไม่ตรง) — prep จับแล้วพิมพ์ ⚠ + ลบไฟล์เก่า แต่ยังเขียน .md ต่อ
 *   (NEW ของ v2 ไม่ใช้ sidecar) · fail-closed อยู่ที่ report.js init ซึ่งปฏิเสธเมื่อไม่มี sidecar
 */
const fs = require('fs');
const path = require('path');

const SIDECAR_V = 1;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const n = (x) => (isNum(x) ? x : null);
/** กรอบ 52 สัปดาห์ที่ใช้ได้ — schema บังคับ lo/hi > 0 และ hi ≥ lo · ไม่ผ่าน = null */
const rng = (lo, hi) => (isNum(lo) && isNum(hi) && lo > 0 && hi >= lo ? { lo, hi } : null);

/** ผลของ MM.oneSymbol → ค่าที่ init ใช้ (ตัดแถวดิบทิ้ง) · null = ดึงไม่ได้ · curErr = ผสมสกุล (ห้ามใช้ median) */
function mediansOf(r) {
  if (!r) return null;
  const used = (r.rows || []).filter((x) => isNum(x.pe) && !x.outlier);
  const years = used.map((x) => parseInt(String(x.key).slice(0, 4), 10)).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    median: n(r.median),
    lo: used.length ? Math.min(...used.map((x) => x.pe)) : null,
    hi: used.length ? Math.max(...used.map((x) => x.pe)) : null,
    window: years.length ? `FY${years[0]}–FY${years[years.length - 1]}` : null,
    points: used.length, fyYears: n(r.fyYears), curErr: r.curErr || null,
  };
}

function buildSidecar({ symbol, th, facts, fund, vend, medians, deltas, today }) {
  if (!facts || !isNum(facts.px) || !facts.priceDate || !facts.chart || !Array.isArray(facts.chart.data))
    throw new Error(`${symbol}: fetch-facts --json ไม่ครบ (px/priceDate/chart) — sidecar ไม่มีราคาให้ report.js save`);
  const currency = th ? 'THB' : 'USD';
  // ticker ชนกัน (AIT/ORI) — Yahoo คืนสกุลอื่น = คนละบริษัท · ตรงกับ "⚠ currency จาก Yahoo … ไม่ตรงที่คาด" ของโหมดข้อความ แต่ที่นี่ปิดทาง
  if (facts.quoteCurrency && facts.quoteCurrency !== currency)
    throw new Error(`${symbol}: สกุลจาก Yahoo = ${facts.quoteCurrency} ไม่ตรงที่คาด (${currency}) — เช็ค ticker/--th ก่อน (ticker ชนกัน เคส AIT/ORI)`);
  const v = vend || {}, f = fund || {};
  const errs = f.errors || {};
  // ไม่มีงบ = ใบใหม่ไม่มีอะไรให้ init เติม — throw (prep จับเป็น ⚠ + ไม่เขียน .json) ไม่ใช่ sidecar ที่ null ทั้งแผง
  if (errs.fin || errs.stats)
    throw new Error(`${symbol}: fetch-fundamentals --json ดึงงบไม่ได้ (${[errs.fin && `fin: ${errs.fin}`, errs.stats && `stats: ${errs.stats}`].filter(Boolean).join(' · ')}) — ห้ามสร้าง sidecar`);
  const srcErr = Object.fromEntries(Object.entries(errs).filter(([, e]) => e));
  const lo = n(v.lo52), hi = n(v.hi52);
  return {
    v: SIDECAR_V, symbol, currency, region: th ? 'TH' : 'US', builtAt: today,
    company: facts.company || null, exchange: facts.exchange || null,
    market: {
      px: facts.px, priceDate: facts.priceDate, chart: { data: facts.chart.data }, chgSuffix: facts.chgSuffix,
      range52w: rng(lo, hi) || (facts.range52w ? rng(facts.range52w.lo, facts.range52w.hi) : null),   // vendor 52wk ก่อน (M7) · ไม่มีค่อยใช้ Yahoo meta · lo ต้อง > 0 (schema)
    },
    vendor: { epsTTM: n(v.epsTTM), target: n(v.target), analysts: n(v.analysts), lo52: lo, hi52: hi, divYieldPct: n(v.divYieldPct), fyYears: n(v.fyYears), traps: v.traps || [] },
    crossVerify: { dP: deltas ? n(deltas.dP) : null, dE: deltas ? n(deltas.dE) : null },
    ttm: f.ttm || null, fy: f.fy || null, sharesOut: n(f.sharesOut), dps: n(f.dps), epsForward: n(f.epsForward), rating: f.rating || null,
    medians: medians || null,
    sourceErrors: Object.keys(srcErr).length ? srcErr : null,   // แหล่งรอง (yahoo/sa) ที่ล้ม — อยู่นอก market เสมอ
  };
}

/** รูป symbol ที่ยอมให้เป็นชื่อไฟล์ใน <dir> — เหมือน report.js SYM_RE · กัน `../x` พา write/rm ออกนอก .queue/prep */
const SYM_RE = /^[A-Z0-9][A-Z0-9.\-]*$/;
function assertSym(sym) {
  if (typeof sym !== 'string' || !SYM_RE.test(sym)) throw new Error(`sidecar: symbol ไม่ถูกรูป: ${sym}`);
  return sym;
}

function writeSidecar(dir, sc) {
  assertSym(sc.symbol);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, sc.symbol + '.json');
  fs.writeFileSync(file, JSON.stringify(sc, null, 2) + '\n');
  return file;
}

/** ลบ <dir>/<SYM>.json ถ้ามี (ไม่มี = เงียบ) — prep เรียกตอนเริ่มใบ NEW ทุกครั้ง กัน sidecar ค้างให้ init หยิบผิด · symbol ผิดรูป = throw ไม่ลบ */
function removeSidecar(dir, sym) {
  fs.rmSync(path.join(dir, assertSym(sym) + '.json'), { force: true });
}

module.exports = { buildSidecar, mediansOf, writeSidecar, removeSidecar, SIDECAR_V };
