#!/usr/bin/env node
'use strict';
/**
 * migrate-annual-chg.js — ปรับรายงานเดิมให้เข้ากฎใหม่ (CLAUDE.md ข้อ 2 · มิ.ย. 2026):
 *   1) ป้าย % ใน header (.chg) = "ผลตอบแทนรอบปี" = ผลตอบแทนปลายกราฟ (จุดแรก→ท้าย) · รูปแบบ "▲ +X.X% (รอบปี)"
 *   2) กราฟ section 2 = "ราคาย้อนหลัง ~1 ปี" — ตัดกราฟ >13 จุด (18 เดือน/1.5 ปี) ให้เหลือ 13 จุดล่าสุด (~12 เดือน)
 *
 * คำนวณ % รอบปีจากกราฟของแต่ละไฟล์เอง (ไม่ดึงข้อมูลใหม่ — faithful) แล้วตั้งสีป้ายตามทิศ (เขียว=ขึ้น/แดง=ลง)
 * หุ้น IPO ใหม่ (<1 ปี) ใช้ "(ตั้งแต่ IPO)" แทน "(รอบปี)"
 *
 * ใช้:  node tools/migrate-annual-chg.js [--write] [SYMBOL ...]
 *   ไม่มี --write = dry-run (โชว์ว่าจะเปลี่ยนอะไร) · ใส่ --write = เขียนไฟล์จริง
 * หลังเขียน: npm run build → node tools/preserve-dates.js → npm run build → npm run verify
 */
const fs = require('fs');
const path = require('path');

const REPORTS = path.join(__dirname, '..', 'reports');
const WRITE = process.argv.includes('--write');
const ONLY = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')).map((s) => s.replace(/\.html$/i, '').toUpperCase()));

const MAX_PTS = 13;       // กราฟรายเดือน ~1 ปี = ไม่เกิน 13 จุด
const FLAT_PP = 0.75;     // |%| < 0.75 → "ทรงตัว"
const UP = { bg: 'var(--green-soft)', col: '#1e8e3e' };
const DOWN = { bg: 'var(--red-soft)', col: '#c5221f' };

