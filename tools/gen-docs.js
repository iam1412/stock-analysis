#!/usr/bin/env node
'use strict';
/**
 * gen-docs.js — ตัวเลข/ตาราง/ลำดับขั้นที่เคยพิมพ์มือในเอกสาร ให้ generate จากโค้ด (spec WS8 ข้อ 3 · docs-audit: drift 6/6 ภายใน 2 สัปดาห์)
 *   node tools/gen-docs.js          เขียนทับเนื้อใน "ระหว่าง marker" ของทุกไฟล์ใน TARGETS
 *   node tools/gen-docs.js --check  exit 1 ถ้าไฟล์ไหนไม่ตรงโค้ด (test/docs-test.js เรียกผ่าน check())
 *
 * แหล่งความจริง: `CHECKS` ใน `test/check-reports.js` (id/level/healer/label) · `scripts.verify` / `scripts.verify:cron` ใน `package.json`
 * marker (มองไม่เห็นตอน render markdown · ในเชลล์สคริปต์ใช้ `# gen:` ):
 *   <!-- gen:checks-table -->…<!-- /gen:checks-table -->   ตาราง E/W (4 คอลัมน์แรก generate · คอลัมน์สุดท้าย = prose ของคน คงไว้)
 *   <!-- gen:counts -->…<!-- /gen:counts -->               "N error + M warning"
 *   <!-- gen:verify-steps -->…<!-- /gen:verify-steps -->   จำนวนขั้นของ `npm run verify`
 *   <!-- gen:verify-cron-steps -->…<!-- /gen:verify-cron-steps -->   จำนวนขั้นของ `npm run verify:cron`
 *   <!-- gen:verify-chain -->…<!-- /gen:verify-chain -->   ลำดับขั้นทั้งเส้น (มี backtick ต่อขั้น)
 *   <!-- gen:verify-chain-plain -->…<!-- /gen:verify-chain-plain -->  ลำดับขั้นทั้งเส้นแบบไม่มี backtick (ใช้ในบล็อกโค้ด/คอมเมนต์)
 *   <!-- gen:verify-cron-chain -->…<!-- /gen:verify-cron-chain -->  ลำดับขั้นของ `verify:cron` เท่านั้น (รูปแบบลูกศร+backtick เหมือน gen:verify-chain)
 *   <!-- gen:code-range -->…<!-- /gen:code-range -->        ช่วง code E/W ปัจจุบัน เช่น "E01–E43 · W01–W23" (จาก id ต่ำสุด/สูงสุดของแต่ละ prefix ใน CHECKS)
 *   <!-- gen:verify-list -->…<!-- /gen:verify-list -->      รายการขั้น verify แบบมีเลขลำดับ 1..N + คำอธิบายต่อขั้น (คำอธิบายเป็นของคน คงไว้ตามชื่อไฟล์ขั้น เหมือน checks-table)
 *   # gen:steps … # /gen:steps                             บล็อก echo+node ของ `.githooks/pre-push`
 * ★ ตัวเลขพวกนี้ที่พิมพ์ไว้ **นอก** marker จะ drift เงียบ — docs-test (Task 19) เป็นตัวฟ้อง
 * ★ marker ที่อยู่ใน code fence (```) ของ markdown ก็ยัง render เป็น HTML comment ที่มองเห็นได้ตามปกติ (ยอมรับ
 *   ได้ — ตั้งใจวางไว้หลัง `#`/`//` ของบรรทัดคอมเมนต์เสมอ เพื่อให้ copy-paste ไปรันเป็นคำสั่งจริงยังใช้ได้)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHECKS } = require('../test/check-reports.js');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const steps = (s) => String(s || '').split('&&').map((x) => x.trim().replace(/^node /, '')).filter(Boolean);
const VERIFY = steps(pkg.scripts.verify), CRON = steps(pkg.scripts['verify:cron']);
const stepName = (s) => path.basename(s).replace(/\.js$/, '');

/** ป้าย/อีโมจิ/คอมเมนต์ของแต่ละขั้นใน `.githooks/pre-push` — คัดจาก hook เดิมมาทั้งดุ้น ⇒ รันครั้งแรกต้องได้บล็อกเดิม **ทุกไบต์**
 *  รูปแบบ: `'<ไฟล์ขั้น>': [emoji, ป้ายที่พิมพ์หลัง "i/N: " (ยังไม่รวม "…"), ข้อความที่ส่งให้ block(), options?]`
 *  options — `quiet`: ต่อท้าย `>/dev/null` (ขั้นที่ผลต้องโชว์จริงอย่าง corpus check/self-test/check-site ไม่ใส่)
 *            `pad`  : เติมช่องว่างอีก 1 ตัวหลัง emoji (อีโมจิความกว้าง 1 ช่องอย่าง ☠/🏷/⚙️ ต้องเติมเองให้คอลัมน์ตรง)
 *            `comment`: คอมเมนต์เหนือขั้นนั้น (คงคำอธิบายว่าทำไมขั้นนี้ไม่เงียบ ฯลฯ) — string ธรรมดา หรือฟังก์ชัน
 *            `(idx) => string` ก็ได้ เมื่อคอมเมนต์ต้องอ้าง "ขั้น N" ของไฟล์ขั้นอื่น: เรียก `idx('<ไฟล์ขั้น>')` แล้ว
 *            จะได้ตำแหน่ง 1-based จริงของไฟล์นั้นใน VERIFY ปัจจุบัน (กัน drift เมื่อมีขั้นแทรก/ถอนกลางเส้น)
 *  ★ ขั้นใหม่ใน package.json ที่ยังไม่มีป้ายที่นี่ → render/check ล้มพร้อมบอกให้เติม (เงียบไม่ได้ — hook จะขาดขั้น)
 *  ★ ป้ายที่อ้าง "ขั้น N" ในคอมเมนต์เป็น string ธรรมดา (ไม่ใช่ฟังก์ชัน) ยังเป็นข้อความคงที่เหมือนเดิม — แทรกขั้นใหม่
 *  ไว้กลางเส้นต้องแก้ข้อความเอง หรือเปลี่ยนเป็นฟังก์ชัน `(idx) => …` ถ้าอยากให้อัปเดตอัตโนมัติ
 *  ★ ป้ายของ build.js ลงท้ายด้วยช่องว่าง (`'build dist/ '`) ตามของเดิมในไฟล์ hook — ตั้งใจ ห้ามตัดทิ้ง */
