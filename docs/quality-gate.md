# Quality gate — รายละเอียดเต็ม

> สรุปย่อ + คำสั่งอยู่ใน `CLAUDE.md §7` — ไฟล์นี้คือรายละเอียดไล่ทีละชั้น/ทีละ error
> **enforcement จริงอยู่ในโค้ด `test/*.js`** เอกสารนี้เป็นคำอธิบายประกอบเท่านั้น

มี gate หลายชั้น ต้องผ่านทั้งหมด **ก่อน push เสมอ** (มี `pre-push` hook บังคับซ้ำ 6 ขั้น):

```bash
npm run verify           # ★ ครบชุด 6 ขั้น: check-reports → build → build-test → engine-exec → skeleton-test → check-site
npm test                 # ชั้น 1 อย่างเดียว (= node test/check-reports.js)  •  npm test -- BBL  = เฉพาะบางตัว
npm run test:build       # ชั้น 1.5 อย่างเดียว (unit-test build.js: เครดิตโมเดล + freshHash)
npm run test:engine      # ชั้น 1.7 อย่างเดียว (รัน engine ทุกรายงานใน mock DOM)  •  test:engine -- BBL = เฉพาะบางตัว
npm run test:skeleton    # ชั้น skeleton อย่างเดียว (เติม token โครงต้นแบบ TH/US แล้วผ่าน gate)
npm run check:site       # ชั้น 2 อย่างเดียว (ต้อง build ก่อน)
npm run test:self        # meta-test: พิสูจน์ว่า checker เองยังจับ bug ได้ (รันหลังแก้ checker)
```

## ชั้น 1 — `test/check-reports.js`
ตรวจ source `reports/<SYMBOL>.html` ทีละไฟล์ — 38 error + 11 warning

### ตารางอ้างอิง code ครบชุด (E01–E38 · W01–W12)

> ดึงจาก field `id`/`level`/`label` ของ `CHECKS` ใน `test/check-reports.js` · คอลัมน์ "เกณฑ์+วิธีแก้" สรุปจากตัว `fn` และค่าคงที่ `TOL_*` ในไฟล์เดียวกัน — **gate ฟ้อง code ไหน เปิดตารางนี้แล้วแก้ได้เลย ไม่ต้องขุด test/ ไม่ต้อง survey รายงานตัวอื่น** · ไม่มี W11 (ยกระดับเป็น E36 แล้ว) · แก้/เพิ่ม check ในโค้ด → อัปเดตแถวในตารางนี้ด้วย

