# Report v3 — Plan 1: Core (schema/compute/prose/io) + Render + Dual-path Build

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `reports/<SYM>.json` (v3) file renders through the existing build into a page identical in structure to a v2 page, alongside the 909 existing v2 `.html` reports, with every derived number computed from one JSON source.

**Architecture:** Pure modules under `tools/v3/` (schema → legs → compute → prose → cards → io). `_template/v3/render.js` turns `(doc, view)` into an **in-memory v2-shaped content-only source** (stock-meta + report-data v2 + `{{rd:…}}` tokens + TEMPLATE markers), so everything downstream — `expandReport`, `decorateReport`, `injectTA`, `extractMeta/Metrics`, `dashboard.css`, `engine.js`, and the whole v2 gate `checkHtml` — runs unchanged. That gives the v3 render a full-strength acceptance test for free: **a rendered v3 fixture must pass the existing v2 gate with zero errors.**

**Tech Stack:** Node ≥20.19, no dependencies (repo rule). Tests are plain Node scripts with an assert counter (repo convention, see `test/report-values-test.js`).

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` (read §2, §3, §3.1–3.5, §4, §5, §8).

**Roadmap (later plans, written after this one merges — they depend on what P1 measures):**
- Plan 2 = spec P3 + P4 — `check-v3.js`, JSON self-test, `E50`/`E51`/`E52`/`W30`/`W31`, PreToolUse hook, `tools/report.js` CLI (`init/export/save/show/diff`), `.work/` in `.gitignore`, and the worker docs (SKILL/agent-prompt/stock-controller/CLAUDE.md).
- Plan 3 = spec P5 + P6 — cron v3 path + `range52w`, then `migrate-v3.js` with its 3 buckets and the colour channel.
- Plan 4 = spec P7 — cutover and deletion of the v2 path.

## Execution Notes (subagent-driven)

- Work in a **git worktree** branched from `design/report-v3-json-source` (Task 10/11 run `npm run build` and `gen-docs`, which touch `dist/` and CLAUDE.md).
- Every implementer is pinned to **`model: sonnet`** (CLAUDE.md §3.2). Every implementer prompt carries these standing prohibitions: **no push** · **no direct `advisor` call** · **never edit `test/check-reports.js` or any gate/`RV.*`/`DV.*` formatter to make a v3 test pass** · **never write under `reports/`**.
- The reviewer for each task can be Opus. Reviewers of **Task 5** (corpus) and **Task 9** (full gate) must show the test *can* fail: mutate one value, watch it go red, then revert.

## Global Constraints

- No npm dependencies. Node ≥20.19. CommonJS (`'use strict'; require`) like every file in `tools/`.
- **Never** write to `reports/` in this plan. Fixtures live in `test/fixtures/v3/`. Nothing in this plan changes any published page.
- Number formatting must be **byte-identical to v2**: reuse `RV.fmtPrice`, `RV.fmtBig`, `DV.fmtMos`, `RV.annualChg`, `RV.derive` (tools/report-values.js, tools/derived-values.js). Never re-implement rounding.
- `tools/v3/*` must not `require` `build.js`, `tools/update-prices.js` or `test/check-reports.js` (cycle rule from `tools/report-values.js:8`). `build.js` may require `tools/v3/*`.
- Currency symbol: `USD → '$'`, `THB → '฿'` (`RV.CUR_SYMBOL`).
- Percent inputs are in **percent units** (`g: 8` means 8%). Money inputs are per-share unless named `fcf`/`revenue`/`ebitda`/`netIncome`/`netDebt` (whole-company, reporting currency units).
- Dates stored as ISO `YYYY-MM-DD` (CE). Display follows `doc.dateEra` via `PD.renderThaiDate`.
- Theme: `meta.themeLegacy` (8 keys) if present, else `makeTheme(seeds[symbol])`; `chgBg/chgColor` from chart direction; `badge` default (spec §3.5).
- Commit after every task, on branch `design/report-v3-json-source`. Trailer lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Use `rtk proxy <cmd>` for any command whose output you count or compare (the rtk hook truncates output otherwise).

## Review Focus

1. **Legs that cannot price** (r ≤ g in DDM/DCF/justified P/BV, negative equity value, missing fundamentals) → a thrown `Error` whose message names the JSON path (`legs[1].inputs.r`) — never `NaN`/`Infinity` reaching the page. Pinned in Task 3.
2. **Gauge scale ordering** when the analyst target is above `fvHigh` or absent → scale spans rendered in ascending value order so E26 stays green. Pinned in Task 9.
3. **Prose containing `<`, `&`, or HTML** → escaped except `<b> <i> <br>` and `**bold**`; `<script>`/attributes never survive. Pinned in Task 6.
4. **Loss-making company** (`eps ≤ 0`) → the `pe` card and `{{pe}}` token are rejected with a path-named error instead of rendering "−12.3x". Pinned in Task 7.
5. **A symbol present as both `reports/X.html` and `reports/X.json`** → build fails loudly naming the symbol. Pinned in Task 10.

---

## File Structure

| Path | Responsibility |
|---|---|
| `tools/v3/scale.js` | `niceBounds` + `num4` (moved verbatim from `tools/update-prices.js:92,242`) |
| `tools/v3/schema.js` | Enums, the closed v3 schema, `validate(doc) → [{path,msg}]` |
| `tools/v3/legs.js` | Valuation formulas: `legValue(leg, fundamentals, path) → number` |
| `tools/v3/compute.js` | `compute(doc, {seeds}) → view` — every derived value, the v2 `rd`/`sm` bridge, theme |
| `tools/v3/prose.js` | Token table, `renderProse`, sanitizer, `checkRuleB`, `countMoneyLiterals` |
| `tools/v3/cards.js` | Section-1 card catalogue: label / value / auto base line (`.d`) |
| `tools/v3/io.js` | Canonical JSON, `_sig`, `freshHash`, `read`, `write` (atomic + lock) |
| `tools/v3/card-census.js` | CLI: clusters the 1,526 existing card labels → markdown for the owner (spec §13.2) |
| `_template/v3/render.js` | `toV2Source(doc, view) → string` (in-memory v2-shaped content-only HTML) |
| `test/v3/_t.js` | Tiny assert helper |
| `test/v3/*.test.js` | One test file per module |
| `test/v3-test.js` | Runner (requires every `test/v3/*.test.js`) |
| `test/fixtures/v3/ZTS.json`, `BBL.json` | US + TH fixtures |
| `build.js` (modify) | Dual path: `.json` → compute → toV2Source → existing pipeline; collision guard; v3 freshHash |
| `tools/update-prices.js` (modify) | Import `niceBounds`/`num4` from `tools/v3/scale.js` |
| `package.json` (modify) | `test:v3` + add to `verify` |

---

### Task 1: Move `niceBounds` to `tools/v3/scale.js` + test helper

**Files:**
- Create: `tools/v3/scale.js`, `test/v3/_t.js`, `test/v3/scale.test.js`, `test/v3-test.js`
- Modify: `tools/update-prices.js:92` (num4) and `:242-266` (niceBounds)

**Interfaces:**
- Produces: `require('./tools/v3/scale.js') → { niceBounds(values:number[], fairLine:number|null) → {min,max,grid:number[]}, num4(v) → number }`; `require('./test/v3/_t.js')(name) → t` with `t(cond,msg)`, `t.eq(a,b,msg)`, `t.near(a,b,tol,msg)`, `t.throws(fn,regex,msg)`, `t.done()`.

- [ ] **Step 1: Write the test helper and runner**

`test/v3/_t.js`:
```js
'use strict';
// assert counter แบบเดียวกับ test/report-values-test.js — หนึ่ง instance ต่อไฟล์ test
module.exports = function makeT(name) {
  let n = 0, fails = 0;
  const t = (c, m) => { n++; if (!c) { fails++; console.error('✗ [' + name + '] ' + m); } };
  t.eq = (a, b, m) => t(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  t.near = (a, b, tol, m) => t(typeof a === 'number' && Math.abs(a - b) <= tol, `${m}: got ${a} want ${b}±${tol}`);
  t.throws = (fn, re, m) => {
    try { fn(); t(false, m + ': did not throw'); }
    catch (e) { t(re.test(e.message), `${m}: wrong error "${e.message}"`); }
  };
  t.done = () => { console.log(`${fails ? '✗' : '✓'} ${name}: ${n - fails}/${n}`); if (fails) process.exitCode = 1; };
  return t;
};
```

`test/v3-test.js`:
```js
'use strict';
// รัน test ทุกไฟล์ของ v3 ใน process เดียว — แต่ละไฟล์ตั้ง process.exitCode = 1 เองเมื่อพัง
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'v3');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.test.js')).sort()) require(path.join(dir, f));
```

- [ ] **Step 2: Write the failing test**

`test/v3/scale.test.js`:
```js
'use strict';
const t = require('./_t.js')('scale');
const S = require('../../tools/v3/scale.js');
const UP = require('../../tools/update-prices.js');

t(UP.niceBounds === S.niceBounds, 'update-prices re-exports the same niceBounds function');
const b = S.niceBounds([150, 160, 188], 195);
t.eq(b, UP.niceBounds([150, 160, 188], 195), 'same result through both paths');
t(b.min < 150 && b.max > 195 && b.grid.length >= 1 && b.grid.length <= 5, 'bounds cover data + fair line, ≤5 grid lines');
t.eq(S.num4(0.1 + 0.2), 0.3, 'num4 strips float noise');
t.done();
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../tools/v3/scale.js'`.

- [ ] **Step 4: Create `tools/v3/scale.js` by moving the code verbatim**

Cut `const num4 = …` (tools/update-prices.js:92) and `function niceBounds…` (tools/update-prices.js:242–266, the whole function) into:
```js
'use strict';
/**
 * scale.js — ขอบเขตแกน + gridline "สวย" ของกราฟ/เกจ (ย้ายจาก tools/update-prices.js ทั้งตัว ไม่แก้ตรรกะ)
 * เจ้าของเดียว: cron (fetch chart) และ v3 compute (chart/gauge bounds) ใช้ฟังก์ชันนี้ตัวเดียวกัน
 */
const num4 = (v) => +v.toFixed(6); // ตัดเศษ float ก่อนลง JSON

// ขอบเขต + gridline สวย ๆ ครอบข้อมูล + เส้น fair value
function niceBounds(values, fairLine) {
  /* ← paste the original body of niceBounds here, unchanged */
}

module.exports = { niceBounds, num4 };
```
Paste the **original body unchanged** (copy it from the file, don't retype it). In `tools/update-prices.js`, replace the two removed definitions with one line near the other requires:
```js
const { niceBounds, num4 } = require('./v3/scale.js');   // ย้ายไป tools/v3/scale.js (v3 compute ใช้ร่วม)
```
Keep `niceBounds` in update-prices' `module.exports` (it now re-exports the imported function).

- [ ] **Step 5: Run the tests**

Run: `node test/v3-test.js && node test/update-prices-test.js`
Expected: `✓ scale: 4/4`, and update-prices-test passes as before.

- [ ] **Step 6: Commit**

```bash
git add tools/v3/scale.js tools/update-prices.js test/v3/_t.js test/v3/scale.test.js test/v3-test.js
git commit -m "refactor(v3): move niceBounds/num4 to tools/v3/scale.js (shared with v3 compute)"
```

---

### Task 2: `tools/v3/schema.js` — closed schema + `validate`

**Files:**
- Create: `tools/v3/schema.js`, `test/v3/schema.test.js`

**Interfaces:**
- Produces:
  - `ENUM` (object of arrays, below)
  - `FUND_KEYS` (array of fundamentals keys)
  - `LEG_INPUTS` (`{method: {req:[...], opt:[...]}}`)
  - `OVERRIDE_KEYS` (array)
  - `validate(doc) → Array<{path:string, msg:string}>` (empty = valid)
  - `OWNER(path) → 'cron'|'io'|'worker'`

- [ ] **Step 1: Write the failing test**

`test/v3/schema.test.js`:
```js
'use strict';
const t = require('./_t.js')('schema');
const S = require('../../tools/v3/schema.js');
const base = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
const paths = (errs) => errs.map((e) => e.path);

t.eq(S.validate(base()), [], 'fixture ZTS is valid');
t.eq(S.validate(JSON.parse(JSON.stringify(require('../fixtures/v3/BBL.json')))), [], 'fixture BBL is valid');

