#!/usr/bin/env node
'use strict';
/**
 * dead-ticker-test.js — unit-test tools/dead-ticker-canary.js แบบ offline (ไม่ยิง network)
 * ตรวจ 4 ส่วนที่พลาดแล้วเสียหาย: สร้าง candidate ticker ถูกกระดาน · parse response ·
 * แยกเป็น/ตาย · merge flag โดยไม่ลบ flag ของหุ้นที่ยังเทรดอยู่
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

// ---------- shouldAbort (ยามกัน mass-flag) ----------
ok(C.shouldAbort({ onlyMode: false, probed: 784, aliveCount: 120 }) === true, 'shouldAbort: sweep เต็มเจอ alive 15% → ยกเลิกรอบ (โดนบล็อก)');
ok(C.shouldAbort({ onlyMode: false, probed: 784, aliveCount: 782 }) === false, 'shouldAbort: sweep เต็มปกติ 99.7% → ไปต่อ');
ok(C.shouldAbort({ onlyMode: false, probed: 100, aliveCount: 80 }) === false, 'shouldAbort: 80% พอดี → ไปต่อ (ขอบเขตบน)');
ok(C.shouldAbort({ onlyMode: false, probed: 100, aliveCount: 79 }) === true, 'shouldAbort: 79% → ยกเลิก (ขอบเขตล่าง)');
// รันเจาะจงต้องไม่โดนยาม: "ถาม 2 ตัว ตายทั้งคู่" = คำตอบที่ถูก ไม่ใช่สัญญาณว่าโดนบล็อก
ok(C.shouldAbort({ onlyMode: true, probed: 2, aliveCount: 0 }) === false, 'shouldAbort: --only ตายทั้งคู่ → ไม่ใช้ยาม (ไม่งั้น debug run โดนเตะทิ้ง)');
ok(C.shouldAbort({ onlyMode: false, probed: 8, aliveCount: 0 }) === false, 'shouldAbort: ตัวอย่าง < 20 → อัตราส่วนไม่มีความหมาย ไม่ใช้ยาม');

console.log(nFail ? `\n✗ dead-ticker-test: ${nFail} failed / ${nOK} passed` : `\n✓ dead-ticker-test: ${nOK} passed`);
process.exit(nFail ? 1 : 0);
