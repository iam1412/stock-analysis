# 📊 Stock Analysis

รวม **รายงานวิเคราะห์หุ้น** (Fair Value, Margin of Safety, จุดเข้าซื้อ, ผลตอบแทนคาดการณ์)
เป็นเว็บ static (1 หุ้น = 1 ไฟล์ HTML) + **screener เรียง/คัดกรองด้วย MOS · P/E · Yield · ROE · Upside** (เรียงฝั่ง client, 0 request)
\+ **ป้ายไฮไลต์ "จุดเด่น" อัตโนมัติต่อหุ้น** (เลือก metric ที่เด่นสุด + มงกุฎให้ตัวที่ดีสุดในกลุ่ม — คำนวณตอน build)
\+ **รายงานแบบ content-only template** (โครง CSS/กราฟใช้ร่วมใน `_template/` inject ตอน build — เล็กลง ~45%) + **สีแบรนด์เฉพาะตัวทุกหุ้น** (เลือกตามลักษณะหุ้น)
\+ **ราคา + กราฟ + วันที่ราคา อัปเดตอัตโนมัติทุกวัน** (GitHub Actions cron — script deterministic ไม่มี LLM · ตัวที่ขยับแรงเข้าคิว re-analysis)
\+ **ระบบนับยอดวิว / 👍👎 แบบนับเป๊ะทั่วโลกด้วย Durable Object** — deploy อัตโนมัติบน Cloudflare Workers

> ⚠️ ข้อมูลทั้งหมดเพื่อการศึกษาเท่านั้น **ไม่ใช่คำแนะนำการลงทุน**

## 🔗 เว็บไซต์

```
https://stock-ai.dotent.workers.dev/          → หน้ารวมรายงาน
https://stock-ai.dotent.workers.dev/GOOGL     → รายงาน GOOGL
https://stock-ai.dotent.workers.dev/GOOGL.html
```

API/manifest รายชื่อหุ้นทั้งหมด: [`/reports.json`](reports.json)

## 📁 โครงสร้าง

```
reports/<SYMBOL>.html   # ★ รายงานหุ้น content-only (เนื้อหา + report-data: ตัวเลขกราฟ/gauge + ธีมสีแบรนด์)
_template/              # โครงใช้ร่วม: dashboard.css + engine.js + skeleton-{th,us}.html (จุดตั้งต้นรายงานใหม่) + agent-prompt.md
build.js                # expandReport (ขยาย template) + สร้าง index.html + reports.json → flatten ลง dist/
reports.json            # manifest (auto-generated — track วันที่วิเคราะห์/hash) ห้ามแก้มือ
price-flags.json        # คิวหุ้นรอ re-analysis จาก cron ราคา (snapshot ต่อรอบ — จัดการอัตโนมัติ)
tools/                  # update-prices.js (cron ราคา) · migrate.js · brandtheme.js + seeds.json · preserve-dates.js · brand-colors.md
test/                   # quality gate ทุกชั้น: check-reports · build-test · engine-exec · skeleton-test · check-site · self-test · update-prices-test
docs/                   # รายละเอียดเชิงลึก: quality-gate.md · templates.md · counters.md · price-refresh.md
.github/workflows/update-prices.yml   # cron อัปเดตราคาทุกวัน 07:17 น. ไทย
.githooks/pre-push      # บล็อก git push อัตโนมัติถ้า gate ไม่ผ่าน
src/worker.js           # Worker + Durable Object (ตัวนับวิว/ไลก์ — ดู 🏗️ สถาปัตยกรรม)
wrangler.toml _headers  # Cloudflare Workers + Static Assets + Durable Object + D1 / HTTP headers
DEPLOY.md               # คู่มือ deploy
CLAUDE.md               # กฎสำหรับ Claude (workflow วิเคราะห์ / auto-push / cron ราคา §9 / template+สี §10)
```

## 🏗️ สถาปัตยกรรมระบบ

หน้าเว็บเป็น **static** (เสิร์ฟตรงจาก edge — ฟรี/ไม่จำกัด) แต่มี **ตัวนับยอดวิว + 👍/👎 แบบ real-time**
ที่นับ **เป๊ะระดับโลก** ด้วยของใหม่ของ Cloudflare: **Durable Objects (SQLite-backed)**

