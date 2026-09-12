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
 *   <!-- gen:verify-chain -->…<!-- /gen:verify-chain -->   ลำดับขั้นทั้งเส้น
 *   # gen:steps … # /gen:steps                             บล็อก echo+node ของ `.githooks/pre-push`
 * ★ ตัวเลขพวกนี้ที่พิมพ์ไว้ **นอก** marker จะ drift เงียบ — docs-test (Task 19) เป็นตัวฟ้อง
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
 *            `comment`: คอมเมนต์เหนือขั้นนั้น (คงคำอธิบายว่าทำไมขั้นนี้ไม่เงียบ ฯลฯ)
 *  ★ ขั้นใหม่ใน package.json ที่ยังไม่มีป้ายที่นี่ → render/check ล้มพร้อมบอกให้เติม (เงียบไม่ได้ — hook จะขาดขั้น)
 *  ★ ป้ายที่อ้าง "ขั้น N" ในคอมเมนต์เป็นข้อความคงที่ ไม่ได้ผูกกับลำดับจริง — แทรกขั้นใหม่ไว้กลางเส้นต้องแก้ข้อความเอง
 *  ★ ป้ายของ build.js ลงท้ายด้วยช่องว่าง (`'build dist/ '`) ตามของเดิมในไฟล์ hook — ตั้งใจ ห้ามตัดทิ้ง */
