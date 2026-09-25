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
  t.eq(notes.H, ['analyst target on the gauge is a max/min, not a consensus'], 'BBL: the only H is the max-labelled gauge target (fix round 4 · R-1)', notes.H.join(' ; '));
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
      // Plan 4c-prep Task 5: ขา pe ที่มี inputs.base (SRE "EPS adj. $5.10 (Consensus FY2026)" → epsForward) คิดผ่าน C.legValueOf = ทางเดียวกับ compute
      let v = null; try { v = C.legValueOf(leg, doc.fundamentals); } catch (_) { /* */ }
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
// ── fix round 2 ──
// I-3: forecast/guidance-labelled cards never map to actual FY/TTM keys · forward P/E → peForward only when epsForward reproduces
{
  t.eq([MC.keyOf('รายได้ FY27 (guide)', '$3.92B'), MC.keyOf('FCF (New BD est.)', '$2.1B'), MC.keyOf('รายได้คาด FY2569E', '฿500 ล้าน'), MC.keyOf('Free Cash Flow FY2026E', '$6.1B'), MC.keyOf('BVPS (est.)', '$80')], [null, null, null, null, null], 'I-3: guide / est. / คาด / FY2026E / est. → no key');
  t.eq([MC.keyOf('รายได้ TTM', '$1B'), MC.keyOf('เงินปันผล (Forward)', '~3%'), MC.keyOf('เงินปันผล (คาด)', '~3%')], ['revenue', 'yield', null], 'I-3: TTM unchanged · indicated forward dividend stays yield · expected dividend → no key');
  t.eq([MC.keyOf('P/E (FY26E)', '~18x'), MC.keyOf('P/E (TTM)', '~18x')], ['peForward', 'pe'], 'I-3: forward-labelled P/E → peForward');
  const mut = (edit) => { const p = PV.parseV2('BBL', raw('BBL')); edit(p); return A.assemble(p, { seeds: SEEDS, headUpdated: null, v2Hash: 'x', today: '2026-09-04', analysisPx: null }); };
  // FY2026E card next to a TTM key: the forecast card is custom + F, the TTM fundamentals stay unset by it
  const r1 = mut((p) => { p.s1cards[4] = { ...p.s1cards[4], kHtml: 'กำไรสุทธิ FY2026E', k: 'กำไรสุทธิ FY2026E' }; });
  t(r1.notes.F.includes('card "กำไรสุทธิ FY2026E" → custom (forecast-labelled: not actual)') && !r1.doc.fundamentals.netIncome && !(r1.doc.fundamentals.fy || {}).netIncome && r1.doc.metrics.custom.some((c) => c.label === 'กำไรสุทธิ FY2026E'), 'I-3: FY2026E card → custom + F, never fundamentals', JSON.stringify(r1.notes.F));
  // forward P/E with its own .d EPS that reproduces price ÷ EPS → peForward
  const r2 = mut((p) => { p.s1cards[2] = { kHtml: 'P/E (FY26E)', k: 'P/E (FY26E)', vHtml: '~8.1x', v: '~8.1x', vcls: '', dHtml: 'EPS FY2026E ฿24.0', d: 'EPS FY2026E ฿24.0', dcls: '' }; });
  t(r2.doc.metrics.cards.some((c) => (c.key || c) === 'peForward') && r2.doc.fundamentals.epsForward === 24, 'I-3: forward P/E + reproducing .d EPS → peForward', JSON.stringify(r2.doc.metrics.cards));
  const r3 = mut((p) => { p.s1cards[2] = { kHtml: 'P/E (FY26E)', k: 'P/E (FY26E)', vHtml: '~12.5x', v: '~12.5x', vcls: '', dHtml: 'EPS FY2026E ฿24.0', d: 'EPS FY2026E ฿24.0', dcls: '' }; });
  t(r3.doc.metrics.custom.some((c) => c.label === 'P/E (FY26E)') && r3.notes.F.some((x) => /card "P\/E \(FY26E\)" → custom \(peForward: printed/.test(x)), 'I-3: forward P/E not reproducing price ÷ EPS → custom + F');
  const r4 = mut((p) => { p.s1cards[2] = { kHtml: 'P/E (FY26E)', k: 'P/E (FY26E)', vHtml: '~8.1x', v: '~8.1x', vcls: '', dHtml: 'อิงประมาณการ', d: 'อิงประมาณการ', dcls: '' }; });
  t(r4.notes.F.some((x) => /card "P\/E \(FY26E\)" → custom \(peForward: fundamentals\.epsForward missing\)/.test(x)), 'I-3: forward P/E without EPS → custom + F');
}
// M-7: back-computed eps base within the Base column's printed rounding of fundamentals.eps → no override (AME-shaped)
{
  const p = PV.parseV2('BBL', raw('BBL')); delete p.rd.values.baseEps;
  // Bull end printed off (฿27.2) → fundamentals do not reproduce every end · Base back-compute 24.0/1.03³ = 21.963 lies within ±0.05 (Base prints 1 dp) of eps 21.97
  p.s6cols[2] = { ...p.s6cols[2], lis: p.s6cols[2].lis.map((x) => (/ปี\s*\d/.test(x[0]) && !/ปันผล/.test(x[0]) ? [x[0], '~฿27.2', '~฿27.2'] : x)) };
  const back = 24.0 / Math.pow(1.03, 3);   // 21.963
  const a = MS.scenarios(p, { eps: 21.97 });
  t(Math.abs(back - 21.97) <= 0.05 && !a.scenarios.baseOverride && a.meta.base === 'fundamentals (rounding)' && !a.F.some((x) => /baseOverride/.test(x)), 'M-7: back-computed base within printed rounding of fundamentals.eps → no override', JSON.stringify(a.meta.base));
  const b = MS.scenarios(p, { eps: 21.5 });
  t(b.scenarios.baseOverride && b.meta.base === 'back-computed', 'M-7: beyond the rounding → back-compute + F kept');
}
// ── fix round 3 (Task 6 carry losses) ──
const R3 = require('../../_template/v3/render.js');
// B-1: entity names fully decoded before storing (no "&amp;mdash;" on the v3 page)
{
  const h = raw('BBL').replace('<span class="tag">Financials • Banking</span>', '<span class="tag">Financials &mdash; Banking &divide; Retail</span>')
    .replace('Normalized EPS ~฿22 × P/E เฉลี่ย ~9.0x (กลางกรอบ 5 ปี)', 'Normalized EPS ~฿22 &times; P/E เฉลี่ย ~9.0x (กลางกรอบ 5 ปี) &mdash; ทบทวน &divide; 2 รอบ');
  const r = A.assemble(PV.parseV2('BBL', h), { seeds: SEEDS, headUpdated: null, v2Hash: 'x', today: '2026-09-04', analysisPx: null });
  t.eq(r.doc.meta.headerTags[0], 'Financials — Banking ÷ Retail', 'B-1: header tag entities decoded');
  // Plan 4c-prep Task 5 (qualifierOf round 3 — brief Step 4): คำผู้เขียน "เฉลี่ย" ในท่อนสูตรนอกวงเล็บพกไปต้น note (เดิม TEXT LOST)
  t(r.doc.legs[0].method === 'pe' && r.doc.legs[0].note === 'เฉลี่ย · กลางกรอบ 5 ปี · ทบทวน ÷ 2 รอบ' && !/&[a-z]+;/.test(JSON.stringify(r.doc)), 'B-1: mdesc &times;/&divide;/&mdash; decoded (leg still computed · note decoded · no entity names left)', JSON.stringify(r.doc.legs[0]));
  const view = C.compute(r.doc, { seeds: SEEDS }), page = B.expandReport(R3.toV2Source(r.doc, view));
  t(!/&amp;(?:mdash|divide|times);/.test(page), 'B-1: rendered page has no double-escaped entity');
}
// B-2: v2 stock-meta dividend yield without a printed dps → dps derived, v3 yield renders the same
{
  const { doc, notes } = out.FTV, view = C.compute(doc, { seeds: SEEDS });
  t(Math.abs(view.sm.dividendYield - 0.38) < 0.005, 'B-2: FTV sm.dividendYield ≈ 0.38', String(view.sm.dividendYield));
  t(notes.F.some((x) => /fundamentals\.dps .* derived from stock-meta dividendYield 0\.38%/.test(x)) && doc.metrics.cards.includes('yield'), 'B-2: derived dps → F note · yield card stays a catalogue card');
}
// B-3: analyst target printed only on the gauge / vcell → doc.analyst (rating null unless the vcell states it for that target)
{
  const casy = out.CASY.doc, view = C.compute(casy, { seeds: SEEDS });
  t(/\{\{rd:analystTgt\}\}<br><small>เป้าเฉลี่ย Analyst/.test(R3.toV2Source(casy, view)), 'B-3: CASY gauge marker rendered');
  t.eq(out.CASY.doc.analyst, { target: 954, n: 20, rating: 'Buy', asOf: null }, 'B-3: CASY target + n + rating from the matching vcell');
}
// B-4: reworded volatility sentence — the whole author middle lands in disclaimerAssump
{
  const h = raw('BBL').replace(/ตัวเลข valuation อิงสมมติฐานที่อาจคลาดเคลื่อน โดยเฉพาะ([\s\S]*?)ราคาหุ้นมีความผันผวนสูง ผู้ลงทุนควรศึกษาข้อมูลเพิ่มเติมและพิจารณาความเสี่ยงของตนเองก่อนตัดสินใจ/,
    'แบงก์นี้อ่อนไหวต่อ <b>ดอกเบี้ยขาลง</b> และ NPL SME มาก หุ้น BBL ผันผวนตามวัฏจักร ผู้ลงทุนควรศึกษาเพิ่มเติมก่อนตัดสินใจ');
  t(/แบงก์นี้อ่อนไหว/.test(h), 'B-4: mutation applied');
  const r = A.assemble(PV.parseV2('BBL', h), { seeds: SEEDS, headUpdated: null, v2Hash: 'x', today: '2026-09-04', analysisPx: null });
  t.eq(r.doc.text.disclaimerAssump, ' แบงก์นี้อ่อนไหวต่อ <b>ดอกเบี้ยขาลง</b> และ NPL SME มาก หุ้น BBL ผันผวนตามวัฏจักร ผู้ลงทุนควรศึกษาเพิ่มเติมก่อนตัดสินใจ', 'B-4: reworded middle kept whole');
  t(/^อ้างอิงงบจริง FY2025/.test(r.doc.prose.disclaimerSources) && r.notes.F.some((x) => /disclaimer reworded/.test(x)), 'B-4: sources still split after "ก่อนตัดสินใจ •" + F');
}

// ── Plan 4b Task 6b — author text in template zones gets a schema home · multipleSource never misattributes a median ──
const EQ6 = require('../../tools/migrate-v3/equiv.js');
const asm = (sym, html) => A.assemble(PV.parseV2(sym, html), { seeds: SEEDS, headUpdated: null, v2Hash: 'x', today: PV.parseV2(sym, html).rd.values.priceDate, analysisPx: null });
{
  const { doc, notes } = out.DPZ;
  t.eq(doc.text && doc.text.chartHint, '(รายเดือน, Yahoo Finance)', '6b: DPZ §2 hint residue → text.chartHint');
  t(notes.F.some((x) => /chart hint kept/.test(x)), '6b: DPZ chart hint → F');
  t(!('chartHint' in (out.FTV.doc.text || {})), '6b: template-only §2 hint → no chartHint key');
}
{
  t.eq(out.FTV.doc.scenarios.hintNote, '(TTM adj.)', '6b: FTV §6 hint residue → scenarios.hintNote');
  t.eq(out.DDOG.doc.scenarios.hintNote, '(non-GAAP)', '6b: DDOG §6 hint residue (no scnNote token) → hintNote');
  const g = asm('FTV', raw('FTV').replace('~{{rd:baseEps}} (TTM adj.){{rd:scnNote}}', '~{{rd:baseEps}} (TTM GAAP){{rd:scnNote}}'));
  t.eq(g.doc.scenarios.hintNote, '(TTM GAAP)', '6b: FTV-shaped "(TTM GAAP)" → hintNote');
  t(!('hintNote' in out.BBL.doc.scenarios) && !('hintNote' in out.DPZ.doc.scenarios), '6b: template-form §6 hint → no hintNote key');
  t(out.BBL.doc.scenarios.divIncluded === true, '6b: BBL divIncluded (precondition)');
  const lit = asm('BBL', raw('BBL').replace('~{{rd:baseEps}}{{rd:scnNote}}</div>', '~{{rd:baseEps}} • รวมปันผล</div>'));
  t(!('hintNote' in lit.doc.scenarios), '6b: literal "• รวมปันผล" (= what scnNote renders when divIncluded) → no hintNote key');
  // fix round 1 (I-5): CASY divIncluded=false — the author's "ไม่มีปันผล" agrees, so it is carried (on BBL divIncluded=true it now clashes — below)
  const nd = asm('CASY', raw('CASY').replace('~{{rd:baseEps}}{{rd:scnNote}}</div>', '~{{rd:baseEps}} • ไม่มีปันผล (buyback แทน)</div>'));
  t.eq(nd.doc.scenarios.hintNote, '• ไม่มีปันผล (buyback แทน)', '6b: author "ไม่มีปันผล …" residue → hintNote');
  const odd = asm('BBL', raw('BBL').replace('จากจุดเข้า {{rd:px}} • EPS ฐาน ~{{rd:baseEps}}{{rd:scnNote}}', 'จากจุดเข้า {{rd:px}} • EPS ฐาน (ปรับ) ~฿22'));
  // fix round 1 (re-review addendum): the base value is stripped only right after "ฐาน ~" — here author words sit between, so the figure stays (compared, not masked)
  t.eq(odd.doc.scenarios.hintNote, '(ปรับ) ~฿22', '6b: author words inside the base segment kept · template label stripped · a figure not right after "ฐาน ~" kept');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • EPS ฐาน TTM $3.2 • ไม่รวมปันผล', { driver: 'eps', divIncluded: false }), 'TTM $3.2 • ไม่รวมปันผล', '6b: s6HintNote keeps words around the base (figure not right after "ฐาน ~" kept)');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • ตัวแปรฉาก = ราคาทองแดง', { driver: 'eps', divIncluded: false }), '• ตัวแปรฉาก = ราคาทองแดง', '6b: no base segment → every author segment kept');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} · EPS ฐาน ~$2 · รวมปันผล', { driver: 'eps', divIncluded: true }), '', '6b: · separators + รวมปันผล (divIncluded) = template only');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • EPS ฐาน ~{{baseEps}} • รวมปันผล', { driver: 'eps', divIncluded: false }), '• รวมปันผล', '6b: "รวมปันผล" kept when v3 would not print it (divIncluded false)');
  t.eq(A.s6HintNote('ราคาเป้า = EPS × P/E', { driver: 'eps', divIncluded: false }), 'ราคาเป้า = EPS × P/E', '6b: hint not starting "จากจุดเข้า" kept whole');
}
{
  const h = raw('FTV').replace('<div class="ret {{rd:sc2retClass}}">{{rd:sc2ret}}</div>', '<div class="ret pos">+42.3% (รวมปันผล)</div>')
    .replace('<div class="ret {{rd:sc3retClass}}">{{rd:sc3ret}}</div>', '<div class="ret {{rd:sc3retClass}}">{{rd:sc3ret}} (รวม div)</div>');
  const r = asm('FTV', h);
  t.eq(r.doc.scenarios.cases.map((c) => c.retNote), [undefined, '(รวมปันผล)', '(รวม div)'], '6b: .ret residue → cases[i].retNote (literal % and token anchors)');
  t(!/42\.3/.test(JSON.stringify(r.doc)), '6b: the .ret number itself is never copied');
  t(r.notes.F.some((x) => /retNote/.test(x)), '6b: retNote → F');
  const py = asm('FTV', raw('FTV').replace('<div class="ret {{rd:sc2retClass}}">{{rd:sc2ret}}</div>', '<div class="ret pos">+12.3%/ปี</div>')
    .replace('<div class="ret {{rd:sc3retClass}}">{{rd:sc3ret}}</div>', '<div class="ret pos">+80% รวม / ~21%/ปี</div>'));
  t(py.doc.scenarios.cases.every((c) => !('retNote' in c)) && py.notes.H.filter((x) => /\.ret/.test(x)).length === 2,
    '6b: per-year / numeric .ret annotations are not relabelled onto the v3 total → H', py.notes.H.join(' ; '));
}
{
  const F = [];
  t.eq(A.multipleSourceOf('P/E 38x — premium เหนือมัธยฐาน 5 ปี 26.7x', F, 0, 38), 'author', '6b: premium over the median → author');
  t(F.some((x) => /multipleSource author \(premium\/discount vs median\)/.test(x)), '6b: premium → F names it');
  t.eq(A.multipleSourceOf('P/E มัธยฐาน 5 ปี 15.2x', [], 0, 15.2), 'median5y', '6b: the multiple called the 5y median → median5y');
  t.eq(A.multipleSourceOf('EPS (TTM) $6.13 × P/E เป้าหมาย ~20x (มัธยฐาน 5 ปี)', [], 0, 20), 'median5y', '6b: median label after the multiple → median5y');
  t.eq(A.multipleSourceOf('ต่ำกว่าค่าเฉลี่ยในอดีต', [], 0), 'author', '6b: "ต่ำกว่าค่าเฉลี่ยในอดีต" → author');
  t.eq(A.multipleSourceOf('peer P/BV 1.4x', [], 0, 1.4), 'peer', '6b: peer wording → peer');
  t.eq(A.multipleSourceOf('P/S 5x ค่ากลางเซกเตอร์', [], 0, 5), 'sector', '6b: sector wording → sector');
  const F2 = [];
  t.eq(A.multipleSourceOf('EPS $3 × 18x', F2, 1, 18), 'author', '6b: no wording → author (never peer)');
  t(F2.some((x) => /leg 2: multipleSource author/.test(x)), '6b: no wording → F naming the leg');
  t.eq(A.multipleSourceOf('P/E มัธยฐาน 10 ปี 20x', [], 0, 20), 'median10y', '6b: multiple called the 10y median → median10y');
  t.eq(A.multipleSourceOf('P/E 15x (มัธยฐาน 5 ปี · ต่ำกว่าช่วง 10 ปี 18x)', [], 0, 15), 'median5y', '6b: a 10-year figure elsewhere does not make it median10y');
  t.eq(A.multipleSourceOf('มัธยฐาน 5 ปี 26.7x → ใช้ 30x', [], 0, 30), 'author', '6b: the median names another multiple → author');
  t.eq(A.multipleSourceOf('P/E เฉลี่ย 5 ปี 15x', [], 0, 15), 'author', '6b: "เฉลี่ย" (average) is not a median → author');
  t.eq(A.multipleSourceOf('EPS $5.07 × P/E เป้าหมาย 29x — มัธยฐานย้อนหลัง 5 ปีของ A คือ 31.2x', [], 0, 29), 'author', '6b: the median word names a different multiple after it → author');
  t.eq(A.multipleSourceOf('EPS TTM $8.72 × P/E เฉลี่ย 5 ปี ~28x (มัธยฐาน 27x)', [], 0, 28), 'author', '6b: "(มัธยฐาน 27x)" beside a 28x average → author');
}
// gate proof — the residue words reach the v3 page, so a hint normaliser narrowed to the template strings loses nothing
{
  const S2T = (t0) => t0.replace(/^โดยประมาณ\s*/, '');
  const S6T = (t0) => t0.replace(/^จากจุดเข้า\s+\S+\s+•\s+.+?ฐาน\s+~\S+/, '').replace(/\s*•\s*รวมปันผล\s*$/, '').trim();
  const hintOf = (page, z) => { const m = /<div class="s-head">[\s\S]*?<div class="hint">([\s\S]*?)<\/div>\s*<\/div>/.exec(EQ6.zones(page).get(z) || ''); return m ? EQ6.text(m[1]) : ''; };
  const cases = [['DPZ', 'DPZ', raw('DPZ')], ['FTV', 'FTV', raw('FTV')], ['FTV-GAAP', 'FTV', raw('FTV').replace('~{{rd:baseEps}} (TTM adj.)', '~{{rd:baseEps}} (TTM GAAP)')]];
  for (const [name, sym, html] of cases) {
    const r = asm(sym, html), doc = r.doc, view = C.compute(doc, { seeds: SEEDS });
    const v2 = B.expandReport(html), v3 = B.expandReport(R3.toV2Source(doc, view));
    const eq = EQ6.compare(v2, v3, doc, view, { v2src: html });
    t(!eq.textLost.some((w) => /adj|GAAP|รายเดือน|Yahoo/.test(w)), `6b gate: ${name} EQ.compare textLost has no adj/GAAP/รายเดือน/Yahoo`);
    for (const [z, strip] of [['s2', S2T], ['s6', S6T]]) {
      const a = EQ6.tok(strip(hintOf(v2, z))), b = EQ6.tok(strip(hintOf(v3, z)));
      const left = b.slice(); const lost = a.filter((w) => { const k = left.indexOf(w); if (k < 0) return true; left.splice(k, 1); return false; });
      t.eq(lost, [], `6b gate: ${name} ${z} hint — with the normaliser narrowed to the template string, every v2 residue word is on the v3 hint`);
    }
  }
}
// ── fix round 4 (R-1 · I-4): analyst target must be one consensus figure in the doc currency ──
{
  const mk = (currency, vcell, gauge) => ({ rd: { values: {} }, sm: { currency }, byN: { 4: { body: gauge ? `<div class="scale"><span>${gauge[0]}<br><small>${gauge[1]}</small></span></div>` : '' } }, s8: { vcells: [['เป้านักวิเคราะห์ 12 ด.', vcell]] }, s1cards: [] });
  const run4 = (p) => { const F = [], H = []; return { a: A.analystOf(p, F, H), F, H }; };
  const ats = run4(mk('USD', '~C$33 – C$46 (ช่วงเป้า)'));
  t(ats.a === null && ats.H.some((h) => /^analyst target not a single consensus in the doc currency/.test(h)), 'I-4: ATS-shaped foreign-currency range → null + H', JSON.stringify(ats));
  const amata = run4(mk('THB', '~฿33.60–33.71 (14 ราย · Buy)'));
  t(amata.a === null && amata.H.some((h) => /range/.test(h)), 'I-4: AMATA-shaped range → null + H', JSON.stringify(amata));
  const plain = run4(mk('USD', '$62.90 (20 ราย · Buy)'));
  t.eq([plain.a, plain.H], [{ target: 62.9, n: 20, rating: 'Buy', asOf: null }, []], 'I-4: single "$62.90 (20 ราย · Buy)" still → target 62.9');
  const hk = run4(mk('USD', '~HK$120 (Buy)'));
  t(hk.a === null && hk.H.length === 1, 'I-4: HK$ figure in a USD doc → null + H');
  const mx = run4(mk('USD', 'ไม่มีข้อมูล', ['$80', 'เป้าสูงสุด Analyst']));
  t(mx.a === null && mx.H[0] === 'analyst target on the gauge is a max/min, not a consensus', 'R-1: max-labelled gauge target → null + H');
  const g = run4(mk('USD', 'ไม่มีข้อมูล', ['$80', 'เป้าเฉลี่ย Analyst']));
  t(g.a && g.a.target === 80 && !g.H.length, 'R-1: consensus-labelled gauge target kept');
}

