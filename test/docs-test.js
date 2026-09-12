#!/usr/bin/env node
'use strict';
/**
 * docs-test — เอกสารต้องตรงโค้ด (spec WS8 ข้อ 3/4 · phase0-exit §3: sweep วลีขัดกันต้องเป็นเทส ไม่ใช่ grep มือ)
 *  (ก) ตัวเลข/ตารางระหว่าง marker gen: ตรงกับ CHECKS/package.json  (ข) วลีที่ถูกยกเลิกแล้วต้องไม่กลับมา  (ค) ตัวเลขที่ต้อง generate ห้ามพิมพ์มือนอก marker
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let n = 0, fails = 0;
const ok = (c, label, detail) => { n++; if (c) return; fails++; console.error(`✗ ${label}${detail ? ' — ' + detail : ''}`); };
const list = (dir, re) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)).map((f) => `${dir}/${f}`);
const DOCS = ['CLAUDE.md', 'README.md', ...list('docs', /\.md$/), '.claude/skills/stock-analyzer/SKILL.md', '_template/agent-prompt.md', ...list('.github/workflows', /\.yml$/)];
// docs-test.js เอง exclude — ต้นฉบับของมันมีวลี/แพตเทิร์นต้องห้ามอยู่ตรง ๆ (นิยาม regex ที่ใช้ตรวจ ไม่ใช่ของที่หลุดมาในโค้ดจริง)
const CODE = [...list('tools', /\.js$/), ...list('test', /\.js$/)].filter((f) => f !== 'test/docs-test.js');

// sanity: DOCS/CODE ต้องไม่ว่าง — กัน rule (ข) เงียบผ่านบน corpus ว่างเปล่า (นับจริง 12 ก.ย. 69: DOCS=15, CODE=44 — เผื่อ margin ไว้ไม่ให้ flaky ตามไฟล์ที่เพิ่ม/ลบเล็กน้อย)
ok(DOCS.length > 10 && CODE.length > 30, 'DOCS/CODE corpus ไม่ว่าง', `${DOCS.length}/${CODE.length}`);

// (ก) gen-docs
const bad = require('../tools/gen-docs.js').check();
ok(bad.length === 0, 'gen-docs --check: ทุกไฟล์ตรงโค้ด', bad.map((b) => `${b.file}: ${b.why}`).join(' · '));

// (ก-2) ตารางเช็คที่ regenerate แล้วต้องไม่มีช่อง prose ค้าง _(เติม)_ (Task 18 review minor 6)
{
  const { render } = require('../tools/gen-docs.js');
  const { text } = render('docs/quality-gate.md');
  const missing = [...text.matchAll(/^\|\s*([EW]\d\d)\s*\|.*\|\s*_\(เติม\)_\s*\|$/gm)].map((m) => m[1]);
  ok(missing.length === 0, 'checks-table: ไม่มีช่อง prose ค้าง _(เติม)_', missing.join(' '));
}

// (ข) วลีที่ยกเลิกแล้ว (phase0-exit §3 11 วลี + ระยะ 1) — hit = กฎเก่าหลุดกลับมา
const FORBIDDEN = [
  /\bsequential\b(?!.*tags\.json)/i, /เวฟ ≤3/, /Sonnet เป็น default ทุกชั้น/, /ห้าม controller\/worker เรียก advisor ตรง/, /ไม่มี Opus แล้ว/,
  /pre-assign สีแบรนด์เอง/, /= Opus 5 โดยไม่ตั้งใจ/, /52 code/, /\b13 ขั้น/, /\b11 ขั้น/, /8 ขั้นเดิม/,
  /ไม่มี lock/, /dead-band ±3/, /±3 จุด/, /flip ใน ±3/, /controller ต้อง pre-patch ทั้งชุด/, /worker ห้ามรัน update-prices/,
  /dead-band ของ gate W06/,
];
for (const f of DOCS) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((l, i) => { for (const re of FORBIDDEN) if (re.test(l)) ok(false, `วลีต้องห้ามใน ${f}:${i + 1}`, `${re} — "${l.trim().slice(0, 100)}"`); });
}
for (const f of CODE) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((l, i) => { if (/dead-band ±3|±3 จุด/.test(l)) ok(false, `dead-band 3 ค้างในโค้ด ${f}:${i + 1}`, l.trim().slice(0, 100)); });
}

// (ค) ตัวเลขที่ต้อง generate: "N ขั้น" ของ verify · "N error + M warning" — นอก marker = พิมพ์มือ
// near-miss ที่ตรวจแล้วว่าไม่ชน regex ด้านล่างโดยตั้งใจ (Task 19 review): CLAUDE.md §5 "รวมทั้ง 5 ขั้นเป็นคำสั่งเดียว" (นับขั้นตอน git ไม่ใช่ขั้น verify) ·
// docs/quality-gate.md "check-reports (0 error)" (เกณฑ์ผ่านของ 1 check ไม่ใช่รูปแบบ "N error + M warning")
const stripGen = (t) => t.replace(/<!-- gen:[a-z-]+ -->[\s\S]*?<!-- \/gen:[a-z-]+ -->/g, '').replace(/# gen:steps[\s\S]*?# \/gen:steps/g, '');
for (const f of DOCS) {
  const t = stripGen(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const m1 = t.match(/(?:verify|ประตู cron|gate)[^\n]{0,40}?\b\d{1,2} ขั้น|\b\d{1,2} ขั้น[^\n]{0,40}?verify/g);
  ok(!m1, `${f}: "N ขั้น" ของ verify นอก marker`, m1 && m1.join(' | '));
  const m2 = t.match(/\d+ error \+ \d+ warning/g);
  ok(!m2, `${f}: "N error + M warning" นอก marker`, m2 && m2.join(' | '));
}
console.log(fails ? `\n✗ docs-test: ${fails} failed / ${n - fails} passed` : `\n✅ docs ตรงโค้ด (docs-test ${n} เคส)`);
process.exit(fails ? 1 : 0);
