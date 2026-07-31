# TA Chart System — Design (ทาง A: Worker API + client-side TA engine)

วันที่: 1 ส.ค. 2569 (2026-08-01) · สถานะ: user อนุมัติทาง A แล้ว

## เป้าหมาย

ยกระดับ section 2 "ราคาย้อนหลัง ~1 ปี" ของรายงานทุกตัว (784 ไฟล์) เป็นกราฟ
TradingView-style: แท่งเทียนรายวัน + volume + EMA 7/30/200 + RSI 14 + เส้น FV/MOS 20%/MOS 30%
+ โครงสร้างราคาอัตโนมัติ (BOS, CHoCH, RSI divergence) **สรุปเป็นแถบสัญญาณใต้กราฟเท่านั้น
ไม่วาด marker บนกราฟ** (ปรับตาม feedback user 1 ส.ค. 2569 — เดิมวาด HH/LL/BOS/CHoCH บนกราฟ)
— **โดยไม่แก้ไฟล์รายงานแม้แต่ไฟล์เดียว ไม่ใช้ token ของ agent ต่อหุ้น และผู้ใช้
ไม่มีทางเห็นหน้าพัง** (progressive enhancement บนกราฟ SVG เดิม)

## หลักการใหญ่ (ตัดสินแล้ว)

1. **Progressive enhancement** — กราฟ SVG 13 จุดเดิม render ทันทีเหมือนเดิมทุกประการ
   (engine.js เดิมไม่แตะ) · script TA โหลดแบบ `defer` → ดึงข้อมูลจาก API →
   คำนวณ → **สลับกราฟในที่เดิม** เมื่อพร้อมเท่านั้น · ล้มเหลวทุกกรณี = SVG เดิมอยู่ครบ
   ผู้ใช้ไม่เห็น error state ใหญ่ ๆ
2. **ข้อมูลสด ไม่เก็บลง git** — Worker route ใหม่ `GET /api/ohlc/<SYM>?cur=<USD|THB>`
   proxy Yahoo `range=2y&interval=1d` (2 ปีเพื่อ warm-up EMA/RSI · แสดงเต็มช่วงที่ดึงได้
   ไม่ fix 1 ปี — user เคาะ 1 ส.ค. 2569)
   + cache ที่ edge (Cache API) `s-maxage=21600` (6 ชม.) · Yahoo ล่ม → เสิร์ฟ cache เก่า
   → ไม่มี cache → 503 → client fallback SVG
3. **คำนวณฝั่ง browser** — indicator + annotation ทั้งหมดเป็น pure function ใน
   `_template/ta-engine.js` (รันได้ทั้ง browser และ node → unit test ใน gate ได้)
4. **หนึ่งไฟล์ shared ต่อทั้งเว็บ** — build รวม vendor + engine + glue เป็น
   `dist/assets/ta-<hash>.js` ไฟล์เดียว + `_headers` ตั้ง immutable cache
   → เปิดรายงานตัวที่ 2 เป็นต้นไปไม่โหลดซ้ำ (ต่างจาก CSS/engine เดิมที่ inline ต่อไฟล์)
5. **ไลบรารี** — TradingView **Lightweight Charts** (Apache-2.0) vendor เก็บในรีโป
   (`_template/vendor/`) pin เวอร์ชัน + เก็บ LICENSE + ใส่ attribution link ใน legend
   ตามเงื่อนไข NOTICE · ไม่พึ่ง CDN ตอน runtime

## ส่วนประกอบ

| ไฟล์ | หน้าที่ |
|---|---|
| `src/ohlc.js` (ใหม่, ESM) | map symbol→Yahoo (THB→`.BK`) + แปลง Yahoo JSON → payload กะทัดรัด `{sym,currency,t[],o[],h[],l[],c[],v[]}` (ตัดแท่ง null, ปัดทศนิยม) — pure, ไม่ import cloudflare → test ใน node ได้ |
| `src/worker.js` (แก้) | route `GET /api/ohlc/<SYM>` : validate ด้วย `SYM_RE`+`knownSymbols()` เดิม → Cache API → fetch Yahoo → transform → JSON + rate limit namespace ใหม่ |
| `_template/ta-engine.js` (ใหม่) | pure functions: `ema, rsi, findPivots, labelStructure, detectBreaks, detectDivergence, summarizeSignals` (UMD: browser global + CJS export) |
| `_template/ta-chart.js` (ใหม่) | glue: อ่าน `window.__TA_CFG__` → IntersectionObserver → fetch (timeout 6 วิ) → คำนวณ → วาด lightweight-charts (แท่งเทียน+volume+EMA 7/30/200+เส้น FV/MOS+RSI pane — ไม่มี marker บนกราฟ) → สลับแทน SVG · จัดการ fallback ทุกทาง |
| `_template/vendor/lightweight-charts.standalone.production.js` (ใหม่) | ไลบรารี pin เวอร์ชัน + `LICENSE` |
| `build.js` (แก้) | รวม 3 ไฟล์ JS → hash → `dist/assets/ta-<hash>.js` · inject `<script defer>` + `window.__TA_CFG__` (symbol/currency/fv/accent/decimals) ลงรายงานแบบ template **เฉพาะใน dist** (source ยัง content-only) |
| `_headers` (แก้) | `/assets/*` → `Cache-Control: public, max-age=31536000, immutable` |
| `test/ta-engine-test.js`, `test/ohlc-test.js` (ใหม่) | fixture tests deterministic · เข้าสาย `npm run verify` |
| `test/check-site.js` (แก้) | ยืนยัน dist มี `assets/ta-*.js` และรายงาน template อ้างถึงไฟล์ hash ตรงกัน |

