# Stock Analysis — Project Rules

รีโปนี้เก็บ **รายงานวิเคราะห์หุ้น** เป็นไฟล์ HTML → build เป็นเว็บ static → deploy อัตโนมัติบน **Cloudflare Workers (Static Assets)** ผ่านการเชื่อม GitHub

> **ไฟล์นี้ถูก inject ให้ทั้ง session หลัก (controller) และ subagent (worker)** (วัดจริงทั้งทาง Agent tool และ workflow `analyze-wave` — ได้ทั้ง CLAUDE.md และ MEMORY.md เหมือนกัน) · หัวข้อที่ติดป้าย **[controller]** เป็นงานของ session หลักเท่านั้น **worker ห้ามทำตาม** (worker ยึด `_template/agent-prompt.md` + SKILL.md · โดยเฉพาะ: worker ห้าม push · ห้ามเรียก advisor ตรง · ห้ามเขียน tags.json) · หัวข้อไม่ติดป้าย = ใช้ทั้งสองบทบาท

> **ไฟล์นี้เหลือแต่กฎ** — หลักฐาน/ที่มา/วันที่วัดจริง/ประวัติการแก้กติกา → **`docs/decisions.md`** (หัวข้อเรียงตามเลข § เดียวกัน) · **รายละเอียดลึกแยกไปไฟล์อ้างอิง** (อ่านเมื่อต้องใช้ ไม่โหลดทุก session): `.claude/skills/stock-analyzer/SKILL.md` (★ ขั้นตอนวิเคราะห์ต่อหุ้น — source of truth) · `docs/orchestration.md` (รันหลายตัว/เวฟ/workflow) · `docs/quality-gate.md` (gate ทีละ error) · `docs/templates.md` (content-only template) · `docs/counters.md` (view/vote infra) · `docs/price-refresh.md` (cron ราคา) · `_template/agent-prompt.md` (wrapper prompt worker) · `DEPLOY.md` (Cloudflare)

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

เมื่อสั่ง "วิเคราะห์ X" / re-analysis / เคลียร์คิว price-flags → เรียก skill **`stock-analyzer`** แล้ว**ทำตามทุกขั้น** → `npm run verify` ผ่าน <!-- gen:verify-steps -->18<!-- /gen:verify-steps --> ขั้น → **Auto-push** (§5 — controller/session หลักเท่านั้น · worker คืนงานให้ controller push)

invariant ที่ห้ามหลุดไม่ว่ากรณีใด:
- **cross-source verify ราคา+EPS ≥2 แหล่งก่อนเขียนตัวเลข** — ราคาต่าง >5% / EPS ขัดกัน → หยุด ถามผู้ใช้ อย่าเผยแพร่ (gate ตรวจความจริงไม่ได้)
- **หุ้นใหม่เริ่มจาก skeleton เท่านั้น · หุ้นเดิมห้าม rewrite** — กราฟ/ราคา/ป้าย % มาจาก script ห้ามแต่งเอง
- ไฟล์ = `reports/<SYMBOL>.html` พิมพ์ใหญ่ · `stock-meta.currency` = ISO (`USD`/`THB`)

> URL: `https://gaohoon.com/<SYMBOL>.html` (หรือ `/<SYMBOL>`)

---

## 3. [controller] วิเคราะห์หลายตัว / เป็นกลุ่ม (parallel agents)

ใช้เมื่อสั่งหลายตัวหรือธีม · **กลไก courier/analyze-wave/ต้นทุน → `docs/orchestration.md` (กฎอยู่ที่นี่ที่เดียว)** · invariant ที่ห้ามหลุด:

1. **ก่อนเริ่ม (§3.1)**: `git pull --rebase origin main` → อ่านวันที่ footer "ข้อมูล ณ" ของแต่ละใบ (runbook `preflight` ทำให้) · **`reports.json.updated` ใช้ตัดสินความสดไม่ได้** (freshHash ชนกันได้) · สด ≤7 วัน **ไม่ทำซ้ำ** (ธีม→หาตัวแทน · ระบุชื่อ→ข้ามพร้อมแจ้ง) · เกิน 7 วัน = UPDATE · ยังไม่มี = NEW
2. **โมเดล (§3.2)** — ❌ **Haiku ทุกขั้น** (ผลวัด/วันที่ที่มาของกฎข้อนี้ → `docs/decisions.md` §3.2)
   - **Sonnet = default ของหุ้นส่วนใหญ่** · **Opus = escalate เฉพาะ "หุ้นยาก"** → ส่ง `model:"opus"` เฉพาะตัวนั้นใน `stocks[]`
   - **เกณฑ์ "หุ้นยาก" (ชุดเดียว ใช้ทั้ง Opus escalate และ effort high)**: IPO <1 ปี / spinoff / split / cyclical / pre-profit / ราคา cross-source ต่าง >5%
   - ★★ **บังคับ pin `model` ทุก `analyze-wave`/`Agent` call เสมอ** ("sonnet" หรือ "opus" ตามที่ตั้งใจ) — **ห้ามพึ่ง env var** เพราะ `CLAUDE_CODE_SUBAGENT_MODEL` **ตั้งผ่าน `settings.json` ไม่ได้** (harness กรองตัวแปรนี้ทิ้งเป็นการเฉพาะ ทั้งชั้น project และ local) ⇒ default ที่ไม่ pin **ไม่แน่นอน** · ผิดกติกาเพราะ "ไม่รู้ว่าได้อะไร" (ค่าใช้จ่าย + ป้าย `ai-model` ไม่ตรงแผน) ไม่ใช่เพราะ Opus ต้องห้าม · ทาง `analyze-wave` แน่นอนเพราะ script pin `'sonnet'` เองที่ `analyze-wave.js:20` · ทาง `Agent` tool ไม่แน่นอน
   - **เช็คก่อนเริ่มเวฟด้วย probe subagent จริง** (spawn ไม่ใส่ `model` แล้วให้ตอบบรรทัด "You are powered by the model named …") — `echo $CLAUDE_CODE_SUBAGENT_MODEL` **ใช้ไม่ได้** มันเห็นแค่ env ของ Bash ไม่ใช่ของ spawner
   - ป้าย `ai-model` ในรายงานต้องตรงกับโมเดลที่รันจริง → controller spot-check ทุกใบ
   - หุ้นยาก → worker effort **high** + ปรึกษา `advisor` **ผ่าน courier subagent เท่านั้น** ก่อน spawn แล้วฝังแนวทางลง prompt (**worker เรียกตรง = ห้ามเชิงนโยบาย** ไม่ใช่ "ทำไม่ได้" เพราะ harness ไม่ได้บล็อกให้ · วิธี/เหตุผล `docs/orchestration.md` §2) · courier ล้มเหลว → หยุดถาม user
   - ตัดสิน publish/skip กำกวม → advisor ก่อน (เรียกตรง · courier เมื่อ context ใหญ่จน unavailable) ยังกำกวม → หยุด ping user
