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
- **ทุกค่าต่อหุ้นเป็น `{{TOKEN}}`** (ไม่มีตัวเลขหุ้นเก่าติดมา ต่างจากการก๊อปรายงานเดิม) — **อ่าน skeleton เป็นโครง → compose เนื้อหาครบ → Write ไฟล์เต็มใบครั้งเดียว** (SKILL STEP 5A · เลิกวิธี `cp`+ไล่แทน token แล้ว 13 ก.ค. 2569 — เปลือง ~20 turns) · เหลือ `{{...}}` ค้าง = **gate E13 บล็อก**
- อยู่ใน `_template/` (ไม่ใช่ `reports/`) → ไม่ถูก build เป็นหน้า/ไม่ถูก gate ตรวจเป็นรายงานจริง · ทั้งสองไฟล์ต่างกันแค่สัญลักษณ์สกุลเงิน/ตลาด (โครงเดียวกัน)
- `test/skeleton-test.js` กำกับ: เติม token ด้วยข้อมูลจริง (ไทย = HMPRO จริง) แล้ว **ต้องผ่าน check-reports (0 error) + engine รันได้** + token coverage (เพิ่ม token แล้วลืมอัปเดต = เทส fail)

## ตัวอย่าง filled (NEW) — worker อ่านตรงนี้จบ **ห้าม Read/grep/sed ไฟล์ใน `reports/` ตัวอื่นทุกกรณี** / ไม่ต้องทดลอง `node -e` หา format

> ตัวอย่างจริงจาก `reports/CGNX.html` (US · ราคา $66.80 · FV $50.00) · ข้อ 2 (วิธีที่ 2)/4 (ตัวปกติ)/6–7 จาก `reports/KTOS.html` (US · ราคา $48.19 · FV $50.00) — โหมด NEW compose เนื้อหาครบทุก STEP แล้ว **Write ทั้งไฟล์ครั้งเดียว** (SKILL STEP 5A)
> บล็อกไหนหาไม่เจอในหน้านี้ = ใส่ตามแบบตัวอย่างที่ใกล้สุดที่มี แล้วให้ gate (`npm test -- <SYM>`) จับ — ถูกกว่าไปขุดรายงานตัวอื่น (วัดจริง 13 ก.ค. 2569: HON เผา 5–6 turns grep/Read/sed รายงาน sibling ทั้งที่ทุกบล็อกอยู่ในนี้แล้ว)

### 1) บล็อก `report-data` ทั้งก้อน

```html
<script type="application/json" id="report-data">
{
  "theme": {
    "accent": "#20ead1",
    "accentDark": "#11b19e",
    "darkGrad": "linear-gradient(135deg,#043e37 0%,#077366 58%,#0cb6a2 140%)",
    "glow": "rgba(22,233,208,.35)",
    "subColor": "#c2ebe6",
    "headerMuted": "#a5d4ce",
    "verdictText": "#d0f1ed",
    "vcellLabel": "#a6ddd7",
    "chgBg": "var(--green-soft)",
    "chgColor": "#1e8e3e"
  },
  "chart": {
    "data": [["ส.ค.25", 43.94], ["ก.ย.25", 45.3], ["ต.ค.25", 41.39], ["พ.ย.25", 38.1],
             ["ธ.ค.25", 35.98], ["ม.ค.26", 38.74], ["ก.พ.26", 54.4], ["มี.ค.26", 48.99],
             ["เม.ย.26", 55.51], ["พ.ค.26", 65.85], ["มิ.ย.26", 72.42], ["ก.ค.26", 66.8]],
    "min": 30, "max": 80, "grid": [40, 50, 60, 70],
    "fairLine": 50, "currency": "$", "highlight": [4, 9]
  },
  "gauge": { "min": 30, "max": 80, "cur": 66.8, "fair": 50 },
  "fv": 50
}
</script>
```

