'use strict';
// meta-test ของ check-v3 (spec §9): mutate JSON → code ที่คู่กันต้องยิง · 1 เคสต่อ code · ฐาน = ใบจริงที่สะอาด
const t = require('./_t.js')('check-v3');
const CV = require('../check-v3.js');
const IO = require('../../tools/v3/io.js');
const P = require('../../tools/v3/prose.js');
const C = require('../../tools/v3/compute.js');
const load = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
const signed = (d) => ({ ...d, _sig: IO.sign(d) });
const run = (d, o) => CV.checkDoc(d, { seeds: {}, today: d.market.priceDate, ...(o || {}) });
const ids = (r, kind) => r[kind].map((x) => x.id);
const shift = (iso, days) => new Date(Date.parse(iso) + days * 86400e3).toISOString().slice(0, 10);
const noThrow = (fn, m) => { try { return fn(); } catch (e) { t(false, `${m}: threw ${e.message.split('\n')[0]}`); return { errors: [], warnings: [] }; } };

// ฐาน: ใบจริงที่ผ่าน = 0 error (EQIX = E17 ตาม §13 ข้อ 4 / ruling R3)
for (const f of ['ZTS-real', 'BBL-real', 'FER-real', 'EQIX-real']) {
  const d = load(f);
  t.eq(ids(run(d), 'errors'), CV.EXPECT_FIXTURE[f] || [], `${f}: baseline errors = expected`);
}
// ruling (d): ฐานไม่มี warning อื่นนอกจาก W31 (literal เงินค้าง = งานแก้ตอนแตะใบ) — EQIX = E17 ตัวเดียว ไม่มีอะไรอื่น
for (const f of ['ZTS-real', 'BBL-real', 'FER-real', 'EQIX-real'])
  t.eq(ids(run(load(f)), 'warnings').filter((x) => x !== 'W31'), [], `${f}: baseline warnings = W31 only`);
t.eq(ids(run(load('EQIX-real')), 'errors'), ['E17'], 'EQIX-real: exactly one E17 (HUMAN bucket · spec §13 ข้อ 4)');
// fixture สังเคราะห์ (ไม่ได้เซ็น — ไม่ผ่าน io.js) · ข้าม E50 แล้วต้องสะอาดเหมือนกัน
// BBL.json (Plan 1 · ข้อมูลย่อ) มี warning จริงของเนื้อ fixture: P/E เป้า 8.5x ห่างตัวคูณปัจจุบัน 8.7x 1.9% (W18) + ไม่มีช่วง 52 สัปดาห์ (v2:W08)
// — pin ไว้ให้เห็นเมื่อขยับ ไม่แก้ fixture ของ Plan 1 ใน task นี้
const SYNTH_WARN = { ZTS: [], BBL: ['W18', 'v2:W08'] };
for (const f of ['ZTS', 'BBL']) {
  const r = run(load(f), { skipSig: true });
  t.eq(ids(r, 'errors'), [], `${f} (synthetic, skipSig): 0 errors`);
  t.eq(ids(r, 'warnings').filter((x) => x !== 'W31'), SYNTH_WARN[f], `${f} (synthetic, skipSig): warnings pinned`);
}
const Z = () => load('ZTS-real');
const today0 = Z().market.priceDate;

{ const d = Z(); d.prose.mos += ' (แก้มือ)'; t(ids(run(d), 'errors').includes('E50'), 'E50: hand edit without re-sign'); }
{ const d = Z(); delete d._sig; t(ids(run(d), 'errors').includes('E50'), 'E50: no _sig at all'); }
{ const d = Z(); d.prose.mos += ' (แก้มือ)'; t(!ids(run(d, { skipSig: true }), 'errors').includes('E50'), 'skipSig: E50 off'); }
{ const d = Z(); delete d._sig; d.surprise = 1; t(ids(run(signed(d)), 'errors').includes('E51'), 'E51: schema error'); }
{ const d = Z(); delete d._sig; d.meta.themeLegacy = null; t(ids(run(signed(d)), 'errors').includes('E51'), 'E51: compute failure (no brand colour source)'); }
{ const d = Z(); delete d._sig; d.prose.mos += ' <span style="color:red">x</span>'; t(ids(run(signed(d)), 'errors').includes('E51'), 'E51: disallowed tag in prose'); }
{ const d = load('FER-real'); delete d._sig; d.legs[0].inputs.value = 60; t(ids(run(signed(d)), 'errors').includes('E52'), 'E52: SOTP table does not tie to the leg'); }
{ const d = Z(); delete d._sig; d.legs[1].role = 'context'; d.legs[2].role = 'context'; d.fvWeights = null;
  t(ids(run(signed(d)), 'errors').includes('E17'), 'E17: one fv leg left'); }
