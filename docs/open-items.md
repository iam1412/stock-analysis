# Open items — ของค้างของโปรเจกต์ (ย้ายจาก memory 11 ก.ย. 2569 · docs-audit §6)

> memory เป็นของ session ไม่ใช่ของโปรเจกต์ — ข้อเสนอที่อยู่แต่ใน memory เคยหาย (29 ส.ค. → ระเบิด 9 ก.ย.) · ไฟล์นี้คือที่เดียวที่บันทึกของค้าง · ปิดแล้ว = ย้ายไปตาราง "ปิดแล้ว" พร้อม commit/PR · เพิ่มใหม่ = 1 แถว ไม่เขียนย่อหน้า

## เปิดอยู่

| # | รายการ | ที่มา | ปิดใน |
|---|---|---|---|
| 1 | `%/ปี` ในประโยคสรุปหมวด 6 เป็น prose — ไม่มี warning/ตัวซ่อม | price-derived-staleness:113 | ระยะ 1 WS1 manifest (ช่อง #35b) · ระยะ 2 token |
| 2 | ป้าย marker gauge "เหมาะสม" ไม่มี gate (ICLR) | price-derived-staleness:175 | ระยะ 1 WS1 (NEITHER #49) |
| 4 | median-multiples ส่งค่าผิด 2 คลาส (สุดขั้ว · ผสมสกุล) — sanity ใน runbook แล้ว **แต่ยังไม่มี fixture test ของตัวมันเอง** | price-derived-staleness:163 | ระยะ 1 WS9 |
| 5 | W05 มองไม่เห็น "สองขาตระกูลเดียว" (WWD) | price-derived-staleness:174 | ระยะ 1 WS1/WS9 |
| 6 | การ์ด EV/Sales · EV/EBITDA · DCF ไม่มี checker | data-source-traps:258 | ระยะ 1 WS1 (NEITHER #62) |
| 7 | E41 ข้ามป้าย "P/E เฉลี่ย ~N ปี" — ป้ายอ้างช่วงยาวกว่าอายุหุ้น (GABLE) | data-source-traps:271 | ระยะ 1 WS9(a) นับคอลัมน์ FY จริง |
| 8 | `test:prep` ไม่อยู่ใน verify | data-source-traps:230 | ระยะ 1 WS8(7) |
| 9 | bad-chart ผสมฐาน gate มองไม่เห็น (E36 ผิดพร้อมกัน) | data-source-traps:69 | ระยะ 1 WS1 (52wk เป็นช่องที่ตรวจ) |
| 10 | ห้ามวาง shares ถัวเฉลี่ยลง prompt (CAMT) | data-source-traps:120 | ระยะ 1 WS9(a) ให้ prep-stock ติดป้ายแถว |
| 11 | 6 ใบสองขาตระกูลเดียว ยังไม่แก้ | fv-family-weighting:22 | ระยะ 3 WS7 fix-on-touch (ลิสต์ในไฟล์ memory) |
| 14 | `stock-meta.roe` ต้อง null เมื่อขาดทุน (OKJ) — postcheck เตือนแล้ว ยังไม่มี gate | bulk-stock-analysis-workflow:81 | ระยะ 1 WS1 |
| 15 | คำขอคำศัพท์ 49 รายการใน `tags.json.requests` รอเจ้าของ | tag-system-2026-08:19 | เจ้าของรีวิว |
| 16 | `stock-ai.dotent.workers.dev` ยังเปิด (`workers_dev=true` ห้ามลบ) traffic ไม่ cache | workers-dev-cache-inert:21 | ไม่ทำ (บันทึกไว้) |
| 17 | ไม่มี `x-cache` header — วินิจฉัย cache จากเวลาอย่างเดียว | workers-dev-cache-inert:20 | ไม่ทำ (บันทึกไว้) |
| 20 | ~23 ใบ EPS ค้าง >2% (HSY SNNP COP NUE CF …) | data-source-traps:153 | ระยะ 3 WS7 ตามปฏิทินงบ (WS6 trigger) |
| 23 | lockfile ไม่มี heartbeat — holder ที่ทำงานเกิน 10 นาทีจะถูกยึด lock และตอนปล่อยจะลบ lock ของคนใหม่ (ยังไม่เกิดเพราะไม่มี holder ทำงานยาวใต้ lock) | final review ระยะ 0 | ระยะ 1 WS4 |

## ปิดแล้ว (ระยะ 0)

| # | รายการ | ปิดโดย |
|---|---|---|
| 3 | controller ต้อง diff เป้า/52wk/ปันผล/P-BV กับ prep ก่อน dispatch — อยู่แต่ใน memory | `npm run queue -- prep` (Task 12) |
| 12 | MEMORY.md บอกว่าเคส MC ใน quality-gate.md ผิด ทั้งที่แก้แล้ว | Task 19 Step 2 (memory) |
| 18 | เส้นทาง `analyze-wave` (Workflow) inject CLAUDE.md ไหม · default model ทางนี้ | Task 20 probe 12 ก.ย. 2569 (เจ้าของสั่ง · args ไม่ส่ง `model` · effort low): (1) "You are powered by the model named Sonnet 5" — ค่านี้มาจาก script pin `waveModel = args.model \|\| 'sonnet'` (`analyze-wave.js:20`) ไม่ใช่ default ของ harness ⇒ เส้นทางนี้**แน่นอน**ต่างจาก Agent tool (2) **ใช่** inject CLAUDE.md — worker เห็น "## 1. โครงสร้างโฟลเดอร์" (3) **ใช่** มี MEMORY.md index ~30 บรรทัด ⇒ role-scope `[controller]` ใน CLAUDE.md ใช้กับ worker ทั้งสองเส้นทาง |
| 13 | BBL ช่องสรุป "+2.1% (เกือบเต็มมูลค่า)" เครื่องหมาย/คำขัดกัน | Task 11 (ระยะ 1 ข้อ D) — cron เขียนช่องสรุปทั้งช่องเป็นคลังคำคงที่ `MOS ~ ±X%` ตรงกับ `.big` (`summaryPlan` = healer #11) ⇒ ใบที่เครื่องหมายกับคำขัดกันเองไม่มีอีก · **กวาดคลัง 861 ใบใน Task 12** |
| 19 | W06 ยิง 553/908 ก่อน 17 ส.ค. — เดิมต้องให้คนแก้เพราะ cron ไม่แตะคำ | Task 11 (ระยะ 1 ข้อ D) — W06 ถาม `DV.summaryPlan` ตัวเดียวกับตัวซ่อม ไม่ผูก dead-band อีก ⇒ ทุกเคสที่ยิงเป็นเคสที่ healer ซ่อมได้เชิงกล (ยิง 861 ใบหลังเปลี่ยนกติกา — Task 12 กวาด) |
| 21 | fixture ของ self-test/update-prices-test ผูกกับ BBL/AAPL จริง | Task 1–2 (PR #A) |

## ปิดแล้ว (ระยะ 1)

| # | รายการ | ปิดโดย |
|---|---|---|
| 22 | คิว price-flags เป็น snapshot — pre-patch ด้วย --force ล้าง flag ก่อนวิเคราะห์ ทำให้สถานะรอบอยู่แค่ใน .queue/state.json (per-machine) — ต้องการคิวถาวรใน repo | Task 15: state ย้ายไป `<checkout หลัก>/.queue` (`resolveQueueDir` ใน `tools/queue/state.js` ใช้ `git rev-parse --git-common-dir`) — ข้าม worktree ✓ ข้ามเครื่อง ✗ (ถ้าใช้หลายเครื่องต้องย้าย state เข้า repo) |