{ const d = base(); d.surprise = 1; t(paths(S.validate(d)).includes('surprise'), 'unknown top-level key rejected'); }
{ const d = base(); d.fundamentals.epsx = 1; t(paths(S.validate(d)).includes('fundamentals.epsx'), 'unknown fundamentals key rejected'); }
{ const d = base(); d.legs[0].method = 'magic'; t(paths(S.validate(d)).includes('legs[0].method'), 'method enum'); }
{ const d = base(); d.legs[0].inputs.multipleSource = 'current'; t(paths(S.validate(d)).includes('legs[0].inputs.multipleSource'), 'current multiple is not a legal source (dead anchor)'); }
{ const d = base(); delete d.legs[0].inputs.multiple; t(paths(S.validate(d)).includes('legs[0].inputs.multiple'), 'required leg input'); }
{ const d = base(); d.legs = [d.legs[0]]; t(paths(S.validate(d)).includes('legs'), 'needs ≥2 legs'); }
{ const d = base(); d.fvWeights = [0.7, 0.7]; t(paths(S.validate(d)).includes('fvWeights'), 'weights must sum to 1'); }
{ const d = base(); d.legs[0].override = { eps: 7 }; t(paths(S.validate(d)).includes('legs[0].override.why'), 'override needs why'); }
{ const d = base(); d.scenarios.cases.pop(); t(paths(S.validate(d)).includes('scenarios.cases'), 'exactly 3 cases'); }
{ const d = base(); d.catalysts = ['a', 'b']; t(paths(S.validate(d)).includes('catalysts'), '3–8 catalysts'); }
{ const d = base(); d.extras = [1, 2, 3].map(() => ({ after: 'valuation', title: 'x', headers: ['a'], rows: [['b']] })); t(paths(S.validate(d)).includes('extras'), '≤2 extras'); }
{ const d = base(); d.meta.aiModel = 'GPT 5'; t(paths(S.validate(d)).includes('meta.aiModel'), 'ai model format'); }
{ const d = base(); d.market.px = -1; t(paths(S.validate(d)).includes('market.px'), 'px > 0'); }
{ const d = base(); d.metrics.cards.push('nope'); t(paths(S.validate(d)).includes('metrics.cards[12]'), 'card key must be in catalogue list'); }
t.eq(S.OWNER('market.px'), 'cron', 'market is cron-owned');
t.eq(S.OWNER('_sig'), 'io', '_sig is io-owned');
t.eq(S.OWNER('legs[0].inputs.multiple'), 'worker', 'rest is worker-owned');
t.done();
```

- [ ] **Step 2: Write the two fixtures** (they are also used by Tasks 4–10)

`test/fixtures/v3/ZTS.json`:
```json
{
  "v": 3,
  "symbol": "ZTS", "currency": "USD", "region": "US", "dateEra": "BE",
  "meta": {
    "company": "Zoetis Inc.", "exchange": "NYSE",
    "sub": "ผู้นำยาและวัคซีนสัตว์อันดับ 1 ของโลก • สัตว์เลี้ยง • ปศุสัตว์",
    "headerTags": ["Animal Health", "Pet Care & Livestock"],
    "analysisDate": "2026-09-20", "aiModel": "Claude Sonnet 5",
    "sources": ["StockAnalysis.com", "Yahoo Finance", "SEC 10-Q"],
    "priceNote": "StockAnalysis.com ตรงกับ Yahoo Finance",
    "themeLegacy": {"accent":"#31a60d","accentDark":"#23760a","darkGrad":"linear-gradient(135deg,#0a2202 0%,#195606 58%,#2c990a 140%)","glow":"rgba(70,236,19,.35)","subColor":"#dff3d9","headerMuted":"#e7f2e3","verdictText":"#dff3d8","vcellLabel":"#fbfdfb"}
  },
  "market": {
    "px": 120, "priceDate": "2026-09-23", "chgSuffix": "รอบปี",
    "chart": { "data": [["ก.ย. 68", 172.1], ["พ.ย. 68", 160.4], ["ม.ค. 69", 158.8], ["มี.ค. 69", 149.0], ["พ.ค. 69", 141.2], ["ก.ค. 69", 130.9], ["ก.ย. 69", 120.0]] },
    "range52w": { "lo": 118.5, "hi": 175.8 }
  },
  "fundamentals": {
    "eps": 6.13, "epsBasis": "gaap-ttm", "dps": 2.0, "bvps": 11.4, "shares": 443000000, "revenue": 9400000000,
    "netIncome": 2720000000, "roe": 52, "roa": 17, "netMargin": 27.6, "opMargin": 36, "beta": 0.9,
    "fcf": 2300000000, "netDebt": 5100000000, "peAvg5y": 34
  },
  "legs": [
    { "method": "pe", "label": "P/E มัธยฐาน 5 ปี (ส่วนลด)", "inputs": { "multiple": 28, "multipleSource": "median5y" },
      "note": "ใช้ P/E 28 เท่า ต่ำกว่ามัธยฐาน 5 ปี เพราะการเติบโตชะลอ" },
    { "method": "dcf", "label": "DCF 2 ช่วง", "inputs": { "g1": 7, "years1": 5, "tg": 3, "r": 8.5, "rfCurrency": "USD" },
      "note": "FCF ฐาน TTM โต 7% 5 ปี แล้วโตถาวร 3%" }
  ],
  "fvWeights": null,
  "metrics": {
    "cards": ["mcap", "pe", "peAvg5y", "pbv", "netIncome", "eps", "bvps", "roe", "revenue", "netMargin", "yield", "beta"],
    "notes": { "pe": "ต่ำกว่ามัธยฐานย้อนหลังชัดเจน" },
    "custom": [],
    "hint": "อัปเดตตามงบ Q2/2026"
  },
  "scenarios": {
    "years": 3, "divIncluded": true, "perYear": "cagr", "driver": "eps", "exitMetric": "pe",
    "cases": [
      { "growth": 2, "exitMultiple": 20, "divCum": 6.3, "desc": "ยอดสัตว์เลี้ยงชะลอ คู่แข่งยาใหม่" },
      { "growth": 8, "exitMultiple": 26, "divCum": 6.6, "desc": "โตตามอุตสาหกรรม" },
      { "growth": 12, "exitMultiple": 30, "divCum": 6.9, "desc": "ยาใหม่กลุ่ม dermatology โตแรง" }
    ],
    "note": "ราคาเป้าคิดจาก EPS ปีที่ 3 คูณ P/E ออก"
  },
  "analyst": { "target": 190, "n": 14, "rating": "Buy", "asOf": "2026-09-20" },
  "prose": {
    "chart": "ราคาปรับลงจากต้นปีก่อนฟื้นช่วงไตรมาสล่าสุด ปัจจุบัน {{px}}",
    "valuation": "สองวิธีให้ค่าใกล้กัน มูลค่าเหมาะสม {{fv}}",
    "gauge": "ราคา {{px}} ต่ำกว่ามูลค่าเหมาะสม {{fv}} อยู่ {{mos}}",
    "mos": "ส่วนเผื่อความปลอดภัย {{mos}} — น่าสนใจ",
    "verdictHeadline": "ถูกกว่ามูลค่า — ธุรกิจคุณภาพสูง",
    "verdictBody": "ราคา {{px}} เทียบมูลค่าเหมาะสม {{fv}}",
    "strategy": "ทยอยสะสมใต้ {{mos20}}",
    "disclaimerSources": "ที่มางบ: SEC 10-Q · ราคา: Yahoo Finance"
  },
  "catalysts": ["<b>ยาใหม่:</b> Librela ขยายตลาด", "<b>ราคาขาย:</b> ปรับขึ้นได้ต่อเนื่อง", "<b>กระแสเงินสด:</b> แข็งแรง ซื้อหุ้นคืน"],
  "risks": ["<b>ความปลอดภัยยา:</b> ข่าวผลข้างเคียง", "<b>คู่แข่ง:</b> ยา generic", "<b>เศรษฐกิจ:</b> ค่าใช้จ่ายสัตว์เลี้ยงลดลง"],
  "extras": []
}
```

`test/fixtures/v3/BBL.json`:
```json
{
  "v": 3,
  "symbol": "BBL", "currency": "THB", "region": "TH", "dateEra": "BE",
  "meta": {
    "company": "ธนาคารกรุงเทพ", "exchange": "SET",
    "sub": "ธนาคารพาณิชย์ใหญ่สุดด้านสินทรัพย์ • ลูกค้าธุรกิจ • ต่างประเทศ",
    "headerTags": ["Financials • Banking"],
    "analysisDate": "2026-09-20", "aiModel": "Claude Sonnet 5",
    "sources": ["SET", "Yahoo Finance", "งบการเงิน Q2/2569"],
    "themeLegacy": {
      "accent": "#0071e3", "accentDark": "#0058b9",
      "darkGrad": "linear-gradient(135deg,#0a2540 0%,#123a63 55%,#1a4f86 140%)",
      "glow": "rgba(110,160,220,.35)", "subColor": "#c7cbd4", "headerMuted": "#b3b8c2",
      "verdictText": "#d4d6dd", "vcellLabel": "#c4c7cf"
    }
  },
  "market": {
    "px": 188, "priceDate": "2026-09-23", "chgSuffix": "รอบปี",
    "chart": { "data": [["ก.ย. 68", 150], ["ธ.ค. 68", 160], ["มี.ค. 69", 170], ["มิ.ย. 69", 176], ["ก.ย. 69", 188]] }
  },
  "fundamentals": {
    "eps": 21.7, "epsBasis": "gaap-ttm", "dps": 12, "bvps": 260, "shares": 1909000000, "revenue": 140000000000,
    "netIncome": 41400000000, "roe": 8.4, "roa": 0.9, "beta": 0.8, "peAvg5y": 8.5
  },
  "legs": [
    { "method": "pe", "label": "P/E มัธยฐาน 5 ปี", "inputs": { "multiple": 8.5, "multipleSource": "median5y" }, "note": "มัธยฐาน 5 ปี" },
    { "method": "ddm", "label": "DDM", "inputs": { "g": 3, "r": 9.5 }, "note": "ปันผลโตตามกำไร" },
    { "method": "pbv", "label": "Justified P/BV", "inputs": { "g": 3, "r": 9.5 }, "note": "ROE ปัจจุบัน" }
  ],
  "fvWeights": null,
  "metrics": {
    "cards": ["mcap", "pe", "peAvg5y", "pbv", "netIncome", "eps", "bvps", "roe", "revenue", "yield", "beta"],
    "notes": {}, "custom": [{ "label": "NIM", "value": "3.1%", "note": "ทรงตัว" }]
  },
  "scenarios": {
    "years": 3, "divIncluded": true, "perYear": "cagr", "driver": "eps", "exitMetric": "pe",
    "cases": [
      { "growth": 0, "exitMultiple": 7, "divCum": 36, "desc": "สินเชื่อไม่โต" },
      { "growth": 4, "exitMultiple": 8.5, "divCum": 38, "desc": "ฐาน" },
      { "growth": 7, "exitMultiple": 10, "divCum": 40, "desc": "ดอกเบี้ยขาขึ้น" }
    ],
    "note": "รวมปันผล 3 ปี"
  },
  "analyst": null,
  "prose": {
    "chart": "ราคาขึ้นต่อเนื่องทั้งปี ปัจจุบัน {{px}}",
    "valuation": "สามวิธีเฉลี่ยได้ {{fv}}",
    "gauge": "ราคาใกล้มูลค่าเหมาะสม",
    "mos": "ส่วนเผื่อ {{mos}} ยังไม่พอ",
    "verdictHeadline": "ราคาเหมาะสม — รอจังหวะ",
    "verdictBody": "ปันผลดี แต่ส่วนลดน้อย",
    "strategy": "รอราคาใกล้ {{mos20}}",
    "disclaimerSources": "ที่มางบ: SET · ราคา: Yahoo Finance"
  },
  "catalysts": ["<b>ดอกเบี้ย:</b> NIM ทรงตัว", "<b>ต่างประเทศ:</b> Permata โต", "<b>ปันผล:</b> สูง"],
  "risks": ["<b>NPL:</b> SME อ่อนแอ", "<b>ดอกเบี้ยลง:</b> NIM หด", "<b>เศรษฐกิจ:</b> ชะลอ"],
  "extras": []
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../tools/v3/schema.js'`.

- [ ] **Step 4: Implement `tools/v3/schema.js`**

```js
'use strict';
/**
 * schema.js — สคีมา report v3 (reports/<SYM>.json) แบบ "ปิด": คีย์ที่ไม่รู้จัก = error เสมอ
 * validate() คืน error ครบทุกข้อในครั้งเดียว พร้อม JSON path (ไม่ all-or-nothing แบบ apply-edits BUG-005)
 * ★ ไม่เก็บค่าที่คำนวณได้ — fv/mos/pe/yield/mcap/ราคาเป้าฉาก/สี gdots ฯลฯ มาจาก compute.js ตอน build
 * spec: docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md §3
 */
const ENUM = {
  currency: ['USD', 'THB'], region: ['US', 'TH'], dateEra: ['BE', 'CE'], chgSuffix: ['รอบปี', 'ตั้งแต่ IPO'],
  epsBasis: ['gaap-ttm', 'adj-ttm', 'fy'],
  method: ['pe', 'pbv', 'ps', 'evsales', 'evebitda', 'pfcf', 'fcfyield', 'pffo', 'ddm', 'dcf', 'ri', 'declared'],
  multipleSource: ['median5y', 'median10y', 'peer', 'justified', 'sector'],   // ★ ไม่มี 'current' — สมอตาย (W18) ปิดโดยโครงสร้าง
  declaredBasis: ['sotp', 'nav', 'rnpv', 'other'],
  driver: ['eps', 'ffo', 'revenuePerShare', 'bvps', 'fcfPerShare'],
  exitMetric: ['pe', 'ps', 'pbv', 'pffo', 'pfcf'],
  perYear: ['cagr', 'linear', null],
  extrasAfter: ['metrics', 'valuation', 'scenarios', 'catalysts'],
};
// ต้องตรงกับคีย์ของ CATALOGUE ใน tools/v3/cards.js (test/v3/cards.test.js ตรวจว่าตรงกัน)
const CARD_KEYS = ['mcap', 'pe', 'peAvg5y', 'pbv', 'ps', 'netIncome', 'eps', 'bvps', 'roe', 'revenue', 'grossMargin',
  'netMargin', 'opMargin', 'yield', 'beta', 'range52w', 'fcf', 'debtToEquity'];
const FUND_KEYS = ['eps', 'epsBasis', 'dps', 'bvps', 'shares', 'revenue', 'netIncome', 'roe', 'roa', 'grossMargin', 'netMargin',
  'opMargin', 'beta', 'debtToEquity', 'fcf', 'ebitda', 'netDebt', 'peAvg5y', 'ffoPerShare'];
const MULT = ['multiple', 'multipleSource'];
const LEG_INPUTS = {
  pe: { req: MULT, opt: [] },
  pbv: { req: [], opt: ['multiple', 'multipleSource', 'g', 'r'] },   // multiple+source หรือ g+r (justified) — ตรวจคู่ด้านล่าง
  ps: { req: MULT, opt: [] }, evsales: { req: MULT, opt: [] }, evebitda: { req: MULT, opt: [] },
  pfcf: { req: MULT, opt: [] }, pffo: { req: MULT, opt: [] },
  fcfyield: { req: ['yield'], opt: [] },
  ddm: { req: ['g', 'r'], opt: [] },
  dcf: { req: ['g1', 'years1', 'tg', 'r', 'rfCurrency'], opt: [] },
  ri: { req: ['r', 'years', 'payout'], opt: [] },
  declared: { req: ['value', 'basis'], opt: ['extrasRef'] },
};
const OVERRIDE_KEYS = ['eps', 'bvps', 'roe', 'dps', 'revenue', 'ebitda', 'fcf', 'netDebt', 'ffoPerShare', 'shares', 'why'];
const THEME_KEYS = ['accent', 'accentDark', 'darkGrad', 'glow', 'subColor', 'headerMuted', 'verdictText', 'vcellLabel'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const AI = /^Claude\s+[A-Za-z]+\s+\d+(?:\.\d+)?$/;   // รูปเดียวกับ E28 / RM.parseAiModel

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

function validate(doc) {
  const errs = [];
  const E = (path, msg) => errs.push({ path, msg });
  const closed = (obj, path, allowed) => { for (const k of Object.keys(obj)) if (!allowed.includes(k)) E(path ? `${path}.${k}` : k, 'คีย์ไม่อยู่ในสคีมา v3'); };
  const num = (v, path, { req = true, min, gt, int } = {}) => {
    if (v == null) { if (req) E(path, 'ต้องมี (ตัวเลข)'); return; }
    if (!isNum(v)) return E(path, `ต้องเป็นตัวเลข — พบ ${JSON.stringify(v)}`);
    if (int && !Number.isInteger(v)) E(path, 'ต้องเป็นจำนวนเต็ม');
    if (gt != null && !(v > gt)) E(path, `ต้อง > ${gt}`);
    if (min != null && !(v >= min)) E(path, `ต้อง ≥ ${min}`);
  };
  const str = (v, path, { req = true, minLen = 1 } = {}) => {
    if (v == null) { if (req) E(path, 'ต้องมี (ข้อความ)'); return; }
    if (typeof v !== 'string' || v.trim().length < minLen) E(path, `ต้องเป็นข้อความยาว ≥${minLen}`);
  };
  const en = (v, path, list) => { if (!list.includes(v)) E(path, `ต้องเป็นหนึ่งใน ${JSON.stringify(list)} — พบ ${JSON.stringify(v)}`); };
  const strList = (v, path, lo, hi) => {
    if (!Array.isArray(v) || v.length < lo || v.length > hi) return E(path, `ต้องเป็น array ของข้อความ ${lo}–${hi} ข้อ`);
    v.forEach((x, i) => str(x, `${path}[${i}]`));
  };

  if (!isObj(doc)) return [{ path: '', msg: 'เอกสารต้องเป็น JSON object' }];
  closed(doc, '', ['v', 'symbol', 'currency', 'region', 'dateEra', 'meta', 'market', 'fundamentals', 'legs', 'fvWeights',
    'metrics', 'scenarios', 'analyst', 'prose', 'catalysts', 'risks', 'extras', '_sig']);
  if (doc.v !== 3) E('v', 'ต้องเป็น 3');
  if (!/^[A-Z0-9][A-Z0-9.\-]*$/.test(doc.symbol || '')) E('symbol', 'ต้องเป็นตัวพิมพ์ใหญ่/ตัวเลข/จุด/ขีด');
  en(doc.currency, 'currency', ENUM.currency);
  en(doc.region, 'region', ENUM.region);   // รหัสตลาด US/TH — ส่วน doc.market คือบล็อกราคาของ cron
  en(doc.dateEra, 'dateEra', ENUM.dateEra);

  // ── meta ──
  const m = doc.meta;
  if (!isObj(m)) E('meta', 'ต้องมี (object)');
  else {
    closed(m, 'meta', ['company', 'exchange', 'sub', 'headerTags', 'analysisDate', 'aiModel', 'sources', 'priceNote', 'themeLegacy']);
    str(m.company, 'meta.company'); str(m.exchange, 'meta.exchange'); str(m.sub, 'meta.sub', { minLen: 10 });
    if (m.headerTags != null) strList(m.headerTags, 'meta.headerTags', 0, 2);
    if (!ISO.test(m.analysisDate || '')) E('meta.analysisDate', 'ต้องเป็น ISO YYYY-MM-DD (ค.ศ.)');
    if (!AI.test(m.aiModel || '')) E('meta.aiModel', 'ต้องเป็นรูป "Claude <ตระกูล> <เวอร์ชัน>"');
    strList(m.sources, 'meta.sources', 3, 8);
    str(m.priceNote, 'meta.priceNote', { req: false });
    if (m.themeLegacy != null) {
      if (!isObj(m.themeLegacy)) E('meta.themeLegacy', 'ต้องเป็น object หรือ null');
      else { closed(m.themeLegacy, 'meta.themeLegacy', THEME_KEYS); for (const k of THEME_KEYS) str(m.themeLegacy[k], `meta.themeLegacy.${k}`); }
    }
  }
  /* (validation continues in Step 4b) */
  return errs;
}

// path → เจ้าของ: 'cron' เขียนได้เฉพาะ market.* · 'io' = _sig · ที่เหลือ worker (ผ่าน report.js save)
function OWNER(path) {
  if (path === '_sig') return 'io';
  if (path === 'market' || path.startsWith('market.')) return 'cron';
  return 'worker';
}

module.exports = { ENUM, CARD_KEYS, FUND_KEYS, LEG_INPUTS, OVERRIDE_KEYS, THEME_KEYS, validate, OWNER };
```

**Naming note:** the spec draft used `market` for both the exchange code and the cron price block. v3 uses **`region`** (`"US"|"TH"`) for the exchange code and **`market`** only for the cron-owned price block — the code and fixtures above already follow this.

- [ ] **Step 4b: Finish `validate` — append these blocks before `return errs;`**

```js
  // ── market (cron) ──
  const mk = doc.market;
  if (!isObj(mk)) E('market', 'ต้องมี (object)');
  else {
    closed(mk, 'market', ['px', 'priceDate', 'chgSuffix', 'chart', 'range52w']);
    num(mk.px, 'market.px', { gt: 0 });
    if (!ISO.test(mk.priceDate || '')) E('market.priceDate', 'ต้องเป็น ISO YYYY-MM-DD');
    en(mk.chgSuffix, 'market.chgSuffix', ENUM.chgSuffix);
    const c = mk.chart;
    if (!isObj(c)) E('market.chart', 'ต้องมี (object)');
    else {
      closed(c, 'market.chart', ['data', 'gridFmt', 'dataFmt']);
      if (!Array.isArray(c.data) || c.data.length < 2 || c.data.length > 13) E('market.chart.data', 'ต้องเป็น array 2–13 จุด (~1 ปี · E37)');
      else c.data.forEach((p, i) => {
        if (!Array.isArray(p) || p.length !== 2 || !isStr(p[0]) || /[<>]/.test(p[0]) || !isNum(p[1]) || p[1] <= 0) E(`market.chart.data[${i}]`, 'ต้องเป็น ["label", ราคา>0] และ label ห้ามมี < >');
      });
      str(c.gridFmt, 'market.chart.gridFmt', { req: false }); str(c.dataFmt, 'market.chart.dataFmt', { req: false });
    }
    if (mk.range52w != null) {
      if (!isObj(mk.range52w)) E('market.range52w', 'ต้องเป็น {lo, hi}');
      else { closed(mk.range52w, 'market.range52w', ['lo', 'hi']); num(mk.range52w.lo, 'market.range52w.lo', { gt: 0 }); num(mk.range52w.hi, 'market.range52w.hi', { gt: 0 });
        if (isNum(mk.range52w.lo) && isNum(mk.range52w.hi) && mk.range52w.hi < mk.range52w.lo) E('market.range52w', 'hi ต้อง ≥ lo'); }
    }
  }

  // ── fundamentals ──
  const f = doc.fundamentals;
  if (!isObj(f)) E('fundamentals', 'ต้องมี (object)');
  else {
    closed(f, 'fundamentals', FUND_KEYS);
    for (const k of FUND_KEYS) if (k !== 'epsBasis' && f[k] != null) num(f[k], `fundamentals.${k}`);
    if (f.eps != null) en(f.epsBasis, 'fundamentals.epsBasis', ENUM.epsBasis);
    if (f.shares != null) num(f.shares, 'fundamentals.shares', { min: 1e5 });
  }

  // ── legs ──
  if (!Array.isArray(doc.legs) || doc.legs.length < 2 || doc.legs.length > 4) E('legs', 'ต้องมี 2–4 ขา (E17)');
  else doc.legs.forEach((leg, i) => {
    const p = `legs[${i}]`;
    if (!isObj(leg)) return E(p, 'ต้องเป็น object');
    closed(leg, p, ['method', 'label', 'inputs', 'override', 'note']);
    en(leg.method, `${p}.method`, ENUM.method);
    str(leg.label, `${p}.label`); str(leg.note, `${p}.note`, { req: false });
    const spec = LEG_INPUTS[leg.method];
    if (!spec) return;
    if (!isObj(leg.inputs)) return E(`${p}.inputs`, 'ต้องมี (object)');
    closed(leg.inputs, `${p}.inputs`, spec.req.concat(spec.opt));
    for (const k of spec.req) if (leg.inputs[k] == null) E(`${p}.inputs.${k}`, 'ต้องมี');
    const inp = leg.inputs;
    if (inp.multipleSource != null) en(inp.multipleSource, `${p}.inputs.multipleSource`, ENUM.multipleSource);
    for (const k of ['multiple', 'g', 'r', 'g1', 'tg', 'yield', 'value', 'payout']) if (inp[k] != null) num(inp[k], `${p}.inputs.${k}`);
    for (const k of ['years1', 'years']) if (inp[k] != null) num(inp[k], `${p}.inputs.${k}`, { int: true, min: 1 });
    if (inp.multiple != null && !(inp.multiple > 0)) E(`${p}.inputs.multiple`, 'ต้อง > 0');
    if (leg.method === 'pbv') {
      const mult = inp.multiple != null || inp.multipleSource != null, just = inp.g != null || inp.r != null;
      if (mult === just) E(`${p}.inputs`, 'pbv ใช้ได้ทางเดียว: {multiple, multipleSource} หรือ {g, r} (justified)');
      if (mult && (inp.multiple == null || inp.multipleSource == null)) E(`${p}.inputs`, 'pbv แบบ multiple ต้องมีทั้ง multiple และ multipleSource');
      if (just && (inp.g == null || inp.r == null)) E(`${p}.inputs`, 'pbv แบบ justified ต้องมีทั้ง g และ r');
    }
    if (leg.method === 'dcf' && inp.rfCurrency != null && inp.rfCurrency !== doc.currency) E(`${p}.inputs.rfCurrency`, `rf ต้องสกุลเดียวกับกระแสเงินสด (${doc.currency}) — ชั้น 0`);
    if (leg.method === 'declared') {
      en(inp.basis, `${p}.inputs.basis`, ENUM.declaredBasis);
      if (inp.value != null && !(inp.value > 0)) E(`${p}.inputs.value`, 'ต้อง > 0');
      if (inp.extrasRef != null) num(inp.extrasRef, `${p}.inputs.extrasRef`, { int: true, min: 0 });
    }
    if (leg.override != null) {
      if (!isObj(leg.override)) E(`${p}.override`, 'ต้องเป็น object');
      else {
        closed(leg.override, `${p}.override`, OVERRIDE_KEYS);
        str(leg.override.why, `${p}.override.why`);
        for (const k of OVERRIDE_KEYS) if (k !== 'why' && leg.override[k] != null) num(leg.override[k], `${p}.override.${k}`);
      }
    }
  });
  if (doc.fvWeights != null) {
    const w = doc.fvWeights;
    if (!Array.isArray(w) || !Array.isArray(doc.legs) || w.length !== doc.legs.length || !w.every((x) => isNum(x) && x >= 0)
      || Math.abs(w.reduce((a, b) => a + b, 0) - 1) > 1e-6) E('fvWeights', 'ต้องเป็น null หรือ array ตัวเลข ≥0 ยาวเท่า legs และรวม = 1');
  }

  // ── metrics ──
  const mt = doc.metrics;
  if (!isObj(mt)) E('metrics', 'ต้องมี (object)');
  else {
    closed(mt, 'metrics', ['cards', 'notes', 'custom', 'hint']);
    if (!Array.isArray(mt.cards) || mt.cards.length < 4 || mt.cards.length > 16) E('metrics.cards', 'ต้องมี 4–16 การ์ด');
    else {
      mt.cards.forEach((k, i) => { if (!CARD_KEYS.includes(k)) E(`metrics.cards[${i}]`, `ไม่อยู่ในแคตตาล็อก (${CARD_KEYS.join(', ')}) — ข้อมูลเฉพาะธุรกิจใช้ metrics.custom`); });
      if (new Set(mt.cards).size !== mt.cards.length) E('metrics.cards', 'การ์ดซ้ำ');
    }
    if (mt.notes != null) {
      if (!isObj(mt.notes)) E('metrics.notes', 'ต้องเป็น object');
      else for (const [k, v] of Object.entries(mt.notes)) { if (!CARD_KEYS.includes(k)) E(`metrics.notes.${k}`, 'ไม่ใช่คีย์การ์ด'); str(v, `metrics.notes.${k}`); }
    }
    if (mt.custom != null) {
      if (!Array.isArray(mt.custom) || mt.custom.length > 4) E('metrics.custom', 'ต้องเป็น array ≤4');
      else mt.custom.forEach((c, i) => { closed(c, `metrics.custom[${i}]`, ['label', 'value', 'note']); str(c.label, `metrics.custom[${i}].label`); str(c.value, `metrics.custom[${i}].value`); str(c.note, `metrics.custom[${i}].note`, { req: false }); });
    }
    str(mt.hint, 'metrics.hint', { req: false });
  }

  // ── scenarios ──
  const s = doc.scenarios;
  if (!isObj(s)) E('scenarios', 'ต้องมี (object)');
  else {
    closed(s, 'scenarios', ['years', 'divIncluded', 'perYear', 'driver', 'exitMetric', 'baseOverride', 'cases', 'note']);
    num(s.years, 'scenarios.years', { int: true, min: 1 }); if (isNum(s.years) && s.years > 10) E('scenarios.years', 'ต้อง ≤ 10');
    if (typeof s.divIncluded !== 'boolean') E('scenarios.divIncluded', 'ต้องเป็น true/false');
    en(s.perYear === undefined ? '∅' : s.perYear, 'scenarios.perYear', ENUM.perYear);
    en(s.driver, 'scenarios.driver', ENUM.driver); en(s.exitMetric, 'scenarios.exitMetric', ENUM.exitMetric);
    if (s.baseOverride != null) { closed(s.baseOverride, 'scenarios.baseOverride', ['value', 'why']); num(s.baseOverride.value, 'scenarios.baseOverride.value', { gt: 0 }); str(s.baseOverride.why, 'scenarios.baseOverride.why'); }
    if (!Array.isArray(s.cases) || s.cases.length !== 3) E('scenarios.cases', 'ต้องมี 3 ฉากพอดี (Bear/Base/Bull)');
    else s.cases.forEach((c, i) => {
      const p = `scenarios.cases[${i}]`;
      closed(c, p, ['growth', 'exitMultiple', 'divCum', 'desc']);
      num(c.growth, `${p}.growth`); num(c.exitMultiple, `${p}.exitMultiple`, { gt: 0 }); str(c.desc, `${p}.desc`);
      if (s.divIncluded) num(c.divCum, `${p}.divCum`, { min: 0 });
      else if (c.divCum != null) E(`${p}.divCum`, 'divIncluded=false ห้ามมี divCum');
    });
    str(s.note, 'scenarios.note');
  }

  // ── analyst ──
  if (doc.analyst != null) {
    const a = doc.analyst;
    if (!isObj(a)) E('analyst', 'ต้องเป็น object หรือ null');
    else { closed(a, 'analyst', ['target', 'n', 'rating', 'asOf']); num(a.target, 'analyst.target', { gt: 0 }); num(a.n, 'analyst.n', { int: true, min: 1 });
      str(a.rating, 'analyst.rating'); if (!ISO.test(a.asOf || '')) E('analyst.asOf', 'ต้องเป็น ISO YYYY-MM-DD'); }
  }

  // ── prose / lists / extras ──
  const PROSE_REQ = ['chart', 'valuation', 'gauge', 'mos', 'verdictHeadline', 'verdictBody', 'strategy', 'disclaimerSources'];
  if (!isObj(doc.prose)) E('prose', 'ต้องมี (object)');
  else { closed(doc.prose, 'prose', PROSE_REQ); for (const k of PROSE_REQ) str(doc.prose[k], `prose.${k}`); }
  strList(doc.catalysts, 'catalysts', 3, 8);
  strList(doc.risks, 'risks', 3, 8);
  if (!Array.isArray(doc.extras) || doc.extras.length > 2) E('extras', 'ต้องเป็น array ≤2 ตาราง');
  else doc.extras.forEach((x, i) => {
    const p = `extras[${i}]`;
    if (!isObj(x)) return E(p, 'ต้องเป็น object');
    closed(x, p, ['after', 'title', 'headers', 'rows', 'sumCol', 'note']);
    en(x.after, `${p}.after`, ENUM.extrasAfter); str(x.title, `${p}.title`);
    if (!Array.isArray(x.headers) || !x.headers.every((h) => typeof h === 'string')) E(`${p}.headers`, 'ต้องเป็น array ของข้อความ (ว่างได้ = ตาราง note)');
    if (!Array.isArray(x.rows) || !x.rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === 'string' || isNum(c)))) E(`${p}.rows`, 'ต้องเป็น array ของแถว (cell = ข้อความหรือตัวเลข)');
    if (x.sumCol != null) {
      num(x.sumCol, `${p}.sumCol`, { int: true, min: 0 });
      if (Array.isArray(x.rows) && !x.rows.every((r) => isNum(r[x.sumCol]))) E(`${p}.sumCol`, 'คอลัมน์ผลรวมต้องเป็นตัวเลขทุกแถว');
    }
    str(x.note, `${p}.note`, { req: false });
  });
  if (doc._sig != null && !/^sha256:[0-9a-f]{64}$/.test(doc._sig)) E('_sig', 'รูปลายเซ็นไม่ถูกต้อง');
```
(`Array.isArray(doc.legs)` references for `extrasRef` range are checked in compute, Task 4, where `doc.extras` is known valid.)

- [ ] **Step 5: Run the tests**

Run: `node test/v3-test.js`
Expected: `✓ schema: 19/19` (plus scale). If a fixture is reported invalid, fix the **fixture**, not the schema — unless the error contradicts spec §3.

- [ ] **Step 6: Commit**

```bash
git add tools/v3/schema.js test/v3/schema.test.js test/fixtures/v3/
git commit -m "feat(v3): closed report schema with path-named validation errors"
```

---

### Task 3: `tools/v3/legs.js` — valuation formulas

**Files:**
- Create: `tools/v3/legs.js`, `test/v3/legs.test.js`

**Interfaces:**
- Consumes: a leg object that already passed `schema.validate`, plus `doc.fundamentals`.
- Produces: `legValue(leg, fundamentals, path='legs[i]') → number` (per-share value, reporting currency). It throws `Error` whose message starts with the path. `inputsOf(leg, fundamentals) → object` (fundamentals merged with the override).

- [ ] **Step 1: Write the failing test** (expected numbers pre-computed by hand, see `node -e` in the plan history)

`test/v3/legs.test.js`:
```js
'use strict';
const t = require('./_t.js')('legs');
const L = require('../../tools/v3/legs.js');
const f = { eps: 6.13, dps: 2, bvps: 11.4, roe: 52, shares: 4.43e8, revenue: 9.4e9, fcf: 2.3e9, ebitda: 4e9, netDebt: 5.1e9, ffoPerShare: 3.1 };
const v = (method, inputs, extra) => L.legValue({ method, label: 'x', inputs, ...(extra || {}) }, f, 'legs[0]');
const MS = { multipleSource: 'median5y' };

t.near(v('pe', { multiple: 28, ...MS }), 171.64, 1e-9, 'pe = eps × multiple');
t.near(v('ddm', { g: 5, r: 9 }), 52.5, 1e-9, 'ddm = dps(1+g)/(r−g)');
t.near(v('pbv', { g: 5, r: 9 }), 133.95, 1e-6, 'justified pbv = (roe−g)/(r−g) × bvps');
t.near(v('pbv', { multiple: 2, ...MS }), 22.8, 1e-9, 'pbv multiple');
t.near(v('evebitda', { multiple: 18, ...MS }), 151.01580135440182, 1e-6, 'ev/ebitda');
t.near(v('dcf', { g1: 7, years1: 5, tg: 3, r: 8.5, rfCurrency: 'USD' }), 104.0819097529678, 1e-6, 'dcf 2-stage');
t.near(v('ri', { r: 9, years: 5, payout: 0.4 }, { override: { roe: 20, why: 'normalised' } }), 17.477769043669788, 1e-6, 'residual income with override');
t.near(v('fcfyield', { yield: 4 }), 129.79683972911963, 1e-6, 'fcf yield');
t.near(v('pfcf', { multiple: 25, ...MS }), 129.79683972911965, 1e-6, 'p/fcf');
t.near(v('ps', { multiple: 6, ...MS }), 127.313769751693, 1e-6, 'p/s');
t.near(v('evsales', { multiple: 6, ...MS }), 115.80135440180587, 1e-6, 'ev/sales');
t.near(v('pffo', { multiple: 17, ...MS }), 52.7, 1e-9, 'p/ffo');
t.near(v('declared', { value: 88, basis: 'sotp' }), 88, 0, 'declared passes value through');
t.near(v('pe', { multiple: 28, ...MS }, { override: { eps: 7, why: 'normalised' } }), 196, 1e-9, 'override eps is used');

// Review Focus #1 — legs that cannot price must name the path, never return NaN/Infinity
t.throws(() => v('ddm', { g: 9, r: 9 }), /^legs\[0\].*r.*g/, 'ddm r ≤ g');
t.throws(() => v('dcf', { g1: 7, years1: 5, tg: 9, r: 8.5, rfCurrency: 'USD' }), /^legs\[0\].*tg/, 'dcf r ≤ tg');
t.throws(() => v('pbv', { g: 9.5, r: 9 }), /^legs\[0\]/, 'justified pbv r ≤ g');
t.throws(() => L.legValue({ method: 'evebitda', inputs: { multiple: 1, ...MS } }, { ...f, ebitda: 1e6 }, 'legs[1]'), /^legs\[1\].*≤ 0/, 'negative equity value');
t.throws(() => L.legValue({ method: 'pe', inputs: { multiple: 20, ...MS } }, {}, 'legs[2]'), /^legs\[2\].*fundamentals\.eps/, 'missing fundamentals names the field');
t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../tools/v3/legs.js'`.

- [ ] **Step 3: Implement `tools/v3/legs.js`**

```js
'use strict';
/**
 * legs.js — สูตรขาประเมินมูลค่า (ค่าต่อหุ้น) · เจ้าของเดียวของคณิต FV ใน v3
 * เดิม: .mval/.mdesc เป็นข้อความที่ AI พิมพ์ แล้ว E21/E22/W14 ใช้ regex แกะกลับมาตรวจ (≈20 fix commits)
 * v3: ค่าคิดจาก inputs เสมอ → ผิดเลขไม่ได้ · ผิดได้แค่สมมติฐาน (ซึ่งตรวจด้วยการคำนวณได้)
 * input % = หน่วยเปอร์เซ็นต์ (g: 8 = 8%) · เงินรวมทั้งบริษัท = fcf/revenue/ebitda/netDebt · ที่เหลือต่อหุ้น
 */
const pct = (x) => x / 100;

function inputsOf(leg, f) {
  const o = { ...(f || {}) };
  if (leg.override) for (const [k, v] of Object.entries(leg.override)) if (k !== 'why') o[k] = v;
  return o;
}

function legValue(leg, fundamentals, path) {
  const P = path || 'leg';
  const b = inputsOf(leg, fundamentals);
  const i = leg.inputs || {};
  const need = (k) => {
    const v = b[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${P}: ต้องมี fundamentals.${k} (หรือ override.${k}) สำหรับวิธี ${leg.method}`);
    return v;
  };
  const spread = (r, g, gName) => {
    if (!(r > g)) throw new Error(`${P}: r (${r}%) ต้อง > ${gName} (${g}%) — สูตรนี้หารด้วย (r − ${gName})`);
    return pct(r) - pct(g);
  };
  const perShare = (total) => total / need('shares');
  const equity = (ev) => {
    const eq = ev - (b.netDebt || 0);
    if (!(eq > 0)) throw new Error(`${P}: มูลค่าส่วนผู้ถือหุ้น ≤ 0 (EV ${ev.toExponential(3)} − หนี้สุทธิ ${(b.netDebt || 0).toExponential(3)}) — วิธี ${leg.method} ใช้กับหุ้นนี้ไม่ได้`);
    return eq;
  };
  let v;
  switch (leg.method) {
    case 'pe': v = need('eps') * i.multiple; break;
    case 'pbv':
      v = i.multiple != null ? need('bvps') * i.multiple
        : (pct(need('roe')) - pct(i.g)) / spread(i.r, i.g, 'g') * need('bvps');
      break;
    case 'ps': v = perShare(need('revenue')) * i.multiple; break;
    case 'evsales': v = perShare(equity(need('revenue') * i.multiple)); break;
    case 'evebitda': v = perShare(equity(need('ebitda') * i.multiple)); break;
    case 'pfcf': v = perShare(need('fcf')) * i.multiple; break;
    case 'fcfyield': v = perShare(need('fcf')) / pct(i.yield); break;
    case 'pffo': v = need('ffoPerShare') * i.multiple; break;
    case 'ddm': v = need('dps') * (1 + pct(i.g)) / spread(i.r, i.g, 'g'); break;
    case 'dcf': {
      const r = pct(i.r);
      spread(i.r, i.tg, 'tg');
      let fcf = need('fcf'), pv = 0;
      for (let t = 1; t <= i.years1; t++) { fcf *= 1 + pct(i.g1); pv += fcf / Math.pow(1 + r, t); }
      const tv = fcf * (1 + pct(i.tg)) / (r - pct(i.tg)) / Math.pow(1 + r, i.years1);
      v = perShare(equity(pv + tv));
      break;
    }
    case 'ri': {
      const r = pct(i.r), roe = pct(need('roe'));
      let book = need('bvps'); v = book;
      for (let t = 1; t <= i.years; t++) { v += (roe - r) * book / Math.pow(1 + r, t); book *= 1 + roe * (1 - i.payout); }
      break;
    }
    case 'declared': v = i.value; break;
    default: throw new Error(`${P}.method: ไม่รู้จักวิธี ${JSON.stringify(leg.method)}`);
  }
  if (!Number.isFinite(v) || !(v > 0)) throw new Error(`${P}: ค่าขาได้ ${v} (≤ 0 หรือไม่ใช่ตัวเลข) — ตรวจ inputs`);
  return v;
}

