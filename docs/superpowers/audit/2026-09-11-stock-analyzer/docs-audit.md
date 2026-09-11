# Rulebook audit — stock-analysis repo
**Scope:** `CLAUDE.md` · `.claude/skills/stock-analyzer/SKILL.md` · `_template/agent-prompt.md` · `docs/{orchestration,quality-gate,price-refresh,templates,counters,ta-chart}.md` · `DESIGN.md` · `.claude/workflows/analyze-wave.js` · `.githooks/pre-push` · `package.json` · `.github/workflows/*.yml` · `tools/*.js` · `test/*.js` · memory dir `~/.claude/projects/-Users-somchai-s-Downloads-stock/memory/*.md`
**Worktree:** `/Users/somchai.s/Downloads/stock/.claude/worktrees/stock-analyzer-audit-9678cd` (read-only audit, no repo file modified)
**Date:** 11 ก.ย. 2569 (2026-09-11)

## Headline counts

| Deliverable | Count |
|---|---|
| Contradiction pairs (§1) | **17** |
| Stale statements (§2) | **16** (14 tabulated S01–S14 + 2 compound: S15 cron-patch coverage, S16 skeleton tokens) |
| Worker-facing rules audited (§3) | **46** — of which **19 unreachable** on the explicit read path, **26 enforced by no code at all** |
| Rules duplicated in ≥3 places (§4) | **9 clusters** |
| Manual steps per queue-clearing run (§5) | **38 core + 4 conditional = 42**; 14 have a script, **24 depend on the controller remembering** |
| Open/unclosed items still recorded in memory (§6) | **21** |

**Verified-correct counts (not findings, but the caller asked):** `test/check-reports.js` defines **43 E-codes (E01–E43)** and **19 W-codes (W01–W10, W12–W20; W11 was promoted to E36)** = **62 total**. `CLAUDE.md:107` "43 error + 19 warning" is **correct**. `docs/quality-gate.md` table lists exactly those 62 unique codes, none missing, none extra (7 codes appear on 2 rows each, which is why a naive row count gives 69). `npm run verify` (`package.json`) and `.githooks/pre-push` both run **13 steps, in the same order** — those two are in sync.

---

## 1. CONTRADICTIONS (17)

### C01 — sequential vs parallel · **contradicts itself inside one file**
| Says sequential / forbids parallel | Says parallel is allowed |
|---|---|
| `.claude/workflows/analyze-wave.js:3` `description: '… worker 1 ตัว/หุ้น แบบ sequential'` | `.claude/workflows/analyze-wave.js:4` `whenToUse: '… **รันหลาย run ขนานกันได้** (1 หุ้น/run)'` |
| `.claude/workflows/analyze-wave.js:8` `// sequential ตามกติกา CLAUDE.md §3 — ห้าม parallel (เคยพัง rate limit ทั้งเวฟใน W19–W21)` | `CLAUDE.md:46` `รันหลาย run ขนานกันได้ (1 หุ้น/run)` |
| `.claude/skills/stock-analyzer/SKILL.md:9` `กติกา orchestration (เวฟ ≤3 / sequential / …)` | `docs/orchestration.md:31–34` `★ ~~SEQUENTIAL (บังคับ)~~ → ยกเลิกแล้ว 8–9 ส.ค. 2569 · ปัจจุบัน parallel ทำได้` |
| `docs/orchestration.md:27` heading `## 3. Spawn — 1 หุ้น/agent · sequential` | `docs/orchestration.md:63` `★ ข้อห้ามจริง = "หลายหุ้นใน 1 run" ไม่ใช่ "หลาย run พร้อมกัน"` |
| `docs/orchestration.md:36` `— sequential + push รายตัว (ข้อ 4) ทำให้ blast radius = 1 หุ้นอยู่แล้ว` | memory `feedback-sequential-agents.md` `★ parallel ใช้ได้จริง วัดแล้ว 40 ตัว N=3→6` |
| `docs/orchestration.md:42` `เหตุผล per-wave เดิม … หมดไปตั้งแต่บังคับ **sequential**` | |
| `docs/orchestration.md:47` `(sequential ในตัว script แล้ว)` | |

The file that a controller is most likely to read *at dispatch time* (`analyze-wave.js` meta) states both positions three lines apart. **9 leftover "sequential" assertions vs 5 "parallel OK" assertions.**

### C02 — "เวฟ ≤3" leftover
- `.claude/skills/stock-analyzer/SKILL.md:9` — `กติกา orchestration (**เวฟ ≤3** / sequential / push รายตัว …)`
- vs `CLAUDE.md:47` — `จำนวนหุ้นต่อรอบไม่จำกัด (ยกเลิกเวฟละ ≤3 — 12 ก.ค. 69)` and `docs/orchestration.md:36` — `**จำนวนหุ้นไม่จำกัด ทั้งต่อรอบ (เวฟ) และต่อ session** (ยกเลิก "เวฟละ ≤3" 12 ก.ค. 2569 …)`.
SKILL.md is the file every worker reads; it still carries a rule retired 2 months earlier.

### C03 — model for hard stocks: Sonnet+high vs Opus
- `docs/orchestration.md:17` — `**Sonnet เป็น default ทุกชั้น**: controller=Sonnet, worker=Sonnet`
- `docs/orchestration.md:19` — `**หุ้นยาก** (…) → worker **ยังเป็น Sonnet** แต่ตั้ง effort:"high"`
- `docs/price-refresh.md:156` — `(ตัว suspect-split เข้าข่าย "หุ้นยาก" → … + effort high — **ไม่มี Opus แล้ว**)`
- vs `CLAUDE.md:45` — `**Opus = escalate เฉพาะ "หุ้นยาก"** … ส่ง model:"opus" เฉพาะตัวนั้นใน stocks[] (**แก้กติกาเดิม "Sonnet ทุกชั้น" 9 ส.ค. 69**)`, echoed at `CLAUDE.md:97` and, inconsistently, at `docs/orchestration.md:18` + `:60` in the *same file* as `:17`/`:19`.
So `docs/orchestration.md` §2 says both things in adjacent bullets, and `docs/price-refresh.md` — the doc a queue-clearing run is told to follow — states the superseded "no Opus" rule.

### C04 — what an unpinned `model` resolves to
- `CLAUDE.md:45` + `:97`, `docs/orchestration.md:18` + `:59` — `**ไม่ pin = ได้ Opus 5 โดยไม่ตั้งใจ**` (measured 8 ส.ค. 69)
- vs memory `ai-model-stamping.md:20` — `**probe 11 ก.ย. 2569 (ขัดกับ CLAUDE.md §3.2)**: … spawn ด้วย Agent tool ไม่ใส่ model → probe ตอบ **"Sonnet 5"**`
Memory itself flags the conflict and (correctly) declines to edit the doc from one probe (`ai-model-stamping.md:21`). The doc is therefore knowingly left asserting something a later measurement contradicts. Note `analyze-wave.js:17` defaults `waveModel = 'sonnet'`, so the *workflow* path can never fall through to harness default — only the raw `Agent` path can.

### C05 — may the **controller** call `advisor` directly?
- `CLAUDE.md:95` (§7) — `controller เรียก \`advisor\` **ตรง** · worker/subagent ห้ามเรียกตรง ต้องผ่าน courier เท่านั้น`
- vs `docs/orchestration.md:20` — `→ **ห้าม controller/worker เรียก advisor ตรง ๆ** · วิธีที่ถูก: controller spawn **courier subagent**`
- vs `docs/price-refresh.md:156` — `controller ปรึกษา advisor **ผ่าน courier subagent** ก่อน spawn (**ห้ามเรียกตรง** — orchestration §2)`
- `docs/orchestration.md:19` also says `**controller ปรึกษา advisor ผ่าน courier subagent ก่อน spawn**`.
Three files say the controller must use a courier; `CLAUDE.md` says the controller calls it directly. The *worker* half is consistent everywhere (`_template/agent-prompt.md:23` states the ban explicitly and correctly labels it policy-not-capability).

