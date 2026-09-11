# Orchestration — วิเคราะห์หลายตัว/เป็นกลุ่ม (รายละเอียดเต็มของ CLAUDE.md §3)

> ไฟล์นี้คือ "เหตุผลและกลไก" ของกติกาใน `CLAUDE.md §3` — invariant สั้น ๆ อยู่ที่นั่น อ่านไฟล์นี้เมื่อจะรันเวฟจริง
> ขั้นตอนต่อหุ้น = `.claude/skills/stock-analyzer/SKILL.md` · prompt แม่แบบ worker = `_template/agent-prompt.md`

## 1. ก่อนเริ่ม — กันซ้ำ + ความสด

`npm run queue -- preflight` ทำให้: `git pull --rebase origin main` · อ่านคิว · **ความสดอ่านจากวันที่ footer "ข้อมูล ณ" ของแต่ละใบ** (ไม่ใช่ `reports.json.updated` — bulk freshHash ชนกันได้ 13 ใบ 9 ก.ย. 2569) · สด ≤7 วัน = ข้าม (ธีม/โควตา → หาตัวใหม่ · ระบุชื่อ → ข้ามพร้อมแจ้ง) · เกิน 7 วัน = UPDATE · ยังไม่มี = NEW · จากคิว price-flags → triage ตาม `tools/queue/triage.js` (LIGHT / FULL / PLUMBING / REJECTED / DELIST)
กันซ้ำข้าม session = push รายตัวผ่าน `npm run queue -- ship <SYM>` (pull --rebase มากับลำดับ push ของทุกตัวอยู่แล้ว)

## 2. โมเดล (บังคับ)

