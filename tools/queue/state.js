'use strict';
/**
 * state ของรอบเคลียร์คิว — `.queue/state.json` (gitignore · อยู่ข้ามหลาย session ไม่หายเหมือน scratchpad)
 * ★ โฟลเดอร์อยู่ที่ **checkout หลัก** (`resolveQueueDir` ใช้ `git rev-parse --git-common-dir`) ⇒ **ใช้ร่วมกันทุก worktree
 *   บนเครื่องเดียวกัน** — คนละเครื่องยังแยกกันอยู่ (open-item #22)
 * stocks[SYM] = { reason, bucket, oldPrice, currency, footerAge, skip, flaggedAt   ← preflight (ทุกรอบ)
 *                 · prePatched | prePatchRejected                                  ← preflight หลังยิง gate ตามผล pre-patch
 *                 · mode, model, effort, prepAt, escalated, epsScreen, snapDeltas  ← prep (`escalated` ที่นี่ = **boolean** ของ EPS screen)
 *                 · fyYears                                                        ← prep (Task 24 · #7 GABLE — จำนวน FY ที่มี EPS(dil) จริงในตาราง [3] · postcheck เทียบกับ f55)
 *                 · postcheck: 'pass'|'review', postcheckAt                        ← postcheck
 *                 · shippedAt | prepatchShippedAt }                                ← ship <SYM> / ship --prepatch
 * ★ `escalated` ของ triage (สตริง `'age'`|`'earnings'` = ยก PREPATCH→LIGHT) และ `synthetic` (แถวคิวอายุ) เป็นของ **แถวในรอบนั้น
 *   ไม่ถูกบันทึกลงไฟล์นี้** — ชื่อชนกับ `escalated` ของ prep แต่คนละความหมาย
 * env QUEUE_DIR = override โฟลเดอร์ (เทสใช้)
 */
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./sh.js');

/** โฟลเดอร์ state: env QUEUE_DIR (เทส) > <git-common-dir>/../.queue (checkout หลัก — ใช้ร่วมทุก worktree บนเครื่อง · open-item #22) > ROOT/.queue */
function resolveQueueDir(env, gitCommonDir) {
  if (env && env.QUEUE_DIR) return env.QUEUE_DIR;
  const common = gitCommonDir && String(gitCommonDir).trim();
  if (common) return path.join(path.resolve(ROOT, common), '..', '.queue');
  return path.join(ROOT, '.queue');
}
const DIR = resolveQueueDir(process.env, (() => { try { return run('git', ['rev-parse', '--git-common-dir']).out; } catch (_) { return ''; } })());
const FILE = path.join(DIR, 'state.json');
const PREP_DIR = path.join(DIR, 'prep');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return { startedAt: null, stocks: {} };
    throw new Error(`อ่าน ${FILE} ไม่ได้ (${e.message}) — ลบไฟล์แล้วรัน preflight ใหม่`);
  }
}
function save(s) {
  fs.mkdirSync(PREP_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(tmp, FILE);
  return s;
}
/** ฟิลด์ที่เป็นของ "รอบ" ไม่ใช่ของ symbol — flag ใหม่มา = ล้างทิ้ง ไม่งั้นคำสั่งของรอบก่อนสั่งงานรอบนี้ (Task 21)
 *  รายการบังคับจากรีวิว: shippedAt/postcheck/postcheckAt/prepAt/prePatchRejected/prepatchShippedAt/mode/model
 *  + `prePatched` ที่เพิ่มเอง — `prep.js` อ่านค่านี้ไปบอก worker ว่า "ราคา patch มาแล้ว" ค้าง = สั่งงาน worker ผิด
 *  (`escalated`/`effort`/`epsScreen`/`snapDeltas` ไม่ล้าง — เป็นข้อมูลประกอบ ไม่มีใครอ่านไปตัดสินใจ และ prep เขียนทับทุกครั้ง) */
const ROUND_FIELDS = ['shippedAt', 'postcheck', 'postcheckAt', 'prepAt', 'prePatchRejected', 'prepatchShippedAt', 'mode', 'model', 'prePatched'];
/** แถวนี้เป็นของรอบปัจจุบันไหม — ใช้กรองก่อนนับ/ก่อนปิด issue (แถวรอบเก่าไม่ใช่งานของรอบนี้)
 *  ★ ไม่มี `startedAt` (state เก่า/เทส) หรือแถวไม่มี `flaggedAt` = นับด้วยเสมอ — กันของเดิมหายเงียบ */
const inRound = (rec, startedAt) => !startedAt || !rec || !rec.flaggedAt || rec.flaggedAt >= startedAt;

function update(sym, patch) {
  const s = load();
  s.stocks[sym] = { ...(s.stocks[sym] || {}), ...patch };
  save(s);
  return s.stocks[sym];
}
module.exports = { DIR, FILE, PREP_DIR, load, save, update, resolveQueueDir, ROUND_FIELDS, inRound };
