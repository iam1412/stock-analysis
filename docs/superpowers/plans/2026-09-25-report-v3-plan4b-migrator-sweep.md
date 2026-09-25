# Report v3 — Plan 4b: `migrate-v3.js` + read-only sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v2 → v3 migrator (`tools/migrate-v3.js` + `tools/migrate-v3/*`), the per-zone equivalence gate that decides CLEAN / VALUE-DRIFT / HUMAN, the `updated`-preserving mechanism (`meta.migratedFrom`), the schema gaps the sweep needs (N-stage DCF, card keys, enums, nullable rating, tone `none`), and the queue changes for v3 pre-patch / `ship --migrate` — then run the migrator **read-only** over all 909 v2 reports and commit the 3-bucket sweep table as a docs file. **No file under `reports/` is written or deleted in this PR; `dist/` at the final head is byte-identical to the merge-base.** Plan 4c consumes the sweep and runs the batches.

**Architecture:** One folder `tools/migrate-v3/` (deleted at P7 cutover) holds the pipeline `parse-v2 → legs → assemble (cards · prose · scenarios · theme) → equiv → buckets`, driven by the CLI `tools/migrate-v3.js sweep|convert`. The parser is the existing v2 locator set (`report-meta`, `report-values`, `derived-values.CARD_SRC`, `footer-date`) productionised from the Plan 4 Task 0 prototypes; every number in the assembled doc is an **author input** (multiple, g, r, exit multiple) — outputs are recomputed by `tools/v3/compute.js` and never back-solved. The equivalence gate compares `expandReport(v2 raw)` with `expandReport(toV2Source(doc, view))` zone by zone at word level, applies a **closed** template-transform vocabulary, then checks page-level word containment so a word that disappears anywhere (including a token-bearing cell the migrator writes) is TEXT LOST = HUMAN. `build.js` learns one rule: a v3 doc carrying `meta.migratedFrom {updated, v2Hash}` keeps `updated` when the committed manifest row still has the v2 hash. Queue changes close open-items 66 (automatic v3 pre-patch, `ship --prepatch` accepts market-only `.json`, `ship <SYM>` adds the deleted `.html`, new `ship --migrate`).

**Tech Stack:** Node ≥20.19, no dependencies. Tests: `test/v3/*.test.js` (`_t.js` harness, auto-collected by `test/v3-test.js`), `test/queue-test.js` (`ok()`), `test/build-test.js`, `test/docs-test.js`, `node tools/gen-docs.js --check`. Git read-only (`git show HEAD:…`, `git log -S`) inside the migrator.

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` §3.1 (legs), §3.3 (scenarios · exitMultiple not back-solved), §3.6 (extensions), §8 (`updated` invariant — mechanism chosen here), §10 (migration: buckets, PROSE-LIT, equivalence gate, colour, schema gaps), §11 row "Plan 4b", §13 items 1/3/4/5/6. Discovery: `/Users/somchai.s/Downloads/stock/.superpowers/sdd/archive/plan4a/task0/` (git-excluded; `findings-migration.md`, `classify.csv`, `proto/*.js` — the prototypes this plan productionises; read-only for implementers, copy then edit).

## Global Constraints

- Worktree `/Users/somchai.s/Downloads/stock-v3-plan4b`, branch `feat/report-v3-plan4b` from `main` 6e7b6e3c0. One PR. Task 9's rehearsal uses a throwaway scratch worktree `/Users/somchai.s/Downloads/stock-v3-plan4b-scratch` (branch `scratch-plan4b`), removed at the end of Task 9.
- **No production change:** nothing under `reports/` is written, deleted or committed; `tags.json`, `tools/seeds.json`, `price-flags.json`, `reports.json` unchanged; `dist/` byte-identical to the merge-base (Task 9 DIST-PROOF). The sweep (`migrate-v3.js sweep`) is read-only on `reports/`; `convert --write` in this PR runs only against a `--reports-dir` under `os.tmpdir()` (tests) or the scratch worktree (Task 9).
- **Inputs are the author's values; outputs are recomputed** (spec §10.1/§3.3): `fvWeights` only when the printed scheme (equal · family) reproduces FV within rounding, otherwise `null` and the FV moves → VALUE-DRIFT; `exitMultiple` = the printed value (± half unit of its printed decimals); never solve for a multiple/weight to reproduce an old output.
- **Never mask a written region** (spec §10.2 d): the gate diffs every zone including `.ret`/`.tgt`/`.mval`; the `.ret` self-test (Task 6) must fail if anyone blanks a region before comparing.
- **Migrator writes only through `tools/v3/io.js`** (`IO.write`) and deletes the `.html` with `fs.unlinkSync` in the same call; never `fs.writeFileSync` a report.
- **All commits** carry `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` plus the harness attribution lines; one commit per task (Task 7 = two: code, then the sweep artefacts).
- **Docs gate:** after every docs edit run `node tools/gen-docs.js --check` and `node test/docs-test.js`; never write a step count ("N ขั้น") outside a `<!-- gen: -->` marker. The `CLAUDE.md` §9 bullet "ใบ v3" is a verbatim copy of `.claude/skills/stock-controller/SKILL.md` §9 bullet "ใบ v3" — edit both identically.
- **Exact output:** `rtk proxy <cmd>` when counting or comparing output; check `${PIPESTATUS[0]}`, not the exit of `| tail`.
- **Tests never touch** the real `reports/`, `.work/`, `.queue/`: `QUEUE_DIR` env for queue state, `--reports-dir/--work-dir` for CLIs, `fs.mkdtempSync` dirs for migrator output. Any temp git repo must scrub `GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_PREFIX GIT_OBJECT_DIRECTORY` from `env` first (see `test/v3/scanners-cron.test.js` `cleanEnv`) and use `-c core.hooksPath=/dev/null`.
- Never loosen an existing assertion; replacing a pinned behaviour (v3 skip in `patchTargets`, `.json` = foreign in `prepatchBlockers`, `v3Lines`) means replacing its test with the new behaviour's test in the same commit.
- Implementer never pushes, never calls `advisor`, never spawns subagents.
- `card-census.js` currently runs its sweep at `require` time — Task 1 must make it a module (`require.main === module` guard) before anything imports it.

## Design pins (decided with the advisor 25 ก.ย. 69 — executors do not reopen these)

- **D1 `updated`/freshHash = `meta.migratedFrom { updated, v2Hash }`** (spec §8): the migrator writes `updated` = the committed `reports.json` row (`git show HEAD:reports.json`, not the working-tree file) and `v2Hash` = `build.freshHash(rawV2Html)` (the exported function, no reimplementation). `build.js` rule: `updated = old && old.hash === h && old.updated ? old.updated : (mf && old && old.hash === mf.v2Hash ? mf.updated : nowISO)`. After the first build records the v3 hash the field is inert; a later real UPDATE changes the v3 hash and `old.hash ≠ v2Hash` ⇒ stamps now (correct). `preserve-dates.js` is unchanged (it skips v3; a deleted `.html` has no working-tree footer). Rejected: preserve-dates migration mode (needs `HEAD:reports/<SYM>.html` at restore time — breaks on split commits, scratch checkouts, Cloudflare's build). Gate = Task 3 unit test on the pure rule + Task 9 two-build + `keepDates` rehearsal on a real report in the scratch worktree.
- **D2 equivalence gate** (spec §10.2): both sides are `expandReport(...)` pages (v2 raw source · v3 `toV2Source`), so the skeleton aligns and zones are located by the same regexes on both. Zones: `header`, `s1`…`s8` (by `<div class="n">N</div>`), `disc`, `footer`, `extra:<i>`. Per zone: word-level LCS diff → runs classified `number` / `symbol` / `text added` / `text changed` / `TEXT LOST`. **Order:** (1) approved transforms first — a zone-specific normaliser applied to *both* sides (drop emoji · `≈`→`ณ` · h1 "(SYM)" · strip catalogue-card `.k/.d` · strip computed-leg `.mname/.mdesc` · strip FV-box/hint/analyst-cell/footer/disclaimer fixed sentences) plus the closed word set `TEMPLATE_VOCAB`; (2) residual v2-side words are checked by page-level containment (word appears anywhere in the v3 page ⇒ `moved`, not lost); (3) what remains is **TEXT LOST ⇒ HUMAN**. Numbers: a `number` run is `rounding` when both sides agree within half a unit of the printed decimals, else `value` ⇒ VALUE-DRIFT row. Alongside the text diff a **structured diff** of `report-data`/`stock-meta` (`fv`, `values.*`, `chart.min/max/grid/highlight`, `gauge.min/max`, `sm.pe/dividendYield/mos/upside`) produces its own VALUE-DRIFT rows (these move the engine's drawing but are invisible to the text compare). Colour: `view.theme` vs v2 `report-data.theme` per key rgbDist ≤ 12 (else `themeLegacy` must have been set — identical by construction; `SV.colorOK` failure ⇒ HUMAN); badge / gauge dots / `.chg` / card tone = approved transforms, counted as info.
- **D3 prose tokenisation:** a literal is replaced by a token only when (a) its bare form equals the token's rendered form exactly (`P.priceBound(view)` + the new fundamentals tokens) — no visible change; or (b) it sits under a price-bound label (`RV.PROSE_BOUND` hit → token named by the hit) — visible change recorded as a VALUE-DRIFT row `prose:<field> <literal> → {{token}}`. Unlabelled stale copies (value equals the analysis-date price/P/E/MOS/upside from `git log -S` on the footer string) stay literal, are counted as `proseStale` and make the report VALUE-DRIFT (spec §10.1 PROSE-LIT a). `{{rd:x}}` → `TK.V2_TWIN` inverse; `{{rd:scnNote}}`/`{{rd:mosClass}}`/`{{rd:pxNum}}` (template-only tokens) are dropped from author text. New tokens (Task 1): `eps` `dps` `bvps` `epsFy` `analyst.vsFv`.
- **D4 N-stage DCF** (spec §13-3): `legs[i].inputs.stages: [{ years, g }]` (1–10 stages, Σyears ≤ 40) is an alternative to `g1 + years1` — exactly one of the two; terminal Gordon after the last stage; `stages:[{years: years1, g: g1}]` gives the 2-stage value to 1e-9. Linear fades and per-year lists become 1-year stages. `scenarios.exitDp` (0–2) controls how `exitMultiple` prints; absent = today's raw print.
- **D5 buckets:** `HUMAN` if any of: analyst-target leg with `role:'fv'` · fv legs < 2 (§13-4) · FV outside the fv-leg value range (weights unsolvable) · TEXT LOST > 0 · custom cards > 4 · `meta.sources` < 3 · scenario driver/exit outside the enum · footer era ≠ `values.dateEra` · an extra section that is not a `<table>` · header tags > 3 · assembled doc fails `checkDoc(stage:'save')` (any E-code) · `<meta ai-model>` missing/unparseable · theme key fails `SV.colorOK`. Else `VALUE-DRIFT` if any D-row exists (FV/leg/scenario/card value beyond printed rounding · index P/E shift > 2% · index yield shift > 0.05 pp · `proseStale` > 0 · labelled literal → token with a different value · structured rd/sm diff). Else `CLEAN`. Format-only changes (2dp leg values, "~" prefixes, 1dp → 2dp yield) are `F` notes, never a bucket change. **`gauge.{min,max}` rd rows are format-only (ruling 25 ก.ย. 69 after the Task 6 sweep — v3 derives the bounds from fv/px in `compute.js` and cron already rescales v2 gauges): reported in `rdRows`, never a `VALUE-DRIFT` reason.** Sweep result (Task 6, 909 reports): CLEAN 0 · VALUE-DRIFT 487 · HUMAN 422 — authors rounded FV/targets, v3 recomputes from legs (43.00 → 42.75 is a visible number, i.e. the spec's VALUE-DRIFT class); Task 0's 290 CLEAN used its own bucket definition without the structured rd diff — record the delta in `docs/decisions.md` (Task 9). 4c batching policy for ~500 VALUE-DRIFT docs = owner decision (surface in decisions.md §10 + PR body), not a 4b change.

## Review Focus

1. **A v2 report whose `.vmethod` block is an empty shell** (23 of 2075 in the corpus — measured in Task 4 review: all 23 have NO `mname`: 20 bare `<div class="vmethod"></div>`, 3 unclosed shells wrapping `.fv-box` (APH COO HUBB)) — the parser must not throw; a shell without `mname` is dropped and only `legBlocks` counts it (Task 5 adds an F note when `legBlocks > legs.length`); a shell WITH an `mname` but no `mdesc`/`mval` is returned with `mval: null, empty: true` and routed to HUMAN (`leg unparsed`). Tests in Task 4 (both shapes).
2. **A `.json` under `reports/` in `ship --prepatch` whose HEAD and worktree `freshHash` differ** (a worker's UPDATE, not a pre-patch) — must be `blocked`, never swept into a `price:` commit. Test in Task 8 (`prepatchBlockers` entry with `v3:true, headHash ≠ workHash`).
3. **`convert --write` on a HUMAN report** — must refuse before writing or deleting anything; `--accept-drift` must not override HUMAN. Test in Task 7 (AAPL-v2 fixture → analyst leg → HUMAN → `.html` still present, no `.json`).
4. **A migrated doc whose committed manifest row has already moved to the v3 hash, then a real UPDATE** — `updatedFor` must stamp now (not keep `migratedFrom.updated`). Test in Task 3.
5. **The gate on a page where the migrator moved a paragraph to another zone** (FER-style extras) — must report `moved`, not TEXT LOST; and on a page where a word inside a `.ret` cell disappeared — must report TEXT LOST. Both in Task 6 (`.ret` self-test + moved-paragraph case).

---

### Task 1: Schema gaps · card catalogue + census fixes · enums · new tokens · nullable rating · tone `none`

**Files:**
- Modify: `tools/v3/schema.js` (ENUM, CARD_KEYS, FUND_NUM, headerTags, analyst.rating, tone), `tools/v3/cards.js` (6 catalogue entries + `ptbvCalc`), `tools/v3/card-census.js` (module + RULES fixes + `cardKey`), `tools/v3/tokens.js` (5 tokens), `tools/v3/prose.js` (`priceBound` + ptbv), `tools/v3/compute.js` (`driverStart` de/fre · evsales exit), `_template/v3/render.js` (drv/ex maps · rating null · tone none)
- Test: `test/v3/schema.test.js`, `test/v3/cards.test.js`, `test/v3/compute.test.js`, `test/v3/render.test.js`, `test/v3/tokens.test.js` (new), `test/v3/card-census.test.js` (new)

**Interfaces:**
- Consumes: `S.ENUM`, `S.CARD_KEYS`, `K.CATALOGUE` (cards.test pins `Object.keys(K.CATALOGUE) == S.CARD_KEYS`), `TK.TOKENS_V3`, `RV.TOKENS`, `view.d` (`RV.derive` bridge).
- Produces: `S.ENUM.tone` includes `'none'`; `S.ENUM.driver` includes `'de','fre'`; `S.ENUM.exitMetric` includes `'evsales'`; `S.CARD_KEYS` += `occupancy netDebtEbitda backlog payout aum ptbv`; `FUND_NUM` += `occupancy backlog aum tbvps dePerShare frePerShare`; `meta.headerTags` max 3; `analyst.rating` nullable (`null` allowed, key still required); `CC.RULES` + `CC.cardKey(label) → key|null` exported from `card-census.js`; `TK.TOKENS_V3.eps/dps/bvps/epsFy/['analyst.vsFv']`; `K.ptbvCalc(view) → {raw, text}`; `compute` handles `exitMetric:'evsales'` (`tgt = end × m − netDebt/shares`, statement currency → quote via `fq`) and `driver:'de'|'fre'` (`fundamentals.dePerShare/frePerShare`); render prints `DE/หุ้น`, `FRE/หุ้น`, `EV/Sales ออก`, analyst cell without rating, tone `none` ⇒ no class.

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js` — append (the file builds docs from `test/fixtures/v3/ZTS.json`; reuse its `load()`/`errsOf()` helpers — check their names with `rtk proxy grep -n "^const \|^function " test/v3/schema.test.js | head -20` and adapt the two helper names below to what exists):

```js
// Plan 4b Task 1 — schema gaps the sweep needs (spec §10 "ช่องว่าง schema ที่ 4b ต้องปิด")
{
  const d = load();
  d.metrics.cards = [{ key: 'pe', tone: 'none' }].concat(d.metrics.cards.filter((c) => c !== 'pe' && !(c && c.key === 'pe')));
  t.eq(errsOf(d).filter((e) => /tone/.test(e.path)), [], 'tone "none" accepted (466 v2 cards have no class)');
  d.metrics.cards[0].tone = 'loud';
  t(errsOf(d).some((e) => e.path === 'metrics.cards[0].tone'), 'unknown tone still rejected');
}
{
  const d = load(); d.analyst = { target: 80, n: null, rating: null, asOf: null };
  t.eq(errsOf(d).filter((e) => /analyst/.test(e.path)), [], 'analyst.rating null accepted (114 v2 reports print no rating)');
  delete d.analyst.rating;
  t(errsOf(d).some((e) => e.path === 'analyst.rating'), 'analyst.rating key still required (closed object)');
}
{
  const d = load(); d.meta.headerTags = ['a', 'b', 'c'];
  t.eq(errsOf(d).filter((e) => /headerTags/.test(e.path)), [], 'headerTags max 3 (ADR/dual listing)');
  d.meta.headerTags = ['a', 'b', 'c', 'd'];
  t(errsOf(d).some((e) => e.path === 'meta.headerTags'), 'headerTags 4 rejected');
}
{
  const d = load(); d.scenarios.driver = 'de'; d.scenarios.exitMetric = 'evsales'; d.fundamentals.dePerShare = 4.2;
  t.eq(errsOf(d).filter((e) => /scenarios\.(driver|exitMetric)|dePerShare/.test(e.path)), [], 'driver de + exitMetric evsales + fundamentals.dePerShare accepted');
  d.fundamentals.occupancy = 94.1; d.fundamentals.backlog = 1.2e9; d.fundamentals.aum = 3e11; d.fundamentals.tbvps = 40.5; d.fundamentals.frePerShare = 1.1;
  t.eq(errsOf(d).filter((e) => /fundamentals\.(occupancy|backlog|aum|tbvps|frePerShare)/.test(e.path)), [], 'new fundamentals keys accepted');
  d.metrics.cards = ['occupancy', 'netDebtEbitda', 'backlog', 'payout', 'aum', 'ptbv'];
  t.eq(errsOf(d).filter((e) => /metrics\.cards/.test(e.path)), [], 'six new catalogue keys accepted');
}
```

`test/v3/cards.test.js` — append (the file has a `view` built from ZTS; reuse it):

```js
// Plan 4b Task 1 — six catalogue keys (Task 0 Q3: Net Debt/EBITDA 16 · Occupancy 14 · Backlog 12 · Payout 10 · AUM 8 · P/TBV 7)
{
  const f = { ...view.doc.fundamentals, occupancy: 94.12, backlog: 1.25e9, aum: 3.1e11, tbvps: 40.5, dps: 2.12, eps: 6.13, netDebt: 7.84e9, ebitda: 3.2e9 };
  const w = { ...view, doc: { ...view.doc, fundamentals: f }, fq: f };
  t.eq(K.renderCard('occupancy', w).v, '94.1%', 'occupancy = pct1(fundamentals.occupancy)');
  t.eq(K.renderCard('netDebtEbitda', w).v, (7.84e9 / 3.2e9).toFixed(1) + 'x', 'netDebtEbitda = netDebt ÷ ebitda (statement currency ratio)');
  t.eq(K.renderCard('backlog', w).v, RV.fmtBig(1.25e9, w.stmtCur || w.cur), 'backlog = statement-currency big number');
  t.eq(K.renderCard('payout', w).v, (2.12 / 6.13 * 100).toFixed(1) + '%', 'payout = dps ÷ eps');
  t.eq(K.renderCard('aum', w).v, RV.fmtBig(3.1e11, w.stmtCur || w.cur), 'aum = statement-currency big number');
  t.eq(K.renderCard('ptbv', w).v, (w.d.px / 40.5).toFixed(2) + 'x', 'ptbv = px ÷ tbvps (price-bound)');
  t.eq(K.ptbvCalc(w).text, (w.d.px / 40.5).toFixed(2) + 'x', 'ptbvCalc text = card text (single owner)');
  t.throws(() => K.renderCard('payout', { ...w, doc: { ...w.doc, fundamentals: { ...f, eps: -1 } }, fq: { ...f, eps: -1 } }), /payout/, 'payout with eps ≤ 0 → named throw');
  t.throws(() => K.renderCard('netDebtEbitda', { ...w, doc: { ...w.doc, fundamentals: { ...f, ebitda: 0 } }, fq: { ...f, ebitda: 0 } }), /ebitda/, 'netDebtEbitda with ebitda ≤ 0 → named throw');
}
```

`test/v3/card-census.test.js` — new file:

```js
'use strict';
const t = require('./_t.js')('card-census');
const CC = require('../../tools/v3/card-census.js');
t(Array.isArray(CC.RULES) && typeof CC.cardKey === 'function', 'card-census exports RULES + cardKey (module, no sweep at require time)');
// Task 0 Q3 — three rule-order bugs
t.eq(CC.cardKey('อัตรากำไรสุทธิ'), 'netMargin', 'margin label → netMargin (was netIncome ×45)');
t.eq(CC.cardKey('Net margin'), 'netMargin', 'Net margin → netMargin');
t.eq(CC.cardKey('P/E มัธยฐาน 5 ปี'), 'peAvg5y', 'median P/E → peAvg5y (was pe ×57)');
t.eq(CC.cardKey('P/E ย้อนหลัง 10 ปี'), 'peAvg5y', 'historical P/E → peAvg5y');
t.eq(CC.cardKey('GAAP EPS (TTM)'), 'eps', 'GAAP EPS → eps (was unmatched ×20)');
t.eq(CC.cardKey('Adj. EPS'), 'eps', 'Adj. EPS → eps');
t.eq(CC.cardKey('EPS FY2026E (consensus)'), null, 'forward EPS label stays unmapped (no card key)');
// six new keys — specific before broad
t.eq(CC.cardKey('Net Debt / EBITDA'), 'netDebtEbitda', 'Net Debt/EBITDA → netDebtEbitda (not netDebt)');
t.eq(CC.cardKey('หนี้สินสุทธิ (Net Debt)'), 'netDebt', 'Net Debt alone → netDebt');
t.eq(CC.cardKey('Occupancy'), 'occupancy', 'Occupancy → occupancy');
t.eq(CC.cardKey('อัตราการเช่า'), 'occupancy', 'อัตราการเช่า → occupancy');
t.eq(CC.cardKey('Backlog'), 'backlog', 'Backlog → backlog');
t.eq(CC.cardKey('Payout Ratio'), 'payout', 'Payout → payout (before yield rule)');
t.eq(CC.cardKey('เงินปันผล'), 'yield', 'ปันผล → yield still');
t.eq(CC.cardKey('AUM'), 'aum', 'AUM → aum');
t.eq(CC.cardKey('P/TBV'), 'ptbv', 'P/TBV → ptbv (before pbv rule)');
t.eq(CC.cardKey('P/BV'), 'pbv', 'P/BV → pbv still');
t.eq(CC.cardKey('P/E (TTM)'), 'pe', 'plain P/E → pe still');
t.done();
```

`test/v3/tokens.test.js` — new file:

```js
'use strict';
const t = require('./_t.js')('tokens');
const path = require('path');
const IO = require('../../tools/v3/io.js');
const C = require('../../tools/v3/compute.js');
const P = require('../../tools/v3/prose.js');
const TK = require('../../tools/v3/tokens.js');
const RV = require('../../tools/report-values.js');
const SEEDS = require('../../tools/seeds.json');
const doc = IO.read(path.join(__dirname, '../fixtures/v3/ZTS.json'));
const view = C.compute(doc, { seeds: SEEDS });
const f = doc.fundamentals;
t.eq(TK.TOKENS_V3.eps(view), view.cur + RV.fmtPrice(f.eps), '{{eps}} = money(fundamentals.eps)');
t.eq(TK.TOKENS_V3.dps(view), view.cur + RV.fmtPrice(f.dps), '{{dps}} = money(fundamentals.dps)');
t.eq(TK.TOKENS_V3.bvps(view), view.cur + RV.fmtPrice(f.bvps), '{{bvps}} = money(fundamentals.bvps)');
t.eq(TK.TOKENS_V3.epsFy(view), view.cur + RV.fmtPrice(f.fy.eps), '{{epsFy}} = money(fundamentals.fy.eps)');
const vs = (doc.analyst.target - view.fv) / view.fv * 100;
t.eq(TK.TOKENS_V3['analyst.vsFv'](view), (vs < 0 ? '−' : '+') + Math.abs(vs).toFixed(1) + '%', '{{analyst.vsFv}} = (target − FV)/FV, 1dp, U+2212 for negative');
t.throws(() => TK.TOKENS_V3.epsFy({ ...view, doc: { ...doc, fundamentals: { ...f, fy: undefined } } }), /epsFy/, 'epsFy without fundamentals.fy → named throw');
t.throws(() => TK.TOKENS_V3['analyst.vsFv']({ ...view, doc: { ...doc, analyst: null } }), /analyst/, 'analyst.vsFv without analyst → named throw');
t.eq(P.renderProse('EPS {{eps}} · DPS {{dps}}', view), `EPS ${TK.TOKENS_V3.eps(view)} · DPS ${TK.TOKENS_V3.dps(view)}`, 'renderProse resolves the new tokens');
t(P.renderProse('{{eps}}', view, { mode: 'v2src' }) === TK.TOKENS_V3.eps(view), 'new tokens have no v2 twin → rendered inline in v2src mode');
t.done();
```

`test/v3/compute.test.js` — append:

```js
// Plan 4b Task 1 — exitMetric evsales: tgt = driverEnd × m − netDebt/shares (quote currency) · driver de/fre from fundamentals
{
  const d = JSON.parse(JSON.stringify(doc));
  d.scenarios.driver = 'revenuePerShare'; d.scenarios.exitMetric = 'evsales';
  d.fundamentals.revenue = d.fundamentals.revenue || 9.4e9; d.fundamentals.netDebt = 7.84e9; d.fundamentals.shares = d.fundamentals.shares || 4.3e8;
  const v = C.compute(d, { seeds: SEEDS });
  const s = d.scenarios, c = s.cases[1];
  const start = d.fundamentals.revenue / d.fundamentals.shares, end = start * Math.pow(1 + c.growth / 100, s.years);
  t.near(v.scn[1].tgt, end * c.exitMultiple - d.fundamentals.netDebt / d.fundamentals.shares, 1e-9, 'evsales exit subtracts net debt per share');
  d.scenarios.driver = 'de'; d.fundamentals.dePerShare = 3.3; d.scenarios.exitMetric = 'pe';
  t.near(C.compute(d, { seeds: SEEDS }).scn[0].driverStart, 3.3, 1e-12, 'driver de reads fundamentals.dePerShare');
  d.scenarios.driver = 'fre'; delete d.fundamentals.frePerShare;
  t(C.semanticErrors(d, { seeds: SEEDS }).some((e) => e.path === 'scenarios.driver'), 'driver fre without fundamentals.frePerShare → semantic error on scenarios.driver');
}
```

`test/v3/render.test.js` — append (the file renders `src = R.toV2Source(doc, view)` from ZTS; reuse its `doc`/`SEEDS`):

```js
// Plan 4b Task 1 — render honours the new enums / nullable rating / tone none
{
  const d = JSON.parse(JSON.stringify(doc)); d.analyst = { target: 100.94, n: null, rating: null, asOf: null };
  const v = C.compute(d, { seeds: SEEDS }), html = R.toV2Source(d, v);
  t(/เป้านักวิเคราะห์ 12 ด\.<\/div><div class="v" style="color:#a5d6a7">~\{\{rd:analystTgt\}\}<\/div>/.test(html), 'analyst cell with rating null and n null prints the target only (no "(null · n/a)")');
  d.analyst = { target: 100.94, n: 19, rating: null, asOf: null };
  t(/~\{\{rd:analystTgt\}\} \(19 ราย\)<\/div>/.test(R.toV2Source(d, C.compute(d, { seeds: SEEDS })), 'rating null + n → "(19 ราย)"');
}
{
  const d = JSON.parse(JSON.stringify(doc)); d.metrics.cards = [{ key: 'pe', tone: 'none' }].concat(d.metrics.cards.filter((c) => c !== 'pe' && !(c && c.key === 'pe')));
  const html = R.toV2Source(d, C.compute(d, { seeds: SEEDS }));
  t(/<div class="k">P\/E \(TTM\)<\/div><div class="v">/.test(html), 'tone none → .v has no class (catalogue default neu suppressed)');
}
{
  const d = JSON.parse(JSON.stringify(doc)); d.scenarios.driver = 'de'; d.fundamentals.dePerShare = 3.3; d.scenarios.exitMetric = 'evsales'; d.fundamentals.netDebt = 1e9; d.fundamentals.shares = d.fundamentals.shares || 4.3e8;
  const html = R.toV2Source(d, C.compute(d, { seeds: SEEDS }));
  t(/<span>DE\/หุ้น [+−][0-9.]+%\/ปี<\/span>/.test(html) && /<span>EV\/Sales ออก<\/span>/.test(html) && /DE\/หุ้น ฐาน ~/.test(html), 'driver de → "DE/หุ้น" labels · exitMetric evsales → "EV/Sales ออก"');
}
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `cd /Users/somchai.s/Downloads/stock-v3-plan4b && node test/v3-test.js 2>&1 | grep -E "✗|^[✓✗] (schema|cards|card-census|tokens|compute|render):"`
Expected: `card-census` fails at require (`CC.RULES` undefined / the census sweep prints to stdout), `tokens` fails (`TK.TOKENS_V3.eps is not a function`), schema/cards/compute/render show `✗` lines for the new assertions.

- [ ] **Step 3: Implement `tools/v3/schema.js`**

```js
// ENUM — Plan 4b Task 1 (spec §10 "ช่องว่าง schema" · §3.3): tone 'none' = ไม่มีคลาสสี (466 การ์ด v2) · driver de/fre (alt managers) · exitMetric evsales
  driver: ['eps', 'ffo', 'revenuePerShare', 'bvps', 'fcfPerShare', 'de', 'fre'],
  exitMetric: ['pe', 'ps', 'pbv', 'pffo', 'pfcf', 'evsales'],
  tone: ['pos', 'neg', 'neu', 'none'],
```

```js
const CARD_KEYS = [ /* …existing… */,
  'occupancy', 'netDebtEbitda', 'backlog', 'payout', 'aum', 'ptbv'];   // + Plan 4b Task 1 (Task 0 Q3 top unmapped labels)
