# Stock Analysis — Project Rules

รีโปนี้เก็บ **รายงานวิเคราะห์หุ้น** เป็นไฟล์ HTML แล้ว build เป็นเว็บ static
deploy อัตโนมัติบน **Cloudflare Workers (Static Assets)** ผ่านการเชื่อม GitHub

---

## 1. โครงสร้างโฟลเดอร์

```
stock-analysis/
├─ reports/            # ★ ต้นฉบับรายงานหุ้น — 1 ไฟล์ = 1 หุ้น
│  ├─ GOOGL.html
│  ├─ AAPL.html
│  └─ <SYMBOL>.html
├─ build.js            # สแกน reports/ → สร้าง index.html + reports.json → flatten ลง dist/
├─ reports.json        # manifest (auto-generated โดย build.js, committed — เก็บวันที่อัปเดต) ห้ามแก้มือ
├─ package.json        # npm run build
├─ wrangler.toml       # Workers Static Assets ([assets] directory = "./dist")
├─ _headers            # HTTP headers (ต้นฉบับ — แก้ที่นี่ที่เดียว)
├─ .gitignore
├─ README.md           # หน้าอธิบาย repo (สำหรับคน)
├─ DEPLOY.md           # คู่มือ deploy บน Cloudflare
├─ CLAUDE.md           # ไฟล์นี้
└─ dist/               # ⚠️ build output (gitignore) — generate เอง ห้ามแก้มือ
```

**ไฟล์ที่ห้ามแก้มือ** (สร้างอัตโนมัติทุกครั้งที่ build):
- `dist/` ทั้งโฟลเดอร์ (รวม `dist/index.html`, `dist/<SYMBOL>.html`, `dist/_headers`, `dist/reports.json`)
- `reports.json` (root) — build.js เขียนเอง ใช้ track วันที่อัปเดต/hash ของแต่ละรายงาน (commit ไปด้วย)
- หน้า landing / การ์ด (รวมป้าย "จุดเด่น" ที่ build สร้างอัตโนมัติ) / footer (อีเมลติดต่อ) / ช่องค้นหา อยู่ใน template ของ `build.js` — แก้ที่นั่น
- หน้า index เรียงหุ้นที่ **อัปเดตล่าสุดขึ้นก่อน** อัตโนมัติ (อิงวันที่ใน reports.json)

---

## 2. การวิเคราะห์หุ้น (skill `/stock-analyzer`)

เมื่อผู้ใช้สั่งวิเคราะห์หุ้น (เช่น "วิเคราะห์ GOOGL", "analyze AAPL"):

1. เรียก skill **`/stock-analyzer`** ทำตาม workflow ของมัน (รวบรวมข้อมูล ≥3 แหล่ง →
   คำนวณ Fair Value 3 วิธี → Margin of Safety → Return projection → สร้าง dashboard HTML)
2. **★ ตรวจข้ามแหล่ง (cross-source verify) — บังคับก่อนเขียนตัวเลขลงรายงาน**
   ยืนยัน **ราคาปัจจุบัน + EPS (TTM)** (และถ้าทำได้: ปันผล, ราคาเป้านักวิเคราะห์) จาก **≥2 แหล่งอิสระ**:
   - ตรงกัน (ราคาต่าง ≤ ~2%) → ใช้ค่านั้น และระบุ "ราคา ณ วันที่ + แหล่ง"
   - ขัดกันเกิน tolerance → **ห้ามเดา**: เลือกแหล่งที่น่าเชื่อถือ/ใหม่สุด + เขียนกำกับความไม่ตรงกันไว้ในหมายเหตุ;
     ถ้าต่างกันมาก (เช่น ราคา >5% หรือ EPS คนละค่า) ให้ **หยุดแล้วถามผู้ใช้** อย่าเผยแพร่
   - อ้างอิงแหล่งที่ใช้จริง **≥2** (ชื่อ + ถ้าได้ใส่ลิงก์) ในรายงาน
   > นี่คือ **ด่านเดียวที่กัน "เลขผิด/เก่า" หลุดขึ้นเว็บ** — quality gate (ข้อ 7) ตรวจ "ความถูกต้องตามจริง" ไม่ได้ ตรวจได้แค่ความสอดคล้อง/ความสด/การอ้างอิง
