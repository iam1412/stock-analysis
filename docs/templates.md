# Template system (รายงาน content-only) + สีแบรนด์ต่อหุ้น

> `CLAUDE.md §9` มีแค่หลักการสั้น ๆ + pointer มาที่นี่ · ไฟล์นี้คือรายละเอียดเต็ม

รายงานใน `reports/` เป็นแบบ **content-only template** — โครงที่ซ้ำทุกไฟล์ (CSS + engine วาดกราฟ/gauge/เครื่องคิดเลข)
อยู่ใน `_template/` (`dashboard.css`, `engine.js`) แล้ว `build.js` **`expandReport()` inject ตอน build/ตรวจ**
ไฟล์รายงานเก็บแค่ **เนื้อหา + ข้อมูลต่อหุ้น**:

- **`<script type="application/json" id="report-data">`** ใน `<head>` — ตัวเลขกราฟ/gauge + **ธีมสี** ต่อหุ้น:
  `{ theme:{accent, accentDark, darkGrad, glow, subColor, headerMuted, verdictText, vcellLabel, badge, chgBg, chgColor},
     chart:{data, min, max, grid, fairLine, currency, highlight, gridFmt?, dataFmt?}, gauge:{min,max,cur,fair,fairLabelTop}, fv }`
  · `highlight` = ดัชนีจุดที่ไฮไลต์บนกราฟ (เช่น `[6,7]`) · `currency` = สัญลักษณ์ (`$`/`฿`) · `gridFmt`/`dataFmt` = นิพจน์ format ป้าย (เช่น `v.toFixed(2)` หุ้นราคาต่ำ)
- marker `<!--TEMPLATE:STYLE-->` (ใน head) + `<!--TEMPLATE:ENGINE-->` (ก่อน `</body>`) = จุดที่ build inject โครง
- **★ ตัวย่อหุ้นใน header (`.px small` = `({{SYMBOL}})` ข้างราคา) ใช้สีเดียวกับราคา** (`color:inherit` = ขาว) ใน `_template/dashboard.css` — **อย่าเปลี่ยนกลับไปใช้ `var(--header-muted)`** (alpha ต่ำ ทำให้ตัวย่อกลืนพื้นหลัง อ่านไม่ออก — แก้ มิ.ย. 2569 ตาม user) · แก้ที่ dashboard.css ที่เดียว → ทุกรายงาน content-only ได้สีใหม่อัตโนมัติตอน build
- บล็อก `stock-meta` (ป้าย/มงกุฎการ์ด), meta `ai-model`, `<div class="sub">`, body 8 section, footer = **คงไว้ในไฟล์เหมือนเดิม**
- ไฟล์ HTML เต็มแบบเก่า (ไม่มี marker) → `expandReport` คืนค่าเดิมเป๊ะ (backward-compatible)

## โครงต้นแบบ (skeleton) — จุดตั้งต้นของรายงานใหม่
- `_template/skeleton-th.html` (หุ้นไทย ฿/SET) · `_template/skeleton-us.html` (หุ้นต่างประเทศ $/NASDAQ·NYSE) — โครง content-only เปล่า ๆ มีครบ 8 section + marker + บล็อก `stock-meta`/`report-data` + comment กำกับทุกช่อง
- **ทุกค่าต่อหุ้นเป็น `{{TOKEN}}`** (ไม่มีตัวเลขหุ้นเก่าติดมา ต่างจากการก๊อปรายงานเดิม) — `cp` แล้วแทนทุก token · เหลือ `{{...}}` ค้าง = **gate E13 บล็อก**
- อยู่ใน `_template/` (ไม่ใช่ `reports/`) → ไม่ถูก build เป็นหน้า/ไม่ถูก gate ตรวจเป็นรายงานจริง · ทั้งสองไฟล์ต่างกันแค่สัญลักษณ์สกุลเงิน/ตลาด (โครงเดียวกัน)
- `test/skeleton-test.js` กำกับ: เติม token ด้วยข้อมูลจริง (ไทย = HMPRO จริง) แล้ว **ต้องผ่าน check-reports (0 error) + engine รันได้** + token coverage (เพิ่ม token แล้วลืมอัปเดต = เทส fail)

## สีแบรนด์ — เลือกตาม "ลักษณะของหุ้น" ทุกตัว (ห้ามปล่อย default น้ำเงิน)
ทุกรายงานต้องมีสีเฉพาะตัวใน `report-data.theme` — **มีสีแบรนด์/โลโก้จำได้ใช้สีนั้น** (Google ฟ้า, Tesla/TSMC แดง, Accenture ม่วง, PANW ส้ม…),
**ไม่มีก็เลือกตามเซกเตอร์** (photonics→teal/cyan/magenta/violet · foundry/metrology→copper/bronze · power/energy→เขียว · memory→amber · cybersecurity→ส้ม/แดง)
- หลักการ + เหตุผลรายตัว + วิธีทำ: ดู **`tools/brand-colors.md`** (record ถาวร)
- เครื่องมือ: เก็บ "สีเมล็ด" 1 ค่า/หุ้นใน `tools/seeds.json` → `node tools/brandtheme.js tools/seeds.json --write` (`makeTheme()` สร้างธีมเต็มจาก seed ด้วย HSL)

## เครื่องมือ (`tools/`)
- `migrate.js <SYM…> [--write]` — แปลง HTML เต็ม → content-only + **round-trip faithful check** (resolve CSS var→สีจริง + body verbatim + stock-meta + brand/engine values ตรงเป๊ะจึงเขียน ไม่งั้น flag ปล่อย old-style)
- `brandtheme.js` — `makeTheme(seed)` → ธีมเต็มชุด · `preserve-dates.js` — คงวันที่ `updated` หลัง migrate (source เปลี่ยน → freshHash ขยับ → ดึงวันเดิมจาก git HEAD)
- gate ครอบคลุม template: `check-reports.js` ตรวจ **หลัง** expand · `build-test.js` ทดสอบ `expandReport`/validate · `engine-exec.js` รัน engine จริง · `skeleton-test.js` กำกับโครงต้นแบบ
