# BBL v2 vs v3 render — comparison findings (Plan 2 Task 0 · bank shape)

Source: `reports/BBL.html` (v2, ข้อมูล ณ 21 ก.ย. 2569, ราคา 22 ก.ย. 2569, ฿197.50) → hand-converted to `test/fixtures/v3/BBL-real.json`.
(`test/fixtures/v3/BBL.json` is the older SYNTHETIC fixture — untouched.)
Shape: Thai bank · THB · region TH · legs = P/E + DDM + Justified P/BV (bank uses P/BV instead of DCF) · FV weighted by *family* (P/E vs {DDM, P/BV}).

Harness (throwaway, `.superpowers/sdd/v3-plan2-task0/BBL/check.js`, `diff.js`):
- `schema.validate` → **0 errors**
- `compute` → numbers below
- gate: `CR.checkHtml(expandReport(toV2Source(doc,view)), 'BBL.html', {source: toV2Source(doc,view)})` with priceDate/analysisDate set to today (same pattern as `test/v3/render.test.js`) → **0 errors, 0 warnings** (original v2 file: also 0/0)
- `prose.checkRuleB` → **3 errors** (false positives, see gap G3) + 16 warnings
- `node test/v3-test.js` → all green (fixture not wired into tests; not required by the brief)

## Numbers (orig v2 vs v3)

| value | v2 (report) | v3 (compute) | note |
|---|---|---|---|
| Leg 1 P/E (22 × 7.4x) | ฿163 | ฿162.80 | v2 rounded to whole baht |
| Leg 2 DDM (10×1.03/(0.095−0.03)) | ฿158 | ฿158.46 | same |
| Leg 3 Justified P/BV ((7.8−3)/(9.5−3) × 302) | **฿225** | **฿223.02** | v2 arithmetic slip: its own mdesc says ≈0.74 × ฿302 = ฿223.5, not ฿225. Not fudged. |
| weights | "(P/E + avg(DDM, P/BV)) ÷ 2" | `fvWeights [0.5, 0.25, 0.25]` | exact equivalent of the nested family average |
| **FV** | **฿177.00** | **฿176.77** | −0.23 entirely from leg 3 slip (v2 arithmetic with its own ฿163/158/225 = 177.25 → 177) |
| fvLow / fvHigh | ฿158 / ฿225 | ฿158.46 / ฿223.02 | |
| **MOS** | **−11.6%** (stock-meta) · token "−12%" | **−11.73%** · token "−12%" | visible token identical |
| upside | −10.4% | −10.50% | |
| MOS 20% / 30% | ฿141.60 / ฿123.90 | ฿141.42 / ฿123.74 | follows FV |
| P/E (card) | "~8.8x" (stock-meta pe 8.81 ⇒ implied EPS 22.42) | **9.0x** (197.5 / 22.00) | v2 card literal is inconsistent with v2's own TTM EPS ~฿22.0; no source in the file for 22.42 |
| P/BV | ~0.65x | 0.65x | |
| yield | 5.06% | 5.06% | |
| Market Cap | ~฿3.77 แสนล้าน | ฿3.77 แสนล้าน | |
| Scenario tgt Bear/Base/Bull | ฿124 / ฿178 / ฿243 | ฿124.24 / ฿177.90 / ฿242.56 | v2 rounded tgts to integers in `values.scenarios`; v3 round2 |
| Scenario return | −24% (−9%/ปี) · +6% (+2.0%/ปี) · +41% (+12%/ปี) | identical | |
| baseEps | ฿22 | ฿22.00 | |
| gauge bounds | 120–240 | 100–250 | niceBounds recomputed (v2 hand-set; also `fairLabelTop` layout hint dropped) |
| chart bounds / highlight | 150–200, grid 160–190, [1,11] | identical | |

## Visible-text differences (per section)

