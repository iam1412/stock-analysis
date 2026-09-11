'use strict';
/**
 * state ของรอบเคลียร์คิว — `.queue/state.json` (gitignore · per-machine · อยู่ข้ามหลาย session ไม่หายเหมือน scratchpad)
 * stocks[SYM] = { reason, bucket, oldPrice, currency, footerAge, skip, flaggedAt, prePatched, mode, model, effort, prepAt,
 *                 escalated, prePatchRejected, prepatchShippedAt, epsScreen, snapDeltas, postcheck: 'pass'|'review', postcheckAt, shippedAt }
 * env QUEUE_DIR = override โฟลเดอร์ (เทสใช้)
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./sh.js');

const DIR = process.env.QUEUE_DIR || path.join(ROOT, '.queue');
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
module.exports = { DIR, FILE, PREP_DIR, load, save, update };
