#!/usr/bin/env node
'use strict';

/**
 * check-reports.js — Quality gate สำหรับรายงานวิเคราะห์หุ้นใน reports/<SYMBOL>.html
 *
 * ตรวจ 3 มิติ:
 *   1) โครงสร้างครบ      — 8 section, กราฟ, gauge, เครื่องคิดเลข MOS, disclaimer, footer, title/h1
 *   2) ตัวเลขสอดคล้องกัน — ค่า FV ใน JS = FV ในกล่อง, MOS = (FV−ราคา)/FV, scenario EPS×P/E = target
 *   3) ไม่มีของค้าง       — placeholder [SYMBOL]/${...}, "undefined"/"NaN", สกุลเงินปน
 *
 * ใช้งาน:
 *   node test/check-reports.js              # ตรวจทุกไฟล์ใน reports/
 *   node test/check-reports.js BBL KBANK    # ตรวจเฉพาะบางตัว
 *
 * exit code: 0 = ผ่าน (อาจมี warning), 1 = มี error → ห้าม push
 * ไม่มี dependency ภายนอก (Node ≥ 18). รันอัตโนมัติก่อน push ผ่าน .githooks/pre-push
 */

const fs = require('fs');
const path = require('path');
// expandReport: ขยายรายงานแบบ template (content-only) ให้เป็น HTML เต็มก่อนตรวจ — ไฟล์เก่า (ไม่มี marker) = identity
// (require build.js ได้ exports เฉย ๆ ไม่รัน build เพราะ guard `if (require.main !== module) return;`)
const { expandReport } = require('../build.js');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const TOL_MOS_PP = 2.0;   // MOS แสดง vs คำนวณ — ต่างได้ ≤ 2 จุด %
const TOL_FV_REL = 0.01;  // FV ใน JS vs ในกล่อง — ต่างได้ ≤ 1%
const TOL_SCN_REL = 0.07; // scenario EPS×P/E vs target — ต่างได้ ≤ 7%

// ---------- helpers ----------
const stripCode = (h) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
const stripTags = (h) => String(h).replace(/<[^>]+>/g, ' ');
const visible = (h) => stripTags(stripCode(h));
const norm = (s) => String(s).replace(/−/g, '-'); // unicode minus → ascii

