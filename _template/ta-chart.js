/* ta-chart.js — สลับกราฟ SVG เดิมเป็นกราฟ TA แบบ TradingView (progressive enhancement)
 * กติกาความต่อเนื่อง (spec C1-C8): ล้มเหลวทุกกรณี = คงกราฟ SVG เดิมไว้ ห้ามมี error UI
 * ลูกเล่น (user เคาะ 1 ส.ค. 2569): TF 1H/4H/D/W · ปุ่ม range (default 6M) /ซูม/รีเซ็ต · OHLC legend · toggle indicator · log scale · บันทึกรูป
 * chips สัญญาณตรึงคำนวณจากแท่งรายวันเสมอ (บทสรุปมาตรฐานของรายงาน ไม่แกว่งตาม TF ที่กดเล่น) */
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

  function fetchOhlc(tf, ms) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms || 6000);
    return fetch('/api/ohlc/' + encodeURIComponent(CFG.sym) + '?cur=' + CFG.cur + '&tf=' + tf, { signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error('api ' + r.status); return r.json(); })
      .finally(function () { clearTimeout(timer); });
  }

  function load() {
    fetchOhlc('D')                                                   // C3: timeout 6 วิ
      .then(function (d) { render(d); })
      .catch(function (e) { console.warn('[ta-chart] fallback SVG:', e.message); }); // C3/C4
  }

  function render(d) {
    var daily = d.bars;
    var nD = daily.t.length;
    // สัญญาณสรุป (chips) คำนวณจากรายวันครั้งเดียว — ไม่เปลี่ยนตาม TF
    var dEma7 = TA.ema(daily.c, 7), dEma30 = TA.ema(daily.c, 30), dEma200 = TA.ema(daily.c, 200), dRsi = TA.rsi(daily.c, 14);
    var pivots = TA.labelStructure(TA.findPivots(daily.h, daily.l, 3));
    var breaks = nD >= 60 ? TA.detectBreaks(daily.c, pivots) : [];   // C6: ข้อมูลบาง → ข้ามโครงสร้าง
    var divs = nD >= 60 ? TA.detectDivergence(daily.c, dRsi, pivots) : [];

    // มุมมองปัจจุบัน (เปลี่ยนตาม TF) — primitive/legend อ่านจาก view เสมอ
    var view = { tf: 'D', b: daily, ema7: dEma7, ema30: dEma30, ema200: dEma200, rsi: dRsi, idx: {}, showBand: true };
    var hourly = null;                                               // แท่งรายชั่วโมง โหลดครั้งแรกที่กด 1H/4H

    // C2: สร้างนอกจอให้เสร็จ แล้ว swap ครั้งเดียว — SVG เดิมแค่ซ่อน (print/fallback ยังใช้ได้)
    var box = document.createElement('div');
    box.className = 'ta-box';
    // จอแคบ SVG หดตาม aspect (920:300) เหลือ ~100px — ห้ามใช้ตรง ๆ ไม่งั้น pane เตี้ยจน LWC วางป้ายแกนเพี้ยน → ขั้นต่ำ 240px
    var priceEl = document.createElement('div'); priceEl.style.height = Math.max(240, Math.round(wrap.getBoundingClientRect().height || 300)) + 'px';
    priceEl.style.position = 'relative';
    var rsiEl = document.createElement('div'); rsiEl.style.height = '110px';

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
    // ลายน้ำ: ชื่อหุ้นตัวใหญ่ + โดเมนเว็บ ชิดบนกลางกราฟ — สีจางไม่บังแท่ง (v5 createTextWatermark)
    if (LWC.createTextWatermark && chart.panes) LWC.createTextWatermark(chart.panes()[0], {
      horzAlign: 'center', vertAlign: 'top',
      lines: [
        { text: CFG.sym, color: 'rgba(107,115,131,.16)', fontSize: 44, fontStyle: 'bold', fontFamily: 'IBM Plex Mono, monospace' },
        // โดเมน auto-detect จาก URL ที่เปิดอยู่ — ย้าย/แมพโดเมนใหม่ในอนาคต ลายน้ำเปลี่ยนตามเอง ไม่ต้องแก้โค้ด
        { text: (location.hostname || 'stock-ai.dotent.workers.dev'), color: 'rgba(107,115,131,.15)', fontSize: 13, fontFamily: 'IBM Plex Mono, monospace' },
      ],
    });
    var candles = chart.addSeries(LWC.CandlestickSeries, {
      upColor: '#137333', downColor: '#c5221f', borderVisible: false, wickUpColor: '#137333', wickDownColor: '#c5221f',
      priceFormat: { type: 'price', precision: CFG.dec, minMove: Math.pow(10, -CFG.dec) },
    });
    var vol = chart.addSeries(LWC.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, color: 'rgba(107,115,131,.25)' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    function line(el, color, width) {
      return el.addSeries(LWC.LineSeries, { color: color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    }
    // EMA 7 เขียว / 30 แดง เส้นบางสุด · EMA200 น้ำเงิน หนา +1 (แนวโน้มระยะยาว)
    var s7 = line(chart, '#137333', 1), s30 = line(chart, '#c5221f', 1), s200 = line(chart, '#1a73e8', 2);

    // แถบพื้นระหว่าง EMA7↔EMA30: เขียวอ่อนช่วง 7 อยู่เหนือ 30 / แดงอ่อนช่วงอยู่ใต้ (จางพอไม่บังแท่ง)
    // วาดด้วย series primitive (zOrder bottom = อยู่หลังทุก series) — อ่านจาก view สด รองรับ pan/zoom/สลับ TF
    var bandPrim = {
      updateAllViews: function () {},
      paneViews: function () {
        return [{
          zOrder: function () { return 'bottom'; },
          renderer: function () {
            return {
              draw: function (target) {
                if (!view.showBand) return;
                target.useMediaCoordinateSpace(function (scope) {
                  var ctx = scope.context;
                  var ts = chart.timeScale();
                  var pb = [];
                  for (var i = 0; i < view.b.t.length; i++) {
                    if (view.ema7[i] == null || view.ema30[i] == null) continue;
                    var x = ts.timeToCoordinate(view.b.t[i]);
                    if (x == null) continue; // นอกจอ — ช่วงที่เห็นเป็น run ต่อเนื่องเสมอ
                    var y7 = s7.priceToCoordinate(view.ema7[i]), y30 = s7.priceToCoordinate(view.ema30[i]);
                    if (y7 == null || y30 == null) continue;
                    pb.push({ x: x, y7: y7, y30: y30, d: view.ema7[i] - view.ema30[i] });
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

    // เส้นอ้างอิงมูลค่า: FV + ระดับส่วนเผื่อ 20%/30% — ไม่ใช้ axis label (ซ้อนกันบังกราฟ) →
    // เขียนชื่อ+ค่าบนเส้นเองผ่าน primitive ชิดขวา (LWC ไม่วาด title ในกราฟเมื่อปิด axis label — วัดจริง)
    var refs = [
      { p: CFG.fv, c: '#1e8e3e', style: 2, t: 'FV ' + CFG.fv.toFixed(CFG.dec) },
      { p: CFG.fv * 0.8, c: '#b06000', style: 1, t: 'MOS 20% ' + (CFG.fv * 0.8).toFixed(CFG.dec) },
      { p: CFG.fv * 0.7, c: '#137333', style: 1, t: 'MOS 30% ' + (CFG.fv * 0.7).toFixed(CFG.dec) },
    ];
    refs.forEach(function (rf) {
      candles.createPriceLine({ price: rf.p, color: rf.c, lineStyle: rf.style, lineWidth: 1, axisLabelVisible: false, title: '' });
    });
    var refPrim = {
      updateAllViews: function () {},
      paneViews: function () {
        return [{
          zOrder: function () { return 'top'; },
          renderer: function () {
            return {
              draw: function (target) {
                target.useMediaCoordinateSpace(function (scope) {
                  var ctx = scope.context;
                  ctx.font = '9px "IBM Plex Mono", monospace';
                  ctx.textBaseline = 'bottom'; ctx.textAlign = 'right';
                  refs.forEach(function (rf) {
                    var y = candles.priceToCoordinate(rf.p);
                    if (y == null || y < 10 || y > scope.mediaSize.height - 2) return; // เส้นหลุดจอ = ไม่เขียน
                    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;       // ขอบขาวให้อ่านออกบนแท่ง
                    ctx.strokeText(rf.t, scope.mediaSize.width - 14, y - 2);
                    ctx.fillStyle = rf.c;
                    ctx.fillText(rf.t, scope.mediaSize.width - 14, y - 2);
                  });
                });
              },
            };
          },
        }];
      },
    };
    if (candles.attachPrimitive) candles.attachPrimitive(refPrim);

    // โลโก้ TradingView แสดงที่ price pane เดียวพอ (attribution ครบด้วย .ta-attr) — pane RSI ปิดไม่ให้ซ้ำ
    var rsiChart = LWC.createChart(rsiEl, Object.assign({}, base, {
      layout: Object.assign({}, base.layout, { attributionLogo: false }),
      rightPriceScale: { borderColor: '#eef1f5' },
    }));
    var rsiSeries = line(rsiChart, '#7b1fa2', 2);
    [30, 70].forEach(function (lv) { rsiSeries.createPriceLine({ price: lv, color: '#c9ced6', lineStyle: 3, lineWidth: 1, title: String(lv) }); });
    // เส้น divergence อิง index รายวัน — โชว์เฉพาะ TF D (TF อื่นแกนเวลาไม่ตรงกัน)
    var divSeries = divs.map(function (dv) {
      var s = rsiChart.addSeries(LWC.LineSeries, { color: dv.type === 'bull' ? '#137333' : '#c5221f', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      s.setData([{ time: daily.t[dv.p1.i], value: dv.p1.rsi }, { time: daily.t[dv.p2.i], value: dv.p2.rsi }]);
      return s;
    });
    chart.timeScale().subscribeVisibleTimeRangeChange(function (r) { if (r) try { rsiChart.timeScale().setVisibleRange(r); } catch (_) {} });

    // ── view จัดการข้อมูลตาม TF ──
    var pts = function (arr) { return view.b.t.map(function (t, i) { return arr[i] == null ? null : { time: t, value: arr[i] }; }).filter(Boolean); };
    function applyView() {
      var b = view.b;
      candles.setData(b.t.map(function (t, i) { return { time: t, open: b.o[i], high: b.h[i], low: b.l[i], close: b.c[i] }; }));
      vol.setData(b.t.map(function (t, i) { return { time: t, value: b.v[i] }; }));
      s7.setData(pts(view.ema7)); s30.setData(pts(view.ema30)); s200.setData(pts(view.ema200));
      rsiSeries.setData(pts(view.rsi));
      view.idx = {};
      b.t.forEach(function (t, i) { view.idx[t] = i; });
      divSeries.forEach(function (s) { s.applyOptions({ visible: view.tf === 'D' }); });
    }
    function setBars(tf, bars) {
      view.tf = tf; view.b = bars;
      view.ema7 = TA.ema(bars.c, 7); view.ema30 = TA.ema(bars.c, 30); view.ema200 = TA.ema(bars.c, 200);
      view.rsi = TA.rsi(bars.c, 14);
      applyView();
    }
    // ช่วงมองเห็นตามจำนวนเดือน ('all' = ทั้งหมด) — คิดจากเวลา ใช้ได้ทุก TF
    function setRangeMonths(mo) {
      var b = view.b, last = b.t.length - 1;
      if (last < 1) return;
      if (mo === 'all') { chart.timeScale().fitContent(); rsiChart.timeScale().fitContent(); return; }
      var from = Math.max(b.t[0], b.t[last] - mo * 2629800);
      [chart, rsiChart].forEach(function (c) { c.timeScale().setVisibleRange({ from: from, to: b.t[last] }); });
    }
    var TF_DEF_RANGE = { '1H': 1, '4H': 3, D: 6, W: 12 };            // range เริ่มต้นเมื่อสลับ TF
    function setTF(tf, btn) {
      var done = function (bars) {
        setBars(tf, bars); setRangeMonths(TF_DEF_RANGE[tf]);
        markOn(tfWrap, btn); markOn(rangeWrap, rangeBtns[TF_DEF_RANGE[tf]] || null);
      };
      if (tf === 'D') return done(daily);
      if (tf === 'W') return done(TA.resample(daily, 'W'));
      if (hourly) return done(tf === '4H' ? TA.resample(hourly, '4H') : hourly);
      btn.disabled = true;
      fetchOhlc('H', 8000).then(function (d2) {
        hourly = d2.bars;
        done(tf === '4H' ? TA.resample(hourly, '4H') : hourly);
      }).catch(function (e) {
        console.warn('[ta-chart] โหลดข้อมูลรายชั่วโมงไม่ได้ — คงมุมมองเดิม:', e.message);
      }).finally(function () { btn.disabled = false; });
    }

    // ── toolbar ──
    function mkBtn(txt, title, fn) {
      var el = document.createElement('button');
      el.type = 'button'; el.className = 'ta-btn'; el.textContent = txt; el.title = title || '';
      el.addEventListener('click', function () { try { fn(el); } catch (e) { console.warn('[ta-chart]', e.message); } });
      return el;
    }
    function group(cls) { var g = document.createElement('span'); g.className = 'ta-tgroup' + (cls ? ' ' + cls : ''); return g; }
    function markOn(g, btn) { [].forEach.call(g.children, function (c) { c.classList.remove('on'); }); if (btn) btn.classList.add('on'); }

    var toolbar = document.createElement('div'); toolbar.className = 'ta-toolbar';
    var tfWrap = group();
    [['1H', '1H'], ['4H', '4H'], ['D', 'D'], ['W', 'W']].forEach(function (t) {
      var btn = mkBtn(t[0], 'timeframe ' + t[0], function (el) { setTF(t[1], el); });
      if (t[1] === 'D') btn.classList.add('on');
      tfWrap.appendChild(btn);
    });
    var rangeWrap = group(), rangeBtns = {};
    [['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['3Y', 36]].forEach(function (r) {
      var btn = mkBtn(r[0], 'ดูย้อนหลัง ' + r[0], function (el) { setRangeMonths(r[1]); markOn(rangeWrap, el); });
      if (r[1] === 6) btn.classList.add('on');                       // default = 6M (active ตั้งแต่โหลด)
      rangeBtns[r[1]] = btn;
      rangeWrap.appendChild(btn);
    });
    var actWrap = group('ta-acts');
    // ปุ่มแว่นขยาย: ซูมยึดขอบขวา (แท่งล่าสุดคาที่เดิม) — user เคาะแบบปุ่มแทน Ctrl+scroll
    function zoom(factor) {
      var ts = chart.timeScale();
      var lr = ts.getVisibleLogicalRange();
      if (!lr) return;
      var span = (lr.to - lr.from) * factor;
      ts.setVisibleLogicalRange({ from: lr.to - Math.max(8, span), to: lr.to });
      markOn(rangeWrap, null);
    }
    actWrap.appendChild(mkBtn('🔍−', 'ซูมออก', function () { zoom(1.5); }));
    actWrap.appendChild(mkBtn('🔍+', 'ซูมเข้า', function () { zoom(1 / 1.5); }));
    actWrap.appendChild(mkBtn('รีเซ็ต', 'กลับมุมมองเริ่มต้น (TF D · 6 เดือน)', function () {
      setBars('D', daily); setRangeMonths(6);
      markOn(tfWrap, tfWrap.children[2]); markOn(rangeWrap, rangeBtns[6]);
    }));
    var logOn = false;
    actWrap.appendChild(mkBtn('Log', 'สลับแกนราคา log/linear', function (el) {
      logOn = !logOn;
      chart.priceScale('right').applyOptions({ mode: logOn ? 1 : 0 });
      el.classList.toggle('on', logOn);
    }));
    // บันทึกรูป: compose จาก canvas จริงบนจอ (WYSIWYG — takeScreenshot() ของ LWC re-render เอง
    // แล้วป้าย FV/MOS/band/ลายน้ำที่วาดผ่าน primitive หายจากรูป — user เจอ 1 ส.ค. 2569)
    actWrap.appendChild(mkBtn('📷', 'บันทึกรูปกราฟ (PNG)', function () {
      var dpr = window.devicePixelRatio || 1;
      var parts = [priceEl];
      if (rsiEl.style.display !== 'none') parts.push(rsiEl);
      var W = 0, H = 0;
      parts.forEach(function (el) { var r = el.getBoundingClientRect(); W = Math.max(W, r.width); H += r.height; });
      var cv = document.createElement('canvas');
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      var cx = cv.getContext('2d');
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
      var yOff = 0;
      parts.forEach(function (el) {
        var baseR = el.getBoundingClientRect();
        el.querySelectorAll('canvas').forEach(function (c2) {
          var r = c2.getBoundingClientRect();
          cx.drawImage(c2, Math.round((r.left - baseR.left) * dpr), Math.round((r.top - baseR.top) * dpr) + yOff, Math.round(r.width * dpr), Math.round(r.height * dpr));
        });
        yOff += Math.round(baseR.height * dpr);
      });
      var a = document.createElement('a');
      a.download = CFG.sym + '-chart.png'; a.href = cv.toDataURL('image/png'); a.click();
    }));
    toolbar.appendChild(tfWrap); toolbar.appendChild(rangeWrap); toolbar.appendChild(actWrap);

    // ── OHLC legend ตาม crosshair (มุมซ้ายบนของ pane ราคา) ──
    var legend = document.createElement('div'); legend.className = 'ta-legend';
    priceEl.appendChild(legend);
    var thDate = function (t) {
      var dt = new Date(t * 1000);
      var s = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
      if (view.tf === '1H' || view.tf === '4H') s += ' ' + dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      return s;
    };
    chart.subscribeCrosshairMove(function (param) {
      var i = param && param.time != null ? view.idx[param.time] : undefined;
      if (i == null) { legend.textContent = ''; return; }
      var b = view.b;
      var prev = i > 0 ? b.c[i - 1] : b.o[i];
      var chg = prev ? ((b.c[i] - prev) / prev) * 100 : 0;
      var f = function (v) { return v.toFixed(CFG.dec); };
      legend.innerHTML = thDate(b.t[i]) + '  O <b>' + f(b.o[i]) + '</b> H <b>' + f(b.h[i]) + '</b> L <b>' + f(b.l[i]) + '</b> C <b>' + f(b.c[i]) +
        '</b> <span style="color:' + (chg >= 0 ? '#137333' : '#c5221f') + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</span>';
    });

    // ── toggle indicator ──
    var togWrap = document.createElement('div'); togWrap.className = 'ta-toggles';
    function mkTog(txt, init, fn) {
      var el = document.createElement('button');
      el.type = 'button'; el.className = 'ta-tog' + (init ? '' : ' off'); el.textContent = txt;
      el.addEventListener('click', function () {
        var on = el.classList.toggle('off') === false;
        try { fn(on); } catch (e) { console.warn('[ta-chart]', e.message); }
      });
      togWrap.appendChild(el);
    }
    mkTog('EMA7', true, function (on) { s7.applyOptions({ visible: on }); });
    mkTog('EMA30', true, function (on) { s30.applyOptions({ visible: on }); });
    mkTog('EMA200', true, function (on) { s200.applyOptions({ visible: on }); });
    mkTog('Band', true, function (on) { view.showBand = on; chart.timeScale().applyOptions({}); }); // applyOptions เปล่า = บังคับ repaint
    mkTog('Vol', true, function (on) { vol.applyOptions({ visible: on }); });
    mkTog('RSI', true, function (on) { rsiEl.style.display = on ? '' : 'none'; });

    box.appendChild(toolbar); box.appendChild(priceEl); box.appendChild(rsiEl); box.appendChild(togWrap);

    // chips สรุปสัญญาณ + attribution (เงื่อนไข license) — ต่อท้ายในการ swap เดียวกัน (C2)
    var chips = TA.summarizeSignals({ closes: daily.c, ema7: dEma7, ema30: dEma30, ema200: dEma200, rsiArr: dRsi, breaks: breaks, divs: divs });
    var bar = document.createElement('div'); bar.className = 'ta-chips';
    chips.forEach(function (c) { var el = document.createElement('span'); el.className = 'ta-chip ' + c.tone; el.textContent = c.label; bar.appendChild(el); });
    var attr = document.createElement('span'); attr.className = 'ta-attr';
    attr.innerHTML = 'chart: <a href="https://www.tradingview.com/" rel="noopener" target="_blank">TradingView Lightweight Charts™</a> · สัญญาณคำนวณอัตโนมัติ ไม่ใช่คำแนะนำการลงทุน';
    bar.appendChild(attr);
    box.appendChild(bar);

    applyView();

    // C2/C3: swap แล้วต้องกลับได้ — พังตรงไหนหลังจากนี้ = ถอน box คืน SVG เดิมเสมอ
    try {
      host.style.display = 'none';                                   // C8: ซ่อน ไม่ลบ (print โชว์กลับด้วย CSS)
      wrap.appendChild(box);
      // priceEl/rsiEl ยังไม่อยู่ใน DOM ตอน createChart() ด้านบน (สร้างนอกจอจริง ๆ = detached) →
      // clientWidth/Height ตอนนั้น = 0 ทำให้ canvas ได้ขนาดผิด (สูงเกือบ 0) ต้อง resize() ให้ถูกทันทีหลัง attach จริง
      chart.resize(priceEl.clientWidth, priceEl.clientHeight);
      rsiChart.resize(rsiEl.clientWidth, rsiEl.clientHeight);
      setRangeMonths(6);                                             // มุมมองเริ่มต้น 6 เดือน (ตรงปุ่ม 6M ที่ active)
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
