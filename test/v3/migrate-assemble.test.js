'use strict';
const t = require('./_t.js')('migrate-assemble');
const fs = require('fs'), path = require('path');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const A = require('../../tools/migrate-v3/assemble.js');
const MP = require('../../tools/migrate-v3/prose.js');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const B = require('../../build.js');
const SEEDS = require('../../tools/seeds.json');
const FIX = path.join(__dirname, '..', 'fixtures');
const raw = (sym) => fs.readFileSync(path.join(FIX, `${sym}-v2.html`), 'utf8');
const run = (sym) => { const html = raw(sym); return A.assemble(PV.parseV2(sym, html), { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: PV.parseV2(sym, html).rd.values.priceDate, analysisPx: null }); };
const SYMS = ['AAPL', 'BBL', 'CASY', 'DDOG', 'DPZ', 'FTV', 'SRE'];
const out = Object.fromEntries(SYMS.map((s) => [s, run(s)]));
for (const s of SYMS) {
  const { doc, notes } = out[s];
  t.eq(S.validate(doc).map((e) => `${e.path}: ${e.msg}`), [], `${s}: assembled doc passes S.validate`);
  t(!('_sig' in doc), `${s}: doc is unsigned`);
  t.eq(doc.meta.migratedFrom, { updated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(raw(s)) }, `${s}: migratedFrom from ctx`);
  const rd = PV.parseV2(s, raw(s)).rd;
  t.eq([doc.market.px, doc.market.priceDate, doc.market.chgSuffix, doc.market.chart.data], [rd.values.px, rd.values.priceDate, rd.values.chgSuffix, rd.chart.data], `${s}: market lifted verbatim`);
  t(Array.isArray(notes.H) && Array.isArray(notes.D) && Array.isArray(notes.F), `${s}: notes H/D/F arrays`);
}
// BBL — bank TH · 3 legs · family scheme
{
  const { doc, notes } = out.BBL;
  t.eq([doc.currency, doc.region, doc.dateEra, doc.meta.exchange, doc.meta.company], ['THB', 'TH', 'CE', 'SET', 'ธนาคารกรุงเทพ (Bangkok Bank)'], 'BBL: top-level + exchange');
  t.eq(doc.meta.headerTags, ['Financials • Banking', 'ธนาคารใหญ่สุดด้านสินทรัพย์'], 'BBL: headerTags');
  t.eq(doc.meta.sources, ['SET', 'stockanalysis.com', 'Investing'], 'BBL: sources split on /');
  t.eq(doc.market.range52w, { lo: 139.5, hi: 197 }, 'BBL: range52w from px-meta');
  t.eq(doc.legs.map((l) => [l.method, l.role || 'fv', l.family]), [['pe', 'fv', 'market'], ['ddm', 'fv', 'rg'], ['pbv', 'fv', 'rg']], 'BBL: legs method/role/family');
  t.eq(doc.legs[2].inputs, { g: 3, r: 9.5 }, 'BBL: justified pbv inputs'); t.eq(doc.legs[2].override.roe, 7.8, 'BBL: roe override');
  t.eq(doc.fundamentals.eps, 22, 'BBL: eps from the pe leg base (values.eps absent · EPS card is FY)');
  t.eq([doc.fundamentals.dps, doc.fundamentals.shares, doc.fundamentals.bvps], [12, 1910000000, 302], 'BBL: dps/shares/bvps');
  t.eq(doc.fundamentals.fy, { period: 'FY2025', netIncome: 46007e6, eps: 24.1 }, 'BBL: fy block from FY cards');
  t.eq(doc.fundamentals.bank, { nim: 2.49, npl: 3.0, coverage: 324, cet1: 16.4, car: 20.9 }, 'BBL: bank KPIs');
  const keys = doc.metrics.cards.map((c) => (typeof c === 'string' ? c : c.key || c));
  t(keys.includes('mcap') && keys.includes('pe') && keys.includes('peAvg5y') && keys.includes('pbv') && keys.includes('nim') && keys.includes('npl') && keys.includes('capital') && keys.includes('yield'), 'BBL: catalogue keys mapped', JSON.stringify(keys));
  t((doc.metrics.custom || []).length <= 4, 'BBL: custom ≤ 4');
  t(/ใกล้ค่าเฉลี่ย/.test(doc.metrics.notes.pe || ''), 'BBL: v2 .d text preserved in metrics.notes.pe');
  t.eq(doc.scenarios.driver, 'eps'); t.eq(doc.scenarios.exitMetric, 'pe'); t.eq(doc.scenarios.cases[0].exitMultiple, 7.2, 'BBL: printed exit multiple kept'); t.eq(doc.scenarios.exitDp, 1, 'BBL: exitDp from printed decimals');
  t.eq(doc.scenarios.divIncluded, true, 'BBL: divIncluded from scnBasis');
  t.eq(doc.analyst, null, 'BBL: no analyst target');
  t(/^แบงก์อนุรักษ์นิยม/.test(doc.prose.verdictHeadline) && /^สาย value/.test(doc.prose.strategy), 'BBL: verdict headline + strategy without the กลยุทธ์ label');
  t(/Normalized EPS/.test(doc.text.disclaimerAssump || ''), 'BBL: disclaimerAssump captured');
  t(!notes.H.length, 'BBL: no HUMAN reasons', notes.H.join(' ; '));
  const v = C.compute(doc, { seeds: SEEDS });
  t(Math.abs(v.fv - 195) <= 0.01 * 195, 'BBL: recomputed FV within 1% of the shown 195 (equal weights)', String(v.fv));
  t(doc.fvWeights === null || doc.fvWeights === undefined, 'BBL: no fvWeights (scheme reproduces)');
}
// AAPL — analyst leg as fv → HUMAN · analyst block
{
  const { doc, notes } = out.AAPL;
  t(notes.H.some((h) => /analyst/.test(h)), 'AAPL: analyst target leg as fv → H');
  t.eq(doc.analyst && doc.analyst.target, 318, 'AAPL: analyst.target from values');
  t.eq(doc.meta.company, 'Apple Inc.', 'AAPL: company');
}
// FTV — h1 "(FTV)" suffix stripped · fcfyield family market
{
  const { doc } = out.FTV;
  t.eq(doc.meta.company, 'Fortive Corporation', 'FTV: "(FTV)" suffix stripped from company');
  t.eq(doc.legs[2].method, 'fcfyield'); t.eq(doc.legs[2].family, 'market', 'FTV: fcfyield family = market');
}
// DDOG — dcf not reproduced → declared other (F) · analyst → H
{
  const { doc, notes } = out.DDOG;
  t(doc.legs[1].method === 'dcf' || (doc.legs[1].method === 'declared' && doc.legs[1].inputs.basis === 'other' && doc.legs[1].inputs.value === 250), 'DDOG: dcf reproduced or declared other with the printed value');
  t(notes.H.some((h) => /analyst/.test(h)), 'DDOG: analyst leg → H');
}
// prose conversion
t.eq(MP.htmlToProse('ราคา <b>{{rd:px}}</b> และ <span class="pill">MOS</span> {{rd:mos}}<br/>บรรทัดใหม่ &amp; อื่น'), 'ราคา <b>{{px}}</b> และ MOS {{mos}}<br>บรรทัดใหม่ & อื่น', 'htmlToProse: keep b/br · drop other tags · rd → v3 twin · entities');
{
  const doc = out.SRE.doc, view = C.compute(doc, { seeds: SEEDS });
  const px = view.cur + require('../../tools/report-values.js').fmtPrice(view.d.px);
  const r = MP.tokenise(`ราคาปัจจุบัน ${px} เทียบ FV`, view, []);
  t(r.text.includes('{{px}}') && r.D.length === 0, 'tokenise: exact current price literal → {{px}} with no D');
  const r2 = MP.tokenise('ราคาปัจจุบัน $1.23 เทียบ FV', view, [{ text: '$1.23', token: 'px' }]);
  t(r2.text.includes('{{px}}') && r2.D.length === 1 && /prose/.test(r2.D[0]), 'tokenise: labelled literal ≠ rendered → token + D row');
  const r3 = MP.tokenise('ยอดซื้อคืน $1.23 ล้าน', view, []);
  t(!r3.text.includes('{{') && r3.D.length === 0, 'tokenise: unlabelled non-matching literal untouched');
}

