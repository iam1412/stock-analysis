# Decisions & evidence — ที่มา/หลักฐานของกฎใน CLAUDE.md

ไฟล์นี้เก็บ **หลักฐาน · ตัวเลขที่วัดจริง · เหตุการณ์ที่ทำให้แก้กฎ · ประวัติการเปลี่ยนกติกา** ที่ย้ายออกจาก `CLAUDE.md` (21 ก.ย. 69) เพื่อให้ CLAUDE.md เหลือแต่ **กฎที่ต้องทำตาม** — CLAUDE.md ถูก inject เข้าทุก turn ของทั้ง controller และ worker จึงต้องสั้น

- หัวข้อเรียงตามเลข § ของ `CLAUDE.md` (§ ตรงกัน) · เนื้อหาย้ายมา **คำต่อคำ** ไม่สรุปใหม่ (กันความหมายเพี้ยน)
- **กฎอยู่ที่ CLAUDE.md (§3/§9 ฉบับเต็มอยู่ใน skill `stock-controller`)** — ไฟล์นี้ไม่ใช่กฎ เป็นเหตุผลว่า "ทำไมกฎเป็นแบบนี้" ไว้กันการเถียงซ้ำ · ถ้าขัดกันให้ถือว่าไฟล์นี้ล้าสมัย (กฎปัจจุบันอยู่ที่ CLAUDE.md และ skill `stock-controller`)
- ประวัติการทำงานราย phase ของ audit → `docs/open-items.md` · กลไกรายละเอียด → docs อื่นตามหัวข้อ (ดูตัวชี้ใน CLAUDE.md)

---

## §0 หัวไฟล์ (preamble)

### CLAUDE.md ถูก inject ให้ทั้ง controller และ worker — วัดจริงสองเส้นทาง

> **ไฟล์นี้ถูก inject ให้ทั้ง session หลัก (controller) และ subagent (worker) — วัดจริง 11 ก.ย. 69 (Agent tool) · 12 ก.ย. 69 (workflow `analyze-wave` — ได้ทั้ง CLAUDE.md และ MEMORY.md เหมือนกัน)**

memory `ai-model-stamping.md` สั่งว่า "อย่าแก้ข้อความใน CLAUDE.md จาก probe ครั้งเดียว" ⇒ ตัวเลข/วันที่ชุดนี้เก็บไว้เป็นหลักฐาน · กฎที่ยังอยู่ใน CLAUDE.md = "inject ทั้งสองบทบาท" + ป้าย `[controller]`

---

## §2 วิเคราะห์หุ้นเดี่ยว (skill `stock-analyzer`)

### ที่มาของการย้ายกติกาต่อหุ้นมาเป็น project skill

ย้ายจาก memory `stock-analyzer-skill` ตอนลบไฟล์นั้น (21 ก.ย. 69) — เก็บเฉพาะ **ประวัติ + เหตุผล + ข้อควรระวัง** ที่ repo ยังไม่มี · รายการ STEP ที่ memory เคยไล่ไว้ตัดออก (ล้าสมัย: ไม่มี STEP 5C) ให้ดู `.claude/skills/stock-analyzer/SKILL.md`

> The global `~/.claude/skills/stock-analyzer` skill **no longer exists** (discovered gone 2026-07-11; CLAUDE.md §2 used to call it and override its defaults). Replaced by a **project skill checked into the repo: `.claude/skills/stock-analyzer/SKILL.md`** — single source of truth for per-stock analysis […รายการ STEP ตัดออก].

> **Why:** the old chain (generic global skill + CLAUDE.md overrides + agent-prompt.md duplicate) drifted — stale section refs kept appearing; and CLAUDE.md carried ~25 lines of per-stock detail loaded into every session/agent.

> **How to apply (ตัดตอน):** bulk workers = `_template/agent-prompt.md` is now a thin wrapper (cwd guard + "read SKILL.md, mode {{MODE}}" + no-push). Editing analysis rules → edit SKILL.md only, don't re-add detail to CLAUDE.md/agent-prompt.

---

## §3.1 ก่อนเริ่มเวฟ (ความสด)

### ทำไม `reports.json.updated` ใช้ตัดสินความสดไม่ได้

> (runbook `preflight` ทำให้ · `reports.json.updated` ใช้ตัดสินไม่ได้ — freshHash ชนกัน 13 ใบ 9 ก.ย. 69)

---

## §3.2 โมเดล (Sonnet default / Opus escalate / pin model)

### ข้อความเดิมทั้งข้อ (ก่อนแตกเป็น bullet ย่อย) — เก็บคำต่อคำ

กฎฉบับใช้งานอยู่ที่ skill `stock-controller` §3.2 (`CLAUDE.md` §3.2 = สรุป) · ย่อหน้านี้เก็บไว้เพราะมีทั้งวันที่วัดจริงและที่มาของการแก้กติกา

> 2. **โมเดล**: ❌ Haiku ทุกขั้น · **Sonnet = default ของหุ้นส่วนใหญ่** · **Opus = escalate เฉพาะ "หุ้นยาก"** (เกณฑ์เดียวกับ effort high ท้ายข้อนี้ — IPO <1 ปี/spinoff/split/cyclical/pre-profit/ราคา cross-source ต่าง >5%) ส่ง `model:"opus"` เฉพาะตัวนั้นใน `stocks[]` (แก้กติกาเดิม "Sonnet ทุกชั้น" 9 ส.ค. 69 — `analyze-wave` รองรับ escalate รายตัวอยู่แล้ว) · ★★ **บังคับ pin `model` ทุก `analyze-wave`/`Agent` call เสมอ ("sonnet" หรือ "opus" ตามที่ตั้งใจ) — ห้ามพึ่ง env var** เพราะ `CLAUDE_CODE_SUBAGENT_MODEL` **ตั้งผ่าน `settings.json` ไม่ได้** (harness กรองตัวแปรนี้ทิ้งเป็นการเฉพาะ ทั้งชั้น project และ local — วัดแบบ controlled 8 ส.ค. 69: ตัวแปรอื่นใน `env` block เดียวกันติดหมด ตัวนี้ตัวเดียวหาย) ⇒ default ที่ไม่ pin **ไม่แน่นอน** (วัดจริง 8 ส.ค. 69 = Opus 5 · 11 ก.ย. 69 = Sonnet 5 — ผลต่างกันคนละวัน · เส้นทาง `analyze-wave` ไม่ส่ง `model` = Sonnet 5 วัด 12 ก.ย. 69 แต่เป็นเพราะ script pin `'sonnet'` เองที่ `analyze-wave.js:20` ไม่ใช่ default harness ⇒ ทางนี้แน่นอน ทาง Agent tool ไม่แน่นอน) ⇒ ผิดกติกาเพราะ "ไม่รู้ว่าได้อะไร" (ค่าใช้จ่าย + ป้าย `ai-model` ไม่ตรงแผน) ไม่ใช่เพราะ Opus ต้องห้าม · **เช็คก่อนเริ่มเวฟด้วย probe subagent จริง** (spawn ไม่ใส่ `model` แล้วให้ตอบบรรทัด "You are powered by the model named …") — `echo $CLAUDE_CODE_SUBAGENT_MODEL` **ใช้ไม่ได้** มันเห็นแค่ env ของ Bash ไม่ใช่ของ spawner · ป้าย `ai-model` ในรายงานต้องตรงกับโมเดลที่รันจริง → controller spot-check ทุกใบ · หุ้นยาก (IPO <1 ปี/spinoff/split/cyclical/pre-profit/ราคา cross-source ต่าง >5%) → worker effort **high** + ปรึกษา `advisor` **ผ่าน courier subagent เท่านั้น** ก่อน spawn แล้วฝังแนวทางลง prompt (**worker เรียกตรง = ห้ามเชิงนโยบาย** ไม่ใช่ "ทำไม่ได้" — แก้ข้อความเดิมที่เขียนว่า "unavailable เสมอ" ซึ่งพิสูจน์แล้วว่าไม่จริง 9 ก.ย. 69: worker DASH เรียกตรงแล้วสำเร็จ · วิธี/เหตุผล `docs/orchestration.md` §2 · courier ล้มเหลว → หยุดถาม user) · ตัดสิน publish/skip กำกวม → advisor ก่อน (เรียกตรง · courier เมื่อ context ใหญ่จน unavailable) ยังกำกวม → หยุด ping user

*ข้อความนี้ ณ 21 ก.ย. 69 — กฎปัจจุบันดูที่ skill `stock-controller` §3.2 (`CLAUDE.md` §3.2 = สรุป)*

---

## §3.3 โหมดขนาน

### rate limit เคยพังจริงที่เวฟไหน

> ขนานมาก = เสี่ยง rate limit ทั้งชุด (เคยพังจริง US-GAP W19–W21) → ramp ขึ้นทีละขั้น เจอ rate limit ให้หาร N ครึ่ง

### lock มาจากไหน (ระยะ 0 audit)

> สีแบรนด์/price-flags/tags มี lock แล้ว — `tools/lockfile.js` ระยะ 0 audit — worker รัน pick-brand เองได้

---

## §3.4 โหมดทีละตัว (push รายตัว)

### ยกเลิกเพดานจำนวนหุ้นต่อเวฟ

> จำนวนหุ้นต่อรอบไม่จำกัด (ยกเลิกเวฟละ ≤3 — 12 ก.ค. 69)

---

## §4 Token discipline

### ยกเลิกการหั่นงานเป็น chunk/session

> **รันยาวได้ ไม่ต้องหยุดรอ user เปิด session ใหม่** (ยกเลิก chunk/session — 13 ก.ค. 69, auto-compact จัดการเอง)

---

## §7 ข้อห้าม / ข้อควรระวัง

### ทำไม "worker ห้ามเรียก advisor ตรง" ต้องเขียนกำกับใน prompt ทุกใบ

