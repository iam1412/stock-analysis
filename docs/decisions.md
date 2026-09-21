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

## §8 Quality gate

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
- **SEC fallback ต้องมี UA (พบตอนตรวจสดหลัง merge รอบสอง)**: SEC ต้องมี env `SEC_USER_AGENT` (ชื่อ + ช่องทางติดต่อ ที่**เจ้าของกำหนด** — ห้าม commit ค่านี้): `www.sec.gov/files/company_tickers.json` ตอบ 403 กับ UA ที่ไม่ประกาศตัวตน (Mozilla/5.0 เปล่า ๆ ก็ 403 — SEC fair-access policy) ส่วน `data.sec.gov` (submissions) รับ UA อะไรก็ได้ · ตัวเลือกที่ใช้: `tools/sec-ciks.json` (ticker→CIK ของหุ้น US ที่มีรายงาน · สร้างด้วย `node tools/earnings-calendar.js --sec-refresh-ciks` ต้องมี `SEC_USER_AGENT` · ดึงล้ม = ไม่แตะไฟล์เดิม) ถ้ามีไฟล์นี้ = ไม่ขอแผนที่จาก www.sec.gov และดึง submissions ด้วย UA สำรองได้ · **ไม่มีทั้ง env และไฟล์ = kind `no-ua`** (ปิด SEC fallback — ไม่ลองยิงให้โดน 403) ซึ่งปฏิบัติเหมือน unknown อื่น: flip คง PREPATCH · แถว worker (drift/suspect-split/age) = FULL ⇒ **แถว US ที่เป็นงาน worker จะเป็น FULL หมดจนกว่าจะมีแผนที่ + UA** (ยกเว้นหุ้นที่ปฏิทิน Yahoo รู้ `last`) · **แถว TH ไม่ได้รับผลกระทบ** (ใช้เส้นตาย SET) · ตรวจสดด้วย `node tools/earnings-calendar.js --sec-probe AAPL TSM` (พิมพ์ CIK · งบล่าสุด · kind ok|6k-only|no-cik|fetch-failed|no-ua) · preflight สรุป `⚠ statement unknown: N (fetch-failed M · no-ua K)`
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
