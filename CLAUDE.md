# Stock Analysis — Project Rules

รีโปนี้เก็บ **รายงานวิเคราะห์หุ้น** เป็นไฟล์ HTML แล้ว build เป็นเว็บ static
deploy อัตโนมัติบน **Cloudflare Workers (Static Assets)** ผ่านการเชื่อม GitHub

> **รายละเอียดลึกแยกไปไฟล์อ้างอิง** (อ่านเมื่อต้องใช้ ไม่โหลดทุก session):
> `docs/quality-gate.md` (gate ทีละ error) · `docs/templates.md` (content-only template) · `docs/counters.md` (view/vote infra) · `_template/agent-prompt.md` (prompt worker ต่อหุ้น) · `DEPLOY.md` (Cloudflare)

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

## 2. วิเคราะห์หุ้นเดี่ยว (skill `/stock-analyzer`)

เมื่อสั่ง "วิเคราะห์ GOOGL" / "analyze AAPL":

1. เรียก **`/stock-analyzer`** (รวบรวม ≥3 แหล่ง → Fair Value 3 วิธี → MOS → return projection → dashboard HTML)
2. **★ cross-source verify — บังคับก่อนเขียนตัวเลข** (ด่านเดียวที่กันเลขผิด/เก่าหลุดขึ้นเว็บ — gate ตรวจความจริงไม่ได้):
   ยืนยัน **ราคาปัจจุบัน + EPS(TTM)** (+ปันผล/เป้า ถ้าได้) จาก **≥2 แหล่งอิสระ** อ้างอิงในรายงาน ≥2 แหล่ง
   - ตรงกัน (ราคาต่าง ≤~2%) → ใช้ + ระบุ "ราคา ณ วันที่ + แหล่ง"
   - ต่าง >5% หรือ EPS คนละค่า → **หยุด ถามผู้ใช้ อย่าเผยแพร่**
3. **Export เป็น `reports/<SYMBOL>.html`** (พิมพ์ใหญ่ · override default ของ skill ที่ตั้งชื่อ `[SYMBOL]_analysis.html`):
   - **★ เริ่มจาก skeleton เท่านั้น** (อย่าก๊อปรายงานเก่า — เลขเดิมติดมา):
     `cp _template/skeleton-th.html reports/<SYMBOL>.html` (ไทย ฿/SET) หรือ `skeleton-us.html` (ต่างประเทศ $/NASDAQ·NYSE)
     แทนทุก `{{TOKEN}}` ด้วยข้อมูลจริง · เหลือ `{{...}}` ค้าง = gate บล็อก
   - **★ ปรับ metric/valuation ตามเซกเตอร์ได้อิสระ** — gate บังคับแค่ "ครบ 8 section + ตัวเลขสอดคล้องกันเอง" ไม่บังคับชุด metric (ธนาคาร→NIM/NPL/CASA · REIT→Occupancy/DPU/NAV · หุ้นขาดทุน→ตัดการ์ด + `stock-meta.pe/roe=null`) · valuation เลือก ≥2 วิธีให้เหมาะ · **เซลล์ P/E เขียน `$` นำหน้าเสมอ** (`EPS adj. $8.44 × P/E 20x` — อย่าขึ้นต้นด้วยปี parser จะคว้าปีเป็น EPS)
   - **★ 4 บล็อกบังคับใน `<head>`/ใต้ `<h1>`:**
     - `<meta name="ai-model" content="Claude <รุ่นที่รันจริง>">` (Opus→`Claude Opus 4.8` · Sonnet→`Claude Sonnet 4.6`) → build เอาไปแทนเครดิต footer ต่อ report
     - `<script type="application/json" id="stock-meta">` = `{symbol, currency, price, fairValue, mos, upside, pe, dividendYield, roe}` · **`currency` = ISO 3 ตัว `"USD"`/`"THB"` ไม่ใช่ `"$"`** · ตัวเลขต้องตรงกับที่โชว์ในรายงาน (build → screener/การ์ด/ป้ายจุดเด่น)
     - `<div class="sub">` ใต้ `<h1>` = **คำโปรยธุรกิจจริง** ว่าบริษัททำอะไร (เช่น AAPL → `iPhone • Mac • Services • Apple Intelligence`) ใช้ `•` คั่น — ไม่ใช่ "วิเคราะห์หุ้น X - Dashboard" ซ้ำ ๆ (build → `desc` บนการ์ด)
   - **★ header ป้าย `.chg` = ผลตอบแทน "รอบปี"** (เทียบราคา ~1 ปีก่อน ไม่ใช่ รายวัน/YTD/52wk): `▲ +X.X% (รอบปี)` / `▼ −X.X% (รอบปี)` / `≈ ทรงตัว (รอบปี)` · IPO ใหม่ <1 ปี ใช้ `(ตั้งแต่ IPO)` · **ค่า % = ผลตอบแทนปลายกราฟ section 2** · สี ขึ้น=เขียว/ลง=แดง (`theme.chgBg/chgColor`)
   - **★ กราฟ section 2 = ราคา ~1 ปี ≤13 จุด** (รายเดือน 12 เดือน=13 จุด · ห้าม 18 เดือน) · จุดท้าย=ราคาปัจจุบัน(=header) · จุดแรก=ราคา ~1 ปีก่อน · **ต้องดึงราคาจริง** (Yahoo `?range=1y&interval=1mo`) ไม่แต่งจุดกลาง
   - **★ สีแบรนด์** ใน `report-data.theme` เลือกตามลักษณะหุ้น (ห้ามปล่อยน้ำเงิน default) — ดู `docs/templates.md`