const FUND_NUM = [ /* …existing… */, 'occupancy', 'backlog', 'aum', 'tbvps', 'dePerShare', 'frePerShare'];
```

`meta.headerTags`: `strList(m.headerTags, 'meta.headerTags', 0, 3)` (was 2). `analyst.rating`: replace `str(a.rating, 'analyst.rating');` with

```js
      if (!('rating' in a)) E('analyst.rating', 'ต้องมีคีย์ — ข้อความ หรือ null เมื่อไม่ทราบ rating (114 ใบ v2 ไม่พิมพ์)');
      else if (a.rating !== null) str(a.rating, 'analyst.rating');
```

- [ ] **Step 4: Implement `tools/v3/cards.js`**

Add after `pffoForwardCalc`:

```js
// Plan 4b Task 1 — P/TBV ผูกราคา (เจ้าของเดียวของเลข+ข้อความ เหมือน pffoCalc) · ตัวตั้ง fundamentals.tbvps
function ptbvCalc(view) {
  const b = need(view, 'tbvps');
  if (!(b > 0)) throw new Error('metrics.cards: ptbv — TBVPS ≤ 0 ถอดการ์ดออก');
  const raw = view.d.px / b; return { raw, text: raw.toFixed(2) + 'x' };
}
```

Add to `CATALOGUE`:

```js
  // Plan 4b Task 1 — 6 คีย์จาก Task 0 Q3 (label ที่ตกเป็น custom บ่อยสุดหลัง Plan 2a): 4 จากงบ · payout อัตราส่วนไม่ผูกราคา · ptbv ผูกราคา
  occupancy: { label: () => 'Occupancy', value: (v) => pct1(need(v, 'occupancy')), d: () => 'อัตราการเช่าพื้นที่', cls: '' },
  netDebtEbitda: { label: () => 'Net Debt / EBITDA', cls: 'neu',
    value: (v) => { const e = need(v, 'ebitda'); if (!(e > 0)) throw new Error('metrics.cards: netDebtEbitda — fundamentals.ebitda ≤ 0 ถอดการ์ดออก'); return (need(v, 'netDebt') / e).toFixed(1) + 'x'; },
    d: () => 'หนี้สินสุทธิ ÷ EBITDA (สกุลงบทั้งคู่)' },
  backlog: { label: () => 'Backlog', value: (v) => stmt(v, need(v, 'backlog')), d: () => 'งานในมือ / คำสั่งซื้อค้างส่ง', cls: '' },
  payout: { label: () => 'Payout Ratio', cls: '',
    value: (v) => { const e = need(v, 'eps'); if (!(e > 0)) throw new Error('metrics.cards: payout — EPS ≤ 0 (ขาดทุน) payout ไม่มีความหมาย ถอดการ์ดออก'); return pct1(need(v, 'dps') / e * 100); },
    d: () => 'ปันผล ÷ EPS' },
  aum: { label: () => 'AUM', value: (v) => stmt(v, need(v, 'aum')), d: () => 'สินทรัพย์ภายใต้การจัดการ', cls: '' },
  ptbv: { label: () => 'P/TBV', cls: 'neu', value: (v) => ptbvCalc(v).text, d: (v) => `TBVPS ${money(v, need(v, 'tbvps'))}` },
