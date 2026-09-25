'use strict';
const t = require('./_t.js')('schema');
const S = require('../../tools/v3/schema.js');
const base = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
const paths = (errs) => errs.map((e) => e.path);

t.eq(S.validate(base()), [], 'fixture ZTS is valid');
t.eq(S.validate(JSON.parse(JSON.stringify(require('../fixtures/v3/BBL.json')))), [], 'fixture BBL is valid');

{ const d = base(); d.surprise = 1; t(paths(S.validate(d)).includes('surprise'), 'unknown top-level key rejected'); }
{ const d = base(); d.fundamentals.epsx = 1; t(paths(S.validate(d)).includes('fundamentals.epsx'), 'unknown fundamentals key rejected'); }
{ const d = base(); d.legs[0].method = 'magic'; t(paths(S.validate(d)).includes('legs[0].method'), 'method enum'); }
{ const d = base(); d.legs[0].inputs.multipleSource = 'current'; t(paths(S.validate(d)).includes('legs[0].inputs.multipleSource'), 'current multiple is not a legal source (dead anchor)'); }
{ const d = base(); delete d.legs[0].inputs.multiple; t(paths(S.validate(d)).includes('legs[0].inputs.multiple'), 'required leg input'); }
{ const d = base(); d.legs = [d.legs[0]]; t(paths(S.validate(d)).includes('legs'), 'needs ≥2 legs'); }
{ const d = base(); d.fvWeights = [0.7, 0.7]; t(paths(S.validate(d)).includes('fvWeights'), 'weights must sum to 1'); }
{ const d = base(); d.legs[0].override = { eps: 7 }; t(paths(S.validate(d)).includes('legs[0].override.why'), 'override needs why'); }
{ const d = base(); d.scenarios.cases.pop(); t(paths(S.validate(d)).includes('scenarios.cases'), 'exactly 3 cases'); }
{ const d = base(); d.catalysts = ['a', 'b']; t(paths(S.validate(d)).includes('catalysts'), '3–8 catalysts'); }
{ const d = base(); d.extras = [1, 2, 3].map(() => ({ after: 'valuation', title: 'x', headers: ['a'], rows: [['b']] })); t(paths(S.validate(d)).includes('extras'), '≤2 extras'); }
{ const d = base(); d.meta.aiModel = 'GPT 5'; t(paths(S.validate(d)).includes('meta.aiModel'), 'ai model format'); }
{ const d = base(); d.market.px = -1; t(paths(S.validate(d)).includes('market.px'), 'px > 0'); }
{ const d = base(); d.metrics.cards.push('nope'); t(paths(S.validate(d)).includes('metrics.cards[12]'), 'card key must be in catalogue list'); }
{ const d = base(); d.legs.push({ method: 'ri', label: 'RI', inputs: { r: 9, years: 5, payout: 150 } }); t(paths(S.validate(d)).includes('legs[2].inputs.payout'), 'ri payout must be 0–100 (percent units)'); }
t.eq(S.OWNER('market.px'), 'cron', 'market is cron-owned');
t.eq(S.OWNER('_sig'), 'io', '_sig is io-owned');
t.eq(S.OWNER('legs[0].inputs.multiple'), 'worker', 'rest is worker-owned');

// Plan 2a Task 1 — {{lit:}} ↔ meta.litReasons (ruling R1: object map literal → reason)
{ const d = base(); d.prose.chart = 'IPO {{lit:$17.00}}'; t(paths(S.validate(d)).includes('prose.chart'), 'lit without a reason → error at the prose path'); }
{ const d = base(); d.prose.chart = 'IPO {{lit:$17.00}}'; d.meta.litReasons = { '$17.00': 'ราคา IPO ปี 2556 (ข้อมูลประวัติ)' }; t.eq(S.validate(d), [], 'lit + reason → valid'); }
{ const d = base(); d.meta.litReasons = { '$17.00': 'ราคา IPO ปี 2556' }; t(paths(S.validate(d)).includes('meta.litReasons["$17.00"]'), 'reason no lit uses → error'); }
{ const d = base(); d.prose.chart = 'IPO {{lit:$17.00}}'; d.meta.litReasons = { '$17.00': 'x' }; t(paths(S.validate(d)).includes('meta.litReasons["$17.00"]'), 'reason shorter than 5 chars → error'); }
{ const d = base(); d.prose.chart = 'bad {{lit:{{px}}}}'; t(paths(S.validate(d)).includes('prose.chart'), 'Review Focus #1: nested lit → path-named schema error'); }
{ const d = base(); d.meta.litReasons = ['x']; t(paths(S.validate(d)).includes('meta.litReasons'), 'litReasons must be an object'); }
// fix round 1 — malformed nested entries must return path-named errors, never throw
{
  const d = base(); d.metrics.custom = [null];
  let errs;
  try { errs = S.validate(d); } catch (e) { t(false, `metrics.custom[i]=null must not throw — threw ${e.message}`); }
  t(errs && paths(errs).includes('metrics.custom[0]'), 'metrics.custom[0]=null returns path-named error');
}
{
  const d = base(); d.scenarios.cases = [null, d.scenarios.cases[1], d.scenarios.cases[2]];
  let errs;
  try { errs = S.validate(d); } catch (e) { t(false, `scenarios.cases[i]=null must not throw — threw ${e.message}`); }
  t(errs && paths(errs).includes('scenarios.cases[0]'), 'scenarios.cases[0]=null returns path-named error');
}
{
  const d = base();
  d.extras = [{ after: 'valuation', title: 'x', headers: ['a', 'b'], rows: [null, ['b', 1]], sumCol: 1 }];
  let errs;
  try { errs = S.validate(d); } catch (e) { t(false, `extras rows with null row must not throw — threw ${e.message}`); }
  t(errs && paths(errs).includes('extras[0].sumCol'), 'extras[0] with null row returns path-named sumCol error');
}
// Plan 2a Task 2 — #50 allowlist ชุดเดียวกับ build.js (tools/safe-values.js)
{ const d = base(); d.meta.themeLegacy = { accent: 'red;}</style><script>x', accentDark: '#000', darkGrad: 'linear-gradient(135deg,#000 0%,#111 100%)', glow: '#000', subColor: '#000', headerMuted: '#000', verdictText: '#000', vcellLabel: '#000' };
  t(paths(S.validate(d)).includes('meta.themeLegacy.accent'), 'themeLegacy colour outside allowlist → error'); }
{ const d = base(); d.meta.themeLegacy = { accent: '#000', accentDark: '#000', darkGrad: 'url(javascript:x)', glow: '#000', subColor: '#000', headerMuted: '#000', verdictText: '#000', vcellLabel: '#000' };
  t(paths(S.validate(d)).includes('meta.themeLegacy.darkGrad'), 'darkGrad must be colour/gradient'); }
{ const d = base(); d.market.chart.gridFmt = 'alert(1)'; t(paths(S.validate(d)).includes('market.chart.gridFmt'), 'gridFmt allowlist'); }
{ const d = base(); d.market.chart.dataFmt = 'v.toFixed(1)'; t(paths(S.validate(d)).includes('market.chart.dataFmt'), 'dataFmt must use d[1]'); }
{ const d = base(); d.market.chart.gridFmt = 'v.toFixed(0)'; d.market.chart.dataFmt = 'Math.round(d[1])'; t.eq(S.validate(d), [], 'legal formats pass'); }
for (const f of ['BBL-real', 'EQIX-real', 'FER-real', 'ZTS-real'])
  t.eq(S.validate(JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)))), [], `${f} themeLegacy passes the allowlist`);
