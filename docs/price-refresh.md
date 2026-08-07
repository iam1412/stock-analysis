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
npm run verify                     # gate 8 ขั้นเดิม — แดง = ไม่ push
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
| `mos-sign-flip` | MOS พลิกเครื่องหมาย **เกิน dead-band ±3 จุด** (2026-08-02: flip ที่ทั้งเก่า-ใหม่อยู่ใน ±3 จุด = แกว่งรอบ FV → patch ผ่าน patcher เขียนเครื่องหมายใหม่เอง — ±3 ตรง dead-band ของ gate W06 ดังนั้น prose "ถูก/แพงเล็กน้อย" ไม่ขัด gate) |
| ~~`outside-gauge-range`~~ | ยกเลิก 2026-08-02 — ราคาหลุดขอบ gauge ไม่ freeze แล้ว patcher ขยาย `gauge.min/max` เป็น ราคา±5% เอง (ขอบเป็น display scaffolding, engine วาดจาก report-data — drift ใหญ่จริงโดนเกณฑ์ 15%/25% ก่อนเสมอ) |
| `suspect-split-or-data` | ต่าง >25% — สงสัย split / เปลี่ยน ticker / ข้อมูลเพี้ยน |
| `currency-mismatch` | Yahoo คืนสกุลเงินไม่ตรง stock-meta |
| `fetch-failed` / `patch-failed` | ดึงข้อมูลไม่ได้ (delisted?) / ไฟล์ผิดโครงจน regex ไม่ match |
| `not-on-exchange` | **สองชั้น**: quote ค้างหลัง cohort เดียวกัน ≥3 session **และ** TradingView ไม่พบ ticker บนกระดานใดเลย (เพิ่ม 8 ส.ค. 2569 — ดู §canary) · เขียนได้ทั้งจาก cron รายวัน (ยืนยันสด) และ `tools/dead-ticker-canary.js` รายสัปดาห์ · ตัวที่ติด flag นี้ **หยุด patch** รอบถัดไป (ไม่ใช่แค่ freeze รอบนี้) |

- flags เป็น **snapshot ต่อรอบ**: symbol ที่กลับมาปกติ (re-analyze แล้ว / ราคาย่อกลับเข้าเกณฑ์) หายจากไฟล์เอง ไม่ต้องลบมือ · `flaggedAt` คงวันแรกที่โดนไว้ (ถ้าเหตุผลเดิม)
- **ยกเว้น `not-on-exchange`**: อยู่ใน `EXTERNAL_REASONS` ของ `mergeFlags` — snapshot รายวัน **ไม่มีสิทธิเคลียร์แบบเงียบ ๆ** เพราะ "ไม่มี freeze รอบนี้" ไม่ได้แปลว่าหุ้นฟื้น (ไม่งั้น canary เขียนคืนวันจันทร์ เช้าอังคารหายเกลี้ยง) · ถอนได้ **2 ทางเท่านั้น**: TradingView เจอ ticker กลับมา (cron รายวันตอนยืนยัน candidate หรือ canary รายสัปดาห์) หรือไฟล์รายงานถูกลบ · ถ้าชนกับ flag ราคา → `not-on-exchange` ชนะ (triage ต่างกัน: ยืนยันแล้ว**ลบ** ไม่ใช่ re-analyze)
- workflow เปิด/อัปเดต GitHub Issue "Price-refresh flags" ใบเดียว (ปิดเองเมื่อคิวว่าง) + สรุปใน job summary
  - body สร้างโดย `tools/flags-issue-body.js` — **เขียนทับทั้งใบทุกรอบ** จึงอ่าน body เดิมกลับเข้ามาก่อน เพื่อเทียบว่าตัวไหนเข้า/ออกคิว และสะสม **ตารางประวัติจำนวนคิว 14 รอบล่าสุด** (issue เก็บ state ตัวเอง ไม่ต้องมีไฟล์ history) · ประวัติจะเริ่มนับใหม่เมื่อคิวว่างจนปิด issue แล้วเปิดใบใหม่
  - marker `<!--flags-->` / `<!--history-->` ในตัว body คือจุดที่สคริปต์อ่านกลับ — **ห้ามแก้ body ด้วยมือจนคู่ marker หาย** (หายแล้วประวัติจะรีเซ็ต) · ทดสอบแห้ง: `PREV_BODY="$(gh issue view N --json body --jq .body)" TODAY=$(date +%F) node tools/flags-issue-body.js`
