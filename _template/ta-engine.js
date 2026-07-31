/* ta-engine.js — เครื่องคำนวณ TA ล้วน ๆ (ไม่มี DOM/network) ใช้ทั้ง browser (window.TA) และ node (test)
 * นิยามทั้งหมดตรึงด้วย test/ta-engine-test.js — แก้พฤติกรรมต้องแก้ test พร้อมกัน */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function ema(closes, period) {
    const out = new Array(closes.length).fill(null);
    if (closes.length < period) return out;
    let s = 0;
    for (let i = 0; i < period; i++) s += closes[i];
    out[period - 1] = s / period;                    // seed = SMA
    const k = 2 / (period + 1);
    for (let i = period; i < closes.length; i++) out[i] = closes[i] * k + out[i - 1] * (1 - k);
    return out;
  }

  function rsi(closes, period) {
    period = period || 14;
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) g += d; else l -= d;
    }
    let ag = g / period, al = l / period;
    out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (period - 1) + Math.max(d, 0)) / period;   // Wilder smoothing
      al = (al * (period - 1) + Math.max(-d, 0)) / period;
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
  }

  // fractal pivot: สูง/ต่ำกว่าเพื่อนบ้าน k แท่งทั้งสองข้าง (ยืนยันได้หลังผ่าน k แท่ง — ไม่ repaint)
  function findPivots(highs, lows, k) {
    k = k || 3;
    const pv = [];
    for (let i = k; i < highs.length - k; i++) {
      let isH = true, isL = true;
      for (let j = 1; j <= k; j++) {
        if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isH = false;
        if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isL = false;
        if (!isH && !isL) break;
      }
      if (isH) pv.push({ i, type: 'H', price: highs[i] });
      else if (isL) pv.push({ i, type: 'L', price: lows[i] });
    }
    return pv;
  }

  function labelStructure(pivots) {
    let lastH = null, lastL = null;
    return pivots.map((p) => {
      let label = null;
      if (p.type === 'H') { if (lastH !== null) label = p.price > lastH ? 'HH' : 'LH'; lastH = p.price; }
      else { if (lastL !== null) label = p.price > lastL ? 'HL' : 'LL'; lastL = p.price; }
      return Object.assign({}, p, { label });
    });
  }

  // เดินตามแท่งปิด: ทะลุ swing ตามเทรนด์ = BOS · สวนเทรนด์ครั้งแรก = CHoCH (แล้วพลิกเทรนด์)
  // เทรนด์เริ่มต้น = ทิศจาก pivot คู่แรก (H ก่อน L = down เริ่ม ฯลฯ ใช้ราคา pivot เทียบ)
  function detectBreaks(closes, pivots) {
    if (pivots.length < 2) return [];
    const ev = [];
    let trend = null, refH = null, refL = null; // ref = swing ล่าสุดที่ "ยังไม่ถูกทะลุ"
    let pi = 0;
    for (let i = 0; i < closes.length; i++) {
      while (pi < pivots.length && pivots[pi].i <= i - 1) { // pivot ยืนยันแล้วถึงใช้เป็นแนว
        const p = pivots[pi];
        if (p.type === 'H') refH = { level: p.price, i: p.i }; else refL = { level: p.price, i: p.i };
        if (trend === null && refH && refL) trend = refH.i > refL.i ? 'up' : 'down';
        pi++;
      }
      if (refH && closes[i] > refH.level) {
        ev.push({ i, type: trend === 'up' || trend === null ? 'BOS' : 'CHoCH', dir: 'up', level: refH.level });
        trend = 'up'; refH = null;
      } else if (refL && closes[i] < refL.level) {
        ev.push({ i, type: trend === 'down' || trend === null ? 'BOS' : 'CHoCH', dir: 'down', level: refL.level });
        trend = 'down'; refL = null;
      }
    }
    return ev;
  }

  // regular divergence จาก pivot ราคา 2 ตัวชนิด L (bull) / H (bear) ติดกัน เทียบ RSI ณ แท่งนั้น
  // กรอง 2 ชั้น (บทเรียน AMKR 1 ส.ค. 2569 — user ทักสัญญาณผี):
  //   1) RSI ต้องต่างกัน ≥ 2 จุด — ต่างกันหลักทศนิยม = noise มองบนกราฟไม่เห็น
  //   2) invalidation: ราคาปิดหลัง p2 ทะลุ pivot ของ p2 (bull หลุด low / bear ทะลุ high) = สัญญาณถูกทำลาย ตัดทิ้ง
  const MIN_RSI_DIFF = 2;
  function detectDivergence(closes, rsiArr, pivots) {
    const out = [];
    const byType = (t) => pivots.filter((p) => p.type === t);
    const brokenAfter = (i, price, below) => {
      for (let j = i + 1; j < closes.length; j++)
        if (below ? closes[j] < price : closes[j] > price) return true;
      return false;
    };
    for (const [t, kind] of [['L', 'bull'], ['H', 'bear']]) {
      const ps = byType(t);
      for (let n = 1; n < ps.length; n++) {
        const a = ps[n - 1], b = ps[n];
        const ra = rsiArr[a.i], rb = rsiArr[b.i];
        if (ra == null || rb == null) continue;
        if (kind === 'bull' && b.price < a.price && rb - ra >= MIN_RSI_DIFF && !brokenAfter(b.i, b.price, true))
          out.push({ type: 'bull', p1: { i: a.i, price: a.price, rsi: ra }, p2: { i: b.i, price: b.price, rsi: rb } });
        if (kind === 'bear' && b.price > a.price && ra - rb >= MIN_RSI_DIFF && !brokenAfter(b.i, b.price, false))
          out.push({ type: 'bear', p1: { i: a.i, price: a.price, rsi: ra }, p2: { i: b.i, price: b.price, rsi: rb } });
      }
    }
    return out.sort((x, y) => x.p2.i - y.p2.i);
  }

  // chips สรุปสถานะล่าสุด — ★ ข้อเท็จจริงเชิงเทคนิคเท่านั้น ห้ามใช้คำว่า ซื้อ/ขาย (test บังคับ)
  // ชุด EMA: 7/30 = cross ระยะสั้น · 200 = แนวโน้มระยะยาว (แท่ง <200 → ไม่มี chip EMA200)
  function summarizeSignals(s) {
    const chips = [];
    const last = s.closes.length - 1;
    const e7 = s.ema7[last], e30 = s.ema30[last], e200 = s.ema200[last], r = s.rsiArr[last];
    if (e7 != null && e30 != null) {
      let crossAge = null; // หา cross ล่าสุด
      for (let i = last; i > 0; i--) {
        const a = s.ema7[i - 1], b = s.ema30[i - 1];
        if (a == null || b == null) break;
        if (a <= b !== (s.ema7[i] <= s.ema30[i])) { crossAge = last - i; break; }
      }
      const rel = e7 > e30 ? 'EMA7 > EMA30' : 'EMA7 < EMA30';
      // ไม่ใช้คำ golden/death (user เคาะ 1 ส.ค. 2569) — ทิศบอกด้วย >/< อยู่แล้ว
      const cross = crossAge != null ? ` (cross ${crossAge} แท่งก่อน)` : '';
      chips.push({ label: rel + cross, tone: e7 > e30 ? 'pos' : 'neg' });
    } else chips.push({ label: 'EMA — ข้อมูลไม่พอ', tone: 'neu' });
    if (e200 != null)
      chips.push({ label: s.closes[last] > e200 ? 'ราคา > EMA200' : 'ราคา < EMA200', tone: s.closes[last] > e200 ? 'pos' : 'neg' });
    if (r != null) chips.push({ label: `RSI ${r.toFixed(0)}` + (r >= 70 ? ' — overbought' : r <= 30 ? ' — oversold' : ''), tone: r >= 70 ? 'neg' : r <= 30 ? 'pos' : 'neu' });
    else chips.push({ label: 'RSI — ข้อมูลไม่พอ', tone: 'neu' });
    const lastBrk = s.breaks[s.breaks.length - 1];
    if (lastBrk) chips.push({ label: `${lastBrk.type} ${lastBrk.dir === 'up' ? 'ขาขึ้น' : 'ขาลง'}`, tone: lastBrk.dir === 'up' ? 'pos' : 'neg' });
    const lastDiv = s.divs[s.divs.length - 1];
    if (lastDiv && last - lastDiv.p2.i <= 20)
      chips.push({ label: lastDiv.type === 'bull' ? 'Bullish divergence (RSI)' : 'Bearish divergence (RSI)', tone: lastDiv.type === 'bull' ? 'pos' : 'neg' });
    return chips;
  }

  // รวมแท่งเป็น timeframe ใหญ่ขึ้น: 'D' ผ่านตรง · 'W' สัปดาห์ (เริ่มจันทร์) · 'M' เดือน · 'Y' ปี · '4H' ก้อน 4 ชม.
  // o=แท่งแรก h=max l=min c=แท่งสุดท้าย v=รวม · t=เวลาแท่งแรกของช่วง (period-start)
  function resample(bars, tf) {
    if (tf === 'D') return bars;
    const out = { t: [], o: [], h: [], l: [], c: [], v: [] };
    let key = null;
    for (let i = 0; i < bars.t.length; i++) {
      let k;
      if (tf === 'W') k = Math.floor((Math.floor(bars.t[i] / 86400) - 4) / 7); // epoch เป็นพฤหัส → -4 ให้สัปดาห์เริ่มจันทร์
      else if (tf === '4H') k = Math.floor(bars.t[i] / 14400);
      else {
        const d = new Date(bars.t[i] * 1000);
        k = tf === 'Y' ? d.getUTCFullYear() : d.getUTCFullYear() * 12 + d.getUTCMonth();
      }
      if (k !== key) {
        key = k;
        out.t.push(bars.t[i]); out.o.push(bars.o[i]); out.h.push(bars.h[i]);
        out.l.push(bars.l[i]); out.c.push(bars.c[i]); out.v.push(bars.v[i]);
      } else {
        const j = out.t.length - 1;
        out.h[j] = Math.max(out.h[j], bars.h[i]);
        out.l[j] = Math.min(out.l[j], bars.l[i]);
        out.c[j] = bars.c[i];
        out.v[j] += bars.v[i];
      }
    }
    return out;
  }

  return { ema, rsi, findPivots, labelStructure, detectBreaks, detectDivergence, summarizeSignals, resample };
});
