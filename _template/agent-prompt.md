# Per-stock agent prompt — wrapper (token-lean)

Controller ใช้แม่แบบนี้ตั้ง prompt ให้ **worker agent 1 ตัว = 1 หุ้น** (CLAUDE.md §3.2 + docs/orchestration.md)
แทน `{{SYMBOL}}`, `{{MARKET}}` (TH/US), `{{MODE}}` (**NEW** = ยังไม่มีรายงาน / **UPDATE** = มี `reports/<SYM>.html` แล้ว / **UPDATE-LIGHT** = refresh จากคิว price-flags), `{{WORKTREE}}` แล้วส่งเป็น `prompt` ของ `Agent` (หรือ args ของ workflow `analyze-wave`)
`{{FUNDAMENTALS}}` = *ทางเลือก* — controller รัน `node tools/fetch-fundamentals.js <SYM> [--th]` เองแล้ววาง output มา (worker จะได้ไม่ต้องเสีย turn รัน) · ไม่วางก็ปล่อยว่าง/ลบทิ้งได้ — บรรทัดกำกับใน wrapper สั่ง worker รันเองเมื่อ block ว่างอยู่แล้ว
เนื้อหาขั้นตอนทั้งหมดอยู่ **`.claude/skills/stock-analyzer/SKILL.md`** (single source of truth) — wrapper นี้มีแค่สิ่งที่ skill ไม่รู้: ที่อยู่ worktree, โหมด, กติกาห้าม push

---

วิเคราะห์หุ้น **{{SYMBOL}}** ({{MARKET}} · โหมด **{{MODE}}**) ทำรายงานเดียวจบใน context นี้

**STEP 0 — ยืนยันที่อยู่ (บังคับ กัน cwd-stray):**
```
cd {{WORKTREE}} && pwd
```
ต้องได้ path นี้เป๊ะ · **ห้าม `cd` ลง main repo** (`/Users/somchai.s/Downloads/stock`) — เขียนไฟล์ผิดที่จะหายจาก worktree

**STEP 1 — อ่านคู่มือแล้วทำตามทุกขั้น:**
อ่าน `.claude/skills/stock-analyzer/SKILL.md` แล้วทำตามในโหมด **{{MODE}}** ครบทุก STEP
(เก็บข้อมูลผ่าน script · cross-source verify · FV ≥2 วิธี · MOS/scenario · เขียน `reports/{{SYMBOL}}.html` ของตัวเองเท่านั้น · self-check `npm test -- {{SYMBOL}}` ต้อง 0 error)
- ติดเงื่อนไข "หยุด" ใน SKILL.md (ราคาต่าง >5% / EPS ขัดกัน) → **รายงานกลับ controller ทันที อย่าเดา/อย่าเขียน**

**กติกาประหยัด turn (ต้นทุนจริง = จำนวน turn ไม่ใช่ความยาวคำตอบ):**
- **batch tool calls** — เรียก tool ที่อิสระต่อกันหลายตัวในข้อความเดียวเสมอ (script 2 ตัว + อ่านไฟล์ = 1 turn)
- **เขียน/แก้ไฟล์ตามโหมด:**
  - **NEW** = เตรียมเนื้อหาครบทุก STEP แล้ว **Write `reports/<SYM>.html` เต็มใบครั้งเดียว** ตามโครง skeleton (SKILL STEP 5A) — ห้าม `cp`+ไล่แทน token, ห้ามใช้ apply-edits/Edit เป็นชุด · หน้าตาบล็อก filled ทุกก้อน (report-data/vmethod ทุกทรง/gauge/mos-verdict/stock-meta ปกติ+pe:null/ai-model/gdots/footer) → `docs/templates.md` §"ตัวอย่าง filled (NEW)" อ่านที่เดียวจบ · **ห้าม Read/grep/sed ไฟล์ใน `reports/` ตัวอื่นทุกกรณี** — บล็อกที่หาไม่เจอในเอกสาร = ใส่ตามแบบตัวอย่างที่ใกล้สุดแล้วให้ gate จับ · สีแบรนด์ = `node tools/pick-brand.js <SYM> "#hex" --auto` **1 turn จบ** (ตรวจชน — ชนแล้วสลับเฉดว่างใกล้สุดให้เอง + ลง seeds.json + พิมพ์ theme/GDOTS ให้ copy — ห้ามเดาเฉดใหม่วนลูป) · pre-write เช็ค W08 (ที่มา ≥3 ชื่อ + เป้านักวิเคราะห์/52 สัปดาห์/งวดงบ) + E21 (mval = EPS×P/E ใน mdesc ±3%) ตาม SKILL 5A · เกณฑ์เลขสอดคล้อง (E21/E22 ±3% · โซน MOS W04 · W06) อ่านตาราง `docs/quality-gate.md` **ครั้งเดียวทั้ง section** อย่า grep ทีละ code — **ห้ามเปิด `test/check-reports.js` ทั้งก่อนและหลังเขียน**
  - **UPDATE / UPDATE-LIGHT** = สแกนหาทุกจุดก่อน แล้ว apply ทั้งหมดใน Bash call เดียวผ่าน `node tools/apply-edits.js` (รูปแบบบล็อก `@@` ดู SKILL STEP 5C ข้อ 3) — **ห้ามใช้ Edit tool แก้ทีละจุดทีละ turn** (วัดจริง: 12–16 turn ที่หายไปต่อหุ้นเกิดตรงนี้) · ข้อความ "เดิม" ใน block = **copy verbatim จากบรรทัดจริง (ผล `sed -n`)** ห้ามพิมพ์จากความจำ — วัดจริง: "หาไม่เจอ" 21 ครั้ง/เวฟเกิดตรงนี้ · ถ้า fail ใช้บรรทัด near-match ที่ error พิมพ์มาให้เลย ไม่ต้อง grep กู้
- ห้าม grep/สำรวจ `_template/` `build.js` `test/` เพื่อไล่ความหมาย class — ดู `docs/templates.md` ครั้งเดียวพอ · E/W code จาก gate → `docs/quality-gate.md` เฉพาะ code นั้น
- ป้าย MOS (`mos-verdict`) ใช้โซน **bad <10% / ok 10–20% / good ≥20%** — ราคาพลิกโซนให้แก้ `class="mos-verdict …"` ตามนี้เลย ห้าม survey รายงานตัวอื่น
- `find` โดน rtk hook ดัดแล้วพังกับ `-not`/`-prune` — ใช้ `grep -rl`/`ls` แทน หรือ `rtk proxy find …`
- self-check `npm test` **ครั้งเดียวตอนงานเสร็จ** ไม่รันระหว่างทาง · ไม่อ่านไฟล์ซ้ำหลัง Edit (harness ตรวจให้แล้ว)

**FUNDAMENTALS (controller อาจ pre-fetch มาให้ — เช็คก่อนใช้):** ถ้า block ด้านล่างว่าง/เหลือ placeholder/ไม่มีตัวเลข → รัน `node tools/fetch-fundamentals.js {{SYMBOL}}` (หุ้นไทยเติม `--th`) เองใน batch แรกของ SKILL STEP 1 · มีตัวเลขครบ → ใช้เลย ห้ามรันซ้ำ

{{FUNDAMENTALS}}

**STEP 2 — คืนงาน:** รายงานกลับ controller สั้น ๆ: เขียน `reports/{{SYMBOL}}.html` เสร็จ + ราคา/FV/MOS + แหล่งที่ใช้ (ไม่ต้องเล่าขั้นตอน)
**ห้าม `git add/commit/push` เอง** — controller เป็นคน push (รายตัว หลังตรวจงานเสร็จ)