- **ห้าม Haiku ทุกขั้น** (Sonnet+Haiku และ Haiku-ล้วน ห้ามทั้งคู่ — benchmark AMGN 30 มิ.ย. 2569: Haiku = build-crash + fake-chart + wrong-EPS)
- **Sonnet เป็น default ทุกชั้น**: controller=Sonnet, worker=Sonnet (`model:"sonnet"`) — ตราบใดที่ controller ตรวจข้ามแหล่ง price/EPS ≥2 + กราฟจริงจาก script + จับ split/ticker เอง (วัดแล้ว Sonnet+high ถึงมาตรฐาน publish บนหุ้น pre-profit ที่ยากสุด: Tier 2 batch 1)
- **Opus = escalate รายตัวเฉพาะหุ้นยาก** (user เคาะ 9 ส.ค. 2569 แทนกติกาเดิม "ยกเลิก Opus ทั้งหมด 13 ก.ค. 2569") — ส่ง `model:"opus"` ใน `stocks[]` ของตัวนั้น เกณฑ์เดียวกับ effort high (CLAUDE.md §3.2) · **ต้อง pin `model` ทุก call เสมอ** ไม่ว่าตั้งใจใช้ตัวไหน — ปล่อย default = Opus 5 โดยไม่ตั้งใจ (harness กรอง `CLAUDE_CODE_SUBAGENT_MODEL` ทิ้ง) ทำให้ทั้งค่าใช้จ่ายและป้าย `ai-model` ไม่ตรงแผน
- **หุ้นยาก** (IPO <1 ปี / spinoff / split / cyclical / pre-profit / ราคา cross-source ต่าง >5%) → worker ยังเป็น Sonnet แต่ตั้ง `effort:"high"` + **controller ปรึกษา `advisor` ผ่าน courier subagent ก่อน spawn**: เก็บข้อมูลขัดแย้ง/ประเด็นยากให้ครบก่อน → courier → ฝังแนวทางที่ได้ลง prompt ของ worker (เช่นเคส MBLY: ชี้ impairment ครั้งเดียว + ห้ามใช้ P/E×EPS) + บังคับย่อหน้า full-disclosure/uncertainty ในรายงาน · **courier คืน unavailable → หยุดถาม user**
- **★ advisor เรียกได้ผ่าน courier subagent เท่านั้น (วัดจริง 13 ก.ค. 2569 — แก้ข้อสรุปเดิมที่ผิด)**: advisor (= Fable, `advisorModel` ใน `~/.claude/settings.json`) forward transcript ทั้งหมดของผู้เรียกไปให้ Fable และมี**เพดานขนาด ~25k token** — เกินแล้ว server ตอบ `unavailable` ทันที ไม่เกี่ยวกับ main model (ทดลอง A/B ใน session เดียวกัน: probe เปล่า ~21k = สำเร็จ · +อ่านไฟล์เดียว ~33k = fail · การเรียกจริงจาก controller/worker ทุกครั้ง context ≥75k = fail 30+ ครั้งติดตั้งแต่ 11 ก.ค.) → **ห้าม controller/worker เรียก advisor ตรง ๆ** · วิธีที่ถูก: controller spawn **courier subagent** — prompt = brief กะทัดรัด ~2-4k token (ตัวเลข cross-verified แล้ว + ตารางงบย่อ + คำถามเฉพาะ 4-5 ข้อ) + คำสั่ง "ห้ามอ่านไฟล์/ห้ามรันคำสั่ง เรียก advisor() ครั้งเดียว แล้วสรุป guidance กลับ ≤400 คำเก็บตัวเลขครบ" → เอา guidance ฝังลง prompt worker (validate จริงกับ OUST 13 ก.ค. 2569 · ต้นทุน ~90k subagent tokens ~2.5 นาที/ครั้ง) · worker เจอประเด็นยาก*ใหม่*กลางทาง → **ห้ามเรียก advisor เอง** ให้คืนคำถามกลับมาให้ controller จัด courier รอบใหม่หรือหยุดถาม user
- ★★ **แก้เหตุผลของข้อห้ามข้างบน (9 ก.ย. 2569)** — เดิมเขียนว่า worker เรียกตรง "context เกินเพดานแน่นอน" ⇒ ตีความได้ว่า *เรียกไม่สำเร็จอยู่แล้ว* ซึ่ง **ไม่จริง**: เวฟเคลียร์คิว price-flags 27 ตัว worker ของ DASH เรียก `advisor` ตรง ๆ **แล้วได้คำตอบจริง** (สาระถูกต้องด้วย — ชี้ว่า FCF ของ vendor ต่างจาก reconciliation ของบริษัท 21%)
  ⇒ ข้อห้ามนี้เป็น **นโยบาย ไม่ใช่ข้อจำกัดทางเทคนิค** และ **harness ไม่ได้บังคับให้** ⇒ ต้อง **เขียนกำกับใน prompt ของ worker ทุกใบ** (`_template/agent-prompt.md` มีบรรทัดนี้แล้ว) ไม่ใช่พึ่งว่ามันจะ fail เอง
  เหตุผลที่ยังห้าม: (1) controller มองไม่เห็นว่า worker เอาคำแนะนำอะไรมาใช้ตัดสิน ⇒ ตรวจงานย้อนไม่ได้ (2) transcript ของ worker ยาวและเต็มไปด้วยรายละเอียดหุ้นตัวเดียว ทำให้คำแนะนำที่ได้ต่างจาก brief กะทัดรัดที่ courier ส่ง (3) เพดานขนาดยังมีอยู่จริง — สำเร็จบ้างไม่สำเร็จบ้าง = ผลลัพธ์ไม่นิ่ง
- การตัดสิน publish/skip ของ controller เอง**กำกวม** → ปรึกษา advisor ผ่าน courier ก่อน ถ้ายังกำกวม → หยุด ping user
- **effort ต่อ worker**: งาน mechanical (UPDATE-LIGHT / UPDATE ที่ EPS ไม่เปลี่ยน) ไม่จำเป็นต้องใช้ effort สูง — spawn ผ่าน workflow `analyze-wave` (ข้อ 5) เพื่อตั้ง `effort:"medium"` ได้ · Agent tool ปกติตั้ง effort ไม่ได้

## 3. Spawn — 1 หุ้น/agent · sequential

