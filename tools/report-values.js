'use strict';
/**
 * report-values.js — ระยะ 2 (data layer · spec A(ข)) **เจ้าของเดียว** ของ:
 *   • schema `report-data.values` (v2)  • ตัวตรวจ `validateValues`  • ค่าที่ derive จากราคา/FV (`derive`)
 *   • token `{{rd:<key>}}` ที่ build render ลง HTML (`renderValues`)  • รูปแบบตัวเลขมาตรฐาน (fmtPrice/fmtBig/fmtMos/วันที่ พ.ศ.)
 * เดิมตัวเลขเดียวกันมีสำเนา 7–10 จุดใน HTML (ราคา ×7 · FV ×9 · MOS ×3) แล้ว cron ต้อง regex-replace ทีละจุด
 * ⇒ ว2: เก็บดิบใน values ที่เดียว · render ตอน build · cron แก้ JSON · gate อ่าน JSON
 * ★ ห้าม require build.js / update-prices.js / check-reports.js (กัน cycle — ทั้งสามชั้น require ไฟล์นี้)
 */
const DV = require('./derived-values.js');
const PD = require('./price-date.js');

const CUR_SYMBOL = { USD: '$', THB: '฿' };
const FLAT_PP = 0.75;        // |% รอบปี| < 0.75 → "ทรงตัว" (ย้ายจาก update-prices.js — ค่าเดิม ห้ามเปลี่ยน)
const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
const mosBand = (mos) => (mos < 10 ? 'bad' : mos < 20 ? 'ok' : 'good');   // ย้ายจาก update-prices.js (W04/agent-prompt ใช้กติกาเดียวกัน)
// format ราคาสำหรับโชว์: 2 ตำแหน่งเสมอ + comma เมื่อ ≥1000 (ย้ายจาก update-prices.js)
function fmtPrice(p) {
  const s = round(p, 2).toFixed(2);
  const [i, d] = s.split('.');
  return (Math.abs(p) >= 1000 ? Number(i).toLocaleString('en-US') : i) + '.' + d;
}
// ป้าย % รอบปี จากจุดแรก→จุดท้ายของกราฟ (ย้ายจาก update-prices.js — ข้อความ/เกณฑ์เดิมเป๊ะ)
function annualChg(data, suffix) {
  const first = data[0][1], last = data[data.length - 1][1];
  let pct = first > 0 ? (last - first) / first * 100 : null;
  if (pct == null || Math.abs(pct) < FLAT_PP) return { text: `≈ ทรงตัว ${suffix}`, dir: 'flat', pct };
  if (pct > 0) return { text: `▲ +${pct.toFixed(1)}% ${suffix}`, dir: 'up', pct };
  return { text: `▼ −${Math.abs(pct).toFixed(1)}% ${suffix}`, dir: 'down', pct };
}
// Market Cap แบบมาตรฐานต่อสกุล — เลือกหน่วยใหญ่สุดที่ ≤ ค่า · 3 หลักมีนัย (≥100 → 0 ตำแหน่ง · ≥10 → 1 · ไม่งั้น 2)
const BIG_UNITS = {
  '$': [['T', 1e12], ['B', 1e9], ['M', 1e6]],
  '฿': [[' ล้านล้าน', 1e12], [' แสนล้าน', 1e11], [' หมื่นล้าน', 1e10], [' พันล้าน', 1e9], [' ล้าน', 1e6]],
};
function fmtBig(v, cur) {
  const units = BIG_UNITS[cur] || BIG_UNITS['$'];
  const [u, sc] = units.find(([, s]) => v >= s) || units[units.length - 1];
  const n = v / sc;
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return cur + s + u;
}
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = ({ day, monIdx, yearCE }) => `${yearCE}-${pad2(monIdx + 1)}-${pad2(day)}`;
function parseIso(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso)); if (!m) return null; return { yearCE: +m[1], monIdx: +m[2] - 1, day: +m[3] }; }