// ── Task 6b fix round 1 ──
{ // I-1: every token equal to the multiple is tried — the author's "32.2x = มัธยฐาน 5 ปี" is a median
  t.eq(A.multipleSourceOf('EPS $4.49 (TTM, diluted) × P/E 32.0x = $143.68 — 32.0x คือมัธยฐาน P/E จริง 5 ปี (FY2021–FY2025: 32.0 / 30.8 / 37.0 / 29.8 / 32.5x ช่วง 29.8–37.0x) มาจากประวัติ', [], 0, 32), 'median5y', 'I-1: PLD form → median5y');
  t.eq(A.multipleSourceOf('EPS $5.82 (FY2025 GAAP dil.) × P/E 32.2x = $187 — 32.2x = มัธยฐาน 5 ปี (27.5–40.6x) วัดจริงบน GAAP diluted EPS ฐานเดียวกัน', [], 0, 32.2), 'median5y', 'I-1: BDX form → median5y');
  t.eq(A.multipleSourceOf('EBITDA FY2025 $2,759M × 9.4x − Net Debt $12,717M (Debt รวม $13,406M รวม lease − Cash $689M) ÷ 63.77M หุ้น — 9.4x = มัธยฐาน EV/EBITDA สิ้นปี FY2021–25 ของ DVA (9.86/9.71/9.32/9.41/7.99x, StockAnalysis)', [], 0, 9.4), 'median5y', 'I-1: DVA form (list of yearly multiples after) → median5y');
  t.eq(A.multipleSourceOf('× P/E 20x = $100 — 20x ต่ำกว่ามัธยฐาน 5 ปี 26x', [], 0, 20), 'author', 'I-1: a repeat of the value does not bypass the premium/discount rule');
}
{ // I-2: negated / self-set medians
  const F = [];
  t.eq(A.multipleSourceOf('EPS (TTM) ฿2.11 × P/E เป้าหมาย ~24x — ไม่ใช้มัธยฐาน 5 ปี (42.3x) เพราะ 3 ใน 5 ปี', F, 0, 24), 'author', 'I-2: CBG "ไม่ใช้มัธยฐาน" → author');
  t(F.some((x) => /negated median/.test(x)), 'I-2: F names the negation');
  t.eq(A.multipleSourceOf('DE ต่อหุ้น $3.93 × P/DE เป้าหมาย ~12.5x — เป็นตัวคูณที่ตั้งเอง (ไม่มีมัธยฐานย้อนหลังของ P/DE ที่วัดได้ในชุดข้อมูล) สูงกว่าตัวคูณที่ตลาดให้ CG เทียบกลุ่ม', [], 0, 12.5), 'author', 'I-2: CG "ตัวคูณที่ตั้งเอง (ไม่มีมัธยฐาน…)" → author (not peer from "เทียบกลุ่ม" elsewhere)');
  t.eq(A.multipleSourceOf('EBITDA adj. $3.67B × 9x (ตัวคูณสมมติ ยังไม่มีมัธยฐานที่วัดจริง จึงไม่เป็นขาของ FV)', [], 0, 9), 'author', 'I-2: AMCR "ยังไม่มีมัธยฐาน" → author');
}
{ // M-5: 2–4 year median windows reach inputs.medianWindow
  const w = (d, m) => { const o = {}; A.multipleSourceOf(d, [], 0, m, o); return o.medianWindow; };
  t.eq(w('EPS ฿1.05 (TTM) × P/E เป้าหมาย 12.5x — มัธยฐาน P/E ของ SECURE เองย้อนหลัง 3 ปีงบ (FY2023–FY2025: 16.4x / 12.5x / 10.0x', 12.5), 'FY2023–FY2025', 'M-5: SECURE → FY2023–FY2025');
  t.eq(w('EPS ฿0.43 (TTM) × P/E 12.6x — มัธยฐานที่วัดจากประวัติ SAK เอง 3 ปีงบล่าสุด (FY2023 14.6x · FY2024 12.6x', 12.6), '3 ปี', 'M-5: SAK → 3 ปี');
  t.eq(w('EPS $7.23 × P/E 28.0x — มัธยฐานที่วัดจริงจากราคาเฉลี่ยรายปี ÷ EPS ของ 4 ปีงบ (FY2023–26: 60.7x / 28.9x', 28), 'FY2023–FY2026', 'M-5: CAH FY2023–26 → FY2023–FY2026');
  t.eq(w('EPS ฿0.21 (FY2568) × P/E 41.2x — 41.2x = มัธยฐาน P/E ย้อนหลัง 4 ปีงบ (FY65–68: 74.2x', 41.2), '4 ปี', 'M-5: BE8 → 4 ปี');
  t.eq(w('P/E มัธยฐาน 5 ปี 15.2x', 15.2), undefined, 'M-5: a 5-year median gets no window');
  t.eq(w('× P/E 20x (มัธยฐาน FY2021–FY2025)', 20), undefined, 'M-5: a 5-year FY range gets no window');
}
{ // M-1 / M-2: signed base values · "จากราคาปัจจุบัน" head
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • EPS ฐาน ~−$1.37 (TTM) • ไม่มีปันผล', { driver: 'eps', divIncluded: false }), '(TTM) • ไม่มีปันผล', 'M-1: NTRA negative base stripped whole (no "~−" orphan)');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • EPS ฐาน ~ −$0.70 (TTM) • ไม่มีปันผล', { driver: 'eps', divIncluded: false }), '(TTM) • ไม่มีปันผล', 'M-1: PDYN "~ −$0.70"');
  t.eq(A.s6HintNote('จากราคาปัจจุบัน {{px}} • EPS ฐาน ~{{baseEps}} (non-GAAP FY2027E ฉันทามติ StockAnalysis)', { driver: 'eps', divIncluded: false }), '(non-GAAP FY2027E ฉันทามติ StockAnalysis)', 'M-2: WDAY head alias');
}
{ // re-review addendum: only the figure right after "ฐาน ~" is the template base — other money figures survive (INTC/NET shape)
  const r = { driver: 'revenuePerShare', divIncluded: false };
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • ฐาน: รายได้ TTM $57.0B × EV/Sales ออก (สมมติฐานฉาก) − หนี้สุทธิ ~$20.8B ÷ 5.25B หุ้น', r), 'รายได้ TTM $57.0B × EV/Sales ออก (สมมติฐานฉาก) − หนี้สุทธิ ~$20.8B ÷ 5.25B หุ้น', 'addendum: INTC revenue figure survives in hintNote');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • อิงรายได้ฐาน ~$2.51B (TTM) ÷ 356.08M หุ้น', r), '• อิงรายได้ฐาน ~$2.51B (TTM) ÷ 356.08M หุ้น', 'addendum: NET "ฐาน ~$2.51B" is an aggregate (B), not the per-share base — kept');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • ฐานรายได้/หุ้น TTM ฿2.00 • ออกด้วยตัวคูณ P/S', r), 'รายได้/หุ้น TTM ฿2.00 • ออกด้วยตัวคูณ P/S', 'addendum: APURE figure not right after "ฐาน ~" kept');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • EPS ฐาน (TTM) ~−$0.87', { driver: 'eps', divIncluded: false }), '(TTM) ~−$0.87', 'addendum: OUST base after author words kept whole (no orphan)');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • EPS ฐาน $2.03 • ไม่มีปันผล', { driver: 'eps', divIncluded: false }), '• ไม่มีปันผล', 'addendum: "ฐาน $2.03" (no ~) is still the template base');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • EPS ปกติฐาน ~$14.84 (ตัด gain on sale)', { driver: 'eps', divIncluded: false }), 'EPS ปกติ (ตัด gain on sale)', 'addendum: "ฐาน" glued to an author word + immediate value → template piece');
  t.eq(A.s6HintNote('จากจุดเข้า {{px}} • อิง revenue exit multiple ที่ผูกกับช่วงมัธยฐานย้อนหลัง', { driver: 'revenuePerShare', divIncluded: false }), '• อิง revenue exit multiple ที่ผูกกับช่วงมัธยฐานย้อนหลัง', 'addendum: "ฐาน" inside มัธยฐาน is never stripped');
}
{ // I-5: a dividend claim that contradicts divIncluded is not carried (H)
  const b = asm('BBL', raw('BBL').replace('~{{rd:baseEps}}{{rd:scnNote}}</div>', '~{{rd:baseEps}} (norm.) • ราคาเป้า = EPS × P/E (ไม่รวมปันผล)</div>'));
  t(!('hintNote' in b.doc.scenarios) && b.notes.H.some((x) => /dividend claim in the note contradicts divIncluded/.test(x)), 'I-5: BBL divIncluded + hint "ไม่รวมปันผล" → H, not carried', b.notes.H.join(' ; '));
  const c = asm('CASY', raw('CASY').replace('~{{rd:baseEps}}{{rd:scnNote}}</div>', '~{{rd:baseEps}} • รวมปันผล</div>'));
  t(!('hintNote' in c.doc.scenarios) && c.notes.H.some((x) => /contradicts divIncluded/.test(x)), 'I-5: CASY divIncluded=false + literal "รวมปันผล" → H, not carried');
  const r = asm('BBL', raw('BBL').replace(/(<div class="ret[^"]*">\{\{rd:sc2ret\}\})/, '$1 (ไม่รวมปันผล)'));
  t(!('retNote' in r.doc.scenarios.cases[1]) && r.notes.H.some((x) => /cases\[1\].*contradicts divIncluded/.test(x)), 'I-5: .ret "(ไม่รวมปันผล)" on a divIncluded total → H, not carried');
  const ok = asm('BBL', raw('BBL').replace(/(<div class="ret[^"]*">\{\{rd:sc2ret\}\})/, '$1 (รวมปันผล)'));
  t.eq(ok.doc.scenarios.cases[1].retNote, '(รวมปันผล)', 'I-5: an agreeing claim is still carried');
}
{ // I-3: IFF shape — driver revenuePerShare, hint carries {{rd:baseEps}} (no value in the view) → not carried, H, doc still renders
  const h = raw('FTV').replace(/<span>EPS ([+−-])/g, '<span>รายได้/หุ้น $1').replace(/<span>EPS ปี 3<\/span>/g, '<span>รายได้/หุ้น ปี 3</span>').replace(/<span>P\/E ออก<\/span>/g, '<span>P/S ออก</span>')
    .replace('~{{rd:baseEps}} (TTM adj.){{rd:scnNote}}', '~{{rd:baseEps}}{{rd:scnNote}} • EPS อ้างอิง ~{{rd:baseEps}} (adj.)');
  const r = asm('FTV', h);
  t.eq(r.doc.scenarios.driver, 'revenuePerShare', 'I-3: IFF-shaped fixture (precondition)');
  t(!('hintNote' in r.doc.scenarios) && r.notes.H.some((x) => /hint note carries an unresolvable token/.test(x)), 'I-3: unresolvable token → hintNote not carried + H', r.notes.H.join(' ; '));
  let ok = true; try { const v = C.compute(r.doc, { seeds: SEEDS }); B.expandReport(R3.toV2Source(r.doc, v)); } catch (e) { ok = false; }
  t(ok, 'I-3: the migrated doc renders (no build failure)');
}

// ── Task 6b fix round 2: divIncluded inferred from the §6 hint (no scnBasis) must not read "ไม่รวมปันผล" as "รวมปันผล" ──
{
  const noBasis = (h) => h.replace(/,\s*"scnBasis":\s*\{[^}]*\}/, '').replace(/"scnBasis":\s*\{[^}]*\}\s*,/, '');
  const base = noBasis(raw('BBL'));
  t(!/"scnBasis"/.test(base) && PV.parseV2('BBL', base).rd && !PV.parseV2('BBL', base).rd.values.scnBasis, 'fr2: BBL mutated to have no values.scnBasis (precondition)');
  const neg = asm('BBL', base.replace('~{{rd:baseEps}}{{rd:scnNote}}</div>', '~{{rd:baseEps}} • ไม่รวมปันผล</div>'));
  t.eq(neg.doc.scenarios.divIncluded, false, 'fr2: hint "ไม่รวมปันผล" → divIncluded false');
  t.eq(neg.doc.scenarios.hintNote, '• ไม่รวมปันผล', 'fr2: the agreeing note is carried');
  t(!neg.notes.H.some((x) => /contradicts divIncluded/.test(x)), 'fr2: no I-5 H', neg.notes.H.join(' ; '));
  const yet = asm('BBL', base.replace('~{{rd:baseEps}}{{rd:scnNote}}</div>', '~{{rd:baseEps}} • ยังไม่รวมปันผล</div>'));
  t.eq(yet.doc.scenarios.divIncluded, false, 'fr2: "ยังไม่รวมปันผล" → divIncluded false');
  const pos = asm('BBL', base.replace('~{{rd:baseEps}}{{rd:scnNote}}</div>', '~{{rd:baseEps}} • รวมปันผล</div>'));
  t.eq(pos.doc.scenarios.divIncluded, true, 'fr2: hint "รวมปันผล" + ปันผลรวม rows → divIncluded true (unchanged)');
}

// ── Task 6b fix round 2 (re-review I-6): a median OF A PEER SET is peer, not the stock's own 5-year median ──
{
  t.eq(A.multipleSourceOf('Revenue FY2569F ฿2,120M (SA consensus n=1) × P/S 1.25x ÷ 609M หุ้น — 1.25x = มัธยฐาน P/S ปัจจุบันของร้านอาหาร SET 3 ตัวที่วัดจาก StockAnalysis 21 ก.ย. 2569 (ZEN 0.43x · M 1.25x · AU 2.12x)', [], 0, 1.25), 'peer', 'I-6: OKJ "มัธยฐาน … SET 3 ตัว" → peer');
  t.eq(A.multipleSourceOf('Adjusted EBITDA guidance FY2026 กลาง $2,125M × EV/EBITDA มัธยฐานกลุ่ม IPP ปัจจุบัน (TTM ณ 21 ก.ย. 2569, stockanalysis.com): Vistra 10.12x / NRG 13.83x / Constellation 20.1x', [], 0, 13.83), 'peer', 'I-6: TLN "มัธยฐานกลุ่ม IPP" → peer');
  t.eq(A.multipleSourceOf('EPS (TTM) $11.26 × P/E เป้าหมาย 26.5x = มัธยฐาน trailing P/E ของกลุ่มเพื่อนที่วัดจาก StockAnalysis.com/statistics เมื่อ 21 ก.ย. 2569 (STRL 37.4x, EME 23.3x, MYRG 26.5x)', [], 0, 26.5), 'peer', 'I-6: IESC "มัธยฐาน … ของกลุ่มเพื่อน" → peer');
  t.eq(A.multipleSourceOf('EPS $0.80 (TTM GAAP) × P/E 23.34x (มัธยฐาน trailing P/E ของ MCK 23.34x / CAH 31.17x / COR 22.94x — StockAnalysis)', [], 0, 23.34), 'peer', 'I-6: MDLN "มัธยฐาน … ของ MCK / CAH / COR" → peer');
  t.eq(A.multipleSourceOf('EPS ที่ราคาทอง Base $5.78 × P/E เป้าหมาย ~36.5x — ตัวคูณคือมัธยฐานของ FNV เอง (ไม่ใช่ของกลุ่มเหมือง) วัดจากราคาเฉลี่ยของปี ÷ EPS ปรับลดของปีนั้น', [], 0, 36.5), 'median5y', 'I-6: FNV "มัธยฐานของ FNV เอง (ไม่ใช่ของกลุ่มเหมือง)" stays median5y');
}

// ── Task 6b fix round 3 (re-review I-7 + TLN) ──
{
  t.eq(A.multipleSourceOf('Adjusted EBITDA guidance FY2026 กลาง $2,125M (guidance $2,025–2,225M ปรับขึ้น 5 ส.ค. 2569 หลังปิดดีล Cornerstone) × EV/EBITDA มัธยฐานกลุ่ม IPP ปัจจุบัน (TTM ณ 21 ก.ย. 2569, stockanalysis.com): Vistra 10.12x / NRG 13.83x / Constellation 14.76x → มัธยฐาน 13.83x (NRG) = EV $29,389M − หนี้สุทธิ $9,343M', [], 0, 13.83), 'peer', 'fr3: TLN real mdesc (peer set named at an earlier median word in the same clause) → peer');
  t.eq(A.multipleSourceOf('รายได้ TTM $3,219M × EV/Sales 11.9x = EV $38.2B − หนี้ $1,851M + เงินสด $693M = มูลค่าหุ้น $37.0B ÷ หุ้นคงเหลือ 81.24M — 11.9x = มัธยฐานของ EV/Sales รายปี FY2022–25 (7.7x / 9.7x / 14.0x / 19.7x = (ราคาเฉลี่ยของปี × หุ้นถัวเฉลี่ยปรับลด + หนี้ − เงินสด ณ สิ้นปี) ÷ รายได้', [], 0, 11.9), 'median5y', 'fr3: AXON "มัธยฐานของ EV/Sales" (multiple name, not tickers) → median5y');
  t.eq(A.multipleSourceOf('รายได้ TTM $2,707M × EV/Sales เป้าหมาย 12.05x = EV $32,619M + เงินสดสุทธิ $854M (เงินสด $1,092M − หนี้ $238M) ÷ 144.14M หุ้นคงเหลือ — ตัวคูณ 12.05x คือมัธยฐานที่วัดจริงของ EV/Sales ปีงบ FY21–FY25 ของ NTRA เอง (13.10x · 5.21x · 6.50x · 12.05x · 13.38x', [], 0, 12.05), 'median5y', 'fr3: NTRA "มัธยฐาน…ของ EV/Sales … ของ NTRA เอง" → median5y');
  t.eq(A.multipleSourceOf('× EV/EBITDA 20x = มัธยฐานของ EV/EBITDA รายปี FY2021–25', [], 0, 20), 'median5y', 'fr3: "ของ EV/EBITDA" is a multiple name → median5y');
}
// final-review I-1 — qualifierOf: balanced nested parens · split on " — " only at depth 0 · keep prose-bearing parens/segments even with r/g/%/×
{
  const Q = A.qualifierOf;
  const bal = (x) => (x.match(/\(/g) || []).length === (x.match(/\)/g) || []).length;
  const wha = Q('D₁ = ปันผล ฿0.21 × (1+g); g 5%, r 9.5% → 0.2205 ÷ 0.045 = ฿4.90 (ตระกูล (r,g) เดียวกับ Justified P/BV — นับเป็นเสียงเดียว)');
  t.eq(wha, 'ตระกูล (r,g) เดียวกับ Justified P/BV — นับเป็นเสียงเดียว', 'I-1: WHA leg 2 nested paren + inner dash → whole parenthetical');
  t(bal(wha), 'I-1: WHA note has no orphan ")"');
  t.eq(Q('P/BV เหมาะสม = (ROE 12.0% − g 5%)/(r 9.5% − g 5%) ≈ 1.56 × BVPS ฿2.47 (ตระกูล (r,g) เดียวกับ DDM)'), 'ตระกูล (r,g) เดียวกับ DDM', 'I-1: WHA leg 3 nested (r,g) paren kept');
  t.eq(Q('P/BV เหมาะสม = (ROE 5.96% − g 2.5%)/(r 9.5% − g 2.5%) ≈ 0.494 × BVPS $89.75 (r, g เป็นสมมติฐานของผู้วิเคราะห์ · คนละตระกูลกับ P/E เพราะอิง ROE/book ไม่ใช่กำไรต่อหุ้น)'),
    'r, g เป็นสมมติฐานของผู้วิเคราะห์ · คนละตระกูลกับ P/E เพราะอิง ROE/book ไม่ใช่กำไรต่อหุ้น', 'I-1: LEN leg 2 paren with r/g + author sentence → kept');
  t.eq(Q('D₁ = ปันผล $1.32 × (1+g) = $1.346; g 2%, r 8.5% → $1.346 ÷ 0.065 = $20.71 · เน้นกระแสเงินสดจ่ายคืนผู้ถือหุ้นระยะยาว (dividend + buyback)'),
    'เน้นกระแสเงินสดจ่ายคืนผู้ถือหุ้นระยะยาว (dividend + buyback)', 'I-1: CMCSA leg 2 " · " prose segment → kept whole');
  t.eq(Q('EPS $3.09 (GAAP diluted TTM) × P/E เป้าหมาย 10.5x (5 ปี) (r−g) — ท้ายของผู้เขียน'), 'ท้ายของผู้เขียน', 'I-1: formula-only parens (basis · years · r−g) not carried; tail kept');
  t.eq(Q('สมมติฐานของผู้วิเคราะห์เอง: FCF TTM $15.10B โต 5%/ปี 10 ปี · r 8.5%'), 'สมมติฐานของผู้วิเคราะห์เอง', 'I-1: HD-shaped lead label before ":" carried');
  t.eq(Q('D₁ = ปันผล $6.80 × (1+g); g 6.5%, r 9.0% → g สะท้อนการเติบโตปันผลระยะยาวที่ชะลอจาก ~10%+ ในอดีต, r ต่ำจาก beta 0.84'),
    'g สะท้อนการเติบโตปันผลระยะยาวที่ชะลอจาก ~10%+ ในอดีต, r ต่ำจาก beta 0.84', 'I-1: ADP-shaped explanation after "→" carried');
  t.eq(Q('EPS ~฿22 × P/E ~9x (กลางกรอบ (ช่วง 5 ปี) ของ BBL'), '', 'I-1: unclosed paren → nothing invented, no orphan fragment');
  t(A.isProseToken('สมมติฐาน', true) && !A.isProseToken('WACC', true) && !A.isProseToken('6.8pp', true) && !A.isProseToken('FY2026', true) && A.isProseToken('FY2026E', true) && A.isProseToken('forward', true) && A.isProseToken('Tangible', true) && !A.isProseToken('เป้าหมาย', true) && A.isProseToken('เป้าหมาย', false) === false,
    'I-1: isProseToken — author word vs formula vocab / number+unit / actual fiscal period / generated word · forward/estimate/Tangible basis = author word (re-review I-3)');
}
// Plan 4b final review N-3 — singleTarget positive cases for the own-currency prefixes (US$ on a USD doc · ฿ on a THB doc)
t.eq(A.singleTarget('~US$1,245.50 (Buy)', 'USD'), { v: 1245.5 }, 'N-3: "US$" target on a USD doc → value');
t.eq(A.singleTarget('~฿163.50 (Buy)', 'THB'), { v: 163.5 }, 'N-3: "฿" target on a THB doc → value');
t.eq(A.singleTarget('~฿163.50', 'USD'), { reject: 'currency ฿' }, 'N-3: "฿" on a USD doc → rejected (currency)');
// Plan 4c-prep Task 1 (#68 · D6) — targeted median rules (general "negated median ⇒ author" stays rejected)
{
  const BDMS = 'EPS (TTM) ฿0.96 × P/E เป้าหมาย 21.4x — 21.4x คือ P/E ที่วัดจริงของ FY2025 (ราคาเฉลี่ยปี ฿21.31 ÷ EPS ฿1.00) ไม่ได้มาจาก P/E ปัจจุบัน; ไม่ใช้มัธยฐาน 5 ปี 31.0x เพราะ P/E ลดลงทุกปี (44.4→33.8→31.0→27.3→21.4x) ตามการโตช้าลง มัธยฐานถูกลากด้วยปี FY2021–23';
  const F = [], o = {};
  t.eq(A.multipleSourceOf(BDMS, F, 0, 21.4, o), 'author', '#68 BDMS: a multiple inside an arrow series is history → author (not median5y)');
  t(o.medianWindow == null && F.some((x) => /leg 1: multipleSource author/.test(x)), '#68 BDMS: no medianWindow · F names the leg', JSON.stringify({ o, F }));
  const OWN = 'EPS $5.00 × P/E 22.0x — 22.0x = มัธยฐาน 5 ปีของบริษัทเอง (18.1→22.0→25.3x)';
  t.eq(A.multipleSourceOf(OWN, [], 0, 22.0, {}), 'median5y', '#68: series rule does not demote a median named next to the leg multiple outside the series');
  const TRMB = 'EPS $1.93 × P/E 41.7x — P/E 41.7x = มัธยฐานย้อนหลังของ TRMB เอง (4 ปีงบ FY2021–23 และ FY2025 ช่วง 35.4–42.6x ตัด FY2024 ที่มีกำไรพิเศษ)';
  const o2 = {};
  t.eq(A.multipleSourceOf(TRMB, [], 0, 41.7, o2), 'median5y', '#68 TRMB: still a median');
  t.eq(o2.medianWindow, 'FY2021–FY2023, FY2025', '#68 TRMB: median window keeps the extra year');
  t.eq(A.medianWindowOf('มัธยฐาน FY2022–FY2025'), 'FY2022–FY2025', '#68: plain window unchanged');
}
// Plan 4c-prep Task 1 (D5): custom cap follows meta.migratedFrom — DPZ (5 custom) keeps all 5 when migrated · still H without a manifest row
{
  const html = raw('DPZ'), p = PV.parseV2('DPZ', html);
  const mig = A.assemble(p, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: p.rd.values.priceDate, analysisPx: null });
  const nw = A.assemble(p, { seeds: SEEDS, headUpdated: null, v2Hash: B.freshHash(html), today: p.rd.values.priceDate, analysisPx: null });
  t(mig.doc.metrics.custom.length === 5 && !mig.notes.H.some((h) => /^custom cards/.test(h)), 'cap: migrated DPZ keeps 5 custom cards, no cap H', JSON.stringify(mig.notes.H));
  t(nw.notes.H.some((h) => /^custom cards 5 > 4 — dropped "Store Count \(Global\)"/.test(h)), 'cap: no migratedFrom → cap 4 still applies', JSON.stringify(nw.notes.H));
}
// ── Plan 4c-prep Task 5 (spec §3.7 · D3/D4) ──
const EQ = require('../../tools/migrate-v3/equiv.js');
const R = require('../../_template/v3/render.js');
const K = require('../../tools/v3/cards.js');
// MS / MC ประกาศไว้แล้วด้านบน (บรรทัด require ชุด Task 5 ของ 4b)
const runH = (sym, html) => { const p = PV.parseV2(sym, html); const r = A.assemble(p, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: p.rd.values.priceDate, analysisPx: null });
  const view = r.doc && C.compute(r.doc, { seeds: SEEDS }); return { ...r, view, eq: view && EQ.compare(B.expandReport(html), B.expandReport(R.toV2Source(r.doc, view)), r.doc, view, { v2src: html }) }; };
