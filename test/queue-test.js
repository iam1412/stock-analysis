#!/usr/bin/env node
'use strict';
/**
 * queue-test.js — unit-test ของ runbook เคลียร์คิว (tools/queue.js + tools/queue/*) แบบ offline
 * + เทสความสอดคล้อง "ลำดับขั้น verify" ระหว่าง package.json กับ .githooks/pre-push (เดิมพิมพ์มือสองที่ — code-audit §3.1)
 * ★ ทุกเทสในไฟล์นี้ห้ามยิง network / ห้ามอ่าน reports/ (ใช้ test/fixtures + ข้อความจำลอง)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

let nOK = 0, nFail = 0;
function ok(cond, label, detail) {
  if (cond) { nOK++; return; }
  nFail++;
  console.error(`✗ ${label}${detail ? ' — ' + detail : ''}`);
}
const ROOT = path.join(__dirname, '..');
process.env.QUEUE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-'));   // state.js อ่านตอน require — ต้องตั้งก่อน require ทุก module ใน tools/queue

// ── 0) verify: package.json ↔ .githooks/pre-push ต้องเป็นลำดับเดียวกัน และป้าย N/N ตรงจำนวนจริง ──
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const steps = pkg.scripts.verify.split('&&').map((s) => s.trim().replace(/^node /, ''));
  const hook = fs.readFileSync(path.join(ROOT, '.githooks', 'pre-push'), 'utf8');
  const hookSteps = [...hook.matchAll(/^node (\S+)/gm)].map((m) => m[1]);
  ok(steps.length === hookSteps.length && steps.every((s, i) => s === hookSteps[i]), 'verify: ลำดับขั้นใน package.json = .githooks/pre-push', `pkg=${steps.join(' ')} · hook=${hookSteps.join(' ')}`);
  const n = steps.length;
  const labels = [...hook.matchAll(/pre-push (\d+)\/(\d+):/g)];
  ok(labels.length === n && labels.every((m, i) => +m[1] === i + 1 && +m[2] === n), 'verify: ป้าย i/N ใน pre-push ไล่เลขถูกและ N = จำนวนขั้นจริง', `n=${n} labels=${labels.map((m) => m[1] + '/' + m[2]).join(' ')}`);
  ok(steps.includes('test/queue-test.js'), 'verify: มี test/queue-test.js อยู่ในชุด');
}

// ─────────────────────────── (Task 10–14 แทรกเทสเหนือบรรทัดนี้) ───────────────────────────
console.log(`queue-test: ${nOK}/${nOK + nFail} ผ่าน`);
if (nFail) { console.log('❌ runbook มีบั๊ก'); process.exit(1); }
process.exit(0);
