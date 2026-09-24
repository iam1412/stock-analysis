'use strict';
/**
 * ship — ขั้น D1–D4 + ปิด issue + build/preserve-dates สำหรับ pre-patch ล้วน (docs-audit §5: preserve-dates อยู่แค่ใน cron)
 *   ship <SYM>: tag-apply (ถ้ามี) → verify → preserve-dates+build (กัน `updated` ของใบที่แค่ pre-patch เด้ง) → add ไฟล์ที่ระบุ
 *               → commit 1 หุ้น (CLAUDE.md §5) → pull --rebase → push HEAD:main → ปิด issue ถ้าคิวว่าง
 *   ship --prepatch: รันทันทีหลัง preflight (ก่อน worker เริ่ม — ดู note ข้าง prepatchBlockers) → build → preserve-dates
 *               → build → verify → commit "price: …" → push · กันตัวที่ worker วิเคราะห์ใหม่แล้วโดนกวาดไปด้วย
 *               · รอบที่มีแต่ PREPATCH (flip ในย่าน — ระยะ 1 ข้อ D) ปิด issue ตรงนี้ด้วย เพราะไม่มี `ship <SYM>` ตามมา
 * ★ ไม่ทำแทน: ตัดสิน publish/skip (postcheck ต้อง pass หรือ --force หลังรีวิวเอง)
 * ★ โมเดลของ trailer มาจาก **ป้าย `<meta ai-model>` ในใบ** (รุ่นที่ worker รันจริง) — `state.model`/`--model` เป็นแค่ตัวสำรอง
 *   และเป็นตัวที่ทำ trailer ผิดมาแล้ว (บั๊ก 20 ก.ย. 69 — ดู resolveTrailer)
 * ★ "push แล้วหรือยัง" ก็ถามจาก git เช่นกัน (`reconcile`) ไม่ใช่จำว่า "ฉัน push เอง" — ตัวสุดท้ายของกอง push ให้ทั้งกอง
 */
const fs = require('fs');
const path = require('path');
const { run, must, ROOT } = require('./sh.js');
const S = require('./state.js');
const { todayBangkok, footerDate } = require('./footer-date.js');
const { parseAiModel } = require('../report-meta.js');
const RS = require('../report-source.js');   // ใบ v2 (.html) + ใบ v3 (.json) — "ไฟล์ไหนคือรายงาน" จุดเดียว (Plan 2b)

const FLAGS = path.join(ROOT, 'price-flags.json');
const TITLE = 'Price-refresh flags — หุ้นรอ re-analysis';   // ต้องตรงกับ update-prices.yml / dead-ticker-canary.yml
const MODEL_NAME = { sonnet: 'Sonnet 5', opus: 'Opus 5' };
// ใบ v3 = reports/<SYM>.json (Plan 2b) — caller กรองเฉพาะไฟล์ที่มีจริงก่อน git add เสมอ
const STOCK_FILES = (sym) => [`reports/${sym}.html`, `reports/${sym}.json`, 'tags.json', 'tools/seeds.json', 'price-flags.json', 'reports.json'];

const trailer = (model) => { const n = MODEL_NAME[model]; if (!n) throw new Error(`โมเดล "${model}" ไม่รู้จัก — ป้าย Co-Authored-By ต้องตรงกับที่รันจริง (sonnet|opus)`); return `Co-Authored-By: Claude ${n} <noreply@anthropic.com>`; };
/** โมเดลของรอบนี้ (--model ชนะ state) — ★ ต้องเช็ค **ก่อน** verify/keepDates: เดิม trailer() ระเบิดตอนจะ commit
 *  คือหลัง npm run verify (นาที ๆ) + preserve-dates + build ⇒ ผู้ใช้เสียเวลาฟรีแล้วค่อยรู้ว่า state ไม่มี model
 *  (state หายได้จริง: .queue อยู่ที่ checkout หลัก ถ้า prep คนละเครื่อง/ถูกล้าง ก็ไม่มี record — C1 รีวิว Task 15/16) */
function resolveModel(sym, rec, override) {
  const m = override || (rec && rec.model);
  if (!m) throw new Error(`${sym}: ไม่มี model ใน state — รัน npm run queue -- prep ${sym} ก่อน หรือใส่ --model sonnet|opus`);
  if (!MODEL_NAME[m]) throw new Error(`${sym}: โมเดล "${m}" ไม่รู้จัก (ใช้ sonnet|opus)`);
  return m;
}
/** โมเดล + ข้อความ trailer ที่จะใช้ commit (ส่วนบริสุทธิ์ — รับสตริง ai-model มาตรง ๆ ให้เทสยิงได้)
 *  ★ ความจริงอยู่ที่ **ใบ**: `<meta ai-model>` คือรุ่นที่ worker รันจริงแล้วประทับเอง · `state.model` เป็นแค่ **แผน** ของ prep
 *    (`--model || (หุ้นยาก ? opus : sonnet)`) ที่ไม่มีใครเขียนทับเมื่อ controller เปลี่ยนใจตอน spawn
 *    ⇒ รอบ 20 ก.ย. 69: GNRC (แผน sonnet · รัน opus) ได้ trailer "Sonnet 5" · SSP (แผน opus · รัน sonnet) ได้ "Opus 5"
 *      — ไม่ใช่การหยิบ record สลับกัน แต่เป็นสองความคลาดเคลื่อนคนละใบที่บังเอิญสลับกันพอดี
 *  ลำดับความจริง: ใบ > --model > state.model
 *  ★ `--model` ที่ขัดกับใบ = **ล้ม** ไม่เดาให้ (เดา = ทำบั๊กเดิมซ้ำ) · state ที่ขัดกับใบ = เตือนแล้วใช้ตามใบ
 *  ★ ข้อความ trailer ลอกจากใบตรงตัว ไม่ใช่ MODEL_NAME[key] — ใบที่ประทับ "Claude Opus 4.8" ต้องไม่ได้ trailer "Opus 5" */
