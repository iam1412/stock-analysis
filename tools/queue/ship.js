'use strict';
/**
 * ship — ขั้น D1–D4 + ปิด issue + build/preserve-dates สำหรับ pre-patch ล้วน (docs-audit §5: preserve-dates อยู่แค่ใน cron)
 *   ship <SYM>: tag-apply (ถ้ามี) → verify → preserve-dates+build (กัน `updated` ของใบที่แค่ pre-patch เด้ง) → add ไฟล์ที่ระบุ
 *               → commit 1 หุ้น (CLAUDE.md §5) → pull --rebase → push HEAD:main → ปิด issue ถ้าคิวว่าง
 *   ship --prepatch: รันทันทีหลัง preflight (ก่อน worker เริ่ม — ดู note ข้าง prepatchBlockers) → build → preserve-dates
 *               → build → verify → commit "price: …" → push · กันตัวที่ worker วิเคราะห์ใหม่แล้วโดนกวาดไปด้วย
 * ★ ไม่ทำแทน: ตัดสิน publish/skip (postcheck ต้อง pass หรือ --force หลังรีวิวเอง)
 */
const fs = require('fs');
const path = require('path');
const { run, must, ROOT } = require('./sh.js');
const S = require('./state.js');
const { todayBangkok, footerDate } = require('./footer-date.js');
const { readStockMeta } = require('../report-meta.js');

const FLAGS = path.join(ROOT, 'price-flags.json');
const TITLE = 'Price-refresh flags — หุ้นรอ re-analysis';   // ต้องตรงกับ update-prices.yml / dead-ticker-canary.yml
const MODEL_NAME = { sonnet: 'Sonnet 5', opus: 'Opus 5' };
const STOCK_FILES = (sym) => [`reports/${sym}.html`, 'tags.json', 'tools/seeds.json', 'price-flags.json', 'reports.json'];

const trailer = (model) => `Co-Authored-By: Claude ${MODEL_NAME[model] || 'Sonnet 5'} <noreply@anthropic.com>`;
function commitMessage(sym, rec, sm) {
  const mode = (rec && rec.mode) || 'UPDATE';
  const mos = sm && Number.isFinite(sm.mos) ? ` (MOS ${sm.mos < 0 ? '−' : '+'}${Math.abs(sm.mos)}%)` : '';
  return `analyze: ${mode === 'NEW' ? 'add' : 'update'} ${sym} — ${mode}${mos}`;
}
function verify() { console.log('▶ npm run verify'); must('npm', ['run', 'verify'], 'npm run verify'); }
function keepDates() { must('node', ['tools/preserve-dates.js'], 'preserve-dates'); must('npm', ['run', 'build'], 'build'); }
function pushWithRebase() {
  must('git', ['pull', '--rebase', 'origin', 'main'], 'git pull --rebase');
  must('git', ['push', 'origin', 'HEAD:main'], 'git push HEAD:main');
}
function closeIssueIfEmpty() {
  let n = 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(FLAGS, 'utf8'));
    if (!Array.isArray(parsed)) { console.log('⚠ price-flags.json ไม่ใช่ array — ไม่แตะ issue'); return; }
    n = parsed.length;
  } catch (e) { if (e.code !== 'ENOENT') { console.log('⚠ อ่าน price-flags.json ไม่ได้ — ไม่แตะ issue'); return; } }
  if (n) { console.log(`คิวเหลือ ${n} — issue คงเปิด`); return; }
  const q = run('gh', ['issue', 'list', '--state', 'open', '--search', `in:title "${TITLE}"`, '--json', 'number', '--jq', '.[0].number']);
  const num = q.out.trim();
  if (q.code !== 0 || !num) { console.log('issue คิว: ไม่มีที่เปิดอยู่ หรือ gh ใช้ไม่ได้ — ข้าม (cron รอบถัดไปปิดให้)'); return; }
  const c = run('gh', ['issue', 'close', num, '--comment', 'คิวเคลียร์หมดแล้ว ✅ (ปิดโดย npm run queue ship)']);
  console.log(c.code === 0 ? `✅ ปิด issue #${num}` : `⚠ ปิด issue #${num} ไม่สำเร็จ: ${c.err.slice(0, 200)}`);
}

