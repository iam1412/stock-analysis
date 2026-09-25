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
const round1 = (x) => (x == null ? x : Math.round(x * 10) / 10);
const STMT_SYMBOL = { USD: '$', THB: '฿', EUR: '€', CAD: 'C$', GBP: '£', JPY: '¥', CHF: 'CHF ', TWD: 'NT$' };
const TOTALS = ['revenue', 'netIncome', 'fcf', 'ebitda', 'netDebt'];
// ยอดรวมทั้งบริษัท (สกุลงบ) → สกุลราคา · fx = 1 คืน object เดิม (ทางเดิมทุก byte)
function toQuote(obj, fx) {
  if (fx === 1 || !obj) return obj;
  const q = { ...obj };
  for (const k of TOTALS) if (typeof q[k] === 'number') q[k] = obj[k] * fx;
  return q;
}

// f = fundamentals ในสกุลราคา (fq) — ฐานต่อหุ้นจากยอดรวม (revenuePerShare/fcfPerShare) จึงเป็นสกุลราคาเหมือน eps/bvps (§3.6 L)
function driverStart(doc, f) {
  const s = doc.scenarios;
  if (s.baseOverride) return s.baseOverride.value;
  const per = (k) => (f[k] != null && f.shares ? f[k] / f.shares : null);
  const v = { eps: f.eps, ffo: f.ffoPerShare, bvps: f.bvps, revenuePerShare: per('revenue'), fcfPerShare: per('fcf'), de: f.dePerShare, fre: f.frePerShare, ebitdaPerShare: per('ebitda') }[s.driver];   // de/fre = Plan 4b Task 1 (alt managers) · ebitdaPerShare = Plan 4c-prep (EBITDA รวม สกุลราคา ÷ หุ้น)
  if (!(typeof v === 'number' && v > 0)) throw new Error(`scenarios.driver: ฐาน "${s.driver}" ไม่มีใน fundamentals (หรือ ≤ 0) — เติม fundamentals หรือใช้ scenarios.baseOverride`);
  return v;
}

// exit แบบ EV (Plan 4b Task 1 evsales · Plan 4c-prep evebitda · §3.3): ราคาเป้า = ตัวตั้งต่อหุ้นปลายฉาก × ตัวคูณ − หนี้สุทธิ/หุ้น (สกุลราคา ผ่าน fq) · exit อื่น = ตัวตั้ง × ตัวคูณ
// ราคาเป้า ≤ 0 (หนี้สุทธิท่วม EV) = throw ชี้ตัวคูณของฉากนั้น เหมือน equity() ใน legs.js — ไม่ปล่อยไปตกที่ E51 ตอน render
const EV_EXITS = { evsales: 'EV/Sales', evebitda: 'EV/EBITDA' };
function exitTarget(s, end, m, fq, i) {
  const evName = EV_EXITS[s.exitMetric];
  if (!evName) return end * m;
  if (!(typeof fq.shares === 'number' && fq.shares > 0)) throw new Error(`scenarios.exitMetric: ${s.exitMetric} ต้องมี fundamentals.shares > 0 (หักหนี้สุทธิต่อหุ้น)`);
  const ev = end * m, nd = (fq.netDebt || 0) / fq.shares, tgt = ev - nd;
  if (!(tgt > 0)) throw new Error(`scenarios.cases[${i}].exitMultiple: ${s.exitMetric} — ราคาเป้า ≤ 0 (EV/หุ้น ${ev.toFixed(2)} − หนี้สุทธิ/หุ้น ${nd.toFixed(2)}) — ตัวคูณ ${evName} ฉากนี้ใช้กับหุ้นนี้ไม่ได้`);
  return tgt;
}

