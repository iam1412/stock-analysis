'use strict';
/**
 * ship — ขั้น D1–D4 + ปิด issue + build/preserve-dates สำหรับ pre-patch ล้วน (docs-audit §5: preserve-dates อยู่แค่ใน cron)
 *   ship <SYM>: tag-apply (ถ้ามี) → verify → preserve-dates+build (กัน `updated` ของใบที่แค่ pre-patch เด้ง) → add ไฟล์ที่ระบุ
 *               → commit 1 หุ้น (CLAUDE.md §5) → pull --rebase → push HEAD:main → ปิด issue ถ้าคิวว่าง
 *   ship --prepatch: ใบที่ pre-patch แล้วไม่ได้วิเคราะห์ใหม่ → build → preserve-dates → build → verify → commit "price: …" → push
 * ★ ไม่ทำแทน: ตัดสิน publish/skip (postcheck ต้อง pass หรือ --force หลังรีวิวเอง)
 */
const fs = require('fs');
const path = require('path');
const { run, must, ROOT } = require('./sh.js');
const S = require('./state.js');
const { todayBangkok } = require('./footer-date.js');
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
  try { n = JSON.parse(fs.readFileSync(FLAGS, 'utf8')).length; }
  catch (e) { if (e.code !== 'ENOENT') { console.log('⚠ อ่าน price-flags.json ไม่ได้ — ไม่แตะ issue'); return; } }
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

function shipPrepatch() {
  const changed = run('git', ['diff', '--name-only', '--', 'reports']).out.trim().split('\n').filter(Boolean);
  if (!changed.length) { console.log('ไม่มีไฟล์ใน reports/ ที่เปลี่ยน — ไม่มีอะไรจะ ship'); return; }
  must('npm', ['run', 'build'], 'build');
  keepDates();
  verify();
  must('git', ['add', '--', 'reports', 'reports.json', 'price-flags.json'], 'git add');
  must('git', ['commit', '-q', '-m', `price: pre-patch ${changed.length} symbols (manual queue run ${todayBangkok()})\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`], 'git commit');
  pushWithRebase();
  console.log(`✅ pre-patch ${changed.length} ใบ push แล้ว (วันที่วิเคราะห์คงเดิมผ่าน preserve-dates)`);
  closeIssueIfEmpty();
}

/** X/Y ตาม memory feedback-progress-counter: push แล้ว / รอ push / ยังไม่เริ่ม */
function status() {
  const s = S.load();
  const rows = Object.entries(s.stocks);
  const pushed = rows.filter(([, r]) => r.shippedAt).map(([k]) => k);
  const waiting = rows.filter(([, r]) => !r.shippedAt && r.postcheck === 'pass').map(([k]) => k);
  const review = rows.filter(([, r]) => !r.shippedAt && r.postcheck === 'review').map(([k]) => k);
  const prepped = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && r.prepAt).map(([k]) => k);
  const idle = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && !r.prepAt && !r.skip && ['LIGHT', 'FULL'].includes(r.bucket)).map(([k]) => k);
  const other = rows.filter(([, r]) => !r.shippedAt && (r.skip || !['LIGHT', 'FULL'].includes(r.bucket))).map(([k, r]) => `${k}[${r.skip ? 'สด' : r.bucket}]`);
  console.log(`รอบเริ่ม ${s.startedAt || '-'} · ${pushed.length}/${rows.length}`);
  console.log(`push แล้ว ${pushed.length}: ${pushed.join(' ') || '-'}`);
  console.log(`รอ push ${waiting.length}: ${waiting.join(' ') || '-'}`);
  console.log(`postcheck ต้องดู ${review.length}: ${review.join(' ') || '-'}`);
  console.log(`prep แล้วรอ worker ${prepped.length}: ${prepped.join(' ') || '-'}`);
  console.log(`ยังไม่เริ่ม ${idle.length}: ${idle.join(' ') || '-'}`);
  console.log(`ไม่ใช้ agent/ข้าม ${other.length}: ${other.join(' ') || '-'}`);
}

module.exports = { shipStock, shipPrepatch, status, commitMessage, trailer, closeIssueIfEmpty, STOCK_FILES, TITLE };
