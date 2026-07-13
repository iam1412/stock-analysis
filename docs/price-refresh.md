# Price refresh — cron อัปเดตราคาอัตโนมัติ

> สรุปย่ออยู่ใน `CLAUDE.md §10` — ไฟล์นี้คือรายละเอียดกลไก/กติกา/วิธีแก้ปัญหา
> enforcement จริง: `tools/update-prices.js` (+ unit test `test/update-prices-test.js` = `npm run test:prices`)

## ภาพรวม

GitHub Actions (`.github/workflows/update-prices.yml`) รันทุกวัน **07:17 น. ไทย** (00:17 UTC):

```
tools/update-prices.js --write     # ดึงราคา Yahoo → patch reports/*.html + price-flags.json
npm run build                      # dist + reports.json (วันที่ขยับเป็นวันนี้)
node tools/preserve-dates.js       # คืนวันที่ "วิเคราะห์" เดิม (refresh ราคา ≠ re-analysis)
npm run build                      # build อีกรอบให้ dist ตรงวันที่เดิม
npm run verify                     # gate 6 ขั้นเดิม — แดง = ไม่ push
git commit -F …                    # title: price: refresh N symbols (YYYY-MM-DD)
                                   # body:  log ต่อหุ้น "AAPL 297.21 → 315.32 (+6.1%)" + บรรทัด freeze — ถาวรใน git history
```

> **Log ต่อหุ้น:** script เขียนบรรทัดต่อหุ้นลงไฟล์ตาม env `PRICE_COMMIT_BODY` (เมื่อ `--write`) → workflow ใส่เป็น commit body
> ดูย้อนหลัง: `git log --grep "price: refresh"` · ประวัติหุ้นตัวเดียว: `git log --oneline -- reports/AAPL.html`
> (Actions run log มีข้อมูลเดียวกัน แต่หายใน ~90 วัน — git history คือที่เก็บถาวร)

- push เข้า `main` → Cloudflare deploy เองตามปกติ · วันหยุด/ราคาไม่ขยับ → ไม่มี diff → ไม่ commit
- **ไม่มี LLM ในลูป** — script deterministic ล้วน (ราคา/วันที่/กราฟ = ข้อมูลจริงจาก Yahoo, MOS/upside = สูตรเดิม)
- แหล่งข้อมูล: Yahoo chart `?range=1y&interval=1mo` ยิงเดียวได้ครบ (ราคาปัจจุบัน + 13 จุดกราฟ + currency + เวลาตลาด) · หุ้นไทย = `<SYM>.BK` · throttle ~2 req/s + retry/backoff · fetch พังเกินครึ่งใน 20 ตัวแรก = abort ทั้งรอบ (โดน rate-limit — กัน mass-flag)

## จุดที่ script แตะ (เฉพาะตัวเลขโครงสร้างที่ gate คุม)

| จุด | gate ที่บังคับ |
|---|---|
| `.px` ราคา header + วันที่ราคาใน `<header>` และ "ราคา ณ …" ใน disclaimer | E12, E27 |
| ป้าย `.chg` % รอบปี + `theme.chgBg/chgColor` | E34, E35, E36 |
| `chart.data` regenerate ทั้งเส้น 13 จุด (หน้าต่าง ~1 ปีเลื่อนตามจริง) + min/max/grid/highlight | E36, E37, W12 |
| `gauge.cur` + label "ปัจจุบัน $X" | check-site warn |
| MOS `.big` (section 5) | E16 |
| ค่าตั้งต้นเครื่องคิดเลข `pxIn` | E23 |
| `stock-meta` price/mos/upside (คีย์อื่นคงเดิม) | E29–E31 |

**ไม่แตะเด็ดขาด:** prose วิเคราะห์ทุกย่อหน้า · EPS/Fair Value/จุดซื้อ MOS20-30 · scenario · footer "ข้อมูล ณ …" (= วันที่วิเคราะห์) · `updated` ใน reports.json (preserve-dates คืนให้ — ลำดับ index "อัปเดตล่าสุดขึ้นก่อน" ยังหมายถึงวันที่วิเคราะห์)

## กติกา freeze + flag (คิว re-analysis)

ตัวที่เข้าเงื่อนไขต่อไปนี้ **ไฟล์ไม่ถูกแตะเลย** (วันที่เก่าบอกผู้อ่านตรง ๆ ว่าข้อมูลเก่า — ซื่อสัตย์กว่าราคาใหม่บนคำวิเคราะห์เก่า) และถูกบันทึกลง `price-flags.json`:

| reason | เงื่อนไข |
|---|---|
| `drift-gt-15pct` | ราคาใหม่ต่างจากในรายงาน >15% (เดิม 10% — ขยับ 2026-07-11 ลดภาระ re-analysis) — prose ("จากจุดเข้า $X", "แพง ~Y%") จะผิดความหมาย |
| `mos-sign-flip` | MOS พลิกเครื่องหมาย — คำตัดสิน "แพง/ถูก" + สี/class กล่อง MOS ผิดทันทีแม้ขยับนิดเดียว |
| `outside-gauge-range` | ราคาหลุดช่วง gauge min–max — เข็ม section 4 ตกขอบ |
| `suspect-split-or-data` | ต่าง >25% — สงสัย split / เปลี่ยน ticker / ข้อมูลเพี้ยน |
| `currency-mismatch` | Yahoo คืนสกุลเงินไม่ตรง stock-meta |
| `fetch-failed` / `patch-failed` | ดึงข้อมูลไม่ได้ (delisted?) / ไฟล์ผิดโครงจน regex ไม่ match |