const STEP_LABELS = {
  'test/update-prices-test.js': ['💰', 'unit-test cron ราคา (update-prices-test)', 'update-prices unit gate', { quiet: true, comment: '# ขั้น 1-2 = unit test ของเครื่องมือ cron/canary — offline + เร็วที่สุด จึงวางไว้หน้าสุด (ล้มก่อนเสีย\n# เวลา build) · เพิ่ม 8 ส.ค. 2569 หลังพบว่า syntax error ในไฟล์เทสต์เองหลุด gate ไปได้ทั้งชุด' }],
  'test/dead-ticker-test.js': ['☠', 'unit-test canary หุ้นตาย (dead-ticker-test)', 'dead-ticker canary unit gate', { quiet: true, pad: true }],
  'test/tag-apply-test.js': ['🏷', 'unit-test เครื่องมือเขียน tag (tag-apply-test)', 'tag-apply unit gate', { quiet: true, pad: true }],
  'test/queue-test.js': ['🧭', 'unit-test runbook เคลียร์คิว + ลำดับขั้น verify (queue-test)', 'queue runbook unit gate', {}],
  'test/tags-test.js': ['🏷', 'ตรวจความสอดคล้อง tags.json ทั้งคลัง (tags-test)', 'tags corpus gate', { pad: true, comment: '# ไม่ >/dev/null — ส่วน C ของ tags-test.js เป็น corpus check จริง (reports/ ↔ tags.json ↔ คลัง เช่น\n# entry ค้างของหุ้นที่ลบไปแล้ว) ไม่ใช่แค่ unit test ของ tag-lib.js — ชื่อ symbol/slug ที่ผิดพิมพ์อยู่ใน\n# ข้อความ ok() เอง ถ้าเงียบไว้ operator จะเห็นแค่ "ไม่ผ่าน (ดูปัญหาด้านบน)" โดยไม่มีอะไรอยู่ด้านบนให้ดู' }],
  'test/check-reports.js': ['🔍', 'ตรวจคุณภาพรายงาน (check-reports)', 'report quality gate', {}],
  'test/self-test.js': ['🧪', 'meta-test ว่า check-reports ยังจับ defect ได้ (self-test)', 'checker self-test gate', { comment: (idx) => `# ขั้น ${idx('test/self-test.js')} = meta-test ของขั้น ${idx('test/check-reports.js')}: ฉีด defect ลงรายงานจริงแล้วยืนยันว่า check ตัวที่คู่กัน "ยิงจริง" — ถ้า check\n# ตัวไหนเลิกแมตช์เงียบ ๆ ขั้น ${idx('test/check-reports.js')} จะรายงาน "0 error" แล้วทั้ง gate ผ่านหมด · ไม่ >/dev/null เพราะพิมพ์ผลลง stdout` }],
  'test/ohlc-test.js': ['📊', 'แปลง Yahoo OHLC (ohlc-test)', 'ohlc transform gate', { quiet: true }],
  'test/ta-engine-test.js': ['📈', 'นิยาม TA engine + รัน ta-chart ใน mock DOM (ta-engine-test)', 'TA engine gate', { quiet: true }],
  'build.js': ['🔧', 'build dist/ ', 'build', { quiet: true }],
  'test/build-test.js': ['🧪', 'unit-test build.js (เครดิตโมเดล + freshHash + injectTA)', 'build-test', { quiet: true }],
  'test/engine-exec.js': ['⚙️', 'รัน engine ทุกรายงานใน mock DOM (engine-exec)', 'engine execution gate', { quiet: true, pad: true }],
  'test/skeleton-test.js': ['🧱', 'โครงต้นแบบ TH/US เติมแล้วผ่าน gate (skeleton-test)', 'skeleton template gate', { quiet: true }],
  'test/check-site.js': ['🌐', 'ตรวจความสมบูรณ์เว็บไซต์ (check-site)', 'site integrity gate', {}],
  'test/docs-test.js': ['📚', 'docs ↔ code (docs-test)', 'docs gate'],
};

