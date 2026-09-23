# Report v3 — JSON เป็นต้นฉบับ · template เดียว render ทุกใบ · script เป็นผู้เขียนคนเดียว

- วันที่: 24 ก.ย. 69 (2026-09-24) · สถานะ: **อนุมัติแล้ว** (advisor + เจ้าของ 24 ก.ย. 69)
- เจ้าของตัดสินแล้ว (session 24 ก.ย. 69): (1) ต้นฉบับ = `reports/<SYM>.json` · (2) migrate = script sweep + text-diff กับ HTML เดิม + รายชื่อให้คนตัดสิน · (3) กติกาตัวเลขใน prose = **B** (ตัวเลขผูกราคาห้ามพิมพ์เอง ต้องเป็น token · ตัวเลขจากงบพิมพ์ได้) · (4) มีช่อง `extras[]` ตารางข้อมูลล้วน ≤2 ตาราง · (5) template ดึงข้อมูลจาก JSON — JSON เก็บ **เฉพาะค่าที่ตัดสินใจ** ค่าคำนวณทั้งหมดคิดตอน build
- หลักฐานที่ใช้ออกแบบ: วิจัย 3 สาย (ประวัติบัค 3,013 commit / 272 fix · write path ปัจจุบัน · สำรวจ 909 ใบ) — สรุปอยู่ใน §1

---

## 0. เป้าหมาย / ไม่ใช่เป้าหมาย

**เป้าหมาย** — ปิดวงจรบัควนซ้ำที่เกิดจาก (A) AI เขียนอิสระลง HTML และ (B) ค่าเดียวกันถูกพิมพ์หลายที่แล้วเลื่อนหลุดกัน และ (C) healer/checker อ่าน HTML ด้วย regex คนละตัว — โดยทำให้:

1. **มีค่าละ 1 สำเนา** — ทุกค่าอยู่ใน JSON ที่เดียว ค่าที่คำนวณได้ **ห้ามเก็บ** คิดตอน build
2. **มีผู้เขียนไฟล์ต้นฉบับคนเดียว** = โมดูล `tools/v3/io.js` (ผ่าน CLI `tools/report.js` / cron) · AI ไม่แตะ `reports/` ตรง (hook บล็อก + ลายเซ็นตรวจย้อนหลัง)
3. **มีผู้อ่านคนเดียว** — build, gate, cron, index ใช้ `tools/v3/compute.js` ตัวเดียวกัน ไม่มี regex อ่านรายงานอีก
4. **template ชุดเดียว** render ทั้ง 909 ใบ — แก้ดีไซน์/โครงที่เดียวได้ทุกใบ (บัค template กลายเป็น "1 บัค × 909 ใบ แก้ครั้งเดียว" แทน "909 ใบเพี้ยนคนละแบบ")

**ไม่ใช่เป้าหมาย (พูดตรง ๆ — ไม่ขายเกิน)**

- ❌ ไม่แก้ **ความผิดเชิงดุลพินิจ** (class D): สมอตาย W18/W25 · ถ่วงน้ำหนัก FV ผิด · สมมติฐาน (r,g) พัง · prose อ้างข้อเท็จจริงผิด (ABBNY spin-off) — v3 ทำให้ **ตรวจด้วยการคำนวณ** ได้แทน regex (ตรวจแม่นขึ้น เร็วขึ้น) แต่ไม่ป้องกัน
- ❌ ไม่แก้ **ข้อมูลจาก vendor ผิด/ขัดกัน** (class E): EPS คนละฐาน · ADR ratio · SA เปลี่ยนโครงหน้า — cross-source verify ของ `prep` ยังเป็นด่านเดียว
- จาก 10 โค้ด must-fix ของแคมเปญ ก.ย. 69 มีแค่ W1 (BUG-016/GAP-012/013) ที่หายโดยโครงสร้าง — ที่เหลือเป็น D/E
- ❌ ไม่จำลองกติกาหุ้นวัฏจักร 0.4b ("ทุกขาของ FV เป็นฟังก์ชันของตัวแปรฉาก" เช่นราคาทอง/WTI) — B/IMO/KGC ใช้ขา `declared` + `extras[]` (ตารางความไวต่อราคาโภคภัณฑ์) ⇒ ค่าขาเป็นค่าประกาศ ไม่ใช่คำนวณ · ตรวจด้วยคน (spotcheck) เหมือนเดิม
- ❌ ไม่เปลี่ยนหน้าตาเว็บ (DOM/class เดิม → `dashboard.css` + `engine.js` ใช้ต่อได้ · font/สี/DESIGN.md คงเดิม)
- ❌ ไม่เปลี่ยน URL (`gaohoon.com/<SYM>.html`) · ไม่แตะระบบ tag / counters / TA chart

## 1. สิ่งที่วิจัยพบ (เหตุผลของการออกแบบ)