module.exports = { legValue, inputsOf };
```

- [ ] **Step 4: Run the tests**

Run: `node test/v3-test.js`
Expected: `✓ legs: 19/19`.

- [ ] **Step 5: Commit**

```bash
git add tools/v3/legs.js test/v3/legs.test.js
git commit -m "feat(v3): valuation leg formulas with path-named failures"
```

---

### Task 4: `tools/v3/compute.js` — the one reader/calculator

**Files:**
- Create: `tools/v3/compute.js`, `test/v3/compute.test.js`

**Interfaces:**
- Consumes: `schema.validate`, `legs.legValue`, `scale.niceBounds`, `RV.derive/fmtPrice/fmtBig/CUR_SYMBOL/isoOf`, `DV.fmtMos`, `PD.renderThaiDate`, `bt.makeTheme`.
- Produces: `compute(doc, { seeds }) → view`, where `view` has:
  - `d`: the object returned by `RV.derive(rd, sm)`, unchanged (px, fv, mos, mosText, mosClass, mos20, mos30, upside, chg, priceDate, pe, mcap, ps, yield, pbv, analystPct, scenarios[{tgt,div,total,perYear,cls}], values, cur)
  - `legs`: `[{label, method, value, weight, inputs, override, note}]`
  - `fv`, `fvLow`, `fvHigh`
  - `scn`: `[{name:'bear'|'base'|'bull', growth, exitMultiple, driverStart, driverEnd, tgt, divCum, desc}]`
  - `chart`: `{data, min, max, grid, highlight, currency, gridFmt?, dataFmt?}`
  - `gauge`: `{min, max}`
  - `theme` (11 keys, validated by build) and `gdots` (3 hex colours)
  - `analysisDateText`
  - `rd` (v2 report-data object) and `sm` (v2 stock-meta object)
  - `doc`
  - It throws `Error('<path>: …')` on schema errors or on legs that can't be priced.

- [ ] **Step 1: Write the failing test**

`test/v3/compute.test.js`:
```js
'use strict';
const t = require('./_t.js')('compute');
const C = require('../../tools/v3/compute.js');
const RV = require('../../tools/report-values.js');
const load = (s) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`)));
const seeds = { ZTS: '#e8731a' };

const v = C.compute(load('ZTS'), { seeds });
t.near(v.legs[0].value, 171.64, 1e-9, 'leg 1 = pe');
t.near(v.fv, (v.legs[0].value + v.legs[1].value) / 2, 1e-9, 'fv = equal-weight mean when fvWeights null');
t.eq([v.fvLow, v.fvHigh], [Math.min(v.legs[0].value, v.legs[1].value), Math.max(v.legs[0].value, v.legs[1].value)], 'fvLow/High = min/max of legs');
t.near(v.scn[1].tgt, 6.13 * Math.pow(1.08, 3) * 26, 1e-9, 'base scenario target = eps(1+g)^y × exit');
t.eq(v.d.mosText, RV.derive(v.rd, v.sm).mosText, 'view.d is RV.derive of the bridged v2 data (byte-identical formatting)');
t.eq(v.rd.v, 2, 'bridge emits report-data v2');
t.eq(Object.keys(v.rd.values).includes('scenarios'), true, 'bridge carries scenarios');
t(v.chart.min < Math.min(...v.chart.data.map((p) => p[1])) && v.chart.max > v.fv, 'chart bounds include data and fv');
t.eq(v.chart.highlight, [6, 0], 'highlight = [index of min, index of max]');
t(v.gauge.min < v.fv * 0.7 && v.gauge.max > 190, 'gauge spans mos30 … analyst target');
t.eq(v.theme.chgColor, '#c5221f', 'chart down → red chg colour (E34)');
t(v.theme.accent === '#31a60d' && v.gdots.length === 3, 'themeLegacy palette + 3 gdots');
{ const d = load('ZTS'); d.meta.themeLegacy = null; const w = C.compute(d, { seeds });
  t.eq(w.theme.accent, require('../../tools/brandtheme.js').makeTheme('#e8731a').accent, 'no themeLegacy → makeTheme(seed)'); }
t.eq(v.analysisDateText, '20 ก.ย. 2569', 'analysis date in BE');

const b = C.compute(load('BBL'), { seeds: {} });
t.eq(b.theme.accent, '#0071e3', 'themeLegacy wins over seeds');
t.eq(b.theme.chgColor, '#137333', 'chart up → green');
t.eq(b.rd.values.analystTgt, undefined, 'no analyst → no analystTgt in bridge');

{ const d = load('ZTS'); d.fvWeights = [0.75, 0.25]; const w = C.compute(d, { seeds });
  t.near(w.fv, 0.75 * w.legs[0].value + 0.25 * w.legs[1].value, 1e-9, 'explicit weights'); }
{ const d = load('ZTS'); d.market.px = -3; t.throws(() => C.compute(d, { seeds }), /market\.px/, 'schema errors surface with path'); }
{ const d = load('ZTS'); d.meta.themeLegacy = null; t.throws(() => C.compute(d, { seeds: {} }), /seeds\.json.*ZTS/, 'no theme source → clear error'); }
{ const d = load('ZTS'); d.legs[1] = { method: 'declared', label: 'SOTP', inputs: { value: 150, basis: 'sotp', extrasRef: 0 } };
  t.throws(() => C.compute(d, { seeds }), /legs\[1\]\.inputs\.extrasRef/, 'extrasRef must point at an extras table'); }
t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../tools/v3/compute.js'`.

