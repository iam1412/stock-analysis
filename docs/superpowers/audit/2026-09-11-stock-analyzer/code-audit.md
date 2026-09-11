# Structural audit — stock-analysis report pipeline

Read-only audit. Worktree: `/Users/somchai.s/Downloads/stock/.claude/worktrees/stock-analyzer-audit-9678cd`.
Corpus at time of audit: **908 reports** (670 `$`, 238 `฿`).
Sizes: `build.js` 1503 · `tools/derived-values.js` 910 · `tools/update-prices.js` 906 · `test/self-test.js` 865 · `test/check-reports.js` 832 · `test/update-prices-test.js` 731 · `test/check-site.js` 494.

---

## 0. The one-paragraph shape of the system

A report is an HTML file in which **every number is materialised as rendered display text** — there is no data layer. The same quantity is typed out in up to 9 separate places (see §1 header). Three separate programs then re-derive that quantity by regex from the rendered text: the cron patcher (`tools/update-prices.js` → `patchDerived` in `tools/derived-values.js`), the gate (`test/check-reports.js`), and the controller's advisory tools (`tools/spotcheck.js`, `tools/median-multiples.js`). A fourth actor — an LLM worker — edits the same text by hand. Every number that is not simultaneously (a) written by cron, (b) checked by the gate and (c) healable, drifts silently and is discovered only when a human reads a page. That is the generator of the "new bug class every run" complaint, and §1 is its map.

---

## 1. FIELD MATRIX

### 1.0 Denormalisation census (the root evidence)

Occurrences of one logical value in `_template/skeleton-us.html` (identical in `skeleton-th.html`):

| Logical value | Skeleton lines | copies |
|---|---|---|
| **price** | 24 (`stock-meta.price`), 29–30 (report-data comments), 57 (`.px`), 152 (gauge `mCur` label), 186 (`pxIn value`), 195 (section-6 "จากจุดเข้า") + `report-data.gauge.cur` + `chart.data[last][1]` | **7–8** |
| **fair value** | 9, 24 (`stock-meta.fairValue`), 28, 107 (legend), 137 (`.fv-box .r`), 153 (gauge `mFair` label), 158 (gauge scale), 181 ("< $FV" card), 270 (vcell) + `report-data.fv` + `gauge.fair` + `chart.fairLine` | **9–10** |
| **MOS** | 24 (`stock-meta.mos`), 175 (`.big`), 271 (vcell "ส่วนต่างจากราคา") + `mos-verdict` class (174) | **4** |
| **analyst target** | 159 (gauge scale), 272 (vcell) | **2** |
| **FV_LOW / FV_HIGH** | 136 (`.fv-box` กรอบ), 160 (gauge scale = FV_HIGH), 270 (vcell) | **3** |
| **P/E** | 24 (`stock-meta.pe`), 80 (card) | **2** |
| **dividend yield** | 24 (`stock-meta.dividendYield`), 91 (card) | **2** |
| **ROE** | 24 (`stock-meta.roe`), 87 (card) | **2** |
| **price date** | 64 (`px-meta`), 284 (disclaimer "ราคา ณ"), 286 (footer "ข้อมูล ณ") | **3** |

There is no single source of truth for any of them. The "keep it in one place" discipline exists only for *parsers* (`tools/price-date.js`, `tools/report-meta.js`, `tools/derived-values.js`) — never for *values*.

### 1.1 The matrix

Legend — **cron**: patched by `tools/update-prices.js`/`patchDerived`. **gate**: any E/W code binds it. **healer**: `--heal-derived` can converge it. **cadence**: `daily` = must move when price moves; `write-once` = set at analysis time.

Three coverage failure modes, not one:
- **`NEITHER`** — no cron write, no gate check. The field simply rots.
- **`UNVERIFIED WRITE`** — cron rewrites it every day and **nothing checks the result**. Worse than NEITHER: a wrong value is being actively (re)produced.
- **`WARN-ONLY`** — the only check is a non-blocking warning, so a wrong value ships.

