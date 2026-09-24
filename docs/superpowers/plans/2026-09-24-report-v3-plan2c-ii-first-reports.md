# Report v3 Plan 2c-ii — first two real v3 reports (OGE · M-CHAI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The "implementer" of Tasks 1–2 is a stock-analysis worker (Opus), not a code implementer: it is spawned with the prep `.md` as its prompt and follows `stock-analyzer/SKILL.md` STEP 5V; the "review" is the controller sequence tag-apply → postcheck → layer-0 checks → advisor.**

**Goal:** Publish the first two v3 reports (`reports/OGE.json`, `reports/M-CHAI.json`) written end-to-end by workers through `node tools/report.js init → save`, with the whole site + cron rehearsed on them before the PR. This is the **first visible production change** of v3.

**Architecture:** Runs only after Plan 2c-i is merged to main (docs + `--no-push` + tripwire removed). Fresh `prep --model opus` per stock after its market closes (the price is frozen until P5); one worker per spawn, sequential; every report goes through the controller checks the gate cannot do, then advisor, then `ship <SYM> --no-push` on the branch; rehearsal of `npm run verify`, `check-site` and the cron sequence in a scratch worktree; PR → advisor → merge → deploy → owner design review.

**Tech Stack:** `npm run queue -- prep|postcheck|ship` · `tools/report.js` · `tools/tag-apply.js` · `node tools/spotcheck.js` · `.github/workflows/update-prices.yml` sequence run by hand · Agent tool with `model: "opus"`.

**Spec:** `docs/superpowers/specs/2026-09-24-report-v3-json-source-design.md` §6.6 (2c-ii bullets), §6.1, §11 P4b, §12 (P4b turn measurement), §13 items 14–15.

## Global Constraints

- **Precondition:** Plan 2c-i merged (`git log origin/main --oneline | grep "remove tripwire"` non-empty). Worktree `/Users/somchai.s/Downloads/stock-v3-plan2c-ii`, branch `feat/report-v3-plan2c-ii` from `origin/main`. The **25 ก.ย. 04:00 ไทย cron run must have landed on main** before any 2c merge (one variable per run) — check `gh run list --workflow update-prices --limit 1`.
- **Timing:** `prep OGE` only when US is closed (after ~04:00 ไทย, before 20:30 ไทย); `prep M-CHAI` only after 16:30 ไทย. The `priceDate` each prep writes starts the P5 clock: hard = +120 days (E27), target = +45 (W09). Record both dates in open-items #62.
- **Worker:** Opus, effort high, one stock per spawn, sequential (Task 2 starts only after Task 1's report is shipped on the branch). Prompt = `.queue/prep/<SYM>.md` verbatim + the three controller lines in Task 1 Step 3. Worker never pushes, never calls the advisor, never spawns subagents, never writes `reports/`, `tags.json`, `seeds.json` by hand. Record turn count per worker (from the Agent result usage) for spec §12.
- **Controller must not** hand-edit `reports/*.json` (use `report.js export/save` only if a fix is needed — and then re-run postcheck), nor write `tags.json` except via `tag-apply`.
- Zero changes to `reports/*.html`, `reports.json` other than the two new entries (build writes it), `.claude/settings*.json`.
- If any step's advisor verdict is "do not publish" twice, or `prep` exits 2 (price conflict), or the M-CHAI board cannot be confirmed from set.or.th → stop and ask the owner.

## Review Focus

1. A saved report whose `family` is missing on an fv leg passes the gate with equal weights — the controller check in Step 5 is the only net.
2. `legs[i].inputs` complete for the chosen method (E51 catches absence; it cannot catch a wrong-unit rate such as 0.085 instead of 8.5 — check `report.js show` values for plausibility: FV within 0.3×–3× price).
3. M-CHAI `meta.exchange` = SET vs MAI from set.or.th (Yahoo cannot tell); wrong board renders silently.
4. `meta.aiModel` must equal the model actually spawned (Opus) — `postcheck --model opus` and ship's guard both read it; a Sonnet stamp on an Opus run is a lie the gate cannot see.
5. The cron rehearsal must show `v3-skipped: 2` and no `.json` diff; if `update-prices --write` touches a `.json`, P5 assumptions are wrong — stop.

---

### Task 1: OGE (US) — prep → worker → controller checks → advisor → ship --no-push

**Files:** produced: `reports/OGE.json`, `tags.json` (+OGE), `tools/seeds.json` (+OGE), `.queue/state.json` (queue bookkeeping). Report: `.superpowers/sdd/<workspace>/task-1-report.md`.

- [ ] **Step 1: Fresh prep (US closed)**

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan2c-ii && git pull -q --rebase origin main
rtk proxy npm run queue -- prep OGE --model opus --brand "#hex" 2>&1 | tail -14      # hex from tools/brand-colors.md (OGE Energy — utility; brand primary if listed, else a utility shade)
node -e "const s=require('./.queue/prep/OGE.json');console.log(s.exchange,s.currency,s.market.px,s.market.priceDate,'dP',s.crossVerify.dP,'srcErr',JSON.stringify(s.sourceErrors),'med',s.medians.median,s.medians.window,s.medians.curErr)"
grep -c "STEP 5V" .queue/prep/OGE.md; grep -c "update-prices.js --write --force" .queue/prep/OGE.md; grep -c "=== BRAND" .queue/prep/OGE.md; node -e "console.log(!!require('./tools/seeds.json').OGE)"
```
Expected: exit 0 · `NYSE USD <px> <yesterday's date> dP 0 srcErr null med ~17.2 FY2021–FY2025 null` · `1` · `0` · `1` (the `=== BRAND … ลง seeds.json แล้ว` block — STEP 5V's own skip-condition for pick-brand) · `true`. Exit 2 → stop (CLAUDE.md §2). Record `priceDate` → #62. (`--brand` runs pick-brand inside prep-stock under the lock; the seed lands in `tools/seeds.json` and ships with the report commit.)