| คลาสบัค | ตัวอย่าง | ขนาด | v3 ปิด? |
|---|---|---|---|
| ค่าผูกราคาค้าง (P/E, mcap, yield, P/BV, % ฉาก) | E41–43, W16/17/19/20 · heal 547/831/782/735 ไฟล์ | ~3,000 file-touch | ✅ คิดตอน build |
| คำตัดสิน/สี verdict ขัด MOS | W04/W06/W26 · `12af7aeeb` 26 ไฟล์ | ~60 | ✅ class คิดจาก MOS |
| ตัวเลขราคาใน prose | E44 5,293 จุด · W15 92 ไฟล์ · EXPE ×5 | ทุกไฟล์ | ✅ ใบใหม่/UPDATE (กติกา B ตอน save) · 🟡 ใบ migrate ที่ prose เก่า — `W31` ชี้ให้แก้ตอนแตะ |
| สูตรใน `.mdesc` ไม่ตรง `.mval` | E21/E22/W14 · DDM 7 fix · EV/EBITDA 3 fix | ~20 | ✅ `legs[]` คิดค่าเอง |
| healer ≠ checker | W1 `PE_LABEL_SKIP` · BBL cron ล้ม 3 วัน · `34b208029` | ~10 เหตุ | ✅ ไม่มี healer |
| checker false positive บน free text | 13 `fix(test)` | ~20 | ✅ ส่วนใหญ่ (อ่าน JSON) |
| markup drift | FDX section 8/7 · `.ret` หาย 23 ไฟล์ · E26 | ~100 | ✅ template เดียว |
| snapshot ไม่มีเจ้าของ (52wk, เป้า analyst) | W23 105–109 ไฟล์ | ~110 | 🟡 52wk → cron · analyst มี `asOf` |
| สมอตาย / ถ่วง FV / vendor | W18/W25 · GAP-001–005 · EXT-003/004 | — | ❌ ตรวจได้ดีขึ้นเท่านั้น |

ความอิสระที่รายงานใช้จริง: section 2/4/5/6/8 รูปเดียว 97–100% · section 1 มี **1,526 label การ์ดต่างกัน** · ชื่อวิธีประเมิน 320 แบบ (free text) · `.mval` พิมพ์มือทุกใบ + 669 ใบก๊อปซ้ำใน prose · ตารางพิเศษ ~1% (FER/IMO/B/CCEP/TD) · prose จริง ~53% ของเนื้อหา

บทเรียนจากความพยายามเดิม (v2): `{{rd:}}` ได้ผล แต่ (1) schema มีแค่ 15 ค่า — ขา FV/การ์ด/ฉากยังพิมพ์มือ (2) V2TOKENS ตรวจแค่ "มี token" ไม่ใช่ "ช่องนั้นเป็น token ล้วน" (3) ต้นฉบับยังเป็น HTML ⇒ cron ต้อง `derivedPassV2` + Myers-LCS `keepMap` (จุดเปราะที่สุด) (4) script ที่ regex HTML ก็ทำพังได้ (`1c4883eef` cron ทับวันที่ ATH 18 ไฟล์) ⇒ **"ให้ script เขียน" ไม่พอ ต้อง "ทุกค่ามีช่องของตัวเองใน JSON"**

---

## 2. สถาปัตยกรรม

```
                      (AI/worker)                         (cron)
  .work/<SYM>.json ──► node tools/report.js save <SYM> ◄── tools/update-prices.js
   (draft, อิสระ)        │ schema → compute → prose-B → sign      │ เขียนเฉพาะ market.*
                         ▼                                         ▼
                 reports/<SYM>.json  ◄── ผู้เขียนเดียว: tools/v3/io.js (write + sign)
                         │
            npm run build│  tools/v3/compute.js (ผู้อ่าน/คำนวณเดียว)
                         ▼
          _template/v3/render.js (template เดียว) ──► dist/<SYM>.html (+ css/engine เดิม)
                         │
          test/check-v3.js (gate อ่าน JSON + compute) · reports.json (metrics จาก compute)
```

โมดูลใหม่ (แต่ละตัวมีหน้าที่เดียว ทดสอบแยกได้):

| ไฟล์ | หน้าที่ | พึ่งพา |
|---|---|---|
| `tools/v3/schema.js` | นิยาม schema (คีย์ · ชนิด · enum · owner `cron`/`worker`) + `validate(doc)` คืน error พร้อม path | — |
| `tools/v3/compute.js` | pure: `compute(doc) → view` (ทุกค่าที่ derive ได้ + ค่าที่ format แล้ว) | schema, `derived-values.js` fmt (fmtMos/fmtPrice/fmtBig ของเดิม — คงกติกาปัด) |
| `tools/v3/prose.js` | `renderProse(str, view)` แทน token · `checkRuleB(doc, view)` หาเลขผูกราคาที่พิมพ์เอง | compute |
| `tools/v3/io.js` | `read(sym)` · `write(sym, doc, {by})` (canonical JSON + `_sig`) · `verifySig(doc)` · lock | schema, `lockfile.js` |
| `tools/report.js` | CLI: `init` `export` `save` `show` `diff` `set-price`(debug) | ทั้งหมด |
| `_template/v3/render.js` | `render(doc, view) → HTML` 8 section + header/footer — DOM/class เดิม | compute, prose |
| `test/check-v3.js` | gate ของใบ v3 | compute, schema, prose |
| `tools/migrate-v3.js` | v2/v1 HTML → v3 JSON + equivalence diff | ทั้งหมด + parser เดิม |

---

## 3. Schema v3 (`reports/<SYM>.json`)

หลักการ: **แบ่งตามเจ้าของ** — `market` = cron เขียนเท่านั้น · ส่วนอื่น = worker (ผ่าน `save`) · เก็บเฉพาะค่าที่ "ตัดสินใจ/สังเกต" ไม่เก็บค่าที่คำนวณได้ · ทุก object ปิด (คีย์ไม่รู้จัก = error)