```mermaid
flowchart TD
    U(["👤 ผู้ใช้ / เบราว์เซอร์"])
    U -->|"GET /SYMBOL.html"| CACHE["⚡ Edge Cache — ไฟล์ static<br/>ฟรี/ไม่จำกัด · ไม่เรียก Worker"]
    U -->|"/api/views · /api/vote"| W{{"🛠️ Worker · src/worker.js<br/>ตรวจ symbol + rate-limit ที่ขอบ"}}
    W ==>|"RPC → DO instance เดียว"| DO[("🏛️ Durable Object — Counters<br/>SQLite · instance เดียวทั่วโลก<br/>นับเป๊ะ strongly-consistent")]
    DO -.->|"mirror best-effort"| D1[("🗄️ D1 · ตาราง views · backup")]
```

**ไอเดียหลัก:** ทุกคำขอ `/api/*` จากทั่วโลก map ไปที่ **Durable Object instance เดียวกัน** (`idFromName('global')`)
→ การนับเป็น single-threaded read-modify-write บนเครื่องเดียว → **ไม่นับซ้ำ/ไม่หล่นหาย ไม่มี per-colo divergence**
(ต่างจาก rate-limit binding ที่นับแยกแต่ละ edge แล้ว eventually-consistent)

| ชั้น | บทบาท |
|---|---|
| **Static Assets** (`dist/*.html`) | หน้าเว็บทั้งหมด — เสิร์ฟตรงจาก edge cache, Worker ไม่ถูกเรียก (ฟรี) |
| **Worker** (`src/worker.js`) | จัดการเฉพาะ `/api/*` — validate symbol (whitelist), rate-limit, ส่งต่อ DO |
| **Durable Object `Counters`** | **source of truth** — SQLite ในตัว เก็บ count/likes/dislikes ทุกหุ้นในตารางเดียว |
| **D1** (`views`) | mirror สำรอง — เขียน best-effort, ไม่อ่านบน hot path |
| **Rate Limit binding** | กัน spam ที่ขอบก่อนถึง DO (ประหยัดโควต้า) |
| **กันบอต** (`countable()`) | นับเฉพาะคำขอจากหน้าเว็บเราเอง (`Origin`/`Sec-Fetch`) + UA ไม่ใช่บอต — บอต/ยิง API ตรง ไม่ถูกนับ |

**Endpoints:** `POST /api/views/<SYM>` (+1 วิว) · `GET /api/views/<SYM>` · `GET /api/views` (batch ทั้ง index, แคช edge 60 วิ) · `POST /api/vote/<SYM>?from=&to=` (server คิด delta เอง ∈ −1..1)

> 🆓 อยู่ใน **Cloudflare Free tier** สบาย ๆ (ใช้โควต้า DO ~1–4%) · กันนับซ้ำฝั่ง client: วิว = `sessionStorage`, โหวต = `localStorage`
> รายละเอียด deploy / ถอด D1 ดูที่ [DEPLOY.md](DEPLOY.md) · โครงสร้างระบบนับดูที่ [`docs/counters.md`](docs/counters.md)

## ➕ เพิ่มหุ้นใหม่

```bash
# 1. ก๊อปโครงต้นแบบให้ตรงตลาด (ห้ามก๊อปรายงานเก่า — เลขเดิมจะติดมา)
cp _template/skeleton-us.html reports/AAPL.html    # หุ้นต่างประเทศ ($ · NASDAQ/NYSE)
cp _template/skeleton-th.html reports/HMPRO.html   # หุ้นไทย (฿ · SET)

# 2. แทนทุก {{TOKEN}} ด้วยข้อมูลจริง (gate E13 จะ error ถ้าเหลือ {{...}} ค้าง)
#    เลือกสีแบรนด์ใน report-data.theme (ดู tools/brand-colors.md) + ให้ตัวเลขสอดคล้องกัน (docs/quality-gate.md)

# 3. push — Cloudflare build & deploy ให้เอง
npm run verify && git add -A && git commit -m "analyze: add AAPL stock analysis" && git pull --rebase origin main && git push origin HEAD:main
```
หน้า index จะเพิ่มการ์ดหุ้นใหม่ + เรียงตัวที่อัปเดตล่าสุดขึ้นบนสุดให้อัตโนมัติ

