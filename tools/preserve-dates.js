#!/usr/bin/env node
'use strict';
/**
 * preserve-dates.js — คงวันที่ "updated" เดิมไว้หลัง migrate/refresh ราคา (เนื้อหาวิเคราะห์ไม่เปลี่ยน
 * แต่ source เปลี่ยน → freshHash ขยับ → build ประทับวันนี้). อ่านวันเดิมจาก git HEAD:reports.json
 * แล้ว patch root reports.json: ตั้ง updated=วันเดิม (คง hash ใหม่) → build รอบถัดไป hash ตรง → คงวันเดิม
 *
 * ยกเว้นตัวที่ "วิเคราะห์ใหม่จริง" ใน working tree: วันที่วิเคราะห์ที่คนอ่านเห็นคือ "ข้อมูล ณ …" ใน
 * <footer> ของรายงาน ซึ่ง update-prices.js ไม่แตะเด็ดขาด (patch แค่ราคา/กราฟ/MOS) ⇒ footer ขยับ =
 * มีคนวิเคราะห์ใหม่แล้วยังไม่ commit (เช่นรัน `update-prices.js --write <SYM>` คั่นระหว่างงานวิเคราะห์)
 * → ห้ามคืนวันเก่าให้ ไม่งั้นรายงานที่สดจริงถูกเผยแพร่ด้วยวันวิเคราะห์เก่า
 * ทางกลับกัน "ไม่รู้" ทุกกรณี (อ่าน git ไม่ได้ · ไม่เจอ footer) = คืนวันเดิมเหมือนเดิม — invariant
 * "refresh ราคา ≠ re-analysis" (CLAUDE.md §9) สำคัญกว่า จึงต้องมีหลักฐานบวกเท่านั้นถึงจะข้าม
 *
 * ใช้:  node tools/preserve-dates.js   (รันหลัง build ครั้งแรกหลัง migrate/refresh, แล้ว build อีกครั้ง)
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'reports.json');
const git = (cmd) => cp.execSync(cmd, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();

const headDate = {};
try {
  for (const r of JSON.parse(git('git show HEAD:reports.json'))) headDate[r.symbol] = r.updated;
} catch (e) { console.error('อ่าน git HEAD:reports.json ไม่ได้:', e.message); process.exit(1); }

// "ข้อมูล ณ <วันที่>" ใน <footer> เท่านั้น — ในเนื้อหา/บล็อก disc มีวลีเดียวกันปนอยู่ (เช่น "SET Factsheet
// ข้อมูล ณ FY2568") และ disc เป็นบล็อกที่ update-prices patch วันที่ราคาลงไป ⇒ ถ้าจับกว้างจะเข้าใจผิดว่า
// refresh ราคาคือ re-analysis แล้วปล่อยให้วันที่เด้ง = พัง invariant หลัก
const footerDate = (html) => {
  const f = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/i);
  const d = f && f[1].match(/ข้อมูล ณ\s*([^•<]*)/);
  return d ? d[1].trim() : null;
};

// สองชั้น: pickaxe คัดเฉพาะไฟล์ที่ "บรรทัด footer" ขยับ (ปกติ 0 ไฟล์ → ไม่มีต้นทุน) แล้วค่อยเทียบ
// ตัววันที่จริงต่อไฟล์ — migrate ที่แก้แต่ markup ของ footer จึงยังนับเป็นเนื้อหาเดิม (คืนวันเก่าตามเดิม)
const reanalyzed = new Set();
try {
  for (const f of git(`git diff --name-only -G'<footer.*ข้อมูล ณ' HEAD -- reports`).split('\n').filter(Boolean)) {
    // ต่อไฟล์ล้มได้เอง (ไฟล์ใหม่ที่ HEAD ยังไม่มี → git show ไม่ผ่าน) โดยไม่ดับการตรวจของตัวอื่นในรอบเดียวกัน
    try {
      const head = footerDate(git(`git show "HEAD:${f}"`));
      const wt = fs.existsSync(path.join(ROOT, f)) ? footerDate(fs.readFileSync(path.join(ROOT, f), 'utf8')) : null;
      if (head && wt && head !== wt) reanalyzed.add(path.basename(f).replace(/\.html$/i, ''));
    } catch (e) { console.error(`อ่าน ${f} ที่ HEAD ไม่ได้ — คืนวันเดิมให้ตัวนี้ตามเดิม:`, e.message); }
  }
} catch (e) { console.error('เทียบ footer กับ HEAD ไม่ได้ — คืนวันเดิมให้ทุกตัวตามเดิม:', e.message); }

const cur = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let n = 0;
for (const r of cur) {
  if (reanalyzed.has(r.symbol)) continue;
  if (headDate[r.symbol] && r.updated !== headDate[r.symbol]) { r.updated = headDate[r.symbol]; n++; }
}
// เรียงเหมือน build.js (อัปเดตล่าสุดก่อน, เสมอเรียงตามชื่อ) เพื่อให้ index ลำดับเดิม
cur.sort((a, b) => a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.symbol.localeCompare(b.symbol));
fs.writeFileSync(MANIFEST, JSON.stringify(cur, null, 2) + '\n');
console.log(`คงวันที่เดิมให้ ${n} รายงาน (จากทั้งหมด ${cur.length}) — รัน build อีกครั้งให้ dist ตรง`);
if (reanalyzed.size) console.log(`ข้าม ${reanalyzed.size} ตัวที่วันที่ใน footer ขยับ (วิเคราะห์ใหม่ ไม่ใช่ refresh ราคา): ${[...reanalyzed].join(' ')}`);
