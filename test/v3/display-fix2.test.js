'use strict';
// display-fix2 (controller 26 ก.ย. 69 — tool limits that block migrated v3 reports from showing their v2 figures):
//   (1) v2Display.s6 = the author's section-6 cells per column (head · rows) + targets[i] (number — returns live) · growth/exit optional there ·
//       v2Display.noBase (no single base: the template base line is not printed · author hint text) · E24 checks the carried target (check-v3 → opts.scnCarried)
//   (2) context legs: legTexts ("−$135 ถึง −$35" · "—") · negative legValues (context only)
//   (3) gauge: market ticks (price · 52-week) must be live refs (px · hi52w · lo52w) — text ticks rejected by the schema
//   (4) migrator: author cells · verbatim §6 hint · 52-week ticks → live refs · context-leg texts · disclaimerSources analyst/FV tokens
// every allowance is migrated-only: a NEW doc (no meta.migratedFrom) is rejected · tmp dirs only (never reports/)
const t = require('./_t.js')('display-fix2');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const R = require('../../_template/v3/render.js');
const B = require('../../build.js');
const TK = require('../../tools/v3/tokens.js');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const A = require('../../tools/migrate-v3/assemble.js');
const MS = require('../../tools/migrate-v3/scenarios.js');
const CV = require('../check-v3.js');
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
const MF = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
const FIX = path.join(ROOT, 'test', 'fixtures');
const raw = (sym) => fs.readFileSync(path.join(FIX, `${sym}-v2.html`), 'utf8');
const load = (f) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`))); delete d._sig; return d; };
const mig = () => { const d = load('ZTS-real'); d.meta.migratedFrom = MF; return d; };
const has = (errs, p, re) => errs.some((e) => e.path === p && (!re || re.test(e.msg)));
const src = (d) => R.toV2Source(d, C.compute(d, { seeds: SEEDS }));
const gate = (d) => CV.checkDoc(d, { skipSig: true, seeds: SEEDS, today: d.market.priceDate });

// ── (3) gauge: market ticks must be live ──
{
  const d = mig();
  const g = (ticks) => ({ ...d, v2Display: { gauge: ticks } });
  const base = [{ ref: 'mos30', label: 'MOS 30%' }, { ref: 'fv', label: 'Fair Value' }];
  for (const [text, label] of [['$193', 'สูงสุด 52 สัปดาห์'], ['$45.52', '52wk High'], ['$30', '52-Week High'], ['$1,714', 'ATH 52 สัปดาห์'], ['$67', 'ราคาปัจจุบัน'], ['$19', 'ต่ำสุด 52 สัปดาห์']])
    t(has(S.validate(g(base.concat([{ text, label }]))), 'v2Display.gauge[2].text', /ค่าตลาด/), `schema: gauge text tick "${text} ${label}" (market value) → error`);
  t.eq(S.validate(g(base.concat([{ text: '$999', label: 'เป้าสูงสุด' }, { text: '$39', label: 'MOS 30%' }]))), [], 'schema: author-derived text ticks (analyst high target · FV×0.7) stay allowed');
  t.eq(S.validate(g(base.concat([{ ref: 'hi52w', label: 'สูงสุด 52 สัปดาห์' }, { ref: 'lo52w', label: 'ต่ำสุด 52 สัปดาห์' }]))), [], 'schema: hi52w/lo52w refs ok');
  const no52 = { ...g(base.concat([{ ref: 'hi52w', label: 'สูงสุด 52 สัปดาห์' }])), market: { ...d.market } }; delete no52.market.range52w;
  t(has(S.validate(no52), 'v2Display.gauge[2].ref', /range52w/), 'schema: hi52w without market.range52w → error');
  const live = g(base.concat([{ ref: 'hi52w', label: 'สูงสุด 52 สัปดาห์' }]));
  const scaleOf = (x) => (/<div class="scale">([\s\S]*?)<\/div>\s*<\/div>/.exec(src(x)) || [])[1] || '';
  t(scaleOf(live).includes(`$${d.market.range52w.hi.toFixed(2)}<br><small>สูงสุด 52 สัปดาห์</small>`), 'render: hi52w prints market.range52w.hi', scaleOf(live));
  const moved = { ...live, market: { ...live.market, range52w: { lo: 60, hi: 155.5 } } };
  t(scaleOf(moved).includes('$155.50<br><small>สูงสุด 52 สัปดาห์</small>'), 'render: the 52-week tick follows market (cron writes range52w) — never frozen');
  t(!S.GAUGE_REFS.some((r) => /52/.test(r) && r !== 'hi52w' && r !== 'lo52w'), 'GAUGE_REFS: the 52-week refs are hi52w/lo52w');
  const nw = { ...live, meta: { ...live.meta } }; delete nw.meta.migratedFrom;
  t(has(S.validate(nw), 'v2Display', /migrate/), 'schema: NEW doc cannot carry a gauge scale at all (v2Display migrated-only)');
}

// ── (2) context legs: text / negative values (context only) ──
{
  const d = mig();
  d.legs = d.legs.map((l, i) => (i === 2 ? { ...l, role: 'context' } : l));
  delete d.fvWeights;
  const withT = { ...d, v2Display: { legTexts: [null, null, '−$135 ถึง −$35'] } };
  t.eq(S.validate(withT), [], 'schema: legTexts on a context leg ok', JSON.stringify(S.validate(withT)));
  const s1 = src(withT);
  t(s1.includes('<div class="mval">−$135 ถึง −$35</div>'), 'render: context leg .mval = the v2 text (range with signs)');
  const v1 = C.compute(withT, { seeds: SEEDS });
  t.eq(TK.TOKENS_V3.leg3(v1), '−$135 ถึง −$35', 'token {{leg3}} = the v2 text');
  t.eq(C.compute({ ...d }, { seeds: SEEDS }).fv, v1.fv, 'FV unchanged by a context leg text (context legs never enter FV)');
  t(has(S.validate({ ...d, v2Display: { legTexts: ['$1 ถึง $2', null, null] } }), 'v2Display.legTexts[0]', /context/), 'schema: legTexts on an fv leg → error');
  t.eq(S.validate({ ...d, v2Display: { legTexts: [null, null, '—'] } }), [], 'schema: "—" (AVGO) allowed on a context leg');
  const neg = { ...d, v2Display: { legValues: [null, null, -85] } };
  t.eq(S.validate(neg), [], 'schema: negative legValues on a context leg ok');
  t(src(neg).includes('<div class="mval">−$85.00</div>'), 'render: negative context value → "−$85.00"');
  t(has(S.validate({ ...d, v2Display: { legValues: [-85, null, null] } }), 'v2Display.legValues[0]', />\s*0/), 'schema: negative legValues on an fv leg → error');
  const ge = gate(neg);
  t(!ge.errors.some((e) => e.id === 'E51' && /ค่าขา/.test(e.msg)), 'gate: negative carried context value is not "ค่าขา ≤ 0" (computed value still > 0)', JSON.stringify(ge.errors.map((e) => e.id)));
  t(has(S.validate({ ...d, v2Display: { legTexts: [null, null, '−$135'], legValues: [null, null, -135] } }), 'v2Display.legValues[2]'), 'schema: text and number on the same leg → error');
  const nw = { ...withT, meta: { ...withT.meta } }; delete nw.meta.migratedFrom;
  t(has(S.validate(nw), 'v2Display', /migrate/), 'schema: NEW doc cannot carry legTexts');
}

// ── (1) author section-6 cells ──
{
  const d = mig();
  const cells = [
    { head: 'FY27 ตามเป้า FY28 +5% แล้วตัน', rows: [['EPS ปี 3 (FY29)', '$22.8'], ['P/E ออก', '22x']] },
    { head: 'FY28 +50% → FY29 +30%', rows: [['EPS ปี 3 (FY29)', '$42.3'], ['P/E ออก', '28x']] },
    { head: 'FY28 +83% (ตาม consensus) → FY29 +40%', rows: [['EPS ปี 3 (FY29)', '$55.6'], ['P/E ออก', '33x']] }];
  const { baseOverride, ...scnNoBase } = d.scenarios;
  const x = { ...d, scenarios: { ...scnNoBase, hintNote: '• ฐาน EPS non-GAAP FY26 $8.67 → FY27 $21.67 (consensus)', cases: d.scenarios.cases.map(({ growth, exitMultiple, retNote, ...c }) => c) },
    v2Display: { s6: cells, targets: [502, 1184, 1835], noBase: true } };
  t.eq(S.validate(x), [], 'schema: author cells + targets + noBase (growth/exit omitted) ok', JSON.stringify(S.validate(x)));
  const v = C.compute(x, { seeds: SEEDS });
  t.eq(v.scn.map((s) => s.tgt), [502, 1184, 1835], 'compute: targets = the author targets');
  t(v.scn.every((s) => s.driverStart == null && s.driverEnd == null) && v.rd.values.baseEps === undefined, 'compute: no base (noBase) → no back-solved baseEps anywhere');
  const s = R.toV2Source(x, v);
  t(s.includes('<span>FY28 +50% → FY29 +30%</span>') && s.includes('<li><span>EPS ปี 3 (FY29)</span><span>$42.3</span></li>') && s.includes('<li><span>P/E ออก</span><span>33x</span></li>'), 'render: the author head + rows per column');
  t(/<div class="hint">จากจุดเข้า \{\{rd:px\}\} • ฐาน EPS non-GAAP FY26 \$8\.67 → FY27 \$21\.67 \(consensus\)\{\{rd:scnNote\}\}<\/div>/.test(s) && !/EPS ฐาน ~/.test(s), 'render: §6 hint = the author text only (no template base value)');
  const html = B.expandReport(s);
  t(!/NaN|undefined/.test(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')), 'render: no NaN/undefined');
  // returns stay live: price +10% → the return moves
  const retOf = (y) => { const h = B.expandReport(R.toV2Source(y, C.compute(y, { seeds: SEEDS }))); return (/<div class="col base">[\s\S]*?<div class="ret[^"]*">([\s\S]*?)<\/div>/.exec(h) || [])[1]; };
  const up = { ...x, market: { ...x.market, px: +(x.market.px * 1.1).toFixed(2) } };
  t(retOf(x) && retOf(up) && retOf(x) !== retOf(up), `returns are live from the carried target (${retOf(x)} → ${retOf(up)})`);
  // gate: E24 checks the carried targets (no single-base formula for these columns) · the whole gate passes
  const g = gate(x);
  t(!g.errors.some((e) => /E24|E51/.test(e.id)), 'gate: author cells pass E24 (carried target) + E51', JSON.stringify(g.errors));
  // schema negatives
  t(has(S.validate({ ...x, v2Display: { ...x.v2Display, targets: [502, null, 1835] } }), 'v2Display.targets[1]', /s6\[1\]/), 'schema: a carried column needs its target');
  t(has(S.validate({ ...x, v2Display: { ...x.v2Display, s6: [cells[0], { head: 'x', rows: [['ผลตอบแทนรวม', '+45%']] }, cells[2]] } }), 'v2Display.s6[1].rows[0][0]', /ผูกราคา/), 'schema: a price-bound row (returns) → error');
  t(has(S.validate({ ...x, v2Display: { ...x.v2Display, s6: [cells[0], { head: 'x', rows: [['สถานการณ์', 'y']] }, cells[2]] } }), 'v2Display.s6[1].rows[0][0]'), 'schema: the สถานการณ์ row is cases[i].desc — not duplicated');
  t(has(S.validate({ ...x, v2Display: { ...x.v2Display, s6: [cells[0], { head: 'a {{px}}', rows: cells[1].rows }, cells[2]] } }), 'v2Display.s6[1].head'), 'schema: cells are plain text (no tokens/tags)');
  t(has(S.validate({ ...x, v2Display: { ...x.v2Display, s6: [cells[0], { rows: cells[1].rows }, cells[2]] } }), 'scenarios.cases[1].growth'), 'schema: growth optional only when the column carries head + rows');
  t(has(S.validate({ ...x, v2Display: { ...x.v2Display, s6: [cells[0], { head: 'h' }, cells[2]], noBase: undefined } }), 'scenarios.cases[1].exitMultiple'), 'schema: exitMultiple optional only when the column carries rows');
  t(has(S.validate({ ...x, v2Display: { ...x.v2Display, s6: [cells[0], null, cells[2]] } }), 'v2Display.noBase'), 'schema: noBase needs author rows in all 3 columns');
  t(has(S.validate({ ...x, scenarios: { ...x.scenarios, baseOverride: { value: 7, why: 'x' } } }), 'v2Display.noBase', /baseOverride/), 'schema: noBase with a baseOverride → error');
  const nw = { ...x, meta: { ...x.meta } }; delete nw.meta.migratedFrom;
  const ne = S.validate(nw);
  t(has(ne, 'v2Display', /migrate/) && has(ne, 'scenarios.cases[0].growth') && has(ne, 'scenarios.cases[0].exitMultiple'), 'schema: NEW doc — no cells, growth/exit required');
  // one carried column only: the others still use the formula (and E24 formula for them)
  const one = { ...d, v2Display: { s6: [null, { head: 'Recovery', rows: [['EPS ปี 3', '~$9.99'], ['P/E ออก', '14x']] }, null], targets: [null, 140, null] } };
  t.eq(S.validate(one), [], 'schema: one carried column');
  const vo = C.compute(one, { seeds: SEEDS }), vp = C.compute(d, { seeds: SEEDS });
  t(vo.scn[1].tgt === 140 && vo.scn[0].tgt === vp.scn[0].tgt && vo.scn[2].tgt === vp.scn[2].tgt && vo.rd.values.baseEps === vp.rd.values.baseEps, 'compute: only the carried column takes the author target');
}

// ── (4) migrator ──
{
  t.eq(A.s6HintVerbatim('จากจุดเข้า {{px}} • EPS ฐาน (normalized) ~$7.4', { divIncluded: false }), '• EPS ฐาน (normalized) ~$7.4', 's6HintVerbatim: AMZN hint kept whole');
  t.eq(A.s6HintVerbatim('จากจุดเข้า {{px}} • EPS ฐาน TTM ~฿0.23 (normalize ~฿0.51) • รวมปันผล', { divIncluded: true }), '• EPS ฐาน TTM ~฿0.23 (normalize ~฿0.51)', 's6HintVerbatim: trailing "• รวมปันผล" = {{rd:scnNote}}');
  // step-path / text heads (LITE/MRNA shape) on the BBL fixture
  const h0 = raw('BBL');
  const cols = h0.split('<div class="col ');
  const tops = cols.slice(1).map((c) => (/<div class="top"><span>[^<]*<\/span><span>([^<]*)<\/span>/.exec(c) || [])[1]);
  t(tops.length === 3 && tops.every(Boolean), 'fixture: BBL has 3 column heads', JSON.stringify(tops));
  const h1 = h0.replace(`<span>${tops[0]}</span>`, '<span>กำไรลดแล้วทรงตัว</span>').replace(`<span>${tops[2]}</span>`, '<span>FY27 +10% → FY28 +5%</span>');
  const p1 = PV.parseV2('BBL', h1);
  const s1 = MS.scenarios(p1, { eps: 22 });
  t(s1.meta.perCase && s1.meta.display && s1.meta.display.s6[0].head === 'กำไรลดแล้วทรงตัว' && !('growth' in s1.scenarios.cases[0]), 'migrator: a text head (no growth) → author cells, growth omitted', JSON.stringify(s1.H));
  t(s1.meta.display.s6[2].head === 'FY27 +10% → FY28 +5%' && !('growth' in s1.scenarios.cases[2]) && s1.scenarios.cases[1].growth != null, 'migrator: a step-path head drops its growth · a simple head keeps it');
  t(s1.meta.display.targets.every((x) => x > 0) && s1.meta.display.s6.every((c) => c.rows.some(([k, v]) => /ปันผล/.test(k) && /^~฿[0-9]/.test(v)) && c.rows.every(([, v]) => !/\{\{/.test(v))), 'migrator: targets + rows carried (dividend token resolved to the author figure, with the currency)', JSON.stringify(s1.meta.display.s6[0].rows));
  const r1 = A.assemble(p1, { seeds: SEEDS, headUpdated: MF.updated, v2Hash: 'abcdef012345', today: p1.rd.values.priceDate, analysisPx: null });
  t(r1.doc.v2Display && r1.doc.v2Display.s6 && !r1.notes.H.some((x) => /growth unreadable/.test(x)), 'assemble: author cells in v2Display (no growth H)', r1.notes.H.join(' ; '));
  t.eq(S.validate(r1.doc), [], 'assemble: the migrated doc validates');
  const r0 = A.assemble(p1, { seeds: SEEDS, headUpdated: null, v2Hash: 'abcdef012345', today: p1.rd.values.priceDate, analysisPx: null });
  t(r0.notes.H.some((x) => /meta\.migratedFrom/.test(x)), 'assemble: cells need meta.migratedFrom (NEW-shaped run → H)');
  // per-column base (AMZN shape): ends that no single base reproduces within E24 → noBase, no back-computed base
  const p2 = PV.parseV2('BBL', h0); delete p2.rd.values.baseEps;
  p2.s6cols[0] = { ...p2.s6cols[0], lis: p2.s6cols[0].lis.map((x) => (/ปี\s*\d/.test(x[0]) && !/ปันผล/.test(x[0]) ? [x[0], '~฿14.0', '~฿14.0'] : x)) };
  const s2 = MS.scenarios(p2, { eps: 25 });
  t(s2.meta.perCase && s2.meta.noBase && !s2.scenarios.baseOverride && s2.meta.display.noBase === true, 'migrator: per-column bases → author cells + noBase (no back-computed base)', JSON.stringify({ F: s2.F, H: s2.H }));
  const p3 = PV.parseV2('BBL', h0); delete p3.rd.values.baseEps;
  const s3 = MS.scenarios(p3, { eps: 25 });
  t(!s3.meta.perCase && s3.scenarios.baseOverride, 'migrator: ends within E24 of one base → the single-base path (unchanged)');
  // 52-week text tick → live ref
  const h4 = h0.replace('<span style="text-align:right">{{rd:fvHigh}}<br><small>กรอบบน FV</small></span>', '<span style="text-align:right">฿197<br><small>สูงสุด 52 สัปดาห์</small></span>');
  t(h4 !== h0, 'fixture: 52-week tick');
  const p4 = PV.parseV2('BBL', h4);
  const r4 = A.assemble(p4, { seeds: SEEDS, headUpdated: MF.updated, v2Hash: 'abcdef012345', today: p4.rd.values.priceDate, analysisPx: null });
  const gg = r4.doc.v2Display && r4.doc.v2Display.gauge;
  t(gg && gg.some((x) => x.ref === 'hi52w' && x.label === 'สูงสุด 52 สัปดาห์') && !gg.some((x) => x.text != null && /52/.test(x.label)), 'migrator: "฿197 สูงสุด 52 สัปดาห์" → {ref: hi52w} (live)', JSON.stringify(gg));
  t.eq(S.validate(r4.doc), [], 'migrator: that doc validates');
  // disclaimerSources: the analyst target literal → {{analyst.target}} · price/date literals stay
  const dd = raw('DDOG');
  const m5 = /<div class="disc">([\s\S]*?)<\/div>/.exec(dd);
  t(!!m5, 'fixture: DDOG disclaimer');
  const h5 = dd.replace(m5[1], m5[1] + ' • เป้านักวิเคราะห์เฉลี่ย $283.52 (StockAnalysis) • ราคาปิด $150.00');
  const p5 = PV.parseV2('DDOG', h5);
  const r5 = A.assemble(p5, { seeds: SEEDS, headUpdated: MF.updated, v2Hash: 'abcdef012345', today: p5.rd.values.priceDate, analysisPx: null });
  const ds = r5.doc.prose && r5.doc.prose.disclaimerSources;
  t(ds && ds.includes('เป้านักวิเคราะห์เฉลี่ย {{analyst.target}}') && ds.includes('ราคาปิด $150.00') && !/\{\{px\}\}/.test(ds), 'migrator: disclaimerSources analyst target → {{analyst.target}} · price literal stays', ds);
}
// ── extras (controller final scope): FFOA · DDM D₁ · live custom cards · driver/exit pairing under author cells · current-price phrase ──
{
  const d = mig();
  t.eq(S.FFO_LABEL.ffoa, 'FFOA', 'FFO_LABEL: ffoa → "FFOA" (UDR)');
  t.eq(S.validate({ ...d, fundamentals: { ...d.fundamentals, ffoBasis: 'ffoa' } }), [], 'schema: ffoBasis ffoa');
  // DDM D₁ (PKG): the author's D₁ prints as-is, value = D₁/(r−g) · no back-solved dps
  const ddm = d.legs.findIndex((l) => l.method === 'ddm');
  const dd = { ...d, legs: d.legs.map((l, i) => (i === ddm ? { ...l, inputs: { ...l.inputs, d1: 6 }, override: undefined } : l)) };
  dd.legs = dd.legs.map((l) => { const x = { ...l }; if (x.override === undefined) delete x.override; return x; });
  t.eq(S.validate(dd), [], 'schema: ddm inputs.d1');
  const lv = C.compute(dd, { seeds: SEEDS }).legs[ddm], i = dd.legs[ddm].inputs;
  t(Math.abs(lv.value - 6 / ((i.r - i.g) / 100)) < 1e-9, 'legs: ddm with d1 = D₁/(r−g)');
  t(src(dd).includes(`D₁ = ปันผล $6.00; g ${i.g}%, r ${i.r}%`), 'render: ddm line prints the author D₁');
  t(has(S.validate({ ...dd, legs: dd.legs.map((l, k) => (k === ddm ? { ...l, inputs: { ...l.inputs, d1: -1 } } : l)) }), `legs[${ddm}].inputs.d1`), 'schema: ddm d1 must be > 0');
  // live custom card (ZS "P/E Non-GAAP (FY26 จริง) ~46x" on EPS non-GAAP $4.21)
  const cz = { ...d, metrics: { ...d.metrics, custom: [{ label: 'P/E Non-GAAP (FY26 จริง)', value: '~46x', note: 'EPS non-GAAP FY26 $4.21' }] }, v2Display: { custom: { 0: { op: 'pxOverBase', base: 4.21 } } } };
  t.eq(S.validate(cz), [], 'schema: v2Display.custom (live custom card)');
  const cv = (x) => (/<div class="k">P\/E Non-GAAP \(FY26 จริง\)<\/div><div class="v[^"]*">([^<]*)<\/div>/.exec(src(x)) || [])[1];
  t.eq(cv(cz), `~${(d.market.px / 4.21).toFixed(0)}x`, 'render: custom P/E = price ÷ the author base (live)');
  const cz2 = { ...cz, market: { ...cz.market, px: +(cz.market.px * 1.3).toFixed(2) } };
  t(cv(cz2) !== cv(cz), 'render: the custom P/E follows the price');
  t(has(S.validate({ ...cz, v2Display: { custom: { 3: { op: 'pxOverBase', base: 4.21 } } } }), 'v2Display.custom.3'), 'schema: custom index must exist');
  t(has(S.validate({ ...cz, metrics: { ...cz.metrics, custom: [{ label: 'x', value: '{{pe}}x' }] } }), 'metrics.custom[0].value'), 'schema: a live custom card holds the author number, not a token');
  const nw = { ...cz, meta: { ...cz.meta } }; delete nw.meta.migratedFrom;
  t(has(S.validate(nw), 'v2Display', /migrate/), 'schema: NEW doc cannot carry v2Display.custom');
  // driver/exit pairing: skipped only when every column carries the author rows (targets never come from driver × exit)
  const pr = { ...d, scenarios: { ...d.scenarios, exitMetric: 'evsales' } };
  t(has(S.validate(pr), 'scenarios.exitMetric'), 'schema: evsales with an eps driver → error (template path)');
  const cells = [0, 1, 2].map((k) => ({ head: 'h' + k, rows: [['รายได้ปี 3', '$' + (k + 1) + 'M'], ['EV/Sales ออก', '9x']] }));
  t.eq(S.validate({ ...pr, v2Display: { s6: cells, targets: [1, 2, 3] } }), [], 'schema: author rows in all columns → pairing not applied (migrated)');
  const pr2 = { ...pr, meta: { ...pr.meta } }; delete pr2.meta.migratedFrom;
  t(has(S.validate({ ...pr2, v2Display: { s6: cells, targets: [1, 2, 3] } }), 'scenarios.exitMetric'), 'schema: NEW doc keeps the pairing rule');
  t(has(S.validate({ ...pr, v2Display: { s6: [cells[0], cells[1], null], targets: [1, 2, null] } }), 'scenarios.exitMetric'), 'schema: pairing still applies when a column is computed');
  // current-price phrase → {{px}} (VRTX) · dated price stays · other "ราคา…" words stay
  const MP = require('../../tools/migrate-v3/prose.js');
  const vw = C.compute(d, { seeds: SEEDS }), px = vw.d.px, lit = '$' + (px * 1.02).toFixed(2);
  const r = MP.tokenise(`ราคาปัจจุบัน (${lit}) เต็มมูลค่า · ราคา ${lit} ณ 18 ก.ย. 2569 · ราคาเป้า ${lit}`, vw, [], 'prose.strategy', { pxPhrase: true });
  t.eq(r.text, `ราคาปัจจุบัน ({{px}}) เต็มมูลค่า · ราคา ${lit} ณ 18 ก.ย. 2569 · ราคาเป้า ${lit}`, 'tokenise: "ราคาปัจจุบัน ($X)" → {{px}} · dated/target prices stay', r.text);
  t.eq(MP.tokenise(`ราคาปัจจุบัน (${lit})`, vw, [], 'prose.strategy', {}).text, `ราคาปัจจุบัน (${lit})`, 'tokenise: off unless pxPhrase');
  t.eq(MP.pxPhraseLits(`ราคา $${(px * 3).toFixed(2)}`, px), [], 'pxPhraseLits: a number far from the price is not the price');
}
// fix-gauge (the committed docs the new schema rejects): frozen market ticks → live refs · updated kept (prevHash) · dry-run writes nothing
{
  const FG = require('../../tools/migrate-v3/fix-gauge.js'), IO = require('../../tools/v3/io.js'), os = require('os');
  const d = mig();
  d.v2Display = { gauge: [{ ref: 'mos30', label: 'MOS 30%' }, { ref: 'fv', label: 'Fair Value' }, { text: '$999', label: 'เป้าสูงสุด' }, { text: '$193', label: 'สูงสุด 52 สัปดาห์' }] };
  t(has(S.validate(d), 'v2Display.gauge[3].text'), 'fix-gauge setup: the doc is rejected by the schema');
  const r = FG.fixDoc(d);
  t.eq(r.doc.v2Display.gauge, [{ ref: 'mos30', label: 'MOS 30%' }, { ref: 'fv', label: 'Fair Value' }, { text: '$999', label: 'เป้าสูงสุด' }, { ref: 'hi52w', label: 'สูงสุด 52 สัปดาห์' }], 'fixDoc: only the market tick becomes a live ref');
  t.eq(S.validate(r.doc), [], 'fixDoc: the fixed doc validates');
  t(r.doc.meta.migratedFrom.prevHash === IO.freshHash(d) && r.doc.meta.migratedFrom.updated === MF.updated, 'fixDoc: prevHash = the old doc hash (build keeps updated)');
  t.eq(FG.fixDoc(r.doc).doc, null, 'fixDoc: nothing to fix → null (idempotent)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-gauge-'));
  IO.write(path.join(tmp, 'ZTS.json'), { ...d, v2Display: { gauge: [{ ref: 'fv', label: 'Fair Value' }, { ref: 'mos30', label: 'x' }] } });
  const bad = JSON.parse(fs.readFileSync(path.join(tmp, 'ZTS.json'), 'utf8')); bad.v2Display.gauge.push({ text: '$193', label: '52wk High' }); fs.writeFileSync(path.join(tmp, 'ZTS.json'), JSON.stringify(bad));
  const before = fs.readFileSync(path.join(tmp, 'ZTS.json'), 'utf8');
  const lines = []; const code = FG.runFixGauge([], { reportsDir: tmp, write: false }, (x) => lines.push(x), { isGuarded: () => false });
  t(code === 0 && fs.readFileSync(path.join(tmp, 'ZTS.json'), 'utf8') === before && lines.some((x) => /WOULD FIX ZTS/.test(x)), 'runFixGauge dry-run: reports, writes nothing');
  FG.runFixGauge(['ZTS'], { reportsDir: tmp, write: true }, () => {}, { isGuarded: () => false });
  const now = IO.read(path.join(tmp, 'ZTS.json'));
  t(IO.verifySig(now) && now.v2Display.gauge[2].ref === 'hi52w', 'runFixGauge --write: signed · live ref');
  t.eq(FG.runFixGauge(['ZTS'], { reportsDir: tmp, write: true }, () => {}, { isGuarded: () => true }), 1, 'runFixGauge --write into a guarded reports/ needs MIGRATE_V3_ALLOW_REAL=1');
  fs.rmSync(tmp, { recursive: true, force: true });
}
t.done();
