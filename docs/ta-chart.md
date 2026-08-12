# กราฟ TA (TradingView-style) — Worker API + client-side engine

> `CLAUDE.md §10` มีแค่ pointer สั้น ๆ · ไฟล์นี้คือรายละเอียดเต็ม
> Design doc ต้นทาง (หลักการ/นิยาม TA/เหตุผลการตัดสินใจ): `docs/superpowers/specs/2026-08-01-ta-chart-design.md`

ยกระดับกราฟ SVG เดิม (section 2 "ราคาย้อนหลัง ~1 ปี") เป็นกราฟแท่งเทียน + volume + EMA 7/30/200 +
เส้น FV/MOS 20%/MOS 30% + RSI14 · โครงสร้างราคา (BOS, CHoCH, divergence) สรุปเป็น chips ใต้กราฟ
(ไม่วาด marker บนกราฟ — feedback user 1 ส.ค. 2569) · band สีเขียว/แดงอ่อนระหว่าง EMA7↔EMA30 ตามทิศ cross
· viewport เริ่มต้น = ~4 เดือนหลังสุด (เลื่อนย้อนได้ 3 ปี) · ป้าย FV/MOS เขียนบนเส้นชิดขวา
· **toolbar โต้ตอบได้**: TF 1H/4H/D/W (1H/4H โหลด `tf=H` lazy · 4H/W resample ฝั่ง client) + range 1M/3M/6M/1Y/3Y (default = 6M, ปุ่ม active)
+ ปุ่มแว่นขยายซูมเข้า-ออก (ยึดแท่งล่าสุด) + ปุ่มรีเซ็ต + log scale + บันทึกรูป PNG (`takeScreenshot` ต่อ 2 pane)
+ OHLC legend ตาม crosshair + toggle เปิด/ปิด EMA แต่ละเส้น/band/volume/RSI
· **chips สัญญาณตรึงคำนวณจากรายวันเสมอ** ไม่แกว่งตาม TF ที่กดเล่น **โดยไม่แก้ไฟล์รายงานแม้แต่ไฟล์เดียว**
— progressive enhancement บนกราฟ SVG เดิม กราฟเดิมคือ baseline ที่ผู้ใช้ไม่มีทางเห็นพัง

## สถาปัตยกรรม

```
reports/<SYM>.html (source, content-only) ── build.js ──▶ dist/<SYM>.html
                                                              │  injectTA() ต่อท้าย </body>:
                                                              │  <script>window.__TA_CFG__={sym,cur,fv,accent,accentDark,dec}</script>
                                                              │  <script defer src="/assets/ta-<hash>.js"></script>
                                                              ▼
                                            dist/assets/ta-<hash>.js  (ไฟล์เดียว shared ทั้งเว็บ)
                                            = vendor/lightweight-charts.standalone.production.js
                                            + ta-engine.js (pure TA functions)
                                            + ta-chart.js  (glue: fetch → คำนวณ → วาด → swap)
                                                              │
                                                              ▼ runtime (browser)
                                            GET /api/ohlc/<SYM>?cur=USD|THB  (src/worker.js)
                                                              │ proxy + edge cache 1 ชม.
                                                              ▼
                                            Yahoo Finance chart API (unofficial, range=3y&interval=1d)
```

