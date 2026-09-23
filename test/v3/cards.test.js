'use strict';
const t = require('./_t.js')('cards');
const K = require('../../tools/v3/cards.js');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const DV = require('../../tools/derived-values.js');
const RV = require('../../tools/report-values.js');
const TK = require('../../tools/v3/tokens.js');
const load = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
const view = C.compute(load(), { seeds: { ZTS: '#e8731a' } });

t.eq(Object.keys(K.CATALOGUE).sort(), S.CARD_KEYS.slice().sort(), 'catalogue keys = schema CARD_KEYS');
const pe = K.renderCard('pe', view, 'หมายเหตุ');
t.eq(pe.v, view.d.pe.toFixed(1) + 'x', 'pe value from compute');
t(/EPS/.test(pe.d) && DV.epsBasesOf(pe.d).includes(6.13), 'pe base line declares EPS so the E41 parser reads it');
t(/หมายเหตุ/.test(pe.d), 'note appended to base line');
const mc = K.renderCard('mcap', view);
t.near(DV.parseShares(mc.d), 443e6, 1e6, 'mcap base line parses back to shares (E43)');
const y = K.renderCard('yield', view);
t(/\$2\.00\/ปี/.test(y.d), 'yield base line = DPS per year (W19)');
// postreview Fix1 — yield card value = 2dp site-wide (reuses RV.TOKENS.yield, not a hand-rolled toFixed(1))
t.eq(y.v, RV.TOKENS.yield(view.d), 'yield card value = RV.TOKENS.yield(view.d) exactly (same formatter, no separate hand-format)');
t(/^-?\d+\.\d{2}%$/.test(y.v), `yield card value has exactly 2 decimals: ${y.v}`);
t(/BVPS \$11\.40/.test(K.renderCard('pbv', view).d), 'pbv base line = BVPS (W20)');
// Review Focus #4 — loss-making company
// legs[0] (method 'pe') needs a positive EPS to compute a fair-value leg at all (legs.js:67 final-guard,
// unrelated to the card check under test) — override it so compute() succeeds and the card's own
// eps ≤ 0 guard (cards.js) is what's exercised, not the valuation-leg guard (progress.md Task 4 note).
{ const d = load(); d.fundamentals.eps = -1.2;
  d.legs[0].override = { eps: 6.13, why: 'isolate pe-card eps≤0 guard from unrelated valuation-leg guard' };
  d.scenarios.baseOverride = { value: 6.13, why: 'scenarios.driver=eps reads fundamentals.eps directly; isolate from pe-card guard' };
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('pe', v2), /metrics\.cards: pe/, 'eps ≤ 0 → pe card rejected'); }
{ const d = load(); delete d.fundamentals.beta; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('beta', v2), /fundamentals\.beta/, 'missing data names the field'); }

// 6 คีย์เพิ่ม 24 ก.ย. 69 (Task 11 card census — docs/superpowers/specs/2026-09-24-card-census.md)
const nd = K.renderCard('netDebt', view);
t.eq(nd.v, RV.fmtBig(5.1e9, '$'), 'netDebt value = fundamentals.netDebt formatted');
const at = K.renderCard('analystTarget', view);
t.eq(at.v, `$190.00 (${TK.TOKENS_V3['analyst.pct'](view)})`, 'analystTarget % text equals the v2 token TOKENS_V3[\'analyst.pct\'] (matches {{rd:analystPct}} exactly)');
{ const d = load(); delete d.analyst; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('analystTarget', v2), /metrics\.cards: analystTarget/, 'no doc.analyst → rejected'); }
{ const d = load(); d.fundamentals.ebitda = 3000000000; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  const em = K.renderCard('ebitdaMargin', v2);
  t.eq(em.v, (3000000000 / 9400000000 * 100).toFixed(1) + '%', 'ebitdaMargin = ebitda / revenue');
  const ee = K.renderCard('evEbitda', v2);
  const ev = view.d.mcap + 5.1e9;   // mcap unaffected by ebitda addition
  t.eq(ee.v, (ev / 3000000000).toFixed(1) + 'x', 'evEbitda = (mcap+netDebt)/ebitda'); }
{ const d = load(); d.fundamentals.roic = 22.4; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('roic', v2).v, '~22.4%', 'roic from fundamentals.roic'); }
{ const d = load(); d.fundamentals.epsForward = 6.8; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('peForward', v2).v, (v2.d.px / 6.8).toFixed(1) + 'x', 'peForward = px / epsForward');
  t(DV.epsBasesOf(K.renderCard('peForward', v2).d).includes(6.8), 'peForward base line declares forward EPS so E41 reads it'); }
{ const d = load(); d.fundamentals.ebitda = 0; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('evEbitda', v2), /EBITDA ≤ 0/, 'evEbitda rejects EBITDA ≤ 0'); }
// Finding 6 — revenue ≤ 0 must throw a field-named error, never render Infinity%
{ const d = load(); d.fundamentals.ebitda = 3000000000; d.fundamentals.revenue = 0; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('ebitdaMargin', v2), /fundamentals\.revenue/, 'ebitdaMargin rejects revenue ≤ 0 instead of rendering Infinity%'); }
// Plan 2a Task 2 — ค่าเป็นมัธยฐานจาก median-multiples ⇒ label ต้องไม่เขียน "เฉลี่ย" (spec §3.2 · BBL G9)
t.eq(K.CATALOGUE.peAvg5y.label(view), 'P/E มัธยฐาน ~5 ปี', 'peAvg5y label says มัธยฐาน');
// Plan 2a Task 8 — การ์ด FY + ธนาคาร
{ const d = load(); d.fundamentals.fy = { period: 'FY2025', netIncome: 2.673e9, eps: 6.02, revenue: 9.26e9 };
  d.fundamentals.bank = { nim: 2.49, npl: 3, coverage: 324, cet1: 16.4, car: 20.9 };
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  const c = (k) => K.renderCard(k, v2);
  t.eq([c('netIncomeFy').k, c('netIncomeFy').v], ['กำไรสุทธิ FY2025', RV.fmtBig(2.673e9, '$')], 'netIncomeFy label/value');
  t.eq([c('epsFy').k, c('epsFy').v], ['EPS FY2025', '~$6.02'], 'epsFy');
  t.eq(c('revenueFy').k, 'รายได้ FY2025', 'revenueFy label');
  t.eq(c('nim').v, '2.49%', 'nim 2 dp');
  t.eq(c('npl').v, '3.0% / 324%', 'npl / coverage');
  t.eq([c('capital').v, c('capital').cls], ['~16.4% / 20.9%', 'pos'], 'capital'); }
{ const d = load(); d.fundamentals.fy = { period: 'FY2025', netIncome: -3.1e8 }; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('netIncomeFy', v2).v, '−' + RV.fmtBig(3.1e8, '$'), 'negative statement total uses U+2212, never "$-310M"'); }
{ const v2 = C.compute(load(), { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('epsFy', v2), /fundamentals\.fy/, 'FY card without fy names the field');
  t.throws(() => K.renderCard('nim', v2), /fundamentals\.bank\.nim/, 'bank card without data names the field'); }
t.done();