// E27/W09 native + ไม่รายงานซ้ำจาก v2 (gate v2 เห็นหน้าเก่า 200/60 วันบนนาฬิกาแช่เดียวกัน → ยิง E27/W09 ของตัวเอง ซึ่ง NATIVE_V2 ต้องกรองออก)
{ const d = Z(); delete d._sig; d.market.priceDate = shift(today0, -200); const r = run(signed(d), { today: today0 });
  t(ids(r, 'errors').includes('E27'), 'E27: price 200 days old');
  t(!ids(r, 'errors').includes('v2:E27') && !ids(r, 'warnings').includes('v2:W09'), 'E27: 200-day-old doc — no v2:E27/v2:W09 double report'); }
{ const d = Z(); delete d._sig; d.market.priceDate = shift(today0, -60); const r = run(signed(d), { today: today0 });
  t(ids(r, 'warnings').includes('W09'), 'W09: price 60 days old');
  t(!ids(r, 'warnings').includes('v2:W09'), 'W09: no v2:W09 double report'); }
// นาฬิกาของ gate v2 แช่ที่ today เดียวกับ native: ปลด E27 ออกจาก NATIVE_V2 ชั่วคราว · ตั้ง STALE_TODAY = priceDate (v2 เห็นว่าสด)
// แต่ today +200 วัน ⇒ v2:E27 โผล่ได้ก็ต่อเมื่อ checkDoc ทับ STALE_TODAY ด้วย today ที่ส่งมา — ไม่ขึ้นกับนาฬิกาจริง
// (Task 13 carry (e): เดิมพึ่งนาฬิกาจริงว่าสด → หลัง priceDate+120 วัน v2 ยิง E27 เองแม้ checkDoc ไม่แช่ = เคสว่างเปล่า)
{ const d = Z(); const env0 = process.env.STALE_TODAY; const fresh = d.market.priceDate;
  process.env.STALE_TODAY = fresh; CV.NATIVE_V2.delete('E27');
  let r, after;
  try { r = run(d, { today: shift(today0, 200) }); after = process.env.STALE_TODAY; }
  finally { CV.NATIVE_V2.add('E27'); if (env0 === undefined) delete process.env.STALE_TODAY; else process.env.STALE_TODAY = env0; }
  t(ids(r, 'errors').includes('v2:E27'), 'v2 clock frozen at opts.today (overrides a fresh STALE_TODAY; v2 E27 sees the +200-day clock)');
  t(after === fresh, 'STALE_TODAY restored to its pre-call value after the v2 pass'); }
