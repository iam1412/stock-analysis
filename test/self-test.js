#!/usr/bin/env node
'use strict';

/**
 * self-test.js — meta-test ของ check-reports.js
 * พิสูจน์ว่า quality gate ทำงานถูก 2 ทาง:
 *   - ไม่ false-positive : รายงานจริงที่ดีต้องผ่าน (0 error)
 *   - ไม่ false-negative : เมื่อจงใจใส่ข้อบกพร่อง check ที่เกี่ยวข้องต้อง "จับได้"
 *
 * ⚠️ กติกา fixture (บทเรียน 2026-07-13: 49e2e08 ทำ BBL เปลี่ยน → literal เก่าหาไม่เจอ
 *    → mutation กลายเป็น no-op เงียบ → fail 17 เคส ต้อง sync มือใน bc9788c):
 *   - mutation ทุกตัว "derive ค่าจากรายงานจริง ณ ตอนรัน" (buildCtx + regex เชิงโครงสร้าง)
 *     ห้าม hardcode literal ราคา/FV/MOS/จุดกราฟ จาก BBL.html — BBL โดน UPDATE ได้เสมอ
 *   - mutation ที่ apply แล้ว "ไม่เปลี่ยนอะไร" = fail ทันที (anchor เพี้ยน) ไม่ปล่อยผ่านเงียบ
 *   - เคสที่ขึ้นกับโซนค่าของฐาน (เช่น W06 โซน MOS) ต้อง "บังคับโซนเอง" ใน mutation
 *     ไม่พึ่งว่าฐานบังเอิญอยู่โซนไหน
 *
 * รัน: node test/self-test.js   (หรือ npm run test:self)
 * exit 0 = checker เชื่อถือได้, 1 = checker มีบั๊ก (หรือฐาน BBL เปลี่ยนโครงสร้างจน derive ไม่ได้)
 */

const fs = require('fs');
const path = require('path');
const { checkHtml, buildCtx, firstNum, FISCAL_REF_SRC } = require('./check-reports');
const { expandReport } = require('../build.js');  // BBL เป็น content-only template → expand เป็น HTML เต็มก่อน (เหมือน gate)

// ใช้รายงานจริงที่ผ่าน gate เป็น "ของดี" ฐาน แล้ว mutate เพื่อทดสอบ
const BASE_FILE = path.join(__dirname, '..', 'reports', 'BBL.html');
const base = expandReport(fs.readFileSync(BASE_FILE, 'utf8'));

// ── derive ค่าจริงของฐาน (ตัวเลขทั้งหมดใน mutation คำนวณจากตรงนี้ — ไม่มี literal) ──
const grab = (re, h) => { const m = String(h).match(re); return m ? m[1] : null; };
const C = buildCtx(base, 'BBL.html');
const PX = C.px;                       // ราคา header
const FV = C.fvBox;                    // Fair Value ในกล่อง
const MOS = FV != null && PX != null ? (FV - PX) / FV * 100 : null;
const iPE = C.methods.findIndex((m) => /P\/E/i.test(m.name) && !/P\/BV/i.test(m.name));
const iPBV = C.methods.findIndex((m) => /P\/BV/i.test(m.name));

// precondition ของฐาน — โครงต้องครบพอให้ derive ได้ ไม่งั้นบอกตรง ๆ ว่าอะไรหาย (อย่าปล่อยไป fail รายเคสแบบงง ๆ)
{
  const missing = [];
  const need = (cond, what) => { if (!cond) missing.push(what); };
  need(PX != null, 'ราคา header (.px)');
  need(FV != null, 'Fair Value (.fv-box .r)');
  need(C.mosBig != null, 'MOS (.mos-verdict .big)');
  need(C.baseEPS != null, 'EPS ฐาน (hint section 6)');
  need(C.priceAge != null, 'วันที่ราคา (header)');
  need(!!C.chg, 'ป้าย change (.chg)');
  need(C.rd && C.rd.ok && C.rd.data.chart && Array.isArray(C.rd.data.chart.data) && C.rd.data.chart.data.length >= 2, 'report-data.chart.data');
  need(C.sm && C.sm.ok && typeof C.sm.data.price === 'number', 'stock-meta (JSON)');
  need(C.scenarios.length >= 3 && C.scenarios.every((s) => s.tgt != null && s.eps != null && s.pe != null && s.g != null), 'scenario Bear/Base/Bull ครบ (tgt/eps/pe/g)');
  need(iPE >= 0 && iPBV >= 0, 'วิธีประเมิน P/E + P/BV (.vmethod)');
  if (iPE >= 0) {
    const d = C.methods[iPE].desc;
    need(firstNum(grab(/EPS[^0-9\-]*([0-9]+(?:\.[0-9]+)?)/i, d)) != null && firstNum(grab(/([0-9]+(?:\.[0-9]+)?)\s*x\b/i, d)) != null, 'desc วิธี P/E parse EPS×P/E ได้');
  }
  if (missing.length) {
    console.error('\n❌ ฐาน BBL ขาดโครงที่ fixture ต้องใช้ derive ค่า: ' + missing.join(' · '));
    console.error('   (รายงานเปลี่ยนโครงสร้าง? แก้ anchor ใน test/self-test.js ให้ตรงโครงใหม่)\n');
    process.exit(1);
  }
}

// ── helpers สร้าง mutation ──
const numStr = (v) => String(Math.round(v * 100) / 100);
const fmtPct = (v) => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 10) / 10) + '%';
// แทน "กลุ่มที่ 2" ของ pattern (prefix)(value)(suffix) ด้วยค่าใหม่ — pattern ยึดโครงสร้าง ไม่ยึดค่า
const mut3 = (re, val) => (h) => h.replace(re, (m, a, v, b) => a + val + b);
// แก้บล็อก JSON (stock-meta / report-data) แบบ parse → แก้ → stringify — ไม่ต้อง match ตัวเลขในไฟล์เลย
const mutJson = (id, fn) => (h) => h.replace(
  new RegExp(`(<script[^>]*id="${id}"[^>]*>)([\\s\\S]*?)(</script>)`, 'i'),
  (m, a, json, b) => { const d = JSON.parse(json); fn(d); return a + JSON.stringify(d) + b; });
