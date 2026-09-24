# FER v2 vs v3 render — comparison findings (Plan 2 Task 0)

Shape: **SOTP valuation + finite-horizon DDM, 2 inline-styled tables (EUR financials + SOTP segments), EUR statements under a USD quote.**
Fixture: `test/fixtures/v3/FER-real.json` (schema 0 errors · `_sig` valid · `node test/v3-test.js` all green).
Gate: `CR.checkHtml(expandReport(toV2Source(doc,view)), 'FER.html', {source: toV2Source(doc,view)})` → **0 errors, 0 warnings** (original `reports/FER.html` on the same gate: 0/0).
Throwaway scripts: `.superpowers/sdd/v3-plan2-task0/FER/{build-fixture,check,textdiff,corpus}.js` (+ rendered `FER.v2src.html`, `FER.expanded.html`).
Rule B on the fixture: 0 errors · 11 warnings (all false positives or stale literals — see gap 13) · W31 money-literal count 45.

## Numbers — orig vs v3

| value | v2 (reports/FER.html, RV.derive) | v3 (compute) | |
|---|---|---|---|
| leg 1 SOTP | $51.81 | $51.81 (`declared`, basis sotp, extrasRef 1) | = (declared, not computed) |
| leg 2 DDM 40-yr | $55.02 | $55.02 (`declared`, basis other) | = (declared, not computed) |
| FV | 53.42 | 53.415 → 53.42 | = |
| fvLow / fvHigh | 51.81 / 55.02 | 51.81 / 55.02 | = |
| MOS / upside | −5.39% / −5.12% | −5.39% / −5.12% | = |
| MOS20 / MOS30 | 42.74 / 37.39 | 42.74 / 37.39 | = |
| scenario tgt Bear/Base/Bull | 34.03 / 55.07 / 80.39 | 34.03 / 55.07 / 80.39 | = |
| scenario total (%/yr) | −32.63 (−12.50) / +5.81 (+1.96) / +51.49 (+14.73) | identical | = |
| EPS yr-3 | ~$1.13 / $1.53 / $1.91 | $1.13 / $1.53 / $1.91 | = |
| yield | 2.29% | 2.29% | = |
| P/BV card | ~6.8x | 6.82x | fmt |
| Market cap | ~$40.6B | $40.6B | fmt |
| **stock-meta.pe** | **57.4** (rd.eps = 0.98 = *forward* FY2026E) | **58.04** (fundamentals.eps = 0.97 TTM) | **differs — see D1** |
| "P/E (TTM)" card | ~57.0x (stale hand literal, from Yahoo at $55.04) | 58.0x | differs (v3 is correct at $56.30) |
| "P/E (Forward)" card | ~57.4x (`{{rd:pe}}`) | 57.4x (`peForward`, epsForward 0.98) | = |
| gauge scale | 35–80 (incl. analyst $76.96) | 35–60 (analyst = null) | differs — gap 3 |
| chart min/max/grid | 50/80/[60,70] | 50/80/[60,70] | = (highlight [4,11] → [11,4], same points) |

## Differences (visible text, orig vs v3 — `textdiff.js`)

**D1. P/E basis split.** v2 stored the *forward* EPS 0.98 in `rd.values.eps`, so `{{rd:pe}}`/stock-meta.pe = 57.4 is a forward P/E, while the "P/E (TTM)" card was a stale literal 57.0x. v3 stores TTM eps 0.97 + `epsForward` 0.98. The cards are now right (58.0x TTM, 57.4x fwd), but **stock-meta/reports.json pe changes 57.4 → 58.04** (the index shows a different P/E). 19 reports feed a "Forward" P/E card from `{{rd:pe}}`, so the migration will shift their index P/E the same way.

**D2. Analyst block.** `analyst = null` (gap 3). Lost: the gauge-scale marker "$76.96 เป้าเฉลี่ย Analyst" and the verdict cell "~$76.96 (Buy)". The verdict cell now says **"ไม่มีข้อมูล", which is false**. The $76.96 is kept only as a literal in `prose.gauge`.