**Header**
1. h1: v2 `ธนาคารกรุงเทพ (Bangkok Bank)` → v3 `ธนาคารกรุงเทพ (Bangkok Bank) (BBL)` (template now always appends ticker; company already carried an English name in parens → double parenthetical). Choosing `company:"ธนาคารกรุงเทพ"` instead would drop "Bangkok Bank". 676/909 v2 h1s do not contain "(SYM)".
2. `ราคา ≈ 22 ก.ย.` → `ราคา ณ 22 ก.ย.` (fixed word; 37 reports use "≈").
3. 52-week line `฿147–฿204` → `฿147.00 – ฿204.00` (fmtPrice 2dp + spaced dash).
4. Sources `SET / stockanalysis.com / Investing` → comma-joined.
5. gdots: v2 had 4 hand-picked dots; v3 derives 3 from theme.

**§1 Key Metrics** (12 cards both sides; custom cards now forced to the end → order changed: v2 had "กำไรสุทธิ FY2025" at slot 5 and NIM/NPL/CET1 at 9–11 before เงินปันผล)
6. `P/E (TTM) ~8.8x` → `9.0x` (see numbers) · `.d` gains "EPS TTM ฿22.00 · " · the green pill "ต่ำกว่าปกติเล็กน้อย" becomes plain text in parens (no HTML in notes).
7. `P/E มัธยฐาน 5 ปี ~7.4x` → label `P/E เฉลี่ย ~5 ปี`, value `7.4x`, `.d` prefixed "มัธยฐานย้อนหลัง · " (catalogue label says เฉลี่ย while the data is a median).
8. `P/BV ~0.65x` cls `pos` → `0.65x` cls `neu`, `.d` prefixed "BVPS ฿302.00 · ".
9. `EPS (FY2025) ~฿24.1 · TTM ~฿22.0` → `EPS (TTM) ~฿22.00 · GAAP · EPS FY2025 ~฿24.1` — headline and sub-line swapped (fundamentals holds one EPS; the FY figure survives only as a note).
10. `BVPS ~฿302` → `~฿302.00`, `.d` prefixed "มูลค่าทางบัญชีต่อหุ้น · ".
11. `ROE / ROA ~7.3% / 0.90%` → `~7.3% / 0.9%` (ROA forced to 1dp — for banks ROA is normally quoted 2dp) · `.d` prefixed.
12. `เงินปันผล ~5.06% · ฿10/ปี (FY25) • Payout ~41%` → `5.06% · ฿10.00/ปี · (FY25) • Payout ~41%`.
13. `Market Cap ~฿…` loses "~".
14. Custom cards (NI FY2025, NIM, NPL/Coverage, CET1/CAR) render text-identical but lose value classes (`neu`/`pos`) and the `d pos` green on "▲ +1.8% YoY".

**§2 Chart** — text identical; FV legend follows FV (฿177.00 → ฿176.77).

