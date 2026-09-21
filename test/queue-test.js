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
  ok(F.footerDate(wrap('10 ก.ย. 2569')).form === 'day', 'footerDate: รูปวันเดียว = form "day"');

  // ── #38 (ระยะ 3 Task 8): รูปแบบที่ตัวอ่านเดิมคืน null ⇒ 12 ใบในคลังหลุดประตูวันที่ของ E44/preflight ──
  // ★ กติกา "เดือนล้วน" = **วันที่ 1 ของเดือนนั้น** (ระมัดระวัง) — ทำให้ใบดู *เก่ากว่า* ความจริงเล็กน้อย
  //   ไม่ใช่ใหม่กว่า ⇒ ไม่มี false-fresh ที่จะทำให้ dedup 7 วัน / staleness 90 วัน ข้ามใบที่ควรถูกคิว
  ok(F.footerDate(wrap('มกราคม 2569')).iso === '2026-01-01' && F.footerDate(wrap('มกราคม 2569')).form === 'month',
    'footerDate: เดือนล้วน (ชื่อเต็ม พ.ศ.) → วันที่ 1 ของเดือน (AMATAV)');
  ok(F.footerDate(wrap('ธันวาคม 2568')).iso === '2025-12-01' && F.footerDate(wrap('ธันวาคม 2568')).era === 'BE', 'footerDate: เดือนล้วน ปี พ.ศ. คนละปี ค.ศ. (TKN)');
  ok(F.footerDate(wrap('เม.ย. 2569')).iso === '2026-04-01' && F.footerDate(wrap('เม.ย. 2569')).day === 1, 'footerDate: เดือนล้วน (ย่อมีจุด) (SABINA)');
  ok(F.footerDate(wrap('มิถุนายน 2026')).iso === '2026-06-01' && F.footerDate(wrap('มิถุนายน 2026')).era === 'CE', 'footerDate: เดือนล้วน ปี ค.ศ.');
  // ช่วงข้ามเดือน = ใช้ "วันแรก" ให้ตรงกับช่วงวัน–วันในเดือนเดียวกันที่มีอยู่เดิม (เก่ากว่า = ระมัดระวังเหมือนกัน)
  ok(F.footerDate(wrap('31 ก.ค. – 2 ส.ค. 2026')).iso === '2026-07-31' && F.footerDate(wrap('31 ก.ค. – 2 ส.ค. 2026')).form === 'range',
    'footerDate: ช่วงข้ามเดือน (เว้นวรรครอบ en dash) → วันแรก (AMZN)');
  ok(F.footerDate(wrap('24 มิ.ย.–13 ส.ค. 2026')).iso === '2026-06-24', 'footerDate: ช่วงข้ามเดือน ไม่เว้นวรรครอบ dash (MU)');
  ok(F.footerDate(wrap('24 มิ.ย.-13 ส.ค. 2569')).iso === '2026-06-24', 'footerDate: ช่วงข้ามเดือน ASCII hyphen + พ.ศ.');
  // ปีที่ประกาศเป็นของวันสุดท้ายเสมอ ⇒ เดือนแรก > เดือนสุดท้าย = คร่อมปีใหม่ วันแรกต้องถอยปี (เก่ากว่า)
  ok(F.footerDate(wrap('31 ธ.ค. – 2 ม.ค. 2569')).iso === '2025-12-31', 'footerDate: ช่วงคร่อมปี → วันแรกถอยไป 1 ปี');
  // ★ ห้ามหลวมไปกว่านี้: "เดือนล้วน" ต้องเป็นชื่อเดือนจริง ไม่ใช่คำไทยอะไรก็ได้ที่ตามด้วยเลข 4 หลัก
  //   (ไม่งั้น "ข้อมูล ณ ราคาปิด 2569" / "ข้อมูล ณ FY2568" จะกลายเป็นวันที่วิเคราะห์ปลอม)
  ok(F.footerDate(wrap('FY2568')) === null && F.footerDate(wrap('ไตรมาส 2 ปี 2569')) === null && F.footerDate(wrap('ราคาปิด 2569')) === null,
    'footerDate: คำที่ไม่ใช่ชื่อเดือน + เลข 4 หลัก → null ตามเดิม (เดือนล้วนใช้คลังชื่อเดือนจริงเท่านั้น)');
  // วลีเดียวกันซ้ำใน footer: ตัวแรกที่ "อ่านออก" ชนะเหมือนเดิม — รูปใหม่ต้องไม่ไปแย่งจับวลีที่ไม่ใช่วันที่
  ok(F.footerDate('<footer>ข้อมูล ณ ราคาปิด · ข้อมูล ณ 10 ก.ย. 2569</footer>').iso === '2026-09-10',
    'footerDate: วลี "ข้อมูล ณ" ที่ไม่ใช่วันที่ ไม่บังวลีวันที่จริงที่ตามมา');

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
  const rows = T.triage(flags, { footerAgeOf: (s) => ({ A: 3, B: 40, C: 10, D: null, E: 120, F: 30, G: 3 })[s], earningsAfterOf: (s) => s === 'F', lightRule: 'legacy' });
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
  // 6 ใบเกิน 90 วัน (FLAGGED OLD1 OLD2 OLD4 OLD5 OLD3) — ต้องมากกว่า 5 ถึงจะพิสูจน์ว่า default ageLimit ตัดจริง
  const ages = { OLD1: 200, OLD2: 150, OLD3: 95, OLD4: 120, OLD5: 110, MID: 60, FLAGGED: 300 };
  const rows = P.plan([{ symbol: 'FLAGGED', reason: 'drift-gt-15pct' }], '2026-09-12', { ageLimit: 2, lightRule: 'legacy', listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] });
  const syn = rows.filter((r) => r.synthetic);
  ok(syn.map((r) => r.symbol).join(',') === 'OLD1,OLD2' && syn.every((r) => r.reason === 'age-gt-90d' && r.bucket === 'LIGHT'), 'plan: แถวอายุสังเคราะห์ 2 ตัวแก่สุด (ไม่รวม FLAGGED ที่มี flag อยู่แล้ว · MID ไม่ถึง 90)', syn.map((r) => r.symbol).join(','));
  ok(P.ageQueue('2026-09-12', { listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] }).length === 6, 'ageQueue: นับทุกใบเกิน 90 วัน (6) ก่อนตัด');
  ok(P.plan([], '2026-09-12', { ageLimit: 0, listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] }).length === 0, 'plan: --no-age (ageLimit 0) ไม่เพิ่มแถว');
  // ageQueue: แก่สุดก่อนเสมอ (sort desc) — ยืนยันลำดับตรง ไม่ใช่แค่จำนวน
  const aqAll = P.ageQueue('2026-09-12', { listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] });
  ok(aqAll.map((r) => r.symbol).join(',') === 'FLAGGED,OLD1,OLD2,OLD4,OLD5,OLD3', 'ageQueue: เรียงแก่สุดก่อน (ไม่ตัดที่ ageLimit)', aqAll.map((r) => r.symbol).join(','));
  // plan: ageLimit default (ไม่ใส่ opts.ageLimit) = 5 — มี 6 ใบเข้าเกณฑ์ ⇒ ต้องเห็น "ตัด" จริง (OLD3 อ่อนสุดหลุด)
  const rowsDefault = P.plan([], '2026-09-12', { listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] });
  const synDefault = rowsDefault.filter((r) => r.synthetic).map((r) => r.symbol);
  ok(synDefault.length === 5, 'plan: ไม่ใส่ ageLimit → default 5 (มี 6 ใบเข้าเกณฑ์ จึงตัดเหลือ 5)', synDefault.join(','));
  ok(synDefault.join(',') === 'FLAGGED,OLD1,OLD2,OLD4,OLD5' && !synDefault.includes('OLD3'), 'plan: ตัวที่ถูกตัดคือใบอ่อนสุด (OLD3 95d)', synDefault.join(','));
}

// ── 6c) preflight: plan — แถวอายุสังเคราะห์ (synthetic) ต้อง "ต่อเนื่อง" flaggedAt ข้ามวัน (open-item #26) ──
//   เดิม plan() ตั้ง flaggedAt: today ให้แถวสังเคราะห์ทุกครั้งไม่ว่าจะเคยเจอมาก่อนหรือไม่ ⇒ preflight ที่รันคนละวัน
//   ในรอบเดียวกัน (ยังไม่ ship) จะได้ flaggedAt ใหม่ทุกวัน ⇒ isNewFlag() เห็นว่า flag "เปลี่ยน" ⇒ upsertRow ล้าง
//   model/prepAt/postcheck ของรอบเดิมทิ้งทั้งที่ยังไม่มีอะไรเปลี่ยนจริง — กู้คืนได้ด้วย prep <SYM>/--model มือเท่านั้น
{
  const P = require('../tools/queue/preflight.js');
  const ages = { OLD: 200 };
  const opts = (priorStocks) => ({ ageLimit: 5, listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s], priorStocks });

  // วันแรก: ยังไม่เคยมีสถานะของ OLD ⇒ flaggedAt = วันนี้
  const day1 = P.plan([], '2026-09-01', opts({}));
  const rowDay1 = day1.find((r) => r.symbol === 'OLD');
  ok(rowDay1 && rowDay1.flaggedAt === '2026-09-01', 'plan: แถวอายุครั้งแรก → flaggedAt = วันนี้', JSON.stringify(rowDay1));

  // จำลองว่า prep แล้ว (model/prepAt ถูกเขียนไว้จริง) แต่ยังไม่ ship
  const stocks = { OLD: P.upsertRow(undefined, rowDay1) };
  stocks.OLD.model = 'sonnet'; stocks.OLD.prepAt = '2026-09-01';

  // วันถัดมา: preflight รันซ้ำในรอบเดียวกัน (OLD ยังไม่ ship) → flaggedAt ต้องคงเดิม ไม่ใช่วันนี้
  const day2 = P.plan([], '2026-09-02', opts(stocks));
  const rowDay2 = day2.find((r) => r.symbol === 'OLD');
  ok(rowDay2 && rowDay2.flaggedAt === '2026-09-01', 'plan: open-item #26 — แถวอายุยังไม่ ship รันข้ามวัน → flaggedAt คงเดิม (ต่อเนื่อง ไม่ใช่วันนี้)', JSON.stringify(rowDay2));
  const merged = P.upsertRow(stocks.OLD, rowDay2);
  ok(merged.model === 'sonnet' && merged.prepAt === '2026-09-01', 'plan+upsertRow: open-item #26 — model/prepAt ของรอบเดิมไม่ถูกล้างทั้งที่ preflight รันข้ามวัน', JSON.stringify(merged));

  // หลัง ship แล้ว (shippedAt ติดมา) แต่ ageQueue ยังคืนตัวนี้อีก (ship ล้ม/footer ยังไม่ขยับ) → ต้องถือเป็นรอบใหม่จริง (flaggedAt = วันนี้)
  const shippedStocks = { OLD: { ...merged, shippedAt: '2026-09-02' } };
  const day3 = P.plan([], '2026-09-03', opts(shippedStocks));
  const rowDay3 = day3.find((r) => r.symbol === 'OLD');
  ok(rowDay3 && rowDay3.flaggedAt === '2026-09-03', 'plan: แถวอายุที่เคย ship ไปแล้วแต่ยังโผล่ใน ageQueue อีก → flaggedAt = วันนี้ (รอบใหม่จริง ไม่ใช่ของค้าง)', JSON.stringify(rowDay3));
}

