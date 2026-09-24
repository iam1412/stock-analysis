'use strict';
// ใบจริง Task 0 (BBL ธนาคาร · EQIX REIT · FER SOTP/EUR · ZTS Plan 1) — เกณฑ์ที่ต้องคงตลอด Plan 2a (spec §12):
// FV ไม่เปลี่ยน (ค่าจาก compare doc) · กติกา B 0 error · gate v2 บนหน้าที่ render = 0 error 0 warning
const t = require('./_t.js')('real-fixtures');
const C = require('../../tools/v3/compute.js');
const P = require('../../tools/v3/prose.js');
const R = require('../../_template/v3/render.js');
const { expandReport } = require('../../build.js');
const CR = require('../check-reports.js');

const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
const round2 = (x) => Math.round(x * 100) / 100;
// docs/superpowers/specs/2026-09-24-{BBL,EQIX,FER,zts}-v3-compare.md — ห้ามขยับ
const FV = { 'BBL-real': 176.77, 'EQIX-real': 1253.33, 'FER-real': 53.42, 'ZTS-real': 85 };

for (const f of Object.keys(FV)) {
  const doc = load(f);
  const view = C.compute(doc, { seeds: {} });
  t.eq(round2(view.fv), FV[f], `${f}: FV unchanged vs compare doc`);
  t.eq(P.checkRuleB(doc, view).errors.map((e) => `${e.path} ${e.literal}→${e.token}`), [], `${f}: rule B — 0 errors`);
  const d2 = load(f); d2.market.priceDate = today; d2.meta.analysisDate = today;   // E27/W09 ใช้นาฬิกาจริง
  const v2 = C.compute(d2, { seeds: {} });
  const src = R.toV2Source(d2, v2);
  const res = CR.checkHtml(expandReport(src), `${d2.symbol}.html`, { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], `${f}: v2 gate on render — 0 errors`);
  t.eq(res.warnings.map((e) => `${e.id} ${e.msg}`), [], `${f}: v2 gate on render — 0 warnings`);
}
// Task 5 — EQIX: กรอบ FV = ความไวของขา P/E 59.9–99.2x (compare doc gap 1) · BBL: family แทน fvWeights
{ const v = C.compute(load('EQIX-real'), { seeds: {} });
  t.eq([round2(v.fvLow), round2(v.fvHigh)], [931.45, 1542.56], 'EQIX-real: fvLow/fvHigh = 15.55 × 59.9 / 99.2');
  t.eq(v.legs.map((l) => l.role), ['fv', 'context'], 'EQIX-real: P/AFFO leg is context');
  t.eq([v.legs[1].method, v.legs[1].inputs.multipleSource], ['pffo', 'current'], 'EQIX-real: context leg is computed (R7), not declared');
  t.eq(v.legs[1].liveMultiple.toFixed(1), (load('EQIX-real').market.px / 38.33).toFixed(1), 'EQIX-real: live P/AFFO = px / AFFO per share'); }
t.eq(C.weightsOf(load('BBL-real')), [0.5, 0.25, 0.25], 'BBL-real: family weights reproduce the old fvWeights exactly');
// Task 6 — FER DDM 40 ปีคำนวณเอง (ไม่ใช่ declared) · FV คงที่ 53.42
{ const v = C.compute(load('FER-real'), { seeds: {} });
  t.eq(v.legs[1].method, 'ddm2', 'FER-real: finite DDM is a computed leg');
  t.eq(round2(v.legs[1].value), 55.02, 'FER-real: ddm2 = $55.02'); }
t.eq(load('BBL-real').metrics.custom.length, 0, 'Task 8: BBL-real needs no custom card (FY + bank are catalogue keys)');
// Task 9 — EQIX: การ์ด REIT จากแคตตาล็อก (P/AFFO สด 27.6x แทน literal ค้าง ~26.6x) · stock-meta.pe = ราคา/EPS (§13.5)
{ const d = load('EQIX-real'), v = C.compute(d, { seeds: {} });
  t.eq(d.metrics.custom.length, 0, 'EQIX-real: no custom cards');
  t.eq(require('../../tools/v3/cards.js').renderCard('pffo', v).v, (d.market.px / 38.33).toFixed(1) + 'x', 'EQIX-real: live P/AFFO card');
  t.eq(v.sm.pe, +(d.market.px / 15.55).toFixed(6), 'EQIX-real: stock-meta.pe = px / GAAP EPS (§13.5)');
  // controller ruling A — token ของขา context P/AFFO = ราคา ÷ AFFO/หุ้น · รูปแบบเดียวกับ token ตัวคูณอื่น (1 ทศนิยม + x)
  t.eq(P.renderProse('{{leg2.multiple}}', v, { mode: 'v2src' }), (d.market.px / 38.33).toFixed(1) + 'x', 'EQIX-real: {{leg2.multiple}} = live P/AFFO');
  // controller ruling B — prose ไม่พิมพ์ P/AFFO / P/E ปัจจุบันเป็นเลขแช่แข็ง (ค้างแล้ว: ~26.6x / 65.7x)
  const all = P.proseFields(d).map((x) => x.text).join('\n');
  t(!/26\.6x|65\.7x|23\.8x/.test(all), 'EQIX-real: no stale price-bound P/AFFO / P/E literals left in prose');
  t(d.risks[0].includes('{{pffo}}x') && d.risks[0].includes('{{pe}}x'), 'EQIX-real: risks[0] uses live {{pffo}} / {{pe}}'); }
