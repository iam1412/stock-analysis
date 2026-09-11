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

// ── 1) footer-date: อ่าน "ข้อมูล ณ" ใน <footer> (พ.ศ./ค.ศ. · ย่อ/เต็ม) — ความสดต้องอ่านจาก footer ไม่ใช่ reports.json.updated (C15) ──
{
  const F = require('../tools/queue/footer-date.js');
  const wrap = (s) => `<body><p>ข้อมูล ณ FY2568 ในเนื้อหา</p><footer>สรุป · ข้อมูล ณ ${s} • ที่มา</footer></body>`;
  ok(F.footerDate(wrap('10 ก.ย. 2569')).iso === '2026-09-10' && F.footerDate(wrap('10 ก.ย. 2569')).era === 'BE', 'footerDate: พ.ศ. ย่อ');
  ok(F.footerDate(wrap('1 มกราคม 2026')).iso === '2026-01-01' && F.footerDate(wrap('1 มกราคม 2026')).era === 'CE', 'footerDate: ค.ศ. เต็ม');
  ok(F.footerDate(wrap('วันที่ 5 มิ.ย. 2569')).iso === '2026-06-05', 'footerDate: มีคำว่า "วันที่"');
  ok(F.footerDate('<footer>ไม่มีวันที่</footer>') === null && F.footerDate('<p>ข้อมูล ณ 1 ม.ค. 2569</p>') === null, 'footerDate: ไม่มี footer/ไม่มีวันที่ใน footer → null (ไม่หยิบจากเนื้อหา)');
  ok(F.ageDays('2026-09-01', '2026-09-11') === 10, 'ageDays: 10 วัน');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(F.todayBangkok()), 'todayBangkok: รูป ISO');
}

// ── 2) market: ตลาดเปิดอยู่ไหม (Intl + timeZone — ไม่คิด DST เอง) · --force ข้ามguard intraday ของ update-prices จึงต้องเช็คก่อน ──
{
  const M = require('../tools/queue/market.js');
  ok(M.usSessionOpen(new Date('2026-09-10T15:00:00Z')) === true, 'us: พฤ 11:00 EDT → เปิด');
  ok(M.usSessionOpen(new Date('2026-01-15T15:00:00Z')) === true, 'us: พฤ 10:00 EST (ฤดูหนาว) → เปิด');
  ok(M.usSessionOpen(new Date('2026-09-10T21:00:00Z')) === false, 'us: 17:00 EDT → ปิด');
  ok(M.usSessionOpen(new Date('2026-09-12T15:00:00Z')) === false, 'us: เสาร์ → ปิด');
  ok(M.setSessionOpen(new Date('2026-09-10T04:00:00Z')) === true && M.setSessionOpen(new Date('2026-09-10T10:00:00Z')) === false, 'set: 11:00 ICT เปิด · 17:00 ปิด');
}

// ── 3) triage: ครบทุก reason ที่ cron/canary เขียนได้ (C14 — เดิม 2 reason ไม่มีกฎที่ไหนเลย) ──
{
  const T = require('../tools/queue/triage.js');
  const want = { 'mos-sign-flip': 'LIGHT', 'drift-gt-15pct': 'LIGHT', 'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL', 'fetch-failed': 'PLUMBING', 'patch-failed': 'PLUMBING', 'no-stock-meta': 'PLUMBING', 'currency-mismatch': 'PLUMBING', 'bad-price': 'PLUMBING', 'bad-report-price': 'PLUMBING', 'patch-rejected': 'REJECTED', 'not-on-exchange': 'DELIST' };
  for (const [r, b] of Object.entries(want)) ok(T.bucketOf(r) === b, `bucketOf(${r}) = ${b}`, T.bucketOf(r));
  ok(T.bucketOf('drift-gt-10pct') === 'LIGHT' && T.bucketOf('อะไรก็ไม่รู้') === 'UNKNOWN', 'bucketOf: drift เกณฑ์อื่น = LIGHT · ไม่รู้จัก = UNKNOWN');
  const flags = [{ symbol: 'A', reason: 'mos-sign-flip' }, { symbol: 'B', reason: 'mos-sign-flip' }, { symbol: 'C', reason: 'not-on-exchange' }, { symbol: 'D', reason: 'suspect-split-or-data' }];
  const rows = T.triage(flags, { footerAgeOf: (s) => ({ A: 3, B: 40, C: 10, D: null })[s] });
  ok(rows[0].skip && /สด/.test(rows[0].skip) && !rows[1].skip, 'triage: LIGHT ที่ footer ≤7 วัน = ข้าม (ไม่วิเคราะห์ซ้ำ) · เกิน 7 = ทำ');
  ok(rows.every((r) => r.action && r.bucket), 'triage: ทุกแถวมี bucket + action');
  ok(T.prePatchList(rows).join(',') === 'B,D', 'prePatchList: เฉพาะ LIGHT/FULL ที่ไม่ข้าม (ไม่ pre-patch DELIST/PLUMBING)');
}

