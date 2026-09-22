'use strict';
/**
 * report-values.js — ระยะ 2 (data layer · spec A(ข)) **เจ้าของเดียว** ของ:
 *   • schema `report-data.values` (v2)  • ตัวตรวจ `validateValues`  • ค่าที่ derive จากราคา/FV (`derive`)
 *   • token `{{rd:<key>}}` ที่ build render ลง HTML (`renderValues`)  • รูปแบบตัวเลขมาตรฐาน (fmtPrice/fmtBig/fmtMos/วันที่ พ.ศ.)
 * เดิมตัวเลขเดียวกันมีสำเนา 7–10 จุดใน HTML (ราคา ×7 · FV ×9 · MOS ×3) แล้ว cron ต้อง regex-replace ทีละจุด
 * ⇒ ว2: เก็บดิบใน values ที่เดียว · render ตอน build · cron แก้ JSON · gate อ่าน JSON
 * ★ ห้าม require build.js / update-prices.js / check-reports.js (กัน cycle — ทั้งสามชั้น require ไฟล์นี้)
 *   (report-meta.js require ได้ — มันไม่ require อะไรในรีโปเลย · ใช้ใน mirrorStockMeta)
 */
const DV = require('./derived-values.js');
const PD = require('./price-date.js');
const RM = require('./report-meta.js');   // ไม่ require อะไรในรีโป (ไม่มี cycle) — mirrorStockMeta อ่าน/เขียนบล็อก stock-meta

const CUR_SYMBOL = { USD: '$', THB: '฿' };
const FLAT_PP = 0.75;        // |% รอบปี| < 0.75 → "ทรงตัว" (ย้ายจาก update-prices.js — ค่าเดิม ห้ามเปลี่ยน)
const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
const mosBand = DV.mosBand;   // เจ้าของเดียวอยู่ที่ derived-values.js แล้ว (23 ก.ย. 69 · open-items #43 — กัน cycle RV↔DV ตอนตัวเขียนช่องสรุปต้องใช้ด้วย)
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
  let idx = units.findIndex(([, s]) => v >= s);
  if (idx < 0) idx = units.length - 1;
  for (;;) {
    const [u, sc] = units[idx];
    const n = v / sc;
    const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
    // ปัดแล้วแตะ/เกินอัตราส่วนไปหน่วยที่ใหญ่กว่าถัดไป (1000 ปกติ · 10 สำหรับช่วงแสนล้าน→ล้านล้าน)
    // ⇒ เลือกหน่วยใหม่ "หลัง" ปัดเศษ ไม่ใช่ก่อน (9.996e11 ต้องได้ "$1.00T" ไม่ใช่ "$1000B")
    if (idx > 0) {
      const ratio = units[idx - 1][1] / sc;
      if (parseFloat(s) >= ratio) { idx--; continue; }
    }
    return cur + s + u;
  }
}
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = ({ day, monIdx, yearCE }) => `${yearCE}-${pad2(monIdx + 1)}-${pad2(day)}`;
function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // กันวันที่เป็นไปไม่ได้ เช่น 2026-02-29 / 2026-13-01 (Date.UTC ไหลเดือน/วันเงียบ ๆ)
  return { yearCE: y, monIdx: mo - 1, day: d };
}

