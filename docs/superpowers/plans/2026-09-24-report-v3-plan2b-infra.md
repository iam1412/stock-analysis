# Report v3 — Plan 2b: Infrastructure (`report-source` · 16 scanners → `.json` · gate rules · prep sidecar · `report.js` CLI · hook files)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tool that asks "which files are reports?" learns about `reports/<SYM>.json` through one helper, the gate rejects v2 tokens and unfilled `TODO` sentinels and reports every semantic error at once, and a worker can go `prep → report.js init → edit .work/<SYM>.json → report.js save` without ever touching `reports/` by hand — while production stays byte-for-byte unchanged.

**Architecture:** A new `tools/report-source.js` wraps `build.reportEntries`/`loadReportSource`/`expandReport` and becomes the single owner of "which files are reports" (`list`, `symbols`, `kindOf`, `load`, `metaLite`, `stockMeta`, `renderedHtml`). The 16 scanners of open-item #49 are converted onto it in three runtime batches, each ending with a `dist/` byte-diff of 0. The gate gains `{{rd:` and `TODO` rules in `tools/v3/schema.js` (so `check-v3`, `io.write` and `save` all enforce them), `C.semanticErrors()` in `tools/v3/compute.js`, and `checkDoc(doc, {stage:'save'})` in `test/check-v3.js`. `npm run queue -- prep` writes a machine-readable sidecar `.queue/prep/<SYM>.json` for NEW stocks; `tools/report.js` turns it into a `.work/<SYM>.json` draft and saves drafts through the same `checkDoc` the gate runs. A PreToolUse hook script (`.claude/hooks/guard-reports.js`) plus an owner-paste settings snippet blocks direct writes to `reports/*`. The tripwire `test/v3/no-json-reports.test.js` stays; no real `reports/*.json` exists at the end of this plan.

**Tech Stack:** Node ≥20.19, CommonJS, no dependencies. v3 unit tests are plain Node scripts using `test/v3/_t.js`, run in one process by `test/v3-test.js` (a new `test/v3/*.test.js` file is picked up automatically — no `verify` step is added). Queue/tag/cron tests keep their existing files (`test/queue-test.js`, `test/tag-apply-test.js`, `test/update-prices-test.js`).

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` — binding sections: §3 (token note), §6.1–§6.5, §8, §9 (E51 additions, `semanticErrors`, `stage:'save'`), §11 (P4a row = Plan 2b), §12, §13 items 8–15. Binding rulings: `.superpowers/sdd/v3-plan2b-task0/rulings.md`. Evidence: `.superpowers/sdd/v3-plan2b-task0/findings-scanners-cli-hook.md` (scanner inventory with file:line, CLI reuse map, hook design) and `findings-worker-exit.md` (§C token-lean prefill; M1–M9). Style reference: `docs/superpowers/plans/2026-09-24-report-v3-plan2a-schema-gate.md`.

**Out of scope (Plan 2c and later):** worker docs (stock-analyzer SKILL, `_template/agent-prompt.md`, stock-controller, CLAUDE.md), removing the tripwire, real `reports/*.json`, the cron v3 price writer (P5 — `update-prices.yml` `.json` count, `verify:cron` + `check-v3` #61), the migrator (P6), obsolete migrators/theme writers (#49 group A3 stay `.html`-only until P7), editing `.claude/settings.json`.

## Execution Notes (subagent-driven)

- Worktree `/Users/somchai.s/Downloads/stock-v3-plan2b`, branch `feat/report-v3-plan2b`. Do not create another worktree except the throwaway base checkout of the DIST-PROOF steps (`/Users/somchai.s/Downloads/stock-v3-plan2b-base`, removed at the end of each proof).
- Implementers and reviewers are **Opus** subagents. Every implementer prompt carries these standing prohibitions: **never push** · **never call `advisor`** · **never spawn subagents or `claude -p`** · **never create or edit any file under `reports/`, `reports.json`, `.work/`, `.queue/`** in the worktree (tests use `os.tmpdir()` sandboxes and pass `reportsDir`/`--reports-dir`-style overrides) · **never edit `.claude/settings.json`** · **never loosen an existing assertion to make a new change pass** — if an existing test breaks, fix the new code or stop and report.
- Reviewers of Task 3 (fail-closed prepatch), Task 5 (gate rules) and Task 8 (hook) must show one new test *can* fail: flip the rule (e.g. make `prepatchBlockers` `continue` on non-`.html` again), watch the test go red, revert.
- If the harness refuses to create `.claude/hooks/guard-reports.js` (writes under `.claude/` can be classifier-blocked), STOP and report — do not relocate the script.
- **fixture-lint scans `test/*.js` and (after Task 2) `test/v3/*.js`.** In any test file never write the literal `'reports'` next to a `'<name>.html|json'` string (`path.join(x, 'reports', 'ZTS.json')`) and never put `'reports'` inside a `readFileSync(` call — build sandbox paths from variables (`path.join(tmp, 'ZTS.json')`).

## Global Constraints

- **Zero production effect.** `test/v3/no-json-reports.test.js` stays and passes. No file under `reports/` and no `reports.json` changes. `dist/` built at the merge-base and at the head is byte-identical — proved by the DIST-PROOF step at the end of Tasks 2, 3, 4 and 9.
- **One owner of "which files are reports":** every scanner change goes through `tools/report-source.js`. No new `readdirSync(...).filter(/\.html$/)` copies anywhere in the tools/tests touched by this plan.
- **One acceptance path:** `report.js save` accepts a doc only through `CV.checkDoc(doc, {stage:'save'})` (+ rule B, which stays a save-time call — ruling R5 of Plan 2a). `stage:'save'` drops exactly `v2:E40` and nothing else.
- **Fail closed on ambiguity** in `ship --prepatch`: any changed path under `reports/` that is not `reports/<SYM>.html` is a blocker.
- **`update-prices` never no-ops silently on a v3 symbol** — explicit v3 symbols exit ≠0 with "v3 cron = Plan 3" (open-item #62).
- **No network in tests.** `fetch-facts --json` / `fetch-fundamentals --json` / sidecar assembly are tested through pure exported functions with fake inputs.
- **No `reports/*.json` is ever created** by a test or a task (the tripwire proves it). `report.js` takes `--reports-dir --work-dir --prep-dir --seeds --today` so tests run in temp dirs with a fixed clock.
- Node ≥20.19, CommonJS `'use strict'`, **no new npm dependency**.
- `tools/v3/*` must not `require` `build.js`, `tools/update-prices.js` or `test/check-reports.js` (cycle rule). `tools/report-source.js` lives in `tools/` and requires `build.js` **lazily** (inside `list`/`renderedHtml`) because `tools/update-prices.js` and `tools/dead-ticker-canary.js` require it.
- Negative numbers formatted for display by new code use **U+2212 `−`**. User-facing strings are Thai and follow the existing tone of the file being edited.
- The `TODO` sentinel is the regex `/^\s*TODO\b/` (case-sensitive) on **any string leaf** of a v3 doc — text fields and number-typed fields that still hold the sentinel string alike.
- Commit after every task on `feat/report-v3-plan2b`, message style `feat(v3): …` / `test(v3): …` / `docs(v3): …`, ending with exactly the trailer lines your harness system-reminder specifies; at the time of writing:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP
  ```
- Use `rtk proxy <cmd>` for any command whose output you count or diff (the rtk hook truncates output otherwise).
- **DIST-PROOF** (the exact commands every batch ends with):
  ```bash
  cd /Users/somchai.s/Downloads/stock-v3-plan2b
  BASE=$(git merge-base HEAD main)
  git worktree add --detach /Users/somchai.s/Downloads/stock-v3-plan2b-base "$BASE" >/dev/null
  (cd /Users/somchai.s/Downloads/stock-v3-plan2b-base && node build.js >/dev/null)
  node build.js >/dev/null
  rtk proxy diff -r /Users/somchai.s/Downloads/stock-v3-plan2b-base/dist dist && echo "DIST IDENTICAL"
  rtk proxy git status --short reports/ reports.json
  git worktree remove --force /Users/somchai.s/Downloads/stock-v3-plan2b-base
  ```
  Expected: `DIST IDENTICAL`, no `diff` output, and the `git status` line prints nothing. If `diff` shows only a build timestamp, stop and report it (run the base build twice and diff those two builds to show it is build nondeterminism).

## Review Focus

1. **`save` for a symbol that already has a v2 `reports/<SYM>.html`** → refuse, write nothing. Creating `reports/<SYM>.json` next to it makes `build.reportEntries` throw and breaks the whole site build. Pinned in Task 7.
2. **`init` when `.work/<SYM>.json` already exists** (a worker re-runs init mid-task) → refuse without `--force`; the worker's draft must survive byte-for-byte. Pinned in Task 7.
3. **Hook false positives on text that only looks like a write:** `>`/`reports/` inside quotes (`git commit -m "… > reports/x"`), inside a heredoc body (`apply-edits … <<'EOF'` with HTML), `2>&1`, `> /tmp/log`, `grep …reports/X.html | head`, `cp reports/X.html /tmp/` → must stay allowed. Pinned in Task 8.
4. **`ship --prepatch` with a `git mv reports/X.html reports/X.json` rename or a stray non-report file under `reports/`** → blocker, never swept into the "price: pre-patch" commit. Pinned in Task 3.
5. **A failed `save` leaves `reports/<SYM>.json` byte-identical**, and `save --light` that touches a path outside the allowlist (e.g. `legs[0].inputs.multiple`) names that path in the error. Pinned in Task 7.

---

## Rulings made in this plan (R1–R14)

Plan-level decisions; the controller may overturn any of them before execution.

- **R1 Sidecar sources.** `ttm`, `fy`, `sharesOut`, `dps`, `epsForward`, `rating` come from a new `fetch-fundamentals --json` (pure `snapshotJson()`); spec §6.4 attributes `ttm` to `fetch-facts --json`, but `fetch-facts` has no statement data. `company`/`exchange` come from `fetch-facts --json` via two additive fields on `update-prices.fetchChart()` (`longName`, `exchangeName` from Yahoo chart `meta`; no existing consumer reads them).
- **R2 Sidecar writer = `npm run queue -- prep` only, NEW mode only**, through a pure `tools/queue/sidecar.js`. `tools/prep-stock.js` keeps its text contract unchanged (spec §6.4 names both; one writer is enough and keeps the `{{FUNDAMENTALS}}` block untouched). NEW prep fetches facts/fundamentals a second time in `--json` mode (a few extra HTTP calls, NEW only).
- **R3 `TODO` sentinel** = `/^\s*TODO\b/` on any string leaf, enforced in `S.validate` → reaches the gate as `E51`, `io.write` refuses it, `save` prints it with its path. A number field left as `"TODO: …"` gets both the type error and the sentinel error (same path).
- **R4 `{{rd:`** = substring anywhere in any string leaf → `S.validate` error → `E51`.
- **R5 One `E51` entry per failing layer, with `details`.** Schema, tag and semantic failures each stay **one** `E51` entry (existing tests pin entry counts) whose `msg` is unchanged in shape and which gains `details: [{path, msg}]`. `save` prints `details` line by line.
- **R6 `checkDoc` returns `dropped`** (`[{id:'v2:E40', msg}]` under `stage:'save'`, else `[]`); an unknown `stage` throws.
- **R7 `report.js` options** `--reports-dir --work-dir --prep-dir --seeds --today --force` exist for tests/replays (usage text says so). `--today` fixes the clock of `init` (`meta.analysisDate`) and of `save`/`show` gate checks; `verify` always uses the real clock, so it is not a staleness escape.
- **R8 `npm test` sweep (no args) stays v2-only** and prints one line counting v3 files (verify runs `check-v3` next). With args, v3 symbols go to `check-v3.runCli` and the exit code is the max of both.
- **R9 `postcheck` keeps its single gate call `node test/check-reports.js <SYM>`** (the R8 hand-off reaches `check-v3`); meta checks read `metaLite` + the rendered page, and the old-price grep runs over `P.proseFields` text for v3.
- **R10 Hook "under reports/"** = a path segment named `reports` whose parent directory contains `build.js` (any checkout/worktree of this repo); an unexpanded `$VAR` path containing `reports/` is denied. Known gaps (documented, `_sig`/E50 is the backstop): `xargs`, `find -exec`, child processes (`apply-edits`, `report.js`) by design.
- **R11 `update-prices` sweep (no symbols) skips v3 files with one info line**; only explicitly named v3 symbols exit ≠0. `--heal-derived` gets the same explicit-symbol guard.
- **R12 `metaLite` returns a superset** `{symbol, v3, currency, px, analysisDate, era, aiModel}` (ruling 1 names four fields; `era` feeds postcheck's BE check and analysis-age). The MOS for ship's commit message comes from a separate `stockMeta()` that computes (v3 = `compute().sm`).
- **R13 The owner pastes the hook snippet at the Plan 2c cutover, not at the end of 2b.** The hook denies Write on every file under `reports/`, so the v2 NEW flow (stock-analyzer STEP 5A "Write `reports/<SYMBOL>.html`") would be blocked the moment it is pasted. Plan 2b proves the hook with `claude -p --settings <temp file>` only (`docs/hook-setup.md`), which keeps the zero-production-effect rule.
- **R14 The `--light` allowlist is exactly spec §6.1**: every `P.proseFields` path of either doc · `meta.analysisDate` `meta.aiModel` `meta.sources[*]` `meta.priceNote` · `analyst` / `analyst.*` · `fundamentals.dps`. `meta.litReasons` is not in it, so a prose edit that needs a new `{{lit:…}}` goes through a full save. `save` keeps `.work/<SYM>.json` after writing, and `init`/`export` refuse to overwrite an existing draft without `--force`.

## File Structure

| Path | Responsibility | Tasks |
|---|---|---|
| `tools/report-source.js` (create) | single owner of "which files are reports": `list symbols kindOf exists load metaLite stockMeta renderedHtml isV3Path` | 1 |
| `test/v3/report-source.test.js` (create) | unit tests on a temp dir (v2 fixture + v3 fixture) | 1 |
| `test/check-reports.js` (modify CLI only) | `runCli(argv, {reportsDir, log, err})` — v3 symbols → `check-v3.runCli` | 2 |
| `test/engine-exec.js` (modify `main`) | iterate `RS.list` + `RS.renderedHtml` | 2 |
| `test/tags-test.js` (modify corpus line) | symbols from `RS.list` | 2 |
| `test/fixture-lint.js` (modify) | pattern `(html\|json)` + scan `test/v3` | 2 |
| `test/v3/scanners-verify.test.js` (create) | hand-off, engine run on a v3 page, fixture-lint | 2 |
| `tools/queue/ship.js` (modify) | `STOCK_FILES` +`.json`, `reportAiModel` via `metaLite`, MOS via `stockMeta`, fail-closed prepatch | 3 |
| `tools/queue/postcheck.js` (modify) | `RS.load`/`renderedHtml`/`metaLite`, `oldPriceHaystack` | 3 |
| `tools/queue/prep.js` (modify) | `checkNotV3`, exists via `kindOf`; sidecar in Task 6 | 3, 6 |
| `tools/queue/preflight.js` (modify) | lists/ages/currency via `RS`, `liteOf`, `skippedV3` | 3 |
| `test/queue-test.js` (modify) | section 23: v3 through the queue tools | 3 |
| `tools/update-prices.js` (modify) | `v3Refusal`, sweep info line, `reportExists` via `RS.symbols`, `fetchChart` +2 fields | 4, 6 |
| `tools/preserve-dates.js` (modify) | `main()` guard, pure `restoreDates`, skip v3 | 4 |
| `tools/dead-ticker-canary.js` (modify) | pure `probeList`, `RS` list/meta/exists | 4 |
| `tools/earnings-calendar.js` (modify) | `reportSymbols` via `RS` | 4 |
| `tools/analysis-age.js` (modify) | `ageBuckets` via `RS.metaLite` | 4 |
| `tools/spotcheck.js` (modify `main`) | `RS.list` + `RS.renderedHtml` | 4 |
| `tools/tag-apply.js` (modify) | exists = `RS.exists` (either file) | 4 |
| `tools/apply-edits.js` (modify) | refuse `.json` → point to `report.js save` | 4 |
| `.gitignore` (modify) | `.work/` | 4 |
| `test/tag-apply-test.js` (modify) | v3-only symbol can be tagged/pruned/renamed | 4 |
| `test/v3/scanners-cron.test.js` (create) | update-prices guard, preserve-dates, canary, calendar, age, spotcheck, apply-edits, `.gitignore` | 4 |
| `tools/v3/schema.js` (modify) | `{{rd:` + `TODO` rules, exports `TODO_RE`, `stringLeaves` | 5 |
| `tools/v3/compute.js` (modify) | `prepLeg` (shared), `semanticErrors()` | 5 |
| `test/check-v3.js` (modify `checkDoc`) | `details`, `semanticErrors` before compute, `stage:'save'`, `dropped` | 5 |
| `test/v3/{schema,compute,check-v3}.test.js` (modify) | self-test case per new rule | 5 |
| `docs/quality-gate.md` (modify) | E51 row + save note | 5 |
| `tools/fetch-facts.js` (modify) | pure `factsJson()`, `--json`, `main` guard | 6 |
| `tools/fetch-fundamentals.js` (modify) | pure `snapshotJson()`, `--json` | 6 |
| `tools/queue/sidecar.js` (create) | pure `buildSidecar`, `mediansOf`, `writeSidecar` | 6 |
| `test/fixtures/v3/sidecar/ZZZQ.inputs.js`, `ZZZQ.json` (create) | deterministic sidecar fixture (builder output) | 6 |
| `test/v3/sidecar.test.js` (create) | offline tests of the three pure functions + fixture parity | 6 |
| `tools/report.js` (create) | CLI `init export save show diff` + pure `draftFromSidecar`, `diffPaths`, `lightViolations` | 7 |
| `test/v3/report-cli.test.js` (create) | CLI in temp dirs with `--today` | 7 |
| `.claude/hooks/guard-reports.js` (create) | PreToolUse hook (pure `decide`) | 8 |
| `test/v3/hook.test.js` (create) | stdin JSON → deny/allow, fail-open, rtk forms | 8 |
| `docs/hook-setup.md` (create) | owner-paste snippet + fresh `claude -p` verification | 8 |
| `docs/open-items.md`, `docs/decisions.md` (modify) | #49/#50/#51/#52 status · §10 Plan 2b block | 9 |

---

### Task 1: `tools/report-source.js` — one owner of "which files are reports"

**Files:**
- Create: `tools/report-source.js`
- Create: `test/v3/report-source.test.js`

**Interfaces:**
- Consumes: `build.reportEntries(dir) → string[]` (throws `"reports/: X มีทั้ง .html และ .json …"`), `build.loadReportSource(dir, name, seeds) → {symbol, file, content, hash, v3}`, `build.expandReport(src) → html` (all `build.js:636-658`); `RM.readStockMeta`, `RM.readAiModel` (`tools/report-meta.js`); `footerDate` (`tools/queue/footer-date.js`); `C.compute(doc, {seeds}).sm` (`tools/v3/compute.js`).
- Produces (every later task relies on these exact names; `dir` defaults to `<repo>/reports`, `seeds` defaults to `tools/seeds.json`):
  - `list(dir) → [{ symbol: string, name: string, v3: boolean }]` sorted by file name; throws on both files for one symbol.
  - `symbols(dir) → Set<string>` (upper-case, both kinds).
  - `kindOf(sym, dir) → 'v2' | 'v3' | null`; throws on both files.
  - `exists(sym, dir) → boolean`.
  - `load(sym, dir) → null | { symbol, v3: false, name, raw } | { symbol, v3: true, name, doc }` (JSON parse error → throws with the file name).
  - `metaLite(sym, dir) → null | { symbol, v3, currency, px, analysisDate, era, aiModel }` — no compute/render.
  - `stockMeta(sym, dir, seeds) → object | null` — v2 = the file's `stock-meta` block, v3 = `compute(doc,{seeds}).sm`.
  - `renderedHtml(sym, dir, seeds) → string` — the expanded page exactly as `build.js` expands it (before `decorateReport`/`injectTA`).
  - `isV3Path(p) → boolean` (`/\.json$/i`), `REPORTS_DIR`.

- [ ] **Step 1: Write the failing test**

Create `test/v3/report-source.test.js`:

```js
'use strict';
// Plan 2b Task 1 — tools/report-source.js = จุดเดียวที่ตอบ "ไฟล์ไหนคือรายงาน" (spec §6.5)
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามสร้างไฟล์ใต้ reports/ จริง (tripwire no-json-reports)
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('report-source');
const RS = require('../../tools/report-source.js');
const RM = require('../../tools/report-meta.js');
const C = require('../../tools/v3/compute.js');
const R = require('../../_template/v3/render.js');
const { expandReport } = require('../../build.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const V2SRC = path.join(FIX, 'AAPL-v2.html'), V3SRC = path.join(FIX, 'v3', 'ZTS-real.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-report-source-'));
fs.copyFileSync(V2SRC, path.join(tmp, 'AAPL.html'));
fs.copyFileSync(V3SRC, path.join(tmp, 'ZTS.json'));
fs.writeFileSync(path.join(tmp, 'notes.txt'), 'not a report');
try {
  t.eq(RS.list(tmp), [{ symbol: 'AAPL', name: 'AAPL.html', v3: false }, { symbol: 'ZTS', name: 'ZTS.json', v3: true }], 'list: both kinds, sorted, non-report files ignored');
  t.eq([...RS.symbols(tmp)].sort(), ['AAPL', 'ZTS'], 'symbols: upper-case set of both kinds');
  t.eq([RS.kindOf('AAPL', tmp), RS.kindOf('ZTS', tmp), RS.kindOf('NOPE', tmp)], ['v2', 'v3', null], 'kindOf: v2 / v3 / none');
  t(RS.exists('ZTS', tmp) && !RS.exists('NOPE', tmp), 'exists: either file counts');
  t(RS.isV3Path('reports/ZTS.json') && !RS.isV3Path('reports/ZTS.html'), 'isV3Path');

  const raw = fs.readFileSync(V2SRC, 'utf8'), sm = RM.readStockMeta(raw);
  const doc = JSON.parse(fs.readFileSync(V3SRC, 'utf8'));
  t.eq(RS.metaLite('AAPL', tmp), { symbol: 'AAPL', v3: false, currency: sm.currency, px: sm.price, analysisDate: '2026-06-22', era: 'CE', aiModel: RM.readAiModel(raw) }, 'metaLite v2: stock-meta + footer + ai-model');
  t.eq(RS.metaLite('ZTS', tmp), { symbol: 'ZTS', v3: true, currency: 'USD', px: doc.market.px, analysisDate: doc.meta.analysisDate, era: 'BE', aiModel: doc.meta.aiModel }, 'metaLite v3: straight from JSON');
  t.eq(RS.metaLite('NOPE', tmp), null, 'metaLite: missing symbol → null');
  t.eq(RS.load('ZTS', tmp).doc, doc, 'load v3: parsed doc');
  t.eq(RS.load('AAPL', tmp).raw, raw, 'load v2: raw html');

  t.eq(RS.stockMeta('AAPL', tmp), sm, 'stockMeta v2 = the embedded block');
  t.eq(RS.stockMeta('ZTS', tmp, {}).mos, C.compute(doc, { seeds: {} }).sm.mos, 'stockMeta v3 = compute().sm');

  t(RS.renderedHtml('AAPL', tmp) === expandReport(raw), 'renderedHtml v2 = expandReport(source) — the path build.js takes');
  t(RS.renderedHtml('ZTS', tmp, {}) === expandReport(R.toV2Source(doc, C.compute(doc, { seeds: {} }))), 'renderedHtml v3 = expandReport(toV2Source(compute))');
  t.throws(() => RS.renderedHtml('NOPE', tmp), /ไม่มี reports\/NOPE/, 'renderedHtml: missing symbol throws');

  fs.writeFileSync(path.join(tmp, 'BAD.json'), '{ not json');
  t.throws(() => RS.load('BAD', tmp), /BAD\.json: JSON เสีย/, 'load: broken JSON names the file');
  fs.unlinkSync(path.join(tmp, 'BAD.json'));

  fs.copyFileSync(V2SRC, path.join(tmp, 'ZTS.html'));
  t.throws(() => RS.list(tmp), /ZTS มีทั้ง \.html และ \.json/, 'list: both files for one symbol → throw (same rule as build)');
  t.throws(() => RS.kindOf('ZTS', tmp), /ZTS มีทั้ง \.html และ \.json/, 'kindOf: both files → throw');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
t.done();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk proxy node test/v3/report-source.test.js`
Expected: FAIL with `Cannot find module '../../tools/report-source.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/report-source.js`:

```js
'use strict';
/**
 * report-source.js — "ไฟล์ไหนคือรายงาน" จุดเดียว (spec §6.5 · Plan 2b · open-item #49)
 *   ใบ v2 = reports/<SYM>.html · ใบ v3 = reports/<SYM>.json · หุ้นเดียวห้ามมีทั้งสอง (กติกาเดียวกับ build.reportEntries)
 *   scanner ทุกตัวอ่านผ่านที่นี่ — ห้ามก๊อป readdirSync(...).filter(/\.html$/) ใหม่ (เดิมก๊อปไว้ ~20 จุด)
 * ★ require build.js แบบ lazy (ใน list/renderedHtml): tools/update-prices.js และ tools/dead-ticker-canary.js require ไฟล์นี้
 *   และ build.js โหลด v3 compute/render ทั้งชุด — โหลดเฉพาะตอนต้องใช้
 * ★ metaLite = ค่าเบา (ไม่ compute/render) · stockMeta = กระจกเต็ม (v3 ต้อง compute) · renderedHtml = หน้าแบบที่ build expand
 */
