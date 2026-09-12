# Orchestration — วิเคราะห์หลายตัว/เป็นกลุ่ม (กลไกของ CLAUDE.md §3)

> ไฟล์นี้คือ "กลไก" ของกติกาใน `CLAUDE.md §3` — กฎทั้งหมดอยู่ที่นั่นที่เดียว อ่านไฟล์นี้เมื่อจะรันเวฟจริง
> ขั้นตอนต่อหุ้น = `.claude/skills/stock-analyzer/SKILL.md` · prompt แม่แบบ worker = `_template/agent-prompt.md`

## 1. ก่อนเริ่ม — กันซ้ำ + ความสด

`npm run queue -- preflight` → `ship --prepatch` ทันที ทำให้: `git pull --rebase origin main` · อ่านคิว · **ความสดอ่านจากวันที่ footer "ข้อมูล ณ" ของแต่ละใบ** (ไม่ใช่ `reports.json.updated` — bulk freshHash ชนกันได้ 13 ใบ 9 ก.ย. 2569) · สด ≤7 วัน = ข้าม (ธีม/โควตา → หาตัวใหม่ · ระบุชื่อ → ข้ามพร้อมแจ้ง) · เกิน 7 วัน = UPDATE · ยังไม่มี = NEW · จากคิว price-flags → triage ตาม `tools/queue/triage.js` (PREPATCH = ราคาอย่างเดียว ไม่ส่ง LLM — `mos-sign-flip` ระยะ 1 ข้อ D / LIGHT / FULL / PLUMBING / REJECTED / DELIST)
กันซ้ำข้าม session = push รายตัวผ่าน `npm run queue -- ship <SYM>` (pull --rebase มากับลำดับ push ของทุกตัวอยู่แล้ว)

## 2. กลไก courier (ปรึกษา advisor แทน worker)

> กติกาโมเดล/effort = CLAUDE.md §3.2 (ที่เดียว) — หัวข้อนี้มีแต่กลไก courier

- **worker ห้ามเรียก `advisor` ตรงเอง** — เป็นข้อห้ามเชิงนโยบาย ไม่ใช่ข้อจำกัดทางเทคนิค (เรียกตรงแล้วสำเร็จได้จริง วัด 9 ก.ย. 2569 เคส DASH) เพราะ (1) controller มองไม่เห็นว่า worker เอาคำแนะนำอะไรมาใช้ตัดสิน ตรวจงานย้อนไม่ได้ (2) transcript ของ worker ยาวเต็มไปด้วยรายละเอียดหุ้นตัวเดียว ทำให้คำแนะนำที่ได้ต่างจาก brief กะทัดรัดที่ courier ส่ง (3) advisor มีเพดานขนาด transcript จริง (ดูข้อถัดไป) — สำเร็จบ้างไม่สำเร็จบ้าง = ผลลัพธ์ไม่นิ่ง
- **★ advisor มีเพดานขนาด transcript ~25k token — เกิน = ตอบ `unavailable` ทันที** (วัดจริง 13 ก.ค. 2569 แบบ A/B ในเซสชันเดียวกัน: probe เปล่า ~21k token สำเร็จ · +อ่านไฟล์เดียว ~33k token = fail — ไม่เกี่ยวกับ main model)
- **เมื่อไรใช้ courier**: หุ้นยาก (เกณฑ์ → CLAUDE.md §3.2) ก่อน spawn worker เสมอ · การตัดสิน publish/skip ของ controller เองกำกวม → เรียก `advisor` ตรงก่อน ใช้ courier เมื่อ transcript ของ controller เองใหญ่จน `advisor` ตอบ `unavailable`
- **วิธีเรียก**: spawn `Agent` (`model:"sonnet"`) prompt สั้น ~2-4k token: ตัวเลข cross-verified แล้ว + ตารางงบย่อ + คำถามเฉพาะ 4-5 ข้อ + คำสั่ง "ห้ามอ่านไฟล์/ห้ามรันคำสั่ง เรียก advisor() ครั้งเดียว แล้วสรุป guidance กลับ ≤400 คำ เก็บตัวเลขครบ" → เอา guidance ที่ได้ฝังลง prompt worker (validate จริงกับเคส OUST 13 ก.ค. 2569 · ต้นทุน ~90k subagent tokens ~2.5 นาที/ครั้ง)
- **courier ตอบ `unavailable`/ล้มเหลว → หยุดถามผู้ใช้** ก่อนลุยต่อ · worker เจอประเด็นยาก*ใหม่*กลางทาง → **ห้ามเรียก advisor เอง** คืนคำถามกลับให้ controller จัด courier รอบใหม่