// (3) today ผิดรูป → อายุ NaN → E27 ดัง (ไม่ผ่านเงียบเพราะ NaN เทียบอะไรก็ false)
{ const r = run(Z(), { today: 'not-a-date' }); t(ids(r, 'errors').includes('E27'), 'E27: unparseable today → fail loud'); }
{ const d = Z(); delete d._sig; d.fundamentals.roe = 500; t(ids(run(signed(d)), 'warnings').includes('W07'), 'W07: ROE 500% implausible'); }
{ const d = Z(); delete d._sig; const L = d.legs[0], base = (L.override && L.override.eps) || d.fundamentals.eps;
  L.inputs.multiple = +(d.market.px / base).toFixed(1);
  t(ids(run(signed(d)), 'warnings').includes('W18'), 'W18: target multiple ≈ current multiple'); }
{ const d = Z(); delete d._sig; d.fundamentals.epsForward = +(d.market.px / d.legs[0].inputs.multiple).toFixed(4);
  t(ids(run(signed(d)), 'warnings').includes('W25'), 'W25: target multiple ≈ forward multiple'); }
{ const d = Z(); delete d._sig; d.prose.chart += ' {{lit:$1.00}} {{lit:$2.00}} {{lit:$3.00}}';
  d.meta.litReasons = { '$1.00': 'ราคา IPO ปี 2556', '$2.00': 'ราคาแตกพาร์ปี 2560', '$3.00': 'ราคาเพิ่มทุนปี 2563' };
  t(ids(run(signed(d)), 'warnings').includes('W30'), 'W30: more than 2 lits'); }
{ const d = Z(); delete d._sig; const n0 = P.countMoneyLiterals(d); d.prose.chart += ' เคยแตะ $123.45';
  const w = run(signed(d)).warnings.find((x) => x.id === 'W31');
  t(w && w.msg.startsWith(`${n0 + 1} `), 'W31: counts the added money literal'); }
// W32 (spec §13 ข้อ 7 · ชั้น 0): |MOS| > 40% ต้องมีขา fv ที่ไม่ใช่ตระกูล (r,g) ยืนยัน — ราคาตั้งที่ครึ่งหนึ่งของ FV ⇒ MOS 50%
const halfPx = (d) => { d.market.px = +(C.compute(d, { seeds: {} }).fv * 0.5).toFixed(2); return d; };
{ const d = Z(); delete d._sig; d.legs[0].inputs.multipleSource = 'median5y'; halfPx(d);
  t(!ids(run(signed(d)), 'warnings').includes('W32'), 'W32 silent: MOS 50% but the P/E median leg (inferred family market) confirms'); }
{ const d = Z(); delete d._sig; halfPx(d);   // ruling: P/E justified สร้างจาก (r,g) ⇒ เดาเป็น rg — ไม่นับเป็นพยานนอก (r,g)
  t(ids(run(signed(d)), 'warnings').includes('W32'), 'W32: MOS 50% and the only multiple leg is P/E justified (inferred rg)'); }
{ const d = Z(); delete d._sig; d.legs.forEach((l) => { l.family = 'rg'; }); d.fvWeights = null; halfPx(d);
  t(ids(run(signed(d)), 'warnings').includes('W32'), 'W32: MOS 50% and every fv leg is family rg'); }
{ const d = Z(); delete d._sig; d.legs = d.legs.filter((l) => l.method !== 'pe'); d.fvWeights = null; halfPx(d);
  t(ids(run(signed(d)), 'warnings').includes('W32'), 'W32: no family key — ddm + declared(other) are inferred rg'); }
{ const d = Z(); d.meta.aiModel = 'Claude Foo 5'; delete d._sig; t(ids(run(signed(d)), 'errors').includes('v2:E28'), 'pass-through: v2 E28 on the rendered page surfaces as v2:E28'); }

