'use strict';
/**
 * report-meta.js — **เจ้าของเดียว** ของ regex ที่อ่าน/เขียนบล็อกฝังในรายงาน (test/parser-lint.js บังคับ):
 *   stock-meta (JSON ตัวเลขสำหรับ index) · report-data (theme/chart/gauge) · ราคา header `.px`
 * เดิมสำเนา 8+6+6 จุดใน 4 คำศัพท์สกุลเงิน (code-audit §2.5 · ระยะ 1 WS1 ข้อ 3) — ตัวที่หลุดจะพังเงียบ
 *
 * skeleton เปลี่ยนวิธีฝังเมื่อไร (ลำดับ attribute · เติม `type="application/json"` · minify) ตัวที่หลุดจะ
 * "ไม่เจอ" แบบเงียบ ๆ ไม่ throw ⇒ canary กลายเป็นตัวที่รายงานว่า "ข้าม 782 ตัว" แล้วผ่านเขียว ๆ
 *
 * ★ ห้าม require อะไรในรีโปนี้ (กัน cycle — ทุกชั้นตั้งแต่ build/cron/gate import ไฟล์นี้)
 */

/** อ่านอย่างเดียว — คืนเนื้อใน block */
const STOCK_META_RE = /<script[^>]*\bid=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i;
/** อ่านเพื่อเขียนกลับ — แยกหัว/เนื้อ/ท้าย ให้ประกอบคืนได้ */
const STOCK_META_PARTS_RE = /(<script[^>]*\bid=["']stock-meta["'][^>]*>)([\s\S]*?)(<\/script>)/i;
const REPORT_DATA_RE = /<script[^>]*\bid=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i;
const REPORT_DATA_PARTS_RE = /(<script[^>]*\bid=["']report-data["'][^>]*>)([\s\S]*?)(<\/script>)/i;
// สกุลเงินหน้าราคา header — คำศัพท์เดียวทั้งรีโป (เดิม update-prices รับ [฿$] · derived-values รับ C$ ด้วย)
// census 12 ก.ย. 69: 908/908 ใบให้ผลเท่าเดิมทุกตัวแปร (ไม่มีใบไหนขึ้นต้น C$) ⇒ รวมคำศัพท์ไม่เปลี่ยนพฤติกรรม
const CUR_SRC = '(?:C\\$|[฿$])';
const PX_RE = new RegExp('<div class="px">\\s*(' + CUR_SRC + ')\\s*([\\d.,]+)');
const PX_PARTS_RE = new RegExp('(<div class="px">\\s*' + CUR_SRC + ')([\\d.,]+)');
// กรอบ 52 สัปดาห์ในหัวรายงาน (ตัวคั่น – / &ndash; วงเล็บ — วัด 908 ใบ 12 ก.ย. 69 · ย้ายจาก tools/queue/prep.js)
const RANGE52_RE = new RegExp('กรอบ 52 สัปดาห์\\s*\\(?\\s*' + CUR_SRC + '?\\s*([0-9][0-9.,]*)\\s*(?:&[a-z]+;|[–—\\-/])\\s*' + CUR_SRC + '?\\s*([0-9][0-9.,]*)');

/** { present:false } | { present:true, ok:true, data } | { present:true, ok:false, err } — gate ต้องแยก "ไม่มีบล็อก" จาก "JSON เสีย" */
const state = (re) => (html) => {
  const m = String(html).match(re);
  if (!m) return { present: false };
  try { return { present: true, ok: true, data: JSON.parse(m[1]) }; }
  catch (e) { return { present: true, ok: false, err: e.message }; }
};
const readStockMetaState = state(STOCK_META_RE);
const readReportData = state(REPORT_DATA_RE);

/** คืน object ของ stock-meta · ไม่มี block หรือ JSON เสีย → null (caller ตัดสินเองว่าจะ fail ยังไง) */
function readStockMeta(html) { const s = readStockMetaState(html); return s.ok ? s.data : null; }

/** ราคาใน header · { currency:'$'|'฿'|'C$', price:number, raw:string } | null */
function readHeaderPrice(html) {
  const m = String(html).match(PX_RE);
  if (!m) return null;
  const price = parseFloat(m[2].replace(/,/g, ''));
  return Number.isFinite(price) ? { currency: m[1], price, raw: m[2] } : null;
}

/** ตัดบล็อก stock-meta ออก (สำหรับ freshHash — บล็อกนี้เป็น "กระจก" ไม่ใช่เนื้อหา) */
const stripStockMeta = (html) => String(html).replace(new RegExp('\\n?' + STOCK_META_RE.source, 'i'), '');

module.exports = { readStockMeta, readStockMetaState, readReportData, readHeaderPrice, stripStockMeta,
  STOCK_META_RE, STOCK_META_PARTS_RE, REPORT_DATA_RE, REPORT_DATA_PARTS_RE, CUR_SRC, PX_RE, PX_PARTS_RE, RANGE52_RE };
