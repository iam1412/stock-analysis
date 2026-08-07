#!/usr/bin/env node
'use strict';
/**
 * dead-ticker-test.js — unit-test tools/dead-ticker-canary.js แบบ offline (ไม่ยิง network)
 * ตรวจ 5 ส่วนที่พลาดแล้วเสียหาย: สร้าง candidate ticker ถูกกระดาน · parse response ·
 * แยกเป็น/ตาย · merge flag โดยไม่ลบ flag ของหุ้นที่ยังเทรดอยู่ · retry ตอน scanner สะอึก
 */
const C = require('../tools/dead-ticker-canary.js');

let nOK = 0, nFail = 0;
function ok(cond, label, detail) {
  if (cond) { nOK++; return; }
  nFail++;
  console.error(`✗ ${label}${detail ? ' — ' + detail : ''}`);
}

// ---------- tvCandidates ----------
const th = C.tvCandidates('PTT', 'THB');
ok(th.length === 1 && th[0] === 'SET:PTT', 'candidates: หุ้นไทย → SET: ตัวเดียว', JSON.stringify(th));

const us = C.tvCandidates('AAPL', 'USD');
ok(us[0] === 'NASDAQ:AAPL', 'candidates: หุ้น US เริ่มที่ NASDAQ', JSON.stringify(us));
ok(us.includes('NYSE:AAPL') && us.includes('AMEX:AAPL'), 'candidates: ครอบ NYSE + AMEX');
ok(us.includes('OTC:AAPL'), 'candidates: ครอบ OTC (ADR ญี่ปุ่น/ยุโรป เช่น FANUY/ABBNY/KYCCF)');
ok(us.includes('CBOE:AAPL'), 'candidates: ครอบ CBOE (เคส CBOE:CBOE)');

// หุ้นสองคลาส: ไฟล์ใช้ขีด TradingView ใช้จุด — ต้องลองจุดก่อน แต่ยังเก็บแบบขีดไว้ด้วย
const brk = C.tvCandidates('BRK-B', 'USD');
ok(brk.indexOf('NYSE:BRK.B') < brk.indexOf('NYSE:BRK-B'), 'candidates: BRK-B → ลอง BRK.B ก่อน BRK-B', JSON.stringify(brk.slice(0, 4)));
ok(brk.includes('NASDAQ:BRK.B'), 'candidates: ใช้ชื่อจุดกับทุกกระดาน');

// symbol-map = ชื่อ ticker ปัจจุบันของบริษัทที่เปลี่ยนชื่อ (ไฟล์ยังใช้ชื่อเดิม)
ok(C.tvCandidates('STEC', 'THB')[0] === 'SET:STECON', 'candidates: symbol-map ไทย (STEC→STECON)');
ok(C.tvCandidates('LANC', 'USD')[0] === 'NASDAQ:MZTI', 'candidates: symbol-map US (LANC→MZTI)');
ok(C.tvCandidates('BKI', 'THB')[0] === 'SET:BKIH', 'candidates: symbol-map ไทย (BKI→BKIH)');

// cache = ticker ที่ resolve ได้รอบก่อน → ถามก่อนเสมอ และไม่ซ้ำในลิสต์
const cached = C.tvCandidates('FANUY', 'USD', { cached: 'OTC:FANUY' });
ok(cached[0] === 'OTC:FANUY', 'candidates: cache มาก่อน', JSON.stringify(cached.slice(0, 3)));
ok(new Set(cached).size === cached.length, 'candidates: ไม่มี ticker ซ้ำ', JSON.stringify(cached));

// ---------- parseRows ----------
const rows = C.parseRows({ totalCount: 2, data: [
  { s: 'NASDAQ:NVDA', d: [223.96, 'USD'] },
  { s: 'SET:PTT', d: [38.75, 'THB'] },
  { s: null, d: [1] },            // แถวเสีย → ข้าม ไม่ throw
] });
ok(rows.size === 2, 'parseRows: ข้ามแถวเสีย', String(rows.size));
ok(rows.get('NASDAQ:NVDA').price === 223.96 && rows.get('SET:PTT').currency === 'THB', 'parseRows: อ่านราคา+สกุลเงินถูก');
ok(C.parseRows({}).size === 0 && C.parseRows(null).size === 0, 'parseRows: response ว่าง/null → Map ว่าง ไม่ throw');