// ── controller rulings (Task 12) ──
// (a) ลำดับ: validate → (0 schema error เท่านั้น) compute → tieOut → render → v2 · ใบที่สคีมาไม่ผ่านต้องไม่ถูก compute/tieOut/render
{ const d = load('FER-real'); delete d._sig; d.legs[0].inputs.extrasRef = 9;   // tieOut บนใบนี้จะอ่าน extras[9] = undefined
  const r = noThrow(() => run(signed(d)), '(a) bad extrasRef');
  t.eq(ids(r, 'errors'), ['E51'], '(a) schema/compute failure stops before E52/render: only E51');
  t.eq(r.view, null, '(a) no view returned for a doc that did not compute'); }
{ const d = Z(); delete d._sig; d.metrics.custom = [{ label: 'x', value: 'y' }]; d.metrics.cards.push('custom:7');   // render.js:78 ไม่ guard index
  const r = noThrow(() => run(signed(d)), '(a) bad custom ref');
  t.eq(ids(r, 'errors'), ['E51'], '(a) out-of-range custom ref = E51 from schema, render never runs');
  t(r.errors[0].msg.includes('metrics.cards'), '(a) the E51 message names the schema path'); }
{ const d = Z(); d.legs[0].method = 'nope'; delete d._sig;
  const r = noThrow(() => run(signed(d)), '(a) unknown method');
  t.eq(ids(r, 'errors'), ['E51'], '(a) unknown leg method = schema E51 only'); }
{ // guard ค่าขา > 0 ก่อน tieOut (tieOut หารด้วยค่าขา) — compute ปกติ throw ก่อนถึงตรงนี้ จึงจำลอง view ที่ค่าขาเป็น 0
  const d = load('FER-real'), orig = C.compute;
  C.compute = (doc, o) => { const v = orig(doc, o); v.legs[0] = { ...v.legs[0], value: 0 }; return v; };
  let r; try { r = noThrow(() => run(d), '(a) leg value 0'); } finally { C.compute = orig; }
  t(ids(r, 'errors').includes('E51') && !ids(r, 'errors').includes('E52'), '(a) leg value ≤ 0 → E51, tieOut never divides by it'); }
// (b) แท็กนอก whitelist = error ของ gate (ไม่ใช่ escape เงียบ) — ทุกช่อง prose: text.* · legs[i].note · extras cell/note · card note
const tagCase = (f, mut, where) => { const d = load(f); delete d._sig; mut(d);
  const e = run(signed(d)).errors.find((x) => x.id === 'E51' && x.msg.includes('แท็กไม่อนุญาต'));
  t(e && e.msg.includes(where), `(b) disallowed tag at ${where} → E51 naming the path`); };
tagCase('FER-real', (d) => { d.text.valIntro += ' <script>x</script>'; }, 'text.valIntro');
tagCase('ZTS-real', (d) => { d.legs[0].note += ' <a href="x">y</a>'; }, 'legs[0].note');
tagCase('FER-real', (d) => { d.extras[1].rows[0][0] += ' <u>x</u>'; }, 'extras[1].rows[0][0]');
tagCase('FER-real', (d) => { d.extras[1].note = (d.extras[1].note || '') + ' <img src=x>'; }, 'extras[1].note');
tagCase('ZTS-real', (d) => { d.metrics.notes.eps += ' <font>x</font>'; }, 'metrics.notes.eps');
{ const d = Z(); delete d._sig; d.prose.mos += ' <b>ok</b> <i>ok</i><br>ok **ok**';
  t.eq(ids(run(signed(d)), 'errors'), [], '(b) whitelisted markup <b> <i> <br> **bold** is clean'); }
// (c) W30 = lit > 2 ต่อใบ (2 จุดยังไม่ยิง) · W31 เงียบเมื่อเป็น 0
{ const d = Z(); delete d._sig; d.prose.chart += ' {{lit:$1.00}} {{lit:$2.00}}';
  d.meta.litReasons = { '$1.00': 'ราคา IPO ปี 2556', '$2.00': 'ราคาแตกพาร์ปี 2560' };
  t(!ids(run(signed(d)), 'warnings').includes('W30'), 'W30 silent: exactly 2 lits'); }
{ const d = Z(); delete d._sig;
  const strip = (s) => s.replace(/(?:US\$|\$|฿)\s*[0-9][0-9,]*(?:\.[0-9]+)?/g, 'ราคา').replace(/[0-9][0-9,]*(?:\.[0-9]+)?\s*บาท/g, 'ราคา');
  const walk = (o) => { for (const k of Object.keys(o)) { if (typeof o[k] === 'string') o[k] = strip(o[k]); else if (o[k] && typeof o[k] === 'object') walk(o[k]); } };
  for (const k of Object.keys(d)) if (k !== 'market' && d[k] && typeof d[k] === 'object') walk(d[k]);   // ทุกช่องข้อความ (ตัวเลขในโครงสร้างไม่ใช่ string)
  t.eq(P.countMoneyLiterals(d), 0, '(c) setup: money literals stripped');
  t(!ids(run(signed(d)), 'warnings').includes('W31'), 'W31 silent when the count is 0'); }
