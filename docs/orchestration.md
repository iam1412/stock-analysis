# Orchestration — วิเคราะห์หลายตัว/เป็นกลุ่ม (รายละเอียดเต็มของ CLAUDE.md §3)

> ไฟล์นี้คือ "เหตุผลและกลไก" ของกติกาใน `CLAUDE.md §3` — invariant สั้น ๆ อยู่ที่นั่น อ่านไฟล์นี้เมื่อจะรันเวฟจริง
> ขั้นตอนต่อหุ้น = `.claude/skills/stock-analyzer/SKILL.md` · prompt แม่แบบ worker = `_template/agent-prompt.md`

## 1. ก่อนเริ่ม — กันซ้ำ + ความสด

1. **`git pull --rebase origin main` ก่อนเสมอ** → อ่าน `reports.json` (ได้ของ session อื่นที่เพิ่ง push มาด้วย)
2. เทียบแต่ละตัว (ฟิลด์ `updated`) — **เกณฑ์ความสด = 7 วัน** (คนละตัวกับ staleness gate 45/120 วัน):
   - สด ≤7 วัน → **ไม่วิเคราะห์ซ้ำ** · ธีม/โควตา → หาตัวใหม่ในธีมมาแทน · ระบุชื่อชัด → ข้าม (แจ้ง)
   - เกิน 7 วัน → วิเคราะห์ซ้ำ = **UPDATE mode** · ยังไม่มี → NEW (skeleton) · จากคิว price-flags → triage ตาม SKILL STEP 0 (UPDATE-LIGHT / UPDATE เต็ม / plumbing)
3. กันซ้ำข้าม session = push รายตัว (pull --rebase มากับลำดับ push ของทุกตัวอยู่แล้ว — ตัวที่คนอื่น push แล้วโผล่ใน `reports.json` → ถูกคัดออก session อื่นเห็นเร็วสุด)

## 2. โมเดล (บังคับ)

- **ห้าม Haiku ทุกขั้น** (Sonnet+Haiku และ Haiku-ล้วน ห้ามทั้งคู่ — benchmark AMGN 30 มิ.ย. 2569: Haiku = build-crash + fake-chart + wrong-EPS)
- **ค่าเริ่มต้น = All-Sonnet**: controller=Sonnet, worker=Sonnet (`model:"sonnet"`) — ตราบใดที่ controller ตรวจข้ามแหล่ง price/EPS ≥2 + กราฟจริงจาก script + จับ split/ticker เอง
- **หุ้นยาก** (IPO <1 ปี / spinoff / split / cyclical / ราคา cross-source ต่าง >5%) → **escalate อัตโนมัติ** spawn worker ตัวนั้นเป็น **Opus** (`model:"opus"`) ไม่ต้องบอก user
- การตัดสิน publish/skip ของ controller เอง**กำกวม** → หยุด ping user สลับ session เป็น Opus
- **effort ต่อ worker**: งาน mechanical (UPDATE-LIGHT / UPDATE ที่ EPS ไม่เปลี่ยน) ไม่จำเป็นต้องใช้ effort สูง — spawn ผ่าน workflow `analyze-wave` (ข้อ 5) เพื่อตั้ง `effort:"medium"` ได้ · Agent tool ปกติตั้ง effort ไม่ได้

## 3. Spawn — 1 หุ้น/agent · sequential