- **`src/ohlc.js`** — แปลง Yahoo JSON → payload กะทัดรัด `{sym,currency,bars:{t,o,h,l,c,v}}` (ตัดแท่ง null, ปัดทศนิยม 4 ตำแหน่ง) pure ESM ไม่ import `cloudflare:*` → เทสใน node ได้ (`test/ohlc-test.js`)
- **`src/worker.js`** route `GET /api/ohlc/<SYM>` — validate symbol (`SYM_RE` + `knownSymbols()` จาก `reports.json`) → เช็ค Cache API ก่อน → cache miss ถึงกินโควตา `OHLC_LIMITER` (20 req/60s) → fetch Yahoo (timeout 8s) → `transformChart()` → JSON + `Cache-Control: s-maxage=3600` (1 ชม.) ที่ edge
- **`_template/ta-engine.js`** — pure functions ล้วน ๆ ไม่มี DOM/network: `ema, rsi, findPivots, labelStructure, detectBreaks, detectDivergence, summarizeSignals` (UMD: `window.TA` ใน browser, `module.exports` ใน node) — นิยามตรึงด้วย `test/ta-engine-test.js` **นิยาม TA ทั้งหมด (EMA/RSI/pivot/BOS/CHoCH/divergence) → ดู spec §"นิยาม TA (deterministic ทั้งหมด)"**
- **`_template/ta-chart.js`** — glue ฝั่ง client: อ่าน `window.__TA_CFG__` → `IntersectionObserver` (rootMargin 400px, โหลดเมื่อใกล้จอเท่านั้น ไม่แย่ง bandwidth ตอน first paint) → `fetch('/api/ohlc/...')` (timeout 6s ผ่าน `AbortController`) → คำนวณด้วย `TA.*` → สร้าง DOM นอกจอ (lightweight-charts 2 pane: ราคา+volume, RSI) → **swap ครั้งเดียว** (`host.style.display='none'` แล้ว `wrap.appendChild(box)`) → `ResizeObserver` คง responsive
- **`_template/vendor/lightweight-charts.standalone.production.js`** — TradingView Lightweight Charts™ v5.2.0 (Apache-2.0) vendor เก็บในรีโป ไม่พึ่ง CDN ตอน runtime + `LICENSE-lightweight-charts` + attribution link ใน legend ของกราฟ (เงื่อนไข NOTICE)
- **`build.js`** — รวม 3 ไฟล์ (`vendor + ta-engine.js + ta-chart.js`) → sha256 8 ตัวแรก → เขียน `dist/assets/ta-<hash>.js` **ก่อน** loop รายงาน แล้ว `injectTA()` ใส่ `<script>` 2 บรรทัดต่อท้าย `</body>` **เฉพาะ dist** (source ใน `reports/` ไม่ถูกแตะ) — รายงาน legacy (ไม่มี `report-data`) ถูกข้าม (`injectTA` คืน html เดิม)
- **`_headers`** — `/assets/*` → `Cache-Control: public, max-age=31536000, immutable` (ไฟล์ hash เปลี่ยนเมื่อเนื้อหาเปลี่ยนเท่านั้น → เปิดรายงานตัวที่ 2 เป็นต้นไป 0 KB เพราะ browser cache ตรง)

## Contract: `GET /api/ohlc/<SYM>?cur=USD|THB&tf=D|H`

**Request**
- `<SYM>` = ตัวย่อหุ้นพิมพ์ใหญ่ (`SYM_RE = /^[A-Z0-9.\-]{1,10}$/`) + ต้องอยู่ใน `reports.json` (ถ้าโหลด whitelist ได้)
- `cur` = `USD` (default) หรือ `THB` — ใช้เลือก suffix Yahoo (`.BK` สำหรับ THB, override จาก `tools/symbol-map.json` ถ้ามี)
- `tf` = `D` (default, 3y/1d) หรือ `H` (1y/1h — สำหรับ TF 1H/4H ฝั่ง client ที่ resample 4H เอง) · cache แยก key ต่อ tf

**Response 200** (`application/json`, `Cache-Control: public, max-age=3600, s-maxage=3600`)
```json
{
  "sym": "AAPL",
  "currency": "USD",
  "bars": { "t": [1700000000, ...], "o": [...], "h": [...], "l": [...], "c": [...], "v": [...] }
}
```
- `t` = unix seconds (UTC) เรียงจากเก่า→ใหม่ · แท่งที่มี OHLC เป็น `null` (วันข้อมูลขาด/OTC บาง) **ถูกตัดออกตั้งแต่ worker** · ~3 ปีข้อมูล (warm-up EMA200) — client ตั้ง viewport เริ่มต้น = 6 เดือนหลังสุด (ปุ่ม 6M active) ลาก/เลื่อนย้อนดูได้ทั้งหมด
- `v` = volume, `0` ถ้า Yahoo ไม่ส่งมา