// Plan 2a Task 3 — text.* (§3.6 A)
{ const d = base(); d.text = { valHint: 'SOTP + DDM', valIntro: 'ย่อหน้า', metricsNote: 'หมายเหตุ', disclaimerAssump: 'อัตราคิดลด (r)' }; t.eq(S.validate(d), [], 'text.* all optional prose'); }
{ const d = base(); d.text = { valHnt: 'x' }; t(paths(S.validate(d)).includes('text.valHnt'), 'text is closed'); }
{ const d = base(); d.text = { valHint: 'x'.repeat(81) }; t(paths(S.validate(d)).includes('text.valHint'), 'valHint ≤ 80 chars'); }
{ const d = base(); d.text = { valIntro: 'IPO {{lit:$1.00}}' }; t(paths(S.validate(d)).includes('text.valIntro'), 'text.* is a prose field (lit reason check reaches it)'); }
{ const d = base(); d.text = {}; t.eq(S.validate(d), [], 'text: {} is valid'); }
{ const d = base(); d.text = null; t.eq(S.validate(d), [], 'text: null = absent (like every other optional block)'); }
{ const d = base(); d.text = 'x'; const e = S.validate(d).filter((x) => x.path === 'text');
  t(e.length === 1 && e[0].msg === 'ต้องเป็น object', 'text: "x" → "ต้องเป็น object" at text'); }
for (const k of ['valHint', 'valIntro', 'metricsNote', 'disclaimerAssump']) for (const v of ['', '   ']) {
  const d = base(); d.text = { [k]: v }; t(paths(S.validate(d)).includes(`text.${k}`), `text.${k}=${JSON.stringify(v)} → error at text.${k}`); }
