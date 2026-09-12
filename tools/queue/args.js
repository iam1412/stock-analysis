'use strict';
const VALUE_FLAGS = new Set(['--mode', '--model', '--brand', '--median-spec', '--tags', '--message', '--age']);
/** แยก argv ของ runbook: รับทั้ง --flag value และ --flag=value · flag ที่ต้องมีค่าแล้วไม่มี = error ชัด ไม่ใช่ garbage */
function parseArgs(argv) {
  const a = argv.flatMap((x) => (/^--[a-z-]+=/.test(x) ? [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)] : [x]));
  const cmd = a[0];
  const has = (f) => a.includes(f);
  const val = (f) => { const i = a.indexOf(f); if (i < 0) return null; const v = a[i + 1]; if (v == null || v.startsWith('--')) throw new Error(`${f} ต้องมีค่า`); return v; };
  const positional = a.slice(1).filter((x, i, arr) => !x.startsWith('--') && !VALUE_FLAGS.has(arr[i - 1]));
  return { cmd, has, val, positional, sym: (positional[0] || '').toUpperCase() };
}
module.exports = { parseArgs, VALUE_FLAGS };
