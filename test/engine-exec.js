#!/usr/bin/env node
'use strict';

/**
 * engine-exec.js — รัน "engine ที่ build bake แล้ว" ของทุกรายงานจริง ใน mock DOM (ชั้น execution)
 *
 * ปิดช่องโหว่ที่ gate ชั้นอื่นมองไม่เห็น: **JS ที่ parse ผ่าน (syntax ถูก) แต่ throw ตอน "รันจริง"**
 *   - check-site.js แค่ `new Function(body)` ตรวจ syntax + เช็คว่า id ที่อ้างมีจริง — ไม่เคย "รัน" โค้ด
 *   - ตัวอย่างจริง (บั๊กที่เคยหลุดขึ้นเว็บ): report-data.chart.dataFmt = "v.toFixed(2)" — engine เอาไป bake
 *     ในป้ายจุดกราฟซึ่งอยู่ใน scope `data.forEach((d,i)=>…)` ที่ไม่มีตัวแปร `v` → ReferenceError กลาง forEach
 *     → ทั้ง IIFE ล้มก่อนเซ็ต innerHTML → กราฟว่าง + gauge + เครื่องคิดเลข MOS ดับหมด แต่ check-site เห็นแค่ "syntax ผ่าน"
 *
 * วิธีตรวจ: expand รายงาน → ดึง <script> ตัว engine (ตัวที่อ้าง priceChart) → รันใน mock DOM ที่ mock เฉพาะ
 * surface ที่ engine แตะ (getElementById/querySelector + .innerHTML/.style/.value/.addEventListener) แล้ว assert ว่า
 *   (1) ไม่ throw  (2) กราฟถูกวาดจริง (priceChart.innerHTML มี <path + <circle)  (3) เข็ม gauge ถูกตั้งตำแหน่ง
 *   (4) เครื่องคิดเลข MOS ทำงาน (mosOut มีผลลัพธ์)
 * engine เป็น IIFE ที่อ้าง `document` เป็น global ตัวเดียว → ใส่เป็น parameter ของ new Function ก็รันได้
 * โดยไม่ต้องใช้ vm/ไม่มี dependency (เข้ากับกฎ repo: ตัว gate ไม่มี dependency ภายนอก)
 *
 * รัน: node test/engine-exec.js   (npm run test:engine — อยู่ใน `npm run verify`)
 * exit 0 = ทุกรายงาน render ผ่าน, 1 = มี engine ที่ throw/ไม่วาดผล (หรือ harness เองพัง = ห้ามเชื่อผล)
 */

const fs = require('fs');
const path = require('path');
const { expandReport, renderEngine } = require('../build.js');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// ---------- mock DOM (เฉพาะ surface ที่ _template/engine.js แตะ) ----------
function makeEl() {
  return { innerHTML: '', value: '', style: {}, addEventListener() {} };
}
function makeDoc(seedPx) {
  const els = Object.create(null);
  const get = (id) => els[id] || (els[id] = makeEl());
  if (seedPx != null) get('pxIn').value = String(seedPx);
  return {
    els,
    getElementById: (id) => get(id),
    querySelector: (sel) => get('qs:' + sel), // เช่น "#mFair .lab"
  };
}

