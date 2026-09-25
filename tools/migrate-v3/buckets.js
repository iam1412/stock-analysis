'use strict';
/** buckets.js — 3 ถังของ migration (spec §10.4 · plan D5) · HUMAN > VALUE-DRIFT > CLEAN · เหตุผลทุกข้อคืนเป็นข้อความสำหรับตาราง sweep */
function bucketOf(notes, eq) {
  const H = [...notes.H], D = [...notes.D];
  if (eq.textLost.length) H.push(`TEXT LOST ×${eq.textLost.length}: ${eq.textLost.slice(0, 8).join(' ')}`);
  if (eq.colour && eq.colour.keys.length) H.push(`theme keys off > 12: ${eq.colour.keys.join(' ')}`);
  for (const r of eq.numberValue) D.push(`${r.zone}: ${r.del} → ${r.ins}`);
  for (const r of eq.rd) D.push(`rd/sm ${r.path}: ${r.v2} → ${r.v3}`);
  if (H.length) return { bucket: 'HUMAN', reasons: H.concat(D.map((d) => 'D: ' + d)) };
  if (D.length) return { bucket: 'VALUE-DRIFT', reasons: D };
  return { bucket: 'CLEAN', reasons: notes.F.slice() };
}
module.exports = { bucketOf };