const fs = require('fs');
const path = require('path');
const RM = require('./report-meta.js');
const { footerDate } = require('./queue/footer-date.js');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const B = () => require('../build.js');
let seedsCache = null;
const defaultSeeds = () => seedsCache || (seedsCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8')));

const isV3Path = (p) => /\.json$/i.test(String(p));

/** [{ symbol, name, v3 }] เรียงตามชื่อไฟล์ — ผ่าน build.reportEntries (throw เมื่อหุ้นเดียวมีทั้ง .html และ .json) */
function list(dir) {
  return B().reportEntries(dir || REPORTS_DIR).slice().sort()
    .map((name) => ({ symbol: name.replace(/\.(html|json)$/i, ''), name, v3: isV3Path(name) }));
}
/** Set ของ symbol ตัวพิมพ์ใหญ่ทั้งสองแบบ — reportExists ของ cron/canary (flag ของใบ v3 ต้องไม่ถูกตัดทิ้ง) */
const symbols = (dir) => new Set(list(dir).map((e) => e.symbol.toUpperCase()));
/** 'v2' | 'v3' | null · มีทั้งสองไฟล์ = throw ข้อความเดียวกับ build */
function kindOf(sym, dir) {
  const d = dir || REPORTS_DIR;
  const h = fs.existsSync(path.join(d, sym + '.html')), j = fs.existsSync(path.join(d, sym + '.json'));
  if (h && j) throw new Error(`reports/: ${sym} มีทั้ง .html และ .json (ลบไฟล์ v2 ออกเมื่อย้ายเป็น v3)`);
  return j ? 'v3' : h ? 'v2' : null;
}
const exists = (sym, dir) => kindOf(sym, dir) !== null;
/** null | { symbol, v3:false, name, raw } | { symbol, v3:true, name, doc } — JSON เสีย = throw พร้อมชื่อไฟล์ */
function load(sym, dir) {
  const d = dir || REPORTS_DIR, k = kindOf(sym, d);
  if (!k) return null;
  const name = sym + (k === 'v3' ? '.json' : '.html');
  const raw = fs.readFileSync(path.join(d, name), 'utf8');
  if (k === 'v2') return { symbol: sym, v3: false, name, raw };
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { throw new Error(`reports/${name}: JSON เสีย — ${e.message}`); }
  return { symbol: sym, v3: true, name, doc };
}
/** ค่าเบาที่ scanner ใช้ — v2: stock-meta + footer "ข้อมูล ณ" + <meta ai-model> · v3: JSON ตรง (meta.analysisDate/dateEra/market.px) */
function metaLite(sym, dir) {
  const s = load(sym, dir);
  if (!s) return null;
  if (s.v3) {
    const doc = s.doc, meta = doc.meta || {}, mk = doc.market || {};
    return { symbol: sym, v3: true, currency: doc.currency || null, px: Number.isFinite(mk.px) ? mk.px : null,
      analysisDate: meta.analysisDate || null, era: doc.dateEra || null, aiModel: meta.aiModel || null };
  }
  const sm = RM.readStockMeta(s.raw), fd = footerDate(s.raw);
  return { symbol: sym, v3: false, currency: sm ? sm.currency || null : null, px: sm && Number.isFinite(sm.price) ? sm.price : null,
    analysisDate: fd ? fd.iso : null, era: fd ? fd.era : null, aiModel: RM.readAiModel(s.raw) };
}
/** กระจก stock-meta — v2 อ่านบล็อกในไฟล์ · v3 = compute().sm (ค่าเดียวกับที่ build ฝังลงหน้า) */
function stockMeta(sym, dir, seeds) {
  const s = load(sym, dir);
  if (!s) return null;
  if (!s.v3) return RM.readStockMeta(s.raw);
  return require('./v3/compute.js').compute(s.doc, { seeds: seeds || defaultSeeds() }).sm;
}
/** หน้าที่ expand แล้ว (ก่อน decorate/TA ของ dist) — ทางเดียวกับ build: loadReportSource → expandReport */
function renderedHtml(sym, dir, seeds) {
  const d = dir || REPORTS_DIR, k = kindOf(sym, d);
  if (!k) throw new Error(`ไม่มี reports/${sym}.html หรือ reports/${sym}.json`);
  const b = B();
  return b.expandReport(b.loadReportSource(d, sym + (k === 'v3' ? '.json' : '.html'), seeds || defaultSeeds()).content);
}

module.exports = { list, symbols, kindOf, exists, load, metaLite, stockMeta, renderedHtml, isV3Path, REPORTS_DIR };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk proxy node test/v3/report-source.test.js && rtk proxy node test/v3-test.js 2>&1 | tail -20`
Expected: `✓ report-source: N/N`; every v3-test line `✓` (tripwire `no-json-reports` still passes).

- [ ] **Step 5: Commit**

```bash
git add tools/report-source.js test/v3/report-source.test.js
git commit -m "feat(v3): tools/report-source.js — one owner of which files are reports (spec §6.5)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 2: Scanner batch A — verify-path tests (`check-reports` CLI hand-off · `engine-exec` · `tags-test` · `fixture-lint`)

**Files:**
- Modify: `test/check-reports.js:1014-1041` (CLI section only — no CHECK is touched)
- Modify: `test/engine-exec.js:136-177` (`main`)
- Modify: `test/tags-test.js:166` (corpus symbols)
- Modify: `test/fixture-lint.js` (patterns + scanned dirs)
- Create: `test/v3/scanners-verify.test.js`

**Interfaces:**
- Consumes: `RS.list`, `RS.renderedHtml` (Task 1); `CV.runCli(args, {reportsDir, fixtureDir, log}) → 0|1` (`test/check-v3.js:229`); `E.extractEngine`, `E.runEngine`, `E.assertRendered`, `E.seedFromHtml` (`test/engine-exec.js` exports).
- Produces: `CR.runCli(argv: string[], opts?: {reportsDir?, log?, err?}) → 0|1` (exported from `test/check-reports.js`); `FL.DIRS: string[]` (exported from `test/fixture-lint.js`). `npm test -- <v3 SYM>` now reaches `check-v3` (finding M1).

- [ ] **Step 1: Write the failing test**

Create `test/v3/scanners-verify.test.js`:

```js
'use strict';
// Plan 2b Task 2 — scanner ชุด verify อ่านใบ v3 ผ่าน tools/report-source.js (spec §6.5 · finding M1)
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามสร้างไฟล์ใต้ reports/ จริง (tripwire no-json-reports)
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('scanners-verify');
const CR = require('../check-reports.js');
const CV = require('../check-v3.js');
const E = require('../engine-exec.js');
const FL = require('../fixture-lint.js');
const RS = require('../../tools/report-source.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-scan-verify-'));
fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'AAPL.html'));
fs.copyFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), path.join(tmp, 'ZTS.json'));
{ // ใบ v3 ที่ถูกแก้มือหลังเซ็น (ไม่ผ่าน io.js) — E50 ต้องโผล่ผ่าน npm test -- SYM โดยไม่ขึ้นกับนาฬิกา
  const bad = JSON.parse(fs.readFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), 'utf8'));
  bad.prose.mos += ' (แก้มือ)';
  fs.writeFileSync(path.join(tmp, 'ZZB.json'), JSON.stringify(bad, null, 2) + '\n');
}
const cli = (args) => {
  const out = [];
  const code = CR.runCli(args, { reportsDir: tmp, log: (s) => out.push(String(s)), err: (s) => out.push(String(s)) });
  return { code, out: out.join('\n') };
};
try {
  { const a = cli(['ZTS']), b = CV.runCli(['ZTS'], { reportsDir: tmp, log: () => {} });
    t(/check-v3/.test(a.out) && /ZTS\.json/.test(a.out) && !/ไม่พบไฟล์รายงานให้ตรวจ/.test(a.out), 'npm test -- <v3 SYM> hands off to check-v3 (M1: no "ไม่พบไฟล์รายงานให้ตรวจ")');
    t.eq(a.code, b, 'exit code of the hand-off = check-v3 exit code'); }
  { const a = cli(['zzb.json']); t(a.code === 1 && /\[E50\]/.test(a.out), 'hand-edited v3 file → E50 through npm test -- SYM (lower-case + .json accepted), exit 1'); }
  { const a = cli(['AAPL', 'ZZB']); t(a.code === 1 && /AAPL\.html/.test(a.out) && /\[E50\]/.test(a.out), 'mixed v2+v3 args: both checked, exit codes combined'); }
  { const a = cli(['NOPE']); t(a.code === 1 && /ไม่พบไฟล์รายงานให้ตรวจ/.test(a.out), 'unknown symbol still exits 1'); }
  { const a = cli([]); t(/AAPL\.html/.test(a.out) && /ใบ v3 2 ใบ/.test(a.out) && !/\[E50\]/.test(a.out), 'sweep: v2 checked, v3 only counted and pointed at check-v3 (R8)'); }
  { fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'ZTS.html'));
    const a = cli(['ZTS']);
    t(a.code === 1 && /ZTS มีทั้ง \.html และ \.json/.test(a.out), 'both files for one symbol → exit 1 naming it');
    fs.unlinkSync(path.join(tmp, 'ZTS.html')); }
  { const html = RS.renderedHtml('ZTS', tmp);
    const r = E.runEngine(E.extractEngine(html), E.seedFromHtml(html));
    t(r.ok && E.assertRendered(r.doc).length === 0, 'engine-exec: a v3 page runs its engine in the mock DOM (chart + gauge + MOS calc)'); }
  const sample = "path.join(ROOT, 'report" + "s', 'ZTS.json')";   // ต่อสตริงเพื่อไม่ให้ fixture-lint จับไฟล์นี้เอง
  t(FL.PATTERNS.some((re) => re.test(sample)), 'fixture-lint: pattern also catches reports/<SYM>.json');
  t(FL.DIRS.includes(__dirname), 'fixture-lint: scans test/v3 too');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
t.done();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk proxy node test/v3/scanners-verify.test.js`
Expected: FAIL — `CR.runCli is not a function` (thrown), or `✗ … fixture-lint` lines.

- [ ] **Step 3: Convert `test/check-reports.js` CLI**

Replace the whole `// ---------- CLI ----------` section (from `function main() {` through `if (require.main === module) main();`, lines 1014-1041) with:

```js
// ---------- CLI ----------
// ใบ v3 (reports/<SYM>.json · Plan 2b · spec §6.5): ระบุชื่อมา → ส่งต่อ test/check-v3.js แล้วรวม exit code
//   (เดิมขึ้น "ไม่พบไฟล์รายงานให้ตรวจ" exit 1 = ตัวกระตุ้นอันดับ 1 ให้ worker ถอยไปเขียน HTML — finding M1)
//   กวาดทั้งคลัง (ไม่ใส่ arg) ยังตรวจแค่ใบ v2 — ใบ v3 เป็นงานของขั้น check-v3 ถัดไปใน verify (พิมพ์บรรทัดบอกจำนวน)
function runCli(argv, opts) {
  const o = opts || {};
  const dir = o.reportsDir || REPORTS_DIR, log = o.log || console.log, err = o.err || console.error;
  if (!fs.existsSync(dir)) { err('❌ ไม่พบโฟลเดอร์ reports/'); return 1; }
  let entries;
  try { entries = require('../tools/report-source.js').list(dir); }
  catch (e) { err('❌ ' + e.message); return 1; }
  const want = argv.length ? new Set(argv.map((a) => a.replace(/\.(html|json)$/i, '').toUpperCase())) : null;
  const pick = (e) => !want || want.has(e.symbol.toUpperCase());
  const files = entries.filter((e) => !e.v3 && pick(e)).map((e) => e.name);
  const v3 = want ? entries.filter((e) => e.v3 && pick(e)).map((e) => e.symbol) : [];
  if (!files.length && !v3.length) { err('❌ ไม่พบไฟล์รายงานให้ตรวจ'); return 1; }
  let code = files.length ? runV2(files, dir, log) : 0;
  if (!want) { const n = entries.filter((e) => e.v3).length; if (n) log(`ℹ ใบ v3 ${n} ใบ — ตรวจโดย node test/check-v3.js (ขั้นถัดไปของ verify)`); }
  if (v3.length) {
    log(`\n↪ ใบ v3 ${v3.join(' ')} → test/check-v3.js`);
    code = Math.max(code, require('./check-v3.js').runCli(v3, { reportsDir: dir, log }));
  }
  return code;
}

function runV2(files, dir, log) {
  log(`\n🔍 ตรวจคุณภาพรายงาน ${files.length} ไฟล์ (reports/)\n`);
  let totErr = 0, totWarn = 0, failFiles = 0, minCov = null;
  for (const f of files) {
    const r = checkFile(path.join(dir, f));
    totErr += r.errors.length; totWarn += r.warnings.length;
    // ★ coverage ต่อไฟล์ — ไฟล์ที่ expandReport ระเบิด (id EXPAND) ไม่มี ctx จึงไม่มี coverage ⇒ เว้นไว้ ไม่ใช่ 0
    const cov = r.coverage ? ` · ช่อง ${r.coverage.found}/${r.coverage.n}${r.coverage.skippedOptional.length ? ` (ข้าม ${r.coverage.skippedOptional.length})` : ''}` : '';
    if (r.coverage && (!minCov || r.coverage.found < minCov.found)) minCov = { found: r.coverage.found, n: r.coverage.n, name: r.symbol };
    if (r.errors.length) { failFiles++; log(`✗ ${f.padEnd(13)} ${r.errPass}/${r.errTotal} ผ่าน — ${r.errors.length} ปัญหา${cov}`); }
    else log(`✓ ${f.padEnd(13)} ${r.errTotal}/${r.errTotal} ผ่าน${r.warnings.length ? `   (⚠ ${r.warnings.length})` : ''}${cov}`);
    for (const e of r.errors) log(`    ✗ [${e.id}] ${e.label}: ${e.msg}`);
    for (const w of r.warnings) log(`    ⚠ [${w.id}] ${w.label}: ${w.msg}`);
  }
  log('\n' + '─'.repeat(50));
  log(`สรุป: ${files.length - failFiles}/${files.length} ไฟล์ผ่าน • error ${totErr} • warning ${totWarn}${minCov ? ` • ช่องต่ำสุด ${minCov.found}/${minCov.n} (${minCov.name})` : ''}`);
  if (totErr) { log('\n❌ มี error — ห้าม push (แก้รายงานให้ผ่านก่อน)\n'); return 1; }
  log(`\n✅ ผ่าน quality gate — พร้อม build & push${totWarn ? ` (มี ${totWarn} warning ที่ควรดู)` : ''}\n`);
  return 0;
}
module.exports.runCli = runCli;

// exitCode ไม่ใช่ process.exit — ให้ stdout ที่ pipe อยู่ flush ครบก่อนจบ (exit code เท่าเดิม 0/1)
function main() { process.exitCode = runCli(process.argv.slice(2)); }
if (require.main === module) main();
```

The per-file line format (`✗ SYM.html …`) is unchanged — `tools/queue/preflight.js parseGateFailures` anchors on it.

- [ ] **Step 4: Convert `test/engine-exec.js` `main`**

Add below `const { expandReport, renderEngine } = require('../build.js');`:

```js
const RS = require('../tools/report-source.js');   // ใบ v2 + v3 (Plan 2b) — ทางเดียวกับ build: loadReportSource → expandReport
```

In `main()`, replace the block from `let files = fs.readdirSync(REPORTS_DIR)…` through the end of the `for (const f of files) { … }` loop with:

```js
  let entries = RS.list(REPORTS_DIR);
  if (argv.length) { const want = new Set(argv.map((a) => a.replace(/\.(html|json)$/i, '').toUpperCase())); entries = entries.filter((e) => want.has(e.symbol.toUpperCase())); }
  if (!entries.length) { console.error('❌ ไม่พบไฟล์รายงานให้ตรวจ'); process.exit(1); }

  let fail = 0;
  const bad = [];
  for (const e of entries) {
    const f = e.name;
    let html;
    try { html = RS.renderedHtml(e.symbol, REPORTS_DIR); }
    catch (err) { bad.push({ f, errs: ['expandReport throw: ' + err.message] }); fail++; continue; }
    const body = extractEngine(html);
    if (!body) { bad.push({ f, errs: ['ไม่พบสคริปต์ engine (ที่อ้าง priceChart)'] }); fail++; continue; }
    const r = runEngine(body, seedFromHtml(html));
    if (!r.ok) { bad.push({ f, errs: ['engine throw ตอนรัน: ' + (r.error && r.error.message)] }); fail++; continue; }
    const errs = assertRendered(r.doc);
    if (errs.length) { bad.push({ f, errs }); fail++; }
  }
```

and in the summary line replace `${files.length - fail}/${files.length}` with `${entries.length - fail}/${entries.length}`.

- [ ] **Step 5: Convert `test/tags-test.js:166`**

Add `const RS = require('../tools/report-source.js');` next to `const T = require('../tools/tag-lib.js');`, and replace

```js
const syms = fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, ''));
```

with

```js
// ใบ v2 (.html) + ใบ v3 (.json) — tag ของใบ v3 ต้องไม่ถูกนับเป็น orphan (Plan 2b · finding M5)
const syms = RS.list(path.join(ROOT, 'reports')).map((e) => e.symbol);
```

- [ ] **Step 6: Convert `test/fixture-lint.js`**

Replace the `PATTERNS` constant, `scan`'s caller and the exports with:

```js
const PATTERNS = [
  /readFileSync\([^)]*['"`]reports['"`]/,
  /['"`]reports['"`]\s*,\s*['"`][A-Za-z0-9.\-]+\.(?:html|json)['"`]/,   // ใบ v3 = reports/<SYM>.json (Plan 2b)
];
// test/v3/*.test.js ก็อยู่ใน verify (ผ่าน test/v3-test.js) — ต้องถูกสแกนด้วย
const DIRS = [__dirname, path.join(__dirname, 'v3')];
```

(keep `scan(dir)` as is) and

```js
module.exports = function fixtureLint(ok) {
  for (const dir of DIRS)
    for (const { file, hits } of scan(dir))
      ok(hits.length === 0, `fixture-lint: ${path.relative(__dirname, path.join(dir, file))} ไม่อ่าน reports/ เป็น fixture` + (hits.length ? ` (บรรทัด ${hits.join(',')} — ย้ายไป test/fixtures/)` : ''));
};
module.exports.scan = scan;
module.exports.PATTERNS = PATTERNS;
module.exports.DIRS = DIRS;
```

- [ ] **Step 7: Run the tests**

Run: `rtk proxy node test/v3/scanners-verify.test.js && rtk proxy node test/v3-test.js 2>&1 | tail -20 && npm run test:self 2>&1 | tail -3 && node test/tags-test.js | tail -2 && npm test 2>&1 | tail -3 && node test/engine-exec.js | tail -2`
Expected: `✓ scanners-verify: N/N`; v3-test all `✓`; self-test green (fixture-lint now also lists `v3/*.test.js`, all passing); tags-test `✅`; `npm test` (909 v2 files) `✅ ผ่าน quality gate`; engine-exec `909/909`.

- [ ] **Step 8: DIST-PROOF**

Run the DIST-PROOF block from Global Constraints. Expected: `DIST IDENTICAL`, empty `git status` line.

- [ ] **Step 9: Commit**

```bash
git add test/check-reports.js test/engine-exec.js test/tags-test.js test/fixture-lint.js test/v3/scanners-verify.test.js
git commit -m "feat(v3): scanner batch A — npm test hands v3 symbols to check-v3, engine-exec/tags-test/fixture-lint read .json

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---
### Task 3: Scanner batch B — queue tools (`ship` · `postcheck` · `prep` · `preflight`)

**Files:**
- Modify: `tools/queue/ship.js:16-19` (imports), `:24` (`STOCK_FILES`), `:58-62` (`reportAiModel`), `:218` (`reportDirty`), `:252-255` (not-found message), `:262` (MOS for the commit message), `:295-349` (`prepatchBlockers`, `shipPrepatch`), exports
- Modify: `tools/queue/postcheck.js:10-16` (imports), `:58-80` (`postcheck` head), exports
- Modify: `tools/queue/prep.js:12-21` (imports), `:283-287` (`prep` head), exports
- Modify: `tools/queue/preflight.js:13-35` (imports + readers), `:40-73` (`earningsAfterOfWith`, `statementAfterOfWith`), `:114-121` (`plan` loop), `:125-137` (`patchTargets`), `preflight()` reader wiring + one info line
- Test: `test/queue-test.js` (new section 23, inserted just above the line `// ─────────────────────────── (Task 10–14 แทรกเทสเหนือบรรทัดนี้) ───────────────────────────`)

**Interfaces:**
- Consumes: `RS.list`, `RS.kindOf`, `RS.load`, `RS.metaLite`, `RS.stockMeta`, `RS.renderedHtml` (Task 1); `P.proseFields(doc) → [{path, text}]` (`tools/v3/prose.js`).
- Produces:
  - `Sh.STOCK_FILES(sym)` now lists `reports/<SYM>.html` **and** `reports/<SYM>.json` (the caller already filters to existing files).
  - `Sh.reportAiModel(sym, dir?) → string|null` (v3 = `meta.aiModel`).
  - `Sh.prepatchBlockers(entries) → { blocked, unreadable, foreign }` — `foreign` = every changed path under `reports/` that is not `reports/<SYM>.html` (fail closed).
  - `Sh.prepatchRefusal({blocked, foreign}) → string|null` — the error `shipPrepatch` throws.
  - `Pc.oldPriceHaystack(src) → string` (`src` = `RS.load` result).
  - `Pp.checkNotV3(sym, dir?)` — throws `"… v3 UPDATE = Plan 3 …"` for a v3 symbol.
  - `P.plan(flags, today, {…, liteOf?})` rows gain `v3: boolean`; `P.patchTargets(rows, m)` gains `skippedV3: string[]`; `earningsAfterOfWith`/`statementAfterOfWith` accept a reader that returns **either** raw v2 html (old tests) **or** a `metaLite` object.

- [ ] **Step 1: Write the failing tests**

Insert into `test/queue-test.js`, directly above the `(Task 10–14 แทรกเทสเหนือบรรทัดนี้)` marker line:

```js
// ── 23) v3 (Plan 2b Task 3) — queue tools อ่าน reports/<SYM>.json ผ่าน tools/report-source.js ──
//   ★ sandbox ใต้ os.tmpdir() (หัวไฟล์: ห้ามอ่าน reports/) — ใบ v3 = ZTS-real ที่เซ็นแล้ว · ใบ v2 = AAPL-v2 fixture
{
  const RS = require('../tools/report-source.js');
  const Sh = require('../tools/queue/ship.js');
  const Pc = require('../tools/queue/postcheck.js');
  const Pp = require('../tools/queue/prep.js');
  const P = require('../tools/queue/preflight.js');
  const V3DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-v3-'));
  fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', 'v3', 'ZTS-real.json'), path.join(V3DIR, 'ZTS.json'));
  fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', 'AAPL-v2.html'), path.join(V3DIR, 'AAPL.html'));
  try {
    // ship
    ok(Sh.STOCK_FILES('ZTS').includes('reports/ZTS.json') && Sh.STOCK_FILES('ZTS').includes('reports/ZTS.html'), 'v3/ship: STOCK_FILES มีทั้ง .html และ .json (กรองไฟล์ที่มีจริงตอน add)');
    ok(Sh.reportAiModel('ZTS', V3DIR) === 'Claude Sonnet 5', 'v3/ship: ai-model ของ trailer มาจาก meta.aiModel', String(Sh.reportAiModel('ZTS', V3DIR)));
    ok(Sh.reportAiModel('AAPL', V3DIR) === 'Claude Opus 4.8' && Sh.reportAiModel('NOPE', V3DIR) === null, 'v3/ship: ใบ v2 ยังอ่าน <meta ai-model> · ไม่มีไฟล์ = null');
    const pb = Sh.prepatchBlockers([
      { path: 'reports/NEWV3.json', untracked: true, headFooterISO: null, workFooterISO: null },
      { path: 'reports/ZTS.json', untracked: false, headFooterISO: null, workFooterISO: null },
      { path: 'reports/README.md', untracked: true, headFooterISO: null, workFooterISO: null },
      { path: 'reports/KLAC.html', untracked: false, headFooterISO: '2026-09-10', workFooterISO: '2026-09-10' },
    ]);
    ok(pb.foreign.join(',') === 'reports/NEWV3.json,reports/ZTS.json,reports/README.md' && !pb.blocked.length && !pb.unreadable.length,
      'v3/ship: prepatch fail closed — ทุก path ใต้ reports/ ที่ไม่ใช่ .html = foreign (ไม่ใช่ unreadable/ผ่าน)', JSON.stringify(pb));
    ok(/reports\/NEWV3\.json ไม่ใช่ใบ v2/.test(Sh.prepatchRefusal(pb) || '') && Sh.prepatchRefusal({ blocked: [], foreign: [] }) === null, 'v3/ship: prepatchRefusal ปฏิเสธเมื่อมี foreign · ว่าง = null');
    const mv = Sh.prepatchBlockers(Sh.parsePorcelain('R  reports/X.html -> reports/X.json').map((e) => ({ path: e.path, untracked: e.isNew, headFooterISO: '2026-09-01', workFooterISO: '2026-09-01' })));
    ok(mv.foreign.join(',') === 'reports/X.json', 'v3/ship: git mv .html → .json = blocker (Review Focus 4)', JSON.stringify(mv));
    // prep
    let v3Err = null; try { Pp.checkNotV3('ZTS', V3DIR); } catch (e) { v3Err = e.message; }
    ok(/v3 UPDATE = Plan 3/.test(v3Err || '') && /report\.js export ZTS/.test(v3Err || ''), 'v3/prep: symbol ที่เป็นใบ v3 แล้ว → ปฏิเสธ ("v3 UPDATE = Plan 3")', v3Err);
    let v2Err = 'none'; try { Pp.checkNotV3('AAPL', V3DIR); Pp.checkNotV3('NEWCO', V3DIR); } catch (e) { v2Err = e.message; }
    ok(v2Err === 'none', 'v3/prep: ใบ v2 และหุ้นใหม่ผ่าน checkNotV3', v2Err);
    // postcheck
    const src = RS.load('ZTS', V3DIR);
    src.doc.prose.mos += ' เคยซื้อขายที่ $55.55';
    const hay = Pc.oldPriceHaystack(src);
    ok(Pc.findOldPrice(hay, 55.55).length === 1 && !hay.includes('"market"') && !hay.includes('71.33'), 'v3/postcheck: grep ราคาเดิมค้างเฉพาะ prose (P.proseFields) ไม่ใช่ market/JSON');
    ok(Pc.oldPriceHaystack(RS.load('AAPL', V3DIR)) === fs.readFileSync(path.join(V3DIR, 'AAPL.html'), 'utf8'), 'v3/postcheck: ใบ v2 ยัง grep ทั้งไฟล์เหมือนเดิม');
    // preflight
    const liteOf = (s) => RS.metaLite(s, V3DIR);
    const rows = P.plan([{ symbol: 'ZTS', reason: 'drift-gt-15pct', diffPct: 20 }, { symbol: 'AAPL', reason: 'drift-gt-15pct', diffPct: 20 }], '2026-09-22',
      { ageLimit: 0, footerAgeOf: () => 30, lightRule: 'legacy', liteOf });
    const byS = Object.fromEntries(rows.map((r) => [r.symbol, r]));
    ok(byS.ZTS.v3 === true && byS.ZTS.oldPrice === 71.33 && byS.ZTS.currency === 'USD' && byS.AAPL.v3 === false && byS.AAPL.currency === 'USD',
      'v3/preflight: ราคาเดิม/สกุลของใบ v3 มาจาก market.px/currency', JSON.stringify(rows.map((r) => [r.symbol, r.v3, r.oldPrice, r.currency])));
    const pt = P.patchTargets(rows, { usOpen: false, setOpen: false, allowIntraday: false });
    ok(pt.skippedV3.join(',') === 'ZTS' && !pt.target.includes('ZTS') && pt.target.includes('AAPL'), 'v3/preflight: ใบ v3 ไม่เข้า pre-patch (v3 cron = Plan 3) · ใบ v2 เข้าเหมือนเดิม', JSON.stringify(pt));
    const cal = { symbols: { ZTS: { last: '2026-09-25' } } };
    const lite = { analysisDate: '2026-09-22', currency: 'THB' };
    const html = '<script type="application/json" id="stock-meta">{"currency":"THB"}</script><footer>ข้อมูล ณ 22 ก.ย. 2569</footer>';
    ok(P.earningsAfterOfWith(cal, () => lite)('ZTS') === true && P.earningsAfterOfWith(cal, () => html)('ZTS') === true, 'v3/preflight: earningsAfterOf อ่าน metaLite ได้เหมือน html');
    const sa = (read) => P.statementAfterOfWith(cal, read, { today: '2026-09-30', sec: null })('ZTS');
    ok(JSON.stringify(sa(() => lite)) === JSON.stringify(sa(() => html)), 'v3/preflight: statementAfterOf จาก metaLite = จาก html (วันวิเคราะห์ + สกุล TH)', JSON.stringify([sa(() => lite), sa(() => html)]));
  } finally { fs.rmSync(V3DIR, { recursive: true, force: true }); }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk proxy node test/queue-test.js 2>&1 | tail -15`
Expected: FAIL — `✗ v3/ship: STOCK_FILES …`, `✗ v3/ship: prepatch fail closed …` (`pb.foreign` undefined), `Pp.checkNotV3 is not a function`, `Pc.oldPriceHaystack is not a function` (thrown inside the block → the whole file exits non-zero).

- [ ] **Step 3: Convert `tools/queue/ship.js`**

Imports (lines 18-19) become:

```js
const { todayBangkok, footerDate } = require('./footer-date.js');
const { parseAiModel } = require('../report-meta.js');
const RS = require('../report-source.js');   // ใบ v2 (.html) + ใบ v3 (.json) — "ไฟล์ไหนคือรายงาน" จุดเดียว (Plan 2b)
```

`STOCK_FILES` (line 24):

```js
// ใบ v3 = reports/<SYM>.json (Plan 2b) — caller กรองเฉพาะไฟล์ที่มีจริงก่อน git add เสมอ
const STOCK_FILES = (sym) => [`reports/${sym}.html`, `reports/${sym}.json`, 'tags.json', 'tools/seeds.json', 'price-flags.json', 'reports.json'];
```

`reportAiModel` (lines 58-62):

```js
/** ป้าย ai-model ของใบ (ไม่มีไฟล์ = null — ให้ resolveTrailer ตกไปทางเดิม) · v2 = <meta ai-model> · v3 = meta.aiModel */
function reportAiModel(sym, dir) {
  const m = RS.metaLite(sym, dir || path.join(ROOT, 'reports'));
  return m ? m.aiModel : null;
}
```

In `shipStock`, line 218:

```js
  const reportDirty = !!run('git', ['status', '--porcelain', '--', `reports/${sym}.html`, `reports/${sym}.json`]).out.trim();
```

the not-found error (lines 252-255) now names both files:

```js
    throw new Error(`${sym}: ไม่มีอะไรให้ commit และไม่พบ commit ของหุ้นนี้ทั้งในเครื่องและบน origin/main\n`
      + `  · worker ยังไม่ได้เขียน reports/${sym}.html หรือ reports/${sym}.json? (เช็ค cwd-stray — STEP 0)\n`
      + `  · หรือใบนี้ถูก push ไปนานแล้วนอกขอบเขตรอบนี้ — ตรวจด้วย: git log origin/main --oneline -- reports/${sym}.html reports/${sym}.json`);
```

and line 262:

```js
  const sm = RS.stockMeta(sym, path.join(ROOT, 'reports'));   // v2 = บล็อก stock-meta · v3 = compute().sm (MOS ของ commit message)
```

Replace `prepatchBlockers` (lines 295-309) with:

```js
/** ปฏิเสธไฟล์ใน reports/ ที่ worker วิเคราะห์ใหม่แล้ว (ไม่ใช่แค่ pre-patch ราคาที่ preflight ทำ) — `ship --prepatch`
 *  ต้องไม่กวาดไปเป็น commit "price: …" ทั้งที่ยังไม่ผ่าน postcheck/รีวิว
 *  entries = [{ path, untracked, headFooterISO, workFooterISO }] → คืน { blocked, unreadable, foreign } (ส่วนบริสุทธิ์ ไม่แตะ git)
 *  ★ อ่าน footer ได้ข้างเดียว (เช่น HEAD parse ไม่ออก) = สงสัย → กันไว้ก่อน · อ่านไม่ได้ทั้งสองข้าง = ไม่รู้จริง ๆ → ไม่กัน แต่ขึ้น unreadable ให้คนตรวจเอง
 *  ★ fail closed (spec §6.5 · Plan 2b): path ใต้ reports/ ที่ไม่ใช่ reports/<SYM>.html (ใบ v3 .json · rename .html→.json · ไฟล์อื่น)
 *    = foreign ⇒ ship --prepatch ปฏิเสธ — เดิม `continue` ข้ามไป ⇒ reports/X.json ที่ยังไม่รีวิวถูกกวาดเข้า commit "price: …" */
