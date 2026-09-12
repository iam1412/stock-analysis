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

// ── 0b) verify:cron (ประตู cron · spec WS2 ข้อ 2) ⊂ verify เต็ม ลำดับเดิม · cron ใช้ตัวนี้ ──
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const full = pkg.scripts.verify.split('&&').map((s) => s.trim());
  const cron = String(pkg.scripts['verify:cron'] || '').split('&&').map((s) => s.trim()).filter(Boolean);
  ok(cron.length === 5, 'verify:cron: 5 ขั้น (check-reports · build · build-test · engine-exec · check-site)', pkg.scripts['verify:cron']);
  ok(cron.every((s) => full.includes(s)), 'verify:cron: ทุกขั้นอยู่ใน verify เต็ม', cron.filter((s) => !full.includes(s)).join(' '));
  const idx = cron.map((s) => full.indexOf(s));
  ok(idx.every((v, i) => i === 0 || v > idx[i - 1]), 'verify:cron: ลำดับเดียวกับ verify เต็ม');
  for (const must of ['node test/check-reports.js', 'node build.js', 'node test/build-test.js', 'node test/engine-exec.js', 'node test/check-site.js'])
    ok(cron.includes(must), `verify:cron: มี ${must}`);
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'update-prices.yml'), 'utf8');
  ok(/run:\s*npm run verify:cron\s*$/m.test(yml) && !/run:\s*npm run verify\s*$/m.test(yml), 'update-prices.yml: รัน verify:cron (ไม่ใช่ verify เต็ม)');
}

// ── 1) footer-date: อ่าน "ข้อมูล ณ" ใน <footer> (พ.ศ./ค.ศ. · ย่อ/เต็ม) — ความสดต้องอ่านจาก footer ไม่ใช่ reports.json.updated (C15) ──
{
  const F = require('../tools/queue/footer-date.js');
  const wrap = (s) => `<body><p>ข้อมูล ณ FY2568 ในเนื้อหา</p><footer>สรุป · ข้อมูล ณ ${s} • ที่มา</footer></body>`;
  ok(F.footerDate(wrap('10 ก.ย. 2569')).iso === '2026-09-10' && F.footerDate(wrap('10 ก.ย. 2569')).era === 'BE', 'footerDate: พ.ศ. ย่อ');
  ok(F.footerDate(wrap('1 มกราคม 2026')).iso === '2026-01-01' && F.footerDate(wrap('1 มกราคม 2026')).era === 'CE', 'footerDate: ค.ศ. เต็ม');
  ok(F.footerDate(wrap('วันที่ 5 มิ.ย. 2569')).iso === '2026-06-05', 'footerDate: มีคำว่า "วันที่"');
  ok(F.footerDate(wrap('22–23 มิ.ย. 2569')).iso === '2026-06-22' && F.footerDate(wrap('22–23 มิ.ย. 2569')).era === 'BE', 'footerDate: ช่วงวัน (en dash) ใช้วันแรก (31 ใบในคลัง)');
  ok(F.footerDate(wrap('22-23 มิ.ย. 2026')).iso === '2026-06-22' && F.footerDate(wrap('22-23 มิ.ย. 2026')).era === 'CE', 'footerDate: ช่วงวัน (ASCII hyphen) ใช้วันแรก');
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

// ── 3) triage: ครบทุก reason ที่ cron/canary/preflight เขียนได้ · flip = PREPATCH ไม่ส่ง LLM (ข้อ D) ──
{
  const T = require('../tools/queue/triage.js');
  const want = { 'mos-sign-flip': 'PREPATCH', 'drift-gt-15pct': 'LIGHT', 'age-gt-90d': 'LIGHT', 'earnings-after-analysis': 'LIGHT', 'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL', 'fetch-failed': 'PLUMBING', 'patch-failed': 'PLUMBING', 'no-stock-meta': 'PLUMBING', 'currency-mismatch': 'PLUMBING', 'bad-price': 'PLUMBING', 'bad-report-price': 'PLUMBING', 'patch-rejected': 'REJECTED', 'not-on-exchange': 'DELIST' };
  for (const [r, b] of Object.entries(want)) ok(T.bucketOf(r) === b, `bucketOf(${r}) = ${b}`, T.bucketOf(r));
  ok(T.bucketOf('drift-gt-10pct') === 'LIGHT' && T.bucketOf('อะไรก็ไม่รู้') === 'UNKNOWN', 'bucketOf: drift เกณฑ์อื่น = LIGHT · ไม่รู้จัก = UNKNOWN');
  const flags = [{ symbol: 'A', reason: 'mos-sign-flip' }, { symbol: 'B', reason: 'mos-sign-flip' }, { symbol: 'C', reason: 'not-on-exchange' }, { symbol: 'D', reason: 'suspect-split-or-data' }, { symbol: 'E', reason: 'mos-sign-flip' }, { symbol: 'F', reason: 'mos-sign-flip' }, { symbol: 'G', reason: 'drift-gt-15pct' }];
  const rows = T.triage(flags, { footerAgeOf: (s) => ({ A: 3, B: 40, C: 10, D: null, E: 120, F: 30, G: 3 })[s], earningsAfterOf: (s) => s === 'F' });
  const by = Object.fromEntries(rows.map((r) => [r.symbol, r]));
  ok(by.A.bucket === 'PREPATCH' && !by.A.skip && by.A.escalated === null && by.B.bucket === 'PREPATCH', 'flip อายุปกติ → PREPATCH (ไม่ skip — patch ราคาไม่มีโทษ)');
  ok(by.E.bucket === 'LIGHT' && by.E.escalated === 'age' && /90/.test(by.E.action), 'flip อายุ 120 วัน → ยกเป็น LIGHT (age)');
  ok(by.F.bucket === 'LIGHT' && by.F.escalated === 'earnings', 'flip + งบออกหลังวิเคราะห์ → ยกเป็น LIGHT (earnings)');
  ok(by.G.skip && /สด/.test(by.G.skip), 'LIGHT ที่ footer ≤7 วัน = ข้าม (เดิม)');
  ok(rows.every((r) => r.action && r.bucket), 'triage: ทุกแถวมี bucket + action');
  ok(T.prePatchList(rows).join(',') === 'A,B,D,E,F', 'prePatchList: PREPATCH ทุกแถว (ไม่สน skip — patch ราคาไม่มีโทษ) + LIGHT/FULL ที่ไม่ skip · ไม่รวม DELIST', T.prePatchList(rows).join(','));
  ok(T.llmList(rows).join(',') === 'D,E,F', 'llmList: เฉพาะ LIGHT/FULL ที่ไม่ skip (flip ธรรมดาไม่อยู่)', T.llmList(rows).join(','));
  ok(T.STALE_DAYS === 90, 'STALE_DAYS = 90 (WS6 ข้อ 3: >1 ไตรมาส)');
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
  const t4 = P.patchTargets(rows.concat([{ symbol: 'GONE', reason: 'mos-sign-flip', bucket: 'LIGHT', currency: null, action: 'x', skip: null }]), { usOpen: false, setOpen: false, allowIntraday: false });
  ok(t4.skippedNoReport.join(',') === 'GONE' && !t4.target.includes('GONE'), 'patchTargets: ไม่มีไฟล์รายงาน (currency null) → ไม่เข้า batch pre-patch');
  const table = P.renderTable(rows);
  ok(/US1/.test(table) && /10→11/.test(table) && /30d/.test(table) && table.split('\n').length === rows.length + 1, 'renderTable: 1 แถว/flag + หัวตาราง');
  const man = P.manualSteps(rows);
  ok(/probe โมเดล/.test(man) && /US2/.test(man) && /US4\[fetch-failed\]/.test(man) && /prep <SYM>/.test(man), 'manualSteps: probe · DELIST · PLUMBING · ขั้นถัดไป');
  ok(man.split('\n').filter((l) => /^\d+\./.test(l)).length <= 5, 'manualSteps: ขั้นที่ต้องทำเอง ≤5 (KPI ระยะ 0)');

  // renderTable: คอลัมน์ "ที่มา" ใหม่ — synthetic (age-gt-90d) = "อายุ" · escalated (flip ยกจาก PREPATCH) = ป้าย escalated · ปกติ = "flag"
  const table2 = P.renderTable([
    { symbol: 'AGE1', reason: 'age-gt-90d', synthetic: true, bucket: 'LIGHT', action: 'x', skip: null },
    { symbol: 'ESC1', reason: 'mos-sign-flip', escalated: 'age', bucket: 'LIGHT', action: 'x', skip: null },
    { symbol: 'FLG1', reason: 'drift-gt-15pct', bucket: 'LIGHT', action: 'x', skip: null },
  ]);
  const l2 = table2.split('\n');
  ok(/อายุ/.test(l2.find((l) => l.startsWith('AGE1'))), 'renderTable: คอลัมน์ที่มา = "อายุ" สำหรับแถวสังเคราะห์ age-gt-90d', table2);
  ok(/\bage\b/.test(l2.find((l) => l.startsWith('ESC1'))), 'renderTable: คอลัมน์ที่มา = escalated label สำหรับแถวที่ยกจาก PREPATCH', table2);
  ok(/\bflag\b/.test(l2.find((l) => l.startsWith('FLG1'))), 'renderTable: คอลัมน์ที่มา = "flag" สำหรับแถวปกติ', table2);
}

// ── 6b) preflight: plan/ageQueue — คิวตามอายุ (WS6 ข้อ 3): ใบเกิน 90 วันเข้าคิวเองแม้ราคาไม่ขยับ · ทยอย ageLimit ตัว แก่สุดก่อน · ไม่ซ้ำกับที่ flag อยู่ ──
{
  const P = require('../tools/queue/preflight.js');
  const ages = { OLD1: 200, OLD2: 150, OLD3: 95, MID: 60, FLAGGED: 300 };
  const rows = P.plan([{ symbol: 'FLAGGED', reason: 'drift-gt-15pct' }], '2026-09-12', { ageLimit: 2, listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] });
  const syn = rows.filter((r) => r.synthetic);
  ok(syn.map((r) => r.symbol).join(',') === 'OLD1,OLD2' && syn.every((r) => r.reason === 'age-gt-90d' && r.bucket === 'LIGHT'), 'plan: แถวอายุสังเคราะห์ 2 ตัวแก่สุด (ไม่รวม FLAGGED ที่มี flag อยู่แล้ว · MID ไม่ถึง 90)', syn.map((r) => r.symbol).join(','));
  ok(P.ageQueue('2026-09-12', { listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] }).length === 4, 'ageQueue: นับทุกใบเกิน 90 วัน (4) ก่อนตัด');
  ok(P.plan([], '2026-09-12', { ageLimit: 0, listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] }).length === 0, 'plan: --no-age (ageLimit 0) ไม่เพิ่มแถว');
  // ageQueue: แก่สุดก่อนเสมอ (sort desc) — ยืนยันลำดับตรง ไม่ใช่แค่จำนวน
  const aqAll = P.ageQueue('2026-09-12', { listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] });
  ok(aqAll.map((r) => r.symbol).join(',') === 'FLAGGED,OLD1,OLD2,OLD3', 'ageQueue: เรียงแก่สุดก่อน (ไม่ตัดที่ ageLimit)', aqAll.map((r) => r.symbol).join(','));
  // plan: ageLimit default (ไม่ใส่ opts.ageLimit) = 5
  const rowsDefault = P.plan([], '2026-09-12', { listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] });
  ok(rowsDefault.filter((r) => r.synthetic).length === 4, 'plan: ไม่ใส่ ageLimit → default 5 (มีแค่ 4 ใบเกิน 90 วันอยู่แล้วเลยได้ครบ)', String(rowsDefault.length));
}

