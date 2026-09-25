'use strict';
const t = require('./_t.js')('tokens');
const path = require('path');
const IO = require('../../tools/v3/io.js');
const C = require('../../tools/v3/compute.js');
const P = require('../../tools/v3/prose.js');
const TK = require('../../tools/v3/tokens.js');
const RV = require('../../tools/report-values.js');
const SEEDS = require('../../tools/seeds.json');
const doc = IO.read(path.join(__dirname, '../fixtures/v3/ZTS.json'));
// ZTS fixture has no fundamentals.fy — add one (in memory) so {{epsFy}} has a value to resolve
doc.fundamentals.fy = { period: 'FY2025', netIncome: 2.6e9, eps: 5.92, revenue: 9.3e9 };
const view = C.compute(doc, { seeds: SEEDS });
const f = doc.fundamentals;
t.eq(TK.TOKENS_V3.eps(view), view.cur + RV.fmtPrice(f.eps), '{{eps}} = money(fundamentals.eps)');
t.eq(TK.TOKENS_V3.dps(view), view.cur + RV.fmtPrice(f.dps), '{{dps}} = money(fundamentals.dps)');
t.eq(TK.TOKENS_V3.bvps(view), view.cur + RV.fmtPrice(f.bvps), '{{bvps}} = money(fundamentals.bvps)');
t.eq(TK.TOKENS_V3.epsFy(view), view.cur + RV.fmtPrice(f.fy.eps), '{{epsFy}} = money(fundamentals.fy.eps)');
const vs = (doc.analyst.target - view.fv) / view.fv * 100;
t.eq(TK.TOKENS_V3['analyst.vsFv'](view), (vs < 0 ? '−' : '+') + Math.abs(vs).toFixed(1) + '%', '{{analyst.vsFv}} = (target − FV)/FV, 1dp, U+2212 for negative');
t.throws(() => TK.TOKENS_V3.epsFy({ ...view, doc: { ...doc, fundamentals: { ...f, fy: undefined } } }), /epsFy/, 'epsFy without fundamentals.fy → named throw');
t.throws(() => TK.TOKENS_V3['analyst.vsFv']({ ...view, doc: { ...doc, analyst: null } }), /analyst/, 'analyst.vsFv without analyst → named throw');
// fix round 1 (N-2): a vsFv that rounds to 0.0 prints "+0.0%", never "−0.0%"
t.eq(TK.TOKENS_V3['analyst.vsFv']({ ...view, doc: { ...doc, analyst: { ...doc.analyst, target: view.fv * 0.9999 } } }), '+0.0%', 'analyst.vsFv rounding to zero → "+0.0%"');
// fix round 1 (I-2): every name prose.priceBound() emits is a real token — value = the card's calc, no trailing x (like {{pffo}})
{
  const K = require('../../tools/v3/cards.js');
  const d2 = JSON.parse(JSON.stringify(doc)); Object.assign(d2.fundamentals, { tbvps: 9.5, epsForward: 6.8, ebitda: 3.2e9 });
  const w = C.compute(d2, { seeds: SEEDS });
  t.eq(TK.TOKENS_V3.ptbv(w), K.ptbvCalc(w).raw.toFixed(2), '{{ptbv}} = ptbvCalc raw, 2dp (= card text without x)');
  t.eq(TK.TOKENS_V3.peForward(w), K.peForwardCalc(w).raw.toFixed(1), '{{peForward}} = peForwardCalc raw, 1dp');
  t.eq(TK.TOKENS_V3.evEbitda(w), K.evEbitdaCalc(w).raw.toFixed(1), '{{evEbitda}} = evEbitdaCalc raw, 1dp');
  t.throws(() => TK.TOKENS_V3.ptbv(view), /tbvps/, '{{ptbv}} without fundamentals.tbvps → named throw');
  t.throws(() => TK.TOKENS_V3.peForward(view), /epsForward/, '{{peForward}} without fundamentals.epsForward → named throw');
  t.throws(() => TK.TOKENS_V3.evEbitda(view), /ebitda/, '{{evEbitda}} without fundamentals.ebitda → named throw');
  const P2 = require('../../tools/v3/prose.js');
  const unknown = P2.priceBound(w).map((b) => b.token).filter((n) => !TK.TOKENS_V3[n]);
  t.eq(unknown, [], 'every priceBound() token name resolves in TOKENS_V3');
}
t.eq(P.renderProse('EPS {{eps}} · DPS {{dps}}', view), `EPS ${TK.TOKENS_V3.eps(view)} · DPS ${TK.TOKENS_V3.dps(view)}`, 'renderProse resolves the new tokens');
t(P.renderProse('{{eps}}', view, { mode: 'v2src' }) === TK.TOKENS_V3.eps(view), 'new tokens have no v2 twin → rendered inline in v2src mode');
t.done();