3. **Export ไฟล์ผลลัพธ์เป็น `reports/<SYMBOL>.html`** เสมอ
   - **★ เริ่มจากโครงต้นแบบ** (อย่าก๊อปรายงานหุ้นเก่ามาแก้ — เสี่ยงตัวเลขเดิมติดมา):
     `cp _template/skeleton-th.html reports/<SYMBOL>.html` (หุ้นไทย ฿/SET) หรือ `skeleton-us.html` (หุ้นต่างประเทศ $/NASDAQ·NYSE)
     แล้วแทนทุก `{{TOKEN}}` ด้วยข้อมูลจริง (มี comment กำกับทุกช่อง · เหลือ `{{...}}` ค้าง = gate E13 บล็อก · `test/skeleton-test.js` การันตีว่าเติมครบแล้วผ่าน gate)
   - **★ ปรับเนื้อหาตามเซกเตอร์ได้อิสระ** — gate บังคับแค่ "ครบ 8 section + ตัวเลขสอดคล้องกันเอง" **ไม่บังคับชุด metric/วิธี valuation** (โครงต้นแบบเป็น "ตัวอย่าง" ไม่ใช่แบบฟอร์มตายตัว):
     · **Section 1 (Key Metrics):** เปลี่ยน label / สลับ / เพิ่ม-ลดการ์ดได้ (ธนาคาร→NIM/NPL/CASA/Cost-to-income · REIT→Occupancy/DPU/NAV/Gearing · ประกัน→Combined ratio/EV · หุ้นเติบโต-ขาดทุน→Revenue growth/Gross margin/FCF/Cash runway) — gate "อ่าน" แค่ป้าย **P/E (TTM) · P/BV · เงินปันผล · ROE** ไป cross-check กับ `stock-meta` และเป็นเพียง **warning** (W07/W10) · ถ้าหุ้นไม่มี (ขาดทุน/ไม่ปันผล) → ตัดการ์ดออก + ตั้ง `stock-meta.pe/dividendYield/roe = null` (screener เรียงไปท้าย ไม่ error)
     · **Section 3 (Valuation):** เลือก ≥2 วิธี (E17) ให้เหมาะกับหุ้น — gate เช็คคณิตเฉพาะวิธีชื่อ **"P/E"** (E21) และ **"Justified P/BV"** (E22) เมื่อมีวิธีนั้น (ธนาคารเน้น P/BV/Residual income · REIT ใช้ DDM/NAV · หุ้นไม่ปันผลตัด DDM)
   - **★ Header — ป้าย % "รอบปี" (บังคับ · gate E35/E36) [เพิ่ม มิ.ย. 2026]:** ป้าย `.chg` หลังราคา **ต้องเป็นผลตอบแทนรอบปี** (เทียบราคา ~1 ปีก่อน) **ไม่ใช่ % รายวัน/YTD/52 สัปดาห์** — รูปแบบ `▲ +X.X% (รอบปี)` (ขึ้น) · `▼ −X.X% (รอบปี)` (ลง) · `≈ ทรงตัว (รอบปี)` · หุ้น IPO ใหม่ (<1 ปี) ใช้ `(ตั้งแต่ IPO)`
     · ค่า % **= ผลตอบแทนปลายกราฟ section 2 (จุดแรก→จุดท้าย)** — gate E36 บังคับให้ตรงกัน (header กับกราฟมาจากชุดราคาเดียวกัน) · ตั้งสี `theme.chgBg/chgColor` ตามทิศ (ขึ้น=เขียว/ลง=แดง · E34)
   - **★ Section 2 — กราฟ "ราคาย้อนหลัง ~1 ปี" (บังคับ · gate E37) [เพิ่ม มิ.ย. 2026]:** `chart.data` ต้องเป็น **~1 ปี (ไม่เกิน 13 จุด** — รายเดือน 12 เดือน = 13 จุด, รายสองเดือน = ~8 จุด) **ห้าม 18 เดือน/1.5 ปี** · จุดสุดท้าย = ราคาปัจจุบัน (= header) · จุดแรก = ราคา ~1 ปีก่อน (ใช้คำนวณป้าย % รอบปี)
   - ใช้ **ชื่อย่อหุ้นตัวพิมพ์ใหญ่** เป็นชื่อไฟล์: `GOOGL.html`, `AAPL.html`, `PTT.html`
   - ⚠️ **override default ของ skill** ที่ตั้งชื่อ `[SYMBOL]_analysis.html` / save ลง outputs
     → ในโปรเจกต์นี้ให้ใช้ `reports/<SYMBOL>.html` เท่านั้น (เพื่อให้ URL สั้น เรียกง่าย)
   - **★ ประทับโมเดล AI ที่รันจริง** — ใส่ `<meta name="ai-model" content="Claude <รุ่นที่คุณกำลังรัน>">` ใน `<head>`
     (เช่น Opus → `content="Claude Opus 4.8"`, Sonnet → `content="Claude Sonnet 4.6"`) → ตอน build จะเอารุ่นนี้ไป
     **แทนข้อความ "สร้างด้วย stock-analyzer workflow" ใน footer** เป็น "🤖 วิเคราะห์และจัดทำด้วย AI · `<รุ่น>` · Anthropic" **ต่อ report**
     บอกผู้อ่านว่ารายงานนั้นวิเคราะห์ด้วยโมเดลไหน · quality gate **E28 บังคับให้มี** (ลืม/ใส่ผิด = push ไม่ได้)
     · ค่ากลาง `AI_MODEL` ใน build.js เป็นแค่ fallback เผื่อไม่มี tag · meta นี้ไม่นับเป็น "อัปเดต" (ตัดออกจาก freshHash)
   - **★ ใส่บล็อก `stock-meta`** (ตัวเลขสำหรับ **เรียง/คัดกรองหน้า index** — screener) — ถัดจาก meta ai-model ใน `<head>` ใส่
     `<script type="application/json" id="stock-meta">{…}</script>` มีคีย์:
     `{ symbol, currency, price, fairValue, mos, upside, pe, dividendYield, roe }`
     · `mos` = (FV−price)/FV·100 (= กล่อง MOS) · `upside` = (FV−price)/price·100 · `pe/dividendYield/roe` ใส่ `null` ได้ถ้า N/A (จะเรียงไปท้าย)
     · **ตัวเลขต้องตรงกับที่โชว์ในรายงาน** — gate **E29–31 บังคับ** (price/FV/MOS = กล่อง + mos/upside สอดคล้องราคา/FV; เพี้ยน = push ไม่ได้) · **W10** เตือนถ้า pe/yield/roe ต่างจากที่โชว์
     · build.js ดึงบล็อกนี้ → `reports.json` + `data-*` บนการ์ด → ปุ่มเรียง MOS/Upside/P/E/Yield/ROE (เรียงฝั่ง client, 0 request) + **ป้าย "จุดเด่น" บนการ์ดแต่ละใบ** (เลือก metric เด่นสุด + มงกุฎ 👑 ตัวที่ดีสุดในกลุ่ม — คำนวณตอน build จากบล็อกนี้ ไม่ต้องใส่อะไรเพิ่มในรายงาน) · บล็อกนี้ไม่นับเป็น "อัปเดต" (ตัดออกจาก freshHash เหมือน ai-model)
   - **★ คำโปรยธุรกิจใต้ `<h1>`** (`<div class="sub">…</div>`) — **บังคับให้มีเสมอ** สรุปสั้น ๆ ว่า **บริษัททำธุรกิจอะไร**
     (เช่น AAPL → `iPhone, Mac, iPad, Apple Watch, AirPods, Vision Pro • Services • Apple Intelligence`)
     · **เขียนคำโปรยจริง ไม่ใช่ "วิเคราะห์หุ้น X (X) - Dashboard" ซ้ำ ๆ** — ใช้ `•` คั่นกลุ่มธุรกิจ/ผลิตภัณฑ์หลัก
     · build.js ดึงข้อความนี้เป็นฟิลด์ `desc` → **โชว์บนการ์ดหน้า index แทน title** (ผู้อ่านเห็นเบื้องต้นว่าบริษัททำอะไร) + รวมใน `data-search` (ค้นด้วยชื่อผลิตภัณฑ์ได้) · การ์ดตัดเหลือ **2 บรรทัด** อัตโนมัติ (ยาวแค่ไหนก็การ์ดสูงเท่ากัน)
     · quality gate **E32 บังคับให้มี** (ไม่มี/สั้นเกิน = push ไม่ได้) · ถ้าไฟล์ไม่มี `.sub` การ์ดจะ fallback ไปโชว์ title ซ้ำ ๆ (สิ่งที่เลิกทำไปแล้ว) — E32 กันไม่ให้เกิด
