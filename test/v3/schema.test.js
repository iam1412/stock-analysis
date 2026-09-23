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
t.done();
