# Stock Analysis — Project Rules

รีโปนี้เก็บ **รายงานวิเคราะห์หุ้น** เป็นไฟล์ HTML แล้ว build เป็นเว็บ static
deploy อัตโนมัติบน **Cloudflare Workers (Static Assets)** ผ่านการเชื่อม GitHub

> **รายละเอียดลึกแยกไปไฟล์อ้างอิง** (อ่านเมื่อต้องใช้ ไม่โหลดทุก session):
> `.claude/skills/stock-analyzer/SKILL.md` (★ ขั้นตอนวิเคราะห์ต่อหุ้น — source of truth) · `docs/orchestration.md` (รายละเอียดรันหลายตัว/เวฟ/workflow) · `docs/quality-gate.md` (gate ทีละ error) · `docs/templates.md` (content-only template) · `docs/counters.md` (view/vote infra) · `docs/price-refresh.md` (cron ราคา) · `_template/agent-prompt.md` (wrapper prompt worker) · `DEPLOY.md` (Cloudflare)

---

## 1. โครงสร้างโฟลเดอร์

```
reports/<SYMBOL>.html   # ★ ต้นฉบับรายงาน — 1 ไฟล์ = 1 หุ้น (พิมพ์ใหญ่)
_template/              # skeleton-{th,us}.html, dashboard.css, engine.js, agent-prompt.md
build.js                # สแกน reports/ → index.html + reports.json → flatten ลง dist/
reports.json            # manifest (build เขียนเอง, committed) ห้ามแก้มือ
tools/  test/  docs/    # เครื่องมือ / quality gate / เอกสารอ้างอิง
wrangler.toml _headers  # Workers Static Assets / HTTP headers
dist/                   # ⚠️ build output (gitignore) — ห้ามแก้มือ
```

**ห้ามแก้มือ** (build สร้างเอง): `dist/` · `reports.json` · landing/การ์ด/footer/ช่องค้นหา (แก้ใน template ของ `build.js`) · หน้า index เรียงอัปเดตล่าสุดขึ้นก่อนอัตโนมัติ

---

## 2. วิเคราะห์หุ้นเดี่ยว (skill `stock-analyzer`)

เมื่อสั่ง "วิเคราะห์ X" / re-analysis / เคลียร์คิว price-flags → เรียก skill **`stock-analyzer`** แล้ว**ทำตามทุกขั้น** → `npm run verify` ผ่าน 13 ขั้น → **Auto-push** (§5)

invariant ที่ห้ามหลุดไม่ว่ากรณีใด:
- **cross-source verify ราคา+EPS ≥2 แหล่งก่อนเขียนตัวเลข** — ราคาต่าง >5% / EPS ขัดกัน → หยุด ถามผู้ใช้ อย่าเผยแพร่ (gate ตรวจความจริงไม่ได้)
- **หุ้นใหม่เริ่มจาก skeleton เท่านั้น · หุ้นเดิมห้าม rewrite** — กราฟ/ราคา/ป้าย % มาจาก script ห้ามแต่งเอง
- ไฟล์ = `reports/<SYMBOL>.html` พิมพ์ใหญ่ · `stock-meta.currency` = ISO (`USD`/`THB`)

> URL: `https://gaohoon.com/<SYMBOL>.html` (หรือ `/<SYMBOL>`)

---

## 3. วิเคราะห์หลายตัว / เป็นกลุ่ม (parallel agents)

ใช้เมื่อสั่งหลายตัวหรือธีม · **รายละเอียด+เหตุผลทั้งหมด → `docs/orchestration.md`** · invariant ที่ห้ามหลุด:

1. **ก่อนเริ่ม**: `git pull --rebase origin main` → อ่าน `reports.json` — สด ≤7 วัน **ไม่ทำซ้ำ** (ธีม→หาตัวแทน · ระบุชื่อ→ข้ามพร้อมแจ้ง) · เกิน 7 วัน = UPDATE · ยังไม่มี = NEW
2. **โมเดล**: ❌ Haiku ทุกขั้น · **Sonnet = default ของหุ้นส่วนใหญ่** · **Opus = escalate เฉพาะ "หุ้นยาก"** (เกณฑ์เดียวกับ effort high ท้ายข้อนี้ — IPO <1 ปี/spinoff/split/cyclical/pre-profit/ราคา cross-source ต่าง >5%) ส่ง `model:"opus"` เฉพาะตัวนั้นใน `stocks[]` (แก้กติกาเดิม "Sonnet ทุกชั้น" 9 ส.ค. 69 — `analyze-wave` รองรับ escalate รายตัวอยู่แล้ว) · ★★ **บังคับ pin `model` ทุก `analyze-wave`/`Agent` call เสมอ ("sonnet" หรือ "opus" ตามที่ตั้งใจ) — ห้ามพึ่ง env var** เพราะ `CLAUDE_CODE_SUBAGENT_MODEL` **ตั้งผ่าน `settings.json` ไม่ได้** (harness กรองตัวแปรนี้ทิ้งเป็นการเฉพาะ ทั้งชั้น project และ local — วัดแบบ controlled 8 ส.ค. 69: ตัวแปรอื่นใน `env` block เดียวกันติดหมด ตัวนี้ตัวเดียวหาย) ⇒ default ที่ไม่ pin = **Opus 5** — ผิดกติกาเพราะ "ไม่ได้ตั้งใจ" (จ่ายราคา Opus ให้หุ้นธรรมดาโดยไม่รู้ตัว + ป้าย `ai-model` เพี้ยนจากที่วางแผน) ไม่ใช่เพราะ Opus ต้องห้าม · **เช็คก่อนเริ่มเวฟด้วย probe subagent จริง** (spawn ไม่ใส่ `model` แล้วให้ตอบบรรทัด "You are powered by the model named …") — `echo $CLAUDE_CODE_SUBAGENT_MODEL` **ใช้ไม่ได้** มันเห็นแค่ env ของ Bash ไม่ใช่ของ spawner · ป้าย `ai-model` ในรายงานต้องตรงกับโมเดลที่รันจริง → controller spot-check ทุกใบ · หุ้นยาก (IPO <1 ปี/spinoff/split/cyclical/pre-profit/ราคา cross-source ต่าง >5%) → worker effort **high** + ปรึกษา `advisor` **ผ่าน courier subagent เท่านั้น** ก่อน spawn แล้วฝังแนวทางลง prompt (เรียกตรง = unavailable เสมอ — วิธี/เหตุผล `docs/orchestration.md` §2 · courier ล้มเหลว → หยุดถาม user) · ตัดสิน publish/skip กำกวม → advisor (courier) ก่อน ยังกำกวม → หยุด ping user
3. **spawn**: 1 หุ้น/agent (กันเลขปนข้ามหุ้น — ตัวร้าย #1) · prompt = `_template/agent-prompt.md` + STEP 0 กัน cwd-stray · คุม effort ต่อ worker → workflow **`analyze-wave`** · **★ ข้อห้ามจริงคือ "หลายหุ้นใน 1 run" ไม่ใช่ "หลาย run"** — `stocks[]` ต้องมี **1 ตัวเสมอ** · รันหลาย run ขนานกันได้ (1 หุ้น/run) แต่ **จำนวนที่ขนานเป็นดุลพินิจ ไม่ใช่ค่าตายตัว** ขนานมาก = เสี่ยง rate limit ทั้งชุด (เคยพังจริง US-GAP W19–W21) → ramp ขึ้นทีละขั้น เจอ rate limit ให้หาร N ครึ่ง · **ก่อนขนานต้องทำ 2 อย่าง**: controller pre-assign สีแบรนด์เอง (seeds.json race — §10) + verify/push **รายแบตช์** ไม่ใช่รายตัว (verify เป็น gate ทั้งรีโป ไฟล์ worker ที่ยังเขียนไม่เสร็จจะทำ gate ตกและบล็อกตัวที่ดีแล้ว)
4. **push รายตัว**: worker เสร็จ 1 ตัว → controller ตรวจ → verify + push ทันที (Bash call เดียว §5) ก่อน spawn ตัวถัดไป · จำนวนหุ้นต่อรอบไม่จำกัด (ยกเลิกเวฟละ ≤3 — 12 ก.ค. 69) · ห้าม agent push เอง · ห้าม push ซ้อน session
5. ของดีไม่พอโควตา → ลดจำนวนเองได้ ไม่ต้องถาม แต่แจ้งเหตุผล (คุณภาพ > โควตา)

---

## 4. Token discipline

ต้นทุนจริง = **จำนวน turn × cache-read** ไม่ใช่ output — กติกา token-lean ต่อหุ้นอยู่ใน **SKILL.md** · เป้า+ตัวเลขวัดจริง → `docs/orchestration.md` §7 + memory `token-usage-benchmarks` · ที่ controller คุมเองเพิ่ม:

- **รันยาวได้ ไม่ต้องหยุดรอ user เปิด session ใหม่** (ยกเลิก chunk/session — 13 ก.ค. 69, auto-compact จัดการเอง) · คุมตัวเอง: รวม verify+push เป็น Bash เดียว · ไม่อ่านรายงานทั้งไฟล์ · สรุประหว่างเวฟให้สั้น
- pull --rebase + อ่าน `reports.json` ก่อน — ข้ามหุ้นสด ≤7 วัน
- งาน mechanical → effort medium ผ่าน `analyze-wave` · หุ้นยาก → effort high
- controller **pre-fetch `node tools/prep-stock.js <SYM> [--th] [--update]` เสมอ** แล้ววางทั้ง block ใน `{{FUNDAMENTALS}}` — บรรทัดแรกคือ CROSS-VERIFY verdict, **exit 2 = ราคาขัดแหล่ง >5% ห้าม spawn หยุดถาม user (§2)** · worker ห้ามรัน fetch ซ้ำ/ห้าม WebFetch หน้า financials เอง

---

## 5. Auto-push (กฎสำคัญ)

หลังวิเคราะห์เสร็จ / แก้ไฟล์ใน `reports/` → **commit + push ขึ้น `main` อัตโนมัติทันที ไม่ต้องถาม**
(commit **ก่อน** pull --rebase เสมอ ไม่งั้น rebase error "Please commit or stash")

```bash
npm run verify                     # 0. quality gate 13 ขั้น — error = ห้าม push
git add -A                         # 1.
git commit -m "<message>"          # 2.
git pull --rebase origin main      # 3. sync
git push origin HEAD:main          # 4. ★ worktree ต้องใช้ HEAD:main (ไม่ใช่ 'main' เปล่า)
```

มี `pre-push` hook (`.githooks/pre-push`) บังคับ verify ซ้ำ (เปิดครั้งเดียว: `git config core.hooksPath .githooks`) · รวมทั้ง 5 ขั้นเป็นคำสั่งเดียวด้วย `&&` ได้

**commit message:** **1 commit = 1 หุ้น** (ห้าม commit รวมหลายหุ้น) — หุ้นใหม่ `analyze: add <SYMBOL> stock analysis` · อัปเดต `analyze: update <SYMBOL> …` · ลงท้าย:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```
> ขอบเขต auto-push = งานใน `reports/` · แก้โครงสร้างระบบ (build.js, wrangler.toml, CLAUDE.md, docs/) → สรุปก่อน push ตามปกติ

---

## 6. Build & Deploy

- **Build:** `npm run build` (= `node build.js`) — ไม่มี dependency, Node ≥20.19
- **Deploy:** Cloudflare รัน build + `wrangler deploy` อัตโนมัติเมื่อ push เข้า `main` · เว็บนี้เป็น **Worker (Static Assets)** ไม่ใช่ Pages — อย่าใช้ `wrangler pages deploy` (ดู `DEPLOY.md`)

---

## 7. ข้อห้าม / ข้อควรระวัง

- ⏰ **Time Zone = Asia/Bangkok (UTC+7)** — ทุกการคิด "วันนี้"/ความสด (header · dedup 7 วัน · staleness 45/120 วัน) ใช้เวลาไทย · วันที่ในรายงานใช้ปี พ.ศ.
- ❌ โมเดลนอกกติกา §3.2: **Haiku ทุกขั้น** · **ปล่อย default ไม่ pin `model`** (กลายเป็น Opus โดยไม่ตั้งใจ) — Sonnet เป็น default, Opus escalate เฉพาะหุ้นยาก
- ❌ อย่า commit `dist/`, `node_modules/`, `.DS_Store` · อย่าแก้ไฟล์ใน `dist/` ตรง ๆ (แก้ต้นฉบับ)
- ❌ ชื่อไฟล์รายงาน = `<SYMBOL>.html` พิมพ์ใหญ่ ไม่มีเว้นวรรค
- ✅ ทุกรายงานมี disclaimer "ไม่ใช่คำแนะนำการลงทุน" + "ราคา ณ วันที่ + แหล่งที่มา"

---

## 8. Quality gate — ก่อนเผยแพร่ (`npm run verify`)

13 ขั้น ต้องผ่านทั้งหมดก่อน push (pre-push hook บังคับซ้ำ):
`update-prices-test` → `dead-ticker-test` → `tag-apply-test` → `tags-test` → `check-reports` (43 error + 16 warning) → `self-test` → `ohlc-test` → `ta-engine-test` → `build` → `build-test` → `engine-exec` → `skeleton-test` → `check-site`

> `self-test` เข้า gate แล้ว (12 ส.ค. 69) — เดิมเป็น meta-test ที่ต้องรันมือ ⇒ ถ้า check ใน `check-reports` เสียจนไม่ยิงอีก gate จะรายงาน "error 0" แยกไม่ออกจาก "สะอาดจริง" (0.24 วิ ไม่กระทบเวลา)

- เร็ว: `npm test -- <SYM>` = check-reports เฉพาะตัวนั้น (ใช้ตอน self-check ก่อนคืนงาน)
- gate ตรวจ **ความสอดคล้อง/ความสด/การอ้างอิง** เท่านั้น — **ตรวจความจริงของราคา/EPS ไม่ได้** (ต้อง cross-source verify §2) และ **ตรวจไม่ได้ว่าสมมติฐาน valuation สมเหตุผลไหม**
- ★ **ชั้น 0 — sanity gate ของ valuation (controller ตรวจเอง)**: cluster check (เซกเตอร์เดียวกัน ≥4 ตัว MOS ทางเดียวกัน |เฉลี่ย| >25% แต่ราคาห่าง consensus ≤15% = **พารามิเตอร์ร่วมพัง หยุด**) · |MOS| >40% ต้องมีวิธีที่ไม่ใช้ (r,g) ยืนยัน · **rf ต้องตรงสกุลกระแสเงินสด** · "2 วิธี" ที่ใช้ (r,g) ชุดเดียวกัน = วิธีเดียว → **`docs/quality-gate.md` ชั้น 0**
- ★ **ผลตอบแทนฉาก 3 ปี (หมวด 6)**: `total% = (เป้า−ราคา)/ราคา` · `%/ปี` = CAGR ของค่านั้น · จุดเข้า = ราคาปัจจุบัน — **ราคาเป้าเป็นสมมติฐาน ห้ามขยับ** · W17 + `patchDerived` ดูแลให้อัตโนมัติแล้ว แต่ **เงียบเมื่อสามคอลัมน์ไม่สอดคล้องกันเอง** (84 ใบ ณ 20 ส.ค. 69) ⇒ ใบพวกนั้นต้องให้คนอ่าน · ฐาน "รวมปันผล" ถอดจากตัวเลขที่โชว์เอง **ห้ามเชื่อคำว่า "รวมปันผล" ใน hint** (skeleton พิมพ์ติดมาทุกใบ ⇒ RGLD มีคำนั้นแต่ตัวเลขไม่รวมปันผล)
- ★ **หุ้นวัฏจักร/โภคภัณฑ์ (ชั้น 0.4b)**: อัตราส่วนปรับฉาก anchor ที่**ราคาเฉลี่ยหน้าต่าง TTM ไม่ใช่ spot** (คิดรายบริษัท) · **ทุกขาของ FV ต้องเป็นฟังก์ชันของตัวแปรฉาก** — `P/B × BVPS` เป็นสมอตาย ใช้เป็นบริบทได้แต่ห้ามเป็นขา · ตัวคูณกับตัวตั้งต้องนิยามเดียวกัน · EV ต้องใช้ราคาสกุลเดียวกับงบ (แคนาดา = TSX/CAD) · **controller ต้อง pre-fetch ตัวคูณมัธยฐานให้ worker** (`stockanalysis.com/stocks/<SYM>/financials/ratios/`) ไม่งั้น worker จะประมาณเอง
- แก้ check ต้องเพิ่มเคสใน `test/self-test.js` + `npm run test:self` ผ่าน — **ขอบเขต = E-code/W-code ใน `test/check-reports.js` เท่านั้น** (self-test เป็น meta-test ของไฟล์นั้นไฟล์เดียว mutate รายงานจริงแล้วดูว่า check ยิงไหม) · **check ใน `test/check-site.js` ไม่เข้าข้อนี้** เพราะมันตรวจ `dist/` ที่ build แล้ว ไม่มี fixture ให้ mutate — กันตัวเองพังเงียบด้วยกฎ 2 ข้อแทน: (1) ทุก check ที่ดึงค่าด้วย regex ต้องฟ้องเมื่อ **หาไม่เจอ** ไม่ใช่ปล่อยเป็นค่าว่างแล้วผ่าน (2) คลาส CSS ที่เคยรั่วข้ามหน้าจริงต้องอยู่ใน `SHARED_CLASS_PIN`

> **รายละเอียดทุกชั้น/ทุก E-code + เกณฑ์ → `docs/quality-gate.md`**

---

## 9. Price refresh อัตโนมัติ (cron)

GitHub Actions รัน `tools/update-prices.js` ทุกวัน 07:17 น. ไทย — patch **เฉพาะตัวเลขโครงสร้าง** (**ไม่แตะ prose/EPS/FV** · วันที่วิเคราะห์คงเดิมผ่าน preserve-dates · **ตั้งแต่ 17 ส.ค. 69 รวมถึง "ตัวเลข" ในช่องสรุปส่วนต่างจากราคา + `class` ของกล่อง verdict** — สองอย่างนี้เป็นค่าที่ derive จาก MOS ล้วน ๆ จึงไม่นับเป็น prose · cron ไม่แตะ**คำ**บอกทิศ (ถูก/แพง) ⇒ W06 ที่ยังยิงหลัง cron = ทิศขัดกันจริง ต้องคนแก้ · **ตั้งแต่ 20 ส.ค. 69 รวมถึงผลตอบแทนฉาก Bear/Base/Bull ในหมวด 6 + ป้าย "จากจุดเข้า"** (`scenarioPlan` — ราคาเป้าไม่ถูกแตะเพราะเป็นสมมติฐาน · รักษาฐาน "รวมปันผล" และสูตร %/ปี ของใบนั้นไว้ · ตัดสินไม่ได้ = ไม่แตะ ตรงกับที่ W17 เงียบเป๊ะ ๆ) · **ตั้งแต่ 19 ส.ค. 69 รวมถึง P/E ที่โชว์ในการ์ด + `stock-meta.pe` + % ในการ์ดราคาเป้า + Market Cap + P/S** (`patchDerived` — ตัวตั้งคือราคาที่เพิ่ง patch ตัวหาร/ตัวลบคือ EPS/ราคาเป้าที่รายงานพิมพ์เอง จึงไม่มีอะไรให้ cron เดา · ก่อนหน้านี้ไม่มีใครแตะ ⇒ ค้าง 233/908 ใบ (P/E) และ 544/908 ใบ (Market Cap) โดย gate มองไม่เห็น — E41/E42/E43 บังคับแล้ว · P/S อ้างข้ามการ์ดจึงเป็น W16 ระดับ warn · **% ของราคาเป้าใน prose ยังไม่แตะ** = W15 เตือนให้คนแก้ หรือ `--heal-derived --prose`)) แล้ว verify + push เอง · freeze ลง `price-flags.json` เมื่อ: ต่าง >15% / MOS พลิกเกิน dead-band ±3 จุด / สงสัย split (flip ใน ±3 จุด = patch ผ่าน · หลุดขอบ gauge = ขยายขอบเอง)
- **"เคลียร์คิว price-flags"** = **triage ตาม `reason` ก่อน** (เกณฑ์เต็มใน SKILL STEP 0: fetch/patch-failed = plumbing ไม่ใช้ agent · drift/mos-flip = **UPDATE-LIGHT** · suspect-split = UPDATE เต็ม · **not-on-exchange = ยืนยันเพิกถอนด้วยมือแล้วลบรายงาน + `node tools/tag-apply.js --prune` เก็บกวาด entry ค้างใน `tags.json` ห้าม re-analyze**) แล้วรันตาม §3 — flag ราคาหายเองเมื่อรายงานสด/ไฟล์ถูกลบ · `not-on-exchange` ถอนได้แค่ตอน TradingView เจอ ticker กลับมา · ไฟล์ถูกลบ · หรือยืนยันด้วยมือว่ายังเทรดผ่าน `--alive <SYM>` (re-analysis ปกติ รวม `--force` ไม่เคลียร์ — ตั้งใจแยก flag เพราะ SKILL สั่ง `--force` ทุกรอบ)
- **canary หุ้นตาย (เพิ่ม 8 ส.ค. 2569)** — Yahoo ไม่ 404 เวลาหุ้นถูกเพิกถอน มัน serve ราคาค้าง ⇒ drift 0% ⇒ cron ไม่เคยจับได้ (เคส EA/BPP) · ปิดจุดบอดด้วย flag `not-on-exchange` แบบ **2 ชั้น**: quote ค้าง ≥3 session (pre-filter รายวัน) **และ** TradingView ไม่พบ ticker — ห้ามใช้ชั้นแรกเดี่ยว ๆ (วัดแล้ว: `regularMarketTime` ค้างที่ "วันซื้อขายล่าสุด" ⇒ หุ้นสภาพคล่องต่ำโดน false positive 99/248 วัน) · เสริมด้วย full sweep รายสัปดาห์ `.github/workflows/dead-ticker-canary.yml` · เป็น **ตัวชี้ให้ไปดู ไม่ใช่คำตัดสิน** — ยืนยันแหล่งปฐมภูมิ (SEC Form 25 / ประกาศตลาด) ก่อนลบเสมอ
- **ตลาดยังเปิด = ข้ามตัวนั้น ไม่ patch ไม่ flag** (เพิ่ม 11 ส.ค. 2569 · `isIntradayQuote`) — ราคากลาง session เป็น intraday ไม่ใช่ราคาปิด · cron ตั้งเวลาไว้หลังตลาดปิดอยู่แล้วจึงไม่กระทบ แต่ **รันมือ/`workflow_dispatch` ตอนเย็นไทย = กลาง session US จะเห็น "ข้ามเพราะตลาดเปิด N"** (ไม่ใช่ของเสีย) · `--force`/`--alive`/`--allow-intraday` ข้าม guard นี้ ⇒ re-analysis ตาม SKILL ยังประทับราคาได้ตามปกติ · v8 chart ไม่มี `marketState` จริง — ใช้ `currentTradingPeriod` 2 เงื่อนไข → `docs/price-refresh.md`
- ticker เปลี่ยนชื่อ (เช่น BKI→BKIH) → `tools/symbol-map.json` **+ ย้าย key เดิมใน `tags.json` ด้วย `node tools/tag-apply.js --rename <OLD> <NEW>`** (ไม่ทำ = tag เดิมค้างอยู่ใต้ ticker เก่าที่ไม่มีรายงานแล้ว → corpus check ใน `test/tags-test.js` ฟ้อง) · canary โครงแหล่งข้อมูลรายสัปดาห์ = `.github/workflows/fundamentals-canary.yml` · รายละเอียด/debug → `docs/price-refresh.md`

## 10. Template system + counters (สรุป)

- **รายงาน = content-only template** — CSS/engine อยู่ใน `_template/` build `expandReport()` inject ตอน build · ไฟล์เก็บแค่ `report-data` (กราฟ/gauge/theme) + เนื้อหา 8 section · เริ่มจาก `_template/skeleton-{th,us}.html` · สีแบรนด์ต่อหุ้น (`tools/seeds.json` + `brandtheme.js`) → **`docs/templates.md`**
  - ⚠️ **`tools/pick-brand.js` ไม่ปลอดภัยเมื่อรันขนาน** — read-modify-write `seeds.json` โดยไม่มี lock (อ่าน ~บรรทัด 30 → เขียน ~บรรทัด 111) · รัน 2 ตัวพร้อมกัน = entry ทับหาย + ขั้นตอน "ตรวจ hex ชน" มองไม่เห็นสีของอีกตัว ⇒ **หุ้น 2 ตัวได้สีแบรนด์เดียวกันโดย gate จับไม่ได้** · เวลา spawn worker ขนาน **controller ต้อง pre-assign สีเองแบบ sequential** แล้วส่ง theme/GDOTS ลง prompt (ดู §3.3)
- **GUI brand-forward (ส.ค. 69)** — ระบบดีไซน์ทั้งหมด → **`DESIGN.md`** · สาระที่ห้ามหลุด: **font = Sarabun + IBM Plex Mono เท่านั้น** (เจ้าของสั่งถอด Kanit กลับ 12 ส.ค. 69 — ห้ามเปลี่ยน typeface โดยไม่ถาม) · โทเคนสี derive จาก accent ตอน build (`deriveTheme()` ใน build.js — สูตร/คู่ contrast ที่ E38 คุมดู DESIGN.md) · **ตัวหนังสือขาวห้ามวางบน accent ดิบ ให้ใช้ accentDark/badge เท่านั้น** (386/908 ธีมตก AA) · การตกแต่งทุกอย่าง inject ตอน build — **ห้ามแก้ไฟล์รายงานเพื่อเรื่องดีไซน์** · สถิติ+โหวตของหน้ารายงานอยู่ในการ์ดบน header (`injectHeaderStats`) ไม่ใช่ footer แล้ว
- **view/vote counters** = Worker + Durable Object (`src/worker.js`) inject ตอน build เฉพาะ `dist/` → **`docs/counters.md`** + `DEPLOY.md`
- **กราฟ TA (TradingView-style)** = Worker route `/api/ohlc` proxy Yahoo + client engine (`_template/ta-engine.js`/`ta-chart.js`) + bundle inject ตอน build เฉพาะ `dist/` → **`docs/ta-chart.md`**
- **ระบบ tag ธีมการลงทุน** — `tags-vocab.json` (คลังที่อนุมัติแล้ว) + `tags.json` (symbol → slug) inject ตอน build ลง `dist/` เท่านั้น · **ห้ามเขียน tag ลงไฟล์รายงาน** (freshHash จะทำให้ `updated` ของทั้ง 908 ไฟล์เด้งพร้อมกัน → พังการเรียงหน้าแรก + dedup 7 วัน + staleness) · **`tools/tag-apply.js` เป็นทางเข้าเดียวที่เขียน `tags.json`** ห้ามแก้มือ ห้าม worker เขียนเอง (race แบบ `pick-brand.js`) · lifecycle: NEW ติดใหม่ · UPDATE ทบทวนบังคับ (ค่าตั้งต้นคงเดิม) · UPDATE-LIGHT + cron ราคา **ไม่แตะ** · rename → `--rename` · ลบรายงาน → `--prune` → **`docs/templates.md`**
