---
name: stock-analyzer
description: วิเคราะห์หุ้นรายตัว (ไทย/US) เป็นรายงาน HTML dashboard ใน reports/<SYMBOL>.html — cross-source verify, Fair Value ≥2 วิธี, MOS, Bear/Base/Bull 3 ปี · โหมด NEW (หุ้นใหม่จาก skeleton) / UPDATE (แก้รายงานเดิมเฉพาะจุด) / UPDATE-LIGHT (refresh เร็วจากคิว price-flags) · ใช้เมื่อสั่ง "วิเคราะห์ <SYM>", "analyze <SYM>", re-analysis, เคลียร์คิว price-flags
---

# Stock Analyzer — วิเคราะห์หุ้น 1 ตัว → `reports/<SYMBOL>.html`

**Single source of truth** ของขั้นตอนวิเคราะห์ต่อหุ้น — ใช้ทั้ง session หลักและ worker agent (agent อ่านไฟล์นี้ตรง ๆ ผ่าน `_template/agent-prompt.md`)
กติกา orchestration (เวฟ ≤3 / sequential / push รายตัว / โมเดล / ห้าม Haiku) อยู่ `CLAUDE.md §3–5` + `docs/orchestration.md` — skill นี้คือ "ทำ 1 หุ้นให้ถูกและประหยัด token"
เวลา = Asia/Bangkok (UTC+7) · วันที่ในรายงานใช้ปี พ.ศ. · ชื่อไฟล์ = `<SYMBOL>.html` พิมพ์ใหญ่เสมอ (override ชื่อ default อื่นทุกแบบ)
**★ batch tool calls:** เรียก tool ที่อิสระต่อกันหลายตัวใน**ข้อความเดียว**เสมอ (เช่น รัน script 2 ตัว + อ่านไฟล์พร้อมกัน) — ต้นทุนจริงอยู่ที่จำนวน turn (~70k cache-read/turn) ไม่ใช่ output

## STEP 0 — เลือกโหมด

- มี `reports/<SYMBOL>.html` อยู่แล้ว → **UPDATE** (แก้เฉพาะจุด **ห้าม rewrite/ห้ามเริ่ม skeleton ใหม่**)
- ยังไม่มี → **NEW** (เริ่มจาก skeleton เท่านั้น — ห้ามก๊อปรายงานหุ้นอื่น เลขเดิมจะติดมา)
- **มาจากคิว price-flags** — triage ตามเหตุผลใน `price-flags.json`:
  - `drift-gt-*` / `mos-sign-flip` / `outside-gauge-range` (ตลาดขยับ ไม่ใช่ธุรกิจเปลี่ยน) → เริ่มที่ **UPDATE-LIGHT** (STEP 5C)
  - `suspect-split-or-data` → **UPDATE เต็ม** + ตรวจ split/ticker ก่อนเขียนเลขใด ๆ
  - `fetch-failed` / `patch-failed` → ปัญหา plumbing (ticker เปลี่ยน/เพิกถอน/ประวัติกราฟ) — **ไม่ใช่งานวิเคราะห์** แจ้ง controller ไปแก้ `tools/symbol-map.json` หรือเช็คเพิกถอน
- ความสด: `reports.json` ฟิลด์ `updated` ≤7 วัน → ไม่วิเคราะห์ซ้ำ (กติกา dedup อยู่ CLAUDE.md §3.1)

## STEP 1 — เก็บข้อมูล (token-lean — จุดชี้ขาดค่าใช้จ่าย)

- **ราคา + กราฟ ~1 ปี + ป้าย % รอบปี + สี** — ห้ามดึง Yahoo เอง / ห้ามคำนวณกราฟ-bounds เอง / ห้ามแต่งจุด:
  - NEW → `node tools/fetch-facts.js <SYMBOL>` (หุ้นไทยเติม `--th` — ★ บังคับ กัน ticker ไทยชนหุ้น US เคส AIT/ORI) — ได้บล็อก chart+ป้าย+สี พร้อมวาง (= แหล่งราคาที่ 1)
  - UPDATE → `node tools/update-prices.js --write --force <SYMBOL>` — patch ราคา header/วันที่ราคา/กราฟ/ป้าย %/gauge.cur/MOS/pxIn/stock-meta ลงไฟล์เดิมให้เลย (= แหล่งราคาที่ 1) · script เตือนราคาหลุดช่วง gauge → จดไว้แก้ STEP 5B
