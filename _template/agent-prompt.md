# Per-stock agent prompt — wrapper (token-lean)

Controller ใช้แม่แบบนี้ตั้ง prompt ให้ **worker agent 1 ตัว = 1 หุ้น** (CLAUDE.md §3.3 + docs/orchestration.md)
แทน `{{SYMBOL}}`, `{{MARKET}}` (TH/US), `{{MODE}}` (**NEW** = ยังไม่มีรายงาน → **ใบ v3** (`report.js` · SKILL STEP 5V) / **UPDATE** = มี `reports/<SYM>.html` แล้ว / **UPDATE-LIGHT** = refresh จากคิว price-flags), `{{WORKTREE}}`, `{{CURRENT_TAGS}}` (controller อ่าน `tags.json[<SYM>]` มาวาง — ว่าง = ยังไม่มี tag) แล้วส่งเป็น `prompt` ของ `Agent` (หรือ args ของ workflow `analyze-wave`)
`{{MEDIANS}}` = controller **ต้องรัน** `node tools/median-multiples.js <SYM> [--th]` เองแล้ววาง output ทั้ง block (ตัวคูณมัธยฐานย้อนหลังของหุ้นตัวเอง — CLAUDE.md §8 ชั้น 0.4b บังคับให้ controller เป็นคนวัด) · ไม่มีบล็อกนี้ = worker จะประมาณตัวคูณเอง แล้วลงเอยที่ **ตัวคูณปัจจุบัน** ⇒ ขา FV วนกลับหาราคาสปอต (สมอตาย · `W18` · วัดจริง 9 ก.ย. 69 เคส ODFL) · ประวัติสั้น/ขาดทุนจนวัดไม่ได้ → วางผลที่ตัวสคริปต์บอกว่า "ใช้ไม่ได้" ไปตรง ๆ อย่าปล่อยว่างเฉย ๆ
`{{FUNDAMENTALS}}` = controller **ควรรัน** `node tools/prep-stock.js <SYM> [--th] [--update]` เองแล้ววาง output ทั้ง block มาเสมอ (1 คำสั่ง = fundamentals + facts (NEW) + CROSS-VERIFY verdict — **exit 2 = ราคาขัดแหล่ง >5% ห้าม spawn worker หยุดถามผู้ใช้** · ตัดทั้ง turn รันซ้ำและ WebFetch หน้า financials 3-6 call ของ worker) · ไม่วางก็ปล่อยว่าง/ลบทิ้งได้ — บรรทัดกำกับใน wrapper สั่ง worker รันเองเมื่อ block ว่างอยู่แล้ว
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
(เก็บข้อมูลผ่าน script · cross-source verify · FV ≥2 วิธี · MOS/scenario · NEW = `node tools/report.js init/save {{SYMBOL}}` เท่านั้น (SKILL STEP 5V · **ห้ามเขียน `reports/` ด้วย Write/Edit/Bash** · `save ✓` = gate) · UPDATE = แก้ `reports/{{SYMBOL}}.html` ของตัวเองเท่านั้น + self-check `npm test -- {{SYMBOL}}` ต้อง 0 error)
- ติดเงื่อนไข "หยุด" ใน SKILL.md (ราคาต่าง >5% / EPS ขัดกัน) → **รายงานกลับ controller ทันที อย่าเดา/อย่าเขียน**
- ❌ **ห้ามเรียก `advisor` เอง ทุกกรณี** — เจอประเด็นยาก*ใหม่*กลางทาง ให้ **คืนคำถามกลับมาให้ controller** แล้วรอ (controller จะจัด courier subagent ให้ตามกติกา CLAUDE.md §7) · นี่เป็น **ข้อห้ามเชิงนโยบาย ไม่ใช่ข้อจำกัดทางเทคนิค** — worker เรียกได้จริงและอาจสำเร็จด้วย (วัดจริง 9 ก.ย. 69: worker DASH เรียกตรงแล้วได้คำตอบ) แต่ทำให้ controller ไม่เห็นว่าใครใช้ข้อมูลอะไรตัดสิน และ transcript ที่ยาวทำให้คำแนะนำเพี้ยนจากที่ควรได้
- ❌ **ห้ามเรียก skill `stock-controller`** — เป็นกติกาของ controller เท่านั้น (worker ห้ามทำตามหัวข้อ [controller] ของ CLAUDE.md แม้งานนี้มาจากคิว price-flags) · ใช้เฉพาะ `stock-analyzer`
- ★★ **ตัวคูณเป้าหมายห้ามลอกมาจากตัวคูณปัจจุบัน** ("เป้า ~36x เพราะใกล้เคียง P/E ปัจจุบัน 36x" = ขาที่คืนราคาตลาดกลับมาโดยโครงสร้าง — `W18` จะฟ้อง) · มีบล็อก `=== ตัวคูณมัธยฐานย้อนหลัง ===` ให้แล้ว **ห้ามประมาณเอง** · ใช้ตัวคูณปัจจุบันเป็น *บริบทเปรียบเทียบ* ได้ แต่ห้ามเป็น *ที่มา* ของเป้า → SKILL STEP 3 + `docs/quality-gate.md` §0.4e
- **ประทับรุ่นโมเดลของตัวเอง (บังคับทุกโหมด):** NEW (v3) = `meta.aiModel: "Claude <รุ่นที่รันจริง>"` ใน `.work/{{SYMBOL}}.json` · UPDATE (v2) = `<meta name="ai-model" content="Claude <รุ่นที่รันจริง>">` — อ่านรุ่นจากบรรทัด **"You are powered by the model named …"** ใน system prompt ของตัวเอง (UPDATE/UPDATE-LIGHT = **แก้ค่าเดิมให้เป็นรุ่นของรอบนี้** แม้รอบก่อนใช้รุ่นอื่น) · ห้ามคงค่าที่ติดมากับไฟล์/โครง ห้ามคัดลอกจากรายงานตัวอื่น — ป้ายนี้คือบันทึกว่าใครวิเคราะห์จริง gate ตรวจได้แค่รูปแบบ ไม่รู้ว่าโกหกไหม
- **คืนงานต้องบอก `ai-model` ที่ประทับไว้ด้วย** เพื่อให้ controller spot-check ตรงกับโมเดลที่ spawn จริง (CLAUDE.md §3.2)

