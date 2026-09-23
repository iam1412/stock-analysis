# EQIX v2 vs v3 render — Task 0 comparison (REIT, P/AFFO context leg + P/E median leg)

Fixture: `test/fixtures/v3/EQIX-real.json` (hand-converted from `reports/EQIX.html`, v2, price 22 ก.ย. 69).
Check script (throwaway): `.superpowers/sdd/v3-plan2-task0/eqix/check.js` + `vis.js` (visible text per section) + `corpus.js` (counts).

- Schema: `validate()` → **0 errors**.
- Gate (same way as `test/v3/render.test.js`): `CR.checkHtml(expandReport(toV2Source(doc,view)), 'EQIX.html', {source})` → **0 errors, 0 warnings** (original report: also 0/0). Same result with dates reset to today.
- Rule B (`prose.checkRuleB`): **2 errors (false positive, gap #10)**, 9 warnings (old literals near price-bound values — kept verbatim).
- `node test/v3-test.js` still green (the fixture is not wired into any test).

## Shape of the report

- **1 counted leg**: P/E × historical median (80.6x on GAAP EPS $15.55) = $1,253.
- **1 context leg, displayed but not in FV**: "P/AFFO ปัจจุบัน (บริบท — ไม่นับใน FV)", AFFO/share TTM $38.33 × current P/AFFO 26.6x = $1,021.
- **FV range is not the min/max of the legs.** It is the sensitivity of leg 1 across the measured P/E range 59.9x–99.2x, which gives $931–$1,543.
- **Scenarios run on AFFO**: forward base FY2026E $42.99 (midpoint of guidance), growth 5/9/11 %, exit P/AFFO 20/24/26x, dividends included.
- **5 REIT cards**: P/AFFO TTM, P/AFFO 5-year average, AFFO/share FY2026E (a range), AFFO margin, and the AFFO payout mentioned in the catalysts. None of these has a catalogue key.

## How the fixture encodes it (escape hatches)

| Need | Encoding used | Honest? |
|---|---|---|
| Counted P/E leg | `method:'pe'`, `multiple:80.6`, `multipleSource:'median5y'` | Close enough. The real window is FY2022–FY2025 (4 years, FY2021 dropped), so mdesc wrongly says "มัธยฐาน 5 ปี" |
| Context P/AFFO leg | `method:'declared'`, `value:1021`, `basis:'other'`, **`fvWeights:[1,0]`** | FV is correct. Everything else about this leg is wrong (see gap #2) |
| AFFO/share | `fundamentals.ffoPerShare: 38.33` | The schema can't tell AFFO from FFO |
| Scenario base | `driver:'ffo'`, `exitMetric:'pffo'`, `baseOverride.value:42.99` | The numbers are correct. The labels come out as "FFO"/"P/FFO" |
| 4 REIT cards | `metrics.custom[0..3]` as literal strings (hits the ≤4 cap exactly) | "~26.6x" is a price-bound literal and is already stale |
| FV range $931–$1,543 | **not expressible**. v3 shows $1,021–$1,253.33 | ✗ |
| `analyst.asOf` | price date 2026-09-22 used as a proxy (v2 has no as-of date) | proxy |

## Numbers: original (built v2) vs v3

| Value | v2 original | v3 | Note |
|---|---|---|---|
| Fair Value | $1,253 (rd.fv 1253, rounded by hand) | **$1,253.33** | v3 = 15.55 × 80.6 exactly. The v2 author rounded |
| MOS / upside | 15.5% / 18.3% ("+15%") | 15.48% / 18.32% ("+15%") | ✓ |
| Leg 1 P/E | $1,253 | $1,253.33 | same as above |
| Leg 2 P/AFFO (context) | $1,021 | $1,021.00 (declared) | 38.33 × 26.6 = 1,019.58, so v2's own mval matches 26.64x, not the 26.6x it prints |
| **fvLow / fvHigh** | **$931 / $1,543** | **$1,021.00 / $1,253.33** | ✗ gap #1 + #2. Also moves the "กรอบบน FV" gauge label and the verdict cell |
| MOS 20% / 30% | $1,002.40 / $877.10 | $1,002.66 / $877.33 | follows FV |
| stock-meta.pe | **26.65** (= P/AFFO at an old price) | **68.12** (px / GAAP EPS) | ✗ gap #8: the index sees a different metric |
| P/E (GAAP) in EPS card .d | "~65.7x" (stale) | "~65.7x" literal (the live value would be 68.1x) | {{pe}} can't be used in notes (gap #9) |
| P/AFFO card | "~26.6x" (stale) | "~26.6x" literal (the live value would be 27.6x) | no computed P/FFO card (gap #4) |
| P/BV | ~3.0x | 3.01x | ✓ |
| Market Cap | ~$104.5B | $105B | fmtBig precision convention (same as ZTS class c) |
| Yield | ~1.95% | 1.95% | ✓ |
| Scenario targets | $995.40 / $1,336.32 / $1,528.80 | $995.33 / $1,336.16 / $1,528.66 | v2 rounded AFFO in year 3 to cents (49.77/55.68/58.80) before × exit. v3 keeps full precision (49.77/55.67/58.79) |
| Scenario total % (cells) | +0.2% / +33% / +51% | +0.2% / +33% / +51% | ✓ |
| Analyst target / % | $1,233.23 / +16% | $1,233.23 / +16% | ✓ (v3 adds "· 30 ราย") |

## Differences in visible text (per section)

- **Header.** The gdots are coloured dots instead of "◆ ◆ ◆". The h1 gains "(EQIX)". The 52-week separator changes from "/" to "–". Sources are joined with ", " instead of " / ".
- **§1 Key Metrics**
  - Card order changes: the 4 REIT customs move from positions 2, 3, 5 and 10 to the end (gap #11).
  - Labels change: "GAAP EPS (TTM)" becomes "EPS (TTM)", and "รายได้ TTM (FY2025)" becomes "รายได้ TTM" (the FY2025 caveat moves into the note).
  - Every catalogue card gets its fixed `.d` prefix ("มูลค่าทางบัญชีต่อหุ้น · …", "รอบ 12 เดือนล่าสุด · …", "ความผันผวนเทียบตลาด · …").
  - mcap `.d` changes from "~98.7M shares outstanding" to "~98.7M หุ้น".
  - The `~` is dropped on P/BV, ROA and yield.
- **§2 Chart.** Text is identical. The legend colour is var(--blue) instead of the accent.
- **§3 Valuation**
  - The hint "ตระกูลเดียว — P/E มัธยฐานย้อนหลัง (วัดจริง) · P/AFFO เป็นบริบท" becomes "**ถ่วงน้ำหนัก 2 วิธี**". This is misleading: there is 1 counted leg (gap #2/#6).
  - The FV box changes from "มูลค่าเหมาะสม (Fair Value)" to "มูลค่าเหมาะสม**ถ่วงน้ำหนัก**". The range changes from $931–$1,543 to $1,021–$1,253.33.
  - In leg 1's mdesc, "EPS $15.55 (TTM) × P/E 80.6x — …" becomes "EPS (TTM) $15.55 × P/E เป้าหมาย ~80.6x (มัธยฐาน 5 ปี) — …". The window is actually 4 years.
  - Leg 2's mdesc gains the prefix "ค่าประกาศ (other) — ". The leg is not a declared value. It is a live multiple × AFFO.
- **§4 Gauge.** The "กรอบบน FV" label changes from $1,543 to $1,253.33, the same as FV. The prose is identical, including the stale "รอย่ออีกราว 2%": the live distance to MOS 20% is 5.3%.
- **§5 MOS.** Identical apart from the FV-driven numbers and the dropped 🧮.
- **§6 Scenarios**
  - The hint loses "AFFO ฐาน FY2026E ~$42.99" (gap #5).
  - Column heads and rows read "FFO +5%/ปี", "FFO ปี 3" and "P/FFO ออก" instead of the AFFO wording (gap #3).
  - The emoji are dropped.
  - The note is verbatim. It keeps stale returns "~+38% / ~+4% / ~+57%", which contradict the computed cells (+33% / +0.2% / +51%) **on the original page too**.
- **§7 Catalysts/risks.** Identical.
- **§8 Verdict.** The FV range changes from ($931–$1,543) to ($1,021.00–$1,253.33). The analyst cell adds "· 30 ราย". The verdict body keeps the stale "base case ~38%".
- **Disclaimer.** The fixed assumption line "P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE" replaces the REIT line "P/AFFO เป้าหมาย, อัตราเติบโต AFFO, ต้นทุนทุน และ NAV cap rate" (gap #7).

## Schema gaps (ranked by estimated corpus reach, 909 reports)

Counts come from `.superpowers/sdd/v3-plan2-task0/eqix/corpus.js` over `reports/*.html`, using regexes on `.mname` / `.k` / hints / report-data. Treat them as estimates.

1. **FV range ≠ min/max of legs (sensitivity range): ~121 reports.** In 121/909 reports the stored `fvLow/fvHigh` differs by more than 1% from the min/max of `.mval`. Of those, 91 have no context leg, so the range comes from sensitivity or another method.
   - EQIX's range is leg 1 at the measured P/E extremes: 15.55 × 59.9 = $931.45 and 15.55 × 99.2 = $1,542.56.
   - v3 computes `fvLow/fvHigh = min/max(all legs)` and has no override.
   - Escape hatch: none. The range is simply wrong on screen ($1,021–$1,253.33).
   - **Proposal:** add an optional `legs[i].inputs.multipleRange: [lo, hi]` (numbers, lo ≤ multiple ≤ hi) on multiple-type legs, and `r`/`g` ranges on DDM/DCF.
     - `compute`: leg.lo/leg.hi = legValue with the multiple set to lo/hi (defaults = value).
     - `fvLow = Σ wᵢ·loᵢ` and `fvHigh = Σ wᵢ·hiᵢ` over counted legs, but only when any leg has a range. Otherwise keep min/max of the counted legs.
     - For EQIX: `multipleRange:[59.9, 99.2]` gives exactly $931.45 / $1,542.56.
2. **Displayed-but-excluded ("บริบท") leg: 38 reports / 43 legs** (EQIX is the only P/AFFO one). Examples: AMCR, ARM, CCJ, CLS, DELTA, ENTG, FDS, LEO, MICRO, TAP, URI and more; 8 of these are analyst-target or custom-NPV "legs".
   - `fvWeights:[1,0]` gets FV right, but the leg:
     - still sets `fvLow/fvHigh` (min/max over all legs; 30 of the 38 v2 reports explicitly exclude context from the range, "ไม่รวมในกรอบ FV");
     - makes the hint and FV box say "ถ่วงน้ำหนัก 2 วิธี";
     - renders with no "not counted" marker;
     - counts toward the schema's 2–4 legs / E17 minimum.
   - **15 reports have <2 counted legs** (EQIX, APURE, ARM, CCJ, CLS, COHR, CRWV, DELTA, ENTG, EVR, LEO, MICRO, MRNA, POET, RCAT). Today context legs silently satisfy E17. **Owner policy decision needed:** does E17 count counted legs only?
   - A current-multiple context leg must go through `declared` because `multipleSource` bans `'current'`, which hides the dead anchor as `basis:'other'`.
   - **Proposal:**
     - Add `legs[i].role: 'fv' | 'context'` (default `'fv'`).
     - Context legs are excluded from fv, fvLow/fvHigh and the E17 count.
     - `fvWeights` stays the length of `legs`, but weights for context legs must be 0 (or index weights over counted legs only).
     - render appends " (บริบท — ไม่นับใน FV)" to the mname, and the hint becomes `ตระกูลเดียว · +N บริบท` / `เฉลี่ย N วิธี · +M บริบท`.
     - Allow `multipleSource:'current'` **only** when role=context. Since current multiple × per-share value ≡ px, render such a leg as a multiple, not a dollar value ("P/AFFO ปัจจุบัน {{pffo}}x · ฐาน FY2026E {{pffoFwd}}x").
     - Add `method:'analyst'` (value = analyst.target, context-only) for the AVGO/DELTA/LULU pattern.
3. **FFO vs AFFO is one field: 31 reports mention FFO/AFFO; 27 have FFO/AFFO cards (11 AFFO, 16 FFO); 12 FFO legs; 23 FFO scenario drivers.**
   - `fundamentals.ffoPerShare` has no basis, and render hardcodes the labels "FFO"/"P/FFO" (METHOD_NAME.pffo, drv, ex). EQIX's AFFO therefore reads as FFO everywhere.
   - **Proposal:** add `fundamentals.ffoBasis: 'ffo'|'affo'|'core-ffo'` (enum, required when `ffoPerShare` is set), and derive `FFO_LABEL[basis]` for mname, driver and exit labels.
   - Also add `fundamentals.ffoForward` (number) + `ffoForwardPeriod` (e.g. 'FY2026E'), plus an optional `ffoForwardRange:[lo,hi]` for guidance. **19 reports** show a forward FFO/AFFO card.
   - `scenarios.baseOverride` could then be replaced by `baseFrom:'ffoForward'`, so the $42.99 isn't typed twice (EQIX types it in baseOverride, the scenario note and the valuation prose).
4. **REIT cards absent from the catalogue: 27 reports.** Proposed catalogue keys:
   - `pffo`: price-bound. Formula px / ffoPerShare, label `P/FFO (TTM)` or `P/AFFO (TTM)` by basis, `.d` = "AFFO/หุ้น $38.33". Add it to `prose.priceBound` and a `{{pffo}}` token. EQIX's literal "~26.6x" is already stale; live is 27.6x.
   - `pffoForward`: px / ffoForward. EQIX: 24.6x (prose says 23.8x, which is stale).
   - `ffoPerShare`, and `ffoForward` (value, range or point).
   - `pffoAvg5y`: new `fundamentals.pffoAvg5y`. 3 reports.
   - `ffoMargin`: ffoPerShare × shares / revenue. EQIX computes 41.0% against a hand-typed "~40%".
   - `ffoPayout`: dps / ffoPerShare (TTM 53.8%) or dps / ffoForward (48.0%, the "~48%" in catalysts). 8 reports have a payout card, 4 more have AFFO payout in prose.

   EQIX uses exactly 4 customs, the `metrics.custom` cap.
5. **Scenario hint shows the base only for `driver:'eps'`: 17 REIT reports** print "AFFO/FFO ฐาน … ~$x" in the §6 hint.
   - **Proposal:** render `${drvLabel} ฐาน ~{{rd:baseDriver}}` for every driver.
   - This needs a v2 token `baseDriver` (generalise `baseEps`) in `RV.TOKENS` and in the `V2_TWIN` of `tokens.js`.
6. **§3 hint and FV-box wording are fixed: 743 reports** have a non-template §3 hint (general, not REIT-specific).
   - EQIX's hint carries real information: single family, and P/AFFO is context.
   - **Proposal:** auto-derive the hint from `role` + method families (see #2). As a fallback, add an optional `valuationHint` prose field.
7. **Disclaimer assumption line is fixed: 233 reports** differ from the template's "P/E เป้าหมาย, g, r, ROE" line.
   - **Proposal:** derive the list from the leg methods and scenario driver/exit (e.g. pffo leads to "P/AFFO เป้าหมาย, อัตราเติบโต AFFO"). Alternatively add `prose.disclaimerAssumptions`.
8. **`stock-meta.pe` semantics for REITs: 5 reports** (AMT, DLR, EQIX, FRT, O) store P/FFO in `sm.pe`, and about 18 other REITs store null.
   - v3 always writes px / GAAP EPS (EQIX: 26.65 becomes 68.12), which changes index sorting and filtering.
   - **Proposal:** add `sm.pffo` and keep `sm.pe` = GAAP, or let `sm.pe` = null when `ffoBasis` is set. This needs an owner decision.
9. **`metrics.notes` / catalogue `.d` don't render tokens (general).** `renderCard` only calls `esc()`, so `{{pe}}` in a note leaks as a literal and **fires E13**. This happens even though `proseFields()` includes notes for rule B.
   - **Proposal:** run notes through `P.renderProse(note, view, {mode:'v2src'})` in `toV2Source`, the way customs already are.
   - EQIX had to keep the stale "P/E ~65.7x" literal because of this.
10. **Rule B false positive on unrelated integer %: general.** Revenue "+16% YoY" (verdictBody, notes.revenue) matches `analyst.pct` "+16%" **exactly**, which gives 2 errors.
    - **Proposal:** exact-match errors for `pct` only when the literal has a decimal or sits within N chars of a keyword (MOS/upside/เป้า/ผลตอบแทน/ปันผล). Otherwise downgrade to a warning.
11. **Custom cards always go after catalogue cards: general.** EQIX's REIT cards move from their slots 2, 3, 5 and 10 to the end.
    - **Proposal:** allow `metrics.cards` entries `"custom:<i>"` to place customs.
12. **Median window is fixed to 5y/10y (minor).** The actual window is FY2022–FY2025 with an outlier dropped.
    - **Proposal:** add an optional `inputs.multipleWindow: string` (e.g. "FY2022–FY2025 ตัด FY2021") that replaces `SRC_NAME` in mdesc.
13. **Catalogue labels can't be qualified (minor).** Examples: "GAAP EPS (TTM)" and "รายได้ TTM (FY2025)". This is the same finding as ZTS class (b); a label suffix could come from `epsBasis`.

## Not gaps / conversion notes

- **Stale literals in the v2 original.** The v3 fixture keeps them verbatim; a real migration should tokenise them.
  - They include "~+38% / ~+4% / ~+57%" (scenario note, verdict), "P/AFFO ~26.6x", "P/E ~65.7x", "≈ 23.8x" and "รอย่ออีกราว 2%".
  - The v2 page already contradicts itself: its computed cells say +33% / +0.2% / +51%.
  - These come from the known cron-doesn't-patch-prose class (W15 family). Tokenising the P/AFFO multiples needs `{{pffo}}` / `{{pffoForward}}` (gap #4), and "ราว 2%" needs a distance-to-MOS20 pct token.
- **Scenario target drift of $0.07–$0.16.** It comes from v2 rounding the year-3 AFFO to cents. v3 is the more exact of the two.
- **FV $1,253 → $1,253.33.** The v2 author rounded to whole dollars; v3 uses the exact formula. MOS display is unchanged.
