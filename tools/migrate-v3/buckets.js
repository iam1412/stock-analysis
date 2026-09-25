'use strict';
/** buckets.js — 3 ถังของ migration (spec §10.4 · plan D5) · HUMAN > VALUE-DRIFT > CLEAN · เหตุผลทุกข้อคืนเป็นข้อความสำหรับตาราง sweep */
function bucketOf(notes, eq) {
  const H = [...notes.H], D = [...notes.D], F = [];
  if (eq.textLost.length) H.push(`TEXT LOST ×${eq.textLost.length}: ${eq.textLost.slice(0, 8).join(' ')}`);
  if (eq.colour && eq.colour.keys.length) H.push(`theme keys off > 12: ${eq.colour.keys.join(' ')}`);
  for (const r of eq.numberValue) D.push(`${r.zone}: ${r.del} → ${r.ins}`);
  // gauge.{min,max} = F (controller ruling · plan D5): v3 derive ขอบเกจจาก fv/px ใน compute.js · cron ปรับสเกลเกจ v2 อยู่แล้ว ⇒ format-only
  //   แถวยังอยู่ใน eq.rd (คอลัมน์ rdRows ของตาราง sweep) แต่ไม่ทำให้เป็น VALUE-DRIFT
  for (const r of eq.rd) {
    const row = `rd/sm ${r.path}: ${r.v2} → ${r.v3}`;
    if (/^gauge\.(min|max)$/.test(r.path)) F.push(row); else D.push(row);
  }
  if (H.length) return { bucket: 'HUMAN', reasons: H.concat(D.map((d) => 'D: ' + d)) };
  if (D.length) return { bucket: 'VALUE-DRIFT', reasons: D };
  return { bucket: 'CLEAN', reasons: notes.F.concat(F) };
}
module.exports = { bucketOf };