> **โครงต้นแบบ** `_template/skeleton-{th,us}.html` คือจุดตั้งต้นที่สะอาด (ไม่มีตัวเลขหุ้นเก่าติดมา) — มีครบ 8 section,
> marker, บล็อก `stock-meta`/`report-data`, comment กำกับทุกช่อง · เติมแล้ว **การันตีผ่าน gate** (มี `test/skeleton-test.js` คุม) ·
> **ปรับ metric/วิธี valuation ตามเซกเตอร์ได้อิสระ** (โครงเป็นแค่ตัวอย่าง — ธนาคารใช้ NIM/NPL, REIT ใช้ Occupancy/DPU, หุ้นขาดทุนตัด P/E ออก; gate ไม่บังคับชุด metric, cross-check เฉพาะ P/E·P/BV·ปันผล·ROE = warning) ·
> ระบบ template + หลักเลือกสีแบรนด์: [`docs/templates.md`](docs/templates.md) + [`tools/brand-colors.md`](tools/brand-colors.md) ·
> **ป้าย % หลังราคา (header) ต้องเป็นผลตอบแทน "รอบปี"** (`▲ +X.X% (รอบปี)` · IPO ใหม่ใช้ `(ตั้งแต่ IPO)`) = ผลตอบแทนปลายกราฟ section 2 ที่ต้องเป็น **ราคาย้อนหลัง ~1 ปี (≤13 จุด)** — gate E34–E37 บังคับ ·
> ไฟล์ HTML เต็มแบบเก่าก็ยังใช้ได้ (`expandReport` ปล่อยผ่าน) แปลงเป็น template ด้วย `node tools/migrate.js <SYM> --write`

## 🔄 อัปเดตราคาอัตโนมัติทุกวัน (cron)

GitHub Actions ([`update-prices.yml`](.github/workflows/update-prices.yml)) รันทุกวัน **07:17 น. ไทย** — ดึงราคาจริงจาก Yahoo
(ยิงเดียวต่อหุ้น: `?range=1y&interval=1mo`) แล้ว patch **เฉพาะตัวเลขโครงสร้าง** ลงทุกรายงาน:
ราคา header + วันที่ราคา + กราฟ 13 จุด (~1 ปี) + ป้าย % รอบปี + เข็ม gauge + MOS + เครื่องคิดเลข + `stock-meta`
→ ผ่าน `npm run verify` ครบ 6 ขั้นแล้วจึง commit + push เอง (Cloudflare deploy ต่อ)

- **script deterministic ล้วน ไม่มี LLM ในลูป** ([`tools/update-prices.js`](tools/update-prices.js)) · **ไม่แตะ** prose วิเคราะห์ / EPS / Fair Value / วันที่วิเคราะห์ (ลำดับ index ยังเรียงตามวันวิเคราะห์ — `preserve-dates.js` คืนให้)
- ตัวที่ขยับแรงจนคำวิเคราะห์เดิมผิดความหมาย (ต่าง >15% · MOS พลิกเครื่องหมาย · ราคาหลุดช่วง gauge · สงสัย split >25%) → **ไฟล์ไม่ถูกแตะ** แต่เข้าคิว [`price-flags.json`](price-flags.json) + GitHub Issue เดียวรอ **re-analysis** (flag หายเองเมื่อรายงานสดแล้ว)
- log ต่อหุ้น (`AAPL 297.21 → 315.32 (+6.1%)` + บรรทัด freeze) เก็บถาวรใน commit body — ดูย้อนหลัง: `git log --grep "price: refresh"`

```bash
node tools/update-prices.js AAPL           # dry-run ตัวเดียว (โชว์ว่าจะเปลี่ยนอะไร ไม่เขียนไฟล์)
node tools/update-prices.js --write AAPL   # เขียนจริง → ตามด้วย build + preserve-dates + build + verify
npm run test:prices                        # unit test offline (fixture + mock Yahoo)
```

> กลไกเต็ม / กติกา freeze / วิธี debug: [`docs/price-refresh.md`](docs/price-refresh.md)

## 🛠 พัฒนา / ทดสอบในเครื่อง

```bash
npm run verify     # ★ quality gate ครบชุด — ต้องผ่านก่อน push
npm run build      # = node build.js (ไม่ต้องติดตั้ง dependency, Node ≥ 18)
open dist/index.html
```

