'use strict';
/**
 * sidecar.js — `.queue/prep/<SYM>.json` ข้อมูลเครื่องอ่านของ prep (spec §6.4 · Plan 2b)
 *   อินพุตเดียวของ `node tools/report.js init` (ห้าม regex ไฟล์ .md ซึ่งเป็น prompt ของ LLM — ruling 4)
 *   ประกอบจาก fetch-facts --json (ราคา/กราฟ/ชื่อ/ตลาด) + fetch-fundamentals --json (งบ TTM/FY/หุ้นคงเหลือ/ปันผล)
 *   + parseVendor (เป้า/52wk vendor/กับดัก) + MM.oneSymbol (มัธยฐาน P/E) + parseDeltas (Δ ราคา/EPS ของ CROSS-VERIFY)
 *   ส่วนบริสุทธิ์ทั้งหมด (ไม่ยิง network ไม่อ่าน .md) · `market` ใช้ตอน save ของใบใหม่เท่านั้น — ไม่เข้า .work/
 * ★ ห้าม require state.js (อ่าน env/git ตอน require) — ผู้เรียกส่งโฟลเดอร์มาเอง
 */
const fs = require('fs');
const path = require('path');

const SIDECAR_V = 1;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const n = (x) => (isNum(x) ? x : null);

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
  const v = vend || {}, f = fund || {};
  const lo = n(v.lo52), hi = n(v.hi52);
  return {
    v: SIDECAR_V, symbol, currency: th ? 'THB' : 'USD', region: th ? 'TH' : 'US', builtAt: today,
    company: facts.company || null, exchange: facts.exchange || null,
    market: {
      px: facts.px, priceDate: facts.priceDate, chart: { data: facts.chart.data }, chgSuffix: facts.chgSuffix,
      range52w: lo != null && hi != null && hi >= lo ? { lo, hi } : facts.range52w || null,   // vendor 52wk ก่อน (M7) · ไม่มีค่อยใช้ Yahoo meta
    },
    vendor: { epsTTM: n(v.epsTTM), target: n(v.target), analysts: n(v.analysts), lo52: lo, hi52: hi, divYieldPct: n(v.divYieldPct), fyYears: n(v.fyYears), traps: v.traps || [] },
    crossVerify: { dP: deltas ? n(deltas.dP) : null, dE: deltas ? n(deltas.dE) : null },
    ttm: f.ttm || null, fy: f.fy || null, sharesOut: n(f.sharesOut), dps: n(f.dps), epsForward: n(f.epsForward), rating: f.rating || null,
    medians: medians || null,
  };
}

function writeSidecar(dir, sc) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, sc.symbol + '.json');
  fs.writeFileSync(file, JSON.stringify(sc, null, 2) + '\n');
  return file;
}

module.exports = { buildSidecar, mediansOf, writeSidecar, SIDECAR_V };