// Plan 2a Task 4 — ordered cards + tone (§3.6 B-order, H)
{ const d = base(); d.metrics.custom = [{ label: 'สาขา', value: '45 ประเทศ' }, { label: 'พนักงาน', value: '13,800 คน', tone: 'neu' }];
  d.metrics.cards = ['mcap', 'custom:1', { key: 'pe', tone: 'pos' }, 'pbv', 'yield'];
  t.eq(S.validate(d), [], 'mixed catalogue / custom ref / {key,tone} is valid');
  t.eq(S.cardEntries(d.metrics), [
    { key: 'mcap', custom: null, tone: null }, { key: null, custom: 1, tone: 'neu' }, { key: 'pe', custom: null, tone: 'pos' },
    { key: 'pbv', custom: null, tone: null }, { key: 'yield', custom: null, tone: null }, { key: null, custom: 0, tone: null }], 'cardEntries order + unreferenced custom appended'); }
{ const d = base(); d.metrics.cards = d.metrics.cards.concat(['custom:0']); t(paths(S.validate(d)).includes(`metrics.cards[${d.metrics.cards.length - 1}]`), 'custom:<i> must point at an existing custom'); }
{ const d = base(); d.metrics.custom = [{ label: 'a', value: 'b' }]; d.metrics.cards = d.metrics.cards.slice(0, 5).concat(['custom:0', 'custom:0']); t(paths(S.validate(d)).includes('metrics.cards'), 'custom referenced twice → duplicate error'); }
{ const d = base(); d.metrics.cards[0] = { key: 'mcap', tone: 'green' }; t(paths(S.validate(d)).includes('metrics.cards[0].tone'), 'tone enum'); }
{ const d = base(); d.metrics.cards[0] = { key: 'mcap', cls: 'pos' }; t(paths(S.validate(d)).includes('metrics.cards[0].cls'), 'card object is closed'); }
{ const d = base(); d.metrics.custom = [{ label: 'a', value: 'b', tone: 'bad' }]; t(paths(S.validate(d)).includes('metrics.custom[0].tone'), 'custom tone enum'); }
// Plan 2a Task 5 — role / family / multipleRange (§3.6 I, C, F)
const ddmLeg = (fam) => ({ method: 'ddm', label: 'DDM', inputs: { g: 5, r: 9 }, ...(fam && { family: fam }) });
const pbvLeg = (fam) => ({ method: 'pbv', label: 'Justified P/BV', inputs: { g: 5, r: 9 }, ...(fam && { family: fam }) });
{ const d = base(); d.legs[1].role = 'ctx'; t(paths(S.validate(d)).includes('legs[1].role'), 'role enum'); }
{ const d = base(); d.legs[0].family = 'value'; t(paths(S.validate(d)).includes('legs[0].family'), 'family enum'); }
{ const d = base(); d.legs[1].role = 'context'; d.fvWeights = [0.5, 0.5]; t(paths(S.validate(d)).includes('fvWeights'), 'context leg must weigh 0'); }
{ const d = base(); d.legs[1].role = 'context'; d.fvWeights = [1, 0]; t.eq(S.validate(d), [], 'context leg with weight 0 is valid'); }
{ const d = base(); d.legs.forEach((l) => { l.role = 'context'; }); t(paths(S.validate(d)).includes('legs'), 'Review Focus #2: every leg context → error'); }
{ const d = base(); d.legs = [{ ...d.legs[0], family: 'market' }, ddmLeg(null)]; t(paths(S.validate(d)).includes('legs[1].family'), 'Review Focus #2: family on some fv legs only → error on the leg missing it'); }
{ const d = base(); d.legs = [{ ...d.legs[0], family: 'market' }, ddmLeg('rg'), pbvLeg('market')];
  t(paths(S.validate(d)).includes('legs[2].family'), 'layer 0: same (r,g) in different families → error'); }
{ const d = base(); d.legs = [{ ...d.legs[0], family: 'market' }, ddmLeg('rg'), pbvLeg('rg')]; t.eq(S.validate(d), [], 'same (r,g) same family → valid'); }
{ const d = base(); d.legs[0].inputs.multipleRange = [20, 34]; t.eq(S.validate(d), [], 'multipleRange around multiple 28 → valid'); }
{ const d = base(); d.legs[0].inputs.multipleRange = [30, 34]; t(paths(S.validate(d)).includes('legs[0].inputs.multipleRange'), 'multiple outside its range → error'); }
{ const d = base(); d.legs[0].inputs.multipleRange = [34, 20]; t(paths(S.validate(d)).includes('legs[0].inputs.multipleRange'), 'lo > hi → error'); }
{ const d = base(); d.legs[1].inputs.multipleRange = [1, 2]; t(paths(S.validate(d)).includes('legs[1].inputs.multipleRange'), 'range on a dcf leg → not in schema'); }
{ const d = base(); d.legs[0].inputs.multipleRange = [20, 34]; d.legs[0].role = 'context'; d.legs.push(ddmLeg(null)); d.fvWeights = null;
  t(paths(S.validate(d)).includes('legs[0].inputs.multipleRange'), 'range on a context leg → error'); }
// R7 / spec §13 ข้อ 6 — ขา context ตัวคูณสด (multipleSource 'current') คำนวณได้ · บนขา fv = สมอตาย (W18) ห้าม
const curLeg = (extra) => ({ method: 'pe', label: 'P/E ปัจจุบัน', role: 'context', inputs: { multipleSource: 'current' }, ...(extra || {}) });
{ const d = base(); d.legs.push(curLeg()); d.fvWeights = null; t.eq(S.validate(d), [], "context + 'current' without multiple → valid"); }
{ const d = base(); d.legs.push(curLeg({ role: 'fv' })); d.fvWeights = null; t(paths(S.validate(d)).includes('legs[2].inputs.multipleSource'), "'current' on an fv leg → error (W18 by construction)"); }
{ const d = base(); d.legs.push(curLeg()); d.legs[2].inputs.multiple = 20; d.fvWeights = null; t(paths(S.validate(d)).includes('legs[2].inputs.multiple'), "'current' + typed multiple → error (the multiple is live)"); }
{ const d = base(); d.legs.push({ method: 'ps', label: 'P/S ปัจจุบัน', role: 'context', inputs: { multipleSource: 'current' } }); d.fvWeights = null;
  t(paths(S.validate(d)).includes('legs[2].inputs.multipleSource'), "'current' only on pe/pbv/pffo (per-share base)"); }