// gdots text → meta.sectorLine (v2 rendered it)
{
  const r = runH('SRE', raw('SRE').replace(/<div class="gdots">[^<]*<\/div>/, '<div class="gdots">SRE · Sempra · Utilities</div>'));
  t.eq(r.doc.meta.sectorLine, 'SRE · Sempra · Utilities', 'gdots text → meta.sectorLine');
  t(!r.eq.textLostAt.some((x) => x.zone === 'header'), 'gdots words not lost in header', JSON.stringify(r.eq.textLostAt));
  t(!('sectorLine' in runH('SRE', raw('SRE')).doc.meta), 'glyph-only gdots (●●●) → no sectorLine');
}
// first tag: "(ADR)" / "TSX: CCO" → exchange + headerTags (no H)
{
  t.eq(A.firstTagOf('NASDAQ: ASML (ADR)', 'ASML'), { exchange: 'NASDAQ', extra: ['ADR'] }, 'first tag (ADR)');
  t.eq(A.firstTagOf('NYSE: CCJ / TSX: CCO', 'CCJ'), { exchange: 'NYSE', extra: ['TSX: CCO'] }, 'first tag dual listing');
  t.eq(A.firstTagOf('NASDAQ: POET • TSXV: PTK', 'POET'), { exchange: 'NASDAQ', extra: ['TSXV: PTK'] }, 'first tag bullet dual listing');
  t.eq(A.firstTagOf('NASDAQ: LANC → MZTI', 'LANC'), { exchange: 'NASDAQ', extra: ['→ MZTI'] }, 'first tag rename arrow kept as a tag');
  t.eq(A.firstTagOf('OTC Markets: FANUY (ADR)', 'FANUY'), { exchange: 'OTC Markets', extra: ['ADR'] }, 'multi-word exchange');
  t.eq(A.firstTagOf('SET: STECON', 'STEC'), { exchange: 'SET', extra: ['STECON'] }, 'printed ticker ≠ file symbol → the printed ticker becomes a tag');
  t.eq(A.firstTagOf('Healthcare', 'X'), null, 'not an exchange tag → null (H stays)');
  const r = runH('SRE', raw('SRE').replace('<span class="tag">NYSE: SRE</span>', '<span class="tag">NYSE: SRE (ADR)</span>'));
  t(r.doc.meta.exchange === 'NYSE' && r.doc.meta.headerTags[0] === 'ADR' && !r.notes.H.some((h) => /first header tag/.test(h)), 'SRE (ADR): exchange NYSE · ADR tag · no H', JSON.stringify(r.doc.meta.headerTags));
}
// legend annotation → text.legendNote · 3rd+ vcell → verdict.extraCells
{
  const html = raw('CASY').replace(/(จุดสำคัญ<\/span>)/, '$1\n        <span>เส้นประ = FV รอบก่อน</span>')
    .replace(/(<div class="vgrid">[\s\S]*?)(\n\s*<\/div>\s*<div class="zone">)/, '$1\n        <div class="vcell"><div class="k">จุดทยอยสะสม</div><div class="v">ใต้มูลค่าเหมาะสม</div></div>$2');
  const r = runH('CASY', html);
  t.eq(r.doc.text.legendNote, 'เส้นประ = FV รอบก่อน', 'legend residue → text.legendNote');
  t.eq(r.doc.verdict, { extraCells: [{ k: 'จุดทยอยสะสม', v: 'ใต้มูลค่าเหมาะสม' }] }, '3rd vcell → verdict.extraCells');
  t(!r.eq.textLost.includes('จุดทยอยสะสม') && !r.eq.textLost.includes('เส้นประ'), 'carried words not lost', JSON.stringify(r.eq.textLost));
}
// forward-labelled pe base → inputs.base + baseLabel (+ fundamentals.epsForward from the leg when absent)
{
  const html = raw('CASY').replace('EPS adj. $19.16 × P/E', 'EPS FY2026E consensus $19.16 × P/E');
  const r = runH('CASY', html), leg = r.doc.legs[0];
  t.eq([leg.inputs.base, leg.baseLabel, r.doc.fundamentals.epsForward], ['epsForward', 'FY2026E consensus', 19.16], 'forward base detected · baseLabel · epsForward from the leg');
  t(!leg.override || leg.override.eps == null, 'no override.eps next to a forward base', JSON.stringify(leg.override));
  t(Math.abs(r.view.legs[0].value - 19.16 * leg.inputs.multiple) < 1e-9, 'value = forward EPS × multiple (unchanged number)');
  t(!r.eq.textLost.includes('FY2026E') && !r.eq.textLost.includes('consensus'), 'FY2026E consensus not lost (printed by the base label)', JSON.stringify(r.eq.textLost));
  t.eq(A.baseOf('EPS TTM $5.10 × P/E 20x', { eps: 5.1 }), null, 'TTM base → null (base eps)');
  t.eq(A.baseOf('EPS (FY2026e, consensus) $10.25 × P/E 15x', { eps: 9 }), { base: 'epsForward', label: 'FY2026e consensus', v: 10.25 }, 'AZN shape → forward');
  t.eq(A.baseOf('EPS FY2025 $6.50 × P/E 20x', { eps: 6.13, fy: { period: 'FY2025', eps: 6.5 } }), { base: 'epsFy', label: null, v: 6.5 }, 'FY actual equal to fundamentals.fy.eps → epsFy');
}
// ffoBasis from author wording (spec §3.7 ก)
{
  const P0 = (cards, legs, top) => ({ s1cards: cards.map((k) => ({ k, v: '', d: '' })), legs: legs.map(([mname, mdesc]) => ({ mname, mdesc })), s6cols: [{ top: ['Bear', top], lis: [] }] });
  t.eq(A.ffoBasisOf(P0(['P/AFFO (TTM)'], [['1. P/AFFO', 'AFFO/หุ้น $4.10 × 18x']], 'AFFO +2%/ปี')), 'affo', 'AFFO wording → affo');
  t.eq(A.ffoBasisOf(P0([], [['1. P/Core FFO', 'Core FFO $6.20 × 21x']], 'Core FFO +3%/ปี')), 'coreFfo', 'Core FFO wording → coreFfo');
  t.eq(A.ffoBasisOf(P0([], [['1. P/FFO', 'FFO $3 × 15x'], ['2. P/AFFO', 'AFFO $2.5 × 18x']], 'FFO +1%/ปี')), null, 'mixed FFO + AFFO → null (not guessed)');
  t.eq(A.ffoBasisOf(P0(['P/E'], [['1. P/E', 'EPS $3 × 15x']], 'EPS +1%/ปี')), null, 'no FFO wording → null');
}
// driver / exit mapping (spec §3.7 ก)
{
  const d = (s) => (MS.DRIVER.find(([, re]) => re.test(s)) || [null])[0], e = (s) => (MS.EXIT.find(([, re]) => re.test(s)) || [null])[0];
  t.eq([d('EBITDA +6%/ปี'), d('Core FFO +3%/ปี'), d('Rev +6%/ปี')], ['ebitdaPerShare', 'ffo', 'revenuePerShare'], 'DRIVER: EBITDA before revenue/eps');
  t.eq([e('EV/EBITDA ออก'), e('Exit EV/EBITDA'), e('EV/Revenue ออก'), e('EV/Sales ทางออก')], ['evebitda', 'evebitda', 'evsales', 'evsales'], 'EXIT: EV/EBITDA · EV/Revenue ≡ evsales');
  t.eq(d('EBITDA margin 6.2%'), 'ebitdaPerShare', 'EBITDA margin maps the driver word only — growth stays unreadable (residual, D5)');
  // growth ของเซลล์ margin ต้องอ่านไม่ได้ (ไม่ใช่ 6.2%/ปี) → H — IVL shape
  { const P6 = { rd: { values: { px: 10 } }, s6cols: ['bear', 'base', 'bull'].map((n, i) => ({ name: n, top: [n, `EBITDA margin ${6 + i}.2%`], lis: [['EBITDA ปี 3', '฿28', '฿28'], ['EV/EBITDA ออก', '11.5x', '11.5x'], ['สถานการณ์', 'x', 'x']], retHtml: '' })), s6paras: ['n'] };
    const sc = MS.scenarios(P6, { ebitda: 1e9, shares: 1e8 }, []);
    t(sc.scenarios.cases.every((c) => c.growth == null) && sc.H.some((h) => /cases\[0\]\.growth unreadable \("EBITDA margin 6\.2%"\)/.test(h)), 'EBITDA margin cell → growth unreadable (H), never read as %/ปี', JSON.stringify(sc.H)); }
}
// context-suffix reasoning → legs[i].note · marker words are synonyms (Task 4)
{
  const html = raw('CASY').replace('<div class="mname">3. Justified P/BV', '<div class="mname">3. Justified P/BV (บริบท — ห่างจากขายึดตลาด >2× ไม่รวมในกรอบ)');
  const r = runH('CASY', html);
  t.eq([r.doc.legs[2].role, r.doc.legs[2].label], ['context', 'Justified P/BV'], 'context leg · author label without the suffix');
  t(/^ห่างจากขายึดตลาด >2×/.test(r.doc.legs[2].note || ''), 'suffix reasoning prepended to legs[2].note', r.doc.legs[2].note);
  t(!['บริบท', 'ไม่รวมในกรอบ', 'ห่างจากขายึดตลาด'].some((w) => r.eq.textLost.includes(w)), 'no context word lost', JSON.stringify(r.eq.textLost));
}
// qualifierOf round 3 — author words left in the formula head are carried; formula words and consumed words are not
{
  t(/midcycle/.test(A.qualifierOf('EPS $5.10 × P/E midcycle 22x')), 'round 3: head word "midcycle" carried');
  t.eq(A.qualifierOf('EPS $5.10 × P/E 22x'), '', 'round 3: pure formula → nothing');
  const FM = require('../../tools/migrate-v3/formula.js');
  // fix round 1 (ruling I-1): "guidance" ที่ baseOf ไม่ได้กิน = คำฐาน (SY.QUALIFIER_BLOCK) → ท่อนนี้ไม่พกอะไร · ที่กินแล้ว = ไม่พิมพ์ซ้ำ (ป้ายฐานพิมพ์เอง)
  //  brief ปัก "guidance ถูกพก" ไว้ — เป็นไปไม่ได้ภายใต้ ruling (คำที่ baseOf กิน = ไม่พกโดยนิยาม) ⇒ แทนด้วย negative + positive ของคำอื่น
  const q3 = A.qualifierOf('EPS FY2026E $5.10 × P/E guidance 22x', new Set([FM.keyOf('FY2026E')]));
  t.eq(q3, '', 'round 3 (ruling I-1): unconsumed "guidance" → nothing carried from the head (stays TEXT LOST)');
  const q3b = A.qualifierOf('EPS FY2026E guidance $5.10 × P/E midcycle 22x', new Set(['FY#E', 'guidance'].map((x) => x.toLowerCase())));
  t(!/FY2026E|guidance/.test(q3b) && /midcycle/.test(q3b), 'round 3: consumed keys (baseLabel · guidance) are not repeated · other head words carried', q3b);
}
// .ret round 2 (Review Focus 5): per-year → perYear · pre-anchor words → retNote · numeric equal → carried · numeric far → H
{
  const r0 = runH('CASY', raw('CASY'));
  const tot = r0.view.d.scenarios.map((s) => s.total);
  const cagr = tot.map((x) => (Math.pow(1 + x / 100, 1 / 3) - 1) * 100);
  const py = raw('CASY').replace(/\{\{rd:sc(\d)ret\}\}/g, (m0, i) => `${m0} (3 ปี) ~${cagr[i - 1].toFixed(1)}%/ปี`);
  const r = runH('CASY', py);
  t.eq(r.doc.scenarios.perYear, 'cagr', 'per-year notes on every column → perYear cagr');
  t(r.doc.scenarios.cases.every((c) => c.retNote === '(3 ปี)') && !r.notes.H.some((h) => /\.ret annotation/.test(h)), 'per-year figure not copied · "(3 ปี)" kept as retNote', JSON.stringify(r.doc.scenarios.cases.map((c) => c.retNote)));
  const pre = raw('CASY').replace('{{rd:sc2ret}}', 'Total {{rd:sc2ret}} capital');
  t.eq(runH('CASY', pre).doc.scenarios.cases[1].retNote, 'capital', 'pre-anchor "Total" = synonym (not carried) · post-anchor "capital" carried');
  const numOk = raw('CASY').replace('{{rd:sc2ret}}', `{{rd:sc2ret}} (capital) / ${tot[1] >= 0 ? '+' : '−'}${Math.abs(tot[1]).toFixed(1)}% total`);
  const rn = runH('CASY', numOk);
  t(rn.doc.scenarios.cases[1].retNote === '(capital) total' && !rn.notes.H.some((h) => /\.ret annotation/.test(h)), 'numeric note equal to the v3 total within printed rounding → carried without the number', JSON.stringify({ n: rn.doc.scenarios.cases[1].retNote, H: rn.notes.H }));
  const numBad = raw('CASY').replace('{{rd:sc2ret}}', `{{rd:sc2ret}} (capital) / +${(Math.abs(tot[1]) + 9).toFixed(1)}% total`);
  t(runH('CASY', numBad).notes.H.some((h) => /scenarios\.cases\[1\] \.ret annotation .* not carried/.test(h)), 'numeric note ≠ v3 total → H stays (residual)');
}
// price-bound custom card → tokenised by D3 exact match (no H) · a non-matching literal still H
{
  const r0 = runH('CASY', raw('CASY'));
  const pe = K.renderCard('pe', r0.view).v;
  const card = (v) => `<div class="metric"><div class="k">GAAP P/E (TTM)</div><div class="v">${v}</div><div class="d">บน EPS GAAP</div></div>`;
  const inject = (v) => raw('CASY').replace(/(<div class="grid g4">\s*)/, `$1${card(v)}\n      `);
  const r = runH('CASY', inject(pe));
  const c = r.doc.metrics.custom.find((x) => x.label === 'GAAP P/E (TTM)');
  // {{pe}} ไม่มี "x" ต่อท้าย (tools/v3/tokens.js — รูปเดียวกับ {{pbv}}/{{pffo}}) ⇒ "32.1x" → "{{pe}}x" (brief เขียน '{{pe}}' — render ออกมาไม่มี x)
  t(c && c.value === '{{pe}}x' && !r.notes.H.some((h) => /price-bound custom card/.test(h)), 'custom value equal to {{pe}} → tokenised, no H', JSON.stringify({ c, H: r.notes.H }));
  t.eq(require('../../tools/v3/prose.js').renderProse(c.value, r.view), pe, 'tokenised custom value renders the same text as the pe card');
  // D3 = เท่ากันทุก byte เท่านั้น — literal ที่ไม่เท่าค่าที่ render ไม่ถูกแปลงเป็น token (คงตัวเลขผู้เขียน)
  const r2 = runH('CASY', inject('30.0x')), c2 = r2.doc.metrics.custom.find((x) => x.label === 'GAAP P/E (TTM)');
  t(c2 && c2.value === '30.0x', 'custom value ≠ rendered pe → literal kept (not tokenised)', JSON.stringify(c2));
}
// fy periods conflict → latest + F (no H)
{
  const html = raw('BBL').replace(/(<div class="grid g4">\s*)/, '$1<div class="metric"><div class="k">EPS FY2024</div><div class="v">฿20.10</div><div class="d">งบปี 2024</div></div>\n      ');
  const r = runH('BBL', html);
  t(r.doc.fundamentals.fy.period === 'FY2025' && !r.notes.H.some((h) => /fy periods conflict/.test(h)) && r.notes.F.some((f) => /fy periods differ .* kept FY2025 \(latest\)/.test(f)), 'fy conflict → latest period + F', JSON.stringify({ fy: r.doc.fundamentals.fy, H: r.notes.H }));
}
// ── Plan 4c-prep Task 5 — self-review negatives (detections that must NOT fire) ──
{
  // gdots: any glyph-only line (◆ ◆ ◆ · ◉ · ★ — 46+ corpus docs) is decoration, never a sectorLine
  t(!('sectorLine' in runH('SRE', raw('SRE').replace(/<div class="gdots">[^<]*<\/div>/, '<div class="gdots">◆ ◆ ◆</div>')).doc.meta), 'glyph-only gdots (◆ ◆ ◆) → no sectorLine');
  // baseOf: FY actual ≠ fundamentals.fy.eps → null · no EPS word / no money → null
  t.eq(A.baseOf('EPS FY2025 $6.50 × P/E 20x', { eps: 6.13, fy: { period: 'FY2025', eps: 6.13 } }), null, 'FY actual not equal to fy.eps → null (stays TTM path)');
  t.eq(A.baseOf('FCF/หุ้น FY2026E $4 × 20x', {}), null, 'no EPS word → null');
  t.eq(A.baseOf('EPS forward $5.00 × P/E 20x', {}).label, null, 'bare "forward" → no baseLabel (render prints "(forward)" itself)');
  // a forward base never becomes fundamentals.eps (TTM) — BBL has no values.eps, its only pe leg becomes forward
  const r = runH('BBL', raw('BBL').replace('Normalized EPS ~฿22 × P/E', 'EPS FY2026E ~฿22 × P/E'));
  t(r.doc.fundamentals.eps == null && r.doc.fundamentals.epsForward === 22 && r.doc.legs[0].inputs.base === 'epsForward', 'forward pe base → epsForward only · fundamentals.eps stays absent', JSON.stringify({ eps: r.doc.fundamentals.eps, fwd: r.doc.fundamentals.epsForward }));
  // extractor base ≠ the money baseOf reads ($9.99 × 20 ≠ $100 → extractor falls back to fundamentals.eps) → base not applied
  const lg = A.legsOf({ legs: [{ mname: '1. P/E', mdesc: 'EPS FY2026E $9.99 × P/E 20x', mval: '$100', mdescHtml: '' }] }, { eps: 5 }, 'USD');
  t(lg.legs[0] && lg.legs[0].inputs.base == null, 'base applied only when the extracted base = the money baseOf read', JSON.stringify(lg.legs[0]));
}
{
  // perYearOf: a pair that fits neither formula → null (ruling) · linear only when every column fits linear and not CAGR · rd-token anchor → null
  const P = (x) => ({ perYear: x });
  t.eq(MS.perYearOf([P(9.1), P(9.1), P(9.1)], [30, 30, 30], 3), 'cagr', 'perYear: 9.1%/ปี on +30% total (cagr 9.14) → cagr');
  t.eq(MS.perYearOf([P(10), P(10), P(10)], [30, 30, 30], 3), 'linear', 'perYear: 10%/ปี on +30% (= total/3, not cagr) → linear');
  t.eq(MS.perYearOf([P(15), P(9.1), P(9.1)], [30, 30, 30], 3), null, 'perYear: a printed pair that fits neither formula → null (never cagr — ruling)');
  t.eq(MS.perYearOf([P('anchor'), P('anchor'), P('anchor')], [30, 30, 30], 3), null, 'perYear: /ปี on the v2 total token ({{rd:scNret}}) → null (no per-year number was printed)');
  t.eq(MS.perYearOf([P(9.1), P(9.1), null], [30, 30, 30], 3), null, 'perYear: per-year label on only some columns → null');
  t.eq(MS.retParts('+8.5% ต่อปี').perYear, 8.5, 'retParts: literal anchor + "ต่อปี" → the anchor is the per-year number');
  // per-year label on only some columns → the 4b H stays for those columns
  const r0 = runH('CASY', raw('CASY')), tot = r0.view.d.scenarios.map((x) => x.total);
  const one = raw('CASY').replace('{{rd:sc1ret}}', `{{rd:sc1ret}} ~${((Math.pow(1 + tot[0] / 100, 1 / 3) - 1) * 100).toFixed(1)}%/ปี`);
  const r1 = runH('CASY', one);
  t(r1.doc.scenarios.perYear == null && r1.notes.H.some((h) => /scenarios\.cases\[0\] \.ret annotation .*not carried/.test(h)), 'per-year on one column only → perYear stays null · H for that column', JSON.stringify(r1.notes.H));
}
{
  // extra vcells > 2 → H, none carried · legend annotation > 80 → H, not carried
  const vc = (k) => `<div class="vcell"><div class="k">${k}</div><div class="v">ข้อความ</div></div>`;
  const three = raw('CASY').replace(/(<div class="vgrid">[\s\S]*?)(\n\s*<\/div>\s*<div class="zone">)/, `$1\n        ${vc('ช่องหนึ่ง')}${vc('ช่องสอง')}${vc('ช่องสาม')}$2`);
  const r = runH('CASY', three);
  t(!r.doc.verdict && r.notes.H.some((h) => /s8 vcells 6 > 5 — extra cells not carried/.test(h)), '3 extra vcells → H, verdict absent', JSON.stringify(r.notes.H));
  const long = raw('CASY').replace(/(จุดสำคัญ<\/span>)/, `$1\n        <span>${'ยาวมาก '.repeat(14)}</span>`);
  const r2 = runH('CASY', long);
  t(!(r2.doc.text || {}).legendNote && r2.notes.H.some((h) => /legend annotation \d+ > 80 chars/.test(h)), 'legend annotation > 80 → H, not carried');
  // leg label > 80 → cut at the last top-level "(" before 80 · tail to the note
  const lbl = 'P/E Valuation ' + 'ก'.repeat(50) + ' (หางคำอธิบายของผู้เขียนที่ยาวเกินกว่าช่องชื่อ)';
  const r3 = runH('CASY', raw('CASY').replace('<div class="mname">1. P/E Valuation</div>', `<div class="mname">1. ${lbl}</div>`));
  t(r3.doc.legs[0].label.length <= 80 && /^\(หางคำอธิบายของผู้เขียนที่ยาวเกินกว่าช่องชื่อ\)/.test(r3.doc.legs[0].note || ''), 'label > 80 → cut at "(" · tail prepended to the note', JSON.stringify(r3.doc.legs[0]));
  // AFFO wording lands in fundamentals.ffoBasis on the assembled doc (not only the helper)
  t.eq(A.ffoBasisOf({ s1cards: [], legs: [], s6cols: [] }), null, 'ffoBasisOf: empty → null');
}