## ✅ Quality gate (ตรวจก่อนเผยแพร่)

`npm run verify` ตรวจ 6 ขั้น — มี error เมื่อไหร่ push ไม่ได้:

1. **`check-reports.js`** (source ทีละไฟล์ — 37 error + 11 warning): โครงสร้างครบ (รวม meta `ai-model` ระบุโมเดล AI) • **ตัวเลขสอดคล้องกันเอง** (ค่า `FV` ในเครื่องคิดเลข = Fair Value = สรุป, `MOS=(FV−ราคา)/FV`, จุดซื้อ MOS = FV×0.8/0.7, คณิตแต่ละวิธี P/E & P/BV, scenario EPS ทบต้น) • **บล็อก `stock-meta` (screener) = เลขที่โชว์จริง** (E29–31) • **CSS var ครบ (E33)** • **ป้าย % รอบปี + กราฟ ~1 ปี** (header `.chg` = ผลตอบแทน "รอบปี" = ปลายกราฟ section 2 · สี↔ทิศ · กราฟ ≤13 จุด · E34–E37) • **ความสดของราคา** (เตือน >45 วัน, บล็อก >120 วัน) • ไม่มี placeholder/`{{token}}` ค้าง
2. **`build`**: expand ทุก report + สร้าง index/manifest ลง `dist/` ต้องไม่พัง
3. **`build-test.js`** (unit-test build.js): `freshHash` • เครดิตโมเดล AI ต่อ report • `extractMetrics`/`pickHighlight`/`computeLeaders` • **`validateReportData`** กัน render พังเงียบ (gridFmt/dataFmt ตรง scope, bounds ไม่ degenerate, fv>0, ค่าสี theme ถูกต้อง/ไม่ inject)
4. **`engine-exec.js`** (รัน engine ทุกรายงานใน mock DOM): กราฟ (`<path>`+`<circle>`), เข็ม gauge, เครื่องคิดเลข MOS ต้อง render จริง **ไม่ throw + ไม่มีพิกัด NaN/Infinity** — ปิดช่อง "syntax ผ่านแต่ runtime พัง"
5. **`skeleton-test.js`**: โครงต้นแบบ TH/US เติมข้อมูลจริง (ไทย = HMPRO) แล้วต้องผ่าน gate + engine รันได้
6. **`check-site.js`** (หลัง build, ระดับเว็บไซต์): ทุก report อยู่ใน index/manifest ครบ • `<script>` JS ไม่พัง + id ครบ • โมเดลใน footer = meta `ai-model` • **การ์ด index `data-*` = บล็อก stock-meta** • **ความปลอดภัย: external resource = Google Fonts เท่านั้น ห้าม `<script src>` ภายนอก**

```bash
npm test                 # ชั้น 1 อย่างเดียว    npm test -- BBL   # เฉพาะบางตัว
npm run test:build       # unit-test build.js (expandReport/validate — 64 เคส)
npm run test:engine      # รัน engine ใน mock DOM    test:engine -- BBL = เฉพาะตัว
npm run test:skeleton    # โครงต้นแบบ TH/US เติมแล้วผ่าน gate
npm run test:prices      # unit test ตัวอัปเดตราคา (offline)
npm run check:site       # ระดับเว็บไซต์ (ต้อง build ก่อน)
npm run test:self        # พิสูจน์ว่า checker เองยังจับ bug ได้
git config core.hooksPath .githooks   # เปิดใช้ pre-push hook (ครั้งเดียวต่อ clone)
```

> ⚠️ gate ตรวจ "ความสอดคล้อง + ความสด + การอ้างอิง" ได้ แต่ **ตรวจ "ความถูกต้องตามจริง" ของราคา/งบเทียบตลาดไม่ได้** — ส่วนนั้นต้อง cross-source verify ≥2 แหล่งตอนสร้าง + วิจารณญาณคน

> รายละเอียดทุกชั้น / ทุก E-code + env threshold: [`docs/quality-gate.md`](docs/quality-gate.md)

## 🚀 Deploy

deploy อัตโนมัติเมื่อ push เข้า `main` (Cloudflare Workers + Static Assets)
รายละเอียดการตั้งค่าครั้งแรกดูที่ [DEPLOY.md](DEPLOY.md)

## ✉️ ติดต่อ

somchai.s@de.co.th