- **เคลียร์คิว:** เปิด session สั่ง "เคลียร์คิว price-flags" → อ่าน `price-flags.json` → re-analysis ตาม bulk workflow (§3) ทุกกติกาเดิม (ตัว suspect-split เข้าข่าย "หุ้นยาก" → controller ปรึกษา `advisor` ผ่าน courier subagent ก่อน spawn (ห้ามเรียกตรง — orchestration §2) + effort high — ไม่มี Opus แล้ว) · ปล่อยค้าง = วันที่ราคาเก่าลงจนโดน staleness gate เดิม (warn 45 / error 120 วัน) กดดันตามปกติ

## รันมือ / debug

```bash
node tools/update-prices.js AAPL         # dry-run ตัวเดียว (โชว์ว่าจะเปลี่ยนอะไร ไม่เขียนไฟล์/flags)
node tools/update-prices.js --write AAPL # เขียนจริงตัวเดียว → ตามด้วย build + preserve-dates + build + verify
node tools/update-prices.js --write --force AAPL  # ข้าม freeze drift/mos-flip/suspect — ใช้เฉพาะตอน
                                         # re-analysis UPDATE mode ที่ agent ยืนยัน cross-source แล้ว
                                         # (ต้องระบุ SYMBOL · currency-mismatch/bad-price ยัง freeze · หลุดขอบ gauge = patcher ขยายขอบให้เอง)
node tools/update-prices.js --write      # เต็มชุด ~763 ตัว (~7-8 นาที)
node tools/fetch-facts.js AAPL           # พิมพ์ ราคา+วันที่+chart 13 จุด+ป้าย %+bounds พร้อมวาง (หุ้นใหม่ · ไทยเติม --th)
npm run test:prices                      # unit test offline (fixture AAPL + mock Yahoo)
node tools/dead-ticker-canary.js         # dry-run ทั้งรีโป (~3 request, ไม่เขียนไฟล์)
node tools/dead-ticker-canary.js NVDA BGRIM # ตรวจเฉพาะตัว (กรองจาก reports/ — ตัวที่ไม่มีรายงานถูกข้าม)
node tools/dead-ticker-canary.js --write # เขียน price-flags.json + tools/tv-tickers.json
npm run test:dead                        # unit test offline ของ canary (ไม่ยิง network)
```

หมายเหตุ:
- วันที่ราคา = วันของ `regularMarketTime` ตาม timezone ตลาด (เสาร์-อาทิตย์ได้วันศุกร์จริง ไม่แต่งวันที่) · คงรูปแบบปี พ.ศ./ค.ศ. ตามไฟล์เดิม
- ราคา/MOS ขยับได้สูงสุด 15% ต่อการอัปเดต → prose ที่เขียน "~" คลาดเคลื่อนในกรอบยอมรับได้ (tradeoff ที่ตั้งใจ)
- ถ้า Yahoo บล็อก IP ของ GitHub Actions ถี่ ๆ: เพิ่ม `FETCH_DELAY_MS` ใน script หรือย้ายไป self-hosted runner

## Ticker เปลี่ยนชื่อ / กราฟไม่พอจุด / หุ้นเพิกถอน (เพิ่ม 12 ก.ค. 2569)