**D3. Relocations (text kept, position changed):**
- Section-3 hint "SOTP + DDM — ห้ามใช้ P/E" → v3 prints "เฉลี่ย 2 วิธี". The original text is now the bold first line of `prose.valuation`.
- The "⛔ ทำไมจึงไม่ใช้ P/E…" paragraph came **before** the legs in v2. `prose.valuation` renders **after** the fv-box.
- EUR table (inside section 1 in v2) → `extras[0]` in its own `<section>` after section 1. The paragraphs above and below the table are merged into one `note` below it.
- SOTP table + "สมมติฐานหลักและที่มา" paragraph (inside section 3 in v2) → `extras[1]` in its own `<section>` after section 3. The table title moves from a bold `<p>` to `<h3>`.
- SOTP total row "รวม SOTP 32,280 / 44.83" and the colspan FX row "แปลงเป็น USD … $51.81" → note text (gap 8).
- The FER-specific disclaimer clause ("โดยเฉพาะอัตราคิดลด (r), … อายุสัมปทานที่ใช้ตัดจบมูลค่า") is replaced by the template's fixed "โดยเฉพาะ P/E เป้าหมาย, g, r และ ROE", **which contradicts this report ("ห้ามใช้ P/E")**. The FER clause is kept by prefixing it to `disclaimerSources`, so it now reads as a second, duplicate sentence.
- Scenario hint "EPS ฐาน ~$0.98 **(forward FY2026E)**": the qualifier is dropped. It survives in `scenarios.baseOverride.why` and `scenarios.note`.

**D4. Card wording (catalogue-driven, same class as ZTS b2):**
- mcap `.d`: "721 ล้านหุ้น (≈ €34.2B…)" became "~721.1M หุ้น · ≈ €34.2B…".
- pe `.d` gains the prefix "EPS TTM $0.97 · ".
- "P/E (Forward)" is now labelled "Forward P/E", with `.d` "EPS ประมาณการ (Forward) $0.98 · FY2026E (…)".
- pbv `.d` is now "BVPS $8.26 · …".
- eps `.d` is now "**GAAP** · งบสกุล EUR…". FER reports under IFRS, so "GAAP" is wrong (gap 12).
- ROE is labelled "ROE / ROA", with `.d` "ผลตอบแทนต่อทุน / สินทรัพย์ · TTM (FY2025 14.3%)".
- grossMargin `.d` gains the prefix "Gross margin · ".
- yield `.d`: "$1.29/หุ้น (€1.12)" became "$1.29/ปี · (€1.12)".
- `~` is dropped from mcap, P/BV and yield.
- Card order changed: the 4 EUR cards are `custom[]`, which always render last. v2 interleaved them at positions 5, 7, 9 and 12.
- Custom cards lose the `pos`/`neu` value colour.

**D5. Numbers in extras.** Numeric cells go through `RV.fmtPrice`. The €/share column shows "−1.81" as "**-1.81**" (ASCII hyphen, U+2212 lost). The €M column had to be strings, otherwise 13469 renders as "13,469.00" and −1300 as "-1,300.00".

**D6. Template chrome:**
- Emoji dropped from fixed labels: 🐻 ⚖️ 🚀 (scenario columns), 🧮 (calculator), 💡 (strategy), ⚠️ (คำเตือน).
- The chart legend line colour is `var(--blue)` instead of the brand accent #1d7fed.

**D7. Section count.** The page has 10 `<section>`s (8 + 2 extras). The gate does not object.

### What inline-style stripping actually loses (FER has 143 `style=` attributes)

**No text is lost to style stripping.** Every styled block was a table or paragraph whose text now sits in `extras[].rows` / `extras[].note` / `prose.*`, and `<b>` survives. What is lost is presentation only:
1. The header-row rule and zebra borders. `.xtab` styling is whatever `dashboard.css` gives it.
2. Right alignment of number columns and centre alignment of the "สัมปทานหมดอายุ" column.
3. Bold on the total rows (they are now bold text in the note, not rows).
4. The `colspan=4` FX row.
5. The `overflow-x:auto` wrapper. Wide tables on mobile depend on `.xtab` CSS.
6. Muted small-font styling on the explanatory paragraphs (now plain `.xnote`).
7. The brand-coloured legend swatch.

The content *losses* come from missing **slots**, not from styles: D2 analyst, plus D3 positions and the disclaimer clause (preserved only by relocation or duplication).

## Schema gaps (ranked by estimated corpus reach — 909 reports, counts via `corpus.js`)