ใครให้ค่าอะไร — **ห้ามคิดเอง field ที่ script ให้**:

| field | ที่มา |
|---|---|
| `chart.data / min / max / grid / currency` + ป้าย `.chg` + `theme.chgBg/chgColor` | `node tools/fetch-facts.js <SYM> [--th]` พิมพ์พร้อมวาง (ขึ้น=เขียว `var(--green-soft)`/`#1e8e3e` · ลง=แดง `var(--red-soft)`/`#c5221f`) |
| `chart.fairLine` = `gauge.fair` = `fv` | FV ที่คำนวณ STEP 3 (ค่าเดียวกันทั้ง 3 จุด) · fairLine หลุดช่วง min/max → คำนวณ bounds ใหม่รวม FV |
| `chart.highlight` | `[ดัชนีจุดต่ำสุด, ดัชนีจุดสูงสุด]` ของ chart.data เรียงน้อย→มาก (กติกาเดียวกับ update-prices.js — cron จะ normalize ให้ทุกวันอยู่แล้ว) |
| `gauge.min/max` | ช่วงที่ครอบทั้งราคาปัจจุบัน + FV + จุดซื้อ MOS30 (ใช้เลขเดียวกับ chart.min/max ได้ถ้าครอบ) |
| `gauge.cur` | ราคาปัจจุบัน (เลขเดียวกับ header/stock-meta.price) |
| `theme` 8 คีย์แรก | `makeTheme()` — สูตร 3 บรรทัด ข้อ 6 |

### 2) การ์ดวิธี valuation (`vmethod`) + กล่องสรุป FV

```html
<div class="vmethod">
  <div><div class="mname">1. P/E Valuation</div><div class="mdesc">EPS forward (NTM) $1.48 × P/E เป้าหมาย ~36x — เหตุผลที่เลือก EPS/P/E นี้สั้น ๆ</div></div>
  <div class="mval">$53.28</div>
</div>

<div class="fv-box">
  <div class="l">มูลค่าเหมาะสมเฉลี่ย (Fair Value)<br><span style="font-weight:400;font-size:12px;color:var(--muted)">กรอบ $46.72 – $53.28</span></div>
  <div class="r">$50.00</div>
</div>
```

วิธีที่ 2 ขึ้นไป / วิธีที่ไม่ใช่ P/E — **โครง HTML เดียวกันเป๊ะ เปลี่ยนแค่ข้อความ 3 จุด** (`mname`/`mdesc`/`mval`) — ตัวอย่างจริงวิธี P/S จาก `reports/KTOS.html`:

```html
<div class="vmethod">
  <div><div class="mname">2. P/S (Price-to-Sales) Valuation</div><div class="mdesc">รายได้คาดการณ์ FY69 (2026E) ต่อหุ้น $9.34 (จาก $1.75B ÷ 187.33M หุ้น) × P/S เป้าหมาย ~5.8x — ต่ำกว่า P/S ปัจจุบัน 6.36x เล็กน้อย</div></div>
  <div class="mval">$54.17</div>
</div>
```

- วิธีชื่อ "P/E" → gate E21 เช็คคณิต `EPS × P/E = mval` จริง (คลาด ≤3%) · **เขียน `$` นำหน้า EPS เสมอ** (ขึ้นต้นด้วยปี parser จะคว้าปีเป็น EPS) · วิธีชื่อ "Justified P/BV" → E22
- วิธีชื่ออื่น (P/S · DCF · DDM · EV/Sales · NAV · Residual income) gate **ไม่เช็คคณิต** — ใช้โครงข้างบนได้เลย ไม่มี format พิเศษต้องตามหาอีก
- ≥2 วิธี → `fv-box` = ค่าเฉลี่ย + กรอบ = ค่าต่ำสุด–สูงสุดของทุกวิธี

### 3) บล็อก gauge + scale (section 4)

