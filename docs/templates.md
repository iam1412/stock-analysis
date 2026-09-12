# Template system (รายงาน content-only) + สีแบรนด์ต่อหุ้น

> `CLAUDE.md §10` มีแค่หลักการสั้น ๆ + pointer มาที่นี่ · ไฟล์นี้คือรายละเอียดเต็ม

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
- **โครงเป็น v2 แล้ว (ระยะ 2 ส่วน B)** — token 2 ชนิดคนละเจ้าของ: `{{UPPER}}` = **worker กรอก** (เนื้อหา + ตัวเลขดิบใน `report-data`) · `{{rd:…}}` = **build render จาก `values`** ตอน `expandReport` (ราคา/FV/MOS/จุดซื้อ/ผลตอบแทนฉาก — worker ห้ามกรอก) ⇒ token เดิม `{{MOS_SIGNED}}` `{{CHANGE}}` `{{PRICE_DATE}}` `{{MOS20}}` `{{MOS30}}` `{{SCn_RET}}` `{{MOS_CLASS}}` `{{ACCENT}}` `{{MKT_CAP}}` `{{PBV}}` `{{REPORT_DATA}}` **ไม่มีแล้ว**
- `{{MOS}}` (ตัวเลขล้วน — JSON มีเครื่องหมาย `+` ไม่ได้) เหลือใช้ที่เดียวคือ `stock-meta` · `.big` ของกล่อง MOS (หมวด 5) กับช่องสรุป "ส่วนต่างจากราคา" (หมวด 8) ใช้ `{{rd:mos}}` ซึ่งมีเครื่องหมายมาเองตาม `DV.fmtMos` (ลบ = U+2212) — เดิม hard-code `+{{MOS}}%` ⇒ ใบที่ MOS ติดลบได้ `+-12%` แล้ว cron อ่าน `.big` ไม่ออก = `patch-failed` (`test/skeleton-test.js` มีเคส MOS ติดลบกำกับ)
- อยู่ใน `_template/` (ไม่ใช่ `reports/`) → ไม่ถูก build เป็นหน้า/ไม่ถูก gate ตรวจเป็นรายงานจริง · ทั้งสองไฟล์ต่างกันแค่สัญลักษณ์สกุลเงิน/ตลาด (โครงเดียวกัน)
- `test/skeleton-test.js` กำกับ: เติม token ด้วยข้อมูลจริง (ไทย = HMPRO จริง) แล้ว **ต้องผ่าน check-reports (0 error) + engine รันได้** + token coverage (เพิ่ม token แล้วลืมอัปเดต = เทส fail)

## ตัวอย่าง filled (NEW) — worker อ่านตรงนี้จบ **ห้าม Read/grep/sed ไฟล์ใน `reports/` ตัวอื่นทุกกรณี** / ไม่ต้องทดลอง `node -e` หา format

> ตัวอย่างจริงจาก `reports/BBL.html` (TH · ราคา ฿188.00 · FV ฿195.00) · ข้อ 2 (วิธีที่ 2)/4 (ตัวปกติ)/6–7 จาก `reports/KTOS.html` (US · ราคา $48.19 · FV $50.00) — โหมด NEW compose เนื้อหาครบทุก STEP แล้ว **Write ทั้งไฟล์ครั้งเดียว** (SKILL STEP 5A)
> บล็อกไหนหาไม่เจอในหน้านี้ = ใส่ตามแบบตัวอย่างที่ใกล้สุดที่มี แล้วให้ gate (`npm test -- <SYM>`) จับ — ถูกกว่าไปขุดรายงานตัวอื่น (วัดจริง 13 ก.ค. 2569: HON เผา 5–6 turns grep/Read/sed รายงาน sibling ทั้งที่ทุกบล็อกอยู่ในนี้แล้ว)
> **ใบ v1 (ก่อนย้ายคลัง) ยังใช้กติกาเดิม** — คลัง `reports/` ปัจจุบันเกือบทั้งหมดยังเป็น v1 (ราคา/FV กระจายซ้ำหลายจุด ไม่มี `values`/`{{rd:…}}`) ย้ายทั้งคลังเป็น v2 เป็นงานส่วน E ของแผน (ยังไม่ทำ) · **โหมด NEW ทุกใบใหม่เริ่มจาก skeleton v2 แล้ว** (ระยะ 2 ส่วน B) — ตัวอย่างข้างล่างนี้จึงเป็น v2 ตามที่ skeleton ใช้จริง · โหมด UPDATE บนไฟล์ v1 เดิม อ่านรูปแบบจากไฟล์จริงตรง ๆ (SKILL STEP 5B ข้อ 1) ไม่ต้องอิงตัวอย่างนี้