// ── 7) prep (ส่วนบริสุทธิ์): parseVendor · snapshotDiff · assemblePrompt · hardStock ──
{
  const Pp = require('../tools/queue/prep.js');
  const FX = require('./fixtures');
  const { expandReport } = require('../build.js');
  const { buildCtx } = require('./check-reports.js');
  const PREP_OUT = `=== PREP AAPL (UPDATE) — วางทั้ง block ลง {{FUNDAMENTALS}} ===
✅ ราคา 2 แหล่งต่าง 0.12% (≤2%) — ผ่าน
⚠ EPS(TTM) ต่าง 3.4% (>2%) — ขัดกัน

=== FUNDAMENTALS AAPL (US) — 2 แหล่งอิสระสำหรับ cross-verify (SKILL STEP 2) ===
[1] Yahoo quoteSummary (AAPL):
    price=301.5 epsTTM=7.12 epsFwd=8.01 PE=42.3 fwdPE=37.6 divYield=0.35% target=310.5 (n=38) 52wk=223.78–344.57 ROE=150.2%
[2] StockAnalysis (quote/aapl):
    price=301.5 (ณ Sep 10) epsTTM=7.36 PE=41 fwdPE=37.6 div=1.04 (yield=0.35) target=312 (41) 52wk=224–344.6 earnings=Oct 30
Δ ราคา=0.12% · Δ EPS(TTM)=3.4% — เกณฑ์`;
  const v = Pp.parseVendor(PREP_OUT);
  ok(v.epsTTM === 7.36 && v.target === 312 && v.analysts === 41 && v.lo52 === 224 && v.hi52 === 344.6, 'parseVendor: ใช้ StockAnalysis ก่อน', JSON.stringify(v));
  ok(Math.abs(v.divYieldPct - 0.35) < 1e-9 && v.priceWarn === false && v.priceStop === false, 'parseVendor: yield เป็น % · ธง ราคาขัด');
  const vy = Pp.parseVendor(PREP_OUT.replace(/\[2\] StockAnalysis[^\n]*\n[^\n]*\n/, ''));
  ok(vy.epsTTM === 7.12 && vy.analysts === 38 && Math.abs(vy.divYieldPct - 0.35) < 1e-9, 'parseVendor: ไม่มี SA → ถอยไป Yahoo');
  // ★ บล็อกจริงจาก `node tools/prep-stock.js KLAC --update` (12 ก.ย. 69) — คัดลอกมาทั้งบรรทัด:
  //   `fmt()` ของ fetch-fundamentals ปล่อยค่าที่ไม่ใช่ตัวเลขผ่านมาดิบ ๆ ⇒ SA ส่งสตริงแสดงผลรวม
  //   (`$0.92 (0.51%)` · `233.77 (+28.52%) (Buy)`) ไม่ใช่ตัวเลขล้วนอย่างที่ brief เดาไว้
  const REAL = `[1] Yahoo quoteSummary (KLAC):
    price=181.87 epsTTM=3.67 epsFwd=6.71 PE=49.6 fwdPE=27.1 divYield=0.52% target=233.77 (n=26) 52wk=95.5–307.37 ROE=87.5%
[2] StockAnalysis (stocks/KLAC):
    price=181.9 (ณ Sep 11, 2026, 1:14 PM EDT) epsTTM=3.66 PE=48.41 fwdPE=32.48 div=$0.92 (0.51%) target=233.77 (+28.52%) (Buy) 52wk=93.75–307.37 earnings=Oct 28, 2026
    ปันผล reconcile: dps 0.92 ÷ ราคา 181.9 = 0.51% (vendor: Yahoo=0.52%) — ✅ ตรงกับ vendor`;
  const vr = Pp.parseVendor(REAL);
  ok(vr.epsTTM === 3.66 && vr.target === 233.77 && vr.lo52 === 93.75 && vr.hi52 === 307.37 && Math.abs(vr.divYieldPct - 0.51) < 1e-9,
    'parseVendor: รูปแบบ SA จริง (สัญลักษณ์สกุล + วงเล็บต่อท้าย) → ค่ามาจาก SA ไม่ใช่ Yahoo (Yahoo = 3.67/95.5/0.52)', JSON.stringify(vr));
  ok(vr.analysts === 26, 'parseVendor: SA ส่ง (Buy) ไม่ใช่จำนวนนักวิเคราะห์ → analysts ถอยไป n= ของ Yahoo');
  ok(Pp.parseVendor(REAL.replace(/\[1\] Yahoo[^\n]*\n[^\n]*\n/, '')).analysts === null,
    'parseVendor: มีแต่ SA → analysts = null (ห้ามอ่าน (+28.52%) หรือ (Buy) เป็นจำนวน)');
  // ★ yield ที่ต่ำกว่า 0.3% เป็นค่าจริง ไม่ใช่สัดส่วนที่ต้องคูณ 100 — ไม่มีแหล่งไหนส่งสัดส่วนเลย
  //   (Yahoo ผ่าน pct() = `N%` · SA พิมพ์ `(N%)`) · 20/908 ใบมีการ์ดปันผลที่ตัดสินได้และต่ำกว่า 0.3
  const LOWY = REAL.replace('divYield=0.52%', 'divYield=0.26%').replace('(0.51%)', '(0.26%)');
  ok(Pp.parseVendor(LOWY).divYieldPct === 0.26, 'parseVendor: yield 0.26% คงค่า 0.26 (ห้ามคูณ 100)', String(Pp.parseVendor(LOWY).divYieldPct));
  ok(Pp.parseVendor(LOWY.replace(/\[2\] StockAnalysis[^\n]*\n[^\n]*\n/, '')).divYieldPct === 0.26, 'parseVendor: yield 0.26% ทาง Yahoo ก็คงค่า');

  const html = FX.AAPL();
  const ctx = buildCtx(expandReport(html), 'AAPL.html');
  const same = Pp.snapshotDiff(html, ctx, { lo52: null, hi52: null, target: null, divYieldPct: null });
  ok(same.every((s) => !/·\s*vendor/.test(s)), 'snapshotDiff: vendor ไม่มีค่า → ไม่ฟ้องส่วนต่าง');
  // ★ เดิมเทสนี้ผ่านแบบว่างเปล่า: fixture AAPL ใช้ถ้อยคำ "ช่วง 52 สัปดาห์" ⇒ บรรทัด "อ่านกรอบ …"
  //   ตอบได้ทั้งสองเงื่อนไขโดยที่เส้นทางเทียบตัวเลขไม่เคยถูกรันเลย — แยกเป็นข้อ ๆ ที่ยืนยันของจริง
  const far = Pp.snapshotDiff(html, ctx, { lo52: 1, hi52: 2, target: 1, analysts: 9, divYieldPct: 9 });
  ok(far.some((s) => /^เป้านักวิเคราะห์/.test(s)), 'snapshotDiff: เป้าในใบต่างจาก vendor → ฟ้อง (คลาสที่ 4 price-derived-staleness)', far.join(' | '));
  ok(far.some((s) => /^ปันผล %/.test(s)), 'snapshotDiff: ปันผล % ในใบต่างจาก vendor → ฟ้อง', far.join(' | '));
  ok(!far.some((s) => /^P\/BV/.test(s)), 'snapshotDiff: fixture AAPL ไม่มีการ์ด P/BV → ไม่มีแถว P/BV', far.join(' | '));
  // เส้นทางเทียบตัวเลข 52wk ต้องมี html ที่ใช้ถ้อยคำ "กรอบ" จริง (fixture ไม่มี)
  const H52 = 'กรอบ 52 สัปดาห์ $100 – $200<br>';
  ok(Pp.snapshotDiff(H52, { px: 0 }, { lo52: 90, hi52: 220 }).some((s) => /^กรอบ 52 สัปดาห์ ใบ 100–200 · vendor 90–220$/.test(s)),
    'snapshotDiff: 52wk ต่างเกิน 3% → ฟ้องพร้อมตัวเลขทั้งสองฝั่ง', Pp.snapshotDiff(H52, { px: 0 }, { lo52: 90, hi52: 220 }).join(' | '));
  ok(!Pp.snapshotDiff(H52, { px: 0 }, { lo52: 100.5, hi52: 199 }).some((s) => /52 สัปดาห์/.test(s)),
    'snapshotDiff: 52wk ต่าง ≤3% → ไม่ฟ้อง (ไม่กวน worker)', Pp.snapshotDiff(H52, { px: 0 }, { lo52: 100.5, hi52: 199 }).join(' | '));

  // ตัวคั่นของ "กรอบ 52 สัปดาห์" ในคลังมีหลายแบบ — regex เดิมรับแค่ en dash (719/908 ใบ) แล้วอีก 77 ใบ
  // ตกไปบรรทัด "อ่านไม่ได้" ทั้งที่มีเลขให้เทียบ · ทุกเคสข้างล่างคัดจากรายงานจริง (A · EOG · CPF)
  const V52 = { lo52: 1, hi52: 2, target: null, divYieldPct: null };
  for (const [why, frag] of [
    ['en dash', 'กรอบ 52 สัปดาห์ $68.42 – $94.66<br>'],
    ['สแลช', 'กรอบ 52 สัปดาห์ $108.35 / $160.27<br>'],
    ['&ndash;', 'กรอบ 52 สัปดาห์ $101.59 &ndash; $151.87<br>'],
    ['วงเล็บครอบ + บาท', 'กรอบ 52 สัปดาห์ (฿18.10–24.70)<br>'],
  ]) ok(Pp.snapshotDiff(frag, { px: 0 }, V52).some((s) => /·\s*vendor/.test(s)), `snapshotDiff: อ่านกรอบ 52 สัปดาห์ได้ (${why})`, Pp.snapshotDiff(frag, { px: 0 }, V52).join(' | '));

  // pbvPlan คืน [{label, items:[{shown}]}] — ถ้าอ่าน pb[0].shown จะได้ undefined แล้วพิมพ์ "P/BV ใบ undefinedx" ใส่ prompt worker
  const noPbv = Pp.snapshotDiff(FX.AAPL(), ctx, { lo52: null, hi52: null, target: null, divYieldPct: null });
  ok(!noPbv.some((s) => /undefined/.test(s)), 'snapshotDiff: ไม่มีคำว่า undefined หลุดเข้า prompt', noPbv.join(' | '));

  const tpl = fs.readFileSync(path.join(ROOT, '_template', 'agent-prompt.md'), 'utf8');
  const p = Pp.assemblePrompt(tpl, { SYMBOL: 'AAPL', MARKET: 'US', MODE: 'UPDATE-LIGHT', WORKTREE: '/wt', CURRENT_TAGS: 'consumer-tech', MEDIANS: '=== ตัวคูณมัธยฐานย้อนหลัง: AAPL ===\n  ★ มัธยฐาน 28.0x', FUNDAMENTALS: PREP_OUT }, Pp.extraBlock({ sym: 'AAPL', mode: 'UPDATE-LIGHT', prePatched: '2026-09-11', oldPrice: 297.21, price: 301.5, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 3.66, snap: ['เป้า ใบ 300 · vendor 312'], medWarn: [], hard: false, hardWhy: '' }));
  // ★ ตรวจ token ค้างบน prompt ที่ "ถอดบล็อก FUNDAMENTALS ออกแล้ว" — ตัว prep-stock เองพิมพ์คำว่า
  //   `{{FUNDAMENTALS}}` ในหัวบล็อก ("วางทั้ง block ลง {{FUNDAMENTALS}}") ⇒ ข้อความที่ถูกแทน *เข้าไป*
  //   มี `{{…}}` ติดมาโดยชอบธรรม · assemblePrompt จึงตรวจ token กับ template ไม่ใช่ผลลัพธ์ (Step 5 ก็ว่า
  //   "ไม่มี {{ ค้าง *นอก* บล็อก FUNDAMENTALS/BRAND")
  const pOutside = p.split(PREP_OUT).join('');
  ok(!/\{\{(SYMBOL|MARKET|MODE|WORKTREE|CURRENT_TAGS|MEDIANS|FUNDAMENTALS)\}\}/.test(pOutside) && /\{\{AI_MODEL\}\}/.test(p), 'assemblePrompt: แทนครบ 7 token · คง {{AI_MODEL}} ให้ worker เติม');
  ok(/บันทึกจาก runbook/.test(p) && /ห้ามรัน update-prices ซ้ำ/.test(p) && /ยกระดับเป็น UPDATE เต็ม/.test(p) && /เป้า ใบ 300/.test(p) && /ห้ามเรียก advisor ตรง/.test(p), 'assemblePrompt: บล็อกท้าย = ราคา patch แล้ว · EPS screen · snapshot · ข้อห้าม');
  // ★ ส่วนเหนือเส้น --- ของ template พูดกับ controller และพิมพ์ token ใน backtick ⇒ ถ้าไม่ตัดก่อนแทน
  //   บล็อกใหญ่สุดสองก้อนจะถูกแปะซ้ำในย่อหน้านั้นด้วย (วัดจริง: FUNDAMENTALS ×2 · MEDIANS ×2 · 144 บรรทัด)
  ok(p.split('=== FUNDAMENTALS').length === 2, 'assemblePrompt: บล็อก FUNDAMENTALS อยู่ในใบเดียว 1 ครั้ง (ไม่ซ้ำในย่อหน้า intro)', `พบ ${p.split('=== FUNDAMENTALS').length - 1} ครั้ง`);
  // MEDIANS วัดจาก "ค่าที่แทนเข้าไป" ไม่ใช่ชื่อบล็อกดิบ ๆ — ตัว template เองมีคำว่า `=== ตัวคูณมัธยฐานย้อนหลัง`
  // อยู่แล้ว 2 ที่โดยตั้งใจ (บรรทัด 24 อ้างถึงในข้อห้ามสมอตาย · บรรทัด 42 เป็นหัว section ที่ครอบ {{MEDIANS}})
  ok(p.split('★ มัธยฐาน 28.0x').length === 2, 'assemblePrompt: ค่า MEDIANS ถูกแทนที่เดียว (ไม่ซ้ำในย่อหน้า intro)', `พบ ${p.split('★ มัธยฐาน 28.0x').length - 1} ครั้ง`);
  ok(!/Controller ใช้แม่แบบนี้/.test(p) && /^วิเคราะห์หุ้น \*\*AAPL\*\*/.test(p), 'assemblePrompt: ตัดคำอธิบายสำหรับ controller ออก — prompt เริ่มที่ "วิเคราะห์หุ้น"');
  let threw = false; try { Pp.assemblePrompt(tpl, { SYMBOL: 'X' }, ''); } catch (_) { threw = true; }
  ok(threw, 'assemblePrompt: ขาด token → throw (ไม่ส่ง prompt ที่มี {{…}} ค้าง)');
  const ALLV = { SYMBOL: 'X', MARKET: 'US', MODE: 'UPDATE', WORKTREE: '/w', CURRENT_TAGS: '', MEDIANS: 'm', FUNDAMENTALS: 'f' };
  let noSep = false; try { Pp.assemblePrompt('ไม่มีเส้นคั่น {{SYMBOL}}', ALLV, ''); } catch (e) { noSep = /ไม่มีเส้นคั่น ---/.test(e.message); }
  ok(noSep, 'assemblePrompt: template ไม่มีเส้น --- → throw (ไม่เดาว่าส่วนไหนเป็นของ worker)');
  // token ที่หายไปใต้ --- = ค่าที่เตรียมมาถูกทิ้งเงียบ ๆ (เช่นมีแต่ในย่อหน้า intro ที่เพิ่งตัดทิ้ง)
  let miss = false;
  try { Pp.assemblePrompt('intro\n---\n{{SYMBOL}} {{MARKET}} {{MODE}} {{CURRENT_TAGS}} {{MEDIANS}} {{FUNDAMENTALS}}', ALLV, ''); }
  catch (e) { miss = /ไม่มี \{\{WORKTREE\}\} ในส่วน worker/.test(e.message); }
  ok(miss, 'assemblePrompt: ส่วน worker ขาด {{WORKTREE}} → throw (ค่าที่เตรียมไว้ห้ามหายเงียบ)');

  // EPS screen > 2% ต้องเปลี่ยนโหมดจริง ไม่ใช่เตือนอย่างเดียว — ไม่งั้นหัว prompt ({{MODE}}) กับบล็อกท้ายขัดกัน
  const esc = Pp.extraBlock({ sym: 'A', mode: 'UPDATE', escalated: true, prePatched: null, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 3.66, snap: [], medWarn: [], hard: false, hardWhy: '' });
  ok(/ยกระดับจาก UPDATE-LIGHT เป็น UPDATE เต็ม/.test(esc) && /โหมดในหัว prompt เปลี่ยนแล้ว/.test(esc), 'extraBlock: escalated → บอกว่าโหมดในหัว prompt เปลี่ยนแล้ว', esc);
  const noEsc = Pp.extraBlock({ sym: 'A', mode: 'UPDATE-LIGHT', escalated: false, prePatched: null, baseEPS: 7.3, epsTTM: 7.36, epsScreen: 0.8, snap: [], medWarn: [], hard: false, hardWhy: '' });
  ok(!/ยกระดับ/.test(noEsc) && /FV เดิมยืนได้/.test(noEsc), 'extraBlock: EPS screen ≤2% → ไม่มีคำว่ายกระดับ', noEsc);

  ok(Pp.hardStock({ bucket: 'FULL' }, ctx, v).hard === true, 'hardStock: suspect-split/bad-chart = ยาก');
  ok(Pp.hardStock({ bucket: 'LIGHT' }, { baseEPS: -1.2 }, v).hard === true && /pre-profit/.test(Pp.hardStock({ bucket: 'LIGHT' }, { baseEPS: -1.2 }, v).why), 'hardStock: EPS ฐาน ≤ 0 = pre-profit = ยาก');
  ok(Pp.hardStock({ bucket: 'LIGHT' }, ctx, v).hard === false, 'hardStock: LIGHT ปกติ = ไม่ยาก (Sonnet/medium)');
}

