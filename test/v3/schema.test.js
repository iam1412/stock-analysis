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
t.done();
