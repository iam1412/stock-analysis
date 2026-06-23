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
4. รัน `npm run verify` (check-reports → build → build-test → check-site) ให้ผ่านทั้งหมด
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

### 3.2 รัน — แบ่ง agent + push "ทีละตัวพอเสร็จ" (ไม่รอครบ)
- **spawn 1 Agent ต่อ 1 หุ้น** (ส่งหลาย tool call ในข้อความเดียวให้รันขนาน) — แต่ละ agent ทำ full analysis ตาม `/stock-analyzer` **รวมตรวจข้ามแหล่ง (ข้อ 2)** เขียนผลลง **`reports/<SYMBOL>.html` ของตัวเองเท่านั้น** (1 ไฟล์/1 หุ้น)
- **ห้าม agent push เอง** (กฎเดิมยังอยู่) — แต่เปลี่ยนจาก "รวบ push ทีเดียวตอนจบ" เป็น: **agent ตัวไหนเสร็จ → main session รัน §4 (`verify → commit → pull --rebase → push`) ของหุ้นตัวนั้นทันที ไม่รอตัวอื่น**
- **main session push ทีละครั้ง (serialize)** — ห้าม push ซ้อนพร้อมกันหลายตัว กัน git race/conflict (หุ้น 1 ตัว = 1 commit)
- ผลดี: หุ้นที่เสร็จก่อนขึ้นเว็บก่อน · เป็น checkpoint (ตัวหลังพลาดไม่ลบของที่ push แล้ว) · session อื่นเห็นเร็ว (หนุน §3.1)

### 3.3 ลดจำนวนเองได้ ถ้าของดีจริงไม่พอ (ไม่ต้องถาม แต่ต้องแจ้ง)
- สั่งหาจำนวนมาก (เช่น 30 ตัว) แต่คัดแล้ว **"น่าสนใจจริง" ไม่ถึงเป้า → ลดจำนวนลงเองได้เลย ไม่ต้องถาม** (เช่นเหลือ 20 ตัวที่ดีจริง) ถือว่า **ไม่ผิดเงื่อนไข** — เน้นคุณภาพ > โควตา
- **แต่ต้องแจ้งเหตุผลทุกครั้ง**: ขอ 30 ส่งจริง 20 เพราะอะไร (เช่น ที่เหลือ valuation แพงเกินไม่มี MOS · ข้อมูลไม่พอทวน ≥3 แหล่ง · ซ้ำกับที่สด ≤7 วันอยู่แล้ว)

---

## 4. Auto-push (กฎสำคัญ)

**หลังวิเคราะห์หุ้นเสร็จ หรือมีการสร้าง/แก้ไขไฟล์ใน `reports/` → ให้ commit + push ขึ้น `main` อัตโนมัติทันที โดยไม่ต้องถามยืนยัน**

ลำดับที่ต้องทำ (commit **ก่อน** pull --rebase เสมอ ไม่งั้น rebase จะ error "Please commit or stash"):
```bash
npm run verify                     # 0. ★ quality gate: check-reports → build → check-site — มี error = ห้าม push
git add -A                         # 1. stage
git commit -m "<message>"          # 2. commit (working tree ต้องสะอาดก่อน rebase)
git pull --rebase origin main      # 3. sync กันชนกับ remote
git push origin main               # 4. push → Cloudflare build & deploy เอง
```

> **★ ต้องรัน `npm run verify` ก่อน push ทุกครั้ง** (รวม check-reports + build + check-site) — ถ้ามี error ให้แก้ให้ผ่านก่อน
> มี git `pre-push` hook (`.githooks/pre-push`) บังคับซ้ำอีกชั้น (รัน 3 ขั้นเดียวกัน): ถ้าไม่ผ่าน `git push` จะถูกบล็อกอัตโนมัติ
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

มี gate 3 ชั้น ต้องผ่านทั้งหมด **ก่อน push เสมอ** (ดูข้อ 4; มี `pre-push` hook บังคับซ้ำ):