// ตัวตั้งของขา pe ตาม inputs.base (Plan 4c-prep · spec §3.7 ก · D2) — ป้อน L.legValue ผ่าน override.eps โดยไม่แตะ legs.js
// ไม่มี base / base 'eps' / ไม่ใช่ pe = คืน object เดิม (ทางเดิมทุก byte)
function withBase(leg, f, path) {
  const b = leg && leg.inputs && leg.inputs.base;
  if (!leg || leg.method !== 'pe' || b == null || b === 'eps') return leg;
  const ov = leg.override || {}, fb = f || {};
  const v = b === 'epsForward' ? (ov.epsForward != null ? ov.epsForward : fb.epsForward) : fb.fy && fb.fy.eps;
  if (!(typeof v === 'number' && v > 0)) throw new Error(`${path || 'leg'}.inputs.base: '${b}' ต้องมี ${b === 'epsForward' ? 'fundamentals.epsForward (หรือ override.epsForward)' : 'fundamentals.fy.eps'} > 0`);
  const o = { ...ov, eps: v, why: ov.why || `ฐาน ${b}` };
  delete o.epsForward;
  return { ...leg, override: o };
}
const legValueOf = (leg, f, path) => L.legValue(withBase(leg, f, path), f, path);
// ตัวตั้งปลายฉาก — compute() และ semanticErrors() ใช้สูตรเดียวกัน
const driverEndOf = (start, c, s) => start * Math.pow(1 + c.growth / 100, s.years);

