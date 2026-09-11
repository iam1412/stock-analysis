'use strict';
/** รันคำสั่งภายนอกแบบ sync จาก root ของรีโป (git · npm · node tools/*) — runbook ต้องการแค่ exit code + ข้อความ */
const cp = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

/** ไม่ throw — คืน { code, out, err } ให้ caller ตัดสิน */
function run(cmd, args, opts) {
  const r = cp.spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...(opts || {}) });
  return { code: r.status == null ? 1 : r.status, out: r.stdout || '', err: r.stderr || '' };
}
/** throw เมื่อ exit ≠ 0 พร้อมชื่อขั้น + ท้าย stderr/stdout (2,000 ตัวอักษร) — พอให้คนอ่านรู้ว่าอะไรพัง */
function must(cmd, args, what) {
  const r = run(cmd, args);
  if (r.code !== 0) throw new Error(`${what || cmd} ล้ม (exit ${r.code})\n${(r.err || r.out).trim().slice(-2000)}`);
  return r;
}
module.exports = { run, must, ROOT };
