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
    });
  }
  return cols;
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
    px: firstNum(grab(/<div class="px">([\s\S]*?)<\/div>/, html)),
    constFV: (() => { const m = html.match(/const\s+FV\s*=\s*([0-9]+(?:\.[0-9]+)?)/); return m ? parseFloat(m[1]) : null; })(),
    fvBox: fvIdx === -1 ? null : firstNum(grab(/class="r">([\s\S]*?)<\/div>/, html.slice(fvIdx))),
    mosBig: firstNum(grab(/class="big">([\s\S]*?)<\/div>/, html)),
    // สกุลเงินหลัก = สัญลักษณ์หน้าราคาใน header (.px) — ไม่ใช่แค่ "มี ฿ ที่ไหนสักแห่ง"
    // (กัน USD report ที่อ้างอิงค่าเงินบาทในข้อความ ไม่ให้ถูกตีว่าเป็นรายงานบาท)
    isTHB: (() => { const m = html.match(/<div class="px">\s*([฿$])/); return m ? m[1] === '฿' : (text.includes('฿') && !text.includes('$')); })(),
    scenarios: parseScenarios(html),
  };
}

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

  { id: 'W01', level: 'warn', label: 'scenario: EPS×P/E ≈ ราคาเป้า', fn: (c) => { const bad = []; const nm = ['Bear', 'Base', 'Bull']; c.scenarios.forEach((s, i) => { if (s.tgt == null || s.eps == null || s.pe == null) return; const calc = s.eps * s.pe; const d = Math.abs(calc - s.tgt) / s.tgt; if (d > TOL_SCN_REL) bad.push(`${nm[i] || ('#' + i)}: EPS ${s.eps}×P/E ${s.pe}=${calc.toFixed(0)} ≠ target ${s.tgt} (ต่าง ${(d * 100).toFixed(0)}%)`); }); return bad.length ? bad.join(' ; ') : null; } },
  { id: 'W02', level: 'warn', label: 'สกุลเงินปน', fn: (c) => { if (c.isTHB && /\$/.test(c.text)) { const n = (c.text.match(/\$/g) || []).length; return `รายงานสกุลบาท (฿) แต่พบ "$" ${n} จุดในเนื้อหา (ควรใช้ ฿)`; } if (!c.isTHB && /฿/.test(c.text)) { const n = (c.text.match(/฿/g) || []).length; return `รายงานสกุลดอลลาร์ ($) แต่พบ "฿" ${n} จุดในเนื้อหา`; } return null; } },
  { id: 'W03', level: 'warn', label: 'CSS เพี้ยน .seg-label', fn: (c) => /transform:transl\(/.test(c.html) ? 'พบ transform:transl( (ควรเป็น translate) — dead CSS .seg-label ใน template' : null },
  { id: 'W04', level: 'warn', label: 'สี verdict ตรงกับโซน MOS', fn: (c) => { if (c.mosBig == null) return null; const m = c.html.match(/class="mos-verdict (bad|ok|good)"/); if (!m) return null; const rank = { bad: 0, ok: 1, good: 2 }; const band = c.mosBig < 10 ? 'bad' : c.mosBig < 20 ? 'ok' : 'good'; return Math.abs(rank[m[1]] - rank[band]) >= 2 ? `กล่อง verdict เป็น "${m[1]}" แต่ MOS ${c.mosBig}% ควรอยู่โซน "${band}"` : null; } },
  { id: 'W05', level: 'warn', label: 'FV ≈ ค่าเฉลี่ยวิธีที่แสดง', fn: (c) => { if (c.fvBox == null) return null; const vals = [...c.html.matchAll(/class="mval">([^<]*)</g)].map((m) => firstNum(m[1])).filter((v) => v != null); if (vals.length < 2) return null; const mean = vals.reduce((a, b) => a + b, 0) / vals.length; const d = Math.abs(mean - c.fvBox) / c.fvBox; return d > 0.07 ? `Fair Value ${c.fvBox} ต่างจากค่าเฉลี่ยวิธี (${vals.join(', ')} → เฉลี่ย ${mean.toFixed(2)}) ${(d * 100).toFixed(0)}%` : null; } },
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
    const r = checkHtml(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8'), f);
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