4. รัน `npm run verify` (check-reports → build → build-test → engine-exec → skeleton-test → check-site) ให้ผ่านทั้งหมด
5. **Auto-push** (ดูข้อ 4)

> **URL ปลายทาง:** `https://stock-ai.dotent.workers.dev/<SYMBOL>.html` (และ `/<SYMBOL>` ก็เข้าได้)

---

## 3. วิเคราะห์หลายหุ้นพร้อมกัน / เป็นกลุ่ม (parallel agents)

ใช้เมื่อสั่งวิเคราะห์ **หลายตัวพร้อมกัน** (เช่น "วิเคราะห์ GOOGL AAPL MSFT") หรือ **เป็นกลุ่ม/ธีม** (เช่น "หาหุ้นเทค/AI น่าสนใจ 30 ตัว")

### 3.1 ★ ก่อนเริ่ม — เช็คซ้ำ + ความสด (กันวิเคราะห์ทับของเดิม / ซ้ำข้าม session)
1. **`git pull --rebase origin main` ก่อนเสมอ** → ดึงรายงานล่าสุด (รวมที่ session อื่นเพิ่งวิเคราะห์เสร็จ push เข้ามา) แล้วอ่าน `reports.json`
2. เทียบหุ้นแต่ละตัวกับ `reports.json` (อิงฟิลด์ `updated`) — **เกณฑ์ความสด = 7 วัน** (คนละตัวกับ staleness ของ gate 45/120 วันที่ดู "ราคาเก่า"):
   - **มีอยู่แล้ว + สด ≤ 7 วัน → ไม่วิเคราะห์ซ้ำ**
     - คำสั่งแบบ **ธีม/โควตา** ("หา N ตัว…") → **หาหุ้นตัวใหม่ในธีมเดียวกันมาแทน** ให้ได้ของมีคุณภาพครบ
     - คำสั่งแบบ **ระบุชื่อชัด** → **ข้าม** ตัวนั้น (แจ้งว่าเพิ่งวิเคราะห์ ยังสด) ไม่ต้องสุ่มตัวอื่นมาแทน
   - **มีอยู่แล้ว + เกิน 7 วัน → วิเคราะห์ซ้ำ** (อัปเดตของเดิม)
   - **ยังไม่มี → วิเคราะห์ใหม่**
3. **กันซ้ำข้าม session ที่รันพร้อมกัน:** ธีมกว้าง ๆ มักได้คำตอบซ้ำ (เช่น "เทค/AI" → ทั้งสอง session เลือก AAPL) — กลไกกันซ้ำคือ **§3.2 push ทันทีเมื่อแต่ละตัวเสร็จ** + **pull --rebase ก่อนเริ่มหุ้นแต่ละตัว**: ตัวที่ session อื่น push ไปแล้วจะโผล่ใน `reports.json` ทัน → ถูกคัดออก (สด ≤7 วัน) → เลือกตัวใหม่แทน
   > เหลือช่องชนแคบ ๆ เฉพาะกรณีสอง session เริ่ม "หุ้นตัวเดียวกัน" ก่อนฝ่ายใดฝ่ายหนึ่ง push ทัน — กรณีนี้แค่เสียแรงวิเคราะห์ซ้ำ (last push ชนะ ไม่เสียข้อมูล เพราะ 1 ไฟล์/1 หุ้น + rebase) ไม่ใช่บั๊ก

### 3.2 รัน — 1 หุ้น/agent · ยิงทีละเวฟ ≤3 agents · push ทยอย
- **spawn 1 Agent ต่อ 1 หุ้น** — แต่ละ agent ทำ full analysis ตาม `/stock-analyzer` ของหุ้น **ตัวเดียว** **รวมตรวจข้ามแหล่ง (ข้อ 2)** **เริ่มจากโครงต้นแบบ `_template/skeleton-{th,us}.html` (ข้อ 2.3)** เขียนผลลง **`reports/<SYMBOL>.html` ของตัวเองเท่านั้น** (1 ไฟล์/1 หุ้น) — context แยกเด็ดขาด **สะอาดสุด ไม่มีเลขหุ้นอื่นปน** (กันบั๊กเลขปนข้ามหุ้น = ตัวร้ายอันดับ 1 ของรีโปนี้ · เหตุผลที่เลือก 1 หุ้น/agent ไม่ใช่ batch)
- **★ ยิงทีละเวฟ ≤3 agents พร้อมกัน — ห้ามยิงทุกหุ้น/ทุก agent พร้อมกันรวดเดียว** (ส่ง ≤3 tool call ในข้อความเดียวให้รันขนานต่อเวฟ) → เวฟนั้น push เสร็จค่อยยิงเวฟถัดไป · กันโหลดพรวด ทำให้รายงานทยอยขึ้นเว็บเป็นจังหวะ คุมง่าย เห็นปัญหาเร็วก่อนบานปลาย
- **ห้าม agent push เอง** — **agent ตัวไหนเสร็จ → main session รัน §4 (`verify → commit → pull --rebase → push`) ของหุ้นตัวนั้นทันที ไม่ต้องรอตัวอื่นในเวฟ**
- **main session push ทีละครั้ง (serialize)** — ห้าม push ซ้อนพร้อมกันหลายตัว กัน git race/conflict (หุ้น 1 ตัว = 1 commit)
- ผลดี: context สะอาดสุด (1 หุ้น/agent ไม่มีปนเลข) · โหลดเป็นจังหวะ ≤3 ไม่ท่วม · หุ้นเสร็จก่อนขึ้นเว็บก่อน เป็น checkpoint (ตัวหลังพลาดไม่ลบของที่ push แล้ว) · session อื่นเห็นเร็ว (หนุน §3.1)