```jsonc
{
  "v": 3,
  "symbol": "ZTS", "currency": "USD", "region": "US",        // region: US|TH (ไม่ใช้ชื่อ market — ชื่อนั้นคือบล็อกราคาของ cron)
  "dateEra": "BE",                                            // การแสดงผลวันที่ (คงตามใบเดิม — migration ไม่พลิกหน้าตา)

  "meta": {                                                   // worker
    "company": "Zoetis Inc.", "sub": "คำโปรยธุรกิจ ≥10 ตัวอักษร",
    "analysisDate": "2026-09-20",                             // = footer "ข้อมูล ณ" · cron ไม่แตะ · ฐานของ updated/dedup/staleness
    "aiModel": "Claude Sonnet 5",
    "sources": ["Yahoo Finance", "SEC 10-Q", "stockanalysis.com"], // ≥3 (W08)
    "exchange": "NYSE", "headerTags": ["Animal Health"],     // ป้ายหัวรายงาน (≤2) — ไม่ใช่ tags.json
    "priceNote": "StockAnalysis.com ตรงกับ Yahoo Finance",     // วงเล็บหลัง "ราคา ณ" (ไม่บังคับ)
    // gdots = 3 จุดสีที่ derive จาก theme (pick-brand.js:119) — ไม่เก็บ
    "themeLegacy": null   // เฉพาะใบ migrate: 8 คีย์ palette เดิม (accent accentDark darkGrad glow subColor headerMuted verdictText vcellLabel)
    // ใบใหม่: ไม่มี theme — seed hex อยู่ที่ tools/seeds.json ที่เดียว (pick-brand ใต้ lock) · build: makeTheme(seed) → deriveTheme()
    // chgBg/chgColor = คิดจากทิศกราฟ (E34) · badge = default — ไม่อยู่ใน JSON ทั้งสองแบบ
  },

  "market": {                                                 // cron เท่านั้น (worker ส่งมาใน draft = error)
    "px": 70.12, "priceDate": "2026-09-23",
    "chart": { "data": [["ต.ค. 68", 150.2], "..."], "gridFmt": "…", "dataFmt": "…" }, // min/max/grid/highlight → compute
    "range52w": { "lo": 64.1, "hi": 172.3 },                  // ใหม่: cron เติมจาก chart/Yahoo → ปิด W23
    "chgSuffix": "รอบปี"
  },

  "fundamentals": {                                           // worker — ข้อเท็จจริงจากงบ (มาจาก prep) · ค่าละ 1 สำเนา
    "eps": 6.13, "epsBasis": "gaap-ttm",                     // enum: gaap-ttm | adj-ttm | fy
    "dps": 2.12, "bvps": 11.4, "shares": 4.3e8, "revenue": 9.4e9,
    "netIncome": 2.6e9, "roe": 52.1, "roa": 17.0, "netMargin": 27.6, "opMargin": 36.0,
    "beta": 0.9, "debtToEquity": 1.3, "fcf": 2.3e9,
    "peAvg5y": 34.2                                           // ค่ามัธยฐานจาก median-multiples (ไม่ใช่ปัจจุบัน)
  },

  "legs": [                                                   // วิธีประเมิน 2–4 ขา — ค่าของขาคิดเอง
    { "method": "pe", "label": "P/E มัธยฐาน 5 ปี",
      "inputs": { "multiple": 28, "multipleSource": "median5y" },   // eps มาจาก fundamentals.eps โดย default
      // ขาที่ใช้ฐานต่าง: "override": { "eps": 6.8, "why": "EPS ปกติไม่รวมรายการพิเศษ Q2" } — ความต่างมองเห็นได้/ตรวจได้
      "note": "prose อธิบายเหตุผล (กติกา B)" },
    { "method": "dcf", "label": "DCF 2 ช่วง",
      "inputs": { "fcf0": 2.3e9, "g1": 8, "years1": 5, "tg": 3, "r": 8.5, "rfCurrency": "USD", "netDebt": 5.1e9 },
      "note": "…" }
  ],
  "fvWeights": null,                                          // null = เฉลี่ยเท่ากัน · หรือ [0.6, 0.4] (ผลรวม 1)

  "metrics": {                                                // section 1
    "cards": ["mcap", "pe", "pbv", "yield", "eps", "roe", "netMargin", "revenue", "range52w", "beta", "peAvg5y", "fcf"],
    "notes": { "pe": "prose สั้นใต้การ์ด (กติกา B)" },
    "custom": [ { "label": "สาขาทั่วโลก", "value": "45 ประเทศ", "note": "…" } ],  // ≤4 · value ห้ามผูกราคา
    "hint": "ข้อความสั้นหัว section 1 (ไม่บังคับ)"
  },

  "scenarios": {                                              // section 6 — Bear/Base/Bull ครบ 3
    "years": 3, "divIncluded": true, "perYear": "cagr",       // perYear: cagr | linear | null
    "driver": "eps",                                          // eps | ffo | revenuePerShare | bvps | fcfPerShare
    "exitMetric": "pe",                                       // pe | ps | pbv | pffo | pfcf
    // ฐาน = fundamentals ตาม driver โดย default (eps → fundamentals.eps) · ต่างจากนั้น: "baseOverride": { "value": 3.1, "why": "…" }
    "cases": [
      { "growth": 2,  "exitMultiple": 20, "divCum": 6.6, "desc": "prose" },
      { "growth": 8,  "exitMultiple": 26, "divCum": 6.9, "desc": "…" },
      { "growth": 12, "exitMultiple": 30, "divCum": 7.2, "desc": "…" }
    ],
    "note": "prose"
  },

  "analyst": { "target": 95.0, "n": 14, "rating": "Buy", "asOf": "2026-09-20" },  // หรือ null

  "prose": {                                                  // ทุกช่องผ่านกติกา B + render token
    "chart": "…", "valuation": "…", "gauge": "…", "mos": "…",
    "verdictHeadline": "…", "verdictBody": "…", "strategy": "…",          // เรตติ้ง analyst อยู่ที่ analyst.rating
    "disclaimerSources": "…"
  },
  "catalysts": ["…", "…"],                                    // 3–8 ข้อ
  "risks": ["…", "…"],                                        // 3–8 ข้อ
  "extras": [                                                 // ≤2 · ข้อมูลล้วน ไม่มี HTML
    { "after": "valuation", "title": "SOTP แยกสินทรัพย์",
      "headers": ["สินทรัพย์", "มูลค่า/หุ้น"], "rows": [["407 ETR", 8.1]], "sumCol": 1, "note": "…" }
      // cell = string | number · ถ้าขา declared อ้างตารางนี้ (extrasRef) ต้องมี sumCol ที่เป็นตัวเลขล้วน → E52 ตรวจผลรวม = ค่าขา
  ],

  "_sig": "sha256:…"                                          // เขียนโดย io.js เท่านั้น
}
```