- **`tools/symbol-map.json`** — Yahoo/StockAnalysis ใช้ ticker คนละชื่อกับไฟล์รายงาน (บริษัทปรับโครงสร้าง เช่น BKI→BKIH, STEC→STECON): ใส่ `{"<SYM>": {"yahoo": "<YSYM>", "sa": "<SASYM>", "note": "..."}}` — `toYahooSymbol` และ `fetch-fundamentals.js` อ่านให้อัตโนมัติ · re-analysis รอบหน้าควรพิจารณาย้ายไฟล์รายงานเป็นชื่อใหม่แล้วลบ entry
- **กราฟรายเดือน <2 จุด** (IPO ใหม่มาก / Yahoo ล้างประวัติ — เคส BK ก.ค. 2569): script ลอง `interval=1wk` → ยังไม่พอ = ใช้กราฟเดิมในรายงาน อัปเดตเฉพาะจุดท้ายเป็นราคาปัจจุบัน (log ขึ้น `chart:1wk` / `chart:old-chart`) — ไม่ freeze `patch-failed` อีกถ้ากราฟเดิมใช้ได้
- **หุ้นเพิกถอน**: ยืนยันจาก**แหล่งปฐมภูมิ** (SEC Form 25/8-K · ประกาศตลาด · IR) แล้วลบ `reports/<SYM>.html` — flag ใน `price-flags.json` ของรายงานที่ถูกลบจะถูกตัดทิ้งเองรอบ `--write` ถัดไป (รายชื่อที่เคยเพิกถอน → memory delisted-stocks)
  > ⚠️ เกณฑ์เดิม "Yahoo 404 + StockAnalysis ว่าง" **ไม่พอ** — พิสูจน์แล้ว 8 ส.ค. 2569 ว่า EA/BPP ทั้งคู่ Yahoo **ไม่ 404** แต่ serve ราคาปิดวันสุดท้ายค้างไปเรื่อย ๆ (ดู §canary)
- **canary หุ้นตาย** → §ถัดไป (สองสัญญาณ: `stale-quote` รายวัน + `not-on-exchange` รายสัปดาห์)
- **`tools/fetch-fundamentals.js <SYM> [--th]`** — EPS/P/E/ปันผล/เป้า/52wk จาก Yahoo quoteSummary (crumb flow) + StockAnalysis (`__data.json`) พร้อมบรรทัด Δ เทียบสองแหล่ง **+ ตารางงบย้อนหลัง 5 ปี + TTM** (รายได้/margin/NI/EPS/FCF/shares/cash/debt/D-E/ROE จาก StockAnalysis `/financials` 3 หน้า — หน้าไหนล่มก็ข้ามแถวของหน้านั้นเงียบ ๆ) — ให้ worker ใช้ cross-verify + เขียน section งบ/แนวโน้มแทน WebFetch (SKILL STEP 1) · controller pre-fetch วางใน `{{FUNDAMENTALS}}` แล้ว worker **ห้ามรันซ้ำ**

## Canary หุ้นหยุดเทรด/เพิกถอน (เพิ่ม 8 ส.ค. 2569)

**จุดบอดที่ปิด:** หุ้นตายแล้ว Yahoo **ไม่ 404** — มัน serve ราคาปิดวันสุดท้ายค้างไปเรื่อย ๆ ⇒ cron เห็น
`drift = 0%` ⇒ ไม่มีเกณฑ์ freeze ข้อไหนจับได้ ⇒ รายงานอ้างราคาหุ้นที่เลิกซื้อขายแล้วอยู่ได้ไม่จำกัด
เป็นจุดบอด**เชิงโครงสร้าง** ไม่ใช่ bug รายตัว

**เคสที่ทำให้ต้องมี** (พบ 8 ส.ค. 2569 ตอนเทียบ TradingView กับ Yahoo ทั้งรีโป):