- **EPS(TTM)/forward / P/E / ปันผล / เป้านักวิเคราะห์ / 52wk — 2 แหล่งในคำสั่งเดียว**: `node tools/fetch-fundamentals.js <SYMBOL> [--th]`
  (Yahoo quoteSummary + StockAnalysis พร้อมบรรทัด Δ เทียบสองแหล่งให้เสร็จ — รันใน batch เดียวกับ script ราคาข้างบน)
  - controller วางบล็อก `FUNDAMENTALS` มาในพรอมป์ตแล้ว → **ไม่ต้องรันซ้ำ** ใช้เลขนั้น cross-verify ได้เลย
  - script ล่มแหล่งไหน (ขึ้น ✗) → WebFetch targeted เฉพาะแหล่งนั้นแทน — prompt:
    > "Return ONLY these as short lines, no prose: current price + as-of date, EPS (TTM), forward P/E, dividend/yield, analyst target, 52-week range, latest fiscal period."
- เก็บเข้า context เฉพาะ **ตัวเลขสรุป** ไม่เก็บ HTML ดิบ · แหล่ง authoritative 2 อันพอ อย่ายิง 5

## STEP 2 — cross-source verify (บังคับก่อนเขียนตัวเลข — gate ตรวจความจริงไม่ได้)

- **ราคา**: Yahoo (script STEP 1) vs StockAnalysis ต่าง ≤~2% → ผ่าน · ระบุ "ราคา ณ วันที่ + แหล่ง" ในรายงาน
- **EPS(TTM)**:
  - NEW → ต้อง **≥2 แหล่งอิสระ** (ยิง WebFetch targeted แหล่ง EPS ที่ 2 เพิ่ม)
  - UPDATE → EPS จาก StockAnalysis ≈ EPS ในรายงานเดิม (±2%) = ยังไม่มีงบใหม่ **ถือว่ายืนยันแล้ว** (ค่าเดิมผ่าน 2 แหล่งรอบก่อน) · ต่างเกินนั้น = มีงบใหม่ → ยืนยันแหล่งที่ 2 เหมือน NEW
- ราคาต่าง >5% หรือ EPS ขัดกัน → **หยุด** — worker: รายงานกลับ controller · session หลัก: ถามผู้ใช้ · **อย่าเดา อย่าเผยแพร่**
- หุ้นยาก (IPO <1 ปี / spinoff / split / cyclical) → normalize EPS ให้ถูกก่อนเขียน (cyclical ใช้ EPS เฉลี่ยรอบวัฏจักร ไม่ใช่ peak)

## STEP 3 — Fair Value (เลือก ≥2 วิธีให้เหมาะกับหุ้น → เฉลี่ยเป็น FV + กรอบ FV_LOW–FV_HIGH)

| วิธี | สูตร | เหมาะกับ |
|---|---|---|
| **P/E Valuation** | EPS(TTM หรือ normalized) × P/E เป้าหมาย (อิงค่าเฉลี่ยประวัติ/กลุ่ม) | หุ้นกำไรปกติแทบทุกตัว |
| **DDM / Gordon Growth** | D₁/(r−g) | หุ้นปันผลสม่ำเสมอ · REIT ใช้คู่ NAV |
| **Justified P/BV** | (ROE−g)/(r−g) × BVPS | ธนาคาร/การเงิน (คู่ Residual income) |

- ธนาคาร → เน้น P/BV + Residual income · REIT → DDM/NAV (Occupancy/DPU) · หุ้นไม่ปันผล → ตัด DDM ใช้ P/E + DCF/Justified P/BV · หุ้นขาดทุน → ตัดการ์ด P/E + `stock-meta.pe/roe = null`
- gate เช็คคณิตเฉพาะวิธีชื่อ "P/E" (E21) และ "Justified P/BV" (E22) — ตั้งชื่อวิธีให้ตรงถ้าใช้
- **เซลล์ P/E เขียน `$` นำหน้า EPS เสมอ** (`EPS adj. $8.44 × P/E 20x` — ขึ้นต้นด้วยปี parser จะคว้าปีเป็น EPS)
- **MOS** = (FV − ราคา)/FV · จุดซื้อ MOS20 = FV×0.8, MOS30 = FV×0.7 · metric อื่นปรับตามเซกเตอร์ได้อิสระ (gate บังคับแค่ครบ 8 section + เลขสอดคล้องกันเอง)

## STEP 4 — คาดการณ์ผลตอบแทน 3 ปี (Bear / Base / Bull)

- แต่ละ scenario: สมมติ EPS growth/ปี → EPS ปี 3 × P/E ออก = ราคาเป้า → ผลตอบแทนรวม % จาก **จุดเข้า = ราคาปัจจุบัน** (+ ≈ %/ปี) + คำอธิบายสถานการณ์สั้น
- Base ควรสอดคล้อง FV · Bear = de-rating จริงจัง (ไม่ใช่แค่ −5%) · Bull = upside มีเหตุผล ไม่เพ้อ

## STEP 5A — เขียนรายงาน โหมด NEW (skeleton เท่านั้น)

