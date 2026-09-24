'use strict';
/**
 * check-v3.js — gate ของรายงาน v3 (reports/<SYM>.json) · spec §9 · ruling R4 ของ Plan 2a
 *   คิดเองจาก JSON: E50 ลายเซ็น · E51 สคีมา/compute/render/แท็ก · E52 ขา declared ↔ ตาราง · E17 ≥2 ขา fv
 *                   E27/W09 ความสดราคา · W07 ตัวเลขผิดวิสัย · W18/W25 สมอตาย (จาก inputs) · W30 lit เกิน · W31 literal เงินค้าง
 *                   W32 |MOS| > 40% ไม่มีขา fv นอกตระกูล (r,g) (§13 ข้อ 7)
 *   ผ่าน gate v2 บนหน้าที่ render (render smoke test): โค้ดที่เหลือทั้งหมด รายงานเป็น "v2:<id>" — ย้ายเป็น native ใน P7
 *   ไม่รันกติกา B (ruling R5 — กติกา B เป็นของ save · ราคาขยับทุกวันจะทำให้ "เป๊ะ" กระพริบ)
 *   ลำดับต่อใบ (ruling Task 12 a): validate → (0 schema error เท่านั้น) compute → tieOut → render → gate v2
 *     — ใบที่สคีมาไม่ผ่านไม่ถูก compute/tieOut/render (render.js/extras.js สมมติว่าใบผ่าน validate แล้ว)
 * CLI: node test/check-v3.js [SYM | path.json | dir/*.json …]
 *   ไม่ใส่ arg = reports/*.json (นาฬิกาจริง) + fixture ใบจริง test/fixtures/v3/*-real.json (นาฬิกาแช่ที่ market.priceDate ของใบ)
 *   SYM = reports/<SYM>.json · path/glob = ไฟล์นั้น (fixture ใบจริงใน test/fixtures/v3 ใช้นาฬิกาแช่ + EXPECT_FIXTURE)
 */