- [ ] **Step 3: Implement `tools/v3/compute.js`**

```js
'use strict';
/**
 * compute.js — ผู้อ่าน/ผู้คำนวณ "คนเดียว" ของรายงาน v3 (build · gate · cron · index ใช้ตัวนี้ทั้งหมด)
 * ★ ค่าที่ผูกราคา/FV ทุกตัวคิดผ่าน RV.derive() ของ v2 (bridge rd/sm) ⇒ การปัด/รูปแบบตัวเลขเหมือนเดิมทุก byte
 * ★ ห้าม require build.js / update-prices.js / check-reports.js (กฎ cycle เดียวกับ report-values.js)
 */
const RV = require('../report-values.js');
const PD = require('../price-date.js');
const bt = require('../brandtheme.js');
const S = require('./schema.js');
const L = require('./legs.js');
const { niceBounds, num4 } = require('./scale.js');

const UP = { chgBg: 'var(--green-soft)', chgColor: '#137333' };     // = fetch-facts.js UP/DOWN (E34)
const DOWN = { chgBg: 'var(--red-soft)', chgColor: '#c5221f' };
const SCN_NAMES = ['bear', 'base', 'bull'];
const round2 = (x) => Math.round(x * 100) / 100;

function driverStart(doc) {
  const s = doc.scenarios, f = doc.fundamentals;
  if (s.baseOverride) return s.baseOverride.value;
  const per = (k) => (f[k] != null && f.shares ? f[k] / f.shares : null);
  const v = { eps: f.eps, ffo: f.ffoPerShare, bvps: f.bvps, revenuePerShare: per('revenue'), fcfPerShare: per('fcf') }[s.driver];
  if (!(typeof v === 'number' && v > 0)) throw new Error(`scenarios.driver: ฐาน "${s.driver}" ไม่มีใน fundamentals (หรือ ≤ 0) — เติม fundamentals หรือใช้ scenarios.baseOverride`);
  return v;
}

function themeOf(doc, seeds, dir) {
  let base;
  if (doc.meta.themeLegacy) base = { ...doc.meta.themeLegacy };
  else if (seeds && seeds[doc.symbol]) base = bt.makeTheme(seeds[doc.symbol]);
  else throw new Error(`meta.themeLegacy: ไม่มีสีแบรนด์ — ต้องมี tools/seeds.json["${doc.symbol}"] (รัน pick-brand) หรือ themeLegacy`);
  const chg = dir === 'up' ? UP : dir === 'down' ? DOWN : {};
  const theme = { ...base, ...chg };
  const gradMid = (theme.darkGrad.match(/,(#[0-9a-fA-F]{6}) 58%/) || [])[1] || theme.accentDark;   // = pick-brand.js:119
  return { theme, gdots: [theme.accent, theme.accentDark, gradMid] };
}

function compute(doc, opts) {
  const errs = S.validate(doc);
  if (errs.length) throw new Error(errs.map((e) => `${e.path}: ${e.msg}`).join('\n'));
  const f = doc.fundamentals, mk = doc.market, s = doc.scenarios;

  // ── legs → fv ──
  const legs = doc.legs.map((leg, i) => {
    if (leg.method === 'declared' && leg.inputs.extrasRef != null && !doc.extras[leg.inputs.extrasRef])
      throw new Error(`legs[${i}].inputs.extrasRef: ไม่มี extras[${leg.inputs.extrasRef}]`);
    return { label: leg.label, method: leg.method, value: L.legValue(leg, f, `legs[${i}]`), inputs: leg.inputs, override: leg.override || null, note: leg.note || '' };
  });
  const w = doc.fvWeights || legs.map(() => 1 / legs.length);
  legs.forEach((l, i) => { l.weight = w[i]; });
  const fv = legs.reduce((a, l) => a + l.value * l.weight, 0);
  const fvLow = Math.min(...legs.map((l) => l.value)), fvHigh = Math.max(...legs.map((l) => l.value));

  // ── scenarios ──
  const start = driverStart(doc);
  const scn = s.cases.map((c, i) => {
    const end = start * Math.pow(1 + c.growth / 100, s.years);
    return { name: SCN_NAMES[i], growth: c.growth, exitMultiple: c.exitMultiple, driverStart: start, driverEnd: end, tgt: end * c.exitMultiple, divCum: s.divIncluded ? c.divCum : null, desc: c.desc };
  });

  // ── bridge → v2 report-data + stock-meta (ใช้ RV.derive ตัวจริง) ──
  const values = { px: mk.px, priceDate: mk.priceDate, dateEra: doc.dateEra, chgSuffix: mk.chgSuffix, fvLow: round2(fvLow), fvHigh: round2(fvHigh) };
  if (doc.analyst) values.analystTgt = doc.analyst.target;
  if (f.eps != null) values.eps = f.eps;
  if (f.shares != null) values.shares = f.shares;
  if (f.revenue != null && f.revenue > 0) values.revenue = f.revenue;
  if (f.dps != null && f.dps >= 0) values.dps = f.dps;
  if (f.bvps != null && f.bvps > 0) values.bvps = f.bvps;
  if (s.driver === 'eps') values.baseEps = start;
  values.scenarios = scn.map((x) => (s.divIncluded ? { tgt: round2(x.tgt), div: x.divCum } : { tgt: round2(x.tgt) }));
  values.scnBasis = { years: s.years, divIncluded: s.divIncluded, perYear: s.perYear };

  const cur = RV.CUR_SYMBOL[doc.currency];
  const prices = mk.chart.data.map((p) => p[1]);
  const cb = niceBounds(prices, round2(fv));
  const iMin = prices.indexOf(Math.min(...prices)), iMax = prices.indexOf(Math.max(...prices));
  const chart = { data: mk.chart.data, min: cb.min, max: cb.max, grid: cb.grid, currency: cur, highlight: [iMin, iMax] };
  if (mk.chart.gridFmt) chart.gridFmt = mk.chart.gridFmt;
  if (mk.chart.dataFmt) chart.dataFmt = mk.chart.dataFmt;

  const gPts = [mk.px, fv, fv * 0.7, fvHigh, fvLow].concat(doc.analyst ? [doc.analyst.target] : []);
  const gb = niceBounds(gPts, null);
  const gauge = { min: gb.min, max: gb.max };

  const chgDir = RV.annualChg(mk.chart.data, '').dir;
  const { theme, gdots } = themeOf(doc, opts && opts.seeds, chgDir);

  const rd = { v: 2, fv: round2(fv), values, theme, chart, gauge };
  const smBase = { symbol: doc.symbol, currency: doc.currency };
  const d = RV.derive(rd, smBase);
  const sm = {
    ...smBase, price: mk.px, fairValue: round2(fv), mos: num4(d.mos), upside: num4(d.upside),
    pe: d.pe == null ? null : num4(d.pe), dividendYield: d.yield == null ? null : num4(d.yield), roe: f.roe == null ? null : f.roe,
  };
  const ad = RV.parseIso(doc.meta.analysisDate);
  const analysisDateText = PD.renderThaiDate(ad.day, ad.monIdx, ad.yearCE, doc.dateEra === 'BE');

  return { doc, d, legs, fv, fvLow, fvHigh, scn, chart, gauge, theme, gdots, analysisDateText, rd, sm, cur };
}

module.exports = { compute, SCN_NAMES };
```

Before running it, note `RV.parseIso('2026-09-20')` returns `{yearCE:2026, monIdx:8, day:20}` (verified).

- [ ] **Step 4: Run the tests**

Run: `node test/v3-test.js`
Expected: `✓ compute: 20/20`. If `highlight` fails, print `v.chart.data`: ZTS min is index 6 (120.0), max index 0 (172.1).

- [ ] **Step 5: Commit**

```bash
git add tools/v3/compute.js test/v3/compute.test.js
git commit -m "feat(v3): compute() — legs→fv, scenarios, chart/gauge bounds, theme, v2 bridge via RV.derive"
```

---

### Task 5: Corpus parity — every v2 report round-trips through `compute()` with identical token output (acceptance gate)

