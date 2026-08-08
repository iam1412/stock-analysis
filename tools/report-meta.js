'use strict';
/**
 * report-meta.js — ที่เดียวที่รู้ว่า `stock-meta` ถูกฝังในรายงานยังไง
 *
 * regex ก้อนนี้เคยถูกเขียนซ้ำใน update-prices.js (ตอนอ่าน) · dead-ticker-canary.js (readMeta)
 * และ patchReport (ตอนเขียนกลับ) — skeleton เปลี่ยนวิธีฝังเมื่อไร (ลำดับ attribute · เติม
 * `type="application/json"` · minify) ตัวที่หลุดจะ "ไม่เจอ" แบบเงียบ ๆ ไม่ throw
 * ⇒ canary กลายเป็นตัวที่รายงานว่า "ข้าม 782 ตัว" แล้วผ่านเขียว ๆ = canary ที่ไม่ตรวจอะไรเลย
 */

/** อ่านอย่างเดียว — คืนเนื้อใน block */
const STOCK_META_RE = /<script[^>]*\bid=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i;
/** อ่านเพื่อเขียนกลับ — แยกหัว/เนื้อ/ท้าย ให้ประกอบคืนได้ */
const STOCK_META_PARTS_RE = /(<script[^>]*\bid=["']stock-meta["'][^>]*>)([\s\S]*?)(<\/script>)/i;

/** คืน object ของ stock-meta · ไม่มี block หรือ JSON เสีย → null (caller ตัดสินเองว่าจะ fail ยังไง) */
function readStockMeta(html) {
  const m = String(html).match(STOCK_META_RE);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

module.exports = { readStockMeta, STOCK_META_RE, STOCK_META_PARTS_RE };