function prepatchBlockers(entries) {
  const blocked = [], unreadable = [], foreign = [];
  for (const e of entries) {
    const m = /^reports\/(.+)\.html$/.exec(e.path);
    if (!m) { if (/^reports\//.test(e.path)) foreign.push(e.path); continue; }
    const sym = m[1];
    if (e.untracked) { blocked.push(sym); continue; }   // ไฟล์ใหม่ทั้งใบ = worker เขียน ไม่ใช่ pre-patch ราคา
    const h = e.headFooterISO, w = e.workFooterISO;
    if (h == null && w == null) { unreadable.push(sym); continue; }
    if (h == null || w == null) { blocked.push(sym); continue; }   // อ่านได้ข้างเดียว = สงสัย
    if (h !== w) blocked.push(sym);   // footer ขยับ = วิเคราะห์ใหม่แล้ว
  }
  return { blocked, unreadable, foreign };
}

/** ข้อความที่ `ship --prepatch` throw (ส่วนบริสุทธิ์) — null = ไปต่อได้ */
function prepatchRefusal({ blocked, foreign }) {
  const L = [
    ...(foreign || []).map((p) => `ship --prepatch: ${p} ไม่ใช่ใบ v2 (.html) — pre-patch ราคาเป็นของใบ v2 เท่านั้น (v3 cron = Plan 3) · ใบ v3 ใช้ npm run queue -- ship <SYM> · ไฟล์อื่นใต้ reports/ ต้องย้ายออกก่อน`),
    ...(blocked || []).map((sym) => `ship --prepatch: ${sym} ถูกวิเคราะห์ใหม่แล้ว (footer ขยับ/ไฟล์ใหม่) — ใช้ npm run queue -- ship ${sym} แทน`),
  ];
  return L.length ? L.join('\n') : null;
}
```

In `shipPrepatch`, replace

```js
  const { blocked, unreadable } = prepatchBlockers(entries);
  if (deleted.length) delNote();   // พิมพ์ก่อน throw — รอบที่ถูกบล็อกก็ยังต้องรู้ว่ามีไฟล์ที่ลบรออยู่
  if (blocked.length) throw new Error(blocked.map((sym) => `ship --prepatch: ${sym} ถูกวิเคราะห์ใหม่แล้ว (footer ขยับ/ไฟล์ใหม่) — ใช้ npm run queue -- ship ${sym} แทน`).join('\n'));
```

with

```js
  const pb = prepatchBlockers(entries);
  const { unreadable } = pb;
  if (deleted.length) delNote();   // พิมพ์ก่อน throw — รอบที่ถูกบล็อกก็ยังต้องรู้ว่ามีไฟล์ที่ลบรออยู่
  const refusal = prepatchRefusal(pb);
  if (refusal) throw new Error(refusal);
```

Add `prepatchRefusal` to `module.exports`. Then check nothing else still uses the removed imports: `rtk proxy grep -n "readStockMeta\|readAiModel" tools/queue/ship.js` → no output.

- [ ] **Step 4: Convert `tools/queue/postcheck.js`**

Imports (lines 12-13) become:

```js
const { todayBangkok } = require('./footer-date.js');
const { parseAiModel } = require('../report-meta.js');
const RS = require('../report-source.js');   // ใบ v2 + v3 (Plan 2b)
const P3 = require('../v3/prose.js');
```

Add above `function postcheck`:

```js
/** ข้อความที่ grep หาราคาเดิมค้าง (ส่วนบริสุทธิ์): ใบ v2 = html ดิบทั้งไฟล์ (findOldPrice ข้ามบล็อก JSON เอง)
 *  · ใบ v3 = ทุกช่อง prose (P.proseFields) — market/fundamentals เป็นตัวเลขของ cron/งบ ไม่ใช่ข้อความที่ค้างได้ */
function oldPriceHaystack(src) { return src.v3 ? P3.proseFields(src.doc).map((x) => x.text).join('\n') : src.raw; }
```

Replace the head of `postcheck` — from `const fp = path.join(REPORTS, sym + '.html');` through the line `issues.push(...checkMeta(ctx, o.model || rec.model, footerDate(html), todayBangkok()));` — with:

```js
  const src = RS.load(sym, REPORTS);
  if (!src) throw new Error(`ไม่มี reports/${sym}.html หรือ reports/${sym}.json — worker ยังไม่ได้เขียน (หรือเขียนผิดที่ — ดู STEP 0 cwd-stray)`);
  const rec = S.load().stocks[sym] || {};
  const issues = [], notes = [];

  const t = run('node', ['test/check-reports.js', sym]);   // ใบ v3 → check-reports ส่งต่อ check-v3 เอง (Plan 2b R9)
  process.stdout.write(t.out);
  if (t.code !== 0) issues.push('npm test ตก (มี error) — แก้ก่อน');
  const sp = run('node', ['tools/spotcheck.js', sym]);
  process.stdout.write(sp.out);
  if (/▸/.test(sp.out)) notes.push('spotcheck มีรายการให้อ่าน (ด้านบน) — ตัดสินเอง ไม่ใช่ gate');

  const hits = findOldPrice(oldPriceHaystack(src), rec.oldPrice);
  if (hits.length) issues.push(`ราคาเดิม ${rec.oldPrice} ยังโผล่ ${hits.length} จุด:\n` + hits.map((h) => `    L${h.line}: ${h.text}`).join('\n'));

  const { buildCtx } = require('../../test/check-reports.js');
  const ctx = buildCtx(RS.renderedHtml(sym, REPORTS), sym + '.html');   // v2 = expandReport(ต้นฉบับ) เหมือนเดิม · v3 = หน้าที่ build render
  const lite = RS.metaLite(sym, REPORTS);   // วันวิเคราะห์: v2 footer "ข้อมูล ณ" · v3 meta.analysisDate + dateEra
  issues.push(...checkMeta(ctx, o.model || rec.model, lite && lite.analysisDate ? { iso: lite.analysisDate, era: lite.era } : null, todayBangkok()));
```

Add `oldPriceHaystack` to `module.exports`.

- [ ] **Step 5: Convert `tools/queue/prep.js`**

Add next to the other requires: `const RS = require('../report-source.js');   // ใบ v2 + v3 (Plan 2b)`. Add above `async function prep`:

```js
/** ใบ v3 แล้ว = ห้าม prep (spec §6.4 · ruling 4): คิวของ v3 UPDATE = P6 — ไม่ทำเหมือนเป็น NEW */
function checkNotV3(sym, dir) {
  if (RS.kindOf(sym, dir || REPORTS) === 'v3')
    throw new Error(`${sym} เป็นใบ v3 แล้ว (reports/${sym}.json) — v3 UPDATE = Plan 3 (คิวของใบ v3 = P6) · แก้ด้วย node tools/report.js export ${sym} → แก้ .work/${sym}.json → node tools/report.js save ${sym}`);
}
```

In `prep`, replace

```js
  const fp = path.join(REPORTS, sym + '.html');
  const exists = fs.existsSync(fp);
```

with

```js
  checkNotV3(sym);   // ก่อนยิง network ใด ๆ
  const fp = path.join(REPORTS, sym + '.html');
  const exists = RS.kindOf(sym, REPORTS) === 'v2';   // หลัง checkNotV3 "มีใบอยู่แล้ว" เหลือแค่ใบ v2
```

Add `checkNotV3` to `module.exports`.

- [ ] **Step 6: Convert `tools/queue/preflight.js`**

Imports: add `const RS = require('../report-source.js');   // ใบ v2 + v3 (Plan 2b)` after the `readStockMeta` import. Replace the readers (lines 27 and 33-34):

```js
const readReport = (sym) => { const fp = path.join(REPORTS, sym + '.html'); return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null; };
…
const listReportsFS = () => fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '')).sort();
const footerAgeFS = (today) => (sym) => { const h = readReport(sym); const d = h && footerDate(h); return d ? ageDays(d.iso, today) : null; };
```

with

```js
// ตัวอ่านของจริง = metaLite (ใบ v2 + v3 ผ่าน tools/report-source.js) · เทสเดิมฉีดตัวอ่านที่คืน html ดิบ — ตัวใช้งานรับได้ทั้งสองรูป
const readLite = (sym) => RS.metaLite(sym, REPORTS);
const analysisIsoOf = (h) => (h && typeof h === 'object' ? h.analysisDate || null : ((h && footerDate(h)) || {}).iso || null);
const currencyOf = (h) => (h && typeof h === 'object' ? h.currency || null : ((h && readStockMeta(h)) || {}).currency || null);
…
const listReportsFS = () => RS.list(REPORTS).map((e) => e.symbol).sort();
const footerAgeFS = (today) => (sym) => { const iso = analysisIsoOf(readLite(sym)); return iso ? ageDays(iso, today) : null; };
```

In `earningsAfterOfWith`, replace

```js
    const h = read(sym);
    const d = h && footerDate(h);
    return d ? d.iso < e.last : null;
```

with

```js
    const iso = analysisIsoOf(read(sym));
    return iso ? iso < e.last : null;
```

In `statementAfterOfWith`, replace

```js
    const h = read(sym);
    const d = h && footerDate(h);
    const th = o.isThai ? o.isThai(sym, h) : !!(h && (readStockMeta(h) || {}).currency === 'THB');
    const r = EC.statementAfter(sym, { footerIso: d && d.iso, today, th, cal, sec: o.sec || null });
```

with

```js
    const h = read(sym);
    const th = o.isThai ? o.isThai(sym, h) : currencyOf(h) === 'THB';
    const r = EC.statementAfter(sym, { footerIso: analysisIsoOf(h), today, th, cal, sec: o.sec || null });
```

In `plan`, replace the enrichment loop

```js
  for (const r of rows) {
    const h = readReport(r.symbol);
    const sm = h && readStockMeta(h);
    r.oldPrice = sm && Number.isFinite(sm.price) ? sm.price : null;
    r.currency = sm ? sm.currency : null;
  }
```

with

```js
  const liteOf = o.liteOf || readLite;   // เทสฉีด sandbox ได้ (Plan 2b)
  for (const r of rows) {
    const m = liteOf(r.symbol);
    r.oldPrice = m && Number.isFinite(m.px) ? m.px : null;   // v2 = stock-meta.price · v3 = market.px
    r.currency = m ? m.currency : null;
    r.v3 = !!(m && m.v3);
  }
```

and add `opts.liteOf` to the JSDoc above `plan`. In `patchTargets`, replace the head

```js
  const cur = new Map(rows.map((r) => [r.symbol, r.currency]));
  const out = { target: [], skippedUS: [], skippedTH: [], skippedNoReport: [] };
  for (const sym of prePatchList(rows)) {
    const c = cur.get(sym);
```

with

```js
  const cur = new Map(rows.map((r) => [r.symbol, r.currency]));
  const v3 = new Set(rows.filter((r) => r.v3).map((r) => r.symbol));
  const out = { target: [], skippedUS: [], skippedTH: [], skippedNoReport: [], skippedV3: [] };
  for (const sym of prePatchList(rows)) {
    if (v3.has(sym)) { out.skippedV3.push(sym); continue; }   // ราคาใบ v3 = cron P5 (#62) — update-prices ปฏิเสธใบ v3 อยู่แล้ว
    const c = cur.get(sym);
```

In `preflight()`, pass `readLite` where `readReport` was passed (`earningsAfterOfWith(cal, readLite)`, `statementAfterOfWith(cal, readLite, …)`), and after the `t.skippedNoReport` line add:

```js
  if (t.skippedV3.length) console.log(`\nℹ ใบ v3 — ไม่ pre-patch ${t.skippedV3.join(' ')} (ราคาใบ v3 = cron P5 · v3 cron = Plan 3 · open-item #62) · re-analysis ของใบ v3 = P6`);
```

Finally `rtk proxy grep -n "readReport" tools/queue/preflight.js` → no output (the helper is gone).

- [ ] **Step 7: Run the tests**

Run: `rtk proxy node test/queue-test.js 2>&1 | tail -5 && rtk proxy node test/v3-test.js 2>&1 | tail -3`
Expected: `queue-test: N/N ผ่าน` (all old sections unchanged + section 23 green); v3-test all `✓`.

- [ ] **Step 8: DIST-PROOF**

Run the DIST-PROOF block. Expected: `DIST IDENTICAL`, empty `git status` line.

- [ ] **Step 9: Commit**

```bash
git add tools/queue/ship.js tools/queue/postcheck.js tools/queue/prep.js tools/queue/preflight.js test/queue-test.js
git commit -m "feat(v3): scanner batch B — queue tools read .json via report-source; ship --prepatch fails closed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---
### Task 4: Scanner batch C — cron-adjacent + misc (`update-prices` · `preserve-dates` · canary · calendar · age · `spotcheck` · `tag-apply` · `apply-edits` · `.gitignore`)

**Files:**
- Modify: `tools/update-prices.js` (require block near `:50-92`; `main` at `:952-962`; `:1151` `reportExists`; `module.exports` at `:1183`)
- Modify: `tools/preserve-dates.js` (whole file → `main()` + pure `restoreDates`)
- Modify: `tools/dead-ticker-canary.js:135-136` (`readMeta`), `:184-197` (probe loop), `:228` (`reportExists`), exports
- Modify: `tools/earnings-calendar.js:117-125` (`reportSymbols`)
- Modify: `tools/analysis-age.js:14`, `:24-37` (`ageBuckets`)
- Modify: `tools/spotcheck.js:86-108` (`main`)
- Modify: `tools/tag-apply.js:30-65` (`applyTags`, `renameSymbol`, `pruneMissing`)
- Modify: `tools/apply-edits.js:73-77` (refuse `.json`)
- Modify: `.gitignore` (`.work/`)
- Test: `test/v3/scanners-cron.test.js` (create), `test/tag-apply-test.js` (one block), `test/update-prices-test.js` (one line)

**Interfaces:**
- Consumes: `RS.list`, `RS.symbols`, `RS.kindOf`, `RS.exists`, `RS.metaLite`, `RS.renderedHtml`, `RS.isV3Path` (Task 1).
- Produces: `U.v3Refusal(only: Set<string>, isV3: (sym)=>boolean) → string|null`; `PDt.restoreDates(cur, headDate, skip: Set) → number`; `DC.probeList(syms, liteOf, only: Set, cache) → { probes, skipped }`; `EC.reportSymbols(dir)` includes v3 symbols; `AA.ageBuckets(dir, today)` counts v3; `tag-apply` treats either file as "the report exists"; `apply-edits <x>.json` exits 1.

- [ ] **Step 1: Write the failing tests**

Create `test/v3/scanners-cron.test.js`:

```js
'use strict';
// Plan 2b Task 4 — เครื่องมือ cron-adjacent/misc อ่านใบ v3 (reports/<SYM>.json) ผ่าน tools/report-source.js
// ★ โฟลเดอร์ชั่วคราวเท่านั้น — ห้ามสร้างไฟล์ใต้ reports/ จริง (tripwire no-json-reports)
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const t = require('./_t.js')('scanners-cron');
const RS = require('../../tools/report-source.js');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, '..', 'fixtures');
const V3SRC = path.join(FIX, 'v3', 'ZTS-real.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-scan-cron-'));
fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(tmp, 'AAPL.html'));
fs.copyFileSync(V3SRC, path.join(tmp, 'ZTS.json'));
try {
  // update-prices — ราคาใบ v3 แช่แข็งจน P5 แต่ห้ามเงียบ (#62)
  const U = require('../../tools/update-prices.js');
  const isV3 = (s) => RS.kindOf(s, tmp) === 'v3';
  const msg = U.v3Refusal(new Set(['AAPL', 'ZTS']), isV3) || '';
  t(/ZTS/.test(msg) && !/AAPL/.test(msg) && /v3 cron = Plan 3/.test(msg) && /#62/.test(msg), 'update-prices: explicit v3 symbol → refusal naming it (v3 cron = Plan 3 · #62)');
  t.eq(U.v3Refusal(new Set(['AAPL']), isV3), null, 'update-prices: v2 symbol → no refusal');
  t.eq(U.v3Refusal(new Set(), isV3), null, 'update-prices: sweep (no symbols) → no refusal (R11)');
  t(RS.symbols(tmp).has('ZTS'), 'reportExists = RS.symbols keeps flags of v3 reports');
  // preserve-dates — ใบ v3 ไม่มี <footer> ⇒ ต้องข้าม ไม่งั้น UPDATE ของใบ v3 ถูกคืนวันเก่าเสมอ
  const PDt = require('../../tools/preserve-dates.js');
  const cur = [{ symbol: 'AAPL', updated: '2026-09-24T01:00:00+07:00' }, { symbol: 'ZTS', updated: '2026-09-24T01:00:00+07:00' }];
  const n = PDt.restoreDates(cur, { AAPL: '2026-09-01T00:00:00+07:00', ZTS: '2026-09-02T00:00:00+07:00' }, new Set(['ZTS']));
  const by = Object.fromEntries(cur.map((r) => [r.symbol, r.updated]));
  t(n === 1 && by.AAPL === '2026-09-01T00:00:00+07:00' && by.ZTS === '2026-09-24T01:00:00+07:00', 'preserve-dates: v3 symbol skipped, v2 restored as before');
  t.eq(cur.map((r) => r.symbol), ['ZTS', 'AAPL'], 'preserve-dates: re-sorted like build (newest first)');
  // dead-ticker canary — ใบ v3 ต้องถูก probe ด้วย
  const DC = require('../../tools/dead-ticker-canary.js');
  const pl = DC.probeList(['AAPL', 'ZTS', 'NOPE'], (s) => RS.metaLite(s, tmp), new Set(), {});
  t.eq(pl.probes.map((p) => [p.symbol, p.currency, p.reportPrice]), [['AAPL', 'USD', 326.57], ['ZTS', 'USD', 71.33]], 'canary: v3 ticker probed with currency/price from JSON');
  t.eq(pl.skipped, ['NOPE'], 'canary: no meta → skipped (as before)');
  t.eq(DC.probeList(['AAPL', 'ZTS'], (s) => RS.metaLite(s, tmp), new Set(['ZTS']), {}).probes.map((p) => p.symbol), ['ZTS'], 'canary: ONLY filter');
  // earnings-calendar — ใบ v3 ได้แถวปฏิทิน (ไม่งั้น statementAfter = null → FULL เสมอ)
  const EC = require('../../tools/earnings-calendar.js');
  t.eq(EC.reportSymbols(tmp).map((r) => r[0]), ['AAPL', 'ZTS'], 'earnings-calendar: v3 symbol listed');
  // analysis-age
  const AA = require('../../tools/analysis-age.js');
  const ab = AA.ageBuckets(tmp, '2026-09-24');
  t(ab.rows.some((r) => r[0] === 'ZTS' && r[1] === 2) && ab.be === 1 && ab.ce === 1 && ab.unparsed === 0, 'analysis-age: v3 age from meta.analysisDate (BE)', JSON.stringify(ab));
  // spotcheck — หน้า v3 เข้า buildCtx ทางเดียวกับ v2
  const SP = require('../../tools/spotcheck.js');
  t(Array.isArray(SP.spotcheck(RS.renderedHtml('ZTS', tmp), 'ZTS.html', true)), 'spotcheck: a v3 page goes through the same buildCtx path');
  // apply-edits ปฏิเสธ .json (hook มองไม่เห็น child process — ต้องกันที่ตัวเครื่องมือ)
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'apply-edits.js'), path.join(tmp, 'ZTS.json'), '--set', 'fv=1'], { encoding: 'utf8' });
  t(r.status === 1 && /report\.js save/.test(r.stderr), 'apply-edits: .json → exit 1 pointing to report.js save', r.stderr);
  t(fs.readFileSync(path.join(tmp, 'ZTS.json'), 'utf8') === fs.readFileSync(V3SRC, 'utf8'), 'apply-edits: the .json is untouched');
  // .gitignore
  t(/^\.work\/$/m.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')), '.gitignore ignores .work/ (drafts of report.js)');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
t.done();
```

In `test/tag-apply-test.js`, insert directly above the final `fs.rmSync(tmp, { recursive: true, force: true });`:

```js
// ── ใบ v3 (Plan 2b): reports/<SYM>.json นับเป็นไฟล์รายงานเหมือน .html (ผ่าน tools/report-source.js) ──
{
  fs.writeFileSync(path.join(repDir, 'VVV.json'), '{}');   // ชื่อไฟล์พอ — tag-apply ไม่ parse เนื้อ
  const d = fresh();
  const r = A.applyTags({ symbol: 'VVV', slugs: ['power-grid'], vocab, data: d, reportsDir: repDir });
  ok(r.ok && JSON.stringify(r.data.tags.VVV) === '["power-grid"]', 'v3: ติด tag ให้ใบที่มีแต่ .json ได้');
  const pr = A.pruneMissing({ ...d, tags: { ...d.tags, VVV: ['power-grid'] } }, repDir);
  ok(!pr.removed.includes('VVV') && !!pr.data.tags.VVV, 'v3: --prune ไม่ลบ tag ของใบ .json');
  const rn = A.renameSymbol(d, 'AAA', 'VVV', repDir);
  ok(rn.ok && !!rn.data.tags.VVV && !rn.data.tags.AAA, 'v3: --rename ไปยัง symbol ที่มีแต่ .json ได้');
  fs.unlinkSync(path.join(repDir, 'VVV.json'));
}
```

In `test/update-prices-test.js`, after the `fmtLike` checks near the top, add:

```js
ok(U.v3Refusal(new Set(['X']), () => true) && U.v3Refusal(new Set(['X']), () => false) === null, 'v3Refusal: เฉพาะ symbol ที่เป็นใบ v3 (Plan 2b · #62)');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk proxy node test/v3/scanners-cron.test.js; node test/tag-apply-test.js | tail -3; node test/update-prices-test.js | tail -2`
Expected: FAIL — `U.v3Refusal is not a function`, `✗ v3: ติด tag ให้ใบที่มีแต่ .json ได้`.

- [ ] **Step 3: `tools/update-prices.js`**

Add after `const { footerDate } = require('./queue/footer-date.js');` (line 70):

```js
const RS = require('./report-source.js');   // ใบ v2 + v3 (Plan 2b) — reportExists/คำสั่งที่ระบุ symbol ต้องเห็นใบ .json
```

Add above `// ---------- main ----------`:

```js
/** symbol ที่สั่งตรง ๆ แต่เป็นใบ v3 (reports/<SYM>.json) → ข้อความปฏิเสธ · null = ไม่มี (ส่วนบริสุทธิ์)
 *  ราคาใบ v3 แช่แข็งจน P5 ได้ แต่ **ห้ามเงียบ** (open-item #62): เดิม `--write --force <v3>` ไม่เจอ .html แล้ว exit 0 เฉย ๆ */
function v3Refusal(only, isV3) {
  const hit = [...only].filter((s) => isV3(s));
  return hit.length ? `✗ ${hit.join(' ')} เป็นใบ v3 (reports/<SYM>.json) — update-prices ยังเขียนราคาใบ v3 ไม่ได้ (v3 cron = Plan 3 · P5 · open-item #62)` : null;
}
```

In `main`, directly after the `const ONLY = …` line (before the `--heal-derived` branch):

```js
  const refuse = v3Refusal(ONLY, (s) => RS.kindOf(s, REPORTS) === 'v3');
  if (refuse) { console.error(refuse); process.exitCode = 1; return; }
```

After `const files = fs.readdirSync(REPORTS)…` (the sweep list, line 961-962) add:

```js
  if (!ONLY.size) {
    const v3 = RS.list(REPORTS).filter((e) => e.v3).map((e) => e.symbol);
    if (v3.length) console.log(`ℹ ใบ v3 ${v3.length} ใบไม่ถูก patch ราคา (v3 cron = Plan 3 · P5 · open-item #62): ${v3.join(' ')}`);
  }
```

Replace line 1151:

```js
  const reportExists = new Set(fs.readdirSync(REPORTS).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '').toUpperCase()));
```

with

```js
  const reportExists = RS.symbols(REPORTS);   // ใบ v2 + v3 — flag ของใบ .json ต้องไม่ถูกตัดทิ้ง (Plan 2b)
```

Add `v3Refusal` to `module.exports`.

- [ ] **Step 4: `tools/preserve-dates.js`**

Keep the header comment and add one bullet to it: ` * ★ ใบ v3 (reports/<SYM>.json · Plan 2b) ข้ามเสมอ: updated มาจาก freshHash ของ JSON (ไม่นับ market/_sig/meta.aiModel · spec §8) ⇒ cron ไม่ทำวันขยับอยู่แล้ว และ re-analysis ต้องได้วันใหม่ — ใบ v3 ไม่มี <footer> ให้ตรวจ`. Replace everything below the requires with:

```js
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'reports.json');
const git = (cmd) => cp.execSync(cmd, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();

// "ข้อมูล ณ <วันที่>" ใน <footer> เท่านั้น — ในเนื้อหา/บล็อก disc มีวลีเดียวกันปนอยู่ (เช่น "SET Factsheet
// ข้อมูล ณ FY2568") และ disc เป็นบล็อกที่ update-prices patch วันที่ราคาลงไป ⇒ ถ้าจับกว้างจะเข้าใจผิดว่า
// refresh ราคาคือ re-analysis แล้วปล่อยให้วันที่เด้ง = พัง invariant หลัก
const footerDate = (html) => {
  const f = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/i);
  const d = f && f[1].match(/ข้อมูล ณ\s*([^•<]*)/);
  return d ? d[1].trim() : null;
};

/** คืนวันเดิมให้ทุกแถวที่ไม่อยู่ใน skip แล้วเรียงแบบ build (ส่วนบริสุทธิ์ — แก้ cur ในที่) → จำนวนแถวที่คืน */
function restoreDates(cur, headDate, skip) {
  let n = 0;
  for (const r of cur) {
    if (skip.has(r.symbol)) continue;
    if (headDate[r.symbol] && r.updated !== headDate[r.symbol]) { r.updated = headDate[r.symbol]; n++; }
  }
  // เรียงเหมือน build.js (อัปเดตล่าสุดก่อน, เสมอเรียงตามชื่อ) เพื่อให้ index ลำดับเดิม
  cur.sort((a, b) => a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.symbol.localeCompare(b.symbol));
  return n;
}

function main() {
  const headDate = {};
  try {
    for (const r of JSON.parse(git('git show HEAD:reports.json'))) headDate[r.symbol] = r.updated;
  } catch (e) { console.error('อ่าน git HEAD:reports.json ไม่ได้:', e.message); process.exit(1); }

  // สองชั้น: pickaxe คัดเฉพาะไฟล์ที่ "บรรทัด footer" ขยับ (ปกติ 0 ไฟล์ → ไม่มีต้นทุน) แล้วค่อยเทียบ
  // ตัววันที่จริงต่อไฟล์ — migrate ที่แก้แต่ markup ของ footer จึงยังนับเป็นเนื้อหาเดิม (คืนวันเก่าตามเดิม)
  const reanalyzed = new Set();
  try {
    for (const f of git(`git diff --name-only -G'<footer.*ข้อมูล ณ' HEAD -- reports`).split('\n').filter(Boolean)) {
      // ต่อไฟล์ล้มได้เอง (ไฟล์ใหม่ที่ HEAD ยังไม่มี → git show ไม่ผ่าน) โดยไม่ดับการตรวจของตัวอื่นในรอบเดียวกัน
      try {
        const head = footerDate(git(`git show "HEAD:${f}"`));
        const wt = fs.existsSync(path.join(ROOT, f)) ? footerDate(fs.readFileSync(path.join(ROOT, f), 'utf8')) : null;
        if (head && wt && head !== wt) reanalyzed.add(path.basename(f).replace(/\.html$/i, ''));
      } catch (e) { console.error(`อ่าน ${f} ที่ HEAD ไม่ได้ — คืนวันเดิมให้ตัวนี้ตามเดิม:`, e.message); }
    }
  } catch (e) { console.error('เทียบ footer กับ HEAD ไม่ได้ — คืนวันเดิมให้ทุกตัวตามเดิม:', e.message); }

  const v3 = require('./report-source.js').list(path.join(ROOT, 'reports')).filter((e) => e.v3).map((e) => e.symbol);
  const cur = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const n = restoreDates(cur, headDate, new Set([...reanalyzed, ...v3]));
  fs.writeFileSync(MANIFEST, JSON.stringify(cur, null, 2) + '\n');
  console.log(`คงวันที่เดิมให้ ${n} รายงาน (จากทั้งหมด ${cur.length}) — รัน build อีกครั้งให้ dist ตรง`);
  if (reanalyzed.size) console.log(`ข้าม ${reanalyzed.size} ตัวที่วันที่ใน footer ขยับ (วิเคราะห์ใหม่ ไม่ใช่ refresh ราคา): ${[...reanalyzed].join(' ')}`);
  if (v3.length) console.log(`ข้าม ${v3.length} ใบ v3 (updated มาจาก freshHash ของ JSON — spec §8): ${v3.join(' ')}`);
}

module.exports = { restoreDates, footerDate };
if (require.main === module) main();
```

- [ ] **Step 5: `tools/dead-ticker-canary.js`**

Replace `const { readStockMeta } = require('./report-meta.js');` with `const RS = require('./report-source.js');   // ใบ v2 + v3 (Plan 2b)` and delete `const readMeta = …` (line 136). Add above `// ---------- main ----------`:

```js
/** รายการ probe (ส่วนบริสุทธิ์) — syms ตามลำดับไฟล์ · liteOf(sym) → metaLite (สกุล/ราคาในใบ ทั้ง v2 และ v3) · ไม่มีสกุล = ข้าม */
function probeList(syms, liteOf, only, cache) {
  const probes = [], skipped = [];
  for (const symbol of syms) {
    if (only.size && !only.has(symbol.toUpperCase())) continue;
    const m = liteOf(symbol);
    if (!m || !m.currency) { skipped.push(symbol); continue; }
    probes.push({ symbol, currency: m.currency, reportPrice: m.px != null ? m.px : null,
      candidates: tvCandidates(symbol, m.currency, { cached: cache[symbol.toUpperCase()] }) });
  }
  return { probes, skipped };
}
```

