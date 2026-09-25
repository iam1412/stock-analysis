# Report v3 — JSON เป็นต้นฉบับ · template เดียว render ทุกใบ · script เป็นผู้เขียนคนเดียว

- วันที่: 24 ก.ย. 69 (2026-09-24) · สถานะ: **อนุมัติแล้ว** (advisor + เจ้าของ 24 ก.ย. 69)
- เจ้าของตัดสินแล้ว (session 24 ก.ย. 69): (1) ต้นฉบับ = `reports/<SYM>.json` · (2) migrate = script sweep + text-diff กับ HTML เดิม + รายชื่อให้คนตัดสิน · (3) กติกาตัวเลขใน prose = **B** (ตัวเลขผูกราคาห้ามพิมพ์เอง ต้องเป็น token · ตัวเลขจากงบพิมพ์ได้) · (4) มีช่อง `extras[]` ตารางข้อมูลล้วน ≤2 ตาราง · (5) template ดึงข้อมูลจาก JSON — JSON เก็บ **เฉพาะค่าที่ตัดสินใจ** ค่าคำนวณทั้งหมดคิดตอน build
- หลักฐานที่ใช้ออกแบบ: วิจัย 3 สาย (ประวัติบัค 3,013 commit / 272 fix · write path ปัจจุบัน · สำรวจ 909 ใบ) — สรุปอยู่ใน §1
- แก้ไข Plan 2b/2c (24 ก.ย. 69 · Task 0 ของ Plan 2b + คำตัดสิน advisor — `.superpowers/sdd/v3-plan2b-task0/rulings.md`): §3 (หมายเหตุ token) · §6.1 · §6.2 · §6.3 · §6.4 ใหม่ (prep sidecar · ที่มาของข้อมูลปรับตาม plan R1 — advisor 24 ก.ย. 69) · §6.5 ใหม่ (`report-source.js`) · §9 · §11 (แยก 2b/2c) · §12 · §13 ข้อ 8–15

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

> **หมายเหตุ token (Plan 2b)**: `{{rd:…}}` เป็นไวยากรณ์ของ **v2 เท่านั้น** (HTML + `report-data.values`) · ใบ v3 ใช้ token ของ view เช่น `{{px}}` `{{fv}}` `{{mos}}` `{{leg1}}` `{{scn.base.tgt}}` `{{card.pe}}` (ชุดเต็ม §4) · `{{rd:…}}` ในช่องใดของใบ v3 = error `E51` (§9) — วัดแล้วว่าวันนี้หลุดผ่าน: render ผ่าน `expandReport` ของ v2 ได้ตัวเลขจริง แต่จะรั่วเป็นวงเล็บดิบเมื่อ P7 ลบ v2 path

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
| `ddm2` (ใหม่ Task 0 — §3.6 N) | d1, g1, years1, g2, r, horizon (int \| null) | Σ_{t=1..horizon} D_t/(1+r)^t · D_1 = d1 · D_{t+1} = D_t·(1+g1) เมื่อ **t < years1** ไม่งั้น (1+g2) · horizon null = Gordon ปลายช่วง 2 |
| `dcf` | g1, years1, tg, r, rfCurrency (fcf/netDebt/shares มาจาก fundamentals หรือ override — สำเนาเดียว) | 2-stage มาตรฐาน |
| `ri` | r, years, payout (bvps/roe จาก fundamentals หรือ override) | residual income มาตรฐาน |
| `declared` | `value` + `basis` (enum: sotp \| nav \| rnpv \| other) + `extrasRef?` | ค่าที่ประกาศ — **ต้อง** ผูก `extras[]` ที่รวมยอดได้ (sotp/nav) หรือมีเหตุผลใน note |

- `multipleSource` enum: `median5y` · `median10y` · `peer` · `justified` · `sector` — **ไม่มี `current`** ⇒ สมอตายแบบประกาศตรง = error ตอน save · สมอตายแฝง (multiple ห่าง px/eps หรือ forward ≤7%) = W18/W25 เป็น **การคำนวณ** ไม่ใช่ regex
- `fv` = Σ wᵢ·legᵢ (default เท่ากัน) · `fvLow/fvHigh` = min/max ของขา — **คิดเอง** ไม่เก็บ · ส่วนขยาย Task 0 (ไม่บังคับ): ถ่วงตาม `family` (§3.6 C) · ขา `role:'context'` ไม่นับ (§3.6 I) · `multipleRange` กำหนดกรอบ (§3.6 F)
- เป้า analyst ห้ามเป็นขา (ไม่มี method ให้) — ปิด GAP-001 โดยโครงสร้าง
- DCF/RI ใช้สูตรมาตรฐานเดียวทั้งระบบ — โมเดลที่ไม่ใช่มาตรฐาน → `declared` (โปร่งใสว่าเป็นค่าประกาศ) · ชั้น 0 (rf ตรงสกุล · 2 วิธีใช้ (r,g) เดียว = วิธีเดียว) กลายเป็น check บน inputs

### 3.2 การ์ด section 1

- `cards[]` เลือกจาก **แคตตาล็อกปิด** ใน `schema.js` (~25 คีย์) แต่ละคีย์ประกาศ label ไทย/สูตร/ที่มา: ค่าผูกราคา (`mcap`, `pe`, `pbv`, `yield`, `ps`, `evEbitdaNow`, `range52w`) **คิดเอง** · ค่าจากงบ (`eps`, `roe`, `revenue`…) อ่านจาก `fundamentals` · การ์ดที่ข้อมูลไม่มี → save error ("ถอดการ์ดออก หรือเติม fundamentals.x")
- label/บรรทัด `.d` (ฐานการคำนวณ เช่น "EPS TTM $6.13") **template เขียนเอง** จาก fundamentals — ไม่ใช่ AI
- `custom[]` ≤4 สำหรับข้อมูลเฉพาะธุรกิจ — `value` ผ่านกติกา B (ห้ามเป็นตัวเลขผูกราคา)
- แคตตาล็อกได้มาจาก label 1,526 แบบของคลังปัจจุบัน (จัดกลุ่มตอนทำ plan) — label ที่ไม่ลงแคตตาล็อก → migrator ใส่ `custom[]` หรือรายชื่อคน
- ส่วนขยาย Task 0 (§3.6 B/H/J/K): `cards[]` เป็นลำดับที่แทรก custom ได้ + `tone` ต่อการ์ด + การ์ด FY/REIT/ธนาคาร · label ของ `peAvg5y` ต้องเป็น **"มัธยฐาน"** ไม่ใช่ "เฉลี่ย" (บัค label — ค่าเป็นมัธยฐานจาก median-multiples อยู่แล้ว)

### 3.3 Scenarios

- `tgt = base × (1+g)^years × exitMultiple` (driver ต่อหุ้น) · `total% = (tgt + divCum·[divIncluded] − px)/px` · `%/ปี` ตาม `perYear` — **ใช้สูตร/การปัดเดียวกับ `derive()` v2 เป๊ะ** (round-trip fmtMos · บทเรียน 20 ส.ค. 69)
- ปิด E24/W01/W17 โดยโครงสร้าง · 3/3/3 แถว (ไม่มีปันผล) = `divIncluded:false` → template ถอดแถวเอง
- divCum เป็นข้อมูลประกอบได้แม้ divIncluded=false — แสดงแถวปันผลต่อฉากเมื่อมี divCum แต่ไม่รวมใน total% (คลัง v2 มี 141 ใบแบบนี้)
- **migration (Plan 4 Task 0 · 25 ก.ย. 69 · 4b ตัดสินใต้กฎนี้)**: `exitMultiple` = ค่าที่ผู้เขียนพิมพ์ **ห้าม back-solve ให้ได้เป้าเดิม** — แก้ได้เฉพาะภายในครึ่งหน่วยของทศนิยมที่พิมพ์ (859/2724 คอลัมน์ตรงด้วยค่าที่พิมพ์ · 1671 ถ้า solve — ส่วนต่างคือเลขที่ผู้เขียนปัด ไม่ใช่ input ที่ซ่อน) · เกินนั้น = คงค่าที่พิมพ์ ปล่อยเป้าขยับ → VALUE-DRIFT · `exitDp` สำหรับแสดง (render.js:134 พิมพ์ดิบ) · `exitMetric` เพิ่ม `evsales` · `driver` เพิ่ม `de`/`fre` (34 ใบนอก enum) — รายละเอียด `.superpowers/sdd/v3-plan4-task0/findings-migration.md` Q5

### 3.4 ค่าที่ compute ให้ (ไม่เก็บใน JSON)

`fv fvLow fvHigh legValue[i] mos mosClass mos20 mos30 upside pe pbv yield mcap ps chg(annual) chart.min/max/grid/highlight gauge.min/max/scale verdictClass summaryText scenario.tgt/total/perYear/cls analystPct priceDateText analysisDateText` — แทน `stock-meta` ทั้งบล็อก (index/reports.json อ่านจาก compute)

---

### 3.5 สีแบรนด์ — ทำไมมี `themeLegacy` (วัดจริง 24 ก.ย. 69 · แก้ fix #3 ของ advisor ที่ไม่ครบ)

- advisor เสนอ "ตัด theme ออก ใช้ seeds.json ที่เดียว" — วัดแล้ว **ไม่ครบ**: seeds.json มีแค่ 227/909 ใบ · 53/227 ไม่ตรง `makeTheme(seed)` แล้ว (สูตรถูก retune ทีหลัง: darkGrad/subColor/verdictText ต่าง) · 682 ใบที่ไม่มี seed ลองหา seed ย้อน (grid-search hue±6/s/l) ได้ accent ตรง ≤12 แค่ 210 ใบ และตรงครบ 8 คีย์แค่ **17 ใบ**
- ⇒ palette ของใบเก่า **เป็นข้อมูล ไม่ใช่ค่าที่ derive ได้** — เก็บไว้ไม่ผิดหลัก "ค่าละ 1 สำเนา" (ไม่มีสำเนาอื่นและคำนวณไม่ได้) · re-derive = เปลี่ยนสี ~700 หน้า (accent เปลี่ยน ~470) = งานดีไซน์ ไม่ใช่ migration
- กติกา: migrate → ใบที่ `makeTheme(seed)` ตรงทุกคีย์ ≤12 ไม่เก็บ themeLegacy (ใช้ seed) · ที่เหลือเก็บ `themeLegacy` · `save` ปฏิเสธ themeLegacy ในใบ NEW · ถ้าวันหนึ่งเจ้าของอยากให้ทุกใบใช้สูตรปัจจุบัน = ลบ themeLegacy ทีละชุด (งานแยก ต้องเห็นภาพก่อน)
- seeds.json ได้ entry ครบทุกใบตอน migrate (seed เดิม หรือ seed ย้อนที่ใกล้สุด) เพื่อให้ pick-brand ตรวจสีชนได้ทั้งคลัง · ลบรายงาน → `pick-brand --prune`

### 3.6 ส่วนขยาย schema จาก Task 0 (แปลงใบจริง 3 ใบด้วยมือ 24 ก.ย. 69 — Plan 2a)

ที่มา: Plan 2 Task 0 แปลงใบจริง 3 รูปร่างเป็น fixture — `test/fixtures/v3/BBL-real.json` (ธนาคาร TH) · `EQIX-real.json` (REIT) · `FER-real.json` (SOTP + งบ EUR) — ผลเทียบอยู่ใน `docs/superpowers/specs/2026-09-24-{BBL,EQIX,FER}-v3-compare.md` · ตารางรวมช่องว่าง A–R = `.superpowers/sdd/v3-plan2-task0/gaps-consolidated.md` · ตัวเลข "ใบ/909" = ประมาณจากการสแกน `reports/*.html` ของแต่ละ compare doc

**หลักของทุกช่องในหัวข้อนี้**: **ไม่บังคับทั้งหมด** · ไม่มีช่อง = พฤติกรรมเดิมทุก byte ⇒ corpus parity ต้องคง **909/909** · ช่องข้อความทุกช่องเป็น prose (whitelist `<b> <i> <br>` + กติกา B + render token) · object ยังปิด (คีย์ไม่รู้จัก = error)

**ไม่ใช่ช่องว่าง (เจ้าของเลือกทาง B = มาตรฐานเดียวทั้งเว็บแล้ว — ห้ามเพิ่มช่อง)**: h1 ต่อท้าย "(TICKER)" · exit multiple ทศนิยม 1 ตำแหน่ง · ทศนิยมของ 52 สัปดาห์ · ทศนิยมของ ROA — เหลือแก้แค่ **label การ์ด `peAvg5y` ต้องเขียน "มัธยฐาน" ไม่ใช่ "เฉลี่ย"** (บัค label · BBL G9)

