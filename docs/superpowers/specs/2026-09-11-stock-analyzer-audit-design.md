# แผน audit ระบบวิเคราะห์หุ้น — หยุดวงจร "เจอบั๊กใหม่ทุกรอบเคลียร์คิว"

> วันที่: 11 ก.ย. 2569 · สถานะ: **เจ้าของอนุมัติ 11 ก.ย. 2569 — เคาะข้อ 9 ตามข้อเสนอแนะทั้ง 6 (A ข · B ข · C ค · D ข · E ข · F ข)** · แผนลงมือระยะ 0: `docs/superpowers/plans/2026-09-11-stock-analyzer-audit-phase0.md` · สาขา `claude/stock-analyzer-audit-9678cd`
> ระยะ 1 ผ่านเกณฑ์จบ 5/5 (12 ก.ย. 2569 · PR #31–#35 + PR ส่วน F (เปิดหลังรีวิว)) → `docs/superpowers/audit/2026-09-11-stock-analyzer/phase1-exit.md` · ระยะ 2 = แผน `…-phase2-data-layer.md` (ยังไม่เขียน)
> หลักฐานดิบทั้งหมดอยู่ที่ `docs/superpowers/audit/2026-09-11-stock-analyzer/` (คัดลอกจาก scratchpad ของ session นี้ — scratchpad หายพร้อม session)
> เอกสารนี้คือ **แผน** ไม่ใช่การลงมือ — การลงมือเริ่มที่แผนระยะ 0 (ลิงก์ข้างบน) · ระยะ 1–3 เขียนแผนแยกเมื่อระยะก่อนหน้าผ่านเกณฑ์จบ

---

## 0. สรุปสำหรับเจ้าของ

**อาการที่แจ้ง:** สั่ง "เคลียร์คิว price-flags" ทีไร เจอปัญหาใหม่ทุกที ต้องแก้บั๊กระหว่างทาง รอบหนึ่งลากยาว

**สิ่งที่วัดได้ (ข้อ 1):** อาการนี้ไม่ใช่ความรู้สึก — ตั้งแต่ 11 ก.ค. 69 มี commit แก้ระบบ ~320 ต่อ commit วิเคราะห์ 915 · สัปดาห์ 10–16 ส.ค. commit แก้ (95) มากกว่าวิเคราะห์ (32) · gate โต 10 รหัสใน 25 วัน · **23 session ตั้งแต่ 9 ส.ค. (10 รอบเคลียร์คิว + 13 session ซ่อม/นโยบายที่รอบเหล่านั้นบังคับให้ทำ) = ~176 ปัญหา · ~6,700 turn · ~46 ชม. งานจริง — gate อัตโนมัติจับ "ปัญหาเชิงสาระที่เผยแพร่" ได้ 0 ทุกตัวเลขที่ผิดผ่าน `npm test` 43/43** · เวลาส่วนใหญ่ไม่ได้อยู่ที่การเคลียร์คิว (1–2 ชม./รอบ) แต่อยู่ที่ session ซ่อมที่ตามมา (0.5–13 ชม./ครั้ง)

**ข้อค้นพบหลัก:** ปัญหาที่ดู "ใหม่" ทุกรอบเป็น **อาการใหม่จากเหตุราก 4 ข้อเดิม** (ข้อ 2) ไม่ใช่บั๊กอิสระ กฎที่เพิ่มหลังทุกเหตุการณ์ (ตอนนี้ 46 กฎสำหรับ worker · 42 ขั้นสำหรับ controller ต่อรอบ) แก้ที่อาการ จึงไม่ลดอัตราการเกิด — และตัวกฎเองเริ่มขัดกัน 17 คู่

**ข้อเสนอ:** audit + แก้เป็น 9 สายงาน 4 ระยะ (ข้อ 4–6) · ระยะ 0 ใช้ ~1 สัปดาห์ ตัดวงจรทันที (runbook script แทนความจำ · fixture สังเคราะห์ · cron กักกันรายไฟล์ · ล้างกฎที่ขัดกัน) · ระยะถัดไปแก้เหตุรากจริง (field manifest → ย้ายตัวเลขเข้า data layer)

**ต้องตัดสินใจ 6 ข้อ (ข้อ 9)** — ข้อใหญ่สุดคือ **A: จะย้ายตัวเลขทั้งหมดออกจาก HTML ที่ render แล้วไปเป็นข้อมูลชั้นเดียวหรือไม่** (แก้ต้นตอ 5 ใน 9 หมวด แต่ต้อง migrate 908 ไฟล์)

---

## 1. หลักฐาน — ตัวเลขที่วัดจริง 11 ก.ย. 2569

| มิติ | ค่าที่วัด | ที่มา |
|---|---|---|
| **ภาษีการแก้ (fix tax)** | commit ตั้งแต่ 11 ก.ค. 69: `analyze:` 915 · `price:` 66 · **แก้/gate/docs/chore/feat/build/test ≈ 320** · สัปดาห์ W33 (10–16 ส.ค.): analyze 32 vs แก้ 95 | `git log` |
| **gate โตแบบตามหลังเหตุการณ์** | 62 รหัส (43 E + 19 W) · **10 รหัสล่าสุด (E41–E43, W14–W20) เกิด 18 ส.ค.–11 ก.ย.** · 9 ใน 11 รหัสหลังสุดเป็นคลาสเดียวกัน ("ค่าที่ = ราคา ÷/× สิ่งที่ใบพิมพ์ แล้วไม่มีใครขยับ") ลงทีละช่อง | `git log -S` ใน `test/check-reports.js` · code-audit §7.4 |
| **ขนาดโค้ดที่โตเร็ว** | `check-reports.js` 272 → 832 บรรทัด · `update-prices.js` 357 → 906 · `derived-values.js` 0 → 910 **ใน 23 วัน** · ค่าคงที่ที่จูนมือ ≈46 ตัว | code-audit §7 |
| **องค์ประกอบคิว** | ตั้งแต่กลาง ส.ค. ทุก snapshot: `mos-sign-flip` = 67–83% ของคิว (13 ส.ค.: 8/11 · 20 ส.ค.: 10/12 · 29 ส.ค.: 14/20 · 5 ก.ย.: 14/21 · 9 ก.ย.: 19/27) · รอบ 9 ส.ค. 47% (19/40 — รอบ drift/split หนัก) · KLAC/LRCX กลับเข้าคิว 2 วันหลัง LIGHT | `git show <sha>:price-flags.json` 80 จุด |
| **ต้นทุนต่อรอบ** | S08 (27 ตัว): 752 turn · 5.3 ชม. · 30 ปัญหา · re-dispatch 7 · ~5.2M token subagent · S04 (20 ตัว): 168 turn 0.9 ชม. 7 ปัญหา · S09 (3 ตัว): 109 turn + controller แก้เอง 25 จุดหลัง worker จบ | incidents-B |
| **gate จับสาระได้เท่าไร** | 23 ส.ค.–11 ก.ย. (10 session / ~73 ปัญหา): gate ยิงเฉพาะ presentation (E26 ลำดับสเกล · W06 คำบอกทิศ) · **ตัวเลขผิดทุกตัว (P/E GRAB · Market Cap FICO · ROE KLAC · EPS BGC/ROP/UMC · สมอตาย ODFL) ผ่าน 43/43** · จับโดย controller spot-check 18 · worker เอง 8 · advisor 2 · เจ้าของ 2 · **9–20 ส.ค. (13 session / ~103 ปัญหา / ~33 คลาสใหม่): gate จับ 0 เช่นกัน** — ยิงแค่บนสถานะกลางที่ตั้งใจให้ค้าง (ONON/AAOI/COHR) | incidents-A/B สรุปท้าย |
| **ต้นทุน 9–20 ส.ค.** | 6 รอบเคลียร์คิว + 7 session ซ่อม (**ทุก session ซ่อมถูก spawn จากรอบเคลียร์คิว 7/7**) · ~4,830 turn · 52 ชม. elapsed / ~34 ชม. งานจริง · mega-session 17–18 ส.ค.: 2,297 turn / 87 commit / ~13 ชม. — พบว่า **warning 81 ใน 84 เป็น checker ฟ้องปลอม** ไม่ใช่รายงานผิด · ชนิดปัญหาเปลี่ยนกลางหน้าต่าง: รอบ 1–3 = แหล่งข้อมูล/plumbing ภายนอก (SA 403 · GF EPS รายไตรมาส · Yahoo ไม่ปรับ split · price-flags race) → รอบ 4–6 = **เครื่องมือของเราเองโกหก** (prompt ใส่ shares ถัวเฉลี่ยเป็นคงเหลือ → CAMT ค่าถูกถูกแก้เป็นผิด · prep-stock "✅ Δ EPS 0%" ทั้งที่ vendor ผิดทั้งคู่ AMATA 39% · บรรทัด `770÷195=4.12` หารไม่ลง · คำเตือน dual-class เขียนกลับด้าน) | incidents-A สรุปท้าย |
| **cron ล้ม** | 22–24 ส.ค. (3 วัน) + run #54 (2 ก.ย.) — สาเหตุเดียวกัน: fixture ของเทสคือไฟล์จริงที่ cron แก้ทุกเช้า · วัดโอกาสล้ม ≈38%/วัน ก่อนแก้ | incidents-B S02/S05/S06 |
| **หนี้เก่าในคลัง (latent debt)** | รายงาน 908 ใบ: **786 ใบ** มี "ราคาปัจจุบัน $X" ใน prose ที่ไม่ตรงราคา header · **222 ใบ** มีขา FV ยืนบนเป้านักวิเคราะห์ · **266 ขา** FV ห่างราคา ≤3% (ตัวชี้สมอตาย) · warning เปิดค้าง **149** (W15 97 · W06 51 · W05 1) ทั้งหมดอยู่ใน prose ที่ cron แตะไม่ได้ | `node tools/spotcheck.js` ทุกตัว · `npm test` |
| **อายุการวิเคราะห์** | มัธยฐาน 57 วัน · **391 ใบ อายุ 61–90 วัน** (= ผ่านงบมาแล้ว ≥1 ไตรมาสโดยไม่ได้ทบทวน EPS) · 2 ใบ >120 วัน (SNA 441 · BAM 249) · footer ปี พ.ศ. 751 / ค.ศ. 126 / อ่านไม่ออก 31 | `measure-analysis-age.js` |
| **กระบวนการ controller** | **42 ขั้นต่อรอบ** (38 หลัก + 4 เงื่อนไข): script ทำให้จริง 4 · มี script แต่ต้องจำไปรัน 10 · **จำล้วน 24** · 11 ใน 24 อยู่แค่ใน memory หรือ docs ที่ worker ไม่เห็น | docs-audit §5 |
| **กติกา** | กฎ worker 46 ข้อ: **26 ข้อไม่มีโค้ดบังคับ** · 19 ข้อไม่อยู่ในทางอ่านของ worker · ขัดกันเอง **17 คู่** · ล้าสมัย 16 · กฎที่ซ้ำ ≥5 ที่ **drift แล้ว 6/6** · เลขจำนวนขั้น gate มี 4 เวอร์ชัน (13/11/8/8) | docs-audit §1–4 |
| **บริบทที่ worker ได้จริง** (probe 11 ก.ย.) | worker ที่ spawn ผ่าน Agent tool ได้ **CLAUDE.md ทั้งฉบับ + MEMORY.md index 27 บรรทัด** พร้อมกรอบ "OVERRIDE … MUST follow exactly" · ไม่ได้ SKILL.md · ⇒ worker ถือ §5 "commit+push อัตโนมัติ" กับ prompt "ห้าม push" พร้อมกัน (= เคส HD 12 ก.ค.) · เส้นทาง `analyze-wave` ยังไม่ได้ probe | probe subagent |

---

## 2. เหตุราก 4 ข้อ — ทำไมเพิ่มกฎแล้วยังเกิดซ้ำ

### R1 · "HTML ที่ render แล้ว" คือฐานข้อมูล
ตัวเลขทุกตัวถูกพิมพ์เป็นข้อความแสดงผล **หลายสำเนา ไม่มีต้นฉบับ** — ใน skeleton ใบเดียว ราคาอยู่ 7–8 ที่ · FV 9–10 ที่ · MOS 4 ที่ (code-audit §1.0) · ผู้บริโภค 3 โปรแกรม (cron · gate · spotcheck) ต่างคน**ต่าง regex** ถอดค่ากลับจากข้อความ (`.px` มี 6 regex / 4 คำศัพท์สกุลเงิน · บล็อก stock-meta มี 8 สำเนา production ทั้งที่ `report-meta.js` ประกาศตัวเป็น single source) · ผู้ผลิตคนที่ 4 (LLM) แก้ข้อความมือ
**ผลที่ตามมาโดยโครงสร้าง:**
- ช่องใดไม่ได้ (เขียนโดย cron ∧ ตรวจโดย gate ∧ ซ่อมได้) = ค้างเงียบ ค้นพบเมื่อคนอ่าน — matrix 68 ช่อง: **NEITHER 18 ช่อง** (52wk · เป้า+จำนวนสำนัก · rating · BVPS · EPS card · `chart.fairLine` ไม่เคยถูกเทียบกับ FV · legend · marker gauge · vcell กรอบ FV · ป้าย "P/E เฉลี่ย ~5 ปี" · ATH% · ราคาใน prose …) · **UNVERIFIED WRITE 3 ช่อง** (cron เขียนทุกวัน ไม่มีใครตรวจผล: วันที่ใน disclaimer · วันที่วงเล็บ · ป้าย mCur) · WARN-ONLY 11 ช่อง
- **gate ถูกนิยามให้ตรวจเฉพาะที่ healer เขียนได้** (`check-reports.js:685`, `derived-values.js:349` — ตั้งใจ เพื่อไม่ให้มี warning ที่เคลียร์ไม่ได้) ⇒ gate **ตาบอดตรงที่บั๊กตัวถัดไปอยู่เสมอ** การค้นพบจึงเป็นของคนตลอดไป
- **"อ่านไม่ได้" กับ "สอดคล้อง" ให้ผลเหมือนกัน** — 21 E-code + ทั้ง 19 W-code `return null` เมื่อ regex ไม่ match · `patchDerived` มีทางออกเงียบ 39 จุด · 3 replace ใน `patchReport` ไม่มี `need()` · เคย "สะอาดปลอม" มาแล้ว (index bug ทำทุก check เงียบพร้อมกัน) · E27 (ราคาเก่า >120 วัน) ปิดตัวเองเมื่อวันที่อ่านไม่ออก
- parser 2 ชุดอ่านหมวด 6 ต่างกัน 4 จุด (E24/W01 vs W17/healer) ⇒ คอลัมน์ที่คนหนึ่งเห็นอีกคนไม่เห็น

### R2 · `verify` ระดับรีโปตัวเดียว = ทั้งประตู cron และประตู push
- ไฟล์เสีย 1 ใบ = ทิ้ง patch ดี ~900 ใบของวันนั้น (ไม่มี quarantine รายไฟล์) ⇒ **ทุก check ใหม่ถูกบังคับลงที่ warn** และ tolerance ถูกขยายจน healer เคลียร์ได้เสมอ — **ระดับความเข้มของ gate ถูกตั้งจากความอยู่รอดของ cron ไม่ใช่จากความถูกต้อง** (`check-reports.js:682`, `:737`)
- **fixture ของเทส = ไฟล์จริงที่ cron แก้ทุกเช้า ในงานเดียวกัน** (`update-prices-test.js` ใช้ AAPL/BBL · `self-test.js` ใช้ BBL · CI patch ก่อน verify) ⇒ 2 ใน 13 ขั้นของ gate เป็นฟังก์ชันของราคาปิดวันนั้น · แก้แล้ว 3 รอบ (S02/S05/S06) ทุกรอบเป็น "กฎ fixture" ไม่ใช่ "ขอบเขต fixture"
- `expandReport` อยู่นอก try/catch ของ gate ⇒ report-data เสีย 1 ไฟล์ = gate ตายทั้งรัน

### R3 · กระบวนการอยู่ในความจำ + กติกากระจายและขัดกัน
- 42 ขั้น/รอบ · 24 ขั้นจำล้วน · **ไม่มี runbook/script/`npm run` ใดร้อยเรียงเส้นทางของคน** (มีแต่ของ cron) ⇒ "พลาดขั้นใหม่ทุกรอบ" เป็นผลทางคณิตศาสตร์ ไม่ใช่ความสะเพร่า · ตัวอย่างชัด: S04 (29 ส.ค.) เสนอกฎ "pre-fetch มัธยฐานทุกใบที่ FV เปลี่ยน" แล้วค้าง "รอเคาะ" → S08 (9 ก.ย.) พังด้วยเหตุนั้นเป๊ะ (ODFL/EXPE/DASH) แล้ว controller เขียนสาเหตุด้วยคำเดียวกัน
- กฎอยู่ 6 ไฟล์ (CLAUDE.md · SKILL.md · agent-prompt.md · orchestration.md · quality-gate.md · price-refresh.md) + memory 27 ไฟล์ · **คู่ที่ขัดกัน 17** — คู่ที่อันตรายสุด: SKILL สั่ง worker รัน `update-prices --force` ทุกรอบ (และ tool ออกแบบบนสมมติฐานนั้น) แต่ memory สั่งห้าม (price-flags.json race) และคำสั่งห้าม**ไม่อยู่ใน template ใด** · agent-prompt สั่ง worker รัน `pick-brand` แต่ CLAUDE.md ห้ามเมื่อขนาน · `analyze-wave.js` บรรทัด 3 กับ 4 พูดคนละทาง
- **worker ได้ CLAUDE.md ทั้งฉบับแบบ MUST-follow** (probe) ⇒ กฎ controller (§3/§5 auto-push) กลายเป็นบริบทที่ขัดกับ prompt · ขณะที่กฎที่ควรถึง worker จริง (ชั้น 0 valuation 9 ข้อ) ไม่ถึง
- เครื่องมือที่ controller สร้างเองไม่มีเทส ⇒ `median-multiples.js` ส่งค่าผิดให้ worker 2 คลาสภายในชั่วโมงแรก (2,074x · CAD/USD) — จับได้เพราะรายงานขัดกันเอง ไม่ใช่เพราะ check · ก่อนหน้านั้น `prep-stock`/`fetch-fundamentals` ก็ทำแบบเดียวกัน 4 ครั้งใน ส.ค. (verdict ✅ ปลอม · บรรทัดที่มาหารไม่ลง · คำเตือนกลับด้าน · canary ที่ match ข้อความล้มของตัวเอง = check ที่ fail ไม่ได้) · `npm run test:prep` ยังไม่อยู่ใน verify
- **ข้อเสนอที่เคยมีแล้วหายไปในความจำ** เป็นรูปแบบซ้ำ: chip ที่ไม่ถูกทำ 3 ชิ้นใน ส.ค. (ATH-date · SITM · LITE) + ข้อเสนอ 29 ส.ค. + open item 21 รายการใน memory ที่ไม่มีเจ้าของ — ไม่มีที่เก็บ backlog ในรีโป

### R4 · คิวเต็มไปด้วยหุ้นแกว่งรอบ FV ที่ไม่มีข้อมูลใหม่ — แต่ต้องจ่าย LLM ทุกครั้ง
- `mos-sign-flip` ≈ 2 ใน 3 ถึง 4 ใน 5 ของคิวตั้งแต่กลาง ส.ค. · ส่วนใหญ่ EPS ไม่เปลี่ยน FV ไม่เปลี่ยน ⇒ งานจริงของ worker คือ "ไล่แก้ prose ที่อ้างราคาเก่า + คำบอกทิศ" = 11–13 turn / ~0.7M token ต่อตัว เพื่อผลลัพธ์ที่ cron ควรทำได้ถ้า prose ไม่ผูกราคา
- **ทุกครั้งที่แตะใบเก่า = ขุดเจอหนี้เก่า** (786 ใบ prose ราคาค้าง · 391 ใบอายุ >60 วัน · 222 ใบขาเป้านักวิเคราะห์) ⇒ "ปัญหาใหม่" ส่วนหนึ่งคือของเก่าที่เพิ่งถูกเปิด ไม่ใช่ของใหม่ — และไม่มีนโยบายว่าจะกวาดเป็นชุดหรือ fix-on-touch
- KLAC/LRCX: LIGHT แล้ว 2 วันกลับเข้าคิว — zone-crosser MOS ใกล้ 0 ขยับ 6% ก็หลุด dead-band ±3 ⇒ วนไม่รู้จบโดยออกแบบ

---

## 3. อนุกรมวิธานปัญหา — 9 หมวด

| # | หมวด | อาการที่เจอจริง (ตัวอย่าง) | เหตุราก | ทำไมกฎเดิมไม่พอ |
|---|---|---|---|---|
| T1 | **ช่องที่ derive จากราคาแล้วค้าง** | `stock-meta.pe` (GRAB/FORM) · % เป้า (AAOI) · Market Cap (FICO 43%) · P/S · ผลตอบแทนฉาก 3 ปี (RGLD Bear +8.7%) · ปันผล%/P-BV (FDS) · 52wk · เป้า+n (AEHR ขา FV) · ROE (KLAC) · `roe` ไม่ null (OKJ) | R1 | แก้ทีละช่อง (E41→W20) เพราะ**ไม่มี manifest** ว่าช่องไหนบ้างขึ้นกับราคา — gate รู้จักเฉพาะช่องที่ healer รู้จัก |
| T2 | **สัญญา cron↔gate** | E-code ใหม่บล็อก cron ทั้งรีโป ⇒ ลงเป็น warn · tolerance ขยาย · regex miss = pass · UNVERIFIED WRITE 3 ช่อง · parser 2 ชุด | R1+R2 | ไม่มีรายงาน "ตรวจได้กี่ช่อง/ข้ามกี่ช่อง" ต่อไฟล์ ⇒ เงียบ = สะอาด |
| T3 | **fixture ผูกราคาจริง** | cron ล้ม 3 วัน (BBL) · run #54 (AAPL, 38%/วัน) · E36 ฿150 · W17 ฿250 | R2 | เขียน "กฎ fixture" ในหัวไฟล์ 5 ข้อ แทนที่จะตัดขาดจากไฟล์จริง |
| T4 | **ไฟล์ร่วมไม่มี lock** | `price-flags.json` (flag ฟื้น) · `seeds.json` (สีชน gate มองไม่เห็น) · `tags.json` · issue GitHub เขียนทับ | R3 | แก้ด้วยกฎ prose ("controller pre-patch/pre-assign") ไม่ใช่ permission/lock |
| T5 | **กระบวนการ controller** | ลืม pre-fetch มัธยฐาน (S08) · ลืม `--th` (AU → AngloGold) · ลืมเทียบ snapshot vendor (S09 แก้เอง 25 จุด) · issue ค้างเปิด (S01/S08 เจ้าของถามเอง 2 ครั้ง) · ตลาด US เปิดกลางเวฟ · `reports.json.updated` ใช้ตัดสินความสดไม่ได้ | R3 | 42 ขั้น 24 ขั้นจำ — เพิ่มกฎ = เพิ่มภาระจำ ไม่เพิ่มพื้น |
| T6 | **ดุลยพินิจ worker ด้าน valuation** | สมอตาย (CBOE 23 ส.ค. → ODFL/EXPE 9 ก.ย. → W18) · เป้านักวิเคราะห์เป็นขา (CRM/AEHR/WMT) · หน้าต่าง 12 เดือน (CRWD) · ฐาน GAAP/adj ข้ามกัน (AKAM/ICLR) · ตระกูลเดียว 2 เสียง (WWD — W05 มองไม่เห็น) · "P/E เฉลี่ย 5 ปี" บนหุ้นอายุ 3 ปี (GABLE/CPW/SAPPE) | R1 (semantic อยู่ใน prose) | หลักฐานชัด: **"ส่งตัวเลขให้" ได้ผล "เตือน" ไม่ได้ผล** (ODFL หลุดทั้งที่ prompt เตือน · พอมีบล็อกมัธยฐาน PATH/GWRE/UMC/ROP ทำถูกเอง) |
| T7 | **กับดักแหล่งข้อมูล** | Shares ถัวเฉลี่ย≠คงเหลือ · quote ค้าง 3 ไตรมาส · entity mismatch หลังควบรวม (VMRK) · fwd EPS คนละปีงบ · Yahoo ไม่ปรับ split · SA cap ล้าหลัง quote ตัวเอง · ADR/ordinary (UMC) | ธรรมชาติของ vendor | catalog 20+ ข้อใน memory `data-source-traps` — **ยังไม่ได้แยกว่าข้อไหน prep-stock ตรวจได้เชิงกล** (บางข้อทำแล้ว: [2b], Δ quote↔ตาราง) |
| T8 | **หนี้เก่าในคลัง** | prose ราคาค้าง 786 ใบ · W15/W06 149 · อายุ >60 วัน 391 · ค.ศ. 126 ใบ · ขาเป้านักวิเคราะห์ 222 · 6 ใบสองขาตระกูลเดียว · 84 ใบหมวด 6 ไม่สอดคล้องกันเอง | R4 | ไม่มีนโยบาย batch-vs-fix-on-touch · กวาดชุดใหญ่ทำ `updated` เด้ง (พัง dedup/หน้าแรก) ถ้าไม่ทำท่า preserve-dates |
| T9 | **กติกา** | ขัดกัน 17 คู่ · ล้าสมัย 16 · ซ้ำ ≥5 ที่ drift 6/6 · worker ได้ CLAUDE.md ทั้งฉบับ · memory มี open item 21 รายการที่ไม่มีใครเป็นเจ้าของ | R3 | ไม่มี single source ต่อกฎ · เลข (13 ขั้น/62 รหัส) พิมพ์มือหลายที่ |

---

## 4. สายงาน audit + แก้ (WS1–WS9)

แต่ละสายงาน = **ขอบเขต · วิธี audit · สิ่งส่งมอบ · หมวดที่ปิด · ขนาด (S ≤1 session · M 2–3 · L ≥4)**

### WS1 · Field manifest → data layer (แก้ R1) — หมวด T1 T2 T6
- **ขอบเขต:** ทุกช่องตัวเลขในรายงาน (68 แถวใน code-audit §1.1 เป็นจุดตั้งต้น)
- **วิธี:** (1) แปลง matrix เป็น **ไฟล์ manifest ที่โค้ดใช้จริง** (`tools/field-manifest.js`: selector · สูตร · ตัวหารมาจากไหน · cadence daily/write-once · owner cron/worker · gate code · healer) — cron, gate, spotcheck, checklist ใน prompt worker ต้อง**อ่านจาก manifest ตัวเดียว** ไม่มี regex ซ้ำ (2) ทุก extractor ต้องคืน "found/not-found" แยกจาก "ok/mismatch" และ gate พิมพ์ **coverage ต่อไฟล์** ("ตรวจได้ 61/68 ช่อง · ข้าม 7: …") ⇒ "เงียบ" ไม่ใช่ "สะอาด" อีกต่อไป (3) รวม parser หมวด 6 ให้เหลือชุดเดียว · รวม regex stock-meta/report-data/`.px` ให้เหลือ module เดียว (4) **ตัดสินใจ A** → ถ้าเคาะ: migrate ตัวเลขทั้งหมดเข้า `report-data`/`stock-meta` แล้ว build render ลง HTML (แบบเดียวกับที่ TA chart/counters/theme inject ตอน build อยู่แล้ว) — prose อ้างตัวเลขผ่าน token ที่ render จากข้อมูล ⇒ สำเนา 7–10 → 1 · cron แก้ 1 ที่ · gate เทียบ JSON ไม่ใช่ regex
- **ส่งมอบ:** manifest + coverage report + parser เดียว · (ถ้า A) migrator + skeleton/engine ใหม่ + self-test
- **ขนาด:** M (manifest) / **L** (migration)

### WS2 · สัญญา cron↔gate (แก้ R2) — หมวด T2 T3
- **ขอบเขต:** `update-prices.yml` · `verify` · นโยบาย E/W
- **วิธี:** (1) **quarantine รายไฟล์ใน cron** — ไฟล์ที่ patch แล้วตก gate ให้ revert เฉพาะไฟล์นั้น + flag `patch-rejected` แล้ว push ที่เหลือ (ไม่ทิ้ง 900 ใบเพราะ 1 ใบ) (2) แยก "ประตู cron" (ตรวจเฉพาะสิ่งที่ cron แตะ) กับ "ประตู push ของคน" (ครบชุด) — cron ไม่ควรรัน self-test/tags-test/skeleton-test ที่ไม่เกี่ยวกับสิ่งที่มันเปลี่ยน (3) กฎ **E ใหม่ต้องมาคู่ healer + quarantine** เขียนเป็น check ใน self-test ไม่ใช่ prose (4) นโยบายเลื่อน W→E หลัง heal = 0 (ตัดสินใจ C) (5) `expandReport` เข้า try/catch รายไฟล์ (6) UNVERIFIED WRITE 3 ช่อง → เพิ่ม `need()` + check (7) ปิด issue GitHub เมื่อคิวว่างจากการรันมือด้วย (ทำใน runbook WS5)
- **ส่งมอบ:** cron ที่ล้มแบบ "1 ไฟล์" ไม่ใช่ "ทั้งวัน" · นโยบาย E/W เป็นโค้ด
- **ขนาด:** M

### WS3 · ขอบเขต fixture (แก้ R2) — หมวด T3
- **วิธี:** เทสทุกตัวใน `verify` ที่อ่าน `reports/*.html` เป็น fixture (update-prices-test · self-test) เปลี่ยนเป็น **fixture สังเคราะห์ที่ commit ไว้ใต้ `test/fixtures/`** (สร้างจาก AAPL/BBL ครั้งเดียวแล้วแช่แข็ง) · เพิ่ม lint: `grep reports/ test/*.js` ต้องว่างยกเว้น check-reports/engine-exec/check-site ที่ตั้งใจกวาดคลัง · CI ลำดับ: unit test ต้องไม่รันซ้ำหลัง patch
- **ส่งมอบ:** cron ไม่ขึ้นกับราคาวันนั้นอีก · S10 ทำแบบนี้แล้วบางส่วน (W19/W20 ใช้ fixture สังเคราะห์) — ขยายให้ครบ
- **ขนาด:** S–M

### WS4 · ไฟล์ร่วม: single-writer + lock (แก้ T4)
- **วิธี:** `seeds.json` → write ผ่าน temp+rename + lockfile (หรือให้ `pick-brand` เป็น controller-only โดย worker เรียกไม่ได้เชิงโค้ด เช่น ต้องมี env `CONTROLLER=1`) · `price-flags.json` → `update-prices.js` ถือ lock ระหว่าง read→write · `tags.json` → มีอยู่แล้ว (tag-apply เป็นทางเดียว) แค่ยืนยัน · issue GitHub → เขียนจาก runbook เท่านั้น
- **ส่งมอบ:** กฎ "controller pre-assign/pre-patch" กลายเป็นสิ่งที่โค้ดบังคับ ไม่ต้องจำ
- **ขนาด:** S

### WS5 · Runbook script สำหรับรอบเคลียร์คิว (แก้ R3) — หมวด T5 · **ผลตอบแทนเร็วสุด**
- **วิธี:** `npm run queue -- <phase>` แทน 24 ขั้นความจำ:
  - `preflight`: pull --rebase · อ่าน price-flags + triage ตาม reason (ครบ 11 reason รวม `no-stock-meta`/`currency-mismatch` ที่ยังไม่มีกฎ) · อ่านความสดจาก **footer** ไม่ใช่ `updated` · pre-patch ราคาทั้งชุด process เดียว · เช็คว่าตลาด US เปิดอยู่ไหม (เตือน intraday)
  - `prep <SYM>`: อ่าน `stock-meta.currency` → ใส่ `--th` เอง · prep-stock + median-multiples + **sanity-check ผล medians** (สุดขั้ว/สกุลเงิน) · EPS screen (รายงาน vs vendor >2% ⇒ เสนอ UPDATE เต็ม) · **diff snapshot vendor** (เป้า+n / 52wk / ปันผล / P-BV) เทียบใบ → พิมพ์ลิสต์ให้ prompt · pre-assign สี (NEW) · อ่าน `tags.json.tags[SYM]` · **ประกอบ prompt** จาก template (ใส่ ban update-prices/pick-brand อัตโนมัติ) → เขียน `<scratch>/prep/<SYM>.md`
  - `postcheck <SYM>`: `npm test -- SYM` + spotcheck + grep ราคาเก่าทั้งไฟล์ + เทียบ `ai-model` กับ model ที่ spawn + เช็ค `roe/pe null` เมื่อขาดทุน + W18/W05 + วันที่ footer วันนี้ + ปฏิทินตรงกับไฟล์
  - `ship`: verify → commit รายหุ้น → pull --rebase → push HEAD:main → ปิด issue ถ้าคิวว่าง → build+preserve-dates เมื่อ pre-patch ล้วน
- **ส่งมอบ:** จำนวนขั้นที่ต้องจำ 24 → ≤5 — เหลือเฉพาะที่ script ใน `tools/` ทำแทนไม่ได้: probe โมเดลด้วย subagent · courier/advisor สำหรับหุ้นยาก · **spawn worker เอง** จากไฟล์ prompt ที่ `prep` ประกอบให้ · triage ที่กำกวม · ชั้น 0 valuation · publish/skip · `docs/orchestration.md` ส่วนกลไก → ถูกแทนด้วย runbook
- **ขนาด:** M (v1 ทำได้ใน 1–2 session เพราะ script ย่อยมีครบแล้ว — ขาดแค่ตัวร้อย)

### WS6 · นโยบายคิว (แก้ R4) — หมวด T5 T8
- **วิธี:** (1) `mos-sign-flip` ที่ EPS ไม่เปลี่ยน + อายุวิเคราะห์ < 1 ไตรมาส → **ไม่ส่ง LLM** — ให้ cron เป็นเจ้าของช่องสรุป "ส่วนต่างจากราคา" ทั้งเลข**และคำบอกทิศ** จากคลังคำคงที่ (ต้องทำช่องนี้ให้เป็นโครงสร้าง ⇒ ผูกกับ A) + verdict class (ทำแล้ว) ⇒ flip ใน dead-band กว้างขึ้นได้ (ตัดสินใจ D) (2) trigger ของ LLM ควรเป็น **เหตุการณ์ธุรกิจ** ไม่ใช่ราคา: งบออก (ปฏิทิน earnings จาก vendor) · EPS vendor ต่างจากใบ >2% · corporate action (split/rename/delist) · drift >15% (prose เปลี่ยนความหมายจริง) (3) นโยบายอายุ: ใบอายุ >1 ไตรมาสหลังงบล่าสุด → เข้าคิว UPDATE เต็มตามปฏิทิน ไม่รอราคา
- **ส่งมอบ:** คิวที่ต้องส่ง LLM เล็กลง ~2/3 · งาน LLM ต่อรอบ = เฉพาะที่มีข้อมูลใหม่จริง
- **ขนาด:** M (ส่วนที่ไม่พึ่ง A ทำก่อนได้: trigger ตามปฏิทิน + widen dead-band)

### WS7 · กวาดหนี้เก่าในคลัง — หมวด T8
- **วิธี:** แยก 2 กลุ่ม (ตัดสินใจ E): **เชิงกล** (prose "ราคาปัจจุบัน $X" 786 ใบ · W15 97 · ปี ค.ศ. 126 · footer อ่านไม่ออก 31) → healer + ท่า `heal → build → preserve-dates → build` ครั้งเดียว (แบบ S10) — **ตัวคัด "ซ่อมได้ไหม" = git-history test ของ S10** (ค่าที่พิมพ์เท่าราคา ณ commit ที่เขียนไหม → ใช่ = ราคาวิ่งหนี ซ่อมปลอดภัย · ไม่ใช่ = ประโยคเล่าประวัติ/คนละฐาน ห้ามแตะ — spotcheck แยกเองไม่ได้ ตัวเลข 786 จึงเป็นเพดาน ไม่ใช่จำนวนที่ซ่อมจริง) · **ลำดับ: หลังเคาะ A/B** — ถ้า A(ก)/B(ก) การซ่อมเป็นราคาวันนี้ = สร้างหนี้ใหม่พรุ่งนี้ (ลู่วิ่ง) · ถ้า A(ข)/B(ข) = แทนด้วย token ครั้งเดียวจบ · **ดุลยพินิจ** (ขาเป้านักวิเคราะห์ 222 · สมอตายใกล้ราคา 266 ขา · 84 ใบหมวด 6 · 6 ใบตระกูลเดียว · W06 51) → fix-on-touch พร้อม tracking list ในรีโป · **อายุ >60 วัน 391 ใบ** → ตามนโยบาย WS6 ทยอยตามปฏิทินงบ
- **ก่อนกวาด:** ทำ WS3 ก่อน (ไม่งั้น fixture ขยับ) · ทำ E ให้ prose ราคาปัจจุบันเป็น token ที่ render (ถ้า A) จะได้ไม่ต้องกวาดซ้ำ
- **ขนาด:** M–L (เชิงกลเร็ว · ดุลยพินิจยาว)

### WS8 · รวมกติกาให้เหลือแหล่งเดียว (แก้ R3) — หมวด T9
- **วิธี:** (1) แก้ 17 คู่ขัดกัน + 16 ล้าสมัยทันที (รายการใน docs-audit §1–2 — ที่อันตรายสุด: SKILL 5C ข้อ 1 สั่ง worker รัน update-prices · agent-prompt สั่ง pick-brand · `update-prices.js:622` comment `--force` ปลด not-on-exchange · price-refresh.md "ไม่มี Opus แล้ว") (2) **role-scope CLAUDE.md**: แยกส่วน "controller เท่านั้น" (§3/§5/§9) ให้ชัดในหัวข้อ เพราะ worker ได้ไฟล์นี้ทั้งฉบับ — หรือย้ายกฎ controller ออกไป `docs/controller.md` แล้วให้ CLAUDE.md เหลือ invariant + pointer (3) **ตัวเลขห้ามพิมพ์มือ**: จำนวนขั้น verify / จำนวนรหัส / ตาราง E-W ใน quality-gate.md ต้อง generate จาก `package.json` + `CHECKS` (self-test ตรวจว่าตรง) (4) ทุกกฎมีเจ้าของไฟล์เดียว ที่อื่นเป็น link (ลบ orchestration.md §3/§5 ที่ซ้ำ CLAUDE.md · ลบ "เวฟ ≤3/sequential" ใน SKILL) (5) open item 21 รายการจาก memory → `docs/open-items.md` ในรีโปที่มีสถานะ (memory เป็นของ session ไม่ใช่ของโปรเจกต์) (6) **probe เส้นทาง `analyze-wave`** ว่า inject CLAUDE.md เหมือน Agent tool ไหม (ค้าง) (7) `npm run test:prep` เข้า verify (ตอนนี้แก้ prep/fetch แล้วไม่มีอะไรบังคับเทส)
- **ส่งมอบ:** docs ที่สั้นลง ไม่ใช่ยาวขึ้น · self-test ตรวจ docs↔code
- **ขนาด:** M

### WS9 · เข้ารหัสกับดัก vendor ลง prep-stock — หมวด T7
- **วิธี:** เดิน catalog `data-source-traps` ทั้ง ~25 ข้อ แยก 3 กลุ่ม: (a) ตรวจได้เชิงกลจากตัวเลขที่ prep มีอยู่แล้ว → เพิ่ม check + บรรทัดเตือนใน verdict (เช่น 6O entity mismatch `NI[3]÷Shares[2b]==epsTTM` · SA cap vs `หุ้น×ราคา` · Δ(SA vs Yahoo) >5% · fwd EPS คนละปีงบจาก `/forecast/` · ปี EPS ≤0 ในมัธยฐาน) (b) ต้องดึงเพิ่ม 1 request (8-K exhibit 99.1 หลังงบ ≤2 สัปดาห์ · XBRL companyconcept 4 tag · split events) → เพิ่มเป็น option (c) ดุลยพินิจแท้ → อยู่ใน SKILL/prompt เท่านั้น · **`median-multiples.js`/`prep-stock.js` ต้องมี fixture test ของตัวเอง** (บทเรียน S08: เครื่องมือของ controller ก็ต้องตรวจ)
- **ส่งมอบ:** ตารางกับดัก × ระดับอัตโนมัติ · เทส prep/medians ใน verify
- **ขนาด:** M

---

## 5. ลำดับความสำคัญ — จัดตาม "ป้องกันเหตุการณ์ได้กี่คลาส" แล้วใช้ขนาดงานตัดสิน

| สายงาน | หมวดที่ปิด | เหตุการณ์ใน 6 สัปดาห์ที่จะไม่เกิด | ขนาด | ลำดับ |
|---|---|---|---|---|
| **WS5 runbook** | T5 + ครึ่งหนึ่งของ T1/T6 (เพราะ pre-fetch/diff snapshot ถูกบังคับ) | S08 ODFL/EXPE (ลืมมัธยฐาน) · S09 25 จุดที่แก้เอง · AU `--th` · issue ค้าง 2 ครั้ง · intraday · `updated` ผิด | M | **1** |
| **WS3 fixture** | T3 | cron ล้ม 4 วันใน 6 สัปดาห์ + เวลาสอบสวน 3 session | S–M | **2** |
| **WS8 กติกา** | T9 + ส่วนของ T4/T5 ที่กฎขัดกัน | worker push เอง · worker รัน update-prices/pick-brand · เจ้าของถามเรื่องที่ doc บอกผิด | M | **3** |
| **WS2 cron↔gate** | T2 T3 | check ใหม่ลง warn โดยจำใจ · cron ทั้งวันล้มเพราะ 1 ไฟล์ | M | **4** |
| **WS1 manifest (+A)** | T1 T2 T6 — **ปิดต้นตอ** | คลาส "ช่องใหม่ค้าง" ครั้งถัดไป (E44/W21…) · parser ขัดกัน · UNVERIFIED WRITE | M / L | **5** (manifest ก่อน · migration หลังเคาะ A) |
| **WS6 นโยบายคิว** | T5 T8 (ลดปริมาณ) | ~2/3–4/5 ของคิว = LIGHT ที่ไม่มีข้อมูลใหม่ · KLAC/LRCX วนกลับ | M | **6** |
| **WS4 lock** | T4 | flag ฟื้น · สีชน | S | 7 (ทำแทรกได้เลย) |
| **WS9 vendor traps** | T7 | VMRK/UMC/ROP/KEYS-class ที่ prep บอกได้ | M | 8 |
| **WS7 กวาดคลัง** | T8 | "เจอของเก่า" ทุกครั้งที่แตะใบ | M–L | 9 (หลัง WS3 + ตัดสินใจ A/E) |

> ทำไมไม่ใช้สูตร (Impact+Risk)×(6−Effort) ตรง ๆ: สูตรนั้นให้คะแนนงานถูกก่อน แต่เจ้าของขอ "ไม่ให้เกิดซ้ำ" ⇒ ใช้จำนวนคลาสที่ปิดเป็นหลัก ขนาดงานเป็นตัวตัดสินเสมอ

---

## 6. Roadmap 4 ระยะ

| ระยะ | เวลาโดยประมาณ | ทำอะไร | เกณฑ์จบ (วัดได้) |
|---|---|---|---|
| **0 · หยุดเลือด** | ~1 สัปดาห์ (4–6 session) | WS5 v1 (preflight/prep/postcheck/ship) · WS3 · WS2 (1)(5)(7) quarantine + try/catch + ปิด issue · WS8 (1)(2) แก้ 17+16 + role-scope CLAUDE.md · WS4 · WS8 (6) probe analyze-wave | รอบเคลียร์คิวถัดไป: ขั้นที่ต้องจำ ≤5 · cron ไม่ขึ้นกับราคา (สุ่มไล่ราคา 0 fail) · docs ขัดกัน 0 คู่ · worker ไม่ได้รับคำสั่งขัดกัน |
| **1 · ปิดวงจรค้นพบ** | 2–3 สัปดาห์ | WS1 manifest + coverage + parser เดียว · WS2 (2)(3)(4)(6) · WS9 (a) · WS6 trigger ตามปฏิทิน + dead-band · WS8 (3)(4)(5)(7) | gate พิมพ์ coverage ทุกไฟล์ · NEITHER 18 → 0 · UNVERIFIED WRITE 3 → 0 · W17/W19/W20 → E ได้โดย cron ไม่ล้ม · คิว LLM ต่อสัปดาห์ลด ≥50% |
| **2 · แก้ต้นตอ** (ถ้าเคาะ A) | 3–5 session | migrate ตัวเลขเข้า data layer · skeleton/engine render · cron/gate เทียบ JSON · prose ใช้ token | สำเนาต่อค่า = 1 · regex ถอดค่าจาก HTML = 0 ใน cron/gate · `--heal-derived` ไม่จำเป็นอีก |
| **3 · ล้างหนี้เก่า** | ทยอย | WS7 เชิงกล (1 รอบ) · ดุลยพินิจ (fix-on-touch ตามปฏิทินงบ) · WS9 (b) | prose ราคาค้าง 786 → 0 · W15/W06 149 → 0 · ใบอายุ >90 วัน = 0 ตามนโยบาย |

---

## 7. KPI — วัดทุกรอบเคลียร์คิว (baseline = 6 สัปดาห์ที่ผ่านมา)

| KPI | baseline | เป้าหลังระยะ 0 | เป้าหลังระยะ 1–2 |
|---|---|---|---|
| ปัญหาเชิงสาระที่**คน**จับได้ต่อรอบ (คลาสที่รู้จักแล้ว) | S08 30 · S01 8 · S04 7 · S09 6 | ≤2 | 0 |
| re-dispatch รอบ 2 / จำนวนหุ้น | S08 7/27 | ≤1/10 | ≤1/20 |
| ขั้นที่ controller ต้องจำ | 24 | ≤5 | ≤3 |
| วันที่ cron ล้ม / เดือน | ~2 | 0 | 0 |
| รหัส E/W ใหม่ / เดือน (คลาส price-derived) | 10 ใน 25 วัน | ≤1 | 0 (manifest ครอบ) |
| ช่อง NEITHER / UNVERIFIED WRITE ใน manifest | 18 / 3 | นับได้ | 0 / 0 |
| commit แก้ระบบ : commit วิเคราะห์ | ~320 : 915 | — | <1 : 10 |
| หุ้นที่ส่ง LLM / หุ้นที่ติด flag ต่อสัปดาห์ | ~100% | — | ≤40% (flip ไม่ส่ง) |
| turn ของ controller ต่อหุ้นในรอบเคลียร์คิว | S08 ~28 · S04 ~8 | ≤8 | ≤5 |
| prose ราคาค้าง · warning เปิด · ใบอายุ >90 วัน | 786 · 149 · 2 | — | 0 · 0 · 0 |

วิธีวัด: `git log` (commit ratio) · runbook พิมพ์สรุปท้ายรอบ (ปัญหาที่คนจับ/re-dispatch/turn) · manifest coverage จาก gate · `measure-analysis-age.js` · price-flags history

---

## 8. ข้อจำกัดที่แผนต้องเคารพ

- **ห้ามเพิ่ม E-code โดยไม่มี healer + quarantine** (บล็อก cron ทั้งรีโป) — จนกว่า WS2 (1) เสร็จ E ใหม่ = ห้าม
- แก้ `reports/` เป็นชุด **ต้องใช้ท่า `heal → build → preserve-dates → build`** หรือเป็น fix-on-touch — ไม่งั้น `updated` เด้งหลายร้อยใบ พังหน้าแรก + dedup 7 วัน (เกิดจริง 2 ครั้ง)
- การเปลี่ยนโครงสร้าง (build.js / gate / cron / template / CLAUDE.md) = **สรุปแล้วรอเจ้าของก่อน push** (CLAUDE.md §5) · งานยาก = ปรึกษา advisor ก่อน (§7) — แผนนี้ผ่าน advisor แล้ว 2 รอบ
- font/ดีไซน์ไม่แตะ (DESIGN.md) · ป้าย `ai-model` เก่าห้ามย้อนแก้เป็นกลุ่ม · ห้าม Haiku · pin `model` ทุก call
- **แผนนี้ห้ามกลายเป็นกฎเล่มใหม่** — ทุก workstream ต้องส่งมอบเป็นโค้ด/เทส/script ที่บังคับเอง หรือ**ลบ**กฎที่ซ้ำ ไม่ใช่เพิ่มย่อหน้า

---

## 9. ★ การตัดสินใจ — เจ้าของเคาะแล้ว 11 ก.ย. 2569 (เลือกตามคอลัมน์ข้อเสนอแนะทุกข้อ)

| # | คำถาม | ทางเลือก | ข้อเสนอแนะ + เหตุผล |
|---|---|---|---|
| **A** | **ย้ายตัวเลขออกจาก HTML ที่ render แล้ว?** | (ก) คง regex-on-HTML + เพิ่ม manifest/coverage (WS1 ครึ่งแรก) · (ข) ย้ายตัวเลขทั้งหมดเป็น `report-data`/`stock-meta` แล้ว build render (ระยะ 2) | **(ข) แต่ทำ (ก) ก่อนเป็นขั้นบันได** — (ข) ปิด T1/T2/T6/T8 ที่ต้นตอ ไม่ต้องมี E44/W21 อีก และตรงกับสถาปัตยกรรมที่มีอยู่ (content-only + inject ตอน build) · ต้นทุน = migrator 908 ไฟล์ (เคยทำแล้ว 3 ครั้ง: migrate.js/annual-chg/heal 735 ใบ) + skeleton/engine · ความเสี่ยง = ต้อง freeze การวิเคราะห์ใหม่ 1–2 วันตอน migrate |
| **B** | นโยบายตัวเลขใน prose ของ**ใบใหม่** | (ก) W เตือนอย่างเดียว (เดิม) · (ข) **E แบบ date-gated** — ใบที่วิเคราะห์หลังวันที่ X ห้ามมีราคา/MOS/% ที่ผูกราคาใน prose (ใช้ token แทน) ใบเก่าเป็น W · (ค) ห้ามทั้งคลังทันที | **(ข)** — ไม่บล็อก cron บนใบเก่า แต่หยุดสร้างหนี้ใหม่ทันที · ถ้าเคาะ A(ข) token จะ render อัตโนมัติ |
| **C** | เลื่อน W→E หลัง heal = 0 (W17/W19/W20/W16) | (ก) คง W ตลอด · (ข) เลื่อนเป็น E ทันที · (ค) เลื่อนหลัง WS2 quarantine เสร็จ | **(ค)** — ก่อนหน้านั้น E = cron ล้มทั้งวัน |
| **D** | `mos-sign-flip` ที่ EPS ไม่เปลี่ยน ยังส่ง LLM ไหม | (ก) ส่งเหมือนเดิม · (ข) **ไม่ส่ง** — cron เป็นเจ้าของช่องสรุป+คำบอกทิศจากคลังคำคงที่ + ขยาย dead-band เป็น ±5 · (ค) ส่งเฉพาะเมื่อ flip ค้าง ≥N วัน | **(ข)** — ~2/3 ของคิวหายไปโดยไม่เสียความถูกต้อง (คำบอกทิศเป็นฟังก์ชันของ MOS ล้วน) · ต้องยอมรับว่าประโยควิเคราะห์ที่พูดถึง "ถูก/แพง" จะเป็นเชิงคุณภาพ (กฎ 18 ส.ค. ว่าไว้แล้ว) · **ต้องทำ WS8 (3) ก่อน**: `MOS_FLIP_DEADBAND_PP` (cron) กับ `TOL_MOS_SUMMARY_PP` (W06) เป็นค่าคงที่ที่พิมพ์แยกกัน 2 ไฟล์ (code-audit §3.1) — ขยับตัวเดียว = W06 ยิงทุก flip ที่ cron ปล่อยผ่าน |
| **E** | กวาดหนี้เก่า 786 ใบ: ชุดเดียวหรือ fix-on-touch | (ก) fix-on-touch ทั้งหมด · (ข) **เชิงกลกวาดชุดเดียว + ดุลยพินิจ fix-on-touch** · (ค) กวาดทั้งหมดรวมดุลยพินิจ (=re-analyze ~300 ใบ) | **(ข)** — เชิงกลปลอดภัย (พิสูจน์ด้วย git-history audit แบบ S10) · ดุลยพินิจต้อง LLM+รีวิว ไม่คุ้มกวาดก่อนงบออก |
| **F** | ความแรงของการรวม docs | (ก) แก้เฉพาะที่ขัดกัน · (ข) **single-source + generate ตัวเลข + ลบ orchestration.md ส่วนที่ซ้ำ + CLAUDE.md แยก controller/worker** · (ค) เขียนใหม่ทั้งชุด | **(ข)** — (ก) drift กลับใน 2 สัปดาห์ (วัดแล้ว 6/6) · (ค) เสี่ยงทำกติกาที่ดีหาย |

**ข้อที่ไม่ต้องตัดสิน (จะทำตามนี้เว้นแต่สั่งต่าง):** WS5 runbook เป็น `npm run queue` ใน `tools/` · fixture ใต้ `test/fixtures/` · open items ไป `docs/open-items.md` · ภาษาเอกสาร = ไทย พ.ศ. · ทุกสายงานเปิดเป็น PR แยก 1 สายงาน = 1 PR

---

## 10. ภาคผนวก

### 10.1 ไฟล์หลักฐาน (`docs/superpowers/audit/2026-09-11-stock-analyzer/`)
- `code-audit.md` — field matrix 68 ช่อง · regex inventory · duplicated thresholds · shared-state · fixture coupling · failure-mode catalog · root-cause hypotheses 8 ข้อ
- `docs-audit.md` — contradictions 17 · stale 16 · rule reachability 46 · duplication 9 · **process surface 42 ขั้น** · open items 21
- `incidents-A.md` — ลำดับเหตุการณ์ 9–20 ส.ค. 69 (13 session)
- `incidents-B.md` — ลำดับเหตุการณ์ 23 ส.ค.–11 ก.ย. 69 (10 session) + ตารางสรุป
- `metrics.md` — ตัวเลขข้อ 1 ทั้งหมดพร้อมคำสั่งที่ใช้วัด · `measure-analysis-age.js`

### 10.2 ลำดับเหตุการณ์ย่อ 9 ส.ค.–11 ก.ย. (จาก incidents-A/B)

**9–20 ส.ค. (incidents-A):**

| วันที่ | session | คิว | ปัญหา | คลาสใหม่ | gate จับ / คนจับ | turn | ชม. |
|---|---|---|---|---|---|---|---|
| 9 ส.ค. | เคลียร์คิว 40 ตัว (19 flip · 13 drift · 8 split) | 40 | 9 | 3 (SA 403 · GF EPS รายไตรมาส · ATH-date) | 0 / 9 | 291 | 2.3 |
| 9 ส.ค. | ซ่อม SPCX (0.4c) | — | 2 | 0 | 0 / 2 | 142 | 2.3 |
| 12 ส.ค. | เคลียร์คิว 13 ตัว | 13 | 12 | 4 (price-flags race · MNST กราฟผสมฐาน E36 ตาบอด · การ์ด derive ค้างเป็นคลาส · `--help` รันกวาดทั้งคลัง) | 0 / 12 | 228 | 0.9 |
| 12 ส.ค. | ซ่อม split-aware (`bad-chart`) | — | 6 | 1 | 0 / 6 | 150 | 0.6 |
| 13 ส.ค. | เคลียร์คิว 11 ตัว | 11 | 10 | 2 (controller ตัดตาราง prep · ปฏิทิน พ.ศ./ค.ศ. ปน) | 0 / 10 | 324 | 1.2 |
| 17 ส.ค. | เคลียร์คิว 12 ตัว | 12 | 7 | 3 (prompt ใส่ shares ถัวเฉลี่ย · prep ✅ ปลอม AMATA · ปันผลค้าง) | 0 / 7 | 201 | 1.4 |
| 17 ส.ค. | ซ่อม prep-stock ([2b] + EPS ทาง 3) | — | 6 | 1 (canary ที่ fail ไม่ได้) | 0 / 6 | 112 | 0.4 |
| **17–18 ส.ค.** | **W08 → กวาด warning ทั้งคลัง (mega)** | 3+4 | **~21** | ~8 (W06 dead-band · W07 · W01 · W05 ไม่รู้ 0.4c · E21/E22 ตรวจ 2 ใน 5 การ์ด) | 0 / 21 — **81/84 ฟ้องปลอม** | **2,297** | **~13 จริง** |
| 19 ส.ค. | เคลียร์คิว 19 ตัว (ai-datacenter selloff) | 19 | 9 | 4 (**ตั้งชื่อคลาส price-derived** · quote basic vs diluted · ratios page เป็น client-rendered · บรรทัดที่มา EPS ผิด) | 0 / 9 (6/19 ค้างขณะ 40/40) | 305 | 1.5 |
| 19 ส.ค. | ซ่อมบรรทัด EPS (if-converted) | — | 3 | 1 (CAMT convertible notes) | 0 / 3 | 67 | 1.4 |
| 19 ส.ค. | สร้าง E41/E42/E43/W15/W16 + healer | — | 7 | 2 (**E ไม่มี healer = cron ตายถาวร** · tolerance ต้องบวกครึ่งหลัก) | — | 222 | 2.0 |
| 20 ส.ค. | เคลียร์คิว 12 รายการ | 12 | 6 | 1 (**ฉาก 3 ปีค้าง 11/11** RGLD Bear +8.7%) | 0 / 6 | 187 | 1.1 |
| 20 ส.ค. | สร้าง W17 + healer 782 ใบ | — | 10 | 3 (healer พังไฟล์ = สะอาดปลอม · trial-heal เด้ง freshHash 782 แถว) | — | 302 | **7.0** |

**23 ส.ค.–11 ก.ย. (incidents-B):**

| วันที่ | session | คิว | ปัญหา | คลาสใหม่ | gate จับ / คนจับ | turn | ชม. |
|---|---|---|---|---|---|---|---|
| 23 ส.ค. | เคลียร์คิว | 5 | 8 | 1 (+CBOE สมอตายเห็นแต่ยังไม่ตั้งชื่อ) | 0 / 8 | 136 | 1.5 |
| 24 ส.ค. | cron ล้ม 3 วัน | — | 3 | 1 fixture ผูกดิสก์ | 0 / 3 | 109 | 0.4 |
| 24 ส.ค. | กฎ advisor §7 | — | 0 | — | — | 25 | 0.1 |
| 29 ส.ค. | เคลียร์คิว | 20 | 7 | 3 | 0 / 7 | 168 | 0.9 |
| 2 ก.ย. | cron #54 | — | 2 | 1 CI แก้ fixture ก่อน gate | 0 / 2 | 122 | 0.5 |
| 2 ก.ย. | fixture E34/E36/W17 | — | 6 | 2 | 0 / 6 (เจ้าของ override ถูก 1) | 201 | 0.9 |
| 3 ก.ย. | SPCX เต็มใบ | 1 | 3 | 0 | 0 / 3 | 47 | 0.2 |
| **9–10 ก.ย.** | **เคลียร์คิว + กวาด W18** | **27+26** | **30** | **~12** | presentation เท่านั้น / 30 | **752** | **5.3** |
| 11 ก.ย. | เคลียร์คิว | 3 | 6 | 1 snapshot vendor | 2 (W06/spotcheck) / 4 | 109 | 0.7 |
| 11 ก.ย. | cron ปันผล/P-BV | — | 8 | 1 | 0 / 8 | 228 | 1.5 |

ข้อสังเกตจากสองตาราง: **13 ใน 23 session ไม่ใช่งานเคลียร์คิว** (ซ่อม gate/cron/tool 11 · นโยบาย 1 · วิเคราะห์เดี่ยว 1) แต่เป็นงานที่รอบเคลียร์คิวบังคับให้ทำ และกินเวลามากกว่าตัวรอบเอง · คลาส "ค่าที่ derive จากราคาค้างขณะ gate เขียว" โผล่**ทุกรอบ**ตั้งแต่ 12 ส.ค. ในหน้ากากต่างกัน (การ์ด → prose/footer → ปันผล → `pe`/% เป้า → ฉาก 3 ปี → snapshot vendor → ปันผล%/P-BV) ปิดได้ทีละหน้ากาก · re-dispatch กระจุกที่ S08 · ข้อเสนอ 29 ส.ค. (pre-fetch มัธยฐานทุกใบที่ FV เปลี่ยน) ไม่ถูกรับไป → ระเบิด 9 ก.ย.

### 10.3 open items 21 รายการจาก memory (ย้ายไป `docs/open-items.md` ใน WS8)
ดู docs-audit.md §6 — ตัวอย่างที่ควรปิดเร็ว: gauge marker ไม่มี gate · W05 มองไม่เห็นตระกูล P/E ซ้อน · `roe` ต้อง null · EV/Sales·EV/EBITDA·DCF ไม่มีใครตรวจ · `test:prep` ไม่อยู่ใน verify · probe analyze-wave · BBL ช่องสรุป "+2.1% (เกือบเต็มมูลค่า)" ไม่เคยถูก patch
