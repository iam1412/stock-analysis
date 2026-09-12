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
// ★ ความไม่สมมาตรของคู่นี้เป็นของ **ตั้งใจ**: ตัวอ่าน (PX_RE) ยอมให้มีช่องว่างหลังสัญลักษณ์สกุลเงิน
//   (`\s*([\d.,]+)`) แต่ตัวเขียน (PX_PARTS_RE) ไม่ยอม — ช่องว่างไม่ได้อยู่ในกลุ่มหัวที่ประกอบคืน
//   ⇒ ใบที่เขียน "$ 193.50" gate อ่านออกแต่ cron เขียนไม่ได้ และจะโผล่เป็น **patch-failed** ในคิว
//   (ดังตั้งใจ: เห็นเป็นงานให้คนแก้ ดีกว่าตัวเขียน "สำเร็จ" โดยกินช่องว่างหายไปเงียบ ๆ)
//   ห้ามเติม `\s*` ให้ตัวเขียนโดยไม่ทบทวนพร้อมกันทั้งคู่ — ตัวเขียนที่กว้างกว่าตัวอ่านคือด้านที่อันตราย
const PX_RE = new RegExp('<div class="px">\\s*(' + CUR_SRC + ')\\s*([\\d.,]+)');
const PX_PARTS_RE = new RegExp('(<div class="px">\\s*' + CUR_SRC + ')([\\d.,]+)');
// ป้าย gauge marker #mCur ("ปัจจุบัน $193.50") — ตัวอ่าน (gate f50) กับตัวเขียน (cron) ต้องชี้ token เดียวกัน
// ★ ตัวเขียนต้องเก็บช่องว่างหลังสกุลเงินไว้ใน **กลุ่มหัว** (ต่างจาก .px ข้างบน) — วัด 12 ก.ย. 69:
//   คลัง 908 ใบให้ผลเท่ากันทั้งสองรูป (ไม่มีใบไหนเว้นวรรคหลังสัญลักษณ์) ⇒ รวมคำศัพท์ไม่เปลี่ยนพฤติกรรม
const MCUR_LABEL_RE = new RegExp('id="mCur"><div class="lab">ปัจจุบัน\\s*' + CUR_SRC + '?\\s*([\\d.,]+)');
const MCUR_LABEL_PARTS_RE = new RegExp('(id="mCur"><div class="lab">ปัจจุบัน\\s*' + CUR_SRC + '?\\s*)([\\d.,]+)');
// คลาสกล่อง verdict — ฟังก์ชันล้วนของ MOS (cron เขียน · W04 ตรวจ · manifest f19 อ่าน)
const VERDICT_CLASS_RE = /class="mos-verdict (bad|ok|good)"/;
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
  STOCK_META_RE, STOCK_META_PARTS_RE, REPORT_DATA_RE, REPORT_DATA_PARTS_RE, CUR_SRC, PX_RE, PX_PARTS_RE, RANGE52_RE,
  MCUR_LABEL_RE, MCUR_LABEL_PARTS_RE, VERDICT_CLASS_RE };
