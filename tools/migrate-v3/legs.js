'use strict';
/**
 * legs.js (migrate-v3) — ขา .vmethod ของใบ v2 (mname/mdesc/mval) → method enum ของ v3 (spec §3.1) + แกะ inputs
 * แล้วคิดซ้ำด้วย tools/v3/legs.js เทียบกับ .mval ที่พิมพ์ไว้ — ขาที่คิดซ้ำได้ = ok:true · ไม่ได้ = ok:false พร้อม why เสมอ (ห้ามเงียบ)
 * regex เป็น heuristic ที่วัดบนคลังจริง (Plan 4 Task 0 · 25 ก.ย. 69) — ok:false ไม่ได้แปลว่าใบผิด แปลว่าต้องเป็น declared/ตัดสินมือ
 * ชื่อวิธีที่ลงท้าย "?" = จับได้จาก mdesc เท่านั้น (ชื่อขาไม่บอก) · ไม่ใช่วงวน: อ่าน tools/v3/legs.js ทางเดียว
 */
const L = require('../v3/legs.js');

const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
const num = (s) => (s == null ? null : parseFloat(String(s).replace(/,/g, '')));
const CUR = '(?:US\\$|C\\$|HK\\$|NT\\$|S\\$|A\\$|\\$|฿|€|£|¥|RMB\\s*|CHF\\s*)';
const SCALE = { t: 1e12, tn: 1e12, trillion: 1e12, b: 1e9, bn: 1e9, billion: 1e9, m: 1e6, mn: 1e6, million: 1e6, k: 1e3,
  'ล้านล้าน': 1e12, 'แสนล้าน': 1e11, 'หมื่นล้าน': 1e10, 'พันล้าน': 1e9, 'ร้อยล้าน': 1e8, 'ล้าน': 1e6, 'ลบ.': 1e6, 'ลบ': 1e6 };

// money value in the shown .mval ("฿163" · "$1,542.56" · "~$233")
function mvalNum(s) { const m = new RegExp(`${CUR}\\s*~?\\s*${NUM}`).exec(s) || new RegExp(NUM).exec(s); return m ? num(m[1]) : null; }
function mvalCur(s) { const m = /(US\$|C\$|HK\$|\$|฿|€|£|¥|บาท)/.exec(s); return m ? m[1] : null; }