| # | Field (skeleton line) | Lives in | Cron patches | Gate checks | Healer | Cadence |
|---|---|---|---|---|---|---|
| 1 | `.px` header price (57) | prose-in-markup | ✔ `patchReport` `update-prices.js:505-506` (`need()`, hard) | ✔ E30 `check-reports.js:399` vs stock-meta; E23 `:370` vs pxIn | ✔ (reads it as input, `:673`) | daily |
| 2 | `stock-meta.price` (24) | JSON | ✔ `update-prices.js:496,501` | ✔ E29/E30/E31 `:379-411` | — | daily |
| 3 | `report-data.gauge.cur` | JSON | ✔ `:476` | ✔ E19 `:365` (via baked `gpos()` `_template/engine.js:34`) | — | daily |
| 4 | `report-data.chart.data[]` | JSON | ✔ `:468` (`buildChartData` `:185`) | ✔ E36/E37/E39/W12 | — | daily |
| 5 | `chart.min/max/grid` | JSON | ✔ `:471` (`niceBounds` `:248`) | **WARN-ONLY** `check-site.js:118-120` | — | daily |
| 6 | `chart.highlight` | JSON | ✔ `:474` | shape only, `build.js:170-171` | — | daily |
| 7 | `gauge.min/max` | JSON | ✔ `:480-487` (grow-only) | **WARN-ONLY** `check-site.js:129`; `build.js:186` degenerate-throw | — | daily |
| 8 | `theme.chgBg/chgColor` (32) | JSON | ✔ `:490` | ✔ E34 `:436` | — | daily |
| 9 | `.chg` annual % label (62) | prose | ✔ `:539-540` (`need()`) | ✔ E35 `:454`, E36 `:468` (tol **12 pp**) | — | daily |
| 10 | price date in `px-meta` (64) | prose | ✔ `:512-528` via `price-date.js` (throws → `patch-failed`) | ✔ E27 `:374` / W09 `:549` — **but silent if unparseable** | — | daily |
| 11 | restated date in parens | prose | ✔ `:522` `findRestatedDate` (silent on miss) | **UNVERIFIED WRITE** | — | daily |
| 12 | disclaimer "ราคา ณ" (284) | prose | ✔ `:531-536` **no `need()` → silent no-op** | **UNVERIFIED WRITE** (nothing compares it to #10) | — | daily |
| 13 | footer "ข้อมูล ณ" (286) | prose | ✘ (deliberately, `preserve-dates.js:30-37`) | **NEITHER** — only *read* by `preserve-dates.js:35` | — | write-once |
| 14 | `pxIn value=` (186) | attribute | ✔ `:582-583` (`need()`) | ✔ E23 `:370` | — | daily |
| 15 | MOS `.big` (175) | prose | ✔ `:547-549` (`need()`) | ✔ E16 `:362`, E30 `:401` | — | daily |
| 16 | `stock-meta.mos` / `.upside` | JSON | ✔ `:496` | ✔ E30/E31 `:396-411` | — | daily |
| 17 | vcell "ส่วนต่างจากราคา" number (271) | prose | ✔ `:558-573` **conditional, silent** (skips if wording conflicts) | ✔ W06 `:546` (warn, tol 3 pp) | — | daily |
| 18 | vcell "ส่วนต่างจากราคา" **wording** | prose | ✘ by policy (`:556`) | W06 direction only | — | human |
| 19 | `mos-verdict` class (174) | class attr | ✔ `:579` **no `need()`** | ✔ W04 `:539` (warn, only if ≥2 bands off) | — | daily |
| 20 | card **P/E** (80) | card `.v` | ✔ `patchDerived` #1 `derived-values.js:665-683` | ✔ E41 `:608` | ✔ | daily |
| 21 | `stock-meta.pe` (24) | JSON | ✔ `derived-values.js:689-702` | ✔ E41 `:618-620`; W10 `:551` | ✔ | daily |
| 22 | analyst-target **%** in card (272) | card `.v` | ✔ `patchDerived` #3 `:706-711` | ✔ E42 `:627` (tol 2 pp) | ✔ | daily |
| 23 | analyst-target **price** in card (272) | card `.v` | ✘ (fact) | **NEITHER** — never compared to #24 or to a source | — | write-once/stale |
| 24 | analyst target on **gauge scale** (159) | prose | ✘ | **NEITHER** except E26 `:373` ordering | — | write-once/stale |
| 25 | analyst **rating** (272) | prose | ✘ | **NEITHER** | — | write-once/stale |
| 25b | analyst **count** ("n=4 สำนัก" / "(n=1)" — in `.mdesc` or prose) | prose | ✘ | **NEITHER** — no code reads it at all; only `spotcheck.js:52-57` tells a human to re-verify it (AEHR: stale at avg $115 n=3 while truth was $130 n=4) | — | write-once/stale |
| 26 | card **Market Cap** (79) | card `.v` | ✔ `patchDerived` #5 `:716-729` | ✔ E43 `:645` | ✔ | daily |
| 27 | card **shares** `.d` (79) | card `.d` | ✘ (divisor) | read-only by `parseShares` `:87` | — | write-once |
| 28 | card **P/S** | card `.v` | ✔ `patchDerived` #6 `:734-753` | ✔ W16 `:660` **warn** (cross-card) | ✔ | daily |
| 29 | card **dividend %** (91) | card `.v` | ✔ `patchDerived` #8 `:761-769` (added 11 Sep 2026) | ✔ W19 `:741` **warn** | ✔ | daily |
| 30 | `stock-meta.dividendYield` (24) | JSON | ✔ `:771-782` | ✔ W19 `:747`; W10 `:551` | ✔ | daily |
| 31 | card **P/BV** (82) | card `.v` | ✔ `patchDerived` #10 `:784-795` | ✔ W20 `:756` **warn** | ✔ | daily |
| 32 | card **BVPS** (86) | card `.v` | ✘ (fact) | **NEITHER** (only read as divisor for #31, via `BV_KW` `:527`) | — | write-once |
| 33 | card **EPS (TTM)** (85) | card `.v` | ✘ (fact) | **NEITHER** — divisor only (`epsBasesOf` reads the `.d` line, `:166`, not this card) | — | write-once |
| 34 | section-6 scenario **total %** (201/214/227) | prose | ✔ `patchDerived` #7 `:804-827` (`scenarioPlan`) | ✔ W17 `:687` **warn** | ✔ | daily |
| 35 | section-6 **%/yr** | prose | ✔ same | ✔ W17 | ✔ | daily |
| 36 | section-6 "จากจุดเข้า $X" (195) | prose hint | ✔ `:819-823` | ✔ W17 `:707-709` | ✔ | daily |
| 37 | section-6 **target price** (200 etc.) | prose | ✘ by design (assumption) | W01 `:536` warn (EPS×PE≈tgt, tol 7%) | — | write-once |
| 38 | section-6 `class="ret pos/neg"` | class | ✘ explicitly `derived-values.js:246-248` | ✘ explicitly | — | never |
| 39 | section-6 **dividend 3-yr row** | prose | ✘ | read-only (`SCN_DPS_RE` `:262`) | — | write-once |
| 40 | section-6 "EPS ฐาน ~$X" (195) | prose | ✘ | ✔ E24 `:371` (EPS y3 = base×(1+g)³) | — | write-once |
| 41 | **52-week range** (65) | prose | ✘ | **NEITHER** — W08 `:548` only asserts the *phrase* `52 สัปดาห์` exists anywhere | — | stale daily |
| 42 | **sources line** (66) | prose | ✘ | W08 `:548` counts ≥3 items | — | write-once |
| 43 | `.fv-box .r` FV (137) | prose | ✘ | ✔ E15 `:361` vs `const FV`; E25 `:372` vs vcell; E30 vs stock-meta | — | write-once |
| 44 | `report-data.fv` → `const FV` | JSON→JS | ✘ | ✔ E15 (via `engine.js:42`) | — | write-once |
| 45 | `report-data.gauge.fair` | JSON | ✘ | ✔ E19 (via `engine.js:35`) | — | write-once |
| 46 | **`report-data.chart.fairLine`** | JSON | read-only `:470` | **NEITHER** — `build.js:180` only asserts it is a finite number; **nothing asserts it equals FV** | — | write-once |
| 47 | legend "มูลค่าเหมาะสม $FV" (107) | prose | ✘ | **NEITHER** | — | write-once |
| 48 | "โซนเริ่มทยอยสะสม < $FV" card (181) | card `.v` | ✘ | **NEITHER** | — | write-once |
| 49 | gauge `mFair` label text (153) | prose | ✘ | **NEITHER** (E19 checks the baked `gpos()` arg, not the label text) | — | write-once |
| 50 | gauge `mCur` label text (152) | prose | ✔ `:543-544` (`need()`) | **UNVERIFIED WRITE** — no check ties the label text to `.px` (E19 checks the baked `gpos()` arg, a different value) | — | daily |
| 51 | gauge scale MOS20/MOS30 (156-157) | prose | ✘ | ✔ E26 `:373` | — | write-once |
| 52 | MOS20/MOS30 cards (179-180) | card `.v` | ✘ | ✔ E18 `:364` | — | write-once |
| 53 | gauge scale FV_HIGH (160) | prose | ✘ | E26 ordering only | — | write-once |
| 54 | vcell `($FV_LOW–$FV_HIGH)` (270) | prose | ✘ | **NEITHER** — E20 `:366` reads the `.fv-box` กรอบ only | — | write-once |
| 55 | card **P/E เฉลี่ย ~5 ปี** + range (81) | card | ✘ (`PE_LABEL_SKIP` `:43` excludes it) | **NEITHER** — documented failure (memory: GABLE "5 ปี" on a 3-yr-old IPO) | — | write-once |
| 56 | card **ROE / ROA** (87) | card | ✘ | W07 `:547` sanity band; W10 `:551` vs stock-meta | — | write-once |
| 57 | `stock-meta.roe` | JSON | ✘ | E29 type; W10 | — | write-once |
| 58 | card **Net profit / YoY** (84) | card | ✘ | **NEITHER** | — | write-once |
| 59 | card **Revenue TTM** (89) | card | ✘ | read-only as P/S divisor (`psCards` `:124`) | — | write-once |
| 60 | card **gross margin** (90) | card | ✘ | **NEITHER** | — | write-once |
| 61 | card **Beta** (92) | card | ✘ | **NEITHER** | — | write-once |
| 62 | valuation `.mval` per method (125 etc.) | prose | ✘ | E21 `:368`, E22 `:369`, W14 `:590` — **only when the formula parses**; W05 `:544` avg; W18 `:724` dead anchor | — | write-once |
| 63 | valuation `.mdesc` multipliers | prose | ✘ | W18 `:724` only for the explicit "target≈current" phrasing | — | write-once |
| 63b | **ATH / "จาก ATH −X%"** in prose (29 reports) | prose | ✘ — and `derived-values.js:50` `PCT_NOT_VS_PRICE` explicitly **excludes** `จาก\s*ATH` from W15/heal so it is never touched | **NEITHER**. `update-prices.js:509-510` records that the old cron used to stamp the run date over the ATH *date*; the fix removed the write without adding a check | — | stale daily |
| 64 | **prices written in prose** (any §) | prose | ✘ by policy (CLAUDE.md §9) | **NEITHER** — only `tools/spotcheck.js:65-69`, not a gate | `--heal-derived --prose` (opt-in, `:830`) | stale daily |
| 65 | **% of target in prose** | prose | ✘ | W15 `:771` **warn**, 3 filters | opt-in only | stale daily |
| 66 | `meta ai-model` (21) | meta | ✘ | E28 `:376` **format only** | — | write-once |
| 67 | `.sub` blurb (54) | prose | ✘ | E32 `:415` presence/length | — | write-once |
| 68 | tags (sidecar) | `tags.json` | ✘ | E40 `:566`, W13 `:581` | `tag-apply.js` | out-of-band |

**Tallies**

- **NEITHER — 18 rows:** #13, 23, 24, 25, 25b, 32, 33, 41, 46, 47, 48, 49, 54, 55, 58, 60, 61, 63b — plus **#64 (prices in prose)**, which is by volume the largest uncovered surface in the corpus.
- **UNVERIFIED WRITE — 3 rows:** #11 (restated date), #12 (disclaimer date), #50 (gauge `mCur` label text). Cron rewrites these every day and no check ever reads the result; #12 and #50 are also silent-on-miss writes (§2.2), so the cron cannot tell you whether it wrote them either.
- **WARN-ONLY — 2 structural rows** (#5 chart bounds, #7 gauge bounds) plus the numeric rows #17, 19, 28, 29, 31, 34, 35, 36, 62 whose only binding check is a warning.

Note the pattern in what *is* covered: **among the value fields, the set cron writes and the set the gate checks are nearly identical.** That is not a coincidence — each new W-code was landed together with its healer and scoped to it deliberately (`check-reports.js:685-686`, `:738-740`; `derived-values.js:349-350`, `:802-803`). So the gate can never discover the *next* uncovered field: by construction it only knows about fields the healer already handles.

---

## 2. REGEX INVENTORY

Raw regex-literal counts: `check-reports.js` 168 · `build.js` 165 · `derived-values.js` 136 · `check-site.js` 98 · `update-prices.js` 69 · `spotcheck.js` 12.

### 2.1 Cron writers — hard anchors (miss ⇒ `throw` ⇒ `patch-failed` flag, file untouched)

Only **8** sites are guarded. All are the *original* 2026-07 field set.

| Site | Regex | Field | On miss |
|---|---|---|---|
| `update-prices.js:438` | `STOCK_META_PARTS_RE` (`report-meta.js:14`) | stock-meta block (read) | `throw` |
| `:447` | `/(<script[^>]*\bid=["']report-data["'][^>]*>)([\s\S]*?)(<\/script>)/i` | report-data (read) | `throw` |
| `:500` | `STOCK_META_PARTS_RE` via `need()` | stock-meta (write-back) | `throw` — comment `:497-499` records this guard was **added after** a silent-miss bug |
| `:505` | `/(<div class="px">\s*[฿$])([\d.,]+)/` | header price | `throw` |
| `:517` | `findPriceDate` (`price-date.js`) | price date | `throw` |
| `:539` | `/<div class="chg"[^>]*>[\s\S]*?<\/div>/i` | annual % | `throw` |
| `:543` | `/(id="mCur"><div class="lab">ปัจจุบัน\s*[฿$]?)([\d.,]+)/` | gauge label | `throw` |
| `:547` | `/(<div class="big">)\s*[+\-−–]?\s*[\d.]+\s*%(<\/div>)/` | MOS big | `throw` |
| `:582` | `/(id="pxIn"[^>]*\bvalue=")[^"]*(")/` | calculator | `throw` |

### 2.2 Cron writers — **silent no-op on miss** (flagged)

| Site | Regex/field | On miss |
|---|---|---|
| `update-prices.js:463` | `.chg` read for IPO-suffix detection | `[, '']` default ⇒ suffix silently becomes "(รอบปี)" |
| `:464` | `<div class="n">2</div><h2>…` | default `''` |
| `:512` | `/<header[\s\S]*?<\/header>/i` | `throw` (guarded) |
| `:522` | `findRestatedDate` | **silent skip** — parenthetical date left stale |
| **`:531`** | disclaimer "ราคา ณ" replace | **silent pass** — no `need()`. Disclaimer date can diverge from header date indefinitely, and nothing checks it (matrix #12) |
| **`:558`** | `/(ส่วนต่างจากราคา<\/div>\s*<div class="v"[^>]*>)([\s\S]*?)(<\/div>)/` | **silent pass**; also self-vetoes at `:564` (`cheap===pricey`) and `:565` (direction conflict) and `:572` (`done` false) |
| **`:579`** | `/class="mos-verdict (bad\|ok\|good)"/` | **silent pass** |
| `:673` (`healDerived`) | `/<div class="px">\s*[฿$]?\s*([\d.,]+)/` | counted as `noPrice++`, file skipped |

### 2.3 `patchDerived` — **silence is the documented contract**

`derived-values.js:23-25`: "★ หลักที่ห้ามหลุด: **เงียบเมื่ออ่านฐานไม่ได้**". Every one of the 10 numbered passes returns the input unchanged on any parse ambiguity. Silent-exit points:

| Pass | Regex / gate | Silent-exit conditions |
|---|---|---|
| #1 P/E | `cardRe()` `:144`, `epsBasesOf` `:166` | label not `P/E`; `PE_LABEL_SKIP` `:43` (historic/peer/target labels); `.d` has no literal `EPS`; `.v` has no `Nx` |
| #2 `stock-meta.pe` | `:689` 3rd literal copy of the stock-meta regex | JSON parse fail; `pe` not a positive number |
| #3 target % | `MONEY_PCT_SRC` `:48` | label fails `TGT_LABEL_STRICT` `:45`; no `$X (+Y%)` shape |
| #5 Market Cap | `parseAmount` `:70`, `parseShares` `:87` | no scale word; `ADR|ADS` present `:89`; shares <1e5; `MCAP_BAND` `:39` violated |
| #6 P/S | `:735` | no readable Market Cap card ⇒ no basis |
| #8 yield | `yieldCardPlan` `:592` | `hits.length !== 1`; `YIELD_LABEL_SKIP` `:499`; `YIELD_PRE_SKIP` `:518` (26 alternatives); `SUB_AFTER` `:514`; `SCALE_AFTER` `:511`; `DENOM_MIN_PREC` `:523`; `DENOM_BAND` `:494`; currency ≠ `.px` currency `:550` |
| #9 `stock-meta.dividendYield` | `:774` 4th copy of the stock-meta regex | as above |
| #10 P/BV | `pbvCardPlan` `:607` | >3 multiples; `BV_KW`/`TBV_KW` `:527-528` mismatch; `assignBases` `:572` unmatched; band |
| #7 section-6 | `scenarioPlan` `:352` | 8 distinct `no(...)` returns `:354,356,358,365,404-406,439,460`; plus `scenarioBlock` `:296` returns null on 6 more conditions incl. the position-integrity guard `:333-334` |
| #4 prose % | opt-in only `:830` | `target < 0.25*price`; no `TGT_LABEL_STRICT`; `QUOTE_CONTEXT` `:53`; `PCT_NOT_VS_PRICE` `:50` |

### 2.4 Gate extractors — **"not found ⇒ pass"**

`test/check-reports.js` contains 66 `return null` statements. Classified:

**Error when their own input is unreadable (8 of 43):** E12 `:357`, E15 `:361`, E16 `:362`, E17 `:363`, E28 `:376`, E29 `:379`, E32 `:415`, E35 `:454`. (Plus the 11 pure-presence checks E01–E11 and the "must-not-contain" checks E13/E14/E33, where absence *is* the pass condition.)

**Silent pass when the extractor misses (21 error codes + all 19 warn codes):**

| Code | Line | Silent when |
|---|---|---|
| E18 | 364 | `fvBox == null` |
| E19 | 365 | `gpos()` arg unreadable — `cur != null &&` guards |
| E20 | 366 | no `class="fv-box"`, or no `กรอบ X–Y` match |
| E21 | 368 | no `P/E` method, or EPS/PE not parseable from `.mdesc` |
| E22 | 369 | ratio or BVPS not parseable |
| E23 | 370 | `px` or `pxInput` null |
| E24 | 371 | `baseEPS` null, or per-column eps/g null |
| E25 | 372 | `fvBox` or `vgridFV` null |
| E26 | 373 | `<4` scale spans; t20/t30 unreadable |
| **E27** | 374 | `!c.priceAge` — **an unparseable price date disables the 120-day staleness error entirely** |
| E30/E31 | 396/404 | `px`/stock-meta fields null |
| E34 | 436 | no `.chg`, no theme colours, or direction ambiguous |
| E36 | 468 | no `%` token, `chart.data` absent, `first === 0` |
| E37/E39 | 484/525 | `chart.data` not an array; E39 `:529` bails if **any** label is unrecognised |
| E38 | 494 | no `report-data`; `chk` `:498` skips when either colour is falsy |
| E40 | 566 | `tags.json`/vocab unloadable (`tagDefaults` `:34` swallows the error) |
| E41/E42/E43 | 608/627/645 | `px<=0`, or `DV.*Cards()` returns empty |
| W04–W20 | 539–791 | all guard-and-return-null |

Additionally `checkHtml` `:799` wraps every check in `try/catch` and turns a thrown exception into a *message*, so a crashing check reports as one finding rather than failing loudly — but the `expandReport` call at `:819` is **outside** that try, so a malformed `report-data` in one file aborts the entire run (see §6).

### 2.5 Same value, N different regexes

| Value | Distinct regexes |
|---|---|
| stock-meta block | `report-meta.js:12` + `:14` are the declared "single source" (its header `:5-8` exists precisely to forbid copies), yet the literal is re-written at `derived-values.js:624`, `:689`, `:774`, `migrate.js:91`, `check-reports.js:300`, `check-site.js:139`, `build.js:83` (freshHash) and `build.js:239` → **8 production copies**, plus 6 more in tests (`update-prices-test.js:159, 165, 183, 237` — which drop the `\b` — and `skeleton-test.js:177, 196`). **Only `update-prices.js` imports the module.** |
| `report-data` block | `update-prices.js:447`, `:492`, `check-reports.js:309`, `build.js:208`, `check-site.js:186`, `:193`, plus `update-prices-test.js:444, 452, 462, 470, 477` — **no shared module at all** |
| `.px` price | `update-prices.js:505/506` (`[฿$]`), `:673` (`[฿$]?`), `derived-values.js:531` (`C$\|[฿$]`), `check-reports.js:275` (`[\s\S]*?` + `firstNum`), `:281` (`[฿$]`), `check-site.js:110` — **6 regexes with 4 different currency vocabularies.** `derived-values.js:507` even accepts `C$ US$ HK$ S$ A$ NT$ R$ € £ ¥`, while `update-prices.js:505` would `throw` on a `C$` header (no such report today — a latent `patch-failed`-forever trap) |
| section-6 columns | `check-reports.js:106` `/<div class="col\s+(?:bear\|base\|bull)"/` (E24, W01) vs `derived-values.js:258` `/<div class="col ([a-z]+)">/` (W17 + healer). Four concrete divergences: (a) `\s+` vs a single literal space — `class="col  bear"` is visible only to the first; (b) `:258` requires `">` immediately after the kind, so `<div class="col bear" id="x">` is visible only to the first; (c) `:106` splits the **whole document**, `:297` anchors to the `class="scn"` section, so a stray `col bear` elsewhere is counted only by the first; (d) `:108` takes the **first 3** columns, `:329` requires **exactly 3 or bails entirely** |
| card k/v/d | `derived-values.js:143` `CARD_SRC` (`[\s\S]*?` inner — tolerates nested tags) vs `check-reports.js:220/242` `metricNumsAll`/`metricNum` (`<div class="v[^"]*">([^<]*)<` — **breaks on any nested tag**). E41 and W10 therefore disagree about which cards exist |
| gauge `gpos()` | `check-reports.js:365` `\s*=\s*gpos\(` vs `check-site.js:126` `\.style\.left=gpos\(` (no-whitespace) |

---

## 3. DUPLICATED KNOWLEDGE

### 3.1 Thresholds for "the same question" in ≥2 files

| Question | Values, by file |
|---|---|
| Price disagreement | `prep-stock.js:21` PASS 2% / `:22` STOP 5% (blocks spawn) · `update-prices.js:63` DRIFT_FREEZE 15% · `:64` SUSPECT_FREEZE 25% · `check-reports.js:399` (E30) 2% between stock-meta and header · `check-site.js:117` 3% chart-last-point (warn) · `spotcheck.js:24` PROSE_TOL 0.5% |
| MOS sign / band | `update-prices.js:65` `MOS_FLIP_DEADBAND_PP = 3` · `check-reports.js:52` `TOL_MOS_SUMMARY_PP = 3` (W06) · `:43` `TOL_MOS_PP = 2.0` (E16/E30/E31) — comments at `check-reports.js:50-51` explicitly cross-reference the cron constant, i.e. two files must be edited together |
| MOS→class band | **correctly single-sourced**: `update-prices.js:86` `mosBand`, imported at `check-reports.js:29`. This is the only value in the repo with one owner — and it creates an inverted dependency (the test suite requires a production tool, which transitively requires `dead-ticker-canary.js` via `update-prices.js:50`) |
| EPS table vs quote | `fetch-fundamentals.js:265-266` `EPS_TABLE_PASS_PCT=2`, `EPS_TABLE_ABS_TOL=0.03` — **manually mirrored** at `prep-stock.js:24-25` with a comment (`:25-26`) stating they must stay equal or the two output lines contradict each other |
| Multiplier "near current" | `derived-values.js:875` `DA_GAP = 0.07` (W18, multiplier↔multiplier) · `spotcheck.js:23` `NEAR_PRICE = 0.03` (mval↔price). Two different definitions of one concept, deliberately, documented `check-reports.js:721-722` |
| Rounding slack | `derived-values.js:36` `MCAP_ULP = 0.55` reused for yield/PBV at `:589`; the same "half-ulp" idea re-derived inline at `check-reports.js:669` (W16) and `:708` (W17 via `fmtLikeNum`) |
| Scale words (พันล้าน/B/M…) | `derived-values.js:60-66` `SCALES` vs `check-reports.js:137` `V_UNIT = '(พันล้าน\|ล้าน\|B\|M\|bn\|mn)'` (W14) vs `derived-values.js:511` `SCALE_AFTER` — three vocabularies |
| Thai month names | single-sourced in `price-date.js`, re-implemented for chart labels at `check-reports.js:326-330` (`CHART_EN_MONTHS` + `THAI_MONTHS`) |
| Verify step list | `package.json:24` **and** `.githooks/pre-push` (13 steps hand-mirrored; the hook's own comment line 4 says "must always match `npm run verify`") |

### 3.2 Checker↔healer coupling is intentional but manual

`check-reports.js:685-686` (W17), `:738-740` (W19), `derived-values.js:349-350`, `:802-803` all state the invariant: *the checker must be silent exactly where the healer does not write*. It is enforced by both calling the same function (`DV.scenarioPlan`, `DV.yieldPlan`, `DV.pbvPlan`) — a good pattern — but the **tolerance** side is still hand-matched (`MCAP_ULP` reasoning repeated four times), and W16's tolerance at `check-reports.js:669` is a *fourth* inline re-derivation rather than a shared helper.

### 3.3 Rules that live in prose docs and in code

CLAUDE.md §8/§9 restate: the MOS band, the ±3 dead-band, the 15%/25% freeze thresholds, the 45/120-day staleness, the list of what cron may touch. `docs/quality-gate.md` (89 KB) and `docs/price-refresh.md` (57 KB) restate them again. The memory index already records `docs/orchestration.md` §3/§5 having contradicted CLAUDE.md "for a long time".

---

## 4. SHARED STATE & CONCURRENCY

| File | Writers | Read-modify-write sites | Lock / atomicity |
|---|---|---|---|
| `price-flags.json` | cron (`update-prices.js`), weekly canary (`dead-ticker-canary.js`), humans | read `update-prices.js:713` (`loadFlags` `:602`) → merge `:883` (`mergeFlags` `:627`) → write `:885`; canary read `:242` → write `:246` | **atomic rename** `update-prices.js:614-618`, `dead-ticker-canary.js:62-65`; **cross-process serialisation only in CI** via `concurrency.group: price-flags-issue` (`update-prices.yml:15-22`), which covers cron↔canary **but not** a local `node tools/update-prices.js --write` run concurrently with anything. `loadFlags` deliberately throws on corrupt JSON (`:606`) rather than returning `[]`, i.e. the failure mode is "abort the round", not "silently truncate the queue" |
| `tools/seeds.json` | `pick-brand.js`, humans | **read `pick-brand.js:30` → write `:111`** — plain `writeFileSync`, no temp+rename, no lock | **none.** CLAUDE.md §10 documents the consequence (two parallel workers get the same brand colour, gate cannot see it). The mitigation is a *process rule* ("controller pre-assigns colours"), not code |
| `tags.json` | `tag-apply.js` only (by rule) | read `tag-apply.js:113` (`T.loadTags` → `tag-lib.js:28`) → write `:96-97` | **atomic rename**, single declared entry point; enforcement is a rule, not a permission |
| `reports.json` | `build.js:675-715`, `preserve-dates.js:61` | `preserve-dates.js` reads `git show HEAD:reports.json` `:27` + working-tree file `:53` → writes `:61`; `build.js` reads previous manifest then rewrites | none; relies on the build→preserve→build sequence (`update-prices.yml:44-47`) being run serially |
| `reports/*.html` | cron `:828` / `:681`, LLM workers (`apply-edits.js:127`), `fix-contrast.js:120`, `brandtheme.js:159`, `migrate*.js` | whole-file read→regex→write everywhere | **none.** `apply-edits.js` is all-or-nothing *within one invocation* (`:63-64`, `:127`) but has no notion of a concurrent writer |
| `tools/ticker-cache` (canary) | `dead-ticker-canary.js:248` | read→write | atomic rename |
| GitHub issue "Price-refresh flags" | cron `update-prices.yml:93-98`, canary | `gh issue view` → `flags-issue-body.js` → `gh issue edit` | **no lock at the API level**; the CI `concurrency.group` is the only guard, and the yml comment `:16-18` says so explicitly |
| `dist/` | `build.js` only | — | gitignored |

`.claude/workflows/analyze-wave.js` writes nothing (it only calls `agent()` in a loop, `:21-31`) — but its header comment `:8` still says "sequential … ห้าม parallel", contradicting its own `whenToUse` string `:4` and CLAUDE.md §3.3. Stale instruction inside the tool that enforces the policy.

---

## 5. TEST-FIXTURE COUPLING

| Test | Live fixture | Mutated before the test in CI? |
|---|---|---|
| `test/update-prices-test.js` | `reports/AAPL.html` (`:158`), `reports/BBL.html` (`:359`) | **Yes, in the second of two runs.** `update-prices.yml:36` runs `npm run test:prices` *before* `node tools/update-prices.js --write` (`:41`); `update-prices.yml:50` then runs `npm run verify`, whose **first** step is the same `node test/update-prices-test.js` (`package.json:24`). One job, one test, two different fixture states — the post-patch state carries *that day's market price* |
| `test/self-test.js` | `reports/BBL.html` (`:37-38`) | **Yes** — `verify` step 6 runs after the patch |
| `test/check-reports.js` | all 908 live reports | Yes (that is its job) |
| `test/check-site.js` | `dist/` built from live reports | Yes |
| `test/engine-exec.js` | every live report's engine | Yes |
| `test/skeleton-test.js` | `_template/skeleton-*.html` | No (static) |
| `test/tags-test.js` | live `tags.json` + `reports/` listing (corpus check, per `.githooks/pre-push` comment) | No, but coupled to the corpus |
| `test/tag-apply-test.js`, `test/dead-ticker-test.js`, `test/ohlc-test.js`, `test/ta-engine-test.js`, `test/build-test.js` | synthetic (`tag-apply-test.js:26-27`, `build-test.js:133`) | No |

**Literals that depend on the day's price.** Both live-fixture tests were hardened *after* being burned, and the hardening is documentation, not mechanism:
- `update-prices-test.js:156-157`: "⚠ ไฟล์ fixture ถูก cron แก้ทุกวัน — ห้าม assert ค่าปัจจุบันของไฟล์แบบ hard-code".
- `update-prices-test.js:317-327`: records the 2 Sep 2026 outage — `reports/AAPL.html` at $325.13 made Bull total +28% round to "9%" under both CAGR and linear, flipping the healer's formula classification. The fix was to sweep synthetic prices (`:326`) rather than remove the live fixture.
- `self-test.js:10-25`: five fixture rules, all derived-not-literal, including `:20` recording that an E36 case "พังที่ ฿150 แต่ผ่านที่ ฿170/185/200/215/240" — i.e. **the meta-test's pass/fail is a function of BBL's market price that day**.
- `self-test.js:103` asserts the live BBL file currently has **zero** errors; `:118-119` asserts the live file does **not** already carry the code under test. Both are assertions about the state of production data.
- `update-prices-test.js:246` notes the AAPL file "บังเอิญอยู่ใกล้ 301.5" so a loose tolerance would pass with no code at all.

Net: **two of the thirteen gate steps are parameterised by that morning's closing prices of AAPL and BBL**, and those steps run inside the job that is patching those same files.

---

## 6. FAILURE-MODE CATALOG

### 6.A One report can kill the whole daily cron

`update-prices.yml` runs, in order: unit test → patch all 908 → build → preserve-dates → build → **`npm run verify` (repo-wide)** → commit+push. `verify` failing means the commit step never runs, so **a whole day's ~900 good patches are discarded**.

1. **Any single E-code error anywhere in 908 files** → `check-reports.js:828` `process.exit(1)` → no push. There is no per-file quarantine.
2. **`expandReport` throws for one file** → `build.js:209/210/212/213` (`validateReportData` `:165-203`, ~25 throw sites incl. degenerate gauge `:186`, non-finite `chart.fairLine` `:180`, bad theme colour `:202`). This kills `npm run build` (yml:45) *and* `check-reports.js:819` — where the call sits **outside** the per-check `try` at `:799`, so the gate dies with an unhandled exception rather than reporting one bad file.
3. **`test/update-prices-test.js` fails on the post-patch AAPL/BBL state** — the documented 2 Sep 2026 mechanism (`update-prices-test.js:317-327`) and the 24 Aug 2026 BBL/self-test mechanism (memory: "cron ล้ม 3 วันติด").
4. **`test/self-test.js` fails** because the day's BBL price moved a case out of its zone (`self-test.js:20`), or because BBL was re-analysed and an anchor no longer matches (`:109`, `:121` — "mutation ไม่เปลี่ยนอะไร" is a hard fail by design).
5. **`test/tags-test.js` corpus check** fails if a report was deleted without `tag-apply.js --prune`.
6. **`check-site.js:317-318`** compares `dist/` html count to `reports/` count — a stray file breaks it.
7. **11 consecutive Yahoo failures** → `update-prices.js:740-742` `process.exit(2)` → step fails before anything is written.
8. **`price-flags.json` unreadable** → `loadFlags` `:606` throws → whole round aborted (deliberate, to avoid wiping the queue).
9. **45-minute job timeout** (`yml:27`) with 908 symbols × 450 ms throttle (`:68`) + retries.
10. **Push contention** — 3 retries at `yml:64-69`, then `exit 1`.
11. A **new W-code that is promoted to error** would fail on day one across hundreds of files. This is stated as the reason W17/W19/W20 are warnings (`check-reports.js:682-683`, `:737`) — **gate severity is chosen by cron survivability, not by correctness**.

### 6.B A bad patch that passes silently

1. Every `patchDerived` pass (§2.3) — silence is the contract; a card whose `.d` wording drifted just enough to trip `YIELD_PRE_SKIP` `:518` stops being healed **and** stops being checked, simultaneously and invisibly.
2. The three un-guarded `replace()` calls in `patchReport` (`:531` disclaimer date, `:558` MOS summary cell, `:579` verdict class) — no `need()`, no counter, no log.
3. `findRestatedDate` miss `:522` — the parenthetical second date silently keeps the old value.
4. **Fail-open guards by design:** `isIntradayQuote` `:176` returns `false` when `currentTradingPeriod` is missing (rationale `:172-174`); `detectMixedBasis` `:226` returns `checked:false` when the 52-week fields are missing. Both convert a Yahoo schema change into "patch everything with whatever came back".
5. **Price-only chart fallback** `:454-461`: when Yahoo returns <2 monthly bars, the old chart is kept and only its last point is overwritten — so `annualChg` `:273` is then computed over a series whose first point may be >1 year old, and E36's ±12 pp tolerance will usually swallow it.
6. **Stale-quote no-op**: a delisted ticker whose quote is frozen yields `drift = 0`, `r.changed === false` `:827` → counted as "skipped", no flag. This is the EA/BPP blind spot; the two-layer canary is a *detector*, not a preventer.
7. `--force` (`decide` `:296`) skips drift, suspect-split and MOS-flip. SKILL prescribes `--force` on **every** re-analysis, so the policy freezes are off during the most error-prone operation.
8. `mergeFlags` `:627`: any symbol in `processed` with no fresh freeze has its flag cleared. Correct only because `evaluated` `:882` subtracts intraday skips — a fix applied after the queue was silently wiped once.

### 6.C A report can be wrong and still pass 43/43

Classes visible from the code, beyond the ones already known:

1. **Uncovered fields (17 rows marked NEITHER in §1).** Most consequential: `chart.fairLine` can disagree with FV forever (#46); the gauge-scale analyst target (#24) and the vcell analyst target (#23) are never compared to each other or to a source; the 52-week range (#41) is only checked for the *existence of the phrase*; the disclaimer date (#12) can lag the header date.
2. **Extractor-miss ⇒ pass (21 E-codes + 19 W-codes, §2.4).** A worker who wraps a value in `<b>` silences W10 (`check-reports.js:220` requires `([^<]*)`) while E41 still fires — or vice-versa. An unreadable price date turns off E27 entirely (`:374`).
3. **Both sides wrong together.** E36 compares the header % to the chart — both are written by the same cron pass from the same Yahoo series, so a split-corrupted series passes (`update-prices.js:16`, `:204`). W10 compares a card to `stock-meta` — before W19, both went stale together (`check-reports.js:736`).
4. **Tautological legs.** W18 `:724` catches only the explicit phrase "target ≈ current multiple" (`DA_TGT_AFTER`/`DA_CUR` `derived-values.js:879-881`); a leg built on `price ÷ forwardPE` or on the "Current" ratios column is the same defect with no phrase to match — memory records it recurring (CBOE, 6M). `spotcheck.js:44-50` catches ~25% of the corpus by a price-proximity heuristic and is explicitly **not** a gate (`:92` "ไม่เคย fail").
5. **Tolerances wide enough to hide real errors.** E36 ±12 pp on an annual return (`:46`); W01 ±7% on EPS×PE vs target; E16/E30 ±2 pp on MOS; E30 ±2% between `stock-meta.price` and the header; W07 accepts P/E up to 600 and P/BV up to 200 (`:547`).
6. **Warnings don't block.** W05, W06, W14, W16, W17, W18, W19, W20 are all *numeric wrongness* that ships. Current corpus warning count is in the low hundreds (memory: "warning 152→116" after the W18 sweep).
7. **Truth is out of scope.** The gate checks internal consistency only; CLAUDE.md §8 states this. An EPS, price target, or share count copied wrong from a vendor is consistent with everything derived from it.
8. **Two parsers, two verdicts on section 6.** E24/W01 read via `parseScenarios` (`check-reports.js:105`); W17 and the healer read via `scenarioBlock` (`derived-values.js:296`). Any of the four divergences in §2.5 (double space; a second attribute after the class; a 4th `col` block; a stray `col bear` outside the `scn` section) makes the column visible to E24/W01 and invisible to W17 — the warning goes quiet **and** the healer stops writing, with no signal from either.
9. **Silence is indistinguishable from cleanliness.** `derived-values.js:322-323` records the exact failure: a position bug corrupted files so badly that *every* check went quiet — "สะอาดปลอม". `test/self-test.js` exists solely to detect this, and it covers 54 of 62 codes (missing E03, E05, E07, E08, E09, E11, E17, W03) — and only against one live file.
10. **Whole-corpus semantic errors.** The cluster check, family weighting (0.4c-bis) and rf-currency rules in CLAUDE.md §8 "ชั้น 0" are cross-report properties; no gate step reads more than one report at a time except E40/W13 (tags) and `check-site.js` (counts).

---

## 7. SIZE & COMPLEXITY SIGNALS

### 7.1 The two hot functions

| Function | Lines | code lines | `if` | ternary | `return` | regex literals | `.replace()` | `throw` |
|---|---|---|---|---|---|---|---|---|
| `update-prices.js:432-595 patchReport` | 164 | 102 | 19 | 27 | 7 | 29 | 15 | 8 |
| `derived-values.js:657-851 patchDerived` | 195 | 160 | 37 | 21 | **39** | 16 | 14 | 0 |
| `derived-values.js:352-462 scenarioPlan` | 111 | 67 | 16 | 20 | 13 | 0 | 0 | 0 |
| `update-prices.js:689-902 main` | 214 | 152 | 21 | 14 | 1 | 8 | 6 | 1 |
| `check-reports.js:256-315 buildCtx` | 60 | 53 | 4 | **28** | 17 | 18 | 2 | 0 |
| `derived-values.js:544-569 denomTokens` | 26 | 26 | 9 | 1 | 1 | 2 | 1 | 0 |

`patchDerived` has **39 early returns** in 160 code lines — roughly one abandonment path every four lines. `scenarioPlan` has 13 returns of which **8 are named `no(...)` reasons** (`:354, 356, 358, 365, 404, 406, 439, 460`), each a distinct "cannot decide" class discovered empirically.

`yieldCardPlan` (13 lines) and `pbvCardPlan` (13 lines) look small but each delegates to `denomTokens` whose 26 lines contain 9 filters (`:550, 552, 554, 556, 557, 560, 561, 564`) plus 6 shared regex vocabularies (`:507, 509, 511, 513, 514, 518`) — `YIELD_PRE_SKIP` alone is a 26-alternative alternation enumerating dividend phrasings found in the corpus.

### 7.2 Named numeric thresholds

`derived-values.js` 15 · `update-prices.js` 12 · `check-reports.js` 6 · `prep-stock.js` 4 · `fetch-fundamentals.js` 4 · `median-multiples.js` 3 · `spotcheck.js` 2 — **≈46 hand-tuned constants**, most with a measurement date in the comment ("วัดคลัง 9 ก.ย. 69: ยิง 23/908").

### 7.3 Code-count growth

| File | first commit | then | now |
|---|---|---|---|
| `test/check-reports.js` | 2026-06-23, 272 lines (24 Jun) | 393 (11 Aug) → 597 (18 Aug) | **832** (11 Sep) |
| `tools/update-prices.js` | 2026-07-11, 357 lines | 440 (2 Aug) | **906** (11 Sep) |
| `tools/derived-values.js` | **2026-08-19**, 222 lines | — | **910** (11 Sep) |

`derived-values.js` reached 910 lines in **23 days**.

### 7.4 E/W code arrival dates

43 error codes, 19 warn codes (W11 is vacant — promoted to E36, `check-reports.js:466`).

```
Jun 23-25 :  E01–E37 core, W01–W12        (design-time set)
Jul 17    :  E38  contrast
Aug 12-13 :  E39  chart ordering · E40 tags · W13
Aug 18    :  W14  P/FCF·DDM·EV/EBITDA recompute
Aug 19    :  E41 P/E · E42 target% · E43 MarketCap · W15 prose% · W16 P/S   ← 5 in one day
Aug 20    :  W17  3-year scenario returns
Sep 09    :  W18  dead anchor
Sep 11    :  W19  dividend % · W20 P/BV                                      ← today
```

Nine of the last eleven codes (E41–E43, W15–W17, W19–W20) are the **same defect class**: "a number equal to price ÷ (something the report printed), which nothing updated". Each arrived one field at a time, each with its own regex, its own tolerance constant, its own healer pass, and each landed at `warn` because promoting it to `error` would have failed the repo-wide gate on hundreds of files (`check-reports.js:682-683`, `:737`).

---

## 8. ROOT-CAUSE HYPOTHESES (ranked by explanatory coverage)

Coverage key — bug classes named in the brief plus those found here:
`A` price-derived field uncovered · `B` cron-mutated live fixtures · `C` sidecar RMW races · `D` check silently passes on regex miss · `E` dead-anchor / tautological legs · `F` one report kills the daily cron · `G` prose staleness · `H` `updated`/freshHash churn · `I` two parsers disagreeing.

1. **The rendered HTML *is* the database.** Each quantity is materialised as display text in 2–10 independent places (§1.0) with no canonical form, so every consumer must re-parse presentation to recover data, and every producer must re-render it N times. → explains **A, D, G, I, E** and is upstream of **F, H**. *Strongest: it is the single fact that makes all of §2 necessary.*

2. **The gate's coverage is defined as "wherever the healer can write", so it cannot discover an uncovered field.** Enforced deliberately (`check-reports.js:685-686`, `:738-740`; `derived-values.js:349-350`, `:802-803`) to avoid un-clearable errors. The consequence is structural: a field nobody has written a healer for is also a field nobody checks — the gate is blind exactly where the bug lives, so discovery is always by human reading. → explains **A, D, E, G**.

3. **Silence is the universal failure mode.** 21 error codes and all 19 warn codes `return null` when their extractor misses (§2.4); `patchDerived` has 39 no-op exits; three `patchReport` replaces have no `need()`. "Not parsed" and "consistent" are the same observable — the repo has already been bitten by "สะอาดปลอม" (`derived-values.js:322-323`). → explains **D, A, I**, and makes every other class undetectable.

4. **One repo-wide `verify` is both the cron's gate and the push gate.** Any single bad file discards ~900 good patches (§6.A). This forces every new check to land at `warn` (`check-reports.js:682-683`, `:737`) and every tolerance to be widened until the healer can always clear it (`MCAP_ULP`, `derived-values.js:33-36`). **Gate severity and tolerance are set by cron survivability, not correctness** — so new correct checks are structurally demoted to non-blocking. → explains **F**, and explains *why* **A** keeps recurring instead of being fixed once.

5. **Live production data is used as test fixtures inside the job that mutates it.** `reports/AAPL.html` and `reports/BBL.html` are read by `update-prices-test.js:158/359` and `self-test.js:37`, and `verify` (`package.json:24`) re-runs both **after** `update-prices.yml:41` has patched them with that day's price. Every hardening so far has been a fixture *rule* rather than a fixture *boundary*. → explains **B**, contributes to **F**.

6. **Sidecar state has no owner and no lock.** `seeds.json` is plain read→write (`pick-brand.js:30`→`:111`); `price-flags.json` and `tags.json` are atomic-per-write but have multiple writers serialised only by a CI `concurrency.group` (`update-prices.yml:15-22`) that does not cover local runs. The mitigations are prose rules in CLAUDE.md, not permissions. → explains **C**.

7. **"Analysis freshness" is inferred from a whole-file byte hash rather than recorded as data.** `freshHash` (`build.js:81-83`) subtracts only `ai-model` and `stock-meta`; everything else the cron touches daily — `.px`, `.chg`, `.big`, `pxIn`, both dates, `report-data`, every derived card — is hashed, and `build.js:80` concedes the point ("ราคาจริงเปลี่ยน → hash ขยับเองอยู่แล้ว"). Since cron is the dominant source of daily byte changes, "content changed" and "someone re-analysed this" are indistinguishable, which forces the build→`preserve-dates`→build ritual (`update-prices.yml:44-47`) and a git-archaeology heuristic over the footer string (`preserve-dates.js:33-51`) to undo the side effect. The footer date that arbitration depends on is itself checked by nothing (#13). → explains **H**, contributes to **F**.

8. **Valuation semantics are heuristics over prose, so each one becomes a bespoke W-code.** Dead anchors, family weighting, cluster checks and multiplier provenance live in `.mdesc` sentences; W14/W18 parse them with formula-specific regexes (`check-reports.js:142-197`, `derived-values.js:876-895`) and `spotcheck.js` exists precisely for the residue that "cannot be decided automatically" (`:7`). Each new phrasing an LLM invents is a new escape. → explains **E**, and guarantees a permanent tail even if 1–7 are fixed.