### 1) บล็อก `report-data` ทั้งก้อน (schema v2 — เจ้าของ `tools/report-values.js`)

ต่างจาก v1: ราคา/FV มี**สำเนาเดียว** (`values.px` / `fv`) แทนที่จะกระจายซ้ำในหลายจุด (header/gauge/chart/hint) — ส่วนอื่นที่ต้องโชว์ตัวเลขพวกนี้ใช้ token `{{rd:…}}` แทนการพิมพ์ค่าดิบ (ตารางท้ายข้อนี้) · `chart.fairLine` และ `gauge.cur`/`gauge.fair` **ห้ามมี** ใน v2 (engine bake จาก `values.px`/`fv` ให้เอง)

> ★ บล็อกข้างล่างนี้คือผล `tools/report-values.js` → `styledRD(rd)` **เป๊ะไบต์ต่อไบต์** (ไม่มีคอมเมนต์แทรก — ตั้งใจ)
> เพราะ `apply-edits.js --set/--del` และ cron เขียนกลับด้วย `styledRD` ตัวเดียวกันเสมอ · ถ้าไฟล์จริงจัดบรรทัด
> ต่างจากนี้ (เช่น รวมหลายคีย์ไว้บรรทัดเดียว) การแก้ครั้งแรกผ่าน `apply-edits`/cron จะ reformat ทั้งบล็อกจนเห็น diff
> ใหญ่ทั้งที่ตัวเลขเปลี่ยนแค่จุดเดียว — เรื่องนี้สำคัญเกินความสวยงาม: การย้ายทั้งคลัง 908 ไฟล์เป็น v2 (ส่วน E ของแผน)
> จะรีวิวผ่าน diff แบบนี้เป๊ะ ๆ — ที่มาของค่าดู "ใครให้ค่าอะไร" ท้ายบล็อกนี้ ไม่ใช่คอมเมนต์ในตัว JSON

```json
<script type="application/json" id="report-data">
{
  "v": 2,
  "fv": 195,
  "values": {
    "px": 188,
    "priceDate": "2026-09-11",
    "dateEra": "BE",
    "chgSuffix": "รอบปี",
    "fvLow": 180,
    "fvHigh": 210,
    "analystTgt": 205,
    "eps": 21.7,
    "shares": 1909000000,
    "revenue": 140000000000,
    "dps": 12,
    "bvps": 260,
    "baseEps": 21.7,
    "scenarios": [
      {
        "tgt": 160,
        "div": 36
      },
      {
        "tgt": 230,
        "div": 36
      },
      {
        "tgt": 300,
        "div": 36
      }
    ],
    "scnBasis": {
      "years": 3,
      "divIncluded": true,
      "perYear": "cagr"
    }
  },
  "theme": {
    "accent": "#0071e3",
    "accentDark": "#0058b9",
    "darkGrad": "linear-gradient(135deg,#0a2540 0%,#123a63 55%,#1a4f86 140%)",
    "glow": "rgba(110,160,220,.35)",
    "subColor": "#c7cbd4",
    "headerMuted": "#b3b8c2",
    "chgBg": "var(--green-soft)",
    "chgColor": "#137333",
    "badge": "var(--blue)",
    "verdictText": "#d4d6dd",
    "vcellLabel": "#c4c7cf"
  },
  "chart": {
    "data": [
      ["ต.ค.25", 158.5],
      ["พ.ย.25", 158],
      ["ธ.ค.25", 169.5],
      ["ม.ค.26", 158],
      ["ก.พ.26", 177.5],
      ["มี.ค.26", 166.5],
      ["เม.ย.26", 162.5],
      ["พ.ค.26", 173],
      ["มิ.ย.26", 179.5],
      ["ก.ค.26", 191.5],
      ["ส.ค.26", 191],
      ["ก.ย.26", 188]
    ],
    "min": 150,
    "max": 200,
    "grid": [160, 170, 180, 190],
    "currency": "฿",
    "highlight": [1, 9]
  },
  "gauge": {
    "min": 120,
    "max": 240,
    "fairLabelTop": "-58px"
  }
}
</script>
```