// replace เฉพาะช่วงหลัง marker (กัน pattern เดียวกันไป match ที่อื่นก่อน เช่น "กรอบ" ของ P/E ในตาราง metric)
const mutSlice = (marker, re, repl) => (h) => { const i = h.indexOf(marker); return i === -1 ? h : h.slice(0, i) + h.slice(i).replace(re, repl); };
// แทน .mval ตัวที่ idx (ลำดับเดียวกับ C.methods)
const mutMval = (idx, val) => (h) => { let i = -1; return h.replace(/(<div class="mval">\s*[฿$]?)([0-9.,]+)(<\/div>)/g, (m, a, v, b) => (++i === idx ? a + val + b : m)); };
// เปลี่ยนข้อความป้าย change ใน header
const setChg = (txt) => (h) => h.replace(/(<div class="chg"[^>]*>)([\s\S]*?)(<\/div>)/i, (m, a, v, b) => a + txt + b);
// เปลี่ยนข้อความช่อง "ส่วนต่างจากราคา" ใน verdict
const setDiffCell = (txt) => (h) => h.replace(/(ส่วนต่างจากราคา<\/div>\s*<div class="v"[^>]*>)([\s\S]*?)(<\/div>)/, (m, a, v, b) => a + txt + b);
const addDays = (iso, d) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);

let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };
const errIds = (r) => new Set(r.errors.map((x) => x.id));
const allIds = (r) => new Set([...r.errors, ...r.warnings].map((x) => x.id));

console.log('\n🧪 self-test: ความถูกต้องของ check-reports.js\n');

// 1) ของดีต้องผ่าน (ไม่ false-positive)
const pristine = checkHtml(base, 'BBL.html');
const baseAll = allIds(pristine);
ok(pristine.errors.length === 0, 'รายงานจริง (BBL) ผ่านโดยไม่มี error' + (pristine.errors.length ? ' — got ' + [...errIds(pristine)].join(',') : ''));

// 2) จงใจทำพัง — check ที่เกี่ยวข้องต้องจับได้ (ไม่ false-negative)
//    guard: mutate แล้วไฟล์ต้อง "เปลี่ยนจริง" — ไม่งั้น = anchor หาไม่เจอ (โครง BBL เปลี่ยน) ให้ fail ดัง ๆ
const expect = (id, level, mutate, desc) => {
  const mutated = mutate(base);
  if (mutated === base) { ok(false, `${desc} → mutation ไม่เปลี่ยนอะไร (anchor ไม่ match — โครง BBL เปลี่ยน? แก้ pattern ใน self-test)`); return; }
  const r = checkHtml(mutated, 'BBL.html');
  const set = level === 'warn' ? allIds(r) : errIds(r);
  ok(set.has(id), `${desc} → ต้องเจอ ${id}` + (set.has(id) ? '' : ' (เจอ: ' + [...set].join(',') + ')'));
};
// ยืนยันว่า check หนึ่ง "ไม่" ฟ้อง (กัน false-positive) — precondition: ฐานเองต้องไม่ติด id นั้นอยู่ก่อน
const reject = (id, mutate, desc) => {
  if (baseAll.has(id)) { ok(false, `${desc} → ฐาน BBL ติด ${id} อยู่แล้ว (reject ทดสอบไม่ได้ — แก้รายงานหรือ fixture)`); return; }
  const mutated = mutate(base);
  if (mutated === base) { ok(false, `${desc} → mutation ไม่เปลี่ยนอะไร (anchor ไม่ match — โครง BBL เปลี่ยน? แก้ pattern ใน self-test)`); return; }
  const r = checkHtml(mutated, 'BBL.html');
  ok(!allIds(r).has(id), `${desc} → ต้องไม่เจอ ${id}` + (allIds(r).has(id) ? ' (แต่ดันเจอ!)' : ''));
};
// ฐานตามสภาพจริง (ไม่ mutate) ต้องไม่ติด id
const rejectBase = (id, desc) => ok(!baseAll.has(id), `${desc} → ต้องไม่เจอ ${id}` + (baseAll.has(id) ? ' (แต่ดันเจอ!)' : ''));