| # | gap | est. reports |
|---|---|---|
| 1 | Section-3 hint not authorable | ~302 |
| 2 | Disclaimer assumption clause fixed | ~350 |
| 3 | `analyst.n` required | ~499 (762/880 verdict cells) |
| 4 | FY-scoped card / custom ordering | ~508 |
| 5 | No slot for extra paragraphs (valuation intro, section-1 note) | 62 (8 intro) |
| 6 | Content in inline-styled blocks | 93 (5 heavy) |
| 7 | Statement currency ≠ quote currency | ~14 |
| 8 | SOTP `sumCol`: no total row, no E52, no FX step | 15 SOTP/NAV legs |
| 9 | No finite-horizon / multi-stage DDM | ≥4 |
| 10 | extras cell formatting | 5 table reports + future |
| 11 | extras placement / single note | 5 |
| 12 | `epsBasis` lacks IFRS | ~14 |
| 13 | Rule B false positives on `$80M` | many (11 hits in FER alone) |

1. **Section-3 hint not authorable** (~**302** reports have a valuation hint other than "เฉลี่ย/ถ่วงน้ำหนัก N วิธี", e.g. "เฉลี่ย 2 วิธี (คนละตระกูล)", "N ตระกูลสมมติฐาน").
   - FER needs "SOTP + DDM — ห้ามใช้ P/E".
   - Escape hatch: moved to the head of `prose.valuation`.
   - **Proposal:** `valuation.hint?: string` (prose rule B, ≤60 chars). Render it instead of the generated phrase when present. Alternatively derive it from a new `legs[].family` (see 9) as "เฉลี่ย N วิธี (M ตระกูล)".
