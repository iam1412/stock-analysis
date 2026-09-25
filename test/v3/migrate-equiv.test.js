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
// acceptance (fix round 1 · controller ruling): TEXT LOST = 0 on ≥5 fixtures · not HUMAN on ≥4 (spec §11 row 4b: CLEAN มี TEXT LOST = 0)
// SGC (TH) / NFG (US) = corpus docs with the template-default §2 hint ("โดยประมาณ"), no H note, TEXT LOST 0 — frozen from reports/ 25 ก.ย. 69
const NON_HUMAN = ['CASY', 'FTV', 'SRE', 'SGC', 'NFG'];
for (const sym of ['BBL', ...NON_HUMAN]) {
  const m = migrate(sym, raw(sym));
  // final-review I-1: BBL leg 1 "Normalized EPS ~฿22 × P/E เฉลี่ย ~9.0x" — the "เฉลี่ย" source claim sits in the formula head, v3 prints its own
  // source label ⇒ the word is no longer masked: TEXT LOST (BBL is HUMAN anyway by the analyst note)
  t.eq(m.eq.textLost, sym === 'BBL' ? ['เฉลี่ย'] : [], `${sym}: TEXT LOST = ${sym === 'BBL' ? '[เฉลี่ย] (computed-leg head word, I-1)' : '0'}`);
  const b = BK.bucketOf(m.notes, m.eq);
  if (NON_HUMAN.includes(sym)) t(b.bucket !== 'HUMAN', `${sym}: bucket is CLEAN or VALUE-DRIFT (${b.bucket}: ${b.reasons.join(' ; ')})`);
  else t(b.bucket === 'HUMAN' && m.notes.H.length && m.notes.H.every((r) => /analyst target .*max\/min/.test(r)), `${sym}: HUMAN only by the analyst max/min note (Task 5 round 4)`, JSON.stringify(m.notes.H));
  // fix round 2 · G-1 (controller ruling · plan D5): gauge.{min,max} rows are F — SGC/NFG drift only on the gauge ⇒ CLEAN, the rows stay in eq.rd + F reasons
  if (['SGC', 'NFG'].includes(sym)) t(b.bucket === 'CLEAN' && m.eq.rd.length > 0 && m.eq.rd.every((r) => /^gauge\./.test(r.path)) && b.reasons.some((r) => /^rd\/sm gauge\./.test(r)), `${sym}: gauge-only rd rows → CLEAN (gauge row kept as F)`, JSON.stringify({ b, rd: m.eq.rd }));
}
// DPZ = positive HUMAN case: the custom > 4 cap drops cards, and exactly their words surface as TEXT LOST (nothing else lost, nothing masked)
{
  const html = raw('DPZ'), m = migrate('DPZ', html);
  const b = BK.bucketOf(m.notes, m.eq);
  const cap = m.notes.H.find((r) => /^custom cards \d+ > 4 — dropped /.test(r));
  t(b.bucket === 'HUMAN' && !!cap, 'DPZ: HUMAN with a custom cards reason', JSON.stringify(m.notes.H));
  const labels = cap ? [...cap.matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  const want = PV.parseV2('DPZ', html).s1cards.filter((c) => labels.includes(c.k)).flatMap((c) => EQ.tok(EQ.text(`${c.kHtml} ${c.vHtml} ${c.dHtml}`)).filter(EQ.isWord).map(EQ.wordOf));
  t(labels.length > 0 && want.length > 0, 'DPZ: dropped custom card labels found in v2', JSON.stringify(labels));
  t.eq(m.eq.textLost.slice().sort(), want.slice().sort(), 'DPZ: TEXT LOST words = exactly the dropped custom cards');
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
  t(migrate('SRE', html).eq.textLost.includes('คำทดสอบในจุดสี'), 'C-1: a word inside .gdots is compared (not masked)');
  const html2 = raw('SRE').replace(/(<div class="legend">[\s\S]*?จุดสำคัญ)/, '$1 (คำอธิบายจุดพิเศษ)');
  t(html2 !== raw('SRE') && migrate('SRE', html2).eq.textLost.includes('คำอธิบายจุดพิเศษ'), 'C-1: an author word in the chart legend is compared (not masked)');
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
  const m = migrate('SRE', html);
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
  const FTV = raw('FTV');
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
  const head = migrate('FTV', FTV.replace('Adjusted EBITDA TTM $1,270M ×', 'Adjusted EBITDA TTM $1,270M มะม่วงสุกงอม ×'));
  t(head.doc.legs[1].method === 'evebitda' && head.eq.textLost.length === 1 && head.eq.textLost[0] === 'มะม่วงสุกงอม', 'I-1: author word in the computed-leg formula head → TEXT LOST (only that word)', JSON.stringify(head.eq.textLost));
  // re-review I-3 (CNC shape): a forward/estimate basis qualifier the v3 label replaces ("EPS forward normalized $2.86" → "EPS … (TTM) $2.86")
  // is a changed fact, not a formula word → TEXT LOST → HUMAN · "normalized" stays dropped (v3 prints an equivalent basis)
  const fwd = migrate('FTV', FTV.replace('EPS adj. $2.86 ×', 'EPS forward normalized $2.86 ×'));
  t(FTV.includes('EPS adj. $2.86 ×') && fwd.doc.legs[0].method === 'pe' && fwd.eq.textLost.includes('forward') && !fwd.eq.textLost.includes('normalized'),
    'I-3: CNC-shaped "EPS forward normalized" vs v3 basis label → "forward" TEXT LOST', JSON.stringify({ lost: fwd.eq.textLost, leg: fwd.doc.legs[0] }));
  t.eq(BK.bucketOf(fwd.notes, fwd.eq).bucket, 'HUMAN', 'I-3: → HUMAN');
}
t.done();