expect('E01', 'error', (h) => h.replace(/<!DOCTYPE html>/i, ''), 'ลบ DOCTYPE');
expect('E02', 'error', (h) => h.replace('lang="th"', 'lang="en"'), 'เปลี่ยน lang เป็น en');
expect('E04', 'error', (h) => h.replace(/<title>[\s\S]*?<\/title>/i, '<title>วิเคราะห์หุ้น — Dashboard</title>'), 'title ไม่มีชื่อย่อหุ้น');
expect('E06', 'error', (h) => h.replace('<div class="n">8</div>', '<div class="n">9</div>'), 'section 8 หาย');
expect('E10', 'error', (h) => h.replace(/ไม่ใช่คำแนะนำ[\s\S]*?หลักทรัพย์/, 'ข้อมูลทั่วไป'), 'ลบ disclaimer');
expect('E13', 'error', (h) => h.replace('<h1>', '<h1>[SYMBOL] '), 'แทรก placeholder [SYMBOL]');
expect('E13', 'error', (h) => h.replace('<div class="sub">', '<div class="sub">{{COMPANY}} '), 'เหลือ {{token}} จากโครงต้นแบบ (skeleton) ที่ยังไม่เติม');
expect('E14', 'error', (h) => h.replace('<div class="sub">', '<div class="sub">undefined '), 'แทรก "undefined" ในเนื้อหา');
expect('E15', 'error', mut3(/(const\s+FV\s*=\s*)([0-9.]+)()/, numStr(FV * 1.5)), 'FV ใน JS ไม่ตรงกล่อง');
expect('E16', 'error', mut3(/(<div class="big">)([\s\S]*?)(<\/div>)/, fmtPct(MOS + 40)), 'MOS โชว์เพี้ยน +40 จุด% จาก (FV−ราคา)/FV');
expect('E33', 'error', (h) => h.replace('var(--badge)', 'var(--orange-missing)'), 'อ้าง CSS var ที่ไม่ถูกนิยาม (เคส HMPRO badge → var(--orange) ก่อนเพิ่มในพาเลต)');
reject('E33', (h) => h.replace('var(--badge)', 'var(--ghost, #000)'), 'var(--x, fallback) มี fallback = ตั้งใจ → ต้องไม่ฟ้อง E33');
expect('W01', 'warn', mut3(/(<div class="tgt">\s*[฿$]?)([0-9.,]+)(<\/div>)/, numStr(C.scenarios[0].tgt * 4)), 'scenario target เพี้ยน (EPS×P/E ไม่ตรง)');
expect('W02', 'warn', (h) => h.replace('<div class="sub">', `<div class="sub">ราคา ${C.isTHB ? '$' : '฿'}999 `), 'แทรกสกุลเงินปน (คนละสกุลกับรายงาน)');
expect('E18', 'error', mut3(/(จุดซื้อ[^<]*20\s*%<\/div>\s*<div class="v[^"]*">\s*[฿$]?)([0-9.,]+)()/, numStr(FV)), 'จุดซื้อ MOS20 ≠ FV×0.8');
expect('E19', 'error', mut3(/(getElementById\("mCur"\)\.style\.left\s*=\s*gpos\()([0-9.]+)(\))/, numStr(PX * 1.5)), 'gauge marker ปัจจุบันไม่ตรงราคา');
expect('E20', 'error', mutSlice('class="fv-box"', /(กรอบ\s*[฿$]?\s*)([0-9.,]+)(\s*[–\-]\s*[฿$]?\s*)([0-9.,]+)/, `$1${numStr(FV * 1.5)}$3${numStr(FV * 1.6)}`), 'Fair Value อยู่นอกกรอบ');
expect('W04', 'warn', (h) => mut3(/(class="mos-verdict )(bad|ok|good)(")/, 'bad')(mut3(/(<div class="big">)([\s\S]*?)(<\/div>)/, '+50%')(h)), 'สี verdict (bad) ขัดกับ MOS สูง (+50% = โซน good)');
expect('W05', 'warn', mutMval(iPBV, numStr(FV * 4)), 'FV ไม่ใกล้ค่าเฉลี่ยวิธี');
// ── Tier 1/2: valuation-math, consistency, freshness, sourcing ──
expect('E21', 'error', mutMval(iPE, numStr(C.methods[iPE].val * 1.5)), 'วิธี P/E: ค่าไม่ตรง EPS×P/E');
expect('E22', 'error', mutMval(iPBV, numStr(C.methods[iPBV].val * 1.4)), 'วิธี P/BV: ค่าไม่ตรง ratio×BVPS');
expect('E23', 'error', mut3(/(id="pxIn"[^>]*value=")([0-9.]+)(")/, numStr(PX * 3)), 'ราคา header ≠ ค่าตั้งต้นเครื่องคิดเลข');
expect('E24', 'error', mut3(/(EPS ปี 3<\/span>\s*<span>~?\s*[฿$]?)([0-9.,]+)(<\/span>)/, numStr(C.scenarios[0].eps * 2)), 'EPS ปี3 ไม่ตรงการทบต้น (1+g)³');
expect('E25', 'error', mutSlice('class="vgrid"', /(มูลค่าเหมาะสม<\/div>\s*<div class="v">\s*[฿$]?)([0-9.,]+)/, `$1${numStr(FV * 1.3)}`), 'FV ในสรุป ≠ FV ในกล่อง');
expect('E26', 'error', mut3(/([฿$])([0-9.,]+)(<br>\s*<small>MOS 20%)/, numStr(FV)), 'gauge scale MOS20 ≠ FV×0.8');
// W06: ตัวเลขส่วนต่างในสรุปต้องใกล้ MOS จริง — เขียนให้เพี้ยน 9 จุด% (เกิน tol 3)
expect('W06', 'warn', setDiffCell(`MOS ~ ${fmtPct((MOS < 0 ? -1 : 1) * (Math.abs(MOS) + 9))}`), 'สรุประบุส่วนต่างเพี้ยน ~9 จุด% จาก MOS จริง');
// ── ขอบเกณฑ์ W06 (ขยับ 2.5 → 3 จุด% เมื่อ 17 ส.ค. 69) — คุมทั้งสองฝั่งของเส้น ──
// ช่องนี้เป็น prose แช่แข็ง ขณะที่ MOS เคลื่อนตามราคาที่ cron patch ทุกวัน ⇒ ดริฟต์ ≤3 จุด% ถือเป็นปกติของระบบ
const offMos = (pp) => setDiffCell(`MOS ~ ${fmtPct((MOS < 0 ? -1 : 1) * (Math.abs(MOS) + pp))}`);
reject('W06', offMos(2.8), 'ส่วนต่างเพี้ยน 2.8 จุด% (ใต้เกณฑ์ใหม่ 3) → ต้องไม่เตือน — เคสที่เปลี่ยนพฤติกรรมจากเกณฑ์เดิม 2.5');
expect('W06', 'warn', offMos(3.5), 'ส่วนต่างเพี้ยน 3.5 จุด% (เหนือเกณฑ์ใหม่) → ต้องยังเตือน');
expect('W07', 'warn', mut3(/(P\/E \(TTM\)<\/div>\s*<div class="v[^"]*">\s*~?)([0-9.,]+)(x)/, '750'), 'P/E ผิดวิสัย (750x)');
reject('W07', mut3(/(P\/E \(TTM\)<\/div>\s*<div class="v[^"]*">\s*~?)([0-9.,]+)(x)/, '480'), 'P/E ~480x (มัลติเพิลสูงจริงในตลาด AI เช่น ARM) → ไม่ใช่ค่าผิดวิสัย');
// W06 ทิศทาง: บังคับโซนเอง (ไม่พึ่งว่าฐานอยู่โซนไหน) — กด FV ให้ MOS จริง ~−15% แล้วเขียน "ถูก/MOS+" = พลิกขั้ว
expect('W06', 'warn', (h) => setDiffCell('ถูกกว่ามูลค่า MOS ~ +8%')(mutSlice('class="fv-box"', /(class="r">\s*[฿$]?)([0-9.,]+)/, `$1${numStr(PX / 1.15)}`)(h)), 'หุ้นแพง (MOS ~−15%) แต่เขียน "ถูก/MOS+" → พลิกขั้ว');
// โซนกลาง (เคส MPWR): ตั้ง FV = ราคา (MOS ~0) + เขียน "เต็มมูลค่า" → ไม่ขัดแย้ง ต้องไม่ฟ้อง
reject('W06', (h) => setDiffCell('MOS ~ 0% (เต็มมูลค่า)')(mutSlice('class="fv-box"', /(class="r">\s*[฿$]?)([0-9.,]+)/, `$1${numStr(PX)}`)(h)), 'MOS ~0% เขียน "เต็มมูลค่า" (เคส MPWR) → ไม่ฟ้องว่าขัดแย้ง');
expect('W08', 'warn', mut3(/(ที่มา\s*:)([^<]*)(<)/, ' SET'), 'แหล่งข้อมูล < 3');
// ── W08 การนับแหล่งข้อมูล: ต้องอ่าน "บรรทัดที่มา" ให้ถูกบรรทัด (17 ส.ค. 69) ──
// เดิมคำคีย์ /source/ ไม่บังคับคำเต็ม/ไม่บังคับ ":" → แมตช์กลางชื่อบริษัทแล้วนับคำโปรยธุรกิจเป็นแหล่ง
const setSrcLine = (txt) => mut3(/(ที่มา\s*:)([^<]*)(<)/, ` ${txt} `);
const setSub = (txt) => (h) => h.replace(/(<div class="sub">)([\s\S]*?)(<\/div>)/, (m, a, v, b) => a + txt + b);
reject('W08', setSrcLine('Yahoo Finance · SET.or.th · Investing.com'), 'ที่มาคั่นด้วย · 3 แหล่ง (เคส CHG/ZEN) → ต้องนับได้ 3 ไม่ใช่ก้อนเดียว');
expect('W08', 'warn', setSrcLine('Yahoo Finance, StockAnalysis.com'), 'ที่มา 2 แหล่ง → ต้องยังเตือน (กันเพิ่มตัวคั่นแล้วนับเฟ้อจนผ่านหมด)');
reject('W08', setSub('Eversource Energy — สาธารณูปโภคไฟฟ้าและก๊าซ'), 'ชื่อบริษัทมีคำว่า source กลางคำ (Ever·source· — เคส ES) → ต้องไม่ไปอ่านคำโปรยแทนบรรทัดที่มา');
reject('W08', setSub('Antero Resources Corporation'), 'ชื่อบริษัทมีคำว่า source กลางคำ (Re·source·s — เคส AR/CNQ/EOG/TRGP) → ต้องไม่ไปอ่านคำโปรย');
reject('W08', setSub('Insurance/dealer sourced • Cybersource'), 'คำที่ขึ้นต้น/ลงท้ายด้วย source (sourced/Cybersource — เคส CPRT/V) → ต้องไม่ใช่คำคีย์');
// คำคีย์ที่ถูกต้องต้องยังทำงาน: "Source:" ภาษาอังกฤษ = คำเต็ม + มี ":" → ต้องอ่านบรรทัดนั้นและนับได้
// (ฐาน BBL มีบรรทัด "ที่มา:" 3 แหล่งอยู่ท้าย header — ถ้าไม่จับ "Source:" ที่แทรกไว้ก่อนหน้า จะไหลไปอ่านบรรทัดนั้นแล้วเงียบ)
expect('W08', 'warn', setSub('Source: Yahoo Finance'), 'คำคีย์ "Source:" (คำเต็ม + มี :) → ต้องอ่านบรรทัดนั้นจริง แล้วฟ้องว่าแหล่งไม่พอ');
// ชื่อแหล่งปฐมภูมิยาวเกิน 40 ตัวอักษรเป็นเรื่องปกติ (57 ตัวอักษรในเคส MNST) — ต้องนับ ไม่ใช่กรองทิ้ง
reject('W08', setSrcLine('Yahoo Finance · StockAnalysis.com · Monster Beverage Q2 FY2026 Earnings Release (6 ส.ค. 2569)'), 'แหล่งที่ 3 เป็นชื่อยาว 57 ตัวอักษร (เคส GGG/MNST/TTW) → ต้องนับเป็นแหล่ง ไม่ใช่กรองทิ้ง');
expect('W08', 'warn', setSrcLine('Yahoo Finance · StockAnalysis.com · ' + 'ก'.repeat(90)), 'ก้อนยาวผิดปกติ >80 ตัวอักษร (คำโปรยหลุดมาทั้งย่อหน้า) → ต้องยังกรองทิ้งแล้วเตือน');
// ── W08 งวดงบ: ต้องรับทุกรูปแบบที่รายงานจริงใช้ (สำรวจคลัง 17 ส.ค. 69 — เดิมรับแต่ FY ค.ศ. 4 หลัก) ──
// วิธี: ลบการอ้างอิงงวดงบ "ทุกแบบที่ check ยอมรับ" ออกจากฐาน แล้วฉีดกลับทีละรูปแบบ
//   - ตัวลบ derive จาก FISCAL_REF_SRC ของ check เอง → ลบได้ครบเสมอแม้เพิ่มรูปแบบใหม่ทีหลัง (ไม่ต้อง sync มือ)
//   - ตัวฉีดเป็น literal → เป็นหลักฐานอิสระว่ารูปแบบนั้น "ผ่านจริง" ไม่ใช่แค่สะท้อน regex กลับมา
const stripFiscal = (h) => h.replace(new RegExp(FISCAL_REF_SRC, 'gi'), '—');
const withFiscal = (tok) => (h) => stripFiscal(h).replace(/<\/body>/i, `<div class="mdesc">อิงงบ ${tok}</div></body>`);
expect('W08', 'warn', stripFiscal, 'ลบการอ้างอิงงวดงบทุกรูปแบบ → ต้องยังฟ้องว่าไม่พบงวดงบ');
reject('W08', withFiscal('FY2568'), 'ปีงบ พ.ศ. 4 หลัก (FY2568 — เคส ADVICE/AAI) → ต้องนับว่าอ้างงวดงบแล้ว');
reject('W08', withFiscal('Q1/2569'), 'ไตรมาส พ.ศ. (Q1/2569) → ต้องนับว่าอ้างงวดงบแล้ว');
reject('W08', withFiscal('4Q/2568'), 'ไตรมาสรูปแบบ 4Q/2568 (พ.ศ.) → ต้องนับว่าอ้างงวดงบแล้ว');
reject('W08', withFiscal('FY25'), 'ปีงบย่อ 2 หลัก (FY25 — เคส AME/ODFL/ROP) → ต้องนับว่าอ้างงวดงบแล้ว');
reject('W08', withFiscal('FY26E'), 'ปีงบย่อ + suffix ประมาณการ (FY26E) → ต้องนับ (กัน \\b ท้ายรูปแบบที่จะพังกับ E)');
reject('W08', withFiscal("FY'68"), 'ปีงบย่อแบบมี apostrophe (FY\'68) → ต้องนับว่าอ้างงวดงบแล้ว');
reject('W08', withFiscal('FY พ.ย. 2568'), 'ปีงบไม่ตรงปฏิทิน ระบุเดือนสิ้นงวด (FY พ.ย. 2568 — เคส MKC) → ต้องนับ');
reject('W08', withFiscal('FY สิ้นสุด 30 ก.ย. 2568'), 'ปีงบแบบ "FY สิ้นสุด 30 ก.ย. 2568" → ต้องนับว่าอ้างงวดงบแล้ว');
reject('W08', withFiscal('FYE 30 เม.ย. 2569'), 'ปีงบแบบ FYE 30 เม.ย. 2569 → ต้องนับว่าอ้างงวดงบแล้ว');
reject('W08', withFiscal('FY2025'), 'ปีงบ ค.ศ. 4 หลัก (FY2025) → ยังต้องผ่านเหมือนเดิม (กัน regression ของเก่า)');
// ไม่ใช่การอ้างงวดงบ: มีคำว่า FY ลอย ๆ หรือปีลอย ๆ แต่ไม่ผูกกับงวด → ต้องยังฟ้อง (กันขยายจนรับทุกอย่าง)
expect('W08', 'warn', (h) => stripFiscal(h).replace(/<\/body>/i, '<div class="mdesc">ปีงบ FY ของบริษัทนี้ไม่ตรงปฏิทิน · ข้อมูล ณ 26 มิ.ย. 2569</div></body>'), 'FY ลอย + ปีลอย (ไม่ผูกงวด) → ต้องยังฟ้องว่าไม่พบงวดงบ');
expect('E28', 'error', (h) => h.replace(/<meta\s+name="ai-model"[^>]*>/i, ''), 'ลบ meta ai-model → ต้องบังคับให้ระบุโมเดล');
expect('E28', 'error', (h) => h.replace(/content="Claude[^"]*"/i, 'content="GPT-4"'), 'ai-model ไม่ใช่ Claude → ค่าผิด');
expect('E28', 'error', (h) => h.replace(/content="Claude[^"]*"/i, 'content="{{AI_MODEL}}"'), 'ai-model เหลือ token จาก skeleton → ต้องจับได้ (ไม่ปล่อยรุ่นปลอม)');
expect('E28', 'error', (h) => h.replace(/content="Claude[^"]*"/i, 'content="Claude Sonnet"'), 'ai-model ไม่มีเลขเวอร์ชัน → ระบุรุ่นไม่ครบ');
expect('E28', 'error', (h) => h.replace(/content="Claude[^"]*"/i, 'content="Claude 5"'), 'ai-model ไม่มีชื่อตระกูล (Opus/Sonnet/…) → ระบุรุ่นไม่ครบ');
expect('E28', 'error', (h) => h.replace(/content="Claude[^"]*"/i, 'content="Claude Sonet 5"'), 'ai-model สะกดตระกูลผิด → ต้องจับได้');
reject('E28', (h) => h.replace(/content="Claude[^"]*"/i, 'content="Claude Opus 5"'), 'ai-model = Claude Opus 5 (escalate หุ้นยาก) → ต้องไม่ฟ้อง');
reject('E28', (h) => h.replace(/content="Claude[^"]*"/i, 'content="Claude Sonnet 4.6"'), 'ai-model = รุ่นเก่าที่เคยใช้จริง (Sonnet 4.6) → ต้องไม่ฟ้อง');
// ── E32: คำโปรยธุรกิจใต้ <h1> (.sub → desc การ์ด index) ──
expect('E32', 'error', (h) => h.replace(/<div class="sub">[\s\S]*?<\/div>/i, '<div class="sub"></div>'), 'ลบคำโปรยธุรกิจ (.sub) → ต้องบังคับให้มี desc');
reject('E32', (h) => h.replace('<div class="sub">', '<div class="sub">ผู้ผลิตอุปกรณ์กึ่งตัวนำ '), 'คำโปรยธุรกิจปกติ (ยาวพอ) ต้องไม่ฟ้อง E32');
// ── stock-meta (E29–31, W10) — แก้ผ่าน JSON parse→stringify ไม่ยึด literal ตัวเลขในไฟล์ ──
expect('E29', 'error', (h) => h.replace(/<script[^>]*id="stock-meta"[\s\S]*?<\/script>/i, ''), 'ลบบล็อก stock-meta → ต้องบังคับให้มี');
expect('E29', 'error', mutJson('stock-meta', (d) => { delete d.roe; }), 'stock-meta ขาดคีย์ roe');
expect('E29', 'error', mutJson('stock-meta', (d) => { d.price = String(d.price); }), 'stock-meta.price เป็น string ไม่ใช่ตัวเลข');
expect('E30', 'error', mutJson('stock-meta', (d) => { d.price = d.price * 5; }), 'stock-meta.price ≠ ราคาที่โชว์ → ตรวจข้ามแหล่งในไฟล์');
expect('E31', 'error', mutJson('stock-meta', (d) => { d.upside = (d.upside || 0) + 99; }), 'stock-meta.upside ไม่สอดคล้องกับราคา&FV');
expect('W10', 'warn', mutJson('stock-meta', (d) => { d.pe = (d.pe || 10) * 6; }), 'stock-meta.pe ≠ P/E ที่โชว์ (เตือน)');
// freshness — จำลอง "วันนี้" ผ่าน env STALE_TODAY โดยนับจากวันที่ราคาจริงของฐาน (ไม่ hardcode วัน)
{
  const today = addDays(C.priceAge.iso, 200);
  process.env.STALE_TODAY = today;
  const r = checkHtml(base, 'BBL.html');
  ok(errIds(r).has('E27'), `ราคาเก่า > 120 วัน (จำลองวันนี้ ${today} = วันที่ราคา +200 วัน) → ต้องเจอ E27` + (errIds(r).has('E27') ? '' : ' (เจอ: ' + [...errIds(r)].join(',') + ')'));
  delete process.env.STALE_TODAY;
}
{
  const today = addDays(C.priceAge.iso, 60);
  process.env.STALE_TODAY = today;
  const r = checkHtml(base, 'BBL.html');
  ok(allIds(r).has('W09') && !errIds(r).has('E27'), `ราคาเก่า 45–120 วัน (จำลองวันนี้ ${today} = +60 วัน) → ต้องเตือน W09 (ไม่ block)` + (allIds(r).has('W09') ? '' : ' (เจอ: ' + [...allIds(r)].join(',') + ')'));
  delete process.env.STALE_TODAY;
}
// ★ วันที่ราคา ≠ วันที่อื่นในหัวรายงาน (regression 9 ส.ค. 2569)
// parsePriceAge เดิมอ่าน "token สุดท้ายใน 140 ตัวอักษรหลังคำว่า ราคา" ⇒ หัวรายงานที่มีวัน ATH /
// วันประกาศงบต่อท้าย จะอ่านโดนวันที่นั้นแทนวันที่ราคา (INTC/AMKR/ADVICE/RKLB) → staleness เพี้ยน
// เดิมไม่ระเบิดเพราะ cron ก็ประทับวันที่รันทับ token ทุกตัวเหมือนกัน — พอแก้ cron แล้วต้องแก้ที่นี่ด้วย
{
  const M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const thai = (iso) => { const d = new Date(Date.parse(iso)); return `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`; };
  const athDay = addDays(C.priceAge.iso, -300);   // วัน ATH เก่ากว่าวันที่ราคา 300 วัน (พ้นเกณฑ์ E27 120 วัน)
  const withATH = base.replace(/(<div class="px-meta">)/i,
    `$1\n        ราคาเคยขึ้นสูงสุดตลอดกาล ฿999 (${thai(athDay)}) · ประกาศงบ ${thai(addDays(C.priceAge.iso, -200))}<br>`);
  ok(withATH !== base, 'fixture ATH/วันประกาศงบ apply แล้วเปลี่ยนจริง (anchor px-meta ไม่เพี้ยน)');
  const cA = buildCtx(withATH, 'BBL.html');
  ok(cA.priceAge && cA.priceAge.iso === C.priceAge.iso,
    `หัวรายงานมีวัน ATH/วันประกาศงบต่อท้าย → ยังอ่าน "วันที่ราคา" ตัวเดิม`,
    `อ่านได้ ${cA.priceAge && cA.priceAge.iso} ควรเป็น ${C.priceAge.iso}`);
  process.env.STALE_TODAY = addDays(C.priceAge.iso, 1);
  const rA = checkHtml(withATH, 'BBL.html');
  ok(!errIds(rA).has('E27') && !allIds(rA).has('W09'),
    'ราคาสดแต่มีวันที่เก่าในหัวรายงาน → ต้องไม่ฟ้อง staleness ปลอม (E27/W09)',
    [...allIds(rA)].join(','));
  delete process.env.STALE_TODAY;
}

// ── E34/E35/E36/E37/W12: ป้าย change รอบปี + กราฟ ~1 ปี (กฎ CLAUDE.md ข้อ 2 — มิ.ย. 2026) ──
// E34: บังคับ theme เป็นเขียวใน mutation เอง (ไม่พึ่งว่าฐานปีนี้ขึ้นหรือลง) แล้วใส่ป้ายขาลง → ขัดสี
expect('E34', 'error', (h) => setChg('▼ −31% ในรอบปี')(mutJson('report-data', (d) => { d.theme = d.theme || {}; d.theme.chgBg = 'var(--green-soft)'; d.theme.chgColor = '#1e8e3e'; })(h)), 'ป้าย change ขาลง (▼ −) แต่ theme เขียว (เคส HMPRO/CPF) → ต้องจับ E34');
reject('E34', setChg('≈ ทรงตัว ในรอบปี'), 'ป้าย change "ทรงตัว" (ไม่มีทิศทาง) → ต้องไม่ฟ้อง E34');
// E35: header % ต้องเป็นผลตอบแทน "รอบปี" ไม่ใช่ % รายวัน/ช่วงอื่น (ยกเว้น IPO)
expect('E35', 'error', setChg('▲ +5.8% (22 มิ.ย.)'), 'ป้าย % รายวัน "(22 มิ.ย.)" (ไม่ใช่ "รอบปี") → ต้องจับ E35');
expect('E35', 'error', setChg(''), 'header ไม่มีป้าย % (.chg ว่าง) → ต้องจับ E35');
reject('E35', setChg('▲ +12.3% (ตั้งแต่ IPO)'), 'หุ้น IPO <1 ปี ใช้ "(ตั้งแต่ IPO)" → ต้องไม่ฟ้อง E35');
rejectBase('E35', `ป้ายฐาน "${C.chg}" (รอบปี + ทิศทาง) → ต้องไม่ฟ้อง E35`);
// E36: % รอบปี ต้อง = ผลตอบแทนปลายกราฟ — ใส่ % ห่างจากปลายกราฟจริง +50 จุด (เกิน tol 12)
{
  const data = C.rd.data.chart.data;
  const chartPct = (data[data.length - 1][1] - data[0][1]) / data[0][1] * 100;
  const far = chartPct + 50;
  const farChg = (far >= 0 ? '▲ +' + far.toFixed(1) : '▼ −' + Math.abs(far).toFixed(1)) + '% ในรอบปี';
  expect('E36', 'error', setChg(farChg), `headline "${farChg}" ขัดกับปลายกราฟ (~${chartPct.toFixed(1)}%) → ต้องจับ E36`);
}
reject('E36', setChg('≈ ทรงตัว (รอบปี)'), 'ป้าย "ทรงตัว" (ไม่มี %) → ต้องไม่ฟ้อง E36');
// E37: กราฟต้อง ~1 ปี (ไม่เกิน ~13 จุด) — ขยายเป็น 14 จุดต้องโดนจับ
expect('E37', 'error', mutJson('report-data', (d) => {
  while (d.chart.data.length <= 13) { const last = d.chart.data[d.chart.data.length - 1]; d.chart.data.push(['x' + d.chart.data.length, last[1]]); }
}), 'กราฟ 14 จุด (>13 = เกิน ~1 ปีรายเดือน) → ต้องจับ E37');
rejectBase('E37', `กราฟฐาน BBL (${C.rd.data.chart.data.length} จุด ~1 ปี) → ต้องไม่ฟ้อง E37`);
expect('W12', 'warn', mutJson('report-data', (d) => { d.chart.data[0][0] = ''; }), 'จุดกราฟแรก label ว่าง (["",…]) → เตือน W12');
// E39: จุดกราฟต้องเรียงเวลาเดินหน้า — สลับจุดสองจุดแรกของกราฟจริง (derive จากฐาน ไม่ hardcode label/ค่า)
expect('E39', 'error', mutJson('report-data', (d) => { const arr = d.chart.data; const t = arr[0]; arr[0] = arr[1]; arr[1] = t; }), `สลับจุดกราฟสองจุดแรก ("${C.rd.data.chart.data[0][0]}" ↔ "${C.rd.data.chart.data[1][0]}") → ต้องจับ E39`);
rejectBase('E39', `กราฟฐาน BBL (${C.rd.data.chart.data.length} จุด เรียงเวลาถูกต้อง) → ต้องไม่ฟ้อง E39`);
// อนุรักษนิยม: ลำดับย้อนจริง แต่มี label รูปแบบไม่รู้จักปนอยู่ → ต้องข้าม ไม่เดา (กัน false error บล็อก cron)
reject('E39', mutJson('report-data', (d) => {
  const arr = d.chart.data;
  arr[0] = [arr[0][0] + '?', arr[0][1]];   // ทำให้ label จุดแรกเป็นรูปแบบที่ parseChartLabelKey อ่านไม่ออก
  const t = arr[0]; arr[0] = arr[1]; arr[1] = t;   // แล้วสลับให้ลำดับเวลาย้อนกลับจริง (parse ได้จะต้องโดน E39)
}), 'จุดกราฟสลับลำดับจริง แต่มี label รูปแบบไม่รู้จักปนอยู่ → ต้องไม่เดา ไม่ฟ้อง E39');

// ── E38: contrast ธีมอ่านออก — WCAG AA (ก.ค. 2026) ──
// derive สีทดสอบจากธีมจริงของฐาน: verdictText = stop แรก (เข้มสุด) ของ gradient ตัวเอง → contrast ~1 แบบเคส ADP/DIS
expect('E38', 'error', mutJson('report-data', (d) => { d.theme = d.theme || {}; const m = String(d.theme.darkGrad || '').match(/#[0-9a-fA-F]{6}/); d.theme.verdictText = m ? m[0] : '#202938'; }), 'verdictText สีเดียวกับ gradient ของตัวเอง (เคส ADP/DIS ตัวหนังสือล่องหน) → ต้องจับ E38');
expect('E38', 'error', mutJson('report-data', (d) => { d.theme = d.theme || {}; d.theme.badge = '#f9ab00'; }), 'badge เหลืองสดเป็นพื้นตัวหนังสือขาว (เคส CAT) → ต้องจับ E38');
expect('E38', 'error', mutJson('report-data', (d) => { d.theme = d.theme || {}; d.theme.headerMuted = 'rgba(255,255,255,0.12)'; }), 'headerMuted rgba alpha ต่ำ (แทบล่องหนบน gradient — เคส ORLY/MCD) → ต้องจับ E38 หลัง composite');
reject('E38', mutJson('report-data', (d) => { d.theme = d.theme || {}; if (d.theme.subColor) d.theme.subColor = d.theme.subColor.toUpperCase(); }), 'ธีมจริงของฐาน (สีเดิม แค่เปลี่ยน case hex) → ต้องไม่ฟ้อง E38');
// ── E38: คู่สีที่ derive ตอน build (GUI redesign ส.ค. 2026 — spec §3.4) ──
expect('E38', 'error', mutJson('report-data', (d) => { d.theme = d.theme || {}; d.theme.accentDark = '#8aa5c8'; }), 'accentDark อ่อน (ฟ้าหม่น) — ขาวบน accentDark ~2.4:1 → ต้องจับ E38');
reject('E38', mutJson('report-data', (d) => { d.theme = d.theme || {}; d.theme.accent = '#0a7a3d'; d.theme.accentDark = '#0a5c2e'; }), 'ธีมเขียวเข้มมาตรฐาน — ทุกคู่ derive ผ่าน → ต้องไม่ฟ้อง E38');
// fix-contrast ต้อง idempotent (ธีมผ่านแล้วรันซ้ำ = 0 diff) และซ่อมธีมพังจนผ่านจริง
{
  const { fixTheme } = require('../tools/fix-contrast.js');
  const theme0 = (C.rd && C.rd.ok && C.rd.data.theme) || {};
  ok(Object.keys(fixTheme(theme0).changed).length === 0, 'fix-contrast: ธีมฐานที่ผ่าน gate → รันซ้ำไม่แก้อะไร (idempotent)');
  const m0 = String(theme0.darkGrad || '').match(/#[0-9a-fA-F]{6}/);
  const broken = { ...theme0, verdictText: m0 ? m0[0] : '#202938', badge: '#f9ab00' };
  const once = fixTheme(broken);
  ok(Object.keys(once.changed).length > 0, 'fix-contrast: ธีมพัง → มี field ถูกซ่อม');
  ok(Object.keys(fixTheme(once.theme).changed).length === 0, 'fix-contrast: ธีมที่ซ่อมแล้ว รันซ้ำ = 0 diff');
}

// ── กัน false-positive (จากผล adversarial review) ──
reject('E13', (h) => h.replace('<h1>', '<h1>[NASDAQ] '), 'ticker/exchange ในวงเล็บ [NASDAQ] ไม่ใช่ placeholder');
reject('E13', (h) => h.replace('<h1>', '<h1>[ADR] '), 'acronym [ADR] ไม่ใช่ placeholder');
reject('E12', (h) => h.replace(/(ราคา[^<]*?)(20\d\d)/, (m, a, y) => a + (parseInt(y, 10) + 543)), 'ปี พ.ศ. ยังถือว่ามีปีในวันที่ราคา');
reject('E06', (h) => h.replace('<div class="n">1</div>', '<div class="n active">1</div>'), 'section badge มี class เพิ่มก็ยังนับว่าครบ');
reject('E29', mutJson('stock-meta', (d) => { d.dividendYield = null; }), 'stock-meta: dividendYield = null (หุ้นไม่จ่ายปันผล) ยังถือว่าถูกต้อง');
reject('W10', mutJson('stock-meta', (d) => { d.dividendYield = null; }), 'stock-meta: yield = null → ข้ามการเทียบ ไม่เตือน W10');
// ── W10 parser: การ์ดปันผลที่เขียน "จำนวนเงินต่อหุ้น" นำหน้า % — parser ต้องคว้าค่า % ไม่ใช่เลขตัวแรก (เคส O/STZ/TAP 17 ส.ค. 69) ──
const setYieldCard = (txt) => (h) => h.replace(/(<div class="k">[^<]*เงินปันผล[^<]*<\/div>\s*<div class="v[^"]*">)([^<]*)(<)/, (m, a, v, z) => a + txt + z);
const smYield = C.sm.data.dividendYield;
reject('W10', setYieldCard(`~฿1.92 (~${smYield}%)`), 'การ์ดปันผลเขียนจำนวนเงินก่อน % (~฿1.92 (~6.3%)) → parser ต้องอ่านค่า % ไม่ใช่ 1.92 → ไม่เตือน W10');
expect('W10', 'warn', setYieldCard(`~฿1.92 (~${(smYield * 3).toFixed(1)}%)`), 'รูปแบบเดียวกันแต่ค่า % ผิดจริง (×3) → ต้องยังเตือน W10 (parser ไม่ได้ปิดตา แค่อ่านให้ถูกตัว)');
reject('W10', setYieldCard('$3.25'), 'การ์ดปันผลแสดงจำนวนเงินล้วน ไม่มี % (เคส O "เงินปันผล (รายปี) $3.25") → ไม่ใช่ yield ต้องข้าม ไม่เอา 3.25 ไปเทียบกับ %');
// W07 ใช้ yield ตัวเดียวกัน — การ์ดจำนวนเงินล้วนต้องไม่ทำให้ W07 ฟ้อง "yield ผิดวิสัย" ด้วย
reject('W07', setYieldCard('$45.00'), 'การ์ดปันผลจำนวนเงินล้วน $45 → parser คืน null → W07 ไม่ฟ้องว่า yield 45% ผิดวิสัย');

// ── E40 / W13: ความถูกต้องของ tag ต่อหุ้น ──
// E40/W13 อ่าน tag จากไฟล์บนดิสก์ ไม่ใช่จาก HTML ⇒ mutation แบบแก้สตริงฉีดไม่ได้
// จึงต้องฉีดผ่าน opts.tagData (ช่องที่ออกแบบไว้ให้เทสโดยเฉพาะ)
{
  const T = require('../tools/tag-lib.js');
  const list = [
    { slug: 'thai-consumption', label: 'การบริโภคในประเทศไทย', aliases: ['ค้าปลีก'], desc: 'd', kind: 'driver' },
    { slug: 'thai-bank', label: 'ธนาคารไทย', aliases: ['แบงก์ไทย'], desc: 'd', kind: 'business' },
  ];
  const vocab = { version: 1, list, bySlug: new Map(list.map((e) => [e.slug, e])) };
  const mk = (slugs) => ({ vocabVersion: 1, tags: slugs ? { BBL: slugs } : {}, requests: [] });
  const run = (slugs) => checkHtml(base, 'BBL.html', { tagData: mk(slugs), vocab });

  const good = run(['thai-consumption', 'thai-bank']);
  ok(!errIds(good).has('E40'), 'E40: tag ถูกต้อง → ไม่ยิง');
  ok(!allIds(good).has('W13'), 'W13: มี 2 tag → ไม่ยิง');

  ok(errIds(run(null)).has('E40'), 'E40: ไม่มี entry ใน tags.json → ยิง');
  ok(errIds(run(['ไม่มีจริง'])).has('E40'), 'E40: slug นอกคลัง → ยิง');
  ok(errIds(run(['thai-consumption', 'thai-bank', 'thai-consumption', 'thai-bank'])).has('E40'), 'E40: เกิน 3 slug → ยิง');
  ok(errIds(run(['thai-consumption', 'thai-consumption'])).has('E40'), 'E40: slug ซ้ำกันเอง → ยิง');

  // W13 ใหม่: เตือนเมื่อ "ไม่มีธีมธุรกิจเลย" ไม่ใช่ "มี tag เดียว"
  const oneBiz = run(['thai-bank']);                    // ธีม business เดี่ยว = ถูกต้อง ต้องเงียบ
  ok(!allIds(oneBiz).has('W13'), 'W13: ธีมธุรกิจเดี่ยว → ไม่ยิง (ไม่ใช่ข้อบกพร่อง)');
  ok(!errIds(oneBiz).has('E40'), 'W13: ธีมธุรกิจเดี่ยว → E40 ไม่ยิงด้วย');
  const driverOnly = run(['thai-consumption']);         // มีแต่ธีม driver = บอกไม่ได้ว่าทำอะไร
  ok(allIds(driverOnly).has('W13'), 'W13: มีแต่ธีม driver → ยิง');
  ok(!errIds(driverOnly).has('E40'), 'W13: มีแต่ธีม driver → เป็น warning ไม่ใช่ error');
}

console.log('\n' + '─'.repeat(50));
console.log(`self-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ checker มีบั๊ก — แก้ check-reports.js ก่อนใช้งานเป็น gate\n'); process.exit(1); }
console.log('\n✅ checker เชื่อถือได้ (จับ defect ครบ + ไม่ false-positive)\n'); process.exit(0);