{
  // round 3 never carries fact words (SY.FACT_WORDS — need a Kind 1 home, 4b I-3), unit words, or HTML tags
  t.eq(A.qualifierOf('EPS $5.10 × P/E Tangible midcycle 22x'), '', 'round 3 (ruling I-1): a fact word in the head → nothing carried from it (TEXT LOST → HUMAN)');
  // fix round 1 (ruling I-1): closed QUALIFIER_BLOCK list · corpus shapes
  const SYq = require('../../tools/migrate-v3/synonyms.js');
  for (const w of ['forward', 'Forward', 'fwd', 'Fwd', 'consensus', 'guidance', 'guide', 'est.', 'FY2026E', 'FY26E', '2026e', 'คาดการณ์', 'ประมาณการ', 'ล่วงหน้า', 'non-GAAP', 'nonGAAP', 'adjusted', 'adj', 'adj.', 'oper.', 'core', 'หลัก', 'ปกติ', 'FFOA', 'FFOAA', 'fwd.', 'ปีงบนี้', 'ปีงบปัจจุบัน', 'ปีหน้า', 'underlying'])
    t(SYq.qualifierBlocked(w), `QUALIFIER_BLOCK covers "${w}"`);
  t(SYq.QUALIFIER_BLOCK.every((e) => e.id && e.re instanceof RegExp && e.why), 'QUALIFIER_BLOCK: every entry has id · re · why');
  t(!SYq.qualifierBlocked('midcycle') && !SYq.qualifierBlocked('เฉลี่ย'), 'QUALIFIER_BLOCK: plain qualifiers not blocked');
  const legOf = (mdesc, mval, f) => A.legsOf({ legs: [{ mname: '1. P/E Valuation', mdesc, mval, mdescHtml: mdesc }] }, f, 'USD').legs[0];
  const zs = legOf('EPS non-GAAP $4.88 (FY27 guide) × P/E 32x — สมอคือ P/E เฉลี่ยรอบปีงบ', '$156', { eps: 4.88 });
  t(zs && !zs.inputs.base && !/non-GAAP/.test(zs.note || '') && /สมอคือ/.test(zs.note || ''), 'ZS shape: "non-GAAP" (no base) not carried — stays TEXT LOST', JSON.stringify(zs));
  const centel = legOf('EPS ปกติคาดการณ์ ฿1.62 (FY2026E ฉันทามติ vendor; FY2025 จริง ฿1.48) × P/E เป้าหมาย 20x', '฿32.40', { eps: 1.62 });
  t(centel && !centel.inputs.base && !/ปกติคาดการณ์/.test(centel.note || ''), 'CENTEL shape: "ปกติคาดการณ์" (no base) not carried', JSON.stringify(centel));
  const cb = legOf('ปรับ combined ratio เป็น 88% (ระดับ "ปกติ" ในระยะยาว) → Normalized core EPS ~$23 × P/E 14x (รวม Asia Life growth premium)', '$322', { eps: 23 });
  t(cb && /^ปรับ combined ratio เป็น 88% \(ระดับ "ปกติ" ในระยะยาว\) · รวม Asia Life growth premium$/.test(cb.note || ''), 'CB shape: prose lead-in before "→" carried whole · no fragment ("combined · เป็น")', JSON.stringify(cb && cb.note));
  t.eq(A.qualifierOf('EPS ฉาก $2.34 × P/E 26.7x'), '', 'single-token residue ("ฉาก") not carried');
  t.eq(A.qualifierOf('EBITDA Base $1,134M × EV/EBITDA 11.5x'), '', 'single-token residue ("Base") not carried');
  t.eq(A.qualifierOf('EPS $5.10 forward × P/E 22x'), '', 'round 3: "forward" without a detected base is not carried');
  t.eq(A.qualifierOf('รายได้ $1,234 ล้าน × P/S 3x'), '', 'round 3: a standalone unit word (ล้าน) is not an author word');
  t.eq(A.qualifierOf('<b>EPS</b> $5.10 × P/E <b>midcycle</b> 22x'), 'midcycle', 'round 3: HTML tags stripped (no orphan <b>)');
  t.eq(A.qualifierOf('EPS $5.10 × P/BV 2x'), '', 'round 3: ratio names with "/" are not split into words ("BV")');
  // fy latest: BE years and two spellings of one year compare by year
  const P0 = (cards) => ({ sm: { currency: 'USD' }, rd: { values: {} }, s1cards: cards.map(([k, v]) => ({ k, v, d: '', vHtml: v, dHtml: '' })) });
  const cf = MC.cardFund(P0([['Net Income FY2025', '$1.00B'], ['EPS FY25', '$2.00'], ['Revenue FY68', '$9.00B']]), {});
  t.eq([cf.fy && cf.fy.netIncome, cf.fy && cf.fy.eps, cf.fy && cf.fy.revenue], [1e9, 2, 9e9], 'fy: FY2025 / FY25 / FY68 (BE 2568) = one period → all kept', JSON.stringify(cf));
}
// ── Plan 4c-prep Task 5 fix round 1 — I-2 / I-3 / minor (fail closed) ──
{
  const vcell = (k, v) => `<div class="vcell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const withCell = (html, cell) => html.replace(/(<div class="vgrid">[\s\S]*?)(\n\s*<\/div>\s*<div class="zone">)/, `$1\n        ${cell}$2`);
  // I-2: template key + author qualifier (MPC) → H, no extraCells
  const mpc = runH('CASY', raw('CASY').replace('<div class="k">มูลค่าเหมาะสม</div>', '<div class="k">มูลค่าเหมาะสม (normalized)</div>'));
  t(!mpc.doc.verdict && mpc.notes.H.some((h) => /s8 vcell "มูลค่าเหมาะสม \(normalized\)" repeats a template cell/.test(h)), 'I-2 MPC shape: "มูลค่าเหมาะสม (normalized)" → H, not an extra cell', JSON.stringify({ v: mpc.doc.verdict, H: mpc.notes.H }));
  // I-2: WORK shape — "เป้าเฉลี่ย 12 ด." is the analyst cell under another name → H
  const work = runH('CASY', withCell(raw('CASY'), vcell('เป้าเฉลี่ย 12 ด.', '฿8.45 (Yahoo, 2 นักวิเคราะห์)')));
  t(!work.doc.verdict && work.notes.H.some((h) => /s8 vcell "เป้าเฉลี่ย 12 ด\." repeats a template cell/.test(h)), 'I-2 WORK shape: "เป้าเฉลี่ย 12 ด." → H', JSON.stringify(work.notes.H));
  // a genuine author cell (different key, no price literal) is still carried
  const ok = runH('CASY', withCell(raw('CASY'), vcell('จุดทยอยสะสม', 'ใต้มูลค่าเหมาะสม')));
  t.eq(ok.doc.verdict, { extraCells: [{ k: 'จุดทยอยสะสม', v: 'ใต้มูลค่าเหมาะสม' }] }, 'I-2: a genuine author cell is still carried');
  // minor: price-bound literal in an extra cell (SMPC yield · TKC 52-week) → H, not carried
  const smpc = runH('CASY', withCell(raw('CASY'), vcell('เงินปันผล', '~6.86% ต่อปี (฿0.70/หุ้น)')));
  t(!smpc.doc.verdict && smpc.notes.H.some((h) => /verdict\.extraCells "เงินปันผล" holds a price-bound literal/.test(h)), 'minor SMPC shape: yield % in an extra cell → H', JSON.stringify(smpc.notes.H));
  const tkc = runH('CASY', withCell(raw('CASY'), vcell('กรอบ 52 สัปดาห์', '฿7.20–฿11.40')));
  t(!tkc.doc.verdict && tkc.notes.H.some((h) => /verdict\.extraCells "กรอบ 52 สัปดาห์" holds a price-bound literal/.test(h)), 'minor TKC shape: 52-week range → H');
  // I-3: legend residue with a value / token / "ราคา <…>" / fair-value key → H, not carried
  const leg = (from, to) => runH('CASY', raw('CASY').replace(from, to));
  const mpcL = leg('มูลค่าเหมาะสม {{rd:fv}}</span>', 'มูลค่าเหมาะสม (normalized) {{rd:fv}}</span>');
  t(!(mpcL.doc.text || {}).legendNote && mpcL.notes.H.some((h) => /legend annotation .* not carried — token/.test(h)), 'I-3 MPC shape: qualifier + {{fv}} → H', JSON.stringify(mpcL.notes.H));
  const fang = leg('มูลค่าเหมาะสม {{rd:fv}}</span>', 'มูลค่าเหมาะสม mid-cycle {{rd:fv}}</span>');
  t(!(fang.doc.text || {}).legendNote && fang.notes.H.some((h) => /legend annotation "mid-cycle/.test(h)), 'I-3 FANG shape: "mid-cycle {{fv}}" → H');
  const lanc = leg('ราคา CASY</span>', 'ราคา CASY/MZTI</span>');
  t(!(lanc.doc.text || {}).legendNote && lanc.notes.H.some((h) => /legend annotation .*"ราคา <…>" phrase/.test(h)), 'I-3 LANC shape: "ราคา CASY/MZTI" → H', JSON.stringify(lanc.notes.H));
  const stec = leg('ราคา CASY</span>', 'ราคา CASYX</span>');
  t(!(stec.doc.text || {}).legendNote && stec.notes.H.some((h) => /legend annotation "ราคา CASYX"/.test(h)), 'I-3 STEC shape: printed ticker ≠ symbol → H');
  const plain = leg('จุดสำคัญ</span>', 'จุดสำคัญ</span>\n        <span>เส้นประ = รอบก่อน</span>');
  t.eq((plain.doc.text || {}).legendNote, 'เส้นประ = รอบก่อน', 'I-3: plain author-word residue still carried');
}
// ── Plan 4c-prep Task 5 fix round 2 — lead-in basis/money · analyst siblings · template tokens · multiples ──
{
  t.eq(A.qualifierOf('EPS forward $5.10 → × P/E 22x'), '', 'round 2: lead-in with an unconsumed "forward" → nothing carried');
  t.eq(A.qualifierOf('non-GAAP EPS $4.88 ⇒ × 32x'), '', 'round 2: lead-in with "non-GAAP" → nothing carried');
  t.eq(A.qualifierOf('ปันผล forward D₁ = ปันผล $2.10 × (1+g); g 3%, r 8%'), '', 'round 2: PKG shape (lead-in "ปันผล forward D₁") → nothing carried from it');
  t.eq(A.qualifierOf('FCF ฐานของบริษัทปีนี้ ~$2.0B → FCF × 20x'), '', 'round 2: HON shape (lead-in with a money literal) → not carried');
  t.eq(A.qualifierOf('ปรับ combined ratio เป็น 88% → EPS $23 × P/E 14x'), 'ปรับ combined ratio เป็น 88%', 'round 2: CB lead-in (no basis word · % only) still carried whole');
  const vcell = (k, v) => `<div class="vcell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const withCell = (cell) => raw('CASY').replace(/(<div class="vgrid">[\s\S]*?)(\n\s*<\/div>\s*<div class="zone">)/, `$1\n        ${cell}$2`);
  const snc = runH('CASY', withCell(vcell('เป้าประเมิน 12 ด.', 'Buy 5 ราย')));
  t(!snc.doc.verdict && snc.notes.H.some((h) => /"เป้าประเมิน 12 ด\." is an analyst-slot sibling/.test(h)), 'round 2: SNC shape analyst sibling key → H', JSON.stringify(snc.notes.H));
  const apure = runH('CASY', withCell(vcell('เป้าหมายกรณีฟื้นตัว', '~{{rd:fv}} (Speculative)')));
  t(!apure.doc.verdict && apure.notes.H.some((h) => /"เป้าหมายกรณีฟื้นตัว" value repeats a template cell token/.test(h)), 'round 2: APURE shape ({{fv}} value) → H', JSON.stringify(apure.notes.H));
  const vr = runH('CASY', withCell(vcell('EV/EBITDA (บริบท)', '9.5 เท่า — กลุ่ม 11.3–24.6')));
  t(!vr.doc.verdict && vr.notes.H.some((h) => /verdict\.extraCells "EV\/EBITDA \(บริบท\)" holds a price-bound literal/.test(h)), 'round 2: VRANDA shape (current multiple) → H', JSON.stringify(vr.notes.H));
  t.eq(runH('CASY', withCell(vcell('จุดทยอยสะสม', 'ใต้มูลค่าเหมาะสม'))).doc.verdict, { extraCells: [{ k: 'จุดทยอยสะสม', v: 'ใต้มูลค่าเหมาะสม' }] }, 'round 2: genuine author cell still carried');
}
t.done();