### 3.3 ลดจำนวนเองได้ ถ้าของดีจริงไม่พอ (ไม่ต้องถาม แต่ต้องแจ้ง)
- สั่งหาจำนวนมาก (เช่น 30 ตัว) แต่คัดแล้ว **"น่าสนใจจริง" ไม่ถึงเป้า → ลดจำนวนลงเองได้เลย ไม่ต้องถาม** (เช่นเหลือ 20 ตัวที่ดีจริง) ถือว่า **ไม่ผิดเงื่อนไข** — เน้นคุณภาพ > โควตา
- **แต่ต้องแจ้งเหตุผลทุกครั้ง**: ขอ 30 ส่งจริง 20 เพราะอะไร (เช่น ที่เหลือ valuation แพงเกินไม่มี MOS · ข้อมูลไม่พอทวน ≥3 แหล่ง · ซ้ำกับที่สด ≤7 วันอยู่แล้ว)

---

## 4. Auto-push (กฎสำคัญ)

**หลังวิเคราะห์หุ้นเสร็จ หรือมีการสร้าง/แก้ไขไฟล์ใน `reports/` → ให้ commit + push ขึ้น `main` อัตโนมัติทันที โดยไม่ต้องถามยืนยัน**

ลำดับที่ต้องทำ (commit **ก่อน** pull --rebase เสมอ ไม่งั้น rebase จะ error "Please commit or stash"):
```bash
npm run verify                     # 0. ★ quality gate 6 ขั้น: check-reports → build → build-test → engine-exec → skeleton-test → check-site — มี error = ห้าม push
git add -A                         # 1. stage
git commit -m "<message>"          # 2. commit (working tree ต้องสะอาดก่อน rebase)
git pull --rebase origin main      # 3. sync กันชนกับ remote
git push origin main               # 4. push → Cloudflare build & deploy เอง
```

> **★ ต้องรัน `npm run verify` ก่อน push ทุกครั้ง** (6 ขั้น: check-reports + build + build-test + engine-exec + skeleton-test + check-site) — ถ้ามี error ให้แก้ให้ผ่านก่อน
> มี git `pre-push` hook (`.githooks/pre-push`) บังคับซ้ำอีกชั้น (รัน 6 ขั้นเดียวกัน): ถ้าไม่ผ่าน `git push` จะถูกบล็อกอัตโนมัติ
> (เปิดใช้ครั้งเดียวต่อ clone: `git config core.hooksPath .githooks` — ดูข้อ 7)

**รูปแบบ commit message:**
- หุ้นใหม่:  `analyze: add <SYMBOL> stock analysis`
- อัปเดต:   `analyze: update <SYMBOL> stock analysis`
- หลายตัว:  `analyze: add GOOGL, AAPL, MSFT stock analysis`
- ลงท้ายด้วย:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

> ขอบเขต auto-push: ใช้กับงานวิเคราะห์หุ้น/ไฟล์ใน `reports/`
> การแก้โครงสร้างระบบ (build.js, wrangler.toml ฯลฯ) ให้สรุปการเปลี่ยนแปลงก่อน push ตามปกติ

---

## 5. Build & Deploy

- **Build:** `npm run build` (= `node build.js`) — ไม่มี dependency, ต้องใช้ Node ≥ 18
- **Deploy:** Cloudflare รัน build แล้ว `wrangler deploy` อัตโนมัติเมื่อ push เข้า `main`
- เว็บนี้เป็น **Worker (Static Assets)** ไม่ใช่ Pages — deploy ด้วย `wrangler deploy`
  (อย่าเปลี่ยนไปใช้ `wrangler pages deploy`) รายละเอียดใน `DEPLOY.md`

---

## 6. ข้อห้าม / ข้อควรระวัง

- ❌ อย่า commit `dist/`, `node_modules/`, `.DS_Store` (อยู่ใน `.gitignore` แล้ว)
- ❌ อย่าแก้ไฟล์ใน `dist/` โดยตรง — แก้ที่ต้นฉบับ (`reports/`, `build.js`, `_headers`)
- ❌ อย่าตั้งชื่อไฟล์รายงานเป็นตัวพิมพ์เล็กหรือเว้นวรรค — ใช้ `<SYMBOL>.html` พิมพ์ใหญ่
- ✅ ทุกรายงานต้องมี disclaimer "ไม่ใช่คำแนะนำการลงทุน" (skill ใส่ให้อยู่แล้ว)
- ✅ ระบุ "ราคา ณ วันที่ + แหล่งที่มา" ในรายงานเสมอ

---

## 7. Quality gate — ตรวจคุณภาพก่อนเผยแพร่ (`npm run verify`)

