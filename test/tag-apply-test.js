#!/usr/bin/env node
'use strict';
/**
 * tag-apply-test.js — พฤติกรรมของ CLI ที่เขียน tags.json
 * หัวใจ: input เสีย = ไม่เขียนไฟล์เลย (ไม่ใช่เขียนบางส่วน) เพราะไฟล์นี้เป็น
 * source of truth ของ tag ทั้งเว็บ — เขียนพังครึ่งทางแล้ว gate จะฟ้อง 908 บรรทัด
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const A = require('../tools/tag-apply.js');
const TL = require('../tools/tag-lib.js');

const ROOT = path.join(__dirname, '..');

let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };

console.log('\n🧪 tag-apply-test: CLI เขียน tags.json\n');

// sandbox: reports ปลอม 2 ไฟล์ + คลังปลอม
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tagapply-'));
const repDir = path.join(tmp, 'reports');
fs.mkdirSync(repDir);
fs.writeFileSync(path.join(repDir, 'AAA.html'), '<html></html>');
fs.writeFileSync(path.join(repDir, 'BBB.html'), '<html></html>');
const list = [
  { slug: 'ai-datacenter', label: 'AI Data Center', aliases: ['ai'], desc: 'd' },
  { slug: 'power-grid', label: 'Power Grid', aliases: ['grid'], desc: 'd' },
];
const vocab = { version: 1, list, bySlug: new Map(list.map((e) => [e.slug, e])) };
const fresh = () => ({ vocabVersion: 1, tags: { AAA: ['ai-datacenter'] }, requests: [] });

// ── ปฏิเสธ input เสีย — ต้องไม่แตะ data ──
{
  const d = fresh();
  const r = A.applyTags({ symbol: 'AAA', slugs: ['ไม่มีจริง'], vocab, data: d, reportsDir: repDir });
  ok(!r.ok && r.errors.some((m) => /ไม่อยู่ในคลัง/.test(m)), 'slug นอกคลัง → ปฏิเสธ');
  ok(JSON.stringify(d.tags) === JSON.stringify({ AAA: ['ai-datacenter'] }), 'slug นอกคลัง → data เดิมไม่ถูกแตะ');
}
{
  const d = fresh();
  ok(!A.applyTags({ symbol: 'AAA', slugs: ['ai-datacenter', 'power-grid', 'ai-datacenter', 'power-grid'], vocab, data: d, reportsDir: repDir }).ok, '4 slug → ปฏิเสธ');
  ok(!A.applyTags({ symbol: 'AAA', slugs: ['ai-datacenter', 'ai-datacenter'], vocab, data: d, reportsDir: repDir }).ok, 'slug ซ้ำ → ปฏิเสธ');
  ok(!A.applyTags({ symbol: 'AAA', slugs: [], vocab, data: d, reportsDir: repDir }).ok, '0 slug → ปฏิเสธ');
  ok(!A.applyTags({ symbol: 'ZZZ', slugs: ['ai-datacenter'], vocab, data: d, reportsDir: repDir }).ok, 'ไม่มีไฟล์รายงาน → ปฏิเสธ');
}

// ── สำเร็จ ──
{
  const d = fresh();
  const r = A.applyTags({ symbol: 'BBB', slugs: ['power-grid', 'ai-datacenter'], vocab, data: d, reportsDir: repDir });
  ok(r.ok && JSON.stringify(r.data.tags.BBB) === JSON.stringify(['power-grid', 'ai-datacenter']), 'ติด tag สำเร็จ (คงลำดับที่สั่ง)');
}

// ── rename / prune / request ──
// NEW = 'BBB' เพราะมีไฟล์ reports/BBB.html อยู่จริงใน sandbox (repDir) และยังไม่มี entry ใน tags.json
// (เปลี่ยนจาก 'CCC' เดิมที่ไม่มีไฟล์รายงาน — จะโดนเงื่อนไข reject ใหม่ด้านล่างปฏิเสธ)
{
  const d = fresh();
  const r = A.renameSymbol(d, 'AAA', 'BBB', repDir);
  ok(r.ok && r.data.tags.BBB && !r.data.tags.AAA, '--rename ย้าย key');
  ok(JSON.stringify(r.data.tags.BBB) === JSON.stringify(['ai-datacenter']), '--rename คงค่าเดิม');
}
// ── rename: NEW ไม่มีไฟล์รายงานจริง — ปฏิเสธ (ปิดช่องข้อมูลหายสองจังหวะ: --rename สำเร็จ
// เพราะ NEW ยังไม่มี entry → --prune รอบถัดไปเจอไม่มี reports/NEW.html แล้วลบทิ้ง) ──
{
  const d = fresh();
  const r = A.renameSymbol(d, 'AAA', 'CCC', repDir); // repDir มีแค่ AAA.html/BBB.html — ไม่มี CCC.html
  ok(!r.ok && r.errors.some((m) => /ไม่มีไฟล์ reports\/CCC\.html/.test(m)), '--rename NEW ไม่มีไฟล์รายงานจริง → ปฏิเสธ');
  ok(r.data === d, '--rename NEW ไม่มีไฟล์รายงาน → data เดิมไม่ถูกแตะ');
}
// ── rename: ปฏิเสธ — ต้องไม่แตะ data ──
{
  const d = fresh();
  const r = A.renameSymbol(d, 'ไม่มีจริง', 'CCC', repDir);
  ok(!r.ok && r.errors.some((m) => /ไม่มี entry/.test(m)), '--rename จาก OLD ที่ไม่มี entry → ปฏิเสธ');
  ok(r.data === d, '--rename OLD ไม่มี entry → data เดิมไม่ถูกแตะ');
}
{
  const d = fresh();
  d.tags.BBB = ['power-grid'];
  const r = A.renameSymbol(d, 'AAA', 'BBB', repDir);
  ok(!r.ok && r.errors.some((m) => /มี entry อยู่แล้ว/.test(m)), '--rename ทับ NEW ที่มี entry อยู่แล้ว → ปฏิเสธ');
  ok(JSON.stringify(r.data.tags) === JSON.stringify({ AAA: ['ai-datacenter'], BBB: ['power-grid'] }),
     '--rename ทับ NEW → data เดิมไม่ถูกแตะ (BBB ไม่หาย)');
}
{
  const d = fresh();
  const r = A.renameSymbol(d, 'AAA', 'AAA', repDir);
  ok(!r.ok && r.errors.some((m) => /สัญลักษณ์เดียวกัน/.test(m)), '--rename OLD กับ NEW ซ้ำกัน → ปฏิเสธ');
}
{
  const d = fresh();
  d.tags.GONE = ['power-grid'];
  const r = A.pruneMissing(d, repDir);
  ok(!r.data.tags.GONE && r.data.tags.AAA, '--prune ลบเฉพาะ entry ที่ไม่มีไฟล์');
  ok(r.removed.length === 1 && r.removed[0] === 'GONE', '--prune รายงานตัวที่ลบ');
}
{
  const d = fresh();
  const r = A.addRequest(d, 'BBB', 'LiDAR ยานยนต์', '2026-08-14', 'UPDATE');
  ok(r.requests.length === 1 && r.requests[0].symbol === 'BBB', '--request ต่อท้ายคิว');
  ok(JSON.stringify(r.tags) === JSON.stringify({ AAA: ['ai-datacenter'] }), '--request ไม่แตะ tags');
}

// ── เขียนไฟล์: atomic + key เรียง + ปิดท้าย newline ──
{
  const f = path.join(tmp, 'tags.json');
  const d = { vocabVersion: 1, tags: { ZZZ: ['power-grid'], AAA: ['ai-datacenter'] }, requests: [] };
  A.writeTags(d, f);
  const txt = fs.readFileSync(f, 'utf8');
  ok(txt.endsWith('\n'), 'ไฟล์ปิดท้ายด้วย newline');
  ok(txt.indexOf('"AAA"') < txt.indexOf('"ZZZ"'), 'key เรียงตามตัวอักษร (diff อ่านง่าย)');
  ok(JSON.parse(txt).tags.AAA.length === 1, 'JSON parse กลับได้');
  ok(!fs.existsSync(f + '.tmp'), 'ไม่มีไฟล์ .tmp ค้าง');
}

// ── เขียนไฟล์ล้มกลางคัน (rename พัง) — ต้องไม่ทิ้ง .tmp ค้าง + throw ต่อไม่กลืน error ──
{
  const badTarget = path.join(tmp, 'is-a-dir'); // rename ไฟล์ทับ dir ต้องพังเสมอ (EISDIR/ENOTEMPTY)
  fs.mkdirSync(badTarget);
  const d = { vocabVersion: 1, tags: { AAA: ['ai-datacenter'] }, requests: [] };
  let threw = false;
  try { A.writeTags(d, badTarget); } catch (e) { threw = true; }
  ok(threw, 'writeTags: rename ล้มเหลว → throw ต่อ (ไม่กลืน error)');
  ok(!fs.existsSync(badTarget + '.tmp'), 'writeTags: ล้มกลางคัน → ไม่มี .tmp ค้าง');
  ok(fs.statSync(badTarget).isDirectory(), 'writeTags: ล้มกลางคัน → target เดิมไม่ถูกแตะ');
}

// ── CLI จริง (process แยก) ต่อ tags.json ตัวจริงของรีโป ──
// ทดสอบเฉพาะ "เส้นทางปฏิเสธ" เท่านั้น — ตามนิยามต้องไม่เขียนไฟล์เลย จึงปลอดภัยที่จะยิงใส่
// tags.json จริง (ไม่ทำ mutation) นี่คือเทสเดียวที่ยืนยัน wiring ใน main() ว่า
// `if (!r.ok) die(...)` มาก่อน `writeTags` จริง ๆ — เทสข้างบนทั้งหมดเรียกฟังก์ชัน pure ในหน่วยความจำ
// ไม่เคยรัน CLI เป็น process จริงเลย
{
  const CLI = path.join(ROOT, 'tools', 'tag-apply.js');
  const REAL_TAGS_FILE = path.join(ROOT, 'tags.json');
  const REAL_TMP_FILE = REAL_TAGS_FILE + '.tmp';
  const REAL_REPORTS_DIR = path.join(ROOT, 'reports');

  const real = TL.loadTags(REAL_TAGS_FILE);
  const keys = Object.keys(real.tags).sort();
  const existingSym = keys[0];   // มี entry ใน tags.json จริง + มีไฟล์ reports/ จริง
  const existingSym2 = keys[1];  // อีกตัวที่มี entry อยู่แล้ว (ใช้เป็น NEW ที่ห้ามถูกทับ)

  // สร้างชื่อ symbol ที่ไม่มีจริงแน่ ๆ ทั้งใน tags.json และใน reports/
  const freshMissing = (seed) => {
    let s = seed;
    while (real.tags[s] || fs.existsSync(path.join(REAL_REPORTS_DIR, s + '.html'))) s += 'X';
    return s;
  };
  const missingSym = freshMissing('ZZZQNOPE1');
  const missingSym2 = freshMissing('ZZZQNOPE2');

  const runCLI = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

  const assertRejects = (args, desc) => {
    const before = fs.readFileSync(REAL_TAGS_FILE);
    const res = runCLI(args);
    const after = fs.readFileSync(REAL_TAGS_FILE);
    ok(res.status === 1, `[CLI] ${desc} → exit code 1`);
    ok(before.equals(after), `[CLI] ${desc} → tags.json ไม่ถูกแตะเลย (byte-identical)`);
    ok(!fs.existsSync(REAL_TMP_FILE), `[CLI] ${desc} → ไม่มี tags.json.tmp ค้าง`);
  };

  assertRejects([existingSym, 'ไม่มีจริงแน่นอน'], 'slug ไม่อยู่ในคลัง');
  assertRejects([existingSym, 'ai-datacenter', 'power-grid', 'nuclear-smr', 'glp-1'], 'เกิน 3 slug');
  assertRejects([existingSym, 'ai-datacenter', 'ai-datacenter'], 'slug ซ้ำกันเอง');
  assertRejects([missingSym, 'ai-datacenter'], `symbol ไม่มีไฟล์ reports/${missingSym}.html`);
  assertRejects(['--rename', existingSym, existingSym2], `--rename ${existingSym} → ${existingSym2} (NEW มี entry อยู่แล้ว)`);
  assertRejects(['--rename', missingSym, missingSym2], `--rename ${missingSym} → ${missingSym2} (OLD ไม่มี entry)`);
  // งานพ่วง: ปิดช่องข้อมูลหายสองจังหวะ — OLD มีจริง (existingSym) แต่ NEW (missingSym) ไม่มีไฟล์
  // reports/ เลย ก่อนแก้ตรงนี้ --rename แบบนี้จะ "สำเร็จ" เงียบ ๆ (เพราะ missingSym ยังไม่มี entry)
  // แล้ว --prune รอบถัดไปจะเจอไม่มีไฟล์รายงาน → ลบ entry ทิ้ง = ข้อมูลหายแบบสองจังหวะ
  assertRejects(['--rename', existingSym, missingSym], `--rename ${existingSym} → ${missingSym} (NEW ไม่มีไฟล์ reports/${missingSym}.html)`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + '─'.repeat(50));
console.log(`tag-apply-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ tag-apply.js มีพฤติกรรมผิด\n'); process.exit(1); }
console.log('\n✅ tag-apply.js ถูกต้อง\n'); process.exit(0);