// ── 8) postcheck (ส่วนบริสุทธิ์): ราคาเก่าค้างในเนื้อความ · ai-model · pe null เมื่อขาดทุน · footer วันนี้/พ.ศ. ──
{
  const Pc = require('../tools/queue/postcheck.js');
  const html = '<p>ราคาปัจจุบัน $297.21 ยังถูก</p>\n<script id="stock-meta">{"price":297.21}</script>\n<p>เป้า $320</p>\n<p>จากจุดเข้า $297</p>';
  const hits = Pc.findOldPrice(html, 297.21);
  ok(hits.length === 2 && hits[0].line === 1 && hits[1].line === 4, 'findOldPrice: จับทั้งทศนิยมและจำนวนเต็ม · ข้ามบล็อก stock-meta', JSON.stringify(hits));
  ok(Pc.findOldPrice(html, null).length === 0, 'findOldPrice: ไม่มีราคาเดิม → ว่าง');
  const ctxLoss = { aiModel: 'Claude Sonnet 5', baseEPS: -0.5, sm: { ok: true, data: { pe: 12, roe: 4.1 } } };
  const m1 = Pc.checkMeta(ctxLoss, 'sonnet', { iso: '2026-09-11', era: 'BE' }, '2026-09-11');
  ok(m1.some((s) => /stock-meta\.pe/.test(s)) && !m1.some((s) => /ai-model/.test(s)), 'checkMeta: EPS ≤ 0 แต่ pe ไม่ null → issue · ai-model ตรง → ไม่ฟ้อง', m1.join('|'));
  const m2 = Pc.checkMeta({ aiModel: 'Claude Sonnet 5', baseEPS: 5, sm: { ok: true, data: { pe: 20, roe: 10 } } }, 'opus', { iso: '2026-09-10', era: 'CE' }, '2026-09-11');
  ok(m2.some((s) => /ai-model/.test(s)) && m2.some((s) => /footer.*ไม่ใช่วันนี้/.test(s)) && m2.some((s) => /ค\.ศ\./.test(s)), 'checkMeta: ai-model ไม่ตรง spawn · footer ไม่ใช่วันนี้ · ค.ศ.', m2.join('|'));
  ok(Pc.checkMeta({ aiModel: 'Claude Opus 5', baseEPS: 5, sm: { ok: true, data: { pe: 20, roe: 10 } } }, 'opus', { iso: '2026-09-11', era: 'BE' }, '2026-09-11').length === 0, 'checkMeta: ทุกอย่างตรง → ว่าง');
}