**§3 Valuation**
15. Hint `P/E + เฉลี่ย DDM/P-BV (2 ตระกูล • ธนาคารใช้ P/BV แทน DCF)` → fixed `ถ่วงน้ำหนัก 3 วิธี`.
16. FV box `มูลค่าเหมาะสมเฉลี่ย` → `มูลค่าเหมาะสมถ่วงน้ำหนัก` (true, but the report's concept is "average of 2 families").
17. Leg 1 mdesc `Normalized EPS ~฿22 × P/E มัธยฐาน 5 ปี ~7.4x (FY2021–25 วัดจริง)` → `EPS (TTM) ฿22.00 × P/E เป้าหมาย ~7.4x (มัธยฐาน 5 ปี) — Normalized EPS ~฿22 · มัธยฐาน FY2021–25 วัดจริง` (normalized EPS happens to equal TTM, so no override; "Normalized" survives only in note).
18. Leg 2 mdesc `ปันผล FY25 ฿10` → `ปันผล ฿10.00` + note "ปันผลจ่ายจริง FY25".
19. Leg 3 label pill `<span class="pill g">แทน DCF</span>` → plain `(แทน DCF)` in label; value ฿225 → ฿223.02; BVPS `฿302` → `฿302.00`.
20. Leg values ฿163/158/225 → ฿162.80/158.46/223.02 (2dp).

**§4 Gauge** — markers/scale follow FV; analyst `฿202` literal → token `฿202.00`; prose `~฿202` → `~฿202.00`.

**§5 MOS** — values follow FV; "🧮" emoji dropped from calc label (template text). Input `step="1"` → `0.05` (template THB default).

**§6 Scenarios**
21. Column heads lose emoji (🐻 ⚖️ 🚀).
22. `EPS ปี 3 ~฿20.7/24.0/27.0` → `~฿20.71/24.04/26.95` (v2 rounded Bull 26.95 up to 27.0).
23. `P/E ออก 6.0x / 9.0x` → `6x / 9x` (template prints `${exitMultiple}x` raw; 7.4x unchanged).
24. Targets integer → 2dp (see numbers). Returns identical.

**§7 Catalysts/Risks** — identical.

**§8 Verdict**
25. Analyst cell `~฿202 (Buy)` → `~฿202.00 (Buy · 20 ราย)`.
26. "💡" and "⚠️" emoji dropped.
27. Disclaimer middle sentence customised in v2 ("โดยเฉพาะ Normalized EPS, อัตราเติบโตปันผล (g) … ซึ่งอ่อนไหวต่อทิศทางดอกเบี้ยและเศรษฐกิจไทย") → fixed template sentence ("P/E เป้าหมาย, อัตราเติบโต (g) …"). Only `disclaimerSources` is authorable.

## Conversion choices

- `fundamentals.eps = 22` (`gaap-ttm`): the "TTM ~฿22.0" figure, which is also the P/E-leg "Normalized EPS" and the scenario base → no `override`/`baseOverride` needed. FY2025 EPS ฿24.1 kept only in `metrics.notes.eps`.
- `fundamentals.roe = 7.3` (card, TTM); leg 3 uses `override.roe = 7.8` because v2's formula uses 7.8% — v2 never says where 7.8 comes from (recorded in `override.why`).
- `fvWeights [0.5,0.25,0.25]` reproduces the family-average rule exactly (no solving needed, unlike ZTS).
- `analyst.asOf = 2026-09-21` = analysis date (v2 has no as-of date for the consensus; same proxy as ZTS).
- `scenarios.note` tokenised `7.4x/6.0x/9.0x` → `{{scn.base.exit}}/{{scn.bear.exit}}/{{scn.bull.exit}}` (render-identical) to clear 1 of the 4 Rule-B hits legitimately. `P/BV ~0.65x` (scenario note + catalyst) → `~{{pbv}}x`. Analyst ฿202 in gauge prose → `{{analyst.target}}`.
- `prose.chart` keeps the literal `฿147–฿204` (tokens `{{range52w.*}}` exist but would render `฿147.00`).
- No `extras`, no `declared` legs — every leg is a native method. **The bank valuation itself is expressible**; the gaps are in cards, weighting semantics and text slots.

## Schema gaps (ranked by estimated corpus reach, 909 v2 reports)

Counts via `rtk proxy grep -lE … reports/*.html | wc -l` or a node scan over `reports/*.html`.

**G1 · Family weighting has no first-class expression — ~743 reports mention "ตระกูล"; 743 have a non-template valuation hint (514 with "ตระกูล" in the hint itself).**
- Need: "DDM and Justified P/BV share (r,g) ⇒ one family, one vote; FV = mean of family means" (rule 0.4c-bis / ชั้น 0). The hint text and FV-box wording describe it.
- Why v3 can't: only a flat `fvWeights` array; the rationale is lost, the hint is hardcoded (`ถ่วงน้ำหนัก N วิธี`), and nothing checks that the weights match the family rule (a worker can type any weights).
- Escape hatch: numeric `fvWeights [0.5,0.25,0.25]` + prose in `prose.valuation`.
- Proposal: `legs[i].family: string` (optional). compute: if any leg has `family` and `fvWeights == null` → `w_i = 1/(nFamilies × nLegsInFamily_i)`. Render hint `เฉลี่ย {nFamilies} ตระกูล ({nLegs} วิธี)` and FV box `มูลค่าเหมาะสมเฉลี่ยตามตระกูล`. Gate (ชั้น 0): two legs with identical `(r,g)` inputs (ddm/pbv-justified/dcf/ri) but different `family` → error. Plus `valuation.hint?: string` (short, Rule B) for the ~229 remaining free-text hints.

**G2 · FY figure next to TTM (net income / EPS) — 536 reports have a "กำไรสุทธิ FY…" card; 8 "EPS (FY…)" cards.**
- Need: BBL's card headline is FY2025 net income ฿46,007M and FY2025 EPS ฿24.1, with TTM ฿22.0 as the sub-line. Same gap as ZTS (iii).
- Why: `fundamentals` holds one `eps`/`netIncome`; `netIncome` card is hard-labelled "TTM"; `eps` card label follows `epsBasis` of the single EPS that also drives P/E, legs and scenarios.
- Escape hatch: FY net income → `metrics.custom` (uses 1 of the 4 slots); FY EPS → `metrics.notes.eps`.
- Proposal: `fundamentals.fy: { label: "FY2025", netIncome?, eps?, revenue?, netIncomeYoY? }` + catalogue keys `netIncomeFy`, `epsFy`, `revenueFy` (label `กำไรสุทธิ ${fy.label}`; `.d` = `▲/▼ ${netIncomeYoY}% YoY` with `pos/neg` class). Keeps `fundamentals.eps` as the single price-bound EPS.

**G3 · Rule B false positives on non-price-bound multiples that coincide with current P/E — up to 139 reports have "N.Nx" (N.N = current P/E to 1dp) in visible text outside the P/E card.**
- Need: BBL's historical P/E range "6.0–9.0x" and "~9x เดิม" are 5-year history, not the current P/E (9.0x). `checkRuleB` raises **error** (save-blocking) on `9.0x` in `prose.valuation` and `metrics.notes.peAvg5y` (and in `scenarios.note` before tokenising).
- Why: exact-match rule compares every "N.Nx" against `pe` regardless of context; the spec's `{{lit:…}}` escape is **not implemented** (`TOKEN_RE` in prose.js doesn't accept `lit:`; no `meta.litReasons` in schema).
- Escape hatch: none for those two fields — left verbatim (fixture fails Rule B there; `validate`/`compute`/gate still pass). Scenario note fixed legitimately with `{{scn.*.exit}}`.
- Proposal: implement `{{lit:9.0x}}` (render = inner text; Rule B skips it) + `meta.litReasons: string[]` as spec §4 says; and/or add `{{peAvg5y.lo}}/{{peAvg5y.hi}}` via `fundamentals.peRange5y: {lo, hi}` so the peAvg5y card `.d` renders `กรอบ 6.0–9.0x` itself. Also Rule-B warnings are noisy for banks: `2.49%`/`2.72%` (NIM) warn against `analyst.pct` (+2%), `฿204` (52w high) against analyst ฿202, `41%` (payout) against bull return — suggest excluding `metrics.custom` values whose label is a known KPI, or tightening `pct` tolerance when the bound is a small integer %.

