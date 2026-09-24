# Report v3 Plan 3 (P5) — the price cron writes v3 reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Every implementer and reviewer is an Opus subagent** (never Haiku, never unpinned). Task 6 is run by the controller (rehearsal, PR, merge precondition).

**Goal:** `tools/update-prices.js` refreshes the price of every v3 report (`reports/<SYM>.json`) each night, writing `market.*` only, with the same freeze rules, quarantine and flags as the v2 path. This ends the v3 price freeze (open-item #62, hard deadline 2027-01-21) and adds `check-v3` to the cron gate (#61).

**Architecture:** A pure builder `tools/v3/market.js` (`marketFromQuote`, `priceOnlyChart`, `validRange`, `quoteDate`) is the only producer of a v3 `market` block. The cron calls it directly, and prep calls it through `factsJson` → sidecar. A new writer, `IO.writeMarket`, runs under one lock: it reads the file, verifies the on-disk `_sig`, replaces `market`, runs `checkDoc`, signs and writes. In `update-prices.js`, `main()` iterates `RS.list` (v2 + v3). The code both lanes share (fetch, abort counter, intraday guard, not-on-exchange skip, canary quotes, chart fallback) is extracted into `preSkip` and `chartFor`. After the quote, a v3 file goes through `planV3` (pure: `decide()` on the FV from `compute`, the no-new-session check, `bad-chart`, `marketFromQuote`, and `checkDoc` in memory) and then `applyV3`, which calls `IO.writeMarket`. `v3Guard`, `v3Refusal` and `v3SweepNotice` are removed. `verify:cron` gains `check-v3`, the workflow counts `.json` in the commit title, and preflight prints one manual-command line per v3 row.

**Tech Stack:** Node ≥20.19, CommonJS, no dependencies. v3 unit tests are plain Node scripts using `test/v3/_t.js`, run in one process by `test/v3-test.js`, which picks up any new `test/v3/*.test.js` file automatically. Queue and cron tests stay in `test/queue-test.js`, `test/update-prices-test.js` and `test/v3/scanners-cron.test.js`. Docs are checked by `node tools/gen-docs.js --check` and `test/docs-test.js`.

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md`. The binding sections are §7 (rewritten for this plan), §8 (freshHash), §9 (E50/E51), §11 (the P5 row, including exit criteria (a)–(f)) and §13 items 6, 9 and 11. The binding rulings are R1–R12 in `.superpowers/sdd/v3-plan3-task0/rulings.md`. The evidence, with file:line references, is in `.superpowers/sdd/v3-plan3-task0/findings-cron.md`. The format reference is `docs/superpowers/plans/2026-09-24-report-v3-plan2c-ii-first-reports.md`, and the code-plan style follows `…-plan2b-infra.md`.

**Out of scope (P6):** the age queue's `!e.v3` filter, `prep` accepting v3, `ship` `.html`→`.json`, `checkFyYears` on v3, automated v3 pre-patch (`patchTargets.skippedV3`, `parseGateFailures`, the revert path, `ship --prepatch` refusing `.json`), migrate runs, #64, #65.

## Execution Notes (subagent-driven)

- Worktree `/Users/somchai.s/Downloads/stock-v3-plan3`, branch `feat/report-v3-plan3` (from `main` `ae39dff10`). Throwaway checkouts only: `/Users/somchai.s/Downloads/stock-v3-plan3-base` (DIST-PROOF) and `/Users/somchai.s/Downloads/stock-v3-plan3-scratch` (Task 6 rehearsal). Remove both at the end of their step.
- **Every code step in this plan was run on a copy of `ae39dff10` on 24 Sep 69 at about 23:00 Bangkok time.** The results: `✓ market: 24/24` · `✓ io: 31/31` · `✓ cron: 51/51` (53/53 after Task 4) · `✓ sidecar: 57/57` · `✓ scanners-cron: 21/21` · `✓ update-prices-test: 520 passed` · `queue-test: 559/559` · full `npm run verify` green · the fixture rehearsal on OGE/ICC produced a diff of `market` + `_sig` only. A different count means the code drifted from this plan. Stop and diff before "fixing" a test.
- Standing prohibitions in every implementer prompt:
  - **Never push.**
  - **Never call `advisor`.**
  - **Never spawn subagents or `claude -p`.**
  - **Never create or edit any file under `reports/`, `reports.json`, `.work/` or `.queue/` in the branch worktree.** Tests use `os.tmpdir()` and write v3 fixtures through `IO.write` only.
  - **Never edit `.claude/settings*.json`.**
  - **Never loosen an existing assertion to make new code pass.** The only exceptions are the three P4-refusal tests this plan names and queue-test `0b` (the cron step count), and those are replaced with the exact code given.
- **fixture-lint** scans `test/*.js` and `test/v3/*.js`. Never put the literal `'reports'` next to a `'<name>.json|html'` string, and never put it inside a `readFileSync(` call. Build paths from `tmp` or `ROOT` variables.
- **rtk hook:** use `rtk proxy <cmd>` for any grep or count you rely on. The hook silently drops lines, and during planning a plain `grep` missed queue-test `0b`.
- Writes under `.claude/skills/` (Task 5) may be blocked by the harness classifier. If a write is refused, STOP and return the exact text to the controller. Do not relocate the file.

## Global Constraints

- **Models:** all implementer and reviewer subagents run on **Opus**, pinned on every call. No Haiku at any step.
- **Git in temp dirs:** tests that spawn `git` in a temp dir must remove `GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|PREFIX|OBJECT_DIRECTORY)` from the environment and pass `-c core.hooksPath=/dev/null` (the existing pattern in `test/v3/scanners-cron.test.js:65–67`). No test in this plan spawns git; if one is added, it follows this rule.
- **Before any push:** run `GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js`, which simulates the pre-push environment (memory `git-hook-env-git-init-trap`), and `rtk proxy npm run verify`. Both must pass.
- **Report files:** never edit `reports/*.json` or `reports.json` by hand. Tests create fixtures with `IO.write` in `os.tmpdir()`. The one deliberate "hand edit" in tests is a raw `fs.writeFileSync` of a temp copy, used to prove E50, and it never touches the repo.
- **Settings:** never edit `.claude/settings.json` or `.claude/settings.local.json`.
- **v2 output:** v2 pages stay byte-identical. The DIST-PROOF in Task 6 at the final head is `DIST IDENTICAL` against the merge-base, because this branch writes no report. `patchReport` keeps its behaviour exactly: the price-only fallback moves into `MK.priceOnlyChart` with the same error text, and `chartFor` is the old inline block, moved.
- **Branch and PR:** one PR on branch `feat/report-v3-plan3`. Commit after every task with messages in the style `feat(v3): …`, `test(v3): …` or `docs(v3): …`. The trailer is exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
  If the implementer's harness system-reminder specifies additional attribution lines, append them after this trailer.
- **Merge precondition (R11 e):** the scheduled cron run of **25 Sep 69 at 04:00 Bangkok time** must have run on `main` before merge, and its log must contain `v3-skipped: 2` and no `patch-rejected` line for OGE or ICC. Task 6 Step 6 checks this.
- **`SEC_USER_AGENT`:** never committed, printed or put into a test.
- **Docs gate:** after Task 4 and after Task 5, `node tools/gen-docs.js --check` exits 0 and `node test/docs-test.js` passes. In `CLAUDE.md`, `README.md` and `docs/*.md`, never write "N ขั้น" for verify or verify:cron outside a `gen:` marker.
- **Cycle rule:** nothing under `tools/v3/*` may require `tools/update-prices.js`, `build.js` or `test/*` at load time. The one sanctioned exception is `IO.writeMarket`, which **lazily** requires `test/check-v3.js` inside the function (R1). `update-prices.js` requires `check-v3` lazily inside `planV3`.
- **Code style:** Node ≥20.19, CommonJS `'use strict'`, no new npm dependency. User-facing strings are Thai, in the tone of the file being edited.

## Review Focus

1. **Yahoo returns no or invalid `fiftyTwoWeekLow/High`.** `range52w` must keep the previous value. Otherwise `cards.js:87` and `tokens.js:35` throw, which becomes E51 and then `patch-rejected` on every v3 report every night. Pinned in Task 1 (`market.test.js`: lo missing / lo 0 / hi<lo / NaN → prev kept) and in Task 3 (`cron.test.js`: "Yahoo 52wk missing → prev range52w kept, still writes").
2. **ICC, where there is no new session.** An illiquid TH stock can have the same `priceDate` and px, or a quote older than the doc. The result must be `unchanged`: no write, no flag, and `priceDate` never moves backwards. Pinned in Task 3 (the two `R5:` cases, plus `applyV3` "unchanged: no write") and rehearsed in Task 6 Step 2.
3. **Chart fallback shape.** The weekly series must be grouped by month (labels such as `ส.ค.26`), with the last point equal to px, at most 13 points, and the price-only path used when there is no chart. `bad-chart` with `--force` keeps the old chart. Pinned in Task 1 (price-only replace/append/drop-oldest/throw) and in Task 3 (weekly fallback, "no chart at all", "--force + bad-chart").
4. **Gate semantics.** A W18 or W25 that flips at the new price is only a warning and must not reject. E50 (a hand-edited file) and E51 are never forced, and the cron never re-signs a hand edit. Pinned in Task 2 (`writeMarket` E50/E51/E52/E27 and `--force`) and in Task 3 ("R6: W18 … still writes", "E51 is never forced", "E50 … never forced", "write-time E50 … bytes unchanged").
5. **v2 plumbing silently leaving v3 out:** `evaluated`, `aliveAsserted`, `commitBody`, the yml commit count, and the `.html`-only readdir. Pinned in Task 3 (`evaluatedOf` includes v3, an old v3 flag clears, an intraday v3 symbol keeps its flag, `commitBody` lists v3 rows, and a static check that there is no `/\.html$/i.test(f)` left and that `v3Guard`/`v3Refusal`/`v3SweepNotice` are gone) and in Task 4 (the yml string test and the queue-test `0b` step count of 6).

## Plan-level adaptations of the rulings (all rulings honoured)

- **P-R3 (the R3 prep path).** The sidecar never holds a quote: `buildSidecar` reads `fetch-facts --json` output from a child process. So the single builder runs inside `factsJson(q)` as `MK.marketFromQuote(null, q, …)`, and the sidecar copies those five fields and applies the one declared override (vendor 52wk first, M7). The "range is usable" rule is one function, `MK.validRange`, used by both the cron and the sidecar. `test/v3/sidecar.test.js` proves that prep and the cron produce the same `market` for the same quote, and that the vendor range is the only difference. There are two side effects, both deliberate: `factsJson.px` is now rounded to 2 dp (it was raw), and the Yahoo range now requires lo > 0 (the sidecar already did).
- **P-R5.** "No new session" is tested as quote date **≤** `market.priceDate` with the same rounded px. The ruling says `==`. The `≤` form also covers a quote older than the doc, so `priceDate` never moves backwards.
- **P-R6.** `checkDoc` on a freshly re-signed doc can never report E50. So E50 is enforced by `IO.verifySig(prev)` in `planV3` and by `verifySig(cur)` in `writeMarket` under the lock. A hand-edited report is always `patch-rejected` E50, even with `--force`.
- **P-R10.** The intraday and not-on-exchange gates are shared by both lanes, so they are extracted as the pure `preSkip`, together with `evaluatedOf`, and not moved into `planV3`. `planV3` returns `unchanged | freeze | write`. The "skip" cases are `preSkip`'s `'intraday' | 'dead'`. `chartFor` is the old inline chart block, moved without change.
- **Log token.** The new summary line is `ℹ v3-lane: N ใบ · อัปเดต … · ไม่เปลี่ยน … · freeze … · ข้ามเพราะตลาดเปิด … · ข้าม not-on-exchange …`. It replaces `v3-skipped: N` and is what you grep for R11 (f).
- **No new flag reason.** An unreadable v3 JSON goes to `failed` with `no-stock-meta`, a v3 compute throw is `patch-failed`, and a v3 gate failure is `patch-rejected`. All of these are existing PLUMBING/REJECTED buckets, so `triage.js` does not change.

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `tools/v3/market.js` (create) | the one `market` builder: `marketFromQuote` `priceOnlyChart` `validRange` `quoteDate` `MAX_PTS` | 1 |
| `test/v3/market.test.js` (create) | builder unit tests (keep policy, price-only, schema) | 1 |
| `tools/fetch-facts.js` (modify `factsJson` :28–41, require after :16) | prep uses the builder | 1 |
| `tools/queue/sidecar.js` (modify :12–19, :54) | `MK.validRange` · the vendor override is documented | 1 |
| `tools/update-prices.js` (modify after :71, :430–439) | `patchReport` price-only → `MK.priceOnlyChart` | 1 |
| `test/v3/sidecar.test.js` (append before `t.done()` :129) | prep market = cron market (R3) | 1 |
| `tools/v3/io.js` (modify :46) | `writeMarket` under one lock (R1) | 2 |
| `test/v3/io.test.js` (append before `t.done()`) | sig, freshHash, deep-equal, E50/E51/E52/E27, force | 2 |
| `tools/update-prices.js` (modify header, requires, :877–896, :911–915, :968–1215) | v3 lane: `healV3Refusal` `preSkip` `evaluatedOf` `chartFor` `planV3` `applyV3` `v3LaneLine` · `RS.list` loop · remove the P4 guard | 3 |
| `test/v3/cron.test.js` (create) | lane tests (R10 list + R5) | 3 |
| `test/v3/scanners-cron.test.js` (:19–42) · `test/update-prices-test.js` (:30) · `test/queue-test.js` (:1570 label) | replace the tests that pinned the P4 refusal | 3 |
| `package.json` (:31) · `CLAUDE.md` `README.md` `docs/price-refresh.md` (gen markers) | `verify:cron` + `check-v3` (#61) | 4 |
| `.github/workflows/update-prices.yml` (:1, :74) | header comment + the commit count includes `.json` | 4 |
| `tools/queue/preflight.js` (:139, :150, :301, exports) · `tools/queue/prep.js` (:270) · `tools/queue/ship.js` (:373) | R8 line · stale "v3 cron = Plan 3" strings | 4 |
| `test/queue-test.js` (:34–45 `0b`, after :1570) · `test/v3/cron.test.js` (append) | cron has 6 steps · `v3Lines` · yml count | 4 |
| `.claude/skills/stock-controller/SKILL.md` (:52) · `CLAUDE.md` §9 (:138/139) · `docs/price-refresh.md` (:24, new section before :96) · `docs/decisions.md` (§9 end, §10 end) · `docs/open-items.md` (#49 :117, #61 :34, #62 :35) | R12 docs | 5 |
| (no repo file) | rehearsal · verify · GIT_DIR-sim · DIST-PROOF · merge precondition · PR | 6 |

---

### Task 1: `tools/v3/market.js` — one `market` builder (R3), used by the cron, prep and v2 price-only

**Files:**
- Create: `tools/v3/market.js`, `test/v3/market.test.js`
- Modify: `tools/fetch-facts.js` (require after :16; `factsJson` :28–41), `tools/queue/sidecar.js` (require after :13; delete `rng` :18–19; `range52w` :54), `tools/update-prices.js` (require after the `RS` line :71; price-only fallback :430–439)
- Test: `test/v3/sidecar.test.js` (append 3 assertions before the final `t.done()`)

**Interfaces:**
- Consumes: `THAI_MONTHS` (`tools/price-date.js`), `U.buildChartData(bars, price, gmtoffset)` (callers only), `RV.isoOf({day, monIdx, yearCE})`.
- Produces:
  - `MK.marketFromQuote(prev: market|null, q: fetchChart-quote, chartData: [label, px][]|null, opts?: {priceOnly?: boolean}) → { px, priceDate, chart: {data, gridFmt?, dataFmt?}, chgSuffix, range52w? }`. It throws `ราคาใช้ไม่ได้` when price ≤ 0, and `กราฟใหม่ไม่พอจุด และกราฟเดิมใช้ไม่ได้` when price-only has no old chart.
  - `MK.priceOnlyChart(oldData, price, iso) → data`
  - `MK.validRange(lo, hi) → {lo, hi}|null`
  - `MK.quoteDate(q) → 'YYYY-MM-DD'`
  - `MK.MAX_PTS = 13`
  - `FF.factsJson` keeps its output shape, and its px is now rounded to 2 dp.

- [ ] **Step 1: Write the failing test** — create `test/v3/market.test.js`:

```js
'use strict';
// Plan 3 Task 1 — tools/v3/market.js ตัวสร้าง market ตัวเดียว (spec §7 · R3) · offline ล้วน
const t = require('./_t.js')('market');
const MK = require('../../tools/v3/market.js');
const S = require('../../tools/v3/schema.js');
const ZTS = require('../fixtures/v3/ZTS-real.json');

const mid = (i) => Date.UTC(2025, 9 + i, 15) / 1000;   // กลางเดือน ต.ค.25 … ก.ย.26 — ไม่ให้ gmtoffset ลากข้ามเดือน
const bars = ZTS.market.chart.data.map((p, i) => ({ ts: mid(i), close: p[1] }));
const T22 = Date.UTC(2026, 8, 22, 20, 0, 0) / 1000;    // 22 ก.ย. 69 16:00 ET
const q = { price: 73.456, currency: 'USD', marketTime: T22, gmtoffset: -4 * 3600, week52Low: 69.5, week52High: 148.79, bars };
const data = ZTS.market.chart.data.slice(0, 11).concat([['ก.ย.26', 73.46]]);
const prev = { ...ZTS.market, chgSuffix: 'ตั้งแต่ IPO', chart: { ...ZTS.market.chart, gridFmt: 'v.toFixed(0)', dataFmt: 'd[1].toFixed(1)' } };

{ const m = MK.marketFromQuote(prev, q, data);
  t.eq(Object.keys(m), ['px', 'priceDate', 'chart', 'chgSuffix', 'range52w'], 'key order = sidecar order (no line shuffle in the file diff)');
  t.eq([m.px, m.priceDate], [73.46, '2026-09-22'], 'px round2 · priceDate = ISO of marketTime + gmtoffset (market-local day)');
  t.eq(m.chart, { data, gridFmt: 'v.toFixed(0)', dataFmt: 'd[1].toFixed(1)' }, 'chart.data = the given series · gridFmt/dataFmt kept from prev');
  t.eq(m.chgSuffix, 'ตั้งแต่ IPO', 'chgSuffix kept from prev (v2 behaviour — recomputed only at prep)');
  t.eq(m.range52w, { lo: 69.5, hi: 148.79 }, 'range52w = Yahoo 52wk when valid');
  t.eq(S.validate({ ...ZTS, market: m }), [], 'result passes the schema market block'); }

// range52w: Yahoo หาย/เสีย → คงของเดิม (การ์ด/โทเคน range52w throw ถ้าไม่มี = E51 → patch-rejected ทุกวัน)
for (const [lo, hi, why] of [[undefined, 150, 'lo missing'], [0, 150, 'lo 0'], [80, 70, 'hi < lo'], [NaN, NaN, 'NaN']])
  t.eq(MK.marketFromQuote(prev, { ...q, week52Low: lo, week52High: hi }, data).range52w, prev.range52w, `range52w: Yahoo ${why} → prev kept`);
t(!('range52w' in MK.marketFromQuote({ ...prev, range52w: undefined }, { ...q, week52Low: undefined }, data)), 'range52w: none anywhere → key absent (schema optional)');
t.eq([MK.validRange(1, 2), MK.validRange(0, 2), MK.validRange(3, 2), MK.validRange(null, 2)], [{ lo: 1, hi: 2 }, null, null, null], 'validRange: lo > 0 and hi ≥ lo only');

// prep (prev = null): chgSuffix จากช่วงของ bars · ไม่มีคีย์ fmt
t.eq(MK.marketFromQuote(null, q, data).chgSuffix, 'รอบปี', 'prep: ≥ 320 days of bars → รอบปี');
t.eq(MK.marketFromQuote(null, { ...q, bars: bars.slice(-5) }, data).chgSuffix, 'ตั้งแต่ IPO', 'prep: < 320 days of bars → ตั้งแต่ IPO');
t.eq(Object.keys(MK.marketFromQuote(null, q, data).chart), ['data'], 'prep: chart = data only');

// price-only (ไม่มีกราฟใหม่ / bad-chart + --force)
{ const po = MK.marketFromQuote(prev, q, null);
  t.eq(po.chart.data.length, 12, 'price-only: same month as the last point → replace (length kept)');
  t.eq(po.chart.data[11], ['ก.ย.26', 73.46], 'price-only: last point = new px');
  t.eq(po.chart.data.slice(0, 11), ZTS.market.chart.data.slice(0, 11), 'price-only: older points untouched'); }
{ const oct = { ...q, marketTime: Date.UTC(2026, 9, 2, 20, 0, 0) / 1000 };
  const po = MK.marketFromQuote(prev, oct, null);
  t.eq([po.chart.data.length, po.chart.data[0][0], po.chart.data[12]], [13, 'ต.ค.25', ['ต.ค.26', 73.46]], 'price-only: new month → append (13 points)');
  const p13 = { ...prev, chart: { data: [['ก.ย.25', 150]].concat(ZTS.market.chart.data) } };
  const po13 = MK.marketFromQuote(p13, oct, null);
  t.eq([po13.chart.data.length, po13.chart.data[0][0]], [13, 'ต.ค.25'], 'price-only: 14th point → oldest dropped (≤ 13 · E37)'); }
t.eq(MK.marketFromQuote(prev, q, data, { priceOnly: true }).chart.data.slice(0, 11), ZTS.market.chart.data.slice(0, 11), 'opts.priceOnly ignores the given series (bad-chart + --force)');
t.throws(() => MK.marketFromQuote(null, q, null), /กราฟเดิมใช้ไม่ได้/, 'price-only without an old chart → throw (cron: patch-failed)');
t.throws(() => MK.marketFromQuote(prev, { ...q, price: 0 }, data), /ราคาใช้ไม่ได้/, 'price ≤ 0 → throw');
t.eq(MK.priceOnlyChart([['ส.ค.26', 1], ['ก.ย.26', 2]], 3.456, '2026-09-30'), [['ส.ค.26', 1], ['ก.ย.26', 3.46]], 'priceOnlyChart: label from the ISO month (CE 2-digit)');

t.done();
```

Append to `test/v3/sidecar.test.js`, immediately before its last line `t.done();`:

```js
// Plan 3 Task 1 (R3) — ตัวสร้าง market ตัวเดียว: quote เดียวกัน → prep (factsJson → buildSidecar) = cron (marketFromQuote)
{ const MK = require('../../tools/v3/market.js');
  const U = require('../../tools/update-prices.js');
  const built = MK.marketFromQuote(null, q, U.buildChartData(q.bars, q.price, q.gmtoffset));
  const noVendor = SC.buildSidecar({ ...I, vend: { ...I.vend, lo52: null, hi52: null }, facts: FF.factsJson(q, 'ZZZQ', 'USD') });
  t.eq(noVendor.market, built, 'R3: prep market (factsJson → sidecar) = cron builder market for the same quote');
  const withVendor = SC.buildSidecar({ ...I, vend: { ...I.vend, lo52: 69, hi52: 150 }, facts: FF.factsJson(q, 'ZZZQ', 'USD') });
  t.eq(withVendor.market, { ...built, range52w: { lo: 69, hi: 150 } }, 'R3: the only prep-side difference = vendor 52wk override (M7)');
  t.eq(FF.factsJson({ ...q, price: 71.334 }, 'ZZZQ', 'USD').px, 71.33, 'factsJson px = round2 (same as cron — was raw before Plan 3)'); }
```

- [ ] **Step 2: Run the tests to watch them fail**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan3
node test/v3/market.test.js 2>&1 | head -3
node test/v3/sidecar.test.js 2>&1 | tail -2
```
Expected: `Error: Cannot find module '../../tools/v3/market.js'` from both. (The sidecar test now requires the module too.)

- [ ] **Step 3: Create `tools/v3/market.js`**

```js
'use strict';
/**
 * market.js — ตัวสร้าง `market` ของใบ v3 ตัวเดียว (spec §7 · Plan 3 ruling R3)
 *   cron (tools/update-prices.js planV3) และ prep (tools/fetch-facts.js factsJson → tools/queue/sidecar.js) ใช้ตัวนี้
 *   ⇒ quote เดียวกัน = market เดียวกัน (test/v3/sidecar.test.js ยืนยัน) · ส่วนบริสุทธิ์: ไม่ยิง network ไม่อ่านไฟล์
 *   ★ ห้าม require tools/update-prices.js · build.js · test/* (กติกา cycle ของ tools/v3) — ผู้เรียกส่ง chartData ที่สร้างแล้วมาเอง
 *   นโยบายคงค่า (R3): range52w = Yahoo 52wk เมื่อใช้ได้ ไม่งั้นคงของเดิม · chgSuffix/gridFmt/dataFmt คงของเดิม
 *     (prev = null = ใบใหม่ของ prep → คำนวณ chgSuffix จากช่วงของ bars ครั้งเดียว)
 */
const { THAI_MONTHS } = require('../price-date.js');

const MAX_PTS = 13;          // กราฟรายเดือน ~1 ปี (E37 · schema market.chart.data 2–13 จุด)
const IPO_SPAN_DAYS = 320;   // bars สั้นกว่านี้ = ข้อมูลจริง < ~1 ปี → "ตั้งแต่ IPO" (เกณฑ์เดียวกับป้าย .chg ของ fetch-facts โหมดข้อความ)
const round2 = (v) => Math.round(v * 100) / 100;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** กรอบ 52 สัปดาห์ที่ schema รับ (lo > 0 · hi ≥ lo) → { lo, hi } · ใช้ไม่ได้ = null — กติกาเดียวของ cron และ sidecar (vendor 52wk) */
const validRange = (lo, hi) => (isNum(lo) && isNum(hi) && lo > 0 && hi >= lo ? { lo, hi } : null);
/** วันที่ราคา (ISO) = วันของ regularMarketTime ตาม tz ตลาด — วันหยุดได้วันปิดล่าสุดจริง (สูตรเดียวกับ cron v2 · factsJson เดิม) */
const quoteDate = (q) => new Date((q.marketTime + (q.gmtoffset || 0)) * 1000).toISOString().slice(0, 10);
const labelOf = (iso) => `${THAI_MONTHS[Number(iso.slice(5, 7)) - 1]}${iso.slice(2, 4)}`;

/** price-only fallback (ย้ายจาก update-prices.js patchReport — ทาง v2 เรียกตัวนี้ด้วย): Yahoo ไม่มีประวัติพอ / bad-chart + --force
 *  → คงกราฟเดิม · จุดท้ายเดือนเดียวกับวันที่ราคา = แทนค่า · คนละเดือน = ต่อจุดใหม่แล้วตัดหัวให้ ≤ MAX_PTS · กราฟเดิมใช้ไม่ได้ = throw */
function priceOnlyChart(oldData, price, iso) {
  if (!Array.isArray(oldData) || oldData.length < 2) throw new Error('กราฟใหม่ไม่พอจุด และกราฟเดิมใช้ไม่ได้');
  const lab = labelOf(iso);
  let data = oldData.map((d) => [d[0], d[1]]);
  if (data[data.length - 1][0] === lab) data[data.length - 1][1] = round2(price);
  else data = data.concat([[lab, round2(price)]]).slice(-MAX_PTS);
  return data;
}

/** market ของใบ v3 จาก quote ของ fetchChart (ส่วนบริสุทธิ์)
 *  prev = market เดิมของใบ (cron) หรือ null (prep ใบใหม่) · chartData = ผลของ buildChartData (รายเดือน/รายสัปดาห์) หรือ null
 *  opts.priceOnly = true → ไม่ใช้ chartData (bad-chart + --force: ห้ามเขียนกราฟจากซีรีส์ผสมสองฐาน)
 *  ลำดับคีย์ = ของ sidecar (px, priceDate, chart, chgSuffix, range52w) ⇒ diff ของไฟล์จริงไม่สลับบรรทัด
 *  range52w: ไม่มีทั้ง Yahoo และของเดิม = ไม่ใส่คีย์ (schema optional · factsJson แปลงเป็น null ให้ sidecar) */
function marketFromQuote(prev, q, chartData, opts) {
  const o = opts || {};
  if (!isNum(q.price) || q.price <= 0) throw new Error(`ราคาใช้ไม่ได้: ${q.price}`);
  const priceDate = quoteDate(q);
  const data = !o.priceOnly && Array.isArray(chartData) && chartData.length >= 2
    ? chartData.map((d) => [d[0], d[1]])
    : priceOnlyChart(prev && prev.chart && prev.chart.data, q.price, priceDate);
  const chart = { data };
  if (prev && prev.chart && prev.chart.gridFmt != null) chart.gridFmt = prev.chart.gridFmt;
  if (prev && prev.chart && prev.chart.dataFmt != null) chart.dataFmt = prev.chart.dataFmt;
  const bars = q.bars || [];
  const spanDays = bars.length >= 2 ? (bars[bars.length - 1].ts - bars[0].ts) / 86400 : 0;
  const chgSuffix = prev && prev.chgSuffix ? prev.chgSuffix : spanDays < IPO_SPAN_DAYS ? 'ตั้งแต่ IPO' : 'รอบปี';
  const out = { px: round2(q.price), priceDate, chart, chgSuffix };
  const range = validRange(q.week52Low, q.week52High) || (prev && prev.range52w) || null;
  if (range) out.range52w = range;
  return out;
}

module.exports = { marketFromQuote, priceOnlyChart, validRange, quoteDate, MAX_PTS };
```

- [ ] **Step 4: Switch the three callers to the builder**

`tools/fetch-facts.js`: add a line after the `require('./update-prices.js')` line (:16):
```js
const MK = require('./v3/market.js');   // Plan 3 (R3): ตัวสร้าง market ตัวเดียว (cron ใช้ตัวเดียวกัน)
```
Then replace the whole `factsJson` function and its doc comment (:28–41) with:
```js
/** ข้อมูลเครื่องอ่านของ sidecar (spec §6.4 · ส่วนบริสุทธิ์ — q = ผลของ fetchChart) · chart = data อย่างเดียว (min/max/grid → compute คิดเอง)
 *  ★ Plan 3 (R3): px/priceDate/chart/chgSuffix/range52w มาจาก tools/v3/market.js marketFromQuote(null, …) — ตัวสร้างเดียวกับ cron
 *    ⇒ quote เดียวกันให้ market เดียวกันทั้ง prep และ cron · range52w ใช้ไม่ได้ = null (sidecar ทับด้วย vendor 52wk เมื่อมี — M7) */
function factsJson(q, symbol, currency) {
  const m = MK.marketFromQuote(null, q, buildChartData(q.bars, q.price, q.gmtoffset));
  return {
    symbol, currency, quoteCurrency: q.currency || null, px: m.px, priceDate: m.priceDate, chart: m.chart,
    chgSuffix: m.chgSuffix, range52w: m.range52w || null,
    company: q.longName || null, exchange: exchangeCode(q.exchangeName),
  };
}
```

`tools/queue/sidecar.js`: add a line after `const path = require('path');` (:13):
```js
const MK = require('../v3/market.js');   // Plan 3 (R3): validRange = กติกา "กรอบใช้ได้" ตัวเดียวกับ cron
```
Delete the two lines of the `rng` helper (:18–19, the comment `/** กรอบ 52 สัปดาห์ที่ใช้ได้ …` and `const rng = …`). Its only use is :54. Then replace line :54 (`range52w: rng(lo, hi) || …`) with:
```js
      // facts = marketFromQuote(null, q, …) ผ่าน fetch-facts --json (ตัวสร้างเดียวกับ cron — R3) · override เดียวที่ประกาศไว้: vendor 52wk ก่อน (M7)
      range52w: MK.validRange(lo, hi) || (facts.range52w ? MK.validRange(facts.range52w.lo, facts.range52w.hi) : null),
```

`tools/update-prices.js`: add a line after `const RS = require('./report-source.js'); …` (:71):
```js
const MK = require('./v3/market.js');   // Plan 3 (R3): ตัวสร้าง market ของใบ v3 + priceOnlyChart (ทาง v2 เรียกตัวเดียวกัน)
```
Then, in `patchReport`, replace the price-only block (:430–439, from `// price-only fallback: Yahoo ไม่มีประวัติพอ …` through the closing `}` of `if (!chartData) { … }`) with:
```js
  // price-only fallback: Yahoo ไม่มีประวัติพอ (ล้างประวัติ/IPO ใหม่มาก) → คงกราฟเดิม อัปเดตเฉพาะจุดท้ายเป็นราคาปัจจุบัน
  // (Plan 3 · R3: ย้ายเป็น tools/v3/market.js priceOnlyChart — สาย v3 ของ cron เรียกตัวเดียวกัน)
  if (!chartData) chartData = MK.priceOnlyChart(rd.chart.data, newPrice, RV.isoOf(dateParts));
```
The error text is unchanged (`กราฟใหม่ไม่พอจุด และกราฟเดิมใช้ไม่ได้`).

- [ ] **Step 5: Run the tests to watch them pass, and check that the v2 paths are unchanged**

```bash
node test/v3/market.test.js && node test/v3/sidecar.test.js | tail -1
rtk proxy node test/update-prices-test.js | tail -1 && rtk proxy node test/v2-path-test.js | tail -1 && rtk proxy node test/prep-stock-test.js | tail -1
```
Expected: `✓ market: 24/24` · `✓ sidecar: 57/57` · `✓ update-prices-test: 520 passed` · `v2-path-test: 436/436 ผ่าน` · `✓ prep-stock-test: 122 passed`. (The v2 `patchReport` price-only fallback is exercised with `chartData: null` many times in `update-prices-test.js` from :191 and in `v2-path-test.js` :41/:123.)

- [ ] **Step 6: Commit**

```bash
git add tools/v3/market.js test/v3/market.test.js tools/fetch-facts.js tools/queue/sidecar.js tools/update-prices.js test/v3/sidecar.test.js
git commit -m "feat(v3): tools/v3/market.js — one market builder for cron, prep and v2 price-only (Plan 3 R3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `IO.writeMarket` — the cron's writer under one lock (R1 · R6)

**Files:**
- Modify: `tools/v3/io.js` (insert before `module.exports` :46; add `writeMarket` to the exports)
- Test: `test/v3/io.test.js` (append a block before the final `t.done()`)

**Interfaces:**
- Consumes: `read` `verifySig` `sign` `serialize` (same module), `LK.withLock` `LK.writeJsonAtomic`, and `checkDoc` from `test/check-v3.js`, required **lazily** inside the function.
- Produces: `IO.writeMarket(file: string, market: object, opts: {seeds, today?, force?}) → { doc, errors, warnings }`. It throws an `Error` with `.codes: string[]` (for example `['E50']`, `['E51']`, `['E27']`) and never writes when it fails. `force` bypasses gate errors except E50 and E51.

- [ ] **Step 1: Write the failing test** — append to `test/v3/io.test.js`, immediately before its final `t.done();`. The block reuses the test's own temp `dir`:

```js
// ── Plan 3 Task 2 — IO.writeMarket (ผู้เขียนของ cron · spec §7 · R1/R6) · โฟลเดอร์ชั่วคราว dir ข้างบน (ห้ามแตะ reports/ จริง) ──
{
  const seeds = require('../../tools/seeds.json');
  const real = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS-real.json')));
  const today = '2026-09-22';
  const mf = path.join(dir, 'ZTS-market.json');
  IO.write(mf, real());
  const before = IO.read(mf);
  const market = { ...before.market, px: 73.46, priceDate: '2026-09-22', chart: { data: before.market.chart.data.slice(0, 11).concat([['ก.ย.26', 73.46]]) } };
  const bytes = (f) => fs.readFileSync(f, 'utf8');
  const strip = (x) => { const { market: _m, _sig: _s, ...rest } = x; return rest; };
  const r = IO.writeMarket(mf, market, { seeds, today });
  const after = IO.read(mf);
  t(IO.verifySig(after) && r.doc._sig === after._sig, 'writeMarket: file re-signed · returns the written doc');
  t.eq(after.market, market, 'writeMarket: market replaced verbatim');
  t.eq(strip(after), strip(before), 'writeMarket: every non-market field deep-equal');
  t.eq(IO.freshHash(after), IO.freshHash(before), 'writeMarket: freshHash unchanged ⇒ reports.json updated does not move (§8)');
  t.eq(r.errors, [], 'writeMarket: gate clean on the happy path');
  t(!fs.existsSync(mf + '.lock'), 'writeMarket: lock released');
  // gate ตก = throw + ไฟล์เดิมทุก byte (ไม่มีอะไรให้ revert)
  const b0 = bytes(mf);
  t.throws(() => IO.writeMarket(mf, { ...market, px: 0 }, { seeds, today }), /E51/, 'writeMarket: schema error → throw E51');
  t.throws(() => IO.writeMarket(mf, { ...market, px: 0 }, { seeds, today, force: true }), /E51/, 'writeMarket: --force never overrides E51');
  t.throws(() => IO.writeMarket(mf, market, { seeds, today: '2027-06-01' }), /E27/, 'writeMarket: gate error (E27 stale) → throw');
  t(bytes(mf) === b0 && !fs.existsSync(mf + '.lock'), 'writeMarket: rejected writes leave the bytes unchanged and release the lock');
  { let codes = null; try { IO.writeMarket(mf, market, { seeds, today: '2027-06-01' }); } catch (e) { codes = e.codes; }
    t.eq(codes, ['E27'], 'writeMarket: error carries .codes for the cron flag detail'); }
  const rf = IO.writeMarket(mf, market, { seeds, today: '2027-06-01', force: true });
  t(rf.errors.some((e) => e.id === 'E27') && IO.verifySig(IO.read(mf)), 'writeMarket: --force writes past a non-E50/E51 error and returns it');
  // E52 (ขา declared sotp ไม่มีตาราง) — ผ่าน schema จึงเขียนด้วย IO.write ได้ · gate ตก
  const e52 = real(); e52.legs[1].inputs.basis = 'sotp';
  const f52 = path.join(dir, 'ZTS-e52.json'); IO.write(f52, e52); const b52 = bytes(f52);
  t.throws(() => IO.writeMarket(f52, market, { seeds, today }), /E52/, 'writeMarket: E52 → throw');
  t.eq(bytes(f52), b52, 'writeMarket: E52 → bytes unchanged');
  // E50 — ไฟล์ถูกแก้มือ (_sig เดิม): ห้ามเซ็นทับแม้ --force
  const f50 = path.join(dir, 'ZTS-e50.json'); IO.write(f50, real());
  const hand = IO.read(f50); hand.prose.mos += ' แก้มือ'; fs.writeFileSync(f50, JSON.stringify(hand, null, 2) + '\n');
  const b50 = bytes(f50);
  t.throws(() => IO.writeMarket(f50, market, { seeds, today, force: true }), /E50/, 'writeMarket: hand-edited file → E50 even with --force (never re-sign a hand edit)');
  t.eq(bytes(f50), b50, 'writeMarket: E50 → bytes unchanged');
}
```

- [ ] **Step 2: Run the test to watch it fail**

```bash
node test/v3/io.test.js 2>&1 | head -3
```
Expected: `TypeError: IO.writeMarket is not a function`.

- [ ] **Step 3: Implement** — in `tools/v3/io.js`, replace the last line `module.exports = { canonical, sign, verifySig, freshHash, serialize, read, write, TOP_ORDER };` with:

```js
/** ผู้เขียนของ cron (spec §7 · Plan 3 R1): แทน `market` อย่างเดียวบนไฟล์ที่อยู่บนดิสก์ ภายใต้ lock เดียว (อ่าน-แก้-เขียนไม่มีช่องให้ writer อื่นแทรก)
 *  ลำดับ: อ่าน → verifySig ของไฟล์เดิม (ไม่ผ่าน = E50 — cron ไม่เซ็นทับงานแก้มือ) → next = {…เดิม, market} → checkDoc (gate ตัวเดียวกับ verify)
 *        → sign → writeJsonAtomic · gate ตก = throw (err.codes) ไม่เขียน
 *  opts: { seeds (ต้องมี — compute ใช้สีแบรนด์), today (ISO · ไม่ใส่ = นาฬิกาไทยของ checkDoc), force }
 *  force: เขียนต่อได้เมื่อ error ไม่มี E50/E51 (สคีมา/ลายเซ็นไม่มีวัน force — R6) · คืน { doc (ฉบับที่เขียน มี _sig), errors, warnings }
 *  ★ require test/check-v3.js แบบ lazy: check-v3 → check-reports → update-prices → (io.js) = cycle ตอนโหลด
 *  ★ ไม่มีฟิลด์ provenance/`{by}` (R1) — ทุกช่องนอก market deep-equal ⇒ freshHash เท่าเดิม ⇒ reports.json `updated` ไม่ขยับ (§8) */
function writeMarket(file, market, opts) {
  const o = opts || {};
  const name = path.basename(file);
  const fail = (codes, msg) => Object.assign(new Error(`${name}: ${msg}`), { codes });
  return LK.withLock(file, () => {
    const cur = read(file);
    if (!verifySig(cur)) throw fail(['E50'], 'E50 ลายเซ็นไม่ตรงเนื้อไฟล์ — ไฟล์ถูกแก้นอก io.js · cron ไม่เซ็นทับ (แก้ด้วย report.js export → save)');
    const { _sig, ...rest } = cur;
    const next = { ...rest, market };
    const signed = { ...next, _sig: sign(next) };
    const { checkDoc } = require('../../test/check-v3.js');
    const g = checkDoc(signed, { seeds: o.seeds, today: o.today });
    const codes = [...new Set(g.errors.map((e) => e.id))];
    if (codes.length && (!o.force || codes.some((c) => c === 'E50' || c === 'E51')))
      throw fail(codes, `gate ไม่ผ่าน ${codes.join(',')} — ไม่เขียน · ${g.errors.map((e) => `${e.id} ${e.msg}`).join(' ; ').slice(0, 400)}`);
    LK.writeJsonAtomic(file, serialize(signed));
    return { doc: signed, errors: g.errors, warnings: g.warnings };
  });
}

module.exports = { canonical, sign, verifySig, freshHash, serialize, read, write, writeMarket, TOP_ORDER };
```
Also update line 3 of the file header, `(report.js save + cron เรียกผ่านที่นี่เท่านั้น)`, to `(report.js save → write · cron → writeMarket — ผ่านที่นี่เท่านั้น)`.

- [ ] **Step 4: Run the tests to watch them pass**

```bash
node test/v3/io.test.js && rtk proxy node test/v3-test.js | grep -E "^✗" ; echo "exit=$?"
```
Expected: `✓ io: 31/31`, then no `✗` lines (grep exits 1 → `exit=1`).

- [ ] **Step 5: Commit**

```bash
git add tools/v3/io.js test/v3/io.test.js
git commit -m "feat(v3): IO.writeMarket — cron writer under one lock (verifySig → market → checkDoc → sign · Plan 3 R1/R6)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The v3 lane in `update-prices.js` (R4–R8, R10) and removal of the P4 guard

**Files:**
- Modify: `tools/update-prices.js` — header docblock (before ` * ใช้:  node tools/update-prices.js …` :33); requires (after the `MK` line from Task 1); replace the P4 guard block :880–896 (`v3Refusal` · `v3SweepNotice` · `v3Guard` with their comments; keep `onlyFromArgv` :877–879); `healDerived` file list :913–914; `main()` :977–1202 (seven substitutions listed in Step 4); `module.exports` :1215
- Create: `test/v3/cron.test.js`
- Modify tests that pinned the P4 refusal: `test/v3/scanners-cron.test.js` :19–42 · `test/update-prices-test.js` :30 · `test/queue-test.js` :1570 (label only)

**Interfaces:**
- Consumes: `MK.*` (Task 1), `IO.writeMarket` `IO.read` `IO.sign` `IO.verifySig` (Task 2), `checkDoc` (lazy), and the existing `decide` `currencyMatches` `detectMixedBasis` `buildChartData` `fetchChart` `toYahooSymbol` `isIntradayQuote` `commitFlags` `commitBody` `RS.list` `RS.kindOf`.
- Produces (all exported from `tools/update-prices.js`):
  - `healV3Refusal(only: Set, isV3: (sym)=>bool) → string|null`
  - `preSkip(q, symbol, {allowIntraday, deadAlready: Set, alive, nowSec?}) → 'intraday'|'dead'|null`
  - `evaluatedOf(entries: RS.list[], intraday: string[]) → Set<symbol>`
  - `async chartFor(symbol, currency, q) → {data|null, src: '1mo'|'1wk'|'old-chart', bars, gmtoffset}`
  - `planV3(prevDoc, q, chart, {force, seeds, today?, nowSec?}) → {kind: 'unchanged'|'freeze'|'write', symbol, priceDate, reportPrice, marketPrice, diffPct, chartSrc, reason?, detail?, next?, view?, warnings?, forced?, drift?}`
  - `applyV3(file, plan, {write, seeds, today?, force}) → {kind, line, flag?, row?}`
  - `v3LaneLine(counts) → string` (contains `v3-lane: N`)
  - **Removed:** `v3Refusal`, `v3SweepNotice`, `v3Guard`.

- [ ] **Step 1: Write the failing test** — create `test/v3/cron.test.js`:

```js
'use strict';
// Plan 3 Task 3 — สาย v3 ของ cron (spec §7 · rulings R4–R8 · R10) · ส่วนบริสุทธิ์ของ tools/update-prices.js (planV3/applyV3/preSkip/evaluatedOf)
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามแตะ reports/ จริง · ไม่ยิง network (quote จำลอง) · ใบจำลองเขียนผ่าน IO.write เท่านั้น
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('cron');
const U = require('../../tools/update-prices.js');
const IO = require('../../tools/v3/io.js');
const RS = require('../../tools/report-source.js');
const CV = require('../check-v3.js');
const seeds = require('../../tools/seeds.json');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, '..', 'fixtures');
const real = () => JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS-real.json')));   // FV 85 · px 71.33 · priceDate 2026-09-21
const resign = (d) => { const { _sig, ...rest } = d; return { ...rest, _sig: IO.sign(rest) }; };
const withPx = (px) => { const d = real(); d.market.px = px; return resign(d); };
const mid = (i) => Date.UTC(2025, 9 + i, 15) / 1000;
const T22 = Date.UTC(2026, 8, 22, 20, 0, 0) / 1000;   // 22 ก.ย. 69 16:00 ET = ราคาปิดของ session ใหม่ (หลัง priceDate 21 ก.ย.)
const NOW = T22 + 3600;
const today = '2026-09-22';
const quote = (price, over) => ({ price, currency: 'USD', marketTime: T22, gmtoffset: -4 * 3600, regularStart: T22 - 23400, regularEnd: T22,
  week52Low: 70.26, week52High: 148.79, bars: real().market.chart.data.map((p, i) => ({ ts: mid(i), close: p[1] })), ...over });
const chartOf = (q) => ({ data: U.buildChartData(q.bars, q.price, q.gmtoffset), src: '1mo', bars: q.bars, gmtoffset: q.gmtoffset });
const plan = (doc, q, over) => U.planV3(doc, q, chartOf(q), { seeds, today, nowSec: NOW, ...over });
const strip = (d) => { const { market, _sig, ...x } = d; return x; };

// ── happy path (R3/R4 + §8) ──
{ const prev = real(), p = plan(prev, quote(73.456)), m = p.next && p.next.market;
  t.eq(p.kind, 'write', 'happy: write');
  t.eq([m.px, m.priceDate], [73.46, '2026-09-22'], 'happy: px 2dp · ISO market-local date');
  t(m.chart.data.length <= 13 && m.chart.data[m.chart.data.length - 1][1] === 73.46, 'happy: chart ≤ 13 points, last point = px');
  t.eq(m.range52w, { lo: 70.26, hi: 148.79 }, 'happy: range52w from Yahoo 52wk');
  t.eq(m.chgSuffix, prev.market.chgSuffix, 'happy: chgSuffix kept');
  t(IO.verifySig(p.next), 'happy: next doc is signed');
  t.eq(IO.freshHash(p.next), IO.freshHash(prev), 'happy: freshHash equal ⇒ updated does not move');
  t.eq(strip(p.next), strip(prev), 'happy: every non-market field deep-equal');
  t.eq(CV.checkDoc(p.next, { seeds, today: m.priceDate }).errors, [], 'happy: checkDoc clean with today = priceDate');
  t.eq([p.reportPrice, p.marketPrice, p.diffPct], [71.33, 73.46, 3], 'happy: log/commit-body numbers'); }
{ const p = plan(real(), quote(73, { week52Low: undefined }));
  t(p.kind === 'write' && JSON.stringify(p.next.market.range52w) === JSON.stringify(real().market.range52w), 'Yahoo 52wk missing → prev range52w kept, still writes (no E51)'); }

// ── R5: ไม่มี session ใหม่ ──
{ const T21 = Date.UTC(2026, 8, 21, 20, 0, 0) / 1000;
  t.eq(plan(real(), quote(71.33, { marketTime: T21, regularEnd: T21, regularStart: T21 - 23400 })).kind, 'unchanged', 'R5: same priceDate + same px (ICC case) → unchanged: no write, no flag');
  t.eq(plan(real(), quote(71.33, { marketTime: T21 - 3 * 86400 })).kind, 'unchanged', 'R5: quote older than priceDate, same px → unchanged (priceDate never moves back)'); }

// ── freeze (R4 — decide() บน FV จาก view) ──
t.eq(plan(real(), quote(73, { currency: 'THB' })).reason, 'currency-mismatch', 'freeze: currency ≠ doc.currency');
t.eq(plan(real(), quote(71.33 * 1.16)).reason, 'drift-gt-15pct', 'freeze: drift 16%');
t.eq(plan(real(), quote(71.33 * 1.26)).reason, 'suspect-split-or-data', 'freeze: 26% → suspect-split-or-data');
t.eq(plan(withPx(80), quote(88)).reason, 'mos-sign-flip', 'freeze: MOS +5.9 → −3.5 (old outside ±5) → mos-sign-flip');
t.eq(plan(withPx(82), quote(86)).kind, 'write', 'dead-band: MOS +3.5 → −1.2 (both inside ±5) → write');
t.eq(plan(real(), quote(71.33 * 1.2), { force: true }).kind, 'write', '--force skips drift/suspect/flip (manual pre-patch — R8)');
t.eq(plan(real(), quote(73, { currency: 'THB' }), { force: true }).reason, 'currency-mismatch', '--force never skips currency');
{ const p = plan(withPx(80), quote(84));
  t(p.kind === 'write' && p.warnings.some((w) => w.id === 'W18'), 'R6: W18 that fires only at the new price is a warning — still writes'); }

// ── bad-chart ──
{ const q = quote(73); q.bars = q.bars.map((b, i) => (i === 3 ? { ...b, close: 200 } : b));   // จุดในหน้าต่าง 52 สัปดาห์หลุดกรอบ 148.79 เกิน 10%
  const p = plan(real(), q);
  t(p.kind === 'freeze' && p.reason === 'bad-chart' && /หลุดกรอบ 52 สัปดาห์/.test(p.detail), 'freeze: mixed-basis series → bad-chart');
  const pf = plan(real(), q, { force: true }), d = pf.next && pf.next.market.chart.data;
  t(pf.kind === 'write' && pf.chartSrc === 'old-chart(bad-chart)' && JSON.stringify(d.slice(0, 11)) === JSON.stringify(real().market.chart.data.slice(0, 11)) && d[11][1] === 73,
    '--force + bad-chart → price-only: old chart kept, last point = new px'); }

// ── กราฟรายสัปดาห์ (Yahoo รายเดือนไม่พอจุด) ──
{ const wk = Array.from({ length: 9 }, (_, i) => ({ ts: Date.UTC(2026, 7, 3 + i * 7) / 1000, close: 70 + i }));
  const q = quote(73), p = U.planV3(real(), q, { data: U.buildChartData(wk, q.price, q.gmtoffset), src: '1wk', bars: wk, gmtoffset: q.gmtoffset }, { seeds, today, nowSec: NOW });
  const d = p.next && p.next.market.chart.data;
  t(p.kind === 'write' && p.chartSrc === '1wk' && d.length === 2 && d[0][0] === 'ส.ค.26' && d[1][0] === 'ก.ย.26' && d[1][1] === 73,
    'weekly fallback: month-grouped series, labels "ส.ค.26"/"ก.ย.26", last = px'); }
t.eq(U.planV3(real(), quote(73), { data: null, src: 'old-chart', bars: [], gmtoffset: -4 * 3600 }, { seeds, today, nowSec: NOW }).next.market.chart.data.length, 12, 'no chart at all → price-only on the old chart');

// ── patch-rejected (R6: gate ก่อนเขียน · ไม่มีอะไรให้ revert) ──
{ const fut = quote(73, { marketTime: Date.UTC(2026, 9, 5, 20, 0, 0) / 1000 });   // priceDate 5 ต.ค. — today 22 ก.ย. ⇒ อนาคต 13 วัน = E27 บนใบใหม่เท่านั้น
  const p = plan(real(), fut);
  t(p.kind === 'freeze' && p.reason === 'patch-rejected' && /^E27 \(patch ทำให้ตก\)/.test(p.detail), 'patch-rejected: the new market fails the gate → freeze, "patch ทำให้ตก"'); }
{ const p = plan(real(), quote(73), { today: '2027-06-01' });   // ใบเดิมก็เก่าเกิน 120 วันอยู่แล้ว
  t(p.kind === 'freeze' && /^E27 \(ค้างก่อน patch\)/.test(p.detail), 'patch-rejected: same code on the old doc → "(ค้างก่อน patch)"');
  const pf = plan(real(), quote(73), { today: '2027-06-01', force: true });
  t(pf.kind === 'write' && /E27/.test(pf.forced || ''), 'R6: --force writes past a non-E50/E51 gate error (flagged in .forced)'); }
{ const bad = real(); bad.prose.mos += ' {{rd:px}}';   // ไวยากรณ์ v2 ในใบ v3 = E51
  const p = plan(resign(bad), quote(73), { force: true });
  t(p.kind === 'freeze' && p.reason === 'patch-rejected' && /E51/.test(p.detail), 'R6: E51 is never forced'); }
{ const hand = real(); hand.prose.mos += ' แก้มือ';   // _sig เดิม ⇒ ลายเซ็นไม่ตรง
  const p = plan(hand, quote(73), { force: true });
  t(p.kind === 'freeze' && /^E50/.test(p.detail), 'R6: E50 (hand edit) is never forced — cron never re-signs a hand edit'); }

// ── preSkip (v2 + v3 ด่านเดียวกัน) ──
{ const open = quote(73, { regularStart: T22 - 3600, regularEnd: T22 + 3600 });
  const o = { allowIntraday: false, deadAlready: new Set(), alive: false, nowSec: T22 };
  t.eq(U.preSkip(open, 'ZTS', o), 'intraday', 'preSkip: market still open → intraday');
  t.eq(U.preSkip(open, 'ZTS', { ...o, allowIntraday: true }), null, 'preSkip: --allow-intraday/--force/--alive → no intraday skip');
  t.eq(U.preSkip(quote(73), 'ZTS', { ...o, deadAlready: new Set(['ZTS']), nowSec: NOW }), 'dead', 'preSkip: not-on-exchange → dead');
  t.eq(U.preSkip(quote(73), 'ZTS', { ...o, deadAlready: new Set(['ZTS']), alive: true, nowSec: NOW }), null, 'preSkip: --alive overrides dead'); }

// ── applyV3 + flags บนดิสก์ (โฟลเดอร์ชั่วคราว) ──
let tmp, fdir;
try {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-cron-'));
  fdir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-cron-flags-'));   // price-flags.json แยกโฟลเดอร์ — .json ใน tmp จะถูกนับเป็นใบ v3
  const zf = path.join(tmp, 'ZTS.json');
  IO.write(zf, real());
  fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'AAPL.html'));
  const bytes = () => fs.readFileSync(zf, 'utf8');
  const b0 = bytes();
  const opt = { seeds, today };
  const dry = U.applyV3(zf, plan(IO.read(zf), quote(73.456)), { ...opt, write: false });
  t(dry.kind === 'write' && bytes() === b0 && /^· ZTS/.test(dry.line), 'dry-run: plan says write, file bytes unchanged');
  const fz = U.applyV3(zf, plan(IO.read(zf), quote(71.33 * 1.16)), { ...opt, write: true });
  t(fz.kind === 'freeze' && fz.flag.reason === 'drift-gt-15pct' && bytes() === b0, 'freeze: flag row, bytes unchanged');
  const rj = U.applyV3(zf, plan(IO.read(zf), quote(73, { marketTime: Date.UTC(2026, 9, 5, 20, 0, 0) / 1000 })), { ...opt, write: true });
  t(rj.kind === 'freeze' && rj.flag.reason === 'patch-rejected' && /E27/.test(rj.flag.detail) && bytes() === b0, 'patch-rejected: flag row with detail, bytes unchanged');
  const un = U.applyV3(zf, plan(IO.read(zf), quote(71.33, { marketTime: Date.UTC(2026, 8, 21, 20, 0, 0) / 1000 })), { ...opt, write: true });
  t(un.kind === 'unchanged' && bytes() === b0, 'unchanged: no write');
  const w = U.applyV3(zf, plan(IO.read(zf), quote(73.456)), { ...opt, write: true });
  const after = IO.read(zf);
  t(w.kind === 'write' && after.market.px === 73.46 && IO.verifySig(after) && /^✓ ZTS/.test(w.line), 'write: IO.writeMarket wrote the new market, signature valid');
  t.eq(w.row, { symbol: 'ZTS', old: 71.33, new: 73.46, diffPct: 3 }, 'write: commit-body row has the v2 shape');
  const body = U.commitBody([w.row], [fz.flag]);
  t(body.includes('ZTS 71.33 → 73.46 (+3%)') && body.includes('freeze ZTS [drift-gt-15pct] 71.33 → 82.74 (+16%)'), 'commitBody lists v3 rows like v2 rows');
  // ไฟล์ถูกแก้มือระหว่าง plan กับ write → writeMarket ปฏิเสธ E50 → patch-rejected ไม่ throw ไฟล์เดิมทุก byte
  const pl = plan(IO.read(zf), quote(74));
  const hand = IO.read(zf); hand.prose.mos += ' แก้มือ'; fs.writeFileSync(zf, JSON.stringify(hand, null, 2) + '\n');
  const b1 = bytes();
  const rr = U.applyV3(zf, pl, { ...opt, write: true });
  t(rr.kind === 'freeze' && rr.flag.reason === 'patch-rejected' && /E50/.test(rr.flag.detail) && bytes() === b1, 'write-time E50 (file changed under us) → patch-rejected, bytes unchanged');
  IO.write(zf, real());   // คืนใบที่ลายเซ็นถูกให้เทสถัดไป
  // R7: evaluated รวมใบ v3 → flag เก่าของใบ v3 เคลียร์ได้ · ใบที่ข้ามเพราะตลาดเปิดคง flag
  const entries = RS.list(tmp);
  t.eq([...U.evaluatedOf(entries, [])].sort(), ['AAPL', 'ZTS'], 'R7: evaluated includes v3 symbols');
  t.eq([...U.evaluatedOf(entries, ['ZTS'])], ['AAPL'], 'intraday-skipped v3 symbol is not evaluated');
  const ff = path.join(fdir, 'price-flags.json');
  fs.writeFileSync(ff, JSON.stringify([{ symbol: 'ZTS', reason: 'drift-gt-15pct', flaggedAt: '2026-09-20' }]));
  const cf = { file: ff, write: false, frozenAll: [], failed: [], quietSyms: new Set(), aliveConfirmed: new Set(), reportExists: RS.symbols(tmp) };
  t.eq(U.commitFlags({ ...cf, evaluated: U.evaluatedOf(entries, []) }), [], 'R7: an old v3 flag clears once the v3 report is evaluated clean');
  t.eq(U.commitFlags({ ...cf, evaluated: U.evaluatedOf(entries, ['ZTS']) }).map((f) => f.symbol), ['ZTS'], 'intraday-skipped v3 keeps its flag');
  // --heal-derived (R7)
  const isV3 = (s) => RS.kindOf(s, tmp) === 'v3';
  t(/ZTS/.test(U.healV3Refusal(new Set(['ZTS']), isV3) || ''), '--heal-derived <v3> → refusal (main exits 1)');
  { const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
    try { U.healDerived({ dir: tmp, only: new Set(), write: false, prose: false }); } finally { console.log = orig; }
    t(logs.some((l) => /heal-derived ข้าม 1 ใบ v3/.test(l)) && !logs.some((l) => /⛔ ZTS/.test(l)), 'heal-derived sweep: v3 skipped with a count line (never parsed as HTML)'); }
} finally { for (const d of [tmp, fdir]) if (d) fs.rmSync(d, { recursive: true, force: true }); }

// ── บรรทัดสรุป + #49 residue ──
t(/(^|\s)v3-lane: 2 ใบ/.test(U.v3LaneLine({ n: 2, write: 1, unchanged: 1, freeze: 0, intraday: 0, dead: 0 })), 'summary token "v3-lane: N" (grep in the Actions log — R11 f)');
{ const src = fs.readFileSync(path.join(ROOT, 'tools', 'update-prices.js'), 'utf8');
  t(!src.includes('/\\.html$/i.test(f)'), '#49 residue closed: no .html-only readdir filter left in update-prices.js');
  t(!/\bv3Guard\b|\bv3SweepNotice\b|\bv3Refusal\b/.test(src), 'v3Guard/v3Refusal/v3SweepNotice removed from update-prices.js'); }

t.done();
```

Replace `test/v3/scanners-cron.test.js` lines 19–42 (from `  // update-prices — ราคาใบ v3 แช่แข็งจน P5 แต่ห้ามเงียบ (#62)` through the line ending `'--write --force reports/ZTS.html (ใบเป็น v3) → code 1');`, which is everything before `  // fix 3b: wiring ของ main`) with:

```js
  // update-prices — Plan 3 (P5): ใบ v3 เข้าสาย cron แล้ว (v3Guard/v3Refusal/v3SweepNotice ถูกถอด · test/v3/cron.test.js คุมสาย v3)
  //   ที่เหลือของ guard เดิม = --heal-derived <v3> exit 1 (R7 · ห้าม exit 0 เงียบ)
  const U = require('../../tools/update-prices.js');
  const isV3 = (s) => RS.kindOf(s, tmp) === 'v3';
  t(U.v3Guard === undefined && U.v3Refusal === undefined && U.v3SweepNotice === undefined, 'update-prices: P4 guard removed (v3 lane shipped in Plan 3)');
  const msg = U.healV3Refusal(new Set(['AAPL', 'ZTS']), isV3) || '';
  t(/ZTS/.test(msg) && !/AAPL/.test(msg) && /--heal-derived/.test(msg), 'update-prices: --heal-derived <v3> → refusal naming it (exit 1 in main · R7)');
  t.eq(U.healV3Refusal(new Set(['AAPL']), isV3), null, 'update-prices: --heal-derived <v2> → no refusal');
  t.eq(U.healV3Refusal(new Set(), isV3), null, 'update-prices: --heal-derived sweep → no refusal (v3 skipped with a count line)');
  t.eq([...U.onlyFromArgv(['--write', '--force', 'zts.json', 'aapl.html', 'KBANK'])], ['ZTS', 'AAPL', 'KBANK'], 'onlyFromArgv: flags dropped, .json/.html stripped, upper-case');
  t(RS.symbols(tmp).has('ZTS'), 'reportExists = RS.symbols keeps flags of v3 reports');
  // fix 1: สั่งเป็น path (reports/zts.json · reports/ZTS.html) ต้องได้ symbol เดียวกัน → เจอ guard ไม่ใช่ no-op เงียบ
  t.eq([...U.onlyFromArgv(['--write', '--force', 'reports/zts.json', './reports/AAPL.html', path.join(tmp, 'ZTS.html')])], ['ZTS', 'AAPL'], 'onlyFromArgv: path forms → basename symbol');
  t(U.healV3Refusal(U.onlyFromArgv(['--heal-derived', 'reports/zts.json']), isV3) !== null, '--heal-derived reports/zts.json → refusal (path form reaches the guard)');
```

Replace `test/update-prices-test.js` line 30 with:
```js
ok(U.healV3Refusal(new Set(['X']), () => true) && U.healV3Refusal(new Set(['X']), () => false) === null && U.v3Refusal === undefined, 'healV3Refusal: --heal-derived ปฏิเสธเฉพาะใบ v3 · v3Refusal ถูกถอด (Plan 3 · R7)');
```

In `test/queue-test.js` line 1570, change only the label string `'v3/preflight: ใบ v3 ไม่เข้า pre-patch (v3 cron = Plan 3) · ใบ v2 เข้าเหมือนเดิม'` to `'v3/preflight: ใบ v3 ไม่เข้า pre-patch อัตโนมัติ (P6 · pre-patch มือ = update-prices --write --force — Plan 3 R8) · ใบ v2 เข้าเหมือนเดิม'`. The assertion itself does not change, because `patchTargets.skippedV3` stays until P6.

- [ ] **Step 2: Run the tests to watch them fail**

```bash
node test/v3/cron.test.js 2>&1 | head -3; node test/v3/scanners-cron.test.js 2>&1 | tail -2; node test/update-prices-test.js 2>&1 | tail -2
```
Expected: `TypeError: U.planV3 is not a function` · `✗ [scanners-cron] update-prices: P4 guard removed …` (plus the `healV3Refusal is not a function` TypeError) · `U.healV3Refusal is not a function` from update-prices-test.

- [ ] **Step 3: New functions** — in `tools/update-prices.js`:

(a) Add two lines after the `MK` require from Task 1:
```js
const IO = require('./v3/io.js');       // Plan 3 (R1): ผู้เขียนใบ v3 ของ cron = IO.writeMarket (lock เดียว · gate ก่อนเขียน)
const SEEDS_FILE = path.join(__dirname, 'seeds.json');   // compute ของใบ v3 ใช้ seed สีแบรนด์ (themeOf) — อ่านครั้งเดียวต่อรอบ
```
(b) Add a paragraph to the header docblock, immediately before the line ` * ใช้:  node tools/update-prices.js [--write] [--force] [--allow-intraday] [SYMBOL ...]`:
```js
 * ใบ v3 (reports/*.json · Plan 3 P5 · spec §7): เขียน market.* อย่างเดียว (planV3 → applyV3 → IO.writeMarket — gate ก่อนเขียนใต้ lock เดียว)
 *   ค่าที่ derive จากราคาทั้งหมด compute ตอน build · freeze เกณฑ์เดียวกับ v2 · ไม่มี session ใหม่ = ไม่เขียน · --force ไม่ข้าม E50/E51
 *
```
(c) Delete the P4 guard: the three doc comments and functions `v3Refusal`, `v3SweepNotice` and `v3Guard` (:880–896). Keep `onlyFromArgv` and its comment. In their place, before `// ---------- main ----------`, insert:

```js
/** --heal-derived ที่ระบุ symbol ใบ v3 → ข้อความปฏิเสธ (main exit 1) · null = ไม่มี (ส่วนบริสุทธิ์ · Plan 3 R7)
 *  ใบ v3 ไม่มีค่า derive ค้างให้ซ่อม (ทุกค่าที่ผูกราคา compute ตอน build) — ปฏิเสธดัง ๆ ดีกว่า exit 0 เงียบ (บทเรียน #62) */
function healV3Refusal(only, isV3) {
  const hit = [...only].filter((s) => isV3(s));
  return hit.length ? `✗ ${hit.join(' ')} เป็นใบ v3 (reports/<SYM>.json) — --heal-derived ไม่มีอะไรให้ซ่อม: ค่าที่ derive จากราคาของใบ v3 compute ตอน build ทุกค่า (spec §7)` : null;
}

/** ด่านก่อนตัดสิน — v2 และ v3 ใช้ตัวเดียวกัน (ส่วนบริสุทธิ์ · Plan 3 R10: แยกออกจาก main ให้เทสเรียกตรง)
 *  'intraday' = ตลาดของตัวนั้นยังเปิด → ข้ามทั้งตัว **ก่อน** quotes.push และไม่เข้า evaluated (flag เดิมคงอยู่)
 *  'dead' = ติด not-on-exchange อยู่และไม่ได้สั่ง --alive → ข้าม patch (ผู้เรียก push quote ให้ canary ก่อนแล้ว)
 *  null = ไปต่อ · o = { allowIntraday, deadAlready: Set, alive, nowSec? } */
function preSkip(q, symbol, o) {
  if (!o.allowIntraday && isIntradayQuote({ marketTime: q.marketTime, regularStart: q.regularStart, regularEnd: q.regularEnd, nowSec: o.nowSec })) return 'intraday';
  if (o.deadAlready.has(symbol) && !o.alive) return 'dead';
  return null;
}
/** symbol ที่ "ตัดสินแล้วรอบนี้" = ทุกใบในรอบ (v2 + v3 · R7) ลบตัวที่ข้ามเพราะตลาดเปิด — mergeFlags เคลียร์ flag ของ symbol ใน set นี้ที่ไม่มี freeze รอบนี้
 *  (ใบ v3 ต้องอยู่ในนี้ ไม่งั้น flag เก่าของใบ v3 ไม่มีวันเคลียร์) */
const evaluatedOf = (entries, intraday) => new Set(entries.map((e) => e.symbol).filter((s) => !intraday.includes(s)));

/** กราฟของรอบนี้ (v2 + v3 ใช้ร่วม): รายเดือนจาก quote → ไม่พอจุด (ประวัติสั้น/Yahoo ล้างประวัติ — เคส BK) = ยิงรายสัปดาห์
 *  → ยังไม่ได้ = data null (price-only บนกราฟเดิม) · คืน bars/gmtoffset ชุดที่สร้างกราฟด้วย — detectMixedBasis ต้องตรวจ "ซีรีส์ที่ใช้จริง"
 *  (ย้ายออกจาก main ทุก byte เดิม — Plan 3 R10) */
async function chartFor(symbol, currency, q) {
  try { return { data: buildChartData(q.bars, q.price, q.gmtoffset), src: '1mo', bars: q.bars, gmtoffset: q.gmtoffset }; }
  catch (e1) {
    try {
      const qw = await fetchChart(toYahooSymbol(symbol, currency), 0, '1wk');
      await sleep(FETCH_DELAY_MS);
      return { data: buildChartData(qw.bars, q.price, qw.gmtoffset), src: '1wk', bars: qw.bars, gmtoffset: qw.gmtoffset };
    } catch (e2) { return { data: null, src: 'old-chart', bars: [], gmtoffset: q.gmtoffset }; }
  }
}

/** สาย v3 ต่อใบ (ส่วนบริสุทธิ์ · spec §7 · Plan 3 R4/R5/R6/R10) — ตัดสินจาก doc เดิม + quote + กราฟของรอบนี้ ไม่แตะดิสก์
 *  chart = ผลของ chartFor ({ data|null, src, bars, gmtoffset }) · opts = { force, seeds, today?, nowSec? }
 *  คืน { kind: 'unchanged'|'freeze'|'write', symbol, priceDate, reportPrice, marketPrice, diffPct, chartSrc, reason?, detail?, next?, view?, warnings?, forced? }
 *  ลำดับ: ลายเซ็นใบเดิม (E50 ห้าม force) → gate ใบเดิม (ต้อง compute ได้จึงรู้ FV) → decide() บน FV จาก view (FV ไม่ขึ้นกับราคา = คำตอบเดียวกับ v2)
 *        → ไม่มี session ใหม่ = unchanged (R5 · ICC) → bad-chart (--force = price-only) → marketFromQuote → gate ใบใหม่ในหน่วยความจำ
 *        (ตก = patch-rejected ไม่เขียน · --force ผ่านได้เฉพาะเมื่อไม่มี E50/E51 — R6) */
function planV3(prev, q, chart, opts) {
  const o = opts || {};
  const { checkDoc } = require('../test/check-v3.js');   // lazy: check-v3 → check-reports → ไฟล์นี้ = cycle ตอนโหลด
  const reportPrice = prev.market.px, marketPrice = round(q.price, 2);
  const diffPct = reportPrice > 0 && Number.isFinite(q.price) ? round((q.price - reportPrice) / reportPrice * 100, 1) : null;
  const base = { symbol: prev.symbol, priceDate: prev.market.priceDate, reportPrice, marketPrice, diffPct, chartSrc: chart ? chart.src : 'old-chart' };
  const reject = (detail) => ({ ...base, kind: 'freeze', reason: 'patch-rejected', detail });
  const errText = (errs) => errs.map((x) => `${x.id} ${x.msg}`).join(' ; ').slice(0, 300);
  if (!IO.verifySig(prev)) return reject('E50 (ค้างก่อน patch) — ลายเซ็นไม่ตรงเนื้อไฟล์ (แก้นอก io.js) · cron ไม่เซ็นทับงานแก้มือ · แก้ด้วย report.js export → save');
  const gOpt = { seeds: o.seeds, today: o.today };
  const pre = checkDoc(prev, gOpt);
  const preCodes = [...new Set(pre.errors.map((x) => x.id))];
  if (!pre.view) return reject(`${preCodes.join(',')} (ค้างก่อน patch) — ${errText(pre.errors)}`);
  const d = decide({ oldPrice: reportPrice, newPrice: q.price, fv: pre.view.rd.fv, currencyOk: currencyMatches(q.currency, prev.currency), force: !!o.force });
  if (d.freeze) return { ...base, kind: 'freeze', reason: d.freeze };
  // R5: ไม่มี session ใหม่ (หุ้นสภาพคล่องต่ำ — marketTime ค้างที่วันซื้อขายล่าสุด) = ไม่เขียน ไม่ flag · priceDate ไม่ถอยหลัง
  if (MK.quoteDate(q) <= prev.market.priceDate && marketPrice === reportPrice) return { ...base, kind: 'unchanged' };
  let priceOnly = false;
  const basis = detectMixedBasis({ bars: chart ? chart.bars : [], low: q.week52Low, high: q.week52High, gmtoffset: chart ? chart.gmtoffset : q.gmtoffset, nowSec: o.nowSec });
  if (basis.mixed) {
    if (!o.force) return { ...base, kind: 'freeze', reason: 'bad-chart', detail: basis.text };
    priceOnly = true; base.chartSrc = 'old-chart(bad-chart)';   // --force: ประทับราคา/วันที่ได้ แต่ห้ามเขียนกราฟจากซีรีส์ผสมสองฐาน
  }
  let market;
  try { market = MK.marketFromQuote(prev.market, q, chart ? chart.data : null, { priceOnly }); }
  catch (e) { return { ...base, kind: 'freeze', reason: 'patch-failed', detail: e.message }; }
  const { _sig, ...rest } = prev;
  const unsigned = { ...rest, market };
  const next = { ...unsigned, _sig: IO.sign(unsigned) };
  const g = checkDoc(next, gOpt);
  const codes = [...new Set(g.errors.map((x) => x.id))];
  let forced = null;
  if (codes.length) {
    const preExisting = codes.every((c) => preCodes.includes(c));
    const detail = `${codes.join(',')}${preExisting ? ' (ค้างก่อน patch)' : ' (patch ทำให้ตก)'} — ${errText(g.errors)}`;
    if (!o.force || codes.some((c) => c === 'E50' || c === 'E51')) return reject(detail);
    forced = detail;
  }
  return { ...base, kind: 'write', next, view: g.view, warnings: g.warnings, forced, drift: d.drift };
}

/** ผลของ planV3 → ดิสก์ + บรรทัด log (Plan 3 R1/R10) · write จริงผ่าน IO.writeMarket (gate ซ้ำใต้ lock เดียว)
 *  opts = { write, seeds, today?, force } · คืน { kind, line, flag? (แถว price-flags รูปเดียวกับ v2), row? (บรรทัด commit body) }
 *  เขียนไม่สำเร็จ (ไฟล์เปลี่ยนระหว่างรอบ/gate ใต้ lock ตก/รอ lock เกิน) = freeze patch-rejected ไม่ throw — ไฟล์เดิมทุก byte */
function applyV3(file, plan, opts) {
  const o = opts || {};
  const S = String(plan.symbol).padEnd(10);
  const pct = (x) => (x == null ? '-' : `${x > 0 ? '+' : ''}${x}%`);
  const flagOf = (p) => ({ symbol: p.symbol, reason: p.reason, ...(p.detail ? { detail: p.detail } : {}), reportPrice: p.reportPrice, marketPrice: p.marketPrice, diffPct: p.diffPct });
  if (plan.kind === 'unchanged') return { kind: 'unchanged', line: `= ${S} v3 ไม่มี session ใหม่ — ${plan.reportPrice} @${plan.priceDate} เท่าเดิม ไม่เขียน` };
  if (plan.kind === 'freeze') {
    const tail = plan.detail ? `${plan.detail.slice(0, 160)} — ไม่เขียนไฟล์` : `${plan.reportPrice} → ${plan.marketPrice} (${pct(plan.diffPct)})`;
    return { kind: 'freeze', flag: flagOf(plan), line: `❄ ${S} freeze [${plan.reason}] ${tail}` };
  }
  if (o.write) {
    try { IO.writeMarket(file, plan.next.market, { seeds: o.seeds, today: o.today, force: o.force }); }
    catch (e) {
      const p = { ...plan, reason: 'patch-rejected', detail: `${(e.codes || ['WRITE']).join(',')} (ตอนเขียนใต้ lock) — ${e.message}`.slice(0, 400) };
      return { kind: 'freeze', flag: flagOf(p), line: `❄ ${S} freeze [patch-rejected] ตอนเขียน — ${e.message.slice(0, 160)} · ไม่เขียนไฟล์` };
    }
  }
  const mos = plan.view && plan.view.sm ? plan.view.sm.mos : '?';
  return {
    kind: 'write', row: { symbol: plan.symbol, old: plan.reportPrice, new: plan.marketPrice, diffPct: plan.diffPct },
    line: `${o.write ? '✓' : '·'} ${S} ${plan.reportPrice} → ${plan.marketPrice} (${pct(plan.diffPct)}) · v3 market @${plan.next.market.priceDate} · MOS ${mos}%`
      + `${plan.chartSrc !== '1mo' ? ` · chart:${plan.chartSrc}` : ''}${plan.forced ? ` · ⚠ --force เขียนทั้งที่ gate ตก ${plan.forced.slice(0, 120)} — npm run verify จะไม่ผ่านจนกว่าจะแก้` : ''}`,
  };
}
/** บรรทัดสรุปสาย v3 ต่อรอบ — token คงที่ `v3-lane: N` ให้ grep ใน log ของ Actions (แทน `v3-skipped: N` ของ P4 · ใช้ตรวจ R11 f) */
const v3LaneLine = (c) => `ℹ v3-lane: ${c.n} ใบ · อัปเดต ${c.write} · ไม่เปลี่ยน ${c.unchanged} · freeze ${c.freeze} · ข้ามเพราะตลาดเปิด ${c.intraday} · ข้าม not-on-exchange ${c.dead}`;
```

- [ ] **Step 4: Wire `healDerived` and `main()`** — seven substitutions in `tools/update-prices.js`. Each "old" text occurs exactly once in the file; check with `rtk proxy grep -c`.

(1) `healDerived` — replace
```js
  const files = fs.readdirSync(dir).filter((f) => /\.html$/i.test(f)).sort()
    .filter((f) => !opts.only.size || opts.only.has(f.replace(/\.html$/i, '').toUpperCase()));
```
with
```js
  // ใบ v2 + v3 ผ่าน report-source (Plan 3 · R7 · ปิด residue #49) — ใบ v3 ไม่มีค่า derive ค้างให้ซ่อม (compute ตอน build) ⇒ ข้ามพร้อมบรรทัดนับ
  const all = RS.list(dir).filter((e) => !opts.only.size || opts.only.has(e.symbol.toUpperCase()));
  const v3Skipped = all.filter((e) => e.v3).length;
  const files = all.filter((e) => !e.v3).map((e) => e.name);
  if (v3Skipped) console.log(`ℹ heal-derived ข้าม ${v3Skipped} ใบ v3 (ค่าที่ derive จากราคาของใบ v3 compute ตอน build — ไม่มีอะไรให้ซ่อม)`);
```

(2) The `main()` guard — replace
```js
  const ONLY = onlyFromArgv(process.argv.slice(2));
  // ใบ v3 (Plan 2b · binding ruling 2 · #62): ระบุตรง ๆ = exit 1 · sweep = บรรทัดต่อใบ + สรุปจำนวน (ไม่เงียบ)
  const g = v3Guard(ONLY, (s) => RS.kindOf(s, REPORTS) === 'v3', RS.list(REPORTS).filter((e) => e.v3).map((e) => e.symbol));
  for (const l of g.lines) (g.code ? console.error : console.log)(l);
  if (g.code) { process.exitCode = g.code; return; }
  // โหมดซ่อมค่าที่ derive จากราคา — คนละทางเดินกับ cron (ไม่ fetch ไม่แตะราคา/วันที่/กราฟ/คิว flags)
  if (process.argv.includes('--heal-derived')) {
```
with
```js
  const ONLY = onlyFromArgv(process.argv.slice(2));
  // โหมดซ่อมค่าที่ derive จากราคา — คนละทางเดินกับ cron (ไม่ fetch ไม่แตะราคา/วันที่/กราฟ/คิว flags)
  if (process.argv.includes('--heal-derived')) {
    // Plan 3 (R7): ระบุใบ v3 ตรง ๆ = exit 1 (ไม่มีอะไรให้ซ่อม — ห้าม exit 0 เงียบ) · sweep ข้ามใบ v3 พร้อมบรรทัดนับ (ใน healDerived)
    const refusal = healV3Refusal(ONLY, (s) => RS.kindOf(s, REPORTS) === 'v3');
    if (refusal) { console.error(refusal); process.exitCode = 1; return; }
```
Keep the `--force` and `--alive` "must name a SYMBOL" checks as they are. `--write --force <v3>` now reaches the v3 lane (R8).

(3) The file list — replace
```js
  const files = fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).sort()
    .filter((f) => !ONLY.size || ONLY.has(f.replace(/\.html$/i, '').toUpperCase()));
```
with
```js
  // ใบ v2 + v3 (Plan 3 · R7 · ปิด residue #49): เจ้าของเดียวของ "ไฟล์ไหนคือรายงาน" = report-source (throw เมื่อหุ้นเดียวมีทั้งสองไฟล์)
  const entries = RS.list(REPORTS).filter((e) => !ONLY.size || ONLY.has(e.symbol.toUpperCase()));
  const SEEDS = JSON.parse(fs.readFileSync(SEEDS_FILE, 'utf8'));
  const v3n = { n: 0, write: 0, unchanged: 0, freeze: 0, intraday: 0, dead: 0 };   // บรรทัด v3-lane ท้ายรอบ
```
and replace `const aliveAsserted = new Set(ALIVE ? files.map((f) => f.replace(/\.html$/i, '')) : []);` with `const aliveAsserted = new Set(ALIVE ? entries.map((e) => e.symbol) : []);   // v2 + v3 (Plan 3 · R7)`.

(4) The loop head and the v3 branch. In `main()` only, not in `healDerived`, replace everything from `  for (const f of files) {` down to (but not including) the comment line `    // v2: ราคาในรายงาน = values.px (เจ้าของ) ไม่ใช่กระจก sm.price (fix wave M8 …`. This covers the loop head, the stock-meta read, the fetch/abort block and the intraday block. The replacement is:
```js
  for (const ent of entries) {
    const symbol = ent.symbol, f = ent.name;
    const fp = path.join(REPORTS, f);
    // ใบ v3 (Plan 3 · spec §7): อ่านผ่าน io.js · สกุล/ราคาเดิม = doc.currency / market.px · JSON เสีย = failed `no-stock-meta`
    //   (bucket PLUMBING เดิม — ไม่เพิ่ม reason ใหม่ให้ triage) · ใบ v2: stock-meta เหมือนเดิม
    let html = null, sm = null, doc = null;
    if (ent.v3) {
      v3n.n++;
      try { doc = IO.read(fp); }
      catch (err) { failed.push({ symbol, reason: 'no-stock-meta', detail: `v3 JSON อ่านไม่ได้: ${err.message}`.slice(0, 300) }); continue; }
    } else {
      html = fs.readFileSync(fp, 'utf8');
      sm = RM.readStockMeta(html);
      if (!sm) { failed.push({ symbol, reason: 'no-stock-meta' }); continue; }
    }
    const currency = ent.v3 ? doc.currency : sm.currency;
    // v2: ราคาในรายงาน = values.px (เจ้าของ) ไม่ใช่กระจก sm.price (fix wave M8 — กระจกค้างได้ เช่นหลัง apply-edits แก้ values.px)
    //   ใช้ทั้ง decide (drift/MOS-flip) และ reportPrice/diffPct ใน log/flag · v1 = sm.price เดิมทุก byte · v3 = market.px
    const reportPrice = ent.v3 ? doc.market.px : pxOf(html, sm);

    let q;
    try {
      q = await fetchChart(toYahooSymbol(symbol, currency));
      consecFails = 0;   // ยิงผ่าน = ต้นทางยังดี → เริ่มนับใหม่ (ยามจับ "พังติดกัน" ไม่ใช่ยอดรวมทั้งรอบ)
      await sleep(FETCH_DELAY_MS);
    } catch (e) {
      frozen.push({ symbol, reason: 'fetch-failed', detail: e.message, reportPrice, marketPrice: null, diffPct: null });
      console.log(`⚠ ${symbol.padEnd(10)} fetch fail: ${e.message}`);
      // ยกเลิกทั้งรอบเมื่อพังติดกันครบเกณฑ์ — ยิงต่อได้แต่จะได้ flag fetch-failed ผิด ๆ ทั้งรีโป
      // และ retry backoff ของ fetchChart กินงบ job จนหมดก่อนถึงตัวสุดท้าย (เช็คตรงนี้ = จับ outage
      // ที่เริ่มตอนไหนของรอบก็ได้ ไม่ใช่แค่ 20 ตัวแรกแบบยามเดิม)
      if (++consecFails >= ABORT_CONSEC_FAILS) {
        console.error(`✗ fetch พังติดกัน ${consecFails} ตัว (ล่าสุด ${symbol}) — น่าจะโดน rate-limit/ต้นทางล่ม ยกเลิกทั้งรอบ`);
        process.exit(2);
      }
      continue;
    }

    // ตลาดของตัวนี้ยังเปิด → ราคาเป็น intraday ไม่ใช่ราคาปิด: ข้ามทั้งตัว **ก่อน** quotes.push
    // เจตนา 2 อย่างของการ push ทีหลัง: (1) ไม่เอา session ที่ยังเดินอยู่ไปเป็น cohort ให้ detectStaleQuotes
    // — ตอนตลาดเปิด marketTime ของตัวที่เทรดจะนำหน้าตัวสภาพคล่องต่ำที่ยังไม่มี tick วันนี้ = FP ยกแผง
    // (รันมือกลาง session cohort จะเหลือ < STALE_MIN_COHORT เอง → ไม่วัด = ถูกต้อง)
    // (2) ไม่ freeze/ไม่เขียน flag เพราะยังไม่ได้ "ตัดสิน" อะไร — แค่เลื่อนไปรอบที่มีราคาปิดจริง
    // ★ Plan 3: ด่านนี้ + ด่าน not-on-exchange = preSkip ตัวเดียวทั้งสองสาย (ส่วนบริสุทธิ์ที่เทสเรียกตรง)
    const skip = preSkip(q, symbol, { allowIntraday: ALLOW_INTRADAY, deadAlready, alive: ALIVE });
    if (skip === 'intraday') {
      intraday.push(symbol);
      if (ent.v3) v3n.intraday++;
      console.log(`⏳ ${symbol.padEnd(10)} ข้าม — ตลาดยังเปิด (session ปิด ${new Date(q.regularEnd * 1000).toISOString().slice(11, 16)} UTC) ราคา ${round(q.price, 2)} เป็น intraday ไม่ใช่ราคาปิด · ต้องการจริงใช้ --allow-intraday`);
      continue;
    }

    // ── สาย v3 (Plan 3 · spec §7): market.* อย่างเดียว · ตัดสิน = planV3 (บริสุทธิ์) · เขียน = applyV3 → IO.writeMarket ──
    //   ไม่มี patchDerived/summaryPlan/scenarioPlan/yieldPlan/derivedPassV2/keepMap/proseTokensIfNew/mirrorStockMetaV2 — ค่าที่ derive จากราคา compute ตอน build
    if (ent.v3) {
      const diffPct = reportPrice > 0 ? round((q.price - reportPrice) / reportPrice * 100, 1) : null;
      quotes.push({ symbol, currency: q.currency || currency, marketTime: q.marketTime, gmtoffset: q.gmtoffset, reportPrice, marketPrice: round(q.price, 2), diffPct });
      if (skip === 'dead') {
        skipped.push(symbol); v3n.dead++;
        console.log(`⏸ ${symbol.padEnd(10)} ข้าม patch — ติด flag not-on-exchange อยู่ (ยืนยัน/ลบรายงาน · ถ้ายังเทรดจริงใช้ --alive)`);
        continue;
      }
      if (deadAlready.has(symbol)) console.log(`↻ ${symbol.padEnd(10)} --alive ทับ flag not-on-exchange — patch ต่อแล้วปลด flag (ยืนยันด้วยมือแล้ว)`);
      let r;
      try { r = applyV3(fp, planV3(doc, q, await chartFor(symbol, currency, q), { force: FORCE, seeds: SEEDS }), { write: WRITE, seeds: SEEDS, force: FORCE }); }
      catch (e) {   // compute/render ที่ throw นอกเหนือ gate = plumbing (เหมือน patch-failed ของ v2) — ไม่ล้มทั้งรอบ
        r = { kind: 'freeze', flag: { symbol, reason: 'patch-failed', detail: e.message, reportPrice, marketPrice: round(q.price, 2), diffPct }, line: `⚠ ${symbol.padEnd(10)} patch fail (v3): ${e.message}` };
      }
      v3n[r.kind]++;
      if (r.kind === 'write') updated.push(r.row);
      else if (r.kind === 'freeze') frozen.push(r.flag);
      else skipped.push(symbol);
      console.log(r.line);
      continue;
    }

```

(5) The rest of the v2 body. **Delete** the three lines (now declared in the loop head):
```js
    // v2: ราคาในรายงาน = values.px (เจ้าของ) ไม่ใช่กระจก sm.price (fix wave M8 — กระจกค้างได้ เช่นหลัง apply-edits แก้ values.px)
    //   ใช้ทั้ง decide (drift/MOS-flip) และ reportPrice/diffPct ใน log/flag · v1 = sm.price เดิมทุก byte
    const reportPrice = pxOf(html, sm);
```
Then replace `    if (deadAlready.has(symbol) && !ALIVE) {` with `    if (skip === 'dead') {`. The block body is unchanged.

(6) The v2 chart block — replace from the comment line `    // เดือนไม่พอจุด (ประวัติสั้น/Yahoo ล้างประวัติ — เคส BK) → ลองรายสัปดาห์ …` through the closing `    }` of the `try { chartData = buildChartData(…) } catch (e1) { … }` block with:
```js
    // เดือนไม่พอจุด (ประวัติสั้น/Yahoo ล้างประวัติ — เคส BK) → ลองรายสัปดาห์ → ยังไม่ได้ = null ให้ patchReport ใช้กราฟเดิม+จุดท้ายใหม่
    // (Plan 3: ย้ายเป็น chartFor ทุก byte เดิม — สาย v3 ใช้ตัวเดียวกัน · ต้องรู้ว่า "bars ชุดไหนสร้างกราฟนี้" เพื่อตรวจฐานราคาต่อ)
    let { data: chartData, src: chartSrc, bars: chartBars, gmtoffset: chartGmt } = await chartFor(symbol, sm.currency, q);
```
(`let` is kept: the `bad-chart` + `--force` branch below still reassigns `chartData` and `chartSrc`.)

(7) After the loop — replace `  const evaluated = new Set(files.map((f) => f.replace(/\.html$/i, '')).filter((s) => !intraday.includes(s)));` with `  const evaluated = evaluatedOf(entries, intraday);   // v2 + v3 (Plan 3 · R7)`. In the summary, replace `(ทั้งหมด ${files.length})` with `(ทั้งหมด ${entries.length})` and add, right after `console.log('\n' + line);`:
```js
  if (v3n.n) console.log(v3LaneLine(v3n));
```
Then replace ``    let mdOut = `## Price refresh\n${line}\n`;`` with ``    let mdOut = `## Price refresh\n${line}\n${v3n.n ? `${v3LaneLine(v3n)}\n` : ''}`;``.

In `module.exports`, replace `onlyFromArgv, v3Refusal, v3SweepNotice, v3Guard,` with `onlyFromArgv, healV3Refusal, preSkip, evaluatedOf, chartFor, planV3, applyV3, v3LaneLine,`.

Sanity check before running the tests:
```bash
rtk proxy grep -nE "\bfiles\b|v3Guard|v3Refusal|v3SweepNotice" tools/update-prices.js
node -e "require('./tools/update-prices.js')" && echo LOADS
```
Expected: `files` appears only inside `healDerived` (its `const files = all.filter(…)`, `for (const f of files)` and the summary line), the three removed names appear nowhere, and the second command prints `LOADS`.

- [ ] **Step 5: Run the tests to watch them pass**

```bash
node test/v3/cron.test.js && node test/v3/scanners-cron.test.js
rtk proxy node test/update-prices-test.js | tail -1 && rtk proxy node test/queue-test.js | tail -1 && rtk proxy node test/v2-path-test.js | tail -1
rtk proxy node test/v3-test.js | grep -E "^✗"; echo "no-fail=$?"
```
Expected: `✓ cron: 51/51` · `✓ scanners-cron: 21/21` · `✓ update-prices-test: 520 passed` · `queue-test: 557/557 ผ่าน` · `v2-path-test: 436/436 ผ่าน` · `no-fail=1`.

- [ ] **Step 6: Commit**

```bash
git add tools/update-prices.js test/v3/cron.test.js test/v3/scanners-cron.test.js test/update-prices-test.js test/queue-test.js
git commit -m "feat(v3): cron writes v3 market.* — planV3/applyV3 lane · RS.list loop · remove v3Guard (Plan 3 R4–R8/R10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cron gate (`check-v3`, #61) · workflow `.json` count · preflight v3 line (R8) · stale strings

**Files:**
- Modify: `package.json` (:31 `verify:cron`); run `node tools/gen-docs.js`, which rewrites the markers in `CLAUDE.md` (:110), `README.md` (:148) and `docs/price-refresh.md` (:28)
- Modify: `.github/workflows/update-prices.yml` (:1 header; :74 `n=`)
- Modify: `tools/queue/preflight.js` (:139 comment; new `v3Lines` before `parseGateFailures` :150; :301 print; exports :330)
- Modify: `tools/queue/prep.js` (:270 NEW extraBlock text), `tools/queue/ship.js` (:373 refusal text)
- Test: `test/queue-test.js` (`0b` :39 + :43; new assertion after :1570), `test/v3/cron.test.js` (append the yml block)

**Interfaces:**
- Produces: `P.v3Lines(rows) → string[]`, one line per `row.v3`:
  ``v3 <SYM>: controller → `node tools/update-prices.js --write --force <SYM>` (flip) หรือ export/save (P6 queue flow)``
- `verify:cron` = `check-reports → check-v3 → build → build-test → engine-exec → check-site`.

- [ ] **Step 1: Write the failing tests**

In `test/queue-test.js`, section `0b` (:39): replace
```js
  ok(cron.length === 5, 'verify:cron: 5 ขั้น (check-reports · build · build-test · engine-exec · check-site)', pkg.scripts['verify:cron']);
```
with
```js
  ok(cron.length === 6, 'verify:cron: 6 ขั้น (check-reports · check-v3 · build · build-test · engine-exec · check-site — check-v3 เพิ่มใน Plan 3 · #61)', pkg.scripts['verify:cron']);
```
and in the `for (const must of [...])` list (:43), insert `'node test/check-v3.js', ` right after `'node test/check-reports.js', `.

After the line-1570 assertion (the one whose label you changed in Task 3), insert:
```js
    ok(JSON.stringify(P.v3Lines(rows)) === JSON.stringify(['v3 ZTS: controller → `node tools/update-prices.js --write --force ZTS` (flip) หรือ export/save (P6 queue flow)']),
      'v3/preflight (Plan 3 R8): แถวใบ v3 = 1 บรรทัดชี้คำสั่งมือ · ใบ v2 ไม่มีบรรทัด', JSON.stringify(P.v3Lines(rows)));
```

Append to `test/v3/cron.test.js`, immediately before its final `t.done();`:
```js
// ── Plan 3 Task 4 — update-prices.yml นับใบ v3 ในชื่อ commit (R7) ──
{ const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'update-prices.yml'), 'utf8');
  t(yml.includes("git diff --cached --name-only -- 'reports/*.html' 'reports/*.json'"), 'update-prices.yml: commit count n includes reports/*.json');
  t(!/ลง reports\/\*\.html ทุกวัน/.test(yml), 'update-prices.yml: header comment no longer says .html only'); }
