# Incident log A — price-flags queue runs & follow-up fix sessions (9–20 Aug 2026)

Source: Claude Code transcripts. CCD session ids map to CLI transcripts via
`~/Library/Application Support/Claude/claude-code-sessions/<installid>/<profile>/local_<uuid>.json` → `cliSessionId` → `~/.claude/projects/<cwd-slug>/<cliSessionId>.jsonl`.
(The batch's session uuids are **not** transcript filenames — that indirection is why a naive `find` fails.)

**Timestamps in transcripts are UTC.** Section headers use Asia/Bangkok (UTC+7), which is how the repo and the owner date things. E.g. a run starting `2026-08-08T21:57Z` is 9 Aug 04:57 ICT.

Parent → child chain (from `spawnedFrom` in the CCD session metadata):
`01 → 02` · `03 → 04` · `06 → 07` · `09 → 10` and `09 → 11` · `12 → 13`. Every fix session in this batch was spawned from a queue run.

---

## 2026-08-09 (ICT) — "Price-flags clearing" — 40-stock run
`local_6399bb7e-…` → `94abed7e-…jsonl` (worktree `advisor-fable-e125b5`) · 08-08T21:57Z → 08-09T00:16Z = **2h19m** · **291 assistant messages** · 41 commits

**(b) User request (verbatim):** `clear price-flags` (two words, no further instruction).

**(c) Queue at start:** **40 flags** — 19 `mos-sign-flip`, 13 `drift-gt-15pct`, 8 `suspect-split-or-data`. All 40 had report files; none fresher than 7 days. 2 THB (CPW, TASCO).

**(d) Problems discovered**

1. **StockAnalysis.com hard 403 across all symbols (US + Thai) at run start** — took out *both* source `[2]` (cross-verify) and source `[3]` (5-year statements) simultaneously. Diagnosed as IP/Cloudflare-level, not a User-Agent issue (explicitly refused to evade bot detection). Recovered on its own after ~30 min. First 14 stocks were done "degraded" (price-only, FV held, "รอ full financials" disclosed); remaining 26 got full data. *Class: NEW (source outage) — plumbing, not a gate blind spot. Human/controller-caught; the canary workflow `fundamentals-canary.yml` exists for exactly this but the run hit it live.*
2. **Google Finance EPS field is quarterly, not TTM** — the documented fallback. Deriving TTM as `price ÷ P/E` works, but the naive read gives false EPS conflicts. Concretely **ONTO** looked like a 19.6% EPS conflict under the fallback; when StockAnalysis returned it matched Yahoo exactly. *Class: NEW data-source trap. Controller-caught.*
3. **`update-prices.js` stamps TODAY's date on the all-time-high in `px-meta` on every run** — silent corruption across 900+ reports on every daily cron. Found on **INTC**: ATH date moved "(3 ส.ค.)" → "(7 ส.ค.)" purely as a side effect of `--write --force`, while the real ATH was 22 มิ.ย. *Class: NEW tooling bug. Human-caught (gate has no check). Filed as a chip — **no fix session in this batch → open**.*
4. **SPCX pre-existing §0.4c violation** — FV $125 was the flat average of legs 2.6× apart (EV/Sales $68 · DCF $130 · Analyst $177), plus an apparent 3× share-count disagreement. Surfaced by a worker. *Class: repeat of the known §0.4c family, but NEW instance. Human-caught — `npm run verify` passed the file. → became session 02.*
5. **SITM frozen FY2026E EPS ≈ 2× off consensus** ($7.80 vs ~$14.0–14.9), worth ~+28% on FV. *Human-caught, chip filed, out of scope. No fix session in this batch → open.*
6. **TSEM anchored its target multiple to today's forward P/E** — the §0.4b cyclical anchoring trap. Gate passed (0 error; W05 fired as the *documented* consequence of §0.4c). Controller judged the direction conservative and pushed anyway, flagging for methodology review. *Class: repeat of a known class; precursor of the W18 "dead-anchor" class that only shipped 9 Sep.*
7. **ONTO round-2 re-run found a materially wrong balance-sheet claim** — report said "แทบไม่มีหนี้ ~$13M" when actual debt was **$1.47B**, plus a wrong ROE. Only found because the controller re-ran ONTO after the source came back. *Human-caught; gate cannot see prose claims.*
8. **3 stocks deliberately frozen** (LITE Δ8.4%, COHR Δ12.9%, CPW Δ14.3%) because earnings were *upcoming* (11/12/13 Aug), so period-timing could not explain the EPS conflict. CPW additionally had a dividend contradiction (report ฿0.09/3.8% vs source ฿0.19/7.09%) left for the post-earnings full UPDATE.
9. **Model-default trap re-confirmed**: probe subagent (no `model` pinned) came back **Opus 5**, so `model:"sonnet"` had to be pinned on all 40 calls.

**(e) Fixes shipped in-session:** 41 commits / 40 stocks (ONTO twice). ~29 of 40 self-escalated from UPDATE-LIGHT to full UPDATE because Q2 earnings had landed 3–6 Aug. All 8 `suspect-split-or-data` flags were confirmed **not** splits (verified via Yahoo `events=split` before spawning). Memory updated: corrected the old "sequential only" rule → parallel is fine with a verify barrier; recorded the Google-Finance quarterly-EPS trap.

**(f) Effort:** 291 assistant turns · 2h19m · 1 explicit round-2 re-dispatch (ONTO) · parallelism ramped 1→3→5→6 with no rate limits.

**(g) Left open:** ATH-date bug chip (no session in this batch) · SITM re-analysis chip · TSEM anchoring flagged but not fixed · LITE/COHR/CPW frozen pending earnings (by design) · AKAM left 2 of 3 FV legs on "รอ full financials" because it ran during the outage.

---

## 2026-08-09 (ICT) — "Fix SPCX valuation — §0.4c violation in FV average"
`local_e2b9ca06-…` → `21855d75-…jsonl` · spawned from the 9 Aug run · 08-09T07:27Z → 09:43Z = **2h16m** · **142 assistant messages** · 1 commit

**(b) Request:** the chip text from the 40-stock run — two items: §0.4c averaging violation, and a share-count inconsistency needing a primary-source check.

**(d) Findings**

1. **§0.4c violation confirmed and fixed.** Replaced the flat average with a single market-anchored headline: SOTP EV/Sales on **measured** medians of 15 peers (same definition throughout, EV ÷ TTM revenue). Advertising (X) was split out of the AI segment because its revenue is *shrinking* — comping it at CoreWeave/Nebius multiples was a definitional mismatch. **FV $125 → $22.06, MOS −6.5% → −503%.** DCF $130 demoted to context per §0.4d(a) (FCF TTM −$31.2B); analyst $231.40 demoted to a consistency check; Morningstar <$66 used as the §0.2 witness for |MOS|>40%.
2. **The share-count item was a FALSE ALARM.** Both numbers were right for different purposes: 10-Q cover (28 Jul 2026) Class A 7,696,293,669 + Class B 5,485,486,276 = **13,181,779,945** outstanding; the financials table's 3,912M is TTM **weighted-average diluted** shares (depressed because most of the TTM window predates the IPO, plus a May 5:1 split). *This is the `data-source-traps` "Shares row = weighted average, not outstanding" trap — it looks like a data bug every time.*
3. **Piggyback correction:** EPS TTM −$2.52 → −$2.27, reconciled at statement level.
4. **Process deviation the session self-reported:** the report was stamped `Claude Opus 5` and the commit trailer likewise, departing from the §5 literal string the request specified.

**(e) Shipped:** 1 commit (`6aaf2467`), gate green 38/38 on SPCX, 0 error 0 warning. Memory: weighted-average-vs-outstanding trap recorded.

**(f) Effort:** 142 turns · 2h16m · 0 re-dispatches. **(g) Open:** nothing; the `ai-model`/trailer convention question was left to the owner.

---

## 2026-08-12 (ICT) — "Price-flags clearing" — 13-stock run
`local_7779dd86-…` → `d2363e01-…jsonl` (worktree `clear-price-flags-20489c`) · 08-12T03:49Z → 04:42Z = **53 min** · **228 assistant messages** · 10 commits pushed

**(b) Request:** `clear price-flags`.

**(c) Queue at start:** **13 flags** — mostly `mos-sign-flip`, one `drift-gt-15pct` (ONON), one `suspect-split-or-data` (MNST). Symbols: DDOG GNRC HAL JD KKR LITE MNST ONON ONTO SE STEC SUN VRTX.

**(d) Problems discovered**

1. **`price-flags.json` race** — `update-prices.js` rewrites the whole file read-modify-write with no lock, and SKILL 5C tells *each worker* to run the tool. 3+ parallel workers would resurrect flags they had just cleared. The previous parallel-safety evidence (40 stocks, N=3→6, 9 Aug) did not cover it because that run was all NEW-mode work that never touches the file. **Fix: controller patched all 13 prices in one process; every worker prompt forbade running the tool.** *Class: NEW infrastructure race. Caught by advisor + controller; no gate check exists.*
2. **MNST split chart mixes two price bases — and the gate structurally cannot catch it.** Yahoo returned `events.splits` 2:1 yet `close === adjclose` on every point; its *monthly* series was split-adjusted from Jan 2026 onward but not Sep–Dec 2025; daily bars weren't adjusted at all (31 Dec 76.67 → 2 Jan 76.16, no discontinuity — proving the on-chart "cliff" was an artifact). Result: a fake −50% cliff and an annual label **▼ −32.4%** when the true single-basis figure is **▲ +35.3% — sign inverted**. **E36 passed 39/39 because the label and the chart endpoint were wrong together.** *Class: NEW, highest-severity find of the run. Human-caught. → became session 04.*
3. **Price-derived cards go stale silently while the gate passes** — the class that later becomes W15/W16/E41–E43. Concretely, on reports already pushed earlier in the same run: **SE** Market Cap $56B shown vs $80.5B actual (**off 33%**); **VRTX** entire Key Metrics grid stale and internally inconsistent with its own stated inputs (Market Cap $124.7B vs 253.8M × $529.65 = $134.4B; P/E 29.14 × EPS 16.86 = $491 ≠ $529.65; P/BV 6.44 × 72.35 = $466 ≠ price; analyst target $548.69/+11.7% vs $563.12/+6.3%). Verified the gate's blindness directly: `npm test -- DDOG` passed **39/39 on an unprocessed report with fresh numbers and stale prose**. *Class: NEW as a systematic finding (individually a repeat). Human-caught.*
4. **LITE told readers the company was heavily indebted when it had flipped to net cash** — "หนี้สูง $2.6B vs เงินสด $877M" while FY2026 showed cash $2,738M > debt $1,671M, D/E 0.01. Also Market Cap ~$69.5B vs ~$61.2B, and a "P/E forward 56x on EPS $8.2" card whose own numbers don't multiply to the price (real: 43.8x on $18.73). The worker had knowingly left the card as out of scope. Required a **round-2 re-dispatch**.
5. **ONON's +28% "deep value" MOS was manufactured by a stale FV** — price dropped 20.3% post-earnings, FV never updated. Re-derived → FV $43.00 → $30.60, MOS −1.0%. *Repeat of the class "MOS looks attractive only because FV is stale."*
6. **Vendor forward-EPS was the wrong fiscal period (ONTO)** — Yahoo `epsFwd` 11.57 = **FY2027e**, not next year (FY2026e = $8.09), baking in two years of growth. FV $302 → $287. *Class: repeat/extension of the known `data-source-traps` "forward EPS may be FY+2" trap.*
7. **KKR card mislabelled**: "GAAP EPS (TTM)" card carried FY2025 $2.53; true TTM $3.13. *Worker-caught pre-existing bug.*
8. **SUN EPS conflict 0.18 vs 0.08 (125%)** resolved to ฿0.17 diluted (NI ฿142M ÷ 858M); the 0.08 implied NI ฿60.78M contradicting the same website's own income statement. Worker also found the **dividend was halved in Apr 2026** (฿0.10 → ฿0.05), breaking the report's "yield cushion" thesis (run-rate 4.2%, not 6.25%), and removed an analyst-target claim with no real coverage.
9. **GNRC scenario table used a synthetic entry price** ($234) — worker-caught and fixed.
10. **Controller's own prompt caused a defect**: it fenced workers off all of `stock-meta`, but SKILL 5B gives workers `pe/eps/roe` (only `price/mos/upside` are script-owned) — leaving VRTX with a knowingly contradictory `pe`, fixed by hand.
11. **`node tools/update-prices.js --help` started a full scan instead of printing help** (had to `pkill`). Minor tooling papercut.
12. **Model-default trap re-confirmed again**: probe returned Opus 5.

**(e) Fixes shipped:** 13 stocks (10 commits; 4 FV changes MNST/ONON/ONTO/STEC, 7 FV held), MNST chart rebased to post-split by hand, VRTX/SE/LITE card+prose repairs, `stock-meta.pe` fix (closing W10). Memory updated: Yahoo split non-adjustment trap; price-flags race + "gate can't see stale prose/cards, spot-check yourself."

**(f) Effort:** 228 turns · 53 min · **2 round-2 re-dispatches** (LITE-fix, VRTX-fix) · ramp 3 → 6 parallel.

**(g) Left open:** 2 chips filed — split-aware guard (→ session 04, same day) and **full LITE re-analysis** (scenario table still on the old ~$8.2 EPS base; the FY2026 −$6.94B net loss cause still unidentified) — *no session in this batch → open*. Also noted: the hand-fixed MNST chart would be silently reverted by the next 07:17 cron, and the STEC→STECON file rename was deliberately not done.

---

## 2026-08-12 (ICT) — "Make update-prices split-aware (freeze bad charts)"
`local_efc42733-…` → `19a801ba-…jsonl` · spawned from the 12 Aug run · 08-12T04:45Z → 05:21Z = **36 min** · **150 assistant messages** · 1 commit (`55fb79f5`)

**(b) Request:** the chip from the 12 Aug run — detect mixed-basis chart series, freeze instead of patching, document, add a self-test case.

**(d) Findings while fixing**

1. **The 52-week range needed for detection is already in the v8 chart meta** — and Yahoo split-adjusts `fiftyTwoWeekLow/High` even while the close series is unadjusted (MNST: meta 30.485–50.17 alongside raw closes 67.31–76.67). So no separate quote endpoint, no crumb/cookie problem.
2. **The requested auto-repair path (item 3) had no input**: a live probe returned `events: {}` — Yahoo had *already dropped* the splits event for MNST at `range=1y`. Skipped per "prefer freezing over guessing".
3. **The 908-symbol dry run exposed a defect the synthetic fixture missed**: raw Yahoo floats printed into the flag detail as `76.66999816894531`. Fixed test-first.
4. **The requested test location was wrong**: `self-test.js` is the meta-test for `check-reports`, and the detector is unreachable from `check-reports` by construction. Tests went to `test/update-prices-test.js` (step 1 of the same gate) instead — explicitly reported as a deviation.
5. **Freeze-reason table lives in `docs/price-refresh.md`, not `docs/quality-gate.md`** as the chip assumed.
6. Cosmetic: doubled 🛑 in `prep-stock` output.

**(e) Shipped:** `detectMixedBasis()` in `tools/update-prices.js`; new freeze reason **`bad-chart`**; `--force` still stamps price/date but passes `chartData = null` so a hand-corrected chart survives; `fetch-facts.js`/`prep-stock.js` exit 2 rather than printing a chart for an agent to copy. Files: `tools/{update-prices,fetch-facts,prep-stock}.js`, `test/update-prices-test.js`, `docs/{price-refresh,quality-gate}.md`, `SKILL.md`. Measurement: 908-symbol dry run trips **exactly MNST**; 227-symbol sample shows **zero out-of-range points even at tol=0**, so the 10% tolerance is pure headroom.

**(f) Effort:** 150 turns · 36 min · 0 re-dispatches (TDD: RED → GREEN → sweep).

**(g) Open:** by design, the next cron would log `freeze MNST [bad-chart]` and put MNST back in the just-emptied queue — flagged to the owner as the guard working, self-clearing once Yahoo propagates.

---

## 2026-08-13 (ICT) — "Clear Price-Flags" — 11-stock run
`local_1bb1c5cf-…` → `d8d1ce05-…jsonl` (worktree `discovery-th-us-2026-08-81228a`) · 08-13T08:16Z → 09:27Z = **1h11m** · **324 assistant messages** · 13 commits

**(b) Request:** `Clear Price-Flags`.

**(c) Queue at start:** **11 flags** — 10 `mos-sign-flip`/`drift-gt-15pct`, 1 `suspect-split-or-data` (NBIS). Symbols: CAMT CIEN COHU CRDO CRWV ENTG FSLR MU NBIS SMCI STX. This is the first run to adopt the **pre-patch-then-commit** pattern from 12 Aug (price patch for all 11 in one process, pushed as its own commit, then workers banned from `update-prices`).

**(d) Problems discovered**

1. **Controller's own prompt-trimming broke a worker (CRWV)** — the Cash figure was present in the prep data but got trimmed while building the worker prompt, so CRWV could not compute EV/Sales and **correctly self-blocked**. Required a **round-2 re-spawn** with the complete table. *Class: NEW (controller prompt-construction defect). Caught by the worker refusing to guess.*
2. **Stale prose the gate can't see, again** — CIEN had a stale price/`P/E GAAP ~139x` reference in the disclosure paragraph and risk list; CRWV's dispersion-gate disclosure footer still cited the old $83.5 FV and old range. Both fixed controller-side. *Repeat of the 12 Aug class.*
3. **Mixed calendar convention (พ.ศ. vs ค.ศ.) introduced by two workers** — footer/date handling. Controller-caught; recorded in the `price-refresh-cron` memory as a new gotcha.
4. **CAMT footer date wrong** (used the price date 12 ส.ค. rather than today 13 ส.ค.) — minor, controller-fixed, then a footer-date reminder was baked into later batches' prompts.
5. **Pre-existing wrong 52-week low (MU)** — report carried $103 when the real low is $113.46, which also made four derived "+775%" statistics wrong (→ +703% / +1,006%). *Worker-caught pre-existing data error.*
6. **STX EPS 32% off** ($10.56 in report vs $13.90 verified from the statements), which forced an escalation to a full UPDATE (FV $870 → $906). Yahoo's 14.84 was the outlier.
7. **NBIS vendor EPS was double-counting a one-off** — the vendor quote-level TTM was abnormally high because the TTM window counted the ClickHouse revaluation gain twice; resolved against the **SEC Form 6-K (12 Aug)** directly. Also set `pe = null` because TTM EPS is not core earnings.
8. **CAMT TTM window swallowed a convertible-buyback capital loss** (SEC 6-K 10 Aug) — GAAP TTM EPS $1.05 → $0.78 while non-GAAP moved only −2.8%. Correctly diagnosed as accounting noise, not operating deterioration; FV held.
9. **CRWV net debt jumped $32.88B → $46.07B** while revenue growth decelerated — FV $83.50 → $38.50, MOS −29% → −179.8%.
10. **Push timed out mid pre-push-hook** on STX; retried with a longer timeout. Infrastructure papercut.

**(e) Fixes shipped:** 11 stocks, 13 commits (1 price pre-patch + 11 stocks + 1 amend). 5 self-escalated to full UPDATE (CAMT, CRWV, MU-adjacent, SMCI, STX, NBIS). Memory `price-refresh-cron` updated with: preserve the calendar convention, grep the whole file for stale references, don't trim the FUNDAMENTALS table when building prompts.

**(f) Effort:** 324 turns · 1h11m · **1 round-2 re-dispatch** (CRWV) · batches of 3 + 1 escalated Opus worker (NBIS).

**(g) Left open:** **no chips filed and no fix session spawned** — this is the only queue run in the batch that produced no tooling follow-up.

---

## 2026-08-17 (ICT; transcript 08-16T20:01Z) — "เคลียร์คิว price-flags" — 12-stock run
`local_8451658a-…` → `11956eb1-…jsonl` (worktree `project-domain-name-027118`) · 08-16T20:01Z → 21:23Z = **1h22m** · **201 assistant messages** · 5 commits

**(b) Request:** `เคลียร์คิว price-flags`.

**(c) Queue at start:** **12 flags**, all `drift-gt-15pct` / `mos-sign-flip`. Symbols: AAOI CAMT CSCO KDP POET RDDT STX TPR AMATA ANI SMPC TU (4 Thai). Prices cross-verified 0.00% on all 12; 5 showed EPS deltas (POET 21.1%, ANI 16.7%, CAMT 5.1%, SMPC 4.1%, AAOI 2.5%).

**(d) Problems discovered**

1. **★ The controller's own prompt injected a wrong share count into the workers** — the `Shares` row in prep block `[3]` is **TTM weighted-average diluted**, not shares outstanding, and the prompt told workers to reconcile Market Cap against it. Measured error across the queue: **POET 133M vs 172.6M actual (−30%)**, **AAOI 80.2M vs 84.57M**, **CAMT 51.0M vs 46.04M (+11% — diluted *exceeds* outstanding because of convertibles, so the sign is unpredictable)**, RDDT 203M vs 192.4M, TPR 210M vs 199.4M, CSCO $445B vs $440B. Worst consequence: **the CAMT worker changed a number that was already correct (46.7M) into a wrong one (51.0M)**, and AAOI's FV was inflated through two of three legs. **The gate caught none of it — found by hand spot-check.** AAOI needed a **round-2 full UPDATE at effort high** (FV $160 → $155). *Class: NEW as a systematic prompt-level defect; individually a repeat of the SPCX weighted-average trap from 9 Aug.*
2. **★ `prep-stock` can print "✅ Δ EPS 0% ตรงกัน" while the EPS is wrong** — it compares only the two vendors' *quote* EPS, which are pulled from the same feed. **AMATA: both vendors said ฿4.48 while the `[3]` statements give ฿3.22 (NI 3,698M ÷ 1,149M) — a 39% gap**, with ROE likewise 20.05% (quote) vs 15.0% (table). The worker resolved it to ฿3.22 (Yahoo's own forward EPS sits on that base) and disclosed both. *Class: NEW blind spot in the mandatory pre-fetch tool. Human-caught. → became session 07.*
3. **Dividend yields stale on all 4 Thai names** because the report computed yield off the old price — ANI 5.68%→6.06%, SMPC 7.69%→6.86%, TU 6.1%→6.30%. (Yahoo's figure didn't reconcile; StockAnalysis's div÷price did.) *Precursor of the W19/W20 class that only shipped 11 Sep.*
4. **SMPC balance sheet moved hard** — cash ฿1,075M → ฿24M with debt up; prose claiming "lots of cash" had to be corrected.
5. **AMATA FV is a flat average of P/E + DDM + Justified P/BV** where DDM and JPBV share the same (r,g) — a ชั้น 0.4c-bis violation. Correct weighting: ฿30.1 / MOS −3.7% instead of ฿29.50 / −5.9%. Deliberately **not** fixed because TU and SMPC are likely the same and so are an unknown share of the 900+ corpus; fixing only AMATA because a worker happened to mention it would be arbitrary. *Chip filed → became the 17 Aug "FV family weighting 0.4c-bis" sweep (outside this batch).*
6. **KDP raised a W08 warning** in a repo then at zero warnings; investigated and found **pre-existing, 75 instances repo-wide** — not a regression. *(This is the Buddhist-year-FY W08 false-positive family that session 08 attacks the next day.)*
7. **Dual-class market-cap hazard (RDDT)** surfaced: StockAnalysis computes market cap from the listed class only.

**(e) Fixes shipped:** 12 stocks, 5 commits (1 price pre-patch + 4 batched). FV changed on 5 (AAOI $157→$155, CSCO $116→$120, KDP $29.71→$30.91, RDDT $160→$166, TPR $110→$102, ANI ฿3.35→฿3.65). Layer-0 cluster check run and passed. All 12 `ai-model` stamps verified `Claude Sonnet 5`. Memory `data-source-traps.md` §6b/§6c added.

**(f) Effort:** 201 turns · 1h22m · **1 round-2 re-dispatch** (AAOI) + hand-repair of CAMT/CSCO · batches of 4.

**(g) Left open:** 2 chips — prep-stock blind spots (→ session 07, same evening) and **the corpus-wide 0.4c-bis flat-average audit** (survey-only, explicitly "do not mass-edit").

---

## 2026-08-17 (ICT; transcript 08-16T22:06Z) — "Fix prep-stock blind spots: shares + EPS cross-check"
`local_2b2d0eae-…` → `c31ad0e0-…jsonl` · spawned from the 12-stock run · 08-16T22:06Z → 22:31Z = **25 min** · **112 assistant messages** · 1 commit (`11d26c2b..fee33248`)

**(b) Request:** the chip — teach `prep-stock`/`fetch-fundamentals` to emit real shares outstanding, and add a third EPS comparison so "both vendors agree" can't be a false pass.

**(d) Findings while fixing**

1. **`statistics/__data.json` `hover` field gives the unrounded number** (`46,044,477`, not `46.04M`) — used instead of the `curl | grep` the chip suggested.
2. **Deliberately did not fall back to `saPrimaryPath`** — home-market shares ÷ OTC price would mix bases.
3. **The dual-class case falls out for free (RDDT)**: `sharesout` 192.40M vs listed class 146.10M → warn that SA's market cap is single-class. Decision: never compute market cap independently, print the vendor's.
4. **The first canary pattern was inert** — `"Shares Outstanding"` alone matches the *failure* message too, so it would pass while the source was dead. Fixed to require `=`. *A checker that can't fail is the same class of bug the repo keeps hitting.*
5. **`require.main === module` guard was missing in `fetch-fundamentals.js`** — requiring it from a test fired live network calls.
6. **Deviation reported:** the long label went into a footnote rather than the table column, because `labelW` is a max over all rows and a 60-char label would widen every row for every stock (token cost).

**(e) Shipped:** block `[2b]` (Shares Outstanding / Market Cap + >3% divergence warning + dual-class warning); `Shares` row relabelled `Shares(wAvgDil)` with a "ห้ามใช้เป็นหุ้นคงเหลือ" footnote; new `Δ EPS(quote↔ตาราง[3])` third comparison (**WARN only — exit-code contract 0/1/2 unchanged**, with a test pinning that the 39% case stays exit 0); dividend-yield reconciliation with a >0.2pp flag; `test/prep-stock-test.js` 21 → **50 offline cases** including a **round-trip test** (formatter in `fetch-fundamentals` → `parseDeltas` in `prep-stock`) so the two files can't drift out of sync; 3 mutation tests confirmed the suite catches regressions; 2 new canary patterns. `npm run verify` 13 steps, 0 error 0 warning.

**(f) Effort:** 112 turns · 25 min · 0 re-dispatches.

**(g) Left open (explicitly handed back to the owner):** `npm run test:prep` is **not in the `verify` chain**, so the pre-push hook does not guard these two files (adding it would make the gate 14 steps and require editing CLAUDE.md §8); and a one-line pointer to `[2b]` in `_template/agent-prompt.md` / SKILL.md was proposed but not made.

---

## 2026-08-17 → 2026-08-18 (ICT) — "Fix W08 gate blind spot for Buddhist-year FY" — the mega-session
`local_c49bd9b5-…` → `c36161cb-…jsonl` (worktree `mystifying-wilbur-33805f`) · 08-16T22:32Z → 08-18T06:10Z = **31h37m wall** (with sleep gaps) · **2,297 assistant messages · 87 commits · 23 subagent dispatches · 2 context compactions · 59 user turns**

⚠️ This is not a single fix. It started as the W08 chip and turned into a corpus-wide warning sweep plus **two in-line price-flags queue clears**. It was spawned from `local_90605561` ("Audit legacy FV weighting against ชั้น 0.4c-bis"), which was itself the *other* chip from the 17 Aug 12-stock run — so the chain is **06 → 0.4c-bis audit → 08**.

**(b) User requests (verbatim, in order):** the W08 chip text · `fix MKC's "FY พ.ย. 2568" form too` · `ต้องทำอะไรเพิ่มไหม` · `ลุยต่อเลย แก้ทั้ง 9 ใบ` · `ไล่เก็บ 44 ใบที่เหลือเลย` · `push ที่เหลือแล้วทำ 6 ตัวสะอาดต่อ` · `อธิบายข้อ 1` · `ทำข้อ 1 ต่อเลย และปรับเป็น 5% ด้วย` · `5 ไม่มีผล ก็ปรับไป 3 เหมือนเดิมครับ` · `บัคจบหมดหรือยัง?` · `ทำ W04 ต่อเลย ให้ cron จัดการเหมือนข้อ 1` · **`เคลียร์คิว price-flags 3 ตัวด้วย`** · `แก้ 6j ต่อเลย` · `แก้ 11 ใบที่ W14 ฟ้องด้วย` · `แก้ CRWV ต่อเลย` · `แก้ 14 ใบที่ W05 ฟ้องใหม่ด้วย` · `แก้ W05 ที่เหลือ 21 ใบด้วย` · `ดูคิวคำศัพท์ 49 รายการที่ค้างอยู่ต่อ` · `ผมต้องแก้อะไรอีกไหม`. A `/goal` Stop-hook ("แก้ข้อผิดพลาดต่างๆ จนกว่าจะเสร็จทั้งหมด") was set at 08-18T00:06Z and blocked stopping twice.

**(c) Queues handled inside this session:** 3 flags mid-session (AU · SICT `mos-sign-flip`, HANA `drift>15%`) and 4 more at the end (TAP, CBRS, PWR, RDDT), both raised by the daily cron while the session was running.

**(d) Problems discovered — this session is the batch's densest**

*Checker bugs (gate reporting falsely):*
1. **W08 fiscal-period regex only matched Gregorian `20\d\d`** — Thai reports write `FY2568`, `Q1/2569`, `4Q/2568`. Widened to `(?:20|25)\d\d`. **Measured impact smaller than reported: 33 → 6, not "most of ~500 Thai reports"** (most already passed via the `ไตรมาส` fallback).
2. **Second W08 form: `FY พ.ย. 2568` / `FY สิ้นสุด 30 ก.ย. 2568` / `FYE 30 เม.ย. 2569`** (MKC). Pattern promoted to a module-level `FISCAL_REF`; fiscal sub-branch then **33 → 0**.
3. **★ W08's *other* sub-branch ("แหล่งข้อมูล <3") had two independent bugs**: the keyword `/source/` matched **inside company names** — `Ever·source·`, `Re·source·s`, `Cyber·source·`, `...sourced` — so the check read a business blurb instead of the "ที่มา:" line (7 reports); and `·` (U+00B7) was missing from the separator list, so a correct source line collapsed into one >40-char blob and counted as 0 (CHG, ZEN). **9 false positives.** Fixing it also exposed **2 false negatives** (COR, COST had been passing free).
4. **W06 fired on 553/908 reports (61%)** — the "ส่วนต่างจากราคา" cell is frozen prose while MOS is recomputed live from a price the cron moves daily, and **the cron's dead-band (±3pp) is wider than W06's tolerance (2.5pp)**, so normal cron operation pushes reports into warning with nobody at fault. Severity recomputed: 164 at 2.5–5pp, 204 at 5–10pp, 118 at 10–20pp, **39 at >20pp**, median 6.9pp, max 90.8pp; **26 genuinely contradict direction** (report says "cheap" while the number says expensive).
5. **W07's P/BV ceiling of 20 was below reality** (CL 127x, MA 88x measured) — 14 false positives.
6. **W01 couldn't add the dividend leg** even though the card header says "รวมปันผล" — 22 false positives.
7. **W10 mis-parses the dividend card** when it starts with an amount (`$4.12 (~2.96%)` → grabs 4.12 and compares it to a percent) — same class as W08 (parser grabs the wrong number). Reported independently by the O and STZ workers on different rounds; fixed at the reports first, at the checker later.
8. **W05 did not know rule §0.4c** — it averaged a leg the report had explicitly labelled "บริบท — ไม่รวมในกรอบ FV". **The controller had itself mis-diagnosed CRWV as a 0.4c violation; reading the actual file showed the report was correct and the checker was wrong.** Rewritten in 3 layers; the corpus went 37 → 35 but the composition changed: **16 correct reports cleared, 14 genuine violations newly exposed**.
9. **E21/E22 only check the "P/E" and "Justified P/BV" cards — EV/EBITDA, P/S, DCF cards were checked by nobody** (found by the HANA worker; recorded as trap `6j`). Closed by a new **W14** that recomputes P/FCF, DDM and EV/EBITDA from the formula in `.mdesc`. **The W14 parser took 5 dry-run rounds to stabilise — the first round's 22%/18% hit rate was entirely parser error** (grabbed total FCF instead of FCF/share; read the `/` in "EV/EBITDA" as division; a stray "cash generation" flipped debt's sign). Final: 11 reports flagged, **0 false positives**, all hand-confirmed.
10. **The W06 fix's own follow-on:** cron now syncs the number but never the *word*, by design — so direction conflicts stay for a human.

