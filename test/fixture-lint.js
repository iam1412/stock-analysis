'use strict';
/**
 * fixture-lint — เทสที่อยู่ใน `npm run verify` ห้ามอ่านไฟล์ใน reports/ เป็น fixture
 * เหตุผล: reports/*.html ถูก cron แก้ทุกวัน ⇒ เทสที่ยืนบนมันล้มตามราคาของวันโดยโค้ดไม่ผิด
 * (cron ล้ม 3 วัน 22–24 ส.ค. 69 เพราะ self-test ใช้ BBL · run #54 2 ก.ย. 69 เพราะ update-prices-test ใช้ AAPL)
 * allowlist = ไฟล์ที่ "ตั้งใจกวาดทั้งคลัง" (นั่นคือหน้าที่ของมัน ไม่ใช่ fixture)
 */
const fs = require('fs');
const path = require('path');

const ALLOW = new Set(['check-reports.js', 'check-site.js', 'engine-exec.js']);
// (a) readFileSync กับคำว่า reports (ในเครื่องหมายคำพูด) อยู่บรรทัดเดียวกัน · (b) path.join ต่อโฟลเดอร์ reports กับชื่อไฟล์ .html แม้ readFileSync อยู่คนละบรรทัด
// (คอมเมนต์นี้เขียนเลี่ยงไม่ให้ตรง PATTERNS ด้านล่างเอง — ตัวอย่าง literal เดิมชนกับ pattern ของตัวมันเองเพราะ fixture-lint.js ไม่อยู่ใน ALLOW)
const PATTERNS = [
  /readFileSync\([^)]*['"`]reports['"`]/,
  /['"`]reports['"`]\s*,\s*['"`][A-Za-z0-9.\-]+\.html['"`]/,
];

function scan(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    if (ALLOW.has(f)) continue;
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    const hits = [];
    lines.forEach((l, i) => { if (PATTERNS.some((re) => re.test(l))) hits.push(i + 1); });
    out.push({ file: f, hits });
  }
  return out;
}

module.exports = function fixtureLint(ok) {
  for (const { file, hits } of scan(__dirname))
    ok(hits.length === 0, `fixture-lint: ${file} ไม่อ่าน reports/ เป็น fixture` + (hits.length ? ` (บรรทัด ${hits.join(',')} — ย้ายไป test/fixtures/)` : ''));
};
module.exports.scan = scan;
module.exports.PATTERNS = PATTERNS;
