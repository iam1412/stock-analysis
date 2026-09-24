# Report v3 Plan 2c-i — worker docs (STEP 5V) · small code · tripwire removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a stock-analysis worker one authoritative v3 NEW procedure (SKILL.md STEP 5V), remove every v2 instruction that would reach a v3 worker through the prep prompt or tool stdout, add `ship --no-push`, and remove the tripwire — with **zero production effect** (no `reports/*.json` exists yet; `dist/` byte-identical).

**Architecture:** Docs first (SKILL.md is Read by the worker at runtime from the worktree → the reliable carrier; CLAUDE.md is an injected session-start snapshot → gets a pointer line only). Small code edits keep v2 behaviour byte-identical (prep UPDATE path, ship without `--no-push`, fetch-facts/pick-brand default output shape) and only change text or add a flag. The tripwire `test/v3/no-json-reports.test.js` is deleted in the **last** commit because `ship` (used by 2c-ii) runs the full `npm run verify`, which includes `v3-test`.

**Tech Stack:** Node ≥20.19 · existing test runners (`node test/v3-test.js`, `node test/queue-test.js`, `node test/docs-test.js`, `npm run verify` 20 steps) · `rtk proxy` for exact output.

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` — §6.6 (Plan 2c, added 24 ก.ย. 69), §6.1, §6.4, §11 P4b, §13 items 14–15. Findings: `.superpowers/sdd/v3-plan2c-task0/{controller-probes,findings-worker-docs}.md` (git-excluded; the plan carries every value it needs).

## Global Constraints

- Worktree `/Users/somchai.s/Downloads/stock-v3-plan2c`, branch `feat/report-v3-plan2c-i` (from `origin/main` 5309fc74a). No other worktree except the throwaway DIST-PROOF base checkout `/Users/somchai.s/Downloads/stock-v3-plan2c-base` (removed at the end of each proof).
- **Zero production effect.** No file under `reports/`, no `reports.json`, no `.claude/settings*.json`, no `tags.json`, no `tools/seeds.json` changes. `dist/` at the merge-base and at HEAD byte-identical (DIST-PROOF at the end of Tasks 2 and 4). No `reports/*.json` is created anywhere in this plan.
- **v2 behaviour byte-identical:** `prep` in UPDATE/UPDATE-LIGHT mode writes the same `.md`; `ship <SYM>` without `--no-push` behaves exactly as today; `fetch-facts` / `pick-brand` machine-readable output (`--json`, `seeds.json` write) unchanged — only human-facing stdout lines change.
- All "which files are reports" questions go through `tools/report-source.js`. Tests offline, temp dirs only. Never spawn git in a temp repo without scrubbing `GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_COMMON_DIR|GIT_PREFIX|GIT_OBJECT_DIRECTORY` from the child env (memory `git-hook-env-git-init-trap`). Before pushing, run `GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js` once (simulates the pre-push hook env).
- Commit trailers: implementer's harness attribution + `Claude-Session: https://claude.ai/code/session_01LVyM2HVJV2UGfXJc58MhzP`. Never push. Never call the advisor. Never spawn subagents.
- Thai/English mix and tone must match the surrounding document (SKILL.md is Thai-first with code identifiers in English). Do not rewrite v2 sections; add v3 sections and pointer lines.
- **DIST-PROOF** (exact commands):
  ```bash
  cd /Users/somchai.s/Downloads/stock-v3-plan2c
  BASE=$(git merge-base HEAD origin/main); B=/Users/somchai.s/Downloads/stock-v3-plan2c-base
  git worktree add --detach "$B" "$BASE" >/dev/null && (cd "$B" && node build.js >/dev/null) && node build.js >/dev/null
  diff -rq "$B/dist" dist && echo DIST IDENTICAL
  git worktree remove --force "$B"
  ```

## Review Focus

1. A v3 NEW worker who reads SKILL.md top-to-bottom must never be told to Write `reports/<SYM>.html`, start from a skeleton, use `apply-edits`, paste a theme, or run `npm test -- SYM` — every such line must be either inside a section explicitly labelled v2, or followed by a v3 pointer. (Task 2 checklist + the grep in Task 2 Step 6.)
2. The prep `.md` for a NEW symbol must contain the STEP 5V pointer line and must not contain the `update-prices --write --force` hint (Task 1 test; Task 4 dry run on OGE).
3. `ship <SYM> --no-push` must commit exactly what `ship <SYM>` commits (same pathspec, same message) and then stop — no `pull --rebase`, no `push`, no issue close (Task 1 test).
4. `prep` UPDATE/UPDATE-LIGHT output byte-identical before/after (Task 1 test on the existing queue fixtures).
5. Deleting the tripwire must not silently remove the only check that `reports/*.json` is absent during 2c-i itself: Task 4's exit re-asserts `ls reports/*.json | wc -l` = 0 and DIST IDENTICAL.

---

### Task 1: Small code — `ship --no-push` · prep NEW extraBlock · fetch-facts / pick-brand / themeOf messages

**Files:**
- Modify: `tools/queue/ship.js` (`--no-push` in the `ship <SYM>` flow: skip `pushWithRebase`/`pushIfClean` and `closeIssueIfEmpty`; keep commit identical)
- Modify: `tools/queue.js` (the `npm run queue` CLI entry — parse `--no-push` → `noPush`, usage line; **not** `tools/queue/queue.js`, which does not exist)
- Modify: `tools/queue/prep.js` (`extraBlock`: NEW mode → no `update-prices --write --force` hint; when the sidecar was written, add one line pointing at STEP 5V; the NEW-mode policy line "pick-brand/update-prices มี lock แล้ว รันตาม SKILL ได้เมื่อจำเป็น" → "pick-brand มี lock แล้ว รันตาม SKILL ได้เมื่อจำเป็น · update-prices ไม่ใช้กับใบ v3 (cron ข้ามจน Plan 3)" — the real `.queue/prep/OGE.md:126` carries this line; UPDATE modes keep their text)
- Modify: `tools/fetch-facts.js` (text-mode stdout line "chart (วางใน report-data — …)" → neutral wording that names both paths)
- Modify: `tools/pick-brand.js` (stdout after writing the seed: add one line "ใบ v3: ไม่ต้อง copy theme/GDOTS — save/build อ่าน seeds.json เอง"; keep the v2 copy block)
- Modify: `tools/v3/compute.js` (`themeOf` message: `ไม่มีสีแบรนด์ — รัน node tools/pick-brand.js <SYM> "#rrggbb" --auto (ลง tools/seeds.json) · themeLegacy ใช้ได้เฉพาะใบที่ migrate มา — save ปฏิเสธบนใบ NEW`)
- Test: `test/v3/plan2c-code.test.js` (new, offline, uses `test/v3/_t.js`)

**Interfaces:**
- Consumes: `tools/queue/ship.js` `ship(sym, o)` and its `pushIfClean`/`pushWithRebase`/`closeIssueIfEmpty` (read the file: the push happens after the commit, near `if (!pushIfClean(sym)) return;`; the `phase === 'unpushed'` branch must also respect `noPush`); `tools/queue.js` (CLI entry) + `tools/queue/args.js` arg parser (`has('--flag')` style — read them first); `tools/queue/prep.js` `extraBlock({ sym, mode, … })` and the `sc`/`sidecar` variables (sidecar is written after the `.md`; `sc !== null` is known before `extraBlock` is built); `test/v3/sidecar.test.js` `runPrep` child harness (`test/v3/_prep-child.js`) for the prep test.
- Produces: `ship(sym, { noPush: true })` → commit only; `queue ship <SYM> --no-push`; prep NEW `.md` containing the line `★ ใบ NEW เขียนเป็น v3 — ทำตาม SKILL STEP 5V: node tools/report.js init <SYM> → เติม .work/<SYM>.json → pick-brand → save (sidecar: .queue/prep/<SYM>.json)` and **not** containing `update-prices.js --write --force`.

- [ ] **Step 1: Write the failing tests**

Create `test/v3/plan2c-code.test.js`:

```js
'use strict';
// Plan 2c-i Task 1 — small code: ship --no-push · prep NEW extraBlock · fetch-facts/pick-brand/themeOf wording
// ★ offline · temp dirs only · never touches reports/ .queue/ tags.json seeds.json
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const t = require('./_t.js')('plan2c-code');
const ROOT = path.join(__dirname, '..', '..');

// (1) prep NEW extraBlock — through the existing child harness (QUEUE_DIR injected; run/medianBlock faked)
{ const child = path.join(__dirname, '_prep-child.js');
  const q = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-2c-prep-'));
  const r = cp.spawnSync(process.execPath, [child, 'ok'], { encoding: 'utf8', env: { ...process.env, QUEUE_DIR: q } });
  const md = fs.readFileSync(path.join(q, 'prep', 'ZZZQ.md'), 'utf8');
  t(r.status === 0, `prep NEW ok (exit ${r.status}) ${r.stderr.slice(-200)}`);
  t(/★ ใบ NEW เขียนเป็น v3 — ทำตาม SKILL STEP 5V/.test(md), 'prep NEW .md carries the STEP 5V pointer line');
  t(!/update-prices\.js --write --force/.test(md), 'prep NEW .md has no update-prices --write --force hint');
  t(/\.queue\/prep\/ZZZQ\.json/.test(md), 'prep NEW .md names the sidecar path');
  fs.rmSync(q, { recursive: true, force: true }); }
{ const child = path.join(__dirname, '_prep-child.js');
  const q = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-2c-prep-'));
  const r = cp.spawnSync(process.execPath, [child, 'fail-run'], { encoding: 'utf8', env: { ...process.env, QUEUE_DIR: q } });
  const md = fs.readFileSync(path.join(q, 'prep', 'ZZZQ.md'), 'utf8');
  t(r.status === 0 && !/★ ใบ NEW เขียนเป็น v3/.test(md), 'prep NEW without a sidecar → no 5V pointer (init would refuse)');
  t(!/update-prices\.js --write --force/.test(md), 'prep NEW (degraded) still has no update-prices hint');
  fs.rmSync(q, { recursive: true, force: true }); }

// (2) ship --no-push — pure helper: the decision is a function of options, not of git state
{ const SH = require('../../tools/queue/ship.js');
  t(typeof SH.shouldPush === 'function', 'ship.js exports shouldPush(o)');
  t(SH.shouldPush({}) === true && SH.shouldPush({ noPush: false }) === true, 'shouldPush default = true (v2 behaviour unchanged)');
  t(SH.shouldPush({ noPush: true }) === false, 'shouldPush({noPush:true}) = false'); }
{ const src = fs.readFileSync(path.join(ROOT, 'tools', 'queue.js'), 'utf8');
  t(/--no-push/.test(src) && /noPush/.test(src), 'queue.js parses --no-push into noPush');
  // ★ match the ACTUAL usage token of `ship` in tools/queue.js (read the file first — it may be `ship <SYM>` or `ship <SYMBOL>`); adjust this regex to it
  t(/ship <SYM(?:BOL)?>[^\n]*--no-push/.test(src), 'queue.js usage line documents --no-push'); }

// (3) fetch-facts text-mode wording — no longer tells a worker to paste into report-data
{ const src = fs.readFileSync(path.join(ROOT, 'tools', 'fetch-facts.js'), 'utf8');
  t(!/chart \(วางใน report-data/.test(src), 'fetch-facts: "chart (วางใน report-data" wording removed');
  t(/v3/.test(src) && /report\.js save|sidecar/.test(src), 'fetch-facts: chart line names the v3 path'); }

// (4) pick-brand stdout — v3 note present, v2 copy block kept
{ const src = fs.readFileSync(path.join(ROOT, 'tools', 'pick-brand.js'), 'utf8');
  t(/ใบ v3: ไม่ต้อง copy/.test(src), 'pick-brand: v3 note line present');
  t(/GDOTS/.test(src), 'pick-brand: v2 GDOTS copy block kept'); }

// (5) themeOf message — no "หรือ themeLegacy" on the NEW path
{ const C = require('../../tools/v3/compute.js');
  const IO = require('../../tools/v3/io.js');
  const doc = IO.read(path.join(ROOT, 'test', 'fixtures', 'v3', 'ZTS-real.json'));
  const d2 = JSON.parse(JSON.stringify(doc)); delete d2.meta.themeLegacy;
  let msg = '';
  try { C.compute(d2, { seeds: {} }); } catch (e) { msg = e.message; }
  t(/pick-brand/.test(msg) && /seeds\.json/.test(msg), `themeOf message names pick-brand + seeds.json (${msg.slice(0, 80)})`);
  t(/save ปฏิเสธบนใบ NEW/.test(msg), 'themeOf message says themeLegacy is refused on NEW');
  t(!/หรือ themeLegacy/.test(msg), 'themeOf message no longer offers "หรือ themeLegacy" as the fix'); }

t.done();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk proxy node test/v3/plan2c-code.test.js`
Expected: `✗ plan2c-code: N/M` with failures in every group (5V pointer absent, `shouldPush` undefined, wording present, message text old).

- [ ] **Step 3: Implement**

`tools/queue/ship.js`:
- Add `function shouldPush(o) { return !(o && o.noPush); }` and export it alongside the existing exports.
- In `ship(sym, o)` after the commit: `if (!shouldPush(o)) { log(`ℹ --no-push: commit แล้ว ยังไม่ rebase/push (branch → PR → advisor) — push เองภายหลังด้วย git push origin HEAD:<branch>`); return; }` **before** `pushIfClean`/`pushWithRebase` and before `closeIssueIfEmpty`. Apply the same guard in the `phase === 'unpushed'` branch (an earlier commit exists and only the push is pending): with `noPush` print the same ℹ line and return without pushing.
- Do not change the commit message, pathspec, verify call, or the `--prepatch` path.

`tools/queue.js`: parse `--no-push` (`noPush: has('--no-push')`, via `tools/queue/args.js` conventions) into the `ship` options; add `[--no-push]` to the `ship` usage line (keep its existing token spelling) with the note `(commit เท่านั้น — ไม่ rebase/ไม่ push · flow branch → PR)`.

`tools/queue/prep.js` `extraBlock` (read the current NEW branch first):
- NEW mode: **remove** the "ราคาในไฟล์ยังไม่สด … รัน node tools/update-prices.js --write --force <SYM>" hint (it is meaningless for NEW and exits ≠0 on a v3 symbol). Keep UPDATE/UPDATE-LIGHT text byte-identical.
- When `sc !== null` (sidecar built — pass a boolean `sidecarOk` into `extraBlock`), append exactly one line:
  `★ ใบ NEW เขียนเป็น v3 — ทำตาม SKILL STEP 5V: node tools/report.js init <SYM> → เติม .work/<SYM>.json → pick-brand → save (sidecar: .queue/prep/<SYM>.json) · ห้ามเขียน reports/ ด้วย Write/Edit/Bash · save ✓ = gate ของ worker (ไม่ต้องรัน npm test)` with `<SYM>` substituted. When the sidecar failed (degraded path), print nothing extra (the ⚠ line already exists).

`tools/fetch-facts.js` text mode: replace the `chart (วางใน report-data — …)` label with `chart (v2: วางใน report-data · v3: อยู่ใน sidecar/market แล้ว — report.js save ใส่ให้เอง ไม่ต้องวาง)`. `--json` output unchanged.

`tools/pick-brand.js`: after the existing theme/GDOTS copy block, print `ℹ ใบ v3: ไม่ต้อง copy theme/GDOTS — save/build อ่าน tools/seeds.json เอง (ลงแล้ว)`. `seeds.json` write unchanged.

`tools/v3/compute.js` `themeOf` throw message → `meta.themeLegacy: ไม่มีสีแบรนด์ — รัน node tools/pick-brand.js <SYM> "#rrggbb" --auto (ลง tools/seeds.json) · themeLegacy ใช้ได้เฉพาะใบที่ migrate มา — save ปฏิเสธบนใบ NEW` (keep the `meta.themeLegacy:` path prefix — `semanticErrors` keys on it; check `test/v3/compute.test.js` / `check-v3.test.js` for assertions on the old text and update them to the new wording only where they match the message body).

- [ ] **Step 4: Run tests**

Run: `rtk proxy node test/v3/plan2c-code.test.js && rtk proxy node test/v3/sidecar.test.js && rtk proxy node test/queue-test.js | tail -1 && rtk proxy node test/v3-test.js >/dev/null && echo V3-OK`
Expected: `✓ plan2c-code: M/M` · sidecar still 54/54 · queue-test 555/555 (or higher if you added cases) · `V3-OK`.

Also prove UPDATE prep is byte-identical: `rtk proxy node test/queue-test.js` already covers prep UPDATE fixtures; additionally run `git stash -q && node -e "…"`-free proof: `git diff --stat` must show no change under `test/fixtures/queue/` and the queue-test prep expectations untouched.

- [ ] **Step 5: Commit**

```bash
git add tools/queue/ship.js tools/queue/queue.js tools/queue/prep.js tools/fetch-facts.js tools/pick-brand.js tools/v3/compute.js test/v3/plan2c-code.test.js test/v3/*.test.js
git commit -m "feat(v3): 2c-i code — ship --no-push · prep NEW points at STEP 5V (no update-prices hint) · de-v2 fetch-facts/pick-brand/themeOf wording"
```

---

### Task 2: Worker docs — SKILL.md STEP 5V · agent-prompt · CLAUDE.md pointers · stock-controller · orchestration

**Files:**
- Modify: `.claude/skills/stock-analyzer/SKILL.md` (frontmatter l.3 · title l.6 · l.10 · STEP 0 l.15–16 · STEP 1 l.42 note · STEP 3 l.69–72 v2 label · **new STEP 5V between STEP 4 and STEP 5A** · STEP 5A heading label "(v2)" · STEP 6 l.181)
- Modify: `_template/agent-prompt.md` (l.4 mode legend · l.21 · l.26 · l.32 · l.35 · l.57)
- Modify: `CLAUDE.md` (§1 tree line · §2 invariant bullet · §7 filename bullet · §10 first bullet — pointer lines only)
- Modify: `.claude/skills/stock-controller/SKILL.md` (§3 one bullet: v3 NEW controller order · §9 one line: v3 skipped by cron until P5)
- Modify: `docs/orchestration.md` (l.15 ai-model source · l.31 inline meaning)
- Test: `node test/docs-test.js` + `node tools/gen-docs.js --check` (existing) · grep assertions in Step 6

**Interfaces:**
- Consumes: Task 1's prep line text (`★ ใบ NEW เขียนเป็น v3 — ทำตาม SKILL STEP 5V`), `tools/report.js` USAGE/exit codes, `S.LEG_INPUTS`, token names from `tools/v3/tokens.js`.
- Produces: the section heading `## STEP 5V — เขียนรายงาน โหมด NEW (v3 · reports/<SYMBOL>.json ผ่าน tools/report.js)` that the prep line and agent-prompt point at.

- [ ] **Step 1: SKILL.md — pointer edits (exact replacements)**

l.3 `description:` → replace `เป็นรายงาน HTML dashboard ใน reports/<SYMBOL>.html` with `เป็นรายงาน dashboard (ใบใหม่ = reports/<SYMBOL>.json v3 ผ่าน tools/report.js · ใบเดิม = reports/<SYMBOL>.html v2)` and `โหมด NEW (หุ้นใหม่จาก skeleton)` with `โหมด NEW (หุ้นใหม่ — v3 STEP 5V)`.

l.6 → `# Stock Analyzer — วิเคราะห์หุ้น 1 ตัว → NEW: \`reports/<SYMBOL>.json\` (v3) · UPDATE: \`reports/<SYMBOL>.html\` (v2 จน Plan 3)`

l.10 → replace `ชื่อไฟล์ = \`<SYMBOL>.html\` พิมพ์ใหญ่เสมอ (override ชื่อ default อื่นทุกแบบ)` with `ชื่อไฟล์ = \`<SYMBOL>\` พิมพ์ใหญ่เสมอ — NEW = \`.json\` ที่ \`report.js save\` เขียนให้ (worker ไม่ตั้งชื่อไฟล์เอง) · UPDATE = \`.html\` เดิม (override ชื่อ default อื่นทุกแบบ)`

l.15–16 (STEP 0) → 
```
- มี `reports/<SYMBOL>.html` อยู่แล้ว → **UPDATE** (แก้เฉพาะจุด **ห้าม rewrite/ห้ามเริ่ม skeleton ใหม่**) · มี `reports/<SYMBOL>.json` → **ใบ v3 เดิม = ยังไม่มี flow UPDATE (Plan 3 P6)** — `prep` ปฏิเสธเอง หยุดแล้วรายงาน controller
- ยังไม่มีทั้งสอง → **NEW = v3 เท่านั้น (STEP 5V)** — ห้ามเริ่มจาก skeleton `.html` (STEP 5A เป็นทางเดิมของใบ v2 เก็บไว้อ้างอิง) · ห้ามก๊อปรายงานหุ้นอื่น
```

l.42 (STEP 1 NEW bullet) → append at the end: ` · **ใบ v3: บล็อก chart/ราคา/ป้าย % ไม่ต้องวางที่ไหน** — อยู่ใน sidecar `.queue/prep/<SYM>.json` แล้ว `report.js save` รวมเข้าใบให้เอง (บรรทัด "วางใน report-data" ในผลลัพธ์ script = ใบ v2)`

l.69–72 (STEP 3): prefix each of these four bullets with `(v2) ` and add after l.72 one bullet: `- **(v3)** สิ่งที่ตรงกันของ 4 ข้อข้างบน: หุ้นขาดทุน → ไม่ใส่ขา `pe`/การ์ด `pe` (schema ตัดสิน `stock-meta.pe` จาก `eps` เอง) · ชื่อวิธี = `method` ของขา (`pe`/`pbv`/`ddm`/…) ไม่ใช่ข้อความ · สกุลเงินมาจาก `currency` ของใบ ไม่ต้องพิมพ์นำหน้า EPS · การ์ด "วัดได้" = `multipleSource: 'median5y'/'median10y'` ใส่ `medianWindow` (ไม่มีป้ายให้พิมพ์)`

STEP 5A heading l.84 → `## STEP 5A — (v2 · ใบเดิมเท่านั้น — ใบใหม่ใช้ STEP 5V) เขียนรายงาน โหมด NEW แบบ skeleton (**Write ทั้งไฟล์ครั้งเดียว**)` and add as the first line under it: `> ⛔ ตั้งแต่ Plan 2c (24 ก.ย. 69) ใบใหม่ทุกใบเป็น v3 — หัวข้อนี้เก็บไว้เพื่ออ่านกติกา prose/W08/E44 ที่ยังใช้ร่วมกัน ห้ามใช้เขียนไฟล์ · hook ชั้น 1 + gate `_sig`/E50 จะปฏิเสธ `reports/*.html` ใบใหม่`

STEP 6 l.181 → replace `ต้อง **0 error** (พลาดบ่อย: …)` with `**ใบ v2 (UPDATE/UPDATE-LIGHT)**: ต้อง **0 error** (พลาดบ่อย: E13 token ค้าง · E28 ai-model · E29 currency ISO · E32 .sub) · **ใบ v3 NEW: ไม่รันคำสั่งนี้** — `node tools/report.js save <SYM>` ผ่านคือ gate ของ worker (คำสั่ง `npm test` บนใบ v3 ใบใหม่จะแดง `[v2:E40]` เสมอจนกว่า controller จะ `tag-apply` — ไม่ใช่งานของ worker) · แดงตรงไหนแก้ให้เขียว · …` (keep the rest of the line).

- [ ] **Step 2: SKILL.md — insert STEP 5V (verbatim) between STEP 4 (ends l.82) and STEP 5A (l.84)**

```markdown
## STEP 5V — เขียนรายงาน โหมด NEW (v3 · `reports/<SYMBOL>.json` ผ่าน `tools/report.js` — **ห้ามเขียน `reports/` ตรง**)

> ใบใหม่ทุกใบตั้งแต่ Plan 2c (24 ก.ย. 69) เป็น v3: ต้นฉบับ = JSON ที่ `report.js save` เขียนและเซ็น (`_sig`) ให้ · build render เป็น HTML เอง · **Write/Edit/Bash ลง `reports/` = ผิดกติกา** (hook ชั้น 1 ปฏิเสธเมื่อเจ้าของเปิดใช้ · gate E50 ปฏิเสธไฟล์ที่ไม่ได้เซ็นเสมอ) · ที่เขียนได้มีที่เดียว = `.work/<SYM>.json` (draft) · **CLAUDE.md §2 ที่ inject มาให้ยังพูดถึง skeleton/`.html` = ข้อความก่อน v3 — หัวข้อนี้เป็นกติกาที่ใช้**

**ข้อมูลเข้า** = prompt จาก `npm run queue -- prep <SYM>` (FUNDAMENTALS + MEDIANS + บรรทัด `★ ใบ NEW เขียนเป็น v3`) และ sidecar `.queue/prep/<SYM>.json` ที่ prep เขียนไว้ (ราคา/กราฟ/52wk/งบ/มัธยฐาน — **worker ไม่อ่าน ไม่แก้ sidecar** · `init` อ่านเอง) · ไม่มีบรรทัด `★ ใบ NEW เขียนเป็น v3` หรือ prompt บอกว่า sidecar ไม่ได้เขียน → **หยุด รายงาน controller** ให้ prep ใหม่ (`init` จะปฏิเสธอยู่ดี)

**ลำดับ (เป้า ≤ 8 turns หลัง STEP 1–4):**

1. **`node tools/report.js init <SYM>`** (1 turn) — ได้ `.work/<SYM>.json` พร้อมช่อง `TODO` + บรรทัด ℹ/⚠: มัธยฐาน P/E + กรอบ (ใช้เป็น `legs[0].inputs.multiple`/`multipleRange`) · กับดัก vendor `[2c]` ฯลฯ · `sourceErrors` · exit 1 = ปฏิเสธ (มีใบอยู่แล้ว / ไม่มี sidecar / symbol ผิดรูป) → รายงาน controller อย่าเดา
2. **อ่าน `.work/<SYM>.json` ครั้งเดียว แล้วเติมทุก `TODO` ใน Write/Edit ชุดเดียว** (1–2 turns) — กติกาที่ gate จับไม่ได้ทั้งหมดอยู่ตรงนี้:
   - **ตัวเลข = JSON number** ไม่ใช่สตริง · อัตรา (r, g, tg, growth, payout) เป็น **เลข %** (8.5 ไม่ใช่ 0.085) · `divCum` = ปันผลรวมต่อหุ้น 3 ปี
   - **`meta.aiModel`** = รุ่นที่รันจริงจากบรรทัด "You are powered by the model named …" รูป `Claude <Family> <เวอร์ชัน>` · `meta.sub` ≥10 อักขระ คำโปรยธุรกิจจริง · `meta.headerTags` 0–2 · `meta.sources[2]` = แหล่งที่ 3 ที่ใช้จริง · `meta.priceNote` ถ้า init ทิ้ง TODO (ราคา 2 แหล่งต่าง >2%) · **TH: ยืนยันกระดานที่ set.or.th** — Yahoo ให้ `exchange: "SET"` ทั้ง SET และ mai ⇒ mai ต้องแก้เป็น `"MAI"` เอง · `exchange` เป็น TODO = เติมจากแหล่งปฐมภูมิ
   - **ทุกขา `legs[]`**: `method` (`pe`/`pbv`/`ddm`/`ddm2`/`dcf`/`ri`/`fcfyield`/`ps`/`evsales`/`evebitda`/`pfcf`/`pffo`/`declared`) · `label` ธรรมดา (ห้าม `{ } < >`) · **`inputs` ครบชุดของ method นั้นตาม `S.LEG_INPUTS`** (`tools/v3/schema.js`) — ขาที่ init ทิ้ง `method: TODO` มี `inputs: {}` ว่าง **ต้องเติมเอง** (เช่น `ddm` = `{g, r}` · `dcf` = `{g1, years1, tg, r, rfCurrency}` · `declared` = `{value, basis}`) — จุดที่ e2e ล้มครั้งแรก · `role: "fv"` (ขาที่เข้าเฉลี่ย) หรือ `"context"` (ขาเปรียบเทียบ — ห้ามเข้าเฉลี่ย · `multipleSource: "current"` ใช้ได้เฉพาะ context) · **`family` บนทุกขา `fv`** (`market` = ตัวคูณที่วัดจริง · `rg` = ddm/dcf/ri/pbv-justified · `asset` = sotp/nav) — **ไม่ใส่ = ขาถ่วงเท่ากันเงียบ ๆ ขัดกฎ 0.4c-bis** (STEP 3) · ขาเดียวกันตระกูล (r,g) ต้อง `family: "rg"` ทั้งคู่ · `note` = ที่มาของสมมติฐาน
   - **`legs[0].inputs.multiple` มาจาก MEDIANS** (บรรทัด ℹ ของ init) **ไม่ใช่ P/E ปัจจุบัน** (W18) · `multipleSource: "median5y"` + `medianWindow` ตามที่ init ใส่ · ตัวคูณปัจจุบันเป็นบริบทได้ในขา `context` เท่านั้น
   - `scenarios.cases[3]` = `growth` %/ปี · `exitMultiple` · `divCum` · `desc` · `scenarios.note` — Base สอดคล้อง FV · Bear de-rating จริง (STEP 4)
   - `prose` 8 ช่อง · `catalysts`/`risks` ≥3 · `analyst.rating` ถ้า TODO · `fundamentals.epsBasis` แก้ถ้าฐานไม่ใช่ GAAP TTM (`adj-ttm`/`fy`/`ifrs`) · `fundamentals.epsForward` เติมเองเมื่อ init ไม่ใส่เพราะกับดัก `[2c]` (ใช้ **FY ถัดไปจริง** ไม่ใช่ FY ถัดไปอีกปี)
   - **ห้ามเขียน** `market` · `_sig` · `meta.themeLegacy` · `{{rd:…}}` (ไวยากรณ์ v2 = E51) · `fvWeights` (ปล่อย null ให้ family ถ่วง — ใส่เองเฉพาะกรณี 0.4c ที่ต้องอธิบาย) · markup ใน prose ได้แค่ `<b> <i> <br>` และ `**…**`
3. **สีแบรนด์**: `node tools/pick-brand.js <SYM> "#hex" --auto` **ครั้งเดียว** (เลือก hex จาก `tools/brand-colors.md` · ชนแล้วสคริปต์สลับเฉดให้เอง) — **ไม่ต้อง copy theme/GDOTS** ที่มันพิมพ์ (ใบ v2) · save/build อ่าน `tools/seeds.json` เอง · prompt มี "=== BRAND … ลง seeds.json แล้ว" = ข้ามขั้นนี้ · ห้ามแก้ seeds.json มือ
4. **`node tools/report.js show <SYM>`** (1 turn) — ตาราง token ทุกตัวพร้อมค่าที่ render (`{{px}}` `{{fv}}` `{{fvLow}}` `{{fvHigh}}` `{{mos}}` `{{mos20}}` `{{mos30}}` `{{upside}}` `{{pe}}` `{{yield}}` `{{mcap}}` `{{chg}}` `{{priceDate}}` `{{baseEps}}` `{{analyst.target}}` `{{analyst.pct}}` `{{scn.bear|base|bull.tgt|ret|div|end|exit}}` `{{leg1..4}}` `{{leg1..4.multiple}}` `{{analysisDate}}` `{{range52w.lo|hi}}` …) — **ตัวเลขผูกราคา/FV/MOS/เป้า/ขา/ฉาก ทุกตัวใน prose/note/desc/hint/catalysts/risks ต้องเป็น token** ไม่ใช่เลขพิมพ์เอง (กติกา B จับแค่ทศนิยมตรงเป๊ะ — เลขจำนวนเต็ม `MOS 16%` หรือค่าขา `$86.80` หลุด gate แต่ **ยังผิดกติกา** และจะค้างเมื่อราคาเปลี่ยน) · เลขที่มีหน่วย (M/B/ล้าน/พันล้าน) พิมพ์ได้ · เลขประวัติที่บังเอิญเท่าค่าปัจจุบัน → `{{lit:ชื่อ}}` + `meta.litReasons["ชื่อ"]` (≥5 อักขระ · ≤2 ตัวไม่งั้น W30)
5. **`node tools/report.js save <SYM>`** (1–2 turns) — พิมพ์ **ทุก** error พร้อม path ในรอบเดียว (`✗ [E51] legs[1].inputs.value: …`) → แก้ทุกจุดใน Edit ชุดเดียวแล้ว save ใหม่ · `⚠ [กติกา B] path: "…" ใกล้ {{tok}}` = แปลงเป็น token · ผ่าน = `✓ reports/<SYM>.json — FV … · MOS …` และไฟล์ถูกเซ็นแล้ว · **`save ✓` = gate ของ worker จบ** — **ไม่ต้องรัน `npm test -- <SYM>`** (มันรัน gate ตัวเดียวกันแต่ปล่อย `v2:E40` ที่แดงเสมอจนกว่า controller จะ `tag-apply`) · ห้ามแก้ `reports/<SYM>.json` ที่ save แล้วด้วยมือ — แก้ draft แล้ว save ใหม่ (save ปฏิเสธ `--light` บนใบใหม่)
6. **คืนงาน**: `reports/<SYM>.json` บันทึกแล้ว · FV/กรอบ/MOS · แหล่งที่ใช้ · `meta.aiModel` ที่ประทับ · hex ของ seed · บรรทัด `TAGS: <slug> <slug>` (2–3 slug จาก `tags-vocab.json` — **ห้ามเขียน `tags.json`**) · **ไม่ git** — controller เป็นคน `tag-apply` → `postcheck` → ship

**คำเตือน gate ที่จะเห็นบ่อย**: `E51 … sentinel TODO` (เติมไม่ครบ/ใส่สตริงในช่องตัวเลข) · `E51 legs[i].inputs.<k>` (inputs ไม่ครบชุดของ method) · `E51 legs: family` (ขา fv มี family ไม่ครบ/ไม่ตรง method) · `E17` (ขา fv <2) · `W18` (ตัวคูณเป้า ≈ ตัวคูณปัจจุบัน ≤7% — เปลี่ยนที่มาของตัวคูณ) · `W25` (forward P/E ≈ ตัวคูณเป้า — ถ้าเป็นความบังเอิญของหุ้นตัวนั้น คงขามัธยฐานแล้วเขียนกำกับใน note) · `W32` (|MOS|>40% ต้องมีขา fv ที่ไม่ใช่ rg) · `W31` (ตัวเลขเงินพิมพ์เองเยอะ — แปลงเป็น token) · `meta.themeLegacy: ไม่มีสีแบรนด์` (ยังไม่รัน pick-brand)
```

- [ ] **Step 3: `_template/agent-prompt.md` (exact replacements)**

l.4: replace `**NEW** = ยังไม่มีรายงาน` with `**NEW** = ยังไม่มีรายงาน → **ใบ v3** (`report.js` · SKILL STEP 5V)`.

l.21: replace `เขียน \`reports/{{SYMBOL}}.html\` ของตัวเองเท่านั้น · self-check \`npm test -- {{SYMBOL}}\` ต้อง 0 error` with `NEW = \`node tools/report.js init/save {{SYMBOL}}\` เท่านั้น (SKILL STEP 5V · **ห้ามเขียน \`reports/\` ด้วย Write/Edit/Bash** · \`save ✓\` = gate) · UPDATE = แก้ \`reports/{{SYMBOL}}.html\` ของตัวเองเท่านั้น + self-check \`npm test -- {{SYMBOL}}\` ต้อง 0 error`.

l.26: replace `\`<meta name="ai-model" content="Claude <รุ่นที่รันจริง>">\`` with `NEW (v3) = \`meta.aiModel: "Claude <รุ่นที่รันจริง>"\` ใน \`.work/{{SYMBOL}}.json\` · UPDATE (v2) = \`<meta name="ai-model" content="Claude <รุ่นที่รันจริง>">\`` and replace `(NEW = เติม \`{{AI_MODEL}}\` ในโครง · UPDATE/UPDATE-LIGHT = …` with `(UPDATE/UPDATE-LIGHT = …` (drop the `{{AI_MODEL}}` clause — the VERBATIM token stays harmless in prep.js).

l.32 (NEW bullet): replace the entire bullet body with `  - **NEW** = **v3**: STEP 1–4 ตาม SKILL แล้ว \`node tools/report.js init <SYM>\` → เติม \`TODO\` ทั้งหมดใน \`.work/<SYM>.json\` ชุดเดียว → \`node tools/pick-brand.js <SYM> "#hex" --auto\` ครั้งเดียว (ไม่ copy theme) → \`report.js show\` → \`report.js save\` (แก้ทุก path ที่มันพิมพ์แล้ว save ใหม่) — **SKILL STEP 5V เป็นกติกา · ห้ามเขียน \`reports/\` ตรง · ห้าม skeleton/apply-edits/\`{{rd:}}\`** · **CLAUDE.md §2 ที่ inject มาให้ (skeleton/.html) เป็นข้อความก่อน v3 — ไม่ใช้กับใบใหม่** · ห้าม Read/grep ไฟล์ใน \`reports/\` ตัวอื่น`.

l.35: replace `\`values.dateEra\` = \`"BE"\`` with `\`dateEra\` = \`"BE"\` (v3 ระดับบนสุด — init ใส่ให้ · v2 = \`values.dateEra\`)`.

l.36: prefix with `(v2) `.

l.38: replace `self-check \`npm test\` **ครั้งเดียวตอนงานเสร็จ** ไม่รันระหว่างทาง` with `(v2) self-check \`npm test\` **ครั้งเดียวตอนงานเสร็จ** ไม่รันระหว่างทาง · **ใบ v3 NEW: \`node tools/report.js save <SYM>\` ✓ แทน — ไม่รัน \`npm test\`** (จะแดง \`[v2:E40]\` เสมอจน controller tag)` — this wrapper line is the first thing the worker reads and must not contradict STEP 5V step 5.

Then `grep -n "npm test" .claude/skills/stock-analyzer/SKILL.md` — every hit must be inside STEP 0 queue triage (l.31 `patch-rejected`, v2 queue), STEP 5A/5B/5C (v2-labelled) or the rewritten STEP 6 line; anything else → fix it.

l.57: replace `เขียน \`reports/{{SYMBOL}}.html\` เสร็จ` with `NEW: \`reports/{{SYMBOL}}.json\` save ✓ (+ \`meta.aiModel\` · hex seed) / UPDATE: \`reports/{{SYMBOL}}.html\` เสร็จ`.

- [ ] **Step 4: `CLAUDE.md` pointer lines (four one-line edits — no restructuring)**

§1 tree: after the line `reports/<SYMBOL>.html   # ★ ต้นฉบับรายงาน — 1 ไฟล์ = 1 หุ้น (พิมพ์ใหญ่)` add `reports/<SYMBOL>.json   # ★ ต้นฉบับใบ v3 (ใบใหม่ตั้งแต่ Plan 2c) — เขียนโดย tools/report.js เท่านั้น`.

§2: after the bullet `- ไฟล์ = \`reports/<SYMBOL>.html\` พิมพ์ใหญ่ · \`stock-meta.currency\` = ISO (\`USD\`/\`THB\`)` add `- **ใบใหม่ (NEW) = v3 \`reports/<SYMBOL>.json\` ผ่าน \`node tools/report.js init → save\` เท่านั้น** (stock-analyzer SKILL **STEP 5V**) · skeleton/\`.html\` ข้างบน = ใบ v2 เดิม (UPDATE จน Plan 3) · **ห้ามเขียน \`reports/\` ตรงทุกกรณี** (hook ชั้น 1 + gate \`_sig\`/E50) · worker ไม่รัน \`npm test\` บนใบ v3 ใบใหม่ (\`save ✓\` = gate · \`v2:E40\` เป็นของ controller หลัง \`tag-apply\`)`.

§7: replace `- ❌ ชื่อไฟล์รายงาน = \`<SYMBOL>.html\` พิมพ์ใหญ่ ไม่มีเว้นวรรค` with `- ❌ ชื่อไฟล์รายงาน = \`<SYMBOL>.html\` (v2) / \`<SYMBOL>.json\` (v3) พิมพ์ใหญ่ ไม่มีเว้นวรรค — ห้ามมีทั้งสองไฟล์ของหุ้นเดียว`.

§10 first bullet: append ` · **ใบ v3 (Plan 2c+)**: ต้นฉบับ JSON · render/theme/gate ผ่าน \`tools/v3/*\` + \`_template/v3/render.js\` · เขียนด้วย \`tools/report.js\` เท่านั้น → \`docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md\` §6`.

Then run `node tools/gen-docs.js --check` — the generated verify-steps block is untouched; if `--check` fails, revert to the generated text (do not hand-edit the generated block).

- [ ] **Step 5: stock-controller SKILL + orchestration.md**

`.claude/skills/stock-controller/SKILL.md` §3: add one bullet after the pick-brand/lock bullet: `- **ใบใหม่ = v3 (Plan 2c+)** ลำดับ controller: \`npm run queue -- prep <SYM> --model opus\` (หลังตลาดปิด — priceDate จะแช่แข็งจน P5) → spawn worker 1 ใบ (Opus · prompt = \`.queue/prep/<SYM>.md\` · บอกตรง ๆ ว่า §2 ที่ inject มาก่อน v3 · SKILL STEP 5V เป็นกติกา) → worker คืน \`save ✓\` + \`TAGS:\` → \`node tools/tag-apply.js <SYM> <slug…>\` → \`npm run queue -- postcheck <SYM> --model opus\` → **ตรวจชั้น 0 เองที่ gate ไม่ทำ**: \`family\` ครบทุกขา fv · \`legs[i].inputs\` ครบชุด · W32 · dispersion 0.4c >2x · หน้าต่าง/จุดของ \`medians\` (checkFyYears เงียบบน v3) · \`meta.aiModel\` ตรงรุ่นที่ spawn · TH กระดาน SET/mai → \`npm run queue -- ship <SYM> --no-push\` เมื่ออยู่บน branch (flow PR) หรือ \`ship <SYM>\` บน main`.

§9: add one line: `- **ใบ v3**: cron ข้าม (\`v3-skipped: N\` · \`update-prices --write --force <v3>\` exit ≠0 "v3 cron = Plan 3") จน P5 — เส้นตาย #62 = \`market.priceDate\` + 120 วัน (E27) · เป้า +45 (W09)`.

`docs/hook-setup.md`: every "paste ตอน cutover 2c" / "ก่อน paste snippet ตอน cutover 2c" → "paste **หลัง Plan 2c-i merge** (เอกสาร v3 NEW อยู่บน main แล้ว — paste ก่อนหน้านั้น = บล็อก NEW v2 ทุก session โดยยังไม่มีทางเลือก)"; keep the `claude -p` proof block as is.

**Reviewer instruction for this task (controller copies into the review dispatch):** besides the diff, the reviewer must Read `.claude/skills/stock-analyzer/SKILL.md` STEP 0 → STEP 5V → STEP 6 and `_template/agent-prompt.md` top to bottom **as a v3 NEW worker would**, and list every sentence outside a v2-labelled block that could still be read as "write `reports/<SYM>.html`", "start from skeleton", "apply-edits", "paste theme", or "run `npm test`". Zero such sentences = pass.

`docs/orchestration.md` l.15: replace `<meta ai-model>` source wording with `ป้ายรุ่น = v2 \`<meta name="ai-model">\` / v3 \`meta.aiModel\` (ship อ่านผ่าน \`report-source.metaLite\`)`. l.31: replace `inline = fetch+write เอง` with `inline = fetch + เขียนเอง (v2) · ใบใหม่ = \`report.js init/save\` (v3)`.

- [ ] **Step 6: Verify the docs**

Run:
```bash
rtk proxy node test/docs-test.js && node tools/gen-docs.js --check && echo GEN-OK
grep -n "STEP 5V" .claude/skills/stock-analyzer/SKILL.md _template/agent-prompt.md CLAUDE.md .claude/skills/stock-controller/SKILL.md | wc -l
grep -n 'Write `reports/<SYMBOL>.html`\|Write `reports/<SYM>.html`' .claude/skills/stock-analyzer/SKILL.md _template/agent-prompt.md
```
Expected: docs-test ✓ · `GEN-OK` · STEP 5V referenced ≥ 6 times across the four files · the last grep prints only lines inside STEP 5A (v2-labelled) or none in agent-prompt.md.

- [ ] **Step 7: DIST-PROOF + commit**

Run the DIST-PROOF block → `DIST IDENTICAL` (docs-only, must hold).
```bash
git add .claude/skills/stock-analyzer/SKILL.md _template/agent-prompt.md CLAUDE.md .claude/skills/stock-controller/SKILL.md docs/orchestration.md
git commit -m "docs(v3): 2c-i — stock-analyzer STEP 5V (v3 NEW via report.js) · agent-prompt/CLAUDE.md/stock-controller/orchestration pointers"
```

---

### Task 3: Remove the tripwire (last infrastructure commit) + docs bookkeeping

**Files:**
- Delete: `test/v3/no-json-reports.test.js`
- Modify: `docs/open-items.md` (#49 → closed with "Plan 2c-i (tripwire removed)" · #62 deadline text → `แข็ง = market.priceDate ของใบ exit + 120 วัน (E27) · เป้า = +45 วัน (W09) — วัดจาก check-v3 24 ก.ย. 69`)
- Modify: `docs/decisions.md` (append "Report v3 Plan 2c-i" block at the end of §10: split 2c-i/2c-ii + why · STEP 5V as carrier + snapshot rule · save ✓ = worker gate, E40 = controller · `--no-push` semantics + §5 wording gap · tripwire removal order · hook paste after 2c-i · P5 deadline re-measured · Task 0 probe results OGE/M-CHAI)
- Modify (comment only): the line-3 comments of `test/v3/{report-source,scanners-verify,report-cli,scanners-cron}.test.js` that mention `no-json-reports` → `(tripwire ถอดแล้วใน Plan 2c-i — กติกา "ห้ามสร้าง reports/*.json ใน test" ยังอยู่)`.

**Interfaces:** Consumes Task 1–2 commits (they must be in HEAD before this one). Produces nothing new — `node test/v3-test.js` simply no longer runs the tripwire.

- [ ] **Step 1: Prove the tripwire is the only thing that references itself at runtime**

Run: `grep -rn "no-json-reports" test/ tools/ build.js package.json .githooks .github 2>/dev/null`
Expected: only the file itself and the four line-3 comments. Anything else → stop and report.

- [ ] **Step 2: Delete + reword + docs**

`git rm test/v3/no-json-reports.test.js`; reword the four comments; edit open-items #49/#62; append the decisions block (Thai, same style as the Plan 2b block; ≤ 25 lines).

- [ ] **Step 3: Verify**

Run: `rtk proxy node test/v3-test.js 2>&1 | grep -c "^✓"` → 20 files minus 1 plus `plan2c-code` = **20** · `rtk proxy npm run verify` exit 0 · `ls reports/*.json 2>/dev/null | wc -l` → 0 · `node test/docs-test.js` ✓.

- [ ] **Step 4: Commit**

```bash
git add -A test/v3 docs/open-items.md docs/decisions.md
git commit -m "chore(v3): 2c-i — remove tripwire no-json-reports (last infrastructure commit before the first v3 report) · open-items #49 closed, #62 deadline re-measured · decisions §10 Plan 2c-i"
```

---

### Task 4: Exit proof (2c-i)

**Files:** none new (report only).

- [ ] **Step 1: Full gate + hook-env**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan2c
rtk proxy npm run verify 2>&1 | tail -3 && node tools/gen-docs.js --check && echo GEN-OK
GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js >/dev/null && echo HOOKENV-OK
rtk proxy node test/v3/tokens-corpus.test.js 2>&1 | tail -1
ls reports/*.json 2>/dev/null | wc -l; rtk proxy git status --short reports/ reports.json .work .queue tags.json tools/seeds.json .claude/settings.json | wc -l
```
Expected: verify exit 0 (20 steps) · GEN-OK · HOOKENV-OK · `compute() accepted 909/909` · `0` · `0`.

- [ ] **Step 2: DIST-PROOF** → `DIST IDENTICAL`.

- [ ] **Step 3: prep dry-run proves the new prompt (offline, temp QUEUE_DIR)**

```bash
q=$(mktemp -d); QUEUE_DIR=$q node test/v3/_prep-child.js ok >/dev/null && grep -c "STEP 5V" $q/prep/ZZZQ.md && grep -c "update-prices.js --write --force" $q/prep/ZZZQ.md; rm -rf $q
```
Expected: `1` then `0`.

- [ ] **Step 4: Worker-view read-through (the check the gate cannot do)**

Read `.claude/skills/stock-analyzer/SKILL.md` STEP 0 → STEP 5V → STEP 6 and `_template/agent-prompt.md` as a v3 NEW worker would; list in the report every remaining sentence that could be read as "write reports/<SYM>.html" outside a v2-labelled section. Expected: none.

- [ ] **Step 5: Report** — paste every command + output; note `git log --oneline origin/main..HEAD` (expected 3 commits).

## Self-review

- **Spec coverage:** §6.6 2c-i bullets → Task 1 (code), Task 2 (docs), Task 3 (tripwire + docs), Task 4 (proofs). §13 item 14 (save = gate) → Task 2 Step 1 (STEP 6 line) + Step 2 (5V step 5). §11 P4b 2c-i exit column → Task 4.
- **Placeholder scan:** none — every edit has its replacement text.
- **Type consistency:** `shouldPush(o)` / `noPush` used identically in Task 1 test and implementation; the 5V pointer sentence is byte-identical in Task 1 (prep) and Task 2 (SKILL heading it points at).
- **Review Focus:** 1 → Task 2 Step 6 grep + Task 4 Step 4; 2 → Task 1 test group (1) + Task 4 Step 3; 3 → Task 1 test group (2) (pure `shouldPush`; the flow guard is reviewed by reading); 4 → Task 1 Step 4 (queue-test prep fixtures unchanged); 5 → Task 4 Step 1.
