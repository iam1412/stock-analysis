# Report v3 — Plan 4a: v3 UPDATE queue flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The price-flags queue (`preflight → prep → worker → postcheck → ship`) handles an existing v3 report (`reports/<SYM>.json`) the same way it handles a v2 report — `prep` builds the worker prompt from the `.json`, the worker edits through `report.js export → save [--light]`, and preflight's age queue no longer hides v3 reports — with no production change (dist byte-identical, no report written).

**Architecture:** `prep.js` gets one small source adapter (`reportSource`) that returns the same shape for v2 (`.html` raw) and v3 (rendered page from `RS.renderedHtml` + `RS.metaLite` + the doc), so the rest of `prep()` (prep-stock, medians, EPS screen, hard-stock, prompt assembly) is untouched; the v2-only `snapshotDiff` (regex over HTML) gets a v3 twin that reads the doc directly; `extraBlock` prints one v3 UPDATE line pointing the worker at SKILL STEP 5U. `preflight.js` drops the `!e.v3` age-queue filter and rewords the per-v3 manual line. The `--light` allowlist already covers every field a v3 LIGHT needs (`P.proseFields` includes `prose.*` and `text.*`; `meta.analysisDate`/`meta.aiModel` are in `LIGHT_EXACT`) — Task 2 pins that with a test instead of changing code. Automatic pre-patch of v3 rows in preflight and `ship`'s handling of a deleted `.html` stay in Plan 4b (`ship.js:243`, `parseGateFailures` `.html` regex, `git checkout -- reports/<sym>.html` revert path).

**Tech Stack:** Node ≥20.19, no dependencies. Tests: `test/queue-test.js` (custom `ok()`), `test/v3/report-cli.test.js` (`_t.js`), `test/docs-test.js`, `node tools/gen-docs.js --check`.

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` §6.3 (UPDATE bullet, amended 25 ก.ย. 69), §11 row "P6 = Plan 4a", §13 item 11. Discovery: `.superpowers/sdd/v3-plan4-task0/findings-migration.md` Q10 (git-excluded; code sites listed below are copied from it).

## Global Constraints

- Worktree `/Users/somchai.s/Downloads/stock-v3-p6`, branch `feat/report-v3-plan4a` (from `main` e91b250b6 + the spec amend commit). One PR. Throwaway scratch checkout for Task 4 only: `/Users/somchai.s/Downloads/stock-v3-plan4a-scratch` (remove at the end of Task 4).
- **No production change:** no file under `reports/` is written or committed in this PR; `dist/` at the final head is byte-identical to the merge-base (Task 4 DIST-PROOF). `tags.json`, `tools/seeds.json`, `price-flags.json`, `reports.json` unchanged.
- **UPDATE never writes a sidecar** (`.queue/prep/<SYM>.json` is NEW-only, `prep.js` "2b." block) — open-items 64 stays unblocked for Thai reports StockAnalysis does not cover.
- **All commits** carry the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` plus the harness attribution lines; one commit per task.
- **Docs gate:** after every docs edit run `node tools/gen-docs.js --check` and `node test/docs-test.js`; never write a step count ("N ขั้น") outside a `<!-- gen: -->` marker.
- **Stub rule:** `CLAUDE.md` §9 bullet "ใบ v3" is a verbatim copy of `.claude/skills/stock-controller/SKILL.md` §9 bullet "ใบ v3" — edit both identically (`test/docs-test.js` does not pin this; the reviewer does).
- **Exact output:** use `rtk proxy <cmd>` when counting lines or comparing output (the rtk hook trims output silently). Check `${PIPESTATUS[0]}`, not the exit of `| tail`.
- **Tests never touch** the real `reports/`, `.work/`, `.queue/` — `QUEUE_DIR` env redirects queue state, `--reports-dir/--work-dir/--prep-dir` redirect `report.js`. Never `git init` inside the repo; any temp git repo must `unset GIT_DIR GIT_WORK_TREE` first.
- Never loosen an existing assertion; replacing a pinned behaviour (the P6 refusal, the `!e.v3` filter) means replacing its test with the new behaviour's test in the same commit.
- Implementer never pushes, never calls `advisor`, never spawns subagents.

## Review Focus

1. **`prep <SYM>` on a v3 report whose `.json` is unreadable (JSON เสีย / symbol mismatch)** — `RS.load` throws with the file name; prep must surface that message, not a stack trace from `reportSource`. Test in Task 1 (`reportSource` on a temp dir with a broken `.json` → throws `/JSON เสีย/`).
2. **v3 report with no `analyst` / no `range52w` / no `dps`** — `snapshotDiffV3` must print nothing for missing fields (not `undefined` into the prompt). Test in Task 1.
3. **A v3 row in the age queue whose bucket is PREPATCH** — `checkNotPrepatch` still refuses before any network call (unchanged code, pinned by the new test order in Task 1: the v3 fixture with `rec.bucket:'PREPATCH'` throws the PREPATCH message, not the old P6 message).
4. **`save --light` on a v3 report after a LIGHT edit of `meta.analysisDate` + `meta.aiModel` + `prose.verdictBody` + `text.valHint`** — must pass the allowlist. Test in Task 2 (report-cli).
5. **preflight on a corpus with both kinds** — `listReportsFS` sorted union; `ageQueue` returns the v3 symbol when its `meta.analysisDate` is older than `STALE_DAYS`; `patchTargets` still skips it (auto pre-patch = 4b). Tests in Task 2.

---

### Task 1: `prep.js` accepts a v3 report (source adapter + v3 snapshot diff + worker line)

**Files:**
- Modify: `tools/queue/prep.js` — remove `checkNotV3` (`:294–298` and its call at `:310`), add `reportSource` + `snapshotDiffV3`, rewire `prep()` (`:311–317`, `:329`, `:359–372`, `:379–385`), `extraBlock` (`:237–292`), header docblock (`:2–11`), `module.exports` (`:412`)
- Test: `test/queue-test.js` — replace the `checkNotV3` block (`:1552–1555`), add `reportSource` / `snapshotDiffV3` / `extraBlock` v3 tests in the same `try` block (the `V3DIR` sandbox already holds `ZTS.json` = `ZTS-real` and `AAPL.html`)

**Interfaces:**
- Consumes: `RS.kindOf(sym, dir)`, `RS.metaLite(sym, dir)` → `{ v3, currency, px, analysisDate, era, aiModel }`, `RS.load(sym, dir)` → `{ v3:true, doc }`, `RS.renderedHtml(sym, dir)` (all in `tools/report-source.js`); `buildCtx(html, name)` from `test/check-reports.js` (already used by postcheck on rendered v3 pages).
- Produces: `reportSource(sym, dir, thFlag) → { kind: null|'v2'|'v3', html, price, currency, th, lite, doc }` · `snapshotDiffV3(doc, vend) → string[]` · `extraBlock(i)` honours `i.v3 === true` (prints the STEP 5U line, omits the v2-only "SKILL 5B ข้อ 3" clause). Exported: `reportSource`, `snapshotDiffV3` (and `checkNotV3` removed — Task 2's preflight wording and Task 3's docs rely on prep accepting v3).

- [ ] **Step 1: Write the failing tests** — in `test/queue-test.js`, replace lines 1552–1555 (the two `checkNotV3` assertions) with:

```js
    // prep — Plan 4a: ใบ v3 เข้า prep ได้ (ไม่มี checkNotV3 อีก) · reportSource ให้รูปเดียวกันทั้ง v2/v3
    ok(typeof Pp.checkNotV3 === 'undefined', 'v3/prep (4a): checkNotV3 ถูกถอด — prep รับใบ v3');
    const srcV3 = Pp.reportSource('ZTS', V3DIR, false);
    ok(srcV3.kind === 'v3' && srcV3.price === 71.33 && srcV3.currency === 'USD' && srcV3.th === false && srcV3.doc && srcV3.doc.symbol === 'ZTS'
      && /<html/i.test(srcV3.html) && srcV3.lite && srcV3.lite.analysisDate === '2026-09-22',
      'v3/prep (4a): reportSource ใบ v3 → kind v3 · price จาก market.px · currency · doc · html ที่ render แล้ว · lite', JSON.stringify({ kind: srcV3.kind, price: srcV3.price, currency: srcV3.currency, th: srcV3.th, html: srcV3.html.slice(0, 20) }));
    const srcV2 = Pp.reportSource('AAPL', V3DIR, false);
    ok(srcV2.kind === 'v2' && srcV2.doc === null && srcV2.html === fs.readFileSync(path.join(V3DIR, 'AAPL.html'), 'utf8') && srcV2.currency === 'USD' && Number.isFinite(srcV2.price),
      'v3/prep (4a): reportSource ใบ v2 → html ดิบเหมือนเดิม · doc null', JSON.stringify({ kind: srcV2.kind, price: srcV2.price }));
    const srcNew = Pp.reportSource('NEWCO', V3DIR, true);
    ok(srcNew.kind === null && srcNew.html === '' && srcNew.th === true && srcNew.price === null && srcNew.doc === null, 'v3/prep (4a): ไม่มีใบ → kind null · th จาก --th');
    // Review Focus 1: .json เสีย → throw ข้อความของ RS.load (ไม่ใช่ stack จาก reportSource)
    fs.writeFileSync(path.join(V3DIR, 'BROKEN.json'), '{ not json');
    let brokenErr = null; try { Pp.reportSource('BROKEN', V3DIR, false); } catch (e) { brokenErr = e.message; }
    ok(/JSON เสีย/.test(brokenErr || ''), 'v3/prep (4a): ใบ v3 ที่ JSON เสีย → throw "JSON เสีย" (Review Focus 1)', brokenErr);
    fs.unlinkSync(path.join(V3DIR, 'BROKEN.json'));
    // snapshotDiffV3 — อ่าน doc ตรง (ไม่ใช่ regex บน HTML)
    const zdoc = RS.load('ZTS', V3DIR).doc;
    const sdOk = Pp.snapshotDiffV3(zdoc, { target: 101.5, analysts: 19, lo52: 70.5, hi52: 149, divYieldPct: 2.97 });
    ok(sdOk.length === 0, 'v3/prep (4a): snapshotDiffV3 — เป้า/52wk/ปันผลตรง (≤2% / ≤3% / ≤0.3pp) → ไม่มีบรรทัด', JSON.stringify(sdOk));
    const sdDiff = Pp.snapshotDiffV3(zdoc, { target: 120, analysts: 20, lo52: 60, hi52: 149, divYieldPct: 4.5 });
    ok(sdDiff.length === 3 && /analyst\.target 100\.94 → 120 \(n=20\)/.test(sdDiff[0]) && /กรอบ 52 สัปดาห์ ใบ 70\.26–148\.79 · vendor 60–149/.test(sdDiff[1]) && /fundamentals\.dps 2\.12 → ปันผล % ใบ 2\.97 · vendor 4\.5/.test(sdDiff[2]),
      'v3/prep (4a): snapshotDiffV3 — เป้า/52wk/ปันผลต่าง → 3 บรรทัดชี้ path ของ JSON', JSON.stringify(sdDiff));
    // Review Focus 2: ใบที่ไม่มี analyst/range52w/dps → ไม่พิมพ์ undefined
    const bare = { ...zdoc, analyst: undefined, fundamentals: { ...zdoc.fundamentals, dps: undefined }, market: { ...zdoc.market, range52w: undefined } };
    const sdBare = Pp.snapshotDiffV3(bare, { target: 120, analysts: 20, lo52: 60, hi52: 149, divYieldPct: 4.5 });
    ok(sdBare.length === 0 && !JSON.stringify(sdBare).includes('undefined'), 'v3/prep (4a): snapshotDiffV3 — ช่องที่ใบไม่มี = เงียบ (Review Focus 2)', JSON.stringify(sdBare));
    // extraBlock — ใบ v3 UPDATE ชี้ STEP 5U · ไม่มีประโยค v2 "SKILL 5B ข้อ 3"
    const ebV3 = Pp.extraBlock({ sym: 'ZTS', mode: 'UPDATE', v3: true, priceFresh: true, priceDate: '2026-09-24', lastSession: '2026-09-24', oldPrice: 71.33, price: 71.33, baseEPS: 5.5, epsTTM: 5.6, epsScreen: 1.8, snap: [], medWarn: [], hard: false, hardWhy: '' });
    ok(/★ ใบ v3 UPDATE — ทำตาม SKILL STEP 5U: node tools\/report\.js export ZTS → แก้ \.work\/ZTS\.json → node tools\/report\.js save ZTS/.test(ebV3) && !/SKILL 5B ข้อ 3/.test(ebV3) && !/apply-edits/.test(ebV3),
      'v3/prep (4a): extraBlock ใบ v3 UPDATE → บรรทัด STEP 5U (export → แก้ .work → save) · ไม่มีประโยค v2', ebV3);
    const ebV3L = Pp.extraBlock({ sym: 'ZTS', mode: 'UPDATE-LIGHT', v3: true, priceFresh: true, priceDate: '2026-09-24', lastSession: '2026-09-24', oldPrice: 71.33, price: 71.33, baseEPS: 5.5, epsTTM: 5.6, epsScreen: 1.8, snap: [], medWarn: [], hard: false, hardWhy: '' });
    ok(/save ZTS --light/.test(ebV3L) && /cron เป็นเจ้าของราคา/.test(ebV3L), 'v3/prep (4a): extraBlock ใบ v3 UPDATE-LIGHT → save --light + บอกว่า cron เป็นเจ้าของราคา', ebV3L);
    const ebV2 = Pp.extraBlock({ sym: 'AAPL', mode: 'UPDATE', v3: false, priceFresh: true, priceDate: '2026-09-24', lastSession: '2026-09-24', oldPrice: 1, price: 1, baseEPS: 1, epsTTM: 1, epsScreen: 0, snap: [], medWarn: [], hard: false, hardWhy: '' });
    ok(!/STEP 5U/.test(ebV2) && /SKILL 5B ข้อ 3/.test(ebV2), 'v3/prep (4a): extraBlock ใบ v2 ไม่เปลี่ยน (ยังมีประโยค 5B ข้อ 3 · ไม่มี STEP 5U)');
```

Also, at the top of that `try` block (after the two `copyFileSync` lines), add nothing — `RS` is already required in queue-test (`const RS = require('../tools/report-source.js')` — check with `rtk proxy grep -n "report-source" test/queue-test.js`; if absent, add the require next to `Pp`).

- [ ] **Step 2: Run the test to watch it fail**

Run: `cd /Users/somchai.s/Downloads/stock-v3-p6 && node test/queue-test.js 2>&1 | grep -E "4a|ผ่าน$" | tail -15`
Expected: the `4a` lines print `✗` (checkNotV3 still exported → first assertion fails; `reportSource is not a function`), final line `queue-test: N/M ผ่าน` with M > N.

- [ ] **Step 3: Implement in `tools/queue/prep.js`**

(a) Replace the `checkNotV3` function (lines 294–298, including its docblock) with:

```js
/** แหล่งของใบเดิมสำหรับ prep (อ่านอย่างเดียว · Plan 4a) — รูปเดียวกันทั้ง v2/v3 เพื่อให้ prep() ที่เหลือไม่รู้ชนิดใบ
 *  v2: html ดิบ (`snapshotDiff`/`buildCtx` regex เดิม) · v3: หน้าที่ build render (`RS.renderedHtml` — `buildCtx` อ่านได้เหมือน postcheck)
 *  + doc สำหรับ `snapshotDiffV3` · ราคา/สกุลจาก `RS.metaLite` (v2 = stock-meta · v3 = market.px/currency) · ไม่มีใบ = th จาก --th
 *  .json เสีย/symbol ไม่ตรง = `RS.load` throw พร้อมชื่อไฟล์ — ปล่อยขึ้นไป (prep ล้มพร้อมข้อความ ไม่เดา) */
function reportSource(sym, dir, thFlag) {
  const d = dir || REPORTS;
  const kind = RS.kindOf(sym, d);
  if (!kind) return { kind: null, html: '', price: null, currency: null, th: !!thFlag, lite: null, doc: null };
  const lite = RS.metaLite(sym, d);
  const price = lite && Number.isFinite(lite.px) ? lite.px : null, currency = lite ? lite.currency : null;
  if (kind === 'v2') return { kind, html: fs.readFileSync(path.join(d, sym + '.html'), 'utf8'), price, currency, th: currency === 'THB', lite, doc: null };
  return { kind, html: RS.renderedHtml(sym, d), price, currency, th: currency === 'THB', lite, doc: RS.load(sym, d).doc };
}

/** snapshot vendor ค้างในใบ v3 (ส่วนบริสุทธิ์ · คู่แฝดของ snapshotDiff แต่อ่าน doc ตรง ไม่ regex HTML) — เกณฑ์เดียวกับ v2:
 *  เป้า analyst ต่าง >2% · กรอบ 52 สัปดาห์ต่าง >3% (ขาใดขาหนึ่ง) · ปันผล % (dps/px) ต่าง >0.3pp · ช่องที่ใบไม่มี = ไม่พิมพ์ (Review Focus 2) */
function snapshotDiffV3(doc, v) {
  const out = [];
  const a = doc && doc.analyst, mk = (doc && doc.market) || {}, f = (doc && doc.fundamentals) || {};
  if (a && Number.isFinite(a.target) && v.target != null && pctDiff(a.target, v.target) > 2)
    out.push(`analyst.target ${a.target} → ${v.target}${v.analysts != null ? ` (n=${v.analysts})` : ''}`);
  const r52 = mk.range52w;
  if (r52 && Number.isFinite(r52.lo) && Number.isFinite(r52.hi) && v.lo52 != null && v.hi52 != null && (pctDiff(r52.lo, v.lo52) > 3 || pctDiff(r52.hi, v.hi52) > 3))
    out.push(`กรอบ 52 สัปดาห์ ใบ ${r52.lo}–${r52.hi} · vendor ${v.lo52}–${v.hi52} (market.range52w — cron เขียนทุกคืน ถ้ายังต่างแปลว่า Yahoo ไม่ให้ 52wk)`);
  if (Number.isFinite(mk.px) && mk.px > 0 && Number.isFinite(f.dps) && v.divYieldPct != null) {
    const shownYield = f.dps / mk.px * 100;
    if (Math.abs(shownYield - v.divYieldPct) > 0.3) out.push(`fundamentals.dps ${f.dps} → ปันผล % ใบ ${shownYield.toFixed(2)} · vendor ${v.divYieldPct}`);
  }
  return out;
}
```

(b) In `prep()` replace lines 310–317 (`checkNotV3(sym); …` through `const th = …`) with:

```js
  const src = reportSource(sym, REPORTS, !!o.th);   // Plan 4a: ใบ v2 และ v3 เข้า prep ได้ทั้งคู่ · .json เสีย = throw ตรงนี้ก่อน network
  const exists = src.kind !== null;
  const html = src.html;
  const th = src.th;
```

(c) In the `statementAfterOf` block (line ~329) replace `const read = () => html;` with `const read = () => (src.kind === 'v3' ? src.lite : html);` (metaLite object carries `analysisDate` + `currency`; `analysisIsoOf`/`currencyOf` in preflight accept either form).

(d) In "3. EPS screen + 4. snapshot diff" replace `snap = snapshotDiff(html, ctx, vend);` with `snap = src.kind === 'v3' ? snapshotDiffV3(src.doc, vend) : snapshotDiff(html, ctx, vend);` — `ctx = buildCtx(expandReport(html), …)` must NOT double-expand a v3 page: change that line to `ctx = buildCtx(src.kind === 'v3' ? html : expandReport(html), sym + '.html');` (`RS.renderedHtml` already returns the expanded page).