// context / non-FV legs (spec §3.6 I) — v2 marks them in the name
const CONTEXT_RE = /บริบท|ไม่นับ|ไม่รวม(?:ใน)?\s*(?:กรอบ\s*)?(?:FV|ค่าเฉลี่ย|การเฉลี่ย)|ตรวจสอบ(?:ความสมเหตุสมผล)?\s*(?:—|-|$)|sanity|cross-?check|อ้างอิงเท่านั้น|ไม่ใช้คำนวณ|ไม่ถ่วง|น้ำหนัก\s*0/i;
const ANALYST_RE = /analyst|นักวิเคราะห์|consensus|เป้าเฉลี่ย|intrinsic\s*\(?analyst|Morningstar|GuruFocus|Alpha\s*Spread/i;

const RULES = [
  ['analyst', (n) => ANALYST_RE.test(n)],
  ['declared:sotp', (n) => /SOTP|Sum[-\s]*of[-\s]*(?:the[-\s]*)?Parts|แยกส่วน|ผลรวมส่วน/i.test(n)],
  ['declared:nav', (n) => /\bR?NAV\b|Net\s*Asset\s*Value|มูลค่าสินทรัพย์สุทธิ|P\/NAV|Book\s*NAV/i.test(n)],
  ['declared:rnpv', (n) => /rNPV|risk[-\s]*adjusted\s*NPV|pipeline/i.test(n)],
  ['pbv:justified', (n) => /Justified\s*P\/T?BV|P\/T?BV\s*(?:เหมาะสม|Justified)|Gordon.*P\/BV|P\/BV.*(?:ROE|Gordon)/i.test(n)],
  ['ri', (n) => /Residual\s*Income|\bRI\b|Excess\s*Return|ส่วนเกินกำไร/i.test(n)],
  ['ddm2', (n) => /DDM.*(?:2|สอง|two|multi|หลาย)[-\s]*(?:stage|ระยะ|ช่วง)|(?:2|สอง|two)[-\s]*(?:stage|ระยะ|ช่วง).*DDM|DDM.*อายุ|DDM.*สัมปทาน/i.test(n)],
  ['ddm', (n) => /DDM|Gordon|Dividend\s*Discount|ปันผลคิดลด|Dividend\s*Growth/i.test(n)],
  ['dcf', (n) => /DCF|Discounted\s*Cash|กระแสเงินสดคิดลด|FCFE|FCFF/i.test(n)],
  ['evebitda', (n) => /EV\s*\/\s*EBITDA/i.test(n)],
  ['evsales', (n) => /EV\s*\/\s*(?:Sales|Revenue|รายได้|ยอดขาย)/i.test(n)],
  ['fcfyield', (n) => /FCF\s*Yield|Free\s*Cash\s*Flow\s*Yield|(?:FCF|กระแสเงินสด).*Yield/i.test(n)],
  ['pfcf', (n) => /P\s*\/\s*FCF|Price\s*\/?\s*(?:to\s*)?FCF|P\/CF|Price\s*\/?\s*Cash\s*Flow/i.test(n)],
  ['pffo', (n) => /P\s*\/\s*A?FFO|Price\s*\/\s*A?FFO/i.test(n)],
  ['ps', (n) => /\bP\s*\/\s*S\b|Price[-\s]*to[-\s]*Sales|P\/Sales|ยอดขาย|P\/Revenue/i.test(n)],
  ['pbv', (n) => /P\s*\/\s*T?BV|P\s*\/\s*B\b|Price\s*\/?\s*(?:to\s*)?Book|มูลค่าทางบัญชี/i.test(n)],
  ['pe', (n) => /P\s*\/\s*E|\bPE\b|Earnings|PEG|กำไรต่อหุ้น/i.test(n)],
];
function classifyName(mname, mdesc) {
  for (const [id, f] of RULES) if (f(mname)) return id;
  for (const [id, f] of RULES) if (id !== 'analyst' && f(mdesc)) return id + '?';   // fallback on desc (marked ?)
  return 'unclassified';
}

// ── input extractors ──
const pctAll = (s) => [...s.matchAll(/([+\-−]?[0-9]+(?:\.[0-9]+)?)\s*%/g)].map((m) => num(m[1].replace('−', '-')));
const pctAfter = (s, labelRe) => { const m = new RegExp(`(?:${labelRe})[^0-9%]{0,24}?([+\\-−]?[0-9]+(?:\\.[0-9]+)?)\\s*%`, 'i').exec(s); return m ? num(m[1].replace('−', '-')) : null; };
function moneyAll(s) {
  const re = new RegExp(`${CUR}\\s*~?\\s*${NUM}\\s*(ล้านล้าน|แสนล้าน|หมื่นล้าน|พันล้าน|ร้อยล้าน|ล้าน|ลบ\\.?|[TtBbMmKk](?:n|illion)?(?![A-Za-z]))?`, 'g');
  return [...s.matchAll(re)].map((m) => { const k = (m[2] || '').toLowerCase(); const sc = SCALE[k] || SCALE[m[2]] || 1; return { v: num(m[1]) * sc, raw: m[0], scaled: sc !== 1, at: m.index }; });
}
const multAll = (s) => [...s.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(?:x|เท่า)(?![A-Za-z])/g)].map((m) => ({ v: num(m[1]), at: m.index }));
const close = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol * Math.max(1e-9, Math.abs(b));

// ลองคิดขา v3 — คืนค่า หรือ null เมื่อ inputs ใช้ไม่ได้ (legValue throw)
function tryLeg(leg, f) { try { return L.legValue(leg, f, 'x'); } catch (_) { return null; } }

const pctNum = (s) => parseFloat(String(s).replace(/−/g, '-'));
/** ตาราง stages ของ DCF จากข้อความ (§13-3) — 3 รูปที่พบในคลัง (Task 0 Q2): ช่วงที่ 2 ชัด (ปี a–b) · ลิสต์รายปี x%/y%/z% · fade เชิงเส้น
 *  คืน null เมื่อเป็น 2-stage ธรรมดา (caller คง g1/years1) */