**กติกาประหยัด turn (ต้นทุนจริง = จำนวน turn ไม่ใช่ความยาวคำตอบ):**
- **batch tool calls** — เรียก tool ที่อิสระต่อกันหลายตัวในข้อความเดียวเสมอ (script 2 ตัว + อ่านไฟล์ = 1 turn)
- **เขียน/แก้ไฟล์ตามโหมด:**
  - **NEW** = **v3**: STEP 1–4 ตาม SKILL แล้ว `node tools/report.js init <SYM>` → เติม `TODO` ทั้งหมดใน `.work/<SYM>.json` ชุดเดียว → `node tools/pick-brand.js <SYM> "#hex" --auto` ครั้งเดียว (ไม่ copy theme) → `report.js show` → `report.js save` (แก้ทุก path ที่มันพิมพ์แล้ว save ใหม่) — **SKILL STEP 5V เป็นกติกา · ห้ามเขียน `reports/` ตรง · ห้าม skeleton/apply-edits/`{{rd:}}`** · **CLAUDE.md §2 ที่ inject มาให้ (skeleton/.html) เป็นข้อความก่อน v3 — ไม่ใช้กับใบใหม่** · ห้าม Read/grep ไฟล์ใน `reports/` ตัวอื่น
  - **UPDATE / UPDATE-LIGHT** = สแกนหาทุกจุดก่อน แล้ว apply ทั้งหมดใน Bash call เดียวผ่าน `node tools/apply-edits.js` (รูปแบบบล็อก `@@` ดู SKILL STEP 5C ข้อ 3) — **ห้ามใช้ Edit tool แก้ทีละจุดทีละ turn** (วัดจริง: 12–16 turn ที่หายไปต่อหุ้นเกิดตรงนี้) · ข้อความ "เดิม" ใน block = **copy verbatim จากบรรทัดจริง (ผล `sed -n`)** ห้ามพิมพ์จากความจำ — วัดจริง: "หาไม่เจอ" 21 ครั้ง/เวฟเกิดตรงนี้ · ถ้า fail ใช้บรรทัด near-match ที่ error พิมพ์มาให้เลย ไม่ต้อง grep กู้ · **ใบ v2: ตัวเลขผูกราคา (`fv`/`values.*`) แก้ด้วย `apply-edits --set`** (บล็อก `@@` เหลือไว้ใช้กับ prose/การ์ดที่เป็น literal — compose ทั้งสองอย่างในคำสั่งเดียว **ต้องเติม `--stdin`** ไม่งั้นบล็อก `@@` จะไม่ถูกอ่านเลย)
