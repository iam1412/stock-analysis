# ของค้างระบบ 3 ข้อ (จาก docs/open-items.md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิดของค้างที่เป็นบั๊กเนื้อหา/ตรรกะจริง 3 ข้อ ที่คัดออกมาจากของค้างเปิดอยู่ 20 ข้อใน `docs/open-items.md` — ข้ออื่นถูกตัดสินไว้แล้วว่ายังไม่ต้องแก้ (ดูตารางคัดกรองด้านล่าง) ไม่อยู่ในขอบเขตแผนนี้

**Architecture:** งานแก้โค้ดจริงมี 1 จุด (#43 — `tools/derived-values.js` + `test/check-reports.js` + `test/self-test.js`) ไม่มีงานสร้างระบบใหม่ · งานที่เหลือเป็นการซ่อมเนื้อหารายงาน (#42) และแคมเปญวิเคราะห์หุ้นปกติ (#20) ผ่านเครื่องมือที่มีอยู่แล้ว ไม่ใช่งานเขียนโค้ดใหม่

**Tech Stack:** Node ≥20.19 zero-dep, `test/check-reports.js` gate (`npm run verify` 18 ขั้น), `npm run queue`, git history

**Spec:** `docs/open-items.md` แถว #20, #42, #43 (ต้นทาง) · `CLAUDE.md` §8 (quality gate — ห้ามแก้ check โดยไม่มี self-test) · `.claude/skills/stock-controller/SKILL.md` (สำหรับ #20)

## Global Constraints

- ห้าม push ตรง `main` ระหว่างทำ — ทำใน worktree/branch แยก, controller เปิด PR เอง (ยกเว้น #20 ที่เป็นแคมเปญวิเคราะห์หุ้นปกติซึ่ง CLAUDE.md §5 ให้ auto-push ต่อไฟล์ได้)
- commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- แก้ `test/check-reports.js` ต้องมี self-test mutation ใน `test/self-test.js` ก่อน push (CLAUDE.md §8, ขอบเขต = E/W-code ใน check-reports.js เท่านั้น)
- ห้ามแก้ `dist/`, `reports.json` มือ — build สร้างเอง
- แก้ `reports/*.html` เป็นชุด (#42) ต้องท่า `heal/edit → npm run verify → preserve-dates ถ้าจำเป็น` — **ห้าม** ทำให้ footer "ข้อมูล ณ" ของใบที่ไม่ได้ re-analyze จริงขยับ (แก้แค่เนื้อหา `.ret` ไม่ใช่ re-analysis เต็ม)
- pin `model` ทุก dispatch (ห้าม Haiku, ห้ามปล่อย default) ถ้าใช้ `analyze-wave`/`Agent` สำหรับ #20

## ★ ตารางคัดกรอง — ทำ vs ไม่ทำ (20 ข้อเปิดใน open-items.md)

| # | เรื่อง | คำตัดสิน | เหตุผล |
|---|---|---|---|
| **43** | สีกล่องสรุป "ส่วนต่างจากราคา" ไม่ตรงเครื่องหมาย MOS (14 ใบ) | **✅ ทำ — Task 1** | บั๊กตรรกะจริง ไม่มี checker เลย จะเกิดกับใบใหม่ทุกใบที่ MOS ติดลบ ไม่ใช่แค่ 14 ใบเดิม |
| **42** | เสียคำขยาย/จำนวนเงินใน `.ret` หมวด 6 ตอน migrate v1→v2 (39+6+2 ใบ) | **✅ ทำ — Task 2** | เนื้อหาบิดเบือนคนอ่าน (เคส SO หนักสุด) แต่กู้คืนได้จาก git history 100% ต้นทุนต่ำ ผลตอบแทนสูง |
| **20** | ~23 ใบ EPS ค้าง >2% (วัดครั้งล่าสุด ส.ค. 69 — **ก่อน**แคมเปญ re-analyze 908 ใบ 21–22 ก.ย. 69) | **✅ ทำ — Task 3** (ผู้ใช้เลือกรวมในแผนนี้) | ต้องวัดใหม่ก่อน เพราะลิสต์เดิมน่าจะล้าสมัยไปมากแล้วจากแคมเปญเต็มที่เพิ่งจบ — Task 3 คือ "วัดใหม่ + วิเคราะห์เฉพาะใบที่ยังค้างจริง" |
| 1, 37, 39, 41, 44 | ตระกูล E44/prose-token (`%/ปี`, การแปลง prose→token, เลขบังเอิญตรงค่าฐาน, `V2TOKENS` count, `summary` token) | ❌ ไม่ทำ | ตัดสินแล้วและตรึงเป็นเทส (`test/report-values-test.js`, `test/self-test.js`) — เปิดใหม่เฉพาะเมื่อมีเคสจริงเกิดขึ้นหรือ schema เปลี่ยน |
| 36 | 24 ใบยังเป็น v1 (residue ที่เชิงกลตัดสินไม่ได้) | ❌ ไม่ทำ | เป็นความขัดแย้งข้อเท็จจริงที่ auto-pick ผิดจะพลิกบทสรุปหุ้นเงียบๆ — fix-on-touch เมื่อหุ้นนั้นถูกวิเคราะห์จริง ไม่ใช่ sweep |
| 5, 6, 11, 14 | ช่องโหว่ checker (dual-leg family, EV/Sales·EV/EBITDA·DCF ไม่มี checker, roe null) | ❌ ไม่ทำ | ยอมรับเป็น fix-on-touch แล้ว (22 ก.ย. 69) ไม่มีความเสียหายเร่งด่วน |
| 24, 29 | ปฏิทินงบหุ้นไทย (Yahoo ให้วันที่แค่ 21% ของ `.BK`) | ❌ ไม่ทำ | บล็อกจากภายนอก — ต้องหาแหล่งข้อมูลใหม่ (SET calendar/StockAnalysis) ก่อน ไม่ใช่งานเขียนโค้ด |
| 15 | คำขอคำศัพท์ tag 49 รายการ | ⏸ รอเจ้าของ | เป็นคิวรอเจ้าของรีวิวเอง ไม่ใช่งานที่ agent ทำแทนได้ |
| 16, 17 | `workers.dev` เดิมยังเปิด, ไม่มี `x-cache` header | ❌ ไม่ทำ | ตัดสินใจเก็บ `workers_dev=true` ไว้แล้ว (ลิงก์เก่ายังใช้) — ไม่มีความเสียหาย |

---

### Task 1: สีกล่องสรุป "ส่วนต่างจากราคา" ให้ตรงเครื่องหมาย MOS เสมอ (#43)

**พบจากการสำรวจ (read-only, ยืนยันแล้วก่อนเขียนแผนนี้):**
- มี "กล่อง verdict" 2 จุดที่แยกกันโดยสิ้นเชิง — **อย่าสับสน**:
  1. `.mos-verdict {{rd:mosClass}}` (กล่องใหญ่) — **แก้ไปแล้วสมบูรณ์**: token `mosClass` (`tools/report-values.js:18,135` — `mosBand(mos)` คืน `bad|ok|good`), cron เขียนทุกรอบ (`tools/update-prices.js:623`), มี checker (W04/field-manifest f19) ครบ — **ไม่ใช่บั๊กนี้**
  2. vcell "ส่วนต่างจากราคา" (`<div class="v" style="color:#a5d6a7">MOS ~ {{rd:mos}}</div>` — ยืนยันจาก `reports/DELL.html:311`, `reports/SAP.html:309`) — **นี่คือบั๊ก**: `#a5d6a7` เป็นสีเขียวที่ **hardcode ครั้งเดียวตอนวิเคราะห์** ไม่ตรงกับ `--green:#067647` ที่ CSS ใช้จริงด้วยซ้ำ (`_template/dashboard.css:9`) และไม่มีใครแก้ไขสีนี้อีกเลยไม่ว่าง MOS จะเปลี่ยนไปทางไหน — `summaryPlan`/healer #11 (`tools/derived-values.js:247-256`) แก้แค่ **ข้อความ** `MOS ~ ±X%` ทุกรอบ cron แต่จงใจไม่แตะ attribute อื่น (คอมเมนต์ยืนยันที่ `derived-values.js` ใกล้ฟังก์ชันนี้ + self-test.js:264 assert ว่า healer #11 ต้องคง attribute เดิม)
- ระบบสีที่มีอยู่แล้วในคลัง 2 แบบ ให้เลือกใช้ซ้ำ:
  - **`.pos{color:var(--green)} .neg{color:var(--red)}`** (`_template/dashboard.css:87`) — ระบบ 2 สีตามเครื่องหมาย ใช้แล้วที่ `tools/report-values.js:132` (`cls: total >= 0 ? 'pos' : 'neg'`) และใบเก่าบางใบมี `class="v pos"` อยู่แล้ว (คอมเมนต์ `derived-values.js:204`)
  - **`mosBand()` → `bad|ok|good`** (`tools/report-values.js:18`) — ระบบ 3 ระดับ ใช้กับกล่องใหญ่ข้างบนอยู่แล้ว ค่า `mosClass` มีพร้อมใช้ในทุกรอบ patch อยู่แล้ว (ไม่ต้องเพิ่มการคำนวณใหม่)

**★ คำตัดสินจาก advisor review (23 ก.ย. 69) — แทนที่คำแนะนำเบื้องต้นเดิม:**

**(B)+(i) — ไม่ใช่ (ii).** `CLAUDE.md §10`: "โทเคนสี derive จาก accent ตอน build · การตกแต่งทุกอย่าง inject ตอน build — **ห้ามแก้ไฟล์รายงานเพื่อเรื่องดีไซน์**" — `#a5d6a7` ที่เห็นใน DELL/SAP ทุกวันนี้**ผิดกฎนี้อยู่แล้ว** (ไม่ตรงกับ `--green:#067647` ที่ build derive จริงด้วยซ้ำ) ให้ `summaryPlan` เขียน hex สดใหม่ทุกรอบ cron (แผนเดิม ตัวเลือก ii) จะ **ทำให้ anti-pattern นี้ฝังลึกกว่าเดิม** ไม่ใช่แก้ ⇒ ทางแก้ที่ถูกกฎ = เปลี่ยนเป็น **class** (`.v.bad/.ok/.good` — ยังไม่มีคลาสนี้ใน CSS มีแค่ `.pos/.neg` ที่ dashboard.css:87 ต้องเพิ่มใหม่) reuse **`mosBand()`** (bad/ok/good) เพื่อให้สีตรงความหมายเดียวกับกล่องใหญ่ที่อยู่หน้าเดียวกัน (เลือก B เพราะ "เลขเดียวกัน กล่องติดกัน" ห้ามขัดกันเอง)

**★ ข้อเท็จจริงที่แก้จากการสำรวจรอบสอง:** skeleton **ไม่ได้** hardcode `#a5d6a7` ให้กล่อง MOS — `_template/skeleton-{th,us}.html:315` ใช้ `style="color:#ffd180"` (สีส้ม placeholder) ⇒ สีเขียวที่เห็นใน DELL/SAP เป็นค่าที่ worker เลือกเองตอนวิเคราะห์แล้วไม่มีใครซิงก์ตามอีกเลยเมื่อราคาขยับผ่าน cron

**★ แก้ไขจากรอบ advisor ที่สอง — สรุปเดิม ("ไม่ต้องแก้ skeleton") ผิด:** ประเด็นไม่ใช่ค่า hex (`#a5d6a7` vs `#ffd180`) แต่คือ **skeleton ยังมี inline `style` เลย** ซึ่งเป็น anti-pattern ตัวเดียวกับที่ทั้ง Task นี้กำลังกำจัด — ถ้าปล่อย skeleton ไว้แบบเดิม: (1) ทุกใบใหม่จะสืบทอด inline style มา → specificity ชนะ class เสมอ → checker Step 5 จะยิงทุกใบใหม่ (หรือถ้าผ่อนเกณฑ์ให้ยอมรับสีนี้ = ทำลายจุดประสงค์ของ fix) (2) SKILL 5A น่าจะบอกให้ worker "เลือกสี" เอง → worker เขียน hex ใหม่ซ้ำปัญหาเดิม ⇒ **Task นี้ต้องแก้ skeleton ด้วย**

**3 กับดักที่ต้องแก้ในแผน ก่อนเขียนโค้ด:**
1. **inline `style` ชนะ class เสมอ (specificity)** — เพิ่ม `class="v good"` เฉยๆ โดยไม่ลบ `style="color:#a5d6a7"` จะไม่มีผลอะไร ต้อง **ลบ inline style ออกจริง** ⇒ เป็นการ sweep ไฟล์ `reports/*.html` (ทุกใบที่มีช่องนี้ ~883+ ใบ v2 + 24 v1) ต้องทำท่า `heal → build → preserve-dates → build` (Global Constraints ของแผน phase3 audit เป็นแบบอ้างอิง) — **ไม่ใช่แค่แก้ 14 ใบที่รู้ว่าสีผิด** เพราะใบอื่นที่สีถูกอยู่ตอนนี้ (บังเอิญ) ก็ยังมี inline style ค้างที่จะ drift ผิดอีกในอนาคต
2. **`test/self-test.js:264` assert ว่า healer #11 ต้องคง attribute เดิมไว้ (ไม่แก้ style/class)** — ตัว writer ใหม่จะเปลี่ยนพฤติกรรมนี้โดยตรง ⇒ ต้อง **แก้ assertion นั้นให้ตรงกับพฤติกรรมใหม่ (ไม่ใช่ลบทิ้งเฉยๆ)** เป็น step ที่ต้องระบุชัดในแผน ไม่ใช่ผลข้างเคียงที่ค้นพบทีหลัง
3. **จุดเขียนจริง (writer home) ต้องยืนยันว่าเขียนที่ไหน** — `summaryPlan` ถูกเรียกบน **"view ที่ render แล้ว"** (`tools/report-values.js:210-211` เป็นบริบท) ต้องตรวจให้ชัดว่านี่คือ `dist/` (build output) หรือ `reports/` (ต้นฉบับ) — ถ้าเป็น `reports/` การเปลี่ยนจาก inline style เป็น class ทำได้ตรงๆ ที่ต้นฉบับ; ถ้าเป็น `dist/` เท่านั้น ต้องแก้ที่ build step แทน ไม่ใช่แก้ไฟล์ต้นฉบับ · **ห้ามเพิ่ม token `{{rd:}}` ใหม่ / ห้ามเพิ่มเข้า `REQUIRED_TOKEN_SITES`** — #44 ตัดสินไว้แล้วว่า `summary` ไม่เข้ารายการนั้นเพราะมีตัวเขียนอยู่แล้ว (`summaryPlan`) การเพิ่ม token จะรื้อคำตัดสินนั้นโดยไม่จำเป็น

**Follow-up ที่พบระหว่างสำรวจ (นอกขอบเขตแผนนี้ — บันทึกเป็นแถวใหม่ใน `docs/open-items.md` แทน):** กล่อง "เป้านักวิเคราะห์ 12 ด." (`เป้านักวิเคราะห์`) มี `style="color:#a5d6a7"` **hardcode ตายตัวใน skeleton เอง** (`skeleton-{th,us}.html:316`) — % ของเป้านักวิเคราะห์ติดลบได้ (เป้าต่ำกว่าราคาปัจจุบัน) แต่จะเขียวตลอดไปทุกใบใหม่ ไม่มีวันถูกต้อง 100% ผิดกับกล่อง MOS ที่อย่างน้อย worker เลือกถูกตอนแรก — **นี่คือบั๊กที่กระทบทุกใบใหม่จริง (severity สูงกว่า #43 เดิมในแง่ scope) แต่ยังไม่มีแถวใน open-items.md** ต้องเปิดแถวใหม่แยกต่างหาก ไม่รวมเข้า Task 1 นี้ (คนละ token/คนละ field)

**Files:**
- Modify: `tools/derived-values.js` (ฟังก์ชัน `summaryPlan`, บรรทัด 247-257 — เพิ่มการคำนวณ/คืนค่าสีที่ต้องการ)
- Modify: จุดที่เรียก `summaryPlan` เพื่อ splice ค่าจริงลงไฟล์ (`derived-values.js:1026` และจุดที่เกี่ยวข้องใน `tools/update-prices.js` ที่เรียก patch pass #11 — grep `summaryPlan(` เพื่อหาจุด splice attribute)
- Modify: `test/check-reports.js` — เพิ่ม checker ใหม่ (เทียบสีที่พิมพ์จริงกับ `mosBand(mos)`/เครื่องหมาย) ใช้ W06 (`check-reports.js:589` บริเวณใกล้เคียง) เป็นแบบ
- Modify: `test/self-test.js` — เพิ่มเคส mutation ใหม่ ใช้แบบ W06/healer#11 (`self-test.js:241-276`) เป็นต้นแบบ

**Interfaces:**
- Consumes: `mosBand(mos)` (`tools/report-values.js:18`, export แล้ว), `readSummaryCell`/`summaryPlan` (`derived-values.js:211,247`)
- Produces: `summaryPlan(html)` return object เพิ่ม field ใหม่ (เช่น `wantColor`/`colorOk`) ให้ checker และ writer ใช้ร่วมกัน — ตั้งชื่อ field ให้ตรงกับ pattern เดิม (`ok`, `canonical` มีอยู่แล้วใน return object ปัจจุบัน)

- [ ] **Step 1: ยืนยัน "writer home"** — grep เรียก `summaryPlan(` ทั้งหมดใน `tools/update-prices.js`/`tools/derived-values.js` แล้วตามไปดูว่าฟังก์ชันที่ห่ออยู่ (`derivedPassV2`/`patchDerived`/`healDerived`) เขียนกลับไฟล์ไหน (`reports/<SYM>.html` ต้นฉบับ หรือ `dist/` build output) — บันทึกผลก่อนเขียนโค้ดต่อ ถ้าเป็น `dist/` ให้หยุดและกลับไปคุย advisor ใหม่ (สมมติฐานทั้งแผนเปลี่ยน)
- [ ] **Step 2: เพิ่ม CSS class ใหม่ใน `_template/dashboard.css`** ใกล้บรรทัด 87 (`.pos/.neg` เดิม) หรือใกล้บรรทัด 120-122 (`.mos-verdict.bad/.ok/.good`) — `.vcell .v.bad{color:var(--red)} .vcell .v.ok{color:var(--yellow)} .vcell .v.good{color:var(--green)}` (ตั้งชื่อ scope `.vcell .v` กันชนกับ `.pos/.neg` ที่ใช้ที่อื่น)
- [ ] **Step 2b: แก้ skeleton ให้เลิกใส่ inline style** — `_template/skeleton-{th,us}.html:315` เปลี่ยน `<div class="v" style="color:#ffd180">MOS ~ {{rd:mos}}</div>` เป็น `<div class="v">MOS ~ {{rd:mos}}</div>` (ไม่ใส่ class เริ่มต้นด้วย เพราะยังไม่รู้ MOS ตอนสร้างจาก skeleton) แล้วรัน `npm run test:skeleton`/`skeleton-test` ให้ผ่าน — เพิ่ม 1 บรรทัดใน `.claude/skills/stock-analyzer/SKILL.md` หัวข้อ 5A ระบุว่า **worker ไม่ต้องเลือกสีช่องนี้เอง cron จะเติม class ให้ตอน patch รอบแรก** (กันไม่ให้ worker เขียน hex ใหม่ทับ)
- [ ] **Step 3: เขียนเทส `test/self-test.js` ที่ยัง fail** — mutate fixture ให้ vcell มี `style="color:#…"` เขียวทั้งที่ `mos` ติดลบ แล้วเรียก checker ใหม่โดยตรง assert ว่าต้องยิง
- [ ] **Step 4: รัน `npm run test:self` ยืนยันว่า fail ด้วยเหตุผลถูกต้อง** (checker ยังไม่มีอยู่ = fail เพราะหา error code ไม่เจอ)
- [ ] **Step 5: implement checker ใหม่ใน `test/check-reports.js` เป็น W-code (ไม่ใช่ E)** — เทียบสีที่พิมพ์จริง (parse `style="color:#…"` **หรือ** class `.v.bad/.ok/.good` ถ้า migrate ไปแล้ว) กับ `mosBand(mos)` ที่คาดหวัง ต้องรองรับทั้งสองรูปแบบระหว่างช่วง sweep (ใบที่ยังไม่ถูกแก้ = inline style เก่า, ใบที่แก้แล้ว = class ใหม่) — **เป็น warn ไม่ใช่ error** เพราะใบที่เพิ่งถูก worker เขียน/re-analyze ใหม่จะยังไม่มี class จนกว่า cron รอบแรกจะ patch ให้ (บรรทัดฐานเดียวกับ W06 — CLAUDE.md §9: "ใบที่ worker เพิ่งเขียน อาจยิง W06 จนกว่า cron รอบถัดไปจะซ่อม — ไม่ใช่บั๊กโค้ด") ถ้าตั้งเป็น error จะบล็อก push ของทุกใบใหม่โดยไม่มีเหตุผล
- [ ] **Step 6: implement writer** — เปลี่ยน markup จาก `<div class="v" style="color:#…">` เป็น `<div class="v bad">`/`<div class="v ok">`/`<div class="v good">` (ค่า literal `bad|ok|good` จาก `mosBand(mos)` โดยตรง — **ไม่ใช่ token `{{rd:…}}` ใหม่**, เพราะ #44 ตัดสินแล้วว่า `summary` ไม่เข้า `REQUIRED_TOKEN_SITES`) เขียนที่จุดเดียวกับ Step 1 พบ (splice attribute แทนที่ `style="…"` เดิมทั้ง attribute ไม่ใช่แก้แค่ค่า hex)
- [ ] **Step 7: แก้ `test/self-test.js:264`** (assertion เดิมว่า healer #11 ต้องคง attribute เดิม) ให้ตรงกับพฤติกรรมใหม่โดยตั้งใจ — เพิ่ม comment อธิบายว่าทำไม behavior เปลี่ยน (เดิม "คง attribute" ตอนนี้ "แก้ class ตาม mosBand เสมอ")
- [ ] **Step 8: รัน `npm run test:self` ยืนยันผ่านทั้งเคสเก่าและใหม่**
- [ ] **Step 9: dry-run กับ 14 ใบที่รู้ว่าเป็นบั๊กจริง** (`AKAM CEG COHU DELL DXCM DY ELV ETN EXPE GLW MSFT MXL NOK SAP`) — ยืนยันว่า writer แก้ markup ถูกทุกใบ ไม่กระทบใบอื่นที่สีถูกอยู่แล้ว
- [ ] **Step 10: sweep ทั้งคลัง** — รัน writer ผ่านทุกใบที่มีช่องนี้ (~883+ v2 + 24 v1) ท่า `heal → npm run build → tools/preserve-dates.js → npm run build` (ห้ามข้าม `preserve-dates` — ไม่งั้น footer "ข้อมูล ณ" ของทุกใบที่ถูกแตะจะขยับเป็นวันนี้ทั้งหมด ทั้งที่ไม่ได้ re-analyze จริง)
- [ ] **Step 11: รัน `npm run verify` เต็ม 18 ขั้นบนทั้งคลัง** — ต้องผ่าน (ไม่มี regression ใบอื่น)
- [ ] **Step 12: commit** ตามท่า §5 (verify → add → commit → pull --rebase → push) — ระบุใน commit message ว่าเป็น content-repair ทั้งคลัง ไม่ใช่ 1 หุ้น 1 commit (เหมือน Task 2 — ดูหมายเหตุ "batch commit" ที่นั่น)

---

### Task 2: กู้คืนคำขยาย/จำนวนเงินที่หายใน `.ret` หมวด 6 (#42)

**พบจากการสำรวจ:** ต้นตอคือ `tools/migrate-v2.js:901` (คอมเมนต์ยืนยันเองว่าเป็น "จุดบอด") — ตัวตรวจโครงสร้างตอน migrate มาสก์ตัวเลขและ**เว้นข้อความ `.ret` ทั้งช่องก่อนเทียบ** ⇒ เทียบแค่จำนวน/คลาสของ `%` ไม่เทียบคำขยายรอบข้าง ทำให้คำอย่าง `(capital gain)`/`(รวมปันผล)`/`(ราคา)` หายไปตอน token-ize โดยไม่มี error ใดๆ ฟ้อง — **ตั้งใจเป็นจุดบอดที่รู้อยู่แล้ว ไม่ใช่บั๊กที่ยังไม่รู้สาเหตุ**

**ยืนยันว่ากู้คืนได้จากประวัติ git 100% (ทดสอบกับ SO แล้ว):**
```
git show 83fc2a2e~1:reports/SO.html   # ก่อน migrate — มี "+3% (capital gain)" เต็ม
git show 83fc2a2e:reports/SO.html     # หลัง migrate — เหลือแค่ {{rd:sc1ret}} token
```
Commit `83fc2a2e` ("migrate(v2): แบตช์ 7/10 (SHOP–TOP)") คือจุด migrate ของ SO — **แต่ละ symbol อาจ migrate คนละ commit** ต้องหา commit ที่ถูกต้องต่อใบ (ดู Step 1)

**★ พบข้อสังเกตเพิ่มระหว่างสำรวจ (ไม่ใช่ในขอบเขต #42 เดิม แต่เกี่ยวข้อง):** SO ก่อน migrate มี class `"ret neg"` บน `+3%` ที่เป็นบวก — สีผิดเครื่องหมายแบบเดียวกับ #43 อาจมีอยู่ในโค้ดเก่าก่อน migrate ด้วย ต้องเช็คว่าหลุดรอดมาถึง SO.html ปัจจุบันหรือไม่ (ถ้าใช่ ถือเป็นเคสเพิ่มของ Task 1 ไม่ใช่ Task 2)

**Files:**
- Create: สคริปต์ค้นคืน (`tools/scratch/recover-ret-qualifiers.js` หรือใช้ `git log --follow -p` มือ — ตัดสินใจใน Step 1 ว่าจะเขียนสคริปต์หรือทำมือ ขึ้นกับว่ากู้คืนอัตโนมัติได้แค่ไหน)
- Modify: `reports/<SYM>.html` × ~45 ใบ (39 เสียแค่คำขยาย, 6 เสียทั้งคำขยาย+จำนวนเงิน, 2 เพิ่มจากระยะ 3 — รายชื่อเต็มอยู่ open-items.md แถว #42)

**★ คำตัดสินจาก advisor review (23 ก.ย. 69) — บล็อกที่ต้องแก้ก่อนแตะไฟล์จริง:**

1. **Step "เทียบข้อความเดิม" เดิมผิด** — "(capital gain)" ถูกต้องเฉพาะถ้า token `{{rd:sc1ret}}` ยัง**คำนวณแบบ capital-only** เท่านั้น `tools/report-values.js:132` คำนวณ `total` จาก `{tgt, div}` — **ถ้า migrator ใส่ `values.scN.div` ไว้ (ไม่ใช่ null) ตัวเลขปัจจุบันจะรวมปันผลไปแล้ว** และป้าย "(capital gain)" เดิมจะกลายเป็นป้ายเท็จถ้า copy กลับตรงๆ ⇒ CLAUDE.md §8 เตือนไว้แล้วว่า "ฐาน 'รวมปันผล' ถอดจากตัวเลขที่โชว์เองเท่านั้น" **ทุกใบต้องตรวจ `report-data.values.scN.div` ก่อนตัดสินใจใส่ป้ายอะไรกลับ** — null = capital-only (ใส่ป้ายเดิมได้) · มีค่า = ต้องเขียนป้ายใหม่ว่า "รวมปันผล" ไม่ใช่ copy ป้ายเก่า
2. **ข้อความจะใส่ตรงไหนทางกายภาพยังไม่ชัด** — `.ret` div ตอนนี้คือ `{{rd:sc1ret}}` (token ล้วน ใส่ข้อความแทรกในตัว token ไม่ได้) ต้องหาว่าใส่เป็นข้อความต่อท้าย token ในช่องเดียวกัน หรือใส่ใน `hint`/prose ข้างเคียงแทน — **และต้องเช็คว่า scenario parser (W17) ยอมให้มีข้อความตามหลัง token ใน `.ret` หรือไม่** (อาจ reject)
3. **ต้องรัน SO ตัวเดียวจบทั้งกระบวนการก่อน** (`npm test -- SO` + `node tools/spotcheck.js SO`) แล้วค่อยทำใบที่เหลือ 44 ใบ — ห้ามลงมือ 45 ใบพร้อมกันโดยไม่พิสูจน์กับ 1 ใบก่อน

- [ ] **Step 1: หา migrate-commit ต่อใบทั้งลิสต์** — `git log --oneline --all -- reports/<SYM>.html | grep -i migrate` ต่อทุกใบใน 45 ใบ เพื่อยืนยันว่ามี commit "migrate(v2)" อยู่จริงและกู้คืนได้ (ถ้าใบไหนไม่มี = ต้องตรวจแยก ไม่ใช่ assume ว่ากู้คืนได้เหมือนกันหมด)
- [ ] **Step 2: กู้คืนข้อความ `.ret` ก่อน migrate ของแต่ละใบ** (`git show <commit>~1:reports/<SYM>.html` แล้ว grep ส่วน `.ret`/หมวด 6) บันทึกเป็นตาราง SYM → ข้อความเดิม
- [ ] **Step 3: ตรวจฐานปัจจุบันก่อนตัดสินใจป้าย** — อ่าน `report-data.values.scN.div` ของแต่ละใบ (N = คอลัมน์ที่เสียคำขยาย): null → ป้ายเดิม (capital gain/ราคา) ยังถูก ใส่กลับได้ตรงๆ · มีค่า → **ต้องเขียนป้ายใหม่ "(รวมปันผล)"** ไม่ใช่ copy ป้ายเก่าจาก git history — ห้ามข้ามใบไหนโดยไม่เช็ค
- [ ] **Step 4: ทำ SO ให้จบก่อนใบเดียว (proof-of-process)** — กู้คืนป้าย (+จำนวนเงินคำนวณใหม่จากค่าปัจจุบันถ้าจำเป็น ไม่ใช่ copy ค่าเก่า) ใส่กลับเข้า HTML จริง **เลือกตำแหน่งตามลำดับนี้**: (1) ต่อท้าย `{{rd:sc1ret}}` ในช่อง `.ret` เดิม (ทางเลือกแรกเสมอ ถ้า parser ยอม — ดู Step 5) (2) ถ้า parser ไม่ยอม ค่อยใช้ `hint` **แต่ต้องเขียนทับ/แทนที่ข้อความ "รวมปันผล" boilerplate ที่ skeleton พิมพ์ติดมาทุกใบ ไม่ใช่ต่อท้ายข้างๆ มัน** (CLAUDE.md §8: hint boilerplate "ห้ามเชื่อ" อยู่แล้ว — ถ้าป้ายจริงไปอยู่ข้างๆ boilerplate เท็จ คนอ่านจะสับสนกว่าเดิม) แล้วรัน `npm test -- SO` + `node tools/spotcheck.js SO` ให้ผ่านก่อนแตะใบอื่น
- [ ] **Step 5: ยืนยันว่า scenario parser (W17/self-test) ยอมรับข้อความตามหลัง `{{rd:sc1ret}}` ใน `.ret`** จากผล SO ของ Step 4 — ผลนี้ตัดสินว่า Step 4 ใช้ตำแหน่ง (1) หรือ (2)
- [ ] **Step 6: ทำซ้ำ Step 2-4 กับใบที่เหลือ 44 ใบ** ตามวิธีที่พิสูจน์แล้วกับ SO
- [ ] **Step 7: รัน `npm run verify` ทีละใบหรือเป็นชุดเล็ก** (`npm test -- <SYM>`) ยืนยันไม่มี regression ทุกใบ
- [ ] **Step 8: ตรวจเคส SO class="ret neg" ผิดเครื่องหมายที่พบระหว่างสำรวจ** — ถ้ายังอยู่ใน SO.html ปัจจุบัน ให้บันทึกเป็นเคสเพิ่มของ Task 1 (ไม่ใช่แก้ในนี้)
- [ ] **Step 9: รัน `tools/preserve-dates.js` ก่อน build สุดท้าย (บังคับ ไม่ใช่ทางเลือก)** — 45 ไฟล์ถูกแก้ = `updated` hash จะขยับพร้อมกันถ้าข้ามขั้นนี้ ⇒ ทั้ง 45 ใบจะกระโดดขึ้นบนสุดของหน้าแรกเป็น "ใบใหม่" ทั้งที่ไม่ได้ re-analyze จริง (§10 freshHash trap) — ท่า: `heal/edit → npm run build → node tools/preserve-dates.js → npm run build`
- [ ] **Step 10: commit เป็นชุดตาม §5 — ระบุการเบี่ยงกฎอย่างชัดเจนใน PR/commit body** เนื้อหาเดียวกันหลายใบ commit รวมได้ 1 ครั้ง **เบี่ยงจาก "1 commit = 1 หุ้น"** (มีบรรทัดฐานจาก `migrate(v2): แบตช์ …` ของ phase3) — commit message: `fix: restore .ret qualifiers lost in v1→v2 migration (N files)` และต้องเขียนในบอดี้ว่าทำไมถึงรวม commit (content-repair ไม่ใช่ analyze รายตัว)

**คำถามเปิดที่ถามไว้ — advisor ตอบแล้ว (23 ก.ย. 69): ไม่เพิ่ม checker ป้องกัน.** open-items #1 วัดไว้แล้วว่าการตรวจจับ "คำบอกฐาน" ในร้อยแก้วด้วยกลไกมี false-positive 9/12 และไม่มี token ให้ยึด — checker แบบ "เตือนเมื่อไม่มีคำบอกฐาน" จะยิงทุกใบที่ไม่มีคำบอกฐานโดยชอบธรรมเช่นกัน จุดบอดของ `migrate-v2.js:901` มีผลเฉพาะ 24 ใบ v1 residue ที่เหลือ (#36) ซึ่งอยู่ในเส้นทาง "ให้คนอ่านตัดสิน" อยู่แล้ว — **บันทึกเป็นหมายเหตุเพิ่มในแถว #36 ของ open-items.md แทนการเปิด checker ใหม่** ปิดคำถามนี้

---

### Task 3: วัดใหม่ + ปิดคิว EPS ค้าง >2% (#20)

**สำคัญ:** ลิสต์ ~23 ใบเดิม (HSY SNNP COP NUE CF …) วัดจาก wave W08 **ส.ค. 69** — ก่อนแคมเปญ re-analyze เต็ม 908 ใบ (21–22 ก.ย. 69) ซึ่งน่าจะ refresh EPS ของหลายใบในนั้นไปแล้ว **ห้ามเชื่อลิสต์เดิม ต้องวัดใหม่ก่อนสั่งวิเคราะห์**

**★ คำเตือนจาก advisor review:** **ไม่มี bulk EPS screening tool อยู่ในคลังจริง** (`tools/` ไม่มีสคริปต์ scan ทั้ง 908 ใบ) — `memory:data-source-traps.md §6d` อธิบาย**วิธีมือ** (ดึงการ์ด EPS จากไฟล์เทียบ `quote[SA]=` ที่ได้จาก `tools/queue/prep.js` **ต่อหุ้น**) ไม่ใช่เครื่องมือ bulk ที่มีอยู่แล้ว — การจะสแกนทั้ง 908 ใบต้องเรียก prep ทีละตัว 908 ครั้ง (fetch ราคา/EPS จริงทุกครั้ง) ซึ่งมีต้นทุน rate-limit/เวลา **ต้องถามเจ้าของก่อนว่าจะทำระดับไหน** ไม่ใช่ assume ว่าทำได้เลย — Step 1 ด้านล่างจึงเป็น "เสนอขอบเขตให้เจ้าของเลือก" ไม่ใช่คำสั่งรันตรงๆ

**Files:** ไม่มีไฟล์ใหม่ (ยกเว้นเจ้าของเลือกให้เขียน bulk screener ใหม่ — นอกขอบเขตเดิม ต้องตกลงก่อน) — ใช้เครื่องมือที่มีอยู่ (`tools/queue/prep.js` ต่อหุ้น ตามที่ `memory:data-source-traps.md §6d` อธิบายวิธีคัดกรอง: ดึงการ์ด EPS (TTM) จากไฟล์ เทียบกับ `quote[SA]=` ใน prep — Δ >2% = ต้อง UPDATE เต็ม)

- [x] **Step 0: เจ้าของเลือกแล้ว (23 ก.ย. 69) — ขอบเขต (B) เฉพาะกลุ่มเสี่ยงก่อน** ไม่ใช่วัดเต็ม 908 ใบ — เริ่มจากลิสต์เดิม ~23 ใบ (`HSY SNNP COP NUE CF …` — ยืนยันซ้ำว่ายังค้างจริงหรือไม่ตาม Step 1/2) **+ หุ้นที่มีงบไตรมาส/ปีใหม่ประกาศล่าสุด** (เทียบวันประกาศงบกับ footer "ข้อมูล ณ" ของรายงาน — ใช้นิยามเดียวกับกฎ LIGHT/FULL ใน CLAUDE.md §9) — ขยายเป็นกลุ่มใหญ่กว่านี้ทีหลังเฉพาะถ้าพบว่ากลุ่มเสี่ยงที่ตรวจแล้วมีอัตราค้างสูง (เจ้าของตัดสินใจตอนนั้น ไม่ commit ล่วงหน้า)
- [ ] **Step 1: รันคัดกรอง EPS ค้างตามขอบเขตที่เลือกใน Step 0** (ไม่ใช่แค่ 41 ใบเดิมที่เคยกรองด้วยเกณฑ์ "แหล่งข้อมูล <3" ซึ่งไม่เกี่ยวกับความสดของงบ — memory เตือนไว้ว่า "สงสัยว่าปัญหากระจายทั้งคลัง ยังไม่วัด") ได้ลิสต์ปัจจุบันจริง
- [ ] **Step 2: กรอง false positive ด้วยมือ** (กับดัก adj vs GAAP ที่เคยพลาดกับ ICLR — memory §6d) — เปิดรายงานจริงของทุกใบที่ติดก่อนสรุปว่าเป็น EPS ค้างจริง ไม่ใช่นิยามต่าง
- [ ] **Step 3: เรียก Skill `stock-controller`** ก่อนสั่งวิเคราะห์เป็นกลุ่ม (บังคับตาม CLAUDE.md §3) — จัดคิวเป็น UPDATE เต็ม (ไม่ใช่ LIGHT เพราะ EPS ค้างแปลว่ามีงบใหม่)
- [ ] **Step 4: spawn worker วิเคราะห์ทีละตัว/ตามแบตช์** ตาม §3.3/§3.4 (pin model, prep ก่อนเสมอ) — verify+push ตามท่าเดิม
- [ ] **Step 5: อัปเดต `docs/open-items.md` แถว #20** เป็นปิดแล้วพร้อมจำนวนใบจริงที่แก้ + commit/วันที่

---

## Follow-up ที่พบระหว่างวางแผน (ไม่อยู่ในขอบเขตนี้ — ต้องเปิดแถวใหม่)

- **กล่อง "เป้านักวิเคราะห์ 12 ด." เขียวตายตัวจาก skeleton เอง** (`_template/skeleton-{th,us}.html:316`, `style="color:#a5d6a7"`) — analyst target % เป็นลบได้แต่จะเขียวทุกใบใหม่ตลอดไป กระทบกว้างกว่า #43 (ซึ่ง skeleton ไม่ได้ hardcode ผิด) — **ต้องเปิดแถวใหม่ใน `docs/open-items.md` ก่อนเริ่ม Task 1** เผื่อ advisor/เจ้าของอยากรวมเข้าเป็น scope เดียวกับ Task 1 (ใช้กลไกเดียวกันได้ — `mosBand`-style แต่คนละ sign source) แทนที่จะแก้แยกสองรอบ

## Self-Review

- **Spec coverage:** #43 (Task 1), #42 (Task 2), #20 (Task 3) ครบทั้ง 3 ข้อที่คัดไว้ ✅ · ตารางคัดกรองครอบคลุมทั้ง 20 แถวเปิดใน open-items.md (ไม่มีแถวตกหล่น) · เพิ่มบั๊กใหม่ที่พบระหว่างสำรวจ (analyst-target box) เป็น follow-up แยก ไม่ยัดเข้า Task 1 โดยไม่ถาม
- **Placeholder scan:** Task 1 Step 1 (ยืนยัน writer home), Task 2 Step 1/3/5 (หา commit จริง/เช็คฐานจริง/ยืนยัน parser จริง) เป็น "ตรวจข้อเท็จจริงก่อนเขียนโค้ด" ไม่ใช่โค้ดสำเร็จรูป — จงใจ เพราะ advisor ชี้ว่าสมมติฐานเดิม (ii สำหรับ #43, copy ป้ายตรงๆ สำหรับ #42) ผิดทั้งคู่จนกว่าจะยืนยันข้อเท็จจริงเหล่านี้ก่อน ไม่ใช่ placeholder ที่หลีกเลี่ยงงาน
- **Type/interface consistency:** Task 1 เปลี่ยนจาก "เขียน hex" เป็น "เขียน class" ตลอดทั้ง flow (CSS Step 2 → checker Step 5 → writer Step 6 → self-test Step 7) สอดคล้องกันแล้วหลังแก้ตาม advisor — ไม่มี step ไหนอ้างถึง hex เดิมค้างอยู่
- **Blockers รอบ 1 (advisor):** (1) #43: (ii)→(i) + 3 กับดัก ✅ (2) #42: Step 3 basis validation + SO-first probe ✅ (3) preserve-dates บังคับ ✅ (Task 1 Step 10, Task 2 Step 9)
- **Blockers รอบ 2 (advisor, หลังแก้รอบ 1):** (1) skeleton ต้องแก้ด้วย (ไม่ใช่แค่ hex ต่างจาก a5d6a7) ✅ เพิ่ม Step 2b + แก้ SKILL 5A (2) checker ต้องเป็น W ไม่ใช่ E ✅ ระบุใน Step 5 (3) Step 6 เขียน literal `bad|ok|good` ไม่ใช่ `{{cls}}` ที่ดูเหมือน token ✅ แก้คำแล้ว (4) คำถามเปิดของ Task 2 (เพิ่ม checker กันซ้ำไหม) ✅ ตอบแล้ว = ไม่เพิ่ม บันทึกที่ #36 แทน (5) ตำแหน่ง hint ต้องแทนที่ boilerplate ไม่ใช่อยู่ข้างๆ ✅ แก้ Step 4 แล้ว — advisor สรุป "Task 3 fine as revised" ไม่มี blocker เพิ่ม