function resolveTrailer(sym, aiModel, rec, override) {
  const file = parseAiModel(aiModel);
  if (aiModel && !file) throw new Error(`${sym}: ป้าย ai-model ในใบ ("${aiModel}") อ่านไม่ออก — ต้องเป็นรูป "Claude <ตระกูล> <เวอร์ชัน>" (E28) แก้ใบก่อน`);
  if (!file) {   // ไม่มีป้ายในใบเลย (ไฟล์หาย/ยังไม่เขียน) — ทางเดิม: state/--model · gate จะฟ้อง E28 ต่อเองอยู่แล้ว
    const key = resolveModel(sym, rec, override);
    return { key, trailer: trailer(key), warn: null, source: override ? 'flag' : 'state' };
  }
  if (!MODEL_NAME[file.key]) throw new Error(`${sym}: ใบประทับ ai-model "${file.text}" — นอกกติกา §3.2 (Sonnet/Opus เท่านั้น) ตรวจว่า worker รันด้วยรุ่นอะไรจริงก่อน push`);
  if (override && override !== file.key) throw new Error(`${sym}: --model ${override} ขัดกับป้ายในใบ "${file.text}" — ใบคือรุ่นที่รันจริง (worker ประทับเอง) · ถ้าป้ายในใบผิดให้แก้ใบ ไม่ใช่ push ด้วยป้ายที่ขัดกัน`);
  const warn = rec && rec.model && rec.model !== file.key
    ? `${sym}: state บอกโมเดล "${rec.model}" (แผนของ prep) แต่ใบประทับ "${file.text}" — ใช้ตามใบ แล้วอัปเดต state ให้`
    : null;
  return { key: file.key, trailer: `Co-Authored-By: ${file.text} <noreply@anthropic.com>`, warn, source: 'report' };
}
/** ป้าย ai-model ของใบ (ไม่มีไฟล์ = null — ให้ resolveTrailer ตกไปทางเดิม) · v2 = <meta ai-model> · v3 = meta.aiModel */
function reportAiModel(sym, dir) {
  const m = RS.metaLite(sym, dir || path.join(ROOT, 'reports'));
  return m ? m.aiModel : null;
}