This is the test that makes every later plan safe. It pushes **all ~885 real v2 value sets** through the v3 schema, `compute()` and the bridge, and requires that every v3 token with a v2 twin renders **the same string** as the v2 token rendered from the original file. (An earlier draft compared `RV.TOKENS` with itself, which can never fail. Don't reintroduce that.)

**Files:**
- Create: `tools/v3/tokens.js`, `test/v3/tokens-corpus.test.js`

**Interfaces:**
- Consumes: `RV.TOKENS`, `RV.derive`, `RV.isV2`, `RM.readReportData`, `RM.readStockMeta`, `C.compute`, `S.THEME_KEYS`, `build.js` `THEME_DEFAULTS`.
- Produces: `TOKENS_V3` (name → `(view) → string`) and `V2_TWIN` (v3 name → v2 token key).

- [ ] **Step 1: Write the failing test**

`test/v3/tokens-corpus.test.js`:
```js
'use strict';
const t = require('./_t.js')('tokens-corpus');
const fs = require('fs');
const path = require('path');
const RV = require('../../tools/report-values.js');
const RM = require('../../tools/report-meta.js');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const TK = require('../../tools/v3/tokens.js');
const { THEME_DEFAULTS } = require('../../build.js');

// v2 values → v3 doc ขั้นต่ำ: ขา declared 2 ขาที่ fvLow/fvHigh + weights ให้ได้ fv เดิม · ฉากใช้ baseOverride + exit = tgt/base
function v3FromV2(rd, sm, symbol) {
  const v = rd.values, f = {};
  for (const k of ['eps', 'shares', 'revenue', 'dps', 'bvps']) if (v[k] != null) f[k] = v[k];
  if (f.eps != null) f.epsBasis = 'gaap-ttm';
  const lo = v.fvLow != null ? v.fvLow : rd.fv, hi = v.fvHigh != null ? v.fvHigh : rd.fv;
  const decl = (x) => ({ method: 'declared', label: 'x', inputs: { value: x, basis: 'other' } });
  const b = v.scnBasis || { years: 3, divIncluded: false, perYear: null };
  const base = v.baseEps != null && v.baseEps > 0 ? v.baseEps : 1;
  const theme = {}; for (const k of S.THEME_KEYS) theme[k] = (rd.theme && rd.theme[k]) || THEME_DEFAULTS[k];
  return {
    v: 3, symbol, currency: sm.currency, region: sm.currency === 'THB' ? 'TH' : 'US', dateEra: v.dateEra,
    meta: { company: 'x', exchange: 'x', sub: 'parity fixture xx', analysisDate: v.priceDate, aiModel: 'Claude Sonnet 5', sources: ['a', 'b', 'c'], themeLegacy: theme },
    market: { px: v.px, priceDate: v.priceDate, chgSuffix: v.chgSuffix,
      chart: { data: rd.chart.data, ...(rd.chart.gridFmt && { gridFmt: rd.chart.gridFmt }), ...(rd.chart.dataFmt && { dataFmt: rd.chart.dataFmt }) } },
    fundamentals: f,
    legs: [decl(lo), decl(hi)],
    fvWeights: hi === lo ? null : [(hi - rd.fv) / (hi - lo), (rd.fv - lo) / (hi - lo)],
    metrics: { cards: ['mcap', 'pe', 'pbv', 'yield'], notes: {}, custom: [] },
    scenarios: { years: b.years, divIncluded: b.divIncluded, perYear: b.perYear == null ? null : b.perYear, driver: 'eps', exitMetric: 'pe',
      baseOverride: { value: base, why: 'parity' },
      cases: (v.scenarios || [{ tgt: 1 }, { tgt: 1 }, { tgt: 1 }]).map((x) => ({ growth: 0, exitMultiple: x.tgt / base, ...(b.divIncluded && { divCum: x.div }), desc: 'x' })),
      note: 'x' },
    analyst: v.analystTgt != null ? { target: v.analystTgt, n: 1, rating: 'x', asOf: v.priceDate } : null,
    prose: Object.fromEntries(['chart', 'valuation', 'gauge', 'mos', 'verdictHeadline', 'verdictBody', 'strategy', 'disclaimerSources'].map((k) => [k, 'x'])),
    catalysts: ['a', 'b', 'c'], risks: ['a', 'b', 'c'], extras: [],
  };
}

const dir = path.join(__dirname, '..', '..', 'reports');
let files = 0, ok = 0, checked = 0;
const findings = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const rd = RM.readReportData(html).data;
  if (!RV.isV2(rd)) continue;
  const sm = RM.readStockMeta(html);
  const sym = f.replace(/\.html$/, '');
  files++;
  let out;
  try { out = C.compute(v3FromV2(rd, sm, sym), {}); } catch (e) { findings.push(`${sym}: ${e.message.split('\n')[0]}`); continue; }
  ok++;
  const dA = RV.derive(rd, sm);
  for (const [v3, v2] of Object.entries(TK.V2_TWIN)) {
    let want;
    try { want = String(RV.TOKENS[v2](dA)); } catch (_) { continue; }   // ค่าไม่มีในใบนี้ → v2 ก็ใช้ token นี้ไม่ได้
    let got;
    try { got = TK.TOKENS_V3[v3](out); } catch (e) { got = 'THROW ' + e.message; }
    checked++;
    if (got !== want) t(false, `${sym} {{${v3}}} = "${got}" but v2 {{rd:${v2}}} = "${want}"`);
  }
}
if (findings.length) console.log(`  ℹ compute() refused ${findings.length} v2 value sets (schema findings — review, don't loosen blindly):\n    ` + findings.slice(0, 30).join('\n    '));
t(files >= 880, `scanned the v2 corpus (${files} files)`);
t(ok >= files * 0.97, `compute() accepted ≥97% of real v2 value sets (${ok}/${files})`);
t(checked > 0, `compared ${checked} token renders`);
t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../tools/v3/tokens.js'`.

- [ ] **Step 3: Implement `tools/v3/tokens.js`**

```js
'use strict';
/**
 * tokens.js — ตาราง token ของ prose v3 ({{px}} {{fv}} {{scn.base.ret}} {{leg1}} …)
 * ★ token ที่มีคู่ใน v2 เรียกฟังก์ชันของ RV.TOKENS ตรง ๆ บน view.d (= RV.derive ของ bridge) — ไม่เขียนสูตร format ซ้ำ
 *   corpus test (test/v3/tokens-corpus.test.js) ยืนยันว่า bridge ของ compute() ให้ผลเท่า v2 ทั้งคลัง
 * token ใหม่ของ v3 (ขา · ฉาก input · 52 สัปดาห์) format ด้วย RV.fmtPrice เหมือนกัน
 */
const RV = require('../report-values.js');

// v3 name → v2 token key (ไม่มีคู่ = ไม่อยู่ในตารางนี้)
const V2_TWIN = {
  px: 'px', fv: 'fv', fvLow: 'fvLow', fvHigh: 'fvHigh', mos: 'mos', mos20: 'mos20', mos30: 'mos30', upside: 'upside',
  pe: 'pe', pbv: 'pbv', yield: 'yield', mcap: 'mcap', ps: 'ps', chg: 'chg', priceDate: 'priceDate', baseEps: 'baseEps',
  'analyst.target': 'analystTgt', 'analyst.pct': 'analystPct',
  'scn.bear.tgt': 'sc1tgt', 'scn.bear.ret': 'sc1ret', 'scn.bear.div': 'sc1div',
  'scn.base.tgt': 'sc2tgt', 'scn.base.ret': 'sc2ret', 'scn.base.div': 'sc2div',
  'scn.bull.tgt': 'sc3tgt', 'scn.bull.ret': 'sc3ret', 'scn.bull.div': 'sc3div',
};

function need(v, name) { if (v == null) throw new Error(`token {{${name}}} ชี้ค่าที่ไม่มีในรายงานนี้`); return v; }
const money = (view, v) => view.d.cur + RV.fmtPrice(v);
const TOKENS_V3 = {};
for (const [v3, v2] of Object.entries(V2_TWIN)) TOKENS_V3[v3] = (view) => String(RV.TOKENS[v2](view.d));
for (let i = 1; i <= 4; i++) {
  TOKENS_V3[`leg${i}`] = (view) => money(view, need(view.legs && view.legs[i - 1], `leg${i}`).value);
  TOKENS_V3[`leg${i}.multiple`] = (view) => need(need(view.legs && view.legs[i - 1], `leg${i}`).inputs.multiple, `leg${i}.multiple`).toFixed(1) + 'x';
}
['bear', 'base', 'bull'].forEach((n, i) => {
  TOKENS_V3[`scn.${n}.end`] = (view) => money(view, need(view.scn && view.scn[i], `scn.${n}`).driverEnd);
  TOKENS_V3[`scn.${n}.exit`] = (view) => need(view.scn && view.scn[i], `scn.${n}`).exitMultiple.toFixed(1) + 'x';
});
TOKENS_V3.analysisDate = (view) => need(view.analysisDateText, 'analysisDate');
TOKENS_V3['range52w.lo'] = (view) => money(view, need(view.doc && view.doc.market.range52w, 'range52w').lo);
TOKENS_V3['range52w.hi'] = (view) => money(view, need(view.doc && view.doc.market.range52w, 'range52w').hi);

module.exports = { TOKENS_V3, V2_TWIN };
```

- [ ] **Step 4: Run the tests — mismatches are bridge bugs, refusals are findings**

Run: `rtk proxy node test/v3-test.js`
Expected: `✓ tokens-corpus: 3/3`.
- **A mismatch line** (`{{x}} = "…" but v2 … = "…"`) is a bug in `compute()`'s bridge (rounding, `round2(fv)`, `baseEps`, scenario rebuild). Fix `compute.js`. Never change `RV.*` or the test's expectation.
- **A refusal** (`ℹ compute() refused …`) means the v3 schema rejected a real v2 value set. Common causes: a chart point ≤ 0, `fv` outside `[fvLow, fvHigh]` (weights < 0), `perYear` shape. Loosen the schema **only** if the v2 shape is legitimate (e.g. real chart data). If the v2 data is itself broken, leave it refused and list the symbols in the commit message (Plan 3's migrator sends them to the HUMAN bucket).
- **Reviewer check (required):** temporarily change `round2` in compute.js to `Math.round(x)` and confirm the test goes red, then revert. This test must be able to fail.

- [ ] **Step 5: Commit**

```bash
git add tools/v3/tokens.js tools/v3/compute.js tools/v3/schema.js test/v3/tokens-corpus.test.js
git commit -m "feat(v3): token table + corpus round-trip — all v2 value sets through compute() render identical tokens"
```

---

### Task 6: `tools/v3/prose.js` — render, sanitize, rule B

**Files:**
- Create: `tools/v3/prose.js`, `test/v3/prose.test.js`

**Interfaces:**
- Consumes: `TOKENS_V3`, `V2_TWIN` (Task 5); `view` (Task 4).
- Produces:
  - `renderProse(str, view, {mode:'text'|'v2src'}) → string`. In `v2src` mode, tokens with a v2 twin are emitted as `{{rd:<twin>}}` so the v2 gate (E44) sees tokens. Every other token is rendered to its literal.
  - `sanitizeErrors(str) → string[]`
  - `proseFields(doc) → [{path, text}]`
  - `checkRuleB(doc, view) → {errors:[{path,literal,token}], warnings:[…]}`
  - `countMoneyLiterals(doc) → number`

- [ ] **Step 1: Write the failing test**

`test/v3/prose.test.js`:
```js
'use strict';
const t = require('./_t.js')('prose');
const P = require('../../tools/v3/prose.js');
const C = require('../../tools/v3/compute.js');
const load = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
const view = C.compute(load(), { seeds: { ZTS: '#e8731a' } });

t.eq(P.renderProse('ราคา {{px}}', view, { mode: 'text' }), 'ราคา $120.00', 'token → literal');
t.eq(P.renderProse('ราคา {{px}}', view, { mode: 'v2src' }), 'ราคา {{rd:px}}', 'v2src keeps v2 twin as rd token');
t.eq(P.renderProse('ขา {{leg1}}', view, { mode: 'v2src' }), 'ขา $171.64', 'v3-only token rendered literal in v2src');
t.eq(P.renderProse('**เด่น** a<b>b</b>', view, { mode: 'text' }), '<b>เด่น</b> a<b>b</b>', 'markdown bold + allowed tag');
// Review Focus #3 — escape everything else
t.eq(P.renderProse('a < b & <script>x</script>', view, { mode: 'text' }), 'a &lt; b &amp; &lt;script&gt;x&lt;/script&gt;', 'escape non-whitelisted markup');
t.eq(P.renderProse('<b onclick="x">y</b>', view, { mode: 'text' }), '&lt;b onclick=&quot;x&quot;&gt;y</b>', 'tags with attributes are not whitelisted');
t.eq(P.sanitizeErrors('ok <b>x</b><br>'), [], 'no errors on whitelist');
t(P.sanitizeErrors('<span style="x">y</span>').length === 1, 'reports disallowed tag');
t.throws(() => P.renderProse('{{nope}}', view, { mode: 'text' }), /\{\{nope\}\}/, 'unknown token names itself');

// rule B
{ const d = load(); d.prose.chart = 'ราคาตอนนี้ $120.00 แล้ว'; const r = P.checkRuleB(d, view);
  t(r.errors.some((e) => e.path === 'prose.chart' && e.token === 'px'), 'exact copy of px is an error'); }
{ const d = load(); d.prose.chart = 'ราคาตอนนี้ราว $120.5 แล้ว'; const r = P.checkRuleB(d, view);
  t(r.errors.length === 0 && r.warnings.some((e) => e.token === 'px'), 'near copy is a warning only'); }
{ const d = load(); d.prose.valuation = 'อัตรากำไรสุทธิ 27.6%'; const r = P.checkRuleB(d, view);
  t(r.errors.length === 0, 'statement number that is not a rendered price-bound value passes'); }
{ const d = load(); d.risks[0] = 'MOS อยู่ที่ ' + view.d.mosText; const r = P.checkRuleB(d, view);
  t(r.errors.some((e) => e.path === 'risks[0]' && e.token === 'mos'), 'lists are scanned too'); }
t.eq(P.countMoneyLiterals(load()), 0, 'fixture has no money literals');
{ const d = load(); d.prose.gauge = 'เคยแตะ $120.50 และ ฿33'; t.eq(P.countMoneyLiterals(d), 2, 'counts $ and ฿ literals (W31)'); }
t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../tools/v3/prose.js'`.

- [ ] **Step 3: Implement `tools/v3/prose.js`**

```js
'use strict';
/**
 * prose.js — ข้อความของรายงาน v3: แทน token · escape (อนุญาตแค่ <b> <i> <br> + **bold**) · กติกา B
 * กติกา B (spec §4): ตัวเลขผูกราคาห้ามพิมพ์เอง — error เมื่อ "ตรงรูปที่ render เป๊ะ" · warn เมื่อใกล้ (tolerance)
 * countMoneyLiterals = W31: นับ literal รูปเงินที่ค้าง (ไม่เทียบราคาวันนี้ — กัน false positive เมื่อราคาขยับ)
 */
const TK = require('./tokens.js');

const TOKEN_RE = /\{\{([A-Za-z0-9.]+)\}\}/g;
const ALLOWED = /<\/?b>|<\/?i>|<br\s*\/?>/gi;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function escapeKeepAllowed(s) {
  let out = '', last = 0, m;
  ALLOWED.lastIndex = 0;
  while ((m = ALLOWED.exec(s))) { out += esc(s.slice(last, m.index)) + m[0].toLowerCase().replace(/<br\s*\/?>/, '<br>'); last = m.index + m[0].length; }
  return out + esc(s.slice(last));
}

function renderProse(str, view, opts) {
  const mode = (opts && opts.mode) || 'text';
  const withBold = String(str).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  // escape ก่อน แล้วค่อยแทน token (ค่า token เป็นตัวเลข/ข้อความที่เรา format เอง ไม่มี markup)
  return escapeKeepAllowed(withBold).replace(TOKEN_RE, (all, name) => {
    const f = TK.TOKENS_V3[name];
    if (!f) throw new Error(`token {{${name}}} ไม่รู้จัก (มี: ${Object.keys(TK.TOKENS_V3).join(', ')})`);
    if (mode === 'v2src' && TK.V2_TWIN[name]) { f(view); return `{{rd:${TK.V2_TWIN[name]}}}`; }   // เรียก f ก่อน = token ชี้ค่า null ยัง throw
    return f(view);
  });
}

function sanitizeErrors(str) {
  const stripped = String(str).replace(ALLOWED, '');
  const bad = stripped.match(/<[^>]*>/g) || [];
  return bad.map((tag) => `แท็กไม่อนุญาต ${tag} — ใช้ได้แค่ <b> <i> <br> หรือ **ตัวหนา**`);
}

function proseFields(doc) {
  const out = [];
  const add = (path, text) => { if (typeof text === 'string') out.push({ path, text }); };
  for (const [k, v] of Object.entries(doc.prose || {})) add(`prose.${k}`, v);
  add('meta.sub', doc.meta && doc.meta.sub); add('meta.priceNote', doc.meta && doc.meta.priceNote);
  add('metrics.hint', doc.metrics && doc.metrics.hint);
  for (const [k, v] of Object.entries((doc.metrics && doc.metrics.notes) || {})) add(`metrics.notes.${k}`, v);
  ((doc.metrics && doc.metrics.custom) || []).forEach((c, i) => { add(`metrics.custom[${i}].value`, c.value); add(`metrics.custom[${i}].note`, c.note); });
  (doc.legs || []).forEach((l, i) => add(`legs[${i}].note`, l.note));
  ((doc.scenarios && doc.scenarios.cases) || []).forEach((c, i) => add(`scenarios.cases[${i}].desc`, c.desc));
  add('scenarios.note', doc.scenarios && doc.scenarios.note);
  (doc.catalysts || []).forEach((x, i) => add(`catalysts[${i}]`, x));
  (doc.risks || []).forEach((x, i) => add(`risks[${i}]`, x));
  (doc.extras || []).forEach((x, i) => { add(`extras[${i}].title`, x.title); add(`extras[${i}].note`, x.note);
    (x.rows || []).forEach((r, j) => r.forEach((c, k) => add(`extras[${i}].rows[${j}][${k}]`, c))); });
  return out;
}

// ค่าผูกราคาที่ห้ามพิมพ์เอง: [token, kind, ค่าดิบ] — kind: money | pct | mult
function priceBound(view) {
  const d = view.d, out = [];
  const add = (token, kind, raw) => { if (raw != null && Number.isFinite(raw)) out.push({ token, kind, raw, shown: TK.TOKENS_V3[token](view) }); };
  add('px', 'money', d.px); add('fv', 'money', d.fv); add('mos20', 'money', d.mos20); add('mos30', 'money', d.mos30);
  add('fvLow', 'money', d.values.fvLow); add('fvHigh', 'money', d.values.fvHigh);
  if (d.values.analystTgt != null) { add('analyst.target', 'money', d.values.analystTgt); add('analyst.pct', 'pct', d.analystPct); }
  add('mos', 'pct', d.mos); add('upside', 'pct', d.upside);
  if (d.yield != null) add('yield', 'pct', d.yield);
  if (d.pe != null && d.pe > 0) add('pe', 'mult', d.pe);
  if (d.pbv != null) add('pbv', 'mult', d.pbv);
  if (d.ps != null) add('ps', 'mult', d.ps);
  ['bear', 'base', 'bull'].forEach((n, i) => { const s = d.scenarios[i]; if (s) { add(`scn.${n}.tgt`, 'money', s.tgt); add(`scn.${n}.ret`, 'pct', s.total); } });
  return out;
}

const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
const CAND = [
  { kind: 'money', re: new RegExp(`(?:US\\$|\\$|฿)\\s*${NUM}`, 'g') },
  { kind: 'money', re: new RegExp(`${NUM}\\s*บาท`, 'g') },
  { kind: 'pct', re: new RegExp(`([+\\-−]?)${NUM}\\s*%`, 'g') },
  { kind: 'mult', re: new RegExp(`${NUM}\\s*(?:x|เท่า)(?![A-Za-z])`, 'g') },
];
const normShown = (s) => String(s).replace(/[\s,]/g, '').replace(/−/g, '-').replace(/^\+/, '');
// รูปเปล่าไว้เทียบ "เป๊ะ": ตัดสัญลักษณ์เงินหน้า / บาท / x / เท่า ท้าย (token pe/pbv render ไม่มี x แต่ prose มักพิมพ์ "24.5x")
const bare = (s) => normShown(s).replace(/^(US\$|\$|฿)/, '').replace(/(บาท|x|เท่า)$/, '');
const numOf = (s) => parseFloat(String(s).replace(/,/g, ''));
const TOL = { money: (a, b) => Math.abs(a - b) <= 0.015 * Math.abs(b), pct: (a, b) => Math.abs(a - b) <= 0.6, mult: (a, b) => Math.abs(a - b) <= 0.03 * Math.abs(b) };

function checkRuleB(doc, view) {
  const pb = priceBound(view), errors = [], warnings = [];
  for (const { path, text } of proseFields(doc)) {
    const plain = String(text).replace(TOKEN_RE, ' ');
    for (const { kind, re } of CAND) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(plain))) {
        const literal = m[0].trim();
        const n = kind === 'pct' ? numOf(m[2]) * (m[1] === '-' || m[1] === '−' ? -1 : 1) : numOf(m[1]);
        for (const b of pb.filter((x) => x.kind === kind)) {
          const exact = bare(literal) === bare(b.shown);
          const cmp = kind === 'pct' ? n : Math.abs(n);
          if (exact) { errors.push({ path, literal, token: b.token }); break; }
          if (TOL[kind](cmp, kind === 'pct' ? b.raw : Math.abs(b.raw))) { warnings.push({ path, literal, token: b.token }); break; }
        }
      }
    }
  }
  return { errors, warnings };
}

function countMoneyLiterals(doc) {
  let n = 0;
  for (const { text } of proseFields(doc)) {
    const plain = String(text).replace(TOKEN_RE, ' ');
    for (const { kind, re } of CAND) { if (kind !== 'money') continue; re.lastIndex = 0; n += (plain.match(re) || []).length; }
  }
  return n;
}

module.exports = { renderProse, sanitizeErrors, proseFields, checkRuleB, countMoneyLiterals, escapeKeepAllowed, TOKEN_RE };
```

- [ ] **Step 4: Run the tests**

Run: `node test/v3-test.js`
Expected: `✓ prose: 16/16`. Worked numbers for the ZTS fixture (so failures are easy to read): fv ≈ (171.64 + 104.08)/2 = 137.86 · px 120.00 → mos ≈ +12.95% ("+13%", class ok) · upside ≈ +14.9% · analyst.pct ≈ +58.3% · yield ≈ 1.7% · scenario totals ≈ bear +13.7% / base +72.8% / bull +121%. `27.6%` is >0.6pp from every price-bound percent, so it must pass.

- [ ] **Step 5: Commit**

```bash
git add tools/v3/prose.js test/v3/prose.test.js
git commit -m "feat(v3): prose render/sanitize + rule B (exact=error, near=warn) + W31 money literal count"
```

---

### Task 7: `tools/v3/cards.js` — section-1 catalogue

**Files:**
- Create: `tools/v3/cards.js`, `test/v3/cards.test.js`

**Interfaces:**
- Consumes: `view` (Task 4), `S.CARD_KEYS`, `RV.fmtBig`, `RV.fmtPrice`.
- Produces: `CATALOGUE` (key → `{label(view), value(view)→string, d(view)→string, cls}`) and `renderCard(key, view, note) → {k, v, d, cls}`. It throws `metrics.cards: <key> …` when the data is missing.

- [ ] **Step 1: Write the failing test**

`test/v3/cards.test.js`:
```js
'use strict';
const t = require('./_t.js')('cards');
const K = require('../../tools/v3/cards.js');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const DV = require('../../tools/derived-values.js');
const load = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
const view = C.compute(load(), { seeds: { ZTS: '#e8731a' } });

t.eq(Object.keys(K.CATALOGUE).sort(), S.CARD_KEYS.slice().sort(), 'catalogue keys = schema CARD_KEYS');
const pe = K.renderCard('pe', view, 'หมายเหตุ');
t.eq(pe.v, view.d.pe.toFixed(1) + 'x', 'pe value from compute');
t(/EPS/.test(pe.d) && DV.epsBasesOf(pe.d).includes(6.13), 'pe base line declares EPS so the E41 parser reads it');
t(/หมายเหตุ/.test(pe.d), 'note appended to base line');
const mc = K.renderCard('mcap', view);
t.near(DV.parseShares(mc.d), 443e6, 1e6, 'mcap base line parses back to shares (E43)');
const y = K.renderCard('yield', view);
t(/\$2\.00\/ปี/.test(y.d), 'yield base line = DPS per year (W19)');
t(/BVPS \$11\.40/.test(K.renderCard('pbv', view).d), 'pbv base line = BVPS (W20)');
// Review Focus #4 — loss-making company
{ const d = load(); d.fundamentals.eps = -1.2; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('pe', v2), /metrics\.cards: pe/, 'eps ≤ 0 → pe card rejected'); }
{ const d = load(); delete d.fundamentals.beta; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('beta', v2), /fundamentals\.beta/, 'missing data names the field'); }
t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../tools/v3/cards.js'` (and possibly `DV.epsBasesOf is not a function`; see Step 3).

- [ ] **Step 3: Implement `tools/v3/cards.js`** and export the two parsers the test uses

In `tools/derived-values.js` `module.exports` (line ~1190), add `epsBasesOf` and `parseShares` if they are not already exported. Check with `rtk proxy grep -n "epsBasesOf\|parseShares" tools/derived-values.js | tail -3`.

`tools/v3/cards.js`:
```js
'use strict';
/**
 * cards.js — แคตตาล็อกการ์ด section 1 (Key Metrics) · label/ค่า/บรรทัดฐาน (.d) เขียนโดย template ไม่ใช่ AI
 * ★ บรรทัด .d ของการ์ดผูกราคาต้อง "ประกาศฐาน" ในรูปที่ parser ของ gate v2 อ่านได้
 *   (EPS $x → E41 · "~N หุ้น" → E43 · "$d/ปี" → W19 · "BVPS $b" → W20) ⇒ render v3 ผ่าน gate v2 ได้ตรง ๆ
 * แคตตาล็อกเต็มร่างจาก census (tools/v3/card-census.js) — ชุดนี้คือแกนจาก skeleton + คีย์ที่พบบ่อย
 */
const RV = require('../report-values.js');

const f = (view) => view.doc.fundamentals;
const need = (view, k) => { const v = f(view)[k]; if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`metrics.cards: การ์ดต้องใช้ fundamentals.${k} — เติมค่า หรือถอดการ์ดออก`); return v; };
const money = (view, v) => view.cur + RV.fmtPrice(v);
const big = (view, v) => RV.fmtBig(v, view.cur);
const pct1 = (v) => v.toFixed(1) + '%';
function sharesText(view, n) {
  if (view.cur === '฿') return n >= 1e9 ? `~${(n / 1e9).toFixed(2)} พันล้านหุ้น` : `~${(n / 1e6).toFixed(1)} ล้านหุ้น`;
  return n >= 1e9 ? `~${(n / 1e9).toFixed(2)}B หุ้น` : `~${(n / 1e6).toFixed(1)}M หุ้น`;
}
const priceBoundOrThrow = (key, v) => { if (v == null) throw new Error(`metrics.cards: ${key} คำนวณไม่ได้จากข้อมูลที่มี`); return v; };

const CATALOGUE = {
  mcap: { label: () => 'Market Cap', value: (v) => big(v, priceBoundOrThrow('mcap', v.d.mcap)), d: (v) => sharesText(v, need(v, 'shares')), cls: '' },
  pe: { label: () => 'P/E (TTM)', cls: 'neu',
    value: (v) => { const e = need(v, 'eps'); if (!(e > 0)) throw new Error('metrics.cards: pe — EPS ≤ 0 (ขาดทุน) P/E ไม่มีความหมาย ถอดการ์ดออก'); return v.d.pe.toFixed(1) + 'x'; },
    d: (v) => `EPS TTM ${money(v, need(v, 'eps'))}` },
  peAvg5y: { label: () => 'P/E เฉลี่ย ~5 ปี', value: (v) => need(v, 'peAvg5y').toFixed(1) + 'x', d: () => 'มัธยฐานย้อนหลัง', cls: '' },
  pbv: { label: () => 'P/BV', cls: 'neu', value: (v) => priceBoundOrThrow('pbv', v.d.pbv).toFixed(2) + 'x', d: (v) => `BVPS ${money(v, need(v, 'bvps'))}` },
  ps: { label: () => 'P/S', cls: 'neu', value: (v) => priceBoundOrThrow('ps', v.d.ps).toFixed(1) + 'x', d: (v) => `รายได้ TTM ${big(v, need(v, 'revenue'))}` },
  netIncome: { label: () => 'กำไรสุทธิ TTM', value: (v) => big(v, need(v, 'netIncome')), d: () => 'รอบ 12 เดือนล่าสุด', cls: '' },
  eps: { label: () => 'EPS (TTM)', value: (v) => '~' + money(v, need(v, 'eps')), d: (v) => ({ 'gaap-ttm': 'GAAP', 'adj-ttm': 'Adjusted', fy: 'ปีบัญชีล่าสุด' }[f(v).epsBasis] || ''), cls: '' },
  bvps: { label: () => 'BVPS', value: (v) => '~' + money(v, need(v, 'bvps')), d: () => 'มูลค่าทางบัญชีต่อหุ้น', cls: '' },
  roe: { label: () => 'ROE / ROA', cls: 'pos', value: (v) => `~${need(v, 'roe').toFixed(1)}%` + (f(v).roa != null ? ` / ${f(v).roa.toFixed(1)}%` : ''), d: () => 'ผลตอบแทนต่อทุน / สินทรัพย์' },
  revenue: { label: () => 'รายได้ TTM', cls: 'neu', value: (v) => big(v, need(v, 'revenue')), d: () => 'รอบ 12 เดือนล่าสุด' },
  grossMargin: { label: () => 'อัตรากำไรขั้นต้น', value: (v) => pct1(need(v, 'grossMargin')), d: () => 'Gross margin', cls: '' },
  netMargin: { label: () => 'อัตรากำไรสุทธิ', value: (v) => pct1(need(v, 'netMargin')), d: () => 'Net margin', cls: '' },
  opMargin: { label: () => 'อัตรากำไรจากดำเนินงาน', value: (v) => pct1(need(v, 'opMargin')), d: () => 'Operating margin', cls: '' },
  yield: { label: () => 'เงินปันผล', value: (v) => priceBoundOrThrow('yield', v.d.yield).toFixed(1) + '%', d: (v) => `${money(v, need(v, 'dps'))}/ปี`, cls: '' },
  beta: { label: () => 'Beta', value: (v) => need(v, 'beta').toFixed(2), d: () => 'ความผันผวนเทียบตลาด', cls: '' },
  range52w: { label: () => 'กรอบ 52 สัปดาห์', cls: '',
    value: (v) => { const r = v.doc.market.range52w; if (!r) throw new Error('metrics.cards: range52w — ไม่มี market.range52w (cron เติม)'); return `${money(v, r.lo)} – ${money(v, r.hi)}`; },
    d: () => 'ต่ำสุด – สูงสุด' },
  fcf: { label: () => 'FCF TTM', value: (v) => big(v, need(v, 'fcf')), d: () => 'กระแสเงินสดอิสระ', cls: '' },
  debtToEquity: { label: () => 'D/E', value: (v) => need(v, 'debtToEquity').toFixed(2) + 'x', d: () => 'หนี้สินต่อทุน', cls: '' },
};

function renderCard(key, view, note) {
  const c = CATALOGUE[key];
  if (!c) throw new Error(`metrics.cards: ไม่รู้จักการ์ด ${key}`);
  const d = c.d(view);
  return { k: c.label(view), v: c.value(view), d: note ? (d ? `${d} · ${note}` : note) : d, cls: c.cls };
}

module.exports = { CATALOGUE, renderCard };
```

- [ ] **Step 4: Run the tests**

Run: `node test/v3-test.js`
Expected: `✓ cards: 10/10`. If `parseShares` doesn't read `~443.0M หุ้น`, look at its two regexes (derived-values.js:109) and adjust `sharesText` to a form they read (e.g. `~443M หุ้น`). Don't change the parser.

- [ ] **Step 5: Commit**

```bash
git add tools/v3/cards.js tools/derived-values.js test/v3/cards.test.js
git commit -m "feat(v3): section-1 card catalogue with gate-parseable base lines"
```

---

### Task 8: `tools/v3/io.js` — canonical JSON, signature, freshHash, atomic write

**Files:**
- Create: `tools/v3/io.js`, `test/v3/io.test.js`

**Interfaces:**
- Consumes: `schema.validate`, `lockfile.withLock/writeJsonAtomic`.
- Produces:
  - `canonical(x) → string` (sorted keys, compact)
  - `sign(doc) → 'sha256:<hex>'` (computed over the doc without `_sig`)
  - `verifySig(doc) → boolean`
  - `freshHash(doc) → string` (12 hex characters, ignoring `market`, `_sig` and `meta.aiModel`)
  - `serialize(doc) → string` (pretty-printed, top-level keys in a fixed order)
  - `read(file) → doc`
  - `write(file, doc) → doc` (validate → sign → atomic write under lock; it throws on schema errors)

- [ ] **Step 1: Write the failing test**

`test/v3/io.test.js`:
```js
'use strict';
const t = require('./_t.js')('io');
const fs = require('fs');
const os = require('os');
const path = require('path');
const IO = require('../../tools/v3/io.js');
const load = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));

t.eq(IO.canonical({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } }), '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}', 'canonical sorts keys at every depth');
const d = load();
const s = IO.sign(d);
t(/^sha256:[0-9a-f]{64}$/.test(s), 'sign format');
t.eq(IO.sign({ ...d, _sig: 'sha256:' + '0'.repeat(64) }), s, 'signature ignores _sig itself');
t(IO.verifySig({ ...d, _sig: s }), 'verifySig true on untouched doc');
t(!IO.verifySig({ ...d, _sig: s, prose: { ...d.prose, mos: 'edited by hand' } }), 'verifySig false after a hand edit');

const h = IO.freshHash(d);
t.eq(IO.freshHash({ ...d, market: { ...d.market, px: 999 } }), h, 'freshHash ignores cron-owned market');
t.eq(IO.freshHash({ ...d, meta: { ...d.meta, aiModel: 'Claude Opus 5' } }), h, 'freshHash ignores aiModel');
t(IO.freshHash({ ...d, prose: { ...d.prose, mos: 'x' } }) !== h, 'freshHash moves on analysis edits');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3io-'));
const file = path.join(dir, 'ZTS.json');
IO.write(file, d);
const back = IO.read(file);
t(IO.verifySig(back), 'written file carries a valid signature');
t.eq(Object.keys(back).slice(0, 5), ['v', 'symbol', 'currency', 'region', 'dateEra'], 'fixed top-level key order on disk');
t.throws(() => IO.write(file, { ...d, market: { ...d.market, px: 0 } }), /market\.px/, 'write refuses invalid docs');
t(IO.verifySig(IO.read(file)), 'failed write leaves previous file intact');
t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../tools/v3/io.js'`.

- [ ] **Step 3: Implement `tools/v3/io.js`**

```js
'use strict';
/**
 * io.js — ผู้เขียนไฟล์รายงาน v3 "คนเดียว" (report.js save + cron เรียกผ่านที่นี่เท่านั้น)
 * _sig = sha256(canonical JSON ไม่รวม _sig) — ไม่ใช่ความปลอดภัยเชิง crypto แต่เป็นเครื่องบอกว่า "ไฟล์นี้ไม่ได้ผ่าน io.js"
 *   (แก้มือทางไหนก็ตาม — Edit tool หลุด hook, sed, editor — gate E50 จับได้ใน Plan 2)
 * freshHash = ฐานของ reports.json.updated: ไม่นับ market (cron) · _sig · meta.aiModel ⇒ cron เขียนราคาทุกวันแต่ "อัปเดต" ไม่ขยับ
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('./schema.js');
const LK = require('../lockfile.js');

const TOP_ORDER = ['v', 'symbol', 'currency', 'region', 'dateEra', 'meta', 'market', 'fundamentals', 'legs', 'fvWeights',
  'metrics', 'scenarios', 'analyst', 'prose', 'catalysts', 'risks', 'extras', '_sig'];

function canonical(x) {
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function sign(doc) { const { _sig, ...rest } = doc; return 'sha256:' + sha(canonical(rest)); }
const verifySig = (doc) => typeof doc._sig === 'string' && doc._sig === sign(doc);
function freshHash(doc) {
  const { _sig, market, ...rest } = doc;
  const meta = { ...(rest.meta || {}) }; delete meta.aiModel;
  return sha('v3:' + canonical({ ...rest, meta })).slice(0, 12);
}
function serialize(doc) {
  const ordered = {};
  for (const k of TOP_ORDER) if (k in doc) ordered[k] = doc[k];
  for (const k of Object.keys(doc)) if (!(k in ordered)) ordered[k] = doc[k];   // validate() จะปฏิเสธอยู่แล้ว — ไม่ทิ้งข้อมูลเงียบ
  return JSON.stringify(ordered, null, 2) + '\n';
}
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, doc) {
  const errs = S.validate(doc);
  if (errs.length) throw new Error(`${path.basename(file)}: สคีมาไม่ผ่าน\n` + errs.map((e) => `  ${e.path}: ${e.msg}`).join('\n'));
  const signed = { ...doc, _sig: sign(doc) };
  LK.withLock(file, () => LK.writeJsonAtomic(file, serialize(signed)));
  return signed;
}

module.exports = { canonical, sign, verifySig, freshHash, serialize, read, write, TOP_ORDER };
```

- [ ] **Step 4: Run the tests**

Run: `node test/v3-test.js`
Expected: `✓ io: 13/13`.

- [ ] **Step 5: Commit**

```bash
git add tools/v3/io.js test/v3/io.test.js
git commit -m "feat(v3): io — canonical JSON, _sig, freshHash (ignores cron/aiModel), atomic locked write"
```

---

### Task 9: `_template/v3/render.js` — v3 → in-memory v2-shaped source

**Files:**
- Create: `_template/v3/render.js`, `test/v3/render.test.js`

**Interfaces:**
- Consumes:
  - `compute` (Task 4), `renderProse`/`escapeKeepAllowed` (Task 6), `renderCard` (Task 7)
  - from `build.js`: `expandReport(html)` and `validateReportData` (the test only; render must not require build.js)
  - from `test/check-reports.js`: `checkHtml(expandedHtml, name, {source})` (the test only)
- Produces: `toV2Source(doc, view) → string`. This is a complete content-only HTML file in v2 shape: `<!DOCTYPE html>`, `<html lang="th">`, `<title>`, `ai-model` meta, `stock-meta` JSON, `report-data` v2 JSON, `<!--TEMPLATE:STYLE-->`, 8 sections using the same DOM/classes as `_template/skeleton-th.html`, the disclaimer, the footer, and `<!--TEMPLATE:ENGINE-->`. It uses `{{rd:…}}` tokens at every v2 token site.

- [ ] **Step 1: Write the failing test** (the acceptance test: the full v2 gate on the rendered fixture)

`test/v3/render.test.js`:
```js
'use strict';
const t = require('./_t.js')('render');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const { expandReport } = require('../../build.js');
const CR = require('../../test/check-reports.js');

// วันราคาต้องสด ไม่งั้น E27 (>120 วัน) ยิงเมื่อ fixture เก่า — ตั้งเป็นวันนี้ (เวลาไทย) ทุกครั้งที่รัน
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (s) => { const d = JSON.parse(JSON.stringify(require(`../fixtures/v3/${s}.json`))); d.market.priceDate = today; d.meta.analysisDate = today; return d; };
const seeds = { ZTS: '#e8731a' };

for (const sym of ['ZTS', 'BBL']) {
  const doc = load(sym);
  const view = C.compute(doc, { seeds });
  const src = R.toV2Source(doc, view);
  t(src.startsWith('<!DOCTYPE html>') && src.includes('<!--TEMPLATE:STYLE-->') && src.includes('<!--TEMPLATE:ENGINE-->'), `${sym}: markers present`);
  t(!/\{\{(?!rd:)[^}]*\}\}/.test(src), `${sym}: no v3 tokens left in source`);
  const html = expandReport(src);
  const res = CR.checkHtml(html, `${sym}.html`, { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], `${sym}: full v2 gate — zero errors`);
  t((html.match(/<section>/g) || []).length === 8, `${sym}: 8 sections`);
}
// Review Focus #2 — gauge scale ascending even when analyst target > fvHigh, or absent
{ const doc = load('ZTS'); doc.analyst.target = 400; const view = C.compute(doc, { seeds });
  const res = CR.checkHtml(expandReport(R.toV2Source(doc, view)), 'ZTS.html', { source: R.toV2Source(doc, view) });
  t(!res.errors.some((e) => e.id === 'E26'), 'E26 green with analyst above fvHigh'); }
// extras render as a data table
{ const doc = load('ZTS'); doc.extras = [{ after: 'valuation', title: 'SOTP', headers: ['ส่วน', 'มูลค่า'], rows: [['A', 1.5], ['B <x>', 2]] }];
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(/<table class="xtab">[\s\S]*B &lt;x&gt;[\s\S]*<\/table>/.test(src), 'extras table escaped'); }
t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `Cannot find module '../../_template/v3/render.js'`.

- [ ] **Step 3: Implement `_template/v3/render.js`**

```js
'use strict';
/**
 * render.js — template เดียวของรายงาน v3 → สร้าง "ต้นฉบับรูป v2" ในหน่วยความจำ
 * (stock-meta + report-data v2 + token {{rd:…}} + marker) แล้วให้ build.js เดินทางเดิมทุกขั้น
 * ⇒ dashboard.css / engine.js / decorateReport / injectTA / gate v2 ใช้ต่อได้โดยไม่แก้
 * DOM/class คัดจาก _template/skeleton-th.html (ห้ามคิด class ใหม่ ยกเว้น .xtab ของ extras)
 * ทุก string จาก JSON ผ่าน esc() หรือ renderProse() — ไม่มีทางอื่นเข้า HTML
 */
const RV = require('../../tools/report-values.js');
const P = require('../../tools/v3/prose.js');
const K = require('../../tools/v3/cards.js');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const METHOD_NAME = { pe: 'P/E', pbv: 'P/BV', ps: 'P/S', evsales: 'EV/Sales', evebitda: 'EV/EBITDA', pfcf: 'P/FCF', fcfyield: 'FCF Yield',
  pffo: 'P/FFO', ddm: 'DDM / Gordon Growth', dcf: 'DCF', ri: 'Residual Income', declared: 'มูลค่าประกาศ' };
const SRC_NAME = { median5y: 'มัธยฐาน 5 ปี', median10y: 'มัธยฐาน 10 ปี', peer: 'ค่ากลางกลุ่มเทียบ', justified: 'justified', sector: 'ค่ากลางเซกเตอร์' };
const dot = (c) => `<div style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block;margin:0 3px"></div>`;

function mdesc(leg, view) {
  const m = (v) => view.cur + RV.fmtPrice(v);
  const i = leg.inputs, b = { ...view.doc.fundamentals, ...(leg.override || {}) };
  const src = i.multipleSource ? ` (${SRC_NAME[i.multipleSource]})` : '';
  switch (leg.method) {
    case 'pe': return `EPS ${m(b.eps)} × P/E เป้าหมาย ~${i.multiple}x${src}`;
    case 'pbv': return i.multiple != null ? `BVPS ${m(b.bvps)} × P/BV ${i.multiple}x${src}`
      : `P/BV เหมาะสม = (ROE ${b.roe}% − g ${i.g}%)/(r ${i.r}% − g ${i.g}%) ≈ ${((b.roe - i.g) / (i.r - i.g)).toFixed(2)} × BVPS ${m(b.bvps)}`;
    case 'ddm': return `D₁ = ปันผล ${m(b.dps)} × (1+g); g ${i.g}%, r ${i.r}%`;
    case 'dcf': return `FCF ${RV.fmtBig(b.fcf, view.cur)} โต ${i.g1}%/ปี ${i.years1} ปี · โตถาวร ${i.tg}% · r ${i.r}%`;
    case 'ri': return `BVPS ${m(b.bvps)} · ROE ${b.roe}% vs r ${i.r}% · ${i.years} ปี · payout ${Math.round(i.payout * 100)}%`;
    case 'fcfyield': return `FCF/หุ้น ÷ yield เป้าหมาย ${i.yield}%`;
    case 'declared': return `ค่าประกาศ (${i.basis})` + (i.extrasRef != null ? ' — ดูตารางประกอบ' : '');
    default: return `${METHOD_NAME[leg.method]} ${i.multiple}x${src}`;
  }
}

function extrasHtml(doc, view, after) {
  return doc.extras.filter((x) => x.after === after).map((x) => {
    const cell = (c) => (typeof c === 'number' ? esc(RV.fmtPrice(c)) : P.renderProse(c, view, { mode: 'v2src' }));
    const head = x.headers.length ? `<tr>${x.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : '';
    const rows = x.rows.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('');
    const note = x.note ? `<p class="xnote">${P.renderProse(x.note, view, { mode: 'v2src' })}</p>` : '';
    return `\n  <section>\n    <div class="card"><h3>${esc(x.title)}</h3><table class="xtab">${head}${rows}</table>${note}</div>\n  </section>`;
  }).join('');
}

function toV2Source(doc, view) {
  const pr = (s) => P.renderProse(s, view, { mode: 'v2src' });
  const m = doc.meta, d = view.d, s = doc.scenarios, TH = doc.currency === 'THB';
  const cards = doc.metrics.cards.map((k) => K.renderCard(k, view, doc.metrics.notes && doc.metrics.notes[k]))
    .concat((doc.metrics.custom || []).map((c) => ({ k: esc(c.label), v: pr(c.value), d: c.note ? pr(c.note) : '', cls: '', raw: true })));
  const cardHtml = cards.map((c) => `<div class="metric"><div class="k">${c.raw ? c.k : esc(c.k)}</div><div class="v${c.cls ? ' ' + c.cls : ''}">${c.raw ? c.v : esc(c.v)}</div><div class="d">${c.raw ? c.d : esc(c.d)}</div></div>`).join('\n      ');
  const legsHtml = view.legs.map((l, i) => `<div class="vmethod">
        <div><div class="mname">${i + 1}. ${esc(l.label)}</div><div class="mdesc">${esc(mdesc(doc.legs[i], view))}${l.note ? ' — ' + pr(l.note) : ''}</div></div>
        <div class="mval">${esc(view.cur + RV.fmtPrice(l.value))}</div>
      </div>`).join('\n      ');
  // Review Focus #2 — ป้ายเกจเรียงค่าจากน้อยไปมากเสมอ (E26)
  const scale = [
    { v: d.mos30, tok: '{{rd:mos30}}', lab: 'MOS 30%' }, { v: d.mos20, tok: '{{rd:mos20}}', lab: 'MOS 20%' },
    { v: d.fv, tok: '{{rd:fv}}', lab: 'Fair Value' }, { v: d.values.fvHigh, tok: '{{rd:fvHigh}}', lab: 'กรอบบน FV' },
  ].concat(doc.analyst ? [{ v: doc.analyst.target, tok: '{{rd:analystTgt}}', lab: 'เป้าเฉลี่ย Analyst' }] : [])
    .sort((a, b) => a.v - b.v)
    .map((x, i, arr) => `<span${i === 0 ? '' : i === arr.length - 1 ? ' style="text-align:right"' : ' style="text-align:center"'}>${x.tok}<br><small>${x.lab}</small></span>`).join('\n          ');
  const drv = { eps: 'EPS', ffo: 'FFO', revenuePerShare: 'รายได้/หุ้น', bvps: 'BVPS', fcfPerShare: 'FCF/หุ้น' }[s.driver];
  const ex = { pe: 'P/E', ps: 'P/S', pbv: 'P/BV', pffo: 'P/FFO', pfcf: 'P/FCF' }[s.exitMetric];
  const col = (i, cls, name) => {
    const sc = view.scn[i];
    const g = sc.growth >= 0 ? `+${sc.growth}` : `${sc.growth}`;
    return `<div class="col ${cls}">
        <div class="top"><span>${name}</span><span>${drv} ${g}%/ปี</span></div>
        <div class="body">
          <div class="tgt">{{rd:sc${i + 1}tgt}}</div>
          <div class="ret {{rd:sc${i + 1}retClass}}">{{rd:sc${i + 1}ret}}</div>
          <ul>
            <li><span>${drv} ปี ${s.years}</span><span>~${esc(view.cur + RV.fmtPrice(sc.driverEnd))}</span></li>
            <li><span>${ex} ออก</span><span>${sc.exitMultiple}x</span></li>${s.divIncluded ? `
            <li><span>ปันผลรวม ${s.years} ปี</span><span>~{{rd:sc${i + 1}div}}</span></li>` : ''}
            <li><span>สถานการณ์</span><span>${pr(sc.desc)}</span></li>
          </ul>
        </div>
      </div>`;
  };
  const li = (xs) => xs.map((x) => `<li>${pr(x)}</li>`).join('\n          ');
  const analystCell = doc.analyst
    ? `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v" style="color:#a5d6a7">~{{rd:analystTgt}} (${esc(doc.analyst.rating)} · ${doc.analyst.n} ราย)</div></div>`
    : `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v">ไม่มีข้อมูล</div></div>`;
  const tags = [`${esc(m.exchange)}: ${esc(doc.symbol)}`].concat((m.headerTags || []).map(esc)).map((x) => `<span class="tag">${x}</span>`).join('\n      ');
  const r52 = doc.market.range52w;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>วิเคราะห์หุ้น ${esc(m.company)} (${esc(doc.symbol)}) — Stock Analysis Dashboard</title>
<meta name="ai-model" content="${esc(m.aiModel)}">
<script type="application/json" id="stock-meta">
${JSON.stringify(view.sm)}
</script>
<script type="application/json" id="report-data">
${RV.styledRD(view.rd)}
</script>
<!--TEMPLATE:STYLE-->
</head>
<body>
<div class="wrap">

  <header>
    <div class="gdots">${view.gdots.map(dot).join('')}</div>
    <div>
      ${tags}
    </div>
    <h1>${esc(m.company)}</h1>
    <div class="sub">${pr(m.sub)}</div>
    <div class="price-row">
      <div>
        <div class="px">{{rd:px}}<small>(${esc(doc.symbol)})</small></div>
      </div>
      <div class="chg">{{rd:chg}}</div>
      <div class="px-meta">
        ราคา ณ {{rd:priceDate}}${m.priceNote ? ` (${pr(m.priceNote)})` : ''}<br>${r52 ? `
        กรอบ 52 สัปดาห์ ${esc(view.cur + RV.fmtPrice(r52.lo))} – ${esc(view.cur + RV.fmtPrice(r52.hi))}<br>` : ''}
        ที่มา: ${m.sources.map(esc).join(', ')}
      </div>
    </div>
  </header>

  <section>
    <div class="s-head"><div class="n">1</div><h2>ข้อมูลสำคัญ (Key Metrics)</h2>${doc.metrics.hint ? `<div class="hint">${pr(doc.metrics.hint)}</div>` : ''}</div>
    <div class="grid g4">
      ${cardHtml}
    </div>
  </section>${extrasHtml(doc, view, 'metrics')}

  <section>
    <div class="s-head"><div class="n">2</div><h2>ราคาย้อนหลัง ~1 ปี</h2><div class="hint">โดยประมาณ</div></div>
    <div class="card">
      <div class="chart-wrap">
        <svg id="priceChart" viewBox="0 0 920 300" style="width:100%;height:auto"></svg>
      </div>
      <div class="legend">
        <span><i style="background:var(--blue)"></i>ราคา ${esc(doc.symbol)}</span>
        <span><i style="background:#1e8e3e"></i>มูลค่าเหมาะสม {{rd:fv}}</span>
        <span><i style="background:#ea4335;height:8px;width:8px;border-radius:50%"></i>จุดสำคัญ</span>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:12px;line-height:1.6">
        ${pr(doc.prose.chart)}
      </p>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">3</div><h2>การประเมินมูลค่า (Valuation)</h2><div class="hint">${doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย'} ${view.legs.length} วิธี</div></div>
    <div class="card">
      ${legsHtml}
      <div class="fv-box">
        <div class="l">มูลค่าเหมาะสม${doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย'} (Fair Value)<br><span style="font-weight:400;font-size:12px;color:var(--muted)">กรอบ {{rd:fvLow}} – {{rd:fvHigh}}</span></div>
        <div class="r">{{rd:fv}}</div>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:12px;line-height:1.6">
        ${pr(doc.prose.valuation)}
      </p>
    </div>
  </section>${extrasHtml(doc, view, 'valuation')}

  <section>
    <div class="s-head"><div class="n">4</div><h2>ราคาปัจจุบัน vs โซนต่างๆ</h2></div>
    <div class="card">
      <div class="gauge">
        <div class="gbar" id="gbar">
          <div class="marker cur" id="mCur"><div class="lab">ปัจจุบัน {{rd:px}}</div></div>
          <div class="marker" id="mFair"><div class="lab" style="background:#067647">เหมาะสม {{rd:fv}}</div></div>
        </div>
        <div class="scale">
          ${scale}
        </div>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:18px;line-height:1.6">
        ${pr(doc.prose.gauge)}
      </p>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">5</div><h2>Margin of Safety (ส่วนเผื่อความปลอดภัย)</h2></div>
    <div class="card">
      <div class="mos-verdict {{rd:mosClass}}">
        <div class="big">{{rd:mos}}</div>
        <div class="txt">${pr(doc.prose.mos)}</div>
      </div>
      <div class="grid g3">
        <div class="metric"><div class="k">จุดซื้อ MOS 20%</div><div class="v pos">{{rd:mos20}}</div><div class="d">โซนน่าสนใจสำหรับ value</div></div>
        <div class="metric"><div class="k">จุดซื้อ MOS 30%</div><div class="v pos">{{rd:mos30}}</div><div class="d">โซนถูกมาก (deep value)</div></div>
        <div class="metric"><div class="k">โซนเริ่มทยอยสะสม</div><div class="v neu">&lt; {{rd:fv}}</div><div class="d">ใกล้/ต่ำกว่ามูลค่าเหมาะสม</div></div>
      </div>
      <div class="calc">
        <label>ลองคำนวณ MOS เอง — ใส่ราคาที่สนใจ (${TH ? 'บาท' : 'USD'})</label>
        <div class="calc-row">
          <input id="pxIn" class="mono" type="number" value="{{rd:pxNum}}" step="${TH ? '0.05' : '0.5'}">
          <div class="calc-out" id="mosOut"></div>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div class="s-head"><div class="n">6</div><h2>คาดการณ์ผลตอบแทน ${s.years} ปี</h2><div class="hint">จากจุดเข้า {{rd:px}}${s.driver === 'eps' ? ' • EPS ฐาน ~{{rd:baseEps}}' : ''}{{rd:scnNote}}</div></div>
    <div class="scn">
      ${col(0, 'bear', 'Bear')}
      ${col(1, 'base', 'Base')}
      ${col(2, 'bull', 'Bull')}
    </div>
    <p style="font-size:12.5px;color:var(--muted);margin-top:14px;line-height:1.6;padding:0 4px">
      ${pr(s.note)}
    </p>
  </section>${extrasHtml(doc, view, 'scenarios')}

  <section>
    <div class="s-head"><div class="n">7</div><h2>ปัจจัยบวก & ความเสี่ยง</h2></div>
    <div class="cr">
      <div class="box cat">
        <h3><span class="ic">▲</span>Catalysts — ปัจจัยหนุน</h3>
        <ul>
          ${li(doc.catalysts)}
        </ul>
      </div>
      <div class="box risk">
        <h3><span class="ic">▼</span>Risks — ความเสี่ยง</h3>
        <ul>
          ${li(doc.risks)}
        </ul>
      </div>
    </div>
  </section>${extrasHtml(doc, view, 'catalysts')}

  <section>
    <div class="s-head"><div class="n">8</div><h2>สรุปภาพรวม</h2></div>
    <div class="verdict">
      <h2>${pr(doc.prose.verdictHeadline)}</h2>
      <p>${pr(doc.prose.verdictBody)}</p>
      <div class="vgrid">
        <div class="vcell"><div class="k">มูลค่าเหมาะสม</div><div class="v">{{rd:fv}} <span style="font-size:12px;color:#cab9a8">({{rd:fvLow}}–{{rd:fvHigh}})</span></div></div>
        <div class="vcell"><div class="k">ส่วนต่างจากราคา</div><div class="v">MOS ~ {{rd:mos}}</div></div>
        ${analystCell}
      </div>
      <div class="zone">
        <b>กลยุทธ์:</b> ${pr(doc.prose.strategy)}
      </div>
    </div>
  </section>

  <div class="disc">
    <b>คำเตือน:</b> รายงานนี้จัดทำเพื่อการศึกษาและเป็นข้อมูลประกอบการตัดสินใจเท่านั้น <b>ไม่ใช่คำแนะนำให้ซื้อหรือขายหลักทรัพย์</b>
    ตัวเลข valuation อิงสมมติฐานที่อาจคลาดเคลื่อน โดยเฉพาะ P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต
    ราคาหุ้นมีความผันผวนสูง ผู้ลงทุนควรศึกษาข้อมูลเพิ่มเติมและพิจารณาความเสี่ยงของตนเองก่อนตัดสินใจ • ${pr(doc.prose.disclaimerSources)}
  </div>
  <footer>Stock Analysis Dashboard • ข้อมูล ณ ${esc(view.analysisDateText)} • สร้างด้วย stock-analyzer workflow</footer>

</div>

<!--TEMPLATE:ENGINE-->
</body>
</html>
`;
}

module.exports = { toV2Source, mdesc };
```

- [ ] **Step 4: Run the tests and iterate on gate findings**

Run: `node test/v3-test.js`
Expected: `✓ render: 11/11`.

If the v2 gate reports errors, each error names a check id. Fix **render.js** (never the gate) using the table below. These are the likely ones:

| id | likely cause | fix in render.js |
|---|---|---|
| E12 | header year check can't read the date | keep `ราคา ณ {{rd:priceDate}}` exactly as in skeleton (no extra text before it) |
| E32 | `.sub` not directly after `</h1>` | keep `<h1>…</h1>\n    <div class="sub">` adjacent |
| E40 | tags.json has no entry | fixtures use ZTS/BBL which exist in `tags.json` — don't rename fixtures |
| E41/E43/W19/W20 | base line not parsed | adjust `cards.js` d-line form (Task 7 step 4) |
| E26 | scale ordering | the sort above; check `d.values.fvHigh` is set by the bridge |
| E44 | literal price in prose | the fixture prose should use tokens; `mode:'v2src'` must be used everywhere |
| V2TOKENS | a required token site not found by `RV.missingTokenSites` (regex-located) | copy the site's markup/whitespace from `_template/skeleton-th.html` exactly |
| E38 | theme contrast | fixtures carry the real palettes from `reports/ZTS.html`/`BBL.html` — don't edit them |
| E21/E22 | gate parses `.mdesc` of a leg named "P/E"/"Justified P/BV" | make `mdesc()` output match the skeleton sentence (`EPS (TTM) $x × P/E เป้าหมาย ~Nx`) for `pe`, and `P/BV เหมาะสม = (ROE…` for justified pbv |

Add CSS for `.xtab` to `_template/dashboard.css` only if the extras test passes but the table looks unstyled in Task 11's visual check. Keep it minimal: `width:100%;border-collapse:collapse;font-size:13px` plus `td,th{padding:6px 8px;border-bottom:1px solid var(--line)}`.

- [ ] **Step 5: Commit**

```bash
git add _template/v3/render.js test/v3/render.test.js
git commit -m "feat(v3): single template renders v3 → v2-shaped source; fixtures pass the full v2 gate"
```

---

### Task 10: `build.js` dual path + v3 freshHash + collision guard

**Files:**
- Modify: `build.js:661-696` (report loop), `build.js:635` (exports)
- Test: `test/v3/build.test.js`

**Interfaces:**
- Consumes: `compute`, `toV2Source`, `IO.freshHash`, `tools/seeds.json`.
- Produces: `loadReportSource(dir, name, seeds) → {symbol, file, content, hash, v3:boolean}` (exported from build.js). `file` is always `<SYM>.html` (the dist filename, so `reports.json.url` stays unchanged). It throws on a `.json`/`.html` collision (`reportEntries(dir) → names[]`).

- [ ] **Step 1: Write the failing test**

`test/v3/build.test.js`:
```js
'use strict';
const t = require('./_t.js')('build');
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../../build.js');
const IO = require('../../tools/v3/io.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3build-'));
fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'v3', 'ZTS.json'), path.join(dir, 'ZTS.json'));
fs.writeFileSync(path.join(dir, 'AAA.html'), '<!DOCTYPE html><html lang="th"><head><title>AAA</title></head><body></body></html>');
const names = B.reportEntries(dir);
t.eq(names.sort(), ['AAA.html', 'ZTS.json'], 'entries include .json and .html');
const r = B.loadReportSource(dir, 'ZTS.json', { ZTS: '#e8731a' });
t.eq([r.symbol, r.file, r.v3], ['ZTS', 'ZTS.html', true], 'v3 entry publishes as <SYM>.html');
t(r.content.includes('id="report-data"') && r.content.includes('<!--TEMPLATE:STYLE-->'), 'content is v2-shaped source');
t.eq(r.hash, IO.freshHash(IO.read(path.join(dir, 'ZTS.json'))), 'hash = v3 freshHash (ignores market)');
const h = B.loadReportSource(dir, 'AAA.html', {});
t.eq([h.symbol, h.file, h.v3], ['AAA', 'AAA.html', false], 'v2 entry unchanged');
// Review Focus #5 — collision
fs.writeFileSync(path.join(dir, 'ZTS.html'), '<!DOCTYPE html>');
t.throws(() => B.reportEntries(dir), /ZTS.*ทั้ง .html และ .json/, 'same symbol as .html and .json fails loudly');
t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/v3-test.js`
Expected: FAIL — `B.reportEntries is not a function`.

- [ ] **Step 3: Implement in `build.js`**

Near the other requires at the top of build.js, add:
```js
const V3C = require('./tools/v3/compute.js');
const V3R = require('./_template/v3/render.js');
const V3IO = require('./tools/v3/io.js');
```

★ `build.js:637` has `if (require.main !== module) return;` — everything below it is unreachable when a test `require`s build.js. So add the following **above `module.exports` (build.js:635)**, not near the report loop:
```js
// ── v3 (spec 2026-09-24): reports/<SYM>.json = ต้นฉบับ → compute → toV2Source → ทางเดิมทุกขั้น ──
// หุ้นเดียวห้ามมีทั้ง .html (v2) และ .json (v3) — ไม่งั้นไม่รู้ว่าอันไหนจริง
function reportEntries(dir) {
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && /\.(html|json)$/i.test(e.name)).map((e) => e.name);
  const sym = (n) => n.replace(/\.(html|json)$/i, '');
  const html = new Set(names.filter((n) => /\.html$/i.test(n)).map(sym));
  const both = names.filter((n) => /\.json$/i.test(n)).map(sym).filter((s) => html.has(s));
  if (both.length) throw new Error(`reports/: หุ้นมีทั้ง .html และ .json — ${both.join(', ')} (ลบไฟล์ v2 ออกเมื่อย้ายเป็น v3)`);
  return names;
}
function loadReportSource(dir, name, seeds) {
  const symbol = name.replace(/\.(html|json)$/i, '');
  const raw = fs.readFileSync(path.join(dir, name), 'utf8');
  if (/\.json$/i.test(name)) {
    const doc = JSON.parse(raw);
    if (doc.symbol !== symbol) throw new Error(`${name}: symbol "${doc.symbol}" ไม่ตรงชื่อไฟล์`);
    const view = V3C.compute(doc, { seeds });
    return { symbol, file: symbol + '.html', content: V3R.toV2Source(doc, view), hash: V3IO.freshHash(doc), v3: true };
  }
  return { symbol, file: name, content: raw, hash: freshHash(raw), v3: false };
}
const SEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
```

Replace the head of the report loop:
```js
  for (const entry of fs.readdirSync(REPORTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.html$/i.test(entry.name)) continue;

    const src = path.join(REPORTS_DIR, entry.name);
    const content = fs.readFileSync(src, 'utf8');
    const symbol = entry.name.replace(/\.html$/i, '');
    const h = freshHash(content); // ตัด meta ai-model ออกจาก hash → ประทับโมเดลไม่นับเป็น "อัปเดต"
```
with:
```js
  for (const name of reportEntries(REPORTS_DIR)) {
    const { symbol, file, content, hash: h } = loadReportSource(REPORTS_DIR, name, SEEDS);   // v2: hash = freshHash(content) เดิม
```
Then, in the rest of the loop body, replace `entry.name` with `file` (it occurs in `rec = { symbol, file: entry.name, …}`, `path.join(OUT, entry.name)`, and `log('report:', entry.name, …)`).

Add `reportEntries, loadReportSource` to `module.exports` (build.js:635). `freshHash` and `ROOT` are defined above line 635 already (build.js:83, :4x), so the new functions can use them.

- [ ] **Step 4: Run tests + the real build + the existing gate**

Run: `node test/v3-test.js && npm run build && node test/build-test.js && node test/check-site.js`
Expected: `✓ build: 7/7`. The build output is identical to before, because no `.json` exists in `reports/`. Confirm with `rtk proxy git status --short reports.json` → no change.

- [ ] **Step 5: Commit**

```bash
git add build.js test/v3/build.test.js
git commit -m "feat(v3): build reads reports/<SYM>.json alongside v2 .html (v3 freshHash, collision guard)"
```

---

### Task 11: Wire into `verify`, end-to-end smoke in a scratch copy, card census

**Files:**
- Create: `tools/v3/card-census.js`
- Modify: `package.json` (scripts), then regenerate the docs counters with `node tools/gen-docs.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `npm run test:v3`. `verify` now has 19 steps and runs `test/v3-test.js` right after `report-values-test.js`. Also produces `node tools/v3/card-census.js > docs/superpowers/specs/2026-09-24-card-census.md`.

- [ ] **Step 1: Add the script and the verify step**

In `package.json` `scripts`, add `"test:v3": "node test/v3-test.js",`. In `verify`, insert `node test/v3-test.js && ` immediately after `node test/report-values-test.js && `.

- [ ] **Step 2: Regenerate docs counters and run the full gate**

Run: `node tools/gen-docs.js && npm run verify`
Expected: all 19 steps pass. `gen-docs` rewrites the `<!-- gen:verify-steps -->` blocks in CLAUDE.md/docs (18 → 19), and `docs-test` stays green.

- [ ] **Step 3: End-to-end smoke in a scratch copy (proves a real `.json` publishes)**

```bash
S=$(mktemp -d) && git worktree add "$S" HEAD -f --detach && cd "$S" \
 && cp test/fixtures/v3/ZTS.json reports/ZTS.json && git rm -q reports/ZTS.html \
 && node -e "const f='reports/ZTS.json',d=require('./'+f),t=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);d.market.priceDate=t;d.meta.analysisDate=t;require('./tools/v3/io.js').write(f,d)" \
 && node build.js && node test/build-test.js && node test/check-site.js && grep -c 'id="priceChart"' dist/ZTS.html \
 && cd - && git worktree remove --force "$S"
```
Expected: the build succeeds, `check-site` passes, and the grep prints `1`. Nothing in the main working tree changes. This is a smoke test only, and the fixture is never committed into `reports/`.

- [ ] **Step 4: Visual check (owner cares about looks — memory `feedback-owner-design-taste`)**

In the scratch copy from Step 3 (re-create it if you removed it), run `npx wrangler dev` and open `/ZTS.html`. Take a screenshot and put it beside today's production page `https://gaohoon.com/ZTS.html`. Only differences in the *content* (the fixture text) are acceptable. Layout, fonts, colours and component styling must match. Save both screenshots into the PR description. Then stop wrangler and remove the worktree.

- [ ] **Step 5: Card census for the owner (spec §13.2)**

`tools/v3/card-census.js`:
```js
'use strict';
/**
 * card-census.js — นับ label การ์ด section 1 ทั้งคลัง v2 แล้วจัดกลุ่มเข้าคีย์แคตตาล็อก v3
 * ใช้: node tools/v3/card-census.js > docs/superpowers/specs/2026-09-24-card-census.md
 * ผลลัพธ์ = ตารางให้เจ้าของดูว่าแคตตาล็อกครอบกี่ % และ label ไหนตกเป็น custom
 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'reports');
const RULES = [
  ['mcap', /market\s*cap|มูลค่าตลาด/i], ['pe', /^P\/E(?!.*(เฉลี่ย|avg|median|5|10|fwd|forward))/i], ['peAvg5y', /P\/E.*(เฉลี่ย|avg|median|5\s*ปี|10\s*ปี)/i],
  ['pbv', /^P\/B/i], ['ps', /^P\/S/i], ['netIncome', /กำไรสุทธิ|net\s*income/i], ['eps', /^EPS/i], ['bvps', /^BVPS|book\s*value/i],
  ['roe', /ROE/i], ['revenue', /รายได้|revenue/i], ['grossMargin', /gross|ขั้นต้น/i], ['netMargin', /net\s*margin|กำไรสุทธิ.*%|อัตรากำไรสุทธิ/i],
  ['opMargin', /operating|ดำเนินงาน|EBIT\s*margin/i], ['yield', /ปันผล|dividend/i], ['beta', /beta/i], ['range52w', /52/],
  ['fcf', /FCF|free\s*cash/i], ['debtToEquity', /D\/E|หนี้.*ทุน|debt/i],
];
const counts = {}, unmatched = {};
let cards = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(DIR, f), 'utf8');
  const s1 = (html.match(/<div class="n">1<\/div>[\s\S]*?<\/section>/) || [''])[0];
  for (const m of s1.matchAll(/<div class="k">([\s\S]*?)<\/div>/g)) {
    const label = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    cards++;
    const hit = RULES.find(([, re]) => re.test(label));
    if (hit) counts[hit[0]] = (counts[hit[0]] || 0) + 1; else unmatched[label] = (unmatched[label] || 0) + 1;
  }
}
const covered = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`# Card census — ${cards} การ์ดใน ${fs.readdirSync(DIR).length} ใบ\n`);
console.log(`แคตตาล็อกครอบ **${covered}/${cards} (${(covered / cards * 100).toFixed(1)}%)**\n\n| คีย์ | การ์ด |\n|---|---|`);
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`| ${k} | ${n} |`);
console.log(`\n## label ที่ไม่ลงแคตตาล็อก (top 60 → custom หรือเพิ่มคีย์)\n\n| label | การ์ด |\n|---|---|`);
for (const [k, n] of Object.entries(unmatched).sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`| ${k.replace(/\|/g, '\\|')} | ${n} |`);
```
Run: `node tools/v3/card-census.js > docs/superpowers/specs/2026-09-24-card-census.md && head -5 docs/superpowers/specs/2026-09-24-card-census.md`
Expected: the coverage line. **If coverage is below 90%**, add the most frequent unmatched labels as new catalogue keys. Each new key needs the same 3 edits: `S.CARD_KEYS`, `CATALOGUE`, and `FUND_KEYS` if it needs data. Repeat Tasks 2 and 7 step 4 for them. Stop once coverage reaches ≥90% (spec §13.2 target: ~25 keys covering ≥90%).

- [ ] **Step 6: Commit**

```bash
git add package.json CLAUDE.md docs/ tools/v3/card-census.js _template/dashboard.css
git commit -m "chore(v3): add test:v3 to verify (19 steps) + card census for owner review"
```

---

### Task 12: Final whole-branch check + advisor gate

- [ ] **Step 1:** Run `rtk proxy npm run verify`. It must be all green. Paste the tail of the output into the PR description.
- [ ] **Step 2:** Run `rtk proxy git diff main --stat`. There must be no changes under `reports/`, and `reports.json` must be unchanged.
- [ ] **Step 3:** The controller calls `advisor` before opening the PR (CLAUDE.md §7: structural change). Include the census coverage figure and the two screenshots.
- [ ] **Step 4:** Open the PR. Title: `report v3 — Plan 1: core + render (no report changes)`. The body summarises what's in Plan 1 and links the spec, this plan, and the card census. **Do not merge without the owner's OK** (CLAUDE.md §5: structural changes are summarised before push).