// ── 9) ship (ส่วนบริสุทธิ์): commit message ตาม CLAUDE.md §5 (1 commit = 1 หุ้น · add/update · trailer ตามโมเดล worker) ──
{
  const Sh = require('../tools/queue/ship.js');
  ok(Sh.commitMessage('AAPL', { mode: 'UPDATE-LIGHT' }, { mos: 3.9 }) === 'analyze: update AAPL — UPDATE-LIGHT (MOS +3.9%)', 'commitMessage: update + MOS');
  ok(Sh.commitMessage('NEWCO', { mode: 'NEW' }, { mos: -12 }) === 'analyze: add NEWCO — NEW (MOS −12%)', 'commitMessage: NEW = add · เครื่องหมายลบ');
  ok(Sh.commitMessage('X', {}, null) === 'analyze: update X — UPDATE', 'commitMessage: ไม่มี mos/mode → ค่าตั้งต้น');
  ok(Sh.trailer('opus') === 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>' && Sh.trailer('sonnet') === 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>', 'trailer: ตามโมเดล worker (CLAUDE.md §5)');
  // ★ (Task 16 nits) model undefined/ไม่รู้จัก ต้อง throw เหมือนกัน — เดิมเงียบเป็น Sonnet (แก้แล้ว)
  let undefThrew = null; try { Sh.trailer(undefined); } catch (e) { undefThrew = e.message; }
  ok(/ไม่รู้จัก/.test(undefThrew || ''), 'trailer: model undefined (ยังไม่ได้ตั้ง) → throw ไม่เงียบเป็น Sonnet', undefThrew);
  ok(/analyze: update|analyze: add/.test(Sh.commitMessage('A', { mode: 'UPDATE' }, {})) && Sh.STOCK_FILES('A').includes('reports/A.html') && !Sh.STOCK_FILES('A').includes('-A'), 'STOCK_FILES: รายการไฟล์ที่ add ชัดเจน (ไม่ใช่ git add -A)');
}
// ── 10) dispatcher: usage เมื่อไม่มีคำสั่ง · exit 1 ──
{
  const sh = require('../tools/queue/sh.js');
  const r = sh.run('node', ['tools/queue.js']);
  ok(r.code === 1 && /preflight/.test(r.err) && /postcheck/.test(r.err) && /ship/.test(r.err), 'queue.js: ไม่มีคำสั่ง → usage + exit 1');
  const r2 = sh.run('node', ['tools/queue.js', 'status']);
  ok(r2.code === 0 && /ยังไม่เริ่ม|push แล้ว/.test(r2.out), 'queue.js status: รันได้บน state ว่าง');
}

