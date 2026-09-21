# Data source fallbacks — เมื่อแหล่งข้อมูลผิดหรือสองแหล่งขัดกัน

> ไฟล์นี้คือ **ขั้นตอนที่ทดสอบแล้ว + แหล่งสำรอง** สำหรับ worker วิเคราะห์หุ้น — เพื่อไม่ให้จบที่ BLOCKED โดยไม่ได้ลองทางอื่น
> ทุกคำสั่งในไฟล์ทดสอบจริงเมื่อ **22 ก.ย. 2569** (Asia/Bangkok) · ที่ล้มเหลวเขียนตามจริงพร้อมอาการ — ห้ามเดาว่าใช้ได้
> ขั้นตอนต่อหุ้น = `.claude/skills/stock-analyzer/SKILL.md` · pre-fetch = `npm run queue -- prep <SYM>` (`docs/orchestration.md`) · กับดักเลข vendor เชิงลึก = memory `data-source-traps.md` (ไม่อยู่ในรีโป)
> ข้อห้ามคงเดิม: ราคาต่างระหว่างแหล่ง >5% (exit 2 ของ prep) = หยุดถามผู้ใช้ · ห้ามเขียนตัวเลขที่ไม่ได้เปิดต้นฉบับ

## 0. ตารางตัดสินใจ (อาการ → แหล่งแรก → สำรอง → เมื่อไรหยุด)

| อาการ | ลองแหล่งนี้ก่อน | สำรอง | หยุดเป็น BLOCKED เมื่อ (แนบหลักฐานอะไร) |
|---|---|---|---|
| **US** EPS TTM ของ Yahoo ≠ StockAnalysis (SA) เกิน ~5% | §1 SEC XBRL `EarningsPerShareDiluted` รายไตรมาส → รวม 4 ไตรมาสล่าสุด (§2) | exhibit 99.1 ของ 8-K (ถ้าเพิ่งประกาศงบ) · `IncomeLossFromContinuingOperationsPerDilutedShare` (ถ้ามี discontinued ops) | XBRL ไม่มีไตรมาสล่าสุด (filingDate เก่ากว่างบที่ประกาศแล้ว) **และ** 8-K ก็ไม่มี — แนบ URL + `filingDate` ที่ดึงได้ + ตัวเลขของทุกแหล่ง |
| **US** เห็น EPS ติดลบ/ต่างฐาน (adj vs GAAP, discontinued ops recast) | §1 XBRL ทั้ง 2 tag เทียบกัน | อ่านบรรทัด "Non-GAAP … per diluted share" ใน exhibit 99.1 | สองฐานยังตีความไม่ได้ว่าอันไหนตรงกับสมมติฐาน valuation ของใบนั้น — แนบตารางฐาน×ค่า |
| **US** คอลัมน์ "TTM (\<เดือน\>)" ของ SA ค้าง >1 ไตรมาส | §1 XBRL + §2 (รวม 4 ไตรมาสเอง) | ตาราง quarterly ของ SA (`?p=quarterly`) รวมเอง | ไตรมาสที่ขาดคำนวณ Q4 ไม่ได้ (ไม่มี FY หรือ 9 เดือน) |
| **ไทย (SET)** Yahoo ≠ SA ≠ รายงานเดิม (เคส M) | §3 เว็บ IR ของบริษัท → หน้า "Financial Highlights" (EPS รายปี) + ไฟล์งบ/MD&A (PDF) | SA ตาราง quarterly (`stockanalysis.com/quote/bkk/<SYM>/financials/?p=quarterly`) รวม §2 | เปิดไฟล์งบต้นฉบับไม่ได้ (PDF อ่านเป็นข้อความไม่ได้) และไตรมาสที่ขาดคำนวณจาก FY − 9 เดือนไม่ได้ — ส่งกลับให้ controller ทำมือ พร้อม URL ไฟล์งบที่หาเจอ |
| ADR / หุ้นสองกระดาน มัธยฐานดูเพี้ยน (P/E ต่ำ/สูงผิดปกติ) | §5 `--median-spec <SYM>:<ticker กระดานท้องถิ่น>` | ตรวจ FX + อัตรา ADS เอง (เครื่องมือไม่แก้ให้) | หาอัตรา ADS/FX จากแหล่งปฐมภูมิ (20-F/แบบ 56-1) ไม่ได้ |
| แหล่งสำรองตอบ **403** (โดยเฉพาะ sec.gov) | **ตรวจ User-Agent ก่อนสรุปว่าล่ม** (§1: `www.sec.gov` ต้อง UA แบบ ชื่อ+อีเมลติดต่อ · `data.sec.gov` รับ "Mozilla/5.0") | ลองใหม่ด้วย UA ที่ถูกต้อง | ยังได้ 403 ทั้งที่ UA ถูกต้อง 2 รอบ — แนบ URL + UA ที่ใช้ (ไม่ต้องแนบอีเมล) + เวลา |
| Yahoo/SA/Google Finance ล่ม (503, "device not supported") | ลองใหม่ทีหลังหนึ่งครั้ง (แหล่งชั่วคราวเคยกลับมาเอง) | แหล่งปฐมภูมิ (§1 / §3) | ทุกแหล่งปฐมภูมิล่มซ้ำ 2 รอบ — แนบ URL + HTTP status + เวลา |
| Ticker ถูกเพิกถอน/ควบรวม (Yahoo ไม่ 404 แต่ quote ค้าง) | §4 ข้อ 5 | SEC Form 25 / ประกาศตลาด | ยืนยันแหล่งปฐมภูมิไม่ได้ — ห้ามลบรายงานเอง ส่งกลับ controller |