| code | level | ตรวจอะไร | เกณฑ์ + วิธีแก้ (ย่อ) |
|------|-------|-----------|------------------------|
| E01 | error | DOCTYPE html | ต้องมี `<!doctype html>` เป็นอย่างแรกของไฟล์ |
| E02 | error | `<html lang="th">` | ต้องมี attribute `lang="th"` บน `<html>` |
| E03 | error | ปิด `</html>` | ไฟล์ต้องจบด้วย `</html>` ไม่มีอะไรต่อท้าย |
| E04 | error | title มีชื่อย่อหุ้น | `<title>` ต้องมีสตริงชื่อย่อตรงตามชื่อไฟล์ |
| E05 | error | มี `<h1>` | ต้องมีและข้อความไม่ว่าง |
| E06 | error | ครบ 8 section | ต้องเจอ `<div class="n">1</div>` … `8` ครบทุกเลข — ขาดเลขไหนเติม section นั้น |
| E07 | error | กราฟราคา | ต้องมี `id="priceChart"` |
| E08 | error | เครื่องคิดเลข MOS | ต้องครบ 3 อย่าง: `#pxIn` + `#mosOut` + `const FV=` |
| E09 | error | gauge ราคา | ต้องมี `#mCur` + `#mFair` |
| E10 | error | disclaimer | ต้องมีข้อความ "ไม่ใช่คำแนะนำ" |
| E11 | error | footer | ต้องมี `<footer>` |
| E12 | error | ราคา+วันที่+แหล่งที่มา (header) | header ต้องมีราคา `.px` + ปีของวันที่ (ค.ศ./พ.ศ.) + คำระบุแหล่ง (ที่มา/แหล่ง/อ้างอิง/source) |
| E13 | error | ไม่มี placeholder ค้าง | ห้ามเหลือ `[SYMBOL]`-family · `${…}` · `{{…}}` · `STOCK_DATA` — เติมค่าจริงทุก token |
| E14 | error | ไม่มี undefined/NaN | เนื้อหาที่มองเห็นห้ามมีคำ `undefined`/`NaN` — render พลาด แก้ที่ต้นทาง |
| E15 | error | FV ใน JS = FV ในกล่อง | `const FV` ต่างจาก `.fv-box` ได้ ≤1% — แก้ให้เท่ากันทั้งสองจุด |
| E16 | error | MOS = (FV−ราคา)/FV | MOS ที่โชว์ (`.big`) = (FV−ราคา)/FV×100 ต่างได้ ≤2 จุด% — คำนวณใหม่จากราคา/FV ปัจจุบัน |
| E17 | error | ≥2 วิธีประเมินมูลค่า + Fair Value | `.vmethod` ≥2 บล็อก + มีกล่อง `.fv-box` |
| E18 | error | จุดซื้อ MOS20/30 = FV×0.8 / ×0.7 | กล่อง MOS20 = FV×0.8 · MOS30 = FV×0.7 ต่างได้ ≤2.5% — FV เปลี่ยนต้องคูณใหม่ทั้งคู่ |
| E19 | error | gauge marker ตรงกับ ราคา/FV | `gpos()` ของ `mCur` = ราคา header · `mFair` = FV ต่างได้ ≤2% — แก้เลขใน script |
| E20 | error | Fair Value อยู่ในกรอบ low–high | FV ต้องอยู่ใน "กรอบ lo–hi" ที่เขียนใน `.fv-box` และ lo ≤ hi |
| E21 | error | วิธี P/E: ค่า = EPS × P/E ในคำอธิบาย | `.mval` = EPS × P/E ที่เขียนใน `.mdesc` ต่างได้ ≤3% — แก้เลขใน desc/val ให้คูณกันลงตัว |
| E22 | error | วิธี P/BV: ค่า = ratio × BVPS, ratio = (ROE−g)/(r−g) | `.mval` = ratio×BVPS ต่างได้ ≤3% · ratio = (ROE−g)/(r−g) ต่างได้ ±0.05 (ตรวจเมื่อ r>g) — เลขทุกตัวอยู่ใน `.mdesc` |
| E23 | error | ราคา header = ค่าตั้งต้นเครื่องคิดเลข | ราคา `.px` = `value` ของ `#pxIn` ต่างได้ ≤2% — อัปเดตราคาต้องแก้ทั้งสองจุด |
| E24 | error | scenario: EPS ปี3 = EPS ฐาน×(1+g)³ | ต่างได้ ≤5% ทุกคอลัมน์ Bear/Base/Bull — เปลี่ยน g ต้องคูณใหม่ |
| E25 | error | FV ในสรุป (verdict) = FV ในกล่อง | "มูลค่าเหมาะสม" ใน `.vgrid` = FV กล่อง ต่างได้ ≤2% |
| E26 | error | gauge scale: เรียงขึ้น + MOS20/30 = FV×0.8/0.7 | ป้าย `.scale` ต้องเรียงน้อย→มาก + ป้าย MOS20/30 บนแกน = FV×0.8/0.7 ต่างได้ ≤2.5% |
| E27 | error | ราคาไม่เก่า/ไม่อยู่อนาคต | เก่า >120 วัน (`STALE_ERROR_DAYS`) หรืออยู่อนาคต >7 วัน = error — รัน `update-prices --write --force <SYM>` |
| E28 | error | ระบุโมเดล AI (meta ai-model) | `<meta name="ai-model">` ต้องขึ้นต้น "Claude " ห้ามว่าง/placeholder |
| E29 | error | มีบล็อก stock-meta (JSON ครบ key) | `symbol` = ชื่อไฟล์ · `currency` = ISO 3 ตัว · price/fairValue/mos/upside = ตัวเลข · pe/dividendYield/roe = ตัวเลขหรือ null |
| E30 | error | stock-meta = เลขที่โชว์ (ราคา/FV/MOS) | price ±2% ของ header · fairValue ±1% ของกล่อง · mos ±2 จุด% — แก้เลขที่โชว์แล้วต้องแก้ stock-meta ตามทุกครั้ง |
| E31 | error | stock-meta สอดคล้องในตัว (mos/upside) | mos = (FV−price)/FV×100 ต่างได้ ±2 จุด% · upside = (FV−price)/price×100 ต่างได้ ±5% (ขั้นต่ำ 0.6) |
| E32 | error | คำโปรยธุรกิจใต้ `<h1>` (.sub → desc การ์ด index) | `<div class="sub">` ใต้ `<h1>` ยาว ≥10 อักขระ สรุปว่าบริษัททำอะไร |
| E33 | error | CSS var ที่อ้างถึงต้องถูกนิยาม (กันสี/พื้นหลังหายเงียบ) | ทุก `var(--x)` ที่ไม่มี fallback ต้องถูกนิยามในไฟล์ — เปลี่ยนไปอ้าง var ที่มีในพาเลต หรือเพิ่มนิยาม |
| E34 | error | สีป้าย change ตรงทิศทาง (เขียว=ขึ้น/แดง=ลง) | ▼/− ห้ามคู่สีเขียว · ▲/+ ห้ามคู่สีแดง — แก้ `theme.chgBg/chgColor` ให้ตรงทิศ ("ทรงตัว" ข้าม) |
| E35 | error | header % = ผลตอบแทนรอบปี (รอบปี) | `.chg` ต้องมีคำ "รอบปี" (IPO <1 ปี ใช้ "ตั้งแต่ IPO") + ▲/▼+ตัวเลข% หรือ "ทรงตัว" |
| E36 | error | % รอบปี = ผลตอบแทนปลายกราฟ (จุดแรก→ท้าย) | % ใน `.chg` = (จุดท้าย−จุดแรก)/จุดแรก×100 ของ `chart.data` ต่างได้ ≤12 จุด% — ใช้ % จาก script ราคา ห้ามคิดเอง |
| E37 | error | กราฟ ~1 ปี (ไม่เกิน ~13 จุด) | `chart.data` ≤13 จุด — เกินให้ตัดเหลือ ~12 เดือนล่าสุด (`tools/migrate-annual-chg.js`) |
| E38 | error | contrast ธีมอ่านออก (WCAG AA) | ทุกคู่ตัวหนังสือ/พื้นหลังที่ theme คุม ≥4.5 (accent เส้นกราฟ ≥3): ขาว+สีอ่อน (subColor/headerMuted/verdictText/vcellLabel) บนจุดสว่างสุดของ `darkGrad` · ขาวบน badge · accentDark บน blue-soft · chgColor บน chgBg — **แก้อัตโนมัติ: `node tools/fix-contrast.js <SYM> --write`** (ซ่อมเฉพาะ field ที่ตก คงโทนแบรนด์) · ธีมใหม่จาก `pick-brand.js`/`makeTheme` ผ่านโดยอัตโนมัติ |
| W01 | warn | scenario: EPS×P/E ≈ ราคาเป้า | ราคาเป้า (tgt) = EPS ปี3 × P/E ออก ต่างได้ ≤7% ต่อคอลัมน์ |
| W02 | warn | สกุลเงินปน | สกุลหลัก = สัญลักษณ์หน้า `.px` — รายงาน ฿ ไม่ควรมี $ ในเนื้อหา (และกลับกัน) |
| W03 | warn | CSS เพี้ยน .seg-label | พบ `transform:transl(` — แก้เป็น `translate(` หรือลบ dead CSS |
| W04 | warn | สี verdict ตรงกับโซน MOS | โซน MOS: **bad <10% · ok 10–20% · good ≥20%** — warn เมื่อ class ข้ามโซน 2 ขั้น (bad↔good) — แก้ `class="mos-verdict …"` ให้ตรงโซน MOS ใหม่ |
| W05 | warn | FV ≈ ค่าเฉลี่ยวิธีที่แสดง | FV กล่องต่างจากค่าเฉลี่ย `.mval` ทุกวิธีได้ ≤7% |
| W06 | warn | สรุป "ส่วนต่างจากราคา" ตรงกับ MOS | ทิศ: MOS < −3% ห้ามเขียน "ถูก/MOS+" · MOS > +3% ห้ามเขียน "แพง/เต็มมูลค่า" (โซนกลาง ±3% เขียน "เต็มมูลค่า/แฟร์" ได้) · เลข % ในเซลล์ต่างจาก MOS จริงได้ ≤2.5 จุด — แก้ prose ในเซลล์นั้นให้ตรง MOS จริง |
| W07 | warn | ตัวเลขพื้นฐานสมเหตุสมผล | ราคา >0 · P/E (0, 600] · P/BV (0, 20] · yield 0–20% · ROE −100–200% — หลุดวิสัย = เช็คหน่วย/พิมพ์ผิด |
| W08 | warn | แหล่งข้อมูล ≥3 + อ้างอิงครบ | header ระบุแหล่ง ≥3 (คั่นด้วย , / •) + เนื้อหามี "เป้า/นักวิเคราะห์" + "52 สัปดาห์" + งวดงบ (FY/ไตรมาส) |
| W09 | warn | ความสดของราคา | อายุราคา >45 วัน (`STALE_WARN_DAYS`) แต่ ≤120 — ควรรัน update-prices ก่อน push |
| W10 | warn | stock-meta P/E·Yield·ROE ≈ ที่โชว์ | เทียบเลขที่โชว์: pe ±5% (ขั้นต่ำ 0.1) · dividendYield ±10% (ขั้นต่ำ 0.15) · roe ±8% (ขั้นต่ำ 0.5) |
| W12 | warn | label จุดกราฟไม่ว่าง | ทุกจุด `chart.data` = `["label", ตัวเลข]` — label ห้ามว่าง (กัน `["",v]`) |