- flags เป็น **snapshot ต่อรอบ**: symbol ที่กลับมาปกติ (re-analyze แล้ว / ราคาย่อกลับเข้าเกณฑ์) หายจากไฟล์เอง ไม่ต้องลบมือ · `flaggedAt` คงวันแรกที่โดนไว้ (ถ้าเหตุผลเดิม)
- workflow เปิด/อัปเดต GitHub Issue "Price-refresh flags" ใบเดียว (ปิดเองเมื่อคิวว่าง) + สรุปใน job summary
- **เคลียร์คิว:** เปิด session สั่ง "เคลียร์คิว price-flags" → อ่าน `price-flags.json` → re-analysis ตาม bulk workflow (§3) ทุกกติกาเดิม (ตัว suspect-split เข้าข่าย "หุ้นยาก" → controller ปรึกษา `advisor` ก่อน spawn + effort high — ไม่มี Opus แล้ว) · ปล่อยค้าง = วันที่ราคาเก่าลงจนโดน staleness gate เดิม (warn 45 / error 120 วัน) กดดันตามปกติ

## รันมือ / debug

```bash
node tools/update-prices.js AAPL         # dry-run ตัวเดียว (โชว์ว่าจะเปลี่ยนอะไร ไม่เขียนไฟล์/flags)
node tools/update-prices.js --write AAPL # เขียนจริงตัวเดียว → ตามด้วย build + preserve-dates + build + verify
node tools/update-prices.js --write --force AAPL  # ข้าม freeze drift/mos-flip/gauge/suspect — ใช้เฉพาะตอน
                                         # re-analysis UPDATE mode ที่ agent ยืนยัน cross-source แล้ว
                                         # (ต้องระบุ SYMBOL · currency-mismatch/bad-price ยัง freeze · หลุด gauge = เตือนให้แก้ช่วงเอง)
node tools/update-prices.js --write      # เต็มชุด ~763 ตัว (~7-8 นาที)
node tools/fetch-facts.js AAPL           # พิมพ์ ราคา+วันที่+chart 13 จุด+ป้าย %+bounds พร้อมวาง (หุ้นใหม่ · ไทยเติม --th)
npm run test:prices                      # unit test offline (fixture AAPL + mock Yahoo)
```

หมายเหตุ:
- วันที่ราคา = วันของ `regularMarketTime` ตาม timezone ตลาด (เสาร์-อาทิตย์ได้วันศุกร์จริง ไม่แต่งวันที่) · คงรูปแบบปี พ.ศ./ค.ศ. ตามไฟล์เดิม
- ราคา/MOS ขยับได้สูงสุด 15% ต่อการอัปเดต → prose ที่เขียน "~" คลาดเคลื่อนในกรอบยอมรับได้ (tradeoff ที่ตั้งใจ)
- ถ้า Yahoo บล็อก IP ของ GitHub Actions ถี่ ๆ: เพิ่ม `FETCH_DELAY_MS` ใน script หรือย้ายไป self-hosted runner

## Ticker เปลี่ยนชื่อ / กราฟไม่พอจุด / หุ้นเพิกถอน (เพิ่ม 12 ก.ค. 2569)

- **`tools/symbol-map.json`** — Yahoo/StockAnalysis ใช้ ticker คนละชื่อกับไฟล์รายงาน (บริษัทปรับโครงสร้าง เช่น BKI→BKIH, STEC→STECON): ใส่ `{"<SYM>": {"yahoo": "<YSYM>", "sa": "<SASYM>", "note": "..."}}` — `toYahooSymbol` และ `fetch-fundamentals.js` อ่านให้อัตโนมัติ · re-analysis รอบหน้าควรพิจารณาย้ายไฟล์รายงานเป็นชื่อใหม่แล้วลบ entry
- **กราฟรายเดือน <2 จุด** (IPO ใหม่มาก / Yahoo ล้างประวัติ — เคส BK ก.ค. 2569): script ลอง `interval=1wk` → ยังไม่พอ = ใช้กราฟเดิมในรายงาน อัปเดตเฉพาะจุดท้ายเป็นราคาปัจจุบัน (log ขึ้น `chart:1wk` / `chart:old-chart`) — ไม่ freeze `patch-failed` อีกถ้ากราฟเดิมใช้ได้
- **หุ้นเพิกถอน** (Yahoo 404 + StockAnalysis ว่าง + ยืนยันข่าว): ลบ `reports/<SYM>.html` — flag ใน `price-flags.json` ของรายงานที่ถูกลบจะถูกตัดทิ้งเองรอบ `--write` ถัดไป (รายชื่อที่เคยเพิกถอน → memory delisted-stocks)
- **`tools/fetch-fundamentals.js <SYM> [--th]`** — EPS/P/E/ปันผล/เป้า/52wk จาก Yahoo quoteSummary (crumb flow) + StockAnalysis (`__data.json`) พร้อมบรรทัด Δ เทียบสองแหล่ง **+ ตารางงบย้อนหลัง 5 ปี + TTM** (รายได้/margin/NI/EPS/FCF/shares/cash/debt/D-E/ROE จาก StockAnalysis `/financials` 3 หน้า — หน้าไหนล่มก็ข้ามแถวของหน้านั้นเงียบ ๆ) — ให้ worker ใช้ cross-verify + เขียน section งบ/แนวโน้มแทน WebFetch (SKILL STEP 1) · controller pre-fetch วางใน `{{FUNDAMENTALS}}` แล้ว worker **ห้ามรันซ้ำ**