ใครให้ค่าอะไร — **ห้ามคิดเอง field ที่ script ให้**:

| field | ที่มา |
|---|---|
| `values.px` / `values.priceDate` + ป้าย `.chg` + `theme.chgBg/chgColor` | `node tools/fetch-facts.js <SYM> [--th]` พิมพ์พร้อมวาง (ขึ้น=เขียว `var(--green-soft)`/`#1e8e3e` · ลง=แดง `var(--red-soft)`/`#c5221f`) |
| `chart.data / min / max / grid / currency / highlight` | fetch-facts พิมพ์ให้เหมือนกัน — `highlight` = `[ดัชนีจุดต่ำสุด, ดัชนีจุดสูงสุด]` ของ chart.data เรียงน้อย→มาก (ไม่มี `chart.fairLine` แล้วใน v2) |
| `fv` (เจ้าของเดียวของ FV — เดิม v1 มี 9 สำเนา) | FV ที่คำนวณ STEP 3 |
| `values.dateEra` | worker: `"BE"` เสมอสำหรับใบใหม่ (`"11 ก.ย. 2569"`) · migrator เท่านั้นที่เขียน `"CE"` (เก็บศักราชเดิมของไฟล์ที่ย้ายมา) |
| `values.chgSuffix` | `"รอบปี"` ปกติ · `"ตั้งแต่ IPO"` เมื่อหุ้น IPO <1 ปี — ตัวเลข % คิดจาก `chart.data` ตอน render |
| `values.fvLow` / `values.fvHigh` | กรอบ FV จาก STEP 3 (ไม่มี = `null`) |
| `values.analystTgt` | เป้านักวิเคราะห์เฉลี่ยจาก STEP 2 (ไม่มี = `null`) |
| `values.eps` | ฐาน EPS ของการ์ด P/E ที่ใช้ token `{{rd:pe}}` (ไม่มี = การ์ดเป็น literal ห้ามใช้ token) |
| `values.shares` | จำนวนหุ้นทั้งหมด (หุ้น ไม่ใช่ล้านหุ้น) → `{{rd:mcap}}` |
| `values.revenue` | รายได้ TTM หน่วยเต็ม สกุลรายงาน → `{{rd:ps}}` |
| `values.dps` / `values.bvps` | → ปันผล % (`{{rd:yield}}`) / P/BV (`{{rd:pbv}}`) |
| `values.baseEps` | EPS ฐานหมวด 6 (hint `{{rd:baseEps}}`) |
| `values.scenarios` / `values.scnBasis` | scenario STEP 4 — bear/base/bull ต้องมี **3 ฉากเป๊ะ** + `years`/`divIncluded`/`perYear` (มาคู่กันเสมอ ขาดตัวใดตัวหนึ่งไม่ได้) |
| `gauge.min` / `gauge.max` (+ `fairLabelTop` ถ้าต้อง) | ช่วงที่ครอบทั้งราคาปัจจุบัน + FV + จุดซื้อ MOS30 (ไม่มี `cur`/`fair` แล้ว — engine bake จาก `values.px`/`fv`) |
| `theme` 11 คีย์ | `makeTheme()` — สูตร 3 บรรทัด ข้อ 6 |

token ที่ renderer รู้จัก (`tools/report-values.js` `TOKENS`) — ตัวไหน derive จากอะไร:

| token | render | ต้องมีใน values |
|---|---|---|
| `{{rd:px}}` | `฿188.00` (สกุลจาก `stock-meta.currency`) | px |
| `{{rd:pxNum}}` | `188` (ค่าตั้งต้น `pxIn`) | px |
| `{{rd:priceDate}}` | `11 ก.ย. 2569` (BE) · `11 ก.ย. 2026` (CE) — ศักราชตาม `dateEra` ไม่ใช่ค่าคงที่ของระบบ | priceDate · dateEra |
| `{{rd:chg}}` | `▲ +12.3% (รอบปี)` — `annualChg(chart.data, '(' + chgSuffix + ')')` | chgSuffix |
| `{{rd:fv}}` `{{rd:fvLow}}` `{{rd:fvHigh}}` | `฿195.00` … | fv · fvLow · fvHigh |
| `{{rd:mos}}` | `+4%` (`fmtMos((fv−px)/fv×100)`) | — |
| `{{rd:mosClass}}` | `bad` / `ok` / `good` (`mosBand`) | — |
| `{{rd:mos20}}` `{{rd:mos30}}` | `฿156.00` / `฿136.50` (fv×0.8 / ×0.7) | — |
| `{{rd:upside}}` | `+4%` | — |
| `{{rd:analystTgt}}` `{{rd:analystPct}}` | `฿205.00` / `+9%` ((tgt−px)/px) | analystTgt |
| `{{rd:pe}}` | `8.7` (px/eps · 1 ตำแหน่ง · ไม่มี x) | eps |
| `{{rd:mcap}}` | `฿3.59 แสนล้าน` / `$3.21T` (`fmtBig`) | shares |
| `{{rd:ps}}` | `2.6` (px×shares/revenue · 1 ตำแหน่ง) | shares · revenue |
| `{{rd:yield}}` | `6.4%` (dps/px×100 · 1 ตำแหน่ง) | dps |
| `{{rd:pbv}}` | `0.72` (px/bvps · 2 ตำแหน่ง) | bvps |
| `{{rd:baseEps}}` | `฿21.70` | baseEps |
| `{{rd:scnNote}}` | ` • รวมปันผล` เมื่อ `scnBasis.divIncluded` ไม่งั้น `` | scnBasis |
| `{{rd:sc1tgt}}` … `sc3tgt` | `฿160.00` | scenarios |
| `{{rd:sc1div}}` … | `฿36.00` | scenarios[i].div |
| `{{rd:sc1ret}}` … | `+4% (+1.4%/ปี)` — total = (tgt + div·[divIncluded] − px)/px · %/ปี ตาม perYear | scenarios · scnBasis |
| `{{rd:sc1retClass}}` … | `pos` / `neg` | scenarios |

★ ตัวอย่างในตาราง = ค่าที่ `fmtMos` ปัด (≥2% → 0 ตำแหน่ง)

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

- โครงจริงใน skeleton (v2): `<div class="mos-verdict {{rd:mosClass}}"><div class="big">{{rd:mos}}</div><div class="txt">{{MOS_TEXT}}</div></div>` — `{{rd:mosClass}}` (`bad`/`ok`/`good`) และ `{{rd:mos}}` (เครื่องหมายมากับ token แล้วตาม `DV.fmtMos` — ตัวอย่างข้างบนคือ MOS ติดลบ `−33.6%`) **build render ให้ทั้งคู่จาก `report-data.values.px`/`fv`** ตอน `expandReport` ⇒ **worker กรอกแค่ `{{MOS_TEXT}}`** (prose คำว่าถูก/แพง/เต็มมูลค่าอยู่ที่นี่ที่เดียว) **ห้ามแตะ class ห้ามพิมพ์ตัวเลข/เครื่องหมาย `+`/`−` เอง**
- ★ ช่อง `vcell` **"ส่วนต่างจากราคา"** ในกล่องสรุปหมวด 8 ใช้ `{{rd:mos}}` เดียวกัน (`MOS ~ {{rd:mos}}`) — build render ค่าเดียวกับ `.big` เสมอโดยอัตโนมัติ (สำเนาเดียวกัน ไม่มีทางเพี้ยนกันเอง) — ห้ามเขียนคำบรรยายลงช่องนี้