### C06 — who is allowed to run `tools/update-prices.js`
- `SKILL.md:38` (STEP 1, UPDATE) — worker runs `node tools/update-prices.js --write --force <SYMBOL>`
- `SKILL.md:112` (STEP 5B ข้อ 3) — worker runs it **again** if `fairValue` changed
- `SKILL.md:123` (STEP 5C ข้อ 1) — worker runs it in the first batch of every UPDATE-LIGHT
- `tools/update-prices.js:19,39,693,775,815` all justify their behaviour with "SKILL สั่ง `--force` ทุกรอบ re-analysis" — i.e. the **tool is designed around the worker running it**
- vs memory `bulk-stock-analysis-workflow.md:3` (frontmatter) — `★ price-flags.json = read-modify-write ไม่มี lock ⇒ worker ขนานรัน update-prices ทำ flag ที่เคลียร์แล้วฟื้น — **controller ต้อง pre-patch ราคาทั้งชุดใน process เดียวแล้วห้าม worker แตะ script**`
- memory `bulk-stock-analysis-workflow.md:47–48` — `1. controller รัน … ทั้งชุดใน process เดียว ก่อน spawn` / `2. prompt worker ทุกใบสั่ง **"ห้ามรัน update-prices ทุกกรณี"** + อธิบายเหตุผล (**ไม่งั้น worker ทำตาม SKILL**)`
This is the sharpest contradiction in the set: memory explicitly predicts the failure ("worker will follow SKILL") and the fix lives **only in memory**. `_template/agent-prompt.md` contains **no such instruction** — so on every run the controller must remember to hand-write a ban that contradicts the skill the worker is simultaneously told to obey. `price-flags.json` is written with `mergeFlags()` → `writeJsonAtomic` (`tools/update-prices.js:599–600`), torn-file-safe but **not** lost-update-safe.

### C07 — does `--force` clear a `not-on-exchange` flag?
- `tools/update-prices.js:622` (comment) — `ถอนได้ 3 ทาง: TradingView เจอ ticker กลับมา · รายงานถูกลบ · **\`--force <SYM>\`** (ยืนยันด้วยมือ)`
- vs the code 150 lines below it: `:716–718`, `:774–779`, `:866–873` gate withdrawal on `ALIVE`/`aliveAsserted`, never on `FORCE`; `:600` says the same in prose
- vs `SKILL.md:30` — `(\`--alive\` เท่านั้น — \`--force\` … **ไม่ปลด** flag นี้โดยตั้งใจ)`; `docs/price-refresh.md:146–147`; `CLAUDE.md:127`; memory `price-refresh-cron.md:25`
A stale comment sitting inside the enforcing file, describing the exact back-door (`--force` unfreezing dead tickers) that the rest of the system was built to close.

### C08 — how many steps is the quality gate?
| Claim | Where |
|---|---|
| **13** (correct) | `CLAUDE.md:29`, `:69`, `:106–107`; `docs/quality-gate.md:6`, `:9`; `.githooks/pre-push` (13 labelled steps); `package.json` `verify` (13 commands) |
| **11** | `.github/workflows/update-prices.yml` step name `Quality gate 11 ขั้น` — the cron that runs it daily |
| **11** | memory `price-refresh-cron.md:18` `gate is 11 steps since 2026-08-12` |
| **8** | `docs/price-refresh.md:15` `npm run verify # gate 8 ขั้นเดิม` |
| **8** | `docs/ta-chart.md:120` `npm run verify เขียวครบ 8 ขั้น` |

### C09 — how many gate codes?
- `SKILL.md:89` — `ตารางมีเกณฑ์+วิธีแก้ครบ **52 code** แล้ว` (the sentence whose whole purpose is to stop the worker opening `test/check-reports.js`)
- vs actual **62** (`CLAUDE.md:107` "43 error + 19 warning"; `docs/quality-gate.md:166`, `:168` heading `E01–E43 · W01–W20`).
The under-count is in the one place a worker reads it, and it sits inside a "the table is complete, don't go look at the code" claim.

### C10 — พ.ศ. mandatory vs gate accepting ค.ศ.
- `CLAUDE.md:96` — `วันที่ในรายงานใช้ปี **พ.ศ.**`; `SKILL.md:10` same; `docs/templates.md:178`, `:189` same
- vs `test/check-reports.js:73` — `⚠ **ห้ามบีบเป็น \`20\d\d\` อีก — รายงานไทยเขียนปี พ.ศ. (เคส ADVICE/AAI) และ US เขียนย่อ 2 หลัก (เคส AME/ROP)**`, with `:76–78` `(?:20|25)\d\d`, `:200` `พ.ศ.→ค.ศ. อัตโนมัติ`, `:324` `(พ.ศ./ค.ศ. — … ≥2400 = พ.ศ.)`
The gate deliberately accepts both eras because real reports use both. The rule as written ("reports use พ.ศ.") is therefore false for part of the corpus and enforced by nothing.

### C11 — who assigns the brand colour
- `_template/agent-prompt.md:31` — worker instruction: `สีแบรนด์ = \`node tools/pick-brand.js <SYM> "#hex" --auto\` **1 turn จบ**`; `SKILL.md:97` same
- vs `CLAUDE.md:46` — `ก่อนขนานต้องทำ 2 อย่าง: **controller pre-assign สีแบรนด์เอง**`; `CLAUDE.md:134`; `docs/orchestration.md:64` — `**ห้าม worker รัน \`pick-brand.js\` เอง**`
The worker's own prompt template tells it to do the exact thing the parallel-safety rule forbids. Nothing in `agent-prompt.md` is conditional on parallel vs serial, so the controller must hand-edit the template every parallel run. `tools/pick-brand.js` has no lock (read ~line 30, write ~line 111), and the collision is explicitly noted as gate-invisible.

### C12 — verify+push per-stock or per-batch
- `CLAUDE.md:47` (§3.4) — `worker เสร็จ 1 ตัว → controller ตรวจ → verify + push **ทันที** … **ก่อน spawn ตัวถัดไป**`; `docs/orchestration.md:40`, `:68` same
- vs `CLAUDE.md:46` (§3.3) — `verify/push **รายแบตช์** ไม่ใช่รายตัว`; `docs/orchestration.md:65` same
Both are in `CLAUDE.md` §3, one numbered item apart. §3.3 is right for parallel and §3.4 for serial, but neither says so; a reader following §3 top-to-bottom gets item 3 ("per batch") overwritten by item 4 ("per stock, before spawning the next").

### C13 — cross-references to `CLAUDE.md` sections are off by one (and swapped)
`CLAUDE.md` sections are: §8 Quality gate, §9 Price refresh, §10 Template system + counters.
- `docs/price-refresh.md:3` — `สรุปย่ออยู่ใน \`CLAUDE.md §10\`` → should be **§9**
- `docs/templates.md:3` — `\`CLAUDE.md §9\` มีแค่หลักการสั้น ๆ` → should be **§10**
- `docs/counters.md:4` — `\`CLAUDE.md §8\` มีแค่ pointer มาที่นี่` → should be **§10**
(`CLAUDE.md:126` itself also references "SKILL STEP 0" for the full triage criteria, which is correct.)

### C14 — the price-flags triage tables disagree with each other and with the code
`tools/update-prices.js` can emit **11** reasons: `drift-gt-<N>pct` (`:298`), `mos-sign-flip`, `suspect-split-or-data`, `bad-price`, `bad-report-price`, `currency-mismatch`, `bad-chart` (`:135` of price-refresh.md), `fetch-failed`, `patch-failed`, `no-stock-meta`, `not-on-exchange`.
- `SKILL.md:17–31` (worker/controller triage) covers **9** — missing **`no-stock-meta`** and **`currency-mismatch`**.
- `CLAUDE.md:126` covers **4** (`fetch/patch-failed`, `drift/mos-flip`, `suspect-split`, `not-on-exchange`) — missing `bad-chart`, `bad-price`, `bad-report-price`, `no-stock-meta`, `currency-mismatch`.
- `docs/price-refresh.md:121–147` has the fullest table but defers `bad-chart` triage to SKILL.
Two reasons the tool can emit have **no triage rule anywhere**.