```

- [ ] **Step 2: Run the tests to watch them fail**

```bash
rtk proxy node test/queue-test.js 2>&1 | grep -E "^✗|ผ่าน" | head -4; node test/v3/cron.test.js 2>&1 | tail -3
```
Expected: `✗ verify:cron: 6 ขั้น …`, `✗ verify:cron: มี node test/check-v3.js`, a `P.v3Lines is not a function` TypeError (the queue-test aborts), and from cron.test `✗ [cron] update-prices.yml: commit count n includes reports/*.json` and `✗ [cron] update-prices.yml: header comment no longer says .html only` → `✗ cron: 51/53`.

- [ ] **Step 3: Implement**

`package.json` :31 — `"verify:cron": "node test/check-reports.js && node test/check-v3.js && node build.js && node test/build-test.js && node test/engine-exec.js && node test/check-site.js",`

`.github/workflows/update-prices.yml` — replace line 1 with the two lines
```
# Cron อัปเดตราคาหุ้น + วันที่ราคา ทุกวัน (04:00 น. ไทย วันถัดไป — เดิม 07:17 น. ไทย)
#   ใบ v2 = reports/*.html (report-data.values) · ใบ v3 = reports/*.json (market.* อย่างเดียว ผ่าน IO.writeMarket — Plan 3 · spec §7)
```
and replace the `n=$(git diff --cached --name-only -- 'reports/*.html' | wc -l | tr -d ' ')` line with
```
          # นับทั้งใบ v2 (.html) และใบ v3 (.json · Plan 3) — ชื่อ commit ต้องตรงจำนวนหุ้นที่ราคาเปลี่ยนจริง
          n=$(git diff --cached --name-only -- 'reports/*.html' 'reports/*.json' | wc -l | tr -d ' ')
```

`tools/queue/preflight.js`:
- :139 — change the trailing comment to `// ใบ v3: pre-patch อัตโนมัติ = P6 (Plan 3 R8) — preflight พิมพ์ v3Lines ชี้คำสั่งมือแทน`.
- Insert before the doc comment of `parseGateFailures` (:150):
```js
/** บรรทัดชี้คำสั่งมือต่อแถวใบ v3 (ส่วนบริสุทธิ์ · Plan 3 R8) — pre-patch อัตโนมัติของใบ v3 (patchTargets/parseGateFailures/ทาง revert/
 *  ship --prepatch) = P6 · P5 แค่ห้ามล้มและห้ามเงียบ: หนึ่งบรรทัดต่อใบ ไม่ว่าแถวนั้นอยู่ bucket ไหน (prep ปฏิเสธใบ v3 อยู่แล้ว) */
