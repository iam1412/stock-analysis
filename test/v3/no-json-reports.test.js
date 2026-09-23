'use strict';
// Tripwire (controller ruling — final review Task 3): reports/*.json ยังไม่มี gate รายงาน
// (check-reports.js/cron/queue สแกนแค่ .html — ไฟล์ .json ใต้ reports/ ที่ไม่ผ่าน npm run verify
// จะหลุดไปโดยไม่มีใครตรวจ) ⇒ ห้ามมีไฟล์ reports/*.json จนกว่า Plan 2 จะเพิ่ม gate ของมันเอง
// Plan 2 ลบ test นี้ทิ้งเมื่อ gate รายงาน v3 (.json) ลงจริง
const fs = require('fs');
const path = require('path');
const t = require('./_t.js')('no-json-reports');

const REPORTS_DIR = path.join(__dirname, '..', '..', 'reports');
const jsonFiles = fs.existsSync(REPORTS_DIR) ? fs.readdirSync(REPORTS_DIR).filter((f) => /\.json$/i.test(f)) : [];

t(jsonFiles.length === 0,
  `reports/*.json ยังไม่มี gate รายงาน (check-reports/cron/queue สแกนแค่ .html) — รอ Plan 2` +
  (jsonFiles.length ? ` (พบ: ${jsonFiles.join(', ')})` : ''));
t.done();