(e) In the `extraBlock({...})` call replace `price: sm && sm.price,` with `price: src.price, v3: src.kind === 'v3',` (the `sm` variable no longer exists — remove every other use of `sm` in `prep()`; `rtk proxy grep -n "\bsm\b" tools/queue/prep.js` must return only lines inside `snapshotDiff`'s comments, if any).

(f) In `extraBlock(i)`: change the UPDATE branch's fresh-price clause so the v2-only hint is conditional —

```js
    ? `ราคาในไฟล์สดแล้ว (${stamp}; ${i.oldPrice ?? '?'} → ${i.price ?? '?'}) ⇒ **ห้ามรัน update-prices ซ้ำ**${i.v3 ? '' : ' ยกเว้น SKILL 5B ข้อ 3 (แก้ fairValue — ปลอดภัยแล้วเพราะ lock)'}`
```

and add, right before `return L.join('\n');`:

```js
  // Plan 4a: ใบ v3 เดิม → worker เขียนผ่าน report.js เท่านั้น (SKILL STEP 5U) · LIGHT = save --light (ราคาเป็นของ cron แล้ว — E27/W09 อยู่บน priceDate)
  if (i.v3 && i.mode !== 'NEW') L.push(i.mode === 'UPDATE-LIGHT'
    ? `★ ใบ v3 UPDATE-LIGHT — ทำตาม SKILL STEP 5U: node tools/report.js export ${i.sym} → แก้ .work/${i.sym}.json เฉพาะ allowlist (meta.analysisDate · meta.aiModel · meta.sources · analyst · fundamentals.dps · prose/text) → node tools/report.js save ${i.sym} --light · cron เป็นเจ้าของราคา (market.*) — ห้ามแก้ · ห้าม apply-edits/Write ลง reports/`
    : `★ ใบ v3 UPDATE — ทำตาม SKILL STEP 5U: node tools/report.js export ${i.sym} → แก้ .work/${i.sym}.json → node tools/report.js save ${i.sym} (save พิมพ์ทุก error รอบเดียว) · cron เป็นเจ้าของราคา (market.*) — ห้ามแก้ · ห้าม apply-edits/Write ลง reports/`);
```

(g) Header docblock line 8–9: replace "· ใบเดิมไม่เขียน (v3 UPDATE = P6)" wording in the "2b." comment (line ~347) with "· ใบเดิม (v2/v3) ไม่เขียน sidecar — v3 UPDATE อ่าน market จาก .json เดิม (Plan 4a · #64)"; add to the header docblock after the sidecar line: ` *   · ใบ v3 เดิม (Plan 4a): prompt จากหน้าที่ render + doc (reportSource) · worker เขียนผ่าน report.js export/save — ไม่มี sidecar`.

(h) `module.exports`: remove `checkNotV3`, add `reportSource, snapshotDiffV3`.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `cd /Users/somchai.s/Downloads/stock-v3-p6 && node test/queue-test.js 2>&1 | tail -3 && rtk proxy grep -c "checkNotV3" tools/queue/prep.js test/queue-test.js`
Expected: `queue-test: N/N ผ่าน` (N ≥ 559 + 10 new − 2 removed), and grep count `0` for both files.

- [ ] **Step 5: Commit**

```bash
cd /Users/somchai.s/Downloads/stock-v3-p6 && git add tools/queue/prep.js test/queue-test.js && git commit -F - <<'EOF'
feat(v3): prep accepts v3 reports — reportSource adapter · snapshotDiffV3 · STEP 5U worker line · checkNotV3 removed (Plan 4a Task 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: preflight counts v3 reports in the age queue; `--light` allowlist pinned for v3 LIGHT

**Files:**
- Modify: `tools/queue/preflight.js` — `:37–39` (`listReportsFS` + comment), `:139` comment, `:150–153` (`v3Lines` docblock + text), `:307` comment
- Test: `test/queue-test.js` `:1570–1571` (v3Lines wording), `:1604–1607` (age queue) · `test/v3/report-cli.test.js` (new assertions after the existing `lightViolations` ones, ~`:143`)

**Interfaces:**
- Consumes: `RS.list(dir)` → `[{ symbol, v3 }]`; `RC.lightViolations(before, after)` (unchanged).
- Produces: `listReportsFS(dir)` returns every symbol (v2 + v3), sorted · `v3Lines(rows)` **branches on bucket (fix round 1 after review — the single string below was a plan defect)**: PREPATCH → `` v3 <SYM>: flip ในย่าน → controller pre-patch มือ `node tools/update-prices.js --write --force <SYM>` (ตลาดปิดแล้วเท่านั้น — --force ข้าม guard intraday) แล้ว npm run queue -- ship <SYM> (ship --prepatch ไม่รับ .json · pre-patch อัตโนมัติของใบ v3 = Plan 4b) `` · LIGHT/FULL not skipped → `` v3 <SYM>: หลัง ship --prepatch — ราคายังไม่สด → controller pre-patch มือ `node tools/update-prices.js --write --force <SYM>` (ตลาดปิดแล้วเท่านั้น) แล้ว npm run queue -- prep <SYM> ตามปกติ (worker: report.js export/save — SKILL STEP 5U · pre-patch อัตโนมัติของใบ v3 = Plan 4b) `` · other rows → no line.

- [ ] **Step 1: Write the failing tests** — in `test/queue-test.js`:

Replace line 1571 (the `v3Lines` assertion) with:

```js
    ok(JSON.stringify(P.v3Lines(rows)) === JSON.stringify(['v3 ZTS: ราคายังไม่สด → controller pre-patch มือ `node tools/update-prices.js --write --force ZTS` (pre-patch อัตโนมัติของใบ v3 = Plan 4b) · แล้ว npm run queue -- prep ZTS ตามปกติ (worker: report.js export/save — SKILL STEP 5U)']),
      'v3/preflight (4a): แถวใบ v3 = 1 บรรทัด: pre-patch มือ + prep ตามปกติ · ใบ v2 ไม่มีบรรทัด', JSON.stringify(P.v3Lines(rows)));
```

Replace lines 1604–1607 (the `fix round 1` age-queue block) with:

```js
    // ── Plan 4a: คิวตามอายุนับใบ v3 (ถอดตัวกรอง !e.v3 — prep รับใบ v3 แล้ว) ──
    ok(P.listReportsFS(V3DIR).join() === 'AAPL,ZTS', 'v3/preflight (4a): listReportsFS นับใบ v3 ด้วย (เรียงชื่อ)', P.listReportsFS(V3DIR).join());
    const aq = P.ageQueue('2026-09-24', { listReports: () => P.listReportsFS(V3DIR), footerAgeOf: () => 400 });
    ok(aq.map((r) => r.symbol).join() === 'AAPL,ZTS', 'v3/preflight (4a): ใบ v3 ที่เก่าเกิน STALE_DAYS เข้าคิวอายุ (Review Focus 5)', JSON.stringify(aq));
    const ptAge = P.patchTargets(P.plan([], '2026-09-24', { ageLimit: 5, footerAgeOf: () => 400, lightRule: 'legacy', liteOf, listReports: () => P.listReportsFS(V3DIR) }), { usOpen: false, setOpen: false, allowIntraday: false });
    ok(ptAge.skippedV3.join() === 'ZTS' && ptAge.target.join() === 'AAPL', 'v3/preflight (4a): แถวอายุของใบ v3 ยังไม่เข้า pre-patch อัตโนมัติ (= Plan 4b) · ใบ v2 เข้า', JSON.stringify(ptAge));
```

In `test/v3/report-cli.test.js`, after the `lightViolations: same edit on a pre-existing notes:{}` assertion, add:

```js
  // Plan 4a — LIGHT ของใบ v3 = ประทับวัน/รุ่น + prose/text (ราคาเป็นของ cron) → allowlist เดิมครอบแล้ว (Review Focus 4)
  t.eq(RC.lightViolations(
    { meta: { analysisDate: '2026-09-22', aiModel: 'Claude Sonnet 5', sources: ['a', 'b', 'c'] }, prose: { verdictBody: 'x' }, text: { valHint: 'h1' }, market: { px: 1 } },
    { meta: { analysisDate: '2026-09-25', aiModel: 'Claude Opus 5.5', sources: ['a', 'b', 'c'] }, prose: { verdictBody: 'y' }, text: { valHint: 'h2' }, market: { px: 2 } }),
    [], 'lightViolations (4a): analysisDate + aiModel + prose.* + text.* allowed · market ignored');
  t.eq(RC.lightViolations({ fundamentals: { eps: 1 }, legs: [{ inputs: { multiple: 14 } }] }, { fundamentals: { eps: 2 }, legs: [{ inputs: { multiple: 15 } }] }),
    ['fundamentals.eps', 'legs[0].inputs.multiple'], 'lightViolations (4a): EPS / leg inputs still refused under --light');
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `cd /Users/somchai.s/Downloads/stock-v3-p6 && node test/queue-test.js 2>&1 | grep -E "\(4a\)" ; node test/v3/report-cli.test.js 2>&1 | tail -3`
Expected: the three preflight `(4a)` lines `✗` (listReportsFS still `AAPL`; v3Lines old text); report-cli lines pass already (they pin existing behaviour — that is intended; the plan records that the allowlist needed no change).

- [ ] **Step 3: Implement in `tools/queue/preflight.js`**

Replace lines 37–39 with:

```js
// Plan 4a: คิวตามอายุนับใบ v3 ด้วย — prep รับใบ v3 แล้ว (report.js export/save) · เดิม (Plan 2b–3) กรอง `!e.v3` ออกเพราะ prep ปฏิเสธ "v3 UPDATE = P6"
const listReportsFS = (dir) => RS.list(dir || REPORTS).map((e) => e.symbol).sort();
```

Replace the comment on line 139 with `// ใบ v3: pre-patch อัตโนมัติ = Plan 4b (parseGateFailures/ทาง revert ยังผูกกับ .html) — preflight พิมพ์ v3Lines ชี้คำสั่งมือแทน`.

Replace lines 150–153 (`v3Lines` docblock + body) with:

```js
/** บรรทัดชี้คำสั่งมือต่อแถวใบ v3 (ส่วนบริสุทธิ์ · Plan 3 R8 → Plan 4a) — pre-patch อัตโนมัติของใบ v3 (patchTargets/parseGateFailures/
 *  ทาง revert/ship --prepatch) = Plan 4b · ตั้งแต่ 4a prep รับใบ v3 ⇒ บรรทัดนี้บอกแค่ "pre-patch มือถ้ายังไม่สด แล้ว prep ตามปกติ" */
function v3Lines(rows) {
  return rows.filter((r) => r.v3).map((r) => `v3 ${r.symbol}: ราคายังไม่สด → controller pre-patch มือ \`node tools/update-prices.js --write --force ${r.symbol}\` (pre-patch อัตโนมัติของใบ v3 = Plan 4b) · แล้ว npm run queue -- prep ${r.symbol} ตามปกติ (worker: report.js export/save — SKILL STEP 5U)`);
}
```

Replace the comment on line 307 with `// ใบ v3 ไม่เข้า pre-patch อัตโนมัติ (Plan 4b) — บรรทัดชี้คำสั่งมือต่อใบ (Plan 4a: prep รับใบ v3 แล้ว)`.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `cd /Users/somchai.s/Downloads/stock-v3-p6 && node test/queue-test.js 2>&1 | tail -2 && node test/v3/report-cli.test.js 2>&1 | tail -2 && rtk proxy grep -n "P6" tools/queue/preflight.js tools/queue/prep.js`
Expected: both suites all pass; the grep prints nothing (no "P6" left in the two queue files).