## 3. Spawn

- กฎ 1 หุ้น/agent · ขนานได้ · verify รายแบตช์ = CLAUDE.md §3.3
- prompt = `_template/agent-prompt.md` — STEP 0 กัน cwd-stray + pre-fetch fundamentals/medians อยู่ในไฟล์นั้นแล้ว
- agent fail → ทำ inline ใน main session แทน (fetch + write เอง)

## 4. Push รายตัว

= CLAUDE.md §5 (worker ห้าม push · controller verify+push)

## 5. Workflow `analyze-wave` — spawn แบบคุม effort ได้ (ทางเลือก)

ใช้เมื่ออยากลด token ของ worker งาน mechanical (effort ต่ำลง = tool calls กระชับ/turn น้อยลง) — `Agent` tool ปกติตั้ง effort เองไม่ได้ · กติกาโมเดล/1 หุ้น/agent ทุกข้อยังใช้ครบ (CLAUDE.md §3.2–3.3 · script บังคับ `stocks.length === 1`):

1. controller เตรียม prompt ต่อหุ้นจาก `_template/agent-prompt.md` ตามปกติ (แทน `{{...}}` ครบ รวม `{{FUNDAMENTALS}}`/`{{MEDIANS}}` ที่ pre-fetch มา — ดู §3)
2. เรียก `Workflow` tool:
   ```
   Workflow { name: "analyze-wave",
              args: { stocks: [ {label:"AAPL", prompt:"<prompt เต็ม>"} ],
                      effort: "medium" } }
   ```
   - **เรียก 1 หุ้น/call** (คงพุชรายตัว — workflow คืนผลตอนจบทั้งชุด ส่งหลายตัวใน call เดียวจะพุชคั่นระหว่างตัวไม่ได้) · override รายตัว: `stocks[0].effort` / `stocks[0].model`
   - model/effort ต่อตัว + ขนาน/verify รายแบตช์/ramp เจอ rate limit = CLAUDE.md §3.2–3.3
   - push ชนกันข้ามรัน **ไม่ใช่ปัญหา** — worker ไม่เคย push อยู่แล้ว controller เป็นคน push ⇒ serialize ผ่าน controller โดยโครงสร้าง
3. แต่ละ call เสร็จ → controller ตรวจผล (คืนสรุปราคา/FV/MOS จาก worker) → verify + push รายตัวตาม §4 → ค่อยเรียกตัวถัดไป

## 6. เกร็ดต้นทุน (วัดจริง 12 ก.ค. 2569 — ดู memory `token-usage-benchmarks`)

- ต้นทุน worker อยู่ที่ **จำนวน turn × ~70k cache-read** ไม่ใช่ output (~3-4k/ตัวเท่านั้น) → เป้า: NEW/UPDATE ~15 turns · UPDATE-LIGHT ≤10 turns
- ฝั่ง controller: cacheR/turn **ไม่คงที่** — โตตาม context (~70k session สั้น → ~139k เมื่อรัน 25 ตัวรวด) — รันยาวได้ ไม่มี chunk/session (CLAUDE.md §4) แต่คุม turn ตัวเองให้น้อย/ตอบสั้นระหว่างเวฟ
- 3 หุ้นบน Sonnet ≈ 25k output + ~10M cache-read → เย็นเดียวเคลียร์ได้ ~15 ตัวสบาย ๆ · **Opus main เคยกิน ~15% ลิมิต/3 หุ้น** → นี่คือเหตุผลที่ Opus ใช้ escalate รายตัวเท่านั้น ไม่ใช่ default ทั้งเวฟ
- ต้นทุน `npm run verify` เองต่ำมาก (วัดจริง ~3.5s @761 รายงาน) → นี่คือเหตุผลที่พุชรายตัว (§4) ทำได้โดยไม่แพง