มี gate หลายชั้น ต้องผ่านทั้งหมด **ก่อน push เสมอ** (ดูข้อ 4; มี `pre-push` hook บังคับซ้ำ 6 ขั้น):

```bash
npm run verify           # ★ ครบชุด 6 ขั้น: check-reports → build → build-test → engine-exec → skeleton-test → check-site
npm test                 # ชั้น 1 อย่างเดียว (= node test/check-reports.js)  •  npm test -- BBL  = เฉพาะบางตัว
npm run test:build       # ชั้น 1.5 อย่างเดียว (unit-test build.js: เครดิตโมเดล + freshHash)
npm run test:engine      # ชั้น 1.7 อย่างเดียว (รัน engine ทุกรายงานใน mock DOM)  •  test:engine -- BBL = เฉพาะบางตัว
npm run test:skeleton    # ชั้น skeleton อย่างเดียว (เติม token โครงต้นแบบ TH/US แล้วผ่าน gate)
npm run check:site       # ชั้น 2 อย่างเดียว (ต้อง build ก่อน)
npm run test:self        # meta-test: พิสูจน์ว่า checker เองยังจับ bug ได้ (รันหลังแก้ checker)
```

**ชั้น 1 — `test/check-reports.js`** (ตรวจ source `reports/<SYMBOL>.html` ทีละไฟล์ — 37 error + 11 warning):
- **โครงสร้าง:** DOCTYPE/`lang="th"`/ปิด `</html>`, `<title>` มีชื่อย่อ, `<h1>`, ครบ 8 section, กราฟ, gauge, เครื่องคิดเลข MOS, disclaimer, footer, header (ราคา+วันที่+แหล่งที่มา), **meta `ai-model` (E28: ต้องระบุโมเดล AI ที่ใช้วิเคราะห์ ขึ้นต้น "Claude ")**, **คำโปรยธุรกิจ `<div class="sub">` ใต้ `<h1>` (E32: ต้องมี + ยาวพอ → build ดึงเป็น `desc` โชว์บนการ์ดหน้า index)**
- **ตัวเลขสอดคล้องกันเอง:** `const FV` = Fair Value กล่อง = FV ในสรุป (vgrid) • MOS = (FV−ราคา)/FV • จุดซื้อ MOS20/30 = FV×0.8/0.7 (ทั้งกล่องและแกน gauge) • ราคา header = ค่าตั้งต้นเครื่องคิดเลข • **คณิตแต่ละวิธี: P/E = EPS×P/E, Justified P/BV = ratio×BVPS และ ratio=(ROE−g)/(r−g)** • scenario: EPS ปี3 = EPS ฐาน×(1+g)³ และ tgt = EPS×P/E
- **stock-meta (screener) [E29–31, W10]:** บล็อก `<script id="stock-meta">` JSON ครบ key + ชนิดถูก + symbol/currency ตรง (E29) • ตัวเลข = ที่โชว์จริง: price/fairValue/MOS ตรงกล่อง (E30) + mos/upside สอดคล้องราคา&FV (E31) • (warn W10) pe/yield/roe ≈ ที่โชว์เท่าที่ดึงได้
- **ความสด/แหล่งข้อมูล:** ราคาไม่เก่า > 120 วัน/ไม่อยู่อนาคต (warn > 45 วัน) • (warn) แหล่งข้อมูล ≥3 + มีราคาเป้า/52 สัปดาห์/งวดงบ • (warn) ตัวเลขพื้นฐานอยู่ในวิสัย (P/E, P/BV, yield, ROE)
- **ไม่มีของค้าง:** placeholder `[SYMBOL]`/`${...}`, `undefined`/`NaN`, สกุลเงินปน
- **CSS var ครบ (E33):** ทุก `var(--x)` ที่อ้างในรายงาน (รวม theme.badge/chgBg + inline style) ต้องถูกนิยามใน `<style>` เดียวกัน (ข้าม `var(--x, fallback)`) — กันสี/พื้นหลัง "หายเงียบ ๆ" (เช่น badge อ้าง `var(--orange)` ที่ยังไม่อยู่ในพาเลต → พื้นหลังเลขหัวข้อ 1–8 หาย)
- **ป้าย change รอบปี ↔ สี/กราฟ (E34, E35, E36, E37, W12) [E34/W12 มิ.ย. 2026; E35–37 เพิ่ม มิ.ย. 2026 จากกฎ "header = % รอบปี + กราฟ ~1 ปี"]:**
  - **E34** ทิศทางป้าย `.chg` (▲/▼, +/−) ต้องตรงกับสี `theme.chgBg/chgColor` — **ลง = แดง, ขึ้น = เขียว** (เคส HMPRO/CPF ใส่ ▼ −X% บนพื้นเขียว = push ไม่ได้; "ทรงตัว"/ไม่มีลูกศร = ข้าม)
  - **E35** ป้าย `.chg` **ต้องเป็นผลตอบแทน "รอบปี"** (มีคำว่า "รอบปี" หรือ "(ตั้งแต่ IPO)" สำหรับหุ้น IPO ใหม่) + มีทิศทาง+ตัวเลข หรือ "ทรงตัว" — **% รายวัน/YTD/52 สัปดาห์/ป้ายว่าง = push ไม่ได้**
  - **E36** % รอบปี **ต้อง = ผลตอบแทนปลายกราฟ** (จุดแรก→จุดท้าย, ต่าง ≤ 12 จุด %) — header กับกราฟต้องมาจากชุดราคาเดียวกัน (เดิมเป็น warning W11 → เลื่อนเป็น error เพราะ "รอบปี" บังคับแล้ว) · "ทรงตัว" (ไม่มี %) = ข้าม
  - **E37** กราฟ section 2 ต้อง **~1 ปี — ไม่เกิน 13 จุด** (รายเดือน 12 เดือน = 13 จุด · รายสองเดือน = ~8 จุด) · 18 เดือน/1.5 ปี = push ไม่ได้ (ตัดให้เหลือ ~12 เดือนล่าสุด · `tools/migrate-annual-chg.js` ทำให้ได้)
  - **(warn W12)** ทุกจุดกราฟต้องมี label แกน x ไม่ว่าง (กัน `["",value]`)
  > ⚠️ **สิ่งที่ E34/E36 ตรวจไม่ได้:** ราคาในกราฟ **ตรงกับราคาตลาดจริงไหม** — gate ไม่มี network/ข้อมูลจริง จับได้แค่ "header % รอบปี ↔ ปลายกราฟ สอดคล้องกัน" เท่านั้น · ความถูกต้องของ **ข้อมูลกราฟ ~1 ปี + ราคา ~1 ปีก่อน** ต้องดึงราคาจริง (Yahoo `?range=1y&interval=1mo`) ตอนสร้าง (ดู memory `chart-data-must-be-real`)