// ── controller rulings (Task 5 carries) ──
// (2) post-assembly guard: a computed leg that no longer reproduces on the final fundamentals → declared + F
{
  const r = run('BBL');
  t.eq(A.guardLegs(r.doc, r.meta.legs), [], 'guard: nothing to demote on the assembled BBL doc');
  r.doc.fundamentals.eps = 30;   // 30 × 9.0x = 270 ≠ printed ฿198
  const F = A.guardLegs(r.doc, r.meta.legs);
  t(F.length === 1 && /^leg 1 pe: demoted — no longer reproduces on final fundamentals/.test(F[0]), 'guard: mutated eps → F note for leg 1', JSON.stringify(F));
  t.eq([r.doc.legs[0].method, r.doc.legs[0].inputs, r.doc.legs[0].family], ['declared', { value: 198, basis: 'other' }, 'market'], 'guard: demoted leg = declared other with the printed value (family kept)');
  t(!('override' in r.doc.legs[0]) && /Normalized EPS/.test(r.doc.legs[0].note), 'guard: demoted leg drops override · note = full mdesc');
  t.eq(S.validate(r.doc).map((e) => e.path), [], 'guard: demoted doc still validates');
}
// every computed leg in every fixture reproduces its printed .mval on doc.fundamentals (extract ran on exactly that object)
{
  const L = require('../../tools/v3/legs.js'), LG = require('../../tools/migrate-v3/legs.js');
  for (const s of SYMS) {
    const { doc, meta } = out[s];
    doc.legs.forEach((leg, i) => {
      if (leg.method === 'declared') return;
      let v = null; try { v = L.legValue(leg, doc.fundamentals); } catch (_) { /* */ }
      t(LG.reproduces(v, meta.legs[i].mval), `${s}: leg ${i + 1} ${leg.method} reproduces ${meta.legs[i].mval} on doc.fundamentals (got ${v})`);
    });
  }
}
// (1) dcf legs carry rfCurrency from sm.currency via f.currency (no assemble override)
for (const s of SYMS) for (const l of out[s].doc.legs) if (l.method === 'dcf') t.eq(l.inputs.rfCurrency, out[s].doc.currency, `${s}: dcf rfCurrency = currency`);
// (3) empty vmethod shells dropped by the parser → F note
{
  const p = PV.parseV2('BBL', raw('BBL')); p.legBlocks = p.legs.length + 2;
  const r = A.assemble(p, { seeds: SEEDS, headUpdated: null, v2Hash: B.freshHash(raw('BBL')), today: '2026-09-04', analysisPx: null });
  t(r.notes.F.includes('F: 2 empty leg shell(s) dropped') || r.notes.F.some((f) => /^2 empty leg shell\(s\) dropped$/.test(f)), 'legBlocks > legs → F note', JSON.stringify(r.notes.F));
  t(!('migratedFrom' in r.doc.meta) && r.notes.F.some((f) => /no committed manifest row/.test(f)), 'headUpdated null → no migratedFrom + F');
}
// (4) tokenise skips a candidate token that is not in TK.TOKENS_V3 (defensive · no D)
{
  const view = C.compute(out.SRE.doc, { seeds: SEEDS });
  const r = MP.tokenise('ราคาปัจจุบัน $1.23 เทียบ FV', view, [{ text: '$1.23', token: 'noSuchToken' }]);
  t(!r.text.includes('{{') && r.D.length === 0, 'tokenise: unknown token name skipped');
}
t.done();