```
cp _template/skeleton-{th|us}.html reports/<SYMBOL>.html
```
(TH → `skeleton-th.html` ฿/SET · US → `skeleton-us.html` $/NASDAQ·NYSE)
แทนทุก `{{TOKEN}}` ด้วยข้อมูลจริง — เหลือ `{{...}}` ค้าง = gate E13 บล็อก · ครบ 8 section
- **การแทนค่า = Bash เดียวผ่าน `tools/apply-edits.js`** (รูปแบบเดียวกับ STEP 5C ข้อ 3 — ห้ามใช้ Edit tool ทีละจุดทีละ turn): คิด/เตรียมข้อมูลให้ครบทุก STEP ก่อน แล้วยิงทุก token ในชุดเดียว
  - token ที่โผล่หลายจุด (`{{PRICE}}` `{{SYMBOL}}` `{{FV}}` `{{PE}}` …) → ใช้บล็อก `@@all` — ค่าเดียวกันลงทุกจุดพร้อมกัน การันตีเลขไม่เพี้ยนข้ามจุด (ต้นเหตุ E21/E22 คลาสสิก)
  - ลบ comment "วิธีใช้" หัวไฟล์ skeleton ในชุดเดียวกัน (บล็อก `@@` ทั้งก้อน → `@@=` → `@@end` โดย new ว่าง)
  - เนื้อหายาว (`{{REPORT_DATA}}` / prose ทั้ง section) = new หลายบรรทัด verbatim ได้เลย ไม่ต้อง escape
- **chart/ป้าย .chg/สี** → วางจากผลลัพธ์ fetch-facts ตรง ๆ (fairLine หลุดช่วง min/max → คำนวณ bounds ใหม่รวม FV)
- **4 บล็อกบังคับ**:
  1. `<meta name="ai-model" content="Claude <รุ่นที่รันจริง>">` (ขึ้นต้น "Claude " — build ใช้ทำเครดิต footer)
  2. `<script type="application/json" id="stock-meta">` = `{symbol, currency, price, fairValue, mos, upside, pe, dividendYield, roe}` · **`currency` = ISO 3 ตัว `"USD"`/`"THB"` ไม่ใช่ `"$"`** · เลขต้องตรงกับที่โชว์ในรายงาน
  3. `<div class="sub">` ติดใต้ `</h1>` = **คำโปรยธุรกิจจริง** คั่นด้วย `•` (เช่น `iPhone • Mac • Services`) — ไม่ใช่ "วิเคราะห์หุ้น X" ซ้ำ
  4. ป้าย `.chg` = ผลตอบแทน **รอบปี** `▲ +X.X% (รอบปี)` / `▼ −X.X% (รอบปี)` / `≈ ทรงตัว (รอบปี)` · IPO <1 ปี ใช้ `(ตั้งแต่ IPO)` · % = ผลตอบแทนปลายกราฟ section 2 · สี ขึ้น=เขียว/ลง=แดง (fetch-facts ให้ครบแล้ว)
- **สีแบรนด์** ใน `report-data.theme` เลือกตามลักษณะหุ้น ห้ามปล่อยน้ำเงิน default (ดู `tools/brand-colors.md` + `docs/templates.md`)
- disclaimer "ไม่ใช่คำแนะนำการลงทุน" + "ราคา ณ วันที่ + แหล่งที่มา" (มีใน skeleton แล้ว — เติมให้ครบ)

## STEP 5B — เขียนรายงาน โหมด UPDATE (แก้เฉพาะจุด)

1. อ่าน `reports/<SYMBOL>.html` (ราคา/กราฟ/วันที่ราคา สดแล้วจาก STEP 1) → ประเมิน EPS/FV/มุมมอง เปลี่ยนไหม
2. **แก้เฉพาะจุดที่เปลี่ยนจริง** (หลายจุด → รวมยิงใน Bash เดียวผ่าน `tools/apply-edits.js` แบบ STEP 5C ข้อ 3):
   - EPS / FV ทุกวิธี / จุดซื้อ MOS20-30 / scenario + `stock-meta` (fairValue, pe, eps, dividendYield, roe — **ยกเว้น price/mos/upside script คำนวณให้**)
   - **prose ทุกประโยคที่อ้างเลขเก่า** (จุดเข้า / "แพง~X%" / เป้า / คำบรรยายกราฟ-ทิศทาง) + มุมมอง/catalyst ที่เปลี่ยน
   - วันที่วิเคราะห์ footer "ข้อมูล ณ …" = วันนี้ · `meta ai-model` = โมเดลที่รันจริง
   - ราคาหลุดช่วง gauge (script เตือนใน STEP 1) → ขยาย gauge min/max ให้ครอบ + สอดคล้อง FV ใหม่
3. **ถ้าแก้ `stock-meta.fairValue`** → รัน `node tools/update-prices.js --write --force <SYMBOL>` ซ้ำ (MOS/upside/ป้าย MOS คำนวณใหม่จาก FV ใหม่ให้เอง — ห้ามแก้เลขพวกนี้มือ)