// ---------- classify ----------
const probes = [
  { symbol: 'NVDA', candidates: ['NASDAQ:NVDA', 'NYSE:NVDA'] },
  { symbol: 'FANUY', candidates: ['NASDAQ:FANUY', 'OTC:FANUY'] },   // เจอที่ candidate ตัวที่ 2
  { symbol: 'EA', candidates: ['NASDAQ:EA', 'NYSE:EA'] },
];
const cls = C.classify(probes, C.parseRows({ data: [
  { s: 'NASDAQ:NVDA', d: [223.96, 'USD'] },
  { s: 'OTC:FANUY', d: [21.0, 'USD'] },
] }));
ok(cls.alive.size === 2 && cls.dead.length === 1, 'classify: แยกเป็น/ตายถูก', JSON.stringify([...cls.alive.keys()]));
ok(cls.alive.get('FANUY').ticker === 'OTC:FANUY', 'classify: เก็บ ticker ที่เจอจริง (ไม่ใช่ตัวแรกที่ถาม)');
ok(cls.dead[0].symbol === 'EA', 'classify: ตัวที่ไม่มีกระดานไหนตอบ = ต้องสงสัย');

// ---------- mergeDeadFlags ----------
const prev = [
  { symbol: 'IT', reason: 'drift-gt-15pct', reportPrice: 151.53, flaggedAt: '2026-08-07' },
  { symbol: 'EA', reason: 'not-on-exchange', reportPrice: 209.7, flaggedAt: '2026-08-01' },
  { symbol: 'AAOI', reason: 'suspect-split-or-data', flaggedAt: '2026-08-05' },
];
const dead = [{ symbol: 'BPP', reason: 'not-on-exchange', reportPrice: 12 }, { symbol: 'EA', reason: 'not-on-exchange', reportPrice: 209.7 }];
const m = C.mergeDeadFlags(prev, dead, ['IT', 'AAOI'], '2026-08-08');
const bySym = new Map(m.map((f) => [f.symbol, f]));
ok(bySym.get('IT') && bySym.get('IT').reason === 'drift-gt-15pct', 'mergeDeadFlags: flag drift ของหุ้นที่ยังเทรดอยู่ ไม่ถูกลบ');
ok(bySym.get('AAOI') && bySym.get('AAOI').flaggedAt === '2026-08-05', 'mergeDeadFlags: flag อื่นคงวันเดิม');
ok(bySym.get('BPP') && bySym.get('BPP').flaggedAt === '2026-08-08', 'mergeDeadFlags: ตัวใหม่ได้วันนี้');
ok(bySym.get('EA').flaggedAt === '2026-08-01', 'mergeDeadFlags: เหตุผลเดิม → คงวันที่ flag เดิม (ไม่รีเซ็ตทุกสัปดาห์)');
ok(m.map((f) => f.symbol).join(',') === 'AAOI,BPP,EA,IT', 'mergeDeadFlags: เรียงตาม symbol', m.map((f) => f.symbol).join(','));

// หุ้นที่เคยสงสัยแล้วกลับมาเทรด → ถอน flag ทิ้ง (ไม่ค้างคิวตลอด)
const revived = C.mergeDeadFlags(prev, [], ['EA', 'IT'], '2026-08-08');
ok(!revived.find((f) => f.symbol === 'EA'), 'mergeDeadFlags: ตัวที่ฟื้น → ถอน not-on-exchange');
ok(revived.find((f) => f.symbol === 'IT'), 'mergeDeadFlags: ตัวที่ฟื้นแต่ flag คนละเหตุผล → คงไว้');

// ตัวที่ตายแต่เดิมมี flag เหตุผลอื่น → ทับด้วย not-on-exchange + วันใหม่ (triage เปลี่ยนเป็น "ยืนยันแล้วลบ")
const upgraded = C.mergeDeadFlags(prev, [{ symbol: 'AAOI', reason: 'not-on-exchange', reportPrice: 94.32 }], ['IT'], '2026-08-08');
const a = upgraded.find((f) => f.symbol === 'AAOI');
ok(a.reason === 'not-on-exchange' && a.flaggedAt === '2026-08-08', 'mergeDeadFlags: ทับเหตุผลเดิม + รีเซ็ตวันที่');
ok(upgraded.filter((f) => f.symbol === 'AAOI').length === 1, 'mergeDeadFlags: ไม่เกิด entry ซ้ำ symbol เดียวกัน');

