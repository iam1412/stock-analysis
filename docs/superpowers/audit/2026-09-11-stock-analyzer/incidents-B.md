# Incident log B — price-flags queue runs & follow-up fix sessions, 23 Aug – 11 Sep 2026

## How the transcripts were located (all 10 found, none missing)

The session IDs supplied in the task are **FleetView session IDs**, not transcript filenames. The mapping lives in
`~/Library/Application Support/Claude/claude-code-sessions/526579be-.../eb2bcade-.../local_<fleetview-id>.json`
→ field `cliSessionId` + `cwd` → `~/.claude/projects/<encoded-cwd>/<cliSessionId>.jsonl`.

| # | FleetView id | transcript file | worktree cwd |
|---|---|---|---|
| S01 | 2b1d3d51… | `60949722-fedf-4547-bce0-df8c92340c34.jsonl` | clear-queue-price-flags-0dcc06 |
| S02 | e3df6f4c… | `b51ee4be-41a7-40fe-8957-55ac6a36210f.jsonl` | mystifying-wilbur-33805f |
| S03 | 1da6e785… | `26cde188-a5ea-4323-8d0e-1f66724bd58c.jsonl` | mystifying-wilbur-33805f |
| S04 | 23b23c91… | `f545d765-d430-4841-83f2-52e4c18b750a.jsonl` | project-domain-name-027118 |
| S05 | 5db550ce… | `d8b0478c-ec0b-40fa-a73b-e9e7b1cd6218.jsonl` | mystifying-wilbur-33805f |
| S06 | 4e5c743e… | `217a6d9c-62c3-4f07-8860-a3117ec75b2d.jsonl` | project-domain-name-027118 |
| S07 | f6a0e498… | `d504f77c-a6fc-4e39-833d-91820f53cea4.jsonl` | project-domain-name-027118 |
| S08 | 269cb064… | `23bdce3f-1dfc-4323-bf63-90a5a293584d.jsonl` | mystifying-wilbur-33805f |
| S09 | 4f12ecc0… | `443dcd88-dc8c-46cc-9e0d-c455a97d7b77.jsonl` | project-domain-name-027118 |
| S10 | 2c0b4021… | `cb9b93f4-46d0-4a01-b5cf-3226b8f73737.jsonl` | clear-queue-price-flags-0dcc06 |

Transcript timestamps are UTC; Bangkok = UTC+7. Git commit times quoted below are local (Bangkok).
Subagent (worker) reports were recovered from the `tool_result` of every `Workflow`/`Agent`/`advisor` call, so no separate subagent files needed opening.

**Attribution convention used here.** *Gate-caught* = an E/W code that **already existed before the session began** fired. *Human-caught* = controller spot-check, worker self-report, advisor, or the owner. A W-code created *during* a session counts as human-caught in that session (W17/W18/W19/W20 all originate inside this window).

---

## 2026-08-23 — "เคลียร์คิว price-flags" (5 items) — S01

**(a)** 23 Aug, UTC 00:43 → 02:13 for the work itself (07:43–09:13 Bangkok); session then idles ~15 h until the owner's follow-up at 17:03 UTC. Controller = Opus 5.

**(b) User requests (verbatim):**
1. `เคลียร์คิว price-flags`
2. (AskUserQuestion answer) chose **"Rename เป็น VMRK + วิเคราะห์ใหม่เต็มใบ"** for the EQR/AVB merger
3. `ไม่ได้อีพเดต Issue หรอ?`

**(c) Queue at start:** 5 entries — CBOE, CPW, SAPPE, MRVL (`mos-sign-flip`) + EQR (`not-on-exchange`). Triage upgraded CBOE/CPW/SAPPE to full UPDATE on the controller's own EPS screen (CBOE +9.6 %, CPW +16.7 %, SAPPE −7.5 %); MRVL stayed LIGHT (0.3 %).

**(d) Problems discovered — 8**

1. **VMRK / EQR — vendor EPS is an entity mismatch.** advisor (via courier) closed it arithmetically: `1,025M ÷ 774.94M = 1.3227 ≈ 1.32` exactly, so Yahoo's `epsTTM 1.32` is *EQR-only earnings ÷ combined-company shares*. Both 1.32 and 2.61 are unusable ⇒ **no P/E leg at all**, `pe=null`, `roe=null`; FV rebuilt on P/FFO + DDM + NAV. Also: feed dividend `$2.55` was stale (real $2.81, confirmed from the merger 8-K / EQR Q2 $0.7025×4). *Human-caught (advisor). Repeat of the documented class "6O entity mismatch", first live use.*
2. **CBOE — dead anchor.** The worker's leg 2 "Forward P/E" derived EPS as `price $300.74 ÷ vendor fwdPE 20.76x` then multiplied by 21x ⇒ `price × (21/20.76)`, landing 1.2 % from spot. Controller deleted the leg itself: FV $309.50→$307.20, MOS +2.8 %→+2.1 %. *Human-caught (controller spot-check of the valuation cards; `npm test` was 43/43 clean). This is the same class that later became W18 — **17 days before it was detected as a class**.*
3. **CPW — fabricated revenue.** Report said "~฿2,900 million"; the truth is **฿11,094 million** (nearly 4× out). *Worker-caught.*
4. **CPW — EPS base was `price ÷ P/E (SET Factsheet)` = ฿0.24**, not a figure from the financials. Rebased to NI ฿167M ÷ 600M shares = ฿0.28 and propagated through P/E / FV / scenario / prose. *Worker-caught.*
5. **CPW & SAPPE — "P/E เฉลี่ย ~5 ปี" cards asserting history that does not exist** (trap 6N, the GABLE class). CPW had one real year; SAPPE's card said "~18–20x" while the report's own numbers refute it (52wk high ฿41.75 ÷ FY2024 EPS ฿4.07 ≈ 10x). Both replaced with ranges derivable from real prices. *Worker-caught, repeat of a known class, two fresh instances.*
6. **SAPPE — analyst target frozen at ฿31.66 (Sell 4/7)**; current was ฿35.44 (n=8, Buy), stale in 4 places. **MRVL** likewise had the old price `$235.81` in 12 prose spots and a year-return badge saying +275 % while the header said +182 %. *Human/worker-caught, repeat of the price-derived-staleness class.*
7. **Model pin did not take.** `model:"sonnet"` was verifiably sent (`meta.json` records `{"model":"sonnet"}`) and an unpinned probe returned **Opus 5**, yet every worker transcript is `claude-opus-5` for all 30 turns. Whole queue ran on Opus. Logged to memory as "rule 10" rather than into CLAUDE.md, since it looked like per-session harness behaviour. *(It was later disproved — see S04.)*
8. **GitHub issue #15 left open.** The owner had to ask. `update-prices.yml` closes the issue only on the next cron run; a hand-cleared queue leaves it open with a stale body. Controller closed it manually with a full summary table. *Owner-caught.*