function commitMessage(sym, rec, sm) {
  const mode = (rec && rec.mode) || 'UPDATE';
  // v2 stock-meta.mos เก็บ ≤1 ตำแหน่ง · v3 compute().sm.mos เต็มความละเอียด → ปัด 1 ตำแหน่งให้หัวข้อ commit เหมือนกันทั้งสองรุ่น
  const m1 = sm && Number.isFinite(sm.mos) ? Math.round(sm.mos * 10) / 10 : null;
  const mos = m1 != null ? ` (MOS ${m1 < 0 ? '−' : '+'}${Math.abs(m1)}%)` : '';
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
/** แถวนี้ "ขึ้น origin/main แล้ว" ไหม — ส่วนบริสุทธิ์ (รับผลลัพธ์ git มาเป็น argument)
 *  ★ sha อย่างเดียวไม่พอ: `ship` ใบถัดไปทำ `pull --rebase` = เขียน commit ใหม่ทั้ง stack (cron push ราคาทุกวัน ⇒ เกิดจริง)
 *    ⇒ sha ที่บันทึกไว้จะไม่เป็น ancestor ของ origin/main ทั้งที่งานขึ้นไปแล้ว → ตกลงมาเทียบ **subject ตรงตัวอักษร**
 *  ★ เทียบ subject เป๊ะ ๆ ไม่ใช่รูป `analyze: …` เพราะ `--message` ของผู้ใช้เขียนหัวข้อเป็นอะไรก็ได้ */
function landedOnOrigin({ ancestor, originSubjects, subject }) {
  if (ancestor) return true;
  if (!subject) return false;
  const want = String(subject).trim();
  return String(originSubjects || '').split('\n').some((l) => l.trim() === want);
}
/** เฟสของงานหุ้นตัวนี้ในสายตา git (ส่วนบริสุทธิ์) — 'pushed' | 'unpushed' | 'unknown'
 *  g = { ancestor, originSubjects, unpushed } ที่ caller ดึงมาให้ (`gitPhaseInputs`)
 *  ★ แถวเก่าที่ไม่มี `committedSubject` (state ก่อนแก้บั๊ก / ถูกล้าง) ยังกู้ได้ด้วยรูป commit มาตรฐาน
 *    `analyze: add|update <SYM>` — ปลอดภัยเพราะ caller จำกัด `--since` ไว้ที่วันของรอบนี้แล้ว */
function shipPhaseOf(sym, rec, g) {
  const subject = rec && rec.committedSubject;
  const inp = g || {};
  if (landedOnOrigin({ ancestor: inp.ancestor, originSubjects: inp.originSubjects, subject })) return 'pushed';
  // ★ ขาสำรองนี้หลวม (รูป commit มาตรฐาน ไม่ใช่ subject เป๊ะ) ⇒ ต้องมี **หลักฐานว่ารอบนี้ทำงานจริง** (`postcheck`) กำกับ
  //   ไม่งั้น `ship <SYM>` บนแถวว่าง (state หาย — ทางที่ C1 ออกแบบไว้ให้ใช้ `--model`) จะไปเจอ commit ของการวิเคราะห์
  //   ครั้งก่อนบน origin แล้วตอบ "ขึ้นไปแล้ว" ทั้งที่ worker ยังไม่ได้เขียนไฟล์ = ชี้ผิดทางแบบกลับด้านของบั๊กเดิม
  //   (`--since` ของ caller เป็นราย **วัน**: re-flag วันเดียวกันหลัง ship อาจชนกับ commit ก่อนหน้าได้ในทางทฤษฎี —
  //    ไม่เกิดจริงกับ cron 04:00 น. และแถวใหม่ทุกแถวมี committedSubject ซึ่งมี MOS อยู่ในหัวข้อแล้ว)
  if (!subject && rec && rec.postcheck && pendingCommitFor(sym, inp.originSubjects)) return 'pushed';
  if (landedOnOrigin({ ancestor: false, originSubjects: inp.unpushed, subject })) return 'unpushed';
  if (pendingCommitFor(sym, inp.unpushed)) return 'unpushed';
  return 'unknown';
}
/** log ของ origin/main ที่จำกัดขอบเขตด้วยวันของรอบ (เวลาไทย — CLAUDE.md §7) */
function originSubjectsSince(since) {
  // ★ ไม่มีวันที่ของรอบ = ไม่สแกน origin เลย (คืน '') — สแกนแบบไม่จำกัดขอบเขตคือทางที่ทำให้ commit ของการวิเคราะห์
  //   ครั้งก่อนถูกนับเป็นงานของรอบนี้ · แถวที่มี committedSha ยังตรวจด้วย ancestor ได้อยู่แล้วโดยไม่ต้องใช้ log
  if (!since) return '';
  const r = run('git', ['log', 'origin/main', '--format=%s', `--since=${since}T00:00:00+07:00`]);
  return r.code === 0 ? r.out : '';
}
/** ★ ไม่ `git fetch`: origin/main ในเครื่องอาจเก่ากว่าจริง ⇒ ตอบ "ยังไม่ขึ้น" ได้ — เป็น false negative ฝั่งปลอดภัย
 *  (แค่ยังไม่ปรับสถานะรอบนี้ ไม่ใช่ประทับว่า push แล้วทั้งที่ยังไม่ push) */
function gitPhaseInputs(rec) {
  const r = rec || {};
  const sha = r.committedSha;
  const since = r.committedAt || r.postcheckAt || r.prepAt || r.flaggedAt || null;
  const ancestor = !!sha && run('git', ['merge-base', '--is-ancestor', sha, 'origin/main']).code === 0;
  return { ancestor, originSubjects: ancestor ? '' : originSubjectsSince(since), unpushed: unpushedSubjects() };
}
/** แถวไหนควรถูกประทับ `shippedAt` (ส่วนบริสุทธิ์ — `phaseOf` เป็น callback ที่ถาม git)
 *  เงื่อนไข: ยังไม่มี shippedAt · มีร่องรอยว่างานถูกทำจริง (committed* หรือ postcheck) · git ยืนยันว่าอยู่บน origin แล้ว */
function rowsToHeal(stocks, phaseOf) {
  return Object.entries(stocks || {})
    .filter(([, r]) => r && !r.shippedAt && (r.committedSha || r.committedSubject || r.postcheck))
    .filter(([sym, r]) => phaseOf(sym, r) === 'pushed')
    .map(([sym]) => sym);
}
/** ปรับสถานะให้ตรงความจริงของ git — **ทั้งกอง** ไม่ใช่เฉพาะ sym ที่เพิ่ง ship
 *  (บั๊ก 20 ก.ย. 69: tree มีหลายใบค้าง ⇒ ship ใบแรก ๆ commit ได้แต่ pull --rebase ล้ม ⇒ ไม่เคยบันทึก shippedAt
 *   พอใบสุดท้าย tree สะอาดแล้ว push มันพาทั้งกองขึ้นไป แต่สมุดบัญชียังค้าง "รอ push" ถาวร) */
function reconcile() {
  const st = S.load();
  const healed = rowsToHeal(st.stocks, (sym, rec) => shipPhaseOf(sym, rec, gitPhaseInputs(rec)));
  if (!healed.length) return [];
  const today = todayBangkok();
  for (const sym of healed) st.stocks[sym].shippedAt = st.stocks[sym].committedAt || today;
  S.save(st);
  return healed;
}
/** ไฟล์ tracked ที่ยังค้างใน working tree — `git pull --rebase` ล้มทันทีถ้ามี ("cannot pull with rebase") */
function dirtyTracked() {
  return parsePorcelain(run('git', ['status', '--porcelain', '--untracked-files=no']).out).map((e) => e.path);
}
/** --no-push (Plan 2c-i · flow branch → PR): ship เหลือแค่ commit — ไม่ pull --rebase · ไม่ push · ไม่ปิด issue
 *  ส่วนบริสุทธิ์ = ตัดสินจาก options อย่างเดียว ไม่ดู git · default (ไม่ส่ง noPush) = push ตามเดิม (v2 ไม่เปลี่ยน) */
function shouldPush(o) { return !(o && o.noPush); }
const NO_PUSH_NOTE = 'ℹ --no-push: commit แล้ว ยังไม่ rebase/push (branch → PR → advisor) — push เองภายหลังด้วย git push origin HEAD:<branch>';
/** push ถ้า tree สะอาด · ไม่สะอาด = **เลื่อน** ไม่ใช่ error — worker หลายตัวเขียนเสร็จพร้อมกันคือโหมดปกติ (CLAUDE.md §3.3
 *  verify/push รายแบตช์) · commit อยู่ในเครื่องแล้วและ state จำ committedSha ไว้แล้ว ⇒ ใบถัดไปที่ tree สะอาดพาขึ้นไปเอง
 *  คืน true = push แล้ว · false = เลื่อน */
function pushIfClean(sym) {
  const dirty = dirtyTracked();
  if (!dirty.length) { pushOrExplain(sym); return true; }
  console.log(`ℹ commit ของ ${sym} เรียบร้อยแล้ว แต่ยัง **ไม่ push** — tree ยังมีไฟล์ค้าง ${dirty.length} รายการ: ${dirty.slice(0, 8).join(' ')}${dirty.length > 8 ? ' …' : ''}`);
  console.log('  (git pull --rebase ล้มทันทีเมื่อ tree ไม่สะอาด — ไม่ใช่ของเสีย)');
  console.log(`  ⇒ commit นี้จะขึ้น origin พร้อม ship ใบถัดไปที่ tree สะอาด · หรือเคลียร์ไฟล์ค้างแล้วรัน npm run queue -- ship ${sym} ซ้ำ (จะข้าม commit ไป push อย่างเดียว)`);
  return false;
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

/** open-item #27: guard postcheck ของ shipStock เดิมดู `rec.postcheck === 'pass'` เฉยๆ ไม่ผูกกับขอบเขตรอบ (roundStart)
 *  ⇒ postcheck ที่ผ่านไปตั้งแต่รอบก่อน (แถวยังไม่ทันถูก ship ตอนนั้น แล้วรอบใหม่มาเปิด startedAt ทับไปโดยแถวนี้ยัง
 *  ไม่ถูกแตะ) จะยังพา `ship <SYM>` commit ได้ทันทีโดยไม่ต้องสั่ง postcheck ใหม่ — ทั้งที่ตัว state ก็มีกลไก `S.inRound`
 *  อยู่แล้ว (ใช้ใน status()/closeIssueIfNoLlmRows()) แต่ shipStock ไม่เคยเรียก
 *  คืน `null` = ผ่าน · string = เหตุผลที่ปฏิเสธ (แยกเป็นฟังก์ชันบริสุทธิ์ให้เทสยิงได้โดยไม่ต้องพึ่ง S.load()/git จริง) */
function postcheckGuard(sym, rec, startedAt) {
  if (rec.postcheck !== 'pass') return `${sym}: postcheck ยังไม่ผ่าน (${rec.postcheck || 'ยังไม่รัน'}) — รัน npm run queue -- postcheck ${sym} ก่อน หรือ --force ถ้ารีวิวเองแล้ว`;
  // สองทางที่นับว่า "เป็นของรอบนี้": flag เพิ่งเข้ามาในรอบนี้ (S.inRound) หรือ postcheck ถูกสั่งในรอบนี้ (postcheckAt)
  // ต้องมีขาที่สองเพราะ postcheck ไม่เคยแตะ flaggedAt — แถวที่ flag เก่าแต่เพิ่ง postcheck วันนี้ (พบบ่อยหลัง #26 ที่แถว
  // อายุสังเคราะห์คง flaggedAt เดิมไว้ ⇒ หลุดรอบถาวรเมื่อ flag จริงเปิดรอบใหม่) จะแก้ตามข้อความไม่ได้เลย เหลือแค่ --force (รีวิว Task 10 F1)
  const freshPostcheck = !!(rec.postcheckAt && startedAt && rec.postcheckAt >= startedAt);
  if (!S.inRound(rec, startedAt) && !freshPostcheck) return `${sym}: postcheck ผ่านแล้วแต่ค้างจากรอบก่อน (flaggedAt ${rec.flaggedAt || '?'} · postcheckAt ${rec.postcheckAt || '?'} เก่ากว่าที่รอบนี้เริ่ม ${startedAt}) — ยังไม่นับเป็น postcheck ของรอบนี้ รัน npm run queue -- postcheck ${sym} ใหม่ หรือ --force ถ้ารีวิวเองแล้ว`;
  return null;
}

function shipStock(sym, opts) {
  const o = opts || {};
  const st = S.load();
  const rec = st.stocks[sym] || {};

  // 0) งานนี้ขึ้น origin ไปแล้วและไม่มีอะไรใหม่ในใบ ⇒ เหลือแค่ "บันทึกความจริง" — ห้ามเสีย npm run verify (นาที ๆ) ฟรี
  //    และต้องไม่ติด postcheckGuard/--force ด้วย เพราะประตูนั้นเป็นประตูของการ *เผยแพร่* ไม่ใช่ของการแก้สมุดบัญชี
  //    (ใบที่ ship ด้วย --force ไปแล้วจะมี postcheck:'review' ค้าง — ต้อง heal ได้โดยไม่ต้อง --force ซ้ำ)
  const reportDirty = !!run('git', ['status', '--porcelain', '--', `reports/${sym}.html`, `reports/${sym}.json`]).out.trim();
  if (!o.tags && !o.message && !reportDirty && shipPhaseOf(sym, rec, gitPhaseInputs(rec)) === 'pushed') {
    const healed = reconcile();
    console.log(`✅ ${sym} อยู่บน origin/main แล้ว${rec.committedSha ? ` (${rec.committedSha.slice(0, 9)})` : ' (ยืนยันจาก git log)'} — ไม่มีอะไรต้อง commit`);
    console.log(healed.length ? `   ปรับสถานะให้ตรง git ${healed.length} ใบ: ${healed.join(' ')}` : '   สถานะตรงกับ git อยู่แล้ว');
    if (shouldPush(o)) closeIssueIfEmpty();   // --no-push = ไม่ปิด issue ทุกทาง
    return;
  }

  const guardErr = postcheckGuard(sym, rec, st.startedAt);
  if (guardErr && !o.force) throw new Error(guardErr);
  // โมเดล/trailer ต้องตัดสินก่อน verify/keepDates เสมอ — ล้มตรงนี้ราคาถูกที่สุด (C1)
  const tr = resolveTrailer(sym, reportAiModel(sym), rec, o.model);
  if (tr.warn) console.log('⚠ ' + tr.warn);
  if (o.tags) must('node', ['tools/tag-apply.js', sym, ...o.tags.split(/\s+/).filter(Boolean)], 'tag-apply');
  verify();
  keepDates();
  const files = STOCK_FILES(sym).filter((f) => fs.existsSync(path.join(ROOT, f)));
  must('git', ['add', '--', ...files], 'git add');
  if (run('git', ['diff', '--cached', '--quiet']).code === 0) {
    // stage ว่างมีสามสาเหตุ แยกให้ออก (เดิมรวบเป็น "worker ยังไม่ได้เขียนไฟล์" ทางเดียว = ชี้ผิดทาง):
    //   pushed  = commit ไปแล้วและขึ้น origin แล้ว (ใบอื่นของกองพาขึ้นไป) → แค่บันทึกสถานะ
    //   unpushed = commit ไปแล้วแต่ยังไม่ขึ้น origin → push ต่อ
    //   unknown  = ไม่พบ commit ที่ไหนเลย → worker ยังไม่ได้เขียนจริง ๆ (หรือ cwd-stray)
    const phase = shipPhaseOf(sym, rec, gitPhaseInputs(rec));
    if (phase === 'pushed') {
      const healed = reconcile();
      console.log(`✅ ${sym} อยู่บน origin/main แล้ว — ไม่มีอะไรต้อง commit${healed.length ? ` · ปรับสถานะ ${healed.length} ใบ: ${healed.join(' ')}` : ''}`);
      if (shouldPush(o)) closeIssueIfEmpty();
      return;
    }
    if (phase === 'unpushed') {
      if (!shouldPush(o)) { console.log(`ℹ commit ของ ${sym} มีอยู่แล้ว (ยังไม่ push)`); console.log(NO_PUSH_NOTE); return; }
      console.log(`ℹ commit ของ ${sym} มีอยู่แล้ว (ยังไม่ push) — push ต่อ`);
      if (!pushIfClean(sym)) return;
      S.update(sym, { shippedAt: todayBangkok() });
      const healed = reconcile();
      console.log(`✅ ${sym} push แล้ว (commit เดิม)${healed.length ? ` · พาใบที่ค้างขึ้นด้วย: ${healed.join(' ')}` : ''}`);
      closeIssueIfEmpty();
      return;
    }
    throw new Error(`${sym}: ไม่มีอะไรให้ commit และไม่พบ commit ของหุ้นนี้ทั้งในเครื่องและบน origin/main\n`
      + `  · worker ยังไม่ได้เขียน reports/${sym}.html หรือ reports/${sym}.json? (เช็ค cwd-stray — STEP 0)\n`
      + `  · หรือใบนี้ถูก push ไปนานแล้วนอกขอบเขตรอบนี้ — ตรวจด้วย: git log origin/main --oneline -- reports/${sym}.html reports/${sym}.json`);
  }
  const sm = RS.stockMeta(sym, path.join(ROOT, 'reports'));   // v2 = บล็อก stock-meta · v3 = compute().sm (MOS ของ commit message)
  const msg = o.message || commitMessage(sym, rec, sm);
  must('git', commitArgs(`${msg}\n\n${tr.trailer}`, files), 'git commit');
  // ★ บันทึกทันทีหลัง commit **ก่อน** push — push ล้ม/ถูกเลื่อน แล้วสมุดบัญชีต้องยังรู้ว่า commit นี้มีอยู่จริง
  //   (นี่คือหลักฐานที่ `reconcile()` ใช้ตามหาใบบน origin ภายหลัง แม้ rebase จะเขียน sha ใหม่ก็ยังเหลือ subject)
  S.update(sym, { committedSha: run('git', ['rev-parse', 'HEAD']).out.trim() || null, committedSubject: msg, committedAt: todayBangkok(), model: tr.key });
  if (!shouldPush(o)) { console.log(`✅ ${sym} commit แล้ว: ${msg}`); console.log(NO_PUSH_NOTE); return; }
  if (!pushIfClean(sym)) return;
  S.update(sym, { shippedAt: todayBangkok() });
  const healed = reconcile();
  console.log(`✅ ${sym} push แล้ว: ${msg}`);
  if (healed.length) console.log(`   push นี้พาใบที่ค้างขึ้น origin ด้วย ${healed.length}: ${healed.join(' ')}`);
  closeIssueIfEmpty();
}

/** ใบ v2 ที่ pre-patch ได้ = reports/<SYM>.html ระดับบนสุดเท่านั้น (ตัวพิมพ์ตรงตัว: .HTML · reports/sub/Y.html = ไม่ใช่)
 *  UNDER_REPORTS รับรูปที่ git quote มาด้วย (`"reports/…"`) — กันไว้อีกชั้นแม้ shipPrepatch ใช้ -z แล้ว */
const V2_REPORT_RE = /^reports\/([^/]+)\.html$/;
const UNDER_REPORTS = /^"?reports\//;
/** แกะ path ที่ git quote แบบ C string (`"reports/ZTS copy.json"` · `"\\303\\251"` = UTF-8 เป็นเลขฐานแปด) — ไม่มี quote = คืนเดิม */
function unquotePath(p) {
  if (!(p.length >= 2 && p[0] === '"' && p[p.length - 1] === '"')) return p;
  const cs = Array.from(p.slice(1, -1)), bytes = [];
  const ESC = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] !== '\\') { bytes.push(...Buffer.from(cs[i], 'utf8')); continue; }
    const n = cs[++i];
    if (/[0-7]/.test(n || '')) { bytes.push(parseInt(cs.slice(i, i + 3).join(''), 8)); i += 2; continue; }
    bytes.push(ESC[n] != null ? ESC[n] : Buffer.from(n || '', 'utf8')[0]);
  }
  return Buffer.from(bytes).toString('utf8');
}
const porcelainRow = (status, p, from) => ({ path: p, from: from || null, isNew: /[A?]/.test(status), deleted: status.includes('D') });
/** parse `git status --porcelain` (ส่วนบริสุทธิ์ — ไม่แตะ git) → [{ path, from, isNew, deleted }]
 *  rename/copy (`R  old -> new` / `RM …` / `C …`) ใช้ path ปลายทาง (หลัง ' -> ') · from = ต้นทาง (ไม่ใช่ rename = null)
 *  · path ที่ git quote (`"reports/ZTS copy.json"`) ถูกแกะก่อนคืน · isNew = untracked (`??`) หรือเพิ่งถูก `git add` (`A`)
 *  → เข้าเงื่อนไข "ไฟล์ใหม่ทั้งใบ" เสมอ ไม่ว่าจะ stage แล้วหรือยัง (rename ปลายทางก็ไม่มีใน HEAD — prepatchBlockers กันผ่าน `from`)
 *  deleted = ` D`/`D ` (ลบรายงานหุ้นเพิกถอน) — ไม่มีไฟล์ให้อ่าน footer และไม่ใช่ pre-patch ราคา ⇒ คัดออกทุกทาง */