**ชั้น 1.5 — `test/build-test.js`** (unit-test ฟังก์ชันใน build.js — require แบบไม่รัน build จริง):
- **freshHash:** เปลี่ยน/เพิ่ม meta `ai-model` **หรือบล็อก `stock-meta`** → hash เท่าเดิม (วันที่ไม่ขยับ) แต่เนื้อหาวิเคราะห์จริงเปลี่ยน → hash เปลี่ยน
- **injectModelCredit:** แทน "stock-analyzer workflow" → เครดิตโมเดล + fallback ผนวกท้าย `<footer>` • **decorateReport:** per-report model ไหลจาก meta → footer ถูกตัว (Opus/Sonnet) + ตกลงค่ากลาง `AI_MODEL` เมื่อไม่มี tag
- **extractMetrics / pickHighlight / computeLeaders:** ดึง metric จากบล็อก `stock-meta` → เลือก "จุดเด่น" ของหุ้นต่อการ์ด (tier ของแต่ละ metric + ป้ายมงกุฎ 👑 เมื่อเป็นค่าดีสุดในกลุ่ม) · computeLeaders หาค่าดีสุดต่อ metric (มาก = ดีสุด, P/E น้อย = ดีสุด ข้ามค่าติดลบ)
- **extractMeta `desc`:** ดึงคำโปรยธุรกิจจาก `<div class="sub">` ใต้ `<h1>` + ถอด HTML entity (`&amp;` → `&` กัน double-escape ตอน render) → ฟิลด์ `desc` ที่โชว์บนการ์ด (ไม่มี `.sub` → `desc = ""` การ์ด fallback ไป title)
- **gridFmt/dataFmt scope:** `validateReportData` แยก regex ต่อฟิลด์ — gridFmt อ้าง `v` เท่านั้น, dataFmt อ้าง `d[1]` เท่านั้น (ผิด scope = throw กัน ReferenceError ตอน render)
- **validateReportData guards (กัน render พังเงียบที่ค่า "ผ่าน JSON แต่ทำให้ NaN/Infinity"):** chart.max>min, gauge.max>min (กันหาร 0 → พิกัด NaN), fv>0 (กัน MOS Infinity), chart.data ทุกจุด = `[string, finite number]`, grid ตัวเลขล้วน · **ค่าสี theme** = hex/rgb/hsl/var/gradient ที่ถูกต้อง + ห้ามมี `;{}` (กัน CSS declaration breakout/inject + hex 5 หลัก → เส้นกราฟล่องหน)

**ชั้น 1.7 — `test/engine-exec.js`** (รัน engine ที่ build bake แล้ว ของทุกรายงานใน mock DOM — ปิดช่อง "syntax ผ่านแต่ runtime พัง"):
- check-site แค่ `new Function(body)` ตรวจ syntax — **ไม่เคยรันโค้ด** → ReferenceError/throw ตอนรันจริงหลุดได้ (เช่น dataFmt อ้าง `v` นอก scope → กราฟ/gauge/calc ดับทั้ง IIFE เงียบ ๆ)
- expand รายงาน → ดึง `<script>` engine (ตัวที่อ้าง `priceChart`) → รันด้วย `new Function('document', body)(mockDoc)` (engine อ้าง `document` ตัวเดียว, ไม่ต้องใช้ vm/ไม่มี dependency) → assert: **ไม่ throw** + กราฟวาดจริง (`priceChart.innerHTML` มี `<path`+`<circle`) + เข็ม gauge ถูกตั้ง `style.left` + เครื่องคิดเลข MOS ให้ผล + **ไม่มีพิกัด `NaN`/`Infinity`** (กัน "render สำเร็จแต่ล่องหน" จาก bounds degenerate)
- **มี self-check ในตัว** (รันก่อนตรวจจริง): พิสูจน์ว่า harness จับ engine ที่จงใจทำพัง (ป้ายจุดอ้าง `v` นอก scope → throw, และ bounds degenerate → พิกัด NaN) ได้ — กัน harness กลายเป็น no-op

**ชั้น skeleton — `test/skeleton-test.js`** (กำกับโครงต้นแบบ `_template/skeleton-{th,us}.html` — ดูข้อ 9):
- โครงครบ (marker, `stock-meta`/`report-data`, `.sub`, 8 section, footer, สกุลเงินถูก ฿/$) + **เติม `{{TOKEN}}` ด้วยข้อมูลจริง (ไทย = HMPRO) แล้วผ่าน check-reports (0 error) + engine รันได้** + token coverage (ชุดเติมต้องครอบคลุมทุก token)