function shipStock(sym, opts) {
  const o = opts || {};
  const rec = S.load().stocks[sym] || {};
  if (rec.postcheck !== 'pass' && !o.force) throw new Error(`${sym}: postcheck ยังไม่ผ่าน (${rec.postcheck || 'ยังไม่รัน'}) — รัน npm run queue -- postcheck ${sym} ก่อน หรือ --force ถ้ารีวิวเองแล้ว`);
  if (o.tags) must('node', ['tools/tag-apply.js', sym, ...o.tags.split(/\s+/).filter(Boolean)], 'tag-apply');
  verify();
  keepDates();
  const files = STOCK_FILES(sym).filter((f) => fs.existsSync(path.join(ROOT, f)));
  must('git', ['add', '--', ...files], 'git add');
  if (run('git', ['diff', '--cached', '--quiet']).code === 0) throw new Error(`ไม่มีอะไรให้ commit — worker ยังไม่ได้เขียน reports/${sym}.html? (เช็ค cwd-stray)`);
  const sm = readStockMeta(fs.readFileSync(path.join(ROOT, 'reports', sym + '.html'), 'utf8'));
  const msg = o.message || commitMessage(sym, rec, sm);
  must('git', ['commit', '-q', '-m', `${msg}\n\n${trailer(rec.model)}`], 'git commit');
  pushWithRebase();
  S.update(sym, { shippedAt: todayBangkok() });
  console.log(`✅ ${sym} push แล้ว: ${msg}`);
  closeIssueIfEmpty();
}

/** parse `git status --porcelain` (ส่วนบริสุทธิ์ — ไม่แตะ git) → [{ path, isNew }]
 *  rename (`R  old -> new` / `RM …`) ใช้ path ปลายทาง (หลัง ' -> ') · isNew = untracked (`??`) หรือเพิ่งถูก `git add` (`A`)
 *  → เข้าเงื่อนไข "ไฟล์ใหม่ทั้งใบ" เสมอ ไม่ว่าจะ stage แล้วหรือยัง */
function parsePorcelain(text) {
  return String(text).split('\n').filter(Boolean).map((line) => {
    const status = line.slice(0, 2);
    let p = line.slice(3).trim();
    if (p.includes(' -> ')) p = p.split(' -> ').pop().trim();
    return { path: p, isNew: /[A?]/.test(status) };
  });
}

/** ปฏิเสธไฟล์ใน reports/ ที่ worker วิเคราะห์ใหม่แล้ว (ไม่ใช่แค่ pre-patch ราคาที่ preflight ทำ) — `ship --prepatch`
 *  ต้องไม่กวาดไปเป็น commit "price: …" ทั้งที่ยังไม่ผ่าน postcheck/รีวิว
 *  entries = [{ path, untracked, headFooterISO, workFooterISO }] → คืน { blocked, unreadable } (ส่วนบริสุทธิ์ ไม่แตะ git)
 *  ★ อ่าน footer ได้ข้างเดียว (เช่น HEAD parse ไม่ออก) = สงสัย → กันไว้ก่อน · อ่านไม่ได้ทั้งสองข้าง = ไม่รู้จริง ๆ → ไม่กัน แต่ขึ้น unreadable ให้คนตรวจเอง */
function prepatchBlockers(entries) {
  const blocked = [], unreadable = [];
  for (const e of entries) {
    const m = /^reports\/(.+)\.html$/.exec(e.path);
    if (!m) continue;
    const sym = m[1];
    if (e.untracked) { blocked.push(sym); continue; }   // ไฟล์ใหม่ทั้งใบ = worker เขียน ไม่ใช่ pre-patch ราคา
    const h = e.headFooterISO, w = e.workFooterISO;
    if (h == null && w == null) { unreadable.push(sym); continue; }
    if (h == null || w == null) { blocked.push(sym); continue; }   // อ่านได้ข้างเดียว = สงสัย
    if (h !== w) blocked.push(sym);   // footer ขยับ = วิเคราะห์ใหม่แล้ว
  }
  return { blocked, unreadable };
}

