'use strict';
// ลูกของ test/v3/sidecar.test.js — รัน prep() ของคิวแบบ offline ใน QUEUE_DIR ชั่วคราว (state.js อ่าน env ตอน require
// ⇒ ต้องเป็น process แยก) · ฉีด run (prep-stock + --json ทั้งสอง) และ medianBlock — ห้ามยิง network
// argv[2] = ok | fail-run | fail-build · stdout = log ของ prep + บรรทัดสุดท้าย "WRITES <ลำดับไฟล์ที่เขียน>"
const fs = require('fs');
const path = require('path');
const I = require('../fixtures/v3/sidecar/ZZZQ.inputs.js');
const scen = process.argv[2];
const writes = [];
const wf = fs.writeFileSync;
fs.writeFileSync = function (f, ...rest) { writes.push(path.basename(String(f))); return wf.call(this, f, ...rest); };
const fund = scen === 'fail-build' ? { ...I.fund, errors: { ...I.fund.errors, fin: 'HTTP 503' } } : I.fund;
const run = (cmd, args) => {
  const script = args[0];
  if (script === 'tools/prep-stock.js') return { code: 0, out: 'CROSS-VERIFY ✓ (fake offline)\n', err: '' };
  if (script === 'tools/fetch-facts.js') return scen === 'fail-run' ? { code: 1, out: '', err: '✗ boom\nบรรทัดที่สอง' } : { code: 0, out: JSON.stringify(I.facts), err: '' };
  if (script === 'tools/fetch-fundamentals.js') return { code: 0, out: JSON.stringify(fund), err: '' };
  throw new Error('unexpected run ' + args.join(' '));
};
// bad-sym: symbol ที่ assertSym ของ sidecar ไม่รับ (`&`) — prep v2 ต้องเขียน .md ต่อ ไม่ล้มที่ removeSidecar ต้นใบ
const sym = scen === 'bad-sym' ? 'ZZ&Q' : I.symbol;
require('../../tools/queue/prep.js').prep(sym, { run, medianBlock: async () => ({ text: 'MEDIANS (fake)', warn: [], r: null }) })
  .then(() => { console.log('WRITES ' + writes.filter((w) => w.startsWith(sym + '.')).join(',')); })
  .catch((e) => { console.error('THROW ' + e.message); process.exit(1); });