- **spawn 1 Agent/หุ้น** — full analysis หุ้นตัวเดียวจบใน context ของ agent เอง เขียนลง `reports/<SYMBOL>.html` ของตัวเองเท่านั้น · เหตุผล: context แยกสะอาด กันเลขปนข้ามหุ้น (**ตัวร้าย #1 ของรีโป**) · ใช้ prompt แม่แบบ `_template/agent-prompt.md` (ระบุ `{{MODE}}` ให้ถูก · **pre-fetch `node tools/prep-stock.js <SYM> [--th] [--update]` แล้ววาง output ทั้ง block ลง `{{FUNDAMENTALS}}` เสมอ** — 1 คำสั่ง = fundamentals + facts (NEW) + CROSS-VERIFY verdict deterministic · **exit 2 = ราคาขัดแหล่ง >5% → ห้าม spawn worker หยุดถามผู้ใช้ตาม CLAUDE.md §2**  ·  ★ **pre-fetch ตัวคูณมัธยฐานด้วยเสมอ** `node tools/median-multiples.js <SYM> [--th]` → วางลง `{{MEDIANS}}` (ชั้น 0.4b/0.4e บังคับ — ไม่ส่งไป worker จะประมาณเอง แล้วได้ตัวคูณปัจจุบัน = สมอตาย `W18`) · ตัดทั้ง turn รันซ้ำและ WebFetch financials 3-6 call ของ worker · จูนรอบ 5 + prep-stock 2 ส.ค. 2569)
- **★ STEP 0 กัน cwd-stray:** prompt ให้ agent เริ่ม `cd <worktree> && pwd` + ห้าม `cd` ลง main repo · ตอน push เช็ค `ls reports/<SYM>.html` ใน worktree — ไม่มี = ไปหยิบจาก main repo + ลบตัวหลง (ดู memory bulk-stock-analysis-workflow)
- **★ ~~SEQUENTIAL (บังคับ)~~ → ยกเลิกแล้ว 8–9 ส.ค. 2569 · ปัจจุบัน parallel ทำได้** (แก้ 9 ก.ย. 2569 — ย่อหน้านี้ขัดกับ CLAUDE.md §3.3 และกับ §5 ข้อ 2 ของไฟล์นี้เองมาตลอด):
  **ข้อห้ามจริงคือ "หลายหุ้นใน 1 run" ไม่ใช่ "หลาย run พร้อมกัน"** — `stocks[]` ต้องมี 1 ตัวเสมอ · spawn หลาย run ขนานกันได้ (วัดจริง 40 ตัว N=3→6 ไม่เจอ rate limit)
  แต่ต้องครบเงื่อนไข 3 ข้อใน **§5 ข้อ 2** (pre-assign สีแบรนด์ · verify/push รายแบตช์ · ramp ทีละขั้น) — อ่านที่นั่นก่อนขนานทุกครั้ง
  เคส US-GAP W19–W21 ที่พังยังเป็นบทเรียนจริง: **rate limit ที่ worker ทุกตัวใช้ร่วมกัน** คือคอขวด ⇒ เจอเมื่อไหร่ให้หาร N ครึ่ง แล้ว re-run เฉพาะตัวที่ล้ม
- fallback: agent fail → ทำ inline ใน main session แทน (fetch + write เอง)
- **จำนวนหุ้นไม่จำกัด ทั้งต่อรอบ (เวฟ) และต่อ session** (ยกเลิก "เวฟละ ≤3" 12 ก.ค. 2569 · ยกเลิก "chunk ≤10/session" 13 ก.ค. 2569 — user ต้องการรันยาว ให้ auto-compact จัดการ context เอง ไม่หยุดรอเปิด session ใหม่) — sequential + push รายตัว (ข้อ 4) ทำให้ blast radius = 1 หุ้นอยู่แล้ว · คิวยาวจัดเป็น batch ตามสะดวกไว้รายงานความคืบหน้า · ข้อเท็จจริงต้นทุน: cacheR/turn ของ controller โตตาม context (วัดจริง 12 ก.ค. 2569: 25 ตัวรวด = 2.28M cacheR/หุ้น ~139k/turn vs session 5 ตัว = 0.75M ~70k/turn) → ระหว่างรันยาว controller คุม turn ตัวเองให้น้อยและตอบสั้น

## 4. Push รายตัว (ห้าม agent push เอง)

- worker เสร็จ 1 ตัว → controller ตรวจผล → verify + commit + push **หุ้นตัวนั้นทันที ก่อน spawn ตัวถัดไป** — รวมเป็น Bash call เดียวตามลำดับ CLAUDE.md §5 (ไม่เพิ่ม turn):
  `npm run verify && git add -A && git commit -m "analyze: add <SYM> …" && git pull --rebase origin main && git push origin HEAD:main`
- **ทำไมรายตัว (เปลี่ยนจาก per-wave 12 ก.ค. 2569):** verify เป็น gate ทั้งรีโป — แบบรายเวฟ ตัวเดียวที่พังจะบล็อกตัวที่เสร็จแล้วทั้งเวฟ · แบบรายตัว งานที่เสร็จ = deploy แล้ว ไม่ค้างใน worktree ถ้า session ตาย + revert/bisect รายหุ้นได้ · เหตุผล per-wave เดิม ("sibling ที่เขียนค้างบล็อก verify") หมดไปตั้งแต่บังคับ **sequential** — ตอน push ไม่มี sibling เขียนค้างแล้ว · ต้นทุน verify ต่ำมาก (วัดจริง ~3.5s @761 รายงาน)
- **ห้าม push ซ้อน** หลาย session พร้อมกัน — กัน git race (commit ก่อน pull --rebase เสมอ)

## 5. Workflow `analyze-wave` — spawn แบบคุม effort ได้ (ทางเลือก)

ใช้เมื่ออยากลด token ของ worker งาน mechanical (effort ต่ำลง = tool calls กระชับ/turn น้อยลง) — กติกาทุกข้อข้างบนยังใช้ครบ (sequential ในตัว script แล้ว):

1. controller เตรียม prompt ต่อหุ้นจาก `_template/agent-prompt.md` ตามปกติ (แทน `{{...}}` ครบ รวม `{{FUNDAMENTALS}}` ที่ pre-fetch มา — ดู §3 ข้อแรก)
2. เรียก `Workflow` tool:
   ```
   Workflow { name: "analyze-wave",
              args: { stocks: [ {label:"AAPL", prompt:"<prompt เต็ม>"} ],
                      effort: "medium" } }
   ```
   - **เรียก 1 หุ้น/call** (คง push รายตัว — workflow คืนผลตอนจบทั้งชุด ส่งหลายตัวใน call เดียวจะ push คั่นระหว่างตัวไม่ได้) · override รายตัว: `stocks[0].effort` (หุ้นยาก → `"high"`)
   - **★★ ต้อง pin `stocks[].model` ทุก call เสมอ** (แก้ 9 ก.ย. 2569 — ย่อหน้าเดิมเขียนตรงข้ามกับ CLAUDE.md §3.2 และอิงข้อเท็จจริงที่ผิด):
     ข้อความเดิมว่า "ห้าม override เพราะ `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` ใน settings.json บังคับ Sonnet ให้อยู่แล้ว" — **ไม่จริง**: harness **กรองตัวแปรนี้ทิ้งเป็นการเฉพาะ** ตั้งผ่าน `settings.json` ไม่ได้ทั้งชั้น project และ local (วัดแบบ controlled 8 ส.ค. 69: ตัวแปรอื่นใน `env` block เดียวกันติดหมด ตัวนี้ตัวเดียวหาย)
     ⇒ **ไม่ pin = ได้ Opus 5 โดยไม่ตั้งใจ** (จ่ายราคา Opus ให้หุ้นธรรมดา + ป้าย `ai-model` ไม่ตรงแผน)
     ⇒ ส่ง `model:"sonnet"` เป็น default ทุกตัว · `model:"opus"` เฉพาะหุ้นยากตามเกณฑ์ §2 (ชั้น escalate Opus **กลับมาแล้ว** — user เคาะ 9 ส.ค. 2569)
     ⇒ เช็คก่อนเริ่มเวฟด้วย **probe subagent จริง** (spawn ไม่ใส่ `model` แล้วให้ตอบบรรทัด "You are powered by the model named …") — `echo $CLAUDE_CODE_SUBAGENT_MODEL` ใช้ไม่ได้ มันเห็นแค่ env ของ Bash
   - script ยังรองรับหลายตัว (รัน sequential) — ใช้เฉพาะกรณียอมรับว่า push ได้หลังจบทั้งชุดเท่านั้น
   - **★ ข้อห้ามจริง = "หลายหุ้นใน 1 run" ไม่ใช่ "หลาย run พร้อมกัน"** (แก้ 8 ส.ค. 2569 — ถ้อยคำเดิมเขียนกว้างเกินเจตนาเจ้าของรีโป): `stocks[]` ต้องมี **1 ตัวเสมอ** · การ spawn analyze-wave หลาย run ขนานกัน (run ละ 1 หุ้น) **ทำได้** แต่มีเงื่อนไขบังคับ 3 ข้อ:
     1. **controller pre-assign สีแบรนด์เอง** ก่อน spawn แล้วส่ง theme/GDOTS ลง prompt — **ห้าม worker รัน `pick-brand.js` เอง** เพราะมัน read-modify-write `tools/seeds.json` โดยไม่มี lock (`tools/pick-brand.js` อ่านบรรทัด ~30 เขียนบรรทัด ~111) ⇒ ขนานแล้ว **entry หายทับกัน + ขั้นตอนตรวจสีชนมองไม่เห็นสีของ worker อื่น ⇒ หุ้น 2 ตัวได้สีเดียวกันโดยไม่มีใครจับได้**
     2. **verify + push รายแบตช์ ไม่ใช่รายตัว** — `npm run verify` เป็น gate ทั้งรีโป ถ้ารันตอน worker อีกตัวเขียนไฟล์ค้าง ไฟล์ครึ่ง ๆ นั้นจะทำ gate ตกและบล็อกหุ้นที่เสร็จดีแล้ว (นี่คือเหตุผล per-wave เดิมที่หายไปเพราะ sequential — พอกลับมาขนาน มันกลับมาด้วย) · commit ยังคง **1 commit = 1 หุ้น** แค่ push รวมทีเดียวตอนจบแบตช์
     3. **ramp ทีละขั้น** — จำนวนที่ขนานเป็นดุลพินิจต่อครั้ง ไม่ใช่ค่าตายตัวในกฎ · คอขวดจริงคือ **API session rate limit ที่ worker ทุกตัวใช้ร่วมกัน** (เคยพังทั้งเวฟจริงใน US-GAP W19–W21 — ขนานแล้ว fail พร้อมกันหมด ต้องทำใหม่ = เสีย token สองเท่า) → เจอ rate limit เมื่อไหร่ให้หาร N ครึ่งแล้ว re-run เฉพาะตัวที่ล้ม
     - push ชนกันข้าม run **ไม่ใช่ปัญหา** — worker ไม่เคย push อยู่แล้ว controller เป็นคน push ⇒ serialize ผ่าน controller โดยโครงสร้าง
3. แต่ละ call เสร็จ → controller ตรวจผล (คืนสรุปราคา/FV/MOS จาก worker) → verify + push รายตัวตามข้อ 4 → ค่อยเรียกตัวถัดไป

## 6. ลดจำนวนเองได้ ถ้าของดีไม่พอ

สั่ง 30 แต่คัดแล้วดีจริง 20 → ส่ง 20 ได้ (คุณภาพ > โควตา) · **ต้องแจ้งเหตุผล** (valuation แพงไม่มี MOS / ข้อมูลไม่พอ / ซ้ำของสด)

## 7. เกร็ดต้นทุน (วัดจริง 12 ก.ค. 2569 — ดู memory token-usage-benchmarks)

- ต้นทุน worker อยู่ที่ **จำนวน turn × ~70k cache-read** ไม่ใช่ output (~3-4k/ตัวเท่านั้น) → เป้า: NEW/UPDATE ~15 turns · UPDATE-LIGHT ≤10 turns
- ฝั่ง controller: cacheR/turn **ไม่คงที่** — โตตาม context (~70k session สั้น → ~139k เมื่อรัน 25 ตัวรวด) — รันยาวได้ ไม่มี chunk/session (ข้อ 3) แต่คุม turn ตัวเองให้น้อย/ตอบสั้นระหว่างเวฟ
- 3 หุ้นบน Sonnet ≈ 25k output + ~10M cache-read → เย็นเดียวเคลียร์ได้ ~15 ตัวสบาย ๆ · **Opus main เคยกิน ~15% ลิมิต/3 หุ้น** → นี่คือเหตุผลที่ Opus ใช้ escalate รายตัวเท่านั้น ไม่ใช่ default ทั้งเวฟ