### 3.1 `legs[]` — method enum + สูตร (คิดใน `compute.js`)

| method | inputs บังคับ | ค่า/หุ้น |
|---|---|---|
| `pe` | eps(ref/เลข), multiple, multipleSource | eps × multiple |
| `pbv` | bvps, roe, g, r (justified) หรือ multiple+multipleSource | ratio × bvps · ratio=(ROE−g)/(r−g) |
| `ps` / `evsales` | revenue, multiple, multipleSource (+netDebt, shares สำหรับ EV) | (rev×m − netDebt)/shares |
| `evebitda` | ebitda, multiple, multipleSource, netDebt, shares | (ebitda×m − netDebt)/shares |
| `pfcf` / `fcfyield` | fcfPerShare หรือ fcf+shares, multiple\|yield | |
| `pffo` | ffoPerShare, multiple, multipleSource | |
| `ddm` | dps, g, r | dps×(1+g)/(r−g) |
| `dcf` | fcf0, g1, years1, tg, r, rfCurrency, netDebt, shares | 2-stage มาตรฐาน |
| `ri` | r, years, payout (bvps/roe จาก fundamentals หรือ override) | residual income มาตรฐาน |
| `declared` | `value` + `basis` (enum: sotp \| nav \| rnpv \| other) + `extrasRef?` | ค่าที่ประกาศ — **ต้อง** ผูก `extras[]` ที่รวมยอดได้ (sotp/nav) หรือมีเหตุผลใน note |

- `multipleSource` enum: `median5y` · `median10y` · `peer` · `justified` · `sector` — **ไม่มี `current`** ⇒ สมอตายแบบประกาศตรง = error ตอน save · สมอตายแฝง (multiple ห่าง px/eps หรือ forward ≤7%) = W18/W25 เป็น **การคำนวณ** ไม่ใช่ regex
- `fv` = Σ wᵢ·legᵢ (default เท่ากัน) · `fvLow/fvHigh` = min/max ของขา — **คิดเอง** ไม่เก็บ
- เป้า analyst ห้ามเป็นขา (ไม่มี method ให้) — ปิด GAP-001 โดยโครงสร้าง
- DCF/RI ใช้สูตรมาตรฐานเดียวทั้งระบบ — โมเดลที่ไม่ใช่มาตรฐาน → `declared` (โปร่งใสว่าเป็นค่าประกาศ) · ชั้น 0 (rf ตรงสกุล · 2 วิธีใช้ (r,g) เดียว = วิธีเดียว) กลายเป็น check บน inputs

### 3.2 การ์ด section 1

- `cards[]` เลือกจาก **แคตตาล็อกปิด** ใน `schema.js` (~25 คีย์) แต่ละคีย์ประกาศ label ไทย/สูตร/ที่มา: ค่าผูกราคา (`mcap`, `pe`, `pbv`, `yield`, `ps`, `evEbitdaNow`, `range52w`) **คิดเอง** · ค่าจากงบ (`eps`, `roe`, `revenue`…) อ่านจาก `fundamentals` · การ์ดที่ข้อมูลไม่มี → save error ("ถอดการ์ดออก หรือเติม fundamentals.x")
- label/บรรทัด `.d` (ฐานการคำนวณ เช่น "EPS TTM $6.13") **template เขียนเอง** จาก fundamentals — ไม่ใช่ AI
- `custom[]` ≤4 สำหรับข้อมูลเฉพาะธุรกิจ — `value` ผ่านกติกา B (ห้ามเป็นตัวเลขผูกราคา)
- แคตตาล็อกได้มาจาก label 1,526 แบบของคลังปัจจุบัน (จัดกลุ่มตอนทำ plan) — label ที่ไม่ลงแคตตาล็อก → migrator ใส่ `custom[]` หรือรายชื่อคน

### 3.3 Scenarios

- `tgt = base × (1+g)^years × exitMultiple` (driver ต่อหุ้น) · `total% = (tgt + divCum·[divIncluded] − px)/px` · `%/ปี` ตาม `perYear` — **ใช้สูตร/การปัดเดียวกับ `derive()` v2 เป๊ะ** (round-trip fmtMos · บทเรียน 20 ส.ค. 69)
- ปิด E24/W01/W17 โดยโครงสร้าง · 3/3/3 แถว (ไม่มีปันผล) = `divIncluded:false` → template ถอดแถวเอง

### 3.4 ค่าที่ compute ให้ (ไม่เก็บใน JSON)

`fv fvLow fvHigh legValue[i] mos mosClass mos20 mos30 upside pe pbv yield mcap ps chg(annual) chart.min/max/grid/highlight gauge.min/max/scale verdictClass summaryText scenario.tgt/total/perYear/cls analystPct priceDateText analysisDateText` — แทน `stock-meta` ทั้งบล็อก (index/reports.json อ่านจาก compute)

---

### 3.5 สีแบรนด์ — ทำไมมี `themeLegacy` (วัดจริง 24 ก.ย. 69 · แก้ fix #3 ของ advisor ที่ไม่ครบ)