function extractDcfStages(s) {
  const phases = [...s.matchAll(/([+\-−]?[0-9]+(?:\.[0-9]+)?)\s*%[^0-9%]{0,40}?ปี\s*(\d+)\s*[–\-]\s*(\d+)/g)]
    .map((m) => ({ from: +m[2], to: +m[3], g: pctNum(m[1]) })).filter((p) => p.to >= p.from);
  if (phases.length >= 2) return phases.map((p) => ({ years: p.to - p.from + 1, g: p.g }));
  const list = /((?:[+\-−]?[0-9]+(?:\.[0-9]+)?\s*%?\s*\/\s*){2,}[+\-−]?[0-9]+(?:\.[0-9]+)?\s*%)/.exec(s);
  if (list) return list[1].split('/').map((x) => ({ years: 1, g: pctNum(x.replace('%', '')) }));
  const fade = /([0-9]+(?:\.[0-9]+)?)\s*%[^0-9%]{0,30}?(?:ลด|ชะลอ|ไล่|fade)[^0-9%]{0,20}?([0-9]+(?:\.[0-9]+)?)\s*%[^0-9]{0,12}?(\d+)\s*ปี/i.exec(s);
  if (fade) { const a = +fade[1], b = +fade[2], n = +fade[3]; if (n >= 2) return Array.from({ length: n }, (_, k) => ({ years: 1, g: Math.round((a + (b - a) * k / (n - 1)) * 1e6) / 1e6 })); }
  return null;
}

/** แกะ inputs ของขาที่จัดวิธีแล้ว + คิดซ้ำ · f = fundamentals ที่เดาจาก report-data.values ({eps,dps,bvps,shares,revenue,rps,netDebt?})
 *  คืน { inputs, override, value, ok, why, base?, baseKey?, stages? } — override = ตัวตั้งต่อหุ้นที่พิมพ์ในขาต่างจาก values (≥0.5%) */