2. **Disclaimer assumption clause is fixed** (~**350** reports differ from the skeleton's "โดยเฉพาะ P/E เป้าหมาย, g, r และ ROE").
   - For FER the fixed clause is actively wrong.
   - Escape hatch: FER clause prefixed into `disclaimerSources` (duplicate sentence).
   - **Proposal:** `prose.disclaimerAssumptions?: string` that replaces the fixed clause. Or generate it from `legs[].method` (pe → "P/E เป้าหมาย", ddm/dcf → "r, g", declared sotp → "มูลค่ารายสินทรัพย์").
3. **`analyst.n` is required** (~**499** reports never state "N ราย" anywhere; **762/880** verdict analyst cells have no count).
   - FER has target $76.96 and rating Buy, but no count.
   - Escape hatch: `analyst: null`. The gauge marker is lost and the cell prints a false "ไม่มีข้อมูล".
   - **Proposal:** make `analyst.n` optional (`int ≥1 | null`). `analystCell` renders `(${rating}${n ? ' · ' + n + ' ราย' : ''})`. `asOf` should be optional too, or defaulted to `market.priceDate` by the migrator, since v2 never records it.
4. **Card scoped to a period other than TTM** (**508** reports have a card label containing "FY20xx"; same as ZTS a2).
   - FER needs "กำไรสุทธิ FY2025 €888M".
   - Escape hatch: `custom[]`, which also forces the card to the end.
   - **Proposal:** `metrics.cards` items may be `{key, period: 'FY2025', value?: number}`, where period relabels the card and value supplies the FY figure. Also allow `custom[]` entries to be placed with `metrics.order: string[]` (catalogue keys + `custom:0..3`).
5. **No slot for extra explanatory paragraphs** (**62** reports have more than 4 `<p style>` blocks; **8** have an intro paragraph before the legs in section 3).
   - FER has a pre-legs "why not P/E" paragraph and a section-1 paragraph.
   - Escape hatch: merged into `prose.valuation` / `extras[0].note`, with order changed.
   - **Proposal:** `prose.valuationIntro?` (rendered above the legs) and `metrics.note?` (paragraph under the card grid). Both go through prose rule B.
6. **Inline-styled content blocks** (**93** reports have non-skeleton `style=` on content elements, excluding the gdots/range-card template variants; **5** are heavy: FER 122, CCEP 108, IMO 74, TD 52, B 38 — exactly the 5 reports with `<table>`).
   - For FER, **no text is lost** (see list above). Presentation only.
   - **Proposal:** none beyond 5 and 10. The whitelist ban is correct as long as extras can carry tables.
7. **Statement currency ≠ quote currency** (**14** USD-quoted reports show non-USD money in a card value: ASML CCEP CCJ CNI DB FANUY FER KYCCF NOK RACE RY SAP TRP TSM; 14 mention IFRS).
   - FER's revenue, net income, FCF and net cash are in EUR. Catalogue `big()` always prefixes `view.cur` ($), so these could not go in `fundamentals` without mislabelling or mixing with mcap/ps.
   - Escape hatch: 4 `custom[]` cards, which uses the whole ≤4 limit. A fifth EUR card would have been lost.
   - **Proposal:** `fundamentals.statementCurrency?: 'EUR'|'CAD'|…` plus `fx?: {pair:'EURUSD', rate:1.15566, asOf:'2026-08-07'}`. Catalogue money cards (revenue, netIncome, fcf, netDebt) format with the statement symbol. Price-bound ratios (ps, evEbitda) convert with `fx.rate`.
8. **SOTP via `declared` + `extras` works, but the tie-out is incomplete** (**15** reports use a SOTP/NAV leg: APO ARE BN BRK-B CG CPT ESS FER GULF MRNA NBIS S SPI TKS VMRK; 20 mention SOTP).
   - Answer to the key question: SOTP **must** be `declared` (basis `sotp`). There is no computing method for it, and that is fine.
   - Problems found:
     - (a) **E52 is not implemented.** `sumCol` is only schema-checked and the sum is never compared to the leg.
     - (b) `sumCol` is **not rendered**, so there is no total row. And since every row must be numeric in `sumCol`, a hand-written total row can't be kept (it would also double-count).
     - (c) **Currency.** Σ(€/share) = 44.84 but the leg is $51.81 (× EURUSD 1.15566). A naive E52 would fail FER. 2 SOTP reports carry an FX step.
     - (d) **Rounding.** Σ = 44.84 vs the stated 44.83.
   - **Proposal:** `extras[].sumCol` renders an automatic footer row "รวม" (bold) = Σ. Add `extras[].toLeg?: {scale: number, note?: string}` (FER: `scale: 1.15566`), and have E52 check `|Σ×scale − leg.value| ≤ 0.5%`.
9. **No finite-horizon / multi-stage DDM** (≥**4** reports with "DDM 2 ระยะ / หลายระยะ / อายุจำกัด" legs; the concession/utility/REIT population is larger).
   - FER's 40-year DDM with TV = 0 went to `declared` basis other.
   - **Proposal:** `method: 'ddm2'`, inputs `{d1, g1, years1, g2, r, horizon: int|null}` (horizon null means a Gordon terminal at the end of stage 2).
     - Formula: `Σ_{t=1..horizon} D_t/(1+r)^t` with `D_1 = d1` and `D_{t+1} = D_t·(1+(t<years1 ? g1 : g2))`.
     - **Verified:** d1 2.04, g1 11, years1 10, g2 3, r 8.5, horizon 40 gives **$55.02 exactly**.
     - The other stage-boundary convention (`t≤years1`) gives **$57.67**, which is the author's old wrong value "$57.66". A computed leg would have made that error impossible.
   - The same pattern applies to concession DCFs with no terminal value (`dcf.tg: null` + `horizon`).
10. **extras cell formatting** (the 5 table reports, plus every future SOTP).
    - Numbers render as `fmtPrice` (2 dp, ASCII "-", thousands separator only ≥1000). There is no percent, integer, `+` sign or U+2212.
    - **Proposal:** `extras[].colFmt?: ('text'|'int'|'dec2'|'pct1'|'money')[]` using U+2212 for negatives, plus `extras[].align?` or simply right-align numeric `<td>` in `.xtab`.
11. **extras placement and single note** (5).
    - The table always renders as a separate section after the anchor section, never inside it. There is one note, rendered below.
    - **Proposal:** `extras[].noteAbove?`. Optionally render `after:'valuation'` extras inside section 3's card (between the fv-box and `prose.valuation`), which is where every v2 SOTP table sits.
12. **`epsBasis` lacks IFRS** (~14).
    - The eps card `.d` prints "GAAP" for an IFRS filer.
    - **Proposal:** add the enum value `'ifrs-ttm'` → "IFRS". Or make the label "งบ (TTM)" for gaap-ttm when `statementCurrency` is set.
13. **Rule B false positives on unit-suffixed amounts** (corpus-wide).
    - "$80M" (I-66 dividend) warns against the bull target $80.39.
    - "6%"/"5.25%" warn against the base return 5.8%.
    - "+2.4% YoY" warns against the 2.29% yield.
    - **Proposal:** in `prose.js` `CAND` money regex, add a negative lookahead `(?![0-9.,]*\s*(?:[MBK]\b|ล้าน|พันล้าน))`. For pct warnings, skip literals followed by "YoY" or preceded by "โต/ถือ/สัดส่วน" (or restrict pct warn to ±0.3pp).

Also noted (not schema gaps):
- Stale literals "57.0x" (prose + risks) are kept verbatim and warn under rule B against pe 58.0.
- 45 W31 money literals remain, all legitimate historical/financial amounts.
- `analyst.asOf` has no v2 source.