**หลักการ:** แหล่งสำรอง "ชี้ขาด" ได้ก็ต่อเมื่อเป็นงบต้นฉบับ (SEC XBRL, exhibit 99.1, ไฟล์งบ SET/IR) — เลขจาก vendor ตัวที่สามไม่ใช่ตัวตัดสิน · BLOCKED ต้องมีตาราง "แหล่ง · ค่า · งวด · ฐาน (GAAP/adj)" ของทุกแหล่งที่ลองแล้ว ไม่ใช่แค่ "ข้อมูลขัดกัน"

---

## 1. SEC EDGAR สำหรับหุ้น US

**กฎ User-Agent (ทดสอบ 22 ก.ย. 69):**
- `curl` เปล่า (ไม่มี `-A`) → **HTTP 403** ทั้ง `www.sec.gov/files/company_tickers.json` และ `data.sec.gov` companyconcept · WebFetch ก็ถูกปฏิเสธ (บันทึกใน memory)
- `www.sec.gov/files/company_tickers.json` → **403** เมื่อ UA = `"Mozilla/5.0"` **และ** เมื่อ UA = ชื่อโปรเจกต์เปล่า ๆ (`"StockResearch"`) (หน้า HTML ขนาด 1.9 KB) · ได้ **200** (800 KB, 10,459 รายการ) เฉพาะเมื่อ UA มี **ชื่อ + ที่อยู่ติดต่อ** ตามนโยบาย fair-access ของ SEC
- `data.sec.gov` (`submissions`, `companyconcept`) → รับ `-A "Mozilla/5.0"` ได้ (**200**)
- รูปแบบ UA ที่ใช้กับ `www.sec.gov`: `"<ชื่อโปรเจกต์> <อีเมลติดต่อ>"` — **เจ้าของรีโปเป็นผู้เลือกสตริงติดต่อ** (ห้ามใส่อีเมลส่วนตัวลงในเอกสาร/ไฟล์ที่ commit) · ตัวแปรสภาพแวดล้อม `SEC_USER_AGENT` (งานพี่น้อง PR #56 / W11 ที่ยังไม่ merge จะอ่านค่านี้) — ระหว่างนี้ส่งด้วย `-A` เอง
- แผน: จะมีแผนที่ ticker→CIK ที่ commit ในรีโป (งานพี่น้อง ยังไม่ merge) เพื่อไม่ต้องดึง `company_tickers.json` ทุกครั้ง
- **403 จาก fallback ให้ตรวจ User-Agent ก่อนสรุปว่าแหล่งล่ม** (ดูตารางข้อ 0)
- ใช้ `rtk proxy curl` เสมอ — hook rtk ตัด/ย่อ output ได้ (§6)

**ขั้น 1 — ticker → CIK** (`cik_str` เติมศูนย์ให้ครบ 10 หลัก):
```bash
rtk proxy curl -sA "<ชื่อโปรเจกต์> <อีเมลติดต่อ>" https://www.sec.gov/files/company_tickers.json > tickers.json   # UA ต้องมีชื่อ+ที่อยู่ติดต่อจริง
python3 -c "import json;d=json.load(open('tickers.json'));print([v for v in d.values() if v['ticker']=='AAPL'])"
# → [{'cik_str': 320193, 'ticker': 'AAPL', 'title': 'Apple Inc.'}]   ⇒ CIK0000320193
```
ticker ที่มีจุด (BRK.B) — SEC ใช้รูปแบบของตัวเอง ให้ค้นด้วย `title` ถ้าไม่เจอ

**ขั้น 2 — EPS diluted (ทดสอบ AAPL, 200):**
```bash
rtk proxy curl -sA "Mozilla/5.0" https://data.sec.gov/api/xbrl/companyconcept/CIK0000320193/us-gaap/EarningsPerShareDiluted.json
```
JSON ที่ได้อยู่ใน `units["USD/shares"]` เป็นรายการ `{start,end,val,form,filed,...}` — **ต้องแยกงวดด้วยความยาว `end−start`**: ~90 วัน = ไตรมาส · ~181 = 6 เดือนสะสม · ~272 = 9 เดือนสะสม · ~363 = ปีเต็ม · รายการเดียวกันซ้ำหลายแถว (งบเดียวกันถูกอ้างเป็น comparative) จึง dedup ด้วย `(start,end)`

**ขั้น 3 — filing ล่าสุด** (`submissions`, 200):
```bash
rtk proxy curl -sA "Mozilla/5.0" https://data.sec.gov/submissions/CIK0000320193.json
# filings.recent.{form,filingDate,reportDate} → กรอง form ∈ {10-Q,10-K}
```
ผลทดสอบ AAPL: `10-Q 2026-07-31 (งวด 2026-06-27)` · `10-Q 2026-05-01` · `10-Q 2026-01-30` · `10-K 2025-10-31` — ใช้เช็คว่า XBRL ตามงบล่าสุดทัน (ถ้า `filingDate` ล่าสุดเก่ากว่างบที่บริษัทประกาศไปแล้ว = XBRL ยังไม่ทัน ใช้ exhibit 99.1 ของ 8-K แทน)

**ตัวอย่างที่ตรวจแล้ว — AAPL (ปีงบสิ้น ก.ย.)** ค่า `val` หลัง dedup:

| งวด (start → end) | ความยาว | EPS diluted | form |
|---|---|---|---|
| 2025-09-28 → 2025-12-27 | 90 วัน | 2.84 | 10-Q |
| 2025-12-28 → 2026-03-28 | 90 วัน | 2.01 | 10-Q |
| 2026-03-29 → 2026-06-27 | 90 วัน | 2.02 | 10-Q |
| 2025-09-28 → 2026-06-27 | 272 วัน (9 เดือน FY26) | 6.88 | 10-Q |
| 2024-09-29 → 2025-06-28 | 272 วัน (9 เดือน FY25) | 5.62 | 10-Q |
| 2024-09-29 → 2025-09-27 | 363 วัน (FY25) | 7.46 | 10-K |

- **ไตรมาส Q4 ไม่มีแถวของตัวเอง** (10-K รายงานเฉพาะปีเต็ม) ⇒ Q4 FY25 = 7.46 − 5.62 = **1.84**
- TTM ถึง 27 มิ.ย. 2026 = 1.84 + 2.84 + 2.01 + 2.02 = **8.71** · วิธีลัด: FY25 − 9M FY25 + 9M FY26 = 7.46 − 5.62 + 6.88 = **8.72** — ต่าง 0.01 เพราะ EPS รายไตรมาสปัดเศษ (ผลรวมไตรมาส 6.87 vs 9 เดือน 6.88) ⇒ ยึดวิธีลัด (ใช้ค่าสะสมที่บริษัทรายงานเอง) แล้วแจ้งว่าต่างเพราะปัดเศษ

**tag สำรอง — `IncomeLossFromContinuingOperationsPerDilutedShare`:** ใช้เมื่อมี discontinued ops (EPS รวมกับ EPS ต่อเนื่องต่างกัน · เคส IFF) · **ไม่ใช่ทุกบริษัทมี tag นี้** — AAPL ให้ **404** (ไม่มี discontinued ops จึงไม่รายงาน) ซึ่งเป็นผลปกติ ไม่ใช่ error · IFF (CIK0000051253) ให้ 200: Q2/2026 (2026-04-01→06-30) 0.13 · 6M/2026 0.73 · Q2/2025 2.14 · 6M/2025 2.40 (ปีก่อนถูก recast — สังเกต filed 2026-08-04) ⇒ EPS ที่ vendor รายงานอาจรวม/ไม่รวม discontinued ops ให้เลือกฐานให้ตรงกับที่รายงานเขียนไว้ ไม่ใช่ตามเลขที่ดึงมา

**ผลที่พิสูจน์แล้วจากแคมเปญ (bug-ledger EXT-003):** HIG (Yahoo TTM 14.48 vs SA 15.48) → XBRL TTM 15.47 (ตรง SA) · IFF (Yahoo −3.09 vs SA 1.08) → XBRL 1.07 (ตรง SA + recast)

---

## 2. คำนวณไตรมาสที่ขาด + TTM

รูปแบบ (ใช้ได้ทั้ง US และไทย — ต้องเป็น EPS ฐานเดียวกันทุกตัว: basic กับ basic หรือ diluted กับ diluted, ไม่ปนกับ adjusted):

1. **ไตรมาสที่ 4** = EPS ปีเต็ม (FY) − EPS สะสม 9 เดือน (หรือ FY − (Q1+Q2+Q3) ถ้ามีรายไตรมาสครบ)
2. **TTM** = ผลรวม EPS ของ 4 ไตรมาสล่าสุดที่ปิดแล้ว
3. วิธีลัดเมื่อมีค่าสะสม: TTM = FY ก่อนหน้า − สะสมงวดเดียวกันปีก่อน + สะสมงวดปัจจุบัน (ตัวอย่างจริง §1)
4. ⚠️ **ปีที่จำนวนหุ้นเปลี่ยนมาก** (แตกพาร์/ออกหุ้นใหม่) การบวก EPS รายไตรมาสไม่เท่ากับ กำไรสุทธิ TTM ÷ หุ้น — ให้เทียบ `กำไรสุทธิ TTM ÷ หุ้นถัวเฉลี่ย` อีกทางหนึ่งเป็น sanity check

**เคส M (MK Restaurant, SET) — เฉพาะวิธี ไม่ยืนยันค่า TTM ในไฟล์นี้:** ข้อมูลรายไตรมาสที่ SA ให้ (ทดสอบ 22 ก.ย. 69, ตาราง quarterly): Q3/25 = 0.25 · Q1/26 = 0.18 · Q2/26 = 0.24 · Q2/25 = 0.30 · (Q1/25 0.26) — **Q4/25 ขาดทั้งใน SA (ไม่มีคอลัมน์ Dec-2025) และ Yahoo** ⇒
- `Q4/25 = EPS ปี 2568 (FY2025) − (Q1/25 + Q2/25 + Q3/25)` โดย FY2025 ต้องมาจากงบ/MD&A/หน้า Financial Highlights ของบริษัท (§3) ไม่ใช่ vendor
- `TTM ณ Q2/26 = Q3/25 + Q4/25 + Q1/26 + Q2/26`
- ห้ามใช้คอลัมน์ "TTM (Sep '25)" ของ SA เป็น TTM ปัจจุบัน (ค้างมากกว่าหนึ่งไตรมาส §4 ข้อ 4) · แล้วเทียบผลกับ Yahoo TTM และรายงานเดิมเป็นเช็คขั้นสุดท้าย — ต่างกันเกิน 5% ต้องบอกที่มาของส่วนต่างในรายงาน

---

## 3. หุ้นไทย (SET) — ทดสอบแล้วว่าหน้าไหนให้ตัวเลข หน้าไหนให้แค่ลิงก์ (ทดสอบด้วย M, 22 ก.ย. 69)

| แหล่ง | วิธี | ผล |
|---|---|---|
| set.or.th `…/quote/M/financial-statement/company-highlights` | WebFetch | **ให้แต่ลิงก์** — ตาราง "Company Highlights" มีหัวปี 2017–2021 แต่ไม่มีตัวเลข (ราคา + ลิงก์ไฟล์งบเท่านั้น) ⇒ อย่าใช้เป็นแหล่ง EPS |
| settrade.com `…/equities/quote/M/financial-statement` | WebFetch | **ไม่มีตัวเลข** — โครงเมนู/ลิงก์เท่านั้น |
| Yahoo `finance.yahoo.com/quote/M.BK/financials/` | WebFetch / curl | WebFetch **HTTP 503** · curl `-A "Mozilla/5.0"` **HTTP 404** — ใช้ไม่ได้ (ยืนยันซ้ำกับที่ worker เจอ) |
| Google Finance `google.com/finance/quote/M:BKK` | WebFetch / curl | curl **302**; WebFetch ได้หน้า "Your device isn't supported" ไม่มีข้อมูล (ใช้ได้แค่ราคา — memory: GF ไม่ใช่แหล่ง EPS) |
| เว็บ IR บริษัท (M: `investor.mkrestaurant.com`) | WebFetch | **ใช้ได้ระดับลิงก์**: หน้าแรกแสดงลิงก์ไฟล์งบ Q2/2026, MD&A FY2025, งานนำเสนอผล, ลิงก์ 56-1/รายงานประจำปี (`/en/downloads/annual-report`) · หน้าเว็บแบรนด์ `mkrestaurant.com/en/investor-relations` = 404 ให้ไปที่โดเมน `investor.` ตรง ๆ |
| IR → `…/en/financial-info/financial-highlights` | WebFetch | **ให้ตัวเลข แต่รายปีเท่านั้น**: EPS 2023 = 1.83 · 2024 = 1.57 · 2025 = 0.93 (ไม่มีรายไตรมาส · ยังไม่ได้ยืนยันกับงบต้นฉบับ — ใช้เป็นตัวตั้งของ §2 แล้วตรวจกับ MD&A/งบ) |
| ไฟล์งบ/MD&A PDF (`m.listedcompany.com/misc/...pdf`) | curl `-L -A "Mozilla/5.0"` | **ดาวน์โหลดได้** (200, `application/pdf`, ~416 KB) แต่ **อ่านเป็นข้อความไม่ได้ในสภาพแวดล้อมนี้**: เครื่องไม่มี `pdftotext`/`pdftoppm` (Read pages ล้ม) และ WebFetch ตอบว่าเนื้อหาเป็นไบนารีบีบอัด ⇒ ถ้าต้องอ่านงบ PDF ต้องติดตั้ง poppler (`brew install poppler`) หรือให้ controller อ่านมือ |
| StockAnalysis `stockanalysis.com/quote/bkk/M/financials/?p=quarterly` | WebFetch | **ให้ตัวเลขรายไตรมาส** (Q2/26 0.24 · Q1/26 0.18 · Q3/25 0.25 · Q2/25 0.30 · Q1/25 0.26 …) แต่ **ไม่มี Q4/25** ⇒ ใช้ร่วมกับ §2 |

ลำดับที่แนะนำ: (1) ตาราง quarterly ของ SA → (2) หน้า Financial Highlights ของ IR (EPS รายปี) → §2 คำนวณไตรมาสที่ขาด → (3) ยืนยันกับไฟล์งบ/MD&A ต้นฉบับ (ถ้าอ่านได้) · ก่อน pre-fetch ต้องอ่าน `stock-meta.currency` = THB แล้วใส่ `--th` เสมอ (memory 6h: AU = AngloGold ไม่ใช่ After You)

ล้มทุกช่องทางที่ยืนยันเลขปีเต็มจากงบต้นฉบับได้ → BLOCKED ให้ controller แก้มือ (เคส M ปิดที่นี่ — ดู bug-ledger EXT-004)

---

## 4. กับดัก vendor ที่เกิดซ้ำ (เฉพาะที่ลงมือได้)

1. **"Forward EPS" อาจเป็น FY ถัดจากปีถัดไป** — Yahoo `epsFwd` / fwd P/E ของ SA ไม่ระบุงวด (เคส SITM: แสดง FY2027E แทน FY2026E) · จับด้วย `ราคา ÷ คอนเซนซัส FY ปัจจุบัน` เทียบ fwd P/E ที่ vendor โชว์ ไม่ตรง = คนละงวด · ชี้ขาดที่ `stockanalysis.com/stocks/<SYM>/forecast/` (แยกรายปี + ระบุ non-GAAP) (ledger: "vendor epsFwd = FY+2")
2. **adj vs GAAP** — EPS เปรียบต้องฐานเดียวกัน: prep เดิมเทียบ `baseEps` (non-GAAP/forward) กับ vendor GAAP TTM ⇒ สัญญาณกลับด้าน (BUG-011: ADSK ฟ้องปลอม, FTNT ไม่ฟ้อง; BUG-018: ALC/AEHR/AER ใช้ proxy/normalized เทียบ IFRS/GAAP) ⇒ **เทียบ `values.eps` (ฐานเดียวกับ vendor) ไม่ใช่ EPS ที่ใช้ทำ FV** · ตาราง TTM ที่ vendor ให้อาจเป็น GAAP ขณะรายงานใช้ non-GAAP
3. **หุ้นถัวเฉลี่ย ≠ หุ้นคงเหลือ** — `Shares` ของ vendor เป็นถัวเฉลี่ยงวด ไม่ใช่ ณ วันนี้ (หลัง IPO/แตกพาร์/แปลงบุริมสิทธิ/ควบรวมต่างกันมหาศาล) · ตัวชี้ขาด = หน้าปก 10-Q/10-K ("As of \<date\>, the registrant had N shares … outstanding" แยกคลาส) หรืองบดุลใน exhibit 99.1 · EPS หลังควบรวมของ vendor = กำไรบริษัทเก่า ÷ หุ้นบริษัทใหม่ (เคส VMRK) · ส่วนต่าง NI กับ NIAC ≠ 0 = มีบุริมสิทธิ/NCI อย่าเชื่อ EPS ของ vendor ตัวใดตัวหนึ่ง
4. **หัวคอลัมน์ "TTM (\<เดือน\>)" ของ SA ค้าง** — SA บางหน้าแสดง TTM ของงวดที่เก่ากว่างบล่าสุดหลายไตรมาส (M: "TTM (Sep '25)" EPS 1.20 ทั้งที่มีงบถึง Q2/26) ⇒ อ่านหัวคอลัมน์ทุกครั้งก่อนเอาค่า · เทียบกับไตรมาสล่าสุดที่บริษัทประกาศ · ค้าง >1 ไตรมาส = ไม่ใช้ค่านั้น ใช้ §2 (ledger EXT-004: แผน test ป้องกันให้ prep เตือนเมื่อค้าง >1 ไตรมาส — ยังเป็นงานเปิด)
5. **Yahoo ไม่ 404 เมื่อหุ้นถูกเพิกถอน** — serve quote ค้าง ⇒ drift 0% (เคส EA/BPP) · ห้ามสรุปจาก quote ค้างอย่างเดียว · ยืนยันด้วยแหล่งปฐมภูมิ (SEC Form 25/ประกาศตลาด) · ควบรวม = ลบรายงาน ไม่ใช่เปลี่ยนชื่อ (`tools/symbol-map.json` ใช้เฉพาะเปลี่ยน ticker/ชื่อ)
6. **Yahoo TTM ตามงบใหม่ไม่ทันวันเดียวกัน** — เคส KEYS: EPS TTM ยังเป็นค่าก่อนงบที่เพิ่งออก · หุ้นที่เพิ่งประกาศงบให้อ่าน exhibit 99.1 ก่อนตัดสินว่าใครถูก
7. **tolerance หุ้นขาดทุน** — Δ% หลอกตา (AAOI −0.77 vs −0.79 = 2.5% แต่ต่าง $0.02) — ใช้ค่าสัมบูรณ์ 0.03 ประกอบ

---

## 5. ADR / หุ้นสกุลเงินต่างประเทศ

**ปัญหา:** งบบน SA เป็นสกุลท้องถิ่น (UMC = NT$, BABA = RMB) แต่ราคา ADR เป็น USD และ 1 ADR = N หุ้น ⇒ บล็อกมัธยฐานของ `prep` (`tools/median-multiples.js`) จะหาร **ราคา USD ÷ EPS สกุลท้องถิ่น** = ตัวคูณผสมสองฐาน (เคส CP/UMC 9 ก.ย. 69; BUG-003)

**วิธีแก้ที่มีในเครื่องมือ:** ระบุ ticker กระดานท้องถิ่นให้ prep — รูปแบบ `SYM:<Yahoo ticker กระดานท้องถิ่น>`:
```bash
npm run queue -- prep UMC --median-spec UMC:2303.TW              # รับทั้ง --median-spec X และ --median-spec=X
npm run queue -- prep BRK.B --median-spec BRK.B:BRK-B            # SA ใช้จุด แต่ Yahoo ใช้ขีด
node tools/median-multiples.js UMC:2303.TW                       # รันตรงเพื่อดูผลก่อน
```
(`--median-spec` เป็น value-flag ใน `tools/queue/args.js` → ส่งเป็น `medianSpec` เข้า `prep()` ใน `tools/queue/prep.js` — ถ้าไม่ระบุ ใช้ `SYM` ตรง ๆ · เมื่อ prep ตรวจพบผสมสกุลจะเตือนให้รันซ้ำด้วย flag นี้)

**ทดสอบ 22 ก.ย. 69 (`node tools/median-multiples.js`):** `UMC` เปล่า → P/E มัธยฐาน **2.1x** (ราคาเฉลี่ย USD 7.14 ÷ EPS NT$ 3.31 = ผิดฐาน) · `UMC:2303.TW` → มัธยฐาน **13.4x** (ราคาเฉลี่ย NT$ 44.48 ÷ EPS NT$ 3.31; ช่วง 6.3–13.7x) ⇒ ตัวเลขที่ถูกคือแบบมี spec · (`--median-spec` ผ่าน `npm run queue -- prep` ไม่ได้รันในการทดสอบนี้เพราะเขียนไฟล์ใน `.queue/`; ตรวจจากโค้ดว่าเป็นทางเดียวกับที่ทดสอบข้างต้น)

**ข้อจำกัด (ตรงตาม BUG-015 ใน `docs/campaign-2026-09-bug-register.md`):** flag นี้เปลี่ยนแค่ ticker ราคา — **ไม่แปลงอัตรา ADS หรือ FX** ให้ ⇒ มัธยฐานที่ได้เป็น P/E ในสกุลท้องถิ่น (ใช้เป็นตัวคูณกับ EPS สกุลท้องถิ่นได้) แต่เมื่อคิดเป็นราคา ADR ต้องคูณ ADS ratio และ FX เอง แล้วยืนยันจาก 20-F/แหล่งปฐมภูมิ · `tools/symbol-map.json` ใช้เมื่อ **ticker เปลี่ยน/ปรับโครงสร้าง** (`yahoo`/`sa`/`tv`) ไม่ใช่เพื่อแก้สกุลเงิน

---

## 6. สภาพแวดล้อม (เจอซ้ำในแคมเปญ — ledger EXT-001/002/005)

- **rtk hook ตัด/ย่อ output เงียบ ๆ** ⇒ งานนับ/เทียบตัวเลขใช้ `rtk proxy <cmd>` (เช่น `rtk proxy curl -sA "Mozilla/5.0" <url>`) ไม่งั้นได้ตัวเลขผิด
- **`sed -i` ล้มภายใต้ rtk hook** ("-I or -i may not be used with stdin") — ใช้ Edit tool หรือ `apply-edits` แทน (ทำให้ worker เสีย 1 turn ต่อครั้ง — EXT-001, 7/30 ใบ)
- **python3 = 3.9** — สคริปต์ที่มีภาษาไทยต้องขึ้นต้น `# -*- coding: utf-8 -*-` (หรือ `PYTHONUTF8=1`) ไม่งั้น "Non-UTF-8 code" (EXT-002)
- **auto-mode classifier บางครั้ง rate-limit/ปฏิเสธคำสั่ง** (EXT-005: `--heal-derived --write` denied; ลองใหม่แล้วผ่าน) — **ลองใหม่ 1 ครั้ง** ก่อนถือว่าคำสั่งใช้ไม่ได้
- **คำสั่งที่ประกอบด้วยตัวแปร shell ภายใน `rtk proxy ...`** อาจถูก sandbox ของ worktree ปฏิเสธ — ใช้ path/URL ตรง ๆ แยกคำสั่ง
- เครื่องไม่มี `pdftotext`/`pdftoppm` (ทดสอบ 22 ก.ย. 69) ⇒ **`brew install poppler`** — งบที่มีแต่ PDF (เช่น งบ Q2/2026 และ MD&A FY2025 ของ M) อ่านเป็นข้อความไม่ได้ถ้าไม่ติดตั้ง · หมายเหตุตามจริง: ผู้เขียนไม่ได้ยืนยัน Q4/25 ของ M จากไฟล์เหล่านั้น
- tradingview MCP อาจต่อไม่ติด (CONNECTION_CLOSED) — ไม่พึ่งเป็นแหล่งเดียว (Yahoo chart + SEC พอ)

---

## 7. ป้ายการ์ด P/E — ค่าที่ "วัดได้" ต้องบอกในป้าย

cron/`patchDerived` คำนวณการ์ด P/E ใหม่ด้วยราคา spot (GAP-012: การ์ด "P/E FY2025 (วัดได้) ~10.8x" ของ TIDLOR เคยถูกเขียนทับด้วย P/E ปัจจุบัน) · เพื่อไม่ให้ถูกคำนวณใหม่:

- การ์ดที่แสดง **ตัวคูณที่วัดแล้ว** (ราคาเฉลี่ยของปีงบที่ผ่านมา ÷ EPS ปีนั้น) ต้องมี **`วัดได้`**, **`measured`** หรือ **`ราคาเฉลี่ย ÷`** อยู่ในป้าย เพื่อให้ healer ข้าม
- การ์ด **Forward / NTM / FY…E** = ราคา spot ÷ EPS คาดการณ์ — **อัปเดตตามราคาโดยตั้งใจ** ห้ามใส่คำข้างต้น
- ป้ายเชิงประวัติที่ healer ข้ามอยู่แล้ว (`PE_LABEL_SKIP` ใน `tools/derived-values.js`): เฉลี่ย · มัธยฐาน · median · average · avg · peer · mid-cycle · ย้อนหลัง · historic · ประวัติ · เป้า · target · กรอบ · ช่วง
- คำ `วัดได้` / `measured` / `ราคาเฉลี่ย ÷` เข้า `PE_LABEL_SKIP` **ตั้งแต่ PR #56 / W11** (งานพี่น้อง ยังไม่ merge ณ 22 ก.ย. 69) — ก่อนหน้านั้นโค้ดข้ามเฉพาะคำในรายการข้างบน จึงควรตั้งป้ายด้วยคำที่อยู่ในรายการนั้นด้วย

---

## 8. หมายเหตุคิว

ถ้า `npm run queue -- preflight` พิมพ์บรรทัด `⚠ statement unknown: N (fetch-failed M)` (บรรทัดนี้มี **ตั้งแต่ PR #56 / W11** — งานพี่น้อง ยังไม่ merge และยังไม่มีในโค้ดที่ทดสอบ 22 ก.ย. 69) ⇒ **รัน preflight ซ้ำก่อนเริ่มคิว** — การดึงล้ม (`fetch-failed`) ไม่ได้แปลว่างบเปลี่ยน แต่ถ้าไม่ลองใหม่ แถวเหล่านั้นจะถูก escalate เงียบ ๆ (fetch-failed เป็น bucket PLUMBING ใน `tools/queue/triage.js` — ไม่ควรกลายเป็นงานวิเคราะห์เพราะเน็ตสะดุด) · ยังล้มซ้ำ = แจ้ง controller พร้อมรายชื่อ symbol
