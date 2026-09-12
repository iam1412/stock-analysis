#!/usr/bin/env node
'use strict';
/**
 * queue.js — runbook รอบ "เคลียร์คิว price-flags" (WS5 · แทนขั้นความจำ 24 ขั้นใน docs-audit §5)
 *   npm run queue -- preflight              pull --rebase · triage · snapshot ราคาเดิม · pre-patch ทั้งชุด · พิมพ์ขั้นที่ต้องทำเอง
 *   npm run queue -- ship --prepatch        รันทันทีหลัง preflight (ก่อน spawn worker ตัวแรก) — push ราคาที่ patch ให้ tree สะอาด
 *                                            → build/preserve-dates/build → push · กันตัวที่ worker วิเคราะห์ใหม่แล้ว (footer ขยับ/ไฟล์ใหม่)
 *   npm run queue -- prep <SYM>             prep-stock + มัธยฐาน + EPS screen + snapshot diff → .queue/prep/<SYM>.md ของ checkout หลัก (ใช้ร่วมทุก worktree) (prompt)
 *   npm run queue -- postcheck <SYM>        gate + spotcheck + ราคาค้าง + ai-model + pe/roe + footer
 *   npm run queue -- ship <SYM> [--tags …]  verify → commit 1 หุ้น → push · ปิด issue เมื่อคิวว่าง
 *   npm run queue -- status                 X/Y push แล้ว / รอ push / ยังไม่เริ่ม
 * สิ่งที่ยังต้องทำเอง (script พิมพ์บอกทุกครั้ง): probe โมเดล · courier/advisor หุ้นยาก · spawn worker (pin model) · ยืนยันเพิกถอน · ชั้น 0 valuation · publish/skip
 */
const argv = process.argv.slice(2);
const cmd = argv[0];
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const VALUE_FLAGS = new Set(['--mode', '--model', '--brand', '--median-spec', '--tags', '--message', '--age']);
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !VALUE_FLAGS.has(arr[i - 1]));
const sym = (positional[0] || '').toUpperCase();
const usage = `ใช้: npm run queue -- <คำสั่ง> [ตัวเลือก]
  preflight [--no-patch] [--allow-intraday] [--allow-dirty] [--age N] [--no-age]
  ship --prepatch
  prep <SYM> [--mode NEW|UPDATE|UPDATE-LIGHT] [--model sonnet|opus] [--brand "#hex"] [--median-spec SYM:TICKER] [--th]
  postcheck <SYM> [--model sonnet|opus]
  ship <SYM> [--tags "slug slug"] [--message "…"] [--force]
  status`;

(async () => {
  switch (cmd) {
    case 'preflight': require('./queue/preflight.js').preflight({ noPatch: has('--no-patch'), allowIntraday: has('--allow-intraday'), allowDirty: has('--allow-dirty'), age: val('--age') != null ? +val('--age') : null, noAge: has('--no-age') }); break;
    case 'prep': if (!sym) throw new Error(usage); await require('./queue/prep.js').prep(sym, { mode: val('--mode'), model: val('--model'), brand: val('--brand'), medianSpec: val('--median-spec'), th: has('--th') }); break;
    case 'postcheck': if (!sym) throw new Error(usage); process.exitCode = require('./queue/postcheck.js').postcheck(sym, { model: val('--model') }).issues.length ? 1 : 0; break;
    case 'ship': {
      // เช็คก่อน require — สองโหมดนี้คนละงานกัน (ใบเดียว vs ราคาทั้งชุด) ใส่คู่กันแปลว่าพิมพ์ผิด ห้ามเดาให้
      if (has('--prepatch') && sym) throw new Error('ship: ระบุ <SYM> หรือ --prepatch อย่างใดอย่างหนึ่ง');
      const sh = require('./queue/ship.js');
      if (has('--prepatch')) sh.shipPrepatch();
      else if (sym) sh.shipStock(sym, { tags: val('--tags'), message: val('--message'), force: has('--force') });
      else throw new Error(usage);
      break;
    }
    case 'status': require('./queue/ship.js').status(); break;
    default: console.error(usage); process.exit(1);
  }
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