// serialize report-data ให้สไตล์เหมือนต้นฉบับ (จุดกราฟ [label, num] บรรทัดเดียว, array ตัวเลขล้วนบรรทัดเดียว)
function styledRD(rd) {
  let s = JSON.stringify(rd, null, 2);
  s = s.replace(/\[\n\s*("(?:[^"\\]|\\.)*"),\n\s*(-?\d+(?:\.\d+)?)\n\s*\]/g, '[$1, $2]');         // ["label", num]
  s = s.replace(/\[\n\s*((?:-?\d+(?:\.\d+)?,\n\s*)*-?\d+(?:\.\d+)?)\n\s*\]/g,                       // [num, num, ...]
    (m, body) => '[' + body.replace(/,\n\s*/g, ', ') + ']');
  return s;
}

function migrate(html, sym) {
  const rdM = html.match(/(<script[^>]*\bid=["']report-data["'][^>]*>)([\s\S]*?)(<\/script>)/i);
  if (!rdM) return { skip: 'ไม่มีบล็อก report-data' };
  let rd;
  try { rd = JSON.parse(rdM[2]); } catch (e) { return { skip: 'report-data JSON พัง: ' + e.message }; }
  if (!rd.chart || !Array.isArray(rd.chart.data) || rd.chart.data.length < 2) return { skip: 'chart.data ไม่ครบ' };

  const data = rd.chart.data;
  const trim = data.length > MAX_PTS;
  const trimmed = trim ? data.slice(-MAX_PTS) : data;
  const first = trimmed[0][1], last = trimmed[trimmed.length - 1][1];

  // ตรวจ IPO (หุ้นใหม่ <1 ปี) จาก title section 2 หรือป้าย chg เดิม
  const title2 = (html.match(/<div class="n">2<\/div><h2>([\s\S]*?)<\/h2>/) || [, ''])[1];
  const oldChg = (html.match(/<div class="chg"[^>]*>([\s\S]*?)<\/div>/i) || [, ''])[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const isIPO = /IPO/i.test(title2) || /IPO/i.test(oldChg);
  const suffix = isIPO ? '(ตั้งแต่ IPO)' : '(รอบปี)';

  let pct = null, dir = 'flat', newChg;
  if (first > 0) pct = (last - first) / first * 100;
  if (pct == null || Math.abs(pct) < FLAT_PP) { newChg = `≈ ทรงตัว ${suffix}`; dir = 'flat'; }
  else if (pct > 0) { newChg = `▲ +${pct.toFixed(1)}% ${suffix}`; dir = 'up'; }
  else { newChg = `▼ −${Math.abs(pct).toFixed(1)}% ${suffix}`; dir = 'down'; }
  const theme = dir === 'up' ? UP : dir === 'down' ? DOWN : null;

  let out = html;

  // (a) แทนป้าย chg (ตัด inline style เดิมทิ้ง → ใช้สีจาก theme.chgBg/chgColor)
  out = out.replace(/<div class="chg"[^>]*>[\s\S]*?<\/div>/i, `<div class="chg">${newChg}</div>`);

  if (trim) {
    // (b) ตัดกราฟเหลือ 13 จุดล่าสุด + คำนวณ highlight ใหม่ (จุดต่ำ/สูงในกรอบใหม่) + ตั้งสี theme + แก้ title
    rd.chart.data = trimmed;
    const prices = trimmed.map((p) => p[1]);
    let iMin = 0, iMax = 0;
    prices.forEach((v, i) => { if (v < prices[iMin]) iMin = i; if (v > prices[iMax]) iMax = i; });
    rd.chart.highlight = [...new Set([iMin, iMax])].sort((a, b) => a - b);
    if (theme) { rd.theme.chgBg = theme.bg; rd.theme.chgColor = theme.col; }
    out = out.replace(/(<script[^>]*\bid=["']report-data["'][^>]*>)([\s\S]*?)(<\/script>)/i, (m, a, body, b) => a + '\n' + styledRD(rd) + '\n' + b);
    out = out.replace(/(<div class="n">2<\/div><h2>)([\s\S]*?)(<\/h2>)/, (m, a, t, b) => a + t.replace(/ราคาย้อนหลัง[^<]*/, 'ราคาย้อนหลัง ~1 ปี') + b);
  } else if (theme) {
    // (c) ไม่ตัด: แก้เฉพาะสี theme.chgBg/chgColor ในบล็อก report-data (diff น้อย)
    out = out.replace(/(<script[^>]*\bid=["']report-data["'][^>]*>)([\s\S]*?)(<\/script>)/i, (m, a, body, b) => {
      body = body.replace(/("chgBg"\s*:\s*")[^"]*(")/, `$1${theme.bg}$2`).replace(/("chgColor"\s*:\s*")[^"]*(")/, `$1${theme.col}$2`);
      return a + body + b;
    });
  }

  return { oldChg, newChg, trim, from: data.length, to: trimmed.length, pct, dir, changed: out !== html, out };
}

const files = fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).sort()
  .filter((f) => !ONLY.size || ONLY.has(f.replace(/\.html$/i, '').toUpperCase()));

let nChg = 0, nTrim = 0, nSkip = 0;
for (const f of files) {
  const p = path.join(REPORTS, f);
  const html = fs.readFileSync(p, 'utf8');
  const r = migrate(html, f.replace(/\.html$/i, ''));
  if (r.skip) { console.log(`⚠ ${f.padEnd(14)} ข้าม: ${r.skip}`); nSkip++; continue; }
  if (r.changed) {
    nChg++;
    if (r.trim) nTrim++;
    const tag = r.trim ? ` ✂ ตัด ${r.from}→${r.to} จุด` : '';
    console.log(`${WRITE ? '✓' : '·'} ${f.padEnd(14)} "${r.oldChg}" → "${r.newChg}"${tag}`);
    if (WRITE) fs.writeFileSync(p, r.out);
  }
}
console.log(`\n${WRITE ? 'เขียนแล้ว' : '[dry-run]'} ${nChg} ไฟล์ (ตัดกราฟ ${nTrim}) · ข้าม ${nSkip}`);
if (!WRITE) console.log('ใส่ --write เพื่อเขียนจริง');
