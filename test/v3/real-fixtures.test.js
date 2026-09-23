'use strict';
// ใบจริง Task 0 (BBL ธนาคาร · EQIX REIT · FER SOTP/EUR · ZTS Plan 1) — เกณฑ์ที่ต้องคงตลอด Plan 2a (spec §12):
// FV ไม่เปลี่ยน (ค่าจาก compare doc) · กติกา B 0 error · gate v2 บนหน้าที่ render = 0 error 0 warning
const t = require('./_t.js')('real-fixtures');
const C = require('../../tools/v3/compute.js');
const P = require('../../tools/v3/prose.js');
const R = require('../../_template/v3/render.js');
const { expandReport } = require('../../build.js');
const CR = require('../check-reports.js');

const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
const round2 = (x) => Math.round(x * 100) / 100;
// docs/superpowers/specs/2026-09-24-{BBL,EQIX,FER,zts}-v3-compare.md — ห้ามขยับ
const FV = { 'BBL-real': 176.77, 'EQIX-real': 1253.33, 'FER-real': 53.42, 'ZTS-real': 85 };

for (const f of Object.keys(FV)) {
  const doc = load(f);
  const view = C.compute(doc, { seeds: {} });
  t.eq(round2(view.fv), FV[f], `${f}: FV unchanged vs compare doc`);
  t.eq(P.checkRuleB(doc, view).errors.map((e) => `${e.path} ${e.literal}→${e.token}`), [], `${f}: rule B — 0 errors`);
  const d2 = load(f); d2.market.priceDate = today; d2.meta.analysisDate = today;   // E27/W09 ใช้นาฬิกาจริง
  const v2 = C.compute(d2, { seeds: {} });
  const src = R.toV2Source(d2, v2);
  const res = CR.checkHtml(expandReport(src), `${d2.symbol}.html`, { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], `${f}: v2 gate on render — 0 errors`);
  t.eq(res.warnings.map((e) => `${e.id} ${e.msg}`), [], `${f}: v2 gate on render — 0 warnings`);
}
t.done();
