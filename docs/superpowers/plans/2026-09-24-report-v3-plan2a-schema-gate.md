# Report v3 — Plan 2a: Schema extension (§3.6 A–O) + rule B precision (§4) + P3 gate (`check-v3.js`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every gap Task 0 measured on the three real fixtures (BBL bank · EQIX REIT · FER SOTP/EUR) gets a first-class, optional, closed schema slot. Rule B stops firing on correct prose. A JSON-reading gate `test/check-v3.js` (E50/E51/E52/W30/W31 + the kept codes) runs inside `npm run verify`. Production is untouched: no `reports/*.json`, no page changes, `dist/` byte-identical.

**Architecture:** All new fields are optional. When a field is absent, the code path is the Plan 1 path byte-for-byte, so the corpus parity test (`test/v3/tokens-corpus.test.js`, 909 v2 value sets) stays green after every task. New behaviour lives in the existing single-owner modules: `tools/v3/schema.js` (shape), `tools/v3/legs.js` (formulas), `tools/v3/compute.js` (weights/ranges/currency), `tools/v3/cards.js` (catalogue), `tools/v3/prose.js` (rule B, `{{lit:}}`), `_template/v3/render.js` (DOM). Two small new modules: `tools/safe-values.js` (colour/format allowlist shared by `build.js` and the schema, open-item #50) and `tools/v3/extras.js` (extras cell formatting + the E52 SOTP tie-out). The gate `test/check-v3.js` computes the new codes and the valuation/freshness codes natively from JSON. It passes every other kept code through the v2 gate on the rendered page (the render smoke test of spec §9). Each schema task ends by editing the real fixture it unblocks. The last task proves the spec §12 exit criteria.

**Tech Stack:** Node ≥20.19, CommonJS, no dependencies. Tests are plain Node scripts using `test/v3/_t.js`, run by `test/v3-test.js`.

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md`. The binding sections are §3.6 A–O, §4 (rule B precision), §9 (gate codes), §11 (Plan 2a row), §12 (exit criteria) and §13 (items 4 and 5). Evidence: `docs/superpowers/specs/2026-09-24-{BBL,EQIX,FER,zts}-v3-compare.md`, fixtures `test/fixtures/v3/*-real.json`, open-items #50 #51 #53 (`docs/open-items.md`). Style reference: `docs/superpowers/plans/2026-09-24-report-v3-plan1-core-render.md`.

**Out of scope (Plan 2b):** the `tools/report.js` CLI (`init/export/save/show/diff`), the PreToolUse hook, scanners reading `.json`, worker docs (SKILL/agent-prompt/stock-controller/CLAUDE.md prose), removing the tripwire `test/v3/no-json-reports.test.js`, and save-runs-compute (#52).

## Execution Notes (subagent-driven)

- Worktree `/Users/somchai.s/Downloads/stock-v3-plan2`, branch `feat/report-v3-plan2`. Do not create another worktree, except the throwaway base checkout in Task 13.
- Implementers and reviewers are **Opus** subagents. Every implementer prompt carries these standing prohibitions: **never push** · **never call `advisor`** · **never spawn subagents** · **never write under `reports/` or `reports.json`** · **never edit `test/check-reports.js`, `tools/report-values.js` or `tools/derived-values.js` to make a v3 test pass**. If a v2-gate check fires on a v3 render, fix the v3 side (wording, fixture, template), or stop and report.
- Reviewers of Task 1 (rule B), Task 5 (weights) and Task 12 (gate) must show the new test *can* fail: flip one expected value, watch it go red, then revert.
- Fixture edits are done with the exact `node -e` script given in the step, never by hand. Each script asserts the source text it replaces, so a drifted fixture fails loudly instead of being half-edited.

## Global Constraints

- **Every new field is optional.** Absent means the Plan 1 behaviour, byte-for-byte. Objects stay closed: an unknown key is an error with a JSON path.
- **Corpus parity stays green after every task:** `node test/v3-test.js` includes `tokens-corpus` (909 v2 value sets, 0 token mismatches). Its ≥97% acceptance threshold is **not** tightened here: open-item #53 defers that decision to P6/P7.
- **Zero production effect:** `test/v3/no-json-reports.test.js` stays. No file under `reports/` and no `reports.json` change. `dist/` built at the Plan 2a base and at the head must be identical (proved in Task 13).
- No new npm dependency. Node ≥20.19. CommonJS `'use strict'`.
- `tools/v3/*` must not `require` `build.js`, `tools/update-prices.js` or `test/check-reports.js` (cycle rule). `test/check-v3.js` may require all of them.
- Number formatting reuses `RV.fmtPrice`, `RV.fmtBig`, `RV.TOKENS`, `DV.fmtMos`. Never re-implement their rounding. Dividend yield is 2 dp site-wide (`RV.TOKENS.yield`).
- Negative numbers that the template formats itself use **U+2212 `−`**, never ASCII `-`.
- UI strings are Thai and follow the existing template wording. Do not invent CSS classes. `render.js` may only use classes from `_template/skeleton-th.html` plus `.xtab`, `.xnote` from Plan 1.
- Percent inputs are in percent units (`g: 8` = 8%). Per-share money (eps, dps, bvps, ffoPerShare, d1, fy.eps) is in the **quote currency** (`doc.currency`). Whole-company totals (revenue, netIncome, fcf, ebitda, netDebt, fy.netIncome, fy.revenue) are in the **statement currency**: `fundamentals.reportCurrency` if set (Task 10), else `doc.currency`.
- Prose slots accept only `<b> <i> <br>` + `**bold**`, go through rule B and render tokens. Every new prose slot must be added to `P.proseFields()` in the same task.
- Commit after every task on `feat/report-v3-plan2`, message style `feat(v3): …` / `test(v3): …`, ending with exactly these trailers:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP
  ```
- Use `rtk proxy <cmd>` for any command whose output you count or diff (the rtk hook truncates output otherwise).

## Review Focus

1. **Malformed or nested `{{lit:…}}`** (`{{lit:{{px}}}}`, an unclosed `{{lit:`, or a lit with no `meta.litReasons` entry) → a schema error naming the prose path. Raw braces must never reach the page, where they would fire E13. Pinned in Task 1.
2. **Mixed family weighting.** Some `fv` legs carry `family` and others do not; a context leg has non-zero `fvWeights`; every leg is context → schema error naming the leg. `fvWeights` + `family` together → explicit `fvWeights` wins, and `family` still drives the (r,g) layer-0 check. Pinned in Task 5.
3. **`ddm2` that cannot price.** `horizon: null` with `r ≤ g2` → a thrown error naming `legs[i]`. `horizon: 0`, or a missing `horizon` key → schema error. `NaN`/`Infinity` must never reach the page. Pinned in Task 6.
4. **Statement-currency mismatches.**
   - `reportCurrency` without `fx`, `fx` without `reportCurrency`, or `reportCurrency === currency` with `fx ≠ 1` → schema error.
   - A negative statement total renders as `−€1.31B`, never `€-1307.00M`.
   - Price-bound ratios (P/S, EV/EBITDA, FFO margin) always divide quote-currency money by quote-currency money.
   Pinned in Task 10.
5. **Extras tables that don't add up.**
   - A `total` row that differs from Σ data rows beyond rounding → E52.
   - `fx: true` with no `fundamentals.fx` → schema error.
   - `sumCol` pointing at a text column → schema error.
   - A negative cell renders with U+2212.
   Pinned in Task 11.

---

## Spec ambiguities ruled in this plan (the controller may overturn any of them)

- **R1 `meta.litReasons` shape** = object map `{ "<exact text inside the lit>": "reason ≥5 chars" }`. Every lit needs a key. A key that no lit uses is an error. One key covers every occurrence of that literal (BBL uses `9.0x` twice with one reason).
- **R2 Rule B applies unit-skipping to W31 too.** `countMoneyLiterals` shares the `CAND` regexes, so `$80M` / `฿46,007 ล้าน` are no longer counted as stale price literals. They are statement totals, which is the same reasoning as §4 item 3.
- **R3 E17 is a gate code, not a schema rule.** `schema.validate` still requires 2–4 legs in total and ≥1 `fv` leg, which `compute` needs to produce an FV. The "≥2 `fv` legs" rule of §13 item 4 is `E17` in `check-v3`, with the same meaning as the v2 E17, so reusing the number is allowed. Consequence: `EQIX-real` computes and renders (v2 gate on render 0/0, FV unchanged) but `check-v3` reports exactly `E17` for it. That is the HUMAN-bucket verdict §13.4 predicts. The fixture sweep expects it explicitly.
- **R4 Kept §9 codes.**
  - Computed natively from JSON in 2a: `E17 E27 W07 W09 W18 W25`, plus the new `E50 E51 E52 W30 W31`.
  - Passed through the v2 gate on the rendered page, reported as `v2:<id>`: `E28 E32 E34–E40 W08 W12 W13` and every structural code. This is the "render smoke test" of §9.
  - Why defer the native port of the pass-through codes to P7: during the transition `test/check-reports.js` is their single owner. Porting now would duplicate rules that P7 rewrites when the HTML half of the checker is deleted. Because the page is rendered from the JSON, their verdict is exact.
  - `W21 W24` are dead: no free text is parsed.
  - `|MOS| > 40%` (layer 0) is deferred. Its pass condition ("a method not using (r,g) confirms it") needs an owner-defined rule. Today it is a manual controller check (`docs/quality-gate.md` ชั้น 0).
- **R5 Rule B stays save-time only.** `check-v3` does not run `checkRuleB`: a daily price move would make exact matches flicker, as §9 says. The daily gate uses W31.
- **R6 `text.valHint` set** → the §3 hint shows it, and the FV box label becomes the neutral `มูลค่าเหมาะสม (Fair Value)`. The generated words ถ่วงน้ำหนัก/เฉลี่ย could contradict the author's hint. `text.disclaimerAssump` replaces only the list after the fixed word `โดยเฉพาะ`.
- **R7 EQIX's context leg stays `declared` (`role: 'context'`).** Its multiple is the *current* P/AFFO, which `multipleSource` bans by design (§3.1). A `pffo` leg would have to lie about its source. This satisfies "no declared leg where a method now exists", because no legal method exists for it. ZTS-real's declared leg (single-stage Gordon on FCF) also has no v3 method, so it stays declared.
- **R8 `ffoPerShare` is the TTM driver.** EQIX's scenario base stays in `scenarios.baseOverride` (42.99 = `ffoForward.value`). §3.6 J does not define a "base from forward" switch, and adding one is out of scope.
- **R9 `unit: 'ccy'` in `extras[].columns`** uses the statement-currency symbol (`reportCurrency` if set, else the quote currency).

---

## File Structure

| Path | Responsibility | Tasks |
|---|---|---|
| `tools/v3/prose.js` (modify) | `{{lit:}}`, rule B precision, `litsOf`/`countLits`/`malformedLitPaths`, defensive `proseFields` | 1, 3, 11 |
| `tools/v3/schema.js` (modify) | every new optional field; lit↔reason check; allowlists; family/role/range rules | 1–11 |
| `tools/safe-values.js` (create) | colour + `gridFmt`/`dataFmt` allowlist — one owner for `build.js` and the schema (#50) | 2 |
| `build.js` (modify) | import the allowlist from `tools/safe-values.js` (behaviour identical) | 2 |
| `_template/v3/render.js` (modify) | notes render tokens; JSON `<` escape; text slots; card order/tone; hint/box; context legs; ddm2/medianWindow/ifrs mdesc; analyst n/a; FFO labels; extras rows | 2–11 |
| `tools/v3/cards.js` (modify) | `peAvg5y` label; FY, bank and REIT cards; statement-currency money | 2, 6, 8, 9, 10 |
| `tools/v3/legs.js` (modify) | `ddm2` | 6 |
| `tools/v3/compute.js` (modify) | `weightsOf` (role/family), `multipleRange` bounds, quote-currency fundamentals `fq`, `stmtCur` | 5, 10 |
| `tools/v3/tokens.js` (modify) | `{{pffo}}`, `{{pffoForward}}` | 9 |
| `tools/v3/io.js` (modify) | `TOP_ORDER` gains `text` | 3 |
| `tools/v3/extras.js` (create) | extras cell formatting (U+2212), table totals, `tieOut()` for E52 | 11 |
| `test/check-v3.js` (create) | the v3 gate + CLI (reports/*.json strict + real-fixture sweep) | 12 |
| `test/v3/real-fixtures.test.js` (create) | per real fixture: FV pinned, rule B 0 errors, v2 gate on render 0/0 (+ exit criteria in Task 13) | 1, 13 |
| `test/v3/check-v3.test.js` (create) | JSON meta-test: mutate JSON → each code fires | 12 |
| `test/v3/{prose,schema,cards,compute,legs,render}.test.js` (modify) | unit tests per task | 1–11 |
| `test/fixtures/v3/{BBL,EQIX,FER}-real.json` (modify) | drop escape hatches as slots land | 1–11, 13 |
| `package.json`, `tools/gen-docs.js`, `README.md`, `docs/quality-gate.md` (+ gen-docs outputs) | wire `check-v3` into `verify` | 12 |

---

### Task 1: Rule B precision (§4) + `{{lit:…}}` + `meta.litReasons` (#51) + lit count

**Files:**
- Modify: `tools/v3/prose.js` (TOKEN_RE area, `renderProse`, `proseFields`, `CAND`, `checkRuleB`, `countMoneyLiterals`, exports)
- Modify: `tools/v3/schema.js` (top `require`, `meta` block, end of `validate`)
- Modify: `test/v3/prose.test.js`, `test/v3/schema.test.js`
- Create: `test/v3/real-fixtures.test.js`
- Modify: `test/fixtures/v3/BBL-real.json` (wrap two `9.0x` in `{{lit:}}` + one reason)

**Interfaces:**
- Produces (prose.js):
  - `LIT_RE`: `/\{\{lit:([^{}]+)\}\}/g`.
  - `stripSpans(text) → string`: lits and tokens replaced by `' '`.
  - `litsOf(doc) → [{path, text}]`.
  - `countLits(doc) → number`.
  - `malformedLitPaths(doc) → string[]`.
  - `checkRuleB(doc, view)`: errors only on an exact match whose literal carries a decimal. Integer exact matches become warnings. Money with a unit suffix is skipped.
  - `countMoneyLiterals(doc)`: excludes lits and unit-suffixed money.
  - `proseFields(doc)` never throws on malformed nested entries.
- Produces (schema.js): `meta.litReasons` (object map, ruling R1) and the lit↔reason errors.
- Produces: `test/v3/real-fixtures.test.js`. Later tasks keep it green; Task 13 extends it.

- [ ] **Step 1: Write the failing tests**

Add to `test/v3/prose.test.js`, just before `t.done();`:

```js
// ── Plan 2a Task 1 — rule B precision (spec §4 new rules 1–4) + {{lit:}} ──
// rule 1: exact + has decimals → error (px renders "$120.00")
{ const d = load(); d.prose.chart = 'ราคา $120.00 แล้ว'; const r = P.checkRuleB(d, view);
  t(r.errors.some((e) => e.token === 'px'), 'rule 1: exact decimal copy is an error'); }
// rule 2: integer-only literal is never an error, even when it equals the rendered token exactly (mosText is "+13%"-style)
{ const d = load(); d.prose.chart = 'MOS ' + view.d.mosText; const r = P.checkRuleB(d, view);
  t(!/\./.test(view.d.mosText), `precondition: mos token renders integer (${view.d.mosText})`);
  t(r.errors.length === 0 && r.warnings.some((w) => w.token === 'mos'), 'rule 2: integer exact match → warning only'); }
// rule 3: money with a unit suffix is a statement amount, not a per-share price — skipped completely
for (const lit of ['$120M', '$120 M', '$1,20B', '฿120 ล้าน', '฿120 พันล้าน', '$120bn', '$120K']) {
  const d = load(); d.prose.chart = `ยอด ${lit} ต่อปี`; const r = P.checkRuleB(d, view);
  t(r.errors.length === 0 && r.warnings.length === 0, `rule 3: "${lit}" skipped (no error, no warning)`);
}
{ const d = load(); d.prose.chart = 'ยอด $80M'; t.eq(P.countMoneyLiterals(d), 0, 'ruling R2: W31 does not count unit-suffixed money'); }
// rule 4 / #51: {{lit:…}} renders its text verbatim and is invisible to rule B and W31
{ const d = load(); d.prose.chart = 'เคยซื้อขายที่ {{lit:$120.00}} ตอน IPO';
  t.eq(P.renderProse(d.prose.chart, view, { mode: 'v2src' }), 'เคยซื้อขายที่ $120.00 ตอน IPO', 'lit renders inner text');
  t.eq(P.checkRuleB(d, view).errors, [], 'lit is skipped by rule B');
  t.eq(P.countMoneyLiterals(d), 0, 'lit is not a W31 money literal');
  t.eq(P.countLits(d), 1, 'countLits counts it');
  t.eq(P.litsOf(d), [{ path: 'prose.chart', text: '$120.00' }], 'litsOf reports path + text'); }
t.eq(P.renderProse('a {{lit:x < y}} b', view, { mode: 'text' }), 'a x &lt; y b', 'lit inner text is escaped');
{ const d = load(); d.prose.chart = 'bad {{lit:{{px}}}}'; t.eq(P.malformedLitPaths(d), ['prose.chart'], 'nested token inside lit is malformed'); }
{ const d = load(); d.prose.chart = 'open {{lit:9.0x'; t.eq(P.malformedLitPaths(d), ['prose.chart'], 'unclosed lit is malformed'); }
// proseFields must never throw on malformed nested entries (schema calls it on arbitrary input)
{ const d = load(); d.legs = [null, d.legs[1]]; d.metrics.custom = [null]; d.scenarios.cases = [null, d.scenarios.cases[1], d.scenarios.cases[2]];
  d.extras = [{ after: 'valuation', title: 'x', headers: ['a'], rows: [null, ['b']] }, null];
  let ok = true; try { P.proseFields(d); } catch (e) { ok = false; }
  t(ok, 'proseFields tolerates null legs/custom/cases/extras/rows'); }
```

The existing `lists are scanned too` case uses `view.d.mosText`, which is now integer → warning. Replace that block with a decimal-bearing value:

```js
{ const d = load(); d.risks[0] = 'มูลค่าเหมาะสม ' + TKfv(view); const r = P.checkRuleB(d, view);
  t(r.errors.some((e) => e.path === 'risks[0]' && e.token === 'fv'), 'lists are scanned too'); }
```

and add near the top of the file (after `const K = …`):

```js
const TKfv = (v) => require('../../tools/v3/tokens.js').TOKENS_V3.fv(v);   // "$137.86"-style (always 2 dp)
```

Add to `test/v3/schema.test.js`, before the `// fix round 1` block:

```js
// Plan 2a Task 1 — {{lit:}} ↔ meta.litReasons (ruling R1: object map literal → reason)
{ const d = base(); d.prose.chart = 'IPO {{lit:$17.00}}'; t(paths(S.validate(d)).includes('prose.chart'), 'lit without a reason → error at the prose path'); }
{ const d = base(); d.prose.chart = 'IPO {{lit:$17.00}}'; d.meta.litReasons = { '$17.00': 'ราคา IPO ปี 2556 (ข้อมูลประวัติ)' }; t.eq(S.validate(d), [], 'lit + reason → valid'); }
{ const d = base(); d.meta.litReasons = { '$17.00': 'ราคา IPO ปี 2556' }; t(paths(S.validate(d)).includes('meta.litReasons["$17.00"]'), 'reason no lit uses → error'); }
{ const d = base(); d.prose.chart = 'IPO {{lit:$17.00}}'; d.meta.litReasons = { '$17.00': 'x' }; t(paths(S.validate(d)).includes('meta.litReasons["$17.00"]'), 'reason shorter than 5 chars → error'); }
{ const d = base(); d.prose.chart = 'bad {{lit:{{px}}}}'; t(paths(S.validate(d)).includes('prose.chart'), 'Review Focus #1: nested lit → path-named schema error'); }
{ const d = base(); d.meta.litReasons = ['x']; t(paths(S.validate(d)).includes('meta.litReasons'), 'litReasons must be an object'); }
```

Create `test/v3/real-fixtures.test.js`:

```js
'use strict';
// ใบจริง Task 0 (BBL ธนาคาร · EQIX REIT · FER SOTP/EUR · ZTS Plan 1) — เกณฑ์ที่ต้องคงตลอด Plan 2a (spec §12):
// FV ไม่เปลี่ยน (ค่าจาก compare doc) · กติกา B 0 error · gate v2 บนหน้าที่ render = 0 error 0 warning
const t = require('./_t.js')('real-fixtures');
const C = require('../../tools/v3/compute.js');
const P = require('../../tools/v3/prose.js');
const R = require('../../_template/v3/render.js');
const { expandReport } = require('../../build.js');
const CR = require('../check-reports.js');

const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const load = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
const round2 = (x) => Math.round(x * 100) / 100;
// docs/superpowers/specs/2026-09-24-{BBL,EQIX,FER,zts}-v3-compare.md — ห้ามขยับ
const FV = { 'BBL-real': 176.77, 'EQIX-real': 1253.33, 'FER-real': 53.42, 'ZTS-real': 85 };

for (const f of Object.keys(FV)) {
  const doc = load(f);
  const view = C.compute(doc, { seeds: {} });
  t.eq(round2(view.fv), FV[f], `${f}: FV unchanged vs compare doc`);
  t.eq(P.checkRuleB(doc, view).errors.map((e) => `${e.path} ${e.literal}→${e.token}`), [], `${f}: rule B — 0 errors`);
  const d2 = load(f); d2.market.priceDate = today; d2.meta.analysisDate = today;   // E27/W09 ใช้นาฬิกาจริง
  const v2 = C.compute(d2, { seeds: {} });
  const src = R.toV2Source(d2, v2);
  const res = CR.checkHtml(expandReport(src), `${d2.symbol}.html`, { source: src });
  t.eq(res.errors.map((e) => `${e.id} ${e.msg}`), [], `${f}: v2 gate on render — 0 errors`);
  t.eq(res.warnings.map((e) => `${e.id} ${e.msg}`), [], `${f}: v2 gate on render — 0 warnings`);
}
t.done();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: `prose`, `schema` and `real-fixtures` report failures, e.g. `✗ [prose] rule 2: integer exact match → warning only`, `P.litsOf is not a function`, and `✗ [real-fixtures] BBL-real: rule B — 0 errors: got ["prose.valuation 9.0x→pe","metrics.notes.peAvg5y 9.0x→pe"]` plus `EQIX-real … +16%→analyst.pct`.

- [ ] **Step 3: Implement in `tools/v3/prose.js`**

Replace the `TOKEN_RE` line with:

```js
const TOKEN_RE = /\{\{([A-Za-z0-9.]+)\}\}/g;
// {{lit:…}} (spec §4 ข้อ 4 · open-item #51) — ตัวเลขที่ต้องพิมพ์ตรง (ราคา IPO ในอดีต · ตัวคูณในอดีตที่บังเอิญเท่าปัจจุบัน)
// ห้ามมีวงเล็บปีกกาข้างใน (กันซ้อน token) · ทุกข้อความใน lit ต้องมีเหตุผลใน meta.litReasons (schema) · นับด้วย W30
const LIT_RE = /\{\{lit:([^{}]+)\}\}/g;
const stripSpans = (text) => String(text).replace(LIT_RE, ' ').replace(TOKEN_RE, ' ');
```

In `renderProse`, change the return statement so lits unwrap before tokens are substituted:

```js
  return escapeKeepAllowed(withBold)
    .replace(LIT_RE, (all, inner) => inner)   // inner ถูก escape แล้วในขั้นก่อน · ไม่มี { } จึงไม่ชน TOKEN_RE
    .replace(TOKEN_RE, (all, name) => {
      const f = TK.TOKENS_V3[name];
      if (!f) throw new Error(`token {{${name}}} ไม่รู้จัก (มี: ${Object.keys(TK.TOKENS_V3).join(', ')})`);
      if (mode === 'v2src' && TK.V2_TWIN[name]) { f(view); return `{{rd:${TK.V2_TWIN[name]}}}`; }   // เรียก f ก่อน = token ชี้ค่า null ยัง throw
      return f(view);
    });
```

Replace `proseFields` with this defensive version (same paths, same order):

```js
function proseFields(doc) {
  const out = [];
  const add = (path, text) => { if (typeof text === 'string') out.push({ path, text }); };
  const arr = (x) => (Array.isArray(x) ? x : []);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  for (const [k, v] of Object.entries(obj(doc.prose))) add(`prose.${k}`, v);
  add('meta.sub', obj(doc.meta).sub); add('meta.priceNote', obj(doc.meta).priceNote);
  add('metrics.hint', obj(doc.metrics).hint);
  for (const [k, v] of Object.entries(obj(obj(doc.metrics).notes))) add(`metrics.notes.${k}`, v);
  arr(obj(doc.metrics).custom).forEach((c, i) => { add(`metrics.custom[${i}].value`, obj(c).value); add(`metrics.custom[${i}].note`, obj(c).note); });
  arr(doc.legs).forEach((l, i) => add(`legs[${i}].note`, obj(l).note));
  arr(obj(doc.scenarios).cases).forEach((c, i) => add(`scenarios.cases[${i}].desc`, obj(c).desc));
  add('scenarios.note', obj(doc.scenarios).note);
  arr(doc.catalysts).forEach((x, i) => add(`catalysts[${i}]`, x));
  arr(doc.risks).forEach((x, i) => add(`risks[${i}]`, x));
  arr(doc.extras).forEach((x, i) => { add(`extras[${i}].title`, obj(x).title); add(`extras[${i}].note`, obj(x).note);
    arr(obj(x).rows).forEach((r, j) => arr(r).forEach((c, k) => add(`extras[${i}].rows[${j}][${k}]`, c))); });
  return out;
}

function litsOf(doc) {
  const out = [];
  for (const { path, text } of proseFields(doc)) for (const m of text.matchAll(LIT_RE)) out.push({ path, text: m[1] });
  return out;
}
const countLits = (doc) => litsOf(doc).length;
// '{{lit:' ที่ไม่ครบรูป (ซ้อน token / ไม่ปิด) → path — schema ฟ้อง (ไม่งั้นวงเล็บดิบหลุดถึงหน้าเว็บ = E13)
function malformedLitPaths(doc) {
  const out = [];
  for (const { path, text } of proseFields(doc)) {
    const opens = text.split('{{lit:').length - 1, ok = [...text.matchAll(LIT_RE)].length;
    if (opens !== ok) out.push(path);
  }
  return out;
}
```

Replace the `CAND` block with the unit-aware version:

```js
const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
// spec §4 ข้อ 3 — เงินที่มีหน่วยต่อท้าย (M B K bn mn ล้าน พันล้าน…) = ยอดงบ ไม่ใช่ราคาต่อหุ้น → ข้าม
// [0-9.,]* ในตัว lookahead กัน regex ถอยไปจับ "$8" จาก "$80M"
const MONEY_UNIT = '(?![0-9.,]*\\s*(?:[MBK](?![A-Za-z])|bn(?![A-Za-z])|mn(?![A-Za-z])|(?:พัน|หมื่น|แสน)?ล้าน))';
const CAND = [
  { kind: 'money', re: new RegExp(`(?:US\\$|\\$|฿)\\s*${NUM}${MONEY_UNIT}`, 'g') },
  { kind: 'money', re: new RegExp(`${NUM}\\s*บาท`, 'g') },
  { kind: 'pct', re: new RegExp(`([+\\-−]?)${NUM}\\s*%`, 'g') },
  { kind: 'mult', re: new RegExp(`${NUM}\\s*(?:x|เท่า)(?![A-Za-z])`, 'g') },
];
```

In `checkRuleB`, change `const plain = …` to `const plain = stripSpans(text);`. Replace the inner `for (const b of …)` loop body with:

```js
        for (const b of pb.filter((x) => x.kind === kind)) {
          const exact = bare(literal) === bare(b.shown);
          const cmp = kind === 'pct' ? n : Math.abs(n);
          // spec §4 ข้อ 1–2: error = เป๊ะ "รวมทศนิยม" เท่านั้น · จำนวนเต็มล้วนเป็นอย่างมาก warn
          if (exact && /\d\.\d/.test(literal)) { errors.push({ path, literal, token: b.token }); break; }
          if (exact || TOL[kind](cmp, kind === 'pct' ? b.raw : Math.abs(b.raw))) { warnings.push({ path, literal, token: b.token }); break; }
        }
```

In `countMoneyLiterals`, change `const plain = …` to `const plain = stripSpans(text);`.

Change the export line to:

```js
module.exports = { renderProse, sanitizeErrors, proseFields, checkRuleB, countMoneyLiterals, escapeKeepAllowed, TOKEN_RE, LIT_RE, stripSpans, litsOf, countLits, malformedLitPaths };
```

- [ ] **Step 4: Implement in `tools/v3/schema.js`**

Add near the top, under the header comment:

```js
const P = require('./prose.js');   // litsOf/malformedLitPaths — prose.js ไม่ require schema.js (ไม่มี cycle)
```

In the `meta` block, extend the closed list and validate the new key:

```js
    closed(m, 'meta', ['company', 'exchange', 'sub', 'headerTags', 'analysisDate', 'aiModel', 'sources', 'priceNote', 'themeLegacy', 'litReasons']);
```

and after the `themeLegacy` handling inside the same `else` branch:

```js
    if (m.litReasons != null) {
      if (!isObj(m.litReasons)) E('meta.litReasons', 'ต้องเป็น object { "<ข้อความใน {{lit:…}}>": "เหตุผล" }');
      else for (const [k, v] of Object.entries(m.litReasons)) str(v, `meta.litReasons[${JSON.stringify(k)}]`, { minLen: 5 });
    }
```

Just before `if (doc._sig != null && …)`, add:

```js
  // {{lit:…}} ↔ meta.litReasons (spec §4 ข้อ 4 · #51 · ruling R1) — 1 คีย์ต่อ 1 ข้อความ ใช้ได้หลายจุด
  for (const p of P.malformedLitPaths(doc)) E(p, '{{lit:…}} ไม่ครบรูป — ห้ามซ้อน token/วงเล็บปีกกา และต้องปิดด้วย }}');
  const reasons = isObj(doc.meta) && isObj(doc.meta.litReasons) ? doc.meta.litReasons : {};
  const lits = P.litsOf(doc);
  for (const l of lits) if (!Object.prototype.hasOwnProperty.call(reasons, l.text)) E(l.path, `{{lit:${l.text}}} ต้องมีเหตุผลใน meta.litReasons[${JSON.stringify(l.text)}]`);
  const used = new Set(lits.map((l) => l.text));
  for (const k of Object.keys(reasons)) if (!used.has(k)) E(`meta.litReasons[${JSON.stringify(k)}]`, 'ไม่มี {{lit:…}} ที่ใช้เหตุผลนี้ — ลบออก');
```

- [ ] **Step 5: Edit the BBL fixture (spec §4 item 4)**

Why: the 5-year P/E high "9.0x" equals today's P/E (9.0x) exactly. It is history, not the current multiple, so it is wrapped with a reason. This does not skip rule B silently.

Run:

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/BBL-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
const rep=(o,k,a,b)=>{if(!o[k].includes(a))throw new Error(k+" missing "+a);o[k]=o[k].replace(a,b);};
rep(d.prose,"valuation","(7.4x ช่วง 6.0–9.0x)","(7.4x ช่วง 6.0–{{lit:9.0x}})");
rep(d.metrics.notes,"peAvg5y","กรอบ 6.0–9.0x (FY2021–25)","กรอบ 6.0–{{lit:9.0x}} (FY2021–25)");
d.meta.litReasons={"9.0x":"P/E สูงสุดย้อนหลัง 5 ปี (FY2021–25) บังเอิญเท่ากับ P/E ปัจจุบันพอดี — เป็นตัวเลขประวัติ ไม่ใช่ตัวคูณปัจจุบัน"};
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: every line `✓`, including `✓ real-fixtures: 20/20` and `✓ tokens-corpus: 3/3`. EQIX's `+16%` is now a warning (rule 2). FER's `$80M` is skipped (rule 3).

- [ ] **Step 7: Commit**

```bash
git add tools/v3/prose.js tools/v3/schema.js test/v3/prose.test.js test/v3/schema.test.js test/v3/real-fixtures.test.js test/fixtures/v3/BBL-real.json
git commit -m "feat(v3): rule B precision (§4) + {{lit:}} with meta.litReasons (#51)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 2: Render hardening — tokens in `metrics.notes` (O), `peAvg5y` label, JSON `<` escape, shared allowlist (#50)

**Files:**
- Create: `tools/safe-values.js`
- Modify: `build.js` (the `GRID_FMT_OK`/`DATA_FMT_OK` lines and the `HEX … colorOK` lines inside `validateReportData`)
- Modify: `tools/v3/schema.js` (themeLegacy + `gridFmt`/`dataFmt`)
- Modify: `tools/v3/cards.js` (`peAvg5y` label)
- Modify: `_template/v3/render.js` (header comment, `jsonScript`, card block, the two `<script type="application/json">` blocks, exports)
- Modify: `test/v3/schema.test.js`, `test/v3/cards.test.js`, `test/v3/render.test.js`
- Modify: `test/fixtures/v3/EQIX-real.json` (`notes.eps` uses `{{pe}}`)

**Interfaces:**
- Produces: `require('./tools/safe-values.js') → { colorOK(v, allowGradient) → boolean, GRID_FMT_OK, DATA_FMT_OK, HEX, FN, VAR, GRAD, NAMED }`.
- Produces: `render.js` exports `jsonScript(s) → string` (every `<` → `<`).
- Card notes now go through `renderProse(…, {mode:'v2src'})`. `K.renderCard(key, view)` is called **without** a note by `render.js`. The `note` parameter stays for `cards.test.js` compatibility.

- [ ] **Step 1: Write the failing tests**

Append to `test/v3/schema.test.js` (before `t.done();`):

```js
// Plan 2a Task 2 — #50 allowlist ชุดเดียวกับ build.js (tools/safe-values.js)
{ const d = base(); d.meta.themeLegacy = { accent: 'red;}</style><script>x', accentDark: '#000', darkGrad: 'linear-gradient(135deg,#000 0%,#111 100%)', glow: '#000', subColor: '#000', headerMuted: '#000', verdictText: '#000', vcellLabel: '#000' };
  t(paths(S.validate(d)).includes('meta.themeLegacy.accent'), 'themeLegacy colour outside allowlist → error'); }
{ const d = base(); d.meta.themeLegacy = { accent: '#000', accentDark: '#000', darkGrad: 'url(javascript:x)', glow: '#000', subColor: '#000', headerMuted: '#000', verdictText: '#000', vcellLabel: '#000' };
  t(paths(S.validate(d)).includes('meta.themeLegacy.darkGrad'), 'darkGrad must be colour/gradient'); }
{ const d = base(); d.market.chart.gridFmt = 'alert(1)'; t(paths(S.validate(d)).includes('market.chart.gridFmt'), 'gridFmt allowlist'); }
{ const d = base(); d.market.chart.dataFmt = 'v.toFixed(1)'; t(paths(S.validate(d)).includes('market.chart.dataFmt'), 'dataFmt must use d[1]'); }
{ const d = base(); d.market.chart.gridFmt = 'v.toFixed(0)'; d.market.chart.dataFmt = 'Math.round(d[1])'; t.eq(S.validate(d), [], 'legal formats pass'); }
for (const f of ['BBL-real', 'EQIX-real', 'FER-real', 'ZTS-real'])
  t.eq(S.validate(JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)))), [], `${f} themeLegacy passes the allowlist`);
```

Append to `test/v3/cards.test.js`:

```js
// Plan 2a Task 2 — ค่าเป็นมัธยฐานจาก median-multiples ⇒ label ต้องไม่เขียน "เฉลี่ย" (spec §3.2 · BBL G9)
t.eq(K.CATALOGUE.peAvg5y.label(view), 'P/E มัธยฐาน ~5 ปี', 'peAvg5y label says มัธยฐาน');
```

Append to `test/v3/render.test.js` (before `t.done();`):

```js
// Plan 2a Task 2 — (O) token ใน metrics.notes ต้อง render (เดิม esc() เฉย ๆ ⇒ "{{pe}}" รั่ว + E13)
{ const doc = load('ZTS'); doc.metrics.notes.pe = 'ตอนนี้ {{pe}}x เทียบ **มัธยฐาน**';
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('ตอนนี้ {{rd:pe}}x เทียบ <b>มัธยฐาน</b>'), 'notes: v2-twin token becomes {{rd:pe}} and **bold** renders');
  t(!/\{\{pe\}\}/.test(src), 'notes: no raw v3 token left');
  const res = CR.checkHtml(expandReport(src), 'ZTS.html', { source: src });
  t.eq(res.errors.map((e) => e.id), [], 'notes with tokens: v2 gate 0 errors (no E13)'); }
// #50 — JSON ใน <script type="application/json"> ต้องไม่มี "<" ดิบ (ชั้นที่สองหลัง allowlist)
t(!R.jsonScript('{"a":"</script><b>"}').includes('<'), 'jsonScript escapes every <');
t.eq(JSON.parse(R.jsonScript('{"a":"</script>"}')).a, '</script>', 'jsonScript output still parses to the same value');
{ const doc = load('ZTS'); const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  const blocks = src.match(/<script type="application\/json" id="(?:stock-meta|report-data)">[\s\S]*?<\/script>/g);
  t(blocks.length === 2 && blocks.every((b) => !b.slice(b.indexOf('>') + 1, b.lastIndexOf('</script>')).includes('<')), 'both JSON script bodies are <-free'); }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: failures for `themeLegacy colour outside allowlist`, `gridFmt allowlist`, `dataFmt must use d[1]`, `peAvg5y label says มัธยฐาน`, `notes: v2-twin token becomes {{rd:pe}}` and `R.jsonScript is not a function`.

- [ ] **Step 3: Create `tools/safe-values.js`**

```js
'use strict';
/**
 * safe-values.js — allowlist ของค่าที่ถูก splice ดิบลง <style>/<script>/style="" (open-item #50)
 * เจ้าของเดียว: build.js validateReportData (ตรวจตอน build) + tools/v3/schema.js (ปฏิเสธตั้งแต่ต้นทาง)
 * ★ allowlist ไม่ใช่ denylist — ไม่มีชุดอักขระใดรับ '<' '>' ';' '{' '}' หรือ quote (ย้ายมาจาก build.js ทั้งตัว ไม่แก้ตรรกะ)
 */
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, FN = /^(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/i,
  VAR = /^var\(--[a-z0-9-]+(,[a-z0-9#%.,()\s-]+)?\)$/i, GRAD = /^(linear|radial)-gradient\([a-z0-9#%.,()\s-]+\)$/i, NAMED = /^[a-z]+$/i;
const colorOK = (v, grad) => { v = String(v).trim(); return HEX.test(v) || FN.test(v) || VAR.test(v) || NAMED.test(v) || !!(grad && GRAD.test(v)); };
// gridFmt อยู่ใน grid.forEach(v=>…) → ใช้ v เท่านั้น · dataFmt อยู่ใน data.forEach((d,i)=>…) → ใช้ d[1] เท่านั้น
const GRID_FMT_OK = /^v(\.toFixed\([0-4]\))?$|^Math\.round\(v\)$/;
const DATA_FMT_OK = /^d\[1\](\.toFixed\([0-4]\))?$|^Math\.round\(d\[1\]\)$/;

module.exports = { colorOK, GRID_FMT_OK, DATA_FMT_OK, HEX, FN, VAR, GRAD, NAMED };
```

- [ ] **Step 4: Point `build.js` at it (behaviour identical)**

Add near the other requires (after `const V3IO = …`):

```js
const SV = require('./tools/safe-values.js');   // allowlist สี/format — เจ้าของเดียวกับ tools/v3/schema.js (#50)
```

In `validateReportData`, delete the two local lines `const GRID_FMT_OK = …;` and `const DATA_FMT_OK = …;`. Replace their two uses with `SV.GRID_FMT_OK.test(c.gridFmt)` and `SV.DATA_FMT_OK.test(c.dataFmt)`. Keep the surrounding comment and error messages unchanged. Delete the local `const HEX = …, FN = …, VAR = …, GRAD = …, NAMED = …;` and `const colorOK = …;` lines, and replace them with:

```js
  const colorOK = SV.colorOK;
```

- [ ] **Step 5: Schema uses the allowlist**

In `tools/v3/schema.js`, add under the prose require:

```js
const SV = require('../safe-values.js');
```

Replace the themeLegacy validation line (`else { closed(m.themeLegacy, …); for (const k of THEME_KEYS) str(…); }`) with:

```js
      else {
        closed(m.themeLegacy, 'meta.themeLegacy', THEME_KEYS);
        for (const k of THEME_KEYS) {
          const v = m.themeLegacy[k], p = `meta.themeLegacy.${k}`;
          str(v, p);
          if (typeof v === 'string' && !SV.colorOK(v, k === 'darkGrad')) E(p, `ไม่ใช่ค่าสีที่ allowlist รับ (hex/rgb/hsl/var/named${k === 'darkGrad' ? '/gradient' : ''}) — #50`);
        }
      }
```

Replace `str(c.gridFmt, …); str(c.dataFmt, …);` with:

```js
      if (c.gridFmt != null && !(typeof c.gridFmt === 'string' && SV.GRID_FMT_OK.test(c.gridFmt))) E('market.chart.gridFmt', 'ต้องเป็น v / v.toFixed(n) / Math.round(v) เท่านั้น — #50');
      if (c.dataFmt != null && !(typeof c.dataFmt === 'string' && SV.DATA_FMT_OK.test(c.dataFmt))) E('market.chart.dataFmt', 'ต้องเป็น d[1] / d[1].toFixed(n) / Math.round(d[1]) เท่านั้น — #50');
```

- [ ] **Step 6: `cards.js` label**

Change the `peAvg5y` entry's label to `label: () => 'P/E มัธยฐาน ~5 ปี'`.

- [ ] **Step 7: `render.js`**

Replace the header comment sentence that begins `★ ยกเว้น gdots/theme` through `วางแผนไว้ที่ Plan 2` with:

```js
 * ทุก string จาก JSON ที่ไปลง HTML แบบ prose ผ่าน esc() หรือ renderProse() เสมอ · สี gdots/theme ผ่าน allowlist
 * tools/safe-values.js ที่ schema (ต้นทาง) และ build.js (ปลายทาง) · JSON ใน <script type="application/json">
 * ผ่าน jsonScript() ที่แปลง '<' เป็น < (ชั้นที่สอง — open-item #50)
```

Add after `const dot = …`:

```js
// JSON ใน <script> ห้ามมี '<' ดิบ (กัน </script> ปิดแท็กก่อนเวลา) — '<' โผล่ได้เฉพาะในสตริง JSON ⇒ < ยัง parse เป็นค่าเดิม
const jsonScript = (s) => String(s).replace(/</g, '\\u003c');
```

Replace the `const cards = …` and `const cardHtml = …` lines in `toV2Source` with:

```js
  // (O) โน้ตใต้การ์ดเป็น prose (token + <b>) — renderCard คืนบรรทัดฐานของ template ล้วน แล้วต่อโน้ตที่ render แล้ว
  const noteOf = (k) => doc.metrics.notes && doc.metrics.notes[k];
  const catalogueCard = (k) => {
    const c = K.renderCard(k, view), note = noteOf(k);
    return { k: esc(c.k), v: esc(c.v), d: esc(c.d) + (note ? (c.d ? ' · ' : '') + pr(note) : ''), cls: c.cls };
  };
  const cards = doc.metrics.cards.map(catalogueCard)
    .concat((doc.metrics.custom || []).map((c) => ({ k: esc(c.label), v: pr(c.value), d: c.note ? pr(c.note) : '', cls: '' })));
  const cardHtml = cards.map((c) => `<div class="metric"><div class="k">${c.k}</div><div class="v${c.cls ? ' ' + c.cls : ''}">${c.v}</div><div class="d">${c.d}</div></div>`).join('\n      ');
```

Replace `${JSON.stringify(view.sm)}` with `${jsonScript(JSON.stringify(view.sm))}`, and `${RV.styledRD(view.rd)}` with `${jsonScript(RV.styledRD(view.rd))}`. Change the export to `module.exports = { toV2Source, mdesc, jsonScript };`.

- [ ] **Step 8: EQIX fixture — `{{pe}}` in the note that was forced to keep a stale literal (EQIX gap 9)**

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/EQIX-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
const a="P/E ~65.7x — ไม่ใช้ประเมินค่า REIT (ค่าเสื่อมสูง)"; if(d.metrics.notes.eps!==a)throw new Error("notes.eps drifted");
d.metrics.notes.eps="P/E ~{{pe}}x — ไม่ใช้ประเมินค่า REIT (ค่าเสื่อมสูง)";
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓' && rtk proxy node test/build-test.js | tail -2`
Expected: all `✓`, including `real-fixtures` (EQIX's eps card now reads the live P/E). `build-test` passes, which shows the allowlist moved with no behaviour change.

- [ ] **Step 10: Commit**

```bash
git add tools/safe-values.js build.js tools/v3/schema.js tools/v3/cards.js _template/v3/render.js test/v3/schema.test.js test/v3/cards.test.js test/v3/render.test.js test/fixtures/v3/EQIX-real.json
git commit -m "feat(v3): render hardening — tokens in card notes, JSON <-escape, shared colour/format allowlist (#50)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 3: Text slots `text.*` (§3.6 A)

**Files:**
- Modify: `tools/v3/schema.js` (top-level closed list, new `text` block, `TEXT_KEYS` export)
- Modify: `tools/v3/io.js` (`TOP_ORDER`)
- Modify: `tools/v3/prose.js` (`proseFields` adds `text.*`)
- Modify: `_template/v3/render.js` (`valHintParts`, §1 note, §3 intro/hint/box, disclaimer)
- Modify: `test/v3/schema.test.js`, `test/v3/render.test.js`
- Modify: `test/fixtures/v3/FER-real.json` (FER gaps 1, 2, 5)

**Interfaces:**
- Produces: optional top-level `text: { valHint?, valIntro?, metricsNote?, disclaimerAssump? }`. All four are prose; `valHint` is ≤ 80 chars.
- Produces: `render.js` internal `valHintParts(doc, view) → { hint: string(html), box: string }`. Task 5 extends it.
- `S.TEXT_KEYS` exported.

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js`:

```js
// Plan 2a Task 3 — text.* (§3.6 A)
{ const d = base(); d.text = { valHint: 'SOTP + DDM', valIntro: 'ย่อหน้า', metricsNote: 'หมายเหตุ', disclaimerAssump: 'อัตราคิดลด (r)' }; t.eq(S.validate(d), [], 'text.* all optional prose'); }
{ const d = base(); d.text = { valHnt: 'x' }; t(paths(S.validate(d)).includes('text.valHnt'), 'text is closed'); }
{ const d = base(); d.text = { valHint: 'x'.repeat(81) }; t(paths(S.validate(d)).includes('text.valHint'), 'valHint ≤ 80 chars'); }
{ const d = base(); d.text = { valIntro: 'IPO {{lit:$1.00}}' }; t(paths(S.validate(d)).includes('text.valIntro'), 'text.* is a prose field (lit reason check reaches it)'); }
```

`test/v3/render.test.js`:

```js
// Plan 2a Task 3 — text.* render where the fixed template text used to be
{ const doc = load('ZTS'); const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('<div class="hint">เฉลี่ย 2 วิธี</div>') && src.includes('มูลค่าเหมาะสมเฉลี่ย (Fair Value)'), 'no text → legacy hint + box unchanged');
  t(src.includes('โดยเฉพาะ P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต'), 'no text → legacy disclaimer clause'); }
{ const doc = load('ZTS'); doc.text = { valHint: 'SOTP + DDM — ห้ามใช้ P/E', valIntro: 'ทำไม <b>ไม่</b> ใช้ P/E ที่ {{px}}', metricsNote: 'งบสกุล EUR', disclaimerAssump: 'อัตราคิดลด (r) และอายุสัมปทาน' };
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('<div class="hint">SOTP + DDM — ห้ามใช้ P/E</div>'), 'valHint replaces the generated §3 hint');
  t(src.includes('<div class="l">มูลค่าเหมาะสม (Fair Value)<br>'), 'ruling R6: FV box label turns neutral');
  t(/<div class="card">\s*<p[^>]*>ทำไม <b>ไม่<\/b> ใช้ P\/E ที่ \{\{rd:px\}\}<\/p>\s*<div class="vmethod">/.test(src), 'valIntro sits before the first leg, tokens rendered');
  t(/<\/div>\s*<p[^>]*>งบสกุล EUR<\/p>\s*<\/section>/.test(src), 'metricsNote sits under the §1 grid');
  t(src.includes('โดยเฉพาะ อัตราคิดลด (r) และอายุสัมปทาน'), 'disclaimerAssump replaces the clause after โดยเฉพาะ');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'text slots: v2 gate 0 errors'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `text.* all optional prose` fails with path `text` (`คีย์ไม่อยู่ในสคีมา v3`), and the render assertions fail.

- [ ] **Step 3: Implement**

`tools/v3/schema.js` — add near `THEME_KEYS`:

```js
const TEXT_KEYS = ['valHint', 'valIntro', 'metricsNote', 'disclaimerAssump'];   // §3.6 A — แทนข้อความตายตัวของ template
```

Add `'text'` to the top-level `closed(doc, '', [...])` list (after `'prose'`). After the `prose` block, add:

```js
  if (doc.text != null) {
    if (!isObj(doc.text)) E('text', 'ต้องเป็น object');
    else {
      closed(doc.text, 'text', TEXT_KEYS);
      for (const k of TEXT_KEYS) str(doc.text[k], `text.${k}`, { req: false });
      if (typeof doc.text.valHint === 'string' && doc.text.valHint.length > 80) E('text.valHint', 'ยาวเกิน 80 ตัวอักษร (เป็นป้ายหัว section)');
    }
  }
```

Export `TEXT_KEYS` in `module.exports`.

`tools/v3/io.js` — `TOP_ORDER` becomes:

```js
const TOP_ORDER = ['v', 'symbol', 'currency', 'region', 'dateEra', 'meta', 'market', 'fundamentals', 'legs', 'fvWeights',
  'metrics', 'scenarios', 'analyst', 'prose', 'text', 'catalysts', 'risks', 'extras', '_sig'];
```

`tools/v3/prose.js` — in `proseFields`, after the `prose.*` loop:

```js
  for (const [k, v] of Object.entries(obj(doc.text))) add(`text.${k}`, v);
```

`_template/v3/render.js` — add above `toV2Source`:

```js
// หัว §3 + ป้ายกล่อง FV (ruling R6: มี text.valHint → ป้ายกล่องเป็นกลาง ไม่ให้คำที่ generate ขัดกับ hint ของผู้เขียน)
function valHintParts(doc, view) {
  if (doc.text && doc.text.valHint) return { hint: P.renderProse(doc.text.valHint, view, { mode: 'v2src' }), box: 'มูลค่าเหมาะสม (Fair Value)' };
  const word = doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย';
  return { hint: `${word} ${view.legs.length} วิธี`, box: `มูลค่าเหมาะสม${word} (Fair Value)` };
}
```

In `toV2Source`, after `const pr = …`, add `const T = doc.text || {}; const vh = valHintParts(doc, view);`. Then make these edits:

- §1: after the closing `</div>` of `<div class="grid g4">…`, before `</section>`, insert:
  ```js
  ${T.metricsNote ? `\n    <p style="font-size:12.5px;color:var(--muted);margin-top:12px;line-height:1.6">${pr(T.metricsNote)}</p>` : ''}
  ```
- §3 hint: `<div class="hint">${doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย'} ${view.legs.length} วิธี</div>` → `<div class="hint">${vh.hint}</div>`.
- §3 card start: `${legsHtml}` → `${T.valIntro ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.6">${pr(T.valIntro)}</p>\n      ` : ''}${legsHtml}`.
- FV box: `<div class="l">มูลค่าเหมาะสม${doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย'} (Fair Value)<br>` → `<div class="l">${vh.box}<br>`.
- Disclaimer: `โดยเฉพาะ P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต` → `โดยเฉพาะ ${T.disclaimerAssump ? pr(T.disclaimerAssump) : 'P/E เป้าหมาย, อัตราเติบโต (g), ผลตอบแทนที่ต้องการ (r) และ ROE ในอนาคต'}`.

- [ ] **Step 4: FER fixture — move the escape-hatch text into its slots (FER gaps 1, 2, 5)**

The sentences move; they are not copied. After this step each sentence exists once.

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/FER-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
const cut=(s,sep)=>{const i=s.indexOf(sep);if(i<0)throw new Error("missing "+sep.slice(0,40));return [s.slice(0,i),s.slice(i+sep.length)];};
// 1) §3 hint + intro: prose.valuation = "<b>SOTP + DDM — ห้ามใช้ P/E</b><br>" + why-not-P/E paragraph
const [h,intro]=cut(d.prose.valuation,"<br>"); if(h!=="<b>SOTP + DDM — ห้ามใช้ P/E</b>")throw new Error("hint drifted");
d.text={valHint:"SOTP + DDM — ห้ามใช้ P/E",valIntro:intro};
// 2) prose.valuation (required) = the limitations paragraph that followed the SOTP table in v2 (was glued into extras[1].note)
const [sotpNote,limits]=cut(d.extras[1].note,"<br><b>ข้อจำกัดที่ต้องรู้:</b>");
d.extras[1].note=sotpNote; d.prose.valuation="<b>ข้อจำกัดที่ต้องรู้:</b>"+limits;
// 3) §1 paragraph above the EUR table (was merged into extras[0].note)
const [above,below]=cut(d.extras[0].note,"<br>สังเกต:");
d.text.metricsNote=above; d.extras[0].note="สังเกต:"+below;
// 4) disclaimer clause (was prefixed into disclaimerSources = duplicate sentence)
const pre="สมมติฐานที่อ่อนไหวที่สุดของรายงานนี้: ", ds=d.prose.disclaimerSources;
if(!ds.startsWith(pre))throw new Error("disclaimer drifted");
const [clause,rest]=cut(ds.slice(pre.length)," • ");
d.text.disclaimerAssump=clause; d.prose.disclaimerSources=rest;
// key order: "text" right after "prose" (= io.TOP_ORDER)
const out={};for(const k of Object.keys(d)){if(k==="text")continue;out[k]=d[k];if(k==="prose")out.text=d.text;}
fs.writeFileSync(p,JSON.stringify(out,null,2)+"\n");'
```

- [ ] **Step 5: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`. `real-fixtures` is still 0/0 on the v2 gate for FER, and FER's FV is still 53.42.

- [ ] **Step 6: Commit**

```bash
git add tools/v3/schema.js tools/v3/io.js tools/v3/prose.js _template/v3/render.js test/v3/schema.test.js test/v3/render.test.js test/fixtures/v3/FER-real.json
git commit -m "feat(v3): text.* slots — §3 hint/intro, §1 note, disclaimer clause (§3.6 A)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 4: Ordered cards with `custom:<i>` + `tone` (§3.6 B-order, H)

**Files:**
- Modify: `tools/v3/schema.js` (`ENUM.tone`, `cardEntries`, the `metrics` block, exports)
- Modify: `_template/v3/render.js` (card block)
- Modify: `test/v3/schema.test.js`, `test/v3/render.test.js`

**Interfaces:**
- Produces: `S.cardEntries(metrics) → [{ key: string|null, custom: number|null, tone: 'pos'|'neg'|'neu'|null }]`. Order is the order written in `metrics.cards`. Custom cards that are never referenced are appended at the end, in index order (the Plan 1 behaviour).
- `metrics.cards[i]` may be `"key"`, `"custom:<i>"` or `{ "key": "pbv", "tone": "pos" }`. `metrics.custom[i].tone` is optional.
- Counting rule: `metrics.cards.length` stays 4–16. A `custom:<i>` entry counts; unreferenced customs don't.

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js`:

```js
// Plan 2a Task 4 — ordered cards + tone (§3.6 B-order, H)
{ const d = base(); d.metrics.custom = [{ label: 'สาขา', value: '45 ประเทศ' }, { label: 'พนักงาน', value: '13,800 คน', tone: 'neu' }];
  d.metrics.cards = ['mcap', 'custom:1', { key: 'pe', tone: 'pos' }, 'pbv', 'yield'];
  t.eq(S.validate(d), [], 'mixed catalogue / custom ref / {key,tone} is valid');
  t.eq(S.cardEntries(d.metrics), [
    { key: 'mcap', custom: null, tone: null }, { key: null, custom: 1, tone: 'neu' }, { key: 'pe', custom: null, tone: 'pos' },
    { key: 'pbv', custom: null, tone: null }, { key: 'yield', custom: null, tone: null }, { key: null, custom: 0, tone: null }], 'cardEntries order + unreferenced custom appended'); }
{ const d = base(); d.metrics.cards = d.metrics.cards.concat(['custom:0']); t(paths(S.validate(d)).includes(`metrics.cards[${d.metrics.cards.length - 1}]`), 'custom:<i> must point at an existing custom'); }
{ const d = base(); d.metrics.custom = [{ label: 'a', value: 'b' }]; d.metrics.cards = d.metrics.cards.slice(0, 5).concat(['custom:0', 'custom:0']); t(paths(S.validate(d)).includes('metrics.cards'), 'custom referenced twice → duplicate error'); }
{ const d = base(); d.metrics.cards[0] = { key: 'mcap', tone: 'green' }; t(paths(S.validate(d)).includes('metrics.cards[0].tone'), 'tone enum'); }
{ const d = base(); d.metrics.cards[0] = { key: 'mcap', cls: 'pos' }; t(paths(S.validate(d)).includes('metrics.cards[0].cls'), 'card object is closed'); }
{ const d = base(); d.metrics.custom = [{ label: 'a', value: 'b', tone: 'bad' }]; t(paths(S.validate(d)).includes('metrics.custom[0].tone'), 'custom tone enum'); }
```

`test/v3/render.test.js`:

```js
// Plan 2a Task 4 — ลำดับการ์ด + tone
{ const doc = load('ZTS'); doc.metrics.custom = [{ label: 'สาขาทั่วโลก', value: '45 ประเทศ', tone: 'pos' }];
  doc.metrics.cards = ['mcap', 'custom:0', { key: 'pe', tone: 'neg' }].concat(doc.metrics.cards.filter((k) => k !== 'mcap' && k !== 'pe'));
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  const ks = [...src.matchAll(/<div class="metric"><div class="k">([^<]*)<\/div><div class="v([^"]*)">/g)].map((m) => [m[1], m[2]]);
  t.eq(ks.slice(0, 3), [['Market Cap', ''], ['สาขาทั่วโลก', ' pos'], ['P/E (TTM)', ' neg']], 'custom placed at its slot · tone overrides class');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'ordered cards: v2 gate 0 errors'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `S.cardEntries is not a function`, and `metrics.cards[1]: ไม่อยู่ในแคตตาล็อก` on the valid case.

- [ ] **Step 3: Implement the schema**

Add `tone: ['pos', 'neg', 'neu']` to `ENUM`. Add above `validate`:

```js
// metrics.cards[i]: "key" | "custom:<i>" | {key, tone} → ลำดับที่ render · custom ที่ไม่ถูกอ้างต่อท้าย (พฤติกรรม Plan 1)
const CUSTOM_REF = /^custom:(\d)$/;
function cardEntries(mt) {
  const out = [], used = new Set(), custom = Array.isArray(mt.custom) ? mt.custom : [];
  const toneOf = (c) => (c && c.tone) || null;
  for (const c of mt.cards || []) {
    if (typeof c === 'string' && CUSTOM_REF.test(c)) { const i = +c.match(CUSTOM_REF)[1]; used.add(i); out.push({ key: null, custom: i, tone: toneOf(custom[i]) }); }
    else if (typeof c === 'string') out.push({ key: c, custom: null, tone: null });
    else out.push({ key: c && c.key, custom: null, tone: (c && c.tone) || null });
  }
  custom.forEach((c, i) => { if (!used.has(i)) out.push({ key: null, custom: i, tone: toneOf(c) }); });
  return out;
}
```

Replace the `metrics.cards` validation `else { … }` branch with:

```js
    else {
      const ids = [];
      const nCustom = Array.isArray(mt.custom) ? mt.custom.length : 0;
      mt.cards.forEach((c, i) => {
        const p = `metrics.cards[${i}]`;
        if (typeof c === 'string' && CUSTOM_REF.test(c)) {
          const n = +c.match(CUSTOM_REF)[1];
          if (n >= nCustom) E(p, `อ้าง ${c} แต่ metrics.custom มี ${nCustom} ช่อง`);
          ids.push(c);
        } else if (typeof c === 'string') {
          if (!CARD_KEYS.includes(c)) E(p, `ไม่อยู่ในแคตตาล็อก (${CARD_KEYS.join(', ')}) — ข้อมูลเฉพาะธุรกิจใช้ metrics.custom`);
          ids.push(c);
        } else if (isObj(c)) {
          closed(c, p, ['key', 'tone']);
          if (!CARD_KEYS.includes(c.key)) E(`${p}.key`, 'ไม่อยู่ในแคตตาล็อก');
          if (c.tone != null) en(c.tone, `${p}.tone`, ENUM.tone);
          ids.push(c.key);
        } else E(p, 'ต้องเป็นคีย์แคตตาล็อก / "custom:<i>" / {key, tone}');
      });
      if (new Set(ids).size !== ids.length) E('metrics.cards', 'การ์ดซ้ำ');
    }
```

In the `metrics.custom` per-item validation, change `closed(c, …, ['label', 'value', 'note'])` to include `'tone'`, and add `if (c.tone != null) en(c.tone, \`metrics.custom[${i}].tone\`, ENUM.tone);`. Export `cardEntries`.

- [ ] **Step 4: Implement the render**

Replace the `cards`/`cardHtml` lines written in Task 2 with:

```js
  // ลำดับ = S.cardEntries (custom แทรกได้ด้วย "custom:<i>") · tone → class สีเดิม (.v pos|neg|neu) — ไม่มี markup ใน JSON (§3.6 H)
  const noteOf = (k) => doc.metrics.notes && doc.metrics.notes[k];
  const cards = S.cardEntries(doc.metrics).map((e) => {
    if (e.custom != null) {
      const c = doc.metrics.custom[e.custom];
      return { k: esc(c.label), v: pr(c.value), d: c.note ? pr(c.note) : '', cls: e.tone || '' };
    }
    const c = K.renderCard(e.key, view), note = noteOf(e.key);
    return { k: esc(c.k), v: esc(c.v), d: esc(c.d) + (note ? (c.d ? ' · ' : '') + pr(note) : ''), cls: e.tone || c.cls };
  });
  const cardHtml = cards.map((c) => `<div class="metric"><div class="k">${c.k}</div><div class="v${c.cls ? ' ' + c.cls : ''}">${c.v}</div><div class="d">${c.d}</div></div>`).join('\n      ');
```

Add `const S = require('../../tools/v3/schema.js');` to the requires at the top of `render.js`.

- [ ] **Step 5: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`. No fixture changes in this task: the orders are restored in Tasks 8–10 together with the cards they need.

- [ ] **Step 6: Commit**

```bash
git add tools/v3/schema.js _template/v3/render.js test/v3/schema.test.js test/v3/render.test.js
git commit -m "feat(v3): ordered section-1 cards (custom:<i>) + per-card tone (§3.6 B-order, H)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---
### Task 5: Leg roles, family weighting, sensitivity range (§3.6 I, C, F)

**Files:**
- Modify: `tools/v3/schema.js` (`ENUM.role`, `ENUM.family`, the leg closed list, `LEG_INPUTS` opt lists, `multipleRange` rules, the cross-leg block, `fvWeights`)
- Modify: `tools/v3/compute.js` (`weightsOf`, the legs → fv block, exports)
- Modify: `_template/v3/render.js` (`valHintParts`, context suffix in `.mname`, range in `mdesc`)
- Modify: `test/v3/schema.test.js`, `test/v3/compute.test.js`, `test/v3/render.test.js`
- Modify: `test/fixtures/v3/BBL-real.json` (family replaces `fvWeights`), `test/fixtures/v3/EQIX-real.json` (context role + range)

**Interfaces:**
- Produces: `legs[i].role?: 'fv'|'context'` (default `'fv'`), `legs[i].family?: 'market'|'rg'|'asset'`, and `legs[i].inputs.multipleRange?: [lo, hi]`. The range is legal on legs that have `inputs.multiple`: pe, pbv-multiple, ps, evsales, evebitda, pfcf, pffo.
- Produces: `C.weightsOf(doc) → number[]` (length = legs). The priority order is:
  1. explicit `fvWeights`;
  2. else, if any `fv` leg has `family`: `1/(nFam × nInFam)`;
  3. else equal weights over `fv` legs.
  Context legs always get 0.
- Produces: each `view.legs[i]` gains `role`, `family`, `lo`, `hi`, `ranged`. `view.fvLow`/`view.fvHigh` are `Σ wᵢ·loᵢ` / `Σ wᵢ·hiᵢ` over fv legs when any fv leg is ranged. Otherwise they are the min/max of the **fv** legs.
- The schema requires ≥1 `fv` leg. "≥2 fv legs" is the gate's E17 (ruling R3, Task 12).

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js`:

```js
// Plan 2a Task 5 — role / family / multipleRange (§3.6 I, C, F)
const ddmLeg = (fam) => ({ method: 'ddm', label: 'DDM', inputs: { g: 5, r: 9 }, ...(fam && { family: fam }) });
const pbvLeg = (fam) => ({ method: 'pbv', label: 'Justified P/BV', inputs: { g: 5, r: 9 }, ...(fam && { family: fam }) });
{ const d = base(); d.legs[1].role = 'ctx'; t(paths(S.validate(d)).includes('legs[1].role'), 'role enum'); }
{ const d = base(); d.legs[0].family = 'value'; t(paths(S.validate(d)).includes('legs[0].family'), 'family enum'); }
{ const d = base(); d.legs[1].role = 'context'; d.fvWeights = [0.5, 0.5]; t(paths(S.validate(d)).includes('fvWeights'), 'context leg must weigh 0'); }
{ const d = base(); d.legs[1].role = 'context'; d.fvWeights = [1, 0]; t.eq(S.validate(d), [], 'context leg with weight 0 is valid'); }
{ const d = base(); d.legs.forEach((l) => { l.role = 'context'; }); t(paths(S.validate(d)).includes('legs'), 'Review Focus #2: every leg context → error'); }
{ const d = base(); d.legs = [{ ...d.legs[0], family: 'market' }, ddmLeg(null)]; t(paths(S.validate(d)).includes('legs[1].family'), 'Review Focus #2: family on some fv legs only → error on the leg missing it'); }
{ const d = base(); d.legs = [{ ...d.legs[0], family: 'market' }, ddmLeg('rg'), pbvLeg('market')];
  t(paths(S.validate(d)).includes('legs[2].family'), 'layer 0: same (r,g) in different families → error'); }
{ const d = base(); d.legs = [{ ...d.legs[0], family: 'market' }, ddmLeg('rg'), pbvLeg('rg')]; t.eq(S.validate(d), [], 'same (r,g) same family → valid'); }
{ const d = base(); d.legs[0].inputs.multipleRange = [20, 34]; t.eq(S.validate(d), [], 'multipleRange around multiple 28 → valid'); }
{ const d = base(); d.legs[0].inputs.multipleRange = [30, 34]; t(paths(S.validate(d)).includes('legs[0].inputs.multipleRange'), 'multiple outside its range → error'); }
{ const d = base(); d.legs[0].inputs.multipleRange = [34, 20]; t(paths(S.validate(d)).includes('legs[0].inputs.multipleRange'), 'lo > hi → error'); }
{ const d = base(); d.legs[1].inputs.multipleRange = [1, 2]; t(paths(S.validate(d)).includes('legs[1].inputs.multipleRange'), 'range on a dcf leg → not in schema'); }
{ const d = base(); d.legs[0].inputs.multipleRange = [20, 34]; d.legs[0].role = 'context'; d.legs.push(ddmLeg(null)); d.fvWeights = null;
  t(paths(S.validate(d)).includes('legs[0].inputs.multipleRange'), 'range on a context leg → error'); }
```

`test/v3/compute.test.js`:

```js
// Plan 2a Task 5 — weights / context / range
t.eq(C.weightsOf(load('ZTS')), [0.5, 0.5], 'legacy: equal weights, byte-identical to Plan 1');
{ const d = load('ZTS'); d.legs = [{ ...d.legs[0], family: 'market' }, { method: 'ddm', label: 'DDM', family: 'rg', inputs: { g: 5, r: 9 } }, { method: 'pbv', label: 'P/BV', family: 'rg', inputs: { g: 5, r: 9 } }];
  t.eq(C.weightsOf(d), [0.5, 0.25, 0.25], 'family: 1 family 1 vote, split inside the family');
  d.fvWeights = [0.6, 0.2, 0.2]; t.eq(C.weightsOf(d), [0.6, 0.2, 0.2], 'explicit fvWeights wins over family'); }
{ const d = load('ZTS'); d.legs[1].role = 'context'; const v = C.compute(d, { seeds });
  t.eq(C.weightsOf(d), [1, 0], 'context leg weighs 0');
  t.near(v.fv, v.legs[0].value, 1e-9, 'fv = the single fv leg');
  t.eq([v.fvLow, v.fvHigh], [v.legs[0].value, v.legs[0].value], 'context leg excluded from fvLow/fvHigh');
  t.eq(v.legs[1].role, 'context', 'view carries role'); }
{ const d = load('ZTS'); d.legs[0].inputs.multipleRange = [20, 34]; const v = C.compute(d, { seeds });
  t.near(v.fvLow, 0.5 * 6.13 * 20 + 0.5 * v.legs[1].value, 1e-9, 'fvLow = Σ w·lo (unranged leg uses its value)');
  t.near(v.fvHigh, 0.5 * 6.13 * 34 + 0.5 * v.legs[1].value, 1e-9, 'fvHigh = Σ w·hi');
  t.near(v.fv, (v.legs[0].value + v.legs[1].value) / 2, 1e-9, 'range does not move fv'); }
```

`test/v3/render.test.js`:

```js
// Plan 2a Task 5 — hint/box จาก role + family · ป้ายขา context
{ const doc = load('ZTS'); doc.legs[1].role = 'context'; const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('<div class="hint">เฉลี่ย 1 วิธี · +1 บริบท</div>'), 'hint counts fv legs + context');
  t(src.includes(`2. ${doc.legs[1].label} (บริบท — ไม่นับใน FV)</div>`), 'context leg mname carries the not-counted suffix');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'context leg: v2 gate 0 errors'); }
{ const doc = load('ZTS'); doc.legs = [{ ...doc.legs[0], family: 'market' }, { method: 'ddm', label: 'DDM', family: 'rg', inputs: { g: 5, r: 9 } }, { method: 'pbv', label: 'Justified P/BV', family: 'rg', inputs: { g: 5, r: 9 } }];
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('<div class="hint">เฉลี่ย 2 ตระกูล (3 วิธี)</div>') && src.includes('มูลค่าเหมาะสมเฉลี่ยตามตระกูล (Fair Value)'), 'family hint + FV box'); }
{ const doc = load('ZTS'); doc.legs[0].inputs.multipleRange = [20, 34]; const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('P/E เป้าหมาย ~28x (มัธยฐาน 5 ปี) · กรอบ 20–34x'), 'mdesc shows the sensitivity range'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `C.weightsOf is not a function`. Schema cases report `legs[1].role: คีย์ไม่อยู่ในสคีมา v3` where the test expects a different path, or report nothing.

- [ ] **Step 3: Implement the schema**

Add to `ENUM`: `role: ['fv', 'context'], family: ['market', 'rg', 'asset'],`.

Change `LEG_INPUTS` so every multiple-type method allows the range:

```js
const MULT = ['multiple', 'multipleSource'];
const RANGE = ['multipleRange'];
const LEG_INPUTS = {
  pe: { req: MULT, opt: RANGE },
  pbv: { req: [], opt: ['multiple', 'multipleSource', 'g', 'r'].concat(RANGE) },   // multiple+source หรือ g+r (justified)
  ps: { req: MULT, opt: RANGE }, evsales: { req: MULT, opt: RANGE }, evebitda: { req: MULT, opt: RANGE },
  pfcf: { req: MULT, opt: RANGE }, pffo: { req: MULT, opt: RANGE },
  fcfyield: { req: ['yield'], opt: [] },
  ddm: { req: ['g', 'r'], opt: [] },
  dcf: { req: ['g1', 'years1', 'tg', 'r', 'rfCurrency'], opt: [] },
  ri: { req: ['r', 'years', 'payout'], opt: [] },
  declared: { req: ['value', 'basis'], opt: ['extrasRef'] },
};
```

In the per-leg loop: change `closed(leg, p, ['method', 'label', 'inputs', 'override', 'note'])` to include `'role', 'family'`, and add right after it:

```js
    if (leg.role != null) en(leg.role, `${p}.role`, ENUM.role);
    if (leg.family != null) en(leg.family, `${p}.family`, ENUM.family);
```

After the `pbv` pairing checks, add:

```js
    if (inp.multipleRange != null) {
      const r = inp.multipleRange, rp = `${p}.inputs.multipleRange`;
      if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => isNum(x) && x > 0) || !(r[0] <= r[1])) E(rp, 'ต้องเป็น [lo, hi] ตัวเลข > 0 และ lo ≤ hi');
      else if (!isNum(inp.multiple)) E(rp, 'ใช้ได้เฉพาะขาที่มี inputs.multiple');
      else if (!(r[0] <= inp.multiple && inp.multiple <= r[1])) E(rp, `multiple ${inp.multiple} ต้องอยู่ในกรอบ [${r[0]}, ${r[1]}]`);
      if (leg.role === 'context') E(rp, 'ขา context ไม่นับในกรอบ FV — ถอด multipleRange');
    }
```

After the `doc.legs.forEach(…)` block (before `if (doc.fvWeights != null)`), add the cross-leg rules:

```js
  if (Array.isArray(doc.legs) && doc.legs.length && doc.legs.every(isObj)) {
    const fvIdx = doc.legs.map((l, i) => (l.role === 'context' ? -1 : i)).filter((i) => i >= 0);
    if (!fvIdx.length) E('legs', 'ต้องมีขา role:"fv" อย่างน้อย 1 ขา (FV คิดจากขา fv เท่านั้น) — ≥2 ขาตรวจที่ gate E17');
    const withFam = fvIdx.filter((i) => doc.legs[i].family != null);
    if (withFam.length && withFam.length !== fvIdx.length) {
      for (const i of fvIdx) if (doc.legs[i].family == null) E(`legs[${i}].family`, 'ใช้ family แล้วต้องระบุทุกขา role:"fv" (1 ตระกูล 1 เสียง)');
    }
    // ชั้น 0 (§3.6 C): 2 ขาที่ (r,g) เหมือนกัน = ตระกูลเดียวกันเสมอ
    const sig = (l) => { const i = isObj(l.inputs) ? l.inputs : {}; const g = i.g != null ? i.g : i.tg != null ? i.tg : i.g2; return isNum(i.r) && isNum(g) ? `${i.r}|${g}` : null; };
    for (let a = 0; a < doc.legs.length; a++) for (let b = a + 1; b < doc.legs.length; b++) {
      const A = doc.legs[a], B = doc.legs[b];
      if (sig(A) && sig(A) === sig(B) && A.family && B.family && A.family !== B.family)
        E(`legs[${b}].family`, `(r,g) ชุดเดียวกับ legs[${a}] ต้องอยู่ตระกูลเดียวกัน — ชั้น 0`);
    }
  }
```

In the `fvWeights` block, add after the existing length/sum check (inside `if (doc.fvWeights != null)`):

```js
    if (Array.isArray(w) && Array.isArray(doc.legs)) doc.legs.forEach((l, i) => {
      if (isObj(l) && l.role === 'context' && w[i] !== 0) E('fvWeights', `legs[${i}] เป็นขา context — น้ำหนักต้องเป็น 0`);
    });
```

- [ ] **Step 4: Implement compute**

Add above `compute`:

```js
// น้ำหนัก FV (§3.6 C/I): fvWeights ที่เขียนชัด > family (1 ตระกูล 1 เสียง แบ่งเท่ากันในตระกูล) > เท่ากันทุกขา fv · ขา context = 0 เสมอ
function weightsOf(doc) {
  const isFv = (l) => l.role !== 'context';
  if (doc.fvWeights) return doc.fvWeights.slice();
  const fv = doc.legs.filter(isFv);
  if (fv.some((l) => l.family != null)) {
    const n = {}; for (const l of fv) n[l.family] = (n[l.family] || 0) + 1;
    const nFam = Object.keys(n).length;
    return doc.legs.map((l) => (isFv(l) ? 1 / (nFam * n[l.family]) : 0));
  }
  return doc.legs.map((l) => (isFv(l) ? 1 / fv.length : 0));
}
```

Replace the `// ── legs → fv ──` block (from `const legs = …` through `const fvLow = …, fvHigh = …;`) with:

```js
  // ── legs → fv ──
  const legs = doc.legs.map((leg, i) => {
    if (leg.method === 'declared' && leg.inputs.extrasRef != null && !doc.extras[leg.inputs.extrasRef])
      throw new Error(`legs[${i}].inputs.extrasRef: ไม่มี extras[${leg.inputs.extrasRef}]`);
    const value = L.legValue(leg, f, `legs[${i}]`);
    const r = leg.inputs.multipleRange;
    const at = (m) => L.legValue({ ...leg, inputs: { ...leg.inputs, multiple: m } }, f, `legs[${i}].inputs.multipleRange`);
    return { label: leg.label, method: leg.method, value, inputs: leg.inputs, override: leg.override || null, note: leg.note || '',
      role: leg.role || 'fv', family: leg.family || null, lo: r ? at(r[0]) : value, hi: r ? at(r[1]) : value, ranged: !!r };
  });
  const w = weightsOf(doc);
  legs.forEach((l, i) => { l.weight = w[i]; });
  const fv = legs.reduce((a, l) => a + l.value * l.weight, 0);
  const fvLegs = legs.filter((l) => l.role === 'fv');
  // กรอบ FV (§3.6 F): มีขาใดประกาศ multipleRange → Σ w·lo / Σ w·hi · ไม่มี = min/max ของขา fv (ขา context ไม่นับ — §3.6 I)
  const ranged = fvLegs.some((l) => l.ranged);
  const fvLow = ranged ? fvLegs.reduce((a, l) => a + l.lo * l.weight, 0) : Math.min(...fvLegs.map((l) => l.value));
  const fvHigh = ranged ? fvLegs.reduce((a, l) => a + l.hi * l.weight, 0) : Math.max(...fvLegs.map((l) => l.value));
```

Change the export to `module.exports = { compute, weightsOf, SCN_NAMES };`.

- [ ] **Step 5: Implement the render**

Replace `valHintParts` with:

```js
// หัว §3 + ป้ายกล่อง FV — ruling R6 (valHint) · §3.6 C (family) · §3.6 I (ขา context ไม่นับ)
function valHintParts(doc, view) {
  if (doc.text && doc.text.valHint) return { hint: P.renderProse(doc.text.valHint, view, { mode: 'v2src' }), box: 'มูลค่าเหมาะสม (Fair Value)' };
  const fv = view.legs.filter((l) => l.role === 'fv'), nCtx = view.legs.length - fv.length;
  const fams = new Set(fv.map((l) => l.family).filter(Boolean));
  const byFamily = !doc.fvWeights && fams.size > 0;
  const word = byFamily ? 'เฉลี่ยตามตระกูล' : doc.fvWeights ? 'ถ่วงน้ำหนัก' : 'เฉลี่ย';
  const hint = (byFamily ? `เฉลี่ย ${fams.size} ตระกูล (${fv.length} วิธี)` : `${word} ${fv.length} วิธี`) + (nCtx ? ` · +${nCtx} บริบท` : '');
  return { hint, box: `มูลค่าเหมาะสม${word} (Fair Value)` };
}
```

In `legsHtml`, change `${i + 1}. ${esc(l.label)}</div>` to `${i + 1}. ${esc(l.label)}${l.role === 'context' ? ' (บริบท — ไม่นับใน FV)' : ''}</div>`.

In `mdesc`, after `const src = …;` add `const rng = i.multipleRange ? \` · กรอบ ${i.multipleRange[0]}–${i.multipleRange[1]}x\` : '';`. Append `${rng}` to the end of the `pe` return, to the multiple branch of `pbv`, and to the `default` return:

```js
    case 'pe': return `${epsLabel(leg, view)} ${m(b.eps)} × P/E เป้าหมาย ~${i.multiple}x${src}${rng}`;
    case 'pbv': return i.multiple != null ? `BVPS ${m(b.bvps)} × P/BV ${i.multiple}x${src}${rng}`
      : `P/BV เหมาะสม = (ROE ${b.roe}% − g ${i.g}%)/(r ${i.r}% − g ${i.g}%) ≈ ${((b.roe - i.g) / (i.r - i.g)).toFixed(2)} × BVPS ${m(b.bvps)}`;
    …
    default: return `${METHOD_NAME[leg.method]} ${i.multiple}x${src}${rng}`;
```

- [ ] **Step 6: Fixtures — BBL (C) and EQIX (I, F)**

BBL: the families reproduce `[0.5, 0.25, 0.25]` exactly, so the numeric weights go.

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/BBL-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
if(JSON.stringify(d.fvWeights)!=="[0.5,0.25,0.25]"||d.legs.map(l=>l.method).join()!=="pe,ddm,pbv")throw new Error("BBL legs drifted");
d.legs[0].family="market"; d.legs[1].family="rg"; d.legs[2].family="rg"; d.fvWeights=null;
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

EQIX: the P/AFFO leg is context (ruling R7: it stays `declared`, since its multiple is the current one). The FV range is the P/E sensitivity 59.9–99.2x.

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/EQIX-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
const L1="P/AFFO ปัจจุบัน (บริบท — ไม่นับใน FV)"; if(d.legs[1].label!==L1||JSON.stringify(d.fvWeights)!=="[1,0]")throw new Error("EQIX legs drifted");
d.legs[1].label="P/AFFO ปัจจุบัน"; d.legs[1].role="context"; d.fvWeights=null;
d.legs[0].inputs.multipleRange=[59.9,99.2];
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

Add to `test/v3/real-fixtures.test.js`, before `t.done();`:

```js
// Task 5 — EQIX: กรอบ FV = ความไวของขา P/E 59.9–99.2x (compare doc gap 1) · BBL: family แทน fvWeights
{ const v = C.compute(load('EQIX-real'), { seeds: {} });
  t.eq([round2(v.fvLow), round2(v.fvHigh)], [931.45, 1542.56], 'EQIX-real: fvLow/fvHigh = 15.55 × 59.9 / 99.2');
  t.eq(v.legs.map((l) => l.role), ['fv', 'context'], 'EQIX-real: P/AFFO leg is context'); }
t.eq(C.weightsOf(load('BBL-real')), [0.5, 0.25, 0.25], 'BBL-real: family weights reproduce the old fvWeights exactly');
```

- [ ] **Step 7: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`. The FVs are unchanged: BBL 176.77 (same weights) and EQIX 1253.33 (context weighed 0 before too). The EQIX v2 gate on render is 0/0 with the range $931.45–$1,542.56.

- [ ] **Step 8: Commit**

```bash
git add tools/v3/schema.js tools/v3/compute.js _template/v3/render.js test/v3/schema.test.js test/v3/compute.test.js test/v3/render.test.js test/v3/real-fixtures.test.js test/fixtures/v3/BBL-real.json test/fixtures/v3/EQIX-real.json
git commit -m "feat(v3): leg role (context), family weighting + layer-0 (r,g) check, multipleRange FV bounds (§3.6 I/C/F)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 6: Leg methods and labels — `ddm2` (N), `medianWindow` + `epsBasis: 'ifrs'` (G)

**Files:**
- Modify: `tools/v3/legs.js` (`ddm2` case)
- Modify: `tools/v3/schema.js` (`ENUM.method`, `ENUM.epsBasis`, `LEG_INPUTS.ddm2`, `medianWindow` in the multiple opts, numeric input list, ddm2/medianWindow rules)
- Modify: `tools/v3/cards.js` (eps `.d` map)
- Modify: `_template/v3/render.js` (`METHOD_NAME`, `EPS_BASIS_LABEL`, `mdesc`)
- Modify: `test/v3/legs.test.js`, `test/v3/schema.test.js`, `test/v3/render.test.js`, `test/v3/real-fixtures.test.js`
- Modify: `test/fixtures/v3/FER-real.json` (DDM leg becomes `ddm2`, `epsBasis: 'ifrs'`), `EQIX-real.json`, `BBL-real.json` (`medianWindow`, notes that no longer duplicate mdesc)

**Interfaces:**
- Produces: method `ddm2`, inputs `{ d1, g1, years1, g2, r, horizon: int ≥1 | null }`. `d1` is per-share, quote currency.
  - Formula: `Σ_{t=1..H} D_t/(1+r)^t`, with `D_1 = d1` and `D_{t+1} = D_t·(1 + (t < years1 ? g1 : g2))`.
  - `H = horizon`. When `horizon` is `null`, `H = years1`, plus a Gordon terminal `D_{years1+1}/(r−g2)` discounted by `(1+r)^years1`.
- Produces: `inputs.medianWindow?: string` (≤40 chars). It is legal only with `multipleSource` `median5y|median10y` and replaces the source name in mdesc with `(มัธยฐาน <window>)`.
- Produces: `epsBasis: 'ifrs'`. The mdesc label becomes `EPS IFRS (TTM)`; the eps card `.d` becomes `IFRS`.

- [ ] **Step 1: Write the failing tests**

`test/v3/legs.test.js` (before `t.done();`):

```js
// Plan 2a Task 6 — ddm2 (§3.1 · §3.6 N) · ธรรมเนียมรอยต่อ: โต g1 ขณะ t < years1
const FER2 = { d1: 2.04, g1: 11, years1: 10, g2: 3, r: 8.5 };
t.near(v('ddm2', { ...FER2, horizon: 40 }), 55.02209244386823, 1e-9, 'ddm2 finite 40y = FER $55.02 (spec §3.6 N)');
t(Math.abs(v('ddm2', { ...FER2, horizon: 40 }) - 57.67) > 2, 'the t ≤ years1 convention ($57.67) is NOT what we compute');
t.near(v('ddm2', { ...FER2, horizon: null }), 64.09901699407415, 1e-9, 'ddm2 horizon null = Gordon terminal after stage 1');
t.throws(() => v('ddm2', { ...FER2, g2: 9, horizon: null }), /^legs\[0\].*g2/, 'Review Focus #3: horizon null with r ≤ g2 → path-named throw');
t(v('ddm2', { ...FER2, g2: 9, horizon: 40 }) > 0, 'finite horizon needs no r > g2');
```

`test/v3/schema.test.js`:

```js
// Plan 2a Task 6 — ddm2 / medianWindow / ifrs
const ddm2 = (inp) => ({ method: 'ddm2', label: 'DDM 2 ระยะ', inputs: inp });
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r: 9, horizon: 30 })); t.eq(S.validate(d), [], 'ddm2 finite valid'); }
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r: 9, horizon: null })); t.eq(S.validate(d), [], 'ddm2 horizon null valid'); }
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r: 9 })); t(paths(S.validate(d)).includes('legs[2].inputs.horizon'), 'Review Focus #3: horizon key must be present'); }
{ const d = base(); d.legs.push(ddm2({ d1: 2, g1: 10, years1: 5, g2: 3, r: 9, horizon: 0 })); t(paths(S.validate(d)).includes('legs[2].inputs.horizon'), 'Review Focus #3: horizon 0 → error'); }
{ const d = base(); d.legs.push(ddm2({ d1: 0, g1: 10, years1: 5, g2: 3, r: 9, horizon: 30 })); t(paths(S.validate(d)).includes('legs[2].inputs.d1'), 'd1 > 0'); }
{ const d = base(); d.legs[0].inputs.medianWindow = 'FY2021–FY2025'; t.eq(S.validate(d), [], 'medianWindow with median5y'); }
{ const d = base(); d.legs[0].inputs.multipleSource = 'peer'; d.legs[0].inputs.medianWindow = 'FY21–25'; t(paths(S.validate(d)).includes('legs[0].inputs.medianWindow'), 'medianWindow needs a median source'); }
{ const d = base(); d.legs[0].inputs.medianWindow = 'x'.repeat(41); t(paths(S.validate(d)).includes('legs[0].inputs.medianWindow'), 'medianWindow ≤ 40 chars'); }
{ const d = base(); d.fundamentals.epsBasis = 'ifrs'; t.eq(S.validate(d), [], 'epsBasis ifrs'); }
```

`test/v3/render.test.js`:

```js
// Plan 2a Task 6 — mdesc ของ ddm2 / medianWindow / ifrs
{ const doc = load('ZTS'); doc.legs[1] = { method: 'ddm2', label: 'DDM 2 ระยะ', inputs: { d1: 2.04, g1: 11, years1: 10, g2: 3, r: 8.5, horizon: 40 } };
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('D₁ $2.04 โต 11%/ปี 10 ปี แล้ว 3%/ปี · r 8.5% · 40 งวด ไม่มีมูลค่าปลายงวด'), 'ddm2 mdesc (finite)');
  t(src.includes('$55.02</div>'), 'ddm2 mval computed');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'ddm2: v2 gate 0 errors'); }
{ const doc = load('ZTS'); doc.legs[0].inputs.medianWindow = 'FY2022–FY2025'; doc.fundamentals.epsBasis = 'ifrs';
  const view = C.compute(doc, { seeds }); const src = R.toV2Source(doc, view);
  t(src.includes('EPS IFRS (TTM) $6.13 × P/E เป้าหมาย ~28x (มัธยฐาน FY2022–FY2025)'), 'medianWindow replaces the source name · ifrs label');
  t.eq(require('../../tools/v3/cards.js').renderCard('eps', view).d, 'IFRS', 'eps card base line says IFRS'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `legs[0].method: ไม่รู้จักวิธี "ddm2"` in legs; schema errors on the valid ddm2/medianWindow/ifrs cases.

- [ ] **Step 3: Implement**

`tools/v3/legs.js` — add before `case 'dcf':`:

```js
    case 'ddm2': {
      // §3.6 N — D₁ = d1 · D_{t+1} = D_t·(1+g1) ขณะ t < years1 ไม่งั้น (1+g2) · horizon null = Gordon ปลายช่วง 1
      const r = pct(i.r), H = i.horizon == null ? i.years1 : i.horizon;
      if (i.horizon == null) spread(i.r, i.g2, 'g2');
      let D = i.d1, pv = 0;
      for (let t = 1; t <= H; t++) { pv += D / Math.pow(1 + r, t); D *= 1 + pct(t < i.years1 ? i.g1 : i.g2); }
      if (i.horizon == null) pv += D / (r - pct(i.g2)) / Math.pow(1 + r, i.years1);
      v = pv;
      break;
    }
```

`tools/v3/schema.js`:
- `ENUM.epsBasis`: `['gaap-ttm', 'adj-ttm', 'fy', 'ifrs']`.
- `ENUM.method`: insert `'ddm2'` after `'ddm'`.
- `const RANGE = ['multipleRange', 'medianWindow'];` (both options live on the same multiple-type legs).
- `LEG_INPUTS`: add `ddm2: { req: ['d1', 'g1', 'years1', 'g2', 'r'], opt: ['horizon'] },`.
- In the numeric list `for (const k of ['multiple', 'g', 'r', 'g1', 'tg', 'yield', 'value', 'payout'])`, add `'d1', 'g2'`.
- After the `multipleRange` block, add:

```js
    if (leg.method === 'ddm2') {
      if (!('horizon' in inp)) E(`${p}.inputs.horizon`, 'ต้องมี — จำนวนงวด (จำนวนเต็ม ≥1) หรือ null = มูลค่าปลายงวดแบบ Gordon');
      else if (inp.horizon !== null) num(inp.horizon, `${p}.inputs.horizon`, { int: true, min: 1 });
      if (isNum(inp.d1) && !(inp.d1 > 0)) E(`${p}.inputs.d1`, 'ต้อง > 0');
    }
    if (inp.medianWindow != null) {
      const mp = `${p}.inputs.medianWindow`;
      if (typeof inp.medianWindow !== 'string' || !inp.medianWindow.trim() || inp.medianWindow.length > 40) E(mp, 'ต้องเป็นข้อความสั้น ≤40 ตัวอักษร (เช่น "FY2022–FY2025")');
      if (!['median5y', 'median10y'].includes(inp.multipleSource)) E(mp, 'ใช้คู่กับ multipleSource median5y/median10y เท่านั้น');
    }
```

`tools/v3/cards.js` — the eps `.d` map becomes `{ 'gaap-ttm': 'GAAP', 'adj-ttm': 'Adjusted', fy: 'ปีบัญชีล่าสุด', ifrs: 'IFRS' }`.

`_template/v3/render.js`:
- `METHOD_NAME`: add `ddm2: 'DDM 2 ระยะ',`.
- `EPS_BASIS_LABEL`: add `ifrs: 'EPS IFRS (TTM)'`.
- In `mdesc`, replace `const src = …` with:

```js
  const src = i.medianWindow ? ` (มัธยฐาน ${i.medianWindow})` : i.multipleSource ? ` (${SRC_NAME[i.multipleSource]})` : '';
```

and add a case before `case 'dcf':`:

```js
    case 'ddm2': return `D₁ ${m(i.d1)} โต ${i.g1}%/ปี ${i.years1} ปี แล้ว ${i.g2}%/ปี · r ${i.r}% · `
      + (i.horizon == null ? 'มูลค่าปลายงวดแบบ Gordon' : `${i.horizon} งวด ไม่มีมูลค่าปลายงวด`);
```

(The wording has no `g N%` token, so the v2 W14 DDM re-computation stays silent on a two-stage leg. It could not re-derive it anyway.)

- [ ] **Step 4: Fixtures**

FER — the finite-horizon DDM is now computed ($55.02; the author's old $57.66 cannot recur). The note keeps only what mdesc does not say:

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/FER-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
const L=d.legs[1]; if(L.method!=="declared"||L.inputs.value!==55.02)throw new Error("FER leg2 drifted");
d.legs[1]={method:"ddm2",label:L.label,inputs:{d1:2.04,g1:11,years1:10,g2:3,r:8.5,horizon:40},
 note:"D₁ = เงินสดที่จ่ายคืนผู้ถือหุ้นได้ปี 2570 (เงินปันผลรับจากสัมปทานปี 2569 ~$1.84/หุ้น หักค่าใช้จ่ายสำนักงานใหญ่ แล้วโต 11%) — ตัดจบที่ 0 ตามอายุสัมปทานถัวเฉลี่ย (~ปี 2066) ไม่ใช้ perpetuity · ค่าเดิม $57.66 ย้อนคำนวณไม่ตรงจึงแก้เป็น {{leg2}}"};
if(d.fundamentals.epsBasis!=="gaap-ttm")throw new Error("FER epsBasis drifted"); d.fundamentals.epsBasis="ifrs";
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

EQIX and BBL — the real median window replaces "มัธยฐาน 5 ปี", and the notes stop repeating it:

```bash
node -e '
const fs=require("fs");
const edit=(f,fn)=>{const p="test/fixtures/v3/"+f+".json",d=JSON.parse(fs.readFileSync(p,"utf8"));fn(d);fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");};
edit("EQIX-real",(d)=>{const L=d.legs[0]; if(!L.note.startsWith("มัธยฐาน P/E FY2022–FY2025"))throw new Error("EQIX note drifted");
 L.inputs.medianWindow="FY2022–FY2025";
 L.note="ราคาเฉลี่ยรายปี ÷ EPS diluted · ตัด FY2021 ที่ 140x ออกเพราะกำไรเกือบศูนย์ · เป็นตัวคูณจากประวัติ ไม่ได้มาจาก P/E ปัจจุบัน ({{pe}}x)";});
edit("BBL-real",(d)=>{const L=d.legs[0]; if(L.note!=="Normalized EPS ~฿22 · มัธยฐาน FY2021–25 วัดจริง")throw new Error("BBL note drifted");
 L.inputs.medianWindow="FY2021–25"; L.note="Normalized EPS ~฿22 · วัดจริง";});'
```

Add to `test/v3/real-fixtures.test.js`:

```js
// Task 6 — FER DDM 40 ปีคำนวณเอง (ไม่ใช่ declared) · FV คงที่ 53.42
{ const v = C.compute(load('FER-real'), { seeds: {} });
  t.eq(v.legs[1].method, 'ddm2', 'FER-real: finite DDM is a computed leg');
  t.eq(round2(v.legs[1].value), 55.02, 'FER-real: ddm2 = $55.02'); }
```

- [ ] **Step 5: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`. FER's FV is still 53.42: (51.81 + 55.0221)/2 = 53.416, and `rd.fv` is 53.42 either way.

- [ ] **Step 6: Commit**

```bash
git add tools/v3/legs.js tools/v3/schema.js tools/v3/cards.js _template/v3/render.js test/v3/legs.test.js test/v3/schema.test.js test/v3/render.test.js test/v3/real-fixtures.test.js test/fixtures/v3/FER-real.json test/fixtures/v3/EQIX-real.json test/fixtures/v3/BBL-real.json
git commit -m "feat(v3): ddm2 finite/two-stage DDM, medianWindow, epsBasis ifrs (§3.6 N/G)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 7: `analyst.n` / `analyst.asOf` optional (§3.6 D)

**Files:**
- Modify: `tools/v3/schema.js` (analyst block)
- Modify: `_template/v3/render.js` (`analystCell`)
- Modify: `test/v3/schema.test.js`, `test/v3/render.test.js`
- Modify: `test/fixtures/v3/FER-real.json` (restore the analyst target it had to drop), `BBL-real.json`, `EQIX-real.json` (drop the proxy `asOf`)

**Interfaces:**
- `analyst: { target, rating, n?: int ≥1 | null, asOf?: ISO | null }`. With `n` absent or null, the verdict cell renders `(<rating> · n/a)`, and the gauge marker and `{{analyst.*}}` tokens stay.

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js`:

```js
// Plan 2a Task 7 — analyst.n / asOf ไม่บังคับ (§3.6 D)
{ const d = base(); d.analyst = { target: 190, rating: 'Buy' }; t.eq(S.validate(d), [], 'analyst without n/asOf is valid'); }
{ const d = base(); d.analyst = { target: 190, rating: 'Buy', n: null, asOf: null }; t.eq(S.validate(d), [], 'explicit nulls are valid'); }
{ const d = base(); d.analyst.n = 0; t(paths(S.validate(d)).includes('analyst.n'), 'n, when present, is an int ≥ 1'); }
{ const d = base(); d.analyst.asOf = '20/09/2026'; t(paths(S.validate(d)).includes('analyst.asOf'), 'asOf, when present, is ISO'); }
```

`test/v3/render.test.js`:

```js
// Plan 2a Task 7 — ไม่มีจำนวนราย → "n/a" แต่เป้า + ป้าย gauge ยังอยู่ (เดิมต้องตั้ง analyst:null = "ไม่มีข้อมูล" ซึ่งเป็นเท็จ)
{ const doc = load('ZTS'); doc.analyst = { target: 190, rating: 'Buy' }; const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('~{{rd:analystTgt}} (Buy · n/a)'), 'verdict cell shows n/a for the count');
  t(src.includes('{{rd:analystTgt}}<br><small>เป้าเฉลี่ย Analyst</small>'), 'gauge marker kept');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'analyst without n: v2 gate 0 errors'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `analyst.n: ต้องมี (ตัวเลข)` on the valid cases, and the render test finds `(Buy · undefined ราย)`.

- [ ] **Step 3: Implement**

`tools/v3/schema.js` — replace the analyst `else { … }` with:

```js
    else {
      closed(a, 'analyst', ['target', 'n', 'rating', 'asOf']);
      num(a.target, 'analyst.target', { gt: 0 });
      if (a.n != null) num(a.n, 'analyst.n', { int: true, min: 1 });
      str(a.rating, 'analyst.rating');
      if (a.asOf != null && !ISO.test(a.asOf)) E('analyst.asOf', 'ต้องเป็น ISO YYYY-MM-DD หรือ null');
    }
```

`_template/v3/render.js` — `analystCell` becomes:

```js
  const an = doc.analyst;
  const analystCell = an
    ? `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v" style="color:#a5d6a7">~{{rd:analystTgt}} (${esc(an.rating)} · ${an.n != null ? an.n + ' ราย' : 'n/a'})</div></div>`
    : `<div class="vcell"><div class="k">เป้านักวิเคราะห์ 12 ด.</div><div class="v">ไม่มีข้อมูล</div></div>`;
```

- [ ] **Step 4: Fixtures**

FER lost its $76.96 Buy target (compare doc D2, gap 3), and the page said "ไม่มีข้อมูล", which is false. BBL/EQIX carry an `asOf` that was only a proxy for the analysis date (v2 never records it):

```bash
node -e '
const fs=require("fs");
const edit=(f,fn)=>{const p="test/fixtures/v3/"+f+".json",d=JSON.parse(fs.readFileSync(p,"utf8"));fn(d);fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");};
edit("FER-real",(d)=>{ if(d.analyst!==null)throw new Error("FER analyst drifted");
  d.analyst={target:76.96,rating:"Buy"};
  const a="เป้าเฉลี่ยนักวิเคราะห์ $76.96"; if(!d.prose.gauge.includes(a))throw new Error("FER gauge drifted");
  d.prose.gauge=d.prose.gauge.replace(a,"เป้าเฉลี่ยนักวิเคราะห์ {{analyst.target}}"); });
for (const f of ["BBL-real","EQIX-real"]) edit(f,(d)=>{ delete d.analyst.asOf; });'
```

- [ ] **Step 5: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`. FER's v2 gate on render stays 0/0 with the analyst marker back on the gauge. Its FV is unchanged (analyst targets are never legs).

- [ ] **Step 6: Commit**

```bash
git add tools/v3/schema.js _template/v3/render.js test/v3/schema.test.js test/v3/render.test.js test/fixtures/v3/FER-real.json test/fixtures/v3/BBL-real.json test/fixtures/v3/EQIX-real.json
git commit -m "feat(v3): analyst.n/asOf optional — keep the target when the count is unknown (§3.6 D)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 8: FY cards (`fundamentals.fy`) + bank KPIs (`fundamentals.bank`) (§3.6 B, K)

**Files:**
- Modify: `tools/v3/schema.js` (`CARD_KEYS`, `FUND_KEYS`, numeric loop, `fy`/`bank` blocks)
- Modify: `tools/v3/cards.js` (`stmt()` helper; `netIncomeFy`, `epsFy`, `revenueFy`, `nim`, `npl`, `capital`)
- Modify: `test/v3/schema.test.js`, `test/v3/cards.test.js`
- Modify: `test/fixtures/v3/BBL-real.json` (4 custom cards → catalogue; v2 card order + `pbv` tone)

**Interfaces:**
- `fundamentals.fy?: { period: string ≤20, netIncome?, eps?, revenue? }`. At least one number is required. `eps` is per-share (quote currency); `netIncome`/`revenue` are statement currency.
- `fundamentals.bank?: { nim?, npl?, coverage?, cet1?, car? }`. All values are percentages ≥0; `coverage` may be ≤1000, the rest ≤100.
- Cards: `netIncomeFy` (`กำไรสุทธิ <period>`), `epsFy` (`EPS <period>`), `revenueFy` (`รายได้ <period>`), `nim` (`NIM`, 2 dp), `npl` (`NPL / Coverage`), `capital` (`CET1 / CAR`, class `pos`). A missing field throws `metrics.cards: … fundamentals.fy.<k>` / `fundamentals.bank.<k>`.
- Produces: `cards.js` internal `stmt(view, v)`. It formats a statement total with a U+2212 sign. Task 10 swaps its symbol to the statement currency.

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js`:

```js
// Plan 2a Task 8 — fy + bank (§3.6 B, K)
{ const d = base(); d.fundamentals.fy = { period: 'FY2025', netIncome: 2.67e9, eps: 6.02 }; d.metrics.cards.push('netIncomeFy', 'epsFy'); t.eq(S.validate(d), [], 'fy + FY cards valid'); }
{ const d = base(); d.fundamentals.fy = { period: 'FY2025' }; t(paths(S.validate(d)).includes('fundamentals.fy'), 'fy needs ≥1 number'); }
{ const d = base(); d.fundamentals.fy = { period: 'FY2025', ebit: 1 }; t(paths(S.validate(d)).includes('fundamentals.fy.ebit'), 'fy is closed'); }
{ const d = base(); d.fundamentals.bank = { nim: 2.49, npl: 3, coverage: 324, cet1: 16.4, car: 20.9 }; d.metrics.cards.push('nim', 'npl', 'capital'); t.eq(S.validate(d), [], 'bank + bank cards valid'); }
{ const d = base(); d.fundamentals.bank = { nim: 249 }; t(paths(S.validate(d)).includes('fundamentals.bank.nim'), 'bank % ≤ 100'); }
{ const d = base(); d.fundamentals.bank = { roa: 1 }; t(paths(S.validate(d)).includes('fundamentals.bank.roa'), 'bank is closed'); }
```

`test/v3/cards.test.js`:

```js
// Plan 2a Task 8 — การ์ด FY + ธนาคาร
{ const d = load(); d.fundamentals.fy = { period: 'FY2025', netIncome: 2.673e9, eps: 6.02, revenue: 9.26e9 };
  d.fundamentals.bank = { nim: 2.49, npl: 3, coverage: 324, cet1: 16.4, car: 20.9 };
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  const c = (k) => K.renderCard(k, v2);
  t.eq([c('netIncomeFy').k, c('netIncomeFy').v], ['กำไรสุทธิ FY2025', RV.fmtBig(2.673e9, '$')], 'netIncomeFy label/value');
  t.eq([c('epsFy').k, c('epsFy').v], ['EPS FY2025', '~$6.02'], 'epsFy');
  t.eq(c('revenueFy').k, 'รายได้ FY2025', 'revenueFy label');
  t.eq(c('nim').v, '2.49%', 'nim 2 dp');
  t.eq(c('npl').v, '3.0% / 324%', 'npl / coverage');
  t.eq([c('capital').v, c('capital').cls], ['~16.4% / 20.9%', 'pos'], 'capital'); }
{ const d = load(); d.fundamentals.fy = { period: 'FY2025', netIncome: -3.1e8 }; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('netIncomeFy', v2).v, '−' + RV.fmtBig(3.1e8, '$'), 'negative statement total uses U+2212, never "$-310M"'); }
{ const v2 = C.compute(load(), { seeds: { ZTS: '#e8731a' } });
  t.throws(() => K.renderCard('epsFy', v2), /fundamentals\.fy/, 'FY card without fy names the field');
  t.throws(() => K.renderCard('nim', v2), /fundamentals\.bank\.nim/, 'bank card without data names the field'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `fundamentals.fy: คีย์ไม่อยู่ในสคีมา v3`, `metrics.cards[12]: ไม่อยู่ในแคตตาล็อก`, and `metrics.cards: ไม่รู้จักการ์ด netIncomeFy`.

- [ ] **Step 3: Implement the schema**

```js
const CARD_KEYS = ['mcap', 'pe', 'peAvg5y', 'pbv', 'ps', 'netIncome', 'eps', 'bvps', 'roe', 'revenue', 'grossMargin',
  'netMargin', 'opMargin', 'yield', 'beta', 'range52w', 'fcf', 'debtToEquity',
  'netDebt', 'ebitdaMargin', 'roic', 'evEbitda', 'peForward', 'analystTarget',
  'netIncomeFy', 'epsFy', 'revenueFy', 'nim', 'npl', 'capital'];   // + Plan 2a Task 8 (§3.6 B/K)
const FUND_NUM = ['eps', 'dps', 'bvps', 'shares', 'revenue', 'netIncome', 'roe', 'roa', 'grossMargin', 'netMargin',
  'opMargin', 'beta', 'debtToEquity', 'fcf', 'ebitda', 'netDebt', 'peAvg5y', 'ffoPerShare', 'roic', 'epsForward'];
const FUND_KEYS = FUND_NUM.concat(['epsBasis', 'fy', 'bank']);
const FY_KEYS = ['period', 'netIncome', 'eps', 'revenue'];
const BANK_KEYS = ['nim', 'npl', 'coverage', 'cet1', 'car'];
```

In the `fundamentals` block, replace `for (const k of FUND_KEYS) if (k !== 'epsBasis' && f[k] != null) num(…)` with `for (const k of FUND_NUM) if (f[k] != null) num(f[k], \`fundamentals.${k}\`);`, and add:

```js
    if (f.fy != null) {
      if (!isObj(f.fy)) E('fundamentals.fy', 'ต้องเป็น object {period, netIncome?, eps?, revenue?}');
      else {
        closed(f.fy, 'fundamentals.fy', FY_KEYS);
        str(f.fy.period, 'fundamentals.fy.period');
        if (typeof f.fy.period === 'string' && f.fy.period.length > 20) E('fundamentals.fy.period', 'ยาวเกิน 20 ตัวอักษร (เช่น "FY2025")');
        for (const k of ['netIncome', 'eps', 'revenue']) if (f.fy[k] != null) num(f.fy[k], `fundamentals.fy.${k}`);
        if (!['netIncome', 'eps', 'revenue'].some((k) => f.fy[k] != null)) E('fundamentals.fy', 'ต้องมีตัวเลขอย่างน้อย 1 ช่อง (netIncome/eps/revenue)');
      }
    }
    if (f.bank != null) {
      if (!isObj(f.bank)) E('fundamentals.bank', 'ต้องเป็น object ของ % (nim npl coverage cet1 car)');
      else {
        closed(f.bank, 'fundamentals.bank', BANK_KEYS);
        for (const k of BANK_KEYS) if (f.bank[k] != null) {
          num(f.bank[k], `fundamentals.bank.${k}`, { min: 0 });
          if (isNum(f.bank[k]) && f.bank[k] > (k === 'coverage' ? 1000 : 100)) E(`fundamentals.bank.${k}`, `เป็นหน่วย % — เกิน ${k === 'coverage' ? 1000 : 100} ผิดวิสัย`);
        }
      }
    }
```

Export `FY_KEYS` and `BANK_KEYS` too.

- [ ] **Step 4: Implement the catalogue**

In `tools/v3/cards.js`, add below `const pct1 = …`:

```js
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
// ยอดรวมจากงบ (ทั้งบริษัท) — ลบใช้ U+2212 นำหน้าสัญลักษณ์ (RV.fmtBig รับแค่ค่าบวก) · Task 10 เปลี่ยนเป็นสกุลงบ
const stmt = (view, v) => (v < 0 ? '−' + RV.fmtBig(-v, view.cur) : RV.fmtBig(v, view.cur));
function fyOf(view) { const y = f(view).fy; if (!y) throw new Error('metrics.cards: การ์ด FY ต้องมี fundamentals.fy — เติม หรือถอดการ์ดออก'); return y; }
function needFy(view, k) { const x = fyOf(view)[k]; if (!isNum(x)) throw new Error(`metrics.cards: การ์ดต้องใช้ fundamentals.fy.${k} — เติมค่า หรือถอดการ์ดออก`); return x; }
function needBank(view, k) { const b = f(view).bank; const x = b && b[k]; if (!isNum(x)) throw new Error(`metrics.cards: การ์ดต้องใช้ fundamentals.bank.${k} — เติมค่า หรือถอดการ์ดออก`); return x; }
```

Add these entries to `CATALOGUE` (after `analystTarget`):

```js
  // Plan 2a Task 8 — ตัวเลขทั้งปีคู่ TTM (§3.6 B) · ป้ายต่อท้ายด้วย period ที่ประกาศ
  netIncomeFy: { label: (v) => `กำไรสุทธิ ${fyOf(v).period}`, value: (v) => stmt(v, needFy(v, 'netIncome')), d: () => 'ทั้งปีบัญชี', cls: '' },
  epsFy: { label: (v) => `EPS ${fyOf(v).period}`, value: (v) => '~' + money(v, needFy(v, 'eps')), d: () => 'ทั้งปีบัญชี', cls: '' },
  revenueFy: { label: (v) => `รายได้ ${fyOf(v).period}`, cls: 'neu', value: (v) => stmt(v, needFy(v, 'revenue')), d: () => 'ทั้งปีบัญชี' },
  // Plan 2a Task 8 — KPI ธนาคาร (§3.6 K)
  nim: { label: () => 'NIM', value: (v) => needBank(v, 'nim').toFixed(2) + '%', d: () => 'ส่วนต่างอัตราดอกเบี้ยสุทธิ', cls: '' },
  npl: { label: () => 'NPL / Coverage', value: (v) => `${needBank(v, 'npl').toFixed(1)}% / ${needBank(v, 'coverage').toFixed(0)}%`, d: () => 'หนี้เสีย / สำรองต่อหนี้เสีย', cls: '' },
  capital: { label: () => 'CET1 / CAR', cls: 'pos', value: (v) => `~${needBank(v, 'cet1').toFixed(1)}% / ${needBank(v, 'car').toFixed(1)}%`, d: () => 'เงินกองทุนชั้นที่ 1 / เงินกองทุนรวม' },
```

Also switch the existing statement-total cards to `stmt` (same output for positive values, correct sign for negatives): `netIncome`, `revenue`, `fcf` and `netDebt` use `stmt(v, need(v, '<k>'))` in `value`, and the `ps` card's `.d` uses `` `รายได้ TTM ${stmt(v, need(v, 'revenue'))}` ``.

- [ ] **Step 5: BBL fixture — every custom card has a catalogue slot now (BBL G2/G5)**

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/BBL-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
if(d.metrics.custom.map(c=>c.label).join("|")!=="กำไรสุทธิ FY2025|NIM|NPL / Coverage|CET1 / CAR")throw new Error("BBL custom drifted");
if(d.metrics.notes.eps!=="EPS FY2025 ~฿24.1")throw new Error("BBL eps note drifted");
d.fundamentals.fy={period:"FY2025",netIncome:46007e6,eps:24.1};
d.fundamentals.bank={nim:2.49,npl:3.0,coverage:324,cet1:16.4,car:20.9};
const N=d.metrics.notes; delete N.eps;
N.netIncomeFy="▲ +1.8% YoY"; N.epsFy="TTM ~฿22.0";
N.nim="Q1/26 (FY25 2.72%) บีบจากดอกเบี้ยลง"; N.npl="สำรองหนาแบบอนุรักษ์นิยม"; N.capital="เงินกองทุนแกร่งสุดในกลุ่ม";
d.metrics.custom=[];
d.metrics.cards=["mcap","pe","peAvg5y",{key:"pbv",tone:"pos"},"netIncomeFy","epsFy","bvps","roe","nim","npl","capital","yield"];
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

Add to `test/v3/real-fixtures.test.js`:

```js
t.eq(load('BBL-real').metrics.custom.length, 0, 'Task 8: BBL-real needs no custom card (FY + bank are catalogue keys)');
```

- [ ] **Step 6: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`. `BBL-real`'s v2 gate on render is 0/0 with 12 catalogue cards, and its FV is still 176.77.

- [ ] **Step 7: Commit**

```bash
git add tools/v3/schema.js tools/v3/cards.js test/v3/schema.test.js test/v3/cards.test.js test/v3/real-fixtures.test.js test/fixtures/v3/BBL-real.json
git commit -m "feat(v3): FY cards (fundamentals.fy) + bank KPI cards (fundamentals.bank) (§3.6 B/K)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---
### Task 9: REIT — `ffoBasis`, `ffoForward`, P/FFO cards + `{{pffo}}` token, driver-agnostic §6 hint (§3.6 J)

**Files:**
- Modify: `tools/v3/schema.js` (`ENUM.ffoBasis`, `FUND_NUM`/`FUND_KEYS`, `ffoForward` block, `CARD_KEYS`)
- Modify: `tools/v3/cards.js` (`fq`, `ffoL`, `pffoCalc`, `pffoForwardCalc`, six REIT cards, exports)
- Modify: `tools/v3/tokens.js` (`pffo`, `pffoForward`)
- Modify: `tools/v3/prose.js` (`priceBound` adds pffo/pffoForward)
- Modify: `_template/v3/render.js` (`ffoLabel`, driver/exit/method labels, §6 hint)
- Modify: `test/v3/schema.test.js`, `test/v3/cards.test.js`, `test/v3/prose.test.js`, `test/v3/render.test.js`, `test/v3/real-fixtures.test.js`
- Modify: `test/fixtures/v3/EQIX-real.json` (4 REIT custom cards → catalogue)

**Interfaces:**
- `fundamentals.ffoBasis?: 'ffo'|'affo'` (default label `FFO`).
- `fundamentals.ffoForward?: { value > 0, period ≤20, low?, high? }` (low ≤ value ≤ high).
- `fundamentals.pffoAvg5y?: number`.
- Cards: `pffo` (price-bound, `P/<L> (TTM)`), `pffoForward` (`Forward P/<L>`), `ffoPerShare`, `pffoAvg5y` (`P/<L> มัธยฐาน ~5 ปี`), `ffoMargin`, `ffoPayout`. `<L>` is `FFO` or `AFFO`.
- Produces: `K.pffoCalc(view)` / `K.pffoForwardCalc(view) → { raw, text }` (the single owner of the number and its text, as `peForwardCalc` is).
- Tokens: `{{pffo}}` and `{{pffoForward}}` render like `{{pe}}`/`{{pbv}}`, without the `x`: `"27.6"`. They have no v2 twin, so they render as literals in the v2-shaped source. That is fine because v3 pages are rebuilt from JSON on every build.
- `stock-meta.pe` stays price ÷ EPS (§13 item 5). A REIT shows P/FFO through the card/token only.
- Produces: `cards.js` `fq(view) = view.fq || view.doc.fundamentals` (quote-currency fundamentals; Task 10 fills `view.fq`).

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js`:

```js
// Plan 2a Task 9 — REIT (§3.6 J)
{ const d = base(); Object.assign(d.fundamentals, { ffoPerShare: 3.1, ffoBasis: 'affo', ffoForward: { value: 3.4, period: 'FY2026E', low: 3.3, high: 3.5 }, pffoAvg5y: 30 });
  d.metrics.cards.push('pffo', 'pffoForward', 'ffoPerShare', 'pffoAvg5y'); t.eq(S.validate(d), [], 'REIT fields + cards valid'); }
{ const d = base(); d.fundamentals.ffoBasis = 'core'; t(paths(S.validate(d)).includes('fundamentals.ffoBasis'), 'ffoBasis enum'); }
{ const d = base(); d.fundamentals.ffoForward = { value: 3.4, period: 'FY2026E', low: 3.5, high: 3.6 }; t(paths(S.validate(d)).includes('fundamentals.ffoForward'), 'low ≤ value ≤ high'); }
{ const d = base(); d.fundamentals.ffoForward = { value: 3.4 }; t(paths(S.validate(d)).includes('fundamentals.ffoForward.period'), 'ffoForward needs period'); }
```

`test/v3/cards.test.js`:

```js
// Plan 2a Task 9 — การ์ด REIT
{ const d = load(); Object.assign(d.fundamentals, { ffoPerShare: 3.1, ffoBasis: 'affo', ffoForward: { value: 3.4, period: 'FY2026E', low: 3.3, high: 3.5 }, pffoAvg5y: 30 });
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } }); const c = (k) => K.renderCard(k, v2);
  t.eq([c('pffo').k, c('pffo').v, c('pffo').d], ['P/AFFO (TTM)', (120 / 3.1).toFixed(1) + 'x', 'AFFO/หุ้น $3.10'], 'pffo card');
  t.eq([c('pffoForward').k, c('pffoForward').v, c('pffoForward').d], ['Forward P/AFFO', (120 / 3.4).toFixed(1) + 'x', 'AFFO FY2026E $3.30–$3.50'], 'pffoForward card shows the guidance range');
  t.eq([c('ffoPerShare').k, c('ffoPerShare').v], ['AFFO/หุ้น (TTM)', '$3.10'], 'ffoPerShare card');
  t.eq([c('pffoAvg5y').k, c('pffoAvg5y').v], ['P/AFFO มัธยฐาน ~5 ปี', '30.0x'], 'pffoAvg5y card');
  t.eq(c('ffoMargin').v, (3.1 * 443e6 / 9.4e9 * 100).toFixed(1) + '%', 'ffoMargin = FFO×shares / revenue');
  t.eq(c('ffoPayout').v, (2 / 3.1 * 100).toFixed(1) + '%', 'ffoPayout = dps / FFO per share');
  t.eq(v2.sm.pe, +(120 / 6.13).toFixed(6), '§13.5: stock-meta.pe stays price / EPS for a REIT'); }
{ const d = load(); d.fundamentals.ffoPerShare = 3.1; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('pffo', v2).k, 'P/FFO (TTM)', 'no ffoBasis → FFO label (Plan 1 wording)'); }
```

`test/v3/prose.test.js`:

```js
// Plan 2a Task 9 — {{pffo}} token + rule B จับ P/FFO ที่ก๊อปมา
{ const d = load(); d.fundamentals.ffoPerShare = 3.1; const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(P.renderProse('P/FFO {{pffo}}x', v2, { mode: 'v2src' }), `P/FFO ${(120 / 3.1).toFixed(1)}x`, '{{pffo}} renders like {{pe}} (no x)');
  d.prose.chart = `P/FFO ${K.pffoCalc(v2).text} ตอนนี้`;
  t(P.checkRuleB(d, v2).errors.some((e) => e.token === 'pffo'), 'exact copy of P/FFO is a rule-B error'); }
```

`test/v3/render.test.js`:

```js
// Plan 2a Task 9 — ป้าย AFFO ทุกที่ + hint §6 ของ driver ทุกชนิด
{ const doc = load('ZTS'); Object.assign(doc.fundamentals, { ffoPerShare: 3.1, ffoBasis: 'affo' });
  doc.legs[1] = { method: 'pffo', label: 'P/AFFO', inputs: { multiple: 17, multipleSource: 'median5y' } };
  doc.scenarios.driver = 'ffo'; doc.scenarios.exitMetric = 'pffo';
  const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('P/AFFO 17x (มัธยฐาน 5 ปี)'), 'pffo mdesc says P/AFFO');
  t(src.includes('<li><span>AFFO ปี ') && src.includes('<li><span>P/AFFO ออก</span>'), 'scenario rows say AFFO / P/AFFO');
  t(src.includes(' • AFFO ฐาน ~$3.10'), '§6 hint shows the non-EPS driver base');
  t.eq(CR.checkHtml(expandReport(src), 'ZTS.html', { source: src }).errors.map((e) => e.id), [], 'REIT labels: v2 gate 0 errors'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `fundamentals.ffoBasis: คีย์ไม่อยู่ในสคีมา v3`, `ไม่รู้จักการ์ด pffo`, `token {{pffo}} ไม่รู้จัก`, and render label mismatches (`FFO +`, `P/FFO ออก`).

- [ ] **Step 3: Implement the schema**

Add `ffoBasis: ['ffo', 'affo'],` to `ENUM`. Append `'pffoAvg5y'` to `FUND_NUM`, and `'ffoBasis', 'ffoForward'` to `FUND_KEYS`. Append `'pffo', 'pffoForward', 'ffoPerShare', 'pffoAvg5y', 'ffoMargin', 'ffoPayout'` to `CARD_KEYS`. In the fundamentals block add:

```js
    if (f.ffoBasis != null) en(f.ffoBasis, 'fundamentals.ffoBasis', ENUM.ffoBasis);
    if (f.ffoForward != null) {
      const x = f.ffoForward, p = 'fundamentals.ffoForward';
      if (!isObj(x)) E(p, 'ต้องเป็น {value, period, low?, high?}');
      else {
        closed(x, p, ['value', 'period', 'low', 'high']);
        num(x.value, `${p}.value`, { gt: 0 }); str(x.period, `${p}.period`);
        if (typeof x.period === 'string' && x.period.length > 20) E(`${p}.period`, 'ยาวเกิน 20 ตัวอักษร');
        for (const k of ['low', 'high']) if (x[k] != null) num(x[k], `${p}.${k}`, { gt: 0 });
        if (isNum(x.value) && ((isNum(x.low) && x.low > x.value) || (isNum(x.high) && x.high < x.value))) E(p, 'ต้อง low ≤ value ≤ high');
      }
    }
```

- [ ] **Step 4: Implement the catalogue + tokens + rule B**

`tools/v3/cards.js` — add below `needBank`:

```js
// fundamentals ในสกุลราคา (Task 10 เติม view.fq เมื่อมี reportCurrency) — ใช้กับอัตราส่วนที่หารด้วยราคา
const fq = (view) => view.fq || view.doc.fundamentals;
const ffoL = (view) => ({ ffo: 'FFO', affo: 'AFFO' }[f(view).ffoBasis || 'ffo']);
function ffoFwd(view) { const x = f(view).ffoForward; if (!x) throw new Error('metrics.cards: การ์ดต้องใช้ fundamentals.ffoForward — เติม หรือถอดการ์ดออก'); return x; }
// เจ้าของเดียวของเลข+ข้อความ P/FFO (การ์ด + token + prose.priceBound — เหมือน peForwardCalc)
function pffoCalc(view) {
  const b = need(view, 'ffoPerShare');
  if (!(b > 0)) throw new Error('metrics.cards: pffo — FFO/หุ้น ≤ 0 ถอดการ์ดออก');
  const raw = view.d.px / b; return { raw, text: raw.toFixed(1) + 'x' };
}
function pffoForwardCalc(view) { const raw = view.d.px / ffoFwd(view).value; return { raw, text: raw.toFixed(1) + 'x' }; }
```

Add to `CATALOGUE`:

```js
  // Plan 2a Task 9 — REIT (§3.6 J) · ป้าย FFO/AFFO ตาม fundamentals.ffoBasis
  pffo: { label: (v) => `P/${ffoL(v)} (TTM)`, cls: 'neu', value: (v) => pffoCalc(v).text, d: (v) => `${ffoL(v)}/หุ้น ${money(v, need(v, 'ffoPerShare'))}` },
  pffoForward: { label: (v) => `Forward P/${ffoL(v)}`, cls: 'neu', value: (v) => pffoForwardCalc(v).text,
    d: (v) => { const x = ffoFwd(v); return `${ffoL(v)} ${x.period} ` + (isNum(x.low) && isNum(x.high) ? `${money(v, x.low)}–${money(v, x.high)}` : money(v, x.value)); } },
  ffoPerShare: { label: (v) => `${ffoL(v)}/หุ้น (TTM)`, value: (v) => money(v, need(v, 'ffoPerShare')), d: () => 'ต่อหุ้น รอบ 12 เดือนล่าสุด', cls: '' },
  pffoAvg5y: { label: (v) => `P/${ffoL(v)} มัธยฐาน ~5 ปี`, value: (v) => need(v, 'pffoAvg5y').toFixed(1) + 'x', d: () => 'มัธยฐานย้อนหลัง', cls: '' },
  ffoMargin: { label: (v) => `${ffoL(v)} Margin`, cls: '',
    value: (v) => { const rev = fq(v).revenue; if (!(isNum(rev) && rev > 0)) throw new Error('metrics.cards: ffoMargin — ต้องมี fundamentals.revenue > 0'); return pct1(need(v, 'ffoPerShare') * need(v, 'shares') / rev * 100); },
    d: (v) => `${ffoL(v)} รวม ÷ รายได้ TTM` },
  ffoPayout: { label: (v) => `${ffoL(v)} Payout`, cls: '', value: (v) => pct1(need(v, 'dps') / need(v, 'ffoPerShare') * 100), d: (v) => `ปันผล ÷ ${ffoL(v)}/หุ้น` },
```

Export: `module.exports = { CATALOGUE, renderCard, peForwardCalc, evEbitdaCalc, pffoCalc, pffoForwardCalc };`.

`tools/v3/tokens.js` — add after the `range52w` tokens (a lazy `require` keeps the load order simple):

```js
// Plan 2a Task 9 — P/FFO (ไม่มีคู่ v2 · รูปแบบเดียวกับ {{pe}}/{{pbv}} = ไม่มี x ต่อท้าย) — เลขมาจาก cards.js ตัวเดียวกับการ์ด
TOKENS_V3.pffo = (view) => require('./cards.js').pffoCalc(view).raw.toFixed(1);
TOKENS_V3.pffoForward = (view) => require('./cards.js').pffoForwardCalc(view).raw.toFixed(1);
```

`tools/v3/prose.js` — in `priceBound`, after the `evEbitda` line:

```js
  try { const c = K.pffoCalc(view); add('pffo', 'mult', c.raw, c.text); } catch (e) { /* no ffoPerShare → no bound */ }
  try { const c = K.pffoForwardCalc(view); add('pffoForward', 'mult', c.raw, c.text); } catch (e) { /* no ffoForward → no bound */ }
```

- [ ] **Step 5: Implement the render labels**

Add at module level in `_template/v3/render.js`:

```js
const ffoLabel = (doc) => ({ ffo: 'FFO', affo: 'AFFO' }[doc.fundamentals.ffoBasis || 'ffo']);
```

In `mdesc`, change the `default:` return to:

```js
    default: return `${leg.method === 'pffo' ? `P/${ffoLabel(view.doc)}` : METHOD_NAME[leg.method]} ${i.multiple}x${src}${rng}`;
```

In `toV2Source`, replace the `drv`/`ex` lines with:

```js
  const FFO = ffoLabel(doc);
  const drv = { eps: 'EPS', ffo: FFO, revenuePerShare: 'รายได้/หุ้น', bvps: 'BVPS', fcfPerShare: 'FCF/หุ้น' }[s.driver];
  const ex = { pe: 'P/E', ps: 'P/S', pbv: 'P/BV', pffo: `P/${FFO}`, pfcf: 'P/FCF' }[s.exitMetric];
```

Change the §6 hint from `${s.driver === 'eps' ? ' • EPS ฐาน ~{{rd:baseEps}}' : ''}` to:

```js
${s.driver === 'eps' ? ' • EPS ฐาน ~{{rd:baseEps}}' : ` • ${drv} ฐาน ~${esc(view.cur + RV.fmtPrice(view.scn[0].driverStart))}`}
```

- [ ] **Step 6: EQIX fixture — REIT cards stop being custom literals (EQIX gaps 3–5, 8)**

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/EQIX-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
if(d.metrics.custom.map(c=>c.label).join("|")!=="P/AFFO (TTM)|P/AFFO เฉลี่ย ~5 ปี|AFFO/Share FY2026E|AFFO Margin")throw new Error("EQIX custom drifted");
Object.assign(d.fundamentals,{ffoBasis:"affo",ffoForward:{value:42.99,period:"FY2026E",low:42.69,high:43.29},pffoAvg5y:27});
Object.assign(d.metrics.notes,{pffo:"งวด 2025 — มาตรวัดหลัก REIT",pffoAvg5y:"ช่วง 22–35x ขึ้นกับ sentiment",
 pffoForward:"+11–13% YoY (ปรับเพิ่มหลัง Q2 2026) — ตัวชี้วัดกำไรจริงของ REIT",ffoMargin:"ขยับขึ้นตาม Adjusted EBITDA margin สถิติ 53% (Q2 2026)"});
d.metrics.custom=[];
d.metrics.cards=["mcap","pffo","pffoAvg5y","pbv","pffoForward","eps","bvps","roe","revenue","ffoMargin","yield","beta"];
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

Add to `test/v3/real-fixtures.test.js`:

```js
// Task 9 — EQIX: การ์ด REIT จากแคตตาล็อก (P/AFFO สด 27.6x แทน literal ค้าง ~26.6x) · stock-meta.pe = ราคา/EPS (§13.5)
{ const d = load('EQIX-real'), v = C.compute(d, { seeds: {} });
  t.eq(d.metrics.custom.length, 0, 'EQIX-real: no custom cards');
  t.eq(require('../../tools/v3/cards.js').renderCard('pffo', v).v, (d.market.px / 38.33).toFixed(1) + 'x', 'EQIX-real: live P/AFFO card');
  t.eq(v.sm.pe, +(d.market.px / 15.55).toFixed(6), 'EQIX-real: stock-meta.pe = px / GAAP EPS (§13.5)'); }
```

- [ ] **Step 7: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`. EQIX's §6 reads "AFFO +5%/ปี … P/AFFO ออก" with hint "AFFO ฐาน ~$42.99". Its v2 gate on render is 0/0 and its FV is 1253.33.

- [ ] **Step 8: Commit**

```bash
git add tools/v3/schema.js tools/v3/cards.js tools/v3/tokens.js tools/v3/prose.js _template/v3/render.js test/v3/schema.test.js test/v3/cards.test.js test/v3/prose.test.js test/v3/render.test.js test/v3/real-fixtures.test.js test/fixtures/v3/EQIX-real.json
git commit -m "feat(v3): REIT — ffoBasis/ffoForward, P/FFO cards + {{pffo}} token, AFFO labels, §6 hint for every driver (§3.6 J)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 10: Statement currency ≠ quote currency — `reportCurrency` + `fx` (§3.6 L)

**Files:**
- Modify: `tools/v3/schema.js` (`ENUM.reportCurrency`, `FUND_NUM`/`FUND_KEYS`, currency rules)
- Modify: `tools/v3/compute.js` (`STMT_SYMBOL`, `toQuote`, legs/driver/bridge use `fq`, view gains `fq`/`fx`/`stmtCur`)
- Modify: `tools/v3/cards.js` (`stmt()` uses `view.stmtCur`; `evEbitdaCalc` uses `fq`)
- Modify: `test/v3/schema.test.js`, `test/v3/compute.test.js`, `test/v3/cards.test.js`, `test/v3/real-fixtures.test.js`
- Modify: `test/fixtures/v3/FER-real.json` (EUR totals + FY card; 3 of 4 custom cards → catalogue)

**Interfaces:**
- `fundamentals.reportCurrency?: 'USD'|'THB'|'EUR'|'CAD'|'GBP'|'JPY'|'CHF'|'TWD'`.
- `fundamentals.fx?: number > 0`: the price of 1 unit of `reportCurrency` in `doc.currency`. It is required when `reportCurrency ≠ currency`, and forbidden otherwise (unless it equals 1 with `reportCurrency === currency`).
- Produces: `C.toQuote(obj, fx) → obj`. It multiplies `revenue netIncome fcf ebitda netDebt` by `fx`, and returns the same object when `fx === 1` (byte-identical legacy path).
- Produces: view gains:
  - `fq`: fundamentals in quote currency. Legs, scenario drivers, the v2 bridge `values.revenue` and price-bound ratios all read `fq`.
  - `fx` (1 when not foreign).
  - `stmtCur`: statement symbol, `€`, `C$`, … else `view.cur`.
- Leg `override` totals are statement currency too, and are converted the same way.

- [ ] **Step 1: Write the failing tests**

`test/v3/schema.test.js`:

```js
// Plan 2a Task 10 — reportCurrency / fx (§3.6 L · Review Focus #4)
{ const d = base(); d.fundamentals.reportCurrency = 'EUR'; d.fundamentals.fx = 1.15566; t.eq(S.validate(d), [], 'EUR statements + fx valid'); }
{ const d = base(); d.fundamentals.reportCurrency = 'EUR'; t(paths(S.validate(d)).includes('fundamentals.fx'), 'foreign statements need fx'); }
{ const d = base(); d.fundamentals.fx = 1.2; t(paths(S.validate(d)).includes('fundamentals.fx'), 'fx without reportCurrency → error'); }
{ const d = base(); d.fundamentals.reportCurrency = 'USD'; d.fundamentals.fx = 1.2; t(paths(S.validate(d)).includes('fundamentals.fx'), 'same currency with fx ≠ 1 → error'); }
{ const d = base(); d.fundamentals.reportCurrency = 'XYZ'; d.fundamentals.fx = 1.2; t(paths(S.validate(d)).includes('fundamentals.reportCurrency'), 'reportCurrency enum'); }
```

`test/v3/compute.test.js`:

```js
// Plan 2a Task 10 — ยอดงบสกุลอื่นแปลงเป็นสกุลราคาก่อนเข้าสูตรทุกตัว
{ const base0 = C.compute(load('ZTS'), { seeds });
  t(base0.fq === base0.doc.fundamentals && base0.fx === 1 && base0.stmtCur === '$', 'no reportCurrency → fq is the same object (legacy path)');
  const d = load('ZTS'); d.fundamentals.reportCurrency = 'EUR'; d.fundamentals.fx = 1.2; const v = C.compute(d, { seeds });
  t.eq([v.fq.revenue, v.fq.fcf, v.fq.netDebt], [9.4e9 * 1.2, 2.3e9 * 1.2, 5.1e9 * 1.2], 'totals converted into quote currency');
  t.eq(v.fq.eps, 6.13, 'per-share values untouched');
  t.near(v.d.ps, 120 * 443e6 / (9.4e9 * 1.2), 1e-9, 'P/S divides quote money by quote money');
  t.eq(v.stmtCur, '€', 'statement symbol'); }
{ const d = load('ZTS'); d.fundamentals.reportCurrency = 'EUR'; d.fundamentals.fx = 1.2;
  d.legs[1].override = { fcf: 2.0e9, why: 'normalised FCF (EUR)' }; const v = C.compute(d, { seeds });
  const d1 = load('ZTS'); d1.legs[1].override = { fcf: 2.4e9, netDebt: 6.12e9, why: 'same in USD' }; d1.fundamentals.netDebt = 6.12e9; d1.fundamentals.fcf = 2.76e9; d1.fundamentals.revenue = 11.28e9;
  t.near(v.legs[1].value, C.compute(d1, { seeds }).legs[1].value, 1e-6, 'override totals are statement currency and get converted too'); }
```

`test/v3/cards.test.js`:

```js
// Plan 2a Task 10 — การ์ดยอดงบแสดงสกุลงบ · อัตราส่วนผูกราคาใช้สกุลราคา
{ const d = load(); Object.assign(d.fundamentals, { reportCurrency: 'EUR', fx: 1.2, netDebt: -1.307e9, ebitda: 3e9 });
  const v2 = C.compute(d, { seeds: { ZTS: '#e8731a' } });
  t.eq(K.renderCard('revenue', v2).v, '€9.40B', 'revenue card in EUR');
  t.eq(K.renderCard('netDebt', v2).v, '−€1.31B', 'Review Focus #4: negative total → U+2212, statement symbol');
  t.eq(K.renderCard('evEbitda', v2).v, ((v2.d.mcap - 1.307e9 * 1.2) / (3e9 * 1.2)).toFixed(1) + 'x', 'EV/EBITDA converts netDebt and EBITDA with fx'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `fundamentals.reportCurrency: คีย์ไม่อยู่ในสคีมา v3`, and `base0.fq` undefined.

- [ ] **Step 3: Implement the schema**

Add `reportCurrency: ['USD', 'THB', 'EUR', 'CAD', 'GBP', 'JPY', 'CHF', 'TWD'],` to `ENUM`. Append `'fx'` to `FUND_NUM` and `'reportCurrency'` to `FUND_KEYS`. In the fundamentals block add:

```js
    // §3.6 L — สกุลงบ ≠ สกุลราคา: ยอดรวมทั้งบริษัทเป็นสกุลงบ · ต่อหุ้นเป็นสกุลราคา · fx = ราคา 1 หน่วยสกุลงบเป็นสกุลราคา
    if (f.reportCurrency != null) en(f.reportCurrency, 'fundamentals.reportCurrency', ENUM.reportCurrency);
    if (f.fx != null && isNum(f.fx) && !(f.fx > 0)) E('fundamentals.fx', 'ต้อง > 0');
    if (f.reportCurrency == null && f.fx != null) E('fundamentals.fx', 'มี fx ได้เฉพาะเมื่อประกาศ reportCurrency');
    else if (f.reportCurrency != null && f.reportCurrency !== doc.currency && f.fx == null) E('fundamentals.fx', `งบสกุล ${f.reportCurrency} ≠ สกุลราคา ${doc.currency} — ต้องมี fx (ราคา 1 ${f.reportCurrency} เป็น ${doc.currency})`);
    else if (f.reportCurrency === doc.currency && f.fx != null && f.fx !== 1) E('fundamentals.fx', 'สกุลงบ = สกุลราคา — fx ต้องไม่มี (หรือ = 1)');
```

- [ ] **Step 4: Implement compute**

Add near the top of `tools/v3/compute.js`:

```js
const STMT_SYMBOL = { USD: '$', THB: '฿', EUR: '€', CAD: 'C$', GBP: '£', JPY: '¥', CHF: 'CHF ', TWD: 'NT$' };
const TOTALS = ['revenue', 'netIncome', 'fcf', 'ebitda', 'netDebt'];
// ยอดรวมทั้งบริษัท (สกุลงบ) → สกุลราคา · fx = 1 คืน object เดิม (ทางเดิมทุก byte)
function toQuote(obj, fx) {
  if (fx === 1 || !obj) return obj;
  const q = { ...obj };
  for (const k of TOTALS) if (typeof q[k] === 'number') q[k] = obj[k] * fx;
  return q;
}
```

Change `driverStart(doc)` to `driverStart(doc, f)` and delete its first-line `const s = doc.scenarios, f = doc.fundamentals;` in favour of `const s = doc.scenarios;` (the caller passes `fq`). In `compute`, right after `const f = doc.fundamentals, mk = doc.market, s = doc.scenarios;` add:

```js
  const fx = f.reportCurrency && f.reportCurrency !== doc.currency ? f.fx : 1;
  const fq = toQuote(f, fx);
```

Then:
- in the legs map: `const legQ = fx === 1 ? leg : { ...leg, override: toQuote(leg.override, fx) };`, and use `legQ` + `fq` in both `L.legValue(...)` calls (`L.legValue(legQ, fq, …)` and `L.legValue({ ...legQ, inputs: { ...leg.inputs, multiple: m } }, fq, …)`);
- `const start = driverStart(doc, fq);`;
- the bridge: `if (fq.revenue != null && fq.revenue > 0) values.revenue = fq.revenue;`;
- the return object gains `fq, fx, stmtCur: STMT_SYMBOL[f.reportCurrency] || cur`. Move `const cur = RV.CUR_SYMBOL[doc.currency];` above the `return` if needed; it already is.

Export: `module.exports = { compute, weightsOf, toQuote, SCN_NAMES };`.

- [ ] **Step 5: Implement cards**

In `tools/v3/cards.js`:
- `stmt` becomes `const stmt = (view, v) => { const s = view.stmtCur || view.cur; return v < 0 ? '−' + RV.fmtBig(-v, s) : RV.fmtBig(v, s); };`.
- Move the `fq` helper above `evEbitdaCalc`, and replace `evEbitdaCalc` with:

```js
function evEbitdaCalc(view) {
  const q = fq(view);
  if (!isNum(q.netDebt)) throw new Error('metrics.cards: การ์ดต้องใช้ fundamentals.netDebt — เติมค่า หรือถอดการ์ดออก');
  if (!isNum(q.ebitda)) throw new Error('metrics.cards: การ์ดต้องใช้ fundamentals.ebitda — เติมค่า หรือถอดการ์ดออก');
  const ev = priceBoundOrThrow('mcap', view.d.mcap) + q.netDebt;
  if (!(q.ebitda > 0)) throw new Error('metrics.cards: evEbitda — EBITDA ≤ 0 ถอดการ์ดออก');
  const raw = ev / q.ebitda;
  return { raw, text: raw.toFixed(1) + 'x' };
}
```

- The `evEbitda` card `.d` becomes `` d: (v) => `EV ${big(v, priceBoundOrThrow('mcap', v.d.mcap) + fq(v).netDebt)} ÷ EBITDA ${big(v, fq(v).ebitda)}` `` (both in quote currency, like the ratio).

- [ ] **Step 6: FER fixture — EUR statement figures become catalogue cards (FER gaps 4, 7)**

`+€1,307M` is the *parent-level* net cash (ex-infrastructure), not consolidated net debt (consolidated debt is €20,981M). It stays the one custom card: putting it in `netDebt` would give the field a different meaning.

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/FER-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
if(d.metrics.custom.map(c=>c.label).join("|")!=="กำไรสุทธิ FY2025|FCF (TTM)|รายได้ TTM|เงินสดสุทธิ ex-infra")throw new Error("FER custom drifted");
Object.assign(d.fundamentals,{reportCurrency:"EUR",fx:1.15566,revenue:9859e6,netIncome:606e6,fcf:1880e6,fy:{period:"FY2025",netIncome:888e6}});
Object.assign(d.metrics.notes,{netIncomeFy:"−72.6% YoY (FY2024 มีกำไรพิเศษขาย Heathrow)",fcf:"สูงกว่ากำไรสุทธิ €606M ~3 เท่า",revenue:"+2.4% YoY • FY2025 €9,627M (+5.2%)"});
d.metrics.custom=[d.metrics.custom[3]];
d.metrics.cards=["mcap","pe","peForward","pbv","netIncomeFy","eps","revenue","roe","fcf","grossMargin","yield","custom:0"];
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

Add to `test/v3/real-fixtures.test.js`:

```js
// Task 10 — FER: ตัวเลขงบ EUR อยู่ในการ์ดแคตตาล็อก (สกุล €) · custom เหลือ 1
{ const d = load('FER-real'), v = C.compute(d, { seeds: {} }), K = require('../../tools/v3/cards.js');
  t.eq([K.renderCard('revenue', v).v, K.renderCard('fcf', v).v, K.renderCard('netIncomeFy', v).v], ['€9.86B', '€1.88B', '€888M'], 'FER-real: statement cards in EUR');
  t.eq(d.metrics.custom.length, 1, 'FER-real: one custom card left (parent net cash)'); }
```

- [ ] **Step 7: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`, including `tokens-corpus` (the legacy path is untouched when `reportCurrency` is absent). FER's FV is 53.42: no leg uses totals.

- [ ] **Step 8: Commit**

```bash
git add tools/v3/schema.js tools/v3/compute.js tools/v3/cards.js test/v3/schema.test.js test/v3/compute.test.js test/v3/cards.test.js test/v3/real-fixtures.test.js test/fixtures/v3/FER-real.json
git commit -m "feat(v3): reportCurrency + fx — statement totals in their own currency, ratios in the quote currency (§3.6 L)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 11: Extras — total/note rows, column formats, FX row + the E52 SOTP tie-out (§3.6 M)

**Files:**
- Create: `tools/v3/extras.js`, `test/v3/extras.test.js`
- Modify: `tools/v3/schema.js` (`ENUM.colUnit`, the extras block)
- Modify: `tools/v3/prose.js` (`proseFields` reads total cells / note rows)
- Modify: `_template/v3/render.js` (`extrasHtml`)
- Modify: `test/v3/schema.test.js`, `test/v3/render.test.js`, `test/v3/real-fixtures.test.js`
- Modify: `test/fixtures/v3/FER-real.json` (SOTP table: numeric columns, total row, FX row; note and leg 1 stop repeating them)

**Interfaces:**
- `extras[i].rows[j]` is one of `[cell…]` | `{ kind: 'total', cells: [cell…] }` (≤1 per table) | `{ kind: 'note', text }` (a full-width row).
- `extras[i].columns?`: `[{ dp: 0–4, unit: 'none'|'pct'|'x'|'ccy', signed?: bool }]`, the same length as `headers`.
- `extras[i].fx?: boolean`. `true` needs `fundamentals.fx` + `sumCol`, and renders a conversion row.
- Produces: `require('./tools/v3/extras.js')`:
  - `fmtCell(n, col|undefined, view) → string`. Always U+2212. Without `col` it keeps `RV.fmtPrice` for non-negatives, byte-identical to Plan 1.
  - `tableTotal(x) → { sum, total, hasTotalRow }`.
  - `tieOut(doc, view) → [{ path, msg }]`. This is **E52**: a declared `sotp`/`nav` leg must reference a summable table; its total row must equal Σ data rows within rounding (`nDataRows × 0.5×10^−dp`); total × (fx if `fx:true`) must be within 1% of the leg value. A declared leg with no table must explain itself in `note`.

- [ ] **Step 1: Write the failing tests**

Create `test/v3/extras.test.js`:

```js
'use strict';
const t = require('./_t.js')('extras');
const X = require('../../tools/v3/extras.js');
const C = require('../../tools/v3/compute.js');
const load = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
const view = { stmtCur: '€', cur: '$' };

t.eq(X.fmtCell(-1.81, undefined, view), '−1.81', 'default: U+2212 (Plan 1 printed "-1.81")');
t.eq(X.fmtCell(1234.5, undefined, view), '1,234.50', 'default positive = RV.fmtPrice (byte-identical)');
t.eq(X.fmtCell(-1300, { dp: 0, unit: 'none' }, view), '−1,300', 'dp 0 + grouping + U+2212');
t.eq(X.fmtCell(1307, { dp: 0, unit: 'none', signed: true }, view), '+1,307', 'signed');
t.eq(X.fmtCell(48.29, { dp: 2, unit: 'pct' }, view), '48.29%', 'pct');
t.eq(X.fmtCell(6.5, { dp: 1, unit: 'x' }, view), '6.5x', 'x');
t.eq(X.fmtCell(-44.83, { dp: 2, unit: 'ccy' }, view), '−€44.83', 'ccy = statement symbol (ruling R9)');

const tbl = { sumCol: 1, rows: [['a', 10], ['b', 20.25], { kind: 'note', text: 'n' }, { kind: 'total', cells: ['รวม', 30] }], columns: [{ dp: 0, unit: 'none' }, { dp: 2, unit: 'none' }] };
t.eq(X.tableTotal(tbl), { sum: 30.25, total: 30, hasTotalRow: true }, 'tableTotal: Σ data rows (note rows ignored) vs the total row');

// E52 on the real SOTP fixture (after this task's fixture edit)
{ const d = load('FER-real'); const v = C.compute(d, { seeds: {} });
  t.eq(X.tieOut(d, v), [], 'FER-real: SOTP €44.83 × 1.15566 ties to leg 1 $51.81 within 1%');
  d.legs[0].inputs.value = 60; t(X.tieOut(d, C.compute(d, { seeds: {} })).some((i) => i.path === 'legs[0].inputs.value'), 'leg value off the table → E52'); }
{ const d = load('FER-real'); d.extras[1].rows.find((r) => r.kind === 'total').cells[4] = 45.5;
  t(X.tieOut(d, C.compute(d, { seeds: {} })).some((i) => i.path === 'extras[1].rows'), 'Review Focus #5: total row ≠ Σ beyond rounding → E52'); }
{ const d = load('FER-real'); delete d.legs[0].inputs.extrasRef;
  t(X.tieOut(d, C.compute(d, { seeds: {} })).some((i) => i.path === 'legs[0].inputs.extrasRef'), 'sotp leg without a table → E52'); }
{ const d = load('ZTS-real'); const i = d.legs.findIndex((l) => l.method === 'declared'); delete d.legs[i].note;
  t(X.tieOut(d, C.compute(d, { seeds: {} })).some((x) => x.path === `legs[${i}].note`), 'declared "other" leg with no table and no reason → E52'); }
t.done();
```

`test/v3/schema.test.js`:

```js
// Plan 2a Task 11 — extras rows/columns/fx (§3.6 M · Review Focus #5)
const xt = () => ({ after: 'valuation', title: 'SOTP', headers: ['ส่วน', 'มูลค่า'], rows: [['A', 1.5], ['B', 2]], sumCol: 1 });
{ const d = base(); d.extras = [{ ...xt(), rows: [['A', 1.5], { kind: 'note', text: 'หมายเหตุ' }, { kind: 'total', cells: ['รวม', 3.5] }], columns: [{ dp: 0, unit: 'none' }, { dp: 2, unit: 'ccy' }] }]; t.eq(S.validate(d), [], 'total/note rows + columns valid'); }
{ const d = base(); d.extras = [{ ...xt(), rows: [['A', 1], { kind: 'total', cells: ['x', 1] }, { kind: 'total', cells: ['y', 1] }] }]; t(paths(S.validate(d)).includes('extras[0].rows'), '≤1 total row'); }
{ const d = base(); d.extras = [{ ...xt(), rows: [{ kind: 'sum', cells: [] }] }]; t(paths(S.validate(d)).includes('extras[0].rows[0]'), 'unknown row kind'); }
{ const d = base(); d.extras = [{ ...xt(), columns: [{ dp: 0, unit: 'none' }] }]; t(paths(S.validate(d)).includes('extras[0].columns'), 'columns length = headers'); }
{ const d = base(); d.extras = [{ ...xt(), columns: [{ dp: 5, unit: 'none' }, { dp: 2, unit: 'eur' }] }]; const ps = paths(S.validate(d));
  t(ps.includes('extras[0].columns[0].dp') && ps.includes('extras[0].columns[1].unit'), 'dp ≤ 4 · unit enum'); }
{ const d = base(); d.extras = [{ ...xt(), sumCol: 0 }]; t(paths(S.validate(d)).includes('extras[0].sumCol'), 'Review Focus #5: sumCol on a text column → error'); }
{ const d = base(); d.extras = [{ ...xt(), fx: true }]; t(paths(S.validate(d)).includes('extras[0].fx'), 'Review Focus #5: fx:true without fundamentals.fx → error'); }
```

`test/v3/render.test.js`:

```js
// Plan 2a Task 11 — ตาราง SOTP ของ FER: แถวรวม + แถวแปลงสกุล + ลบเป็น U+2212
{ const doc = load('FER-real'); const src = R.toV2Source(doc, C.compute(doc, { seeds }));
  t(src.includes('<td><b>รวม SOTP</b></td><td><b></b></td><td><b></b></td><td><b>32,280</b></td><td><b>44.83</b></td>'), 'total row rendered bold with column formats');
  t(src.includes('แปลงเป็น USD ที่ EURUSD 1.15566: <b>$51.81</b>'), 'fx row = total × fundamentals.fx');
  t(src.includes('<td>−1,300</td><td>−1.81</td>') && !/<td>-1/.test(src), 'negative cells use U+2212'); }
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗'`
Expected: `Cannot find module '../../tools/v3/extras.js'`, plus schema errors on the valid total/note case (`extras[0].rows: ต้องเป็น array ของแถว`).

- [ ] **Step 3: Create `tools/v3/extras.js`**

```js
'use strict';
/**
 * extras.js — ตาราง extras[] ของ v3 (spec §3.6 M): format cell ตัวเลข (ลบ = U+2212 เสมอ) · ยอดรวม · E52 SOTP tie-out
 * E52: ขา declared (sotp/nav) ต้องอ้างตารางที่รวมยอดได้ · แถว total = Σ แถวข้อมูลภายใต้การปัด · ยอด × fx ≈ ค่าขา ±1%
 */
const RV = require('../report-values.js');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function group(n, dp) { const [i, d] = Math.abs(n).toFixed(dp).split('.'); return Number(i).toLocaleString('en-US') + (d ? '.' + d : ''); }
function fmtCell(n, col, view) {
  if (!col) return (n < 0 ? '−' : '') + RV.fmtPrice(Math.abs(n));   // ไม่มี columns = ทาง Plan 1 (fmtPrice) แต่ลบใช้ U+2212
  const sign = n < 0 ? '−' : col.signed && n > 0 ? '+' : '';
  const body = group(n, col.dp);
  if (col.unit === 'pct') return sign + body + '%';
  if (col.unit === 'x') return sign + body + 'x';
  if (col.unit === 'ccy') return sign + (view.stmtCur || view.cur) + body;
  return sign + body;
}
const dataRows = (x) => (x.rows || []).filter(Array.isArray);
function tableTotal(x) {
  const sum = dataRows(x).reduce((a, r) => a + r[x.sumCol], 0);
  const t = (x.rows || []).find((r) => r && !Array.isArray(r) && r.kind === 'total');
  return { sum, total: t ? t.cells[x.sumCol] : sum, hasTotalRow: !!t };
}
function tieOut(doc, view) {
  const out = [];
  doc.legs.forEach((leg, i) => {
    if (leg.method !== 'declared') return;
    const p = `legs[${i}]`, inp = leg.inputs;
    if (inp.basis === 'sotp' || inp.basis === 'nav') {
      if (inp.extrasRef == null) { out.push({ path: `${p}.inputs.extrasRef`, msg: `ขา declared (${inp.basis}) ต้องอ้างตาราง extras ที่รวมยอดได้` }); return; }
      const x = doc.extras[inp.extrasRef];
      if (!x || x.sumCol == null) { out.push({ path: `extras[${inp.extrasRef}].sumCol`, msg: 'ตารางที่ขา declared อ้างต้องมี sumCol' }); return; }
      const { sum, total, hasTotalRow } = tableTotal(x);
      const dp = x.columns && x.columns[x.sumCol] ? x.columns[x.sumCol].dp : 2;
      const tol = dataRows(x).length * 0.5 * Math.pow(10, -dp) + 1e-9;
      if (hasTotalRow && Math.abs(total - sum) > tol)
        out.push({ path: `extras[${inp.extrasRef}].rows`, msg: `แถว total ${total} ≠ Σ แถวข้อมูล ${+sum.toFixed(dp)} (เกินการปัด ±${+tol.toFixed(dp + 1)})` });
      const scaled = total * (x.fx ? doc.fundamentals.fx : 1), value = view.legs[i].value;
      if (Math.abs(scaled - value) / value > 0.01)
        out.push({ path: `${p}.inputs.value`, msg: `ยอดตาราง ${+scaled.toFixed(2)}${x.fx ? ` (× fx ${doc.fundamentals.fx})` : ''} ≠ ค่าขา ${value} เกิน 1%` });
    } else if (inp.extrasRef == null && !(typeof leg.note === 'string' && leg.note.trim())) {
      out.push({ path: `${p}.note`, msg: `ขา declared (${inp.basis}) ไม่มีตารางอ้าง ต้องมีเหตุผลใน note` });
    }
  });
  return out;
}
module.exports = { fmtCell, tableTotal, tieOut, isNum };
```

- [ ] **Step 4: Implement the schema**

Add `colUnit: ['none', 'pct', 'x', 'ccy'],` to `ENUM`. Replace the whole `doc.extras.forEach((x, i) => { … })` body with:

```js
  else doc.extras.forEach((x, i) => {
    const p = `extras[${i}]`;
    if (!isObj(x)) return E(p, 'ต้องเป็น object');
    closed(x, p, ['after', 'title', 'headers', 'rows', 'sumCol', 'note', 'columns', 'fx']);
    en(x.after, `${p}.after`, ENUM.extrasAfter); str(x.title, `${p}.title`);
    if (!Array.isArray(x.headers) || !x.headers.every((h) => typeof h === 'string')) E(`${p}.headers`, 'ต้องเป็น array ของข้อความ (ว่างได้ = ตาราง note)');
    const cellOk = (c) => typeof c === 'string' || isNum(c);
    if (!Array.isArray(x.rows)) E(`${p}.rows`, 'ต้องเป็น array ของแถว');
    else {
      x.rows.forEach((r, j) => {
        const rp = `${p}.rows[${j}]`;
        if (Array.isArray(r)) { if (!r.every(cellOk)) E(rp, 'cell = ข้อความหรือตัวเลข'); }
        else if (isObj(r) && r.kind === 'total') { closed(r, rp, ['kind', 'cells']); if (!Array.isArray(r.cells) || !r.cells.every(cellOk)) E(`${rp}.cells`, 'ต้องเป็น array ของ cell'); }
        else if (isObj(r) && r.kind === 'note') { closed(r, rp, ['kind', 'text']); str(r.text, `${rp}.text`); }
        else E(rp, 'แถวต้องเป็น [cell…] · {kind:"total", cells} · {kind:"note", text}');
      });
      if (x.rows.filter((r) => isObj(r) && r.kind === 'total').length > 1) E(`${p}.rows`, 'แถว total ได้ไม่เกิน 1');
    }
    if (x.columns != null) {
      if (!Array.isArray(x.columns) || !Array.isArray(x.headers) || x.columns.length !== x.headers.length) E(`${p}.columns`, 'ต้องเป็น array ยาวเท่า headers');
      else x.columns.forEach((c, k) => {
        const cp = `${p}.columns[${k}]`;
        if (!isObj(c)) return E(cp, 'ต้องเป็น {dp, unit, signed?}');
        closed(c, cp, ['dp', 'unit', 'signed']);
        num(c.dp, `${cp}.dp`, { int: true, min: 0 }); if (isNum(c.dp) && c.dp > 4) E(`${cp}.dp`, 'ต้อง ≤ 4');
        en(c.unit, `${cp}.unit`, ENUM.colUnit);
        if (c.signed != null && typeof c.signed !== 'boolean') E(`${cp}.signed`, 'ต้องเป็น true/false');
      });
    }
    if (x.sumCol != null) {
      num(x.sumCol, `${p}.sumCol`, { int: true, min: 0 });
      const sumOk = (r) => (Array.isArray(r) ? isNum(r[x.sumCol])
        : isObj(r) && r.kind === 'note' ? true
          : isObj(r) && r.kind === 'total' ? Array.isArray(r.cells) && isNum(r.cells[x.sumCol]) : false);
      if (Array.isArray(x.rows) && !x.rows.every(sumOk)) E(`${p}.sumCol`, 'คอลัมน์ผลรวมต้องเป็นตัวเลขทุกแถวข้อมูล (และแถว total)');
    }
    if (x.fx != null) {
      if (typeof x.fx !== 'boolean') E(`${p}.fx`, 'ต้องเป็น true/false');
      else if (x.fx && !(isObj(doc.fundamentals) && isNum(doc.fundamentals.fx))) E(`${p}.fx`, 'fx:true ต้องมี fundamentals.fx');
      else if (x.fx && x.sumCol == null) E(`${p}.fx`, 'แถวแปลงสกุลต้องมี sumCol');
    }
    str(x.note, `${p}.note`, { req: false });
  });
```

(The Plan 1 test `extras[0] with null row returns path-named sumCol error` still passes: a `null` row fails `sumOk`.)

- [ ] **Step 5: `proseFields` + render**

`tools/v3/prose.js` — replace the extras line inside `proseFields` with:

```js
  arr(doc.extras).forEach((x, i) => { add(`extras[${i}].title`, obj(x).title); add(`extras[${i}].note`, obj(x).note);
    arr(obj(x).rows).forEach((r, j) => {
      if (Array.isArray(r)) r.forEach((c, k) => add(`extras[${i}].rows[${j}][${k}]`, c));
      else if (obj(r).kind === 'total') arr(obj(r).cells).forEach((c, k) => add(`extras[${i}].rows[${j}].cells[${k}]`, c));
      else if (obj(r).kind === 'note') add(`extras[${i}].rows[${j}].text`, obj(r).text);
    }); });
```

`_template/v3/render.js` — add `const X = require('../../tools/v3/extras.js');` and replace `extrasHtml` with:

```js
function extrasHtml(doc, view, after) {
  return doc.extras.filter((x) => x.after === after).map((x) => {
    const pr = (s) => P.renderProse(s, view, { mode: 'v2src' });
    const cell = (c, j) => (typeof c === 'number' ? esc(X.fmtCell(c, x.columns && x.columns[j], view)) : pr(c));
    const ncol = Math.max(x.headers.length, ...x.rows.map((r) => (Array.isArray(r) ? r.length : r.kind === 'total' ? r.cells.length : 1)));
    const head = x.headers.length ? `<tr>${x.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : '';
    const row = (r) => (Array.isArray(r) ? `<tr>${r.map((c, j) => `<td>${cell(c, j)}</td>`).join('')}</tr>`
      : r.kind === 'total' ? `<tr>${r.cells.map((c, j) => `<td><b>${cell(c, j)}</b></td>`).join('')}</tr>`
        : `<tr><td colspan="${ncol}">${pr(r.text)}</td></tr>`);
    let rows = x.rows.map(row).join('');
    if (x.fx) {
      const f = doc.fundamentals, tot = X.tableTotal(x).total;
      rows += `<tr><td colspan="${ncol}">แปลงเป็น ${esc(doc.currency)} ที่ ${esc(f.reportCurrency + doc.currency)} ${f.fx}: <b>${esc(view.cur + RV.fmtPrice(tot * f.fx))}</b></td></tr>`;
    }
    const note = x.note ? `<p class="xnote">${pr(x.note)}</p>` : '';
    return `\n  <section>\n    <div class="card"><h3>${esc(x.title)}</h3><table class="xtab">${head}${rows}</table>${note}</div>\n  </section>`;
  }).join('');
}
```

- [ ] **Step 6: FER fixture — the SOTP table carries its own total and FX step (FER gaps 8, 10)**

```bash
node -e '
const fs=require("fs"),p="test/fixtures/v3/FER-real.json",d=JSON.parse(fs.readFileSync(p,"utf8"));
const x=d.extras[1]; if(x.sumCol!==4||x.rows.length!==8||d.legs[0].inputs.extrasRef!==1)throw new Error("FER SOTP drifted");
for(const r of x.rows){ r[3]=Number(String(r[3]).replace(/[,+]/g,"").replace("−","-")); if(!Number.isFinite(r[3]))throw new Error("bad €M cell"); }
x.columns=[{dp:0,unit:"none"},{dp:0,unit:"none"},{dp:0,unit:"none"},{dp:0,unit:"none"},{dp:2,unit:"none"}];
x.rows.push({kind:"total",cells:["รวม SOTP","","",32280,44.83]});
x.fx=true;
const k=x.note.indexOf("<b>สมมติฐานหลักและที่มา:</b>"); if(k<=0||!x.note.startsWith("<b>รวม SOTP:"))throw new Error("SOTP note drifted");
x.note=x.note.slice(k);
const a=" · รวม €32,280M ÷ 720 ล้านหุ้น = €44.83 × EURUSD 1.15566 (ตารางด้านล่าง)"; if(!d.legs[0].note.endsWith(a))throw new Error("leg1 note drifted");
d.legs[0].note=d.legs[0].note.slice(0,-a.length)+" (ดูตาราง SOTP ด้านล่าง)";
fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");'
```

(Σ €M column = 32,280 exactly. Σ €/share = 44.84 vs the stated 44.83 is inside the rounding tolerance 8 × 0.005. The E52 tie-out is 44.83 × 1.15566 = 51.808 vs leg $51.81.)

- [ ] **Step 7: Run to verify it passes**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -E '✗|✓'`
Expected: all `✓`, including the new `extras` file. FER's v2 gate on render stays 0/0 and its FV is 53.42.

- [ ] **Step 8: Commit**

```bash
git add tools/v3/extras.js tools/v3/schema.js tools/v3/prose.js _template/v3/render.js test/v3/extras.test.js test/v3/schema.test.js test/v3/render.test.js test/fixtures/v3/FER-real.json
git commit -m "feat(v3): extras total/note rows, column formats, FX row + E52 SOTP tie-out (§3.6 M)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---
### Task 12: `test/check-v3.js` — the v3 gate (E50/E51/E52/W30/W31 + kept codes) + JSON meta-test + `verify` wiring

**Files:**
- Create: `test/check-v3.js`, `test/v3/check-v3.test.js`
- Modify: `test/fixtures/v3/{BBL,EQIX,FER,ZTS}-real.json` (re-signed through `io.write`; no content change)
- Modify: `package.json` (`check:v3` script; `verify` gains `node test/check-v3.js` right after `node test/check-reports.js`)
- Modify: `tools/gen-docs.js` (`STEP_LABELS` entry)
- Regenerate (via `node tools/gen-docs.js`): `CLAUDE.md`, `README.md`, `docs/quality-gate.md`, `docs/price-refresh.md`, `.githooks/pre-push` (marker blocks only)
- Modify: `README.md` (the new verify-list line's description), `docs/quality-gate.md` (a short "ใบ v3" section)

**Interfaces:**
- Produces: `require('./test/check-v3.js') → { checkDoc(doc, {seeds, today?, skipSig?}) → {errors, warnings, view}, CODES, NATIVE_V2, EXPECT_FIXTURE }`. Each issue is `{ id, label, msg }`. Pass-through v2 issues carry `id: 'v2:<code>'`.
- CLI `node test/check-v3.js [SYM…]`:
  1. checks every `reports/*.json` on the real Thai-time clock, where any error fails;
  2. then sweeps `test/fixtures/v3/*-real.json` with the clock frozen at each fixture's `market.priceDate`, where the error ids must equal `EXPECT_FIXTURE[name] || []`.
  Exit 1 on any mismatch.
- Code inventory (ruling R4):
  - Native: `E50 E51 E52 E17 E27 W07 W09 W18 W25 W30 W31`.
  - Pass-through `v2:*`: every other v2 code on the rendered page (`E28 E32 E34–E40 W08 W12 W13`, structural codes).
  - v2 ids that native codes replace are dropped from the pass-through: `NATIVE_V2 = {E17, E27, W07, W09, W18, W25}`.

- [ ] **Step 1: Sign the real fixtures (E50 is now live on them)**

Tasks 1–11 edited the fixtures by hand-script, so `FER-real`/`ZTS-real` carry stale signatures and `BBL-real`/`EQIX-real` carry none. Only `io.write` signs:

```bash
node -e '
const IO=require("./tools/v3/io.js");
for(const f of ["BBL-real","EQIX-real","FER-real","ZTS-real"]){const p="test/fixtures/v3/"+f+".json";const {_sig,...d}=IO.read(p);IO.write(p,d);}
for(const f of ["BBL-real","EQIX-real","FER-real","ZTS-real"]) if(!IO.verifySig(IO.read("test/fixtures/v3/"+f+".json")))throw new Error(f);
console.log("signed");'
```

Expected: `signed`. From here on, **any** edit to a `-real` fixture must be followed by re-running this one-liner. The meta-test below fails with E50 otherwise, which is the point.

- [ ] **Step 2: Write the failing meta-test `test/v3/check-v3.test.js`**

```js
'use strict';
// meta-test ของ check-v3 (spec §9): mutate JSON → code ที่คู่กันต้องยิง · 1 เคสต่อ code · ฐาน = ใบจริงที่สะอาด
const t = require('./_t.js')('check-v3');
const CV = require('../check-v3.js');
const IO = require('../../tools/v3/io.js');
const P = require('../../tools/v3/prose.js');
const load = (f) => JSON.parse(JSON.stringify(require(`../fixtures/v3/${f}.json`)));
const signed = (d) => ({ ...d, _sig: IO.sign(d) });
const run = (d, o) => CV.checkDoc(d, { seeds: {}, today: d.market.priceDate, ...(o || {}) });
const ids = (r, kind) => r[kind].map((x) => x.id);
const shift = (iso, days) => new Date(Date.parse(iso) + days * 86400e3).toISOString().slice(0, 10);

// ฐาน: ใบจริงที่ผ่าน = 0 error (EQIX = E17 ตาม §13 ข้อ 4 / ruling R3)
for (const f of ['ZTS-real', 'BBL-real', 'FER-real', 'EQIX-real']) {
  const d = load(f);
  t.eq(ids(run(d), 'errors'), CV.EXPECT_FIXTURE[f] || [], `${f}: baseline errors = expected`);
}
const Z = () => load('ZTS-real');
const today0 = Z().market.priceDate;

{ const d = Z(); d.prose.mos += ' (แก้มือ)'; t(ids(run(d), 'errors').includes('E50'), 'E50: hand edit without re-sign'); }
{ const d = Z(); delete d._sig; d.surprise = 1; t(ids(run(signed(d)), 'errors').includes('E51'), 'E51: schema error'); }
{ const d = Z(); delete d._sig; d.meta.themeLegacy = null; t(ids(run(signed(d)), 'errors').includes('E51'), 'E51: compute failure (no brand colour source)'); }
{ const d = Z(); delete d._sig; d.prose.mos += ' <span style="color:red">x</span>'; t(ids(run(signed(d)), 'errors').includes('E51'), 'E51: disallowed tag in prose'); }
{ const d = load('FER-real'); delete d._sig; d.legs[0].inputs.value = 60; t(ids(run(signed(d)), 'errors').includes('E52'), 'E52: SOTP table does not tie to the leg'); }
{ const d = Z(); delete d._sig; d.legs[1].role = 'context'; d.legs[2].role = 'context'; d.fvWeights = null;
  t(ids(run(signed(d)), 'errors').includes('E17'), 'E17: one fv leg left'); }
{ const d = Z(); delete d._sig; d.market.priceDate = shift(today0, -200); t(ids(run(signed(d), { today: today0 }), 'errors').includes('E27'), 'E27: price 200 days old'); }
{ const d = Z(); delete d._sig; d.market.priceDate = shift(today0, -60); t(ids(run(signed(d), { today: today0 }), 'warnings').includes('W09'), 'W09: price 60 days old'); }
{ const d = Z(); delete d._sig; d.fundamentals.roe = 500; t(ids(run(signed(d)), 'warnings').includes('W07'), 'W07: ROE 500% implausible'); }
{ const d = Z(); delete d._sig; const L = d.legs[0], base = (L.override && L.override.eps) || d.fundamentals.eps;
  L.inputs.multiple = +(d.market.px / base).toFixed(1);
  t(ids(run(signed(d)), 'warnings').includes('W18'), 'W18: target multiple ≈ current multiple'); }
{ const d = Z(); delete d._sig; d.fundamentals.epsForward = +(d.market.px / d.legs[0].inputs.multiple).toFixed(4);
  t(ids(run(signed(d)), 'warnings').includes('W25'), 'W25: target multiple ≈ forward multiple'); }
{ const d = Z(); delete d._sig; d.prose.chart += ' {{lit:$1.00}} {{lit:$2.00}} {{lit:$3.00}}';
  d.meta.litReasons = { '$1.00': 'ราคา IPO ปี 2556', '$2.00': 'ราคาแตกพาร์ปี 2560', '$3.00': 'ราคาเพิ่มทุนปี 2563' };
  t(ids(run(signed(d)), 'warnings').includes('W30'), 'W30: more than 2 lits'); }
{ const d = Z(); delete d._sig; const n0 = P.countMoneyLiterals(d); d.prose.chart += ' เคยแตะ $123.45';
  const w = run(signed(d)).warnings.find((x) => x.id === 'W31');
  t(w && w.msg.startsWith(`${n0 + 1} `), 'W31: counts the added money literal'); }
{ const d = Z(); delete d._sig; d.meta.aiModel = 'Claude Foo 5'; t(ids(run(signed(d)), 'errors').includes('v2:E28'), 'pass-through: v2 E28 on the rendered page surfaces as v2:E28'); }
t(!ids(run(Z()), 'errors').some((x) => CV.NATIVE_V2.has(x.replace(/^v2:/, '')) && x.startsWith('v2:')), 'native codes are not double-reported from the v2 pass-through');
t.done();
```

Run: `rtk proxy node test/v3/check-v3.test.js`
Expected: FAIL with `Cannot find module '../check-v3.js'`.

- [ ] **Step 3: Implement `test/check-v3.js`**

```js
'use strict';
/**
 * check-v3.js — gate ของรายงาน v3 (reports/<SYM>.json) · spec §9 · ruling R4 ของ Plan 2a
 *   คิดเองจาก JSON: E50 ลายเซ็น · E51 สคีมา/compute/render/แท็ก · E52 ขา declared ↔ ตาราง · E17 ≥2 ขา fv
 *                   E27/W09 ความสดราคา · W07 ตัวเลขผิดวิสัย · W18/W25 สมอตาย (จาก inputs) · W30 lit เกิน · W31 literal เงินค้าง
 *   ผ่าน gate v2 บนหน้าที่ render (render smoke test): โค้ดที่เหลือทั้งหมด รายงานเป็น "v2:<id>" — ย้ายเป็น native ใน P7
 *   ไม่รันกติกา B (ruling R5 — กติกา B เป็นของ save · ราคาขยับทุกวันจะทำให้ "เป๊ะ" กระพริบ)
 * CLI: node test/check-v3.js [SYM…] — reports/*.json (นาฬิกาจริง) + fixture ใบจริง (นาฬิกาแช่ที่ market.priceDate ของใบ)
 */
const fs = require('fs');
const path = require('path');
const S = require('../tools/v3/schema.js');
const C = require('../tools/v3/compute.js');
const P = require('../tools/v3/prose.js');
const L = require('../tools/v3/legs.js');
const X = require('../tools/v3/extras.js');
const IO = require('../tools/v3/io.js');
const R = require('../_template/v3/render.js');
const { expandReport } = require('../build.js');
const CR = require('./check-reports.js');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const FIXTURE_DIR = path.join(ROOT, 'test', 'fixtures', 'v3');
const DEAD_ANCHOR_PCT = 7;   // = เส้นเดียวกับ W18/W25 ของ v2 (test/check-reports.js)
const NATIVE_V2 = new Set(['E17', 'E27', 'W07', 'W09', 'W18', 'W25']);
// §13 ข้อ 4 (ผู้ควบคุมตัดสินชั่วคราว): ขา fv 1 ขา = ละเมิดชั้น 0 → ถัง HUMAN · EQIX คือเคสนั้น
const EXPECT_FIXTURE = { 'EQIX-real': ['E17'] };
const CODES = [
  { id: 'E50', level: 'error', label: 'ลายเซ็น _sig ตรงเนื้อไฟล์ (เขียนผ่าน tools/v3/io.js เท่านั้น)' },
  { id: 'E51', level: 'error', label: 'สคีมา v3 + compute + render สำเร็จ + prose ไม่มีแท็กต้องห้าม' },
  { id: 'E52', level: 'error', label: 'ขา declared มีหลักฐาน · ยอดตาราง × fx = ค่าขา ±1%' },
  { id: 'E17', level: 'error', label: '≥2 ขา role:"fv" (ขา context ไม่นับ)' },
  { id: 'E27', level: 'error', label: 'ราคาไม่เก่า/ไม่อยู่อนาคต (market.priceDate)' },
  { id: 'W07', level: 'warn', label: 'ตัวเลขพื้นฐานสมเหตุสมผล' },
  { id: 'W09', level: 'warn', label: 'ความสดของราคา' },
  { id: 'W18', level: 'warn', label: 'ตัวคูณเป้า ≈ ตัวคูณปัจจุบัน (สมอตาย — คำนวณจาก inputs)' },
  { id: 'W25', level: 'warn', label: 'ตัวคูณเป้า ≈ ตัวคูณ forward (สมอตายฝั่ง forward)' },
  { id: 'W30', level: 'warn', label: '{{lit:…}} เกิน 2 ต่อใบ' },
  { id: 'W31', level: 'warn', label: 'literal รูปเงินค้างใน prose (แก้ตอนแตะใบ)' },
];
const CODE = Object.fromEntries(CODES.map((c) => [c.id, c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const thaiToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
const MULT_BASE = { pe: 'eps', pbv: 'bvps', pffo: 'ffoPerShare' };

function checkDoc(doc, opts) {
  const o = opts || {};
  const errors = [], warnings = [];
  const add = (id, msg) => (CODE[id].level === 'error' ? errors : warnings).push({ id, label: CODE[id].label, msg });

  if (!o.skipSig && !IO.verifySig(doc)) add('E50', doc && doc._sig ? 'ลายเซ็นไม่ตรงเนื้อไฟล์ — ไฟล์ถูกแก้นอก io.js' : 'ไม่มี _sig — ไฟล์ไม่ได้เขียนผ่าน io.js');
  const schemaErrs = S.validate(doc);
  if (schemaErrs.length) { add('E51', schemaErrs.map((e) => `${e.path}: ${e.msg}`).join(' ; ')); return { errors, warnings, view: null }; }
  let view, src, html;
  try { view = C.compute(doc, { seeds: o.seeds }); src = R.toV2Source(doc, view); html = expandReport(src); }
  catch (e) { add('E51', 'compute/render: ' + String(e.message).split('\n')[0]); return { errors, warnings, view: null }; }
  const tagErrs = P.proseFields(doc).flatMap(({ path: p, text }) => P.sanitizeErrors(text).map((m) => `${p}: ${m}`));
  if (tagErrs.length) add('E51', tagErrs.join(' ; '));

  for (const i of X.tieOut(doc, view)) add('E52', `${i.path}: ${i.msg}`);
  const nFv = view.legs.filter((l) => l.role === 'fv').length;
  if (nFv < 2) add('E17', `ขา role:"fv" มี ${nFv} ขา (ต้อง ≥ 2) — ขา context ไม่นับ (spec §13 ข้อ 4)`);

  const today = o.today || thaiToday(), pd = doc.market.priceDate, age = days(pd, today);
  const errDays = parseInt(process.env.STALE_ERROR_DAYS || '120', 10), warnDays = parseInt(process.env.STALE_WARN_DAYS || '45', 10);
  if (age < -7) add('E27', `วันที่ราคา (${pd}) อยู่ในอนาคต ${-age} วัน`);
  else if (age > errDays) add('E27', `ราคาเก่าเกินไป: ${pd} (${age} วัน > ${errDays} วัน)`);
  else if (age > warnDays) add('W09', `ราคาเริ่มเก่า: ${pd} (${age} วันที่แล้ว) — ควรอัปเดตก่อนเผยแพร่`);

  const d = view.d, roe = doc.fundamentals.roe, bad = [];   // เกณฑ์เดียวกับ W07 ของ v2
  if (d.pe != null && (d.pe <= 0 || d.pe > 600)) bad.push(`P/E ${d.pe.toFixed(1)} ผิดวิสัย`);
  if (d.pbv != null && (d.pbv <= 0 || d.pbv > 200)) bad.push(`P/BV ${d.pbv.toFixed(2)} ผิดวิสัย`);
  if (d.yield != null && (d.yield < 0 || d.yield > 20)) bad.push(`Div yield ${d.yield.toFixed(2)}% ผิดวิสัย`);
  if (isNum(roe) && (roe < -100 || roe > 200)) bad.push(`ROE ${roe}% ผิดวิสัย`);
  if (bad.length) add('W07', bad.join(' ; '));

  const px = doc.market.px, fq = view.fq || doc.fundamentals;
  doc.legs.forEach((leg, i) => {
    const k = MULT_BASE[leg.method], m = leg.inputs.multiple;
    if (leg.role === 'context' || !k || !isNum(m)) return;
    const base = L.inputsOf(leg, fq)[k];
    if (isNum(base) && base > 0) {
      const cur = px / base, gap = Math.abs(m - cur) / cur * 100;
      if (gap <= DEAD_ANCHOR_PCT) { add('W18', `legs[${i}] ${leg.method} เป้า ${m}x เทียบตัวคูณปัจจุบัน ${cur.toFixed(1)}x ห่างเพียง ${gap.toFixed(1)}% — ขานี้คืนราคาตลาดกลับมา ต้องยึดมัธยฐาน/peer ที่วัดจริง`); return; }
    }
    const fwd = leg.method === 'pe' ? fq.epsForward : leg.method === 'pffo' && fq.ffoForward ? fq.ffoForward.value : null;
    if (isNum(fwd) && fwd > 0) {
      const cur = px / fwd, gap = Math.abs(m - cur) / cur * 100;
      if (gap <= DEAD_ANCHOR_PCT) add('W25', `legs[${i}] ${leg.method} เป้า ${m}x เทียบตัวคูณ forward ${cur.toFixed(1)}x ห่างเพียง ${gap.toFixed(1)}% — ตัวคูณนั้นคิดจากราคาวันนี้`);
    }
  });

  const nLit = P.countLits(doc);
  if (nLit > 2) add('W30', `${nLit} จุด (เกิน 2) — ถ้าต้องพิมพ์ตรงบ่อยขนาดนี้ แปลว่าสคีมาขาดช่อง`);
  const nMoney = P.countMoneyLiterals(doc);
  if (nMoney) add('W31', `${nMoney} literal รูปเงินที่ไม่ใช่ token — แทนด้วย token ตอนแตะใบ (UPDATE/LIGHT)`);

  const res = CR.checkHtml(html, `${doc.symbol}.html`, { source: src });
  for (const e of res.errors) if (!NATIVE_V2.has(e.id)) errors.push({ id: 'v2:' + e.id, label: e.label, msg: e.msg });
  for (const w of res.warnings) if (!NATIVE_V2.has(w.id)) warnings.push({ id: 'v2:' + w.id, label: w.label, msg: w.msg });
  return { errors, warnings, view };
}

module.exports = { checkDoc, CODES, NATIVE_V2, EXPECT_FIXTURE };

function main() {
  const want = new Set(process.argv.slice(2).map((a) => a.replace(/\.json$/i, '').toUpperCase()));
  const seeds = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'seeds.json'), 'utf8'));
  const jobs = [];
  if (fs.existsSync(REPORTS_DIR)) for (const f of fs.readdirSync(REPORTS_DIR).filter((x) => /\.json$/i.test(x)).sort())
    if (!want.size || want.has(f.replace(/\.json$/i, '').toUpperCase())) jobs.push({ name: `reports/${f}`, file: path.join(REPORTS_DIR, f), fixture: null });
  if (!want.size) for (const f of fs.readdirSync(FIXTURE_DIR).filter((x) => /-real\.json$/.test(x)).sort())
    jobs.push({ name: `fixtures/${f}`, file: path.join(FIXTURE_DIR, f), fixture: f.replace(/\.json$/, '') });
  const nReports = jobs.filter((j) => !j.fixture).length;
  console.log(`\n🧾 check-v3 — ใบ v3 ${nReports} ใบ (reports/*.json) + fixture ใบจริง ${jobs.length - nReports} ใบ\n`);
  let fail = 0;
  for (const j of jobs) {
    let r;
    try { const doc = IO.read(j.file); r = checkDoc(doc, { seeds, today: j.fixture ? doc.market.priceDate : undefined }); }
    catch (e) { r = { errors: [{ id: 'E51', label: CODE.E51.label, msg: 'อ่าน JSON ไม่ได้: ' + e.message }], warnings: [] }; }
    const got = r.errors.map((e) => e.id).sort();
    const exp = j.fixture ? (EXPECT_FIXTURE[j.fixture] || []).slice().sort() : [];
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${j.name}${exp.length ? ` (คาด ${exp.join(',')})` : ''}${r.warnings.length ? `   (⚠ ${r.warnings.length})` : ''}`);
    for (const e of r.errors) console.log(`    ${exp.includes(e.id) ? '•' : '✗'} [${e.id}] ${e.label}: ${e.msg}`);
    for (const w of r.warnings) console.log(`    ⚠ [${w.id}] ${w.label}: ${w.msg}`);
  }
  console.log(`\nสรุป: ${jobs.length - fail}/${jobs.length} ตรงตามคาด`);
  if (fail) { console.log('\n❌ check-v3 ไม่ผ่าน — ห้าม push\n'); process.exit(1); }
  console.log('\n✅ check-v3 ผ่าน\n');
}
if (require.main === module) main();
```

- [ ] **Step 4: Run the meta-test and the CLI**

Run: `rtk proxy node test/v3/check-v3.test.js && rtk proxy node test/check-v3.js`
Expected: `✓ check-v3: N/N`. The CLI prints `ใบ v3 0 ใบ (reports/*.json) + fixture ใบจริง 4 ใบ`, with `✓ fixtures/EQIX-real.json (คาด E17)` and the other three `✓`, and exits 0.

Show the gate can fail: temporarily change `EXPECT_FIXTURE` to `{}` → the CLI prints `✗ fixtures/EQIX-real.json` and exits 1 → revert.

- [ ] **Step 5: Wire into `verify` + regenerate docs**

`package.json`: add `"check:v3": "node test/check-v3.js",` next to `"check"`. In `verify`, insert ` && node test/check-v3.js` directly after `node test/check-reports.js`.

`tools/gen-docs.js` — add to `STEP_LABELS` (after the `'test/check-reports.js'` entry):

```js
  'test/check-v3.js': ['🧾', 'ตรวจรายงาน v3 + fixture ใบจริง (check-v3)', 'v3 report gate', {}],
```

Run: `node tools/gen-docs.js && rtk proxy git diff --stat`
Expected: marker blocks change in `CLAUDE.md`, `README.md`, `docs/quality-gate.md`, `docs/price-refresh.md`, `.githooks/pre-push`. The verify step count goes 19 → 20, and `check-v3` appears after `check-reports`.

`README.md`: the regenerated verify-list has a line `12. **\`check-v3\`** _(เติม)_`. Replace ` _(เติม)_` on that line with:

```
 (gate ของใบ v3 `reports/*.json` + fixture ใบจริง `test/fixtures/v3/*-real.json`): E50 ลายเซ็น • E51 สคีมา/compute/render • E52 ขา declared ↔ ตาราง SOTP • E17/E27/W07/W09/W18/W25 คิดจาก JSON • W30 `{{lit:}}` • W31 literal เงินค้าง • โค้ดที่เหลือผ่าน gate v2 บนหน้าที่ render (`v2:<id>`) → [รายละเอียด](docs/quality-gate.md)
```

`docs/quality-gate.md` — append a section (hand-written prose; no step numbers, so docs-test (ค) stays green):

```markdown
## ใบ v3 — `test/check-v3.js` (spec §9 · Plan 2a)

ใบ v3 (`reports/<SYM>.json`) ไม่ผ่าน `check-reports` แต่ผ่าน `check-v3` ซึ่งอ่าน JSON + `tools/v3/compute.js` ตัวเดียวกับ build · ระหว่าง transition ยังไม่มีใบ v3 ใน `reports/` ⇒ รันบน fixture ใบจริง `test/fixtures/v3/*-real.json` (นาฬิกาแช่ที่วันราคาของ fixture) เป็น regression

| code | level | ตรวจอะไร |
|---|---|---|
| E50 | error | `_sig` ตรงเนื้อไฟล์ — ไฟล์ต้องเขียนผ่าน `tools/v3/io.js` เท่านั้น |
| E51 | error | สคีมา v3 + `compute` + render สำเร็จ + prose ไม่มีแท็กนอก `<b> <i> <br>` |
| E52 | error | ขา `declared` (sotp/nav) อ้างตารางที่รวมยอดได้ · แถว total = Σ ภายใต้การปัด · ยอด × fx = ค่าขา ±1% · ขา declared อื่นต้องมีเหตุผลใน note |
| E17 | error | ≥2 ขา `role:"fv"` (ขา context ไม่นับ — spec §13 ข้อ 4) |
| E27 / W09 | error / warn | ความสดของ `market.priceDate` (120 / 45 วัน) |
| W07 | warn | P/E · P/BV · yield · ROE ผิดวิสัย (เกณฑ์เดียวกับ v2) |
| W18 / W25 | warn | ตัวคูณเป้าห่างตัวคูณปัจจุบัน / forward ≤7% — คำนวณจาก `legs[].inputs` ไม่ใช่ regex |
| W30 | warn | `{{lit:…}}` เกิน 2 ต่อใบ |
| W31 | warn | literal รูปเงินที่ไม่ใช่ token ค้างใน prose (ยอดที่มีหน่วย M/B/ล้าน ไม่นับ) |
| `v2:<id>` | ตาม v2 | โค้ดที่เหลือของ `check-reports` รันบนหน้าที่ render (render smoke test) — ย้ายเป็น native ตอน P7 |

กติกา B (ตัวเลขผูกราคาที่พิมพ์เอง) เป็นของ `save` ไม่ใช่ gate รายวัน — gate รายวันใช้ W31
```

- [ ] **Step 6: Run the docs and verify-order tests, then the full gate**

Run: `rtk proxy node tools/gen-docs.js --check && rtk proxy node test/docs-test.js | tail -3 && rtk proxy node test/queue-test.js | tail -2 && npm run verify 2>&1 | tail -8`
Expected: gen-docs `✓ เอกสารตรงกับโค้ด (… verify 20 ขั้น)`. `docs-test` and `queue-test` pass (`queue-test` checks `verify` ↔ `.githooks/pre-push` order). `npm run verify` ends green with `check-v3` in the chain.

- [ ] **Step 7: Commit**

```bash
git add test/check-v3.js test/v3/check-v3.test.js test/fixtures/v3/BBL-real.json test/fixtures/v3/EQIX-real.json test/fixtures/v3/FER-real.json test/fixtures/v3/ZTS-real.json package.json tools/gen-docs.js CLAUDE.md README.md docs/quality-gate.md docs/price-refresh.md .githooks/pre-push
git commit -m "feat(v3): check-v3 gate (E50/E51/E52/W30/W31 + kept codes) + JSON meta-test, wired into verify

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

### Task 13: Exit sweep — spec §12 criteria on every real fixture + zero production effect

**Files:**
- Modify: `test/v3/real-fixtures.test.js` (exit criteria)
- Modify: `test/v3/tokens-corpus.test.js` (print the accepted count; threshold unchanged, per #53)
- Modify: `test/v3/render.test.js` (all real fixtures in the full-gate loop)
- Modify (only if a criterion fails): the offending `test/fixtures/v3/*-real.json`, then re-sign (Task 12 Step 1 one-liner)

**Interfaces:**
- Consumes everything above. Produces no new API. This task is the proof that Plan 2a meets spec §12 and changes nothing in production.

- [ ] **Step 1: Write the exit-criteria tests**

Append to `test/v3/real-fixtures.test.js` (before `t.done();`):

```js
// ── Task 13 — เกณฑ์จบ Plan 2a (spec §12) ──
const REAL = ['BBL-real', 'EQIX-real', 'FER-real', 'ZTS-real'];
// ขา declared เหลือได้เฉพาะที่ไม่มี method คำนวณ (ruling R7)
const DECLARED_OK = {
  'FER-real': [0],   // SOTP basis sotp + extrasRef — E52 ผูกยอดตารางกับค่าขา
  'EQIX-real': [1],  // ขา context ตัวคูณปัจจุบัน — multipleSource ห้าม 'current' โดยตั้งใจ
  'ZTS-real': [1],   // Gordon ขั้นเดียวบน FCF — v3 ไม่มี method นี้
};
for (const f of REAL) {
  const d = load(f);
  t((d.metrics.custom || []).length <= 2, `${f}: custom cards ≤ 2 (got ${(d.metrics.custom || []).length})`);
  t.eq(d.legs.map((l, i) => (l.method === 'declared' ? i : -1)).filter((i) => i >= 0), DECLARED_OK[f] || [], `${f}: declared legs only where no method exists`);
  const texts = P.proseFields(d).map((x) => x.text.trim()).filter((s) => s.length > 20);
  t.eq(texts.length, new Set(texts).size, `${f}: no prose field repeated verbatim`);
}
// ประโยคที่ Task 0 ต้องยัดซ้ำเพราะไม่มีช่อง — ต้องหายหมด (compare docs)
{ const F = load('FER-real');
  t(!F.prose.disclaimerSources.includes('สมมติฐานที่อ่อนไหวที่สุด'), 'FER-real: the disclaimer clause lives only in text.disclaimerAssump');
  t(!F.prose.valuation.includes('ห้ามใช้ P/E</b><br>'), 'FER-real: the §3 hint lives only in text.valHint');
  t(!F.extras[1].note.includes('รวม SOTP'), 'FER-real: the SOTP total lives only in the total row');
  t(!F.legs[0].note.includes('€44.83'), 'FER-real: leg 1 no longer repeats the table total');
  t(!/g 11%\/ปี 10 ปีแรก/.test(F.legs[1].note), 'FER-real: ddm2 inputs are not repeated in the note'); }
t(!load('EQIX-real').legs[1].label.includes('บริบท'), 'EQIX-real: the context marker comes from role, not the label');
t(!/มัธยฐาน P\/E FY2022/.test(load('EQIX-real').legs[0].note), 'EQIX-real: the median window lives in inputs.medianWindow');
t(!('eps' in load('BBL-real').metrics.notes), 'BBL-real: FY EPS lives in fundamentals.fy, not a note');
t.eq(load('BBL-real').fvWeights, null, 'BBL-real: weights come from family, not typed numbers');
```

In `test/v3/render.test.js`, change the loop header `for (const sym of ['ZTS', 'BBL', 'ZTS-real'])` to `for (const sym of ['ZTS', 'BBL', 'ZTS-real', 'BBL-real', 'EQIX-real', 'FER-real'])`.

**Why a 10-section page passes:** the loop also asserts `8 sections`, but FER renders 10 `<section>`s because of its 2 extras. The v2 gate accepts that (FER compare doc D7). So in that loop, replace `t((html.match(/<section>/g) || []).length === 8, …)` with:

```js
  t((html.match(/<section>/g) || []).length === 8 + doc.extras.length, `${sym}: 8 sections + one per extras table`);
```

In `test/v3/tokens-corpus.test.js`, add before the three final `t(...)` lines:

```js
console.log(`  ℹ compute() accepted ${ok}/${files} v2 value sets · ${checked} token renders compared`);
```

- [ ] **Step 2: Run the whole v3 suite**

Run: `rtk proxy node test/v3-test.js 2>&1`
Expected: every line `✓`. The corpus line reads `accepted 909/909`. If any exit assertion fails, fix the **fixture** (move text into its slot; never duplicate it), re-sign with the Task 12 Step 1 one-liner, and re-run. Do not loosen an assertion.

- [ ] **Step 3: Prove zero production effect**

```bash
BASE=$(git merge-base HEAD main)
git worktree add /Users/somchai.s/Downloads/stock-v3-plan2a-base "$BASE"
(cd /Users/somchai.s/Downloads/stock-v3-plan2a-base && node build.js >/dev/null)
node build.js >/dev/null
rtk proxy diff -r /Users/somchai.s/Downloads/stock-v3-plan2a-base/dist dist && echo "DIST IDENTICAL"
rtk proxy git diff --stat "$BASE" -- reports/ reports.json && rtk proxy git status --short reports/ reports.json
git worktree remove --force /Users/somchai.s/Downloads/stock-v3-plan2a-base
```

Expected:
- `DIST IDENTICAL`, with no `diff` output.
- The `git diff --stat` and `git status` lines print nothing: no report and no manifest changed, and the head build did not rewrite `reports.json`.

If `diff` shows only a build timestamp, stop and report it with the differing lines. Do not mask it: run the base build twice and diff those two builds to show the difference is build nondeterminism, not Plan 2a.

- [ ] **Step 4: Full gate**

Run: `npm run verify 2>&1 | tail -6 && rtk proxy node test/check-v3.js | tail -4`
Expected: verify green (20 steps). check-v3 prints `4/4 ตรงตามคาด`, and the tripwire `no-json-reports` still passes inside `v3-test`.

- [ ] **Step 5: Commit**

```bash
git add test/v3/real-fixtures.test.js test/v3/render.test.js test/v3/tokens-corpus.test.js test/fixtures/v3/
git commit -m "test(v3): Plan 2a exit sweep — §12 criteria on every real fixture, dist unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP"
```

---

## Self-review (writer's checklist, done against the spec)

**Spec coverage:**

| Spec item | Task |
|---|---|
| §3.6 A `text.*` | 3 |
| B `fy` + FY cards | 8 |
| B card order | 4 |
| C `family` + derived weights + layer-0 (r,g) | 5 |
| D `analyst.n`/`asOf` optional | 7 |
| F `multipleRange` | 5 |
| G `medianWindow`, `ifrs` | 6 |
| G short leg notes | 6, 13 (fixture edits) |
| H `tone` | 4 |
| I `role` + context rendering | 5 |
| I E17 counts fv only | 12 (ruling R3) |
| J REIT fields/cards/token, §6 hint for every driver, `stock-meta.pe` = px/EPS | 9 |
| K bank | 8 |
| L `reportCurrency`/`fx` | 10 |
| M extras rows/columns/fx + E52 | 11 (logic), 12 (code) |
| N `ddm2` | 6 |
| O notes render tokens | 2 |
| `peAvg5y` label | 2 |
| §4 rule B precision + `{{lit:}}` + `meta.litReasons` | 1 |
| §9 E50 E51 E52 W30 W31, JSON self-test, kept codes | 12 (ruling R4 lists native vs pass-through vs deferred) |
| §11 tripwire kept | global constraint; Task 13 Step 4 |
| §11 no production effect | Task 13 Step 3 |
| §12 exit criteria | 13 |
| #50 | 2 |
| #51 | 1 |
| #53 | 13 (count printed, threshold intentionally unchanged) |

**Not in 2a, by design (Plan 2b):**
- `report.js`, the hook, scanners, worker docs, tripwire removal, #52.
- `|MOS| > 40%` (layer 0) is deferred with its reason in R4.

**Type/name consistency** (checked across tasks):
- `S.cardEntries`, `C.weightsOf`, `C.toQuote`.
- `view.fq` / `view.fx` / `view.stmtCur` (Task 10; Tasks 9, 11 and 12 read them through `view.fq || doc.fundamentals`).
- `K.pffoCalc`/`pffoForwardCalc`.
- `X.fmtCell`/`tableTotal`/`tieOut`.
- `P.litsOf`/`countLits`/`malformedLitPaths`/`stripSpans`.
- `CV.checkDoc`/`NATIVE_V2`/`EXPECT_FIXTURE`.
