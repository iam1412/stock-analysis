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

เมื่อสั่ง "วิเคราะห์ X" / re-analysis / เคลียร์คิว price-flags → เรียก skill **`stock-analyzer`** แล้ว**ทำตามทุกขั้น** → `npm run verify` ผ่าน 8 ขั้น → **Auto-push** (§5)

invariant ที่ห้ามหลุดไม่ว่ากรณีใด:
- **cross-source verify ราคา+EPS ≥2 แหล่งก่อนเขียนตัวเลข** — ราคาต่าง >5% / EPS ขัดกัน → หยุด ถามผู้ใช้ อย่าเผยแพร่ (gate ตรวจความจริงไม่ได้)
- **หุ้นใหม่เริ่มจาก skeleton เท่านั้น · หุ้นเดิมห้าม rewrite** — กราฟ/ราคา/ป้าย % มาจาก script ห้ามแต่งเอง
- ไฟล์ = `reports/<SYMBOL>.html` พิมพ์ใหญ่ · `stock-meta.currency` = ISO (`USD`/`THB`)

> URL: `https://stock-ai.dotent.workers.dev/<SYMBOL>.html` (หรือ `/<SYMBOL>`)

---

## 3. วิเคราะห์หลายตัว / เป็นกลุ่ม (parallel agents)

ใช้เมื่อสั่งหลายตัวหรือธีม · **รายละเอียด+เหตุผลทั้งหมด → `docs/orchestration.md`** · invariant ที่ห้ามหลุด:

1. **ก่อนเริ่ม**: `git pull --rebase origin main` → อ่าน `reports.json` — สด ≤7 วัน **ไม่ทำซ้ำ** (ธีม→หาตัวแทน · ระบุชื่อ→ข้ามพร้อมแจ้ง) · เกิน 7 วัน = UPDATE · ยังไม่มี = NEW
2. **โมเดล**: ❌ Haiku ทุกขั้น · **Sonnet ทุกชั้น** (Opus ยกเลิกทั้งหมด 13 ก.ค. 69) · หุ้นยาก (IPO <1 ปี/spinoff/split/cyclical/pre-profit/ราคา cross-source ต่าง >5%) → worker effort **high** + ปรึกษา `advisor` **ผ่าน courier subagent เท่านั้น** ก่อน spawn แล้วฝังแนวทางลง prompt (เรียกตรง = unavailable เสมอ — วิธี/เหตุผล `docs/orchestration.md` §2 · courier ล้มเหลว → หยุดถาม user) · ตัดสิน publish/skip กำกวม → advisor (courier) ก่อน ยังกำกวม → หยุด ping user
3. **spawn**: 1 หุ้น/agent (กันเลขปนข้ามหุ้น — ตัวร้าย #1) · **sequential เท่านั้น** (parallel เคยชน rate limit ทั้งเวฟ) · prompt = `_template/agent-prompt.md` + STEP 0 กัน cwd-stray · คุม effort ต่อ worker → workflow **`analyze-wave`** · **ห้ามรัน analyze-wave ซ้อน — 1 run ต่อครั้ง** รอ run เดิมจบก่อน
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
npm run verify                     # 0. quality gate 8 ขั้น — error = ห้าม push
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
- ❌ โมเดลนอกกติกา §3.2 (Haiku ทุกขั้น / Opus) — Sonnet ทุกชั้นเท่านั้น
- ❌ อย่า commit `dist/`, `node_modules/`, `.DS_Store` · อย่าแก้ไฟล์ใน `dist/` ตรง ๆ (แก้ต้นฉบับ)
- ❌ ชื่อไฟล์รายงาน = `<SYMBOL>.html` พิมพ์ใหญ่ ไม่มีเว้นวรรค
- ✅ ทุกรายงานมี disclaimer "ไม่ใช่คำแนะนำการลงทุน" + "ราคา ณ วันที่ + แหล่งที่มา"

---

## 8. Quality gate — ก่อนเผยแพร่ (`npm run verify`)

8 ขั้น ต้องผ่านทั้งหมดก่อน push (pre-push hook บังคับซ้ำ):
`check-reports` (38 error + 11 warning) → `ohlc-test` → `ta-engine-test` → `build` → `build-test` → `engine-exec` → `skeleton-test` → `check-site`

- เร็ว: `npm test -- <SYM>` = check-reports เฉพาะตัวนั้น (ใช้ตอน self-check ก่อนคืนงาน)
- gate ตรวจ **ความสอดคล้อง/ความสด/การอ้างอิง** เท่านั้น — **ตรวจความจริงของราคา/EPS ไม่ได้** (ต้อง cross-source verify §2)
- แก้ check ต้องเพิ่มเคสใน `test/self-test.js` + `npm run test:self` ผ่าน

> **รายละเอียดทุกชั้น/ทุก E-code + เกณฑ์ → `docs/quality-gate.md`**

---

## 9. Price refresh อัตโนมัติ (cron)

GitHub Actions รัน `tools/update-prices.js` ทุกวัน 07:17 น. ไทย — patch **เฉพาะตัวเลขโครงสร้าง** (**ไม่แตะ prose/EPS/FV** · วันที่วิเคราะห์คงเดิมผ่าน preserve-dates) แล้ว verify + push เอง · freeze ลง `price-flags.json` เมื่อ: ต่าง >15% / MOS พลิกเกิน dead-band ±3 จุด / สงสัย split (flip ใน ±3 จุด = patch ผ่าน · หลุดขอบ gauge = ขยายขอบเอง)
- **"เคลียร์คิว price-flags"** = **triage ตาม `reason` ก่อน** (เกณฑ์เต็มใน SKILL STEP 0: fetch/patch-failed = plumbing ไม่ใช้ agent · drift/mos-flip = **UPDATE-LIGHT** · suspect-split = UPDATE เต็ม · **not-on-exchange = ยืนยันเพิกถอนด้วยมือแล้วลบรายงาน ห้าม re-analyze**) แล้วรันตาม §3 — flag ราคาหายเองเมื่อรายงานสด/ไฟล์ถูกลบ · `not-on-exchange` ถอนได้แค่ตอน TradingView เจอ ticker กลับมา หรือไฟล์ถูกลบ (re-analysis ไม่เคลียร์)
- **canary หุ้นตาย (เพิ่ม 8 ส.ค. 2569)** — Yahoo ไม่ 404 เวลาหุ้นถูกเพิกถอน มัน serve ราคาค้าง ⇒ drift 0% ⇒ cron ไม่เคยจับได้ (เคส EA/BPP) · ปิดจุดบอดด้วย flag `not-on-exchange` แบบ **2 ชั้น**: quote ค้าง ≥3 session (pre-filter รายวัน) **และ** TradingView ไม่พบ ticker — ห้ามใช้ชั้นแรกเดี่ยว ๆ (วัดแล้ว: `regularMarketTime` ค้างที่ "วันซื้อขายล่าสุด" ⇒ หุ้นสภาพคล่องต่ำโดน false positive 99/248 วัน) · เสริมด้วย full sweep รายสัปดาห์ `.github/workflows/dead-ticker-canary.yml` · เป็น **ตัวชี้ให้ไปดู ไม่ใช่คำตัดสิน** — ยืนยันแหล่งปฐมภูมิ (SEC Form 25 / ประกาศตลาด) ก่อนลบเสมอ
- ticker เปลี่ยนชื่อ (เช่น BKI→BKIH) → `tools/symbol-map.json` · canary โครงแหล่งข้อมูลรายสัปดาห์ = `.github/workflows/fundamentals-canary.yml` · รายละเอียด/debug → `docs/price-refresh.md`

## 10. Template system + counters (สรุป)

- **รายงาน = content-only template** — CSS/engine อยู่ใน `_template/` build `expandReport()` inject ตอน build · ไฟล์เก็บแค่ `report-data` (กราฟ/gauge/theme) + เนื้อหา 8 section · เริ่มจาก `_template/skeleton-{th,us}.html` · สีแบรนด์ต่อหุ้น (`tools/seeds.json` + `brandtheme.js`) → **`docs/templates.md`**
- **view/vote counters** = Worker + Durable Object (`src/worker.js`) inject ตอน build เฉพาะ `dist/` → **`docs/counters.md`** + `DEPLOY.md`
- **กราฟ TA (TradingView-style)** = Worker route `/api/ohlc` proxy Yahoo + client engine (`_template/ta-engine.js`/`ta-chart.js`) + bundle inject ตอน build เฉพาะ `dist/` → **`docs/ta-chart.md`**
