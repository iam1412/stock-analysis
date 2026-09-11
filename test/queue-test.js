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
  const t4 = P.patchTargets(rows.concat([{ symbol: 'GONE', reason: 'mos-sign-flip', bucket: 'LIGHT', currency: null, action: 'x', skip: null }]), { usOpen: false, setOpen: false, allowIntraday: false });
  ok(t4.skippedNoReport.join(',') === 'GONE' && !t4.target.includes('GONE'), 'patchTargets: ไม่มีไฟล์รายงาน (currency null) → ไม่เข้า batch pre-patch');
  const table = P.renderTable(rows);
  ok(/US1/.test(table) && /10→11/.test(table) && /30d/.test(table) && table.split('\n').length === rows.length + 1, 'renderTable: 1 แถว/flag + หัวตาราง');
  const man = P.manualSteps(rows);
  ok(/probe โมเดล/.test(man) && /US2/.test(man) && /US4\[fetch-failed\]/.test(man) && /prep <SYM>/.test(man), 'manualSteps: probe · DELIST · PLUMBING · ขั้นถัดไป');
  ok(man.split('\n').filter((l) => /^\d+\./.test(l)).length <= 5, 'manualSteps: ขั้นที่ต้องทำเอง ≤5 (KPI ระยะ 0)');
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

// ─────────────────────────── (Task 10–14 แทรกเทสเหนือบรรทัดนี้) ───────────────────────────
console.log(`queue-test: ${nOK}/${nOK + nFail} ผ่าน`);
if (nFail) { console.log('❌ runbook มีบั๊ก'); process.exit(1); }
process.exit(0);
