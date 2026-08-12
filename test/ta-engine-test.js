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
// ── ta-chart.js: syntax-check (check-site ข้าม <script src> → bundle นี้ไม่ถูก parse ที่อื่น) — ด่านแรกก่อนบล็อก runtime ข้างล่าง ──
{
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', '_template', 'ta-chart.js'), 'utf8');
  assert.doesNotThrow(() => new Function(src), 'ta-chart.js มี syntax error (bundle นี้ไม่ถูก syntax-check ที่อื่น)');
}

/* ── ta-chart.js: runtime — รัน bundle ตัวจริงใน mock DOM + stub ไลบรารีกราฟ (ชั้น execution) ──
 * เดิม bundle นี้ถูกตรวจแค่ syntax ⇒ regression ที่ทำให้ render() throw จะดันทุกรายงานตกกลับไปใช้กราฟ SVG เดิม
 * "เงียบ ๆ" (สเปก C3/C4 ห้ามมี error UI) โดย gate ทั้งชุดยังผ่านหมด — ช่องเดียวกับที่ engine-exec.js ปิดให้ engine.js
 *
 * ★ ครอบคลุมแค่ไหน — อ่านก่อนเชื่อผลเทสต์:
 *   ✔ เส้นทางจริงตั้งแต่ IntersectionObserver → load() → fetchOhlc() → render() ทั้งฟังก์ชัน: สร้าง series/primitive/
 *     toolbar/legend/chips, applyView·setBars·setTF (รวมสาขา async 1H/4H + กัน race ด้วย tfSeq), setRangeMonths,
 *     ปุ่มซูม/Log/รีเซ็ต/บันทึกรูป, toggle indicator, legend ตาม crosshair และ draw() ของ primitive ครบ 3 ตัว
 *     (band EMA / เส้น FV-MOS / โซน RSI) — assert ว่าไม่ throw, ไม่ตกไป fallback, ไม่มี NaN/undefined ในที่ที่ต้องเป็นตัวเลข
 *   ✔ เส้นทางล้มเหลว: fetch พัง · HTTP ไม่ 2xx · ไม่มี window.LightweightCharts/__TA_CFG__ · ไม่มี #priceChart
 *     → ต้องคง SVG เดิมไว้ (ไม่ซ่อน host ไม่ต่อ .ta-box) และไม่โยน error ออกนอก
 *   ✘ ไม่ครอบคลุม: ไลบรารี lightweight-charts ตัวจริง — stub ข้างล่างเลียนแบบเฉพาะผิวสัมผัสที่ ta-chart เรียก แล้วตรวจ
 *     "ของที่ป้อนเข้าไป" เท่าที่ของจริงจะปฏิเสธ (time เรียงน้อย→มาก · ค่าเป็นเลขจริง · อาร์กิวเมนต์ resize/setVisibleRange)
 *     ⇒ ชื่อ option ผิด · สัญญา API v5 เปลี่ยน · บั๊กเรขาคณิตข้างในไลบรารี — เทสต์นี้จับไม่ได้ ต้องเปิดหน้าเว็บดูเอง
 *   ✘ ไม่ครอบคลุม: layout จริง (mock คืนขนาด > 0 เสมอ) ⇒ บั๊กตระกูล "element ยัง detached → clientWidth = 0"
 *     (เหตุผลของ resize() หลัง appendChild) ไม่ถูกจำลอง · และไม่ตรวจ "หน้าตา" ที่วาดออกมา ตรวจได้แค่ตัวเลขที่ใช้วาด
 *   ✘ ไม่ครอบคลุม: /api/ohlc ฝั่ง Worker (ohlc-test.js ดูแล) — ที่นี่ stub fetch แล้วตรวจแค่รูป URL ที่ client ยิงออกไป
 * ท้ายบล็อกมี self-check: ฉีดบั๊กจริง 2 แบบเข้า source แล้วยืนยันว่าชุด assert นี้ "จับได้" (กันเทสต์ผ่านลอย ๆ)
 */