| # | ช่อง / พฤติกรรม | เหตุผล (1 บรรทัด) | fixture | ใบ/909 |
|---|---|---|---|---|
| A | object ระดับบนสุดใหม่ `text` (ไม่บังคับ · ปิด): `text.valHint` (hint หัว §3 + ถ้อยคำกล่อง FV) · `text.valIntro` (ย่อหน้าก่อนขา) · `text.metricsNote` (ย่อหน้าใต้การ์ด §1) · `text.disclaimerAssump` (ประโยค "โดยเฉพาะ …" ของ disclaimer) | ข้อความตายตัวของ template ผิดกับใบจริง (FER "โดยเฉพาะ P/E เป้าหมาย" ขัดกับรายงานที่ห้ามใช้ P/E) · ไม่มีช่อง = ต้องยัดเข้า `prose.valuation`/`disclaimerSources` จนประโยคซ้ำ/สลับลำดับ | ทั้ง 3 (FER 1/2/5 · BBL G1/G7 · EQIX 6/7) | hint 743 · disclaimer 350 · ย่อหน้าเพิ่ม 62 (intro 8) |
| B | `fundamentals.fy: { period, netIncome?, eps?, revenue? }` + การ์ด `netIncomeFy` `epsFy` `revenueFy` (label ต่อท้าย `period`) · `metrics.cards` = **ลำดับ** ที่ผสมคีย์แคตตาล็อกกับ `"custom:<i>"` ได้ (render ตามลำดับที่เขียน · custom ที่ไม่ถูกอ้างต่อท้ายตามเดิม) | ตัวเลข FY คู่ TTM เป็นรูปปกติของคลัง แต่ `fundamentals` มี eps/netIncome ชุดเดียวที่ผูก P/E ⇒ ต้องเปลือง custom · custom ถูกดันไปท้ายเสมอ ทำลำดับการ์ดเดิมพัง | BBL G2 · FER 4 · EQIX 11 | FY 536 · ลำดับ 508 |
| C | `legs[i].family` enum `market` (ตัวคูณยึดตลาด) \| `rg` (สมมติฐาน r,g: ddm/ddm2/dcf/ri/pbv-justified) \| `asset` (sotp/nav) — **สคีมาบังคับให้ตรง method** (final review 24 ก.ย. 69 · `S.requiredFamily`): ddm/ddm2/dcf/ri/pbv-justified ที่เขียน family ต้องเป็น `rg` · declared sotp/nav ต้องเป็น `asset` · ขาตัวคูณ (มี `multipleSource`): `justified` (สร้างจาก r,g) = `rg` · อื่นทั้งหมดรวม `current` = `market` · โซนเทา (declared rnpv/other · fcfyield) ผู้เขียนเลือกเอง · ไม่เขียน family แล้ว W32 เดา declared rnpv/other = `rg` (rNPV = ตระกูลคิดลดกระแสเงินสด ไม่ใช่มูลค่าสินทรัพย์ที่ตีราคาได้) — เมื่อ **ไม่มี** `fvWeights` แต่มี family: wᵢ = 1/(จำนวนตระกูล × จำนวนขาในตระกูลของ i) (1 ตระกูล 1 เสียง แบ่งเท่ากันในตระกูล) · gate: 2 ขาที่ (r,g) เหมือนกันทุกตัว = ตระกูลเดียวกันเสมอ (family ต่างกัน = error ชั้น 0) | กฎ 0.4c-bis ปัจจุบันเขียนเป็นตัวเลข `fvWeights` ล้วน เหตุผลหาย และไม่มีอะไรตรวจว่าน้ำหนักตรงกฎ · BBL `[0.5,0.25,0.25]` ได้เองจาก family | BBL G1 | ~743 (514 มีคำว่า "ตระกูล" ใน hint) |
| D | `analyst.n` และ `analyst.asOf` ไม่บังคับ · n = null → ช่องจำนวนแสดง "n/a" แต่ **คงเป้า + ป้าย gauge** | v2 แทบไม่มีจำนวนราย/วันที่ ⇒ ต้องตั้ง `analyst:null` → เซลล์ verdict ขึ้น "ไม่มีข้อมูล" ซึ่ง **เป็นเท็จ** และป้ายเป้าบน gauge หาย (FER $76.96) | FER 3 · BBL G10 | n 499 (762/880 เซลล์ไม่มีจำนวน) · asOf ทุกใบ migrate |
| F | `legs[i].inputs.multipleRange: [lo, hi]` (lo ≤ multiple ≤ hi · ขาประเภทตัวคูณ) → ถ้ามีขาใดมี range: `fvLow = Σ wᵢ·loᵢ` · `fvHigh = Σ wᵢ·hiᵢ` (ขาที่ไม่มี range ใช้ค่าขาทั้งสองฝั่ง) · ไม่มี = min/max เดิม | กรอบ FV ของผู้เขียนมาจาก sensitivity ไม่ใช่ min/max ของขา — v3 แสดงกรอบผิดโดยไม่มีทางออก · EQIX `[59.9, 99.2]` × AFFO 15.55 = **$931.45 / $1,542.56** ตรงเป๊ะ | EQIX 1 | 121 |
| G | `legs[i].note` (มีอยู่แล้ว) = qualifier **สั้น** ต่อท้าย mdesc (เช่น "Normalized EPS", "ปันผล FY25") ผ่านกติกา prose · `inputs.medianWindow` string (เช่น `"FY2022–FY2025"`) แทนคำ "มัธยฐาน 5/10 ปี" ใน mdesc · `epsBasis` เพิ่ม `ifrs` (การ์ด eps `.d` = "IFRS") | qualifier ของขาหายเมื่อ label ถูกสร้างจาก method · หน้าต่างมัธยฐานจริงไม่ใช่ 5/10 ปีพอดี · ผู้ยื่นงบ IFRS ถูกพิมพ์ว่า "GAAP" | BBL G8 · EQIX 12 · FER 12 | แทบทุกใบ · IFRS ~14 |
| H | **ไม่มี markup token** · ใช้ `tone: 'pos'\|'neg'\|'neu'` ต่อการ์ดแทน (`metrics.cards[i]` เขียนเป็น `{ "key": "pbv", "tone": "pos" }` ได้ · `metrics.custom[i].tone`) → render เป็น class สีเดิม (`.v pos` ฯลฯ) | ต้องการสีค่าบวก/ลบบนการ์ดแบบใบเดิม แต่ไม่ขยาย whitelist/pill (กัน markup creep ที่ template เดียวตั้งใจปิด) — ป้าย pill ในข้อความตกเป็นข้อความธรรมดา | BBL G4 | pill ใน `.d` 124 · ใน `.mname` 93 |
| I | `legs[i].role: 'fv' \| 'context'` (default `fv`) · ขา context: **แสดง** (ต่อท้ายชื่อ "(บริบท — ไม่นับใน FV)") แต่ไม่เข้า FV / กรอบ / น้ำหนัก (`fvWeights` ยาวเท่า legs แต่ขา context ต้องเป็น 0) · ดูคำตัดสินชั่วคราว E17 ใน §13 ข้อ 4 | ใบจริงมีขา "บริบท" ที่แสดงแต่ไม่นับ — `fvWeights:[1,0]` ได้ FV ถูกแต่กรอบ FV/hint/จำนวนขายังนับมัน | EQIX 2 | 38 ใบ / 43 ขา (15 ใบเหลือขา fv <2) |
| J | REIT: `fundamentals.ffoBasis: 'ffo'\|'affo'` (label FFO/AFFO ตาม basis ทุกที่) · `fundamentals.ffoForward: { value, period, low?, high? }` · การ์ด `pffo` (ผูกราคา · token `{{pffo}}` · เข้า `priceBound`) `pffoForward` `ffoPerShare` `pffoAvg5y` (+`fundamentals.pffoAvg5y`) `ffoMargin` `ffoPayout` · hint §6 แสดงฐานของ driver ทุกชนิด (ไม่ใช่เฉพาะ eps) · ดูคำตัดสินชั่วคราว `stock-meta.pe` ใน §13 ข้อ 5 | AFFO ของ EQIX ถูกพิมพ์เป็น "FFO" ทุกที่ · P/FFO เป็นตัวเลขผูกราคาที่ไม่มี token จึงค้าง ("~26.6x" vs จริง 27.6x) · การ์ด REIT กิน custom จนเต็ม 4 | EQIX 3–5/8 | กล่าวถึง FFO 31 · มีการ์ด 27 · hint §6 17 |
| K | ธนาคาร: `fundamentals.bank: { nim, npl, coverage, cet1, car }` (% ทั้งหมด) + การ์ด `nim` · `npl` (NPL / Coverage) · `capital` (CET1 / CAR) — การ์ดที่ข้อมูลไม่มี = save error เหมือนการ์ดอื่น | KPI ธนาคารเป็น free text ใน custom (ตรวจไม่ได้ · gate/index ใช้ไม่ได้) และกิน custom จนชนเพดาน | BBL G5 | 41 (23 มี ≥2 การ์ด) |
| L | `fundamentals.reportCurrency` (ISO) + `fundamentals.fx` (ราคา 1 หน่วยสกุลงบ เป็นสกุลราคา) · การ์ดจากงบ (revenue/netIncome/fcf/netDebt) แสดง**สกุลงบ** · อัตราส่วนผูกราคาแปลงด้วย `fx` (ค่าเก็บที่เดียว) | FER งบ EUR แต่ `big()` ใส่ `$` เสมอ ⇒ ต้องย้ายตัวเลขงบไป custom 4 ใบเต็มเพดาน | FER 7 | ~14 |
| M | `extras[i].rows[]` แถวเป็น array (เดิม) หรือ `{ "kind": "total", "cells": [...] }` / `{ "kind": "note", "text": "…" }` (แถว note colspan เต็มตาราง) · `extras[i].columns[]` (ยาวเท่า headers) `{ dp, unit: 'none'\|'pct'\|'x'\|'ccy', signed? }` — ลบใช้ U+2212 เสมอ · `extras[i].fx: true` = แถวขั้นแปลงสกุลด้วย `fundamentals.fx` · **E52 SOTP tie-out**: ยอดรวม (แถว total ถ้ามี — ต้อง = Σ แถวข้อมูลใน sumCol ภายใต้การปัด — ไม่งั้น Σ แถวข้อมูล) × fx ≈ ค่าขา declared ที่อ้าง `extrasRef` (tolerance **1%**) | E52 ยังไม่มีจริง · แถวรวมเขียนเองไม่ได้ (จะนับซ้ำ) · SOTP สกุลต่าง (Σ €44.84 × 1.15566 = $51.81) ทำให้ E52 แบบง่ายตก · format ตัวเลขตายตัว 2dp | FER 8/10/11 | ตาราง 5 ใบ + ขา SOTP/NAV 15 |
| N | method `ddm2` (DDM 2 ช่วง/อายุจำกัด) — สูตรใน §3.1 · **ธรรมเนียมรอยต่อช่วง**: D_1 = d1 และโตด้วย g1 **ขณะ t < years1** (D_2…D_years1) จากนั้น g2 · FER: d1 2.04, g1 11, years1 10, g2 3, r 8.5, horizon 40 → **$55.02 เป๊ะ** (ธรรมเนียม t ≤ years1 ได้ $57.67 = ค่าผิดเดิมของผู้เขียน "$57.66") | ขา DDM อายุจำกัดต้องตกเป็น `declared` ทั้งที่คำนวณได้ — ขาที่คำนวณจะกันเลขผิดแบบ $57.66 ได้โดยโครงสร้าง | FER 9 | ≥4 (กลุ่มสัมปทาน/สาธารณูปโภคมากกว่านี้) |
| O | **บัค** (ไม่ใช่ช่องใหม่): token ใน `metrics.notes` ต้องถูก render (เดิม `renderCard` แค่ `esc()` ⇒ `{{pe}}` รั่วเป็นตัวอักษร + ยิง E13) — ใช้ `renderProse` แบบเดียวกับ custom | ผู้เขียนถูกบังคับให้คง literal ค้าง ("P/E ~65.7x") เพราะ token ใช้ไม่ได้ | EQIX 9 | ทุกใบที่มี note ผูกราคา |

- ช่องว่าง E (กติกา B false positive) → แก้ที่ §4 · Q/R (ความหมาย eps/epsForward ของ v2 · literal ค้างในใบจริง) เป็นเรื่อง migration ไม่ใช่ schema → §10
- ห้าม "ขยายเพดาน custom" แทนช่องข้างบน — Task 0 วัดแล้วว่าใบจริงทั้ง 3 ชนเพดาน custom 4 เพราะขาดช่องเหล่านี้ (ดู §12)

## 4. Prose + กติกา B (`tools/v3/prose.js`)

