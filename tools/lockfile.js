'use strict';
/**
 * lockfile.js — lock ข้าม process สำหรับไฟล์ state ที่มีหลาย writer (WS4 ระยะ 0)
 *   price-flags.json  ← cron รายวัน · canary รายสัปดาห์ · controller pre-patch · worker --force
 *   tools/seeds.json  ← pick-brand.js (เดิม read→write เปล่า ๆ: 2 worker ขนาน = สีชนโดย gate มองไม่เห็น)
 *   tags.json         ← tag-apply.js
 * กลไก: mkdir `<file>.lock` (atomic บน POSIX/macOS/Linux) · EEXIST = มีคนถือ · รอแล้ว **throw** ไม่ข้ามเงียบ
 *   (ข้ามเงียบ = เขียน state ครึ่งเดียว = คิวเพี้ยน — แย่กว่าล้มดัง ๆ) · lock ที่ mtime เก่ากว่า STALE_MS = process ตายทิ้งไว้ ยึดได้
 * ★ ห้ามถือ lock คร่อมงานยาว (loop fetch 8 นาทีของ cron) — ถือเฉพาะช่วง read→merge→write (มิลลิวินาที)
 */
const fs = require('fs');
const path = require('path');

const STALE_MS = 10 * 60 * 1000;   // cron รอบเต็ม ~8 นาที ยังไม่ถึง — เกินนี้ถือว่าค้าง
const WAIT_MS = 60 * 1000;
const POLL_MS = 200;
const held = new Set();

process.on('exit', () => { for (const d of held) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } });

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function readPid(dir) { try { return fs.readFileSync(path.join(dir, 'pid'), 'utf8').trim(); } catch (_) { return '?'; } }

function tryAcquire(dir) {
  try { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'pid'), String(process.pid)); return true; }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  try {
    if (Date.now() - fs.statSync(dir).mtimeMs > STALE_MS) { fs.rmSync(dir, { recursive: true, force: true }); return tryAcquire(dir); }
  } catch (_) { /* หายไประหว่างเช็ค = อีกฝั่งปล่อยแล้ว รอบถัดไปได้เอง */ }
  return false;
}

/** รัน fn ใต้ lock ของ file (sync) · คืนค่าของ fn · รอเกิน waitMs → throw */
function withLock(file, fn, opts) {
  const waitMs = (opts && opts.waitMs) || WAIT_MS;
  const dir = `${file}.lock`;
  const t0 = Date.now();
  while (!tryAcquire(dir)) {
    if (Date.now() - t0 > waitMs) throw new Error(`รอ lock ${path.basename(dir)} เกิน ${Math.round(waitMs / 1000)} วิ — process อื่นถืออยู่ (pid ${readPid(dir)}) ยกเลิก ไม่เขียนทับ`);
    sleepSync(POLL_MS);
  }
  held.add(dir);
  try { return fn(); }
  finally { held.delete(dir); fs.rmSync(dir, { recursive: true, force: true }); }
}

/** เขียน state file แบบ atomic: temp ในโฟลเดอร์เดียวกัน (rename ข้าม filesystem ไม่ atomic) แล้ว rename ทับ
 *  ใส่ pid กันสองรอบเขียน temp ใบเดียวกัน · เขียนตรง ๆ แล้วถูกตัดกลางคัน = JSON ครึ่งใบ = loadFlags ล้มทั้งรอบถัดไป */
function writeJsonAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

module.exports = { withLock, writeJsonAtomic, STALE_MS, WAIT_MS };