- advisor เสนอ "ตัด theme ออก ใช้ seeds.json ที่เดียว" — วัดแล้ว **ไม่ครบ**: seeds.json มีแค่ 227/909 ใบ · 53/227 ไม่ตรง `makeTheme(seed)` แล้ว (สูตรถูก retune ทีหลัง: darkGrad/subColor/verdictText ต่าง) · 682 ใบที่ไม่มี seed ลองหา seed ย้อน (grid-search hue±6/s/l) ได้ accent ตรง ≤12 แค่ 210 ใบ และตรงครบ 8 คีย์แค่ **17 ใบ**
- ⇒ palette ของใบเก่า **เป็นข้อมูล ไม่ใช่ค่าที่ derive ได้** — เก็บไว้ไม่ผิดหลัก "ค่าละ 1 สำเนา" (ไม่มีสำเนาอื่นและคำนวณไม่ได้) · re-derive = เปลี่ยนสี ~700 หน้า (accent เปลี่ยน ~470) = งานดีไซน์ ไม่ใช่ migration
- กติกา: migrate → ใบที่ `makeTheme(seed)` ตรงทุกคีย์ ≤12 ไม่เก็บ themeLegacy (ใช้ seed) · ที่เหลือเก็บ `themeLegacy` · `save` ปฏิเสธ themeLegacy ในใบ NEW · ถ้าวันหนึ่งเจ้าของอยากให้ทุกใบใช้สูตรปัจจุบัน = ลบ themeLegacy ทีละชุด (งานแยก ต้องเห็นภาพก่อน)
- seeds.json ได้ entry ครบทุกใบตอน migrate (seed เดิม หรือ seed ย้อนที่ใกล้สุด) เพื่อให้ pick-brand ตรวจสีชนได้ทั้งคลัง · ลบรายงาน → `pick-brand --prune`

## 4. Prose + กติกา B (`tools/v3/prose.js`)

- ไวยากรณ์ token: `{{px}}` `{{fv}}` `{{mos}}` `{{leg1}}` `{{leg1.multiple}}` `{{scn.base.tgt}}` `{{scn.bull.ret}}` `{{analyst.target}}` `{{card.pe}}` … — ชุด token = **ทุกค่าใน view ที่ compute สร้าง** (ตารางเดียวใน `compute.js` ไม่มีรายการเขียนมือแยก)
- token ที่ค่าเป็น null → save error (ไม่ใช่ render เป็นว่าง)
- **HTML ใน prose**: อนุญาตแค่ `<b> <i> <br>` + `**bold**` — tag อื่น/attribute/style = error (ปิด inline style 144 จุดของ FER)
- **กติกา B — 2 ระดับ**: สกัดตัวเลขที่มี `$ ฿ บาท % x เท่า` ใน prose/notes/custom/extras → เทียบกับ **ทุกค่าผูกราคาใน view**
  - **error (ตอน `save`)** = ตรงกับ **รูปที่ render แล้วแบบเป๊ะ** (`$70.12` · `27.6%` · `28.0x`) — AI ลอกเลขจาก `report.js show` จึงได้รูปเป๊ะเสมอ ⇒ จับการก๊อปจริงครบ แต่ false positive ~0 (ตัวเลขจากงบที่ค่าใกล้เคียงบังเอิญ เช่น netMargin 27.4% vs MOS 27.6% ไม่ถูกบล็อก)
  - **warn** = อยู่ในช่วง tolerance (เงิน ±1.5% · % ±0.6 จุด · multiple ±3%) แต่ไม่เป๊ะ → พิมพ์ให้ worker ดู ไม่บล็อก
  - **`W31 prose-lit` (gate รายวัน · warn)** = ตัวเลขรูปเงิน (`$ ฿ บาท`) ใน prose ที่ไม่ใช่ token และไม่อยู่ใน `{{lit:}}` — ไม่เทียบกับราคาปัจจุบัน (กัน false positive เมื่อราคาขยับ) แค่ **นับ** ให้เห็นกากที่ค้าง · ใช้กับใบ migrate ที่ prose เก่าลอกราคา ณ วันวิเคราะห์ (ซึ่งกติกา B เทียบราคาวันนี้แล้วจับไม่ได้ — ตรงกับที่ healer E44 แปลงได้แค่ ~30%) · แก้ตอนแตะใบ (UPDATE/LIGHT) · `save` ของใบที่แตะแล้วยกระดับเป็น error ได้ (ตัดสินใน plan)
  - escape hatch: `{{lit:…}}` สำหรับกรณีจำเป็น (เช่นอ้างราคา IPO ในอดีต) — นับจำนวน + ต้องมีเหตุผลใน `meta.litReasons` · gate warn ถ้าเกิน 2 ต่อใบ