- [ ] **Step 5: Commit**

```bash
cd /Users/somchai.s/Downloads/stock-v3-p6 && git add tools/queue/preflight.js test/queue-test.js test/v3/report-cli.test.js && git commit -F - <<'EOF'
feat(v3): preflight age queue counts v3 reports · v3 row line → pre-patch มือ + prep ตามปกติ · --light allowlist pinned for v3 LIGHT (Plan 4a Task 2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Worker + controller docs — STEP 5U, wrapper prompt, stubs, decisions, open-items

**Files:**
- Modify: `.claude/skills/stock-analyzer/SKILL.md` — `:6` (header), `:15` (STEP 0), new section **STEP 5U** inserted before `## STEP 5A` (`:110`), STEP 5C `:175–176` (v3 branch), STEP 6 `:207–209`
- Modify: `_template/agent-prompt.md` — `:4` (MODE legend), `:21` (STEP 1 line), the "เขียน/แก้ไฟล์ตามโหมด" UPDATE bullet (`:33`), the ai-model bullet (`:26`), STEP 2 return line (`:57`)
- Modify: `.claude/skills/stock-controller/SKILL.md` `:52` and `CLAUDE.md` `:139` (identical append) · `CLAUDE.md` `:36` (§2 bullet "(UPDATE จน P6)")
- Modify: `docs/price-refresh.md` `:114` · `docs/decisions.md` (new §10 block "Report v3 Plan 4a") · `docs/open-items.md` (new row: pre-patch auto v3 + ship deleted .html + parseGateFailures `.html` regex = Plan 4b)
- Test: `node tools/gen-docs.js --check` · `node test/docs-test.js`

**Interfaces:** consumes the strings produced in Tasks 1–2 (`STEP 5U`, `save <SYM> --light`, the v3Lines text) — docs must match them character for character where quoted.

- [ ] **Step 1: stock-analyzer SKILL.md**

Line 6: replace `UPDATE: \`reports/<SYMBOL>.html\` (v2 จน P6)` with `UPDATE: ใบ v2 = \`reports/<SYMBOL>.html\` (STEP 5B/5C) · ใบ v3 = \`reports/<SYMBOL>.json\` ผ่าน \`report.js export/save\` (STEP 5U)`.

Line 15: replace `มี \`reports/<SYMBOL>.json\` → **ใบ v3 เดิม = ยังไม่มี flow UPDATE (จน P6 · Plan 3 = cron ราคาเท่านั้น)** — \`prep\` ปฏิเสธเอง หยุดแล้วรายงาน controller` with `มี \`reports/<SYMBOL>.json\` → **UPDATE/UPDATE-LIGHT ของใบ v3 = STEP 5U** (export → แก้ draft → save [--light] · ห้ามเขียน \`reports/\` ตรง · ราคาเป็นของ cron)`.

Insert before `## STEP 5A` this section (verbatim):

```markdown
## STEP 5U — เขียนรายงาน โหมด UPDATE / UPDATE-LIGHT ของใบ v3 (`reports/<SYMBOL>.json` ผ่าน `tools/report.js` — **ห้ามเขียน `reports/` ตรง**)

> ใช้เมื่อ prompt มีบรรทัด `★ ใบ v3 UPDATE …` หรือ `★ ใบ v3 UPDATE-LIGHT …` (Plan 4a · 25 ก.ย. 69) · กติกาเดียวกับ STEP 5V ทุกข้อ (JSON number · token · family · `meta.aiModel` ของรอบนี้) ต่างที่จุดเริ่ม = ใบเดิม ไม่ใช่ sidecar · **ราคา/กราฟ/52wk (`market.*`) เป็นของ cron** — worker ไม่แตะ ไม่รัน `update-prices` (บันทึกจาก runbook บอกว่าสดหรือยัง · ยังไม่สด = controller pre-patch ให้ก่อน spawn) · `apply-edits.js`/`{{rd:…}}`/Write/Edit ลง `reports/` = ผิดกติกา (E50 ปฏิเสธไฟล์ที่ไม่ได้เซ็น)

**ลำดับ (เป้า ≤ 6 turns หลัง STEP 1–4):**

1. **`node tools/report.js export <SYM>`** (1 turn) — ได้ `.work/<SYM>.json` = ใบเดิมตัด `market` + `_sig` · มี draft ค้าง = exit 1 (ใช้ `--force` เฉพาะเมื่อตั้งใจทิ้ง draft เดิม) · อ่าน draft ครั้งเดียวพร้อม `node tools/report.js show <SYM>` (ตาราง token + ค่าที่ render จากราคาสดของ cron)
2. **แก้ทุกจุดใน Edit ชุดเดียว** (1–2 turns):
   - **UPDATE เต็ม**: ประเมิน EPS/FV/มุมมองใหม่ตาม STEP 2–4 → แก้ `fundamentals.*` · `legs[].inputs`/`note` · `fvWeights` (เฉพาะ 0.4c) · `scenarios` · `prose` 8 ช่อง · `catalysts`/`risks` · `analyst` · `meta.analysisDate` = วันนี้ (ISO · ปี ค.ศ. ในช่องนี้ — render แปลงเป็น พ.ศ. ตาม `dateEra`) · `meta.aiModel` = รุ่นที่รันจริง · **ทบทวน tag** (คืน `TAGS:` บรรทัดเดียว ค่าตั้งต้นคงเดิม — STEP 5B ข้อ 4)
   - **UPDATE-LIGHT**: แก้ได้เฉพาะ allowlist ของ `--light`: `meta.analysisDate` · `meta.aiModel` · `meta.sources` · `meta.priceNote` · `analyst.*` · `fundamentals.dps` · ทุกช่อง prose/text (`prose.*` `text.*` `legs[].note` `scenarios.cases[].desc` `scenarios.note` `catalysts[]` `risks[]` `metrics.hint/notes` `extras[].note`) — **FV/EPS/ตัวคูณห้ามแตะ** (save --light ปฏิเสธพร้อม path) · LIGHT ยัง "ต้องแก้ไฟล์" เสมอ: `meta.analysisDate` = วันนี้ + `meta.aiModel` + ประโยค verdict/กราฟที่อ้างสถานการณ์เก่า · ไม่แตะ tag
   - เลขผูกราคา/FV/MOS/เป้า/ขา/ฉากใน prose = token เสมอ (`show` บอกชื่อ) · ห้ามพิมพ์ราคาสดเป็น literal (กติกา B/W31)
3. **`node tools/report.js save <SYM>`** หรือ **`save <SYM> --light`** (1–2 turns) — พิมพ์ทุก error รอบเดียว → แก้ draft แล้ว save ใหม่ · ผ่าน = `✓ reports/<SYM>.json — FV … · MOS …` (เซ็นแล้ว) · **`save ✓` = gate ของ worker** — `npm test -- <SYM>` รันได้ (ใบเดิมมี tag แล้ว ไม่แดง `v2:E40`) แต่ไม่บังคับ
4. **คืนงาน**: `reports/<SYM>.json` save ✓ · FV/กรอบ/MOS ใหม่ (หรือ "FV เดิมยืน" ใน LIGHT) · แหล่งที่ใช้ · `meta.aiModel` · บรรทัด `TAGS: คงเดิม` / `TAGS: เปลี่ยน — …` (UPDATE) · **ไม่ git** — controller `postcheck` → `ship`

**ที่ต่างจากใบ v2 (STEP 5B/5C) ที่พลาดบ่อย**: ไม่มี footer "ข้อมูล ณ" ให้แก้ (มาจาก `meta.analysisDate`) · ไม่มี `{{rd:…}}`/E44 (token v3 คือ `{{px}}` `{{fv}}` … ตาม `show`) · ไม่มี `update-prices --write --force` ในงานของ worker · ไม่มี apply-edits
```