// ── 11) ship: prepatchBlockers (ส่วนบริสุทธิ์) — กัน `ship --prepatch` กวาดงานที่ worker วิเคราะห์ใหม่แล้วไปเป็น commit "price: …" ──
{
  const Sh = require('../tools/queue/ship.js');
  const { blocked, unreadable } = Sh.prepatchBlockers([
    { path: 'reports/NEWCO.html', untracked: true, headFooterISO: null, workFooterISO: '2026-09-12' },
    { path: 'reports/AAPL.html', untracked: false, headFooterISO: '2026-09-01', workFooterISO: '2026-09-12' },
    { path: 'reports/KLAC.html', untracked: false, headFooterISO: '2026-09-10', workFooterISO: '2026-09-10' },
    { path: 'reports/ASYM.html', untracked: false, headFooterISO: null, workFooterISO: '2026-09-12' },
    { path: 'reports/DARK.html', untracked: false, headFooterISO: null, workFooterISO: null },
  ]);
  ok(blocked.includes('NEWCO'), 'prepatchBlockers: ไฟล์ใหม่ (untracked) = worker เขียนใหม่ → กัน', blocked.join(','));
  ok(blocked.includes('AAPL'), 'prepatchBlockers: footer ขยับจาก HEAD = วิเคราะห์ใหม่แล้ว → กัน', blocked.join(','));
  ok(!blocked.includes('KLAC'), 'prepatchBlockers: footer เดิม + tracked = pre-patch ราคาล้วน → ผ่าน', blocked.join(','));
  ok(blocked.includes('ASYM'), 'prepatchBlockers: อ่าน footer ได้ข้างเดียว (HEAD parse ไม่ออก) = สงสัย → กัน', blocked.join(','));
  ok(!blocked.includes('DARK') && unreadable.includes('DARK'), 'prepatchBlockers: อ่าน footer ไม่ได้ทั้งสองข้าง = ไม่กัน แต่ขึ้น unreadable ให้คนตรวจเอง', JSON.stringify({ blocked, unreadable }));
  ok(blocked.length === 3, 'prepatchBlockers: กันเฉพาะ 3 ตัวที่เข้าเงื่อนไข ไม่กวาดตัวที่ไม่เข้าข่าย', blocked.join(','));
}

// ── 11b) ship: parsePorcelain (ส่วนบริสุทธิ์) — path ปลายทางของ rename · A/?? = ไฟล์ใหม่ (เข้า prepatchBlockers เป็น untracked) ──
{
  const Sh = require('../tools/queue/ship.js');
  const rows = Sh.parsePorcelain([
    ' M reports/A.html',
    '?? reports/B.html',
    'A  reports/C.html',
    'R  reports/OLD.html -> reports/NEW.html',
  ].join('\n'));
  ok(rows.length === 4, 'parsePorcelain: 4 แถว', JSON.stringify(rows));
  ok(rows[0].path === 'reports/A.html' && rows[0].isNew === false, 'parsePorcelain: " M" = แก้ไข tracked ไม่ใช่ไฟล์ใหม่', JSON.stringify(rows[0]));
  ok(rows[1].path === 'reports/B.html' && rows[1].isNew === true, 'parsePorcelain: "??" = untracked → ไฟล์ใหม่', JSON.stringify(rows[1]));
  ok(rows[2].path === 'reports/C.html' && rows[2].isNew === true, 'parsePorcelain: "A " = เพิ่งถูก add → ไฟล์ใหม่', JSON.stringify(rows[2]));
  ok(rows[3].path === 'reports/NEW.html' && rows[3].isNew === false, 'parsePorcelain: rename ใช้ path ปลายทาง (หลัง " -> ")', JSON.stringify(rows[3]));
}