- [ ] **Step 2: (folded into Step 1 via `--brand` — advisor 24 ก.ย. 69: one fewer thing to tell the worker.)**

- [ ] **Step 3: Spawn the worker (Opus, effort high)**

Agent prompt = the full text of `.queue/prep/OGE.md`, followed by exactly these lines:
```
— controller notes (2c-ii) —
1. CLAUDE.md §2 ที่ inject มาให้คุณ (skeleton / reports/<SYM>.html) เป็นข้อความก่อน v3 — กติกาที่ใช้คือ stock-analyzer SKILL **STEP 5V** (อ่านไฟล์ใน worktree นี้) · ห้ามเขียน reports/ ด้วย Write/Edit/Bash ทุกกรณี
2. (สีแบรนด์: prompt มีบล็อก "=== BRAND … ลง seeds.json แล้ว" — STEP 5V ข้อ 3 บอกให้ข้าม pick-brand เอง ไม่ต้องบอกซ้ำ)
3. กับดักที่รู้แล้ว: vendor forward EPS 2.60 = FY2027e (FY2026e = 2.43 คือ "ปีถัดไป" จริง) · forward P/E จาก 2.43 = 18.4x ห่างมัธยฐาน 17.2x เพียง 6.6% ⇒ W25 อาจยิงโดยบังเอิญ — ไม่ใช่สมอตาย คงขามัธยฐานและเขียนกำกับใน note · ใส่ `family` ทุกขา fv · เติม `inputs` ครบชุดของ method ที่เลือก (หน่วย %)
4. คืนงานตามข้อ 6 ของ STEP 5V + จำนวน turn ที่ใช้ (ประมาณจากจำนวนข้อความของคุณเอง)
```
Pin `model: "opus"`. Record the agent id and, from the result, `tool_uses`/turns.

