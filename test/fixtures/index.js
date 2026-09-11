'use strict';
/**
 * fixture ของ gate/cron test — สำเนาแช่แข็งของรายงานจริง ณ วันที่ใน README.md
 * ★ ห้ามให้เทสใน verify อ่าน reports/*.html เป็น fixture (test/fixture-lint.js บังคับ):
 *   cron แก้ไฟล์จริงทุกวัน ⇒ เทสที่ยืนบนไฟล์จริงล้มตามราคาของวัน (22–24 ส.ค. 69 · run #54 2 ก.ย. 69)
 * ★ TODAY = วันถัดจากวันที่ราคาในไฟล์ — ตั้งเป็น STALE_TODAY ให้ E27/W09 ไม่เดินตามปฏิทินจริง
 *   (ไม่งั้น fixture "แก่" เกิน 120 วันแล้ว E27 ยิงเอง — เทสตกโดยโค้ดไม่ผิด)
 * แช่แข็งใหม่ = cp reports/<SYM>.html มาทับ + อัปเดต TODAY + README แล้วรัน npm run verify
 */
const fs = require('fs');
const path = require('path');
const PATH = { AAPL: path.join(__dirname, 'AAPL.html'), BBL: path.join(__dirname, 'BBL.html') };
module.exports = {
  PATH,
  AAPL: () => fs.readFileSync(PATH.AAPL, 'utf8'),
  BBL: () => fs.readFileSync(PATH.BBL, 'utf8'),
  TODAY: '2026-09-11',
};