// W32 เกณฑ์ขอบ: |MOS| ต้อง > 40 (ไม่ใช่ ≥) และคิดทั้งสองทิศ (แพงเกิน 40% ก็ยิง)
{ const d = Z(); delete d._sig; d.legs.forEach((l) => { l.family = 'rg'; }); d.fvWeights = null;
  d.market.px = +(C.compute(d, { seeds: {} }).fv * 1.6).toFixed(2);
  t(ids(run(signed(d)), 'warnings').includes('W32'), 'W32: negative MOS beyond −40% also fires'); }
{ const d = Z(); delete d._sig; d.legs.forEach((l) => { l.family = 'rg'; }); d.fvWeights = null;
  d.market.px = +(C.compute(d, { seeds: {} }).fv * 0.7).toFixed(2);
  t(!ids(run(signed(d)), 'warnings').includes('W32'), 'W32 silent: MOS 30% (≤ 40)'); }
{ const d = Z(); delete d._sig; d.legs[1].role = 'context'; d.legs[2].role = 'context'; d.legs[0].family = 'rg';
  d.legs[1].family = 'market'; d.fvWeights = null; halfPx(d);
  t(ids(run(signed(d)), 'warnings').includes('W32'), 'W32: a non-rg context leg does not confirm (fv legs only)'); }
// (e) analyst.asOf ต้องเป็น string — array ที่ stringify เป็น ISO ผ่าน ISO.test() เงียบ ๆ ก่อนแก้
{ const d = Z(); delete d._sig; d.analyst.asOf = [d.analyst.asOf];
  const r = run(signed(d)); t(ids(r, 'errors').includes('E51') && r.errors[0].msg.includes('analyst.asOf'), '(e) analyst.asOf non-string → E51'); }
