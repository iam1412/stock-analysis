'use strict';
/**
 * tokens.js — ตาราง token ของ prose v3 ({{px}} {{fv}} {{scn.base.ret}} {{leg1}} …)
 * ★ token ที่มีคู่ใน v2 เรียกฟังก์ชันของ RV.TOKENS ตรง ๆ บน view.d (= RV.derive ของ bridge) — ไม่เขียนสูตร format ซ้ำ
 *   corpus test (test/v3/tokens-corpus.test.js) ยืนยันว่า bridge ของ compute() ให้ผลเท่า v2 ทั้งคลัง
 * token ใหม่ของ v3 (ขา · ฉาก input · 52 สัปดาห์) format ด้วย RV.fmtPrice เหมือนกัน
 */
const RV = require('../report-values.js');

// v3 name → v2 token key (ไม่มีคู่ = ไม่อยู่ในตารางนี้)
const V2_TWIN = {
  px: 'px', fv: 'fv', fvLow: 'fvLow', fvHigh: 'fvHigh', mos: 'mos', mos20: 'mos20', mos30: 'mos30', upside: 'upside',
  pe: 'pe', pbv: 'pbv', yield: 'yield', mcap: 'mcap', ps: 'ps', chg: 'chg', priceDate: 'priceDate', baseEps: 'baseEps',
  'analyst.target': 'analystTgt', 'analyst.pct': 'analystPct',
  'scn.bear.tgt': 'sc1tgt', 'scn.bear.ret': 'sc1ret', 'scn.bear.div': 'sc1div',
  'scn.base.tgt': 'sc2tgt', 'scn.base.ret': 'sc2ret', 'scn.base.div': 'sc2div',
  'scn.bull.tgt': 'sc3tgt', 'scn.bull.ret': 'sc3ret', 'scn.bull.div': 'sc3div',
};

function need(v, name) { if (v == null) throw new Error(`token {{${name}}} ชี้ค่าที่ไม่มีในรายงานนี้`); return v; }
const money = (view, v) => view.d.cur + RV.fmtPrice(v);
const TOKENS_V3 = {};
for (const [v3, v2] of Object.entries(V2_TWIN)) TOKENS_V3[v3] = (view) => String(RV.TOKENS[v2](view.d));
for (let i = 1; i <= 4; i++) {
  TOKENS_V3[`leg${i}`] = (view) => money(view, need(view.legs && view.legs[i - 1], `leg${i}`).value);
  TOKENS_V3[`leg${i}.multiple`] = (view) => need(need(view.legs && view.legs[i - 1], `leg${i}`).inputs.multiple, `leg${i}.multiple`).toFixed(1) + 'x';
}
['bear', 'base', 'bull'].forEach((n, i) => {
  TOKENS_V3[`scn.${n}.end`] = (view) => money(view, need(view.scn && view.scn[i], `scn.${n}`).driverEnd);
  TOKENS_V3[`scn.${n}.exit`] = (view) => need(view.scn && view.scn[i], `scn.${n}`).exitMultiple.toFixed(1) + 'x';
});
TOKENS_V3.analysisDate = (view) => need(view.analysisDateText, 'analysisDate');
TOKENS_V3['range52w.lo'] = (view) => money(view, need(view.doc && view.doc.market.range52w, 'range52w').lo);
TOKENS_V3['range52w.hi'] = (view) => money(view, need(view.doc && view.doc.market.range52w, 'range52w').hi);

module.exports = { TOKENS_V3, V2_TWIN };