```html
<div class="gauge">
  <div class="gbar" id="gbar">
    <div class="marker cur" id="mCur"><div class="lab">ปัจจุบัน $66.80</div></div>
    <div class="marker" id="mFair"><div class="lab" style="background:#1e8e3e">เหมาะสม $50.00</div></div>
  </div>
  <div class="scale">
    <span>$35.00<br><small>MOS 30%</small></span>
    <span>$40.00<br><small>MOS 20%</small></span>
    <span style="text-align:center">$50.00<br><small>Fair Value</small></span>
    <span style="text-align:right">$53.28<br><small>กรอบบน FV</small></span>
    <span style="text-align:right">$77.40<br><small>เป้าเฉลี่ย Analyst</small></span>
  </div>
</div>
```

(id `gbar/mCur/mFair` คงตามนี้ — engine หาตาม id · ตำแหน่ง marker engine คำนวณจาก `report-data.gauge` เอง · MOS30 = FV×0.7, MOS20 = FV×0.8)

### 4) บล็อก `stock-meta` — ตัวปกติ + เคสขาดทุน/ไม่จ่ายปันผล

ตัวปกติ (ตัวอย่างจริง `reports/KTOS.html` — มีกำไร จึงมี `pe`/`roe` เป็นเลขจริง):

```html
<script type="application/json" id="stock-meta">
{"symbol":"KTOS","currency":"USD","price":48.19,"fairValue":50.00,"mos":3.6,"upside":3.8,"pe":280.79,"dividendYield":0,"roe":1.09}
</script>
```

- `currency` = ISO 3 ตัว (`"USD"`/`"THB"`) · ทุกเลขต้องตรงกับที่โชว์ในรายงาน · `mos` = (FV−ราคา)/FV ×100 · `upside` = (FV−ราคา)/ราคา ×100 (ทศนิยม 1 ตำแหน่ง)

เคสพิเศษ: หุ้นขาดทุน / ไม่จ่ายปันผล (ตัวอย่างจริง `reports/AAOI.html`):

```html
<script type="application/json" id="stock-meta">
{"symbol":"AAOI","currency":"USD","price":119.92,"fairValue":158,"mos":24.1,"upside":31.8,"pe":null,"dividendYield":0,"roe":null}
</script>
```

- ขาดทุน → `pe:null, roe:null` (JSON `null` จริง ไม่ใช่สตริง `"null"`/`"N/A"`) + **ตัดการ์ด P/E (TTM) ออก** จาก section 1 + ตัดวิธีชื่อ "P/E" ออกจาก valuation (ใช้ P/S · DCF · EV/Sales แทน — E21 เช็คเฉพาะวิธีชื่อ "P/E")
- ไม่จ่ายปันผล → `dividendYield:0` + การ์ด `<div class="k">เงินปันผล</div><div class="v">0%</div><div class="d">ไม่จ่ายปันผล</div>` (หรือตัดการ์ดออก) + ตัดวิธี DDM
- W10 cross-check การ์ดใน section 1 กับ stock-meta — มีการ์ดแต่ meta เป็น null (หรือกลับกัน) = warning

### 5) ป้าย MOS (`mos-verdict`) — โซน `bad` <10% / `ok` 10–20% / `good` ≥20% (MOS ติดลบ = `bad`)

```html
<div class="mos-verdict bad">
  <div class="big">−33.6%</div>
  <div class="txt"><b>ไม่มี Margin of Safety (ราคาแพงกว่ามูลค่าเหมาะสม)</b><br>คำอธิบาย 1–2 ประโยค: ราคาเทียบ FV + นักลงทุนควรทำอะไร</div>
</div>
```

### 6) หัวรายงาน: บรรทัด `ai-model` + บล็อก `gdots`/tags (ตัวอย่างจริง `reports/KTOS.html`)

```html
<meta name="ai-model" content="Claude Sonnet 5">
```

- ใส่**รุ่นที่รันจริง** ขึ้นต้น `Claude ` เสมอ (gate E28 · build ใช้ทำเครดิต footer)

