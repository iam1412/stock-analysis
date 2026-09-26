'use strict';
/**
 * numbers.js — ตัวเลขในข้อความของ equivalence gate (ย้ายจาก equiv.js · Plan 4c-prep Task 4)
 * แยกเป็นโมดูลเล็กเพื่อให้ scenarios.js (Task 5) ใช้ได้โดยไม่เกิดวง require equiv → assemble
 */
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// หน่วยท้ายตัวเลข (ล้าน/พันล้าน/M/B …) เป็นส่วนของตัวเลข — "$2,070M" ≡ "$2.07B" · ไม่ใช่คำของผู้เขียน
// display-fix: "พัน ล." (เว้นวรรค — ADVICE/EVRG "~฿4.18 พัน ล.") = พันล้าน ไม่ใช่ "พัน" (×1e3)
const UNIT = { 'ล้านล้าน': 1e12, 'แสนล้าน': 1e11, 'หมื่นล้าน': 1e10, 'พันล้าน': 1e9, 'ร้อยล้าน': 1e8, 'ล้านบาท': 1e6, 'ล้าน': 1e6, 'พัน': 1e3,
  'พันล.': 1e9, 'พัน ล.': 1e9, 'พันลบ.': 1e9, 'หมื่นลบ.': 1e10, 'แสนลบ.': 1e11, 'ลบ.': 1e6, 'ล.': 1e6, T: 1e12, B: 1e9, M: 1e6, K: 1e3, bn: 1e9, mn: 1e6, billion: 1e9, million: 1e6 };
const UNIT_SRC = Object.keys(UNIT).sort((a, b) => b.length - a.length).map(reEsc).join('|');
// เครื่องหมายลบหน้าสัญลักษณ์เงิน ("−$0.77") = ค่าลบ เท่ากับ "$-0.77" (display-fix · เดิมเครื่องหมายหายเมื่อมีสัญลักษณ์คั่น)
const CUR_SRC = '(?:US\\$|C\\$|HK\\$|NT\\$|S\\$|A\\$|\\$|฿|€|£|¥)';
const NUM_RE = new RegExp(`(?:^|[^0-9.,])([-−]?)(?:${CUR_SRC}([-−]?))?([0-9][0-9,]*(?:\\.[0-9]+)?)(?:\\s?(${UNIT_SRC})(?![A-Za-z฀-๿]))?`, 'gu');
const UNIT_WORD = new Set(Object.keys(UNIT).map((u) => u.replace(/[^\p{L}\p{M}\p{N}]/gu, '')));
function numsOf(s) {
  const out = [];
  for (const m of String(s).matchAll(NUM_RE)) {
    const raw = m[3].replace(/[.,]$/, '');
    const dec = /\.([0-9]+)$/.exec(raw), sc = m[4] ? UNIT[m[4]] : 1;
    out.push({ v: (m[1] || m[2] ? -1 : 1) * parseFloat(raw.replace(/,/g, '')) * sc, half: 0.5 * Math.pow(10, -(dec ? dec[1].length : 0)) * sc });
  }
  return out;
}
/** ตัวเลขสองฝั่ง: 'rounding' ถ้าทุกคู่ห่าง ≤ ครึ่งหน่วยของทศนิยมที่พิมพ์หยาบกว่า · ไม่งั้น 'value' */
function classifyNumber(a, b) {
  const x = numsOf(a), y = numsOf(b);
  if (!x.length || x.length !== y.length) return 'value';
  return x.every((p, i) => Math.abs(p.v - y[i].v) <= Math.max(p.half, y[i].half) * (1 + 1e-9)) ? 'rounding' : 'value';
}
module.exports = { UNIT, UNIT_SRC, NUM_RE, UNIT_WORD, numsOf, classifyNumber };