// serialize report-data สไตล์เดิม (จุดกราฟ [label, num] / array ตัวเลขล้วนบรรทัดเดียว) — ย้ายจาก
// tools/update-prices.js (เจ้าของเดียว, ระยะ 2 ส่วน B) · migrate-annual-chg.js เดิมมีสำเนาซ้ำ — ยุบมาที่นี่แล้ว
// · tools/apply-edits.js (--set/--del) ใช้ตัวนี้ตอนเขียนกลับ report-data JSON เช่นกัน
function styledRD(rd) {
  let s = JSON.stringify(rd, null, 2);
  s = s.replace(/\[\n\s*("(?:[^"\\]|\\.)*"),\n\s*(-?\d+(?:\.\d+)?)\n\s*\]/g, '[$1, $2]');
  s = s.replace(/\[\n\s*((?:-?\d+(?:\.\d+)?,\n\s*)*-?\d+(?:\.\d+)?)\n\s*\]/g,
    (m, body) => '[' + body.replace(/,\n\s*/g, ', ') + ']');
  return s;
}

const isV2 = (rd) => !!(rd && typeof rd === 'object' && rd.v === 2);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const CHG_SUFFIX = ['รอบปี', 'ตั้งแต่ IPO'];
const PER_YEAR = ['cagr', 'linear', null];
// schema ของ values — req = ต้องมี · opt = มีได้/null ได้ (token ที่อ้างค่า null จะ throw ตอน render)
const VALUE_KEYS = {
  px: { req: true, check: (v) => isNum(v) && v > 0, why: 'ต้องเป็นตัวเลข > 0' },
  priceDate: { req: true, check: (v) => !!parseIso(v), why: 'ต้องเป็น ISO "YYYY-MM-DD" (ค.ศ.)' },
  dateEra: { req: true, check: (v) => v === 'BE' || v === 'CE', why: "ต้องเป็น 'BE' (พ.ศ.) หรือ 'CE' (ค.ศ.) — migrator เก็บศักราชเดิมของไฟล์ ใบใหม่ใช้ BE" },
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
  if ((v.scenarios != null) !== (v.scnBasis != null)) throw new Error('report-data.values.scenarios กับ scnBasis ต้องมาคู่กัน (มีทั้งคู่หรือไม่มีเลย)');
  if (v.scnBasis && v.scnBasis.divIncluded && v.scenarios.some((s) => s.div == null)) throw new Error('report-data.values.scnBasis.divIncluded = true แต่ scenarios[i].div เป็น null — ผลตอบแทน "รวมปันผล" ต้องมีปันผลครบ 3 ฉาก');
  if (!isNum(rd.fv) || rd.fv <= 0) throw new Error('report-data.fv ต้องเป็นตัวเลข > 0');
  if (rd.gauge && rd.gauge.cur != null) throw new Error('v2 ห้ามมี gauge.cur — engine ใช้ values.px (สำเนาเดียว)');
  if (rd.gauge && rd.gauge.fair != null) throw new Error('v2 ห้ามมี gauge.fair — engine ใช้ fv (สำเนาเดียว)');
  if (rd.chart && rd.chart.fairLine != null) throw new Error('v2 ห้ามมี chart.fairLine — engine ใช้ fv (สำเนาเดียว)');
  if (!sm) throw new Error('ไม่มีบล็อก stock-meta หรือ JSON เสีย — v2 ต้องใช้ stock-meta.currency ในการ render');
  if (!CUR_SYMBOL[sm.currency]) throw new Error(`stock-meta.currency ต้องเป็น USD/THB (สัญลักษณ์หน้าราคา render จากตรงนี้) — พบ ${JSON.stringify(sm.currency)}`);
  return v;
}
function derive(rd, sm) {
  const v = rd.values, fv = rd.fv, px = v.px, cur = CUR_SYMBOL[sm.currency];
  const mos = (fv - px) / fv * 100, upside = (fv - px) / px * 100;
  const mosText = DV.fmtMos(mos);
  const pd = parseIso(v.priceDate);
  const b = v.scnBasis;
  const scenarios = (v.scenarios || []).map((s) => {
    const total = (s.tgt + (b.divIncluded && s.div ? s.div : 0) - px) / px * 100;
    // ★ scenarioPlan() (derived-values.js:549-554) คำนวณ %/ปี จากค่า total **ที่จะถูกเขียน/โชว์จริง** (ปัดแล้ว)
    //   ไม่ใช่ค่าดิบ — ไม่งั้นรอบนี้คิดจากดิบ แต่รอบถัดไป (cron healer/W17) อ่านค่าที่ render ไปแล้วกลับมา ได้
    //   คนละคำตอบ ⇒ ไฟล์ถูกเขียนซ้ำทุกรอบ (เจอจริง 20 ส.ค. 69: SNOW/CEG/KLAC/NOW/PANW · เอี่ยวกับ cron ล้ม 2 ก.ย. 69)
    //   v2 ต้องยึดฐานเดียวกับ scenarioPlan ไม่งั้นตัวเลขที่คนเห็นเพี้ยนจากที่ cron/W17 อ้างอิง (พบจริงใน fixture
    //   นี้เอง: AAPL Bull +9%→+8%) — ปัดด้วยการ **round-trip ผ่าน fmtMos เอง** (ไม่ก๊อปกติ 0dp/1dp ซ้ำ) กัน
    //   fmtMos เปลี่ยนกติกาการปัดในอนาคตแล้วช่องว่างนี้เปิดใหม่แบบเงียบ ๆ
    const totalShown = parseFloat(DV.fmtMos(total).replace('−', '-').replace('%', ''));
    const perYear = b.perYear === 'cagr' ? (Math.pow(1 + totalShown / 100, 1 / b.years) - 1) * 100 : b.perYear === 'linear' ? totalShown / b.years : null;
    return { tgt: s.tgt, div: s.div == null ? null : s.div, total, perYear, cls: total >= 0 ? 'pos' : 'neg' };
  });
  return {
    cur, px, fv, mos, mosText, mosShown: parseFloat(mosText.replace('−', '-')), mosClass: mosBand(mos), upside,
    mos20: round(fv * 0.8, 2), mos30: round(fv * 0.7, 2),
    // cron (tools/update-prices.js:464) เรียก annualChg ด้วย suffix ที่ห่อวงเล็บไว้แล้วเสมอ
    // ("(รอบปี)"/"(ตั้งแต่ IPO)") ⇒ ห่อวงเล็บที่นี่ด้วยให้ .chg ของ v2 ตรงรูปเดียวกับที่ cron เขียน (byte-identical
    // กับคลัง v1 ทั้ง 908 ใบ) — ★ ไม่ใช่เพราะ E35 บังคับรูปนี้: E35 (test/check-reports.js) ตรวจแค่ว่ามีคำ
    // "รอบปี"/"IPO" เป็น substring ของ .chg เท่านั้น (`/รอบปี/.test(c.chg)` ไม่สนวงเล็บ)
    chg: annualChg(rd.chart.data, '(' + v.chgSuffix + ')'),
    // ★ ศักราชเป็น "ข้อมูลของไฟล์" ไม่ใช่ค่าคงที่ของระบบ (คลัง 12 ก.ย. 69: วันที่ราคาหัวรายงาน BE 737 / CE 171)
    //   ⇒ render ตาม values.dateEra — migration จึงไม่พลิกหน้าตาใบไหน · hard-code พ.ศ. = เขียนวันที่ที่คนเห็นใหม่
    //   ให้ 171 ใบเงียบ ๆ โดย masked text diff ของ migrator จับไม่ได้ (ตัวเลขถูก mask)
    priceDate: { ...pd, iso: v.priceDate, era: v.dateEra, text: PD.renderThaiDate(pd.day, pd.monIdx, pd.yearCE, v.dateEra === 'BE') },
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
  pe: (d) => {
    // eps มีค่า (ผ่าน validateValues แล้ว) แต่ ≤0 → d.pe เป็น null ตามสูตร derive() — แยกข้อความจากเคส "ไม่มี eps เลย"
    if (d.values.eps != null && !(d.values.eps > 0)) throw new Error('report-data.values.eps ≤ 0 — ไม่มี P/E ห้ามใช้ token {{rd:pe}}');
    return need(d.pe, 'eps').toFixed(1);
  },
  mcap: (d) => fmtBig(need(d.mcap, 'shares'), d.cur),
  ps: (d) => {
    // เช็คคู่กับ pe ข้างบน — ปัจจุบัน validateValues บังคับ shares≥1e5 และ revenue>0 เสมอ จึงยังไม่มีทางเข้าเคสนี้จริง
    // (ไว้กันโครงพัง/เปลี่ยนเกณฑ์ในอนาคตแบบเงียบ ๆ ไม่ใช่เคสที่ทดสอบได้วันนี้)
    if (d.values.shares != null && d.values.revenue != null && !(d.ps > 0)) throw new Error('report-data.values.revenue ≤ 0 — ไม่มี P/S ห้ามใช้ token {{rd:ps}}');
    return need(d.ps, 'shares/revenue').toFixed(1);
  },
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
  validateValues(rd, sm);   // ก่อน derive เสมอ — กัน fv:0/priceDate เพี้ยน ทำให้ derive() คำนวณ −Infinity%/NaN เงียบ ๆ
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
// ── V2TOKENS: site บังคับของใบ v2 ต้องเป็น token ไม่ใช่ literal (ระยะ 2 ส่วน F · carry จาก final review ส่วน D) ──
// เกณฑ์จบระยะ 2 ข้อ 1 คือ "สำเนาต่อค่า = 1" — migrator บังคับเรื่องนี้ตอน**ย้าย** (`REQUIRED_SITES` ใน
// tools/migrate-v2.js) แต่หลังย้ายแล้วไม่มีใครกันไม่ให้ใครเขียน literal ทับกลับเข้าไป: ใบ v2 ที่หัวรายงานเป็น
// `<div class="px">฿150.00` จะ **ผ่าน gate เงียบ ๆ** (E30/E41 อ่านค่าจาก JSON ทาง ctx.dv แล้ว ไม่ได้อ่าน .px อีก)
// แล้วราคาที่คนเห็นก็ค้างตลอดไปเพราะ cron ทาง v2 เขียนแต่ JSON ⇒ กลับไปเป็นโรคเดิมที่ระยะ 2 ทั้งระยะมาแก้
// ⇒ check โครงสร้างถาวร: ใบที่ประกาศ v2 **ต้องมี token ที่ทุก site บังคับ** ใน *ต้นฉบับก่อน expand*
// ★ นับคลังก่อนเปิด (14 ก.ย. 2569): 865 ใบ v2 · ขาด 0 ใบ · skeleton th/us ผ่านทั้งคู่
//   · **ระยะ 3 Task 12 (15 ก.ย. 2569)**: ขยายเป็น **13 ช่อง** (+6 ช่องผูก FV — ดูบล็อก "ชั้นที่ 2" ใต้รายการ) ·
//     นับคลังก่อนเปิด: v2 883 ใบ · ขาด 0 ใบทั้ง 6 ช่อง · skeleton th/us + fixtures v2 ทั้ง 7 ใบผ่าน
// ★ ทำไม site พวกนี้: เป็นช่องที่ **cron ทาง v2 ไม่มีตัวเขียน HTML ให้แล้ว** (patchReport return ก่อนตัวเขียนสำเนา v1)
//   ⇒ ถ้าช่องไหนกลับเป็น literal ค่าจะค้างโดยไม่มีตัวซ่อมไหนเอื้อมถึง · ช่องอื่น (การ์ด P/E · ปันผล · หมวด 6 ·
//   **ช่องสรุป "ส่วนต่างจากราคา"**) ยังมี pass derived เขียนทับได้อยู่ จึงไม่อยู่ในรายการบังคับ
//   (วัดด้วย mutation รอบรีวิว: ช่องสรุปที่ถูกเปลี่ยนเป็น literal ถูก `patchDerived` เขียนทับให้ในรอบถัดไป ⇒ ไม่ค้าง ·
//    ส่วน `#mCur` ที่ถูกเปลี่ยนเป็น literal **ไม่มีใครเขียนทับ** เหลือแค่ W22 ซึ่งเป็น warn ⇒ ต้องอยู่ในรายการ — fix round 1 R1)
// ★★ **อย่าสับสนกับ `REQUIRED_SITES` (14 ช่อง) ใน tools/migrate-v2.js** — คนละรายการ คนละหน้าที่:
//   · `REQUIRED_SITES` (migrator) = ช่องที่ **ต้อง tokenise สำเร็จตอนย้าย** ไม่งั้นไม่ย้ายทั้งใบ
//   · `REQUIRED_TOKEN_SITES` (ที่นี่) = ช่องที่ **ต้องคงเป็น token ตลอดไป** (หลังย้ายแล้วห้ามมีใครเขียน literal ทับกลับ)
//   ⇒ **ที่นี่ต้องเป็นสับเซตของที่นั่นเสมอ** (self-test ตรึงไว้) · ส่วนต่างที่เหลือรอบนี้ = `summary` ช่องเดียว
//     (14 − 13) ซึ่งมี `summaryPlan` เป็นตัวเขียน จึงไม่เข้าเกณฑ์ "ไม่มีใครเอื้อมถึง" — open-items #44
// ★★★ **ขอบเขตที่ตรวจ = "มี token อยู่" ไม่ใช่ "ช่องนี้เป็น token ทั้งช่อง"** (fix round 1 R3 · m2): literal ที่ **เพิ่มมา
//   ข้าง ๆ** token ที่ถูกต้อง (เช่นมี `<div class="big">` สองอัน) จะผ่านเงียบ — คลัง 14 ก.ย. 69 ไม่มีเคสนี้ (ใบ v2 ที่
//   `<div class="big">` ปรากฏ ≠ 1 ครั้ง = 0 ใบ) · ไม่เพิ่ม uniqueness check โดยตั้งใจ: การนับจำนวนครั้งของมาร์กอัป
//   จะทำให้ error ระดับ gate ผูกกับโครง HTML (ใบที่จัดมาร์กอัปใหม่โดยไม่มีอะไรเสียจะตก) — แลกไม่คุ้มกับเคสที่ยังไม่เกิด
const V2T_HEADER_RE = /<header[\s\S]*?<\/header>/i;
const REQUIRED_TOKEN_SITES = [
  { id: 'px', token: 'px', where: 'หัวรายงาน .px', has: (s) => RM.PX_TOKEN_RE.test(s) },
  // ป้าย gauge "ปัจจุบัน $X" — ตัวเขียนของ v1 คือ RM.MCUR_LABEL_PARTS_RE ซึ่ง patchReport **ไม่เรียกแล้วเมื่อเป็น v2**
  { id: 'mCur', token: 'px', where: 'ป้าย gauge #mCur ("ปัจจุบัน …")', has: (s) => RM.MCUR_TOKEN_RE.test(s) },
  { id: 'chg', token: 'chg', where: 'ป้าย % รอบปี .chg', has: (s) => /<div class="chg">\s*\{\{rd:chg\}\}\s*<\/div>/.test(s) },
  { id: 'priceDate', token: 'priceDate', where: 'วันที่ราคาใน <header>', has: (s) => { const m = s.match(V2T_HEADER_RE); return !!m && m[0].includes('{{rd:priceDate}}'); } },
  { id: 'pxIn', token: 'pxNum', where: 'ช่องกรอกราคา #pxIn', has: (s) => /id="pxIn"[^>]*\bvalue="\{\{rd:pxNum\}\}"/.test(s) },
  { id: 'big', token: 'mos', where: 'MOS ตัวใหญ่ .big', has: (s) => /<div class="big">\s*\{\{rd:mos\}\}\s*<\/div>/.test(s) },
  { id: 'verdict', token: 'mosClass', where: 'คลาสกล่อง verdict', has: (s) => /class="mos-verdict \{\{rd:mosClass\}\}"/.test(s) },
  // ── ชั้นที่ 2: ช่องผูก **FV** (ระยะ 3 Task 12) ───────────────────────────────────────────────
  // เดิมเว้นไว้เพราะ "FV ไม่ขยับตามราคา ⇒ ค้างแล้วไม่อันตรายเท่า และมี W22 ดูแล" — เหตุผลนั้นไม่พอ:
  //   (ก) เกณฑ์คัดเข้ารายการจริง ๆ คือ **"cron ทาง v2 ไม่มีตัวเขียน HTML ให้ช่องนี้"** ไม่ใช่ "ขยับตามราคาไหม" —
  //       และ 6 ช่องนี้ไม่มีตัวเขียนเช่นกัน (ค้นทั้ง tools/derived-values.js + tools/update-prices.js + tools/keep-map.js
  //       ไม่มี pass ไหนแตะ `fv-box` / `legend` / `#mFair` / การ์ด "จุดซื้อ MOS" / `vcell` เลย)
  //   (ข) FV **เปลี่ยนได้จริง** — `apply-edits --set fv=…` เขียน `report-data.values.fv` แล้วจบ ⇒ ถ้าช่องไหนเป็น
  //       literal ค่าที่คนเห็นแยกออกจาก JSON ทันที เหลือแต่ `W22` ซึ่งเป็น **warn** (ไม่บล็อก push · open-items #25/#36)
  //   (ค) migrator บังคับทั้ง 6 ช่องนี้อยู่แล้วตอนย้าย (`REQUIRED_SITES` required:true) ⇒ ใบ v2 ทุกใบมีอยู่แล้ว
  //       การเพิ่มเข้า gate จึงเป็นการ **กันเขียน literal ทับกลับ** ไม่ใช่การตั้งเกณฑ์ใหม่ที่คลังยังไม่ถึง
  // ★ วัดคลังก่อนเปิด (15 ก.ย. 2569): v2 883 ใบ (+ residue v1 25 ใบที่ check นี้ไม่แตะ) → **ขาด 0 ใบทั้ง 6 ช่อง** ·
  //   skeleton th/us ผ่านทั้งคู่ · fixtures v2 ทั้ง 7 ใบผ่าน
  // ★★ **รูปของแต่ละช่องต้องตรงกับตัวแทนของ migrator เป๊ะ** (tools/migrate-v2.js: FVBOX_R_RE · LEGEND_RE · MFAIR_RE ·
  //   MOSCARD_RE · VCELL_FV_RE/VCELL_FV_RANGE_RE) — ที่นั่นคือ "เจ้าของรูป" · ที่นี่คือ "มี token อยู่ที่นั่นไหม"
  //   (self-test ตรึงไว้ว่ารายการนี้ต้องเป็นสับเซตของ `MG.REQUIRED_SITES` เสมอ)
  // ★★★ ช่องที่ 14 ของ migrator — `summary` ("ส่วนต่างจากราคา") — **ยังไม่เข้ารายการโดยตั้งใจ**: มันมีตัวเขียนจริง
  //   (`summaryPlan` = patchDerived #11 · ระยะ 1 ข้อ D) ⇒ ไม่เข้าเกณฑ์ "ไม่มีใครเอื้อมถึง" และการยกเป็น error จะ
  //   เปลี่ยนสภาพที่ cron ซ่อมเองได้ให้กลายเป็น `patch-rejected` กักไฟล์ (open-items #44)
  { id: 'fvBox', token: 'fv', where: 'กล่อง fv-box ช่อง .r', has: (s) => /class="fv-box"[\s\S]*?<div class="r">\s*\{\{rd:fv\}\}/.test(s) },
  { id: 'legend', token: 'fv', where: 'legend ของกราฟ ("มูลค่าเหมาะสม …")', has: (s) => /<div class="legend">[\s\S]*?มูลค่าเหมาะสม[^<]{0,24}?\{\{rd:fv\}\}\s*<\/span>/.test(s) },
  { id: 'mFair', token: 'fv', where: 'ป้าย gauge #mFair ("เหมาะสม …")', has: (s) => /id="mFair"><div class="lab"[^>]*>เหมาะสม[^<]{0,24}?\{\{rd:fv\}\}\s*<\/div>/.test(s) },
  { id: 'mos20card', token: 'mos20', where: 'การ์ด "จุดซื้อ MOS 20%"', has: (s) => /จุดซื้อ MOS 20%<\/div>\s*<div class="v[^"]*">\s*\{\{rd:mos20\}\}/.test(s) },
  { id: 'mos30card', token: 'mos30', where: 'การ์ด "จุดซื้อ MOS 30%"', has: (s) => /จุดซื้อ MOS 30%<\/div>\s*<div class="v[^"]*">\s*\{\{rd:mos30\}\}/.test(s) },
  { id: 'vcellFv', token: 'fv', where: 'vcell "มูลค่าเหมาะสม" (กล่องสรุป)', has: (s) => /<div class="vcell">\s*<div class="k">มูลค่าเหมาะสม[^<]*<\/div>\s*<div class="v"[^>]*>\s*\{\{rd:fv\}\}/.test(s) },
];
/** site บังคับที่ **ไม่ได้** เป็น token ในต้นฉบับ → [{id, token, where}] · ว่าง = ครบ
 *  ★ รับ **source ก่อน expand** เสมอ (ctx.source) เหมือน proseBoundHits — ส่ง HTML ที่ render แล้วมา = ขาดทุก site */
function missingTokenSites(src) {
  const s = String(src);
  return REQUIRED_TOKEN_SITES.filter((x) => !x.has(s)).map(({ id, token, where }) => ({ id, token, where }));
}

// ── prose ที่ผูกกับราคา (E44 · ระยะ 2 ส่วน F · spec B(ข)) ──────────────────────────────────
// ปัญหา: cron **แตะ prose ไม่ได้** (CLAUDE.md §9) ⇒ ตัวเลขที่ derive จากราคาซึ่งถูกพิมพ์เป็น literal ในย่อหน้า
// ค้างอยู่กับราคาเก่าตลอดไป โดยไม่มีตัวซ่อมไหนเอื้อมถึง (W15 เตือนได้แค่ "% ของราคาเป้า" อย่างเดียว)
// ทางแก้เชิงโครงสร้าง: **ใบที่วิเคราะห์ตั้งแต่ PROSE_TOKEN_SINCE เป็นต้นไป ห้ามพิมพ์ค่าพวกนี้เป็น literal**
// ต้องเขียนเป็น token `{{rd:…}}` ให้ build render ⇒ ค่าเดินตาม values เสมอ ไม่มีวันค้าง
// ★ วันตัดสิน = footer "ข้อมูล ณ" ของ **ไฟล์** (tools/queue/footer-date.js) ไม่ใช่วันที่รัน gate —
//   ใบเก่าจึงไม่ถูกยกเป็น error ย้อนหลัง (คลัง 14 ก.ย. 69: footer ทุกใบ < SINCE ⇒ E44 ยิง 0 ครั้ง)
//   ใบเก่าที่ยังเป็น literal = งานของระยะ 3 (fix-on-touch แบบเดียวกับที่ W23 ประกาศไว้)
const PROSE_TOKEN_SINCE = '2026-09-14';

// ขอบเขตที่นับว่าเป็น "prose" = เนื้อใน <p> · <li> · <div class="txt"> · <div class="hint">
// (นับความลึกของแท็กชื่อเดียวกัน เพราะ <li> ห่อ <div> ได้) — การ์ด (.v/.d/.mval) กับบล็อก JSON อยู่**นอก**ขอบเขต
// โดยตั้งใจ: E41/E42/E43/W16/W19/W20 + pass derived คุมส่วนนั้นอยู่แล้ว และ cron เขียนทับได้เอง
const PROSE_OPEN_RE = /<(p|li|div)\b([^>]*)>/gi;
const PROSE_DIV_CLASS = /\bclass\s*=\s*["'][^"']*\b(?:txt|hint)\b/;
function proseSpans(src) {
  const s = String(src);
  const found = [];
  const open = new RegExp(PROSE_OPEN_RE.source, 'gi');
  let m;
  while ((m = open.exec(s))) {
    const tag = m[1].toLowerCase(), attrs = m[2] || '';
    if (tag === 'div' && !PROSE_DIV_CLASS.test(attrs)) continue;
    const start = m.index + m[0].length;
    const pair = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
    pair.lastIndex = start;
    let depth = 1, mm, end = -1;
    while ((mm = pair.exec(s))) { if (mm[0][1] === '/') { if (!--depth) { end = mm.index; break; } } else depth++; }
    if (end < 0) continue;   // เปิดแล้วไม่ปิด = อ่านขอบเขตไม่ได้ → ไม่เดา (เงียบ)
    found.push([start, end]);
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = [];
  for (const sp of found) {
    const last = out[out.length - 1];
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);   // ซ้อนกัน (<li><div class="txt">) = ช่วงเดียว
    else out.push([...sp]);
  }
  return out;
}

// จำนวนเงิน (สกุลนำหน้าเสมอ เหมือนที่ token render) — กลุ่มเดียวเพื่อให้ตัดข้อความมาเทียบกับค่าที่ render ได้ตรง ๆ
const PB_MONEY = '((?:C\\$|[฿$])\\s*[0-9][0-9,]*(?:\\.[0-9]+)?)';
// คำที่ "เปลี่ยนเจ้าของตัวเลข" — ห้ามให้ช่องว่างระหว่างป้ายกับตัวเลขข้ามคำพวกนี้
// (วัดคลัง 908 ใบ 14 ก.ย. 69: ไม่กัน → "ราคาปัจจุบัน · EPS ฐาน ฿2.69" ถูกจับเป็นราคา · "มูลค่าเหมาะสมต่ำกว่าราคา ฿X" ถูกจับเป็น FV)
const PB_STOP = 'ราคา|เป้า|มูลค่าเหมาะสม|Fair|FV|EPS|ปันผล|BVPS|ต่อหุ้น|P/';
const pbGap = (n) => `((?:(?!${PB_STOP})[^0-9<{}%]){0,${n}}?)`;
const pbLen = (...xs) => xs.reduce((a, x) => a + x.length, 0);
const stripT = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// ตัวเลขที่พิมพ์ (มีสกุล/เครื่องหมาย/คอมมา/%) → { n, dec } · null = อ่านไม่ออก
function pbNum(text) {
  const t = String(text).replace(/[,\s]/g, '').replace(/−/g, '-');
  const m = t.match(/(-?)(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const dot = m[2].indexOf('.');
  return { n: parseFloat(m[1] + m[2]), dec: dot < 0 ? 0 : m[2].length - dot - 1 };
}
// "เลขที่พิมพ์ = ค่าที่ไฟล์ประกาศไว้" — เผื่อครึ่งหลักสุดท้ายของความละเอียดที่พิมพ์ ("฿21" ครอบ 20.5–21.5)
// ★ ใช้ **เฉพาะฝั่งตรวจ** (ยอมรับการปัด) ไม่ใช่ฝั่งเขียน (ฝั่งเขียนต้องเท่ากันทุก byte — ดู proseTokens)
function pbOwns(shown, want) {
  const p = pbNum(shown);
  return !!p && Number.isFinite(want) && Math.abs(p.n - want) <= 0.5 * Math.pow(10, -p.dec);
}

// ★ ทำไมต้อง "ป้ายชิดตัวเลข" ไม่ใช่ "มีเลขเงินอยู่ในย่อหน้า": วัดบนคลังจริงแล้วแบบหลังจับประโยคที่ไม่ใช่ค่าผูกราคา
//   เต็มไปหมด (MRNA "ที่ราคา ~$220,000" = ราคายา · SCGP "ที่ราคาเข้า ฿28") ⇒ **ตัด "ที่ราคา" ทิ้งทั้งคำ** (177 จุดในคลัง
//   กำกวมจนตัดสินไม่ได้)
// ★★ สองชั้นของ "ความเป็นเจ้าของ" (วัดคลัง 908 ใบ 14 ก.ย. 69):
//   (ก) ป้ายที่**ปักความหมายไว้แล้ว** (ราคาปัจจุบัน · MOS ปัจจุบัน) = ตัวเลขตรงนั้นคือค่าที่ JSON เป็นเจ้าของเสมอ
//       ไม่ว่าจะเขียนเลขอะไรไว้ (เลขไม่ตรง = ค้าง/ผิด ยิ่งต้องฟ้อง) ⇒ ฟ้องทุกจุด · ผลไม่ขึ้นกับราคาวันนี้
//   (ข) ป้ายที่**ชี้ได้หลายค่า** (Fair Value ของฉากไหน · เป้าของนักวิเคราะห์คนไหน · โซน MOS ของ FV ชุดไหน)
//       ⇒ ฟ้องเฉพาะเมื่อเลขนั้น **เท่ากับค่าที่ไฟล์ประกาศไว้** (มี token ที่ render ออกมาได้เป๊ะ) — ไม่งั้นการบังคับ
//       ให้ใช้ token จะเขียนเลข "ผิด" ทับของที่ถูก (CNQ "WTI $77 → FV ~$34.84" = ตาราง sensitivity ไม่ใช่ FV หัวเรื่อง)
//       ★ ค่ากลุ่มนี้ (fv · mos20/30 · analystTgt) **ไม่ขยับตามราคา** ⇒ เกณฑ์ยังนิ่งข้ามรอบ cron เหมือนกลุ่ม (ก)
//         (บทเรียน W18: error ที่กระพริบตามราคา = ใบที่ผ่านเมื่อวานตกวันนี้โดยไม่มีใครแก้อะไร)
// ★★★ ลำดับในอาร์เรย์ = ลำดับชนะเมื่อจุดเดียวกันเข้าได้หลาย pattern (proseBoundHits sort เสถียร แล้วตัดตัวที่ซ้อน)
//   ⇒ **เจาะจงก่อนกว้าง**: "จุดเข้าซื้อใกล้ ฿136.50 (MOS 30%)" ต้องเป็น mos30 ไม่ใช่ px (ป้าย "จุดเข้า" อยู่ซ้ายมือ
//   ของเลขเดียวกัน) — ถ้า px ชนะแล้วเลขนั้นบังเอิญเท่าราคาวันนี้ healer จะผูกโซน MOS ให้วิ่งตามราคาตลอดไป
const PROSE_BOUND = [
  // "MOS 20% ที่ ฿4.02" / "MOS20 $99" — ราคา = FV×0.8 / FV×0.7 (token mos20/mos30)
  { id: 'mosZone', label: 'โซน MOS 20/30%',
    re: () => new RegExp(`(MOS\\s*(20|30)\\s*%?)${pbGap(20)}${PB_MONEY}`, 'gi'),
    hits: (m, seg, d) => {
      const token = m[2] === '30' ? 'mos30' : 'mos20';
      return d && pbOwns(m[4], d[token]) ? [{ at: m.index + pbLen(m[1], m[3]), text: m[4], token }] : [];
    } },
  // ทางกลับ "…ใกล้ $103.20 (MOS 20%)" — ต้องชิดกันจริง ([\s(]{0,3}) ไม่งั้น "…$92 และ MOS 30%…" จะจับคู่ผิดข้าง
  { id: 'mosZoneRev', label: 'ราคา (MOS 20/30%)',
    re: () => new RegExp(`${PB_MONEY}([\\s(]{0,3}MOS\\s*(20|30))`, 'gi'),
    hits: (m, seg, d) => {
      const token = m[3] === '30' ? 'mos30' : 'mos20';
      return d && pbOwns(m[1], d[token]) ? [{ at: m.index, text: m[1], token }] : [];
    } },
  { id: 'px', label: 'ราคาปัจจุบัน/จุดเข้า',
    re: () => new RegExp(`(ราคา(?:ปัจจุบัน|ล่าสุด|ตลาด|ปิด)|จุดเข้า)${pbGap(10)}${PB_MONEY}`, 'g'),
    hits: (m) => [{ at: m.index + pbLen(m[1], m[2]), text: m[3], token: 'px' }] },
  { id: 'fv', label: 'มูลค่าเหมาะสม/Fair Value',
    re: () => new RegExp(`(มูลค่าเหมาะสม|Fair\\s*Value|FV)${pbGap(14)}${PB_MONEY}`, 'g'),
    hits: (m, seg, d) => (d && pbOwns(m[3], d.fv) ? [{ at: m.index + pbLen(m[1], m[2]), text: m[3], token: 'fv' }] : []) },
  // MOS ปัจจุบัน — **ต้องมีเครื่องหมาย/คำประมาณ** ("MOS −4.7%" · "MOS ~19%" · "MOS ราว 15%")
  // ไม่งั้นจะกิน "โซน MOS 20%" ที่เป็น **เกณฑ์คงที่ ไม่ใช่ค่าที่ derive จากราคา** (วัดคลัง: 1,835 → 731 จุดเมื่อบังคับข้อนี้)
  { id: 'mos', label: 'MOS ปัจจุบัน',
    re: () => /(MOS|ส่วนเผื่อ(?:ความปลอดภัย)?|margin\s*of\s*safety)((?:(?!ราคา|เป้า)[^<0-9%{}]){0,16}?)((?:[+\-−]|~|ราว\s|ประมาณ\s)\s*[0-9]+(?:\.[0-9]+)?\s*%)/gi,
    hits: (m) => [{ at: m.index + pbLen(m[1], m[2]), text: m[3], token: 'mos' }] },
  // "เป้าเฉลี่ย $553.00 (+32.27%)" — % วัดจากราคาปัจจุบัน ⇒ ผูกราคาทั้งคู่ (token analystTgt/analystPct)
  // ยาม 3 ชั้นชุดเดียวกับ W15 + patchDerived#4 (เจ้าของเกณฑ์อยู่ที่ derived-values.js ที่เดียว)
  // ★ ตัวชี้ขาดคือ "เป้าที่พิมพ์ = values.analystTgt ไหม" — เป้าสูงสุด/ต่ำสุดของช่วง ($600 ขณะ analystTgt $553)
  //   ไม่มี token ไหน render ได้ ⇒ ไม่ฟ้อง (ค้างได้ ยังเป็นเขต W15 เหมือนเดิม ไม่ถอยหลัง)
  { id: 'tgt', label: 'ราคาเป้า (±%)',
    re: () => new RegExp(DV.MONEY_PCT_SRC, 'g'),
    hits: (m, seg, d) => {
      if (!d || !pbOwns(m[1] + m[2], d.values.analystTgt)) return [];
      const before = stripT(seg.slice(Math.max(0, m.index - 220), m.index)).slice(-100);
      if (!DV.TGT_LABEL_STRICT.test(before) || DV.QUOTE_CONTEXT.test(before)) return [];
      const after = stripT(seg.slice(m.index, m.index + 200));
      const close = after.indexOf(')');
      if (DV.PCT_NOT_VS_PRICE.test(after.slice(0, close === -1 ? 60 : close))) return [];
      return [
        { at: m.index, text: m[1] + m[2], token: 'analystTgt' },
        { at: m.index + pbLen(m[1], m[2], m[3]), text: m[4] + m[5] + m[6], token: 'analystPct' },
      ];
    } },
];

/** จุดที่ prose พิมพ์ค่าผูกราคาเป็น literal → [{ at, len, text, token, label }] เรียงตามตำแหน่ง ไม่ซ้อนกัน
 *  ★ รับ **source ก่อน expand** เสมอ (ctx.source) — ถ้าส่ง HTML ที่ render แล้วมา token ทุกตัวจะกลายเป็น literal
 *    แล้วนับเป็น "ผิด" ทั้งใบ (ตัวเรียกใน cron/migrator จึงต้องส่ง opts.source ให้ checkHtml)
 *  ★ `d` = ผล derive() ของไฟล์ (ctx.dv) — ไม่ส่ง = ข้ามกลุ่ม (ข) ที่ต้องยืนยันว่าเลขนั้นเป็นค่าที่ไฟล์ประกาศ */
function proseBoundHits(src, d) {
  const s = String(src);
  const raw = [];
  for (const [a, b] of proseSpans(s)) {
    const seg = s.slice(a, b);
    for (const p of PROSE_BOUND) {
      const re = p.re();
      let m;
      while ((m = re.exec(seg))) {
        for (const h of p.hits(m, seg, d)) raw.push({ at: a + h.at, len: h.text.length, text: h.text, token: h.token, label: p.label });
        if (re.lastIndex === m.index) re.lastIndex++;   // กันลูปไม่รู้จบถ้ามีใครเติม pattern ที่แมตช์ความยาว 0
      }
    }
  }
  raw.sort((x, y) => x.at - y.at || y.len - x.len);   // sort เสถียร: เสมอกัน = ลำดับใน PROSE_BOUND ชนะ (mosZone ก่อน mosZoneRev)
  const out = [];
  let end = -1;
  for (const h of raw) { if (h.at < end) continue; out.push(h); end = h.at + h.len; }
  return out;
}

/** healer ของ E44: แทน literal ที่ **เท่ากับข้อความที่ token render ณ ตอนนี้ทุก byte** ด้วย `{{rd:<token>}}`
 *  → { html, changes } · idempotent (แทนแล้วไม่เหลือตัวเลขให้จับ)
 *  ★ เกณฑ์ "เท่ากันทุก byte" ไม่ใช่ "เท่ากันเชิงตัวเลข" โดยตั้งใจ — คลังเขียน "฿191"/"฿156" ขณะ token render
 *    "฿191.00"/"฿156.00" ⇒ ถ้ายอมให้ต่างรูป การแทนจะ **เขียนตัวเลขในย่อหน้าใหม่** ซึ่งเป็นสิ่งที่ §9 ห้าม cron ทำ
 *    (ยิ่งกว่านั้น tolerance ครึ่งหน่วยจะเปลี่ยน "฿191" เป็น "฿191.40" ได้เงียบ ๆ) · ต่างรูป = ไม่แตะ แต่ E44 ยังฟ้อง
 *    ให้คนแก้เป็น token เอง (ข้อความ error บอกวิธี)
 *  ★ tripwire: render(ผล) ต้องเท่ากับ render(ต้นฉบับ) ทุก byte — กันบั๊ก offset/ช่วงที่ทำให้เนื้อหาที่คนเห็นเปลี่ยน */
function proseTokens(src, rd, sm) {
  const s = String(src);
  validateValues(rd, sm);
  const d = derive(rd, sm);
  const hits = proseBoundHits(s, d);
  if (!hits.length) return { html: s, changes: [] };
  let out = s;
  const changes = [];
  for (const h of [...hits].reverse()) {   // ท้าย → หน้า: ตำแหน่งที่ถอดไว้ไม่เลื่อน
    let want = null;
    try { want = String(TOKENS[h.token](d)); } catch { continue; }   // token ที่ค่าเป็น null (ไม่มี analystTgt/scnBasis) = ไม่แตะ
    if (want !== h.text) continue;
    out = out.slice(0, h.at) + `{{rd:${h.token}}}` + out.slice(h.at + h.len);
    changes.push(`prose: ${h.label} ${h.text} → {{rd:${h.token}}}`);
  }
  if (changes.length && renderValues(out, rd, sm) !== renderValues(s, rd, sm))
    throw new Error('proseTokens: ข้อความที่ render เปลี่ยนหลังแทน token — ห้ามเขียน (ตัวแทนที่วางผิดช่วง)');
  return { html: out, changes: changes.reverse() };
}

// ── กระจก stock-meta ของไฟล์ v2 (เจ้าของเดียว — ระยะ 2 ส่วน D fix wave F1/F4) ──
// เขียน **4 คีย์เท่านั้น**: price/mos/upside/fairValue = ฟังก์ชันล้วนของ values.px + report-data.fv (derive)
// ★ ไม่แตะ pe/dividendYield (final review ข้อ 1 · Critical): สองคีย์นี้เป็นกระจกของ "การ์ดที่ผู้เขียนเลือกโชว์"
//   (ฐาน EPS/DPS ที่ค่าเดิมยืนอยู่ — adjusted/forward/การ์ด DPS) ไม่ใช่ values.eps/dps ที่เป็นแค่ตัวตั้งของ token
//   ⇒ เจ้าของคือ pass derived (patchDerived#2/#9 บน view ที่ render — ทาง v2 ใน tools/update-prices.js) เหมือน v1 ทุกประการ
//   เดิมคำนวณจาก values ⇒ index P/E กระโดดเงียบ 37/869 ใบ (DDOG 75 → 453.7) + SRE/PB W19 patch-rejected
// ★ อ่าน stock-meta จาก `html` ที่รับมาเสมอ (ผลของ pass derived) — ไม่รับ object ก่อน pass ⇒ ย้อนค่าที่ pass เพิ่งเขียนไม่ได้โดยโครงสร้าง
// ★ ไม่มีอะไรเปลี่ยน = คืน `html` เดิมทุก byte (idempotent · heal นับ "แตะ" ได้จาก html !== เดิม) · เขียนกลับคงช่องว่างคร่อม JSON เดิม
// ผู้เรียก: cron patchReport + healDerived (tools/update-prices.js) · tools/apply-edits.js หลัง --set/--del บนไฟล์ v2
const MIRROR_KEYS = ['price', 'mos', 'upside', 'fairValue'];
function mirrorStockMeta(html) {
  const rdS = RM.readReportData(html);
  if (!rdS.ok || !isV2(rdS.data)) throw new Error('mirrorStockMeta: report-data ไม่ใช่ v2');
  const m = String(html).match(RM.STOCK_META_PARTS_RE);
  if (!m) throw new Error('ไม่มีบล็อก stock-meta');
  const sm = JSON.parse(m[2]);
  validateValues(rdS.data, sm);
  const d = derive(rdS.data, sm);
  const want = { price: d.px, mos: round(d.mos, 1), upside: round(d.upside, 1), fairValue: d.fv };
  if (MIRROR_KEYS.every((k) => sm[k] === want[k])) return html;
  for (const k of MIRROR_KEYS) sm[k] = want[k];
  const lead = (m[2].match(/^\s*/) || [''])[0], trail = (m[2].match(/\s*$/) || [''])[0];
  return String(html).replace(RM.STOCK_META_PARTS_RE, (x, a, b, z) => a + lead + JSON.stringify(sm) + trail + z);
}

module.exports = { CUR_SYMBOL, FLAT_PP, VALUE_KEYS, CHG_SUFFIX, isV2, validateValues, derive, TOKENS, COPY_TOKENS: Object.keys(TOKENS), renderValues,
  fmtPrice, fmtBig, annualChg, mosBand, isoOf, parseIso, styledRD, MIRROR_KEYS, mirrorStockMeta,
  // E44 (ระยะ 2 ส่วน F · spec B(ข)) — prose ผูกราคาในใบใหม่ + healer
  PROSE_TOKEN_SINCE, PROSE_BOUND, proseSpans, proseBoundHits, proseTokens,
  // V2TOKENS (ระยะ 2 ส่วน F) — site บังคับของใบ v2 ต้องเป็น token
  REQUIRED_TOKEN_SITES, missingTokenSites };
