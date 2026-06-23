#!/usr/bin/env node
'use strict';

/**
 * build-test.js — unit test ของพฤติกรรม build.js เรื่อง "เครดิตโมเดล AI" + freshHash
 * (สิ่งที่ check-reports ตรวจ source / check-site ตรวจ dist มองไม่เห็นระดับฟังก์ชัน)
 *
 * ครอบ:
 *   - freshHash         : meta ai-model ถูกตัดออกจาก hash → เปลี่ยน/เพิ่มโมเดลแล้ว "อัปเดตล่าสุด" ไม่ขยับ
 *                         แต่เนื้อหาวิเคราะห์จริงเปลี่ยน → hash ต้องเปลี่ยน
 *   - extractMeta       : อ่าน aiModel จาก <meta name="ai-model"> (null เมื่อไม่มี)
 *   - injectModelCredit : แทน "สร้างด้วย stock-analyzer workflow" → เครดิตโมเดล + fallback ผนวกท้าย <footer>
 *   - decorateReport    : per-report model ไหลจาก meta → footer ถูกตัว, ไม่เหลือ workflow text, ตกลงค่ากลางได้
 *
 * รัน: node test/build-test.js   (npm run test:build) — require build.js แบบไม่รัน build จริง (guard ใน build.js)
 * exit 0 = ผ่าน, 1 = build.js มีพฤติกรรมผิด
 */

const b = require('../build.js');

let n = 0, fails = 0;
const ok = (cond, desc) => { n++; if (cond) console.log('  ✓ ' + desc); else { console.log('  ✗ ' + desc); fails++; } };
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

console.log('\n🧪 build-test: เครดิตโมเดล AI + freshHash\n');

// fixture HTML ขั้นต่ำ (มี/ไม่มี meta ai-model, footer แบบ workflow text)
const WF = 'Stock Analysis Dashboard • ข้อมูล ณ 1 ม.ค. 2026 • สร้างด้วย stock-analyzer workflow';
const doc = (model, footer) =>
  `<!DOCTYPE html><html lang="th"><head><title>X (X)</title>` +
  (model ? `\n<meta name="ai-model" content="${model}">` : '') +
  `</head><body><h1>X</h1><footer>${footer}</footer></body></html>`;

const withOpus = doc('Claude Opus 4.8', WF);
const withSonnet = doc('Claude Sonnet 4.6', WF);
const noTag = doc(null, WF);

// ── freshHash: ประทับ/เปลี่ยนโมเดล = metadata ไม่นับเป็นอัปเดต ──
ok(b.freshHash(withOpus) === b.freshHash(withSonnet), 'freshHash: เปลี่ยนรุ่นโมเดล (Opus↔Sonnet) → hash เท่าเดิม (วันที่ไม่ขยับ)');
ok(b.freshHash(withOpus) === b.freshHash(noTag), 'freshHash: มี/ไม่มี meta ai-model → hash เท่าเดิม');
ok(b.freshHash(withOpus) !== b.freshHash(doc('Claude Opus 4.8', WF + ' EXTRA')), 'freshHash: เนื้อหาวิเคราะห์จริงเปลี่ยน → hash เปลี่ยน (ยังจับการอัปเดตได้)');

// ── extractMeta: อ่านโมเดลจาก tag ──
ok(b.extractMeta(withOpus, 'X').aiModel === 'Claude Opus 4.8', 'extractMeta: อ่าน aiModel จาก meta tag');
ok(b.extractMeta(noTag, 'X').aiModel === null, 'extractMeta: ไม่มี tag → aiModel = null');

// ── injectModelCredit: replace + fallback ──
const repl = b.injectModelCredit(withOpus, 'Claude Opus 4.8');
ok(!/สร้างด้วย\s*stock-analyzer\s*workflow/.test(repl), 'injectModelCredit: ลบข้อความ "stock-analyzer workflow" เดิม');
ok(/Claude Opus 4\.8/.test(repl) && /Anthropic/.test(repl), 'injectModelCredit: ใส่เครดิตโมเดล + Anthropic แทนที่');
const fb = b.injectModelCredit(doc('Claude Opus 4.8', 'footer ธรรมดาไม่มี workflow text'), 'Claude Sonnet 4.6');
ok(/Claude Sonnet 4\.6/.test(fb) && /<\/footer>/.test(fb), 'injectModelCredit: fallback ผนวกเครดิตเข้า <footer> เมื่อไม่มีข้อความเดิม');

// ── decorateReport: per-report model end-to-end ──
const rec = (html, s) => ({ symbol: s, file: s + '.html', ...b.extractMeta(html, s), updated: '2026-01-01T00:00:00Z', hash: 'x' });
const decOpus = b.decorateReport(withOpus, rec(withOpus, 'X'));
ok(/🤖[^<]*<b>Claude Opus 4\.8<\/b>\s*·\s*Anthropic/.test(decOpus), 'decorateReport: footer โชว์โมเดลของ report (Opus)');
ok(!/สร้างด้วย\s*stock-analyzer\s*workflow/.test(decOpus), 'decorateReport: ไม่เหลือ workflow text ใน output');
ok(/<b>Claude Sonnet 4\.6<\/b>/.test(b.decorateReport(withSonnet, rec(withSonnet, 'Y'))), 'decorateReport: per-report — report tag=Sonnet → footer=Sonnet (ไม่ใช่ค่ากลาง)');
ok(new RegExp('<b>' + reEsc(b.AI_MODEL) + '</b>').test(b.decorateReport(noTag, rec(noTag, 'Z'))), `decorateReport: ไม่มี tag → ใช้ค่ากลาง AI_MODEL (${b.AI_MODEL})`);

console.log('\n' + '─'.repeat(50));
console.log(`build-test: ${n - fails}/${n} ผ่าน`);
if (fails) { console.log('\n❌ build.js มีพฤติกรรมผิด — แก้ build.js ก่อน push\n'); process.exit(1); }
console.log('\n✅ build.js เครดิตโมเดล + freshHash ถูกต้อง\n'); process.exit(0);
