'use strict';
/**
 * compute.js — ผู้อ่าน/ผู้คำนวณ "คนเดียว" ของรายงาน v3 (build · gate · cron · index ใช้ตัวนี้ทั้งหมด)
 * ★ ค่าที่ผูกราคา/FV ทุกตัวคิดผ่าน RV.derive() ของ v2 (bridge rd/sm) ⇒ การปัด/รูปแบบตัวเลขเหมือนเดิมทุก byte
 * ★ ห้าม require build.js / update-prices.js / check-reports.js (กฎ cycle เดียวกับ report-values.js)
 */
const RV = require('../report-values.js');
const PD = require('../price-date.js');
const bt = require('../brandtheme.js');
const S = require('./schema.js');
const L = require('./legs.js');
const { niceBounds, num4 } = require('./scale.js');

const UP = { chgBg: 'var(--green-soft)', chgColor: '#137333' };     // = fetch-facts.js UP/DOWN (E34)
const DOWN = { chgBg: 'var(--red-soft)', chgColor: '#c5221f' };
const SCN_NAMES = ['bear', 'base', 'bull'];
const round2 = (x) => Math.round(x * 100) / 100;

function driverStart(doc) {
  const s = doc.scenarios, f = doc.fundamentals;
  if (s.baseOverride) return s.baseOverride.value;
  const per = (k) => (f[k] != null && f.shares ? f[k] / f.shares : null);
  const v = { eps: f.eps, ffo: f.ffoPerShare, bvps: f.bvps, revenuePerShare: per('revenue'), fcfPerShare: per('fcf') }[s.driver];
  if (!(typeof v === 'number' && v > 0)) throw new Error(`scenarios.driver: ฐาน "${s.driver}" ไม่มีใน fundamentals (หรือ ≤ 0) — เติม fundamentals หรือใช้ scenarios.baseOverride`);
  return v;
}

function themeOf(doc, seeds, dir) {
  let base;
  if (doc.meta.themeLegacy) base = { ...doc.meta.themeLegacy };
  else if (seeds && seeds[doc.symbol]) base = bt.makeTheme(seeds[doc.symbol]);
  else throw new Error(`meta.themeLegacy: ไม่มีสีแบรนด์ — ต้องมี tools/seeds.json["${doc.symbol}"] (รัน pick-brand) หรือ themeLegacy`);
  const chg = dir === 'up' ? UP : dir === 'down' ? DOWN : {};
  const theme = { ...base, ...chg };
  const gradMid = (theme.darkGrad.match(/,(#[0-9a-fA-F]{6}) 58%/) || [])[1] || theme.accentDark;   // = pick-brand.js:119
  return { theme, gdots: [theme.accent, theme.accentDark, gradMid] };
}

function compute(doc, opts) {
  const errs = S.validate(doc);
  if (errs.length) throw new Error(errs.map((e) => `${e.path}: ${e.msg}`).join('\n'));
  const f = doc.fundamentals, mk = doc.market, s = doc.scenarios;

  // ── legs → fv ──
  const legs = doc.legs.map((leg, i) => {
    if (leg.method === 'declared' && leg.inputs.extrasRef != null && !doc.extras[leg.inputs.extrasRef])
      throw new Error(`legs[${i}].inputs.extrasRef: ไม่มี extras[${leg.inputs.extrasRef}]`);
    return { label: leg.label, method: leg.method, value: L.legValue(leg, f, `legs[${i}]`), inputs: leg.inputs, override: leg.override || null, note: leg.note || '' };
  });
  const w = doc.fvWeights || legs.map(() => 1 / legs.length);
  legs.forEach((l, i) => { l.weight = w[i]; });
  const fv = legs.reduce((a, l) => a + l.value * l.weight, 0);
  const fvLow = Math.min(...legs.map((l) => l.value)), fvHigh = Math.max(...legs.map((l) => l.value));

  // ── scenarios ──
  const start = driverStart(doc);
  const scn = s.cases.map((c, i) => {
    const end = start * Math.pow(1 + c.growth / 100, s.years);
    // divCum: เก็บผ่านเสมอเมื่อ author ให้มา (informational แม้ divIncluded=false — schema อนุญาต) · total% ตัดสินด้วย scnBasis.divIncluded ใน derive() v2 อยู่แล้ว ไม่ใช่ตรงนี้
    return { name: SCN_NAMES[i], growth: c.growth, exitMultiple: c.exitMultiple, driverStart: start, driverEnd: end, tgt: end * c.exitMultiple, divCum: c.divCum == null ? null : c.divCum, desc: c.desc };
  });

  // ── bridge → v2 report-data + stock-meta (ใช้ RV.derive ตัวจริง) ──
  const values = { px: mk.px, priceDate: mk.priceDate, dateEra: doc.dateEra, chgSuffix: mk.chgSuffix, fvLow: round2(fvLow), fvHigh: round2(fvHigh) };
  if (doc.analyst) values.analystTgt = doc.analyst.target;
  if (f.eps != null) values.eps = f.eps;
  if (f.shares != null) values.shares = f.shares;
  if (f.revenue != null && f.revenue > 0) values.revenue = f.revenue;
  if (f.dps != null && f.dps >= 0) values.dps = f.dps;
  if (f.bvps != null && f.bvps > 0) values.bvps = f.bvps;
  if (s.driver === 'eps') values.baseEps = start;
  values.scenarios = scn.map((x) => (x.divCum == null ? { tgt: round2(x.tgt) } : { tgt: round2(x.tgt), div: round2(x.divCum) }));
  values.scnBasis = { years: s.years, divIncluded: s.divIncluded, perYear: s.perYear };

  const cur = RV.CUR_SYMBOL[doc.currency];
  const prices = mk.chart.data.map((p) => p[1]);
  const cb = niceBounds(prices, round2(fv));
  const iMin = prices.indexOf(Math.min(...prices)), iMax = prices.indexOf(Math.max(...prices));
  const chart = { data: mk.chart.data, min: cb.min, max: cb.max, grid: cb.grid, currency: cur, highlight: [iMin, iMax] };
  if (mk.chart.gridFmt) chart.gridFmt = mk.chart.gridFmt;
  if (mk.chart.dataFmt) chart.dataFmt = mk.chart.dataFmt;

  const gPts = [mk.px, fv, fv * 0.7, fvHigh, fvLow].concat(doc.analyst ? [doc.analyst.target] : []);
  const gb = niceBounds(gPts, null);
  const gauge = { min: gb.min, max: gb.max };

  const chgDir = RV.annualChg(mk.chart.data, '').dir;
  const { theme, gdots } = themeOf(doc, opts && opts.seeds, chgDir);

  const rd = { v: 2, fv: round2(fv), values, theme, chart, gauge };
  const smBase = { symbol: doc.symbol, currency: doc.currency };
  const d = RV.derive(rd, smBase);
  const sm = {
    ...smBase, price: mk.px, fairValue: round2(fv), mos: num4(d.mos), upside: num4(d.upside),
    pe: d.pe == null ? null : num4(d.pe), dividendYield: d.yield == null ? null : num4(d.yield), roe: f.roe == null ? null : f.roe,
  };
  const ad = RV.parseIso(doc.meta.analysisDate);
  const analysisDateText = PD.renderThaiDate(ad.day, ad.monIdx, ad.yearCE, doc.dateEra === 'BE');

  return { doc, d, legs, fv, fvLow, fvHigh, scn, chart, gauge, theme, gdots, analysisDateText, rd, sm, cur };
}

module.exports = { compute, SCN_NAMES };
