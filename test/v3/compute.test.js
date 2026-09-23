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
t.done();
