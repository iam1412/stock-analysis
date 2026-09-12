'use strict';
/**
 * ship — ขั้น D1–D4 + ปิด issue + build/preserve-dates สำหรับ pre-patch ล้วน (docs-audit §5: preserve-dates อยู่แค่ใน cron)
 *   ship <SYM>: tag-apply (ถ้ามี) → verify → preserve-dates+build (กัน `updated` ของใบที่แค่ pre-patch เด้ง) → add ไฟล์ที่ระบุ
 *               → commit 1 หุ้น (CLAUDE.md §5) → pull --rebase → push HEAD:main → ปิด issue ถ้าคิวว่าง
 *   ship --prepatch: รันทันทีหลัง preflight (ก่อน worker เริ่ม — ดู note ข้าง prepatchBlockers) → build → preserve-dates
 *               → build → verify → commit "price: …" → push · กันตัวที่ worker วิเคราะห์ใหม่แล้วโดนกวาดไปด้วย
 *               · รอบที่มีแต่ PREPATCH (flip ในย่าน — ระยะ 1 ข้อ D) ปิด issue ตรงนี้ด้วย เพราะไม่มี `ship <SYM>` ตามมา
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

const trailer = (model) => { const n = MODEL_NAME[model]; if (!n) throw new Error(`โมเดล "${model}" ไม่รู้จัก — ป้าย Co-Authored-By ต้องตรงกับที่รันจริง (sonnet|opus)`); return `Co-Authored-By: Claude ${n} <noreply@anthropic.com>`; };
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

/** commit ของหุ้นตัวนี้มีอยู่ใน log ที่ยังไม่ push ไหม (ส่วนบริสุทธิ์ — รับข้อความ `git log --format=%s` มาตรง ๆ)
 *  ใช้ตอน `ship <SYM>` รอบสองหลัง push ล้ม: stage ว่างเพราะ commit ไปแล้ว ไม่ใช่เพราะ worker ไม่ได้เขียนไฟล์ */
