'use strict';
/**
 * scenarios.js (migrate-v3) — หมวด 6 ของใบ v2 (คอลัมน์ Bear/Base/Bull + values.scenarios/scnBasis) → doc.scenarios (Plan 4b Task 5)
 *  driver จากหัวคอลัมน์ Bear ("EPS −2%/ปี") · exitMetric จากแถว "… ออก" · exitMultiple = ตัวเลขที่พิมพ์ (ไม่ back-solve) · exitDp = ทศนิยมที่พิมพ์ (สูงสุดของ 3 คอลัมน์)
 *  baseOverride เมื่อฐานที่ผู้เขียนใช้ ≠ ฐานจาก fundamentals (eps: values.baseEps · อื่น ๆ: end/(1+g)^years ต่างเกิน 0.5%)
 *  tgtCheck (หลัง compute) — ราคาเป้าที่คิดใหม่ต่างจากที่พิมพ์เกินครึ่งหน่วย → D
 * DRIVER/EXIT = prototype Task 0 (scnFit) + de/fre + evsales (Plan 4b Task 1)
 */
const S = require('../v3/schema.js');
const MP = require('./prose.js');
const SY = require('./synonyms.js');
const NB = require('./numbers.js');
const RV = require('../report-values.js');

// Plan 4c-prep (spec §3.7 ก): EBITDA มาก่อน revenue/eps · EV/EBITDA ก่อน EV/Sales · EV/Revenue ≡ evsales
const DRIVER = [['ebitdaPerShare', /EBITDA/i], ['de', /\bDE\b|distributable/i], ['fre', /\bFRE\b|fee[-\s]*related/i],
  ['revenuePerShare', /ยอดขาย|รายได้|revenue|\bRev\b|sales/i], ['ffo', /A?FFO/i], ['bvps', /BVPS|BV\b|book/i], ['fcfPerShare', /FCF/i], ['eps', /EPS|กำไร/i]];