function v3Lines(rows) {
  return rows.filter((r) => r.v3).map((r) => `v3 ${r.symbol}: controller → \`node tools/update-prices.js --write --force ${r.symbol}\` (flip) หรือ export/save (P6 queue flow)`);
}

```
- Replace the :301 line ``  if (t.skippedV3.length) console.log(`\nℹ ใบ v3 — ไม่ pre-patch …`);`` with
```js
  const v3l = v3Lines(rows);   // Plan 3 R8: ใบ v3 ไม่เข้า pre-patch อัตโนมัติ (P6) — บรรทัดชี้คำสั่งมือต่อใบ
  if (v3l.length) console.log('\n' + v3l.map((l) => 'ℹ ' + l).join('\n'));
```
- In `module.exports`, add `v3Lines, ` after `listReportsFS, `.

`tools/queue/prep.js` :270 — replace the phrase `update-prices ไม่ใช้กับใบ v3 (cron ข้ามจน Plan 3)` with `update-prices ไม่ใช้กับใบ v3 ใบใหม่ (ราคาใบ v3 = cron หลัง publish — worker ไม่รัน)`. The new text must not contain `update-prices.js --write --force`, because `plan2c-code.test.js` asserts that the NEW prep `.md` has no such hint.

`tools/queue/ship.js` :373 — replace the phrase `pre-patch ราคาเป็นของใบ v2 เท่านั้น (v3 cron = Plan 3)` with `pre-patch อัตโนมัติเป็นของใบ v2 เท่านั้น (ใบ v3 = P6 · pre-patch มือ = update-prices --write --force <SYM>)`.

Regenerate the doc markers:
```bash
node tools/gen-docs.js && node tools/gen-docs.js --check
```
Expected: `✎ CLAUDE.md` · `✎ README.md` · `✎ docs/price-refresh.md`, then `✓ เอกสารตรงกับโค้ด (5 ไฟล์ · 48 error + 21 warning · verify 20 ขั้น)`. `git diff --stat` must show only the one-number marker change in those three files (5 → 6), plus the `gen:verify-cron-chain` in CLAUDE.md, which now includes `` `check-v3` ``.

- [ ] **Step 4: Run the tests to watch them pass**

```bash
rtk proxy node test/queue-test.js | tail -1 && node test/v3/cron.test.js && rtk proxy node test/docs-test.js | tail -1 && rtk proxy node test/v3/plan2c-code.test.js | tail -1
rtk proxy npm run verify:cron 2>&1 | tail -3
```
Expected: `queue-test: 559/559 ผ่าน` · `✓ cron: 53/53` · `✅ docs ตรงโค้ด (docs-test 57 เคส)` · `✓ plan2c-code: 20/20` · verify:cron ends with `✅ เว็บไซต์ผ่าน` (exit 0; check-v3 prints `✅ check-v3 ผ่าน` in the middle).

- [ ] **Step 5: Commit**

```bash
git add package.json CLAUDE.md README.md docs/price-refresh.md .github/workflows/update-prices.yml tools/queue/preflight.js tools/queue/prep.js tools/queue/ship.js test/queue-test.js test/v3/cron.test.js
git commit -m "feat(v3): verify:cron runs check-v3 (#61) · workflow counts .json · preflight prints the v3 manual line (Plan 3 R7–R9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs (R12) — stock-controller §9, CLAUDE.md §9, price-refresh, decisions, open-items