## STEP 5C — โหมด UPDATE-LIGHT (refresh จากคิว price-flags — เป้า ≤10 turns)

ใช้เมื่อ STEP 0 ชี้ UPDATE-LIGHT (ราคาขยับแรงแต่ไม่มีสัญญาณธุรกิจเปลี่ยน) — ทำแค่นี้ **ห้ามรื้อรายงาน/ห้ามคิด FV ใหม่โดยไม่จำเป็น**:

1. **batch เดียว**: `node tools/update-prices.js --write --force <SYM>` + `node tools/fetch-fundamentals.js <SYM> [--th]` + อ่าน `reports/<SYM>.html`
2. **จุดตัดสิน**: EPS(TTM) จาก fundamentals ≈ EPS ในรายงานเดิม (±2%) และไม่มีสัญญาณงบใหม่/split
   → FV เดิมยังยืน ไปข้อ 3 · **เกินเกณฑ์ → ยกระดับเป็น UPDATE เต็ม** (STEP 2→5B ตามปกติ)
3. **แก้ไฟล์ — 2 turns เท่านั้น**: turn แรก `grep -n` หา**ทุกจุด**ที่อ้างเลขเก่าในไฟล์ (จุดเข้า / "แพง~X%" / คำบรรยายทิศกราฟ / gauge ถ้า script เตือนหลุดช่วง / วันที่ footer / `meta ai-model`) **+ `sed -n 'X,Yp'` ดึงบรรทัดจริงของทุกจุดใน Bash เดียวกัน** → turn ถัดไป apply ทุกจุดใน **Bash call เดียว** ผ่าน `tools/apply-edits.js` (all-or-nothing — จุดไหนหาไม่เจอ/ไม่ unique = ไม่เขียนไฟล์เลย script บอกทุกจุดที่พัง แก้ block แล้วรันใหม่):
   ```bash
   node tools/apply-edits.js reports/<SYM>.html <<'EOF'
   @@
   ข้อความเดิม verbatim (หลายบรรทัดได้ ไม่ต้อง escape)
   @@=
   ข้อความใหม่
   @@end
   @@
   (บล็อกถัดไป — กี่จุดก็ได้ในคำสั่งเดียว · `@@all` แทน `@@` = replace ทุก occurrence)
   @@=
   ...
   @@end
   EOF
   ```
   ⚠ **ข้อความ "เดิม" ใน block ต้อง copy verbatim จากบรรทัดจริง (ผล `sed -n`) — ห้ามพิมพ์จากความจำ/จัดเว้นวรรคใหม่เอง** (วัดจริงเวฟ 25 ตัว 12 ก.ค. 2569: "หาไม่เจอ" 21 ครั้ง เสีย ~2-3 turns/ครั้ง = leak อันดับ 1) · ถ้า fail: error พิมพ์บรรทัดจริงที่ใกล้เคียงสุดมาให้แล้ว — copy ไปแก้ block แล้วรันใหม่ทั้งชุดได้เลย **ไม่ต้อง grep กู้เพิ่ม**
   ⚠ **ห้ามใช้ Edit tool ทีละจุดทีละ turn** — วัดจริง 12 ก.ค. 2569: worker ยิงทีละ turn 12–16 ครั้ง = +~1M cache-read/ตัว กินเป้า ≤10 turns หมด (Edit tool = fallback เฉพาะเมื่อ apply-edits fail ซ้ำ และต้องยิงทุกจุดในข้อความเดียว)
   ⚠ ห้าม grep/สำรวจ `_template/` `build.js` `test/` — สงสัยความหมาย class/gauge → `docs/templates.md` ครั้งเดียวพอ · E/W code จาก gate → `docs/quality-gate.md` เฉพาะ code นั้น
4. `npm test -- <SYM>` **ครั้งเดียว** → เขียว → คืนงาน (ไม่แตะ FV/EPS = ไม่ต้องรัน update-prices ซ้ำ)

## STEP 6 — self-check ก่อนจบ

```
npm test -- <SYMBOL>
```
ต้อง **0 error** (พลาดบ่อย: E13 token ค้าง · E28 ai-model · E29 currency ISO · E32 .sub) — แดงตรงไหนแก้ให้เขียว · code ไหนไม่เข้าใจ → อ่าน `docs/quality-gate.md` เฉพาะหัวข้อนั้น (**ห้ามขุด `test/check-reports.js`** — วัดจริง: FN เสีย ~12 turns ตรงนี้)
- session หลัก: ต่อด้วย `npm run verify` + auto-push ตาม CLAUDE.md §5
- worker agent: **ห้าม push** — รายงานกลับ controller สั้น ๆ (ราคา/FV/MOS + แหล่งที่ใช้)