const STEP_LABELS = {
  'test/update-prices-test.js': ['💰', 'unit-test cron ราคา (update-prices-test)', 'update-prices unit gate', { quiet: true, comment: '# ขั้น 1-2 = unit test ของเครื่องมือ cron/canary — offline + เร็วที่สุด จึงวางไว้หน้าสุด (ล้มก่อนเสีย\n# เวลา build) · เพิ่ม 8 ส.ค. 2569 หลังพบว่า syntax error ในไฟล์เทสต์เองหลุด gate ไปได้ทั้งชุด' }],
  'test/dead-ticker-test.js': ['☠', 'unit-test canary หุ้นตาย (dead-ticker-test)', 'dead-ticker canary unit gate', { quiet: true, pad: true }],
  'test/tag-apply-test.js': ['🏷', 'unit-test เครื่องมือเขียน tag (tag-apply-test)', 'tag-apply unit gate', { quiet: true, pad: true }],
  'test/queue-test.js': ['🧭', 'unit-test runbook เคลียร์คิว + ลำดับขั้น verify (queue-test)', 'queue runbook unit gate', {}],
  'test/tags-test.js': ['🏷', 'ตรวจความสอดคล้อง tags.json ทั้งคลัง (tags-test)', 'tags corpus gate', { pad: true, comment: '# ไม่ >/dev/null — ส่วน C ของ tags-test.js เป็น corpus check จริง (reports/ ↔ tags.json ↔ คลัง เช่น\n# entry ค้างของหุ้นที่ลบไปแล้ว) ไม่ใช่แค่ unit test ของ tag-lib.js — ชื่อ symbol/slug ที่ผิดพิมพ์อยู่ใน\n# ข้อความ ok() เอง ถ้าเงียบไว้ operator จะเห็นแค่ "ไม่ผ่าน (ดูปัญหาด้านบน)" โดยไม่มีอะไรอยู่ด้านบนให้ดู' }],
  'test/check-reports.js': ['🔍', 'ตรวจคุณภาพรายงาน (check-reports)', 'report quality gate', {}],
  'test/self-test.js': ['🧪', 'meta-test ว่า check-reports ยังจับ defect ได้ (self-test)', 'checker self-test gate', { comment: '# ขั้น 7 = meta-test ของขั้น 6: ฉีด defect ลงรายงานจริงแล้วยืนยันว่า check ตัวที่คู่กัน "ยิงจริง" — ถ้า check\n# ตัวไหนเลิกแมตช์เงียบ ๆ ขั้น 6 จะรายงาน "0 error" แล้วทั้ง gate ผ่านหมด · ไม่ >/dev/null เพราะพิมพ์ผลลง stdout' }],
  'test/ohlc-test.js': ['📊', 'แปลง Yahoo OHLC (ohlc-test)', 'ohlc transform gate', { quiet: true }],
  'test/ta-engine-test.js': ['📈', 'นิยาม TA engine + รัน ta-chart ใน mock DOM (ta-engine-test)', 'TA engine gate', { quiet: true }],
  'build.js': ['🔧', 'build dist/ ', 'build', { quiet: true }],
  'test/build-test.js': ['🧪', 'unit-test build.js (เครดิตโมเดล + freshHash + injectTA)', 'build-test', { quiet: true }],
  'test/engine-exec.js': ['⚙️', 'รัน engine ทุกรายงานใน mock DOM (engine-exec)', 'engine execution gate', { quiet: true, pad: true }],
  'test/skeleton-test.js': ['🧱', 'โครงต้นแบบ TH/US เติมแล้วผ่าน gate (skeleton-test)', 'skeleton template gate', { quiet: true }],
  'test/check-site.js': ['🌐', 'ตรวจความสมบูรณ์เว็บไซต์ (check-site)', 'site integrity gate', {}],
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
 *  (label อย่าง `<html lang="th">` ถ้าปล่อยดิบ markdown จะกลืนเป็น tag) — prose ของคนไม่ผ่านตัวนี้ คงไว้ดิบ ๆ */
function mdCell(s) {
  const t = String(s == null ? '' : s).replace(/(?<!\\)\|/g, '\\|');
  return /[<>]/.test(t) ? '`' + t + '`' : t;
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

function prepushBlock() {
  const n = VERIFY.length;
  return VERIFY.map((s, i) => {
    const L = STEP_LABELS[s];
    if (!L) throw new Error(`gen-docs: ขั้น ${s} ไม่มีป้ายใน STEP_LABELS — เติม emoji/ป้าย/ข้อความ block() ที่ tools/gen-docs.js ก่อน`);
    const o = L[3] || {};
    return `${o.comment ? o.comment + '\n' : ''}echo "${L[0]}${o.pad ? ' ' : ''} pre-push ${i + 1}/${n}: ${L[1]}…"\nnode ${s}${o.quiet ? ' >/dev/null' : ''} || block "${L[2]}"`;
  }).join('\n\n');
}

const GEN = {
  'checks-table': (old) => checksTable(old),
  'counts': () => `${errs.length} error + ${warns.length} warning`,
  'verify-steps': () => String(VERIFY.length),
  'verify-cron-steps': () => String(CRON.length),
  'verify-chain': () => VERIFY.map((s) => `\`${stepName(s)}\``).join(' → '),
  'steps': () => prepushBlock(),
};
const TARGETS = ['docs/quality-gate.md', 'CLAUDE.md', 'README.md', 'docs/price-refresh.md', '.githooks/pre-push'];
const MARK = (name, sh) => sh
  ? new RegExp(`(# gen:${name}\\n)([\\s\\S]*?)(\\n# /gen:${name})`, 'g')
  : new RegExp(`(<!-- gen:${name} -->)([\\s\\S]*?)(<!-- /gen:${name} -->)`, 'g');

/** คืนเนื้อไฟล์ที่ generate แล้ว + จำนวน marker ที่เจอ (0 = ไฟล์นี้ไม่มี marker เลย ⇒ check ฟ้อง) */
function render(file) {
  const sh = file.endsWith('pre-push');
  let text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  let used = 0;
  for (const [name, fn] of Object.entries(GEN)) {
    text = text.replace(MARK(name, sh), (m, a, old, z) => {
      used++;
      const body = fn(old);
      return sh ? `${a}${body}${z}` : (name === 'checks-table' ? `${a}\n${body}\n${z}` : `${a}${body}${z}`);
    });
  }
  return { text, used };
}

/** ไฟล์ไหนไม่ตรงโค้ดบ้าง — [] = ตรงหมด (test/docs-test.js เรียกตัวนี้) */
function check() {
  const out = [];
  for (const f of TARGETS) {
    const cur = fs.readFileSync(path.join(ROOT, f), 'utf8');
    let r;
    try { r = render(f); }
    catch (e) { out.push({ file: f, why: e.message }); continue; }
    if (!r.used) out.push({ file: f, why: 'ไม่มี marker gen: เลย — ใส่ marker ครอบส่วนที่ generate (ดูหัวไฟล์ tools/gen-docs.js)' });
    else if (r.text !== cur) out.push({ file: f, why: 'เนื้อในระหว่าง marker ไม่ตรงโค้ด — รัน node tools/gen-docs.js' });
  }
  return out;
}

module.exports = { render, check, TARGETS, GEN, STEP_LABELS, VERIFY, CRON, checksTable, prepushBlock, proseOf, headerCols, mdCell };

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