t.eq(S.CURRENT_BASE, { pe: 'eps', pbv: 'bvps', pffo: 'ffoPerShare' }, 'CURRENT_BASE exported');
// Plan 2a Task 6 — ddm2 / medianWindow / ifrs
const ddm2 = (inp) => ({ method: 'ddm2', label: 'DDM 2 ระยะ', inputs: inp });
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r: 9, horizon: 30 })); t.eq(S.validate(d), [], 'ddm2 finite valid'); }
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r: 9, horizon: null })); t.eq(S.validate(d), [], 'ddm2 horizon null valid'); }
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r: 9 })); t(paths(S.validate(d)).includes('legs[2].inputs.horizon'), 'Review Focus #3: horizon key must be present'); }
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r: 9, horizon: 0 })); t(paths(S.validate(d)).includes('legs[2].inputs.horizon'), 'Review Focus #3: horizon 0 → error'); }
{ const d = base(); d.legs.push(ddm2({ d1: 0, g1: 10, years1: 5, g2: 3, r: 9, horizon: 30 })); t(paths(S.validate(d)).includes('legs[2].inputs.d1'), 'd1 > 0'); }
{ const d = base(); d.legs[0].inputs.medianWindow = 'FY2021–FY2025'; t.eq(S.validate(d), [], 'medianWindow with median5y'); }
{ const d = base(); d.legs[0].inputs.multipleSource = 'peer'; d.legs[0].inputs.medianWindow = 'FY21–25'; t(paths(S.validate(d)).includes('legs[0].inputs.medianWindow'), 'medianWindow needs a median source'); }
{ const d = base(); d.legs[0].inputs.medianWindow = 'x'.repeat(41); t(paths(S.validate(d)).includes('legs[0].inputs.medianWindow'), 'medianWindow ≤ 40 chars'); }
{ const d = base(); d.fundamentals.epsBasis = 'ifrs'; t.eq(S.validate(d), [], 'epsBasis ifrs'); }
// Task 6 fix round 1 — r > 0 ทุกขา · ddm2 horizon null ต้อง r > g2 ที่ validate
const dcfLeg = (r) => ({ method: 'dcf', label: 'DCF', inputs: { g1: 8, years1: 5, tg: 2.5, r, rfCurrency: 'USD' } });
for (const r of [0, -150]) {
  { const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r, horizon: 30 })); t(paths(S.validate(d)).includes('legs[2].inputs.r'), `ddm2 r=${r} → error at inputs.r`); }
  { const d = base(); d.legs.push(dcfLeg(r)); t(paths(S.validate(d)).includes('legs[2].inputs.r'), `dcf r=${r} → error at inputs.r`); }
}
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 9, r: 9, horizon: null })); t(paths(S.validate(d)).includes('legs[2].inputs.g2'), 'ddm2 horizon null r = g2 → error at inputs.g2'); }
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 9, r: 9, horizon: 30 })); t.eq(S.validate(d), [], 'ddm2 finite horizon r = g2 is fine'); }
// Plan 2a Task 7 — analyst.n / asOf ไม่บังคับ (§3.6 D)
{ const d = base(); d.analyst = { target: 190, rating: 'Buy' }; t.eq(S.validate(d), [], 'analyst without n/asOf is valid'); }
{ const d = base(); d.analyst = { target: 190, rating: 'Buy', n: null, asOf: null }; t.eq(S.validate(d), [], 'explicit nulls are valid'); }
{ const d = base(); d.analyst.n = 0; t(paths(S.validate(d)).includes('analyst.n'), 'n, when present, is an int ≥ 1'); }
{ const d = base(); d.analyst.asOf = '20/09/2026'; t(paths(S.validate(d)).includes('analyst.asOf'), 'asOf, when present, is ISO'); }
// Plan 2a Task 12 (ruling e) — asOf ต้องเป็น string: ISO.test() coerce array → "2026-09-21" ผ่านเงียบ
{ const d = base(); d.analyst.asOf = ['2026-09-21']; t(paths(S.validate(d)).includes('analyst.asOf'), 'asOf: an array that stringifies to ISO is rejected'); }
{ const d = base(); d.analyst.asOf = 20260921; t(paths(S.validate(d)).includes('analyst.asOf'), 'asOf: a number is rejected'); }
// Plan 2a Task 8 — fy + bank (§3.6 B, K)
{ const d = base(); d.fundamentals.fy = { period: 'FY2025', netIncome: 2.67e9, eps: 6.02 }; d.metrics.cards.push('netIncomeFy', 'epsFy'); t.eq(S.validate(d), [], 'fy + FY cards valid'); }
{ const d = base(); d.fundamentals.fy = { period: 'FY2025' }; t(paths(S.validate(d)).includes('fundamentals.fy'), 'fy needs ≥1 number'); }
{ const d = base(); d.fundamentals.fy = { period: 'FY2025', ebit: 1 }; t(paths(S.validate(d)).includes('fundamentals.fy.ebit'), 'fy is closed'); }
{ const d = base(); d.fundamentals.bank = { nim: 2.49, npl: 3, coverage: 324, cet1: 16.4, car: 20.9 }; d.metrics.cards.push('nim', 'npl', 'capital'); t.eq(S.validate(d), [], 'bank + bank cards valid'); }
{ const d = base(); d.fundamentals.bank = { nim: 249 }; t(paths(S.validate(d)).includes('fundamentals.bank.nim'), 'bank % ≤ 100'); }
{ const d = base(); d.fundamentals.bank = { roa: 1 }; t(paths(S.validate(d)).includes('fundamentals.bank.roa'), 'bank is closed'); }
// Plan 2a Task 9 — REIT (§3.6 J)
{ const d = base(); Object.assign(d.fundamentals, { ffoPerShare: 3.1, ffoBasis: 'affo', ffoForward: { value: 3.4, period: 'FY2026E', low: 3.3, high: 3.5 }, pffoAvg5y: 30 });
  d.metrics.cards.push('pffo', 'pffoForward', 'ffoPerShare', 'pffoAvg5y'); t.eq(S.validate(d), [], 'REIT fields + cards valid'); }
{ const d = base(); d.fundamentals.ffoBasis = 'core'; t(paths(S.validate(d)).includes('fundamentals.ffoBasis'), 'ffoBasis enum'); }
{ const d = base(); d.fundamentals.ffoForward = { value: 3.4, period: 'FY2026E', low: 3.5, high: 3.6 }; t(paths(S.validate(d)).includes('fundamentals.ffoForward'), 'low ≤ value ≤ high'); }
{ const d = base(); d.fundamentals.ffoForward = { value: 3.4 }; t(paths(S.validate(d)).includes('fundamentals.ffoForward.period'), 'ffoForward needs period'); }
// Plan 2a Task 10 — reportCurrency / fx (§3.6 L · Review Focus #4)
{ const d = base(); d.fundamentals.reportCurrency = 'EUR'; d.fundamentals.fx = 1.15566; d.legs[1].inputs.rfCurrency = 'EUR'; t.eq(S.validate(d), [], 'EUR statements + fx valid (dcf rf in the statement currency — final review)'); }
{ const d = base(); d.fundamentals.reportCurrency = 'EUR'; t(paths(S.validate(d)).includes('fundamentals.fx'), 'foreign statements need fx'); }
{ const d = base(); d.fundamentals.fx = 1.2; t(paths(S.validate(d)).includes('fundamentals.fx'), 'fx without reportCurrency → error'); }
{ const d = base(); d.fundamentals.reportCurrency = 'USD'; d.fundamentals.fx = 1.2; t(paths(S.validate(d)).includes('fundamentals.fx'), 'same currency with fx ≠ 1 → error'); }
{ const d = base(); d.fundamentals.reportCurrency = 'XYZ'; d.fundamentals.fx = 1.2; t(paths(S.validate(d)).includes('fundamentals.reportCurrency'), 'reportCurrency enum'); }
// Task 13 carry (d) — fx must be a positive number · same-currency statements need no fx
for (const bad of [0, -1.2, '1.2', true]) {
  const d = base(); d.fundamentals.reportCurrency = 'EUR'; d.fundamentals.fx = bad;
  t(paths(S.validate(d)).includes('fundamentals.fx'), `fx ${JSON.stringify(bad)} → error at fundamentals.fx`); }
{ const d = base(); d.fundamentals.reportCurrency = d.currency; delete d.fundamentals.fx; t.eq(S.validate(d), [], 'reportCurrency = currency with fx omitted → valid'); }
// Plan 2a Task 11 — extras rows/columns/fx (§3.6 M · Review Focus #5)
const xt = () => ({ after: 'valuation', title: 'SOTP', headers: ['ส่วน', 'มูลค่า'], rows: [['A', 1.5], ['B', 2]], sumCol: 1 });
{ const d = base(); d.extras = [{ ...xt(), rows: [['A', 1.5], { kind: 'note', text: 'หมายเหตุ' }, { kind: 'total', cells: ['รวม', 3.5] }], columns: [{ dp: 0, unit: 'none' }, { dp: 2, unit: 'ccy' }] }]; t.eq(S.validate(d), [], 'total/note rows + columns valid'); }
{ const d = base(); d.extras = [{ ...xt(), rows: [['A', 1], { kind: 'total', cells: ['x', 1] }, { kind: 'total', cells: ['y', 1] }] }]; t(paths(S.validate(d)).includes('extras[0].rows'), '≤1 total row'); }
{ const d = base(); d.extras = [{ ...xt(), rows: [{ kind: 'sum', cells: [] }] }]; t(paths(S.validate(d)).includes('extras[0].rows[0]'), 'unknown row kind'); }
{ const d = base(); d.extras = [{ ...xt(), columns: [{ dp: 0, unit: 'none' }] }]; t(paths(S.validate(d)).includes('extras[0].columns'), 'columns length = headers'); }
{ const d = base(); d.extras = [{ ...xt(), columns: [{ dp: 5, unit: 'none' }, { dp: 2, unit: 'eur' }] }]; const ps = paths(S.validate(d));
  t(ps.includes('extras[0].columns[0].dp') && ps.includes('extras[0].columns[1].unit'), 'dp ≤ 4 · unit enum'); }
{ const d = base(); d.extras = [{ ...xt(), sumCol: 0 }]; t(paths(S.validate(d)).includes('extras[0].sumCol'), 'Review Focus #5: sumCol on a text column → error'); }
{ const d = base(); d.extras = [{ ...xt(), fx: true }]; t(paths(S.validate(d)).includes('extras[0].fx'), 'Review Focus #5: fx:true without fundamentals.fx → error'); }
// ── final-review fix round (24 ก.ย. 69) ──
const realFx = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
const errAt = (errs, path) => errs.filter((e) => e.path === path);
// (1) family ต้องสอดคล้องกับ method (§3.6 C) — ขาที่รับ (r,g) โดยโครงสร้าง = 'rg' · declared sotp/nav = 'asset'
{ const d = realFx('BBL-real'); d.legs[1].family = 'market'; const e = errAt(S.validate(d), 'legs[1].family');
  t(e.length && e.some((x) => x.msg.includes('ddm')), 'family↔method: BBL-real ddm labelled market → error at legs[1].family naming ddm'); }
{ const d = realFx('BBL-real'); d.legs[2].family = 'market'; d.legs[1].family = 'market';
  t(errAt(S.validate(d), 'legs[2].family').some((x) => x.msg.includes('pbv')), 'family↔method: justified pbv labelled market → error naming pbv'); }
{ const d = realFx('FER-real'); d.legs[0].family = 'rg'; d.legs[1].family = 'rg'; const errs = S.validate(d);
  t(errAt(errs, 'legs[0].family').some((x) => x.msg.includes('sotp')), 'family↔method: declared sotp labelled rg → error naming sotp');
  t.eq(errAt(errs, 'legs[1].family'), [], 'family↔method: ddm2 labelled rg is fine'); }
{ const d = realFx('FER-real'); d.legs[0].family = 'asset'; d.legs[1].family = 'rg'; t.eq(S.validate(d), [], 'family↔method: sotp asset + ddm2 rg → valid'); }
t.eq(S.validate(realFx('BBL-real')), [], 'family↔method: pe market (BBL-real as is) → valid');
for (const [m, inputs] of [['dcf', { g1: 8, years1: 5, tg: 2.5, r: 10, rfCurrency: 'USD' }], ['ri', { r: 10, years: 5, payout: 40 }], ['ddm2', { d1: 2, g1: 10, years1: 5, g2: 3, r: 10, horizon: 30 }]]) {
  const d = base(); d.legs = [{ ...d.legs[0], family: 'market' }, { method: m, label: m.toUpperCase(), family: 'asset', inputs }];
  t(errAt(S.validate(d), 'legs[1].family').some((x) => x.msg.includes(m)), `family↔method: ${m} labelled asset → error naming ${m}`); }