// เคสจริง BPP (ควบกับ BANPU · วัด 8 ส.ค. 2569): Yahoo ยังเสิร์ฟ 12.00 บาท เด้ง −20% ⇒ เกินเกณฑ์
// freeze 15% ⇒ cron รายวัน flag ให้จริง **แต่ผิดเหตุผล** — `drift-gt-15pct` สั่ง triage = UPDATE-LIGHT
// ⇒ ไล่ re-analyze หุ้นที่ไม่มีอยู่บนกระดานแล้ว · ต่างจาก EA ที่ drift 0% แล้วหลุดตาข่ายไปเลย
// canary ต้องทับเป็น not-on-exchange (triage = ยืนยันแหล่งปฐมภูมิแล้วลบรายงาน)
const bpp = C.mergeDeadFlags(
  [{ symbol: 'BPP', reason: 'drift-gt-15pct', reportPrice: 15, marketPrice: 12, diffPct: -20, flaggedAt: '2026-08-07' }],
  [{ symbol: 'BPP', reason: 'not-on-exchange', reportPrice: 15, marketPrice: null, diffPct: null, probed: 1 }],
  [], '2026-08-08');
const b = bpp.find((f) => f.symbol === 'BPP');
ok(b.reason === 'not-on-exchange', 'BPP: drift-gt-15pct → not-on-exchange (triage พลิกจาก re-analyze เป็นยืนยันแล้วลบ)');
ok(b.flaggedAt === '2026-08-08', 'BPP: เหตุผลเปลี่ยน → รีเซ็ตวันเป็นวันที่ตัดสินว่าตาย ไม่ใช่วันที่ราคาเพี้ยน');
ok(b.marketPrice === null && b.diffPct === null,
  'BPP: ตัวเลข drift เดิมต้องไม่ติดมา (ป้าย not-on-exchange ที่โชว์ −20% อ่านเหมือนราคายังเดินอยู่)',
  JSON.stringify({ marketPrice: b.marketPrice, diffPct: b.diffPct }));
ok(bpp.length === 1, 'BPP: ไม่เกิด entry ซ้ำ');

// ---------- shouldAbort (ยามกัน mass-flag) ----------
ok(C.shouldAbort({ onlyMode: false, probed: 784, aliveCount: 120 }) === true, 'shouldAbort: sweep เต็มเจอ alive 15% → ยกเลิกรอบ (โดนบล็อก)');
ok(C.shouldAbort({ onlyMode: false, probed: 784, aliveCount: 782 }) === false, 'shouldAbort: sweep เต็มปกติ 99.7% → ไปต่อ');
ok(C.shouldAbort({ onlyMode: false, probed: 100, aliveCount: 80 }) === false, 'shouldAbort: 80% พอดี → ไปต่อ (ขอบเขตบน)');
ok(C.shouldAbort({ onlyMode: false, probed: 100, aliveCount: 79 }) === true, 'shouldAbort: 79% → ยกเลิก (ขอบเขตล่าง)');
// รันเจาะจงต้องไม่โดนยาม: "ถาม 2 ตัว ตายทั้งคู่" = คำตอบที่ถูก ไม่ใช่สัญญาณว่าโดนบล็อก
ok(C.shouldAbort({ onlyMode: true, probed: 2, aliveCount: 0 }) === false, 'shouldAbort: --only ตายทั้งคู่ → ไม่ใช้ยาม (ไม่งั้น debug run โดนเตะทิ้ง)');
ok(C.shouldAbort({ onlyMode: false, probed: 8, aliveCount: 0 }) === false, 'shouldAbort: ตัวอย่าง < 20 → อัตราส่วนไม่มีความหมาย ไม่ใช้ยาม');