### C15 — `reports.json.updated` as the freshness test
- `CLAUDE.md:44`, `:57`; `docs/orchestration.md:8–11`; `SKILL.md:32` — all say read `reports.json` field `updated`, `≤7 วัน` = skip
- vs memory `MEMORY.md` (bulk-stock-analysis-workflow entry, 9 ก.ย. 69) — `**\`reports.json.updated\` ใช้ตัดสินความสดไม่ได้** (bulk freshHash ชนกันเป๊ะ 13 ใบ) **ต้องอ่าน footer**`
Every doc still prescribes the method memory has recorded as broken.

### C16 — `analyze-wave` description vs what the script does
`analyze-wave.js:3` advertises "คุม effort ต่อ worker (default medium)"; `docs/orchestration.md:25` says `Agent tool ปกติตั้ง effort ไม่ได้`. But the script does **no prompt assembly at all** — `:23` passes `s.prompt` straight through. Several docs (`CLAUDE.md:46`, `orchestration.md:47` "กติกาทุกข้อข้างบนยังใช้ครบ") read as if the workflow adds or enforces rules. It enforces exactly two things: a default model of `'sonnet'` (`:17`) and a default effort of `'medium'` (`:16`). It does **not** enforce `stocks[].length === 1` — `:21` loops over the array, and `:62` explicitly documents multi-stock runs as supported, contradicting `:4`'s `stocks[] ต้องมี 1 ตัวเสมอ`.

### C17 — the `MC` reference case: doc fixed, memory index still says it's wrong
- `docs/quality-gate.md:103–104` now carries the corrected ฿12.84 **plus an explicit "do not revert to ฿13.29" note**
- vs `MEMORY.md` index line for `fv-family-weighting-0-4c-bis` — `★ เคส MC ใน quality-gate.md **เขียนผิด** (฿12.84 ไม่ใช่ ฿13.29)`, and `fv-family-weighting-0-4c-bis.md:15` — `★ \`docs/quality-gate.md\` **เขียนขัดกันเองตรงเคส MC**`
Stale in the opposite direction from the rest: memory warns about a defect that was repaired.

---

## 2. STALE STATEMENTS (14) — claim vs what the code now does

| # | Stale claim | Where | Reality |
|---|---|---|---|
| S01 | `ตารางมีเกณฑ์+วิธีแก้ครบ **52 code**` | `SKILL.md:89` | 62 codes (`test/check-reports.js`, E01–E43 + W01–W10,W12–W20). Table in `docs/quality-gate.md` is complete; the number quoted to the worker is not. |
| S02 | `npm run verify # gate **8 ขั้น**เดิม` | `docs/price-refresh.md:15` | 13 steps (`package.json`, `.githooks/pre-push`). |
| S03 | `Quality gate **11 ขั้น**` (step name) | `.github/workflows/update-prices.yml` | 13. Cosmetic in CI, but this is the label an operator reads when the nightly cron fails. |
| S04 | `npm run verify เขียวครบ **8 ขั้น**` | `docs/ta-chart.md:120` | 13. |
| S05 | `gate is **11 steps** since 2026-08-12` | memory `price-refresh-cron.md:18` | 13. |
| S06 | `— **ไม่มี Opus แล้ว**` in the queue-clearing instructions | `docs/price-refresh.md:156` | Opus escalation was reinstated 9 ส.ค. 2569 (`CLAUDE.md:45`, `docs/orchestration.md:18`,`:60`). |
| S07 | `หุ้นยาก → worker **ยังเป็น Sonnet**` | `docs/orchestration.md:19` | Superseded by `CLAUDE.md:45` (hard stock → `model:"opus"`). |
| S08 | `**Sonnet เป็น default ทุกชั้น**` | `docs/orchestration.md:17` | `CLAUDE.md:45` explicitly marks this wording as replaced ("แก้กติกาเดิม 'Sonnet ทุกชั้น' 9 ส.ค. 69"). |
| S09 | `ถอนได้ 3 ทาง: … **\`--force <SYM>\`**` | `tools/update-prices.js:622` (comment) | Code withdraws on `--alive` only (`:716–718`, `:774–779`, `:871–873`). The identical comment 22 lines earlier (`:600`) is already correct. |
| S10 | `sequential ในตัว script แล้ว` / `// ห้าม parallel` | `docs/orchestration.md:47`, `analyze-wave.js:8` | Parallel runs are the documented current practice (`CLAUDE.md:46`). The script is serial *within one call*, which is not the same claim. |
| S11 | `กติกา orchestration (**เวฟ ≤3** / **sequential** / …)` | `SKILL.md:9` | Both retired (12 ก.ค. 69 and 8–9 ส.ค. 69). |
| S12 | `CLAUDE.md §10 / §9 / §8` pointers | `docs/price-refresh.md:3`, `docs/templates.md:3`, `docs/counters.md:4` | Should be §9 / §10 / §10. |
| S13 | `stocks[] ต้องมี **1 ตัวเสมอ**` presented as enforced | `analyze-wave.js:4`, `CLAUDE.md:46` | Not enforced: `analyze-wave.js:21` loops the array and `:62` documents multi-stock runs as allowed. Policy only. |
| S14 | `★ เคส MC ใน quality-gate.md เขียนผิด (฿12.84 ไม่ใช่ ฿13.29)` | `MEMORY.md` index + `fv-family-weighting-0-4c-bis.md:15` | Already fixed at `docs/quality-gate.md:103–104`, which now also carries an explicit "do not revert" note. Memory is stale in the opposite direction. |

### S15 (compound) — `SKILL.md` STEP 5C's refresh checklist vs the real set of price-derived fields

`SKILL.md:126` tells the worker to grep for: **จุดเข้า · "แพง~X%" · คำบรรยายทิศกราฟ · gauge (ถ้า script เตือน) · วันที่ footer · `meta ai-model`** — 6 items.

What `node tools/update-prices.js --write --force <SYM>` (STEP 5C ข้อ 1) actually repairs on its own — so the checklist's omission of them is *defensible, but only because the worker runs that command first*:

| Repaired automatically | Mechanism |
|---|---|
| `.px` price + price date + "ราคา ณ …" | core patch (`docs/price-refresh.md:32`) |
| `.chg` annual %, `theme.chgBg/chgColor` | core patch (`:33`) |
| `chart.data` 13 points + min/max/grid/highlight | core patch (`:34`) |
| `gauge.cur` + "ปัจจุบัน $X" label | core patch (`:35`) |
| MOS `.big`, `pxIn`, `stock-meta` price/mos/upside | core patch (`:36–38`) |
| "ส่วนต่างจากราคา" number + verdict box `class` | core patch (`:39`) |
| P/E cards, `stock-meta.pe`, target-price card %, Market Cap, P/S | `patchDerived` (`tools/derived-values.js:657`, called at `tools/update-prices.js:591`) |
| Bear/Base/Bull 3-yr returns + "จากจุดเข้า" label | `scenarioPlan` (`derived-values.js:352`) |
| Dividend % card, `stock-meta.dividendYield`, P/BV card | `yieldPlan`/`pbvPlan` (`derived-values.js:640`,`:649`) |

**Repaired by nobody — not the cron, not `patchDerived`, not any gate, and not on `SKILL.md:126`'s list:**
1. **52-week range** in the header (`{{RANGE_52W}}`). `update-prices.js:153–157` *fetches* `fiftyTwoWeekLow/High` for the mixed-basis check and never writes it back.
2. **Analyst target value + number of firms** (`{{ANALYST_TGT}}`, `{{ANALYST_RATING}}`). Only the *derived %* is patched (E42), never the target itself.
3. **P/E cards that don't declare their own EPS on the `.d` line** — `patchDerived` is silent by design (`docs/price-refresh.md:52`).
4. **% of target price written in prose** — `docs/price-refresh.md:590` comment: `prose ไม่แตะ … เป็นหน้าที่ของคน (W15 เตือน)`.
5. **Scenario summary sentence quoting %/ปี in prose** — memory `price-derived-staleness.md:113`: `**ยังไม่ได้ทำ:** … ยังไม่มีทั้ง warning และตัวซ่อม`.
6. **Gauge "เหมาะสม" marker label** — memory `price-derived-staleness.md:175`: `ไม่มี gate ตรวจ`.
7. **EV/Sales · EV/EBITDA · DCF valuation cards** — memory `data-source-traps.md:258`: `**EV/Sales · EV/EBITDA · DCF ไม่มีใครตรวจเลย**` (E21/E22 only cover "P/E" and "Justified P/BV"; W14 added DDM/P-FCF/EV-EBITDA recompute 17 ส.ค. 69 but DCF and EV/Sales remain uncovered).
8. **`stock-meta.roe` when the company swings to a loss** — memory `bulk-stock-analysis-workflow.md:81` (OKJ case, `pe` nulled but `roe` left at +4.1).