- ไวยากรณ์ token: `{{px}}` `{{fv}}` `{{mos}}` `{{leg1}}` `{{leg1.multiple}}` `{{scn.base.tgt}}` `{{scn.bull.ret}}` `{{analyst.target}}` `{{card.pe}}` … — ชุด token = **ทุกค่าใน view ที่ compute สร้าง** (ตารางเดียวใน `compute.js` ไม่มีรายการเขียนมือแยก)
- token ที่ค่าเป็น null → save error (ไม่ใช่ render เป็นว่าง)
- **HTML ใน prose**: อนุญาตแค่ `<b> <i> <br>` + `**bold**` — tag อื่น/attribute/style = error (ปิด inline style 144 จุดของ FER)
- **กติกา B — 2 ระดับ**: สกัดตัวเลขที่มี `$ ฿ บาท % x เท่า` ใน prose/notes/custom/extras → เทียบกับ **ทุกค่าผูกราคาใน view**
  - **error (ตอน `save`)** = ตรงกับ **รูปที่ render แล้วแบบเป๊ะ** (`$70.12` · `27.6%` · `28.0x`) — AI ลอกเลขจาก `report.js show` จึงได้รูปเป๊ะเสมอ ⇒ จับการก๊อปจริงครบ
  - ⚠️ **ข้อกล่าวอ้างเดิม "false positive ~0" วัดแล้วผิด (Task 0 · 24 ก.ย. 69)**: fixture ใบจริงยิง error บน prose ที่ถูกต้อง **BBL 3 · EQIX 2 · FER 11** (ตัวเลขที่ Task 0 รายงาน · วัดซ้ำที่ Plan 2a base c139cacbb = error 2/2/0 — FER 11 เป็น warn) — P/E ย้อนหลัง "9.0x" = P/E ปัจจุบันพอดี (BBL) · รายได้ "+16% YoY" = analyst "+16%" (EQIX) · "$80M" เทียบเป้าฉาก $80.39 และ % จำนวนเต็มบังเอิญ (FER) ⇒ **กติกาใหม่ของระดับ error** (แทนข้อบน):
    1. error เฉพาะเมื่อ literal ตรงกับรูปที่ render **รวมทศนิยมครบ** (`$70.12` · `27.6%` · `28.0x`)
    2. **จำนวนเต็มล้วนไม่เคยเป็น error** (`16%` · `6x` · `$80`) — อย่างมากเป็น warn
    3. ตัวเลขเงินที่มี **หน่วยต่อท้าย** `M B K ล้าน พันล้าน bn mn` = ข้าม (เป็นยอดงบ ไม่ใช่ราคาต่อหุ้น)
    4. ตัวคูณในอดีต/exit ที่ **เท่ากับตัวคูณปัจจุบันพอดี** ต้องห่อ `{{lit:…}}` พร้อมเหตุผลใน `meta.litReasons` (ไม่ใช่ข้ามเงียบ)
    - เป้า: **0 error บน `BBL-real` / `EQIX-real` / `FER-real` โดยไม่แก้ prose ของ fixture** (ยกเว้นห่อ `{{lit:}}` ตามข้อ 4) · ตัวเลขจากงบที่ค่าใกล้เคียงบังเอิญ (netMargin 27.4% vs MOS 27.6%) ยังไม่ถูกบล็อกเหมือนเดิม
  - **warn** = อยู่ในช่วง tolerance (เงิน ±1.5% · % ±0.6 จุด · multiple ±3%) แต่ไม่เป๊ะ → พิมพ์ให้ worker ดู ไม่บล็อก
  - **`W31 prose-lit` (gate รายวัน · warn)** = ตัวเลขรูปเงิน (`$ ฿ บาท`) ใน prose ที่ไม่ใช่ token และไม่อยู่ใน `{{lit:}}` — ไม่เทียบกับราคาปัจจุบัน (กัน false positive เมื่อราคาขยับ) แค่ **นับ** ให้เห็นกากที่ค้าง · ใช้กับใบ migrate ที่ prose เก่าลอกราคา ณ วันวิเคราะห์ (ซึ่งกติกา B เทียบราคาวันนี้แล้วจับไม่ได้ — ตรงกับที่ healer E44 แปลงได้แค่ ~30%) · แก้ตอนแตะใบ (UPDATE/LIGHT) · `save` ของใบที่แตะแล้วยกระดับเป็น error ได้ (ตัดสินใน plan)
  - escape hatch: `{{lit:…}}` สำหรับกรณีจำเป็น (เช่นอ้างราคา IPO ในอดีต) — นับจำนวน + ต้องมีเหตุผลใน `meta.litReasons` · gate warn ถ้าเกิน 2 ต่อใบ · **ยังไม่ได้ implement ณ Plan 1** (`TOKEN_RE` ไม่รับ `lit:` · schema ไม่มี `meta.litReasons` — BBL G3) ⇒ ทำใน Plan 2a
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
| `init <SYM>` | สร้าง `.work/<SYM>.json` (ใบ NEW) · **อินพุตเดียว = sidecar `.queue/prep/<SYM>.json`** (§6.4) — **ห้าม regex ไฟล์ `.md`** (เป็น prompt ของ LLM ไม่ใช่ข้อมูล) · **ปฏิเสธ** ถ้ามี `reports/<SYM>.html` หรือ `reports/<SYM>.json` อยู่แล้ว (UPDATE ใช้ `export`) · เติมส่วน mechanical (~43% ของช่อง — วัดจาก ZTS-real 65/152) ให้: **top-level** (`v:3` · symbol · currency/region · `dateEra:"BE"`) · **meta** ส่วนใหญ่ (`analysisDate` = วันนี้ Asia/Bangkok ISO · `sources` ตั้งต้น · `priceNote` จาก CROSS-VERIFY · company · exchange) · **fundamentals** (eps TTM + `epsBasis` · dps · `shares` = [2b] หุ้นคงเหลือ ไม่ใช่ wAvgDil · revenue/netIncome/fcf · margins · roe · D/E · netDebt = หนี้ − เงินสด · `peAvg5y` = มัธยฐาน · `fy{}` คอลัมน์ FY ล่าสุด · `epsForward` เฉพาะเมื่อไม่ติดกับดัก FY [2c]) · **analyst** (target · n · rating · asOf) · **รายการการ์ดตั้งต้น** (เฉพาะการ์ดที่มีข้อมูลรองรับ) · **โครงฉาก** (years 3 · perYear `cagr` · driver/exitMetric · `divIncluded` = dps > 0) · **โครงขา `pe`** (`multipleSource:"median5y"` + `medianWindow` · `multiple` **ว่าง** — worker ตัดสิน · พิมพ์ช่วงมัธยฐานเป็น hint ของ `multipleRange`) · ช่องดุลพินิจ (sub/headerTags · ตัวคูณ/ขาอื่น · กรณีฉาก · prose · catalysts/risks · notes) = **sentinel `TODO`** ที่ gate ปฏิเสธ (E51 §9) · **ไม่เขียน `market` เด็ดขาด** (ไม่เข้า `.work/`) · **ไม่เขียน `meta.aiModel`** (worker รายงานตัวเองตามกติกา self-report — ไม่มีช่อง = schema error ตอน save) |
| `export <SYM>` | `reports/<SYM>.json` → `.work/<SYM>.json` (ตัด `market` + `_sig` ออก) สำหรับ UPDATE · เป็นคำสั่งที่ส่งใน 2b · flow คิว = Plan 4a (§6.3) |
| `save <SYM> [--light]` | ท่อเดียว ตามลำดับ: (1) อ่าน draft → **ปฏิเสธ** `market`/`_sig` ใน draft (OWNER — `S.OWNER(path)`) และ `meta.themeLegacy` ในใบ NEW (§3.5) → (2) **merge `market`**: ใบ NEW จาก sidecar (§6.4) · ใบที่ export จาก `reports/<SYM>.json` เดิม (ก่อน validate เพราะ schema บังคับ `market`) → (3) **`checkDoc(doc, {stage:'save'})`** — code path เดียวกับ gate (`test/check-v3.js`) · `stage:'save'` ตัด **`v2:E40` ตัวเดียวเท่านั้น** (tag ลงตอน ship — `tools/tag-apply.js`) และพิมพ์ log ว่าตัด · error เชิงความหมายรวมครบในครั้งเดียวผ่าน `semanticErrors()` (§9) → (4) `P.checkRuleB(doc, view)` (กติกา B — gate รายวันไม่รัน · R5) → (5) **พิมพ์ error ทุกข้อพร้อม JSON path ในครั้งเดียว** (ไม่ all-or-nothing แบบ BUG-005 · #52) → (6) ผ่านหมด = `IO.write` (validate → sign → lock → เขียน atomic) · `--light` = **allowlist ตาม path**: ช่อง `P.proseFields` ทั้งหมด + `meta.analysisDate` `meta.aiModel` `meta.sources` `meta.priceNote` + `analyst.*` + `fundamentals.dps` (refresh snapshot vendor — ตรงกับ UPDATE-LIGHT ของ v2 ที่รีเฟรชเป้า analyst/ปันผลผ่าน `snapshotDiff`) · บังคับด้วย `diffPaths(draft, ใบปัจจุบัน)` ที่ **ไม่นับ** `market`/`_sig` · path นอก allowlist = error "ใช้ save เต็ม (UPDATE)" |
| `show <SYM> [path]` | พิมพ์ view ที่ compute แล้ว (`compute().<path>`) — ให้ worker ดูตัวเลข/token ที่ใช้ได้โดยไม่อ่านทั้งไฟล์ (token-lean) |
| `diff <SYM>` | draft vs ใบปัจจุบัน (เชิงความหมาย: FV/MOS/ขาเปลี่ยนเท่าไร) → controller ใช้ตรวจก่อน ship · ใช้ `diffPaths` ตัวเดียวกับ `--light` |

### 6.2 การป้องกันการเขียนสด (2 ชั้น)

1. **PreToolUse hook** — script `.claude/hooks/guard-reports.js` (node · exit 0 เสมอ · ปฏิเสธผ่าน JSON `permissionDecision:"deny"` พร้อมเหตุผล "แก้ `.work/<SYM>.json` แล้ว `node tools/report.js save <SYM>` (ใบ v2: `node tools/apply-edits.js`)"):
   - **Write/Edit/MultiEdit/NotebookEdit** ที่ path (resolve จาก cwd) อยู่ใต้ `reports/` → deny **ทุกไฟล์ `reports/*`** (ไม่ใช่แค่ `.json` — ถ้าเปิด `.html` ไว้ worker จะถอยไปเขียน HTML ได้ · ใบ v2 UPDATE ยังเดินผ่าน `apply-edits` ซึ่งเป็น node child process)
   - **Bash** (ตรวจเฉพาะคำสั่งที่มี `reports/`): deny redirect `>`/`>>` เข้า `reports/` · `sed -i`/`perl -i` บนไฟล์ใน `reports/` · `tee` เข้า `reports/` · `cp`/`mv`/`install`/`rsync`/`ln` ที่ปลายทางอยู่ใต้ `reports/` · ต้อง**ผ่าน**: `git mv` · `rm` · `git add`/`git checkout -- reports/…` · `grep … reports/X.html | head` · `node tools/report.js save X > /tmp/log 2>&1` · `apply-edits … <<'EOF'`
   - **fail-open**: hook error/อินพุต parse ไม่ได้ = ปล่อยผ่าน (ไม่บล็อกงานทั้ง session เพราะบั๊กของ hook) — ชั้น 2 เป็นตัวบังคับจริง
   - ติดตั้ง: script อยู่ใน repo · **เจ้าของ paste settings snippet เอง** ลง `.claude/settings.json` (classifier อาจบล็อก Claude แก้ settings ของตัวเอง/สร้าง `.claude/`) · matcher `Write|Edit|MultiEdit|NotebookEdit` และ `Bash` ชี้ `node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js"` (คง `env` เดิม)
   - พิสูจน์ใน **`claude -p` process ใหม่** (settings/CLAUDE.md โหลดตอนเริ่ม session) · ต้องพิสูจน์ด้วยว่า **deny ชนะ** hook Bash ระดับ user (`rtk-rewrite.sh` ที่ allow + `updatedInput`) · unit test `test/v3/hook.test.js`
2. **ลายเซ็น `_sig`** = sha256(canonical JSON ไม่รวม `_sig`) — เขียนโดย `io.write` เท่านั้น · gate E-code ใหม่ `E50 sig mismatch` ⇒ แก้มือทางไหนก็ตาม (Bash หลุด hook, editor, child process ที่ hook มองไม่เห็นโดยออกแบบ) ถูกจับตอน verify/pre-push · **`_sig`/E50 = ตัวบังคับจริง** hook เป็นแค่ชั้นเตือนเร็ว · ไม่ใช่ความปลอดภัยเชิง crypto — เป็นเครื่องบอกว่า "ไม่ได้ผ่าน io.js"

### 6.3 งานแต่ละโหมด

- **NEW**: `queue prep` (เขียน `.md` + sidecar `.json` §6.4) → `report.js init` → worker เขียน `.work/<SYM>.json` (legs, cards, scenarios, prose, catalysts/risks, `meta.aiModel`) → `pick-brand` (seed ลง `tools/seeds.json` เท่านั้น — ไม่ใส่ theme ใน draft) → `report.js save` วนจนผ่าน → `npm test -- <SYM>` (ส่งต่อให้ `check-v3` เอง §6.5) → คืน `TAGS:` ให้ controller
- **UPDATE**: `report.js export` → แก้ draft → `save` · `update-prices --write --force <SYM>` บนใบ v3 = **เขียน `market.*` จริง** ตั้งแต่ Plan 3 (§7 R8 — ใน P4 เคย exit ≠0 ตาม §6.5/#62) · **flow คิวของ v3 UPDATE = Plan 4a**: `prep <SYM>` รับ symbol v3 (**ไม่สร้าง sidecar** — ข้อมูลตลาดมาจาก `.json` เดิม · ไม่งั้น #64 บล็อกหุ้นไทยที่ SA ไม่ครอบคลุม · `th`/วันงบจาก `RS.metaLite` · บริบทจาก `RS.renderedHtml`) → worker `report.js export` → แก้ `.work/<SYM>.json` → `save [--light]` → `postcheck` → `ship` (diff = `.json` ใบเดียว) · preflight นับใบ v3 ในคิวอายุ/dedup (ถอด `!e.v3`) · **UPDATE-LIGHT ของใบ v3** = cron เป็นเจ้าของราคาแล้ว (E27/W09 อยู่บน `priceDate` จึงไม่ยิง) ⇒ LIGHT = ตรวจซ้ำ + ประทับ `meta.analysisDate` ใหม่ + prose verdict — allowlist `--light` เดิมครอบแล้ว (`proseFields` รวม `text.*` · `LIGHT_EXACT` มี analysisDate/aiModel) — ตรึงด้วยเทส report-cli (Plan 4a ไม่แก้โค้ด · ร่างเดิมของข้อนี้ที่ว่า "ต้องเพิ่ม `text.*` ใน 4a" = อ่าน allowlist ผิด) · ก่อน 4a `prep` ปฏิเสธด้วย "v3 UPDATE = P6 …"
- **UPDATE-LIGHT**: `export` → แก้ช่องใน allowlist ของ `--light` (§6.1) → `save --light` (ไม่มี E44 fix-on-touch อีก — ไม่มี literal ให้แก้)
- `apply-edits.js` `@@` blocks → **เลิกใช้กับใบ v3** (ปฏิเสธ `.json` ชี้ไป `report.js save` · ยังใช้ได้กับใบ v2 ระหว่าง transition)

### 6.4 prep sidecar `.queue/prep/<SYM>.json` (Plan 2b · ใหม่)

- `npm run queue -- prep <SYM>` (โหมด NEW — ผู้เขียน sidecar ตัวเดียว · R2 · `tools/prep-stock.js` คงสัญญาข้อความเดิม) เขียน sidecar คู่กับ `.md` เดิม — ข้อมูลเครื่องอ่าน (ไม่ใช่ prompt):

```jsonc
{
  "market": { "px": 70.12, "priceDate": "2026-09-23",        // ISO (ไม่ใช่วันที่ไทยในบรรทัด FACTS)
              "chart": { "data": [["ต.ค. 68", 150.2], "..."] }, // ตัด min/max/grid — compute คิดเอง
              "chgSuffix": "รอบปี",
              "range52w": { "lo": 64.1, "hi": 172.3 } },      // 52wk ของ vendor (ไม่ใช่ปิดรายเดือน)
  "vendor": { "epsTTM": 6.13, "target": 95.0, "analysts": 14, "lo52": 64.1, "hi52": 172.3, "divYieldPct": 3.0, "fyYears": ["FY2025", "..."] },
  "ttm": { "...": "..." }, "fy": { "...": "..." },            // งบ (revenue/NI/fcf/eps/dps/shares/margins/…) จาก fetch-fundamentals --json
  "sharesOut": 4.3e8,                                          // [2b] หุ้นคงเหลือ ไม่ใช่ wAvgDil — fetch-fundamentals --json
  "medians": { "...": "..." },                                 // MM.oneSymbol แบบ structured (รวมหน้าต่างมัธยฐาน)
  "company": "Zoetis Inc.", "exchange": "NYSE"
}
```

- ที่มา (สอดคล้อง plan 2b ruling R1 · advisor 24 ก.ย. 69) — แยกตามชนิดข้อมูล ไม่ประกอบจาก text ของ `.md`:
  - **`market`** (px · priceDate · chart · chgSuffix · range52w) + `company`/`exchange` ← `fetch-facts --json` (ราคา/กราฟ **เท่านั้น** — `fetch-facts` ไม่มีข้อมูลงบ) · `range52w`: 52wk ของ vendor (`parseVendor`) ก่อนถ้ามี ไม่มีค่อยใช้ Yahoo meta จาก `fetch-facts --json` (M7 — ไม่ใช่ปิดรายเดือน)
  - **งบ** (`ttm` · `fy` · `sharesOut` · `dps` · `epsForward` · `rating` — revenue/NI/fcf/eps/dps/shares/margins/…) ← `fetch-fundamentals --json` ตัวใหม่ (`snapshotJson()` บริสุทธิ์)
  - **`vendor`** ← `parseVendor` (`tools/queue/prep.js`) · **`medians`** ← `MM.oneSymbol` (`tools/median-multiples.js`)
- `market` ใน sidecar ใช้ **ตอน `save` ของใบ NEW เท่านั้น** (merge ก่อน validate) · ไม่เข้า `.work/` · หลัง publish ราคาเป็นของ cron (P5)
- `prep` **รับใบ v3 ตั้งแต่ Plan 4a** (UPDATE/UPDATE-LIGHT — ไม่ทำเหมือนเป็น NEW · **ไม่สร้าง sidecar** · ข้อมูลตลาดมาจาก `.json` เดิม · §6.3) · ประวัติ: ก่อน Plan 4a `prep` ปฏิเสธ symbol v3 ด้วย "v3 UPDATE = P6 …" (ก่อน Plan 3 ข้อความคือ "v3 UPDATE = Plan 3")
- ไม่ regenerate prep ทั้ง 909 ไฟล์ (ทั้งหมดเป็น UPDATE ของ v2) — สร้าง NEW prep ใหม่เฉพาะหุ้นที่จะทำ

### 6.5 `tools/report-source.js` — "ไฟล์ไหนคือรายงาน" จุดเดียว (Plan 2b · ใหม่)

- API: `list(dir)` (ครอบ `build.reportEntries` รวมการตรวจ "ห้ามมีทั้งสองไฟล์ของหุ้นเดียว") · `metaLite(sym)` → `{ currency, px, analysisDate, aiModel }` (v2 จาก stock-meta/footer · v3 จาก JSON) · `renderedHtml(sym)` (v3 = `loadReportSource` + `expandReport`)
- **scanner ทุกตัวใน open-item #49** (16 ไฟล์ + `.gitignore` เพิ่ม `.work/`) อ่านผ่าน helper นี้ — ตรรกะ "ไฟล์ไหนคือรายงาน" ที่เคยก๊อปซ้ำ ~20 จุดเหลือที่เดียว · แต่ละแบตช์ของการแปลงจบด้วย dist diff = 0
- กติกาเฉพาะตัว:
  - `ship --prepatch` **fail closed**: path ใดใต้ `reports/` ที่ไม่ตรง regex `.html` = blocker (+ test) — วันนี้ `continue` ข้ามไป ⇒ `reports/X.json` ที่ยังไม่รีวิวจะถูกกวาดเข้า commit "price: pre-patch" โดยไม่ผ่าน postcheck
  - `update-prices` **exit ≠0 บน symbol v3** ("v3 cron = Plan 3") จนถึง P5 (#62 — ห้าม no-op exit 0 เงียบ · ถอดแล้วใน Plan 3: สาย v3 เขียน `market.*` จริง §7) · `reportExists` รวม `.json` (ไม่งั้น commitFlags/canary ลบ flag ของใบ v3)
  - `preserve-dates` **ข้ามใบ v3** (ไม่มี `<footer>` · `freshHash` v3 ไม่รวม market/_sig/aiModel อยู่แล้ว §8)
  - `npm test -- <SYM>` (check-reports CLI) **ส่ง symbol v3 ต่อให้ `check-v3`** แล้วรวม exit code — วันนี้ขึ้น "ไม่พบไฟล์รายงานให้ตรวจ" exit 1 ซึ่งเป็นตัวกระตุ้นอันดับ 1 ให้ worker ถอยไปเขียน HTML
  - `apply-edits` **ปฏิเสธ `.json`** (ชี้ไป `report.js save`)
  - migrator/theme writer ที่ล้าสมัย (#49 กลุ่ม A3: `migrate.js` `migrate-annual-chg.js` `migrate-v2.js` `brandtheme.js --write` `fix-contrast.js` `field-manifest.js` `v3/card-census.js`) **คง `.html` อย่างเดียว** จนลบที่ P7
  - ที่เลื่อนไป P5: writer ราคาของ v3 ใน `update-prices` · `update-prices.yml` นับ `.json` · `verify:cron` รวม `check-v3` (#61) · pre-patch ของ `preflight` (2b ข้ามแถว v3 พร้อมข้อความ)

### 6.6 การใช้จริงครั้งแรก — Plan 2c (P4b · แยก 2 PR · เพิ่ม 24 ก.ย. 69 หลัง Task 0 ของ 2c)

**แยกเป็น 2 PR** (advisor 24 ก.ย. 69): **2c-i** = เอกสาร worker + โค้ดเล็ก + ถอด tripwire — **ไม่มีผลกับ production** (dist byte-identical · ยังไม่มี `reports/*.json`) → merge ก่อน · **2c-ii** = NEW 2 ใบจริง (US `OGE` · TH `M-CHAI`) — production change แรกของ v3 ⇒ diff ที่ advisor ตรวจก่อน merge = รายงาน 2 ใบ ไม่ใช่เอกสาร 5k บรรทัด · เจ้าของ paste hook snippet **หลัง 2c-i merge** (paste ก่อน = บล็อก NEW v2 ทุก session บนเครื่องโดยยังไม่มีทาง v3 ในเอกสาร — ขัด R13)

**ตัวพาคำสั่ง v3 ให้ worker = `stock-analyzer/SKILL.md` หมวด STEP 5V** (worker Read ตาม path ใน worktree ตอนรัน = สด · agent-prompt.md:20) · CLAUDE.md ที่ inject เป็น snapshot ตอนเริ่ม session ⇒ prompt ที่ spawn ต้องบอกตรง ๆ ว่า "§2 ที่ถูก inject มาก่อน v3 · STEP 5V เป็นกติกาที่ใช้" · prep `.md` ประกอบตอน `prep` ⇒ **รัน prep ใหม่หลังเอกสาร merge** ก่อน spawn ทุกใบ (`--model opus` — worker ใบ exit pin Opus)

**เกณฑ์ที่ 2c-i ต้องส่งมอบ (ถอดจาก findings Task 0):**
- SKILL STEP 5V = ขั้นตอน `report.js init → เติม .work/<SYM>.json → pick-brand → show → save` · **`save ✓` คือ gate ของ worker** — worker **ไม่รัน** `npm test -- SYM` ในโหมด v3 NEW (มันรัน `checkDoc` ตัวเดียวกับ `save` แต่ปล่อย `v2:E40` ⇒ แดงเสมอจน controller `tag-apply`) · ข้อ M1 ของ §13/14 ("บรรทัดสำคัญที่สุด = handoff `npm test` → `check-v3`") จึงกลายเป็นงานของ controller หลัง tag ไม่ใช่ของ worker
- กฎที่ต้องเขียนเป็นข้อบังคับใน 5V: `family` บนทุกขา `role:'fv'` (ไม่เขียน = ถ่วงเท่ากันเงียบ · compute.js:49–57) · ขาที่ init ทิ้ง `method: TODO` มี `inputs: {}` — ต้องเติมครบชุดตาม `S.LEG_INPUTS` ของ method ที่เลือก หน่วย % (จุดที่ e2e ของ 2b ล้มครั้งแรก) · ตัวเลขผูกราคาทุกตัวเป็น token (`report.js show` ให้ตาราง — กติกา B จับแค่ทศนิยมตรงเป๊ะ) · ห้ามเขียน `market`/`_sig`/`meta.themeLegacy`/`{{rd:` · `meta.aiModel` ประทับเอง · TH: ยืนยันกระดานที่ set.or.th — mai → `meta.exchange: "MAI"` (Yahoo ให้ code `SET` ทั้งสองกระดาน draft จึงไม่มี TODO) · symbol นอก `SYM_RE` = init ปฏิเสธ (exit 2)
- ล้างข้อความ v2 ที่จะไปโผล่ใน prompt/stdout ของ worker: `prep` extraBlock NEW ไม่พิมพ์ hint `update-prices --write --force` (บน v3 exit ≠0) + พิมพ์บรรทัดชี้ 5V เมื่อเขียน sidecar แล้ว · `fetch-facts` stdout "chart (วางใน report-data…)" · `pick-brand` stdout "copy theme/GDOTS" · ข้อความ `themeOf` "หรือ themeLegacy" (save ปฏิเสธบน NEW)
- `ship <SYM> --no-push` = commit เหมือนเดิม (ข้อความ `analyze: add SYM — NEW (MOS …)` ที่ใช้มาทุกใบ · ช่องว่างกับถ้อยคำ §5 บันทึกใน decisions ไม่แก้ทั้งคู่) แต่ **ไม่ rebase ไม่ push** — flow ของ 2c-ii คือ branch → PR → advisor · `ship` ธรรมดาจาก feature branch = push ทั้ง branch เข้า main (อันตราย บันทึกไว้)
- ลำดับ commit: เอกสาร → โค้ด → **ถอด tripwire = commit โครงสร้างสุดท้าย** (ต้องมาก่อน commit รายงานเพราะ `ship` รัน `npm run verify` เต็มซึ่งมี v3-test) · อ้างอิง tripwire ใน open-items #49 ปิด · plan 2a/2b คงไว้ (ประวัติ)

**เกณฑ์ที่ 2c-ii ต้องส่งมอบ:** worker 1 ใบ/spawn ทีละใบ (Opus · effort high) → controller: `tag-apply` → `postcheck` → ตรวจชั้น 0 เอง (FY window/points ของ medians เพราะ `checkFyYears` เงียบบน v3 · W32 · `family` ครบ · `legs[1].inputs` · `meta.aiModel` ตรงรุ่นที่ spawn · dispersion 0.4c >2x) → advisor ก่อน publish → `ship --no-push` · บันทึกจำนวน turn ต่อ worker (§12 P4b) · **ซ้อมทั้งเว็บใน scratch worktree ก่อนเปิด PR**: `npm run verify` เต็ม + `check-site` + ลำดับ cron ของ `update-prices.yml` (คาด `v3-skipped: 2` · preserve-dates "ข้าม 2 ใบ v3" · ไม่มี diff บน `.json`) + dead-ticker dry-run + เปิด `dist/OGE.html` เทียบใบ v2 · ให้ cron รอบ 25 ก.ย. 04:00 ลงก่อน merge **2c-ii** (ตัวแปรทีละตัว — 2c-i ไม่แตะเส้น `verify:cron` และพิสูจน์ dist byte-identical จึง merge ได้ทันที) · หลัง deploy เปิด 2 หน้าจริงข้างใบ v2 ให้เจ้าของดูดีไซน์
- **เส้นตาย P5 (แทนที่ "#62 = merge 2c + 45 วัน")**: วัดจาก gate จริง (check-v3 บน ZTS-real ด้วย `--today`): **W09 เตือนที่ priceDate + 46 วัน · E27 ล้ม `npm run verify` ทั้ง repo ที่ priceDate + 121 วัน** ⇒ **แข็ง = `market.priceDate` ของใบ exit + 120 วัน · เป้า = + 45 วัน** — priceDate = วันที่ prep รอบสุดท้ายก่อน spawn (US หลัง 04:00 ไทย · TH หลัง 16:30 ไทย — ไม่มี intraday guard ในเส้น sidecar)
- OGE: forward P/E 18.4x (FY2026e 2.43) เทียบมัธยฐาน 17.2x ห่าง 6.6% ⇒ W25 อาจยิงโดยบังเอิญ (warn — ไม่ใช่สมอตาย worker คงขามัธยฐานและเขียนกำกับ) · vendor forward 2.60 = FY2027e (sidecar ติดธง [2c] แล้ว)

## 7. Cron (`tools/update-prices.js` สาย v3) — **Plan 3 (P5)**

> คำตัดสินผูกพัน R1–R12 ของ controller (24 ก.ย. 69 · advisor bounds): `.superpowers/sdd/v3-plan3-task0/rulings.md` · หลักฐาน file:line: `findings-cron.md` โฟลเดอร์เดียวกัน · แผน: `docs/superpowers/plans/2026-09-24-report-v3-plan3-cron-v3.md` · ร่างเดิมของหัวข้อนี้ (`io.write({by:'cron'})` · "เขียนแล้ว revert") ถูกแทนด้วยข้อข้างล่าง

- **ลูปเดียว สองสาย (R7 · R10)**: `main()` วน `RS.list(REPORTS)` (v2 + v3 — ปิด residue ของ #49 ที่ `readdirSync(...).filter(/\.html$/)`) · fetch/retry/sleep 450 ms/ตัวนับ abort 11 ตัวติด/intraday guard/ข้าม `not-on-exchange`/quote ของ canary เป็นโค้ดเดียวกันทั้งสองสาย (`preSkip` · `chartFor` ที่แยกออกมาเป็นฟังก์ชัน) · แยกทางหลังได้ quote: v2 = `patchReport` เดิมทุก byte · v3 = `planV3(prevDoc, q, chart, {force, seeds, today, nowSec})` (บริสุทธิ์ · คืน `unchanged|freeze|write`) → `applyV3(file, plan, {write, seeds, today, force})` · ทั้งสองตัว export ให้เทสเรียกตรง (extract ไม่ inject — `main()` ไม่มี hook ให้เทส)
- **ตัวสร้าง `market` ตัวเดียว (R3)**: `tools/v3/market.js` `marketFromQuote(prev, q, chartData, {priceOnly})` (บริสุทธิ์): `px` = round2 · `priceDate` = ISO ของ `marketTime + gmtoffset` (วันของตลาด — สูตรเดียวกับ cron v2) · `chart.data` = ผลของ `buildChartData` (รายเดือน ≤13 จุด จุดท้าย = ราคา → ไม่พอจุด = รายสัปดาห์) · ไม่มีกราฟใหม่/`priceOnly` = `priceOnlyChart` บนกราฟเดิม (ย้ายมาจาก `update-prices.js` — `patchReport` ของ v2 เรียกตัวเดียวกัน) · **`range52w` = Yahoo `fiftyTwoWeekLow/High` เมื่อ lo > 0 และ hi ≥ lo ไม่งั้นคงค่าเดิม** (การ์ด/โทเคน `range52w` throw เมื่อไม่มี — ปล่อยหาย = E51 = `patch-rejected` ทุกวัน) · **`chgSuffix` / `gridFmt` / `dataFmt` คงค่าเดิม** (พฤติกรรม v2 · `chgSuffix` คำนวณจากช่วงของ bars เฉพาะตอน `prev = null`) · ลำดับคีย์ = ของ sidecar (diff ไม่สลับบรรทัด) · ทาง prep ใช้ตัวเดียวกัน: `fetch-facts --json` (`factsJson`) = `marketFromQuote(null, …)` แล้ว sidecar ทับ **`range52w` ด้วย vendor 52wk เมื่อมี = override เดียวที่ประกาศไว้ (M7)** · กติกา "กรอบใช้ได้" เป็นฟังก์ชันเดียว `validRange` · เทสยืนยันว่า quote เดียวกันให้ `market` เดียวกันทั้ง prep และ cron
- **freeze จาก view (R4)**: `decide({oldPrice: market.px, newPrice: q.price, fv: compute(prev).rd.fv, currencyOk: currencyMatches(q.currency, doc.currency), force})` — FV ของ v3 ไม่ขึ้นกับราคา (ตัวคูณ `'current'` อยู่ได้เฉพาะขา context น้ำหนัก 0) ⇒ ได้คำตอบเดียวกับ v2 ทุกเกณฑ์ (ต่าง >15% · >25% สงสัย split · MOS พลิกเกิน dead-band ±5 จุด · currency) + `bad-chart` จาก `detectMixedBasis` บนซีรีส์ที่ใช้จริง (`--force` = price-only) · reuse: `fetchChart` `toYahooSymbol` `isIntradayQuote` `buildChartData` `detectMixedBasis` `decide` `currencyMatches` `mergeFlags`/`commitFlags` `commitBody` canary quote ค้าง · **ไม่มี** `patchDerived` / `derivedPassV2` / `keepMap` / `summaryPlan` / `scenarioPlan` / `yieldPlan` / `proseTokensIfNew` / `mirrorStockMetaV2` บนใบ v3 — ทุกค่าที่เคย patch ถูก compute ตอน build
- **ไม่มี session ใหม่ = ไม่เขียน ไม่ flag ไม่ error (R5)** — ตรวจหลังลายเซ็น (E50) + gate ใบเดิม: (ก) วันตลาดของ quote **ก่อน** `market.priceDate` (feed ค้าง/ถอยหลัง) → "ไม่เปลี่ยน" **ไม่ว่าราคาจะต่างแค่ไหน** · ตรวจ **ก่อน** `decide()` ⇒ ไม่ยก flag drift/flip/currency · และ**ไม่ล้าง flag ที่ค้าง**: `planV3` คืน `unchanged` พร้อม `stale: true` แล้ว `main()` ตัดใบนั้นออกจาก `evaluated` แบบเดียวกับตัวที่ข้ามเพราะตลาดเปิด (`flaggedAt` เดิมคงอยู่) · (ข) วันเดียวกับ `priceDate` + `round2(price)` = `market.px` → "ไม่เปลี่ยน" (ตรวจหลัง `decide()` · ยังนับเป็น evaluated ⇒ flag เคลียร์ตามปกติ) · เคสจริง = ICC (หุ้นไทยสภาพคล่องต่ำ — `regularMarketTime` ค้างที่วันซื้อขายล่าสุด) · (ค) วันเดียวกันแต่ราคาต่าง → เขียน · ทั้งสองแบบนับในยอด "ไม่เปลี่ยน" · `priceDate` ไม่ถอยหลังเด็ดขาด
- **gate ก่อนเขียน = quarantine เดิม (R6)**: `checkDoc(ใบใหม่พร้อม _sig ใหม่, {seeds, today})` ในหน่วยความจำ **ก่อน** เขียน · error = ไม่เขียน + flag `patch-rejected` (detail บอก "ค้างก่อน patch" เมื่อ code ชุดเดียวกันยิงบนใบเดิม · "patch ทำให้ตก" เมื่อไม่ใช่) ⇒ ไม่มีอะไรให้ revert บนดิสก์ · warning (W18/W25 ที่พลิกตามราคา · `v2:W23`) ไม่กัน · **`--force` เขียนต่อพร้อมคำเตือนได้เฉพาะเมื่อ error ไม่มี E50/E51 — สคีมา/ลายเซ็นไม่มีวัน force** · ใบเดิมลายเซ็นไม่ตรง (แก้มือ) = `patch-rejected` E50 เสมอ (cron ไม่เซ็นทับงานแก้มือ)
- **ผู้เขียน = `IO.writeMarket(file, market, {seeds, today, force})` ใน `tools/v3/io.js` (R1)**: ภายใต้ lock เดียว อ่านไฟล์ → `verifySig` ของไฟล์บนดิสก์ (ไม่ผ่าน = E50 ปฏิเสธ) → แทน `market` อย่างเดียว → `checkDoc` (require `test/check-v3.js` แบบ lazy — `check-v3 → check-reports → update-prices` เป็น cycle ตอนโหลด) → `sign` → เขียน atomic · ปิด race อ่าน-แก้-เขียนในเครื่อง · **ไม่มีฟิลด์ provenance ในสคีมา ไม่มี `{by}` บน `io.write`** (E50 คือตัวบังคับ — ฟิลด์ใหม่จะ churn `_sig` + fixture โดยไม่ได้บังคับอะไรเพิ่ม) · cron เป็นผู้เรียกคนเดียว · `report.js save` คงทางของตัวเอง (`S.OWNER`) · ผล: ทุกช่องนอก `market` deep-equal · `freshHash` เท่าเดิม ⇒ `updated` ไม่ขยับ (§8) · `planV3` gate ในหน่วยความจำ (dry-run เห็นผลเดียวกัน) แล้ว `writeMarket` gate ซ้ำใต้ lock (ไฟล์เปลี่ยนระหว่างรอบ = `patch-rejected` ไม่ throw)
- **ล้มแบบ plumbing ≠ gate ตก**: throw ที่มี `.codes` (gate ใต้ lock ของ `writeMarket` — รวม E50 ไฟล์ถูกแก้ระหว่างรอบ) = `patch-rejected` · throw ที่**ไม่มี** `.codes` (`checkDoc` throw · ไฟล์หาย ENOENT · JSON parse · รอ lock เกิน · `marketFromQuote`/compute throw ใน `planV3` หรือ catch ชั้นนอกใน `main()`) = `patch-failed` (bucket PLUMBING เดิมของ v2 — คิว triage ไม่ส่งงาน plumbing ให้ agent re-analysis) · นับในถัง "ล้ม" ของบรรทัด `v3-lane` ไม่ใช่ "freeze"
- **flags/บันทึก (R7)**: `evaluated` · `aliveAsserted` รวมใบ v3 (ไม่งั้น flag เก่าของใบ v3 ไม่มีวันเคลียร์) · `reportExists` = `RS.symbols` (Plan 2b) · commit body + บรรทัดสรุปนับทั้งสองสาย + บรรทัด `v3-lane: N ใบ · …` (token grep ได้ใน log ของ Actions) · `update-prices.yml` นับ `reports/*.json` ในชื่อ commit + คอมเมนต์หัวไฟล์ · `v3Guard` / `v3Refusal` / `v3SweepNotice` ถูกถอด พร้อมเทสที่ตรึงพฤติกรรม P4 (`scanners-cron.test.js` · `update-prices-test.js:30` · `queue-test.js:1570`) และ stock-controller `SKILL.md` §9 ใน PR เดียวกัน · อ่านใบ v3 ไม่ได้ = `failed` เหตุผล `no-stock-meta` (bucket PLUMBING เดิม — ไม่เพิ่ม reason ใหม่) · **ไฟล์ที่ parse ได้แต่ไม่มี `market.px` / `market.priceDate` / `currency`** = แถวเดียวกันรายใบ (`readV3Doc` · ถัง "ล้ม") ไม่ throw ออกจากลูปจนทั้งรอบ exit 1
- **คำสั่งมือ (R7 · R8)**: `--write --force <v3 SYM>` = **เขียนจริง** (pre-patch มือของแถว `mos-sign-flip` ใบ v3) · `--heal-derived <v3>` = exit 1 พร้อมเหตุผล (ใบ v3 ไม่มีค่า derive ค้างให้ซ่อม — ห้าม exit 0 เงียบ) · sweep `--heal-derived` ข้ามใบ v3 พร้อมบรรทัดนับ · **pre-patch อัตโนมัติของแถว v3** (`preflight` `patchTargets.skippedV3` · `parseGateFailures` ที่จับแต่ `.html` · ทาง revert · `ship --prepatch` ที่ปฏิเสธ `.json`) **= P6 → Plan 4b** — P5 ให้ preflight/triage ไม่ล้มบนแถว v3 และพิมพ์หนึ่งบรรทัดต่อใบ (ประวัติ: ข้อความเดียวของ P5 ลงท้าย "(P6 queue flow)") · **ตั้งแต่ Plan 4a `v3Lines` แยกตาม bucket**: `mos-sign-flip` (PREPATCH) → หลัง `ship --prepatch`: pre-patch มือ `--write --force <SYM>` (ตลาดปิดแล้วเท่านั้น) → `npm test -- <SYM>` → controller commit `price: pre-patch <SYM> (v3 flip)` เอง + push ตาม CLAUDE.md §5 (ไม่ผ่าน `ship` — `postcheck` ต้องการ analysisDate = วันนี้ · final review I-1) · LIGHT/FULL ที่ไม่ skip → หลัง `ship --prepatch`: pre-patch มือถ้าราคายังไม่สด แล้ว `prep <SYM>` (worker STEP 5U) · แถวอื่น (skip/DELIST/PLUMBING/REJECTED/UNKNOWN) ไม่มีบรรทัด
- **gate ของ cron (R9 · ปิด #61)**: `verify:cron` = `check-reports → check-v3 → build → build-test → engine-exec → check-site` (วัด: `check-v3` ≈ 0.15 วิ · ทั้งสาย `verify:cron` ≈ 8 วิ) · `node tools/gen-docs.js` สร้างเลขขั้น/ลำดับใน CLAUDE.md §8 + `docs/price-refresh.md` ใหม่ (`docs-test --check` บังคับ)
- **ความเสี่ยงที่ยอมรับ (R2)**: `_sig` อยู่บรรทัดท้ายไฟล์ ⇒ `save` ของคนบน main วันเดียวกับ cron = conflict ตอน `pull --rebase` (คลาสเดียวกับแก้ใบ v2 วันเดียวกัน) · yml retry 3 รอบเหมือนเดิม · กติกา: **ใบ v3 ที่ save วันเดียวกับ cron → ship ก่อน 04:00** (`docs/price-refresh.md`) · ทบทวนที่ Plan 4a (คงกฎ) / 4c เมื่อ save เป็นงานรายวัน
- **ต้นทุน**: `checkDoc` ต่อใบ v3 ในลูป (ใบเดิม + ใบใหม่ + ซ้ำใต้ lock) + `check-v3` ใน `verify:cron` ≈ งาน gate v3 สี่เท่าต่อใบ (~0.05 วิ/ครั้ง · 2 ใบวันนี้) — ทบทวนที่ P7 เมื่อคลังเป็น v3 ทั้ง 909 ใบ

## 8. ความสด / `updated` (ห้ามพัง index ordering + dedup 7 วัน + staleness)

- `freshHash(v3)` = hash ของ canonical JSON **ไม่รวม** `market`, `_sig`, `meta.aiModel` ⇒ cron เขียนราคาทุกวันแต่ `updated` ไม่ขยับ (ตรงพฤติกรรมเดิมที่ `preserve-dates` ต้องคอยซ่อม)
- dedup 7 วัน/staleness 45/120 อ่าน `meta.analysisDate` ตรง (ไม่ต้อง parse footer "ข้อมูล ณ" อีก — W24 หายโดยโครงสร้าง)
- migration — **invariant (Plan 4 Task 0 Q7 · 25 ก.ย. 69)**: ใบที่ migrate แล้วต้องคง `updated` เดิมของ v2 และวันที่ footer ผ่าน (1) build ของ commit migration (2) build รอบถัดไปที่ไม่มีอะไรเปลี่ยน (3) `ship keepDates`/preserve-dates · `reports.json.file` คง `<SYM>.html` (P2 · `build.js:651`) · **วัดแล้วว่าที่มีอยู่ไม่พอ**: hash v2≠v3 โดยโครงสร้าง (`build.js:87` vs `tools/v3/io.js:26–30`) ⇒ `build.js:698` ประทับ now ทุกใบที่ migrate · `preserve-dates.js:68–70` ข้าม v3 ทุกใบ · การให้ migrator เขียน reports.json เองไม่พอเพราะ build คำนวณ hash ใหม่จาก reports.json ที่ commit และ `ship keepDates` (`ship.js:74,242`) เรียก preserve-dates · **กลไก = 4b เลือก** ระหว่าง preserve-dates โหมด migration (คืน `updated` ของ HEAD เมื่อ worktree เป็น v3 + HEAD มี `.html` + `meta.analysisDate` = footer HEAD — ต้นแบบ `proto/preserve-dates-migration.js`) กับฟิลด์ `meta.migratedFrom {updated, v2Hash}` ที่ `build.js` เคารพ (ทนกว่า: ไม่พึ่ง HEAD ยังมี `.html` ตอน build — scratch/split commit) · **gate = ซ้อม build 2 รอบ + keepDates** ไม่ว่าเลือกทางไหน

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
| ใหม่ | `E50 sig` · `E51 schema` (+ `{{rd:` · sentinel `TODO` — Plan 2b) · `E52 declared-leg ไม่มีหลักฐาน / ยอดรวม × fx ≠ ค่าขา ±1% (§3.6 M)` · `W30 lit` เกิน · `W31 prose-lit` ค้าง | ใหม่ |

- **E51 ขยาย (Plan 2b — กติกาของ gate ไม่ใช่เฉพาะ save · มีเคส self-test ใน check-v3)**:
  - `{{rd:…}}` ใน prose/ช่องข้อความใดของใบ v3 = **error** (ไวยากรณ์ v2 — §3 หมายเหตุ token) · **ก่อนเพิ่มกติกา**: grep `test/fixtures/v3/*.json` หา `{{rd:` — เจอ = บั๊กของ fixture ต้องแก้ผ่าน `IO.write` (ไม่แก้มือ · วัด 24 ก.ย. 69 ที่ `34652b57e`: 0 จุดใน 6 fixture — วัดซ้ำตอนลงมือ)
  - sentinel `TODO` / placeholder ค้าง (ที่ `init` วางไว้ §6.1 · `schema.str()` วันนี้รับ `"TODO"` และ E13 ของ v2 ไม่จับ) = **error**
- **`checkDoc` รวม error ครบในครั้งเดียว (#52 อยู่ที่ gate ไม่ใช่ save)**: เพิ่ม `C.semanticErrors(doc)` ที่เก็บจุด throw ของ `compute()` ทุกจุด **ก่อน** เรียก compute — ฐาน driver ของฉากไม่มี/≤0 · ไม่มี seed และไม่มี `themeLegacy` · `extrasRef` ชี้ extras ที่ไม่มี · `multipleSource:'current'` ไม่มีตัวตั้ง > 0 · `legValue` คิดไม่ได้ (`tools/v3/compute.js:34,42,72,79` + legValue) ⇒ error ทุกข้อพร้อม path แทน throw ข้อแรก
- **`checkDoc(doc, {stage:'save'})`**: ตัด **`v2:E40` ตัวเดียวเท่านั้น** (tag ลงตอน ship) และ log ว่าตัด — ไม่มี code อื่นถูกยกเว้น · `save` กับ gate จึงเป็น code path เดียวกัน (§6.1)
- self-test (meta-test) ของ v3 = **mutate JSON** (ไม่ใช่ HTML) แล้วดูว่า check ยิง · ต้องมีเคสต่อทุก code ใหม่/ที่ย้าย
- `verify` 18 ขั้น: เพิ่ม `v3-test` (schema/compute/prose/render unit) + `check-v3` · ระหว่าง transition รันทั้งสองสาย

## 10. Migration (`tools/migrate-v3.js`) — sweep ครั้งเดียว + ขนานกับของเดิม

1. **Parse** v2/v1 HTML ด้วย parser/locator เดิม (`report-values`, `derived-values` CARD_SRC, `.vmethod`) → สร้าง v3 doc
   - legs: จำแนก method จาก `.mname`/`.mdesc` — **วัดจริง (Plan 4 Task 0 · 2052 ขาจาก 2075 บล็อก · 23 เป็นเปลือกว่าง)**: pe 849 · ddm 308 · dcf 304 · pbv-justified 253 · evsales 65 · evebitda 56 · pfcf 55 · ps 48 · pbv 22 · fcfyield 17 · pffo 14 · ddm2 6 · sotp/nav 18 (declared) · **เป้านักวิเคราะห์ 20** · จำแนกไม่ได้ 17 → ดึง inputs (reproduce `.mval` ใน 1.5%: pe 843/849 · ddm 297/308 · pbvJ 235/253 · pffo 14/14) · จำแนกไม่ได้/inputs ไม่ครบ → `declared` + ค่า `.mval` เดิม · **ขาเป้านักวิเคราะห์ไม่มี method v3**: role fv (17 ใบ) = HUMAN (ต้องหาขาจริงขาที่สอง — pattern ICC I1 · เป็นเวฟ re-analysis หลัง 4c ไม่บล็อกแบตช์) · role context (3) = declared context
   - fvWeights — **กฎ (advisor 25 ก.ย. 69 · แทนข้อความเดิม "แก้ weights ให้ได้ FV เดิม" ที่ขัด §10.2)**: inputs = ค่าที่ผู้เขียนระบุ, output คำนวณใหม่ · weights แก้ได้เฉพาะ**ภายใน rounding ของ scheme ที่ note ระบุ** (เท่ากัน หรือ ตระกูล 0.4c) · เกิน tolerance = คง weights ตาม scheme ปล่อย FV ขยับ → **VALUE-DRIFT** ("ค่าเดิมค้าง, v3 ถูก") ไม่ back-solve · วัดแล้ว: เท่ากัน/ตระกูลลงตรง 267 ใบจากขาที่ compute (807 ถ้าปัดตามทศนิยมที่พิมพ์ — ส่วนต่างคือผู้เขียนเฉลี่ยขาที่ปัดแล้ว ไม่ใช่ weights ซ่อน) · "ugly weights" 42 ใบ = คลาสนี้ · ติดลบ/แก้ไม่ได้ 9 ใบ (ทั้งหมดเฉลี่ยขาเป้านักวิเคราะห์เข้า FV) + RCAT (0 ขา fv) → HUMAN
   - prose: แทน literal ที่ตรงค่าผูกราคาด้วย token (ใช้ตัวตรวจกติกา B เดียวกัน) · `{{rd:x}}` → token v3 · **`PROSE-LIT` นิยามใหม่ (Task 0 Q4 — นิยามเดิม "literal รูปเงินที่เหลือ" ให้ CLEAN = 0 เพราะนับยอดซื้อคืน/ข้อความ disclaimer ด้วย: เหลือ ≥3 ใน 909/909 ใบ)** = (a) literal ที่เท่ากับค่าผูกราคา **ณ วันวิเคราะห์** (ราคา/P/E/MOS/upside ของ commit ที่ footer ชี้ — 347 ใบ: ราคา 224 · P/E 450 จุด · MOS 17 · upside 7) + (b) literal ที่มีป้ายผูกราคา ("ราคาปัจจุบัน", "P/E ปัจจุบัน" …) ≠ token (37 ใบ · E44 มองไม่เห็นเพราะ `PROSE_BOUND` ครอบแค่ p/li/.txt/.hint — 8 อยู่ใน `.zone`) · ตรวจทุก zone รวม `.zone`/h2/vcell · **>0 ⇒ VALUE-DRIFT** · token ที่ควรเพิ่มก่อน 4b (จำนวนใบที่ใช้ literal นั้น): `fund:eps` 834 · ค่าขา `leg:<i>` 517 · `range52w` 496 · `dps` 458 · `bvps` 223 · `scn:<k>:driverEnd` 141 · `epsFy` 45 · `analyst:vsFv` 30 · mcap@fx ~19 — ไม่ใช่เงื่อนไข CLEAN (ไม่มีชุดไหนทำให้ literal = 0) แต่ลด literal ค้างรอบหน้า · 4b ตัดสินชุดที่ทำ
   - cards: map label → แคตตาล็อก · ไม่ลง → `custom[]` (ถ้าไม่ผูกราคา) หรือรายชื่อคน
2. **Equivalence diff (ออกแบบจาก Task 0 Q8 · 25 ก.ย. 69)**: render v3 → เทียบกับ `dist/` v2 ที่ build ที่ merge-base แบบ **text ที่มองเห็น** (normalize ช่องว่าง) **ต่อ zone**: (a) zone prose = word-exact หลัง render token (ต่างได้เฉพาะตัวเลขที่ migrator แทนเอง) · (b) zone ของ template (label/.d/hint/h1 "(SYM)"/footer/FV box/analyst "N ราย"/≈→ณ/emoji ที่ template ทิ้ง/badge/gauge dots) = **รายการ transform ที่อนุญาตแบบปิด** — transform ต้องอนุมัติ ไม่ใช่เงียบ · (c) word-bag ระดับหน้า: ทุกคำของ v2 ต้องอยู่ใน v3 ⇒ แยก "ย้ายที่" จาก "หาย" · (d) **ห้าม mask region ที่ migrator เขียน** (`migrate-v2.js:669` เขียนทับ `.ret` ทั้งเซลล์ + `:807–808` ล้าง `.ret` สองฝั่งก่อนเทียบ = ต้นเหตุข้อความหาย 23 ไฟล์ #42/#47 — self-test ของ migrator: mutate คำผู้เขียนในเซลล์ที่มี token แล้วต้องได้ TEXT LOST) · (e) ตัวเลขที่ compute ต่างจาก literal เดิมเกิน rounding → "ค่าเดิมค้าง, v3 ถูก" = VALUE-DRIFT · **ข้อความหาย = HUMAN เสมอ** · fixture `-real` (BBL/FER/EQIX) **ไม่ใช่ acceptance test** ของ migrator — วัดแล้วมีข้อความหายจากการแปลงมือ (TEXT LOST 11/29/14) · acceptance = gate นี้บนใบจริงทุกใบ
3. **สี**: equivalence diff มีช่อง colour ด้วย — theme ที่ render เทียบ theme เดิมทุกคีย์ rgbDist ≤12 ไม่งั้นเข้าถัง HUMAN (วัดแล้ว: 195/227 ใบที่มี seed ตรงทุกคีย์ ⇒ 714 ใบใช้ `themeLegacy` §3.5) · **สีนอก theme (Task 0 Q6 · advisor 25 ก.ย. 69)**: card tone ที่ v2 ไม่มีคลาส (466 การ์ด/277 ใบ) → เพิ่ม tone `'none'` ใน enum (ไม่งั้น default เหลืองทั้งชุด = regression) · badge เฉพาะใบ (423) · gauge dots (glyph 530 · สีมือ 192) · `.chg` (15) · emoji ที่ template ทิ้ง = **decoration ของ template โดยดีไซน์** (OGE/ICC = pattern ที่เจ้าของเห็นแล้ว) ⇒ เป็น transform class ที่อนุมัติใน gate §10.2(b) **ไม่เพิ่มฟิลด์ schema** · เจ้าของเห็น screenshot ก่อน/หลัง 3 ใบตอน 4c
4. **ผลลัพธ์ 3 ถัง**: `CLEAN` (เขียน .json ลบ .html ใน commit เดียวกัน) · `VALUE-DRIFT` (ต่างเฉพาะตัวเลขที่ v2 ค้าง — controller รีวิวตาราง แล้วอนุมัติเป็นชุด) · `HUMAN` (ขาจำแนกไม่ได้ · weights ไม่ลง · ข้อความหาย · ขาเป้านักวิเคราะห์เป็น fv · fv <2 ขา · sources <3) — **Task 0 prototype (นิยามของ agent · `.superpowers/sdd/v3-plan4-task0/classify.csv`): CLEAN 290 · VALUE-DRIFT 519 · HUMAN 100** (custom >4 การ์ด 38 · scenario นอก enum 34 · ขานักวิเคราะห์ 17 · fv<2 16 · weights 9 · sources<3 4) — ตัวเลขนี้จะเลื่อนตามกฎข้างบน (weights/exit ไม่ back-solve ⇒ CLEAN→DRIFT บางส่วน · catalog keys/enum/rating nullable ⇒ HUMAN ~72 ใบ→CLEAN · HUMAN แท้ ≈33 = ขานักวิเคราะห์ 17 + fv<2 16 ซ้อนกัน + sources<3 4) · **การ sweep ของ 4b เป็นตัวตัดสิน**
5. **Transition**: build อ่านทั้ง `reports/*.html` (v2 path เดิม) และ `reports/*.json` (v3) · ห้ามมีทั้งสองไฟล์ของหุ้นเดียว (build error) · cron เดินสองสาย · NEW ทุกใบเป็น v3 ตั้งแต่วันเปิด
- ข้อค้นพบ Task 0 ด้าน migration (ไม่ใช่การแก้ spec): Q = v2 เก็บ forward EPS ไว้ใน `eps` (**28 ใบ** วัด Plan 4 Task 0 — รายชื่อใน findings Q5 · P/E บน index ขยับ · P/FFO ใน `pe` = AMT DLR EQIX FRT O ตาม §13-5 · ปันผล 1 ตำแหน่ง 32 ใบ: 19 format-only · 4 precision · AEONTS drift จริง · 8 ไม่พิมพ์ DPS) · R = literal ค้างในใบจริง (EQIX) → ถัง VALUE-DRIFT/`W31` — ติดตามที่ `docs/open-items.md` **#55 / #56**
- **ช่องว่าง schema ที่ 4b ต้องปิดก่อน sweep (Task 0 Q3/Q6 · advisor: ไม่ใช่ polish — เปลี่ยน HUMAN เชิงกลไก ~72 ใบเป็น CLEAN)**: `analyst.rating` nullable (114 ใบไม่มี rating · `schema.js:417` บังคับ) · แคตตาล็อกการ์ดเพิ่ม `occupancy` `netDebtEbitda` `backlog` `payout` `aum` `ptbv` (+ แก้ census 3 จุด: margin→netIncome 45 · median P/E→pe 57 · GAAP/Adj EPS 20) — `custom` คง ≤4 (38 ใบเกินก่อนเพิ่มคีย์) · `exitMetric`/`driver` enum (§3.3) · `meta.sources` ≥3 คง (COO EGP FISV SYY → HUMAN) · `headerTags` ADR/dual listing (14) · **DCF N-stage (§13-3)**
6. **Cutover** เมื่อถัง HUMAN = 0: ลบ v2 path (`derivedPassV2`, `keepMap`, `patchDerived` สาย HTML, `migrate*.js`, `apply-edits` `@@`, `field-manifest`, `preserve-dates`, V2TOKENS, check-reports ส่วน HTML, `brandtheme.js --write` + `fix-contrast.js` ที่ regex theme ใน report-data — สีอยู่ที่ seeds.json ที่เดียว) — **ลบโค้ดจำนวนมาก** เป็นตัวชี้วัดความสำเร็จ

## 11. ลำดับการทำ (phase — แต่ละ phase merge ได้เอง ไม่พังของเดิม)

| Phase | ส่งมอบ | เกณฑ์จบ |
|---|---|---|
| P1 แกน | `schema.js` `compute.js` `prose.js` `io.js` + unit test (สูตร/ปัดตรง v2 `derive()` ทุก token) | test ผ่าน · compute ของ 10 ใบตัวอย่าง = ค่าที่ v2 render ได้ |
| P2 render | `_template/v3/render.js` + build dual-path + freshHash v3 · `reports.json.file` ของใบ v3 ยังเป็น `<SYM>.html` (ชื่อใน dist — ไม่งั้น url พัง) · theme จาก seeds.json | render ใบตัวอย่าง DOM เทียบ skeleton ผ่าน · หน้าตาเหมือนเดิม (screenshot 3 ใบ) |
| P3 gate = **Plan 2a** | **ส่วนขยาย schema §3.6 (A–O) + กติกา B ใหม่ §4** + P3 gate: `check-v3.js` (E50/E51/E52/W30/W31) + self-test แบบ mutate JSON · **ไม่มีผลกับ production** (tripwire คงอยู่) | ทุก code ในตาราง §9 มีบ้าน · self-test ครบ · corpus parity 909/909 · เกณฑ์ fixture ใบจริงใน §12 |
| P4a infrastructure = **Plan 2b** | **ไม่มีผลกับ production** (tripwire คงอยู่ · dist byte-identical): `tools/report-source.js` (§6.5) → แปลง scanner 16 ตัวผ่าน helper (แบตช์ตาม runtime: verify-path tests / queue tools / cron-adjacent / misc · แต่ละแบตช์จบด้วย dist diff = 0) → `report.js` CLI (§6.1 · + `.work/` ใน .gitignore) + prep sidecar (§6.4) → กติกา gate (`{{rd:` · sentinel `TODO` · `semanticErrors()` · `stage:'save'` §9) → ไฟล์ hook (script + settings snippet ให้เจ้าของ paste §6.2) | test ผ่านทั้งหมด · dist ไม่เปลี่ยนแม้ byte เดียว · hook พิสูจน์ใน `claude -p` process ใหม่ (deny ชนะ rtk hook) — **ทำแล้ว 24 ก.ย. 69 (PR #74):** controller รันใน harness: exit 0 · `grep -c` = 5 · HOOK-OK · ขั้น (3) ถูก deny ⇒ deny ชนะ rtk-rewrite · ยังไม่ paste snippet (เจ้าของรันซ้ำเองแล้ว paste หลัง 2c-i merge) |
| P4b ใช้จริงครั้งแรก = **Plan 2c** (แยก 2 PR — §6.6) | **2c-i (ไม่มีผลกับ production)**: แก้เอกสาร worker (stock-analyzer SKILL มี **หัวข้อ v3 NEW แยกเฉพาะ = STEP 5V** ไม่ใช่ if/else ไล่ 68 จุด · `save ✓` คือ gate ของ worker — worker ไม่รัน `npm test` ในโหมด v3 NEW เพราะ `v2:E40` แดงเสมอจน controller tag · agent-prompt / stock-controller / CLAUDE.md §1/§2/§7/§10 / orchestration) + โค้ดเล็ก (`ship --no-push` · ล้างข้อความ v2 ใน prep/fetch-facts/pick-brand/themeOf) → **ถอด tripwire เป็น commit โครงสร้างสุดท้าย** (ต้องมาก่อน commit รายงาน — `ship` รัน verify เต็ม) → merge · **2c-ii (production change แรก)**: รัน `prep` ใหม่หลังเอกสาร merge (`--model opus` · หลังตลาดปิด) → worker Opus ทีละใบ → controller tag-apply → postcheck → ชั้น 0 → advisor → `ship --no-push` → ซ้อมทั้งเว็บ+cron ใน scratch → PR → advisor → merge · หุ้น exit = **OGE** (US · prep 24 ก.ย. 69 สะอาด) + **M-CHAI** (TH · ยืนยันกระดานที่ set.or.th ก่อน) | 2c-i: verify ผ่าน · dist byte-identical · `docs-test` ผ่าน · prep dry-run ของ OGE ให้ `.md` ที่มีบรรทัดชี้ 5V และไม่มี hint `update-prices` · 2c-ii: NEW 2 ใบ (TH+US) จริง publish ผ่าน `report.js save` end-to-end โดย worker **Opus** · verify ผ่าน · ซ้อม cron ให้ `v3-skipped: 2` · จำนวน turn ต่อ worker บันทึก (§12) |
| P5 cron = **Plan 3** (`docs/superpowers/plans/2026-09-24-report-v3-plan3-cron-v3.md` · 1 PR `feat/report-v3-plan3` · §7) | Task 1 `tools/v3/market.js` (`marketFromQuote` · `priceOnlyChart` · `validRange` · `quoteDate`) + `factsJson`/sidecar/`patchReport` ใช้ตัวเดียวกัน · Task 2 `IO.writeMarket` (lock เดียว · `verifySig` ไฟล์เดิม · `checkDoc` lazy) · Task 3 สาย v3 ใน `update-prices.js` (`planV3`/`applyV3`/`preSkip`/`chartFor`/`evaluatedOf`/`healV3Refusal`/`v3LaneLine` · ลูป `RS.list` · ถอด `v3Guard`/`v3Refusal`/`v3SweepNotice` · `test/v3/cron.test.js` + ปรับเทส 3 ไฟล์ที่ตรึงพฤติกรรม P4) · Task 4 `verify:cron` + `check-v3` (#61) + gen-docs · `update-prices.yml` นับ `.json` · preflight บรรทัดใบ v3 (R8) · ข้อความค้างใน prep/ship · Task 5 เอกสาร (CLAUDE.md §9 · stock-controller §9 · `docs/price-refresh.md` · decisions §9/§10 · open-items #49/#61/#62) · Task 6 ซ้อมสาย v3 + verify เต็ม + GIT_DIR-sim + DIST-PROOF + PR · **เส้นตาย (วัดจาก gate จริง 24 ก.ย. 69 — §6.6): แข็ง = `market.priceDate` ของใบ exit + 120 วัน = 2027-01-21 (E27 ล้ม `npm run verify` ทั้ง repo ที่ +121) · เป้า = +45 วัน = 2026-11-07 (W09 เตือนที่ +46)** (open-item #62) · ห้ามรวมเข้า 2b/2c | (a) ซ้อมสาย v3 บน OGE + ICC ใน scratch worktree ด้วย quote fixture: `git diff` = `market.*` + `_sig` เท่านั้น (ทุกช่องอื่น deep-equal · `freshHash` เท่าเดิม) · (b) unit suite ผ่าน: `test/v3/market.test.js` · `test/v3/io.test.js` (writeMarket) · `test/v3/cron.test.js` · `test/v3/sidecar.test.js` (prep = cron) + เทสที่ปรับ · (c) ซ้อมด้วยราคาจริงเฉพาะตอนสองตลาดปิด (04:00–10:00 ไทย) ไม่งั้นใช้ fixture · (d) DIST-PROOF ที่ head สุดท้าย: ต่างจาก merge-base ได้เฉพาะ `dist/OGE.html` `dist/ICC.html` index `reports.json` และเฉพาะเมื่อราคาจริงเปลี่ยน · (e) **เงื่อนไขก่อน merge = log ของ cron ตามตาราง 25 ก.ย. 69 04:00: `v3-skipped: 2` + ไม่มี `patch-rejected` ของ OGE/ICC** · (f) หลัง merge: cron ตามตาราง 3 รอบสะอาด (ไม่มี `patch-rejected` บนใบ v3 · `updated` ของ OGE/ICC ไม่ขยับ · W09 หาย) แล้วจึงปิด #62 — ledger เปิดจนถึงตอนนั้น |
| P6 = **Plan 4a** v3 UPDATE queue flow (แยกจาก migrate — advisor 25 ก.ย. 69: migrate แม้แบตช์เดียวจะส่งใบ v3 เข้าคิวที่ `prep` ปฏิเสธ/preflight ซ่อน/`ship` commit ผิด) · **ไม่มีผลกับ production** | `prep` รับ symbol v3 (ถอด `checkNotV3` `prep.js:295–298,310` · `th`/วันงบจาก `RS.metaLite` :313–315,326 · บริบทจาก `RS.renderedHtml` :365–369 · **ไม่สร้าง sidecar** — #64) · extraBlock บรรทัด v3 UPDATE · preflight รวมใบ v3 (ถอด `!e.v3` `preflight.js:39` · ข้อความ :152–153) · `--light` allowlist มี path `text.*` ที่ LIGHT ของ v3 ต้องใช้ (§6.3) · agent-prompt.md:33,57 + stock-analyzer SKILL มี path v3 UPDATE (export → save [--light] → คืน `.json`) · เทสที่ตรึงพฤติกรรมเดิม `queue-test.js:1552–1555,1570–1572,1605–1607` | ซ้อม UPDATE (OGE) + UPDATE-LIGHT (ICC) ใน scratch: prep → export → แก้ → save → postcheck → `ship --no-push` · diff = `.json` ใบเดียว · dist ที่เหลือ byte-identical · verify ผ่าน |
| **Plan 4b** `migrate-v3.js` + sweep อ่านอย่างเดียว · **ไม่เขียน `reports/`** (dist byte-identical) | parser (locator เดิม) · leg classifier ตามตาราง §10.1 · **DCF N-stage** (§13-3) · weights/exit ใต้กฎ "ไม่ back-solve" (§10.1/§3.3) · แคตตาล็อกการ์ด + census fix + enum/nullable (§10 ช่องว่าง schema) · token ชุดที่เลือก (§10.1) · **กลไก `updated`** (§8 — เลือก + gate build 2 รอบ) · equivalence gate ต่อ zone (§10.2) + self-test `.ret` · รายงาน 3 ถัง + ตาราง VALUE-DRIFT เป็นไฟล์ใน docs · `ship` commit `−.html +.json` ด้วยกัน (`ship.js:243` `existsSync` ทิ้ง .html ที่ลบ) · message `migrate: v3 <SYM…>` | sweep 909 ใบ → ตาราง 3 ถังสำหรับเจ้าของ (durable) · CLEAN มี TEXT LOST = 0 · self-test `.ret` ผ่าน · dist byte-identical |
| **Plan 4c** แบตช์ migration — **gate: ห้าม merge แบตช์ก่อน cron ตามตาราง 3 รอบสะอาดที่ปิด #62 (26/27/28 ก.ย. 69)** | CLEAN commit ละ 50 (§13-1 · วัดได้ ~290 ⇒ ~6 commit) · VALUE-DRIFT 1 หุ้น/commit หลัง advisor อนุมัติตาราง (เจ้าของเห็นในรายงาน) · HUMAN = รายชื่อ + ต้นทุนส่งเจ้าของ (ขานักวิเคราะห์/fv<2 ≈33 ใบ = เวฟ re-analysis pattern ICC I1 หลัง 4c) · screenshot ก่อน/หลัง 3 ใบ | `updated` + `reports.json.file` ไม่เปลี่ยนทุกใบ · DIST ต่างเฉพาะเซลล์ที่อนุมัติ (equivalence gate แทน byte identity — ต้องล้มเมื่อข้อความหาย ไม่ใช่แค่ตัวเลขต่าง) · stat ต่อหุ้น = `−<SYM>.html +<SYM>.json` (+ reports.json/seeds.json) |
| P7 cutover | ลบ v2 path + เอกสาร | HUMAN = 0 · verify ผ่าน · cron 7 วันเขียว |

## 12. ความเสี่ยง + ตัวกัน

| ความเสี่ยง | ตัวกัน |
|---|---|
| migration ทำข้อความหายเงียบ (ซ้ำ `.ret`) | word-level prose diff ต้องว่าง ไม่งั้นเข้าถัง HUMAN · ห้าม mask ข้อความ |
| compute ปัดต่างจาก v2 → ตัวเลขบนเว็บขยับทุกใบวันเดียว | P1 เกณฑ์: ทุก token ของ v2 ต้องได้ string เดียวกันบนใบตัวอย่าง + corpus test ทั้ง 885 ใบ v2 |
| schema แข็งเกินจน worker เขียนหุ้นแปลกไม่ได้ | `declared` leg + `custom[]` + `extras[]` + `{{lit:}}` = ทางออกที่นับได้ · gate นับการใช้ ถ้าโตผิดปกติ = schema ขาดอะไร |
| worker (Sonnet) เขียน JSON ยาวผิดบ่อย → turn เพิ่ม/ต้นทุน | `save` คืน error ทุกข้อในครั้งเดียวพร้อม path · `init` เติมโครงให้ · วัด turn ใน P4b (Plan 2c) เทียบ benchmark (`token-usage-benchmarks`) |
| hook ถูกเลี่ยงผ่าน Bash | `_sig` + E50 ใน pre-push จับได้เสมอ |
| worker ถอยกลับไปเขียน HTML (`reports/<SYM>.html`) | `npm test -- <SYM>` ส่งต่อ `check-v3` เอง (§6.5 — ตัวกระตุ้นอันดับ 1 คือ self-check ที่แดงโดยโครงสร้าง) · hook บล็อก **ทุก** `reports/*` (§6.2) · SKILL มีหัวข้อ v3 NEW แยกเฉพาะ (Plan 2c) · stdout ของ prep/pick-brand/fetch-facts เลิกสั่ง "วางลง report-data" |
| ราคาใบ v3 แช่แข็งเงียบ (cron ยังอ่านแต่ `.html`) | `update-prices` exit ≠0 บน symbol v3 (ไม่ no-op exit 0) · `reportExists` รวม `.json` · เส้นตาย P5 = merge 2c + 45 วัน (#62) |
| `ship --prepatch` กวาด `reports/*.json` ที่ยังไม่รีวิวเข้า commit อัตโนมัติ | fail closed: path ใต้ `reports/` ที่ไม่ใช่ `.html` = blocker + test (§6.5) |
| cron สองสายระหว่าง transition | สาย v3 ง่ายกว่า (ไม่มี regex) · ทดสอบ dry-run ก่อน · ช่วง transition จำกัดด้วยเกณฑ์ P7 |
| ใบที่ "ถูกซ่อมเงียบ" ตอน migrate (VALUE-DRIFT) ทำตัวเลขบนเว็บเปลี่ยน | เป็นการแก้บัคจริง แต่ต้องให้เจ้าของเห็นตารางก่อนอนุมัติแบตช์ |
| schema แข็งเกิน — **วัดแล้ว** (Task 0): fixture ใบจริงทั้ง 3 ชนเพดาน custom 4 การ์ด | ส่วนขยาย §3.6 · **เกณฑ์จบ Plan 2a** = fixture `-real` แต่ละใบ: custom ≤2 การ์ด · ไม่มีขา `declared` ในที่ที่มี method คำนวณได้ · ไม่มีข้อความซ้ำ (ประโยคที่ต้องยัดซ้ำเพราะไม่มีช่อง) · gate 0/0 (= v2 gate บนหน้าที่ render 0 error/0 warning · check-v3 **0 error** ยกเว้น EQIX-real = E17 พอดี 1 ตัว เป็นเคสสาธิตถัง HUMAN ตาม §13 ข้อ 4 · **W31 ไม่นับ** — เป็นตัววัด literal ค้างที่ Plan 3 ต้องแทนด้วย token, open-items #57) · FV ไม่เปลี่ยน |

## 13. คำตัดสินที่เปิดไว้ (เจ้าของมอบให้ controller ตัดสิน 24 ก.ย. 69)

1. **commit ของ migration**: ถัง `CLEAN` = commit ละ 50 ใบ (mechanical ไม่เปลี่ยนตัวเลขที่เห็น) · ถัง `VALUE-DRIFT` และ `HUMAN` = **1 commit = 1 หุ้น** ตาม §5 เดิม (ตัวเลขบนเว็บเปลี่ยน → ต้องย้อน/ไล่ได้รายตัว) · message `migrate: v3 <SYM…>` · **ตัดสินแล้ว 25 ก.ย. 69 (controller ใต้ §13 header + advisor + "Go always" ของเจ้าของ — แทน "รอเจ้าของอนุมัติ" ในแถว §11 เดิม)**: ทำตามข้อนี้ · CLEAN ที่วัดได้ ~290 ⇒ ~6 commit
2. **แคตตาล็อกการ์ด section 1**: controller ร่างใน P1 จากการจัดกลุ่ม label 1,526 แบบ (เป้า ~25 คีย์ครอบ ≥90% ของการ์ดในคลัง) → แนบตารางใน PR ของ P1 ให้เจ้าของดู · ไม่ block phase อื่น
3. **DCF**: สูตรมาตรฐาน 2-stage · ไม่ลง → `declared` · P6 วัดสัดส่วน DCF ที่ตกเป็น declared — **>10% ⇒ เพิ่ม 3-stage** ก่อน migrate ต่อ · **วัดแล้ว (Plan 4 Task 0 Q2 · 25 ก.ย. 69): ไม่ใช่ 2-stage โดยโครงสร้าง 88/304 = 28.9% > 10% ⇒ เกณฑ์ยิง → เพิ่ม N-stage schedule** (`stages:[{years,g}]` + terminal) ใน 4b พร้อมเทส — ครอบ phase ที่ 2 (37) · fade (24) · ลิสต์รายปี (26) → เหลือ declared 20 (6.6%) · revenue×margin (18) ยัง declared · 2-stage เดิม reproduce ได้ 98/304
4. **E17 นับเฉพาะขา `role:'fv'`** (§3.6 I) — ขา context ไม่ช่วยให้ครบ ≥2 ขา · ใบที่เหลือขา fv 1 ขา = ละเมิดชั้น 0 → เข้าถัง **HUMAN** ตอน migrate (15 ใบ: EQIX APURE ARM CCJ CLS COHR CRWV DELTA ENTG EVR LEO MICRO MRNA POET RCAT) — *advisor อนุมัติเป็นคำตัดสินถาวร 24 ก.ย. 69 (เจ้าของมอบอำนาจอนุมัติให้ advisor)*
5. **`stock-meta.pe` = ราคา / EPS เสมอ** (1 ช่อง 1 ความหมาย) · REIT แสดง P/FFO ผ่านการ์ด/token `pffo` แทน (§3.6 J) · ผล: 5 ใบ (AMT DLR EQIX FRT O) ที่ v2 เก็บ P/FFO ไว้ใน `pe` จะเปลี่ยนตำแหน่งเรียงบน index — *advisor อนุมัติเป็นคำตัดสินถาวร 24 ก.ย. 69 (เจ้าของมอบอำนาจอนุมัติให้ advisor)*
6. **ขา context ที่ใช้ตัวคูณปัจจุบัน คำนวณได้ ไม่ต้อง `declared`** (advisor 24 ก.ย. 69 · กลับ R7 ของ Plan 2a บางส่วน): `role:'context'` + `multipleSource:'current'` = ถูกกติกา · ค่าขา ≡ ราคา จึงมีข้อมูลเดียวคือตัวคูณสด (ราคา ÷ ตัวตั้ง) ซึ่ง compute ทุกวัน · `declared` จะแช่แข็งตัวเลขผูกราคา (43 ขาตอน migrate ค้างทุกวัน = คลาสบัคที่โปรเจกต์นี้ปิด) · `'current'` ยังห้ามบนขา `role:'fv'` (W18 สมอตาย) · FCF-Gordon ของ ZTS ยัง `declared` (3 ใบ เจ้าของตัดสินแล้ว)
7. **|MOS| > 40% (ชั้น 0)** = ต้องมีขา `role:'fv'` อย่างน้อย 1 ขาที่ `family !== 'rg'` ยืนยัน · ไม่มี → W-code (warn — ชั้น 0 เป็นงานตรวจของ controller) · อยู่ใน check-v3 ของ Plan 2a
8. **Scanner ผ่าน helper เดียว** (§6.5): สร้าง `tools/report-source.js` **ก่อน** (`list(dir)` ครอบ `build.reportEntries` + ตรวจสองไฟล์ · `metaLite(sym)` · `renderedHtml(sym)`) แล้วแปลง scanner ทั้ง 16 ตัวผ่านมัน เป็นแบตช์ 3–4 รอบตาม runtime แต่ละแบตช์จบด้วย dist diff = 0 · `ship --prepatch` **fail closed** (path ใต้ `reports/` ที่ไม่ตรง regex `.html` = blocker + test) — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
9. **ราคาใบ v3 แช่แข็งจน P5 = ยอมรับ แต่ห้ามเงียบ**: `update-prices` exit ≠0 บน symbol v3 ("v3 cron = Plan 3") · `reportExists` รวม `.json` · open-item #62 = เส้นตาย P5 = merge 2c + 45 วัน · ไม่มี P5 ใน 2b/2c — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
10. **save กับ checkDoc = code path เดียว**: `checkDoc(doc, {stage:'save'})` ตัด `v2:E40` ตัวเดียว (log) ไม่มีอื่น · การรวม error ครบ (#52) อยู่**ใน** checkDoc ผ่าน `semanticErrors()` ก่อน compute · กติกา B ยังเรียกตอน save (R5) · merge `market` ก่อน validate (sidecar สำหรับ NEW · `.json` เดิมสำหรับ export) — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
11. **อินพุตของ init = sidecar `.queue/prep/<SYM>.json` เท่านั้น** (ไม่ regex `.md`) · `market` ไม่เข้า `.work/` · `init` ปฏิเสธเมื่อมี `.html` หรือ `.json` · `prep` ปฏิเสธ symbol v3 ("v3 UPDATE = Plan 3" → "v3 UPDATE = P6 …" ใน Plan 3) · `export` ส่งเป็นคำสั่ง แต่ flow คิวของ v3 UPDATE = P6 (**= Plan 4a** §6.3 · 25 ก.ย. 69) — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
12. **Hook**: บล็อก Write/Edit/MultiEdit/NotebookEdit บน **ทุก** `reports/*` + รูปแบบเขียนของ Bash · fail-open เมื่อ hook error · เจ้าของ paste settings snippet เอง · พิสูจน์ใน `claude -p` ใหม่ · `git mv`/`rm` ผ่าน · test พิสูจน์ว่า deny ชนะ rtk hook ระดับ user · `_sig`/E50 = ตัวบังคับจริง — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
13. **`{{rd:` และ `TODO`/placeholder = กติกา gate** (E51 ใน schema + เคส self-test ของ check-v3) ไม่ใช่เฉพาะ save · **ก่อนเพิ่มกติกา `{{rd:`**: grep `test/fixtures/v3/*.json` — เจอ = บั๊ก fixture แก้ผ่าน `IO.write` — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
14. **เอกสาร worker (2c)**: หัวข้อ v3 NEW แยกเฉพาะ (STEP 5V) ไม่ใช่ if/else ไล่ 68 บรรทัด · **แก้ 24 ก.ย. 69 หลัง Task 0 ของ 2c (advisor):** บรรทัดสำคัญที่สุดของ worker = **`node tools/report.js save SYM` ผ่าน = gate ผ่าน** — worker **ไม่รัน** `npm test -- SYM` ในโหมด v3 NEW (คำสั่งนั้นรัน `checkDoc` ตัวเดียวกับ save แต่ปล่อย `v2:E40` ⇒ แดงเสมอจนกว่า controller จะ `tag-apply`) · handoff `npm test -- SYM` → `check-v3` (M1) เป็นของ controller หลัง tag (ผ่าน `postcheck`) · SKILL STEP 6 "ต้อง 0 error" แก้ให้ตรงความจริง (NEW ของ v2 ก็ติด E40 มาตลอด) · **ไม่ regenerate prep 909 ไฟล์** (ทั้งหมดเป็น UPDATE) — สร้าง NEW prep ใหม่เฉพาะหุ้น exit หลังเอกสาร merge — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
15. **หุ้น exit (2c)**: ตรวจผู้สมัครกับ memory completed-backlogs + delisted-stocks ก่อน → `npm run queue -- prep` 2 อันดับแรกต่อตลาด → ตัวตัดสิน = กับดักแหล่งข้อมูลน้อยที่สุด (M-CHAI > ICC ในเกณฑ์นี้ · OGE ใช้ได้ — กำไรพิเศษ FY2022 เป็นการใช้ `medianWindow` ที่ถูกต้อง) · prep ตัดสิน ไม่ใช่การถกเถียง — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)* · **ผล Task 0 ของ 2c (24 ก.ย. 69):** US = **OGE** (prep จริงสะอาด: NYSE/USD · ΔP 0 · sourceErrors null · median P/E 17.2x FY2021–25 · กับดักเดียว = vendor forward 2.60 เป็น FY2027e ติดธง [2c] แล้ว · W25 อาจยิงโดยบังเอิญ 6.6%) · TH = **M-CHAI** (prep หลัง SET ปิด · **ยืนยันกระดาน SET/mai ที่ set.or.th** — Yahoo ให้ code `SET` ทั้งสองกระดาน) · สำรอง ICC/IDA · ไม่เลือก ADR (sidecar ไม่มี `reportCurrency`/`fx`) · **ผลจริง 2c-ii (24 ก.ย. 69):** M-CHAI ใช้ไม่ได้ — StockAnalysis ไม่มี ticker นี้ (redirect symbol-lookup) ⇒ sidecar ปฏิเสธ (fail-closed) ⇒ TH exit = **ICC** (SA ครบ · SET กระดานหลัก จดทะเบียน 2521) · IDA ไม่ใช่ ticker จริง (set.or.th 404 · Yahoo ไม่พบ) · หุ้นไทยที่ SA ไม่ครอบคลุมทำใบ v3 NEW ไม่ได้จนกว่าจะมีแหล่งงบสำรองใน sidecar (open-items ใหม่)