const EXIT = [['evebitda', /EV\s*\/\s*EBITDA/i], ['evsales', /EV\s*\/\s*(?:S(?:ales)?|Rev(?:enue)?)\b/i], ['ps', /(?<!EV)\s*\bP\s*\/\s*S\b/i], ['pffo', /P\s*\/\s*A?FFO/i], ['pbv', /P\s*\/\s*BV|P\/B\b/i], ['pfcf', /P\s*\/\s*FCF/i], ['pe', /P\s*\/\s*E/i]];
const NAMES = ['bear', 'base', 'bull'];
// driver ต่อหุ้นของยอดรวมทั้งบริษัท (รายได้/EBITDA/FCF ÷ หุ้น) — ค่าปลายฉากที่พิมพ์เป็นยอดรวม (B/M/ล้าน) แปลงเป็นต่อหุ้นได้
const TOTAL_DRIVERS = ['revenuePerShare', 'ebitdaPerShare', 'fcfPerShare'];
const numOf = (s) => { const m = /([0-9][0-9,]*(?:\.[0-9]+)?)/.exec(String(s == null ? '' : s)); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
const pctOf = (s) => { const m = /([+\-−]?)\s*([0-9]+(?:\.[0-9]+)?)\s*%/.exec(String(s || '')); return m ? parseFloat(m[2]) * (m[1] === '-' || m[1] === '−' ? -1 : 1) : null; };
const decOf = (s) => { const m = /[0-9][0-9,]*(?:\.([0-9]+))?/.exec(String(s)); return m && m[1] ? m[1].length : 0; };
const isExit = (label) => /ออก|exit|ทางออก/i.test(label);
const isEnd = (label) => /ปี\s*\d/.test(label) && !/ปันผล/.test(label);
// แถวตัวตั้งปลายฉาก: "… ปี 3" ก่อน · ไม่มี = แถวตัวเลขแถวเดียวที่ไม่ใช่ตัวคูณออก/ปันผล/สถานการณ์ (MRNA "ยอดขายสูงสุด (ปรับความเสี่ยง) ~$3B" — display-fix2)
const endLiOf = (c) => c.lis.find((x) => isEnd(x[0])) || (() => {
  const xs = c.lis.filter((x) => !isExit(x[0]) && !/ปันผล|สถานการณ์/.test(x[0]) && numOf(x[1]) != null);
  return xs.length === 1 ? xs[0] : null;
})();
// หัวคอลัมน์ที่ template พิมพ์ได้เอง ("<driver> +g%/ปี") — ตัด % · /ปี · คำ driver แล้วไม่เหลือคำ (LITE "FY28 +50% → FY29 +30%" ไม่ใช่)
const simpleHead = (t, driver) => {
  let r = String(t || '').replace(/[+\-−]?\s*[0-9]+(?:\.[0-9]+)?\s*%/g, ' ').replace(/\/\s*ปี|ต่อปี/g, ' ');
  const dr = DRIVER.find(([k]) => k === driver);
  if (dr) r = r.replace(dr[1], ' ');
  return !r.replace(/[()~≈•·,:/]/g, ' ').trim();
};
// .ret (Plan 4b Task 6b): หลักยึด = token ผลตอบแทนของ v2 หรือเลข % ตัวแรก — ข้อความหลังหลักยึด = คำของผู้เขียน → cases[i].retNote (ตัวเลขไม่คัดลอก)
const RET_ANCHOR = /\{\{rd:sc\d+ret\}\}|(?:[+\-−]|&minus;)?\s*[0-9][0-9.,]*\s*%/;
// คำต่อท้ายที่ติดป้ายไปบนผลตอบแทนรวมของ v3 แล้วความหมายเพี้ยน: มี % (ตัวเลขผูกราคาอีกตัว) หรือหน่วยต่อปี (v2 พิมพ์ %/ปี แต่ v3 พิมพ์ผลตอบแทนรวม)
const RET_UNSAFE = /%|\/\s*(?:ปี|yr|year)|ต่อปี|per\s*(?:year|annum)|\bp\.?a\.?(?![a-z])/i;
// fix round 1 (review I-5): คำอ้างเรื่องปันผลในโน้ตที่ขัดกับ divIncluded (หน้า v3 พิมพ์ "• รวมปันผล" จาก scnNote / total% รวมปันผล) → ไม่ carry + H
const NO_DIV = /ไม่รวมปันผล|ไม่มี(?:เงิน)?ปันผล|ไม่จ่าย(?:เงิน)?ปันผล|ex-?div|excl\.?[^,;•·]*div/i;
const INC_DIV = /(?<!ไม่)รวมปันผล|incl\.?[^,;•·]*div/i;
/** โน้ต → เหตุขัดแย้ง (ข้อความ) หรือ null */
function divClash(note, divIncluded) {
  const t = String(note || '');
  if (divIncluded && NO_DIV.test(t)) return 'says no dividend while divIncluded';
  if (!divIncluded && !NO_DIV.test(t) && INC_DIV.test(t)) return 'says dividends included while divIncluded is false';
  return null;
}
const PY_NUM = /[≈~]?\s*([+\-−]?)\s*[≈~]?\s*([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:\/\s*(?:ปี|yr|year)|ต่อปี|per\s*(?:year|annum)|p\.?a\.?)/i;
/** .ret (Plan 4c-prep D3): pre = ก่อนหลักยึด % · post = หลังหลักยึด → { pre, post, perYear: number|'anchor'|null, numeric: {v, text}|null, raw } */
function retParts(html) {
  const h = String(html || ''), m = RET_ANCHOR.exec(h);
  if (!m) return null;
  const pre = MP.htmlToProse(h.slice(0, m.index)).trim();
  const raw = MP.htmlToProse(h.slice(m.index + m[0].length)).trim();
  let post = raw, perYear = null, numeric = null;
  const py = PY_NUM.exec(post);
  if (py) { perYear = parseFloat(py[2]) * (py[1] === '-' || py[1] === '−' ? -1 : 1); post = post.replace(py[0], ' '); }
  else if (/^\s*(?:\/\s*ปี|ต่อปี)\s*$/.test(post)) {
    // หลักยึดเองคือตัวเลขต่อปี: literal = ตัวเลขที่ผู้เขียนพิมพ์ (เทียบสูตรได้) · token {{rd:scNret}} = ผลตอบแทนรวมของ v2 ที่ติดป้าย /ปี → 'anchor' (perYearOf ไม่อนุมาน)
    const lit = /\{\{rd:/.test(m[0]) ? null : /([+\-−]|&minus;)?\s*([0-9][0-9.,]*)\s*%/.exec(m[0]);
    perYear = lit ? parseFloat(lit[2].replace(/,/g, '')) * (lit[1] && lit[1] !== '+' ? -1 : 1) : 'anchor'; post = '';
  }
  const nm = /([+\-−])?\s*~?\s*([0-9]+(?:\.[0-9]+)?)\s*%/.exec(post);
  if (nm) { numeric = { text: nm[0].trim(), v: parseFloat(nm[2]) * (nm[1] === '-' || nm[1] === '−' ? -1 : 1) }; post = post.replace(nm[0], ' '); }
  const clean = (s) => s.replace(/\s+\/\s+/g, ' ').replace(/^[\s/,·~≈]+|[\s/,·~≈]+$/g, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  return { pre: clean(pre), post: clean(post), perYear, numeric, raw };
}
/** perYear จากป้าย /ปี ทุกคอลัมน์ (measure §5: cagr = แบบแผนผู้เขียน 138/147) · linear เฉพาะเมื่อทุกคอลัมน์ตรง linear และไม่ตรง cagr (±0.5 จุด) ·
 *  คู่ที่พิมพ์ไม่เข้าสูตรไหนเลย (mirror `derived-values.js` 'bad' — ไม่แตะ) → null: v3 ไม่พิมพ์ %/ปี · คำ /ปี ยังหลุด → HUMAN (advisor 26 ก.ย. 69) — ห้ามคืน 'cagr' ให้ตัวเลขที่ผู้เขียนไม่เคยพิมพ์ */
function perYearOf(parts, v2totals, years) {
  if (parts.length !== 3 || !parts.every((p) => p && p.perYear != null)) return null;
  // 'anchor' = ตัวเลขที่ติดป้าย /ปี คือผลตอบแทนรวมของ v2 ({{rd:scNret}}) — ผู้เขียนไม่เคยพิมพ์ตัวเลขต่อปีจริง ⇒ ไม่อนุมาน (ruling: ห้ามคืน 'cagr' ให้ตัวเลขที่ไม่เคยพิมพ์)
  if (parts.some((p) => p.perYear === 'anchor')) return null;
  const nums = parts.map((p, i) => ({ p: p.perYear, T: v2totals[i] })).filter((x) => typeof x.p === 'number' && typeof x.T === 'number');
  const near = (a, b) => Math.abs(a - b) <= 0.5 + 1e-9;
  const cagr = (T) => (Math.pow(1 + T / 100, 1 / years) - 1) * 100;
  if (nums.some((x) => !near(x.p, x.T / years) && !near(x.p, cagr(x.T)))) return null;   // fits neither formula → no per-year figure (never 'cagr')
  if (nums.length && nums.every((x) => near(x.p, x.T / years) && !near(x.p, cagr(x.T)))) return 'linear';
  return 'cagr';
}
/** โน้ต .ret ของคอลัมน์ i (Plan 4c-prep D3) — คำก่อนหลักยึด (ยกเว้นคำพ้อง total/รวม) + คำหลังหลักยึด · ตัวเลข %/ปี ทิ้งเมื่อ perYear ตั้งแล้ว (template พิมพ์เอง)
 *  · ตัวเลข % อื่น = pending (retResolve หลัง compute ตัดสิน) · → { note, pending } */
function retNoteOf(parts, i, H, F, scn) {
  if (!parts) return { note: null, pending: null };
  const unsafeH = (n) => `scenarios.cases[${i}] .ret annotation "${n}" not carried — a per-year/number label would mislabel the v3 total return`;
  const raw = [parts.pre, parts.raw].filter(Boolean).join(' ');
  if (parts.perYear != null && scn.perYear == null) { if (parts.raw) H.push(unsafeH(parts.raw)); return { note: null, pending: null }; }
  const pre = parts.pre ? SY.apply('s6.ret', parts.pre.split(/\s+/), { doc: { scenarios: scn } }).tokens.join(' ') : '';
  const note = [pre, parts.post].filter(Boolean).join(' ').trim();
  if (note && RET_UNSAFE.test(note)) { H.push(unsafeH(raw)); return { note: null, pending: null }; }
  const clash = note ? divClash(note, scn.divIncluded) : null;
  if (clash) { H.push(`scenarios.cases[${i}] .ret annotation "${note}" not carried — dividend claim in the note contradicts divIncluded (${clash})`); return { note: null, pending: null }; }
  if (parts.numeric) return { note: null, pending: { note, numeric: parts.numeric, H: unsafeH(parts.raw) } };
  if (!note) return { note: null, pending: null };
  F.push(`scenarios.cases[${i}].retNote "${note}" (author annotation in .ret)`);
  return { note, pending: null };
}
/** หลัง compute (Plan 4c-prep D3 · Review Focus 5): โน้ต .ret ที่มีตัวเลข % — พาได้เมื่อเท่าผลตอบแทนรวมของ v3 ภายในการปัดที่พิมพ์ ไม่งั้น H เดิม */
function retResolve(pending, view) {
  const set = [], H = [];
  (pending || []).forEach((p, i) => {
    if (!p) return;
    const tot = view.d.scenarios[i].total, shown = `${tot >= 0 ? '+' : '−'}${Math.abs(tot)}%`;
    if (NB.classifyNumber(p.numeric.text.replace('−', '-'), shown.replace('−', '-')) === 'rounding') set.push({ i, note: p.note });
    else H.push(p.H);
  });
  return { set, H };
}

/** ฐานของ driver จาก fundamentals (สูตรเดียวกับ compute.driverStart — fx = 1 เพราะ migrator ไม่ตั้ง reportCurrency) */
function fundStart(driver, f) {
  const per = (k) => (f[k] != null && f.shares ? f[k] / f.shares : null);
  const v = { eps: f.eps, ffo: f.ffoPerShare, bvps: f.bvps, revenuePerShare: per('revenue'), fcfPerShare: per('fcf'), de: f.dePerShare, fre: f.frePerShare, ebitdaPerShare: per('ebitda') }[driver];
  return typeof v === 'number' && v > 0 ? v : null;
}

function scenarios(parsed, fund, legs) {
  const H = [], D = [], F = [];
  const v = (parsed.rd && parsed.rd.values) || {};
  const b = v.scnBasis || {};
  const cols = parsed.s6cols || [];
  const out = { years: b.years != null ? b.years : 3, divIncluded: !!b.divIncluded, perYear: b.perYear === undefined ? null : b.perYear };
  if (!v.scnBasis) {
    // ใบที่ไม่มี scnBasis (ฉากเป็น literal): อ่านจากหัวหมวด 6 ("คาดการณ์ผลตอบแทน N ปี") และ hint ("รวมปันผล") — ไม่มีก็ค่าตั้งต้น
    const s6 = parsed.byN && parsed.byN[6];
    const h2 = s6 ? MP.htmlToProse((/<h2>([\s\S]*?)<\/h2>/.exec(s6.body) || [])[1] || '') : '';
    const y = /(\d+)\s*ปี/.exec(h2);
    if (y && +y[1] >= 1 && +y[1] <= 10) out.years = +y[1];
    const divAll = cols.length === 3 && cols.every((c) => c.lis.some((x) => /ปันผลรวม/.test(x[0]) && numOf(x[1]) != null));
    // Task 6b fix round 2: /รวมปันผล/ เดิมจับ "ไม่รวมปันผล"/"ยังไม่รวมปันผล" ของผู้เขียนด้วย (divIncluded กลับด้าน) — true เฉพาะคำบวกที่ไม่มีคำปฏิเสธในป้าย
    const h6 = MP.htmlToProse(parsed.s6hint || '');
    if (/(?<!ไม่|ยังไม่)รวมปันผล/.test(h6) && !NO_DIV.test(h6) && divAll) out.divIncluded = true;
    F.push(`scenarios: no values.scnBasis — years ${out.years} · divIncluded ${out.divIncluded} · perYear null (from the section head/hint)`);
  }
  const meta = { driverText: null, exitText: null, starts: [], ends: [], base: null, noGrowth: [], heads: [null, null, null], perCase: false };
  if (cols.length !== 3) { H.push(`scenarios: ${cols.length} columns (need Bear/Base/Bull)`); return { scenarios: null, H, D, F, meta }; }
  const top = cols[0].top ? cols[0].top[1] : '';
  meta.driverText = top;
  // driver จากหัวคอลัมน์ Bear · หัวเป็นข้อความล้วน (MRNA "เฉพาะมะเร็งผิวหนัง") = จากป้ายแถวตัวตั้งปลายฉาก (display-fix2)
  const endLab0 = (endLiOf(cols[0]) || [''])[0];
  const drv = (DRIVER.find(([, re]) => re.test(top)) || DRIVER.find(([, re]) => re.test(endLab0)) || [null])[0];
  const exLi = cols[0].lis.find((x) => isExit(x[0]));
  meta.exitText = exLi ? exLi[0] : null;
  const ex = exLi ? (EXIT.find(([, re]) => re.test(exLi[0])) || [null])[0] : null;
  if (!drv) H.push(`scenarios.driver "${top}" not in ${JSON.stringify(S.ENUM.driver)}`);
  if (!ex) H.push(`scenarios.exitMetric "${meta.exitText}" not in ${JSON.stringify(S.ENUM.exitMetric)}`);
  out.driver = drv || 'eps'; out.exitMetric = ex || 'pe';
  let dp = 0;
  const vs = Array.isArray(v.scenarios) ? v.scenarios : null;
  // .ret ทั้ง 3 คอลัมน์ก่อน (Plan 4c-prep D3): ป้าย %/ปี ทุกคอลัมน์ + ผลตอบแทนรวมของ v2 → perYear (ไม่ทับค่าที่ผู้เขียนตั้งไว้ใน scnBasis)
  const parts = cols.map((c) => retParts(c.retHtml));
  const v2t = cols.map((_, i) => { const s = vs && vs[i]; return s && typeof s.tgt === 'number' && v.px > 0 ? ((s.tgt + (out.divIncluded && typeof s.div === 'number' ? s.div : 0)) - v.px) / v.px * 100 : null; });
  const py = perYearOf(parts, v2t, out.years);
  if (py && out.perYear == null) { out.perYear = py; F.push(`scenarios.perYear ${py} inferred from the per-year .ret labels`); }
  meta.retPending = [null, null, null];
  out.cases = cols.map((c, i) => {
    // "EBITDA margin 6.2%" (IVL) = ระดับมาร์จิ้น ไม่ใช่อัตราเติบโต — driver อ่านได้ (ebitdaPerShare) แต่ growth อ่านไม่ได้ → H (residual D5 · ห้ามแปลง prose เป็นตัวเลข)
    const growth = c.top && !/margin|มาร์จิ้น/i.test(c.top[1]) ? pctOf(c.top[1]) : null;
    const exS = (c.lis.find((x) => isExit(x[0])) || [])[1];
    const exitMultiple = numOf(exS);
    if (exS != null) dp = Math.max(dp, decOf(exS));
    const divLi = c.lis.find((x) => /ปันผลรวม/.test(x[0]));
    let divCum = null;
    if (divLi && !/\{\{rd:/.test(divLi[2])) divCum = numOf(divLi[1]);
    else if (vs && vs[i] && typeof vs[i].div === 'number') divCum = vs[i].div;
    const descLi = c.lis.find((x) => /สถานการณ์/.test(x[0]));
    const desc = descLi ? MP.htmlToProse(descLi[2]) : '';
    if (growth == null) meta.noGrowth.push(i);   // H หลังตัดสินโหมดรายคอลัมน์ (display-fix2) — อ่าน growth ไม่ได้แต่พกหัว + ตัวตั้งปลายฉากของผู้เขียนได้
    // exitMultiple อ่านไม่ได้ → H หลังตัดสินโหมดเซลล์ของผู้เขียน (display-fix2)
    if (!desc) H.push(`scenarios.cases[${i}].desc: no "สถานการณ์" row`);
    if (out.divIncluded && divCum == null) H.push(`scenarios.cases[${i}].divCum missing while divIncluded`);
    const endLi = endLiOf(c);
    let end = endLi ? numOf(endLi[1]) : null, tol = endLi ? 0.5 * Math.pow(10, -decOf(endLi[1])) : null;
    // ค่าปลายฉากที่พิมพ์เป็นยอดรวมทั้งบริษัท ("รายได้ปี 3 ~$38.75B" — CPNG/NET) ของ driver ต่อหุ้น → ต่อหุ้น = ยอดรวม ÷ หุ้น (หน่วยปัดก็หารด้วย)
    const big = endLi ? NB.numsOf(endLi[1])[0] : null;
    if (end != null && big && big.v !== end && TOTAL_DRIVERS.includes(out.driver)) {
      const sh = fund && fund.shares;
      if (sh > 0) { end = big.v / sh; tol = big.half / sh; meta.total = true; }
      else { H.push(`scenarios.cases[${i}] end value "${endLi[1]}" is a company total but fundamentals.shares is missing`); end = null; }
    }
    meta.starts.push(end != null && growth != null ? end / Math.pow(1 + growth / 100, out.years) : null);
    meta.ends.push(end != null && growth != null ? { end, text: endLi[1], growth, tol } : null);
    meta.heads[i] = c.top ? MP.htmlToProse(c.top[1]).replace(/<[^>]*>/g, '').replace(/[{}<>]/g, '').replace(/\s+/g, ' ').trim() : null;
    const cs = { growth, exitMultiple };
    if (growth == null) delete cs.growth;
    if (exitMultiple == null) delete cs.exitMultiple;
    if (divCum != null) cs.divCum = divCum;
    cs.desc = desc;
    const rn = retNoteOf(parts[i], i, H, F, out);
    if (rn.note) cs.retNote = rn.note;
    if (rn.pending) meta.retPending[i] = rn.pending;
    return cs;
  });
  out.exitDp = Math.min(dp, 2);
  // baseOverride (fix round 1 · I-2/M-3/M-4) — ค่าที่ผู้เขียนพิมพ์เท่านั้นที่อ้างว่า "ผู้เขียนใช้":
  //  eps: values.baseEps · อื่น ๆ: ฐานต่อหุ้นที่ขาพิมพ์ (override ของขา) · ฐานจาก fundamentals ที่คิดค่าปลายฉากที่พิมพ์ได้ครบ 3 คอลัมน์ = ไม่ต้อง override
  //  ไม่งั้นถอดกลับจากค่าปลายฉากที่พิมพ์ + F (ไม่อ้างว่าเป็นของผู้เขียน)
  const fStart = fundStart(out.driver, fund || {});
  const ends = meta.ends.filter(Boolean);
  const fits = (b) => b > 0 && ends.length > 0 && ends.every((e) => Math.abs(b * Math.pow(1 + e.growth / 100, out.years) - e.end) <= e.tol + 1e-9);
  const LEG_BASE = { ffo: 'ffoPerShare', de: 'dePerShare', fre: 'frePerShare', bvps: 'bvps' };
  if (out.driver === 'eps' && typeof v.baseEps === 'number' && v.baseEps > 0) {
    if (fStart == null || v.baseEps !== fStart) { out.baseOverride = { value: v.baseEps, why: 'EPS ฐานฉากที่ผู้เขียนใช้' }; meta.base = 'values.baseEps'; }
  } else if (fits(fStart)) {
    meta.base = 'fundamentals';   // ฐานจากงบคิดค่าปลายฉากที่พิมพ์ได้ครบ — ส่วนต่างเป็นแค่การปัด
  } else {
    const legB = LEG_BASE[out.driver] ? [...new Set((legs || []).map((l) => l.override && l.override[LEG_BASE[out.driver]]).filter((x) => x > 0))].find(fits) : null;
    const printed = meta.starts.filter((x) => x != null && x > 0);
    const p0 = meta.starts[1] > 0 ? meta.starts[1] : printed.length ? printed[0] : null;   // คอลัมน์ Base ก่อน
    if (legB != null) {
      out.baseOverride = { value: legB, why: 'ฐานฉากที่ผู้เขียนใช้ (ตัวตั้งที่ขาประเมินพิมพ์)' }; meta.base = 'leg override';
      F.push(`scenarios.baseOverride ${legB} = the ${LEG_BASE[out.driver]} printed in a leg`);
    } else if (p0 != null && fStart != null && (() => { const e = meta.starts[1] > 0 ? meta.ends[1] : ends[0]; return e && Math.abs(p0 - fStart) <= e.tol + 1e-9; })()) {
      meta.base = 'fundamentals (rounding)';   // ถอดกลับได้เท่า fundamentals ภายในการปัดของคอลัมน์ที่ใช้ (fix round 2 · M-7) — override ไม่เพิ่มข้อมูล
    } else if (p0 != null) {
      out.baseOverride = { value: +p0.toPrecision(6), why: out.driver === 'eps' ? 'EPS ฐานฉากถอดกลับจากราคาเป้าที่พิมพ์' : 'ฐานฉากถอดกลับจากค่าปลายฉากที่พิมพ์' };
      meta.base = 'back-computed';
      F.push(`scenarios.baseOverride ${out.baseOverride.value} back-computed from the printed ${out.driver} end values${out.driver === 'eps' ? ' (values.baseEps absent)' : ''}`);
    } else if (fStart == null) H.push(`scenarios: no base for driver ${out.driver} (fundamentals and printed end value both missing)`);
  }
  // ── โหมดเซลล์ของผู้เขียน (display-fix2 · ใบ migrate — v2Display.s6 + targets): ฉากที่ template "ฐานเดียว × (1+g)^ปี" พิมพ์ไม่ได้
  //   (ก) หัวคอลัมน์ไม่มี growth (LWLG "รายได้ปี 3 $5M" · MRNA/DOW ข้อความ) · (ข) ค่าปลายฉากที่พิมพ์ไม่เข้าฐานเดียว (AMZN/BAM · AVAV ทบ 2 ปี · LITE/GIS ทางเดินหลายขั้น)
  //   (ค) ตัวคูณออกอ่านไม่ได้/มีหมายเหตุ (NTRA "n/a" · OMCL "11.0x (FY2567)") · (ง) แถวปันผลของผู้เขียน (DTE ป้าย/ทศนิยม 1 ตำแหน่ง) · (จ) driver/ตัวคูณต่างกันต่อคอลัมน์ (OKJ)
  //   ⇒ พกหัว + แถวทุกคอลัมน์ตามที่พิมพ์ + ราคาเป้าของผู้เขียน (ตัวเลข — ผลตอบแทนคิดสด) · ไม่ถอดฐานกลับ · หัว §6 = คำของผู้เขียนทั้งท่อน
  const why = [];
  if (meta.noGrowth.length) why.push('growth not printed');
  // ฐานเดียวคลาดเกินเกณฑ์ E24 (5%) ในคอลัมน์ใด = ฐานเดียวพิมพ์ฉากของผู้เขียนไม่ได้ (ภายใน 5% = การปัด — ทางเดิม back-compute)
  const e24off = (b) => ends.some((e) => Math.abs(b * Math.pow(1 + e.growth / 100, out.years) - e.end) / e.end > 0.05);
  if (meta.base === 'back-computed' && out.baseOverride && ends.length === 3 && e24off(out.baseOverride.value)) why.push('no single base reproduces the printed end values');
  const exitCell = (c) => (c.lis.find((x) => isExit(x[0])) || [])[1];
  // hard = template คิด/พิมพ์ฉากนี้ไม่ได้เลย (อ่านไม่ได้ → H เมื่อพกเซลล์ไม่ได้) · soft = template พิมพ์ได้แต่ไม่ตรงคำผู้เขียน (พกไม่ได้ = คงทางเดิม + F)
  const soft = [];
  if (cols.some((c) => { const t = exitCell(c); return t == null || numOf(t) == null; })) why.push('exit multiple not printed');
  else if (cols.some((c) => /[^\s0-9.,x×~≈+\-−]/i.test(String(exitCell(c)).replace(/^[\s~≈]+/, '')))) soft.push('exit cell annotated');
  const divRow = (c) => c.lis.find((x) => /ปันผล/.test(x[0]));
  if (cols.some((c) => { const d = divRow(c); return d && (!new RegExp(`^ปันผลรวม ${out.years} ปี$`).test(d[0].trim()) || (!/\{\{rd:/.test(d[2]) && decOf(d[1]) !== 2)); })) soft.push("author's dividend row");
  const colDrv = (c) => { const t = c.top ? c.top[1] : '', e = (endLiOf(c) || [''])[0]; return (DRIVER.find(([, re]) => re.test(t)) || DRIVER.find(([, re]) => re.test(e)) || [null])[0]; };
  const colEx = (c) => { const l = (c.lis.find((x) => isExit(x[0])) || [''])[0]; return (EXIT.find(([, re]) => re.test(l)) || [null])[0]; };
  if (cols.some((c) => colDrv(c) && colDrv(c) !== out.driver) || cols.some((c) => colEx(c) && colEx(c) !== out.exitMetric)) why.push('driver/exit differs per column');
  if (why.length || soft.length) {
    const cur = parsed.sm && parsed.sm.data && parsed.sm.data.currency ? (RV.CUR_SYMBOL[parsed.sm.data.currency] || '') : '';
    const tgts = cols.map((c, i) => {
      if (vs && vs[i] && typeof vs[i].tgt === 'number' && vs[i].tgt > 0) return vs[i].tgt;
      const m = /<div class="tgt">([\s\S]*?)<\/div>/.exec((parsed.byN && parsed.byN[6] && parsed.byN[6].body.split(/<div class="col /)[i + 1]) || '');
      const x = m && !/\{\{rd:/.test(m[1]) ? NB.numsOf(MP.htmlToProse(m[1]))[0] : null;
      return x && x.v > 0 ? x.v : null;
    });
    const bad = [];
    const cells = cols.map((c, i) => {
      const rows = c.lis.filter((x) => !/สถานการณ์/.test(x[0])).map((x) => {
        let v = x[1];
        const dm = /\{\{rd:sc(\d)div\}\}/.exec(v);
        if (dm) { const dv = vs && vs[+dm[1] - 1] && vs[+dm[1] - 1].div; if (typeof dv === 'number') v = v.replace(dm[0], cur + RV.fmtPrice(dv)); }
        return [String(x[0]).replace(/\s+/g, ' ').trim(), String(v).replace(/\s+/g, ' ').trim()];
      });
      const head = meta.heads[i];
      rows.forEach(([k, v], j) => { if (!k || !v || /[{}<>]/.test(k + v) || k.length > 60 || v.length > 80 || S.S6_PRICE_RE.test(k)) bad.push(`scenarios.cases[${i}] row ${j} "${k}: ${v}" cannot be carried`); });
      if (!rows.length || rows.length > 5) bad.push(`scenarios.cases[${i}]: ${rows.length} rows (carry 1–5)`);
      if (!head || head.length > 80) bad.push(`scenarios.cases[${i}]: column header "${head || ''}" cannot be carried`);
      if (tgts[i] == null) bad.push(`scenarios.cases[${i}]: no printed target to carry`);
      return { head, rows };
    });
    if (bad.length) (why.length ? H : F).push(...bad.map((x) => `${x} (author cells: ${why.concat(soft).join(' · ')})`));
    else {
      meta.perCase = true;
      // ฐานเดียวที่ template ใช้ไม่ได้ (hard) = ไม่มีฐาน: ไม่ถอดกลับ · ไม่พิมพ์ฐานของ template (noBase) · ฐานของผู้เขียน (values.baseEps) / fundamentals ที่ใช้ได้ = คงไว้
      if (why.length && meta.base !== 'values.baseEps' && meta.base !== 'leg override') { delete out.baseOverride; meta.base = 'author cells'; meta.noBase = true; }
      out.cases.forEach((cs, i) => { if (cs.growth == null || !simpleHead(cells[i].head, out.driver)) delete cs.growth; if (cs.exitMultiple == null) delete cs.exitMultiple; });
      meta.display = { s6: cells, targets: tgts };
      if (meta.noBase) meta.display.noBase = true;
      F.push(`scenarios: the author's cells per column (v2Display.s6 + targets — ${why.concat(soft).join(' · ')})`);
    }
  }
  if (!meta.perCase) H.push(...meta.noGrowth.map((i) => `scenarios.cases[${i}].growth unreadable ("${cols[i].top ? cols[i].top[1] : ''}")`));
  if (!meta.perCase) out.cases.forEach((cs, i) => { if (cs.exitMultiple == null) H.push(`scenarios.cases[${i}].exitMultiple unreadable`); });
  const note = (parsed.s6paras || []).map((p) => MP.htmlToProse(p)).filter(Boolean).join('<br>');
  if (note) out.note = note; else H.push('scenarios.note: no paragraph under the scenario columns');
  return { scenarios: out, H, D, F, meta };
}

/** ราคาเป้าที่พิมพ์ (values.scenarios[i].tgt หรือ .tgt ของคอลัมน์) vs ที่ compute คิดใหม่ — ต่างเกินครึ่งหน่วยที่พิมพ์ → D */
function tgtCheck(parsed, view) {
  const D = [];
  const v = (parsed.rd && parsed.rd.values) || {};
  const s6 = parsed.byN && parsed.byN[6];
  (view.scn || []).forEach((sc, i) => {
    // values.scenarios พิมพ์ผ่าน fmtPrice (2 ตำแหน่ง) ⇒ ครึ่งหน่วย = 0.005 · .tgt ที่เป็น literal ใช้ทศนิยมที่พิมพ์ (fix round 1 · M-1)
    let shown = v.scenarios && v.scenarios[i] ? v.scenarios[i].tgt : null, txt = shown != null ? String(shown) : null, tol = 0.005;
    if (shown == null && s6) { const m = /<div class="tgt">([\s\S]*?)<\/div>/.exec(s6.body.split(/<div class="col /)[i + 1] || ''); if (m && !/\{\{rd:/.test(m[1])) { txt = m[1]; shown = numOf(m[1]); tol = 0.5 * Math.pow(10, -decOf(txt)); } }
    if (shown == null) return;
    if (Math.abs(sc.tgt - shown) > tol + 1e-9) D.push(`scn.${NAMES[i]}.tgt ${txt} → ${Math.round(sc.tgt * 100) / 100}`);
  });
  return D;
}

module.exports = { scenarios, tgtCheck, divClash, fundStart, retParts, perYearOf, retResolve, DRIVER, EXIT };