- [ ] **Step 4: tag → postcheck → spotcheck**

```bash
node tools/tag-apply.js OGE <slug slug…>   # from the worker's TAGS: line — review each slug against tags-vocab.json first
rtk proxy npm run queue -- postcheck OGE --model opus 2>&1 | tail -15
rtk proxy npm test -- OGE 2>&1 | tail -3        # now E40 is satisfied → expect 0 error
node tools/spotcheck.js OGE 2>&1 | tail -8
```
Expected: postcheck verdict `ok` (not `review`) · `npm test -- OGE` error 0 · spotcheck no ✗.

- [ ] **Step 5: Controller layer-0 checks (the gate cannot do these)**

```bash
node -e "
const IO=require('./tools/v3/io.js'),C=require('./tools/v3/compute.js');const d=IO.read('reports/OGE.json');
const fv=d.legs.filter(l=>l.role==='fv');
console.log('fv legs',fv.length,'family',fv.map(l=>l.method+':'+(l.family||'MISSING')).join(' '));
console.log('inputs',d.legs.map(l=>l.method+'='+JSON.stringify(l.inputs)).join(' | '));
console.log('aiModel',d.meta.aiModel,'exchange',d.meta.exchange,'epsBasis',d.fundamentals.epsBasis,'epsFwd',d.fundamentals.epsForward);
const v=C.compute(d,{seeds:require('./tools/seeds.json')});const vals=fv.map(l=>v.legs.find(x=>x.i===d.legs.indexOf(l))).filter(Boolean).map(x=>x.value);
console.log('fv',v.fv,'range',v.fvLow,v.fvHigh,'mos',v.mos,'legValues',vals.join(','),'dispersion',(Math.max(...vals)/Math.min(...vals)).toFixed(2));
console.log('medians window',d.legs[0].inputs.medianWindow,'multiple',d.legs[0].inputs.multiple);"
```
Checklist (write each result in the report): every fv leg has `family` · `inputs` complete and rates in % · dispersion ≤ 2.0 (else 0.4c: headline = market leg, note it) · |MOS| ≤ 40% or a non-rg fv leg exists (W32) · `meta.aiModel` = `Claude Opus 5` (or the exact spawned model) · `medianWindow` = FY2021–FY2025 and multiple ≈ 17.2 · `epsForward` = 2.43 not 2.60 · open `dist/OGE.html` after `node build.js` and read the 8 sections once for sense (prose matches numbers; scenario Base ≈ FV).

- [ ] **Step 6: Advisor before publish** — present Step 4–5 outputs + the worker's turn count. Verdict must be "publish". "Fix" → resume the same worker with the exact findings (max 2 rounds) → repeat Steps 4–6. "Do not publish" twice → stop, ask owner.

- [ ] **Step 7: Ship on the branch (no push)**

```bash
rtk proxy npm run queue -- ship OGE --no-push 2>&1 | tail -6
git log --oneline -1 && git status --short | wc -l
```
Expected: one commit `analyze: add OGE — NEW (MOS …)` touching `reports/OGE.json tags.json tools/seeds.json reports.json`, tree clean. (Ship ran the full `npm run verify` — 20 steps — as its gate.)

---

### Task 2: M-CHAI (TH) — same sequence, after SET close

- [ ] **Step 1: Board check (primary source) before anything else**

WebFetch `https://www.set.or.th/en/market/product/stock/quote/M-CHAI/price` (or the TH page) and record the listing market (SET vs mai) and sector. If unreachable → try `https://www.set.or.th/en/market/product/stock/quote/M-CHAI/company-profile/information`; still unknown → stop, ask owner.

- [ ] **Step 2: Fresh prep (after 16:30 ไทย)**