// gray zones stay the author's choice: declared other/rnpv (pe justified = rg · multiples = market — ruling below)
{ const d = realFx('ZTS-real'); d.legs[0].family = 'rg'; d.legs[1].family = 'market'; d.legs[2].family = 'rg'; t.eq(S.validate(d), [], 'gray zone: pe justified rg + declared other market → valid'); }
{ const d = realFx('ZTS-real'); d.legs[1].inputs.basis = 'rnpv'; d.legs[0].family = 'rg'; d.legs[1].family = 'asset'; d.legs[2].family = 'rg'; t.eq(S.validate(d), [], 'gray zone: declared rnpv asset → valid'); }
{ const d = base(); d.legs = [{ ...d.legs[0], family: 'market' }, { method: 'pbv', label: 'P/BV', family: 'market', inputs: { multiple: 2, multipleSource: 'peer' } }]; t.eq(S.validate(d), [], 'pbv by multiple labelled market → valid'); }
// (2) rf ต้องสกุลเดียวกับกระแสเงินสด = สกุลงบ (fundamentals.reportCurrency) ไม่ใช่สกุลราคา
const ferDcf = (cur) => { const d = realFx('FER-real'); d.legs.push({ method: 'dcf', label: 'DCF', inputs: { g1: 6, years1: 5, tg: 2, r: 8, rfCurrency: cur } }); return d; };
t.eq(S.validate(ferDcf('EUR')), [], 'rfCurrency: FER-real (EUR statements) + dcf rf EUR → valid');
t(errAt(S.validate(ferDcf('USD')), 'legs[2].inputs.rfCurrency').some((x) => x.msg.includes('EUR')), 'rfCurrency: FER-real + dcf rf USD → error naming EUR');
{ const d = base(); d.legs.push(dcfLeg(9)); d.legs[2].inputs.rfCurrency = 'THB'; t(errAt(S.validate(d), 'legs[2].inputs.rfCurrency').some((x) => x.msg.includes('USD')), 'rfCurrency: no reportCurrency → compares with doc.currency'); }
// (4) ช่องข้อความสั้นที่ไม่ผ่าน token/sanitize — ห้ามมี { } < >
{ const d = base(); d.legs[0].inputs.medianWindow = '{{rd:fv}}'; t(paths(S.validate(d)).includes('legs[0].inputs.medianWindow'), 'medianWindow with braces → error'); }
{ const d = base(); d.fundamentals.fy = { period: 'FY{{rd:px}}', eps: 6 }; t(paths(S.validate(d)).includes('fundamentals.fy.period'), 'fy.period with braces → error'); }
{ const d = base(); d.fundamentals.ffoPerShare = 3.1; d.fundamentals.ffoForward = { value: 3.4, period: 'FY<b>26' }; t(paths(S.validate(d)).includes('fundamentals.ffoForward.period'), 'ffoForward.period with < > → error'); }
{ const d = base(); d.legs[0].label = 'P/E <script>'; t(paths(S.validate(d)).includes('legs[0].label'), 'leg label with < > → error'); }
{ const d = base(); d.extras = [{ ...xt(), title: 'SOTP {{fv}}' }]; t(paths(S.validate(d)).includes('extras[0].title'), 'extras title with braces → error'); }
{ const d = base(); d.extras = [{ ...xt(), headers: ['ส่วน', 'มูลค่า <i>'] }]; t(paths(S.validate(d)).includes('extras[0].headers[1]'), 'extras header with < > → error at the header path'); }
// ruling (final review follow-up): ขาตัวคูณ — multipleSource ≠ 'justified' = 'market' · 'justified' (สร้างจาก r,g) = 'rg' · 'current' (context) = 'market'
{ const d = realFx('BBL-real'); d.legs[0].family = 'rg'; t(errAt(S.validate(d), 'legs[0].family').some((x) => x.msg.includes('pe')), 'multiples: BBL pe median5y labelled rg → error at legs[0].family'); }
{ const d = realFx('BBL-real'); d.legs[0].family = 'asset'; t(errAt(S.validate(d), 'legs[0].family').length > 0, 'multiples: pe median5y labelled asset → error'); }
{ const d = realFx('ZTS-real'); d.legs[0].family = 'market'; d.legs[1].family = 'rg'; d.legs[2].family = 'rg';
  t(errAt(S.validate(d), 'legs[0].family').some((x) => x.msg.includes('justified')), 'multiples: pe justified labelled market → error (must be rg)'); }
{ const d = realFx('EQIX-real'); d.legs[0].family = 'market'; d.legs[1].family = 'market'; t.eq(S.validate(d), [], 'multiples: EQIX pe median + pffo current context labelled market → valid'); }
{ const d = realFx('EQIX-real'); d.legs[1].family = 'rg'; d.legs[0].family = 'market'; t(errAt(S.validate(d), 'legs[1].family').length > 0, "multiples: 'current' context labelled rg → error"); }
{ const d = base(); d.legs = [{ method: 'pffo', label: 'P/FFO', family: 'market', inputs: { multiple: 20, multipleSource: 'median5y' } }, ddmLeg('rg')]; t.eq(S.validate(d), [], 'multiples: pffo median labelled market → valid'); }
for (const m of ['ps', 'evsales', 'evebitda', 'pfcf']) {
  const d = base(); d.legs = [{ method: m, label: m, family: 'rg', inputs: { multiple: 5, multipleSource: 'peer' } }, ddmLeg('rg')];
  t(errAt(S.validate(d), 'legs[0].family').length > 0, `multiples: ${m} peer labelled rg → error`); }
