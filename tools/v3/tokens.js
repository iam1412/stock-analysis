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
  // ขา context 'current' (R7) ไม่มี inputs.multiple — ใช้ตัวคูณสดที่ compute คิดไว้ (liveMultiple = ราคา ÷ ตัวตั้ง) ตัวเดียวกับ mdesc/ค่าขา
  TOKENS_V3[`leg${i}.multiple`] = (view) => { const l = need(view.legs && view.legs[i - 1], `leg${i}`);
    return need(l.liveMultiple != null ? l.liveMultiple : l.inputs.multiple, `leg${i}.multiple`).toFixed(1) + 'x'; };
}
['bear', 'base', 'bull'].forEach((n, i) => {
  TOKENS_V3[`scn.${n}.end`] = (view) => money(view, need(view.scn && view.scn[i], `scn.${n}`).driverEnd);
  TOKENS_V3[`scn.${n}.exit`] = (view) => need(view.scn && view.scn[i], `scn.${n}`).exitMultiple.toFixed(1) + 'x';
});
TOKENS_V3.analysisDate = (view) => need(view.analysisDateText, 'analysisDate');
TOKENS_V3['range52w.lo'] = (view) => money(view, need(view.doc && view.doc.market.range52w, 'range52w').lo);
TOKENS_V3['range52w.hi'] = (view) => money(view, need(view.doc && view.doc.market.range52w, 'range52w').hi);
// Plan 4b Task 1 (spec §10.1 token gaps: fund:eps 834 ใบ · dps 458 · bvps 223 · epsFy 45 · analyst:vsFv 30) — ค่าจากงบ ไม่ผูกราคา
// (ไม่เข้า priceBound) แต่ทำให้ prose ตาม fundamentals เมื่อ UPDATE · เงินผ่าน RV.fmtPrice เหมือน token อื่น
const fund = (view, k) => need(view.doc && view.doc.fundamentals && view.doc.fundamentals[k], k);
TOKENS_V3.eps = (view) => money(view, fund(view, 'eps'));
TOKENS_V3.dps = (view) => money(view, fund(view, 'dps'));
TOKENS_V3.bvps = (view) => money(view, fund(view, 'bvps'));
TOKENS_V3.epsFy = (view) => money(view, need(view.doc && view.doc.fundamentals && view.doc.fundamentals.fy && view.doc.fundamentals.fy.eps, 'epsFy'));
// ส่วนต่างเป้านักวิเคราะห์เทียบ FV (ไม่ใช่เทียบราคา — นั่นคือ analyst.pct) · 1 ตำแหน่ง · ลบ = U+2212
TOKENS_V3['analyst.vsFv'] = (view) => { const a = need(view.doc && view.doc.analyst, 'analyst.vsFv'); const x = (a.target - view.fv) / view.fv * 100; return (x < 0 ? '−' : '+') + Math.abs(x).toFixed(1) + '%'; };
// Plan 2a Task 9 — P/FFO (ไม่มีคู่ v2 · รูปแบบเดียวกับ {{pe}}/{{pbv}} = ไม่มี x ต่อท้าย) — เลขมาจาก cards.js ตัวเดียวกับการ์ด
TOKENS_V3.pffo = (view) => require('./cards.js').pffoCalc(view).raw.toFixed(1);
TOKENS_V3.pffoForward = (view) => require('./cards.js').pffoForwardCalc(view).raw.toFixed(1);

module.exports = { TOKENS_V3, V2_TWIN };