// (2) sweep ไม่มี arg ต้องดังเมื่อ regression หาย — dir ชั่วคราว
{ const fs = require('fs'), os = require('os'), path = require('path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-v3-')), fixDir = path.join(tmp, 'fx'), repDir = path.join(tmp, 'reports');
  fs.mkdirSync(fixDir); fs.mkdirSync(repDir);
  const src = path.join(__dirname, '..', 'fixtures', 'v3'), quiet = { reportsDir: repDir, fixtureDir: fixDir, log: () => {} };
  try {
    t.eq(CV.runCli([], quiet), 1, 'sweep: 0 fixtures → exit 1');
    const lines = []; CV.runCli([], { ...quiet, log: (x) => lines.push(x) });
    t(lines.some((x) => x.includes('0 ใบ') && x.startsWith('✗')), 'sweep: 0 fixtures → loud message');
    for (const f of ['BBL-real', 'FER-real', 'ZTS-real']) fs.copyFileSync(path.join(src, f + '.json'), path.join(fixDir, f + '.json'));
    const l2 = []; t.eq(CV.runCli([], { ...quiet, log: (x) => l2.push(x) }), 1, 'sweep: EQIX-real missing → exit 1 (E17 regression not dropped)');
    t(l2.some((x) => x.startsWith('✗') && x.includes('EQIX-real')), 'sweep: names the missing EXPECT_FIXTURE key');
    fs.copyFileSync(path.join(src, 'EQIX-real.json'), path.join(fixDir, 'EQIX-real.json'));
    t.eq(CV.runCli([], quiet), 0, 'sweep: all 4 present → exit 0');
    // (4) realpath: fixture ที่เข้าทาง symlink ยังเป็น fixture (นาฬิกาแช่ + EXPECT_FIXTURE) ไม่ใช่ใบธรรมดา
    const link = path.join(tmp, 'fxlink'); fs.symlinkSync(fixDir, link);
    t.eq(CV.runCli([path.join(link, 'EQIX-real.json')], quiet), 0, 'path arg via symlink → still a fixture (expects E17)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
// CODES ครบ inventory ของ ruling R4
t.eq(CV.CODES.map((c) => c.id).sort(), ['E17', 'E27', 'E50', 'E51', 'E52', 'W07', 'W09', 'W18', 'W25', 'W30', 'W31', 'W32'], 'CODES = native inventory (R4)');
// ── final review (3) — ffoPayout หารด้วย FFO/หุ้น: 0 → "Infinity%" · ลบ → payout ติดลบ ⇒ guard > 0 + backstop E51 ถ้าหน้าหลุด NaN/Infinity/undefined
{ const d = load('EQIX-real'); delete d._sig; d.fundamentals.ffoPerShare = 0; d.metrics.cards.push('ffoPayout');
  const r = noThrow(() => run(signed(d)), '(3) EQIX ffoPerShare 0');
  t(ids(r, 'errors').includes('E51'), '(3) EQIX-derived: ffoPerShare 0 + ffoPayout card → E51'); }
for (const ffo of [0, -1.5]) {   // ใบที่ไม่มีอะไรอื่นใช้ FFO — แยกให้เห็นว่า guard ของการ์ดเองเป็นคนยิง (ไม่ใช่ backstop)
  const d = load('ZTS-real'); delete d._sig; d.fundamentals.ffoPerShare = ffo; d.metrics.cards.push('ffoPayout');
  const e = noThrow(() => run(signed(d)), `(3) ZTS ffoPerShare ${ffo}`).errors.find((x) => x.id === 'E51');
  t(e && e.msg.includes('ffoPayout'), `(3) ffoPerShare ${ffo} + ffoPayout → E51 naming the card`); }
{ const R = require('../../_template/v3/render.js'), orig = R.toV2Source;
  for (const leak of ['NaN', 'Infinity', 'undefined']) {
    R.toV2Source = (doc, view) => orig(doc, view).replace('</h1>', ` ${leak}%</h1>`);
    let r; try { r = noThrow(() => run(load('ZTS-real')), `(3) stub ${leak}`); } finally { R.toV2Source = orig; }
    const e = r.errors.find((x) => x.id === 'E51');
    t(e && e.msg.includes(leak) && e.msg.includes('render leaked'), `(3) backstop: rendered page containing "${leak}" → E51`); } }
for (const f of ['ZTS-real', 'BBL-real', 'FER-real', 'EQIX-real']) t(!run(load(f)).errors.some((x) => x.id === 'E51'), `(3) backstop quiet on ${f}`);
// re-review: คำที่ผู้เขียนพิมพ์เอง (CHKP "Infinity Platform" ×3 ในคลังจริง) ต้องไม่ยิง — ทั้งใน prose และป้ายที่ render หลายจุด
{ const d = Z(); delete d._sig; d.prose.chart += ' Check Point Infinity Platform · Infinity Platform'; d.legs[0].label += ' (Infinity)'; d.catalysts[0] += ' — undefined behaviour ของคู่แข่ง';
  const r = noThrow(() => run(signed(d)), '(3) author-typed leak words');
  t(!r.errors.some((x) => x.id === 'E51'), '(3) backstop quiet on author-typed "Infinity Platform" / "undefined" (prose + label + list)'); }
{ const R = require('../../_template/v3/render.js'), orig = R.toV2Source;
  const d = Z(); delete d._sig; d.prose.chart += ' Infinity Platform';
  R.toV2Source = (doc, view) => orig(doc, view).replace('</h1>', ' Infinity%</h1>');
  let r; try { r = noThrow(() => run(signed(d)), '(3) author word + injected leak'); } finally { R.toV2Source = orig; }
  t(r.errors.some((x) => x.id === 'E51' && x.msg.includes('Infinity')), '(3) author "Infinity" does not mask a render-made "Infinity"'); }
for (const f of ['ZTS', 'BBL']) t(!run(load(f), { skipSig: true }).errors.some((x) => x.id === 'E51'), `(3) backstop quiet on ${f} (synthetic)`);
t.done();
