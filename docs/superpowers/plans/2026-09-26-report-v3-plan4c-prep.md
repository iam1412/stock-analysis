# Report v3 — Plan 4c-prep: close the structural HUMAN classes of the v2→v3 migrator + batch tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the HUMAN bucket of the committed sweep (CLEAN 11 · VALUE-DRIFT 426 · HUMAN 472) by closing the classes that are **structural** — the v3 page states a *different fact* (needs a field/enum), or the *same fact in other words* (needs a closed, guarded synonym), or the author's text simply has no home (needs a carry field) — and ship the tooling Plan 4c needs to run the batches: a table-driven batch runner that refuses any doc whose bucket moved since approval, #67 (an aiModel-only edit must not pass `ship --prepatch` as market-only), #68 (BDMS / TRMB median rules), and a custom-card cap of 8 for migrated docs. **No file under `reports/` is written, deleted or committed on this branch; `dist/` at the final head is byte-identical to the merge-base.** Plan 4c consumes the regenerated sweep and the runner.

**Architecture:** Three kinds of change, pinned in spec §3.7: **Kind 1** (fact) = schema enums `ffoBasis:'coreFfo'` · `driver:'ebitdaPerShare'` · `exitMetric:'evebitda'` and the computation input `legs[i].inputs.base` (pe only) that `compute.js` resolves into the existing `L.legValue` call through an `override.eps` overlay (`legs.js` untouched); **Kind 3** (carry) = optional prose fields `meta.sectorLine` · `verdict.extraCells` · `text.legendNote` · leg-level `baseLabel`, plus assemble rules that put the author's words into existing fields (`legs[i].note`, `cases[i].retNote`, `headerTags`, tokenised custom values); **Kind 2** (wording) = a closed `SYNONYM_VOCAB` in `tools/migrate-v3/synonyms.js`, applied inside the gate's normaliser **only on the aligned element** and **only when a structural guard on the v3 doc holds**, plus count-limited s6 template words. Every new field is optional: absent ⇒ `toV2Source` output byte-identical (DIST-PROOF OGE/ICC). Batch tooling lives in `tools/migrate-v3/batch.js` (pure planner + injectable executor) behind `tools/migrate-v3.js batch`.

**Tech Stack:** Node ≥20.19, no dependencies. Tests: `test/v3/*.test.js` (`_t.js` harness, auto-collected by `test/v3-test.js`), `test/queue-test.js` (`ok()`), `test/build-test.js`, `test/docs-test.js`, `node tools/gen-docs.js --check`. Headless capture: Google Chrome at `/Applications/Google Chrome.app` (`--headless=new --screenshot`), no npm dependency.

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` §3.7 (this plan's design: ก Kind 1 · ข Kind 3 · ค Kind 2 · ง cap 8 · จ residual · ฉ #67/#68/batch · measured targets), §3.3 (scenarios · retNote), §8 (`updated` · `meta.migratedFrom`), §10 (migration · §10.2 equivalence gate · approved transforms), §11 rows "Plan 4c-prep" / "Plan 4c" / "Plan 4c-residual" / "P7", §13-1 (commit shape). Measurements: `/Users/somchai.s/Downloads/stock/.superpowers/sdd/archive/plan4b/measure-4c-prep.md` (git-excluded; class matrix §1, per-zone lost words §2, candidate closures §3, `.ret` per-year check §5, follow-up checks §6.1–6.3; harness `stage1.js`/`stage2.js`/`stage3.js` inline — reused in Task 6).

## Global Constraints

- Worktree `/Users/somchai.s/Downloads/stock-v3-plan4c-prep`, branch `feat/report-v3-plan4c-prep` from `main` `992a65b35`. One PR. Task 6's rehearsal and screenshots use a throwaway scratch worktree `/Users/somchai.s/Downloads/stock-v3-plan4c-prep-scratch` (branch `scratch-plan4c-prep`), removed at the end of Task 6.
- **No production change:** nothing under `reports/` is written, deleted or committed on this branch (tests use `test/fixtures/` + `fs.mkdtempSync` dirs; the scratch rehearsal is the only real write and never reaches the branch). `reports.json`, `tags.json`, `tools/seeds.json`, `price-flags.json` unchanged (`git diff --stat 992a65b35..HEAD -- reports reports.json tags.json tools/seeds.json price-flags.json` empty at every task end).
- **DIST byte-identical when the new fields are absent:** `dist/OGE.html` sha256 `363b271b58df3517eea8d547fd30ef74db3da5f3513f22672f39aac3fb03cba7` and `dist/ICC.html` sha256 `7103cb248e0c9e798cd3d02be77613e22fd44d1da2fdc253abc330ed4d16dbc1` after `npm run build` at every task end; Task 6 runs the full `git archive` base-vs-head `diff -rq dist`.
- **`L.legValue(leg, fundamentals, path)` in `tools/v3/legs.js` is not edited** (signature, body, exports). `inputs.base` is resolved *before* the call (`C.withBase`). The migrate-parse invariant (`test/v3/migrate-parse.test.js` "I-5 invariant" — every ok leg recomputes through `L.legValue(inputs, override)`) is untouched: `LG.extract` never emits `inputs.base`.
- **`MIGRATE_V3_ALLOW_REAL=1` only inside the scratch worktree** (never exported in the branch worktree, never in a test). Tests assert refusal without it.
- **Tests never touch** the real `reports/`, `.work/`, `.queue/`: `QUEUE_DIR` env for queue state, `--reports-dir` for CLIs, `fs.mkdtempSync` for output. Any temp git repo scrubs `GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_PREFIX GIT_OBJECT_DIRECTORY` (copy `cleanEnv` from `test/v3/scanners-cron.test.js`) and uses `-c core.hooksPath=/dev/null`.
- **Docs gate:** after every docs edit `node tools/gen-docs.js --check && node test/docs-test.js`; never write a step count ("N ขั้น") outside a `<!-- gen: -->` marker. `CLAUDE.md` §9 bullet "ใบ v3" stays a byte-identical copy of `.claude/skills/stock-controller/SKILL.md` §9 bullet "ใบ v3" (this plan does not change either — Task 6 proves it with a diff).
- **Exact output:** `rtk proxy <cmd>` when counting or comparing output; the Bash tool shell is **zsh** — `${PIPESTATUS[0]}` is bash-only and prints empty; capture the exit of an unpiped command (`cmd > log 2>&1; echo $?`) or use `pipestatus[1]` (zsh) — never trust the exit of `| tail`/`| grep`.
- **Measured targets are expectations, not assertions:** CLEAN ≥ 11 (not lower) · HUMAN 472 → ≈ 220–250 · DIST identical. No test asserts a corpus count; Task 6 records the real numbers and explains any miss.
- Never loosen an existing assertion. Replacing a pinned behaviour (DPZ "custom cards > 4" HUMAN, the sweep's "HUMAN 4", the md "custom-card cap 4" line, `fy periods conflict` H) means replacing its test with the new behaviour's test **in the same commit**, with a comment naming the ruling.
- **Commits:** one commit per task (Task 6 = two: sweep artefacts, then docs + proofs). Every commit message ends with
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01H4xn4fyH6QW4hXSmoibJFB
  ```
- `npm run verify` exit 0 at every task end (`rtk proxy npm run verify > /tmp/p4cp-tN-verify.log 2>&1; echo $?`).
- Implementers never push, never call `advisor`, never spawn subagents; all reviewers/implementers dispatched by the controller are **Opus**.

## Design pins (spec §3.7 · advisor 26 ก.ย. 69 — executors do not reopen these)

- **D1 — the deciding question** (spec §3.7 head): *does the v3 page state a different fact, or the same fact in other words?* Different fact ⇒ a field/enum (Kind 1) — never mask. Same fact, other words ⇒ a closed, guarded synonym (Kind 2). Author reasoning with no home ⇒ carry it into a note/field (Kind 3). A word that is none of these stays TEXT LOST ⇒ HUMAN (spec §10.2 "ข้อความหาย = HUMAN เสมอ").
- **D2 — Kind 1 (spec §3.7 ก):** `ENUM.ffoBasis` += `'coreFfo'` (label "Core FFO" via one shared map `S.FFO_LABEL` used by render/cards/check-v3). `ENUM.driver` += `'ebitdaPerShare'` (label "EBITDA/หุ้น", base = `fundamentals.ebitda / shares` in quote currency). `ENUM.exitMetric` += `'evebitda'` (label "EV/EBITDA"; `exitTarget` = the `evsales` formula: `end × m − netDebt/shares`, target ≤ 0 = the existing named throw). Pairing: `exitMetric 'evebitda'` ⇒ `driver 'ebitdaPerShare'` and the converse (a guard, no new design). `legs[i].inputs.base: 'eps' | 'epsForward' | 'epsFy'` (optional · default `'eps'` · `pe` only) is a **computation input**: compute reads `fundamentals.epsForward` (or `override.epsForward` when the author's number differs) / `fundamentals.fy.eps`, and a forward leg stays live under cron/UPDATE. `legs[i].baseLabel` (≤ 24 · plain · period wording such as "FY2026E consensus") and the migrated-only bound `legs[i].label` ≤ 80 live at **leg level**, outside `inputs`. Render prints the base label from `base` + `baseLabel`.
- **D3 — Kind 3 carry (spec §3.7 ข):** `meta.sectorLine` (prose ≤ 100 — the gdots text v2 **rendered**; a small line under the header tags) · `verdict.extraCells: [{k, v}]` (≤ 2 · the 3rd+ vcells of §8) · `text.legendNote` (≤ 80 · a 4th legend span in §2) · `cases[i].retNote` also takes the author's words **before** the % anchor · `scenarios.perYear` inferred (`'cagr'` by default, `'linear'` only when the printed per-year figures match linear and not cagr) from `/ปี|ต่อปี` in every `.ret`, the per-year figure itself not copied · a numeric `.ret` note carried only when `classifyNumber(printed, v3 total) === 'rounding'`. Assemble also: `qualifierOf` round 3 (author words left in the formula head → `legs[i].note`) · the author's context-suffix reasoning → `legs[i].note` (marker words are synonyms, D4) · first-tag parse ("(ADR)" · "TSX: CCO" · "/ GOOG" · "• TSXV: PTK" · "→ MZTI") → `headerTags` · price-bound custom card values tokenised by D3-exact match (4b pin D3) · `fundamentals.fy` period conflict → latest period + F (never H).
- **D4 — Kind 2 (spec §3.7 ค):** `SYNONYM_VOCAB` is closed and reviewed word by word like `TEMPLATE_VOCAB`/`FORMULA_VOCAB`; every entry names its role (the aligned element), its guard (a predicate on the v3 doc/view for that element) and why. Entries: `Exit|ทางออก ≡ ออก` (exit row) · `sh|Sh|share ≡ หุ้น` (per-share driver) · `Rev|Revenue|Sales ≡ รายได้` and `รายได้ปี ≡ รายได้ ปี` (driver `revenuePerShare`) · `FFO ≡ FFO` (only when `ffoBasis` label is "FFO") · `total|Total|รวม ≡ (the v3 total figure)` (`.ret`) · `มัธยฐานย้อนหลัง ≡ มัธยฐาน` (s3 mdesc, `multipleSource` median) · `บริบท|ไม่รวมในกรอบ|ไม่รวมใน FV|ไม่นับใน (FV) ≡ (บริบท — ไม่นับใน FV)` (s3, v3 leg `role:'context'`) · `ไม่จ่าย ≡ divCum 0` (the column has no dividend) · `ทรงตัว|คงที่|flat ≡ growth 0` (`growth === 0`) · `ต่อปี ≡ ปี` (`.ret`, `perYear` non-null — the D3 perYear inference's own unit word). **Never a fact word:** `AFFO Core forward Forward FY#E Tangible adj GAAP` (a test enforces). s6 `TEMPLATE_COUNTED` (not a synonym): `รวม · รวมปันผล · ปันผลสะสม`, each dropped at most 3 times (one per column) and only when no v3 column prints that word. Leg alignment in the gate uses the **same** label function on both sides (`A.labelParts(mname).label` ↔ `legs[i].label`). The 4b Task 6 ruling "gdots = template decoration" is corrected: gdots glyphs/colours are decoration; gdots **text** is author text carried by `meta.sectorLine`.
- **D5 — cap and residual (spec §3.7 ง/จ):** `metrics.custom` ≤ **8 when `meta.migratedFrom` is present**, else ≤ 4 (`S.customCap(doc)`); reversal = lower the constant (docs over it return to HUMAN). **Not done (residual → re-analysis wave):** growth cells that are prose ("ฟื้นตัวช้า" · "WTI $50/bbl") and text driver cells — never parse prose into numbers · E52 (sotp/nav without a table) · analyst target as a fv leg · fv legs < 2 · era mismatch · sources < 3 · scenario columns ≠ 3.
- **D6 — tooling (spec §3.7 ฉ):** **#67** — `IO.freshHash` is **not** changed (`updated` must not move on a model-label edit, OGE/ICC manifest hashes stay); `ship --prepatch` compares a second hash `IO.prepatchHash(doc)` = canonical JSON without `market`/`_sig` **including** `meta.aiModel`. **#68** — targeted rules only: a multiple token inside an arrow series (`44.4→…→21.4x`) is history, not the leg multiple (BDMS → `author`); a median window "FY2021–23 และ FY2025" keeps the extra year (TRMB → `FY2021–FY2023, FY2025`); the general rule "negated median ⇒ author" stays rejected (OR SAK STE SSNC BRK-B). **Batch runner** `tools/migrate-v3.js batch <table.csv> --class <CLEAN|driftClass…> --n <push every N commits> --model sonnet|opus [--no-push] [--dry-run]`: reads the approved table (the sweep csv format), re-runs the migrator per doc, **refuses a doc whose fresh bucket/driftClass differs from its row** (no write), converts, builds, `ship --migrate` (CLEAN ≤ 50 docs/commit · VALUE-DRIFT 1 doc/commit · §13-1), verifies once and pushes every N commits. **Not done:** rounding `pe`/`dividendYield` or renaming `name`/`title` in `reports.json` (advisor 26 ก.ย. 69).

## Review Focus

1. **A v3 doc edited only in `meta.aiModel`** — `ship --prepatch` must block it (prepatch hash differs) while `IO.freshHash` and therefore `updated` stay the same. Test: Task 1 (`test/v3/io.test.js` "prepatchHash" + `test/queue-test.js` "4c-prep #67").
2. **A table row whose doc re-migrates into a different bucket/driftClass** (cron moved the price, the migrator changed) — the runner must refuse that doc before any write (its `.html` stays, no `.json`), continue with the others and exit 3. Test: Task 1 (`test/v3/migrate-batch.test.js` "refuses a moved row").
3. **A `pe` leg with `inputs.base:'epsForward'`** — the value is `fundamentals.epsForward × multiple` (or `override.epsForward × multiple`), `legs.js` untouched, `override.eps` together with a non-`eps` base is a schema error, and every doc without the field renders byte-identically. Test: Task 2 (`test/v3/compute.test.js` + `test/v3/schema.test.js` "inputs.base" + DIST-PROOF step).
4. **A synonym whose structural guard fails** — `ไม่จ่าย` on a column with `divCum > 0`, `บริบท` on a `role:'fv'` leg, `Rev` under `driver:'eps'`, `ทรงตัว` with `growth ≠ 0` — must stay a TEXT LOST word; and no fact word can ever enter the vocabulary. Test: Task 4 (`test/v3/migrate-equiv.test.js` "synonym guards" + "no fact words").
5. **A numeric `.ret` note** — carried only when it equals the v3 total within printed rounding, otherwise the H note stays; a per-year note sets `perYear` and never survives as a label on the v3 total; the 4b `.ret` self-test (mutating an author word in a `.ret` cell ⇒ TEXT LOST) still fails when a word is removed. Test: Task 5 (`test/v3/migrate-assemble.test.js` ".ret round 2") + Task 4 (existing self-test kept green).

---

### Task 1: Batch runner · #67 prepatch hash · #68 targeted median rules · custom cap 8 for migrated docs

**Files:**
- Create: `tools/migrate-v3/batch.js` (table reader · planner · executor)
- Modify: `tools/migrate-v3.js` (`parseArgs` :36–55 — `--class` multi-value, `--n`, `--model`, `--dry-run`, `--no-push`; `main` :241–253 — `batch` subcommand; `rowOf` :128 cap regex; exports :258), `tools/migrate-v3/report.js` (:136–138 cap line), `tools/v3/io.js` (`freshHash` :26–30 stays; add `prepatchHash`; exports :73), `tools/queue/ship.js` (`shipPrepatch` :411–415 hash pair; `shipMigrate` :471–492 `skipVerify`; exports :551), `tools/v3/schema.js` (`metrics.custom` cap :411–414; export `customCap`), `tools/migrate-v3/assemble.js` (`setMetrics` :591–603 cap; `multipleSourceOf` :140–188 series rule; `medianWindowOf` :190–200 list rule)
- Test: `test/v3/migrate-batch.test.js` (new), `test/v3/migrate-cli.test.js`, `test/v3/io.test.js`, `test/queue-test.js`, `test/v3/schema.test.js`, `test/v3/migrate-assemble.test.js`, `test/v3/migrate-equiv.test.js`

**Interfaces:**
- Consumes: `M.migrateOne(sym, o)`, `M.rowOf(m, o)`, `M.runConvert(sym, opts, log, deps)`, `RP.driftClass(row)`, `RP.COLS`, `IO.freshHash(doc)`, `IO.canonical`, `Sh.prepatchBlockers(entries)`, `Sh.shipMigrate(symsArg, opts)`.
- Produces:
  - `BT.readTable(text) → [{ symbol, market, bucket, driftClass }]` (throws `batch: …` on a header that is not `RP.COLS`).
  - `BT.selectRows(rows, classes) → { picked: row[], skipped: [{ symbol, why }] }` — `CLEAN` selects bucket CLEAN; a driftClass selects VALUE-DRIFT rows of that class; HUMAN rows are always skipped (`why: 'HUMAN — not batchable'`).
  - `BT.commitGroups(picked) → row[][]` — CLEAN rows in chunks of 50, every VALUE-DRIFT row alone (§13-1).
  - `BT.freshMismatch(row, fresh) → string | null` (`fresh = { bucket, driftClass }`).
  - `BT.runBatch(rows, opts, deps) → { commits: string[][], refused: string[], pushes: number, code: 0|3 }` — `opts = { classes, n, model, noPush, dryRun }`; `deps = { fresh(sym) → {bucket, driftClass}, convert(sym, acceptDrift) → exitCode, build(), ship(syms), verify(), push(), log(line) }`.
  - `M.runBatchCli(tablePath, opts, log) → exitCode`.
  - `IO.prepatchHash(doc) → 12-hex` (canonical without `market`/`_sig`, **with** `meta.aiModel`).
  - `Sh.v3HashPair(headText, readWork) → { headHash, workHash }` (uses `IO.prepatchHash`; unreadable ⇒ `null`).
  - `Sh.shipMigrate(symsArg, { model, noPush, skipVerify })` — `skipVerify` without `noPush` throws before anything runs.
  - `S.customCap(doc) → 8 | 4`.

- [ ] **Step 0: Baseline** — record the pinned DIST hashes before any edit (they are the reference for every later task):

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan4c-prep && rtk proxy npm run build >/dev/null && shasum -a 256 dist/OGE.html dist/ICC.html && git status --short
```
Expected: `363b271b…cba7  dist/OGE.html` · `7103cb24…dbc1  dist/ICC.html` · empty status (build rewrites `reports.json` identically). If either hash differs, stop and report (the pin is stale, not a task failure).

- [ ] **Step 1: Write the failing tests**

`test/v3/io.test.js` — append:

```js
// Plan 4c-prep Task 1 (#67 · spec §3.7 ฉ · D6): prepatchHash = freshHash + meta.aiModel — ship --prepatch แยกการแก้ป้ายรุ่นออกจาก pre-patch ราคา
{
  const d = JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
  const m = { ...d, meta: { ...d.meta, aiModel: 'Claude Opus 5' } };
  const px = { ...d, market: { ...d.market, px: d.market.px + 1 } };
  t.eq(IO.freshHash(m), IO.freshHash(d), '#67: freshHash still ignores meta.aiModel (updated must not move)');
  t(IO.prepatchHash(m) !== IO.prepatchHash(d), '#67: prepatchHash sees an aiModel-only edit');
  t.eq(IO.prepatchHash(px), IO.prepatchHash(d), '#67: prepatchHash ignores market (cron pre-patch passes)');
  t.eq(IO.prepatchHash({ ...d, _sig: 'sha256:' + '0'.repeat(64) }), IO.prepatchHash(d), '#67: prepatchHash ignores _sig');
  t(/^[0-9a-f]{12}$/.test(IO.prepatchHash(d)), '#67: 12 hex like freshHash');
}
```

`test/queue-test.js` — inside the existing `v3/ship (4b)` block after the `migratePlan` assertions (≈ :1575), add:

```js
    // Plan 4c-prep Task 1 (#67): คู่ hash ของ ship --prepatch ใช้ IO.prepatchHash — แก้ meta.aiModel อย่างเดียว = blocked
    const zts = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'v3', 'ZTS-real.json'), 'utf8'));
    const hp = Sh.v3HashPair(JSON.stringify(zts), () => ({ ...zts, meta: { ...zts.meta, aiModel: 'Claude Opus 5' } }));
    const hpM = Sh.v3HashPair(JSON.stringify(zts), () => ({ ...zts, market: { ...zts.market, px: zts.market.px * 1.01 } }));
    const hpBad = Sh.v3HashPair('{not json', () => zts);
    const pb67 = Sh.prepatchBlockers([{ path: 'reports/ZTS.json', untracked: false, v3: true, ...hp }, { path: 'reports/OGE.json', untracked: false, v3: true, ...hpM }]);
    ok(hp.headHash !== hp.workHash && pb67.blocked.join(',') === 'ZTS' && hpBad.headHash === null,
      'v3/ship (4c-prep #67): aiModel-only edit = blocked · market-only = passes · HEAD JSON เสีย = null (unreadable)', JSON.stringify({ hp, hpM, pb67 }));
    // skipVerify (batch runner): ใช้ได้เฉพาะคู่ --no-push — ไม่งั้นล้มก่อนรันอะไร
    let sv = ''; try { Sh.shipMigrate('BBL', { model: 'opus', skipVerify: true }); } catch (e) { sv = e.message; }
    ok(/skipVerify ใช้ได้เฉพาะกับ --no-push/.test(sv), 'v3/ship (4c-prep): shipMigrate skipVerify ต้องคู่ noPush (runner verify เองก่อน push)', sv);