## นิยาม TA (deterministic ทั้งหมด)

- **EMA 7/30/200**: seed = SMA(period), จากนั้น `k=2/(period+1)` · ค่าเป็น null จนพ้น warm-up
  · สี/ขนาดเส้น: 7 = เขียว บาง (1) · 30 = แดง บาง (1) · 200 = น้ำเงิน หนา (2)
- **เส้นอ้างอิงมูลค่า**: FV (เขียว dashed เดิม) + MOS 20% = FV×0.8 (amber dotted) + MOS 30% = FV×0.7
  (เขียวเข้ม dotted) — สีตามโซนเครื่องคิดเลข MOS ใน engine เดิม
- **RSI 14**: Wilder smoothing (avgGain/avgLoss) · null จนพ้น warm-up
- **Swing pivots**: fractal `k=3` — high ที่สูงกว่าทั้ง 3 แท่งซ้าย-ขวา = swing high
  (ยืนยันหลังผ่านไป k แท่ง — annotation จึง lag ตามนิยาม ไม่ repaint)
- **HH/HL/LH/LL**: เทียบ pivot กับ pivot ชนิดเดียวกันตัวก่อนหน้า
- **BOS**: ราคาปิดทะลุ swing high/low ล่าสุด "ตามทิศ trend ปัจจุบัน"
- **CHoCH**: ราคาปิดทะลุ swing "สวนทิศ trend" ครั้งแรก (trend state เริ่มจาก
  ทิศของ pivots คู่แรก แล้วพลิกเมื่อเกิด CHoCH)
- **Divergence (regular)**: price LL + RSI HL = bullish · price HH + RSI LH = bearish
  เทียบ pivot ราคา 2 ตัวติดกัน กับค่า RSI ณ แท่ง pivot
- **แถบสัญญาณ (chips)**: ข้อเท็จจริงล่าสุด เช่น "EMA7 > EMA30 (golden cross X แท่งก่อน)", "ราคา > EMA200",
  "RSI 28 — oversold", "CHoCH ขาขึ้น", "Bullish divergence" · **ภาษาเป็นข้อเท็จจริงเชิงเทคนิค
  ไม่ใช่คำแนะนำซื้อขาย** — disclaimer เดิมของรายงานคงอยู่

## ความต่อเนื่องการแสดงผล (ข้อกำหนดที่ต้องผ่านทุกข้อ)

| # | สถานการณ์ | พฤติกรรมที่ต้องได้ |
|---|---|---|
| C1 | first paint | SVG เดิมโชว์ทันที ไม่ต่างจากปัจจุบัน (script TA เป็น `defer` ไม่ block) |
| C2 | สลับกราฟ | mount ในกล่องความสูงเท่า SVG เดิม + RSI pane/chips ต่อท้ายใน**การ swap ครั้งเดียว** (reflow เดียว, เกิดช่วงต้น ๆ ของการอ่าน) · SVG เดิม `display:none` **ไม่ลบทิ้ง** |
| C3 | API พัง/timeout 6 วิ/offline | SVG เดิมอยู่ครบ · log ลง console เท่านั้น ไม่มี error UI |
| C4 | Yahoo ล่ม | edge cache 6 ชม. คั่นไว้ · พ้น cache → 503 → C3 |
| C5 | มือถือ | `vertTouchDrag:false` + ปิด `mouseWheel` zoom → นิ้วลาก/ล้อเมาส์ผ่านกราฟ = หน้าเลื่อนปกติ **ไม่โดน hijack** · pinch zoom ในกราฟยังได้ |
| C6 | หุ้น IPO/OTC ข้อมูลบาง | แท่งที่มี null ถูกตัดตั้งแต่ worker · แท่ง <60 ตัว → แสดงแท่งเทียน/EMA/RSI ปกติ แต่ข้าม structure (BOS/CHoCH) + divergence · chips แจ้งเท่าที่คำนวณได้ (ไม่ crash) |
| C7 | เปิดรายงานหลายตัว | ta-<hash>.js โหลดครั้งเดียว (immutable cache) — ตัวถัดไป 0 KB |
| C8 | no-JS / บอต / print | SVG path เดิมทำงาน · `@media print` ซ่อน interactive โชว์ SVG |
| C9 | perf | ไฟล์ shared ≤ ~80KB gzip · คำนวณ TA 500 แท่ง < 50ms |
| C10 | gate/cron เดิม | E35/E36/E37 + engine-exec + price-cron **ไม่กระทบเลย** (ไม่แตะ report-data, ไม่แตะ reports/) |

## สิ่งที่ตัดออก (YAGNI — เฟสหลัง)

MACD / volume profile / order block · last-good ใน Durable Object · การเลือก
timeframe อื่น (W/M) · dark mode (เว็บเป็น light theme อยู่แล้ว)

## ความเสี่ยงที่ยอมรับ

- Yahoo เป็น dependency ตอน runtime (unofficial API) — บรรเทาด้วย edge cache + fallback
  ครบทุกชั้น (C3/C4) และเว็บไม่มีทางพังเพราะกราฟเดิมคือ baseline
- Annotation TA มีธรรมชาติ subjective — เราตรึงนิยามด้วย fixture test ให้ deterministic