function shipPrepatch() {
  const porcelain = parsePorcelain(run('git', ['status', '--porcelain', '--', 'reports']).out);
  if (!porcelain.length) { console.log('ไม่มีไฟล์ใน reports/ ที่เปลี่ยน — ไม่มีอะไรจะ ship'); return; }
  const changed = porcelain.map((e) => e.path);
  const entries = porcelain.map((e) => {
    const untracked = e.isNew;
    const head = untracked ? null : run('git', ['show', `HEAD:${e.path}`]);
    const headFooterISO = head && head.code === 0 ? ((footerDate(head.out) || {}).iso || null) : null;
    const fp = path.join(ROOT, e.path);
    const workFooterISO = fs.existsSync(fp) ? ((footerDate(fs.readFileSync(fp, 'utf8')) || {}).iso || null) : null;
    return { path: e.path, untracked, headFooterISO, workFooterISO };
  });
  const { blocked, unreadable } = prepatchBlockers(entries);
  if (blocked.length) throw new Error(blocked.map((sym) => `ship --prepatch: ${sym} ถูกวิเคราะห์ใหม่แล้ว (footer ขยับ/ไฟล์ใหม่) — ใช้ npm run queue -- ship ${sym} แทน`).join('\n'));
  if (unreadable.length) console.log('⚠ อ่าน footer ไม่ได้ทั้ง HEAD และ working tree — ตรวจเองว่าไม่ใช่งาน worker: ' + unreadable.join(' '));
  must('npm', ['run', 'build'], 'build');
  keepDates();
  verify();
  must('git', ['add', '--', 'reports', 'reports.json', 'price-flags.json'], 'git add');
  must('git', ['commit', '-q', '-m', `price: pre-patch ${changed.length} symbols (manual queue run ${todayBangkok()})\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`], 'git commit');
  pushWithRebase();
  const today = todayBangkok();
  for (const p of changed) {
    const m = /^reports\/(.+)\.html$/.exec(p);
    if (m) S.update(m[1], { prepatchShippedAt: today });
  }
  console.log(`✅ pre-patch ${changed.length} ใบ push แล้ว (วันที่วิเคราะห์คงเดิมผ่าน preserve-dates)`);
  closeIssueIfEmpty();
}

/** X/Y ตาม memory feedback-progress-counter: push แล้ว / รอ push / ยังไม่เริ่ม
 *  ★ bucket ต้องไม่ซ้อนกัน — idle/other แบ่งกันตาม (skip || bucket ไม่ใช่ LIGHT/FULL) ภายใต้เงื่อนไขเดียวกันทุกตัว
 *    (เดิม `other` ไม่เช็ค !postcheck/!prepAt ⇒ แถวที่มี postcheck:'review' แต่ไม่มี bucket ขึ้นซ้ำทั้ง review และ other) */
function status() {
  const s = S.load();
  const rows = Object.entries(s.stocks);
  const pushed = rows.filter(([, r]) => r.shippedAt).map(([k]) => k);
  const waiting = rows.filter(([, r]) => !r.shippedAt && r.postcheck === 'pass').map(([k]) => k);
  const review = rows.filter(([, r]) => !r.shippedAt && r.postcheck === 'review').map(([k]) => k);
  const prepped = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && r.prepAt).map(([k]) => k);
  const idle = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && !r.prepAt && !r.skip && ['LIGHT', 'FULL'].includes(r.bucket)).map(([k]) => k);
  const other = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && !r.prepAt && (r.skip || !['LIGHT', 'FULL'].includes(r.bucket))).map(([k, r]) => `${k}[${r.skip ? 'สด' : (r.bucket || '-')}]`);
  const prepatchShipped = rows.filter(([, r]) => r.prepatchShippedAt).map(([k]) => k);
  console.log(`รอบเริ่ม ${s.startedAt || '-'} · ${pushed.length}/${rows.length}`);
  console.log(`push แล้ว ${pushed.length}: ${pushed.join(' ') || '-'}`);
  console.log(`รอ push ${waiting.length}: ${waiting.join(' ') || '-'}`);
  console.log(`postcheck ต้องดู ${review.length}: ${review.join(' ') || '-'}`);
  console.log(`prep แล้วรอ worker ${prepped.length}: ${prepped.join(' ') || '-'}`);
  console.log(`ยังไม่เริ่ม ${idle.length}: ${idle.join(' ') || '-'}`);
  console.log(`ไม่ใช้ agent/ข้าม ${other.length}: ${other.join(' ') || '-'}`);
  console.log(`pre-patch push แล้ว ${prepatchShipped.length}: ${prepatchShipped.join(' ') || '-'}`);
}

module.exports = { shipStock, shipPrepatch, status, commitMessage, trailer, closeIssueIfEmpty, prepatchBlockers, parsePorcelain, STOCK_FILES, TITLE };
