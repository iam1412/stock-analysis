'use strict';
/**
 * preflight — ขั้น A1–A9 ของรอบเคลียร์คิว (docs-audit §5) ที่ script ทำแทนได้:
 *   pull --rebase · อ่านคิว · triage ครบทุก reason · ความสดจาก footer · snapshot ราคาเดิมลง state (postcheck ใช้ grep ราคาค้าง)
 *   · pre-patch ราคา LIGHT/FULL ทั้งชุดใน process เดียว (ไม่ pre-patch ระหว่างตลาดเปิด) → ยิง gate ต่อทันที คืนไฟล์ใบที่ตก
 *   (--force ข้าม quarantine ของ cron ⇒ preflight ต้องทำ quarantine เอง) · พิมพ์ขั้นที่ยังต้องทำเอง
 * ★ ไม่ทำแทน: probe โมเดล (ต้อง spawn subagent) · ยืนยันเพิกถอน · แก้ plumbing · ตัดสินใจกำกวม
 */
const fs = require('fs');
const path = require('path');
const { run, must, ROOT } = require('./sh.js');
const S = require('./state.js');
const { footerDate, ageDays, todayBangkok } = require('./footer-date.js');
const { usSessionOpen, setSessionOpen } = require('./market.js');
const { triage, prePatchList } = require('./triage.js');
const { readStockMeta } = require('../report-meta.js');

const REPORTS = path.join(ROOT, 'reports');
const FLAGS = path.join(ROOT, 'price-flags.json');