function pendingCommitFor(sym, logText) {
  const esc = String(sym).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^analyze: (add|update) ${esc}\\b`, 'm').test(String(logText || ''));
}
/** commit ที่ยังไม่ push ของรอบนี้ — เทียบ `origin/main` ก่อนเสมอเพราะปลายทางของ push คือ `HEAD:main` ตายตัว
 *  (worktree มี `@{u}` เป็น branch ฟีเจอร์ของตัวเอง ⇒ commit ที่ยังไม่ถึง main จะไม่โผล่) · ไม่รู้จัก origin/main จึง fallback `@{u}` */
function unpushedSubjects() {
  const om = run('git', ['log', 'origin/main..HEAD', '--format=%s']);
  return om.code === 0 ? om.out : run('git', ['log', '@{u}..HEAD', '--format=%s']).out;
}
/** args ของ `git commit` ที่จำกัดขอบเขตด้วย pathspec (ส่วนบริสุทธิ์)
 *  ★ `git commit -m …` เปล่า ๆ commit **index ทั้งก้อน** ⇒ การลบรายงานที่ `git rm` ค้างไว้ (DELIST) หลุดเข้า commit
 *    "price: …"/"analyze: …" โดยไม่มี `tag-apply --prune` ไปด้วย → tags-test ตกบน main · ใส่ `--` + รายชื่อไฟล์กันไว้ */
const commitArgs = (msg, files) => ['commit', '-q', '-m', msg, '--', ...files];
/** push แล้วล้ม = commit ยังอยู่ในเครื่อง — บอกให้ชัดว่ารัน ship <SYM> ซ้ำจะ push ต่อ ไม่ใช่ให้ worker เขียนใหม่ */
function pushOrExplain(sym) {
  try { pushWithRebase(); }
  catch (e) {
    throw new Error(`${e.message}\n⇒ push ล้ม — commit อยู่แล้ว: แก้ conflict (ถ้ามี) แล้วรัน npm run queue -- ship ${sym} ซ้ำ (จะข้าม commit ไปทำ pull --rebase + push)`);
  }
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
  if (run('git', ['diff', '--cached', '--quiet']).code === 0) {
    // stage ว่างมีสองสาเหตุ แยกให้ออก: commit ไปแล้วแต่ push ล้ม (รันซ้ำ = push ต่อ) vs worker ไม่ได้เขียนไฟล์จริง
    if (pendingCommitFor(sym, unpushedSubjects())) {
      console.log(`ℹ commit ของ ${sym} มีอยู่แล้ว (ยังไม่ push) — push ต่อ`);
      pushOrExplain(sym);
      S.update(sym, { shippedAt: todayBangkok() });
      console.log(`✅ ${sym} push แล้ว (commit เดิม)`);
      closeIssueIfEmpty();
      return;
    }
    throw new Error(`ไม่มีอะไรให้ commit — worker ยังไม่ได้เขียน reports/${sym}.html? (เช็ค cwd-stray)`);
  }
  const sm = readStockMeta(fs.readFileSync(path.join(ROOT, 'reports', sym + '.html'), 'utf8'));
  const msg = o.message || commitMessage(sym, rec, sm);
  must('git', commitArgs(`${msg}\n\n${trailer(rec.model)}`, files), 'git commit');
  pushOrExplain(sym);
  S.update(sym, { shippedAt: todayBangkok() });
  console.log(`✅ ${sym} push แล้ว: ${msg}`);
  closeIssueIfEmpty();
}

/** parse `git status --porcelain` (ส่วนบริสุทธิ์ — ไม่แตะ git) → [{ path, isNew, deleted }]
 *  rename (`R  old -> new` / `RM …`) ใช้ path ปลายทาง (หลัง ' -> ') · isNew = untracked (`??`) หรือเพิ่งถูก `git add` (`A`)
 *  → เข้าเงื่อนไข "ไฟล์ใหม่ทั้งใบ" เสมอ ไม่ว่าจะ stage แล้วหรือยัง
 *  deleted = ` D`/`D ` (ลบรายงานหุ้นเพิกถอน) — ไม่มีไฟล์ให้อ่าน footer และไม่ใช่ pre-patch ราคา ⇒ คัดออกทุกทาง */
function parsePorcelain(text) {
  return String(text).split('\n').filter(Boolean).map((line) => {
    const status = line.slice(0, 2);
    let p = line.slice(3).trim();
    if (p.includes(' -> ')) p = p.split(' -> ').pop().trim();
    return { path: p, isNew: /[A?]/.test(status), deleted: status.includes('D') };
  });
}

/** แยกไฟล์ที่ลบออกจากตัวเลือกของ `ship --prepatch` (ส่วนบริสุทธิ์)
 *  ไฟล์ที่ลบต้องไม่เข้า prepatchBlockers (อ่าน footer ไม่ได้ → ขึ้น unreadable ปลอม), ไม่เข้า changed, ไม่เข้า git add
 *  — DELIST เป็น commit คนละใบ (ต้องมี tags.json --prune ไปด้วย) */
function prepatchCandidates(entries) {
  const candidates = [], deleted = [];
  for (const e of entries) (e.deleted ? deleted : candidates).push(e);
  return { candidates, deleted };
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
  const { candidates, deleted } = prepatchCandidates(porcelain);
  const delNote = () => {
    const syms = deleted.map((e) => (/^reports\/(.+)\.html$/.exec(e.path) || [, e.path])[1]).join(' ');
    console.log(`ℹ ไฟล์ที่ลบ (DELIST) ไม่รวมใน pre-patch commit — commit แยก: git add -- ${deleted.map((e) => e.path).join(' ')} tags.json && git commit -m "chore: ลบ ${syms} (เพิกถอน)"`);
  };
  if (!candidates.length) { delNote(); console.log('ไม่มีไฟล์ pre-patch ที่ต้อง ship (เหลือแต่ไฟล์ที่ลบ)'); return; }
  const changed = candidates.map((e) => e.path);
  const entries = candidates.map((e) => {
    const untracked = e.isNew;
    const head = untracked ? null : run('git', ['show', `HEAD:${e.path}`]);
    const headFooterISO = head && head.code === 0 ? ((footerDate(head.out) || {}).iso || null) : null;
    const fp = path.join(ROOT, e.path);
    const workFooterISO = fs.existsSync(fp) ? ((footerDate(fs.readFileSync(fp, 'utf8')) || {}).iso || null) : null;
    return { path: e.path, untracked, headFooterISO, workFooterISO };
  });
  const { blocked, unreadable } = prepatchBlockers(entries);
  if (deleted.length) delNote();   // พิมพ์ก่อน throw — รอบที่ถูกบล็อกก็ยังต้องรู้ว่ามีไฟล์ที่ลบรออยู่
  if (blocked.length) throw new Error(blocked.map((sym) => `ship --prepatch: ${sym} ถูกวิเคราะห์ใหม่แล้ว (footer ขยับ/ไฟล์ใหม่) — ใช้ npm run queue -- ship ${sym} แทน`).join('\n'));
  if (unreadable.length) console.log('⚠ อ่าน footer ไม่ได้ทั้ง HEAD และ working tree — ตรวจเองว่าไม่ใช่งาน worker: ' + unreadable.join(' '));
  must('npm', ['run', 'build'], 'build');
  keepDates();
  verify();
  // ระบุไฟล์ทีละใบ ไม่ `git add -- reports` — ไม่งั้นการลบรายงานหุ้นเพิกถอนถูกกวาดเข้า commit "price: …" ทั้งที่ต้องไปคู่กับ tag-apply --prune
  const addFiles = [...changed, 'reports.json', 'price-flags.json'].filter((f) => fs.existsSync(path.join(ROOT, f)));
  must('git', ['add', '--', ...addFiles], 'git add');
  must('git', commitArgs(`price: pre-patch ${changed.length} symbols (manual queue run ${todayBangkok()})\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, addFiles), 'git commit');
  pushWithRebase();
  const today = todayBangkok();
  for (const p of changed) {
    const m = /^reports\/(.+)\.html$/.exec(p);
    if (m) S.update(m[1], { prepatchShippedAt: today });
  }
  console.log(`✅ pre-patch ${changed.length} ใบ push แล้ว (วันที่วิเคราะห์คงเดิมผ่าน preserve-dates)`);
  // ปกติไม่ปิด issue ที่นี่ (pre-patch ล้าง flag ทั้งที่ยังไม่ได้วิเคราะห์ — snapshot semantics · issue ปิดเมื่อ ship <SYM> ตัวสุดท้าย)
  // แต่รอบที่มีแต่ PREPATCH (flip ในย่าน — ระยะ 1 ข้อ D) ไม่มี `ship <SYM>` ตามมาเลย ⇒ ต้องปิดตรงนี้ ไม่งั้น issue ค้างเปิดทั้งที่คิวว่าง
  closeIssueIfNoLlmRows(S.load().stocks);
}