const isV2 = (rd) => !!(rd && typeof rd === 'object' && rd.v === 2);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const CHG_SUFFIX = ['รอบปี', 'ตั้งแต่ IPO'];
const PER_YEAR = ['cagr', 'linear', null];
// schema ของ values — req = ต้องมี · opt = มีได้/null ได้ (token ที่อ้างค่า null จะ throw ตอน render)
const VALUE_KEYS = {
  px: { req: true, check: (v) => isNum(v) && v > 0, why: 'ต้องเป็นตัวเลข > 0' },
  priceDate: { req: true, check: (v) => !!parseIso(v), why: 'ต้องเป็น ISO "YYYY-MM-DD" (ค.ศ.)' },
  chgSuffix: { req: true, check: (v) => CHG_SUFFIX.includes(v), why: `ต้องเป็นหนึ่งใน ${JSON.stringify(CHG_SUFFIX)}` },
  fvLow: { check: (v) => isNum(v) && v > 0 }, fvHigh: { check: (v) => isNum(v) && v > 0 },
  analystTgt: { check: (v) => isNum(v) && v > 0 },
  eps: { check: isNum }, shares: { check: (v) => isNum(v) && v >= 1e5, why: 'จำนวนหุ้นทั้งบริษัท (หุ้น ไม่ใช่ล้านหุ้น) ≥ 1e5' },
  revenue: { check: (v) => isNum(v) && v > 0 }, dps: { check: (v) => isNum(v) && v >= 0 }, bvps: { check: (v) => isNum(v) && v > 0 },
  baseEps: { check: isNum },
  scenarios: { check: (v) => Array.isArray(v) && v.length === 3 && v.every((s) => s && typeof s === 'object' && isNum(s.tgt) && s.tgt > 0 && (s.div == null || (isNum(s.div) && s.div >= 0)) && Object.keys(s).every((k) => k === 'tgt' || k === 'div')), why: 'ต้องเป็น 3 ฉาก [{tgt, div|null}] (bear/base/bull)' },
  scnBasis: { check: (v) => v && typeof v === 'object' && Number.isInteger(v.years) && v.years >= 1 && v.years <= 10 && typeof v.divIncluded === 'boolean' && PER_YEAR.includes(v.perYear) && Object.keys(v).every((k) => ['years', 'divIncluded', 'perYear'].includes(k)), why: 'ต้องเป็น {years:1..10, divIncluded:boolean, perYear:"cagr"|"linear"|null}' },
};
function validateValues(rd, sm) {
  if (!isV2(rd)) throw new Error('report-data.v ต้องเป็น 2 จึงมี values');
  const v = rd.values;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('report-data.values ต้องเป็น object');
  for (const k of Object.keys(v)) if (!VALUE_KEYS[k]) throw new Error(`report-data.values.${k} ไม่อยู่ใน schema v2 (คีย์ที่รู้จัก: ${Object.keys(VALUE_KEYS).join(', ')})`);
  for (const [k, spec] of Object.entries(VALUE_KEYS)) {
    const has = v[k] != null;
    if (spec.req && !has) throw new Error(`report-data.values.${k} ต้องมี (v2)`);
    if (has && !spec.check(v[k])) throw new Error(`report-data.values.${k} ${spec.why || 'ค่าไม่ถูกต้อง'} — พบ ${JSON.stringify(v[k])}`);
  }
  if (!isNum(rd.fv) || rd.fv <= 0) throw new Error('report-data.fv ต้องเป็นตัวเลข > 0');
  if (rd.gauge && rd.gauge.cur != null) throw new Error('v2 ห้ามมี gauge.cur — engine ใช้ values.px (สำเนาเดียว)');
  if (rd.gauge && rd.gauge.fair != null) throw new Error('v2 ห้ามมี gauge.fair — engine ใช้ fv (สำเนาเดียว)');
  if (rd.chart && rd.chart.fairLine != null) throw new Error('v2 ห้ามมี chart.fairLine — engine ใช้ fv (สำเนาเดียว)');
  if (!sm || !CUR_SYMBOL[sm.currency]) throw new Error(`stock-meta.currency ต้องเป็น USD/THB (สัญลักษณ์หน้าราคา render จากตรงนี้) — พบ ${JSON.stringify(sm && sm.currency)}`);
  return v;
}
function derive(rd, sm) {
  const v = rd.values, fv = rd.fv, px = v.px, cur = CUR_SYMBOL[sm.currency];
  const mos = (fv - px) / fv * 100, upside = (fv - px) / px * 100;
  const mosText = DV.fmtMos(mos);
  const pd = parseIso(v.priceDate);
  const b = v.scnBasis || { years: 3, divIncluded: false, perYear: null };
  const scenarios = (v.scenarios || []).map((s) => {
    const total = (s.tgt + (b.divIncluded && s.div ? s.div : 0) - px) / px * 100;
    const perYear = b.perYear === 'cagr' ? (Math.pow(1 + total / 100, 1 / b.years) - 1) * 100 : b.perYear === 'linear' ? total / b.years : null;
    return { tgt: s.tgt, div: s.div == null ? null : s.div, total, perYear, cls: total >= 0 ? 'pos' : 'neg' };
  });
  return {
    cur, px, fv, mos, mosText, mosShown: parseFloat(mosText.replace('−', '-')), mosClass: mosBand(mos), upside,
    mos20: round(fv * 0.8, 2), mos30: round(fv * 0.7, 2),
    chg: annualChg(rd.chart.data, v.chgSuffix),
    priceDate: { ...pd, iso: v.priceDate, text: PD.renderThaiDate(pd.day, pd.monIdx, pd.yearCE, true) },
    pe: isNum(v.eps) && v.eps > 0 ? px / v.eps : null,
    mcap: isNum(v.shares) ? px * v.shares : null,
    ps: isNum(v.shares) && isNum(v.revenue) ? px * v.shares / v.revenue : null,
    yield: isNum(v.dps) ? v.dps / px * 100 : null,
    pbv: isNum(v.bvps) ? px / v.bvps : null,
    analystPct: isNum(v.analystTgt) ? (v.analystTgt - px) / px * 100 : null,
    scenarios, scnBasis: v.scnBasis || null, values: v,
  };
}
const need = (val, key) => { if (val == null) throw new Error(`report-data.values.${key} ต้องมีค่าเมื่อใช้ token ที่อ้างถึง`); return val; };
const money = (d, val, key) => d.cur + fmtPrice(need(val, key));
const ret = (s) => DV.fmtMos(s.total) + (s.perYear == null ? '' : ` (${DV.fmtMos(s.perYear)}/ปี)`);
const scn = (d, i) => need(d.scenarios[i], 'scenarios');
const TOKENS = {
  px: (d) => money(d, d.px, 'px'), pxNum: (d) => String(d.px), priceDate: (d) => d.priceDate.text, chg: (d) => d.chg.text,
  fv: (d) => money(d, d.fv, 'fv'), fvLow: (d) => money(d, d.values.fvLow, 'fvLow'), fvHigh: (d) => money(d, d.values.fvHigh, 'fvHigh'),
  mos: (d) => d.mosText, mosClass: (d) => d.mosClass, mos20: (d) => money(d, d.mos20, 'mos20'), mos30: (d) => money(d, d.mos30, 'mos30'),
  upside: (d) => DV.fmtMos(d.upside),
  analystTgt: (d) => money(d, d.values.analystTgt, 'analystTgt'), analystPct: (d) => DV.fmtMos(need(d.analystPct, 'analystTgt')),
  pe: (d) => need(d.pe, 'eps').toFixed(1), mcap: (d) => fmtBig(need(d.mcap, 'shares'), d.cur), ps: (d) => need(d.ps, 'shares/revenue').toFixed(1),
  yield: (d) => need(d.yield, 'dps').toFixed(1) + '%', pbv: (d) => need(d.pbv, 'bvps').toFixed(2),
  baseEps: (d) => money(d, d.values.baseEps, 'baseEps'), scnNote: (d) => (d.scnBasis && d.scnBasis.divIncluded ? ' • รวมปันผล' : ''),
};
for (const i of [0, 1, 2]) {
  TOKENS[`sc${i + 1}tgt`] = (d) => money(d, scn(d, i).tgt, `scenarios[${i}].tgt`);
  TOKENS[`sc${i + 1}div`] = (d) => money(d, scn(d, i).div, `scenarios[${i}].div`);
  TOKENS[`sc${i + 1}ret`] = (d) => ret(scn(d, i));
  TOKENS[`sc${i + 1}retClass`] = (d) => scn(d, i).cls;
}
const TOKEN_RE = /\{\{rd:([A-Za-z0-9]+)\}\}/g;
function renderValues(html, rd, sm) {
  const d = derive(rd, sm);
  const out = String(html).replace(TOKEN_RE, (m, k) => {
    const f = TOKENS[k];
    if (!f) throw new Error(`token {{rd:${k}}} ไม่รู้จัก (มี: ${Object.keys(TOKENS).join(', ')})`);
    return String(f(d));
  });
  const left = out.match(/\{\{rd:[^}]{0,40}/);
  if (left) throw new Error(`เหลือ token {{rd:…}} ที่ render ไม่ได้: ${left[0]}`);
  return out;
}
module.exports = { CUR_SYMBOL, FLAT_PP, VALUE_KEYS, CHG_SUFFIX, isV2, validateValues, derive, TOKENS, COPY_TOKENS: Object.keys(TOKENS), renderValues,
  fmtPrice, fmtBig, annualChg, mosBand, isoOf, parseIso };