- **spawn 1 Agent/หุ้น** — full analysis หุ้นตัวเดียวจบใน context ของ agent เอง เขียนลง `reports/<SYMBOL>.html` ของตัวเองเท่านั้น · เหตุผล: context แยกสะอาด กันเลขปนข้ามหุ้น (**ตัวร้าย #1 ของรีโป**) · ใช้ prompt แม่แบบ `_template/agent-prompt.md` (ระบุ `{{MODE}}` ให้ถูก · วางบล็อก `{{FUNDAMENTALS}}` ถ้า controller pre-fetch ให้)
- **★ STEP 0 กัน cwd-stray:** prompt ให้ agent เริ่ม `cd <worktree> && pwd` + ห้าม `cd` ลง main repo · ตอน push เช็ค `ls reports/<SYM>.html` ใน worktree — ไม่มี = ไปหยิบจาก main repo + ลบตัวหลง (ดู memory bulk-stock-analysis-workflow)
- **★ SEQUENTIAL (บังคับ):** spawn 1 agent → รอ notification "completed" → ตรวจ/แก้ error → spawn ถัดไป — **ห้าม spawn parallel หลายตัวพร้อมกัน** เพราะกด API session rate limit ทุกตัว fail พร้อมกัน (เกิดจริงใน US-GAP W19–W21 — งานพังกลางคันต้องทำซ้ำ = token เสียเปล่าสองเท่า)
- fallback: agent fail → ทำ inline ใน main session แทน (fetch + write เอง)
- **จำนวนหุ้นต่อรอบ (เวฟ) ไม่จำกัด** (ยกเลิก "เวฟละ ≤3" 12 ก.ค. 2569) — sequential + push รายตัว (ข้อ 4) ทำให้ blast radius = 1 หุ้นอยู่แล้ว **แต่จำกัดต่อ session: คิวยาวหั่นเป็น chunk ≤8 ตัว/session** — จบ chunk = ทุกตัว push แล้ว → **หยุด สรุปผล + วางคำสั่ง kickoff ให้ user เปิด session ใหม่ทำ chunk ถัดไป** (state ทั้งหมดอยู่ใน git + `price-flags.json` แล้ว ไม่มีอะไรต้อง handoff) · เหตุผล: cacheR/turn ของ controller โตตาม context — วัดจริง 12 ก.ค. 2569 รัน 25 ตัวรวดเดียว = 2.28M cacheR/หุ้น (~139k/turn) vs session สั้น 5 ตัว = 0.75M (~70k/turn)

## 4. Push รายตัว (ห้าม agent push เอง)

- worker เสร็จ 1 ตัว → controller ตรวจผล → verify + commit + push **หุ้นตัวนั้นทันที ก่อน spawn ตัวถัดไป** — รวมเป็น Bash call เดียวตามลำดับ CLAUDE.md §5 (ไม่เพิ่ม turn):
  `npm run verify && git add -A && git commit -m "analyze: add <SYM> …" && git pull --rebase origin main && git push origin HEAD:main`
- **ทำไมรายตัว (เปลี่ยนจาก per-wave 12 ก.ค. 2569):** verify เป็น gate ทั้งรีโป — แบบรายเวฟ ตัวเดียวที่พังจะบล็อกตัวที่เสร็จแล้วทั้งเวฟ · แบบรายตัว งานที่เสร็จ = deploy แล้ว ไม่ค้างใน worktree ถ้า session ตาย + revert/bisect รายหุ้นได้ · เหตุผล per-wave เดิม ("sibling ที่เขียนค้างบล็อก verify") หมดไปตั้งแต่บังคับ **sequential** — ตอน push ไม่มี sibling เขียนค้างแล้ว · ต้นทุน verify ต่ำมาก (วัดจริง ~3.5s @761 รายงาน)
- **ห้าม push ซ้อน** หลาย session พร้อมกัน — กัน git race (commit ก่อน pull --rebase เสมอ)

## 5. Workflow `analyze-wave` — spawn แบบคุม effort ได้ (ทางเลือก)

ใช้เมื่ออยากลด token ของ worker งาน mechanical (effort ต่ำลง = tool calls กระชับ/turn น้อยลง) — กติกาทุกข้อข้างบนยังใช้ครบ (sequential ในตัว script แล้ว):

1. controller เตรียม prompt ต่อหุ้นจาก `_template/agent-prompt.md` ตามปกติ (แทน `{{...}}` ครบ รวม `{{FUNDAMENTALS}}` ถ้า pre-fetch แล้ว)
2. เรียก `Workflow` tool:
   ```
   Workflow { name: "analyze-wave",
              args: { stocks: [ {label:"AAPL", prompt:"<prompt เต็ม>"} ],
                      effort: "medium" } }
   ```
   - **เรียก 1 หุ้น/call** (คง push รายตัว — workflow คืนผลตอนจบทั้งชุด ส่งหลายตัวใน call เดียวจะ push คั่นระหว่างตัวไม่ได้) · override รายตัว: `stocks[0].effort` / `stocks[0].model` (เช่น escalate ตัวยากเป็น opus+high)
   - script ยังรองรับหลายตัว (รัน sequential) — ใช้เฉพาะกรณียอมรับว่า push ได้หลังจบทั้งชุดเท่านั้น
3. แต่ละ call เสร็จ → controller ตรวจผล (คืนสรุปราคา/FV/MOS จาก worker) → verify + push รายตัวตามข้อ 4 → ค่อยเรียกตัวถัดไป

## 6. ลดจำนวนเองได้ ถ้าของดีไม่พอ

สั่ง 30 แต่คัดแล้วดีจริง 20 → ส่ง 20 ได้ (คุณภาพ > โควตา) · **ต้องแจ้งเหตุผล** (valuation แพงไม่มี MOS / ข้อมูลไม่พอ / ซ้ำของสด)

## 7. เกร็ดต้นทุน (วัดจริง 12 ก.ค. 2569 — ดู memory token-usage-benchmarks)

- ต้นทุน worker อยู่ที่ **จำนวน turn × ~70k cache-read** ไม่ใช่ output (~3-4k/ตัวเท่านั้น) → เป้า: NEW/UPDATE ~15 turns · UPDATE-LIGHT ≤10 turns
- ฝั่ง controller: cacheR/turn **ไม่คงที่** — โตตาม context (~70k session สั้น → ~139k เมื่อรัน 25 ตัวรวด) → ต้องหั่น chunk ≤8 ตัว/session (ข้อ 3 + CLAUDE.md §4)
- 3 หุ้นบน Sonnet ≈ 25k output + ~10M cache-read → เย็นเดียวเคลียร์ได้ ~15 ตัวสบาย ๆ · ห้ามหวนกลับไป Opus main (กิน ~15% ลิมิต/3 หุ้น)