/** ยังมีแถวที่ต้องส่ง LLM ค้างอยู่ไหม (LIGHT/FULL ที่ไม่ skip และยังไม่ ship) — ไม่มี = `ship --prepatch` ปิด issue เอง
 *  ★ แยกเป็นฟังก์ชันที่รับตัวปิดเป็น argument เพื่อให้ queue-test ยิงได้จริง: `shipPrepatch()` เต็มใบรันในเทสไม่ได้
 *    (มันเรียก npm run build / preserve-dates / npm run verify / git push) · คืน true = สั่งปิดแล้ว
 *  ★ (C1 · carried จาก Task 13 review) PREPATCH ที่ prePatchRejected (pre-patch แล้ว gate ตก — ยังต้องแก้ไฟล์ให้ผ่านเอง)
 *    ก็นับเป็นงานค้างเหมือนกัน — ห้ามปิด issue ทั้งที่แถวนี้ยังรอคนแก้ (คลาสเดียวกับ REJECTED ของ cron) */
function closeIssueIfNoLlmRows(stocks, close) {
  const pending = Object.values(stocks || {}).filter((r) =>
    (!r.skip && ['LIGHT', 'FULL'].includes(r.bucket) && !r.shippedAt) || (r.bucket === 'PREPATCH' && r.prePatchRejected));
  if (pending.length) { console.log(`ยังเหลือ ${pending.length} ตัวที่ต้องส่ง LLM — issue คงเปิด (ปิดตอน ship <SYM> ตัวสุดท้าย)`); return false; }
  (close || closeIssueIfEmpty)();
  return true;
}

