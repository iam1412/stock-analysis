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

// ── CLI จริง (process แยก) ต่อ sandbox tags.json/tags-vocab.json/reports/ ใน os.tmpdir() ──
// ★ ก่อนแก้ (finding 1) บล็อกนี้เคยยิงคำสั่ง CLI ใส่ tags.json จริงของรีโปตรง ๆ — อาศัยว่าทุกเคส
// เป็น "เส้นทางปฏิเสธ" ที่นิยามว่าต้องไม่เขียนไฟล์เลย จึงดูปลอดภัย "ในทางทฤษฎี" แต่ตอนจับ RED
// evidence ของ guard --rename จริง ๆ (ก่อน fix) ตัว CLI ดันเขียน rename ปลอมลง tags.json จริง
// จนต้องกู้คืนด้วย git checkout เพราะพาธเป็น const ผูกตายตัวใน tag-lib.js/tag-apply.js ไม่มีทาง
// รีไดเรกต์ได้เลย — นี่คือความเสียหายที่เกิดขึ้นจริง ไม่ใช่แค่ความเสี่ยงทางทฤษฎี
// ตอนนี้พาธ override ได้ผ่าน env STOCK_TAGS_FILE/STOCK_VOCAB_FILE/STOCK_REPORTS_DIR (เทสเท่านั้น
// — production/cron ไม่ตั้ง env พวกนี้เลย) จึงสร้าง sandbox แยกทั้งชุดได้ ปลอดภัยจาก tags.json จริง 100%
{
  const cliTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tagapply-cli-'));
  const cliReportsDir = path.join(cliTmp, 'reports');
  const cliVocabFile = path.join(cliTmp, 'tags-vocab.json');
  const cliTagsFile = path.join(cliTmp, 'tags.json');
  const cliTmpFile = cliTagsFile + '.tmp';
  fs.mkdirSync(cliReportsDir);
  // คลังจริงของรีโป — อ่านอย่างเดียว (CLI ไม่เคยเขียนไฟล์นี้) จึง copy มาใช้ตรง ๆ ได้ปลอดภัย
  fs.copyFileSync(path.join(ROOT, 'tags-vocab.json'), cliVocabFile);

  const CLI = path.join(ROOT, 'tools', 'tag-apply.js');
  const cliEnv = Object.assign({}, process.env, {
    STOCK_TAGS_FILE: cliTagsFile,
    STOCK_VOCAB_FILE: cliVocabFile,
    STOCK_REPORTS_DIR: cliReportsDir,
  });
  const runCLI = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: cliEnv });

  // symZ/symA มี entry อยู่แล้ว + มีไฟล์รายงานจริงใน sandbox — ตั้งชื่อ "Z ก่อน A" (ไม่เรียงตัวอักษร)
  // ตอน seed ตั้งใจ เพื่อให้เทส "key เรียงตามตัวอักษร" ท้ายบล็อกยืนยันได้จริงว่า writeTags() เรียงใหม่
  // ไม่ใช่บังเอิญเรียงอยู่แล้วตั้งแต่ seed
  const symZ = 'ZZCLI1', symA = 'AACLI2';
  // symMiss1/symMiss2 ไม่มี entry และไม่มีไฟล์รายงานเลย — ใช้แทน "missing" ในทุกเคสปฏิเสธ
  const symMiss1 = 'NOPECLI1', symMiss2 = 'NOPECLI2';
  fs.writeFileSync(path.join(cliReportsDir, symZ + '.html'), '<html></html>');
  fs.writeFileSync(path.join(cliReportsDir, symA + '.html'), '<html></html>');

  const seedTags = () => {
    const data = { vocabVersion: 1, tags: {}, requests: [] };
    data.tags[symZ] = ['ai-datacenter'];
    data.tags[symA] = ['power-grid'];
    fs.writeFileSync(cliTagsFile, JSON.stringify(data, null, 2) + '\n');
  };

  const assertRejects = (args, desc) => {
    seedTags(); // reseed ทุกเคส — แต่ละเคสอิสระจากกัน ไม่พึ่งผลจากเคสก่อนหน้า
    const before = fs.readFileSync(cliTagsFile);
    const res = runCLI(args);
    const after = fs.readFileSync(cliTagsFile);
    ok(res.status === 1, `[CLI] ${desc} → exit code 1`);
    ok(before.equals(after), `[CLI] ${desc} → tags.json (sandbox) ไม่ถูกแตะเลย (byte-identical)`);
    ok(!fs.existsSync(cliTmpFile), `[CLI] ${desc} → ไม่มี tags.json.tmp ค้าง (sandbox)`);
  };

  assertRejects([symZ, 'ไม่มีจริงแน่นอน'], 'slug ไม่อยู่ในคลัง');
  assertRejects([symZ, 'ai-datacenter', 'power-grid', 'nuclear-smr', 'glp-1'], 'เกิน 3 slug');
  assertRejects([symZ, 'ai-datacenter', 'ai-datacenter'], 'slug ซ้ำกันเอง');
  assertRejects([symMiss1, 'ai-datacenter'], `symbol ไม่มีไฟล์ reports/${symMiss1}.html`);
  assertRejects(['--rename', symZ, symA], `--rename ${symZ} → ${symA} (NEW มี entry อยู่แล้ว)`);
  assertRejects(['--rename', symMiss1, symMiss2], `--rename ${symMiss1} → ${symMiss2} (OLD ไม่มี entry)`);
  // งานพ่วง: ปิดช่องข้อมูลหายสองจังหวะ — OLD มีจริง (symZ) แต่ NEW (symMiss1) ไม่มีไฟล์ reports/ เลย
  // ก่อนแก้ตรงนี้ --rename แบบนี้จะ "สำเร็จ" เงียบ ๆ (เพราะ symMiss1 ยังไม่มี entry) แล้ว --prune
  // รอบถัดไปจะเจอไม่มีไฟล์รายงาน → ลบ entry ทิ้ง = ข้อมูลหายแบบสองจังหวะ
  assertRejects(['--rename', symZ, symMiss1], `--rename ${symZ} → ${symMiss1} (NEW ไม่มีไฟล์ reports/${symMiss1}.html)`);

  // ── success path — เดิมเป็นไปไม่ได้เพราะยิงใส่ tags.json จริงตรง ๆ (เขียนสำเร็จ = แก้ไฟล์จริง)
  // ตอนนี้มี sandbox แยกแล้ว จึงยืนยัน "เส้นทางสำเร็จ" ของ CLI เป็น process จริงได้ครั้งแรก ──
  {
    seedTags();
    const res = runCLI([symA, 'ai-datacenter', 'nuclear-smr']);
    ok(res.status === 0, '[CLI] assign สำเร็จ → exit code 0');
    const txt = fs.readFileSync(cliTagsFile, 'utf8');
    const parsed = JSON.parse(txt);
    ok(JSON.stringify(parsed.tags[symA]) === JSON.stringify(['ai-datacenter', 'nuclear-smr']),
       '[CLI] assign สำเร็จ → sandbox tags.json มี entry ใหม่ (คงลำดับที่สั่ง)');
    ok(txt.indexOf('"' + symA + '"') < txt.indexOf('"' + symZ + '"'), '[CLI] assign สำเร็จ → key เรียงตามตัวอักษร (A ก่อน Z)');
    ok(txt.endsWith('\n'), '[CLI] assign สำเร็จ → ไฟล์ปิดท้ายด้วย newline');
    ok(!fs.existsSync(cliTmpFile), '[CLI] assign สำเร็จ → ไม่มี .tmp ค้าง');
  }

  fs.rmSync(cliTmp, { recursive: true, force: true });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + '─'.repeat(50));
console.log(`tag-apply-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ tag-apply.js มีพฤติกรรมผิด\n'); process.exit(1); }
console.log('\n✅ tag-apply.js ถูกต้อง\n'); process.exit(0);
