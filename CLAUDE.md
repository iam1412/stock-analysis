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

เมื่อสั่ง "วิเคราะห์ GOOGL" / "analyze AAPL" / re-analysis / เคลียร์คิว price-flags:

1. เรียก skill **`stock-analyzer`** (project skill — `.claude/skills/stock-analyzer/SKILL.md`) แล้ว**ทำตามทุกขั้น** —
   นั่นคือ single source of truth ของขั้นตอนต่อหุ้น: เลือกโหมด NEW (skeleton) / UPDATE (แก้ไฟล์เดิมเฉพาะจุด) /
   UPDATE-LIGHT (refresh เร็วจากคิว price-flags) · เก็บข้อมูลผ่าน script (`fetch-facts.js` /
   `update-prices.js --force` / `fetch-fundamentals.js` = EPS/เป้า 2 แหล่งในคำสั่งเดียว) · cross-source verify ·
   FV ≥2 วิธี · MOS/scenario · 4 บล็อกบังคับ · self-check `npm test -- <SYM>`
2. invariant ที่ห้ามหลุดไม่ว่ากรณีใด (สรุปจาก skill — รายละเอียดในนั้น):
   - **cross-source verify ราคา+EPS ≥2 แหล่งก่อนเขียนตัวเลข** — ราคาต่าง >5% / EPS ขัดกัน → หยุด ถามผู้ใช้ อย่าเผยแพร่ (gate ตรวจความจริงไม่ได้)
   - **หุ้นใหม่เริ่มจาก skeleton เท่านั้น · หุ้นเดิม = UPDATE mode ห้าม rewrite** — กราฟ/ราคา/ป้าย % มาจาก script ห้ามแต่งเอง
   - ไฟล์ = `reports/<SYMBOL>.html` พิมพ์ใหญ่ · `stock-meta.currency` = ISO (`USD`/`THB`)
3. `npm run verify` ให้ผ่านครบ 6 ขั้น
4. **Auto-push** (§5)

> URL: `https://stock-ai.dotent.workers.dev/<SYMBOL>.html` (หรือ `/<SYMBOL>`)

---

## 3. วิเคราะห์หลายตัว / เป็นกลุ่ม (parallel agents)

ใช้เมื่อสั่งหลายตัวหรือธีม · **รายละเอียด+เหตุผลทั้งหมด → `docs/orchestration.md`** · invariant ที่ห้ามหลุด:

1. **ก่อนเริ่ม**: `git pull --rebase origin main` → อ่าน `reports.json` — สด ≤7 วัน **ไม่ทำซ้ำ** (ธีม→หาตัวแทน · ระบุชื่อ→ข้ามพร้อมแจ้ง) · เกิน 7 วัน = UPDATE · ยังไม่มี = NEW
2. **โมเดล**: ❌ Haiku ทุกขั้น · default = **All-Sonnet** (controller+worker) · หุ้นยาก (IPO <1 ปี/spinoff/split/cyclical/ราคา cross-source ต่าง >5%) → escalate worker ตัวนั้นเป็น **Opus** อัตโนมัติ · ตัดสิน publish/skip กำกวม → หยุด ping user
3. **spawn**: 1 หุ้น/agent (context แยก กันเลขปนข้ามหุ้น — ตัวร้าย #1) · **sequential เท่านั้น** — spawn → รอเสร็จ → ตรวจ → ตัวถัดไป (parallel เคยพัง rate limit พร้อมกันทั้งเวฟ) · ใช้ prompt `_template/agent-prompt.md` + STEP 0 กัน cwd-stray · จะคุม effort ต่อ worker → workflow **`analyze-wave`** (docs/orchestration.md)
4. **เวฟละ ≤3** → verify + push รวมครั้งเดียว/เวฟ (`analyze: add A, B, C`) · ห้าม agent push เอง · ห้าม push ซ้อนเวฟ/ซ้อน session
5. ของดีไม่พอโควตา → ลดจำนวนเองได้ ไม่ต้องถาม แต่แจ้งเหตุผล (คุณภาพ > โควตา)

---

## 4. Token discipline — วิเคราะห์ให้ใช้ token ถูกลง

วัดจริง (12 ก.ค. 2569): ต้นทุนใหญ่สุดคือ **input/cache-read ~70k ต่อ turn ของ worker** — ไม่ใช่ output (worker เฉลี่ย ~25-30 turns = cache-read ~2M/ตัว vs output แค่ ~3-4k) · 7 levers:

1. **จำนวน turn = ต้นทุนอันดับหนึ่ง** — batch tool calls ที่อิสระกันใน**ข้อความเดียว** (script 2 ตัว + อ่านไฟล์ = 1 turn) · Edit หลายจุดพร้อมกัน · self-check `npm test -- <SYM>` **ครั้งเดียวตอนจบ** (จับ E13/E28/E29/E32 → ตัดรอบ verify เสียเปล่าทั้งเวฟ)
2. **ตัวเลขโครงสร้าง = script ไม่ใช่ LLM** — ราคา/กราฟ/ป้าย %/สี: หุ้นใหม่ `node tools/fetch-facts.js <SYM> [--th]` · หุ้นเดิม `node tools/update-prices.js --write --force <SYM>` (patch ให้เลย) — 0 token, ไม่มี error กราฟ (E36/E37)
3. **EPS/เป้า/ปันผล 2 แหล่งในคำสั่งเดียว** — `node tools/fetch-fundamentals.js <SYM> [--th]` (Yahoo+StockAnalysis + บรรทัด Δ เทียบให้) แทน WebFetch 2-3 turns · WebFetch targeted เป็น fallback เมื่อ script ล่ม — ห้าม dump หน้าเต็ม
4. **หุ้นเดิม = UPDATE แก้เฉพาะจุด ห้าม rewrite** · มาจากคิว price-flags = **UPDATE-LIGHT** (SKILL STEP 5C — เป้า ≤10 turns) · EPS ไม่เปลี่ยน (±2%) → FV เดิมยืน ไม่ต้องคิดใหม่
5. **Compact / fresh session ทุก 1–2 เวฟ** — สลัด context หุ้นเก่า (controller พอกเร็ว)
6. **pull --rebase + อ่าน reports.json ก่อน** — ข้ามหุ้นสด ≤7 วัน = ประหยัด 100% ของตัวนั้น
7. **All-Sonnet + escalate ตัวยากเป็น Opus subagent** — อย่ารัน Opus เป็น main (W31 กิน ~15% ของลิมิต 5 ชม. กับ 3 หุ้น) · worker งาน mechanical → effort medium ผ่าน workflow `analyze-wave`

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

มี `pre-push` hook (`.githooks/pre-push`) บังคับ verify ซ้ำ 6 ขั้น (เปิดครั้งเดียว: `git config core.hooksPath .githooks`)

**commit message:** หุ้นใหม่ `analyze: add <SYMBOL> stock analysis` · อัปเดต `analyze: update <SYMBOL> …` · หลายตัว `analyze: add A, B, C …` · ลงท้าย:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
> ขอบเขต auto-push = งานใน `reports/` · แก้โครงสร้างระบบ (build.js, wrangler.toml, CLAUDE.md, docs/) → สรุปก่อน push ตามปกติ

---

## 6. Build & Deploy

- **Build:** `npm run build` (= `node build.js`) — ไม่มี dependency, Node ≥18
- **Deploy:** Cloudflare รัน build + `wrangler deploy` อัตโนมัติเมื่อ push เข้า `main` · เว็บนี้เป็น **Worker (Static Assets)** ไม่ใช่ Pages — อย่าใช้ `wrangler pages deploy` (ดู `DEPLOY.md`)

---

## 7. ข้อห้าม / ข้อควรระวัง

- ⏰ **Time Zone = Asia/Bangkok (UTC+7)** — ทุกการคิด "วันนี้"/ความสด (header · dedup 7 วัน · staleness 45/120 วัน) ใช้เวลาไทย · วันที่ในรายงานใช้ปี พ.ศ.
- ❌ **ห้าม Haiku** ทุกขั้น · ค่าเริ่มต้น = All-Sonnet main + escalate Opus (§3.2 + memory `model-config-rules`)
- ❌ อย่า commit `dist/`, `node_modules/`, `.DS_Store` · อย่าแก้ไฟล์ใน `dist/` ตรง ๆ (แก้ต้นฉบับ)
- ❌ ชื่อไฟล์รายงาน = `<SYMBOL>.html` พิมพ์ใหญ่ ไม่มีเว้นวรรค
- ✅ ทุกรายงานมี disclaimer "ไม่ใช่คำแนะนำการลงทุน" + "ราคา ณ วันที่ + แหล่งที่มา"

---

## 8. Quality gate — ก่อนเผยแพร่ (`npm run verify`)

6 ขั้น ต้องผ่านทั้งหมดก่อน push (pre-push hook บังคับซ้ำ):
`check-reports` (source ทีละไฟล์ 37 error + 11 warning) → `build` → `build-test` (unit-test build.js) → `engine-exec` (รัน engine ใน mock DOM) → `skeleton-test` (โครงต้นแบบ) → `check-site` (dist/ ระดับเว็บ)

- เร็ว: `npm test -- <SYM>` = check-reports เฉพาะตัวนั้น (ใช้ตอน self-check ก่อนคืนงาน)
- gate ตรวจ **ความสอดคล้อง/ความสด/การอ้างอิง** เท่านั้น — **ตรวจความจริงของราคา/EPS ไม่ได้** (ต้อง cross-source verify §2)
- แก้ check ต้องเพิ่มเคสใน `test/self-test.js` + `npm run test:self` ผ่าน

> **รายละเอียดทุกชั้น/ทุก E-code + env threshold → `docs/quality-gate.md`**

---

## 9. Price refresh อัตโนมัติ (cron)

GitHub Actions (`.github/workflows/update-prices.yml`) รัน `tools/update-prices.js` ทุกวัน 07:17 น. ไทย —
ดึงราคา Yahoo มา patch **เฉพาะตัวเลขโครงสร้าง** (ราคา header + วันที่ราคา + กราฟ 13 จุด + ป้าย % รอบปี + gauge.cur + MOS + pxIn + stock-meta) แล้ว verify + push เอง · **ไม่แตะ prose/EPS/FV** · `updated` (วันที่วิเคราะห์) คงเดิมผ่าน preserve-dates
- ตัวที่ขยับแรง (ต่าง >15% / MOS พลิกเครื่องหมาย / หลุด gauge / สงสัย split) → **freeze** ลง `price-flags.json` + GitHub Issue รอ re-analysis
- **"เคลียร์คิว price-flags"** = **triage ตาม `reason` ก่อน** (เกณฑ์เต็มใน SKILL STEP 0):
  `fetch/patch-failed` → plumbing ไม่ใช้ agent (ticker เปลี่ยน → `tools/symbol-map.json` · เพิกถอน → ลบรายงาน · flag ตัดเองรอบถัดไป) ·
  `drift/mos-flip/gauge` → **UPDATE-LIGHT** · `suspect-split` → UPDATE เต็ม — จากนั้นรันตาม §3 ทุกกติกาเดิม (flag หายเองเมื่อรายงานสด)
- ticker ที่ Yahoo/StockAnalysis เปลี่ยนชื่อ (บริษัทปรับโครงสร้าง) → override ที่ `tools/symbol-map.json` (เช่น BKI→BKIH, STEC→STECON)
- รายละเอียด/debug → `docs/price-refresh.md`

## 10. Template system + counters (สรุป)

- **รายงาน = content-only template** — CSS/engine อยู่ใน `_template/` build `expandReport()` inject ตอน build · ไฟล์เก็บแค่ `report-data` (กราฟ/gauge/theme) + เนื้อหา 8 section · เริ่มจาก `_template/skeleton-{th,us}.html` · สีแบรนด์ต่อหุ้น (`tools/seeds.json` + `brandtheme.js`) → **`docs/templates.md`**
- **view/vote counters** = Worker + Durable Object (`src/worker.js`) inject ตอน build เฉพาะ `dist/` → **`docs/counters.md`** + `DEPLOY.md`