const fs = require('fs');
const path = require('path');
const S = require('../tools/v3/schema.js');
const C = require('../tools/v3/compute.js');
const P = require('../tools/v3/prose.js');
const L = require('../tools/v3/legs.js');
const X = require('../tools/v3/extras.js');
const IO = require('../tools/v3/io.js');
const R = require('../_template/v3/render.js');
const { expandReport } = require('../build.js');
const CR = require('./check-reports.js');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const FIXTURE_DIR = path.join(ROOT, 'test', 'fixtures', 'v3');
const DEAD_ANCHOR_PCT = 7;   // = เส้นเดียวกับ W18/W25 ของ v2 (test/check-reports.js)
const NATIVE_V2 = new Set(['E17', 'E27', 'W07', 'W09', 'W18', 'W25']);
// §13 ข้อ 4 (คำตัดสินถาวร — advisor 24 ก.ย. 69): ขา fv 1 ขา = ละเมิดชั้น 0 → ถัง HUMAN · EQIX คือเคสนั้น (ขา context คำนวณแล้ว แต่ไม่นับ)
const EXPECT_FIXTURE = { 'EQIX-real': ['E17'] };
const CODES = [
  { id: 'E50', level: 'error', label: 'ลายเซ็น _sig ตรงเนื้อไฟล์ (เขียนผ่าน tools/v3/io.js เท่านั้น)' },
  { id: 'E51', level: 'error', label: 'สคีมา v3 + compute + render สำเร็จ + prose ไม่มีแท็กต้องห้าม' },
  { id: 'E52', level: 'error', label: 'ขา declared มีหลักฐาน · ยอดตาราง × fx = ค่าขา ±1%' },
  { id: 'E17', level: 'error', label: '≥2 ขา role:"fv" (ขา context ไม่นับ)' },
  { id: 'E27', level: 'error', label: 'ราคาไม่เก่า/ไม่อยู่อนาคต (market.priceDate)' },
  { id: 'W07', level: 'warn', label: 'ตัวเลขพื้นฐานสมเหตุสมผล' },
  { id: 'W09', level: 'warn', label: 'ความสดของราคา' },
  { id: 'W18', level: 'warn', label: 'ตัวคูณเป้า ≈ ตัวคูณปัจจุบัน (สมอตาย — คำนวณจาก inputs)' },
  { id: 'W25', level: 'warn', label: 'ตัวคูณเป้า ≈ ตัวคูณ forward (สมอตายฝั่ง forward)' },
  { id: 'W30', level: 'warn', label: '{{lit:…}} เกิน 2 ต่อใบ' },
  { id: 'W31', level: 'warn', label: 'literal รูปเงินค้างใน prose (แก้ตอนแตะใบ)' },
  { id: 'W32', level: 'warn', label: '|MOS| > 40% ต้องมีขา fv ที่ไม่ใช่ตระกูล (r,g) ยืนยัน (ชั้น 0 · §13 ข้อ 7)' },
];
const CODE = Object.fromEntries(CODES.map((c) => [c.id, c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const thaiToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
const MULT_BASE = S.CURRENT_BASE;   // ตัวตั้งต่อหุ้นชุดเดียวกับขา 'current' (Task 5 · R7)
// W32 — ตระกูลจริงของขา: family ที่เขียน > เดาจาก method (ไม่งั้นขาไม่มี family นับเป็น "ไม่ใช่ rg" เสมอ ⇒ W32 ไม่มีวันยิงบนใบเก่า/migrate)
const RG_METHODS = new Set(['ddm', 'ddm2', 'dcf', 'ri']);
const famOf = (l) => l.family || (RG_METHODS.has(l.method) || (l.method === 'pbv' && l.inputs.g != null) ? 'rg'
  : l.method === 'declared' ? (['sotp', 'nav'].includes(l.inputs.basis) ? 'asset' : 'rg') : 'market');

function checkDoc(doc, opts) {
  const o = opts || {};
  const errors = [], warnings = [];
  const add = (id, msg) => (CODE[id].level === 'error' ? errors : warnings).push({ id, label: CODE[id].label, msg });
  const done = (view) => ({ errors, warnings, view: view || null });

  if (!o.skipSig && !IO.verifySig(doc)) add('E50', doc && doc._sig ? 'ลายเซ็นไม่ตรงเนื้อไฟล์ — ไฟล์ถูกแก้นอก io.js' : 'ไม่มี _sig — ไฟล์ไม่ได้เขียนผ่าน io.js');
  // (1) สคีมา — ไม่ผ่าน = หยุด (compute/tieOut/render สมมติว่าใบผ่าน validate แล้ว)
  const schemaErrs = S.validate(doc);
  if (schemaErrs.length) { add('E51', schemaErrs.map((e) => `${e.path}: ${e.msg}`).join(' ; ')); return done(); }
  // แท็กนอก whitelist <b> <i> <br> = error ของ gate ไม่ใช่ escape เงียบตอน render (ทุกช่องใน P.proseFields — text.* · legs[].note · extras · การ์ด)
  const tagErrs = P.proseFields(doc).flatMap(({ path: p, text }) => P.sanitizeErrors(text).map((m) => `${p}: ${m}`));
  if (tagErrs.length) add('E51', tagErrs.join(' ; '));
  // (2) compute
  let view;
  try { view = C.compute(doc, { seeds: o.seeds }); }
  catch (e) { add('E51', 'compute: ' + String(e.message).split('\n')[0]); return done(); }
  // (3) tieOut หารด้วยค่าขา — compute รับประกัน > 0 อยู่แล้ว (legValue throw) แต่ยืนยันก่อนหาร ไม่ปล่อย Infinity/NaN เป็นผลตรวจ
  const badLeg = view.legs.findIndex((l) => !(isNum(l.value) && l.value > 0));
  if (badLeg >= 0) { add('E51', `compute: legs[${badLeg}] ค่าขา ${view.legs[badLeg].value} (ต้อง > 0)`); return done(); }
  for (const i of X.tieOut(doc, view)) add('E52', `${i.path}: ${i.msg}`);

  const nFv = view.legs.filter((l) => l.role === 'fv').length;
  if (nFv < 2) add('E17', `ขา role:"fv" มี ${nFv} ขา (ต้อง ≥ 2) — ขา context ไม่นับ (spec §13 ข้อ 4)`);

  const today = o.today || thaiToday(), pd = doc.market.priceDate, age = days(pd, today);
  const errDays = parseInt(process.env.STALE_ERROR_DAYS || '120', 10), warnDays = parseInt(process.env.STALE_WARN_DAYS || '45', 10);
  if (age < -7) add('E27', `วันที่ราคา (${pd}) อยู่ในอนาคต ${-age} วัน`);
  else if (age > errDays) add('E27', `ราคาเก่าเกินไป: ${pd} (${age} วัน > ${errDays} วัน)`);
  else if (age > warnDays) add('W09', `ราคาเริ่มเก่า: ${pd} (${age} วันที่แล้ว) — ควรอัปเดตก่อนเผยแพร่`);

  const d = view.d, roe = doc.fundamentals.roe, bad = [];   // เกณฑ์เดียวกับ W07 ของ v2
  if (d.pe != null && (d.pe <= 0 || d.pe > 600)) bad.push(`P/E ${d.pe.toFixed(1)} ผิดวิสัย`);
  if (d.pbv != null && (d.pbv <= 0 || d.pbv > 200)) bad.push(`P/BV ${d.pbv.toFixed(2)} ผิดวิสัย`);
  if (d.yield != null && (d.yield < 0 || d.yield > 20)) bad.push(`Div yield ${d.yield.toFixed(2)}% ผิดวิสัย`);
  if (isNum(roe) && (roe < -100 || roe > 200)) bad.push(`ROE ${roe}% ผิดวิสัย`);
  if (bad.length) add('W07', bad.join(' ; '));

  const px = doc.market.px, fq = view.fq;
  doc.legs.forEach((leg, i) => {
    const k = MULT_BASE[leg.method], m = leg.inputs.multiple;
    if (leg.role === 'context' || !k || !isNum(m)) return;
    // override เป็นสกุลงบเหมือน fundamentals → แปลงชุดเดียวกับ compute (toQuote แตะแค่ยอดรวม · ตัวตั้งต่อหุ้นคงเดิม)
    const base = L.inputsOf({ ...leg, override: C.toQuote(leg.override, view.fx) }, fq)[k];
    if (isNum(base) && base > 0) {
      const cur = px / base, gap = Math.abs(m - cur) / cur * 100;
      if (gap <= DEAD_ANCHOR_PCT) { add('W18', `legs[${i}] ${leg.method} เป้า ${m}x เทียบตัวคูณปัจจุบัน ${cur.toFixed(1)}x ห่างเพียง ${gap.toFixed(1)}% — ขานี้คืนราคาตลาดกลับมา ต้องยึดมัธยฐาน/peer ที่วัดจริง`); return; }
    }
    const fwd = leg.method === 'pe' ? fq.epsForward : leg.method === 'pffo' && fq.ffoForward ? fq.ffoForward.value : null;
    if (isNum(fwd) && fwd > 0) {
      const cur = px / fwd, gap = Math.abs(m - cur) / cur * 100;
      if (gap <= DEAD_ANCHOR_PCT) add('W25', `legs[${i}] ${leg.method} เป้า ${m}x เทียบตัวคูณ forward ${cur.toFixed(1)}x ห่างเพียง ${gap.toFixed(1)}% — ตัวคูณนั้นคิดจากราคาวันนี้`);
    }
  });

  const nLit = P.countLits(doc);
  if (nLit > 2) add('W30', `${nLit} จุด (เกิน 2) — ถ้าต้องพิมพ์ตรงบ่อยขนาดนี้ แปลว่าสคีมาขาดช่อง`);
  const nMoney = P.countMoneyLiterals(doc);
  if (nMoney) add('W31', `${nMoney} literal รูปเงินที่ไม่ใช่ token — แทนด้วย token ตอนแตะใบ (UPDATE/LIGHT)`);
  const fvLegs = doc.legs.filter((l) => l.role !== 'context');
  if (isNum(d.mos) && Math.abs(d.mos) > 40 && !fvLegs.some((l) => famOf(l) !== 'rg'))
    add('W32', `MOS ${d.mos.toFixed(1)}% แต่ขา fv ทุกขาเป็นตระกูล (r,g) — ต้องมีวิธีที่ไม่ใช้ (r,g) ยืนยัน (ชั้น 0 · docs/quality-gate.md)`);

  // (4) render → (5) gate v2 บนหน้าที่ render (โค้ดที่ native แทนแล้วไม่รายงานซ้ำ)
  let src, html;
  try { src = R.toV2Source(doc, view); html = expandReport(src); }
  catch (e) { add('E51', 'render: ' + String(e.message).split('\n')[0]); return done(view); }
  const res = CR.checkHtml(html, `${doc.symbol}.html`, { source: src });
  for (const e of res.errors) if (!NATIVE_V2.has(e.id)) errors.push({ id: 'v2:' + e.id, label: e.label, msg: e.msg });
  for (const w of res.warnings) if (!NATIVE_V2.has(w.id)) warnings.push({ id: 'v2:' + w.id, label: w.label, msg: w.msg });
  return done(view);
}

module.exports = { checkDoc, CODES, NATIVE_V2, EXPECT_FIXTURE };

// arg → งาน: SYM = reports/<SYM>.json · path.json / glob ("dir/*.json" — * ในชื่อไฟล์เท่านั้น) = ไฟล์นั้น
// fixture ใบจริง (test/fixtures/v3/*-real.json) = นาฬิกาแช่ที่ market.priceDate + ผลต้องตรง EXPECT_FIXTURE
function jobOf(file) {
  const abs = path.resolve(file), base = path.basename(abs);
  const fixture = path.dirname(abs) === FIXTURE_DIR && /-real\.json$/.test(base) ? base.replace(/\.json$/, '') : null;
  return { name: path.relative(ROOT, abs), file: abs, fixture };
}
function jobsFromArgs(args) {
  const jobs = [], missing = [];
  for (const a of args) {
    if (/[\\/*]|\.json$/i.test(a)) {
      if (a.includes('*')) {
        const dir = path.resolve(path.dirname(a)), pat = path.basename(a);
        if (/\*/.test(path.dirname(a))) { missing.push(`${a} (glob ได้เฉพาะชื่อไฟล์)`); continue; }
        const re = new RegExp('^' + pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        const hit = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort() : [];
        if (!hit.length) missing.push(a);
        for (const f of hit) jobs.push(jobOf(path.join(dir, f)));
      } else if (fs.existsSync(a)) jobs.push(jobOf(a));
      else missing.push(a);
    } else {
      const f = path.join(REPORTS_DIR, a.toUpperCase() + '.json');
      if (fs.existsSync(f)) jobs.push(jobOf(f)); else missing.push(`${a} (ไม่มี reports/${a.toUpperCase()}.json)`);
    }
  }
  const seen = new Set();
  return { jobs: jobs.filter((j) => !seen.has(j.file) && seen.add(j.file)), missing };
}
function defaultJobs() {
  const jobs = [];
  if (fs.existsSync(REPORTS_DIR)) for (const f of fs.readdirSync(REPORTS_DIR).filter((x) => /\.json$/i.test(x)).sort()) jobs.push(jobOf(path.join(REPORTS_DIR, f)));
  for (const f of fs.readdirSync(FIXTURE_DIR).filter((x) => /-real\.json$/.test(x)).sort()) jobs.push(jobOf(path.join(FIXTURE_DIR, f)));
  return jobs;
}

function main() {
  const args = process.argv.slice(2);
  const seeds = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
  const { jobs, missing } = args.length ? jobsFromArgs(args) : { jobs: defaultJobs(), missing: [] };
  const nFix = jobs.filter((j) => j.fixture).length;
  console.log(`\n🧾 check-v3 — ใบ v3 ${jobs.length - nFix} ใบ (${args.length ? 'ตาม arg' : 'reports/*.json'}) + fixture ใบจริง ${nFix} ใบ\n`);
  for (const m of missing) console.log(`✗ ไม่พบ: ${m}`);
  let fail = missing.length;
  for (const j of jobs) {
    let r;
    try { const doc = IO.read(j.file); r = checkDoc(doc, { seeds, today: j.fixture ? doc.market.priceDate : undefined }); }
    catch (e) { r = { errors: [{ id: 'E51', label: CODE.E51.label, msg: 'อ่าน/ตรวจ JSON ไม่ได้: ' + String(e.message).split('\n')[0] }], warnings: [] }; }
    const got = r.errors.map((e) => e.id).sort();
    const exp = j.fixture ? (EXPECT_FIXTURE[j.fixture] || []).slice().sort() : [];
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${j.name}${exp.length ? ` (คาด ${exp.join(',')})` : ''}${r.warnings.length ? `   (⚠ ${r.warnings.length})` : ''}`);
    for (const e of r.errors) console.log(`    ${exp.includes(e.id) ? '•' : '✗'} [${e.id}] ${e.label}: ${e.msg}`);
    for (const w of r.warnings) console.log(`    ⚠ [${w.id}] ${w.label}: ${w.msg}`);
  }
  const total = jobs.length + missing.length;
  console.log(`\nสรุป: ${total - fail}/${total} ตรงตามคาด`);
  if (fail) { console.log('\n❌ check-v3 ไม่ผ่าน — ห้าม push\n'); process.exit(1); }
  console.log('\n✅ check-v3 ผ่าน\n');
}
if (require.main === module) main();