**ชั้น 2 — `test/check-site.js`** (ตรวจ `dist/` หลัง build — ระดับเว็บไซต์):
- **ความครบ:** ทุก report อยู่ใน `dist/`, `reports.json`, และมีการ์ดใน `index.html` • ชื่อไฟล์พิมพ์ใหญ่ ไม่ซ้ำ
- **Render:** `<script>` (JS เท่านั้น — ข้าม `<script type="application/json">` เพราะเป็น data block ไม่ใช่โค้ด) parse ได้ + id ที่ JS อ้างมีจริง • (warn) จุดสุดท้ายกราฟ≈ราคา, min/max ครอบข้อมูล, gauge marker ไม่ติดขอบ
- **เครดิตโมเดล AI (end-to-end):** dist ไม่เหลือ "stock-analyzer workflow" • มีเครดิต 🤖 …·Anthropic • **โมเดลใน footer = meta `ai-model` ของไฟล์นั้น** (per-report ตรงกัน)
- **screener metric (end-to-end):** การ์ดหน้า index มี `data-mos/upside/pe/yield/roe` = บล็อก `stock-meta` ของ report นั้น (build ส่งตัวเลขขึ้นการ์ดถูกต้อง)
- **ความปลอดภัย:** external resource = Google Fonts (https) เท่านั้น • **ห้าม `<script src>` ภายนอก** • ห้าม `http://`

> **ปรับ threshold ความสดได้ผ่าน env:** `STALE_WARN_DAYS` (45), `STALE_ERROR_DAYS` (120), `STALE_TODAY` (สำหรับเทส)

**เมื่อ gate ฟ้อง error → แก้ `reports/<SYMBOL>.html` ให้ถูก แล้วรันใหม่จนผ่าน ห้าม push ทั้งที่ยังแดง**
ถ้าเพิ่ม/แก้ check ต้องเพิ่มเคสใน `test/self-test.js` และให้ `npm run test:self` ผ่านด้วย

> **สิ่งที่ gate ตรวจไม่ได้ (ต้องพึ่งคน/LLM):** ความ "ถูกต้องตามจริง" ของราคา/EPS/ปันผล/เป้าเทียบตลาดจริง —
> gate ยืนยันได้แค่ว่ารายงาน "สอดคล้องกันเอง + สด + มีแหล่งอ้างอิง" เท่านั้น ความถูกต้องของตัวเลขต้นทางต้องทวนแหล่ง ≥3 ตอนสร้าง (skill) + วิจารณญาณคน

---

## 8. ระบบนับยอดวิว + Like/Dislike (Worker + Durable Object)

นับ/แสดงยอดเข้าชม + 👍/👎 — footer ของแต่ละ report + ต่อการ์ดในหน้า index (รายละเอียด deploy ใน `DEPLOY.md`)

- **โครงสร้าง:** เว็บยังเป็น static (ไฟล์ `.html` เสิร์ฟตรงจาก edge ไม่ผ่าน Worker) มี Worker เล็ก ๆ `src/worker.js`
  ส่งต่อ `/api/*` ให้ **Durable Object `Counters` instance เดียว** (`env.COUNTERS.idFromName('global')`, SQLite-backed)
  = **source of truth** นับเป๊ะ strongly-consistent ทั่วโลก (single-threaded → ไม่มี per-colo divergence / lost update)
  - `POST /api/views/<SYM>` = +1 view · `GET …/<SYM>` = อ่าน {count,likes,dislikes} · `GET /api/views` = batch `{SYM:{c,l,d}}` (แคช edge 60 วิ; cache miss = 1 RPC `all()` → page size ไม่กระทบ API)
  - `POST /api/vote/<SYM>?from=&to=` = โหวต (none|like|dislike); **server คิด delta เอง (∈ -1..1)** กัน client ยิงเลขมั่ว
- **เริ่มนับใหม่จาก 0** — ไม่ migrate เลขเก่า; DO เป็น source of truth ตั้งแต่ deploy แรก (DO SQL ใช้ placeholder `?` ธรรมดา รองรับ workerd ชัวร์)
- **D1 = mirror สำรอง:** เขียน best-effort (`waitUntil`) ไม่อ่านบน hot path — `mirrorD1()` ใน worker · เก็บเป็น backup เฉย ๆ (ไม่ต้อง setup) ถอดทิ้งทีหลังก็ได้ (ดู DEPLOY.md "ถอด D1")
- **rate limit:** binding `VOTE_LIMITER`/`VIEW_LIMITER` ที่ขอบ (กัน spam ก่อนใช้โควต้า DO) — ความไม่เป๊ะ per-colo ไม่กระทบยอดแล้ว เพราะตัวนับจริงอยู่ใน DO
- **กันบอต (`countable()` ใน worker):** view/vote นับเฉพาะคำขอ "จากหน้าเว็บเราเอง" (`Origin`/`Sec-Fetch-Site: same-origin`) + UA ไม่เข้าข่ายบอต (`BOT_RE`, รวม HeadlessChrome/curl/python ฯลฯ) — บอตได้ค่าปัจจุบัน (200) แต่ไม่ +1 · ชั้นแรกคือดีไซน์ JS-required (บอตไม่รัน JS ไม่ยิง POST อยู่แล้ว) · ระดับ Cloudflare Bot Management ต้องมี zone/แพ็กเสียเงิน
- **กันซ้ำ:** view = `sessionStorage` · vote = `localStorage` (toggle/สลับได้) · symbol = whitelist จาก `/reports.json`
- **inject ตอน build เฉพาะใน `dist/`** (เหมือน footer ติดต่อ) — `reports/<SYMBOL>.html` ต้นฉบับไม่ต้องแก้ · route/JSON เหมือนเดิม สคริปต์ที่ inject ไม่ต้องแก้
- **ผ่าน quality gate:** inline `<script>` + `fetch()` same-origin (ห้าม `<script src>`) · ทุก `getElementById` มี element รองรับ · ไม่มี top-level await
- **deploy ครั้งเดียว (บัญชี Cloudflare):** แค่ `wrangler deploy` (push → Workers Builds รันให้เอง) — `[[migrations]] new_sqlite_classes` สร้าง DO class ให้ เริ่มนับจาก 0 ไม่ต้องตั้ง secret/seed
  - ⚠️ migration ต้องเป็น **`new_sqlite_classes`** (ไม่ใช่ `new_classes`) — KV backend เก่าเป็น paid-only; SQLite-backed DO เท่านั้นที่ฟรี
