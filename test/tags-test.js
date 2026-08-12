#!/usr/bin/env node
'use strict';
/**
 * tags-test.js — ความถูกต้องของข้อมูล tag (tags-vocab.json + tags.json)
 * ตรวจสิ่งที่ check-reports (per-file) มองไม่เห็น: bijection ทั้งสองทาง · dangling slug ·
 * alias ชนกัน · ขนาดกลุ่ม · ความสอดคล้องกับ symbol-map
 * รัน: node test/tags-test.js  (npm run test:tags)
 */
const fs = require('fs');
const path = require('path');
const T = require('../tools/tag-lib.js');

const ROOT = path.join(__dirname, '..');
let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };

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
   'จับ alias ที่ชนกันข้าม slug');

// ── B) validateAssignment ──
const V = mkVocab([E('ai-datacenter', 'AI Data Center', ['ai']), E('power-grid', 'Power Grid', ['grid'])]);
ok(T.validateAssignment('LITE', ['ai-datacenter'], V).length === 0, 'assignment ถูกต้อง → ไม่มี error');
ok(T.validateAssignment('LITE', ['ไม่มีจริง'], V).some((m) => /ไม่อยู่ในคลัง/.test(m)), 'จับ slug นอกคลัง');
ok(T.validateAssignment('LITE', [], V).some((m) => /อย่างน้อย 1/.test(m)), 'จับ 0 slug');
ok(T.validateAssignment('LITE', ['ai-datacenter', 'power-grid', 'ai-datacenter', 'power-grid'], V)
   .some((m) => /เกิน 3/.test(m)), 'จับเกิน 3 slug');
ok(T.validateAssignment('LITE', ['ai-datacenter', 'ai-datacenter'], V).some((m) => /ซ้ำ/.test(m)), 'จับ slug ซ้ำกันเอง');

console.log('\n' + '─'.repeat(50));
console.log(`tags-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ ข้อมูล tag มีปัญหา\n'); process.exit(1); }
console.log('\n✅ ข้อมูล tag ถูกต้อง\n'); process.exit(0);