> เพราะ harness **ไม่ได้บล็อกให้** (9 ก.ย. 69: worker DASH เรียกตรงสำเร็จทั้งที่กติกาห้าม)

### ผลวัด default model ที่ไม่ pin

> (default ไม่แน่นอน — วัด 8 ส.ค. 69 = Opus · 11 ก.ย. 69 = Sonnet)

---
- **ปีวันที่ในรายงานเอง = พ.ศ. ทั้งเว็บ (เจ้าของยืนยัน 22 ก.ย. 69 หลังดูภาพรวม)**: เก็บภายในเป็น ISO ค.ศ. ทุกที่ (`PRICE_DATE_ISO`, report-data, cron, SEC) · แสดง footer "ข้อมูล ณ" + `values.dateEra` เป็น พ.ศ. (`BE`) ทั้งหุ้นไทยและ US · parser ทุกตัวรับทั้งสองศักราช (≥2400 = พ.ศ.) ⇒ เรื่องปีเป็นการแสดงผลล้วน · census ก่อนแก้: พ.ศ. 768 / ค.ศ. 140 (US 106/670 = 15.8% · TH 34/238 = 14.3% — รั่วอัตราเท่ากันสองตลาด = ไม่ใช่ธรรมเนียมของตลาด) · **ต้นเหตุ 2 ข้อ**: (1) `_template/agent-prompt.md` ไม่มีบรรทัดเรื่องปี (worker เห็นแค่ใน SKILL.md บรรทัดเดียว) (2) สคริปต์ `post-wave.js` ของแคมเปญส่ง `ship --force` เมื่อ postcheck ฟ้องเฉพาะเรื่องศักราช (class `ship-force-era` · อยู่ใน `.queue/` ที่ไม่ commit — ไม่มีโค้ดรีโปให้แก้) · **แก้**: กวาด 165 ใบ (footer + `dateEra` CE→BE; ใบ v1 5 ใบแก้วันที่ของวันวิเคราะห์เดียวกันด้วย) + เติมบรรทัดใน agent-prompt · `check-reports` ก่อน/หลังเหมือนกันทุกบรรทัด · `reports.json` `updated`/`hash` เปลี่ยน 165 รายการ (หน้าแรกดัน 165 ใบขึ้นบนครั้งเดียว — ทั้ง 908 ใบวิเคราะห์ใหม่ 21 ก.ย. อยู่แล้ว) · **ที่ยังเหลือ (fix-on-touch)**: prose อื่นที่เขียนวันวิเคราะห์เป็น ค.ศ. (เช่น "ราคาปิด 21 ก.ย. 2026") อีก ~26 ใบ

## §8 Quality gate

### RULE-TENSION-001 — single-family FV (เจ้าของตัดสิน 22 ก.ย. 69)
E17 บังคับ ≥2 การ์ด `.vmethod` แต่บางหุ้นวัดได้จริงแค่ตระกูลเดียว (ไม่มีขายึดตลาดเลย) — ตัวอย่างที่พบ: `GULF` (ก่อนแก้), `COCOCO`, `PDYN`, `VLTO` ทั้งหมดโชว์ 2 การ์ดตระกูลเดียวกันเพื่อผ่าน gate เจ้าของเสนอ 2 ทาง: (A) ปิดโดยไม่แก้โค้ด ถ้าเนื้อหาที่มีอยู่ตรงเจตนารมณ์แล้ว หรือ (B) แก้ E17 ให้รับ 1 การ์ด + บล็อกความไวแบบมีโครงสร้าง — เจ้าของเลือก **(A)**
- ตรวจ `COCOCO`/`PDYN`/`VLTO` แล้วพบว่าทั้ง 3 ใบเขียน "ตระกูลเดียวกัน นับเป็นหนึ่งเสียง" ใน mdesc อยู่แล้ว (เงื่อนไข (1)/(2) ผ่านครบทั้ง 3 ใบ) → สาระตรงกฎ 0.4c-bis ทุกประการ ต่างแค่หน้าตา UI (การ์ด 2 ใบ vs 1 ใบ+บริบท) ไม่ใช่ความถูกต้องของตัวเลข ⇒ **ไม่ต้องแก้โค้ด** — เงื่อนไข (3) บรรทัดความไว: `VLTO` มีอยู่แล้วแบบสองด้าน (กรณีฐาน/ระมัดระวัง) · `PDYN` ตอนตรวจมีแค่ด้านลง เติมด้านบนแล้วครบสองด้าน (commit `9043242d`) · **`COCOCO` ยังไม่ผ่าน (3) เต็มรูป** — บรรทัดความไวที่มีชี้ทางขึ้นอย่างเดียว (ROE/payout/g สูงขึ้น) ไม่มีด้านลง ไม่ใช้เป็นเคสอ้างอิงจนกว่าจะเติมด้านลง (ไม่กระทบคำตัดสิน (A) เพราะเป็นเรื่องคุณภาพบรรทัดความไว ไม่ใช่เรื่อง single-family)
- แก้เอกสาร: เติมข้อยกเว้นใน `docs/quality-gate.md` §0.4 บรรทัด "2 วิธีต้องอิสระจริง" + กฎละเอียดใน `.claude/skills/stock-analyzer/SKILL.md` STEP 3 (เงื่อนไข 3 ข้อ: นับ 1 เสียง + full-disclosure + **บรรทัดความไวเสมอ** ไม่ใช่แค่เมื่อ r−g แคบ)
- **GULF ไม่ใช้ข้อยกเว้นนี้** — ควบรวมกับ INTUCH ทำให้ P/E ย้อนหลังวัดจริงไม่ได้เชิงโครงสร้าง (ไม่ใช่แค่ "ตระกูลเดียว") และ |MOS| เกิน 40% ต้องมีพยานที่ไม่ใช่ (r,g) ตามกฎเดิม → แก้ด้วย **SOTP** (มูลค่าหุ้น ADVANC ตามราคาตลาด + ธุรกิจไฟฟ้าเทียบ peer P/E) แทน รายละเอียด → memory `campaign-full-rerun-2026-09`
- **ข้อยกเว้นนี้ไม่ใช่ทางเลี่ยงกฎ `|MOS| > 40%` ในข้อถัดไป** — ย้ำไว้ทั้งใน SKILL และ quality-gate.md กันตีความผิดในอนาคต

### ที่มาของการเอา `self-test` / `docs-test` เข้า gate

> `self-test` เข้า gate แล้ว (12 ส.ค. 69) — เดิมเป็น meta-test ที่ต้องรันมือ ⇒ ถ้า check ใน `check-reports` เสียจนไม่ยิงอีก gate จะรายงาน "error 0" แยกไม่ออกจาก "สะอาดจริง" (0.24 วิ ไม่กระทบเวลา) · `docs-test` เข้า gate (ระยะ 1 — ตัวเลข/ตารางใน docs generate จาก `tools/gen-docs.js` แก้มือแล้ว verify ตก)

### ผลตอบแทนฉาก 3 ปี — W17 เงียบกี่ใบตอนเพิ่มกฎ

> W17 + `patchDerived` ดูแลให้อัตโนมัติแล้ว แต่ **เงียบเมื่อสามคอลัมน์ไม่สอดคล้องกันเอง** (84 ใบ ณ 20 ส.ค. 69)

### ทำไมห้ามเชื่อคำว่า "รวมปันผล" ใน hint

> (skeleton พิมพ์ติดมาทุกใบ ⇒ RGLD มีคำนั้นแต่ตัวเลขไม่รวมปันผล)

### สมอตายวนกลับ (ชั้น 0.4e · W18) — วันที่เพิ่ม + เคสที่จับได้

> ★ **สมอตายวนกลับ (ชั้น 0.4e · `W18` — เพิ่ม 9 ก.ย. 69)**

> (ODFL ห่างราคา 0.1% ขณะ gate ผ่าน 43/43)

---

## §9 Price refresh (cron) + คิว

### ข้อความเดิมของบรรทัดแรก §9 (ก่อนแตกเป็นรายการ) — เก็บคำต่อคำ

กฎฉบับใช้งานอยู่ที่ skill `stock-controller` §9 (`CLAUDE.md` §9 = สรุป) (cron patch อะไร / ไม่แตะอะไร / freeze เมื่อไหร่) · ย่อหน้านี้เก็บ **วันที่ที่เริ่มแตะแต่ละอย่าง · เลข open-item · ระยะของ audit · สถิติ ณ วันนั้น** ที่ถอดออกไป