In `main`, replace the block from `const files = fs.readdirSync(REPORTS)…` through the end of its `for (const f of files) { … }` loop with:

```js
  const { probes, skipped } = probeList(RS.list(REPORTS).map((e) => e.symbol), (s) => RS.metaLite(s, REPORTS), ONLY, cache);
  for (const s of skipped) console.log(`⚠ ${s} — ไม่มี stock-meta ข้าม (gate จับเองอยู่แล้ว)`);
```

and replace `const reportExists = new Set(files.map((f) => f.replace(/\.html$/i, '').toUpperCase()));` with `const reportExists = RS.symbols(REPORTS);`. Add `probeList` to `module.exports`.

- [ ] **Step 6: `tools/earnings-calendar.js`, `tools/analysis-age.js`, `tools/spotcheck.js`**

`earnings-calendar.js`: replace `reportSymbols` with

```js
/** [SYM, ysym] ของทุกรายงานใน reports/ (ใบ v2 + v3 · เรียงตามชื่อไฟล์) — currency จาก stock-meta / JSON (THB → .BK ผ่าน symbol-map) */
function reportSymbols(dir) {
  const RS = require('./report-source.js');
  const d = dir || path.join(__dirname, '..', 'reports');
  return RS.list(d).map((e) => [e.symbol, toYahooSymbol(e.symbol, (RS.metaLite(e.symbol, d) || {}).currency)]);
}
```

(`readStockMeta` stays imported only if something else in the file uses it — check with `rtk proxy grep -n readStockMeta tools/earnings-calendar.js`; delete the import when the grep shows only the import line.)

`analysis-age.js`: change the import to `const { ageDays, todayBangkok } = require('./queue/footer-date.js');` + `const RS = require('./report-source.js');   // ใบ v2 + v3 (Plan 2b)`, and replace the loop in `ageBuckets` with:

```js
  for (const e of RS.list(dir)) {
    const m = RS.metaLite(e.symbol, dir);   // v2 = footer "ข้อมูล ณ" · v3 = meta.analysisDate + dateEra
    if (!m || !m.analysisDate) { unparsed++; continue; }
    if (m.era === 'BE') be++; else ce++;
    const age = ageDays(m.analysisDate, today);
    rows.push([e.symbol, age]);
    buckets[bucketOf(age)]++;
  }
```

and update its JSDoc first line to `/** อ่านทุกรายงานใต้ dir (ใบ v2 + v3) → จัดกลุ่มตามอายุการวิเคราะห์เทียบกับ today (ISO) …`.