**Files:**
- Modify: `.claude/skills/stock-controller/SKILL.md` (:52) · `CLAUDE.md` (§9, insert between :138 and :139) · `docs/price-refresh.md` (:24; a new subsection before the heading at :96) · `docs/decisions.md` (end of §9 before `## §10` :166; end of file) · `docs/open-items.md` (#61 :34 moves to a new closed section; #62 :35 "ปิดใน" cell; #49 :117 "ปิดโดย" cell)

**Interfaces:** none (docs). Guard: `node tools/gen-docs.js --check` and `node test/docs-test.js` must stay green. Never write "N ขั้น" next to verify or cron outside a marker.

- [ ] **Step 1: stock-controller §9.** Replace `.claude/skills/stock-controller/SKILL.md` line 52 (the one that starts `- **ใบ v3**: cron ข้าม (`) with this exact line:

```
- **ใบ v3 (`reports/*.json` · Plan 3 P5)**: cron เขียน **`market.*` อย่างเดียว** (px · priceDate · chart.data · range52w จาก Yahoo 52wk — ไม่มี/เสีย = คงค่าเดิม · chgSuffix/gridFmt/dataFmt คงเดิม) ผ่าน `IO.writeMarket` (gate `checkDoc` ก่อนเขียน ใต้ lock เดียว) · ค่าที่ derive จากราคาทั้งหมด compute ตอน build (ไม่มี patchDerived/summaryPlan/scenarioPlan/yieldPlan บนใบ v3) · freeze เกณฑ์เดียวกับ v2 (`decide()` บน FV จาก compute) · ไม่มี session ใหม่ (ICC) = ไม่เขียน ไม่ flag · gate ตก = ไม่เขียน + `patch-rejected` · `--force` ไม่ข้าม E50/E51 และไม่เซ็นทับใบที่แก้มือ · `--write --force <v3>` = pre-patch มือของแถว flip (pre-patch อัตโนมัติของใบ v3 = P6 — preflight พิมพ์บรรทัด `v3 <SYM>: controller → …`) · `--heal-derived <v3>` exit 1 · `updated` ไม่ขยับ (freshHash ไม่นับ market) · log มีบรรทัด `v3-lane: N` · #62 ปิดหลัง cron ตามตาราง 3 รอบสะอาดหลัง merge → `docs/price-refresh.md` หัวข้อ "ใบ v3"
```
If the harness refuses the write (`.claude/`), STOP and hand the line to the controller.

- [ ] **Step 2: CLAUDE.md §9 stub.** Copy the line verbatim. The rule is that a stub is copied from the skill, never paraphrased (memory `claude-md-cleanup-2026-09`). Insert the identical line as a new bullet in `CLAUDE.md` immediately **before** the line that starts `- **"เคลียร์คิว price-flags"** = `npm run queue -- preflight``, which comes right after the `- **ใบ v2 (884/908 ใบ ณ 21 ก.ย. 69)**` bullet.

- [ ] **Step 3: `docs/price-refresh.md`.**
  - :24 — replace the comment `# ดึงราคา Yahoo → patch reports/*.html + price-flags.json` with `# ดึงราคา Yahoo → patch reports/*.html (v2) + market.* ของ reports/*.json (v3) + price-flags.json`.
  - Insert the subsection below immediately before the heading `### ค่าที่ derive จากราคา — `patchDerived` (19 ส.ค. 2569)`:

```markdown
### ใบ v3 (`reports/*.json`) — cron เขียน `market.*` อย่างเดียว (Plan 3 · P5 · ก.ย. 2569)

> spec §7 · คำตัดสิน R1–R12 (`.superpowers/sdd/v3-plan3-task0/rulings.md`) · เทส `test/v3/cron.test.js` + `test/v3/market.test.js` + `test/v3/io.test.js`

- **ลูปเดียวกับ v2** (`RS.list` — ใบ v2 + v3 เรียงตามชื่อไฟล์) · fetch/retry/abort 11 ตัวติด/intraday guard/ข้าม `not-on-exchange`/quote ของ canary เป็นโค้ดเดียวกัน (`preSkip` · `chartFor`)
- **เขียนเฉพาะ** `market.px` (ปัด 2 ตำแหน่ง) · `market.priceDate` (ISO วันของตลาด) · `market.chart.data` (รายเดือน ≤13 จุด → รายสัปดาห์ → price-only บนกราฟเดิม) · `market.range52w` (Yahoo 52wk — ไม่มี/เสีย = คงค่าเดิม) · **คงเดิม** `chgSuffix` `chart.gridFmt` `chart.dataFmt` · ตัวสร้างตัวเดียว `tools/v3/market.js` `marketFromQuote` (prep ใช้ตัวเดียวกันผ่าน `fetch-facts --json` แล้ว sidecar ทับ `range52w` ด้วย vendor 52wk)
- **ไม่ patch อะไรนอก `market`** — MOS/verdict/P/E/ปันผล %/หมวด 6/กระจก stock-meta/สี `.chg`/gauge/ขอบกราฟ compute ตอน build จาก JSON ทุกค่า
- **freeze** เกณฑ์เดียวกับ v2 (`decide()` — FV จาก `compute()` ของใบเดิม ซึ่งไม่ขึ้นกับราคา) + `bad-chart` · reason เดิมทั้งหมด (triage ไม่เปลี่ยน · JSON อ่านไม่ได้ = `no-stock-meta`)
- **ไม่มี session ใหม่** (วันที่ quote ≤ `priceDate` และราคาเท่าเดิม) = "ไม่เปลี่ยน" ไม่เขียน ไม่ flag — หุ้นไทยสภาพคล่องต่ำ (ICC) เจอบ่อย · `priceDate` ไม่ถอยหลัง
- **gate ก่อนเขียน**: `checkDoc` ของใบใหม่ในหน่วยความจำ → ตก = ไม่เขียน + `patch-rejected` (detail บอก "ค้างก่อน patch"/"patch ทำให้ตก") · เขียนจริงผ่าน `IO.writeMarket` (lock เดียว: อ่าน → ตรวจลายเซ็นไฟล์เดิม → แทน market → `checkDoc` ซ้ำ → เซ็น → เขียน) · warning (W18/W25 ที่พลิกตามราคา) ไม่กัน
- **`--force`** (re-analysis/pre-patch มือ): ข้าม drift/suspect/flip + เขียนต่อได้เมื่อ gate ตกด้วย code อื่น — **E50 (ลายเซ็น — ใบถูกแก้มือ) และ E51 (สคีมา) ไม่มีวัน force** · `--heal-derived <v3>` = exit 1 (ไม่มีอะไรให้ซ่อม) · sweep `--heal-derived` ข้ามใบ v3 พร้อมบรรทัดนับ
- **`updated` ใน reports.json ไม่ขยับ** (`freshHash` ของ v3 ไม่นับ `market`/`_sig`/`meta.aiModel`) · `preserve-dates` ข้ามใบ v3 อยู่แล้ว
- **log**: บรรทัดต่อใบรูปเดียวกับ v2 (`✓ SYM old → new (+x%) · v3 market @date · MOS y%`) + บรรทัดสรุป `ℹ v3-lane: N ใบ · อัปเดต … · ไม่เปลี่ยน … · freeze …` (grep ได้) · commit body และชื่อ commit (`price: refresh N symbols`) นับทั้ง `.html` และ `.json`
- **แถว v3 ในคิว** (`mos-sign-flip`): pre-patch **มือ** `node tools/update-prices.js --write --force <SYM>` แล้ว `npm run queue -- ship <SYM>` — `ship --prepatch` ยังรับเฉพาะ `.html` (pre-patch อัตโนมัติของใบ v3 = P6) · preflight พิมพ์บรรทัด `v3 <SYM>: controller → …` ต่อใบ
- ⚠ **ใบ v3 ที่ save วันเดียวกับ cron → ship ก่อน 04:00** — `_sig` อยู่บรรทัดท้ายไฟล์ ⇒ save ของคนกับ cron ในวันเดียวกัน = conflict ตอน `pull --rebase` ของ workflow (retry 3 รอบแล้วล้มทั้งวัน) · ความเสี่ยงที่ยอมรับ (Plan 3 R2) ทบทวนที่ P6
```

- [ ] **Step 4: `docs/decisions.md`.**

(a) At the end of §9, immediately before the line `## §10 Template system + counters`, insert:
```markdown
### ใบ v3 ใน cron (Plan 3 · P5 · 24 ก.ย. 69)

- ที่มา/คำตัดสินทั้งหมดอยู่ที่ §10 "Report v3 Plan 3 (P5)" · กฎที่ใช้งาน = stock-controller §9 bullet "ใบ v3" + `docs/price-refresh.md` หัวข้อ "ใบ v3"

```
(b) Append at the end of the file:
```markdown

### Report v3 Plan 3 (P5) — cron เขียนราคาใบ v3 (24 ก.ย. 69)

> spec §7 (เขียนใหม่ทั้งหัวข้อ) + §11 แถว P5 · plan `docs/superpowers/plans/2026-09-24-report-v3-plan3-cron-v3.md` · branch `feat/report-v3-plan3` · คำตัดสินผูกพัน R1–R12 `.superpowers/sdd/v3-plan3-task0/rulings.md` · หลักฐาน `findings-cron.md`

- **R1 ผู้เขียน = `IO.writeMarket` ไม่ใช่ฟิลด์ provenance / `io.write({by})`** — ฟิลด์ใหม่ในสคีมาจะ churn `_sig` + fixture ทุกใบโดยไม่ได้บังคับอะไรเพิ่ม (E50 คือตัวบังคับ) · lock เดียวครอบ อ่าน → ตรวจลายเซ็นไฟล์เดิม → แทน market → `checkDoc` (lazy require — cycle `check-v3 → check-reports → update-prices`) → เซ็น → เขียน ⇒ ปิด race อ่าน-แก้-เขียนในเครื่อง · `report.js save` คงทางเดิม (`S.OWNER`)
- **R2 `_sig` conflict ข้าม git ยอมรับ** — คลาสเดียวกับแก้ใบ v2 วันเดียวกับ cron · กติกา "ใบ v3 ที่ save วันเดียวกับ cron → ship ก่อน 04:00" (`docs/price-refresh.md`) · ทบทวนที่ P6
- **R3 ตัวสร้าง market ตัวเดียว** (`tools/v3/market.js`) — **ปรับตอนวางแผน**: sidecar ไม่ได้ถือ quote (อ่าน `fetch-facts --json` จาก child process) ⇒ ตัวสร้างรันใน `factsJson` แล้ว sidecar คัด 5 ช่องเดิม + ทับ `range52w` ด้วย vendor 52wk (override เดียวที่ประกาศ · M7) · กติกา "กรอบใช้ได้" = `validRange` ตัวเดียว · เทสยืนยัน prep = cron บน quote เดียวกัน · ผลข้างเคียงที่ตั้งใจ: `factsJson.px` ปัด 2 ตำแหน่ง (เดิมดิบ) · กรอบ Yahoo ต้อง lo > 0 (sidecar ตรวจอยู่แล้ว)
- **นโยบายคงค่า**: `range52w` ใหม่จาก Yahoo เมื่อใช้ได้ ไม่งั้นคงเดิม (การ์ด/โทเคน `range52w` throw เมื่อไม่มี ⇒ ปล่อยหาย = E51 ทุกคืน) · `chgSuffix`/`gridFmt`/`dataFmt` คงเดิม (พฤติกรรม v2) · price-only fallback ย้ายเป็น `priceOnlyChart` ที่ v2 `patchReport` เรียกตัวเดียวกัน (ข้อความ error เดิม)
- **R4 freeze จาก view** — FV ของ v3 ไม่ขึ้นกับราคา (`'current'` อยู่ได้เฉพาะขา context น้ำหนัก 0) ⇒ `decide()` ของ v2 ใช้ได้ตรง ๆ ด้วย `fv = compute(prev).rd.fv`
- **R5 ไม่มี session ใหม่ = ไม่เขียน** — **ขยายตอนวางแผน**: วันที่ quote **≤** `priceDate` (ไม่ใช่ = อย่างเดียว) และราคาเท่าเดิม ⇒ quote ที่เก่ากว่าใบไม่ดึง `priceDate` ถอยหลัง
- **R6 gate ก่อนเขียน = quarantine เดิม** — ไม่มีอะไรให้ revert · `checkDoc` บนใบที่เพิ่งเซ็นใหม่ไม่มีวันเห็น E50 ⇒ ตัวบังคับ E50 ของ cron = `verifySig` ของใบเดิม (ใน `planV3` และใต้ lock ใน `writeMarket`) · `--force` ผ่านได้เฉพาะ code ที่ไม่ใช่ E50/E51
- **R7 ท่อ v2 ที่เคยเห็นแต่ `.html`** — ลูป `main()` + `healDerived` วน `RS.list` · `evaluated`/`aliveAsserted` รวมใบ v3 · commit body/ชื่อ commit นับทั้งสองสาย · `v3Guard`/`v3Refusal`/`v3SweepNotice` ถอด พร้อมเทสที่ตรึงพฤติกรรม P4 3 ไฟล์ · อ่านใบ v3 ไม่ได้ = `no-stock-meta` (ไม่เพิ่ม reason — triage ไม่เปลี่ยน)
- **R8 `--write --force <v3>` = เขียนจริง** · pre-patch อัตโนมัติของแถว v3 = P6 · preflight พิมพ์ `v3 <SYM>: controller → …` ต่อใบ (`v3Lines`) · ข้อความค้าง "v3 cron = Plan 3" ใน prep/ship/preflight แก้ใน PR เดียวกัน
- **R9 `verify:cron` + `check-v3` (ปิด #61)** — queue-test `0b` ตรึงจำนวนขั้นของ cron ไว้ (5 → 6 · ตรวจพบตอนซ้อมโค้ดในแผน ไม่ได้อยู่ใน findings) · gen-docs แก้ marker 3 ไฟล์ (CLAUDE.md §8 · README · price-refresh)
- **R10 extract ไม่ inject** — `planV3`/`applyV3` บริสุทธิ์ + ด่านที่ใช้ร่วมสองสาย (`preSkip` = intraday/not-on-exchange · `evaluatedOf` · `chartFor` = บล็อกกราฟเดิมย้ายทุก byte) · `main()` ยังไม่มี hook ให้เทส — ครอบด้วยการซ้อมใน scratch worktree
- **token log `v3-lane: N`** แทน `v3-skipped: N` ของ P4 — ใช้ตรวจเกณฑ์ (f) 3 รอบสะอาดหลัง merge
- **ต้นทุน** — `checkDoc` ต่อใบ v3 ~3 ครั้งในลูป (ใบเดิม · ใบใหม่ · ซ้ำใต้ lock) + `check-v3` ใน `verify:cron` — ทบทวนที่ P7 เมื่อคลังเป็น v3 ทั้งหมด
- **เกณฑ์จบ (R11)**: (a)–(d) ในหลักฐาน PR · (e) รอบ cron ตามตาราง 25 ก.ย. 69 04:00 ก่อน merge · (f) 3 รอบสะอาดหลัง merge แล้วปิด #62
```

- [ ] **Step 5: `docs/open-items.md`.**
  - **#62** (:35): in the last cell ("ปิดใน"), replace `v3 Plan 3 (P5) |` with `v3 Plan 3 (P5) — **สาย v3 ของ cron ลงใน Plan 3** (branch `feat/report-v3-plan3`) · ปิดเมื่อ cron ตามตาราง 3 รอบสะอาดหลัง merge (ไม่มี `patch-rejected` บนใบ v3 · `updated` ของ OGE/ICC ไม่ขยับ · W09 หาย — spec §11 P5 (f)) |`.
  - **#61** (:34): delete the row from "## เปิดอยู่". At the end of the file (after the Plan 2c-i table), add a new section:
```markdown

## ปิดแล้ว (Report v3 Plan 3 · P5 24 ก.ย. 69)

| # | รายการ | ปิดโดย |
|---|---|---|
| 61 | **v3 cron path (Plan 3) — `verify:cron` ต้องรวม `check-v3`** ไม่งั้น E50/E51/E52 ถูกข้ามใน gate ของ cron จนกว่า `ci-verify` หลัง push จะจับได้ | **Plan 3 Task 4**: `verify:cron` = check-reports → check-v3 → build → build-test → engine-exec → check-site (`package.json`) · queue-test `0b` ตรึงลำดับ · marker gen-docs · + cron gate ใบ v3 ก่อนเขียนต่อไฟล์ (`planV3` + `IO.writeMarket`) · `docs/decisions.md` §10 "Report v3 Plan 3 (P5)" |
```
  - **#49** (:117, closed 2c-i table): in its last cell, replace ` · `docs/decisions.md` §10 "Report v3 Plan 2c-i" |` with ` · `docs/decisions.md` §10 "Report v3 Plan 2c-i" · **residue ปิดใน Plan 3 (P5)**: `update-prices.js` main + `healDerived` วน `RS.list` (`test/v3/cron.test.js` ตรึงว่าไม่เหลือ filter `.html` ล้วน) · `update-prices.yml` นับ `reports/*.json` |`.

- [ ] **Step 6: Docs gates**

```bash
node tools/gen-docs.js --check && rtk proxy node test/docs-test.js | tail -1
rtk proxy grep -c "v3 cron = Plan 3" .claude/skills/stock-controller/SKILL.md CLAUDE.md docs/price-refresh.md
diff <(rtk proxy grep -F -- '- **ใบ v3 (`reports/*.json` · Plan 3 P5)**' .claude/skills/stock-controller/SKILL.md) <(rtk proxy grep -F -- '- **ใบ v3 (`reports/*.json` · Plan 3 P5)**' CLAUDE.md) && echo STUB-VERBATIM
```
Expected: `✓ เอกสารตรงกับโค้ด …` · `✅ docs ตรงโค้ด (docs-test 57 เคส)` · three `:0` counts · `STUB-VERBATIM`.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/stock-controller/SKILL.md CLAUDE.md docs/price-refresh.md docs/decisions.md docs/open-items.md
git commit -m "docs(v3): Plan 3 — cron writes v3 market.* · stock-controller/CLAUDE.md §9 · price-refresh v3 lane · #61 closed · #49 residue · #62 exit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Exit proofs (R11 a–e) · PR — controller

**Files:** none in the repo, apart from appending one bullet to `docs/decisions.md` in Step 5. Scratch checkouts: `/Users/somchai.s/Downloads/stock-v3-plan3-scratch` and `/Users/somchai.s/Downloads/stock-v3-plan3-base`.

- [ ] **Step 1: Full gate on the branch head (R11 b)**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan3
rtk proxy npm run verify 2>&1 | tail -2
GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js 2>&1 | grep -E "^✗|cron|market|io:|sidecar|scanners-cron"; echo "exit=${PIPESTATUS[0]}"
```
Expected: verify ends with `✅ เว็บไซต์ผ่าน`. The GIT_DIR-sim run prints the `✓ …` lines for `cron 53/53`, `io 31/31`, `market 24/24`, `scanners-cron 21/21` and `sidecar 57/57`, no `✗`, and `exit=0`.

- [ ] **Step 2: Fixture rehearsal on OGE + ICC in a scratch worktree (R11 a)** — no network, any time of day

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan3
S=/Users/somchai.s/Downloads/stock-v3-plan3-scratch; git worktree add --detach "$S" HEAD >/dev/null; cd "$S"
node - <<'EOF'
const U = require('./tools/update-prices.js'), IO = require('./tools/v3/io.js'), seeds = require('./tools/seeds.json');
const round2 = (v) => Math.round(v * 100) / 100;
const quoteFor = (d, price, closeSec, gmt) => ({ price, currency: d.currency, marketTime: closeSec, gmtoffset: gmt, regularStart: closeSec - 6 * 3600, regularEnd: closeSec,
  week52Low: d.market.range52w.lo, week52High: d.market.range52w.hi, bars: d.market.chart.data.map((p, i) => ({ ts: Date.UTC(2025, 9 + i, 15) / 1000, close: p[1] })) });
const run = (sym, price, closeSec, gmt, label) => {
  const file = `reports/${sym}.json`, d = IO.read(file), q = quoteFor(d, price, closeSec, gmt);
  const chart = { data: U.buildChartData(q.bars, q.price, q.gmtoffset), src: '1mo', bars: q.bars, gmtoffset: q.gmtoffset };
  const r = U.applyV3(file, U.planV3(d, q, chart, { seeds, nowSec: closeSec + 3600 }), { write: true, seeds });
  console.log(`${label.padEnd(24)} ${r.kind.padEnd(9)} ${r.line}`);
};
{ const d = IO.read('reports/ICC.json'); run('ICC', d.market.px, Date.UTC(2026, 8, 23, 9, 30) / 1000, 7 * 3600, 'ICC no-new-session'); }
{ const d = IO.read('reports/OGE.json'); run('OGE', round2(d.market.px * 1.012), Date.UTC(2026, 8, 24, 20, 0) / 1000, -4 * 3600, 'OGE +1.2% session 24'); }
{ const d = IO.read('reports/ICC.json'); run('ICC', round2(d.market.px * 1.012), Date.UTC(2026, 8, 24, 9, 30) / 1000, 7 * 3600, 'ICC +1.2% session 24'); }
EOF
node - <<'EOF'
const cp = require('child_process'), IO = require('./tools/v3/io.js');
const st = (d) => { const { market, _sig, ...x } = d; return JSON.stringify(x); };
for (const s of ['OGE', 'ICC']) {
  const h = JSON.parse(cp.execFileSync('git', ['show', `HEAD:reports/${s}.json`], { encoding: 'utf8' })), c = IO.read(`reports/${s}.json`);
  console.log(s, 'nonMarketEqual', st(h) === st(c), 'sig', IO.verifySig(c), 'fresh', IO.freshHash(h) === IO.freshHash(c), 'px', h.market.px, '→', c.market.px, c.market.priceDate);
}
EOF
git diff --stat; git diff -U0 reports/OGE.json | grep -E '^[-+] ' | cut -c1-80
rtk proxy node test/check-v3.js OGE ICC | tail -1
node build.js >/dev/null && git diff -U0 reports.json | grep -E '^[-+].*"updated"' | wc -l
cd /Users/somchai.s/Downloads/stock-v3-plan3 && git worktree remove --force "$S"
```
Expected (these were measured on a copy of the head at planning time; the px values move with the committed report):
- `ICC no-new-session unchanged = ICC v3 ไม่มี session ใหม่ — 23.6 @2026-09-23 เท่าเดิม ไม่เขียน`
- `OGE … write ✓ OGE 44.71 → 45.25 (+1.2%) · v3 market @2026-09-24 · MOS -29.1%`
- `ICC … write ✓ ICC 23.6 → 23.88 (+1.2%) · v3 market @2026-09-24 · MOS -12.9%`
- `nonMarketEqual true sig true fresh true` for both
- `git diff --stat` touches only `reports/OGE.json` and `reports/ICC.json`, and the OGE hunks are only `"px"`, `"priceDate"`, the last chart value and `"_sig"`
- `✅ check-v3 ผ่าน`
- `0` changed `updated` lines in `reports.json`

Paste all output into the report. Any other diff line means the R1 invariant is broken: stop.

- [ ] **Step 3: Real-quote rehearsal (R11 c)** — **only when both markets are closed, 04:00–10:00 ไทย** (`TZ=Asia/Bangkok date +%H` between `04` and `09`). Otherwise skip, and record "(c) skipped — outside the closed-market window, fixture rehearsal only" in Step 5.

```bash
S=/Users/somchai.s/Downloads/stock-v3-plan3-scratch; git worktree add --detach "$S" HEAD >/dev/null; cd "$S"
node tools/update-prices.js OGE ICC 2>&1 | tail -6                       # dry-run: per-file lines + "ℹ v3-lane: 2 ใบ …"
PRICE_COMMIT_BODY=/tmp/pcb.txt node tools/update-prices.js --write OGE ICC 2>&1 | tail -6
cat /tmp/pcb.txt; git diff --stat reports/
node build.js >/dev/null && node tools/preserve-dates.js 2>&1 | tail -1 && node build.js >/dev/null && rtk proxy npm run verify:cron 2>&1 | tail -2
cd /Users/somchai.s/Downloads/stock-v3-plan3 && git worktree remove --force "$S"
```
Expected: a `v3-lane: 2 ใบ` line; each file ends as `write` (a new session) or `unchanged` (ICC with no trade); no `patch-rejected`; the commit body lists the v3 rows; `verify:cron` exits 0. Re-run the Step 2 compare snippet before removing the worktree if any file was written.

- [ ] **Step 4: DIST-PROOF vs the merge-base (R11 d)**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan3
BASE=$(git merge-base HEAD origin/main)
git worktree add --detach /Users/somchai.s/Downloads/stock-v3-plan3-base "$BASE" >/dev/null
(cd /Users/somchai.s/Downloads/stock-v3-plan3-base && node build.js >/dev/null)
node build.js >/dev/null
rtk proxy diff -r /Users/somchai.s/Downloads/stock-v3-plan3-base/dist dist && echo "DIST IDENTICAL"
rtk proxy git status --short reports/ reports.json
git worktree remove --force /Users/somchai.s/Downloads/stock-v3-plan3-base
```
Expected: `DIST IDENTICAL`, and no `git status` output. The branch writes no report, so even OGE/ICC are identical. Any difference is a render or build change and must be explained before the PR.

- [ ] **Step 5: Record the proofs** — append one bullet to the end of the `docs/decisions.md` §10 "Report v3 Plan 3 (P5)" block, filled in with the real outputs of Steps 1–4. The format is `- **ผลพิสูจน์ (Task 6 · <วันเวลาไทย>)** — verify เต็มผ่าน · GIT_DIR-sim ผ่าน · ซ้อม fixture: ICC unchanged · OGE <old → new> · ICC <old → new> · diff = market + _sig · freshHash เท่าเดิม · updated 0 บรรทัด · ราคาจริง: <ผล หรือ "ข้าม — นอกหน้าต่าง 04:00–10:00">`. Then commit it with `docs(v3): Plan 3 exit proofs (R11 a–d)` and the trailer.

- [ ] **Step 6: Merge precondition (R11 e)**

```bash
gh run list --workflow update-prices.yml --limit 5 --json databaseId,event,createdAt,conclusion
gh run view <databaseId of the schedule run created 2026-09-24T2x:xxZ> --log | grep -oE "v3-skipped: [0-9]+|freeze \[patch-rejected\][^\n]{0,60}" | head
```
Expected: an `event: "schedule"` run created after 2026-09-24T21:00Z with conclusion `success`, and the log shows `v3-skipped: 2` with no `patch-rejected` line mentioning OGE or ICC. If the run has not happened yet, or it failed, **do not merge**. Report the state and wait.

- [ ] **Step 7: PR**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan3
git pull --rebase origin main && rtk proxy npm run verify 2>&1 | tail -1 && GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js >/dev/null && echo V3OK
git push -u origin feat/report-v3-plan3
gh pr create --title "Report v3 Plan 3 (P5): the price cron writes v3 reports" --body-file <body file>
```
The PR body contains:
- the six task commits;
- the ruling map (R1–R12 → task) and the plan-level adaptations (P-R3/P-R5/P-R6/P-R10);
- the Step 1–4 outputs verbatim;
- the R11(e) run id and grep output;
- the statement "v2 pages byte-identical (DIST IDENTICAL) · v3 files unchanged in this PR — the first real v3 write happens at the first scheduled run after merge";
- the post-merge ledger for (f): the next three scheduled runs, each with `gh run view <id> --log | grep -E "v3-lane|OGE|ICC"`, checking no `patch-rejected` on v3, no change to `updated` for OGE/ICC (`git log -p -1 -- reports.json | grep -c '"updated"'` on the cron commit = 0 for those symbols), and W09 gone;
- the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Then an advisor review before merge, then `gh pr merge <N> --merge --repo iam1412/stock-analysis`, run standalone. After merge: memory update (P5 merged · the ledger for (f) · #62 open until three clean rounds), and the worktree removed after the merge.

## Self-review

- **Spec and ruling coverage:**
  - R1 → Task 2 (`writeMarket`) + Task 3 (`applyV3` calls it)
  - R2 → Task 5 (price-refresh ⚠ line, decisions)
  - R3 → Task 1 (+ the sidecar equivalence test)
  - R4 → Task 3 (`planV3` `decide` on `rd.fv`)
  - R5 → Task 3 (the two `R5:` cases) + Task 6 Step 2 (ICC)
  - R6 → Task 2 (E50/E51/E52/force) + Task 3 (rejected/forced/E50/E51)
  - R7 → Task 3 (`RS.list`, `evaluatedOf`, `aliveAsserted`, `commitBody`, `healV3Refusal`, guard removal, three pinned tests) + Task 4 (yml count and header)
  - R8 → Task 3 (`--write --force` reaches the lane) + Task 4 (`v3Lines` + test)
  - R9 → Task 4 (`verify:cron`, gen-docs, queue-test `0b`)
  - R10 → Task 3 (pure `planV3`/`applyV3`/`preSkip`/`evaluatedOf`/`chartFor` + `cron.test.js` covering every item of the R10 list: happy, freezes ×6, intraday/dead skip, patch-rejected bytes, unchanged, evaluated clears, dry-run, heal-derived refusal) + Task 4 (the yml test)
  - R11 → Task 6 Steps 1–7, (a)–(e), with the (f) ledger in the PR
  - R12 → Task 5
  - Spec §7 was rewritten and the §11 P5 row updated in Task 0 of this plan (before Task 1).
  - Spec §8 → the freshHash assertions in Tasks 2, 3 and 6.
  - §13 items 6, 9 and 11 are preserved: `'current'` is context-only, which is what R4 relies on; the silent freeze ends; the `prep` refusal of v3 is unchanged (P6).
- **Placeholder scan:** the only runtime-filled values are `<databaseId …>`, `<N>`, `<body file>` and the Step 5 proof values, which come from the command outputs of the same task. Every code step contains the full code, which was run on a copy of the head during planning.
- **Type consistency:**
  - `planV3(prev, q, chart, opts)` returns `.kind ∈ {unchanged, freeze, write}`, which `applyV3(file, plan, opts)` consumes.
  - `applyV3` returns `.kind ∈ {unchanged, freeze, write}`, indexing `v3n[kind]`: the counters `write`/`unchanged`/`freeze` exist.
  - `chartFor` returns `{data, src, bars, gmtoffset}`, the same shape `planV3` reads.
  - `IO.writeMarket` throws with `.codes`, which `applyV3` reads.
  - `preSkip` returns `'intraday' | 'dead' | null`, and `main` checks both strings.
  - `MK.marketFromQuote` key order is px, priceDate, chart, chgSuffix, range52w, which matches `buildSidecar`.
- **Review Focus coverage:** items 1–5 each name the test that pins them (Tasks 1–4) and are rehearsed in Task 6.