| | ราคาที่ค้าง | Yahoo `regularMarketTime` ค้างตั้งแต่ | เหตุจริง (ยืนยันแหล่งปฐมภูมิ) |
|---|---|---|---|
| EA | 209.70 USD | 4 ส.ค. 2569 | ปิดดีล take-private $210/หุ้น → Nasdaq ยื่น Form 25-NSE (17 CFR 240.12d2-2(a)(3)) |
| BPP | 12.00 THB | 16 ก.ค. 2569 | ควบบริษัท (amalgamation) กับ BANPU มีผล 31 ก.ค. → BANPU NewCo เทรด 4 ส.ค. — **วันที่อ้างสื่อไทยที่ quote ประกาศ SET คำต่อคำ (InfoQuest 615557) ประกาศ SET ตัวจริงเข้าไม่ถึง (Incapsula)** · ตรวจทาน: 12.00/0.80208 ≈ 5.80/0.38242 ≈ BANPU 15.00 |

### สัญญาณ 1 — pre-filter รายวัน `detectStaleQuotes()` (ใน update-prices.js)

`detectStaleQuotes()` เทียบ `regularMarketTime` ของทุกตัวที่ fetch สำเร็จ **ในรอบเดียวกัน**:

- จับกลุ่มตาม **สกุลเงิน** = proxy ของตลาด (USD = NASDAQ/NYSE/AMEX/OTC ปิดพร้อมกัน · THB = SET)
  — ห้ามเทียบข้ามตลาด: SET ปิดก่อน NYSE หลายชั่วโมงและวันหยุดไม่ตรงกัน
- อ้าง session ล่าสุดที่ **cohort นั้น** เดินถึง (`max(localDay)`) แล้วนับ **จำนวนวันจันทร์-ศุกร์ที่ผ่านไป** —
  วัดแบบ relative จึงไม่ต้องมีปฏิทินวันหยุดของแต่ละตลาด · เสาร์-อาทิตย์ไม่นับ (ไม่มีใครเทรด ไม่ใช่สัญญาณ)
- ค้าง **≥3 session** (`STALE_QUOTE_SESSIONS`) → เป็น **candidate** · cohort < 5 ตัว (`STALE_MIN_COHORT`) ข้าม

> ### ★ ทำไมสัญญาณนี้ห้ามเขียน flag ตรง ๆ (บทเรียนจาก review 8 ส.ค. 2569)
> `regularMarketTime` ค้างที่ **"วันที่มีการซื้อขายล่าสุด" ไม่ใช่ "session ล่าสุดของตลาด"** — วัดหุ้นไทย
> ในรีโป **204/205 ตัว** ตรงกับ bar ล่าสุดที่ `volume > 0` เป๊ะ ⇒ **หุ้นสภาพคล่องต่ำที่ไม่มีใครเทรด
> หลายวันหน้าตาเหมือนหุ้นตายทุกประการ** (ในรีโปนี้: NRF, PB, ZEN — ทั้งสามยังเทรดอยู่)
> replay 248 session จริงย้อนหลัง 1 ปี ด้วยฟังก์ชันจริง: ถ้าเอาผลไป flag ตรง ๆ จะได้ false positive
> **99/248 วัน (40%)** — NRF ติดยาว 55 session ติดกัน · และ**ไม่มี threshold ไหนต่ำกว่า 56** ที่ทำให้ FP
> เป็นศูนย์ (3→99, 4→92, 6→82, 30→24, 56→0) ⇒ การขยับเลขแก้ไม่ได้ ต้องมีแหล่งที่สองมายืนยัน
> ผลลัพธ์ของฟังก์ชันจึงคืนฟิลด์ **`signal`** ไม่ใช่ `reason` — กันคนเผลอเอาไปเขียนลง flag

**ยืนยันชั้นสอง (`confirmDead` ในรอบเดียวกัน):** candidate → ยิง TradingView scanner 1 request
- ticker ยังอยู่บนกระดาน → **ไม่มีคนเทรด ไม่ใช่หุ้นตาย** log บรรทัดเดียว ไม่ flag (+ ถอน `not-on-exchange` เดิมถ้ามี)
- ไม่พบทุกกระดาน → flag **`not-on-exchange`** (reason เดียวกับ canary รายสัปดาห์ → triage ตรงกัน)
- candidate เกินเพดาน `probeCap` (5% ของ cohort ขั้นต่ำ 5 ตัว) → ถือว่า**การวัดเพี้ยน** (ts อนาคตดัน ref /
  รอบคร่อม session boundary / ตลาดหยุดยาว) ไม่ถาม ไม่ flag · ยิงไม่สำเร็จ → log แล้วปล่อย canary รายสัปดาห์