```

`test/v3/schema.test.js` — append:

```js
// Plan 4c-prep Task 1 (spec §3.7 ง · D5): เพดาน custom 8 เฉพาะใบ migrate (meta.migratedFrom) · ใบ NEW คง 4
{
  const mk = (n, migrated) => { const d = base(); d.metrics.custom = Array.from({ length: n }, (_, i) => ({ label: `การ์ด ${i + 1}`, value: `ค่า ${i + 1}` }));
    if (migrated) d.meta.migratedFrom = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' }; return d; };
  t(paths(S.validate(mk(5, false))).includes('metrics.custom'), 'cap: NEW doc with 5 custom → error (cap 4)');
  t(!paths(S.validate(mk(5, true))).includes('metrics.custom') && !paths(S.validate(mk(8, true))).includes('metrics.custom'), 'cap: migrated doc with 5 / 8 custom → valid');
  t(paths(S.validate(mk(9, true))).includes('metrics.custom'), 'cap: migrated doc with 9 custom → error (cap 8)');
  t.eq([S.customCap(mk(0, true)), S.customCap(mk(0, false))], [8, 4], 'S.customCap: 8 migrated · 4 new');
  t(/≤8/.test((S.validate(mk(9, true)).find((e) => e.path === 'metrics.custom') || {}).msg || ''), 'cap: message names the cap in force');
}
```

`test/v3/migrate-assemble.test.js` — append:

```js
// Plan 4c-prep Task 1 (#68 · D6) — targeted median rules (general "negated median ⇒ author" stays rejected)
{
  const BDMS = 'EPS (TTM) ฿0.96 × P/E เป้าหมาย 21.4x — 21.4x คือ P/E ที่วัดจริงของ FY2025 (ราคาเฉลี่ยปี ฿21.31 ÷ EPS ฿1.00) ไม่ได้มาจาก P/E ปัจจุบัน; ไม่ใช้มัธยฐาน 5 ปี 31.0x เพราะ P/E ลดลงทุกปี (44.4→33.8→31.0→27.3→21.4x) ตามการโตช้าลง มัธยฐานถูกลากด้วยปี FY2021–23';
  const F = [], o = {};
  t.eq(A.multipleSourceOf(BDMS, F, 0, 21.4, o), 'author', '#68 BDMS: a multiple inside an arrow series is history → author (not median5y)');
  t(o.medianWindow == null && F.some((x) => /leg 1: multipleSource author/.test(x)), '#68 BDMS: no medianWindow · F names the leg', JSON.stringify({ o, F }));
  const OWN = 'EPS $5.00 × P/E 22.0x — 22.0x = มัธยฐาน 5 ปีของบริษัทเอง (18.1→22.0→25.3x)';
  t.eq(A.multipleSourceOf(OWN, [], 0, 22.0, {}), 'median5y', '#68: series rule does not demote a median named next to the leg multiple outside the series');
  const TRMB = 'EPS $1.93 × P/E 41.7x — P/E 41.7x = มัธยฐานย้อนหลังของ TRMB เอง (4 ปีงบ FY2021–23 และ FY2025 ช่วง 35.4–42.6x ตัด FY2024 ที่มีกำไรพิเศษ)';
  const o2 = {};
  t.eq(A.multipleSourceOf(TRMB, [], 0, 41.7, o2), 'median5y', '#68 TRMB: still a median');
  t.eq(o2.medianWindow, 'FY2021–FY2023, FY2025', '#68 TRMB: median window keeps the extra year');
  t.eq(A.medianWindowOf('มัธยฐาน FY2022–FY2025'), 'FY2022–FY2025', '#68: plain window unchanged');
}
// Plan 4c-prep Task 1 (D5): custom cap follows meta.migratedFrom — DPZ (5 custom) keeps all 5 when migrated · still H without a manifest row
{
  const html = raw('DPZ'), p = PV.parseV2('DPZ', html);
  const mig = A.assemble(p, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: p.rd.values.priceDate, analysisPx: null });
  const nw = A.assemble(p, { seeds: SEEDS, headUpdated: null, v2Hash: B.freshHash(html), today: p.rd.values.priceDate, analysisPx: null });
  t(mig.doc.metrics.custom.length === 5 && !mig.notes.H.some((h) => /^custom cards/.test(h)), 'cap: migrated DPZ keeps 5 custom cards, no cap H', JSON.stringify(mig.notes.H));
  t(nw.notes.H.some((h) => /^custom cards 5 > 4 — dropped "Store Count \(Global\)"/.test(h)), 'cap: no migratedFrom → cap 4 still applies', JSON.stringify(nw.notes.H));
}
```

`test/v3/migrate-equiv.test.js` — **replace** the DPZ block (:43–53, "positive HUMAN case: the custom > 4 cap") with the new behaviour (ruling D5 · spec §3.7 ง):

```js
// DPZ — Plan 4c-prep D5 (cap 8 for migrated docs): the 5th custom card is kept ⇒ its words are on the v3 page ⇒ not TEXT LOST, no cap H
{
  const html = raw('DPZ'), m = migrate('DPZ', html);
  const b = BK.bucketOf(m.notes, m.eq);
  const card = PV.parseV2('DPZ', html).s1cards.find((c) => c.k === 'Store Count (Global)');
  const words = EQ.tok(EQ.text(`${card.kHtml} ${card.vHtml} ${card.dHtml}`)).filter(EQ.isWord).map(EQ.wordOf);
  t(!m.notes.H.some((r) => /^custom cards/.test(r)) && b.bucket !== 'HUMAN', 'DPZ: no cap H with cap 8 (migrated) — not HUMAN', JSON.stringify({ H: m.notes.H, b }));
  t(words.length > 0 && words.every((w) => !m.eq.textLost.includes(w)), 'DPZ: the 5th card words are not lost', JSON.stringify(m.eq.textLost));
}
// cap positive case moved to a synthetic 9-custom DPZ: 4 extra custom cards injected at the head of the §1 grid ⇒ 9 > 8 ⇒ H,
// and the TEXT LOST words are exactly the dropped card's words (same shape as the 4b DPZ test — nothing else lost, nothing masked)
{
  const extra = [1, 2, 3, 4].map((i) => `<div class="metric"><div class="k">ตัวชี้วัดพิเศษ${i}</div><div class="v">ค่าพิเศษ${i}</div><div class="d">หมายเหตุพิเศษ${i}</div></div>`).join('\n      ');
  const html = raw('DPZ').replace(/(<div class="grid g4">\s*)/, (m0, a) => `${a}${extra}\n      `);
  const m = migrate('DPZ', html);
  const cap = m.notes.H.find((r) => /^custom cards 9 > 8 — dropped /.test(r));
  t(!!cap, 'DPZ+4: custom cards 9 > 8 → H', JSON.stringify(m.notes.H));
  const labels = cap ? [...cap.matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  const want = PV.parseV2('DPZ', html).s1cards.filter((c) => labels.includes(c.k)).flatMap((c) => EQ.tok(EQ.text(`${c.kHtml} ${c.vHtml} ${c.dHtml}`)).filter(EQ.isWord).map(EQ.wordOf));
  t(labels.length === 1 && want.length > 0, 'DPZ+4: exactly one card dropped', JSON.stringify(labels));
  t.eq(m.eq.textLost.slice().sort(), want.slice().sort(), 'DPZ+4: TEXT LOST words = exactly the dropped card');
}
```

`test/v3/migrate-batch.test.js` — new file:

```js
'use strict';
// Plan 4c-prep Task 1 — batch runner (spec §3.7 ฉ · D6): pure planner + executor with injected deps (never touches git/reports)
const t = require('./_t.js')('migrate-batch');
const BT = require('../../tools/migrate-v3/batch.js');
const RP = require('../../tools/migrate-v3/report.js');
const row = (s, b, c) => [s, 'US', b, '"x"', 2, 2, 0, 0, 0, 0, 0, 0, c || '', '0'].join(',');
const csv = [RP.COLS.join(','), row('AAA', 'CLEAN'), row('BBB', 'VALUE-DRIFT', 'fv-rounding'), row('CCC', 'VALUE-DRIFT', 'mixed'), row('DDD', 'HUMAN'), row('EEE', 'CLEAN')].join('\n') + '\n';
const rows = BT.readTable(csv);
t.eq(rows.map((r) => [r.symbol, r.bucket, r.driftClass]), [['AAA', 'CLEAN', ''], ['BBB', 'VALUE-DRIFT', 'fv-rounding'], ['CCC', 'VALUE-DRIFT', 'mixed'], ['DDD', 'HUMAN', ''], ['EEE', 'CLEAN', '']], 'readTable: sweep csv columns (reasons quoted)');
t.throws(() => BT.readTable('symbol,bucket\nAAA,CLEAN\n'), /batch: .*หัวตาราง/, 'readTable: a header that is not the sweep csv → named throw');
{
  const s = BT.selectRows(rows, ['CLEAN', 'fv-rounding']);
  t.eq(s.picked.map((r) => r.symbol), ['AAA', 'BBB', 'EEE'], 'selectRows: CLEAN + the named driftClass only');
  t(s.skipped.some((x) => x.symbol === 'DDD' && /HUMAN/.test(x.why)) && s.skipped.some((x) => x.symbol === 'CCC'), 'selectRows: HUMAN never batchable · other classes skipped with a reason', JSON.stringify(s.skipped));
}
{
  const many = Array.from({ length: 103 }, (_, i) => ({ symbol: `C${i}`, bucket: 'CLEAN', driftClass: '' })).concat([{ symbol: 'D1', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { symbol: 'D2', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }]);
  t.eq(BT.commitGroups(many).map((g) => g.length), [50, 50, 3, 1, 1], 'commitGroups: CLEAN ≤50/commit · VALUE-DRIFT 1/commit (§13-1)');
}
t.eq(BT.freshMismatch({ symbol: 'BBB', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }), null, 'freshMismatch: same → null');
t(/BBB: .*VALUE-DRIFT\/mixed ≠ ตาราง VALUE-DRIFT\/fv-rounding/.test(BT.freshMismatch({ symbol: 'BBB', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { bucket: 'VALUE-DRIFT', driftClass: 'mixed' })), 'freshMismatch: class moved → refusal text');
// executor — Review Focus 2: a moved row is refused before convert; others continue; push every N commits; verify once per push
{
  const calls = [];
  const fresh = { AAA: { bucket: 'CLEAN', driftClass: '' }, BBB: { bucket: 'HUMAN', driftClass: '' }, EEE: { bucket: 'CLEAN', driftClass: '' }, D1: { bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, D2: { bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' } };
  const deps = { fresh: (s) => fresh[s], convert: (s, acc) => { calls.push(`convert ${s}${acc ? ' --accept-drift' : ''}`); return 0; }, build: () => calls.push('build'),
    ship: (syms) => calls.push(`ship ${syms.join(' ')}`), verify: () => calls.push('verify'), push: () => calls.push('push'), log: () => {} };
  const tbl = [{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }, { symbol: 'BBB', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { symbol: 'EEE', bucket: 'CLEAN', driftClass: '' },
    { symbol: 'D1', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }, { symbol: 'D2', bucket: 'VALUE-DRIFT', driftClass: 'fv-rounding' }];
  const r = BT.runBatch(tbl, { classes: ['CLEAN', 'fv-rounding'], n: 2, model: 'opus', noPush: false, dryRun: false }, deps);
  t(!calls.includes('convert BBB') && !calls.includes('convert BBB --accept-drift') && r.refused.length === 1 && /^BBB: /.test(r.refused[0]), 'runBatch: moved row BBB refused before convert', JSON.stringify({ calls, r }));
  t.eq(calls, ['convert AAA', 'convert EEE', 'build', 'ship AAA EEE', 'convert D1 --accept-drift', 'build', 'ship D1', 'verify', 'push', 'convert D2 --accept-drift', 'build', 'ship D2', 'verify', 'push'],
    'runBatch: convert → build → ship per commit · verify+push every 2 commits · remainder pushed at the end');
  t(r.code === 3 && r.pushes === 2 && r.commits.length === 3, 'runBatch: exit 3 when any row was refused · 3 commits · 2 pushes', JSON.stringify(r));
}
{
  const calls = [];
  const deps = { fresh: () => ({ bucket: 'CLEAN', driftClass: '' }), convert: (s) => { calls.push(`convert ${s}`); return 0; }, build: () => calls.push('build'), ship: (x) => calls.push(`ship ${x.join(' ')}`), verify: () => calls.push('verify'), push: () => calls.push('push'), log: () => {} };
  const r = BT.runBatch([{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }], { classes: ['CLEAN'], n: 5, model: 'opus', noPush: true, dryRun: false }, deps);
  t.eq(calls, ['convert AAA', 'build', 'ship AAA', 'verify'], 'runBatch --no-push: verify once at the would-be push point, never push');
  t(r.code === 0 && r.pushes === 0, 'runBatch --no-push: exit 0');
  const d = []; const rd = BT.runBatch([{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }], { classes: ['CLEAN'], n: 5, model: 'opus', noPush: true, dryRun: true }, { ...deps, convert: () => { d.push('convert'); return 0; } });
  t(d.length === 0 && rd.commits.length === 1, 'runBatch --dry-run: plans the commit, converts nothing', JSON.stringify(rd));
}
{
  let msg = ''; const deps = { fresh: () => ({ bucket: 'CLEAN', driftClass: '' }), convert: () => 1, build: () => {}, ship: () => { msg = 'shipped'; }, verify: () => {}, push: () => {}, log: () => {} };
  const r = BT.runBatch([{ symbol: 'AAA', bucket: 'CLEAN', driftClass: '' }], { classes: ['CLEAN'], n: 1, model: 'opus', noPush: true }, deps);
  t(r.code === 3 && msg === '' && /AAA: convert exit 1/.test(r.refused[0]), 'runBatch: a failed convert is a refusal · nothing shipped for an empty group', JSON.stringify(r));
}
t.done();
```

`test/v3/migrate-cli.test.js` — (a) replace the sweep expectations pinned by the 4b cap (ruling D5, same commit): `HUMAN 4 (AAPL BBL DDOG DPZ)` → `HUMAN 3 (AAPL BBL DDOG)`, the `/DPZ,US,HUMAN/` clause → `!/DPZ,US,HUMAN/`, the md regex `custom-card cap 4\*\* — \d+ ใบ HUMAN .* 1 ใบ HUMAN ด้วยเหตุนี้อย่างเดียว` → `custom-card cap 8 \(ใบ migrate\)\*\* — 0 ใบ HUMAN`, and `\| DPZ \| US \|` in the HUMAN table → absent; (b) append the batch CLI block:

```js
// Plan 4c-prep Task 1 — batch CLI: dry-run on tmp fixtures · refusals (real reports without env · non-dry on a tmp dir)
{
  const out = path.join(tmp, 'sweep-b');
  cli(['sweep', ...common, '--out', out]);
  const lines = fs.readFileSync(out + '.csv', 'utf8').trim().split('\n');
  const casy = lines.find((l) => l.startsWith('CASY,'));
  const wrong = casy.replace(/^CASY,US,VALUE-DRIFT,/, 'CASY,US,CLEAN,').replace(/,[a-z-]+,([\d.]+)$/, ',,$1');   // ตารางอ้างว่า CLEAN แต่ migrate ใหม่ได้ VALUE-DRIFT
  const TB = path.join(tmp, 'table.csv'); fs.writeFileSync(TB, [lines[0], casy].join('\n') + '\n');   // ตารางตรงกับผล migrate ใหม่
  const ok1 = cli(['batch', TB, '--class', casy.split(',')[12], '--n', '1', '--model', 'opus', '--dry-run', ...common]);
  t(ok1.code === 0 && /plan: 1 commit/.test(ok1.out) && /CASY/.test(ok1.out) && fs.existsSync(path.join(REP, 'CASY.html')), 'batch --dry-run: row matching the fresh bucket → planned, nothing written', ok1.out.slice(-300));
  const TW = path.join(tmp, 'table-wrong.csv'); fs.writeFileSync(TW, [lines[0], wrong].join('\n') + '\n');
  const bad = cli(['batch', TW, '--class', 'CLEAN', '--n', '1', '--model', 'opus', '--dry-run', ...common]);
  t(bad.code === 3 && /✗ CASY: .*VALUE-DRIFT.* ≠ ตาราง CLEAN/.test(bad.out), 'batch: row whose fresh bucket differs → refused (exit 3)', bad.out.slice(-300));
  const real = cli(['batch', TB, '--class', 'CLEAN', '--n', '1', '--model', 'opus', '--head-manifest', MAN]);
  t(real.code === 1 && /MIGRATE_V3_ALLOW_REAL=1/.test(real.out), 'batch on the real reports/ without the env → refused', real.out.slice(-200));
  const tmpw = cli(['batch', TB, '--class', 'CLEAN', '--n', '1', '--model', 'opus', ...common]);
  t(tmpw.code === 1 && /batch เขียนได้เฉพาะ reports\/ ของ checkout นี้/.test(tmpw.out), 'batch (not dry-run) on a tmp --reports-dir → refused (ship --migrate commits this checkout)', tmpw.out.slice(-200));
  t(fs.readdirSync(REAL).length === realBefore, 'batch tests never touched the real reports/');
}
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `cd /Users/somchai.s/Downloads/stock-v3-plan4c-prep && node test/v3-test.js 2>&1 | grep -E "✗|^[✓✗] (io|schema|migrate-(batch|cli|assemble|equiv)):"; node test/queue-test.js 2>&1 | grep -E "4c-prep|ผ่าน$" | tail -4`
Expected: `migrate-batch` fails at require (module missing), `io` (`IO.prepatchHash is not a function`), `schema` (`S.customCap`), `migrate-assemble` (#68 strings return `median5y` / window `FY2021–FY2023`), `migrate-equiv` (DPZ still HUMAN), `migrate-cli` (unknown command `batch`), queue-test (`Sh.v3HashPair is not a function`).

- [ ] **Step 3: Implement `tools/v3/io.js` + `tools/queue/ship.js`**

`io.js` after `freshHash`:

```js
/** #67 (Plan 4c-prep · spec §3.7 ฉ): hash ของ ship --prepatch — เหมือน freshHash แต่ **นับ** meta.aiModel
 *  freshHash (ฐานของ updated) ยังไม่นับ aiModel — แก้ป้ายรุ่นอย่างเดียวต้องไม่ขยับ updated แต่ต้องไม่หลุดเข้า commit "price:" */
function prepatchHash(doc) {
  const { _sig, market, ...rest } = doc;
  return sha('v3pp:' + canonical(rest)).slice(0, 12);
}
```
Export `prepatchHash`.

`ship.js` — above `shipPrepatch`:

```js
/** คู่ hash ของใบ v3 ใน ship --prepatch (#67): HEAD (ข้อความจาก git show) กับ worktree (ตัวอ่านที่ส่งมา) · อ่าน/parse ไม่ได้ = null (fail closed) */
function v3HashPair(headText, readWork) {
  const hashOf = (f) => { try { return IO.prepatchHash(f()); } catch (_) { return null; } };
  return { headHash: headText == null ? null : hashOf(() => JSON.parse(headText)), workHash: hashOf(readWork) };
}
```
and in `shipPrepatch` replace the two `hashOf` lines (:412–414) with
`const { headHash, workHash } = v3HashPair(head && head.code === 0 ? head.out : null, () => IO.read(fp));` (keep `fs.existsSync(fp)` — `IO.read` throws on a missing file ⇒ `null`). Update the docblock bullet "★ ใบ v3 (Plan 4b · #66)" to say "prepatchHash (ไม่นับ market/_sig · **นับ** meta.aiModel — #67)".

`shipMigrate` — first lines after `const o = opts || {};`:

```js
  // Plan 4c-prep (batch runner): skipVerify = runner รัน npm run verify เองครั้งเดียวก่อน push ทุก N commit — ใช้ได้เฉพาะคู่ --no-push
  if (o.skipVerify && !o.noPush) throw new Error('ship --migrate: skipVerify ใช้ได้เฉพาะกับ --no-push (runner verify เองก่อน push)');
```
and replace `verify(); keepDates();` with `if (!o.skipVerify) verify(); keepDates();`. Export `v3HashPair`.

- [ ] **Step 4: Implement the cap (`schema.js` · `assemble.js` · `migrate-v3.js` · `report.js`)**

`schema.js` near `cardEntries`:

```js
// เพดาน custom card (spec §3.7 ง · Plan 4c-prep D5): ใบ migrate (meta.migratedFrom) = 8 — ครอบ 97/102 ใบที่ชนเพดาน 4 · ใบ NEW = 4 เท่าเดิม
// ทางย้อนกลับ: ลดค่านี้ ใบที่เกินกลับเป็น HUMAN ใน sweep
const CUSTOM_CAP_MIGRATED = 8, CUSTOM_CAP = 4;
const customCap = (doc) => (isObj(doc) && isObj(doc.meta) && doc.meta.migratedFrom != null ? CUSTOM_CAP_MIGRATED : CUSTOM_CAP);
```
In the metrics block (:411–412): `const cap = customCap(doc); if (!Array.isArray(mt.custom) || mt.custom.length > cap) E('metrics.custom', \`ต้องเป็น array ≤${cap}${cap === CUSTOM_CAP ? '' : ' (ใบ migrate)'}\`);` Export `customCap`, `CUSTOM_CAP`, `CUSTOM_CAP_MIGRATED`.

`assemble.js` `setMetrics` (:591–603): `const cap = S.customCap(doc);` then replace every literal `4` in that closure by `cap` (`custom.length > cap`, `custom.slice(cap)`, the `keep` set over `custom.slice(0, cap)`), message `` `custom cards ${custom.length} > ${cap} — dropped …` ``. (`doc.meta` is set by `metaOf` before `setMetrics` runs — :585.)

`migrate-v3.js` `rowOf` (:128): regex `/^custom cards \d+ > \d+ — dropped /`. `report.js` (:136–138): count `/^custom cards \d+ > \d+/`; line 1 text → `` `1. **custom-card cap 8 (ใบ migrate)** — ${capAll} ใบ HUMAN มีเหตุ \`custom cards N > 8\` · ${capOnly} ใบ HUMAN ด้วยเหตุนี้อย่างเดียว — ลดเพดาน = ใบที่เกินกลับเป็น HUMAN (spec §3.7 ง)` ``.

- [ ] **Step 5: Implement #68 in `assemble.js`**

In `multipleSourceOf` (:143) mark series tokens and exclude them from the candidates:

```js
  // #68 (Plan 4c-prep · BDMS): ตัวคูณในลำดับลูกศร (44.4→33.8→…→21.4x) = ประวัติ ไม่ใช่ตัวคูณของขา — ไม่ใช้เป็นหลักยึดของคำมัธยฐาน
  const inSeries = (x) => /→\s*$/.test(t.slice(Math.max(0, x.at - 3), x.at)) || /^\s*→/.test(t.slice(x.end, x.end + 3));
  const toks = [...t.matchAll(MULT_TOKEN)].map((m) => ({ at: m.index, end: m.index + m[0].length, v: parseFloat(m[1]) })).filter((x) => !inSeries(x));
```
(the rest of the function is unchanged — with the series occurrence gone, BDMS's remaining `21.4x` tokens sit > 40 chars from "มัธยฐานถูกลาก…" and the "ไม่ใช้มัธยฐาน 5 ปี 31.0x" hit is negated ⇒ `author` + F).

`medianWindowOf` (:191–195) — after computing `a`, `b`, `n` and before `return \`FY${a}–FY${b}\``:

```js
    // #68 (TRMB): "FY2021–23 และ FY2025" = หน้าต่างที่ข้ามปี — คงปีที่ต่อท้าย (≤40 ตัวอักษร · schema)
    const more = new RegExp(`^${fy[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:และ|,|\\+|/)\\s*FY\\s*(\\d{4})`).exec(seg.slice(fy.index));
    if (n >= 2 && n <= 4) return more ? `FY${a}–FY${b}, FY${more[1]}` : `FY${a}–FY${b}`;
```
Export `medianWindowOf` from `assemble.js` (add to `module.exports`).

- [ ] **Step 6: Implement `tools/migrate-v3/batch.js`**

```js
'use strict';
/**
 * batch.js — ตัวรันแบตช์ของ Plan 4c (spec §3.7 ฉ · §13-1 · plan 4c-prep D6)
 *  ตารางที่ advisor อนุมัติ = csv รูปเดียวกับ sweep (RP.COLS) · migrate ใหม่ตอนแบตช์ (cron patch v2 ทุกวัน — bucket เลื่อนได้)
 *  ★ ใบที่ bucket/driftClass ใหม่ ≠ แถวที่อนุมัติ = ปฏิเสธ ไม่เขียนอะไร · CLEAN ≤50 ใบ/commit · VALUE-DRIFT 1 ใบ/commit
 *  ★ convert → build ทันที (spec §8 runbook) → ship --migrate --no-push (skipVerify) → verify ครั้งเดียว + push ทุก N commit
 *  ส่วนบริสุทธิ์ (readTable/selectRows/commitGroups/freshMismatch) + ตัวรันที่รับ deps (เทสต์จำลอง git/ship ได้)
 */
const RP = require('./report.js');
const CLEAN_CHUNK = 50;

/** csv ของ sweep → แถว { symbol, market, bucket, driftClass } · reasons อยู่ใน "…" เสมอ (report.js reasonsCell) */
function readTable(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || lines[0] !== RP.COLS.join(',')) throw new Error(`batch: หัวตารางต้องเป็นคอลัมน์ของ sweep csv (${RP.COLS.join(',')})`);
  return lines.slice(1).map((l, i) => {
    const m = /^([^,]+),([^,]*),([A-Z-]+),"(?:[^"]|"")*",(.*)$/.exec(l);
    if (!m) throw new Error(`batch: แถว ${i + 2} อ่านไม่ได้ — ${l.slice(0, 60)}`);
    const rest = m[4].split(',');
    return { symbol: m[1].toUpperCase(), market: m[2], bucket: m[3], driftClass: rest[8] || '' };
  });
}
function selectRows(rows, classes) {
  const want = new Set(classes), picked = [], skipped = [];
  for (const r of rows) {
    if (r.bucket === 'HUMAN') skipped.push({ symbol: r.symbol, why: 'HUMAN — not batchable' });
    else if (r.bucket === 'CLEAN' ? want.has('CLEAN') : want.has(r.driftClass)) picked.push(r);
    else skipped.push({ symbol: r.symbol, why: `${r.bucket}${r.driftClass ? '/' + r.driftClass : ''} ไม่อยู่ใน --class` });
  }
  return { picked, skipped };
}
function commitGroups(picked) {
  const clean = picked.filter((r) => r.bucket === 'CLEAN'), drift = picked.filter((r) => r.bucket !== 'CLEAN'), out = [];
  for (let i = 0; i < clean.length; i += CLEAN_CHUNK) out.push(clean.slice(i, i + CLEAN_CHUNK));
  for (const r of drift) out.push([r]);
  return out;
}
const tag = (b, c) => `${b}${c ? '/' + c : ''}`;
function freshMismatch(row, fresh) {
  if (fresh.bucket === row.bucket && (fresh.driftClass || '') === (row.driftClass || '')) return null;
  return `${row.symbol}: migrate ใหม่ได้ ${tag(fresh.bucket, fresh.driftClass)} ≠ ตาราง ${tag(row.bucket, row.driftClass)} — ข้าม (ให้ advisor อนุมัติแถวใหม่)`;
}
/** opts = { classes, n, model, noPush, dryRun } · deps = { fresh, convert, build, ship, verify, push, log } */
function runBatch(rows, opts, deps) {
  const { picked } = selectRows(rows, opts.classes);
  const refused = [], commits = []; let pushes = 0, sincePush = 0;
  const pushPoint = () => { deps.verify(); if (!opts.noPush) { deps.push(); pushes++; } sincePush = 0; };
  for (const group of commitGroups(picked)) {
    const ok = [];
    for (const r of group) {
      const why = freshMismatch(r, deps.fresh(r.symbol));
      if (why) { refused.push(why); deps.log(`✗ ${why}`); continue; }
      if (opts.dryRun) { ok.push(r.symbol); continue; }
      const code = deps.convert(r.symbol, r.bucket === 'VALUE-DRIFT');
      if (code !== 0) { refused.push(`${r.symbol}: convert exit ${code}`); deps.log(`✗ ${r.symbol}: convert exit ${code}`); continue; }
      ok.push(r.symbol);
    }
    if (!ok.length) continue;
    commits.push(ok);
    if (opts.dryRun) { deps.log(`plan: migrate: v3 ${ok.join(' ')}`); continue; }
    deps.build(); deps.ship(ok); sincePush++;
    if (sincePush >= opts.n) pushPoint();
  }
  if (!opts.dryRun && sincePush > 0) pushPoint();
  deps.log(`plan: ${commits.length} commit · ${commits.flat().length} ใบ · ปฏิเสธ ${refused.length}${opts.dryRun ? ' (dry-run — ไม่เขียน)' : ` · push ${pushes}`}`);
  return { commits, refused, pushes, code: refused.length ? 3 : 0 };
}
module.exports = { readTable, selectRows, commitGroups, freshMismatch, runBatch, CLEAN_CHUNK };
```

- [ ] **Step 7: Wire `tools/migrate-v3.js batch`**

`parseArgs`: add `'--n': 'n', '--model': 'model'` to `VAL`; `--class` collected like `--only` into `o.classes`; booleans `--dry-run` → `o.dryRun`, `--no-push` → `o.noPush`; validate `o.n` integer ≥ 1 (default 1). Header docblock gains the `batch` usage line. Add:

```js
/** batch — spec §3.7 ฉ · plan 4c-prep D6 · ★ เขียนได้เฉพาะ reports/ ของ checkout นี้ (ship --migrate commit ที่นี่) + env MIGRATE_V3_ALLOW_REAL=1 */
function runBatchCli(tablePath, opts, log) {
  const say = log || ((s) => process.stdout.write(s + '\n'));
  if (!opts.classes || !opts.classes.length) throw new UsageError('batch ต้องมี --class CLEAN|<driftClass…>');
  if (!opts.model) throw new UsageError('batch ต้องมี --model sonnet|opus (trailer ของ commit migrate)');
  if (!opts.dryRun) {
    if (!isRealReports(opts.reportsDir)) { say(`✗ batch เขียนได้เฉพาะ reports/ ของ checkout นี้ (ship --migrate commit ที่ ${REAL_REPORTS}) — ใช้ --dry-run กับ --reports-dir อื่น`); return 1; }
    if (process.env.MIGRATE_V3_ALLOW_REAL !== '1') { say('✗ batch: เขียน reports/ จริงต้องตั้ง MIGRATE_V3_ALLOW_REAL=1 (Plan 4c เท่านั้น)'); return 1; }
  }
  const o = ctxOf(opts);
  const rows = BT.readTable(fs.readFileSync(tablePath, 'utf8'));
  const Sh = require('./queue/ship.js');
  const run = (cmd, args) => { const r = cp.spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' }); if (r.status !== 0) throw new Error(`batch: ${cmd} ${args.join(' ')} exit ${r.status}`); };
  const deps = {
    fresh: (sym) => { const m = migrateOne(sym, o); return { bucket: m.bucket, driftClass: RP.driftClass(rowOf(m, o)) }; },
    convert: (sym, acceptDrift) => runConvert(sym, { ...opts, write: true, acceptDrift }, say),
    build: () => run('npm', ['run', 'build']),
    ship: (syms) => Sh.shipMigrate(syms.join(' '), { model: opts.model, noPush: true, skipVerify: true }),
    verify: () => run('npm', ['run', 'verify']),
    push: () => { run('git', ['pull', '--rebase', 'origin', 'main']); run('git', ['push', 'origin', 'HEAD:main']); },
    log: say,
  };
  return BT.runBatch(rows, { classes: opts.classes, n: opts.n || 1, model: opts.model, noPush: !!opts.noPush, dryRun: !!opts.dryRun }, deps).code;
}
```
`main`: `if (cmd === 'batch') { if (o._.length !== 1) throw new UsageError('batch ต้องมี <table.csv> ตัวเดียว'); return runBatchCli(o._[0], o); }` · usage string `sweep|convert|batch`. Require `BT = require('./migrate-v3/batch.js')`; export `runBatchCli`.

- [ ] **Step 8: Run the suites + DIST check + full verify**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan4c-prep
node test/v3-test.js > /tmp/p4cp-v3.log 2>&1; echo "v3 exit $?"; grep -E "✗|^[✓✗]" /tmp/p4cp-v3.log
node test/queue-test.js 2>&1 | tail -2
rtk proxy npm run build >/dev/null && shasum -a 256 dist/OGE.html dist/ICC.html
rtk proxy npm run verify > /tmp/p4cp-t1-verify.log 2>&1; echo "verify exit $?"; tail -3 /tmp/p4cp-t1-verify.log
git status --short reports reports.json tags.json tools/seeds.json | wc -l
```
Expected: every v3 file `✓` (v3 exit 0) · queue-test all pass · the two pinned sha256 · verify exit 0 · `0`.

- [ ] **Step 9: Commit**

```bash
git add tools/migrate-v3/batch.js tools/migrate-v3.js tools/migrate-v3/report.js tools/migrate-v3/assemble.js tools/v3/io.js tools/v3/schema.js tools/queue/ship.js test/v3/ test/queue-test.js
git commit -m "feat(v3): Plan 4c-prep Task 1 — batch runner (table-driven · refuses moved rows · CLEAN 50/commit · push every N) · #67 prepatchHash (aiModel-only edit blocked · freshHash unchanged) · #68 series/window rules (BDMS author · TRMB FY2021–FY2023, FY2025) · custom cap 8 for migrated docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H4xn4fyH6QW4hXSmoibJFB"
```

---

### Task 2: Kind 1 — `coreFfo` · `ebitdaPerShare` · `evebitda` · `legs[i].inputs.base` + `baseLabel` + migrated `label` ≤ 80 · compute + render · DIST-PROOF

**Files:**
- Modify: `tools/v3/schema.js` (`ENUM` :13/:20/:21 + `legBase`; `FFO_LABEL`; `LEG_INPUTS.pe` :46; `OVERRIDE_KEYS` :72; legs closed :261 + label/baseLabel :265; base checks in the legs loop :275–354; exit pairing :428), `tools/v3/compute.js` (`driverStart` :30–37; `exitTarget` :41–47; `withBase` + `legValueOf` new; `prepLeg` :83–97; exports :207), `_template/v3/render.js` (`ffoLabel` :22; `epsLabel` :32–40; `mdesc` :41–51; `drv`/`ex` :129–130), `tools/v3/cards.js` (`ffoL` :26), `test/check-v3.js` (`ffoL` :26), `tools/migrate-v3/assemble.js` (`guardLegs` :329 and `weightsOf` :345 call `C.legValueOf` — base-aware, same numbers when `base` is absent)
- Test: `test/v3/schema.test.js`, `test/v3/compute.test.js`, `test/v3/render.test.js`

**Interfaces:**
- Consumes: `L.legValue(leg, f, path)` (unchanged), `L.inputsOf`, `C.quoteBasis`, `R.toV2Source`, `R.mdesc`.
- Produces: `S.ENUM.ffoBasis` ∋ `'coreFfo'` · `S.ENUM.driver` ∋ `'ebitdaPerShare'` · `S.ENUM.exitMetric` ∋ `'evebitda'` · `S.ENUM.legBase = ['eps', 'epsForward', 'epsFy']` · `S.FFO_LABEL = { ffo: 'FFO', affo: 'AFFO', coreFfo: 'Core FFO' }` · `S.OVERRIDE_KEYS` ∋ `'epsForward'` · `C.withBase(leg, f, path) → leg` (pe + non-`eps` base ⇒ a copy with `override.eps` = the resolved base, `override.epsForward` removed; otherwise the same object) · `C.legValueOf(leg, f, path) = L.legValue(C.withBase(leg, f, path), f, path)` · render: `EPS FY2026E consensus (forward) $X × P/E …`, `EPS FY2025 $X × …`, `EBITDA/หุ้น ±g%/ปี`, `EV/EBITDA ออก`, `P/Core FFO`.

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js` — append:

```js
// Plan 4c-prep Task 2 (spec §3.7 ก · D2) — Kind 1 enums + inputs.base
{
  const d = base(); d.fundamentals.ffoBasis = 'coreFfo'; d.fundamentals.ffoPerShare = 4;
  t(!paths(S.validate(d)).includes('fundamentals.ffoBasis'), 'ffoBasis coreFfo accepted');
  t.eq(S.FFO_LABEL, { ffo: 'FFO', affo: 'AFFO', coreFfo: 'Core FFO' }, 'one shared FFO label map');
}
{
  const d = base(); d.fundamentals.ebitda = 3.2e9; d.scenarios.driver = 'ebitdaPerShare'; d.scenarios.exitMetric = 'evebitda';
  t.eq(S.validate(d).filter((e) => /^scenarios\.(driver|exitMetric)/.test(e.path)), [], 'driver ebitdaPerShare + exit evebitda accepted');
  d.scenarios.driver = 'eps';
  t(paths(S.validate(d)).includes('scenarios.exitMetric'), 'evebitda requires driver ebitdaPerShare');
  d.scenarios.driver = 'ebitdaPerShare'; d.scenarios.exitMetric = 'pe';
  t(paths(S.validate(d)).includes('scenarios.driver'), 'driver ebitdaPerShare requires exit evebitda (converse guard)');
}
{
  const d = base(); d.fundamentals.epsForward = 6.8; d.legs[0].inputs.base = 'epsForward'; d.legs[0].baseLabel = 'FY2026E consensus';
  t.eq(S.validate(d), [], 'pe inputs.base epsForward + baseLabel accepted');
  d.legs[0].inputs.base = 'ttm';
  t(paths(S.validate(d)).includes('legs[0].inputs.base'), 'inputs.base enum');
  d.legs[0].inputs.base = 'epsForward'; delete d.fundamentals.epsForward;
  t(paths(S.validate(d)).includes('legs[0].inputs.base'), 'epsForward base needs fundamentals.epsForward or override.epsForward');
  d.legs[0].override = { epsForward: 7.1, why: 'consensus ต่างจาก prep' };
  t.eq(S.validate(d), [], 'override.epsForward satisfies the forward base');
  d.legs[0].override = { eps: 7.1, why: 'x' };
  t(paths(S.validate(d)).includes('legs[0].override.eps'), 'override.eps with a non-eps base → error (use override.epsForward)');
  d.legs[0].override = { epsForward: 7.1, why: 'x' }; d.legs[0].inputs.base = 'eps';
  t(paths(S.validate(d)).includes('legs[0].override.epsForward'), 'override.epsForward only with base epsForward');
}
{
  const d = base(); d.legs[1].inputs.base = 'eps';
  t(paths(S.validate(d)).includes('legs[1].inputs.base'), 'inputs.base only on pe legs (dcf rejects it as an unknown input)');
  const e = base(); e.legs[0].baseLabel = 'FY2026E consensus estimate x';
  t(paths(S.validate(e)).includes('legs[0].baseLabel'), 'baseLabel ≤ 24');
  const g = base(); g.legs[0].baseLabel = 'FY2026E';
  t(paths(S.validate(g)).includes('legs[0].baseLabel'), 'baseLabel only with a non-eps inputs.base');
  const h = base(); h.legs[0].inputs.base = 'epsFy'; h.fundamentals.fy = { period: 'FY2025', eps: 6.5 };
  t.eq(S.validate(h), [], 'epsFy base with fundamentals.fy.eps');
  delete h.fundamentals.fy.eps; h.fundamentals.fy.netIncome = 1e9;
  t(paths(S.validate(h)).includes('legs[0].inputs.base'), 'epsFy base needs fundamentals.fy.eps');
}
{
  const long = 'x'.repeat(81);
  const d = base(); d.legs[0].label = long;
  t(!paths(S.validate(d)).includes('legs[0].label'), 'label length unbounded on NEW docs (unchanged)');
  d.meta.migratedFrom = { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' };
  t(paths(S.validate(d)).includes('legs[0].label'), 'label ≤ 80 on migrated docs');
}
```

`test/v3/compute.test.js` — append:

```js
// Plan 4c-prep Task 2 (D2) — inputs.base is a computation input; legs.js untouched
{
  const L = require('../../tools/v3/legs.js');
  const d = load('ZTS'); d.fundamentals.epsForward = 6.8; d.legs[0].inputs.base = 'epsForward';
  const v1 = C.compute(d, { seeds });
  t.near(v1.legs[0].value, 6.8 * 28, 1e-9, 'base epsForward → fundamentals.epsForward × multiple');
  d.legs[0].override = { epsForward: 7.0, why: 'consensus ของผู้เขียน' };
  t.near(C.compute(d, { seeds }).legs[0].value, 7.0 * 28, 1e-9, 'override.epsForward wins over fundamentals.epsForward');
  const e = load('ZTS'); e.fundamentals.fy = { period: 'FY2025', eps: 6.5 }; e.legs[0].inputs.base = 'epsFy';
  t.near(C.compute(e, { seeds }).legs[0].value, 6.5 * 28, 1e-9, 'base epsFy → fundamentals.fy.eps × multiple');
  const z = load('ZTS');
  t(C.withBase(z.legs[0], z.fundamentals) === z.legs[0], 'no base → withBase returns the same leg object (byte-identical path)');
  t.near(C.legValueOf(d.legs[0], d.fundamentals), 7.0 * 28, 1e-9, 'legValueOf = L.legValue over withBase');
  t.eq(L.legValue.length, 3, 'L.legValue signature unchanged (leg, fundamentals, path)');
  const bad = load('ZTS'); bad.legs[0].inputs.base = 'epsForward';
  t.throws(() => C.withBase(bad.legs[0], bad.fundamentals, 'legs[0]'), /^legs\[0\]\.inputs\.base: 'epsForward' ต้องมี fundamentals\.epsForward/, 'missing forward base → path-named throw');
}
{
  const d = load('ZTS'); d.fundamentals.ebitda = 3.2e9; d.scenarios.driver = 'ebitdaPerShare'; d.scenarios.exitMetric = 'evebitda';
  d.scenarios.cases.forEach((c, i) => { c.exitMultiple = [14, 16, 18][i]; });
  const v = C.compute(d, { seeds });
  const start = 3.2e9 / 443e6, end = start * Math.pow(1.08, 3);
  t.near(v.scn[1].tgt, end * 16 - 5.1e9 / 443e6, 1e-9, 'evebitda exit: EBITDA/share end × EV/EBITDA − netDebt/share');
  d.scenarios.cases[0].exitMultiple = 0.1;
  t.throws(() => C.compute(d, { seeds }), /scenarios\.cases\[0\]\.exitMultiple: evebitda — ราคาเป้า ≤ 0/, 'evebitda target ≤ 0 → same named throw as evsales');
}
```

`test/v3/render.test.js` — append:

```js
// Plan 4c-prep Task 2 (D2) — labels from base/baseLabel · new enum labels · absent ⇒ unchanged
{
  const d = load('ZTS'); const before = R.toV2Source(d, C.compute(d, { seeds }));
  d.fundamentals.epsForward = 6.8; d.legs[0].inputs.base = 'epsForward'; d.legs[0].baseLabel = 'FY2026E consensus';
  const src = R.toV2Source(d, C.compute(d, { seeds }));
  t(src.includes('EPS FY2026E consensus (forward) $6.80 × P/E เป้าหมาย ~28x'), 'forward base prints its own label and the forward EPS', (src.match(/<div class="mdesc">[^<]*/) || [''])[0]);
  delete d.legs[0].baseLabel;
  t(R.toV2Source(d, C.compute(d, { seeds })).includes('EPS (forward) $6.80 ×'), 'forward base without baseLabel → "EPS (forward)"');
  const f = load('ZTS'); f.fundamentals.fy = { period: 'FY2025', eps: 6.5 }; f.legs[0].inputs.base = 'epsFy';
  t(R.toV2Source(f, C.compute(f, { seeds })).includes('EPS FY2025 $6.50 ×'), 'epsFy base prints the fy period');
  const z = load('ZTS');
  t.eq(R.toV2Source(z, C.compute(z, { seeds })), before, 'fields absent → toV2Source byte-identical');
}
{
  const d = load('ZTS'); d.fundamentals.ebitda = 3.2e9; d.scenarios.driver = 'ebitdaPerShare'; d.scenarios.exitMetric = 'evebitda';
  d.scenarios.cases.forEach((c, i) => { c.exitMultiple = [14, 16, 18][i]; });
  const src = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<span>EBITDA\/หุ้น \+8%\/ปี<\/span>/.test(src) && /<span>EV\/EBITDA ออก<\/span>/.test(src) && /EBITDA\/หุ้น ฐาน ~/.test(src), 'driver ebitdaPerShare / exit evebitda labels');
  const r = load('ZTS'); r.fundamentals.ffoBasis = 'coreFfo'; r.fundamentals.ffoPerShare = 4; r.legs[0] = { method: 'pffo', label: 'P/Core FFO', inputs: { multiple: 20, multipleSource: 'peer' } };
  t(R.toV2Source(r, C.compute(r, { seeds })).includes('P/Core FFO 20x (ค่ากลางกลุ่มเทียบ)'), 'coreFfo → "P/Core FFO" in the pffo mdesc');
}
```

- [ ] **Step 2: Run to watch them fail** — `node test/v3-test.js 2>&1 | grep -E "✗|^[✓✗] (schema|compute|render):"` → the new assertions `✗` (unknown enum values, `C.withBase is not a function`, labels missing).

- [ ] **Step 3: Implement `schema.js`**

```js
  ffoBasis: ['ffo', 'affo', 'coreFfo'],   // + Plan 4c-prep (spec §3.7 ก): Core FFO ≠ FFO ≠ AFFO — ข้อเท็จจริงคนละตัว
  driver: ['eps', 'ffo', 'revenuePerShare', 'bvps', 'fcfPerShare', 'de', 'fre', 'ebitdaPerShare'],   // + ebitdaPerShare (Plan 4c-prep)
  exitMetric: ['pe', 'ps', 'pbv', 'pffo', 'pfcf', 'evsales', 'evebitda'],   // + evebitda (Plan 4c-prep · สูตรเดียวกับ evsales)
  legBase: ['eps', 'epsForward', 'epsFy'],   // Plan 4c-prep: ตัวตั้งของขา pe = input ของการคำนวณ (compute.withBase) ไม่ใช่ป้าย
```
`const FFO_LABEL = { ffo: 'FFO', affo: 'AFFO', coreFfo: 'Core FFO' };` (exported). `LEG_INPUTS.pe = { req: MULT, opt: RANGE.concat(['base']) }`. `OVERRIDE_KEYS` += `'epsForward'`. Legs loop: `closed(leg, p, ['method', 'label', 'inputs', 'override', 'note', 'role', 'family', 'baseLabel'])`; after `str(leg.label…)`:

```js
    // Plan 4c-prep (D2): ชื่อขาของผู้เขียนบนใบ migrate ≤ 80 · ใบ NEW ไม่เปลี่ยน
    if (isObj(doc.meta) && doc.meta.migratedFrom != null && typeof leg.label === 'string' && leg.label.length > 80) E(`${p}.label`, 'ใบ migrate: ชื่อขา ≤ 80 ตัวอักษร (ส่วนที่เหลือไป legs[i].note)');
```
after the `inp` block (before `if (leg.override != null)`):

```js
    // Plan 4c-prep (spec §3.7 ก · D2): inputs.base (pe) — ตัวตั้งอ่านจาก fundamentals ตามนี้ · override.epsForward เมื่อเลขผู้เขียนต่าง
    const fb = isObj(doc.fundamentals) ? doc.fundamentals : {}, ov = isObj(leg.override) ? leg.override : {};
    const baseK = inp.base == null ? 'eps' : inp.base;
    if (inp.base != null) {
      en(inp.base, `${p}.inputs.base`, ENUM.legBase);
      if (inp.base === 'epsForward' && !(isNum(ov.epsForward) && ov.epsForward > 0) && !(isNum(fb.epsForward) && fb.epsForward > 0)) E(`${p}.inputs.base`, "'epsForward' ต้องมี fundamentals.epsForward หรือ override.epsForward > 0");
      if (inp.base === 'epsFy' && !(isObj(fb.fy) && isNum(fb.fy.eps) && fb.fy.eps > 0)) E(`${p}.inputs.base`, "'epsFy' ต้องมี fundamentals.fy.eps > 0");
    }
    if (baseK !== 'eps' && ov.eps != null) E(`${p}.override.eps`, `inputs.base '${baseK}' — ตัวเลขของผู้เขียนใช้ override.epsForward (ฐาน forward) ไม่ใช่ override.eps`);
    if (baseK !== 'epsForward' && ov.epsForward != null) E(`${p}.override.epsForward`, "ใช้ได้เฉพาะคู่ inputs.base 'epsForward'");
    if (leg.baseLabel != null) {
      if (typeof leg.baseLabel !== 'string' || !leg.baseLabel.trim() || leg.baseLabel.length > 24) E(`${p}.baseLabel`, 'ต้องเป็นข้อความสั้น ≤24 ตัวอักษร (ถ้อยคำงวด เช่น "FY2026E consensus")');
      plain(leg.baseLabel, `${p}.baseLabel`);
      if (baseK === 'eps') E(`${p}.baseLabel`, "ใช้คู่ inputs.base 'epsForward' | 'epsFy' เท่านั้น");
    }
```
Scenarios (:428): keep the evsales line; add

```js
    if (s.exitMetric === 'evebitda' && s.driver !== 'ebitdaPerShare') E('scenarios.exitMetric', `evebitda (EV/EBITDA ออก) คูณ EBITDA ต่อหุ้น — ต้องใช้ scenarios.driver = "ebitdaPerShare" (พบ ${JSON.stringify(s.driver)})`);
    if (s.driver === 'ebitdaPerShare' && s.exitMetric !== 'evebitda') E('scenarios.driver', `ebitdaPerShare ใช้คู่ exitMetric "evebitda" เท่านั้น (พบ ${JSON.stringify(s.exitMetric)})`);
```

- [ ] **Step 4: Implement `compute.js`**

```js
    // driverStart: + ebitdaPerShare (Plan 4c-prep) = EBITDA รวม (สกุลราคา ผ่าน fq) ÷ จำนวนหุ้น
  const v = { eps: f.eps, ffo: f.ffoPerShare, bvps: f.bvps, revenuePerShare: per('revenue'), fcfPerShare: per('fcf'), de: f.dePerShare, fre: f.frePerShare, ebitdaPerShare: per('ebitda') }[s.driver];
```

```js
// exit แบบ EV (Plan 4b evsales · Plan 4c-prep evebitda): ราคาเป้า = ตัวตั้งต่อหุ้นปลายฉาก × ตัวคูณ − หนี้สุทธิ/หุ้น · อื่น = ตัวตั้ง × ตัวคูณ
const EV_EXITS = ['evsales', 'evebitda'];
function exitTarget(s, end, m, fq, i) {
  if (!EV_EXITS.includes(s.exitMetric)) return end * m;
  if (!(typeof fq.shares === 'number' && fq.shares > 0)) throw new Error(`scenarios.exitMetric: ${s.exitMetric} ต้องมี fundamentals.shares > 0 (หักหนี้สุทธิต่อหุ้น)`);
  const ev = end * m, nd = (fq.netDebt || 0) / fq.shares, tgt = ev - nd;
  if (!(tgt > 0)) throw new Error(`scenarios.cases[${i}].exitMultiple: ${s.exitMetric} — ราคาเป้า ≤ 0 (EV/หุ้น ${ev.toFixed(2)} − หนี้สุทธิ/หุ้น ${nd.toFixed(2)}) — ตัวคูณ ${s.exitMetric === 'evsales' ? 'EV/Sales' : 'EV/EBITDA'} ฉากนี้ใช้กับหุ้นนี้ไม่ได้`);
  return tgt;
}

// ตัวตั้งของขา pe ตาม inputs.base (Plan 4c-prep · spec §3.7 ก · D2) — ป้อน L.legValue ผ่าน override.eps โดยไม่แตะ legs.js
// ไม่มี base / base 'eps' / ไม่ใช่ pe = คืน object เดิม (ทางเดิมทุก byte)
function withBase(leg, f, path) {
  const b = leg && leg.inputs && leg.inputs.base;
  if (!leg || leg.method !== 'pe' || b == null || b === 'eps') return leg;
  const ov = leg.override || {}, fb = f || {};
  const v = b === 'epsForward' ? (ov.epsForward != null ? ov.epsForward : fb.epsForward) : fb.fy && fb.fy.eps;
  if (!(typeof v === 'number' && v > 0)) throw new Error(`${path || 'leg'}.inputs.base: '${b}' ต้องมี ${b === 'epsForward' ? 'fundamentals.epsForward (หรือ override.epsForward)' : 'fundamentals.fy.eps'} > 0`);
  const { epsForward, ...rest } = ov;
  return { ...leg, override: { ...rest, eps: v, why: ov.why || `ฐาน ${b}` } };
}
const legValueOf = (leg, f, path) => L.legValue(withBase(leg, f, path), f, path);
```
`prepLeg` (:88): `const legB = withBase(leg, fq, \`legs[${i}]\`); const legQ = fx === 1 ? legB : { ...legB, override: toQuote(legB.override, fx) };` — every later use of `legQ` is unchanged, so `L.legValue(legM, …)` receives the resolved base. Export `withBase`, `legValueOf`. (The `semanticErrors` loop already goes through `prepLeg` ⇒ the missing-base throw is collected with its path.)

`assemble.js`: `guardLegs` (:329) `v = C.legValueOf(leg, doc.fundamentals);` and `weightsOf` (:345) `C.legValueOf(doc.legs[i], doc.fundamentals)` (identical values while no leg carries `base`; Task 5 starts setting it).

- [ ] **Step 5: Implement render + card/gate label maps**

`render.js`: `const ffoLabel = (doc) => S.FFO_LABEL[doc.fundamentals.ffoBasis || 'ffo'];` · require `const C = require('../../tools/v3/compute.js');` · `epsLabel`:

```js
function epsLabel(leg, view) {
  // Plan 4c-prep (D2): ป้ายฐานมาจาก inputs.base — forward/FY พิมพ์ของมันเอง (ไม่ใช่ "EPS ปรับ"/TTM) · baseLabel = ถ้อยคำงวดของผู้เขียน
  const base = leg.inputs && leg.inputs.base;
  if (base === 'epsForward') return `EPS ${leg.baseLabel ? leg.baseLabel + ' ' : ''}(forward)`;
  if (base === 'epsFy') return `EPS ${leg.baseLabel || view.doc.fundamentals.fy.period}`;
  if (leg.override && leg.override.eps != null) return 'EPS ปรับ';
  // …existing basis lookup unchanged…
}
```
`mdesc` (:43): `const i = leg.inputs, lb = C.withBase(leg, view.doc.fundamentals), b = { ...view.doc.fundamentals, ...(lb.override || {}) };` (`epsLabel` still receives the original `leg`). `drv` map += `ebitdaPerShare: 'EBITDA/หุ้น'`; `ex` map += `evebitda: 'EV/EBITDA'`. `tools/v3/cards.js:26` and `test/check-v3.js:26`: `const ffoL = (view) => S.FFO_LABEL[f(view).ffoBasis || 'ffo'];` (require `S` where missing).

- [ ] **Step 6: DIST-PROOF (task-level) + suites + verify**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan4c-prep
node test/v3-test.js > /tmp/p4cp-v3.log 2>&1; echo "v3 exit $?"; grep -E "✗|^[✓✗]" /tmp/p4cp-v3.log
rtk proxy npm run build >/dev/null && shasum -a 256 dist/OGE.html dist/ICC.html && git status --short reports.json | wc -l
rtk proxy npm run verify > /tmp/p4cp-t2-verify.log 2>&1; echo "verify exit $?"
```
Expected: all `✓` · the two pinned sha256 (OGE/ICC carry none of the new fields) · `0` · verify exit 0. `node test/v3/migrate-parse.test.js` stays green (I-5 invariant untouched).

- [ ] **Step 7: Commit**

```bash
git add tools/v3/schema.js tools/v3/compute.js tools/v3/cards.js _template/v3/render.js test/check-v3.js tools/migrate-v3/assemble.js test/v3/
git commit -m "feat(v3): Plan 4c-prep Task 2 — Kind 1: ffoBasis coreFfo · driver ebitdaPerShare · exit evebitda (EV formula · pairing guard) · legs[i].inputs.base (pe · compute input via withBase · override.epsForward) + baseLabel ≤24 · migrated label ≤80 · render labels · DIST OGE/ICC identical

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H4xn4fyH6QW4hXSmoibJFB"
```

---

### Task 3: Kind 3 carry fields — `meta.sectorLine` · `verdict.extraCells` · `text.legendNote` (schema + prose rule B + render · absent ⇒ byte-identical)

**Files:**
- Modify: `tools/v3/schema.js` (top-level closed :137–138 += `verdict`; meta closed :149 += `sectorLine`; `TEXT_KEYS` :74 += `legendNote`; new `verdict` block after analyst :449–462), `tools/v3/io.js` (`TOP_ORDER` :14–15 — `verdict` after `analyst`), `tools/v3/prose.js` (`proseFields` :52–76), `_template/v3/render.js` (header :178–181; legend :210–214; vgrid :310–314), `tools/migrate-v3/assemble.js` (`order` :690 += `verdict`)
- Test: `test/v3/schema.test.js`, `test/v3/render.test.js`, `test/v3/prose.test.js`

**Interfaces:**
- Consumes: `P.renderProse(s, view, {mode:'v2src'})` (via `pr`), `S.validate`.
- Produces: `doc.meta.sectorLine?: string` (≤100 · prose · no tags) · `doc.verdict?: { extraCells: [{k, v}] }` (1–2 cells · `k` plain ≤40 · `v` prose) · `doc.text.legendNote?: string` (≤80 · prose · no tags) · `P.proseFields` lists `meta.sectorLine`, `verdict.extraCells[i].k`, `verdict.extraCells[i].v`, `text.legendNote` · render: `<div style="font-size:12.5px;opacity:.85;margin-top:6px">…</div>` after the header tags · `<span>…</span>` 4th legend item · extra `<div class="vcell">` after the analyst cell.

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js` — append:

```js
// Plan 4c-prep Task 3 (spec §3.7 ข · D3) — carry fields (optional)
{
  const d = base(); d.meta.sectorLine = 'NYSE · Healthcare · Medical Devices'; d.text = { legendNote: 'เส้นประ = FV รอบก่อน' };
  d.verdict = { extraCells: [{ k: 'จุดทยอยสะสม', v: 'ต่ำกว่า {{fv}}' }] };
  t.eq(S.validate(d), [], 'sectorLine · text.legendNote · verdict.extraCells accepted');
  d.meta.sectorLine = 'x'.repeat(101); t(paths(S.validate(d)).includes('meta.sectorLine'), 'sectorLine ≤ 100');
  d.meta.sectorLine = 'NYSE <b>x</b>'; t(paths(S.validate(d)).includes('meta.sectorLine'), 'sectorLine: no tags');
}
{
  const d = base(); d.text = { legendNote: 'y'.repeat(81) }; t(paths(S.validate(d)).includes('text.legendNote'), 'legendNote ≤ 80');
  const e = base(); e.verdict = { extraCells: [1, 2, 3].map((i) => ({ k: `k${i}`, v: `v${i}` })) }; t(paths(S.validate(e)).includes('verdict.extraCells'), 'extraCells ≤ 2');
  const g = base(); g.verdict = { extraCells: [{ k: 'k', v: 'v', x: 1 }] }; t(paths(S.validate(g)).includes('verdict.extraCells[0].x'), 'extraCells[i] closed {k, v}');
  const h = base(); h.verdict = { extraCells: [{ k: '{{px}}', v: 'v' }] }; t(paths(S.validate(h)).includes('verdict.extraCells[0].k'), 'extraCells[i].k plain (no token)');
  const w = base(); w.verdict = { other: 1 }; t(paths(S.validate(w)).includes('verdict.other'), 'verdict object closed');
  const z = base(); z.verdict = { extraCells: [] }; t(paths(S.validate(z)).includes('verdict.extraCells'), 'extraCells present ⇒ 1–2 cells');
}
```

`test/v3/prose.test.js` — append (the file requires `tools/v3/prose.js` as `P`):

```js
// Plan 4c-prep Task 3 — new prose fields are scanned by rule B
{
  const d = JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json')));
  d.meta.sectorLine = 'NYSE · Animal Health'; d.text = { legendNote: 'จุดแดง = งบออก' }; d.verdict = { extraCells: [{ k: 'จุดซื้อ', v: 'ใต้ FV' }] };
  const ps = P.proseFields(d).map((x) => x.path);
  t(['meta.sectorLine', 'text.legendNote', 'verdict.extraCells[0].k', 'verdict.extraCells[0].v'].every((p) => ps.includes(p)), 'proseFields lists the carry fields', JSON.stringify(ps.filter((p) => /sector|legend|verdict/.test(p))));
}
```

`test/v3/render.test.js` — append:

```js
// Plan 4c-prep Task 3 (D3) — carry fields render where v2 printed them · absent ⇒ byte-identical
{
  const z = load('ZTS'); const before = R.toV2Source(z, C.compute(z, { seeds }));
  const d = load('ZTS'); d.meta.sectorLine = 'NYSE · Animal Health'; d.text = { legendNote: 'จุดแดง = งบออก' };
  d.verdict = { extraCells: [{ k: 'จุดทยอยสะสม', v: 'ต่ำกว่า {{fv}}' }, { k: 'คะแนนคุณภาพ', v: 'สูง' }] };
  const src = R.toV2Source(d, C.compute(d, { seeds }));
  t(/<\/span>\n    <\/div>\n    <div style="font-size:12\.5px;opacity:\.85;margin-top:6px">NYSE · Animal Health<\/div>\n    <h1>/.test(src), 'sectorLine: small line between the tags and h1');
  t(/จุดสำคัญ<\/span>\n        <span>จุดแดง = งบออก<\/span>\n      <\/div>/.test(src), 'legendNote: 4th legend span');
  t(/เป้านักวิเคราะห์ 12 ด\.[\s\S]*?<\/div><\/div>\n        <div class="vcell"><div class="k">จุดทยอยสะสม<\/div><div class="v">ต่ำกว่า \{\{rd:fv\}\}<\/div><\/div>\n        <div class="vcell"><div class="k">คะแนนคุณภาพ<\/div><div class="v">สูง<\/div><\/div>\n      <\/div>/.test(src), 'extraCells: vcells after the analyst cell, tokens rendered');
  const html = expandReport(src);
  t.eq(CR.checkHtml(html, 'ZTS.html', { source: src }).errors.map((e) => `${e.id} ${e.msg}`), [], 'carry fields: full v2 gate — zero errors');
  t.eq(R.toV2Source(z, C.compute(z, { seeds })), before, 'fields absent → byte-identical');
}
```

- [ ] **Step 2: Run to watch them fail** — `node test/v3-test.js 2>&1 | grep -E "✗|^[✓✗] (schema|prose|render):"` → unknown keys `verdict`/`meta.sectorLine`/`text.legendNote`; render regexes miss.

- [ ] **Step 3: Implement schema / io / prose**

`schema.js`: top-level closed list += `'verdict'`; meta closed += `'sectorLine'`; after `str(m.priceNote …)`:

```js
    // Plan 4c-prep (spec §3.7 ข · D3): คำที่ผู้เขียนพิมพ์ในจุด gdots ของ header (v2 แสดงจริง) — บรรทัดเล็กใต้ tags
    if (m.sectorLine != null) { str(m.sectorLine, 'meta.sectorLine'); noTag(m.sectorLine, 'meta.sectorLine'); if (typeof m.sectorLine === 'string' && m.sectorLine.length > 100) E('meta.sectorLine', 'ยาวเกิน 100 ตัวอักษร'); }
```
`TEXT_KEYS` += `'legendNote'`; in the text block: `noTag(doc.text.legendNote, 'text.legendNote'); if (typeof doc.text.legendNote === 'string' && doc.text.legendNote.length > 80) E('text.legendNote', 'ยาวเกิน 80 ตัวอักษร (ป้าย legend หมวด 2)');`. After the analyst block:

```js
  // ── verdict (Plan 4c-prep · spec §3.7 ข) — vcell ที่ 3+ ของหมวด 8 ของผู้เขียน (ไม่บังคับ) ──
  if (doc.verdict != null) {
    const vd = doc.verdict;
    if (!isObj(vd)) E('verdict', 'ต้องเป็น object {extraCells}');
    else {
      closed(vd, 'verdict', ['extraCells']);
      const xc = vd.extraCells;
      if (!Array.isArray(xc) || xc.length < 1 || xc.length > 2) E('verdict.extraCells', 'ต้องเป็น array 1–2 ช่อง [{k, v}]');
      else xc.forEach((c, i) => {
        const p = `verdict.extraCells[${i}]`;
        if (!isObj(c)) return E(p, 'ต้องเป็น {k, v}');
        closed(c, p, ['k', 'v']); str(c.k, `${p}.k`); plain(c.k, `${p}.k`); str(c.v, `${p}.v`); noTag(c.v, `${p}.v`);
        if (typeof c.k === 'string' && c.k.length > 40) E(`${p}.k`, 'ป้าย ≤ 40 ตัวอักษร');
      });
    }
  }
```
`io.js` `TOP_ORDER`: insert `'verdict'` after `'analyst'`. `prose.js` `proseFields`: after `meta.priceNote` add `add('meta.sectorLine', obj(doc.meta).sectorLine);` and after the analyst-free lists add `arr(obj(doc.verdict).extraCells).forEach((c, i) => { add(\`verdict.extraCells[${i}].k\`, obj(c).k); add(\`verdict.extraCells[${i}].v\`, obj(c).v); });` (`text.legendNote` is covered by the `text.*` loop). `assemble.js` `order` += `'verdict'` after `'analyst'`.

- [ ] **Step 4: Implement render**

```js
  // header (:178–181) — sectorLine = คำที่ v2 พิมพ์ในจุด gdots (Plan 4c-prep D3) · ไม่มี = byte-identical
    <div>
      ${tags}
    </div>${m.sectorLine ? `\n    <div style="font-size:12.5px;opacity:.85;margin-top:6px">${pr(m.sectorLine)}</div>` : ''}
```
legend (:213): `<span><i style="background:#ea4335;height:8px;width:8px;border-radius:50%"></i>จุดสำคัญ</span>${T.legendNote ? \`\n        <span>${pr(T.legendNote)}</span>\` : ''}`. vgrid (:313): `${analystCell}${((doc.verdict && doc.verdict.extraCells) || []).map((c) => \`\n        <div class="vcell"><div class="k">${esc(c.k)}</div><div class="v">${pr(c.v)}</div></div>\`).join('')}`. (Inline style only — no new class; render docblock rule "ห้ามคิด class ใหม่".)

- [ ] **Step 5: Run + DIST + verify** — same commands as Task 2 Step 6. Expected identical outcomes (pinned sha256, verify exit 0).

- [ ] **Step 6: Commit**

```bash
git add tools/v3/schema.js tools/v3/io.js tools/v3/prose.js _template/v3/render.js tools/migrate-v3/assemble.js test/v3/
git commit -m "feat(v3): Plan 4c-prep Task 3 — Kind 3 carry fields meta.sectorLine (≤100) · verdict.extraCells (≤2) · text.legendNote (≤80) — schema · rule B · render (absent = byte-identical)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H4xn4fyH6QW4hXSmoibJFB"
```

---

### Task 4: Kind 2 — the gate: `SYNONYM_VOCAB` with structural guards · s6 `TEMPLATE_COUNTED` · leg alignment on one label function · s8 extra cells · gdots ruling correction

**Files:**
- Create: `tools/migrate-v3/synonyms.js`, `tools/migrate-v3/numbers.js` (`numsOf`, `classifyNumber` moved out of `equiv.js` so `scenarios.js` can use them in Task 5 without the `equiv → assemble` cycle)
- Modify: `tools/migrate-v3/equiv.js` (header normaliser comment :106–108; s3 alignment :135–141 + synonym pass in the `LEG_RE` replace :144–180; s6 normaliser :207–236 synonym pass on `.top`/rows/`.ret`; s8 normaliser :237–239; containment :386–397 `TEMPLATE_COUNTED`; `out.synonym`; `numsOf`/`classifyNumber` re-exported from `numbers.js`), `tools/migrate-v3/assemble.js` (`labelParts` new, `labelOf` :258 = `labelParts(m).label`)
- Test: `test/v3/migrate-equiv.test.js`

**Interfaces:**
- Consumes: `EQ.keyOf`, `EQ.wordOf`, `EQ.tok`, `S.FFO_LABEL`, `S.ENUM`, the doc/view already in `norm` ctx.
- Produces:
  - `SY.SYNONYM_VOCAB: [{ id, roles: string[], from: string[][] (token phrases), to: string[], guard(g) → bool, why }]` · `SY.FACT_WORDS: RegExp[]` · `SY.apply(role, tokens, g) → { tokens, used: [{ id, w }] }` — roles: `s3.mname` `s3.mdesc` `s6.top` `s6.endRow` `s6.exitRow` `s6.divRow` `s6.ret`; `g = { doc, view, leg?, i?, case? }`.
  - `EQ.TEMPLATE_COUNTED = { s6: { รวม: 3, รวมปันผล: 3, ปันผลสะสม: 3 } }` · `compare()` result gains `synonym: [{ zone, id, w }]` (info, never a bucket reason).
  - `A.labelParts(mname) → { label, ctx: boolean, reason: string }` (`reason` = the author's words inside the context suffix other than the marker words).

- [ ] **Step 1: Write the failing tests** — `test/v3/migrate-equiv.test.js`, append:

```js
// ── Plan 4c-prep Task 4 (spec §3.7 ค · D4) ──
const SY = require('../../tools/migrate-v3/synonyms.js');
const docOf = (patch) => { const d = JSON.parse(JSON.stringify(require('../fixtures/v3/ZTS.json'))); patch(d); return d; };
// no fact word ever enters the vocabulary (reviewer rule — like TEMPLATE_VOCAB/FORMULA_VOCAB)
{
  const all = SY.SYNONYM_VOCAB.flatMap((e) => e.from.flat().concat(e.to));
  t(all.every((w) => !SY.FACT_WORDS.some((re) => re.test(w))), 'SYNONYM_VOCAB holds no fact word (AFFO Core forward FY#E Tangible adj GAAP)', JSON.stringify(all.filter((w) => SY.FACT_WORDS.some((re) => re.test(w)))));
  t(SY.SYNONYM_VOCAB.every((e) => e.id && e.roles.length && typeof e.guard === 'function' && e.why && e.why.length > 10), 'every entry names roles · guard · why');
  t.eq(SY.FACT_WORDS.map(String).length >= 7, true, 'FACT_WORDS lists the seven fact words');
}
// Review Focus 4 — guards
{
  const g = (patch, extra) => ({ doc: docOf(patch), ...(extra || {}) });
  const ap = (role, ws, gg) => SY.apply(role, ws, gg).tokens;
  t.eq(ap('s6.exitRow', ['Exit', 'P/E'], g(() => {})), ['ออก', 'P/E'], 'exit row: Exit ≡ ออก');
  t.eq(ap('s6.top', ['Rev', '+6%/ปี'], g((d) => { d.scenarios.driver = 'eps'; })), ['Rev', '+6%/ปี'], 'guard: Rev under driver eps stays (different quantity)');
  t.eq(ap('s6.top', ['Rev', '+6%/ปี'], g((d) => { d.scenarios.driver = 'revenuePerShare'; })), ['รายได้', '+6%/ปี'], 'Rev ≡ รายได้ when driver revenuePerShare');
  t.eq(ap('s6.endRow', ['รายได้ปี', '3'], g((d) => { d.scenarios.driver = 'revenuePerShare'; })), ['รายได้', 'ปี', '3'], 'รายได้ปี ≡ รายได้ ปี');
  t.eq(ap('s6.divRow', ['ไม่จ่าย'], g(() => {}, { case: { divCum: 6.6 } })), ['ไม่จ่าย'], 'guard: ไม่จ่าย on a column with divCum > 0 stays');
  t.eq(ap('s6.divRow', ['ไม่จ่าย'], g(() => {}, { case: { divCum: 0 } })), [], 'ไม่จ่าย ≡ divCum 0');
  t.eq(ap('s6.top', ['EPS', 'ทรงตัว'], g(() => {}, { case: { growth: 1 } })), ['EPS', 'ทรงตัว'], 'guard: ทรงตัว with growth ≠ 0 stays');
  t.eq(ap('s6.top', ['EPS', 'ทรงตัว'], g(() => {}, { case: { growth: 0 } })), ['EPS'], 'ทรงตัว ≡ growth 0');
  t.eq(ap('s3.mname', ['DCF', '(บริบท', '—', 'ไม่รวมใน', 'FV)'], g(() => {}, { leg: { role: 'fv' } })), ['DCF', '(บริบท', '—', 'ไม่รวมใน', 'FV)'], 'guard: context words on a fv leg stay');
  t.eq(ap('s3.mname', ['DCF', '(บริบท', '—', 'ไม่รวมใน', 'FV)'], g(() => {}, { leg: { role: 'context' } })), ['DCF', '—'], 'บริบท · ไม่รวมใน FV ≡ the v3 context suffix on a context leg');
  t.eq(ap('s3.mdesc', ['มัธยฐานย้อนหลัง'], g(() => {}, { leg: { inputs: { multipleSource: 'author' } } })), ['มัธยฐานย้อนหลัง'], 'guard: มัธยฐานย้อนหลัง on an author multiple stays');
  t.eq(ap('s3.mdesc', ['มัธยฐานย้อนหลัง'], g(() => {}, { leg: { inputs: { multipleSource: 'median5y' } } })), ['มัธยฐาน'], 'มัธยฐานย้อนหลัง ≡ มัธยฐาน on a median leg');
  t.eq(ap('s6.top', ['FFO', '−5%/ปี'], g((d) => { d.fundamentals.ffoBasis = 'affo'; d.scenarios.driver = 'ffo'; })), ['FFO', '−5%/ปี'], 'guard: FFO under an AFFO basis stays (different fact)');
  t.eq(ap('s6.ret', ['ต่อปี'], g((d) => { d.scenarios.perYear = null; })), ['ต่อปี'], 'guard: ต่อปี without perYear stays');
  t.eq(ap('s6.ret', ['Total'], g(() => {})), [], 'Total in .ret ≡ the v3 total figure');
}
// integration — the migrator + gate on mutated fixtures: synonyms close the words, TEXT LOST reports what is not a synonym
{
  const html = raw('CASY').replace(/<span>P\/E ออก<\/span>/g, '<span>Exit P/E</span>');
  const m = migrate('CASY', html);
  t(!m.eq.textLost.includes('Exit') && m.eq.synonym.some((s) => s.id === 'exit' && s.zone === 's6'), 'CASY Exit P/E: closed by the exit synonym', JSON.stringify({ lost: m.eq.textLost, syn: m.eq.synonym }));
}
{
  const html = raw('CASY').replace(/<span>ปันผลรวม 3 ปี<\/span>/g, '<span>ปันผลสะสม 3 ปี</span>');
  const m = migrate('CASY', html);
  t(!m.eq.textLost.includes('ปันผลสะสม') && m.eq.templateDropped.filter((w) => w === 'ปันผลสะสม').length === 3, 'CASY ปันผลสะสม ×3: s6 TEMPLATE_COUNTED (3 columns)', JSON.stringify(m.eq.textLost));
  // condition "v3 column does not print the word": the author also writes it in the Bear scenario text (carried into cases[0].desc ⇒ inside a v3 column)
  // ⇒ the counted rule is off for this doc ⇒ the three label occurrences are compared normally (v3 prints the word once) ⇒ 3 TEXT LOST
  const inCol = html.replace(/(<li><span>สถานการณ์<\/span><span>)/, '$1ปันผลสะสม ');
  const mc = migrate('CASY', inCol);
  t.eq(mc.eq.textLost.filter((w) => w === 'ปันผลสะสม').length, 3, 'TEMPLATE_COUNTED off when a v3 column prints the word (not a template word there)');
}
// leg alignment on one label function (Task 6 M-4 · D4): an author context suffix with reasoning aligns and the reasoning is not lost once assemble carries it (Task 5) — here: labelParts itself
{
  const A = require('../../tools/migrate-v3/assemble.js');
  t.eq(A.labelParts('3. Justified P/BV (บริบท — ห่างจากขายึดตลาด >2× ไม่รวมในกรอบ)'), { label: 'Justified P/BV', ctx: true, reason: 'ห่างจากขายึดตลาด >2×' }, 'labelParts: marker words out · reasoning kept');
  t.eq(A.labelParts('2. DCF (Free Cash Flow) — บริบท ไม่รวมใน FV'), { label: 'DCF (Free Cash Flow)', ctx: true, reason: '' }, 'labelParts: trailing dash before the marker trimmed (no "—" residue)');
  t.eq(A.labelParts('1. P/E Valuation (GAAP TTM)'), { label: 'P/E Valuation (GAAP TTM)', ctx: false, reason: '' }, 'labelParts: no context → label unchanged');
  t.eq(A.labelParts('3. Market Anchor (เป้านักวิเคราะห์ — บริบท ไม่นับในค่าเฉลี่ย)'), { label: 'Market Anchor', ctx: true, reason: 'เป้านักวิเคราะห์' }, 'labelParts: marker inside an open paren (LULU) → no orphan "(" in the label · paren words → reason');
  t.eq(A.labelParts('3. DCF (FCFE) — บริบท/stress-test เท่านั้น'), { label: 'DCF (FCFE)', ctx: true, reason: 'stress-test เท่านั้น' }, 'labelParts: IESC shape');
  t.eq(A.labelOf('3. Justified P/BV (บริบท — ห่างจากขายึดตลาด >2× ไม่รวมในกรอบ)'), 'Justified P/BV', 'labelOf = labelParts(...).label');
}
// s8 — an author 3rd vcell is compared in full (its .k is not a template label) and an analyst cell is dropped only at its own index
{
  const html = raw('CASY').replace(/(<div class="vgrid">[\s\S]*?)(\n\s*<\/div>\s*<div class="zone">)/, '$1\n        <div class="vcell"><div class="k">จุดทยอยสะสม</div><div class="v">ใต้มูลค่าเหมาะสม</div></div>$2');
  const m = migrate('CASY', html);
  t(m.eq.textLost.includes('จุดทยอยสะสม'), 'without verdict.extraCells (assemble = Task 5) the 3rd vcell .k is TEXT LOST — no longer masked by the s8 normaliser', JSON.stringify(m.eq.textLost));
}
// the 4b .ret self-test (spec §10.2 d) still fails when an author word in .ret disappears — synonyms never mask it
{
  const html = raw('CASY').replace('{{rd:sc2ret}}', '{{rd:sc2ret}} ผู้เขียนพิเศษ');
  const parsed = PV.parseV2('CASY', html);
  const { doc } = A.assemble(parsed, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: parsed.rd.values.priceDate, analysisPx: null });
  if (doc.scenarios.cases[1].retNote) delete doc.scenarios.cases[1].retNote;
  const view = C.compute(doc, { seeds: SEEDS });
  const eq = EQ.compare(B.expandReport(html), B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: html });
  t(eq.textLost.includes('ผู้เขียนพิเศษ'), '.ret self-test: a dropped author word in .ret is TEXT LOST', JSON.stringify(eq.textLost));
}
```

(`A` is already required at the top of the file; the last block re-requires nothing.)

- [ ] **Step 2: Run to watch them fail** — `node test/v3/migrate-equiv.test.js` → `synonyms.js` missing, `A.labelParts` missing, `eq.synonym` undefined.

- [ ] **Step 3: Create `tools/migrate-v3/numbers.js`** — move `UNIT`, `UNIT_SRC`, `NUM_RE`, `numsOf`, `classifyNumber` verbatim from `equiv.js` (:275–297), export them plus `UNIT_WORD`; `equiv.js` requires it and keeps re-exporting `classifyNumber` (no caller changes). `reEsc` is duplicated as a local one-liner in `numbers.js`.

- [ ] **Step 4: Create `tools/migrate-v3/synonyms.js`**

```js
'use strict';
/**
 * synonyms.js — คำพ้องที่อนุมัติของ equivalence gate (Plan 4c-prep · spec §3.7 ค · plan D4 · §10.2 ข้อ b)
 * ★ ปิด — เพิ่มได้ผ่าน review ทีละคำเท่านั้น (เหมือน TEMPLATE_VOCAB / FORMULA_VOCAB)
 * ★ ใช้เฉพาะ "องค์ประกอบที่ align กัน" (role) และเฉพาะเมื่อ guard เชิงโครงสร้างบน doc/view v3 เป็นจริง — คำนอก role/guard = เทียบตามปกติ
 * ★ ห้ามใส่คำที่บอกข้อเท็จจริง (FACT_WORDS) — คำพวกนั้นต้องมีช่อง/enum (Kind 1) ไม่ใช่คำพ้อง
 * from = วลีโทเค็นของ v2 (เทียบด้วย keyOf — ตัดวงเล็บ/เครื่องหมาย) · to = โทเค็นที่ v3 พิมพ์ (ว่าง = v3 แสดงปริมาณเดียวกันเป็นตัวเลข/ป้าย template)
 */
const S = require('../v3/schema.js');
const keyOf = (t) => String(t).replace(/[^\p{L}\p{M}\p{N}]/gu, '').replace(/\p{N}+/gu, '#');
const PER_SHARE = ['revenuePerShare', 'fcfPerShare', 'de', 'fre', 'ebitdaPerShare'];
const scn = (g) => (g.doc && g.doc.scenarios) || {};
const FACT_WORDS = [/^AFFO$/i, /^Core$/i, /^forward$/i, /^FY\s*'?\d{2,4}\s*[EeF]$/, /^Tangible$/i, /^adj\.?$/i, /^GAAP$/i];
const SYNONYM_VOCAB = [
  { id: 'exit', roles: ['s6.exitRow'], from: [['Exit'], ['ทางออก']], to: ['ออก'], guard: () => true,
    why: 'แถวตัวคูณออกของคอลัมน์เดียวกัน — v3 พิมพ์ "<ตัวคูณ> ออก" (measure §6.2 · CBRS L)' },
  { id: 'per-share', roles: ['s6.top', 's6.endRow'], from: [['sh'], ['Sh'], ['share']], to: ['หุ้น'], guard: (g) => PER_SHARE.includes(scn(g).driver),
    why: 'ตัวตั้งต่อหุ้น ("Rev/Sh" · "FCF/share") — v3 พิมพ์ "<driver>/หุ้น" เมื่อ driver เป็นค่าต่อหุ้น' },
  { id: 'revenue', roles: ['s6.top', 's6.endRow'], from: [['Rev'], ['Revenue'], ['Sales']], to: ['รายได้'], guard: (g) => scn(g).driver === 'revenuePerShare',
    why: 'driver รายได้ต่อหุ้น — v3 พิมพ์ "รายได้/หุ้น" (measure §6.2: CRWV CSGP OKJ HSAI)' },
  { id: 'revenue-year', roles: ['s6.endRow'], from: [['รายได้ปี']], to: ['รายได้', 'ปี'], guard: (g) => scn(g).driver === 'revenuePerShare',
    why: 'แถวปลายฉาก "รายได้ปี 3" ≡ "รายได้/หุ้น ปี 3" (CPNG INTC)' },
  { id: 'ffo', roles: ['s6.top', 's6.endRow', 's6.exitRow'], from: [['FFO']], to: ['FFO'], guard: (g) => S.FFO_LABEL[(g.doc.fundamentals || {}).ffoBasis || 'ffo'] === 'FFO',
    why: 'FFO เฉพาะเมื่อ ffoBasis ของ v3 คือ FFO — ใต้ AFFO/Core FFO เป็นข้อเท็จจริงคนละตัว (Kind 1)' },
  { id: 'total', roles: ['s6.ret'], from: [['total'], ['Total'], ['รวม']], to: [], guard: () => true,
    why: 'ป้ายผลตอบแทนรวมใน .ret — ตัวเลขใน .ret ของ v3 คือผลตอบแทนรวม N ปีอยู่แล้ว (APO HLT)' },
  { id: 'per-year', roles: ['s6.ret'], from: [['ต่อปี']], to: ['ปี'], guard: (g) => scn(g).perYear != null,
    why: 'หน่วยต่อปีของ perYear ที่อนุมาน (D3) — v3 พิมพ์ "(x%/ปี)"' },
  { id: 'median-hist', roles: ['s3.mdesc'], from: [['มัธยฐานย้อนหลัง']], to: ['มัธยฐาน'], guard: (g) => !!g.leg && ['median5y', 'median10y'].includes((g.leg.inputs || {}).multipleSource),
    why: 'ขาตัวคูณที่ v3 พิมพ์ "(มัธยฐาน N ปี)" — มัธยฐานของตัวเองย้อนหลัง = ข้อเท็จจริงเดียวกัน' },
  { id: 'context', roles: ['s3.mname', 's3.mdesc'], from: [['ไม่รวมใน', 'FV'], ['ไม่นับใน', 'FV'], ['ไม่รวมในกรอบ', 'FV'], ['ไม่รวมในกรอบ'], ['ไม่นับใน'], ['ไม่รวมใน'], ['บริบท']], to: [],
    guard: (g) => !!g.leg && g.leg.role === 'context',
    why: 'ป้ายขาบริบทของผู้เขียน ≡ "(บริบท — ไม่นับใน FV)" ที่ template พิมพ์ (measure §6.1: 27/29 ขา role context แล้ว)' },
  { id: 'no-div', roles: ['s6.divRow'], from: [['ไม่จ่าย']], to: [], guard: (g) => !!g.case && !(g.case.divCum > 0),
    why: 'ฉากที่ v3 ไม่มีปันผล (divCum 0/ไม่มี) — v3 พิมพ์ศูนย์/ไม่มีแถว' },
  { id: 'flat', roles: ['s6.top'], from: [['ทรงตัว'], ['คงที่'], ['flat']], to: [], guard: (g) => !!g.case && g.case.growth === 0,
    why: 'growth = 0 — v3 พิมพ์ "+0%/ปี"' },
];
/** tokens (v2 ขององค์ประกอบเดียว) → { tokens, used } · วลียาวก่อน · ไม่ผ่าน guard = คืนเดิม */
function apply(role, tokens, g) {
  let out = tokens.slice(); const used = [];
  for (const e of SYNONYM_VOCAB) {
    if (!e.roles.includes(role) || !e.guard(g || {})) continue;
    for (const ph of e.from.slice().sort((a, b) => b.length - a.length)) {
      const K = ph.map(keyOf);
      for (let i = 0; i + K.length <= out.length; i++) {
        if (!K.every((k, j) => keyOf(out[i + j]) === k)) continue;
        used.push({ id: e.id, w: out.slice(i, i + K.length).join(' ') });
        out.splice(i, K.length, ...e.to); i += e.to.length - 1;
      }
    }
  }
  return { tokens: out, used };
}
module.exports = { SYNONYM_VOCAB, FACT_WORDS, apply, keyOf };
```

- [ ] **Step 5: Wire `equiv.js`**

- `TEMPLATE_COUNTED` next to `TEMPLATE_VOCAB`, with a comment per word: `รวม` ("รวม 3 ปี" ป้ายคอลัมน์ของ skeleton v2 รุ่นเก่า ×74) · `รวมปันผล` (ป้ายต่อท้าย .ret ของ skeleton รุ่นเก่า ×28) · `ปันผลสะสม` (ป้ายแถวปันผลรุ่นเก่า ≡ "ปันผลรวม" ×9) — measure §2 s6.
- `norm` ctx carries `syn: []`. **s3** (`LEG_RE` replace, v2 side only): `nm` → `SY.apply('s3.mname', tok(text(nm)), { doc, view, leg })` and replace with the rewritten text; the `kept` words of a computed leg's mdesc and the full mdesc of a declared leg pass through `SY.apply('s3.mdesc', …)` before `kept`; push `used` to `ctx.syn` with `zone: 's3'`. Alignment: v2 `labOf = (s) => text(A.labelParts(text(s)).label)`; v3 side unchanged (label + exact suffix stripped) — both sides now use the label that assemble wrote.
- **s6** (v2 side, per column index `ci` = bear 0 / base 1 / bull 2, `g = { doc, view, i: ci, case: doc.scenarios.cases[ci] }`): rewrite `.top` second span through `s6.top`; each `<li>` label through `s6.exitRow` (label passes `isExit` — `/ออก|exit|ทางออก/i`) / `s6.endRow` (`/ปี\s*\d/` and not ปันผล) and the value span of a `/ปันผล/` row through `s6.divRow`; the `.ret` text (outside `{{rd:…}}` tokens) through `s6.ret`. Rewriting happens **before** the existing `ok()` label check, so "Exit P/E" becomes "ออก P/E" and passes against the v3 label set.
- **s8**: replace the vcell normaliser with: strip `.k` only when `text(k)` ∈ `{'มูลค่าเหมาะสม', 'ส่วนต่างจากราคา'}`; drop the whole cell only for the **first** cell whose `.k` matches `/เป้านักวิเคราะห์/` (on each side); every other cell stays in full (author extra cells compared word by word).
- **header**: update the gdots comment to the corrected ruling: "gdots: glyph/สี = ของตกแต่ง (ตัดทิ้ง) · ข้อความ = คำผู้เขียนที่ v2 แสดงจริง → v3 พกด้วย meta.sectorLine (Plan 4c-prep D4 แก้คำตัดสิน Task 6 ของ 4b)"; code unchanged.
- **containment** (`compare`, before the `inVocab` check): 

```js
    // s6 คำ template ที่นับจำนวน (Plan 4c-prep D4): ทิ้งได้ ≤ 3 ครั้ง (1 ต่อคอลัมน์) และเฉพาะเมื่อคอลัมน์ v3 ไม่พิมพ์คำนั้น
    const cap = (TEMPLATE_COUNTED[zone] || {})[wordOf(w)];
    if (cap && !v3ColKeys.has(k) && (usedCount.get(k) || 0) < cap) { usedCount.set(k, (usedCount.get(k) || 0) + 1); out.templateDropped.push(wordOf(w)); continue; }
```
with `v3ColKeys` = keys of every word inside `<div class="col …">` of the v3 s6 zone (computed once) and `usedCount = new Map()`. `out.synonym = c2.syn`.

`assemble.js`:

```js
/** ชื่อขาของผู้เขียน (Plan 4c-prep D4): ตัดเลขนำ + ป้ายบริบทท้ายชื่อ · reason = คำอื่นในป้ายบริบท (→ legs[i].note ใน Task 5) · gate ใช้ฟังก์ชันเดียวกันทั้งสองฝั่ง */
const CTX_MARK = /(?:^|[\s(—–-])(?:บริบท|ไม่รวมในกรอบ(?:\s*FV)?|ไม่รวมใน\s*(?:FV|ค่าเฉลี่ย|การเฉลี่ย)|ไม่นับใน\s*(?:FV|ค่าเฉลี่ย|กรอบ)?|ไม่เข้าค่าเฉลี่ย)(?=[\s)/—–-]|$)/g;
function labelParts(mname) {
  const t = String(mname).replace(/^\s*\d+\s*[.)]\s*/, '').replace(/[{}<>]/g, '').trim();
  const at = t.search(/\s*(?:\(\s*|[—–-]\s*)?บริบท/);
  if (at < 0) return { label: t, ctx: false, reason: '' };
  const tidy = (s) => s.replace(CTX_MARK, ' ').replace(/[()]/g, ' ').replace(/^[\s—–/·-]+|[\s—–/·-]+$/g, '').replace(/\s+/g, ' ').trim();
  let label = t.slice(0, at).replace(/[\s—–-]+$/, '').trim(), pre = '';
  // ป้ายบริบทอยู่ในวงเล็บที่เปิดก่อนหน้า ("Market Anchor (เป้านักวิเคราะห์ — บริบท …)") — ตัดวงเล็บกำพร้าออกจากชื่อ คำในวงเล็บไป reason
  if ((label.match(/\(/g) || []).length > (label.match(/\)/g) || []).length) { const k = label.lastIndexOf('('); pre = tidy(label.slice(k + 1)); label = label.slice(0, k).trim(); }
  const reason = [pre, tidy(t.slice(at))].filter(Boolean).join(' — ');
  return { label, ctx: true, reason };
}
const labelOf = (mname) => labelParts(mname).label;
```
Export `labelParts`.

- [ ] **Step 6: Run** — `node test/v3/migrate-equiv.test.js && node test/v3-test.js 2>&1 | grep -E "✗|^[✓✗]"` → all pass (the 4b acceptance block — TEXT LOST 0 on CASY/FTV/SRE/SGC/NFG, BBL `['เฉลี่ย']` — must stay exactly as pinned). Then a read-only mini-sweep over the fixtures for regressions: `node tools/migrate-v3.js sweep --reports-dir /tmp/p4cp-fx --head-manifest /tmp/p4cp-fx/reports.json --no-stale --out /tmp/p4cp-fx/sw` after copying the 9 `-v2.html` fixtures into `/tmp/p4cp-fx` (same recipe as `test/v3/migrate-cli.test.js` :13–18) → CLEAN count ≥ the Task 1 count. DIST + verify as Task 2 Step 6.

- [ ] **Step 7: Commit**

```bash
git add tools/migrate-v3/synonyms.js tools/migrate-v3/numbers.js tools/migrate-v3/equiv.js tools/migrate-v3/assemble.js test/v3/migrate-equiv.test.js
git commit -m "feat(v3): Plan 4c-prep Task 4 — gate Kind 2: closed SYNONYM_VOCAB (role + structural guard per entry · no fact words) · s6 TEMPLATE_COUNTED (≤3 · v3 column lacks the word) · leg alignment via labelParts on both sides · s8 extra vcells compared in full · gdots ruling corrected

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H4xn4fyH6QW4hXSmoibJFB"
```

---

### Task 5: Assemble — detections that fill the new homes

**Files:**
- Modify: `tools/migrate-v3/parse-v2.js` (:99–105 — add `gdots`, `legend` raw html), `tools/migrate-v3/assemble.js` (`metaOf` :67–94 first-tag parse + `sectorLine`; `ffoBasisOf` new, called after `fundOf` :563–564; `legsOf` :261–321 `labelParts` reason → note, `baseOf` → `inputs.base`/`baseLabel`/`override.epsForward`, `qualifierOf` round 3 :242–257; `extraCellsOf` + `legendNoteOf` new; `S6_DRV` :483 += `ebitdaPerShare`, `ffo` → `(?:Core )?A?FFO`; custom value tokenise in `proseZones` :458–477 and the price-bound H :732–739; post-compute `.ret` resolve), `tools/migrate-v3/scenarios.js` (`DRIVER`/`EXIT` :12–14; `retNoteOf` :35–45 pre-anchor + per-year + numeric pending; `perYearOf` new; `retResolve` new; `fundStart` :48–52 += `ebitdaPerShare`), `tools/migrate-v3/cards.js` (`cardFund` :129–166 fy latest period)
- Test: `test/v3/migrate-assemble.test.js`

**Interfaces:**
- Consumes: `A.labelParts`, `SY.apply` (to know which words are synonyms — `qualifierOf` does not carry them), `NB.classifyNumber` (numbers.js), `C.legValueOf`, `P3.priceBound(view)`, `MP.tokenise`.
- Produces:
  - `A.firstTagOf(tag0, sym) → { exchange, extra: string[] } | null`
  - `A.ffoBasisOf(parsed) → 'ffo' | 'affo' | 'coreFfo' | null` (null = mixed or no FFO wording)
  - `A.baseOf(mdesc, fund) → { base: 'epsForward' | 'epsFy', label: string|null, v: number } | null`
  - `A.qualifierOf(prose, consumed?: Set<key>) → string` (round 3: author word runs of the formula head outside parentheses, minus `consumed`)
  - `A.extraCellsOf(parsed) → { cells: [{k, v}] | null, H: string[] }` · `A.legendNoteOf(parsed, sym) → string | null` · `A.sectorLineOf(parsed) → string | null`
  - `MS.perYearOf(notes, v2totals, years) → 'cagr' | 'linear' | null` · `MS.retResolve(pending, view) → { set: [{i, note}], H: string[] }`
  - `MC.cardFund(...).fy` = latest period; `fyConflict` still returned (info) but no H.

- [ ] **Step 1: Write the failing tests** — `test/v3/migrate-assemble.test.js`, append:

```js
// ── Plan 4c-prep Task 5 (spec §3.7 · D3/D4) ──
const EQ = require('../../tools/migrate-v3/equiv.js');
const R = require('../../_template/v3/render.js');
const K = require('../../tools/v3/cards.js');
const MS = require('../../tools/migrate-v3/scenarios.js');
const MC = require('../../tools/migrate-v3/cards.js');
const runH = (sym, html) => { const p = PV.parseV2(sym, html); const r = A.assemble(p, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: p.rd.values.priceDate, analysisPx: null });
  const view = r.doc && C.compute(r.doc, { seeds: SEEDS }); return { ...r, view, eq: view && EQ.compare(B.expandReport(html), B.expandReport(R.toV2Source(r.doc, view)), r.doc, view, { v2src: html }) }; };
// gdots text → meta.sectorLine (v2 rendered it)
{
  const r = runH('SRE', raw('SRE').replace(/<div class="gdots">[^<]*<\/div>/, '<div class="gdots">SRE · Sempra · Utilities</div>'));
  t.eq(r.doc.meta.sectorLine, 'SRE · Sempra · Utilities', 'gdots text → meta.sectorLine');
  t(!r.eq.textLostAt.some((x) => x.zone === 'header'), 'gdots words not lost in header', JSON.stringify(r.eq.textLostAt));
  t(!('sectorLine' in runH('SRE', raw('SRE')).doc.meta), 'glyph-only gdots (●●●) → no sectorLine');
}
// first tag: "(ADR)" / "TSX: CCO" → exchange + headerTags (no H)
{
  t.eq(A.firstTagOf('NASDAQ: ASML (ADR)', 'ASML'), { exchange: 'NASDAQ', extra: ['ADR'] }, 'first tag (ADR)');
  t.eq(A.firstTagOf('NYSE: CCJ / TSX: CCO', 'CCJ'), { exchange: 'NYSE', extra: ['TSX: CCO'] }, 'first tag dual listing');
  t.eq(A.firstTagOf('NASDAQ: POET • TSXV: PTK', 'POET'), { exchange: 'NASDAQ', extra: ['TSXV: PTK'] }, 'first tag bullet dual listing');
  t.eq(A.firstTagOf('NASDAQ: LANC → MZTI', 'LANC'), { exchange: 'NASDAQ', extra: ['→ MZTI'] }, 'first tag rename arrow kept as a tag');
  t.eq(A.firstTagOf('OTC Markets: FANUY (ADR)', 'FANUY'), { exchange: 'OTC Markets', extra: ['ADR'] }, 'multi-word exchange');
  t.eq(A.firstTagOf('SET: STECON', 'STEC'), { exchange: 'SET', extra: ['STECON'] }, 'printed ticker ≠ file symbol → the printed ticker becomes a tag');
  t.eq(A.firstTagOf('Healthcare', 'X'), null, 'not an exchange tag → null (H stays)');
  const r = runH('SRE', raw('SRE').replace('<span class="tag">NYSE: SRE</span>', '<span class="tag">NYSE: SRE (ADR)</span>'));
  t(r.doc.meta.exchange === 'NYSE' && r.doc.meta.headerTags[0] === 'ADR' && !r.notes.H.some((h) => /first header tag/.test(h)), 'SRE (ADR): exchange NYSE · ADR tag · no H', JSON.stringify(r.doc.meta.headerTags));
}
// legend annotation → text.legendNote · 3rd+ vcell → verdict.extraCells
{
  const html = raw('CASY').replace(/(จุดสำคัญ<\/span>)/, '$1\n        <span>เส้นประ = FV รอบก่อน</span>')
    .replace(/(<div class="vgrid">[\s\S]*?)(\n\s*<\/div>\s*<div class="zone">)/, '$1\n        <div class="vcell"><div class="k">จุดทยอยสะสม</div><div class="v">ใต้มูลค่าเหมาะสม</div></div>$2');
  const r = runH('CASY', html);
  t.eq(r.doc.text.legendNote, 'เส้นประ = FV รอบก่อน', 'legend residue → text.legendNote');
  t.eq(r.doc.verdict, { extraCells: [{ k: 'จุดทยอยสะสม', v: 'ใต้มูลค่าเหมาะสม' }] }, '3rd vcell → verdict.extraCells');
  t(!r.eq.textLost.includes('จุดทยอยสะสม') && !r.eq.textLost.includes('เส้นประ'), 'carried words not lost', JSON.stringify(r.eq.textLost));
}
// forward-labelled pe base → inputs.base + baseLabel (+ fundamentals.epsForward from the leg when absent)
{
  const html = raw('CASY').replace('EPS adj. $19.16 × P/E', 'EPS FY2026E consensus $19.16 × P/E');
  const r = runH('CASY', html), leg = r.doc.legs[0];
  t.eq([leg.inputs.base, leg.baseLabel, r.doc.fundamentals.epsForward], ['epsForward', 'FY2026E consensus', 19.16], 'forward base detected · baseLabel · epsForward from the leg');
  t(!leg.override || leg.override.eps == null, 'no override.eps next to a forward base', JSON.stringify(leg.override));
  t(Math.abs(r.view.legs[0].value - 19.16 * leg.inputs.multiple) < 1e-9, 'value = forward EPS × multiple (unchanged number)');
  t(!r.eq.textLost.includes('FY2026E') && !r.eq.textLost.includes('consensus'), 'FY2026E consensus not lost (printed by the base label)', JSON.stringify(r.eq.textLost));
  t.eq(A.baseOf('EPS TTM $5.10 × P/E 20x', { eps: 5.1 }), null, 'TTM base → null (base eps)');
  t.eq(A.baseOf('EPS (FY2026e, consensus) $10.25 × P/E 15x', { eps: 9 }), { base: 'epsForward', label: 'FY2026e consensus', v: 10.25 }, 'AZN shape → forward');
  t.eq(A.baseOf('EPS FY2025 $6.50 × P/E 20x', { eps: 6.13, fy: { period: 'FY2025', eps: 6.5 } }), { base: 'epsFy', label: null, v: 6.5 }, 'FY actual equal to fundamentals.fy.eps → epsFy');
}
// ffoBasis from author wording (spec §3.7 ก)
{
  const P0 = (cards, legs, top) => ({ s1cards: cards.map((k) => ({ k, v: '', d: '' })), legs: legs.map(([mname, mdesc]) => ({ mname, mdesc })), s6cols: [{ top: ['Bear', top], lis: [] }] });
  t.eq(A.ffoBasisOf(P0(['P/AFFO (TTM)'], [['1. P/AFFO', 'AFFO/หุ้น $4.10 × 18x']], 'AFFO +2%/ปี')), 'affo', 'AFFO wording → affo');
  t.eq(A.ffoBasisOf(P0([], [['1. P/Core FFO', 'Core FFO $6.20 × 21x']], 'Core FFO +3%/ปี')), 'coreFfo', 'Core FFO wording → coreFfo');
  t.eq(A.ffoBasisOf(P0([], [['1. P/FFO', 'FFO $3 × 15x'], ['2. P/AFFO', 'AFFO $2.5 × 18x']], 'FFO +1%/ปี')), null, 'mixed FFO + AFFO → null (not guessed)');
  t.eq(A.ffoBasisOf(P0(['P/E'], [['1. P/E', 'EPS $3 × 15x']], 'EPS +1%/ปี')), null, 'no FFO wording → null');
}
// driver / exit mapping (spec §3.7 ก)
{
  const d = (s) => (MS.DRIVER.find(([, re]) => re.test(s)) || [null])[0], e = (s) => (MS.EXIT.find(([, re]) => re.test(s)) || [null])[0];
  t.eq([d('EBITDA +6%/ปี'), d('Core FFO +3%/ปี'), d('Rev +6%/ปี')], ['ebitdaPerShare', 'ffo', 'revenuePerShare'], 'DRIVER: EBITDA before revenue/eps');
  t.eq([e('EV/EBITDA ออก'), e('Exit EV/EBITDA'), e('EV/Revenue ออก'), e('EV/Sales ทางออก')], ['evebitda', 'evebitda', 'evsales', 'evsales'], 'EXIT: EV/EBITDA · EV/Revenue ≡ evsales');
  t.eq(d('EBITDA margin 6.2%'), 'ebitdaPerShare', 'EBITDA margin maps the driver word only — growth stays unreadable (residual, D5)');
}
// context-suffix reasoning → legs[i].note · marker words are synonyms (Task 4)
{
  const html = raw('CASY').replace('<div class="mname">3. Justified P/BV', '<div class="mname">3. Justified P/BV (บริบท — ห่างจากขายึดตลาด >2× ไม่รวมในกรอบ)');
  const r = runH('CASY', html);
  t.eq([r.doc.legs[2].role, r.doc.legs[2].label], ['context', 'Justified P/BV'], 'context leg · author label without the suffix');
  t(/^ห่างจากขายึดตลาด >2×/.test(r.doc.legs[2].note || ''), 'suffix reasoning prepended to legs[2].note', r.doc.legs[2].note);
  t(!['บริบท', 'ไม่รวมในกรอบ', 'ห่างจากขายึดตลาด'].some((w) => r.eq.textLost.includes(w)), 'no context word lost', JSON.stringify(r.eq.textLost));
}
// qualifierOf round 3 — author words left in the formula head are carried; formula words and consumed words are not
{
  t(/midcycle/.test(A.qualifierOf('EPS $5.10 × P/E midcycle 22x')), 'round 3: head word "midcycle" carried');
  t.eq(A.qualifierOf('EPS $5.10 × P/E 22x'), '', 'round 3: pure formula → nothing');
  const FM = require('../../tools/migrate-v3/formula.js');
  const q3 = A.qualifierOf('EPS FY2026E $5.10 × P/E guidance 22x', new Set([FM.keyOf('FY2026E')]));
  t(!/FY2026E/.test(q3) && /guidance/.test(q3), 'round 3: consumed keys (baseLabel) are not repeated · other head words carried', q3);
}
// .ret round 2 (Review Focus 5): per-year → perYear · pre-anchor words → retNote · numeric equal → carried · numeric far → H
{
  const r0 = runH('CASY', raw('CASY'));
  const tot = r0.view.d.scenarios.map((s) => s.total);
  const cagr = tot.map((x) => (Math.pow(1 + x / 100, 1 / 3) - 1) * 100);
  const py = raw('CASY').replace(/\{\{rd:sc(\d)ret\}\}/g, (m0, i) => `${m0} (3 ปี) ~${cagr[i - 1].toFixed(1)}%/ปี`);
  const r = runH('CASY', py);
  t.eq(r.doc.scenarios.perYear, 'cagr', 'per-year notes on every column → perYear cagr');
  t(r.doc.scenarios.cases.every((c) => c.retNote === '(3 ปี)') && !r.notes.H.some((h) => /\.ret annotation/.test(h)), 'per-year figure not copied · "(3 ปี)" kept as retNote', JSON.stringify(r.doc.scenarios.cases.map((c) => c.retNote)));
  const pre = raw('CASY').replace('{{rd:sc2ret}}', 'Total {{rd:sc2ret}} capital');
  t.eq(runH('CASY', pre).doc.scenarios.cases[1].retNote, 'capital', 'pre-anchor "Total" = synonym (not carried) · post-anchor "capital" carried');
  const numOk = raw('CASY').replace('{{rd:sc2ret}}', `{{rd:sc2ret}} (capital) / ${tot[1] >= 0 ? '+' : '−'}${Math.abs(tot[1]).toFixed(1)}% total`);
  const rn = runH('CASY', numOk);
  t(rn.doc.scenarios.cases[1].retNote === '(capital) total' && !rn.notes.H.some((h) => /\.ret annotation/.test(h)), 'numeric note equal to the v3 total within printed rounding → carried without the number', JSON.stringify({ n: rn.doc.scenarios.cases[1].retNote, H: rn.notes.H }));
  const numBad = raw('CASY').replace('{{rd:sc2ret}}', `{{rd:sc2ret}} (capital) / +${(Math.abs(tot[1]) + 9).toFixed(1)}% total`);
  t(runH('CASY', numBad).notes.H.some((h) => /scenarios\.cases\[1\] \.ret annotation .* not carried/.test(h)), 'numeric note ≠ v3 total → H stays (residual)');
}
// price-bound custom card → tokenised by D3 exact match (no H) · a non-matching literal still H
{
  const r0 = runH('CASY', raw('CASY'));
  const pe = K.renderCard('pe', r0.view).v;
  const card = (v) => `<div class="metric"><div class="k">GAAP P/E (TTM)</div><div class="v">${v}</div><div class="d">บน EPS GAAP</div></div>`;
  const inject = (v) => raw('CASY').replace(/(<div class="grid g4">\s*)/, `$1${card(v)}\n      `);
  const r = runH('CASY', inject(pe));
  const c = r.doc.metrics.custom.find((x) => x.label === 'GAAP P/E (TTM)');
  t(c && c.value === '{{pe}}' && !r.notes.H.some((h) => /price-bound custom card/.test(h)), 'custom value equal to {{pe}} → tokenised, no H', JSON.stringify({ c, H: r.notes.H }));
}
// fy periods conflict → latest + F (no H)
{
  const html = raw('BBL').replace(/(<div class="grid g4">\s*)/, '$1<div class="metric"><div class="k">EPS FY2024</div><div class="v">฿20.10</div><div class="d">งบปี 2024</div></div>\n      ');
  const r = runH('BBL', html);
  t(r.doc.fundamentals.fy.period === 'FY2025' && !r.notes.H.some((h) => /fy periods conflict/.test(h)) && r.notes.F.some((f) => /fy periods differ .* kept FY2025 \(latest\)/.test(f)), 'fy conflict → latest period + F', JSON.stringify({ fy: r.doc.fundamentals.fy, H: r.notes.H }));
}
```

(BBL's existing assertion `notes.H === ['analyst target on the gauge is a max/min, not a consensus']` stays unchanged — the new rules must not add or remove an H on BBL.)

- [ ] **Step 2: Run to watch them fail** — `node test/v3/migrate-assemble.test.js 2>&1 | tail -25` → the new functions are missing / fields absent.

- [ ] **Step 3: Implement `parse-v2.js` + meta (`assemble.js`)**

`parse-v2.js` return object: `gdots: first(/<div class="gdots">([\s\S]*?)<\/div>/, header), legend: byN[2] ? first(/<div class="legend">([\s\S]*?)<\/div>/, byN[2].body) : null,` (additive — `test/v3/migrate-parse.test.js` pins nothing about absent keys).

```js
/** แท็กแรก "<EXCH>: <SYM> …" (Plan 4c-prep D3 · 14 ใบ) → { exchange, extra } · ส่วนท้าย (ADR) / "/ TSX: CCO" / "• TSXV: PTK" / "→ MZTI" / "/ GOOG" = แท็กถัดไป
 *  ticker ที่พิมพ์ ≠ symbol ของไฟล์ (STEC ↔ STECON) = คง ticker ที่พิมพ์เป็นแท็ก (คำไม่หาย) · ไม่ใช่รูป "<EXCH>: …" = null (H คงเดิม) */
function firstTagOf(tag0, sym) {
  const m = /^([A-Za-z][A-Za-z ]*?):\s*([A-Z0-9.\-]+)\s*(.*)$/.exec(String(tag0 || '').trim());
  if (!m) return null;
  const extra = [];
  if (m[2] !== sym) extra.push(m[2]);
  const rest = m[3].trim();
  if (rest) {
    const adr = /^\((ADR|ADS|GDR)\)$/.exec(rest);
    extra.push(adr ? adr[1] : rest.replace(/^[/•·]\s*/, '').trim());
  }
  return { exchange: m[1].trim(), extra };
}
const GLYPH_ONLY = /^[\s●•·○◦⬤#0-9a-f]*$/i;
/** ข้อความใน gdots (ไม่ใช่ glyph/สีล้วน) = ข้อความที่ v2 แสดง → meta.sectorLine (≤100 ไม่งั้น H) */
function sectorLineOf(parsed) {
  const t = txt(parsed.gdots || '');
  return t && !GLYPH_ONLY.test(t) ? t : null;
}
```
In `metaOf`: replace the `ex` regex block (:74–77) with `const ft = firstTagOf(tag0, sym); if (!ft) H.push(\`first header tag not "<EXCH>: ${sym}" ("${tag0}")\`); m.exchange = ft ? ft.exchange : ((tag0.split(':')[0] || '').trim() || '?');` then `const tags = (ft ? ft.extra : []).concat(parsed.tags.slice(1).map(…))` (+F `first tag "${tag0}" → exchange ${ft.exchange} + tags ${ft.extra}` when `extra.length`). After `m.sub`: `const sl = sectorLineOf(parsed); if (sl && sl.length <= 100) { m.sectorLine = MP.htmlToProse(sl); F.push(\`gdots text → meta.sectorLine "${sl}"\`); } else if (sl) H.push(\`gdots text ${sl.length} > 100 chars — not carried\`);`.

- [ ] **Step 4: Implement legs (`assemble.js`)**

```js
// ฐาน forward/FY ของขา pe (Plan 4c-prep D2 · measure §6.3: 112 ขา · 17 พิมพ์ TTM ผิด) — ท่อนตัวตั้ง = ก่อน "×" ตัวแรก
const FWD_WORD = /forward|ล่วงหน้า|ประมาณการ|คาดการณ์|consensus|guidance|\bFY\s*'?\d{2,4}\s*[eEF]\b|\b20\d\d[eE]\b/i;
const FY_ACT = /\bFY\s*'?(\d{4}|\d{2})(?![0-9eEF])/;
function baseOf(mdesc, fund) {
  const head = String(mdesc || '').split(/×|&times;/)[0];
  if (!/EPS|กำไรต่อหุ้น/i.test(head) || /\bTTM\b/i.test(head)) return null;
  const mv = LG.moneyAll(head); const v = mv.length ? mv[mv.length - 1].v : null;
  if (!(v > 0)) return null;
  const lab = (re) => { const m = re.exec(head.replace(/[()]/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ')); return m ? m[0].trim().slice(0, 24) : null; };
  if (FWD_WORD.test(head)) return { base: 'epsForward', label: lab(/(?:\bFY\s*'?\d{2,4}\s*[eEF]|\b20\d\d[eE])(?:\s+(?:consensus|guidance))?|forward|ล่วงหน้า/i), v };
  const fy = FY_ACT.exec(head);
  if (fy && fund && fund.fy && typeof fund.fy.eps === 'number' && Math.abs(fund.fy.eps - v) <= 0.005 + 1e-9) return { base: 'epsFy', label: null, v };
  return null;
}
```
In `legsOf` after `leg = { method, label, inputs }` for a computed `pe` leg: `const bs = method === 'pe' ? baseOf(pl.mdesc, f) : null;` — when `bs`: `inputs.base = bs.base; if (bs.label) leg.baseLabel = bs.label;` · `epsForward`: when `f.epsForward` is absent the caller's two-pass sets it (`legsOf` returns `fwdBase = { v }` like `epsBase`; `assemble` sets `fund.epsForward = pass.fwdBase.v` before pass 2 + F `fundamentals.epsForward from leg N base`), else `sameV(f.epsForward, bs.v) ? no override : leg.override = { epsForward: bs.v, why: OVERRIDE_WHY }` — and **delete `override.eps`** from the extractor's override (the extractor's `override.eps` equals `bs.v`; the value is unchanged, now reached through `withBase`); `epsFy`: delete `override.eps`. The consumed keys for round 3 = `new Set([bs.label, 'forward', 'consensus', 'guidance'].filter(Boolean).flatMap((x) => x.split(/\s+/)).map(FM.keyOf))`. The existing two-pass `epsBase` capture (:302 — "eps from the first pe leg base" when `values.eps` is absent) **skips** a leg whose `baseOf` is non-null: a forward/FY base must never become `fundamentals.eps` (TTM) — the next plain pe leg supplies it, or `eps` stays absent as today.

Label/context: `const lp = labelParts(pl.mname); const label = lp.label || \`วิธีที่ ${n}\`;` — when `label.length > 80` (migrated ⇒ schema bound): cut at the last top-level `(` before 80 and prepend the tail to the note (+F). After the note is set: `if (lp.ctx && lp.reason) leg.note = leg.note ? \`${lp.reason} · ${leg.note}\` : lp.reason;`.

`qualifierOf(prose, consumed)` round 3 — inside the `splitTop(...).forEach` for `i === 0` (the formula segment): collect maximal runs of consecutive tokens of `outsideParens(seg)` where `isProseToken(tk, true)` and `!consumed.has(FM.keyOf(tk))` and the token is not a synonym of this leg (`SY.apply('s3.mdesc', [tk], { leg })` leaves it unchanged); push each run joined by spaces. `consumed` defaults to an empty `Set` (every 4b caller unchanged).

`ffoBasisOf(parsed)`:

```js
/** ffoBasis จากถ้อยคำผู้เขียน (spec §3.7 ก · measure §6.2: 8 ใบ AFFO · 2 Core FFO) — การ์ด · ขา pffo · หัวคอลัมน์ฉาก/แถวออก
 *  ทุกจุดที่พูดถึงปริมาณ FFO ต้องตรงกัน · ปนกัน = null (ไม่เดา — gate ตัดสิน) */
function ffoBasisOf(parsed) {
  const texts = [].concat((parsed.s1cards || []).map((c) => c.k), (parsed.legs || []).flatMap((l) => [l.mname, l.mdesc]),
    (parsed.s6cols || []).flatMap((c) => [c.top ? c.top[1] : '', ...(c.lis || []).map((x) => x[0])]));
  const kinds = new Set();
  for (const s of texts) for (const m of String(s || '').matchAll(/\b(Core\s*FFO|AFFO|FFO)\b/gi)) kinds.add(/core/i.test(m[1]) ? 'coreFfo' : m[1].toUpperCase() === 'AFFO' ? 'affo' : 'ffo');
  return kinds.size === 1 ? [...kinds][0] : null;
}
```
Called after `fundOf` (:564): `const fb = ffoBasisOf(parsed); if (fb && fb !== 'ffo') { fund.ffoBasis = fb; F.push(\`fundamentals.ffoBasis ${fb} from the author's wording\`); }`.

`S6_DRV` += `ebitdaPerShare: 'EBITDA/หุ้น'`, `ffo: '(?:Core )?A?FFO'`.

- [ ] **Step 5: Implement §2 / §8 carry (`assemble.js`)**

```js
/** legend หมวด 2 — ตัดป้าย skeleton 3 ชิ้น (กติกาเดียวกับ equiv s2) · เศษ → text.legendNote (≤80 ไม่งั้น H) */
function legendNoteOf(parsed, sym) {
  let t = txt(parsed.legend || '');
  if (!t) return null;
  t = t.replace(new RegExp(`(^|\\s)ราคา ${esc(sym)}(?=\\s|$)`), '$1').replace(/(^|\s)มูลค่าเหมาะสม(?:\s*\{\{rd:fv\}\}|\s*(?:US\$|\$|฿)\s*[0-9][0-9,.]*)?(?=\s|$)/, '$1').replace(/(^|\s)จุดสำคัญ(?=\s|$)/, '$1');
  t = t.replace(/\s+/g, ' ').trim();
  return t || null;
}
/** vcell ที่ไม่ใช่ template (มูลค่าเหมาะสม · ส่วนต่างจากราคา · เป้านักวิเคราะห์ ตัวแรก) → verdict.extraCells (≤2 ไม่งั้น H) */
function extraCellsOf(parsed) {
  const H = [], cells = [];
  let analystSeen = false;
  for (const [k, vHtml] of (parsed.s8 && parsed.s8.vcells) || []) {
    const kk = txt(k);
    if (kk === 'มูลค่าเหมาะสม' || kk === 'ส่วนต่างจากราคา') continue;
    if (!analystSeen && /เป้านักวิเคราะห์/.test(kk)) { analystSeen = true; continue; }
    cells.push({ k: kk.replace(/[{}<>]/g, '').trim(), v: MP.htmlToProse(vHtml) });
  }
  if (cells.length > 2) H.push(`s8 vcells ${cells.length + 3} > 5 — extra cells not carried`);
  return { cells: cells.length && cells.length <= 2 ? cells : null, H };
}
```
In `assemble` after the §2 hint (:678–681): `const ln = legendNoteOf(parsed, parsed.sym); if (ln && ln.length <= 80) { text.legendNote = MP.htmlToProse(ln); F.push(…); } else if (ln) H.push(\`legend annotation ${ln.length} > 80 chars — not carried\`);`. After `doc.analyst = …`: `const xc = extraCellsOf(parsed); H.push(...xc.H); if (xc.cells) { doc.verdict = { extraCells: xc.cells }; F.push(\`s8 extra vcells → verdict.extraCells ×${xc.cells.length}\`); }`. `proseZones` gains `verdict.extraCells[i].v` (so literals are tokenised like other prose) and `metrics.custom[i].value` (source = the card's `vHtml`).

Price-bound custom (:732–739): tokenise first (the `proseZones` loop runs `MP.tokenise` over the custom value — D3 exact match only), then H only for a value that still contains a price-bound **literal**: `if (lit) H.push(…)` — the `PRICE_TOK.test(c.value)` clause is removed (a `{{pe}}` value is the approved form: it renders the live number). Move the custom check after the tokenise loop.

- [ ] **Step 6: Implement `scenarios.js` + `cards.js`**

`DRIVER`: insert `['ebitdaPerShare', /EBITDA/i]` first. `EXIT`: `['evebitda', /EV\s*\/\s*EBITDA/i]` first; `evsales` regex `/EV\s*\/\s*(?:S(?:ales)?|Rev(?:enue)?)\b/i`. `isExit`: `/ออก|exit|ทางออก/i`. `fundStart` += `ebitdaPerShare: per('ebitda')`.

```js
const PY_NUM = /[≈~]?\s*([+\-−]?)\s*[≈~]?\s*([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:\/\s*(?:ปี|yr|year)|ต่อปี|per\s*(?:year|annum)|p\.?a\.?)/i;
const PERYEAR = /\/\s*(?:ปี|yr|year)|ต่อปี|per\s*(?:year|annum)|\bp\.?a\.?(?![a-z])/i;
/** .ret (Plan 4c-prep D3): pre = ก่อนหลักยึด % · post = หลังหลักยึด → { pre, post, perYear: number|'anchor'|null, numeric: {sign, v, text}|null } */
function retParts(html) {
  const h = String(html || ''), m = RET_ANCHOR.exec(h);
  if (!m) return null;
  const pre = MP.htmlToProse(h.slice(0, m.index)).trim();
  let post = MP.htmlToProse(h.slice(m.index + m[0].length)).trim();
  let perYear = null, numeric = null;
  const py = PY_NUM.exec(post);
  if (py) { perYear = parseFloat(py[2]) * (py[1] === '-' || py[1] === '−' ? -1 : 1); post = post.replace(py[0], ' '); }
  else if (/^\s*(?:\/\s*ปี|ต่อปี)\s*$/.test(post)) { perYear = 'anchor'; post = ''; }
  const nm = /([+\-−])?\s*~?\s*([0-9]+(?:\.[0-9]+)?)\s*%/.exec(post);
  if (nm) { numeric = { text: nm[0].trim(), v: parseFloat(nm[2]) * (nm[1] === '-' || nm[1] === '−' ? -1 : 1) }; post = post.replace(nm[0], ' '); }
  const clean = (s) => s.replace(/\s+\/\s+/g, ' ').replace(/^[\s/,·~≈]+|[\s/,·~≈]+$/g, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  return { pre: clean(pre), post: clean(post), perYear, numeric };
}
/** perYear จากป้าย /ปี ทุกคอลัมน์ (measure §5: cagr = แบบแผนผู้เขียน 138/147) · linear เฉพาะเมื่อทุกคอลัมน์ตรง linear และไม่ตรง cagr (±0.5 จุด) ·
 *  คู่ที่พิมพ์ไม่เข้าสูตรไหนเลย (mirror `derived-values.js` 'bad' — ไม่แตะ) → null: v3 ไม่พิมพ์ %/ปี · คำ /ปี ยังหลุด → HUMAN (advisor 26 ก.ย. 69) — ห้ามคืน 'cagr' ให้ตัวเลขที่ผู้เขียนไม่เคยพิมพ์ */
function perYearOf(parts, v2totals, years) {
  if (parts.length !== 3 || !parts.every((p) => p && p.perYear != null)) return null;
  const nums = parts.map((p, i) => ({ p: p.perYear, T: v2totals[i] })).filter((x) => typeof x.p === 'number' && typeof x.T === 'number');
  const near = (a, b) => Math.abs(a - b) <= 0.5 + 1e-9;
  const cagr = (T) => (Math.pow(1 + T / 100, 1 / years) - 1) * 100;
  if (nums.some((x) => !near(x.p, x.T / years) && !near(x.p, cagr(x.T)))) return null;   // fits neither formula → no per-year figure (never 'cagr')
  if (nums.length && nums.every((x) => near(x.p, x.T / years) && !near(x.p, cagr(x.T)))) return 'linear';
  return 'cagr';
}
```
`retNoteOf` becomes: parts → words = `[pre minus synonym tokens (SY.apply('s6.ret', …, {doc: {scenarios: out}}))), post]` joined → `RET_UNSAFE` now tested on the text **without** the per-year figure and the numeric figure; a `numeric` part is **pending** (returned in `meta.retPending[i] = { note, numeric, H: <the 4b H text> }` — not an H yet); a per-year part is dropped (the template prints it once `perYear` is set); divClash unchanged. In `scenarios()`: compute `parts` for the 3 columns first; `const v2t = (vs || []).map((s) => (s && typeof s.tgt === 'number' ? ((s.tgt + (out.divIncluded && typeof s.div === 'number' ? s.div : 0)) - v.px) / v.px * 100 : null));`; `const py = perYearOf(parts, v2t, out.years); if (py && out.perYear == null) { out.perYear = py; F.push(\`scenarios.perYear ${py} inferred from the per-year .ret labels\`); }`; a per-year label on only some columns → the 4b H stays for those columns.

```js
/** หลัง compute (Plan 4c-prep D3 · Review Focus 5): โน้ต .ret ที่มีตัวเลข % — พาได้เมื่อเท่าผลตอบแทนรวมของ v3 ภายในการปัดที่พิมพ์ ไม่งั้น H เดิม */
function retResolve(pending, view) {
  const set = [], H = [];
  (pending || []).forEach((p, i) => {
    if (!p) return;
    const tot = view.d.scenarios[i].total, shown = `${tot >= 0 ? '+' : '−'}${Math.abs(tot)}%`;
    if (NB.classifyNumber(p.numeric.text.replace('−', '-'), shown.replace('−', '-')) === 'rounding') set.push({ i, note: p.note });
    else H.push(p.H);
  });
  return { set, H };
}
```
In `assemble` after `view` exists (next to `MS.tgtCheck`): `const rr = MS.retResolve(scn.meta.retPending, view); H.push(...rr.H); for (const { i, note } of rr.set) { if (note) out.scenarios.cases[i].retNote = note; F.push(\`scenarios.cases[${i}] numeric .ret = v3 total → carried without the number\`); }` — when a `retNote` is added, recompute `view` through the existing tokenise → `C.compute` path (the block already recomputes after tokenise; move `retResolve` before that block).

`cards.js` `cardFund` fy (:129–138): collect `{ p, k, v }` for every FY card; after the loop choose `latest = max by year number of p` (`+/(\d{2,4})/.exec(p)[1]`, two-digit → +2000); `fy` = the values of the cards with `p === latest` only; `if (fyPeriods.size > 1) F.push(\`fy periods differ ${[...fyPeriods].join(' / ')} — kept ${latest} (latest)\`);`. In `assemble` (:554) drop `H.push('fy periods conflict across FY cards')` (the F comes from `cf.F`).

- [ ] **Step 7: Run** — `node test/v3/migrate-assemble.test.js && node test/v3/migrate-equiv.test.js && node test/v3/migrate-parse.test.js && node test/v3/migrate-cli.test.js` → all pass; then `node test/v3-test.js`, DIST + verify as Task 2 Step 6. Read-only probe of the classes on the real corpus (no write — `migrateOne` on `reports/`): run the harness `stage1.js` + `stage2.js` from `measure-4c-prep.md` (copy to the scratchpad, `ROOT` = this worktree, `NOSTALE=1`) and paste the §1 class table into the task report — expected direction: gdots / vcell / legend / `.ret` per-year / custom cap / first tag / price-bound / fy conflict classes near 0; TEXT LOST s3 and s6 lower. A class that does not move is reported, not "fixed" by widening a rule.

- [ ] **Step 8: Commit**

```bash
git add tools/migrate-v3/ test/v3/migrate-assemble.test.js
git commit -m "feat(v3): Plan 4c-prep Task 5 — assemble fills the new homes: gdots → sectorLine · first-tag parse · legend → legendNote · vcells → verdict.extraCells · forward/FY pe base → inputs.base/baseLabel · ffoBasis from wording · EBITDA/EV-EBITDA/EV-Revenue mapping · context reasoning → note · qualifierOf round 3 · .ret pre-anchor + perYear inference + numeric carry on equality · price-bound custom tokenised · fy latest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H4xn4fyH6QW4hXSmoibJFB"
```

---

### Task 6: Re-sweep (clean clone) · docs · rehearsal of the batch runner (scratch) · screenshots · DIST-PROOF · PR body

**Files:**
- Regenerate: `docs/superpowers/specs/2026-09-25-v3-migration-sweep.md`, `docs/superpowers/specs/2026-09-25-v3-migration-sweep.csv`
- Modify: `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` (§3 jsonc comment lines for `meta.sectorLine` / `verdict` / `legs[i].baseLabel` / `inputs.base`; §3.3 exit list + `evebitda`; §3.7 "เป้าที่วัดได้" → the measured numbers + a "ผลจริง" line; §10 item 4 — sweep after 4c-prep; §11 row "Plan 4c-prep" exit evidence), `docs/decisions.md` (new block "### Report v3 Plan 4c-prep — structural HUMAN classes + batch tooling (26 ก.ย. 69)" under §10), `docs/open-items.md` (#67 and #68 → the closed table with "ปิดแล้ว (Report v3 Plan 4c-prep)"; new rows only for residual classes 4c cannot absorb), `docs/price-refresh.md` (:122 — the `batch` runner line), `docs/templates.md` (:372 — new optional fields + `batch`)
- Create: `docs/superpowers/specs/assets/2026-09-26-4c-prep/*.png` (screenshots — acceptance evidence, spec §3.7)
- Scratch: `/Users/somchai.s/Downloads/stock-v3-plan4c-prep-scratch` (branch `scratch-plan4c-prep`), removed at the end · PR body: `<scratchpad>/pr-plan4c-prep-body.md`

- [ ] **Step 1: Re-sweep in a clean clone (analysis-px on)**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan4c-prep && git status --short | wc -l   # expect 0 (Tasks 1–5 committed)
HEADSHA=$(git rev-parse HEAD); CL=/tmp/p4cp-clone; rm -rf $CL
git clone --no-hardlinks --quiet /Users/somchai.s/Downloads/stock-v3-plan4c-prep $CL && git -C $CL checkout --quiet $HEADSHA
(cd $CL && rtk proxy node tools/migrate-v3.js sweep --out docs/superpowers/specs/2026-09-25-v3-migration-sweep 2>&1 | tail -4)
cp $CL/docs/superpowers/specs/2026-09-25-v3-migration-sweep.md $CL/docs/superpowers/specs/2026-09-25-v3-migration-sweep.csv docs/superpowers/specs/
awk -F, 'NR>1{print $3}' docs/superpowers/specs/2026-09-25-v3-migration-sweep.csv | sort | uniq -c
```
Expected: `sweep: 909 ใบ · CLEAN ≥11 · … · TEXT LOST ใน CLEAN 0` (exit 0), the md header shows `git describe` = `$HEADSHA` without `-dirty`. **Targets are expectations** (§3.7): CLEAN ≥ 11 · HUMAN ≈ 220–250. If CLEAN < 11, stop and report which docs left CLEAN and why (a regression, not a rounding of the target). If HUMAN is outside the band, record the real number and the top classes still holding docs — no rule is widened in this step. Also run the measurement harness against the clone (`stage1.js` → `stage2.js`, `ROOT=$CL`, analysis-px on) and keep its §1 class table for decisions/PR body (before = `measure-4c-prep.md` §1, after = this run).

Commit the artefacts:

```bash
git add docs/superpowers/specs/2026-09-25-v3-migration-sweep.md docs/superpowers/specs/2026-09-25-v3-migration-sweep.csv
git commit -m "docs(v3): Plan 4c-prep — sweep regenerated from $HEADSHA (clean clone · analysis-px): CLEAN <n> · VALUE-DRIFT <n> · HUMAN <n>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H4xn4fyH6QW4hXSmoibJFB"
```
(fill `<n>` from the awk output).

- [ ] **Step 2: Rehearsal — batch runner on the CLEAN rows in a scratch worktree (real reports · never pushed)**

```bash
S=/Users/somchai.s/Downloads/stock-v3-plan4c-prep-scratch
cd /Users/somchai.s/Downloads/stock-v3-plan4c-prep && git worktree add -b scratch-plan4c-prep "$S" HEAD >/dev/null && cd "$S"
export QUEUE_DIR="$S/.queue-scratch"; mkdir -p "$QUEUE_DIR"
git status --short reports.json | wc -l                                  # (0) expect 0
CSV=docs/superpowers/specs/2026-09-25-v3-migration-sweep.csv
{ head -1 $CSV; awk -F, 'NR>1 && $3=="CLEAN"' $CSV; } > /tmp/p4cp-clean.csv; N=$(($(wc -l < /tmp/p4cp-clean.csv) - 1)); echo "CLEAN rows $N"
node -e 'const m=JSON.parse(require("fs").readFileSync("reports.json"));const s=new Set(require("fs").readFileSync("/tmp/p4cp-clean.csv","utf8").trim().split("\n").slice(1).map(l=>l.split(",")[0]));for(const r of m)if(s.has(r.symbol))console.log(r.symbol,r.updated,r.hash)' > /tmp/p4cp-before.txt
# (1) refusal proof — a table that lies about one doc (first CLEAN row relabelled VALUE-DRIFT/fv-rounding) → that doc refused, nothing written for it
FIRST=$(awk -F, 'NR==2{print $1}' /tmp/p4cp-clean.csv)
{ head -1 /tmp/p4cp-clean.csv; awk -F, 'NR==2' /tmp/p4cp-clean.csv | sed -E 's/^([^,]+),([^,]+),CLEAN,/\1,\2,VALUE-DRIFT,/; s/,,([0-9.]+)$/,fv-rounding,\1/'; } > /tmp/p4cp-lie.csv
MIGRATE_V3_ALLOW_REAL=1 node tools/migrate-v3.js batch /tmp/p4cp-lie.csv --class fv-rounding --n 1 --model opus --no-push; echo "lie exit $?"   # expect 3
ls reports/$FIRST.*; git status --short reports | wc -l                    # expect only .html · 0
# (2) the real run — all CLEAN rows, one commit (≤50), verify once, no push
MIGRATE_V3_ALLOW_REAL=1 node tools/migrate-v3.js batch /tmp/p4cp-clean.csv --class CLEAN --n 1 --model opus --no-push; echo "batch exit $?"   # expect 0
git log -1 --format=%s; git show --stat HEAD | grep -cE "reports/.*\.(html|json)"                    # expect "migrate: v3 <N syms>" · 2N
# (3) updated invariant — build 2 + keepDates after the commit: no "updated" line changes
node tools/preserve-dates.js | tail -1; rtk proxy npm run build >/dev/null; git status --short reports.json | wc -l     # expect 0
node -e 'const m=JSON.parse(require("fs").readFileSync("reports.json"));const b=require("fs").readFileSync("/tmp/p4cp-before.txt","utf8").trim().split("\n").map(l=>l.split(" "));let bad=0;for(const [s,u] of b){const r=m.find(x=>x.symbol===s);if(!r||r.updated!==u){bad++;console.log("MOVED",s,u,r&&r.updated)}}console.log("updated moved:",bad)'   # expect 0
rtk proxy git diff HEAD~1 HEAD -- reports.json | grep -c '^[-+] *"updated"'                        # expect 0
# (4) a converted doc is refused on re-run
MIGRATE_V3_ALLOW_REAL=1 node tools/migrate-v3.js convert $FIRST; echo "exit $?"                     # expect "เป็นใบ v3 แล้ว" · 1
```
Record every value (N, symbols, exits, commit subject, stat count, "updated moved: 0", grep counts) for decisions.

- [ ] **Step 3: Screenshots (acceptance · still in the scratch worktree)**

Pick one doc per new visible element from the regenerated csv F-notes (`fNotes` count is in the csv; the reasons/F text is in the md tables): `meta.sectorLine` (F "gdots text → meta.sectorLine") · `verdict.extraCells` (F "s8 extra vcells") · `text.legendNote` (F "legend annotations"/"legend residue") · an 8-card grid (a doc whose `customCards` column ≥ 5 **and** total cards = 8 — prefer a non-HUMAN row; `awk -F, 'NR>1 && $11>=5{print $1,$3,$11}' $CSV | head`). Non-HUMAN docs: `MIGRATE_V3_ALLOW_REAL=1 node tools/migrate-v3.js convert <SYM> --write [--accept-drift]`. A HUMAN doc needed only for a picture: scratch-only writer (never on the branch):

```bash
MIGRATE_V3_ALLOW_REAL=1 node -e 'const M=require("./tools/migrate-v3.js"),IO=require("./tools/v3/io.js"),fs=require("fs"),path=require("path");const s=process.argv[1];const o={reportsDir:path.resolve("reports"),noStale:true,seeds:JSON.parse(fs.readFileSync("tools/seeds.json")),manifest:M.loadManifest(),stats:{apxMs:0}};const m=M.migrateOne(s,o);if(!m.doc)throw new Error(m.failed);IO.write(`reports/${s}.json`,m.doc);fs.unlinkSync(m.file);console.log(s,m.bucket)' <SYM>
```
Then `rtk proxy npm run build >/dev/null` and capture desktop + phone width per doc:

```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; OUT=/Users/somchai.s/Downloads/stock-v3-plan4c-prep/docs/superpowers/specs/assets/2026-09-26-4c-prep; mkdir -p "$OUT"
for S in <SECTOR_SYM> <VCELL_SYM> <LEGEND_SYM> <GRID8_SYM>; do
  "$CH" --headless=new --hide-scrollbars --screenshot="$OUT/$S-desktop.png" --window-size=1280,2600 "file://$PWD/dist/$S.html"
  "$CH" --headless=new --hide-scrollbars --screenshot="$OUT/$S-phone.png" --window-size=390,5200 "file://$PWD/dist/$S.html"
done; ls -la "$OUT"
```
If Chrome is missing or a shot is blank (the TA chart mounts lazily — memory `ta-chart-dev-workflow`), capture by hand: `npx wrangler dev` in the scratch worktree → open `http://localhost:8787/<SYM>.html` in a browser at 1280 px and at 390 px (device toolbar) → save PNGs under the same names; note "manual capture" in the PR body. Check each image shows the element (sectorLine under the tags · 4th legend span · extra vcells · 8 cards in the §1 grid on desktop and phone). Also one index card before/after for a migrated doc (spec §3.7 ฉ — the `(SYM)` name form): `dist/index.html` from the branch worktree (before) vs the scratch (after) at 1280 px, cropped by hand or captured whole.

Clean up (the PNGs live in the branch worktree already):

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan4c-prep && git worktree remove --force /Users/somchai.s/Downloads/stock-v3-plan4c-prep-scratch && git branch -D scratch-plan4c-prep && git status --short | grep -v 'specs/assets/2026-09-26-4c-prep' | wc -l   # expect 0
```

- [ ] **Step 4: Docs edits**

- **spec** — §3 jsonc: `"sectorLine": "…"` (meta · ≤100 · Plan 4c-prep), `"verdict": { "extraCells": [{ "k": "…", "v": "…" }] }` (≤2), `legs[i].inputs.base` + `legs[i].baseLabel` comments, `text.legendNote`; §3.3: exit list + `evebitda` (pairing), driver `ebitdaPerShare`; §3.7 "เป้าที่วัดได้": append "**ผลจริง (Task 6 · `<HEAD>`):** CLEAN n · VALUE-DRIFT n · HUMAN n (…)" and one line per D-pin that moved during implementation (none expected); §10 item 4: "ผล sweep หลัง 4c-prep" sentence with the three numbers, the driftClass split and "TEXT LOST ใน CLEAN 0"; §11 row "Plan 4c-prep": exit evidence (sweep numbers · DIST IDENTICAL · rehearsal N CLEAN docs one commit · refusal proven · screenshots path).
- **decisions** — the block: D1–D6 one line each (pointing to spec §3.7) · the sweep before/after (4b `1772355cd`: 11/426/472 → this head) and the class table from the harness · rehearsal values (Step 2) · DIST-PROOF (Step 5) · review trail (filled by the controller after reviews) · the ambiguities resolved in this plan (see Self-review "Resolved ambiguities").
- **open-items** — move #67 and #68 to "ปิดแล้ว" (#67: `IO.prepatchHash` · freshHash unchanged; #68: series rule + window list, BDMS `author` / TRMB `FY2021–FY2023, FY2025` in the sweep); add rows only for residual classes that neither 4c nor the existing items track (e.g. "growth/driver prose — re-analysis wave (4c-residual)" if not already listed; each row names its docs count from the new sweep).
- **price-refresh.md** :122 — append: "· แบตช์: `MIGRATE_V3_ALLOW_REAL=1 node tools/migrate-v3.js batch <ตารางที่อนุมัติ.csv> --class CLEAN|<driftClass…> --n <push ทุก N commit> --model sonnet|opus [--no-push] [--dry-run]` — migrate ใหม่ทุกใบตอนแบตช์ · ใบที่ bucket/driftClass ต่างจากแถว = ปฏิเสธ (exit 3) · CLEAN ≤50 ใบ/commit · VALUE-DRIFT 1 ใบ/commit · verify ครั้งเดียวก่อน push".
- **templates.md** :372 — append the new optional fields (`meta.sectorLine` · `verdict.extraCells` · `text.legendNote` · `inputs.base` + `baseLabel` · `ffoBasis` coreFfo · driver `ebitdaPerShare` / exit `evebitda` · custom ≤8 on migrated docs) and "แบตช์ = `migrate-v3.js batch`".
- **CLAUDE.md / SKILL** — no edit; prove byte-identity of the §9 "ใบ v3" bullet:

```bash
diff <(grep -m1 '^- \*\*ใบ v3 (`reports/\*\.json`' CLAUDE.md) <(grep -m1 '^- \*\*ใบ v3 (`reports/\*\.json`' .claude/skills/stock-controller/SKILL.md) && echo BYTE-IDENTICAL
node tools/gen-docs.js --check && node test/docs-test.js; echo "docs exit $?"
```
Expected: `BYTE-IDENTICAL` · docs exit 0.

- [ ] **Step 5: Full gate + DIST-PROOF**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan4c-prep
rtk proxy npm run verify > /tmp/p4cp-verify.log 2>&1; echo "verify exit $?"; tail -3 /tmp/p4cp-verify.log
GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js > /tmp/p4cp-v3-hook.log 2>&1; echo "v3 under hook env $?"; grep -E "✗|^[✓✗]" /tmp/p4cp-v3-hook.log
BASE=992a65b35; HEADSHA=$(git rev-parse HEAD); rm -rf /tmp/p4cp-base /tmp/p4cp-head && mkdir -p /tmp/p4cp-base /tmp/p4cp-head
git archive $BASE | tar -x -C /tmp/p4cp-base && git archive $HEADSHA | tar -x -C /tmp/p4cp-head
(cd /tmp/p4cp-base && rtk proxy npm run build >/dev/null 2>&1); (cd /tmp/p4cp-head && rtk proxy npm run build >/dev/null 2>&1)
rtk proxy diff -rq /tmp/p4cp-base/dist /tmp/p4cp-head/dist; echo "dist diff exit $?"
shasum -a 256 /tmp/p4cp-head/dist/OGE.html /tmp/p4cp-head/dist/ICC.html; find /tmp/p4cp-head/dist -type f | wc -l
git diff --stat $BASE HEAD -- reports reports.json tags.json tools/seeds.json price-flags.json | wc -l
```
Expected: verify exit 0 · every v3 file `✓` under the hook env · no `diff` output, exit 0 (**DIST IDENTICAL**) · the two pinned sha256 · file count recorded · `0`.

- [ ] **Step 6: PR body** — write `<scratchpad>/pr-plan4c-prep-body.md` (same structure as the 4b body): *what changes on the live site* = nothing (no `reports/` change · DIST IDENTICAL, file count) · design pins D1–D6 · code by task · the sweep before → after table (CLEAN · VALUE-DRIFT by driftClass · HUMAN) and the class table (before = measure §1, after = the harness on the clean clone) · **the honest residual**: HUMAN = n, top reasons with counts (TEXT LOST s3/s6 words still lost, E52 18, analyst-fv 17, fv<2 15, growth prose ~16, era 6, sources 5, columns ≠ 3 1 …) · rehearsal evidence (Step 2) · screenshots (relative links to `docs/superpowers/specs/assets/2026-09-26-4c-prep/*.png`, desktop + phone per element, 8-card grid, index card before/after) · **re-analysis wave cost estimate** for the residual (the one question for the owner): `HUMAN residual n × per-stock cost`, per-stock from memory `token-usage-benchmarks` — a full UPDATE after earnings measured 19.4 turns / 1.56 M cacheR per stock (wave 2 ส.ค. 69, n = 7, Sonnet; range 20–40 turns for a full UPDATE) and UPDATE-LIGHT 11–13 turns / ~0.7 M; controller overhead 4–5 turns per stock; state that this wave runs Opus workers (v3 mandate) so the Sonnet figures are a floor, give the low/high totals (n × 16 t / n × 40 t · n × 1.0 M / n × 1.6 M cacheR) and the ordering (analyst-fv / fv<2 ≈ 33 docs first, spec §11 row 4c-residual) · merge gate reminder (4c batches wait for the three clean cron runs closing #62; this PR itself is not gated by cron) · diff stat. Ends with the harness attribution line required by the session. (Opening the PR — `gh pr create --repo iam1412/stock-analysis --base main --head feat/report-v3-plan4c-prep --title "Report v3 — Plan 4c-prep: structural HUMAN classes + batch tooling (no production change)" --body-file <path>` — is a controller step after the final whole-branch review and the advisor's pre-merge approval.)

- [ ] **Step 7: Commit docs + proofs**

```bash
git add docs/ 
git commit -m "docs(v3): Plan 4c-prep — spec §3/§3.3/§3.7/§10/§11 · decisions (D1–D6 · sweep · rehearsal · DIST-PROOF) · open-items #67 #68 closed · price-refresh/templates batch runner · screenshots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H4xn4fyH6QW4hXSmoibJFB"
```

---

## Self-review

**Spec coverage (§3.7 item → task):**
- ก `ffoBasis 'coreFfo'` → T2 (schema/render/cards/check-v3 label map) · T5 (`ffoBasisOf` sets `affo`/`coreFfo` from wording).
- ก `driver 'ebitdaPerShare'` · `exitMetric 'evebitda'` + pairing → T2 (schema, `driverStart`, `exitTarget`, labels) · T5 (`DRIVER`/`EXIT` mapping incl. EV/Revenue ≡ evsales).
- ก `legs[i].inputs.base` + `override.epsForward` + `baseLabel` ≤ 24 (leg level) → T2 (schema, `withBase`/`legValueOf`, render label) · T5 (`baseOf` for the forward/FY-labelled bases — 17 strict + 95 "EPS ปรับ" legs).
- ข `meta.sectorLine` → T3 (schema/render) · T5 (`sectorLineOf`) · T4 (gdots ruling corrected).
- ข `verdict.extraCells` → T3 · T4 (s8 normaliser) · T5 (`extraCellsOf`).
- ข `text.legendNote` → T3 · T5 (`legendNoteOf`).
- ข `cases[i].retNote` pre-anchor words · `perYear` inference · numeric `.ret` on equality → T5 (`retParts`/`perYearOf`/`retResolve`) · T4 (`total`/`ต่อปี` synonyms).
- ข `legs[i].label` ≤ 80 migrated-only → T2 (schema) · T5 (overflow → note).
- ข `qualifierOf` round 3 · price-bound custom tokenise · first-tag parse · fy latest → T5.
- ค `SYNONYM_VOCAB` (every listed pair, guard per entry, no fact words) · s6 `TEMPLATE_COUNTED` · alignment with one label function → T4.
- ง cap 8 migrated-only (+ reversal line) → T1 · screenshots of an 8-card page → T6.
- จ residual policy → D5 (nothing parses prose into numbers; `EBITDA margin 6.2%` keeps growth unreadable) · PR body residual list → T6.
- ฉ #67 → T1 (`prepatchHash`) · #68 → T1 · batch runner → T1, rehearsed T6 · "no reports.json rounding/renaming" → D6 (not implemented; index before/after screenshot T6).
- เป้าที่วัดได้ → T6 Step 1 (expectations, recorded) · §10/§11/§13-1 → T6 docs + `commitGroups` (CLEAN 50 · drift 1).

**Type consistency:** `S.customCap(doc)` (T1) used by `validate` and `setMetrics` · `S.FFO_LABEL` (T2) used by render `ffoLabel`, `cards.js ffoL`, `check-v3.js ffoL`, `synonyms.js` guard (T4) · `C.withBase(leg, f, path)` / `C.legValueOf(leg, f, path)` (T2) used by `prepLeg`, render `mdesc`, assemble `guardLegs`/`weightsOf` · `A.labelParts(mname) → {label, ctx, reason}` (T4) used by assemble `legsOf` (T5) and equiv alignment (T4) · `SY.apply(role, tokens, g) → {tokens, used}` (T4) used by equiv (T4) and by `qualifierOf`/`retNoteOf` to skip synonym words (T5) · `NB.classifyNumber` (T4 move) used by equiv and `MS.retResolve` (T5) · `BT.runBatch(rows, opts, deps) → {commits, refused, pushes, code}` (T1) wrapped by `M.runBatchCli` · `IO.prepatchHash` (T1) used by `Sh.v3HashPair` · `Sh.shipMigrate(…, {skipVerify})` (T1) called by the runner only with `noPush: true` · the sweep csv columns `RP.COLS` are the batch table format (no new format).

**Resolved ambiguities (recorded in decisions, T6):**
1. `legs[i].label` already exists and is required (schema.js:265, taken from the author's `.mname` by `A.labelOf`); "label ≤ 80 · migrated-only" is implemented as a length bound on migrated docs only — NEW docs unchanged.
2. #67 "aiModel into freshHash" vs "keep `updated` semantics": `freshHash` is left as is (changing it would restamp OGE/ICC and every migrated doc); `ship --prepatch` uses a separate `IO.prepatchHash` that includes `meta.aiModel` — this satisfies both clauses of the ruling.
3. `verdict.extraCells` needs a new optional top-level object `verdict` (the schema had no `verdict` key); added to the closed top-level list, `io.js TOP_ORDER` and assemble's `order`.
4. `scenarios.perYear` is an enum (`'cagr'|'linear'|null`), not a boolean — "inferred true" = `'cagr'` (default) or `'linear'` when every printed per-year figure matches linear and not cagr; the unit word `ต่อปี ≡ ปี` is added to `SYNONYM_VOCAB` (guard: `perYear` non-null) because the inference would otherwise leave that word lost.
5. The pre-anchor `.ret` words: `total|Total|รวม` are synonyms of the v3 total (not carried); every other pre-anchor word is carried in `retNote` (rendered after the figure — order changes, words kept); the batch runner's "verify once per push" is realised by `ship --migrate … skipVerify` (only with `--no-push`) plus one `npm run verify` at each push point (and once at the end under `--no-push`).