/** X/Y ตาม memory feedback-progress-counter: push แล้ว / รอ push / ยังไม่เริ่ม
 *  ★ bucket ต้องไม่ซ้อนกัน — idle/other แบ่งกันตาม (skip || bucket ไม่ใช่ LIGHT/FULL) ภายใต้เงื่อนไขเดียวกันทุกตัว
 *    (เดิม `other` ไม่เช็ค !postcheck/!prepAt ⇒ แถวที่มี postcheck:'review' แต่ไม่มี bucket ขึ้นซ้ำทั้ง review และ other)
 *  ★ PREPATCH (flip ในย่าน — ระยะ 1 ข้อ D) มีบรรทัดของตัวเอง: ไม่ใช่ "ยังไม่เริ่ม" (ไม่มี worker ให้รอ) และไม่ใช่ "ไม่ใช้ agent/ข้าม"
 *    (มันมีงานจริงคือ pre-patch + ship --prepatch) · ยกเว้นใบที่ gate ตกหลัง pre-patch — อันนั้นต้องคงป้ายเหตุผลไว้ที่ "ไม่ใช้ agent/ข้าม" */
function status() {
  const s = S.load();
  const rows = Object.entries(s.stocks);
  const pushed = rows.filter(([, r]) => r.shippedAt).map(([k]) => k);
  const waiting = rows.filter(([, r]) => !r.shippedAt && r.postcheck === 'pass').map(([k]) => k);
  const review = rows.filter(([, r]) => !r.shippedAt && r.postcheck === 'review').map(([k]) => k);
  const prepped = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && r.prepAt).map(([k]) => k);
  const idle = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && !r.prepAt && !r.skip && !r.prePatchRejected && ['LIGHT', 'FULL'].includes(r.bucket)).map(([k]) => k);
  // prePatchRejected = pre-patch แล้ว gate ตก คืนไฟล์ไปแล้ว ⇒ ต้องแก้ใบเอง ไม่ใช่ "ยังไม่เริ่ม" ที่รอ spawn worker (re-review)
  const prepatchOnlyRow = (r) => r.bucket === 'PREPATCH' && !r.prePatchRejected;
  const prepatchOnly = rows.filter(([, r]) => prepatchOnlyRow(r));
  const other = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && !r.prepAt && !prepatchOnlyRow(r) && (r.skip || r.prePatchRejected || !['LIGHT', 'FULL'].includes(r.bucket))).map(([k, r]) => `${k}[${r.prePatchRejected ? 'gate ตกหลัง pre-patch' : r.skip ? 'สด' : (r.bucket || '-')}]`);
  const prepatchShipped = rows.filter(([, r]) => r.prepatchShippedAt).map(([k]) => k);
  const prepatchDone = prepatchOnly.filter(([, r]) => r.prepatchShippedAt && !r.shippedAt).length;   // PREPATCH ที่ push แล้ว = เสร็จเหมือนกัน (`!shippedAt` กันนับซ้ำกับ pushed)
  console.log(`รอบเริ่ม ${s.startedAt || '-'} · ${pushed.length + prepatchDone}/${rows.length}`);
  console.log(`push แล้ว ${pushed.length}: ${pushed.join(' ') || '-'}`);
  console.log(`รอ push ${waiting.length}: ${waiting.join(' ') || '-'}`);
  console.log(`postcheck ต้องดู ${review.length}: ${review.join(' ') || '-'}`);
  console.log(`prep แล้วรอ worker ${prepped.length}: ${prepped.join(' ') || '-'}`);
  console.log(`ยังไม่เริ่ม ${idle.length}: ${idle.join(' ') || '-'}`);
  console.log(`ไม่ใช้ agent/ข้าม ${other.length}: ${other.join(' ') || '-'}`);
  console.log(`pre-patch อย่างเดียว (ไม่ส่ง LLM) ${prepatchOnly.length}: ${prepatchOnly.map(([k, r]) => k + (r.prepatchShippedAt ? '✓' : '')).join(' ') || '-'}`);
  console.log(`pre-patch push แล้ว ${prepatchShipped.length}: ${prepatchShipped.join(' ') || '-'}`);
}

module.exports = { shipStock, shipPrepatch, status, commitMessage, commitArgs, trailer, closeIssueIfEmpty, closeIssueIfNoLlmRows, prepatchBlockers, prepatchCandidates, parsePorcelain, pendingCommitFor, STOCK_FILES, TITLE };