Memory `price-derived-staleness.md:210` states the controller-side workaround (`ก่อน dispatch UPDATE-LIGHT ให้ controller เทียบ เป้า(+จำนวนสำนัก) / 52wk / ปันผล / P-BV ในใบ vs prep แล้วใส่ลิสต์ค่าที่ต้องอัปเดตลง prompt`) — this appears in **no doc and no template**. It is a per-run remembered step.

### S16 — skeleton tokens
`_template/skeleton-th.html` + `skeleton-us.html` contain **97 distinct `{{TOKEN}}`s**. `docs/templates.md` §"ตัวอย่าง filled (NEW)" (`:24–196`) is the file the worker is told to read *instead of* other reports (`SKILL.md:81`), and it shows **filled examples**, not the token list — so the worker's only token inventory is the skeleton itself, which it does read. Not a defect, but note: `{{EXCHANGE}}` exists only in `skeleton-us.html`, and the 7 wrapper tokens (`{{SYMBOL}} {{MARKET}} {{MODE}} {{WORKTREE}} {{CURRENT_TAGS}} {{MEDIANS}} {{FUNDAMENTALS}}`) are controller-substituted and do **not** appear in either skeleton — a worker that pattern-matches "replace every `{{…}}`" will find nothing to do for them, which is correct but nowhere stated.

---

## 3. RULE REACHABILITY

### 3.0 — First, correct the premise (this matters more than the table)

The task assumed *"workers get agent-prompt.md + SKILL.md; rules in CLAUDE.md §3/§8 and in memory are NOT visible to workers."* **That is half wrong, and the half that is wrong is the more dangerous half.**

Evidence observed in this audit session, which is itself a subagent spawned by the `Agent` tool into this same worktree: my system prompt contains, verbatim, **the entire `CLAUDE.md`** (all 10 sections, §3 and §8 included) *and* the **`MEMORY.md` index** (the one-line summary per memory file), injected as `<system-reminder>` project/user instructions with the framing *"These instructions OVERRIDE any default behavior and you MUST follow them exactly as written."* The individual memory sub-files (`bulk-stock-analysis-workflow.md`, `price-derived-staleness.md`, …) are **not** injected — only their index lines.

> **Scope of this observation:** one session type (`Agent` tool, cwd = the worktree, whose root carries the same `CLAUDE.md`). The injection is cwd-scoped — the same block also carries `~/.claude/CLAUDE.md` and `RTK.md` — so a production worker spawned into `{{WORKTREE}}` almost certainly gets it too, but that has not been measured. **Two probes are owed: a production `Agent` spawn, and an `analyze-wave.agent()` spawn.** Everything below marked tier **I** rests on this.

So there are **three** reachability tiers, not two:

| Tier | What it means | Files |
|---|---|---|
| **R — explicit read path** | The worker is told to read it, or the text is in its prompt | `_template/agent-prompt.md` (prompt body) · `.claude/skills/stock-analyzer/SKILL.md` · and via SKILL pointers: `docs/templates.md` §filled, `docs/quality-gate.md` code table |
| **I — injected, unpointed** | Text is in the worker's context, but nothing directs it there — and `agent-prompt.md:7` actively narrows attention (`เนื้อหาขั้นตอนทั้งหมดอยู่ SKILL.md`) | `CLAUDE.md` (whole file) · `MEMORY.md` index lines |
| **U — unreachable** | Not in context, not pointed at | memory sub-files · `docs/orchestration.md` · `docs/price-refresh.md` · `DESIGN.md` · `.githooks/pre-push` · `docs/counters.md` · `docs/ta-chart.md` |

Two consequences the rulebook does not account for:
- **Tier-I rules are worse than unreachable — they are *contradictory* context.** A worker carrying all of `CLAUDE.md` reads `§3.4 push รายตัว` and `§5 Auto-push (commit + push ขึ้น main อัตโนมัติทันที ไม่ต้องถาม)` while `agent-prompt.md:56` says `**ห้าม \`git add/commit/push\` เอง**`. Memory `worker-push-scope-violation.md` records a worker pushing on its own and prescribes the fix as "write the ban in every worker prompt" — which treats the symptom. The cause is that §5 is in the worker's context giving it the opposite instruction, marked MUST-follow.
- **`analyze-wave.js` adds nothing.** `:23` passes `s.prompt` through unchanged; there is no prompt assembly, no rule injection, no `stocks[].length` check. Whether the workflow's `agent()` injects `CLAUDE.md` the same way the `Agent` tool does is **unverified** — worth one probe subagent, because the answer changes the whole table for the `analyze-wave` path.

### 3.1 — Rule table (46 rules)

Legend — **Reach:** R = explicit read path · I = injected-but-unpointed (`CLAUDE.md`/MEMORY index) · U = unreachable.
**Enforced:** test/tool that fails the run · `—` = nobody.

