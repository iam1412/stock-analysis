/* ta-chart.js — สลับกราฟ SVG เดิมเป็นกราฟ TA แบบ TradingView (progressive enhancement)
 * กติกาความต่อเนื่อง (spec C1-C8): ล้มเหลวทุกกรณี = คงกราฟ SVG เดิมไว้ ห้ามมี error UI */
(function () {
  'use strict';
  var CFG = window.__TA_CFG__;
  if (!CFG || !window.LightweightCharts || !window.TA) return;      // C8: no-JS/บอต = ไม่ทำอะไร
  var host = document.getElementById('priceChart');
  if (!host) return;
  var wrap = host.closest('.chart-wrap') || host.parentElement;

  // C1: เริ่มงานเมื่อ section ใกล้จอ (ไม่แย่ง bandwidth ตอน first paint)
  var io = new IntersectionObserver(function (es) {
    if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
  }, { rootMargin: '400px' });
  io.observe(wrap);

  function load() {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 6000);     // C3: timeout 6 วิ
    fetch('/api/ohlc/' + encodeURIComponent(CFG.sym) + '?cur=' + CFG.cur, { signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error('api ' + r.status); return r.json(); })
      .then(function (d) { clearTimeout(timer); render(d); })
      .catch(function (e) { clearTimeout(timer); console.warn('[ta-chart] fallback SVG:', e.message); }); // C3/C4
  }

  function render(d) {
    var b = d.bars, n = b.t.length;
    var ema7 = TA.ema(b.c, 7), ema30 = TA.ema(b.c, 30), ema200 = TA.ema(b.c, 200), rsiArr = TA.rsi(b.c, 14);
    var pivots = TA.labelStructure(TA.findPivots(b.h, b.l, 3));
    var breaks = n >= 60 ? TA.detectBreaks(b.c, pivots) : [];       // C6: ข้อมูลบาง → ข้ามโครงสร้าง
    var divs = n >= 60 ? TA.detectDivergence(b.c, rsiArr, pivots) : [];

    // C2: สร้างนอกจอให้เสร็จ แล้ว swap ครั้งเดียว — SVG เดิมแค่ซ่อน (print/fallback ยังใช้ได้)
    var box = document.createElement('div');
    box.className = 'ta-box';
    // จอแคบ SVG หดตาม aspect (920:300) เหลือ ~100px — ห้ามใช้ตรง ๆ ไม่งั้น pane เตี้ยจน LWC วางป้ายแกนเพี้ยน → ขั้นต่ำ 240px
    var priceEl = document.createElement('div'); priceEl.style.height = Math.max(240, Math.round(wrap.getBoundingClientRect().height || 300)) + 'px';
    var rsiEl = document.createElement('div'); rsiEl.style.height = '110px';
    box.appendChild(priceEl); box.appendChild(rsiEl);

    var base = {
      layout: { background: { color: 'transparent' }, textColor: '#6b7383', fontFamily: 'IBM Plex Mono, monospace', attributionLogo: true },
      grid: { vertLines: { color: '#eef1f5' }, horzLines: { color: '#eef1f5' } },
      timeScale: { borderColor: '#eef1f5' }, rightPriceScale: { borderColor: '#eef1f5' },
      localization: { locale: 'th-TH' },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, // C5
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },                            // C5
    };
    var LWC = window.LightweightCharts;
    var chart = LWC.createChart(priceEl, base);
    var candles = chart.addSeries(LWC.CandlestickSeries, {
      upColor: '#137333', downColor: '#c5221f', borderVisible: false, wickUpColor: '#137333', wickDownColor: '#c5221f',
      priceFormat: { type: 'price', precision: CFG.dec, minMove: Math.pow(10, -CFG.dec) },
    });
    candles.setData(b.t.map(function (t, i) { return { time: t, open: b.o[i], high: b.h[i], low: b.l[i], close: b.c[i] }; }));
    var vol = chart.addSeries(LWC.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, color: 'rgba(107,115,131,.25)' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(b.t.map(function (t, i) { return { time: t, value: b.v[i] }; }));
    function line(el, data, color, width) {
      var s = el.addSeries(LWC.LineSeries, { color: color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(data); return s;
    }
    var pts = function (arr) { return b.t.map(function (t, i) { return arr[i] == null ? null : { time: t, value: arr[i] }; }).filter(Boolean); };
    // EMA 7 เขียว / 30 แดง เส้นบางสุด · EMA200 น้ำเงิน หนา +1 (แนวโน้มระยะยาว)
    line(chart, pts(ema7), '#137333', 1);
    line(chart, pts(ema30), '#c5221f', 1);
    line(chart, pts(ema200), '#1a73e8', 2);
    // เส้นอ้างอิงมูลค่า: FV + ระดับราคาที่มีส่วนเผื่อ 20%/30% (โซนสีตามเครื่องคิดเลข MOS ใน engine เดิม)
    candles.createPriceLine({ price: CFG.fv, color: '#1e8e3e', lineStyle: 2, lineWidth: 1, title: 'FV' });
    candles.createPriceLine({ price: CFG.fv * 0.8, color: '#b06000', lineStyle: 1, lineWidth: 1, title: 'MOS 20%' });
    candles.createPriceLine({ price: CFG.fv * 0.7, color: '#137333', lineStyle: 1, lineWidth: 1, title: 'MOS 30%' });
    // โครงสร้างราคา (pivots/BOS/CHoCH) ไม่วาด marker บนกราฟแล้ว — สรุปเป็น chips ด้านล่างอย่างเดียว

    // โลโก้ TradingView แสดงที่ price pane เดียวพอ (attribution ครบด้วย .ta-attr) — pane RSI ปิดไม่ให้ซ้ำ
    var rsiChart = LWC.createChart(rsiEl, Object.assign({}, base, {
      layout: Object.assign({}, base.layout, { attributionLogo: false }),
      rightPriceScale: { borderColor: '#eef1f5' },
    }));
    var rsiSeries = line(rsiChart, pts(rsiArr), '#7b1fa2', 2);
    [30, 70].forEach(function (lv) { rsiSeries.createPriceLine({ price: lv, color: '#c9ced6', lineStyle: 3, lineWidth: 1, title: String(lv) }); });
    divs.forEach(function (dv) {
      var s = rsiChart.addSeries(LWC.LineSeries, { color: dv.type === 'bull' ? '#137333' : '#c5221f', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      s.setData([{ time: b.t[dv.p1.i], value: dv.p1.rsi }, { time: b.t[dv.p2.i], value: dv.p2.rsi }]);
    });

    // sync แกนเวลา 2 pane + แสดงเต็มช่วงข้อมูลที่ดึงได้ (~2 ปี) — ไม่ fix 1 ปีแล้ว (user เคาะ 1 ส.ค. 2569)
    [chart, rsiChart].forEach(function (c) { c.timeScale().fitContent(); });
    chart.timeScale().subscribeVisibleTimeRangeChange(function (r) { if (r) rsiChart.timeScale().setVisibleRange(r); });

    // chips สรุปสัญญาณ + attribution (เงื่อนไข license) — ต่อท้ายในการ swap เดียวกัน (C2)
    var chips = TA.summarizeSignals({ closes: b.c, ema7: ema7, ema30: ema30, ema200: ema200, rsiArr: rsiArr, breaks: breaks, divs: divs });
    var bar = document.createElement('div'); bar.className = 'ta-chips';
    chips.forEach(function (c) { var el = document.createElement('span'); el.className = 'ta-chip ' + c.tone; el.textContent = c.label; bar.appendChild(el); });
    var attr = document.createElement('span'); attr.className = 'ta-attr';
    attr.innerHTML = 'chart: <a href="https://www.tradingview.com/" rel="noopener" target="_blank">TradingView Lightweight Charts™</a> · สัญญาณคำนวณอัตโนมัติ ไม่ใช่คำแนะนำการลงทุน';
    bar.appendChild(attr);
    box.appendChild(bar);

    // C2/C3: swap แล้วต้องกลับได้ — พังตรงไหนหลังจากนี้ = ถอน box คืน SVG เดิมเสมอ
    try {
      host.style.display = 'none';                                   // C8: ซ่อน ไม่ลบ (print โชว์กลับด้วย CSS)
      wrap.appendChild(box);
      // priceEl/rsiEl ยังไม่อยู่ใน DOM ตอน createChart() ด้านบน (สร้างนอกจอจริง ๆ = detached) →
      // clientWidth/Height ตอนนั้น = 0 ทำให้ canvas ได้ขนาดผิด (สูงเกือบ 0) ต้อง resize() ให้ถูกทันทีหลัง attach จริง
      chart.resize(priceEl.clientWidth, priceEl.clientHeight);
      rsiChart.resize(rsiEl.clientWidth, rsiEl.clientHeight);
      new ResizeObserver(function () {
        chart.resize(priceEl.clientWidth, priceEl.clientHeight);
        rsiChart.resize(rsiEl.clientWidth, rsiEl.clientHeight);
      }).observe(priceEl);
    } catch (e) {
      box.remove();
      host.style.display = '';
      console.warn('[ta-chart] fallback SVG (post-swap):', e.message);
    }
  }
})();