- `%/ปี` (open-item #1 เดิม) เป็นแค่ token — หน้าเว็บขยับตามราคาคือพฤติกรรมที่ถูก ไม่ใช่ flicker (เดิมตัดทิ้งเพราะ healer all-or-nothing)

## 5. Template (`_template/v3/render.js`)

- ฟังก์ชัน JS (tagged template + escape อัตโนมัติ) สร้าง **DOM/class เดิม** ของ skeleton ⇒ `dashboard.css` `engine.js` `decorateReport` `injectTA` ใช้ต่อได้ไม่แก้ · theme/brand ผ่าน `deriveTheme()` เดิม
- ทุก string จาก JSON ผ่าน `esc()` · prose ผ่าน `renderProse` (whitelist) — ปิดคลาส XSS (`42c088540`)
- section ตายตัว 8 ตัว + header/footer · ส่วนที่ปรับได้มีแค่: จำนวนขา 2–4 · การ์ดตาม `cards[]` · แถวปันผลฉาก · catalyst/risk 3–8 · extras ≤2 ในตำแหน่ง `after` ที่อนุญาต (`metrics|valuation|scenarios|catalysts`) · 9th section ของ ILMN/TPG → `extras` แบบ note (headers ว่าง)
- skeleton-th/us.html **ถูกเลิกใช้** หลัง cutover (เหลือเป็น fixture ของ test เปรียบเทียบ DOM)

## 6. Write path

### 6.1 CLI `tools/report.js`

| คำสั่ง | ทำอะไร |
|---|---|
| `init <SYM> --from .queue/prep/<SYM>.md` | สร้าง `.work/<SYM>.json` จาก prep (fundamentals + medians เติมให้แล้ว · legs/prose ว่างพร้อม TODO) |
| `export <SYM>` | `reports/<SYM>.json` → `.work/<SYM>.json` (ตัด `market` + `_sig` ออก) สำหรับ UPDATE |
| `save <SYM> [--light]` | อ่าน draft → schema → merge `market` จากใบเดิม/prep → compute → กติกา B → sanity ชั้น 0 → `io.write` + sign · ล้ม = พิมพ์ error พร้อม JSON path ทุกข้อในครั้งเดียว (ไม่ all-or-nothing แบบ BUG-005) · `--light` = อนุญาตเปลี่ยนเฉพาะ `meta.analysisDate/aiModel` + prose (UPDATE-LIGHT) |
| `show <SYM> [path]` | พิมพ์ view ที่ compute แล้ว (ให้ worker ดูตัวเลขโดยไม่อ่านทั้งไฟล์ — token-lean) |
| `diff <SYM>` | draft vs ใบปัจจุบัน (เชิงความหมาย: FV/MOS/ขาเปลี่ยนเท่าไร) → controller ใช้ตรวจก่อน ship |

### 6.2 การป้องกันการเขียนสด (2 ชั้น)

1. **PreToolUse hook** (`.claude/settings.json`): Write/Edit/MultiEdit/NotebookEdit ที่ path ตรง `reports/*` → block + ข้อความ "แก้ `.work/<SYM>.json` แล้ว `node tools/report.js save <SYM>`" · Bash ที่มี `reports/` + (`>`, `sed -i`, `tee`, `cp`, `mv`) → block เช่นกัน (best-effort)
2. **ลายเซ็น `_sig`** = sha256(canonical JSON ไม่รวม `_sig`) — เขียนโดย `io.write` เท่านั้น · gate E-code ใหม่ `E50 sig mismatch` ⇒ แก้มือทางไหนก็ตาม (Bash หลุด hook, editor) ถูกจับตอน verify/pre-push · ไม่ใช่ความปลอดภัยเชิง crypto — เป็นเครื่องบอกว่า "ไม่ได้ผ่าน io.js"

### 6.3 งานแต่ละโหมด

- **NEW**: `prep` → `report.js init` → worker เขียน `.work/<SYM>.json` (legs, cards, scenarios, prose, catalysts/risks) → `pick-brand` (เขียนผ่าน save) → `report.js save` วนจนผ่าน → `npm test -- <SYM>` → คืน `TAGS:` ให้ controller
- **UPDATE**: `update-prices --write --force <SYM>` → `report.js export` → แก้ draft → `save`
- **UPDATE-LIGHT**: `export` → แก้ analysisDate/aiModel/prose ที่ต้องแก้ → `save --light` (ไม่มี E44 fix-on-touch อีก — ไม่มี literal ให้แก้)
- `apply-edits.js` `@@` blocks → **เลิกใช้กับใบ v3** (ยังใช้ได้กับใบ v2 ระหว่าง transition)

## 7. Cron (`tools/update-prices.js` สาย v3)

- อ่านด้วย `io.read` → ตั้ง `market.px/priceDate/chart/range52w/chgSuffix` → `compute` → เงื่อนไข freeze เดิม (ต่าง >15% · MOS พลิกเกิน dead-band ±5 · split · intraday guard) คำนวณจาก view → `io.write({by:'cron'})` → `verify:cron`
- **ไม่มี** `patchDerived` / `derivedPassV2` / `keepMap` / `summaryPlan` / `scenarioPlan` / `yieldPlan` / `proseTokensIfNew` สำหรับใบ v3 — ทุกค่าที่เคย patch ถูก compute ตอน build
- `patch-rejected` ยังอยู่ (gate ตกหลังเขียน → revert ไฟล์นั้น + flag)
- `range52w` ใหม่: cron เติมจาก chart data ของ fetch-facts (หรือ Yahoo 52wk) ⇒ ปิด W23 ที่ไม่มีเจ้าของ

## 8. ความสด / `updated` (ห้ามพัง index ordering + dedup 7 วัน + staleness)

- `freshHash(v3)` = hash ของ canonical JSON **ไม่รวม** `market`, `_sig`, `meta.aiModel` ⇒ cron เขียนราคาทุกวันแต่ `updated` ไม่ขยับ (ตรงพฤติกรรมเดิมที่ `preserve-dates` ต้องคอยซ่อม)
- dedup 7 วัน/staleness 45/120 อ่าน `meta.analysisDate` ตรง (ไม่ต้อง parse footer "ข้อมูล ณ" อีก — W24 หายโดยโครงสร้าง)
- migration: `updated` ใน reports.json คงค่าเดิมทุกใบ (migrate-v3 เขียน reports.json hash ใหม่ + updated เดิม — แทน preserve-dates)

## 9. Gate (`test/check-v3.js`) — ชะตากรรมของ E/W codes

เลข E/W เป็น API (อ้างใน docs/memory/skill) ⇒ **ไม่ reuse เลขเดิมกับความหมายใหม่** · ใบ v3 ใช้ check-v3 · ใบ v2 ใช้ check-reports เดิมจน cutover

| กลุ่ม | codes | ใน v3 |
|---|---|---|
| โครง HTML (doctype, lang, 8 section, chart/gauge/calc ids, footer, placeholder, CSS var) | E01–E14 E33 | 💀 ตายโดยโครงสร้าง → แทนด้วย **render smoke test** (render ทุกใบ + ตรวจ DOM ครั้งเดียวใน build-test) |
| สำเนาเดียวกันต้องตรงกัน (FV JS=กล่อง, MOS, MOS20/30, gauge, verdict FV, stock-meta, E23) | E15 E16 E18 E19 E20 E23 E25 E26 E29–E31 W10 W22 | 💀 ตาย — ค่ามีสำเนาเดียว |
| ค่าผูกราคาค้าง | E41–E43 W15–W17 W19 W20 W06 W26 W04 | 💀 ตาย — compute ตอน build |
| สูตรขา/ฉาก | E17 E21 E22 E24 W01 W05 W14 | ➡️ ย้ายเป็น schema (≥2 ขา, inputs ครบ) + compute — ไม่มีทางผิด ยกเว้น `declared` |
| prose ผูกราคา | E44 | ➡️ กติกา B: ตอน save = error (รูปเป๊ะ) · gate รายวัน = `W31` warn (นับ literal รูปเงินที่ค้าง) |
| ข้อมูล/ความสด/ความสมเหตุผล | E27 E28 E32 E34–E40 W07–W09 W12 W13 W21 W23 W24 | ➡️ คงไว้ อ่านจาก JSON (W21/W24 ตายเพราะอ่านไม่ได้ไม่มีอีก) |
| ดุลพินิจ valuation | W18 W25 + ชั้น 0 (rf สกุล · (r,g) ซ้ำ · \|MOS\|>40%) | ➡️ คงไว้ **แม่นขึ้น** — คำนวณจาก `legs[].inputs` ไม่ใช่ regex `.mdesc` |
| ใหม่ | `E50 sig` · `E51 schema` · `E52 declared-leg ไม่มีหลักฐาน / sumCol ≠ ค่าขา` · `W30 lit` เกิน · `W31 prose-lit` ค้าง | ใหม่ |

- self-test (meta-test) ของ v3 = **mutate JSON** (ไม่ใช่ HTML) แล้วดูว่า check ยิง · ต้องมีเคสต่อทุก code ใหม่/ที่ย้าย
- `verify` 18 ขั้น: เพิ่ม `v3-test` (schema/compute/prose/render unit) + `check-v3` · ระหว่าง transition รันทั้งสองสาย

## 10. Migration (`tools/migrate-v3.js`) — sweep ครั้งเดียว + ขนานกับของเดิม

1. **Parse** v2/v1 HTML ด้วย parser/locator เดิม (`report-values`, `derived-values` CARD_SRC, `.vmethod`) → สร้าง v3 doc
   - legs: จำแนก method จาก `.mname`/`.mdesc` (P/E 850 · DCF-family 393 · DDM 324 · P/BV 243 …) → ดึง inputs · จำแนกไม่ได้/inputs ไม่ครบ → `declared` + ค่า `.mval` เดิม
   - fvWeights: ถ้า FV เดิม ≠ ค่าเฉลี่ยขา → แก้ weights ให้ได้ FV เดิม (≤2 ขา แก้ได้เสมอ · 3–4 ขาเลือกที่ใกล้เท่ากันสุด) · ทำไม่ได้ → รายชื่อคน
   - prose: แทน literal ที่ตรงค่าผูกราคาด้วย token (ใช้ตัวตรวจกติกา B เดียวกัน) · `{{rd:x}}` → token v3 · นับ `PROSE-LIT` (literal รูปเงินที่เหลือ) ต่อใบ — **>0 ⇒ ถัง VALUE-DRIFT ไม่ใช่ CLEAN** (literal ลอกราคาวันวิเคราะห์ที่ราคาขยับไปแล้ว จับด้วยการเทียบราคาวันนี้ไม่ได้)
   - cards: map label → แคตตาล็อก · ไม่ลง → `custom[]` (ถ้าไม่ผูกราคา) หรือรายชื่อคน
2. **Equivalence diff**: render v3 → เทียบกับ `dist/` v2 ปัจจุบันแบบ **text ที่มองเห็น** (normalize ช่องว่าง) ต่อ section · อนุญาตต่างเฉพาะตัวเลขที่ compute ต่างจาก literal เดิมเกิน rounding → รายงานว่า "ค่าเดิมค้าง, v3 ถูก" (คาดว่าเจอเยอะ = บัคเงียบที่ v2 ซ่อนอยู่) · ห้ามมี **ข้อความหาย** (บทเรียน `.ret` 23 ไฟล์) — word-level diff ของ prose ต้องว่าง
3. **สี**: equivalence diff มีช่อง colour ด้วย — theme ที่ render เทียบ theme เดิมทุกคีย์ rgbDist ≤12 ไม่งั้นเข้าถัง HUMAN (ไม่ควรเกิดเพราะ §3.5 เก็บ themeLegacy)
4. **ผลลัพธ์ 3 ถัง**: `CLEAN` (เขียน .json ลบ .html ใน commit เดียวกัน) · `VALUE-DRIFT` (ต่างเฉพาะตัวเลขที่ v2 ค้าง — controller รีวิวตาราง แล้วอนุมัติเป็นชุด) · `HUMAN` (ขาจำแนกไม่ได้ · weights ไม่ลง · ข้อความหาย · v1 ที่ 21 ใบตัดสินไม่ได้) — คาด ~20–60 ใบ
5. **Transition**: build อ่านทั้ง `reports/*.html` (v2 path เดิม) และ `reports/*.json` (v3) · ห้ามมีทั้งสองไฟล์ของหุ้นเดียว (build error) · cron เดินสองสาย · NEW ทุกใบเป็น v3 ตั้งแต่วันเปิด
6. **Cutover** เมื่อถัง HUMAN = 0: ลบ v2 path (`derivedPassV2`, `keepMap`, `patchDerived` สาย HTML, `migrate*.js`, `apply-edits` `@@`, `field-manifest`, `preserve-dates`, V2TOKENS, check-reports ส่วน HTML, `brandtheme.js --write` + `fix-contrast.js` ที่ regex theme ใน report-data — สีอยู่ที่ seeds.json ที่เดียว) — **ลบโค้ดจำนวนมาก** เป็นตัวชี้วัดความสำเร็จ

## 11. ลำดับการทำ (phase — แต่ละ phase merge ได้เอง ไม่พังของเดิม)

| Phase | ส่งมอบ | เกณฑ์จบ |
|---|---|---|
| P1 แกน | `schema.js` `compute.js` `prose.js` `io.js` + unit test (สูตร/ปัดตรง v2 `derive()` ทุก token) | test ผ่าน · compute ของ 10 ใบตัวอย่าง = ค่าที่ v2 render ได้ |
| P2 render | `_template/v3/render.js` + build dual-path + freshHash v3 · `reports.json.file` ของใบ v3 ยังเป็น `<SYM>.html` (ชื่อใน dist — ไม่งั้น url พัง) · theme จาก seeds.json | render ใบตัวอย่าง DOM เทียบ skeleton ผ่าน · หน้าตาเหมือนเดิม (screenshot 3 ใบ) |
| P3 gate | `check-v3.js` + self-test JSON + hook + `E50` | ทุก code ในตาราง §9 มีบ้าน · self-test ครบ |
| P4 CLI + worker | `report.js` (+ `.work/` ใน .gitignore) + แก้ stock-analyzer SKILL / agent-prompt / stock-controller / CLAUDE.md §2/§10 | NEW 2 ใบ (TH+US) จริงผ่าน v3 end-to-end ด้วย Sonnet |
| P5 cron | สาย v3 ใน update-prices + `range52w` | dry-run บนใบ v3 ทั้งหมด = ไม่มี diff นอก market · รอบจริง 3 วันไม่มี patch-rejected ผิดปกติ |
| P6 migrate | `migrate-v3.js` + รายงาน 3 ถัง · migrate CLEAN เป็นแบตช์ (เสนอยกเว้นกฎ §5 "1 commit = 1 หุ้น" เป็น commit ละ 50 ใบ เพราะเป็นงาน mechanical — รอเจ้าของอนุมัติ §13 ข้อ 1) | CLEAN+VALUE-DRIFT ย้ายหมด · รายชื่อ HUMAN ส่งเจ้าของ |
| P7 cutover | ลบ v2 path + เอกสาร | HUMAN = 0 · verify ผ่าน · cron 7 วันเขียว |

## 12. ความเสี่ยง + ตัวกัน

| ความเสี่ยง | ตัวกัน |
|---|---|
| migration ทำข้อความหายเงียบ (ซ้ำ `.ret`) | word-level prose diff ต้องว่าง ไม่งั้นเข้าถัง HUMAN · ห้าม mask ข้อความ |
| compute ปัดต่างจาก v2 → ตัวเลขบนเว็บขยับทุกใบวันเดียว | P1 เกณฑ์: ทุก token ของ v2 ต้องได้ string เดียวกันบนใบตัวอย่าง + corpus test ทั้ง 885 ใบ v2 |
| schema แข็งเกินจน worker เขียนหุ้นแปลกไม่ได้ | `declared` leg + `custom[]` + `extras[]` + `{{lit:}}` = ทางออกที่นับได้ · gate นับการใช้ ถ้าโตผิดปกติ = schema ขาดอะไร |
| worker (Sonnet) เขียน JSON ยาวผิดบ่อย → turn เพิ่ม/ต้นทุน | `save` คืน error ทุกข้อในครั้งเดียวพร้อม path · `init` เติมโครงให้ · วัด turn ใน P4 เทียบ benchmark (`token-usage-benchmarks`) |
| hook ถูกเลี่ยงผ่าน Bash | `_sig` + E50 ใน pre-push จับได้เสมอ |
| cron สองสายระหว่าง transition | สาย v3 ง่ายกว่า (ไม่มี regex) · ทดสอบ dry-run ก่อน · ช่วง transition จำกัดด้วยเกณฑ์ P7 |
| ใบที่ "ถูกซ่อมเงียบ" ตอน migrate (VALUE-DRIFT) ทำตัวเลขบนเว็บเปลี่ยน | เป็นการแก้บัคจริง แต่ต้องให้เจ้าของเห็นตารางก่อนอนุมัติแบตช์ |

## 13. คำตัดสินที่เปิดไว้ (เจ้าของมอบให้ controller ตัดสิน 24 ก.ย. 69)

1. **commit ของ migration**: ถัง `CLEAN` = commit ละ 50 ใบ (mechanical ไม่เปลี่ยนตัวเลขที่เห็น) · ถัง `VALUE-DRIFT` และ `HUMAN` = **1 commit = 1 หุ้น** ตาม §5 เดิม (ตัวเลขบนเว็บเปลี่ยน → ต้องย้อน/ไล่ได้รายตัว) · message `migrate: v3 <SYM…>`
2. **แคตตาล็อกการ์ด section 1**: controller ร่างใน P1 จากการจัดกลุ่ม label 1,526 แบบ (เป้า ~25 คีย์ครอบ ≥90% ของการ์ดในคลัง) → แนบตารางใน PR ของ P1 ให้เจ้าของดู · ไม่ block phase อื่น
3. **DCF**: สูตรมาตรฐาน 2-stage · ไม่ลง → `declared` · P6 วัดสัดส่วน DCF ที่ตกเป็น declared — **>10% ⇒ เพิ่ม 3-stage** ก่อน migrate ต่อ