**(e) Fixes shipped:** `9d230be5` CBOE · `376779ca` CPW · `7a23f5d5` SAPPE · `e45de992` MRVL · `7e49008c` EQR→VMRK rename + full rewrite (git mv + `tag-apply --rename`, deliberately **no** `symbol-map` entry, contradicting the advisor but following that file's own README) + brand colour pre-assigned `#b42ddc` to avoid a clash. Queue → `[]`. Memory rule 10 added.

**(f) Effort:** 136 assistant messages · 1.5 h active (16.4 h span incl. the idle gap) · 9 dispatches (1 skill, 2 model probes, 1 advisor courier, 5 workers) · **0 round-2 re-dispatches** (the CBOE defect was fixed by the controller in-line and the lesson injected into the next worker's prompt, after which CPW/SAPPE did not repeat it).

**(g) Left open:** MRVL's FV $238 rests on non-GAAP forward EPS ~$3.3 while vendors now imply $4.6–6.25 — untouchable under UPDATE-LIGHT rules, deferred to the post-27-Aug earnings round. SAPPE (25 Aug) and MRVL (27 Aug) both expected back in the queue within days. `/EQR.html` URL now 404s by design.

---

## 2026-08-24 — "Price-refresh เวอร์ชั่นบอท" — cron failed 3 days running — S02

**(a)** 24 Aug, UTC 02:09–02:34 (09:09–09:34 Bangkok). Opus 5. *Not a queue run — a cron-failure investigation.*

**(b) User requests:** `ตรวจสอบ price-refresh มีปัญหาเวอร์ชั่นที่อัพเดตด้วยบอท` → then `push เลย`.

**(c) Queue:** n/a. Failure state: cron runs on **22, 23 and 24 Aug all red**, 21 Aug green, always at `npm run verify` → `self-test 200/201`.

**(d) Problems discovered — 3**

1. **The owner's hypothesis was wrong and had to be disproved.** It was not the dependabot version bump: the first failure was 22 Aug 01:52 UTC while PR #16 (wrangler 4.122→4.124) merged 23 Aug 17:02. **The "bot" that broke it was the price cron itself.**
2. **Root cause — a self-test fixture bolted to a live price.** `test/self-test.js` uses `reports/BBL.html`, which the cron re-prices daily. One W17 case asserted "drift **0.5 %** ⇒ checker must stay silent", but the real checker/healer threshold is **absolute** (half of the last displayed digit — BBL's entry-point label is an integer, so 0.5 baht ≈ 0.26 %). Whether 0.5 % crosses the rounding edge therefore depends purely on that day's price decimals. When cron moved BBL 190.5 → 190 on 22 Aug the case flipped red and blocked the whole gate. Measured: sweeping ฿186–196 in 0.5-baht steps, the case is silent in only **4 of 21 points** — it had been passing by luck. *Human-caught (the gate blocked itself, i.e. the failure was visible but the cause was not). NEW class: "fixture stands on live disk state".* `check-reports.js` / `derived-values.js` were correct and untouched.
3. **Two pre-existing issues found on the way, deliberately not fixed:** (i) BBL's summary cell reads `MOS ~ +2.1% (เกือบเต็มมูลค่า)` — carrying both a `+` and the word "full value" it trips `update-prices.js`'s "ambiguous direction → don't guess" rule, so **that cell has never once been patched by cron**, and W06 accumulates whenever the price leaves ~฿185–197; other reports likely word it the same way. (ii) At ~฿150 (−21 %) the E36 "ทรงตัว" anchor stops matching — reachable only through multi-day cumulative drift, since the freeze compares to yesterday, not cumulatively.

**(e) Fixes shipped:** `1d837377` — one file, `test/self-test.js`. Swept out every BBL-price-bound literal (the file's own header rule 3 forbids them): the half-digit case became the direct invariant *"the checker only complains about what the healer can reach"*, `at(196.30)`→`at(PX*1.035)`, `'-3.3'`→`cagr3(bearDiv)−0.9`, entry label `'250'`→ last digit +1, RGLD's `at(130)` → opposite side of (Bear target + dividend), hard-coded 150/27 → read from the live report, and `reject()` gained a forced-base parameter for two W06 cases. **Proof:** simulated cron across ฿160–250 (15 points) → 201/201 at every point (before: 1–3 failures at ฿165/178/190/193/196/200/215).

**(f) Effort:** 109 assistant messages · 0.4 h · 0 dispatches.

**(g) Left open:** the two items in (3) above — both later resurfaced (the ฿150 E36 case became S06's assignment).

---

## 2026-08-24 — "กฏการปรึกษา Advisor สำหรับงานยาก" — S03

**(a)** 24 Aug, UTC 02:54–03:00. Fable 5. *Not a queue run — a policy change, but it is the direct consequence of the preceding days' incidents.*

**(b) User requests:** `เพิ่มกฏของโปรเจ็ค ต้องปรึกษา Advisor ก่อนปฏิบัติการงานยากทุกครั้ง` → `merge PR #17 เลย`.

**(c)** n/a.

**(d) Problems discovered:** none new. The session encodes the lesson of S01/S02 into policy.

**(e) Fixes shipped:** `2036e6ef` / PR #17 (merged `b97c7b84`) — CLAUDE.md §7 first bullet: *"งานยากต้องปรึกษา advisor ก่อนลงมือทุกครั้ง"*, with "hard work" defined by example plus a catch-all (hard stock per §3.2 · structural change to build.js / gate / cron / template / CLAUDE.md · ambiguous publish/skip · any never-done approach), keeping the existing mechanics: controller calls `advisor` directly, worker/subagent **only via courier**, advisor unavailable → stop and ask the user. Criteria are referenced from §3.2 rather than copied, to prevent rule drift. Routed as a PR rather than auto-push because CLAUDE.md is structural.

**(f) Effort:** 25 assistant messages · 0.1 h · 0 dispatches.

**(g) Left open:** nothing. *(Note: the "worker cannot call advisor directly" claim written into the docs here was proved false on 9 Sep — see S08 problem 18.)*

---

## 2026-08-29 — "เคลียร์คิว price-flags" (20 stocks) — S04

**(a)** 29 Aug, UTC 11:37–12:30 (18:37–19:30 Bangkok). Controller Opus 5; workers Sonnet 5 (4 on Opus).

**(b) User requests:** `เคลียร์คิว price-flags` (single prompt) + one AskUserQuestion answer choosing **"ใช้ analyze-wave ตาม CLAUDE.md §3"**.

**(c) Queue at start:** 20 entries → 13 UPDATE-LIGHT (AEHR CDW CHRW DPZ EBAY EIX ETN KLAC MTI NOW ONTO SFLEX TSEM) + 7 full (CRM CRWD DY VEEV IVL new results · IESC 2:1 split · THREL a genuine +30 % run). 18 prices pre-patched in one process; `prep-stock --update` exit 0 on all 18, no >5 % source conflicts. *Per-stock `reason` values are not itemized in the controller's prose; only IESC and THREL survived the pre-patch, which is the `suspect-split-or-data` behaviour, so the split is ~18 drift/`mos-sign-flip` + 2 `suspect-split-or-data`.*

**(d) Problems discovered — 7**

1. **A session-level harness rule blocked the documented workflow.** The system prompt carried an injected line — *"Do not call the AgentTool unless the user requested it. Do not use workflows or deep-research unless the user requested it."* — which is neither in CLAUDE.md nor from the owner. The controller **stopped and asked** rather than guessing, costing a round-trip before any work started. *Human-caught, NEW (harness-vs-repo conflict).*
2. **Memory rule 10 from S01 was wrong.** A fresh probe returned **Sonnet 5** as pinned, and the first three worker transcripts were `claude-sonnet-5`; the 4 stocks pinned to opus stamped `Claude Opus 5`. So S01's "pin doesn't stick" was a one-session artefact. Rule 10 deleted from `model-config-rules.md` and `MEMORY.md`. *Human-caught, correction of a previous session's wrong conclusion.*
3. **THREL — dividend suspended since May 2024, but the file still carried `dividendYield: 8.43`, and the DDM leg built on it was the whole basis of FV ฿1.10.** Caught by the controller *before* dispatch and written into the worker prompt. FV ฿1.10→฿1.19, verdict flipped to expensive. *Human-caught, NEW instance of "vendor/derived field never revisited".*
4. **IESC split rebase.** Confirmed 2:1 from SEC 8-K + IR (approved 29 Jul, record 14 Aug, effective after close 21 Aug); EPS TTM 11.26 is exactly half the 22.51 in the report ⇒ pure rebase, no new results. FV $571.26→$285.63, MOS +45.8 %→−8.5 %. Chart verified single-basis (all 12 points inside the 52wk range). *Gate did not catch; controller confirmed from primary source.*
5. **THREL was *not* a split** — no corporate action, mcap 837M ÷ 620M shares = ฿1.35 exactly, inside the 52wk 0.93–1.51 ⇒ a real move. (Correct negative diagnosis; worth noting because a wrong call here would have halved every per-share number.)
6. **CRM — worker invented a market-anchor leg.** It added `Analyst Intrinsic` = analyst target × 0.95, which is a price anchor, not a valuation method. Controller removed it to "context": FV $254 → $260. *Human-caught, NEW instance of the dead-anchor family (2nd sighting after CBOE).*
7. **CRWD — multiplier measured over a 12-month window on a stock that ran +78 % in that window.** Worker used "12-month median P/FCF 100x". Controller replaced it with per-fiscal-year medians read off the real ratios page (83.36x / 22.31x): FV $127.45 → $115.29. *Human-caught, NEW instance — and the controller explicitly names the root cause: it had **not** pre-fetched median multiples for CRWD.*

**(e) Fixes shipped:** 17 per-stock commits + 1 chore, `0a7fa3ce` … `5a6fdd9d`. FV moves: IESC $571.26→$285.63 · CRWD $152.50→$115.29 · IVL ฿23→฿23.8 · THREL ฿1.10→฿1.19 · CRM $185→$260 · DY $345.88→$302.93 · VEEV $250→$273. Queue → `[]`, all 43/43. Final spot-check across all 13 LIGHT reports: no stale prices, every Market Cap card = shares × new price within rounding.

**(f) Effort:** 168 assistant messages · 0.9 h · 22 dispatches (1 skill, 1 probe, 20 workers). **0 round-2 re-dispatches** — the CRM and CRWD defects were repaired by the controller directly. Parallelism ramped 3 → 6 → 8 → 12 concurrent, no rate limit.

**(g) Left open — an explicit proposal the owner never answered:** amend `CLAUDE.md §8` ชั้น 0 so that **(1)** analyst targets and multiples measured over a ≤12-month price window may never be an FV leg (context only), and **(2)** the controller must pre-fetch median multiples for **every report whose FV will change**, not only cyclicals. *Both of these are precisely the rules whose absence caused the ODFL/EXPE blow-up 11 days later in S08.*

---

## 2026-09-02 — "price-refresh #54 failure" — S05

**(a)** 2 Sep, UTC 04:58–05:27 (11:58–12:27 Bangkok). Opus 5. *Not a queue run — cron failure #2.*

**(b) User requests:** `ตรวจสอบ price-refresh #54` (pasted GitHub Actions failure) → later merge.

**(c)** n/a. State: cron run #54 red at `npm run verify` → `update-prices-test`.

**(d) Problems discovered — 2**

1. **Real bug in `scenarioPlan`, masked by a CI-ordering effect.** The same test at the same commit passes locally 201/201 because **CI runs `update-prices.js --write` *before* verify** — so the fixture the test sees is `reports/AAPL.html` freshly patched with that day's price (316.85 → **325.13**). *Human-caught. NEW class: "CI mutates the fixture before the gate runs" — a sibling of S02's class but a different mechanism.*
2. **The bug itself:** `scenarioPlan` picked the %/yr formula (CAGR vs `total/N`) **per column**, choosing "whichever is closer to the displayed value", with a comment claiming this was stable. It is stable only at full precision. At AAPL @325.13 the Bull column's total +28 % gives CAGR 8.58 / linear 9.33 — **both round to "9 %"** ⇒ the next pass reads `(28, 9)`, picks linear, and writes `+13 %/yr` over `+11 %/yr`. Sweeping the range: **114 of 301 prices between $250–400 flip this way ≈ ~38 % chance of cron failing on any given day.** Not a fluke.

**(e) Fixes shipped:** `34b20802` / PR #21 (merged `c53fe03b`) — the formula is now a property of **the whole report**: a column where both formulas round identically is indistinguishable and **gets no vote**; the remaining votes are weighted by decisiveness `|dC − dL|` (linear must win by ≥2×, else CAGR per the 795/814 corpus prior). Weighting rather than vote-counting was required because WHAUP is genuinely linear yet its Base column is near-tied, while LYB votes 2L/1C yet its Bull column points to CAGR by 3.6 points. Proof: replayed run #54's exact state (@325.13) → 202/202; full price sweep → 0 flips; verify 13/13.

**Corpus impact disclosed before merge:** next cron will repair section 6 in **46/908 reports** (was 3) then be idempotent; W17 rises 3 → 20 reports (ACMR ADBE ADSK ANET ASX CAMT FTNT IPGP LPLA LSCC LYB MCHP MSFT NOW NVO PLXS PYPL STM TEL ZS), all within the healer's reach; error stays 0. Minority columns in mixed-formula reports get converted to the report's formula (e.g. IPGP base +21 % → +18 %) — which the old docs would have called "editing content".

**(f) Effort:** 122 assistant messages · 0.5 h · 1 dispatch (a `spawn_task` chip for the E36 follow-up → became S06). An advisor review mid-session **caught that the controller's own new self-test case was price-dependent on BBL** — i.e. the fix was about to reintroduce the S02 bug — and it was rewritten before commit.

**(g) Left open:** the E36 ฿150 fragility, deliberately spun out as a separate task (chip `task_b96db701`).

---

## 2026-09-02 — "Fix price-fragile E36 case in self-test.js" — S06

**(a)** 2 Sep, UTC 05:24–06:20 (12:24–13:20 Bangkok). Opus 5. *Not a queue run — the S05 spin-off, which then grew twice.*

**(b) User requests:** the spawn_task brief (repro + "fix, prove at ฿150/170/190/215/250, don't push to main") → `fix the E34 case the same way` → `squash both commits into one` → `push it` → `open a PR` → `fix the W17 bug too` → `merge it`.

**(c)** n/a.

**(d) Problems discovered — 6**

1. **E36 ฿150: not a broken anchor — a literal collision.** `tools/update-prices.js:465` hard-codes the suffix `(รอบปี)` and `annualChg` emits `≈ ทรงตัว ${suffix}` whenever `|% รอบปี| < 0.75`. The reject case sets exactly that string, so at ฿150 `setChg` rewrites the label to what it already said ⇒ `mutated === src` ⇒ the "mutation changed nothing" guard fires. **The guard was right to be suspicious and wrong about the reason** — it reported a broken anchor while the checker was healthy. *Human-caught, NEW mechanism inside a known class.*
2. **E34 was only *accidentally* immune.** The controller first judged E34 safe because cron writes `(รอบปี)` and never `ในรอบปี`. The **owner pushed back** (`fix the E34 case the same way`); the rewrite proved the owner right — with the realistic string, and with only the forced base removed, ฿150 reproduces the original bug exactly. *Owner-caught. This is one of only two places in the window where the owner overrode the agent's technical judgment and was right.*
3. **A pre-existing W17 bug on `main`, inside the very commit that was fixing price-fragile fixtures** (`34b20802`, shipped hours earlier in S05). At ฿250 BBL's Base scenario returns exactly `−0 %`, so CAGR = linear, `Math.sign(0) = 0` wipes the offset, the flip writes the original value back, and `halfQ` drops the column from voting. The checker is correctly silent; the fixture demands it fire. Its `flipped !== fresh` guard misses this because the strings differ only in **formatting** (`+0.0`) while the meaning is unchanged — *it compares bytes, not semantics.* *Human-caught while rebasing, NEW class: "byte-level mutation guard passes a semantic no-op".*
4. **Five-point proof sweeps are not enough.** The W17 fix needed ฿150–300 in ฿2 steps (76 points); the controller's own intermediate attempts failed in the ฿210–214 and ฿278–280 bands, which five points would have missed. First attempt: 15 failures. Second: all 76 failing (a leftover reference to the old `dec` in the heal message). Third: 2 failures from an over-strict precondition. *Self-caught by the new guard — which is the behaviour the change was meant to produce.*
5. **The fixed 0.9pp offset assumed Δ < 1.8**; the sweep proved Δ reaches **3.6 at ฿150–170**. Replaced by placing the value 1.0pp past linear, so `dC − dL = Δ` holds exactly regardless of rounding.
6. **PR #22 was merged by someone else mid-session**, so the W17 commit landed on a branch whose PR was already closed; the controller had also briefly overwritten #22's merged body with text describing W17. Both corrected, W17 split into PR #23. Also noted: `main` moved twice during the session (a price refresh, then the merge).

**(e) Fixes shipped:** `f106f126` / PR #22 (merged `b7590626`) — E34/E36 both derive their base from the file (the existing `w06Base` "force the zone yourself" idiom) instead of betting on BBL's price; E34's base forces **both** label direction and theme colour because E34 also reads `report-data.theme`. `e5c17884` / PR #23 (merged `a32391de`) — W17 picks the flip column from the data (**second**-largest Δ, keeping the largest as the CAGR witness, or the flipped column hijacks `PY_VOTE_RATIO`), overshoots linear by 1.0pp, and **guards the quantity, not the bytes**. Both PRs touch only `test/self-test.js`; `check-reports.js` and `derived-values.js` were never modified — all three were fixture bugs. Two new fixture rules added to the file header: rule 2 (*apply changed no bytes*) and its new twin (*bytes changed but the checker-visible quantity did not*). Self-test 201/201 → 205/205.

**(f) Effort:** 201 assistant messages · 0.9 h · 0 dispatches · **3 successive scope expansions by the owner** (E36 → E34 → W17), each a separate implement-prove-commit cycle; plus 3 failed implementation attempts inside the W17 fix.

**(g) Left open:** the controller flags that the guard still cannot distinguish "anchor broke" from "literal collided" by itself — the header rule is the only thing preventing the next instance, so any new `reject` case touching a cron-written field needs a human to read that rule.

---

## 2026-09-03 — "Re-analytic full SPCX" — S07

**(a)** 3 Sep, UTC 10:58–11:10 (17:58–18:10 Bangkok). Fable 5.1. *Not a queue run — a single owner-requested re-analysis.*

**(b) User requests:** `re-analytic (full) SPCX`.

**(c)** n/a (1 stock; report 23 days old, MOS −51 %, `pe=null` pre-profit/IPO case).

**(d) Problems discovered — 3**

1. **EPS cross-source conflict** — Yahoo −1.08 vs StockAnalysis −2.27 (matching the table). Diagnosed as the known share-denominator artefact from the IPO preferred conversion, with no new filing since the 4 Aug 10-Q. Neither FV leg uses TTM EPS, so it was **disclosed in the report rather than treated as a blocker**. *Repeat of a known class; correctly triaged, not a new incident.*
2. **A corporate action had landed since the last analysis** — the Cursor deal closed 14 Aug as an all-stock merger (SEC 8-K, 391M Class A shares issued). Share count 13,182M → 13,573M, which matches StockAnalysis' all-class figure exactly; the stale "not yet net of Cursor" caveat was removed. FY2027E revenue +13 % but EPS **down** ($1.85→$1.60) on the larger base.
3. **Comp multiple drift** — CoreWeave's EV/Sales 13.0x → 11.95x, so the AI leg moved to ~12x. FV $93.00 → $96.30, MOS −51.3 % → −46.1 %.

**(e) Fixes shipped:** `a66516b6`, 37 edits in one file; prose sweep covered the section-2 chart text, run-rate catalyst, Starship bullet and lock-up risk. `npm test -- SPCX` 43/43, verify 13/13.

**(f) Effort:** 47 assistant messages · 0.2 h · 1 skill dispatch; advisor consulted twice (before editing and before closing).

**(g) Left open — self-declared:** the lock-up tranche figures came from two aggregator blogs found via search while the disclaimer credits mainstream outlets. No number or verdict depends on them; the airtight source is the IPO prospectus lock-up section.

---

## 2026-09-09 → 09-10 — "เคลียร์คิว price-flags" (27 stocks) + W18 dead-anchor sweep (26 reports) — S08

**(a)** 9 Sep 18:49 → 10 Sep 04:06 Bangkok (UTC 11:49 → 21:06). Controller Opus 5; workers Sonnet 5, Opus 5 for APH/ALNY/AU/BRK-B/VRANDA. **The largest session in the window by an order of magnitude.**

**(b) User requests (4):**
1. `เคลียร์คิว price-flags`
2. `แก้ไขทั้งหมดเลย` (after the controller proposed 2 structural follow-ups)
3. `กวาด W18 ทั้ง 26 ใบเลย` — **overriding the controller's own recommendation not to sweep**
4. `ปิดงานได้` … then `ทำไมผมยังเห็น Issue เปิดอยู่ ไม่มีการอัพเดต`

**(c) Queue at start:** 27 → 11 UPDATE-LIGHT (AEHR FICO GLW GRAB INTC IT KLAC LRCX SE TRU TSEM) · 15 full · 1 split-rebase (APH, SEC 8-K 2-for-1 distributed 2 Sep). 26 prices pre-patched in one process (`3428cf2b`), leaving the queue technically at 1 — *"the flag disappearing is a side effect of the price patch, not the job being done."*

**(d) Problems discovered — 30**

*Triage layer:*
1. **`reports.json.updated` cannot decide freshness.** 13 reports share a millisecond-identical bulk-`freshHash` timestamp. DASH (analysed 6 Jul < results 5 Aug), IP (25 Jul) and ROP were wrongly bucketed LIGHT. Fix: read the footer date. *Human-caught, NEW.*
2. **The `price ÷ PE` proxy for EPS screening is unusable** (multi-basis P/E, ADR ratios) — every report's own stated EPS had to be read. *Human-caught, repeat.*

*Price-derived staleness the gate cannot see — every one passed `npm test` 43/43, 0 error, 0 warning both before and after:*
3. **GRAB** `stock-meta.pe` still 33.3 from the old $3.66; correct 29.5 at $3.25. *This is what triggered building `spotcheck.js`.*
4. **AEHR** analyst target `$115.00, n=3` vs current `$130.00, n=4` (13 % off, 8 places) **and it is a 20 %-weight FV leg** ⇒ FV 86→89, forcing round 2. *NEW sub-class: a stale vendor snapshot that is load-bearing.*
5. **FICO** Market Cap on a 43 %-wrong share base (12.3M for 21.6M) ⇒ ~$11.5B vs correct ~$20.16B.
6. **INTC** section-6 prose %/yr contradicts the table in the same section.
7. **KLAC** ROE written ~95 % while table [3] gives 87.5 %.
8. **TSEM** "ส่วนต่างจากราคา" shows `MOS ~ +3.2%` **in green** while the stock is above FV — cron patches the verdict box `class` but cannot touch the word or colour in that cell. *NEW cron blind spot.*
9. **OKJ** `stock-meta.roe` still `+4.1` on a loss-maker — the `=null` rule had only ever been applied to `pe`. *NEW.*

*Numbers that were simply wrong from a previous analysis — 5 reports:*
10. **BGC** "normalized EPS = FY2024–25 average = ฿0.40" when the real value is ฿0.25; net debt stated ฿4.2B, actual ฿9.0B ⇒ FV ฿6.80→฿4.48.
11. **UMC** ADR/ordinary confusion (1 ADR = 5 shares, table [3] in NT$) ⇒ P/E 33.6x→20.8x, Market Cap off by $12B. Worker additionally flagged TTM net margin 17.6→33.3 % while operating margin barely moved ⇒ non-operating income inflating EPS.
12. **EXPE** card "EPS TTM (GAAP) $11.36" 41 % stale (cut before the 5 Aug results); prose stuck at $294.10 while the patched price was $274.55, with cheap/expensive inverted throughout.
13. **ROP** "EPS (TTM) $15.98" vs vendor $23.77 (49 % apart) — TTM contains a one-off (net margin 30.2 % vs normal 19–22 %, same shape as the FY2022 divestiture year).
14. **GWRE** vendor EPS conflict resolved three ways ($1.63 = NI $139.3M ÷ 85.4M shares), replacing a crude Q3×4 proxy.

*The headline NEW class — dead anchor (สมอตายวนกลับ):*
15. **ODFL.** FV leg 1 set "P/E target ~36x" with `mdesc` saying *"ใกล้เคียง P/E ปัจจุบัน"*; current P/E is exactly 36.0x, so the leg returned $187.20 against a $187.01 spot — **0.1 % apart by construction**, unable to say cheap or expensive. Gate passed 43/43. Round 2 with the measured 5-yr median (32x) moved FV $197→$184. **Root cause stated by the controller: it had skipped the CLAUDE.md §8 ชั้น 0.4b duty to pre-fetch historical median multiples — the exact fix S04 had proposed 11 days earlier and never received an answer on.**
16. **EXPE.** Two of three legs described as "current + small premium" (18x vs current 17.1x; P/S 2.2x vs 2.10x) ⇒ rejected; round 2 used measured medians 20.4x / 1.61x, FV 287.48→274.63. E26 was also genuinely red (gauge scale order), which `--force` cannot fix.
17. **DASH.** Softer form (multiples ~6 % above spot); round 2 cited real peer data (UBER ~16x, CART ~10x from 8-Ks) and its own FY2024 6.01x / FY2025 6.98x.

*Process-rule violations and harness surprises:*
18. **The DASH worker called `advisor` directly**, violating §7 (courier only) — and **succeeded**, proving the documented claim that a direct call is "unavailable เสมอ" was factually false. Its output was good (pulled the 8-K and found vendor FCF 21 % off the company's own reconciliation). *NEW: doc contradicts reality.*
19. **The US market opened mid-wave** (20:37 Bangkok = 09:37 EDT). `--force` bypasses the `isIntradayQuote` guard by design, so PATH ($14.01→$13.96) and EXPE ($274.55→$262.51, 4.4 %) took intraday quotes while the other 25 kept the 8 Sep close. *NEW operational hazard.*
20. **GitHub issue #20 stayed open** after the queue hit 0 — written and closed only by the cron workflow, next run 07:17. Same surprise as S01, and the owner had to ask again. *Owner-caught, repeat.*

*The controller's own tools fed bad data to workers (second half — the W18 sweep):*
21. **`median-multiples.js` printed `★ มัธยฐาน 47.1x` for AU** while the range contained a 2,074x outlier (a year with EPS ฿0.01). Workers take the starred line and skip the warning below. Fixed to *exclude* extremes and print no starred line when inconclusive (`d4d67d8f`). Knock-on: BALL 24.5→27.7x, EBAY 11.3→14.0x, DD and VRANDA reclassified "unusable".
22. **`median-multiples.js` mixed currencies on CP (CPKC)** — NYSE price in USD ÷ CAD financials ⇒ 18.3x instead of the correct CAD-basis 24.7x (≈1.4× off, **exactly the trap CLAUDE.md §8 0.4b warns about**). The worker had already cut CP's FV $83.45→$76.11 on the wrong number ⇒ **revert + redo**. Guard added (`2ca3c777`). Caught not by the gate but by an **internal contradiction in the report**: the leg the controller had told the worker not to touch cited "5-yr range 16–27x", which disagreed with the 16.7–20.3x just measured.
23. **"Don't touch other legs" produced self-contradicting reports.** Once one leg moved to a measured median, guessed historical multiples elsewhere in the same file conflicted. **HIG**: the card said "P/E avg ~5y ~12x (9–16x)" while the measured median is 9.6x (9.2–12.8x), and the *Catalysts* bullet claimed "current 11.09x is still **below** the 5-yr average" — the truth is it is **above** the median, so a positive factor had to be moved to Risks. A "sweep the whole file for contradictions" step was added to all 26 prompts mid-sweep.
24. **ICLR round 1 rejected.** The worker multiplied *peer forward* P/E (IQV 18.3x, CRL 22.3x) by ICLR's own *TTM* EPS while the company guides revenue to **shrink**, inflating FV until MOS flipped −2.6 % → +4.1 %. File reverted, re-dispatched. Round 2 then surfaced that **FCF in the report was stale at $709M vs the real $1,030M**, pushing FV above the Wall-Street consensus target for the first time (a disclosure paragraph was added rather than calibrating to consensus).
25. **AKAM** — worker restructured legs beyond the brief (justifiably: forward EPS $7.17 is non-GAAP, 2.6× GAAP TTM $2.76, so it cannot be multiplied by a GAAP-based median) **but wrote its process narrative into `mdesc`**, which readers see. Controller rewrote it.
26. **FERG** — the "current P/E 24.3x" quoted throughout was computed from the *old* price $256.69 (real price $226.30 ⇒ 21.4x). **Even the "current multiple" used to justify a dead anchor was itself stale.** *Worker-caught, NEW sub-class.*
27. **WWD violates 0.4c-bis and W05 cannot see it.** Legs 1 (P/E TTM) and 2 (P/E NTM) used the **same 28.7x**, then all three legs were averaged flat, giving one multiple-set 2:1 weight. W05's family classifier knows only the (r,g) family. Controller recomputed FV $294.68→$300.96 by hand. *NEW gate gap.*
28. **ICLR's gauge marker label "เหมาะสม" left at the old FV $154.36** while the scale had moved to the $201.84 basis — **no gate check covers the marker label** (E30 compares only `stock-meta` vs the verdict box). *NEW gate gap.*
29. **VRANDA could not be fixed by changing a multiple at all.** The report (5 Jul) used TTM through Q1/2569 (EPS ฿0.42); Q2 results released in August make the real TTM EPS **฿0.15** (P/E 10.62x→29.7x, ROE 7.0→2.9 %, net debt ฿2,892M→฿3,338M). The worker **stopped and reported back instead of guessing**; escalated to a full UPDATE. In round 2 it also **corrected a wrong causal assumption in the controller's own brief** — the profit fall was not "higher interest + low season" (interest expense moved only ฿150M→฿155M); the real cause was an abnormal ฿65.1M interest income in FY2568 disappearing plus −฿56.2M other-non-operating, while EBIT actually grew 24 %. It further found StockAnalysis divides EPS by 352.8M shares while using 319.7M for market cap and BVPS — internally inconsistent vendor data.
30. **W18's own 7 % threshold leaves survivors** — DRS's P/E leg (−9.8 %) and WWD's P/FCF leg (−11.9 %) are the same class but escape. "W18 = 0" does not mean the class is gone.

*Operational snags recorded in the compaction summary:* `node -e` with an unset `process.env.OUT`; `ugrep` complexity-limit errors on Thai text with `.{0,N}` (3×); `node tools/update-prices.js --help` is not a flag and silently launched a 908-report dry sweep (PIDs had to be killed); `git pull --rebase` blocked twice by deliberately held files; **commit-message backticks were shell-evaluated**, stripping text from the OKJ message (fixed with `git commit --amend -F`); `apply-edits.js` all-or-nothing rejected an EXPE block over missing `<b>` tags; `apply-edits` left a duplicate `</div>` in CBRE.

**A key methodological finding: the discovery criterion ≠ the detection criterion.** The rule used to *find* the dead-anchor class (FV leg within ≤3 % of spot) fires on **225/908** reports and is **price-dependent**, so cron would make it flicker daily. The shipped W18 compares **target multiple vs current multiple (≤7 %)** — both static text — and fires on **26/908**.

**(e) Fixes shipped**
- 27 per-stock commits for the queue (`3428cf2b` → `b8bcd79f`).
- `433a26c4` — **W18 into the gate** (warn, not error: there is no auto-fixer, and an error would block cron with no machine remedy) + `tools/median-multiples.js` and `tools/spotcheck.js` promoted from scratchpad into the repo (`npm run medians` / `npm run spotcheck` — the scratchpad had been wiped with the previous context, forcing a full rewrite) + **doc corrections**: CLAUDE.md §3.2/§7 (advisor-direct is a *policy* ban, not a technical impossibility), `docs/orchestration.md` §2, §3 ("SEQUENTIAL บังคับ" contradicted CLAUDE.md §3.3 *and* §5 of its own file) and §5 (the claim that env forces Sonnet, when the harness filters `CLAUDE_CODE_SUBAGENT_MODEL` ⇒ unpinned = accidental Opus). 11 self-test cases, 216/216.
- `73f16b7f` EXPE stale-price cleanup (5 places) — found by the brand-new tool the moment it first ran.
- `d4d67d8f` median outlier rejection · `2ca3c777` median currency guard.
- W18 sweep: 26 per-stock commits `4099639a` … `0edbb1f0`. Corpus warnings **152 → 116** (below the 126 baseline from before the day started); W18 **26 → 0**; errors 0 throughout. Biggest MOS swings: ALNY −36.6→−63.9 · DTM −8.7→−35.0 · ICLR −2.6→+21.6 · SYK +21.1→+27.0 · LPLA −4.8→−21.5 · BALL −4.8→−19.4 · EBAY −2.3→−16.1.

**(f) Effort:** 752 assistant messages · span 9.3 h, active 5.3 h · 42 dispatches · one context compaction. **Round 2s: 5 in the queue run** (AEHR, ODFL, DASH, LULU, EXPE) + **1 reject-revert-redo in the sweep** (ICLR) + VRANDA escalated to a second full pass ⇒ 29 worker runs for 27 stocks, then 27+ runs for 26 sweep files. 30 commits, ~5.2M subagent tokens. Wave sizes 3 → 5 → 6 → 6 → 6, no rate limits.

**(g) Left open:**
- W18's 7 % threshold still lets DRS (P/E, −9.8 %) and WWD (P/FCF, −11.9 %) through.
- **W05 cannot detect two legs sharing one P/E multiple** (knows only the (r,g) family).
- **No gate check for the gauge marker label.**
- **ALNY** carries three inconsistent EPS bases in one file (card $5.38 · prep $5.62 · `stock-meta.pe` implies $6.38); E41 is blind because the card does not print EPS in a parseable form.
- **WMT** leg 3 uses the analyst consensus target at a self-chosen 50 % weight.
- **EVRG** two remaining `$85.69` narrative mentions + card EPS ~$3.75 vs vendor 3.92; **CP** stale `$93.50` prose.
- 26 files got today's `updated` ⇒ front page reshuffled and **7-day dedup locks them until 17 Sep** — the exact consequence the controller warned about and the owner accepted.

---

## 2026-09-11 — "เคลียร์คิว price-flags" (3 stocks: FDS/KLAC/LRCX) — S09

**(a)** 11 Sep, UTC 09:55–10:37 (16:55–17:37 Bangkok). Controller Opus 5; workers Sonnet 5.

**(b) User requests:** `เคลียร์คิว price-flags` (single prompt, no follow-ups).

**(c) Queue at start:** 3, all `mos-sign-flip` → all UPDATE-LIGHT. EPS matched vendor and table in all three (no new results due until 30 Sep/21 Oct/28 Oct), so no FV recomputation. Prices pre-patched in one process; W18 pre-checked (no valuation legs touched this round).

**(d) Problems discovered — 6**

1. **W06 fired on KLAC and LRCX** (summary still says "expensive" despite a positive MOS) — *gate-caught*, expected behaviour since cron cannot touch direction words.
2. **`spotcheck` flagged stale current-price references in all 3** — *tool-caught (the tool built in S08 two days earlier, now doing its job pre-dispatch).*
3. **The big one — vendor snapshots gone stale, invisible to the gate.** After reviewing the workers' diffs the controller applied **25 further edits itself** (FDS 15 · KLAC 3 · LRCX 7):
   - **FDS** analyst target `$292.40 (10 analysts, July data)` → **`$261.19 (18, Hold)`** — the price is now *at* the target, not below it, so the gauge scale had to be reordered; 52-week high `$453.41` → `$370.98`; P/E 16.47x → 17.31x (and EPS added to the card so cron can maintain it going forward); P/BV 4.40x → 4.63x; dividend 1.86 % → 1.76 %; net income $540M → $566M.
   - **LRCX** "−27 % from the high" stale in 4 places (real ≈ −32 %); "base case +13 %" while the card shows +22 % (replaced with qualitative wording); dividend + 52-week range updated.
   - **KLAC** dividend 0.49 % → 0.52 %; 52-week low updated.
   *Human-caught. **NEW class #4 in the price-derived family: vendor snapshot staleness surviving UPDATE-LIGHT while the footer declares the report current.***
4. **The cron has no dividend-yield or P/BV code at all** — those values drift silently against price across the whole corpus, and **W10 cannot see it because the card and `stock-meta` go stale together**. *Human-caught, NEW; spun out as chip `task_d6456d04` → became S10.*
5. **FDS EV/EBITDA leg probably sits on an adjusted EBITDA base (~$1.06B)** while StockAnalysis GAAP is $932.5M (11.39x); on a GAAP basis that leg is ~$253, below FV. Left untouched (it is only a cross-check, not an FV input) and deferred to the full UPDATE after the 30 Sep results.
6. **Unpinned-model probe returned Sonnet 5 again**, contradicting CLAUDE.md §3.2's claim of Opus. Recorded to memory as a single measurement; **the doc was deliberately not changed on one probe.**

**(e) Fixes shipped:** `ff9b1073` FDS · `4c3d70f3` KLAC · `277dc9c3` LRCX. Queue → `[]`, verify 13/13, error 0 warning 0 at push and again in the pre-push hook. MOS: FDS −0.4→+5.4 · KLAC −3.3→+3.2 · LRCX −1.9→+3.9, FVs unchanged.

**(f) Effort:** 109 assistant messages · 0.7 h · 6 dispatches (skill, probe, 3 workers, 1 spawn_task). **0 formal round-2 dispatches — but the controller did a full second pass by hand (25 edits), which is a round 2 in substance.** Advisor consulted before dispatch and it added two items the gate missed (FDS wording too strong for a `bad` zone; KLAC's footer year in CE not BE).

**(g) Left open:** the cron dividend/P-BV gap (→ S10); FDS's EV/EBITDA basis; **122 reports still print the price date in CE years** — untouched because fixing them corpus-wide would bump every `updated` date at once; `ai-model` on all three says "Claude Sonnet 5" although Opus 5 (the controller) made 25 of the edits — flagged to the owner as an open policy question; KLAC/LRCX MOS near zero means a ±6 % move re-queues them (normal, not a defect).

---

## 2026-09-11 — "Extend cron patchDerived to dividend yield and P/BV" — S10

**(a)** 11 Sep, UTC 11:11–12:42 (18:11–19:42 Bangkok). Opus 5. *Not a queue run — the S09 spin-off, and the structural close-out of the class S09 found.*

**(b) User requests:** the spawn_task brief → `create PR, push and merge` → `delete the merged branch`. (Two decisions were put to the owner — push both commits? drop any of the 18 flagged cards? — and answered by "create PR, push and merge", i.e. push everything.)

**(c)** n/a — corpus-wide: 895 dividend cards, 693 P/BV cards.

**(d) Problems discovered — 8**

1. **Before the change, the corpus was already broken at scale:** W19 (once written) fires in **467 reports**, W20 in **397**. These had been drifting silently since the cron never touched them.
2. **BBL, the self-test's own fixture, is itself inconsistent** — ฿12 ÷ ฿193.50 = 6.20 % against a displayed 6.3 %. So the new tests had to build **synthetic fixtures** rather than lean on BBL's on-disk state — the lesson from S02/S06 applied pre-emptively.
3. **Denominator parsing is a minefield.** A long empirical survey established the skip rules: quarterly / monthly / interim / special / **planned** dividend amounts; sums of payments with no stated total (TIDLOR `฿0.34 + ฿0.69`); company-wide totals (`$358M`); foreign currency (SAP in €); TBVPS sitting in a plain P/BV card (MTB); one-significant-digit denominators; DPS printed only in `.v` (TAP); no denominator at all (BBL's P/BV).
4. **Refiner/energy clustering proved the drift is real, not a data error** — MPC, PSX, VLO, CVX all show yield ratios depressed in step, and their P/BV ratios move as the exact inverse. *Two independent metrics in the same report cross-validating each other* is what distinguished genuine price drift from a basis error.
5. **A git-history audit was needed to be sure.** For every card the controller found the commit that wrote its current value and checked it against the price on that day: **1,089 of 1,107 matched their own printed denominator back then** ⇒ only the price has moved since, so healing is correct.
6. **That audit caught two bugs the tests had missed:** **TRGP** would have switched from its $4.25 DPS to the "planned" $5.00 purely because drift made $5.00 the closer match (planned/target amounts now skipped); **INSET and NCAP** print `฿0.04`, which is ±12.5 % rounding on its own, so recomputing makes them worse (one-significant-digit denominators now skipped — 24 cards).
7. **18 cards whose displayed value never agreed with their own printed denominator even on the day they were written** — MINT P/BV 1.4x vs 2.33 implied (largest gap), COST 12.6 vs 14.53, plus BCPG GS ICHI KAMART NVR SHR ZBH ZEN at 5–10 %, and yields KBANK UNH ESLT KGC SIS SKR TOP WICE at 5–12 %. Surfaced explicitly for owner review; the owner approved all of them.
8. **CLAUDE.md §8's warning count was already stale** (said 16; W18 had made it 18) and **`docs/quality-gate.md`'s "complete" table was missing W18 entirely** — found incidentally while adding W19/W20 rows.

**(e) Fixes shipped:** PR #25 (merge `042d1230`).
- `cbe7f89b` — `patchDerived` now recomputes **dividend yield** (= DPS printed in the card's `.d` ÷ price), **`stock-meta.dividendYield`** (mirrors the card the way `stock-meta.pe` mirrors P/E) and **P/BV** (= price ÷ printed BVPS), with per-multiple base matching for the six `P/BV / P/TBV` bank cards (BNY CFG FITB KEY RF TFC) plus a distinct-base guard. `~` prefixes and decimal precision preserved; prose and `.d` never touched. Acceptance band `DENOM_BAND = [0.6, 1.67]`, calibrated from the measured pure-drift range [0.62, 1.54]. New warnings **W19** (yield card + meta) and **W20** (P/BV) share the cron's own planning code, so *the gate can only warn about something the heal can fix*. Files: `tools/derived-values.js`, `test/check-reports.js`, `test/self-test.js`, `test/update-prices-test.js`, `docs/price-refresh.md`, CLAUDE.md §8/§9, `docs/quality-gate.md` (W18–W20 rows).
- `81a37e32` — the heal: **735 reports, 1,713 values** (603 yield cards, 605 meta values, 504 P/BV). Corpus warnings **1,014 → 149**; W19/W20 both 0; a second run changes nothing. **No `updated` date moved**, so front-page order and the 7-day dedup are untouched; tag structure identical in all 735 files. Self-test 269/269, update-prices-test 208, engine-exec 908/908. FDS/KLAC/LRCX from that morning were **not** touched — confirming the hand-fixes already matched the formula.
- Verified live on gaohoon.com after deploy: MINT 1.4x→2.1x, KBANK 0.85x→1.01x, COST 12.6x→13.8x, MPC 4.6x→7.1x.
- Merged with a regular merge commit so the tool change and the 735-report heal remain separately revertible; branch deleted after confirming it was contained in `main`.

**(f) Effort:** 228 assistant messages · 1.5 h · 1 dispatch (skill) + 1 advisor consult · one context compaction · TDD red-green cycle with 2 corpus surveys, 1 git-history audit re-run twice, and 2 refinement rounds after the audit.

**(g) Left open (self-declared):** stale numbers written **inside `.d` itself** are still untouched — CRC `(รวม 4.8%)`, PCAR `(~1.1%)`, MTB `P/TBVPS 2.14x` — offered as a possible follow-up check. The cron now maintains 645/720 non-zero yield cards and 530/675 P/BV cards; the remainder are skipped on purpose per (d)(3).

---

## Summary table

| date | session | queue size | # problems | # NEW classes | gate-caught vs human-caught | fixes shipped | turns | wall-clock | open items |
|---|---|---|---|---|---|---|---|---|---|
| 08-23 | S01 queue run | 5 | 8 | 1 (entity-mismatch EPS, 1st live) — **CBOE dead anchor seen but not named** | **0 gate · 8 human** (4 controller, 2 worker, 1 advisor, 1 owner) | 5 commits (incl. EQR→VMRK rename + full rewrite); memory rule 10 | 136 | 1.5 h active / 16.4 h span | MRVL FV on stale non-GAAP fwd EPS; SAPPE/MRVL expected back in queue in days; `/EQR.html` 404 |
| 08-24 | S02 cron post-mortem | — | 3 | 1 (fixture bound to live disk state) | 0 gate (the gate *was* the failure) · 3 human | `1d837377` self-test de-priced; proof sweep ฿160–250 → 201/201 | 109 | 0.4 h | BBL's never-patched MOS cell (W06 accrues); E36 fragile at ฿150 |
| 08-24 | S03 policy | — | 0 | 0 | — | PR #17 — CLAUDE.md §7 "consult advisor before hard work" | 25 | 0.1 h | none (its "worker can't reach advisor" claim later proved false) |
| 08-29 | S04 queue run | 20 | 7 | 3 (harness-vs-repo rule conflict · analyst-target-as-leg · 12-month-window multiple) | **0 gate · 7 human** (5 controller, 2 worker) | 18 commits; 7 FVs changed (IESC −50 % split rebase) | 168 | 0.9 h | ⚠️ **Proposed §8 amendment — pre-fetch medians for every FV change, ban ≤12-month multiples — never answered. Exactly the gap that caused S08.** |
| 09-02 | S05 cron post-mortem | — | 2 | 1 (CI mutates fixture before gate) | 0 gate · 2 human (+advisor caught the fix reintroducing S02's bug) | `34b20802` / PR #21 — %/yr formula is per-report, decisiveness-weighted | 122 | 0.5 h | E36 ฿150 spun out as a task chip |
| 09-02 | S06 fix session | — | 6 | 2 (literal collision with cron output · byte-guard passes semantic no-op) | 0 gate · 6 human (**1 owner override that was correct**) | PR #22 + PR #23 — E34/E36/W17 all de-priced; 2 new fixture rules; 201→205 | 201 | 0.9 h | guard still can't tell "anchor broke" from "literal collided"; **3 owner-driven scope expansions + 3 failed implementation attempts** |
| 09-03 | S07 single re-analysis | 1 | 3 | 0 | 0 gate · 3 human | `a66516b6` SPCX, 37 edits | 47 | 0.2 h | lock-up figures sourced from aggregator blogs, not the prospectus |
| 09-09 | S08 queue run + W18 sweep | 27 (+26 swept) | **30** | **~12** (dead anchor · roe-null · green-MOS cell · stale-target-as-leg · bulk-freshHash · own-tool outliers · own-tool currency mix · leg-vs-file contradiction · W05 P/E-family blind · gauge-marker blind · intraday mid-wave · doc-vs-reality on advisor) | **gate fired only on presentation checks** (E26 gauge-zone order on EXPE/COM7/EIX; W06 direction words on SE/LRCX/AKAM/ROP) · **all 30 substance problems human-caught** (controller spot-check 18, worker self-report 8, advisor 2, owner 2) | 30 commits; **W18 into the gate**; `median-multiples.js` + `spotcheck.js` into `tools/`; CLAUDE.md §3.2/§7 + orchestration §2/§3/§5 corrected; W18 26→0, warnings 152→116 | **752** | 5.3 h active / 9.3 h span | W18 7 % threshold has survivors (DRS, WWD); W05 P/E-family blind; no gauge-marker check; ALNY 3 EPS bases; WMT analyst leg; 26 files dedup-locked to 17 Sep |
| 09-11 | S09 queue run | 3 | 6 | 1 (**vendor-snapshot staleness surviving UPDATE-LIGHT**) | **2 gate/tool** (W06 ×2; spotcheck ×3 — both built in earlier sessions) **· 4 human** | 3 commits; **25 controller hand-edits after the workers finished** | 109 | 0.7 h | cron dividend/P-BV gap (→S10); FDS EV/EBITDA basis; 122 reports with CE-year dates; ai-model attribution when controller edits |
| 09-11 | S10 fix session | — | 8 | 1 (cron never maintained yield/P-BV; W10 blind because card+meta go stale together) | 0 gate · 8 human (2 caught only by a git-history audit, not by tests) | PR #25 — W19/W20 + `patchDerived` extension + **735-report heal, 1,713 values**; warnings 1,014→149 | 228 | 1.5 h | stale numbers inside `.d` (CRC, PCAR, MTB); 75 yield + 145 P/BV cards intentionally unmaintained |

### What the table says

- **Ten sessions, ~73 distinct problems, and the automated gate caught no problem of substance.** Where it fired at all it fired on presentation: gauge-zone ordering (E26 on EXPE, COM7, EIX) and direction words contradicting a positive MOS (W06 on SE, LRCX, AKAM, ROP, KLAC). Every wrong *number* — GRAB's P/E, FICO's Market Cap, KLAC's ROE, BGC's normalized EPS and net debt, UMC's ADR units, ROP's mislabelled TTM, ODFL's dead anchor — passed `npm test` 43/43 with 0 errors and 0 warnings both before and after the fix. All of them were found by a controller spot-check, a worker's own report, the advisor, or the owner.
- **Four of the ten sessions are not queue runs at all** — they are repairs of the gate and the cron that the queue runs forced. Two of those (S02, S05) are the daily price cron falling over because a self-test fixture sat on live disk state; S06 is the third instance of the same family, found while fixing the second.
- **The 29 Aug proposal is the single clearest cost.** S04 ended by proposing exactly the rule (pre-fetch median multiples for every report whose FV changes; never use a ≤12-month window as an FV anchor) that would have prevented S08's ODFL/EXPE/DASH rework 11 days later. It was labelled "รอคุณเคาะ". Evidence it was never acted on: `git log 5a6fdd9d..433a26c4 -- CLAUDE.md` returns exactly one commit — `433a26c4`, made *inside S08 itself* on 9 Sep. S08's controller then names its own failure to pre-fetch medians as the root cause, in the same words S04 used.
- **Round-2 re-dispatches cluster entirely in S08** (5 in the queue run, plus ICLR's reject-revert-redo and VRANDA's escalation). The earlier queue runs had zero, because the controller repaired worker output in-line and injected each lesson into the not-yet-spawned prompts — a pattern that demonstrably worked (the IT worker cited "บทเรียน GRAB §A" and caught the same Market Cap bug unaided).
- **The tools built to close a gap became the next gap.** `median-multiples.js`, written in S08 to stop dead anchors, shipped wrong numbers to workers twice within hours — a 2,074x outlier and a USD/CAD currency mix that CLAUDE.md's own §8 0.4b warns about. Both were caught by an internal contradiction inside a report, not by any check.