- ห้าม grep/สำรวจ `_template/` `build.js` `test/` เพื่อไล่ความหมาย class — ดู `docs/templates.md` ครั้งเดียวพอ · E/W code จาก gate → `docs/quality-gate.md` เฉพาะ code นั้น
- **ปีในวันที่ที่ตัวเองประทับ = พ.ศ. เสมอ ทั้งหุ้นไทยและ US** (CLAUDE.md §7): footer "ข้อมูล ณ 22 ก.ย. **2569**" · `dateEra` = `"BE"` (v3 ระดับบนสุด — init ใส่ให้ · v2 = `values.dateEra`) — **ห้ามใช้ ค.ศ.** · ปีงบ/ปีของเหตุการณ์ในเนื้อหา (FY2026, Q3 2026) เขียนตามแหล่งได้ — กฎนี้คุมเฉพาะวันที่ของรายงานเอง
- (v2) ป้าย MOS (`mos-verdict`) ใช้โซน **bad <10% / ok 10–20% / good ≥20%** — ราคาพลิกโซนให้แก้ `class="mos-verdict …"` ตามนี้เลย ห้าม survey รายงานตัวอื่น
- `find` โดน rtk hook ดัดแล้วพังกับ `-not`/`-prune` — ใช้ `grep -rl`/`ls` แทน หรือ `rtk proxy find …`
- (v2) self-check `npm test` **ครั้งเดียวตอนงานเสร็จ** ไม่รันระหว่างทาง · **ใบ v3 NEW: `node tools/report.js save <SYM>` ✓ แทน — ไม่รัน `npm test`** (จะแดง `[v2:E40]` เสมอจน controller tag) · ไม่อ่านไฟล์ซ้ำหลัง Edit (harness ตรวจให้แล้ว)

**FUNDAMENTALS:** ถ้าบล็อกด้านล่างมีข้อมูลแล้ว **ห้ามรัน fetch-fundamentals ซ้ำ** — ใช้ตัวเลขจาก block นี้เลย (controller cross-verify มาแล้ว · วัดจริง 13 ก.ค. 2569: worker 3/3 รันซ้ำทั้งที่ block ครบ = เสีย 1 turn/หุ้นเปล่า) · block มีตารางงบ 5 ปี [3] → ใช้เขียน section งบ/แนวโน้ม/scenario ได้เลย **ห้าม WebFetch หน้า financials/balance-sheet/ratios/cash-flow/statistics ของ stockanalysis ซ้ำ** · **block มี `=== FACTS ===` (ราคา/chart/ป้าย %) → ห้ามรัน fetch-facts ซ้ำด้วย** ใช้บล็อก chart นั้นเลย (ใบ v3 NEW: `report.js save` รวม chart จาก sidecar ให้เอง — ไม่ต้องวาง) · **ถ้า block ว่าง/เหลือ placeholder/ไม่มีตัวเลขเท่านั้น**จึงรัน `node tools/prep-stock.js {{SYMBOL}}` (หุ้นไทยเติม `--th` · โหมด UPDATE เติม `--update`) เองใน batch แรกของ SKILL STEP 1

{{FUNDAMENTALS}}

=== ตัวคูณมัธยฐานย้อนหลัง (controller วัดมาแล้ว — ห้ามประมาณเอง ห้ามรันซ้ำ) ===
{{MEDIANS}}

> ว่าง/ไม่มีบล็อกนี้ = controller ยังไม่ได้วัด → **ห้ามเดาตัวคูณจากค่าปัจจุบัน** ให้ใช้ peer ที่วัดจริง หรือตระกูลอื่น (EV/Sales · DDM) เป็นขาแทน แล้วเขียนกำกับว่าทำไม
> สคริปต์บอก "ใช้ไม่ได้ (<3 จุด)" = ประวัติสั้น/ปีขาดทุนเยอะ → เหมือนกรณีว่าง

=== TAGS ปัจจุบัน ===
{{CURRENT_TAGS}}

> ว่างเปล่า = หุ้นใหม่ยังไม่มี tag (โหมด NEW — เลือก 2–3 slug จาก `tags-vocab.json`)
> มีค่า = โหมด UPDATE ให้ **ทบทวนบังคับ** แต่ค่าตั้งต้นคือคงเดิม
> ★ ห้ามเขียน `tags.json` เอง — คืนเป็นบรรทัด `TAGS: …` ให้ controller เขียนแทน

**STEP 2 — คืนงาน:** รายงานกลับ controller สั้น ๆ: NEW: `reports/{{SYMBOL}}.json` save ✓ (+ `meta.aiModel` · hex seed) / UPDATE: `reports/{{SYMBOL}}.html` เสร็จ + ราคา/FV/MOS + แหล่งที่ใช้ + บรรทัด `TAGS: …` (ไม่ต้องเล่าขั้นตอน)
**ห้าม `git add/commit/push` เอง** — controller เป็นคน push (รายตัว หลังตรวจงานเสร็จ)