STEP 5C (line 175, the intro line): append ` · **ใบ v3 → STEP 5U (LIGHT) ไม่ใช่หัวข้อนี้**`. STEP 6 line 207 code block comment: replace `# ใบ v2 เท่านั้น — ใบ v3 NEW = report.js save ✓ (STEP 5V ข้อ 5)` with `# ใบ v2 เท่านั้น — ใบ v3 = report.js save ✓ (NEW: STEP 5V ข้อ 5 · UPDATE: STEP 5U ข้อ 3)`; line 209: after `**ใบ v3 NEW: ไม่รันคำสั่งนี้**` clause append ` · **ใบ v3 UPDATE/LIGHT (STEP 5U): `save ✓` คือ gate เช่นกัน — รัน `npm test -- <SYM>` ได้ (ใบเดิมมี tag) แต่ไม่บังคับ**`.

- [ ] **Step 2: `_template/agent-prompt.md`**

Line 4 MODE legend: replace `/ **UPDATE** = มี \`reports/<SYM>.html\` แล้ว / **UPDATE-LIGHT** = refresh จากคิว price-flags` with `/ **UPDATE** = มีรายงานแล้ว (ใบ v2 \`.html\` → SKILL STEP 5B · ใบ v3 \`.json\` → STEP 5U) / **UPDATE-LIGHT** = refresh จากคิว price-flags (v2 → 5C · v3 → 5U --light)`.

Line 21 (the parenthesis after "อ่าน `.claude/skills/stock-analyzer/SKILL.md`"): replace `· UPDATE = แก้ \`reports/{{SYMBOL}}.html\` ของตัวเองเท่านั้น + self-check \`npm test -- {{SYMBOL}}\` ต้อง 0 error)` with `· UPDATE ใบ v2 = แก้ \`reports/{{SYMBOL}}.html\` ของตัวเองเท่านั้น + self-check \`npm test -- {{SYMBOL}}\` ต้อง 0 error · UPDATE ใบ v3 = \`node tools/report.js export/save {{SYMBOL}}\` เท่านั้น (SKILL STEP 5U · บันทึกจาก runbook มีบรรทัด \`★ ใบ v3 UPDATE\`))`.

Line 26 ai-model bullet: replace `NEW (v3) = \`meta.aiModel: …\` ใน \`.work/{{SYMBOL}}.json\` · UPDATE (v2) = ` with `ใบ v3 (NEW และ UPDATE) = \`meta.aiModel: "Claude <รุ่นที่รันจริง>"\` ใน \`.work/{{SYMBOL}}.json\` · UPDATE ใบ v2 = `.

Line 33 UPDATE bullet: prefix the bullet text with `**UPDATE / UPDATE-LIGHT ใบ v3** = \`report.js export\` → แก้ \`.work/{{SYMBOL}}.json\` ชุดเดียว → \`save\` (LIGHT: \`save --light\`) — STEP 5U · ห้าม apply-edits/Write ลง \`reports/\` · **UPDATE / UPDATE-LIGHT ใบ v2** = ` (keep the rest of the existing bullet verbatim after it).

Line 57 STEP 2 return line: replace `NEW: \`reports/{{SYMBOL}}.json\` save ✓ (+ \`meta.aiModel\` · hex seed) / UPDATE: \`reports/{{SYMBOL}}.html\` เสร็จ` with `NEW: \`reports/{{SYMBOL}}.json\` save ✓ (+ \`meta.aiModel\` · hex seed) / UPDATE ใบ v3: \`reports/{{SYMBOL}}.json\` save ✓ (+ \`meta.aiModel\`) / UPDATE ใบ v2: \`reports/{{SYMBOL}}.html\` เสร็จ`.

- [ ] **Step 3: controller stub + CLAUDE.md §2 + price-refresh**

`.claude/skills/stock-controller/SKILL.md` line 52 AND `CLAUDE.md` line 139 (same bullet — append the identical text to both, at the end of the bullet): ` · **คิว v3 UPDATE (Plan 4a · 25 ก.ย. 69)**: \`preflight\` นับใบ v3 ในคิวอายุ · แถว v3 = บรรทัด \`v3 <SYM>: ราคายังไม่สด → pre-patch มือ … แล้ว prep ตามปกติ\` (pre-patch อัตโนมัติ/ship --prepatch ของใบ v3 = Plan 4b) · \`prep <SYM>\` รับใบ v3 (prompt จากหน้าที่ render + doc · **ไม่สร้าง sidecar** — #64) · worker เขียนผ่าน \`report.js export → save [--light]\` (stock-analyzer STEP 5U) · \`postcheck\`/\`ship\` เหมือน v2 (diff = \`.json\` ใบเดียว)`. Verify identical: `diff <(sed -n 52p .claude/skills/stock-controller/SKILL.md) <(sed -n 139p CLAUDE.md)` prints nothing.

`CLAUDE.md` line 36: replace `skeleton/\`.html\` ข้างบน = ใบ v2 เดิม (UPDATE จน P6)` with `skeleton/\`.html\` ข้างบน = ใบ v2 เดิม (UPDATE ของ v2 · ใบ v3 UPDATE = \`report.js export/save\` — stock-analyzer STEP 5U)`.

`docs/price-refresh.md` line 114: replace the bullet with `- **แถว v3 ในคิว** (preflight พิมพ์บรรทัด \`v3 <SYM>: …\` ต่อใบตาม bucket — Plan 4a): \`mos-sign-flip\` (PREPATCH) = pre-patch **มือ** \`node tools/update-prices.js --write --force <SYM>\` **ตอนตลาดปิดแล้วเท่านั้น** (\`--force\` ข้าม guard intraday) แล้ว \`npm run queue -- ship <SYM>\` (\`ship --prepatch\` ยังรับเฉพาะ \`.html\` — pre-patch อัตโนมัติของใบ v3 = Plan 4b · open-items 66) · แถวที่ต้องส่ง LLM (LIGHT/FULL) = **หลัง** \`ship --prepatch\`: pre-patch มือถ้าราคายังไม่สด แล้ว \`prep <SYM>\` ตามปกติ (worker: \`report.js export/save\` — STEP 5U) · แถว skip/DELIST ไม่มีบรรทัด`.

- [ ] **Step 4: decisions + open-items**

`docs/decisions.md`: append at the end of the §10 "Report v3 Plan 3 (P5)" block (before the next `### ` heading) a new block:

```markdown
### Report v3 Plan 4a — คิว v3 UPDATE (25 ก.ย. 69)

> spec §6.3 (UPDATE bullet) + §11 แถว "P6 = Plan 4a" · plan `docs/superpowers/plans/2026-09-25-report-v3-plan4a-v3-update-flow.md` · branch `feat/report-v3-plan4a` · **ไม่มีผลกับ production** (dist byte-identical · ไม่เขียน `reports/`) · ที่มา: advisor 25 ก.ย. 69 แยก P6 เป็น 4a (flow) → 4b (migrator + sweep อ่านอย่างเดียว) → 4c (แบตช์ · gate = cron 3 รอบสะอาดปิด #62) เพราะ migrate แม้แบตช์เดียวส่งใบ v3 เข้าคิวที่ `prep` ปฏิเสธ/preflight ซ่อน/`ship` commit ผิด

- **prep รับใบ v3ผ่าน `reportSource`** (รูปเดียวกันทั้ง v2/v3: html = หน้าที่ render · ราคา/สกุลจาก metaLite · doc) — `prep()` ที่เหลือไม่รู้ชนิดใบ · `snapshotDiffV3` อ่าน doc ตรง (เกณฑ์เดียวกับ v2: เป้า >2% · 52wk >3% · ปันผล >0.3pp) · **ไม่สร้าง sidecar ให้ UPDATE** (#64) · `checkNotV3` ถอด
- **LIGHT ของใบ v3** = ประทับ `meta.analysisDate`/`meta.aiModel` + prose/text (cron เป็นเจ้าของราคา · E27/W09 อยู่บน priceDate) — allowlist `--light` เดิมครอบแล้ว (`P.proseFields` รวม `prose.*` + `text.*` · `LIGHT_EXACT` มี analysisDate/aiModel) → **ไม่แก้โค้ด แต่ตรึงด้วยเทส** (Task 0 เขียนว่า "ไม่มี path text.*" = อ่านผิด)
- **preflight**: ถอด `!e.v3` (คิวอายุนับใบ v3) · แถว v3 = "pre-patch มือถ้ายังไม่สด แล้ว prep ตามปกติ" · **pre-patch อัตโนมัติของใบ v3ยังเป็น 4b** (parseGateFailures regex `.html` · revert `git checkout -- reports/<sym>.html` · `ship.js:243` existsSync ทิ้ง .html ที่ลบ) — open-items #66
- **worker docs**: stock-analyzer **STEP 5U** (v3 UPDATE/LIGHT) · agent-prompt MODE legend/ai-model/คืนงาน · stub §9 CLAUDE.md = stock-controller SKILL (คำต่อคำ)
- **ซ้อม (Task 4)**: <กรอกผลจริง — OGE UPDATE · ICC UPDATE-LIGHT · QUEUE_DIR แยก · diff = .json ใบเดียว · DIST IDENTICAL>
```

