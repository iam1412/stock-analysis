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
// identity
{ const html = raw('BBL'); const v2 = B.expandReport(html); const z = EQ.zones(v2);
  t(z.has('header') && z.has('s1') && z.has('s8') && z.has('disc') && z.has('footer'), 'zones: header · s1…s8 · disc · footer located');
  const parsed = PV.parseV2('BBL', html); const { doc } = A.assemble(parsed, { seeds: SEEDS, headUpdated: null, v2Hash: B.freshHash(html), today: parsed.rd.values.priceDate, analysisPx: null });
  const view = C.compute(doc, { seeds: SEEDS });
  const same = EQ.compare(v2, v2, doc, view, { v2src: html });
  t(same.textLost.length === 0 && same.numberValue.length === 0 && same.zones.every((z) => !z.runs.length), 'compare(page, page) → no runs'); }
// acceptance: the five non-HUMAN fixtures lose no author word (spec §11 row 4b: CLEAN มี TEXT LOST = 0)
for (const sym of ['BBL', 'CASY', 'DPZ', 'FTV', 'SRE']) {
  const m = migrate(sym, raw(sym));
  t.eq(m.eq.textLost, [], `${sym}: TEXT LOST = 0`);
  const b = BK.bucketOf(m.notes, m.eq);
  t(b.bucket !== 'HUMAN', `${sym}: bucket is CLEAN or VALUE-DRIFT (${b.bucket}: ${b.reasons.join(' ; ')})`);
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
  t(BK.bucketOf(m.notes, m.eq).bucket === 'HUMAN', 'TEXT LOST → HUMAN');
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
  const b = BK.bucketOf(notes, eq);
  t(b.bucket === 'VALUE-DRIFT', `M-8: page-only multiple change → VALUE-DRIFT without any D note (${b.bucket})`);
}
// number classification
t.eq(EQ.classifyNumber('฿163', '฿162.80'), 'rounding', 'number run within printed precision → rounding');
t.eq(EQ.classifyNumber('฿163', '฿170.10'), 'value', 'number run beyond → value');
t.eq(EQ.classifyNumber('8.7x', '8.68x'), 'rounding', 'multiple within half unit → rounding');
t(EQ.TEMPLATE_VOCAB instanceof Set && EQ.TEMPLATE_VOCAB.has('เฉลี่ย') && EQ.TEMPLATE_VOCAB.has('มัธยฐาน'), 'TEMPLATE_VOCAB is a closed Set with the known template words');
t.done();
