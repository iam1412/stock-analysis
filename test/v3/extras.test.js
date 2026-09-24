'use strict';
const t = require('./_t.js')('extras');
const X = require('../../tools/v3/extras.js');
const C = require('../../tools/v3/compute.js');
const load = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
const view = { stmtCur: '€', cur: '$' };

t.eq(X.fmtCell(-1.81, undefined, view), '−1.81', 'default: U+2212 (Plan 1 printed "-1.81")');
t.eq(X.fmtCell(1234.5, undefined, view), '1,234.50', 'default positive = RV.fmtPrice (byte-identical)');
t.eq(X.fmtCell(-1300, { dp: 0, unit: 'none' }, view), '−1,300', 'dp 0 + grouping + U+2212');
t.eq(X.fmtCell(1307, { dp: 0, unit: 'none', signed: true }, view), '+1,307', 'signed');
t.eq(X.fmtCell(48.29, { dp: 2, unit: 'pct' }, view), '48.29%', 'pct');
t.eq(X.fmtCell(6.5, { dp: 1, unit: 'x' }, view), '6.5x', 'x');
t.eq(X.fmtCell(-44.83, { dp: 2, unit: 'ccy' }, view), '−€44.83', 'ccy = statement symbol (ruling R9)');

const tbl = { sumCol: 1, rows: [['a', 10], ['b', 20.25], { kind: 'note', text: 'n' }, { kind: 'total', cells: ['รวม', 30] }], columns: [{ dp: 0, unit: 'none' }, { dp: 2, unit: 'none' }] };
t.eq(X.tableTotal(tbl), { sum: 30.25, total: 30, hasTotalRow: true }, 'tableTotal: Σ data rows (note rows ignored) vs the total row');

// E52 on the real SOTP fixture (after this task's fixture edit)
{ const d = load('FER-real'); const v = C.compute(d, { seeds: {} });
  t.eq(X.tieOut(d, v), [], 'FER-real: SOTP €44.83 × 1.15566 ties to leg 1 $51.81 within 1%');
  d.legs[0].inputs.value = 60; t(X.tieOut(d, C.compute(d, { seeds: {} })).some((i) => i.path === 'legs[0].inputs.value'), 'leg value off the table → E52'); }
{ const d = load('FER-real'); d.extras[1].rows.find((r) => r.kind === 'total').cells[4] = 45.5;
  t(X.tieOut(d, C.compute(d, { seeds: {} })).some((i) => i.path === 'extras[1].rows'), 'Review Focus #5: total row ≠ Σ beyond rounding → E52'); }
{ const d = load('FER-real'); delete d.legs[0].inputs.extrasRef;
  t(X.tieOut(d, C.compute(d, { seeds: {} })).some((i) => i.path === 'legs[0].inputs.extrasRef'), 'sotp leg without a table → E52'); }
{ const d = load('ZTS-real'); const i = d.legs.findIndex((l) => l.method === 'declared'); delete d.legs[i].note;
  t(X.tieOut(d, C.compute(d, { seeds: {} })).some((x) => x.path === `legs[${i}].note`), 'declared "other" leg with no table and no reason → E52'); }
t.done();
