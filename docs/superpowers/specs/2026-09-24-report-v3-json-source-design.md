# Report v3 — JSON เป็นต้นฉบับ · template เดียว render ทุกใบ · script เป็นผู้เขียนคนเดียว

- วันที่: 24 ก.ย. 69 (2026-09-24) · สถานะ: **อนุมัติแล้ว** (advisor + เจ้าของ 24 ก.ย. 69)
- เจ้าของตัดสินแล้ว (session 24 ก.ย. 69): (1) ต้นฉบับ = `reports/<SYM>.json` · (2) migrate = script sweep + text-diff กับ HTML เดิม + รายชื่อให้คนตัดสิน · (3) กติกาตัวเลขใน prose = **B** (ตัวเลขผูกราคาห้ามพิมพ์เอง ต้องเป็น token · ตัวเลขจากงบพิมพ์ได้) · (4) มีช่อง `extras[]` ตารางข้อมูลล้วน ≤2 ตาราง · (5) template ดึงข้อมูลจาก JSON — JSON เก็บ **เฉพาะค่าที่ตัดสินใจ** ค่าคำนวณทั้งหมดคิดตอน build
- หลักฐานที่ใช้ออกแบบ: วิจัย 3 สาย (ประวัติบัค 3,013 commit / 272 fix · write path ปัจจุบัน · สำรวจ 909 ใบ) — สรุปอยู่ใน §1
- แก้ไข Plan 2b/2c (24 ก.ย. 69 · Task 0 ของ Plan 2b + คำตัดสิน advisor — `.superpowers/sdd/v3-plan2b-task0/rulings.md`): §3 (หมายเหตุ token) · §6.1 · §6.2 · §6.3 · §6.4 ใหม่ (prep sidecar) · §6.5 ใหม่ (`report-source.js`) · §9 · §11 (แยก 2b/2c) · §12 · §13 ข้อ 8–15

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
| `export <SYM>` | `reports/<SYM>.json` → `.work/<SYM>.json` (ตัด `market` + `_sig` ออก) สำหรับ UPDATE · เป็นคำสั่งที่ส่งใน 2b แต่ flow คิวของ v3 UPDATE = P6 |
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
- **UPDATE**: `report.js export` → แก้ draft → `save` · ⚠️ `update-prices --write --force <SYM>` **exit ≠0 บนใบ v3 จนถึง P5** (§6.5 · #62) · flow คิวของ v3 UPDATE (`prep`/`postcheck`/`ship`) = P6 — `prep` ปฏิเสธ symbol v3 ("v3 UPDATE = Plan 3")
- **UPDATE-LIGHT**: `export` → แก้ช่องใน allowlist ของ `--light` (§6.1) → `save --light` (ไม่มี E44 fix-on-touch อีก — ไม่มี literal ให้แก้)
- `apply-edits.js` `@@` blocks → **เลิกใช้กับใบ v3** (ปฏิเสธ `.json` ชี้ไป `report.js save` · ยังใช้ได้กับใบ v2 ระหว่าง transition)

### 6.4 prep sidecar `.queue/prep/<SYM>.json` (Plan 2b · ใหม่)

- `tools/prep-stock.js` / `npm run queue -- prep <SYM>` เขียน sidecar คู่กับ `.md` เดิม — ข้อมูลเครื่องอ่าน (ไม่ใช่ prompt):

```jsonc
{
  "market": { "px": 70.12, "priceDate": "2026-09-23",        // ISO (ไม่ใช่วันที่ไทยในบรรทัด FACTS)
              "chart": { "data": [["ต.ค. 68", 150.2], "..."] }, // ตัด min/max/grid — compute คิดเอง
              "chgSuffix": "รอบปี",
              "range52w": { "lo": 64.1, "hi": 172.3 } },      // 52wk ของ vendor (ไม่ใช่ปิดรายเดือน)
  "vendor": { "epsTTM": 6.13, "target": 95.0, "analysts": 14, "lo52": 64.1, "hi52": 172.3, "divYieldPct": 3.0, "fyYears": ["FY2025", "..."] },
  "ttm": { "...": "..." },                                     // จาก fetch-facts --json
  "sharesOut": 4.3e8,                                          // [2b] หุ้นคงเหลือ ไม่ใช่ wAvgDil
  "medians": { "...": "..." },                                 // MM.oneSymbol แบบ structured (รวมหน้าต่างมัธยฐาน)
  "company": "Zoetis Inc.", "exchange": "NYSE"
}
```

- ที่มา: `fetch-facts --json` + `parseVendor` (`tools/queue/prep.js`) + `MM.oneSymbol` (`tools/median-multiples.js`) — ไม่ประกอบจาก text ของ `.md`
- `market` ใน sidecar ใช้ **ตอน `save` ของใบ NEW เท่านั้น** (merge ก่อน validate) · ไม่เข้า `.work/` · หลัง publish ราคาเป็นของ cron (P5)
- `prep` **ปฏิเสธ symbol ที่เป็น v3 แล้ว** ("v3 UPDATE = Plan 3") — ไม่ทำเหมือนเป็น NEW
- ไม่ regenerate prep ทั้ง 909 ไฟล์ (ทั้งหมดเป็น UPDATE ของ v2) — สร้าง NEW prep ใหม่เฉพาะหุ้นที่จะทำ

### 6.5 `tools/report-source.js` — "ไฟล์ไหนคือรายงาน" จุดเดียว (Plan 2b · ใหม่)

- API: `list(dir)` (ครอบ `build.reportEntries` รวมการตรวจ "ห้ามมีทั้งสองไฟล์ของหุ้นเดียว") · `metaLite(sym)` → `{ currency, px, analysisDate, aiModel }` (v2 จาก stock-meta/footer · v3 จาก JSON) · `renderedHtml(sym)` (v3 = `loadReportSource` + `expandReport`)
- **scanner ทุกตัวใน open-item #49** (16 ไฟล์ + `.gitignore` เพิ่ม `.work/`) อ่านผ่าน helper นี้ — ตรรกะ "ไฟล์ไหนคือรายงาน" ที่เคยก๊อปซ้ำ ~20 จุดเหลือที่เดียว · แต่ละแบตช์ของการแปลงจบด้วย dist diff = 0
- กติกาเฉพาะตัว:
  - `ship --prepatch` **fail closed**: path ใดใต้ `reports/` ที่ไม่ตรง regex `.html` = blocker (+ test) — วันนี้ `continue` ข้ามไป ⇒ `reports/X.json` ที่ยังไม่รีวิวจะถูกกวาดเข้า commit "price: pre-patch" โดยไม่ผ่าน postcheck
  - `update-prices` **exit ≠0 บน symbol v3** ("v3 cron = Plan 3") จนถึง P5 (#62 — ห้าม no-op exit 0 เงียบ) · `reportExists` รวม `.json` (ไม่งั้น commitFlags/canary ลบ flag ของใบ v3)
  - `preserve-dates` **ข้ามใบ v3** (ไม่มี `<footer>` · `freshHash` v3 ไม่รวม market/_sig/aiModel อยู่แล้ว §8)
  - `npm test -- <SYM>` (check-reports CLI) **ส่ง symbol v3 ต่อให้ `check-v3`** แล้วรวม exit code — วันนี้ขึ้น "ไม่พบไฟล์รายงานให้ตรวจ" exit 1 ซึ่งเป็นตัวกระตุ้นอันดับ 1 ให้ worker ถอยไปเขียน HTML
  - `apply-edits` **ปฏิเสธ `.json`** (ชี้ไป `report.js save`)
  - migrator/theme writer ที่ล้าสมัย (#49 กลุ่ม A3: `migrate.js` `migrate-annual-chg.js` `migrate-v2.js` `brandtheme.js --write` `fix-contrast.js` `field-manifest.js` `v3/card-census.js`) **คง `.html` อย่างเดียว** จนลบที่ P7
  - ที่เลื่อนไป P5: writer ราคาของ v3 ใน `update-prices` · `update-prices.yml` นับ `.json` · `verify:cron` รวม `check-v3` (#61) · pre-patch ของ `preflight` (2b ข้ามแถว v3 พร้อมข้อความ)

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
   - legs: จำแนก method จาก `.mname`/`.mdesc` (P/E 850 · DCF-family 393 · DDM 324 · P/BV 243 …) → ดึง inputs · จำแนกไม่ได้/inputs ไม่ครบ → `declared` + ค่า `.mval` เดิม
   - fvWeights: ถ้า FV เดิม ≠ ค่าเฉลี่ยขา → แก้ weights ให้ได้ FV เดิม (≤2 ขา แก้ได้เสมอ · 3–4 ขาเลือกที่ใกล้เท่ากันสุด) · ทำไม่ได้ → รายชื่อคน
   - prose: แทน literal ที่ตรงค่าผูกราคาด้วย token (ใช้ตัวตรวจกติกา B เดียวกัน) · `{{rd:x}}` → token v3 · นับ `PROSE-LIT` (literal รูปเงินที่เหลือ) ต่อใบ — **>0 ⇒ ถัง VALUE-DRIFT ไม่ใช่ CLEAN** (literal ลอกราคาวันวิเคราะห์ที่ราคาขยับไปแล้ว จับด้วยการเทียบราคาวันนี้ไม่ได้)
   - cards: map label → แคตตาล็อก · ไม่ลง → `custom[]` (ถ้าไม่ผูกราคา) หรือรายชื่อคน
2. **Equivalence diff**: render v3 → เทียบกับ `dist/` v2 ปัจจุบันแบบ **text ที่มองเห็น** (normalize ช่องว่าง) ต่อ section · อนุญาตต่างเฉพาะตัวเลขที่ compute ต่างจาก literal เดิมเกิน rounding → รายงานว่า "ค่าเดิมค้าง, v3 ถูก" (คาดว่าเจอเยอะ = บัคเงียบที่ v2 ซ่อนอยู่) · ห้ามมี **ข้อความหาย** (บทเรียน `.ret` 23 ไฟล์) — word-level diff ของ prose ต้องว่าง
3. **สี**: equivalence diff มีช่อง colour ด้วย — theme ที่ render เทียบ theme เดิมทุกคีย์ rgbDist ≤12 ไม่งั้นเข้าถัง HUMAN (ไม่ควรเกิดเพราะ §3.5 เก็บ themeLegacy)
4. **ผลลัพธ์ 3 ถัง**: `CLEAN` (เขียน .json ลบ .html ใน commit เดียวกัน) · `VALUE-DRIFT` (ต่างเฉพาะตัวเลขที่ v2 ค้าง — controller รีวิวตาราง แล้วอนุมัติเป็นชุด) · `HUMAN` (ขาจำแนกไม่ได้ · weights ไม่ลง · ข้อความหาย · v1 ที่ 21 ใบตัดสินไม่ได้) — คาด ~20–60 ใบ
5. **Transition**: build อ่านทั้ง `reports/*.html` (v2 path เดิม) และ `reports/*.json` (v3) · ห้ามมีทั้งสองไฟล์ของหุ้นเดียว (build error) · cron เดินสองสาย · NEW ทุกใบเป็น v3 ตั้งแต่วันเปิด
- ข้อค้นพบ Task 0 ด้าน migration (ไม่ใช่การแก้ spec): Q = v2 เก็บ forward EPS ไว้ใน `eps` (~19 ใบ · P/E บน index ขยับ) · R = literal ค้างในใบจริง (EQIX) → ถัง VALUE-DRIFT/`W31` — ติดตามที่ `docs/open-items.md` **#55 / #56**
6. **Cutover** เมื่อถัง HUMAN = 0: ลบ v2 path (`derivedPassV2`, `keepMap`, `patchDerived` สาย HTML, `migrate*.js`, `apply-edits` `@@`, `field-manifest`, `preserve-dates`, V2TOKENS, check-reports ส่วน HTML, `brandtheme.js --write` + `fix-contrast.js` ที่ regex theme ใน report-data — สีอยู่ที่ seeds.json ที่เดียว) — **ลบโค้ดจำนวนมาก** เป็นตัวชี้วัดความสำเร็จ

## 11. ลำดับการทำ (phase — แต่ละ phase merge ได้เอง ไม่พังของเดิม)

| Phase | ส่งมอบ | เกณฑ์จบ |
|---|---|---|
| P1 แกน | `schema.js` `compute.js` `prose.js` `io.js` + unit test (สูตร/ปัดตรง v2 `derive()` ทุก token) | test ผ่าน · compute ของ 10 ใบตัวอย่าง = ค่าที่ v2 render ได้ |
| P2 render | `_template/v3/render.js` + build dual-path + freshHash v3 · `reports.json.file` ของใบ v3 ยังเป็น `<SYM>.html` (ชื่อใน dist — ไม่งั้น url พัง) · theme จาก seeds.json | render ใบตัวอย่าง DOM เทียบ skeleton ผ่าน · หน้าตาเหมือนเดิม (screenshot 3 ใบ) |
| P3 gate = **Plan 2a** | **ส่วนขยาย schema §3.6 (A–O) + กติกา B ใหม่ §4** + P3 gate: `check-v3.js` (E50/E51/E52/W30/W31) + self-test แบบ mutate JSON · **ไม่มีผลกับ production** (tripwire คงอยู่) | ทุก code ในตาราง §9 มีบ้าน · self-test ครบ · corpus parity 909/909 · เกณฑ์ fixture ใบจริงใน §12 |
| P4a infrastructure = **Plan 2b** | **ไม่มีผลกับ production** (tripwire คงอยู่ · dist byte-identical): `tools/report-source.js` (§6.5) → แปลง scanner 16 ตัวผ่าน helper (แบตช์ตาม runtime: verify-path tests / queue tools / cron-adjacent / misc · แต่ละแบตช์จบด้วย dist diff = 0) → `report.js` CLI (§6.1 · + `.work/` ใน .gitignore) + prep sidecar (§6.4) → กติกา gate (`{{rd:` · sentinel `TODO` · `semanticErrors()` · `stage:'save'` §9) → ไฟล์ hook (script + settings snippet ให้เจ้าของ paste §6.2) | test ผ่านทั้งหมด · dist ไม่เปลี่ยนแม้ byte เดียว · hook พิสูจน์ใน `claude -p` process ใหม่ (deny ชนะ rtk hook) |
| P4b ใช้จริงครั้งแรก = **Plan 2c** | แก้เอกสาร worker (stock-analyzer SKILL มี **หัวข้อ v3 NEW แยกเฉพาะ** ไม่ใช่ if/else ไล่ 68 จุด · บรรทัดสำคัญที่สุด = `npm test -- SYM` → `node test/check-v3.js SYM` · agent-prompt / stock-controller / CLAUDE.md §2/§10) → **ถอด tripwire เป็น commit สุดท้ายก่อน exit** → NEW 2 ใบจริง (TH+US) ผ่าน `report.js save` แล้ว publish · **commit เอกสารก่อน spawn worker** (CLAUDE.md inject เป็น snapshot ตอนเริ่ม session) · exit worker **pin `model:"opus"`** (`analyze-wave` default = sonnet) · หุ้น exit เลือกโดย: ตรวจ exclusions (memory completed-backlogs + delisted-stocks) ก่อน → `npm run queue -- prep` ผู้สมัคร 2 อันดับแรกต่อตลาด → ผ่าน CROSS-VERIFY + **กับดักข้อมูลน้อยที่สุด** ชนะ (prep ตัดสิน ไม่ใช่การถกเถียง) | NEW 2 ใบ (TH+US) จริง publish ผ่าน `report.js save` end-to-end โดย worker **Opus** (เจ้าของสั่งให้ subagent ของโปรเจกต์นี้เป็น Opus ทั้งหมดแล้ว) · verify ผ่าน |
| P5 cron | สาย v3 ใน update-prices + `range52w` · **เส้นตายแข็ง = วัน merge Plan 2c + 45 วัน** (open-item #62 — ราคาใบ v3 แช่แข็งจนกว่า P5 · W09 ที่ 45 วัน · E27 ที่ 120 วันล้ม verify ทั้ง repo) · ห้ามรวมเข้า 2b/2c | dry-run บนใบ v3 ทั้งหมด = ไม่มี diff นอก market · รอบจริง 3 วันไม่มี patch-rejected ผิดปกติ |
| P6 migrate | `migrate-v3.js` + รายงาน 3 ถัง · migrate CLEAN เป็นแบตช์ (เสนอยกเว้นกฎ §5 "1 commit = 1 หุ้น" เป็น commit ละ 50 ใบ เพราะเป็นงาน mechanical — รอเจ้าของอนุมัติ §13 ข้อ 1) | CLEAN+VALUE-DRIFT ย้ายหมด · รายชื่อ HUMAN ส่งเจ้าของ |
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

1. **commit ของ migration**: ถัง `CLEAN` = commit ละ 50 ใบ (mechanical ไม่เปลี่ยนตัวเลขที่เห็น) · ถัง `VALUE-DRIFT` และ `HUMAN` = **1 commit = 1 หุ้น** ตาม §5 เดิม (ตัวเลขบนเว็บเปลี่ยน → ต้องย้อน/ไล่ได้รายตัว) · message `migrate: v3 <SYM…>`
2. **แคตตาล็อกการ์ด section 1**: controller ร่างใน P1 จากการจัดกลุ่ม label 1,526 แบบ (เป้า ~25 คีย์ครอบ ≥90% ของการ์ดในคลัง) → แนบตารางใน PR ของ P1 ให้เจ้าของดู · ไม่ block phase อื่น
3. **DCF**: สูตรมาตรฐาน 2-stage · ไม่ลง → `declared` · P6 วัดสัดส่วน DCF ที่ตกเป็น declared — **>10% ⇒ เพิ่ม 3-stage** ก่อน migrate ต่อ
4. **E17 นับเฉพาะขา `role:'fv'`** (§3.6 I) — ขา context ไม่ช่วยให้ครบ ≥2 ขา · ใบที่เหลือขา fv 1 ขา = ละเมิดชั้น 0 → เข้าถัง **HUMAN** ตอน migrate (15 ใบ: EQIX APURE ARM CCJ CLS COHR CRWV DELTA ENTG EVR LEO MICRO MRNA POET RCAT) — *advisor อนุมัติเป็นคำตัดสินถาวร 24 ก.ย. 69 (เจ้าของมอบอำนาจอนุมัติให้ advisor)*
5. **`stock-meta.pe` = ราคา / EPS เสมอ** (1 ช่อง 1 ความหมาย) · REIT แสดง P/FFO ผ่านการ์ด/token `pffo` แทน (§3.6 J) · ผล: 5 ใบ (AMT DLR EQIX FRT O) ที่ v2 เก็บ P/FFO ไว้ใน `pe` จะเปลี่ยนตำแหน่งเรียงบน index — *advisor อนุมัติเป็นคำตัดสินถาวร 24 ก.ย. 69 (เจ้าของมอบอำนาจอนุมัติให้ advisor)*
6. **ขา context ที่ใช้ตัวคูณปัจจุบัน คำนวณได้ ไม่ต้อง `declared`** (advisor 24 ก.ย. 69 · กลับ R7 ของ Plan 2a บางส่วน): `role:'context'` + `multipleSource:'current'` = ถูกกติกา · ค่าขา ≡ ราคา จึงมีข้อมูลเดียวคือตัวคูณสด (ราคา ÷ ตัวตั้ง) ซึ่ง compute ทุกวัน · `declared` จะแช่แข็งตัวเลขผูกราคา (43 ขาตอน migrate ค้างทุกวัน = คลาสบัคที่โปรเจกต์นี้ปิด) · `'current'` ยังห้ามบนขา `role:'fv'` (W18 สมอตาย) · FCF-Gordon ของ ZTS ยัง `declared` (3 ใบ เจ้าของตัดสินแล้ว)
7. **|MOS| > 40% (ชั้น 0)** = ต้องมีขา `role:'fv'` อย่างน้อย 1 ขาที่ `family !== 'rg'` ยืนยัน · ไม่มี → W-code (warn — ชั้น 0 เป็นงานตรวจของ controller) · อยู่ใน check-v3 ของ Plan 2a
8. **Scanner ผ่าน helper เดียว** (§6.5): สร้าง `tools/report-source.js` **ก่อน** (`list(dir)` ครอบ `build.reportEntries` + ตรวจสองไฟล์ · `metaLite(sym)` · `renderedHtml(sym)`) แล้วแปลง scanner ทั้ง 16 ตัวผ่านมัน เป็นแบตช์ 3–4 รอบตาม runtime แต่ละแบตช์จบด้วย dist diff = 0 · `ship --prepatch` **fail closed** (path ใต้ `reports/` ที่ไม่ตรง regex `.html` = blocker + test) — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
9. **ราคาใบ v3 แช่แข็งจน P5 = ยอมรับ แต่ห้ามเงียบ**: `update-prices` exit ≠0 บน symbol v3 ("v3 cron = Plan 3") · `reportExists` รวม `.json` · open-item #62 = เส้นตาย P5 = merge 2c + 45 วัน · ไม่มี P5 ใน 2b/2c — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
10. **save กับ checkDoc = code path เดียว**: `checkDoc(doc, {stage:'save'})` ตัด `v2:E40` ตัวเดียว (log) ไม่มีอื่น · การรวม error ครบ (#52) อยู่**ใน** checkDoc ผ่าน `semanticErrors()` ก่อน compute · กติกา B ยังเรียกตอน save (R5) · merge `market` ก่อน validate (sidecar สำหรับ NEW · `.json` เดิมสำหรับ export) — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
11. **อินพุตของ init = sidecar `.queue/prep/<SYM>.json` เท่านั้น** (ไม่ regex `.md`) · `market` ไม่เข้า `.work/` · `init` ปฏิเสธเมื่อมี `.html` หรือ `.json` · `prep` ปฏิเสธ symbol v3 ("v3 UPDATE = Plan 3") · `export` ส่งเป็นคำสั่ง แต่ flow คิวของ v3 UPDATE = P6 — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
12. **Hook**: บล็อก Write/Edit/MultiEdit/NotebookEdit บน **ทุก** `reports/*` + รูปแบบเขียนของ Bash · fail-open เมื่อ hook error · เจ้าของ paste settings snippet เอง · พิสูจน์ใน `claude -p` ใหม่ · `git mv`/`rm` ผ่าน · test พิสูจน์ว่า deny ชนะ rtk hook ระดับ user · `_sig`/E50 = ตัวบังคับจริง — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
13. **`{{rd:` และ `TODO`/placeholder = กติกา gate** (E51 ใน schema + เคส self-test ของ check-v3) ไม่ใช่เฉพาะ save · **ก่อนเพิ่มกติกา `{{rd:`**: grep `test/fixtures/v3/*.json` — เจอ = บั๊ก fixture แก้ผ่าน `IO.write` — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
14. **เอกสาร worker (2c)**: หัวข้อ v3 NEW แยกเฉพาะ ไม่ใช่ if/else ไล่ 68 บรรทัด · บรรทัดสำคัญที่สุด = handoff `npm test -- SYM` → `node test/check-v3.js SYM` (M1) · **ไม่ regenerate prep 909 ไฟล์** (ทั้งหมดเป็น UPDATE) — สร้าง NEW prep ใหม่เฉพาะหุ้น exit — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
15. **หุ้น exit (2c)**: ตรวจผู้สมัครกับ memory completed-backlogs + delisted-stocks ก่อน → `npm run queue -- prep` 2 อันดับแรกต่อตลาด → ตัวตัดสิน = กับดักแหล่งข้อมูลน้อยที่สุด (M-CHAI > ICC ในเกณฑ์นี้ · OGE ใช้ได้ — กำไรพิเศษ FY2022 เป็นการใช้ `medianWindow` ที่ถูกต้อง) · prep ตัดสิน ไม่ใช่การถกเถียง — *advisor 24 ก.ย. 69 (เจ้าของมอบอำนาจ)*