// ดึงเนื้อ <script> ตัว engine (ตัวที่อ้าง priceChart) — ข้าม data block (application/json) และ <script src>
function extractEngine(html) {
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/\btype\s*=\s*["']application\/json["']/i.test(attrs)) continue;
    if (/getElementById\(["']priceChart["']\)/.test(m[2])) return m[2];
  }
  return null;
}

// รัน engine ใน mock DOM → { ok, error, doc }
function runEngine(body, seedPx) {
  const doc = makeDoc(seedPx);
  try {
    // engine = IIFE ที่อ้าง document เป็น global เท่านั้น → ส่งเป็น parameter (ปิด scope ภายนอก, ไม่ต้องใช้ vm)
    // eslint-disable-next-line no-new-func
    new Function('document', body)(doc);
    return { ok: true, doc };
  } catch (e) {
    return { ok: false, error: e, doc };
  }
}

// ค่า default ของช่องราคา (#pxIn value="…") เพื่อให้ calc() คำนวณ MOS ได้จริง — ไม่เจอ → 100 (ยังคำนวณได้)
function seedFromHtml(html) {
  const m = html.match(/id=["']pxIn["'][^>]*\bvalue=["']([^"']*)["']/i);
  const v = m ? parseFloat(m[1]) : NaN;
  return isFinite(v) && v > 0 ? v : 100;
}

// assert การ render ของ doc หลังรัน engine → array ของข้อความ error (ว่าง = ผ่าน)
function assertRendered(doc) {
  const e = [];
  const chart = doc.els.priceChart;
  if (!chart || !chart.innerHTML) e.push('priceChart.innerHTML ว่าง (กราฟไม่ถูกวาด — engine ดับก่อนถึง innerHTML?)');
  else {
    if (!chart.innerHTML.includes('<path')) e.push('กราฟไม่มี <path> (เส้นราคา/พื้นที่ไม่ถูกวาด)');
    if (!chart.innerHTML.includes('<circle')) e.push('กราฟไม่มี <circle> (จุดข้อมูลไม่ถูกวาด)');
  }
  const cur = doc.els.mCur, fair = doc.els.mFair;
  if (!cur || !/%$/.test(String(cur.style.left || ''))) e.push('เข็ม gauge "ปัจจุบัน" (#mCur) ไม่ถูกตั้งตำแหน่ง (style.left)');
  if (!fair || !/%$/.test(String(fair.style.left || ''))) e.push('เข็ม gauge "เหมาะสม" (#mFair) ไม่ถูกตั้งตำแหน่ง (style.left)');
  const mos = doc.els.mosOut;
  if (!mos || !/MOS/.test(String(mos.innerHTML || ''))) e.push('เครื่องคิดเลข MOS (#mosOut) ไม่ให้ผลลัพธ์ (calc() ไม่ทำงาน)');
  return e;
}

// ---------- meta self-check: พิสูจน์ว่า harness "จับของพังได้จริง" (ไม่ใช่ no-op) ----------
// engine ที่ดี → ok + วาดผลครบ ; engine ที่จงใจทำพังแบบบั๊กจริง (ป้ายจุดอ้าง v นอก scope) → ต้องจับเป็น throw
function selfCheck() {
  const fails = [];
  const good = renderEngine({
    theme: { accent: '#0071e3' },
    chart: { data: [['a', 1], ['b', 2], ['c', 3]], min: 1, max: 3, grid: [1, 2, 3], fairLine: 2, currency: '฿', highlight: [0, 2] },
    gauge: { min: 1, max: 4, cur: 3, fair: 2 }, fv: 2,
  });
  const body = extractEngine(good);
  if (!body) { fails.push('selfCheck: extractEngine คืน null กับ engine ปกติ'); return fails; }
  const rGood = runEngine(body, 100);
  if (!rGood.ok) fails.push('selfCheck: engine ปกติกลับ throw: ' + (rGood.error && rGood.error.message));
  else { const ar = assertRendered(rGood.doc); if (ar.length) fails.push('selfCheck: engine ปกติ render ไม่ครบ: ' + ar.join(' / ')); }
  // จำลองบั๊ก dataFmt: ป้ายจุด (scope data.forEach) ใช้ ${cur}${v} ที่ไม่มี v → ต้อง throw
  const broken = body.replace('${cur}${d[1]}', '${cur}${v}');
  if (broken === body) fails.push('selfCheck: หา token ป้ายจุด ${cur}${d[1]} ไม่เจอ (engine เปลี่ยนรูปแบบ? อัปเดต self-check)');
  else if (runEngine(broken, 100).ok) fails.push('selfCheck: engine ที่อ้าง v นอก scope ไม่ถูกจับเป็น throw (harness เป็น no-op!)');
  return fails;
}

function main() {
  const argv = process.argv.slice(2);
  console.log('\n⚙️  engine-exec: รัน engine ในทุกรายงาน (mock DOM)\n');

  // 0) harness ต้องเชื่อถือได้ก่อน
  const sc = selfCheck();
  if (sc.length) {
    console.log('❌ self-check ของ harness ล้มเหลว — ผลตรวจเชื่อไม่ได้:');
    for (const m of sc) console.log('    ✗ ' + m);
    process.exit(1);
  }
  console.log('  ✓ self-check: harness จับ engine ที่ throw ได้ + engine ปกติ render ครบ');

  if (!fs.existsSync(REPORTS_DIR)) { console.error('❌ ไม่พบโฟลเดอร์ reports/'); process.exit(1); }
  let files = fs.readdirSync(REPORTS_DIR).filter((f) => /\.html$/i.test(f)).sort();
  if (argv.length) { const want = new Set(argv.map((a) => a.replace(/\.html$/i, '').toUpperCase())); files = files.filter((f) => want.has(f.replace(/\.html$/i, '').toUpperCase())); }
  if (!files.length) { console.error('❌ ไม่พบไฟล์รายงานให้ตรวจ'); process.exit(1); }

  let fail = 0;
  const bad = [];
  for (const f of files) {
    let html;
    try { html = expandReport(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8')); }
    catch (e) { bad.push({ f, errs: ['expandReport throw: ' + e.message] }); fail++; continue; }
    const body = extractEngine(html);
    if (!body) { bad.push({ f, errs: ['ไม่พบสคริปต์ engine (ที่อ้าง priceChart)'] }); fail++; continue; }
    const r = runEngine(body, seedFromHtml(html));
    if (!r.ok) { bad.push({ f, errs: ['engine throw ตอนรัน: ' + (r.error && r.error.message)] }); fail++; continue; }
    const errs = assertRendered(r.doc);
    if (errs.length) { bad.push({ f, errs }); fail++; }
  }

  for (const b of bad) { console.log(`  ✗ ${b.f}`); for (const e of b.errs) console.log(`      ${e}`); }

  console.log('\n' + '─'.repeat(50));
  console.log(`engine-exec: ${files.length - fail}/${files.length} รายงาน render ผ่าน`);
  if (fail) { console.log(`\n❌ มี ${fail} รายงานที่ engine พังตอนรันจริง — ห้าม push\n`); process.exit(1); }
  console.log('\n✅ ทุกรายงาน: กราฟ + gauge + เครื่องคิดเลข MOS รันได้จริง\n'); process.exit(0);
}

if (require.main === module) main();
module.exports = { makeDoc, extractEngine, runEngine, assertRendered, seedFromHtml, selfCheck };