4. `npm run verify` ให้ผ่านครบ 6 ขั้น
5. **Auto-push** (§4)

> URL: `https://stock-ai.dotent.workers.dev/<SYMBOL>.html` (หรือ `/<SYMBOL>`)

---

## 3. วิเคราะห์หลายตัว / เป็นกลุ่ม (parallel agents)

ใช้เมื่อสั่งหลายตัว ("วิเคราะห์ GOOGL AAPL MSFT") หรือธีม ("หาหุ้น AI 30 ตัว")

### 3.1 ก่อนเริ่ม — กันซ้ำ + ความสด
1. **`git pull --rebase origin main` ก่อนเสมอ** → อ่าน `reports.json` (ได้ของ session อื่นที่เพิ่ง push มาด้วย)
2. เทียบแต่ละตัว (ฟิลด์ `updated`) — **เกณฑ์ความสด = 7 วัน** (คนละตัวกับ staleness gate 45/120 วัน):
   - สด ≤7 วัน → **ไม่วิเคราะห์ซ้ำ** · ธีม/โควตา → หาตัวใหม่ในธีมมาแทน · ระบุชื่อชัด → ข้าม (แจ้ง)
   - เกิน 7 วัน → วิเคราะห์ซ้ำ (อัปเดต) · ยังไม่มี → วิเคราะห์ใหม่
3. กันซ้ำข้าม session = §3.2 push per-wave + pull --rebase ก่อนแต่ละเวฟ (ตัวที่คนอื่น push แล้วโผล่ใน reports.json → ถูกคัดออก)

