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

// (ก-2b) verify-list (README.md) เหมือนกัน — ขั้นใหม่ที่ไม่มีคำอธิบายต้องไม่หลุดไปแบบว่างเปล่า (WS8 review Important 7)
// ★ ต้องผูกจบบรรทัดพอดี (เหมือนตัวเทียบ checks-table ด้านบน) ไม่งั้นชนแถวที่แค่ "พูดถึง" `_(เติม)_` เป็น prose
// (README ข้อ 5 อธิบาย docs-test เองว่า "checks-table ต้องไม่มีช่อง `_(เติม)_` ค้าง" — ไม่ใช่ช่องที่ค้างจริง)
{
  const { render } = require('../tools/gen-docs.js');
  const { text } = render('README.md');
  const missing = [...text.matchAll(/^\d+\.\s+\*\*`([^`]+)`\*\*\s*_\(เติม\)_\s*$/gm)].map((m) => m[1]);
  ok(missing.length === 0, 'verify-list (README.md): ไม่มีคำอธิบายขั้นค้าง _(เติม)_', missing.join(' '));
}

// (ก-3) CHECKS ทุกตัวต้อง level เป็น error หรือ warn เท่านั้น — level อื่นจะหายไปจาก gen:counts เงียบ ๆ
// (gen-docs นับแค่ errs/warns สองกอง ผลรวมต้องเท่า CHECKS.length เสมอ ไม่งั้นมี check ที่ไม่ถูกนับ — WS8 review Important 4)
{
  const { CHECKS } = require('../test/check-reports.js');
  const nErr = CHECKS.filter((c) => c.level === 'error').length;
  const nWarn = CHECKS.filter((c) => c.level === 'warn').length;
  ok(nErr + nWarn === CHECKS.length, 'CHECKS: ทุกตัวต้อง level error หรือ warn (ไม่งั้นหายจาก gen:counts)', `error=${nErr} warn=${nWarn} total=${CHECKS.length}`);
}

// (ก-4) checkText: marker เปิดไม่มีปิดต้องไม่เงียบ แม้ marker อื่นในไฟล์เดียวกันจะตรงโค้ดครบ (ซ่อมรีเกรสชันที่ลบ
// `<!-- /gen:counts -->` ทิ้งไปแล้ว check() คืน [] เพราะ marker ที่เหลือ 5/6 ยังแมตช์ปกติ — WS8 review Important 3)
{
  const { checkText } = require('../tools/gen-docs.js');
  const missingCloser = '<!-- gen:counts -->x<!-- /gen:counts -->\n<!-- gen:verify-steps -->15';
  const bad2 = checkText('README.md', missingCloser);
  ok(!!bad2 && /เปิดไม่มีปิด/.test(bad2.why), 'checkText: marker เปิดไม่มีปิด (ปิดหาย) ต้องไม่เงียบ', bad2 && bad2.why);
  const ok1 = checkText('README.md', '<!-- gen:counts -->x<!-- /gen:counts -->');
  ok(!!ok1, 'checkText: marker ปิดครบแต่เนื้อไม่ตรงโค้ด ต้องยังฟ้อง (sanity ของ fixture ข้างบน)', ok1 && ok1.why);
}

// (ข) วลีที่ยกเลิกแล้ว (phase0-exit §3 11 วลี + ระยะ 1) — hit = กฎเก่าหลุดกลับมา
const FORBIDDEN = [
  /\bsequential\b(?!.*tags\.json)/i, /เวฟ ≤3/, /Sonnet เป็น default ทุกชั้น/, /ห้าม controller\/worker เรียก advisor ตรง/, /ไม่มี Opus แล้ว/,
  /pre-assign สีแบรนด์เอง/, /= Opus 5 โดยไม่ตั้งใจ/, /52 code/, /\b13 ขั้น/, /\b11 ขั้น/, /8 ขั้นเดิม/,
  // เดิม /ไม่มี lock/ กว้างเกิน — ชนบรรทัด "issue คิวใบเดียวกัน ... ไม่มี lock กันชน" ใน workflow yml ที่เป็นคำอธิบายจริง
  // ไม่ใช่กฎเก่าที่ยกเลิก (กฎเก่าคือ "controller pre-assign สี/pre-patch ราคาทั้งชุดเพราะไม่มี lock" — แทนด้วย tools/lockfile.js แล้ว)
  // ⇒ จำกัดเฉพาะบริบทสีแบรนด์/price-flags/seeds/tags.json (WS8 review Important 12)
  /(สีแบรนด์|price-flags|seeds|tags\.json)[^\n]{0,40}ไม่มี lock/,
  /dead-band ±3/, /±3 จุด/, /flip ใน ±3/, /controller ต้อง pre-patch ทั้งชุด/, /worker ห้ามรัน update-prices/,
  /dead-band ของ gate W06/, /เลขเดียวกันต้องพิมพ์ตรงกันทุกจุด/,
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
// ★ backreference (\1) ผูกชื่อเปิด-ปิดให้ตรงกัน — เดิม `[a-z-]+` ทั้งสองฝั่งแยกกันอิสระ ⇒ marker ซ้อน (เช่น
// `<!-- gen:counts -->` ที่ซ้อนอยู่ใน `<!-- gen:verify-list -->` ของ README.md จริง ๆ) ทำให้ตัวนอกจับคู่กับตัวปิด
// ของ marker ที่ซ้อนอยู่ข้างในแทน ตัดสั้นก่อนถึงตัวปิดจริง เหลือเนื้อ verify-list ท่อนหลัง (ข้อ 8-15) หลุดออกมา
// สแกนเป็นข้อความพิมพ์มือ (WS8 review Important 2)
const stripGen = (t) => t.replace(/<!-- gen:([a-z-]+) -->[\s\S]*?<!-- \/gen:\1 -->/g, '').replace(/# gen:([a-z-]+)[\s\S]*?# \/gen:\1/g, '');
{
  // self-check ของ stripGen เอง: ตัดจบ README.md แล้วต้องไม่เหลือ "<!-- /gen:" ค้าง (marker ปิดที่จับคู่กับเปิดผิดชื่อ
  // จะทิ้งตัวปิดจริงไว้เป็นข้อความดิบ — ถ้าเทสนี้แดง แปลว่า regex ด้านบนพังกลับไปเป็นแบบไม่ผูกชื่ออีก)
  const stripped = stripGen(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'));
  ok(!/<!--\s*\/gen:/.test(stripped), 'stripGen(README.md): ไม่มี "<!-- /gen:" หลงเหลือหลังตัด (marker ซ้อนต้องจับคู่ชื่อให้ตรง)');
}
for (const f of DOCS) {
  const t = stripGen(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  // ★ \b รอบ pre-push/hook กันชนคำประกอบ เช่น ".githooks"/"core.hooksPath" (มี "hook" เป็นสับสตริงแต่ไม่ใช่คำ)
  const m1 = t.match(/(?:verify|ประตู cron|gate|\bpre-push\b|\bhook\b)[^\n]{0,40}?\b\d{1,2} ขั้น|\b\d{1,2} ขั้น[^\n]{0,40}?verify/g);
  ok(!m1, `${f}: "N ขั้น" ของ verify นอก marker`, m1 && m1.join(' | '));
  const m2 = t.match(/\d+ error \+ \d+ warning/g);
  ok(!m2, `${f}: "N error + M warning" นอก marker`, m2 && m2.join(' | '));
}
console.log(fails ? `\n✗ docs-test: ${fails} failed / ${n - fails} passed` : `\n✅ docs ตรงโค้ด (docs-test ${n} เคส)`);
process.exit(fails ? 1 : 0);