*Controller's own mistakes (self-reported):*
11. **Pushed CF believing a worker's "EPS matches, Δ0.2%"** — that delta was vendor↔vendor, **not report↔current**. CF's card said $11.08 while the real TTM was $13.44 (**21% stale**).
12. **`git add -A` swept COR into COST's commit**, breaking "1 commit = 1 stock". Switched to per-file paths.
13. **Claimed "54 reports have a flipped sign"** — his own analysis script compared across definitions (the card carries no sign because direction is in the Thai words). Retracted.
14. **Claimed "23 reports have stale EPS"** from a screening script that also compared **adjusted vs GAAP** (ICLR −96.8%, SGC +600% were impossible values). Retracted down to three hand-verified cases (CAT, CF, COP).
15. **Ran `prep-stock` for AU without `--th`** and nearly sent **AngloGold (NYSE:AU)** numbers to the After You (SET:AU) worker — caught only because Δ EPS read **+3008%**.
16. **Told the HANA worker the ฿0.66 quote was probably corrupt** (pattern-matching the earlier WPH case); the truth was the opposite — Q2 earnings (+831%) landed the same day as the price jump and the `[3]` table hadn't caught up. **The Opus worker checked and refused the wrong instruction.** Recorded as memory traps 6h/6i: quote-vs-table conflict has two *opposite* causes and the earnings date decides, not "the table always wins".
17. **Nearly published APURE at MOS −112%** from a worker-invented multiple (P/S 0.55x when the stock's own 5-year median is 1.86x). Rejected; a full UPDATE gave −8%. Added a "the multiple's base must be actually measured" check before every push.
18. **Rejected M's first worker output** — a single-leg P/E FV of ฿31.68 (MOS +30% "good") built on "EPS normalized ฿1.44 × ~22x" with no basis for the multiple. Re-fetch found true TTM EPS ฿0.85 (the SA quote was 3 quarters stale) → FV ฿16.91, **MOS −31%** — the opposite verdict.

*Tooling bug introduced by the previous fix session:*
19. **★ The dual-class warning added in session 07 was written backwards.** Block `[2b]` told workers "SA's Market Cap counts only the listed class"; measured, RDDT's $31.65B ÷ **all classes** 192.40M = $164.50 = the exact current price (GOOGL matches the same way). A worker trusting that warning would have got every per-share figure wrong. Caught by the **CBRS worker**, fixed, and pinned with a direction test (`prep-stock-test` 51/51). Lesson recorded: *a tool's own warning can be wrong — if a reversible calculation contradicts it, trust the calculation.*

*Content problems found while sweeping (not gate bugs):*
20. Investment conclusion flipped on 5 reports (SNNP — payout 155% funded by debt that went ฿28.7M → ฿2,434M; NEM; FCX; PHM; GIS). FV methods that broke the rules from the start: **OKE** weighted DDM+JPBV as 2 votes on one (r,g); **FCX/HSY** calibrated to consensus (§0.4 forbids); **CAT** had all three legs hanging on the single assumption "P/E reverts 36.9x → 17.2x" with |MOS| 95.6% and **no independent witness** — sent back for a second round. Plain data errors: **PHM ROE 23% (real 14.9%)**, **O Market Cap $42.7B (real $59.35B)**, ONEE FCF/share matching neither FY nor TTM, **SAWAD derived EPS from price ÷ P/E** (a forbidden method), PFGC carrying an expired explanation. **ROJNA** called itself "cash-rich net cash" while carrying ฿13.9bn net debt, and its ฿1.30 EPS was an unrealised fair-value gain. **APURE**: the `P/FCF` TTM row in the ratios block sits on a different FCF cut than the statements table.
21. **The tag-vocabulary queue had an entry but no exit** — `--request` with no `--resolve`, so completed requests accumulated and nobody could tell what was still pending (which is why the count sat at 49 from 13 Aug).

**(e) Fixes shipped:** 87 commits. Checker/cron fixes: W08 ×2 (+source-line parsing), W06 root cause (cron now syncs the number, never the word), W04 (cron syncs the verdict box class; zone thresholds unified into one `mosBand()` instead of three copies), W07 ceiling 20 → 200, W01 dividend-leg parsing, W10, new **W14**, W05 rewritten for §0.4c/0.4c-bis, `--resolve` added to `tag-apply.js`, `fetch-fundamentals` dual-class warning corrected. Corpus effect: **warnings 652 → 0**; W08 41 → 0; W06 553 → 0; W05 37 → 0; W14 11 → 0; W13 3 → 0 (3 new tag slugs + 13 approved themes, vocabulary queue 52 → 21). Self-test **97 → 150 cases**; `update-prices-test` 152 → 161; `prep-stock-test` → 51. 7 flagged stocks cleared in-session.

**(f) Effort:** **2,297 assistant turns · ~31.6h wall · at least 4 round-2 re-dispatches** (CAT, APURE, M, RCAT) · 2 compactions · a Stop-hook goal that fired twice.

**(g) Left open:** at the end, error 0 / warning 0 — but explicitly deferred: the 44 reports citing only 2 sources (a §2 cross-source content job, not a bug); the "no ที่มา line at all" case is still silent and would need a new E-code; `docs/quality-gate.md` layer 0.4b still needed the cyclical-multiple rules written up; **21 tag-vocabulary requests still queued** (single-member themes).

> **Note for the "new problem every run" thesis:** this session's headline finding is that **81 of 84 remaining warnings were checker false positives, not bad reports** — "ถ้าไล่แก้รายงานตามคำฟ้องจะทำลายเนื้อหาที่ถูกอยู่แล้ว". Only CB, AYUD and FORM were real.

---

## 2026-08-19 (ICT; transcript 08-18T23:24Z) — "เคลียร์คิว price-flags" — 19-stock run
`local_b24eb98e-…` → `c723c4be-…jsonl` (worktree `v8-backtest-bug-rejection-10378c`) · 08-18T23:24Z → 08-19T00:53Z = **1h29m** · **305 assistant messages** · 6 commits

**(b) Request:** `เคลียร์คิว price-flags`.

**(c) Queue at start: EMPTY.** The queue had been cleared the previous day at 13:05 and the 07:17 cron hadn't run yet (it was 06:25 ICT). The controller ran `update-prices` **dry-run** to preview what the next cron would freeze — **19 symbols**, of which **16 carry the `ai-datacenter` tag** and fell −3.6% to −19.4% in one session (ULTA +4.7% was the only other theme). It then front-ran the cron rather than wait ~2.5h. 14 → UPDATE-LIGHT, 5 → full UPDATE (COHR, SITM, APH, FN, KEYS).

**(d) Problems discovered**

1. **★ Six of 19 reports carried stale price-derived values while `npm test -- <SYM>` passed 40/40.** AAOI's analyst-target card still said **+8.7%** (computed off the old $150.28) when the truth was **+24.3%**; ARM's `stock-meta.pe` was 288 while the on-page card read 258x (**the file contradicted itself**) and its analyst target was refreshed in section 8 but not section 3; CRDO **hadn't been touched at all** — P/E stuck at ~107x in the card and 4 prose spots when both vendors said ≈98x, plus forward P/E and P/S; JBL's card said 42x while `stock-meta.pe` said 41; FORM's `stock-meta.pe` was still on a price *older than yesterday's*; STX's `pe` 70 vs card 65.0x. *Class: NEW as a named systematic class ("price-derived staleness"); the individual symptom is a repeat from 12 and 17 Aug. All human-caught.* → became **session 11** (and the memory file `price-derived-staleness.md`).
2. **`prep-stock` still doesn't compare against the report**, so the controller wrote its own EPS screen — and **that screen read only Yahoo's `epsTTM`**. Two workers corrected their controller:
   - **KEYS** — Yahoo's `epsTTM` was **stale**, not yet absorbing the Q3 reported *that same day*. The worker pulled SEC 8-K exhibit 99.1 and chained the quarters: 6.10 − 1.10 + 2.30 = **$7.30** (SA/table say 7.28) ⇒ the real move was **+19.3%, not +1.8%**. It also separated cause from coincidence: the beat was large but the −8.7% drop happened *before* the release — sector selling.
   - **SITM** — Yahoo's $0.60 is **basic** EPS; the verified diluted figure is **$0.52** (convertible notes of $1,350M), so the move was **+6.1%, not +22.4%**. *New trap: quote = basic vs table = diluted.* FV correctly held because no FV leg uses TTM EPS.
   After both, the controller **re-screened all 19 against both sources** — only KEYS and SITM disagreed materially, so the mode assignments already pushed still stood.
3. **★ §0.4b's mandatory pre-fetch could not be performed**: StockAnalysis's `financials/ratios/` page is now **client-rendered** (HTML has structure, no numbers) and the API returned **404** on both shapes tried. Rather than let workers invent multiples (the APURE trap), a stated fallback ladder was imposed — keep the report's own method+multiple and change only EPS → else use the current PE/fwdPE from two sources in FUNDAMENTALS → plus a hard stop if the new FV is >2× from the analyst target. All 5 kept the existing multiple. *Class: NEW source-infrastructure regression. Open.*
4. **★ `fetch-fundamentals`' EPS provenance line is arithmetically wrong for if-converted companies** — it printed `ตาราง=4.12 = NI 770 ÷ 195M หุ้น` for COHR, but 770/195 = **3.95**. The verdict (Δ 0.0%) was right; the *explanation* was wrong, and dangerous because SKILL forbids workers from re-fetching, so anyone dividing per the printed formula gets the wrong base for the whole report. Caught by the COHR (Opus) worker via SEC XBRL. → became **session 10**.
5. **The controller's own `derivecheck.js` had the repo's own anti-pattern** — it silently skipped the P/E test when its EPS regex missed, violating the §8 rule "a check must fail loudly when it can't find the value". Fixed mid-run. It also produced its own false positives (AEHR's legitimate price-history narrative `$81.05 → $123.25 (+52.1%)`; PWR's `pe` on the adjusted basis; SITM's `pe` 1303 with a too-tight ±1 tolerance).
6. **The controller's instruction created a trap it had to close**: telling workers to leave `mos`/`upside` stale would turn `npm test` red, tempting a worker to "fix" it by moving FV. Explicitly forbidden mid-run.
7. **Worker-caught sign-flips** — CIEN, PLXS, PWR, STX all still said "price above fair value" after falling below it; ULTA's prose annual return `+4.4%` contradicted the header `−5.5%` computed from the real chart.
8. **FN's judgement call, accepted:** the two vendors' forward EPS disagreed 20% (Yahoo implied 21.84, SA 18.20), so the worker moved the P/E leg's base to verifiable TTM at the same 33x — **FV $630 → $582, zone good → ok**. Accepted on the reasoning that picking SA's forward would be choosing the prettier answer on a number just declared unreliable.
9. `zsh` doesn't word-split unquoted vars — a shell papercut that produced a bogus "missing" list.

**(e) Fixes shipped:** 19 stocks pushed; 1 pre-patch commit for all 19 prices (through `preserve-dates` so the analysis dates didn't bounce); FV changed on 4 (FN −, APH +, COHR +, KEYS +), SITM held; zone flips on FN (good→ok) and APH (bad→ok). A reusable `derivecheck.js` was written mid-run. Dry-run at the end confirmed **freeze 0** — the cron's queue never materialised. 2 memory entries + **2 chips**.

**(f) Effort:** 305 turns · 1h29m · 0 full re-dispatches, but **6 reports hand-repaired by the controller after the worker returned**, and a 7-item checklist was injected into the 16 not-yet-started prompts mid-run (after which CIEN/ENTG/JBL/PLXS started catching their own).

**(g) Left open:** the median-multiples pre-fetch is broken (client-rendered page); P/S and Market Cap were *known* to be in the same staleness class but not yet covered.

---

## 2026-08-19 (ICT) — "Fix wrong EPS derivation line in fetch-fundamentals"
`local_c7610086-…` → `eeaad8ba-…jsonl` · spawned from the 19-stock run · 07:31Z → 08:55Z = **1h23m** · **67 assistant messages** · 1 commit (`4d43f058`)

**(d) Findings**

1. Root cause: StockAnalysis's `NetIncome` row is `NetIncomeLossAvailableToCommonStockholdersBasic` (already net of preferred dividends), while diluted EPS for a company with convertibles uses the **if-converted** numerator (add back preferred dividends / after-tax convertible interest). COHR: **805 ÷ 195.4 = 4.12**, confirmed against SEC XBRL `EarningsPerShareDiluted`.
2. **The suggested "fetch the right numerator" fix was impossible** — the pre-preferred profit figure is simply not in StockAnalysis's payload. Gate-before-printing was used instead.
3. **★ A second affected stock found while testing: CAMT** — EPS(dil) 0.78 vs NI 37.7 ÷ 51.0M = 0.74 (5.2%), but from **convertible notes, not preferred**. The warning wording was broadened from "บุริมสิทธิแปลงสภาพ" to "ตราสารแปลงสภาพ" so a worker looking at CAMT wouldn't dismiss it. LITE / POET / AAPL / NVDA were clean. Published CAMT report judged unaffected (Δ quote↔table 0.2%).

**(e) Shipped:** `tableEpsTTM` now returns `derived` separately from the displayed `eps`; the formula is printed **only when they reconcile**, otherwise an if-converted warning is printed; the no-EPS(dil)-row path gets its own caveat; a one-line pointer was added under table `[3]` at the exact spot workers read (self-declared as beyond the brief, offered for veto). `test:prep` 45 → **69** including a round-trip check pinning `ตาราง=4.12` not 3.95. Verdict and exit codes unchanged.

**(f) Effort:** 67 turns · 1h23m · 0 re-dispatches · held for owner approval before push per §5.

**(g) Open:** the memory note recording that the tool now guards this case was offered but not written.

---

## 2026-08-19 (ICT) — "Add price-derived checks to quality gate"
`local_8a1ecaab-…` → `6a1e6f48-…jsonl` · spawned from the 19-stock run (sibling of session 10) · 07:31Z → 09:32Z = **2h01m** · **222 assistant messages** · 6 commits in two waves

**(b) Request:** the chip — add checks so stale `stock-meta.pe` and analyst-target percentages are caught automatically. The chip itself warned about the multi-EPS-basis false-positive risk and predicted "if it fires on more than ~2% of the corpus the criterion is too coarse".

**(d) Findings**

1. **★ The real scale was 13× the estimate: the new check fired on 233/908 (26%)** — and hand-checking showed **every one was genuinely wrong**, not a coarse threshold (ZS printed a target upside of +53% when the current price gives +3.9%; ACN +43% → +4.7%).
2. **★ The decisive structural insight: adding an E-code without shipping a healer would have permanently broken the cron** — the cron runs `npm run verify` itself before pushing, so the moment prices moved the gate would go red and the cron could never push again. Check and healer had to ship together.
3. **Multi-basis EPS solved by reading the EPS from the card's own `.d` line** rather than the whole file (PWR GAAP 80x alongside Adj. 53x, ENTG, FORM all pass); **no declared EPS ⇒ silent**, matching E21/W14; historical labels ("P/E เฉลี่ย ~5 ปี", 475 cards) skipped.
4. **Second wave found the class was bigger still: Market Cap wrong on 544/908 (60%)** (ACN 36%, ADSK 31%, AAON 22%) and P/S on 3.
5. **★ A tolerance subtlety that would have killed the cron another way:** the criterion must add "half of the last printed digit", not a flat 3% — for "$2T", half a ulp is 25% of the value, so the healer would write back the same number while the checker kept failing = an error no heal can ever clear = dead cron.
6. Deliberate silences with stated reasons: **ADR/ADS market caps** (BABA "ADR ≈ 8 ordinary", ASML "385M ADR" — guessing ordinary shares gets the order of magnitude wrong, ~34 reports), implied-price outside 0.4–2.5× (different share class, e.g. BRK-B), EV/Sales (needs net debt, no printed base), and W15's one miss where a tag splits the number from its parenthesis (`<b>$1,218</b> (+16.2%)`, EQIX).
7. New design rule extracted: **within-card = E-code · cross-card/prose = W-code** — P/S takes its numerator from another card, so an error there could block the cron on something the healer can't fix.

**(e) Shipped:** new `tools/derived-values.js` (single source of truth shared by checker and patcher, modelled on `price-date.js`); `patchDerived()` wired into `update-prices.js` after the price patch (**never touches prose**) plus a `--heal-derived [--prose]` mode that computes from the price already in the file rather than hitting Yahoo. New codes **E41 (P/E) · E42 (target % in card) · W15 (target % in prose) · E43 (Market Cap) · W16 (P/S)**. Corpus: E41 233→0, E42 81→0, W15 92→1, E43 544→0, W16 3→0; healed 547 + 831 reports with **`reports.json.updated` unmoved** (preserve-dates). self-test 150 → **182**; update-prices-test → 175. Gate becomes **43 error + 15 warning**.

**(f) Effort:** 222 turns · 2h01m · two owner checkpoints (commits held, not auto-pushed, per §5) · an explicit race warning: push before the 07:17 cron or the rebase collides on hundreds of files (recovery = drop the heal commits and re-run `--heal-derived --write`, which is deterministic).

**(g) Open:** EV/Sales, ADR/ADS caps, out-of-band bases, the EQIX prose case — all deliberately excluded with reasons.

---

## 2026-08-20 (ICT) — "เคลียร์คิว price-flags" — 12-item run
`local_a8bc0ae6-…` → `92e8f6b4-…jsonl` (worktree `project-domain-name-027118`) · 08-20T09:12Z → 10:20Z = **1h08m** · **187 assistant messages** · 5 commits

**(b) Request:** `เคลียร์คิว price-flags`.

**(c) Queue at start:** **12 items** — 1 `not-on-exchange` (AVB) + 11 price flags: AMKR COHU LRCX MXL RGLD FICO CPNG DHR IQV WAT EL. Screening by last-earnings-date vs last-analysis-date routed 10 to UPDATE-LIGHT and **EL to a full UPDATE** (FY2026 results 19 Aug, after the 8 Aug analysis).

**(d) Problems discovered**

1. **AVB `not-on-exchange` was real, not a false positive** — AvalonBay merged with Equity Residential into **Vivmark Residential (NYSE: VMRK)**, closed 17 Aug; 2.793 VMRK per AVB; last traded 14 Aug at $184.06. Confirmed four ways (issuer IR, StockAnalysis delisted banner, Yahoo quote frozen since 14 Aug, TradingView absent on all 5 boards, VMRK trading at $64.35). Report deleted + `tag-apply --prune`; deliberately **not** put in `symbol-map` because it isn't a 1:1 rename.
2. **★ ALL 11 reports had stale 3-year scenario returns while the gate showed 43/43 green.** No E/W code ties `<div class="ret">` to the price and the cron never touched it. Worst case: **RGLD's Bear scenario displayed +8.7% — a positive return in the worst case — when the truth is −11.3%.** **COHU's header said "จากจุดเข้า $56.14" while the percentages were computed from ~$49**, i.e. stale across earlier rounds too. Two workers made it worse by updating the entry-point *label* without the percentages, so label and number contradicted each other. *Class: NEW named class ("price-derived staleness, class 2"). 100% hit rate on the queue. Human-caught.* → became **session 13**.
3. **★ EL's FV legs used multiples that were never measured — and it was pushed before that check was made** (the controller notes this inverted the order its own memory `6L` prescribes). Two of three legs violated §0.4b: the EV/EBITDA leg multiplied a worker-invented EBITDA of $1.29B (actual-margin OpM 5.6% + a guessed $450M D&A) by an unsourced 24x (real FY2026 EBITDA $1,644M, 5-yr median EV/EBITDA 21.15x); the EV/Revenue leg used **2.7x = today's market multiple** (Current 2.74x) — a **dead anchor that returns $96 against a $98.01 price by construction**. Both cards were still labelled "Normalized". Re-dispatched with real measured FY2022–26 multiples → **FV $88 → $85**, MOS −15.3%. *Class: repeat of the dead-anchor family (TSEM 9 Aug, CBOE, 6M) — the class that only gets a checker (W18) on 9 Sep.*
4. Two workers wrote Gregorian years where Buddhist years were required; the controller injected the year rule into the remaining prompts.
5. **EQR raised for an owner decision** — EQR is the surviving entity renamed to Vivmark (VMRK), shares continue 1:1, so it is technically a rename, but the business doubled to $71B and the existing report describes a company that no longer exists. It would enter the queue the next day regardless. Deliberately **not** pre-loaded into `symbol-map` because the cron would then patch VMRK prices onto a report describing EQR alone.
6. **Model-default trap re-confirmed** once more (probe = Opus 5).

**(e) Fixes shipped:** 12/12 cleared, queue `[]`, corpus **907/907** error 0 (907, not 908, because AVB was deleted). 1 report deleted, 11 updated (10 FV held, EL changed twice), all 11 scenario tables recomputed by hand (the controller computed the three scenarios and shipped them in each worker's prompt). 3 memory files updated. **1 chip filed.**

**(f) Effort:** 187 turns · 1h08m · **2 re-dispatches** (EL round 2, plus the scenario-return sweep folded into every remaining prompt) · batches of 3–4.

**(g) Left open:** the EQR/VMRK decision (owner's); 74 warnings on reports outside the queue; MXL's Gregorian-year prose left alone deliberately (144 reports share that convention).

---

## 2026-08-20 (ICT) — "Add gate + healer for stale scenario returns"
`local_f9ecb120-…` → `a35d2b49-…jsonl` · spawned from the 12-item run · 10:22Z → 17:24Z = **7h02m** · **302 assistant messages** · 4 commits (`53c403c9` tooling, `3bc71e9f` corpus heal)

**(b) Request:** the chip — add a W/E code plus a healer for section-6 scenario returns, with the chip itself warning that an E-code without a healer kills the cron, and that "รวมปันผล" reports are a false-positive risk.

**(d) Findings — mostly about how hard the data actually is**

1. **Corpus staleness: 772 / 907 reports (85%)**, every one of them passing `npm test` with 0 errors. 234 distinct free-text shapes for the `ret` field.
2. **★ The chip's own suggested discriminator was wrong: "รวมปันผล" in the hint proves nothing** — `skeleton-{th,us}.html` prints that phrase in **every** report before any value exists. RGLD carries both that phrase *and* a `ปันผลรวม 3 ปี ~$6.00` row yet computes ex-dividend. **Skipping on the phrase would have exempted the very report that motivated the work.** The dividend basis had to be recovered from the numbers (all three columns share one entry price; the correct basis makes back-solved prices cluster). The two bases differ by a median **6.6pp**.
3. **The hint vote must outrank the spread vote** — integer-rounded percentages skew the back-solved price ~0.7%, enough for the *wrong* basis to cluster tighter. **KO**: the spread said "with dividends, entry $96.2"; the truth was $90.35.
4. **A third convention existed that nobody had documented**: 795 columns use CAGR for %/year, **19 use `total/N`** (APP). Preserved rather than "upgraded", because changing it is a content edit.
5. **`class="ret pos|neg"` is column styling, not a sign mirror** — the skeleton presets `neg` on Bear, and 104 of 107 sign/class mismatches are positive Bear values. Left untouched and unchecked.
6. **★ The healer's first version silently corrupted the markup** — it wrote at an offset ~22 chars early (`rm.index` is relative to the column body, `m.index` points at the column's opening tag), producing `-12.6% class="ret pos">+2.9%</div>`. **Corrupted files stop parsing, so every check went silent and W17 reported a beautiful 0 — a false clean that the tests passed.** Only reading the diff caught it. A structural guard plus tag-count assertions were added.
7. **★ The trial heal + revert bumped `updated` on 782 `reports.json` entries via `freshHash`** — the exact hazard CLAUDE.md §10 warns about (front-page reordering + broken 7-day dedup + broken staleness). Caught as an unexplained 24k-line diff and restored.
8. **The tests themselves stood on the on-disk state of the corpus** — `update-prices-test` assumed AAPL's current values and self-test assumed BBL was stale; after a heal, both failed. Rewritten to be state-independent. (This is the same fragility class that broke the cron for 3 days on 24 Aug.)
9. A self-test case written by moving only one column was correctly rejected by the AWC guard as unreadable — real staleness moves all three together.
10. Implementation drift caught by an explicit re-measure: the ported rule healed 781 vs the scratchpad's 813, explained (a deliberately stricter decisive-vote rule) rather than guessed; %/year oscillation and KO/GRMN instability chased down to rounding precision.

**(e) Shipped:** **W17** (warning, not error — "at 772/907 an E-code would have killed the daily cron on its first run") plus a matching healer inside `patchDerived()`/`--heal-derived`, with the shared knowledge in `tools/derived-values.js` so checker and writer cannot drift. Scope equality proven by construction: every W17 the checker raises, the healer clears. Corpus swept: **W17 772 → 0**, total warnings **846 → 74**, 782 files / 3,785 values, `updated` unmoved and front-page order unchanged via `build → preserve-dates → build`. Diff symmetric 3,849/3,849 lines — numbers and signs only. Tests: self-test **201/201**, update-prices-test **201/201**, verify 13/13.

**(f) Effort:** 302 turns · **7h02m** (longest single fix session in the batch) · 0 worker dispatches (done in-session) · several owner checkpoints; committed locally first and pushed only on sign-off.

**(g) Left open — explicitly:**
- **84 reports whose three columns are internally inconsistent** independent of price — the healer refuses and W17 stays silent by construction, so they are *invisible to the gate* (ADM's Bear target implies entry $64 while Base/Bull imply $76). List in `docs/quality-gate.md`'s W17 row. `ADM AFL CB CHRW CLX CVS DG DVN EOG EPD JPM KBANK MMM OTIS PTTEP SCC UNH VZ …`
- 15 unparsable `ret` shapes · 13 dividend-ambiguous.
- **The trailing prose sentence quoting %/ปี** — named in the chip's rule text but not covered, because §9 forbids the cron touching prose (W15 precedent). Needs `--heal-derived --prose`.
- W17 promotion to an E-code deferred to the owner now that the corpus is clean.

---

## Summary table

Counts are of **distinct problems recorded in that session's section above** (not of affected reports). "Gate-caught" means `npm run verify` / `npm test` flagged it; "human-caught" means the controller's own spot-check, a worker refusing, or an advisor call found it while the gate was green.

| date (ICT) | session | queue size | #problems | #new classes | gate-caught vs human-caught | fixes shipped | turns | wall-clock | open items |
|---|---|---|---|---|---|---|---|---|---|
| 09 Aug | Price-flags clearing (40 stocks) | **40** (19 mos-flip · 13 drift · 8 suspect-split) | 9 | 3 (SA 403 outage · GF quarterly-EPS trap · `update-prices` ATH-date corruption) | **0 / 9** | 41 commits, 40 stocks (~29 self-escalated to full UPDATE); memory rule "sequential only" corrected | 291 | 2h19m | 3 chips (ATH-date bug, SITM re-analysis **never fixed in this batch**; SPCX → next session) · TSEM anchoring flagged only · LITE/COHR/CPW frozen by design |
| 09 Aug | Fix SPCX valuation (child of ↑) | — | 2 (1 real, **1 false alarm**) | 0 (repeat of §0.4c + weighted-avg-shares trap) | 0 / 2 | 1 commit: FV $125 → $22.06, MOS −6.5% → −503% | 142 | 2h16m | none (ai-model/trailer convention left to owner) |
| 12 Aug | Price-flags clearing (13 stocks) | **13** | 12 | 4 (`price-flags.json` race · **MNST mixed-basis chart, sign inverted, E36 blind**· price-derived cards as a systematic class · `--help` runs a full scan) | **0 / 12** (gate passed 39/39 on an unprocessed stale report — verified deliberately) | 10 commits, 13 stocks, 4 FV changes; MNST chart rebased by hand | 228 | 53 min | 2 chips (split-aware guard → next session; **full LITE re-analysis — never done in this batch**); hand-fixed chart would be reverted by next cron |
| 12 Aug | Make update-prices split-aware (child of ↑) | — | 6 | 1 (52wk range lives in chart meta; `events` already dropped) | 0 / 6 | `detectMixedBasis()` + new `bad-chart` freeze reason; 908-symbol dry run trips only MNST | 150 | 36 min | by design MNST re-enters the just-emptied queue |
| 13 Aug | Clear Price-Flags (11 stocks) | **11** | 10 | 2 (controller **trimmed the prep table** out of a worker prompt · mixed พ.ศ./ค.ศ. calendar from workers) | 0 / 10 | 13 commits, 11 stocks, 5 self-escalated; memory gotchas added | 324 | 1h11m | **none — the only run in the batch that filed no chip** |
| 17 Aug | เคลียร์คิว price-flags (12 stocks) | **12** | 7 | 3 (**controller prompt injected weighted-avg shares as outstanding** · **`prep-stock` prints "✅ Δ EPS 0%" while both vendors are wrong** · dividend-yield staleness) | **0 / 7** | 5 commits, 12 stocks, 6 FV changes | 201 | 1h22m | 2 chips (prep-stock → next session; **corpus-wide 0.4c-bis flat-average audit** → became the mega-session's parent) |
| 17 Aug | Fix prep-stock blind spots (child of ↑) | — | 6 | 1 (**a canary pattern that also matches its own failure message = a check that cannot fail**) | 0 / 6 | block `[2b]` shares outstanding + 3rd EPS comparison + dividend reconcile; `test:prep` 21 → 50 + round-trip test | 112 | 25 min | `test:prep` still outside `verify` (pre-push doesn't guard these files) |
| 17–18 Aug | **Fix W08 blind spot → corpus warning sweep** (grandchild of 17 Aug run) | 3 + 4 raised mid-session by cron | **~21** | ~8 (W08 ×2 sub-branches · W06 structural (cron dead-band > W06 tolerance) · W07 ceiling · W01 dividend leg · W05 ignorant of §0.4c · **E21/E22 check only 2 of 5 valuation cards** · tag queue has no exit) | **0 / 21** — and the headline: **81 of the last 84 warnings were checker false positives, not bad reports** | **87 commits**; corpus warnings **652 → 0**; new **W14**; cron now syncs the MOS cell + verdict class; self-test 97 → 150 | **2,297** | **31h37m** | 44 reports citing only 2 sources; "no ที่มา line at all" still silent; 21 tag requests queued |
| 19 Aug | เคลียร์คิว price-flags (19 stocks) | **0 at start** → 19 found by dry-running the next cron (16 tagged `ai-datacenter`, one sector selloff) | 9 | 4 (**price-derived staleness named** · quote=basic vs table=diluted · **ratios page now client-rendered ⇒ §0.4b pre-fetch impossible** · `fetch-fundamentals` EPS provenance line wrong for if-converted) | **0 / 9** (6 of 19 reports stale while `npm test` was 40/40) | 19 stocks, 4 FV changes, 2 zone flips; `derivecheck.js` written mid-run; 7-item checklist injected into pending prompts | 305 | 1h29m | 2 chips (→ sessions 10 and 11) · median-multiples pre-fetch still broken |
| 19 Aug | Fix EPS derivation line (child of ↑) | — | 3 | 1 (**CAMT hit by the same trap via convertible *notes*, not preferred**) | 0 / 3 | gate-before-printing; `test:prep` 45 → 69 | 67 | 1h23m | memory note not written |
| 19 Aug | Add price-derived checks to gate (child of ↑) | — | 7 | 2 (**an E-code without a healer permanently bricks the cron** · tolerance must add half-a-printed-digit or the healer can never satisfy the checker) | n/a — this session *built* the gate | **E41 · E42 · E43 · W15 · W16** + `tools/derived-values.js` + `patchDerived()`/`--heal-derived`; 233→0, 81→0, 92→1, **544→0**, 3→0; healed 547 + 831 reports with `updated` unmoved | 222 | 2h01m | EV/Sales · ADR/ADS caps · out-of-band bases · EQIX prose case |
| 20 Aug | เคลียร์คิว price-flags (12 items) | **12** (1 `not-on-exchange` + 11 price) | 6 | 1 (**scenario returns stale on 11/11 — RGLD's Bear showed +8.7% instead of −11.3%**) | **0 / 6** (gate 43/43 green on all 11) | 5 commits; AVB deleted (merger → VMRK, confirmed 4 ways); 11 scenario tables recomputed; **EL re-dispatched after a post-push dead-anchor check** | 187 | 1h08m | 1 chip (→ next session) · EQR/VMRK decision for owner |
| 20 Aug | Add gate + healer for stale scenario returns (child of ↑) | — | 10 | 3 (**the chip's own suggested discriminator would have exempted the motivating report** · **a healer that corrupts markup produces a false clean because dead files silence every check** · trial-heal/revert bumps `freshHash` on 782 manifest rows) | n/a — built the gate | **W17** + healer; corpus 772 → 0, warnings 846 → 74; 782 files / 3,785 values healed with dates and ordering preserved; tests made state-independent | 302 | **7h02m** | **84 internally inconsistent reports invisible to W17 by construction** · 15 unparsable shapes · 13 dividend-ambiguous · the %/ปี prose sentence |

### Totals for the batch
- **6 queue runs · 7 follow-up fix sessions** (every fix session in this batch was spawned by a queue run — 01→02, 03→04, 06→07, 06→0.4c-audit→08, 09→10, 09→11, 12→13).
- **~103 distinct problems recorded · ~33 of them new classes.**
- **Gate-caught: zero published errors.** In all six queue runs `npm run verify` / `npm test` was green on the reports that were wrong. The gate did fire during three runs — ONON (03), AAOI E31 (06), COHR E30/E31 (09) — but only on **deliberately-stale intermediate states while a worker was mid-write or while `mos`/`upside` were held for the controller to recompute**. It never caught a substantive defect. Every problem in this log was found by a controller spot-check, a worker refusing an instruction, an advisor call, or a dry-run measurement.
- **Effort: ~4,830 assistant turns · ~52 h elapsed, of which roughly 34 h is active work.** (Elapsed sums the 13 session windows minus the 1h23m where sessions 10 and 11 ran concurrently; the mega-session's 31h37m window contains ~18.5 h of idle overnight gaps — 05:15Z→18:58Z on 17 Aug and 00:49Z→05:35Z on 18 Aug — so its active time is ~13 h.) The two biggest single items are the mega-session and the 7 h W17 session, i.e. **the fix sessions, not the queue clears, are where the time goes**: a bare queue clear costs ~1–2 h; its follow-ups cost 0.5–13 h each.
- **Chips filed: 10** (3 in the 40-stock run · 2 on 12 Aug · 2 on 17 Aug · 2 on 19 Aug · 1 on 20 Aug; the mega-session filed none, doing everything in-line). **7 became a session inside this window**; **3 were never actioned in this batch**: `update-prices` ATH-date corruption · SITM re-analysis · full LITE re-analysis. Also still queued at the end of the window: 21 tag-vocabulary requests, and the 84 internally inconsistent scenario reports W17 cannot see.

### The arc the batch shows
The *kind* of problem shifted mid-window, which matters for the owner's complaint:
- **Runs 1–3 (9–13 Aug) — external data and plumbing:** StockAnalysis 403 outage, Google Finance quarterly-EPS trap, Yahoo's un-adjusted split series, the `price-flags.json` read-modify-write race.
- **Runs 4–6 (17–20 Aug) — our own tooling lying to us:** the controller's prompt injecting weighted-average shares as shares outstanding, `prep-stock` printing "✅ Δ EPS 0% ตรงกัน" while both vendors were wrong, `fetch-fundamentals` printing an arithmetic provenance line that doesn't divide, the dual-class warning written backwards, and the 81-of-84 warning sweep in which the *checkers*, not the reports, were wrong.

### The single most repeated class
**"A value derived from the price is stale while the gate is green."** It appears in **every** queue run from 12 Aug on, in a different disguise each time: metric cards (03 — SE market cap off 33%, VRTX's whole grid) → prose and disclosure footers (05) → dividend yield (06) → `stock-meta.pe` and analyst-target percentages (09 — 6 of 19 reports) → 3-year scenario returns (12 — **11 of 11**). The structural cause is constant: the cron moves the price every morning and nothing moved the values derived from it. It was only closed in stages on 19–20 Aug (**E41 · E42 · E43 · W15 · W16 · W17**), and even then W17 covers 795 of 907 reports, with 84 left invisible by construction.
