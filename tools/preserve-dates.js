#!/usr/bin/env node
'use strict';
/**
 * preserve-dates.js — คงวันที่ "updated" เดิมไว้หลัง migrate (migration faithful = เนื้อหาวิเคราะห์ไม่เปลี่ยน
 * แต่ source เปลี่ยน → freshHash ขยับ → build ประทับวันนี้). อ่านวันเดิมจาก git HEAD:reports.json
 * แล้ว patch root reports.json: ตั้ง updated=วันเดิม (คง hash ใหม่) → build รอบถัดไป hash ตรง → คงวันเดิม
 *
 * ใช้:  node tools/preserve-dates.js   (รันหลัง build ครั้งแรกหลัง migrate, แล้ว build อีกครั้ง)
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const MANIFEST = path.join(__dirname, '..', 'reports.json');
const headDate = {};
try {
  for (const r of JSON.parse(cp.execSync('git show HEAD:reports.json').toString())) headDate[r.symbol] = r.updated;
} catch (e) { console.error('อ่าน git HEAD:reports.json ไม่ได้:', e.message); process.exit(1); }

const cur = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let n = 0;
for (const r of cur) {
  if (headDate[r.symbol] && r.updated !== headDate[r.symbol]) { r.updated = headDate[r.symbol]; n++; }
}
// เรียงเหมือน build.js (อัปเดตล่าสุดก่อน, เสมอเรียงตามชื่อ) เพื่อให้ index ลำดับเดิม
cur.sort((a, b) => a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.symbol.localeCompare(b.symbol));
fs.writeFileSync(MANIFEST, JSON.stringify(cur, null, 2) + '\n');
console.log(`คงวันที่เดิมให้ ${n} รายงาน (จากทั้งหมด ${cur.length}) — รัน build อีกครั้งให้ dist ตรง`);
