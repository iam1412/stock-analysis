'use strict';
/**
 * reason ของ price-flags.json ที่แปลว่า "ticker นี้ไม่อยู่บนกระดานแล้ว" — เจ้าของเดียวของชุดนี้ทั้งระบบ
 * (canary รายสัปดาห์ · cron ราคารายวัน · triage คิว · issue body) ⇒ เพิ่ม/ลด reason ที่นี่ที่เดียว
 * ไม่งั้น cron กับ canary ตัดสินหุ้นตัวเดียวกันไม่ตรงกัน (เคสที่ทั้งรีโประวังมาตลอด)
 *
 *   not-on-exchange — TradingView ไม่พบ ticker และหาผู้สืบทอดไม่ได้ → ยืนยันแหล่งปฐมภูมิแล้วลบรายงาน
 *   ticker-renamed  — ticker เดิมหาย แต่ ISIN เดิมไปโผล่ที่ ticker ใหม่บนกระดานเดียวกัน (เคส THCOM→GST 1 ต.ค. 69)
 *                     → เพิ่ม tools/symbol-map.json ห้ามลบรายงาน
 *
 * ทั้งสอง reason: cron รายวันไม่ patch ราคา (quote ของ ticker เดิมค้าง) · snapshot รายวันไม่มีสิทธิ์เคลียร์
 * (EXTERNAL) · ถอนได้เมื่อ TradingView เจอ ticker (หลังเพิ่ม symbol-map) · รายงานถูกลบ · หรือ `--alive <SYM>`
 */
const NOT_ON_EXCHANGE = 'not-on-exchange';
const TICKER_RENAMED = 'ticker-renamed';
const DEAD_REASONS = new Set([NOT_ON_EXCHANGE, TICKER_RENAMED]);
const isDeadReason = (r) => DEAD_REASONS.has(r);

module.exports = { NOT_ON_EXCHANGE, TICKER_RENAMED, DEAD_REASONS, isDeadReason };
