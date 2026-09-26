'use strict';
const t = require('./_t.js')('migrate-equiv');
const fs = require('fs'), path = require('path');
const B = require('../../build.js');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const K = require('../../tools/v3/cards.js');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const A = require('../../tools/migrate-v3/assemble.js');
const EQ = require('../../tools/migrate-v3/equiv.js');
const BK = require('../../tools/migrate-v3/buckets.js');
const SEEDS = require('../../tools/seeds.json');
const FIX = path.join(__dirname, '..', 'fixtures');
const raw = (sym) => fs.readFileSync(path.join(FIX, `${sym}-v2.html`), 'utf8');
function migrate(sym, html) {
  const parsed = PV.parseV2(sym, html);
  const { doc, notes } = A.assemble(parsed, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: parsed.rd.values.priceDate, analysisPx: null });
  const view = C.compute(doc, { seeds: SEEDS });
  const v2 = B.expandReport(html), v3 = B.expandReport(R.toV2Source(doc, view));
  return { doc, view, notes, v2, v3, eq: EQ.compare(v2, v3, doc, view, { v2src: html }) };
}
// Plan 4c-prep Task 5: assemble พกคำเข้าช่องใหม่แล้ว — test ของ gate ถอดช่องที่พกออกจาก doc (v3 ไม่พกคำ) แล้วเทียบใหม่: gate ต้องยังจับคำที่หาย
function recompare(m, html, mutate) {
  const doc = JSON.parse(JSON.stringify(m.doc)); mutate(doc);
  const view = C.compute(doc, { seeds: SEEDS });
  return EQ.compare(m.v2, B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: html });
}
// display-fix2: assemble พกเซลล์หมวด 6 ของผู้เขียน (v2Display.s6) เมื่อ template พิมพ์ไม่ตรง — test ของ gate (TEXT LOST/TEMPLATE_COUNTED บนทาง template) ถอดเซลล์ออกแล้วเทียบใหม่
const stripCells = (doc) => { if (doc.v2Display) { delete doc.v2Display.s6; delete doc.v2Display.noBase; if (!Object.keys(doc.v2Display).length) delete doc.v2Display; } };
// identity
{ const html = raw('BBL'); const v2 = B.expandReport(html); const z = EQ.zones(v2);
  t(z.has('header') && z.has('s1') && z.has('s8') && z.has('disc') && z.has('footer'), 'zones: header · s1…s8 · disc · footer located');
  const parsed = PV.parseV2('BBL', html); const { doc } = A.assemble(parsed, { seeds: SEEDS, headUpdated: null, v2Hash: B.freshHash(html), today: parsed.rd.values.priceDate, analysisPx: null });
  const view = C.compute(doc, { seeds: SEEDS });
  const same = EQ.compare(v2, v2, doc, view, { v2src: html });
  t(same.textLost.length === 0 && same.numberValue.length === 0 && same.zones.every((z) => !z.runs.length), 'compare(page, page) → no runs'); }
// acceptance (fix round 1 · controller ruling): TEXT LOST = 0 on ≥5 fixtures · not HUMAN on ≥4 (spec §11 row 4b: CLEAN มี TEXT LOST = 0)
// SGC (TH) / NFG (US) = corpus docs with the template-default §2 hint ("โดยประมาณ"), no H note, TEXT LOST 0 — frozen from reports/ 25 ก.ย. 69
// Plan 4c-prep Task 5 round 4 ruling (replaces round 3's blanket block): on a basis-bearing leg an agreement word (GAAP · adj. · adjusted · non-GAAP)
//  is carried only when it equals the label v3 renders; forward/period words (guidance …) always block unless baseOf consumed them —
//  FTV leg 1 tail "อิง TTM adjusted diluted EPS (continuing ops) แบบอนุรักษ์นิยม ไม่รวม upside จาก guidance FY26" ("guidance" = forward word · always blocks)
//  ⇒ TEXT LOST ⇒ FTV = HUMAN (re-pinned below, not dropped) · เกณฑ์ spec §11 row 4b ยังผ่าน: TEXT LOST 0 บน 5 ใบ (BBL CASY SRE SGC NFG) · ไม่ HUMAN 4 ใบ (CASY SRE SGC NFG)
const NON_HUMAN = ['CASY', 'SRE', 'SGC', 'NFG'];
const FTV_LOST = ['อิง', 'continuing', 'ops', 'แบบอนุรักษ์นิยม', 'ไม่รวม', 'upside', 'guidance'];
{ const m = migrate('FTV', raw('FTV'));
  t.eq(m.eq.textLost, FTV_LOST, 'FTV (round 4 ruling): pe-leg tail with a forward word (guidance) not carried → TEXT LOST');
  t.eq(BK.bucketOf(m.notes, m.eq).bucket, 'HUMAN', 'FTV (round 4 ruling): → HUMAN'); }