| # | Rule (worker MUST / MUST NOT) | Stated at | Reach | Enforced by |
|---|---|---|---|---|
| 1 | ห้าม push/commit/git add เอง | `agent-prompt.md:56`; `SKILL.md:155` | **R** | — (memory `worker-push-scope-violation.md` = diff review only) |
| 2 | ห้ามเรียก `advisor` ตรง ต้องคืนคำถามให้ controller | `agent-prompt.md:23`; `CLAUDE.md:95` | **R** | — (explicitly "policy, harness ไม่ได้บล็อก", `orchestration.md:22`) |
| 3 | `cd <worktree> && pwd` ก่อน · ห้าม cd ลง main repo | `agent-prompt.md:13–17` | **R** | — |
| 4 | ประทับ `<meta name="ai-model">` = รุ่นที่รันจริง | `agent-prompt.md:25`; `SKILL.md:93` | **R** | E28 (format only — cannot detect a lie; memory `ai-model-stamping.md:14`) |
| 5 | คืนงานต้องบอก `ai-model` ที่ประทับ | `agent-prompt.md:26` | **R** | — (controller spot-check) |
| 6 | ตัวคูณเป้าหมายห้ามลอกจากตัวคูณปัจจุบัน (สมอตาย) | `agent-prompt.md:24`; `SKILL.md:68–69`; `quality-gate.md` §0.4e | **R** | **W18** (`check-reports.js`, logic `DV.deadAnchor`) + `tools/spotcheck.js` (not in verify) |
| 7 | มีบล็อก `{{MEDIANS}}` แล้วห้ามประมาณตัวคูณเอง/ห้ามรันซ้ำ | `agent-prompt.md:24`,`:42–46`; `SKILL.md:69` | **R** | — |
| 8 | บล็อก `FUNDAMENTALS`/`FACTS` มีแล้วห้ามรัน fetch ซ้ำ | `agent-prompt.md:38`; `SKILL.md:37`,`:40` | **R** | — |
| 9 | ห้าม WebFetch หน้า financials/ratios/cash-flow ของ stockanalysis | `agent-prompt.md:38`; `SKILL.md:41` | **R** | — |
| 10 | host allow/deny list สำหรับ WebFetch สำรอง (ห้าม wsj/marketwatch) | `SKILL.md:52` | **R** | — |
| 11 | NEW = Write เต็มใบครั้งเดียว · ห้าม cp/apply-edits เป็นชุด | `agent-prompt.md:31`; `SKILL.md:90` | **R** | — |
| 12 | UPDATE/LIGHT = apply ทุกจุดใน Bash เดียวผ่าน `apply-edits.js` · ห้าม Edit ทีละ turn | `agent-prompt.md:32`; `SKILL.md:126`,`:142` | **R** | — |
| 13 | ข้อความ "เดิม" ใน apply-edits block = copy verbatim | `agent-prompt.md:32`; `SKILL.md:141` | **R** | `tools/apply-edits.js` (all-or-nothing, refuses non-unique) |
| 14 | ห้าม Read/grep/sed ไฟล์ใน `reports/` ตัวอื่นทุกกรณี | `agent-prompt.md:31`; `SKILL.md:81` | **R** | — |
| 15 | ห้ามเปิด/grep `test/check-reports.js` · ใช้ตาราง quality-gate.md | `agent-prompt.md:31`; `SKILL.md:89`,`:153` | **R** | — |
| 16 | ห้าม grep `_template/` `build.js` `test/` หาความหมาย class | `agent-prompt.md:33`; `SKILL.md:143` | **R** | — |
| 17 | โซน MOS bad<10 / ok 10–20 / good ≥20 | `agent-prompt.md:34`; `SKILL.md` via templates §5 | **R** | **W04** (2-zone jump only) |
| 18 | `npm test` ครั้งเดียวตอนจบ · 0 error | `agent-prompt.md:36`; `SKILL.md:151` | **R** | check-reports (per-symbol) |
| 19 | ห้ามเขียน `tags.json` เอง · คืนบรรทัด `TAGS:` | `agent-prompt.md:53`; `SKILL.md:100` | **R** | **E40** (missing tag blocks push) + `tag-apply.js` sole writer |
| 20 | cross-source verify ราคา+EPS ≥2 แหล่งก่อนเขียนตัวเลข | `SKILL.md:46–53`; `CLAUDE.md:31` | **R** | `prep-stock.js` exit 2 (>5%) — controller-side only |
| 21 | ราคาต่าง >5% / EPS ขัดกัน → หยุด รายงานกลับ controller | `agent-prompt.md:22`; `SKILL.md:53` | **R** | `prep-stock.js` exit 2 |
| 22 | หุ้นเดิมห้าม rewrite / หุ้นใหม่เริ่มจาก skeleton เท่านั้น | `SKILL.md:15–16`; `CLAUDE.md:32` | **R** | — |
| 23 | ไฟล์ = `reports/<SYMBOL>.html` พิมพ์ใหญ่ | `SKILL.md:10`; `CLAUDE.md:99` | **R** | `check-site.js` / build |
| 24 | `stock-meta.currency` = ISO (`USD`/`THB`) | `SKILL.md:94` | **R** | **E29** |
| 25 | `.sub` = คำโปรยธุรกิจจริง คั่น `•` | `SKILL.md:95` | **R** | **E32** |
| 26 | ป้าย `.chg` = ผลตอบแทนรอบปี จากปลายกราฟ | `SKILL.md:96` | **R** | **E34/E35/E36/E37** |
| 27 | ห้ามเหลือ `{{…}}` ค้าง · ครบ 8 section | `SKILL.md:87` | **R** | **E13** + section checks |
| 28 | หุ้นขาดทุน → ตัดการ์ด P/E + `stock-meta.pe/roe = null` | `SKILL.md:64` | **R** | E31/W10 partial — **`roe` gap is memory-only** (`bulk-stock-analysis-workflow.md:81`) |
| 29 | FV ถ่วงตาม "ตระกูลสมมติฐาน" (0.4c-bis) · ต่างเกิน 2.0 เท่าห้ามเฉลี่ย | `SKILL.md:67`; `quality-gate.md` §0.4c | **R** | **W05** (partial — memory `price-derived-staleness.md:174`: W05 misses two same-family legs) |
| 30 | disclaimer + "ราคา ณ วันที่ + แหล่ง" | `SKILL.md:98`; `CLAUDE.md:101` | **R** | **W08**, E27 |
| 31 | สีแบรนด์: `pick-brand.js --auto` ครั้งเดียว · ห้ามแก้ seeds.json มือ | `agent-prompt.md:31`; `SKILL.md:97` | **R** | — · ⚠ **contradicts C11** |
| 32 | UPDATE-LIGHT ห้ามแตะ tag | `SKILL.md:145` | **R** | — |
| 33 | `--force` ไม่ปลด `not-on-exchange` (ใช้ `--alive`) | `SKILL.md:30` | **R** | `update-prices.js:774–779` (real guard) |
| 34 | **ห้ามรัน `update-prices.js` ทุกกรณี (เมื่อขนาน)** | memory `bulk-stock-analysis-workflow.md:3`,`:48` | **U** | — · ⚠ SKILL actively instructs the opposite (C06) |
| 35 | **ห้ามรัน `pick-brand.js` เอง (เมื่อขนาน)** | `orchestration.md:64`; `CLAUDE.md:134` | **U / I** | — · ⚠ `agent-prompt.md:31` instructs the opposite (C11) |
| 36 | **rf ต้องตรงสกุลของกระแสเงินสด** (CAD→GoC, EUR→Bund) | `quality-gate.md` §0.4 (`:26`); `CLAUDE.md:113` | **I** | — |
| 37 | **"2 วิธี" ต้องอิสระจริง — ≥1 วิธีที่ไม่รับ (r,g)** | `quality-gate.md` §0.4 (`:27`); `CLAUDE.md:113` | **I** | — |
| 38 | **WACC ≠ cost of equity** (EV-level vs equity-level) | `quality-gate.md` §0.4 (`:28`) | **U** | — |
| 39 | **ห้าม calibrate เข้าหาเป้า consensus** | `quality-gate.md` §0.4 (`:29`) | **U** | — |
| 40 | **ต้องเขียนที่มาของ r (rf+แหล่ง+วันที่ · β · ERP) ลงรายงาน** | `quality-gate.md` §0.4 (`:30`) | **U** | — |
| 41 | **บังคับบรรทัด sensitivity `FV ที่ r ± 0.5pp` เมื่อ r−g < ~5pp** | `quality-gate.md` §0.4 (`:31`) | **U** | — |
| 42 | **หุ้นวัฏจักร: anchor ที่ราคาเฉลี่ยหน้าต่าง TTM ไม่ใช่ spot · `P/B × BVPS` ห้ามเป็นขา** | `quality-gate.md` §0.4b; `CLAUDE.md:116` | **I** | — (`SKILL.md:54` mentions only "EPS เฉลี่ยรอบวัฏจักร") |
| 43 | **DCF นับเป็นขาอิสระได้เมื่อไร (0.4d)** | `quality-gate.md` §0.4d | **U** | — |
| 44 | **cluster check ≥4 ตัวเซกเตอร์เดียว · |MOS|>40% ต้องมีพยาน · implied-rate check** | `quality-gate.md` §0.1–0.3; `CLAUDE.md:113` | **I** | — (explicitly "controller ตรวจเอง โค้ดตรวจให้ไม่ได้") |
| 45 | **β vendor ห้ามใส่ CAPM ดิบเมื่อ free float ต่ำ** · **ป้าย "P/E เฉลี่ย ~N ปี" ต้องนับ FY ที่มีเลขจริงก่อน** | memory `data-source-traps` 6N | **U** | — (E41 skips historical labels by design) |
| 46 | **ฐาน GAAP/adj ต้องตรงกันก่อนคูณ · แถว Shares ใน [3] = ถัวเฉลี่ยถ่วงน้ำหนัก ไม่ใช่หุ้นคงเหลือ · vendor EPS หลังควบรวม = entity mismatch** | memory `data-source-traps` 6O/6★; `MEMORY.md` index | **U / I(index only)** | — |

### 3.2 — Roll-up