```

Export `ptbvCalc`. In `tools/v3/prose.js` `priceBound()` add after the pffoForward line: `try { const c = K.ptbvCalc(view); add('ptbv', 'mult', c.raw, c.text); } catch (e) { /* no tbvps → no bound */ }`.

- [ ] **Step 5: Make `tools/v3/card-census.js` a module and fix the rules**

Wrap the sweep (everything from `const counts = {}` to the last `console.log`) in `function main() { … }` and end the file with:

```js
/** label การ์ด → คีย์แคตตาล็อก (กฎแรกที่แมตช์ชนะ) · null = ไม่ลง — migrator (tools/migrate-v3/cards.js) ใช้ตัวเดียวกับ census */
const cardKey = (label) => { const hit = RULES.find(([, re]) => re.test(label)); return hit ? hit[0] : null; };
module.exports = { RULES, cardKey, main };
if (require.main === module) main();
```

Rules (order matters — specific before broad). Replace the `RULES` array body with:

```js
const RULES = [
  // Plan 4b Task 1 — 6 คีย์ใหม่ วางก่อนกฎกว้างที่ชิง label เดียวกัน (netDebtEbitda ก่อน netDebt · payout ก่อน yield · ptbv ก่อน pbv)
  ['netDebtEbitda', /Net\s*Debt\s*(?:\/|to)\s*EBITDA|หนี้สินสุทธิ\s*(?:\/|ต่อ)\s*EBITDA/i],
  ['occupancy', /occupancy|อัตราการเช่า/i], ['backlog', /backlog|งานในมือ/i], ['aum', /\bAUM\b|สินทรัพย์ภายใต้การจัดการ/i],
  ['payout', /payout|อัตราการจ่ายปันผล/i], ['ptbv', /P\s*\/\s*TBV/i],
  ['netDebt', /(หนี้.*สุทธิ|เงินสด.*สุทธิ|^หนี้สิน$|^เงินสด$|หนี้สิน\s*\/\s*เงินสด|เงินสด\s*\/\s*หนี้สิน)|Net\s*(Cash|Debt)(?!\s*[\/:\-]\s*(EBITDA|Equity|Adj))/i],
  ['ebitdaMargin', /EBITDA\s*margin/i], ['roic', /ROIC/i], ['evEbitda', /EV\s*\/\s*EBITDA/i],
  ['peForward', /(forward|fwd|NTM).*P\/E|P\/E.*(forward|fwd|NTM)/i],
  ['analystTarget', /เป้า.*(นักวิเคราะห์|Analyst)|Analyst.*Target|Target.*Analyst|(Consensus|Price)\s*Target/i],
  ['mcap', /market\s*cap|มูลค่าตลาด/i],
  // Task 0 Q3 fix 2: "P/E มัธยฐาน/ย้อนหลัง" คือ peAvg5y ไม่ใช่ pe
  ['peAvg5y', /P\/E.*(เฉลี่ย|avg|median|มัธยฐาน|ย้อนหลัง|5\s*ปี|10\s*ปี)/i], ['pe', /^P\/E(?!.*(เฉลี่ย|avg|median|มัธยฐาน|ย้อนหลัง|5|10|fwd|forward))/i],
  ['pbv', /^P\/B/i], ['ps', /^P\/S/i],
  // Task 0 Q3 fix 1: margin ก่อน netIncome — "อัตรากำไรสุทธิ" มีคำว่ากำไรสุทธิ
  ['netMargin', /net\s*margin|กำไรสุทธิ.*%|อัตรากำไรสุทธิ/i], ['netIncome', /กำไรสุทธิ|net\s*income/i],
  // Task 0 Q3 fix 3: GAAP/Adj/Diluted EPS
  ['eps', /^(?:GAAP|Adj\.?|Adjusted|Diluted|Normali[sz]ed)?\s*EPS(?!.*(forward|fwd|20\d\dE|FY\s*'?\d{2,4}\s*E|consensus|ประมาณการ))/i], ['bvps', /^BVPS|book\s*value/i],
  ['roe', /ROE/i], ['revenue', /รายได้|revenue/i], ['grossMargin', /gross|ขั้นต้น/i],
  ['opMargin', /operating|ดำเนินงาน|EBIT\s*margin/i], ['yield', /ปันผล|dividend/i], ['beta', /beta/i], ['range52w', /52/],
  ['fcf', /FCF|free\s*cash/i],
  ['debtToEquity', /D\/E|Debt\s*(?:\/|-|to)\s*Equity|หนี้.*ทุน/i],
];
```

(Keep the existing explanatory comments above the array; the census doc `docs/superpowers/specs/2026-09-24-card-census.md` is **not** regenerated in this task — Task 7's sweep table supersedes it.)

- [ ] **Step 6: Implement `tools/v3/tokens.js`, `compute.js`, `render.js`**

`tokens.js` — after the `range52w` lines:

```js
// Plan 4b Task 1 (spec §10.1 token gaps: fund:eps 834 ใบ · dps 458 · bvps 223 · epsFy 45 · analyst:vsFv 30) — ค่าจากงบ ไม่ผูกราคา
// (ไม่เข้า priceBound) แต่ทำให้ prose ตาม fundamentals เมื่อ UPDATE · เงินผ่าน RV.fmtPrice เหมือน token อื่น
const fund = (view, k) => need(view.doc && view.doc.fundamentals && view.doc.fundamentals[k], k);
TOKENS_V3.eps = (view) => money(view, fund(view, 'eps'));
TOKENS_V3.dps = (view) => money(view, fund(view, 'dps'));
TOKENS_V3.bvps = (view) => money(view, fund(view, 'bvps'));
TOKENS_V3.epsFy = (view) => money(view, need(view.doc && view.doc.fundamentals && view.doc.fundamentals.fy && view.doc.fundamentals.fy.eps, 'epsFy'));
// ส่วนต่างเป้านักวิเคราะห์เทียบ FV (ไม่ใช่เทียบราคา — นั่นคือ analyst.pct) · 1 ตำแหน่ง · ลบ = U+2212
TOKENS_V3['analyst.vsFv'] = (view) => { const a = need(view.doc && view.doc.analyst, 'analyst.vsFv'); const x = (a.target - view.fv) / view.fv * 100; return (x < 0 ? '−' : '+') + Math.abs(x).toFixed(1) + '%'; };
```

`compute.js` `driverStart`: `const v = { eps: f.eps, ffo: f.ffoPerShare, bvps: f.bvps, revenuePerShare: per('revenue'), fcfPerShare: per('fcf'), de: f.dePerShare, fre: f.frePerShare }[s.driver];`

`compute.js` scenarios — replace `tgt: end * c.exitMultiple` with a helper defined above `compute()`:

```js
// exit EV/Sales (Plan 4b Task 1 · §3.3): ราคาเป้า = รายได้/หุ้นปลายฉาก × EV/Sales − หนี้สุทธิ/หุ้น (สกุลราคา ผ่าน fq) · exit อื่น = ตัวตั้ง × ตัวคูณ
function exitTarget(s, end, m, fq) {
  if (s.exitMetric !== 'evsales') return end * m;
  if (!(typeof fq.shares === 'number' && fq.shares > 0)) throw new Error('scenarios.exitMetric: evsales ต้องมี fundamentals.shares > 0 (หักหนี้สุทธิต่อหุ้น)');
  return end * m - (fq.netDebt || 0) / fq.shares;
}
```

and in `compute()`: `tgt: exitTarget(s, end, c.exitMultiple, fq)`; in `semanticErrors()` add `try { s.cases.forEach((c) => exitTarget(doc.scenarios, 1, c.exitMultiple, fq)); } catch (e) { out.push(splitErr(e, 'scenarios.exitMetric')); }` (use `const s = doc.scenarios` there).

`render.js`: `drv` map add `de: 'DE/หุ้น', fre: 'FRE/หุ้น'`; `ex` map add `evsales: 'EV/Sales'`; card `cls`: `const toneCls = (tone, def) => (tone === 'none' ? '' : tone || def);` and use `cls: toneCls(e.tone, '')` for custom, `cls: toneCls(e.tone, c.cls)` for catalogue; analyst cell:

```js
  const anMeta = an ? [an.rating, an.n != null ? `${an.n} ราย` : null].filter(Boolean).join(' · ') : '';
  const analystCell = an
    ? `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v" style="color:#a5d6a7">~{{rd:analystTgt}}${anMeta ? ` (${esc(anMeta)})` : ''}</div></div>`
    : `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v">ไม่มีข้อมูล</div></div>`;
```

(Existing behaviour for `rating` set + `n` null was `(Buy · n/a)`; the new form prints `(Buy)`. Update the one render test that pins `n/a` if it exists — `rtk proxy grep -n "n/a" test/v3/render.test.js` — to the new form in the same commit.)

- [ ] **Step 7: Run the v3 suite + corpus parity + full verify**

Run: `cd /Users/somchai.s/Downloads/stock-v3-plan4b && node test/v3-test.js 2>&1 | grep -E "✗|^[✓✗]" ; echo "exit ${PIPESTATUS[0]}"`
Expected: every file `✓`, exit 0 (tokens-corpus parity 909/909 unchanged — the new tokens have no v2 twin).

Run: `rtk proxy npm run verify > /tmp/p4b-t1-verify.log 2>&1; echo "verify exit $?"; tail -3 /tmp/p4b-t1-verify.log`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add tools/v3/schema.js tools/v3/cards.js tools/v3/card-census.js tools/v3/tokens.js tools/v3/prose.js tools/v3/compute.js _template/v3/render.js test/v3/
git commit -m "feat(v3): schema gaps for migration — card keys occupancy/netDebtEbitda/backlog/payout/aum/ptbv · census rule fixes · driver de/fre · exit evsales · tone none · rating nullable · headerTags 3 · tokens eps/dps/bvps/epsFy/analyst.vsFv (Plan 4b Task 1)"
```

---

### Task 2: DCF N-stage schedule (`inputs.stages`) + `scenarios.exitDp`

**Files:**
- Modify: `tools/v3/legs.js` (dcf case), `tools/v3/schema.js` (`LEG_INPUTS.dcf`, stages validation, `scenarios.exitDp`), `_template/v3/render.js` (`mdesc` dcf · exit print), `tools/v3/tokens.js` (`scn.*.exit` honours exitDp)
- Test: `test/v3/legs.test.js`, `test/v3/schema.test.js`, `test/v3/render.test.js`

**Interfaces:**
- Consumes: `L.legValue(leg, fundamentals, path)`, `S.LEG_INPUTS`, `view.scn[i].exitMultiple`.
- Produces: `dcf` accepts `{ stages: [{years, g}…], tg, r, rfCurrency }` **or** `{ g1, years1, tg, r, rfCurrency }`; `scenarios.exitDp` optional int 0–2; `render`/tokens print `exitMultiple.toFixed(exitDp)` when set. Task 4's extractor emits `stages` for fades / per-year lists / second phases.

- [ ] **Step 1: Write the failing tests**

`test/v3/legs.test.js` — append before `t.done()`:

```js
// Plan 4b Task 2 — N-stage DCF (§13-3: 88/304 DCF legs are not 2-stage) · stages ≡ 2-stage when one stage
const DCF2 = { g1: 7, years1: 5, tg: 3, r: 8.5, rfCurrency: 'USD' };
t.near(v('dcf', { stages: [{ years: 5, g: 7 }], tg: 3, r: 8.5, rfCurrency: 'USD' }), v('dcf', DCF2), 1e-9, 'one stage = the 2-stage formula');
// 3-stage: 7% ×5y → 4% ×5y → terminal 3% — hand-rolled reference
{
  const r = 0.085; let fcf = f.fcf, pv = 0, t_ = 0;
  for (const st of [{ years: 5, g: 7 }, { years: 5, g: 4 }]) for (let k = 0; k < st.years; k++) { t_++; fcf *= 1 + st.g / 100; pv += fcf / Math.pow(1 + r, t_); }
  const tv = fcf * 1.03 / (r - 0.03) / Math.pow(1 + r, t_);
  t.near(v('dcf', { stages: [{ years: 5, g: 7 }, { years: 5, g: 4 }], tg: 3, r: 8.5, rfCurrency: 'USD' }), (pv + tv - f.netDebt) / f.shares, 1e-6, '3-stage DCF matches reference');
}
t.throws(() => v('dcf', { stages: [], tg: 3, r: 8.5, rfCurrency: 'USD' }), /^legs\[0\].*stages/, 'empty stages → path-named throw');
t.throws(() => v('dcf', { stages: [{ years: 5, g: 7 }], tg: 9, r: 8.5, rfCurrency: 'USD' }), /^legs\[0\].*tg/, 'stages with r ≤ tg → path-named throw');
```

`test/v3/schema.test.js` — append:

```js
// Plan 4b Task 2 — dcf: exactly one of {g1, years1} | {stages}
{
  const d = load();
  const dcfLeg = (inputs) => ({ method: 'dcf', label: 'DCF', role: 'fv', family: 'rg', inputs });
  d.legs = [d.legs[0], dcfLeg({ stages: [{ years: 5, g: 7 }, { years: 5, g: 4 }], tg: 3, r: 8.5, rfCurrency: d.currency })];
  if (d.fvWeights) d.fvWeights = null;
  d.fundamentals.fcf = d.fundamentals.fcf || 2.3e9; d.fundamentals.shares = d.fundamentals.shares || 4.3e8;
  t.eq(errsOf(d).filter((e) => /legs\[1\]/.test(e.path)), [], 'dcf with stages accepted');
  d.legs[1] = dcfLeg({ g1: 7, years1: 5, stages: [{ years: 5, g: 7 }], tg: 3, r: 8.5, rfCurrency: d.currency });
  t(errsOf(d).some((e) => e.path === 'legs[1].inputs'), 'g1/years1 together with stages → error');
  d.legs[1] = dcfLeg({ tg: 3, r: 8.5, rfCurrency: d.currency });
  t(errsOf(d).some((e) => e.path === 'legs[1].inputs'), 'neither g1/years1 nor stages → error');
  d.legs[1] = dcfLeg({ stages: [{ years: 0, g: 7 }], tg: 3, r: 8.5, rfCurrency: d.currency });
  t(errsOf(d).some((e) => e.path === 'legs[1].inputs.stages[0].years'), 'stage years must be int ≥ 1');
  d.legs[1] = dcfLeg({ stages: Array.from({ length: 11 }, () => ({ years: 1, g: 5 })), tg: 3, r: 8.5, rfCurrency: d.currency });
  t(errsOf(d).some((e) => e.path === 'legs[1].inputs.stages'), '> 10 stages → error');
  d.legs[1] = dcfLeg({ stages: [{ years: 41, g: 5 }], tg: 3, r: 8.5, rfCurrency: d.currency });
  t(errsOf(d).some((e) => e.path === 'legs[1].inputs.stages'), 'Σ years > 40 → error');
}
{
  const d = load(); d.scenarios.exitDp = 1;
  t.eq(errsOf(d).filter((e) => /exitDp/.test(e.path)), [], 'scenarios.exitDp 1 accepted');
  d.scenarios.exitDp = 3; t(errsOf(d).some((e) => e.path === 'scenarios.exitDp'), 'exitDp 3 rejected (0–2)');
}
```

`test/v3/render.test.js` — append:

```js
// Plan 4b Task 2 — mdesc for stages · exitDp print
{
  const d = JSON.parse(JSON.stringify(doc));
  d.legs[1] = { method: 'dcf', label: 'DCF', role: 'fv', family: 'rg', inputs: { stages: [{ years: 5, g: 7 }, { years: 5, g: 4 }], tg: 3, r: 8.5, rfCurrency: d.currency } };
  d.fvWeights = null; d.fundamentals.fcf = d.fundamentals.fcf || 2.3e9; d.fundamentals.shares = d.fundamentals.shares || 4.3e8;
  d.legs.forEach((l) => { if (l.role !== 'context' && !l.family) l.family = l.method === 'pe' ? 'market' : 'rg'; });
  const v = C.compute(d, { seeds: SEEDS });
  t(/โต 7%\/ปี 5 ปี → 4%\/ปี 5 ปี · โตถาวร 3% · r 8\.5%/.test(R.mdesc(d.legs[1], v)), 'mdesc prints the stage schedule (no "undefined")', R.mdesc(d.legs[1], v));
  d.scenarios.exitDp = 1; d.scenarios.cases[0].exitMultiple = 17.25;
  const html = R.toV2Source(d, C.compute(d, { seeds: SEEDS }));
  t(/<span>P\/E ออก<\/span><span>17\.3x<\/span>/.test(html) || /<span>P\/[A-Z]+ ออก<\/span><span>17\.3x<\/span>/.test(html), 'exitDp 1 → exit multiple printed as 17.3x');
}
```

- [ ] **Step 2: Run to watch them fail**

Run: `node test/v3-test.js 2>&1 | grep -E "✗|^[✓✗] (legs|schema|render):"` — expected `✗` on the new assertions (stages ignored → `legs[0]…g1` throw, schema accepts both, mdesc prints `undefined`).

- [ ] **Step 3: Implement**

`tools/v3/legs.js` dcf case:

```js
    case 'dcf': {
      const r = pct(i.r);
      spread(i.r, i.tg, 'tg');
      // §13-3 (Plan 4b): ตาราง stages [{years, g}] แทน g1/years1 ได้ — หนึ่ง stage = สูตร 2-stage เดิมทุก byte
      const sched = Array.isArray(i.stages) ? i.stages : [{ years: i.years1, g: i.g1 }];
      if (!sched.length) throw new Error(`${P}.inputs.stages: ต้องมีอย่างน้อย 1 ช่วง`);
      let fcf = need('fcf'), pv = 0, t = 0;
      for (const st of sched) for (let k = 0; k < st.years; k++) { t++; fcf *= 1 + pct(st.g); pv += fcf / Math.pow(1 + r, t); }
      const tv = fcf * (1 + pct(i.tg)) / (r - pct(i.tg)) / Math.pow(1 + r, t);
      v = perShare(equity(pv + tv));
      break;
    }
```

`tools/v3/schema.js`: `dcf: { req: ['tg', 'r', 'rfCurrency'], opt: ['g1', 'years1', 'stages'] }` and, inside the legs loop after the `ddm2` block:

```js
    if (leg.method === 'dcf') {
      const two = inp.g1 != null || inp.years1 != null, st = inp.stages != null;
      if (two === st) E(`${p}.inputs`, 'dcf ใช้ได้ทางเดียว: {g1, years1} (2-stage) หรือ {stages: [{years, g}]} (N-stage · §13-3)');
      if (two && (inp.g1 == null || inp.years1 == null)) E(`${p}.inputs`, 'dcf 2-stage ต้องมีทั้ง g1 และ years1');
      if (st) {
        const sp = `${p}.inputs.stages`;
        if (!Array.isArray(inp.stages) || !inp.stages.length || inp.stages.length > 10) E(sp, 'ต้องเป็น array 1–10 ช่วง [{years, g}]');
        else {
          let total = 0;
          inp.stages.forEach((s, k) => {
            if (!isObj(s)) return E(`${sp}[${k}]`, 'ต้องเป็น object {years, g}');
            closed(s, `${sp}[${k}]`, ['years', 'g']);
            num(s.years, `${sp}[${k}].years`, { int: true, min: 1 }); num(s.g, `${sp}[${k}].g`);
            if (isNum(s.years)) total += s.years;
          });
          if (total > 40) E(sp, `Σ years = ${total} เกิน 40 ปี`);
        }
      }
    }
```

`scenarios`: add `'exitDp'` to the closed list and `if (s.exitDp != null) { num(s.exitDp, 'scenarios.exitDp', { int: true, min: 0 }); if (isNum(s.exitDp) && s.exitDp > 2) E('scenarios.exitDp', 'ต้อง 0–2'); }`.

`_template/v3/render.js` `mdesc` dcf:

```js
    case 'dcf': {
      const sched = Array.isArray(i.stages) ? i.stages.map((s) => `${s.g}%/ปี ${s.years} ปี`).join(' → ') : `${i.g1}%/ปี ${i.years1} ปี`;
      return `FCF ${RV.fmtBig(b.fcf, view.stmtCur || view.cur)} โต ${sched} · โตถาวร ${i.tg}% · r ${i.r}%`;
    }
```

Exit print: in `col()` replace `${sc.exitMultiple}x` with `${exitText(s, sc.exitMultiple)}x` where `const exitText = (s, m) => (s.exitDp != null ? m.toFixed(s.exitDp) : String(m));` defined near `ffoLabel`. `tokens.js` `scn.*.exit`: `const s = view.doc.scenarios; return (s.exitDp != null ? e.toFixed(s.exitDp) : e.toFixed(1)) + 'x';` (keep `toFixed(1)` as the default so today's token output is unchanged).

- [ ] **Step 4: Run the suite + verify** — same commands as Task 1 Step 7; expected all `✓`, verify exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/v3/legs.js tools/v3/schema.js tools/v3/tokens.js _template/v3/render.js test/v3/
git commit -m "feat(v3): DCF N-stage schedule inputs.stages (§13-3) + scenarios.exitDp (Plan 4b Task 2)"
```

---

### Task 3: `meta.migratedFrom` + `build.js` `updatedFor` rule (D1)

**Files:**
- Modify: `tools/v3/schema.js` (meta closed keys + validation), `build.js` (`loadReportSource` returns `migratedFrom`; new exported pure `updatedFor(old, h, mf, nowISO)`; loop uses it), `tools/report.js` (`--light` refuses `meta.migratedFrom` changes — already true by allowlist; pin with a test)
- Test: `test/build-test.js`, `test/v3/schema.test.js`, `test/v3/report-cli.test.js`

**Interfaces:**
- Consumes: `loadReportSource(dir, name, seeds)`, manifest rows `{ symbol, hash, updated }`.
- Produces: `S.validate` accepts `meta.migratedFrom: { updated: <ISO datetime with offset>, v2Hash: <12 hex> }`; `build.updatedFor(old, h, mf, nowISO) → string`; `loadReportSource` v3 result gains `migratedFrom` (null when absent). Task 5's `assemble` writes the field; Task 9 rehearses the two-build gate.

- [ ] **Step 1: Write the failing tests**

`test/build-test.js` — append (file uses `b = require('../build.js')` and a local `ok`/counter — check its assertion helper name with `rtk proxy grep -n "^const ok\|^function ok\|^const t " test/build-test.js` and use it):

```js
// ── Plan 4b Task 3 (spec §8 · D1): updatedFor — ใบ migrate คง updated เดิมเมื่อแถว manifest ยังถือ hash v2 ──
{
  const OLD = '2026-09-22T07:22:55+07:00', NOW = '2026-09-25T12:00:00+07:00';
  const mf = { updated: OLD, v2Hash: 'abcdef012345' };
  ok(b.updatedFor({ hash: 'abcdef012345', updated: OLD }, 'v3hash000001', mf, NOW) === OLD, 'migratedFrom: manifest row still has the v2 hash → keep updated');
  ok(b.updatedFor({ hash: 'v3hash000001', updated: OLD }, 'v3hash000001', mf, NOW) === OLD, 'after the first build: v3 hash matches → keep (normal path)');
  ok(b.updatedFor({ hash: 'v3hash000001', updated: OLD }, 'v3hash000002', mf, NOW) === NOW, 'Review Focus 4: later real UPDATE (hash moved, row no longer v2) → stamp now');
  ok(b.updatedFor(undefined, 'v3hash000001', mf, NOW) === NOW, 'no committed row → now (nothing to preserve — tighter rule, advisor)');
  ok(b.updatedFor({ hash: 'other0000000', updated: OLD }, 'v3hash000001', mf, NOW) === NOW, 'row hash ≠ v2Hash (cron moved the v2 hash after the migrator ran) → now (two-build gate catches it)');
  ok(b.updatedFor({ hash: 'x', updated: OLD }, 'y', null, NOW) === NOW, 'no migratedFrom → today\'s rule');
  ok(b.updatedFor({ hash: 'y', updated: OLD }, 'y', null, NOW) === OLD, 'no migratedFrom, hash equal → keep (today\'s rule)');
}
```

`test/v3/schema.test.js` — append:

```js
// Plan 4b Task 3 — meta.migratedFrom (spec §8 D1)
{
  const d = load(); d.meta.migratedFrom = { updated: '2026-09-22T07:22:55+07:00', v2Hash: 'abcdef012345' };
  t.eq(errsOf(d).filter((e) => /migratedFrom/.test(e.path)), [], 'migratedFrom {updated, v2Hash} accepted');
  d.meta.migratedFrom = { updated: '2026-09-22', v2Hash: 'abcdef012345' };
  t(errsOf(d).some((e) => e.path === 'meta.migratedFrom.updated'), 'updated must be the manifest ISO datetime with offset');
  d.meta.migratedFrom = { updated: '2026-09-22T07:22:55+07:00', v2Hash: 'ABCDEF' };
  t(errsOf(d).some((e) => e.path === 'meta.migratedFrom.v2Hash'), 'v2Hash must be 12 lowercase hex');
  d.meta.migratedFrom = { updated: '2026-09-22T07:22:55+07:00', v2Hash: 'abcdef012345', extra: 1 };
  t(errsOf(d).some((e) => e.path === 'meta.migratedFrom.extra'), 'closed object');
}
```

`test/v3/report-cli.test.js` — inside the existing `--light` block (find it with `rtk proxy grep -n "light" test/v3/report-cli.test.js | head`), add a case that edits `meta.migratedFrom` in the draft under `--light` and expects refusal naming `meta.migratedFrom`:

```js
  { const d = readW(SYM_LIGHT); writeW(SYM_LIGHT, { ...d, meta: { ...d.meta, migratedFrom: { updated: '2026-09-01T00:00:00+07:00', v2Hash: 'abcdef012345' } } });
    const r = cli(['save', SYM_LIGHT, '--light']);
    t(r.code === 1 && /meta\.migratedFrom/.test(r.out), '--light refuses a meta.migratedFrom change (write-once by the migrator)'); writeW(SYM_LIGHT, d); }
```

(Use the symbol/helper names that block already uses for its LIGHT fixture.)

- [ ] **Step 2: Run to watch them fail** — `node test/build-test.js` (`updatedFor is not a function`), `node test/v3-test.js 2>&1 | grep -E "✗"`.

- [ ] **Step 3: Implement**

`tools/v3/schema.js` meta: add `'migratedFrom'` to the closed list and

```js
    // Plan 4b (spec §8 · D1): ที่มาของใบที่ migrate — build คง reports.json.updated เดิมเมื่อแถว manifest ยังถือ hash v2 · เขียนครั้งเดียวโดย migrator
    if (m.migratedFrom != null) {
      if (!isObj(m.migratedFrom)) E('meta.migratedFrom', 'ต้องเป็น object {updated, v2Hash}');
      else {
        closed(m.migratedFrom, 'meta.migratedFrom', ['updated', 'v2Hash']);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(m.migratedFrom.updated || '')) E('meta.migratedFrom.updated', 'ต้องเป็น ISO datetime ของ reports.json (YYYY-MM-DDTHH:mm:ss+07:00)');
        if (!/^[0-9a-f]{12}$/.test(m.migratedFrom.v2Hash || '')) E('meta.migratedFrom.v2Hash', 'ต้องเป็น freshHash ของใบ v2 (hex 12 ตัว)');
      }
    }
```

`build.js`: in `loadReportSource` v3 branch return `{ …, v3: true, migratedFrom: (doc.meta && doc.meta.migratedFrom) || null }`; v2 branch `migratedFrom: null`. Add above `loadReportSource`:

```js
// updated ของแถว manifest (spec §8 · Plan 4b D1): hash ตรง = คงเดิม · ใบ migrate (meta.migratedFrom) ที่แถว committed ยังถือ hash v2 = คง
// updated ที่ migrator ลอกมาจาก HEAD:reports.json · นอกนั้น = ประทับ now (รวมไม่มีแถวเดิม — ไม่มีอะไรให้คง)
function updatedFor(old, h, mf, nowISO) {
  if (old && old.hash === h && old.updated) return old.updated;
  if (mf && old && old.hash === mf.v2Hash && mf.updated) return mf.updated;
  return nowISO;
}
```

Loop: `const { symbol, file, content, hash: h, migratedFrom } = loadReportSource(REPORTS_DIR, name, SEEDS); … const updated = updatedFor(old, h, migratedFrom, nowISO);`. Export `updatedFor`.

- [ ] **Step 4: Run** `node test/build-test.js && node test/v3-test.js && rtk proxy npm run build >/dev/null && git status --short reports.json` — expected all pass, `reports.json` unchanged (no report carries the field yet).

- [ ] **Step 5: Commit**

```bash
git add build.js tools/v3/schema.js test/build-test.js test/v3/
git commit -m "feat(v3): meta.migratedFrom + build.updatedFor — migrated reports keep their v2 updated (spec §8 · Plan 4b Task 3)"
```

---

### Task 4: `tools/migrate-v3/parse-v2.js` + `legs.js` — parser and leg classifier/extractor (productionised prototypes · N-stage extraction · ddm2)

**Files:**
- Create: `tools/migrate-v3/parse-v2.js`, `tools/migrate-v3/legs.js` (copied from `/Users/somchai.s/Downloads/stock/.superpowers/sdd/archive/plan4a/task0/proto/{parse-v2,legs-classify}.js`, then edited as below)
- Test: `test/v3/migrate-parse.test.js` (new)

**Interfaces:**
- Consumes: `tools/report-meta.js` (`readReportData`, `readStockMeta`, `readAiModel`), `tools/report-values.js`, `tools/queue/footer-date.js` (`footerDate → {iso, era, …}`), `tools/derived-values.js` (`CARD_SRC`), `tools/v3/legs.js` (`legValue`).
- Produces: `PV.parseV2(sym, html) → parsed` with fields `{ sym, html, rd, sm, fd, aiModel, header, h1, sub, tags, pxMeta, secs, byN, extraSecs, s1cards, s1hint, s1paras, legs[{mnameHtml, mname, mdescHtml, mdesc, mvalHtml, mval, empty}], legBlocks, s3hint, s3paras, fvBoxL, s6hint, s6cols, s6paras, catalysts, risks, s8{h2, p, zone, vcells}, disc, footer }` (+ `PV.text`, `PV.decode`, `PV.sections`, `PV.cards`); `LG.classifyName(mname, mdesc) → 'pe'|'pbv'|'pbv:justified'|…|'analyst'|'unclassified'` (a trailing `?` marks a desc-only match); `LG.extract(method, mdesc, mname, mval, fu) → { inputs, override, value, ok, why, base, baseKey, stages? }`; `LG.dcfShape(text) → string[]`; `LG.extractDcfStages(text) → [{years, g}] | null`; `LG.CONTEXT_RE`, `LG.ANALYST_RE`, `LG.mvalNum`, `LG.moneyAll`, `LG.multAll`, `LG.pctAll`, `LG.close`.

- [ ] **Step 1: Copy the prototypes**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan4b && mkdir -p tools/migrate-v3
cp /Users/somchai.s/Downloads/stock/.superpowers/sdd/archive/plan4a/task0/proto/parse-v2.js tools/migrate-v3/parse-v2.js
cp /Users/somchai.s/Downloads/stock/.superpowers/sdd/archive/plan4a/task0/proto/legs-classify.js tools/migrate-v3/legs.js
```

- [ ] **Step 2: Write the failing tests** — `test/v3/migrate-parse.test.js`:

```js
'use strict';
// Plan 4b Task 4 — parser + leg classifier on the 7 v2 fixtures (expectations measured with the Task 0 prototype 25 ก.ย. 69)
const t = require('./_t.js')('migrate-parse');
const fs = require('fs'), path = require('path');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const LG = require('../../tools/migrate-v3/legs.js');
const FIX = path.join(__dirname, '..', 'fixtures');
const load = (sym) => PV.parseV2(sym, fs.readFileSync(path.join(FIX, `${sym}-v2.html`), 'utf8'));
const fu = (v) => ({ eps: v.eps, dps: v.dps, bvps: v.bvps, shares: v.shares, revenue: v.revenue, rps: v.revenue && v.shares ? v.revenue / v.shares : null });
const legsOf = (r) => r.legs.map((l) => { const m = LG.classifyName(l.mname, l.mdesc); const mv = LG.mvalNum(l.mval); const ex = LG.extract(m, l.mdesc, l.mname, mv, fu(r.rd.values)); return { m, ctx: LG.CONTEXT_RE.test(l.mname), mv, ok: ex.ok, inputs: ex.inputs, override: ex.override, why: ex.why }; });

// parser shape (BBL)
{
  const r = load('BBL');
  t.eq([r.sym, r.sm.currency, r.fd.iso, r.fd.era, r.rd.values.dateEra], ['BBL', 'THB', '2026-07-24', 'CE', 'CE'], 'BBL: symbol · currency · footer iso/era · values.dateEra');
  t.eq(r.tags, ['SET: BBL', 'Financials • Banking', 'ธนาคารใหญ่สุดด้านสินทรัพย์'], 'BBL: header tags in order');
  t.eq(PV.text(r.h1), 'ธนาคารกรุงเทพ (Bangkok Bank)', 'BBL: h1 text');
  t(/ทำนิวไฮรอบ 52 สัปดาห์ \(฿139\.5–฿197\)/.test(PV.text(r.pxMeta)) && /ที่มา: SET \/ stockanalysis\.com \/ Investing/.test(PV.text(r.pxMeta)), 'BBL: px-meta text (52wk + sources)');
  t.eq([r.s1cards.length, r.legs.length, r.legBlocks, r.s6cols.length, r.catalysts.length, r.risks.length, r.extraSecs.length], [12, 3, 3, 3, 6, 6, 0], 'BBL: counts');
  t.eq(r.s1cards[1].k, 'P/E (TTM)', 'BBL: card label'); t.eq(r.s1cards[1].vcls, 'neu', 'BBL: card tone class');
  t.eq(r.s1cards[0].vHtml.trim(), '~{{rd:mcap}}', 'BBL: token-bearing card value kept raw');
  t.eq(r.legs[0].mname, '1. P/E Valuation', 'BBL: leg 1 name'); t.eq(r.legs[0].mval, '฿198', 'BBL: leg 1 value text');
  t.eq(r.s6cols[0].top, ['🐻 Bear', 'EPS −2%/ปี'], 'BBL: s6 bear top');
  t.eq(r.s6cols[0].lis.map((x) => x[0]), ['EPS ปี 3', 'P/E ออก', 'ปันผลรวม 3 ปี', 'สถานการณ์'], 'BBL: s6 bear rows');
  t(/แบงก์อนุรักษ์นิยม/.test(r.s8.h2) && /กลยุทธ์/.test(r.s8.zone) && r.s8.vcells.length >= 2, 'BBL: s8 verdict parts');
  t(/ข้อมูล ณ 24 ก\.ค\. 2026/.test(PV.text(r.footer)), 'BBL: footer text');
  t.eq(r.aiModel, require('../../tools/report-meta.js').readAiModel(r.html), 'parser exposes <meta ai-model>');
  t.eq(r.s3hint, 'เฉลี่ย 3 วิธี (หุ้นธนาคาร — ใช้ P/BV แทน DCF)', 'BBL: s3 hint');
  t.eq(r.s1hint, 'งบ FY2025 + ไตรมาส Q1/2026', 'BBL: s1 hint');
}
// Review Focus 1 — empty vmethod shell must not throw and must be marked
{
  const html = fs.readFileSync(path.join(FIX, 'SRE-v2.html'), 'utf8').replace(/(<div class="vmethod">\s*<div>\s*<div class="mname">)([\s\S]*?)(<\/div>\s*<div class="mdesc">)[\s\S]*?(<\/div>\s*<\/div>\s*<div class="mval">)[\s\S]*?(<\/div>)/, '$1$2$3$4$5');
  const r = PV.parseV2('SRE', html);
  t(r.legs.length === 2 && r.legs[0].empty === true && r.legs[0].mval === null && r.legs[1].empty === false, 'empty shell → legs[0].empty true, mval null, second leg intact', JSON.stringify(r.legs.map((l) => [l.empty, l.mval])));
}
// classifier + extractor — measured expectations
const want = {
  AAPL: [['pe', true, { multiple: 30 }], ['dcf', true, { g1: 8, years1: 5, tg: 3.5, r: 8.5, rfCurrency: 'USD' }], ['analyst', false, null]],
  BBL: [['pe', true, { multiple: 9 }], ['ddm', true, { g: 3, r: 9.5 }], ['pbv:justified', true, { g: 3, r: 9.5 }]],
  CASY: [['pe', true, { multiple: 35 }], ['evebitda', true, { multiple: 17 }], ['pbv:justified', true, { g: 9, r: 11 }]],
  DPZ: [['pe', true, { multiple: 21 }], ['pfcf', true, { multiple: 19 }], ['pe', true, { multiple: 17 }]],
  FTV: [['pe', true, { multiple: 21.5 }], ['evebitda', true, { multiple: 18 }], ['fcfyield', true, { yield: 4.9 }]],
  SRE: [['ddm', true, { g: 5.5, r: 8 }], ['pe', true, { multiple: 19 }]],
};
for (const [sym, exp] of Object.entries(want)) {
  const got = legsOf(load(sym));
  t.eq(got.map((l) => [l.m, l.ok, l.inputs]), exp, `${sym}: method · reproduces · inputs`);
}
{
  const b = legsOf(load('BBL'));
  t.near(b[1].override.dps, 10.194174757281553, 1e-9, 'BBL ddm: D₁ printed → override.dps = D₁/(1+g)');
  t.eq(b[2].override, { roe: 7.8, bvps: 302 }, 'BBL justified pbv: roe/bvps from the printed formula');
  const d = legsOf(load('DDOG'));
  t.eq([d[0].m, d[0].ok, d[0].override, d[1].m, d[2].m], ['pe', true, { eps: 2.95 }, 'dcf', 'analyst'], 'DDOG: pe with eps override · dcf · analyst leg');
  t(d[1].ok || (typeof d[1].why === 'string' && d[1].why.length > 0), 'DDOG dcf: reproduces or names why not (never silent)');
}
// N-stage extraction (Task 0 Q2: second phase 37 · per-year list 26 · linear fade 24)
t.eq(LG.extractDcfStages('FCF โต 12% ปี 1–5 แล้ว 6% ปี 6–10 · terminal 3%'), [{ years: 5, g: 12 }, { years: 5, g: 6 }], 'second explicit phase → 2 stages');
t.eq(LG.extractDcfStages('เติบโต 15%/12%/10%/8%/6% (ปี 1–5)'), [{ years: 1, g: 15 }, { years: 1, g: 12 }, { years: 1, g: 10 }, { years: 1, g: 8 }, { years: 1, g: 6 }], 'per-year list → 1-year stages');
t.eq(LG.extractDcfStages('โตจาก 20% ค่อย ๆ ลดเป็น 5% ใน 5 ปี'), [{ years: 1, g: 20 }, { years: 1, g: 16.25 }, { years: 1, g: 12.5 }, { years: 1, g: 8.75 }, { years: 1, g: 5 }], 'linear fade → 1-year stages interpolated end-to-end');
t.eq(LG.extractDcfStages('FCF โต 8%/ปี 5 ปี · โตถาวร 3% · r 8.5%'), null, 'plain 2-stage text → null (caller keeps g1/years1)');
// ddm2 extractor — spec §3.6 N form
{
  const ex = LG.extract('ddm2', 'D₁ €2.04 โต 11%/ปี 10 ปี แล้ว 3%/ปี · r 8.5% · 40 งวด ไม่มีมูลค่าปลายงวด', '2. DDM 2 ระยะ', 55.02, { dps: 2.04 });
  t(ex.ok && ex.inputs && ex.inputs.d1 === 2.04 && ex.inputs.g1 === 11 && ex.inputs.years1 === 10 && ex.inputs.g2 === 3 && ex.inputs.r === 8.5 && ex.inputs.horizon === 40, 'ddm2: d1/g1/years1/g2/r/horizon extracted and reproduce $55.02', JSON.stringify(ex));
}
t.done();
```

- [ ] **Step 3: Run to watch it fail** — `node test/v3/migrate-parse.test.js`: `ROOT` resolves to `.superpowers/sdd` (prototype path), `legs[i].empty`/`aiModel` undefined, `extractDcfStages` not a function.

- [ ] **Step 4: Edit `parse-v2.js`**

Header → production docblock (Thai, same style as `tools/v3/*.js`: purpose · owner · not-a-cycle note). `ROOT = path.join(__dirname, '..', '..')`. In `legs(body)`: parse with a shell-tolerant regex and mark empties:

```js
function legs(body) {
  const out = [];
  const re = /<div class="vmethod">\s*<div>\s*<div class="mname">([\s\S]*?)<\/div>\s*(?:<div class="mdesc">([\s\S]*?)<\/div>\s*)?<\/div>\s*(?:<div class="mval">([\s\S]*?)<\/div>)?/g;
  let m;
  while ((m = re.exec(body))) {
    const mdesc = text(m[2] || ''), mval = text(m[3] || '');
    out.push({ mnameHtml: m[1], mname: text(m[1]), mdescHtml: m[2] || '', mdesc, mvalHtml: m[3] || '', mval: mval || null, empty: !mdesc && !mval });
  }
  return { legs: out, blocks: (body.match(/class="vmethod"/g) || []).length };
}
```

In `parseV2` add `aiModel: RM.readAiModel(html)`. Export `{ parseV2, text, decode, sections, cards, legs, ROOT }`.

- [ ] **Step 5: Edit `legs.js`**

Header → production docblock. `require(path.join(ROOT, 'tools/v3/legs.js'))` → `require('../v3/legs.js')`. Add `extractDcfStages` (before `extract`):

```js
const pctNum = (s) => parseFloat(String(s).replace(/−/g, '-'));
/** ตาราง stages ของ DCF จากข้อความ (§13-3) — 3 รูปที่พบในคลัง (Task 0 Q2): ช่วงที่ 2 ชัด (ปี a–b) · ลิสต์รายปี x%/y%/z% · fade เชิงเส้น
 *  คืน null เมื่อเป็น 2-stage ธรรมดา (caller คง g1/years1) */
function extractDcfStages(s) {
  const phases = [...s.matchAll(/([+\-−]?[0-9]+(?:\.[0-9]+)?)\s*%[^0-9%]{0,40}?ปี\s*(\d+)\s*[–\-]\s*(\d+)/g)]
    .map((m) => ({ from: +m[2], to: +m[3], g: pctNum(m[1]) })).filter((p) => p.to >= p.from);
  if (phases.length >= 2) return phases.map((p) => ({ years: p.to - p.from + 1, g: p.g }));
  const list = /((?:[+\-−]?[0-9]+(?:\.[0-9]+)?\s*%?\s*\/\s*){2,}[+\-−]?[0-9]+(?:\.[0-9]+)?\s*%)/.exec(s);
  if (list) return list[1].split('/').map((x) => ({ years: 1, g: pctNum(x.replace('%', '')) }));
  const fade = /([0-9]+(?:\.[0-9]+)?)\s*%[^0-9%]{0,30}?(?:ลด|ชะลอ|ไล่|fade)[^0-9%]{0,20}?([0-9]+(?:\.[0-9]+)?)\s*%[^0-9]{0,12}?(\d+)\s*ปี/i.exec(s);
  if (fade) { const a = +fade[1], b = +fade[2], n = +fade[3]; if (n >= 2) return Array.from({ length: n }, (_, k) => ({ years: 1, g: Math.round((a + (b - a) * k / (n - 1)) * 1e6) / 1e6 })); }
  return null;
}
```

In `extract()` `dcf` branch: compute `const stages = extractDcfStages(s)`; when `stages` is non-null try `{ stages, tg, r, rfCurrency }` first (need `tg`, `r`; years no longer required), then fall back to the 2-stage attempt; set `out.stages = stages` on success. Add a `ddm2` branch:

```js
  if (m === 'ddm2') {
    const d1 = (moneyAll(mdesc).filter((x) => !x.scaled)[0] || {}).v ?? f.dps;
    const g1 = pctAfter(s, 'โต|g1|growth'), years1 = num((/([0-9]+)\s*ปี(?!\s*[–\-])/.exec(s) || [])[1]);
    const g2 = pctAfter(s, 'แล้ว|จากนั้น|g2|ถาวร|ปลาย'), r = pctAfter(s, '\\br\\b|Ke|ต้นทุน|discount');
    const hz = /(\d+)\s*(?:งวด|ปี)\s*(?:ไม่มี|no)\s*(?:มูลค่า)?\s*(?:ปลายงวด|terminal)/i.exec(s) || /อายุ\s*(\d+)\s*ปี|สัมปทาน\s*(\d+)\s*ปี/.exec(s);
    const horizon = hz ? +(hz[1] || hz[2]) : null;
    if ([d1, g1, years1, g2, r].every((x) => x != null)) {
      const inputs = { d1, g1, years1, g2, r, horizon };
      const v = tryLeg({ method: 'ddm2', inputs }, {});
      if (ok(v)) { out.inputs = inputs; out.value = v; out.ok = true; return out; }
      out.why = 'ddm2 recompute ≠ mval';
    } else out.why = `ddm2: d1=${d1} g1=${g1} years1=${years1} g2=${g2} r=${r}`;
    return out;
  }
```

(`ri` stays "extractor not prototyped" → declared with why.) Export `{ classifyName, extract, dcfShape, extractDcfStages, mvalNum, mvalCur, CONTEXT_RE, ANALYST_RE, moneyAll, multAll, pctAll, pctAfter, close }`. Ensure `ok()`'s tolerance accepts the `55.02` vs `55.022` case (it does: 1.5%).

- [ ] **Step 6: Run** `node test/v3/migrate-parse.test.js` → all pass; then `node test/v3-test.js 2>&1 | grep -E "✗|migrate-parse"`.

- [ ] **Step 7: Commit**

```bash
git add tools/migrate-v3/parse-v2.js tools/migrate-v3/legs.js test/v3/migrate-parse.test.js
git commit -m "feat(migrate-v3): v2 parser + leg classifier/extractor (N-stage DCF · ddm2 · empty shells) — Plan 4b Task 4"
```

---

### Task 5: `tools/migrate-v3/assemble.js` (+ `cards.js`, `prose.js`, `scenarios.js`, `theme.js`) — parsed v2 → v3 doc + decision notes

**Files:**
- Create: `tools/migrate-v3/assemble.js`, `tools/migrate-v3/cards.js`, `tools/migrate-v3/prose.js`, `tools/migrate-v3/scenarios.js`, `tools/migrate-v3/theme.js`
- Test: `test/v3/migrate-assemble.test.js` (new)

**Interfaces:**
- Consumes: Task 4 (`PV`, `LG`), `tools/v3/{schema,compute,prose,tokens,cards,card-census}.js`, `tools/brandtheme.js` (`makeTheme`), `tools/report-values.js` (`PROSE_BOUND`, `proseBoundHits`, `TOKENS`, `fmtPrice`), `build.js` (`freshHash`), `tools/safe-values.js` (`colorOK`).
- Produces: `A.assemble(parsed, ctx) → { doc, notes: { H: string[], D: string[], F: string[] }, meta: { legs: [...], weights, scn, cards, prose } }` where `ctx = { seeds, headUpdated: string|null, v2Hash: string, today: 'YYYY-MM-DD', analysisPx: {px, pe, mos, upside}|null }`. `doc` is **unsigned** and has **no** `_sig`; it is the input of Task 6's gate and Task 7's `convert`. Sub-modules: `MC.mapCards(parsed, base) → { cards, custom, notes, fund, H, D, F }` · `MP.htmlToProse(html) → string` · `MP.tokenise(text, view, hits) → { text, D }` · `MP.staleCopies(text, apx, d) → [{lit, why}]` · `MS.scenarios(parsed, fund) → { scenarios, D, F, H }` · `MT.theme(sym, rdTheme, seeds) → { themeLegacy|null, H, F }`.

**Field mapping (the contract — every row must be implemented; "H/D/F" = which note list a deviation goes to):**

| v3 field | v2 source | rule |
|---|---|---|
| `v`, `symbol`, `currency`, `region` | `sm.currency` | `region = currency === 'THB' ? 'TH' : 'US'` |
| `dateEra` | `rd.values.dateEra` | footer `fd.era` ≠ → **H** `era mismatch footer ≠ values.dateEra` |
| `meta.company` | `h1` text | strip a trailing ` (SYM)` when present |
| `meta.exchange` | `tags[0]` = `"<EXCH>: <SYM>"` | regex `^([A-Za-z ]+):\s*SYM$`; no match → **H** `first header tag not "<EXCH>: SYM"` |
| `meta.sub` | `.sub` → `htmlToProse` | |
| `meta.headerTags` | `tags.slice(1)` texts | > 3 → **H** |
| `meta.analysisDate` | `fd.iso` | missing → **H** `footer unreadable` |
| `meta.aiModel` | `aiModel` | null or fails schema `AI` regex → **H** `ai-model` |
| `meta.sources` | px-meta text after `ที่มา:` split on `/ , · •` and ` และ ` | < 3 → **H** `sources < 3`; > 8 → keep first 8 + **F** |
| `meta.priceNote` | px-meta text between `ราคา ≈|ณ {{rd:priceDate}}` and the 52-week/ที่มา part, parentheses stripped | empty → omit |
| `meta.themeLegacy` | `rd.theme` | `MT.theme`: seed exists and every `THEME_KEYS` key rgbDist ≤ 12 vs `makeTheme(seed)` → `null` (omit); else copy the 8 keys; any key failing `SV.colorOK` → **H**; `badge`/`chgBg`/`chgColor` differing from defaults → **F** `theme.badge/chg dropped (template decoration)` |
| `meta.migratedFrom` | `ctx.headUpdated`, `ctx.v2Hash` | `{ updated, v2Hash }`; `headUpdated` null → omit the field + **F** `no committed manifest row` |
| `market` | `rd.values.px/priceDate/chgSuffix`, `rd.chart.data/gridFmt/dataFmt` | copied verbatim; `range52w` from px-meta `52 สัปดาห์ … (฿lo–฿hi)` / `฿lo – ฿hi` (numbers with the currency symbol, en/em dash or `-`) → `{lo, hi}`; absent → omit |
| `fundamentals.eps` | `values.eps` ?? EPS TTM card (`cardKey === 'eps'`, label not FY/forward) ?? printed base of the first `pe` leg | source recorded in `meta.legs`; none and a `pe` card exists → the `pe` card becomes custom (**F**) — never invent |
| `fundamentals.epsBasis` | `'adj-ttm'` if the EPS source label matches `/adj|normali[sz]ed|ปรับ/i`, `'ifrs'` if `region === 'TH'`, else `'gaap-ttm'` | |
| `fundamentals.dps/bvps/shares/revenue` | `values.*` ?? card value/.d (`yield` card `.d` `฿12/ปี` → dps · `bvps` card → bvps · `mcap` `.d` `~1.91 พันล้านหุ้น` → shares · `revenue` card → revenue) | scaled money via `LG.moneyAll` (`ล้าน`/`พันล้าน`/`M`/`B`) |
| `fundamentals.netIncome/fcf/netDebt/ebitda/roe/roa/beta/debtToEquity/roic/grossMargin/netMargin/opMargin/peAvg5y/epsForward/tbvps/occupancy/backlog/aum/dePerShare/frePerShare` | the matching catalogue card value (first number; `roe` card second `%` → `roa`; `peForward` `.d` EPS → `epsForward`; `ptbv` `.d` TBVPS → `tbvps`) | statement-currency big numbers stay in statement units; unparseable → the card becomes custom (**F**) |
| `fundamentals.fy` | `netIncomeFy`/`epsFy`/`revenueFy` cards (label `FY\d{4}` or `ปี 25xx`) | `period` = the label's `FY…` token; conflicting periods → **H** |
| `fundamentals.bank` | `nim` (`2.49%`) · `npl` (`3.0% / 324%`) · `capital` (`~16.4% / 20.9%`) cards | partial → those cards become custom (**F**) |
| `fundamentals.reportCurrency/fx` | not derivable from v2 | never set → ADR/foreign-statement reports show `$` big numbers as today (v2 also printed `$`) |
| `legs[]` | Task 4 per leg | `method` from classifier (`pbv:justified` → `pbv` with `{g, r}`); `label` = `mname` minus leading `N. ` and minus the `(บริบท…)` suffix; `inputs`/`override` from `extract` (+ `why: 'ค่าที่ผู้เขียนใช้ในใบ v2'` on override); `multipleSource`: `'median5y'` when mdesc mentions `เฉลี่ย|มัธยฐาน|5 ปี`, `'median10y'` for `10 ปี`, `'peer'` for `peer|กลุ่ม|เทียบ`, `'sector'` for `เซกเตอร์|sector|อุตสาหกรรม`, else `'peer'` + **F** `multipleSource assumed peer`; `role: 'context'` when `CONTEXT_RE` matches; `family` = `S.requiredFamily(leg)` when non-null else (`declared other` → `'rg'` **F**; `fcfyield` → `'market'`); `note` = mdesc tail not consumed by the extractor when the leg is computed (Task 0 "qualifier") — for `declared` legs `note` = full mdesc text; unclassified / not reproducing → `declared {value: mval, basis: 'other'}` + **F** `leg → declared`; `analyst` + fv → **H**; `analyst` + context → `declared` context; `empty` shell → **H** `leg unparsed` |
| `fvWeights` | `rd.fv` vs computed leg values | equal-weight mean within `max(0.005·fv, 0.01)` → `null`; family scheme reproduces → `null` + families set; otherwise `null` + **D** `FV <shown> → <computed>` (never solve); FV outside `[min, max]` of fv legs → **H** |
| `metrics.cards` | s1 cards in order | `MC.mapCards`: `cardKey(k)` in `CARD_KEYS` **and** its fundamentals fillable → `{ key, tone }` (`tone` = `vcls` or `'none'` when the catalogue default `cls` is non-empty and `vcls` is empty; omit `tone` when equal to the default); v2 `.d` text (tags stripped, `{{rd:}}` → v3 token) that differs from the template `.d` → `metrics.notes[key]` (so no author words are lost); otherwise `custom:<i>` with `{ label, value, note, tone }` verbatim (`htmlToProse`) — a custom whose value matches a price-bound token → **H** `price-bound custom card`; custom > 4 → **H** |
| `metrics.hint` | `s1hint` | |
| `text.metricsNote` | `s1paras` joined `<br>` | |
| `prose.chart` | `s2` `<p>` texts joined `<br>` | |
| `text.valHint` / `text.valIntro` | `s3hint` when ≠ the generated hint (`valHintParts`) · `s3paras` that precede the first `.vmethod` | |
| `prose.valuation` | `s3paras` after the legs joined `<br>` | |
| `prose.gauge` / `prose.mos` | `s4` `<p>` · `s5 .txt` | |
| `scenarios` | `MS.scenarios` | `years/divIncluded/perYear` from `values.scnBasis`; `driver` from `s6cols[0].top[1]` via `DRIVER` map (+ `de`/`fre`: `/\bDE\b|distributable/i`, `/\bFRE\b|fee[-\s]*related/i`); `exitMetric` from the `ออก|exit` row label via `EXIT` map (+ `evsales`: `/EV\s*\/\s*Sales/i`); outside the enums → **H**; `cases[i] = { growth, exitMultiple (printed), divCum (from `ปันผลรวม` row when literal, or `values.scenarios[i].div`), desc (`สถานการณ์` row) }`; `exitDp` = decimals of the printed exit multiple (max over the 3 columns); `baseOverride` when `driver === 'eps'` and `values.baseEps` differs from `fundamentals.eps` (`why: 'EPS ฐานฉากที่ผู้เขียนใช้'`), or for non-eps drivers when `end/(1+g)^years` differs from the fundamentals-derived start by > 0.5%; `note` = `s6paras` joined; `tgt` recomputed ≠ `values.scenarios[i].tgt` beyond half unit of the printed target → **D** |
| `analyst` | `values.analystTgt` + s8 `vcells` `เป้า…` cell | `{ target, n (parse `(\d+) ราย`), rating (parse `(strong )?(buy|sell|hold|outperform|overweight|neutral|underweight|ซื้อ|ขาย|ถือ)` → as printed, else `null`), asOf: null }`; no target → `null` |
| `catalysts` / `risks` | `li` texts → `htmlToProse` | outside 3–8 → **H** |
| `prose.verdictHeadline/verdictBody/strategy` | `s8.h2` · `s8.p` · `s8.zone` minus the `<b>กลยุทธ์:</b>` label and leading emoji | |
| `prose.disclaimerSources` | `disc` text after the last `•` | |
| `text.disclaimerAssump` | `disc` text between `โดยเฉพาะ` and `ราคาหุ้นมีความผันผวน` when it differs from the template default | |
| `extras` | `extraSecs` | a section whose body is a single `<table>` → `{ title (h2/h3), headers, rows (numbers parsed, text via htmlToProse), after: 'valuation', columns: null }`; anything else → **H** `extra section not a table` |

**Prose conversion (`MP.htmlToProse`)**: decode entities → keep `<b> <i> <br>` (lowercase, `<br>` normalised) → drop every other tag but keep its text (pills/spans/emoji glyph text kept as text; emoji **kept** — the gate treats emoji as approved-dropped only where the template prints them) → `{{rd:X}}` → `{{<v3 twin>}}` using the inverse of `TK.V2_TWIN` (unknown twin → **H** `unknown rd token`) → collapse whitespace → trim. `MP.tokenise(text, view, hits)`: (a) for every `CAND` literal (same regexes as `tools/v3/prose.js`) whose `bare()` equals the `bare(shown)` of a `P.priceBound(view)` entry **or** of the new fundamentals tokens (`eps dps bvps epsFy`) → replace with `{{token}}` (F note count); (b) `RV.proseBoundHits(zoneHtml, view.d)` hits inside this field → replace `hit.text` with `{{<v3 name of hit.token>}}` and, when `bare(hit.text) ≠ bare(rendered)`, push **D** `prose:<field> "<literal>" → {{token}}`. `MP.staleCopies(text, apx, d)`: literals equal (half-unit) to `apx.px|pe|mos|upside` and not equal to today's → `[{lit, why}]` → **D** `prose stale copies ×N`. Tokens are inserted only where the rendered text would be byte-identical or where a label owns the number — never by value proximity.

- [ ] **Step 1: Write the failing tests** — `test/v3/migrate-assemble.test.js`:

```js
'use strict';
const t = require('./_t.js')('migrate-assemble');
const fs = require('fs'), path = require('path');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const A = require('../../tools/migrate-v3/assemble.js');
const MP = require('../../tools/migrate-v3/prose.js');
const S = require('../../tools/v3/schema.js');
const C = require('../../tools/v3/compute.js');
const B = require('../../build.js');
const SEEDS = require('../../tools/seeds.json');
const FIX = path.join(__dirname, '..', 'fixtures');
const raw = (sym) => fs.readFileSync(path.join(FIX, `${sym}-v2.html`), 'utf8');
const run = (sym) => { const html = raw(sym); return A.assemble(PV.parseV2(sym, html), { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: PV.parseV2(sym, html).rd.values.priceDate, analysisPx: null }); };
const SYMS = ['AAPL', 'BBL', 'CASY', 'DDOG', 'DPZ', 'FTV', 'SRE'];
const out = Object.fromEntries(SYMS.map((s) => [s, run(s)]));
for (const s of SYMS) {
  const { doc, notes } = out[s];
  t.eq(S.validate(doc).map((e) => `${e.path}: ${e.msg}`), [], `${s}: assembled doc passes S.validate`);
  t(!('_sig' in doc), `${s}: doc is unsigned`);
  t.eq(doc.meta.migratedFrom, { updated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(raw(s)) }, `${s}: migratedFrom from ctx`);
  const rd = PV.parseV2(s, raw(s)).rd;
  t.eq([doc.market.px, doc.market.priceDate, doc.market.chgSuffix, doc.market.chart.data], [rd.values.px, rd.values.priceDate, rd.values.chgSuffix, rd.chart.data], `${s}: market lifted verbatim`);
  t(Array.isArray(notes.H) && Array.isArray(notes.D) && Array.isArray(notes.F), `${s}: notes H/D/F arrays`);
}
// BBL — bank TH · 3 legs · family scheme
{
  const { doc, notes } = out.BBL;
  t.eq([doc.currency, doc.region, doc.dateEra, doc.meta.exchange, doc.meta.company], ['THB', 'TH', 'CE', 'SET', 'ธนาคารกรุงเทพ (Bangkok Bank)'], 'BBL: top-level + exchange');
  t.eq(doc.meta.headerTags, ['Financials • Banking', 'ธนาคารใหญ่สุดด้านสินทรัพย์'], 'BBL: headerTags');
  t.eq(doc.meta.sources, ['SET', 'stockanalysis.com', 'Investing'], 'BBL: sources split on /');
  t.eq(doc.market.range52w, { lo: 139.5, hi: 197 }, 'BBL: range52w from px-meta');
  t.eq(doc.legs.map((l) => [l.method, l.role || 'fv', l.family]), [['pe', 'fv', 'market'], ['ddm', 'fv', 'rg'], ['pbv', 'fv', 'rg']], 'BBL: legs method/role/family');
  t.eq(doc.legs[2].inputs, { g: 3, r: 9.5 }, 'BBL: justified pbv inputs'); t.eq(doc.legs[2].override.roe, 7.8, 'BBL: roe override');
  t.eq(doc.fundamentals.eps, 22, 'BBL: eps from the pe leg base (values.eps absent · EPS card is FY)');
  t.eq([doc.fundamentals.dps, doc.fundamentals.shares, doc.fundamentals.bvps], [12, 1910000000, 302], 'BBL: dps/shares/bvps');
  t.eq(doc.fundamentals.fy, { period: 'FY2025', netIncome: 46007e6, eps: 24.1 }, 'BBL: fy block from FY cards');
  t.eq(doc.fundamentals.bank, { nim: 2.49, npl: 3.0, coverage: 324, cet1: 16.4, car: 20.9 }, 'BBL: bank KPIs');
  const keys = doc.metrics.cards.map((c) => (typeof c === 'string' ? c : c.key || c));
  t(keys.includes('mcap') && keys.includes('pe') && keys.includes('peAvg5y') && keys.includes('pbv') && keys.includes('nim') && keys.includes('npl') && keys.includes('capital') && keys.includes('yield'), 'BBL: catalogue keys mapped', JSON.stringify(keys));
  t((doc.metrics.custom || []).length <= 4, 'BBL: custom ≤ 4');
  t(/ใกล้ค่าเฉลี่ย/.test(doc.metrics.notes.pe || ''), 'BBL: v2 .d text preserved in metrics.notes.pe');
  t.eq(doc.scenarios.driver, 'eps'); t.eq(doc.scenarios.exitMetric, 'pe'); t.eq(doc.scenarios.cases[0].exitMultiple, 7.2, 'BBL: printed exit multiple kept'); t.eq(doc.scenarios.exitDp, 1, 'BBL: exitDp from printed decimals');
  t.eq(doc.scenarios.divIncluded, true, 'BBL: divIncluded from scnBasis');
  t.eq(doc.analyst, null, 'BBL: no analyst target');
  t(/^แบงก์อนุรักษ์นิยม/.test(doc.prose.verdictHeadline) && /^สาย value/.test(doc.prose.strategy), 'BBL: verdict headline + strategy without the กลยุทธ์ label');
  t(/Normalized EPS/.test(doc.text.disclaimerAssump || ''), 'BBL: disclaimerAssump captured');
  t(!notes.H.length, 'BBL: no HUMAN reasons', notes.H.join(' ; '));
  const v = C.compute(doc, { seeds: SEEDS });
  t(Math.abs(v.fv - 195) <= 0.01 * 195, 'BBL: recomputed FV within 1% of the shown 195 (equal weights)', String(v.fv));
  t(doc.fvWeights === null || doc.fvWeights === undefined, 'BBL: no fvWeights (scheme reproduces)');
}
// AAPL — analyst leg as fv → HUMAN · analyst block
{
  const { doc, notes } = out.AAPL;
  t(notes.H.some((h) => /analyst/.test(h)), 'AAPL: analyst target leg as fv → H');
  t.eq(doc.analyst && doc.analyst.target, 318, 'AAPL: analyst.target from values');
  t.eq(doc.meta.company, 'Apple Inc.', 'AAPL: company');
}
// FTV — h1 "(FTV)" suffix stripped · fcfyield family market
{
  const { doc } = out.FTV;
  t.eq(doc.meta.company, 'Fortive Corporation', 'FTV: "(FTV)" suffix stripped from company');
  t.eq(doc.legs[2].method, 'fcfyield'); t.eq(doc.legs[2].family, 'market', 'FTV: fcfyield family = market');
}
// DDOG — dcf not reproduced → declared other (F) · analyst → H
{
  const { doc, notes } = out.DDOG;
  t(doc.legs[1].method === 'dcf' || (doc.legs[1].method === 'declared' && doc.legs[1].inputs.basis === 'other' && doc.legs[1].inputs.value === 250), 'DDOG: dcf reproduced or declared other with the printed value');
  t(notes.H.some((h) => /analyst/.test(h)), 'DDOG: analyst leg → H');
}
// prose conversion
t.eq(MP.htmlToProse('ราคา <b>{{rd:px}}</b> และ <span class="pill">MOS</span> {{rd:mos}}<br/>บรรทัดใหม่ &amp; อื่น'), 'ราคา <b>{{px}}</b> และ MOS {{mos}}<br>บรรทัดใหม่ & อื่น', 'htmlToProse: keep b/br · drop other tags · rd → v3 twin · entities');
{
  const doc = out.SRE.doc, view = C.compute(doc, { seeds: SEEDS });
  const px = view.cur + require('../../tools/report-values.js').fmtPrice(view.d.px);
  const r = MP.tokenise(`ราคาปัจจุบัน ${px} เทียบ FV`, view, []);
  t(r.text.includes('{{px}}') && r.D.length === 0, 'tokenise: exact current price literal → {{px}} with no D');
  const r2 = MP.tokenise('ราคาปัจจุบัน $1.23 เทียบ FV', view, [{ text: '$1.23', token: 'px' }]);
  t(r2.text.includes('{{px}}') && r2.D.length === 1 && /prose/.test(r2.D[0]), 'tokenise: labelled literal ≠ rendered → token + D row');
  const r3 = MP.tokenise('ยอดซื้อคืน $1.23 ล้าน', view, []);
  t(!r3.text.includes('{{') && r3.D.length === 0, 'tokenise: unlabelled non-matching literal untouched');
}
t.done();
```

- [ ] **Step 2: Run to watch it fail** — `node test/v3/migrate-assemble.test.js` → module not found.

- [ ] **Step 3: Implement the five modules** following the mapping table. Skeleton of `assemble.js`:

```js
'use strict';
/** assemble.js — parsed v2 → v3 doc (ไม่เซ็น) + บันทึกการตัดสิน H/D/F (Plan 4b · spec §10.1) · inputs = ค่าที่ผู้เขียนพิมพ์ · ห้าม back-solve */
const S = require('../v3/schema.js'), C = require('../v3/compute.js'), TK = require('../v3/tokens.js');
const LG = require('./legs.js'), MC = require('./cards.js'), MP = require('./prose.js'), MS = require('./scenarios.js'), MT = require('./theme.js');
const RV = require('../report-values.js');

function assemble(parsed, ctx) {
  const H = [], D = [], F = [];
  const v = parsed.rd.values, sm = parsed.sm;
  const doc = { v: 3, symbol: parsed.sym, currency: sm.currency, region: sm.currency === 'THB' ? 'TH' : 'US', dateEra: v.dateEra };
  if (parsed.fd && parsed.fd.era !== v.dateEra) H.push(`era mismatch footer ${parsed.fd.era} ≠ values.dateEra ${v.dateEra}`);
  doc.meta = metaOf(parsed, ctx, H, F);
  doc.market = marketOf(parsed);
  const base = baseFundamentals(parsed, F);            // values.* + card-derived eps/dps/bvps/shares/revenue
  const legsOut = legsOf(parsed, base, H, F);           // → { legs, fund (eps from leg base when needed), meta }
  const cards = MC.mapCards(parsed, { ...base, ...legsOut.fund });
  H.push(...cards.H); D.push(...cards.D); F.push(...cards.F);
  doc.fundamentals = pruneNulls({ ...base, ...legsOut.fund, ...cards.fund });
  doc.legs = legsOut.legs; doc.fvWeights = null;
  doc.metrics = { cards: cards.cards, custom: cards.custom, notes: cards.notes, hint: parsed.s1hint ? MP.htmlToProse(parsed.s1hint) : undefined };
  const scn = MS.scenarios(parsed, doc.fundamentals); H.push(...scn.H); D.push(...scn.D); F.push(...scn.F); doc.scenarios = scn.scenarios;
  doc.analyst = analystOf(parsed);
  doc.prose = proseOf(parsed); doc.text = textOf(parsed, doc);
  doc.catalysts = parsed.catalysts.map(MP.htmlToProse); doc.risks = parsed.risks.map(MP.htmlToProse);
  doc.extras = extrasOf(parsed, H);
  // pass 1 compute (tokens need view) → weights check → tokenise prose → notes
  let view = null;
  try { view = C.compute(doc, { seeds: ctx.seeds }); } catch (e) { H.push(`compute: ${String(e.message).split('\n')[0]}`); }
  if (view) { weightsCheck(doc, view, parsed.rd.fv, H, D); tokeniseAll(doc, view, parsed, ctx, D, F); }
  return { doc: pruneUndefined(doc), notes: { H, D, F }, meta: { legs: legsOut.meta, scn: scn.meta, cards: cards.meta } };
}
module.exports = { assemble };
```

(Implement `metaOf`, `marketOf`, `baseFundamentals`, `legsOf`, `weightsCheck`, `analystOf`, `proseOf`, `textOf`, `extrasOf`, `tokeniseAll`, `pruneNulls/pruneUndefined` per the table; `weightsCheck` = `weightsFit` from the prototype `classify.js` restricted to `equal`/`family`/`unsolvable` outcomes; family assignment uses `S.requiredFamily` and, for the family scheme, sets `family` on every fv leg.) `cards.js` reuses `CC.cardKey` and `K.CATALOGUE[key].d(view)` to decide whether the v2 `.d` text differs from the template's. `theme.js` reuses `keyDist` from the prototype `classify.js` (`colorsOf` + `Math.hypot`).

- [ ] **Step 4: Run** `node test/v3/migrate-assemble.test.js` and `node test/v3/migrate-parse.test.js` → all pass. Any fixture assertion that fails because the fixture's v2 text is genuinely ambiguous is fixed in the **migrator**, not by loosening the test; if a rule in the table cannot be met for a fixture, report it as DONE_WITH_CONCERNS naming the row.

- [ ] **Step 5: Commit**

```bash
git add tools/migrate-v3/ test/v3/migrate-assemble.test.js
git commit -m "feat(migrate-v3): assemble v3 doc from parsed v2 — cards/fundamentals · legs+weights · scenarios · prose tokenisation · theme · migratedFrom (Plan 4b Task 5)"
```

---

### Task 6: `tools/migrate-v3/equiv.js` + `buckets.js` — per-zone equivalence gate, structured rd/sm diff, colour, bucket (D2 · D5) + `.ret` self-test

**Files:**
- Create: `tools/migrate-v3/equiv.js`, `tools/migrate-v3/buckets.js`
- Test: `test/v3/migrate-equiv.test.js` (new)

**Interfaces:**
- Consumes: `build.js` (`expandReport`, `loadReportSource`), `_template/v3/render.js` (`toV2Source`), `tools/v3/compute.js`, `tools/report-meta.js` (`readReportData`, `readStockMeta`), Task 5 output.
- Produces: `EQ.zones(html) → Map<id, html>` (`header`, `s1`…`s8`, `extra:<i>`, `disc`, `footer`); `EQ.compare(v2Html, v3Html, doc, view, opts) → { zones: [{ id, runs: [{ kind, del, ins, ctx }] }], textLost: string[], moved: string[], numberValue: [...], numberRounding: [...], templateDropped: string[], rd: [{ path, v2, v3 }], colour: { keys: [...], themeLegacy: boolean }, tone: [...] }`; `EQ.TEMPLATE_VOCAB` (closed `Set` of words the v2 template printed and the v3 template drops/replaces — additions only via review); `BK.bucketOf(notes, eq) → { bucket: 'CLEAN'|'VALUE-DRIFT'|'HUMAN', reasons: string[] }` implementing D5 exactly (`notes` = Task 5 `{H, D, F}`, `eq` = compare result). Task 7 wires `compare` + `bucketOf` into `sweep`/`convert`.

**Gate algorithm (implement in this order — advisor pin 6):**
1. `zones()` on both pages (same regexes; the v3 page is `expandReport(R.toV2Source(doc, view))`).
2. `norm(zoneId, html, side)` — approved transforms as normalisers applied to **both** sides: strip tags → text; decode entities; drop emoji (`\p{Extended_Pictographic}` + variation selectors); `≈` → `ณ`; in `header` remove the h1 `(SYM)` suffix and the fixed labels `ราคา ณ`, `กรอบ 52 สัปดาห์`, `ที่มา:`; in `s1` remove catalogue-card `.k` and `.d` text **only for keys the doc actually mapped** (`doc.metrics.cards` string/`{key}` entries → the template's `renderCard(key, view).k/.d` text) — custom cards are compared in full; in `s3` remove `.mname` numbering `^\d+\. ` and, for computed legs (method ≠ `declared`), the whole `.mdesc` text on **both** sides (v2 author mdesc · v3 generated `R.mdesc(leg, view)` — spec §10.2 b lists "generated mdesc" as an approved transform; dropped v2 words are counted in `templateDropped`), while `declared` legs compare `.mdesc` in full (v3 prints the note); remove the FV-box wording and the generated hint (`valHintParts`); in `s5` remove the three fixed metric cards and the calculator label; in `s6` remove `top` driver label words, row labels (`ปี N`, `ออก`, `ปันผลรวม N ปี`, `สถานการณ์`) and the `~` prefix; in `s8` remove `vcell` `.k` labels and the analyst cell; in `disc` remove the template's fixed sentences (both the v2 skeleton's and v3's); in `footer` remove everything but the date.
3. Word-level LCS diff of the normalised token arrays (`tok` = split on whitespace; Thai words are already space-delimited in these reports because the skeleton wrote them that way — no word segmentation). Runs → `classify(run)`: both sides numeric → `number` (`rounding` when `|a−b| ≤ half unit of the more precise printed decimals`, else `value`); only punctuation/symbols → `symbol`; v2-side non-empty, v3-side empty → candidate `TEXT LOST`; v3-side only → `text added`; else `text changed` (split into lost/added word sets).
4. Containment: every candidate lost word (letters ≥ 2 after stripping punctuation) is looked up in (a) `TEMPLATE_VOCAB` → `templateDropped`, (b) the whole normalised v3 page word bag → `moved`, else → `textLost`.
5. Structured diff: `RM.readReportData(v2src).data` vs `view.rd` on `fv`, `values.{px,priceDate,fvLow,fvHigh,eps,dps,bvps,shares,revenue,baseEps,analystTgt}`, `values.scenarios[i].{tgt,div}`, `chart.{min,max,grid,highlight}`, `gauge.{min,max}` (**gauge rows = F: kept in `rd` for the table, excluded from the bucket** — D5 ruling); `RM.readStockMeta(v2src)` vs `view.sm` on `pe` (>2% rel), `dividendYield` (>0.05 pp), `mos`/`upside` (>0.1 pp), `fairValue` (>0.5%). Money/2dp fields differ beyond 0.005 → row.
6. Colour: `view.theme` vs v2 `rd.theme` — for each `THEME_KEYS` key `keyDist ≤ 12` else row; `themeLegacy` present ⇒ expect 0 rows; card tone: v2 `.v` class list vs v3 (should be identical) else row; `badge`/`chgBg`/`chgColor` differences → `templateDropped`-style info.

- [ ] **Step 1: Write the failing tests** — `test/v3/migrate-equiv.test.js`:

```js
'use strict';
const t = require('./_t.js')('migrate-equiv');
const fs = require('fs'), path = require('path');
const B = require('../../build.js');
const R = require('../../_template/v3/render.js');
const C = require('../../tools/v3/compute.js');
const PV = require('../../tools/migrate-v3/parse-v2.js');
const A = require('../../tools/migrate-v3/assemble.js');
const EQ = require('../../tools/migrate-v3/equiv.js');
const BK = require('../../tools/migrate-v3/buckets.js');
const SEEDS = require('../../tools/seeds.json');
const FIX = path.join(__dirname, '..', 'fixtures');
const raw = (sym) => fs.readFileSync(path.join(FIX, `${sym}-v2.html`), 'utf8');
function migrate(sym, html) {
  const parsed = PV.parseV2(sym, html);
  const { doc, notes } = A.assemble(parsed, { seeds: SEEDS, headUpdated: '2026-09-01T00:00:00+07:00', v2Hash: B.freshHash(html), today: parsed.rd.values.priceDate, analysisPx: null });
  const view = C.compute(doc, { seeds: SEEDS });
  const v2 = B.expandReport(html), v3 = B.expandReport(R.toV2Source(doc, view));
  return { doc, view, notes, v2, v3, eq: EQ.compare(v2, v3, doc, view, { v2src: html }) };
}
// identity
{ const html = raw('BBL'); const v2 = B.expandReport(html); const z = EQ.zones(v2);
  t(z.has('header') && z.has('s1') && z.has('s8') && z.has('disc') && z.has('footer'), 'zones: header · s1…s8 · disc · footer located');
  const parsed = PV.parseV2('BBL', html); const { doc } = A.assemble(parsed, { seeds: SEEDS, headUpdated: null, v2Hash: B.freshHash(html), today: parsed.rd.values.priceDate, analysisPx: null });
  const view = C.compute(doc, { seeds: SEEDS });
  const same = EQ.compare(v2, v2, doc, view, { v2src: html });
  t(same.textLost.length === 0 && same.numberValue.length === 0 && same.zones.every((z) => !z.runs.length), 'compare(page, page) → no runs'); }
// acceptance: the five non-HUMAN fixtures lose no author word (spec §11 row 4b: CLEAN มี TEXT LOST = 0)
for (const sym of ['BBL', 'CASY', 'DPZ', 'FTV', 'SRE']) {
  const m = migrate(sym, raw(sym));
  t.eq(m.eq.textLost, [], `${sym}: TEXT LOST = 0`);
  const b = BK.bucketOf(m.notes, m.eq);
  t(b.bucket !== 'HUMAN', `${sym}: bucket is CLEAN or VALUE-DRIFT (${b.bucket}: ${b.reasons.join(' ; ')})`);
}
for (const sym of ['AAPL', 'DDOG']) { const m = migrate(sym, raw(sym)); const b = BK.bucketOf(m.notes, m.eq); t(b.bucket === 'HUMAN' && b.reasons.some((r) => /analyst/.test(r)), `${sym}: HUMAN (analyst leg)`); }
// Review Focus 5a / spec §10.2 d — never mask a written region: a word injected into a token-bearing .ret cell must surface as TEXT LOST
{
  const html = raw('BBL').replace(/(<div class="ret[^"]*">\{\{rd:sc1ret\}\})/, '$1 มะม่วงสุกงอม');
  t(/มะม่วงสุกงอม/.test(html), 'mutation applied (anchor found)');
  const m = migrate('BBL', html);
  t(m.eq.textLost.includes('มะม่วงสุกงอม'), '.ret injected word → TEXT LOST (region not masked)', JSON.stringify(m.eq.textLost));
  t(BK.bucketOf(m.notes, m.eq).bucket === 'HUMAN', 'TEXT LOST → HUMAN');
}
// Review Focus 5b — moved paragraph is "moved", not lost
{
  const m0 = migrate('SRE', raw('SRE'));
  const doc = JSON.parse(JSON.stringify(m0.doc));
  const moved = doc.prose.valuation; doc.prose.valuation = 'ย่อหน้าสั้น'; doc.prose.chart = doc.prose.chart + '<br>' + moved;
  const view = C.compute(doc, { seeds: SEEDS });
  const eq = EQ.compare(m0.v2, B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: raw('SRE') });
  t(eq.textLost.length === 0 && eq.moved.length > 0, 'paragraph moved to another zone → moved, not lost', JSON.stringify({ lost: eq.textLost, moved: eq.moved.slice(0, 5) }));
}
// a word deleted from the v3 side → TEXT LOST
{
  const m0 = migrate('SRE', raw('SRE'));
  const doc = JSON.parse(JSON.stringify(m0.doc));
  const w = doc.prose.verdictBody.split(' ').find((x) => x.length >= 4 && !/\{\{/.test(x));
  doc.prose.verdictBody = doc.prose.verdictBody.replace(w, '').replace(/\s+/g, ' ');
  const view = C.compute(doc, { seeds: SEEDS });
  const eq = EQ.compare(m0.v2, B.expandReport(R.toV2Source(doc, view)), doc, view, { v2src: raw('SRE') });
  t(eq.textLost.includes(w.replace(/[^\p{L}\p{N}]/gu, '')), `verdict word "${w}" deleted → TEXT LOST`, JSON.stringify(eq.textLost));
}
// structured diff catches an engine-visible change the text compare cannot see
{
  const m0 = migrate('SRE', raw('SRE'));
  const view = { ...m0.view, rd: { ...m0.view.rd, chart: { ...m0.view.rd.chart, max: m0.view.rd.chart.max + 10 } } };
  const eq = EQ.compare(m0.v2, m0.v3, m0.doc, view, { v2src: raw('SRE') });
  t(eq.rd.some((r) => r.path === 'chart.max'), 'structured diff: chart.max change → rd row', JSON.stringify(eq.rd));
  const b = BK.bucketOf(m0.notes, eq); t(b.bucket !== 'CLEAN', 'rd row → not CLEAN');
}
// number classification
t.eq(EQ.classifyNumber('฿163', '฿162.80'), 'rounding', 'number run within printed precision → rounding');
t.eq(EQ.classifyNumber('฿163', '฿170.10'), 'value', 'number run beyond → value');
t.eq(EQ.classifyNumber('8.7x', '8.68x'), 'rounding', 'multiple within half unit → rounding');
t(EQ.TEMPLATE_VOCAB instanceof Set && EQ.TEMPLATE_VOCAB.has('เฉลี่ย') && EQ.TEMPLATE_VOCAB.has('มัธยฐาน'), 'TEMPLATE_VOCAB is a closed Set with the known template words');
t.done();
```

- [ ] **Step 2: Run to watch it fail** — `node test/v3/migrate-equiv.test.js` → module not found.

- [ ] **Step 3: Implement `equiv.js`** — start from the prototype (`cp …/proto/equiv.js tools/migrate-v3/equiv.js`): keep `zones`, `tok`, `diffRuns`, `classify`; replace the `run()` file-writer with `compare()`; add `norm()`, containment, `classifyNumber(a, b)`, the structured diff, colour, `TEMPLATE_VOCAB` (seed it with: `เฉลี่ย มัธยฐาน ราคา ณ ≈ TTM ปัจจุบัน มูลค่าเหมาะสม Fair Value กรอบ เป้าหมาย ปี ออก ปันผลรวม สถานการณ์ จุดเข้า ฐาน EPS รอบปี ตั้งแต่ IPO ราย เป้านักวิเคราะห์ ด. ส่วนต่างจากราคา MOS ที่มา สัปดาห์ Stock Analysis Dashboard ข้อมูล สร้างด้วย stock-analyzer workflow คำเตือน โดยประมาณ` — then extend only with words the 7 fixtures still drop, each addition justified in a code comment). `buckets.js`:

```js
'use strict';
/** buckets.js — 3 ถังของ migration (spec §10.4 · plan D5) · HUMAN > VALUE-DRIFT > CLEAN · เหตุผลทุกข้อคืนเป็นข้อความสำหรับตาราง sweep */
function bucketOf(notes, eq) {
  const H = [...notes.H], D = [...notes.D];
  if (eq.textLost.length) H.push(`TEXT LOST ×${eq.textLost.length}: ${eq.textLost.slice(0, 8).join(' ')}`);
  if (eq.colour && eq.colour.keys.length) H.push(`theme keys off > 12: ${eq.colour.keys.join(' ')}`);
  for (const r of eq.numberValue) D.push(`${r.zone}: ${r.del} → ${r.ins}`);
  for (const r of eq.rd) D.push(`rd/sm ${r.path}: ${r.v2} → ${r.v3}`);
  if (H.length) return { bucket: 'HUMAN', reasons: H.concat(D.map((d) => 'D: ' + d)) };
  if (D.length) return { bucket: 'VALUE-DRIFT', reasons: D };
  return { bucket: 'CLEAN', reasons: notes.F.slice() };
}
module.exports = { bucketOf };
```

- [ ] **Step 4: Run** `node test/v3/migrate-equiv.test.js` → all pass (iterate on `TEMPLATE_VOCAB`/normalisers until the five fixtures reach TEXT LOST = 0 — every vocabulary addition gets a one-line comment naming the fixture and zone that needed it). Then `node test/v3-test.js`.

- [ ] **Step 5: Commit**

```bash
git add tools/migrate-v3/equiv.js tools/migrate-v3/buckets.js test/v3/migrate-equiv.test.js
git commit -m "feat(migrate-v3): per-zone equivalence gate (approved transforms → containment → TEXT LOST) · rd/sm structured diff · colour · 3 buckets + .ret self-test (Plan 4b Task 6)"
```

---

### Task 6b: schema homes for author text the sweep found (`text.chartHint` · `scenarios.hintNote` · `scenarios.cases[i].retNote` · `multipleSource: 'author'`) — schema + render + assemble (plan amendment 25 ก.ย. 69 · advisor-approved design)

> **Why this task exists.** The Task 6 sweep + review showed ~213 non-HUMAN reports carry author words in three template zones that v3 had no field for: the §2 chart hint ("(รายเดือน · ที่มา: Yahoo Finance)", 108 docs), the §6 head qualifier ("(TTM adj.)", "ไม่มีปันผล (buyback แทน)", 74 docs) and annotations inside `.ret` ("(รวมปันผล)"). A normaliser that drops them masks author text (spec §10.2 "ข้อความหาย = HUMAN เสมอ"), so the only non-masking route to TEXT LOST = 0 is a field. The review also found `assemble` stamping `multipleSource: 'median5y'` on 968/1,080 legs from the words เฉลี่ย/average/มัธยฐาน anywhere in the mdesc — a misattribution (AVGO: 38x is a **premium** over a 26.7x median; ADSK "ต่ำกว่าค่าเฉลี่ยในอดีต"; ACE peer P/BV). Below the spec's "not polish" threshold and left HUMAN for 4c: legend annotations (11 docs), words inside `.gdots` (9), a third §8 vcell (14).

**Files:**
- Modify: `tools/v3/schema.js` (`TEXT_KEYS` + `'chartHint'` · `scenarios` closed list + `'hintNote'` · `cases[i]` closed list + `'retNote'` · `ENUM.multipleSource` + `'author'`)
- Modify: `_template/v3/render.js` (§2 hint · §6 hint · `.ret` · `SRC_NAME.author`)
- Modify: `tools/migrate-v3/assemble.js` (`multipleSourceOf`, §2/§6 hint residue), `tools/migrate-v3/scenarios.js` (`retNote`)
- Test: `test/v3/schema.test.js`, `test/v3/render.test.js`, `test/v3/migrate-assemble.test.js` (extend)

**Interfaces:**
- Consumes: Task 5 `assemble`/`scenarios` · Task 6 `EQ.compare` (to prove FTV/DPZ-class residue reaches TEXT LOST 0 without a normaliser).
- Produces: three optional string fields (prose strings — rendered through `pr()`, tokens allowed, `[<>]` rejected like every other prose field) and one enum value. **Absent fields render byte-identically to today** — `npm run build` after this task must leave `dist/OGE.html` and `dist/ICC.html` unchanged (checked in Step 5). Task 6's fix round narrows the s2/s6 hint normalisers to the exact template strings and relies on these fields for the residue.

- [ ] **Step 1: schema tests (failing first)**
  - `text.chartHint: 'x'` accepted · `text.foo` rejected (closed) · `chartHint` with `<` rejected.
  - `scenarios.hintNote: '(TTM adj.)'` accepted · `scenarios.cases[1].retNote: '(รวมปันผล)'` accepted · unknown keys still rejected.
  - `legs[i].inputs.multipleSource: 'author'` accepted for every MULT method; `requiredFamily` = `'market'` for it (same as peer/sector).
  Run `node test/v3/schema.test.js` → the new assertions FAIL.
- [ ] **Step 2: schema implementation** — `TEXT_KEYS = ['valHint', 'valIntro', 'metricsNote', 'disclaimerAssump', 'chartHint']`; `closed(s, 'scenarios', [..., 'note', 'hintNote'])` + `str(s.hintNote, 'scenarios.hintNote', { req: false })`; `closed(c, p, ['growth', 'exitMultiple', 'divCum', 'desc', 'retNote'])` + `str(c.retNote, …, { req: false })`; `ENUM.multipleSource` gets `'author'` with the comment `// 'author' = ตัวคูณที่ผู้วิเคราะห์กำหนดเอง (ไม่ใช่มัธยฐาน/peer/sector) — migrator ใช้เมื่อ mdesc ไม่ได้บอกว่าตัวคูณคือมัธยฐาน`. Tests pass.
- [ ] **Step 3: render tests (failing first)** — with the fields absent the §2 hint is exactly `<div class="hint">โดยประมาณ</div>`, the §6 hint ends exactly as today, `.ret` prints only the token; with `text.chartHint: 'A'` → `<div class="hint">โดยประมาณ A</div>`; with `scenarios.hintNote: 'B'` → the §6 hint contains ` B{{rd:scnNote}}` (note before the dividend token); with `cases[1].retNote: 'C'` → `<div class="ret {{rd:sc2retClass}}">{{rd:sc2ret}} C</div>` (note rendered through `pr()`); `SRC_NAME.author === 'ผู้วิเคราะห์กำหนด'` so a pe leg with `multipleSource: 'author'` prints `× P/E 38.0x (ผู้วิเคราะห์กำหนด)`. Run → FAIL.
- [ ] **Step 4: render implementation** — render.js §2: `` `<div class="hint">โดยประมาณ${doc.text && doc.text.chartHint ? ' ' + pr(doc.text.chartHint) : ''}</div>` ``; §6: insert `${s.hintNote ? ' ' + pr(s.hintNote) : ''}` **before** `{{rd:scnNote}}` (review correction 25 ก.ย. 69: v2 authors wrote their qualifier before the dividend note; placing it after re-attaches "(GAAP)" to "รวมปันผล" — byte-identical when absent); `.ret`: `{{rd:sc${i + 1}ret}}${c.retNote ? ' ' + pr(c.retNote) : ''}`; `SRC_NAME.author`. Tests pass; `node test/v3-test.js` render/schema suites green.
- [ ] **Step 5: DIST-PROOF pre-check** — `npm run build && git diff --no-index --stat <main dist snapshot> dist/OGE.html dist/ICC.html` (or `git stash`-free: build on `main` in a scratch worktree once, keep the two files, compare) → identical. Record the two sha256 in the report.
- [ ] **Step 6: assemble tests (failing first)** —
  - DPZ-shaped fixture (§2 hint `โดยประมาณ (รายเดือน, Yahoo Finance)`) → `doc.text.chartHint === '(รายเดือน, Yahoo Finance)'`; template-only hint → no `chartHint` key.
  - FTV-shaped §6 hint `จากจุดเข้า {{rd:px}} • EPS ฐาน ~{{rd:baseEps}} (TTM GAAP){{rd:scnNote}}` → `scenarios.hintNote === '(TTM GAAP)'`; a hint that equals the template form exactly (incl. `• รวมปันผล`) → no key.
  - `.ret` cell `+42.3% (รวมปันผล)` → `cases[i].retNote === '(รวมปันผล)'`, the number itself never copied.
  - `multipleSourceOf`: `"P/E 38x — premium เหนือมัธยฐาน 5 ปี 26.7x"` → `'author'` (+F `multipleSource author (premium/discount vs median)`); `"P/E มัธยฐาน 5 ปี 15.2x"` → `'median5y'`; `"ต่ำกว่าค่าเฉลี่ยในอดีต"` → `'author'`; `"peer P/BV 1.4x"` → `'peer'`; no wording → `'author'` (+F; **never** `peer`); `median10y` only when the 10-year window is what the multiple is called.
  - Gate proof: `EQ.compare` on the FTV and DPZ fixtures with the s2/s6 hint normalisers reduced to the exact template strings → `textLost` has no `adj`/`GAAP`/`รายเดือน`/`Yahoo`.
  Run → FAIL.
- [ ] **Step 7: assemble implementation** — §2: strip the exact leading `โดยประมาณ` (and surrounding whitespace) from the parsed hint; non-empty residue → `text.chartHint` (+F `chart hint kept`). §6: strip the template prefix by regex `^จากจุดเข้า\s+\S+\s+•\s+.+?ฐาน\s+~\S+` and an optional trailing `• รวมปันผล`; residue → `scenarios.hintNote` (+F). `.ret`: text after the first `%` number → `cases[i].retNote` (+F). `multipleSourceOf(mdesc)`: (a) find the multiple token; (b) `median5y/10y` only when `มัธยฐาน|median` is within 40 chars of that token **and** no `premium|discount|พรีเมียม|ส่วนลด|สูงกว่า|ต่ำกว่า|เหนือ|under|above|below` lies between them; (c) `peer` / `sector` by the existing wording; (d) otherwise `'author'` (+F naming the leg). Tests pass; `node test/v3-test.js` exit 0 apart from the two known DPZ assertions (Task 6 fix round swaps that fixture).
- [ ] **Step 8: read-only corpus sweep** — report `multipleSource` histogram before/after (`median5y` 968 → ?), how many legs became `author`, `chartHint`/`hintNote`/`retNote` counts, and TEXT LOST docs with the s2/s6 normalisers reduced to template strings (expect ≤ 263 − ~180).
- [ ] **Step 9: commit**
```bash
git add tools/v3/schema.js _template/v3/render.js tools/migrate-v3/assemble.js tools/migrate-v3/scenarios.js test/v3/schema.test.js test/v3/render.test.js test/v3/migrate-assemble.test.js
git commit -m "feat(v3): schema homes for migrated author text — text.chartHint · scenarios.hintNote · cases[i].retNote · multipleSource 'author' (never misattribute a median) · render prints when present (Plan 4b Task 6b)"
```

### Task 7: CLI `tools/migrate-v3.js sweep | convert` + `analysis-px` + sweep docs generator · run the real read-only sweep

**Files:**
- Create: `tools/migrate-v3.js`, `tools/migrate-v3/analysis-px.js`, `tools/migrate-v3/report.js` (md/csv writer)
- Modify: `package.json` (script `"migrate:v3": "node tools/migrate-v3.js"`)
- Test: `test/v3/migrate-cli.test.js` (new)
- Artefacts (second commit): `docs/superpowers/specs/2026-09-25-v3-migration-sweep.md` + `.csv`

**Interfaces:**
- Consumes: Tasks 4–6, `tools/v3/io.js` (`write`, `read`, `verifySig`, `freshHash`), `test/check-v3.js` (`checkDoc`), `build.js` (`freshHash`, `expandReport`, `loadReportSource`), `tools/report-source.js` (`list`, `kindOf`).
- Produces: CLI
  - `node tools/migrate-v3.js sweep [--reports-dir D] [--only SYM…] [--limit N] [--no-stale] [--head-manifest FILE] [--out PATHBASE]` → writes `PATHBASE.md` + `PATHBASE.csv` (default `docs/superpowers/specs/<today>-v3-migration-sweep`), prints `sweep: N ใบ · CLEAN a · VALUE-DRIFT b · HUMAN c · TEXT LOST ใน CLEAN 0`. Read-only.
  - `node tools/migrate-v3.js convert <SYM> [--reports-dir D] [--write] [--accept-drift] [--head-manifest FILE] [--no-stale]` → prints bucket, reasons, eq summary; exit 0 CLEAN · 2 VALUE-DRIFT · 1 HUMAN/error (no `--write`). With `--write`: refuses HUMAN (exit 1) and VALUE-DRIFT without `--accept-drift` (exit 2); otherwise `IO.write(D/<SYM>.json, doc)` → `fs.unlinkSync(D/<SYM>.html)` → `checkDoc(written, {seeds, today})` must have 0 errors else restore the `.html`, delete the `.json`, exit 1. **Safety:** `--write` against the real `reports/` (path equal to `ROOT/reports`) is refused unless env `MIGRATE_V3_ALLOW_REAL=1` (Plan 4c sets it; this PR never does outside the scratch rehearsal).
  - `AP.analysisPx(sym, footerRaw, { root }) → { px, pe, mos, upside } | null` (git `log -S` on the footer string → `show` → `readStockMeta`), memoised per run; `--no-stale` ⇒ `null` for all. **Runtime pin (advisor):** `git log --reverse --format=%H --diff-filter=AM -S <raw> -- reports/<SYM>.html | head -1` (oldest hit = the analysis commit) — never the full `-S` walk without `--reverse`; `sweep` prints `… N/909` progress every 50 reports; if the first 50 take > 2 min, run the whole sweep once with `--no-stale`, report both timings, and let the controller rule on `proseStale`.
  - `RP.writeSweep(rows, { out, head, date })` — md sections: summary counts · **HUMAN** table (symbol · market · reasons) · **VALUE-DRIFT** table (symbol · market · D rows) · **CLEAN** symbol list per market · F-note histogram · "how to regenerate" line; csv columns `symbol,market,bucket,reasons,legs,fvLegs,textLost,numberValue,rdRows,proseStale,customCards,fNotes,driftClass,maxDeltaPct` — **`driftClass`** (additive, ruling 25 ก.ย. 69): `''` for CLEAN/HUMAN; for VALUE-DRIFT one of `gauge-only` (no D rows/non-gauge rd rows — cannot occur after the gauge=F ruling, kept for the enum) · `fv-rounding` (only fv/fvLow/fvHigh/sm.fairValue/sm.mos/sm.upside rows, every |Δ| ≤ 1% of the v2 value) · `scn-tgt` (only scenario tgt/div rows or `scn.*.tgt` D notes, |Δ| ≤ 1%) · `index` (only sm.pe/sm.dividendYield rows) · `prose-stale` (only `prose stale copies` D notes) · `multi-rounding` (two or more of the fv-rounding / scn-tgt / index row kinds present, every |Δ| within the rounding bound — amendment 25 ก.ย. 69 after the real sweep put 434 docs in `mixed`, 201 of them with every Δ ≤ 1%) · `mixed` (anything else or any Δ beyond the bound); **rounding bound** = |Δ| ≤ 1% relative for money/multiple quantities, and ≤ 0.5 percentage points absolute for percent-point quantities (`sm.mos`, `sm.upside`, `sm.dividendYield`) so a near-zero MOS does not inflate `mixed`; **`maxDeltaPct`** = max |v3 − v2| / |v2| × 100 over the doc's rd/sm rows and D-note pairs, 2 dp (`0` when none; percent-point quantities contribute their absolute point difference, labelled as such in the md column note). HUMAN rows carry `maxDeltaPct` too (stated in the md). The md **VALUE-DRIFT** table gets `driftClass` and `maxDeltaPct` columns and a per-class count line in the summary.

- [ ] **Step 1: Write the failing tests** — `test/v3/migrate-cli.test.js`:

```js
'use strict';
const t = require('./_t.js')('migrate-cli');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const IO = require('../../tools/v3/io.js');
const CV = require('../../test/check-v3.js');
const SEEDS = require('../../tools/seeds.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-cli-'));
const REP = path.join(tmp, 'reports'); fs.mkdirSync(REP);
const SYMS = ['AAPL', 'BBL', 'CASY', 'DDOG', 'DPZ', 'FTV', 'SRE'];
for (const s of SYMS) fs.copyFileSync(path.join(ROOT, 'test', 'fixtures', `${s}-v2.html`), path.join(REP, `${s}.html`));
const MAN = path.join(tmp, 'reports.json');
fs.writeFileSync(MAN, JSON.stringify(SYMS.map((s) => ({ symbol: s, updated: '2026-09-01T00:00:00+07:00', hash: 'x' }))));
const cli = (args) => { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'migrate-v3.js'), ...args], { encoding: 'utf8', cwd: ROOT }); return { code: r.status, out: r.stdout + r.stderr }; };
const common = ['--reports-dir', REP, '--head-manifest', MAN, '--no-stale'];
// sweep
{
  const out = path.join(tmp, 'sweep');
  const r = cli(['sweep', ...common, '--out', out]);
  t(r.code === 0 && /sweep: 7 ใบ · CLEAN \d+ · VALUE-DRIFT \d+ · HUMAN 2/.test(r.out), 'sweep: 7 fixtures · HUMAN 2 (AAPL DDOG)', r.out.slice(-400));
  t(fs.existsSync(out + '.md') && fs.existsSync(out + '.csv'), 'sweep writes md + csv');
  const csv = fs.readFileSync(out + '.csv', 'utf8').trim().split('\n');
  t(csv.length === 8 && /^symbol,market,bucket,reasons,legs,fvLegs,textLost,numberValue,rdRows,proseStale,customCards,fNotes,driftClass,maxDeltaPct$/.test(csv[0]), 'csv header + 7 rows', csv[0]);
  t(/AAPL,US,HUMAN/.test(csv.join('\n')) && /DDOG,US,HUMAN/.test(csv.join('\n')) && /BBL,TH,(CLEAN|VALUE-DRIFT)/.test(csv.join('\n')), 'csv buckets');
  const md = fs.readFileSync(out + '.md', 'utf8');
  t(/## HUMAN/.test(md) && /## VALUE-DRIFT/.test(md) && /## CLEAN/.test(md) && /migrate-v3\.js sweep/.test(md), 'md has the three bucket sections + regenerate line');
  t(fs.existsSync(path.join(REP, 'AAPL.html')) && !fs.existsSync(path.join(REP, 'AAPL.json')), 'sweep is read-only');
  const r2 = cli(['sweep', ...common, '--out', out, '--only', 'SRE', 'FTV']); t(/sweep: 2 ใบ/.test(r2.out), '--only limits the sweep');
  const r3 = cli(['sweep', ...common, '--out', out, '--limit', '3']); t(/sweep: 3 ใบ/.test(r3.out), '--limit limits the sweep');
}
// convert — refusals (Review Focus 3)
{
  const r = cli(['convert', 'AAPL', ...common, '--write']);
  t(r.code === 1 && /HUMAN/.test(r.out) && fs.existsSync(path.join(REP, 'AAPL.html')) && !fs.existsSync(path.join(REP, 'AAPL.json')), 'convert --write on HUMAN → refused, nothing written or deleted');
  const r2 = cli(['convert', 'AAPL', ...common, '--write', '--accept-drift']);
  t(r2.code === 1 && !fs.existsSync(path.join(REP, 'AAPL.json')), '--accept-drift does not override HUMAN');
  const rr = cli(['convert', 'BBL', '--write', '--reports-dir', path.join(ROOT, 'reports'), '--head-manifest', MAN, '--no-stale']);
  t(rr.code === 1 && /MIGRATE_V3_ALLOW_REAL/.test(rr.out), '--write against the real reports/ refused without MIGRATE_V3_ALLOW_REAL=1');
}
// convert — write path
{
  const dry = cli(['convert', 'BBL', ...common]);
  t([0, 2].includes(dry.code) && /BBL/.test(dry.out) && /(CLEAN|VALUE-DRIFT)/.test(dry.out), 'convert dry-run prints the bucket', dry.out.slice(0, 300));
  const r = cli(['convert', 'BBL', ...common, '--write', '--accept-drift']);
  t(r.code === 0 && fs.existsSync(path.join(REP, 'BBL.json')) && !fs.existsSync(path.join(REP, 'BBL.html')), 'convert --write: .json written, .html removed', r.out.slice(-300));
  const doc = IO.read(path.join(REP, 'BBL.json'));
  t(IO.verifySig(doc), 'written doc is signed by io.js');
  const g = CV.checkDoc(doc, { seeds: SEEDS, today: doc.market.priceDate, stage: 'save' });
  t.eq(g.errors.map((e) => e.id), [], 'written doc passes checkDoc (save stage)');
  t.eq(doc.meta.migratedFrom.updated, '2026-09-01T00:00:00+07:00', 'migratedFrom.updated from --head-manifest');
  const again = cli(['convert', 'BBL', ...common]);
  t(again.code === 1 && /เป็นใบ v3 แล้ว|already v3/.test(again.out), 'convert on an already-migrated symbol → refused');
}
t.done();
```

- [ ] **Step 2: Run to watch it fail** — `node test/v3/migrate-cli.test.js` → CLI missing.

- [ ] **Step 3: Implement** `tools/migrate-v3.js` (argument parsing by hand like `tools/report.js parseArgs`; `main()` guarded by `require.main`; export `runSweep`, `runConvert` for tests), `analysis-px.js` (from the prototype, per-symbol function + Map cache), `report.js` (md/csv). `convert` pipeline per symbol: `RS.kindOf` must be `'v2'` (v3 → refuse "เป็นใบ v3 แล้ว") → `PV.parseV2` → `A.assemble(parsed, ctx)` → `C.compute` → `EQ.compare(expandReport(raw), expandReport(toV2Source(doc, view)), doc, view, {v2src: raw})` → `BK.bucketOf` → (write path) `IO.write` + `unlinkSync` + `checkDoc`. `ctx.headUpdated` from `--head-manifest` or `git show HEAD:reports.json` (`cp.execFileSync('git', ['show', 'HEAD:reports.json'], {cwd: ROOT})`); `ctx.v2Hash = B.freshHash(raw)`; `ctx.today = parsed.rd.values.priceDate` for the sweep gate clock (a sweep must not depend on the wall clock — E27 is not a migration property). Add the `package.json` script.

- [ ] **Step 4: Run** `node test/v3/migrate-cli.test.js` → pass; `node test/v3-test.js`; `rtk proxy npm run verify` exit 0.

- [ ] **Step 5: Commit the code**

```bash
git add tools/migrate-v3.js tools/migrate-v3/analysis-px.js tools/migrate-v3/report.js package.json test/v3/migrate-cli.test.js
git commit -m "feat(migrate-v3): CLI sweep|convert (read-only sweep · guarded write) + analysis-px + sweep md/csv writer (Plan 4b Task 7)"
```

- [ ] **Step 6: Run the real sweep (read-only)**

Run: `cd /Users/somchai.s/Downloads/stock-v3-plan4b && time node tools/migrate-v3.js sweep --out docs/superpowers/specs/2026-09-25-v3-migration-sweep 2>&1 | tail -5; echo "exit ${PIPESTATUS[0]}"; git status --short reports/ | wc -l`
Expected: `sweep: 909 ใบ · CLEAN … · VALUE-DRIFT … · HUMAN …`, exit 0, `reports/` status 0 lines. Runtime guidance: ~909 × (parse + compute + 2 expands + git log -S) — expect 5–15 min; if it exceeds 30 min stop and report (do not commit a partial file).

Then: `rtk proxy grep -c "^| " docs/superpowers/specs/2026-09-25-v3-migration-sweep.md; awk -F, 'NR>1{print $3}' docs/superpowers/specs/2026-09-25-v3-migration-sweep.csv | sort | uniq -c` — the counts must match the summary line. Record the three counts and the top-10 HUMAN reasons in your report.

- [ ] **Step 7: Commit the artefacts**

```bash
git add docs/superpowers/specs/2026-09-25-v3-migration-sweep.md docs/superpowers/specs/2026-09-25-v3-migration-sweep.csv
git commit -m "docs(v3): Plan 4b read-only sweep of 909 v2 reports — CLEAN/VALUE-DRIFT/HUMAN tables (Task 7)"
```

---

### Task 8: Queue — automatic v3 pre-patch · `ship --prepatch` accepts market-only `.json` · `ship <SYM>` adds the deleted `.html` · `ship --migrate` (open-items 66)

**Files:**
- Modify: `tools/queue/preflight.js` (`patchTargets`, `parseGateFailures`, new `parseV3PatchResult`, `preflight()` gate/revert branch, remove `v3Lines`), `tools/queue/ship.js` (`prepatchBlockers` v3 entries, `shipPrepatch` hashes, `filesToAdd`, `shipMigrate`, exports), `tools/queue.js` (usage + `ship --migrate`), `tools/queue/args.js` (add `'--migrate'` to `VALUE_FLAGS` — otherwise the quoted symbol list becomes the positional `sym`)
- Tests pinning the old behaviour to **replace** (same commit): `test/queue-test.js:1652` (`skippedV3` = ZTS), `:1653–1658` (three `v3Lines` assertions), `:1700` (`ptAge.skippedV3`), `:1542–1549` (`.json` = foreign in `prepatchBlockers`/`prepatchRefusal` — the refusal helper keeps working on `foreign`, only the classification of `.json` changes)
- Test: `test/queue-test.js`

**Interfaces:**
- Consumes: `tools/update-prices.js` per-symbol v3 lines (`✓ SYM …` write · `= SYM v3 …` unchanged · `❄ SYM freeze [reason] …` · `⚠ SYM patch fail (v3) …`), `IO.freshHash`, `IO.read`, `sh.run/must`, `S` (state).
- Produces: `P.patchTargets(rows, m) → { target, v3, skippedUS, skippedTH, skippedNoReport }` (no `skippedV3`; `v3` ⊆ `target`); `P.parseGateFailures(out)` matches `^✗\s+(\S+)\.(?:html|json)\b`; `P.parseV3PatchResult(out, syms) → { written, unchanged, rejected: [{sym, reason}], failed }`; `Sh.prepatchBlockers(entries)` accepts entries `{ path, from, untracked, headFooterISO, workFooterISO, v3?, headHash?, workHash? }` — a top-level `reports/<SYM>.json` is a **candidate** when `headHash === workHash` (market-only change), `blocked` when they differ or the file is new/renamed, `unreadable` when a hash is missing; `Sh.filesToAdd(sym, exists, trackedDeleted) → string[]`; `Sh.migratePlan(syms, probe) → { files, refusals }` (pure; `probe(sym) → { json, html, headHtml, headJson }` booleans); `Sh.shipMigrate(syms, { model, noPush })`; `npm run queue -- ship --migrate "SYM SYM…" --model sonnet|opus [--no-push]`.

- [ ] **Step 1: Write the failing tests** — in `test/queue-test.js`:

(a) Section 13 (`parseGateFailures`, ~line 599): add `ok(P.parseGateFailures('✗ ZTS.json 3/5 ผ่าน — 2 ปัญหา\n    ✗ [E51] …').join(',') === 'ZTS', 'parseGateFailures (4b): ใบ v3 .json ก็ถูกจับ');`

(b) `patchTargets` block (~line 146): replace any assertion on `skippedV3` (grep `skippedV3` — currently none outside the v3 sandbox block; the sandbox block ~line 1640 asserts `patchTargets` skips ZTS — replace it) with:

```js
    const tv3 = P.patchTargets([{ symbol: 'ZTS', bucket: 'LIGHT', currency: 'USD', v3: true, skip: null }, { symbol: 'AAPL', bucket: 'LIGHT', currency: 'USD', v3: false, skip: null }], { usOpen: false, setOpen: false, allowIntraday: false });
    ok(tv3.target.join(',') === 'ZTS,AAPL' && tv3.v3.join(',') === 'ZTS' && tv3.skippedV3 === undefined, 'v3/preflight (4b): ใบ v3 เข้า pre-patch อัตโนมัติ · รายชื่อ v3 แยกให้ preflight ใช้ทาง gate ของ update-prices', JSON.stringify(tv3));
    ok(typeof P.v3Lines === 'undefined', 'v3/preflight (4b): v3Lines ถูกถอด (ไม่มีบรรทัดคำสั่งมืออีก)');
    const pv = P.parseV3PatchResult(['✓ ZTS        71.33 → 72.10 (+1.1%) · v3 market @2026-09-25 · MOS −5.2%', '= OGE        v3 ไม่มี session ใหม่ — 44.28 @2026-09-24 เท่าเดิม ไม่เขียน', '❄ ICC        freeze [patch-rejected] ตอนเขียน — E52 … · ไม่เขียนไฟล์', '⚠ XYZ        patch fail (v3) ตอนเขียน — JSON เสีย · ไม่เขียนไฟล์', '✓ AAPL       200 → 201 (+0.5%)'].join('\n'), ['ZTS', 'OGE', 'ICC', 'XYZ']);
    ok(pv.written.join(',') === 'ZTS' && pv.unchanged.join(',') === 'OGE' && pv.rejected.length === 1 && pv.rejected[0].sym === 'ICC' && pv.rejected[0].reason === 'patch-rejected' && pv.failed.join(',') === 'XYZ', 'v3/preflight (4b): parseV3PatchResult แยก written/unchanged/rejected/failed · ไม่นับใบ v2 (AAPL)', JSON.stringify(pv));
```

Delete the existing `v3Lines` assertions (grep `v3Lines` in the test) in the same edit.

(c) `prepatchBlockers` v3 (sandbox block ~line 1542 — replace the "fail closed … .json = foreign" assertion) and Review Focus 2:

```js
    const pb = Sh.prepatchBlockers([
      { path: 'reports/NEWV3.json', untracked: true, v3: true, headHash: null, workHash: 'aaaaaaaaaaaa' },
      { path: 'reports/ZTS.json', untracked: false, v3: true, headHash: 'bbbbbbbbbbbb', workHash: 'bbbbbbbbbbbb' },
      { path: 'reports/OGE.json', untracked: false, v3: true, headHash: 'cccccccccccc', workHash: 'dddddddddddd' },
      { path: 'reports/ICC.json', untracked: false, v3: true, headHash: null, workHash: 'eeeeeeeeeeee' },
      { path: 'reports/README.md', untracked: true },
      { path: 'reports/KLAC.html', untracked: false, headFooterISO: '2026-09-10', workFooterISO: '2026-09-10' },
    ]);
    ok(pb.foreign.join(',') === 'reports/README.md' && pb.blocked.join(',') === 'NEWV3,OGE' && pb.unreadable.join(',') === 'ICC',
      'v3/ship (4b): .json market-only (hash เท่า) = ผ่าน · hash ต่าง (worker เขียน — Review Focus 2) / ไฟล์ใหม่ = blocked · อ่าน hash ไม่ได้ = unreadable · ไฟล์อื่น = foreign', JSON.stringify(pb));
```

(d) `filesToAdd` + `migratePlan` (new, in the sandbox block):

```js
    const fta = Sh.filesToAdd('BBL', (f) => f !== 'reports/BBL.html' && f !== 'tools/seeds.json', (f) => f === 'reports/BBL.html');
    ok(fta.includes('reports/BBL.json') && fta.includes('reports/BBL.html') && !fta.includes('tools/seeds.json'), 'v3/ship (4b): filesToAdd รวม .html ที่ถูกลบ (tracked-deleted) · ไม่รวมไฟล์ที่ไม่มี', fta.join(','));
    const mp = Sh.migratePlan(['BBL', 'ZTS', 'NEW1'], (s) => ({ BBL: { json: true, html: false, headHtml: true, headJson: false }, ZTS: { json: true, html: false, headHtml: false, headJson: true }, NEW1: { json: true, html: false, headHtml: false, headJson: false } })[s]);
    ok(mp.files.join(',') === 'reports/BBL.json,reports/BBL.html' && mp.refusals.length === 2 && /ZTS/.test(mp.refusals[0]) && /NEW1/.test(mp.refusals[1]),
      'v3/ship (4b): migratePlan — BBL (HEAD .html · worktree .json) = migrate · ZTS (HEAD .json อยู่แล้ว) / NEW1 (ไม่มีใน HEAD) = refuse', JSON.stringify(mp));
```

- [ ] **Step 2: Run to watch them fail** — `node test/queue-test.js 2>&1 | grep -E "4b|ผ่าน$" | tail -12`.

- [ ] **Step 3: Implement**

`preflight.js`:

```js
function patchTargets(rows, m) {
  const cur = new Map(rows.map((r) => [r.symbol, r.currency]));
  const v3 = new Set(rows.filter((r) => r.v3).map((r) => r.symbol));
  const out = { target: [], v3: [], skippedUS: [], skippedTH: [], skippedNoReport: [] };
  for (const sym of prePatchList(rows)) {
    const c = cur.get(sym);
    if (c == null) { out.skippedNoReport.push(sym); continue; }
    const th = c === 'THB';
    if (!m.allowIntraday && !th && m.usOpen) { out.skippedUS.push(sym); continue; }
    if (!m.allowIntraday && th && m.setOpen) { out.skippedTH.push(sym); continue; }
    out.target.push(sym); if (v3.has(sym)) out.v3.push(sym);   // ใบ v3 (Plan 4b · #66): update-prices --write --force เขียนจริง + gate ใต้ lock เอง (Plan 3) — ไม่ต้อง check-reports/ไม่มีไฟล์ให้คืน
  }
  return out;
}
/** ผลรายใบ v3 จาก stdout ของ update-prices (Plan 3 applyV3 พิมพ์บรรทัดเดียวต่อใบ) — ส่วนบริสุทธิ์ · นับเฉพาะ syms ที่ส่งมา */
function parseV3PatchResult(out, syms) {
  const want = new Set(syms), r = { written: [], unchanged: [], rejected: [], failed: [] };
  for (const line of String(out).split('\n')) {
    const m = /^([✓=❄⚠])\s+(\S+)\s+(.*)$/.exec(line.trim());
    if (!m || !want.has(m[2])) continue;
    if (m[1] === '✓') r.written.push(m[2]);
    else if (m[1] === '=' && /v3/.test(m[3])) r.unchanged.push(m[2]);
    else if (m[1] === '❄') r.rejected.push({ sym: m[2], reason: (/\[([a-z-]+)\]/.exec(m[3]) || [, 'freeze'])[1] });
    else if (m[1] === '⚠' && /patch fail \(v3\)/.test(m[3])) r.failed.push(m[2]);
  }
  return r;
}
```

`parseGateFailures`: `/^✗\s+(\S+)\.(?:html|json)\b/`. In `preflight()` after `run('node', ['tools/update-prices.js', '--write', '--force', ...t.target])`: `const v2T = t.target.filter((s) => !t.v3.includes(s)); const pv = parseV3PatchResult(r.out, t.v3);` → gate `check-reports` only when `v2T.length`; `applyGateResult(s.stocks, v2T, failed, today)`; for v3: `applyGateResult(s.stocks, t.v3, pv.rejected.map((x) => x.sym).concat(pv.failed), today)`; set `row.prePatchRejected` for those; revert loop only over `failed` (v2). Print `ℹ v3 pre-patch: เขียน N · ไม่เปลี่ยน U · ปฏิเสธ R (gate ใต้ lock · ไม่เขียนไฟล์) · ล้ม F` when `t.v3.length`. Remove `v3Lines` and its call; update the module docblock and exports (`parseV3PatchResult` added, `v3Lines` removed).

`ship.js`:

```js
const V3_REPORT_RE = /^reports\/([^/]+)\.json$/;
function prepatchBlockers(entries) {
  const blocked = [], unreadable = [], foreign = [];
  const under = (p) => typeof p === 'string' && UNDER_REPORTS.test(p);
  const isReport = (p) => V2_REPORT_RE.test(p) || V3_REPORT_RE.test(p);
  for (const e of entries) {
    const m2 = V2_REPORT_RE.exec(e.path), m3 = V3_REPORT_RE.exec(e.path);
    if (e.from != null) {
      for (const p of [e.from, e.path]) if (under(p) && !isReport(p)) foreign.push(p);
      if (m2 || m3) blocked.push((m2 || m3)[1]);
      else if (!under(e.path)) foreign.push(e.path);
      continue;
    }
    if (!m2 && !m3) { if (under(e.path)) foreign.push(e.path); continue; }
    const sym = (m2 || m3)[1];
    if (e.untracked) { blocked.push(sym); continue; }
    if (m3) {   // ใบ v3 (Plan 4b · #66): pre-patch = market/_sig เท่านั้น ⇒ freshHash (ไม่นับ market/_sig) ของ HEAD กับ worktree ต้องเท่ากัน · ต่าง = worker เขียน (blocked) · อ่านไม่ได้ = unreadable
      if (e.headHash == null || e.workHash == null) unreadable.push(sym);
      else if (e.headHash !== e.workHash) blocked.push(sym);
      continue;
    }
    // …existing v2 footer logic unchanged…
  }
  return { blocked, unreadable, foreign };
}
```

In `shipPrepatch()` entry construction: for `V3_REPORT_RE` paths compute `headHash` = `IO.freshHash(JSON.parse(run('git', ['show', `HEAD:${e.path}`]).out))` (null on failure) and `workHash = IO.freshHash(IO.read(fp))` (null on failure), set `v3: true`; the state update loop after push uses `(V2_REPORT_RE.exec(p) || V3_REPORT_RE.exec(p))`. Update the docblock line "fail closed … .json" to the new rule.

```js
/** ไฟล์ที่ ship <SYM> จะ add — รวม path ที่ถูกลบแล้วยัง tracked (−.html ของใบที่ migrate) · ส่วนบริสุทธิ์ */
function filesToAdd(sym, exists, trackedDeleted) { return STOCK_FILES(sym).filter((f) => exists(f) || trackedDeleted(f)); }
const trackedDeletedFn = (f) => /^(?: D|D )/.test(run('git', ['status', '--porcelain', '--', f]).out);
```

`shipStock`: `const files = filesToAdd(sym, (f) => fs.existsSync(path.join(ROOT, f)), trackedDeletedFn);`.

```js
/** แผน ship --migrate (ส่วนบริสุทธิ์): ใบที่ migrate = worktree มี .json ไม่มี .html · HEAD มี .html ไม่มี .json → add ทั้งคู่ (−.html +.json) */
function migratePlan(syms, probe) {
  const files = [], refusals = [];
  for (const s of syms) {
    const p = probe(s);
    if (!p.json) { refusals.push(`${s}: ไม่มี reports/${s}.json ใน worktree — ยังไม่ได้ convert`); continue; }
    if (p.html) { refusals.push(`${s}: reports/${s}.html ยังอยู่ — convert ต้องลบใบ v2 ในคำสั่งเดียวกัน`); continue; }
    if (p.headJson) { refusals.push(`${s}: HEAD มี reports/${s}.json อยู่แล้ว — ไม่ใช่การ migrate (ใช้ ship ${s})`); continue; }
    if (!p.headHtml) { refusals.push(`${s}: HEAD ไม่มี reports/${s}.html — ใบใหม่ ไม่ใช่การ migrate (ใช้ ship ${s})`); continue; }
    files.push(`reports/${s}.json`, `reports/${s}.html`);
  }
  return { files, refusals };
}
function shipMigrate(symsArg, opts) {
  const o = opts || {};
  const syms = String(symsArg || '').split(/[\s,]+/).filter(Boolean).map((s) => s.toUpperCase());
  if (!syms.length) throw new Error('ship --migrate ต้องระบุ symbol อย่างน้อย 1 ตัว ("BBL CASY")');
  const tr = trailer(resolveModel('migrate', null, o.model));
  const probe = (s) => ({ json: fs.existsSync(path.join(ROOT, 'reports', `${s}.json`)), html: fs.existsSync(path.join(ROOT, 'reports', `${s}.html`)),
    headHtml: run('git', ['cat-file', '-e', `HEAD:reports/${s}.html`]).code === 0, headJson: run('git', ['cat-file', '-e', `HEAD:reports/${s}.json`]).code === 0 });
  const plan = migratePlan(syms, probe);
  if (plan.refusals.length) throw new Error(plan.refusals.join('\n'));
  verify(); keepDates();
  const files = plan.files.concat(['reports.json', 'tools/seeds.json'].filter((f) => run('git', ['status', '--porcelain', '--', f]).out.trim()));
  must('git', ['add', '--', ...files], 'git add');
  must('git', commitArgs(`migrate: v3 ${syms.join(' ')}\n\n${tr}`, files), 'git commit');
  console.log(`✅ migrate: v3 ${syms.join(' ')} — commit แล้ว (${plan.files.length / 2} ใบ · −.html +.json)`);
  if (!shouldPush(o)) { console.log(NO_PUSH_NOTE); return; }
  pushWithRebase();
  console.log('✅ push แล้ว');
}
```

(`resolveModel('migrate', null, o.model)` throws the existing "ไม่มี model" message when `--model` is absent — acceptable: the migration commit needs an explicit trailer.) Export `V3_REPORT_RE, filesToAdd, migratePlan, shipMigrate`. `tools/queue.js`: usage line `ship --migrate "SYM SYM…" --model sonnet|opus [--no-push]`; in `case 'ship'`: `if (has('--migrate')) { if (sym || has('--prepatch')) throw new Error('ship: --migrate ใช้เดี่ยว ๆ (ไม่คู่กับ <SYM>/--prepatch)'); sh.shipMigrate(val('--migrate'), { model: val('--model'), noPush: has('--no-push') }); break; }` before the `--prepatch` branch. Note `parseArgs` may treat the quoted symbol list as `sym` — check `tools/queue/args.js`; if `val('--migrate')` returns the next token, the quoted `"BBL CASY"` is one token and works.

- [ ] **Step 4: Run** `node test/queue-test.js 2>&1 | tail -3` → all pass; `rtk proxy npm run verify` exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/queue/preflight.js tools/queue/ship.js tools/queue.js test/queue-test.js
git commit -m "feat(queue): v3 pre-patch automatic (update-prices gate under lock) · ship --prepatch accepts market-only .json · ship adds deleted .html · ship --migrate (open-items 66 · Plan 4b Task 8)"
```

---

### Task 9: Docs · rehearsal (two-build gate + `ship --migrate --no-push` on real reports in a scratch worktree) · full gate · DIST-PROOF · PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` (§3.1 dcf row → `stages`; §3.3 `exitDp`/`evsales`; §8 mechanism = `meta.migratedFrom` + gate proof; §10 sweep result numbers + link; §11 row "Plan 4b" exit evidence; §13-3 done), `docs/decisions.md` (new block "### Report v3 Plan 4b — migrator + sweep (25 ก.ย. 69)": D1–D5, sweep counts, rehearsal, DIST-PROOF, review trail), `docs/open-items.md` (row 66 → "ปิดแล้ว (Report v3 Plan 4b)"; new rows only for things the sweep surfaced that 4c cannot absorb), `docs/price-refresh.md` (v3 rows: automatic pre-patch; `ship --prepatch` accepts market-only `.json`), `.claude/skills/stock-controller/SKILL.md` §9 bullet "ใบ v3" and `CLAUDE.md` §9 bullet "ใบ v3" (**byte-identical**: preflight pre-patches v3 rows automatically · `ship --migrate` for 4c), `docs/templates.md` (one bullet: migration v2→v3 = `tools/migrate-v3.js` · buckets · 4c batches)
- Scratch: `/Users/somchai.s/Downloads/stock-v3-plan4b-scratch` (branch `scratch-plan4b`), removed at the end.

- [ ] **Step 1: Docs edits** — make the edits above; the stub rule: copy the SKILL bullet into CLAUDE.md verbatim. Then

Run: `node tools/gen-docs.js --check && node test/docs-test.js; echo "docs exit $?"` → expected 0.

- [ ] **Step 2: Full gate at the head**

Run: `cd /Users/somchai.s/Downloads/stock-v3-plan4b && rtk proxy npm run verify > /tmp/p4b-verify.log 2>&1; echo "verify exit $?"; tail -3 /tmp/p4b-verify.log; GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js 2>&1 | grep -E "✗|^[✓✗]" ; echo "v3-test exit ${PIPESTATUS[0]}"`
Expected: verify exit 0 (check-site error 0 / warning 0); every v3 test file `✓` under the hook env.

- [ ] **Step 3: Rehearsal — two-build `updated` gate + `ship --migrate` on the lowest-drift report per market (CLEAN if any, else VALUE-DRIFT with `driftClass=fv-rounding`, `textLost=0`, smallest `maxDeltaPct` — ruling 25 ก.ย. 69: the sweep has CLEAN 0; `updatedFor`/`ship --migrate` do not depend on the bucket) (scratch worktree · real reports · never pushed)**

Pick symbols from the committed sweep (CLEAN first; otherwise the lowest `maxDeltaPct` among VALUE-DRIFT `fv-rounding` rows with `textLost` 0): `pick(){ awk -F, -v m="$1" 'NR>1 && $2==m && $3=="CLEAN"{print 0","$1} NR>1 && $2==m && $3=="VALUE-DRIFT" && $7==0 && $(NF-1)=="fv-rounding"{print $NF","$1}' docs/superpowers/specs/2026-09-25-v3-migration-sweep.csv | sort -t, -k1,1n | head -1 | cut -d, -f2; }; TH=$(pick TH); US=$(pick US); echo $TH $US` (a CSV row's `reasons` column must be quoted so `$7`/`$NF` stay positional — Task 7 quotes it).

```bash
S=/Users/somchai.s/Downloads/stock-v3-plan4b-scratch
cd /Users/somchai.s/Downloads/stock-v3-plan4b && git worktree add -b scratch-plan4b "$S" HEAD >/dev/null && cd "$S"
git status --short reports.json | wc -l   # (0) expect 0 — headUpdated comes from HEAD:reports.json, build #1 reads the working-tree file; they must be the same file
OLD_TH=$(node -e 'const m=JSON.parse(require("fs").readFileSync("reports.json"));console.log(m.find(r=>r.symbol===process.argv[1]).updated)' $TH)
# (1) convert (real write inside the scratch only)
MIGRATE_V3_ALLOW_REAL=1 node tools/migrate-v3.js convert $TH --write; echo "convert exit $?"
MIGRATE_V3_ALLOW_REAL=1 node tools/migrate-v3.js convert $US --write; echo "convert exit $?"
ls reports/$TH.* reports/$US.*            # expect only .json for both
node test/check-v3.js $TH $US | tail -3   # expect ✓ ✓
# (2) build #1 → updated must equal HEAD's (migratedFrom rule)
rtk proxy npm run build >/dev/null; node -e 'const m=JSON.parse(require("fs").readFileSync("reports.json"));for(const s of process.argv.slice(1))console.log(s,m.find(r=>r.symbol===s).updated,m.find(r=>r.symbol===s).file)' $TH $US
# expect: <OLD_TH> <TH>.html · <old US> <US>.html
# (3) keepDates (preserve-dates + build #2) → unchanged
node tools/preserve-dates.js | tail -2; rtk proxy npm run build >/dev/null
git diff --stat -- reports.json | tail -1; rtk proxy git diff -- reports.json | grep -c '"updated"'   # expect 0
# (4) ship --migrate --no-push → commit −.html +.json
npm run queue -- ship --migrate "$TH $US" --model opus --no-push; echo "ship exit $?"
git show --stat HEAD | grep -E "reports/|reports.json"   # expect: reports/$TH.html (deleted) · reports/$TH.json · reports/$US.html · reports/$US.json · reports.json
# (5) build #3 after the commit → still unchanged
rtk proxy npm run build >/dev/null; git status --short reports.json | wc -l   # expect 0
rtk proxy git diff HEAD~1 HEAD -- reports.json | grep -c '"updated"'          # expect 0
# (6) gate on the live page: node tools/migrate-v3.js convert $TH (dry run on the migrated symbol → refusal "เป็นใบ v3 แล้ว") — the equivalence result itself was printed by the --write run in (1); record its bucket + F notes
```

Also capture, from the scratch head: `node tools/migrate-v3.js convert $TH` (dry run on the already-migrated symbol → refusal "เป็นใบ v3 แล้ว") and `npm run queue -- preflight --no-patch --allow-dirty 2>&1 | grep -iE "v3|$TH|$US" | head` (v3 rows listed without manual lines). Then clean up:

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan4b && git worktree remove --force "$S" && git branch -D scratch-plan4b && git status --short | wc -l   # expect 0
```

Record every observed value (symbols, `updated` before/after ×3, commit stat, grep counts) in `docs/decisions.md` "ซ้อม (Task 9)" and commit the docs.

- [ ] **Step 4: DIST-PROOF**

```bash
BASE=6e7b6e3c0; HEAD=$(git rev-parse HEAD)
rm -rf /tmp/p4b-base /tmp/p4b-head && mkdir -p /tmp/p4b-base /tmp/p4b-head
git archive $BASE | tar -x -C /tmp/p4b-base && git archive $HEAD | tar -x -C /tmp/p4b-head
(cd /tmp/p4b-base && rtk proxy npm run build >/dev/null 2>&1); (cd /tmp/p4b-head && rtk proxy npm run build >/dev/null 2>&1)
rtk proxy diff -rq /tmp/p4b-base/dist /tmp/p4b-head/dist; echo "dist diff exit $?"
```
Expected: no output, exit 0 → **DIST IDENTICAL** (record the file count: `find /tmp/p4b-head/dist -type f | wc -l`). Also `git diff --stat $BASE HEAD -- reports/ | wc -l` → 0.

- [ ] **Step 5: Commit docs + proofs**

```bash
git add docs/ CLAUDE.md .claude/skills/stock-controller/SKILL.md
git commit -m "docs(v3): Plan 4b — spec §8/§10/§11/§13 · decisions (D1–D5 · sweep · rehearsal · DIST-PROOF) · open-items 66 closed · price-refresh/stub v3 rows"
```

- [ ] **Step 6: PR** — body in the scratchpad (`pr-plan4b-body.md`, same structure as the Plan 4a body: what changes for the live site = nothing · design pins · code · docs · review trail · exit evidence · diff), then `gh pr create --repo iam1412/stock-analysis --base main --head feat/report-v3-plan4b --title "Report v3 — Plan 4b: migrate-v3 + read-only sweep (no production change)" --body-file <path>`. (Controller step, after the final whole-branch review; merge only after the advisor's pre-merge approval.)

---

## Self-review

- **Spec coverage:** §3.1 dcf N-stage (T2) · §3.3 exitMultiple not back-solved + `exitDp` + `evsales` (T2/T5) · §3.6 unaffected (no field removed) · §8 mechanism + two-build gate (T3/T9) · §10.1 legs/weights/prose rules (T4/T5) · §10.2 equivalence gate incl. (d) self-test (T6) · §10.3 colour + tone `none` (T1/T6) · §10.4 buckets + docs table (T6/T7) · §10 schema gaps (T1) · §11 row 4b deliverables incl. queue #66 + `ship` −.html +.json + `migrate: v3` message (T8) · §13-1 (commit shape left to 4c, tool ready) · §13-3 (T2) · §13-4/5/6 respected by the classifier (analyst fv → HUMAN, `sm.pe` recomputed, context legs computed). Gap: `#65` (E17 counting weight-0 legs) is not touched — the migrator never emits weight-0 fv legs (context legs get `role:'context'`), so 65 stays an open item, noted in T9 docs.
- **Placeholder scan:** none of "TBD/TODO/implement later"; Task 5's module bodies are specified by the mapping table + skeleton + tests (the table is the contract, each row testable).
- **Type consistency:** `assemble(parsed, ctx) → {doc, notes:{H,D,F}, meta}` used identically in T6/T7 tests; `EQ.compare(v2Html, v3Html, doc, view, {v2src})` in T6/T7; `BK.bucketOf(notes, eq)`; `P.patchTargets → {target, v3, …}`; `Sh.migratePlan(syms, probe)`; `b.updatedFor(old, h, mf, nowISO)`; `IO.write`/`IO.read`/`IO.verifySig`/`IO.freshHash` names match `tools/v3/io.js`.
- **Review Focus:** 1 → T4 (empty shell) · 2 → T8 (`prepatchBlockers` hash mismatch) · 3 → T7 (HUMAN refuse) · 4 → T3 (`updatedFor` after UPDATE) · 5 → T6 (`.ret` + moved paragraph).
