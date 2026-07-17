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
reports.json            # manifest (build เขียนเอง, committed — track วันที่/hash) ห้ามแก้มือ
tools/  test/  docs/    # เครื่องมือ / quality gate / เอกสารอ้างอิง
wrangler.toml _headers  # Workers Static Assets / HTTP headers
dist/                   # ⚠️ build output (gitignore) — ห้ามแก้มือ
```

**ห้ามแก้มือ** (build สร้างเอง): `dist/` ทั้งโฟลเดอร์ · `reports.json` · landing/การ์ด/footer/ช่องค้นหา (อยู่ใน template ของ `build.js` — แก้ที่นั่น) · หน้า index เรียง **อัปเดตล่าสุดขึ้นก่อน** อัตโนมัติ

---

## 2. วิเคราะห์หุ้นเดี่ยว (skill `stock-analyzer`)

เมื่อสั่ง "วิเคราะห์ X" / re-analysis / เคลียร์คิว price-flags → เรียก skill **`stock-analyzer`** แล้ว**ทำตามทุกขั้น**
(skill = single source of truth: โหมด NEW/UPDATE/UPDATE-LIGHT · script เก็บข้อมูล · FV ≥2 วิธี · MOS/scenario · 4 บล็อกบังคับ · self-check) → `npm run verify` ผ่าน 6 ขั้น → **Auto-push** (§5)

invariant ที่ห้ามหลุดไม่ว่ากรณีใด:
- **cross-source verify ราคา+EPS ≥2 แหล่งก่อนเขียนตัวเลข** — ราคาต่าง >5% / EPS ขัดกัน → หยุด ถามผู้ใช้ อย่าเผยแพร่ (gate ตรวจความจริงไม่ได้)
- **หุ้นใหม่เริ่มจาก skeleton เท่านั้น · หุ้นเดิมห้าม rewrite** — กราฟ/ราคา/ป้าย % มาจาก script ห้ามแต่งเอง
- ไฟล์ = `reports/<SYMBOL>.html` พิมพ์ใหญ่ · `stock-meta.currency` = ISO (`USD`/`THB`)

> URL: `https://stock-ai.dotent.workers.dev/<SYMBOL>.html` (หรือ `/<SYMBOL>`)

---

## 3. วิเคราะห์หลายตัว / เป็นกลุ่ม (parallel agents)

ใช้เมื่อสั่งหลายตัวหรือธีม · **รายละเอียด+เหตุผลทั้งหมด → `docs/orchestration.md`** · invariant ที่ห้ามหลุด:

1. **ก่อนเริ่ม**: `git pull --rebase origin main` → อ่าน `reports.json` — สด ≤7 วัน **ไม่ทำซ้ำ** (ธีม→หาตัวแทน · ระบุชื่อ→ข้ามพร้อมแจ้ง) · เกิน 7 วัน = UPDATE · ยังไม่มี = NEW
2. **โมเดล**: ❌ Haiku ทุกขั้น · **Sonnet ทุกชั้น** (controller+worker — ยกเลิก Opus ทั้งหมด 13 ก.ค. 2569) · หุ้นยาก (IPO <1 ปี/spinoff/split/cyclical/pre-profit/ราคา cross-source ต่าง >5%) → worker = Sonnet **effort high** + controller ปรึกษา `advisor` **ผ่าน courier subagent เท่านั้น** ก่อน spawn แล้วฝังแนวทางลง prompt (❌ ห้าม controller/worker เรียก advisor ตรง — advisor มีเพดาน transcript ~25k token เรียกจาก context งานจริงจะ unavailable เสมอ · วิธีเต็ม docs/orchestration.md §2 · courier ล้มเหลว → หยุดถาม user) · ตัดสิน publish/skip กำกวม → advisor (courier) ก่อน ยังกำกวม → หยุด ping user
3. **spawn**: 1 หุ้น/agent (context แยก กันเลขปนข้ามหุ้น — ตัวร้าย #1) · **sequential เท่านั้น** — spawn → รอเสร็จ → ตรวจ → ตัวถัดไป (parallel เคยพัง rate limit พร้อมกันทั้งเวฟ) · ใช้ prompt `_template/agent-prompt.md` + STEP 0 กัน cwd-stray · จะคุม effort ต่อ worker → workflow **`analyze-wave`** (docs/orchestration.md) · **ห้ามรัน analyze-wave ซ้อนกัน — 1 run ในเวลาเดียวเท่านั้น** (รอ run เดิมจบก่อนค่อยเรียก call ถัดไป)
4. **push รายตัว**: worker เสร็จ 1 ตัว → controller ตรวจ → verify + push หุ้นนั้นทันที (รวมเป็น Bash call เดียว §5) ก่อน spawn ตัวถัดไป · **จำนวนหุ้นต่อรอบไม่จำกัด** (ยกเลิก "เวฟละ ≤3" 12 ก.ค. 2569 — sequential + push รายตัวจำกัด blast radius = 1 หุ้นให้แล้ว) · ห้าม agent push เอง · ห้าม push ซ้อน session
5. ของดีไม่พอโควตา → ลดจำนวนเองได้ ไม่ต้องถาม แต่แจ้งเหตุผล (คุณภาพ > โควตา)

---

## 4. Token discipline

วัดจริง 12 ก.ค. 2569: ต้นทุน = **จำนวน turn × ~70k cache-read ของ worker** ไม่ใช่ output — กติกา token-lean **ต่อหุ้น** (batch tool calls · script แทน WebFetch · UPDATE-LIGHT · self-check ครั้งเดียว) อยู่ใน **SKILL.md แล้ว** · เป้า+ตัวเลข → `docs/orchestration.md` §7 · ที่ controller ต้องคุมเองเพิ่ม:

- **รันยาวได้ ไม่ต้องหยุดรอ user เปิด session ใหม่** (ยกเลิก chunk ≤10 หุ้น/session — 13 ก.ค. 2569 user เคาะ: ปล่อย auto-compact จัดการ context เอง) · ข้อเท็จจริงต้นทุน: cacheR/turn ของ controller โตตาม context (วัดจริง ~70k → ~139k ตอน 25 ตัวรวด) — controller ช่วยได้โดยคุมตัวเอง: รวม verify+push เป็น Bash เดียว · ไม่อ่านรายงานทั้งไฟล์ · สรุประหว่างเวฟให้สั้น
- pull --rebase + อ่าน `reports.json` ก่อน — ข้ามหุ้นสด ≤7 วัน = ประหยัด 100% ของตัวนั้น
- ทุกชั้น = Sonnet (§3.2) · worker งาน mechanical → effort medium ผ่าน `analyze-wave` · หุ้นยาก → effort high
- controller **pre-fetch `fetch-fundamentals` เสมอ** แล้ววางบล็อกใน `{{FUNDAMENTALS}}` ของ agent-prompt (output มีงบ 5 ปีแล้ว — จูนรอบ 5) — worker ห้ามรันซ้ำ/ห้าม WebFetch หน้า financials เอง

---

## 5. Auto-push (กฎสำคัญ)

หลังวิเคราะห์เสร็จ / แก้ไฟล์ใน `reports/` → **commit + push ขึ้น `main` อัตโนมัติทันที ไม่ต้องถาม**
(commit **ก่อน** pull --rebase เสมอ ไม่งั้น rebase error "Please commit or stash")

```bash
npm run verify                     # 0. quality gate 6 ขั้น — error = ห้าม push
git add -A                         # 1.
git commit -m "<message>"          # 2.
git pull --rebase origin main      # 3. sync
git push origin HEAD:main          # 4. ★ worktree ต้องใช้ HEAD:main (ไม่ใช่ 'main' เปล่า)
```

มี `pre-push` hook (`.githooks/pre-push`) บังคับ verify ซ้ำ 6 ขั้น (เปิดครั้งเดียว: `git config core.hooksPath .githooks`) · รวมทั้ง 5 ขั้นเป็นคำสั่งเดียวด้วย `&&` ได้ — push รายตัวโดยไม่เพิ่ม turn ของ controller

**commit message:** **1 commit = 1 หุ้น** (push รายตัว §3.4) — หุ้นใหม่ `analyze: add <SYMBOL> stock analysis` · อัปเดต `analyze: update <SYMBOL> …` (เลิกใช้ commit รวม `analyze: add A, B, C` ตั้งแต่ 12 ก.ค. 2569) · ลงท้าย:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```
> ขอบเขต auto-push = งานใน `reports/` · แก้โครงสร้างระบบ (build.js, wrangler.toml, CLAUDE.md, docs/) → สรุปก่อน push ตามปกติ

---

## 6. Build & Deploy

- **Build:** `npm run build` (= `node build.js`) — ไม่มี dependency, Node ≥18
- **Deploy:** Cloudflare รัน build + `wrangler deploy` อัตโนมัติเมื่อ push เข้า `main` · เว็บนี้เป็น **Worker (Static Assets)** ไม่ใช่ Pages — อย่าใช้ `wrangler pages deploy` (ดู `DEPLOY.md`)

---

## 7. ข้อห้าม / ข้อควรระวัง

- ⏰ **Time Zone = Asia/Bangkok (UTC+7)** — ทุกการคิด "วันนี้"/ความสด (header · dedup 7 วัน · staleness 45/120 วัน) ใช้เวลาไทย · วันที่ในรายงานใช้ปี พ.ศ.
- ❌ **ห้าม Haiku** ทุกขั้น · ❌ **ไม่ใช้ Opus แล้ว** — Sonnet ทุกชั้น หุ้นยาก = advisor + effort high (§3.2 + memory `model-config-rules`)
- ❌ อย่า commit `dist/`, `node_modules/`, `.DS_Store` · อย่าแก้ไฟล์ใน `dist/` ตรง ๆ (แก้ต้นฉบับ)
- ❌ ชื่อไฟล์รายงาน = `<SYMBOL>.html` พิมพ์ใหญ่ ไม่มีเว้นวรรค
- ✅ ทุกรายงานมี disclaimer "ไม่ใช่คำแนะนำการลงทุน" + "ราคา ณ วันที่ + แหล่งที่มา"

---

## 8. Quality gate — ก่อนเผยแพร่ (`npm run verify`)

6 ขั้น ต้องผ่านทั้งหมดก่อน push (pre-push hook บังคับซ้ำ):
`check-reports` (38 error + 11 warning) → `build` → `build-test` → `engine-exec` → `skeleton-test` → `check-site`

- เร็ว: `npm test -- <SYM>` = check-reports เฉพาะตัวนั้น (ใช้ตอน self-check ก่อนคืนงาน)
- gate ตรวจ **ความสอดคล้อง/ความสด/การอ้างอิง** เท่านั้น — **ตรวจความจริงของราคา/EPS ไม่ได้** (ต้อง cross-source verify §2)
- แก้ check ต้องเพิ่มเคสใน `test/self-test.js` + `npm run test:self` ผ่าน

> **รายละเอียดทุกชั้น/ทุก E-code + env threshold → `docs/quality-gate.md`**

---

## 9. Price refresh อัตโนมัติ (cron)

GitHub Actions รัน `tools/update-prices.js` ทุกวัน 07:17 น. ไทย — patch **เฉพาะตัวเลขโครงสร้าง** (**ไม่แตะ prose/EPS/FV** · วันที่วิเคราะห์คงเดิมผ่าน preserve-dates) แล้ว verify + push เอง · ตัวที่ขยับแรง (ต่าง >15% / MOS พลิก / หลุด gauge / สงสัย split) → **freeze** ลง `price-flags.json` รอ re-analysis
- **"เคลียร์คิว price-flags"** = **triage ตาม `reason` ก่อน** (เกณฑ์เต็มใน SKILL STEP 0: fetch/patch-failed = plumbing ไม่ใช้ agent · drift/mos-flip/gauge = **UPDATE-LIGHT** · suspect-split = UPDATE เต็ม) แล้วรันตาม §3 — flag หายเองเมื่อรายงานสด/ไฟล์ถูกลบ
- ticker เปลี่ยนชื่อ (เช่น BKI→BKIH) → `tools/symbol-map.json` · รายละเอียด/debug → `docs/price-refresh.md`

## 10. Template system + counters (สรุป)

- **รายงาน = content-only template** — CSS/engine อยู่ใน `_template/` build `expandReport()` inject ตอน build · ไฟล์เก็บแค่ `report-data` (กราฟ/gauge/theme) + เนื้อหา 8 section · เริ่มจาก `_template/skeleton-{th,us}.html` · สีแบรนด์ต่อหุ้น (`tools/seeds.json` + `brandtheme.js`) → **`docs/templates.md`**
- **view/vote counters** = Worker + Durable Object (`src/worker.js`) inject ตอน build เฉพาะ `dist/` → **`docs/counters.md`** + `DEPLOY.md`