```html
<div class="gdots"><div style="width:8px;height:8px;border-radius:50%;background:#a0c841;display:inline-block;margin:0 3px"></div><div style="width:8px;height:8px;border-radius:50%;background:#77962c;display:inline-block;margin:0 3px"></div><div style="width:8px;height:8px;border-radius:50%;background:#4a5c1e;display:inline-block;margin:0 3px"></div></div>
<div>
  <span class="tag">NASDAQ: KTOS</span>
  <span class="tag">Aerospace & Defense</span>
  <span class="tag">Unmanned Systems / Hypersonics</span>
</div>
```

- `{{GDOTS}}` = จุด 3 สีจากธีม (`accent` → `accentDark` → โทนเข้มกลางของ `darkGrad`) — **`pick-brand.js` (ข้อ 8) พิมพ์บรรทัดนี้ให้แล้ว copy วางตรง ๆ ห้าม derive เอง** · tags 3 ใบ = `ตลาด: SYMBOL` / เซกเตอร์ / niche ของหุ้น

### 7) ท้ายรายงาน: ที่มาราคา + disclaimer + วันที่ "ข้อมูล ณ" (ตัวอย่างจริง `reports/KTOS.html`)

```html
<div class="px-meta">
  ราคา ณ 10 ก.ค. 2569 (StockAnalysis.com, ตรงกับ Google Finance)<br>
  กรอบ 52 สัปดาห์ $44.85 – $134.00<br>
  ที่มา: StockAnalysis.com, Google Finance
</div>
```

- `px-meta` (ใน header ใต้ราคา) = วันที่ราคา (พ.ศ.) + กรอบ 52 สัปดาห์ + บรรทัด `ที่มา:` — ต้องเป็นแหล่งที่ cross-verify จริงใน STEP 2

```html
<div class="disc">
  <b>⚠️ คำเตือน:</b> รายงานนี้จัดทำเพื่อการศึกษาและเป็นข้อมูลประกอบการตัดสินใจเท่านั้น <b>ไม่ใช่คำแนะนำให้ซื้อหรือขายหลักทรัพย์</b>
  ตัวเลข valuation อิงสมมติฐานที่อาจคลาดเคลื่อน โดยเฉพาะ P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต
  ราคาหุ้นมีความผันผวนสูง ผู้ลงทุนควรศึกษาข้อมูลเพิ่มเติมและพิจารณาความเสี่ยงของตนเองก่อนตัดสินใจ • ราคา ณ 10 ก.ค. 2569 จาก StockAnalysis.com (cross-check กับ Google Finance ตรงกัน) • ข้อมูลงบการเงิน/ประมาณการจาก StockAnalysis.com • บริบทข่าวการร่วงของราคาจาก ad-hoc-news.de และ GuruFocus.com
</div>
<footer>Stock Analysis Dashboard • ข้อมูล ณ 13 ก.ค. 2569 • สร้างด้วย stock-analyzer workflow</footer>
```

- `disc` = คำเตือน "ไม่ใช่คำแนะนำ…" (บังคับทุกรายงาน) + ราคา ณ วันที่/แหล่ง + แหล่งงบ-ข่าวที่ใช้จริง · `footer` `ข้อมูล ณ <วันนี้ พ.ศ.>` = วันที่วิเคราะห์ (เวลาไทย UTC+7) — gate ใช้คิดความสด

### 8) สีแบรนด์ — 1 คำสั่งจบ (ห้ามอ่าน brandtheme.js / ห้าม `node -e` ทดลองเอง / ห้ามแก้ seeds.json มือ)