const readReport = (sym) => { const fp = path.join(REPORTS, sym + '.html'); return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null; };
function loadFlags() {
  try { return JSON.parse(fs.readFileSync(FLAGS, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw new Error(`อ่าน price-flags.json ไม่ได้ (${e.message})`); }
}

/** triage + เติมราคาเดิม/สกุลจาก stock-meta ของไฟล์ (อ่านดิสก์ — ส่วนที่เทสไม่ครอบ) */
function plan(flags, today) {
  const rows = triage(flags, { footerAgeOf: (sym) => { const h = readReport(sym); const d = h && footerDate(h); return d ? ageDays(d.iso, today) : null; } });
  for (const r of rows) {
    const h = readReport(r.symbol);
    const sm = h && readStockMeta(h);
    r.oldPrice = sm && Number.isFinite(sm.price) ? sm.price : null;
    r.currency = sm ? sm.currency : null;
  }
  return rows;
}

/** เลือกตัวที่ pre-patch ได้ตอนนี้ — ตลาดของสกุลนั้นเปิดอยู่ = ข้าม (--force ของ update-prices ข้าม guard intraday เอง)
 *  currency == null (ไม่มีไฟล์รายงาน/ไม่มี stock-meta) → ข้ามออกจาก batch เสมอ ไม่เดาว่าเป็น US */
function patchTargets(rows, m) {
  const cur = new Map(rows.map((r) => [r.symbol, r.currency]));
  const out = { target: [], skippedUS: [], skippedTH: [], skippedNoReport: [] };
  for (const sym of prePatchList(rows)) {
    const c = cur.get(sym);
    if (c == null) { out.skippedNoReport.push(sym); continue; }
    const th = c === 'THB';
    if (!m.allowIntraday && !th && m.usOpen) { out.skippedUS.push(sym); continue; }
    if (!m.allowIntraday && th && m.setOpen) { out.skippedTH.push(sym); continue; }
    out.target.push(sym);
  }
  return out;
}

/** อ่านผล `node test/check-reports.js <syms>` → รายชื่อไฟล์ที่ "ตก" (ส่วนบริสุทธิ์ ไม่แตะดิสก์)
 *  บรรทัดสรุปต่อไฟล์เริ่มต้นบรรทัดเสมอ (`✗ BBB.html 41/43 ผ่าน — 2 ปัญหา`) ส่วนรายละเอียด E-code ย่อหน้าเข้ามา
 *  (`    ✗ [E15] …`) ⇒ anchor `^✗` แยกสองชั้นนี้ออกจากกัน */
function parseGateFailures(out) {
  const syms = [];
  for (const line of String(out).split('\n')) {
    const m = /^✗\s+(\S+)\.html\b/.exec(line);
    if (m) syms.push(m[1]);
  }
  return syms;
}

function renderTable(rows) {
  const L = ['symbol     reason                  bucket    ใบ→ตลาด            ต่าง   ตั้งแต่     footer  การทำ'];
  for (const r of rows) {
    const px = `${r.reportPrice ?? '-'}→${r.marketPrice ?? '-'}`;
    L.push(`${r.symbol.padEnd(10)} ${String(r.reason).padEnd(23)} ${String(r.bucket).padEnd(9)} ${px.padEnd(18)} ${String(r.diffPct != null ? r.diffPct + '%' : '').padStart(6)} ${String(r.flaggedAt || '').padEnd(11)} ${String(r.footerAge != null ? r.footerAge + 'd' : '?').padStart(5)}  ${r.skip || r.action}`);
  }
  return L.join('\n');
}

/** ★ รายการขั้นที่ script ทำแทนไม่ได้ — พิมพ์ทุกครั้ง นี่คือตัววัด "ขั้นที่ต้องจำ ≤5" (KPI ระยะ 0) */
function manualSteps(rows) {
  const L = ['\n── ขั้นที่ต้องทำเอง (script ทำแทนไม่ได้) ──'];
  let n = 0;
  L.push(`${++n}. probe โมเดล: spawn subagent ไม่ใส่ model ให้ตอบบรรทัด "You are powered by the model named …" (CLAUDE.md §3.2) แล้ว pin ทุก call`);
  const d = rows.filter((r) => r.bucket === 'DELIST');
  if (d.length) L.push(`${++n}. DELIST ${d.map((r) => r.symbol).join(' ')}: ยืนยันแหล่งปฐมภูมิ (SEC Form 25/8-K · ประกาศตลาด) → ลบรายงาน + node tools/tag-apply.js --prune · ยังเทรด → node tools/update-prices.js --write --alive <SYM>`);
  // prePatchRejected ติดมากับแถวหลัง preflight เท่านั้น (pre-patch แล้ว gate ตก → คืนไฟล์) — คลาสเดียวกับ REJECTED ของ cron: แก้ใบเอง ไม่ spawn agent
  const p = rows.filter((r) => r.bucket === 'PLUMBING' || r.bucket === 'REJECTED' || r.bucket === 'UNKNOWN' || r.prePatchRejected);
  if (p.length) L.push(`${++n}. ${p.map((r) => `${r.symbol}[${r.prePatchRejected ? 'gate ตกหลัง pre-patch' : r.reason}]`).join(' ')}: แก้ตามคอลัมน์ "การทำ" ไม่ spawn agent`);
  L.push(`${++n}. ต่อไป: npm run queue -- ship --prepatch (push ราคาที่ patch ให้ tree สะอาด) แล้ว npm run queue -- prep <SYM> ทีละตัว (ตัวที่ไม่มี "สด" ในคอลัมน์การทำ)`);
  return L.join('\n');
}

function preflight(opts) {
  const o = opts || {};
  if (run('git', ['status', '--porcelain']).out.trim() && !o.allowDirty)
    throw new Error('working tree ไม่สะอาด — commit ก่อน (CLAUDE.md §5: commit ก่อน pull --rebase) หรือใส่ --allow-dirty ถ้าตั้งใจ');
  must('git', ['pull', '--rebase', 'origin', 'main'], 'git pull --rebase');
  const today = todayBangkok();
  const flags = loadFlags();
  const rows = plan(flags, today);
  console.log(`\n=== คิว price-flags ${flags.length} รายการ · ${today} ===\n${renderTable(rows)}`);
  const s = S.load();
  s.startedAt = s.startedAt || today;
  for (const r of rows) s.stocks[r.symbol] = { ...(s.stocks[r.symbol] || {}), reason: r.reason, bucket: r.bucket, oldPrice: r.oldPrice, currency: r.currency, footerAge: r.footerAge, skip: r.skip, flaggedAt: r.flaggedAt || null };
  S.save(s);   // บันทึก snapshot ก่อน pre-patch — patch ล้มก็ต้องเหลือราคาเดิมให้ postcheck ใช้
  const t = patchTargets(rows, { usOpen: usSessionOpen(), setOpen: setSessionOpen(), allowIntraday: !!o.allowIntraday });
  if (t.skippedUS.length) console.log(`\n⏳ ตลาด US เปิดอยู่ — ไม่ pre-patch ${t.skippedUS.join(' ')} (ราคา intraday · --force ข้าม guard ของ update-prices เอง — บทเรียน 9 ก.ย. 69) · ต้องการจริงใส่ --allow-intraday`);
  if (t.skippedTH.length) console.log(`\n⏳ SET เปิดอยู่ — ไม่ pre-patch ${t.skippedTH.join(' ')} · --allow-intraday ถ้าจงใจ`);
  if (t.skippedNoReport.length) console.log(`\n⚠ ไม่มีไฟล์รายงาน — ไม่ pre-patch ${t.skippedNoReport.join(' ')} (ลบไปแล้ว? รัน node tools/tag-apply.js --prune แล้วปล่อยให้ cron ตัด flag ทิ้ง)`);
  if (t.target.length && !o.noPatch) {
    console.log(`\n▶ pre-patch ราคา ${t.target.length} ตัวใน process เดียว (lock กันคิวเพี้ยนแล้ว — WS4)`);
    const r = run('node', ['tools/update-prices.js', '--write', '--force', ...t.target]);
    process.stdout.write(r.out);
    if (r.code !== 0) throw new Error('pre-patch ล้ม: ' + (r.err || r.out).slice(-1000));
    // ★ --force ข้าม quarantine ของ cron (cron patch แล้ว gate ตก = ไม่เขียนไฟล์ + flag patch-rejected) ⇒ ต้องยิง gate เอง
    //   ใบที่ตกต้องคืนไฟล์ ไม่งั้น `ship --prepatch` จะ verify ตกทั้งชุด และใบที่ดีก็ push ไม่ได้
    console.log('\n▶ gate หลัง pre-patch: node test/check-reports.js ' + t.target.join(' '));
    const g = run('node', ['test/check-reports.js', ...t.target]);
    process.stdout.write(g.out);
    const failed = parseGateFailures(g.out);
    if (g.code !== 0 && !failed.length) throw new Error('check-reports หลัง pre-patch ล้มแต่แยกไฟล์ที่ตกไม่ได้ — ตรวจเอง (ราคาที่ patch ยังอยู่ในไฟล์):\n' + (g.err || g.out).trim().slice(-1000));
    const fail = new Set(failed);
    for (const sym of t.target) {
      if (!fail.has(sym)) { s.stocks[sym].prePatched = today; continue; }
      s.stocks[sym].prePatchRejected = today;
      const row = rows.find((x) => x.symbol === sym);
      if (row) row.prePatchRejected = today;
    }
    S.save(s);   // บันทึกก่อนคืนไฟล์ — checkout ล้มแล้ว throw ก็ยังเหลือสถานะให้ postcheck/status อ่าน
    for (const sym of failed) {
      must('git', ['checkout', '--', `reports/${sym}.html`], `คืนไฟล์ ${sym} หลัง gate ตก`);
      console.log(`⛔ ${sym} gate ตกหลัง pre-patch → คืนไฟล์แล้ว (ต้องแก้ใบให้ผ่าน npm test -- ${sym} ก่อน · ดูรายละเอียดด้านบน)`);
    }
  } else if (t.target.length) console.log(`\n(--no-patch) คำสั่งที่จะรัน: node tools/update-prices.js --write --force ${t.target.join(' ')}`);
  S.save(s);
  console.log(manualSteps(rows));
  return rows;
}

module.exports = { preflight, plan, patchTargets, renderTable, manualSteps, loadFlags, parseGateFailures };
