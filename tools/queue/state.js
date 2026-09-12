'use strict';
/**
 * state ของรอบเคลียร์คิว — `.queue/state.json` (gitignore · per-machine · อยู่ข้ามหลาย session ไม่หายเหมือน scratchpad)
 * stocks[SYM] = { reason, bucket, oldPrice, currency, footerAge, skip, flaggedAt, prePatched, mode, model, effort, prepAt,
 *                 escalated, prePatchRejected, prepatchShippedAt, epsScreen, snapDeltas, postcheck: 'pass'|'review', postcheckAt, shippedAt }
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
function update(sym, patch) {
  const s = load();
  s.stocks[sym] = { ...(s.stocks[sym] || {}), ...patch };
  save(s);
  return s.stocks[sym];
}
module.exports = { DIR, FILE, PREP_DIR, load, save, update, resolveQueueDir };
