'use strict';
/**
 * postcheck <SYM> — ขั้น C1–C3 · C10–C11 + สิ่งที่ memory สั่งให้ controller ดูเอง (docs-audit §5):
 *   npm test -- SYM (0 error) · spotcheck · grep ราคาเดิมค้างทั้งไฟล์ (gate มองไม่เห็น prose) · ai-model ตรงกับที่ spawn
 *   · EPS ฐาน ≤ 0 ⇒ stock-meta.pe ต้อง null (roe = เตือน) · footer "ข้อมูล ณ" = วันนี้ + พ.ศ.
 * ★ ไม่ทำแทน: ชั้น 0 valuation (cluster/|MOS|>40%/สมอตาย/ตระกูลเดียว) — คนอ่าน spotcheck + W18/W05 เอง
 */
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./sh.js');
const S = require('./state.js');
const { footerDate, todayBangkok } = require('./footer-date.js');

const REPORTS = path.join(ROOT, 'reports');
const MODEL_RE = { sonnet: /sonnet/i, opus: /opus/i };

/** ราคาเดิม (ก่อน pre-patch) ที่ยังโผล่ในเนื้อความ — ทั้งรูปทศนิยม/จำนวนเต็ม/มี comma · ข้ามบล็อก JSON */
function findOldPrice(html, oldPrice) {
  if (!(oldPrice > 0)) return [];
  const forms = new Set([String(oldPrice), oldPrice.toFixed(2), oldPrice.toFixed(1), String(Math.round(oldPrice)), oldPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })]);
  const re = new RegExp(`(?:[฿$]|C\\$)\\s*(?:${[...forms].map((f) => f.replace(/[.]/g, '\\.')).join('|')})(?![0-9])`);
  const hits = [];
  String(html).split('\n').forEach((l, i) => {
    if (/id="(stock-meta|report-data)"/.test(l)) return;
    if (re.test(l)) hits.push({ line: i + 1, text: l.trim().slice(0, 140) });
  });
  return hits;
}

/** ตรวจ meta ที่ gate ไม่รู้: ai-model vs โมเดลที่ spawn · pe/roe เมื่อขาดทุน · footer */
function checkMeta(ctx, model, fd, today) {
  const issues = [];
  if (model && ctx.aiModel && MODEL_RE[model] && !MODEL_RE[model].test(ctx.aiModel)) issues.push(`ai-model "${ctx.aiModel}" ไม่ตรงโมเดลที่ spawn (${model}) — worker ต้องประทับรุ่นที่รันจริง`);
  const sm = ctx.sm && ctx.sm.ok ? ctx.sm.data : null;
  if (ctx.baseEPS != null && ctx.baseEPS <= 0 && sm) {
    if (sm.pe !== null && sm.pe !== undefined) issues.push(`EPS ฐาน ${ctx.baseEPS} ≤ 0 แต่ stock-meta.pe = ${sm.pe} (ต้อง null)`);
    if (sm.roe !== null && sm.roe !== undefined && sm.roe > 0) issues.push(`EPS ฐาน ≤ 0 แต่ stock-meta.roe = ${sm.roe} — ตรวจว่าขาดทุนสุทธิไหม (ถ้าใช่ต้อง null — เคส OKJ)`);
  }
  if (!fd) issues.push('อ่านวันที่ footer "ข้อมูล ณ" ไม่ได้');
  else {
    if (fd.iso !== today) issues.push(`footer "ข้อมูล ณ" = ${fd.iso} ไม่ใช่วันนี้ ${today} (re-analysis ทุกโหมดต้องขยับ footer — SKILL 5B/5C)`);
    if (fd.era !== 'BE') issues.push('footer ใช้ปี ค.ศ. — กติกา พ.ศ. (CLAUDE.md §7)');
  }
  return issues;
}

function postcheck(sym, opts) {
  const o = opts || {};
  const fp = path.join(REPORTS, sym + '.html');
  if (!fs.existsSync(fp)) throw new Error(`ไม่มี reports/${sym}.html — worker ยังไม่ได้เขียน (หรือเขียนผิดที่ — ดู STEP 0 cwd-stray)`);
  const rec = S.load().stocks[sym] || {};
  const issues = [], notes = [];

  const t = run('node', ['test/check-reports.js', sym]);
  process.stdout.write(t.out);
  if (t.code !== 0) issues.push('npm test ตก (มี error) — แก้ก่อน');
  const sp = run('node', ['tools/spotcheck.js', sym]);
  process.stdout.write(sp.out);
  if (/▸/.test(sp.out)) notes.push('spotcheck มีรายการให้อ่าน (ด้านบน) — ตัดสินเอง ไม่ใช่ gate');

  const html = fs.readFileSync(fp, 'utf8');
  const hits = findOldPrice(html, rec.oldPrice);
  if (hits.length) issues.push(`ราคาเดิม ${rec.oldPrice} ยังโผล่ ${hits.length} จุด:\n` + hits.map((h) => `    L${h.line}: ${h.text}`).join('\n'));

  const { buildCtx } = require('../../test/check-reports.js');
  const { expandReport } = require('../../build.js');
  const ctx = buildCtx(expandReport(html), sym + '.html');
  issues.push(...checkMeta(ctx, o.model || rec.model, footerDate(html), todayBangkok()));
  // ช่อง required ที่ manifest อ่านไม่ได้ = โครงที่ worker เขียนไม่ครบ (W21 ใน gate เป็น warn จึงไม่บล็อก push เอง)
  // ⇒ ต้องขึ้นเป็น issue ตรงนี้ เพราะ postcheck คือจุดที่ controller ตัดสินว่าจะรับงาน worker ไหม
  if (ctx.mf && ctx.mf.missing.length)
    issues.push(`manifest: ช่อง required อ่านไม่ได้ ${ctx.mf.missing.join(' ')} (W21 — worker เขียนโครงไม่ครบ)`);

  const verdict = issues.length ? 'review' : 'pass';
  S.update(sym, { postcheck: verdict, postcheckAt: todayBangkok() });
  console.log(`\n=== postcheck ${sym}: ${verdict === 'pass' ? '✅ ผ่าน' : `⚠ ต้องดู ${issues.length} ข้อ`} ===`);
  for (const i of issues) console.log('  ✗ ' + i);
  for (const n of notes) console.log('  · ' + n);
  console.log('\n── ขั้นที่ต้องทำเอง ──');
  console.log('1. ชั้น 0 valuation (CLAUDE.md §8): cluster check · |MOS| >40% มีพยาน · W18/W05 · การ์ด EV/Sales·EV/EBITDA·DCF ไม่มี gate อ่านเอง');
  console.log(`2. ตัดสิน publish/skip${issues.length ? ' (แก้ issue ข้างบนก่อน หรือ re-dispatch)' : ''} → npm run queue -- ship ${sym} [--tags "…"]`);
  return { issues, notes };
}

module.exports = { postcheck, findOldPrice, checkMeta };
