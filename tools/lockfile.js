'use strict';
/**
 * lockfile.js — lock ข้าม process สำหรับไฟล์ state ที่มีหลาย writer (WS4 ระยะ 0)
 *   price-flags.json  ← cron รายวัน · canary รายสัปดาห์ · controller pre-patch · worker --force
 *   tools/seeds.json  ← pick-brand.js (เดิม read→write เปล่า ๆ: 2 worker ขนาน = สีชนโดย gate มองไม่เห็น)
 *   tags.json         ← tag-apply.js
 * กลไก: mkdir `<file>.lock` (atomic บน POSIX/macOS/Linux) · EEXIST = มีคนถือ · รอแล้ว **throw** ไม่ข้ามเงียบ
 *   (ข้ามเงียบ = เขียน state ครึ่งเดียว = คิวเพี้ยน — แย่กว่าล้มดัง ๆ) · lock ที่ mtime เก่ากว่า STALE_MS = process ตายทิ้งไว้ ยึดได้
 * ★ ห้ามถือ lock คร่อมงานยาว (loop fetch 8 นาทีของ cron) — ถือเฉพาะช่วง read→merge→write (มิลลิวินาที)
 * · holder async ได้ heartbeat (ระยะ 1) · holder sync ห้ามยาว
 */
const fs = require('fs');
const path = require('path');

const STALE_MS = 10 * 60 * 1000;   // cron รอบเต็ม ~8 นาที ยังไม่ถึง — เกินนี้ถือว่าค้าง
const WAIT_MS = 60 * 1000;
const POLL_MS = 200;
const HEARTBEAT_MS = 60 * 1000;    // holder แบบ async touch mtime ทุก 1 นาที — holder sync ทำไม่ได้ (event loop ไม่หมุน) ⇒ กฎ "ถือสั้น" ยังอยู่
const held = new Set();

/** ปล่อย lock — เฉพาะเมื่อ pid ในโฟลเดอร์ยังเป็นของเรา (ถูกยึดไปแล้วเพราะ stale = ของคนใหม่ ห้ามลบ) */
function release(dir) {
  held.delete(dir);
  if (readPid(dir) !== String(process.pid)) return false;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  return true;
}
process.on('exit', () => { for (const d of [...held]) release(d); });
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => { for (const d of [...held]) release(d); process.exit(sig === 'SIGINT' ? 130 : 143); });

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function readPid(dir) { try { return fs.readFileSync(path.join(dir, 'pid'), 'utf8').trim(); } catch (_) { return '?'; } }

/** ยึด lock ที่ค้าง — ต้องทำใต้ lock ที่สอง (`<dir>.reclaim`) แล้ว stat ซ้ำ ไม่งั้น 2 waiter เห็น "ค้าง" พร้อมกัน
 *  rm+mkdir ทั้งคู่ = ถือ lock ซ้อน (reviewer จำลองได้ 2/6 รอบ) · .reclaim เองก็มี staleness กันคนตายคาไว้ */
function reclaimStale(dir) {
  const rdir = `${dir}.reclaim`;
  try { fs.mkdirSync(rdir); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try { if (Date.now() - fs.statSync(rdir).mtimeMs > STALE_MS) fs.rmSync(rdir, { recursive: true, force: true }); } catch (_) {}
    return false;   // คนอื่นกำลังยึดอยู่ — กลับไป poll
  }
  held.add(rdir);
  try {
    let st;
    try { st = fs.statSync(dir); } catch (_) { return false; }          // หายไปแล้ว = ปล่อยแล้ว → poll รอบถัดไปได้เอง
    if (Date.now() - st.mtimeMs <= STALE_MS) return false;               // สดขึ้นมาใหม่ = มีคนยึดไปก่อนแล้ว
    fs.rmSync(dir, { recursive: true, force: true });
    try { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'pid'), String(process.pid)); return true; }
    catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  } finally { held.delete(rdir); fs.rmSync(rdir, { recursive: true, force: true }); }
}

function tryAcquire(dir) {
  try { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'pid'), String(process.pid)); return true; }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  let st;
  try { st = fs.statSync(dir); } catch (_) { return false; }
  if (Date.now() - st.mtimeMs <= STALE_MS) return false;
  return reclaimStale(dir);
}

/** รัน fn ใต้ lock ของ file · sync: คืนค่าของ fn แล้วปล่อย · async (fn คืน thenable): ถือต่อ + heartbeat จน settle แล้วคืน promise · รอเกิน waitMs → throw */
function withLock(file, fn, opts) {
  const waitMs = (opts && opts.waitMs != null) ? opts.waitMs : WAIT_MS;
  const hbMs = (opts && opts.heartbeatMs != null) ? opts.heartbeatMs : HEARTBEAT_MS;
  const dir = `${file}.lock`;
  const t0 = Date.now();
  while (!tryAcquire(dir)) {
    if (Date.now() - t0 > waitMs) throw new Error(`รอ lock ${path.basename(dir)} เกิน ${waitMs >= 1000 ? Math.round(waitMs / 1000) + ' วิ' : waitMs + ' ms'} — process อื่นถืออยู่ (pid ${readPid(dir)}) ยกเลิก ไม่เขียนทับ`);
    sleepSync(POLL_MS);
  }
  held.add(dir);
  let out;
  try { out = fn(); }
  catch (e) { release(dir); throw e; }
  if (!out || typeof out.then !== 'function') { release(dir); return out; }
  const hb = setInterval(() => {
    if (readPid(dir) !== String(process.pid)) { clearInterval(hb); return; }   // ถูก reclaim ไปแล้ว (stale) — เลิก touch ไม่งั้นทำให้ lock ของเจ้าของใหม่ดูสดตลอด reclaim ไม่ได้
    try { const t = new Date(); fs.utimesSync(dir, t, t); } catch (_) {}
  }, hbMs);
  hb.unref();
  return out.finally(() => { clearInterval(hb); release(dir); });
}

/** เขียน state file แบบ atomic: temp ในโฟลเดอร์เดียวกัน (rename ข้าม filesystem ไม่ atomic) แล้ว rename ทับ
 *  ใส่ pid กันสองรอบเขียน temp ใบเดียวกัน · เขียนตรง ๆ แล้วถูกตัดกลางคัน = JSON ครึ่งใบ = loadFlags ล้มทั้งรอบถัดไป */
function writeJsonAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} throw e; }
}

module.exports = { withLock, release, writeJsonAtomic, STALE_MS, WAIT_MS, HEARTBEAT_MS };