(async () => {
  process.exitCode = 1;                        // ★ กันผ่านลอย ๆ: promise ค้าง = event loop ว่าง = node exit 0 ทั้งที่ assert ยังไม่ครบ
  const fs = require('node:fs'), path = require('node:path');
  const TA_CHART_SRC = fs.readFileSync(path.join(__dirname, '..', '_template', 'ta-chart.js'), 'utf8');
  const flush = () => new Promise((r) => setImmediate(r));   // ปล่อย microtask ของ fetch/render เดินจนหมดก่อน assert
  const num = (v, what) => { if (typeof v !== 'number' || !isFinite(v)) throw new Error('LWC stub: ' + what + ' ต้องเป็นตัวเลขจริง — พบ ' + v); };
  const PANE_W = 920, T0 = 1704067200;         // จันทร์ 1 ม.ค. 2024 00:00 UTC (ชุดเดียวกับเทสต์ resample ด้านบน)

  // ---------- mock DOM (เฉพาะ surface ที่ ta-chart.js แตะ — แนวเดียวกับ test/engine-exec.js) ----------
  function mkCtx() {
    const ops = [];
    const ctx = { ops };
    ['beginPath', 'closePath', 'fill', 'stroke', 'save', 'restore'].forEach((m) => { ctx[m] = () => ops.push({ m, a: [] }); });
    ['moveTo', 'lineTo', 'fillRect', 'fillText', 'strokeText', 'drawImage'].forEach((m) => { ctx[m] = (...a) => ops.push({ m, a }); });
    return ctx;
  }
  function mkEl(tag) {
    const cls = new Set(), ev = {};
    const el = {
      tagName: String(tag).toLowerCase(), children: [], parentElement: null, style: {}, rect: { width: PANE_W, height: 300, left: 0, top: 0 },
      textContent: '', innerHTML: '', type: '', title: '', download: '', href: '', disabled: false, width: 0, height: 0, clicks: 0,
      h: () => parseFloat(el.style.height) || el.rect.height,
      classList: {
        add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
        toggle: (c, force) => { const on = force === undefined ? !cls.has(c) : !!force; if (on) cls.add(c); else cls.delete(c); return on; },
      },
      appendChild: (c) => { el.children.push(c); c.parentElement = el; return c; },
      remove: () => { const p = el.parentElement; if (p) p.children.splice(p.children.indexOf(el), 1); el.parentElement = null; },
      addEventListener: (t, fn) => { (ev[t] = ev[t] || []).push(fn); },
      fire: (t) => { if (el.disabled) return; (ev[t] || []).slice().forEach((fn) => fn({ type: t })); },  // ปุ่ม disabled ไม่รับคลิกจริง
      getBoundingClientRect: () => ({ width: el.rect.width, height: el.h(), left: el.rect.left, top: el.rect.top, right: el.rect.left + el.rect.width, bottom: el.rect.top + el.h() }),
      querySelectorAll: (sel) => { const out = []; (function walk(n) { n.children.forEach((c) => { if (c.tagName === sel) out.push(c); walk(c); }); })(el); return out; },
      closest: () => null,
      getContext: () => el.ctx || (el.ctx = mkCtx()),
      toDataURL: () => 'data:image/png;base64,AA==',
      click: () => { el.clicks++; },
    };
    Object.defineProperty(el, 'className', { get: () => [...cls].join(' '), set: (v) => { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); } });
    Object.defineProperty(el, 'clientWidth', { get: () => el.rect.width });
    Object.defineProperty(el, 'clientHeight', { get: () => el.h() });
    return el;
  }
  const mkDoc = () => { const made = []; return { made, createElement: (t) => { const e = mkEl(t); made.push(e); return e; }, getElementById: () => null }; };

  // ---------- stub ไลบรารีกราฟ: เลียนผิวสัมผัสที่ ta-chart เรียก + ปฏิเสธข้อมูลแบบเดียวกับที่ LWC จริงปฏิเสธ ----------
  function mkLWC(doc) {
    const charts = [], watermarks = [];
    function createChart(container, opts) {
      const ch = { container, opts, series: [], resizes: [], visRanges: [], logicalRanges: [], scaleOpts: [], subs: [], fitted: 0, removed: false, crosshair: null, H: parseFloat(container.style.height) || container.rect.height };
      container.appendChild(doc.createElement('canvas'));      // LWC จริงสร้าง canvas ใต้ container — เส้นทาง "บันทึกรูป" อ่านจากตรงนี้
      // แกนราคา: รวมค่าจาก series บนสเกลหลัก + ราคาของ price line (LWC autoscale นับด้วย) · สเกล 'vol' แยกจึงไม่นับ
      const span = () => {
        const a = [];
        ch.series.forEach((s) => {
          if (s.opts.priceScaleId === 'vol') return;
          s.data.forEach((p) => { if (p.value != null) a.push(p.value); if (p.high != null) a.push(p.high, p.low); });
          s.lines.forEach((l) => a.push(l.price));
        });
        return a.length ? { lo: Math.min.apply(null, a), hi: Math.max.apply(null, a) } : null;
      };
      ch.y = (v) => {                                          // scaleMargins ปริยายของ LWC (บน .2 ล่าง .1)
        const sp = span();
        if (!sp || sp.hi === sp.lo || typeof v !== 'number' || !isFinite(v)) return null;
        return ch.H * 0.2 + (1 - (v - sp.lo) / (sp.hi - sp.lo)) * ch.H * 0.7;
      };
      ch.x = (t) => {
        const d = (ch.series[0] || { data: [] }).data;
        if (d.length < 2) return null;
        const t0 = d[0].time, t1 = d[d.length - 1].time;
        return t < t0 || t > t1 ? null : ((t - t0) / (t1 - t0)) * PANE_W;   // นอกจอ = null (เหมือนของจริง)
      };
      let syncing = false;
      const ts = {
        subscribeVisibleTimeRangeChange: (fn) => ch.subs.push(fn),
        setVisibleRange: (r) => {
          num(r && r.from, 'setVisibleRange.from'); num(r.to, 'setVisibleRange.to');
          if (r.from >= r.to) throw new Error('LWC stub: setVisibleRange ต้อง from < to — พบ ' + r.from + ' → ' + r.to);
          ch.visRanges.push(r);
          if (!syncing) { syncing = true; try { ch.subs.forEach((fn) => fn(r)); } finally { syncing = false; } }
        },
        setVisibleLogicalRange: (r) => {
          num(r && r.from, 'setVisibleLogicalRange.from'); num(r.to, 'setVisibleLogicalRange.to');
          if (r.from >= r.to) throw new Error('LWC stub: setVisibleLogicalRange ต้อง from < to — พบ ' + r.from + ' → ' + r.to);
          ch.logicalRanges.push(r);
        },
        getVisibleLogicalRange: () => ({ from: 0, to: Math.max(1, (ch.series[0] || { data: [] }).data.length - 1) }),
        fitContent: () => { ch.fitted++; },
        applyOptions: () => {},
        timeToCoordinate: (t) => ch.x(t),
      };
      ch.timeScale = () => ts;
      ch.addSeries = (kind, sopts) => {
        const s = {
          kind, opts: Object.assign({}, sopts), data: [], lines: [], prims: [],
          setData: (d) => {
            if (!Array.isArray(d)) throw new Error('LWC stub: ' + kind + '.setData ต้องเป็น array');
            let prev = -Infinity;
            d.forEach((p, i) => {
              num(p && p.time, kind + '.data[' + i + '].time');
              if (p.time <= prev) throw new Error('LWC stub: ' + kind + '.data ต้องเรียงเวลาจากน้อยไปมาก (index ' + i + ')');
              prev = p.time;
              ['value', 'open', 'high', 'low', 'close'].forEach((f) => { if (f in p) num(p[f], kind + '.data[' + i + '].' + f); });
            });
            s.data = d;
          },
          applyOptions: (o) => Object.assign(s.opts, o),
          createPriceLine: (o) => { num(o && o.price, kind + '.priceLine.price'); s.lines.push(o); return { applyOptions: () => {} }; },
          attachPrimitive: (p) => s.prims.push(p),
          priceToCoordinate: (v) => ch.y(v),
        };
        ch.series.push(s);
        return s;
      };
      ch.priceScale = (id) => ({ applyOptions: (o) => ch.scaleOpts.push({ id, o }) });
      ch.panes = () => [{}];
      ch.subscribeCrosshairMove = (fn) => { ch.crosshair = fn; };
      ch.resize = (w, h) => { num(w, 'chart.resize(width)'); num(h, 'chart.resize(height)'); ch.resizes.push([w, h]); };
      ch.remove = () => { ch.removed = true; };
      charts.push(ch);
      return ch;
    }
    return { charts, watermarks, createChart, CandlestickSeries: 'Candlestick', HistogramSeries: 'Histogram', LineSeries: 'Line', createTextWatermark: (pane, o) => watermarks.push(o) };
  }

  // fixture: คลื่นแอมพลิจูดหด — จงใจให้มีทั้ง cross EMA7/30 หลายครั้ง, pivot/BOS/CHoCH และ divergence จริง
  function fixtureBars(n, step) {
    const b = { t: [], o: [], h: [], l: [], c: [], v: [] };
    for (let i = 0; i < n; i++) {
      const base = 100 + i * 0.05 + Math.sin(i / 14) * (8 - i * 0.03) + Math.sin(i / 2.3) * 1.5;
      const o = +(base - 0.4).toFixed(4), c = +base.toFixed(4);
      b.t.push(T0 + i * step); b.o.push(o); b.c.push(c);
      b.h.push(+(Math.max(o, c) + 1.1).toFixed(4)); b.l.push(+(Math.min(o, c) - 1.1).toFixed(4));
      b.v.push(1000 + (i % 7) * 130);
    }
    return b;
  }
  const ND = 290, FIX_D = fixtureBars(ND, 86400), FIX_H = fixtureBars(400, 3600);

  // รัน bundle ใน mock DOM: ta-chart อ้าง global พวกนี้ตัวเดียว → ส่งเป็น parameter ของ new Function (ไม่ต้องใช้ vm/dependency)
  async function run(o) {
    o = o || {};
    const doc = mkDoc();
    const host = doc.createElement('div'), wrap = doc.createElement('div');
    wrap.className = 'chart-wrap'; wrap.appendChild(host);
    host.closest = (sel) => (sel === '.chart-wrap' ? wrap : null);
    doc.getElementById = (id) => (id === 'priceChart' && !o.noHost ? host : null);
    const warns = [], urls = [];
    const cons = { warn: (...a) => warns.push(a.map(String).join(' ')), log: () => {}, error: (...a) => warns.push('error: ' + a.map(String).join(' ')) };
    const lwc = mkLWC(doc);
    const CFG = { sym: 'AAPL', cur: 'USD', fv: 112, accent: '#0071e3', accentDark: '#0058b0', dec: 2 };  // รูปเดียวกับ injectTA() ใน build.js
    const win = { __TA_CFG__: o.noCfg ? null : CFG, LightweightCharts: o.noLib ? null : lwc, TA, devicePixelRatio: 2 };
    const fetchStub = (url) => {
      urls.push(url);
      if (o.fetchMode === 'reject') return Promise.reject(new Error('network down'));
      if (o.fetchMode === 'http') return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
      const tf = /[?&]tf=([^&]*)/.exec(url);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ sym: CFG.sym, bars: tf && tf[1] === 'H' ? FIX_H : FIX_D }) });
    };
    let ioCb = null, roCb = null;
    function IO(cb) { ioCb = cb; this.observe = () => {}; this.disconnect = () => {}; }
    function RO(cb) { roCb = cb; this.observe = () => {}; this.disconnect = () => {}; }
    function AC() { this.signal = {}; this.abort = () => { this.signal.aborted = true; }; }
    // TA ส่งแยกเป็น parameter ด้วย: ta-chart เช็ค `window.TA` แต่เรียกใช้เป็น global เปล่า ๆ (`TA.ema(…)`) ซึ่งบนหน้าเว็บ
    // คือตัวเดียวกัน (ta-engine.js UMD ตั้ง root.TA) — แต่ body ของ new Function ไม่เห็น scope ของไฟล์เทสต์
    new Function('window', 'document', 'console', 'fetch', 'AbortController', 'IntersectionObserver', 'ResizeObserver', 'location', 'TA', o.src || TA_CHART_SRC)
      (win, doc, cons, fetchStub, AC, IO, RO, { hostname: 'gaohoon.com' }, win.TA);
    if (ioCb) ioCb([{ isIntersecting: true }]);                // section เข้าใกล้จอ → เริ่มโหลด (C1)
    await flush();
    const box = wrap.children.filter((c) => c.classList.contains('ta-box'))[0] || null;
    const all = (cls) => { const out = []; (function walk(n) { n.children.forEach((c) => { if (c.classList.contains(cls)) out.push(c); walk(c); }); })(box || wrap); return out; };
    const pick = (cls, txt) => { const b = all(cls).filter((x) => x.textContent === txt)[0]; if (!b) throw new Error('ไม่พบ .' + cls + ' "' + txt + '"'); return b; };
    return { doc, host, wrap, box, warns, urls, lwc, CFG, all, btn: (t) => pick('ta-btn', t), tog: (t) => pick('ta-tog', t), ro: () => roCb };
  }
  // วาด primitive 1 ตัวลง canvas จำลอง → คืน ops ที่วาด + อาร์กิวเมนต์ที่ไม่ใช่ตัวเลข (พิกัด NaN = กราฟล่องหน)
  function drawPrim(prim, H) {
    const ctx = mkCtx();
    prim.updateAllViews();
    const pv = prim.paneViews()[0];
    pv.renderer().draw({ useMediaCoordinateSpace: (cb) => cb({ context: ctx, mediaSize: { width: PANE_W, height: H } }) });
    return { ctx, zo: pv.zOrder(), bad: ctx.ops.filter((op) => op.a.some((x) => (typeof x === 'number' ? !isFinite(x) : x == null))) };
  }

  // ===== 1) เส้นทางปกติ: โหลดสำเร็จ → swap เป็นกราฟ TA =====
  const E = await run();
  assert.deepEqual(E.warns, [], 'render ปกติต้องไม่มี console.warn (ta-chart กลืน throw ทุกจุดเป็น warn + fallback SVG) — พบ: ' + E.warns.join(' | '));
  assert.ok(E.box, 'ต้องต่อ .ta-box เข้า .chart-wrap');
  assert.equal(E.host.style.display, 'none', 'SVG เดิมต้องถูกซ่อน ไม่ใช่ลบ (C8)');
  assert.ok(/^\/api\/ohlc\/AAPL\?cur=USD&tf=D$/.test(E.urls[0]), 'URL ที่ยิงตอนโหลด — พบ: ' + E.urls[0]);
  assert.equal(E.lwc.charts.length, 2, 'ต้องมี 2 pane: ราคา + RSI');
  assert.ok(E.lwc.watermarks.length === 1 && E.lwc.watermarks[0].lines[0].text === 'AAPL', 'ลายน้ำชื่อหุ้นบน pane ราคา');
  const pc = E.lwc.charts[0], rc = E.lwc.charts[1];
  const [candles, vol, s7, s30, s200] = pc.series, rsiS = rc.series[0];
  assert.deepEqual([candles.kind, vol.kind, s7.kind], ['Candlestick', 'Histogram', 'Line']);
  assert.equal(candles.data.length, ND);
  assert.deepEqual([candles.data[0].time, candles.data[0].open, candles.data[0].high, candles.data[0].low, candles.data[0].close],
    [FIX_D.t[0], FIX_D.o[0], FIX_D.h[0], FIX_D.l[0], FIX_D.c[0]], 'แท่งแรกต้องตรง fixture ทุกช่อง');
  assert.equal(candles.data[ND - 1].close, FIX_D.c[ND - 1]);
  assert.equal(vol.data.length, ND); assert.equal(vol.data[3].value, FIX_D.v[3]);
  // pts() ต้องตัดช่วง null ของ EMA/RSI ทิ้ง (ไม่ใช่ยัด null เข้า series) — oracle = ta-engine ชุดเดียวกัน
  const nn = (a) => a.filter((x) => x != null).length;
  assert.equal(s7.data.length, nn(TA.ema(FIX_D.c, 7)));
  assert.equal(s30.data.length, nn(TA.ema(FIX_D.c, 30)));
  assert.equal(s200.data.length, nn(TA.ema(FIX_D.c, 200)));
  assert.ok(s200.data.length > 0 && s200.data.length < ND, 'fixture ต้องยาวพอให้ EMA200 มีค่า (ไม่งั้นเส้นทางนี้ไม่ถูกรัน)');
  assert.equal(rsiS.data.length, nn(TA.rsi(FIX_D.c, 14)));
  assert.deepEqual(candles.lines.map((l) => l.price.toFixed(2)), ['112.00', '89.60', '78.40'], 'เส้น FV / MOS 20% / MOS 30%');
  assert.deepEqual(rsiS.lines.map((l) => l.price), [30, 70]);
  // เส้น divergence: จำนวนต้องเท่าที่ engine ตรวจได้จาก fixture เดียวกัน
  const dDivs = TA.detectDivergence(FIX_D.c, TA.rsi(FIX_D.c, 14), TA.labelStructure(TA.findPivots(FIX_D.h, FIX_D.l, 3)));
  assert.ok(dDivs.length >= 1, 'fixture ต้องมี divergence ≥ 1 (ไม่งั้นเส้นทางสร้าง divSeries ไม่ถูกรัน)');
  assert.equal(rc.series.length, 1 + dDivs.length, 'pane RSI = เส้น RSI + เส้น divergence');
  rc.series.slice(1).forEach((s) => assert.equal(s.data.length, 2, 'เส้น divergence = 2 จุด'));
  // toolbar / toggle / chips
  assert.deepEqual(E.all('ta-btn').map((b) => b.textContent), ['1H', '4H', 'D', 'W', '1M', '3M', '6M', '1Y', '3Y', '🔍−', '🔍+', 'รีเซ็ต', 'Log', '📷']);
  assert.deepEqual(E.all('ta-tog').map((b) => b.textContent), ['EMA7', 'EMA30', 'EMA200', 'Band', 'Vol', 'RSI']);
  assert.ok(E.btn('D').classList.contains('on') && E.btn('6M').classList.contains('on'), 'ค่าเริ่มต้น = TF D + ช่วง 6M');
  const oracleChips = TA.summarizeSignals({
    closes: FIX_D.c, ema7: TA.ema(FIX_D.c, 7), ema30: TA.ema(FIX_D.c, 30), ema200: TA.ema(FIX_D.c, 200), rsiArr: TA.rsi(FIX_D.c, 14),
    breaks: TA.detectBreaks(FIX_D.c, TA.labelStructure(TA.findPivots(FIX_D.h, FIX_D.l, 3))), divs: dDivs,
  });
  assert.deepEqual(E.all('ta-chip').map((c) => c.textContent), oracleChips.map((c) => c.label), 'chips ต้องมาจาก summarizeSignals ของแท่งรายวัน');
  // ขนาด/ช่วงเวลาเริ่มต้น
  assert.deepEqual(pc.resizes[0], [PANE_W, 300], 'ต้อง resize หลัง append เข้า DOM จริง');
  assert.deepEqual(rc.resizes[0], [PANE_W, 110]);
  const vr = pc.visRanges[pc.visRanges.length - 1];
  assert.equal(vr.to, FIX_D.t[ND - 1]); assert.equal(vr.to - vr.from, 6 * 2629800, 'มุมมองเริ่มต้น = 6 เดือนล่าสุด');
  assert.ok(rc.visRanges.length >= 1, 'pane RSI ต้องถูก sync ช่วงเวลาตาม pane ราคา');

  // ===== 2) primitive ที่วาดเอง: ต้องวาดจริงด้วยพิกัดที่เป็นตัวเลข =====
  const band = drawPrim(s7.prims[0], pc.H);
  assert.equal(band.zo, 'bottom', 'band ต้องอยู่หลังทุก series');
  assert.deepEqual(band.bad, [], 'band มีพิกัดที่ไม่ใช่ตัวเลข: ' + JSON.stringify(band.bad.slice(0, 2)));
  const fills = band.ctx.ops.filter((op) => op.m === 'fill').length;
  assert.ok(fills >= 3, 'band ต้องถูกเติมสีหลายช่วงตามจุดตัด EMA7/EMA30 (พบ ' + fills + ')');
  assert.ok(band.ctx.ops.filter((op) => op.m === 'lineTo').length > 100, 'band ต้องลากขอบตามทุกแท่งที่มองเห็น');
  const refp = drawPrim(candles.prims[0], pc.H);
  assert.equal(refp.zo, 'top');
  assert.deepEqual(refp.bad, [], 'ป้าย FV/MOS มีพิกัดที่ไม่ใช่ตัวเลข');
  assert.deepEqual(refp.ctx.ops.filter((op) => op.m === 'fillText').map((op) => op.a[0]), ['FV 112.00', 'MOS 20% 89.60', 'MOS 30% 78.40']);
  const zone = drawPrim(rsiS.prims[0], rc.H);
  assert.deepEqual(zone.bad, []);
  const fr = zone.ctx.ops.filter((op) => op.m === 'fillRect')[0];
  assert.ok(fr && fr.a[3] > 0, 'แถบโซน RSI 30–70 ต้องมีความสูง > 0');

  // ===== 3) legend ตาม crosshair =====
  const legend = E.all('ta-legend')[0];
  assert.ok(legend, 'ต้องมีกล่อง legend ใน pane ราคา');
  pc.crosshair({ time: FIX_D.t[100] });
  const L = legend.innerHTML;
  assert.ok(!/NaN|undefined|Invalid Date/.test(L), 'legend ต้องไม่มี NaN/undefined/Invalid Date — พบ: ' + L);
  assert.ok(L.includes('O <b>' + FIX_D.o[100].toFixed(2) + '</b>') && L.includes('C <b>' + FIX_D.c[100].toFixed(2) + '</b>'), 'legend ต้องโชว์ OHLC ของแท่งที่ชี้ — พบ: ' + L);
  const chg = ((FIX_D.c[100] - FIX_D.c[99]) / FIX_D.c[99]) * 100;
  assert.ok(L.includes((chg >= 0 ? '+' : '') + chg.toFixed(2) + '%'), '% ใน legend ต้องเทียบแท่งก่อนหน้า — พบ: ' + L);
  pc.crosshair({});                                            // เมาส์ออกนอกแท่ง → ล้าง legend
  assert.equal(legend.textContent, '');

  // ===== 4) ปฏิสัมพันธ์: สลับ TF/ช่วง · ซูม · log · รีเซ็ต · บันทึกรูป · toggle =====
  E.btn('W').fire('click');
  assert.equal(candles.data.length, TA.resample(FIX_D, 'W').t.length, 'TF W = แท่งรายสัปดาห์');
  assert.ok(E.btn('W').classList.contains('on') && !E.btn('D').classList.contains('on'));
  assert.ok(E.btn('1Y').classList.contains('on'), 'สลับ TF ต้องย้ายปุ่มช่วงไปที่ค่าเริ่มต้นของ TF นั้น');
  E.btn('1H').fire('click'); E.btn('4H').fire('click');        // กดซ้อนระหว่างโหลด → ผลที่ค้างต้องเป็นของปุ่มล่าสุด (tfSeq)
  await flush();
  assert.ok(E.urls.some((u) => /tf=H$/.test(u)), 'TF ราย ชม. ต้องยิง /api/ohlc?…tf=H');
  assert.equal(candles.data.length, TA.resample(FIX_H, '4H').t.length, 'กด 4H แซง 1H → ต้องได้แท่ง 4H (ทิ้งผลของ request เก่า)');
  assert.ok(!E.btn('1H').disabled && !E.btn('4H').disabled, 'ปุ่มต้องถูกปลด disabled หลังโหลดเสร็จ');
  E.btn('รีเซ็ต').fire('click');
  assert.equal(candles.data.length, ND, 'รีเซ็ต = กลับแท่งรายวัน');
  E.btn('🔍+').fire('click'); E.btn('🔍−').fire('click');
  const lr = pc.logicalRanges[pc.logicalRanges.length - 1];
  assert.ok(lr.to - lr.from >= 8, 'ซูมต้องเหลือช่วง ≥ 8 แท่งเสมอ');
  E.btn('Log').fire('click');
  assert.deepEqual(pc.scaleOpts[pc.scaleOpts.length - 1], { id: 'right', o: { mode: 1 } }, 'ปุ่ม Log = แกนราคา log');
  E.btn('Log').fire('click');
  assert.deepEqual(pc.scaleOpts[pc.scaleOpts.length - 1], { id: 'right', o: { mode: 0 } });
  E.btn('📷').fire('click');
  const shot = E.doc.made.filter((el) => el.tagName === 'canvas').pop();
  assert.ok(shot.width === PANE_W * 2 && shot.height === (300 + 110) * 2, 'ผืนผ้าใบต้องคูณ devicePixelRatio — พบ ' + shot.width + '×' + shot.height);
  const drawn = shot.ctx.ops.filter((op) => op.m === 'drawImage');
  assert.equal(drawn.length, 2, 'ต้อง drawImage canvas ของทั้ง pane ราคาและ RSI');
  assert.ok(!drawn.some((op) => op.a.slice(1).some((x) => !isFinite(x))), 'drawImage ต้องได้พิกัดเป็นตัวเลข');
  const link = E.doc.made.filter((el) => el.tagName === 'a').pop();
  assert.ok(link.download === 'AAPL-chart.png' && /^data:image\/png/.test(link.href) && link.clicks === 1, 'ต้องสั่งดาวน์โหลด PNG ชื่อหุ้น');
  E.tog('EMA7').fire('click'); assert.equal(s7.opts.visible, false, 'ปิด EMA7 → ซ่อน series');
  E.tog('EMA7').fire('click'); assert.equal(s7.opts.visible, true);
  E.tog('Vol').fire('click'); assert.equal(vol.opts.visible, false);
  E.tog('Band').fire('click');
  assert.equal(drawPrim(s7.prims[0], pc.H).ctx.ops.length, 0, 'ปิด Band → primitive ต้องไม่วาดอะไรเลย');
  E.tog('Band').fire('click');
  const rsiPane = E.box.children[2];
  assert.equal(rsiPane.style.height, '110px', 'ลูกที่ 3 ของกล่อง = pane RSI');
  E.tog('RSI').fire('click');
  assert.equal(rsiPane.style.display, 'none', 'ปิด RSI → ซ่อน pane');
  E.btn('📷').fire('click');
  assert.equal(E.doc.made.filter((el) => el.tagName === 'canvas').pop().ctx.ops.filter((op) => op.m === 'drawImage').length, 1, 'ซ่อน pane RSI → รูปต้องมีเฉพาะ pane ราคา');
  const nResize = pc.resizes.length;
  E.ro()([{ target: {} }]);
  assert.ok(pc.resizes.length > nResize && rc.resizes.length > 1, 'ResizeObserver ต้อง resize ทั้งสอง pane');
  assert.deepEqual(E.warns, [], 'ทุกปฏิสัมพันธ์ต้องไม่มี warn (mkBtn/mkTog กลืน exception เป็น console.warn) — พบ: ' + E.warns.join(' | '));

  // ===== 5) เส้นทางล้มเหลว: คงกราฟ SVG เดิม ห้ามมี error UI (C3/C4/C8) =====
  for (const [mode, why] of [['reject', 'network down'], ['http', 'api 503']]) {
    const F = await run({ fetchMode: mode });
    assert.equal(F.box, null, 'fetch ล้ม (' + mode + ') → ห้ามต่อกล่องกราฟ');
    assert.notEqual(F.host.style.display, 'none', 'fetch ล้ม (' + mode + ') → SVG เดิมต้องยังโชว์');
    assert.ok(F.warns.some((w) => w.includes('fallback SVG') && w.includes(why)), 'ต้อง warn เหตุผลไว้ใน console — พบ: ' + F.warns.join(' | '));
  }
  for (const opt of [{ noLib: true }, { noCfg: true }, { noHost: true }]) {
    const F = await run(opt);
    const tag = JSON.stringify(opt);
    assert.equal(F.box, null, tag + ' → ต้องไม่ทำอะไรเลย');
    assert.equal(F.lwc.charts.length, 0, tag + ' → ต้องไม่สร้างกราฟ');
    assert.deepEqual(F.warns, [], tag + ' → ต้องเงียบ (ไม่ใช่ error)');
  }

  // ===== 6) self-check: ฉีดบั๊กจริงแล้วชุด assert ข้างบนต้องจับได้ (กันเทสต์ผ่านลอย ๆ) =====
  for (const [from, to, why] of [
    // อ้าง field ผิด → throw นอก try ของ render → load().catch กลืนเป็น fallback เงียบ ๆ (บั๊กแบบที่ gate เดิมมองไม่เห็น)
    ['var daily = d.bars;', 'var daily = d.barsX;', /Cannot read propert/],
    // ค่าที่ป้อนเข้า series เป็น NaN → ไลบรารีจริงปฏิเสธ ⇒ stub ต้องปฏิเสธด้วย (พิสูจน์ว่าชั้นตรวจข้อมูลไม่ใช่ของประดับ)
    ['TA.ema(daily.c, 7)', 'TA.ema(daily.c, 7).map(function (x) { return x == null ? null : NaN; })', /ต้องเป็นตัวเลขจริง — พบ NaN/],
  ]) {
    const src = TA_CHART_SRC.replace(from, to);
    assert.notEqual(src, TA_CHART_SRC, 'self-check: หา anchor "' + from + '" ไม่เจอ (ta-chart เปลี่ยนโครง? อัปเดต self-check)');
    const M = await run({ src });
    assert.equal(M.box, null, 'self-check: ฉีดบั๊ก "' + from + '" แล้วยังต่อกล่องกราฟได้ — ชุด assert นี้เป็น no-op!');
    assert.ok(M.warns.some((w) => w.includes('fallback SVG') && why.test(w)),
      'self-check: ฉีดบั๊ก "' + from + '" ต้องตกไป fallback ด้วยเหตุ ' + why + ' — พบ: ' + M.warns.join(' | '));
  }

  process.exitCode = 0;
  console.log('✅ ta-engine-test ผ่าน (รวมรัน ta-chart.js ใน mock DOM)');
})().catch((e) => { console.error('✗ ta-chart runtime: ' + ((e && e.stack) || e)); process.exit(1); });
