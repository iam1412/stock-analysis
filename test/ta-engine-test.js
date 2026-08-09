#!/usr/bin/env node
'use strict';
// ta-engine-test.js — ตรึงนิยาม TA ให้ deterministic (สเปกอยู่ใน docs/superpowers/specs/2026-08-01-ta-chart-design.md)
const assert = require('node:assert');
const TA = require('../_template/ta-engine.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// ── ema: seed = SMA(period) แล้วไล่ k=2/(period+1) — เทียบค่าคำนวณมือ
{
  const e = TA.ema([1, 2, 3, 4, 5, 6], 3);
  assert.equal(e[0], null); assert.equal(e[1], null);
  close(e[2], 2);                    // SMA(1,2,3)
  close(e[3], 3);                    // 2 + (4-2)*0.5
  close(e[4], 4); close(e[5], 5);
  assert.equal(e.length, 6);
}
// ── rsi: ขึ้นล้วน = 100 · ลงล้วน = 0 · สลับ +1/-1 สมมาตร → แกว่งรอบ 50 (Wilder เหลื่อมเฟส ไม่ใช่ 50 พอดี)
{
  const up = TA.rsi(Array.from({ length: 20 }, (_, i) => 10 + i), 14);
  assert.equal(up[13], null, 'index < period ยังไม่มีค่า');
  close(up[14], 100);
  const dn = TA.rsi(Array.from({ length: 20 }, (_, i) => 30 - i), 14);
  close(dn[14], 0);
  const alt = TA.rsi(Array.from({ length: 40 }, (_, i) => 10 + (i % 2)), 14);
  assert.ok(alt[39] > 45 && alt[39] < 55, 'สลับขึ้นลงสมมาตร → RSI อยู่ย่านกลาง');
}
// ── findPivots: zigzag สังเคราะห์ — ยอดที่ i=5 (สูง 20) และแอ่งที่ i=10 (ต่ำ 5)
{
  const hi = [10,11,12,13,14,20,14,13,12,11, 8, 9,10,11,12,13];
  const lo = hi.map((x) => x - 2);
  const pv = TA.findPivots(hi, lo, 3);
  assert.deepEqual(pv.map((p) => [p.i, p.type]), [[5, 'H'], [10, 'L']]);
  close(pv[0].price, 20); close(pv[1].price, 6);
}
// ── labelStructure: H สองตัว 20→25 = HH · L สองตัว 6→8 = HL
{
  const labeled = TA.labelStructure([
    { i: 5, type: 'H', price: 20 }, { i: 10, type: 'L', price: 6 },
    { i: 15, type: 'H', price: 25 }, { i: 20, type: 'L', price: 8 },
    { i: 25, type: 'H', price: 22 }, { i: 30, type: 'L', price: 5 },
  ]);
  assert.deepEqual(labeled.map((p) => p.label), [null, null, 'HH', 'HL', 'LH', 'LL']);
}
// ── detectBreaks: ขาขึ้น (HH/HL) แล้วปิดหลุด swing low ล่าสุด = CHoCH ลง · ทะลุ swing high ตามเทรนด์ = BOS ขึ้น
{
  const pivots = [
    { i: 2, type: 'L', price: 10 }, { i: 5, type: 'H', price: 20 },
    { i: 8, type: 'L', price: 14 }, { i: 11, type: 'H', price: 24 },
  ];
  // closes ยาว 20: i=10 ปิด 22 ทะลุ H(20) = BOS ขึ้น · i=15 ปิด 25 ทะลุ H(24) = BOS ขึ้นซ้ำตามเทรนด์
  // · i=18 ปิด 13 หลุด L(14) สวนเทรนด์ขึ้น = CHoCH ลง (BOS เกิดซ้ำได้ทุก swing ที่ถูกทะลุตามเทรนด์ — นิยามใน spec)
  const closes = [10,11,10,12,15,20,18,16,14,18,22,24,23,22,23,25,20,15,13,12];
  const ev = TA.detectBreaks(closes, pivots);
  const bos = ev.filter((e) => e.type === 'BOS');
  assert.deepEqual(bos.map((e) => [e.i, e.dir, e.level]), [[10, 'up', 20], [15, 'up', 24]]);
  const choch = ev.find((e) => e.type === 'CHoCH');
  assert.ok(choch && choch.i === 18 && choch.dir === 'down' && choch.level === 14);
}
// ── detectBreaks ห้ามมี look-ahead: pivot fractal k=3 ยืนยันจริงที่แท่ง p.i+3 — ใช้เป็นแนวก่อนหน้านั้นไม่ได้
{
  const pivots = [{ i: 2, type: 'L', price: 10 }, { i: 5, type: 'H', price: 20 }];
  const closes = [10, 11, 10, 12, 15, 20, 21, 22, 23, 24, 25, 26];
  // close ทะลุ 20 ตั้งแต่ i=6 แต่เรียลไทม์ยังไม่รู้ว่า i=5 เป็น pivot จนถึง i=8 → event แรกต้องอยู่ i=8
  const ev = TA.detectBreaks(closes, pivots);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].i, ev[0].type, ev[0].dir, ev[0].level], [8, 'BOS', 'up', 20]);
}
// ── detectDivergence: price LL แต่ RSI HL = bullish divergence
{
  const pivots = [{ i: 3, type: 'L', price: 10 }, { i: 9, type: 'L', price: 9 }];
  const rsiArr = new Array(12).fill(50); rsiArr[3] = 25; rsiArr[9] = 35;
  const closes = new Array(12).fill(10);
  const d = TA.detectDivergence(closes, rsiArr, pivots);
  assert.equal(d.length, 1);
  assert.equal(d[0].type, 'bull');
  assert.deepEqual([d[0].p1.i, d[0].p2.i], [3, 9]);

  // RSI ต่างกันน้อยกว่า 2 จุด = noise ไม่ใช่ divergence (เคสจริง AMKR 38.6→39.5 ที่ user ทัก 1 ส.ค. 2569)
  const weak = new Array(12).fill(50); weak[3] = 38.6; weak[9] = 39.5;
  assert.equal(TA.detectDivergence(closes, weak, pivots).length, 0, 'RSI diff < 2 ต้องไม่นับ');

  // invalidation: ราคาปิดหลัง p2 หลุดต่ำกว่า pivot low ของ p2 = สัญญาณ bull ถูกทำลาย ห้ามรายงาน
  const crashed = new Array(12).fill(10); crashed[11] = 7; // 7 < p2.price 9
  assert.equal(TA.detectDivergence(crashed, rsiArr, pivots).length, 0, 'bull div ที่โดนทะลุ low ต้องหาย');

  // bear divergence กลับด้าน: ราคาปิดหลัง p2 ทะลุเหนือ pivot high = invalidate เช่นกัน
  const hPivots = [{ i: 3, type: 'H', price: 20 }, { i: 9, type: 'H', price: 21 }];
  const hRsi = new Array(12).fill(50); hRsi[3] = 75; hRsi[9] = 60;
  assert.equal(TA.detectDivergence(new Array(12).fill(18), hRsi, hPivots).length, 1, 'bear div ปกติต้องอยู่');
  const pumped = new Array(12).fill(18); pumped[11] = 22; // 22 > p2.price 21
  assert.equal(TA.detectDivergence(pumped, hRsi, hPivots).length, 0, 'bear div ที่โดนทะลุ high ต้องหาย');
}
// ── summarizeSignals: ชุด EMA 7/30/200 — chip cross EMA7/30 + ราคาเทียบ EMA200 + RSI · ห้ามมีคำแนะนำซื้อขาย
{
  const closes = Array.from({ length: 260 }, (_, i) => 10 + i * 0.1);
  const chips = TA.summarizeSignals({
    closes, ema7: TA.ema(closes, 7), ema30: TA.ema(closes, 30), ema200: TA.ema(closes, 200),
    rsiArr: TA.rsi(closes, 14), breaks: [], divs: [],
  });
  assert.ok(chips.length >= 3);
  assert.ok(chips.some((c) => /EMA7 > EMA30/.test(c.label) && c.tone === 'pos'));
  // ป้าย cross ไม่ใช้คำ golden/death แล้ว (user เคาะ 1 ส.ค. 2569) — ทิศบอกด้วยเครื่องหมาย >/< อยู่แล้ว
  for (const c of chips) assert.ok(!/golden|death/i.test(c.label), 'ห้ามมีคำ golden/death: ' + c.label);
  assert.ok(chips.some((c) => /ราคา > EMA200/.test(c.label) && c.tone === 'pos'));
  assert.ok(chips.some((c) => /RSI/.test(c.label)));
  for (const c of chips) {
    assert.ok(['pos', 'neg', 'neu'].includes(c.tone));
    assert.ok(!/ซื้อ|ขาย|buy|sell/i.test(c.label), 'chip ต้องเป็นข้อเท็จจริง ไม่ใช่คำแนะนำ');
  }
  // ข้อมูลไม่พอ EMA200 (แท่ง < 200) → ไม่มี chip EMA200 แต่ chip อื่นยังครบ ไม่ throw
  const short = Array.from({ length: 120 }, (_, i) => 10 + i * 0.1);
  const chips2 = TA.summarizeSignals({
    closes: short, ema7: TA.ema(short, 7), ema30: TA.ema(short, 30), ema200: TA.ema(short, 200),
    rsiArr: TA.rsi(short, 14), breaks: [], divs: [],
  });
  assert.ok(chips2.some((c) => /EMA7 > EMA30/.test(c.label)));
  assert.ok(!chips2.some((c) => /EMA200/.test(c.label)));
  // เคสมี cross จริง (V-shape: ลง 80 แท่งแล้วเด้งแรง) → ป้ายรูปแบบใหม่ "(cross N แท่งก่อน)" ห้ามมี golden/death
  const vshape = Array.from({ length: 120 }, (_, i) => (i < 80 ? 100 - i : 20 + (i - 80) * 3));
  const chips3 = TA.summarizeSignals({
    closes: vshape, ema7: TA.ema(vshape, 7), ema30: TA.ema(vshape, 30), ema200: TA.ema(vshape, 200),
    rsiArr: TA.rsi(vshape, 14), breaks: [], divs: [],
  });
  const emaChip = chips3.find((c) => /EMA7/.test(c.label));
  assert.ok(/^EMA7 > EMA30 \(cross \d+ แท่งก่อน\)$/.test(emaChip.label), 'ป้าย cross รูปแบบใหม่ — พบ: ' + emaChip.label);
}
// ── resample: รายวัน → W/M (o=แท่งแรก h=max l=min c=แท่งสุดท้าย v=รวม, t=เวลาแท่งแรกของช่วง) · 'D' = ผ่านตรง
{
  const D = 86400, t0 = 1704067200; // จันทร์ 1 ม.ค. 2024 00:00 UTC
  const bars = { t: [t0, t0 + D, t0 + 2 * D, t0 + 7 * D], o: [10, 11, 12, 20], h: [15, 13, 12, 22], l: [9, 10, 11, 19], c: [11, 12, 10, 21], v: [100, 200, 300, 400] };
  const w = TA.resample(bars, 'W'); // 3 แท่งแรกสัปดาห์เดียวกัน (จ-พ) · แท่งที่ 4 = จันทร์ถัดไป
  assert.deepEqual(w.t, [t0, t0 + 7 * D]);
  assert.deepEqual(w.o, [10, 20]);
  assert.deepEqual(w.h, [15, 22]);
  assert.deepEqual(w.l, [9, 19]);
  assert.deepEqual(w.c, [10, 21]);
  assert.deepEqual(w.v, [600, 400]);
  const m = TA.resample(bars, 'M'); // ทุกแท่งอยู่ ม.ค. 2024 → เหลือแท่งเดียว
  assert.deepEqual(m.t, [t0]); assert.deepEqual(m.h, [22]); assert.deepEqual(m.l, [9]); assert.deepEqual(m.c, [21]); assert.deepEqual(m.v, [1000]);
  assert.deepEqual(TA.resample(bars, 'D'), bars);
  // 'Y' = รายปี · '4H' = ก้อนละ 4 ชั่วโมง (จากแท่งรายชั่วโมง)
  const y = TA.resample({ t: [t0, t0 + 40 * D, t0 + 400 * D], o: [1, 2, 3], h: [5, 6, 7], l: [0.5, 1, 2], c: [2, 3, 4], v: [10, 10, 10] }, 'Y');
  assert.deepEqual(y.t, [t0, t0 + 400 * D]); // 2024 สองแท่งแรก · 2025 แท่งท้าย
  assert.deepEqual(y.h, [6, 7]); assert.deepEqual(y.c, [3, 4]); assert.deepEqual(y.v, [20, 10]);
  const H = 3600;
  const h4 = TA.resample({ t: [t0, t0 + H, t0 + 4 * H, t0 + 5 * H], o: [1, 2, 3, 4], h: [1, 2, 3, 4], l: [1, 2, 3, 4], c: [1, 2, 3, 4], v: [1, 1, 1, 1] }, '4H');
  assert.deepEqual(h4.t, [t0, t0 + 4 * H]); // ก้อน 00-04 กับ 04-08
  assert.deepEqual(h4.o, [1, 3]); assert.deepEqual(h4.c, [2, 4]); assert.deepEqual(h4.v, [2, 2]);
}
// ── ข้อมูลบาง (C6): แท่งน้อย → ไม่ throw, คืนโครงว่าง
{
  assert.doesNotThrow(() => TA.ema([1, 2], 20));
  assert.doesNotThrow(() => TA.rsi([1, 2], 14));
  assert.deepEqual(TA.findPivots([1, 2], [0, 1], 3), []);
}
// ── ta-chart.js: syntax-check (check-site ข้าม <script src> → bundle นี้ไม่ถูก parse ที่ไหนเลย; new Function แค่ parse ไม่รัน) ──
{
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', '_template', 'ta-chart.js'), 'utf8');
  assert.doesNotThrow(() => new Function(src), 'ta-chart.js มี syntax error (bundle นี้ไม่ถูก syntax-check ที่อื่น)');
}
console.log('✅ ta-engine-test ผ่าน');
