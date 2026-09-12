'use strict';
/**
 * parser-lint — regex ของบล็อก stock-meta / report-data / ราคา .px ต้องมีเจ้าของเดียว: tools/report-meta.js
 * (code-audit §2.5: สำเนา 8 + 6 + 6 จุด · 4 คำศัพท์สกุลเงิน — ตัวที่หลุดจะพังเงียบ)
 * กวาด production + test ทุกไฟล์ยกเว้นเจ้าของ · คอมเมนต์ที่มีคำเหล่านี้ไม่นับ (ตัดบรรทัดที่ขึ้นต้น // ออก)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// เจ้าของ regex + ตัวลินต์เอง (PATTERNS ข้างล่างเป็น "รูปของรูป" ไม่ใช่ตัวแยกวิเคราะห์จริง)
const SKIP = new Set(['tools/report-meta.js', 'test/parser-lint.js']);
const DIRS = ['tools', 'tools/queue', 'test'];
const FILES = ['build.js', ...DIRS.flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))];
// จับเฉพาะ "รูป regex" — id=["'] (character class) หรือ id="…"[^>] (ตามด้วย class ของ regex) · ข้อความ HTML/throw message ที่เขียน id="stock-meta" เฉย ๆ ไม่นับ
// (build.js throw · test/build-test.js fixture HTML ไม่นับ · test/skeleton-test.js เป็น regex จริง → อยู่ในตารางแทนที่)
const PATTERNS = [
  [/id=\["'\]stock-meta|id="stock-meta"\[/, 'regex บล็อก stock-meta'],
  [/id=\["'\]report-data|id="report-data"\[/, 'regex บล็อก report-data'],
  [/class="px">\s*[\\(\[]/, 'regex ราคา header .px'],
];
function scan() {
  const out = [];
  for (const rel of FILES) {
    if (SKIP.has(rel)) continue;
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const code = l.replace(/^\s*(\/\/|\*|\/\*).*$/, '');   // ข้ามบรรทัดคอมเมนต์ล้วน
      for (const [re, what] of PATTERNS) if (re.test(code)) out.push({ file: rel, line: i + 1, what });
    });
  }
  return out;
}
module.exports = function parserLint(ok) {
  const hits = scan();
  ok(hits.length === 0, 'parser-lint: regex stock-meta/report-data/.px มีเจ้าของเดียว (tools/report-meta.js)' + (hits.length ? ' — สำเนาที่ ' + hits.map((h) => `${h.file}:${h.line} (${h.what})`).join(' · ') : ''));
};
module.exports.scan = scan;