**G4 · Card `.d` / leg label cannot carry emphasis pills or value classes — 124 reports have a pill in a card `.d`; 93 have a pill inside a leg `.mname`.**
- Need: `<span class="pill g">ต่ำกว่าปกติเล็กน้อย</span>` under P/E, `<span class="pill g">แทน DCF</span>` on leg 3, `v pos` on P/BV/CET1, `d pos` on "▲ +1.8% YoY".
- Why: prose whitelist is `<b><i><br>` only; catalogue fixes `cls` per key; `custom[]` has no `cls`; leg `label` is `esc()`'d.
- Escape hatch: plain text in parentheses.
- Proposal: `metrics.notes[k]` / `custom[i]` accept `{text, pill?: {text, tone: "g"|"r"|"y"}}`; `custom[i].tone?: "pos"|"neg"|"neu"`; `legs[i].tag?: string` rendered as `<span class="pill g">`. Card `cls` override: `metrics.tone?: {pbv: "pos"}` (enum).

**G5 · Bank KPI cards (NIM, NPL, Coverage, CET1/CAR, cost-to-income) not in the catalogue — 41 reports have ≥1 bank-KPI card, 23 have ≥2.**
- Need: BBL shows NIM 2.49%, NPL 3.0% / Coverage 324%, CET1 16.4% / CAR 20.9%.
- Why: `CARD_KEYS` has none; `FUND_KEYS` has no bank fields ⇒ values are free text, unchecked, and not usable by gate/index.
- Escape hatch: 3 × `metrics.custom` (with G2's FY-NI card this hits the **≤4 custom cap exactly** — a bank that also wants cost-to-income or loan growth cannot fit).
- Proposal: `fundamentals.bank: { nim, nplRatio, coverage, cet1, car, costToIncome?, loanGrowth? }` (all %, numbers) + catalogue keys `nim` (`NIM`, `x.xx%`), `npl` (`NPL / Coverage`, `a% / b%`), `capital` (`CET1 / CAR`, `~a% / b%`), `costToIncome`. Schema: require `region`-agnostic but only valid when `bank` present. Optional `.d` note as today. Raising the custom cap is not needed once these exist.

**G6 · h1 always appends "(SYM)" — 676/909 v2 h1s have no ticker; many Thai names already carry an English name in parens.**
- BBL renders `ธนาคารกรุงเทพ (Bangkok Bank) (BBL)`.
- Proposal: `meta.companyEn?: string`; render `h1 = company + (companyEn ? ` (${companyEn})` : '') ` + ticker only when `!companyEn` — or accept the new convention and drop English from `company` at migration (owner call).

**G7 · Disclaimer body not authorable — ~350 reports (909 − 559 matching the standard sentence verbatim) customise the "โดยเฉพาะ …" sentence.**
- BBL names Normalized EPS / dividend growth / interest-rate sensitivity. v3 has only `disclaimerSources`.
- Proposal: `prose.disclaimerFocus?: string` replacing the "โดยเฉพาะ …" clause (Rule B applies); default = current template sentence.

**G8 · Freeform mdesc qualifiers & formatting — all reports with hand-written mdesc (~universal; 368 have Justified P/BV / "P/BV เหมาะสม").**
- `Normalized EPS` vs `EPS (TTM)` label (value equal to TTM so no override applies; override path would print "EPS ปรับ"), `ปันผล FY25` qualifier, whole-baht leg values.
- Proposal: `legs[i].inputs.epsLabel?`/`dpsLabel?` enum (`normalized`, `fy`, `forward`) for the mdesc base name — or let `override.eps` be allowed to equal fundamentals with `why` so the label says "EPS ปกติ". Leg values: consider `fmtPrice` whole-baht for THB ≥ 100 (site-wide decision).

**G9 · Template number formatting (site-wide, not per-report).**
- Exit multiple `6x`/`9x` instead of `6.0x`/`9.0x` (render uses raw number; `{{scn.*.exit}}` token uses `.toFixed(1)` — the template and its own token disagree) → use `toFixed(1)` in `col()`.
- ROA forced 1dp (`0.9%` vs bank convention `0.90%`) → 2dp when `< 2`.
- `peAvg5y` card label "เฉลี่ย" while the field is documented as the median → label `P/E มัธยฐาน ~5 ปี`.
- 52-week in header `฿147.00 – ฿204.00` vs `฿147–฿204`.

**G10 · Analyst `asOf` required but absent in v2 (all migrated reports).** Same as ZTS (5). Proposal: allow `asOf: null` for `themeLegacy`-era (migrated) docs, or let migration stamp `analysisDate` with a `asOfSource:"analysisDate"` marker.

**Not gaps (bank-specific checks that passed):** `pbv` justified with `override.roe` expresses the bank leg exactly (incl. mdesc formula); `ddm` is native; `pbv` card computes 0.65x from `bvps`; P/BV-instead-of-DCF needed no `declared` leg.