### 3.2 รัน — 1 หุ้น/agent · **sequential** · เวฟละ ≤3 · push per-wave
- **★ โมเดล (บังคับ): ห้าม Haiku ทุกขั้น** (Sonnet+Haiku และ Haiku-ล้วน ห้ามทั้งคู่) · **ค่าเริ่มต้น = All-Sonnet main + escalate**: controller=Sonnet, worker=Sonnet (`model:"sonnet"`) — ตราบใดที่ controller ตรวจข้ามแหล่ง price/EPS ≥2 + ดึงกราฟจริง + จับ split/ticker เอง · **หุ้นยาก** (IPO <1 ปี/spinoff/split/cyclical/ราคา cross-source ต่าง >5%) → **escalate อัตโนมัติ** spawn worker ตัวนั้นเป็น **Opus** (`Agent model:"opus"`) ไม่ต้องบอก user · ถ้า **การตัดสิน publish/skip ของ controller เองกำกวม** → หยุด ping user สลับ session เป็น Opus
- **spawn 1 Agent/หุ้น** — full analysis หุ้นตัวเดียว รวม cross-source verify เริ่มจาก skeleton เขียนลง `reports/<SYMBOL>.html` ของตัวเองเท่านั้น · context แยกสะอาด กันเลขปนข้ามหุ้น (ตัวร้าย #1 ของรีโป) · **ใช้ prompt แม่แบบ `_template/agent-prompt.md`**
- **★ STEP 0 กัน cwd-stray:** prompt ให้ agent เริ่ม `cd <worktree> && pwd` + ห้าม `cd` ลง main repo · ตอน push เช็ค `ls reports/<SYM>.html` ใน worktree — ไม่มี = ไปหยิบจาก main repo + ลบตัวหลง (ดู memory [[bulk-stock-analysis-workflow]])
- **★ SEQUENTIAL (บังคับ): spawn 1 agent → รอ notification "completed" → ตรวจ/แก้ error → spawn ถัดไป** — ห้าม spawn parallel หลายตัวพร้อมกัน เพราะกด API session rate limit ทุกตัว fail พร้อมกัน (เห็นแล้วใน W19–W21) · fallback: ถ้า agent fail → ทำ inline ในนี้แทน (fetch + write ใน main session)
- **เวฟละ ≤3 หุ้น** → push รวมเมื่อครบเวฟ · ห้ามยิงทุกตัวรวดเดียว
- **ห้าม agent push เอง · push per-wave** — รอทุก agent ในเวฟเสร็จ → main รัน §4 ครั้งเดียว/เวฟ (commit รวม `analyze: add A, B, C`) · **ทำไมไม่ push รายตัว:** verify สแกนทุกไฟล์ใน `reports/` → sibling ที่เขียนค้างจะบล็อกตัวที่เสร็จแล้ว
- **push per-wave serialize** — ห้าม push ซ้อนหลายเวฟ/หลาย session กัน git race

### 3.3 ลดจำนวนเองได้ ถ้าของดีไม่พอ (ไม่ต้องถาม แต่แจ้งเหตุผล)
สั่ง 30 แต่คัดแล้วดีจริง 20 → ส่ง 20 ได้ (คุณภาพ > โควตา) · **ต้องแจ้งเหตุผล** (valuation แพงไม่มี MOS / ข้อมูลไม่พอ / ซ้ำของสด)

---

## 4. Token discipline — วิเคราะห์ให้ใช้ token ถูกลง

ต้นทุน token ก้อนใหญ่ = ดึงเว็บต่อหุ้น + context พอกใน controller + รอบ verify เสียเปล่า · 5 levers:

1. **WebFetch แบบ targeted คืนเลขสั้น** — prompt WebFetch ให้ดึงเฉพาะ price/EPS/dividend/target/52wk เป็นบรรทัดสั้น **ไม่ dump หน้าเต็ม** · แหล่ง authoritative (StockAnalysis.com) **2 อันพอ cross-verify** อย่ายิง 5 · กราฟ Yahoo `?range=1y&interval=1mo` **ยิงเดียว** ได้ครบ 13 จุด (รายละเอียดใน `_template/agent-prompt.md`)
2. **Compact / fresh session ทุก 1–2 เวฟ** — สลัด context หุ้นเก่าที่ไม่ใช้ต่อ (main controller พอกเร็ว)
3. **Self-check ก่อนคืนงาน** — agent รัน `npm test -- <SYM>` (มีอยู่แล้ว) จับ E13/E28/E29/E32 ที่พลาดบ่อย → **ตัดรอบ verify เสียเปล่าทั้งเวฟ** (sibling ค้างทำ verify แดงหมด)
4. **pull --rebase + อ่าน reports.json ก่อน** — ข้ามหุ้นสด ≤7 วัน = ประหยัด 100% ของตัวนั้น (§3.1)
5. **All-Sonnet main + escalate ตัวยากเป็น Opus subagent** — อย่ารัน Opus เป็น main (§3.2 · W31 กิน ~15% ของลิมิต 5 ชม. กับ 3 หุ้น)

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

## 9. Template system + counters (สรุป)

- **รายงาน = content-only template** — CSS/engine อยู่ใน `_template/` build `expandReport()` inject ตอน build · ไฟล์เก็บแค่ `report-data` (กราฟ/gauge/theme) + เนื้อหา 8 section · เริ่มจาก `_template/skeleton-{th,us}.html` · สีแบรนด์ต่อหุ้น (`tools/seeds.json` + `brandtheme.js`) → **`docs/templates.md`**
- **view/vote counters** = Worker + Durable Object (`src/worker.js`) inject ตอน build เฉพาะ `dist/` → **`docs/counters.md`** + `DEPLOY.md`
