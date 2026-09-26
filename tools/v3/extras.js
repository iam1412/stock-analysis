'use strict';
/**
 * extras.js — ตาราง extras[] ของ v3 (spec §3.6 M): format cell ตัวเลข (ลบ = U+2212 เสมอ) · ยอดรวม · E52 SOTP tie-out
 * E52: ขา declared sotp/nav ต้องอ้างตาราง · ขาใดที่อ้าง extrasRef: แถว total = Σ แถวข้อมูลภายใต้การปัด · ยอด × fx ≈ ค่าขา ±1%
 *      ขาที่ไม่อ้างตารางต้องมีเหตุผลใน note
 */
const RV = require('../report-values.js');
const S = require('./schema.js');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ปัดด้วย RV.round (สูตรเดียวกับ fmtPrice: 2.675 → 2.68) แล้วค่อยตัดสินเครื่องหมาย — ค่าที่ปัดแล้วเป็น 0 ไม่มี −/+ ค้าง
function group(n, dp) { const [i, d] = RV.round(Math.abs(n), dp).toFixed(dp).split('.'); return Number(i).toLocaleString('en-US') + (d ? '.' + d : ''); }
const isZero = (n, dp) => RV.round(Math.abs(n), dp) === 0;
function fmtCell(n, col, view) {
  // ไม่มี columns = ทาง Plan 1 (fmtPrice) แต่ลบใช้ U+2212
  if (!col) return (n < 0 && !isZero(n, 2) ? '−' : '') + RV.fmtPrice(Math.abs(n));
  const sign = isZero(n, col.dp) ? '' : n < 0 ? '−' : col.signed && n > 0 ? '+' : '';
  const body = group(n, col.dp);
  if (col.unit === 'pct') return sign + body + '%';
  if (col.unit === 'x') return sign + body + 'x';
  if (col.unit === 'ccy') return sign + (view.stmtCur || view.cur) + body;
  return sign + body;
}
// เงินสกุลราคา 2 ตำแหน่ง (แถวแปลงสกุล): เครื่องหมายเดียวกับ fmtCell แล้ววางสัญลักษณ์หลัง − → "−$2.31"
function fmtMoney(n, sym) { const s = fmtCell(n, undefined); return s[0] === '−' ? '−' + sym + s.slice(1) : sym + s; }
const dataRows = (x) => (x.rows || []).filter(Array.isArray);
function tableTotal(x) {
  const sum = dataRows(x).reduce((a, r) => a + r[x.sumCol], 0);
  const t = (x.rows || []).find((r) => r && !Array.isArray(r) && r.kind === 'total');
  return { sum, total: t ? t.cells[x.sumCol] : sum, hasTotalRow: !!t };
}
const legDescOf = (doc, i) => { const vd = S.isMigrated(doc) && doc.v2Display; const t = vd && Array.isArray(vd.legDescs) ? vd.legDescs[i] : null; return typeof t === 'string' && t.trim() ? t : null; };
function tieOut(doc, view) {
  const out = [];
  doc.legs.forEach((leg, i) => {
    if (leg.method !== 'declared') return;
    const p = `legs[${i}]`, inp = leg.inputs;
    // กติกาเดียวที่ขึ้นกับ basis: sotp/nav ต้องมีตาราง · การตรวจยอด (E52) ผูกกับ extrasRef ไม่ใช่ basis (spec §3.6 M)
    // Plan 4c-transcribe: ใบ migrate (meta.migratedFrom) ที่หน้า v2 ไม่มีตารางองค์ประกอบ (16/17 ใบ HUMAN ที่วัด) → ตกไปกติกา note เหมือน declared อื่น
    if ((inp.basis === 'sotp' || inp.basis === 'nav') && inp.extrasRef == null && !S.isMigrated(doc)) {
      out.push({ path: `${p}.inputs.extrasRef`, msg: `ขา declared (${inp.basis}) ต้องอ้างตาราง extras ที่รวมยอดได้` }); return;
    }
    if (inp.extrasRef != null) {
      const x = doc.extras[inp.extrasRef];
      if (!x || x.sumCol == null) { out.push({ path: `extras[${inp.extrasRef}].sumCol`, msg: 'ตารางที่ขา declared อ้างต้องมี sumCol' }); return; }
      const { sum, total, hasTotalRow } = tableTotal(x);
      const dp = x.columns && x.columns[x.sumCol] ? x.columns[x.sumCol].dp : 2;
      const tol = dataRows(x).length * 0.5 * Math.pow(10, -dp) + 1e-9;
      if (hasTotalRow && Math.abs(total - sum) > tol)
        out.push({ path: `extras[${inp.extrasRef}].rows`, msg: `แถว total ${total} ≠ Σ แถวข้อมูล ${+sum.toFixed(dp)} (เกินการปัด ±${+tol.toFixed(dp + 1)})` });
      const scaled = total * (x.fx ? doc.fundamentals.fx : 1), value = view.legs[i].value;
      if (Math.abs(scaled - value) / value > 0.01)
        out.push({ path: `${p}.inputs.value`, msg: `ยอดตาราง ${+scaled.toFixed(2)}${x.fx ? ` (× fx ${doc.fundamentals.fx})` : ''} ≠ ค่าขา ${value} เกิน 1%` });
    } else if (!(typeof leg.note === 'string' && leg.note.trim()) && !legDescOf(doc, i)) {
      // ใบ migrate: คำอธิบายขาของผู้เขียนตามตัว (v2Display.legDescs[i]) = เหตุผลของขานี้ (27 ก.ย. 69)
      out.push({ path: `${p}.note`, msg: `ขา declared (${inp.basis}) ไม่มีตารางอ้าง ต้องมีเหตุผลใน note` });
    }
  });
  return out;
}
module.exports = { fmtCell, fmtMoney, tableTotal, tieOut, isNum };