const errs = CHECKS.filter((c) => c.level === 'error'), warns = CHECKS.filter((c) => c.level === 'warn');
const sortId = (a, b) => (a.id[0] === b.id[0] ? a.id.localeCompare(b.id) : (a.id[0] === 'E' ? -1 : 1));

/** ขอบช่องของตาราง markdown = `|` ที่ไม่ได้ escape (`\|` ในโค้ด inline ไม่ใช่ขอบช่อง — E28 มี 4 ตัว) */
function pipeIndexes(line) {
  const idx = [];
  for (let i = 0; i < line.length; i++) if (line[i] === '|' && line[i - 1] !== '\\') idx.push(i);
  return idx;
}
/** จำนวนคอลัมน์ของตารางเดิม — อ่านจากหัวตาราง ไม่ผูกไว้ในโค้ด (4 = ก่อนมีคอลัมน์ healer · 5 = หลัง) */
function headerCols(text) {
  for (const line of String(text || '').split('\n')) {
    if (/^\|\s*code\s*\|/.test(line)) return pipeIndexes(line).length - 1;
  }
  return 0;
}
/** ช่อง prose (ช่องสุดท้าย) ของแถว — ตัดจาก "ขอบที่ ncol" ถึง "ขอบสุดท้าย" ไม่ใช่ `split('|')` แล้วเอาตัวท้าย
 *  เพราะ prose ของบางแถวมี `|` ดิบอยู่ข้างใน (W17: `class="ret pos|neg"`) ⇒ split แล้วจะเหลือแค่เศษท้าย */
function proseOf(line, ncol) {
  const idx = pipeIndexes(line);
  if (ncol < 1 || idx.length < ncol + 1) return null;
  return line.slice(idx[ncol - 1] + 1, idx[idx.length - 1]).trim();
}
/** ช่องที่ generate จากโค้ด: `|` ต้อง escape เสมอ (ไม่งั้นตารางแตก) · ข้อความที่มี `<`/`>` ใส่ backtick
 *  (label อย่าง `<html lang="th">` ถ้าปล่อยดิบ markdown จะกลืนเป็น tag) — prose ของคนไม่ผ่านตัวนี้ คงไว้ดิบ ๆ
 *  ★ label ที่มี backtick อยู่แล้วห้ามครอบ backtick ซ้อน (inline code จะปิดตัวเองกลางคำ) → escape `<`/`>` เป็น
 *  HTML entity แทน */