function firstNum(s) {
  if (s == null) return null;
  const t = norm(stripTags(String(s))).replace(/[฿$,]/g, '');
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function grab(re, h) { const m = String(h).match(re); return m ? m[1] : null; }

function parseScenarios(html) {
  const parts = html.split(/<div class="col\s+(?:bear|base|bull)"/);
  const cols = [];
  for (let i = 1; i < parts.length && cols.length < 3; i++) {
    const seg = parts[i];
    cols.push({
      tgt: firstNum(grab(/<div class="tgt">([\s\S]*?)<\/div>/, seg)),
      eps: firstNum(grab(/EPS ปี 3<\/span>\s*<span>([\s\S]*?)<\/span>/, seg)),
      pe: firstNum(grab(/P\/E ออก<\/span>\s*<span>([\s\S]*?)<\/span>/, seg)),
      g: firstNum(grab(/EPS\s*([+\-−]?[0-9.]+)\s*%\s*\/\s*ปี/, norm(seg))),
      ret: firstNum(grab(/class="ret[^"]*">([\s\S]*?)<\/div>/, seg)),
    });
  }
  return cols;
}

// แต่ละวิธีประเมินมูลค่า (.vmethod) → { name, desc, val }
function parseMethods(html) {
  return html.split('<div class="vmethod">').slice(1).map((seg) => ({
    name: stripTags(grab(/class="mname">([\s\S]*?)<\/div>/, seg) || '').replace(/\s+/g, ' ').trim(),
    desc: norm(stripTags(grab(/class="mdesc">([\s\S]*?)<\/div>/, seg) || '')).replace(/\s+/g, ' ').trim(),
    val: firstNum(grab(/class="mval">([\s\S]*?)<\/div>/, seg)),
  }));
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// แปลง "ราคา ณ <วัน[–วัน]> <เดือนไทย> <ปี ค.ศ./พ.ศ.>" → อายุเป็นวันเทียบ "วันนี้"
// ช่วงวัน (เช่น 14–18 มิ.ย.) ใช้ "วันท้าย" (ราคาที่สดสุด). พ.ศ.→ค.ศ. อัตโนมัติ.
function parsePriceAge(header) {
  const txt = norm(stripTags(header));
  const i = txt.indexOf('ราคา');
  const region = i === -1 ? txt : txt.slice(i, i + 140);
  const monthAlt = THAI_MONTHS.map((m) => m.replace(/\./g, '\\.')).join('|');
  const re = new RegExp(`(\\d{1,2})(?:\\s*[–\\-]\\s*(\\d{1,2}))?\\s*(${monthAlt})\\s*(20\\d\\d|25\\d\\d|26\\d\\d)`, 'g');
  let m, last = null;
  while ((m = re.exec(region))) last = m;
  if (!last) return null;
  const day = parseInt(last[2] || last[1], 10);
  const mon = THAI_MONTHS.indexOf(last[3]);
  let year = parseInt(last[4], 10);
  if (year >= 2400) year -= 543; // พ.ศ. → ค.ศ.
  if (mon < 0) return null;
  const now = process.env.STALE_TODAY ? Date.parse(process.env.STALE_TODAY) : Date.now();
  const dt = Date.UTC(year, mon, day);
  return { iso: `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, ageDays: Math.round((now - dt) / 86400000) };
}

// ดึง key metric (ค่าในการ์ด .metric) ตามชื่อ label
function metricNum(html, labelRe) {
  const m = html.match(new RegExp(`<div class="k">[^<]*${labelRe}[^<]*</div>\\s*<div class="v[^"]*">([^<]*)<`));
  return m ? firstNum(m[1]) : null;
}

function buildCtx(html, name) {
  const text = visible(html);
  const headerM = html.match(/<header[\s\S]*?<\/header>/i);
  const fvIdx = html.indexOf('class="fv-box"');
  return {
    html,
    name,
    symbol: name.replace(/\.html$/i, ''),
    text,
    header: headerM ? headerM[0] : '',
    aiModel: (() => { const m = html.match(/<meta\s+name=["']ai-model["']\s+content=["']([^"']*)["']/i); return m ? m[1].trim() : null; })(),
    // คำโปรยธุรกิจใต้ <h1> = <div class="sub"> — build.js ดึงไปเป็น desc โชว์บนการ์ดหน้า index (สรุปว่าบริษัททำธุรกิจอะไร)
    sub: (() => { const m = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<div[^>]*\bclass=["'][^"']*\bsub\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i); return m ? stripTags(m[1]).trim() : ''; })(),
    px: firstNum(grab(/<div class="px">([\s\S]*?)<\/div>/, html)),
    constFV: (() => { const m = html.match(/const\s+FV\s*=\s*([0-9]+(?:\.[0-9]+)?)/); return m ? parseFloat(m[1]) : null; })(),
    fvBox: fvIdx === -1 ? null : firstNum(grab(/class="r">([\s\S]*?)<\/div>/, html.slice(fvIdx))),
    mosBig: firstNum(grab(/class="big">([\s\S]*?)<\/div>/, html)),
    // สกุลเงินหลัก = สัญลักษณ์หน้าราคาใน header (.px) — ไม่ใช่แค่ "มี ฿ ที่ไหนสักแห่ง"
    // (กัน USD report ที่อ้างอิงค่าเงินบาทในข้อความ ไม่ให้ถูกตีว่าเป็นรายงานบาท)
    isTHB: (() => { const m = html.match(/<div class="px">\s*([฿$])/); return m ? m[1] === '฿' : (text.includes('฿') && !text.includes('$')); })(),
    scenarios: parseScenarios(html),
    methods: parseMethods(html),
    pxInput: firstNum(grab(/id="pxIn"[^>]*value="([^"]*)"/, html)),
    baseEPS: firstNum(grab(/EPS ฐาน\s*~?\s*[฿$]?\s*([0-9.]+)/, norm(html))),
    vgridFV: (() => { const i = html.indexOf('class="vgrid"'); if (i === -1) return null; return firstNum(grab(/มูลค่าเหมาะสม<\/div>\s*<div class="v">([\s\S]*?)<\/div>/, html.slice(i))); })(),
    scaleNums: (() => { const seg = grab(/<div class="scale">([\s\S]*?)<\/div>\s*<\/div>/, html); if (!seg) return []; return seg.split('<span').slice(1).map((s) => firstNum(s)).filter((v) => v != null); })(),
    priceAge: parsePriceAge(headerM ? headerM[0] : ''),
    metrics: {
      pe: metricNum(html, 'P/E \\(TTM\\)'),
      pbv: metricNum(html, 'P/BV'),
      yield: metricNum(html, 'เงินปันผล'),
      roe: (() => { const m = norm(html).match(/ROE[^<]*<\/div>\s*<div class="v[^"]*">\s*~?\s*([0-9.]+)\s*%/); return m ? parseFloat(m[1]) : null; })(),
    },
    // บล็อก stock-meta (JSON ตัวเลขสำหรับเรียง index) — present/ok/data ใช้โดย E29–31, W10
    sm: (() => {
      const m = html.match(/<script[^>]*\bid=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!m) return { present: false };
      try { return { present: true, ok: true, data: JSON.parse(m[1]) }; }
      catch (e) { return { present: true, ok: false, err: e.message }; }
    })(),
  };
}

const SM_NUM_KEYS = ['price', 'fairValue', 'mos', 'upside', 'pe', 'dividendYield', 'roe']; // ต้องเป็นตัวเลข (price/fairValue/mos/upside) หรือตัวเลข|null (pe/yield/roe)
const SM_REQ_NUM = ['price', 'fairValue', 'mos', 'upside'];                                 // ต้องมีค่าเสมอ (คำนวณได้จากราคา/FV)
const isFiniteNum = (v) => typeof v === 'number' && isFinite(v);

// ---------- checks ----------
// level 'error' → block push ; level 'warn' → แจ้งเตือน ไม่ block
const CHECKS = [
  { id: 'E01', level: 'error', label: 'DOCTYPE html', fn: (c) => /^\s*<!doctype html>/i.test(c.html) ? null : 'ไม่มี <!DOCTYPE html> ที่ต้นไฟล์' },
  { id: 'E02', level: 'error', label: '<html lang="th">', fn: (c) => /<html[^>]*lang="th"/i.test(c.html) ? null : 'ไม่มี <html lang="th">' },
  { id: 'E03', level: 'error', label: 'ปิด </html>', fn: (c) => /<\/html>\s*$/i.test(c.html) ? null : 'ไฟล์ไม่จบด้วย </html>' },
  { id: 'E04', level: 'error', label: 'title มีชื่อย่อหุ้น', fn: (c) => { const t = grab(/<title>([\s\S]*?)<\/title>/i, c.html); if (!t || !t.trim()) return 'ไม่มี <title>'; return t.includes(c.symbol) ? null : `title ไม่มีชื่อย่อ "${c.symbol}"`; } },
  { id: 'E05', level: 'error', label: 'มี <h1>', fn: (c) => { const t = grab(/<h1[^>]*>([\s\S]*?)<\/h1>/i, c.html); return (t && stripTags(t).trim()) ? null : 'ไม่มี <h1> หรือว่างเปล่า'; } },
  { id: 'E06', level: 'error', label: 'ครบ 8 section', fn: (c) => { const miss = []; for (let n = 1; n <= 8; n++) if (!new RegExp(`<div[^>]*class="[^"]*\\bn\\b[^"]*"[^>]*>\\s*${n}\\s*</div>`).test(c.html)) miss.push(n); return miss.length ? `ขาด section: ${miss.join(', ')}` : null; } },
  { id: 'E07', level: 'error', label: 'กราฟราคา', fn: (c) => /id="priceChart"/.test(c.html) ? null : 'ไม่มีกราฟราคา (#priceChart)' },
  { id: 'E08', level: 'error', label: 'เครื่องคิดเลข MOS', fn: (c) => (/id="pxIn"/.test(c.html) && /id="mosOut"/.test(c.html) && c.constFV != null) ? null : 'เครื่องคิดเลข MOS ไม่ครบ (ต้องมี #pxIn, #mosOut, const FV=)' },
  { id: 'E09', level: 'error', label: 'gauge ราคา', fn: (c) => (/id="mCur"/.test(c.html) && /id="mFair"/.test(c.html)) ? null : 'ไม่มี gauge (#mCur/#mFair)' },
  { id: 'E10', level: 'error', label: 'disclaimer', fn: (c) => /ไม่ใช่คำแนะนำ/.test(c.html) ? null : 'ไม่มี disclaimer "ไม่ใช่คำแนะนำ..."' },
  { id: 'E11', level: 'error', label: 'footer', fn: (c) => /<footer/i.test(c.html) ? null : 'ไม่มี <footer>' },
  { id: 'E12', level: 'error', label: 'ราคา+วันที่+แหล่งที่มา (header)', fn: (c) => { if (c.px == null) return 'header ไม่มีราคา (.px)'; if (!/\b(?:20\d\d|25\d\d|26\d\d)\b/.test(c.header)) return 'header ไม่มีปีของวันที่ราคา'; if (!/(ที่มา|แหล่ง|อ้างอิง|ข้อมูลจาก|source|ref)/i.test(c.header)) return 'header ไม่ระบุแหล่งที่มา'; return null; } },
  // จับเฉพาะ token จริงของ template (ไม่จับ [NASDAQ]/[ADR]/[MSFT] ที่เป็นข้อความถูกต้อง)
  { id: 'E13', level: 'error', label: 'ไม่มี placeholder ค้าง', fn: (c) => { const hits = []; [/\[(?:SYMBOL|YEAR|MONTH|DAY|DATE|PRICE|COMPANY|NAME|SOURCE|TICKER|SECTOR)\]/, /\$\{\s*[A-Za-z_]/, /STOCK_DATA/, /_analysis\.html/, /\[ราคาปัจจุบัน\]/, /\[ชื่อบริษัท\]/, /\[แหล่งข้อมูล\]/, /\[วัน\/เดือน\/ปี\]/].forEach((re) => { const m = c.text.match(re); if (m) hits.push(m[0].trim()); }); return hits.length ? `พบ placeholder: ${[...new Set(hits)].join(' , ')}` : null; } },
  { id: 'E14', level: 'error', label: 'ไม่มี undefined/NaN', fn: (c) => { const h = []; if (/\bundefined\b/.test(c.text)) h.push('undefined'); if (/\bNaN\b/.test(c.text)) h.push('NaN'); return h.length ? `พบข้อความ ${h.join('/')} ในเนื้อหา (น่าจะ render พลาด)` : null; } },
  { id: 'E15', level: 'error', label: 'FV ใน JS = FV ในกล่อง', fn: (c) => { if (c.constFV == null || c.fvBox == null) return 'อ่านค่า FV ไม่ได้ (const FV หรือ .fv-box)'; const d = Math.abs(c.constFV - c.fvBox); return d <= Math.max(0.01, TOL_FV_REL * c.fvBox) ? null : `const FV=${c.constFV} ไม่ตรงกับ Fair Value ในกล่อง ${c.fvBox} (เครื่องคิดเลขจะคำนวณผิด)`; } },
  { id: 'E16', level: 'error', label: 'MOS = (FV−ราคา)/FV', fn: (c) => { const FV = c.fvBox != null ? c.fvBox : c.constFV; if (FV == null || c.px == null || c.mosBig == null) return 'อ่านค่า ราคา/FV/MOS ไม่ครบ'; const exp = (FV - c.px) / FV * 100; const d = Math.abs(exp - c.mosBig); return d <= TOL_MOS_PP ? null : `MOS แสดง ${c.mosBig}% แต่ (FV ${FV} − ราคา ${c.px})/FV = ${exp.toFixed(1)}% (ต่าง ${d.toFixed(1)} จุด %)`; } },
  { id: 'E17', level: 'error', label: '≥2 วิธีประเมินมูลค่า + Fair Value', fn: (c) => { const n = (c.html.match(/class="vmethod"/g) || []).length; if (n < 2) return `มีวิธีประเมินมูลค่าเพียง ${n} วิธี (ต้อง ≥ 2)`; if (c.fvBox == null) return 'ไม่มีกล่อง Fair Value (.fv-box)'; return null; } },
  { id: 'E18', level: 'error', label: 'จุดซื้อ MOS20/30 = FV×0.8 / ×0.7', fn: (c) => { if (c.fvBox == null) return null; const get = (pct) => firstNum(grab(new RegExp(`จุดซื้อ[^<]*${pct}\\s*%<\\/div>\\s*<div class="v[^"]*">([^<]*)<`), c.html)); const bad = []; [['MOS 20%', get(20), 0.8], ['MOS 30%', get(30), 0.7]].forEach(([lab, box, f]) => { if (box == null) { bad.push(`ไม่พบกล่องจุดซื้อ ${lab}`); return; } const exp = c.fvBox * f; if (Math.abs(box - exp) > Math.max(0.025 * exp, 0.01)) bad.push(`${lab} แสดง ${box} แต่ควร = FV ${c.fvBox}×${f} = ${exp.toFixed(2)}`); }); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E19', level: 'error', label: 'gauge marker ตรงกับ ราคา/FV', fn: (c) => { const cur = firstNum(grab(/getElementById\("mCur"\)\.style\.left\s*=\s*gpos\(([0-9.]+)\)/, c.html)); const fair = firstNum(grab(/getElementById\("mFair"\)\.style\.left\s*=\s*gpos\(([0-9.]+)\)/, c.html)); const bad = []; if (cur != null && c.px != null && Math.abs(cur - c.px) > Math.max(0.02 * c.px, 0.02)) bad.push(`marker ปัจจุบัน gpos(${cur}) ≠ ราคา ${c.px}`); if (fair != null && c.fvBox != null && Math.abs(fair - c.fvBox) > Math.max(0.02 * c.fvBox, 0.02)) bad.push(`marker เหมาะสม gpos(${fair}) ≠ Fair Value ${c.fvBox}`); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E20', level: 'error', label: 'Fair Value อยู่ในกรอบ low–high', fn: (c) => { if (c.fvBox == null) return null; const i = c.html.indexOf('class="fv-box"'); if (i === -1) return null; const m = c.html.slice(i, i + 700).match(/กรอบ\s*[฿$]?\s*([0-9.,]+)\s*[–\-]\s*[฿$]?\s*([0-9.,]+)/); if (!m) return null; const lo = firstNum(m[1]), hi = firstNum(m[2]); if (lo == null || hi == null) return null; if (lo > hi) return `กรอบ Fair Value สลับด้าน (${lo} > ${hi})`; if (c.fvBox < lo - 1e-9 || c.fvBox > hi + 1e-9) return `Fair Value ${c.fvBox} อยู่นอกกรอบ ${lo}–${hi}`; return null; } },

  { id: 'E21', level: 'error', label: 'วิธี P/E: ค่า = EPS × P/E ในคำอธิบาย', fn: (c) => { const m = c.methods.find((x) => /P\/E/i.test(x.name) && !/P\/BV/i.test(x.name)); if (!m || m.val == null) return null; const eps = firstNum(grab(/EPS[^0-9\-]*([0-9]+(?:\.[0-9]+)?)/i, m.desc)); const pe = firstNum(grab(/([0-9]+(?:\.[0-9]+)?)\s*x\b/i, m.desc)); if (eps == null || pe == null) return null; const exp = eps * pe; return Math.abs(exp - m.val) / m.val <= 0.03 ? null : `วิธี P/E แสดง ${m.val} แต่ EPS ${eps} × P/E ${pe} = ${exp.toFixed(2)}`; } },
  { id: 'E22', level: 'error', label: 'วิธี P/BV: ค่า = ratio × BVPS, ratio = (ROE−g)/(r−g)', fn: (c) => { const m = c.methods.find((x) => /P\/BV/i.test(x.name)); if (!m || m.val == null) return null; const ratio = firstNum(grab(/[≈=]\s*([0-9.]+)x?\s*[×x]\s*BVPS/, m.desc)); const bvps = firstNum(grab(/BVPS[^0-9]*([0-9]+(?:\.[0-9]+)?)/, m.desc)); if (ratio == null || bvps == null) return null; const bad = []; const exp = ratio * bvps; if (Math.abs(exp - m.val) / m.val > 0.03) bad.push(`แสดง ${m.val} แต่ ${ratio} × BVPS ${bvps} = ${exp.toFixed(2)}`); const roe = firstNum(grab(/ROE\s*([0-9.]+)\s*%/, m.desc)); const gg = firstNum(grab(/g\s*([0-9.]+)\s*%/, m.desc)); const rr = firstNum(grab(/r\s*([0-9.]+)\s*%/, m.desc)); if (roe != null && gg != null && rr != null && rr > gg) { const er = (roe - gg) / (rr - gg); if (Math.abs(er - ratio) > 0.05) bad.push(`ratio ${ratio} ≠ (ROE ${roe}−g ${gg})/(r ${rr}−g ${gg}) = ${er.toFixed(2)}`); } return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E23', level: 'error', label: 'ราคา header = ค่าตั้งต้นเครื่องคิดเลข', fn: (c) => { if (c.px == null || c.pxInput == null) return null; return Math.abs(c.px - c.pxInput) <= Math.max(0.02 * c.px, 0.02) ? null : `ราคา header ${c.px} ≠ ค่าเริ่มต้น input เครื่องคิดเลข ${c.pxInput} (ผู้ใช้จะเห็น MOS เริ่มต้นผิด)`; } },
  { id: 'E24', level: 'error', label: 'scenario: EPS ปี3 = EPS ฐาน×(1+g)³', fn: (c) => { if (c.baseEPS == null) return null; const nm = ['Bear', 'Base', 'Bull']; const bad = []; c.scenarios.forEach((s, i) => { if (s.eps == null || s.g == null) return; const exp = c.baseEPS * Math.pow(1 + s.g / 100, 3); if (Math.abs(exp - s.eps) / s.eps > 0.05) bad.push(`${nm[i] || i}: EPS ฐาน ${c.baseEPS}×(1+${s.g}%)³=${exp.toFixed(2)} ≠ EPS ปี3 ${s.eps}`); }); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E25', level: 'error', label: 'FV ในสรุป (verdict) = FV ในกล่อง', fn: (c) => { if (c.fvBox == null || c.vgridFV == null) return null; return Math.abs(c.vgridFV - c.fvBox) / c.fvBox <= 0.02 ? null : `สรุปแสดงมูลค่าเหมาะสม ${c.vgridFV} แต่กล่อง valuation = ${c.fvBox}`; } },
  { id: 'E26', level: 'error', label: 'gauge scale: เรียงขึ้น + MOS20/30 = FV×0.8/0.7', fn: (c) => { const bad = []; if (c.scaleNums.length >= 4) { const sorted = c.scaleNums.slice().sort((a, b) => a - b); if (c.scaleNums.join(',') !== sorted.join(',')) bad.push(`ป้าย scale ไม่เรียงน้อย→มาก: [${c.scaleNums.join(', ')}]`); } const FV = c.fvBox != null ? c.fvBox : c.constFV; if (FV != null) { const h = norm(c.html); const t20 = firstNum(grab(/([฿$]?[0-9.,]+)\s*<br>\s*<small>MOS 20%/, h)); const t30 = firstNum(grab(/([฿$]?[0-9.,]+)\s*<br>\s*<small>MOS 30%/, h)); if (t20 != null && Math.abs(t20 - FV * 0.8) > Math.max(0.025 * FV * 0.8, 0.01)) bad.push(`gauge MOS20% ${t20} ≠ FV×0.8 = ${(FV * 0.8).toFixed(2)}`); if (t30 != null && Math.abs(t30 - FV * 0.7) > Math.max(0.025 * FV * 0.7, 0.01)) bad.push(`gauge MOS30% ${t30} ≠ FV×0.7 = ${(FV * 0.7).toFixed(2)}`); } return bad.length ? bad.join(' ; ') : null; } },
  { id: 'E27', level: 'error', label: 'ราคาไม่เก่า/ไม่อยู่อนาคต', fn: (c) => { if (!c.priceAge) return null; const a = c.priceAge.ageDays; const errDays = parseInt(process.env.STALE_ERROR_DAYS || '120', 10); if (a < -7) return `วันที่ราคา (${c.priceAge.iso}) อยู่ในอนาคต ${-a} วัน`; if (a > errDays) return `ราคาเก่าเกินไป: ${c.priceAge.iso} (${a} วันที่แล้ว > ${errDays} วัน)`; return null; } },
  // ระบุโมเดล AI ที่ใช้วิเคราะห์ (footer แสดงโมเดลต่อ report จาก tag นี้ — บังคับให้ทุก report ประกาศโมเดลที่รันจริง)
  { id: 'E28', level: 'error', label: 'ระบุโมเดล AI (meta ai-model)', fn: (c) => { if (c.aiModel == null) return 'ไม่มี <meta name="ai-model" content="..."> — ต้องประทับโมเดล AI ที่ใช้วิเคราะห์ (เช่น "Claude Opus 4.8")'; if (!c.aiModel) return 'meta ai-model ว่างเปล่า'; if (/\[|\$\{|MODEL_NAME|TODO|xxx/i.test(c.aiModel)) return `ค่า ai-model ยังเป็น placeholder: "${c.aiModel}"`; if (!/^Claude\s+\S/i.test(c.aiModel)) return `ค่า ai-model ควรขึ้นต้นด้วย "Claude " (เช่น "Claude Opus 4.8") — พบ: "${c.aiModel}"`; return null; } },

  // ── stock-meta: บล็อก JSON ตัวเลขสำหรับเรียง/แสดงบนหน้า index — ต้อง "ตรงกับเลขที่โชว์" (กัน sort เพี้ยนจากเนื้อหา) ──
  { id: 'E29', level: 'error', label: 'มีบล็อก stock-meta (JSON ครบ key)', fn: (c) => {
    const sm = c.sm;
    if (!sm.present) return 'ไม่มี <script type="application/json" id="stock-meta"> — ต้องประกาศตัวเลขสรุป (price/fairValue/mos/upside/pe/dividendYield/roe) สำหรับเรียงหน้า index';
    if (!sm.ok) return `บล็อก stock-meta ไม่ใช่ JSON ที่ถูกต้อง: ${sm.err}`;
    const d = sm.data;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'stock-meta ต้องเป็น JSON object';
    if (typeof d.symbol !== 'string' || !d.symbol.trim()) return 'stock-meta ขาด "symbol" (string)';
    if (d.symbol.trim().toUpperCase() !== c.symbol.toUpperCase()) return `stock-meta.symbol "${d.symbol}" ≠ ชื่อไฟล์ "${c.symbol}"`;
    if (typeof d.currency !== 'string' || !/^[A-Z]{3}$/.test(d.currency)) return `stock-meta.currency ต้องเป็นรหัสสกุลเงิน 3 ตัว (เช่น "USD"/"THB") — พบ ${JSON.stringify(d.currency)}`;
    for (const k of SM_NUM_KEYS) {
      if (!(k in d)) return `stock-meta ขาดคีย์ "${k}"`;
      const v = d[k], allowNull = !SM_REQ_NUM.includes(k);
      if (allowNull) { if (v !== null && !isFiniteNum(v)) return `stock-meta.${k} ต้องเป็นตัวเลข หรือ null — พบ ${JSON.stringify(v)}`; }
      else if (!isFiniteNum(v)) return `stock-meta.${k} ต้องเป็นตัวเลข — พบ ${JSON.stringify(v)}`;
    }
    return null;
  } },
  { id: 'E30', level: 'error', label: 'stock-meta = เลขที่โชว์ (ราคา/FV/MOS)', fn: (c) => {
    const sm = c.sm; if (!sm.present || !sm.ok || !sm.data) return null; // E29 จับบล็อกเสีย/ขาดแล้ว
    const d = sm.data, bad = [];
    if (c.px != null && isFiniteNum(d.price) && Math.abs(d.price - c.px) > Math.max(0.02 * Math.abs(c.px), 0.02)) bad.push(`price ${d.price} ≠ ราคา header ${c.px}`);
    if (c.fvBox != null && isFiniteNum(d.fairValue) && Math.abs(d.fairValue - c.fvBox) > Math.max(0.01 * Math.abs(c.fvBox), 0.01)) bad.push(`fairValue ${d.fairValue} ≠ Fair Value ในกล่อง ${c.fvBox}`);
    if (c.mosBig != null && isFiniteNum(d.mos) && Math.abs(d.mos - c.mosBig) > TOL_MOS_PP) bad.push(`mos ${d.mos}% ≠ MOS ที่โชว์ ${c.mosBig}% (ต่าง > ${TOL_MOS_PP} จุด)`);
    return bad.length ? bad.join(' ; ') : null;
  } },
  { id: 'E31', level: 'error', label: 'stock-meta สอดคล้องในตัว (mos/upside)', fn: (c) => {
    const sm = c.sm; if (!sm.present || !sm.ok || !sm.data) return null;
    const d = sm.data; if (!isFiniteNum(d.price) || !isFiniteNum(d.fairValue) || d.price === 0 || d.fairValue === 0) return null;
    const bad = [];
    if (isFiniteNum(d.mos)) { const exp = (d.fairValue - d.price) / d.fairValue * 100; if (Math.abs(d.mos - exp) > TOL_MOS_PP) bad.push(`mos ${d.mos} ≠ (FV ${d.fairValue}−price ${d.price})/FV·100 = ${exp.toFixed(1)}`); }
    if (isFiniteNum(d.upside)) { const exp = (d.fairValue - d.price) / d.price * 100; const tol = Math.max(0.6, Math.abs(exp) * 0.05); if (Math.abs(d.upside - exp) > tol) bad.push(`upside ${d.upside} ≠ (FV ${d.fairValue}−price ${d.price})/price·100 = ${exp.toFixed(1)}`); }
    return bad.length ? bad.join(' ; ') : null;
  } },

  // คำโปรยธุรกิจใต้ <h1> (<div class="sub">) — build.js ดึงไปเป็น desc บนการ์ดหน้า index (ให้ผู้อ่านเห็นว่าบริษัททำธุรกิจอะไร)
  // บังคับให้ทุก report มี → การ์ดหน้ารวมไม่ fallback ไปโชว์ title ซ้ำ ๆ แทน
  { id: 'E32', level: 'error', label: 'คำโปรยธุรกิจใต้ <h1> (.sub → desc การ์ด index)', fn: (c) => {
    if (!c.sub) return 'ไม่มีคำโปรยธุรกิจ (<div class="sub"> ใต้ <h1>) — build.js ใช้เป็น desc บนการ์ดหน้า index (สรุปสั้น ๆ ว่าบริษัททำธุรกิจอะไร)';
    if (c.sub.length < 10) return `คำโปรยธุรกิจ (.sub) สั้นผิดปกติ (${c.sub.length} อักขระ): "${c.sub}" — ควรสรุปธุรกิจหลักของบริษัทพอให้เข้าใจ`;
    return null;
  } },

  // ทุก var(--x) ที่อ้างถึงต้องถูกนิยามใน <style> เดียวกัน (รายงาน expand แล้วมี palette ครบในตัว)
  // กันกรณี theme.badge/chgBg อ้าง var ที่ไม่มีในพาเลต (เช่น HMPRO ใช้ var(--orange) ที่ยังไม่ถูกนิยาม)
  // → CSS var ที่ resolve ไม่ได้ทำให้ background/สี "หายเงียบ ๆ" (เลขหัวข้อ 1–8 ไม่มีพื้นหลัง) โดย gate อื่นมองไม่เห็น
  // ข้าม var(--x, fallback) (มี fallback = ตั้งใจ) — จับเฉพาะ var(--x) ที่ไม่มี fallback และไม่ถูกนิยาม
  { id: 'E33', level: 'error', label: 'CSS var ที่อ้างถึงต้องถูกนิยาม (กันสี/พื้นหลังหายเงียบ)', fn: (c) => {
    const defined = new Set();
    for (const m of c.html.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
    const missing = new Set();
    for (const m of c.html.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) if (!defined.has(m[1])) missing.add(m[1]);
    return missing.size ? `อ้างถึง CSS var ที่ไม่ถูกนิยาม: ${[...missing].join(', ')} — สี/พื้นหลังจะหายเงียบ ๆ (เช่น พื้นหลังเลขหัวข้อ 1–8) เพิ่มตัวแปรใน _template/dashboard.css :root หรือแก้ theme ให้อ้างตัวที่มี` : null;
  } },

  { id: 'W01', level: 'warn', label: 'scenario: EPS×P/E ≈ ราคาเป้า', fn: (c) => { const bad = []; const nm = ['Bear', 'Base', 'Bull']; c.scenarios.forEach((s, i) => { if (s.tgt == null || s.eps == null || s.pe == null) return; const calc = s.eps * s.pe; const d = Math.abs(calc - s.tgt) / s.tgt; if (d > TOL_SCN_REL) bad.push(`${nm[i] || ('#' + i)}: EPS ${s.eps}×P/E ${s.pe}=${calc.toFixed(0)} ≠ target ${s.tgt} (ต่าง ${(d * 100).toFixed(0)}%)`); }); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'W02', level: 'warn', label: 'สกุลเงินปน', fn: (c) => { if (c.isTHB && /\$/.test(c.text)) { const n = (c.text.match(/\$/g) || []).length; return `รายงานสกุลบาท (฿) แต่พบ "$" ${n} จุดในเนื้อหา (ควรใช้ ฿)`; } if (!c.isTHB && /฿/.test(c.text)) { const n = (c.text.match(/฿/g) || []).length; return `รายงานสกุลดอลลาร์ ($) แต่พบ "฿" ${n} จุดในเนื้อหา`; } return null; } },
  { id: 'W03', level: 'warn', label: 'CSS เพี้ยน .seg-label', fn: (c) => /transform:transl\(/.test(c.html) ? 'พบ transform:transl( (ควรเป็น translate) — dead CSS .seg-label ใน template' : null },
  { id: 'W04', level: 'warn', label: 'สี verdict ตรงกับโซน MOS', fn: (c) => { if (c.mosBig == null) return null; const m = c.html.match(/class="mos-verdict (bad|ok|good)"/); if (!m) return null; const rank = { bad: 0, ok: 1, good: 2 }; const band = c.mosBig < 10 ? 'bad' : c.mosBig < 20 ? 'ok' : 'good'; return Math.abs(rank[m[1]] - rank[band]) >= 2 ? `กล่อง verdict เป็น "${m[1]}" แต่ MOS ${c.mosBig}% ควรอยู่โซน "${band}"` : null; } },
  { id: 'W05', level: 'warn', label: 'FV ≈ ค่าเฉลี่ยวิธีที่แสดง', fn: (c) => { if (c.fvBox == null) return null; const vals = [...c.html.matchAll(/class="mval">([^<]*)</g)].map((m) => firstNum(m[1])).filter((v) => v != null); if (vals.length < 2) return null; const mean = vals.reduce((a, b) => a + b, 0) / vals.length; const d = Math.abs(mean - c.fvBox) / c.fvBox; return d > 0.07 ? `Fair Value ${c.fvBox} ต่างจากค่าเฉลี่ยวิธี (${vals.join(', ')} → เฉลี่ย ${mean.toFixed(2)}) ${(d * 100).toFixed(0)}%` : null; } },
  { id: 'W06', level: 'warn', label: 'สรุป "ส่วนต่างจากราคา" ตรงกับ MOS', fn: (c) => { const FV = c.fvBox != null ? c.fvBox : c.constFV; if (FV == null || c.px == null) return null; const i = c.html.indexOf('ส่วนต่างจากราคา'); if (i === -1) return null; const cell = norm(c.html).slice(i, i + 120); const expensive = /แพง/.test(cell); const mos = (FV - c.px) / FV * 100; if (expensive !== (mos < 0)) return `สรุประบุ "${expensive ? 'แพง' : 'ถูก/MOS+'}" แต่ MOS จริง = ${mos.toFixed(1)}%`; const pct = firstNum(grab(/(-?[0-9.]+)\s*%/, cell)); if (pct != null && Math.abs(Math.abs(pct) - Math.abs(mos)) > 2.5) return `สรุประบุส่วนต่าง ~${pct}% แต่ MOS จริง = ${mos.toFixed(1)}%`; return null; } },
  { id: 'W07', level: 'warn', label: 'ตัวเลขพื้นฐานสมเหตุสมผล', fn: (c) => { const bad = []; if (c.px != null && c.px <= 0) bad.push(`ราคา ${c.px} ≤ 0`); const m = c.metrics; if (m.pe != null && (m.pe <= 0 || m.pe > 150)) bad.push(`P/E ${m.pe} ผิดวิสัย`); if (m.pbv != null && (m.pbv <= 0 || m.pbv > 20)) bad.push(`P/BV ${m.pbv} ผิดวิสัย`); if (m.yield != null && (m.yield < 0 || m.yield > 20)) bad.push(`Div yield ${m.yield}% ผิดวิสัย`); if (m.roe != null && (m.roe < -100 || m.roe > 200)) bad.push(`ROE ${m.roe}% ผิดวิสัย`); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'W08', level: 'warn', label: 'แหล่งข้อมูล ≥3 + อ้างอิงครบ', fn: (c) => { const bad = []; const line = grab(/(?:ที่มา|แหล่ง|อ้างอิง|ข้อมูลจาก|source)\s*[:：]?\s*([^<\n][^\n]*)/i, stripTags(c.header)); if (line) { const srcs = line.split(/\s*[\/,]\s*|\s+•\s+|\s+และ\s+/).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 40); if (srcs.length < 3) bad.push(`ระบุแหล่งที่มาเพียง ${srcs.length} แหล่ง (ควร ≥3)`); } if (!/เป้า|นักวิเคราะห์|consensus/i.test(c.text)) bad.push('ไม่พบราคาเป้านักวิเคราะห์'); if (!/52\s*สัปดาห์|52-week/i.test(c.text)) bad.push('ไม่พบช่วง 52 สัปดาห์'); if (!/FY\s?20\d\d|ไตรมาส|[1-4]Q\s?\/?\s?20\d\d|Q[1-4]\s?\/?\s?20\d\d/i.test(c.text)) bad.push('ไม่พบการอ้างอิงงวดงบ (FY/ไตรมาส)'); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'W09', level: 'warn', label: 'ความสดของราคา', fn: (c) => { if (!c.priceAge) return null; const a = c.priceAge.ageDays; const warnDays = parseInt(process.env.STALE_WARN_DAYS || '45', 10); const errDays = parseInt(process.env.STALE_ERROR_DAYS || '120', 10); if (a > warnDays && a <= errDays) return `ราคาเริ่มเก่า: ${c.priceAge.iso} (${a} วันที่แล้ว) — ควรอัปเดตก่อนเผยแพร่`; return null; } },
  // stock-meta P/E·Yield·ROE เทียบค่าที่โชว์ — เตือนเท่านั้น (label P/E/ROE ในรายงานไม่ standard เสมอ → ดึงไม่ได้บางไฟล์)
  { id: 'W10', level: 'warn', label: 'stock-meta P/E·Yield·ROE ≈ ที่โชว์', fn: (c) => { const sm = c.sm; if (!sm.present || !sm.ok || !sm.data) return null; const d = sm.data, m = c.metrics, bad = []; if (m.pe != null && isFiniteNum(d.pe) && Math.abs(d.pe - m.pe) > Math.max(0.05 * Math.abs(m.pe), 0.1)) bad.push(`pe ${d.pe} ≠ P/E ที่โชว์ ${m.pe}`); if (m.yield != null && isFiniteNum(d.dividendYield) && Math.abs(d.dividendYield - m.yield) > Math.max(0.1 * Math.abs(m.yield), 0.15)) bad.push(`dividendYield ${d.dividendYield} ≠ ปันผลที่โชว์ ${m.yield}`); if (m.roe != null && isFiniteNum(d.roe) && Math.abs(d.roe - m.roe) > Math.max(0.08 * Math.abs(m.roe), 0.5)) bad.push(`roe ${d.roe} ≠ ROE ที่โชว์ ${m.roe}`); return bad.length ? bad.join(' ; ') : null; } },
];

function checkHtml(html, name) {
  const ctx = buildCtx(html, name);
  const errors = [], warnings = [];
  for (const chk of CHECKS) {
    let res;
    try { res = chk.fn(ctx); } catch (e) { res = 'ตรวจไม่สำเร็จ: ' + e.message; }
    if (res) (chk.level === 'error' ? errors : warnings).push({ id: chk.id, label: chk.label, msg: res });
  }
  const errTotal = CHECKS.filter((c) => c.level === 'error').length;
  return { name, symbol: ctx.symbol, ctx, errors, warnings, errTotal, errPass: errTotal - errors.length };
}

module.exports = { checkHtml, buildCtx, parseScenarios, firstNum, CHECKS, REPORTS_DIR };

// ---------- CLI ----------
function main() {
  const argv = process.argv.slice(2);
  if (!fs.existsSync(REPORTS_DIR)) { console.error('❌ ไม่พบโฟลเดอร์ reports/'); process.exit(1); }
  let files = fs.readdirSync(REPORTS_DIR).filter((f) => /\.html$/i.test(f)).sort();
  if (argv.length) { const want = new Set(argv.map((a) => a.replace(/\.html$/i, '').toUpperCase())); files = files.filter((f) => want.has(f.replace(/\.html$/i, '').toUpperCase())); }
  if (!files.length) { console.error('❌ ไม่พบไฟล์รายงานให้ตรวจ'); process.exit(1); }

  console.log(`\n🔍 ตรวจคุณภาพรายงาน ${files.length} ไฟล์ (reports/)\n`);
  let totErr = 0, totWarn = 0, failFiles = 0;
  for (const f of files) {
    const r = checkHtml(expandReport(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8')), f);
    totErr += r.errors.length; totWarn += r.warnings.length;
    if (r.errors.length) { failFiles++; console.log(`✗ ${f.padEnd(13)} ${r.errPass}/${r.errTotal} ผ่าน — ${r.errors.length} ปัญหา`); }
    else console.log(`✓ ${f.padEnd(13)} ${r.errTotal}/${r.errTotal} ผ่าน${r.warnings.length ? `   (⚠ ${r.warnings.length})` : ''}`);
    for (const e of r.errors) console.log(`    ✗ [${e.id}] ${e.label}: ${e.msg}`);
    for (const w of r.warnings) console.log(`    ⚠ [${w.id}] ${w.label}: ${w.msg}`);
  }
  console.log('\n' + '─'.repeat(50));
  console.log(`สรุป: ${files.length - failFiles}/${files.length} ไฟล์ผ่าน • error ${totErr} • warning ${totWarn}`);
  if (totErr) { console.log('\n❌ มี error — ห้าม push (แก้รายงานให้ผ่านก่อน)\n'); process.exit(1); }
  console.log(`\n✅ ผ่าน quality gate — พร้อม build & push${totWarn ? ` (มี ${totWarn} warning ที่ควรดู)` : ''}\n`); process.exit(0);
}

if (require.main === module) main();
