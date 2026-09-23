# ZTS v2 vs v3 render — comparison findings

Live at http://localhost:8787/ZTS.html (v3-rendered, real ZTS data, worktree v3view).
v2 reference built in throwaway worktree `v2ref` (branch design/report-v3-json-source, same HEAD 12d57a0ec) → dist/ZTS.html.
Gate: `CR.checkHtml(expandReport(toV2Source(doc,view)), 'ZTS.html', {source: toV2Source(doc,view)})` → **48/48 checks pass, 0 errors, 0 warnings.**
(Note: running the gate on the *final* dist/ZTS.html instead — i.e. after token substitution — incorrectly fires V2TOKENS/E44, because those checks specifically require the *pre-substitution* source with `{{rd:…}}` tokens still literal. The v3 source (toV2Source output) does contain the tokens correctly; only the fully-built dist output has them replaced with values, which is expected and not a defect.)

Fair value reproduction: v3 fv = 85.00082… → rounds to **$85.00**, exactly matching v2's stock-meta.fairValue=85 and rd.fv=85. mos=16.08% (v2: 16.1), pe=11.64 (v2: 11.6), yield=2.97% (v2: 2.97), all within rounding tolerance.

## Class (a) — data I couldn't carry (no schema/catalogue slot)

1. **mdesc extra context lost.** `tools/v3/render.js` `mdesc()` produces a fixed one-line formula string per leg method; any extra qualifying prose the original author wrote inline in `.mdesc` (not in `.note`) has nowhere to go except `leg.note` (appended after mdesc with " — "). Concretely:
   - Leg 1 (P/E): v2 mdesc included "(จุดกลางไกด์บริษัท FY2026 $6.15–6.25 ยืนยันจาก 8-K 6 ส.ค. 2569)" — this parenthetical justification for the EPS override has no field; I moved the "สูงกว่าตลาด..." tail into `leg.note`, but the "why this EPS number" explanation is unrepresentable except via `override.why` (which isn't rendered in mdesc, only used internally/for audit).
   - Leg 3 (DDM): v2 showed the intermediate arithmetic "→ $2.24/(0.090−0.055)" inside `.mdesc`; the v3 `mdesc()` template for `ddm` only prints `D₁ = ปันผล $X × (1+g); g Y%, r Z%` with no intermediate-math slot.
2. **Section-1 card `.d` compound facts.** Several v2 cards packed two different metrics/facts into one `.d` line, which the catalogue's single-purpose `.d` functions can't reproduce:
   - "อัตรากำไรขั้นต้น" (grossMargin) card's `.d` in v2 was "Operating margin 36.4% — โครงกำไรยังแข็ง" (an entirely different metric, opMargin, crammed into the grossMargin card). I preserved the text via `metrics.notes.grossMargin`, but the catalogue prepends its own fixed "Gross margin · " before it — see class (b) below.
   - "Market Cap" card's `.d` "หุ้น ~430M (ลดจาก 444M ใน FY2025)" — the "ลดจาก 444M" (down from 444M) historical comparison has no dedicated field; carried via `metrics.notes.mcap` but glued after the catalogue's own share-count text.
   - "กำไรสุทธิ FY2025" — v2's card literally labeled and valued this as the **FY2025** net income ($2,673M), separate from the TTM figure ($2,616M) mentioned only in its `.d`. The `netIncome` catalogue card is hardcoded to TTM only (label "กำไรสุทธิ TTM", value from `fundamentals.netIncome`) — there is no slot for a *second*, differently-scoped net-income figure. I used the TTM value ($2,616M → $2.62B) and lost the FY2025 headline figure entirely (only the "+7.5% YoY" note survives).
3. **Scenario section hint parenthetical.** v2: "EPS ฐาน ~$6.20 (adj, จุดกลางไกด์ FY2026)" — the render.js hint line only inserts `{{rd:baseEps}}` with no qualifier field; the "(adj, จุดกลางไกด์ FY2026)" annotation is dropped (the *reasoning* survives in `scenarios.baseOverride.why` and in `scenarios.note`, but not inline at the hint).
4. **FY2025 net income headline number** (see #2c) — effectively unrepresentable without adding it as a `metrics.custom` card (which I chose not to do, to keep card count/order matching v2's 12-card grid faithfully instead).
5. **Analyst `asOf` date** — schema requires `analyst.asOf` (ISO date) but v2 doesn't carry an explicit "as of" date for the consensus target; I used the price date (2026-09-21) as a best-effort proxy. Not a real v2 data point.
6. **BVPS/P/BV** — v2 explicitly doesn't use P/BV ("ไม่ใช้ Justified P/BV เพราะ ROE 80.8% บวมจาก equity...") and never states a BVPS number, so `fundamentals.bvps` is legitimately absent — not a loss, just noting the field is empty by design (matches v2's own reasoning, not a gap).

## Class (b) — template wording/structure differences

1. **`<h1>` drops the ticker suffix.** v2: `<h1>Zoetis Inc. (ZTS)</h1>`. v3 render.js: `<h1>${esc(m.company)}</h1>` → `<h1>Zoetis Inc.</h1>` — no "(ZTS)" appended. This is a genuine template gap (not fixable from JSON without stuffing the ticker into `meta.company`, which would be a data hack, not a fix).
2. **Card label/tilde/unit conventions differ system-wide** (catalogue-driven, not data-driven):
   - Market Cap: v2 "~$30.7B" vs v3 "$30.7B" (catalogue's `big()` never prepends `~`).
   - P/E (TTM) value: v2 "~11.6x" vs v3 "11.6x" (same — no `~`).
   - P/E เฉลี่ย ~5 ปี: v2 "~30x" vs v3 "30.0x" (catalogue's `peAvg5y` uses `.toFixed(1)` unconditionally, always shows one decimal, no `~`).
   - D/E: v2 "2.93" vs v3 "2.93x" (catalogue appends "x" to debtToEquity; v2 didn't).
   - P/E (TTM) `.d`: v2 "จาก GAAP EPS TTM $6.13" vs v3 "EPS TTM $6.13" (catalogue's fixed `.d` string is shorter, drops "จาก GAAP").
   - EPS (TTM) `.d`: v2 "GAAP diluted · ไกด์…" vs v3 "GAAP · ไกด์…" (catalogue's `epsBasis` map only emits "GAAP", not "GAAP diluted").
   - FCF card: v2 label "FCF (TTM)" vs v3 "FCF TTM" (catalogue label has no parentheses); value "$2,363M" vs "$2.36B" — see formatting note below.
   - ROE card: v2 label "ROE" vs v3 "ROE / ROA" (catalogue always renders the "/ ROA" suffix in the label even when `fundamentals.roa` is absent, since only the *value* suffix is conditional, not the label).
   - เงินปันผล value: v2 "~2.97%" (2dp, with ~) vs v3 "3.0%" (`toFixed(1)`, no ~) — real precision loss (2.97 rounds visually to 3.0).
   - D/E `.d`, gross-margin `.d`, revenue `.d`, mcap `.d`: catalogue prepends its own fixed phrase (e.g. "หนี้สินต่อทุน · ", "Gross margin · ", "รอบ 12 เดือนล่าสุด · ", shares text) before my `metrics.notes` text — so the v2 original phrasing survives only as a suffix, joined with " · ", producing longer/differently-ordered lines everywhere.
3. **Valuation section hint text.** v2: "3 วิธี ถ่วงตามตระกูลสมมติฐาน" vs v3: "ถ่วงน้ำหนัก 3 วิธี" (render.js hardcodes this phrase whenever `fvWeights` is non-null).
4. **FV box label.** v2: "มูลค่าเหมาะสมเฉลี่ย (Fair Value)" vs v3: "มูลค่าเหมาะสมถ่วงน้ำหนัก (Fair Value)" — again driven purely by whether `fvWeights` is set, wording is fixed.
5. **Leg 1 mdesc label mismatch.** mdesc always prints "EPS (TTM) $X" regardless of whether the eps value actually came from an `override` (i.e., is NOT the TTM figure) — here it shows "EPS (TTM) $6.20" even though $6.20 is the *adjusted guidance midpoint*, not TTM GAAP EPS ($6.13). This is misleading vs. v2's correct "EPS adj. $6.20". Also mdesc appends "(justified)" (the `multipleSource` label) which v2's freeform text didn't include.
6. **Leg 2 (declared) mdesc prefix.** v3's `declared` mdesc always prepends "ค่าประกาศ (other) — " before the leg's `.note` text; v2 had no such prefix on its DCF leg description.
7. **Analyst target cell adds rating count.** v2 section-8 cell: "~$100.94 (Buy)" vs v3: "~$100.94 (Buy · 19 ราย)" — render.js `analystCell` always includes `n` when `doc.analyst` is set; v2's version omitted the count here (though it does appear elsewhere in v2's gauge prose).
8. **Negative-percent minus glyph.** v2 wrote "EPS −3%/ปี" (Unicode minus U+2212) in the scenario column header; v3's `col()` interpolates the raw JS number directly (`${sc.growth}`), producing a plain hyphen "-3%/ปี" (ASCII U+002D). Cosmetic but consistent site-wide template behavior, not fixable via JSON content.
9. **Return-%'s per-year annotation appears for all 3 scenarios in v3** ("−12% (−4%/ปี)", "+50% (+14%/ปี)", "+96% (+25%/ปี)"), whereas v2's original Bear column omitted the "(≈ N%/ปี)" annotation entirely (only Base/Bull had it) — an inconsistency/omission in the original v2 prose that v3's derive()-driven token rendering fixes uniformly for all three.
10. **`&` vs `&amp;` in `.sub`.** v2's raw source has an unescaped literal `&` in "ปศุสัตว์ & Diagnostics" (technically invalid HTML, though browsers tolerate it); v3's `esc()` correctly emits `&amp;`. Renders identically in a browser — flagged only because `CR.visible()` doesn't entity-decode, so the raw diff shows up textually.
11. **Quote-escaping in catalyst/risk bullets.** Straight double quotes inside `<li>` text (e.g. `"หยุดแย่ลง"`) render as literal `"` in v2's raw (unescaped) source but as `&quot;` in v3's escaped output. Same visual result in a browser; not a real content difference.

## Class (c) — number formatting/rounding differences

1. **Big-number unit convention.** v2 hand-wrote figures in millions with comma grouping ("$2,673M", "$2,363M", "$9,517M"); the v3 catalogue's `fmtBig()` switches to billions with 2 decimals once ≥$1B ("$2.62B", "$2.36B", "$9.52B"). Same numbers, different display convention — driven by `report-values.js:fmtBig`, not something the JSON source controls.
2. **Scenario return %/target precision.** v2 showed one decimal on both target price growth and %/year ("−11.7%", "+50.3% (≈ +14.5%/ปี)", "+95.9% (≈ +25.1%/ปี)"); v3's rendered tokens show whole-number percentages ("−12% (−4%/ปี)", "+50% (+14%/ปี)", "+96% (+25%/ปี)"). This is `RV.TOKENS` formatting for scenario returns, not a JSON authoring choice.
3. **Bear/Base target price rounding drift vs. v2's own (slightly imprecise) numbers.** Recomputing v2's own stated formula (EPS base $6.20, 3-year compounding) gives Bear $56.59 and Base $100.48, not v2's displayed $56.60 / $100.52. v2's original freeform numbers appear to have been rounded/typed slightly off by the original (pre-v3) author rather than computed to full precision — v3's formula-driven values are the more internally-consistent ones. Bull matched exactly ($132.77 both).
4. **`peAvg5y` extra decimal.** v2 "~30x" vs v3 "30.0x" — `fundamentals.peAvg5y=30` rendered via `.toFixed(1)` always shows one decimal even for a round number.
5. **fvWeights solved numerically to hit v2's rounded FV.** v2's stated nested-average arithmetic ($86.80, avg of $103.50/$63.90 = $83.70, then avg of those two = $85.25) doesn't actually equal the displayed FV of $85.00 — a ~$0.25 rounding/arithmetic slip in the original v2 text. I solved flat leg weights (13/31, 9/31, 9/31 ≈ 0.4194/0.2903/0.2903) that reproduce v2's displayed **$85.00** exactly, rather than the flawed nested-average description; the weighting *shown in prose* ("(86.80 + 83.70)/2") is descriptive text carried over verbatim from v2 and no longer matches the literal `fvWeights` array driving the computed FV (a pre-existing inconsistency in v2's own methodology description, now made numerically exact instead of exactly matching the flawed narrative).

## Class (d) — my conversion choices / things fixed during the exercise

1. Initially ran the v2 quality gate against the **built/substituted** `dist/ZTS.html`, which incorrectly fired `V2TOKENS` (13 literal-instead-of-token sites) and `E44` (7 prose price-literals) — both false positives caused by checking post-substitution HTML instead of the pre-substitution `toV2Source()` output. Corrected by following `test/v3/render.test.js`'s pattern: `checkHtml(expandReport(toV2Source(doc,view)), name, {source: toV2Source(doc,view)})`. Result: 0 errors, 0 warnings, 48/48 passed.
2. DCF leg: no generic single-stage "Gordon growth on FCF" method exists in the v3 `legs.js` ENUM (only `ddm` on dividends, `dcf` as multi-year+terminal-value). Rather than fake it via an `ddm` leg with `override.dps` set to the FCF/share figure (which would make `mdesc` wrongly print "ปันผล $5.50"), I used `method: 'declared'` with `inputs.value: 103.50, basis: 'other'` and put the real formula in `.note` — this reproduces the exact `.mval` per the task's fallback rule but the method type itself ("declared") doesn't literally match what v2's freeform text called it ("DCF").
3. `leg.override.eps = 6.20` on the P/E leg — chosen deliberately to reproduce v2's use of the adjusted-guidance EPS instead of GAAP-TTM EPS for that one leg; confirmed the `pe` leg computes exactly $86.80 (`6.20 × 14`).
4. `scenarios.baseOverride.value = 6.20` similarly needed since v2's scenario base EPS ($6.20 adj.) differs from `fundamentals.eps` (6.13 GAAP TTM) used elsewhere.

## Bottom line

- Numbers: FV, MOS, P/E, yield, all 3 scenario targets (within v2's own minor rounding slop) reproduce correctly.
- Gate: 48/48 pass, 0 errors/warnings when run the correct way (pre-substitution source).
- Everything under class (a)/(b) is a genuine v3-template/schema limitation surfaced by a real report, not an authoring mistake — worth flagging to the owner as candidate follow-ups: (i) `<h1>` missing "(TICKER)"; (ii) catalogue `.d`/label strings can't be overridden per-report even when v2's original wording was materially different or more informative; (iii) no schema slot for a second same-topic-different-scope figure (e.g. FY-figure alongside TTM); (iv) no generic single-stage "X/share × (1+g)/(r−g)" leg method other than dividends; (v) percent formatting precision (1dp → 0dp) and unit convention (M vs B) changes are systemic, not per-report tunable.
