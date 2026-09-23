'use strict';
const t = require('./_t.js')('cards');
const K = require('../../tools/v3/cards.js');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const DV = require('../../tools/derived-values.js');
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
t.done();
