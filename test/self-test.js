#!/usr/bin/env node
'use strict';

/**
 * self-test.js — meta-test ของ check-reports.js
 * พิสูจน์ว่า quality gate ทำงานถูก 2 ทาง:
 *   - ไม่ false-positive : รายงานจริงที่ดีต้องผ่าน (0 error)
 *   - ไม่ false-negative : เมื่อจงใจใส่ข้อบกพร่อง check ที่เกี่ยวข้องต้อง "จับได้"
 *
 * รัน: node test/self-test.js   (หรือ npm run test:self)
 * exit 0 = checker เชื่อถือได้, 1 = checker มีบั๊ก
 */

const fs = require('fs');
const path = require('path');
const { checkHtml } = require('./check-reports');
const { expandReport } = require('../build.js');  // BBL เป็น content-only template → expand เป็น HTML เต็มก่อน (เหมือน gate)

// ใช้รายงานจริงที่ผ่าน gate เป็น "ของดี" ฐาน แล้ว mutate เพื่อทดสอบ
const BASE_FILE = path.join(__dirname, '..', 'reports', 'BBL.html');
const base = expandReport(fs.readFileSync(BASE_FILE, 'utf8'));

let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };
const errIds = (r) => new Set(r.errors.map((x) => x.id));
const allIds = (r) => new Set([...r.errors, ...r.warnings].map((x) => x.id));

console.log('\n🧪 self-test: ความถูกต้องของ check-reports.js\n');

// 1) ของดีต้องผ่าน (ไม่ false-positive)
const pristine = checkHtml(base, 'BBL.html');
ok(pristine.errors.length === 0, 'รายงานจริง (BBL) ผ่านโดยไม่มี error' + (pristine.errors.length ? ' — got ' + [...errIds(pristine)].join(',') : ''));

// 2) จงใจทำพัง — check ที่เกี่ยวข้องต้องจับได้ (ไม่ false-negative)
const expect = (id, level, mutate, desc) => {
  const r = checkHtml(mutate(base), 'BBL.html');
  const set = level === 'warn' ? allIds(r) : errIds(r);
  ok(set.has(id), `${desc} → ต้องเจอ ${id}` + (set.has(id) ? '' : ' (เจอ: ' + [...set].join(',') + ')'));
};
// ยืนยันว่า check หนึ่ง "ไม่" ฟ้อง (กัน false-positive)
const reject = (id, mutate, desc) => {
  const r = checkHtml(mutate(base), 'BBL.html');
  ok(!allIds(r).has(id), `${desc} → ต้องไม่เจอ ${id}` + (allIds(r).has(id) ? ' (แต่ดันเจอ!)' : ''));
};