### คำอธิบายประกอบตามกลุ่ม

- **โครงสร้าง:** DOCTYPE/`lang="th"`/ปิด `</html>`, `<title>` มีชื่อย่อ, `<h1>`, ครบ 8 section, กราฟ, gauge, เครื่องคิดเลข MOS, disclaimer, footer, header (ราคา+วันที่+แหล่งที่มา), **meta `ai-model` (E28: ต้องระบุโมเดล AI ที่ใช้วิเคราะห์ ขึ้นต้น "Claude ")**, **คำโปรยธุรกิจ `<div class="sub">` ใต้ `<h1>` (E32: ต้องมี + ยาวพอ → build ดึงเป็น `desc` โชว์บนการ์ดหน้า index)**
- **ตัวเลขสอดคล้องกันเอง:** `const FV` = Fair Value กล่อง = FV ในสรุป (vgrid) • MOS = (FV−ราคา)/FV • จุดซื้อ MOS20/30 = FV×0.8/0.7 (ทั้งกล่องและแกน gauge) • ราคา header = ค่าตั้งต้นเครื่องคิดเลข • **คณิตแต่ละวิธี: P/E = EPS×P/E, Justified P/BV = ratio×BVPS และ ratio=(ROE−g)/(r−g)** • scenario: EPS ปี3 = EPS ฐาน×(1+g)³ และ tgt = EPS×P/E
- **stock-meta (screener) [E29–31, W10]:** บล็อก `<script id="stock-meta">` JSON ครบ key + ชนิดถูก + symbol/currency ตรง (E29) • ตัวเลข = ที่โชว์จริง: price/fairValue/MOS ตรงกล่อง (E30) + mos/upside สอดคล้องราคา&FV (E31) • (warn W10) pe/yield/roe ≈ ที่โชว์เท่าที่ดึงได้
- **ความสด/แหล่งข้อมูล:** ราคาไม่เก่า > 120 วัน/ไม่อยู่อนาคต (warn > 45 วัน) • (warn) แหล่งข้อมูล ≥3 + มีราคาเป้า/52 สัปดาห์/งวดงบ • (warn) ตัวเลขพื้นฐานอยู่ในวิสัย (P/E, P/BV, yield, ROE)
- **ไม่มีของค้าง:** placeholder `[SYMBOL]`/`${...}`/`{{...}}`, `undefined`/`NaN`, สกุลเงินปน
- **CSS var ครบ (E33):** ทุก `var(--x)` ที่อ้างในรายงาน (รวม theme.badge/chgBg + inline style) ต้องถูกนิยามใน `<style>` เดียวกัน (ข้าม `var(--x, fallback)`) — กันสี/พื้นหลัง "หายเงียบ ๆ" (เช่น badge อ้าง `var(--orange)` ที่ยังไม่อยู่ในพาเลต → พื้นหลังเลขหัวข้อ 1–8 หาย)
- **ป้าย change รอบปี ↔ สี/กราฟ (E34, E35, E36, E37, W12) [E34/W12 มิ.ย. 2026; E35–37 เพิ่ม มิ.ย. 2026 จากกฎ "header = % รอบปี + กราฟ ~1 ปี"]:**
  - **E34** ทิศทางป้าย `.chg` (▲/▼, +/−) ต้องตรงกับสี `theme.chgBg/chgColor` — **ลง = แดง, ขึ้น = เขียว** (เคส HMPRO/CPF ใส่ ▼ −X% บนพื้นเขียว = push ไม่ได้; "ทรงตัว"/ไม่มีลูกศร = ข้าม)
  - **E35** ป้าย `.chg` **ต้องเป็นผลตอบแทน "รอบปี"** (มีคำว่า "รอบปี" หรือ "(ตั้งแต่ IPO)" สำหรับหุ้น IPO ใหม่) + มีทิศทาง+ตัวเลข หรือ "ทรงตัว" — **% รายวัน/YTD/52 สัปดาห์/ป้ายว่าง = push ไม่ได้**
  - **E36** % รอบปี **ต้อง = ผลตอบแทนปลายกราฟ** (จุดแรก→จุดท้าย, ต่าง ≤ 12 จุด %) — header กับกราฟต้องมาจากชุดราคาเดียวกัน (เดิมเป็น warning W11 → เลื่อนเป็น error เพราะ "รอบปี" บังคับแล้ว) · "ทรงตัว" (ไม่มี %) = ข้าม
  - **E37** กราฟ section 2 ต้อง **~1 ปี — ไม่เกิน 13 จุด** (รายเดือน 12 เดือน = 13 จุด · รายสองเดือน = ~8 จุด) · 18 เดือน/1.5 ปี = push ไม่ได้ (ตัดให้เหลือ ~12 เดือนล่าสุด · `tools/migrate-annual-chg.js` ทำให้ได้)
  - **(warn W12)** ทุกจุดกราฟต้องมี label แกน x ไม่ว่าง (กัน `["",value]`)
  > ⚠️ **สิ่งที่ E34/E36 ตรวจไม่ได้:** ราคาในกราฟ **ตรงกับราคาตลาดจริงไหม** — gate ไม่มี network/ข้อมูลจริง จับได้แค่ "header % รอบปี ↔ ปลายกราฟ สอดคล้องกัน" เท่านั้น · ความถูกต้องของ **ข้อมูลกราฟ ~1 ปี + ราคา ~1 ปีก่อน** ต้องเป็นราคาจริงตอนสร้าง — ใช้ `node tools/fetch-facts.js <SYM> [--th]` (หุ้นใหม่) / `node tools/update-prices.js --write --force <SYM>` (อัปเดตหุ้นเดิม) ห้ามดึง/แต่งเอง (ดู memory `chart-data-must-be-real`)