`spotcheck.js`: add `const RS = require('./report-source.js');   // ใบ v2 + v3 (Plan 2b)` and replace `main` down to (not including) `console.log(`\n${'─'.repeat(50)}…`) with:

```js
function main() {
  const argv = process.argv.slice(2).map((a) => a.replace(/\.(html|json)$/i, '').toUpperCase());
  const deep = argv.length > 0;                 // ระบุหุ้น = โหมดต่อหุ้น (ตรวจครบทุกข้อ)
  let entries = RS.list(REPORTS_DIR);
  if (deep) { const want = new Set(argv); entries = entries.filter((e) => want.has(e.symbol.toUpperCase())); }
  if (!entries.length) { console.error('❌ ไม่พบไฟล์รายงานให้ตรวจ'); process.exit(1); }
  let hit = 0, total = 0;
  for (const e of entries) {
    let items;
    try { items = spotcheck(RS.renderedHtml(e.symbol, REPORTS_DIR), e.symbol + '.html', deep); }
    catch (err) { console.log(`✗ ${e.name} — อ่านไม่สำเร็จ: ${err.message}`); continue; }
    if (!items.length) continue;
    hit++; total += items.length;
    console.log(`\n▸ ${e.symbol}`);
    for (const it of items) console.log(`    · ${it}`);
  }
```

and in the summary line replace `${files.length}` with `${entries.length}`.

- [ ] **Step 7: `tools/tag-apply.js`, `tools/apply-edits.js`, `.gitignore`**

`tag-apply.js`: add `const RS = require('./report-source.js');   // ใบ v2 (.html) + v3 (.json) นับเป็น "มีรายงาน" (Plan 2b)` and replace the three existence checks:

```js
  if (!RS.exists(symbol, reportsDir || REPORTS_DIR)) {
    errors.push(`${symbol}: ไม่มีไฟล์ reports/${symbol}.html หรือ reports/${symbol}.json`);
  }
```

```js
  if (!RS.exists(newSym, reportsDir || REPORTS_DIR)) {
    errors.push(`${newSym}: ไม่มีไฟล์ reports/${newSym}.html หรือ .json — เปลี่ยนชื่อ ticker จริงต้องมีไฟล์ปลายทางอยู่แล้วเสมอ`);
  }
```

```js
    if (RS.exists(sym, dir)) tags[sym] = data.tags[sym];
```

`apply-edits.js`: add directly after the `if (!file) die(…)` line (before the `existsSync` check):

```js
// ใบ v3 (reports/<SYM>.json · Plan 2b · spec §6.3): แก้ด้วย string ไม่ได้ — ลายเซ็น _sig จะไม่ตรง (E50) และข้ามทุก gate ของ save
if (require('./report-source.js').isV3Path(file)) die(`✗ ${file} เป็นใบ v3 (JSON) — apply-edits ใช้กับใบ v2 (.html) เท่านั้น · ใบ v3: node tools/report.js export <SYM> → แก้ .work/<SYM>.json → node tools/report.js save <SYM>`);
```

`.gitignore`: append

```
# draft ของรายงาน v3 (node tools/report.js init/export → save) — ไม่ใช่ต้นฉบับ · กัน git add -A กวาด draft เข้า commit
.work/
```

- [ ] **Step 8: Run the tests**

Run: `rtk proxy node test/v3/scanners-cron.test.js && node test/tag-apply-test.js | tail -2 && node test/update-prices-test.js | tail -1 && node test/dead-ticker-test.js | tail -1 && rtk proxy node test/queue-test.js 2>&1 | tail -1 && rtk proxy node test/v3-test.js 2>&1 | tail -3 && npm run test:self 2>&1 | tail -2`
Expected: `✓ scanners-cron: N/N`; tag-apply `✅`; `✓ update-prices-test`; `✓ dead-ticker-test`; queue-test all pass; v3-test all `✓`; self-test green.

Then the manual CLI checks (no writes — dry-run / refusal paths only):

```bash
node tools/spotcheck.js AAPL | tail -3
node tools/analysis-age.js | head -2
node tools/update-prices.js --heal-derived AAPL | tail -1
```

Expected: spotcheck prints its summary for AAPL; analysis-age prints the age buckets of all 909 reports without crashing; the heal-derived dry-run prints its summary and exits 0. Also `node tools/update-prices.js --heal-derived ZZZNOPE; echo exit=$?` → a normal dry-run on a missing symbol (exit 0 — only v3 symbols are refused, and none exist yet).

- [ ] **Step 9: DIST-PROOF**

Run the DIST-PROOF block. Expected: `DIST IDENTICAL`, empty `git status` line.

- [ ] **Step 10: Commit**

```bash
git add tools/update-prices.js tools/preserve-dates.js tools/dead-ticker-canary.js tools/earnings-calendar.js tools/analysis-age.js tools/spotcheck.js tools/tag-apply.js tools/apply-edits.js .gitignore test/v3/scanners-cron.test.js test/tag-apply-test.js test/update-prices-test.js
git commit -m "feat(v3): scanner batch C — cron-adjacent/misc read .json; update-prices refuses v3 symbols (#62); apply-edits refuses .json

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---
### Task 5: Gate rules — `{{rd:` + `TODO` sentinel (E51) · `C.semanticErrors()` · `checkDoc(doc, {stage:'save'})`

**Files:**
- Modify: `tools/v3/schema.js` (new helpers above `validate`, one loop at the end of `validate`, exports)
- Modify: `tools/v3/compute.js` (extract `quoteBasis`/`prepLeg`, add `semanticErrors`, exports)
- Modify: `test/check-v3.js:267-348` (`checkDoc` only)
- Modify: `docs/quality-gate.md` (E51 row + one paragraph under the v3 table)
- Test: `test/v3/schema.test.js`, `test/v3/compute.test.js`, `test/v3/check-v3.test.js` (append before each file's final `t.done();`)

**Interfaces:**
- Consumes: nothing new (pre-check done 24 ก.ย. 69: `{{rd:` and `TODO` = 0 hits in `test/fixtures/v3/*.json`; re-run `rtk proxy grep -c 'TODO\|{{rd:' test/fixtures/v3/*.json` before Step 3 — every count must be 0, otherwise fix the fixture through `IO.read`/`IO.write` first and report it).
- Produces:
  - `S.TODO_RE = /^\s*TODO\b/`, `S.RD_TOKEN = '{{rd:'`, `S.stringLeaves(x, path, out) → [{path, text}]`; `S.validate` reports `{{rd:` and the sentinel with the exact JSON path.
  - `C.semanticErrors(doc, {seeds}) → [{path, msg}]` (doc must already pass `S.validate`).
  - `CV.checkDoc(doc, {skipSig?, seeds?, today?, stage?}) → { errors, warnings, view, dropped }`; E51 entries from schema/tags/semantics carry `details: [{path, msg}]`; `stage:'save'` moves `v2:E40` from `errors` to `dropped`; any other `stage` value throws.

- [ ] **Step 1: Write the failing tests**

Append to `test/v3/schema.test.js` (before its final `t.done();`):

```js
// ── Plan 2b Task 5 — {{rd:…}} + sentinel TODO = E51 ของสคีมา (spec §3 หมายเหตุ token · §9 · rulings R3/R4) ──
{
  const real = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
  const at = (d, p) => S.validate(d).filter((e) => e.path === p);
  t.eq(S.validate(real('ZTS-real')), [], 'ZTS-real baseline: 0 schema errors');
  { const d = real('ZTS-real'); d.prose.mos = 'ราคาปัจจุบัน {{rd:px}}'; const e = at(d, 'prose.mos');
    t(e.length === 1 && /ไวยากรณ์ของใบ v2/.test(e[0].msg), '{{rd:px}} in prose → error at prose.mos (finding M3)'); }
  { const d = real('ZTS-real'); d.metrics.custom[0].note = 'เดิม {{rd:fv}}'; t(at(d, 'metrics.custom[0].note').length === 1, '{{rd:…}} in a custom-card note → error with its path'); }
  { const d = real('ZTS-real'); d.scenarios.cases[2].desc += ' {{rd:scn.bull.tgt}}'; t(at(d, 'scenarios.cases[2].desc').length === 1, '{{rd:…}} in a scenario description → error'); }
  { const d = real('ZTS-real'); d.meta.sub = 'TODO: คำโปรยธุรกิจ'; const e = at(d, 'meta.sub');
    t(e.length === 1 && /sentinel "TODO"/.test(e[0].msg), 'TODO sentinel in a text field → one error naming meta.sub'); }
  { const d = real('ZTS-real'); d.legs[0].inputs.multiple = 'TODO: ตัวคูณเป้าหมาย'; const e = at(d, 'legs[0].inputs.multiple');
    t(e.some((x) => /sentinel "TODO"/.test(x.msg)) && e.some((x) => /ต้องเป็นตัวเลข/.test(x.msg)), 'TODO left in a number field → type error + sentinel error at the same path (R3)'); }
  { const d = real('ZTS-real'); d.catalysts[1] = 'TODO'; t(at(d, 'catalysts[1]').length === 1, 'bare "TODO" → error'); }
  { const d = real('ZTS-real'); d.prose.mos += ' (สิ่งที่ต้องทำ: TODO list ของบริษัท)'; t(at(d, 'prose.mos').length === 0, 'the word TODO mid-sentence is not the sentinel'); }
  { const d = real('ZTS-real'); d.risks[0] = 'TODOS ของทีม'; t(at(d, 'risks[0]').length === 0, '"TODOS" (no word boundary) is not the sentinel'); }
  t(S.TODO_RE.test('  TODO: x') && !S.TODO_RE.test('todo: x'), 'TODO_RE: leading spaces allowed · case-sensitive');
  t.eq(S.stringLeaves({ a: ['x', { b: 'y' }], c: 1 }, '', []), [{ path: 'a[0]', text: 'x' }, { path: 'a[1].b', text: 'y' }], 'stringLeaves: JSON paths of every string');
}
```

Append to `test/v3/compute.test.js` (before its final `t.done();`):

```js
// ── Plan 2b Task 5 — semanticErrors(): จุด throw ของ compute ครบในครั้งเดียว (spec §9 · #52) ──
{
  const Z = () => { const d = load('ZTS-real'); delete d._sig; return d; };
  t.eq(C.semanticErrors(Z(), { seeds: {} }), [], 'ZTS-real: no semantic errors (themeLegacy present)');
  const d = Z();
  d.meta.themeLegacy = null;                                      // (1) ไม่มีสีแบรนด์ (seeds ว่าง)
  delete d.scenarios.baseOverride; d.scenarios.driver = 'bvps';   // (2) ฐาน driver ไม่มี (ZTS-real ไม่มี fundamentals.bvps)
  d.legs[1].inputs.extrasRef = 0;                                  // (3) declared ชี้ extras[0] ที่ไม่มี
  d.legs[2].inputs.r = 5;                                          // (4) ddm r (5%) ≤ g (5.5%) → legValue throw
  t.eq(C.semanticErrors(d, { seeds: {} }).map((e) => e.path).sort(), ['legs[1].inputs.extrasRef', 'legs[2]', 'meta.themeLegacy', 'scenarios.driver'], 'four faults → four paths in one call');
  t(C.semanticErrors(d, { seeds: {} }).every((e) => e.msg && !e.msg.startsWith(e.path)), 'msg carries no duplicated path prefix');
  t.throws(() => C.compute(d, { seeds: {} }), /legs\[1\]\.inputs\.extrasRef/, 'compute() itself still throws on the first fault (unchanged)');
  t.eq(C.semanticErrors(d, { seeds: { ZTS: '#e8731a' } }).map((e) => e.path).includes('meta.themeLegacy'), false, 'a seed clears the brand-colour fault');
  const e = Z(); e.fvWeights = null; e.legs.push({ method: 'pbv', label: 'P/BV ตลาด', role: 'context', inputs: { multipleSource: 'current' } });
  t.eq(C.semanticErrors(e, { seeds: {} }).map((x) => x.path), ['legs[3].inputs.multipleSource'], "'current' leg with no bvps → path of multipleSource");
  const r = Z(); r.legs[0].inputs.multipleRange = [0.0001, 20]; r.legs[0].inputs.multiple = 14;
  t(C.semanticErrors(r, { seeds: {} }).every((x) => x.path !== 'legs[0]'), 'multipleRange that still prices > 0 is not an error');
}
```

Append to `test/v3/check-v3.test.js` (before its final `t.done();`):

```js
// ── Plan 2b Task 5 — E51 ขยาย · semanticErrors ใน checkDoc · stage:'save' (spec §9 · ruling 3/6) ──
const e51 = (r) => r.errors.find((x) => x.id === 'E51');
{ const d = Z(); delete d._sig; d.prose.mos = 'ราคาปัจจุบัน {{rd:px}}'; const r = run(signed(d));
  t(e51(r) && e51(r).details.some((x) => x.path === 'prose.mos'), 'E51: {{rd:…}} in a v3 prose field (details names the path)'); }
{ const d = Z(); delete d._sig; d.risks[0] = 'TODO: ความเสี่ยงข้อ 1'; const r = run(signed(d));
  t(e51(r) && e51(r).details.some((x) => x.path === 'risks[0]'), 'E51: TODO sentinel left in a text field'); }
{ const d = Z(); delete d._sig; d.scenarios.cases[0].growth = 'TODO'; const r = run(signed(d));
  t(e51(r) && e51(r).details.filter((x) => x.path === 'scenarios.cases[0].growth').length === 2, 'E51: TODO sentinel left in a number field (type + sentinel)'); }
{ const d = Z(); delete d._sig; d.meta.themeLegacy = null; delete d.scenarios.baseOverride; d.scenarios.driver = 'bvps'; d.legs[1].inputs.extrasRef = 0;
  const r = run(signed(d));
  t.eq(ids(r, 'errors'), ['E51'], 'semantic faults: exactly one E51 entry (entry count unchanged — R5)');
  t.eq(e51(r).details.map((x) => x.path).sort(), ['legs[1].inputs.extrasRef', 'meta.themeLegacy', 'scenarios.driver'], 'semantic faults: all three reported at once (#52)');
  t(e51(r).msg.startsWith('compute: ') && r.view === null, 'semantic faults: stop before compute/render (no view)'); }
{ const d = Z(); delete d._sig; d.surprise = 1; d.meta.sub = 'TODO: คำโปรยธุรกิจของบริษัท';
  t(e51(run(signed(d))).details.length === 2, 'schema E51 also carries details (one per schema error)'); }
{ const d = Z(); delete d._sig; d.symbol = 'ZZZQ';   // ไม่มีใน tags.json → v2:E40 (tag ลงตอน ship)
  t.eq(ids(run(signed(d)), 'errors'), ['v2:E40'], 'gate (no stage): untagged symbol → v2:E40');
  const r = run(signed(d), { stage: 'save' });
  t.eq(ids(r, 'errors'), [], "stage:'save' drops v2:E40 …");
  t.eq(r.dropped.map((x) => x.id), ['v2:E40'], '… and reports it in dropped (logged, not silent)'); }
{ const d = Z(); delete d._sig; d.symbol = 'ZZZQ'; d.meta.aiModel = 'Claude Foo 5';
  t.eq(ids(run(signed(d), { stage: 'save' }), 'errors'), ['v2:E28'], "stage:'save' drops exactly v2:E40 — v2:E28 still fails"); }
t.throws(() => CV.checkDoc(Z(), { seeds: {}, stage: 'publish' }), /stage/, 'unknown stage throws');
t.eq(run(Z()).dropped, [], 'no stage → dropped is empty');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓' | head -40`
Expected: `✗ [schema] {{rd:px}} in prose …`, `✗ [compute] …` (`C.semanticErrors is not a function` throws — the compute file stops), `✗ [check-v3] E51: {{rd:…}} …`, `stage:'save' drops …`.

- [ ] **Step 3: `tools/v3/schema.js`**

Add above `function validate(doc) {`:

```js
// ── ทุกช่องข้อความของใบ (Plan 2b · spec §3 หมายเหตุ token · §9 E51 ขยาย · rulings R3/R4) ──
// (1) {{rd:…}} = ไวยากรณ์ของใบ v2 — ใบ v3 ใช้ token ของ view ({{px}} {{fv}} {{mos}} {{leg1}} …) · วันนี้ render ได้ผ่าน expandReport
//     ของ v2 แต่จะรั่วเป็นวงเล็บดิบเมื่อ P7 ลบทาง v2 (วัดแล้ว — finding M3)
// (2) sentinel "TODO" ที่ report.js init วางในช่องดุลพินิจ — ช่องข้อความ **และ** ช่องตัวเลขที่ยังเป็นสตริง "TODO…" = ยังไม่ได้เติม
//     (str() รับ "TODO" และ E13 ของ v2 ไม่จับ) · คำว่า TODO กลางประโยคไม่ใช่ sentinel
const RD_TOKEN = '{{rd:';
const TODO_RE = /^\s*TODO\b/;
/** [{path, text}] ของทุก string ในโครง (JSON path แบบเดียวกับ error อื่น: a.b[0].c) */
function stringLeaves(x, p, out) {
  if (typeof x === 'string') out.push({ path: p, text: x });
  else if (Array.isArray(x)) x.forEach((v, i) => stringLeaves(v, `${p}[${i}]`, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) stringLeaves(v, p ? `${p}.${k}` : k, out);
  return out;
}
```

At the end of `validate`, directly above `return errs;`:

```js
  for (const { path: p, text } of stringLeaves(doc, '', [])) {
    if (p === '_sig') continue;
    if (text.includes(RD_TOKEN)) E(p, '{{rd:…}} เป็นไวยากรณ์ของใบ v2 — ใบ v3 ใช้ token ของ view เช่น {{px}} {{fv}} {{mos}} {{leg1}} (ดูรายการ: node tools/report.js show <SYM>)');
    if (TODO_RE.test(text)) E(p, 'ยังเป็น sentinel "TODO" ที่ report.js init วางไว้ — เติมค่าจริง (ช่องตัวเลขใส่ตัวเลข ไม่ใช่สตริง)');
  }
```

Add `RD_TOKEN, TODO_RE, stringLeaves` to `module.exports`.

- [ ] **Step 4: `tools/v3/compute.js`**

Add above `function compute(doc, opts) {`:

```js
// fx + fundamentals สกุลราคา (§3.6 L) — compute() และ semanticErrors() ใช้ตัวเดียวกัน
function quoteBasis(doc) {
  const f = doc.fundamentals;
  const fx = f.reportCurrency && f.reportCurrency !== doc.currency ? f.fx : 1;
  return { fx, fq: toQuote(f, fx) };
}
// ขาหนึ่งขา → { legQ, legM, liveMultiple } — จุดเดียวของ extrasRef/'current' ที่ compute() และ semanticErrors() ใช้ร่วม
// (throw ขึ้นต้นด้วย JSON path เสมอ ⇒ semanticErrors แยก path ได้)
function prepLeg(doc, leg, i, fq, fx) {
  if (leg.method === 'declared' && leg.inputs.extrasRef != null && !doc.extras[leg.inputs.extrasRef])
    throw new Error(`legs[${i}].inputs.extrasRef: ไม่มี extras[${leg.inputs.extrasRef}]`);
  // R7 (§13 ข้อ 6): ขา context 'current' — ตัวคูณสด = ราคา ÷ ตัวตั้ง (รวม override) · ค่าขา ≡ ราคา · ไม่มีเลขแช่แข็ง
  // override ของขาเป็นสกุลงบเหมือน fundamentals → แปลงชุดเดียวกัน
  const legQ = fx === 1 ? leg : { ...leg, override: toQuote(leg.override, fx) };
  let liveMultiple = null;
  if (leg.inputs.multipleSource === 'current') {
    const k = S.CURRENT_BASE[leg.method], base = L.inputsOf(legQ, fq)[k];
    if (!(typeof base === 'number' && base > 0)) throw new Error(`legs[${i}].inputs.multipleSource: 'current' ต้องมี fundamentals.${k} > 0`);
    liveMultiple = doc.market.px / base;
  }
  const legM = liveMultiple == null ? legQ : { ...legQ, inputs: { ...leg.inputs, multiple: liveMultiple } };
  return { legQ, legM, liveMultiple };
}
```

In `compute`, replace

```js
  const f = doc.fundamentals, mk = doc.market, s = doc.scenarios;
  const fx = f.reportCurrency && f.reportCurrency !== doc.currency ? f.fx : 1;
  const fq = toQuote(f, fx);
```

with

```js
  const f = doc.fundamentals, mk = doc.market, s = doc.scenarios;
  const { fx, fq } = quoteBasis(doc);
```

and replace the start of the legs map — from `const legs = doc.legs.map((leg, i) => {` through `const legM = liveMultiple == null ? legQ : …;` — with:

```js
  const legs = doc.legs.map((leg, i) => {
    const { legQ, legM, liveMultiple } = prepLeg(doc, leg, i, fq, fx);
```

(the lines from `const value = L.legValue(legM, …)` to the end of the map stay as they are). Add below `compute`:

```js
// "legs[0].inputs.x: ข้อความ" → { path, msg } · ทุกจุด throw ของ compute/legs ขึ้นต้นด้วย JSON path
const PATH_MSG = /^((?:legs|scenarios|meta|metrics|extras|fundamentals)[\w.[\]]*): ([\s\S]*)$/;
const splitErr = (e, fallback) => {
  const m = PATH_MSG.exec(String(e && e.message));
  return m ? { path: m[1], msg: m[2] } : { path: fallback, msg: String(e && e.message) };
};
/** error เชิงความหมายทุกข้อที่ compute() จะ throw — เก็บครบ **ก่อน** เรียก compute (spec §9 · open-item #52)
 *  สมมติว่าใบผ่าน S.validate แล้ว · ใช้ prepLeg/legValue/driverStart/themeOf ตัวเดียวกับ compute (ไม่ลอกตรรกะ)
 *  ครอบ: extrasRef ชี้ extras ที่ไม่มี · 'current' ไม่มีตัวตั้ง > 0 · legValue (ฐานไม่ครบ · r ≤ g · ค่าขา ≤ 0) + multipleRange
 *        · ฐาน driver ของฉากไม่มี/≤ 0 · ไม่มีสีแบรนด์ (seed และ themeLegacy) */
function semanticErrors(doc, opts) {
  const out = [];
  const { fx, fq } = quoteBasis(doc);
  doc.legs.forEach((leg, i) => {
    try {
      const { legQ, legM } = prepLeg(doc, leg, i, fq, fx);
      L.legValue(legM, fq, `legs[${i}]`);
      for (const m of leg.inputs.multipleRange || []) L.legValue({ ...legQ, inputs: { ...leg.inputs, multiple: m } }, fq, `legs[${i}].inputs.multipleRange`);
    } catch (e) { out.push(splitErr(e, `legs[${i}]`)); }
  });
  try { driverStart(doc, fq); } catch (e) { out.push(splitErr(e, 'scenarios.driver')); }
  try { themeOf(doc, opts && opts.seeds, null); } catch (e) { out.push(splitErr(e, 'meta.themeLegacy')); }
  return out;
}
```

Change the export line to `module.exports = { compute, semanticErrors, weightsOf, toQuote, SCN_NAMES };`.

- [ ] **Step 5: `test/check-v3.js` `checkDoc`**

Replace the head of `checkDoc` down to (and including) the compute `try/catch`:

```js
function checkDoc(doc, opts) {
  const o = opts || {};
  const errors = [], warnings = [];
  const add = (id, msg) => (CODE[id].level === 'error' ? errors : warnings).push({ id, label: CODE[id].label, msg });
  const done = (view) => ({ errors, warnings, view: view || null });

  if (!o.skipSig && !IO.verifySig(doc)) add('E50', …);
  // (1) สคีมา — …
  const schemaErrs = S.validate(doc);
  if (schemaErrs.length) { add('E51', schemaErrs.map((e) => `${e.path}: ${e.msg}`).join(' ; ')); return done(); }
  // แท็กนอก whitelist …
  const tagErrs = P.proseFields(doc).flatMap(({ path: p, text }) => P.sanitizeErrors(text).map((m) => `${p}: ${m}`));
  if (tagErrs.length) add('E51', tagErrs.join(' ; '));
  // (2) compute
  let view;
  try { view = C.compute(doc, { seeds: o.seeds }); }
  catch (e) { add('E51', 'compute: ' + String(e.message).split('\n')[0]); return done(); }
```

with (keep the E50 line and the existing comments you are not replacing verbatim):

```js
function checkDoc(doc, opts) {
  const o = opts || {};
  // stage:'save' (spec §9 · ruling 3) = code path เดียวกับ gate ยกเว้น v2:E40 ตัวเดียว (tag ลงตอน ship) — ค่าอื่น = บั๊กของผู้เรียก
  if (o.stage != null && o.stage !== 'save') throw new Error(`checkDoc: stage ไม่รู้จัก ${JSON.stringify(o.stage)} (มีแค่ 'save')`);
  const errors = [], warnings = [], dropped = [];
  const add = (id, msg) => (CODE[id].level === 'error' ? errors : warnings).push({ id, label: CODE[id].label, msg });
  // หลายข้อในชั้นเดียว = 1 รายการ (จำนวนรายการคงเดิม) + details [{path,msg}] ให้ report.js save พิมพ์ทีละบรรทัด (R5)
  const addList = (id, list, prefix) => (CODE[id].level === 'error' ? errors : warnings)
    .push({ id, label: CODE[id].label, msg: (prefix || '') + list.map((e) => `${e.path}: ${e.msg}`).join(' ; '), details: list });
  const done = (view) => ({ errors, warnings, view: view || null, dropped });

  if (!o.skipSig && !IO.verifySig(doc)) add('E50', doc && doc._sig ? 'ลายเซ็นไม่ตรงเนื้อไฟล์ — ไฟล์ถูกแก้นอก io.js' : 'ไม่มี _sig — ไฟล์ไม่ได้เขียนผ่าน io.js');
  // (1) สคีมา — ไม่ผ่าน = หยุด (compute/tieOut/render สมมติว่าใบผ่าน validate แล้ว) · รวม {{rd:}} + sentinel TODO (Plan 2b)
  const schemaErrs = S.validate(doc);
  if (schemaErrs.length) { addList('E51', schemaErrs); return done(); }
  // แท็กนอก whitelist <b> <i> <br> = error ของ gate ไม่ใช่ escape เงียบตอน render (ทุกช่องใน P.proseFields — text.* · legs[].note · extras · การ์ด)
  const tagErrs = P.proseFields(doc).flatMap(({ path: p, text }) => P.sanitizeErrors(text).map((m) => ({ path: p, msg: m })));
  if (tagErrs.length) addList('E51', tagErrs);
  // (2) error เชิงความหมายครบทุกข้อ **ก่อน** compute (spec §9 · #52 — compute throw ที่ข้อแรกเท่านั้น)
  const sem = C.semanticErrors(doc, { seeds: o.seeds });
  if (sem.length) { addList('E51', sem, 'compute: '); return done(); }
  let view;
  try { view = C.compute(doc, { seeds: o.seeds }); }
  catch (e) { add('E51', 'compute: ' + String(e.message).split('\n')[0]); return done(); }
```

Then replace the pass-through line

```js
  for (const e of res.errors) if (!NATIVE_V2.has(e.id)) errors.push({ id: 'v2:' + e.id, label: e.label, msg: e.msg });
```

with

```js
  for (const e of res.errors) {
    if (NATIVE_V2.has(e.id)) continue;
    // stage:'save': tag ลงตอน ship (tools/tag-apply.js) ⇒ v2:E40 ตัวเดียวที่ save ยกเว้น — คืนใน dropped ให้ผู้เรียกพิมพ์ (ไม่หายเงียบ)
    if (o.stage === 'save' && e.id === 'E40') { dropped.push({ id: 'v2:E40', label: e.label, msg: e.msg }); continue; }
    errors.push({ id: 'v2:' + e.id, label: e.label, msg: e.msg });
  }
```

Update the file-header comment's order line to: `validate (รวม {{rd:}} + TODO) → (0 schema error เท่านั้น) semanticErrors → compute → tieOut → render → gate v2`.

- [ ] **Step 6: `docs/quality-gate.md`**

In the v3 table, append to the E51 row's "ตรวจอะไร" cell: ` · **Plan 2b**: ช่องข้อความใดมี \`{{rd:…}}\` (ไวยากรณ์ v2) · ค่าใดยังเป็น sentinel \`TODO…\` ที่ \`report.js init\` วางไว้ (ช่องตัวเลขที่ยังเป็นสตริงด้วย) · error เชิงความหมาย (ฐานฉาก/สีแบรนด์/extrasRef/'current'/ค่าขา) รายงานครบทุกข้อในครั้งเดียวผ่าน \`C.semanticErrors()\` ก่อน compute`. Below the line `กติกา B (ตัวเลขผูกราคาที่พิมพ์เอง) เป็นของ \`save\` …` add:

```markdown
`node tools/report.js save <SYM>` ใช้ `checkDoc(doc, {stage:'save'})` — code path เดียวกับ gate ยกเว้น **`v2:E40` ตัวเดียว** (tag ลงตอน `ship` ด้วย `tools/tag-apply.js`) ซึ่งพิมพ์ว่า "ตัด" ทุกครั้ง ไม่หายเงียบ · error ของสคีมา/แท็ก/ความหมายแต่ละชั้นเป็น E51 **รายการเดียว** ที่มี `details` ทีละ path — `save` พิมพ์ครบทุกบรรทัดในครั้งเดียว (Plan 2b · open-item #52)
```

- [ ] **Step 7: Run the tests**

Run: `rtk proxy node test/v3-test.js 2>&1 | tail -20 && rtk proxy node test/check-v3.js | tail -4 && npm run test:self 2>&1 | tail -2`
Expected: every v3 line `✓` — including `tokens-corpus` (`accepted 909/909`, threshold unchanged), `real-fixtures`, `render`, the tripwire — and check-v3 `สรุป: 4/4 ตรงตามคาด` / `✅ check-v3 ผ่าน`.

Reviewer "can fail" proof: comment out the `TODO_RE` line in `validate`, run `rtk proxy node test/v3/schema.test.js` → the sentinel cases go `✗`; restore.

- [ ] **Step 8: Commit**

```bash
git add tools/v3/schema.js tools/v3/compute.js test/check-v3.js test/v3/schema.test.js test/v3/compute.test.js test/v3/check-v3.test.js docs/quality-gate.md
git commit -m "feat(v3): gate rules — {{rd:}} + TODO sentinel (E51), semanticErrors all-at-once, checkDoc stage:'save'

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---
### Task 6: Prep sidecar `.queue/prep/<SYM>.json` (spec §6.4) — `fetch-facts --json` · `fetch-fundamentals --json` · `tools/queue/sidecar.js`

**Files:**
- Modify: `tools/fetch-facts.js` (pure `factsJson`, `--json`, `require.main` guard, exports)
- Modify: `tools/fetch-fundamentals.js` (pure `snapshotJson`, `--json` branch in `main`, exports)
- Modify: `tools/update-prices.js:140-153` (`fetchChart` return gains `longName`, `exchangeName` — additive, no existing reader)
- Create: `tools/queue/sidecar.js`
- Modify: `tools/queue/prep.js` (`medianBlock` returns `r`; NEW mode writes the sidecar; one output line)
- Create: `test/fixtures/v3/sidecar/ZZZQ.inputs.js`, `test/fixtures/v3/sidecar/ZZZQ.json` (generated)
- Create: `test/v3/sidecar.test.js`

**Interfaces:**
- Consumes: `buildChartData`, `annualChg`-free logic from `tools/update-prices.js`; `finRow`, `asNum` inside `tools/fetch-fundamentals.js`; `parseVendor` output shape `{epsTTM, target, analysts, lo52, hi52, divYieldPct, fyYears, traps, …}` (`tools/queue/prep.js:84-121`); `MM.oneSymbol` result `{rows:[{key, pe, outlier?, skip?}], median, fyYears, curErr?}` (`tools/median-multiples.js:91-142`); `PS.parseDeltas(text) → {dP, dE, single, …}` (`tools/prep-stock.js`).
- Produces (Task 7 reads exactly this shape):
  - `FF.factsJson(q, symbol, currency) → { symbol, currency, quoteCurrency, px, priceDate: 'YYYY-MM-DD', chart: { data }, chgSuffix: 'รอบปี'|'ตั้งแต่ IPO', range52w: {lo,hi}|null, company|null, exchange|null }`
  - `FU.snapshotJson({ y, s, stats, pages }) → { ttm: {revenue, netIncome, epsDil, fcf, sharesDil, grossMargin, opMargin, netMargin, cash, debt, debtToEquity, roe}, fy: {period, revenue, netIncome, eps}|null, sharesOut, dps, epsForward, rating }` (money in full units, margins/ROE in %).
  - `SC.buildSidecar({ symbol, th, facts, fund, vend, medians, deltas, today }) → sidecar v1`:
    ```
    { v: 1, symbol, currency, region, builtAt, company, exchange,
      market: { px, priceDate, chart: { data }, chgSuffix, range52w },
      vendor: { epsTTM, target, analysts, lo52, hi52, divYieldPct, fyYears, traps },
      crossVerify: { dP, dE },
      ttm, fy, sharesOut, dps, epsForward, rating,
      medians: { median, lo, hi, window, points, fyYears, curErr } | null }
    ```
  - `SC.mediansOf(r) → medians | null`, `SC.writeSidecar(dir, sc) → file path`, `SC.SIDECAR_V = 1`.
  - Fixture `test/fixtures/v3/sidecar/ZZZQ.json` — a builder-generated sidecar for the fictional symbol `ZZZQ` (ZTS-like numbers; not in `tags.json`, not in `tools/seeds.json`).

- [ ] **Step 1: Create the fixture inputs**

Create `test/fixtures/v3/sidecar/ZZZQ.inputs.js`:

```js
'use strict';
// อินพุตจำลองของ tools/queue/sidecar.js buildSidecar() — หุ้นสมมติ ZZZQ (ตัวเลขแบบ ZTS-real · ไม่มีใน tags.json/seeds.json)
// ZZZQ.json ข้าง ๆ = ผลของ builder นี้ (test/v3/sidecar.test.js ยืนยันว่าตรงกัน) — ห้ามแก้ ZZZQ.json มือ ให้รันสคริปต์ใน Plan 2b Task 6 Step 4
// ใช้เป็น sidecar ของ test/v3/report-cli.test.js (init → save ครบวงในโฟลเดอร์ชั่วคราว)
const CHART = [['ต.ค.25', 144.09], ['พ.ย.25', 128.18], ['ธ.ค.25', 125.82], ['ม.ค.26', 124.82], ['ก.พ.26', 131.1], ['มี.ค.26', 118.21],
  ['เม.ย.26', 114.97], ['พ.ค.26', 77.69], ['มิ.ย.26', 71.86], ['ก.ค.26', 77.29], ['ส.ค.26', 77.1], ['ก.ย.26', 71.33]];
module.exports = {
  symbol: 'ZZZQ', th: false, today: '2026-09-21',
  facts: { symbol: 'ZZZQ', currency: 'USD', quoteCurrency: 'USD', px: 71.33, priceDate: '2026-09-21', chart: { data: CHART },
    chgSuffix: 'รอบปี', range52w: { lo: 70.26, hi: 148.79 }, company: 'ZZZQ Animal Health Inc.', exchange: 'NYSE' },
  fund: {
    ttm: { revenue: 9517000000, netIncome: 2616000000, epsDil: 6.13, fcf: 2363000000, sharesDil: 432000000, grossMargin: 71.5, opMargin: 36.4,
      netMargin: 27.5, cash: 1400000000, debt: 9240000000, debtToEquity: 2.93, roe: 80.8 },
    fy: { period: 'FY2025', revenue: 9260000000, netIncome: 2490000000, eps: 5.6 },
    sharesOut: 430000000, dps: 2.12, epsForward: 6.2, rating: 'Buy',
  },
  vend: { epsTTM: 6.13, target: 100.94, analysts: 19, lo52: 70.26, hi52: 148.79, divYieldPct: 2.97, priceStop: false, priceWarn: false, fyYears: 5, traps: [] },
  medians: { median: 30, lo: 26.1, hi: 36.4, window: 'FY2021–FY2025', points: 5, fyYears: 5, curErr: null },
  deltas: { dP: 0.04, dE: 0, single: false },
};
```

- [ ] **Step 2: Write the failing test**

Create `test/v3/sidecar.test.js`:

```js
'use strict';
// Plan 2b Task 6 — prep sidecar .queue/prep/<SYM>.json (spec §6.4) · ทุกเทส offline: ฟังก์ชันบริสุทธิ์ + อินพุตจำลอง (ห้ามยิง network)
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('sidecar');
const FF = require('../../tools/fetch-facts.js');
const FU = require('../../tools/fetch-fundamentals.js');
const SC = require('../../tools/queue/sidecar.js');
const I = require('../fixtures/v3/sidecar/ZZZQ.inputs.js');

// ── fetch-facts --json ──
const mid = (i) => Date.UTC(2025, 9 + i, 15) / 1000;   // กลางเดือน — ไม่ให้ gmtoffset ลากข้ามเดือน
const q = { price: 71.33, currency: 'USD', marketTime: Date.UTC(2026, 8, 21, 20, 0, 0) / 1000, gmtoffset: -4 * 3600,
  week52Low: 70.26, week52High: 148.79, longName: 'ZZZQ Animal Health Inc.', exchangeName: 'NYSE',
  bars: Array.from({ length: 12 }, (_, i) => ({ ts: mid(i), close: 140 - i * 6 })) };
{ const f = FF.factsJson(q, 'ZZZQ', 'USD');
  t.eq([f.px, f.priceDate, f.chgSuffix, f.company, f.exchange], [71.33, '2026-09-21', 'รอบปี', 'ZZZQ Animal Health Inc.', 'NYSE'], 'factsJson: price, ISO market-local date, suffix, name, exchange');
  t.eq(f.range52w, { lo: 70.26, hi: 148.79 }, 'factsJson: 52-week range from Yahoo meta (not monthly closes — M7)');
  t(f.chart.data.length === 12 && f.chart.data[11][1] === 71.33 && Object.keys(f.chart).join() === 'data', 'factsJson: chart = data only (min/max/grid dropped — compute derives), last point = price'); }
t.eq(FF.factsJson({ ...q, bars: q.bars.slice(-5) }, 'ZZZQ', 'USD').chgSuffix, 'ตั้งแต่ IPO', 'factsJson: under ~320 days of bars → ตั้งแต่ IPO');
{ const f = FF.factsJson({ ...q, longName: undefined, exchangeName: undefined, week52Low: undefined }, 'ZZZQ', 'USD');
  t(f.company === null && f.exchange === null && f.range52w === null, 'factsJson: missing meta → null (init leaves a TODO)'); }

// ── fetch-fundamentals --json ──
function makeFinPage(rows) {   // โครง devalue แบบเดียวกับ test/prep-stock-test.js
  const arr = []; const fd = {};
  const push = (v) => { arr.push(v); return arr.length - 1; };
  for (const [k, vals] of Object.entries(rows)) fd[k] = push(vals.map((v) => (v == null ? -1 : push(v))));
  return { arr, fd, src: 'test' };
}
const fin = makeFinPage({ datekey: ['TTM', '2025-12-31', '2024-12-31'], fiscalYear: [null, 2025, 2024], revenue: [9517e6, 9260e6, 8540e6],
  netIncome: [2616e6, 2490e6, 2340e6], epsDiluted: [6.13, 5.6, 5.1], fcf: [2363e6, 2300e6, 2000e6], sharesDiluted: [432e6, 445e6, 459e6],
  grossMargin: [0.715, 0.71, 0.7], operatingMargin: [0.364, 0.36, 0.35], profitMargin: [0.275, 0.27, 0.27] });
const bs = makeFinPage({ datekey: ['2026-06-30', '2025-12-31'], totalcash: [1.4e9, 2e9], debt: [9.24e9, 6.7e9] });
const ratio = makeFinPage({ datekey: ['TTM', '2025-12-31'], debtequity: [2.93, 1.9], roe: [0.808, 0.5] });
{ const s = FU.snapshotJson({ y: { epsFwd: 6.2 }, s: { info: { dps: 2.12, analysts: 'Buy' } }, stats: { sharesOut: { num: 430e6, text: '430.00M' } }, pages: [fin, bs, ratio] });
  t.eq(s.ttm, { revenue: 9517e6, netIncome: 2616e6, epsDil: 6.13, fcf: 2363e6, sharesDil: 432e6, grossMargin: 71.5, opMargin: 36.4, netMargin: 27.5, cash: 1.4e9, debt: 9.24e9, debtToEquity: 2.93, roe: 80.8 },
    'snapshotJson: TTM column; margins/ROE in %; balance sheet/ratios = TTM or latest column');
  t.eq(s.fy, { period: 'FY2025', revenue: 9260e6, netIncome: 2490e6, eps: 5.6 }, 'snapshotJson: latest closed FY column');
  t.eq([s.sharesOut, s.dps, s.epsForward, s.rating], [430e6, 2.12, 6.2, 'Buy'], 'snapshotJson: shares outstanding [2b] (not wAvgDil), dps, forward EPS, SA rating'); }
{ const s = FU.snapshotJson({ pages: [makeFinPage({ datekey: ['2025-12-31'], revenue: [1e9] }), null, null] });
  t(s.ttm.revenue === null && s.fy.revenue === 1e9 && s.fy.period === 'FY2025', 'snapshotJson: no TTM column → TTM null (never an FY stand-in), FY still read'); }
t.eq(FU.snapshotJson({ pages: [] }).fy, null, 'snapshotJson: no statements → fy null, no throw');

// ── sidecar ──
t.eq(SC.buildSidecar(I), require('../fixtures/v3/sidecar/ZZZQ.json'), 'fixture ZZZQ.json = builder output (regenerate with the Task 6 script, never by hand)');
{ const sc = SC.buildSidecar(I);
  t.eq(Object.keys(sc.market).sort(), ['chart', 'chgSuffix', 'priceDate', 'px', 'range52w'], 'market block = only schema market keys (save merges it verbatim)');
  t.eq([sc.v, sc.currency, sc.region, sc.builtAt], [1, 'USD', 'US', '2026-09-21'], 'header: version, currency/region from th, builtAt');
  t.eq(sc.market.range52w, { lo: 70.26, hi: 148.79 }, 'range52w = vendor 52wk'); }
t.eq(SC.buildSidecar({ ...I, th: true }).region, 'TH', 'th → region TH / currency THB');
t.throws(() => SC.buildSidecar({ ...I, facts: { ...I.facts, px: undefined } }), /fetch-facts --json ไม่ครบ/, 'no price → throw (a sidecar without market is useless to save)');
{ const r = { median: 30.04, fyYears: 5, rows: [{ key: '2021-12-31', pe: 28 }, { key: '2022-12-31', pe: 36.4 }, { key: '2023-12-31', pe: 80, outlier: 'x' },
  { key: '2024-12-31', pe: 26.1 }, { key: '2025-12-31', pe: null, skip: 'EPS ≤ 0' }] };
  t.eq(SC.mediansOf(r), { median: 30.04, lo: 26.1, hi: 36.4, window: 'FY2021–FY2024', points: 3, fyYears: 5, curErr: null }, 'mediansOf: outliers/skips out, window from the used years'); }
t.eq(SC.mediansOf(null), null, 'mediansOf(null) → null (median fetch failed)');
t.eq(SC.mediansOf({ rows: [], median: null, curErr: 'งบเป็น CAD' }).curErr, 'งบเป็น CAD', 'mediansOf keeps curErr (init must not use the median)');
{ const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-sidecar-'));
  try { const f = SC.writeSidecar(path.join(dir, 'prep'), SC.buildSidecar(I));
    t(f === path.join(dir, 'prep', 'ZZZQ.json') && JSON.parse(fs.readFileSync(f, 'utf8')).symbol === 'ZZZQ', 'writeSidecar: <dir>/<SYM>.json (creates the dir)'); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); } }
t.done();
```

- [ ] **Step 3: Run test to verify it fails**

Run: `rtk proxy node test/v3/sidecar.test.js`
Expected: FAIL — `Cannot find module '../../tools/queue/sidecar.js'` (and before that, requiring `tools/fetch-facts.js` would run its unguarded `main()` — Step 5 adds the guard; if the require prints the usage line and exits, that is the pre-change behaviour).

- [ ] **Step 4: Implement `tools/queue/sidecar.js` and generate the fixture**

Create `tools/queue/sidecar.js`:

```js
'use strict';
/**
 * sidecar.js — `.queue/prep/<SYM>.json` ข้อมูลเครื่องอ่านของ prep (spec §6.4 · Plan 2b)
 *   อินพุตเดียวของ `node tools/report.js init` (ห้าม regex ไฟล์ .md ซึ่งเป็น prompt ของ LLM — ruling 4)
 *   ประกอบจาก fetch-facts --json (ราคา/กราฟ/ชื่อ/ตลาด) + fetch-fundamentals --json (งบ TTM/FY/หุ้นคงเหลือ/ปันผล)
 *   + parseVendor (เป้า/52wk vendor/กับดัก) + MM.oneSymbol (มัธยฐาน P/E) + parseDeltas (Δ ราคา/EPS ของ CROSS-VERIFY)
 *   ส่วนบริสุทธิ์ทั้งหมด (ไม่ยิง network ไม่อ่าน .md) · `market` ใช้ตอน save ของใบใหม่เท่านั้น — ไม่เข้า .work/
 * ★ ห้าม require state.js (อ่าน env/git ตอน require) — ผู้เรียกส่งโฟลเดอร์มาเอง
 */
const fs = require('fs');
const path = require('path');

const SIDECAR_V = 1;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const n = (x) => (isNum(x) ? x : null);

/** ผลของ MM.oneSymbol → ค่าที่ init ใช้ (ตัดแถวดิบทิ้ง) · null = ดึงไม่ได้ · curErr = ผสมสกุล (ห้ามใช้ median) */
function mediansOf(r) {
  if (!r) return null;
  const used = (r.rows || []).filter((x) => isNum(x.pe) && !x.outlier);
  const years = used.map((x) => parseInt(String(x.key).slice(0, 4), 10)).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    median: n(r.median),
    lo: used.length ? Math.min(...used.map((x) => x.pe)) : null,
    hi: used.length ? Math.max(...used.map((x) => x.pe)) : null,
    window: years.length ? `FY${years[0]}–FY${years[years.length - 1]}` : null,
    points: used.length, fyYears: n(r.fyYears), curErr: r.curErr || null,
  };
}

function buildSidecar({ symbol, th, facts, fund, vend, medians, deltas, today }) {
  if (!facts || !isNum(facts.px) || !facts.priceDate || !facts.chart || !Array.isArray(facts.chart.data))
    throw new Error(`${symbol}: fetch-facts --json ไม่ครบ (px/priceDate/chart) — sidecar ไม่มีราคาให้ report.js save`);
  const v = vend || {}, f = fund || {};
  const lo = n(v.lo52), hi = n(v.hi52);
  return {
    v: SIDECAR_V, symbol, currency: th ? 'THB' : 'USD', region: th ? 'TH' : 'US', builtAt: today,
    company: facts.company || null, exchange: facts.exchange || null,
    market: {
      px: facts.px, priceDate: facts.priceDate, chart: { data: facts.chart.data }, chgSuffix: facts.chgSuffix,
      range52w: lo != null && hi != null && hi >= lo ? { lo, hi } : facts.range52w || null,   // vendor 52wk ก่อน (M7) · ไม่มีค่อยใช้ Yahoo meta
    },
    vendor: { epsTTM: n(v.epsTTM), target: n(v.target), analysts: n(v.analysts), lo52: lo, hi52: hi, divYieldPct: n(v.divYieldPct), fyYears: n(v.fyYears), traps: v.traps || [] },
    crossVerify: { dP: deltas ? n(deltas.dP) : null, dE: deltas ? n(deltas.dE) : null },
    ttm: f.ttm || null, fy: f.fy || null, sharesOut: n(f.sharesOut), dps: n(f.dps), epsForward: n(f.epsForward), rating: f.rating || null,
    medians: medians || null,
  };
}

function writeSidecar(dir, sc) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, sc.symbol + '.json');
  fs.writeFileSync(file, JSON.stringify(sc, null, 2) + '\n');
  return file;
}

module.exports = { buildSidecar, mediansOf, writeSidecar, SIDECAR_V };
```

Generate the fixture (from the worktree root):

```bash
node -e "const fs=require('fs');const SC=require('./tools/queue/sidecar.js');const I=require('./test/fixtures/v3/sidecar/ZZZQ.inputs.js');fs.writeFileSync('test/fixtures/v3/sidecar/ZZZQ.json',JSON.stringify(SC.buildSidecar(I),null,2)+'\n')"
```

- [ ] **Step 5: `tools/fetch-facts.js` — `factsJson` + `--json` + guard**

Add above `async function main()`:

```js
/** ข้อมูลเครื่องอ่านของ sidecar (spec §6.4 · ส่วนบริสุทธิ์ — q = ผลของ fetchChart) · chart = data อย่างเดียว (min/max/grid → compute คิดเอง)
 *  priceDate = วันของ regularMarketTime ตาม tz ตลาด (ISO) · range52w = 52wk ของ Yahoo meta (ไม่ใช่ปิดรายเดือน — M7) */
function factsJson(q, symbol, currency) {
  const data = buildChartData(q.bars, q.price, q.gmtoffset);
  const spanDays = q.bars.length >= 2 ? (q.bars[q.bars.length - 1].ts - q.bars[0].ts) / 86400 : 0;
  const priceDate = new Date((q.marketTime + q.gmtoffset) * 1000).toISOString().slice(0, 10);
  const lo = q.week52Low, hi = q.week52High;
  return {
    symbol, currency, quoteCurrency: q.currency || null, px: q.price, priceDate, chart: { data },
    chgSuffix: spanDays < 320 ? 'ตั้งแต่ IPO' : 'รอบปี',   // เกณฑ์เดียวกับป้าย .chg ของโหมดข้อความ
    range52w: Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo ? { lo, hi } : null,
    company: q.longName || null, exchange: q.exchangeName || null,
  };
}
```

In `main`, directly after the mixed-basis `process.exit(2)` block (so a bad chart still stops before any JSON), add:

```js
  if (args.includes('--json')) { console.log(JSON.stringify(factsJson(q, symbol, currency))); return; }   // sidecar (Plan 2b) — ไม่พิมพ์บล็อกข้อความ
```

Update the usage comment in the header: `ใช้:  node tools/fetch-facts.js SYMBOL [--th] [--json]` + ` *   --json = พิมพ์ JSON บรรทัดเดียวให้ sidecar ของ prep (spec §6.4) แทนบล็อกข้อความ`. Replace the last line

```js
main().catch((e) => { console.error('✗', e.message); process.exit(1); });
```

with

```js
module.exports = { factsJson };
// ★ guard — test/v3/sidecar.test.js require ไฟล์นี้ (ถ้าไม่ guard จะยิง Yahoo ตอน require)
if (require.main === module) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
```

In `tools/update-prices.js` `fetchChart`'s return object, after `week52High: meta.fiftyTwoWeekHigh,` add:

```js
    // ชื่อบริษัท/ตลาดจาก meta ชุดเดียวกัน — sidecar ของ prep ใช้เติม meta.company/exchange ของใบใหม่ (Plan 2b) · cron ไม่อ่าน
    longName: meta.longName || meta.shortName || null,
    exchangeName: meta.fullExchangeName || meta.exchangeName || null,
```

- [ ] **Step 6: `tools/fetch-fundamentals.js` — `snapshotJson` + `--json`**

Add above `// ---------- main ----------`:

```js
/** ข้อมูลเครื่องอ่านของ sidecar (spec §6.4 · ส่วนบริสุทธิ์) — ตัวเลขเต็มหน่วย (ไม่หารล้าน) · margin/ROE = หน่วย %
 *  งบกำไรขาดทุน: คอลัมน์ TTM เท่านั้น (ไม่มี = null — ห้ามเอา FY มาแทน เหตุผลเดียวกับ tableEpsTTM) · งบดุล/อัตราส่วน: TTM หรือคอลัมน์ล่าสุด
 *  fy = คอลัมน์ FY ปิดงบล่าสุด · sharesOut = หุ้นคงเหลือ [2b] (ไม่ใช่ถัวเฉลี่ยปรับลด) · rating = SA info.analysts เมื่อเป็นข้อความ */
function snapshotJson({ y, s, stats, pages }) {
  const [fin, bs, ratio] = pages || [];
  const keysOf = (page) => (page && finRow(page, ['datekey'])) || [];
  const ttmCol = (page) => { const i = keysOf(page).indexOf('TTM'); return i >= 0 ? i : null; };
  const latestCol = (page) => { const i = ttmCol(page); return i != null ? i : keysOf(page).length ? 0 : null; };
  const cell = (page, aliases, i) => { if (!page || i == null) return null; const row = finRow(page, aliases); return row ? asNum(row[i]) : null; };
  const pct1 = (v) => (v == null ? null : Math.round(v * 1000) / 10);
  const tI = ttmCol(fin), bI = latestCol(bs), rI = latestCol(ratio);
  const dk = keysOf(fin), fyI = dk.findIndex((k) => k != null && k !== 'TTM');
  const fyYear = fyI >= 0 ? ((finRow(fin, ['fiscalYear']) || [])[fyI] ?? String(dk[fyI]).slice(0, 4)) : null;
  const NI = ['netIncome', 'netinccmn', 'netinc'], EPS = ['epsDiluted', 'epsdil'];
  const so = stats && stats.sharesOut;
  return {
    ttm: {
      revenue: cell(fin, ['revenue'], tI), netIncome: cell(fin, NI, tI), epsDil: cell(fin, EPS, tI), fcf: cell(fin, ['fcf'], tI),
      sharesDil: cell(fin, ['sharesDiluted', 'sharesBasic'], tI),
      grossMargin: pct1(cell(fin, ['grossMargin'], tI)), opMargin: pct1(cell(fin, ['operatingMargin'], tI)), netMargin: pct1(cell(fin, ['profitMargin'], tI)),
      cash: cell(bs, ['totalcash', 'cashneq'], bI), debt: cell(bs, ['debt'], bI),
      debtToEquity: cell(ratio, ['debtequity'], rI), roe: pct1(cell(ratio, ['roe'], rI)),
    },
    fy: fyI >= 0 ? { period: `FY${fyYear}`, revenue: cell(fin, ['revenue'], fyI), netIncome: cell(fin, NI, fyI), eps: cell(fin, EPS, fyI) } : null,
    sharesOut: so == null ? null : typeof so === 'number' ? so : asNum(so.num),
    dps: s && s.info ? asNum(s.info.dps != null ? s.info.dps : s.info.dividend) : null,
    epsForward: y ? asNum(y.epsFwd) : null,
    rating: s && s.info && typeof s.info.analysts === 'string' ? s.info.analysts : null,
  };
}
```

In `main`, directly after the `await Promise.all([...])` block:

```js
  if (args.includes('--json')) {   // sidecar ของ prep (Plan 2b · spec §6.4) — JSON บรรทัดเดียว ไม่พิมพ์ตาราง/บรรทัดเทียบ
    console.log(JSON.stringify(snapshotJson({ y, s, stats, pages: finPages })));
    return;
  }
```

Add `snapshotJson` to `module.exports` and `[--json]` to the usage line.

- [ ] **Step 7: `tools/queue/prep.js` — write the sidecar for NEW**

Requires: add `const SC = require('./sidecar.js');` and `const PS = require('../prep-stock.js');   // parseDeltas — Δ ราคา/EPS ของ CROSS-VERIFY (priceNote ของ init)`.

`medianBlock`: declare `let text, r = null;`, assign `r = await MM.oneSymbol(spec, th);` inside the `try` (replacing `const r = …`), and return `{ text, warn, r }`.

Add above `async function prep`:

```js
/** node <script> … --json → object (I/O ของ sidecar — ล้ม/JSON เสีย = throw พร้อมท้าย stderr) */
function runJson(script, args) {
  const r = run('node', [script, ...args]);
  if (r.code !== 0) throw new Error(`${script} ${args.join(' ')} ล้ม (exit ${r.code}): ${(r.err || r.out).trim().slice(-400)}`);
  try { return JSON.parse(r.out); } catch (e) { throw new Error(`${script} --json คืน JSON เสีย: ${e.message}`); }
}
```

In `prep`, directly after `const med = await medianBlock(o.medianSpec || sym, th);`:

```js
  // 2b. ใบใหม่ = sidecar .queue/prep/<SYM>.json (spec §6.4) — อินพุตเดียวของ node tools/report.js init
  //     ยิง fetch-facts/fetch-fundamentals ซ้ำแบบ --json (NEW เท่านั้น — ruling R2) · ใบเดิมไม่เขียน (v3 UPDATE = P6)
  let sidecar = null;
  if (mode === 'NEW') {
    const thArg = th ? ['--th'] : [];
    const sc = SC.buildSidecar({ symbol: sym, th, today: todayBangkok(), vend, medians: SC.mediansOf(med.r), deltas: PS.parseDeltas(ps.out),
      facts: runJson('tools/fetch-facts.js', [sym, ...thArg, '--json']), fund: runJson('tools/fetch-fundamentals.js', [sym, ...thArg, '--json']) });
    sidecar = SC.writeSidecar(S.PREP_DIR, sc);
  }
```

and after the line `console.log(`\n=== prep ${sym} เสร็จ → …`);` add:

```js
  if (sidecar) console.log(`sidecar → ${path.relative(ROOT, sidecar)} (อินพุตของ node tools/report.js init ${sym})`);
```

- [ ] **Step 8: Run the tests**

Run: `rtk proxy node test/v3/sidecar.test.js && rtk proxy node test/v3-test.js 2>&1 | tail -3 && node test/prep-stock-test.js | tail -1 && rtk proxy node test/queue-test.js 2>&1 | tail -1 && node test/update-prices-test.js | tail -1 && node tools/fetch-facts.js 2>&1 | head -1`
Expected: `✓ sidecar: N/N`; v3-test all `✓`; prep-stock-test, queue-test, update-prices-test pass; the last command prints the usage line `ใช้: node tools/fetch-facts.js SYMBOL [--th]` (the guard keeps CLI behaviour).

- [ ] **Step 9: Commit**

```bash
git add tools/fetch-facts.js tools/fetch-fundamentals.js tools/update-prices.js tools/queue/sidecar.js tools/queue/prep.js test/fixtures/v3/sidecar/ test/v3/sidecar.test.js
git commit -m "feat(v3): prep sidecar .queue/prep/<SYM>.json — fetch-facts/fetch-fundamentals --json + queue/sidecar.js (spec §6.4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 7: `tools/report.js` CLI — `init` · `export` · `save [--light]` · `show` · `diff` (spec §6.1)

**Files:**
- Create: `tools/report.js`
- Create: `test/v3/report-cli.test.js`

**Interfaces:**
- Consumes: `RS.kindOf(sym, dir)`, `RS.load(sym, dir)`, `RS.REPORTS_DIR` (Task 1); `S.OWNER`, `S.validate`, `S.stringLeaves`, `S.TODO_RE` (Task 5); `C.compute`, `C.semanticErrors` (Task 5); `CV.checkDoc(doc, {skipSig, seeds, stage:'save', today}) → {errors (E51 entries carry details), warnings, view, dropped}` (Task 5); `P.checkRuleB(doc, view) → {errors, warnings: [{path, literal, token}]}`, `P.proseFields(doc) → [{path, text}]`; `IO.serialize`, `IO.write`, `IO.read`, `IO.verifySig`; `TK.TOKENS_V3` (`tools/v3/tokens.js`); `todayBangkok()` (`tools/queue/footer-date.js`); `require('./queue/state.js').PREP_DIR` (lazy — `state.js` runs `git` on require); sidecar v1 shape and fixture `test/fixtures/v3/sidecar/ZZZQ.json` (Task 6).
- Produces:
  - `run(argv: string[], {log, err}) → 0 | 1 | 2` — 0 ok · 1 refused / gate failed · 2 usage error. Never calls `process.exit`; the CLI entry sets `process.exitCode`.
  - `draftFromSidecar(sc, today) → draft` (pure; no `market`, no `meta.aiModel`, judgment fields = `"TODO: …"`).
  - `diffPaths(a, b) → string[]` — leaf JSON paths that differ, skipping top-level `market` and `_sig`.
  - `lightViolations(before, after) → string[]` — `diffPaths` minus the `--light` allowlist (spec §6.1 verbatim: every `P.proseFields` path of either doc · `meta.analysisDate` `meta.aiModel` `meta.sources` `meta.priceNote` · `analyst` / `analyst.*` · `fundamentals.dps`).
  - Options (R7): `--reports-dir --work-dir --prep-dir --seeds <file> --today YYYY-MM-DD --force --light`. Defaults: `RS.REPORTS_DIR`, `<repo>/.work`, `state.PREP_DIR`, `tools/seeds.json`, Asia/Bangkok today.

- [ ] **Step 1: Write the failing test**

Create `test/v3/report-cli.test.js`:

```js
'use strict';
// Plan 2b Task 7 — tools/report.js (spec §6.1) · ทุกอย่างในโฟลเดอร์ชั่วคราว + --today คงที่
// ★ ห้ามแตะ reports/ .work/ .queue/ จริง — ทุกคำสั่งส่ง --reports-dir/--work-dir/--prep-dir/--seeds (tripwire no-json-reports)
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./_t.js')('report-cli');
const RC = require('../../tools/report.js');
const IO = require('../../tools/v3/io.js');
const S = require('../../tools/v3/schema.js');
const CV = require('../check-v3.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const SIDECAR = path.join(FIX, 'v3', 'sidecar', 'ZZZQ.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-report-cli-'));
const R = path.join(tmp, 'rep'), W = path.join(tmp, 'work'), PD = path.join(tmp, 'prep'), SEEDS = path.join(tmp, 'seeds.json');
for (const d of [R, W, PD]) fs.mkdirSync(d);
fs.writeFileSync(SEEDS, JSON.stringify({ ZZZQ: '#31a60d' }));
fs.copyFileSync(SIDECAR, path.join(PD, 'ZZZQ.json'));

const cli = (args, today) => {
  const out = [];
  const code = RC.run([...args, '--reports-dir', R, '--work-dir', W, '--prep-dir', PD, '--seeds', SEEDS, '--today', today || '2026-09-21'],
    { log: (s) => out.push(String(s)), err: (s) => out.push(String(s)) });
  return { code, out: out.join('\n') };
};
const rf = (sym) => path.join(R, sym + '.json');
const wf = (sym) => path.join(W, sym + '.json');
const readW = (sym) => JSON.parse(fs.readFileSync(wf(sym), 'utf8'));
const writeW = (sym, d) => fs.writeFileSync(wf(sym), JSON.stringify(d, null, 2) + '\n');
const bytes = (f) => fs.readFileSync(f, 'utf8');
const todos = (d) => S.stringLeaves(d, '', []).filter((x) => S.TODO_RE.test(x.text)).map((x) => x.path);

try {
  // ── usage ──
  t.eq(RC.run([], { log() {}, err() {} }), 2, 'no command → exit 2');
  t.eq(cli(['bogus', 'ZZZQ']).code, 2, 'unknown command → exit 2');
  t.eq(cli(['init', 'ZZZQ', '--nope']).code, 2, 'unknown option → exit 2');
  t.eq(cli(['show', 'ZZZQ', '--light']).code, 2, '--light outside save → exit 2');

  // ── pure: draftFromSidecar variants ──
  const SC = JSON.parse(bytes(SIDECAR));
  { const d = RC.draftFromSidecar({ ...SC, medians: { ...SC.medians, curErr: 'งบเป็น CAD' } }, '2026-09-21');
    t(d.legs.length === 2 && d.legs.every((l) => S.TODO_RE.test(l.method)) && d.fundamentals.peAvg5y === undefined, 'median with curErr → no pe leg, no peAvg5y (two TODO legs)'); }
  { const d = RC.draftFromSidecar({ ...SC, vendor: { ...SC.vendor, traps: ['[2c] forecast ⇒ ไม่ตรงงวด ⚠'] } }, '2026-09-21');
    t(d.fundamentals.epsForward === undefined, '[2c] FY trap → epsForward left out'); }
  t(S.TODO_RE.test(RC.draftFromSidecar({ ...SC, crossVerify: { dP: 3.1, dE: 0 } }, '2026-09-21').meta.priceNote), 'price gap > 2% → priceNote is a TODO');
  t(!('priceNote' in RC.draftFromSidecar({ ...SC, crossVerify: { dP: null, dE: null } }, '2026-09-21').meta), 'no cross-verify → no priceNote');
  { const d = RC.draftFromSidecar({ ...SC, dps: 0 }, '2026-09-21');
    t(d.scenarios.divIncluded === false && !d.metrics.cards.includes('yield') && d.scenarios.cases.every((c) => !('divCum' in c)), 'dps 0 → divIncluded false, no yield card, no divCum'); }
  { const d = RC.draftFromSidecar({ ...SC, company: null, exchange: null }, '2026-09-21');
    t(S.TODO_RE.test(d.meta.company) && S.TODO_RE.test(d.meta.exchange), 'missing company/exchange → TODO'); }

  // ── init (NEW) ──
  t.eq(cli(['diff', 'ZZZQ']).code, 1, 'diff before init: no draft, no report → exit 1');
  { const r = cli(['init', 'ZZZQ']);
    t(r.code === 0 && /มัธยฐาน P\/E/.test(r.out) && /TODO \d+ ช่อง/.test(r.out), `init ZZZQ → exit 0, prints TODO count + median hint (${r.out.slice(0, 200)})`); }
  const d0 = readW('ZZZQ');
  t(!('market' in d0) && !('_sig' in d0) && !('aiModel' in d0.meta) && !('themeLegacy' in d0.meta), 'draft: no market / _sig / aiModel / themeLegacy');
  t.eq([d0.v, d0.symbol, d0.currency, d0.region, d0.dateEra], [3, 'ZZZQ', 'USD', 'US', 'BE'], 'draft: top-level');
  t.eq([d0.meta.company, d0.meta.exchange, d0.meta.analysisDate, d0.meta.priceNote], ['ZZZQ Animal Health Inc.', 'NYSE', '2026-09-21', 'StockAnalysis.com ตรงกับ Yahoo Finance'], 'draft: meta from sidecar + --today');
  t.eq(d0.meta.sources.slice(0, 2), ['Yahoo Finance', 'StockAnalysis.com'], 'draft: seed sources');
  { const f = d0.fundamentals;
    t.eq([f.eps, f.epsBasis, f.dps, f.shares, f.netDebt, f.peAvg5y, f.epsForward, f.fy.period], [6.13, 'gaap-ttm', 2.12, 430000000, 7840000000, 30, 6.2, 'FY2025'], 'draft: fundamentals (shares = outstanding · netDebt = debt − cash · peAvg5y = median)'); }
  t.eq([d0.legs[0].method, d0.legs[0].inputs.multipleSource, d0.legs[0].inputs.medianWindow, d0.legs.length], ['pe', 'median5y', 'FY2021–FY2025', 2], 'draft: pe leg skeleton + one TODO leg');
  t(S.TODO_RE.test(d0.legs[0].inputs.multiple) && /30\.0x/.test(d0.legs[0].inputs.multiple), 'draft: legs[0].inputs.multiple is a TODO carrying the median hint');
  t.eq(d0.metrics.cards, ['mcap', 'pe', 'yield', 'eps', 'roe', 'netMargin', 'revenue', 'range52w', 'peAvg5y', 'fcf', 'debtToEquity'], 'draft: data-backed default cards');
  t.eq([d0.scenarios.years, d0.scenarios.divIncluded, d0.scenarios.perYear, d0.scenarios.driver, d0.scenarios.exitMetric], [3, true, 'cagr', 'eps', 'pe'], 'draft: scenario frame');
  t.eq(d0.analyst, { target: 100.94, n: 19, rating: 'Buy', asOf: '2026-09-21' }, 'draft: analyst from vendor + sidecar rating');
  t.eq([d0.fvWeights, d0.extras], [null, []], 'draft: fvWeights null, extras []');
  // Review Focus 2 — init ซ้ำต้องไม่ทับ draft ที่ worker ทำค้าง
  { writeW('ZZZQ', { ...d0, catalysts: ['งานค้างของ worker', 'ข้อ 2 ของ worker', 'ข้อ 3 ของ worker'] }); const before = bytes(wf('ZZZQ'));
    const r = cli(['init', 'ZZZQ']);
    t(r.code === 1 && /--force/.test(r.out) && bytes(wf('ZZZQ')) === before, 'init over an existing draft → exit 1, draft byte-identical');
    t(cli(['init', 'ZZZQ', '--force']).code === 0 && readW('ZZZQ').catalysts[0] !== 'งานค้างของ worker', 'init --force → fresh draft'); }
  t(/ใบใหม่/.test(cli(['diff', 'ZZZQ']).out), 'diff of a NEW draft → "ใบใหม่" message');

  // ── save (NEW) ──
  { const r = cli(['save', 'ZZZQ']);
    const want = ['meta.aiModel', 'meta.sub', 'legs[0].inputs.multiple', 'legs[1].method', 'scenarios.cases[0].growth', 'prose.chart', 'risks[2]'];
    t(r.code === 1 && want.every((p) => r.out.includes(p)), `raw draft save → exit 1 naming every path at once (${want.filter((p) => !r.out.includes(p))})`);
    t(!fs.existsSync(rf('ZZZQ')), 'failed save writes no report'); }
  { const d = readW('ZZZQ'); writeW('ZZZQ', { ...d, market: SC.market });
    const r = cli(['save', 'ZZZQ']); t(r.code === 1 && /market: เป็นของ cron/.test(r.out) && !fs.existsSync(rf('ZZZQ')), 'market in the draft → refused (OWNER)');
    writeW('ZZZQ', { ...d, meta: { ...d.meta, themeLegacy: { accent: '#31a60d' } } });
    t(/meta\.themeLegacy/.test(cli(['save', 'ZZZQ']).out), 'themeLegacy in a NEW draft → refused (§3.5)');
    t(/--light/.test(cli(['save', 'ZZZQ', '--light']).out), '--light on a NEW symbol → refused');
    writeW('ZZZQ', d); }
  const fill = (d) => {
    d.meta.sub = 'ยาและวัคซีนสัตว์ ทดสอบคำโปรยธุรกิจ'; d.meta.headerTags = ['Animal Health']; d.meta.sources[2] = 'SEC 10-Q'; d.meta.aiModel = 'Claude Opus 5';
    d.legs[0].inputs.multiple = 25; d.legs[0].note = 'ใช้มัธยฐานตัวคูณย้อนหลังหักส่วนลดความเสี่ยงของธุรกิจ';
    d.legs[1] = { method: 'ddm', label: 'DDM', inputs: { g: 5.5, r: 9 }, note: 'ปันผลโตตามกำไรระยะยาว' };
    const cs = [[-3, 10, 6.36, 'ยอดขายหลักหดตัวต่อเนื่อง'], [5, 14, 6.7, 'ธุรกิจทรงตัวตามแนวโน้มเดิม'], [8, 17, 7, 'ยาใหม่ช่วยให้กำไรกลับมาโต']];
    d.scenarios.cases = cs.map(([growth, exitMultiple, divCum, desc]) => ({ growth, exitMultiple, divCum, desc }));
    d.scenarios.note = 'ฉากทดสอบของ Plan 2b';
    for (const k of Object.keys(d.prose)) d.prose[k] = 'ข้อความทดสอบสำหรับช่อง ' + k;
    d.catalysts = ['ยาใหม่ออกสู่ตลาด', 'ขยายตลาดเอเชีย', 'ซื้อหุ้นคืนต่อเนื่อง'];
    d.risks = ['คู่แข่งยาสามัญ', 'ค่าเงินผันผวน', 'กฎระเบียบยาสัตว์'];
    return d;
  };
  { const d = fill(readW('ZZZQ')); t.eq(todos(d), [], 'fill() leaves no TODO'); writeW('ZZZQ', d);
    const r = cli(['save', 'ZZZQ']);
    t(r.code === 0 && fs.existsSync(rf('ZZZQ')), `filled draft → save exit 0 (${r.out.slice(0, 300)})`);
    t(/ตัด v2:E40/.test(r.out), "save prints the dropped v2:E40 (stage:'save' is never silent)");
    t(/MOS \+34\.3%/.test(r.out), 'save prints FV/MOS');
    const doc = IO.read(rf('ZZZQ'));
    t(IO.verifySig(doc) && doc.market.px === 71.33 && doc.market.priceDate === '2026-09-21', 'saved file: signed, market merged from the sidecar');
    t.eq(CV.checkDoc(doc, { seeds: { ZZZQ: '#31a60d' }, today: '2026-09-21' }).errors.map((e) => e.id), ['v2:E40'], 'the real gate on the saved file: only v2:E40 (tag is applied at ship)'); }
  { const r = cli(['show', 'ZZZQ', 'fv']); t(r.code === 0 && Math.abs(parseFloat(r.out) - 108.576) < 0.01, `show ZZZQ fv → 108.576 (${r.out})`); }
  { const r = cli(['show', 'ZZZQ']); t(r.code === 0 && r.out.includes('{{fv}} = $108.58') && r.out.includes('{{leg1}} = $153.25') && !r.out.includes('{{leg3}}'), 'show: FV line + token table (only tokens that resolve)'); }
  t.eq(cli(['show', 'ZZZQ', 'nope.path']).code, 1, 'show with an unknown path → exit 1');
  t(/อยู่แล้ว/.test(cli(['init', 'ZZZQ']).out), 'init after the report exists → refused (UPDATE uses export)');

  // ── UPDATE: export → save round trip · --light · diff ──
  fs.copyFileSync(path.join(FIX, 'v3', 'ZTS-real.json'), rf('ZTS'));
  const zts0 = bytes(rf('ZTS'));
  { const r = cli(['export', 'ZTS']); const d = readW('ZTS');
    t(r.code === 0 && !('market' in d) && !('_sig' in d) && d.meta.aiModel === 'Claude Sonnet 5', 'export ZTS → draft without market/_sig (aiModel kept)'); }
  t.eq(cli(['export', 'ZTS']).code, 1, 'export over an existing draft → exit 1');
  t.eq(cli(['export', 'ZTS', '--force']).code, 0, 'export --force → exit 0');
  { const r = cli(['save', 'ZTS'], '2026-09-22'); t(r.code === 0 && bytes(rf('ZTS')) === zts0, `export → save unchanged = byte-identical file (${r.out.slice(0, 200)})`); }
  { const d = readW('ZTS'); d.prose.mos += ' (ทบทวนแล้ว)'; writeW('ZTS', d);
    const r = cli(['save', 'ZTS', '--light'], '2026-09-22');
    t(r.code === 0 && IO.read(rf('ZTS')).prose.mos.endsWith('(ทบทวนแล้ว)') && IO.verifySig(IO.read(rf('ZTS'))), '--light: prose change → saved + signed'); }
  const zts1 = bytes(rf('ZTS'));
  { const d = readW('ZTS'); d.legs[0].inputs.multiple = 15; writeW('ZTS', d);
    const df = cli(['diff', 'ZTS'], '2026-09-22');
    t(df.code === 0 && df.out.includes('legs[0].inputs.multiple: 14 → 15') && df.out.includes('FV $85.00 → $87.60'), `diff: changed path + FV before → after (${df.out})`);
    const r = cli(['save', 'ZTS', '--light'], '2026-09-22');
    // Review Focus 5 — save ที่ล้มต้องไม่แตะไฟล์ · --light นอก allowlist ต้องบอก path
    t(r.code === 1 && /\[--light\] legs\[0\]\.inputs\.multiple/.test(r.out), '--light outside the allowlist → exit 1 naming legs[0].inputs.multiple');
    t(bytes(rf('ZTS')) === zts1, 'failed save leaves the report byte-identical'); }
  t.eq(RC.lightViolations({ analyst: { target: 1 }, meta: { sources: ['a'] }, fundamentals: { dps: 1, eps: 2 } },
    { analyst: { target: 2 }, meta: { sources: ['a', 'b'] }, fundamentals: { dps: 2, eps: 3 } }), ['fundamentals.eps'], 'lightViolations: analyst.* / meta.sources[*] / fundamentals.dps allowed');
  t.eq(RC.diffPaths({ market: 1, _sig: 'x', a: [1, 2], b: { c: 1 } }, { market: 2, a: [1], b: { c: 1, d: null } }), ['a[1]', 'b.d'], 'diffPaths: skips market/_sig, reports array tails and added keys');

  // ── refusals ── Review Focus 1: ใบ v2 อยู่แล้ว ห้ามเขียน .json ข้าง ๆ (build.reportEntries จะ throw ทั้งเว็บ)
  fs.copyFileSync(path.join(FIX, 'AAPL-v2.html'), path.join(R, 'AAPL.html'));
  writeW('AAPL', { v: 3, symbol: 'AAPL' });
  { const r = cli(['save', 'AAPL']); t(r.code === 1 && /ใบ v2/.test(r.out) && !fs.existsSync(rf('AAPL')), 'save on a v2 symbol → refused, no .json written'); }
  t.eq(cli(['init', 'AAPL']).code, 1, 'init on a v2 symbol → refused');
  t.eq(cli(['export', 'AAPL']).code, 1, 'export on a v2 symbol → refused');
  t(/ไม่พบ sidecar/.test(cli(['init', 'ZZZX']).out), 'init without a sidecar → refused');
  fs.copyFileSync(SIDECAR, path.join(PD, 'ZZZY.json'));
  t(/ไม่ใช่ ZZZY/.test(cli(['init', 'ZZZY']).out), 'sidecar of another symbol → refused');
  fs.writeFileSync(path.join(R, 'DUP.html'), '<html></html>'); fs.writeFileSync(rf('DUP'), '{}');
  t.eq(cli(['init', 'DUP']).code, 1, 'both .html and .json for one symbol → exit 1 (no throw escapes run)');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
t.done();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk proxy node test/v3/report-cli.test.js`
Expected: FAIL — `Cannot find module '../../tools/report.js'`.

- [ ] **Step 3: Implement `tools/report.js`**

Create `tools/report.js`:

```js
#!/usr/bin/env node
'use strict';
/**
 * report.js — ทางเขียนเดียวของรายงาน v3 (spec §6.1 · Plan 2b)
 *   init <SYM>             sidecar .queue/prep/<SYM>.json → .work/<SYM>.json (ใบใหม่ · ช่องดุลพินิจ = sentinel "TODO")
 *   export <SYM>           reports/<SYM>.json → .work/<SYM>.json (ตัด market + _sig) — UPDATE
 *   save <SYM> [--light]   draft + market → checkDoc(stage:'save') + กติกา B → error ครบทุกข้อพร้อม path · ผ่านหมด = IO.write
 *   show <SYM> [path]      view ที่ compute แล้ว (ไม่มี path = FV/MOS/ขา + ตาราง token ที่ใช้ได้พร้อมค่า ณ ตอนนี้)
 *   diff <SYM>             draft vs ใบปัจจุบัน — path ที่เปลี่ยน + FV/MOS/ค่าขา ก่อน → หลัง
 * ตัวเลือกสำหรับเทส/replay (R7): --reports-dir --work-dir --prep-dir --seeds <file> --today YYYY-MM-DD · --force = init/export ทับ draft
 *   (--today ตั้งนาฬิกาของ init/save/show เท่านั้น — verify ใช้นาฬิกาจริงเสมอ ไม่ใช่ทางหนี staleness)
 * exit: 0 ผ่าน · 1 ปฏิเสธ/ไม่ผ่าน gate · 2 ใช้คำสั่งผิด
 * ★ เขียน reports/ ได้ทางเดียวคือ save → IO.write (hook guard-reports.js บล็อกการเขียนตรง · _sig/E50 จับที่ gate)
 */
const fs = require('fs');
const path = require('path');
const S = require('./v3/schema.js');
const C = require('./v3/compute.js');
const P = require('./v3/prose.js');
const IO = require('./v3/io.js');
const TK = require('./v3/tokens.js');
const RS = require('./report-source.js');
const CV = require('../test/check-v3.js');
const { todayBangkok } = require('./queue/footer-date.js');

const ROOT = path.join(__dirname, '..');
const SYM_RE = /^[A-Z0-9][A-Z0-9.\-]*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MINUS = '−';
const USAGE = 'ใช้: node tools/report.js <init|export|save|show|diff> <SYMBOL> [path] [--light] [--force]\n'
  + '    (เทส/replay: --reports-dir <dir> --work-dir <dir> --prep-dir <dir> --seeds <file> --today YYYY-MM-DD)';
const PROSE_HINT = { chart: 'อ่านกราฟราคา ~1 ปี', valuation: 'สรุปวิธีประเมินมูลค่าและน้ำหนัก', gauge: 'ตำแหน่งราคาเทียบ FV', mos: 'ส่วนเผื่อความปลอดภัย',
  verdictHeadline: 'หัวข้อคำตัดสิน', verdictBody: 'เนื้อคำตัดสิน', strategy: 'กลยุทธ์ตามโซนราคา', disclaimerSources: 'แหล่งข้อมูลท้ายรายงาน' };
// --light (spec §6.1): ช่อง P.proseFields ทั้งหมด + ช่องเหล่านี้ — ตรงกับ UPDATE-LIGHT ของ v2 (รีเฟรชเป้า analyst/ปันผล)
const LIGHT_EXACT = new Set(['meta.analysisDate', 'meta.aiModel', 'meta.sources', 'meta.priceNote', 'analyst', 'fundamentals.dps']);
const LIGHT_PREFIX = ['meta.sources[', 'analyst.'];

class UsageError extends Error {}
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const round1 = (x) => Math.round(x * 10) / 10;
const signed1 = (x) => (x < 0 ? MINUS : '+') + Math.abs(x).toFixed(1);
const T = (what) => `TODO: ${what}`;
const rel = (f) => { const r = path.relative(ROOT, f); return r && !r.startsWith('..') ? r : f; };

/** sidecar v1 (Task 6) → draft ใบใหม่ (บริสุทธิ์) — ส่วน mechanical เติมให้ · ช่องดุลพินิจ = "TODO: …" ที่ save/gate ปฏิเสธ (E51)
 *  ไม่มี market (save เติมจาก sidecar) · ไม่มี meta.aiModel (worker รายงานตัวเอง) · ไม่มี themeLegacy (สีจาก seeds.json) */
function draftFromSidecar(sc, today) {
  const t = sc.ttm || {}, v = sc.vendor || {}, mk = sc.market || {}, med = sc.medians;
  const f = {};
  const put = (k, x) => { if (isNum(x)) f[k] = x; };
  const eps = isNum(v.epsTTM) ? v.epsTTM : t.epsDil;
  put('eps', eps); if (isNum(eps)) f.epsBasis = 'gaap-ttm';
  put('dps', sc.dps); put('shares', sc.sharesOut);   // [2b] หุ้นคงเหลือ — ไม่ใช่ถัวเฉลี่ยปรับลด
  put('revenue', t.revenue); put('netIncome', t.netIncome); put('fcf', t.fcf);
  put('grossMargin', t.grossMargin); put('opMargin', t.opMargin); put('netMargin', t.netMargin);
  put('roe', t.roe); put('debtToEquity', t.debtToEquity);
  if (isNum(t.debt) && isNum(t.cash)) f.netDebt = t.debt - t.cash;
  const medOk = !!(med && isNum(med.median) && !med.curErr);   // curErr = ผสมสกุล → ห้ามใช้มัธยฐาน
  if (medOk) f.peAvg5y = round1(med.median);
  const trap2c = (v.traps || []).some((x) => /^\[2c\]/.test(x));   // forecast คนละงวด → ไม่ใส่ epsForward
  if (isNum(sc.epsForward) && sc.epsForward > 0 && !trap2c) f.epsForward = sc.epsForward;
  if (sc.fy && sc.fy.period) {
    const fy = { period: sc.fy.period };
    for (const k of ['netIncome', 'eps', 'revenue']) if (isNum(sc.fy[k])) fy[k] = sc.fy[k];
    if (Object.keys(fy).length > 1) f.fy = fy;
  }

  const meta = {
    company: sc.company || T('ชื่อบริษัท'), exchange: sc.exchange || T('ตลาด เช่น NYSE / NASDAQ / SET'),
    sub: T('คำโปรยธุรกิจ 1 บรรทัด (≥10 ตัวอักษร)'), headerTags: [T('แท็กหัวรายงาน 0–2 ข้อ')], analysisDate: today,
    sources: ['Yahoo Finance', 'StockAnalysis.com', T('แหล่งที่ 3 เช่น SEC 10-Q / งบ SET')],
  };
  const dP = sc.crossVerify && sc.crossVerify.dP;
  if (isNum(dP)) meta.priceNote = Math.abs(dP) <= 2 ? 'StockAnalysis.com ตรงกับ Yahoo Finance' : T(`ราคา 2 แหล่งต่าง ${Math.abs(dP).toFixed(1)}% — ระบุแหล่งที่ใช้`);

  const legs = [];
  if (medOk && f.eps > 0) {
    const range = isNum(med.lo) && isNum(med.hi) ? ` กรอบ ${med.lo.toFixed(1)}–${med.hi.toFixed(1)}x` : '';
    const inputs = { multiple: T(`ตัวคูณเป้าหมาย — มัธยฐาน ${med.median.toFixed(1)}x${range} (ห้ามยึด P/E ปัจจุบัน — W18)`), multipleSource: 'median5y' };
    if (med.window) inputs.medianWindow = med.window;
    legs.push({ method: 'pe', label: 'P/E มัธยฐาน 5 ปี', inputs, note: T('เหตุผลที่เลือกตัวคูณนี้') });
  }
  while (legs.length < 2) legs.push({ method: T('วิธีประเมิน เช่น pe / ddm / dcf / declared'), label: T('ชื่อขา'), inputs: {}, note: T('ที่มาของตัวเลข') });

  const CARD_IF = [['mcap', f.shares != null], ['pe', f.eps > 0], ['yield', f.dps > 0], ['eps', f.eps != null], ['roe', f.roe != null],
    ['netMargin', f.netMargin != null], ['revenue', f.revenue != null], ['range52w', mk.range52w != null], ['peAvg5y', f.peAvg5y != null],
    ['fcf', f.fcf != null], ['debtToEquity', f.debtToEquity != null]];

  const divIncluded = f.dps > 0, epsDriven = f.eps > 0;
  const scenarios = {
    years: 3, divIncluded, perYear: 'cagr',
    driver: epsDriven ? 'eps' : T('driver: eps / ffo / revenuePerShare / bvps / fcfPerShare'),
    exitMetric: epsDriven ? 'pe' : T('exitMetric: pe / ps / pbv / pffo / pfcf'),
    cases: ['Bear', 'Base', 'Bull'].map((n) => {
      const c = { growth: T(`% โตต่อปีของฉาก ${n}`), exitMultiple: T(`ตัวคูณตอนออกของฉาก ${n}`) };
      if (divIncluded) c.divCum = T(`ปันผลสะสมต่อหุ้นถึงจุดออก ฉาก ${n}`);
      c.desc = T(`เหตุการณ์ของฉาก ${n}`);
      return c;
    }),
    note: T('สมมติฐานร่วมของทั้งสามฉาก'),
  };
  const analyst = isNum(v.target) && v.target > 0
    ? { target: v.target, ...(Number.isInteger(v.analysts) && v.analysts >= 1 ? { n: v.analysts } : {}), rating: sc.rating || T('เรตติ้งนักวิเคราะห์'), asOf: mk.priceDate || null }
    : null;

  return {
    v: 3, symbol: sc.symbol, currency: sc.currency, region: sc.region, dateEra: 'BE', meta, fundamentals: f, legs, fvWeights: null,
    metrics: { cards: CARD_IF.filter(([, ok]) => ok).map(([k]) => k) }, scenarios, analyst,
    prose: Object.fromEntries(Object.entries(PROSE_HINT).map(([k, h]) => [k, T(h)])),
    catalysts: [1, 2, 3].map((i) => T(`ปัจจัยหนุนข้อ ${i}`)), risks: [1, 2, 3].map((i) => T(`ความเสี่ยงข้อ ${i}`)), extras: [],
  };
}

/** leaf path ที่ต่างกัน (ไม่นับ market/_sig ระดับบนสุด) — ตัวเดียวที่ --light และ diff ใช้ */
function diffPaths(a, b) {
  const out = [];
  const walk = (x, y, p) => {
    if (Array.isArray(x) && Array.isArray(y)) { for (let i = 0; i < Math.max(x.length, y.length); i++) walk(x[i], y[i], `${p}[${i}]`); return; }
    if (isObj(x) && isObj(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (!p && (k === 'market' || k === '_sig')) continue;
        walk(x[k], y[k], p ? `${p}.${k}` : k);
      }
      return;
    }
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push(p);
  };
  walk(a || {}, b || {}, '');
  return out;
}

function lightViolations(before, after) {
  const prose = new Set([...P.proseFields(before), ...P.proseFields(after)].map((x) => x.path));
  const ok = (p) => prose.has(p) || LIGHT_EXACT.has(p) || LIGHT_PREFIX.some((x) => p.startsWith(x));
  return diffPaths(before, after).filter((p) => !ok(p));
}

function getPath(obj, p) {
  let x = obj;
  for (const k of p.split(/[.[\]]/).filter(Boolean)) { if (x == null) return undefined; x = x[k]; }
  return x;
}

function parseArgs(argv) {
  const VAL = { '--reports-dir': 'reportsDir', '--work-dir': 'workDir', '--prep-dir': 'prepDir', '--seeds': 'seeds', '--today': 'today' };
  const o = { _: [], force: false, light: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VAL[a]) { if (argv[i + 1] == null) throw new UsageError(`${a} ต้องมีค่า`); o[VAL[a]] = argv[++i]; }
    else if (a === '--force') o.force = true;
    else if (a === '--light') o.light = true;
    else if (a.startsWith('--')) throw new UsageError(`ไม่รู้จักตัวเลือก ${a}`);
    else o._.push(a);
  }
  if (o.today != null && !ISO_RE.test(o.today)) throw new UsageError('--today ต้องเป็น YYYY-MM-DD');
  return o;
}

// ── ตัวช่วย I/O ──
const workFile = (c) => path.join(c.workDir, c.sym + '.json');
const reportFile = (c) => path.join(c.reportsDir, c.sym + '.json');
function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`${what} ${rel(file)} อ่านไม่ได้: ${e.message}`); }
}
const seedsOf = (c) => readJson(c.seedsFile, 'seeds') || {};
function loadSidecar(c) {
  const file = path.join(c.prepDir(), c.sym + '.json');
  const sc = readJson(file, 'sidecar');
  if (!sc) return { sc: null, errs: [`ไม่พบ sidecar ${rel(file)} — รัน npm run queue -- prep ${c.sym} ก่อน (โหมด NEW)`] };
  const errs = [];
  if (sc.v !== 1) errs.push(`sidecar ${rel(file)} เวอร์ชัน ${JSON.stringify(sc.v)} — รองรับแค่ 1 (รัน prep ใหม่)`);
  if (sc.symbol !== c.sym) errs.push(`sidecar ${rel(file)} เป็นของ ${JSON.stringify(sc.symbol)} ไม่ใช่ ${c.sym}`);
  if (!isObj(sc.market) || !isNum(sc.market.px)) errs.push(`sidecar ${rel(file)} ไม่มี market.px — รัน prep ใหม่`);
  return { sc, errs };
}
const refuseDraft = (c) => { c.err(`✗ มี draft ${rel(workFile(c))} อยู่แล้ว — ไม่เขียนทับงานที่ทำค้าง (ตั้งใจเริ่มใหม่: --force)`); return 1; };

// ── คำสั่ง ──
function cmdInit(c) {
  const kind = RS.kindOf(c.sym, c.reportsDir);
  if (kind) {
    c.err(`✗ มีรายงาน ${c.sym}.${kind === 'v2' ? 'html' : 'json'} อยู่แล้ว — init ใช้กับใบใหม่เท่านั้น`
      + (kind === 'v3' ? ` (UPDATE: node tools/report.js export ${c.sym})` : ' (ใบ v2: node tools/apply-edits.js)'));
    return 1;
  }
  if (fs.existsSync(workFile(c)) && !c.force) return refuseDraft(c);
  const { sc, errs } = loadSidecar(c);
  if (errs.length) { for (const e of errs) c.err('✗ ' + e); return 1; }
  const draft = draftFromSidecar(sc, c.today);
  fs.mkdirSync(c.workDir, { recursive: true });
  fs.writeFileSync(workFile(c), IO.serialize(draft));
  const todo = S.stringLeaves(draft, '', []).filter((x) => S.TODO_RE.test(x.text)).length;
  c.log(`✓ ${rel(workFile(c))} — ใบใหม่ ${c.sym} · ช่อง TODO ${todo} ช่อง (save ปฏิเสธจนกว่าจะเติมครบ + ใส่ meta.aiModel)`);
  if (sc.builtAt && sc.builtAt !== c.today) c.log(`⚠ sidecar สร้างเมื่อ ${sc.builtAt} (วันนี้ ${c.today}) — ราคา/งบอาจเก่า: รัน prep ใหม่ถ้าไม่แน่ใจ`);
  const m = sc.medians;
  if (m && isNum(m.median) && !m.curErr) c.log(`ℹ มัธยฐาน P/E ${m.window || ''} = ${m.median.toFixed(1)}x${isNum(m.lo) && isNum(m.hi) ? ` (กรอบ ${m.lo.toFixed(1)}–${m.hi.toFixed(1)}x → hint ของ legs[0].inputs.multipleRange)` : ''}`);
  else c.log(`ℹ ไม่มีมัธยฐาน P/E ที่ใช้ได้${m && m.curErr ? ` (${m.curErr})` : ''} — ไม่ได้ร่างขา pe ให้`);
  for (const x of (sc.vendor && sc.vendor.traps) || []) c.log(`⚠ กับดัก vendor: ${x}`);
  c.log(`ต่อไป: เติม TODO ใน ${rel(workFile(c))} → สีแบรนด์ node tools/pick-brand.js ${c.sym} "#rrggbb" → node tools/report.js save ${c.sym} (ตัวเลข/token: node tools/report.js show ${c.sym})`);
  return 0;
}

function cmdExport(c) {
  const kind = RS.kindOf(c.sym, c.reportsDir);
  if (kind !== 'v3') {
    c.err(`✗ export ใช้กับใบ v3 เท่านั้น — ${kind === 'v2' ? `${c.sym} เป็นใบ v2: ใช้ node tools/apply-edits.js` : `ไม่มีรายงาน ${c.sym} (ใบใหม่: node tools/report.js init ${c.sym})`}`);
    return 1;
  }
  if (fs.existsSync(workFile(c)) && !c.force) return refuseDraft(c);
  const { market, _sig, ...draft } = RS.load(c.sym, c.reportsDir).doc;
  fs.mkdirSync(c.workDir, { recursive: true });
  fs.writeFileSync(workFile(c), IO.serialize(draft));
  c.log(`✓ ${rel(workFile(c))} ← ${c.sym}.json (ตัด market + _sig — save เติม market จากใบเดิมให้เอง)`);
  return 0;
}

function cmdSave(c) {
  const kind = RS.kindOf(c.sym, c.reportsDir);
  // Review Focus 1: .json ข้างใบ v2 = build.reportEntries throw ทั้งเว็บ
  if (kind === 'v2') { c.err(`✗ ${c.sym} เป็นใบ v2 (${c.sym}.html) — save ไม่เขียน .json ข้างใบ v2 (build จะล้มทั้งเว็บ) · แก้ใบ v2 ด้วย node tools/apply-edits.js`); return 1; }
  const draft = readJson(workFile(c), 'draft');
  if (!draft) { c.err(`✗ ไม่พบ draft ${rel(workFile(c))} — ${kind ? 'export' : 'init'} ก่อน: node tools/report.js ${kind ? 'export' : 'init'} ${c.sym}`); return 1; }
  // (1) ด่านเจ้าของ (S.OWNER) + สิ่งที่ merge ไม่ได้ — ล้มตรงนี้ = ยังไม่มีเอกสารให้ตรวจ
  const pre = [];
  if (!isObj(draft)) pre.push('(root): draft ต้องเป็น JSON object');
  else {
    for (const k of Object.keys(draft)) {
      const own = S.OWNER(k);
      if (own !== 'worker') pre.push(`${k}: เป็นของ ${own === 'cron' ? 'cron — save เติมจาก sidecar/ใบเดิมให้เอง' : 'io.js — save เซ็นให้เอง'} · ลบออกจาก draft`);
    }
    if (draft.symbol !== c.sym) pre.push(`symbol: ${JSON.stringify(draft.symbol)} ไม่ตรงกับ ${c.sym}`);
    if (!kind && isObj(draft.meta) && draft.meta.themeLegacy != null) pre.push('meta.themeLegacy: ใบใหม่ใช้สีจาก tools/seeds.json (node tools/pick-brand.js) — ลบช่องนี้ (§3.5)');
  }
  if (c.light && !kind) pre.push('--light: ใช้กับใบที่มีอยู่แล้วเท่านั้น (UPDATE-LIGHT) — ใบใหม่ใช้ save เต็ม');
  let market = null, before = null;
  if (kind === 'v3') { before = RS.load(c.sym, c.reportsDir).doc; market = before.market; }
  else { const s = loadSidecar(c); pre.push(...s.errs); if (s.sc) market = s.sc.market; }
  if (pre.length) { for (const e of pre) c.err('✗ ' + e); c.err(`❌ save ไม่ผ่าน — ${pre.length} ข้อ · ไม่ได้เขียน ${c.sym}.json`); return 1; }

  // (2) merge market → (3) checkDoc stage:'save' → (4) กติกา B → (5) พิมพ์ครบทุกข้อ → (6) IO.write
  const doc = { ...draft, market };
  const lines = [], warns = [];
  if (c.light) for (const p of lightViolations(before, doc)) lines.push(`✗ [--light] ${p}: อยู่นอก allowlist ของ --light — ใช้ save เต็ม (UPDATE)`);
  const r = CV.checkDoc(doc, { skipSig: true, seeds: seedsOf(c), stage: 'save', today: c.today });
  for (const e of r.errors) {
    if (e.details && e.details.length) for (const d of e.details) lines.push(`✗ [${e.id}] ${d.path}: ${d.msg}`);
    else lines.push(`✗ [${e.id}] ${e.label}: ${e.msg}`);
  }
  if (r.view) {
    const b = P.checkRuleB(doc, r.view);
    for (const x of b.errors) lines.push(`✗ [กติกา B] ${x.path}: "${x.literal}" คือค่าผูกราคา — ใช้ {{${x.token}}}`);
    for (const x of b.warnings) warns.push(`⚠ [กติกา B] ${x.path}: "${x.literal}" ใกล้ {{${x.token}}} — ถ้าเป็นค่าเดียวกันให้ใช้ token`);
  }
  for (const w of r.warnings) warns.push(`⚠ [${w.id}] ${w.label}: ${w.msg}`);
  for (const d of r.dropped) c.log(`ℹ stage:save ตัด ${d.id} (${d.label}) — tag ลงตอน ship ด้วย tools/tag-apply.js`);
  for (const w of warns) c.log(w);
  if (lines.length) { for (const l of lines) c.err(l); c.err(`❌ save ไม่ผ่าน — ${lines.length} ข้อ · ไม่ได้เขียน ${c.sym}.json`); return 1; }
  IO.write(reportFile(c), doc);
  const v = r.view;
  c.log(`✓ ${rel(reportFile(c))} — FV ${v.cur}${v.fv.toFixed(2)} · MOS ${signed1(v.sm.mos)}% (ราคา ${v.cur}${doc.market.px} · ${doc.market.priceDate})`);
  c.log(`ต่อไป: npm test -- ${c.sym}`);
  return 0;
}

/** เอกสารที่ show/diff ใช้: draft (+ market ของใบเดิม หรือ sidecar) ถ้ามี ไม่งั้นใบใน reports/ */
function docForView(c) {
  const kind = RS.kindOf(c.sym, c.reportsDir);
  if (kind === 'v2') throw new Error(`${c.sym} เป็นใบ v2 — show/diff ใช้กับใบ v3`);
  const report = kind === 'v3' ? RS.load(c.sym, c.reportsDir).doc : null;
  const draft = readJson(workFile(c), 'draft');
  if (draft) {
    let market = report ? report.market : null;
    if (!market) { const s = loadSidecar(c); if (s.errs.length) throw new Error(s.errs.join(' · ')); market = s.sc.market; }
    const { market: _m, _sig, ...rest } = draft;
    return { src: `draft ${rel(workFile(c))}`, doc: { ...rest, market }, report };
  }
  if (report) return { src: `${c.sym}.json`, doc: report, report };
  throw new Error(`ไม่มีทั้ง draft และรายงานของ ${c.sym} (ใบใหม่: node tools/report.js init ${c.sym})`);
}
function viewOf(doc, c) {
  const seeds = seedsOf(c);
  let errors = S.validate(doc).map((e) => `${e.path}: ${e.msg}`);
  if (!errors.length) errors = C.semanticErrors(doc, { seeds }).map((e) => `${e.path}: ${e.msg}`);
  return errors.length ? { errors } : { view: C.compute(doc, { seeds }) };
}

function cmdShow(c) {
  const { src, doc } = docForView(c);
  const { view, errors } = viewOf(doc, c);
  if (errors) { c.err(`✗ ${src} ยัง compute ไม่ได้ — ${errors.length} ข้อ (save พิมพ์ครบพร้อมรหัส):`); for (const l of errors) c.err('  ' + l); return 1; }
  if (c.arg) {
    const val = getPath(view, c.arg);
    if (val === undefined) { c.err(`✗ ไม่มี path "${c.arg}" ใน view (เช่น fv · fvLow · sm.mos · legs[0].value · scn[1].tgt · d.pe)`); return 1; }
    c.log(JSON.stringify(val, null, 2));
    return 0;
  }
  const cur = view.cur;
  c.log(`${c.sym} — ${src}`);
  c.log(`FV ${cur}${view.fv.toFixed(2)} (กรอบ ${cur}${view.fvLow.toFixed(2)}–${cur}${view.fvHigh.toFixed(2)}) · MOS ${signed1(view.sm.mos)}% · ราคา ${cur}${doc.market.px} (${doc.market.priceDate})`);
  view.legs.forEach((l, i) => c.log(`  legs[${i}] ${l.label}: ${cur}${l.value.toFixed(2)} × น้ำหนัก ${(l.weight * 100).toFixed(1)}%${l.role === 'context' ? ' (context)' : ''}`));
  c.log('token ที่ใช้ได้ใน prose (ค่า ณ ตอนนี้ — ตัวเลขผูกราคาต้องเขียนเป็น token เสมอ · กติกา B):');
  for (const [k, fn] of Object.entries(TK.TOKENS_V3)) {
    let s;
    try { s = fn(view); } catch (_) { continue; }   // token ที่ใบนี้ไม่มีค่า = ใช้ไม่ได้ → ไม่แสดง
    c.log(`  {{${k}}} = ${s}`);
  }
  return 0;
}

function cmdDiff(c) {
  const { doc, report } = docForView(c);
  if (!report) { c.log(`${c.sym}: ใบใหม่ — ไม่มีใบเดิมให้เทียบ (ดูตัวเลข: node tools/report.js show ${c.sym})`); return 0; }
  if (doc === report) { c.log(`${c.sym}: ไม่มี draft — ไม่มีอะไรต่าง`); return 0; }
  const paths = diffPaths(report, doc);
  const short = (x) => { const s = JSON.stringify(x); return s === undefined ? '∅' : s.length > 70 ? s.slice(0, 67) + '…' : s; };
  c.log(`${c.sym}: draft vs ${c.sym}.json — ${paths.length} path เปลี่ยน`);
  for (const p of paths) c.log(`  ${p}: ${short(getPath(report, p))} → ${short(getPath(doc, p))}`);
  const a = viewOf(report, c), b = viewOf(doc, c);
  if (a.errors || b.errors) { c.log(`ℹ ${b.errors ? 'draft' : 'ใบเดิม'} ยัง compute ไม่ได้ — เทียบ FV ไม่ได้ (ดู save)`); return 0; }
  const va = a.view, vb = b.view, cur = vb.cur;
  c.log(`FV ${cur}${va.fv.toFixed(2)} → ${cur}${vb.fv.toFixed(2)} · MOS ${signed1(va.sm.mos)}% → ${signed1(vb.sm.mos)}%`);
  for (let i = 0; i < Math.max(va.legs.length, vb.legs.length); i++) {
    const x = va.legs[i], y = vb.legs[i];
    if (!x || !y || x.value !== y.value || x.weight !== y.weight)
      c.log(`  legs[${i}] ${x ? cur + x.value.toFixed(2) : '∅'} → ${y ? cur + y.value.toFixed(2) : '∅'}`);
  }
  return 0;
}

const CMDS = { init: cmdInit, export: cmdExport, save: cmdSave, show: cmdShow, diff: cmdDiff };

function run(argv, io) {
  const log = (io && io.log) || console.log, err = (io && io.err) || console.error;
  let o;
  try { o = parseArgs(argv); }
  catch (e) { if (e instanceof UsageError) { err(`✗ ${e.message}\n${USAGE}`); return 2; } throw e; }
  const [cmd, rawSym, arg] = o._;
  if (!CMDS[cmd] || !rawSym) { err(USAGE); return 2; }
  if (o.light && cmd !== 'save') { err(`✗ --light ใช้กับ save เท่านั้น\n${USAGE}`); return 2; }
  const sym = rawSym.toUpperCase();
  if (!SYM_RE.test(sym)) { err(`✗ symbol ไม่ถูกรูป: ${rawSym}`); return 2; }
  const c = {
    sym, arg, log, err, force: o.force, light: o.light, today: o.today || todayBangkok(),
    reportsDir: o.reportsDir || RS.REPORTS_DIR, workDir: o.workDir || path.join(ROOT, '.work'),
    prepDir: () => o.prepDir || require('./queue/state.js').PREP_DIR,   // lazy — state.js ถาม git ตอน require
    seedsFile: o.seeds || path.join(ROOT, 'tools', 'seeds.json'),
  };
  try { return CMDS[cmd](c); }
  catch (e) { err(`✗ ${String(e.message).split('\n')[0]}`); return 1; }
}

module.exports = { run, draftFromSidecar, diffPaths, lightViolations };
if (require.main === module) process.exitCode = run(process.argv.slice(2));
```

- [ ] **Step 4: Run the tests**

Run: `rtk proxy node test/v3/report-cli.test.js && rtk proxy node test/v3-test.js 2>&1 | tail -25 && rtk proxy git status --short reports/ reports.json .work .queue`
Expected: `✓ report-cli: N/N`; every v3 line `✓` (the tripwire `no-json-reports` included); the `git status` line prints nothing.

If `raw draft save → exit 1 naming every path` fails, print `r.out` and check that Task 5's `checkDoc` returns schema `E51` with `details` — do not weaken the list of paths.

- [ ] **Step 5: Commit**

```bash
git add tools/report.js test/v3/report-cli.test.js
git commit -m "feat(v3): tools/report.js — init/export/save/show/diff (spec §6.1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 8: PreToolUse hook — `.claude/hooks/guard-reports.js` + `test/v3/hook.test.js` + `docs/hook-setup.md` (spec §6.2 ชั้น 1)

**Files:**
- Create: `.claude/hooks/guard-reports.js`
- Create: `test/v3/hook.test.js`
- Create: `docs/hook-setup.md`
- **Do not touch** `.claude/settings.json` (the owner pastes the snippet — ruling 5 / R13).

**Interfaces:**
- Consumes: the PreToolUse hook input on stdin `{ tool_name, tool_input: { file_path | notebook_path | command }, cwd, … }`.
- Produces: `decide(input) → { why } | null`, `analyze(cmd, cwd, depth) → string | null`, `lex(src) → [{t:'w'|'op'|'sep', v}]`, `inReports(p, cwd) → boolean`, `stripHeredocs(src) → string`, `denyJson(why) → string`, `REASON`. Process contract: exit 0 always; deny = one line `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<REASON> · <why>"}}` on stdout; allow or any internal failure = no output (fail-open).

If the harness refuses to create `.claude/hooks/guard-reports.js`, STOP and report — do not relocate the script (the settings snippet and the spec name this path).

- [ ] **Step 1: Write the failing test**

Create `test/v3/hook.test.js`:

```js
'use strict';
// Plan 2b Task 8 — PreToolUse hook .claude/hooks/guard-reports.js (spec §6.2 ชั้น 1 · R10)
// repo ปลอมในโฟลเดอร์ชั่วคราว (มี build.js + reports/) — ไม่แตะ reports/ จริง
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const t = require('./_t.js')('hook');
const HOOK = path.join(__dirname, '..', '..', '.claude', 'hooks', 'guard-reports.js');
const H = require(HOOK);

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-hook-'));
const REP = path.join(repo, 'reports');
fs.writeFileSync(path.join(repo, 'build.js'), '// fake repo root\n');
fs.mkdirSync(REP);
const other = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-hook-other-'));   // มีโฟลเดอร์ชื่อเดียวกันแต่ไม่ใช่ repo (ไม่มี build.js)
const OTHER_REP = path.join(other, 'reports');
fs.mkdirSync(OTHER_REP);
const bash = (command, cwd) => H.decide({ tool_name: 'Bash', tool_input: { command }, cwd: cwd || repo });
const file = (tool_name, p) => H.decide({ tool_name, tool_input: tool_name === 'NotebookEdit' ? { notebook_path: p } : { file_path: p }, cwd: repo });

try {
  // ── file tools: ทุกไฟล์ใต้ reports/ (ไม่ใช่แค่ .json — กัน worker ถอยไปเขียน HTML) ──
  t(file('Write', path.join(REP, 'X.json')), 'Write reports/X.json (absolute) → deny');
  t(file('Edit', 'reports/X.html'), 'Edit reports/X.html (relative to cwd) → deny');
  t(file('MultiEdit', './reports/../reports/X.html'), 'MultiEdit with ./ and .. → deny');
  t(file('NotebookEdit', path.join(REP, 'n.ipynb')), 'NotebookEdit under reports/ → deny');
  t(!file('Write', path.join(repo, 'tools', 'x.js')), 'Write tools/x.js → allow');
  t(!file('Write', path.join(repo, 'reportsX', 'a.json')), 'segment "reportsX" is not reports → allow');
  t(!file('Write', path.join(OTHER_REP, 'a.json')), 'reports/ of a folder without build.js → allow (R10)');
  t(!file('Write', undefined) && !H.decide({ tool_name: 'Read', tool_input: { file_path: path.join(REP, 'X.json') }, cwd: repo }), 'no path / Read tool → allow');

  // ── Bash: ต้องปฏิเสธ ──
  const DENY = [
    'echo {} > reports/X.json', 'echo x >> reports/X.html', 'printf x>reports/X.json', 'echo x &> reports/X.json', 'echo x 1>reports/X.json',
    "cat > reports/X.json <<'EOF'\n{}\nEOF",
    'cp /tmp/a.json reports/X.json', 'mv a.json reports', 'cp -t reports a.json', 'cp --target-directory=reports a.json', 'rsync -a a/ reports/',
    'ln -s /tmp/a reports/X.json', 'install -m644 a reports/X.json', 'dd if=/tmp/a of=reports/X.json',
    'tee reports/X.json < /tmp/a', 'echo x | tee -a reports/X.json', "sed -i '' 's/a/b/' reports/X.html", "sed -i.bak 's/a/b/' reports/X.html",
    "perl -pi -e 's/a/b/' reports/X.html", 'rtk proxy cp a reports/X.json', 'rtk git status --short > reports/ZZHOOK2.json',
    'git status > reports/X.json', 'FOO=1 cp a reports/X.json', 'sudo tee reports/X.json', 'env A=1 tee reports/X.json',
    "bash -c 'echo x > reports/X.json'", 'sh -c "cp a reports/X.json"',
    `node -e "require('fs').writeFileSync('reports/X.json','{}')"`, `python3 -c "open('reports/X.json','w').write('x')"`,
    'echo x > "$CLAUDE_PROJECT_DIR/reports/X.json"', `echo x > ${REP}/X.json`, 'echo ok && echo x > reports/X.json', 'true; cp a reports/',
    'echo $(cat /tmp/a > reports/X.json)',
  ];
  for (const c of DENY) t(bash(c), `deny: ${JSON.stringify(c)}`);
  // ── Bash: ต้องผ่าน (Review Focus 3 — ข้อความที่แค่ "ดูเหมือน" การเขียน) ──
  const ALLOW = [
    'git mv reports/A.html reports/A.json', 'git add reports/X.json', 'git checkout -- reports/X.html', 'rm reports/X.json', 'rm -f reports/ZZHOOK*.json',
    'grep -n foo reports/X.html | head', 'cp reports/X.html /tmp/', 'cat reports/X.json', 'ls reports/ > /tmp/list', 'wc -l reports/*.html',
    'node tools/report.js save X > /tmp/log 2>&1', 'node tools/report.js save X', 'node tools/apply-edits.js X reports/X.html',
    'git commit -m "fix > reports/x"', "git commit -m 'a >> reports/b'", 'echo "a > reports/x"', 'echo reports/x 2>&1',
    "node tools/apply-edits.js X <<'EOF'\n<div class=\"a\">x</div> > reports/y\nEOF",
    'sed -n 1p reports/X.html', 'diff reports/a.json /tmp/b.json', 'rtk git status --short reports/', 'rtk proxy git status --short reports/ .work .queue',
    `node -e "console.log(require('fs').readFileSync('reports/X.json','utf8').length)"`, 'echo hi > /tmp/x', 'cp a /tmp/reports.json',
    `echo x > ${path.join(OTHER_REP, 'a.json')}`,
  ];
  for (const c of ALLOW) t(!bash(c), `allow: ${JSON.stringify(c)} (got ${JSON.stringify(bash(c))})`);

  // ── lexer / heredoc units ──
  t.eq(H.lex('a "b c" d\\ e>f').map((x) => x.v), ['a', 'b c', 'd e', '>', 'f'], 'lex: quotes, escapes, glued redirect');
  t.eq(H.lex('x 2>&1 y').map((x) => x.v), ['x', '2>&1', 'y'], 'lex: 2>&1 is one op');
  t.eq(H.stripHeredocs("a <<'EOF'\nbody > reports/x\nEOF\nb"), "a <<'EOF'\nb", 'stripHeredocs: body removed, marker line kept');
  t.eq(H.stripHeredocs('cat <<< "x"\nnext'), 'cat <<< "x"\nnext', 'stripHeredocs: here-string is not a heredoc');

  // ── process contract: exit 0 เสมอ · deny = JSON บน stdout · ผ่าน/พัง = ไม่พิมพ์ ──
  const spawn = (input) => spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
  { const r = spawn(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo {} > reports/X.json' }, cwd: repo }));
    const o = r.status === 0 && r.stdout ? JSON.parse(r.stdout) : {};
    t(o.hookSpecificOutput && o.hookSpecificOutput.hookEventName === 'PreToolUse' && o.hookSpecificOutput.permissionDecision === 'deny'
      && o.hookSpecificOutput.permissionDecisionReason.startsWith(H.REASON), 'spawn deny → exit 0 + permissionDecision deny JSON with the reason'); }
  { const r = spawn(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git mv reports/A.html reports/A.json' }, cwd: repo }));
    t(r.status === 0 && r.stdout === '', 'spawn allow → exit 0, no output'); }
  { const r = spawn('not json {{{'); t(r.status === 0 && r.stdout === '', 'garbage stdin → fail-open (exit 0, no output)'); }
  { const r = spawn(''); t(r.status === 0 && r.stdout === '', 'empty stdin → fail-open'); }
  t(H.REASON.includes('node tools/report.js save') && H.REASON.includes('เขียนตรงไม่ได้'), 'REASON points to report.js save (docs/hook-setup.md greps for เขียนตรงไม่ได้)');
} finally { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(other, { recursive: true, force: true }); }
t.done();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk proxy node test/v3/hook.test.js`
Expected: FAIL — `Cannot find module '…/.claude/hooks/guard-reports.js'`.

- [ ] **Step 3: Implement the hook**

Create `.claude/hooks/guard-reports.js` (then `chmod +x .claude/hooks/guard-reports.js`; the settings snippet runs it through `node` either way):

```js
#!/usr/bin/env node
'use strict';
/**
 * guard-reports.js — PreToolUse hook: ห้ามเขียน reports/* ตรง (spec §6.2 ชั้น 1 · Plan 2b)
 *   ใบ v3 เขียนผ่าน `node tools/report.js save <SYM>` (io.js เซ็น _sig) · ใบ v2 ผ่าน `node tools/apply-edits.js`
 *   (ทั้งคู่เป็น child process ของ node — hook มองไม่เห็นโดยออกแบบ)
 * อินพุต = JSON ของ PreToolUse ทาง stdin · ปฏิเสธ = พิมพ์ JSON permissionDecision "deny" · อนุญาต = ไม่พิมพ์อะไร
 * ★ exit 0 เสมอ + fail-open: hook พัง/อินพุตเสีย = ปล่อยผ่าน (ไม่บล็อกทั้ง session เพราะบั๊กของ hook) — ตัวบังคับจริงคือ _sig/E50 ที่ gate
 * "ใต้ reports/" (R10) = path ที่มี segment ชื่อ reports ซึ่งโฟลเดอร์แม่มี build.js (checkout/worktree ไหนของ repo นี้ก็ได้)
 *   path ที่ยังมี $VAR ไม่ขยาย + มี reports/ = ปฏิเสธ (มองไม่เห็นปลายทางจริง)
 * ช่องโหว่ที่รู้ (ยอมรับ — _sig/E50 จับ): xargs · find -exec · สคริปต์ไฟล์ที่เขียนเอง · ข้อความใน "$(…)" ในเครื่องหมายคำพูดคู่ · heredoc ซ้อนใน bash -c
 * ติดตั้ง: docs/hook-setup.md (เจ้าของ paste เอง — ไม่แก้ .claude/settings.json จาก session)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const REASON = 'reports/* เขียนตรงไม่ได้ — แก้ .work/<SYM>.json แล้ว node tools/report.js save <SYM> (ใบ v2: node tools/apply-edits.js)';
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const REDIR_FILE = /^(?:&>>?|\d*>>?|\d*>\||>&|\d*<>)$/;          // redirect ที่มีปลายทางเป็นไฟล์ (ไม่ใช่ 2>&1)
const WRAPPERS = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nice', 'nohup', 'builtin']);
const WRITE_API = /writeFile|appendFile|createWriteStream|rename|copyFile|cpSync|\bopen\s*\([^)]*['"][wax+]|write_text|write_bytes|shutil\.|File\.write/;

/** path อยู่ใต้โฟลเดอร์ reports/ ของ checkout นี้ (หรือ worktree ใดก็ได้ของ repo) */
function inReports(p, cwd) {
  if (typeof p !== 'string' || !p) return false;
  if (p.includes('$')) return /(^|\/)reports(\/|$)/.test(p);
  const abs = path.resolve(cwd, p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);
  const segs = abs.split(path.sep);
  for (let i = 1; i < segs.length; i++)
    if (segs[i] === 'reports' && fs.existsSync(path.join(segs.slice(0, i).join(path.sep) || path.sep, 'build.js'))) return true;
  return false;
}

/** ตัดเนื้อ heredoc ทิ้ง (HTML ใน apply-edits <<'EOF' มี > และ reports/ ได้ตามปกติ) — คงบรรทัดที่มี << ไว้ */
function stripHeredocs(src) {
  const out = [], pending = [];
  for (const line of src.split('\n')) {
    if (pending.length) { const d = pending[0]; if ((d.dash ? line.replace(/^\t+/, '') : line) === d.word) pending.shift(); continue; }
    out.push(line);
    const re = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/g;
    let m;
    while ((m = re.exec(line))) pending.push({ dash: m[1] === '-', word: m[3] });
  }
  return out.join('\n');
}

/** lexer แบบ shell ย่อ: {t:'w'} คำ (ถอด quote/escape แล้ว) · {t:'op'} redirect · {t:'sep'} ตัวคั่นคำสั่ง ; && || | & ( ) ขึ้นบรรทัด */
function lex(src) {
  const out = [];
  let w = null, i = 0;
  const flush = () => { if (w !== null) { out.push({ t: 'w', v: w }); w = null; } };
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'") { const j = src.indexOf("'", i + 1), end = j < 0 ? src.length : j; w = (w || '') + src.slice(i + 1, end); i = end + 1; continue; }
    if (ch === '"') {
      let s = ''; i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length && '"\\$`\n'.includes(src[i + 1])) { s += src[i + 1]; i += 2; } else s += src[i++];
      }
      i++; w = (w || '') + s; continue;
    }
    if (ch === '\\') { if (src[i + 1] !== '\n') w = (w || '') + (src[i + 1] || ''); i += 2; continue; }
    if (ch === ' ' || ch === '\t') { flush(); i++; continue; }
    if (ch === '>' || ch === '<' || (ch === '&' && src[i + 1] === '>')) {
      let op = '';
      if (w !== null && /^\d+$/.test(w)) { op = w; w = null; } else flush();
      const m = /^(?:&>>?|<<<|<<-?|<>|<&|>>|>\||>&|>|<)/.exec(src.slice(i));
      op += m[0]; i += m[0].length;
      if (/[<>]&$/.test(op)) { const d = /^(?:\d+|-)/.exec(src.slice(i)); if (d) { op += d[0]; i += d[0].length; } }
      out.push({ t: 'op', v: op });
      continue;
    }
    if (';|&\n()'.includes(ch)) {
      flush();
      const two = src.slice(i, i + 2), op = ['&&', '||', ';;'].includes(two) ? two : ch;
      out.push({ t: 'sep', v: op }); i += op.length; continue;
    }
    if (ch === '#' && w === null) { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }   // คอมเมนต์
    w = (w || '') + ch; i++;
  }
  flush();
  return out;
}

/** คำสั่งเดี่ยวหนึ่งท่อน → เหตุผลที่ปฏิเสธ | null */
function segment(seg, cwd, depth) {
  const words = [];
  for (let i = 0; i < seg.length; i++) {
    const t = seg[i];
    if (t.t !== 'op') { words.push(t.v); continue; }
    const next = seg[i + 1] && seg[i + 1].t === 'w' ? seg[i + 1].v : null;
    if (REDIR_FILE.test(t.v) && next != null && inReports(next, cwd)) return `redirect ${t.v} ${next}`;
    if (next != null && !/&[\d-]+$/.test(t.v)) i++;   // ปลายทาง redirect / ตัวปิด heredoc ไม่ใช่ argument
  }
  let k = 0;
  const skipAssign = () => { while (k < words.length && /^[A-Za-z_]\w*=/.test(words[k])) k++; };
  skipAssign();
  for (;;) {
    if (words[k] === 'rtk') { k++; if (words[k] === 'proxy') k++; continue; }   // hook rtk-rewrite ของผู้ใช้ห่อคำสั่งด้วย rtk
    if (WRAPPERS.has(words[k])) { k++; while (k < words.length && words[k].startsWith('-')) k++; skipAssign(); continue; }
    break;
  }
  const argv = words.slice(k);
  if (!argv.length) return null;
  const name = path.basename(argv[0]), args = argv.slice(1);
  const files = args.filter((a) => !a.startsWith('-'));
  const hit = (list) => list.find((a) => inReports(a, cwd));
  switch (name) {
    case 'git': case 'rm': case 'rmdir': return null;   // git mv/add/checkout · rm = ผ่าน (spec §6.2)
    case 'tee': { const f = hit(files); return f ? `tee ${f}` : null; }
    case 'sed': case 'gsed': case 'perl': {
      if (!args.some((a) => /^-[A-Za-z]*i/.test(a) || a.startsWith('--in-place'))) return null;
      const f = hit(files); return f ? `${name} -i ${f}` : null;
    }
    case 'cp': case 'mv': case 'install': case 'rsync': case 'ln': {
      const eq = args.find((a) => a.startsWith('--target-directory='));
      const ti = args.findIndex((a) => a === '-t' || a === '--target-directory');
      const dest = eq ? eq.slice(eq.indexOf('=') + 1) : ti >= 0 ? args[ti + 1] : files.length >= 2 ? files[files.length - 1] : null;
      return dest && inReports(dest, cwd) ? `${name} → ${dest}` : null;
    }
    case 'dd': { const of = args.find((a) => a.startsWith('of=')); return of && inReports(of.slice(3), cwd) ? `dd ${of}` : null; }
    case 'node': case 'python': case 'python3': case 'ruby': {
      if (!args.some((a) => /^(?:-[ecp]|--eval|--print)$/.test(a))) return null;   // node tools/x.js = child process → ผ่าน
      const text = args.join(' ');
      return WRITE_API.test(text) && /\breports\//.test(text) ? `${name} inline script เขียน reports/` : null;
    }
    case 'bash': case 'sh': case 'zsh': {
      const ci = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
      return ci >= 0 && depth < 3 ? analyze(args[ci + 1], cwd, depth + 1) : null;
    }
    default: return null;
  }
}

/** คำสั่ง Bash ทั้งบรรทัด → เหตุผลที่ปฏิเสธ | null */
function analyze(cmd, cwd, depth) {
  if (typeof cmd !== 'string' || !cmd.includes('reports')) return null;   // ทางด่วน: ไม่พูดถึง reports เลย
  const segs = [[]];
  for (const t of lex(stripHeredocs(cmd))) { if (t.t === 'sep') segs.push([]); else segs[segs.length - 1].push(t); }
  for (const s of segs) { const r = segment(s, cwd, depth || 0); if (r) return r; }
  return null;
}

/** อินพุต PreToolUse → { why } (ปฏิเสธ) | null (ผ่าน) */
function decide(input) {
  if (!input || typeof input !== 'object') return null;
  const ti = input.tool_input || {};
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (FILE_TOOLS.has(input.tool_name)) { const p = ti.file_path || ti.notebook_path; return inReports(p, cwd) ? { why: `${input.tool_name} ${p}` } : null; }
  if (input.tool_name === 'Bash') { const why = analyze(ti.command, cwd, 0); return why ? { why } : null; }
  return null;
}

function denyJson(why) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${REASON} · ${why}` } });
}

function main() {
  let d = null;
  try { d = decide(JSON.parse(fs.readFileSync(0, 'utf8'))); } catch (_) { return; }   // fail-open
  if (d) process.stdout.write(denyJson(d.why) + '\n');
}

module.exports = { decide, analyze, lex, inReports, stripHeredocs, denyJson, REASON };
if (require.main === module) { try { main(); } catch (_) { /* fail-open */ } process.exitCode = 0; }
```

- [ ] **Step 4: Write `docs/hook-setup.md`**

Create `docs/hook-setup.md` with exactly this content:

````markdown
# ติดตั้ง hook กันเขียน `reports/*` ตรง (spec §6.2 ชั้น 1 · Plan 2b)

script: `.claude/hooks/guard-reports.js` (อยู่ใน repo แล้ว · เทส `test/v3/hook.test.js` อยู่ใน `npm run verify` ผ่าน `test/v3-test.js`)
ตัวบังคับจริง = ลายเซ็น `_sig` + gate E50 — hook เป็นแค่ชั้นเตือนเร็ว (fail-open: hook พัง = ปล่อยผ่าน)

## ⚠ paste เมื่อไร

**paste พร้อม cutover ของ Plan 2c (เอกสาร worker โหมด v3 NEW) — ไม่ใช่ตอนจบ Plan 2b.** hook ปฏิเสธ Write/Edit **ทุกไฟล์** ใต้ `reports/` รวม `.html` ⇒ โหมด NEW ของ v2 (stock-analyzer STEP 5A "Write `reports/<SYMBOL>.html` เต็มใบ") จะถูกบล็อกทันทีที่ paste · UPDATE ของ v2 ผ่าน `node tools/apply-edits.js` (child process) ยังทำงานตามปกติ

## snippet (เจ้าของ paste เอง — Claude ไม่แก้ `.claude/settings.json`)

`.claude/settings.json` ทั้งไฟล์หลัง paste (คง `env` เดิมไว้ตามเดิม):

```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js\"" }]
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js\"" }]
      }
    ]
  }
}
```

## พิสูจน์ใน `claude -p` process ใหม่ (controller ทำเอง — ไม่ใช่ implementer/worker)

settings และ CLAUDE.md โหลดตอนเริ่ม session ⇒ ต้องพิสูจน์ใน process ใหม่เสมอ · ใช้ `--settings` ไฟล์ชั่วคราว (ยังไม่ต้อง paste) · รันใน worktree ที่ไม่มีงานค้าง:

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan2b
cat > /tmp/guard-settings.json <<'EOF'
{"hooks":{"PreToolUse":[
 {"matcher":"Write|Edit|MultiEdit|NotebookEdit","hooks":[{"type":"command","command":"node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js\""}]},
 {"matcher":"Bash","hooks":[{"type":"command","command":"node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-reports.js\""}]}]}}
EOF
claude -p --settings /tmp/guard-settings.json --permission-mode acceptEdits \
  --allowedTools "Bash(echo:*),Bash(git status:*)" --output-format stream-json --verbose \
  'Do these three steps and report each result verbatim: (1) use the Write tool to create reports/ZZHOOK.json containing {} ; (2) run the Bash command: echo {} > reports/ZZHOOK1.json ; (3) run the Bash command: git status --short > reports/ZZHOOK2.json' \
  > /tmp/hook-proof.jsonl
grep -c 'เขียนตรงไม่ได้' /tmp/hook-proof.jsonl
test ! -e reports/ZZHOOK.json && test ! -e reports/ZZHOOK1.json && test ! -e reports/ZZHOOK2.json && echo HOOK-OK
rm -f reports/ZZHOOK*.json /tmp/hook-proof.jsonl /tmp/guard-settings.json
rtk proxy git status --short reports/
```

ผลที่ต้องได้:
- `grep -c` ≥ 3 (เหตุผล deny ของทั้งสามขั้นอยู่ใน tool_result)
- `HOOK-OK`
- `git status --short reports/` ว่าง
- ขั้น (3) คือหลักฐาน **deny ชนะ** hook Bash ระดับผู้ใช้ `rtk-rewrite.sh` (ซึ่ง allow + `updatedInput` เป็น `rtk git status …`) — ถ้าไฟล์ `ZZHOOK2.json` เกิดขึ้น = ลำดับ hook ไม่เป็นอย่างที่คิด หยุดแล้วรายงาน

## ช่องโหว่ที่รู้ (ยอมรับ — `_sig`/E50 จับตอน verify/pre-push)

`xargs …` · `find … -exec` · สคริปต์ไฟล์ที่เขียนขึ้นเองแล้วรัน · `"$(…)"` ในเครื่องหมายคำพูดคู่ · child process ทุกตัว (`apply-edits`, `report.js` — ตั้งใจ) · `cd` ไปที่อื่นก่อนเขียนด้วย path สัมพัทธ์ (hook resolve กับ cwd ของ session — ปฏิเสธเกินได้ ไม่ใช่ขาด)
````

- [ ] **Step 5: Run the tests**

Run: `rtk proxy node test/v3/hook.test.js && rtk proxy node test/v3-test.js 2>&1 | tail -25 && node test/docs-test.js | tail -2 && echo '{"tool_name":"Bash","tool_input":{"command":"echo x > reports/Q.json"}}' | node .claude/hooks/guard-reports.js`
Expected: `✓ hook: 77/77`; every v3 line `✓`; docs-test passes (the new doc has no forbidden phrase and no hand-typed `N ขั้น`); the last command prints one deny JSON line (cwd = worktree root, which has `build.js`).

Reviewer "can fail" proof: in `segment`, change `if (REDIR_FILE.test(t.v) && …) return …` to `if (false)`, run `rtk proxy node test/v3/hook.test.js` → the redirect `deny:` cases go `✗`; restore.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/guard-reports.js test/v3/hook.test.js docs/hook-setup.md
git commit -m "feat(v3): PreToolUse hook guard-reports.js + owner-paste snippet (spec §6.2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 9: Exit proof + docs (`open-items` #49–#52 · `decisions.md` §10 Plan 2b)

**Files:**
- Modify: `docs/open-items.md` (#49 "ปิดใน" cell · move #50/#51/#52 to a new closed section)
- Modify: `docs/decisions.md` (append the "Report v3 Plan 2b" block at the end of §10 — the file currently ends with the Plan 2a block)

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: the exit evidence the controller quotes in the PR body.

- [ ] **Step 1: Full gate**

Run: `rtk proxy npm run verify 2>&1 | tail -15 && node tools/gen-docs.js --check && echo GEN-OK`
Expected: every step green; `GEN-OK`. The `verify` step list is unchanged (all new tests live in `test/v3/` and run inside the existing `node test/v3-test.js` step, so no `gen-docs` regeneration is needed). If `gen-docs --check` fails, a task added a top-level test by mistake — stop and report.

- [ ] **Step 2: Parity, tripwire and cleanliness**

Run:

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan2b
rtk proxy node test/v3/tokens-corpus.test.js 2>&1 | tail -2
rtk proxy node test/v3/no-json-reports.test.js
rtk proxy node test/v3-test.js 2>&1 | grep -E '^[✓✗]'
ls reports/*.json 2>/dev/null | wc -l
rtk proxy git status --short reports/ reports.json .work .queue
```

Expected: `compute() accepted 909/909 v2 value sets` (the Plan 2a baseline — any lower number is a regression from Task 5, stop and report); `✓ no-json-reports: 1/1`; every v3 test file `✓` (new ones: `report-source`, `scanners-verify`, `scanners-cron`, `sidecar`, `report-cli`, `hook`); `0`; the `git status` line prints nothing.

- [ ] **Step 3: DIST-PROOF**

Run the DIST-PROOF block from Global Constraints. Expected: `DIST IDENTICAL`.

- [ ] **Step 4: `docs/open-items.md`**

Run (from the worktree root):

```bash
node - <<'EOF'
const fs = require('fs');
const f = 'docs/open-items.md';
const L = fs.readFileSync(f, 'utf8').split('\n');
const idx = (n) => { const i = L.findIndex((l) => l.startsWith(`| ${n} | `)); if (i < 0) throw new Error(`row #${n} not found`); return i; };
const i49 = idx(49), before49 = L[i49];
L[i49] = L[i49].replace(/\| v3 Plan 2 \|$/, '| scanner → **Plan 2b** (`tools/report-source.js` — ทุกจุดข้างบนยกเว้น `update-prices.yml`) · ลบ tripwire → **Plan 2c** (commit สุดท้ายก่อน exit) · `update-prices.yml` นับ `.json` → **P5** (#61/#62) |');
if (L[i49] === before49) throw new Error('#49 last cell did not match "| v3 Plan 2 |"');
for (const n of [52, 51, 50]) L.splice(idx(n), 1);
while (L.length && L[L.length - 1] === '') L.pop();
L.push('', '## ปิดแล้ว (Report v3 Plan 2a/2b 24 ก.ย. 69)', '', '| # | รายการ | ปิดโดย |', '|---|---|---|',
  '| 50 | escape `<` ใน JSON ของ `<script type="application/json">` + allowlist สี/`gridFmt`/`dataFmt` ใน schema | Plan 2a: `jsonScript()` ใน `_template/v3/render.js` แปลง `<` → `\\u003c` · `S.validate` ใช้ `SV.colorOK`/`SV.GRID_FMT_OK`/`SV.DATA_FMT_OK` (`tools/safe-values.js`) ชุดเดียวกับ build |',
  '| 51 | `{{lit:…}}` + `meta.litReasons` (spec §4) | Plan 2a: token `{{lit:…}}` + `meta.litReasons` ในสคีมา (1 เหตุผลต่อ 1 ข้อความ · เหตุผลกำพร้า = error) + `W31 prose-lit` |',
  '| 52 | `report.js save` ต้องรัน compute + รวม error ทุกข้อในครั้งเดียว | Plan 2b: `C.semanticErrors()` เก็บจุด throw ของ compute ครบก่อน compute · `checkDoc` คืน E51 พร้อม `details` ทีละ path · `node tools/report.js save` พิมพ์ครบในครั้งเดียว (`test/v3/report-cli.test.js`) |', '');
fs.writeFileSync(f, L.join('\n'));
EOF
rtk proxy git diff --stat docs/open-items.md
```

Expected: `docs/open-items.md | … +… −…` (one file changed). Then run `node test/docs-test.js | tail -1` → passes.

- [ ] **Step 5: `docs/decisions.md` §10 — Plan 2b block**

Append to the end of `docs/decisions.md`:

```markdown

### Report v3 Plan 2b — infrastructure: report-source · scanner → .json · report.js · sidecar · gate rules · hook (24 ก.ย. 69)

> spec §6.1–§6.5/§9/§11 (P4a) · plan `docs/superpowers/plans/2026-09-24-report-v3-plan2b-infra.md` · branch `feat/report-v3-plan2b` · ผลต่อ production ศูนย์ (tripwire อยู่ · dist byte-identical พิสูจน์ Task 2/3/4/9)

- **จุดเดียวที่ตอบ "ไฟล์ไหนคือรายงาน"** — `tools/report-source.js` (`list symbols kindOf exists load metaLite stockMeta renderedHtml`) · scanner 16 จุดของ #49 ย้ายมาใช้ครบ ยกเว้น `update-prices.yml` (P5) · `require('../build.js')` แบบ lazy เพราะ `update-prices`/`dead-ticker-canary` ถูก build require
- **fail closed**: `ship --prepatch` path ใต้ `reports/` ที่ไม่ใช่ `reports/<SYM>.html` = blocker (rename `.html→.json` · ไฟล์หลง) · `update-prices` ระบุ symbol v3 ตรง ๆ = exit ≠0 "v3 cron = Plan 3" (#62) · sweep ข้ามใบ v3 พร้อมบรรทัด info (R11)
- **R1/R2 sidecar** — `ttm/fy/sharesOut/dps/epsForward/rating` มาจาก `fetch-fundamentals --json` (spec เขียนว่า fetch-facts แต่ fetch-facts ไม่มีงบ) · ผู้เขียน sidecar มีตัวเดียว = `npm run queue -- prep` โหมด NEW (prep-stock คงสัญญาข้อความเดิม)
- **R3/R4/R5 gate** — sentinel `TODO` = `/^\s*TODO\b/` บนทุก string leaf (ช่องตัวเลขที่ยังเป็นสตริงได้ทั้ง type error + sentinel ที่ path เดียวกัน) · `{{rd:` ที่ใดก็ได้ = error · error ต่อชั้นยังเป็น E51 **รายการเดียว** (จำนวนรายการคงเดิม) + `details` ทีละ path
- **R6 `stage:'save'`** ตัด `v2:E40` ตัวเดียว คืนใน `dropped` ให้ save พิมพ์ · stage อื่น = throw
- **R7 `report.js` ตัวเลือกเทส** (`--reports-dir --work-dir --prep-dir --seeds --today`) — เทสไม่แตะ `reports/` จริงเลย · `--today` ไม่ใช่ทางหนี staleness (verify ใช้นาฬิกาจริง)
- **R8/R9** — `npm test` ไม่มี arg ยังกวาด v2 อย่างเดียว (verify รัน check-v3 ต่อ) · มี arg = ส่งใบ v3 ไป `check-v3.runCli` · postcheck คง gate call เดียว
- **R10 hook** — "ใต้ reports/" = segment `reports` ที่โฟลเดอร์แม่มี `build.js` · `$VAR` ที่ไม่ขยาย + `reports/` = ปฏิเสธ · ช่องโหว่ที่ยอมรับ: xargs · find -exec · child process (ตั้งใจ) — `_sig`/E50 คือตัวบังคับจริง
- **R12 `metaLite`** คืน `{symbol, v3, currency, px, analysisDate, era, aiModel}` (ไม่ compute) · MOS ของ commit message มาจาก `stockMeta()` ที่ compute
- **R13 hook paste = cutover ของ Plan 2c ไม่ใช่ตอนจบ 2b** — hook ปฏิเสธ Write ทุกไฟล์ใต้ `reports/` ⇒ STEP 5A ของ v2 NEW (Write `reports/<SYM>.html`) จะถูกบล็อกทันที · 2b พิสูจน์ด้วย `claude -p --settings <ไฟล์ชั่วคราว>` (`docs/hook-setup.md`)
- **R14 `--light` allowlist ตาม spec §6.1 ตรงตัว** — ไม่รวม `meta.litReasons` (prose ที่ต้องเพิ่ม `{{lit:…}}` ใหม่ = save เต็ม)
```

- [ ] **Step 6: Commit**

```bash
git add docs/open-items.md docs/decisions.md
git commit -m "docs(v3): Plan 2b exit — open-items #49–#52, decisions §10 Plan 2b

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

- [ ] **Step 7 (controller, manual — not the implementer): hook proof in a fresh `claude -p`**

Run the "พิสูจน์ใน `claude -p` process ใหม่" block of `docs/hook-setup.md` exactly. Expected: `grep -c` ≥ 3, `HOOK-OK`, empty `git status --short reports/`. Record the three numbers in the PR body. If `ZZHOOK2.json` appeared (rtk hook won over the deny), stop — the PR does not merge until the owner decides.

---

## Self-review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| §6.5 one helper owns "which files are reports" · 16 scanners of #49 | 1 (helper) · 2/3/4 (scanners, 3 runtime batches, DIST-PROOF each) |
| §6.5 `npm test -- <SYM>` hands v3 to `check-v3` | 2 (`runCli` hand-off, R8) |
| §6.5 queue tools: ship (STOCK_FILES, aiModel, MOS, prepatch fail-closed) · postcheck · prep refuses v3 · preflight skips v3 in pre-patch | 3 |
| §6.3/#62 `update-prices --write --force <v3>` exits ≠0 | 4 (`v3Refusal`, R11) |
| §6.3 `apply-edits` refuses `.json` | 4 |
| §9 `{{rd:` + TODO sentinel = E51 · `semanticErrors()` all-at-once · `stage:'save'` drops only `v2:E40` | 5 |
| §6.4 sidecar `.queue/prep/<SYM>.json` (`fetch-facts --json`, `market`, vendor, medians, cross-verify) | 6 (R1, R2) |
| §6.1 `init` (sidecar only · refuses existing report · mechanical prefill · TODO · no market/aiModel) · `export` · `save` pipeline (OWNER → merge market → checkDoc → rule B → print all → IO.write) · `--light` allowlist via `diffPaths` · `show` · `diff` | 7 (R7, R14) |
| §6.2 hook: file tools on all `reports/*` · Bash write patterns · allow git mv/rm/reads · fail-open · owner-paste snippet · fresh `claude -p` proof incl. rtk precedence | 8 (R10, R13) · 9 Step 7 |
| §11 P4a exit: tests green · dist identical · tripwire stays · docs (#49–#52, quality-gate E51, decisions §10) | 5 Step 6 (quality-gate) · 9 |
| `.work/` never committed | 4 (`.gitignore`) |

No spec line of the Plan 2b scope is without a task. Out-of-scope items are listed in the header.

**2. Placeholder scan** — every code step has full code; the only literal "TODO" strings in this plan are the sentinel values `report.js init` writes on purpose (and tests asserting them).

**3. Type consistency** — names used across tasks: `RS.list/symbols/kindOf/exists/load/metaLite/stockMeta/renderedHtml/isV3Path/REPORTS_DIR` (Task 1 → 2/3/4/7) · `S.TODO_RE/RD_TOKEN/stringLeaves` (Task 5 → 7) · `C.semanticErrors(doc, {seeds}) → [{path,msg}]` (Task 5 → 7) · `CV.checkDoc(…) → {errors (details), warnings, view, dropped}` (Task 5 → 7) · sidecar v1 `{v, symbol, currency, region, builtAt, company, exchange, market, vendor, crossVerify, ttm, fy, sharesOut, dps, epsForward, rating, medians}` (Task 6 → 7) · `RC.run/draftFromSidecar/diffPaths/lightViolations` (Task 7) · hook `decide/analyze/lex/inReports/stripHeredocs/denyJson/REASON` (Task 8).

**4. Review Focus → pinning tests**

| Review Focus | Pinned in |
|---|---|
| 1 save next to a v2 `.html` | Task 7 test "save on a v2 symbol → refused, no .json written" |
| 2 init over an existing draft | Task 7 test "init over an existing draft → exit 1, draft byte-identical" |
| 3 hook false positives | Task 8 `ALLOW` list (quoted `>`, heredoc body, `2>&1`, `> /tmp/log`, `grep … | head`, `cp reports/… /tmp/`) |
| 4 prepatch rename / stray file | Task 3 queue-test section 23 (`prepatchBlockers` → `foreign`, `prepatchRefusal`) |
| 5 failed save byte-identical + `--light` path | Task 7 tests "--light outside the allowlist … legs[0].inputs.multiple" + "failed save leaves the report byte-identical" |
