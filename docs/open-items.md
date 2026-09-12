# Open items — ของค้างของโปรเจกต์ (ย้ายจาก memory 11 ก.ย. 2569 · docs-audit §6)

> memory เป็นของ session ไม่ใช่ของโปรเจกต์ — ข้อเสนอที่อยู่แต่ใน memory เคยหาย (29 ส.ค. → ระเบิด 9 ก.ย.) · ไฟล์นี้คือที่เดียวที่บันทึกของค้าง · ปิดแล้ว = ย้ายไปตาราง "ปิดแล้ว" พร้อม commit/PR · เพิ่มใหม่ = 1 แถว ไม่เขียนย่อหน้า

## เปิดอยู่

| # | รายการ | ที่มา | ปิดใน |
|---|---|---|---|
| 1 | `%/ปี` ในประโยคสรุปหมวด 6 เป็น prose — ไม่มี warning/ตัวซ่อม | price-derived-staleness:113 | ระยะ 2 token (คู่กับ `f64` ที่ deferred ตามข้อ A/B — ระยะ 1 ปิด manifest แล้วแต่ไม่ได้แตะช่องนี้ ดู phase1-exit §7) |
| 5 | W05 มองไม่เห็น "สองขาตระกูลเดียว" (WWD) | price-derived-staleness:174 | ระยะ 3 WS7 fix-on-touch — ไม่ได้แก้ในระยะ 1 (manifest/WS9(a) ที่ปิดแล้วไม่ครอบคลุมเคสนี้ ดู phase1-exit §7) |
| 6 | การ์ด EV/Sales · EV/EBITDA · DCF ไม่มี checker | data-source-traps:258 | ระยะ 3 WS7 fix-on-touch — ไม่อยู่ใน 18 แถว NEITHER ที่ปิดระยะ 1 (ดู phase1-exit §2/§7) |
| 11 | 6 ใบสองขาตระกูลเดียว ยังไม่แก้ | fv-family-weighting:22 | ระยะ 3 WS7 fix-on-touch (ลิสต์ในไฟล์ memory) |
| 15 | คำขอคำศัพท์ 49 รายการใน `tags.json.requests` รอเจ้าของ | tag-system-2026-08:19 | เจ้าของรีวิว |
| 16 | `stock-ai.dotent.workers.dev` ยังเปิด (`workers_dev=true` ห้ามลบ) traffic ไม่ cache | workers-dev-cache-inert:21 | ไม่ทำ (บันทึกไว้) |
| 17 | ไม่มี `x-cache` header — วินิจฉัย cache จากเวลาอย่างเดียว | workers-dev-cache-inert:20 | ไม่ทำ (บันทึกไว้) |
| 20 | ~23 ใบ EPS ค้าง >2% (HSY SNNP COP NUE CF …) | data-source-traps:153 | ระยะ 3 WS7 ตามปฏิทินงบ (WS6 trigger — ปฏิทินงบยังเป็น fallback จนกว่า #24 ปิด) |
| 24 | **ปฏิทินงบ: Yahoo ให้วันที่ <80%** — วัดจริง 12 ก.ย. 2569 รอบเต็ม 908 ใบ: มีวันที่ 719 (79.2%) · **TH `.BK` แค่ 51/238 (21%)** · US 668/670 ⇒ ไม่มีวันที่ 20.8% เกินเกณฑ์ 20% ⇒ ไม่ commit `earnings-calendar.json` / ไม่เปิด workflow (ตัวสร้าง `tools/earnings-calendar.js` + สาย `earningsAfterOf` ใน preflight อยู่ในรีโปแล้ว ใช้นโยบายอายุอย่างเดียวไปก่อน) — ต้องหาแหล่งวันงบหุ้นไทย (ปฏิทินหลักทรัพย์ SET / StockAnalysis earnings date) มาเสริมก่อนเปิด · **ตอนเปิดใช้ให้รู้ไว้:** ตัวสร้างมีกติกา carry-forward แล้ว (รอบที่ยิงล้ม = "ถามไม่ได้" → ยก `next` เดิมมาต่อ ไม่ล้างทิ้ง · ยิงสำเร็จแต่ไม่มีวันที่ = "คำตอบจริง" → ล้าง) และเกณฑ์ 20% คิดจาก `ไม่มีวันที่ / (ทั้งหมด − ยิงล้ม)` (`EC.nodateRatio`) | Task 17 (WS6 ข้อ 2) | ระยะ 3 WS7 (คู่กับ #20 EPS ค้างตามปฏิทินงบ) |
| 25 | **หนี้ที่ระยะ 1 ทำให้ "มองเห็น" แล้ว** — W22 ยิง 24 ใบ (f47 legend↔FV 16 · f24 เป้า gauge↔การ์ด 4 · f46 fairLine↔FV 2 · f49 mFair↔FV 1 · f54 vcell↔.fv-box 1) · W23 ยิง 109 ใบ (ราคาหลุดกรอบ 52 สัปดาห์ที่พิมพ์ไว้ — ขยับตามราคาทุกวัน ห้ามเลื่อนเป็น E โดยไม่รัน sweep ซ้ำ) | phase1-exit §7 | ระยะ 3 fix-on-touch (WS7) |
| 26 | queue: แถวอายุสังเคราะห์ (synthetic age) เสีย `model`/`prepAt`/`postcheck` เมื่อรัน `preflight` ข้ามวันซ้ำภายในรอบเดียว — กู้คืนได้ด้วย `prep <SYM>`/`--model` มือ | phase1-exit §7 | ระยะ 2 / เจ้าของ |
| 27 | queue: guard `postcheck` ของ `shipStock` ไม่ผูกขอบเขตรอบ — `postcheck:'pass'` ค้างจากรอบก่อนทำให้ `ship <SYM>` commit ได้โดยไม่ต้องสั่ง `ship <SYM>` ชัดเจนใหม่ | phase1-exit §7 | ระยะ 2 |
| 28 | queue: `roundStart` ยังผูก `flaggedAt > prev` — flag ใหม่จริงที่ลงวันที่ก่อนรอบเริ่ม (เช่นค้างจากรอบก่อน) จะไม่เปิดรอบใหม่ (ตั้งใจแบบระวังไว้ก่อน สังเกตผ่านข้อความ "ค้างจากรอบก่อน") | phase1-exit §7 | เจ้าของ / ระยะ 2 |
| 29 | `earnings-calendar.js --out` ข้าม gate `--write` และ guard `--limit` ได้ (สงบนิ่งอยู่ตราบที่ปฏิทินงบยังปิดใช้งาน — คู่กับ #24) | phase1-exit §7 | งานเปิดใช้ปฏิทินงบ (ตอนปิด #24) |
| 30 | `gen-docs.js` เขียน 5 เป้าหมายแบบไม่ atomic · marker ที่อยู่ใน code fence ของเอกสาร render ออกมาเป็น HTML comment ที่มองเห็นได้ (รับสภาพ) | phase1-exit §7 | ระยะ 2 docs |
| 31 | เส้นทาง `--th` ของ `/forecast/` ยังไม่เคยทดสอบกับของจริง — ต้อง probe `quote/bkk/<SYM>/forecast/` สักครั้ง | phase1-exit §7 | ระยะ 3 / WS9(b) |
| 32 | `tools/median-multiples.js` นับทุกคอลัมน์ FY ส่วน `fyYears` (Task 24) นับเฉพาะ FY ที่มี EPS(dil) จริง — สองเครื่องมือขัดกันได้บนหุ้นตัวเดียวกัน | phase1-exit §7 | ระยะ 2 |
| 33 | cron schedule เขียน `17 0 * * *` UTC (07:17 น. ไทย) แต่ commit จริงลงเวลา ~04:48–04:56 UTC (~11:50 น. ไทย) — หน่วงจากตาราง ~4.5 ชม. สม่ำเสมอ 3 วัน (คาดว่าเป็นคิวของ GitHub Actions) | phase1-exit §4(ง)/§7 | เจ้าของ (พิจารณาเลื่อนเวลา cron หรือรับสภาพ) |
| 34 | รอบ cron แรกที่ถือโค้ดครบทุกส่วน A–E (summary-cell pass #11 · PREPATCH triage · earnings fallback) คือรอบ 13 ก.ย. 2569 — ต้องตรวจ `price-flags.json` + บรรทัด `✓`/`notes`/`patch-rejected` ของรอบนั้น · PONY เข้า quarantine แล้ว 12 ก.ย. ด้วย `W17 (patch ทำให้ตก)` — healer #7 งดออกความเห็นเมื่อสามคอลัมน์ฉาก (Bear/Base/Bull) ขัดกันเอง ⇒ ไฟล์แบบนี้จะตก `patch-rejected` ทุกวันจนกว่าคนจะแก้ (ออกแบบไว้แบบนี้ แต่ต้องมีคนไล่ดูทุกใบ) | phase1-exit §7 | ระยะ 3 / runbook REJECTED bucket |

## ปิดแล้ว (ระยะ 0)

| # | รายการ | ปิดโดย |
|---|---|---|
| 3 | controller ต้อง diff เป้า/52wk/ปันผล/P-BV กับ prep ก่อน dispatch — อยู่แต่ใน memory | `npm run queue -- prep` (Task 12) |
| 12 | MEMORY.md บอกว่าเคส MC ใน quality-gate.md ผิด ทั้งที่แก้แล้ว | Task 19 Step 2 (memory) |
| 18 | เส้นทาง `analyze-wave` (Workflow) inject CLAUDE.md ไหม · default model ทางนี้ | Task 20 probe 12 ก.ย. 2569 (เจ้าของสั่ง · args ไม่ส่ง `model` · effort low): (1) "You are powered by the model named Sonnet 5" — ค่านี้มาจาก script pin `waveModel = args.model \|\| 'sonnet'` (`analyze-wave.js:20`) ไม่ใช่ default ของ harness ⇒ เส้นทางนี้**แน่นอน**ต่างจาก Agent tool (2) **ใช่** inject CLAUDE.md — worker เห็น "## 1. โครงสร้างโฟลเดอร์" (3) **ใช่** มี MEMORY.md index ~30 บรรทัด ⇒ role-scope `[controller]` ใน CLAUDE.md ใช้กับ worker ทั้งสองเส้นทาง |
| 21 | fixture ของ self-test/update-prices-test ผูกกับ BBL/AAPL จริง | Task 1–2 (PR #A) |

## ปิดแล้ว (ระยะ 1)

| # | รายการ | ปิดโดย |
|---|---|---|
| 2 | ป้าย marker gauge "เหมาะสม" ไม่มี gate (ICLR) | Task 9 (PR #32): field `f49` (ป้าย gauge mFair) ได้ binding `pair` → f44 (money) ⇒ ยิงเป็น **W22** เมื่อไม่ตรง |
| 4 | median-multiples ส่งค่าผิด 2 คลาส (สุดขั้ว · ผสมสกุล) — sanity ใน runbook แล้ว แต่ยังไม่มี fixture test ของตัวมันเอง | Task 23: `oneSymbol(spec, th, deps)` ฉีด `fetchFinPage`/`monthlyCloses`/`statementCurrency`/`finRow` ผ่าน `deps` (default = ของจริง) + `test/median-multiples-test.js` (offline, เรียกจาก `test/prep-stock-test.js`) ครอบ TTM/EPS≤0/outlier สุดขั้ว (เคส AU 2,074x)/ผสมสกุล (เคส CP)/MIN_POINTS |
| 7 | E41 ข้ามป้าย "P/E เฉลี่ย ~N ปี" — ป้ายอ้างช่วงยาวกว่าอายุหุ้น (GABLE) | Task 24: `parseVendor` นับ `fyYears` จากคอลัมน์ตัวเลขจริงบนแถว `EPS(dil)` ของตาราง [3] (หัก TTM เมื่อหัวตารางมี) → `prep()` บันทึกลง state + เติมบรรทัดเตือนใน prompt worker · `postcheck.checkFyYears(f55, fyYears)` ฟ้องเมื่อป้ายการ์ดเกินจริง — ★ นี่คือทางปิด #7 จริง แยกจาก manifest pair `f55↔f04` (`how:'years'`) ซึ่ง**ยังไม่ยิงใบไหนเลย (latent)** เพราะกราฟราคาไม่มีป้ายปี 4 หลักให้เทียบ — ขา manifest นั้นปล่อยไว้เป็นข้อมูลเสริมเฉย ๆ ไม่ใช่ตัวตัดสิน |
| 8 | `test:prep` ไม่อยู่ใน verify | Task 23: แทรก `node test/prep-stock-test.js` เป็นขั้นที่ 16 ของ `npm run verify` (หลัง `docs-test`) + `STEP_LABELS`/`.githooks/pre-push`/docs ผ่าน `tools/gen-docs.js` |
| 9 | bad-chart ผสมฐาน gate มองไม่เห็น (E36 ผิดพร้อมกัน) | Task 9 (PR #32): field `f41` (กรอบ 52 สัปดาห์) ได้ binding `pair` → f01 (contains · stale) ⇒ ยิงเป็น **W23** |
| 10 | ห้ามวาง shares ถัวเฉลี่ยลง prompt (CAMT) | Task 24: โค้ด (`SHARES_LABEL`/`SHARES_NOTE` ใน `printFinancialTable`) มีอยู่แล้วตั้งแต่ 17 ส.ค. 69 แต่ไม่มีเทสคุม — เพิ่ม `test/prep-stock-test.js` ยืนยัน `F.SHARES_LABEL === 'Shares(wAvgDil)'` และจับ stdout ของ `printFinancialTable` (export เพิ่มจาก `tools/fetch-fundamentals.js`) ว่าพิมพ์ `SHARES_NOTE` จริงเมื่อตาราง [3] มีแถว shares (fixture `amataFin`) และไม่พิมพ์เมื่อไม่มี |
| 13 | BBL ช่องสรุป "+2.1% (เกือบเต็มมูลค่า)" เครื่องหมาย/คำขัดกัน | ปิดเชิงกลไก (Task 11) · คลังกวาดแล้ว (Task 12 · 861 ใบ · W06 = 0) |
| 14 | `stock-meta.roe` ต้อง null เมื่อขาดทุน (OKJ) — postcheck เตือนแล้ว ยังไม่มี gate | **ปิดเชิงกลไก** (Task 9, PR #32): `checkPairs` มีกฎ `f57↔f40` เทียบ `stock-meta.roe` กับ `ctx.baseEPS` แล้ว (`tools/field-manifest.js:190-193`) — แต่ **ยิงไม่ได้จนกว่า `ctx.baseEPS` อ่านเครื่องหมายลบ** (`test/check-reports.js:275` ใช้ regex `/EPS ฐาน\s*~?\s*[฿$]?\s*([0-9.]+)/` ที่ไม่จับ `-` ⇒ ใบที่เขียน "EPS ฐาน ~−X" ได้ `baseEPS=null` ไม่ใช่ค่าติดลบ ⇒ เงื่อนไข `baseEPS<=0` เป็นจริงไม่ได้ ⇒ 0/908 วันนี้) — **ระยะ 2** (ดู phase1-exit §3 ตาราง "ข้อจำกัดที่ประกาศไว้ ไม่ใช่ผ่านแบบเงียบ") |
| 19 | W06 ยิง 553/908 ก่อน 17 ส.ค. — เดิมต้องให้คนแก้เพราะ cron ไม่แตะคำ | ปิดเชิงกลไก (Task 11) · คลังกวาดแล้ว (Task 12 · 861 ใบ · W06 = 0) |
| 22 | คิว price-flags เป็น snapshot — pre-patch ด้วย --force ล้าง flag ก่อนวิเคราะห์ ทำให้สถานะรอบอยู่แค่ใน .queue/state.json (per-machine) — ต้องการคิวถาวรใน repo | Task 15: state ย้ายไป `<checkout หลัก>/.queue` (`resolveQueueDir` ใน `tools/queue/state.js` ใช้ `git rev-parse --git-common-dir`) — ข้าม worktree ✓ ข้ามเครื่อง ✗ (ถ้าใช้หลายเครื่องต้องย้าย state เข้า repo) |
| 23 | lockfile ไม่มี heartbeat — holder ที่ทำงานเกิน 10 นาทีจะถูกยึด lock และตอนปล่อยจะลบ lock ของคนใหม่ (ยังไม่เกิดเพราะไม่มี holder ทำงานยาวใต้ lock) | Task 4 (PR #31): `tools/lockfile.js` — holder async ได้ heartbeat จน settle แล้วค่อยปล่อย lock (holder sync ยังห้ามยาวตามเดิม) |
