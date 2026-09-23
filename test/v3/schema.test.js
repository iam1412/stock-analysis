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
t.done();