// ---------- scan + withRetry (ยิงจริงไม่ได้ในเทสต์ → ฉีด fetch/หน่วงปลอม) ----------
// scanner คืน body ว่างเป็นช่วง ๆ · canary รันสัปดาห์ละครั้ง ไม่มีรอบถัดไปให้แก้ตัว → ต้องลองใหม่เอง
const res = (body, ok = true, status = 200) => ({ ok, status, text: async () => body });
const PTT = JSON.stringify({ data: [{ s: 'SET:PTT', d: [38.75, 'THB'] }] });
const noWait = { sleep: async () => {} };
const quiet = async (fn) => {                       // กลบ log "ลองใหม่ใน N วิ" ให้ผลเทสต์อ่านง่าย
  const log = console.log; console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
};

(async () => {
  // โหมดล้มที่เจอจริง — ของเดิม JSON.parse('') ระเบิด → ทิ้งทั้งรอบ
  let n = 0;
  const got = await quiet(() => C.scan(['SET:PTT'], { ...noWait, fetch: async () => res(++n === 1 ? '' : PTT) }));
  ok(n === 2 && got.get('SET:PTT').price === 38.75, 'scan: body ว่าง → ลองใหม่แล้วผ่าน', `ยิง ${n} ครั้ง`);

  // เชื่อมต่อค้างจน AbortSignal.timeout เตะ (undici default ~300 วิ = กินงบ job ไปหนึ่งในสาม)
  let n2 = 0;
  await quiet(() => C.scan(['SET:PTT'], { ...noWait, fetch: async () => {
    if (++n2 === 1) { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }
    return res(PTT);
  } }));
  ok(n2 === 2, 'scan: timeout → ลองใหม่แล้วผ่าน', `ยิง ${n2} ครั้ง`);

  let n3 = 0;
  await quiet(() => C.scan(['SET:PTT'], { ...noWait, fetch: async () => res(++n3 === 1 ? '' : PTT, n3 !== 1, n3 === 1 ? 502 : 200) }));
  ok(n3 === 2, 'scan: HTTP 502 → ลองใหม่แล้วผ่าน', `ยิง ${n3} ครั้ง`);

  let n4 = 0;
  await quiet(() => C.scan(['SET:PTT'], { ...noWait, fetch: async () => res(++n4 === 1 ? '<html>blocked</html>' : PTT) }));
  ok(n4 === 2, 'scan: JSON เสีย (หน้า HTML) → ลองใหม่แล้วผ่าน', `ยิง ${n4} ครั้ง`);

  // ต้นทางล่มยาว → ยอมแพ้แล้วโยน ไม่กลืน error เป็น "หาย = ตาย" (main จับ → exit 1 ไม่เขียน flag)
  let n5 = 0, threw = null;
  try { await quiet(() => C.scan(['SET:PTT'], { ...noWait, fetch: async () => { n5++; return res(''); } })); }
  catch (e) { threw = e; }
  ok(threw !== null, 'scan: ล้มทุกรอบ → โยน error (ห้ามคืน Map ว่าง = จะกลายเป็น mass-flag ผิด)');
  ok(n5 === 3, 'scan: ยิงครบ 1 + retry 2 ครั้งแล้วหยุด (ไม่วนไม่รู้จบ)', `ยิง ${n5} ครั้ง`);

  // ปกติต้องไม่หน่วง/ไม่ยิงซ้ำ — sweep เต็ม ~784 ตัว retry เกินจำเป็นคือค่าใช้จ่ายล้วน
  let n6 = 0, slept = 0;
  await C.scan(['SET:PTT'], { fetch: async () => { n6++; return res(PTT); }, sleep: async () => { slept++; } });
  ok(n6 === 1 && slept === 0, 'scan: รอบแรกผ่าน → ไม่ retry ไม่หน่วง', `ยิง ${n6} · หน่วง ${slept}`);

  ok(await C.withRetry(async () => 'ok', noWait) === 'ok', 'withRetry: คืนค่าที่ fn คืน');

  console.log(nFail ? `\n✗ dead-ticker-test: ${nFail} failed / ${nOK} passed` : `\n✓ dead-ticker-test: ${nOK} passed`);
  process.exit(nFail ? 1 : 0);
})();