## ชั้น 1.5 — `test/build-test.js`
unit-test ฟังก์ชันใน build.js — require แบบไม่รัน build จริง

- **freshHash:** เปลี่ยน/เพิ่ม meta `ai-model` **หรือบล็อก `stock-meta`** → hash เท่าเดิม (วันที่ไม่ขยับ) แต่เนื้อหาวิเคราะห์จริงเปลี่ยน → hash เปลี่ยน
- **injectModelCredit:** แทน "stock-analyzer workflow" → เครดิตโมเดล + fallback ผนวกท้าย `<footer>` • **decorateReport:** per-report model ไหลจาก meta → footer ถูกตัว (Opus/Sonnet) + ตกลงค่ากลาง `AI_MODEL` เมื่อไม่มี tag
- **extractMetrics / pickHighlight / computeLeaders:** ดึง metric จากบล็อก `stock-meta` → เลือก "จุดเด่น" ของหุ้นต่อการ์ด (tier ของแต่ละ metric + ป้ายมงกุฎ 👑 เมื่อเป็นค่าดีสุดในกลุ่ม) · computeLeaders หาค่าดีสุดต่อ metric (มาก = ดีสุด, P/E น้อย = ดีสุด ข้ามค่าติดลบ)
- **extractMeta `desc`:** ดึงคำโปรยธุรกิจจาก `<div class="sub">` ใต้ `<h1>` + ถอด HTML entity (`&amp;` → `&` กัน double-escape ตอน render) → ฟิลด์ `desc` ที่โชว์บนการ์ด (ไม่มี `.sub` → `desc = ""` การ์ด fallback ไป title)
- **gridFmt/dataFmt scope:** `validateReportData` แยก regex ต่อฟิลด์ — gridFmt อ้าง `v` เท่านั้น, dataFmt อ้าง `d[1]` เท่านั้น (ผิด scope = throw กัน ReferenceError ตอน render)
- **validateReportData guards (กัน render พังเงียบที่ค่า "ผ่าน JSON แต่ทำให้ NaN/Infinity"):** chart.max>min, gauge.max>min (กันหาร 0 → พิกัด NaN), fv>0 (กัน MOS Infinity), chart.data ทุกจุด = `[string, finite number]`, grid ตัวเลขล้วน · **ค่าสี theme** = hex/rgb/hsl/var/gradient ที่ถูกต้อง + ห้ามมี `;{}` (กัน CSS declaration breakout/inject + hex 5 หลัก → เส้นกราฟล่องหน)