t.eq(S.requiredFamily({ method: 'fcfyield', inputs: { yield: 5 } }), null, 'fcfyield stays a gray zone (no multipleSource)');
t.eq(S.requiredFamily(null), null, 'requiredFamily(null) → null (no throw)');
for (const f of ['BBL-real', 'EQIX-real', 'FER-real', 'ZTS-real', 'BBL', 'ZTS']) t.eq(S.validate(realFx(f)), [], `${f}: still valid under the final-review rules`);
// ── Plan 2b Task 5 — {{rd:…}} + sentinel TODO = E51 ของสคีมา (spec §3 หมายเหตุ token · §9 · rulings R3/R4) ──
{
  const real = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
  const at = (d, p) => S.validate(d).filter((e) => e.path === p);
  t.eq(S.validate(real('ZTS-real')), [], 'ZTS-real baseline: 0 schema errors');
  { const d = real('ZTS-real'); d.prose.mos = 'ราคาปัจจุบัน {{rd:px}}'; const e = at(d, 'prose.mos');
    t(e.length === 1 && /ไวยากรณ์ของใบ v2/.test(e[0].msg), '{{rd:px}} in prose → error at prose.mos (finding M3)'); }
  { const d = real('ZTS-real'); d.metrics.custom[0].note = 'เดิม {{rd:fv}}'; t(at(d, 'metrics.custom[0].note').length === 1, '{{rd:…}} in a custom-card note → error with its path'); }
  { const d = real('ZTS-real'); d.scenarios.cases[2].desc += ' {{rd:scn.bull.tgt}}'; t(at(d, 'scenarios.cases[2].desc').length === 1, '{{rd:…}} in a scenario description → error'); }
  { const d = real('ZTS-real'); d.meta.sub = 'TODO: คำโปรยธุรกิจ'; const e = at(d, 'meta.sub');
    t(e.length === 1 && /sentinel "TODO"/.test(e[0].msg), 'TODO sentinel in a text field → one error naming meta.sub'); }
  { const d = real('ZTS-real'); d.legs[0].inputs.multiple = 'TODO: ตัวคูณเป้าหมาย'; const e = at(d, 'legs[0].inputs.multiple');
    t(e.some((x) => /sentinel "TODO"/.test(x.msg)) && e.some((x) => /ต้องเป็นตัวเลข/.test(x.msg)), 'TODO left in a number field → type error + sentinel error at the same path (R3)'); }
  { const d = real('ZTS-real'); d.catalysts[1] = 'TODO'; t(at(d, 'catalysts[1]').length === 1, 'bare "TODO" → error'); }
  { const d = real('ZTS-real'); d.prose.mos += ' (สิ่งที่ต้องทำ: TODO list ของบริษัท)'; t(at(d, 'prose.mos').length === 0, 'the word TODO mid-sentence is not the sentinel'); }
  { const d = real('ZTS-real'); d.risks[0] = 'TODOS ของทีม'; t(at(d, 'risks[0]').length === 0, '"TODOS" (no word boundary) is not the sentinel'); }
  t(S.TODO_RE.test('  TODO: x') && !S.TODO_RE.test('todo: x'), 'TODO_RE: leading spaces allowed · case-sensitive');
  t.eq(S.stringLeaves({ a: ['x', { b: 'y' }], c: 1 }, '', []), [{ path: 'a[0]', text: 'x' }, { path: 'a[1].b', text: 'y' }], 'stringLeaves: JSON paths of every string');
}
// Plan 4b Task 1 — schema gaps the sweep needs (spec §10 "ช่องว่าง schema ที่ 4b ต้องปิด")
{
  const d = base();
  d.metrics.cards = [{ key: 'pe', tone: 'none' }].concat(d.metrics.cards.filter((c) => c !== 'pe' && !(c && c.key === 'pe')));
  t.eq(S.validate(d).filter((e) => /tone/.test(e.path)), [], 'tone "none" accepted (466 v2 cards have no class)');
  d.metrics.cards[0].tone = 'loud';
  t(S.validate(d).some((e) => e.path === 'metrics.cards[0].tone'), 'unknown tone still rejected');
}
{
  const d = base(); d.analyst = { target: 80, n: null, rating: null, asOf: null };
  t.eq(S.validate(d).filter((e) => /analyst/.test(e.path)), [], 'analyst.rating null accepted (114 v2 reports print no rating)');
  delete d.analyst.rating;
  t(S.validate(d).some((e) => e.path === 'analyst.rating'), 'analyst.rating key still required (closed object)');
}
{
  const d = base(); d.meta.headerTags = ['a', 'b', 'c'];
  t.eq(S.validate(d).filter((e) => /headerTags/.test(e.path)), [], 'headerTags max 3 (ADR/dual listing)');
  d.meta.headerTags = ['a', 'b', 'c', 'd'];
  t(S.validate(d).some((e) => e.path === 'meta.headerTags'), 'headerTags 4 rejected');
}
{
  const d = base(); d.scenarios.driver = 'de'; d.fundamentals.dePerShare = 4.2;
  t.eq(S.validate(d).filter((e) => /scenarios\.(driver|exitMetric)|dePerShare/.test(e.path)), [], 'driver de + fundamentals.dePerShare accepted');
  d.scenarios.driver = 'fre'; d.fundamentals.frePerShare = 1.1;
  t.eq(S.validate(d).filter((e) => /scenarios\.(driver|exitMetric)|frePerShare/.test(e.path)), [], 'driver fre + fundamentals.frePerShare accepted');
  // fix round 1 (N-3 ruling): EV/Sales exit multiplies revenue per share ⇒ requires driver revenuePerShare
  d.scenarios.driver = 'revenuePerShare'; d.scenarios.exitMetric = 'evsales';
  t.eq(S.validate(d).filter((e) => /scenarios\./.test(e.path)), [], 'exitMetric evsales + driver revenuePerShare accepted');
  d.scenarios.driver = 'eps';
  t.eq(paths(S.validate(d)).filter((p) => /scenarios\./.test(p)), ['scenarios.exitMetric'], 'exitMetric evsales + driver eps → error on scenarios.exitMetric');
  d.fundamentals.occupancy = 94.1; d.fundamentals.backlog = 1.2e9; d.fundamentals.aum = 3e11; d.fundamentals.tbvps = 40.5; d.fundamentals.frePerShare = 1.1;
  t.eq(S.validate(d).filter((e) => /fundamentals\.(occupancy|backlog|aum|tbvps|frePerShare)/.test(e.path)), [], 'new fundamentals keys accepted');
  d.metrics.cards = ['occupancy', 'netDebtEbitda', 'backlog', 'payout', 'aum', 'ptbv'];
  t.eq(S.validate(d).filter((e) => /metrics\.cards/.test(e.path)), [], 'six new catalogue keys accepted');
}

