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
  t(r.notes.F.includes('2 empty leg shell(s) dropped'), 'legBlocks > legs → F note', JSON.stringify(r.notes.F));
  t(!('migratedFrom' in r.doc.meta) && r.notes.F.some((f) => /no committed manifest row/.test(f)), 'headUpdated null → no migratedFrom + F');
}
// (4) tokenise skips a candidate token that is not in TK.TOKENS_V3 (defensive · no D)
{
  const view = C.compute(out.SRE.doc, { seeds: SEEDS });
  const r = MP.tokenise('ราคาปัจจุบัน $1.23 เทียบ FV', view, [{ text: '$1.23', token: 'noSuchToken' }]);
  t(!r.text.includes('{{') && r.D.length === 0, 'tokenise: unknown token name skipped');
}
// ── fix round 1 ──
const MC = require('../../tools/migrate-v3/cards.js'), MS = require('../../tools/migrate-v3/scenarios.js'), MT = require('../../tools/migrate-v3/theme.js');
const L3 = require('../../tools/v3/legs.js'), bt = require('../../tools/brandtheme.js');
// I-1: งวดย่อย (ไตรมาส / 2Q26 / 9M / 1H) ไม่ลงคีย์ FY/TTM — custom + F
{
  t.eq(MC.keyOf('กำไรสุทธิ 2Q26', '฿13,247 ลบ.'), null, 'I-1: "2Q26" label → no key');
  t.eq(MC.keyOf('รายได้ Q2 FY2026', '$1.9B'), null, 'I-1: quarter label → no revenueFy');
  t.eq(MC.keyOf('Free Cash Flow (9M FY26)', '$2.14B'), null, 'I-1: 9M FCF → no fcf key');
  t.eq(MC.keyOf('EPS 1H FY2027 (Non-GAAP)', '$1.02'), null, 'I-1: 1H EPS → no epsFy');
  t.eq([MC.keyOf('กำไรสุทธิ FY2025', '$107.6M'), MC.keyOf("รายได้ TTM (Q1'26)", '$26.0B'), MC.keyOf('NIM (Q2 2026)', '3.70%')], ['netIncomeFy', 'revenue', 'nim'], 'I-1: FY / TTM-labelled / point-in-time keys unchanged');
  const p = PV.parseV2('BBL', raw('BBL'));
  p.s1cards[4] = { ...p.s1cards[4], kHtml: 'กำไรสุทธิ Q2 FY2026', k: 'กำไรสุทธิ Q2 FY2026' };
  const r = A.assemble(p, { seeds: SEEDS, headUpdated: null, v2Hash: 'x', today: '2026-09-04', analysisPx: null });
  t(r.doc.metrics.custom.some((c) => c.label === 'กำไรสุทธิ Q2 FY2026' && c.value === '฿46,007 ล้าน') && !r.doc.fundamentals.fy.netIncome, 'I-1: quarter card → custom verbatim, not fy.netIncome');
  t(r.notes.F.includes('card "กำไรสุทธิ Q2 FY2026" → custom (period-labelled: not FY/TTM)'), 'I-1: F note for the period card', JSON.stringify(r.notes.F));
}
// I-2 / M-3 / M-4: baseOverride — values.baseEps · fundamentals reproduce printed ends (no override) · back-compute + F · leg-printed base
{
  const p = PV.parseV2('BBL', raw('BBL'));
  const f22 = { eps: 22 }, run2 = (pp, f, legs) => MS.scenarios(pp, f, legs);
  t(!run2(p, f22).scenarios.baseOverride, 'baseOverride: values.baseEps = fundamentals.eps → none');
  const p1 = PV.parseV2('BBL', raw('BBL')); p1.rd.values.baseEps = 21;
  t.eq(run2(p1, f22).scenarios.baseOverride, { value: 21, why: 'EPS ฐานฉากที่ผู้เขียนใช้' }, 'baseOverride: from values.baseEps');
  const p2 = PV.parseV2('BBL', raw('BBL')); delete p2.rd.values.baseEps;
  const a = run2(p2, f22);   // 22 → 20.7 / 24.0 / 27.0 printed (rounding noise only — AAI-shaped)
  t(!a.scenarios.baseOverride && !a.F.some((x) => /baseOverride/.test(x)), 'baseOverride: fundamentals.eps reproduces every printed end → no override');
  const b = run2(p2, { eps: 25 });
  t(b.scenarios.baseOverride && b.scenarios.baseOverride.why === 'EPS ฐานฉากถอดกลับจากราคาเป้าที่พิมพ์' && Math.abs(b.scenarios.baseOverride.value - 24 / Math.pow(1.03, 3)) < 1e-3, 'baseOverride: back-computed from the Base column, never attributed to the author', JSON.stringify(b.scenarios.baseOverride));
  t(b.F.some((x) => /back-computed from the printed eps end values \(values\.baseEps absent\)/.test(x)), 'baseOverride: back-compute → F');
  // M-3: Base column unreadable → first printed column
  const p3 = PV.parseV2('BBL', raw('BBL')); delete p3.rd.values.baseEps; p3.s6cols[1] = { ...p3.s6cols[1], lis: p3.s6cols[1].lis.filter((x) => !/ปี\s*\d/.test(x[0]) || /ปันผล/.test(x[0])) };
  const c = run2(p3, { eps: 25 });
  t(c.scenarios.baseOverride && Math.abs(c.scenarios.baseOverride.value - 20.7 / Math.pow(0.98, 3)) < 1e-3, 'M-3: missing Base end value → Bear column start', JSON.stringify(c.scenarios.baseOverride));
  // M-4: non-eps driver — a per-share base printed in a leg override that reproduces the printed ends wins over back-compute
  const p4 = PV.parseV2('BBL', raw('BBL')); p4.s6cols.forEach((col) => { col.top = [col.top[0], col.top[1].replace('EPS', 'FFO')]; });
  const d = run2(p4, {}, [{ method: 'pffo', override: { ffoPerShare: 22, why: 'x' } }]);
  t.eq([d.scenarios.driver, d.scenarios.baseOverride && d.scenarios.baseOverride.value], ['ffo', 22], 'M-4: ffo base from the leg-printed ffoPerShare');
}
// M-1: tgt tolerance — values.scenarios printed 2 dp (0.005) · literal .tgt uses its own decimals
{
  const p = PV.parseV2('BBL', raw('BBL'));
  const view = { scn: [{ tgt: 150.004 }, { tgt: 216.01 }, { tgt: 270 }] };
  t.eq(MS.tgtCheck(p, view), ['scn.base.tgt 216 → 216.01'], 'M-1: 0.005 tolerance for values.scenarios targets');
}
// M-2: disclaimerSources never tokenised (historical citation stays literal)
{
  const h = raw('BBL').replace('• ราคา ณ ~{{rd:priceDate}} จาก', '• ราคาปัจจุบัน ฿191 ณ 4 ก.ย. จาก');
  const r = A.assemble(PV.parseV2('BBL', h), { seeds: SEEDS, headUpdated: null, v2Hash: 'x', today: '2026-09-04', analysisPx: null });
  t(/ราคาปัจจุบัน ฿191 ณ 4 ก\.ย\./.test(r.doc.prose.disclaimerSources) && !r.notes.D.some((x) => /disclaimerSources/.test(x)), 'M-2: labelled literal in disclaimerSources left literal, no D');
}
// M-5: theme
{
  const seed = '#1f6fd1', mk = bt.makeTheme(seed);
  const near = MT.theme('ZZZ', { ...mk, badge: 'var(--blue-d)', chgBg: 'var(--green-soft)', chgColor: '#137333' }, { ZZZ: seed });
  t(near.themeLegacy === null && !near.F.length && !near.H.length, 'theme: seed-near → no themeLegacy');
  const bbl = PV.parseV2('BBL', raw('BBL')).rd.theme;
  const far = MT.theme('BBL', { ...bbl, badge: '#ff00aa' }, {});
  t.eq(Object.keys(far.themeLegacy), S.THEME_KEYS, 'theme: far/no seed → the 8 THEME_KEYS copied');
  t.eq(far.F, ['theme.badge/chg dropped (template decoration)'], 'theme: non-default badge → F');
}
// M-5: staleCopies
{
  const st = MP.staleCopies('ตอนนั้นราคา $300.00 และ MOS +12.0% ส่วน P/E 25.5x', { px: 300, mos: 12, pe: 25.5, upside: 20 }, { px: 326.57, mos: -5, upside: -3, pe: 28 });
  t.eq(st.map((x) => x.why), ['px@analysis', 'mos@analysis', 'pe@analysis'], 'staleCopies: px/mos/pe copies of the analysis-day values');
  t.eq(MP.staleCopies('ราคา $326.57', { px: 326.57 }, { px: 326.57, mos: 0, upside: 0 }), [], 'staleCopies: value equal to today → not stale');
}
// M-5: extras table · pxMeta · card → custom F + .d prefix stripping
{
  const H = [];
  const x = A.extrasOf({ extraSecs: [{ body: '<div class="s-head"><div class="n">9</div><h2>ตาราง SOTP</h2></div><div class="card"><table><tr><th>ส่วน</th><th>มูลค่า</th></tr><tr><td><b>ธุรกิจ A</b></td><td>1,200</td></tr></table></div>' }] }, H);
  t.eq([x, H], [[{ after: 'valuation', title: 'ตาราง SOTP', headers: ['ส่วน', 'มูลค่า'], rows: [['<b>ธุรกิจ A</b>', 1200]], columns: null }], []], 'extras: single table → headers/rows (numbers parsed, text via htmlToProse)');
  const H2 = []; A.extrasOf({ extraSecs: [{ body: '<div class="s-head"><h2>หมายเหตุ</h2></div><div class="card"><p>ข้อความ</p></div>' }] }, H2);
  t(/extra section not a table/.test(H2[0] || ''), 'extras: non-table section → H');
  const F = [];
  const pm = A.pxMetaOf('ราคาปิด ณ {{rd:priceDate}} (ตลาดปิด)<br>กรอบ 52 สัปดาห์ $1.00 / $2.50 • ADR 1 = 8 หุ้นสามัญ<br>ที่มา: A / B, C และ D', null, F);
  t.eq(pm, { sources: ['A', 'B', 'C', 'D'], priceNote: 'ปิด · ตลาดปิด · ADR 1 = 8 หุ้นสามัญ', range52w: { lo: 1, hi: 2.5 } }, 'pxMeta: sources · range with "/" · extra words → priceNote', JSON.stringify(pm));
  t.eq(out.AAPL.doc.market.range52w, { lo: 196.86, hi: 317.4 }, 'range52w: falls back to the 52-week card');
  t(out.AAPL.notes.F.includes('market.range52w from the 52-week card (px-meta has none)'), 'range52w fallback → F');
  t.eq(out.AAPL.doc.metrics.notes.pe, 'สูงกว่าปกติ', 'card note: template .d prefix ("EPS TTM $8.26") stripped');
  t(out.AAPL.notes.F.includes('card "FCF Yield" → custom (fcf: duplicate fcf)') && out.AAPL.doc.metrics.custom.some((c) => c.label === 'FCF Yield' && c.value === '~2.9%'), 'card → custom verbatim + F');
}
// M-5: THB dcf → rfCurrency THB (from f.currency via extract, no assemble override)
{
  const leg = { method: 'dcf', inputs: { g1: 5, years1: 5, tg: 2, r: 9, rfCurrency: 'THB' } };
  const v = L3.legValue(leg, { fcf: 1000e6, shares: 1e8, netDebt: 0 });
  const p = { legs: [{ mname: '1. DCF', mnameHtml: '1. DCF', mdesc: 'FCF ฿1,000 ล้าน โต 5%/ปี 5 ปี, WACC 9%, terminal 2%', mdescHtml: 'FCF ฿1,000 ล้าน โต 5%/ปี 5 ปี, WACC 9%, terminal 2%', mval: '฿' + v.toFixed(2), empty: false }] };
  const r = A.legsOf(p, { shares: 1e8 }, 'THB');
  t.eq([r.legs[0].method, r.legs[0].inputs.rfCurrency], ['dcf', 'THB'], 'THB dcf: rfCurrency THB', JSON.stringify(r));
}
t.done();
