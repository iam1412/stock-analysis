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

const DRIVER = [['de', /\bDE\b|distributable/i], ['fre', /\bFRE\b|fee[-\s]*related/i],
  ['revenuePerShare', /ยอดขาย|รายได้|revenue|\bRev\b|sales/i], ['ffo', /A?FFO/i], ['bvps', /BVPS|BV\b|book/i], ['fcfPerShare', /FCF/i], ['eps', /EPS|กำไร/i]];
const EXIT = [['evsales', /EV\s*\/\s*S(?:ales)?\b/i], ['ps', /(?<!EV)\s*\bP\s*\/\s*S\b/i], ['pffo', /P\s*\/\s*A?FFO/i], ['pbv', /P\s*\/\s*BV|P\/B\b/i], ['pfcf', /P\s*\/\s*FCF/i], ['pe', /P\s*\/\s*E/i]];
const NAMES = ['bear', 'base', 'bull'];
const numOf = (s) => { const m = /([0-9][0-9,]*(?:\.[0-9]+)?)/.exec(String(s == null ? '' : s)); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
const pctOf = (s) => { const m = /([+\-−]?)\s*([0-9]+(?:\.[0-9]+)?)\s*%/.exec(String(s || '')); return m ? parseFloat(m[2]) * (m[1] === '-' || m[1] === '−' ? -1 : 1) : null; };
const decOf = (s) => { const m = /[0-9][0-9,]*(?:\.([0-9]+))?/.exec(String(s)); return m && m[1] ? m[1].length : 0; };
const isExit = (label) => /ออก|exit/i.test(label);
const isEnd = (label) => /ปี\s*\d/.test(label) && !/ปันผล/.test(label);
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
function retNoteOf(html, i, H, F, divIncluded) {
  const h = String(html || ''), m = RET_ANCHOR.exec(h);
  if (!m) return null;
  const note = MP.htmlToProse(h.slice(m.index + m[0].length));
  if (!note) return null;
  if (RET_UNSAFE.test(note)) { H.push(`scenarios.cases[${i}] .ret annotation "${note}" not carried — a per-year/number label would mislabel the v3 total return`); return null; }
  const clash = divClash(note, divIncluded);
  if (clash) { H.push(`scenarios.cases[${i}] .ret annotation "${note}" not carried — dividend claim in the note contradicts divIncluded (${clash})`); return null; }
  F.push(`scenarios.cases[${i}].retNote "${note}" (author annotation in .ret)`);
  return note;
}

/** ฐานของ driver จาก fundamentals (สูตรเดียวกับ compute.driverStart — fx = 1 เพราะ migrator ไม่ตั้ง reportCurrency) */
function fundStart(driver, f) {
  const per = (k) => (f[k] != null && f.shares ? f[k] / f.shares : null);
  const v = { eps: f.eps, ffo: f.ffoPerShare, bvps: f.bvps, revenuePerShare: per('revenue'), fcfPerShare: per('fcf'), de: f.dePerShare, fre: f.frePerShare }[driver];
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
    if (/รวมปันผล/.test(MP.htmlToProse(parsed.s6hint || '')) && divAll) out.divIncluded = true;
    F.push(`scenarios: no values.scnBasis — years ${out.years} · divIncluded ${out.divIncluded} · perYear null (from the section head/hint)`);
  }
  const meta = { driverText: null, exitText: null, starts: [], ends: [], base: null };
  if (cols.length !== 3) { H.push(`scenarios: ${cols.length} columns (need Bear/Base/Bull)`); return { scenarios: null, H, D, F, meta }; }
  const top = cols[0].top ? cols[0].top[1] : '';
  meta.driverText = top;
  const drv = (DRIVER.find(([, re]) => re.test(top)) || [null])[0];
  const exLi = cols[0].lis.find((x) => isExit(x[0]));
  meta.exitText = exLi ? exLi[0] : null;
  const ex = exLi ? (EXIT.find(([, re]) => re.test(exLi[0])) || [null])[0] : null;
  if (!drv) H.push(`scenarios.driver "${top}" not in ${JSON.stringify(S.ENUM.driver)}`);
  if (!ex) H.push(`scenarios.exitMetric "${meta.exitText}" not in ${JSON.stringify(S.ENUM.exitMetric)}`);
  out.driver = drv || 'eps'; out.exitMetric = ex || 'pe';
  let dp = 0;
  const vs = Array.isArray(v.scenarios) ? v.scenarios : null;
  out.cases = cols.map((c, i) => {
    const growth = c.top ? pctOf(c.top[1]) : null;
    const exS = (c.lis.find((x) => isExit(x[0])) || [])[1];
    const exitMultiple = numOf(exS);
    if (exS != null) dp = Math.max(dp, decOf(exS));
    const divLi = c.lis.find((x) => /ปันผลรวม/.test(x[0]));
    let divCum = null;
    if (divLi && !/\{\{rd:/.test(divLi[2])) divCum = numOf(divLi[1]);
    else if (vs && vs[i] && typeof vs[i].div === 'number') divCum = vs[i].div;
    const descLi = c.lis.find((x) => /สถานการณ์/.test(x[0]));
    const desc = descLi ? MP.htmlToProse(descLi[2]) : '';
    if (growth == null) H.push(`scenarios.cases[${i}].growth unreadable ("${c.top ? c.top[1] : ''}")`);
    if (exitMultiple == null) H.push(`scenarios.cases[${i}].exitMultiple unreadable`);
    if (!desc) H.push(`scenarios.cases[${i}].desc: no "สถานการณ์" row`);
    if (out.divIncluded && divCum == null) H.push(`scenarios.cases[${i}].divCum missing while divIncluded`);
    const endLi = c.lis.find((x) => isEnd(x[0]));
    const end = endLi ? numOf(endLi[1]) : null;
    meta.starts.push(end != null && growth != null ? end / Math.pow(1 + growth / 100, out.years) : null);
    meta.ends.push(end != null && growth != null ? { end, text: endLi[1], growth } : null);
    const cs = { growth, exitMultiple };
    if (divCum != null) cs.divCum = divCum;
    cs.desc = desc;
    const rn = retNoteOf(c.retHtml, i, H, F, out.divIncluded);
    if (rn) cs.retNote = rn;
    return cs;
  });
  out.exitDp = Math.min(dp, 2);
  // baseOverride (fix round 1 · I-2/M-3/M-4) — ค่าที่ผู้เขียนพิมพ์เท่านั้นที่อ้างว่า "ผู้เขียนใช้":
  //  eps: values.baseEps · อื่น ๆ: ฐานต่อหุ้นที่ขาพิมพ์ (override ของขา) · ฐานจาก fundamentals ที่คิดค่าปลายฉากที่พิมพ์ได้ครบ 3 คอลัมน์ = ไม่ต้อง override
  //  ไม่งั้นถอดกลับจากค่าปลายฉากที่พิมพ์ + F (ไม่อ้างว่าเป็นของผู้เขียน)
  const fStart = fundStart(out.driver, fund || {});
  const ends = meta.ends.filter(Boolean);
  const fits = (b) => b > 0 && ends.length > 0 && ends.every((e) => Math.abs(b * Math.pow(1 + e.growth / 100, out.years) - e.end) <= 0.5 * Math.pow(10, -decOf(e.text)) + 1e-9);
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
    } else if (p0 != null && fStart != null && (() => { const e = meta.starts[1] > 0 ? meta.ends[1] : ends[0]; return e && Math.abs(p0 - fStart) <= 0.5 * Math.pow(10, -decOf(e.text)) + 1e-9; })()) {
      meta.base = 'fundamentals (rounding)';   // ถอดกลับได้เท่า fundamentals ภายในการปัดของคอลัมน์ที่ใช้ (fix round 2 · M-7) — override ไม่เพิ่มข้อมูล
    } else if (p0 != null) {
      out.baseOverride = { value: +p0.toPrecision(6), why: out.driver === 'eps' ? 'EPS ฐานฉากถอดกลับจากราคาเป้าที่พิมพ์' : 'ฐานฉากถอดกลับจากค่าปลายฉากที่พิมพ์' };
      meta.base = 'back-computed';
      F.push(`scenarios.baseOverride ${out.baseOverride.value} back-computed from the printed ${out.driver} end values${out.driver === 'eps' ? ' (values.baseEps absent)' : ''}`);
    } else if (fStart == null) H.push(`scenarios: no base for driver ${out.driver} (fundamentals and printed end value both missing)`);
  }
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

module.exports = { scenarios, tgtCheck, divClash, fundStart, DRIVER, EXIT };