```bash
npm run verify           # ★ ครบชุด: check-reports → build → build-test → check-site
npm test                 # ชั้น 1 อย่างเดียว (= node test/check-reports.js)  •  npm test -- BBL  = เฉพาะบางตัว
npm run test:build       # ชั้น 1.5 อย่างเดียว (unit-test build.js: เครดิตโมเดล + freshHash)
npm run check:site       # ชั้น 2 อย่างเดียว (ต้อง build ก่อน)
npm run test:self        # meta-test: พิสูจน์ว่า checker เองยังจับ bug ได้ (รันหลังแก้ checker)
```

**ชั้น 1 — `test/check-reports.js`** (ตรวจ source `reports/<SYMBOL>.html` ทีละไฟล์ — 31 error + 10 warning):
- **โครงสร้าง:** DOCTYPE/`lang="th"`/ปิด `</html>`, `<title>` มีชื่อย่อ, `<h1>`, ครบ 8 section, กราฟ, gauge, เครื่องคิดเลข MOS, disclaimer, footer, header (ราคา+วันที่+แหล่งที่มา), **meta `ai-model` (E28: ต้องระบุโมเดล AI ที่ใช้วิเคราะห์ ขึ้นต้น "Claude ")**
- **ตัวเลขสอดคล้องกันเอง:** `const FV` = Fair Value กล่อง = FV ในสรุป (vgrid) • MOS = (FV−ราคา)/FV • จุดซื้อ MOS20/30 = FV×0.8/0.7 (ทั้งกล่องและแกน gauge) • ราคา header = ค่าตั้งต้นเครื่องคิดเลข • **คณิตแต่ละวิธี: P/E = EPS×P/E, Justified P/BV = ratio×BVPS และ ratio=(ROE−g)/(r−g)** • scenario: EPS ปี3 = EPS ฐาน×(1+g)³ และ tgt = EPS×P/E
- **stock-meta (screener) [E29–31, W10]:** บล็อก `<script id="stock-meta">` JSON ครบ key + ชนิดถูก + symbol/currency ตรง (E29) • ตัวเลข = ที่โชว์จริง: price/fairValue/MOS ตรงกล่อง (E30) + mos/upside สอดคล้องราคา&FV (E31) • (warn W10) pe/yield/roe ≈ ที่โชว์เท่าที่ดึงได้
- **ความสด/แหล่งข้อมูล:** ราคาไม่เก่า > 120 วัน/ไม่อยู่อนาคต (warn > 45 วัน) • (warn) แหล่งข้อมูล ≥3 + มีราคาเป้า/52 สัปดาห์/งวดงบ • (warn) ตัวเลขพื้นฐานอยู่ในวิสัย (P/E, P/BV, yield, ROE)
- **ไม่มีของค้าง:** placeholder `[SYMBOL]`/`${...}`, `undefined`/`NaN`, สกุลเงินปน

**ชั้น 1.5 — `test/build-test.js`** (unit-test ฟังก์ชันใน build.js — require แบบไม่รัน build จริง):
- **freshHash:** เปลี่ยน/เพิ่ม meta `ai-model` **หรือบล็อก `stock-meta`** → hash เท่าเดิม (วันที่ไม่ขยับ) แต่เนื้อหาวิเคราะห์จริงเปลี่ยน → hash เปลี่ยน
- **injectModelCredit:** แทน "stock-analyzer workflow" → เครดิตโมเดล + fallback ผนวกท้าย `<footer>` • **decorateReport:** per-report model ไหลจาก meta → footer ถูกตัว (Opus/Sonnet) + ตกลงค่ากลาง `AI_MODEL` เมื่อไม่มี tag
- **extractMetrics / pickHighlight / computeLeaders:** ดึง metric จากบล็อก `stock-meta` → เลือก "จุดเด่น" ของหุ้นต่อการ์ด (tier ของแต่ละ metric + ป้ายมงกุฎ 👑 เมื่อเป็นค่าดีสุดในกลุ่ม) · computeLeaders หาค่าดีสุดต่อ metric (มาก = ดีสุด, P/E น้อย = ดีสุด ข้ามค่าติดลบ)

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