function parsePorcelain(text) {
  return String(text).split('\n').filter(Boolean).map((line) => {
    const status = line.slice(0, 2);
    let p = line.slice(3).trim(), from = null;
    if (/[RC]/.test(status) && p.includes(' -> ')) { const parts = p.split(' -> '); p = parts.pop().trim(); from = unquotePath(parts.join(' -> ').trim()); }
    return porcelainRow(status, unquotePath(p), from);
  });
}
/** parse `git status --porcelain -z` (ส่วนบริสุทธิ์) — ไม่มี quote เลย · rename/copy = `XY ปลายทาง\0ต้นทาง\0` → รูปเดียวกับ parsePorcelain
 *  ★ ship --prepatch ใช้ตัวนี้ (fail closed): path มีช่องว่าง/อักษรพิเศษ git จะ quote ในโหมดข้อความ ⇒ regex ไม่เจอ ⇒ เคยหลุดเงียบ */
function parsePorcelainZ(text) {
  const tok = String(text).split('\0'), out = [];
  for (let i = 0; i < tok.length; i++) {
    const t = tok[i];
    if (!t) continue;
    const status = t.slice(0, 2);
    out.push(porcelainRow(status, t.slice(3), /[RC]/.test(status) ? tok[++i] || null : null));
  }
  return out;
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
 *  entries = [{ path, from?, untracked, headFooterISO, workFooterISO }] → คืน { blocked, unreadable, foreign } (ส่วนบริสุทธิ์ ไม่แตะ git)
 *  ★ อ่าน footer ได้ข้างเดียว (เช่น HEAD parse ไม่ออก) = สงสัย → กันไว้ก่อน · อ่านไม่ได้ทั้งสองข้าง = ไม่รู้จริง ๆ → ไม่กัน แต่ขึ้น unreadable ให้คนตรวจเอง
 *  ★ fail closed (spec §6.5 · Plan 2b): path ใต้ reports/ ที่ไม่ใช่ reports/<SYM>.html (ใบ v3 .json · rename .html→.json · ไฟล์อื่น)
 *    = foreign ⇒ ship --prepatch ปฏิเสธ — เดิม `continue` ข้ามไป ⇒ reports/X.json ที่ยังไม่รีวิวถูกกวาดเข้า commit "price: …"
 *    · รวม path ที่ git quote มา · ใต้โฟลเดอร์ย่อย (reports/sub/Y.html) · ตัวพิมพ์ .HTML · rename/copy: ต้นทาง/ปลายทางที่ไม่ใช่ใบ v2
 *      และ rename ที่ย้ายใบออกนอก reports/ (ปลายทางจะถูก git add เข้า commit "price: …")
 *  ★ rename/copy ที่ปลายทางเป็นใบ v2 = blocked (ปลายทางไม่มีใน HEAD = ไฟล์ใหม่ทั้งใบ ไม่ใช่ pre-patch ราคา) */
function prepatchBlockers(entries) {
  const blocked = [], unreadable = [], foreign = [];
  const under = (p) => typeof p === 'string' && UNDER_REPORTS.test(p);
  for (const e of entries) {
    const m = V2_REPORT_RE.exec(e.path);
    if (e.from != null) {
      for (const p of [e.from, e.path]) if (under(p) && !V2_REPORT_RE.test(p)) foreign.push(p);
      if (m) blocked.push(m[1]);
      else if (!under(e.path)) foreign.push(e.path);
      continue;
    }
    if (!m) { if (under(e.path)) foreign.push(e.path); continue; }
    const sym = m[1];
    if (e.untracked) { blocked.push(sym); continue; }   // ไฟล์ใหม่ทั้งใบ = worker เขียน ไม่ใช่ pre-patch ราคา
    const h = e.headFooterISO, w = e.workFooterISO;
    if (h == null && w == null) { unreadable.push(sym); continue; }
    if (h == null || w == null) { blocked.push(sym); continue; }   // อ่านได้ข้างเดียว = สงสัย
    if (h !== w) blocked.push(sym);   // footer ขยับ = วิเคราะห์ใหม่แล้ว
  }
  return { blocked, unreadable, foreign };
}

/** ข้อความที่ `ship --prepatch` throw (ส่วนบริสุทธิ์) — null = ไปต่อได้ */
function prepatchRefusal({ blocked, foreign }) {
  const L = [
    ...(foreign || []).map((p) => `ship --prepatch: ${p} ไม่ใช่ใบ v2 (.html) — pre-patch ราคาเป็นของใบ v2 เท่านั้น (v3 cron = Plan 3) · ใบ v3 ใช้ npm run queue -- ship <SYM> · ไฟล์อื่นใต้ reports/ ต้องย้ายออกก่อน`),
    ...(blocked || []).map((sym) => `ship --prepatch: ${sym} ถูกวิเคราะห์ใหม่แล้ว (footer ขยับ/ไฟล์ใหม่) — ใช้ npm run queue -- ship ${sym} แทน`),
  ];
  return L.length ? L.join('\n') : null;
}

function shipPrepatch() {
  // -z = ไม่มี quote (path มีช่องว่าง) · -uall = ไฟล์ในโฟลเดอร์ย่อยที่ยังไม่ track ขึ้นทีละไฟล์ (ไม่ยุบเป็น reports/sub/)
  const porcelain = parsePorcelainZ(run('git', ['status', '--porcelain', '-z', '--untracked-files=all', '--', 'reports']).out);
  if (!porcelain.length) { console.log('ไม่มีไฟล์ใน reports/ ที่เปลี่ยน — ไม่มีอะไรจะ ship'); return; }
  const { candidates, deleted } = prepatchCandidates(porcelain);
  const delNote = () => {
    const syms = deleted.map((e) => (/^reports\/([^/]+)\.(?:html|json)$/.exec(e.path) || [, e.path])[1]).join(' ');
    console.log(`ℹ ไฟล์ที่ลบ (DELIST) ไม่รวมใน pre-patch commit — commit แยก: git add -- ${deleted.map((e) => e.path).join(' ')} tags.json && git commit -m "chore: ลบ ${syms} (เพิกถอน)"`);
  };
  if (!candidates.length) { delNote(); console.log('ไม่มีไฟล์ pre-patch ที่ต้อง ship (เหลือแต่ไฟล์ที่ลบ)'); return; }
  const changed = candidates.map((e) => e.path);
  const entries = candidates.map((e) => {
    const untracked = e.isNew || e.from != null;   // rename/copy: ปลายทางไม่มีใน HEAD
    const head = untracked ? null : run('git', ['show', `HEAD:${e.path}`]);
    const headFooterISO = head && head.code === 0 ? ((footerDate(head.out) || {}).iso || null) : null;
    const fp = path.join(ROOT, e.path);
    const workFooterISO = fs.existsSync(fp) ? ((footerDate(fs.readFileSync(fp, 'utf8')) || {}).iso || null) : null;
    return { path: e.path, from: e.from, untracked, headFooterISO, workFooterISO };
  });
  const pb = prepatchBlockers(entries);
  const { unreadable } = pb;
  if (deleted.length) delNote();   // พิมพ์ก่อน throw — รอบที่ถูกบล็อกก็ยังต้องรู้ว่ามีไฟล์ที่ลบรออยู่
  const refusal = prepatchRefusal(pb);
  if (refusal) throw new Error(refusal);
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
    const m = V2_REPORT_RE.exec(p);
    if (m) S.update(m[1], { prepatchShippedAt: today });
  }
  console.log(`✅ pre-patch ${changed.length} ใบ push แล้ว (วันที่วิเคราะห์คงเดิมผ่าน preserve-dates)`);
  // ปกติไม่ปิด issue ที่นี่ (pre-patch ล้าง flag ทั้งที่ยังไม่ได้วิเคราะห์ — snapshot semantics · issue ปิดเมื่อ ship <SYM> ตัวสุดท้าย)
  // แต่รอบที่มีแต่ PREPATCH (flip ในย่าน — ระยะ 1 ข้อ D) ไม่มี `ship <SYM>` ตามมาเลย ⇒ ต้องปิดตรงนี้ ไม่งั้น issue ค้างเปิดทั้งที่คิวว่าง
  const st = S.load();
  closeIssueIfNoLlmRows(st.stocks, null, st.startedAt);
}