### 6) หัวรายงาน: บรรทัด `ai-model` + บล็อก `gdots`/ป้ายตลาด

```html
<meta name="ai-model" content="Claude Sonnet 5">
```

- ใส่**รุ่นที่รันจริง** ขึ้นต้น `Claude ` เสมอ (gate E28 · build ใช้ทำเครดิต footer)

```html
<div class="gdots"><div style="width:8px;height:8px;border-radius:50%;background:#a0c841;display:inline-block;margin:0 3px"></div><div style="width:8px;height:8px;border-radius:50%;background:#77962c;display:inline-block;margin:0 3px"></div><div style="width:8px;height:8px;border-radius:50%;background:#4a5c1e;display:inline-block;margin:0 3px"></div></div>
<div>
  <span class="tag">NASDAQ: KTOS</span>
</div>
```

- `{{GDOTS}}` = จุด 3 สีจากธีม (`accent` → `accentDark` → โทนเข้มกลางของ `darkGrad`) — **`pick-brand.js` (ข้อ 8) พิมพ์บรรทัดนี้ให้แล้ว copy วางตรง ๆ ห้าม derive เอง**
- ป้าย `<span class="tag">` มีแค่ **1 ใบเดียว** (`ตลาด: SYMBOL`) — เดิมเคยมีอีก 2 ใบ (sector/niche แบบ free-text พิมพ์เอง เช่นใน `reports/KTOS.html` ที่เขียนไว้ก่อนมีระบบ tag) แต่ skeleton ปัจจุบันตัดออกแล้ว **ห้ามเติม `<span class="tag">` เพิ่มเอง** — ธีมการลงทุนของหุ้นมาจาก `tags.json` ผ่าน `tools/tag-apply.js` แล้ว build จะแปลงเป็นชิปลิงก์ `/tag/<slug>` ต่อท้ายป้ายตลาดให้เองตอน build เข้า `dist/` เท่านั้น (ดู "ระบบ tag" ท้ายเอกสารนี้) — worker แค่รายงานบรรทัด `TAGS: <slug…>` กลับ controller

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

## กราฟ TA (TradingView-style)

`build.js` inject `window.__TA_CFG__` + `<script defer src="/assets/ta-<hash>.js">` ต่อท้าย `</body>`
**เฉพาะใน `dist/`** (ดู `injectTA()`) — รายงานใน `reports/` (source) **ไม่ต้องรู้จักกลไกนี้เลย**
อย่าเขียน `__TA_CFG__` หรือ `<script src="/assets/ta-...">` ลงไฟล์ source มือ (ไม่มีผลตอน build, จะถูกเขียนทับ/inject ซ้ำอยู่ดี) ·
รายละเอียดสถาปัตยกรรม/contract `/api/ohlc`/นิยาม TA/debug → **`docs/ta-chart.md`**

## ระบบ tag ธีมการลงทุน

ป้ายธีมของหุ้น (เช่น "AI Data Center", "ห่วงโซ่การบินพาณิชย์") **ไม่ได้เขียนในไฟล์รายงาน** — เก็บแยกเป็น sidecar 2 ไฟล์ที่รากรีโป แล้ว inject เป็นชิปลิงก์ `/tag/<slug>` ต่อท้ายป้ายตลาดตอน build (ดูข้อ 6 ด้านบน) เหตุผลเดียวกับที่ TA config ไม่อยู่ใน source: เขียนลงไฟล์รายงานจะทำให้ `freshHash` ของทั้ง 908 ไฟล์เปลี่ยนพร้อมกัน → `updated` เด้งยกชุด พังการเรียงหน้าแรก/dedup 7 วัน/staleness