### สัญญาณ 2 — `not-on-exchange` (รายสัปดาห์, แหล่งอิสระ)

`tools/dead-ticker-canary.js` + `.github/workflows/dead-ticker-canary.yml` (จันทร์ 09:23 น. ไทย)
กวาด **ทุก** symbol ไม่รอ pre-filter (ครอบเคสที่ Yahoo timestamp ยังขยับแต่หุ้นตายแล้ว):
ถาม TradingView scanner ว่า ticker **ยังมีตัวตนบนกระดานไหม** — ต่างจาก Yahoo คือ ticker ที่หมดสภาพ
**หายจากผลลัพธ์** (ไม่ค้างราคา) → ล้มแบบดัง ไม่ล้มแบบเงียบ

```
POST https://scanner.tradingview.com/global/scan
{"symbols":{"tickers":["NASDAQ:NVDA", …]},"columns":["close","currency"],"range":[0,N]}
```

- **ต้องส่ง `range` ให้ครบ N** — default page size ของ scanner = 50 ไม่งั้นได้แค่ 50 แถวเงียบ ๆ
- ต้องมี exchange prefix (lookup เป็น exchange-scoped): ไทย `SET:` · US ยิง `NASDAQ/NYSE/AMEX/OTC/CBOE`
  (OTC = ADR ญี่ปุ่น/ยุโรป เช่น FANUY/ABBNY/KYCCF · CBOE:CBOE) · หุ้นสองคลาสไฟล์ใช้ขีดแต่ TradingView
  ใช้จุด (BRK-B → `NYSE:BRK.B`) · บริษัทเปลี่ยนชื่ออ่านจาก `tools/symbol-map.json` (`sa`)
- **2 รอบ**: รอบ 1 ถาม ticker ที่น่าจะถูกที่สุดตัวเดียวต่อ symbol (จาก cache `tools/tv-tickers.json`) →
  รอบ 2 เฉพาะตัวที่ยังไม่เจอ ค่อยยิงทุกกระดาน — กันสรุปว่า "ตาย" เพราะย้ายกระดาน (uplist จาก OTC)
- ยาม `MIN_ALIVE_RATIO` 80%: ถ้ารอบนั้นเจอ alive น้อยผิดปกติ = โดนบล็อก/โครง response เปลี่ยน →
  **exit 2 ไม่เขียน flag เลย** (กัน mass-flag ทั้งรีโปเวลา TradingView บล็อก IP ของ Actions)
  · ใช้เฉพาะ **sweep เต็มที่ ≥20 ตัว** (`GUARD_MIN_PROBES`) — รันเจาะจงอย่าง `… EA BPP` ไม่ใช้ยาม
  เพราะ "ตายทั้งสองตัวที่ถาม" คือคำตอบที่ถูก ไม่ใช่สัญญาณว่าโดนบล็อก (รายชื่อ dead พิมพ์ก่อนยามเสมอ)
- วัดจริง sweep เต็ม 784 รายงาน (8 ส.ค. 2569): **782 อยู่บนกระดาน / 2 ต้องสงสัย (EA, BPP)** — 3 request
  ทั้งรีโป (784 + 1200 + 303 ticker) · หลังมี cache ครบ รอบถัดไปเหลือ ~1 request

**ข้อจำกัดที่ตั้งใจรับ:** endpoint นี้ไม่มี doc ทางการ — ความเสี่ยงระดับเดียวกับ Yahoo chart API ที่ cron
ใช้อยู่แล้ว · ทั้งสองสัญญาณเป็น **ตัวชี้ให้ไปดู ไม่ใช่คำตัดสิน**: ต้องยืนยันจากแหล่งปฐมภูมิก่อนลบรายงานเสมอ