/** ยังมีแถวที่ต้องส่ง LLM ค้างอยู่ไหม (LIGHT/FULL ที่ไม่ skip และยังไม่ ship) — ไม่มี = `ship --prepatch` ปิด issue เอง
 *  ★ แยกเป็นฟังก์ชันที่รับตัวปิดเป็น argument เพื่อให้ queue-test ยิงได้จริง: `shipPrepatch()` เต็มใบรันในเทสไม่ได้
 *    (มันเรียก npm run build / preserve-dates / npm run verify / git push) · คืน true = สั่งปิดแล้ว
 *  ★ (C1 · carried จาก Task 13 review) PREPATCH ที่ prePatchRejected (pre-patch แล้ว gate ตก — ยังต้องแก้ไฟล์ให้ผ่านเอง)
 *    ก็นับเป็นงานค้างเหมือนกัน — ห้ามปิด issue ทั้งที่แถวนี้ยังรอคนแก้ (คลาสเดียวกับ REJECTED ของ cron)
 *  ★ (Task 21) นับเฉพาะแถว**ของรอบนี้** (`S.inRound` · `startedAt` จาก state) — state อยู่ข้ามรอบแล้ว (Task 15)
 *    แถวที่ผู้ใช้ข้ามไปตั้งแต่รอบก่อนจึงจะค้างเปิด issue ตลอดกาลถ้าไม่กรอง · ไม่ส่ง `startedAt` = นับทุกแถว (ของเดิม) */