// Plan 4b Task 2 — dcf: exactly one of {g1, years1} | {stages} (brief's load()/errsOf() = base()/S.validate() here)
{
  const d = base();
  const dcfLeg = (inputs) => ({ method: 'dcf', label: 'DCF', role: 'fv', family: 'rg', inputs });
  d.legs = [d.legs[0], dcfLeg({ stages: [{ years: 5, g: 7 }, { years: 5, g: 4 }], tg: 3, r: 8.5, rfCurrency: d.currency })];
  if (d.fvWeights) d.fvWeights = null;
  d.fundamentals.fcf = d.fundamentals.fcf || 2.3e9; d.fundamentals.shares = d.fundamentals.shares || 4.3e8;
  t.eq(S.validate(d).filter((e) => /legs\[1\]/.test(e.path)), [], 'dcf with stages accepted');
  d.legs[1] = dcfLeg({ g1: 7, years1: 5, stages: [{ years: 5, g: 7 }], tg: 3, r: 8.5, rfCurrency: d.currency });
  t(S.validate(d).some((e) => e.path === 'legs[1].inputs'), 'g1/years1 together with stages → error');
  d.legs[1] = dcfLeg({ tg: 3, r: 8.5, rfCurrency: d.currency });
  t(S.validate(d).some((e) => e.path === 'legs[1].inputs'), 'neither g1/years1 nor stages → error');
  d.legs[1] = dcfLeg({ stages: [{ years: 0, g: 7 }], tg: 3, r: 8.5, rfCurrency: d.currency });
  t(S.validate(d).some((e) => e.path === 'legs[1].inputs.stages[0].years'), 'stage years must be int ≥ 1');
  d.legs[1] = dcfLeg({ stages: Array.from({ length: 11 }, () => ({ years: 1, g: 5 })), tg: 3, r: 8.5, rfCurrency: d.currency });
  t(S.validate(d).some((e) => e.path === 'legs[1].inputs.stages'), '> 10 stages → error');
  d.legs[1] = dcfLeg({ stages: [{ years: 41, g: 5 }], tg: 3, r: 8.5, rfCurrency: d.currency });
  t(S.validate(d).some((e) => e.path === 'legs[1].inputs.stages'), 'Σ years > 40 → error');
}
{
  const d = base(); d.scenarios.exitDp = 1;
  t.eq(S.validate(d).filter((e) => /exitDp/.test(e.path)), [], 'scenarios.exitDp 1 accepted');
  d.scenarios.exitDp = 3; t(S.validate(d).some((e) => e.path === 'scenarios.exitDp'), 'exitDp 3 rejected (0–2)');
}
t.done();