function extract(method, mdesc, mname, mval, f) {
  const s = mdesc + ' ' + mname;
  const out = { inputs: null, override: null, value: null, ok: false, why: '' };
  const ok = (v) => close(v, mval, 0.015) || (mval != null && v != null && Math.abs(v - mval) <= 0.51);   // 1.5% or rounding of whole-unit mval
  const m = method.replace(/\?$/, '');
  if (m === 'pe' || m === 'pbv' || m === 'pffo' || m === 'pfcf' || m === 'ps') {
    // base (per-share money) × multiple
    const monies = moneyAll(mdesc).filter((x) => !x.scaled);
    const mults = multAll(s);
    for (const b of monies) for (const k of mults) {
      const v = b.v * k.v;
      if (ok(v)) {
        out.inputs = { multiple: k.v }; out.base = b.v; out.value = v; out.ok = true;
        const baseKey = { pe: 'eps', pbv: 'bvps', pffo: 'ffoPerShare', pfcf: 'fcfps', ps: 'rps' }[m];
        out.baseKey = baseKey;
        if (m === 'pe' && f.eps != null && !close(b.v, f.eps, 0.005)) out.override = { eps: b.v };
        if (m === 'pbv' && f.bvps != null && !close(b.v, f.bvps, 0.005)) out.override = { bvps: b.v };
        return out;
      }
    }
    // pe/pbv/ps with fundamentals base (base not printed)
    const fb = { pe: f.eps, pbv: f.bvps, ps: f.rps }[m];
    if (fb) for (const k of mults) if (ok(fb * k.v)) { out.inputs = { multiple: k.v }; out.base = fb; out.value = fb * k.v; out.ok = true; out.why = 'base from values'; return out; }
    out.why = monies.length ? (mults.length ? 'base×multiple ≠ mval' : 'no multiple') : 'no per-share base';
    return out;
  }
  if (m === 'pbv:justified') {
    const roe = pctAfter(s, 'ROE'), g = pctAfter(s, 'g\\b|โต|growth'), r = pctAfter(s, '\\br\\b|Ke|ต้นทุน(?:ส่วนของ)?ทุน|COE|cost of equity|ผลตอบแทนที่ต้องการ');
    const monies = moneyAll(mdesc).filter((x) => !x.scaled);
    const cands = monies.map((x) => x.v).concat(f.bvps ? [f.bvps] : []);
    if (roe != null && g != null && r != null && r > g) for (const b of cands) {
      const v = tryLeg({ method: 'pbv', inputs: { g, r } }, { roe, bvps: b });
      if (ok(v)) { out.inputs = { g, r }; out.override = { roe, bvps: b }; out.value = v; out.ok = true; return out; }
    }
    // printed ratio × BVPS fallback
    const ratio = (/≈\s*([0-9]+(?:\.[0-9]+)?)\s*(?:x|เท่า)?\s*×/.exec(s) || /=\s*([0-9]+(?:\.[0-9]+)?)\s*(?:x|เท่า)/.exec(s) || [])[1];
    if (ratio) for (const b of cands) if (ok(num(ratio) * b)) { out.why = 'justified ratio printed (rounded) — recompute from (ROE,g,r) ≠ mval'; out.value = num(ratio) * b; break; }
    out.why = out.why || `justified: roe=${roe} g=${g} r=${r}`;
    return out;
  }
  if (m === 'ddm') {
    const g = pctAfter(s, 'g\\b|โต|growth'), r = pctAfter(s, '\\br\\b|Ke|ต้นทุน|COE|required|ผลตอบแทนที่ต้องการ|discount');
    const monies = moneyAll(mdesc).filter((x) => !x.scaled);
    if (g != null && r != null && r > g) for (const b of monies.map((x) => x.v).concat(f.dps ? [f.dps] : [])) {
      const v1 = tryLeg({ method: 'ddm', inputs: { g, r } }, { dps: b });
      if (ok(v1)) { out.inputs = { g, r }; if (!close(b, f.dps, 0.005)) out.override = { dps: b }; out.value = v1; out.ok = true; return out; }
      const v0 = b / ((r - g) / 100);   // printed D1 directly
      if (ok(v0)) { out.inputs = { g, r }; out.override = { dps: b / (1 + g / 100) }; out.value = v0; out.ok = true; out.why = 'D1 printed'; return out; }
    }
    out.why = `ddm: g=${g} r=${r}`;
    return out;
  }
  if (m === 'dcf') {
    const g1 = pctAfter(s, 'โต|growth|g1|เติบโต'), r = pctAfter(s, 'WACC|\\br\\b|ส่วนลด|discount|Ke|ต้นทุน'), tg = pctAfter(s, 'terminal|ปลาย|ถาวร|g∞|ระยะยาว|perpetu|TG');
    const yrs = num((/([0-9]+)\s*(?:ปี|years?|Y\b)/i.exec(s) || [])[1]);
    const monies = moneyAll(mdesc);
    const fcfTot = monies.filter((x) => x.scaled).map((x) => x.v);
    const fcfPs = monies.filter((x) => !x.scaled).map((x) => x.v);
    const stages = extractDcfStages(s);
    out.shape = dcfShape(s);
    // ลองฐาน FCF ทุกตัวที่พิมพ์ (รวมทั้งบริษัท ÷ shares ± หนี้สุทธิ · หรือต่อหุ้น) — true เมื่อคิดซ้ำได้ mval
    const attempt = (inputs) => {
      for (const F of fcfTot) if (f.shares) {
        for (const nd of [0, f.netDebt || 0]) {
          const v = tryLeg({ method: 'dcf', inputs }, { fcf: F, shares: f.shares, netDebt: nd });
          if (ok(v)) { out.inputs = inputs; out.value = v; out.ok = true; out.why = nd ? 'fcf total + netDebt' : 'fcf total (no net debt)'; return true; }
        }
      }
      for (const F of fcfPs) {
        const v = tryLeg({ method: 'dcf', inputs }, { fcf: F, shares: 1, netDebt: 0 });
        if (ok(v)) { out.inputs = inputs; out.value = v; out.ok = true; out.why = 'fcf per share'; return true; }
      }
      return false;
    };
    const whys = [];
    // N-stage ก่อน (§13-3) — ต้องมี r/tg · years มาจากตาราง stages
    if (stages && r != null && tg != null && r > tg) {
      if (attempt({ stages, tg, r, rfCurrency: 'USD' })) { out.stages = stages; return out; }
      whys.push(`dcf ${stages.length}-stage recompute ≠ mval`);
    }
    if (g1 != null && r != null && tg != null && yrs && r > tg) {
      if (attempt({ g1, years1: yrs, tg, r, rfCurrency: 'USD' })) return out;
      whys.push('dcf 2-stage recompute ≠ mval');
    } else whys.push(`dcf: g1=${g1} r=${r} tg=${tg} yrs=${yrs}`);
    out.why = whys.join(' · ');
    return out;
  }
  if (m === 'ddm2') {
    const d1 = (moneyAll(mdesc).filter((x) => !x.scaled)[0] || {}).v ?? f.dps;
    const g1 = pctAfter(s, 'โต|g1|growth'), years1 = num((/([0-9]+)\s*ปี(?!\s*[–\-])/.exec(s) || [])[1]);
    const g2 = pctAfter(s, 'แล้ว|จากนั้น|g2|ถาวร|ปลาย'), r = pctAfter(s, '\\br\\b|Ke|ต้นทุน|discount');
    const hz = /(\d+)\s*(?:งวด|ปี)\s*(?:ไม่มี|no)\s*(?:มูลค่า)?\s*(?:ปลายงวด|terminal)/i.exec(s) || /อายุ\s*(\d+)\s*ปี|สัมปทาน\s*(\d+)\s*ปี/.exec(s);
    const horizon = hz ? +(hz[1] || hz[2]) : null;
    if ([d1, g1, years1, g2, r].every((x) => x != null)) {
      const inputs = { d1, g1, years1, g2, r, horizon };
      const v = tryLeg({ method: 'ddm2', inputs }, {});
      if (ok(v)) { out.inputs = inputs; out.value = v; out.ok = true; return out; }
      out.why = 'ddm2 recompute ≠ mval';
    } else out.why = `ddm2: d1=${d1} g1=${g1} years1=${years1} g2=${g2} r=${r}`;
    return out;
  }
  if (m === 'evebitda' || m === 'evsales') {
    const mults = multAll(s); const monies = moneyAll(mdesc).filter((x) => x.scaled);
    if (f.shares) for (const e of monies) for (const k of mults) for (const nd of [0, f.netDebt || 0]) {
      const v = (e.v * k.v - nd) / f.shares;
      if (ok(v)) { out.inputs = { multiple: k.v }; out.value = v; out.ok = true; out.why = 'ev base'; return out; }
    }
    // net debt printed explicitly: (base×m − nd)/shares with any printed scaled money as nd
    if (f.shares) for (const e of monies) for (const k of mults) for (const nd of monies) {
      const v = (e.v * k.v - nd.v) / f.shares;
      if (ok(v) || ok((e.v * k.v + nd.v) / f.shares)) { out.inputs = { multiple: k.v }; out.value = v; out.ok = true; out.why = 'ev base + printed net debt/cash'; return out; }
    }
    out.why = `ev: mults=${mults.length} monies=${monies.length} shares=${!!f.shares}`;
    return out;
  }
  if (m === 'fcfyield') {
    const y = pctAll(s); const monies = moneyAll(mdesc).filter((x) => !x.scaled);
    for (const b of monies) for (const yy of y) if (yy > 0 && ok(b.v / (yy / 100))) { out.inputs = { yield: yy }; out.value = b.v / (yy / 100); out.ok = true; return out; }
    out.why = 'fcfyield no match';
    return out;
  }
  if (m === 'ri') { out.why = 'ri: no extractor (years/payout rarely printed) — declare'; return out; }
  out.why = 'no extractor';
  return out;
}