// ── 12) ship: status — bucket ไม่ซ้อนกัน (postcheck:'review' ไม่มี bucket ต้องขึ้นบรรทัดเดียว ไม่ใช่ทั้ง review และ other[undefined]) ──
{
  const S3 = require('../tools/queue/state.js');
  const Sh3 = require('../tools/queue/ship.js');
  S3.update('REVIEWME', { postcheck: 'review' });   // ไม่มี bucket เลย — ก่อนแก้เคยขึ้นทั้ง "postcheck ต้องดู" และ "ไม่ใช้ agent/ข้าม" พร้อมกัน
  S3.update('GATEFAIL', { bucket: 'LIGHT', prePatchRejected: '2026-09-12' });   // pre-patch แล้ว gate ตก คืนไฟล์แล้ว — ก่อนแก้ตกไปอยู่ "ยังไม่เริ่ม" เหมือนรอ spawn worker
  S3.update('FLIPONLY', { bucket: 'PREPATCH' });                                   // flip ในย่าน (ข้อ D) — ไม่มี worker ให้รอ และไม่ใช่ "ข้าม" ⇒ บรรทัดของตัวเอง
  S3.update('FLIPDONE', { bucket: 'PREPATCH', prepatchShippedAt: '2026-09-12' });   // PREPATCH ที่ push แล้ว = จบงานของมัน ต้องนับใน X/Y
  S3.update('FLIPFAIL', { bucket: 'PREPATCH', prePatchRejected: '2026-09-12' });    // PREPATCH ที่ gate ตก ต้องคงป้ายเหตุผลไว้ ไม่หายเข้าไปในบรรทัด PREPATCH
  const lines = [];
  const orig = console.log;
  console.log = (s) => lines.push(String(s));
  try { Sh3.status(); } finally { console.log = orig; }
  const out = lines.join('\n');
  ok(!/\[undefined\]/.test(out), 'status: ไม่มี [undefined] หลุดมาในบรรทัดไหน', out);
  ok(lines.filter((l) => l.includes('REVIEWME')).length === 1, 'status: postcheck review ไม่มี bucket → ขึ้นบรรทัดเดียว (bucket ไม่ซ้อน)', out);
  ok(lines.length === 9, 'status: พิมพ์ 9 บรรทัด (เพิ่มบรรทัด "pre-patch อย่างเดียว" — ข้อ D)', String(lines.length));
  ok(/^pre-patch อย่างเดียว \(ไม่ส่ง LLM\)/.test(lines[7]) && /^pre-patch push แล้ว/.test(lines[8]), 'status: บรรทัด PREPATCH อยู่ก่อนบรรทัดสุดท้าย (pre-patch push แล้ว)', lines.slice(7).join(' | '));
  const flipLine = lines[7];
  ok(/FLIPONLY/.test(flipLine) && /FLIPDONE✓/.test(flipLine) && !/FLIPFAIL/.test(flipLine), 'status: PREPATCH ขึ้นบรรทัดตัวเอง · push แล้วติด ✓ · gate ตกไม่อยู่บรรทัดนี้', flipLine);
  ok(lines.filter((l) => l.includes('FLIPONLY')).length === 1, 'status: PREPATCH ไม่ซ้อนกับ "ยังไม่เริ่ม"/"ไม่ใช้ agent/ข้าม"', out);
  ok(/· 1\/\d+$/.test(lines[0]), 'status: ตัวนับ X/Y นับ PREPATCH ที่ push แล้วด้วย (FLIPDONE)', lines[0]);
  ok(lines.filter((l) => l.includes('GATEFAIL')).length === 1, 'status: prePatchRejected ขึ้นบรรทัดเดียว (ไม่ซ้อนกับ "ยังไม่เริ่ม")', out);
  const otherLine = lines.find((l) => /^ไม่ใช้ agent\/ข้าม/.test(l)) || '';
  ok(/GATEFAIL\[gate ตกหลัง pre-patch\]/.test(otherLine), 'status: prePatchRejected อยู่ใต้ "ไม่ใช้ agent/ข้าม" พร้อมป้ายเหตุผล', otherLine);
  ok(/FLIPFAIL\[gate ตกหลัง pre-patch\]/.test(otherLine) && lines.filter((l) => l.includes('FLIPFAIL')).length === 1, 'status: PREPATCH ที่ gate ตกหลัง pre-patch คงป้ายเหตุผลใต้ "ไม่ใช้ agent/ข้าม" บรรทัดเดียว', otherLine);
  ok(!(lines.find((l) => /^ยังไม่เริ่ม/.test(l)) || '').includes('GATEFAIL'), 'status: ใบที่ gate ตกหลัง pre-patch ไม่ถูกนับว่ารอ spawn worker', lines.find((l) => /^ยังไม่เริ่ม/.test(l)));
}

// ── 12c) ship: `ship --prepatch` ต้องปิด issue เองเมื่อรอบนั้นไม่มีแถวต้องส่ง LLM (ข้อ D — flip ล้วนไม่มี ship <SYM> ตามมา) ──
//   ยิงเฉพาะส่วนตัดสินใจ: shipPrepatch() เต็มใบเรียก npm run build / preserve-dates / npm run verify / git push จึงรันในเทสไม่ได้
{
  const Sh = require('../tools/queue/ship.js');
  let n = 0;
  const spy = () => { n++; };
  const quiet = (fn) => { const orig = console.log; console.log = () => {}; try { return fn(); } finally { console.log = orig; } };
  const onlyFlip = quiet(() => Sh.closeIssueIfNoLlmRows({ A: { bucket: 'PREPATCH' }, B: { bucket: 'PREPATCH', prepatchShippedAt: '2026-09-12' } }, spy));
  ok(onlyFlip === true && n === 1, 'closeIssueIfNoLlmRows: รอบที่มีแต่ PREPATCH → ปิด issue ตรงนี้', String(n));
  const withLight = quiet(() => Sh.closeIssueIfNoLlmRows({ A: { bucket: 'PREPATCH' }, C: { bucket: 'LIGHT' } }, spy));
  ok(withLight === false && n === 1, 'closeIssueIfNoLlmRows: ยังมี LIGHT ที่ยังไม่ ship → ไม่ปิด (ปิดตอน ship <SYM> ตัวสุดท้าย)', String(n));
  const doneOrSkipped = quiet(() => Sh.closeIssueIfNoLlmRows({ C: { bucket: 'LIGHT', shippedAt: '2026-09-12' }, D: { bucket: 'FULL', skip: 'สด ≤7 วัน (footer)' }, E: { bucket: 'DELIST' } }, spy));
  ok(doneOrSkipped === true && n === 2, 'closeIssueIfNoLlmRows: LIGHT ที่ ship แล้ว · FULL ที่ข้าม · DELIST ไม่นับเป็นงานค้าง → ปิด', String(n));
  ok(quiet(() => Sh.closeIssueIfNoLlmRows({}, spy)) === true && n === 3, 'closeIssueIfNoLlmRows: state ว่าง → ปิด', String(n));
  // C1 (carried จาก Task 13 review): PREPATCH ที่ gate ตกหลัง pre-patch (prePatchRejected) ยังต้องแก้เอง — ห้ามปิด issue ทั้งที่แถวนี้ยังค้าง
  const flipGateFail = quiet(() => Sh.closeIssueIfNoLlmRows({ A: { bucket: 'PREPATCH', prePatchRejected: '2026-09-12' } }, spy));
  ok(flipGateFail === false && n === 3, 'closeIssueIfNoLlmRows: PREPATCH row ที่ prePatchRejected → นับเป็นงานค้าง ไม่ปิด issue (C1)', String(n));
}

// ── 12b) ship: commitArgs — commit ต้องจำกัดด้วย pathspec ไม่งั้น deletion ที่ stage ไว้ (git rm ตอน DELIST) หลุดเข้า commit (re-review) ──
{
  const Sh = require('../tools/queue/ship.js');
  const a = Sh.commitArgs('price: x', ['reports/A.html', 'reports.json']);
  ok(a.join(' ') === ['commit', '-q', '-m', 'price: x', '--', 'reports/A.html', 'reports.json'].join(' '), 'commitArgs: commit -q -m <msg> -- <ไฟล์…>', JSON.stringify(a));
  ok(a[4] === '--' && a.slice(5).join(',') === 'reports/A.html,reports.json', 'commitArgs: มี "--" คั่นก่อนรายชื่อไฟล์เสมอ (ข้อความขึ้นต้นด้วย - ก็ไม่กลายเป็น flag)', JSON.stringify(a));
  ok(Sh.commitArgs('m', []).slice(-1)[0] === '--', 'commitArgs: ไม่มีไฟล์เลย → ยังมี "--" ปิดท้าย (commit จะไม่กวาด index)', JSON.stringify(Sh.commitArgs('m', [])));
}