function closeIssueIfNoLlmRows(stocks, close, startedAt) {
  const pending = Object.values(stocks || {}).filter((r) => S.inRound(r, startedAt)).filter((r) =>
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
  // ★ ถามความจริงจาก git ก่อนพิมพ์ — "รอ push" ที่ค้างเพราะใบอื่นเป็นคน push ให้ ต้องหายเองตรงนี้ (บั๊ก 20 ก.ย. 69)
  //   เขียน state จริง (ไม่ใช่แค่แสดงผล) เพราะ `closeIssueIfNoLlmRows` อ่าน `!r.shippedAt` ไปตัดสินปิด issue ด้วย
  const healed = reconcile();
  if (healed.length) console.log(`ℹ ปรับสถานะตาม git: ${healed.length} ใบอยู่บน origin/main แล้ว → ${healed.join(' ')}`);
  const s = S.load();
  const rows = Object.entries(s.stocks).filter(([, r]) => S.inRound(r, s.startedAt));   // (Task 21) แถวรอบเก่าไม่ใช่งานของรอบนี้
  // ★ (รีวิว C) แถวที่ค้างจาก**รอบก่อน** ไม่ได้อยู่ใน X/Y และไม่บล็อกการปิด issue — ถ้าไม่พิมพ์ก็หายเงียบไปเลย
  //   (เกิดได้ปกติ: flag ใหม่ของวันถัดมาเปิดรอบใหม่ ทิ้งงานที่ยังไม่ได้ทำของรอบก่อนไว้ข้างหลัง) · ไม่มี = ไม่พิมพ์บรรทัด
  const stale = Object.entries(s.stocks)
    .filter(([, r]) => !S.inRound(r, s.startedAt))
    .filter(([, r]) => !r.skip && !r.shippedAt && ['LIGHT', 'FULL'].includes(r.bucket))
    .map(([k]) => k);
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
  // open-item #28 (ruling: ไม่แก้พฤติกรรมของ roundStart — เปลี่ยนแค่ข้อความให้ชัดว่าทำไมแถวพวกนี้ไม่ถูกนับเป็นรอบนี้)
  if (stale.length) console.log(`ค้างจากรอบก่อน — ยังไม่นับเป็น flag ใหม่ของรอบนี้ (${stale.length}): ${stale.join(' ')}`);
}

module.exports = { shipStock, shipPrepatch, status, commitMessage, commitArgs, trailer, resolveModel, resolveTrailer, reportAiModel,
  landedOnOrigin, shipPhaseOf, rowsToHeal, reconcile, dirtyTracked, pushIfClean, shouldPush, closeIssueIfEmpty, closeIssueIfNoLlmRows, prepatchBlockers, prepatchRefusal, prepatchCandidates, parsePorcelain, parsePorcelainZ, unquotePath, pendingCommitFor, postcheckGuard, STOCK_FILES, TITLE };