```bash
rtk proxy npm run queue -- prep M-CHAI --model opus 2>&1 | tail -12
node -e "const s=require('./.queue/prep/M-CHAI.json');console.log(s.exchange,s.currency,s.market.px,s.market.priceDate,'dP',s.crossVerify.dP,'srcErr',JSON.stringify(s.sourceErrors),'med',s.medians.median,s.medians.window,s.medians.points,s.medians.curErr,'dps',s.dps,'epsTTM',s.vendor.epsTTM)"
```
Expected: `SET THB <px> <today> dP ≤2 …`. First real TH pass of `exchangeCode`/`--th` `--json`: if `exchange` is null or `currency` ≠ THB or `sourceErrors` non-null → record it; null exchange is fine (worker fills from Step 1). `medians.points` < 3 or `curErr` set → the worker must not use a pe leg from medians (tell it in the notes). Exit 2 → stop.

- [ ] **Step 3: Brand seed** — `node tools/pick-brand.js M-CHAI "#hex" --auto` (hospital brand; check `tools/brand-colors.md`).

- [ ] **Step 4: Spawn worker (Opus)** — same three controller lines as Task 1 Step 3, replacing note 3 with: `กระดานจริง = <SET|mai จาก set.or.th> ⇒ meta.exchange = "<SET|MAI>" (Yahoo ให้ SET ทั้งสองกระดาน) · medians: <ผลจาก Step 2 — ใช้ได้/ใช้ไม่ได้> · หุ้นไทย: dateEra BE · currency THB · ปีงบตามงบจริง · ใส่ family ทุกขา fv · inputs ครบชุด (หน่วย %)`.

- [ ] **Step 5–8:** identical to Task 1 Steps 4–7 with `M-CHAI` (postcheck, npm test after tag, spotcheck, layer-0 node one-liner, advisor, `ship M-CHAI --no-push`). Additional TH checks: `meta.exchange` matches Step 1 · `currency` THB everywhere in `show` · `fundamentals.fy.period` matches the Thai fiscal year in the statements.

---

### Task 3: Whole-site + cron rehearsal · docs · PR

- [ ] **Step 1: Rehearse in a scratch worktree (never on main)** — run while **both markets are closed (04:00–10:00 ไทย)**: `update-prices --write` fetches 909 live quotes and `isIntradayQuote` skips would muddy the output; `v3-skipped: 2` itself is timing-independent.

```bash
cd /Users/somchai.s/Downloads/stock-v3-plan2c-ii
S=/Users/somchai.s/Downloads/stock-v3-plan2c-ii-scratch; git worktree add --detach "$S" HEAD >/dev/null; cd "$S"
rtk proxy npm run verify 2>&1 | tail -3                              # 20 steps, 0 error
rtk proxy node test/check-site.js 2>&1 | tail -2                     # error 0
rtk proxy node test/update-prices-test.js >/dev/null && echo T1
PRICE_COMMIT_BODY=/tmp/pcb.txt node tools/update-prices.js --write 2>&1 | grep -E "v3-skipped|ข้าม reports/|patch-rejected|✗" | head   # expect "v3-skipped: 2", two ข้าม lines
node build.js >/dev/null && node tools/preserve-dates.js 2>&1 | grep -E "v3|ข้าม" | head -2 && node build.js >/dev/null   # "ข้าม 2 ใบ v3"
rtk proxy npm run verify:cron 2>&1 | tail -2                         # exit 0
git status --short reports/OGE.json reports/M-CHAI.json | wc -l      # 0 — cron did not touch the .json
node tools/dead-ticker-canary.js 2>&1 | grep -E "OGE|M-CHAI|v3" | head -3   # dry run, no --write
ls dist/OGE.html dist/M-CHAI.html && grep -c '"symbol":"OGE"\|"symbol": "OGE"' reports.json
cd /Users/somchai.s/Downloads/stock-v3-plan2c-ii && git worktree remove --force "$S"
```
Paste every line of output in the report. Any `.json` diff, `patch-rejected` on OGE/M-CHAI, or `verify:cron` ≠ 0 → stop and report (P5 assumption broken).