function mdCell(s) {
  const t = String(s == null ? '' : s).replace(/(?<!\\)\|/g, '\\|');
  if (!/[<>]/.test(t)) return t;
  return t.includes('`') ? t.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '`' + t + '`';
}

function checksTable(existing) {
  const ncol = headerCols(existing) || 5;
  const prose = {};
  for (const line of String(existing || '').split('\n')) {
    const m = /^\|\s*([EW]\d\d)\s*\|/.exec(line);
    if (!m) continue;
    const p = proseOf(line, ncol);
    if (p) prose[m[1]] = p;
  }
  const rows = [...CHECKS].sort(sortId).map((c) => `| ${c.id} | ${c.level} | ${mdCell(c.healer || '—')} | ${mdCell(c.label)} | ${prose[c.id] || '_(เติม)_'} |`);
  return ['| code | level | healer | ตรวจอะไร | เกณฑ์ + วิธีแก้ (ย่อ) |', '|---|---|---|---|---|', ...rows].join('\n');
}

/** ช่วง code ปัจจุบันต่อ prefix (E/W) จาก id ต่ำสุด/สูงสุดจริงใน CHECKS — เช่น "E01–E43 · W01–W23"
 *  ★ เป็นช่วง (min–max) ไม่ใช่รายการครบ — id ที่ถูกถอนออกกลางช่วง (เช่น W11 ยกไป E36) ไม่ทำให้ช่วงเปลี่ยน ตรงกับที่เอกสารเคยพิมพ์มือ */