// ── 13) preflight: parseGateFailures — --force ข้าม quarantine ของ cron ⇒ ต้องยิง gate เองแล้วคืนไฟล์ใบที่ตก (final review 1) ──
{
  const P = require('../tools/queue/preflight.js');
  const OUT = [
    '🔍 ตรวจคุณภาพรายงาน 2 ไฟล์ (reports/)',
    '',
    '✓ AAA.html      43/43 ผ่าน',
    '✗ BBB.html      41/43 ผ่าน — 2 ปัญหา',
    '    ✗ [E15] ราคา: ราคาในใบไม่ตรง stock-meta',
    '    ✗ [E41] การ์ด P/E: ค้าง',
    '',
    'สรุป: 1/2 ไฟล์ผ่าน • error 2 • warning 0',
  ].join('\n');
  const f = P.parseGateFailures(OUT);
  ok(f.join(',') === 'BBB', 'parseGateFailures: เอาเฉพาะบรรทัดสรุปต่อไฟล์ ไม่นับบรรทัดรายละเอียด E-code ที่ย่อหน้า', f.join(','));
  ok(P.parseGateFailures('✓ AAA.html      43/43 ผ่าน').length === 0, 'parseGateFailures: ผ่านหมด → ไม่มีใบที่ต้องคืนไฟล์');
  // แถวที่โดนคืนไฟล์ต้องโผล่ในขั้นที่ต้องทำเอง (คลาสเดียวกับ REJECTED — แก้ใบเอง ไม่ spawn agent) โดยยังคุมเพดาน ≤5
  const rows = [
    { symbol: 'US1', reason: 'mos-sign-flip', bucket: 'LIGHT', currency: 'USD', action: 'x', skip: null, prePatchRejected: '2026-09-12' },
    { symbol: 'US4', reason: 'fetch-failed', bucket: 'PLUMBING', currency: 'USD', action: 'x', skip: null },
    { symbol: 'US2', reason: 'not-on-exchange', bucket: 'DELIST', currency: 'USD', action: 'x', skip: null },
  ];
  const man = P.manualSteps(rows);
  ok(/US1\[gate ตกหลัง pre-patch\]/.test(man), 'manualSteps: แถวที่ pre-patch แล้ว gate ตก ขึ้นป้าย [gate ตกหลัง pre-patch]', man);
  ok(/US4\[fetch-failed\]/.test(man), 'manualSteps: PLUMBING ยังใช้ reason เดิมเป็นป้าย', man);
  ok(man.split('\n').filter((l) => /^\d+\./.test(l)).length <= 5, 'manualSteps: รวม prePatchRejected แล้วยัง ≤5 ขั้น (KPI ระยะ 0)', man);
}

// ── 14) ship: ไฟล์ที่ลบ (DELIST) ต้องไม่ถูกกวาดเข้า commit "price: …" (final review 3) ──
{
  const Sh = require('../tools/queue/ship.js');
  const rows = Sh.parsePorcelain([' D reports/X.html', 'D  reports/Y.html', ' M reports/A.html', '?? reports/B.html'].join('\n'));
  ok(rows[0].path === 'reports/X.html' && rows[0].isNew === false && rows[0].deleted === true, 'parsePorcelain: " D" = ลบไฟล์ (unstaged)', JSON.stringify(rows[0]));
  ok(rows[1].deleted === true, 'parsePorcelain: "D " = ลบไฟล์ (staged)', JSON.stringify(rows[1]));
  ok(rows[2].deleted === false && rows[3].deleted === false, 'parsePorcelain: แก้ไข/ไฟล์ใหม่ ไม่ใช่ไฟล์ที่ลบ', JSON.stringify(rows.slice(2)));
  const { candidates, deleted } = Sh.prepatchCandidates(rows);
  ok(deleted.map((e) => e.path).join(',') === 'reports/X.html,reports/Y.html', 'prepatchCandidates: แยกไฟล์ที่ลบออกมา', JSON.stringify(deleted));
  ok(candidates.map((e) => e.path).join(',') === 'reports/A.html,reports/B.html', 'prepatchCandidates: เหลือเฉพาะใบที่ยังมีไฟล์ (เข้า changed/git add)', JSON.stringify(candidates));
  // ไฟล์ที่ลบเข้า prepatchBlockers ไม่ได้ — อ่าน footer ทั้งสองข้างไม่ได้ จะกลายเป็น unreadable ปลอมทุกใบ
  const b = Sh.prepatchBlockers(candidates.map((e) => ({ path: e.path, untracked: e.isNew, headFooterISO: '2026-09-10', workFooterISO: '2026-09-10' })));
  ok(!b.unreadable.length && b.blocked.join(',') === 'B', 'prepatchBlockers: ไม่เคยได้รับไฟล์ที่ลบ (ไม่มี unreadable ปลอม)', JSON.stringify(b));
}

// ── 14b) ship: pendingCommitFor — stage ว่างเพราะ commit ไปแล้วแต่ push ล้ม ≠ worker ไม่ได้เขียนไฟล์ (final review 5) ──
{
  const Sh = require('../tools/queue/ship.js');
  const log = 'analyze: update KLAC — UPDATE-LIGHT (MOS +3.2%)\nchore: อื่น ๆ';
  ok(Sh.pendingCommitFor('KLAC', log) === true, 'pendingCommitFor: เจอ commit ของหุ้นตัวนี้ที่ยังไม่ push → รันซ้ำ = push ต่อ');
  ok(Sh.pendingCommitFor('LRCX', log) === false, 'pendingCommitFor: หุ้นตัวอื่นใน log ไม่นับ');
  ok(Sh.pendingCommitFor('KLA', log) === false, 'pendingCommitFor: \\b กัน prefix ชนกัน (KLA ≠ KLAC)');
  ok(Sh.pendingCommitFor('NEWCO', 'analyze: add NEWCO — NEW (MOS −12%)') === true, 'pendingCommitFor: โหมด NEW ใช้ "add"');
  ok(Sh.pendingCommitFor('BRK.B', 'analyze: update BRK.B — UPDATE') === true && Sh.pendingCommitFor('BRKXB', 'analyze: update BRK.B — UPDATE') === false, 'pendingCommitFor: escape จุดใน ticker (BRK.B ไม่ใช่ wildcard)');
  ok(Sh.pendingCommitFor('KLAC', '') === false && Sh.pendingCommitFor('KLAC', null) === false, 'pendingCommitFor: log ว่าง/null → false');
}

// ── 15) dispatcher: ship <SYM> + --prepatch พร้อมกัน = พิมพ์ผิด ห้ามเดาให้ (final review · ต้องตกก่อนเข้า ship.js) ──
{
  const sh = require('../tools/queue/sh.js');
  const r = sh.run('node', ['tools/queue.js', 'ship', 'AAA', '--prepatch']);
  ok(r.code === 1 && /อย่างใดอย่างหนึ่ง/.test(r.err), 'queue.js ship: <SYM> + --prepatch → exit 1 + บอกให้เลือกอย่างเดียว', (r.err || r.out).slice(0, 200));
  ok(!/verify|git add/.test(r.out), 'queue.js ship: ตกก่อนเข้า ship path จริง (ไม่มีร่องรอย verify/git add)', r.out.slice(0, 200));
}

