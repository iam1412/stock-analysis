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
{ const d = Z(); delete d._sig; d.market.priceDate = shift(today0, -200); t(ids(run(signed(d), { today: today0 }), 'errors').includes('E27'), 'E27: price 200 days old'); }
{ const d = Z(); delete d._sig; d.market.priceDate = shift(today0, -60); t(ids(run(signed(d), { today: today0 }), 'warnings').includes('W09'), 'W09: price 60 days old'); }
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
{ const d = Z(); delete d._sig; halfPx(d);
  t(!ids(run(signed(d)), 'warnings').includes('W32'), 'W32 silent: MOS 50% but the P/E leg (inferred family market) confirms'); }
{ const d = Z(); delete d._sig; d.legs.forEach((l) => { l.family = 'rg'; }); d.fvWeights = null; halfPx(d);
  t(ids(run(signed(d)), 'warnings').includes('W32'), 'W32: MOS 50% and every fv leg is family rg'); }
{ const d = Z(); delete d._sig; d.legs = d.legs.filter((l) => l.method !== 'pe'); d.fvWeights = null; halfPx(d);
  t(ids(run(signed(d)), 'warnings').includes('W32'), 'W32: no family key — ddm + declared(other) are inferred rg'); }
{ const d = Z(); d.meta.aiModel = 'Claude Foo 5'; delete d._sig; t(ids(run(signed(d)), 'errors').includes('v2:E28'), 'pass-through: v2 E28 on the rendered page surfaces as v2:E28'); }
t(!ids(run(Z()), 'errors').some((x) => CV.NATIVE_V2.has(x.replace(/^v2:/, '')) && x.startsWith('v2:')), 'native codes are not double-reported from the v2 pass-through');

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
// CODES ครบ inventory ของ ruling R4
t.eq(CV.CODES.map((c) => c.id).sort(), ['E17', 'E27', 'E50', 'E51', 'E52', 'W07', 'W09', 'W18', 'W25', 'W30', 'W31', 'W32'], 'CODES = native inventory (R4)');
t.done();
