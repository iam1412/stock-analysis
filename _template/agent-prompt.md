# Per-stock agent prompt — แม่แบบ (token-lean)

Controller ใช้แม่แบบนี้ตั้ง prompt ให้ **worker agent 1 ตัว = 1 หุ้น** (§3.2)
แทน `{{SYMBOL}}`, `{{MARKET}}` (TH/US), `{{MODE}}` (**NEW** = ยังไม่มีรายงาน / **UPDATE** = มี `reports/<SYM>.html` อยู่แล้ว เช่น re-analysis / เคลียร์คิว price-flags), `{{WORKTREE}}` แล้วส่งเป็น `prompt` ของ `Agent`
ออกแบบให้ **ประหยัด token**: ราคา/กราฟ/ป้าย % ใช้ script deterministic (0 token) · WebFetch targeted คืนเลขสั้น · UPDATE = แก้เฉพาะจุด **ห้าม rewrite ทั้งไฟล์**

---

วิเคราะห์หุ้น **{{SYMBOL}}** ({{MARKET}} · โหมด **{{MODE}}**) ทำรายงานเดียวจบใน context นี้ ห้าม push เอง

**STEP 0 — ยืนยันที่อยู่ (บังคับ กัน cwd-stray):**
```
cd {{WORKTREE}} && pwd
```
ต้องได้ path นี้เป๊ะ · **ห้าม `cd` ลง main repo** (`/Users/somchai.s/Downloads/stock`) — เขียนไฟล์ผิดที่จะหายจาก worktree

**STEP 1 — เก็บข้อมูล (token-lean · สำคัญที่สุดต่อค่าใช้จ่าย):**
- **ราคา + กราฟ ~1 ปี + ป้าย % รอบปี + สี** — ห้ามดึง Yahoo เอง / ห้ามคำนวณกราฟ-bounds เอง:
  - NEW → `node tools/fetch-facts.js {{SYMBOL}}` (หุ้นไทยเติม `--th`) — ได้บล็อก chart พร้อมวาง (= แหล่งราคาที่ 1)
  - UPDATE → `node tools/update-prices.js --write --force {{SYMBOL}}` — patch ราคา header/วันที่ราคา/กราฟ/ป้าย %/gauge.cur/MOS/pxIn/stock-meta ลงไฟล์เดิมให้เลย (= แหล่งราคาที่ 1) · ถ้า script เตือนราคาหลุดช่วง gauge จดไว้แก้ใน STEP 3B
- **EPS(TTM)/ปันผล/เป้านักวิเคราะห์/P/E**: WebFetch **StockAnalysis.com แบบ targeted** (= แหล่งที่ 2) — prompt ให้:
  > "Return ONLY these as short lines, no prose: current price + as-of date, EPS (TTM), forward P/E, dividend/yield, analyst target, 52-week range, latest fiscal period."
- เก็บเข้า context เฉพาะ **ตัวเลขที่สรุปแล้ว** ไม่เก็บ HTML ดิบ

**STEP 2 — cross-source verify (บังคับก่อนเขียนตัวเลข):**
- **ราคา**: Yahoo (จาก script STEP 1) vs StockAnalysis ต่าง ≤~2% → ผ่าน ระบุ "ราคา ณ วันที่ + แหล่ง"
- **EPS(TTM)**:
  - NEW → ต้อง **≥2 แหล่งอิสระ** (ยิง WebFetch targeted แหล่งที่ 2 ของ EPS เพิ่ม)
  - UPDATE → ถ้า EPS จาก StockAnalysis ≈ EPS ในรายงานเดิม (±2%) = ยังไม่มีงบใหม่ **ถือว่ายืนยันแล้ว ไม่ต้องยิงแหล่งเพิ่ม** (ค่าเดิมผ่าน 2 แหล่งตอนวิเคราะห์ครั้งก่อน) · ถ้าต่างเกินนั้น = มีงบใหม่ → ยืนยันแหล่งที่ 2 เหมือน NEW