1. เลือก hex 1 ค่าตามหลัก `tools/brand-colors.md` (สีโลโก้ > สีเซกเตอร์ · ห้ามน้ำเงิน default)
2. รัน **ครั้งเดียว**: `node tools/pick-brand.js <SYM> "#0f9d8c" --auto` (แทน hex ของคุณ) — ตรวจสีชน/ใกล้เคียงกับ seed เดิมทั้งหมดให้ · **ชนแล้ว `--auto` สลับเป็นเฉดว่างที่ใกล้แบรนด์สุดให้เองในคำสั่งเดียว** (ไล่ sat/hue ใน hue เดิม — จบ 1 turn ไม่ต้องเดาเฉดใหม่เอง) + บันทึกลง `tools/seeds.json` + พิมพ์ **8 คีย์ theme** และ **บรรทัด `{{GDOTS}}`** พร้อม copy · ไม่ใส่ `--auto` = ชนแล้ว exit 1 พร้อมข้อเสนอเฉดว่าง 2–3 ตัวให้เลือกรันซ้ำ · แบรนด์ร่วมจริงเท่านั้น (เช่น TSM/STM สีเดียวกันจริง) จึงใช้ `--force`
3. วาง 8 คีย์ลง `report-data.theme` แล้วเติม `chgBg/chgColor` จากผล fetch-facts ต่อท้าย — จบ ไม่มี verify สีเพิ่ม

## สีแบรนด์ — เลือกตาม "ลักษณะของหุ้น" ทุกตัว (ห้ามปล่อย default น้ำเงิน)
ทุกรายงานต้องมีสีเฉพาะตัวใน `report-data.theme` — **มีสีแบรนด์/โลโก้จำได้ใช้สีนั้น** (Google ฟ้า, Tesla/TSMC แดง, Accenture ม่วง, PANW ส้ม…),
**ไม่มีก็เลือกตามเซกเตอร์** (photonics→teal/cyan/magenta/violet · foundry/metrology→copper/bronze · power/energy→เขียว · memory→amber · cybersecurity→ส้ม/แดง)
- หลักการ + เหตุผลรายตัว + วิธีทำ: ดู **`tools/brand-colors.md`** (record ถาวร)
- เครื่องมือ: **หุ้นใหม่** → `node tools/pick-brand.js <SYM> "#hex" --auto` ครั้งเดียวจบ (ตรวจชน — ชนแล้วสลับเฉดว่างใกล้สุดให้เอง + ลง `seeds.json` + พิมพ์ theme/GDOTS — ข้อ 8 ข้างบน) · **regenerate ธีมจาก seed เดิมทั้งระบบ** → `node tools/brandtheme.js tools/seeds.json --write` (`makeTheme()` สร้างธีมเต็มจาก seed ด้วย HSL)

## เครื่องมือ (`tools/`)
- `migrate.js <SYM…> [--write]` — แปลง HTML เต็ม → content-only + **round-trip faithful check** (resolve CSS var→สีจริง + body verbatim + stock-meta + brand/engine values ตรงเป๊ะจึงเขียน ไม่งั้น flag ปล่อย old-style)
- `pick-brand.js <SYM> "#hex" [--auto] [--force]` — one-shot สีแบรนด์หุ้นใหม่: ตรวจชน (เทียบใน accent space หลัง makeTheme) → ชน+`--auto` = สลับเฉดว่างใกล้สุดให้เอง / ไม่ `--auto` = exit 1 พร้อมข้อเสนอเฉดว่าง → เพิ่ม `seeds.json` → พิมพ์ theme 8 คีย์ + บรรทัด GDOTS
- `brandtheme.js` — `makeTheme(seed)` → ธีมเต็มชุด · `preserve-dates.js` — คงวันที่ `updated` หลัง migrate (source เปลี่ยน → freshHash ขยับ → ดึงวันเดิมจาก git HEAD)
- gate ครอบคลุม template: `check-reports.js` ตรวจ **หลัง** expand · `build-test.js` ทดสอบ `expandReport`/validate · `engine-exec.js` รัน engine จริง · `skeleton-test.js` กำกับโครงต้นแบบ
