'use strict';
const VALUE_FLAGS = new Set(['--mode', '--model', '--brand', '--median-spec', '--tags', '--message', '--age']);
/** แยก argv ของ runbook: รับทั้ง --flag value และ --flag=value · flag ที่ต้องมีค่าแล้วไม่มี = error ชัด ไม่ใช่ garbage
 *  ★ แตก `--flag=value` **เฉพาะ flag ใน VALUE_FLAGS** — boolean flag ที่พิมพ์ `--force=true` เคยถูกแตกเป็น
 *    ['--force','true'] แล้ว 'true' กลายเป็น positional ตัวแรก ⇒ `ship --force=true AAPL` ไป ship หุ้นชื่อ "TRUE"
 *    (AAPL ตกไปเป็น positional ที่สอง) · ตอนนี้ล้มทันทีพร้อมบอกว่า flag นี้ไม่รับค่า */
function parseArgs(argv) {
  const a = argv.flatMap((x) => {
    const m = /^(--[a-z-]+)=/.exec(x);
    if (!m) return [x];
    if (!VALUE_FLAGS.has(m[1])) throw new Error(`${m[1]} ไม่รับค่า`);
    return [m[1], x.slice(m[1].length + 1)];
  });
  const cmd = a[0];
  const has = (f) => a.includes(f);
  // v === '' = พิมพ์ `--flag=` ค้างไว้ (flatMap ข้างบนแตกเป็น ['--flag','']) — ต้องล้มเหมือนไม่ใส่ค่าเลย
  // ไม่งั้นได้ mode/model/tags เป็นสตริงว่างเงียบ ๆ แล้วไปพังไกลจากจุดพิมพ์ผิด (C2 · รีวิว Task 15/16)
  const val = (f) => { const i = a.indexOf(f); if (i < 0) return null; const v = a[i + 1]; if (v == null || v === '' || v.startsWith('--')) throw new Error(`${f} ต้องมีค่า`); return v; };
  const positional = a.slice(1).filter((x, i, arr) => !x.startsWith('--') && !VALUE_FLAGS.has(arr[i - 1]));
  return { cmd, has, val, positional, sym: (positional[0] || '').toUpperCase() };
}
module.exports = { parseArgs, VALUE_FLAGS };