t(['BBL', ...NON_HUMAN].length >= 5 && NON_HUMAN.length >= 4, 'spec §11 row 4b acceptance still met: TEXT LOST 0 on ≥5 fixtures · not HUMAN on ≥4');
for (const sym of ['BBL', ...NON_HUMAN]) {
  const m = migrate(sym, raw(sym));
  // final-review I-1: BBL leg 1 "Normalized EPS ~฿22 × P/E เฉลี่ย ~9.0x" — the "เฉลี่ย" source claim sits in the formula head
  // Plan 4c-prep Task 5 (qualifierOf round 3 — brief Step 4): คำผู้เขียนในท่อนสูตรนอกวงเล็บ = พกไป legs[i].note ⇒ BBL TEXT LOST 0
  //  gate ยังจับคำนี้ได้: ถอด "เฉลี่ย" ออกจาก note ของ v3 → TEXT LOST ['เฉลี่ย'] (ค่าที่ pin เดิม)
  t.eq(m.eq.textLost, [], `${sym}: TEXT LOST = 0`);
  if (sym === 'BBL') {
    t(/^เฉลี่ย · /.test(m.doc.legs[0].note || ''), 'BBL: round 3 carries the head word "เฉลี่ย" into legs[0].note', m.doc.legs[0].note);
    t.eq(recompare(m, raw(sym), (d) => { d.legs[0].note = d.legs[0].note.replace(/^เฉลี่ย · /, ''); }).textLost, ['เฉลี่ย'], 'BBL: without the carried word → TEXT LOST [เฉลี่ย] (computed-leg head word, I-1)');
  }
  const b = BK.bucketOf(m.notes, m.eq);
  if (NON_HUMAN.includes(sym)) t(b.bucket !== 'HUMAN', `${sym}: bucket is CLEAN or VALUE-DRIFT (${b.bucket}: ${b.reasons.join(' ; ')})`);
  else t(b.bucket === 'HUMAN' && m.notes.H.length && m.notes.H.every((r) => /analyst target .*max\/min/.test(r)), `${sym}: HUMAN only by the analyst max/min note (Task 5 round 4)`, JSON.stringify(m.notes.H));
  // fix round 2 · G-1 (controller ruling · plan D5): gauge.{min,max} rows are F — SGC/NFG drift only on the gauge ⇒ CLEAN, the rows stay in eq.rd + F reasons
  if (['SGC', 'NFG'].includes(sym)) t(b.bucket === 'CLEAN' && m.eq.rd.length > 0 && m.eq.rd.every((r) => /^gauge\./.test(r.path)) && b.reasons.some((r) => /^rd\/sm gauge\./.test(r)), `${sym}: gauge-only rd rows → CLEAN (gauge row kept as F)`, JSON.stringify({ b, rd: m.eq.rd }));
}
// DPZ — Plan 4c-prep D5 (cap 8 for migrated docs): the 5th custom card is kept ⇒ its words are on the v3 page ⇒ not TEXT LOST, no cap H
{
  const html = raw('DPZ'), m = migrate('DPZ', html);
  const b = BK.bucketOf(m.notes, m.eq);
  const card = PV.parseV2('DPZ', html).s1cards.find((c) => c.k === 'Store Count (Global)');
  const words = EQ.tok(EQ.text(`${card.kHtml} ${card.vHtml} ${card.dHtml}`)).filter(EQ.isWord).map(EQ.wordOf);
  t(!m.notes.H.some((r) => /^custom cards/.test(r)) && b.bucket !== 'HUMAN', 'DPZ: no cap H with cap 8 (migrated) — not HUMAN', JSON.stringify({ H: m.notes.H, b }));
  t(words.length > 0 && words.every((w) => !m.eq.textLost.includes(w)), 'DPZ: the 5th card words are not lost', JSON.stringify(m.eq.textLost));
}
// cap positive case moved to a synthetic 9-custom DPZ: 4 extra custom cards injected at the head of the §1 grid ⇒ 9 > 8 ⇒ H,
// and the TEXT LOST words are exactly the dropped card's words (same shape as the 4b DPZ test — nothing else lost, nothing masked)
{
  const extra = [1, 2, 3, 4].map((i) => `<div class="metric"><div class="k">ตัวชี้วัดพิเศษ${i}</div><div class="v">ค่าพิเศษ${i}</div><div class="d">หมายเหตุพิเศษ${i}</div></div>`).join('\n      ');
  const html = raw('DPZ').replace(/(<div class="grid g4">\s*)/, (m0, a) => `${a}${extra}\n      `);
  const m = migrate('DPZ', html);
  const cap = m.notes.H.find((r) => /^custom cards 9 > 8 — dropped /.test(r));
  t(!!cap, 'DPZ+4: custom cards 9 > 8 → H', JSON.stringify(m.notes.H));
  const labels = cap ? [...cap.matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  const want = PV.parseV2('DPZ', html).s1cards.filter((c) => labels.includes(c.k)).flatMap((c) => EQ.tok(EQ.text(`${c.kHtml} ${c.vHtml} ${c.dHtml}`)).filter(EQ.isWord).map(EQ.wordOf));
  t(labels.length === 1 && want.length > 0, 'DPZ+4: exactly one card dropped', JSON.stringify(labels));
  t.eq(m.eq.textLost.slice().sort(), want.slice().sort(), 'DPZ+4: TEXT LOST words = exactly the dropped card');
}
for (const sym of ['AAPL', 'DDOG']) { const m = migrate(sym, raw(sym)); const b = BK.bucketOf(m.notes, m.eq); t(b.bucket === 'HUMAN' && b.reasons.some((r) => /analyst/.test(r)), `${sym}: HUMAN (analyst leg)`); }
// Review Focus 5a / spec §10.2 d — never mask a written region: a word injected into a token-bearing .ret cell must surface as TEXT LOST
// Plan 4b Task 6b: a plain .ret annotation is now carried (cases[i].retNote) — so the non-masking proof injects behind a per-year label,
// which assemble refuses to relabel onto the v3 total (not carried) · the plain word is asserted carried, not lost
{
  const html = raw('BBL').replace(/(<div class="ret[^"]*">\{\{rd:sc1ret\}\})/, '$1 ต่อปี มะม่วงสุกงอม');
  t(/มะม่วงสุกงอม/.test(html), 'mutation applied (anchor found)');
  const m = migrate('BBL', html);
  t(m.eq.textLost.includes('มะม่วงสุกงอม'), '.ret injected word → TEXT LOST (region not masked)', JSON.stringify(m.eq.textLost));
  { const bk = BK.bucketOf(m.notes, m.eq); t(bk.bucket === 'HUMAN' && bk.reasons.some((r) => /^TEXT LOST/.test(r)), 'TEXT LOST → HUMAN', JSON.stringify(bk.reasons.slice(0, 3))); }
  const k = migrate('BBL', raw('BBL').replace(/(<div class="ret[^"]*">\{\{rd:sc1ret\}\})/, '$1 มะม่วงสุกงอม'));
  t(k.doc.scenarios.cases[0].retNote === 'มะม่วงสุกงอม' && !k.eq.textLost.includes('มะม่วงสุกงอม'), '6b: a plain .ret annotation is carried (retNote) — not lost', JSON.stringify(k.eq.textLost));
}
// Review Focus 5b — moved paragraph is "moved", not lost
{
  const m0 = migrate('SRE', raw('SRE'));
  const doc = JSON.parse(JSON.stringify(m0.doc));
  const moved = doc.prose.valuation; doc.prose.valuation = 'ย่อหน้าสั้น'; doc.prose.chart = doc.prose.chart + '<br>' + moved;
  const view = C.compute(doc, { seeds: SEEDS });
  const eq = EQ.compare(m0.v2, B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: raw('SRE') });
  t(eq.textLost.length === 0 && eq.moved.length > 0, 'paragraph moved to another zone → moved, not lost', JSON.stringify({ lost: eq.textLost, moved: eq.moved.slice(0, 5) }));
}
// a word deleted from the v3 side → TEXT LOST
{
  const m0 = migrate('SRE', raw('SRE'));
  const doc = JSON.parse(JSON.stringify(m0.doc));
  const w = doc.prose.verdictBody.split(' ').find((x) => x.length >= 4 && !/\{\{/.test(x));
  doc.prose.verdictBody = doc.prose.verdictBody.replace(w, '').replace(/\s+/g, ' ');
  const view = C.compute(doc, { seeds: SEEDS });
  const eq = EQ.compare(m0.v2, B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: raw('SRE') });
  t(eq.textLost.includes(w.replace(/[^\p{L}\p{N}]/gu, '')), `verdict word "${w}" deleted → TEXT LOST`, JSON.stringify(eq.textLost));
}
// structured diff catches an engine-visible change the text compare cannot see
{
  const m0 = migrate('SRE', raw('SRE'));
  const view = { ...m0.view, rd: { ...m0.view.rd, chart: { ...m0.view.rd.chart, max: m0.view.rd.chart.max + 10 } } };
  const eq = EQ.compare(m0.v2, m0.v3, m0.doc, view, { v2src: raw('SRE') });
  t(eq.rd.some((r) => r.path === 'chart.max'), 'structured diff: chart.max change → rd row', JSON.stringify(eq.rd));
  const b = BK.bucketOf(m0.notes, eq); t(b.bucket !== 'CLEAN', 'rd row → not CLEAN');
}
// Task 5 parked M-8 (controller carry) — a peForward card whose rendered multiple changes (ADM 15.2 → 15.9, no D note)
// must surface on the page compare: numberValue row → not CLEAN. v2 side prints the card at 15.2x; v3 computes 15.9x.
{
  const html0 = raw('SRE');
  const m0 = migrate('SRE', html0);
  const doc = JSON.parse(JSON.stringify(m0.doc));
  doc.fundamentals.epsForward = +(doc.market.px / 15.9).toFixed(4);
  doc.metrics.cards = doc.metrics.cards.concat(['peForward']);
  const view = C.compute(doc, { seeds: SEEDS });
  const c = K.renderCard('peForward', view);
  t(/15\.9x/.test(c.v), 'M-8 setup: v3 peForward card prints 15.9x', c.v);
  // the v2 author card: same label/.d, multiple printed as of the analysis day (15.2x) — appended as the last s1 card
  const card = `<div class="metric"><div class="k">${c.k}</div><div class="v neu">~15.2x</div><div class="d">${c.d}</div></div>`;
  const html = html0.replace(/(<div class="grid g4">[\s\S]*?)(\n\s*<\/div>\s*(?:<p\b[^>]*>[\s\S]*?<\/p>\s*)?<\/section>)/, `$1\n      ${card}$2`);
  t(html !== html0, 'M-8 setup: v2 card inserted');
  const eq = EQ.compare(B.expandReport(html), B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: html });
  t(eq.numberValue.some((r) => r.zone === 's1' && /15\.2/.test(r.del) && /15\.9/.test(r.ins)), 'M-8: peForward multiple 15.2x → 15.9x → numberValue row in s1', JSON.stringify(eq.numberValue));
  const notes = { H: [], D: [], F: m0.notes.F };
  // review M-3: isolate the page row — no rd rows, no other page rows · the s1 row alone must make it VALUE-DRIFT
  const b = BK.bucketOf(notes, { ...eq, rd: [], numberValue: eq.numberValue.filter((r) => r.zone === 's1') });
  t(b.bucket === 'VALUE-DRIFT' && b.reasons.some((r) => /^s1: .*15\.2x.* → .*15\.9x/.test(r)), `M-8: page-only multiple change → VALUE-DRIFT without any D/rd row (${b.bucket}: ${b.reasons.join(' ; ')})`);
}
// fix round 1 · I-1 — a value change inside a run whose words resolve elsewhere still gives a numberValue row
{
  const m0 = migrate('SRE', raw('SRE'));
  const cat = /(<div class="box cat">[\s\S]*?<li>)/;
  const v2 = m0.v2.replace(cat, '$1ทดสอบค่า 15.2x (forward) ');
  const v3 = m0.v3.replace(cat, '$1ทดสอบค่า 15.9x ').replace(/(<div class="verdict">\s*<h2>)/, '$1forward ');
  t(v2 !== m0.v2 && v3 !== m0.v3, 'I-1 setup: anchors found');
  const eq = EQ.compare(v2, v3, m0.doc, m0.view, { v2src: raw('SRE') });
  t(!eq.textLost.includes('forward') && eq.numberValue.some((r) => r.zone === 's7' && /15\.2x/.test(r.del) && /15\.9x/.test(r.ins)), 'I-1: "15.2x (forward)" → "15.9x" (forward moved) → numberValue row', JSON.stringify({ lost: eq.textLost, nv: eq.numberValue.filter((r) => r.zone === 's7') }));
}
// fix round 1 · C-1 — template-zone normalisers strip only what the template prints: author words there surface as TEXT LOST
{
  const html = raw('SRE').replace(/(<div class="gdots">)/, '$1คำทดสอบในจุดสี ');
  t(/คำทดสอบในจุดสี/.test(html), 'C-1 setup: gdots word injected');
  // Plan 4c-prep Task 5: assemble พกข้อความ gdots → meta.sectorLine / เศษ legend → text.legendNote — gate เทียบบน doc ที่ถอดช่องนั้นออก
  const g1 = migrate('SRE', html);
  t(/คำทดสอบในจุดสี/.test(g1.doc.meta.sectorLine || '') && !g1.eq.textLost.includes('คำทดสอบในจุดสี'), 'C-1/Task 5: gdots word carried by meta.sectorLine', JSON.stringify(g1.doc.meta.sectorLine));
  t(recompare(g1, html, (d) => { delete d.meta.sectorLine; }).textLost.includes('คำทดสอบในจุดสี'), 'C-1: a word inside .gdots is compared (not masked)');
  const html2 = raw('SRE').replace(/(<div class="legend">[\s\S]*?จุดสำคัญ)/, '$1 (คำอธิบายจุดพิเศษ)');
  const g2 = migrate('SRE', html2);
  t(html2 !== raw('SRE') && /คำอธิบายจุดพิเศษ/.test((g2.doc.text || {}).legendNote || '') && !g2.eq.textLost.includes('คำอธิบายจุดพิเศษ'), 'C-1/Task 5: legend word carried by text.legendNote', JSON.stringify(g2.doc.text));
  t(recompare(g2, html2, (d) => { delete d.text.legendNote; if (!Object.keys(d.text).length) delete d.text; }).textLost.includes('คำอธิบายจุดพิเศษ'), 'C-1: an author word in the chart legend is compared (not masked)');
  const m = migrate('DPZ', raw('DPZ'));
  t(m.doc.text && m.doc.text.chartHint && !m.eq.textLost.includes('รายเดือน'), 'C-1: DPZ §2 hint residue is carried (text.chartHint) — not lost', JSON.stringify(m.doc.text));
  const doc = JSON.parse(JSON.stringify(m.doc)); delete doc.text.chartHint;
  const view = C.compute(doc, { seeds: SEEDS });
  const eq = EQ.compare(m.v2, B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: raw('DPZ') });
  t(eq.textLost.includes('รายเดือน'), 'C-1: §2 hint author words dropped from v3 → TEXT LOST (only "โดยประมาณ" is template)', JSON.stringify(eq.textLost));
  const f = migrate('FTV', raw('FTV'));
  const d2 = JSON.parse(JSON.stringify(f.doc)); delete d2.scenarios.hintNote;
  const v2v = C.compute(d2, { seeds: SEEDS });
  const e2 = EQ.compare(f.v2, B.expandReport(R.toV2Source(d2, v2v)), d2, v2v, { v2src: raw('FTV') });
  t(f.doc.scenarios.hintNote && e2.textLost.includes('adj'), 'C-1: FTV §6 hint "(TTM adj.)" is author text — dropped hintNote → TEXT LOST', JSON.stringify({ hn: f.doc.scenarios.hintNote, lost: e2.textLost }));
}
// fix round 2 · N-1 — a number run that exists only on the v3 side (52-week range from market.range52w) is info, not drift
{
  const m0 = migrate('SGC', raw('SGC'));
  const line = /กรอบ 52 สัปดาห์[^<]*<br>\s*/;
  const v2 = m0.v2.replace(line, '');
  const v3 = line.test(m0.v3) ? m0.v3 : m0.v3.replace(/(ที่มา:)/, 'กรอบ 52 สัปดาห์ ฿1.00 – ฿2.00<br>\n        $1');
  t(!line.test(v2) && line.test(v3), 'N-1 setup: v2 has no 52-week range, v3 has one');
  const eq = EQ.compare(v2, v3, m0.doc, m0.view, { v2src: raw('SGC') });
  t(!eq.numberValue.some((r) => r.zone === 'header') && eq.numberAdded.some((r) => r.zone === 'header'), 'N-1: v3-only number run → numberAdded (info), no numberValue', JSON.stringify({ nv: eq.numberValue, na: eq.numberAdded }));
  t.eq(BK.bucketOf(m0.notes, eq).bucket, BK.bucketOf(m0.notes, m0.eq).bucket, 'N-1: bucket unaffected by a v3-only number run');
  t(EQ.classify({ del: '฿5.00', ins: '' }).kind === 'number value', 'N-1: v2 number with no v3 counterpart stays value');
}
// number classification
t.eq(EQ.classifyNumber('฿163', '฿162.80'), 'rounding', 'number run within printed precision → rounding');
t.eq(EQ.classifyNumber('฿163', '฿170.10'), 'value', 'number run beyond → value');
t.eq(EQ.classifyNumber('8.7x', '8.68x'), 'rounding', 'multiple within half unit → rounding');
// final-review I-2 — TEMPLATE_VOCAB is zone → words (where the v2 skeleton prints each word); outside its zone a word goes through containment
t(EQ.TEMPLATE_VOCAB && EQ.TEMPLATE_VOCAB.s3.includes('เฉลี่ย') && EQ.TEMPLATE_VOCAB.footer.includes('workflow') && EQ.TEMPLATE_VOCAB.header.includes('ราคา')
  && !Object.values(EQ.TEMPLATE_VOCAB).some((ws) => ws.includes('มัธยฐาน')) && EQ.inVocab('s6', EQ.keyOf('ออก')) && !EQ.inVocab('s6', EQ.keyOf('มัธยฐาน')) && !EQ.inVocab('s7', EQ.keyOf('EPS')),
  'TEMPLATE_VOCAB: zone-scoped closed map (มัธยฐาน in no zone · ออก only in s6)');
{
  // SIRI-shaped §6 exit cell: v2 "15x (มัธยฐาน 5 ปี)" → v3 prints the multiple only ⇒ the author's annotation is TEXT LOST (was masked page-wide)
  const html = raw('SRE').replace('<li><span>P/E ออก</span><span>15x</span></li>', '<li><span>P/E ออก</span><span>15x (มัธยฐาน 5 ปี)</span></li>');
  t(html !== raw('SRE'), 'I-2 setup: exit cell annotated');
  const m0 = migrate('SRE', html);
  // display-fix2: the migrator now carries the author's cells (v2Display.s6) ⇒ the annotation is displayed, not lost
  t(m0.doc.v2Display && m0.doc.v2Display.s6 && m0.doc.v2Display.s6.every((c) => c.rows.some(([k, v]) => /ออก/.test(k) && (v === '15x (มัธยฐาน 5 ปี)' || !/มัธยฐาน/.test(v)))) && !m0.eq.textLost.includes('มัธยฐาน'), 'display-fix2: annotated exit cell carried verbatim (v2Display.s6) → not TEXT LOST', JSON.stringify({ s6: m0.doc.v2Display && m0.doc.v2Display.s6, lost: m0.eq.textLost }));
  const m = { ...m0, eq: recompare(m0, html, stripCells) };   // the template path (no author cells) — the gate must still see the loss
  t(m.eq.textLost.includes('มัธยฐาน') && !m.eq.templateDropped.includes('มัธยฐาน'), 'I-2: SIRI-shaped exit cell "15x (มัธยฐาน 5 ปี)" vs v3 "15x" → TEXT LOST', JSON.stringify({ lost: m.eq.textLost, td: m.eq.templateDropped }));
  t.eq(BK.bucketOf(m.notes, m.eq).bucket, 'HUMAN', 'I-2: → HUMAN');
  // legit template text stays dropped: CARR/ERIE footer "· สร้างด้วย stock-analyzer workflow" (footer zone)
  const f = migrate('SRE', raw('SRE').replace('• สร้างด้วย stock-analyzer workflow</footer>', '· สร้างด้วย stock-analyzer workflow</footer>'));
  t(f.eq.textLost.length === 0 && f.eq.templateDropped.includes('workflow'), 'I-2: footer template words stay templateDropped (CARR/ERIE shape)', JSON.stringify({ lost: f.eq.textLost, td: f.eq.templateDropped }));
  // the same words outside their zone are author text
  // the same words outside their zone are author text (v2 page only — v3 did not carry them)
  const g0 = migrate('SRE', raw('SRE'));
  const g = EQ.compare(g0.v2.replace(/(<div class="box cat">[\s\S]*?<li>)/, '$1สร้างด้วย workflow '), g0.v3, g0.doc, g0.view, { v2src: raw('SRE') });
  t(g.textLost.includes('สร้างด้วย') && g.textLost.includes('workflow'), 'I-2: footer vocab words dropped from §7 → TEXT LOST', JSON.stringify(g.textLost));
}
// final-review I-1 — author text inside a computed leg's .mdesc: carried to leg.note (qualifierOf) or TEXT LOST — never silently dropped
{
  // Plan 4c-prep Task 5 round 3 ruling: FTV leg 1 tail (adjusted · guidance) ไม่ถูกพกแล้ว — test ในบล็อกนี้วัดขา 2/3 จึงกลางคำฐานของขา 1 ออกก่อน (ไม่งั้นคำขา 1 ปนใน textLost)
  const FTV = raw('FTV').replace('อิง TTM adjusted diluted EPS (continuing ops) แบบอนุรักษ์นิยม ไม่รวม upside จาก guidance FY26', 'อิง TTM diluted EPS (continuing ops) แบบอนุรักษ์นิยม ไม่รวม upside');
  t(FTV !== raw('FTV'), 'I-1 setup: FTV leg 1 basis words neutralised');
  const L2 = '÷ ~305M หุ้น</div>', L3 = '(FCF yield เป้าหมาย ~4.9%)</div>';
  t(FTV.includes(L2) && FTV.includes(L3), 'I-1 setup: FTV leg 2/3 mdesc anchors found');
  // WHA-shaped nested parens + inner dash → whole parenthetical carried, no orphan ")"
  const wha = migrate('FTV', FTV.replace(L2, '÷ ~305M หุ้น (ตระกูล (r,g) เดียวกับ Justified P/BV — นับเป็นเสียงเดียว)</div>'));
  t(wha.doc.legs[1].method === 'evebitda' && wha.doc.legs[1].note === 'ตระกูล (r,g) เดียวกับ Justified P/BV — นับเป็นเสียงเดียว', 'I-1: WHA-shaped nested paren → note carried whole', JSON.stringify(wha.doc.legs[1]));
  const md = /<div class="mname">2\.[\s\S]*?<div class="mdesc">([\s\S]*?)<\/div>/.exec(wha.v3);
  t(md && /— ตระกูล \(r,g\) เดียวกับ Justified P\/BV — นับเป็นเสียงเดียว$/.test(EQ.text(md[1])) && (md[1].match(/\(/g) || []).length === (md[1].match(/\)/g) || []).length, 'I-1: v3 mdesc prints the note with balanced parens (no orphan ")")', md && md[1]);
  t.eq(wha.eq.textLost, [], 'I-1: WHA-shaped — nothing lost');
  // LEN-shaped: a parenthetical that mentions r/g but carries the author's sentence
  const len = migrate('FTV', FTV.replace(L3, '(FCF yield เป้าหมาย ~4.9%) (r, g เป็นสมมติฐานของผู้วิเคราะห์ · คนละตระกูลกับ P/E เพราะอิง ROE/book ไม่ใช่กำไรต่อหุ้น)</div>'));
  t(len.doc.legs[2].method === 'fcfyield' && len.doc.legs[2].note === 'r, g เป็นสมมติฐานของผู้วิเคราะห์ · คนละตระกูลกับ P/E เพราะอิง ROE/book ไม่ใช่กำไรต่อหุ้น' && len.eq.textLost.length === 0,
    'I-1: LEN-shaped (r, g … author sentence) → carried, not lost', JSON.stringify({ note: len.doc.legs[2].note, lost: len.eq.textLost }));
  // CMCSA-shaped " · " segment after the formula → carried
  const cm = migrate('FTV', FTV.replace(L2, '÷ ~305M หุ้น · เน้นกระแสเงินสดจ่ายคืนผู้ถือหุ้นระยะยาว (dividend + buyback)</div>'));
  t(cm.doc.legs[1].note === 'เน้นกระแสเงินสดจ่ายคืนผู้ถือหุ้นระยะยาว (dividend + buyback)' && cm.eq.textLost.length === 0, 'I-1: CMCSA-shaped "· เน้นกระแสเงินสด…" → carried', JSON.stringify({ note: cm.doc.legs[1].note, lost: cm.eq.textLost }));
  // gate mutation: a word removed from the computed leg's note (v3 side) → TEXT LOST → HUMAN
  const doc = JSON.parse(JSON.stringify(cm.doc)); doc.legs[1].note = 'เน้นกระแสเงินสด (dividend + buyback)';
  const view = C.compute(doc, { seeds: SEEDS });
  const eq = EQ.compare(cm.v2, B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: FTV.replace(L2, '÷ ~305M หุ้น · เน้นกระแสเงินสดจ่ายคืนผู้ถือหุ้นระยะยาว (dividend + buyback)</div>') });
  t(eq.textLost.includes('เน้นกระแสเงินสดจ่ายคืนผู้ถือหุ้นระยะยาว'), 'I-1: word removed from a computed leg note → TEXT LOST', JSON.stringify(eq.textLost));
  t.eq(BK.bucketOf(cm.notes, eq).bucket, 'HUMAN', 'I-1: → HUMAN');
  const d0 = JSON.parse(JSON.stringify(cm.doc)); delete d0.legs[1].note;
  const v0 = C.compute(d0, { seeds: SEEDS });
  const e0 = EQ.compare(cm.v2, B.expandReport(R.toV2Source(d0, v0)), d0, v0, { v2src: FTV });
  t(e0.textLost.includes('เน้นกระแสเงินสดจ่ายคืนผู้ถือหุ้นระยะยาว') && e0.textLost.includes('dividend'), 'I-1: computed leg note dropped entirely → its words TEXT LOST', JSON.stringify(e0.textLost));
  // an author word inside the formula head (qualifierOf does not carry it) → TEXT LOST; formula words (net debt · หุ้น) and generated words stay dropped
  // Plan 4c-prep Task 5 fix round 1 (ruling I-1 · fail closed): ท่อนสูตรนี้มี "Adjusted" (SY.QUALIFIER_BLOCK) ⇒ round 3 ไม่พกอะไรจากท่อนนี้ ⇒ assertion เดิมของ gate กลับมาตรง ๆ
  const head = migrate('FTV', FTV.replace('Adjusted EBITDA TTM $1,270M ×', 'Adjusted EBITDA TTM $1,270M มะม่วงสุกงอม ×'));
  t(!/มะม่วงสุกงอม/.test(head.doc.legs[1].note || ''), 'fix round 1: a head with a blocked basis word carries nothing', head.doc.legs[1].note);
  t(head.doc.legs[1].method === 'evebitda' && head.eq.textLost.length === 1 && head.eq.textLost[0] === 'มะม่วงสุกงอม', 'I-1: author word in the computed-leg formula head → TEXT LOST (only that word)', JSON.stringify(head.eq.textLost));
  // round 3 (head without a basis word) carries the word · gate still catches it when the note loses it
  const headHtml = FTV.replace('Adjusted EBITDA TTM $1,270M ×', 'EBITDA TTM $1,270M มะม่วงสุกงอม ×');
  const h2 = migrate('FTV', headHtml);
  if (h2.doc.legs[1].method === 'evebitda') {
    t(/มะม่วงสุกงอม/.test(h2.doc.legs[1].note || '') && !h2.eq.textLost.includes('มะม่วงสุกงอม'), 'Task 5: head word carried into legs[1].note by round 3', JSON.stringify({ note: h2.doc.legs[1].note, lost: h2.eq.textLost }));
    const headLost = recompare(h2, headHtml, (d) => { d.legs[1].note = d.legs[1].note.replace(/มะม่วงสุกงอม(?: · )?/, '').trim(); if (!d.legs[1].note) delete d.legs[1].note; }).textLost;
    t(headLost.includes('มะม่วงสุกงอม'), 'I-1: without the carried word → TEXT LOST', JSON.stringify(headLost));
  } else t(false, 'fixture: FTV leg 2 still evebitda without "Adjusted"', h2.doc.legs[1].method);
  // re-review I-3 (CNC shape): a forward/estimate basis qualifier the v3 label replaces ("EPS forward normalized $2.86" → "EPS … (TTM) $2.86")
  // is a changed fact, not a formula word → TEXT LOST → HUMAN · "normalized" stays dropped (v3 prints an equivalent basis)
  // Plan 4c-prep Task 5 (D2): assemble อ่านฐาน forward → inputs.base 'epsForward' (v3 พิมพ์ "EPS (forward)") ⇒ ไม่หาย
  //  gate ยังจับ: ถอด inputs.base (กลับไปเป็นฐาน TTM ที่ v3 ติดป้ายผิด) → "forward" TEXT LOST → HUMAN (ค่าที่ pin เดิม)
  const fwdHtml = FTV.replace('EPS adj. $2.86 ×', 'EPS forward normalized $2.86 ×');
  const fwd = migrate('FTV', fwdHtml);
  t(fwd.doc.legs[0].inputs.base === 'epsForward' && !fwd.eq.textLost.includes('forward'), 'Task 5: forward base detected → "forward" printed by the v3 base label', JSON.stringify({ lost: fwd.eq.textLost, leg: fwd.doc.legs[0] }));
  const fwdLost = recompare(fwd, fwdHtml, (d) => { delete d.legs[0].inputs.base; delete d.legs[0].baseLabel; d.legs[0].override = { eps: 2.86, why: 'ค่าที่ผู้เขียนใช้ในใบ v2' }; });
  t(FTV.includes('EPS adj. $2.86 ×') && fwd.doc.legs[0].method === 'pe' && fwdLost.textLost.includes('forward') && !fwdLost.textLost.includes('normalized'),
    'I-3: CNC-shaped "EPS forward normalized" vs v3 basis label → "forward" TEXT LOST', JSON.stringify({ lost: fwdLost.textLost }));
  t.eq(BK.bucketOf(fwd.notes, fwdLost).bucket, 'HUMAN', 'I-3: → HUMAN');
}
// ── Plan 4c-prep Task 4 (spec §3.7 ค · D4) ──
const SY = require('../../tools/migrate-v3/synonyms.js');
const docOf = (patch) => { const d = JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json'))); patch(d); return d; };
// no fact word ever enters the vocabulary (reviewer rule — like TEMPLATE_VOCAB/FORMULA_VOCAB)
{
  const all = SY.SYNONYM_VOCAB.flatMap((e) => e.from.flat().concat(e.to));
  t(all.every((w) => !SY.FACT_WORDS.some((re) => re.test(w))), 'SYNONYM_VOCAB holds no fact word (AFFO Core forward FY#E Tangible adj GAAP)', JSON.stringify(all.filter((w) => SY.FACT_WORDS.some((re) => re.test(w)))));
  t(SY.SYNONYM_VOCAB.every((e) => e.id && e.roles.length && typeof e.guard === 'function' && e.why && e.why.length > 10), 'every entry names roles · guard · why');
  t.eq(SY.FACT_WORDS.map(String).length >= 7, true, 'FACT_WORDS lists the seven fact words');
}
// Review Focus 4 — guards
{
  const g = (patch, extra) => ({ doc: docOf(patch), ...(extra || {}) });
  const ap = (role, ws, gg) => SY.apply(role, ws, gg).tokens;
  t.eq(ap('s6.exitRow', ['Exit', 'P/E'], g(() => {})), ['ออก', 'P/E'], 'exit row: Exit ≡ ออก');
  t.eq(ap('s6.top', ['Rev', '+6%/ปี'], g((d) => { d.scenarios.driver = 'eps'; })), ['Rev', '+6%/ปี'], 'guard: Rev under driver eps stays (different quantity)');
  t.eq(ap('s6.top', ['Rev', '+6%/ปี'], g((d) => { d.scenarios.driver = 'revenuePerShare'; })), ['รายได้', '+6%/ปี'], 'Rev ≡ รายได้ when driver revenuePerShare');
  t.eq(ap('s6.endRow', ['รายได้ปี', '3'], g((d) => { d.scenarios.driver = 'revenuePerShare'; })), ['รายได้', 'ปี', '3'], 'รายได้ปี ≡ รายได้ ปี');
  t.eq(ap('s6.divRow', ['ไม่จ่าย'], g(() => {}, { case: { divCum: 6.6 } })), ['ไม่จ่าย'], 'guard: ไม่จ่าย on a column with divCum > 0 stays');
  t.eq(ap('s6.divRow', ['ไม่จ่าย'], g(() => {}, { case: { divCum: 0 } })), [], 'ไม่จ่าย ≡ divCum 0');
  t.eq(ap('s6.top', ['EPS', 'ทรงตัว'], g(() => {}, { case: { growth: 1 } })), ['EPS', 'ทรงตัว'], 'guard: ทรงตัว with growth ≠ 0 stays');
  t.eq(ap('s6.top', ['EPS', 'ทรงตัว'], g(() => {}, { case: { growth: 0 } })), ['EPS'], 'ทรงตัว ≡ growth 0');
  t.eq(ap('s3.mname', ['DCF', '(บริบท', '—', 'ไม่รวมใน', 'FV)'], g(() => {}, { leg: { role: 'fv' } })), ['DCF', '(บริบท', '—', 'ไม่รวมใน', 'FV)'], 'guard: context words on a fv leg stay');
  t.eq(ap('s3.mname', ['DCF', '(บริบท', '—', 'ไม่รวมใน', 'FV)'], g(() => {}, { leg: { role: 'context' } })), ['DCF', '—'], 'บริบท · ไม่รวมใน FV ≡ the v3 context suffix on a context leg');
  t.eq(ap('s3.mdesc', ['มัธยฐานย้อนหลัง'], g(() => {}, { leg: { inputs: { multipleSource: 'author' } } })), ['มัธยฐานย้อนหลัง'], 'guard: มัธยฐานย้อนหลัง on an author multiple stays');
  t.eq(ap('s3.mdesc', ['มัธยฐานย้อนหลัง'], g(() => {}, { leg: { inputs: { multipleSource: 'median5y' } } })), ['มัธยฐาน'], 'มัธยฐานย้อนหลัง ≡ มัธยฐาน on a median leg');
  t.eq(ap('s6.top', ['FFO', '−5%/ปี'], g((d) => { d.fundamentals.ffoBasis = 'affo'; d.scenarios.driver = 'ffo'; })), ['FFO', '−5%/ปี'], 'guard: FFO under an AFFO basis stays (different fact)');
  t.eq(ap('s6.ret', ['ต่อปี'], g((d) => { d.scenarios.perYear = null; })), ['ต่อปี'], 'guard: ต่อปี without perYear stays');
  t.eq(ap('s6.ret', ['Total'], g(() => {})), [], 'Total in .ret ≡ the v3 total figure');
  // self-review: every guard with a negative (and a positive) case · role scoping
  t.eq(ap('s6.endRow', ['Rev', 'Sh', 'ปี', '3'], g((d) => { d.scenarios.driver = 'eps'; })), ['Rev', 'Sh', 'ปี', '3'], 'guard: Sh under a non-per-share driver (eps) stays');
  t.eq(ap('s6.endRow', ['FCF', 'share', 'ปี', '3'], g((d) => { d.scenarios.driver = 'fcfPerShare'; })), ['FCF', 'หุ้น', 'ปี', '3'], 'share ≡ หุ้น when the driver is per-share (fcfPerShare)');
  t.eq(ap('s6.endRow', ['รายได้ปี', '3'], g((d) => { d.scenarios.driver = 'fcfPerShare'; })), ['รายได้ปี', '3'], 'guard: รายได้ปี under a non-revenue driver stays');
  t.eq(ap('s6.top', ['FFO', '−5%/ปี'], g((d) => { d.fundamentals.ffoBasis = 'ffo'; d.scenarios.driver = 'ffo'; })).join(' '), 'FFO −5%/ปี', 'FFO under an FFO basis: identity (recorded as used)');
  t.eq(SY.apply('s6.top', ['FFO'], { doc: docOf((d) => { d.fundamentals.ffoBasis = 'ffo'; }) }).used.map((u) => u.id), ['ffo'], 'FFO synonym used under ffoBasis ffo');
  t.eq(SY.apply('s6.top', ['FFO'], { doc: docOf((d) => { d.fundamentals.ffoBasis = 'coreFfo'; }) }).used, [], 'guard: FFO under a Core FFO basis — not used');
  t.eq(ap('s6.ret', ['ต่อปี'], g((d) => { d.scenarios.perYear = 'cagr'; })), ['ปี'], 'ต่อปี ≡ ปี when perYear is set');
  t.eq(ap('s3.mdesc', ['มัธยฐานย้อนหลัง'], g(() => {})), ['มัธยฐานย้อนหลัง'], 'guard: มัธยฐานย้อนหลัง without an aligned leg stays');
  t.eq(ap('s6.top', ['Exit', 'P/E'], g(() => {})), ['Exit', 'P/E'], 'role scoping: Exit outside the exit row stays');
  t.eq(ap('s6.endRow', ['Total'], g(() => {})), ['Total'], 'role scoping: Total outside .ret stays');
  t.eq(ap('s6.divRow', ['ไม่จ่าย'], g(() => {})), ['ไม่จ่าย'], 'guard: ไม่จ่าย without an aligned column stays');
}
// integration — the migrator + gate on mutated fixtures: synonyms close the words, TEXT LOST reports what is not a synonym
{
  const html = raw('CASY').replace(/<span>P\/E ออก<\/span>/g, '<span>Exit P/E</span>');
  const m = migrate('CASY', html);
  t(!m.eq.textLost.includes('Exit') && m.eq.synonym.some((s) => s.id === 'exit' && s.zone === 's6'), 'CASY Exit P/E: closed by the exit synonym', JSON.stringify({ lost: m.eq.textLost, syn: m.eq.synonym }));
}
{
  const html = raw('CASY').replace(/<span>ปันผลรวม 3 ปี<\/span>/g, '<span>ปันผลสะสม 3 ปี</span>');
  const m0 = migrate('CASY', html);
  t(m0.doc.v2Display && m0.doc.v2Display.s6 && m0.doc.v2Display.s6.every((c) => c.rows.some(([k]) => k === 'ปันผลสะสม 3 ปี')), "display-fix2: the author's dividend label carried (v2Display.s6)", JSON.stringify(m0.doc.v2Display));
  const m = { ...m0, eq: recompare(m0, html, stripCells) };
  t(!m.eq.textLost.includes('ปันผลสะสม') && m.eq.templateDropped.filter((w) => w === 'ปันผลสะสม').length === 3, 'CASY ปันผลสะสม ×3: s6 TEMPLATE_COUNTED (3 columns)', JSON.stringify(m.eq.textLost));
  // condition "v3 column does not print the word": the author also writes it in the Bear scenario text (carried into cases[0].desc ⇒ inside a v3 column)
  // ⇒ the counted rule is off for this doc ⇒ the three label occurrences are compared normally (v3 prints the word once) ⇒ 3 TEXT LOST
  const inCol = html.replace(/(<li><span>สถานการณ์<\/span><span>)/, '$1ปันผลสะสม ');
  const mc0 = migrate('CASY', inCol), mc = { ...mc0, eq: recompare(mc0, inCol, stripCells) };
  t.eq(mc.eq.textLost.filter((w) => w === 'ปันผลสะสม').length, 3, 'TEMPLATE_COUNTED off when a v3 column prints the word (not a template word there)');
}
// fix round 1 (review I-1): TEMPLATE_COUNTED only at the label position of each column (≤1 per column) — never the hint, never a value cell
{
  // re-compare with the v3 doc patched so the author words are NOT carried (whatever assemble carried) — a word the v3 page lacks must be TEXT LOST
  const recmp = (html, patch) => {
    const parsed = PV.parseV2('CASY', html);
    const { doc } = A.assemble(parsed, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: parsed.rd.values.priceDate, analysisPx: null });
    stripCells(doc); patch(doc);
    const view = C.compute(doc, { seeds: SEEDS });
    return EQ.compare(B.expandReport(html), B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: html });
  };
  const base = raw('CASY');
  const orig = JSON.parse(JSON.stringify(migrate('CASY', base).doc.scenarios));
  const cnt = (xs, w) => xs.filter((x) => x === w).length;
  // (a) the words in the §6 hint
  const hint = base.replace('<div class="hint">จากจุดเข้า {{rd:px}}', '<div class="hint">รวม ปันผลสะสม รวมปันผล จากจุดเข้า {{rd:px}}');
  t(hint !== base, 'fixture: §6 hint mutated');
  const ea = recmp(hint, (d) => { d.scenarios.hintNote = orig.hintNote; if (d.scenarios.hintNote == null) delete d.scenarios.hintNote; });
  t(['รวม', 'ปันผลสะสม', 'รวมปันผล'].every((w) => ea.textLost.includes(w)) && !ea.templateDropped.some((w) => ['รวม', 'ปันผลสะสม', 'รวมปันผล'].includes(w)),
    'TEMPLATE_COUNTED never drops a hint word (รวม ปันผลสะสม รวมปันผล in the §6 hint → TEXT LOST)', JSON.stringify({ lost: ea.textLost, td: ea.templateDropped }));
  // (b) the word 3× inside one column's value cell (สถานการณ์), not carried by v3 → all 3 TEXT LOST
  const cell = base.replace(/(<li><span>สถานการณ์<\/span><span>)/, '$1ปันผลสะสม ปันผลสะสม ปันผลสะสม ');
  t(cell !== base, 'fixture: bear สถานการณ์ cell mutated');
  const eb = recmp(cell, (d) => { d.scenarios.cases[0].desc = orig.cases[0].desc; });
  t.eq(cnt(eb.textLost, 'ปันผลสะสม'), 3, 'TEMPLATE_COUNTED never drops a value-cell word (×3 in one สถานการณ์ cell → 3 TEXT LOST)');
  t.eq(cnt(eb.templateDropped, 'ปันผลสะสม'), 0, '… and none counted as template');
  // (b') the word in 3 label spans of ONE column → at most one dropped (1 per column), the other two TEXT LOST
  const labs3 = base.replace(/(<div class="col bear">[\s\S]*?)<span>EPS ปี 3<\/span>([\s\S]*?)<span>P\/E ออก<\/span>([\s\S]*?)<span>ปันผลรวม 3 ปี<\/span>/,
    '$1<span>ปันผลสะสม EPS ปี 3</span>$2<span>ปันผลสะสม P/E ออก</span>$3<span>ปันผลสะสม 3 ปี</span>');
  t(labs3 !== base, 'fixture: bear labels mutated');
  const ec = recmp(labs3, () => {});
  t(cnt(ec.templateDropped, 'ปันผลสะสม') === 1 && cnt(ec.textLost, 'ปันผลสะสม') === 2, 'TEMPLATE_COUNTED: ≤ 1 per column (3 labels in bear → 1 dropped · 2 TEXT LOST)', JSON.stringify({ lost: ec.textLost, td: ec.templateDropped }));
  // (c) positive: one per column label (×3 columns) → all dropped, none lost — also the .ret suffix of old skeletons
  const pos = base.replace(/<span>ปันผลรวม 3 ปี<\/span>/g, '<span>ปันผลสะสม 3 ปี</span>').replace('{{rd:sc2ret}}', '{{rd:sc2ret}} รวมปันผล');
  const ed = recmp(pos, () => {});
  t(cnt(ed.templateDropped, 'ปันผลสะสม') === 3 && cnt(ed.templateDropped, 'รวมปันผล') === 1 && !ed.textLost.includes('ปันผลสะสม') && !ed.textLost.includes('รวมปันผล'),
    'TEMPLATE_COUNTED positive: one per column label + .ret suffix → dropped, not lost', JSON.stringify({ lost: ed.textLost, td: ed.templateDropped }));
}
// fix round 1 (review minors): ffo guard safe without a doc · labelParts marker only as a standalone word (corpus cases)
{
  t.eq(SY.apply('s6.top', ['FFO'], {}).used.map((u) => u.id), ['ffo'], 'ffo guard: no doc → default basis ffo, no TypeError');
  t.eq(SY.apply('s6.top', ['FFO'], { doc: {} }).tokens, ['FFO'], 'ffo guard: doc without fundamentals → no TypeError');
  const A2 = require('../../tools/migrate-v3/assemble.js');
  t.eq(A2.labelParts('DDM (ตรวจเป็นบริบท ไม่นับใน FV)'), { label: 'DDM (ตรวจเป็นบริบท ไม่นับใน FV)', ctx: false, reason: '' }, 'labelParts: "ตรวจเป็นบริบท" is not the marker (never split mid-word)');
  t.eq(A2.labelParts('3. DDM (Dividend Discount Model) — บริบทเท่านั้น'), { label: 'DDM (Dividend Discount Model)', ctx: true, reason: 'เท่านั้น' }, 'labelParts: "บริบทเท่านั้น" = marker + reason "เท่านั้น"');
}
// leg alignment on one label function (Task 6 M-4 · D4): an author context suffix with reasoning aligns and the reasoning is not lost once assemble carries it (Task 5) — here: labelParts itself
{
  const A = require('../../tools/migrate-v3/assemble.js');
  t.eq(A.labelParts('3. Justified P/BV (บริบท — ห่างจากขายึดตลาด >2× ไม่รวมในกรอบ)'), { label: 'Justified P/BV', ctx: true, reason: 'ห่างจากขายึดตลาด >2×' }, 'labelParts: marker words out · reasoning kept');
  t.eq(A.labelParts('2. DCF (Free Cash Flow) — บริบท ไม่รวมใน FV'), { label: 'DCF (Free Cash Flow)', ctx: true, reason: '' }, 'labelParts: trailing dash before the marker trimmed (no "—" residue)');
  t.eq(A.labelParts('1. P/E Valuation (GAAP TTM)'), { label: 'P/E Valuation (GAAP TTM)', ctx: false, reason: '' }, 'labelParts: no context → label unchanged');
  t.eq(A.labelParts('3. Market Anchor (เป้านักวิเคราะห์ — บริบท ไม่นับในค่าเฉลี่ย)'), { label: 'Market Anchor', ctx: true, reason: 'เป้านักวิเคราะห์' }, 'labelParts: marker inside an open paren (LULU) → no orphan "(" in the label · paren words → reason');
  t.eq(A.labelParts('3. DCF (FCFE) — บริบท/stress-test เท่านั้น'), { label: 'DCF (FCFE)', ctx: true, reason: 'stress-test เท่านั้น' }, 'labelParts: IESC shape');
  t.eq(A.labelOf('3. Justified P/BV (บริบท — ห่างจากขายึดตลาด >2× ไม่รวมในกรอบ)'), 'Justified P/BV', 'labelOf = labelParts(...).label');
}
// s8 — an author 3rd vcell is compared in full (its .k is not a template label) and an analyst cell is dropped only at its own index
{
  const html = raw('CASY').replace(/(<div class="vgrid">[\s\S]*?)(\n\s*<\/div>\s*<div class="zone">)/, '$1\n        <div class="vcell"><div class="k">จุดทยอยสะสม</div><div class="v">ใต้มูลค่าเหมาะสม</div></div>$2');
  const m = migrate('CASY', html);
  t(m.doc.verdict && !m.eq.textLost.includes('จุดทยอยสะสม'), 'Task 5: 3rd vcell carried by verdict.extraCells → not lost', JSON.stringify(m.eq.textLost));
  const lost = recompare(m, html, (d) => { delete d.verdict; }).textLost;
  t(lost.includes('จุดทยอยสะสม'), 'without verdict.extraCells the 3rd vcell .k is TEXT LOST — no longer masked by the s8 normaliser', JSON.stringify(lost));
}
// the 4b .ret self-test (spec §10.2 d) still fails when an author word in .ret disappears — synonyms never mask it
{
  const html = raw('CASY').replace('{{rd:sc2ret}}', '{{rd:sc2ret}} ผู้เขียนพิเศษ');
  const parsed = PV.parseV2('CASY', html);
  const { doc } = A.assemble(parsed, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: parsed.rd.values.priceDate, analysisPx: null });
  if (doc.scenarios.cases[1].retNote) delete doc.scenarios.cases[1].retNote;
  const view = C.compute(doc, { seeds: SEEDS });
  const eq = EQ.compare(B.expandReport(html), B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: html });
  t(eq.textLost.includes('ผู้เขียนพิเศษ'), '.ret self-test: a dropped author word in .ret is TEXT LOST', JSON.stringify(eq.textLost));
}
t.done();
