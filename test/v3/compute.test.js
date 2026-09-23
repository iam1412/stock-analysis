'use strict';
const t = require('./_t.js')('compute');
const C = require('../../tools/v3/compute.js');
const RV = require('../../tools/report-values.js');
const load = (s) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`)));
const seeds = { ZTS: '#e8731a' };

const v = C.compute(load('ZTS'), { seeds });
t.near(v.legs[0].value, 171.64, 1e-9, 'leg 1 = pe');
t.near(v.fv, (v.legs[0].value + v.legs[1].value) / 2, 1e-9, 'fv = equal-weight mean when fvWeights null');
t.eq([v.fvLow, v.fvHigh], [Math.min(v.legs[0].value, v.legs[1].value), Math.max(v.legs[0].value, v.legs[1].value)], 'fvLow/High = min/max of legs');
t.near(v.scn[1].tgt, 6.13 * Math.pow(1.08, 3) * 26, 1e-9, 'base scenario target = eps(1+g)^y × exit');
t.eq(v.d.mosText, RV.derive(v.rd, v.sm).mosText, 'view.d is RV.derive of the bridged v2 data (byte-identical formatting)');
t.eq(v.rd.v, 2, 'bridge emits report-data v2');
t.eq(Object.keys(v.rd.values).includes('scenarios'), true, 'bridge carries scenarios');
t(v.chart.min < Math.min(...v.chart.data.map((p) => p[1])) && v.chart.max > v.fv, 'chart bounds include data and fv');
t.eq(v.chart.highlight, [6, 0], 'highlight = [index of min, index of max]');
t(v.gauge.min < v.fv * 0.7 && v.gauge.max > 190, 'gauge spans mos30 … analyst target');
t.eq(v.theme.chgColor, '#c5221f', 'chart down → red chg colour (E34)');
t(v.theme.accent === '#31a60d' && v.gdots.length === 3, 'themeLegacy palette + 3 gdots');
{ const d = load('ZTS'); d.meta.themeLegacy = null; const w = C.compute(d, { seeds });
  t.eq(w.theme.accent, require('../../tools/brandtheme.js').makeTheme('#e8731a').accent, 'no themeLegacy → makeTheme(seed)'); }
t.eq(v.analysisDateText, '20 ก.ย. 2569', 'analysis date in BE');

const b = C.compute(load('BBL'), { seeds: {} });
t.eq(b.theme.accent, '#0071e3', 'themeLegacy wins over seeds');
t.eq(b.theme.chgColor, '#137333', 'chart up → green');
t.eq(b.rd.values.analystTgt, undefined, 'no analyst → no analystTgt in bridge');

{ const d = load('ZTS'); d.fvWeights = [0.75, 0.25]; const w = C.compute(d, { seeds });
  t.near(w.fv, 0.75 * w.legs[0].value + 0.25 * w.legs[1].value, 1e-9, 'explicit weights'); }
{ const d = load('ZTS'); d.market.px = -3; t.throws(() => C.compute(d, { seeds }), /market\.px/, 'schema errors surface with path'); }
{ const d = load('ZTS'); d.meta.themeLegacy = null; t.throws(() => C.compute(d, { seeds: {} }), /seeds\.json.*ZTS/, 'no theme source → clear error'); }
{ const d = load('ZTS'); d.legs[1] = { method: 'declared', label: 'SOTP', inputs: { value: 150, basis: 'sotp', extrasRef: 0 } };
  t.throws(() => C.compute(d, { seeds }), /legs\[1\]\.inputs\.extrasRef/, 'extrasRef must point at an extras table'); }
// Plan 2a Task 5 — weights / context / range
t.eq(C.weightsOf(load('ZTS')), [0.5, 0.5], 'legacy: equal weights, byte-identical to Plan 1');
{ const d = load('ZTS'); d.legs = [{ ...d.legs[0], family: 'market' }, { method: 'ddm', label: 'DDM', family: 'rg', inputs: { g: 5, r: 9 } }, { method: 'pbv', label: 'P/BV', family: 'rg', inputs: { g: 5, r: 9 } }];
  t.eq(C.weightsOf(d), [0.5, 0.25, 0.25], 'family: 1 family 1 vote, split inside the family');
  d.fvWeights = [0.6, 0.2, 0.2]; t.eq(C.weightsOf(d), [0.6, 0.2, 0.2], 'explicit fvWeights wins over family'); }
{ const d = load('ZTS'); d.legs[1].role = 'context'; const v = C.compute(d, { seeds });
  t.eq(C.weightsOf(d), [1, 0], 'context leg weighs 0');
  t.near(v.fv, v.legs[0].value, 1e-9, 'fv = the single fv leg');
  t.eq([v.fvLow, v.fvHigh], [v.legs[0].value, v.legs[0].value], 'context leg excluded from fvLow/fvHigh');
  t.eq(v.legs[1].role, 'context', 'view carries role'); }
{ const d = load('ZTS'); d.legs[0].inputs.multipleRange = [20, 34]; const v = C.compute(d, { seeds });
  t.near(v.fvLow, 0.5 * 6.13 * 20 + 0.5 * v.legs[1].value, 1e-9, 'fvLow = Σ w·lo (unranged leg uses its value)');
  t.near(v.fvHigh, 0.5 * 6.13 * 34 + 0.5 * v.legs[1].value, 1e-9, 'fvHigh = Σ w·hi');
  t.near(v.fv, (v.legs[0].value + v.legs[1].value) / 2, 1e-9, 'range does not move fv'); }
// R7 — ขา context 'current': ตัวคูณสด = ราคา ÷ ตัวตั้ง · ค่าขา ≡ ราคา · ไม่ขยับ FV
{ const d = load('ZTS'); const fv0 = C.compute(d, { seeds }).fv;
  d.legs.push({ method: 'pe', label: 'P/E ปัจจุบัน', role: 'context', inputs: { multipleSource: 'current' } }); d.fvWeights = null;
  const v = C.compute(d, { seeds }), L = v.legs[v.legs.length - 1];
  t.near(L.liveMultiple, d.market.px / d.fundamentals.eps, 1e-9, 'liveMultiple = px / eps');
  t.near(L.value, d.market.px, 1e-9, 'current leg value ≡ px');
  t.eq(L.weight, 0, 'current leg weighs 0');
  t.near(v.fv, fv0, 1e-9, 'current context leg does not move fv');
  d.market.px *= 1.1; t.near(C.compute(d, { seeds }).legs[v.legs.length - 1].liveMultiple, d.market.px / d.fundamentals.eps, 1e-9, 'liveMultiple follows the price (nothing frozen)'); }
t.done();