**Error responses** — ทุกเคส client (`ta-chart.js`) ตีความเป็น "fallback SVG" เหมือนกันหมด (ไม่แยก UI ตาม error code)
| status | เหตุ |
|---|---|
| 400 | symbol ไม่ตรง `SYM_RE` |
| 404 | symbol ไม่อยู่ใน `reports.json` (whitelist) |
| 429 | เกิน `OHLC_LIMITER` (20 req/60s ต่อ IP, นับเฉพาะ cache miss) |
| 503 | Yahoo ล่ม/timeout และไม่มี edge cache เก่าให้เสิร์ฟ |

## นิยาม TA (deterministic — ห้ามเดา ไปอ่านที่ spec)

EMA 7/30/200 (seed=SMA), RSI14 (Wilder smoothing), swing pivot (fractal k=3, lag ตามนิยาม ไม่ repaint),
HH/HL/LH/LL, BOS/CHoCH, regular divergence, chips สรุปสัญญาณ — นิยามเต็มทุกตัว +
เหตุผลการเลือกพารามิเตอร์ → **`docs/superpowers/specs/2026-08-01-ta-chart-design.md` หัวข้อ "นิยาม TA (deterministic ทั้งหมด)"**
แก้พฤติกรรมต้องแก้ `test/ta-engine-test.js` (fixture test) พร้อมกันเสมอ — ห้ามแก้นิยามลอย ๆ โดยไม่มี test คุม

## วิธี bump vendor (อัปเดต lightweight-charts เวอร์ชันใหม่)