## ชั้น 1.7 — `test/engine-exec.js`
รัน engine ที่ build bake แล้ว ของทุกรายงานใน mock DOM — ปิดช่อง "syntax ผ่านแต่ runtime พัง"

- check-site แค่ `new Function(body)` ตรวจ syntax — **ไม่เคยรันโค้ด** → ReferenceError/throw ตอนรันจริงหลุดได้ (เช่น dataFmt อ้าง `v` นอก scope → กราฟ/gauge/calc ดับทั้ง IIFE เงียบ ๆ)
- expand รายงาน → ดึง `<script>` engine (ตัวที่อ้าง `priceChart`) → รันด้วย `new Function('document', body)(mockDoc)` (engine อ้าง `document` ตัวเดียว, ไม่ต้องใช้ vm/ไม่มี dependency) → assert: **ไม่ throw** + กราฟวาดจริง (`priceChart.innerHTML` มี `<path`+`<circle`) + เข็ม gauge ถูกตั้ง `style.left` + เครื่องคิดเลข MOS ให้ผล + **ไม่มีพิกัด `NaN`/`Infinity`** (กัน "render สำเร็จแต่ล่องหน" จาก bounds degenerate)
- **มี self-check ในตัว** (รันก่อนตรวจจริง): พิสูจน์ว่า harness จับ engine ที่จงใจทำพัง (ป้ายจุดอ้าง `v` นอก scope → throw, และ bounds degenerate → พิกัด NaN) ได้ — กัน harness กลายเป็น no-op

## ชั้น skeleton — `test/skeleton-test.js`
กำกับโครงต้นแบบ `_template/skeleton-{th,us}.html` (ดู `docs/templates.md`)

- โครงครบ (marker, `stock-meta`/`report-data`, `.sub`, 8 section, footer, สกุลเงินถูก ฿/$) + **เติม `{{TOKEN}}` ด้วยข้อมูลจริง (ไทย = HMPRO) แล้วผ่าน check-reports (0 error) + engine รันได้** + token coverage (ชุดเติมต้องครอบคลุมทุก token)

## ชั้น 2 — `test/check-site.js`
ตรวจ `dist/` หลัง build — ระดับเว็บไซต์

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