**`tags-vocab.json`** — คลังคำศัพท์ที่อนุมัติแล้ว (108 ธีม) แก้ได้เฉพาะผ่านรีวิวเจ้าของ:
```json
{
  "version": 1,
  "_readme": "...", "_how_to_assign": "...",
  "tags": [
    { "slug": "ai-datacenter", "label": "AI Data Center", "aliases": ["ai", "เอไอ", "data center"],
      "desc": "ผู้ได้ประโยชน์จากการสร้างคลัสเตอร์ AI และศูนย์ข้อมูล — ★ ติดได้เฉพาะเมื่อ AI/ดาต้าเซ็นเตอร์เป็นตัวขับเคลื่อนหลักที่ระบุชัด",
      "kind": "driver" }
  ]
}
```
- `slug` ASCII kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) · `desc` บางอันมี **★ กติกาขอบเขต** กำกับว่าเมื่อไรติดได้/ติดไม่ได้ — อ่านก่อนเลือก slug ที่ desc มี ★
- `kind`: **`business`** = "บริษัททำอะไร" (ธีมส่วนใหญ่ในคลัง — เกือบทุกหุ้นต้องมีอย่างน้อย 1 อัน, gate **W13** เตือนถ้าไม่มี) vs **`driver`** = "อะไรทำให้ราคาขยับ" (มีแค่ 3 slug ทั้งคลัง: `ai-datacenter`, `thai-consumption`, `thai-tourism` — ติดเมื่อใช้จริงเท่านั้น ไม่ใช่ทุกหุ้นต้องมี)
- `_how_to_assign` อธิบายวิธีเลือกแบบเต็ม — อ่านก่อนติด tag ให้หุ้นตัวแรก

**`tags.json`** — ข้อมูลต่อหุ้น เขียนผ่าน `tools/tag-apply.js` เท่านั้น:
```json
{
  "vocabVersion": 1,
  "tags": { "AAOI": ["optical-photonics", "ai-datacenter"] },
  "requests": [{ "symbol": "BAM", "theme": "distressed-debt/AMC ...", "at": "2026-08-13", "mode": "NEW" }]
}
```
- `tags[SYM]` = 1–3 slug ไม่ซ้ำกัน ทุกตัวต้องอยู่ในคลัง (`validateAssignment` ใน `tools/tag-lib.js` — บังคับด้วย gate **E40**)
- `requests[]` = คิวรอทบทวนของเจ้าของ (worker/controller เปิดผ่าน `--request` เมื่อไม่มี slug ไหนเข้ากันจริง ๆ) — **ไม่ใช่ช่องทางเลี่ยงการเลือก slug ที่มีอยู่**

**`tools/tag-apply.js`** — ทางเข้าเดียวที่เขียน `tags.json` (เขียนใต้ `tools/lockfile.js` แล้วเหมือน `pick-brand.js` — read-modify-write ของสองไฟล์นี้ปลอดภัยกับการรันขนานแล้ว) validate ก่อนเขียนเสมอ, input เสีย = ไฟล์เดิมไม่ถูกแตะเลย, เขียนแบบ atomic (`.tmp` → rename):
```bash
node tools/tag-apply.js <SYM> <slug…>          # ติด/แทน tag (1–3 slug ใน tags-vocab.json)
node tools/tag-apply.js <SYM> --keep           # ยืนยันคงเดิม (โหมด UPDATE ทบทวนแล้วไม่เปลี่ยน — ไม่เขียนไฟล์)
node tools/tag-apply.js <SYM> --request "ธีม"  # เข้าคิว requests[] ขอคำศัพท์ใหม่
node tools/tag-apply.js --rename <OLD> <NEW>   # ย้าย key ตาม tools/symbol-map.json (ปฏิเสธถ้า NEW ไม่มี reports/<NEW>.html จริง)
node tools/tag-apply.js --prune                # ลบ entry ที่ไม่มีไฟล์ reports/ แล้ว (ใช้หลังลบรายงานหุ้นเพิกถอน)
```
**ห้ามแก้ `tags.json`/`tags-vocab.json` มือ ห้าม worker agent เขียนเอง** — worker คืนบรรทัด `TAGS: <slug…>` ให้ controller รันคำสั่งข้างต้นเอง — เหตุผลคือ **ให้ controller รีวิว slug ก่อนเขียน** ไม่ใช่เรื่อง race (ไฟล์มี lock แล้ว) ⇒ รันพร้อมกันหลาย worker ได้