- **ขอบเขต gate:** `npm run verify` ตรวจเฉพาะ static — Worker/DO ทดสอบผ่าน `wrangler dev` (ดู `DEPLOY.md`)
- ปรับจำนวนหุ้น/หน้า (pagination) ที่ `PAGE_SIZE` ใน `build.js` (ค่าเริ่มต้น 12)

---

## 9. Template system (รายงาน content-only) + สีแบรนด์ต่อหุ้น

รายงานใน `reports/` เป็นแบบ **content-only template** — โครงที่ซ้ำทุกไฟล์ (CSS + engine วาดกราฟ/gauge/เครื่องคิดเลข)
อยู่ใน `_template/` (`dashboard.css`, `engine.js`) แล้ว `build.js` **`expandReport()` inject ตอน build/ตรวจ**
ไฟล์รายงานเก็บแค่ **เนื้อหา + ข้อมูลต่อหุ้น**:

- **`<script type="application/json" id="report-data">`** ใน `<head>` — ตัวเลขกราฟ/gauge + **ธีมสี** ต่อหุ้น:
  `{ theme:{accent, accentDark, darkGrad, glow, subColor, headerMuted, verdictText, vcellLabel, badge, chgBg, chgColor},
     chart:{data, min, max, grid, fairLine, currency, highlight, gridFmt?, dataFmt?}, gauge:{min,max,cur,fair,fairLabelTop}, fv }`
  · `highlight` = ดัชนีจุดที่ไฮไลต์บนกราฟ (เช่น `[6,7]`) · `currency` = สัญลักษณ์ (`$`/`฿`) · `gridFmt`/`dataFmt` = นิพจน์ format ป้าย (เช่น `v.toFixed(2)` หุ้นราคาต่ำ)
- marker `<!--TEMPLATE:STYLE-->` (ใน head) + `<!--TEMPLATE:ENGINE-->` (ก่อน `</body>`) = จุดที่ build inject โครง
- บล็อก `stock-meta` (ป้าย/มงกุฎการ์ด), meta `ai-model`, `<div class="sub">`, body 8 section, footer = **คงไว้ในไฟล์เหมือนเดิม**
- ไฟล์ HTML เต็มแบบเก่า (ไม่มี marker) → `expandReport` คืนค่าเดิมเป๊ะ (backward-compatible)

**★ โครงต้นแบบ (skeleton) — จุดตั้งต้นของรายงานใหม่:**
- `_template/skeleton-th.html` (หุ้นไทย ฿/SET) · `_template/skeleton-us.html` (หุ้นต่างประเทศ $/NASDAQ·NYSE) — โครง content-only เปล่า ๆ มีครบ 8 section + marker + บล็อก `stock-meta`/`report-data` + comment กำกับทุกช่อง
- **ทุกค่าต่อหุ้นเป็น `{{TOKEN}}`** (ไม่มีตัวเลขหุ้นเก่าติดมา ต่างจากการก๊อปรายงานเดิม) — `cp` แล้วแทนทุก token · เหลือ `{{...}}` ค้าง = **gate E13 บล็อก**
- อยู่ใน `_template/` (ไม่ใช่ `reports/`) → ไม่ถูก build เป็นหน้า/ไม่ถูก gate ตรวจเป็นรายงานจริง · ทั้งสองไฟล์ต่างกันแค่สัญลักษณ์สกุลเงิน/ตลาด (โครงเดียวกัน)
- `test/skeleton-test.js` กำกับ: เติม token ด้วยข้อมูลจริง (ไทย = HMPRO จริง) แล้ว **ต้องผ่าน check-reports (0 error) + engine รันได้** + token coverage (เพิ่ม token แล้วลืมอัปเดต = เทส fail)

**★ สีแบรนด์ — เลือกตาม "ลักษณะของหุ้น" ทุกตัว (ห้ามปล่อย default น้ำเงิน):**
ทุกรายงานต้องมีสีเฉพาะตัวใน `report-data.theme` — **มีสีแบรนด์/โลโก้จำได้ใช้สีนั้น** (Google ฟ้า, Tesla/TSMC แดง, Accenture ม่วง, PANW ส้ม…),
**ไม่มีก็เลือกตามเซกเตอร์** (photonics→teal/cyan/magenta/violet · foundry/metrology→copper/bronze · power/energy→เขียว · memory→amber · cybersecurity→ส้ม/แดง)
- หลักการ + เหตุผลรายตัว + วิธีทำ: ดู **`tools/brand-colors.md`** (record ถาวร)
- เครื่องมือ: เก็บ "สีเมล็ด" 1 ค่า/หุ้นใน `tools/seeds.json` → `node tools/brandtheme.js tools/seeds.json --write` (`makeTheme()` สร้างธีมเต็มจาก seed ด้วย HSL)

**เครื่องมือ (`tools/`):**
- `migrate.js <SYM…> [--write]` — แปลง HTML เต็ม → content-only + **round-trip faithful check** (resolve CSS var→สีจริง + body verbatim + stock-meta + brand/engine values ตรงเป๊ะจึงเขียน ไม่งั้น flag ปล่อย old-style)
- `brandtheme.js` — `makeTheme(seed)` → ธีมเต็มชุด · `preserve-dates.js` — คงวันที่ `updated` หลัง migrate (source เปลี่ยน → freshHash ขยับ → ดึงวันเดิมจาก git HEAD)
- gate ครอบคลุม template: `check-reports.js` ตรวจ **หลัง** expand · `build-test.js` ทดสอบ `expandReport`/validate · `engine-exec.js` รัน engine จริง · `skeleton-test.js` กำกับโครงต้นแบบ
