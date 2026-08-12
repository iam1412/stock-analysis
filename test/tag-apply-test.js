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
const A = require('../tools/tag-apply.js');

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
{
  const d = fresh();
  const r = A.renameSymbol(d, 'AAA', 'CCC');
  ok(r.tags.CCC && !r.tags.AAA, '--rename ย้าย key');
  ok(JSON.stringify(r.tags.CCC) === JSON.stringify(['ai-datacenter']), '--rename คงค่าเดิม');
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

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + '─'.repeat(50));
console.log(`tag-apply-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ tag-apply.js มีพฤติกรรมผิด\n'); process.exit(1); }
console.log('\n✅ tag-apply.js ถูกต้อง\n'); process.exit(0);