function themeOf(doc, seeds, dir) {
  let base;
  if (doc.meta.themeLegacy) base = { ...doc.meta.themeLegacy };
  else if (seeds && seeds[doc.symbol]) base = bt.makeTheme(seeds[doc.symbol]);
  else throw new Error(`meta.themeLegacy: ไม่มีสีแบรนด์ — รัน node tools/pick-brand.js ${doc.symbol} "#rrggbb" --auto (ลง tools/seeds.json) · themeLegacy ใช้ได้เฉพาะใบที่ migrate มา — save ปฏิเสธบนใบ NEW`);
  const chg = dir === 'up' ? UP : dir === 'down' ? DOWN : {};
  const theme = { ...base, ...chg };
  const gradMid = (theme.darkGrad.match(/,(#[0-9a-fA-F]{6}) 58%/) || [])[1] || theme.accentDark;   // = pick-brand.js:119
  return { theme, gdots: [theme.accent, theme.accentDark, gradMid] };
}

// น้ำหนัก FV (§3.6 C/I): fvWeights ที่เขียนชัด > family (1 ตระกูล 1 เสียง แบ่งเท่ากันในตระกูล) > เท่ากันทุกขา fv · ขา context = 0 เสมอ
function weightsOf(doc) {
  const isFv = (l) => l.role !== 'context';
  if (doc.fvWeights) return doc.fvWeights.slice();
  const fv = doc.legs.filter(isFv);
  if (fv.some((l) => l.family != null)) {
    const n = {}; for (const l of fv) n[l.family] = (n[l.family] || 0) + 1;
    const nFam = Object.keys(n).length;
    return doc.legs.map((l) => (isFv(l) ? 1 / (nFam * n[l.family]) : 0));
  }
  return doc.legs.map((l) => (isFv(l) ? 1 / fv.length : 0));
}

// fx + fundamentals สกุลราคา (§3.6 L) — compute() และ semanticErrors() ใช้ตัวเดียวกัน
function quoteBasis(doc) {
  const f = doc.fundamentals;
  const fx = f.reportCurrency && f.reportCurrency !== doc.currency ? f.fx : 1;
  return { fx, fq: toQuote(f, fx) };
}
// ขาหนึ่งขา → { legQ, legM, liveMultiple } — จุดเดียวของ extrasRef/'current' ที่ compute() และ semanticErrors() ใช้ร่วม
// (throw ขึ้นต้นด้วย JSON path เสมอ ⇒ semanticErrors แยก path ได้)
function prepLeg(doc, leg, i, fq, fx) {
  if (leg.method === 'declared' && leg.inputs.extrasRef != null && !doc.extras[leg.inputs.extrasRef])
    throw new Error(`legs[${i}].inputs.extrasRef: ไม่มี extras[${leg.inputs.extrasRef}]`);
  // R7 (§13 ข้อ 6): ขา context 'current' — ตัวคูณสด = ราคา ÷ ตัวตั้ง (รวม override) · ค่าขา ≡ ราคา · ไม่มีเลขแช่แข็ง
  // override ของขาเป็นสกุลงบเหมือน fundamentals → แปลงชุดเดียวกัน
  const legB = withBase(leg, fq, `legs[${i}]`);   // Plan 4c-prep: ตัวตั้ง inputs.base → override.eps ก่อน L.legValue
  const legQ = fx === 1 ? legB : { ...legB, override: toQuote(legB.override, fx) };
  let liveMultiple = null;
  if (leg.inputs.multipleSource === 'current') {
    const k = S.CURRENT_BASE[leg.method], base = L.inputsOf(legQ, fq)[k];
    if (!(typeof base === 'number' && base > 0)) throw new Error(`legs[${i}].inputs.multipleSource: 'current' ต้องมี fundamentals.${k} > 0`);
    liveMultiple = doc.market.px / base;
  }
  const legM = liveMultiple == null ? legQ : { ...legQ, inputs: { ...leg.inputs, multiple: liveMultiple } };
  return { legQ, legM, liveMultiple };
}

function compute(doc, opts) {
  const errs = S.validate(doc);
  if (errs.length) throw new Error(errs.map((e) => `${e.path}: ${e.msg}`).join('\n'));
  const f = doc.fundamentals, mk = doc.market, s = doc.scenarios;
  const { fx, fq } = quoteBasis(doc);

  // ── legs → fv ──
  const legs = doc.legs.map((leg, i) => {
    const { legQ, legM, liveMultiple } = prepLeg(doc, leg, i, fq, fx);
    const value = L.legValue(legM, fq, `legs[${i}]`);
    const r = leg.inputs.multipleRange;
    const at = (m) => L.legValue({ ...legQ, inputs: { ...leg.inputs, multiple: m } }, fq, `legs[${i}].inputs.multipleRange`);
    return { label: leg.label, method: leg.method, value, inputs: leg.inputs, override: leg.override || null, note: leg.note || '',
      role: leg.role || 'fv', family: leg.family || null, lo: r ? at(r[0]) : value, hi: r ? at(r[1]) : value, ranged: !!r, liveMultiple };
  });
  const w = weightsOf(doc);
  legs.forEach((l, i) => { l.weight = w[i]; });
  const fv = legs.reduce((a, l) => a + l.value * l.weight, 0);
  const fvLegs = legs.filter((l) => l.role === 'fv');
  // กรอบ FV (§3.6 F): มีขาใดประกาศ multipleRange → Σ w·lo / Σ w·hi · ไม่มี = min/max ของขา fv (ขา context ไม่นับ — §3.6 I)
  const ranged = fvLegs.some((l) => l.ranged);
  const fvLow = ranged ? fvLegs.reduce((a, l) => a + l.lo * l.weight, 0) : Math.min(...fvLegs.map((l) => l.value));
  const fvHigh = ranged ? fvLegs.reduce((a, l) => a + l.hi * l.weight, 0) : Math.max(...fvLegs.map((l) => l.value));

  // ── scenarios ──
  const start = driverStart(doc, fq);
  const scn = s.cases.map((c, i) => {
    const end = driverEndOf(start, c, s);
    // divCum: เก็บผ่านเสมอเมื่อ author ให้มา (informational แม้ divIncluded=false — schema อนุญาต) · total% ตัดสินด้วย scnBasis.divIncluded ใน derive() v2 อยู่แล้ว ไม่ใช่ตรงนี้
    return { name: SCN_NAMES[i], growth: c.growth, exitMultiple: c.exitMultiple, driverStart: start, driverEnd: end, tgt: exitTarget(s, end, c.exitMultiple, fq, i), divCum: c.divCum == null ? null : c.divCum, desc: c.desc };
  });

  // ── bridge → v2 report-data + stock-meta (ใช้ RV.derive ตัวจริง) ──
  const values = { px: mk.px, priceDate: mk.priceDate, dateEra: doc.dateEra, chgSuffix: mk.chgSuffix, fvLow: round2(fvLow), fvHigh: round2(fvHigh) };
  if (doc.analyst) values.analystTgt = doc.analyst.target;
  if (f.eps != null) values.eps = f.eps;
  if (f.shares != null) values.shares = f.shares;
  if (fq.revenue != null && fq.revenue > 0) values.revenue = fq.revenue;
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
    // mos/upside ปัด 1 ตำแหน่งเหมือนกระจก stock-meta ของ v2 (cron เขียน ≤1dp ทั้ง 909 ใบ) — ไม่งั้นการ์ด index/manifest ของ v3 โชว์ −27.52% ท่ามกลาง −27.5% (final review 2c-ii)
    ...smBase, price: mk.px, fairValue: round2(fv), mos: round1(d.mos), upside: round1(d.upside),
    pe: d.pe == null ? null : num4(d.pe), dividendYield: d.yield == null ? null : num4(d.yield), roe: f.roe == null ? null : f.roe,
  };
  const ad = RV.parseIso(doc.meta.analysisDate);
  const analysisDateText = PD.renderThaiDate(ad.day, ad.monIdx, ad.yearCE, doc.dateEra === 'BE');

  return { doc, d, legs, fv, fvLow, fvHigh, scn, chart, gauge, theme, gdots, analysisDateText, rd, sm, cur,
    fq, fx, stmtCur: STMT_SYMBOL[f.reportCurrency] || cur };
}

// "legs[0].inputs.x: ข้อความ" → { path, msg } · ทุกจุด throw ของ compute/legs ขึ้นต้นด้วย JSON path
const PATH_MSG = /^((?:legs|scenarios|meta|metrics|extras|fundamentals)[\w.[\]]*): ([\s\S]*)$/;
const splitErr = (e, fallback) => {
  const m = PATH_MSG.exec(String(e && e.message));
  return m ? { path: m[1], msg: m[2] } : { path: fallback, msg: String(e && e.message) };
};
/** error เชิงความหมายทุกข้อที่ compute() จะ throw — เก็บครบ **ก่อน** เรียก compute (spec §9 · open-item #52)
 *  สมมติว่าใบผ่าน S.validate แล้ว · ใช้ prepLeg/legValue/driverStart/themeOf ตัวเดียวกับ compute (ไม่ลอกตรรกะ)
 *  ครอบ: extrasRef ชี้ extras ที่ไม่มี · 'current' ไม่มีตัวตั้ง > 0 · legValue (ฐานไม่ครบ · r ≤ g · ค่าขา ≤ 0) + multipleRange
 *        · ฐาน driver ของฉากไม่มี/≤ 0 · ไม่มีสีแบรนด์ (seed และ themeLegacy) */
function semanticErrors(doc, opts) {
  const out = [];
  const { fx, fq } = quoteBasis(doc);
  doc.legs.forEach((leg, i) => {
    try {
      const { legQ, legM } = prepLeg(doc, leg, i, fq, fx);
      L.legValue(legM, fq, `legs[${i}]`);
      for (const m of leg.inputs.multipleRange || []) L.legValue({ ...legQ, inputs: { ...leg.inputs, multiple: m } }, fq, `legs[${i}].inputs.multipleRange`);
    } catch (e) { out.push(splitErr(e, `legs[${i}]`)); }
  });
  // exitTarget ทีละฉากด้วยตัวตั้งปลายฉากจริง · driverStart throw = รายงานแล้วบน scenarios.driver → ข้าม · error ซ้ำ (shares ขาด ทั้ง 3 ฉาก) รายงานครั้งเดียว
  try {
    const s = doc.scenarios, start = driverStart(doc, fq);
    s.cases.forEach((c, i) => {
      try { exitTarget(s, driverEndOf(start, c, s), c.exitMultiple, fq, i); } catch (e) {
        const x = splitErr(e, `scenarios.cases[${i}].exitMultiple`);
        if (!out.some((o) => o.path === x.path && o.msg === x.msg)) out.push(x);
      }
    });
  } catch (e) { out.push(splitErr(e, 'scenarios.driver')); }
  try { themeOf(doc, opts && opts.seeds, null); } catch (e) { out.push(splitErr(e, 'meta.themeLegacy')); }
  return out;
}

module.exports = { compute, semanticErrors, weightsOf, toQuote, SCN_NAMES, withBase, legValueOf };
