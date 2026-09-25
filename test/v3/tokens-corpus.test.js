'use strict';
const t = require('./_t.js')('tokens-corpus');
const fs = require('fs');
const path = require('path');
const RV = require('../../tools/report-values.js');
const RM = require('../../tools/report-meta.js');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const TK = require('../../tools/v3/tokens.js');
const { THEME_DEFAULTS } = require('../../build.js');

// v2 values → v3 doc ขั้นต่ำ: ขา declared 2 ขาที่ fvLow/fvHigh + weights ให้ได้ fv เดิม · ฉากใช้ baseOverride + exit = tgt/base
function v3FromV2(rd, sm, symbol) {
  const v = rd.values, f = {};
  for (const k of ['eps', 'shares', 'revenue', 'dps', 'bvps']) if (v[k] != null) f[k] = v[k];
  if (f.eps != null) f.epsBasis = 'gaap-ttm';
  const lo = v.fvLow != null ? v.fvLow : rd.fv, hi = v.fvHigh != null ? v.fvHigh : rd.fv;
  const decl = (x) => ({ method: 'declared', label: 'x', inputs: { value: x, basis: 'other' } });
  const b = v.scnBasis || { years: 3, divIncluded: false, perYear: null };
  const base = v.baseEps != null && v.baseEps > 0 ? v.baseEps : 1;
  const theme = {}; for (const k of S.THEME_KEYS) theme[k] = (rd.theme && rd.theme[k]) || THEME_DEFAULTS[k];
  return {
    v: 3, symbol, currency: sm.currency, region: sm.currency === 'THB' ? 'TH' : 'US', dateEra: v.dateEra,
    meta: { company: 'x', exchange: 'x', sub: 'parity fixture xx', analysisDate: v.priceDate, aiModel: 'Claude Sonnet 5', sources: ['a', 'b', 'c'], themeLegacy: theme },
    market: { px: v.px, priceDate: v.priceDate, chgSuffix: v.chgSuffix,
      chart: { data: rd.chart.data, ...(rd.chart.gridFmt && { gridFmt: rd.chart.gridFmt }), ...(rd.chart.dataFmt && { dataFmt: rd.chart.dataFmt }) } },
    fundamentals: f,
    legs: [decl(lo), decl(hi)],
    fvWeights: hi === lo ? null : [(hi - rd.fv) / (hi - lo), (rd.fv - lo) / (hi - lo)],
    metrics: { cards: ['mcap', 'pe', 'pbv', 'yield'], notes: {}, custom: [] },
    scenarios: { years: b.years, divIncluded: b.divIncluded, perYear: b.perYear == null ? null : b.perYear, driver: 'eps', exitMetric: 'pe',
      baseOverride: { value: base, why: 'parity' },
      // divCum ส่งต่อทุกครั้งที่ v2 มีค่า (ไม่ใช่แค่ divIncluded=true) — v2 หลายพันใบเก็บปันผลสะสมไว้แสดงแม้ไม่รวมผลตอบแทน (schema v3 อนุญาต informational field นี้)
      cases: (v.scenarios || [{ tgt: 1 }, { tgt: 1 }, { tgt: 1 }]).map((x) => ({ growth: 0, exitMultiple: x.tgt / base, ...(x.div != null && { divCum: x.div }), desc: 'x' })),
      note: 'x' },
    analyst: v.analystTgt != null ? { target: v.analystTgt, n: 1, rating: 'x', asOf: v.priceDate } : null,
    prose: Object.fromEntries(['chart', 'valuation', 'gauge', 'mos', 'verdictHeadline', 'verdictBody', 'strategy', 'disclaimerSources'].map((k) => [k, 'x'])),
    catalysts: ['a', 'b', 'c'], risks: ['a', 'b', 'c'], extras: [],
  };
}

const dir = path.join(__dirname, '..', '..', 'reports');
let files = 0, ok = 0, checked = 0;
const findings = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const rd = RM.readReportData(html).data;
  if (!RV.isV2(rd)) continue;
  const sm = RM.readStockMeta(html);
  const sym = f.replace(/\.html$/, '');
  files++;
  let out;
  try { out = C.compute(v3FromV2(rd, sm, sym), {}); } catch (e) { findings.push(`${sym}: ${e.message.split('\n')[0]}`); continue; }
  ok++;
  const dA = RV.derive(rd, sm);
  for (const [v3, v2] of Object.entries(TK.V2_TWIN)) {
    let want;
    try { want = String(RV.TOKENS[v2](dA)); } catch (_) { continue; }   // ค่าไม่มีในใบนี้ → v2 ก็ใช้ token นี้ไม่ได้
    let got;
    try { got = TK.TOKENS_V3[v3](out); } catch (e) { got = 'THROW ' + e.message; }
    checked++;
    if (got !== want) t(false, `${sym} {{${v3}}} = "${got}" but v2 {{rd:${v2}}} = "${want}"`);
  }
}
if (findings.length) console.log(`  ℹ compute() refused ${findings.length} v2 value sets (schema findings — review, don't loosen blindly):\n    ` + findings.slice(0, 30).join('\n    '));
console.log(`  ℹ compute() accepted ${ok}/${files} v2 value sets · ${checked} token renders compared`);
// Plan 4c (26 ก.ย. 69): คลัง v2 หดลงทุกแบตช์ migrate (909 → 0) ⇒ เลิกพื้นตายตัว 880 · กันสแกนเงียบด้วย "นับครบทุก .html ที่เป็น v2 ในโฟลเดอร์"
const v2Html = fs.readdirSync(dir).filter((x) => x.endsWith('.html')).length;
t(files === v2Html, `scanned every v2 report in the corpus (${files}/${v2Html} files)`);
t(ok >= files * 0.97, `compute() accepted ≥97% of real v2 value sets (${ok}/${files})`);
t(files === 0 || checked > 0, `compared ${checked} token renders`);   // คลัง v2 ว่าง (หลัง migrate ครบ) = ไม่มีอะไรให้เทียบ
t.done();