expect('E01', 'error', (h) => h.replace(/<!DOCTYPE html>/i, ''), 'ลบ DOCTYPE');
expect('E02', 'error', (h) => h.replace('lang="th"', 'lang="en"'), 'เปลี่ยน lang เป็น en');
expect('E04', 'error', (h) => h.replace(/<title>[\s\S]*?<\/title>/i, '<title>วิเคราะห์หุ้น — Dashboard</title>'), 'title ไม่มีชื่อย่อหุ้น');
expect('E06', 'error', (h) => h.replace('<div class="n">8</div>', '<div class="n">9</div>'), 'section 8 หาย');
expect('E10', 'error', (h) => h.replace(/ไม่ใช่คำแนะนำ[\s\S]*?หลักทรัพย์/, 'ข้อมูลทั่วไป'), 'ลบ disclaimer');
expect('E13', 'error', (h) => h.replace('<h1>', '<h1>[SYMBOL] '), 'แทรก placeholder [SYMBOL]');
expect('E14', 'error', (h) => h.replace('<div class="sub">', '<div class="sub">undefined '), 'แทรก "undefined" ในเนื้อหา');
expect('E15', 'error', (h) => h.replace('const FV=195', 'const FV=250'), 'FV ใน JS ไม่ตรงกล่อง');
expect('E16', 'error', (h) => h.replace('<div class="big">+9%</div>', '<div class="big">+40%</div>'), 'MOS ไม่สอดคล้องกับ FV/ราคา');
expect('E33', 'error', (h) => h.replace('var(--badge)', 'var(--orange-missing)'), 'อ้าง CSS var ที่ไม่ถูกนิยาม (เคส HMPRO badge → var(--orange) ก่อนเพิ่มในพาเลต)');
reject('E33', (h) => h.replace('var(--badge)', 'var(--ghost, #000)'), 'var(--x, fallback) มี fallback = ตั้งใจ → ต้องไม่ฟ้อง E33');
expect('W01', 'warn', (h) => h.replace('<div class="tgt">฿150</div>', '<div class="tgt">฿999</div>'), 'scenario target เพี้ยน (EPS×P/E ไม่ตรง)');
expect('W02', 'warn', (h) => h.replace('<div class="sub">', '<div class="sub">ราคา $999 '), 'แทรก "$" ในรายงานสกุลบาท');
expect('E18', 'error', (h) => h.replace('class="v pos">฿156</div>', 'class="v pos">฿199</div>'), 'จุดซื้อ MOS20 ≠ FV×0.8');
expect('E19', 'error', (h) => h.replace('gpos(178)', 'gpos(300)'), 'gauge marker ปัจจุบันไม่ตรงราคา');
expect('E20', 'error', (h) => h.replace(/กรอบ\s*฿162\s*[–-]\s*฿225/, 'กรอบ ฿300 – ฿320'), 'Fair Value อยู่นอกกรอบ');
expect('W04', 'warn', (h) => h.replace('class="mos-verdict ok"', 'class="mos-verdict good"'), 'สี verdict (good) ขัดกับ MOS ต่ำ');
expect('W05', 'warn', (h) => h.replace('class="mval">฿225</div>', 'class="mval">฿600</div>'), 'FV ไม่ใกล้ค่าเฉลี่ยวิธี');
// ── Tier 1/2: valuation-math, consistency, freshness, sourcing ──
expect('E21', 'error', (h) => h.replace('<div class="mval">฿198</div>', '<div class="mval">฿300</div>'), 'วิธี P/E: ค่าไม่ตรง EPS×P/E');
expect('E22', 'error', (h) => h.replace('<div class="mval">฿225</div>', '<div class="mval">฿300</div>'), 'วิธี P/BV: ค่าไม่ตรง ratio×BVPS');
expect('E23', 'error', (h) => h.replace('value="178"', 'value="999"'), 'ราคา header ≠ ค่าตั้งต้นเครื่องคิดเลข');
expect('E24', 'error', (h) => h.replace('<span>~฿24.0</span>', '<span>~฿40.0</span>'), 'EPS ปี3 ไม่ตรงการทบต้น (1+g)³');
expect('E25', 'error', (h) => h.replace('มูลค่าเหมาะสม</div><div class="v">฿195', 'มูลค่าเหมาะสม</div><div class="v">฿250'), 'FV ในสรุป ≠ FV ในกล่อง');
expect('E26', 'error', (h) => h.replace('฿156<br><small>MOS 20%', '฿250<br><small>MOS 20%'), 'gauge scale MOS20 ≠ FV×0.8');
expect('W06', 'warn', (h) => h.replace('MOS ~ +9%', 'แพง ~9%'), 'สรุปพลิกขั้ว (แพง) ขัดกับ MOS บวก');
expect('W07', 'warn', (h) => h.replace('class="v pos">~7.5x', 'class="v pos">~750x'), 'P/E ผิดวิสัย (750x)');
expect('W08', 'warn', (h) => h.replace('ที่มา: SET / stockanalysis.com / Investing', 'ที่มา: SET'), 'แหล่งข้อมูล < 3');
expect('E28', 'error', (h) => h.replace(/<meta\s+name="ai-model"[^>]*>/i, ''), 'ลบ meta ai-model → ต้องบังคับให้ระบุโมเดล');
expect('E28', 'error', (h) => h.replace(/content="Claude[^"]*"/i, 'content="GPT-4"'), 'ai-model ไม่ใช่ Claude → ค่าผิด');
// ── E32: คำโปรยธุรกิจใต้ <h1> (.sub → desc การ์ด index) ──
expect('E32', 'error', (h) => h.replace(/<div class="sub">[\s\S]*?<\/div>/i, '<div class="sub"></div>'), 'ลบคำโปรยธุรกิจ (.sub) → ต้องบังคับให้มี desc');
reject('E32', (h) => h.replace('<div class="sub">', '<div class="sub">ผู้ผลิตอุปกรณ์กึ่งตัวนำ '), 'คำโปรยธุรกิจปกติ (ยาวพอ) ต้องไม่ฟ้อง E32');
// ── stock-meta (E29–31, W10) — บล็อก JSON ตัวเลขสำหรับเรียง index ──
expect('E29', 'error', (h) => h.replace(/<script[^>]*id="stock-meta"[\s\S]*?<\/script>/i, ''), 'ลบบล็อก stock-meta → ต้องบังคับให้มี');
expect('E29', 'error', (h) => h.replace(',"roe":7.8}', '}'), 'stock-meta ขาดคีย์ roe');
expect('E29', 'error', (h) => h.replace('"price":178', '"price":"178"'), 'stock-meta.price เป็น string ไม่ใช่ตัวเลข');
expect('E30', 'error', (h) => h.replace('"price":178', '"price":999'), 'stock-meta.price ≠ ราคาที่โชว์ → ตรวจข้ามแหล่งในไฟล์');
expect('E31', 'error', (h) => h.replace('"upside":9.6', '"upside":99'), 'stock-meta.upside ไม่สอดคล้องกับราคา&FV');
expect('W10', 'warn', (h) => h.replace('"pe":7.5', '"pe":50'), 'stock-meta.pe ≠ P/E ที่โชว์ (เตือน)');
// freshness — จำลอง "วันนี้" ผ่าน env STALE_TODAY (รายงานลงวันที่ มิ.ย. 2026)
{
  process.env.STALE_TODAY = '2027-06-23';
  const r = checkHtml(base, 'BBL.html');
  ok(errIds(r).has('E27'), 'ราคาเก่า > 120 วัน (จำลองวันนี้ 2027-06-23) → ต้องเจอ E27' + (errIds(r).has('E27') ? '' : ' (เจอ: ' + [...errIds(r)].join(',') + ')'));
  delete process.env.STALE_TODAY;
}
{
  process.env.STALE_TODAY = '2026-08-20';
  const r = checkHtml(base, 'BBL.html');
  ok(allIds(r).has('W09') && !errIds(r).has('E27'), 'ราคาเก่า 45–120 วัน → ต้องเตือน W09 (ไม่ block)' + (allIds(r).has('W09') ? '' : ' (เจอ: ' + [...allIds(r)].join(',') + ')'));
  delete process.env.STALE_TODAY;
}

// ── กัน false-positive (จากผล adversarial review) ──
reject('E13', (h) => h.replace('<h1>', '<h1>[NASDAQ] '), 'ticker/exchange ในวงเล็บ [NASDAQ] ไม่ใช่ placeholder');
reject('E13', (h) => h.replace('<h1>', '<h1>[ADR] '), 'acronym [ADR] ไม่ใช่ placeholder');
reject('E12', (h) => h.replace('2026', '2569'), 'ปี พ.ศ. 2569 ยังถือว่ามีปีในวันที่ราคา');
reject('E06', (h) => h.replace('<div class="n">1</div>', '<div class="n active">1</div>'), 'section badge มี class เพิ่มก็ยังนับว่าครบ');
reject('E29', (h) => h.replace('"dividendYield":6.7', '"dividendYield":null'), 'stock-meta: dividendYield = null (หุ้นไม่จ่ายปันผล) ยังถือว่าถูกต้อง');
reject('W10', (h) => h.replace('"dividendYield":6.7', '"dividendYield":null'), 'stock-meta: yield = null → ข้ามการเทียบ ไม่เตือน W10');

console.log('\n' + '─'.repeat(50));
console.log(`self-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ checker มีบั๊ก — แก้ check-reports.js ก่อนใช้งานเป็น gate\n'); process.exit(1); }
console.log('\n✅ checker เชื่อถือได้ (จับ defect ครบ + ไม่ false-positive)\n'); process.exit(0);