function codeRange() {
  const nums = (prefix) => CHECKS.filter((c) => c.id[0] === prefix).map((c) => parseInt(c.id.slice(1), 10));
  const fmt = (prefix) => {
    const ns = nums(prefix);
    if (!ns.length) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${prefix}${pad(Math.min(...ns))}–${prefix}${pad(Math.max(...ns))}`;
  };
  return ['E', 'W'].map(fmt).filter(Boolean).join(' · ');
}

/** เหมือน verify-chain แต่ไม่มี backtick ต่อขั้น — ใช้ในบรรทัดคอมเมนต์ bash ที่ backtick จะโดน shell ตีความ */
function verifyChainPlain() {
  return VERIFY.map(stepName).join(' → ');
}

/** รายการขั้น verify แบบมีเลขลำดับ "N. **`file.js`** คำอธิบาย" — เลขลำดับ/รายชื่อไฟล์/จำนวนขั้น generate จาก VERIFY
 *  คำอธิบายท้ายบรรทัดเป็นของคน (เหมือน checksTable) — salvage จากเนื้อเดิมโดย key ด้วยชื่อไฟล์ ไม่ใช่เลขลำดับ (เลขขยับได้เมื่อแทรกขั้นใหม่ตรงกลาง)
 *  ขั้นใหม่ที่ยังไม่เคยมีคำอธิบายในไฟล์ → ขึ้น `_(เติม)_` ให้คนเติม (แพตเทิร์นเดียวกับ checksTable) */
function verifyList(existing) {
  const prose = {};
  for (const line of String(existing || '').split('\n')) {
    const m = /^\d+\.\s+\*\*`([^`]+)`\*\*(.*)$/.exec(line);   // ไม่กิน whitespace ต่อท้าย ** เอง — เก็บตัวคั่นเดิม (": " หรือ " (") ไว้ใน prose ตรง ๆ
    if (m) prose[m[1].replace(/\.js$/, '')] = m[2];   // .replace: ของเดิมพิมพ์ผสม ("build" ไม่มี .js แต่ตัวอื่นมี) — normalize คีย์ให้ตรง stepName() เสมอ
  }
  return VERIFY.map((s, i) => {
    const key = stepName(s);
    const p = prose[key];
    return `${i + 1}. **\`${key}\`**${p != null ? p : ' _(เติม)_'}`;
  }).join('\n');
}

/** ตำแหน่ง 1-based ของไฟล์ขั้นใน VERIFY ปัจจุบัน — ใช้ให้ comment ที่อ้าง "ขั้น N" คำนวณเองแทนพิมพ์เลขค้าง
 *  (comment เดิมพิมพ์เลขตายตัว ⇒ drift ทันทีที่มีขั้นแทรก/ถอนกลางเส้น — ดูหัว STEP_LABELS ข้อ ★) */
function stepIndex(file) {
  const i = VERIFY.indexOf(file);
  if (i < 0) throw new Error(`gen-docs: stepIndex('${file}') ไม่พบใน VERIFY — เช็คชื่อไฟล์`);
  return i + 1;
}

function prepushBlock() {
  const n = VERIFY.length;
  return VERIFY.map((s, i) => {
    const L = STEP_LABELS[s];
    if (!L) throw new Error(`gen-docs: ขั้น ${s} ไม่มีป้ายใน STEP_LABELS — เติม emoji/ป้าย/ข้อความ block() ที่ tools/gen-docs.js ก่อน`);
    const o = L[3] || {};
    const comment = typeof o.comment === 'function' ? o.comment(stepIndex) : o.comment;
    return `${comment ? comment + '\n' : ''}echo "${L[0]}${o.pad ? ' ' : ''} pre-push ${i + 1}/${n}: ${L[1]}…"\nnode ${s}${o.quiet ? ' >/dev/null' : ''} || block "${L[2]}"`;
  }).join('\n\n');
}

const GEN = {
  'checks-table': (old) => checksTable(old),
  'counts': () => `${errs.length} error + ${warns.length} warning`,
  'verify-steps': () => String(VERIFY.length),
  'verify-cron-steps': () => String(CRON.length),
  'verify-chain': () => VERIFY.map((s) => `\`${stepName(s)}\``).join(' → '),
  'verify-chain-plain': () => verifyChainPlain(),
  'verify-cron-chain': () => CRON.map((s) => `\`${stepName(s)}\``).join(' → '),
  'code-range': () => codeRange(),
  'verify-list': (old) => verifyList(old),
  'steps': () => prepushBlock(),
};
/** ชื่อ marker ที่ render เป็นหลายบรรทัด — ต้องขึ้นบรรทัดใหม่คั่นจาก tag เปิด/ปิด ไม่งั้น markdown/list จะติดกับ comment tag */
const MULTILINE = new Set(['checks-table', 'verify-list']);
const TARGETS = ['docs/quality-gate.md', 'CLAUDE.md', 'README.md', 'docs/price-refresh.md', '.githooks/pre-push'];
const MARK = (name, sh) => sh
  ? new RegExp(`(# gen:${name}\\n)([\\s\\S]*?)(\\n# /gen:${name})`, 'g')
  : new RegExp(`(<!-- gen:${name} -->)([\\s\\S]*?)(<!-- /gen:${name} -->)`, 'g');
/** ตัวเปิด marker แบบไม่ผูกชื่อ (ต่างจาก MARK ด้านบนที่ผูกชื่อ+ต้องมีตัวปิดคู่กัน) — ใช้นับ "เปิดไว้กี่อัน" ดิบ ๆ
 *  เทียบกับ "ใช้ไปกี่อัน" (จับคู่เปิด-ปิดสำเร็จจริงใน render) — ต่างกัน = มี marker เปิดค้างไม่มีปิด (ชื่อพิมพ์ผิด/
 *  ลบตัวปิดหลุด) ซึ่งเงียบได้ถ้าดูแค่ "used > 0" (Task 20 review 3: ลบ `<!-- /gen:counts -->` ไป 5/6 marker ยัง
 *  แมตช์ปกติ content ก็ไม่เปลี่ยนเพราะ marker ที่เหลือ 5 อันตรงโค้ดอยู่แล้ว ⇒ check() คืน [] ทั้งที่ไฟล์เสีย)
 *  ★ ฝั่ง sh ต้องยึดกฎเดียวกับ MARK() คือทั้งบรรทัดต้องมีแค่ `# gen:name` เท่านั้น (ผูก `^…$` ต่อบรรทัด) — ไม่งั้น
 *  ประโยคอธิบาย marker เอง เช่น ".githooks/pre-push" หัวไฟล์ที่พิมพ์ "`# gen:steps` … `# /gen:steps`" ในวงเล็บ
 *  จะถูกนับเป็น "เปิด" ปลอมไปด้วย (พบจริงตอน implement ข้อนี้) · ฝั่ง HTML comment ไม่ต้องผูกบรรทัด เพราะ MARK()
 *  เองก็ยอมให้ tag อยู่กลางบรรทัดได้ (เช่น "(<!-- gen:verify-cron-chain -->…<!-- /gen:… -->)") */
function countOpens(text, sh) {
  const re = sh ? /^# gen:[a-z-]+$/gm : /<!-- gen:[a-z-]+ -->/g;
  return (text.match(re) || []).length;
}

/** render บน text ที่ให้มาตรง ๆ (ไม่แตะ disk) — ใช้ทั้งจาก render(file) และ unit test (checkText) */
function renderText(file, text) {
  const sh = file.endsWith('pre-push');
  const opens = countOpens(text, sh);
  let out = text, used = 0;
  for (const [name, fn] of Object.entries(GEN)) {
    out = out.replace(MARK(name, sh), (m, a, old, z) => {
      used++;
      const body = fn(old);
      return sh ? `${a}${body}${z}` : (MULTILINE.has(name) ? `${a}\n${body}\n${z}` : `${a}${body}${z}`);
    });
  }
  return { text: out, used, opens };
}

/** คืนเนื้อไฟล์ที่ generate แล้ว + จำนวน marker ที่เจอ (0 = ไฟล์นี้ไม่มี marker เลย ⇒ check ฟ้อง) */
function render(file) {
  return renderText(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

/** ตรวจไฟล์เดียวจาก text ที่ให้มา — คืน `{file, why}` ถ้ามีปัญหา หรือ `null` ถ้าตรงหมด (แยกจาก check() เพื่อ
 *  unit-test ได้โดยไม่ต้องพึ่งไฟล์จริงบน disk — ดู test/docs-test.js เคส "marker เปิดไม่มีปิด") */
function checkText(file, text) {
  const r = renderText(file, text);
  if (!r.used) return { file, why: 'ไม่มี marker gen: เลย — ใส่ marker ครอบส่วนที่ generate (ดูหัวไฟล์ tools/gen-docs.js)' };
  if (r.opens !== r.used) return { file, why: `marker เปิดไม่มีปิด (${r.opens} เปิด · ${r.used} ใช้)` };
  if (r.text !== text) return { file, why: 'เนื้อในระหว่าง marker ไม่ตรงโค้ด — รัน node tools/gen-docs.js' };
  return null;
}

/** ไฟล์ไหนไม่ตรงโค้ดบ้าง — [] = ตรงหมด (test/docs-test.js เรียกตัวนี้) */
function check() {
  const out = [];
  for (const f of TARGETS) {
    let cur;
    try { cur = fs.readFileSync(path.join(ROOT, f), 'utf8'); }
    catch (e) { out.push({ file: f, why: e.message }); continue; }
    const bad = checkText(f, cur);
    if (bad) out.push(bad);
  }
  return out;
}

module.exports = { render, renderText, check, checkText, TARGETS, GEN, STEP_LABELS, VERIFY, CRON, checksTable, prepushBlock, proseOf, headerCols, mdCell, codeRange, verifyChainPlain, verifyList, stepIndex };

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const bad = check();
    for (const b of bad) console.error(`✗ ${b.file}: ${b.why}`);
    if (!bad.length) console.log(`✓ เอกสารตรงกับโค้ด (${TARGETS.length} ไฟล์ · ${errs.length} error + ${warns.length} warning · verify ${VERIFY.length} ขั้น)`);
    process.exit(bad.length ? 1 : 0);
  }
  for (const f of TARGETS) {
    const { text, used } = render(f);
    const changed = text !== fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (changed) fs.writeFileSync(path.join(ROOT, f), text);
    console.log(`${changed ? '✎' : '·'} ${f} (marker ${used})`);
  }
}