- **Reachable on the explicit path (R): 27 of 46** (#1–33 minus #34–35 overlap).
- **Injected-but-unpointed (I): 6** — #36, #37, #42, #44, and the two halves of #46's index line; plus every rule in `CLAUDE.md` §3 and §5 that a worker will read as a MUST while its prompt says otherwise.
- **Truly unreachable (U): 13** — #34, #35, #38, #39, #40, #41, #43, #45, plus the memory-only items in §2 S15 (52wk/analyst-target/prose-%/gauge-marker/EV-cards/roe-null).
- **Enforced by code: 20 of 46.** **26 are enforced by nobody** — including every ชั้น 0 valuation rule (#36–#44), which is by design ("โค้ดตรวจให้ไม่ได้") but means each one depends on the controller's memory on every single stock.
- The two rules most implicated in the owner's complaint (#34 `update-prices`, #35 `pick-brand`) are **both unreachable and both contradicted by the worker's own instructions** — they can only work if the controller hand-edits `agent-prompt.md`'s substitutions every parallel run.

---

## 4. DUPLICATION — rules stated in ≥3 places

| # | Rule | Places | Drift already observed? |
|---|---|---|---|
| D1 | Pin `model` on every spawn | `CLAUDE.md:45`, `:97`; `orchestration.md:18`, `:57–61`; `analyze-wave.js:4`, `:17`; memory `ai-model-stamping.md`, `MEMORY.md` index — **6 files / 8 sites** | **Yes** — C04 (Opus vs Sonnet default) |
| D2 | 1 หุ้น/run, parallel allowed | `CLAUDE.md:46`; `orchestration.md:31–34`, `:63`; `analyze-wave.js:3`,`:4`,`:8`,`:62`; `SKILL.md:9`; memory `feedback-sequential-agents.md`, `bulk-stock-analysis-workflow.md`, `MEMORY.md` index — **6 files / 11 sites** | **Yes** — C01, C02, C16 |
| D3 | Worker ห้าม push | `agent-prompt.md:56`; `SKILL.md:155`; `CLAUDE.md:47` (`ห้าม agent push เอง`); `orchestration.md:38`,`:43`; memory `worker-push-scope-violation.md` — **5 files** | Partial — undercut by `CLAUDE.md:65` §5 auto-push being in worker context |
| D4 | Worker ห้ามเรียก advisor ตรง / courier only | `agent-prompt.md:23`; `CLAUDE.md:45`,`:95`; `orchestration.md:19–23`; `price-refresh.md:156`; memory `MEMORY.md` index — **5 files** | **Yes** — C05 (controller half) |
| D5 | Pre-fetch `prep-stock.js` + exit 2 = stop | `CLAUDE.md:59`; `orchestration.md:29`; `agent-prompt.md:6`,`:38`; `SKILL.md:37`,`:40`; memory `bulk-stock-analysis-workflow.md:34` — **5 files** | No |
| D6 | Pre-fetch `median-multiples.js` (dead-anchor) | `CLAUDE.md:115`; `orchestration.md:29`; `agent-prompt.md:5`,`:24`,`:42–46`; `SKILL.md:68–69`; `quality-gate.md` §0.4e; memory `price-derived-staleness.md` — **6 files** | No (newest rule, 9 ก.ย. 69) |
| D7 | Controller pre-assign brand colour (seeds.json race) | `CLAUDE.md:46`,`:134`; `orchestration.md:64`; `docs/templates.md`; memory `template-system-brand-colors.md` — **4 files** | **Yes** — C11 (`agent-prompt.md:31` says the opposite) |
| D8 | `--force` ≠ `--alive` for `not-on-exchange` | `CLAUDE.md:127`; `SKILL.md:30`; `price-refresh.md:146–147`; `update-prices.js:39–42`,`:600`,`:622`,`:774`; memory `price-refresh-cron.md:25`, `delisted-stocks.md` — **5 files / 9 sites** | **Yes** — C07 (`update-prices.js:622`) |
| D9 | Gate step list / count | `CLAUDE.md:29`,`:69`,`:106–107`; `package.json`; `.githooks/pre-push`; `quality-gate.md:6`,`:9`; `price-refresh.md:15`; `ta-chart.md:120`; `.github/workflows/update-prices.yml`; memory `price-refresh-cron.md:18` — **7 files / 11 sites** | **Yes** — C08 (four different numbers live) |

**Pattern:** every cluster with ≥5 sites has already drifted (D1, D2, D4, D7, D8, D9 = 6 of 9). The two that haven't (D5, D6) are the two youngest. Duplication count is the best available predictor of which rule breaks next.

---

## 5. PROCESS SURFACE — one "clear the price-flags queue" run  ★ key deliverable

Assembled from `CLAUDE.md` §3/§4/§5/§8/§9, `SKILL.md` STEP 0, `docs/orchestration.md` §1–5, `docs/price-refresh.md:156`, `docs/quality-gate.md` ชั้น 0, and the memory files. Marked **[S]** if a script does it, **[S!]** if a script exists but running it at the right moment is the controller's job, **[M]** if it is pure controller memory.

### Phase A — before any stock (9 steps)

| # | Step | Source | Automation |
|---|---|---|---|
| A1 | `git pull --rebase origin main` | `orchestration.md:8`; `CLAUDE.md:44` | **[S!]** |
| A2 | Read `price-flags.json`; the GitHub issue queue is an independent copy maintained by `flags-issue-body.js` | `CLAUDE.md:126`; `update-prices.yml` | **[M]** |
| A3 | Triage **every** flag by `reason` into UPDATE-LIGHT / UPDATE-full / plumbing / delist-confirm | `SKILL.md:17–31`; `CLAUDE.md:126` | **[M]** — and 2 of the 11 emittable reasons have no rule (C14) |
| A4 | For `not-on-exchange`: confirm from a primary source (SEC Form 25 / 8-K / exchange notice) before deleting anything | `SKILL.md:27`; `CLAUDE.md:128` | **[M]** |
| A5 | Read `reports.json` for the 7-day dedup — **but memory says `updated` is unreliable, read each report's footer instead** | `CLAUDE.md:44`,`:57` vs `MEMORY.md` index | **[M]** — conflicting instructions (C15) |
| A6 | Probe subagent to confirm what an unpinned `model` resolves to this session | `CLAUDE.md:45`; `orchestration.md:61` | **[M]** — `echo $CLAUDE_CODE_SUBAGENT_MODEL` explicitly does not work |
| A7 | **Controller pre-patches prices for the whole batch in one process**: `node tools/update-prices.js --write --force SYM1 SYM2 …` (avoids the `price-flags.json` lost-update race) | memory `bulk-stock-analysis-workflow.md:47` **only** | **[S!]** — unreachable rule (§3 #34) |
| A8 | Screen report-EPS vs current-EPS per symbol to decide UPDATE-LIGHT vs UPDATE-full (`prep-stock.js` does **not** compare against the report) | memory `data-source-traps` 6d | **[M]** |
| A9 | Compare the vendor snapshot in each file (analyst target + #firms / 52wk / dividend / P-BV) against `prep` output, and list the deltas into the prompt | memory `price-derived-staleness.md:210` **only** | **[M]** — unreachable |

### Phase B — per stock, before spawn (12 steps)

| # | Step | Source | Automation |
|---|---|---|---|
| B1 | `node tools/prep-stock.js <SYM> [--th] [--update]` | `CLAUDE.md:59`; `orchestration.md:29` | **[S!]** |
| B2 | Check `prep-stock` **exit 2** → do not spawn, stop and ask the user | `CLAUDE.md:59`; `agent-prompt.md:6` | **[S]** (exit code) + **[M]** (acting on it) |
| B3 | `node tools/median-multiples.js <SYM> [--th]` | `CLAUDE.md:115`; `agent-prompt.md:5` | **[S!]** |
| B4 | **Sanity-check the median output** for the two known bad classes (extreme multiples e.g. 2,074x; CAD/USD currency mixing) before pasting it | memory `MEMORY.md` index (10 ก.ย. 69) | **[M]** — "the tool the controller built must itself be checked" |
| B5 | Pre-assign the brand colour sequentially (`pick-brand.js`) and paste theme+GDOTS into the prompt (NEW + parallel) | `CLAUDE.md:46`,`:134`; `orchestration.md:64` | **[S!]** — and the prompt template says the opposite (C11) |
| B6 | Read `tags.json[<SYM>]` → `{{CURRENT_TAGS}}` | `agent-prompt.md:4` | **[M]** |
| B7 | Assemble the prompt from `_template/agent-prompt.md`, substituting 7 tokens | `agent-prompt.md:4–6` | **[M]** — `analyze-wave.js` does no assembly (`:23`) |
| B8 | Hand-add the bans the template lacks: "ห้ามรัน update-prices", "ห้ามรัน pick-brand" | memory `bulk-stock-analysis-workflow.md:48` | **[M]** |
| B9 | Decide + pin `model` (`"sonnet"` / `"opus"`) for this stock | `CLAUDE.md:45` | **[M]** |
| B10 | Decide `effort` (`medium` mechanical / `high` hard) | `CLAUDE.md:58`; `orchestration.md:25` | **[M]** |
| B11 | Hard stock → courier subagent → `advisor` → embed the guidance in the prompt | `orchestration.md:19–20`; `CLAUDE.md:45` | **[M]** |
| B12 | Decide the parallel width N and ramp it | `CLAUDE.md:46`; `orchestration.md:66` | **[M]** |

### Phase C — per stock, after the worker returns (13 steps)

| # | Step | Source | Automation |
|---|---|---|---|
| C1 | Read the worker's returned price/FV/MOS summary | `orchestration.md:68` | **[M]** |
| C2 | Spot-check the report's `ai-model` meta against the model actually spawned | `CLAUDE.md:45`; `agent-prompt.md:26` | **[M]** — E28 checks format only |
| C3 | Read the diff / grep the whole file for numbers left over from the previous round (gate cannot see prose) | `CLAUDE.md:112`; memory `data-source-traps:156` | **[M]** |
| C4 | ชั้น 0.1 cluster check (≥4 same-sector, one-sided |mean MOS| >25% but price within 15% of consensus) | `CLAUDE.md:113`; `quality-gate.md` §0.1 | **[M]** |
| C5 | ชั้น 0.2 — any \|MOS\| > 40% needs a witness method that does not use (r,g) | `CLAUDE.md:113`; `quality-gate.md` §0.2 | **[M]** |
| C6 | ชั้น 0.4 — rf currency, WACC≠CoE, two-methods-independence, no calibration to consensus, r-sourcing paragraph, sensitivity line | `quality-gate.md:26–31` | **[M]** — 6 sub-checks, none reachable by the worker (§3 #36–41) |
| C7 | ชั้น 0.4b/0.4c/0.4d/0.4e — cyclical anchor, dispersion >2×, family weighting, DCF independence, dead anchor | `CLAUDE.md:115–116`; `quality-gate.md` §0.4b–e | **[S]** partial: W05/W18 only |
| C8 | Read the section-6 scenario columns by eye where W17 is silent (84 reports as of 20 ส.ค. 69) | `CLAUDE.md:114` | **[M]** |
| C9 | Eyeball the gauge marker label and the EV/Sales · EV/EBITDA · DCF cards — no gate covers them | memory `price-derived-staleness:175`, `data-source-traps:258` | **[M]** |
| C10 | `node tools/spotcheck.js <SYM>` | `CLAUDE.md:115` | **[S!]** — **not in `npm run verify`** |
| C11 | `npm test -- <SYM>` | `CLAUDE.md:111` | **[S!]** |
| C12 | `node tools/tag-apply.js <SYM> <slug…>` from the worker's `TAGS:` line | `SKILL.md:101` | **[S!]** |
| C13 | Progress report X/Y (pushed / awaiting push / not started) | memory `feedback-progress-counter.md` | **[M]** |

### Phase D — ship (4 steps)

| # | Step | Source | Automation |
|---|---|---|---|
| D1 | `npm run verify` (13 steps) | `CLAUDE.md:69` | **[S]** + `.githooks/pre-push` re-runs it |
| D2 | `git add -A && git commit -m "analyze: …"` — **1 commit = 1 stock**, with the Co-Authored-By trailer | `CLAUDE.md:70–75` | **[M]** (message discipline) |
| D3 | `git pull --rebase origin main` (must come **after** commit) | `CLAUDE.md:72` | **[S!]** |
| D4 | `git push origin HEAD:main` — **`HEAD:main`, not `main`**, because this is a worktree | `CLAUDE.md:73` | **[S!]** |

### Conditional branches (4 more)

| # | Step | Source |
|---|---|---|
| E1 | Renamed ticker → edit `tools/symbol-map.json` **and** `node tools/tag-apply.js --rename <OLD> <NEW>` | `CLAUDE.md:129`; `SKILL.md:29` |
| E2 | Confirmed delisting → delete the report, `node tools/tag-apply.js --prune`, record in memory `delisted-stocks`, **do not** add a symbol-map entry | `CLAUDE.md:126`; `SKILL.md:28` |
| E3 | False-positive `not-on-exchange` → `node tools/update-prices.js --write --alive <SYM>` (never `--force`) | `SKILL.md:30` |
| E4 | `bad-chart` → confirm the split from a primary source, then rebase the pre-split chart points and re-derive every per-share figure | `SKILL.md:21–25` |

### Totals

**38 core steps** (A9 + B12 + C13 + D4) **+ 4 conditional = 42.**

- Fully scripted and hard to forget (`[S]`): **4** — B2's exit code, C7's W05/W18, D1, and the pre-push hook.
- Script exists but firing it is remembered (`[S!]`): **10** — A1, A7, B1, B3, B5, C10, C11, C12, D3, D4.
- Pure controller memory (`[M]`): **24**.

**So roughly 63% of a queue-clearing run is unautomated judgement, and 11 of those 24 remembered steps exist only in memory files or in `docs/` the worker never sees.** There is no runbook script, no checklist file, and no `npm run` target that sequences a manual queue run — `.github/workflows/update-prices.yml` sequences the *cron* (`update-prices → build → preserve-dates → build → verify → commit → push → issue update`), and nothing sequences the human path. In particular **`node tools/preserve-dates.js` appears only in the cron**; a manual run that re-runs `npm run build` has no documented equivalent, and `CLAUDE.md` §5's 5-command auto-push sequence omits it entirely — a gap that bites **only on a controller pre-patch carrying no re-analysis (step A7)**, since a genuine UPDATE/UPDATE-LIGHT is *supposed* to advance the footer date (`SKILL.md:110`, `:126`) and preserve-dates would be wrong there.

This count is the direct answer to the owner's complaint: a 42-step procedure where 24 steps are unenforced memory will surface a *new* missed step on essentially every run, regardless of how many rules get added afterwards. Adding rule #47 raises the memory load; it does not raise the floor.

---

## 6. MEMORY vs DOCS — open / unclosed items still recorded in memory (21)

| # | Item | Source |
|---|---|---|
| 1 | `%/ปี` quoted in the closing prose sentence of section 6 is prose ⇒ cron cannot touch it; **no warning and no healer exists yet** | `price-derived-staleness.md:113` |
| 2 | Gauge "เหมาะสม" marker label has **no gate** (ICLR left on an old FV while the MOS20/30 scale updated; E30 only compares `stock-meta`) | `price-derived-staleness.md:175` |
| 3 | Before dispatching UPDATE-LIGHT the controller must diff target(+#firms) / 52wk / dividend / P-BV against `prep` and list them into the prompt — **written nowhere but memory** | `price-derived-staleness.md:210` |
| 4 | `median-multiples.js`, built to close the dead-anchor hole, itself shipped two classes of wrong data to workers (extreme 2,074x multiple; CAD/USD mixing on CP) | `price-derived-staleness.md:163`; `MEMORY.md` index |
| 5 | W05 cannot see "two legs from the same family / same multiple set" (WWD set P/E TTM and P/E NTM both at 28.7x and averaged them) | `price-derived-staleness.md:174` |
| 6 | **EV/Sales · EV/EBITDA · DCF valuation cards have no checker at all** (E21/E22 cover only "P/E" and "Justified P/BV") | `data-source-traps.md:258` |
| 7 | E41 deliberately skips historical labels (`P/E เฉลี่ย ~5 ปี`, 475 cards) ⇒ a label claiming more years than the stock has existed is invisible (GABLE) | `data-source-traps.md:271`; `MEMORY.md` index 6N |
| 8 | `fetch-fundamentals.js` / `prep-stock.js` fixes are **not covered by `npm run verify`** — `npm run test:prep` must be run by hand | `data-source-traps.md:230` |
| 9 | `bad-chart` mixed-basis charts are gate-invisible: E36 compares the badge to the chart tail and both are wrong together | `data-source-traps.md:69` |
| 10 | Do not paste weighted-average share counts into a worker prompt — it made CAMT "fix" a number that was already right | `data-source-traps.md:120` |
| 11 | 6 reports have **two FV legs both in the same family** ⇒ no market-anchored leg at all — **ยังไม่แก้** | `fv-family-weighting-0-4c-bis.md:22` |
| 12 | `MEMORY.md` index still claims the `MC` case in `docs/quality-gate.md` is wrong; the doc was fixed at `:103–104` (stale-in-reverse) | `MEMORY.md` index; `fv-family-weighting-0-4c-bis.md:15` |
| 13 | BBL's "ส่วนต่างจากราคา" box says `MOS ~ +2.1% (เกือบเต็มมูลค่า)` — sign and wording disagree; **ของค้างที่ยังไม่แก้** | `price-refresh-cron.md:47` |
| 14 | `stock-meta.roe` must be `null` for loss-making companies the way `pe` already is (OKJ left at +4.1) — **no rule in SKILL, no check** | `bulk-stock-analysis-workflow.md:81` |
| 15 | 49 vocabulary requests sit in `tags.json` `requests` awaiting the owner's review | `tag-system-2026-08.md:19` |
| 16 | `stock-ai.dotent.workers.dev` is still live (`workers_dev = true` is explicit, must not be removed) and traffic through it is still uncached | `workers-dev-cache-inert.md:21`,`:23` |
| 17 | No `x-cache` debug header was ever added, so the cache-inert diagnosis rests on timing evidence only | `workers-dev-cache-inert.md:20` |
| 18 | The unpinned-model probe (11 ก.ย. 69) contradicts `CLAUDE.md` §3.2; **the Workflow-without-`model` path has never been probed** and the doc was deliberately left unchanged pending a re-probe | `ai-model-stamping.md:20–21` |
| 19 | W06 fired on **553 of 908 reports (61%)** — the "ส่วนต่างจากราคา" sentence disagreeing with computed MOS; cron patches the number but never the direction word, so these need a human | `data-source-traps.md:166`; `CLAUDE.md:125` |
| 20 | ~23 of 41 W08-flagged reports also carry EPS stale by >2% (HSY +36%, SNNP −32%, COP +28%, NUE +24%, CF +21%) | `data-source-traps.md:153` |
| 21 | `self-test`/`update-prices-test` fixtures are pinned to real reports (BBL, AAPL) whose live prices move ⇒ the cron has already failed 3 days straight (22–24 ส.ค.) and again on run #54 (2 ก.ย.); the fragility is documented, not removed | `price-refresh-cron.md:43`,`:48` |

---

## 7. The five most consequential findings

1. **The rulebook's reachability model is wrong, and the error runs in the unsafe direction.** `CLAUDE.md` **is** injected into subagents in full, flagged MUST-follow (verified: this audit subagent's own system prompt carries all 10 sections plus the `MEMORY.md` index). So workers are not missing §3/§8 — they are receiving them *and* a prompt (`agent-prompt.md:7`) that tells them the procedure lives only in `SKILL.md`. That is how a worker ends up carrying `CLAUDE.md §5` ("commit + push ขึ้น main อัตโนมัติทันที ไม่ต้องถาม") and `agent-prompt.md:56` ("ห้าม git add/commit/push เอง") simultaneously — exactly the incident in memory `worker-push-scope-violation.md`, whose recorded fix ("write the ban in every prompt") treats the symptom. Meanwhile the rules that *are* genuinely unreachable are the ones that matter most: the nine ชั้น 0 valuation rules and the two parallel-safety bans. **One probe is owed here**: whether `analyze-wave.js`'s `agent()` injects the same context as the `Agent` tool — the answer changes the correct fix.

2. **The worker and the controller are given opposite instructions about `update-prices.js`, and only one side is written down where anyone will read it.** `SKILL.md:38/:112/:123` tells the worker to run `--write --force` on every UPDATE and UPDATE-LIGHT; `tools/update-prices.js` is *built around that assumption* (`:19`, `:39`, `:693`, `:815`). Memory `bulk-stock-analysis-workflow.md:3/:47/:48` says the opposite — controller pre-patches the whole batch in one process, worker never touches the script — because `price-flags.json` is read-modify-write with no lock, so parallel workers resurrect cleared flags. Memory even predicts the failure mode verbatim: *"ไม่งั้น worker ทำตาม SKILL"*. This lives in **no doc and no template**, so every parallel run depends on the controller remembering to hand-write a ban that contradicts the skill the worker is simultaneously ordered to follow. **This is the single most likely generator of "a new problem every queue-clearing run."** The same shape repeats for `pick-brand.js` (C11): `agent-prompt.md:31` tells the worker to run it; `CLAUDE.md:46/:134` and `orchestration.md:64` forbid it under parallelism; nothing in the template is conditional on parallel vs serial.

3. **A 42-step manual procedure with 24 unenforced memory steps guarantees a fresh miss per run.** §5 enumerates it: 38 core + 4 conditional, of which only 4 are hard to forget, 10 are scripts the controller must remember to fire, and 24 are pure judgement. Eleven of those 24 exist only in memory or in `docs/` the worker never sees. No runbook script, no checklist, no `npm run` target sequences the human path — `.github/workflows/update-prices.yml` sequences only the cron, and `node tools/preserve-dates.js` appears **only** there, absent from `CLAUDE.md` §5's five-command push sequence (a gap only for controller pre-patches with no re-analysis — step A7; a genuine UPDATE is meant to advance the footer date). Adding rule #47 after each incident raises the memory load without raising the floor; the structural fix is a queue-run runbook script that performs A1/A7/B1/B3/B5 and emits the assembled prompt, plus folding `spotcheck` into `verify`.

4. **Sequential-vs-parallel and the model rules are each stated in 6 files / 8–11 sites, and both have already drifted — including inside a single file, three lines apart.** `analyze-wave.js:3` and `:8` say sequential and "ห้าม parallel"; `:4` says parallel is fine. `docs/orchestration.md` §2 says "Sonnet ทุกชั้น" at `:17` and "Opus escalate" at `:18`; `:19` says hard stocks stay Sonnet while `CLAUDE.md:45` says they go to Opus; `docs/price-refresh.md:156` — the queue-clearing instructions specifically — still says "ไม่มี Opus แล้ว". Same for advisor access: `CLAUDE.md:95` lets the controller call it directly, three other files forbid it. The measured pattern in §4: **every duplication cluster with ≥5 sites has already drifted (6 of 9); the only two that haven't are the two newest.** Duplication count is the working predictor of the next failure, and the remedy is single-sourcing, not more cross-references.

5. **Four different gate-step counts and a wrong code count are live, and the wrong code count sits inside the sentence that tells workers not to look at the source.** The gate is 13 steps (`package.json` and `.githooks/pre-push` agree exactly); `.github/workflows/update-prices.yml` labels it 11, `docs/price-refresh.md:15` says 8, `docs/ta-chart.md:120` says 8, memory says 11. `CLAUDE.md:107`'s "43 error + 19 warning" is **correct** (verified: E01–E43 and W01–W10/W12–W20, 62 codes, and `docs/quality-gate.md`'s table matches exactly, none missing or extra). But `SKILL.md:89` tells the worker the table has "ครบ **52 code**" while forbidding it from opening `test/check-reports.js` — so the one number a worker uses to decide whether the table is complete is short by ten. Alongside it: `tools/update-prices.js:622` still documents `--force` as a way to clear a `not-on-exchange` flag, a stale comment inside the enforcing file describing the precise back door (`EA`/`BPP`, dead tickers patched from stale Yahoo quotes) that `--alive` was introduced to close — while the correct version of the same comment sits 22 lines above it at `:600`.