/** รูป DCF — เป็น 2-stage มาตรฐาน (ช่วงโต 1 ช่วง + Gordon terminal) ไหม · คืนรายการเหตุที่ไม่ใช่ ([] = มาตรฐาน) */
function dcfShape(s) {
  const reasons = [];
  if (/3[-\s]*(?:stage|ช่วง|ระยะ)|สามช่วง|three[-\s]*stage/i.test(s)) reasons.push('3-stage named');
  if (/ปี(?:ที่)?\s*6\s*[–\-]\s*10|ปี\s*6[–\-]10|year[s]?\s*6\s*[–\-]\s*10|yr\s*6|6[–\-]10\s*(?:ปี|y)/i.test(s)) reasons.push('second explicit phase (yr 6–10)');
  if (/แล้ว(?:ชะลอ|ลด|โต)|→\s*[0-9]+(?:\.[0-9]+)?\s*%\s*(?:ใน|ช่วง|ปี)|fade|ชะลอลง|ไล่ลง|ค่อย ๆ ลด/i.test(s)) reasons.push('fade/second growth');
  if (/[0-9]+\/[0-9]+\/[0-9]+(?:\/[0-9]+)*\s*%/.test(s)) reasons.push('per-year growth list');
  if (/อายุจำกัด|สัมปทาน|ไม่มี\s*terminal|ไม่ใช้\s*perpetuity|finite|concession/i.test(s)) reasons.push('finite life');
  if (/FCF\s*margin|margin\s*(?:ขยาย|ไต่|ไล่)|รายได้.*โต.*margin/i.test(s)) reasons.push('revenue×margin driven');
  if (/reverse\s*DCF|implied/i.test(s)) reasons.push('reverse DCF');
  if (/exit\s*multiple|EV\/EBITDA\s*ปลาย|terminal\s*multiple/i.test(s)) reasons.push('exit-multiple terminal');
  if (/\bDE\b|distributable|NOI|FFO|AFFO/i.test(s) && !/FCF/.test(s)) reasons.push('non-FCF cash base');
  return reasons;
}

module.exports = { classifyName, extract, dcfShape, extractDcfStages, mvalNum, mvalCur, CONTEXT_RE, ANALYST_RE, moneyAll, multAll, pctAll, pctAfter, close };
