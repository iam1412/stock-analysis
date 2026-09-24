'use strict';
/**
 * extras.js — ตาราง extras[] ของ v3 (spec §3.6 M): format cell ตัวเลข (ลบ = U+2212 เสมอ) · ยอดรวม · E52 SOTP tie-out
 * E52: ขา declared (sotp/nav) ต้องอ้างตารางที่รวมยอดได้ · แถว total = Σ แถวข้อมูลภายใต้การปัด · ยอด × fx ≈ ค่าขา ±1%
 */
const RV = require('../report-values.js');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function group(n, dp) { const [i, d] = Math.abs(n).toFixed(dp).split('.'); return Number(i).toLocaleString('en-US') + (d ? '.' + d : ''); }
function fmtCell(n, col, view) {
  if (!col) return (n < 0 ? '−' : '') + RV.fmtPrice(Math.abs(n));   // ไม่มี columns = ทาง Plan 1 (fmtPrice) แต่ลบใช้ U+2212
  const sign = n < 0 ? '−' : col.signed && n > 0 ? '+' : '';
  const body = group(n, col.dp);
  if (col.unit === 'pct') return sign + body + '%';
  if (col.unit === 'x') return sign + body + 'x';
  if (col.unit === 'ccy') return sign + (view.stmtCur || view.cur) + body;
  return sign + body;
}
const dataRows = (x) => (x.rows || []).filter(Array.isArray);
function tableTotal(x) {
  const sum = dataRows(x).reduce((a, r) => a + r[x.sumCol], 0);
  const t = (x.rows || []).find((r) => r && !Array.isArray(r) && r.kind === 'total');
  return { sum, total: t ? t.cells[x.sumCol] : sum, hasTotalRow: !!t };
}
function tieOut(doc, view) {
  const out = [];
  doc.legs.forEach((leg, i) => {
    if (leg.method !== 'declared') return;
    const p = `legs[${i}]`, inp = leg.inputs;
    if (inp.basis === 'sotp' || inp.basis === 'nav') {
      if (inp.extrasRef == null) { out.push({ path: `${p}.inputs.extrasRef`, msg: `ขา declared (${inp.basis}) ต้องอ้างตาราง extras ที่รวมยอดได้` }); return; }
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
    } else if (inp.extrasRef == null && !(typeof leg.note === 'string' && leg.note.trim())) {
      out.push({ path: `${p}.note`, msg: `ขา declared (${inp.basis}) ไม่มีตารางอ้าง ต้องมีเหตุผลใน note` });
    }
  });
  return out;
}
module.exports = { fmtCell, tableTotal, tieOut, isNum };