3. **(โหมดขนาน) spawn (§3.3)**: 1 หุ้น/agent (กันเลขปนข้ามหุ้น — ตัวร้าย #1) · prompt = `_template/agent-prompt.md` + STEP 0 กัน cwd-stray · คุม effort ต่อ worker → workflow **`analyze-wave`**
   - **★ ข้อห้ามจริงคือ "หลายหุ้นใน 1 run" ไม่ใช่ "หลาย run"** — `stocks[]` ต้องมี **1 ตัวเสมอ** · รันหลาย run ขนานกันได้ (1 หุ้น/run)
   - **จำนวนที่ขนานเป็นดุลพินิจ ไม่ใช่ค่าตายตัว** — ขนานมาก = เสี่ยง rate limit ทั้งชุด (เคยพังจริง) → ramp ขึ้นทีละขั้น เจอ rate limit ให้หาร N ครึ่ง
   - **ก่อนขนานต้องทำ 1 อย่าง: verify/push รายแบตช์ ไม่ใช่รายตัว** (verify เป็น gate ทั้งรีโป ไฟล์ worker ที่ยังเขียนไม่เสร็จจะทำ gate ตกและบล็อกตัวที่ดีแล้ว) · สีแบรนด์/price-flags/tags มี lock แล้ว (`tools/lockfile.js`) — worker รัน pick-brand เองได้
4. **(โหมดทีละตัว) push รายตัว (§3.4)**: worker เสร็จ 1 ตัว → controller ตรวจ → verify + push ทันที (Bash call เดียว §5) ก่อน spawn ตัวถัดไป · จำนวนหุ้นต่อรอบไม่จำกัด · **ห้าม agent push เอง** · ห้าม push ซ้อน session
5. **โควตา (§3.5)**: ของดีไม่พอโควตา → ลดจำนวนเองได้ ไม่ต้องถาม แต่แจ้งเหตุผล (คุณภาพ > โควตา)

---

## 4. Token discipline

ต้นทุนจริง = **จำนวน turn × cache-read** ไม่ใช่ output · กติกา token-lean ต่อหุ้น → **SKILL.md** · เป้า+ตัวเลขวัดจริง → `docs/orchestration.md` §6 + memory `token-usage-benchmarks` · ที่ controller คุมเองเพิ่ม:

- **รันยาวได้ ไม่ต้องหยุดรอ user เปิด session ใหม่** (auto-compact จัดการเอง) · คุมตัวเอง (controller · worker ห้าม push §5): รวม verify+push เป็น Bash เดียว · ไม่อ่านรายงานทั้งไฟล์ · สรุประหว่างเวฟให้สั้น
- pull --rebase + อ่านวันที่ footer "ข้อมูล ณ" ก่อน (`npm run queue -- preflight` ทำให้) — ข้ามหุ้นสด ≤7 วัน (§3.1)
- งาน mechanical → effort medium ผ่าน `analyze-wave` · หุ้นยาก → effort high
- controller **pre-fetch ผ่าน `npm run queue -- prep <SYM>` เสมอ** (รัน prep-stock + median-multiples + EPS screen + snapshot vendor แล้วประกอบ prompt ให้ที่ `.queue/prep/<SYM>.md`) — บรรทัดแรกคือ CROSS-VERIFY verdict, **exit 2 = ราคาขัดแหล่ง >5% ห้าม spawn หยุดถาม user (§2)** · worker ห้ามรัน fetch ซ้ำ/ห้าม WebFetch หน้า financials เอง

---

## 5. [controller] Auto-push (กฎสำคัญ — worker ห้าม push)

หลังวิเคราะห์เสร็จ / แก้ไฟล์ใน `reports/` → **commit + push ขึ้น `main` อัตโนมัติทันที ไม่ต้องถาม**
(commit **ก่อน** pull --rebase เสมอ ไม่งั้น rebase error "Please commit or stash")

```bash
npm run verify                     # 0. quality gate <!-- gen:verify-steps -->18<!-- /gen:verify-steps --> ขั้น — error = ห้าม push
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

- ✅ **งานยากต้องปรึกษา advisor ก่อนลงมือทุกครั้ง** — งานยาก เช่น หุ้นยากตามเกณฑ์ §3.2 · แก้โครงสร้างระบบ (build.js / quality gate / cron / template / CLAUDE.md) · ตัดสิน publish/skip กำกวม · แนวทางใหม่ที่ไม่เคยทำ — controller เรียก `advisor` ตรง · **worker/subagent ห้ามเรียกตรง ต้องผ่าน courier เท่านั้น** (§3.2 · `docs/orchestration.md` §2) — ★ เป็นข้อห้าม **เชิงนโยบาย** ต้องเขียนกำกับใน prompt worker ทุกใบ เพราะ harness **ไม่ได้บล็อกให้** · advisor ใช้ไม่ได้/ล้มเหลว → หยุดถาม user ก่อนลุย
- ⏰ **Time Zone = Asia/Bangkok (UTC+7)** — ทุกการคิด "วันนี้"/ความสด (header · dedup 7 วัน · staleness 45/120 วัน) ใช้เวลาไทย · วันที่ในรายงานใช้ปี พ.ศ.
- ❌ โมเดลนอกกติกา §3.2: **Haiku ทุกขั้น** · **ปล่อย default ไม่ pin `model`** (default ไม่แน่นอน) — Sonnet เป็น default, Opus escalate เฉพาะหุ้นยาก
- ❌ อย่า commit `dist/`, `node_modules/`, `.DS_Store` · อย่าแก้ไฟล์ใน `dist/` ตรง ๆ (แก้ต้นฉบับ)
- ❌ ชื่อไฟล์รายงาน = `<SYMBOL>.html` พิมพ์ใหญ่ ไม่มีเว้นวรรค
- ✅ ทุกรายงานมี disclaimer "ไม่ใช่คำแนะนำการลงทุน" + "ราคา ณ วันที่ + แหล่งที่มา"

---

## 8. Quality gate — ก่อนเผยแพร่ (`npm run verify`)

<!-- gen:verify-steps -->18<!-- /gen:verify-steps --> ขั้น ต้องผ่านทั้งหมดก่อน push (pre-push hook บังคับซ้ำ) · cron ใช้ชุดย่อย `verify:cron` <!-- gen:verify-cron-steps -->5<!-- /gen:verify-cron-steps --> ขั้น (<!-- gen:verify-cron-chain -->`check-reports` → `build` → `build-test` → `engine-exec` → `check-site`<!-- /gen:verify-cron-chain -->) เพราะ unit test ของเครื่องมือล้ม ≠ ราคาพัง:
<!-- gen:verify-chain -->`update-prices-test` → `dead-ticker-test` → `tag-apply-test` → `queue-test` → `docs-test` → `prep-stock-test` → `tags-test` → `report-values-test` → `v2-path-test` → `check-reports` → `self-test` → `ohlc-test` → `ta-engine-test` → `build` → `build-test` → `engine-exec` → `skeleton-test` → `check-site`<!-- /gen:verify-chain --> (check-reports = <!-- gen:counts -->48 error + 20 warning<!-- /gen:counts -->)

> ตัวเลข/ลำดับขั้นในบล็อกนี้ generate ด้วย `node tools/gen-docs.js` จาก `package.json` + `CHECKS` — แก้มือแล้วจะถูกเขียนทับ (`--check` ฟ้องใน gate) · ที่มาของการเอา `self-test`/`docs-test` เข้า gate → `docs/decisions.md` §8

- เร็ว: `npm test -- <SYM>` = check-reports เฉพาะตัวนั้น (ใช้ตอน self-check ก่อนคืนงาน)
- gate ตรวจ **ความสอดคล้อง/ความสด/การอ้างอิง** เท่านั้น — **ตรวจความจริงของราคา/EPS ไม่ได้** (ต้อง cross-source verify §2) และ **ตรวจไม่ได้ว่าสมมติฐาน valuation สมเหตุผลไหม**
- ★ **ชั้น 0 — sanity gate ของ valuation (controller ตรวจเอง)**: cluster check (เซกเตอร์เดียวกัน ≥4 ตัว MOS ทางเดียวกัน |เฉลี่ย| >25% แต่ราคาห่าง consensus ≤15% = **พารามิเตอร์ร่วมพัง หยุด**) · |MOS| >40% ต้องมีวิธีที่ไม่ใช้ (r,g) ยืนยัน · **rf ต้องตรงสกุลกระแสเงินสด** · "2 วิธี" ที่ใช้ (r,g) ชุดเดียวกัน = วิธีเดียว → **`docs/quality-gate.md` ชั้น 0**
- ★ **ผลตอบแทนฉาก 3 ปี (หมวด 6)**: `total% = (เป้า−ราคา)/ราคา` · `%/ปี` = CAGR ของค่านั้น · จุดเข้า = ราคาปัจจุบัน · **ราคาเป้าเป็นสมมติฐาน ห้ามขยับ** · W17 + `patchDerived` ดูแลอัตโนมัติแล้ว แต่ **เงียบเมื่อสามคอลัมน์ไม่สอดคล้องกันเอง** ⇒ ใบพวกนั้นต้องให้คนอ่าน · ฐาน "รวมปันผล" ถอดจากตัวเลขที่โชว์เอง **ห้ามเชื่อคำว่า "รวมปันผล" ใน hint** (skeleton พิมพ์ติดมาทุกใบ)
- ★ **สมอตายวนกลับ (ชั้น 0.4e · `W18`)**: ตัวคูณเป้าหมายที่นิยามจาก**ตัวคูณปัจจุบัน** ("เป้า ~36x เพราะใกล้เคียง P/E ปัจจุบัน") = ขาที่คืนราคาตลาดกลับมาโดยโครงสร้าง บอกถูก/แพงไม่ได้ · เส้นแบ่ง = **"ตัวตั้ง/ตัวคูณมาจากราคา spot วันนี้ไหม"** · **controller ต้อง pre-fetch `node tools/median-multiples.js <SYM>` ให้ worker เสมอ** — คำเตือนใน prompt อย่างเดียวไม่พอ (พิสูจน์แล้ว) · ตัวชี้ที่ตัดสินอัตโนมัติไม่ได้ → `node tools/spotcheck.js <SYM>` (รันคู่ `npm test` ทุกครั้งก่อน commit)
- ★ **หุ้นวัฏจักร/โภคภัณฑ์ (ชั้น 0.4b)**: อัตราส่วนปรับฉาก anchor ที่**ราคาเฉลี่ยหน้าต่าง TTM ไม่ใช่ spot** (คิดรายบริษัท) · **ทุกขาของ FV ต้องเป็นฟังก์ชันของตัวแปรฉาก** — `P/B × BVPS` เป็นสมอตาย ใช้เป็นบริบทได้แต่ห้ามเป็นขา · ตัวคูณกับตัวตั้งต้องนิยามเดียวกัน · EV ต้องใช้ราคาสกุลเดียวกับงบ (แคนาดา = TSX/CAD) · **controller ต้อง pre-fetch ตัวคูณมัธยฐานให้ worker** (`stockanalysis.com/stocks/<SYM>/financials/ratios/`) ไม่งั้น worker จะประมาณเอง
- แก้ check ต้องเพิ่มเคสใน `test/self-test.js` + `npm run test:self` ผ่าน — **ขอบเขต = E-code/W-code ใน `test/check-reports.js` เท่านั้น** (self-test เป็น meta-test ของไฟล์นั้นไฟล์เดียว mutate รายงานจริงแล้วดูว่า check ยิงไหม) · **check ใน `test/check-site.js` ไม่เข้าข้อนี้** เพราะมันตรวจ `dist/` ที่ build แล้ว ไม่มี fixture ให้ mutate — กันตัวเองพังเงียบด้วยกฎ 2 ข้อแทน: (1) ทุก check ที่ดึงค่าด้วย regex ต้องฟ้องเมื่อ **หาไม่เจอ** ไม่ใช่ปล่อยเป็นค่าว่างแล้วผ่าน (2) คลาส CSS ที่เคยรั่วข้ามหน้าจริงต้องอยู่ใน `SHARED_CLASS_PIN`

> **รายละเอียดทุกชั้น/ทุก E-code + เกณฑ์ → `docs/quality-gate.md`**

---

## 9. [controller] Price refresh อัตโนมัติ (cron) + คิว

**ตารางเวลา** — GitHub Actions รัน `tools/update-prices.js` ทุกวัน config ตั้ง **21:00 UTC** (= 04:00 น. ไทยวันถัดไป) · **ห้ามขยับ**: เป็นเวลาที่เร็วที่สุดที่ยังหลัง US close ทั้งฤดู EDT/EST จึงเหลือ margin ฝั่ง SET มากที่สุด · skew จริงของ GitHub ไม่คงที่ ⇒ ไม่มี config ใดปลอดภัย 100% → `docs/price-refresh.md` · ที่มาของการย้ายเวลา (open-item #33) → `docs/decisions.md` §9

**cron patch เฉพาะตัวเลขโครงสร้าง** (ราคา · วันที่ราคา · กราฟ `report-data.chart` (data/min/max/grid/highlight) · MOS · `.chg` · verdict class · `#pxIn` · ป้าย gauge `#mCur` — รายการเปิด ไม่ใช่รายการปิด) แล้ว verify + push เอง · นอกจากนี้ **ยังแตะ**:
- ช่องสรุปส่วนต่างจากราคา **ทั้งช่อง** (คลังคำคงที่ `MOS ~ ±X%` ให้ตรงกับ `.big` — `summaryPlan` = healer #11) + `class` ของกล่อง verdict — สองอย่างนี้ derive จาก MOS ล้วน ๆ จึงไม่นับเป็น prose
- ผลตอบแทนฉาก Bear/Base/Bull ในหมวด 6 + ป้าย "จากจุดเข้า" (`scenarioPlan` — รักษาฐาน "รวมปันผล" และสูตร `%/ปี` ของใบนั้นไว้)
- ปันผล % ในการ์ด + `stock-meta.dividendYield` + P/BV (`yieldPlan`/`pbvPlan` — ตัวหาร DPS/BVPS ที่บรรทัด `.d` พิมพ์เอง · W19/W20 (= error))
- P/E ที่โชว์ในการ์ด + `stock-meta.pe` + % ในการ์ดราคาเป้า + Market Cap + P/S (`patchDerived` — ตัวตั้งคือราคาที่เพิ่ง patch ตัวหาร/ตัวลบคือ EPS/ราคาเป้าที่รายงานพิมพ์เอง จึงไม่มีอะไรให้ cron เดา · E41/E42/E43 บังคับ · P/S อ้างข้ามการ์ด = W16 (= error))

**cron ไม่แตะ**: prose · EPS · FV · ราคาเป้า (เป็นสมมติฐาน) · วันที่วิเคราะห์ (คงเดิมผ่าน preserve-dates) · คำว่าถูก/แพงใน `.txt` ของกล่อง verdict (เป็น prose) · % ของราคาเป้าใน prose **ยังไม่แตะ** (= W15 เตือนให้คนแก้ หรือ `--heal-derived --prose`) · **ตัดสินไม่ได้ = ไม่แตะ** — `yieldPlan`/`pbvPlan`: DPS รายไตรมาส/พิเศษ/ตามแผน/ผลบวกหลายงวด/ยอดรวม/สกุลอื่น/พิมพ์หลักเดียว/หลุดย่าน 0.6–1.67 · `scenarioPlan`: ฉากที่ตัดสินไม่ได้ ตรงกับที่ W17 เงียบเป๊ะ ๆ
- W06 ที่ยังยิงหลัง cron = healer กับ checker ไม่สมมาตร **ต้องแก้โค้ด ไม่ใช่แก้ใบ** · ใบที่ worker เพิ่งเขียน (NEW/UPDATE) อาจยิง W06 จนกว่า cron รอบถัดไปจะซ่อม — ไม่ใช่บั๊กโค้ด

**freeze ลง `price-flags.json` เมื่อ**: ต่าง >15% · MOS พลิกเกิน dead-band ±5 จุด (flip ในย่านไม่ส่ง LLM · ช่องสรุป cron เขียนเอง) · สงสัย split (flip ใน ±5 จุด = patch ผ่าน · หลุดขอบ gauge = ขยายขอบเอง) · patch แล้ว gate ตก (`patch-rejected` — กักกันรายไฟล์ ไม่ล้มทั้งวัน)

- **ใบ v2 (884/908 ใบ ณ 21 ก.ย. 69 · open-items #36): cron แก้ `report-data.values` เท่านั้น** — ราคา/วันที่ราคา/MOS/`.chg`/verdict class/`#pxIn`/ป้าย gauge `#mCur` + ช่องที่ผูก **FV** (`.fv-box .r` · `legend` · `#mFair` · การ์ด "จุดซื้อ MOS 20/30%" · `vcell` "มูลค่าเหมาะสม") เป็น `{{rd:…}}` ที่ `build` render ให้ ⇒ cron **ไม่เขียนสำเนาใน HTML เลย** (13 ช่องนี้ต้องเป็น token เสมอ — pseudo-error `V2TOKENS` บังคับ · เกณฑ์ = cron ไม่มีตัวเขียนให้ · `summary` อยู่นอกรายการเพราะมี `summaryPlan` เขียนให้ — open-items #44) · การ์ดที่ derive จากราคา (P/E · Market Cap · P/S · ปันผล % · P/BV · % เป้า · หมวด 6 ที่ยัง literal) ยังผ่าน `patchDerived` เหมือน v1 แต่ทำบน view ที่ render แล้ว (`derivedPassV2` + keep-map — **token ชนะเสมอ** เมื่อชนกัน) · กระจก `stock-meta` เขียนแค่ `price/mos/upside/fairValue` (**`pe`/`dividendYield` เป็นของ pass derived เหมือน v1**) · เขียนกลับไม่ได้/วันที่ไม่ตรง = `patch-failed` เห็นในคิว ไม่เงียบ · 24 ใบที่ยังเป็น v1 เดินทางเดิมทุก byte → `docs/price-refresh.md` หัวข้อ "ใบ v2"
- **"เคลียร์คิว price-flags"** = runbook `npm run queue -- preflight` → `ship --prepatch` → ต่อหุ้น `prep <SYM>` → spawn worker (pin model) → `postcheck <SYM>` → `ship <SYM>`
  - `ship --prepatch` push ราคาที่ patch ทันที ให้ tree สะอาดก่อน worker เริ่ม (ไม่งั้น commit รายหุ้นจะพา reports.json ของใบข้างเคียงที่ยังไม่ commit ไปด้วย) · **`mos-sign-flip` = bucket PREPATCH จบตรงนี้ ไม่ spawn worker** · preflight ยกเป็น UPDATE-LIGHT เองเมื่ออายุ >90 วัน/งบออกหลังวิเคราะห์ · รอบที่มีแต่ PREPATCH ปิด issue ที่ `ship --prepatch` เลย
  - `ship <SYM>` = verify → commit 1 หุ้น → push · ปิด issue เมื่อคิวว่าง · **runbook นี้ (ทั้ง chain ข้างบน)** คำสั่งเดียวทำ pull/triage ครบทุก reason/pre-patch/prep-stock/มัธยฐาน/EPS screen/snapshot/ประกอบ prompt/gate/spotcheck/verify/commit รายหุ้น/push/ปิด issue — และทุก subcommand ของ runbook **พิมพ์ขั้นที่ยังต้องทำเอง**ทุกครั้ง
  - เกณฑ์ triage ต่อ reason = `tools/queue/triage.js` (queue-test บังคับให้ครบทุก reason) + คำอธิบายใน SKILL STEP 0 · flag ราคาหายเองเมื่อรายงานสด/ไฟล์ถูกลบ · `not-on-exchange` ถอนได้แค่ TradingView เจอ ticker กลับมา · ไฟล์ถูกลบ · หรือ `--alive <SYM>` (`--force` ไม่เคลียร์ — ตั้งใจ)
- **canary หุ้นตาย** — Yahoo ไม่ 404 เวลาหุ้นถูกเพิกถอน มัน serve ราคาค้าง ⇒ drift 0% ⇒ cron จับไม่ได้ · ปิดจุดบอดด้วย flag `not-on-exchange` แบบ **2 ชั้น**: quote ค้าง ≥3 session (pre-filter รายวัน) **และ** TradingView ไม่พบ ticker — **ห้ามใช้ชั้นแรกเดี่ยว ๆ** (`regularMarketTime` ค้างที่ "วันซื้อขายล่าสุด" ⇒ หุ้นสภาพคล่องต่ำโดน false positive) · เสริมด้วย full sweep รายสัปดาห์ `.github/workflows/dead-ticker-canary.yml` · เป็น **ตัวชี้ให้ไปดู ไม่ใช่คำตัดสิน** — ยืนยันแหล่งปฐมภูมิ (SEC Form 25 / ประกาศตลาด) ก่อนลบเสมอ
- **ตลาดยังเปิด = ข้ามตัวนั้น ไม่ patch ไม่ flag** (`isIntradayQuote`) — ราคากลาง session เป็น intraday ไม่ใช่ราคาปิด · cron ตั้งเวลาไว้หลังตลาดปิดอยู่แล้วจึงไม่กระทบ แต่ **รันมือ/`workflow_dispatch` ตอนเย็นไทย = กลาง session US จะเห็น "ข้ามเพราะตลาดเปิด N"** (ไม่ใช่ของเสีย) · `--force`/`--alive`/`--allow-intraday` ข้าม guard นี้ ⇒ re-analysis ตาม SKILL ยังประทับราคาได้ตามปกติ · v8 chart ไม่มี `marketState` จริง — ใช้ `currentTradingPeriod` 2 เงื่อนไข → `docs/price-refresh.md`
- **ticker เปลี่ยนชื่อ** (เช่น BKI→BKIH) → `tools/symbol-map.json` **+ ย้าย key เดิมใน `tags.json` ด้วย `node tools/tag-apply.js --rename <OLD> <NEW>`** (ไม่ทำ = tag เดิมค้างใต้ ticker เก่าที่ไม่มีรายงานแล้ว → corpus check ใน `test/tags-test.js` ฟ้อง) · canary โครงแหล่งข้อมูลรายสัปดาห์ = `.github/workflows/fundamentals-canary.yml` · debug → `docs/price-refresh.md`

## 10. Template system + counters (สรุป)

- **รายงาน = content-only template** — CSS/engine อยู่ใน `_template/` build `expandReport()` inject ตอน build · ไฟล์เก็บแค่ `report-data` (กราฟ/gauge/theme) + เนื้อหา 8 section · เริ่มจาก `_template/skeleton-{th,us}.html` · สีแบรนด์ต่อหุ้น (`tools/seeds.json` + `brandtheme.js`) → **`docs/templates.md`** · **รายงาน v2: ตัวเลขผูกราคาอยู่ใน `report-data.values` — แก้ด้วย `apply-edits --set` · prose ใช้ `{{rd:…}}`** · `tools/pick-brand.js` อ่าน→ตรวจชน→เขียน `seeds.json` ใต้ lock (`tools/lockfile.js`) — worker ขนานรันเองได้ตาม SKILL 5A (ที่มา/เคสก่อนมี lock → `docs/decisions.md` §10)
- **GUI brand-forward** — ระบบดีไซน์ทั้งหมด → **`DESIGN.md`** · สาระที่ห้ามหลุด: **font = Sarabun + IBM Plex Mono เท่านั้น** (เจ้าของสั่งถอด Kanit กลับ — **ห้ามเปลี่ยน typeface โดยไม่ถาม**) · โทเคนสี derive จาก accent ตอน build (`deriveTheme()` ใน build.js — สูตร/คู่ contrast ที่ E38 คุม ดู DESIGN.md) · **ตัวหนังสือขาวห้ามวางบน accent ดิบ ให้ใช้ accentDark/badge เท่านั้น** · การตกแต่งทุกอย่าง inject ตอน build — **ห้ามแก้ไฟล์รายงานเพื่อเรื่องดีไซน์** · สถิติ+โหวตของหน้ารายงานอยู่ในการ์ดบน header (`injectHeaderStats`) ไม่ใช่ footer แล้ว
- **view/vote counters** = Worker + Durable Object (`src/worker.js`) inject ตอน build เฉพาะ `dist/` → **`docs/counters.md`** + `DEPLOY.md`
- **กราฟ TA (TradingView-style)** = Worker route `/api/ohlc` proxy Yahoo + client engine (`_template/ta-engine.js`/`ta-chart.js`) + bundle inject ตอน build เฉพาะ `dist/` → **`docs/ta-chart.md`**
- **ระบบ tag ธีมการลงทุน** — `tags-vocab.json` (คลังที่อนุมัติแล้ว) + `tags.json` (symbol → slug) inject ตอน build ลง `dist/` เท่านั้น · **ห้ามเขียน tag ลงไฟล์รายงาน** (freshHash จะทำให้ `updated` ของทุกไฟล์เด้งพร้อมกัน → พังการเรียงหน้าแรก + dedup 7 วัน + staleness) · **`tools/tag-apply.js` เป็นทางเข้าเดียวที่เขียน `tags.json`** ห้ามแก้มือ ห้าม worker เขียนเอง (ให้ controller เป็นคนเขียนเพื่อทบทวน tag ทุกครั้งก่อนลง tags.json — worker คืนบรรทัด `TAGS:` แทน) · lifecycle: NEW ติดใหม่ · UPDATE ทบทวนบังคับ (ค่าตั้งต้นคงเดิม) · UPDATE-LIGHT + cron ราคา **ไม่แตะ** · rename → `--rename` · ลบรายงาน → `--prune` → **`docs/templates.md`**