`docs/open-items.md`: add a row (next number after the current max, expected **66**) in the open table: `| 66 | **v3 pre-patch อัตโนมัติ + ship ใบ v3 = Plan 4b** — preflight `patchTargets` ยังข้ามใบ v3 (บรรทัดคำสั่งมือแทน) เพราะ `parseGateFailures` จับ `^✗ <SYM>.html` และทาง revert `git checkout -- reports/<sym>.html` ผูกกับ .html · `ship.js:243` `existsSync` ทิ้ง `.html` ที่ถูกลบ ⇒ migrate v2→v3 ผ่าน `ship` จะเหลือ `.html` ใน HEAD (build บน origin throw) · `ship --prepatch` fail-closed บน `.json` (ตั้งใจ) — ทั้งสามแก้ใน 4b พร้อม migrator | Plan 4a Task 0/2 (25 ก.ย. 69) | v3 Plan 4b |`. Follow the table's exact column format (open the file and copy a neighbouring row's shape).

- [ ] **Step 5: Docs gates**

Run: `cd /Users/somchai.s/Downloads/stock-v3-p6 && node tools/gen-docs.js --check && node test/docs-test.js 2>&1 | tail -1 && diff <(sed -n 52p .claude/skills/stock-controller/SKILL.md) <(sed -n 139p CLAUDE.md) && echo STUB-OK && rtk proxy grep -n "จน P6\|v3 UPDATE = P6" CLAUDE.md .claude/skills/*/SKILL.md _template/agent-prompt.md docs/price-refresh.md`
Expected: gen-docs ✓ · docs-test 57 ✓ · `STUB-OK` · grep prints nothing.

- [ ] **Step 6: Commit**

