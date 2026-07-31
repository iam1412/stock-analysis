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
    // ลายน้ำกลางกราฟ: ชื่อหุ้นตัวใหญ่ + โดเมนเว็บบรรทัดล่าง — สีจางไม่บังแท่ง (v5 createTextWatermark)
    if (LWC.createTextWatermark && chart.panes) LWC.createTextWatermark(chart.panes()[0], {
      horzAlign: 'center', vertAlign: 'top',
      lines: [
        { text: CFG.sym, color: 'rgba(107,115,131,.16)', fontSize: 44, fontStyle: 'bold', fontFamily: 'IBM Plex Mono, monospace' },
        { text: 'stock-ai.dotent.workers.dev', color: 'rgba(107,115,131,.15)', fontSize: 13, fontFamily: 'IBM Plex Mono, monospace' },
      ],
    });
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
    var s7 = line(chart, pts(ema7), '#137333', 1);
    line(chart, pts(ema30), '#c5221f', 1);
    line(chart, pts(ema200), '#1a73e8', 2);

    // แถบพื้นระหว่าง EMA7↔EMA30: เขียวอ่อนช่วง 7 อยู่เหนือ 30 / แดงอ่อนช่วงอยู่ใต้ (จางพอไม่บังแท่ง)
    // วาดด้วย series primitive (zOrder bottom = อยู่หลังทุก series) — คำนวณพิกัดสดทุกเฟรม รองรับ pan/zoom
    var bandPrim = {
      updateAllViews: function () {},
      paneViews: function () {
        return [{
          zOrder: function () { return 'bottom'; },
          renderer: function () {
            return {
              draw: function (target) {
                target.useMediaCoordinateSpace(function (scope) {
                  var ctx = scope.context;
                  var ts = chart.timeScale();
                  var pb = [];
                  for (var i = 0; i < n; i++) {
                    if (ema7[i] == null || ema30[i] == null) continue;
                    var x = ts.timeToCoordinate(b.t[i]);
                    if (x == null) continue; // นอกจอ — ช่วงที่เห็นเป็น run ต่อเนื่องเสมอ
                    var y7 = s7.priceToCoordinate(ema7[i]), y30 = s7.priceToCoordinate(ema30[i]);
                    if (y7 == null || y30 == null) continue;
                    pb.push({ x: x, y7: y7, y30: y30, d: ema7[i] - ema30[i] });
                  }
                  function fillRun(run, up) {
                    if (run.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(run[0].x, run[0].y7);
                    for (var j = 1; j < run.length; j++) ctx.lineTo(run[j].x, run[j].y7);
                    for (var k2 = run.length - 1; k2 >= 0; k2--) ctx.lineTo(run[k2].x, run[k2].y30);
                    ctx.closePath();
                    ctx.fillStyle = up ? 'rgba(19,115,51,.12)' : 'rgba(197,34,31,.12)';
                    ctx.fill();
                  }
                  var run = [], up = null;
                  for (var k = 0; k < pb.length; k++) {
                    var p = pb[k], sgn = p.d >= 0;
                    if (up === null) up = sgn;
                    if (sgn !== up) { // ตัดกันระหว่างแท่ง — หาจุดตัดเชิงเส้นแล้วปิด run เดิม เริ่ม run ใหม่
                      var q = pb[k - 1];
                      var r = q.d === p.d ? 0 : q.d / (q.d - p.d);
                      var xi = q.x + (p.x - q.x) * r, yi = q.y7 + (p.y7 - q.y7) * r;
                      run.push({ x: xi, y7: yi, y30: yi });
                      fillRun(run, up);
                      run = [{ x: xi, y7: yi, y30: yi }];
                      up = sgn;
                    }
                    run.push(p);
                  }
                  fillRun(run, up);
                });
              },
            };
          },
        }];
      },
    };
    if (s7.attachPrimitive) s7.attachPrimitive(bandPrim);
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

    // sync แกนเวลา 2 pane · viewport เริ่มต้น = หลัง warm-up EMA200 (แท่งที่ 200 เป็นต้นไป → เส้นน้ำเงินเต็มจอ)
    // เลื่อนย้อนดูช่วง warm-up ได้ · ข้อมูลสั้น (IPO) = โชว์ทั้งหมด
    if (n > 220) [chart, rsiChart].forEach(function (c) { c.timeScale().setVisibleRange({ from: b.t[199], to: b.t[n - 1] }); });
    else [chart, rsiChart].forEach(function (c) { c.timeScale().fitContent(); });
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