- ราคาต่าง >5% หรือ EPS ขัดกัน → **หยุด รายงานกลับหา controller อย่าเดา/อย่าเขียน**
- หุ้นยาก (split/spinoff/cyclical ต้อง normalize EPS) → คำนวณให้ถูกก่อนเขียน

**STEP 3A — เขียนรายงาน โหมด NEW (เริ่มจาก skeleton เท่านั้น):**
```
cp _template/skeleton-{{MARKET|lower}}.html reports/{{SYMBOL}}.html
```
(TH → `skeleton-th.html` ฿/SET · US → `skeleton-us.html` $/NASDAQ·NYSE)
แทนทุก `{{TOKEN}}` ด้วยข้อมูลจริง · อย่าก๊อปรายงานหุ้นเก่ามาแก้ · ห้ามเหลือ `{{...}}` ค้าง
- chart/ป้าย .chg/สี chgBg-chgColor → **วางจากผลลัพธ์ fetch-facts ตรง ๆ** (ถ้า fairLine หลุดช่วง min/max ให้คำนวณ bounds ใหม่รวม FV)
- ต้องมีครบ: 8 section, `meta ai-model` (โมเดลที่คุณรันจริง ขึ้นต้น "Claude "), บล็อก `stock-meta`
  (`currency` = ISO 3 ตัว `USD`/`THB` **ไม่ใช่** `$`), `<div class="sub">` คำโปรยธุรกิจจริง
- สีแบรนด์ใน `report-data.theme` เลือกตามลักษณะหุ้น (ห้ามปล่อยน้ำเงิน default)

**STEP 3B — เขียนรายงาน โหมด UPDATE (แก้ไฟล์เดิมเฉพาะจุด — ห้าม rewrite/ห้ามเริ่ม skeleton ใหม่):**
1. อ่าน `reports/{{SYMBOL}}.html` (ราคา/กราฟ/วันที่ราคา สดแล้วจาก STEP 1) → ประเมินว่า EPS/FV/มุมมอง เปลี่ยนไหม
2. **Edit เฉพาะจุดที่เปลี่ยนจริง:**
   - EPS / Fair Value 3 วิธี / จุดซื้อ MOS 20-30% / scenario + `stock-meta` (fairValue, pe, eps, dividendYield, roe — **ยกเว้น price/mos/upside script คำนวณให้**)
   - **prose ทุกประโยคที่อ้างเลขเก่า** (จุดเข้า / "แพง~X%" / เป้า / คำบรรยายกราฟ-ทิศทาง) + มุมมอง/catalyst ที่เปลี่ยน
   - วันที่วิเคราะห์ footer "ข้อมูล ณ …" = วันนี้ · `meta ai-model` = โมเดลที่คุณรันจริง
   - ราคาปัจจุบันหลุดช่วง gauge min/max (script เตือนใน STEP 1) → ขยายช่วง gauge ให้ครอบ + สอดคล้อง FV ใหม่
3. **ถ้าแก้ `stock-meta.fairValue`** → รัน `node tools/update-prices.js --write --force {{SYMBOL}}` ซ้ำอีกครั้ง (MOS/upside/ป้าย MOS จะคำนวณใหม่จาก FV ใหม่ให้เอง — ห้ามแก้เลขพวกนี้มือ)

**STEP 4 — self-check ก่อนคืนงาน (ตัดรอบ verify เสียเปล่า):**
```
npm test -- {{SYMBOL}}
```
ต้อง **0 error** (ตัวที่พลาดบ่อย: E13 token ค้าง · E28 ai-model · E29 currency ISO · E32 .sub) — แดงตรงไหนแก้ให้เขียว

**STEP 5 — คืนงาน:** รายงานกลับ controller สั้น ๆ ว่าเขียน `reports/{{SYMBOL}}.html` เสร็จ + ราคา/FV/MOS + แหล่งที่ใช้
**ห้าม `git add/commit/push` เอง** — controller push เป็นราย-เวฟ