// ── 4) state: อ่าน/เขียน/update ใต้ QUEUE_DIR ชั่วคราว ──
{
  const S = require('../tools/queue/state.js');
  ok(S.load().stocks && Object.keys(S.load().stocks).length === 0, 'state: ไม่มีไฟล์ = ว่าง');
  S.update('AAA', { bucket: 'LIGHT', oldPrice: 10 });
  S.update('AAA', { prepAt: '2026-09-11' });
  const s = S.load();
  ok(s.stocks.AAA.bucket === 'LIGHT' && s.stocks.AAA.oldPrice === 10 && s.stocks.AAA.prepAt === '2026-09-11', 'state.update: merge field ไม่ทับของเดิม');
  ok(fs.existsSync(S.PREP_DIR) && S.FILE.startsWith(process.env.QUEUE_DIR), 'state: สร้าง prep/ ใต้ QUEUE_DIR');
}

// ── 5) sh: run ไม่ throw · must throw พร้อม exit code ──
{
  const sh = require('../tools/queue/sh.js');
  ok(sh.run('node', ['-e', 'process.exit(3)']).code === 3, 'sh.run: คืน exit code ไม่ throw');
  let threw = null; try { sh.must('node', ['-e', 'console.error("boom");process.exit(2)'], 'ทดสอบ'); } catch (e) { threw = e; }
  ok(threw && /ทดสอบ ล้ม \(exit 2\)/.test(threw.message) && /boom/.test(threw.message), 'sh.must: throw พร้อมชื่อขั้น + exit + stderr');
}

// ── 6) preflight (ส่วนบริสุทธิ์): เลือกตัวที่จะ pre-patch ตามตลาดที่เปิด · ตาราง · ขั้นที่ต้องทำเอง ──
{
  const P = require('../tools/queue/preflight.js');
  const rows = [
    { symbol: 'US1', reason: 'mos-sign-flip', bucket: 'LIGHT', currency: 'USD', action: 'x', skip: null, reportPrice: 10, marketPrice: 11, diffPct: 10, flaggedAt: '2026-09-01', footerAge: 30 },
    { symbol: 'TH1', reason: 'drift-gt-15pct', bucket: 'LIGHT', currency: 'THB', action: 'x', skip: null },
    { symbol: 'US2', reason: 'not-on-exchange', bucket: 'DELIST', currency: 'USD', action: 'x', skip: null },
    { symbol: 'US3', reason: 'mos-sign-flip', bucket: 'LIGHT', currency: 'USD', action: 'x', skip: 'สด' },
    { symbol: 'US4', reason: 'fetch-failed', bucket: 'PLUMBING', currency: 'USD', action: 'x', skip: null },
  ];
  const t1 = P.patchTargets(rows, { usOpen: false, setOpen: false, allowIntraday: false });
  ok(t1.target.join(',') === 'US1,TH1' && !t1.skippedUS.length, 'patchTargets: ตลาดปิดหมด → LIGHT/FULL ที่ไม่ข้ามทั้งหมด');
  const t2 = P.patchTargets(rows, { usOpen: true, setOpen: false, allowIntraday: false });
  ok(t2.target.join(',') === 'TH1' && t2.skippedUS.join(',') === 'US1', 'patchTargets: US เปิด → ข้าม US (--force ข้าม guard intraday เอง)');
  const t3 = P.patchTargets(rows, { usOpen: true, setOpen: true, allowIntraday: true });
  ok(t3.target.join(',') === 'US1,TH1', 'patchTargets: --allow-intraday → ไม่ข้าม');
  const table = P.renderTable(rows);
  ok(/US1/.test(table) && /10→11/.test(table) && /30d/.test(table) && table.split('\n').length === rows.length + 1, 'renderTable: 1 แถว/flag + หัวตาราง');
  const man = P.manualSteps(rows);
  ok(/probe โมเดล/.test(man) && /US2/.test(man) && /US4\[fetch-failed\]/.test(man) && /prep <SYM>/.test(man), 'manualSteps: probe · DELIST · PLUMBING · ขั้นถัดไป');
  ok(man.split('\n').filter((l) => /^\d+\./.test(l)).length <= 5, 'manualSteps: ขั้นที่ต้องทำเอง ≤5 (KPI ระยะ 0)');
}

// ─────────────────────────── (Task 10–14 แทรกเทสเหนือบรรทัดนี้) ───────────────────────────
console.log(`queue-test: ${nOK}/${nOK + nFail} ผ่าน`);
if (nFail) { console.log('❌ runbook มีบั๊ก'); process.exit(1); }
process.exit(0);
