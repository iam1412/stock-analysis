'use strict';
/**
 * synonyms.js — คำพ้องที่อนุมัติของ equivalence gate (Plan 4c-prep · spec §3.7 ค · plan D4 · §10.2 ข้อ b)
 * ★ ปิด — เพิ่มได้ผ่าน review ทีละคำเท่านั้น (เหมือน TEMPLATE_VOCAB / FORMULA_VOCAB)
 * ★ ใช้เฉพาะ "องค์ประกอบที่ align กัน" (role) และเฉพาะเมื่อ guard เชิงโครงสร้างบน doc/view v3 เป็นจริง — คำนอก role/guard = เทียบตามปกติ
 * ★ ห้ามใส่คำที่บอกข้อเท็จจริง (FACT_WORDS) — คำพวกนั้นต้องมีช่อง/enum (Kind 1) ไม่ใช่คำพ้อง
 * from = วลีโทเค็นของ v2 (เทียบด้วย keyOf — ตัดวงเล็บ/เครื่องหมาย) · to = โทเค็นที่ v3 พิมพ์ (ว่าง = v3 แสดงปริมาณเดียวกันเป็นตัวเลข/ป้าย template)
 */
const S = require('../v3/schema.js');
const keyOf = (t) => String(t).replace(/[^\p{L}\p{M}\p{N}]/gu, '').replace(/\p{N}+/gu, '#');
const PER_SHARE = ['revenuePerShare', 'fcfPerShare', 'de', 'fre', 'ebitdaPerShare'];
const scn = (g) => (g.doc && g.doc.scenarios) || {};
const FACT_WORDS = [/^AFFO$/i, /^Core$/i, /^forward$/i, /^FY\s*'?\d{2,4}\s*[EeF]$/, /^Tangible$/i, /^adj\.?$/i, /^GAAP$/i];
const SYNONYM_VOCAB = [
  { id: 'exit', roles: ['s6.exitRow'], from: [['Exit'], ['ทางออก']], to: ['ออก'], guard: () => true,
    why: 'แถวตัวคูณออกของคอลัมน์เดียวกัน — v3 พิมพ์ "<ตัวคูณ> ออก" (measure §6.2 · CBRS L)' },
  { id: 'per-share', roles: ['s6.top', 's6.endRow'], from: [['sh'], ['Sh'], ['share']], to: ['หุ้น'], guard: (g) => PER_SHARE.includes(scn(g).driver),
    why: 'ตัวตั้งต่อหุ้น ("Rev/Sh" · "FCF/share") — v3 พิมพ์ "<driver>/หุ้น" เมื่อ driver เป็นค่าต่อหุ้น' },
  { id: 'revenue', roles: ['s6.top', 's6.endRow'], from: [['Rev'], ['Revenue'], ['Sales']], to: ['รายได้'], guard: (g) => scn(g).driver === 'revenuePerShare',
    why: 'driver รายได้ต่อหุ้น — v3 พิมพ์ "รายได้/หุ้น" (measure §6.2: CRWV CSGP OKJ HSAI)' },
  { id: 'revenue-year', roles: ['s6.endRow'], from: [['รายได้ปี']], to: ['รายได้', 'ปี'], guard: (g) => scn(g).driver === 'revenuePerShare',
    why: 'แถวปลายฉาก "รายได้ปี 3" ≡ "รายได้/หุ้น ปี 3" (CPNG INTC)' },
  { id: 'ffo', roles: ['s6.top', 's6.endRow', 's6.exitRow'], from: [['FFO']], to: ['FFO'], guard: (g) => S.FFO_LABEL[((g.doc || {}).fundamentals || {}).ffoBasis || 'ffo'] === 'FFO',
    why: 'FFO เฉพาะเมื่อ ffoBasis ของ v3 คือ FFO — ใต้ AFFO/Core FFO เป็นข้อเท็จจริงคนละตัว (Kind 1)' },
  { id: 'total', roles: ['s6.ret'], from: [['total'], ['Total'], ['รวม']], to: [], guard: () => true,
    why: 'ป้ายผลตอบแทนรวมใน .ret — ตัวเลขใน .ret ของ v3 คือผลตอบแทนรวม N ปีอยู่แล้ว (APO HLT)' },
  { id: 'per-year', roles: ['s6.ret'], from: [['ต่อปี']], to: ['ปี'], guard: (g) => scn(g).perYear != null,
    why: 'หน่วยต่อปีของ perYear ที่อนุมาน (D3) — v3 พิมพ์ "(x%/ปี)"' },
  { id: 'median-hist', roles: ['s3.mdesc'], from: [['มัธยฐานย้อนหลัง']], to: ['มัธยฐาน'], guard: (g) => !!g.leg && ['median5y', 'median10y'].includes((g.leg.inputs || {}).multipleSource),
    why: 'ขาตัวคูณที่ v3 พิมพ์ "(มัธยฐาน N ปี)" — มัธยฐานของตัวเองย้อนหลัง = ข้อเท็จจริงเดียวกัน' },
  { id: 'context', roles: ['s3.mname', 's3.mdesc'], from: [['ไม่รวมใน', 'FV'], ['ไม่นับใน', 'FV'], ['ไม่รวมในกรอบ', 'FV'], ['ไม่รวมในกรอบ'], ['ไม่นับใน'], ['ไม่รวมใน'], ['บริบท']], to: [],
    guard: (g) => !!g.leg && g.leg.role === 'context',
    why: 'ป้ายขาบริบทของผู้เขียน ≡ "(บริบท — ไม่นับใน FV)" ที่ template พิมพ์ (measure §6.1: 27/29 ขา role context แล้ว)' },
  { id: 'no-div', roles: ['s6.divRow'], from: [['ไม่จ่าย']], to: [], guard: (g) => !!g.case && !(g.case.divCum > 0),
    why: 'ฉากที่ v3 ไม่มีปันผล (divCum 0/ไม่มี) — v3 พิมพ์ศูนย์/ไม่มีแถว' },
  { id: 'flat', roles: ['s6.top'], from: [['ทรงตัว'], ['คงที่'], ['flat']], to: [], guard: (g) => !!g.case && g.case.growth === 0,
    why: 'growth = 0 — v3 พิมพ์ "+0%/ปี"' },
];
/** tokens (v2 ขององค์ประกอบเดียว) → { tokens, used } · วลียาวก่อน · ไม่ผ่าน guard = คืนเดิม */
function apply(role, tokens, g) {
  let out = tokens.slice(); const used = [];
  for (const e of SYNONYM_VOCAB) {
    if (!e.roles.includes(role) || !e.guard(g || {})) continue;
    for (const ph of e.from.slice().sort((a, b) => b.length - a.length)) {
      const K = ph.map(keyOf);
      for (let i = 0; i + K.length <= out.length; i++) {
        if (!K.every((k, j) => keyOf(out[i + j]) === k)) continue;
        used.push({ id: e.id, w: out.slice(i, i + K.length).join(' ') });
        out.splice(i, K.length, ...e.to); i += e.to.length - 1;
      }
    }
  }
  return { tokens: out, used };
}
module.exports = { SYNONYM_VOCAB, FACT_WORDS, apply, keyOf };