> GitHub Actions รัน `tools/update-prices.js` ทุกวัน config ตั้ง 21:00 UTC (= 04:00 น. ไทยวันถัดไป — เดิม 07:17 น. ไทย ก่อนแก้ open-item #33 15 ก.ย. 69 เพราะ skew จริงของ GitHub วัดได้ 4.3–4.6 ชม. ทำให้รันจริงตกกลางช่วง SET เปิดตลาด · 21:00 UTC เป็นเวลาที่เร็วที่สุดที่ยังหลัง US close ทั้งฤดู EDT/EST จึงเหลือ margin ฝั่ง SET มากที่สุด — **ห้ามขยับ** · skew ไม่คงที่ เคยแตะ 5.59–6.35 ชม. ⇒ ไม่มี config ใดปลอดภัย 100% → รายละเอียด/ตัวเลขเต็ม `docs/price-refresh.md`) — patch **เฉพาะตัวเลขโครงสร้าง** (**ไม่แตะ prose/EPS/FV** · วันที่วิเคราะห์คงเดิมผ่าน preserve-dates · **ตั้งแต่ 17 ส.ค. 69 รวมถึง "ตัวเลข" ในช่องสรุปส่วนต่างจากราคา + `class` ของกล่อง verdict** — สองอย่างนี้เป็นค่าที่ derive จาก MOS ล้วน ๆ จึงไม่นับเป็น prose · ตั้งแต่ระยะ 1 ข้อ D (12 ก.ย. 2569) cron เขียนช่องสรุปทั้งช่องเป็นคลังคำคงที่ `MOS ~ ±X%` ตรงกับ `.big` (`summaryPlan` = healer #11) — คำว่าถูก/แพงอยู่ใน `.txt` ของ verdict ซึ่งเป็น prose ⇒ W06 ที่ยังยิงหลัง cron = healer กับ checker ไม่สมมาตร ต้องแก้โค้ด ไม่ใช่แก้ใบ · ใบที่ worker เพิ่งเขียน (NEW/UPDATE) อาจยิง W06 จนกว่า cron รอบถัดไปจะซ่อม — ไม่ใช่บั๊กโค้ด · **ตั้งแต่ 20 ส.ค. 69 รวมถึงผลตอบแทนฉาก Bear/Base/Bull ในหมวด 6 + ป้าย "จากจุดเข้า"** (`scenarioPlan` — ราคาเป้าไม่ถูกแตะเพราะเป็นสมมติฐาน · รักษาฐาน "รวมปันผล" และสูตร %/ปี ของใบนั้นไว้ · ตัดสินไม่ได้ = ไม่แตะ ตรงกับที่ W17 เงียบเป๊ะ ๆ) · **ตั้งแต่ 11 ก.ย. 69 รวมถึงปันผล % ในการ์ด + `stock-meta.dividendYield` + P/BV** (`yieldPlan`/`pbvPlan` — ตัวหาร DPS/BVPS ที่บรรทัด `.d` พิมพ์เอง · ตัดสินไม่ได้ (DPS รายไตรมาส/พิเศษ/ตามแผน/ผลบวกหลายงวด/ยอดรวม/สกุลอื่น/พิมพ์หลักเดียว/หลุดย่าน 0.6–1.67) = ไม่แตะ · W19/W20 (ยกเป็น error ระยะ 1 · 12 ก.ย. 2569)) · **ตั้งแต่ 19 ส.ค. 69 รวมถึง P/E ที่โชว์ในการ์ด + `stock-meta.pe` + % ในการ์ดราคาเป้า + Market Cap + P/S** (`patchDerived` — ตัวตั้งคือราคาที่เพิ่ง patch ตัวหาร/ตัวลบคือ EPS/ราคาเป้าที่รายงานพิมพ์เอง จึงไม่มีอะไรให้ cron เดา · ก่อนหน้านี้ไม่มีใครแตะ ⇒ ค้าง 233/908 ใบ (P/E) และ 544/908 ใบ (Market Cap) โดย gate มองไม่เห็น — E41/E42/E43 บังคับแล้ว · P/S อ้างข้ามการ์ด — W16 (ยกเป็น error ระยะ 1 · 12 ก.ย. 2569) · **% ของราคาเป้าใน prose ยังไม่แตะ** = W15 เตือนให้คนแก้ หรือ `--heal-derived --prose`)) แล้ว verify + push เอง · freeze ลง `price-flags.json` เมื่อ: ต่าง >15% / MOS พลิกเกิน dead-band ±5 จุด (ระยะ 1 ข้อ D — flip ในย่านไม่ส่ง LLM · ช่องสรุป cron เขียนเอง) / สงสัย split (flip ใน ±5 จุด = patch ผ่าน · หลุดขอบ gauge = ขยายขอบเอง) / **patch แล้ว gate ตก (`patch-rejected` — กักกันรายไฟล์ ไม่ล้มทั้งวัน · ระยะ 0 audit)**

*ข้อความนี้ ณ 21 ก.ย. 69 — กฎปัจจุบันดูที่ skill `stock-controller` §9 (`CLAUDE.md` §9 = สรุป)*

### ใบ v2 — สัดส่วนที่ migrate แล้วและการขยาย V2TOKENS

> (884/908 ใบ · ระยะ 3 กวาด residue เพิ่มจาก 865 · ดู open-items #36)

> (7 ช่องนี้ต้องเป็น token เสมอ — pseudo-error `V2TOKENS` บังคับ · ยิง 0/908 · **ระยะ 3 Task 12 ขยายเป็น 13 ช่อง** โดยเพิ่มช่องที่ผูก **FV**: `.fv-box .r` · `legend` · `#mFair` · การ์ด "จุดซื้อ MOS 20/30%" · `vcell` "มูลค่าเหมาะสม" — เกณฑ์เดียวกัน คือ cron ไม่มีตัวเขียนให้ · `summary` ยังอยู่นอกรายการเพราะมี `summaryPlan` เขียนให้ — open-items #44)

### `mos-sign-flip` ปิดจบที่ PREPATCH — มาจากระยะไหน

> **`mos-sign-flip` = bucket PREPATCH จบตรงนี้ ไม่ spawn worker — ระยะ 1 ข้อ D**

### canary หุ้นตาย — วันที่เพิ่ม · เคส · อัตรา false positive

> **canary หุ้นตาย (เพิ่ม 8 ส.ค. 2569)** — Yahoo ไม่ 404 เวลาหุ้นถูกเพิกถอน มัน serve ราคาค้าง ⇒ drift 0% ⇒ cron ไม่เคยจับได้ (เคส EA/BPP) · ปิดจุดบอดด้วย flag `not-on-exchange` แบบ **2 ชั้น**: quote ค้าง ≥3 session (pre-filter รายวัน) **และ** TradingView ไม่พบ ticker — ห้ามใช้ชั้นแรกเดี่ยว ๆ (วัดแล้ว: `regularMarketTime` ค้างที่ "วันซื้อขายล่าสุด" ⇒ หุ้นสภาพคล่องต่ำโดน false positive 99/248 วัน) · เสริมด้วย full sweep รายสัปดาห์ `.github/workflows/dead-ticker-canary.yml` · เป็น **ตัวชี้ให้ไปดู ไม่ใช่คำตัดสิน** — ยืนยันแหล่งปฐมภูมิ (SEC Form 25 / ประกาศตลาด) ก่อนลบเสมอ

### ตลาดยังเปิด = ข้าม — วันที่เพิ่ม

> (เพิ่ม 11 ส.ค. 2569 · `isIntradayQuote`)

---

### กฎ LIGHT/FULL ใหม่ — "มีงบใหม่หลัง footer ไหม" (เจ้าของตัดสิน 22 ก.ย. 69 · W11)

> **LIGHT ⇔ ไม่มีงบไตรมาส/ปีที่ประกาศหลังวันที่ footer "ข้อมูล ณ" ของใบเดิม** · FULL ถ้า: มีงบใหม่หลัง footer · ราคาขยับ >30% (เจตนาของเจ้าของ = เทียบวันก่อน · ที่วัดได้จริง = `diffPct` เทียบราคาที่เก็บในรายงาน ดูข้อ "ตัวชี้วัดการขยับ" ข้างล่าง) · split · ปันผลถูกตัด · not-on-exchange · **วันงบไม่ทราบ = FULL** · ขยับ 15–30% ไม่มีงบใหม่ = LIGHT (ทาง `drift-gt-15pct`)

- **แทนที่**: EPS screen ±2% เทียบ vendor (prep.js ยกเป็น UPDATE) — เหตุผล: เทียบคนละฐาน (ใบใช้ EPS adj./ฐาน FV · vendor ใช้ GAAP TTM diluted) จึงยกระดับเท็จบ่อยทั้งที่ไม่มีงบใหม่ · ตอนนี้เป็นคำเตือนที่แสดงทั้งสองฐาน ไม่เปลี่ยนโหมด · reason `earnings-after-analysis`/flip ที่ "งบออกหลังวิเคราะห์" เดิมยกไป LIGHT — **กลับด้าน**: มีงบใหม่ = FULL
- **แหล่งวันงบ** (`tools/earnings-calendar.js` `statementAfter`): ปฏิทิน Yahoo `last` (ครอบคลุม ~79% = 719/908 ตาม open-items #24/#29 · `last` เป็น null ทั้งไฟล์ในรอบแรกจนกว่าจะสะสม) → **TH** เส้นตายส่งงบ SET ตก (footer, วันนี้] = มีงบใหม่ (ไตรมาส 45 วันหลังสิ้นไตรมาส · ปี 60 วันหลังสิ้นปี — ตรวจกับ set.or.th 22 ก.ย. 69: ไตรมาส 45 วัน · ปี "2 เดือน" (ไม่มีงบ Q4) หรือ "3 เดือน" (มีงบ Q4) · ยังไม่สอบทาน 30 วัน — เลือก 45/60 = เส้นตายที่เร็วกว่า ผิดทางปลอดภัย) → **US** SEC submissions (10-K/10-Q/20-F/40-F ต้นฉบับ · `curl -A`) เฉพาะแถวในคิว/prep ที่ปฏิทินไม่มี `last` → ไม่ทราบ (`stmt=null`): **แถว PREPATCH (flip) คง PREPATCH** + บันทึก `statement-unknown` (ห้ามยกแถวที่ไม่ส่ง worker เป็น worker เพราะ "ไม่รู้") · **แถว LIGHT/FULL (drift-gt-15pct · suspect-split-or-data · age-gt-90d) = FULL** · ชนิดของ unknown บันทึกใน `stmtWhy`/`stmtKind`: `fetch-failed` (curl/SEC ล้ม) · `no-cik` · `6k-only` · `no-statement-forms` · `footer-unreadable` · `no-source` (ไม่ได้ใช้ SEC) · preflight พิมพ์ `⚠ statement unknown: N (fetch-failed M)` ทุกครั้งที่ N>0 กันวันยกระดับเป็นกลุ่มโดยเงียบ
- **SEC fallback: UA (พบตอนตรวจสดหลัง merge รอบสอง · แก้ 22 ก.ย. หลัง merge — ไม่ต้องตั้ง env ตอนถามวันงบ)**: env `SEC_USER_AGENT` (ชื่อ + ช่องทางติดต่อ ที่**เจ้าของกำหนด** — ห้าม commit ค่านี้): `www.sec.gov/files/company_tickers.json` ตอบ 403 กับ UA ที่ไม่ประกาศตัวตน (Mozilla/5.0 เปล่า ๆ ก็ 403 — SEC fair-access policy) ส่วน `data.sec.gov` (submissions) รับ UA อะไรก็ได้ · ตัวเลือกที่ใช้: `tools/sec-ciks.json` (ticker→CIK ของหุ้น US ที่มีรายงาน · สร้างด้วย `node tools/earnings-calendar.js --sec-refresh-ciks` ต้องมี `SEC_USER_AGENT` (ใช้เฉพาะขั้นนี้) · ดึงล้ม = ไม่แตะไฟล์เดิม) ถ้ามีไฟล์นี้ = ไม่ขอแผนที่จาก www.sec.gov และดึง submissions ด้วย UA สำรองได้ · **ไม่มีทั้ง env และไฟล์ = kind `no-ua`** (ปิด SEC fallback — ไม่ลองยิงให้โดน 403) ซึ่งปฏิบัติเหมือน unknown อื่น: flip คง PREPATCH · แถว worker (drift/suspect-split/age) = FULL ⇒ (เกิดเฉพาะเมื่อไฟล์แผนที่หาย — ปัจจุบัน commit แล้ว ครอบคลุม 667/670 ใบ USD · probe จริงโดยไม่ตั้ง env ได้ ok/fpi) (ยกเว้นหุ้นที่ปฏิทิน Yahoo รู้ `last`) · รัน `node tools/earnings-calendar.js --sec-refresh-ciks` (ต้องตั้ง SEC_USER_AGENT) เมื่อเพิ่มรายงาน US ใหม่ — แผนที่ที่เก่าจะให้ `no-cik` = FULL (ทิศปลอดภัย) · ผู้ยื่นที่มีแต่ 20-F/40-F (FPI เช่น TSM) รายงานงบไตรมาสทาง 6-K ซึ่งเรายังไม่นับ ⇒ วันงบล่าสุดไม่ทราบ (kind `fpi`) ⇒ FULL จนกว่าจะรองรับ 6-K — ข้อจำกัดที่ยอมรับ แพงกว่าแต่ปลอดภัย · **แถว TH ไม่ได้รับผลกระทบ** (ใช้เส้นตาย SET) · ตรวจสดด้วย `node tools/earnings-calendar.js --sec-probe AAPL TSM` (พิมพ์ CIK · งบล่าสุด · kind ok|fpi|6k-only|no-cik|fetch-failed|no-ua) · preflight สรุป `⚠ statement unknown: N (fetch-failed M · no-ua K)`
- **ตัวชี้วัดการขยับ (`diffPct`)**: เทียบกับราคาที่เก็บ**ในรายงาน** (= ราคาที่ cron patch ครั้งล่าสุด) — ในภาวะปกติคือราคาปิดเมื่อวาน · สะสมเกินหนึ่งวันเฉพาะแถวที่ถูก freeze ค้างหลายวัน และการสะสมผิดทางปลอดภัย (FULL เกินจริง ไม่ใช่ขาด) · `price-flags.json` บันทึกค่านี้อยู่แล้ว (signed %, ทศนิยม 1 ตำแหน่ง) จึงไม่แตะ cron
- **ช่องโหว่ที่รู้ (ยอมรับ)**: 8-K/guidance/M&A ไม่นับเป็น "งบ" · TH ที่ยื่นก่อนเส้นตายและ footer อยู่ระหว่างวันยื่นกับเส้นตายจะถูกมองว่าไม่มีงบใหม่ · 6-K ของ FPI ไม่นับ · split อัตราเล็ก (~20–25% เช่น 5:4) ผ่านเป็น LIGHT ได้ — กฎเดิมก็มองไม่เห็นเช่นกัน (ไม่ใช่ regression) · และ "ปันผลถูกตัด" ตรวจอัตโนมัติไม่ได้ — ต้องคนดู · not-on-exchange ยังเป็น DELIST (ไม่ re-analyze) ไม่ใช่ FULL
- **cron ไม่เปลี่ยน** (`SUSPECT_FREEZE` 0.25 / `DRIFT_FREEZE` 0.15) — flag บันทึก `diffPct` (signed %, ทศนิยม 1 ตำแหน่ง) อยู่แล้ว triage ตัดสินจากค่านี้ · A/B: `--light-rule legacy` (ลงทะเบียนใน `tools/queue/args.js` — ใช้ได้ทั้ง `--light-rule legacy` และ `--light-rule=legacy` ก่อนหรือหลัง symbol · `ship` รับแต่ไม่ใช้) หรือ env `LIGHT_RULE=legacy` คืนกฎเดิม 1 release · ค่า flag ชนะ env

## §10 Template system + counters

### สีแบรนด์: ก่อนมี lock เคยชนกันเงียบ ๆ (ข้อความเดิมทั้งข้อ)

> `tools/pick-brand.js` อ่าน→ตรวจชน→เขียน `seeds.json` ใต้ lock (`tools/lockfile.js` · ระยะ 0 audit ก.ย. 69) — worker ขนานรันเองได้ตาม SKILL 5A · เดิม (ก่อน lock) 2 ตัวขนาน = สีเดียวกันโดย gate จับไม่ได้ จึงเคยบังคับให้ controller pre-assign — กฎนั้นยกเลิก

### GUI brand-forward — ยุคที่ทำ + คำสั่งเจ้าของเรื่อง typeface + สถิติ contrast

> **GUI brand-forward (ส.ค. 69)** — ระบบดีไซน์ทั้งหมด → **`DESIGN.md`**

> (เจ้าของสั่งถอด Kanit กลับ 12 ส.ค. 69 — ห้ามเปลี่ยน typeface โดยไม่ถาม)

> (386/908 ธีมตก AA)

### ทำไม controller ยังเป็นคนเขียน `tags.json` ทั้งที่ tag-apply มี lock แล้ว

> (เหตุผลเดิมคือ race — ตอนนี้ tag-apply เขียนใต้ lock แล้ว แต่ยังให้ controller เป็นคนเขียนเพื่อให้ทบทวน tag ทุกครั้งก่อนลง tags.json — worker คืนบรรทัด `TAGS:` แทน)

### ขนาดคลังตอนเขียนกฎ "ห้ามเขียน tag ลงไฟล์รายงาน" (CLAUDE.md เปลี่ยนเป็น "ทุกไฟล์" กันเลขล้าสมัย)

> (freshHash จะทำให้ `updated` ของทั้ง 908 ไฟล์เด้งพร้อมกัน → พังการเรียงหน้าแรก + dedup 7 วัน + staleness)

### Report v3 (JSON-source) Plan 1 — คำตัดสินระหว่างทำ (24 ก.ย. 69)

> spec `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` · plan `docs/superpowers/plans/2026-09-24-report-v3-plan1-core-render.md` · branch `feat/report-v3-plan1` · ของค้างที่ Plan 2 ต้องทำ → `docs/open-items.md` #49–#54

- **ปันผล % = ทศนิยม 2 ตำแหน่งทั้งเว็บ (เจ้าของตัดสิน 24 ก.ย. 69)** — `tools/report-values.js` `TOKENS.yield` เปลี่ยน `toFixed(1)` → `toFixed(2)` · หลักฐาน: การ์ดปันผลที่พิมพ์มือในคลัง 572 ใบเป็น 2 ตำแหน่งอยู่แล้ว vs 1 ตำแหน่งแค่ 35 ใบ ⇒ ทำให้ token ตรงเสียงข้างมาก · ผลกระทบ: 113 หน้าที่ใช้ `{{rd:yield}}` ได้ทศนิยมเพิ่ม (เช่น 3.0% → 2.97%) · cron รอบถัดไปจะเขียน `stock-meta.dividendYield` ใหม่ ~81 ไฟล์ **ครั้งเดียว** (อยู่นอก freshHash ⇒ `updated`/การเรียงหน้าแรก/dedup 7 วันไม่เด้ง) · 35 ใบ 1 ตำแหน่งที่พิมพ์มือไม่แตะ — ทำให้เป็นมาตรฐานตอน migrate v3 (open-items #54) · เทสที่ปรับตาม: `test/report-values-test.js` (6.4% → 6.38%) + `test/update-prices-test.js` N3(c) เปลี่ยนเป็นเช็ค end-to-end ด้วยฐาน DPS ที่ต่างกันจริง (BBL การ์ด ฿13 vs `values.dps` 12) แทนการพึ่งความต่างของการปัด
- **รูปแบบการ์ด = ตัวเลือก B: มาตรฐานเดียวทั้งเว็บ (เจ้าของตัดสิน 24 ก.ย. 69 หลังดู ZTS ของจริงที่ render จาก v3)** — การ์ดตัวชี้วัดใช้ formatter กลางชุดเดียว (`tools/v3/cards.js`) ไม่เลียนรูปแบบพิมพ์มือรายใบ · หลักฐาน = การเทียบ v2↔v3 ของ ZTS จริง (`docs/superpowers/specs/2026-09-24-zts-v3-compare.md`) · ยกเว้น 5 ข้อที่เจ้าของสั่งแก้ template (yield 2 ตำแหน่ง · ชื่อย่อหุ้นใน `<h1>` · ฐาน EPS ใน mdesc · เครื่องหมายลบ `−` · ZTS-real เข้า gate loop)
- **`meta.themeLegacy` เก็บ palette เดิมของใบที่มีอยู่** — palette ของใบเก่าเป็น**ข้อมูล ไม่ใช่ค่าที่ derive ได้**: 682 ใบที่ไม่มี seed ใน `tools/seeds.json` หา seed ย้อน (grid-search) ได้ accent ตรง ≤12 แค่ 210 ใบ และตรงครบ 8 คีย์แค่ **17/682** · re-derive = เปลี่ยนสี ~700 หน้า = งานดีไซน์ ไม่ใช่ migration ⇒ ใบ migrate เก็บ `themeLegacy` · ใบ NEW ใช้ seed (spec §3.5)
- **`divCum` เป็นข้อมูลประกอบได้แม้ `divIncluded=false`** — v2 141 ใบ render `{{rd:scNdiv}}` ทั้งที่ `scnBasis.divIncluded=false` ⇒ schema v3 รับ `divCum` ต่อฉากเสมอ (แสดง/ใช้เป็น token ได้) แต่**ไม่รวมใน total%** เมื่อ `divIncluded=false`
- **ชื่อฟิลด์ `region` (US/TH) ไม่ใช่ `market`** — `market` คือบล็อกราคาที่ cron เป็นเจ้าของ (`market.px`/`priceDate`/`chart`) ⇒ ตลาดของหุ้นใช้ชื่อ `region` กันชนความหมาย
- **RI `payout` ใช้หน่วยเปอร์เซ็นต์ (0–100)** — ตามกติการ่วม "input ที่เป็น % ใส่หน่วย %" (`tools/v3/legs.js` ผ่าน `pct()` · `tools/v3/schema.js` ช่วง 0–100) · ยังไม่มีใบ RI จริงใน v3 ⇒ ไม่มีต้นทุนย้อนหลัง · และ RI ใช้ `r, years, payout` ตาม plan (spec §3.1 เดิมเขียน "fade" ที่ไม่เคยนิยาม)
- **implementer/reviewer subagent ของงาน v3 = Opus (เจ้าของสั่ง 24 ก.ย. 69)** — ทับ ruling เดิมที่ให้ reviewer ส่วนใหญ่เป็น Sonnet · ขอบเขต = งานพัฒนาระบบ v3 เท่านั้น ไม่เปลี่ยนกติกาโมเดลของ worker วิเคราะห์หุ้น (CLAUDE.md §3.2)

### Report v3 Plan 2a — schema extension + check-v3 (24 ก.ย. 69)

> spec §3.6/§4/§9/§12/§13 · plan `docs/superpowers/plans/2026-09-24-report-v3-plan2a-schema-gate.md` · branch `feat/report-v3-plan2` · ledger 23 rulings (SDD workspace) · เจ้าของมอบอำนาจอนุมัติแผน/merge ให้ advisor (24 ก.ย. 69)

- **Task 0 ก่อนเขียนโค้ด (advisor)** — แปลงมือใบจริง 3 รูปทรงยาก (BBL ธนาคาร · EQIX REIT ขา P/AFFO บริบท · FER SOTP+ตาราง inline-style) ก่อนเขียน Plan 2 → พบ 18 gap ทั้ง 3 ใบชนเพดาน custom 4 การ์ด ⇒ spec §3.6 ฟิลด์ optional A–O · เกณฑ์จบ §12 = -real ทุกใบ custom ≤2 · ไม่มี declared ที่มี method · FV เดิม · v2 gate 0/0 · check-v3 0 error (W31 ไม่นับ = ตัววัด literal ค้าง #57).
- **กติกา B วัดจริง (Task 0)** — คำกล่าวอ้าง "false positive ~0" ผิด (error บน prose ถูกต้อง BBL 2 · EQIX 2 · FER 0 + warn 11 ที่ base) → กฎใหม่ §4: error เฉพาะรูป render เป๊ะรวมทศนิยม · เลขจำนวนเต็มไม่ error · เงินมีหน่วย M/B/ล้าน ข้าม · `{{lit:}}`+`meta.litReasons` · lit ห้ามประกอบเป็น token/รั่ววงเล็บ.
- **advisor ถาวร 4 ข้อ** — E17 นับขา `role:'fv'` เท่านั้น (15 ใบ → ถัง HUMAN ตอน migrate) · `stock-meta.pe` = ราคา/EPS เสมอ REIT ใช้ `pffo` (5 ใบเรียง index เปลี่ยน) · ขา context ที่ `multipleSource:'current'` **คำนวณ** ไม่ใช่ declared (43 ขาจะค้างทุกวันถ้า declared) · |MOS|>40% ต้องมีขา fv ที่ไม่ใช่ตระกูล (r,g) ไม่งั้น W32.
- **Plan 2 แยก 2a/2b (advisor)** — 2a = schema+gate ผลต่อ production ศูนย์ (tripwire อยู่ · dist byte-identical 1067 ไฟล์ พิสูจน์ 3 ครั้ง Task 2/12/13) · 2b = report.js/hook/scanner→.json/ถอด tripwire ท้ายสุดใน PR เดียว · exit 2b = Opus worker เขียน NEW 2 ใบผ่าน `report.js save`.
- **fixture แก้ผ่าน `io.write` เท่านั้น (advisor)** — สคริปต์แก้ fixture ทุกตัว IO.read→IO.write ⇒ `_sig` ถูกทุกขั้น Task 12 assert แทน re-sign.
- **spec ชนะ plan text (controller)** — E52 ผูกกับ `extrasRef` ไม่ใช่ basis∈{sotp,nav} · formatter ตาราง extras ใช้สูตรปัดของ RV (ห้าม re-implement rounding) — reviewer พบ 2 ข้อนี้ในโค้ดที่ลอกจาก plan.
- **`text:null` = ไม่มี (เหมือน optional block อื่น)** · ทุก block ใหม่ null=absent · schema ปิด · `'current'` บนขา fv = schema error อ้าง W18.
- **ค่าตั้งต้น formatter/สีที่ยอมรับ** — `RV.fmtBig` ฿ พิมพ์ หมื่นล้าน/แสนล้าน อยู่แล้ว 13/11 หน้าใน dist = มาตรฐาน option B (คำถามระดับเจ้าของ #59) · `tone:'neu'` = คลาส `.neu` เดิม (เหลือง) · การ์ด `capital` pos ตายตัว (#60) · ย่อหน้า §3 ของ FER อยู่หน้าตาราง SOTP (v2 อยู่หลัง) = มาตรฐาน v3 ไม่ใช่ข้อความหาย.
- **gate ห้ามผ่านแบบว่างเปล่า (§8)** — check-v3 sweep 0 fixture หรือ EXPECT_FIXTURE หาย = exit 1 · SYM/path ไม่เจอ = exit 1 · นาฬิกา v2 passthrough แช่แข็งด้วย `STALE_TODAY` (กัน fixture แก่แล้ว verify ล้มทั้ง repo) · test พิสูจน์ด้วย mutation ไม่ใช่ assert ค่าที่เป็นศูนย์อยู่แล้ว.
- **cron รอบแรกหลัง Plan 1 (#72)** — run 35933592671: 904 ตัว · patch-rejected 1 = APURE E26 ค้างเดิม · dividendYield 1dp→2dp 120 ใบ (ประมาณ 81) → รอบถัดไปต้อง 0.

### Report v3 Plan 2b — infrastructure: report-source · scanner → .json · report.js · sidecar · gate rules · hook (24 ก.ย. 69)

> spec §6.1–§6.5/§9/§11 (P4a) · plan `docs/superpowers/plans/2026-09-24-report-v3-plan2b-infra.md` · branch `feat/report-v3-plan2b` · ผลต่อ production ศูนย์ (tripwire อยู่ · dist byte-identical พิสูจน์ Task 2/3/4/9)

- **จุดเดียวที่ตอบ "ไฟล์ไหนคือรายงาน"** — `tools/report-source.js` (`list symbols kindOf exists load metaLite stockMeta renderedHtml`) · scanner 16 จุดของ #49 ย้ายมาใช้ครบ ยกเว้น `update-prices.yml` และ `update-prices.js` main/healDerived readdir (P5 — คงตัวกรอง `.html` เดิมตาม ruling) · report-source `require('../build.js')` แบบ lazy (ใน `list`/`renderedHtml`) เพราะ `update-prices`/`dead-ticker-canary` require report-source และ build.js หนัก (โหลด v3 compute/render ทั้งชุด)
- **fail closed**: `ship --prepatch` path ใต้ `reports/` ที่ไม่ใช่ `reports/<SYM>.html` = blocker (rename `.html→.json` · ไฟล์หลง) · `update-prices` ระบุ symbol v3 ตรง ๆ = exit ≠0 "v3 cron = Plan 3" (#62) · sweep ข้ามใบ v3 แต่ไม่เงียบ — บรรทัดต่อใบ + บรรทัดสรุปจำนวนใน log ของ cron (R11 · binding ruling 2)
- **R1/R2 sidecar** — `ttm/fy/sharesOut/dps/epsForward/rating` มาจาก `fetch-fundamentals --json` (spec §6.4 aligned (advisor 24 ก.ย. 69) — fetch-facts ไม่มีงบ) · ผู้เขียน sidecar มีตัวเดียว = `npm run queue -- prep` โหมด NEW (prep-stock คงสัญญาข้อความเดิม)
- **R3/R4/R5 gate** — sentinel `TODO` = `/^\s*TODO\b/` บนทุก string leaf (ช่องตัวเลขที่ยังเป็นสตริงได้ทั้ง type error + sentinel ที่ path เดียวกัน) · `{{rd:` ที่ใดก็ได้ = error · error ต่อชั้นยังเป็น E51 **รายการเดียว** (จำนวนรายการคงเดิม) + `details` ทีละ path
- **R6 `stage:'save'`** ตัด `v2:E40` ตัวเดียว คืนใน `dropped` ให้ save พิมพ์ · stage อื่น = throw
- **R7 `report.js` ตัวเลือกเทส** (`--reports-dir --work-dir --prep-dir --seeds --today`) — เทสไม่แตะ `reports/` จริงเลย · `--today` ไม่ใช่ทางหนี staleness (verify ใช้นาฬิกาจริง)
- **R8/R9** — `npm test` ไม่มี arg ยังกวาด v2 อย่างเดียว (verify รัน check-v3 ต่อ) · มี arg = ส่งใบ v3 ไป `check-v3.runCli` · postcheck คง gate call เดียว
- **R10 hook** — "ใต้ reports/" = segment `reports` ที่โฟลเดอร์แม่มี `build.js` · `$VAR` ที่ไม่ขยาย + `reports/` = ปฏิเสธ · ช่องโหว่ที่ยอมรับ: xargs · find -exec · child process (ตั้งใจ) — `_sig`/E50 คือตัวบังคับจริง
- **R12 `metaLite`** คืน `{symbol, v3, currency, px, analysisDate, era, aiModel}` (ไม่ compute) · MOS ของ commit message มาจาก `stockMeta()` ที่ compute
- **R13 hook paste = cutover ของ Plan 2c ไม่ใช่ตอนจบ 2b** — hook ปฏิเสธ Write ทุกไฟล์ใต้ `reports/` ⇒ STEP 5A ของ v2 NEW (Write `reports/<SYM>.html`) จะถูกบล็อกทันที · 2b พิสูจน์ด้วย `claude -p --settings <ไฟล์ชั่วคราว>` (`docs/hook-setup.md`)
- **R14 `--light` allowlist ตาม spec §6.1 ตรงตัว** — ไม่รวม `meta.litReasons` (prose ที่ต้องเพิ่ม `{{lit:…}}` ใหม่ = save เต็ม)
- **คำตัดสิน controller ระหว่างทำ (ledger ของ SDD ไม่ได้ commit — เก็บที่ `.superpowers/sdd/archive/plan2b-ledger.md` ซึ่ง git-exclude · ณ 24 ก.ย. 69 มี 36 rulings + 5 carries) — ที่เปลี่ยนพฤติกรรม**:
  - **v2 NEW `prep` ช่วง 2b ยิงเน็ตเพิ่ม 2 ครั้ง (4 ครั้งถ้ามี `--brand`)** เพื่อเขียน sidecar · `--json` ตัวใดล้ม/ประกอบไม่ได้ = ⚠ บรรทัดเดียว + ไม่มี `.json` แต่ยังเขียน `.md` ตามเดิม (ดู re-ruling ข้างล่าง) · `buildSidecar` throw เมื่อ `errors.fin`/`errors.stats` หรือสกุลเงิน quote ≠ งบ · error แหล่งอื่นผ่านเป็น `sourceErrors` (นอก `market`) ให้ init พิมพ์เตือน 1 บรรทัด · prep โหมด UPDATE byte-identical เท่าเดิม
  - **re-ruling final review — prep ทางถอย (degraded path) กลับมา · fail-closed อยู่ที่ `init`**: ผลต่อ production ศูนย์เป็น Global Constraint และ NEW ทุกใบจนถึง Plan 2c เป็น NEW ของ v2 ที่ worker ไม่รัน `init` ⇒ sidecar ประกอบไม่ได้ต้องไม่ทำให้ `prep` ล้ม: `prep` ลบ `.queue/prep/<SYM>.json` เก่าตอนเริ่มใบ NEW ทุกครั้ง · ล้ม = พิมพ์ `⚠ sidecar ไม่ได้เขียน (…)` แล้วเขียน `.md` ต่อ exit เดิม · `buildSidecar` ยัง throw ตามเดิม · `init` ปฏิเสธเมื่อไม่มี sidecar (แทน "prep fail-loud" ที่ตัดสินไว้ก่อน)
  - **`exchange` normalise ที่ต้นทาง** (`fetch-facts` factsJson) จากรหัส Yahoo `exchangeName`: NMS/NGM/NCM→NASDAQ · NYQ→NYSE · SET→SET · อื่น = null → init เว้น TODO (MAI = worker ตัดสิน) — ไม่มีวันได้หัวรายงานผิด
  - **`init --force` ทับได้แค่ร่าง `.work/` ไม่ข้ามการปฏิเสธเมื่อมี `reports/<SYM>.html|.json` อยู่แล้ว** (`.json` ข้าง v2 `.html` = build พังทั้งเว็บ) · ร่าง `.work/` เขียนตรง (atomic) ไม่ผ่าน `IO.write`/ไม่เซ็น เพราะ IO.write ปฏิเสธ TODO · `init` ถือ `medians.curErr != null` = ไม่มีมัธยฐาน
  - **`show`/`diff` เอา view จาก `checkDoc`** · `show` ปฏิเสธเฉพาะเมื่อ view เป็น null — มี view + gate error = พิมพ์ ⚠ จำนวน 1 บรรทัดแล้วโชว์ token ต่อ (show = ตัวช่วยค้นระหว่างร่าง · save คือ gate)
  - **`RS.list` throw เมื่อหุ้นเดียวมีทั้ง `.html` และ `.json`** — `update-prices` main ล้มดังแทนข้าม (build พังด้วยเงื่อนไขเดียวกันอยู่แล้ว) · main/healDerived ของ `update-prices` คงตัวกรอง `readdirSync(.html)` เดิมจน P5 (คือสิ่งที่ทำให้ v2 byte-identical ไม่ใช่สำเนาใหม่) · log sweep มี token คงที่ `v3-skipped: N` ให้ grep ใน Actions
  - **prepatch: `reports/X.json` ที่ถูกลบ = รายการ deleted** (ไม่ commit · ระบุชื่อใน message — เท่ากับกรณี `.html` ถูกลบ · cron ไม่ลบไฟล์) · preflight age queue ข้ามแถว v3 (`!e.v3`) ใน 2b
  - **hook เป็นชั้น 1 advisory fail-open** — deny เมื่อ path กำกวมที่เอ่ยถึง `reports/` (ฝั่งปลอดภัย) · `cd reports/` ภายในคำสั่งเดียวไม่ถูกติดตาม = under-deny ที่ยอมรับ (`_sig`/E50 คือชั้น 2) · ผู้เขียนนอกตาราง (interpreter ผ่าน heredoc · eval · truncate/touch/`curl -o` · symlink/ตัวพิมพ์) park ไว้ ขยายตารางเมื่อ worker จริงชน · เทส `test/v3/hook.test.js` = **96 เคส** (หลังรอบแก้ review — ไม่ใช่ 77 ตามแผนเดิม)
  - **Task 5 ไม่มี DIST-PROOF แยก** (ไม่ใช่ scanner) — ครอบด้วย DIST-PROOF + verify ของ Task 9
- **ส่งต่อ Plan 2c** — B7: เอกสาร worker มีหมวด v3 NEW แยก บรรทัดหลัก = `npm test -- SYM` → `check-v3` · ไม่ regen prep 909 ไฟล์ · B8: เลือกหุ้น exit เทียบ completed-backlogs/delisted-stocks ก่อน แล้ว `queue prep` ตัวบน 2 ตัว/ตลาด (กับดัก vendor น้อยสุดชนะ) · owner paste settings snippet + พิสูจน์ใน `claude -p` process ใหม่ว่า deny ชนะ rtk hook ของ user (`docs/hook-setup.md`) · ลบ tripwire = commit สุดท้ายก่อน exit
- **ส่งต่อ Plan 3** — **P5**: `update-prices` เขียน `market.*` ของใบ v3 + `update-prices.yml` นับ `.json` + `verify:cron` รวม `check-v3` (#61/#62 · เส้นตาย merge 2c + 45 วัน) · **P6**: (1) ถอดตัวกรอง `!e.v3` ของ preflight age queue เมื่อมี flow v3 UPDATE (ตอนนี้ใบ v3 ที่เก่าจะเข้าคิว LIGHT แล้ว prep ปฏิเสธ "v3 UPDATE = Plan 3" — ดังแต่ควร route) (2) `reports/<SYM>.json` เสีย = preflight หยุด (metaLite throw — สอดคล้อง RS.list · ทบทวนถ้าเจอจริง) (3) `ship.js:237` กรอง `existsSync` ทิ้ง `.html` ที่ถูกลบ ⇒ migrate v2→v3 ผ่าน `ship <SYM>` จะเหลือ `.html` ใน HEAD (build บน origin throw) — migrator ต้อง ship การลบ `.html` + เพิ่ม `.json` ด้วยกัน · park: `npm test` ไม่มี arg บน `reports/` ที่เป็น `.json` ล้วน exit 1 "ไม่พบไฟล์" (เป็นไปไม่ได้จน corpus เป็น v3 ทั้งหมด)
- **พิสูจน์ปลายทาง (Task 9)** — ใน worktree ชั่วคราวนอก repo: sidecar fixture → `report.js init` (35 TODO) → เติมด้วยสคริปต์จาก ZTS-real → `pick-brand` → `save` (FV $94.66 · MOS +24.6%) → `tag-apply` → build → `check-v3` 0 error → `dist/ZZZQ.html` + `reports.json` · **รอบแรก save ปฏิเสธ** 3×E51 บน `legs[1].inputs` (`value`/`basis` ขาด) พร้อม path ครบในครั้งเดียวและไม่เขียนไฟล์ครึ่ง ๆ = หลักฐานว่า gate fail closed (สาเหตุ: ช่อง inputs ที่ method กำหนดไม่ใช่ sentinel สคริปต์เติม TODO จึงไม่เห็น — แก้ที่สคริปต์ในแผน ไม่ใช่ pipeline)

### Report v3 Plan 2c-i — เอกสาร worker (STEP 5V) · `ship --no-push` · ถอด tripwire (24 ก.ย. 69)

> spec §6.6 (P4b) · plan `docs/superpowers/plans/2026-09-24-report-v3-plan2c-i-docs-tripwire.md` · branch `feat/report-v3-plan2c-i` · ผลต่อ production ศูนย์ (ยังไม่มี `reports/*.json` · dist byte-identical พิสูจน์ Task 1/2)

- **แยก 2c-i / 2c-ii (advisor 24 ก.ย. 69)** — 2c-i = เอกสาร worker + โค้ดเล็ก + ถอด tripwire · ผลต่อ production ศูนย์และไม่แตะเส้น `verify:cron` ⇒ merge ได้ทันที · 2c-ii = NEW 2 ใบจริง (US `OGE` · TH `M-CHAI`) = production change แรกที่มองเห็นได้ ⇒ สิ่งที่ advisor ตรวจก่อน merge คือรายงาน 2 ใบ ไม่ใช่ diff เอกสารหลายพันบรรทัด
- **ตัวพาคำสั่ง v3 = stock-analyzer SKILL STEP 5V** — worker Read SKILL จาก worktree ตอนรัน (สด) · CLAUDE.md ที่ inject = snapshot ตอนเริ่ม session ⇒ ได้แค่บรรทัดชี้ (§1/§2/§7/§10) · prompt ที่ spawn ต้องบอกตรง ๆ ว่า §2 ที่ inject มาก่อน v3 และ STEP 5V คือกติกาที่ใช้ · prep `.md` ประกอบตอน `prep` ⇒ รัน `prep <SYM> --model opus` ใหม่หลังเอกสาร merge ก่อน spawn ทุกใบ
- **`save ✓` = gate ของ worker · `v2:E40` = ของ controller** — worker ไม่รัน `npm test -- SYM` บนใบ v3 ใหม่ (`checkDoc` ตัวเดียวกับ save แต่ปล่อย `v2:E40` ⇒ แดงเสมอจน `tag-apply`) · `report.js save` จึงจบด้วยบรรทัดคืนงาน `ต่อไป: คืนงาน controller (tag-apply → postcheck) …` แทน `ต่อไป: npm test -- SYM` เดิม (Task 2 review I3 · assertion ใน `test/v3/report-cli.test.js`)
- **ตระกูลใน 5V** — `rg` = ddm/ddm2/dcf/ri/**ทุกตัวคูณที่ `multipleSource: "justified"`** (ตาม `S.requiredFamily` — ไม่ใช่แค่ pbv · แก้ถ้อยคำ "pbv-justified" ใน commit นี้)/declared rnpv (นโยบาย spec §3.6 C — `requiredFamily` คืน null สำหรับ rnpv · `famOf` ของ `check-v3` นับขา declared ที่ไม่ติดป้ายเป็น rg) · `asset` = declared sotp/nav · **`fcfyield` ไม่ใช่ rg** (แก้ระหว่าง review — `famOf` ของ `check-v3` นับ fcfyield ที่ไม่ติดป้ายเป็น market สำหรับ W32 และ method นี้ไม่รับ input (r,g)) ⇒ declared other/fcfyield = ผู้เขียนเลือกแล้วเขียนเหตุผลใน note · เลือกผิด = W32/E51 ตอน save ไม่ใช่หน้าที่พังเงียบ
- **`ship <SYM> --no-push`** = commit เหมือน `ship <SYM>` ทุกอย่าง (pathspec · ข้อความ) แล้วหยุด — ไม่ `pull --rebase` ไม่ push ไม่ปิด issue (ทุกทาง) · flow 2c-ii = branch → PR → advisor · `ship` ธรรมดาจาก feature branch = push `HEAD:main` (อันตราย) · **ช่องว่างถ้อยคำ §5**: CLAUDE.md §5 เขียน `analyze: add <SYMBOL> stock analysis` แต่ `commitMessage()` ใช้ `analyze: add <SYM> — NEW (MOS …)` มาทุกใบ — บันทึกไว้ ไม่แก้ทั้งคู่
- **CLAUDE.md §2 bullet ใหม่ "ห้ามเขียน `reports/` ตรงทุกกรณี"** — อ่านตามตัวอักษรครอบ fallback Edit tool ของ v2 UPDATE ใน SKILL STEP 5C ด้วย · ยอมรับ เพราะ hook (เมื่อเจ้าของ paste หลัง 2c-i) บังคับแบบนั้นพอดี · ทางของ v2 ยังคือ `apply-edits` (review Task 2 minor 5)
- **ลำดับถอด tripwire** — เอกสาร → โค้ด → ถอด `test/v3/no-json-reports.test.js` = commit โครงสร้างสุดท้าย (ต้องมาก่อน commit รายงานเพราะ `ship` รัน `npm run verify` เต็มซึ่งมี v3-test) · comment บรรทัด 3 ของเทส 4 ไฟล์ (`report-source`/`scanners-verify`/`report-cli`/`scanners-cron`) เปลี่ยนเป็น "tripwire ถอดแล้ว — กติกาห้ามสร้าง `reports/*.json` ใน test ยังอยู่" · อ้างอิงใน plan 2a/2b คงไว้ (ประวัติ) · open-items #49 ปิด
- **hook snippet: เจ้าของ paste หลัง 2c-i merge — ไม่ใช่ก่อน** — paste ก่อน = บล็อก NEW v2 ที่เขียนมือทุก session บนเครื่องโดยที่เอกสารยังไม่มีทาง v3 (ขัด R13 ของ 2b)
- **เส้นตาย P5 วัดใหม่จาก gate** (แทน "merge 2c + 45 วัน") — `check-v3` บน ZTS-real ด้วย `--today`: +0…+45 ไม่มีโค้ดความสด · **W09 ที่ priceDate + 46 · E27 ที่ + 121** (ล้ม `npm run verify` ทั้ง repo) ⇒ **แข็ง = `market.priceDate` ของใบ exit + 120 วัน · เป้า = + 45 วัน** · priceDate = วัน prep รอบสุดท้ายก่อน spawn (ไม่มี intraday guard ในเส้น sidecar ⇒ US prep หลัง 04:00 ไทย · TH หลัง 16:30 ไทย) · open-items #62
- **ผล probe Task 0** — **OGE** (US): prep 24 ก.ย. ~12:10 ไทย exit 0 · NYSE/USD · px 44.71 @2026-09-23 · `sourceErrors` null · มัธยฐาน P/E 17.19 (FY2021–FY2025) · vendor forward EPS 2.60 = FY2027e ติดธง [2c] (FY2026e = 2.43 → forward P/E 18.4x ห่างมัธยฐาน 6.6% ⇒ W25 อาจยิงโดยบังเอิญ — warn ไม่ใช่สมอตาย) ⇒ US exit ✓ · **M-CHAI** (TH): ยังไม่ได้ prep ตอน Task 0 — prep หลัง SET ปิด 16:30 ไทย + ยืนยันกระดานที่ set.or.th (Yahoo ให้ code `SET` ทั้งสองกระดาน · mai → `meta.exchange: "MAI"`) · `exchangeCode` ของ TH ยังไม่เคยเจอ Yahoo จริง ⇒ ตรวจ exchange/currency/`sourceErrors`/`curErr`/CROSS-VERIFY ก่อน spawn

### Report v3 Plan 2c-ii — ใบ v3 จริง 2 ใบแรก (OGE · ICC) (24 ก.ย. 69)

> spec §6.6 (P4b) · plan `docs/superpowers/plans/2026-09-24-report-v3-plan2c-ii-first-reports.md` · branch `feat/report-v3-plan2c-ii` · production change แรกของ v3 = หน้าใหม่ 2 หน้า + การ์ด index 2 ใบ · หน้าเดิมทุกหน้า byte-identical (พิสูจน์ใน PR)

- **OGE (US · NYSE)** — worker Opus 5.5 · 16 turn (11 + fix 3 + fix 2) · FV $35.06 กรอบ 31.09–39.04 · MOS −27.5% (แพง) · ขา pe:market มัธยฐาน 17.2x FY2021–FY2025 × EPS GAAP TTM + ddm:rg {g 2.4, r 8} (g = ROE 9.7% × (1 − payout 75%)) · dispersion 1.26 · fix round 1 = g 4% ไม่มีที่มา → 2.4% · fix round 2 = ฉาก Bear พิมพ์ 3% แต่ค่า 2% · `meta.exchange` = NYSE = ผลจริงครั้งแรกของ map `exchangeName` NYQ→NYSE ใน sidecar · commit "analyze: add OGE — NEW"
- **ICC (TH · SET) แทน M-CHAI** — prep จริงหลัง SET ปิด: StockAnalysis ไม่มี M-CHAI (`quote/bkk/M-CHAI` redirect symbol-lookup · search 404 ขณะที่ BDMS/BH ให้ payload เต็ม) ⇒ `fetch-fundamentals` fin+stats error ⇒ sidecar ปฏิเสธ (fail-closed ตามสเปก) ⇒ `init` ทำไม่ได้ · สำรองตามสเปก §13 ข้อ 15 = ICC → IDA · **IDA ไม่ใช่ ticker จริง** (set.or.th 404 · Yahoo ไม่พบ) · ICC ผ่านทุกเกณฑ์ (SA ครบ · ไม่มีใบ · ไม่อยู่ใน completed-backlogs/delisted) · **กระดาน = SET** จาก factsheet set.or.th: จดทะเบียน 21 ธ.ค. 1978 (mai เปิด 1999) — ไม่มีช่อง "Market" ให้อ่านตรง ๆ ทั้งใน factsheet และ API (403) · M-CHAI ใช้หลักเดียวกัน (1996 + sector Health Care Services) แต่ไม่ได้ใช้ · เจ้าของแจ้งผ่าน push แล้ว · open-items #64
- **`--th` เป็นข้อบังคับของ prep ใบ NEW ไทย** — `prep.js` อนุมาน TH จาก currency ของใบเดิมเท่านั้น (`th = exists ? currency === 'THB' : !!o.th`) · แผน 2c-ii ข้อ Task 2 Step 2 ตกธงนี้ → รอบแรก M-CHAI ถูก prep เป็น US (Yahoo 404 · header "US · NEW") · แก้ในแผนแล้ว · **ผลจริงครั้งแรกของ TH `--json`/`exchangeCode`**: Yahoo `exchangeName` SET → `exchange: "SET"` · currency THB · `sourceErrors` null · ΔP 0 · มัธยฐาน P/E 13.64 FY2022–FY2025 (4 จุด — median-multiples ตัด FY2021 ที่ 73x ออก)
- **ICC valuation (advisor ก่อน spawn + ก่อน publish)** — worker Opus 5.5 · ~21 turn (18 + fix 3) · FV ฿21.16 กรอบ 20.50–22.81 · MOS −11.5% (หลัง final review I1 — ค่าแรก ฿22.44/−5.2% มีขา FV จริงขาเดียว) · ขา pe:market มัธยฐาน 13.6x × **EPS ปกติ 1.65 (เฉลี่ย FY2022–25)** — ไม่ใช้ TTM 0.55 เพราะมัธยฐานวัดจากปีกำไรปกติ (ปีทรุด 2564 ตลาดจ่าย 73x) ⇒ คูณกำไรปีทรุดด้วยตัวคูณปีปกติ = ลงโทษซ้ำ · ฐาน TTM อยู่ในฉาก Bear (฿7.48 · −64%) · **ขา pbv justified {g 0, r 8.3} family rg** บน `override.roe` 2.76% (= EPS ปกติ 1.65 ÷ BVPS 59.77 — ฐานเดียวกับขา P/E) = (ROE−g)/(r−g) × BVPS = 0.33× book = ฿19.88 · dispersion 1.13 ถ่วงเท่ากัน · **ddm DPS 0.70 คงที่ g 0 r 8.3 (rf ไทย 10 ปี ~2.3% + ERP 6%) = ฿8.43 → `role: "context"`** (แสดง ไม่นับใน FV) · BVPS 59.77 (P/BV 0.39) เป็นทั้งบริบทและตัวตั้งของขา justified — ไม่ใช่ `P/B × BVPS` สมอตาย (ตัวคูณมาจาก ROE/r ไม่ใช่ราคา · ชั้น 0.4b) · **EPS TTM 0.55 ยืนยันเป็น 4 ไตรมาสจริง** (Q3/68 −16.1 + Q4/68 12.9 + Q1/69 137.1 + Q2/69 140.9 = 274.8 ≈ vendor 275 · FY2568 795.2 ≈ 795.7) — ที่มาคือ wire relay ของงบที่แจ้ง SET (RYT9/InfoQuest/gapfocus/aio.panphol) เพราะ set.or.th อ่านตรงไม่ได้ · FV ที่พาดหัวสมมติว่าปันผลจากบริษัทในเครือกลับสู่ค่าเฉลี่ย ซึ่งยังไม่เกิด (H1: 1,031 → 798 → 278) — verdict บอกไว้ · commit "analyze: add ICC — NEW"
- **final review (Opus, ทั้ง branch) I1 — ขา FV น้ำหนัก 0 ≠ ขา context** — ร่างแรกของ ICC ใช้ `fvWeights [1, 0]` (ddm น้ำหนัก 0) ⇒ ขา FV จริงมีขาเดียว · สเปก §3.6 แถว I นิยาม `role: "context"` มาแทน pattern นี้พอดี และ §13 ข้อ 4 ส่งใบที่มีขา FV จริงขาเดียวเข้าถัง HUMAN · หัวข้อที่ render บอก "2 วิธี" แต่ prose บอกไม่เฉลี่ย = ขัดกัน · advisor pre-publish รอบแรกยอมรับ [1,0] ตาม 0.4c โดยไม่ได้อ่านแถว I ⇒ **กติกาที่ใช้ต่อไป: dispersion >2 ให้ย้ายขาที่ตกไปเป็น `role: context` แล้วหาขา FV จริงขาที่สองจากตระกูลอื่น** (ICC = pbv justified บนฐาน normalized เดียวกัน) ไม่ใช่ถ่วง 0 · แก้โดย worker รอบเดียว (3 turn) · I2 = hash ก่อน rebase ในไฟล์นี้ → อ้าง commit subject แทน
- **W18 บน ICC = โครงสร้างของหุ้นราคานิ่ง + EPS ปกติ ไม่ใช่บังเอิญ** — เมื่อราคาแทบไม่ขยับตลอดหน้าต่าง (21.5–26) median(P_i/EPS_i) × mean(EPS_i) ≈ mean(P_i) ≈ ราคาวันนี้โดยสร้าง (13.6x เทียบ 14.3x ห่าง 4.9%) · ยังรับได้: ตัวคูณมาจากมัธยฐานที่วัด ไม่ใช่ราคา spot (ชั้น 0.4e ตอบ "ไม่") และชั้น 0.4b อนุญาตสมอราคาเฉลี่ยหน้าต่าง · **ต่างจาก OGE**: W25 บน OGE (forward P/E 18.4x ห่างมัธยฐาน 17.2x 6.6%) เป็นบังเอิญจริง (มัธยฐาน 5 ปีตกใกล้ P/E ปัจจุบัน) · `DA_ANCHORED` ไม่แตะ — คำตัดสินของเจ้าของที่ค้างอยู่ควรอ่านสองเคสนี้ประกอบ
- **บั๊กที่ใบจริงใบแรกเปิดเผย (แก้ในสาขานี้ พร้อมเทส)** — (1) `ship.js commitMessage` พิมพ์ MOS ของ v3 เต็มความละเอียด (`−27.524244%`) เพราะ `compute().sm.mos` ไม่ปัดเหมือน `stock-meta.mos` ของ v2 → ปัด 1 ตำแหน่ง (v2 ≤1dp ไม่เปลี่ยน · commit "fix(ship): round MOS to 1 dp…") (2) `cards.js peAvg5y` ป้าย "~5 ปี" ตายตัว ทั้งที่ ICC ใช้หน้าต่าง 4 จุด → นับปีจาก `inputs.medianWindow` ของขา fv (OGE ยัง 5 · commit "fix(v3 cards): peAvg5y label…") · **UX carry:** `report.js export` ปฏิเสธเมื่อ `.work/<SYM>.json` มีอยู่ — worker ทุกรอบ fix ต้อง `--force`
- **hook ชั้น 1 ตอน spawn worker exit** — ยัง**ไม่ได้ paste** (ตรวจ `~/.claude/settings*.json` + `.claude/settings*.json` = 0 ครั้ง ที่ 14:08 และ 16:35 ไทย) ⇒ worker ทั้งสองใบรันโดยไม่มีชั้น 1 · ชั้น 2 (`_sig`/E50 ที่ gate) ทำงานตามปกติ — ไม่พบการเขียน `reports/` ตรงจากทั้งสอง worker (stat ของ commit = 4 ไฟล์เท่านั้น)
- **หน้า v3 เทียบ v2** — landmark skeleton 23 = 23 ทั้ง ZTS (US v2) และ BDMS (TH v2) เรียงเหมือนกัน · ชุด class เหมือนกันยกเว้นสี verdict (bad/ok) · ไม่มี token/TODO รั่ว · เครดิต Opus 2 จุด · การ์ด index ปรากฏ · design review เป็นของเจ้าของหลัง deploy
- **ซ้อมทั้งเว็บ + cron (Task 3 Step 1 · scratch worktree ที่หัว branch ก่อน rebase (commit ICC) · 24 ก.ย. 69 19:50 ไทย ขณะ US ยังเปิด — advisor ตัดสินว่าทุก assertion ไม่ขึ้นกับเวลา)** — verify เต็ม ✓ · check-site error 0 ✓ · update-prices-test ✓ · `update-prices --write`: "ข้าม reports/ICC.json" + "ข้าม reports/OGE.json" + **`v3-skipped: 2`** · preserve-dates "ข้าม 2 ใบ v3 … ICC OGE" · `verify:cron` ✓ · `.json` ทั้งสองไม่ถูกแตะ (git status = 0) · dead-ticker canary dry ไม่มีบรรทัด OGE/ICC · dist ทั้งสองหน้าอยู่ + manifest มี OGE · 235 ไฟล์เปลี่ยน = ใบ TH 233 (US ข้ามเพราะตลาดเปิด) · freeze 1 = APURE `patch-rejected` E26 (ค้างเดิมของ v2) · M-CHAI ไม่ปรากฏใน reports.json/price-flags (record ค้างใน `.queue/state.json` ไม่มีผล — state.js ไม่มีคำสั่งลบ)
- **cron รอบแรกหลัง 2c-i = รันมือ `workflow_dispatch` (เจ้าของสั่งเพื่อไม่รอ skew · run 36000299231 · 24 ก.ย. 12:38–12:47Z = 19:38–19:47 ไทย)** — บน main `9a780cd70` (ยังไม่มี `.json`): อัปเดต 233 (TH) · ไม่เปลี่ยน 672 (US quote ยังเป็นปิด 23 ก.ย. — pre-market) · freeze 4 (ABNB/EXPE flip · ARM drift +20.7% · APURE E26) · error 0 · `verify:cron` ✓ · push `2f00f1f77` · **ตรวจ convergence dividendYield 1dp→2dp (สัญญาจากรอบแรกหลัง Plan 1): 0 ใบจาก 172 คู่ stock-meta ที่ราคาไม่เปลี่ยน ⇒ ลู่เข้าแล้ว** · advisor: รอบรันมือนับเป็น precondition "one variable per run" ได้ เพราะเป้าหมายคือพิสูจน์โค้ด scanner บน GitHub ไม่ใช่เวลาที่รัน · ci-verify ไม่รันบน push ของ bot (GITHUB_TOKEN) — เหมือนทุกรอบ
- **ข้อแลกที่เจ้าของรับ (24 ก.ย. 69 ค่ำ)** — merge คืนนี้แทนรอรอบ 04:00 ⇒ รอบ scheduled 25 ก.ย. เป็นรอบ production แรกที่ (1) มี `reports/*.json` อยู่จริง และ (2) เป็นขั้น patch US แรกบนโค้ดใหม่พร้อมกัน — ถ้าล้มจะมี 2 ตัวแปร · แผนรับมือ: ดู log รอบนั้นลง (~06:40 ไทย) ต้องเห็น `v3-skipped: 2` และไม่มี `patch-rejected` บน OGE/ICC ก่อน archive ledger · ล้ม = revert merge commit เดียว