- [ ] **Step 2: Visual check** — `node build.js` in the branch worktree; open `dist/OGE.html`, `dist/M-CHAI.html` and one v2 page (`dist/ZTS.html`) side by side (header stats card, TA chart, vote, footer credit `meta.aiModel`, index card order). Screenshot or describe differences; anything that is not identical layout → note for the owner (design review is theirs).

- [ ] **Step 3: Docs**

`docs/open-items.md` #62: fill the two `priceDate`s and the resulting hard/target dates. `docs/decisions.md` §10: append "Report v3 Plan 2c-ii" block — the two reports (FV/MOS/turn counts), what the layer-0 checks found, the M-CHAI board result, the first-ever TH `--json`/exchangeCode result, the rehearsal numbers (`v3-skipped: 2`), whether the exit workers ran with hook layer 1 active (`grep -c '"hooks"' .claude/settings.json` on this machine at spawn time), and the advisor verdicts. Commit: `docs(v3): Plan 2c-ii — first two v3 reports (OGE, M-CHAI) · rehearsal · #62 dates`.

- [ ] **Step 4: PR** — `git pull --rebase origin main` (only now — `--no-push` skipped rebase). **Expect a `reports.json` conflict, possibly on both `analyze:` commits**: each carries a rebuilt manifest (2 new entries + hashes) while the 25 ก.ย. cron rewrote ~100 hashes in the same file on main. On each conflict: `git checkout --theirs reports.json` is WRONG (that is the branch side during a rebase) — take **main's copy** (`git checkout --ours reports.json`), then `node build.js` (deterministic; regenerates the manifest with both the cron hashes and the new entries), `git add reports.json`, `git rebase --continue`. After the rebase finishes (conflict or not): `node build.js && git status --short` must be **empty**; if `reports.json` shows modified, the rebased manifest is stale → `git add reports.json && git commit --amend --no-edit` on the last commit before pushing. Then `GIT_DIR=$(git rev-parse --absolute-git-dir) node test/v3-test.js`, `rtk proxy npm run verify` once more, push branch, `gh pr create` with: the two `analyze:` commits + docs commit; verify/check-site/cron rehearsal numbers; the layer-0 checklist results; turn counts; "first visible change: 2 new report pages + 2 index cards; every existing page byte-identical" (prove with a DIST-PROOF variant that excludes `dist/OGE.html`, `dist/M-CHAI.html`, `dist/index.html`, `dist/reports.json`, sitemap/og files — list the differing files and confirm they are only those).

- [ ] **Step 5: Advisor pre-merge → `gh pr merge N --merge --repo iam1412/stock-analysis` (standalone) → deploy check** (`gh run list --branch main --limit 1` success · `curl -sI https://gaohoon.com/OGE.html | head -1` 200 · same for M-CHAI) → tell the owner to open both pages beside a v2 page for the design review → memory update (Plan 2c MERGED · P5 hard/target dates · hook paste status) → archive ledger → remove worktree.

## Self-review

- **Spec coverage:** §6.6 2c-ii bullets → Tasks 1–3; §12 P4b turn measurement → Task 1 Step 3/Task 3 Step 3; §13 item 15 (board check, no ADR) → Task 2 Step 1; #62 re-measured deadline → Task 3 Step 3.
- **Placeholder scan:** `<slug slug…>` and `#hex` are runtime inputs the controller reads from the worker/brand list — not plan placeholders; every command otherwise complete.
- **Type consistency:** `ship <SYM> --no-push` (Plan 2c-i Task 1) · `prep <SYM> --model opus` (existing flag) · `postcheck <SYM> --model opus` (existing).
- **Review Focus:** 1–2 → Task 1 Step 5 one-liner; 3 → Task 2 Steps 1/4; 4 → Task 1 Step 5 + postcheck `--model`; 5 → Task 3 Step 1.