1. ดาวน์โหลดตัวใหม่: `curl -o _template/vendor/lightweight-charts.standalone.production.js https://unpkg.com/lightweight-charts@<version>/dist/lightweight-charts.standalone.production.js`
2. อัปเดต `_template/vendor/LICENSE-lightweight-charts` — แก้บรรทัด `Pinned:` เป็นวันที่วันนี้ + เวอร์ชันใน comment header ของไฟล์ js (มีอยู่แล้วบรรทัดบนสุดของไฟล์ vendor)
3. รัน `npm run build` — hash bundle (`ta-<hash>.js`) เปลี่ยนอัตโนมัติเพราะเนื้อหาไฟล์เปลี่ยน (ไม่ต้องแก้ที่ไหนอีก — build.js คำนวณ hash จากเนื้อหาสด)
4. รัน `npm run verify` ให้ผ่านครบ (โดยเฉพาะ `test:ta` — API ของ lightweight-chartsข้าม major version อาจเปลี่ยน เช่น `chart.addSeries(LWC.CandlestickSeries, ...)` เป็น pattern v5 — ถ้า major version เปลี่ยนต้องเช็ค breaking changes ใน `_template/ta-chart.js` เอง (`createSeriesMarkers` vs `setMarkers` มี fallback ทั้งคู่อยู่แล้วในโค้ด)
5. เช็ค `test/check-site.js` (W: "dist/assets/ ต้องมีไฟล์ ta-*.js เดียว") ผ่าน — ถ้ามีไฟล์ hash เก่าค้างใน `dist/assets/` ให้ลบ `dist/` แล้ว build ใหม่ทั้งหมด (`dist/` เป็น build output ไม่ commit อยู่แล้ว)

## วิธี debug

- **Console log ทุกอย่างขึ้นต้น `[ta-chart]`** — เคส fallback จะเห็น `console.warn('[ta-chart] fallback SVG: <เหตุผล>')` เท่านั้น (ไม่มี error UI ให้ผู้ใช้เห็น ตามหลักการ progressive enhancement) → เปิด DevTools Console กรองคำว่า `ta-chart` เจอสาเหตุทันที
- เช็ค config ที่ inject: `window.__TA_CFG__` (ต้องมี `{sym,cur,fv,accent,accentDark,dec}`) — ถ้า `undefined` แปลว่ารายงานนี้เป็น legacy (ไม่มี `report-data`) หรือดูหน้า `reports/` ตรง ๆ (source ไม่มี config นี้ — ต้องดูผ่าน `dist/` หรือเว็บจริงเท่านั้น)
- เช็คว่า engine/vendor โหลดสำเร็จ: `window.TA` (ta-engine) และ `window.LightweightCharts` (vendor) ต้องเป็น object ไม่ใช่ `undefined`
- เช็ค network tab: `/api/ohlc/<SYM>?cur=...` — status 200 = ปกติ, ไม่มี request เลย = `IntersectionObserver` ยังไม่ trigger (กราฟยังไม่เข้าใกล้จอ ~400px) หรือ browser throttle background tab (พบใน headless/automation — ไม่ใช่บั๊กเว็บจริง)
- ทดสอบ fallback path ด้วยมือ (DevTools Console): `window.fetch = (u,o) => u.includes('/api/ohlc/') ? Promise.reject(new Error('test')) : window.fetch.__proto__.constructor.prototype... ` หรือง่ายกว่า — บล็อก request `/api/ohlc/*` ผ่าน DevTools Network → "Block request URL" แล้ว reload → กราฟ SVG เดิมต้องอยู่ครบ ไม่มี error UI
- local dev: `npx wrangler dev` (mock Cache API + rate limiter ในเครื่อง) — ต่างจาก production ตรงที่ไม่มี edge cache จริงข้าม request (`caches.default` ใน `wrangler dev` เป็น per-process ไม่ persistent เท่า Cloudflare edge จริง)

## ข้อจำกัดที่ยอมรับ (risk accepted)

- **Yahoo Finance เป็น unofficial API** — ไม่มี SLA, อาจเปลี่ยน response shape/บล็อก IP ได้ทุกเมื่อ โดยไม่แจ้งล่วงหน้า — บรรเทาด้วย edge cache 1 ชม. (`OHLC_CACHE_TTL`) + client fallback SVG ครบทุกทาง (เว็บไม่มีทางพังเพราะกราฟเดิมคือ baseline เสมอ — ดู C1–C10 ด้านล่าง)
- **cache 1 ชม.** (`s-maxage=3600`) — กราฟ TA อาจไม่ใช่ราคาสดวินาทีต่อวินาที (ข้อมูล intraday ก็ไม่ใช่อยู่แล้ว เพราะ interval=1d) แต่ระหว่างเวลาที่ตลาดเปิด อาจเห็นแท่งวันปัจจุบันช้ากว่าราคาจริงได้ถึง 1 ชม. — ยอมรับได้เพราะ TA เป็นกราฟย้อนหลัง ไม่ใช่ real-time quote
- Annotation TA (BOS/CHoCH/divergence) มีธรรมชาติ subjective — ตรึงด้วยนิยาม deterministic + fixture test ใน `test/ta-engine-test.js` ให้ผลซ้ำได้เสมอ ไม่ repaint ย้อนหลัง
- ตัดออกตั้งใจ (YAGNI เฟสหลัง): MACD, volume profile/order block, last-good cache ใน Durable Object, timeframe อื่น (W/M), dark mode

## ผล continuity verification (C1–C10)

ตรวจกับเว็บจริงผ่าน `npx wrangler dev` (localhost:8787) + browser automation, เสริมด้วยการรัน
code path เดิม (`ta-engine.js`/`ta-chart.js` เป๊ะ ๆ) ตรง ๆ ใน console เมื่อ `IntersectionObserver`
ของหน้าเว็บถูก headless browser throttle (พบว่า `document.hidden` เป็น `true` เสมอในสภาพแวดล้อม
อัตโนมัติ แม้ tab จะ "active" — เป็นข้อจำกัดของเครื่องมือทดสอบอัตโนมัติ ไม่ใช่บั๊กของเว็บ) —
ยืนยันคู่กับ canvas pixel readback (`getImageData`) ว่ากราฟจริงมีข้อมูลวาดจริง ไม่ใช่ blank

| # | สถานการณ์ | ผล | หลักฐาน |
|---|---|---|---|
| C1 | first paint | ✅ ผ่าน | script มี `defer` (ยืนยันจาก DOM) · fresh navigate ไม่มี request `/api/ohlc` จนกว่าจะ scroll ใกล้กราฟ · SVG แสดงทันทีไม่มีดีเลย์ |
| C2 | สลับกราฟครั้งเดียว | ✅ ผ่าน | โค้ด build DOM (`box`) นอกจอทั้งก้อนแล้ว `appendChild` ครั้งเดียว + `host.style.display='none'` (ไม่ลบ) · รันจริงสำเร็จ 1 ครั้งพบ canvas 14 ตัวมีพิกเซลจริง (`nonWhite>0` ทุก canvas), `performance.getEntriesByType('longtask')` = 0 รายการ |
| C3 | API พัง/timeout/offline | ✅ ผ่าน | รัน fetch+catch เส้นทางเดียวกับ `load()` เป๊ะ พร้อม mock `fetch` ให้ reject — จับได้ที่ `.catch`, log `console.warn('[ta-chart] fallback SVG: …')` เท่านั้น ไม่มี error UI, ไม่มีการเปลี่ยน DOM เพิ่มเติม |
| C4 | ทุก API ล่ม (ไม่มี Worker) | ✅ ผ่าน | เสิร์ฟ `dist/` ด้วย `python3 -m http.server` ล้วน ๆ (ไม่มี Worker) → `/api/ohlc/AAPL` = 404 จริง (curl ยืนยัน) · หน้าเว็บโหลดปกติ SVG อยู่ครบ ไม่มี console error, ไม่มี ta-box |
| C5 | มือถือ (375px) | ✅ ผ่าน | resize เป็น 375×812 ไม่มี horizontal overflow (`scrollWidth===innerWidth`) · โค้ด config ตรงสเปกเป๊ะ: `handleScroll:{mouseWheel:false, vertTouchDrag:false}`, `handleScale:{mouseWheel:false, pinch:true}` |
| C6 | หุ้นข้อมูลบาง (<60 แท่ง) | ✅ ผ่าน (logic review) | ทุก symbol ที่มีจริงในระบบคืน 502 แท่ง (2 ปี) ไม่มีตัว <60 ให้ทดสอบสด — จำลอง 40 แท่งสังเคราะห์ผ่าน `TA.*` เป๊ะ: ไม่ throw, `ema200` เป็น `null` ทุกจุด (→ ไม่มี chip EMA200), `breaks/divs` ว่าง (การ์ด `n>=60` ใน `ta-chart.js`), chips EMA7/30+RSI แสดงตามข้อมูลที่มี ไม่ crash |
| C7 | เปิดรายงานหลายตัว | ✅ ผ่าน | AAPL→MSFT ใช้ `/assets/ta-<hash>.js` ไฟล์เดียวกันเป๊ะ (hash เดิม) · header ตอบ `Cache-Control: public, max-age=31536000, immutable` |
| C8 | print / no-JS | ✅ ผ่าน | `dashboard.css` (inline เข้า `dist/*.html` แล้ว) มี `@media print{.ta-box{display:none}#priceChart{display:block!important}}` — ยืนยันมีอยู่จริงใน `dist/AAPL.html` |
| C9 | perf | ✅ ผ่าน | bundle gzip = 67,299 bytes (~65.7 KB, เป้า ≤~80KB) · คำนวณ TA เต็ม 502 แท่งจริงจาก `/api/ohlc/MSFT` = 1.8ms (เป้า <50ms — วัดตอนชุด EMA 20/50; ชุด 7/30/200 ปัจจุบันต้นทุนระดับเดียวกัน) |
| C10 | gate/cron เดิม | ✅ ผ่าน | `npm run verify` เขียวครบ 8 ขั้น (check-reports 0 error 1 warning ไม่เกี่ยว TA + build + build-test + engine-exec 784/784 + skeleton-test + check-site + `test:ohlc` + `test:ta`) exit 0 · `git status --porcelain reports/` ว่างเปล่า (ไม่มีไฟล์ใน `reports/` ถูกแตะ) · E35/E36/E37 อ่านจาก `report-data`/header ใน source ซึ่ง TA ไม่แตะเลย |

**ผลรวม: ผ่านครบ 10/10** — ไม่พบบั๊กที่ต้องแก้โค้ดระหว่างตรวจ (Tasks 1–4 implement ถูกต้องตามสเปกทุกจุดที่ตรวจได้)