```bash
cd /Users/somchai.s/Downloads/stock-v3-p6 && git add .claude/skills/stock-analyzer/SKILL.md .claude/skills/stock-controller/SKILL.md CLAUDE.md _template/agent-prompt.md docs/price-refresh.md docs/decisions.md docs/open-items.md && git commit -F - <<'EOF'
docs(v3): Plan 4a — stock-analyzer STEP 5U (v3 UPDATE/LIGHT) · agent-prompt v3 UPDATE path · stock-controller/CLAUDE.md §9 stub · price-refresh · decisions §10 · open-items #66

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Rehearsal (OGE UPDATE · ICC UPDATE-LIGHT) · full gate · DIST-PROOF · PR

**Files:** none in the repo apart from filling the "ซ้อม" bullet in `docs/decisions.md` (Task 3 block). Scratch checkout `/Users/somchai.s/Downloads/stock-v3-plan4a-scratch` and an isolated queue dir `/tmp/plan4a-queue` — both removed at the end.

**Interfaces:** consumes the whole flow: `npm run queue -- prep <SYM> --mode …` (prep.js, Task 1) → `node tools/report.js export/save` → `npm run queue -- postcheck <SYM>` → `npm run queue -- ship <SYM> --no-push`.

- [ ] **Step 1: Full gate at the branch head**

Run: `cd /Users/somchai.s/Downloads/stock-v3-p6 && rtk proxy npm run verify > /tmp/plan4a-verify.log 2>&1; echo "verify exit $?"; tail -3 /tmp/plan4a-verify.log; GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js 2>&1 | grep -E "✗|report-cli|cron:" ; echo "v3-test exit ${PIPESTATUS[0]}"`
Expected: `verify exit 0` · check-site error 0 · v3-test exit 0 with `report-cli` line green.

- [ ] **Step 2: Rehearse the v3 UPDATE flow on a scratch checkout with an isolated queue** (network: prep-stock fetches StockAnalysis/Yahoo and `preflight` runs SEC lookups — run any time; OGE is US so the "ตลาดเปิดอยู่" note may appear, that is fine). Facts this step relies on (verified 25 ก.ย. 69): `ship`'s `postcheckGuard` passes without a prior `preflight` because `S.inRound(rec, undefined)` is true when no round has started (`state.js` inRound) — so a `postcheck ✅` is enough; `preflight()` runs `git pull --rebase origin main` unconditionally, so the scratch is a **branch** (not detached) and preflight runs only on a clean tree; `--no-sec` is not a dispatcher flag (`tools/queue.js:30`) — do not pass it.

```bash
S=/Users/somchai.s/Downloads/stock-v3-plan4a-scratch; Q=/tmp/plan4a-queue; rm -rf "$Q"; mkdir -p "$Q"
cd /Users/somchai.s/Downloads/stock-v3-p6 && git worktree add -b scratch-plan4a "$S" HEAD >/dev/null && cd "$S"
export QUEUE_DIR="$Q"
# (a) UPDATE เต็ม บน OGE — prep ต้องรับใบ v3 (ไม่มี "v3 UPDATE = P6")
npm run queue -- prep OGE --mode UPDATE --model opus 2>&1 | tail -12
grep -n "★ ใบ v3 UPDATE\|โหมด \*\*UPDATE\*\*\|snapshot vendor\|STEP 5U" "$Q/prep/OGE.md" | head; ls "$Q/prep/" | grep -c "OGE.json" ; echo "(expect 0 — no sidecar for UPDATE)"
node tools/report.js export OGE && node -e 'const f=".work/OGE.json";const d=JSON.parse(require("fs").readFileSync(f));d.prose.verdictBody+=" (ซ้อม Plan 4a)";d.meta.analysisDate="'"$(TZ=Asia/Bangkok date +%F)"'";d.meta.aiModel="Claude Opus 5.5";require("fs").writeFileSync(f,JSON.stringify(d,null,2)+"\n")'
node tools/report.js save OGE 2>&1 | tail -3
npm run queue -- postcheck OGE --model opus 2>&1 | tail -6
npm run queue -- ship OGE --no-push --model opus 2>&1 | tail -4
git show --stat --format='%s' HEAD | head -8         # expect: analyze: update OGE … · files = reports/OGE.json + reports.json only
# (b) UPDATE-LIGHT บน ICC — save --light
npm run queue -- prep ICC --mode UPDATE-LIGHT --model opus 2>&1 | tail -8
grep -c "★ ใบ v3 UPDATE-LIGHT" "$Q/prep/ICC.md"
node tools/report.js export ICC && node -e 'const f=".work/ICC.json";const d=JSON.parse(require("fs").readFileSync(f));d.meta.analysisDate="'"$(TZ=Asia/Bangkok date +%F)"'";d.meta.aiModel="Claude Opus 5.5";d.prose.verdictBody+=" (ทบทวนแล้ว — ซ้อม LIGHT)";require("fs").writeFileSync(f,JSON.stringify(d,null,2)+"\n")'
node tools/report.js save ICC --light 2>&1 | tail -2
# negative: LIGHT ที่แก้ FV input ต้องถูกปฏิเสธพร้อม path
node -e 'const f=".work/ICC.json";const d=JSON.parse(require("fs").readFileSync(f));d.legs[0].inputs.multiple=99;require("fs").writeFileSync(f,JSON.stringify(d,null,2)+"\n")'; node tools/report.js save ICC --light 2>&1 | grep -c "\[--light\] legs\[0\]\.inputs\.multiple"; echo "(expect 1)"
node tools/report.js export ICC --force >/dev/null && node tools/report.js save ICC --light 2>&1 | tail -1   # draft = ใบที่ save แล้ว → byte-identical, exit 0 (ไม่ต่อ suffix ซ้ำ)
npm run queue -- postcheck ICC --model opus 2>&1 | tail -4
npm run queue -- ship ICC --no-push --model opus 2>&1 | tail -3
git log --oneline -3; git show --stat --format= HEAD | cat
# (c) preflight กับใบ v3 จริง — สองชั้น: (1) plan()/v3Lines/patchTargets บน reports/ จริงด้วยแถว flag สังเคราะห์ (ไม่แตะ git · OGE/ICC ไม่มี flag จริงและ analysisDate = วันนี้จึงไม่เข้าคิวอายุ) (2) preflight เต็มบน tree ที่สะอาด (หลัง ship commit) ต้องไม่ล้ม
node -e 'const P=require("./tools/queue/preflight.js");const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"});const rows=P.plan([{symbol:"OGE",reason:"drift-gt-15pct",diffPct:20,flaggedAt:today},{symbol:"ICC",reason:"age-gt-90d",synthetic:true,flaggedAt:today}],today,{ageLimit:0,footerAgeOf:()=>10,lightRule:"legacy"});console.log(rows.map(r=>[r.symbol,r.v3,r.oldPrice,r.currency,r.bucket].join(" ")).join("\n"));console.log(P.v3Lines(rows).join("\n"));const pt=P.patchTargets(rows,{usOpen:false,setOpen:false,allowIntraday:false});console.log("skippedV3",pt.skippedV3.join(","),"target",pt.target.join(","));'
# expect: "OGE true <px> USD LIGHT|FULL" · "ICC true <px> THB …" · two "v3 …: ราคายังไม่สด → …" lines · skippedV3 OGE,ICC · target (empty)
git status --short | wc -l   # expect 0 (both ships committed) — preflight pulls; a dirty tree is refused
npm run queue -- preflight --no-patch 2>&1 | grep -E "คิว price-flags|อายุเกิน|ขั้นที่ต้องทำเอง|Error|ล้ม" | head -6   # smoke: runs to the manual-steps block without error (v3 lines only if a real v3 flag exists)
unset QUEUE_DIR; cd /Users/somchai.s/Downloads/stock-v3-p6 && git worktree remove --force "$S" && rm -rf "$Q"
```

Expected: prep OGE prints `โหมด UPDATE` and the `.md` contains `★ ใบ v3 UPDATE — ทำตาม SKILL STEP 5U`; no `OGE.json` sidecar; `save OGE` ✓ with FV/MOS; postcheck `✅ ผ่าน` or only the expected `ai-model`/date issues; ship commit subject `analyze: update OGE — UPDATE (MOS …)` with stat exactly `reports/OGE.json` + `reports.json`; ICC LIGHT: `save --light` ✓, negative case `1`, ship stat `reports/ICC.json` + `reports.json`; preflight prints the `v3 …` lines without error. Record every deviation.

- [ ] **Step 3: Rebase onto the current `main`, then DIST-PROOF vs the new merge-base** (main moves nightly with the cron — same lesson as Plan 3: rebase → proof → push, and repeat the proof if a later rebase is needed)

```bash
cd /Users/somchai.s/Downloads/stock-v3-p6 && git pull --rebase origin main && rtk proxy npm run verify 2>&1 | tail -1 && BASE=$(git merge-base HEAD origin/main) && git worktree add -q /Users/somchai.s/Downloads/stock-v3-plan4a-base "$BASE" && (cd /Users/somchai.s/Downloads/stock-v3-plan4a-base && node build.js >/dev/null 2>&1) && node build.js >/dev/null 2>&1 && (rtk proxy diff -rq /Users/somchai.s/Downloads/stock-v3-plan4a-base/dist dist && echo "DIST IDENTICAL ($(git rev-parse --short HEAD) vs $BASE)"); git worktree remove --force /Users/somchai.s/Downloads/stock-v3-plan4a-base; git status --short | wc -l
```

Expected: `DIST IDENTICAL` and `0`.

- [ ] **Step 4: Record proofs** — fill the "ซ้อม (Task 4)" bullet in the decisions block with the real outputs (mode lines, sidecar absent, commit stats, negative LIGHT case, preflight lines, DIST IDENTICAL, verify exit 0, test counts), run `node test/docs-test.js`, commit `docs(v3): Plan 4a exit proofs` with the trailer.

- [ ] **Step 5: PR** (controller runs this, not the implementer)

```bash
cd /Users/somchai.s/Downloads/stock-v3-p6 && git fetch origin && [ "$(git merge-base HEAD origin/main)" = "$(git rev-parse origin/main)" ] && echo "still on main tip" || echo "main moved — repeat Step 3 before pushing"
GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js >/dev/null && echo V3OK
git push -u origin feat/report-v3-plan4a
gh pr create --repo iam1412/stock-analysis --base main --head feat/report-v3-plan4a --title "Report v3 Plan 4a: v3 UPDATE queue flow (prep/preflight accept v3 · STEP 5U)" --body-file <body>
```

PR body: the spec amend summary (P6 → 4a/4b/4c, the rulings), the three code facts (reportSource · `!e.v3` removed · allowlist unchanged + pinned), the rehearsal outputs, DIST-PROOF, test counts, "no production change", and the caveat that the rehearsal proves the flow with controller-scripted edits — the first real v3 UPDATE by an Opus worker reading STEP 5U is the acceptance test for the docs (watch its turn count against the ≤6 target). Then advisor pre-merge → `gh pr merge <N> --merge --repo iam1412/stock-analysis` standalone.

---

## Self-review

- **Spec coverage:** §6.3 UPDATE bullet (prep accepts v3 · no sidecar · export/save · LIGHT definition · preflight counts v3) → Tasks 1–3 · §11 row Plan 4a (code sites `prep.js:295–298,310` `:313–315,326` `:365–369` · `preflight.js:39,152–153` · `--light` path · agent-prompt/SKILL · queue-test pins) → Tasks 1–3 · exit criterion (OGE UPDATE + ICC LIGHT rehearsal · diff = `.json` only · dist identical · verify) → Task 4. §13 item 11 already says "= Plan 4a". Pre-patch auto for v3 deliberately deferred (open-items 66) — matches the spec row's parenthetical.
- **Placeholder scan:** the only runtime-filled values are the rehearsal outputs in Task 4 Step 4 and the open-items row number (verified against the file at edit time). No TBD/TODO.
- **Type consistency:** `reportSource → { kind, html, price, currency, th, lite, doc }` used identically in Task 1 code, tests and the decisions text; `snapshotDiffV3(doc, vend)` field names `target/analysts/lo52/hi52/divYieldPct` match `parseVendor`'s output used by `snapshotDiff` today; `extraBlock` gains only `i.v3`.
- **Review Focus:** 1 → Task 1 BROKEN.json test · 2 → Task 1 `bare` test · 3 → unchanged `checkNotPrepatch` order (still first network-free guard; Task 1 test order keeps it) · 4 → Task 2 report-cli test · 5 → Task 2 preflight tests.