// Task 10 — FER: ตัวเลขงบ EUR อยู่ในการ์ดแคตตาล็อก (สกุล €) · custom เหลือ 1
{ const d = load('FER-real'), v = C.compute(d, { seeds: {} }), K = require('../../tools/v3/cards.js');
  t.eq([K.renderCard('revenue', v).v, K.renderCard('fcf', v).v, K.renderCard('netIncomeFy', v).v], ['€9.86B', '€1.88B', '€888M'], 'FER-real: statement cards in EUR');
  t.eq(d.metrics.custom.length, 1, 'FER-real: one custom card left (parent net cash)'); }
// ── Task 13 — เกณฑ์จบ Plan 2a (spec §12) ──
const REAL = ['BBL-real', 'EQIX-real', 'FER-real', 'ZTS-real'];
// ขา declared เหลือได้เฉพาะที่ไม่มี method คำนวณ (ruling R7)
// EQIX-real: 0 ขา — ขา context ตัวคูณปัจจุบันเป็น pffo 'current' ที่คำนวณได้แล้ว (spec §13 ข้อ 6)
const DECLARED_OK = {
  'FER-real': [0],   // SOTP basis sotp + extrasRef — E52 ผูกยอดตารางกับค่าขา
  'ZTS-real': [1],   // Gordon ขั้นเดียวบน FCF — v3 ไม่มี method นี้ (เจ้าของตัดสิน)
};
for (const f of REAL) {
  const d = load(f);
  t((d.metrics.custom || []).length <= 2, `${f}: custom cards ≤ 2 (got ${(d.metrics.custom || []).length})`);
  t.eq(d.legs.map((l, i) => (l.method === 'declared' ? i : -1)).filter((i) => i >= 0), DECLARED_OK[f] || [], `${f}: declared legs only where no method exists`);
  const texts = P.proseFields(d).map((x) => x.text.trim()).filter((s) => s.length > 20);
  t.eq(texts.length, new Set(texts).size, `${f}: no prose field repeated verbatim`);
}
// ประโยคที่ Task 0 ต้องยัดซ้ำเพราะไม่มีช่อง — ต้องหายหมด (compare docs)
{ const F = load('FER-real');
  t(!F.prose.disclaimerSources.includes('สมมติฐานที่อ่อนไหวที่สุด'), 'FER-real: the disclaimer clause lives only in text.disclaimerAssump');
  t(!F.prose.valuation.includes('ห้ามใช้ P/E</b><br>'), 'FER-real: the §3 hint lives only in text.valHint');
  t(!F.extras[1].note.includes('รวม SOTP'), 'FER-real: the SOTP total lives only in the total row');
  t(!F.legs[0].note.includes('€44.83'), 'FER-real: leg 1 no longer repeats the table total');
  t(!/g 11%\/ปี 10 ปีแรก/.test(F.legs[1].note), 'FER-real: ddm2 inputs are not repeated in the note'); }
t(!load('EQIX-real').legs[1].label.includes('บริบท'), 'EQIX-real: the context marker comes from role, not the label');
t(!/26\.6x|\$38\.33/.test(load('EQIX-real').legs[1].note || ''), 'EQIX-real: the context leg note carries no frozen multiple/base (R7)');
t(!/มัธยฐาน P\/E FY2022/.test(load('EQIX-real').legs[0].note), 'EQIX-real: the median window lives in inputs.medianWindow');
t(!('eps' in load('BBL-real').metrics.notes), 'BBL-real: FY EPS lives in fundamentals.fy, not a note');
t.eq(load('BBL-real').fvWeights, null, 'BBL-real: weights come from family, not typed numbers');
// Task 13 carry (a) — BBL-real NIM card keeps the v2 colour (reports/BBL.html: <div class="v neu">) via tone
{ const d = load('BBL-real'); const src = R.toV2Source(d, C.compute(d, { seeds: {} }));
  const nim = [...src.matchAll(/<div class="metric"><div class="k">([^<]*)<\/div><div class="v([^"]*)">/g)].find((m) => m[1] === 'NIM');
  t.eq(nim && nim[2], ' neu', 'BBL-real: NIM card is .neu like v2'); }
// Task 13 carry (b) — FER-real FY2025 revenue is a number in fundamentals.fy + the revenueFy card, not a typed note literal
{ const d = load('FER-real'), v = C.compute(d, { seeds: {} }), K = require('../../tools/v3/cards.js');
  t.eq(d.fundamentals.fy.revenue, 9627000000, 'FER-real: fundamentals.fy.revenue = €9,627M (FY2025)');
  t(d.metrics.cards.includes('revenueFy'), 'FER-real: revenueFy card listed');
  t.eq([K.renderCard('revenueFy', v).k, K.renderCard('revenueFy', v).v], ['รายได้ FY2025', '€9.63B'], 'FER-real: revenueFy card in EUR');
  t(!/9,627/.test(d.metrics.notes.revenue || ''), 'FER-real: revenue note no longer hand-types the FY2025 total'); }
t.done();