**กติกาแกนธีม (ไม่ใช่ category/ขนาด):** slug ใหม่ต้องตอบ "หุ้นตัวนี้เล่นเรื่องอะไร" — **ห้าม** เป็นหมวด GICS (Technology/Healthcare/Financials), ขนาดตลาด (Large-cap), หรือสไตล์การลงทุน (Dividend Aristocrat/Deep Value) เพราะข้อมูลพวกนี้มีอยู่แล้วในตัวรายงาน/screener ไม่ต้องการ tag ซ้ำ

**ขั้นต่ำ 3 สมาชิก:** `MIN_MEMBERS = 3` ใน `tag-lib.js` เป็น **warning ระดับคลัง ไม่ใช่ error** — `npm run test:tags` พิมพ์แจ้งเฉย ๆ เมื่อ slug ไหนมีสมาชิก <3 (สัญญาณว่าอาจแคบเกินไป ควรยุบรวมธีมใกล้เคียง) ไม่บล็อก push · หน้าธีม `dist/tag/<slug>.html` ยังสร้างให้ **ทุก slug ที่มีสมาชิกที่ยังมีรายงานจริง (live) ≥1** โดยไม่รอถึง 3 — บาง slug ยอมรับ <3 สมาชิกโดยตั้งใจเมื่อไม่มีธีมใกล้เคียงให้ยุบ (ดู `desc` ของ `casino-gaming`/`tobacco-nicotine` ใน `tags-vocab.json`)

### เพิ่มธีมใหม่เข้าคลัง (backfill)
1. เพิ่ม entry ใน `tags-vocab.json` แล้ว bump `version`
2. `npm run test:tags` จะขึ้น warning ว่า `vocabVersion` ตามหลัง = ยังไม่ backfill
3. หา "หุ้นที่ควรได้ธีมใหม่" จากคำโปรยใน `reports.json` แล้วรัน `tag-apply.js` ทีละตัว
   (ไม่ต้องรอให้หุ้นถูก re-analyze ทีละตัวข้ามปี)
4. bump `vocabVersion` ใน `tags.json` ให้เท่ากับ `version` ของคลัง → warning หาย

## เครื่องมือ (`tools/`)
- `migrate.js <SYM…> [--write]` — แปลง HTML เต็ม → content-only + **round-trip faithful check** (resolve CSS var→สีจริง + body verbatim + stock-meta + brand/engine values ตรงเป๊ะจึงเขียน ไม่งั้น flag ปล่อย old-style)
- `pick-brand.js <SYM> "#hex" [--auto] [--force]` — one-shot สีแบรนด์หุ้นใหม่: ตรวจชน (เทียบใน accent space หลัง makeTheme) → ชน+`--auto` = สลับเฉดว่างใกล้สุดให้เอง / ไม่ `--auto` = exit 1 พร้อมข้อเสนอเฉดว่าง → เพิ่ม `seeds.json` → พิมพ์ theme 8 คีย์ + บรรทัด GDOTS
- `brandtheme.js` — `makeTheme(seed)` → ธีมเต็มชุด · `preserve-dates.js` — คงวันที่ `updated` หลัง migrate (source เปลี่ยน → freshHash ขยับ → ดึงวันเดิมจาก git HEAD)
- `tag-lib.js` — schema/validate ระบบ tag ที่เดียว (ใช้ร่วมโดย build.js/check-reports.js/tag-apply.js/tags-test.js) · `tag-apply.js` — CLI ทางเข้าเดียวที่เขียน `tags.json` (ดู "ระบบ tag" ด้านบน)
- gate ครอบคลุม template: `check-reports.js` ตรวจ **หลัง** expand · `build-test.js` ทดสอบ `expandReport`/validate · `engine-exec.js` รัน engine จริง · `skeleton-test.js` กำกับโครงต้นแบบ
