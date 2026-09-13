'use strict';
/**
 * fixture ของ gate/cron test — สำเนาแช่แข็งของรายงานจริง ณ วันที่ใน README.md
 * ★ ห้ามให้เทสใน verify อ่าน reports/*.html เป็น fixture (test/fixture-lint.js บังคับ):
 *   cron แก้ไฟล์จริงทุกวัน ⇒ เทสที่ยืนบนไฟล์จริงล้มตามราคาของวัน (22–24 ส.ค. 69 · run #54 2 ก.ย. 69)
 * ★ TODAY = วันถัดจากวันที่ราคาในไฟล์ — ตั้งเป็น STALE_TODAY ให้ E27/W09 ไม่เดินตามปฏิทินจริง
 *   (ไม่งั้น fixture "แก่" เกิน 120 วันแล้ว E27 ยิงเอง — เทสตกโดยโค้ดไม่ผิด)
 *   TODAY (ตัวเดียว) = ของ AAPL/BBL · ชุดรูปคลังจริง (ระยะ 2 ส่วน D fix wave M10) ใช้ TODAY_OF[<SYM>]
 * แช่แข็งใหม่ = cp reports/<SYM>.html มาทับ + อัปเดต TODAY/TODAY_OF + README แล้วรัน
 *   node tools/migrate-v2.js --fixture [<SYM> …]   (ไม่ระบุ = AAPL BBL) → เขียน <SYM>-v2.html ข้าง ๆ แล้ว npm run verify
 */
const fs = require('fs');
const path = require('path');
// v1 ต้นทาง · v2 = สำเนาแช่แข็งที่ migrator สร้างเองจาก v1 (node tools/migrate-v2.js --fixture) ดู README.md
// รูปคลังจริงที่ final review ส่วน D ชี้ (ไม่มี fixture ไหนครอบมาก่อน):
//   DDOG = stock-meta.pe ยืนบนฐาน adjusted (75) ขณะ values.eps = GAAP (P/E ~453) · SRE = DPS ในการ์ดปันผล ≠ values.dps
//   FTV = หมวด 6 รวมปันผล (divIncluded:true) ที่การอนุมานพลิกฐานที่ราคา ×1.005 · CASY = ไม่รวมปันผล (divIncluded:false) พลิกที่ ×0.995
//   DPZ = วงเล็บทวนวันที่มีคำขยาย "(11 ก.ย. 2569 ตลาดปิด)" ที่ migrator คง literal
const SYMS = ['AAPL', 'BBL', 'DDOG', 'SRE', 'FTV', 'DPZ', 'CASY'];
const PATH = {};
for (const s of SYMS) { PATH[s] = path.join(__dirname, `${s}.html`); PATH[`${s}_V2`] = path.join(__dirname, `${s}-v2.html`); }
const read = (k) => () => fs.readFileSync(PATH[k], 'utf8');
const out = { PATH, SYMS, TODAY: '2026-09-11', TODAY_OF: { AAPL: '2026-09-11', BBL: '2026-09-11', DDOG: '2026-09-12', SRE: '2026-09-12', FTV: '2026-09-12', DPZ: '2026-09-12', CASY: '2026-09-12' } };
for (const k of Object.keys(PATH)) out[k] = read(k);
module.exports = out;