// ── 16) prep extraBlock: ยังไม่ pre-patch ต้องบอกด้วยว่าตลาดเปิดอยู่ไหม (--force ข้าม guard intraday เอง) ──
{
  const Pp = require('../tools/queue/prep.js');
  const base = { sym: 'AAA', mode: 'UPDATE', escalated: false, oldPrice: 10, price: 11, baseEPS: 1, epsTTM: 1, epsScreen: 0, snap: [], medWarn: [], hard: false };
  const openTxt = Pp.extraBlock({ ...base, prePatched: null, marketOpen: true });
  ok(/intraday/.test(openTxt) && /update-prices.js --write --force AAA/.test(openTxt), 'extraBlock: ยังไม่ patch + ตลาดเปิด → เตือน intraday', openTxt.split('\n')[1]);
  const closedTxt = Pp.extraBlock({ ...base, prePatched: null, marketOpen: false });
  ok(/ตลาดปิดแล้ว รันได้/.test(closedTxt) && !/intraday/.test(closedTxt), 'extraBlock: ยังไม่ patch + ตลาดปิด → รันได้', closedTxt.split('\n')[1]);
  const patched = Pp.extraBlock({ ...base, prePatched: '2026-09-12', marketOpen: true });
  ok(/ห้ามรัน update-prices ซ้ำ/.test(patched) && !/intraday/.test(patched), 'extraBlock: patch แล้ว → ห้ามรันซ้ำ ไม่ต้องพูดถึงตลาด', patched.split('\n')[1]);
}

// ── 17) prep: checkNotPrepatch (ส่วนบริสุทธิ์) — C2 (carried จาก Task 13 review): ปฏิเสธ prep <SYM> บนแถว PREPATCH
//   ก่อนยิง network ใด ๆ (flip ในย่าน ไม่ต้องส่ง LLM — ship --prepatch จบแล้ว) ──
{
  const Pp = require('../tools/queue/prep.js');
  let threw = null;
  try { Pp.checkNotPrepatch('FLIP1', { bucket: 'PREPATCH' }); } catch (e) { threw = e; }
  ok(threw && /FLIP1 เป็น PREPATCH/.test(threw.message) && /ship --prepatch/.test(threw.message), 'checkNotPrepatch: แถว PREPATCH → throw ข้อความชัดเจน (C2)', threw && threw.message);
  let noThrow = true;
  try { Pp.checkNotPrepatch('LIGHT1', { bucket: 'LIGHT' }); } catch (e) { noThrow = false; }
  ok(noThrow, 'checkNotPrepatch: แถว LIGHT ไม่ถูกปฏิเสธ');
  let noThrowEmpty = true;
  try { Pp.checkNotPrepatch('NEWCO', {}); } catch (e) { noThrowEmpty = false; }
  ok(noThrowEmpty, 'checkNotPrepatch: ไม่มี record เลย (หุ้นใหม่) → ไม่ถูกปฏิเสธ');
}

// ── 18) state: .queue อยู่ที่ checkout หลัก (open-item #22 — worktree ใหม่ทุก session ทำให้รอบหาย) ──
{
  const S = require('../tools/queue/state.js');
  ok(S.resolveQueueDir({ QUEUE_DIR: '/x/q' }, '/a/b/.git') === '/x/q', 'resolveQueueDir: QUEUE_DIR ชนะ');
  ok(S.resolveQueueDir({}, '/a/b/.git') === path.join('/a/b', '.queue'), 'resolveQueueDir: git-common-dir absolute → <หลัก>/.queue');
  ok(S.resolveQueueDir({}, '.git') === path.join(ROOT, '.queue'), 'resolveQueueDir: checkout หลักเอง (.git relative) → ROOT/.queue');
  ok(S.resolveQueueDir({}, '') === path.join(ROOT, '.queue') && S.resolveQueueDir({}, null) === path.join(ROOT, '.queue'), 'resolveQueueDir: ไม่มี git → ROOT/.queue');
}

// ── 19) CLI nits (ledger ระยะ 0): --flag=value · --tags ต้องมีค่า · trailer ไม่เดา ──
{
  const sh = require('../tools/queue/sh.js');
  const r1 = sh.run('node', ['tools/queue.js', 'prep']);                     // ไม่มี SYM → usage
  ok(r1.code !== 0 && /ใช้: npm run queue/.test(r1.out + r1.err), 'queue.js: prep ไม่มี SYM → usage');
  const r2 = sh.run('node', ['tools/queue.js', 'ship', 'AAPL', '--tags']);
  ok(r2.code !== 0 && /--tags ต้องมีค่า/.test(r2.out + r2.err), 'queue.js: --tags ไม่มีค่า → error ชัด (ไม่ใช่ garbage)');
  const r3 = sh.run('node', ['tools/queue.js', 'ship', 'AAPL', '--tags', '--force']);
  ok(r3.code !== 0 && /--tags ต้องมีค่า/.test(r3.out + r3.err), 'queue.js: --tags ตามด้วย flag → error');
  const Q = require('../tools/queue/ship.js');
  let threw = null; try { Q.trailer('haiku'); } catch (e) { threw = e.message; }
  ok(/ไม่รู้จัก/.test(threw || ''), 'trailer: โมเดลไม่รู้จัก → throw (ไม่เงียบเป็น Sonnet)');
  ok(/Sonnet 5/.test(Q.trailer('sonnet')) && /Opus 5/.test(Q.trailer('opus')), 'trailer: sonnet/opus ถูก');

  const A = require('../tools/queue/args.js');
  const p1 = A.parseArgs(['prep', 'AAPL', '--mode=UPDATE', '--tags', 'a b']);
  ok(p1.val('--mode') === 'UPDATE', 'parseArgs: --flag=value รองรับ');
  ok(p1.val('--tags') === 'a b', 'parseArgs: --flag value (เว้นวรรค 2 ตัว) รองรับ');
  ok(p1.cmd === 'prep' && p1.sym === 'AAPL', 'parseArgs: cmd/sym ถูก');
  let valThrew = null; try { A.parseArgs(['ship', 'AAPL', '--tags']).val('--tags'); } catch (e) { valThrew = e.message; }
  ok(/--tags ต้องมีค่า/.test(valThrew || ''), 'parseArgs: val() ไม่มีค่าตามหลัง → throw');
  let valThrew2 = null; try { A.parseArgs(['ship', 'AAPL', '--tags', '--force']).val('--tags'); } catch (e) { valThrew2 = e.message; }
  ok(/--tags ต้องมีค่า/.test(valThrew2 || ''), 'parseArgs: val() ตามด้วย flag อื่น → throw');
}

// ── 19b) dispatcher: --age N / --age=N / --no-age ยังใช้ได้หลังย้ายไป args.js (Task 14 ไม่พัง)
//   ทดสอบ parseArgs ตรง ๆ (ไม่ผ่าน CLI จริง) — `preflight` ยิง git pull เสมอ ทดสอบผ่าน sh.run ไม่ได้ (ดู brief Task 16) ──
{
  const A = require('../tools/queue/args.js');
  let a = A.parseArgs(['preflight', '--age', '5']);
  ok((a.val('--age') != null ? +a.val('--age') : null) === 5, 'parseArgs: --age N (เว้นวรรค)');
  a = A.parseArgs(['preflight', '--age=5']);
  ok((a.val('--age') != null ? +a.val('--age') : null) === 5, 'parseArgs: --age=5 (เท่ากับ)');
  a = A.parseArgs(['preflight', '--no-age']);
  ok(a.has('--no-age') === true, 'parseArgs: --no-age (boolean flag)');
  a = A.parseArgs(['preflight', '--allow-dirty', '--no-patch']);
  ok(a.has('--allow-dirty') === true && a.has('--no-patch') === true, 'parseArgs: boolean flag หลายตัวพร้อมกัน (--allow-dirty · --no-patch)');
}

// ─────────────────────────── (Task 10–14 แทรกเทสเหนือบรรทัดนี้) ───────────────────────────
console.log(`queue-test: ${nOK}/${nOK + nFail} ผ่าน`);
if (nFail) { console.log('❌ runbook มีบั๊ก'); process.exit(1); }
process.exit(0);
