#!/usr/bin/env node
'use strict';
/**
 * tags-test.js — เทสต์ tools/tag-lib.js
 * ครอบคลุมวันนี้: schema ของคลัง (validateVocab) · validateAssignment · matchTagQuery
 * (two-tier whole-word/prefix + ES5-purity ของ source text) · loadTags/tagsOf/membersOf —
 * ส่วนใหญ่ใช้ fixture สังเคราะห์ ยกเว้นเคส "ai" ที่ยิงกับ tags-vocab.json จริง (regression ที่เจอจริง)
 * ยังไม่มี bijection ทั้งสองทาง / dangling slug / ความสอดคล้องกับ symbol-map — งานนั้นเพิ่มทีหลัง
 * รัน: node test/tags-test.js  (npm run test:tags)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../tools/tag-lib.js');

const ROOT = path.join(__dirname, '..');
let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n🏷  tags-test: ความถูกต้องของข้อมูล tag\n');

// ── A) schema ของคลัง ──
const vocab = T.loadVocab();
ok(T.validateVocab(vocab).length === 0, 'tags-vocab.json ผ่าน schema: ' + (T.validateVocab(vocab)[0] || ''));
ok(vocab.list.length > 0, `คลังมี ${vocab.list.length} slug`);

// slug ซ้ำ / รูปแบบผิด / label ว่าง — ใช้ fixture สังเคราะห์
const mkVocab = (list) => ({ version: 1, list, bySlug: new Map(list.map((e) => [e.slug, e])) });
const E = (slug, label, aliases) => ({ slug, label, aliases: aliases || [], desc: 'd' });

ok(T.validateVocab(mkVocab([E('a-b', 'A'), E('a-b', 'B')])).some((m) => /ซ้ำ/.test(m)), 'จับ slug ซ้ำในคลัง');
ok(T.validateVocab(mkVocab([E('A-B', 'A')])).some((m) => /รูปแบบ/.test(m)), 'จับ slug ที่มีตัวพิมพ์ใหญ่');
ok(T.validateVocab(mkVocab([E('a b', 'A')])).some((m) => /รูปแบบ/.test(m)), 'จับ slug ที่มีช่องว่าง');
ok(T.validateVocab(mkVocab([E('a-b', '')])).some((m) => /label/.test(m)), 'จับ label ว่าง');
ok(T.validateVocab(mkVocab([E('a-b', 'A', ['x']), E('c-d', 'C', ['x'])])).some((m) => /alias/.test(m)),
   'จับ alias ที่ชนกันข้ามslug');

// desc/note — desc เป็นข้อความสำหรับผู้อ่านเว็บ (ขึ้น meta description ที่ Google แสดง) ต้องมีจริงและสะอาด
// เดิม validateVocab ไม่แตะ desc เลย ⇒ entry ที่ลืมใส่จะผ่าน schema แต่ไป throw ตอน build (ทั้งรีโปล่ม)
// และบันทึกถึงคนติดแท็กที่เคยยัดไว้ท้าย desc ด้วย " — ★ …" ก็หลุดขึ้นหน้าเว็บได้โดยไม่มีอะไรฟ้อง
const noDesc = (slug, label) => ({ slug, label, aliases: [] });
ok(T.validateVocab(mkVocab([noDesc('a-b', 'A')])).some((m) => /desc ว่าง/.test(m)), 'จับ entry ที่ไม่มีฟิลด์ desc เลย');
ok(T.validateVocab(mkVocab([{ ...E('a-b', 'A'), desc: '   ' }])).some((m) => /desc ว่าง/.test(m)), 'จับ desc ที่มีแต่ช่องว่าง');
ok(T.validateVocab(mkVocab([{ ...E('a-b', 'A'), desc: 'คำอธิบาย — ★ ติดได้เฉพาะเมื่อ…' }])).some((m) => /note/.test(m)),
   'จับบันทึกภายใน (★) ที่ยัดอยู่ใน desc — ต้องย้ายไปฟิลด์ note');
ok(T.validateVocab(mkVocab([{ ...E('a-b', 'A'), note: '' }])).some((m) => /note ว่าง/.test(m)), 'จับ note ที่มีฟิลด์แต่ไม่มีข้อความ');
ok(T.validateVocab(mkVocab([{ ...E('a-b', 'A'), note: 'กติกาพิเศษ' }])).length === 0, 'note ที่มีข้อความจริง → ผ่าน');
ok(vocab.list.every((e) => !e.desc.includes('★')), 'ทุก entry ในคลังจริง: desc ไม่มีบันทึกภายในปนมา');

// ── B) validateAssignment ──
const V = mkVocab([E('ai-datacenter', 'AI Data Center', ['ai']), E('power-grid', 'Power Grid', ['grid'])]);
ok(T.validateAssignment('LITE', ['ai-datacenter'], V).length === 0, 'assignment ถูกต้อง → ไม่มี error');
ok(T.validateAssignment('LITE', ['ไม่มีจริง'], V).some((m) => /ไม่อยู่ในคลัง/.test(m)), 'จับ slug นอกคลัง');
ok(T.validateAssignment('LITE', [], V).some((m) => /อย่างน้อย 1/.test(m)), 'จับ 0 slug');
ok(T.validateAssignment('LITE', ['ai-datacenter', 'power-grid', 'ai-datacenter', 'power-grid'], V)
   .some((m) => /เกิน 3/.test(m)), 'จับเกิน 3 slug');
ok(T.validateAssignment('LITE', ['ai-datacenter', 'ai-datacenter'], V).some((m) => /ซ้ำ/.test(m)), 'จับ slug ซ้ำกันเอง');

// ── C) matchTagQuery — fixture สังเคราะห์ (กัน test พังตอน vocab จริงถูกเขียนใหม่) ──
const FIX = [
  E('ai-datacenter', 'AI Data Center', ['ai', 'เอไอ', 'data center']),
  E('thai-tourism', 'ท่องเที่ยวไทย', ['tourism', 'airline']),
  E('defense-rearm', 'Defense & Rearmament', ['defense', 'defence']),
  E('optical-photonics', 'Optical & Photonics', ['optical', 'photonics', 'cpo']),
];

ok(eq(T.matchTagQuery('ai', FIX), ['ai-datacenter']), '"ai" → tier 1 คำเต็ม (ไม่ลาก thai-tourism ผ่าน "airline")');
ok(eq(T.matchTagQuery('air', FIX), ['thai-tourism']), '"air" → tier 1 ว่าง ตกไป tier 2 ขึ้นต้นคำ ("airline")');
ok(eq(T.matchTagQuery('data cen', FIX), ['ai-datacenter']), '"data cen" → tier 2 (cen ไม่ใช่คำเต็ม)');
ok(eq(T.matchTagQuery('เอไอ', FIX), ['ai-datacenter']), '"เอไอ" → ไทย substring');
ok(eq(T.matchTagQuery('defen', FIX), ['defense-rearm']), '"defen" → tier 2 ขึ้นต้นคำ');
ok(eq(T.matchTagQuery('optical', FIX), ['optical-photonics']), '"optical" → tier 1 คำเต็ม');
ok(eq(T.matchTagQuery('xyz', FIX), []), 'คำค้นไม่ตรงอะไรเลย → []');
ok(eq(T.matchTagQuery('a', FIX), []), 'สั้นกว่า 2 ตัวอักษร → []');
ok(eq(T.matchTagQuery('', FIX), []), 'สตริงว่าง → []');
ok(eq(T.matchTagQuery(null, FIX), []), 'null → []');

// เคสจริงที่เจอบั๊ก — ยิงกับ tags-vocab.json ของจริง (ไม่ใช่ fixture) เพื่อกันบั๊กนี้กลับมา
// ★ สัญญาของเทสนี้คือ "ต้องไม่มี prefix noise ติดมา" ไม่ใช่ "ต้องได้ ai-datacenter ตัวเดียว" —
//   คลังโตขึ้นแล้วมีธีม AI มากกว่าหนึ่ง (ai-datacenter, ai-compute-chip) การได้หลายตัวจึงถูกต้อง
//   บั๊กจริงที่กันคือ tag ที่ติดมาเพราะ alias ขึ้นต้นด้วย "ai" เฉย ๆ (thai-tourism ← "airline")
{
  const hits = T.matchTagQuery('ai', vocab.list);
  ok(hits.includes('ai-datacenter'), '[regression] "ai" กับคลังจริง → ต้องมี ai-datacenter');
  ok(!hits.includes('thai-tourism'), '[regression] "ai" กับคลังจริง → ต้องไม่มี thai-tourism (prefix noise จาก "airline")');
  // ทุกตัวที่ติดมาต้องมีคำเต็มว่า "ai" ใน label/alias จริง ไม่ใช่แค่ขึ้นต้นคำ
  const noisy = hits.filter((s) => {
    const e = vocab.bySlug.get(s);
    return ![e.label, ...(e.aliases || [])].some((t) => /(^|[^a-z0-9])ai([^a-z0-9]|$)/i.test(String(t)));
  });
  ok(noisy.length === 0, `[regression] "ai" → ทุกผลลัพธ์มีคำเต็ม "ai" จริง (ปนมา: ${noisy.join(', ') || 'ไม่มี'})`);
}

// ขอบเขตคำ: "ai" ต้องไม่แมตช์กลางคำ "Thailand" / "retail" — แต่ยังขึ้นต้นคำได้ปกติ
const BOUND = [E('boundary-test', 'Thailand Fund', ['retail', 'chain'])];
ok(eq(T.matchTagQuery('ai', BOUND), []), '"ai" ไม่แมตช์กลางคำ "Thailand"/"retail"');
ok(eq(T.matchTagQuery('thai', BOUND), ['boundary-test']), '"thai" แมตช์ขึ้นต้นคำ "Thailand" (tier 2)');
ok(eq(T.matchTagQuery('chain', BOUND), ['boundary-test']), '"chain" แมตช์คำเต็ม (tier 1)');

// multi-word AND ข้าม label + alias ในเอนทรีเดียวกัน
ok(eq(T.matchTagQuery('photonics cpo', FIX), ['optical-photonics']),
   'multi-word AND: คำหนึ่งมาจาก label อีกคำมาจาก alias ของเอนทรีเดียวกัน');
ok(eq(T.matchTagQuery('photonics ai', FIX), []), 'multi-word AND: คนละเอนทรี → ไม่แมตช์เลย');

// ★ ES5-purity — เช็คว่า source text ของ matchTagQuery ยังฝังลงสคริปต์เบราว์เซอร์ได้ปลอดภัย
const src = String(T.matchTagQuery);
ok(src.indexOf('const ') === -1, 'ES5-purity: ไม่มี "const "');
ok(src.indexOf('let ') === -1, 'ES5-purity: ไม่มี "let "');
ok(src.indexOf('=>') === -1, 'ES5-purity: ไม่มี arrow function');
ok(src.indexOf('`') === -1, 'ES5-purity: ไม่มี backtick / template literal');
ok(src.indexOf('...') === -1, 'ES5-purity: ไม่มี spread/rest');

// ── C.2) filterQueryString — ซิงก์ ?tag=/?market= กลับ location.search โดยไม่ทับพารามิเตอร์อื่น ──
ok(T.filterQueryString('', '', 'all') === '', 'filterQueryString: ไม่มีตัวกรองเลย + input ว่าง → ว่าง');
ok(T.filterQueryString('', 'ai-datacenter', 'all') === '?tag=ai-datacenter', 'filterQueryString: ตั้ง tag → "?tag=ai-datacenter"');
ok(T.filterQueryString('?market=TH', '', 'all') === '', 'filterQueryString: market="all" → ไม่เขียนพารามิเตอร์ market (ถูกลบ)');
ok(T.filterQueryString('?utm_source=x&b=2', 'ai-datacenter', 'all') === '?utm_source=x&b=2&tag=ai-datacenter',
   'filterQueryString: พารามิเตอร์อื่นที่ไม่รู้จักคงอยู่ครบและเรียงลำดับเดิม');
ok(T.filterQueryString('?tag=old-slug&market=US', 'new-slug', 'US') === '?tag=new-slug&market=US',
   'filterQueryString: tag/market เดิมใน input ถูกแทนที่ ไม่ซ้ำ (ไม่เกิด ?tag=old-slug&tag=new-slug)');
ok(T.filterQueryString('?utm_source=x&tag=ai-datacenter&market=TH', '', 'TH') === '?utm_source=x&market=TH',
   'filterQueryString: ล้าง tag ตัวเดียว → เหลือ utm_source + market เดิม');
ok(T.filterQueryString('?utm_source=x&tag=ai-datacenter&market=TH', 'ai-datacenter', 'all') === '?utm_source=x&tag=ai-datacenter',
   'filterQueryString: ล้าง market ตัวเดียว (กลับเป็น all) → เหลือ utm_source + tag เดิม');

// ★ ES5-purity — เช็คว่า source text ของ filterQueryString ยังฝังลงสคริปต์เบราว์เซอร์ได้ปลอดภัย (เหมือน matchTagQuery)
const fqsSrc = String(T.filterQueryString);
ok(fqsSrc.indexOf('const ') === -1, 'filterQueryString ES5-purity: ไม่มี "const "');
ok(fqsSrc.indexOf('let ') === -1, 'filterQueryString ES5-purity: ไม่มี "let "');
ok(fqsSrc.indexOf('=>') === -1, 'filterQueryString ES5-purity: ไม่มี arrow function');
ok(fqsSrc.indexOf('`') === -1, 'filterQueryString ES5-purity: ไม่มี backtick / template literal');
ok(fqsSrc.indexOf('...') === -1, 'filterQueryString ES5-purity: ไม่มี spread/rest');

// ── D) loadTags / tagsOf / membersOf ──
const tmpFile1 = path.join(os.tmpdir(), `tags-test-fixture-${process.pid}-a.json`);
fs.writeFileSync(tmpFile1, JSON.stringify({
  vocabVersion: 3,
  tags: { AAA: ['ai-datacenter'], ZZZ: ['ai-datacenter', 'power-grid'], MMM: ['power-grid'] },
  requests: [{ symbol: 'CCC' }],
}));
let td;
try { td = T.loadTags(tmpFile1); } finally { fs.unlinkSync(tmpFile1); }
ok(td.vocabVersion === 3, 'loadTags: อ่าน vocabVersion ถูก');
ok(eq(td.tags.AAA, ['ai-datacenter']), 'loadTags: อ่าน tags ต่อ symbol ถูก');
ok(td.requests.length === 1, 'loadTags: อ่าน requests ถูก');

const tmpFile2 = path.join(os.tmpdir(), `tags-test-fixture-${process.pid}-b.json`);
fs.writeFileSync(tmpFile2, JSON.stringify({}));
let td2;
try { td2 = T.loadTags(tmpFile2); } finally { fs.unlinkSync(tmpFile2); }
ok(td2.vocabVersion === 0 && eq(td2.tags, {}) && td2.requests.length === 0,
   'loadTags: field หาย → ค่า default (0 / {} / [])');

ok(eq(T.tagsOf('AAA', td), ['ai-datacenter']), 'tagsOf: คืน tag ของ symbol ที่มีจริง');
ok(eq(T.tagsOf('NOPE', td), []), 'tagsOf: symbol ที่ไม่รู้จัก → []');
ok(eq(T.tagsOf('AAA', null), []), 'tagsOf: tagData เป็น null → []');

const m = T.membersOf(td);
ok(eq(m.get('ai-datacenter'), ['AAA', 'ZZZ']), 'membersOf: map slug → รายชื่อหุ้นเรียงตามตัวอักษร');
ok(eq(m.get('power-grid'), ['MMM', 'ZZZ']), 'membersOf: รวมสมาชิกจากหลาย symbol เข้า slug เดียวกัน');
ok(m.get('no-such-slug') === undefined, 'membersOf: slug ที่ไม่มีสมาชิกเลย → undefined');

// ── C) corpus: reports/ ↔ tags.json ↔ คลัง (ตรวจสองทาง) ──
const data = T.loadTags();
const syms = fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, ''));
const symSet = new Set(syms);

const missing = syms.filter((s) => !data.tags[s]);
ok(missing.length === 0, `ทุกรายงานมี tag (ขาด ${missing.length}: ${missing.slice(0, 5).join(', ')})`);

const orphans = Object.keys(data.tags).filter((s) => !symSet.has(s));
ok(orphans.length === 0, `ไม่มี entry ค้างของหุ้นที่ลบไปแล้ว (พบ ${orphans.length}: ${orphans.slice(0, 5).join(', ')})`);

const dangling = [];
for (const s of Object.keys(data.tags)) for (const g of data.tags[s]) if (!vocab.bySlug.has(g)) dangling.push(`${s}→${g}`);
ok(dangling.length === 0, `ไม่มี slug ที่หลุดจากคลัง (พบ ${dangling.length}: ${dangling.slice(0, 5).join(', ')})`);

const assignErrs = [];
for (const s of Object.keys(data.tags)) assignErrs.push(...T.validateAssignment(s, data.tags[s], vocab));
ok(assignErrs.length === 0, `ทุกหุ้นมี 1–3 tag ไม่ซ้ำ (พบ ${assignErrs.length}: ${assignErrs[0] || ''})`);

// key ต้องไม่เป็นชื่อเก่าที่ย้ายไปแล้วตาม symbol-map (จับ rename ที่ลืมย้าย key)
{
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'symbol-map.json'), 'utf8')); } catch {}
  const stale = Object.keys(data.tags).filter((s) => map[s] && !symSet.has(s));
  ok(stale.length === 0, `ไม่มี key ที่เป็นชื่อเก่าใน symbol-map (พบ ${stale.join(', ')})`);
}

// ── D) warning ระดับคลัง ──
const members = T.membersOf(data);
const thin = [...members].filter(([, a]) => a.length < T.MIN_MEMBERS);
if (thin.length) console.log(`  ⚠ tag ที่มีสมาชิก <${T.MIN_MEMBERS}: ${thin.map(([k, a]) => k + '(' + a.length + ')').join(', ')}`);
const unused = vocab.list.filter((e) => !members.has(e.slug)).map((e) => e.slug);
if (unused.length) console.log(`  ⚠ slug ในคลังที่ไม่มีใครใช้: ${unused.join(', ')}`);
if (data.vocabVersion < vocab.version) console.log(`  ⚠ vocabVersion ${data.vocabVersion} < คลัง ${vocab.version} — ยังไม่ backfill slug ใหม่`);
if (data.requests.length) console.log(`  ⚠ คิวขอคำศัพท์รอรีวิว ${data.requests.length} รายการ`);

console.log('\n' + '─'.repeat(50));
console.log(`tags-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ ข้อมูล tag มีปัญหา\n'); process.exit(1); }
console.log('\n✅ ข้อมูล tag ถูกต้อง\n'); process.exit(0);
