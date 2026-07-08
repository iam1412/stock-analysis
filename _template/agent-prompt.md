# Per-stock agent prompt — แม่แบบ (token-lean)

Controller ใช้แม่แบบนี้ตั้ง prompt ให้ **worker agent 1 ตัว = 1 หุ้น** (§3.2)
แทน `{{SYMBOL}}`, `{{MARKET}}` (TH/US), `{{WORKTREE}}` แล้วส่งเป็น `prompt` ของ `Agent`
ออกแบบให้ **ประหยัด token**: ดึงเว็บแบบ targeted คืนเลขสั้น, ไม่ dump หน้าเต็มเข้า context

---

วิเคราะห์หุ้น **{{SYMBOL}}** ({{MARKET}}) ทำรายงานเดียวจบใน context นี้ ห้าม push เอง

**STEP 0 — ยืนยันที่อยู่ (บังคับ กัน cwd-stray):**
```
cd {{WORKTREE}} && pwd
```
ต้องได้ path นี้เป๊ะ · **ห้าม `cd` ลง main repo** (`/Users/somchai.s/Downloads/stock`) — เขียนไฟล์ผิดที่จะหายจาก worktree

**STEP 1 — เก็บข้อมูล (token-lean · สำคัญที่สุดต่อค่าใช้จ่าย):**
- ยิง **WebFetch แบบ targeted**: prompt ของ WebFetch ให้ **คืนเฉพาะตัวเลขที่ต้องใช้เป็นบรรทัดสั้น ๆ** — ห้ามให้สรุปทั้งหน้า
  ตัวอย่าง prompt ที่ส่งเข้า WebFetch:
  > "Return ONLY these as short lines, no prose: current price + as-of date, EPS (TTM), forward P/E, dividend/yield, analyst target, 52-week range, latest fiscal period."
- **แหล่ง authoritative ก่อน** (StockAnalysis.com เป็นหลัก) → **2 แหล่งพอ cross-verify** อย่ายิง 5 แหล่งแล้วค่อยเทียบ
- **กราฟราคา ~1 ปี ยิงครั้งเดียว**: Yahoo `query1.finance.yahoo.com/v8/finance/chart/{{SYMBOL}}?range=1y&interval=1mo` → ได้ครบ ~13 จุด (จุดแรก = ~1 ปีก่อน สำหรับ % รอบปี, จุดท้าย = ราคาปัจจุบัน)
- เก็บเข้า context เฉพาะ **ตัวเลขที่สรุปแล้ว** ไม่ต้องเก็บ HTML ดิบ

**STEP 2 — cross-source verify (บังคับก่อนเขียนตัวเลข):**
- ยืนยัน **ราคาปัจจุบัน + EPS(TTM)** จาก **≥2 แหล่งอิสระ**
- ตรงกัน (ราคาต่าง ≤~2%) → ใช้เลย ระบุ "ราคา ณ วันที่ + แหล่ง"
- ต่าง >5% หรือ EPS คนละค่า → **หยุด รายงานกลับหา controller อย่าเดา/อย่าเขียน**
- หุ้นยาก (split/spinoff/cyclical ต้อง normalize EPS) → คำนวณให้ถูกก่อนเขียน

**STEP 3 — เขียนรายงาน (เริ่มจาก skeleton เท่านั้น):**
```
cp _template/skeleton-{{MARKET|lower}}.html reports/{{SYMBOL}}.html
```
(TH → `skeleton-th.html` ฿/SET · US → `skeleton-us.html` $/NASDAQ·NYSE)
แทนทุก `{{TOKEN}}` ด้วยข้อมูลจริง · อย่าก๊อปรายงานหุ้นเก่ามาแก้ · ห้ามเหลือ `{{...}}` ค้าง
ต้องมีครบ: 8 section, `meta ai-model` (โมเดลที่คุณรันจริง ขึ้นต้น "Claude "), บล็อก `stock-meta`
(`currency` = ISO 3 ตัว `USD`/`THB` **ไม่ใช่** `$`), `<div class="sub">` คำโปรยธุรกิจจริง,
header ป้าย `.chg` = ผลตอบแทน **รอบปี** (สี ขึ้น=เขียว/ลง=แดง), กราฟ section 2 = ~1 ปี ≤13 จุด (จุดท้าย=ราคา header)
· สีแบรนด์ใน `report-data.theme` เลือกตามลักษณะหุ้น (ห้ามปล่อยน้ำเงิน default)

**STEP 4 — self-check ก่อนคืนงาน (ตัดรอบ verify เสียเปล่า):**
```
npm test -- {{SYMBOL}}
```
ต้อง **0 error** (ตัวที่พลาดบ่อย: E13 token ค้าง · E28 ai-model · E29 currency ISO · E32 .sub) — แดงตรงไหนแก้ให้เขียว

**STEP 5 — คืนงาน:** รายงานกลับ controller สั้น ๆ ว่าเขียน `reports/{{SYMBOL}}.html` เสร็จ + ราคา/FV/MOS + แหล่งที่ใช้
**ห้าม `git add/commit/push` เอง** — controller push เป็นราย-เวฟ