// ── 7) prep (ส่วนบริสุทธิ์): parseVendor · snapshotDiff · assemblePrompt · hardStock ──
{
  const Pp = require('../tools/queue/prep.js');
  const FX = require('./fixtures');
  const { expandReport } = require('../build.js');
  const { buildCtx } = require('./check-reports.js');
  const RM = require('../tools/report-meta.js');
  const RV = require('../tools/report-values.js');   // item 5 (fix wave part-b): pin prep.js's ยอด/P-BV กับ RV.derive()
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

  // ★ #7 (GABLE — data-source-traps 6N): fyYears = จำนวนคอลัมน์ตัวเลขจริงในแถว EPS(dil) ของตาราง [3]
  //   ไม่นับ TTM · "-" ไม่ใช่ตัวเลข · ใช้ตัดสินป้าย "P/E เฉลี่ย ~N ปี" ไม่ให้อ้างยาวกว่าอายุหุ้นในตลาด
  ok(Pp.parseVendor('EPS(dil)   5.10  4.80  4.20  -  -').fyYears === 3,
    'parseVendor: fyYears นับตัวเลขในแถว EPS(dil) (ไม่มีหัวตาราง TTM ในข้อความ → ไม่มีคอลัมน์ให้หัก)',
    String(Pp.parseVendor('EPS(dil)   5.10  4.80  4.20  -  -').fyYears));
  // เคสจริง: มีหัวตาราง TTM+FY นำหน้า → คอลัมน์แรกของแถว EPS(dil) เป็น TTM เสมอ (fetch-fundamentals.js:
  // "คอลัมน์เรียงใหม่→เก่า") ⇒ ต้องหักออกก่อนนับ FY — GABLE จริง: TTM + 3 ปีจริง + 2 ปีก่อน IPO (dash)
  const GABLE_TABLE = '[3] งบย้อนหลัง (StockAnalysis /financials) — Revenue/NI/FCF/Shares/Cash/Debt หน่วยล้าน · margin/ROE = %:\n'
    + '                TTM  FY2025  FY2024  FY2023  FY2022  FY2021\n'
    + '    EPS(dil)          5.10    4.80    4.20    3.90       -       -';
  ok(Pp.parseVendor(GABLE_TABLE).fyYears === 3,
    'parseVendor: fyYears หักคอลัมน์ TTM เมื่อหัวตารางมี TTM (เคส GABLE: มีจริง 3 ปี ไม่ใช่ 5)',
    String(Pp.parseVendor(GABLE_TABLE).fyYears));
  ok(Pp.parseVendor('ไม่มีตาราง [3] เลย').fyYears == null, 'parseVendor: ไม่มีแถว EPS(dil) → fyYears null (เทียบไม่ได้ ไม่ใช่ 0)');

  // ★ ระยะ 1 review ข้อ 2: ทางหลักคือบรรทัด "FY ที่มี EPS(dil) จริง: N" ที่ fetch-fundamentals.js พิมพ์เอง (นับจาก
  //   แถวเต็ม ไม่ใช่คอลัมน์ที่ตัดด้วยเพดานพิมพ์ nCol=6) — ต้องชนะทางสำรอง (นับ token บนตารางที่พิมพ์จริง) เสมอ
  const NEW_LINE_TABLE = GABLE_TABLE + '\n    FY ที่มี EPS(dil) จริง: 8';
  ok(Pp.parseVendor(NEW_LINE_TABLE).fyYears === 8,
    '★ parseVendor: มีบรรทัด "FY ที่มี EPS(dil) จริง:" → ใช้ค่านั้น (8) แทนการนับคอลัมน์ที่พิมพ์ (ซึ่งจะได้ 3)',
    String(Pp.parseVendor(NEW_LINE_TABLE).fyYears));
  ok(Pp.parseVendor('ไม่มีบรรทัดใหม่ ไม่มีตาราง').fyYears == null, 'parseVendor: ไม่มีทั้งบรรทัดใหม่และแถว EPS(dil) → null');

  // ★ ระยะ 1 review ข้อ 6: ทางสำรอง (ไม่มีบรรทัดใหม่) ต้องทนหัวตารางที่ป้ายปีงบเพี้ยน (เช่น "FYFY2025" จาก payload
  //   ผิดปกติ) — เดิม regex เข้ม `TTM(?:\s+FY\d{4})+` ไม่แมตช์ป้ายเพี้ยน จึงไม่หักคอลัมน์ TTM ออกทั้งที่หัวตารางมี TTM จริง
  const MANGLED_HEADER = '                TTM  FYFY2025  FYFY2024\n    EPS(dil)     5.10    4.80    4.20';
  ok(Pp.parseVendor(MANGLED_HEADER).fyYears === 2,
    '★ parseVendor: fyYears ทนหัวตารางป้ายเพี้ยน (FYFY2025) — ตรวจแค่ /^\\s*TTM\\b/ ไม่ใช่ทั้งแพตเทิร์น FY\\d{4}',
    String(Pp.parseVendor(MANGLED_HEADER).fyYears));

  // ★ ระยะ 1 review ข้อ 1 (plan gap — Task 21 Step 2): เก็บบรรทัด ⚠ entity mismatch / ⚠ SA market cap /
  //   [2c] ⚠ ลง traps[] — เดิมพิมพ์อยู่ใน FUNDAMENTALS แต่ไม่เคยถูกยกขึ้นเป็นหัวข้อแยกให้ worker เห็นชัด
  const TRAP_TEXT = `[2b] หุ้นคงเหลือ/มูลค่าตลาด (StockAnalysis /statistics/):
    Shares Outstanding=100,000,000 (100.00M)
⚠ entity mismatch? NI[3] ÷ Shares[2b] = 5.00 แต่ EPS(dil)[3] = 3.10 (ต่าง 61%) — กำไรบริษัทเก่า ÷ หุ้นบริษัทใหม่ (ควบรวม) หรือ IPO/dilution ใน TTM — ตรวจงวดก่อนใช้ P/E
⚠ SA market cap 4,200M ≠ หุ้น 100M × ราคา 50 = 5,000M (ต่าง 19%) — SA cap ล้าหลัง quote ของตัวเอง
[2c] forecast (SA /forecast/): FY2026e EPS 5.10 · FY2027e EPS 5.60 — epsFwd 5.62 ตรง FY2027e ⚠ ไม่ใช่ปีงบถัดไป (ปีงบที่ปิดแล้ว = FY2025 ⇒ ถัดไป = FY2026)`;
  const trapVend = Pp.parseVendor(TRAP_TEXT);
  ok(trapVend.traps.length === 3, '★ parseVendor: traps[] เก็บครบ 3 บรรทัด (entity mismatch · SA market cap · [2c] ⚠)', JSON.stringify(trapVend.traps));
  ok(trapVend.traps.every((t) => /^⚠/.test(t) || /^\[2c\]/.test(t)), 'parseVendor: ทุกบรรทัดใน traps[] ขึ้นต้นด้วย ⚠ หรือ [2c]', JSON.stringify(trapVend.traps));
  const cleanVend = Pp.parseVendor(PREP_OUT);
  ok(cleanVend.traps.length === 0, 'parseVendor: ข้อความสะอาด (ไม่มี ⚠ กับดัก) → traps[] ว่าง', JSON.stringify(cleanVend.traps));

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

  // ★ ระยะ 2 ส่วน B (Task 6): บนใบ v2 ตัวเลข (เป้า/ปันผล/P-BV) ไม่อยู่ใน HTML แล้ว — อยู่ใน report-data.values —
  //   snapshotDiff ต้องแยกทางด้วย RV.isV2() แล้วอ่าน values ตรง ๆ แทน DV.targetCells/yieldPlan/pbvPlan ·
  //   ข้อความฟ้องต้องขึ้นต้น "values.<key>" ให้ worker รู้ว่าต้องแก้ด้วย apply-edits --set — brief ให้ตัวอย่างไว้เป๊ะ:
  //   values.analystTgt 205 vs vendor 220 → ต้องได้บรรทัด "values.analystTgt 205 → 220"
  const V2_SNAP_HTML = `<!DOCTYPE html>
<html><head>
<script type="application/json" id="stock-meta">
{"symbol":"TST2","currency":"USD","price":100,"fairValue":120,"mos":16.7,"upside":20,"pe":10,"dividendYield":2,"roe":8}
</script>
<script type="application/json" id="report-data">
{
  "v": 2,
  "fv": 120,
  "values": { "px": 100, "priceDate": "2026-09-01", "dateEra": "BE", "chgSuffix": "รอบปี", "analystTgt": 205, "dps": 1, "bvps": 40 },
  "theme": { "accent": "#000000" },
  "chart": { "data": [["ม.ค.26", 90], ["ก.ย.26", 100]], "min": 80, "max": 140, "grid": [100, 120], "currency": "$", "highlight": [0, 1] },
  "gauge": { "min": 80, "max": 140 }
}
</script>
</head><body></body></html>
`;
  const v2Far = Pp.snapshotDiff(V2_SNAP_HTML, null, { lo52: null, hi52: null, target: 220, divYieldPct: 9, analysts: null });
  ok(v2Far.includes('values.analystTgt 205 → 220'), '★ snapshotDiff v2: values.analystTgt ต่างจาก vendor → ฟ้องด้วยชื่อคีย์ "values.<key>" (ตัวอย่างตาม brief เป๊ะ)', v2Far.join(' | '));
  ok(v2Far.some((s) => /^values\.dps 1 →/.test(s)), 'snapshotDiff v2: ปันผล % จาก values.dps/px ต่างจาก vendor → ฟ้องด้วย values.dps (แทน yieldPlan)', v2Far.join(' | '));
  ok(v2Far.some((s) => /^values\.bvps 40 →/.test(s)), 'snapshotDiff v2: มี values.bvps → เตือนให้ตรวจ P/BV เอง (vendor ไม่ส่งค่านี้ในบล็อก แทน pbvPlan)', v2Far.join(' | '));
  ok(v2Far.every((s) => !/^เป้านักวิเคราะห์/.test(s) && !/^ปันผล %/.test(s) && !/^P\/BV ใบ/.test(s)), 'snapshotDiff v2: ไม่ใช้ข้อความรูปแบบ v1 (targetCells/yieldPlan/pbvPlan อ่าน HTML) อีกต่อไป', v2Far.join(' | '));

  const v2Same = Pp.snapshotDiff(V2_SNAP_HTML, null, { lo52: null, hi52: null, target: 205, divYieldPct: 1, analysts: null });
  ok(!v2Same.some((s) => /^values\.analystTgt/.test(s)) && !v2Same.some((s) => /^values\.dps/.test(s)), 'snapshotDiff v2: values ตรงกับ vendor (ในเกณฑ์) → ไม่ฟ้อง analystTgt/dps', v2Same.join(' | '));

  // ★★ ข้อ 5 (Part B fix wave, 12 ก.ย. 2569): snapshotDiff() จงใจคัดลอกสูตรปันผล%/P-BV ของ RV.derive()
  //   (tools/queue/prep.js:140-145 · เหตุผลอยู่ในคอมเมนต์ตรงนั้น) แทนการเรียก RV.derive() ตรง ๆ — pin ทั้งสองตัวไว้
  //   ด้วยกันที่นี่ (2 ชุดข้อมูลอิสระ) กัน derive() เปลี่ยนสูตร/ปัดเศษแล้ว prep.js หลุดตามไม่ทันแบบเงียบ ๆ
  //   (บทเรียนเดียวกับ median-multiples.js ที่ 26 ใบเคยได้ค่าผิดจาก controller-tool เอง — memory data-source-traps)
  {
    const rd2 = RM.readReportData(V2_SNAP_HTML).data, sm2 = RM.readStockMeta(V2_SNAP_HTML);
    const d2 = RV.derive(rd2, sm2);
    ok(v2Far.some((s) => s === `values.dps 1 → ปันผล % ใบ ${d2.yield.toFixed(2)} · vendor 9`), '★ pin: ปันผล % ที่ snapshotDiff พิมพ์ (px=100/dps=1) ตรงกับ RV.derive().yield เป๊ะ', v2Far.join(' | '));
    ok(v2Far.some((s) => s === `values.bvps 40 → P/BV ${d2.pbv.toFixed(2)}x — ตรวจกับ BVPS/ราคาใน FUNDAMENTALS เอง (vendor ไม่ส่งค่านี้ในบล็อก)`), '★ pin: P/BV ที่ snapshotDiff พิมพ์ (px=100/bvps=40) ตรงกับ RV.derive().pbv เป๊ะ', v2Far.join(' | '));

    // ชุดข้อมูลที่สอง (px/dps/bvps ต่างชุด) — กันบังเอิญตรงกันแค่คู่เดียว
    const V2_SNAP_HTML2 = `<!DOCTYPE html>
<html><head>
<script type="application/json" id="stock-meta">
{"symbol":"TST3","currency":"USD","price":250,"fairValue":300,"mos":16.7,"upside":20,"pe":10,"dividendYield":1.5,"roe":8}
</script>
<script type="application/json" id="report-data">
{
  "v": 2,
  "fv": 300,
  "values": { "px": 250, "priceDate": "2026-09-01", "dateEra": "BE", "chgSuffix": "รอบปี", "analystTgt": 280, "dps": 3.75, "bvps": 61.2 },
  "theme": { "accent": "#000000" },
  "chart": { "data": [["ม.ค.26", 230], ["ก.ย.26", 250]], "min": 200, "max": 320, "grid": [250, 280], "currency": "$", "highlight": [0, 1] },
  "gauge": { "min": 200, "max": 320 }
}
</script>
</head><body></body></html>
`;
    const v2Far2 = Pp.snapshotDiff(V2_SNAP_HTML2, null, { lo52: null, hi52: null, target: null, divYieldPct: 9, analysts: null });
    const rd3 = RM.readReportData(V2_SNAP_HTML2).data, sm3 = RM.readStockMeta(V2_SNAP_HTML2);
    const d3 = RV.derive(rd3, sm3);
    ok(v2Far2.some((s) => s === `values.dps 3.75 → ปันผล % ใบ ${d3.yield.toFixed(2)} · vendor 9`), '★ pin (ชุดที่ 2): ปันผล % ที่ snapshotDiff พิมพ์ (px=250/dps=3.75) ตรงกับ RV.derive().yield เป๊ะ', v2Far2.join(' | '));
    ok(v2Far2.some((s) => s === `values.bvps 61.2 → P/BV ${d3.pbv.toFixed(2)}x — ตรวจกับ BVPS/ราคาใน FUNDAMENTALS เอง (vendor ไม่ส่งค่านี้ในบล็อก)`), '★ pin (ชุดที่ 2): P/BV ที่ snapshotDiff พิมพ์ (px=250/bvps=61.2) ตรงกับ RV.derive().pbv เป๊ะ', v2Far2.join(' | '));
  }

  const tpl = fs.readFileSync(path.join(ROOT, '_template', 'agent-prompt.md'), 'utf8');
  const p = Pp.assemblePrompt(tpl, { SYMBOL: 'AAPL', MARKET: 'US', MODE: 'UPDATE-LIGHT', WORKTREE: '/wt', CURRENT_TAGS: 'consumer-tech', MEDIANS: '=== ตัวคูณมัธยฐานย้อนหลัง: AAPL ===\n  ★ มัธยฐาน 28.0x', FUNDAMENTALS: PREP_OUT }, Pp.extraBlock({ lightRule: 'legacy', sym: 'AAPL', mode: 'UPDATE-LIGHT', prePatched: '2026-09-11', oldPrice: 297.21, price: 301.5, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 3.66, snap: ['เป้า ใบ 300 · vendor 312'], medWarn: [], hard: false, hardWhy: '' }));
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
  const esc = Pp.extraBlock({ lightRule: 'legacy', sym: 'A', mode: 'UPDATE', escalated: true, prePatched: null, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 3.66, snap: [], medWarn: [], hard: false, hardWhy: '' });
  ok(/ยกระดับจาก UPDATE-LIGHT เป็น UPDATE เต็ม/.test(esc) && /โหมดในหัว prompt เปลี่ยนแล้ว/.test(esc), 'extraBlock: escalated → บอกว่าโหมดในหัว prompt เปลี่ยนแล้ว', esc);
  const noEsc = Pp.extraBlock({ lightRule: 'legacy', sym: 'A', mode: 'UPDATE-LIGHT', escalated: false, prePatched: null, baseEPS: 7.3, epsTTM: 7.36, epsScreen: 0.8, snap: [], medWarn: [], hard: false, hardWhy: '' });
  ok(!/ยกระดับ/.test(noEsc) && /FV เดิมยืนได้/.test(noEsc), 'extraBlock: EPS screen ≤2% → ไม่มีคำว่ายกระดับ', noEsc);

  // #7: prompt ต้องบอก worker ว่ามี EPS จริงกี่ปี ก่อนเขียนป้าย "P/E เฉลี่ย ~N ปี"
  const fy3 = Pp.extraBlock({ sym: 'A', mode: 'UPDATE', prePatched: null, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 0.8, snap: [], medWarn: [], hard: false, hardWhy: '', fyYears: 3 });
  ok(/FY ที่มี EPS จริง: 3 ปี — ป้าย "P\/E เฉลี่ย ~M ปี" ห้ามเกิน 3/.test(fy3), 'extraBlock: fyYears=3 → บรรทัดเตือนป้าย P/E เฉลี่ย', fy3);
  const fyNone = Pp.extraBlock({ sym: 'A', mode: 'UPDATE', prePatched: null, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 0.8, snap: [], medWarn: [], hard: false, hardWhy: '', fyYears: null });
  ok(!/FY ที่มี EPS จริง/.test(fyNone), 'extraBlock: fyYears ไม่รู้ (null) → ไม่พิมพ์บรรทัดเดา', fyNone);

  // ★ ระยะ 1 review ข้อ 1 (plan gap): extraBlock ต้องพิมพ์หัวข้อ "กับดักที่ prep พบ" + bullet ต่อกับดัก เมื่อมี traps
  const withTraps = Pp.extraBlock({ sym: 'A', mode: 'UPDATE', prePatched: null, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 0.8, snap: [], medWarn: [], hard: false, hardWhy: '', traps: ['⚠ entity mismatch? …', '⚠ SA market cap …'] });
  ok(/กับดักที่ prep พบ \(ต้องจัดการก่อนเขียนเลข\)/.test(withTraps) && withTraps.includes('⚠ entity mismatch? …') && withTraps.includes('⚠ SA market cap …'),
    '★ extraBlock: traps ไม่ว่าง → พิมพ์หัวข้อ + bullet ต่อกับดักครบ', withTraps);
  const noTraps = Pp.extraBlock({ sym: 'A', mode: 'UPDATE', prePatched: null, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 0.8, snap: [], medWarn: [], hard: false, hardWhy: '', traps: [] });
  ok(!/กับดักที่ prep พบ/.test(noTraps), 'extraBlock: traps ว่าง → ไม่พิมพ์หัวข้อ', noTraps);
  const untraps = Pp.extraBlock({ sym: 'A', mode: 'UPDATE', prePatched: null, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 0.8, snap: [], medWarn: [], hard: false, hardWhy: '' });
  ok(!/กับดักที่ prep พบ/.test(untraps), 'extraBlock: ไม่ส่ง traps เลย → ไม่พิมพ์หัวข้อ (back-compat กับ call site เก่า)', untraps);

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

  // #7 (GABLE): checkFyYears — ป้าย "P/E เฉลี่ย ~N ปี" (f55 ของ manifest) ต้องไม่เกินจำนวน FY ที่มี EPS จริง
  ok(/P\/E เฉลี่ย ~5 ปี.*GABLE/.test(Pc.checkFyYears(5, 3)), 'checkFyYears: f55=5 > fyYears=3 → ฟ้อง (เคส GABLE)', Pc.checkFyYears(5, 3));
  ok(Pc.checkFyYears(3, 3) === null, 'checkFyYears: f55=3 == fyYears=3 → ไม่ฟ้อง (พอดี ไม่ใช่เกิน)');
  ok(Pc.checkFyYears(2, 3) === null, 'checkFyYears: f55=2 < fyYears=3 → ไม่ฟ้อง');
  ok(Pc.checkFyYears(null, 3) === null, 'checkFyYears: ไม่มีการ์ด (f55 null) → เทียบไม่ได้ ไม่ฟ้อง');
  ok(Pc.checkFyYears(5, null) === null, 'checkFyYears: ไม่รู้ fyYears (prep ยังไม่ได้บันทึก) → เทียบไม่ได้ ไม่ฟ้อง');
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

// ── 19c) preflight: earningsAfterOf จากปฏิทินงบ (Task 17 · WS6 ข้อ 2)
//   ★ ส่วนบริสุทธิ์ — ฉีดปฏิทิน + ตัวอ่านรายงานเอง (ห้ามแตะ reports/ จริงตามหัวไฟล์นี้) ──
{
  const P = require('../tools/queue/preflight.js');
  // ★ ใช้ชื่อที่ไม่มีใน reports/ (แบบเดียวกับบล็อก 6b) — plan() อ่าน stock-meta จากดิสก์ถ้าไฟล์มีจริง
  const cal = { symbols: { XAAA: { last: '2026-07-30', next: '2026-10-29' }, XBBB: { last: '2026-07-30', next: null }, XCCC: { last: null, next: null } } };
  const html = {
    XAAA: '<footer>ข้อมูล ณ 1 ก.ค. 2569</footer>',      // วิเคราะห์ก่อนงบออก
    XBBB: '<footer>ข้อมูล ณ 5 ส.ค. 2569</footer>',      // วิเคราะห์หลังงบออก
    XCCC: '<footer>ข้อมูล ณ 1 ม.ค. 2569</footer>',
    NOFOOT: '<footer>ไม่มีวันที่ในฟุตเตอร์</footer>',
  };
  const f = P.earningsAfterOfWith(cal, (s) => html[s] || null);
  ok(f('XAAA') === true, 'earningsAfterOf: footer เก่ากว่าวันงบล่าสุด → true (ยก flip เป็น LIGHT)');
  ok(f('XBBB') === false, 'earningsAfterOf: footer ใหม่กว่าวันงบล่าสุด → false');
  ok(f('XCCC') === null, 'earningsAfterOf: ยังไม่มี last (ปฏิทินรอบแรก) → null = นโยบายอายุอย่างเดียว');
  ok(f('NOPE') === null, 'earningsAfterOf: ไม่มีใน symbols → null');
  ok(P.earningsAfterOfWith({ symbols: {} }, () => null)('XAAA') === null && P.earningsAfterOfWith(null, () => null)('XAAA') === null, 'earningsAfterOf: ไม่มีปฏิทินเลย → null ทุกตัว (ระบบเดินได้เหมือนเดิม)');
  ok(P.earningsAfterOfWith(cal, () => null)('XAAA') === null, 'earningsAfterOf: อ่านรายงานไม่ได้ → null ไม่ใช่ false');
  ok(P.earningsAfterOfWith({ symbols: { NOFOOT: { last: '2026-07-30' } } }, (s) => html[s])('NOFOOT') === null, 'earningsAfterOf: footer ไม่มีวันที่ → null');
  // ต่อกับ triage จริง: flip + งบออกหลังวิเคราะห์ → LIGHT/earnings (plan ส่งตัวนี้เข้า triage ตรง ๆ)
  const rows = P.plan([{ symbol: 'XAAA', reason: 'mos-sign-flip' }], '2026-09-12',
    { ageLimit: 0, lightRule: 'legacy', footerAgeOf: () => 3, earningsAfterOf: f });
  ok(rows[0].bucket === 'LIGHT' && rows[0].escalated === 'earnings', 'plan: ส่ง earningsAfterOf เข้า triage แล้ว flip ถูกยกเป็น LIGHT');
}

// ── 19d) ship: model ต้องมีก่อนลงมือ (C1 · carried จากรีวิว Task 15/16)
//   เดิม trailer(rec.model) ระเบิดท้ายสุด — หลัง verify (นาที ๆ) + preserve-dates + build ⇒ เสียเวลาฟรีแล้วค่อยบอก ──
{
  const Q = require('../tools/queue/ship.js');
  ok(Q.resolveModel('AAPL', { model: 'sonnet' }) === 'sonnet', 'resolveModel: อ่านจาก state');
  ok(Q.resolveModel('AAPL', { model: 'sonnet' }, 'opus') === 'opus', 'resolveModel: --model ชนะค่าใน state');
  ok(Q.resolveModel('AAPL', {}, 'opus') === 'opus', 'resolveModel: ไม่มีใน state แต่ใส่ --model → ผ่าน');
  {
    let threw = null;
    try { Q.resolveModel('AAPL', {}, null); } catch (e) { threw = e.message; }
    ok(/^AAPL: ไม่มี model ใน state/.test(threw || '') && /npm run queue -- prep AAPL/.test(threw || '') && /--model sonnet\|opus/.test(threw || ''), 'resolveModel: ไม่มี model ใน state → ปฏิเสธพร้อมวิธีแก้', String(threw));
  }
  // model ถูกส่งมาแล้ว (state หรือ --model) แต่ไม่รู้จัก → ข้อความต้องต่างจากกรณี "ไม่มี" (ชี้ชื่อโมเดลที่พิมพ์ผิด ไม่ใช่บอกให้ไปรัน prep)
  for (const [rec, over, label] of [[{ model: 'haiku' }, null, 'model ที่ไม่รู้จักใน state'], [{ model: 'sonnet' }, 'haiku', '--model ที่ไม่รู้จัก']]) {
    let threw = null;
    try { Q.resolveModel('AAPL', rec, over); } catch (e) { threw = e.message; }
    ok(/^AAPL: โมเดล "haiku" ไม่รู้จัก \(ใช้ sonnet\|opus\)$/.test(threw || ''), `resolveModel: ${label} → ปฏิเสธด้วยชื่อโมเดลที่พิมพ์ผิด (ไม่ใช่ "ไม่มี model ใน state")`, String(threw));
  }

  // open-item #27: guard postcheck ของ shipStock ต้องผูกกับขอบเขตรอบ (roundStart) — postcheck:'pass' ที่ค้างจาก
  // รอบก่อน (flaggedAt เก่ากว่า startedAt ของรอบนี้) ต้องไม่พา ship <SYM> commit ได้โดยไม่สั่ง postcheck ใหม่
  ok(Q.postcheckGuard('AAPL', { postcheck: null }, '2026-09-10') != null, 'postcheckGuard: ไม่เคย postcheck → ปฏิเสธ');
  ok(Q.postcheckGuard('AAPL', { postcheck: 'review' }, '2026-09-10') != null, 'postcheckGuard: postcheck=review → ปฏิเสธ');
  ok(Q.postcheckGuard('AAPL', { postcheck: 'pass', flaggedAt: '2026-09-12' }, '2026-09-10') === null, 'postcheckGuard: postcheck=pass ของรอบนี้ (flaggedAt ≥ startedAt) → ผ่าน');
  {
    const stale = Q.postcheckGuard('AAPL', { postcheck: 'pass', flaggedAt: '2026-09-01' }, '2026-09-10');
    ok(stale != null && /ค้างจากรอบก่อน/.test(stale) && /postcheck ผ่านแล้ว/.test(stale) && /--force/.test(stale), 'postcheckGuard: open-item #27 — postcheck=pass แต่ flaggedAt เก่ากว่า startedAt (ค้างจากรอบก่อน) → ปฏิเสธ ไม่ใช่ผ่านเงียบ ๆ', String(stale));
  }
  ok(Q.postcheckGuard('AAPL', { postcheck: 'pass', flaggedAt: '2026-09-01' }, null) === null, 'postcheckGuard: ไม่รู้ startedAt (state เก่า/เทส) → นับด้วยเสมอ เหมือน S.inRound');
  ok(Q.postcheckGuard('AAPL', { postcheck: 'pass' }, '2026-09-10') === null, 'postcheckGuard: แถวไม่มี flaggedAt เลย (ของเก่าก่อนมีฟีเจอร์รอบ) → นับด้วยเสมอ');
  // รีวิว Task 10 F1: guard ต้องตัดสินจาก "postcheck ถูกสั่งในรอบนี้ไหม" (postcheckAt) ไม่ใช่ "flag เป็นของรอบนี้ไหม" (flaggedAt)
  // เคสจริงที่เจอบ่อยขึ้นหลัง #26: แถวอายุสังเคราะห์คง flaggedAt เดิมไว้ ⇒ พอ flag จริงเปิดรอบใหม่ แถวนั้นหลุดรอบถาวร
  // แต่ postcheck วันนี้ในรอบนี้จริง ๆ — เดิมยังถูกปฏิเสธ และข้อความสั่งให้ "postcheck ใหม่" ซึ่งแก้ไม่ได้ (postcheck ไม่แตะ flaggedAt) ⇒ เหลือแค่ --force
  ok(Q.postcheckGuard('OLD', { postcheck: 'pass', flaggedAt: '2026-09-01', postcheckAt: '2026-09-05' }, '2026-09-05') === null,
    'postcheckGuard: F1 — flaggedAt เก่ากว่ารอบ แต่ postcheckAt เป็นของรอบนี้ (≥ startedAt) → ผ่าน (postcheck สดจริง ไม่ใช่ค้าง)');
  ok(Q.postcheckGuard('OLD', { postcheck: 'pass', flaggedAt: '2026-09-01', postcheckAt: '2026-09-08' }, '2026-09-05') === null,
    'postcheckGuard: F1 — postcheckAt ใหม่กว่า startedAt → ผ่าน');
  {
    // เคสที่ #27 ตั้งใจบล็อกจริง ๆ ต้องยังถูกบล็อกเหมือนเดิม: postcheck ค้างจากรอบก่อน (postcheckAt เก่ากว่า startedAt ด้วย)
    const stale2 = Q.postcheckGuard('OLD', { postcheck: 'pass', flaggedAt: '2026-09-01', postcheckAt: '2026-09-02' }, '2026-09-05');
    ok(stale2 != null && /ค้างจากรอบก่อน/.test(stale2) && /--force/.test(stale2),
      'postcheckGuard: F1 — postcheckAt เก่ากว่า startedAt ด้วย (ค้างจากรอบก่อนจริง) → ยังปฏิเสธเหมือนเดิม', String(stale2));
  }
}

// ── 19e) parseArgs: --flag= (ค่าว่าง) ต้องล้มเหมือนไม่ใส่ค่า (C2 · carried) ──
{
  const A = require('../tools/queue/args.js');
  for (const argv of [['ship', 'AAPL', '--tags='], ['prep', 'AAPL', '--mode=']]) {
    const flag = argv[2].slice(0, -1);
    let threw = null;
    try { A.parseArgs(argv).val(flag); } catch (e) { threw = e.message; }
    ok(threw === `${flag} ต้องมีค่า`, `parseArgs: ${flag}= (ค่าว่าง) → error เดียวกับไม่ใส่ค่า`, String(threw));
  }
  ok(A.parseArgs(['ship', 'AAPL', '--message= ']).val('--message') === ' ', 'parseArgs: ค่าที่เป็นช่องว่างจริง ๆ ยังผ่าน (ไม่ trim ให้)');
  // boolean flag ที่พิมพ์มาพร้อมค่า: เดิมแตกเป็น ['--force','true'] แล้ว 'true' กลายเป็น positional ตัวแรก ⇒ ship หุ้นชื่อ "TRUE"
  let boolThrew = null, parsedBool = null;
  try { parsedBool = A.parseArgs(['ship', '--force=true', 'AAPL']); } catch (e) { boolThrew = e.message; }
  ok(boolThrew === '--force ไม่รับค่า' && parsedBool === null, "parseArgs: ship --force=true AAPL → throw '--force ไม่รับค่า' (ไม่ใช่ sym = 'TRUE')", String(boolThrew) + ' · sym=' + (parsedBool && parsedBool.sym));
  const okForce = A.parseArgs(['ship', 'AAPL', '--force']);
  ok(okForce.has('--force') === true && okForce.sym === 'AAPL', 'parseArgs: --force แบบ boolean ปกติยังใช้ได้เหมือนเดิม', okForce.sym);
}

// ── 19f) รอบของคิว (Task 21) — state อยู่ข้ามรอบ (Task 15) ⇒ ฟิลด์ "ของรอบ" ต้องไม่ข้ามรอบไปด้วย ──
//   นิยามรอบใหม่อยู่ในหัว roundStart() ของ tools/queue/preflight.js
{
  const P = require('../tools/queue/preflight.js');
  const Sh = require('../tools/queue/ship.js');

  // roundStart — flag จริงที่ใหม่กว่า startedAt เดิม = รอบใหม่ · เอา flaggedAt ที่เก่าสุดในกลุ่มนั้น
  ok(P.roundStart([{ flaggedAt: '2026-09-12' }, { flaggedAt: '2026-09-11' }], '2026-09-05', '2026-09-12') === '2026-09-11', 'roundStart: flag ใหม่หลายวัน → startedAt = วันเก่าสุดในกลุ่มที่ใหม่กว่าเดิม', String(P.roundStart([{ flaggedAt: '2026-09-12' }, { flaggedAt: '2026-09-11' }], '2026-09-05', '2026-09-12')));
  ok(P.roundStart([{ flaggedAt: '2026-09-01' }, { flaggedAt: '2026-09-05' }], '2026-09-05', '2026-09-12') === '2026-09-05', 'roundStart: ไม่มี flag ใหม่กว่า startedAt → รอบเดิม');
  ok(P.roundStart([{ flaggedAt: '2026-09-12', synthetic: true }], '2026-09-05', '2026-09-12') === '2026-09-05', 'roundStart: แถวอายุ (synthetic) ไม่ใช่ flag → ไม่เปิดรอบใหม่ (ไม่งั้นรอบรีเซ็ตเองทุกวัน)');
  ok(P.roundStart([], null, '2026-09-12') === '2026-09-12', 'roundStart: ยังไม่เคยมีรอบและไม่มี flag → วันนี้');

  // (i) LIGHT ที่ ship ไปแล้วรอบก่อน แล้วโดน flag ใหม่ → กลับมาเป็นงานค้าง (ไม่งั้น ship --prepatch ปิด issue · status นับว่า push แล้ว · ship <SYM> ผ่าน guard)
  const shipped = { reason: 'drift-gt-15pct', bucket: 'LIGHT', flaggedAt: '2026-09-01', oldPrice: 10, currency: 'USD', prePatched: '2026-09-01', prepAt: '2026-09-01', mode: 'UPDATE-LIGHT', model: 'sonnet', postcheck: 'pass', postcheckAt: '2026-09-02', shippedAt: '2026-09-02' };
  const again = P.upsertRow(shipped, { symbol: 'X', reason: 'drift-gt-15pct', bucket: 'LIGHT', flaggedAt: '2026-09-12', oldPrice: 12, currency: 'USD', footerAge: 40, skip: null });
  ok(!again.shippedAt && !again.postcheck && !again.postcheckAt && !again.prepAt && !again.mode && !again.model && !again.prePatched && !again.prepatchShippedAt && !again.prePatchRejected, 'upsertRow: flag ใหม่บนแถวที่ ship แล้ว → ล้างฟิลด์ของรอบก่อนครบชุด (กลับเป็นงานค้าง)', JSON.stringify(again));
  ok(again.flaggedAt === '2026-09-12' && again.oldPrice === 12 && again.bucket === 'LIGHT' && again.reason === 'drift-gt-15pct', 'upsertRow: ค่าที่ preflight เป็นเจ้าของถูกเขียนทับด้วยของรอบใหม่', JSON.stringify(again));

  // flag เดิม = preflight รันซ้ำในรอบเดียวกัน → ห้ามล้าง (ไม่งั้น ship <SYM> ตายที่ guard postcheck/resolveModel)
  const inflight = { reason: 'drift-gt-15pct', bucket: 'LIGHT', flaggedAt: '2026-09-12', prepAt: '2026-09-12', mode: 'UPDATE-LIGHT', model: 'sonnet', postcheck: 'pass' };
  const same = P.upsertRow(inflight, { symbol: 'X', reason: 'drift-gt-15pct', bucket: 'LIGHT', flaggedAt: '2026-09-12', oldPrice: 10, currency: 'USD', footerAge: 40, skip: null });
  ok(same.postcheck === 'pass' && same.model === 'sonnet' && same.prepAt === '2026-09-12', 'upsertRow: flag เดิม (รัน preflight ซ้ำในรอบเดียวกัน) → คงงานที่ทำไปแล้ว', JSON.stringify(same));
  const synSame = P.upsertRow({ reason: 'age-gt-90d', bucket: 'LIGHT', flaggedAt: '2026-09-12', prepAt: '2026-09-12', model: 'sonnet' }, { symbol: 'A', reason: 'age-gt-90d', synthetic: true, bucket: 'LIGHT', flaggedAt: '2026-09-12', oldPrice: null, currency: null, footerAge: 200, skip: null });
  ok(synSame.prepAt === '2026-09-12' && synSame.model === 'sonnet', 'upsertRow: แถวอายุของวันเดียวกัน → ไม่ล้าง prepAt/model', JSON.stringify(synSame));
  const synNew = P.upsertRow({ reason: 'age-gt-90d', bucket: 'LIGHT', flaggedAt: '2026-09-11', prepAt: '2026-09-11', model: 'sonnet' }, { symbol: 'A', reason: 'age-gt-90d', synthetic: true, bucket: 'LIGHT', flaggedAt: '2026-09-12', oldPrice: null, currency: null, footerAge: 200, skip: null });
  ok(!synNew.prepAt && !synNew.model, 'upsertRow: แถวอายุของวันใหม่ → ล้างของรอบก่อน', JSON.stringify(synNew));
  // ship ไปแล้วแต่ flag เดิมยังอยู่ใน price-flags.json (cron ยังไม่รันใหม่) — preflight ซ้ำในรอบเดิมห้ามล้าง shippedAt ไม่งั้นตัวนับ X/Y ถอยหลัง
  const shippedSameRound = P.upsertRow({ reason: 'drift-gt-15pct', bucket: 'LIGHT', flaggedAt: '2026-09-12', model: 'sonnet', postcheck: 'pass', shippedAt: '2026-09-12' }, { symbol: 'X', reason: 'drift-gt-15pct', bucket: 'LIGHT', flaggedAt: '2026-09-12', oldPrice: 10, currency: 'USD', footerAge: 0, skip: 'สด ≤7 วัน (footer)' });
  ok(shippedSameRound.shippedAt === '2026-09-12' && shippedSameRound.model === 'sonnet', 'upsertRow: ship แล้วแต่ flag เดิม (รอบเดียวกัน) → คง shippedAt ไว้', JSON.stringify(shippedSameRound));

  // (ii) prePatchRejected ของรอบก่อน — pre-patch รอบนี้ผ่าน gate ต้องถูกลบ ไม่ใช่ค้างบล็อกการปิด issue ตลอดไป
  const st = { OKSYM: { bucket: 'LIGHT', prePatchRejected: '2026-09-01' }, BADSYM: { bucket: 'LIGHT' } };
  P.applyGateResult(st, ['OKSYM', 'BADSYM'], ['BADSYM'], '2026-09-12');
  ok(st.OKSYM.prePatchRejected === undefined && st.OKSYM.prePatched === '2026-09-12', 'applyGateResult: ผ่าน gate → ประทับ prePatched + ล้าง prePatchRejected ของรอบก่อน', JSON.stringify(st.OKSYM));
  ok(st.BADSYM.prePatchRejected === '2026-09-12' && !st.BADSYM.prePatched, 'applyGateResult: ตก gate → ประทับ prePatchRejected อย่างเดียว', JSON.stringify(st.BADSYM));

  // (iii) closeIssueIfNoLlmRows มองเฉพาะแถวของรอบนี้
  let n = 0;
  const spy = () => { n++; };
  const quiet = (fn) => { const orig = console.log; console.log = () => {}; try { return fn(); } finally { console.log = orig; } };
  const oldRound = quiet(() => Sh.closeIssueIfNoLlmRows({ OLDLIGHT: { bucket: 'LIGHT', flaggedAt: '2026-09-01' }, FLIP: { bucket: 'PREPATCH', flaggedAt: '2026-09-12' } }, spy, '2026-09-10'));
  ok(oldRound === true && n === 1, 'closeIssueIfNoLlmRows: LIGHT ค้างจากรอบก่อน (flaggedAt < startedAt) ไม่บล็อก issue ของรอบนี้', String(n));
  const thisRound = quiet(() => Sh.closeIssueIfNoLlmRows({ NEWLIGHT: { bucket: 'LIGHT', flaggedAt: '2026-09-12' } }, spy, '2026-09-10'));
  ok(thisRound === false && n === 1, 'closeIssueIfNoLlmRows: LIGHT ของรอบนี้ยังบล็อกตามเดิม', String(n));
  const noStart = quiet(() => Sh.closeIssueIfNoLlmRows({ OLDLIGHT: { bucket: 'LIGHT', flaggedAt: '2026-09-01' } }, spy, null));
  ok(noStart === false && n === 1, 'closeIssueIfNoLlmRows: ไม่รู้ startedAt (state เก่า/เทส) → นับทุกแถวเหมือนเดิม', String(n));
  const S4 = require('../tools/queue/state.js');
  ok(S4.inRound({ flaggedAt: '2026-09-01' }, '2026-09-10') === false && S4.inRound({ flaggedAt: '2026-09-12' }, '2026-09-10') === true && S4.inRound({}, '2026-09-10') === true, 'inRound: เทียบ flaggedAt กับ startedAt · แถวไม่มี flaggedAt = นับด้วยเสมอ');

  // (iv) ★ (รีวิว C) คิวที่ถือ flag จาก 2 วันต่างกันโดยไม่มีอะไรเปลี่ยน — preflight รันซ้ำห้ามเลื่อน startedAt
  //      เกณฑ์เดิม ("flaggedAt > prev" ล้วน) เลื่อนรอบทุกครั้งที่รันซ้ำ ⇒ แถวเก่าสุดหลุดรอบทั้งที่ยังค้าง
  //      ไล่ลำดับเหมือน preflight จริง: roundStart(ก่อน) → upsertRow(หลัง)
  const mk = (symbol, flaggedAt) => ({ symbol, reason: 'drift-gt-15pct', bucket: 'LIGHT', flaggedAt, oldPrice: 10, currency: 'USD', footerAge: 40, skip: null });
  const rowsAB = [mk('A', '2026-09-01'), mk('B', '2026-09-03')];
  const st1 = { startedAt: null, stocks: {} };
  const runPreflight = (rows, today) => {
    st1.startedAt = P.roundStart(rows, st1.startedAt || null, today, st1.stocks);
    for (const r of rows) st1.stocks[r.symbol] = P.upsertRow(st1.stocks[r.symbol], r);
    return st1.startedAt;
  };
  ok(runPreflight(rowsAB, '2026-09-12') === '2026-09-01', 'roundStart: รันแรก → startedAt = flaggedAt เก่าสุดของ flag ที่ state ยังไม่เคยจำ', String(st1.startedAt));
  ok(runPreflight(rowsAB, '2026-09-13') === '2026-09-01', 'roundStart: preflight รันซ้ำ คิวเดิม (flag คนละวัน) → ไม่มี flag ใหม่ ⇒ startedAt ไม่ขยับ (รีวิว C)', String(st1.startedAt));
  ok(S4.inRound(st1.stocks.A, st1.startedAt) === true && S4.inRound(st1.stocks.B, st1.startedAt) === true, 'roundStart: รันซ้ำแล้วทั้งสองแถวยังอยู่ในรอบ (A ไม่หลุดไปซ่อนจาก status/ปิด issue)', `${st1.startedAt} A=${st1.stocks.A.flaggedAt} B=${st1.stocks.B.flaggedAt}`);
  ok(runPreflight([...rowsAB, mk('C', '2026-09-13')], '2026-09-13') === '2026-09-13', 'roundStart: มี flag ใหม่จริง (C) → เปิดรอบใหม่ที่วันของ flag นั้น', String(st1.startedAt));
  ok(runPreflight([mk('A', '2026-09-14'), mk('B', '2026-09-03')], '2026-09-14') === '2026-09-14', 'roundStart: cron เขียน flag เดิมด้วยวันใหม่ → นับเป็น flag ใหม่ (flaggedAt ต่างจากที่ state จำ)', String(st1.startedAt));
}

// ── 19g) ship: status — แถวที่ค้างจากรอบก่อนต้องไม่หายเงียบ (รีวิว C · คู่กับ roundStart ข้อ (iv)) ──
{
  const S5 = require('../tools/queue/state.js');
  const Sh5 = require('../tools/queue/ship.js');
  const backup = S5.load();
  const cap = (fn) => { const lines = []; const orig = console.log; console.log = (s) => lines.push(String(s)); try { fn(); } finally { console.log = orig; } return lines; };
  S5.save({ startedAt: '2026-09-10', stocks: {
    INROUND: { bucket: 'LIGHT', flaggedAt: '2026-09-12' },                            // งานของรอบนี้ที่ยังไม่เริ่ม
    OLDPEND: { bucket: 'LIGHT', flaggedAt: '2026-09-01' },                            // ค้างจากรอบก่อน — ต้องขึ้นบรรทัดใหม่
    OLDDONE: { bucket: 'LIGHT', flaggedAt: '2026-09-01', shippedAt: '2026-09-02' },    // รอบก่อนแต่จบแล้ว = ไม่ค้าง
    OLDSKIP: { bucket: 'FULL', flaggedAt: '2026-09-01', skip: 'สด ≤7 วัน (footer)' },   // รอบก่อนแต่ข้ามไปแล้ว = ไม่ค้าง
    OLDFLIP: { bucket: 'PREPATCH', flaggedAt: '2026-09-01' },                         // ไม่ต้องส่ง LLM = ไม่นับว่าค้าง
  } });
  const lines = cap(() => Sh5.status());
  ok(lines.length === 10, 'status: มีแถวค้างจากรอบก่อน → เพิ่มอีก 1 บรรทัด (รวม 10)', String(lines.length));
  // open-item #28: ข้อความชัดขึ้น — "ยังไม่นับเป็น flag ใหม่ของรอบนี้" (ruling: ไม่แก้พฤติกรรม roundStart)
  ok(/^ค้างจากรอบก่อน — ยังไม่นับเป็น flag ใหม่ของรอบนี้ \(1\): OLDPEND$/.test(lines[9]), 'status: นับเฉพาะ LIGHT/FULL ของรอบก่อนที่ยังไม่ ship และไม่ skip', lines[9]);
  ok(/· 0\/1$/.test(lines[0]), 'status: X/Y ยังนับเฉพาะแถวของรอบนี้ (แถวรอบก่อนไม่เข้าตัวหาร)', lines[0]);
  ok(!lines.slice(0, 9).some((l) => /OLDPEND|OLDDONE|OLDSKIP|OLDFLIP/.test(l)), 'status: แถวรอบก่อนไม่ปนเข้าบรรทัดของรอบนี้', lines.slice(0, 9).join(' | '));
  ok((lines.find((l) => /^ยังไม่เริ่ม/.test(l)) || '').includes('INROUND'), 'status: แถวของรอบนี้ยังขึ้นตามเดิม', lines.find((l) => /^ยังไม่เริ่ม/.test(l)));
  S5.save({ startedAt: '2026-09-10', stocks: { INROUND: { bucket: 'LIGHT', flaggedAt: '2026-09-12' } } });
  ok(cap(() => Sh5.status()).length === 9, 'status: ไม่มีแถวค้างจากรอบก่อน → ไม่พิมพ์บรรทัดนั้นเลย (9 บรรทัดเท่าเดิม)');
  S5.save(backup);
}

// ── 20) ปฏิทินงบ (Task 17 · WS6 ข้อ 2) — เทส offline อยู่ไฟล์แยก คืน Promise ⇒ tally ต้องรอก่อนนับ ──
//   require แล้ว throw ตั้งแต่ sync (ยังไม่มีไฟล์/ไวยากรณ์พัง) ก็นับเป็น fail ไม่ใช่ปล่อยให้ทั้งชุดระเบิดเงียบ
let pending = null;
try { pending = require('./earnings-calendar-test.js')(ok); }
catch (e) { nFail++; console.error('✗ earnings-calendar-test ระเบิด (sync) — ' + e.message); }

// ── 21) apply-edits: --set/--del/--set-meta บน report-data/stock-meta v2 (Task 5 — สัญญา worker v2) ──
//   ★ ไฟล์ชั่วคราวเขียนใต้ os.tmpdir() เอง (ไม่แตะ reports/ ตามหัวไฟล์นี้) · ยิงจริงผ่าน sh.run (spawnSync
//   ให้ pipe ว่างที่ EOF ทันทีเมื่อไม่มี stdin — จำลอง "รัน --set แบบ one-liner ไม่มี heredoc" ของ SKILL 5B ได้ตรง ๆ)
{
  const sh = require('../tools/queue/sh.js');
  const AE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-edits-'));
  const readBlock = (html, id) => JSON.parse(html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`))[1]);
  const V2_HTML = `<!DOCTYPE html>
<html><head>
<script type="application/json" id="stock-meta">
{"symbol":"TST","currency":"USD","price":100,"fairValue":120,"mos":16.7,"upside":20,"pe":10,"dividendYield":2,"roe":8}
</script>
<script type="application/json" id="report-data">
{
  "v": 2,
  "fv": 120,
  "values": {
    "px": 100,
    "priceDate": "2026-09-01",
    "dateEra": "BE",
    "chgSuffix": "รอบปี",
    "eps": 9,
    "analystTgt": 130,
    "scenarios": [{"tgt": 80, "div": null}, {"tgt": 120, "div": null}, {"tgt": 160, "div": null}],
    "scnBasis": {"years": 3, "divIncluded": false, "perYear": "cagr"}
  },
  "theme": { "accent": "#000000" },
  "chart": { "data": [["ม.ค.26", 90], ["ก.ย.26", 100]], "min": 80, "max": 140, "grid": [100, 120], "currency": "$", "highlight": [0, 1] },
  "gauge": { "min": 80, "max": 140 }
}
</script>
</head><body></body></html>
`;
  const V1_HTML = `<!DOCTYPE html>
<html><head>
<script type="application/json" id="stock-meta">
{"symbol":"TST1","currency":"USD","price":100,"fairValue":120,"mos":16.7,"upside":20,"pe":10,"dividendYield":2,"roe":8}
</script>
<script type="application/json" id="report-data">
{
  "theme": { "accent": "#000000" },
  "chart": { "data": [["ม.ค.26", 90], ["ก.ย.26", 100]], "min": 80, "max": 140, "grid": [100, 120], "fairLine": 120, "currency": "$", "highlight": [0, 1] },
  "gauge": { "min": 80, "max": 140, "cur": 100, "fair": 120 },
  "fv": 120
}
</script>
</head><body></body></html>
`;
  const writeTmp = (name, content) => { const p = path.join(AE_DIR, name); fs.writeFileSync(p, content); return p; };

  // (a) success path ตาม brief Step 1 เป๊ะ: --set × 2 + --del × 1 บนไฟล์ v2
  {
    const tmp = writeTmp('ok.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set', 'values.eps=9.57', '--set', 'fv=210', '--del', 'values.analystTgt']);
    ok(r.code === 0, 'apply-edits --set×2/--del×1: exit 0', r.err || r.out);
    const out = fs.readFileSync(tmp, 'utf8');
    const rd = readBlock(out, 'report-data');
    ok(rd.values.eps === 9.57, 'apply-edits --set: values.eps เปลี่ยนจริง', String(rd.values.eps));
    ok(rd.fv === 210, 'apply-edits --set: fv (top-level) เปลี่ยนจริง', String(rd.fv));
    ok(!('analystTgt' in rd.values), 'apply-edits --del: values.analystTgt หายจริง', JSON.stringify(rd.values));
    ok(out.includes('["ม.ค.26", 90]'), 'apply-edits: เขียนกลับด้วย styledRD (จุดกราฟบรรทัดเดียว)', out);
    // fix round 1 · R1: --set fv=<n> บนไฟล์ v2 ต้องซิงก์กระจก stock-meta.fairValue ให้เองในคำสั่งเดียวกัน
    const sm = readBlock(out, 'stock-meta');
    ok(sm.fairValue === 210, 'apply-edits --set fv: stock-meta.fairValue ซิงก์ตาม rd.fv อัตโนมัติ (mirror)', String(sm.fairValue));
  }

  // (a2) path แบบ a.b.c รองรับ array index เป็นเลขล้วน (scenarios.N.field) ตามที่ Step 2 ระบุไว้
  {
    const tmp = writeTmp('arr.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set', 'values.scenarios.1.tgt=999']);
    ok(r.code === 0, 'apply-edits --set values.scenarios.1.tgt: exit 0', r.err || r.out);
    const rd = readBlock(fs.readFileSync(tmp, 'utf8'), 'report-data');
    ok(rd.values.scenarios[1].tgt === 999 && rd.values.scenarios[0].tgt === 80, 'apply-edits --set: array index ตาม path (scenarios.1.tgt) แก้เฉพาะตัวที่ระบุ', JSON.stringify(rd.values.scenarios));
  }

  // (b) --set values.px=abc → parse ไม่ผ่านทั้ง JSON/number/boolean/null → exit 1 ไม่เขียนไฟล์
  {
    const tmp = writeTmp('badval.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set', 'values.px=abc']);
    ok(r.code !== 0, 'apply-edits --set values.px=abc: exit ≠ 0', r.out + r.err);
    ok(fs.readFileSync(tmp, 'utf8') === V2_HTML, 'apply-edits --set ค่าพัง: ไม่เขียนไฟล์เลย (all-or-nothing)');
  }

  // (c) --set nope.x=1 → path ไม่มีแม่ (ห้ามสร้างคีย์ใหม่ตามใจ — strict) → exit 1 ไม่เขียนไฟล์
  {
    const tmp = writeTmp('nopath.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set', 'nope.x=1']);
    ok(r.code !== 0, 'apply-edits --set nope.x=1: exit ≠ 0 (path ไม่มีแม่)', r.out + r.err);
    ok(fs.readFileSync(tmp, 'utf8') === V2_HTML, 'apply-edits --set path ไม่มีแม่: ไม่เขียนไฟล์เลย');
  }

  // (d) --set บนไฟล์ v1 (ไม่มี values) → exit 1 ข้อความ "ไฟล์ v1" ไม่เขียนไฟล์ (v1 safety — ห้าม half-write)
  {
    const tmp = writeTmp('v1.html', V1_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set', 'fv=210']);
    ok(r.code !== 0 && /ไฟล์ v1/.test(r.out + r.err), 'apply-edits --set บนไฟล์ v1: exit ≠ 0 + ข้อความ "ไฟล์ v1"', r.out + r.err);
    ok(fs.readFileSync(tmp, 'utf8') === V1_HTML, 'apply-edits --set บนไฟล์ v1: ไม่เขียนไฟล์เลย (v1 ยังแก้ด้วยบล็อก @@ เท่านั้น)');
  }

  // (e) fix round 1 · R1: --set-meta fairValue=<ใหม่> บนไฟล์ **v2** ต้องถูกปฏิเสธ — report-data.fv เป็นเจ้าของเดียว
  //   ส่วน stock-meta.fairValue เป็นกระจกที่ cron (mirrorStockMetaV2) เขียนให้เองเสมอ แก้ตรง ๆ ด้วย --set-meta จะ
  //   สร้างค่าที่ไม่มีอะไรมาซิงก์ให้ตรงกับ report-data.fv อีก (เดิม test นี้ทดสอบว่า "ใช้ได้" — พฤติกรรมเดิมนั้นคือ
  //   ช่องโหว่ที่ review รอบ 1 (Finding 1) ชี้ให้แก้)
  {
    const tmp = writeTmp('setmeta.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set-meta', 'fairValue=250']);
    ok(r.code !== 0 && /--set fv/.test(r.out + r.err), 'apply-edits --set-meta fairValue บนไฟล์ v2: exit ≠ 0 + ชี้ไปใช้ --set fv', r.out + r.err);
    ok(fs.readFileSync(tmp, 'utf8') === V2_HTML, 'apply-edits --set-meta fairValue บนไฟล์ v2: ไม่เขียนไฟล์เลย');
  }

  // (e2) fix round 1 · R1: ไฟล์ **v1** ไม่มีกระจก stock-meta.fairValue (มันคือเจ้าของเดียวเอง) → --set-meta ยังใช้ได้ปกติ
  {
    const tmp = writeTmp('setmeta-v1.html', V1_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set-meta', 'fairValue=250']);
    ok(r.code === 0, 'apply-edits --set-meta fairValue บนไฟล์ v1: exit 0 (ยังใช้ได้ปกติ)', r.err || r.out);
    const sm = readBlock(fs.readFileSync(tmp, 'utf8'), 'stock-meta');
    ok(sm.fairValue === 250, 'apply-edits --set-meta fairValue บนไฟล์ v1: stock-meta.fairValue เปลี่ยนจริง', String(sm.fairValue));
  }

  // (e3) fix round 1 · R1: --set fv + --set-meta fairValue พร้อมกันบนไฟล์ v2 → ยังถูกปฏิเสธ (ไม่ว่าจะมี --set fv ด้วยหรือไม่)
  {
    const tmp = writeTmp('setmeta-combo.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set', 'fv=210', '--set-meta', 'fairValue=250']);
    ok(r.code !== 0 && /--set fv/.test(r.out + r.err), 'apply-edits --set fv + --set-meta fairValue พร้อมกัน (v2): exit ≠ 0', r.out + r.err);
    ok(fs.readFileSync(tmp, 'utf8') === V2_HTML, 'apply-edits --set fv + --set-meta fairValue พร้อมกัน (v2): ไม่เขียนไฟล์เลย (all-or-nothing)');
  }

  // (e4) fix wave F4 (final review ข้อ 4): บน fixture v2 จริง `--set fv=300` คำเดียว → กระจก stock-meta ครบ 4 คีย์
  //   (price/mos/upside/fairValue จาก RV.mirrorStockMeta ตัวเดียวกับ cron) ⇒ gate ไม่มี E30/E31
  //   (เดิมซิงก์แค่ fairValue: stock-meta mos −26.8 ขณะ MOS ที่โชว์ −11% → E30+E31 ทันที)
  {
    const FXq = require('./fixtures');
    const { expandReport } = require('../build.js');
    const { checkHtml } = require('./check-reports.js');
    const src = FXq.AAPL_V2();
    const tmp = writeTmp('fv300.html', src);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--set', 'fv=300']);
    ok(r.code === 0, 'F4 apply-edits --set fv=300 (AAPL_V2): exit 0', r.err || r.out);
    const out = fs.readFileSync(tmp, 'utf8');
    const sm = readBlock(out, 'stock-meta'), rd = readBlock(out, 'report-data');
    const want = { mos: Math.round((300 - rd.values.px) / 300 * 1000) / 10, upside: Math.round((300 - rd.values.px) / rd.values.px * 1000) / 10 };
    ok(sm.fairValue === 300 && sm.price === rd.values.px && sm.mos === want.mos && sm.upside === want.upside, 'F4 --set fv=300: stock-meta.price/mos/upside/fairValue = กระจกของ values.px/fv', JSON.stringify(sm));
    const smSrc = readBlock(src, 'stock-meta');
    ok(sm.pe === smSrc.pe && sm.dividendYield === smSrc.dividendYield && sm.roe === smSrc.roe, 'F4 --set fv=300: ไม่แตะ pe/dividendYield/roe', JSON.stringify(sm));
    const savedToday = process.env.STALE_TODAY;
    process.env.STALE_TODAY = FXq.TODAY;
    let ids;
    try { ids = checkHtml(expandReport(out), 'AAPL.html', { source: out }).errors.map((e) => e.id); } finally { if (savedToday === undefined) delete process.env.STALE_TODAY; else process.env.STALE_TODAY = savedToday; }
    ok(!ids.includes('E30') && !ids.includes('E31'), 'F4 --set fv=300: checkHtml(expandReport) ไม่มี E30/E31', ids.join(','));
    // --del บน v2 ก็รันกระจก (ค่าสุดท้ายหลังทุก op) · --set-meta คีย์กระจกอื่นบน v2 ถูกปฏิเสธ · คีย์ไม่ใช่กระจก (pe) ใช้ได้
    const tmp2 = writeTmp('mirror-del.html', src.replace(/("mos":)(-?[0-9.]+)/, '$199'));
    const r2 = sh.run('node', ['tools/apply-edits.js', tmp2, '--del', 'values.dps']);   // AAPL_V2: dps ไม่มี token อ้าง
    ok(r2.code === 0 && readBlock(fs.readFileSync(tmp2, 'utf8'), 'stock-meta').mos === readBlock(src, 'stock-meta').mos, 'F4 --del บน v2: กระจกรันด้วย (stock-meta.mos ที่ถูกทำให้ค้าง 99 กลับเป็นค่าจาก values.px/fv)', r2.err || r2.out);
    for (const key of ['mos', 'upside', 'price']) {
      const t = writeTmp(`setmeta-${key}.html`, src);
      const rr = sh.run('node', ['tools/apply-edits.js', t, '--set-meta', `${key}=1`]);
      ok(rr.code !== 0 && new RegExp(`--set-meta ${key} ใช้ไม่ได้กับไฟล์ v2`).test(rr.out + rr.err) && fs.readFileSync(t, 'utf8') === src, `F4 --set-meta ${key} บนไฟล์ v2: ปฏิเสธ + ไม่เขียนไฟล์`, rr.out + rr.err);
    }
    const tpe = writeTmp('setmeta-pe.html', src);
    const rpe = sh.run('node', ['tools/apply-edits.js', tpe, '--set-meta', 'pe=41.2']);
    ok(rpe.code === 0 && readBlock(fs.readFileSync(tpe, 'utf8'), 'stock-meta').pe === 41.2, 'F4 --set-meta pe บนไฟล์ v2: ใช้ได้ (ไม่ใช่กระจก)', rpe.err || rpe.out);
  }

  // (f) ไม่มีทั้งบล็อก @@ และ --set/--del/--set-meta → ยัง exit ≠ 0 เหมือนของเดิม (STEP 5C ยังใช้ได้ปกติ)
  {
    const tmp = writeTmp('empty.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp]);
    ok(r.code !== 0, 'apply-edits: ไม่มีทั้ง @@ block และ --set/--del/--set-meta → ยัง exit ≠ 0', r.out + r.err);
  }

  // (g) fix1 — code review: --del array index ต้อง splice ให้สั้นลงจริง ไม่ใช่เหลือ "หลุม" (delete เฉย ๆ ไม่ลด
  //   .length — Array.prototype.every "ข้าม" หลุมไปเงียบ ๆ (สเปก JS) ⇒ validateValues ผ่านหลอก ๆ ตอนนี้ (length
  //   ยังคง 3 ทั้งที่มีหลุม) แต่ JSON.stringify เขียนหลุมเป็น null จริงลงไฟล์ ⇒ รอบถัดไปที่ parse ใหม่ null ไม่ผ่าน
  //   schema (ไม่ใช่หลุมอีกแล้ว) — ไฟล์ที่ certify ว่า valid วันนี้ (เพราะเช็คไม่เจอหลุม) กลับ invalid วันถัดไป
  //   ★ `values.scenarios` มีกติกา "ต้องมี 3 ฉากเป๊ะ" (bear/base/bull) ⇒ เอาออก 1 ตัวจะเหลือ 2 ฉาก ซึ่ง**ผิด schema
  //   เสมอไม่ว่า splice หรือปล่อยหลุม** — พฤติกรรมที่ถูกต้องคือ apply-edits ต้อง **ปฏิเสธทันทีแบบดัง ๆ** (exit ≠ 0
  //   ไม่เขียนไฟล์) แทนที่จะ "ผ่านตอนนี้แล้วพังเงียบ ๆ รอบหน้า" — นี่คือคุณค่าจริงของ fix: เปลี่ยนบั๊กจาก silent
  //   corruption เป็น loud rejection ทันทีที่จุดเดียวกัน (ก่อนเขียนไฟล์)
  {
    const before = V2_HTML;
    const tmp = writeTmp('delarr.html', before);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--del', 'values.scenarios.1']);
    ok(r.code !== 0 && /3 ฉาก/.test(r.out + r.err), 'apply-edits --del values.scenarios.1: ปฏิเสธทันทีแบบดัง ๆ (schema ต้อง 3 ฉากเป๊ะ) ไม่ใช่ผ่านตอนนี้แล้วพังเงียบรอบหน้า', r.out + r.err);
    ok(fs.readFileSync(tmp, 'utf8') === before, 'apply-edits --del values.scenarios.1: ไม่เขียนไฟล์เลยเมื่อผลลัพธ์ invalid (all-or-nothing)');
  }

  // (g2) fix1 — ยืนยันกลไก splice เองตรง ๆ ด้วย array ที่ไม่ผูกความยาวตายตัว (report-data.chart.grid — ไม่อยู่ใน
  //   schema ของ values จึงไม่ติดกติกา "ต้อง 3 ฉาก" ข้างบน): --del ต้องได้ array สั้นลงจริง ไม่มี null คั่นกลาง
  //   และ JSON ที่ได้ต้อง parse ได้ปกติ (พิสูจน์ splice ทำงานถูกต้อง แยกจากคำถามว่า schema อนุญาตให้สั้นลงไหม)
  {
    const tmp = writeTmp('delgrid.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--del', 'chart.grid.1']);
    ok(r.code === 0, 'apply-edits --del chart.grid.1 (array ที่ไม่ผูกความยาวตายตัว): exit 0', r.err || r.out);
    const rd = readBlock(fs.readFileSync(tmp, 'utf8'), 'report-data');
    ok(Array.isArray(rd.chart.grid) && rd.chart.grid.length === 1 && rd.chart.grid[0] === 100 && !rd.chart.grid.includes(null),
      'apply-edits --del array index: splice ให้ array สั้นลงจริง (ไม่เหลือ null คั่นกลาง)', JSON.stringify(rd.chart.grid));
  }

  // (h) fix2 — code review: apply ops ตามลำดับที่พิมพ์ใน argv จริง — `--del X --set X=555` ต้องจบที่ X=555
  //   ไม่ใช่ X ถูกลบ (เดิมจัดกลุ่ม set-ทั้งหมด-ก่อน-del-ทั้งหมดโดยไม่สนลำดับที่พิมพ์ — ขัดกับคำสั่งที่ผู้ใช้พิมพ์เงียบ ๆ)
  {
    const tmp = writeTmp('order.html', V2_HTML);
    const r = sh.run('node', ['tools/apply-edits.js', tmp, '--del', 'values.analystTgt', '--set', 'values.analystTgt=555']);
    ok(r.code === 0, 'apply-edits --del X --set X=...: exit 0', r.err || r.out);
    const rd = readBlock(fs.readFileSync(tmp, 'utf8'), 'report-data');
    ok(rd.values.analystTgt === 555, 'apply-edits: ops apply ตามลำดับ argv จริง (--del ก่อน --set ทีหลัง → ค่าสุดท้าย = --set ตามที่พิมพ์)', String(rd.values.analystTgt));
  }
}

// ── 22) apply-edits: stdin — explicit --stdin แทนการเดาจังหวะ (fix2 review) ── ต้องเป็น async จริง (spawn + delayed write)
//   spawnSync/sh.run เขียน stdin ให้เสร็จก่อนหรือพร้อมกับที่ child เริ่มทำงานเสมอ ⇒ ไม่มีวันชนจังหวะที่ผู้เขียน
//   (producer) ส่งข้อมูลมาช้ากว่าที่ child เริ่มอ่าน — ต้อง child_process.spawn จริงแล้วหน่วงเขียนด้วย setTimeout
//   ถึงจะบังคับให้จังหวะนั้นเกิดซ้ำได้แน่นอน · ★ เวอร์ชัน timeout (fix1) พังเมื่อ producer ช้ากว่า grace ที่ตั้งไว้
//   (วัดจริงโดยผู้รีวิว: หน่วง 800ms ดรอปทุกบล็อก 6/6 รอบ) — เวอร์ชันนี้ (fix2) ไม่มี timeout อีกต่อไป ผู้เรียก
//   ต้องประกาศ `--stdin` เอง แล้วอ่านแบบ blocking ธรรมดา (รอ EOF จริง) ⇒ ทดสอบด้วยดีเลย์ 800ms เดิมที่เคยพังแน่นอน
function testApplyEditsStdin(ok) {
  const cp = require('child_process');
  const RACE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-edits-stdin-'));
  const FIXTURE = `<!DOCTYPE html>
<html><head>
<script type="application/json" id="stock-meta">
{"symbol":"TST","currency":"USD","price":100,"fairValue":120,"mos":16.7,"upside":20,"pe":10,"dividendYield":2,"roe":8}
</script>
<script type="application/json" id="report-data">
{ "v": 2, "fv": 120, "values": { "px": 100, "priceDate": "2026-09-01", "dateEra": "BE", "chgSuffix": "รอบปี" },
  "theme": { "accent": "#000000" },
  "chart": { "data": [["ม.ค.26", 90], ["ก.ย.26", 100]], "min": 80, "max": 140, "grid": [100, 120], "currency": "$", "highlight": [0, 1] },
  "gauge": { "min": 80, "max": 140 } }
</script>
</head><body></body></html>
`;
  const AT_BLOCK = '@@\n"accent": "#000000"\n@@=\n"accent": "#111111"\n@@end\n';
  // ★ ระยะ 2 ส่วน B (banked จากรีวิวก่อนหน้า): N เดิม = 20 ตอนบั๊กยังเป็น timeout scheme ที่ probabilistic —
  //   ตอนนี้กลไกเป็น --stdin + blocking read รอ EOF จริง (deterministic ต่อรอบ) เทสนี้เลยคุ้มครอง "การออกแบบ"
  //   (ห้ามถอยกลับไปใช้ timeout) ไม่ใช่ล่าจังหวะสุ่ม ⇒ 3 รอบจับได้เท่ากับ 20 · ตัดเวลาจาก ~15s เหลือ ~2.4s (N × DELAY_MS)
  const N = 3, DELAY_MS = 800; // > 500ms เดิม (STDIN_GRACE_MS ของ fix1 ที่ถูกถอดออกแล้ว) — พิสูจน์ว่าไม่มี window อีกต่อไป

  // (a) --stdin + producer หน่วง 800ms (จุดที่ fix1 พังแน่นอน 6/6) ต้องไม่ทำให้บล็อก @@ หายไป — วนซ้ำ N รอบ
  const oneDelayedRun = (i) => new Promise((resolve) => {
    const file = path.join(RACE_DIR, `race${i}.html`);
    fs.writeFileSync(file, FIXTURE);
    const child = cp.spawn('node', ['tools/apply-edits.js', file, '--stdin', '--set', 'fv=210'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
    child.on('close', (code) => resolve({ code, out, err, file }));
    setTimeout(() => { try { child.stdin.write(AT_BLOCK); child.stdin.end(); } catch (_) { /* child ตายไปก่อนแล้วก็ปล่อย close handler รายงานเอง */ } }, DELAY_MS);
  });
  let chain = Promise.resolve();
  for (let i = 0; i < N; i++) {
    chain = chain.then(() => oneDelayedRun(i)).then((r) => {
      const applied = r.code === 0 && fs.existsSync(r.file) && fs.readFileSync(r.file, 'utf8').includes('"accent": "#111111"');
      ok(applied, `apply-edits --stdin: producer ส่งบล็อก @@ ช้า ${DELAY_MS}ms (#${i + 1}/${N}) → ต้อง apply ได้เสมอ (blocking read รอ EOF จริง ไม่มี timeout อีกแล้ว)`,
        `exit=${r.code} out=${(r.out || '').trim()} err=${(r.err || '').trim().slice(0, 200)}`);
    });
  }

  // (b) one-liner --set เปล่า ๆ (ไม่มี --stdin, ไม่มีใครเขียน/ปิด stdin เลย) — ต้องจบเร็วเสมอ เพราะไม่แตะ fd 0 เลย
  //   (ไม่ใช่เพราะจับจังหวะเก่งหรือ timeout พอดี — ไม่มีจังหวะให้ชนตั้งแต่ต้น) + เขียนค่าตาม JSON op ที่สั่งเป๊ะ
  chain = chain.then(() => new Promise((resolve) => {
    const file = path.join(RACE_DIR, 'oneliner.html');
    fs.writeFileSync(file, FIXTURE);
    const t0 = Date.now();
    const child = cp.spawn('node', ['tools/apply-edits.js', file, '--set', 'fv=210'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let done = false;
    // hard-kill กันเทสทั้งชุดค้างถ้า regression กลับไปแตะ fd 0 โดยไม่ตั้งใจ — ไม่ใช่ค่า timeout ที่ระบบพึ่งพา
    const hardTimer = setTimeout(() => {
      if (done) return; done = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      ok(false, 'apply-edits: one-liner --set (ไม่มี --stdin) ต้องไม่แตะ stdin เลย → จบเร็วเสมอ', 'เกิน 3000ms ยัง hang (regression: กลับไปแตะ fd 0)');
      resolve();
    }, 3000);
    child.on('close', (code) => {
      if (done) return; done = true; clearTimeout(hardTimer);
      const ms = Date.now() - t0;
      const fv = code === 0 && fs.existsSync(file) ? require('../tools/report-meta.js').readReportData(fs.readFileSync(file, 'utf8')).data.fv : null;
      ok(code === 0 && ms < 2000 && fv === 210, 'apply-edits: one-liner --set (ไม่มี --stdin, ไม่มีใครเขียน stdin เลย) → จบเร็ว + เขียนค่าตาม JSON op เป๊ะ', `code=${code} ms=${ms} fv=${fv}`);
      resolve();
    });
  }));
  return chain;
}
const applyEditsRacePromise = testApplyEditsStdin(ok);

// ── 19h) ship: "push แล้วหรือยัง" ต้องถามจาก git ไม่ใช่จำว่า "ฉัน push เอง" (บั๊ก 1 · รอบ 20 ก.ย. 69) ──
//   เคสจริง: tree มีรายงานค้างหลายใบ ⇒ ship ใบแรก ๆ commit สำเร็จแต่ `git pull --rebase` ล้ม ("cannot pull with rebase:
//   You have unstaged changes") ⇒ ไม่เคยบันทึก shippedAt · ใบสุดท้าย (tree สะอาด) push ให้ทั้งกอง ⇒ commit ขึ้น origin ครบ
//   แต่ status ค้าง "รอ push" ถาวร และ ship ซ้ำตอบ "worker ยังไม่ได้เขียนไฟล์?" ซึ่งชี้ผิดทาง
{
  const Sh = require('../tools/queue/ship.js');
  const SUBJ = 'analyze: update GNRC — UPDATE (MOS −16.5%)';

  // landedOnOrigin — sha เป็น ancestor = จบ · ไม่ใช่ ancestor แต่ subject อยู่บน origin = ขึ้นไปแล้ว (rebase เขียน sha ใหม่)
  ok(Sh.landedOnOrigin({ ancestor: true, originSubjects: '', subject: null }) === true, 'landedOnOrigin: sha เป็น ancestor ของ origin/main → ขึ้นไปแล้ว');
  ok(Sh.landedOnOrigin({ ancestor: false, originSubjects: `chore: x\n${SUBJ}\nprice: y`, subject: SUBJ }) === true,
    'landedOnOrigin: sha ไม่ใช่ ancestor (ship ใบถัดไป pull --rebase เขียน stack ใหม่) แต่ subject อยู่บน origin → ขึ้นไปแล้ว');
  ok(Sh.landedOnOrigin({ ancestor: false, originSubjects: 'chore: x\nprice: y', subject: SUBJ }) === false, 'landedOnOrigin: ไม่เจอ subject บน origin → ยังไม่ขึ้น');
  ok(Sh.landedOnOrigin({ ancestor: false, originSubjects: SUBJ, subject: null }) === false, 'landedOnOrigin: ไม่มี subject ให้เทียบ → ไม่เดา (false)');
  ok(Sh.landedOnOrigin({ ancestor: false, originSubjects: 'ราคาเช้า 20 ก.ย.', subject: 'ราคาเช้า 20 ก.ย.' }) === true, 'landedOnOrigin: --message หัวข้ออิสระ เทียบตรงตัวอักษรได้ (ไม่ผูกกับรูป analyze: …)');

  // shipPhaseOf — สามเฟสที่ stage ว่างแล้วต้องแยกออกจากกัน
  const rec = { committedSha: 'abc123', committedSubject: SUBJ, committedAt: '2026-09-20', postcheck: 'pass' };
  ok(Sh.shipPhaseOf('GNRC', rec, { ancestor: true, originSubjects: '', unpushed: '' }) === 'pushed', 'shipPhaseOf: ancestor → pushed');
  ok(Sh.shipPhaseOf('GNRC', rec, { ancestor: false, originSubjects: SUBJ, unpushed: '' }) === 'pushed', 'shipPhaseOf: sha ถูก rebase เขียนใหม่ แต่ subject อยู่บน origin → pushed (ไม่ใช่ unknown)');
  ok(Sh.shipPhaseOf('GNRC', rec, { ancestor: false, originSubjects: '', unpushed: SUBJ }) === 'unpushed', 'shipPhaseOf: commit อยู่ในเครื่อง ยังไม่ขึ้น origin → unpushed');
  ok(Sh.shipPhaseOf('GNRC', rec, { ancestor: false, originSubjects: '', unpushed: '' }) === 'unknown', 'shipPhaseOf: ไม่เจอที่ไหนเลย → unknown (worker ยังไม่ได้เขียน / cwd-stray)');
  // origin/main ในเครื่องเก่า (ไม่ fetch) = false negative ฝั่งปลอดภัย — ตอบ unpushed แล้ว push ซ้ำ ดีกว่าประทับว่า push แล้วทั้งที่ยังไม่
  ok(Sh.shipPhaseOf('GNRC', rec, { ancestor: false, originSubjects: '', unpushed: `${SUBJ}\nchore: z` }) === 'unpushed', 'shipPhaseOf: origin/main ในเครื่องเก่า → unpushed (false negative ฝั่งปลอดภัย ไม่ใช่ pushed ปลอม)');
  // แถวเก่าก่อนมี committedSubject (state ถูกล้าง/รุ่นก่อนแก้บั๊ก) — ยังกู้ได้ด้วยรูป commit มาตรฐาน
  const legacy = { postcheck: 'pass', postcheckAt: '2026-09-20' };
  ok(Sh.shipPhaseOf('GNRC', legacy, { ancestor: false, originSubjects: SUBJ, unpushed: '' }) === 'pushed', 'shipPhaseOf: แถวเก่าไม่มี committedSubject → ตกมาใช้รูป analyze: add|update <SYM> บน origin');
  ok(Sh.shipPhaseOf('GNR', legacy, { ancestor: false, originSubjects: SUBJ, unpushed: '' }) === 'unknown', 'shipPhaseOf: แถวเก่า — \\b กัน prefix ชนกัน (GNR ≠ GNRC)');
  ok(Sh.shipPhaseOf('GNRC', legacy, { ancestor: false, originSubjects: '', unpushed: SUBJ }) === 'unpushed', 'shipPhaseOf: แถวเก่าที่ commit ยังไม่ push → unpushed เหมือนเดิม (ของ pendingCommitFor)');
  ok(Sh.shipPhaseOf('GNRC', {}, { ancestor: false, originSubjects: '', unpushed: '' }) === 'unknown', 'shipPhaseOf: แถวว่าง → unknown');
  // ★ ขาสำรองที่หลวม (รูป analyze: …) ต้องมีหลักฐานว่ารอบนี้ทำงานจริงกำกับ ไม่งั้นกลายเป็นบั๊กเดิมแบบกลับด้าน:
  //   `ship <SYM> --model X` ตอน state หาย (ทางที่ C1 ออกแบบไว้) จะไปเจอ commit ของการวิเคราะห์ครั้งก่อนบน origin
  //   แล้วตอบ "ขึ้นไปแล้ว" + ปิด issue ทั้งที่ worker ยังไม่ได้เขียนไฟล์
  ok(Sh.shipPhaseOf('GNRC', {}, { ancestor: false, originSubjects: SUBJ, unpushed: '' }) === 'unknown',
    'shipPhaseOf: แถวว่าง (state หาย) + เจอ commit เก่าของหุ้นนี้บน origin → unknown ไม่ใช่ pushed (กันชี้ผิดทางแบบกลับด้าน)');
  ok(Sh.shipPhaseOf('GNRC', { postcheck: 'pass' }, { ancestor: false, originSubjects: SUBJ, unpushed: '' }) === 'pushed',
    'shipPhaseOf: แถวเก่าที่ postcheck ของรอบนี้ผ่านแล้ว → ขาสำรองทำงานตามเดิม');

  // rowsToHeal — ปรับ **ทั้งกอง** เพราะใบสุดท้ายของกองเป็นคน push ให้ทุกใบ
  const stocks = {
    GNRC: { postcheck: 'pass', committedSubject: 'analyze: update GNRC — UPDATE' },        // commit อยู่บน origin แล้ว
    PPG: { postcheck: 'pass', committedSha: 'deadbee' },                                    // เหมือนกัน
    SSP: { postcheck: 'review', committedSubject: 'analyze: update SSP — UPDATE' },         // ship ด้วย --force ก็ต้อง heal
    CHD: { postcheck: 'pass', shippedAt: '2026-09-20', committedSha: 'cafe' },              // บันทึกแล้ว — ไม่แตะซ้ำ
    IDLE: { bucket: 'LIGHT', flaggedAt: '2026-09-20' },                                     // worker ยังไม่ได้ทำ — ห้าม heal
    LOCAL: { postcheck: 'pass', committedSha: 'feed' },                                     // commit ยังไม่ขึ้น origin
  };
  const healed = Sh.rowsToHeal(stocks, (sym) => (['GNRC', 'PPG', 'SSP'].includes(sym) ? 'pushed' : sym === 'LOCAL' ? 'unpushed' : 'unknown'));
  ok(healed.join(' ') === 'GNRC PPG SSP', 'rowsToHeal: ปรับทุกแถวที่ git ยืนยันว่าอยู่บน origin แล้ว (รวมใบที่ ship ด้วย --force)', healed.join(' '));
  ok(!healed.includes('CHD') && !healed.includes('LOCAL'), 'rowsToHeal: ใบที่บันทึกแล้ว/ยังไม่ขึ้น origin ไม่ถูกแตะ', healed.join(' '));
  ok(Sh.rowsToHeal({ IDLE: { bucket: 'LIGHT' } }, () => 'pushed').length === 0, 'rowsToHeal: แถวที่ไม่มีร่องรอยว่าทำงานจริง (ไม่มี postcheck/committed*) ไม่ heal แม้ subject จะไปชนกับของรอบก่อน');
  ok(Sh.rowsToHeal(null, () => 'pushed').length === 0 && Sh.rowsToHeal({}, () => 'pushed').length === 0, 'rowsToHeal: state ว่าง → []');

  // ฟิลด์ใหม่ต้องเป็น "ของรอบ" — flag ใหม่มาแล้วยังค้าง = ship รอบถัดไปคิดว่า commit เก่าคือของรอบนี้
  const S6 = require('../tools/queue/state.js');
  ok(['committedSha', 'committedSubject', 'committedAt'].every((f) => S6.ROUND_FIELDS.includes(f)), 'ROUND_FIELDS: committedSha/committedSubject/committedAt ถูกล้างเมื่อขึ้นรอบใหม่', S6.ROUND_FIELDS.join(' '));
  const P6 = require('../tools/queue/preflight.js');
  const again6 = P6.upsertRow({ bucket: 'LIGHT', flaggedAt: '2026-09-01', postcheck: 'pass', committedSha: 'abc', committedSubject: 'analyze: update X — UPDATE', committedAt: '2026-09-02', shippedAt: '2026-09-02' },
    { symbol: 'X', reason: 'drift-gt-15pct', bucket: 'LIGHT', flaggedAt: '2026-09-20', oldPrice: 12, currency: 'USD', footerAge: 40, skip: null });
  ok(!again6.committedSha && !again6.committedSubject && !again6.committedAt, 'upsertRow: flag ใหม่ → ล้าง committed* ของรอบก่อนด้วย', JSON.stringify(again6));
}

// ── 19i) ship: trailer Co-Authored-By ต้องมาจากป้าย <meta ai-model> ในใบ (บั๊ก 2 · รอบ 20 ก.ย. 69) ──
//   `state.model` เป็นแค่ **แผน** ของ prep (`--model || หุ้นยาก?opus:sonnet`) ไม่มีใครเขียนทับเมื่อ controller เปลี่ยนใจตอน spawn
//   ⇒ GNRC (แผน sonnet · รัน opus) ได้ trailer "Sonnet 5" · SSP (แผน opus · รัน sonnet) ได้ "Opus 5" — สลับกันพอดีโดยบังเอิญ
{
  const Sh = require('../tools/queue/ship.js');
  const RM = require('../tools/report-meta.js');

  ok(RM.readAiModel('<meta name="ai-model" content="Claude Opus 5">') === 'Claude Opus 5', 'readAiModel: อ่านป้ายในใบ');
  ok(RM.readAiModel('<p>ไม่มีป้าย</p>') === null && RM.readAiModel('<meta name="ai-model" content="  ">') === null, 'readAiModel: ไม่มีป้าย/ว่าง → null');
  ok(RM.parseAiModel('Claude Opus 4.8').key === 'opus' && RM.parseAiModel('Claude Opus 4.8').text === 'Claude Opus 4.8', 'parseAiModel: แยกตระกูลแต่เก็บข้อความรุ่นไว้ตรงตัว');
  ok(RM.parseAiModel('Claude Sonnet') === null && RM.parseAiModel('') === null, 'parseAiModel: รูปไม่ครบ → null');

  // เคส GNRC: ใบบอก Opus 5 · state บอก sonnet → ต้องได้ Opus และเตือนว่าไม่ตรงกัน
  const gnrc = Sh.resolveTrailer('GNRC', 'Claude Opus 5', { model: 'sonnet' }, null);
  ok(gnrc.key === 'opus' && gnrc.trailer === 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>', 'resolveTrailer: เคส GNRC — ใบ Opus ชนะแผน sonnet ของ prep', JSON.stringify(gnrc));
  ok(/state บอกโมเดล "sonnet"/.test(gnrc.warn || '') && /Claude Opus 5/.test(gnrc.warn || ''), 'resolveTrailer: ไม่ตรงกับ state → เตือนให้เห็น ไม่เงียบ', String(gnrc.warn));
  // เคส SSP: ใบบอก Sonnet 5 · state บอก opus (prep ตัดสินว่าหุ้นยาก) → ต้องได้ Sonnet
  const ssp = Sh.resolveTrailer('SSP', 'Claude Sonnet 5', { model: 'opus' }, null);
  ok(ssp.key === 'sonnet' && ssp.trailer === 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>', 'resolveTrailer: เคส SSP — ใบ Sonnet ชนะแผน opus ของ prep', JSON.stringify(ssp));
  // รุ่นย่อยต้องลอกจากใบตรงตัว ไม่ใช่ MODEL_NAME (ไม่งั้นใบ 4.8 ได้ trailer 5)
  ok(Sh.resolveTrailer('X', 'Claude Opus 4.8', { model: 'opus' }, null).trailer === 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>', 'resolveTrailer: ข้อความ trailer ลอกจากใบตรงตัว (Opus 4.8 ไม่กลายเป็น Opus 5)');
  ok(Sh.resolveTrailer('X', 'Claude Sonnet 5', { model: 'sonnet' }, null).warn === null, 'resolveTrailer: ใบตรงกับ state → ไม่เตือน');
  ok(Sh.resolveTrailer('X', 'Claude Opus 5', { model: 'sonnet' }, 'opus').key === 'opus', 'resolveTrailer: --model ตรงกับใบ → ผ่าน');

  const thrown = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  const conflict = thrown(() => Sh.resolveTrailer('GNRC', 'Claude Opus 5', { model: 'sonnet' }, 'sonnet'));
  ok(/--model sonnet ขัดกับป้ายในใบ/.test(conflict || '') && /Claude Opus 5/.test(conflict || ''), 'resolveTrailer: --model ขัดกับใบ → ล้ม ไม่เดาให้ (เดา = ทำบั๊กเดิมซ้ำ)', String(conflict));
  const haiku = thrown(() => Sh.resolveTrailer('X', 'Claude Haiku 4.5', {}, null));
  ok(/นอกกติกา/.test(haiku || ''), 'resolveTrailer: ใบประทับ Haiku → ล้ม (CLAUDE.md §3.2)', String(haiku));
  const fable = thrown(() => Sh.resolveTrailer('X', 'Claude Fable 5.1', { model: 'sonnet' }, null));
  ok(/นอกกติกา/.test(fable || ''), 'resolveTrailer: ตระกูลนอก sonnet/opus ไม่ถูกกลบด้วย state.model', String(fable));
  const junk = thrown(() => Sh.resolveTrailer('X', 'Opus', { model: 'sonnet' }, null));
  ok(/อ่านไม่ออก/.test(junk || ''), 'resolveTrailer: ป้ายรูปผิด → ล้มพร้อมบอกรูปที่ต้องการ (ไม่เงียบไปใช้ state)', String(junk));

  // ไม่มีป้ายในใบเลย (ไฟล์หาย/ยังไม่เขียน) → ทางเดิม: --model > state.model · ไม่มีอะไรเลยก็ล้มข้อความเดิม
  ok(Sh.resolveTrailer('X', null, { model: 'sonnet' }, null).trailer === Sh.trailer('sonnet'), 'resolveTrailer: ไม่มีป้ายในใบ → ใช้ state.model ตามเดิม');
  ok(Sh.resolveTrailer('X', null, {}, 'opus').key === 'opus', 'resolveTrailer: ไม่มีป้ายในใบ แต่ใส่ --model → ผ่าน');
  ok(/ไม่มี model ใน state/.test(thrown(() => Sh.resolveTrailer('X', null, {}, null)) || ''), 'resolveTrailer: ไม่มีทั้งป้ายและ model → ข้อความเดิมของ resolveModel');
}

// ── W11) กฎ LIGHT/FULL ใหม่ (22 ก.ย. 69): LIGHT ⇔ ไม่มีงบใหม่หลัง footer · ไม่รู้ = FULL · ขยับ >30% = FULL · EPS screen เป็นแค่คำเตือน ──
{
  const T = require('../tools/queue/triage.js');
  const P = require('../tools/queue/preflight.js');
  const Pp = require('../tools/queue/prep.js');
  const EC = require('../tools/earnings-calendar.js');
  const html = { USAA: '<footer>ข้อมูล ณ 1 ก.ค. 2569</footer>', USBB: '<footer>ข้อมูล ณ 5 ส.ค. 2569</footer>', USCC: '<footer>ข้อมูล ณ 1 ก.ค. 2569</footer>',
    THAA: '<footer>ข้อมูล ณ 1 ก.ค. 2569</footer>', THBB: '<footer>ข้อมูล ณ 20 ส.ค. 2569</footer>' };
  const cal = { symbols: { USAA: { last: '2026-07-30', next: null }, USBB: { last: '2026-07-30', next: null } } };
  const st = P.statementAfterOfWith(cal, (s) => html[s] || null, { today: '2026-09-22', isThai: (s) => /^TH/.test(s), sec: null });
  const one = (flag, statementAfterOf, extra) => T.triage([flag], { footerAgeOf: () => 30, statementAfterOf, ...(extra || {}) })[0];
  const noStmt = () => ({ after: false, detail: 'ไม่มีงบใหม่' });

  // 1) งบออกหลัง footer ⇒ FULL (แม้เป็น flip ที่เคยจบที่ PREPATCH)
  ok(st('USAA').after === true && st('USAA').source === 'calendar', 'W11: ปฏิทิน last หลัง footer → after=true', JSON.stringify(st('USAA')));
  const r1 = one({ symbol: 'USAA', reason: 'mos-sign-flip' }, st);
  ok(r1.bucket === 'FULL' && r1.escalated === 'statement' && r1.stmtWhy, 'W11: มีงบใหม่หลัง footer → FULL (flip ไม่จบที่ PREPATCH)', r1.bucket);
  // 2) ไม่มีงบ + ขยับ 10% ⇒ LIGHT (นอกคิว = prep.decideMode) · flip ในคิวยังเป็น PREPATCH (ไม่ถูกดันเป็น FULL)
  ok(st('USBB').after === false, 'W11: ปฏิทิน last ก่อน footer → after=false');
  ok(Pp.decideMode({ exists: true, rec: {}, lightRule: 'new', stmt: st('USBB') }).mode === 'UPDATE-LIGHT', 'W11: นอกคิว ไม่มีงบใหม่ (ขยับ ~10%) → UPDATE-LIGHT (BUG-026: เดิมเป็น UPDATE เสมอ)');
  ok(one({ symbol: 'USBB', reason: 'mos-sign-flip', diffPct: 10 }, st).bucket === 'PREPATCH', 'W11: ไม่มีงบ + flip ขยับ 10% → PREPATCH ไม่ใช่ FULL');
  // 3) ไม่มีงบ + drift 20% ⇒ LIGHT
  const r3 = one({ symbol: 'USBB', reason: 'drift-gt-15pct', diffPct: -20 }, st);
  ok(r3.bucket === 'LIGHT' && r3.drift === 20, 'W11: ไม่มีงบ + drift 20% → LIGHT', JSON.stringify([r3.bucket, r3.drift]));
  // 4) ไม่มีงบ + drift 35% ⇒ FULL · suspect-split ที่ขยับ 25–30% ⇒ LIGHT (ตัดสินจากค่า ไม่ใช่ชื่อ reason)
  const r4 = one({ symbol: 'USBB', reason: 'suspect-split-or-data', diffPct: 35 }, st);
  ok(r4.bucket === 'FULL' && r4.escalated === 'drift30', 'W11: ไม่มีงบ + drift 35% → FULL', JSON.stringify([r4.bucket, r4.escalated]));
  ok(one({ symbol: 'USBB', reason: 'suspect-split-or-data', diffPct: 28 }, st).bucket === 'LIGHT', 'W11: suspect-split ที่ขยับ 28% (≤30) ไม่มีงบ → LIGHT');
  ok(one({ symbol: 'USBB', reason: 'suspect-split-or-data' }, st).bucket === 'FULL', 'W11: suspect-split ไม่มีค่าขยับให้ดู → FULL (ไม่เดา)');
  ok(one({ symbol: 'USBB', reason: 'drift-gt-15pct', diffPct: 30 }, st).bucket === 'LIGHT', 'W11: ขยับ 30.0% พอดี ไม่ใช่ >30 → LIGHT');
  // 5) TH: เส้นตายส่งงบ SET ตกหลัง footer ⇒ FULL · ไม่มีเส้นตาย ⇒ LIGHT
  ok(st('THAA').after === true && st('THAA').source === 'set-deadline' && /2026-08-14/.test(st('THAA').detail), 'W11: TH footer 1 ก.ค. → เส้นตาย 14 ส.ค. ตกหลัง footer → มีงบใหม่', JSON.stringify(st('THAA')));
  ok(one({ symbol: 'THAA', reason: 'drift-gt-15pct', diffPct: 18 }, st).bucket === 'FULL', 'W11: TH เส้นตายผ่านหลัง footer → FULL');
  ok(st('THBB').after === false, 'W11: TH footer 20 ส.ค. (หลังเส้นตาย 14 ส.ค. ก่อน 14 พ.ย.) → ไม่มีงบใหม่', JSON.stringify(st('THBB')));
  ok(EC.thDeadlinesBetween('2025-12-01', '2026-03-05').join() === '2026-03-01', 'W11: เส้นตายงบปี = 31 ธ.ค. + 60 วัน (1 มี.ค.)', EC.thDeadlinesBetween('2025-12-01', '2026-03-05').join());
  ok(EC.thDeadlinesBetween('2026-05-15', '2026-05-15').length === 0 && EC.thDeadlinesBetween('2026-05-14', '2026-05-15').join() === '2026-05-15', 'W11: ช่วง (from, to] — เส้นตายตรงวัน footer ไม่นับ ตรงวันนี้นับ');
  // 6) ไม่รู้วันงบ ⇒ FULL
  ok(st('USCC').after === null, 'W11: US ไม่มี last + ไม่ใช้ SEC → null', JSON.stringify(st('USCC')));
  const r6 = one({ symbol: 'USCC', reason: 'drift-gt-15pct', diffPct: 16 }, st);
  ok(r6.bucket === 'FULL' && r6.escalated === 'stmt-unknown', 'W11: ไม่รู้วันงบ → FULL', JSON.stringify([r6.bucket, r6.escalated]));
  ok(one({ symbol: 'X', reason: 'drift-gt-15pct', diffPct: 16 }, null).bucket === 'FULL' && P.statementAfterOfWith(cal, () => null)('USAA').after === null, 'W11: ไม่มีตัวอ่านงบ/อ่าน footer ไม่ได้ → null → FULL');
  // SEC fallback (ฉีด fetcher — ห้ามยิง network)
  const urls = [];
  const fetchText = (u) => { urls.push(u); return u.includes('company_tickers') ? JSON.stringify({ 0: { cik_str: 320193, ticker: 'AAPL' }, 1: { cik_str: 1067983, ticker: 'BRK-B' } })
    : JSON.stringify({ filings: { recent: { form: ['8-K', '10-Q', '10-K/A', '4', '10-K'], filingDate: ['2026-09-01', '2026-08-01', '2026-09-10', '2026-09-15', '2026-05-01'] } } }); };
  const cache = new Map();
  ok(EC.secLastStatement('AAPL', { ua: 'test-ua', ciks: null, fetchText, cache }) === '2026-08-01', 'W11: SEC ใช้เฉพาะ 10-K/10-Q/20-F/40-F ต้นฉบับ (8-K, 10-K/A, Form 4 ไม่นับ)');
  EC.secLastStatement('BRK.B', { ua: 'test-ua', ciks: null, fetchText, cache });
  ok(urls.filter((u) => /company_tickers/.test(u)).length === 1 && /CIK0001067983/.test(urls[urls.length - 1]), 'W11: SEC — แคช ticker→CIK ต่อ process · จุด → ขีด · CIK เติม 10 หลัก', urls.join(' '));
  ok(EC.secLastStatement('NOPE', { ua: 'test-ua', ciks: null, fetchText, cache }) === null && EC.secLastStatement('AAPL', { ua: 'test-ua', ciks: null, fetchText: () => { throw new Error('net'); } }) === null, 'W11: SEC หา ticker ไม่เจอ/ดึงไม่ได้ → null ไม่ throw');
  const stSec = P.statementAfterOfWith({ symbols: {} }, () => '<footer>ข้อมูล ณ 1 ก.ค. 2569</footer>', { today: '2026-09-22', isThai: () => false, sec: (x) => EC.secLastStatement(x, { ua: 'test-ua', ciks: null, fetchText, cache }) });
  ok(stSec('AAPL').after === true && stSec('AAPL').source === 'sec', 'W11: ไม่มี calendar last → ถอยไป SEC (10-Q 1 ส.ค. หลัง footer 1 ก.ค.)', JSON.stringify(stSec('AAPL')));
  // 7) EPS ต่างจาก vendor 40% แต่ไม่มีงบใหม่ ⇒ LIGHT + คำเตือน 2 ฐาน (ไม่เปลี่ยนโหมด)
  const dm = Pp.decideMode({ exists: true, rec: { bucket: 'LIGHT' }, lightRule: 'new', stmt: null });
  const eb = Pp.extraBlock({ lightRule: 'new', sym: 'A', mode: dm.mode, modeWhy: dm.why, prePatched: null, baseEPS: 5, epsTTM: 3, epsScreen: 40, snap: [], medWarn: [], hard: false });
  ok(dm.mode === 'UPDATE-LIGHT' && /โหมด \*\*UPDATE-LIGHT\*\*/.test(eb) && /⚠ EPS \(คำเตือน — ไม่เปลี่ยนโหมด\)/.test(eb) && /ใบ "EPS ฐาน" 5/.test(eb) && /vendor 3 \(GAAP TTM diluted\)/.test(eb) && !/ยกระดับจาก UPDATE-LIGHT/.test(eb), 'W11: EPS ต่าง 40% ไม่มีงบ → ยัง LIGHT + เตือนเห็นสองฐาน', eb);
  ok(Pp.decideMode({ exists: true, rec: {}, lightRule: 'new', stmt: { after: true, detail: 'x' } }).mode === 'UPDATE' && Pp.decideMode({ exists: true, rec: {}, lightRule: 'new', stmt: { after: null } }).mode === 'UPDATE' && Pp.decideMode({ exists: true, rec: { bucket: 'FULL' }, lightRule: 'new', stmt: { after: false } }).mode === 'UPDATE' && Pp.decideMode({ exists: false, rec: {}, lightRule: 'new' }).mode === 'NEW', 'W11: decideMode — มีงบ/ไม่รู้/bucket FULL = UPDATE · ไม่มีไฟล์ = NEW');
  // 8) --light-rule legacy คืนพฤติกรรมเดิม
  ok(T.parseLightRule('legacy', {}) === 'legacy' && T.parseLightRule(null, { LIGHT_RULE: 'legacy' }) === 'legacy' && T.parseLightRule(null, {}) === 'new' && T.parseLightRule('new', { LIGHT_RULE: 'legacy' }) === 'new', 'W11: parseLightRule — ค่า flag ชนะ env · default new');
  let bad = null; try { T.parseLightRule('foo', {}); } catch (e) { bad = e; }
  ok(bad && /new\|legacy/.test(bad.message), 'W11: --light-rule ค่าแปลก → throw');
  const legacyRow = T.triage([{ symbol: 'USAA', reason: 'drift-gt-15pct', diffPct: 40 }], { footerAgeOf: () => 30, lightRule: 'legacy', statementAfterOf: st })[0];
  ok(legacyRow.bucket === 'LIGHT' && legacyRow.stmt === undefined, 'W11: legacy → ไม่ดูงบ/ค่าขยับ (drift-gt = LIGHT เดิม)');
  ok(Pp.decideMode({ exists: true, rec: {}, lightRule: 'legacy', stmt: { after: false } }).mode === 'UPDATE', 'W11: legacy decideMode นอกคิว = UPDATE (พฤติกรรมเดิม)');
  const ebL = Pp.extraBlock({ lightRule: 'legacy', sym: 'A', mode: 'UPDATE', escalated: true, prePatched: null, baseEPS: 5, epsTTM: 3, epsScreen: 40, snap: [], medWarn: [], hard: false });
  ok(/ยกระดับจาก UPDATE-LIGHT เป็น UPDATE เต็ม/.test(ebL), 'W11: legacy → EPS screen ยังยกเป็น UPDATE เต็ม (บล็อก prep)');
  // ทุก reason ยังครอบคลุมภายใต้กฎใหม่
  for (const reason of Object.keys(T.BUCKET)) {
    const base = T.bucketOf(reason);
    for (const after of [true, false, null]) {
      const r = one({ symbol: 'USBB', reason, diffPct: 20 }, () => ({ after }));
      const isContent = ['PREPATCH', 'LIGHT', 'FULL'].includes(base);
      ok(isContent ? ['PREPATCH', 'LIGHT', 'FULL'].includes(r.bucket) : r.bucket === base, `W11: กฎใหม่ครอบ ${reason} (stmt=${after}) → ${r.bucket}`);
      if (isContent && after === true) ok(r.bucket === 'FULL', `W11: ${reason} + stmt=true → FULL`);
      // ไม่ทราบ: flip (PREPATCH) ห้ามยกเป็น worker · แถว worker (LIGHT/FULL) = FULL
      if (isContent && after === null) ok(base === 'PREPATCH' ? r.bucket === 'PREPATCH' : r.bucket === 'FULL', `W11: ${reason} + stmt=null → ${base === 'PREPATCH' ? 'PREPATCH' : 'FULL'}`, r.bucket);
    }
  }
  ok(one({ symbol: 'USBB', reason: 'mos-sign-flip' }, noStmt, { footerAgeOf: () => 120 }).bucket === 'LIGHT', 'W11: flip + ไม่มีงบ + footer >90 วัน → LIGHT (age เดิม)');
  ok(one({ symbol: 'USBB', reason: 'bad-chart' }, noStmt).bucket === 'FULL', 'W11: bad-chart = FULL เสมอ');
  // follow-up: ไม่ทราบวันงบ แยกชนิด · flip ไม่ถูกยกเป็น worker · สรุปใน preflight
  const unk = () => ({ after: null, kind: 'fetch-failed', detail: 'fetch-failed — ทดสอบ' });
  const rp = one({ symbol: 'USCC', reason: 'mos-sign-flip' }, unk);
  ok(rp.bucket === 'PREPATCH' && rp.stmtNote === 'statement-unknown' && rp.stmtKind === 'fetch-failed' && /fetch-failed/.test(rp.stmtWhy), 'W11: PREPATCH + null → PREPATCH + note statement-unknown (kind ใน stmtWhy)', JSON.stringify([rp.bucket, rp.stmtNote, rp.stmtWhy]));
  const rd = one({ symbol: 'USCC', reason: 'drift-gt-15pct', diffPct: 20 }, unk);
  ok(rd.bucket === 'FULL' && rd.escalated === 'stmt-unknown', 'W11: drift-20 + null → FULL', JSON.stringify([rd.bucket, rd.escalated]));
  ok(one({ symbol: 'USCC', reason: 'mos-sign-flip' }, unk, { footerAgeOf: () => 120 }).bucket === 'LIGHT', 'W11: PREPATCH + null + footer >90 วัน → LIGHT (age เดิม — เจตนาคงพฤติกรรมเก่า)');
  ok(one({ symbol: 'USAA', reason: 'mos-sign-flip' }, st).bucket === 'FULL' && one({ symbol: 'USBB', reason: 'mos-sign-flip' }, st).bucket === 'PREPATCH', 'W11: mos-sign-flip × stmt true → FULL · false → PREPATCH');
  // ชนิดของ unknown จาก SEC (ฉีด fetcher) — curl/SEC ล้ม ≠ ไม่มีข้อมูลผู้ยื่น
  const cache2 = new Map();
  const okTick = (u) => (u.includes('company_tickers') ? JSON.stringify({ 0: { cik_str: 1, ticker: 'FPI' }, 1: { cik_str: 2, ticker: 'ODD' }, 2: { cik_str: 3, ticker: 'BOOM' } })
    : /CIK0000000001/.test(u) ? JSON.stringify({ filings: { recent: { form: ['6-K', '6-K'], filingDate: ['2026-08-01', '2026-07-01'] } } })
    : /CIK0000000002/.test(u) ? JSON.stringify({ filings: { recent: { form: ['4'], filingDate: ['2026-08-01'] } } }) : (() => { throw new Error('curl exit 22'); })());
  ok(EC.secLookup('NOPE', { ua: 'test-ua', ciks: null, fetchText: okTick, cache: cache2 }).kind === 'no-cik' && EC.secLookup('FPI', { ua: 'test-ua', ciks: null, fetchText: okTick, cache: cache2 }).kind === '6k-only' && EC.secLookup('ODD', { ua: 'test-ua', ciks: null, fetchText: okTick, cache: cache2 }).kind === 'no-statement-forms' && EC.secLookup('BOOM', { ua: 'test-ua', ciks: null, fetchText: okTick, cache: cache2 }).kind === 'fetch-failed', 'W11: secLookup แยก kind — no-cik · 6k-only · no-statement-forms · fetch-failed');
  ok(EC.secLookup('AAPL', { ua: 'test-ua', ciks: null, fetchText: () => { throw new Error('boom'); }, cache: new Map() }).kind === 'fetch-failed', 'W11: curl/SEC ล้มตั้งแต่ ticker map → fetch-failed (ไม่ใช่ null เงียบ)');
  const stFail = P.statementAfterOfWith({ symbols: {} }, () => '<footer>ข้อมูล ณ 1 ก.ค. 2569</footer>', { today: '2026-09-22', isThai: () => false, sec: (x) => EC.secLookup(x, { ua: 'test-ua', ciks: null, fetchText: okTick, cache: cache2 }) });
  ok(stFail('BOOM').after === null && stFail('BOOM').kind === 'fetch-failed' && stFail('NOPE').kind === 'no-cik' && stFail('FPI').kind === '6k-only', 'W11: statementAfterOfWith ส่ง kind ของ unknown ต่อ');
  ok(P.statementAfterOfWith({ symbols: {} }, () => '<p>ไม่มี footer</p>', { today: '2026-09-22', isThai: () => false })('ZZZ').kind === 'footer-unreadable', 'W11: footer อ่านไม่ได้ → kind footer-unreadable');
  const sumRows = P.plan([{ symbol: 'BOOM', reason: 'drift-gt-15pct', diffPct: 20 }, { symbol: 'FPI', reason: 'mos-sign-flip' }, { symbol: 'USBB', reason: 'drift-gt-15pct', diffPct: 20 }], '2026-09-22',
    { ageLimit: 0, footerAgeOf: () => 30, statementAfterOf: (x) => (x === 'USBB' ? { after: false } : stFail(x)) });
  const sumLine = P.unknownSummary(sumRows);
  ok(sumLine === '⚠ statement unknown: 2 (fetch-failed 1) · 6k-only 1', 'W11: preflight สรุป unknown — นับ fetch-failed แยก', sumLine);
  ok(P.unknownSummary(P.plan([{ symbol: 'USBB', reason: 'drift-gt-15pct', diffPct: 20 }], '2026-09-22', { ageLimit: 0, footerAgeOf: () => 30, statementAfterOf: () => ({ after: false }) })) === null, 'W11: ไม่มี unknown → ไม่พิมพ์บรรทัดสรุป');
  ok(P.upsertRow(null, sumRows[0]).stmtKind === 'fetch-failed', 'W11: upsertRow เก็บ stmtKind ลง state');
  // --light-rule ลงทะเบียนใน args.js: ทั้งสองรูป · ก่อน/หลัง symbol · symbol ต้องไม่เป็น LEGACY
  {
    const A2 = require('../tools/queue/args.js');
    const forms = [['prep', 'AAPL', '--light-rule', 'legacy'], ['prep', '--light-rule', 'legacy', 'AAPL'], ['prep', 'AAPL', '--light-rule=legacy'], ['prep', '--light-rule=legacy', 'AAPL']];
    for (const f of forms) {
      let r; try { r = A2.parseArgs(f); } catch (e) { r = { err: e.message }; }
      ok(r.sym === 'AAPL' && r.val && r.val('--light-rule') === 'legacy' && r.cmd === 'prep', `W11: args — ${f.join(' ')} → sym AAPL · light-rule legacy`, JSON.stringify([r.cmd, r.sym, r.err]));
    }
    const sh2 = A2.parseArgs(['ship', 'AAPL', '--light-rule', 'legacy']);
    ok(sh2.sym === 'AAPL' && sh2.cmd === 'ship', 'W11: ship รับ --light-rule แต่ไม่ถือเป็น symbol');
    let e2 = null; try { A2.parseArgs(['prep', 'AAPL', '--light-rule']).val('--light-rule'); } catch (e) { e2 = e; }
    ok(e2 && /--light-rule ต้องมีค่า/.test(e2.message), 'W11: --light-rule ไม่มีค่า → error');
  }
  // ── SEC_USER_AGENT / แผนที่ CIK ที่ commit / --sec-refresh-ciks / --sec-probe (offline ทั้งหมด) ──
  {
    const throwing = () => { throw new Error('ห้ามยิง network'); };
    let calls = 0;
    const counted = () => { calls++; throw new Error('ห้ามยิง network'); };
    // ไม่มี UA + ไม่มีแผนที่ ⇒ no-ua โดยไม่แตะ fetcher เลย (mutation: ถ้าเผลอยิง จะนับ calls)
    const nu = EC.secLookup('AAPL', { ua: null, ciks: null, fetchText: counted, cache: new Map() });
    ok(nu.kind === 'no-ua' && nu.date === null && calls === 0, 'W11/SEC: ไม่มี SEC_USER_AGENT + ไม่มีแผนที่ → no-ua และไม่มีการเรียก network', JSON.stringify(nu) + ' calls=' + calls);
    const saved = process.env.SEC_USER_AGENT; delete process.env.SEC_USER_AGENT;
    ok(EC.secLookup('AAPL', { ciks: null, fetchText: throwing, cache: new Map() }).kind === 'no-ua', 'W11/SEC: env SEC_USER_AGENT ว่าง → no-ua (ไม่ใช่ 403/fetch-failed)');
    if (saved !== undefined) process.env.SEC_USER_AGENT = saved;
    // มีแผนที่ที่ commit: ไม่ขอ company_tickers · ไม่มี UA ก็ยิง data.sec.gov ด้วย Mozilla/5.0 ได้
    const seen = [];
    const subs = (u, ua) => { seen.push([u, ua]); return JSON.stringify({ filings: { recent: { form: ['10-Q'], filingDate: ['2026-08-01'] } } }); };
    const m1 = EC.secLookup('AAPL', { ua: null, ciks: { AAPL: '0000320193', 'BRK-B': '1067983' }, fetchText: subs, cache: new Map() });
    ok(m1.date === '2026-08-01' && m1.cik === '0000320193' && seen.length === 1 && /data\.sec\.gov\/submissions\/CIK0000320193\.json/.test(seen[0][0]) && seen[0][1] === 'Mozilla/5.0', 'W11/SEC: มีแผนที่ + ไม่มี UA → ดึงเฉพาะ submissions ด้วย UA สำรอง ไม่ขอ company_tickers', JSON.stringify(seen));
    ok(EC.secLookup('BRK.B', { ua: null, ciks: { 'BRK-B': '1067983' }, fetchText: subs, cache: new Map() }).cik === '1067983'.padStart(10, '0'), 'W11/SEC: แผนที่ — จุด → ขีด · CIK เติม 10 หลัก');
    const nc = EC.secLookup('NOPE', { ua: 'ua-x', ciks: { AAPL: '320193' }, fetchText: throwing, cache: new Map() });
    ok(nc.kind === 'no-cik', 'W11/SEC: มีแผนที่แต่ไม่มี ticker → no-cik โดยไม่ยิง network', JSON.stringify(nc));
    // ไม่มีแผนที่ + มี UA ⇒ ขอ company_tickers ด้วย UA นั้น
    const seen2 = [];
    const both = (u, ua) => { seen2.push([u, ua]); return u.includes('company_tickers') ? JSON.stringify({ 0: { cik_str: 320193, ticker: 'AAPL' } }) : JSON.stringify({ filings: { recent: { form: ['10-K'], filingDate: ['2026-05-01'] } } }); };
    const w = EC.secLookup('AAPL', { ua: 'ua-x', ciks: null, fetchText: both, cache: new Map() });
    ok(w.date === '2026-05-01' && seen2[0][0].includes('www.sec.gov/files/company_tickers.json') && seen2[0][1] === 'ua-x' && seen2[1][1] === 'ua-x', 'W11/SEC: ไม่มีแผนที่ + มี UA → ขอ company_tickers ด้วย UA ที่ตั้ง', JSON.stringify(seen2));
    // loadCiks
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ciks-'));
    ok(EC.loadCiks(path.join(tmp, 'ไม่มี.json')) === null, 'W11/SEC: loadCiks ไม่มีไฟล์ → null');
    fs.writeFileSync(path.join(tmp, 'bad.json'), '{oops'); fs.writeFileSync(path.join(tmp, 'ok.json'), '{"AAPL":"0000320193"}');
    ok(EC.loadCiks(path.join(tmp, 'bad.json')) === null && EC.loadCiks(path.join(tmp, 'ok.json')).AAPL === '0000320193', 'W11/SEC: loadCiks ไฟล์พัง → null · ไฟล์ดี → object');
    ok(!fs.existsSync(EC.CIKS_FILE) || EC.loadCiks() !== undefined, 'W11/SEC: CIKS_FILE ชี้ tools/sec-ciks.json');
    // --sec-refresh-ciks
    const tk = () => JSON.stringify({ 0: { cik_str: 320193, ticker: 'AAPL' }, 1: { cik_str: 1067983, ticker: 'BRK-B' }, 2: { cik_str: 1046179, ticker: 'TSM' } });
    const target = path.join(tmp, 'sec-ciks.json');
    fs.writeFileSync(target, '{"OLD":"0000000001"}\n');
    const symbols = [['AAPL', 'AAPL'], ['BBL', 'BBL.BK'], ['BRK.B', 'BRK-B'], ['GHOST', 'GHOST']];
    const r0 = EC.secRefreshCiks({ ua: null, fetchText: throwing, file: target, symbols });
    ok(r0.ok === false && /no-ua/.test(r0.why) && fs.readFileSync(target, 'utf8') === '{"OLD":"0000000001"}\n', 'W11/SEC: refresh ไม่มี UA → ไม่ยิง network · ไฟล์เดิมไม่ถูกแตะ', r0.why);
    const r1x = EC.secRefreshCiks({ ua: 'ua-x', fetchText: throwing, file: target, symbols });
    ok(r1x.ok === false && /fetch-failed/.test(r1x.why) && fs.readFileSync(target, 'utf8') === '{"OLD":"0000000001"}\n', 'W11/SEC: refresh ดึงล้ม → ไฟล์เดิมไม่ถูกแตะ + บอกเหตุผล', r1x.why);
    const r2x = EC.secRefreshCiks({ ua: 'ua-x', fetchText: () => '{}', file: target, symbols });
    ok(r2x.ok === false && fs.readFileSync(target, 'utf8') === '{"OLD":"0000000001"}\n', 'W11/SEC: refresh ได้ map ว่าง → ไม่เขียนทับ');
    const r3x = EC.secRefreshCiks({ ua: 'ua-x', fetchText: tk, file: target, symbols });
    const written = JSON.parse(fs.readFileSync(target, 'utf8'));
    ok(r3x.ok && JSON.stringify(written) === JSON.stringify({ AAPL: '0000320193', 'BRK.B': '0001067983' }) && r3x.missing.join() === 'GHOST' && !('BBL' in written) && !('TSM' in written), 'W11/SEC: refresh เขียนเฉพาะ ticker US ที่มีรายงาน (ตัด TH/ที่ไม่มีรายงาน) · เติม 10 หลัก · รายงาน missing', JSON.stringify(written));
    // map ของ SEC ไม่ว่างแต่ไม่ตรงสักตัว → ไม่เขียน (ไม่ทิ้ง `{}`) · เขียนสำเร็จ → ไม่เหลือ .tmp
    const rNone = EC.secRefreshCiks({ ua: 'ua-x', fetchText: () => JSON.stringify({ 0: { cik_str: 1, ticker: 'ZZZ' } }), file: target, symbols });
    ok(rNone.ok === false && /ไม่มี ticker ของเราตรง/.test(rNone.why) && JSON.stringify(JSON.parse(fs.readFileSync(target, 'utf8'))) === JSON.stringify(written) && !fs.existsSync(target + '.tmp'), 'W11/SEC: refresh — SEC map ไม่ว่างแต่ไม่ตรงสักตัว → ไม่เขียน · ok=false (ทาง exit 1) · ไฟล์เดิมคงอยู่', rNone.why);
    ok(fs.readdirSync(tmp).filter((f) => /\.tmp$/.test(f)).length === 0, 'W11/SEC: refresh เขียนแบบ atomic — สำเร็จแล้วไม่เหลือ .tmp');
    // --sec-probe
    const probeFetch = (u) => (u.includes('company_tickers') ? JSON.stringify({ 0: { cik_str: 320193, ticker: 'AAPL' }, 1: { cik_str: 1046179, ticker: 'TSM' }, 2: { cik_str: 9, ticker: 'BOOM' } })
      : /CIK0000320193/.test(u) ? JSON.stringify({ filings: { recent: { form: ['10-Q', '8-K'], filingDate: ['2026-08-01', '2026-09-01'] } } })
      : /CIK0001046179/.test(u) ? JSON.stringify({ filings: { recent: { form: ['6-K'], filingDate: ['2026-08-01'] } } }) : (() => { throw new Error('403'); })());
    const pl = EC.secProbe(['AAPL', 'TSM', 'NOPE', 'BOOM'], { ua: 'ua-x', ciks: null, fetchText: probeFetch });
    ok(/^AAPL\s+cik=0000320193 latest=2026-08-01 kind=ok$/.test(pl[0]) && /kind=6k-only$/.test(pl[1]) && /kind=no-cik$/.test(pl[2]) && /kind=fetch-failed$/.test(pl[3]), 'W11/SEC: --sec-probe พิมพ์ CIK · วันงบล่าสุด · kind (ok|6k-only|no-cik|fetch-failed)', pl.join(' | '));
    ok(/kind=no-ua$/.test(EC.secProbe(['AAPL'], { ua: null, ciks: null, fetchText: throwing })[0]), 'W11/SEC: --sec-probe ไม่มี UA → kind=no-ua');
    // triage + สรุป preflight กรณีผสม · stmtNote ลง state
    const stMix = P.statementAfterOfWith({ symbols: {} }, () => '<footer>ข้อมูล ณ 1 ก.ค. 2569</footer>', { today: '2026-09-22', isThai: () => false,
      sec: (x) => (x === 'AAA' ? EC.secLookup(x, { ua: null, ciks: null, fetchText: throwing }) : x === 'BBB' ? EC.secLookup(x, { ua: 'u', ciks: null, fetchText: throwing, cache: new Map() }) : EC.secLookup(x, { ua: 'u', ciks: { CCC: '5' }, fetchText: () => JSON.stringify({ filings: { recent: { form: ['6-K'], filingDate: ['2026-08-01'] } } }) }))});
    const rowsMix = P.plan([{ symbol: 'AAA', reason: 'mos-sign-flip' }, { symbol: 'BBB', reason: 'drift-gt-15pct', diffPct: 20 }, { symbol: 'CCC', reason: 'mos-sign-flip' }, { symbol: 'AAA2', reason: 'drift-gt-15pct', diffPct: 20 }], '2026-09-22',
      { ageLimit: 0, footerAgeOf: () => 30, statementAfterOf: (x) => stMix(x === 'AAA2' ? 'AAA' : x) });
    const by2 = Object.fromEntries(rowsMix.map((r) => [r.symbol, r]));
    ok(by2.AAA.bucket === 'PREPATCH' && by2.AAA.stmtKind === 'no-ua' && by2.AAA.stmtNote === 'statement-unknown' && by2.AAA2.bucket === 'FULL' && by2.BBB.bucket === 'FULL' && by2.CCC.bucket === 'PREPATCH', 'W11/SEC: no-ua ปฏิบัติเหมือน unknown อื่น — flip คง PREPATCH · แถว worker = FULL', JSON.stringify(rowsMix.map((r) => [r.symbol, r.bucket, r.stmtKind])));
    const mixLine = P.unknownSummary(rowsMix);
    ok(mixLine === '⚠ statement unknown: 4 (fetch-failed 1 · no-ua 2) · 6k-only 1', 'W11/SEC: สรุป preflight แบบผสม แสดง no-ua', mixLine);
    ok(P.upsertRow(null, by2.AAA).stmtNote === 'statement-unknown', 'W11: upsertRow เก็บ stmtNote ลง state');
  }
  // BUG-001 · BUG-008
  const hsN = Pp.hardStock({}, { baseEPS: 2 }, { epsTTM: -0.4 });
  ok(hsN.hard && /vendor EPS TTM ≤ 0/.test(hsN.why) && !Pp.hardStock({}, { baseEPS: 2 }, { epsTTM: 1 }).hard, 'W11/BUG-001: vendor EPS TTM ≤ 0 → หุ้นยาก (pre-profit) แม้ EPS ฐานใบเก่าเป็นบวก');
  const eOld = Pp.extraBlock({ lightRule: 'new', sym: 'A', mode: 'UPDATE-LIGHT', prePatched: null, priceFresh: true, priceDate: '2026-09-21', lastSession: '2026-09-21', oldPrice: 10, price: 11, epsScreen: null, snap: [], medWarn: [], hard: false });
  const eStale = Pp.extraBlock({ lightRule: 'new', sym: 'A', mode: 'UPDATE-LIGHT', prePatched: '2026-09-10', priceFresh: false, priceDate: '2026-09-10', lastSession: '2026-09-21', epsScreen: null, snap: [], medWarn: [], hard: false, marketOpen: false });
  ok(/ห้ามรัน update-prices ซ้ำ/.test(eOld) && !/ยังไม่ได้ pre-patch/.test(eOld), 'W11/BUG-008: priceDate ≥ session ล่าสุด → ราคาสดแล้วแม้ state ไม่มี prePatched');
  ok(/ยังไม่สด/.test(eStale) && /update-prices.js --write --force A/.test(eStale) && !/ห้ามรัน update-prices ซ้ำ/.test(eStale), 'W11/BUG-008: priceDate เก่ากว่า session → บอกให้รัน update-prices แม้ state มี prePatched');
  ok(Pp.lastSessionISO(false, new Date('2026-09-20T12:00:00Z')) === '2026-09-18' && Pp.lastSessionISO(false, new Date('2026-09-22T12:00:00Z')) === '2026-09-21', 'W11/BUG-008: lastSessionISO US — อาทิตย์ → ศุกร์ · ช่วงเช้า ET วันอังคารก่อนปิด → จันทร์');
}

// ─────────────────────────── (Task 10–14 แทรกเทสเหนือบรรทัดนี้) ───────────────────────────
Promise.all([Promise.resolve(pending), applyEditsRacePromise])
  .catch((e) => { nFail++; console.error('✗ earnings-calendar-test/apply-edits-race ระเบิด (async) — ' + (e && e.message)); })
  .then(() => {
    console.log(`queue-test: ${nOK}/${nOK + nFail} ผ่าน`);
    if (nFail) { console.log('❌ runbook มีบั๊ก'); process.exit(1); }
    process.exit(0);
  });
