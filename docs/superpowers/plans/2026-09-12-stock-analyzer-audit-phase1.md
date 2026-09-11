# แผนลงมือ audit ระบบวิเคราะห์หุ้น — ระยะ 1 "ปิดวงจรค้นพบ"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> spec: `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md` (เจ้าของเคาะ 11 ก.ย. 2569: A(ข) · B(ข) · C(ค) · D(ข) · E(ข) · F(ข))
> ระยะ 0 merge เข้า `main` แล้ว 12 ก.ย. 2569 (PR #26–#30 · main `421d1799`) · เกณฑ์จบระยะ 0 ผ่าน 4/4 (`docs/superpowers/audit/2026-09-11-stock-analyzer/phase0-exit.md`) · แผนระยะ 0 = `docs/superpowers/plans/2026-09-11-stock-analyzer-audit-phase0.md`
> แผนนี้ = **ระยะ 1 จาก 4** (spec §6 แถว "1 · ปิดวงจรค้นพบ") — ระยะ 2 (data layer · ข้อ A/B) และระยะ 3 (กวาดหนี้เก่า · ข้อ E) เขียนเป็นแผนแยกหลังระยะ 1 ขึ้น main (ดู §"แผนถัดไป" ท้ายไฟล์)

**Goal:** ทำให้ gate "รู้ว่าตัวเองไม่ได้ตรวจอะไร" (coverage ต่อไฟล์ · NEITHER 18 → 0 · UNVERIFIED WRITE 3 → 0) · เลื่อน W17/W19/W20/W16 เป็น error โดย cron ไม่ล้ม · คิวที่ต้องส่ง LLM ต่อสัปดาห์ลด ≥50% (flip ไม่ส่ง LLM · trigger ตามปฏิทินงบ) · ตัวเลข/ตาราง gate ใน docs generate จากโค้ด · กับดัก vendor ที่ตรวจเชิงกลได้เข้า prep-stock พร้อม fixture test

**Architecture:** 6 ส่วน (A–F) ต่อกันเป็น PR stack แบบเดียวกับระยะ 0 — A ทำสัญญา cron↔gate ให้เป็นโค้ด (ประตู cron แยกจากประตู push · กฎ "E ใหม่ต้องมี healer" เป็น self-test · เลื่อน 4 รหัส W→E · lock heartbeat) → B สร้าง field manifest บน extractor ที่มีอยู่ (รวม regex 3 บล็อกให้เหลือเจ้าของเดียวก่อน · census ทั้งคลัง · coverage ต่อไฟล์ · W21/W22) → C นโยบายคิว (dead-band ±5 · ช่องสรุปเป็นโครงสร้างที่ cron เป็นเจ้าของ · flip ไม่ส่ง LLM · ปฏิทินงบ · คิวถาวรข้าม worktree) → D docs generate จากโค้ด + docs-test → E กับดัก vendor + test:prep เข้า verify → F วัดเกณฑ์จบ · ทุก task ส่งมอบเป็นโค้ด+เทส หรือ **ลบ** กฎ ไม่ใช่เพิ่มย่อหน้า (spec §8)

**Tech Stack:** Node ≥20.19 · ไม่มี dependency ใหม่ (`fs`/`path`/`child_process`/`crypto`/`Intl` · `fetch` builtin) · เทสแบบ `ok(cond, label)` ตามสไตล์ `test/*.js` เดิม · fixture แช่แข็ง `test/fixtures/` (ระยะ 0) · git worktree · `gh` CLI (login แล้ว)

**Spec:** `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md` §4 (WS1 · WS2 ข้อ 2/3/4/6 · WS4 · WS6 · WS8 ข้อ 3/4/7 · WS9(a)) · §6 แถวระยะ 1 · §7 KPI · §8 ข้อจำกัด · §9 การตัดสินใจ

## Global Constraints

- **E-code ใหม่ต้องมาคู่ healer + เคสพิสูจน์ว่า healer ทำให้ check เงียบ** (spec WS2 ข้อ 3 · ทำเป็น self-test ใน Task 2) — รหัส error ที่มีอยู่ 43 ตัวเป็นรายการ grandfather · รหัส W ที่ยกเป็น error ใน Task 3 **คงชื่อเดิม (W16/W17/W19/W20) เปลี่ยนแค่ `level`** — ชื่อถูกอ้างในเอกสาร/memory >15 จุด เปลี่ยนชื่อ = กวาด prose โดยไม่ได้อะไร · ตาราง generate (Task 18) ประกาศ level เป็นทางการ
- **แก้ `reports/` เป็นชุดได้ครั้งเดียวทั้งระยะ** = การกวาดช่องสรุป "ส่วนต่างจากราคา" ให้เป็นคลังคำคงที่ (Task 12) ด้วยท่า `heal → build → preserve-dates → build` เท่านั้น · task อื่นห้ามแตะเนื้อหารายงาน (เทสที่ต้องแตะ AAPL/BBL จริง เช่น sweep ราคา ให้ `git checkout --` คืน ห้าม `git stash`)
- การเปลี่ยนโครงสร้าง (build.js / gate / cron / template / CLAUDE.md / docs) = **สรุปแล้วรอเจ้าของก่อน push** (CLAUDE.md §5) ⇒ ทุก task commit บนสาขาของส่วนนั้น เปิด PR ท้ายส่วน (A→B→C→D→E→F stack กัน · merge ด้วย **merge commit ไม่ squash** — squash จะทำให้ใบถัดไป diff ซ้ำ) **ห้าม push ตรงเข้า main**
- font/ดีไซน์ไม่แตะ (DESIGN.md) · ป้าย `ai-model` เก่าห้ามย้อนแก้เป็นกลุ่ม · ห้าม Haiku · **pin `model` ทุก Agent/analyze-wave call**
- เอกสาร = ภาษาไทย ปี พ.ศ. · เวลา = Asia/Bangkok · commit message ท้ายด้วย `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- คำสั่งที่นับ/รวมข้อมูลใน Bash ของ Claude ต้องนำหน้าด้วย `rtk proxy` (hook ตัดบรรทัดเงียบ ๆ) · worktree: รันทุกคำสั่งจาก root ของ worktree · ห้าม `cd` ลง `/Users/somchai.s/Downloads/stock`
- **manifest ห้ามเป็นสำเนา regex ที่ 9** — entry ใน `tools/field-manifest.js` ต้อง**ห่อ** extractor ที่มีอยู่ (`report-meta.js` · `derived-values.js` · `buildCtx` ของ check-reports · `price-date.js` · `queue/footer-date.js`) — regex ใหม่เขียนได้เฉพาะ 18 แถว NEITHER ที่วันนี้ไม่มีใครอ่านเลย
- ทุกครั้งที่จำนวนขั้น `npm run verify` เปลี่ยน (Task 19: 14→15 · Task 23: 15→16) ต้องแก้ `package.json` + `.githooks/pre-push` + assertion ใน `test/queue-test.js:20-31` พร้อมกัน แล้วรัน `node tools/gen-docs.js` (หลัง Task 18) ให้ตัวเลขในเอกสารตาม
- network ใช้ได้เฉพาะ task ที่ระบุ (`earnings-calendar` Task 17 · probe `/forecast/` Task 22) — เทสทุกตัวใน verify ต้อง offline

## โครงไฟล์ที่เกิด/แก้ในระยะ 1

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `package.json` (`verify:cron` · verify 16 ขั้น) · `.github/workflows/update-prices.yml` · `.githooks/pre-push` | ประตู cron แยกจากประตู push · ขั้นใหม่ docs-test / prep-stock-test | 1, 19, 23 |
| `test/check-reports.js` (ฟิลด์ `healer` · level ของ W16/W17/W19/W20 · coverage · W21/W22 · W06 ใหม่ · import จาก report-meta/derived-values) | gate | 2, 3, 6, 7, 9, 10, 11 |
| `test/self-test.js` (E-policy · convergence registry · เคส parser หมวด 6 · W21/W22 · W06) | meta-test ของ gate | 2, 3, 6, 7, 8, 9, 11 |
| `tools/lockfile.js` | heartbeat · signal release · pid ownership | 4 |
| `docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh` | sweep ราคาสังเคราะห์ (จาก phase0-exit §1) เก็บถาวร | 5 |
| `tools/report-meta.js` (+`readReportData` · `readHeaderPrice` · `PX_RE` · `RANGE52_RE`) · `test/parser-lint.js` | เจ้าของ regex stock-meta / report-data / .px ที่เดียว | 6 |
| `tools/derived-values.js` (`scenarioColumns` · `readSummaryCell` · `summaryPlan` · `fmtMos` · pass #11) | parser หมวด 6 ชุดเดียว · ช่องสรุปเป็นโครงสร้าง | 6, 7, 8, 11 |
| `tools/field-manifest.js` · `docs/superpowers/audit/2026-09-11-stock-analyzer/manifest-census.md` | manifest 68 ช่อง + census ทั้งคลัง | 8, 9 |
| `tools/update-prices.js` (dead-band 5 · ลบ patch ช่องสรุปแบบมีเงื่อนไข · log `found:false`) | cron | 6, 9, 10, 11 |
| `tools/spotcheck.js` · `tools/queue/postcheck.js` | อ่าน manifest (coverage · f55) | 9, 24 |
| `tools/queue/triage.js` · `preflight.js` · `ship.js` · `state.js` · `queue.js` · `test/queue-test.js` | PREPATCH · age/earnings · คิวถาวร · nits | 13, 14, 15, 16, 17 |
| `tools/earnings-calendar.js` · `earnings-calendar.json` · `.github/workflows/earnings-calendar.yml` · `test/earnings-calendar-test.js` | ปฏิทินงบรายสัปดาห์ | 17 |
| `tools/gen-docs.js` · `test/docs-test.js` · marker ใน `docs/quality-gate.md` · `CLAUDE.md` · `README.md` · `.githooks/pre-push` | ตัวเลข/ตารางจากโค้ด · วลีต้องห้าม | 18, 19 |
| `docs/orchestration.md` · `docs/price-refresh.md` · `.claude/skills/stock-analyzer/SKILL.md` | ลบส่วนซ้ำ · flip/±5/verify:cron | 1, 10, 13, 20 |
| `tools/fetch-fundamentals.js` · `tools/prep-stock.js` · `tools/median-multiples.js` · `test/prep-stock-test.js` · `test/median-multiples-test.js` · `test/fixtures/vendor/` | กับดัก vendor เชิงกล · fixture test | 21, 22, 23, 24 |
| `docs/open-items.md` · `docs/superpowers/audit/2026-09-11-stock-analyzer/{phase1-exit.md,replay-queue.js}` | ผลวัดเกณฑ์จบ | 25, 26 |

---

# ส่วน A — WS2 สัญญา cron↔gate (ข้อ 2/3/4) + WS4 lock heartbeat (PR #A)

สาขา: `claude/audit-p1-a-cron-gate` (base = `main` @ `421d1799`)

### Task 1: `verify:cron` — ประตู cron ตรวจเฉพาะสิ่งที่ cron แตะ (WS2 ข้อ 2)

**Files:**
- Modify: `package.json:16` (บล็อก `scripts` — เพิ่ม `verify:cron` ใต้ `verify`)
- Modify: `.github/workflows/update-prices.yml:49-50` (ขั้น "Quality gate 14 ขั้น")
- Modify: `test/queue-test.js:20-31` (บล็อก `0) verify:` — เพิ่มบล็อก `0b`)
- Modify: `docs/price-refresh.md:14` · `CLAUDE.md:108` · `README.md:131`

**Interfaces:**
- Produces: npm script `verify:cron` = `node test/check-reports.js && node build.js && node test/build-test.js && node test/engine-exec.js && node test/check-site.js` (5 ขั้น — เฉพาะตัวที่อ่าน `reports/` · `reports.json` · `dist/`) · `update-prices.yml` ยังรัน `npm run test:prices` เป็นขั้นแรกก่อน patch เหมือนเดิม (`:35-36`)
- เหตุผลที่ตัด 9 ขั้น: `update-prices-test` `dead-ticker-test` `tag-apply-test` `queue-test` `tags-test` `self-test` `ohlc-test` `ta-engine-test` `skeleton-test` เป็น unit test ของเครื่องมือ/fixture ที่ cron ไม่ได้เปลี่ยน — ล้มเมื่อไรคือโค้ดพัง ไม่ใช่ราคาพัง และ `verify.yml` (CI) ยังรัน verify เต็มบนทุก push เข้า main อยู่แล้ว

- [ ] **Step 1: เขียนเทสที่ล้มก่อน** — ต่อท้ายบล็อก `0)` ใน `test/queue-test.js` (หลังบรรทัด 31):

```js
// ── 0b) verify:cron (ประตู cron · spec WS2 ข้อ 2) ⊂ verify เต็ม ลำดับเดิม · cron ใช้ตัวนี้ ──
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const full = pkg.scripts.verify.split('&&').map((s) => s.trim());
  const cron = String(pkg.scripts['verify:cron'] || '').split('&&').map((s) => s.trim()).filter(Boolean);
  ok(cron.length === 5, 'verify:cron: 5 ขั้น (check-reports · build · build-test · engine-exec · check-site)', pkg.scripts['verify:cron']);
  ok(cron.every((s) => full.includes(s)), 'verify:cron: ทุกขั้นอยู่ใน verify เต็ม', cron.filter((s) => !full.includes(s)).join(' '));
  const idx = cron.map((s) => full.indexOf(s));
  ok(idx.every((v, i) => i === 0 || v > idx[i - 1]), 'verify:cron: ลำดับเดียวกับ verify เต็ม');
  for (const must of ['node test/check-reports.js', 'node build.js', 'node test/build-test.js', 'node test/engine-exec.js', 'node test/check-site.js'])
    ok(cron.includes(must), `verify:cron: มี ${must}`);
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'update-prices.yml'), 'utf8');
  ok(/run:\s*npm run verify:cron\s*$/m.test(yml) && !/run:\s*npm run verify\s*$/m.test(yml), 'update-prices.yml: รัน verify:cron (ไม่ใช่ verify เต็ม)');
}
```

- [ ] **Step 2: รันให้ล้ม** — `node test/queue-test.js` → ต้องเห็น `✗ verify:cron: 5 ขั้น` (script ยังไม่มี)

- [ ] **Step 3: เพิ่ม script + แก้ workflow** — `package.json` ใต้บรรทัด `"verify": …` เพิ่ม:

```json
    "verify:cron": "node test/check-reports.js && node build.js && node test/build-test.js && node test/engine-exec.js && node test/check-site.js",
```

`.github/workflows/update-prices.yml:49-50` เปลี่ยนเป็น:

```yaml
      - name: Quality gate ประตู cron (verify:cron — เฉพาะสิ่งที่ cron แตะ · verify เต็มรันใน ci-verify หลัง push)
        run: npm run verify:cron
```

- [ ] **Step 4: รันให้ผ่าน** — `node test/queue-test.js` → บล็อก 0b ผ่านทั้งหมด · `npm run verify:cron` ผ่าน (5 ขั้น ~4 วิ)

- [ ] **Step 5: docs 3 จุด (แทน ไม่เพิ่ม)** — `docs/price-refresh.md:14` บรรทัด `npm run verify  # gate 14 ขั้น …` → `npm run verify:cron            # ประตู cron 5 ขั้น (เฉพาะสิ่งที่ cron แตะ) — verify เต็มรันโดย ci-verify หลัง push` · `CLAUDE.md:108` ต่อท้ายประโยค "14 ขั้น ต้องผ่านทั้งหมดก่อน push (pre-push hook บังคับซ้ำ)" ด้วย ` · cron ใช้ชุดย่อย \`verify:cron\` 5 ขั้น (check-reports → build → build-test → engine-exec → check-site) เพราะ unit test ของเครื่องมือล้ม ≠ ราคาพัง` · `README.md:131` "ผ่าน `npm run verify` ครบทุกขั้นแล้วจึง commit" → "ผ่าน `npm run verify:cron` (ประตู cron 5 ขั้น) แล้วจึง commit"

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/update-prices.yml test/queue-test.js docs/price-refresh.md CLAUDE.md README.md
git commit -m "cron: ประตู cron = verify:cron 5 ขั้น (เฉพาะสิ่งที่ cron แตะ) · queue-test บังคับ ⊂ verify (WS2 ข้อ 2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: กฎ "E ใหม่ต้องมี healer + เคส convergence" เป็น self-test (WS2 ข้อ 3)

**Files:**
- Modify: `test/check-reports.js:606-652` (E41/E42/E43 เพิ่มฟิลด์ `healer`) · `:658-761` (W16/W17/W19/W20 เพิ่ม `healer` — level ยังเป็น warn ใน task นี้)
- Modify: `test/self-test.js` — helper `cycle` (`:790-795`) ลงทะเบียน · บล็อก W17 (`:562-…`) ลงทะเบียน · เพิ่มเคส convergence W16 หลังบรรทัด 518 · เพิ่มบล็อก E-policy ก่อน tally (`:878`)

**Interfaces:**
- Produces: ฟิลด์ `healer` ใน entry ของ `CHECKS` = ชื่อ pass ของตัวซ่อม (`'patchReport'` · `'patchDerived#1'`…`'patchDerived#11'`) · self-test export ไม่มี — ทำงานผ่าน `CONVERGED` set ภายในไฟล์
- Consumes: `CHECKS` (export `test/check-reports.js:817`) · `DV.patchDerived(html, price)` (`tools/derived-values.js:657`)

- [ ] **Step 1: เพิ่ม `healer` ให้ 7 entry** — ใน `test/check-reports.js` แทรกฟิลด์หลัง `label`:

| id | บรรทัด | `healer` |
|---|---|---|
| E41 | 606 | `'patchDerived#1'` (การ์ด P/E) — stock-meta.pe = `#2` อยู่ใน pass เดียวกันของ healer |
| E42 | 625 | `'patchDerived#3'` |
| E43 | 643 | `'patchDerived#5'` |
| W16 | 658 | `'patchDerived#6'` |
| W17 | 685 | `'patchDerived#7'` |
| W19 | 739 | `'patchDerived#8'` |
| W20 | 754 | `'patchDerived#10'` |

ตัวอย่าง (E41): `{ id: 'E41', level: 'error', healer: 'patchDerived#1', label: 'P/E = ราคา ÷ EPS ที่พิมพ์', fn: (c) => {`

- [ ] **Step 2: เขียนบล็อก E-policy ใน self-test (ล้มก่อน)** — แทรกก่อนบรรทัด `console.log('\n' + '─'.repeat(50));` (`test/self-test.js:878`):

```js
// ── E-policy (spec WS2 ข้อ 3 · แผนระยะ 1 Global Constraints): error ที่ไม่อยู่ในรายการ grandfather ต้อง
//    (ก) ประกาศ healer ที่รู้จัก และ (ข) มีเคส convergence ในไฟล์นี้ (mutate → check ยิง → healer → check เงียบ)
//    ไม่งั้น E ใหม่ = cron ล้มทั้งวันแบบเคลียร์ไม่ได้ (บทเรียน 22–24 ส.ค. 69 / run #54) ──
{
  const E_GRANDFATHERED = new Set(Array.from({ length: 43 }, (_, i) => 'E' + String(i + 1).padStart(2, '0')));   // E01–E43 ที่มีก่อนระยะ 1 — ห้ามเพิ่มชื่อในนี้
  const HEALERS = new Set(['patchReport', ...Array.from({ length: 11 }, (_, i) => 'patchDerived#' + (i + 1))]);
  const errs = CHECKS.filter((c) => c.level === 'error');
  ok(errs.length >= 43, `E-policy: มี error ≥43 ตัว (ได้ ${errs.length})`);
  for (const c of errs.filter((c) => !E_GRANDFATHERED.has(c.id))) {
    ok(HEALERS.has(c.healer), `E-policy: ${c.id} เป็น error นอก grandfather ต้องประกาศ healer ที่รู้จัก (ได้ ${c.healer})`);
    ok(CONVERGED.has(c.id), `E-policy: ${c.id} ต้องมีเคส convergence ในไฟล์นี้ (cycle()/CONVERGED.add)`);
  }
  for (const c of CHECKS.filter((c) => c.healer != null))
    ok(HEALERS.has(c.healer), `healer ของ ${c.id} = ${c.healer} ต้องอยู่ในรายการที่รู้จัก`);
}
```

และประกาศ `const CONVERGED = new Set();` ไว้ใต้ `const allIds = …` (`test/self-test.js:97`) — ต้องอยู่ก่อนทุกบล็อกที่ลงทะเบียน · `CHECKS` import ให้ตรงกับที่ไฟล์ require อยู่แล้ว (`const { checkHtml, CHECKS } = require('./check-reports.js')` — ถ้าบรรทัด require เดิมไม่มี `CHECKS` ให้เติม)

- [ ] **Step 3: รันให้ล้ม** — `node test/self-test.js` → ผ่านหมด (ยังไม่มี error นอก grandfather) **แต่** ต้องยืนยันว่ากลไกจับได้: แก้ชั่วคราว `E_GRANDFATHERED` ให้ไม่มี `'E41'` แล้วรัน → ต้องเห็น `✗ E-policy: E41 ต้องมีเคส convergence` (E41 ยังไม่ได้ลงทะเบียน) → คืนค่า

- [ ] **Step 4: ลงทะเบียน convergence ที่มีอยู่แล้ว + เพิ่ม W16** — (ก) `cycle` helper ที่ `test/self-test.js:790-795` เพิ่ม `CONVERGED.add(id);` หลังบรรทัด `ok(!fires(id, once) …)` (ข) บล็อก W17: หลังเคสที่พิสูจน์ว่า `at(PX)` ทำให้ W17 เงียบ (บรรทัดแรกที่ `ok(!fires(fresh) …)`) เพิ่ม `CONVERGED.add('W17');` (ค) E41/E42/E43: ในบล็อก `E43 / W16` (`:478-518`) ต่อท้ายด้วย:

```js
    // convergence (E-policy): ค้าง → healer → เงียบ + idempotent — ลงทะเบียนให้ E41/E42/E43/W16
    const DVc = require('../tools/derived-values.js');
    const healed = (h) => DVc.patchDerived(h, PX).html;
    const conv = (id, h, desc) => {
      ok(allIds(checkHtml(h, 'BBL.html')).has(id), `${desc} → ${id} ยิง`);
      const once = healed(h);
      ok(!allIds(checkHtml(once, 'BBL.html')).has(id) && healed(once) === once, `${desc} → healer ทำให้ ${id} เงียบ + idempotent`);
      CONVERGED.add(id);
    };
    conv('W16', addCardKV('P/S (TTM)', '2.5x', `รายได้ TTM ${cur}${numStr(revM)} ล้าน`), 'W16 convergence: P/S ค้าง');
    conv('E43', setKVD('Market Cap', `${cur}${numStr(PX * mc.shares * 0.8 / M)} ล้าน`, `${numStr(mc.shares / M)} ล้านหุ้น`), 'E43 convergence: Market Cap ค้าง');
```

(ชื่อ helper `addCardKV` · `setKVD` · `numStr` · `mc` · `revM` · `M` · `cur` ใช้ของบล็อกนั้นที่มีอยู่แล้ว — ถ้า `setKVD` ไม่ได้ประกาศในบล็อก E43 ให้ใช้ตัวที่บล็อก W19/W20 ประกาศ (`:782`) โดยยกขึ้นไปประกาศระดับไฟล์) · E41/E42 ลงทะเบียนด้วย `conv()` แบบเดียวกันในบล็อกของตัวเอง (`E41` = การ์ด `P/E (TTM)` ค้าง `~20x` เมื่อ EPS ที่พิมพ์ทำให้ควรเป็นค่าอื่น · `E42` = การ์ดเป้าที่ % ค้าง) — ค่าที่ใช้ต้องคำนวณจาก `PX`/ค่าในใบ ไม่ hardcode (กฎ fixture ข้อ 1)

- [ ] **Step 5: รันให้ผ่าน** — `node test/self-test.js` → ผ่านทั้งหมด (จำนวนเคสเพิ่ม ≥8) · `npm run verify`

- [ ] **Step 6: Commit**

```bash
git add test/check-reports.js test/self-test.js
git commit -m "gate: CHECKS ประกาศ healer · self-test บังคับ E นอก grandfather ต้องมี healer + เคส convergence (WS2 ข้อ 3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: เลื่อน W16/W17/W19/W20 → error (ข้อ C(ค) · WS2 ข้อ 4) — คงชื่อ เปลี่ยน level

**Files:**
- Modify: `test/check-reports.js:658` (W16) · `:685` (W17) · `:739` (W19) · `:754` (W20) — `level: 'warn'` → `'error'`
- Modify: `test/self-test.js:512,515` (`expect('W16', 'warn', …)` → `'error'`) · comment `:508`
- Modify: `CLAUDE.md:109` · `docs/quality-gate.md:167,171,232,233,235,236` (ตัวเลข/level ชั่วคราว — Task 18 จะ generate ทับ)
- Modify: `docs/price-refresh.md` (คำอธิบาย W17/W19/W20 ที่ `:69-120` — คำว่า "warn" ของ 3 รหัสนี้ → "error (ระยะ 1)")

**Interfaces:**
- Consumes: ฟิลด์ `healer` (Task 2) — 4 รหัสนี้กลายเป็น error ตัวแรกนอก grandfather ⇒ E-policy ใน self-test บังคับว่ามี healer + convergence ครบ (W16 จาก Task 2 Step 4 · W17/W19/W20 จาก cycle เดิม)
- Produces: `checkHtml().errTotal` = 47 · warning ที่เหลือ 15 รหัส

- [ ] **Step 1: เงื่อนไขก่อนเลื่อน — คลังต้องไม่มี 4 รหัสนี้ค้าง (spec: "เลื่อน W→E หลัง heal = 0")**

```bash
rtk proxy node test/check-reports.js | grep -c '\[W1[679]\]\|\[W20\]'
```

ต้องได้ `0` (ณ 12 ก.ย. 69: warning 149 = W15 97 · W06 51 · W05 1) · ถ้าไม่ใช่ 0 → `node tools/update-prices.js --heal-derived --write <SYM…>` เฉพาะตัวที่ยิง แล้ว `npm run build && node tools/preserve-dates.js && npm run build` (นี่คือข้อยกเว้นเดียวที่อนุญาตให้แตะ reports/ ใน task นี้ — บันทึกจำนวนใบใน commit message)

- [ ] **Step 2: เปลี่ยน level 4 จุด** — `level: 'warn'` → `level: 'error'` ที่ W16 (`:658`) · W17 (`:685`) · W19 (`:739`) · W20 (`:754`) · คอมเมนต์เหนือ W16 (`:657`) และ `test/self-test.js:508` ที่บอกว่า "จึงเป็น warn" → เติม "(ยกเป็น error ระยะ 1 — ข้อ C(ค) หลัง quarantine + heal = 0)"

- [ ] **Step 3: self-test ตาม** — `test/self-test.js:512` และ `:515` `expect('W16', 'warn', …)` → `expect('W16', 'error', …)` · รัน `node test/self-test.js` → ผ่าน (E-policy: 4 รหัสมี healer + CONVERGED ครบ) · `node test/check-reports.js` → `error 0` ทั้ง 908 ใบ · `errTotal` = 47 (ดูบรรทัด `✓ AAPL.html 47/47 ผ่าน`)

- [ ] **Step 4: quarantine พิสูจน์** — cron ที่ patch แล้ว 4 รหัสนี้ตกต้องเป็น `patch-rejected` ไม่ใช่ล้ม: ใน `test/update-prices-test.js` บล็อก quarantine (ท้ายไฟล์ — ค้นหา `patch-rejected`) เพิ่มเคส: fixture AAPL ที่ทำให้ `scenarioPlan` ตัดสินได้แต่ค่าค้าง (ใช้ `DV.patchDerived(FX.AAPL(), px*0.7).html` เป็น "ใบค้าง") → `U.gateAfterPatch(html, 'AAPL.html')` ต้องคืน `ok:false` และ `codes` มี `'W17'` (ตอนนี้เป็น error จึงโผล่ใน codes) — ยืนยันว่า W17 ที่ตกไม่ throw

- [ ] **Step 5: docs ตัวเลข (ชั่วคราวจนกว่า Task 18 จะ generate)** — `CLAUDE.md:109` `(43 error + 19 warning)` → `(47 error + 15 warning)` · `docs/quality-gate.md:167` เช่นกัน · `:171` ประโยค "นับรวมแล้วมี **19** รหัส warning" → "**15** รหัส warning (W16/W17/W19/W20 ยกเป็น error 12 ก.ย. 2569 — คงชื่อ W เพราะถูกอ้างในเอกสาร/memory มาก)" · แถวตาราง `:232,233,235,236` คอลัมน์ level → `error` · `docs/price-refresh.md:69-120` คำว่า "warn"/"W17 เตือน" ของ 3 รหัส → "error (ระยะ 1)"

- [ ] **Step 6: verify + Commit**

```bash
npm run verify
git add test/check-reports.js test/self-test.js test/update-prices-test.js CLAUDE.md docs/quality-gate.md docs/price-refresh.md
git commit -m "gate: W16/W17/W19/W20 → error (คงชื่อ) — ข้อ C(ค) หลัง quarantine · error 47 / warning 15

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: lockfile — heartbeat สำหรับ holder แบบ async · ปล่อยเมื่อ SIGINT/SIGTERM · ปล่อยเฉพาะ lock ของตัวเอง (open-item #23)

**Files:**
- Modify: `tools/lockfile.js:14-19` (ค่าคงที่ + handler) · `:55-66` (`withLock`)
- Test: `test/update-prices-test.js` (บล็อก lockfile ที่มีอยู่ — ค้นหา `withLock`) เพิ่ม 3 เคส

**Interfaces:**
- Produces: `withLock(file, fn, { waitMs, heartbeatMs })` — ถ้า `fn()` คืน thenable จะถือ lock ต่อจนกว่า promise settle และ touch mtime ของ `<file>.lock` ทุก `heartbeatMs` (default `HEARTBEAT_MS = 60_000`) · sync fn ทำงานเหมือนเดิม · export เพิ่ม `HEARTBEAT_MS`, `release`
- ข้อจำกัดที่ต้องเขียนในคอมเมนต์หัวไฟล์: heartbeat ช่วยได้เฉพาะ holder ที่ async (event loop หมุน) — holder sync ที่ค้าง >10 นาทีไม่มีทางส่ง heartbeat ⇒ กฎ "ถือเฉพาะ read→merge→write" ยังอยู่

- [ ] **Step 1: เทสล้มก่อน** — ต่อท้ายบล็อก lockfile ใน `test/update-prices-test.js`:

```js
// ── lockfile ระยะ 1: heartbeat (async holder) · release เฉพาะของตัวเอง · signal ──
{
  const L = require('../tools/lockfile.js');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
  const f = path.join(tmp, 'x.json'), dir = f + '.lock';
  // (1) async holder: mtime ของ lock ต้องขยับระหว่างถือ
  const p = L.withLock(f, async () => {
    const t0 = fs.statSync(dir).mtimeMs;
    await new Promise((r) => setTimeout(r, 120));
    return fs.statSync(dir).mtimeMs - t0;
  }, { heartbeatMs: 20 });
  ok(p && typeof p.then === 'function', 'withLock: fn async → คืน promise (ไม่ปล่อย lock ก่อน settle)');
  ok(fs.existsSync(dir), 'withLock: ระหว่าง await ยังถือ lock อยู่');
  p.then((dt) => {
    ok(dt > 0, `heartbeat: mtime ขยับระหว่างถือ (Δ ${dt.toFixed(0)} ms)`);
    ok(!fs.existsSync(dir), 'withLock async: settle แล้วปล่อย lock');
    // (2) ปล่อยเฉพาะของตัวเอง: จำลองว่าถูก reclaim (pid ในโฟลเดอร์ไม่ใช่ของเรา)
    L.withLock(f, () => { fs.writeFileSync(path.join(dir, 'pid'), '99999999'); });
    ok(fs.existsSync(dir) && fs.readFileSync(path.join(dir, 'pid'), 'utf8') === '99999999', 'release: pid ไม่ใช่ของเรา → ไม่ลบ lock ของคนใหม่');
    fs.rmSync(dir, { recursive: true, force: true });
    // (3) signal handler มีอยู่จริง (ไม่ยิงสัญญาณจริงในเทส — แค่ตรวจว่าลงทะเบียน)
    ok(process.listeners('SIGINT').some((l) => /release|held/.test(String(l))) && process.listeners('SIGTERM').some((l) => /release|held/.test(String(l))), 'lockfile: ลงทะเบียน SIGINT/SIGTERM เพื่อปล่อย lock');
    ok(typeof L.HEALTHBEAT_MS === 'undefined' && L.HEARTBEAT_MS === 60000, 'export HEARTBEAT_MS = 60000');
  });
}
```

(เคสนี้ async — ให้ทั้งไฟล์เทสรอ promise ก่อนพิมพ์ tally: ครอบบรรทัด tally `:809-810` ด้วย `Promise.resolve(pending).then(() => { … })` โดย `pending` = promise จากบล็อกนี้ — วิธีที่ไฟล์ใช้อยู่แล้วถ้ามี async case ก่อนหน้า ให้ทำตามแบบเดิม)

- [ ] **Step 2: รันให้ล้ม** — `node test/update-prices-test.js` → ✗ ที่ "คืน promise" (ตอนนี้ `finally` ปล่อย lock ทันที)

- [ ] **Step 3: แก้ `tools/lockfile.js`** — แทนที่ `:14-19` และ `:55-66` ด้วย:

```js
const STALE_MS = 10 * 60 * 1000;   // cron รอบเต็ม ~8 นาที ยังไม่ถึง — เกินนี้ถือว่าค้าง
const WAIT_MS = 60 * 1000;
const POLL_MS = 200;
const HEARTBEAT_MS = 60 * 1000;    // holder แบบ async touch mtime ทุก 1 นาที — holder sync ทำไม่ได้ (event loop ไม่หมุน) ⇒ กฎ "ถือสั้น" ยังอยู่
const held = new Set();

/** ปล่อย lock — เฉพาะเมื่อ pid ในโฟลเดอร์ยังเป็นของเรา (ถูกยึดไปแล้วเพราะ stale = ของคนใหม่ ห้ามลบ) */
function release(dir) {
  held.delete(dir);
  if (readPid(dir) !== String(process.pid)) return false;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  return true;
}
process.on('exit', () => { for (const d of [...held]) release(d); });
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => { for (const d of [...held]) release(d); process.exit(sig === 'SIGINT' ? 130 : 143); });
```

```js
/** รัน fn ใต้ lock ของ file · sync: คืนค่าของ fn แล้วปล่อย · async (fn คืน thenable): ถือต่อ + heartbeat จน settle แล้วคืน promise · รอเกิน waitMs → throw */
function withLock(file, fn, opts) {
  const waitMs = (opts && opts.waitMs != null) ? opts.waitMs : WAIT_MS;
  const hbMs = (opts && opts.heartbeatMs != null) ? opts.heartbeatMs : HEARTBEAT_MS;
  const dir = `${file}.lock`;
  const t0 = Date.now();
  while (!tryAcquire(dir)) {
    if (Date.now() - t0 > waitMs) throw new Error(`รอ lock ${path.basename(dir)} เกิน ${waitMs >= 1000 ? Math.round(waitMs / 1000) + ' วิ' : waitMs + ' ms'} — process อื่นถืออยู่ (pid ${readPid(dir)}) ยกเลิก ไม่เขียนทับ`);
    sleepSync(POLL_MS);
  }
  held.add(dir);
  let out;
  try { out = fn(); }
  catch (e) { release(dir); throw e; }
  if (!out || typeof out.then !== 'function') { release(dir); return out; }
  const hb = setInterval(() => { try { const t = new Date(); fs.utimesSync(dir, t, t); } catch (_) {} }, hbMs);
  hb.unref();
  return out.finally(() => { clearInterval(hb); release(dir); });
}
```

และ `module.exports = { withLock, release, writeJsonAtomic, STALE_MS, WAIT_MS, HEARTBEAT_MS };` · คอมเมนต์หัวไฟล์ `:9` เติม "· holder async ได้ heartbeat (ระยะ 1) · holder sync ห้ามยาว"

- [ ] **Step 4: รันให้ผ่าน** — `node test/update-prices-test.js` ผ่าน · `node test/dead-ticker-test.js` · `node test/tag-apply-test.js` ผ่าน (ผู้ใช้ lock เดิมทั้งหมดเป็น sync — พฤติกรรมเดิม)

- [ ] **Step 5: Commit**

```bash
git add tools/lockfile.js test/update-prices-test.js
git commit -m "lockfile: heartbeat สำหรับ holder async · ปล่อยเฉพาะ lock ของตัวเอง · SIGINT/SIGTERM ปล่อย lock (open-item #23)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: sweep ราคาสังเคราะห์หลังเลื่อน W→E (เงื่อนไขจาก phase0-exit §6) + เก็บ script ถาวร

**Files:**
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh` (ย้ายจาก phase0-exit §1 — เดิมอยู่ใน scratchpad ที่หายพร้อม session)
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/sweep-after-w2e.md` (ผลรัน)

**Interfaces:**
- Produces: `sh docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh` (env `PRICES` · `SWEEP_DIR`) พิมพ์ `sweep fails=N` · Part F (Task 25) รันซ้ำเป็นเกณฑ์จบ

- [ ] **Step 1: เขียน `sweep.sh`** (เนื้อหาเดียวกับ phase0-exit §1 — เพิ่ม `set -u` และ default ของ env):

```bash
#!/bin/sh
# sweep ราคาสังเคราะห์ — พิสูจน์ว่า gate/cron ไม่ขึ้นกับราคาของวัน (phase0-exit §1 · เกณฑ์จบระยะ 1 หลัง W→E)
# ใช้: PRICES="0.5 1.0 3.0" SWEEP_DIR=/tmp/sweep sh docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh
# เขียน reports/AAPL.html + BBL.html จริงผ่าน patchReport (เส้นทางเดียวกับ cron) แล้ว npm run verify ทุกราคา · คืนไฟล์ด้วย git checkout -- (ห้าม stash)
set -eu
PRICES="${PRICES:-0.5 0.7 0.85 0.95 1.0 1.05 1.15 1.3 1.5 1.8 2.2 3.0}"
SWEEP_DIR="${SWEEP_DIR:-/tmp/sweep-$$}"
mkdir -p "$SWEEP_DIR"
trap 'git checkout -- reports/AAPL.html reports/BBL.html reports.json' EXIT
fails=0
for p in $PRICES; do
  node -e "
const U=require('./tools/update-prices.js');const fs=require('fs');const {readStockMeta}=require('./tools/report-meta.js');
for(const s of ['AAPL','BBL']){const h=fs.readFileSync('reports/'+s+'.html','utf8');const px=readStockMeta(h).price*$p;
fs.writeFileSync('reports/'+s+'.html',U.patchReport(h,{newPrice:+px.toFixed(2),dateParts:{day:12,monIdx:8,yearCE:2026},chartData:null}).html)}"
  if npm run verify >"$SWEEP_DIR/sweep-$p.log" 2>&1; then echo "×$p ok  $(grep -o 'error [0-9]* • warning [0-9]*' "$SWEEP_DIR/sweep-$p.log" | head -1)"; else echo "×$p FAIL (ดู $SWEEP_DIR/sweep-$p.log)"; fails=$((fails+1)); fi
  git checkout -- reports/AAPL.html reports/BBL.html reports.json
done
echo "sweep fails=$fails"
[ "$fails" -eq 0 ]
```

- [ ] **Step 2: รัน** — `SWEEP_DIR=<scratchpad>/sweep sh docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh` (ใช้เวลา ~12 × 7 วิ) → ต้อง `sweep fails=0` และ `git status --short` ว่าง · ถ้ามี FAIL: อ่าน log — ถ้ารหัสที่ตกคือ W16/W17/W19/W20 ที่เพิ่งยกเป็น error แปลว่า healer กับ checker ไม่สมมาตรที่ราคานั้น → **ห้ามแก้ด้วยการเลื่อนกลับเป็น warn** ให้แก้ให้ `plan` คืน null (เงียบ) ทั้งคู่หรือ healer เขียนให้ตรง แล้วเพิ่มเคสใน self-test ก่อนรัน sweep ซ้ำ

- [ ] **Step 3: บันทึกผล** — `sweep-after-w2e.md` = ตาราง 12 แถว (ตัวคูณ · error · warning) เหมือน phase0-exit §1 + บรรทัด `sweep fails=0` + วันที่ + commit ที่วัด

- [ ] **Step 4: Commit + เปิด PR #A**

```bash
git add docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh docs/superpowers/audit/2026-09-11-stock-analyzer/sweep-after-w2e.md
git commit -m "docs(audit): sweep.sh ถาวร + ผล sweep 12 ราคาหลัง W16/W17/W19/W20 → error (fails=0)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p1-a-cron-gate
gh pr create --base main --title "audit ระยะ 1 ส่วน A: ประตู cron แยกจากประตู push · E-policy เป็น self-test · W16/W17/W19/W20 → error · lock heartbeat (WS2 · WS4)" --body-file - <<'PRBODY'
## สรุป
- `verify:cron` 5 ขั้น = ประตู cron (เฉพาะสิ่งที่ cron แตะ) · `update-prices.yml` ใช้ตัวนี้ · queue-test บังคับ ⊂ verify
- CHECKS ประกาศ `healer` · self-test บังคับ "error นอก grandfather 43 ตัวต้องมี healer + เคส convergence"
- W16/W17/W19/W20 → `level:'error'` (คงชื่อ) — 4 รหัสนี้เป็นตัวแรกที่ผ่านกฎใหม่ · error 47 / warning 15 · sweep 12 ราคา fails=0 (`sweep-after-w2e.md`)
- lockfile: heartbeat holder async · ปล่อยเฉพาะ lock ของตัวเอง · SIGINT/SIGTERM (open-item #23)

## ทดสอบ
- `npm run verify` 14/14 · `npm run verify:cron` 5/5 · sweep.sh fails=0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

---

# ส่วน B — WS1 field manifest → coverage (PR #B)

สาขา: `claude/audit-p1-b-manifest` (base = `claude/audit-p1-a-cron-gate` · retarget เป็น main หลัง #A merge)

> ลำดับบังคับ (advisor): เจ้าของ regex เดียว (Task 6) → parser หมวด 6 เดียว (Task 7) → manifest ที่ `required: null` ทุกช่อง + census ทั้งคลัง (Task 8) → ตัดสิน required จากตัวเลข census แล้ว coverage/W21/W22 (Task 9) — census ทำไม่ได้ก่อนมี extractor ครบ 68 ช่อง

### Task 6: `tools/report-meta.js` เป็นเจ้าของ regex stock-meta / report-data / `.px` ที่เดียว + `test/parser-lint.js` (WS1 ข้อ 3)

**Files:**
- Modify: `tools/report-meta.js` (23 บรรทัด → เพิ่ม export)
- Modify (แทนสำเนาด้วย import): `build.js:83,239` · `tools/derived-values.js:531,624,689,774` · `tools/update-prices.js:448,493,506-507,700` · `tools/brandtheme.js:146` · `tools/fix-contrast.js:96` · `test/check-reports.js:273,279,298,307` · `test/check-site.js:110,139,186` · `test/update-prices-test.js:160,166,167,184,238,438-478` · `test/skeleton-test.js:196-197`
- Delete: `tools/migrate.js` · `tools/migrate-annual-chg.js` (migrator ครั้งเดียวของ ก.ค./ส.ค. 69 — ตรวจก่อนด้วย `rtk proxy grep -rn "migrate" package.json docs README.md CLAUDE.md .claude` ว่าไม่มีใครอ้าง · ถ้ามี ให้แทน regex ด้วย import แทนการลบ)
- Create: `test/parser-lint.js` (require จาก `test/self-test.js` แบบเดียวกับ `fixture-lint.js`)

**Interfaces:**
- Produces (export ใหม่ใน `tools/report-meta.js`):
  - `REPORT_DATA_RE` = `/<script[^>]*\bid=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i` · `REPORT_DATA_PARTS_RE` = `/(<script[^>]*\bid=["']report-data["'][^>]*>)([\s\S]*?)(<\/script>)/i`
  - `readReportData(html)` → `{ present:false } | { present:true, ok:true, data } | { present:true, ok:false, err }` · `readStockMetaState(html)` → รูปเดียวกัน (สำหรับ gate ที่ต้องแยก "ไม่มีบล็อก" กับ "JSON เสีย") · `readStockMeta(html)` เดิมคง (คืน object|null)
  - `CUR_SRC = '(?:C\\$|[฿$])'` · `PX_RE` = `new RegExp('<div class="px">\\s*(' + CUR_SRC + ')\\s*([\\d.,]+)')` · `PX_PARTS_RE` = `new RegExp('(<div class="px">\\s*' + CUR_SRC + ')([\\d.,]+)')` (สำหรับตัวเขียน) · `readHeaderPrice(html)` → `{ currency:'$'|'฿'|'C$', price:number, raw:string } | null`
  - `stripStockMeta(html)` → html ที่ตัดบล็อก stock-meta (สำหรับ `freshHash`)
  - `RANGE52_RE` = regex `m52` จาก `tools/queue/prep.js:90` (ย้ายมาที่นี่ · prep import กลับ)
- คำศัพท์สกุลเงินรวมเป็น `C$ | ฿ | $` ทุกที่ (เดิม 4 ชุด — code-audit §2.5) · `update-prices.js:506` เดิม `[฿$]` จะ throw กับ `C$` — census ก่อนว่าคลังมี `.px` ที่ขึ้นต้น `C$` ไหม (`rtk proxy grep -l 'class="px">C\$' reports/*.html | wc -l` — คาด 0) ⇒ รวมคำศัพท์ได้โดยไม่เปลี่ยนพฤติกรรมกับใบที่มี

- [ ] **Step 1: `test/parser-lint.js` (ล้มก่อน)** —

```js
'use strict';
/**
 * parser-lint — regex ของบล็อก stock-meta / report-data / ราคา .px ต้องมีเจ้าของเดียว: tools/report-meta.js
 * (code-audit §2.5: สำเนา 8 + 6 + 6 จุด · 4 คำศัพท์สกุลเงิน — ตัวที่หลุดจะพังเงียบ)
 * กวาด production + test ทุกไฟล์ยกเว้นเจ้าของ · คอมเมนต์ที่มีคำเหล่านี้ไม่นับ (ตัดบรรทัดที่ขึ้นต้น // ออก)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OWNER = 'tools/report-meta.js';
const FILES = ['build.js', ...['tools', 'test'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))];
const PATTERNS = [
  [/id=\[?["'\\]+stock-meta/, 'regex บล็อก stock-meta'],
  [/id=\[?["'\\]+report-data/, 'regex บล็อก report-data'],
  [/class="px">\s*[\\(\[]/, 'regex ราคา header .px'],
];
function scan() {
  const out = [];
  for (const rel of FILES) {
    if (rel === OWNER) continue;
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const code = l.replace(/^\s*(\/\/|\*|\/\*).*$/, '');   // ข้ามบรรทัดคอมเมนต์ล้วน
      for (const [re, what] of PATTERNS) if (re.test(code)) out.push({ file: rel, line: i + 1, what });
    });
  }
  return out;
}
module.exports = function parserLint(ok) {
  const hits = scan();
  ok(hits.length === 0, 'parser-lint: regex stock-meta/report-data/.px มีเจ้าของเดียว (tools/report-meta.js)' + (hits.length ? ' — สำเนาที่ ' + hits.map((h) => `${h.file}:${h.line} (${h.what})`).join(' · ') : ''));
};
module.exports.scan = scan;
```

ใน `test/self-test.js` ถัดจากบรรทัดที่ require `fixture-lint` เพิ่ม `require('./parser-lint.js')(ok);` · รัน `node test/self-test.js` → ✗ พร้อมรายการสำเนา ~20 จุด (นี่คือรายการงานของ Step 3)

- [ ] **Step 2: เพิ่ม export ใน `tools/report-meta.js`** — แทนที่ทั้งไฟล์ด้วย:

```js
'use strict';
/**
 * report-meta.js — **เจ้าของเดียว** ของ regex ที่อ่าน/เขียนบล็อกฝังในรายงาน (test/parser-lint.js บังคับ):
 *   stock-meta (JSON ตัวเลขสำหรับ index) · report-data (theme/chart/gauge) · ราคา header `.px`
 * เดิมสำเนา 8+6+6 จุดใน 4 คำศัพท์สกุลเงิน (code-audit §2.5 · ระยะ 1 WS1 ข้อ 3) — ตัวที่หลุดจะพังเงียบ
 */
const STOCK_META_RE = /<script[^>]*\bid=["']stock-meta["'][^>]*>([\s\S]*?)<\/script>/i;
const STOCK_META_PARTS_RE = /(<script[^>]*\bid=["']stock-meta["'][^>]*>)([\s\S]*?)(<\/script>)/i;
const REPORT_DATA_RE = /<script[^>]*\bid=["']report-data["'][^>]*>([\s\S]*?)<\/script>/i;
const REPORT_DATA_PARTS_RE = /(<script[^>]*\bid=["']report-data["'][^>]*>)([\s\S]*?)(<\/script>)/i;
// สกุลเงินหน้าราคา header — คำศัพท์เดียวทั้งรีโป (เดิม update-prices รับ [฿$] · derived-values รับ C$ ด้วย)
const CUR_SRC = '(?:C\\$|[฿$])';
const PX_RE = new RegExp('<div class="px">\\s*(' + CUR_SRC + ')\\s*([\\d.,]+)');
const PX_PARTS_RE = new RegExp('(<div class="px">\\s*' + CUR_SRC + ')([\\d.,]+)');
// กรอบ 52 สัปดาห์ในหัวรายงาน (ตัวคั่น – / &ndash; วงเล็บ — วัด 908 ใบ 12 ก.ย. 69 · ย้ายจาก tools/queue/prep.js)
const RANGE52_RE = new RegExp('กรอบ 52 สัปดาห์\\s*\\(?\\s*' + CUR_SRC + '?\\s*([0-9][0-9.,]*)\\s*(?:&[a-z]+;|[–—\\-/])\\s*' + CUR_SRC + '?\\s*([0-9][0-9.,]*)');

const state = (re) => (html) => {
  const m = String(html).match(re);
  if (!m) return { present: false };
  try { return { present: true, ok: true, data: JSON.parse(m[1]) }; }
  catch (e) { return { present: true, ok: false, err: e.message }; }
};
const readStockMetaState = state(STOCK_META_RE);
const readReportData = state(REPORT_DATA_RE);
function readStockMeta(html) { const s = readStockMetaState(html); return s.ok ? s.data : null; }
function readHeaderPrice(html) {
  const m = String(html).match(PX_RE);
  if (!m) return null;
  const price = parseFloat(m[2].replace(/,/g, ''));
  return Number.isFinite(price) ? { currency: m[1], price, raw: m[2] } : null;
}
const stripStockMeta = (html) => String(html).replace(new RegExp('\\n?' + STOCK_META_RE.source, 'i'), '');

module.exports = { readStockMeta, readStockMetaState, readReportData, readHeaderPrice, stripStockMeta,
  STOCK_META_RE, STOCK_META_PARTS_RE, REPORT_DATA_RE, REPORT_DATA_PARTS_RE, CUR_SRC, PX_RE, PX_PARTS_RE, RANGE52_RE };
```

- [ ] **Step 3: แทนสำเนาทีละไฟล์** (ทุกจุดที่ parser-lint รายงาน) — กติกา: อ่าน → `RM.readStockMetaState/readReportData/readHeaderPrice` · เขียนกลับ → `RM.STOCK_META_PARTS_RE / REPORT_DATA_PARTS_RE / PX_PARTS_RE` · ตัด stock-meta ออก → `RM.stripStockMeta`

| ไฟล์:บรรทัด | เดิม | ใหม่ |
|---|---|---|
| `build.js:83` | `.replace(/\n?<script…stock-meta…/i, '')` | `RM.stripStockMeta(content.replace(/\n?<meta\s+name=["']ai-model["'][^>]*>/i, ''))` |
| `build.js:239` | `html.match(/<script…stock-meta…/i)` + `JSON.parse` | `const o = RM.readStockMeta(html); if (!o) return null;` |
| `build.js:208` | regex report-data ใน `expandReport` | `const m = html.match(RM.REPORT_DATA_RE);` (ข้อความ error คงเดิม) |
| `build.js:260` | `/<script[^>]*\bid=["']report-data["']/i.test(html)` | `RM.REPORT_DATA_RE.test(html)` |
| `tools/derived-values.js:531` | `currencyOf` regex `.px` | `const currencyOf = (html) => { const p = RM.readHeaderPrice(html); return p ? p.currency : null; };` |
| `tools/derived-values.js:624` | match stock-meta | `RM.readStockMetaState(html)` |
| `tools/derived-values.js:689,774` | `out.replace(/(<script…stock-meta…)/i, …)` | `out.replace(RM.STOCK_META_PARTS_RE, …)` |
| `tools/update-prices.js:448` | `html.match(/(<script…report-data…)/i)` | `html.match(RM.REPORT_DATA_PARTS_RE)` |
| `tools/update-prices.js:493` | replace report-data | `html.replace(RM.REPORT_DATA_PARTS_RE, (m, a, body, b) => …)` (ปรับ callback ให้รับ 3 group) |
| `tools/update-prices.js:506-507` | `need(/(<div class="px">\s*[฿$])([\d.,]+)/…)` + replace | `need(RM.PX_PARTS_RE, 'ราคา header (.px)'); out = out.replace(RM.PX_PARTS_RE, (m, a) => a + fmtPrice(newPrice));` |
| `tools/update-prices.js:700` | `html.match(/<div class="px">…/)` | `const hp = RM.readHeaderPrice(html); const px = hp ? hp.price : null;` |
| `tools/brandtheme.js:146` · `tools/fix-contrast.js:96` | `blkRe` local | `const blkRe = RM.REPORT_DATA_PARTS_RE;` |
| `test/check-reports.js:273` | `px: firstNum(grab(/<div class="px">…/))` | `px: (() => { const p = RM.readHeaderPrice(html); return p ? p.price : null; })()` |
| `test/check-reports.js:279` | `isTHB` regex `.px` | `isTHB: (() => { const p = RM.readHeaderPrice(html); return p ? p.currency === '฿' : (text.includes('฿') && !text.includes('$')); })()` |
| `test/check-reports.js:298-302` | `sm:` IIFE | `sm: RM.readStockMetaState(html),` |
| `test/check-reports.js:307-311` | `rd:` IIFE | `rd: RM.readReportData(html),` |
| `test/check-site.js:110` | `.px` regex | `const hp = RM.readHeaderPrice(html); const px = hp ? hp.price : null;` |
| `test/check-site.js:139` | stock-meta match บน dist | `RM.readStockMetaState(fs.readFileSync(…))` แล้วแยก `present/ok` เป็น error สองข้อความเดิม |
| `test/check-site.js:186` | `.test` report-data | `RM.REPORT_DATA_RE.test(…)` |
| `test/update-prices-test.js` 11 จุด | `JSON.parse(x.match(/<script…/i)[1])` | `RM.readStockMeta(x)` / `RM.readReportData(x).data` |
| `test/skeleton-test.js:196-197` | match + parse | `RM.readStockMetaState(filled).ok` / `RM.readReportData(filled).ok` |
| `tools/queue/prep.js:90` | regex `m52` | `html.match(RM.RANGE52_RE)` |

ทุกไฟล์เพิ่ม `const RM = require('<path>/report-meta.js');` (ใน test/ = `'../tools/report-meta.js'` · ใน tools/ = `'./report-meta.js'` · build.js = `'./tools/report-meta.js'`) · **ห้าม require วน**: `report-meta.js` ไม่ require ใครในรีโป

- [ ] **Step 4: รันให้ผ่าน** — `node test/self-test.js` (parser-lint ผ่าน + 283 เคสเดิม) · `npm run verify` ทั้ง 14 ขั้น · `node build.js` แล้ว `git diff --stat reports.json` ต้องว่าง (freshHash ไม่เปลี่ยน — ถ้าเปลี่ยนแปลว่า `stripStockMeta` ตัดไม่เหมือนเดิม ห้าม commit reports.json)

- [ ] **Step 5: Commit**

```bash
git add tools/report-meta.js test/parser-lint.js test/self-test.js build.js tools/derived-values.js tools/update-prices.js tools/brandtheme.js tools/fix-contrast.js tools/queue/prep.js test/check-reports.js test/check-site.js test/update-prices-test.js test/skeleton-test.js
git rm -q tools/migrate.js tools/migrate-annual-chg.js   # ถ้า Step 0 ยืนยันว่าไม่มีใครอ้าง
git commit -m "parser: report-meta.js เจ้าของเดียวของ regex stock-meta/report-data/.px (ลบสำเนา 20 จุด · คำศัพท์สกุลเงินชุดเดียว) · parser-lint กันกลับ (WS1 ข้อ 3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: parser หมวด 6 ชุดเดียว — `DV.scenarioColumns` แทน `parseScenarios` ของ gate (WS1 ข้อ 3 · code-audit §2.5 ข้อ (a)–(d))

**Files:**
- Modify: `tools/derived-values.js:258` (`SCN_COL_RE`) · `:296-337` (`scenarioBlock`) · export
- Modify: `test/check-reports.js:103-119` (`parseScenarios` → wrapper) · `:817` (export คง `parseScenarios` ไว้เพื่อ `tools/spotcheck.js`/เทสเดิม)
- Test: `test/self-test.js` — เพิ่มเคส 4 ข้อ (a)–(d)

**Interfaces:**
- Produces: `DV.SCN_COL_OPEN = /<div class="col\s+(bear|base|bull)\b[^>]*>/g` (regex เปิดคอลัมน์ตัวเดียว — ทั้งตัวตรวจและตัวเขียนใช้) · `DV.scenarioColumns(html)` → `[{ kind, tgt, eps, pe, g, ret, div }]` (รูปเดียวกับ `parseScenarios` เดิม · อ่านเฉพาะใน `<section>` ที่มี `class="scn"` · ไม่จำกัด 3 คอลัมน์) · `scenarioBlock` ใช้ `SCN_COL_OPEN` ตัวเดียวกัน (ยังคืน null เมื่อ ≠3 คอลัมน์ — เหตุผล: ตัวเขียนต้องไม่เดา)
- Consumes: ไม่มีจาก task อื่น

- [ ] **Step 1: census ความต่าง 4 ข้อ ก่อนตัดสิน** —

```bash
rtk proxy node -e "
const fs=require('fs');let n=0,notThree=0,dblSpace=0,attrs=0,stray=0;
for(const f of fs.readdirSync('reports')){if(!f.endsWith('.html'))continue;n++;const h=fs.readFileSync('reports/'+f,'utf8');
const i=h.indexOf('class=\"scn\"');const a=h.lastIndexOf('<section',i),z=h.indexOf('</section>',i);const sec=i<0?'':h.slice(a,z);
const cols=(sec.match(/<div class=\"col\s+(?:bear|base|bull)\b[^>]*>/g)||[]);if(cols.length!==3)notThree++;
if(/<div class=\"col\s{2,}/.test(sec))dblSpace++;if(cols.some(c=>!/\">$/.test(c)))attrs++;
const all=(h.match(/<div class=\"col\s+(?:bear|base|bull)\b[^>]*>/g)||[]).length;if(all!==cols.length)stray++}
console.log({n,notThree,dblSpace,attrs,stray})"
```

บันทึกตัวเลขลงคอมเมนต์เหนือ `SCN_COL_OPEN` · **กติกาตัดสิน:** `notThree === 0 && attrs === 0 && dblSpace === 0 && stray === 0` → รวมเป็น regex เดียวได้โดยไม่เปลี่ยนผลกับใบใด · ถ้าตัวใดไม่ใช่ 0 → ต้องดูใบนั้น (`grep -l`) แล้วตัดสินเป็นรายกรณีก่อน (ห้าม unify แบบทำให้ E24/W01 เงียบบนใบที่เคยตรวจได้)

- [ ] **Step 2: เคส self-test (ล้มก่อน)** — ในบล็อก W17 ของ `test/self-test.js` (หลัง `const at = …`) เพิ่ม:

```js
  // ── parser หมวด 6 ชุดเดียว (code-audit §2.5): ตัวตรวจกับตัวเขียนต้องเห็นคอลัมน์ชุดเดียวกัน ──
  {
    const cols = DV.scenarioColumns(base);
    ok(cols.length === 3 && cols.map((c) => c.kind).join() === 'bear,base,bull' && cols.every((c) => c.tgt > 0), 'scenarioColumns: BBL 3 คอลัมน์ bear/base/bull มีเป้า');
    ok(JSON.stringify(cols.map(({ tgt, eps, pe, g, ret, div }) => ({ tgt, eps, pe, g, ret, div }))) === JSON.stringify(C.scenarios.map(({ tgt, eps, pe, g, ret, div }) => ({ tgt, eps, pe, g, ret, div }))), 'scenarioColumns = ctx.scenarios (gate ใช้ parser เดียวกัน)');
    // (a) ช่องว่าง 2 ตัวใน class — ทั้งคู่ต้องเห็นเหมือนกัน (เห็นทั้งคู่ หรือไม่เห็นทั้งคู่)
    const dbl = base.replace('<div class="col bear">', '<div class="col  bear">');
    ok((DV.scenarioColumns(dbl).length === 3) === (DV.scenarioBlock(dbl) != null), '(a) class="col  bear": ตัวตรวจ/ตัวเขียนเห็นตรงกัน');
    // (b) attribute หลัง kind
    const attr = base.replace('<div class="col bear">', '<div class="col bear" id="x">');
    ok((DV.scenarioColumns(attr).length === 3) === (DV.scenarioBlock(attr) != null), '(b) <div class="col bear" id=…>: เห็นตรงกัน');
    // (c) col หลงอยู่นอก section scn — ต้องไม่นับ
    const stray = base.replace('<footer>', '<div class="col bear"><div class="tgt">$1</div></div><footer>');
    ok(DV.scenarioColumns(stray).length === 3, '(c) col นอก section scn ไม่ถูกนับ');
    // (d) 4 คอลัมน์ — ตัวเขียนต้องเงียบ (null) ตัวตรวจต้องยังอ่านได้ 4 (E24/W01 ตรวจต่อ)
    const four = base.replace(/(<div class="col bull">[\s\S]*?)(<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/, (m, a, z) => a + z.replace('</section>', '') + '<div class="col bull"><div class="tgt">$9</div></div></section>');
    ok(four !== base && DV.scenarioBlock(four) == null && DV.scenarioColumns(four).length === 4, '(d) 4 คอลัมน์: ตัวเขียนเงียบ · ตัวตรวจอ่านได้ 4');
  }
```

- [ ] **Step 3: แก้ `tools/derived-values.js`** — แทน `:258` ด้วย:

```js
// ★ regex เปิดคอลัมน์ตัวเดียวทั้งรีโป (ตัวตรวจ E24/W01/W17 + ตัวเขียน #7) — census 12 ก.ย. 69: notThree=<N> dblSpace=<N> attrs=<N> stray=<N>
const SCN_COL_OPEN = () => /<div class="col\s+(bear|base|bull)\b[^>]*>/g;
const SCN_COL_RE = () => /<div class="col\s+([a-z]+)\b[^>]*>([\s\S]*?)(?=<div class="col\s|$)/g;
```

เพิ่มฟังก์ชันหลัง `scenarioBlock`:

```js
/** คอลัมน์หมวด 6 สำหรับ **ตัวตรวจ** (E24/W01/`ctx.scenarios`) — อ่านทุกคอลัมน์ในส่วน scn ไม่จำกัด 3 (ตัวเขียนใช้ scenarioBlock ที่บังคับ 3) */
function scenarioColumns(html) {
  const h = String(html);
  const i = h.indexOf(SCN_ANCHOR);
  if (i < 0) return [];
  const a = h.lastIndexOf('<section', i), z = h.indexOf('</section>', i);
  const sec = a < 0 || z < 0 ? h.slice(i) : h.slice(a, z);
  const grab = (re, s) => { const m = s.match(re); return m ? m[1] : null; };
  const firstNum = (s) => { if (s == null) return null; const m = norm(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const out = [];
  let m;
  const re = SCN_COL_RE();
  while ((m = re.exec(sec))) {
    if (!/^(bear|base|bull)$/.test(m[1])) continue;
    const seg = m[2];
    out.push({
      kind: m[1],
      tgt: firstNum(grab(/<div class="tgt">([\s\S]*?)<\/div>/, seg)),
      eps: firstNum(grab(/EPS ปี 3<\/span>\s*<span>([\s\S]*?)<\/span>/, seg)),
      pe: firstNum(grab(/P\/E ออก<\/span>\s*<span>([\s\S]*?)<\/span>/, seg)),
      g: firstNum(grab(/EPS\s*([+\-−]?[0-9.]+)\s*%\s*\/\s*ปี/, norm(seg))),
      ret: firstNum(grab(/class="ret[^"]*">([\s\S]*?)<\/div>/, seg)),
      div: firstNum(grab(/ปันผลรวม 3 ปี<\/span>\s*<span>([\s\S]*?)<\/span>/, seg)),
    });
  }
  return out;
}
```

`scenarioBlock` (`:296-337`) เปลี่ยนตัววนคอลัมน์ให้ใช้ `SCN_COL_RE()` ตัวใหม่ (รูป `[^>]*>` — รับ attribute · `\s+` รับช่องว่าง ≥1) แล้วคงเงื่อนไข `cols.length !== 3 → null` · export เพิ่ม `SCN_COL_OPEN, scenarioColumns`

`test/check-reports.js:103-119` → `function parseScenarios(html) { return DV.scenarioColumns(html); }` (คง export ไว้)

- [ ] **Step 4: รันให้ผ่าน** — `node test/self-test.js` (4 เคสใหม่ + เคส W17/E24/W01 เดิม) · `node test/check-reports.js` → error/warning **เท่าเดิมทุกใบ** (`rtk proxy node test/check-reports.js | tail -2` เทียบกับก่อนแก้ — ถ้าเปลี่ยนแม้ 1 ใบ ต้องอธิบายได้จาก census Step 1)

- [ ] **Step 5: Commit**

```bash
git add tools/derived-values.js test/check-reports.js test/self-test.js
git commit -m "parser: หมวด 6 ใช้ regex เปิดคอลัมน์ตัวเดียว (scenarioColumns สำหรับ gate · scenarioBlock สำหรับตัวเขียน) + เคส (a)–(d) จาก code-audit §2.5

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `tools/field-manifest.js` — 68 ช่องบน extractor ที่มีอยู่ + census ทั้งคลัง (WS1 ข้อ 1–2)

**Files:**
- Create: `tools/field-manifest.js`
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/manifest-census.md` (ผลรัน `node tools/field-manifest.js --census`)
- Test: `test/self-test.js` (บล็อก manifest — โครง + extractor บน fixture)

**Interfaces:**
- Produces:
  - `FIELDS` = array 68 entry `{ id, name, cadence:'daily'|'write-once', owner:'cron'|'worker'|'build'|'sidecar', gate:[codes], healer:string|null, required:boolean|null, binding:'cron'|'gate'|'pair'|'presence'|'tool'|'deferred', pair?: { with:id, how:'money'|'date'|'contains'|'years' }, extract(html, ctx) → { found:boolean, value:any } }`
  - `extractAll(html, ctx)` → `{ values:{id→value}, found:Set, missing:[ids required], skipped:[ids optional] }` · `coverage(html, ctx)` → `{ n:68, found:number, missingRequired:[…], skippedOptional:[…] }` · `census(dir)` → ตารางอัตราที่พบต่อช่อง (CLI `--census`)
  - `ctx` = ผลของ `buildCtx` ใน `test/check-reports.js` (มี `px sm rd fvBox constFV mosBig scenarios methods pxInput baseEPS vgridFV scaleNums priceAge cards metrics chg aiModel sub symbol`) — manifest **ไม่** parse ซ้ำสิ่งที่ ctx มี
- Consumes: `RM.*` (Task 6) · `DV.scenarioColumns/summary/peCards/mcapCards/psCards/targetCells/yieldPlan/pbvPlan/scenarioPlan` · `price-date.js` (`findRestatedDate`, `parsePriceDate`, `MONTH_ALT`) · `tools/queue/footer-date.js` (`footerDate`) · `tools/tag-lib.js`

- [ ] **Step 1: โครงไฟล์ + helper + entry 68 แถว** — `tools/field-manifest.js`:

```js
'use strict';
/**
 * field-manifest.js — ทุกช่องตัวเลขในรายงาน 68 ช่อง (code-audit §1.1) ในไฟล์เดียวที่โค้ดใช้จริง (spec WS1)
 * แต่ละช่อง: ใครเขียน (cron/worker) · ใครตรวจ (gate code) · healer · cadence · extractor ที่คืน {found, value}
 * ★ extractor **ห่อ** ของที่มีอยู่ (report-meta · derived-values · buildCtx) — ห้ามเขียน regex ซ้ำ (parser-lint)
 *   regex ใหม่ได้เฉพาะ 18 แถว NEITHER ที่ไม่มีใครอ่านมาก่อน (f13 f23 f24 f25 f25b f32 f33 f41 f46 f47 f48 f49 f54 f55 f58 f60 f61 f63b)
 * required: null = ยังไม่ตัดสิน (Task 8) → Task 9 ตั้งจาก census (พบ ≥99% ของคลัง = required)
 */
const RM = require('./report-meta.js');
const DV = require('./derived-values.js');
const PD = require('./price-date.js');
const { footerDate } = require('./queue/footer-date.js');

const grab = (re, h) => { const m = String(h == null ? '' : h).match(re); return m ? m[1] : null; };
const num = (s) => { if (s == null) return null; const m = String(s).replace(/−/g, '-').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const has = (v) => v != null && !(typeof v === 'number' && !Number.isFinite(v));
const R = (value) => ({ found: has(value), value });
const card = (ctx, re) => (ctx.cards || []).find((c) => re.test(c.k)) || null;
const cardNum = (ctx, re) => { const c = card(ctx, re); return c ? num(c.v) : null; };
const rd = (ctx) => (ctx.rd && ctx.rd.ok ? ctx.rd.data : null);
const sm = (ctx) => (ctx.sm && ctx.sm.ok ? ctx.sm.data : null);
const CUR = RM.CUR_SRC;
const disc = (html) => grab(/(<div class="disc">[\s\S]*?<\/div>)/i, html) || '';
const DISC_DATE_RE = new RegExp('ราคา(?![^0-9<]{0,25}เป้า)[^0-9<]{0,25}(\\d{1,2}(?:\\s*[–\\-]\\s*\\d{1,2})?\\s*(?:' + PD.MONTH_ALT + ')\\s*(?:20\\d\\d|25\\d\\d|26\\d\\d))');
const vcell = (html, k) => grab(new RegExp('<div class="k">' + k + '</div>\\s*<div class="v"[^>]*>([\\s\\S]*?)</div>'), html);
const head = (html) => grab(/(<header[\s\S]*?<\/header>)/i, html) || '';

const F = (id, name, o) => ({ id, name, cadence: o.cadence, owner: o.owner, gate: o.gate || [], healer: o.healer || null,
  required: o.required === undefined ? null : o.required, binding: o.binding, pair: o.pair || null, extract: o.extract });

const FIELDS = [
  F('f01', '.px ราคา header', { cadence: 'daily', owner: 'cron', gate: ['E30', 'E23'], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(c.px) }),
  F('f02', 'stock-meta.price', { cadence: 'daily', owner: 'cron', gate: ['E29', 'E30', 'E31'], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(sm(c) && sm(c).price) }),
  F('f03', 'report-data.gauge.cur', { cadence: 'daily', owner: 'cron', gate: ['E19'], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(rd(c) && rd(c).gauge && rd(c).gauge.cur) }),
  F('f04', 'report-data.chart.data[]', { cadence: 'daily', owner: 'cron', gate: ['E36', 'E37', 'E39', 'W12'], healer: 'patchReport', binding: 'cron', extract: (h, c) => { const d = rd(c) && rd(c).chart && rd(c).chart.data; return { found: Array.isArray(d) && d.length > 0, value: Array.isArray(d) ? d.length : null }; } }),
  F('f05', 'chart.min/max/grid', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'cron', extract: (h, c) => { const ch = rd(c) && rd(c).chart; return R(ch && has(ch.min) && has(ch.max) ? [ch.min, ch.max] : null); } }),
  F('f06', 'chart.highlight', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(rd(c) && rd(c).chart && rd(c).chart.highlight) }),
  F('f07', 'gauge.min/max', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'cron', extract: (h, c) => { const g = rd(c) && rd(c).gauge; return R(g && has(g.min) && has(g.max) ? [g.min, g.max] : null); } }),
  F('f08', 'theme.chgBg/chgColor', { cadence: 'daily', owner: 'cron', gate: ['E34'], healer: 'patchReport', binding: 'cron', extract: (h, c) => { const t = rd(c) && rd(c).theme; return R(t && t.chgBg && t.chgColor ? [t.chgBg, t.chgColor] : null); } }),
  F('f09', '.chg ป้าย % รอบปี', { cadence: 'daily', owner: 'cron', gate: ['E35', 'E36'], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(c.chg) }),
  F('f10', 'วันที่ราคา (px-meta)', { cadence: 'daily', owner: 'cron', gate: ['E27', 'W09'], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(c.priceAge && c.priceAge.iso) }),
  F('f11', 'วันที่ทวนในวงเล็บ (คนละศักราช)', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'pair', pair: { with: 'f10', how: 'date' }, required: false, extract: (h) => { const hd = head(h); const hit = PD.findPriceDate(hd); const r = hit ? PD.findRestatedDate(hd, hit) : null; return R(r ? PD.parsePriceDate(hd.slice(r.index, r.index + r.length)) : null); } }),
  F('f12', 'disclaimer "ราคา ณ"', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'pair', pair: { with: 'f10', how: 'date' }, extract: (h) => { const m = disc(h).match(DISC_DATE_RE); return R(m ? PD.parsePriceDate(m[1]) : null); } }),
  F('f13', 'footer "ข้อมูล ณ"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', extract: (h) => { const f = footerDate(h); return R(f && f.iso); } }),
  F('f14', 'pxIn value', { cadence: 'daily', owner: 'cron', gate: ['E23'], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(c.pxInput) }),
  F('f15', 'MOS .big', { cadence: 'daily', owner: 'cron', gate: ['E16', 'E30'], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(c.mosBig) }),
  F('f16', 'stock-meta.mos/upside', { cadence: 'daily', owner: 'cron', gate: ['E30', 'E31'], healer: 'patchReport', binding: 'cron', extract: (h, c) => R(sm(c) && has(sm(c).mos) && has(sm(c).upside) ? [sm(c).mos, sm(c).upside] : null) }),
  F('f17', 'vcell ส่วนต่างจากราคา — ตัวเลข', { cadence: 'daily', owner: 'cron', gate: ['W06'], healer: 'patchDerived#11', binding: 'cron', extract: (h) => { const s = DV.readSummaryCell(h); return R(s ? s.shown : null); } }),
  F('f18', 'vcell ส่วนต่างจากราคา — ข้อความ', { cadence: 'daily', owner: 'cron', gate: ['W06'], healer: 'patchDerived#11', binding: 'cron', extract: (h) => { const s = DV.readSummaryCell(h); return R(s ? s.text : null); } }),
  F('f19', 'class mos-verdict', { cadence: 'daily', owner: 'cron', gate: ['W04'], healer: 'patchReport', binding: 'cron', extract: (h) => R(grab(/class="mos-verdict (bad|ok|good)"/, h)) }),
  F('f20', 'การ์ด P/E', { cadence: 'daily', owner: 'cron', gate: ['E41'], healer: 'patchDerived#1', binding: 'cron', required: false, extract: (h) => { const p = DV.peCards(h)[0]; return R(p ? p.shown : null); } }),
  F('f21', 'stock-meta.pe', { cadence: 'daily', owner: 'cron', gate: ['E41', 'W10'], healer: 'patchDerived#2', binding: 'cron', required: false, extract: (h, c) => R(sm(c) && sm(c).pe) }),
  F('f22', 'การ์ดเป้านักวิเคราะห์ — %', { cadence: 'daily', owner: 'cron', gate: ['E42'], healer: 'patchDerived#3', binding: 'cron', required: false, extract: (h) => { const t = DV.targetCells(h)[0]; return R(t ? t.shown : null); } }),
  F('f23', 'การ์ดเป้านักวิเคราะห์ — ราคา', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => { const t = DV.targetCells(h)[0]; return R(t ? t.target : null); } }),
  F('f24', 'เป้านักวิเคราะห์บน gauge scale', { cadence: 'write-once', owner: 'worker', gate: ['E26'], healer: null, binding: 'pair', pair: { with: 'f23', how: 'money' }, required: false, extract: (h) => R(num(grab(new RegExp(CUR + '?\\s*([\\d.,]+)\\s*<br><small>เป้า(?:เฉลี่ย)?\\s*Analyst'), h))) }),
  F('f25', 'rating นักวิเคราะห์', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => R(grab(/\(([A-Za-z][A-Za-z /-]{2,30})\)/, vcell(h, 'เป้านักวิเคราะห์[^<]*') || '')) }),
  F('f25b', 'จำนวนสำนัก n=', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => R(num(grab(/\bn\s*=\s*(\d+)/, h))) }),
  F('f26', 'การ์ด Market Cap', { cadence: 'daily', owner: 'cron', gate: ['E43'], healer: 'patchDerived#5', binding: 'cron', required: false, extract: (h, c) => { const m = c.px > 0 ? DV.mcapCards(h, c.px)[0] : null; return R(m ? m.shown : null); } }),
  F('f27', 'จำนวนหุ้น (.d ของ Market Cap)', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => { const m = c.px > 0 ? DV.mcapCards(h, c.px)[0] : null; return R(m ? m.shares : null); } }),
  F('f28', 'การ์ด P/S', { cadence: 'daily', owner: 'cron', gate: ['W16'], healer: 'patchDerived#6', binding: 'cron', required: false, extract: (h) => { const p = DV.psCards(h)[0]; return R(p ? p.shown : null); } }),
  F('f29', 'การ์ดปันผล %', { cadence: 'daily', owner: 'cron', gate: ['W19'], healer: 'patchDerived#8', binding: 'cron', required: false, extract: (h, c) => { const p = c.px > 0 ? DV.yieldPlan(h, c.px) : null; return R(p && p.cards[0] ? p.cards[0].shown : null); } }),
  F('f30', 'stock-meta.dividendYield', { cadence: 'daily', owner: 'cron', gate: ['W19', 'W10'], healer: 'patchDerived#9', binding: 'cron', required: false, extract: (h, c) => R(sm(c) && sm(c).dividendYield) }),
  F('f31', 'การ์ด P/BV', { cadence: 'daily', owner: 'cron', gate: ['W20'], healer: 'patchDerived#10', binding: 'cron', required: false, extract: (h, c) => { const p = c.px > 0 ? DV.pbvPlan(h, c.px)[0] : null; return R(p && p.items && p.items[0] ? p.items[0].shown : null); } }),
  F('f32', 'การ์ด BVPS', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /^BVPS/i)) }),
  F('f33', 'การ์ด EPS (TTM)', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /^EPS/i)) }),
  F('f34', 'หมวด 6 ผลตอบแทนรวม %', { cadence: 'daily', owner: 'cron', gate: ['W17'], healer: 'patchDerived#7', binding: 'cron', required: false, extract: (h, c) => { const p = c.px > 0 ? DV.scenarioPlan(h, c.px) : null; return R(p ? p.items.map((it) => it.total ? DV.retShown(it.total.token) : null) : null); } }),
  F('f35', 'หมวด 6 %/ปี', { cadence: 'daily', owner: 'cron', gate: ['W17'], healer: 'patchDerived#7', binding: 'cron', required: false, extract: (h, c) => { const p = c.px > 0 ? DV.scenarioPlan(h, c.px) : null; return R(p && p.items.some((it) => it.py) ? p.items.map((it) => it.py ? DV.retShown(it.py.token) : null) : null); } }),
  F('f36', 'หมวด 6 "จากจุดเข้า"', { cadence: 'daily', owner: 'cron', gate: ['W17'], healer: 'patchDerived#7', binding: 'cron', required: false, extract: (h) => { const b = DV.scenarioBlock(h); return R(b && b.hint ? b.hint.value : null); } }),
  F('f37', 'หมวด 6 ราคาเป้า 3 ฉาก', { cadence: 'write-once', owner: 'worker', gate: ['W01'], healer: null, binding: 'gate', extract: (h, c) => R(c.scenarios.length === 3 && c.scenarios.every((s) => s.tgt > 0) ? c.scenarios.map((s) => s.tgt) : null) }),
  F('f38', 'หมวด 6 class ret pos/neg', { cadence: 'never', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => { const m = h.match(/class="ret (pos|neg)"/g); return R(m ? m.length : null); } }),
  F('f39', 'หมวด 6 ปันผลรวม 3 ปี', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(c.scenarios.some((s) => s.div != null) ? c.scenarios.map((s) => s.div) : null) }),
  F('f40', 'หมวด 6 EPS ฐาน', { cadence: 'write-once', owner: 'worker', gate: ['E24'], healer: null, binding: 'gate', extract: (h, c) => R(c.baseEPS) }),
  F('f41', 'กรอบ 52 สัปดาห์', { cadence: 'stale-daily', owner: 'worker', gate: ['W08'], healer: null, binding: 'pair', pair: { with: 'f01', how: 'contains' }, extract: (h) => { const m = h.match(RM.RANGE52_RE); return R(m ? [num(m[1]), num(m[2])] : null); } }),
  F('f42', 'บรรทัดที่มา', { cadence: 'write-once', owner: 'worker', gate: ['W08'], healer: null, binding: 'gate', extract: (h) => R(grab(/ที่มา:\s*([^<]{3,})/, head(h))) }),
  F('f43', '.fv-box .r FV', { cadence: 'write-once', owner: 'worker', gate: ['E15', 'E25', 'E30'], healer: null, binding: 'gate', extract: (h, c) => R(c.fvBox) }),
  F('f44', 'report-data.fv (const FV)', { cadence: 'write-once', owner: 'worker', gate: ['E15'], healer: null, binding: 'gate', extract: (h, c) => R(c.constFV) }),
  F('f45', 'report-data.gauge.fair', { cadence: 'write-once', owner: 'worker', gate: ['E19'], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, extract: (h, c) => R(rd(c) && rd(c).gauge && rd(c).gauge.fair) }),
  F('f46', 'report-data.chart.fairLine', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, extract: (h, c) => R(rd(c) && rd(c).chart && rd(c).chart.fairLine) }),
  F('f47', 'legend "มูลค่าเหมาะสม $FV"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, extract: (h) => R(num(grab(new RegExp('มูลค่าเหมาะสม\\s*' + CUR + '?\\s*([\\d.,]+)\\s*</span>'), grab(/<div class="legend">([\s\S]*?)<\/div>/, h) || ''))) }),
  F('f48', 'การ์ด "โซนเริ่มทยอยสะสม < $FV"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, extract: (h, c) => { const k = card(c, /โซนเริ่มทยอยสะสม/); return R(k ? num(k.v.replace(/^[^0-9]*(?:<|&lt;)/, '')) : null); } }),
  F('f49', 'ป้าย gauge mFair "เหมาะสม $FV"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, extract: (h) => R(num(grab(new RegExp('id="mFair"><div class="lab"[^>]*>เหมาะสม\\s*' + CUR + '?\\s*([\\d.,]+)'), h))) }),
  F('f50', 'ป้าย gauge mCur "ปัจจุบัน $px"', { cadence: 'daily', owner: 'cron', gate: [], healer: 'patchReport', binding: 'pair', pair: { with: 'f01', how: 'money' }, extract: (h) => R(num(grab(new RegExp('id="mCur"><div class="lab">ปัจจุบัน\\s*' + CUR + '?\\s*([\\d.,]+)'), h))) }),
  F('f51', 'gauge scale MOS20/MOS30', { cadence: 'write-once', owner: 'worker', gate: ['E26'], healer: null, binding: 'gate', extract: (h, c) => R(c.scaleNums.length >= 4 ? c.scaleNums : null) }),
  F('f52', 'การ์ดจุดซื้อ MOS20/MOS30', { cadence: 'write-once', owner: 'worker', gate: ['E18'], healer: null, binding: 'gate', extract: (h, c) => { const a = cardNum(c, /จุดซื้อ MOS 20/), b = cardNum(c, /จุดซื้อ MOS 30/); return R(a != null && b != null ? [a, b] : null); } }),
  F('f53', 'gauge scale กรอบบน FV', { cadence: 'write-once', owner: 'worker', gate: ['E26'], healer: null, binding: 'gate', extract: (h) => R(num(grab(new RegExp(CUR + '?\\s*([\\d.,]+)\\s*<br><small>กรอบบน'), h))) }),
  F('f54', 'vcell กรอบ (FV_LOW–FV_HIGH)', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f43', how: 'range' }, extract: (h) => { const v = vcell(h, 'มูลค่าเหมาะสม') || ''; const m = v.match(new RegExp('\\(\\s*' + CUR + '?\\s*([\\d.,]+)\\s*[–\\-]\\s*' + CUR + '?\\s*([\\d.,]+)\\s*\\)')); return R(m ? [num(m[1]), num(m[2])] : null); } }),
  F('f55', 'การ์ด "P/E เฉลี่ย ~N ปี"', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'pair', pair: { with: 'f04', how: 'years' }, required: false, extract: (h, c) => { const k = card(c, /P\/E เฉลี่ย/); return R(k ? num(grab(/~?\s*(\d+)\s*ปี/, k.k)) : null); } }),
  F('f56', 'การ์ด ROE / ROA', { cadence: 'write-once', owner: 'worker', gate: ['W07', 'W10'], healer: null, binding: 'gate', required: false, extract: (h, c) => R(c.metrics.roe) }),
  F('f57', 'stock-meta.roe', { cadence: 'write-once', owner: 'worker', gate: ['E29', 'W10'], healer: null, binding: 'gate', required: false, extract: (h, c) => R(sm(c) && sm(c).roe) }),
  F('f58', 'การ์ดกำไรสุทธิ / YoY', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /กำไรสุทธิ|net (?:profit|income)/i)) }),
  F('f59', 'การ์ดรายได้ TTM', { cadence: 'write-once', owner: 'worker', gate: ['W16'], healer: null, binding: 'gate', required: false, extract: (h, c) => R(cardNum(c, /รายได้|revenue/i)) }),
  F('f60', 'การ์ดอัตรากำไรขั้นต้น', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /กำไรขั้นต้น|gross margin/i)) }),
  F('f61', 'การ์ด Beta', { cadence: 'write-once', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h, c) => R(cardNum(c, /^Beta/i)) }),
  F('f62', '.mval ต่อวิธี', { cadence: 'write-once', owner: 'worker', gate: ['E21', 'E22', 'W14', 'W05', 'W18'], healer: null, binding: 'gate', extract: (h, c) => R(c.methods.length ? c.methods.map((m) => m.val) : null) }),
  F('f63', '.mdesc ตัวคูณ', { cadence: 'write-once', owner: 'worker', gate: ['W18'], healer: null, binding: 'gate', extract: (h, c) => R(c.methods.length ? c.methods.map((m) => m.desc) : null) }),
  F('f63b', '"จาก ATH −X%" ใน prose', { cadence: 'stale-daily', owner: 'worker', gate: [], healer: null, binding: 'presence', required: false, extract: (h) => R(num(grab(/จาก\s*ATH\s*([+\-−–]?\s*[\d.]+)\s*%/, h))) }),
  F('f64', 'ราคาใน prose', { cadence: 'stale-daily', owner: 'worker', gate: [], healer: null, binding: 'deferred', required: false, extract: (h) => { const m = h.match(/ราคา(?:ปัจจุบัน|ล่าสุด)\s*(?:C\$|[฿$])\s*[\d.,]+/g); return { found: !!m, value: m ? m.length : 0 }; } }),   // ระยะ 2 (ข้อ A/B token) · spotcheck เป็นตัวชี้
  F('f65', '% ของราคาเป้าใน prose', { cadence: 'stale-daily', owner: 'worker', gate: ['W15'], healer: 'patchDerived#4', binding: 'gate', required: false, extract: (h) => { const m = h.match(new RegExp(DV.MONEY_PCT_SRC, 'g')); return { found: !!m, value: m ? m.length : 0 }; } }),
  F('f66', 'meta ai-model', { cadence: 'write-once', owner: 'worker', gate: ['E28'], healer: null, binding: 'gate', extract: (h, c) => R(c.aiModel) }),
  F('f67', '.sub คำโปรย', { cadence: 'write-once', owner: 'worker', gate: ['E32'], healer: null, binding: 'gate', extract: (h, c) => R(c.sub || null) }),
  F('f68', 'tags (sidecar)', { cadence: 'out-of-band', owner: 'sidecar', gate: ['E40', 'W13'], healer: null, binding: 'gate', required: false, extract: (h, c) => { const T = require('./tag-lib.js'); const t = T.tagsOf(c.symbol, T.loadTags()); return R(t.length ? t : null); } }),
];
if (FIELDS.length !== 68) throw new Error(`field-manifest: ต้องมี 68 ช่อง (ได้ ${FIELDS.length})`);

function extractAll(html, ctx) {
  const values = {}, found = new Set(), missing = [], skipped = [];
  for (const f of FIELDS) {
    let r;
    try { r = f.extract(html, ctx) || { found: false, value: null }; } catch (e) { r = { found: false, value: null, err: e.message }; }
    values[f.id] = r.value;
    if (r.found) found.add(f.id);
    else if (f.required === false) skipped.push(f.id);
    else missing.push(f.id);
  }
  return { values, found, missing, skipped };
}
function coverage(html, ctx) {
  const r = extractAll(html, ctx);
  return { n: FIELDS.length, found: r.found.size, missingRequired: r.missing, skippedOptional: r.skipped };
}
/** census ทั้งคลัง — อัตราที่พบต่อช่อง (ใช้ตัดสิน required · ต้องรันกับ ctx จริงของ gate) */
function census(dir, buildCtx, expandReport) {
  const fs = require('fs'), path = require('path');
  const files = fs.readdirSync(dir).filter((f) => /\.html$/i.test(f)).sort();
  const hit = Object.fromEntries(FIELDS.map((f) => [f.id, 0]));
  const errs = Object.fromEntries(FIELDS.map((f) => [f.id, 0]));
  for (const f of files) {
    const html = expandReport(fs.readFileSync(path.join(dir, f), 'utf8'));
    const ctx = buildCtx(html, f);
    for (const fd of FIELDS) {
      let r; try { r = fd.extract(html, ctx); } catch (e) { errs[fd.id]++; continue; }
      if (r && r.found) hit[fd.id]++;
    }
  }
  return { files: files.length, rows: FIELDS.map((f) => ({ id: f.id, name: f.name, binding: f.binding, found: hit[f.id], rate: hit[f.id] / files.length, errors: errs[f.id], required: f.required })) };
}
module.exports = { FIELDS, extractAll, coverage, census };

if (require.main === module && process.argv.includes('--census')) {
  const { buildCtx, REPORTS_DIR } = require('../test/check-reports.js');
  const { expandReport } = require('../build.js');
  const c = census(REPORTS_DIR, buildCtx, expandReport);
  console.log(`| id | ช่อง | binding | พบ | อัตรา | extractor error | required |\n|---|---|---|---|---|---|---|`);
  for (const r of c.rows) console.log(`| ${r.id} | ${r.name} | ${r.binding} | ${r.found}/${c.files} | ${(r.rate * 100).toFixed(1)}% | ${r.errors} | ${r.required} |`);
}
```

> `DV.readSummaryCell` (f17/f18) ยังไม่มีจนกว่า Task 11 — ใน task นี้เพิ่ม **เวอร์ชันอ่านอย่างเดียว** ลง `tools/derived-values.js` ก่อน (Task 11 ต่อยอดเป็น `summaryPlan`):
>
> ```js
> // ช่องสรุป "ส่วนต่างจากราคา" (vcell หมวด 8) — อ่านอย่างเดียว (ตัวเขียน = summaryPlan ระยะ 1 ส่วน C)
> const SUMMARY_RE = /(<div class="k">ส่วนต่างจากราคา<\/div>\s*<div class="v"[^>]*>)([\s\S]*?)(<\/div>)/;
> function readSummaryCell(html) {
>   const m = String(html).match(SUMMARY_RE);
>   if (!m) return null;
>   const text = clean(m[2]);
>   const pm = norm(text).match(/([+\-]?)\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
>   return { at: m.index + m[1].length, len: m[2].length, raw: m[2], text, shown: pm ? parseFloat(pm[1] + pm[2]) : null };
> }
> ```
> + export `SUMMARY_RE, readSummaryCell` · `require('./tag-lib.js')` ใน f68 ใช้ lazy require กัน cycle (tag-lib ไม่ require gate)

- [ ] **Step 2: เทสโครง + extractor บน fixture (ล้มก่อน)** — ใน `test/self-test.js` ก่อนบล็อก E-policy:

```js
// ── field manifest (ระยะ 1 WS1): 68 ช่อง · ห่อ extractor เดิม · บน BBL fixture ต้องพบช่อง cron ครบ ──
{
  const MF = require('../tools/field-manifest.js');
  ok(MF.FIELDS.length === 68 && new Set(MF.FIELDS.map((f) => f.id)).size === 68, 'manifest: 68 ช่อง id ไม่ซ้ำ');
  ok(MF.FIELDS.every((f) => typeof f.extract === 'function' && ['cron', 'gate', 'pair', 'presence', 'tool', 'deferred'].includes(f.binding)), 'manifest: ทุกช่องมี extract + binding ที่รู้จัก');
  ok(MF.FIELDS.filter((f) => f.pair).every((f) => MF.FIELDS.some((g) => g.id === f.pair.with)), 'manifest: pair.with ชี้ไป id ที่มีจริง');
  const r = MF.extractAll(base, C);
  for (const id of ['f01', 'f02', 'f03', 'f04', 'f09', 'f10', 'f13', 'f14', 'f15', 'f16', 'f17', 'f19', 'f43', 'f44', 'f45', 'f46', 'f47', 'f49', 'f50', 'f51', 'f52', 'f54', 'f62', 'f66', 'f67'])
    ok(r.found.has(id), `manifest: BBL fixture พบ ${id} (${MF.FIELDS.find((f) => f.id === id).name})`, JSON.stringify(r.values[id]));
  ok(r.values.f01 === C.px && r.values.f44 === C.constFV && r.values.f50 === C.px, 'manifest: f01 = ctx.px · f44 = const FV · f50 (ป้าย mCur) = ราคา');
  ok(r.values.f47 === C.constFV && r.values.f49 === C.constFV && r.values.f46 === C.constFV, 'manifest: legend/mFair/fairLine = FV บน fixture สะอาด');
  // extractor ต้องคืน found:false ไม่ throw เมื่อไม่มีช่อง
  const gone = base.replace(/id="mFair"><div class="lab"[^>]*>เหมาะสม/, 'id="mFair"><div class="lab">xx');
  const r2 = MF.extractAll(gone, C);
  ok(!r2.found.has('f49') && r2.values.f49 == null, 'manifest: ลบป้าย mFair → f49 found:false (ไม่ throw)');
}
```

(`base` = `expandReport(FX.BBL())` · `C` = `buildCtx(base, 'BBL.html')` ที่ไฟล์มีอยู่แล้ว)

- [ ] **Step 3: รันให้ผ่าน** — `node test/self-test.js` · ทุก id ในลิสต์ต้องพบบน BBL — ถ้าช่องไหนไม่พบ ให้ดู fixture ว่า BBL มีช่องนั้นจริงไหม (เช่น f39 ปันผลรวม 3 ปี) แล้วเอาออกจากลิสต์ "ต้องพบ" พร้อมเหตุผลในคอมเมนต์ **ห้ามแก้ extractor ให้ผ่านโดยเดา**

- [ ] **Step 4: census ทั้งคลัง** — `rtk proxy node tools/field-manifest.js --census > docs/superpowers/audit/2026-09-11-stock-analyzer/manifest-census.md` แล้วเติมหัวไฟล์: วันที่ · commit · จำนวนไฟล์ · กติกา required (อัตรา ≥99% = required · ต่ำกว่า = optional · ช่องที่ `extractor error` > 0 ต้องแก้ extractor ก่อน) · สรุปช่อง NEITHER 18 แถวเดิมว่าแต่ละแถวได้ binding อะไร (`pair` / `presence`) — ตารางนี้คือหลักฐานของเกณฑ์จบ "NEITHER 18 → 0"

- [ ] **Step 5: Commit**

```bash
git add tools/field-manifest.js tools/derived-values.js test/self-test.js docs/superpowers/audit/2026-09-11-stock-analyzer/manifest-census.md
git commit -m "manifest: tools/field-manifest.js 68 ช่องบน extractor เดิม (required ยังไม่ตัดสิน) + census ทั้งคลัง (WS1 ข้อ 1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: coverage ต่อไฟล์ใน gate + W21 (ช่อง required อ่านไม่ได้) + W22 (ค่าเดียวกันคนละที่ไม่ตรง) + `need()`-log ของ 3 ช่อง UNVERIFIED WRITE + spotcheck/postcheck อ่าน manifest (WS1 ข้อ 2 · WS2 ข้อ 6)

**Files:**
- Modify: `tools/field-manifest.js` (ตั้ง `required` จาก census · เพิ่ม `checkPairs`)
- Modify: `test/check-reports.js` (`buildCtx` เพิ่ม `mf` · CHECKS เพิ่ม W21/W22 · `main()` พิมพ์ coverage · `checkHtml` คืน `coverage`)
- Modify: `tools/update-prices.js:531-536` (disclaimer) · `:522-528` (restated) — log `found:false` แทนเงียบ · `gateAfterPatch` ไม่เปลี่ยน
- Modify: `tools/spotcheck.js:34-71` (พิมพ์ช่องที่ข้าม) · `tools/queue/postcheck.js:60-70` (แนบ coverage ใน issues เมื่อ missingRequired > 0)
- Test: `test/self-test.js` (W21/W22 · coverage) · `test/update-prices-test.js` (log found:false)

**Interfaces:**
- Produces: `MF.checkPairs(values, ctx)` → `[{ id, with, msg }]` · `MF.PAIR_TOL = { money: (a, b, shown) => DV.fmtLikeNum(a, String(shown)) === String(shown) || Math.abs(a - b) <= 0.01 * Math.abs(b), date: iso ตรงกัน, contains: lo ≤ px ≤ hi, range: [lo,hi] ตรง fv-box กรอบ ±1%, years: N ≤ ปีในกราฟ + 1 }` · `checkHtml()` คืนเพิ่ม `coverage:{ n, found, missingRequired, skippedOptional }` · บรรทัดต่อไฟล์ `✓ AAPL.html 47/47 ผ่าน · ช่อง 61/68 (ข้าม 7)` · บรรทัดสรุป `สรุป: … • ช่องต่ำสุด 55/68 (SYM)`
- W21 `level:'warn'` label `'ช่องที่ต้องมีอ่านไม่ได้ (manifest)'` · W22 `level:'warn'` label `'ค่าเดียวกันคนละที่ไม่ตรงกัน (manifest pair)'` — ทั้งคู่ไม่มี healer (W ไม่ต้อง) · **ห้ามเป็น E ในระยะนี้** (spec §8 — จะยกเมื่อมี healer ระยะ 2)

- [ ] **Step 1: ตั้ง `required` จาก census** — แก้ค่า `required` ใน `FIELDS` ตาม `manifest-census.md`: อัตรา ≥99% → `true` (ลบ `required:false` ที่ใส่ไว้) · <99% → `false` · บันทึกอัตราจริงในคอมเมนต์ท้าย entry ที่เปลี่ยน (`// census 12 ก.ย. 69: 100%`) · ช่องที่ `extractor error` > 0 ต้องแก้ extractor ก่อนตั้ง required

- [ ] **Step 2: `checkPairs` ใน manifest** — เพิ่มใน `tools/field-manifest.js`:

```js
const yearsInChart = (ctx) => { const d = rd(ctx) && rd(ctx).chart && rd(ctx).chart.data; if (!Array.isArray(d) || d.length < 2) return null; const ys = d.map((p) => String(p[0] || '').match(/\d{4}/)).filter(Boolean).map((m) => +m[0]); return ys.length ? Math.max(...ys) - Math.min(...ys) + 1 : null; };
const moneyEq = (a, b) => a != null && b != null && (DV.fmtLikeNum(b, String(a)) === String(a) || Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.005));
const PAIR_HOW = {
  money: (v, w) => (moneyEq(v, w) ? null : `${v} ≠ ${w}`),
  date: (v, w) => (v && w && v.iso === w.iso ? null : `${v && v.iso} ≠ ${w && w.iso}`),
  contains: (v, w) => (Array.isArray(v) && w != null && v[0] <= w && w <= v[1] ? null : `ราคา ${w} อยู่นอกกรอบ ${v && v.join('–')} ที่พิมพ์ (กรอบค้าง — fix-on-touch)`),
  range: (v, w, ctx) => { const fb = ctx.html.match(/กรอบ\s*(?:C\$|[฿$])?\s*([\d.,]+)\s*[–\-]\s*(?:C\$|[฿$])?\s*([\d.,]+)/); if (!fb || !Array.isArray(v)) return null; const lo = num(fb[1]), hi = num(fb[2]); return moneyEq(v[0], lo) && moneyEq(v[1], hi) ? null : `vcell (${v.join('–')}) ≠ กรอบ .fv-box (${lo}–${hi})`; },
  years: (v, w, ctx) => { const y = yearsInChart(ctx); return y == null || v == null || v <= y + 1 ? null : `ป้าย ~${v} ปี แต่กราฟมีข้อมูล ${y} ปี (IPO ใหม่กว่าป้าย — เคส GABLE)`; },
};
function checkPairs(values, ctx) {
  const out = [];
  for (const f of FIELDS.filter((f) => f.pair)) {
    const v = values[f.id], w = values[f.pair.with];
    if (v == null || w == null) continue;                       // ช่องใดหาย = เรื่องของ W21/coverage ไม่ใช่ pair
    const msg = PAIR_HOW[f.pair.how](v, w, ctx);
    if (msg) out.push({ id: f.id, with: f.pair.with, msg: `${f.name} ↔ ${FIELDS.find((g) => g.id === f.pair.with).name}: ${msg}` });
  }
  // stock-meta.roe ต้อง null เมื่อขาดทุน (open-item #14) — กฎเดี่ยว ไม่ใช่ pair แต่เป็นความสอดคล้องระหว่างช่อง
  const s = sm(ctx);
  if (s && ctx.baseEPS != null && ctx.baseEPS <= 0 && typeof s.roe === 'number' && s.roe > 0) out.push({ id: 'f57', with: 'f40', msg: `stock-meta.roe = ${s.roe} แต่ EPS ฐาน ${ctx.baseEPS} ≤ 0 (ขาดทุน → roe ต้อง null — เคส OKJ)` });
  return out;
}
```

(export เพิ่ม `checkPairs, PAIR_HOW`) — `f12`/`f11` ใช้ `how:'date'` เทียบ `.iso` ของ `parsePriceDate` · f11 เป็นคนละศักราชกับ f10 แต่ `parsePriceDate` คืน iso ค.ศ. เดียวกันอยู่แล้ว

- [ ] **Step 3: W21/W22 + coverage ใน gate (เทสล้มก่อน)** — self-test:

```js
// ── W21/W22 + coverage (ระยะ 1 WS1 ข้อ 2): gate ต้องรู้ว่าตัวเองอ่านอะไรไม่ได้ ──
{
  const r0 = checkHtml(base, 'BBL.html');
  ok(r0.coverage && r0.coverage.n === 68 && r0.coverage.found >= 50 && r0.coverage.missingRequired.length === 0, `coverage: BBL fixture found ${r0.coverage && r0.coverage.found}/68 · required ครบ`, JSON.stringify(r0.coverage));
  rejectBase('W21', 'ฐาน BBL: ช่อง required ครบ → W21 เงียบ');
  rejectBase('W22', 'ฐาน BBL: ทุกคู่ตรงกัน → W22 เงียบ');
  expect('W21', 'warn', (h) => h.replace(/id="mCur"><div class="lab">ปัจจุบัน\s*฿?[\d.,]+/, 'id="mCur"><div class="lab">ปัจจุบัน'), 'ลบตัวเลขป้าย mCur (f50 required) → W21');
  expect('W22', 'warn', (h) => h.replace(/(id="mFair"><div class="lab"[^>]*>เหมาะสม\s*฿?)([\d.,]+)/, (m, a, v) => a + (parseFloat(v.replace(/,/g, '')) * 1.5).toFixed(2)), 'ป้าย mFair ≠ FV → W22');
  expect('W22', 'warn', (h) => h.replace(/"fairLine"\s*:\s*[\d.]+/, '"fairLine":1'), 'chart.fairLine ≠ FV → W22');
  expect('W22', 'warn', (h) => h.replace(/(id="mCur"><div class="lab">ปัจจุบัน\s*฿?)([\d.,]+)/, (m, a, v) => a + (parseFloat(v.replace(/,/g, '')) * 2).toFixed(2)), 'ป้าย mCur ≠ .px (UNVERIFIED WRITE #50) → W22');
  expect('W22', 'warn', (h) => h.replace(/(<div class="disc">[\s\S]*?ราคา[^0-9<]{0,25})(\d{1,2})(\s*[ก-๙.]+\s*\d{4})/, (m, a, d, z) => a + (d === '1' ? '2' : '1') + z), 'วันที่ disclaimer ≠ วันที่ราคา (UNVERIFIED WRITE #12) → W22');
  expect('W22', 'warn', (h) => h.replace(/(<div class="k">P\/E เฉลี่ย ~)(\d+)(\s*ปี)/, '$19$3'), 'ป้าย "P/E เฉลี่ย ~9 ปี" บนกราฟ 2 ปี → W22 (เคส GABLE)');
}
```

(เคส disclaimer ต้องตรวจก่อนว่า BBL fixture มี "ราคา ณ <วัน> <เดือน> <ปี>" ใน `.disc` — ถ้าไม่มีให้ใช้ `expect` บนใบที่เติมประโยคเข้าไปเอง · เคส P/E เฉลี่ยเช่นกัน — ไม่มีการ์ดใน BBL ให้ `addCardKV('P/E เฉลี่ย ~9 ปี', '20x', 'ช่วง 15–25x')`)

- [ ] **Step 4: โค้ด gate** — `test/check-reports.js`:
  - บนสุด: `const MF = require('../tools/field-manifest.js');`
  - ใน `buildCtx` เพิ่มฟิลด์สุดท้าย `html,` (ถ้ายังไม่มี) แล้วหลังสร้าง object: `ctx.mf = MF.extractAll(html, ctx); return ctx;` (manifest ต้องได้ ctx ที่ครบก่อน)
  - CHECKS เพิ่มท้ายสุด:

```js
  // ── W21/W22 (ระยะ 1 WS1): coverage ของ manifest — "เงียบ" ไม่ใช่ "สะอาด" อีกต่อไป ──
  { id: 'W21', level: 'warn', label: 'ช่องที่ต้องมีอ่านไม่ได้ (manifest)', fn: (c) => c.mf.missing.length ? `อ่านไม่ได้ ${c.mf.missing.length} ช่อง: ${c.mf.missing.map((id) => `${id} ${MF.FIELDS.find((f) => f.id === id).name}`).join(' · ')}` : null },
  { id: 'W22', level: 'warn', label: 'ค่าเดียวกันคนละที่ไม่ตรงกัน (manifest pair)', fn: (c) => { const bad = MF.checkPairs(c.mf.values, c); return bad.length ? bad.map((b) => b.msg).join(' ; ') : null; } },
```

  - `checkHtml` คืนเพิ่ม `coverage: { n: MF.FIELDS.length, found: ctx.mf.found.size, missingRequired: ctx.mf.missing, skippedOptional: ctx.mf.skipped }`
  - `main()` บรรทัด `✓`/`✗`: ต่อท้ายด้วย `` · ช่อง ${r.coverage.found}/${r.coverage.n}${r.coverage.skippedOptional.length ? ` (ข้าม ${r.coverage.skippedOptional.length})` : ''} `` · สรุปท้าย: เก็บ `minCov = { found, name }` แล้วพิมพ์ `• ช่องต่ำสุด ${minCov.found}/68 (${minCov.name})` ต่อบรรทัด `สรุป:`

- [ ] **Step 5: `update-prices.js` — 2 จุดเขียนเงียบต้องบอกว่าเขียนหรือไม่** — `:531-536` (disclaimer) และ `:522` (restated): ครอบด้วยตัวนับแล้ว `console.log` เมื่อไม่พบ:

```js
  // --- disclaimer: "ราคา ณ <วันที่>" — ไม่พบ = ไม่ throw (ใบเก่าบางใบไม่มีประโยคนี้) แต่ต้องบอก ไม่เงียบ (UNVERIFIED WRITE #12 · W22 ตรวจผลอีกชั้น) ---
  let discHits = 0;
  out = out.replace(/(<div class="disc">[\s\S]*?<\/div>)/i, (block) => block.replace(new RegExp(`…เดิม…`, 'g'), (m, pre, tok, yr) => { discHits++; …เดิม… }));
  if (!discHits) notes.push('disclaimer: ไม่พบ "ราคา ณ <วันที่>" — ไม่ได้เขียน (found:false)');
```

`notes` = array ที่ `patchReport` คืนเพิ่ม (`return { html: out, changed, chg, mos, notes }`) · main loop พิมพ์ `notes` ต่อท้ายบรรทัด `✓ SYM …` เป็น ` · ⚠ ${notes.join(' · ')}` · restated (`:522`) เช่นกัน: `if (!restate) notes.push('วันที่ทวนในวงเล็บ: ไม่พบ (found:false)')` **เฉพาะเมื่อ header มีวงเล็บติดวันที่** (ไม่งั้นทุกใบจะโดน) — ใช้ `/\(\s*\d{1,2}\s*[ก-๙.]+\s*\d{4}\s*\)/.test(headM[0])` เป็นเงื่อนไข · เทสใน `update-prices-test.js`: fixture AAPL ที่ลบประโยค "ราคา ณ" ใน `.disc` → `r.notes` มีข้อความ found:false · fixture ปกติ → `notes` ว่าง

- [ ] **Step 6: spotcheck + postcheck อ่าน manifest** — `tools/spotcheck.js` ใน `spotcheck()` เพิ่มบรรทัดแรก: `const cov = c.mf; if (cov.skipped.length) out.push(`▸ ช่องที่ manifest ข้าม (optional ไม่พบ) ${cov.skipped.length}: ${cov.skipped.join(' ')}`);` (ใช้ `c` = buildCtx ที่มีอยู่) · `tools/queue/postcheck.js` หลัง `issues.push(...checkMeta(…))`: `if (ctx.mf.missing.length) issues.push(`manifest: ช่อง required อ่านไม่ได้ ${ctx.mf.missing.join(' ')} (W21 — worker เขียนโครงไม่ครบ)`);`

- [ ] **Step 7: รันให้ผ่าน + วัด** — `node test/self-test.js` · `rtk proxy node test/check-reports.js | tail -3` → บันทึกจำนวน W21/W22 ที่ยิงทั้งคลัง (คาด W22 หลายสิบใบ: กรอบ 52 สัปดาห์ค้าง · legend/ป้าย FV ไม่ตรง — เป็นหนี้เก่าที่ gate เพิ่งเห็น **ไม่ต้องแก้ในระยะนี้** จดลง `manifest-census.md` §"ผลหลังเปิด W21/W22") · `npm run verify` ผ่าน (W ไม่บล็อก)

- [ ] **Step 8: Commit + เปิด PR #B**

```bash
git add tools/field-manifest.js test/check-reports.js test/self-test.js tools/update-prices.js test/update-prices-test.js tools/spotcheck.js tools/queue/postcheck.js docs/superpowers/audit/2026-09-11-stock-analyzer/manifest-census.md
git commit -m "gate: coverage ต่อไฟล์จาก manifest · W21 ช่อง required อ่านไม่ได้ · W22 คู่ค่าเดียวกันไม่ตรง (NEITHER 18 → 0 · UNVERIFIED WRITE 3 → 0) · cron log found:false แทนเงียบ

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p1-b-manifest
gh pr create --base claude/audit-p1-a-cron-gate --title "audit ระยะ 1 ส่วน B: field manifest 68 ช่อง · regex เจ้าของเดียว · parser หมวด 6 เดียว · coverage + W21/W22 (WS1)" --body-file - <<'PRBODY'
## สรุป
- `tools/report-meta.js` เจ้าของเดียวของ regex stock-meta/report-data/.px (ลบสำเนา ~20 จุด · `test/parser-lint.js` กันกลับ) · `DV.scenarioColumns` parser หมวด 6 ชุดเดียว (census (a)–(d) = <ตัวเลข>)
- `tools/field-manifest.js` 68 ช่องบน extractor เดิม · census ทั้งคลัง (`manifest-census.md`) · required จากอัตราจริง
- gate พิมพ์ `ช่อง x/68` ทุกไฟล์ · W21 (required อ่านไม่ได้) · W22 (pair ไม่ตรง: fairLine/legend/mFair/vcell = FV · mCur = .px · วันที่ disclaimer/วงเล็บ = วันที่ราคา · ราคาในกรอบ 52wk · "P/E เฉลี่ย ~N ปี" ≤ ปีในกราฟ · roe null เมื่อขาดทุน) — NEITHER 18 → 0 · UNVERIFIED WRITE 3 → 0 (binding ต่อแถวใน census)
- W21/W22 ยิงทั้งคลัง <N>/<N> ใบ = หนี้เก่าที่เพิ่งมองเห็น (W ไม่บล็อก · ระยะ 3)

## ทดสอบ
- `npm run verify` 14/14 · self-test +<N> เคส · `reports.json` ไม่เปลี่ยน (freshHash เดิม)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

---

# ส่วน C — WS6 นโยบายคิว (ข้อ D(ข)) + open-items #22 (PR #C)

สาขา: `claude/audit-p1-c-queue-policy` (base = `claude/audit-p1-b-manifest`)

> ลำดับใน C บังคับ (advisor): dead-band (10) → ช่องสรุปเป็นโครงสร้าง + W06 ใหม่ (11) → **กวาดครั้งเดียว** (12 — W06 จะกระโดด 51→~252 ชั่วคราวระหว่าง 11 กับ 12 เป็น W ไม่บล็อก) → triage flip ไม่ส่ง LLM (13) → คิวตามอายุ (14) → คิวถาวรข้าม worktree (15) → nits (16) → **ปฏิทินงบเป็น task สุดท้าย** พร้อม fallback (17) — การวัด "คิว LLM −50%" ใน Part F วัดจากกฎ flip→PREPATCH อย่างเดียว (ไม่มีปฏิทินย้อนหลัง)

### Task 10: dead-band ±3 → ±5 ที่เจ้าของเดียว + ล้างเลข "3" ที่ค้างในคอมเมนต์/เอกสาร (ข้อ D · WS8 ข้อ 3 ที่ Task 8 ระยะ 0 เตรียมไว้)

**Files:**
- Modify: `tools/update-prices.js:66-67` (ค่า) · `:10` · `:20` (คอมเมนต์หัวไฟล์)
- Modify: `test/update-prices-test.js:38-41,49` (เคส decide) · `test/check-reports.js:47-50,543` (คอมเมนต์)
- Modify (docs — แทน ไม่เพิ่ม): `CLAUDE.md:127` · `docs/quality-gate.md:223` · `docs/price-refresh.md:128` · `README.md:135-136` · `.claude/skills/stock-analyzer/SKILL.md:18`

**Interfaces:**
- Produces: `MOS_FLIP_DEADBAND_PP = 5` (export เดิม `tools/update-prices.js:947`) — W06 ไม่ใช้ค่านี้อีกหลัง Task 11 (cron เป็นเจ้าของช่อง) จึงไม่มีคู่ที่ต้องแก้พร้อมกัน

- [ ] **Step 1: เคสเทสที่ล้มก่อน** — `test/update-prices-test.js:38-41` แทนด้วยเคสที่คิดจาก `base.fv` (=120 ที่ `:33`) ไม่ hardcode ราคา:

```js
const fv = base.fv;
ok(U.decide({ ...base, oldPrice: fv * 0.93, newPrice: fv * 1.06 }).freeze === 'mos-sign-flip', 'decide: MOS พลิกเกิน dead-band ทั้งสองฝั่ง (+7→−6) → freeze');
ok(U.decide({ ...base, oldPrice: fv * 0.93, newPrice: fv * 1.01 }).freeze === 'mos-sign-flip', 'decide: ฝั่งเก่าเกิน dead-band (+7→−1) → freeze');
ok(U.decide({ ...base, oldPrice: fv * 0.983, newPrice: fv * 1.06 }).freeze === 'mos-sign-flip', 'decide: ฝั่งใหม่เกิน dead-band (+1.7→−6) → freeze');
ok(U.decide({ ...base, oldPrice: fv * 0.96, newPrice: fv * 1.04 }).update === true, 'decide: flip ใน dead-band ±5 (+4→−4) → update (noise รอบ FV — ข้อ D ระยะ 1)');
ok(U.MOS_FLIP_DEADBAND_PP === 5, 'MOS_FLIP_DEADBAND_PP = 5 (ข้อ D)');
```

รัน `node test/update-prices-test.js` → ✗ 2 เคส (ค่ายังเป็น 3)

- [ ] **Step 2: เปลี่ยนค่า + คอมเมนต์** — `tools/update-prices.js:66-67`:

```js
const MOS_FLIP_DEADBAND_PP = 5; // MOS พลิกเครื่องหมายแต่ทั้งเก่า-ใหม่อยู่ใน ±5 จุด = แกว่งรอบ FV → patch ผ่าน ไม่ freeze
                                // (3 → 5 ระยะ 1 ข้อ D: flip ในย่านนี้ไม่มีข้อมูลใหม่ · ช่องสรุป "ส่วนต่างจากราคา" cron เขียนเองทั้งช่อง จึงไม่มี prose ให้ขัด)
```

`:10` และ `:20` คำว่า "±3" → "±5" · `test/check-reports.js:47-50` คอมเมนต์ 3 บรรทัด → เหลือบรรทัดเดียว `// W06 (ระยะ 1): ช่องสรุปเป็นคลังคำคงที่ที่ cron เขียนทั้งช่อง — ตรวจรูปแบบ+ตัวเลขผ่าน DV.summaryPlan ไม่ผูก dead-band อีก (ลบใน Task 11)` (ตัว `TOL_MOS_SUMMARY_PP` ลบใน Task 11) · `:543` "โซนกลาง ±3%" → "±5%"

- [ ] **Step 3: docs 5 จุด (grep ยืนยันครบ: `rtk proxy grep -rn "±3" CLAUDE.md docs README.md .claude tools test | grep -v superpowers/` ต้อง 0 หลังแก้)** — `CLAUDE.md:127` "MOS พลิกเกิน dead-band ±3 จุด" → "±5 จุด (ระยะ 1 ข้อ D — flip ในย่านไม่ส่ง LLM · ช่องสรุป cron เขียนเอง)" และ "(flip ใน ±3 จุด = patch ผ่าน" → "(flip ใน ±5 จุด = patch ผ่าน" · `docs/quality-gate.md:223` แถว W06 คอลัมน์เกณฑ์ → "ช่องต้องเป็น `MOS ~ ±X%` (คลังคำคงที่ · cron เขียน) และ X = MOS ปัดเหมือน `.big`" (Task 18 จะ generate ทับ) · `docs/price-refresh.md:128` "±3 จุด" → "±5 จุด (ระยะ 1)" · `README.md:135-136` เช่นกัน · `SKILL.md:18` "dead-band ±3 จุด" → "±5 จุด"

- [ ] **Step 4: รันให้ผ่าน + Commit** — `node test/update-prices-test.js` · `npm run verify`

```bash
git add tools/update-prices.js test/update-prices-test.js test/check-reports.js CLAUDE.md docs/quality-gate.md docs/price-refresh.md README.md .claude/skills/stock-analyzer/SKILL.md
git commit -m "cron: dead-band MOS flip ±3 → ±5 (ข้อ D) ที่เจ้าของเดียว MOS_FLIP_DEADBAND_PP · ล้าง \"3\" ในคอมเมนต์/เอกสาร 9 จุด

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: ช่องสรุป "ส่วนต่างจากราคา" เป็นโครงสร้างที่ cron เป็นเจ้าของ — `summaryPlan` (healer #11) + W06 ตรวจคลังคำคงที่ (ข้อ D · open-items #13 #19)

**Files:**
- Modify: `tools/derived-values.js` — ต่อยอด `readSummaryCell` (Task 8) เป็น `summaryPlan` · `fmtMos` · pass #11 ใน `patchDerived` (ก่อน `return`) · export
- Modify: `tools/update-prices.js:549` (`mosTxt` → `fmtMos`) · **ลบ** `:552-574` (patch ช่องสรุปแบบมีเงื่อนไข — สองตัวเขียนคือบั๊กที่กำลังแก้) · import `fmtMos`
- Modify: `test/check-reports.js:544` (W06 ใหม่ + `healer`) · `:29,50` (ลบ `TOL_MOS_SUMMARY_PP` และ import `MOS_FLIP_DEADBAND_PP`)
- Modify: `test/self-test.js:181-204` (บล็อก W06 เดิม → ชุดใหม่ + convergence)
- Modify: `.claude/skills/stock-analyzer/SKILL.md` STEP 5A/5B (1 บรรทัด) · `docs/templates.md` (ถ้ามีคำอธิบาย vcell)

**Interfaces:**
- Produces: `DV.fmtMos(mos)` = `(mos < 0 ? '−' : '+') + (|mos| ≥ 2 ? toFixed(0) : toFixed(1)) + '%'` (ย้ายจาก `update-prices.js:549` — รูปเดียวกับ `.big`) · `DV.SUMMARY_CANON_RE = /^MOS ~ ([+\-])(\d+(?:\.\d+)?)%$/` (หลัง `norm` แปลง − เป็น -) · `DV.summaryPlan(html, price)` → `{ at, len, text, want, mos, canonical, ok } | null` (null = ไม่มีช่อง หรือไม่มี `stock-meta.fairValue` — เงียบทั้งตัวตรวจและตัวเขียน) · pass #11 เขียน `want` ทับเนื้อช่อง (คง attribute ของ `<div class="v" style=…>` ไว้เพราะแทนเฉพาะกลุ่ม 2 ของ `SUMMARY_RE`)
- W06 `healer: 'patchDerived#11'` · level ยัง `warn` (ยกเป็น E ได้ในระยะ 2 เมื่อ sweep พิสูจน์แล้ว)
- คลังคำคงที่ = `MOS ~ +X%` / `MOS ~ −X%` เท่านั้น (สำรวจ 12 ก.ย. 69: 656/908 ใบเป็นรูปนี้อยู่แล้ว · อีก 252 ใบมี 79 รูปแบบคำ) — คำบอกทิศ = เครื่องหมาย · คำเชิงคุณภาพ (ถูก/แพง) อยู่ใน `.txt` ของ verdict และกลยุทธ์ ซึ่งเป็น prose ของคน

- [ ] **Step 1: self-test ใหม่ (ล้มก่อน)** — แทนบล็อก `test/self-test.js:181-204` ทั้งหมดด้วย:

```js
// ── W06 (ระยะ 1 ข้อ D): ช่องสรุป "ส่วนต่างจากราคา" = คลังคำคงที่ "MOS ~ ±X%" ที่ cron เขียนทั้งช่อง ──
{
  const DVs = require('../tools/derived-values.js');
  const p0 = DVs.summaryPlan(base, PX);
  ok(p0 && p0.canonical && p0.ok, 'summaryPlan: BBL fixture อยู่ในรูปคลังคำและตัวเลขตรง MOS', JSON.stringify(p0));
  rejectBase('W06', 'ฐาน BBL: ช่องสรุปถูกต้อง → W06 เงียบ');
  expect('W06', 'warn', setDiffCell('ถูกกว่ามูลค่า ~8%'), 'ข้อความนอกคลังคำ → W06');
  expect('W06', 'warn', setDiffCell(`MOS ~ ${DVs.fmtMos(p0.mos + 6)}`), 'รูปถูกแต่ตัวเลขห่าง 6 จุด → W06');
  expect('W06', 'warn', setDiffCell(`MOS ~ ${DVs.fmtMos(-p0.mos)}`), 'เครื่องหมายกลับ → W06 (ไม่มีโซน dead-band ใน checker อีก — cron เขียนเอง)');
  reject('W06', setDiffCell(`MOS ~ ${DVs.fmtMos(p0.mos)}`), 'รูปถูก ตัวเลขปัดเหมือน .big → เงียบ');
  // convergence: ทุกเคสข้างบน healer ต้องเขียนกลับเป็น want แล้วเงียบ + idempotent · attribute style ของ .v ต้องคงอยู่
  for (const [h, why] of [[setDiffCell('ถูกกว่ามูลค่า ~8%')(base), 'คำ'], [setDiffCell(`MOS ~ ${DVs.fmtMos(p0.mos + 6)}`)(base), 'ตัวเลข']]) {
    const once = DVs.patchDerived(h, PX).html;
    ok(!allIds(checkHtml(once, 'BBL.html')).has('W06') && DVs.patchDerived(once, PX).html === once, `W06 convergence (${why}): healer #11 → เงียบ + idempotent`);
    ok(/ส่วนต่างจากราคา<\/div>\s*<div class="v" style="color:#ffd180">MOS ~ [+−]/.test(once), `healer #11 คง style ของ <div class="v"> (${why})`);
  }
  CONVERGED.add('W06');
  // ไม่มี stock-meta.fairValue → ทั้งคู่เงียบ
  const noFV = mutJson('stock-meta', (d) => { delete d.fairValue; })(base);
  ok(DVs.summaryPlan(noFV, PX) == null && !DVs.patchDerived(noFV, PX).changes.some((c) => /ช่องสรุป/.test(c)), 'ไม่มี fairValue → summaryPlan null · healer ไม่แตะ');
}
```

(`setDiffCell` · `mutJson` · `PX` = helper/ค่าที่ไฟล์มีอยู่แล้ว — `setDiffCell(txt)` แทนเนื้อในช่อง `.v` ของ vcell "ส่วนต่างจากราคา") · รัน → ✗ (ยังไม่มี `summaryPlan`)

- [ ] **Step 2: `tools/derived-values.js`** — ใต้ `readSummaryCell`:

```js
/** รูป MOS แบบเดียวกับ .big ของ header (เดิมอยู่ใน update-prices.js:549 — ย้ายมาเป็นเจ้าของเดียว) */
const fmtMos = (mos) => (mos < 0 ? '−' : '+') + (Math.abs(mos) >= 2 ? Math.abs(mos).toFixed(0) : Math.abs(mos).toFixed(1)) + '%';
const SUMMARY_CANON_RE = /^MOS ~ ([+\-])(\d+(?:\.\d+)?)%$/;
/**
 * ช่องสรุป "ส่วนต่างจากราคา" — ระยะ 1 ข้อ D: cron เป็นเจ้าของทั้งช่อง (เดิม patch เฉพาะตัวเลขแบบมีเงื่อนไข update-prices.js:552-574
 * แล้วเว้นเมื่อคำขัด ⇒ W06 ค้าง 51 ใบ + flip ทุกตัวต้องส่ง LLM) · คลังคำคงที่ = "MOS ~ ±X%" · ตัวตรวจ (W06) กับตัวเขียน (#11) ถามฟังก์ชันนี้ตัวเดียว
 * คืน null = ไม่มีช่อง หรือไม่มี stock-meta.fairValue → เงียบทั้งคู่
 */
function summaryPlan(html, price) {
  const cell = readSummaryCell(html);
  if (!cell || !(price > 0)) return null;
  const smd = RM.readStockMeta(html);
  const fv = smd && Number.isFinite(smd.fairValue) && smd.fairValue > 0 ? smd.fairValue : null;
  if (!fv) return null;
  const mos = (fv - price) / fv * 100;
  const want = 'MOS ~ ' + fmtMos(mos);
  const m = norm(cell.text).match(SUMMARY_CANON_RE);
  const shown = m ? parseFloat(m[1] + m[2]) : null;
  const tol = m ? 0.5 * Math.pow(10, -decOf(m[2])) + 1e-9 : 0;   // ครึ่งหลักสุดท้ายที่พิมพ์ (บทเรียน MCAP_ULP)
  const ok = !!m && Math.abs(shown - mos) <= tol;
  return { at: cell.at, len: cell.len, text: cell.text, want, mos, canonical: !!m, ok };
}
```

ใน `patchDerived` ก่อน `return { html: out, changes }` (หลัง pass #10):

```js
  // 11) ช่องสรุป "ส่วนต่างจากราคา" — cron เขียนทั้งช่องเป็นคลังคำคงที่ (ระยะ 1 ข้อ D) · เงียบเมื่อ summaryPlan คืน null
  {
    const p = summaryPlan(out, price);
    if (p && !p.ok) { out = out.slice(0, p.at) + p.want + out.slice(p.at + p.len); changes.push(`ช่องสรุป: "${p.text}" → "${p.want}"`); }
  }
```

export เพิ่ม `fmtMos, SUMMARY_CANON_RE, summaryPlan` · `tools/update-prices.js`: `:549` → `const mosTxt = fmtMos(mos);` (import `{ patchDerived, fmtMos }`) · **ลบ `:552-574` ทั้งบล็อก** (คอมเมนต์ + `out = out.replace(/(ส่วนต่างจากราคา…` ) — pass #11 ทำแทนผ่าน `patchDerived(out, newPrice)` ที่ `:592` เรียกอยู่แล้ว

- [ ] **Step 3: W06 ใหม่** — `test/check-reports.js:544` แทนด้วย:

```js
  { id: 'W06', level: 'warn', healer: 'patchDerived#11', label: 'ช่อง "ส่วนต่างจากราคา" = คลังคำคงที่ "MOS ~ ±X%" ตรง MOS', fn: (c) => {
    if (!(c.px > 0)) return null;
    const p = DV.summaryPlan(c.html, c.px);
    if (!p) return null;                        // ไม่มีช่อง/ไม่มี stock-meta.fairValue → ตัวซ่อมก็ไม่แตะ (เงียบคู่)
    if (!p.canonical) return `ข้อความ "${p.text}" ไม่ใช่รูปคลังคำคงที่ — ต้องเป็น "${p.want}" (cron เขียนช่องนี้ทั้งช่องตั้งแต่ระยะ 1 ข้อ D)`;
    if (!p.ok) return `โชว์ "${p.text}" แต่ MOS จริง = ${p.mos.toFixed(1)}% → "${p.want}"`;
    return null;
  } },
```

`:29` → `const { mosBand } = require('../tools/update-prices.js');` · ลบ `:47-50` (`TOL_MOS_SUMMARY_PP`) · `grep -n TOL_MOS_SUMMARY_PP test/` ต้องว่าง

- [ ] **Step 4: กติกา worker 1 บรรทัด** — `SKILL.md` STEP 5A (บล็อกกฎเขียน skeleton) และ 5B เพิ่ม: `- ช่อง "ส่วนต่างจากราคา" (vcell หมวด 8) เขียนได้รูปเดียว: \`MOS ~ ±X%\` เท่ากับ .big — cron เขียนทับทั้งช่องทุกวัน (ระยะ 1 ข้อ D) · คำว่าถูก/แพงอยู่ใน .txt ของ verdict` · `docs/templates.md`: ถ้ามีคำอธิบาย vcell ให้แก้ให้ตรง (grep `ส่วนต่างจากราคา`)

- [ ] **Step 5: รันให้ผ่าน** — `node test/self-test.js` (E-policy: W06 มี healer + CONVERGED) · `node test/update-prices-test.js` (เคส `.big` เดิม `:481+` ยังผ่านเพราะ `fmtMos` รูปเดิม) · `rtk proxy node test/check-reports.js | tail -2` → W06 กระโดดขึ้น (~252 ใบ — คือใบที่ Task 12 จะกวาด · **ห้าม commit reports/ ใน task นี้**) · `npm run verify` ผ่าน (W)

- [ ] **Step 6: Commit**

```bash
git add tools/derived-values.js tools/update-prices.js test/check-reports.js test/self-test.js .claude/skills/stock-analyzer/SKILL.md docs/templates.md
git commit -m "cron: ช่องสรุป \"ส่วนต่างจากราคา\" เป็นคลังคำคงที่ MOS ~ ±X% ที่ cron เขียนทั้งช่อง (summaryPlan = healer #11) · W06 ตรวจรูป+ตัวเลข ไม่ผูก dead-band · ลบตัวเขียนเงื่อนไขเดิม (ข้อ D)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: กวาดช่องสรุปทั้งคลังครั้งเดียว (~252 ใบ) — ท่า heal → build → preserve-dates → build (open-items #13 #19 · W06 → 0)

**Files:**
- Modify: `reports/*.html` (~252 ใบ — เฉพาะบรรทัด vcell) · `reports.json` (build เขียน · `updated` คงเดิมผ่าน preserve-dates)

**Interfaces:**
- Consumes: `node tools/update-prices.js --heal-derived --write` (รัน `patchDerived` ทุก pass รวม #11 · เขียนเฉพาะไฟล์ที่ `gateAfterPatch` ผ่าน — `update-prices.js:692-715`)

- [ ] **Step 1: dry-run + นับ** —

```bash
rtk proxy node tools/update-prices.js --heal-derived | tee /tmp/heal-dry.log | tail -3
rtk proxy grep -c 'ช่องสรุป:' /tmp/heal-dry.log          # คาด ~252 · ถ้าต่างจาก W06 ที่ยิงใน Task 11 Step 5 เกิน ±5 ต้องอธิบายได้ (เช่น ใบที่ไม่มี fairValue)
rtk proxy grep -v 'ช่องสรุป:' /tmp/heal-dry.log | grep '^    ' | head   # การแก้อื่นที่ติดมา (P/E · หมวด 6 …) — ควรว่างเพราะ error 0 ทั้งคลัง · ถ้ามี = หนี้ที่ E ยังมองไม่เห็น จดไว้ใน PR body
```

- [ ] **Step 2: เขียนจริง + ท่า 4 ขั้น** —

```bash
node tools/update-prices.js --heal-derived --write
npm run build && node tools/preserve-dates.js && npm run build
git status --short | wc -l                                   # = จำนวนใบที่แก้ + 1 (reports.json)
rtk proxy git diff --stat -- reports.json | tail -1           # เปลี่ยนเฉพาะ hash ไม่ใช่ updated: git diff reports.json | grep -c '"updated"' ต้อง 0
rtk proxy node test/check-reports.js | tail -2               # W06 = 0 · error 0
for s in $(git diff --name-only -- reports | head -5); do git diff -U0 -- "$s" | grep '^[-+]' | grep -v '^[-+][-+]'; done   # spot-check: เปลี่ยนเฉพาะบรรทัด vcell
```

ถ้า `preserve-dates` คืนวันที่ไม่ครบ (มีใบที่ `updated` ขยับ) → **หยุด** `git checkout -- reports reports.json` แล้วดูว่า footer ของใบนั้นถูกแตะไหม (ไม่ควร) ก่อนลองใหม่

- [ ] **Step 3: Commit (1 commit ทั้งชุด — ไม่ใช่งานวิเคราะห์ ไม่เข้ากฎ 1 commit = 1 หุ้น)**

```bash
git add -- reports reports.json
git commit -m "reports: ช่องสรุป \"ส่วนต่างจากราคา\" → คลังคำคงที่ MOS ~ ±X% ทั้งคลัง (<N> ใบ · heal→build→preserve-dates→build · W06 51 → 0 · open-items #13 #19)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: triage — `mos-sign-flip` → bucket PREPATCH ไม่ส่ง LLM · ยกเป็น LIGHT เมื่ออายุ >90 วัน/งบออกหลังวิเคราะห์ (ข้อ D · WS6 ข้อ 1–3)

**Files:**
- Modify: `tools/queue/triage.js` (ทั้งไฟล์ 40 บรรทัด)
- Modify: `tools/queue/preflight.js:28-36` (`plan` ส่ง `earningsAfterOf`) · `:86` (`manualSteps` บรรทัด prep) · `tools/queue/ship.js:187-200` (`status` bucket) · `:144-182` (`shipPrepatch` ปิด issue เมื่อไม่มีแถว LLM)
- Modify: `test/queue-test.js:56-69` (บล็อก 3 triage)
- Modify: `.claude/skills/stock-analyzer/SKILL.md:18` · `CLAUDE.md:128` (bullet "เคลียร์คิว") · `docs/price-refresh.md:128`

**Interfaces:**
- Produces: `BUCKET['mos-sign-flip'] = 'PREPATCH'` · reason สังเคราะห์ใหม่ 2 ตัว (`'age-gt-90d'` · `'earnings-after-analysis'` → LIGHT — Task 14/17 เป็นผู้สร้าง ไม่ได้มาจาก cron) · `STALE_DAYS = 90` · `triage(flags, ctx)` รับ `ctx.earningsAfterOf(sym) → boolean|null` และ `ctx.staleDays` · แถวคืน `escalated: null|'age'|'earnings'` · `prePatchList(rows)` รวม PREPATCH ทุกแถว (ไม่สน skip — patch ราคาไม่มีโทษ) · `llmList(rows)` = LIGHT/FULL ที่ไม่ skip (ชุดที่ต้อง `prep`)
- Consumes: `footerAgeOf` (เดิม)

- [ ] **Step 1: queue-test ใหม่ (ล้มก่อน)** — แทนบล็อก `3) triage` (`test/queue-test.js:56-69`):

```js
// ── 3) triage: ครบทุก reason ที่ cron/canary/preflight เขียนได้ · flip = PREPATCH ไม่ส่ง LLM (ข้อ D) ──
{
  const T = require('../tools/queue/triage.js');
  const want = { 'mos-sign-flip': 'PREPATCH', 'drift-gt-15pct': 'LIGHT', 'age-gt-90d': 'LIGHT', 'earnings-after-analysis': 'LIGHT', 'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL', 'fetch-failed': 'PLUMBING', 'patch-failed': 'PLUMBING', 'no-stock-meta': 'PLUMBING', 'currency-mismatch': 'PLUMBING', 'bad-price': 'PLUMBING', 'bad-report-price': 'PLUMBING', 'patch-rejected': 'REJECTED', 'not-on-exchange': 'DELIST' };
  for (const [r, b] of Object.entries(want)) ok(T.bucketOf(r) === b, `bucketOf(${r}) = ${b}`, T.bucketOf(r));
  ok(T.bucketOf('drift-gt-10pct') === 'LIGHT' && T.bucketOf('อะไรก็ไม่รู้') === 'UNKNOWN', 'bucketOf: drift เกณฑ์อื่น = LIGHT · ไม่รู้จัก = UNKNOWN');
  const flags = [{ symbol: 'A', reason: 'mos-sign-flip' }, { symbol: 'B', reason: 'mos-sign-flip' }, { symbol: 'C', reason: 'not-on-exchange' }, { symbol: 'D', reason: 'suspect-split-or-data' }, { symbol: 'E', reason: 'mos-sign-flip' }, { symbol: 'F', reason: 'mos-sign-flip' }, { symbol: 'G', reason: 'drift-gt-15pct' }];
  const rows = T.triage(flags, { footerAgeOf: (s) => ({ A: 3, B: 40, C: 10, D: null, E: 120, F: 30, G: 3 })[s], earningsAfterOf: (s) => s === 'F' });
  const by = Object.fromEntries(rows.map((r) => [r.symbol, r]));
  ok(by.A.bucket === 'PREPATCH' && !by.A.skip && by.B.bucket === 'PREPATCH', 'flip อายุปกติ → PREPATCH (ไม่ skip — patch ราคาไม่มีโทษ)');
  ok(by.E.bucket === 'LIGHT' && by.E.escalated === 'age' && /90/.test(by.E.action), 'flip อายุ 120 วัน → ยกเป็น LIGHT (age)');
  ok(by.F.bucket === 'LIGHT' && by.F.escalated === 'earnings', 'flip + งบออกหลังวิเคราะห์ → ยกเป็น LIGHT (earnings)');
  ok(by.G.skip && /สด/.test(by.G.skip), 'LIGHT ที่ footer ≤7 วัน = ข้าม (เดิม)');
  ok(T.prePatchList(rows).join(',') === 'A,B,D,E,F,G', 'prePatchList: PREPATCH ทุกแถว + LIGHT/FULL (รวมตัวสด — ราคาต้องสดเสมอ) ไม่รวม DELIST');
  ok(T.llmList(rows).join(',') === 'D,E,F', 'llmList: เฉพาะ LIGHT/FULL ที่ไม่ skip (flip ธรรมดาไม่อยู่)');
  ok(T.STALE_DAYS === 90, 'STALE_DAYS = 90 (WS6 ข้อ 3: >1 ไตรมาส)');
}
```

- [ ] **Step 2: `tools/queue/triage.js` ใหม่ทั้งไฟล์** —

```js
'use strict';
/**
 * triage คิว price-flags ตาม reason — **ครบทุก reason ที่ tools/update-prices.js + dead-ticker-canary.js + preflight (สังเคราะห์) เขียนได้**
 * ระยะ 1 ข้อ D: `mos-sign-flip` = PREPATCH (ราคาอย่างเดียว ไม่ส่ง LLM — cron เป็นเจ้าของช่องสรุปแล้ว ไม่มี prose ให้ขัด)
 *   ยกเป็น LIGHT เมื่อ (ก) งบออกหลังวันวิเคราะห์ (earnings-calendar.json · Task 17) หรือ (ข) footer อายุ > STALE_DAYS
 * reason สังเคราะห์จาก preflight (ไม่ได้มาจาก cron): age-gt-90d · earnings-after-analysis
 * เพิ่ม reason ใหม่ที่ไหน = ต้องเพิ่มที่นี่ (queue-test ยิงทุก reason)
 */
const BUCKET = {
  'mos-sign-flip': 'PREPATCH',
  'drift-gt-15pct': 'LIGHT', 'age-gt-90d': 'LIGHT', 'earnings-after-analysis': 'LIGHT',
  'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL',
  'fetch-failed': 'PLUMBING', 'patch-failed': 'PLUMBING', 'no-stock-meta': 'PLUMBING', 'currency-mismatch': 'PLUMBING', 'bad-price': 'PLUMBING', 'bad-report-price': 'PLUMBING',
  'patch-rejected': 'REJECTED', 'not-on-exchange': 'DELIST',
};
const ACTION = {
  PREPATCH: 'ราคาอย่างเดียว — runbook pre-patch แล้ว ship --prepatch จบ ไม่ spawn worker (ข้อ D: flip ในย่าน FV ไม่มีข้อมูลใหม่)',
  LIGHT: 'UPDATE-LIGHT (SKILL 5C) — runbook pre-patch ราคาให้แล้ว · prep จะยกเป็น UPDATE ถ้า EPS ต่าง >2%',
  FULL: 'UPDATE เต็ม — ตรวจ split/ticker ก่อนเขียนเลข (bad-chart: ดูฐาน chart.data ในไฟล์ก่อน — SKILL STEP 0)',
  PLUMBING: 'ไม่ใช้ agent — symbol-map / stock-meta / ราคาในไฟล์ / เช็คเพิกถอน (SKILL STEP 0)',
  REJECTED: 'cron patch แล้ว gate ตก — อ่าน detail แก้ไฟล์ให้ npm test ผ่าน (ไม่ใช่ re-analyze)',
  DELIST: 'ยืนยันแหล่งปฐมภูมิ → ลบรายงาน + tag-apply --prune · ยังเทรด → update-prices --alive · ห้าม re-analyze',
  UNKNOWN: 'reason ไม่รู้จัก — เพิ่มใน tools/queue/triage.js',
};
const FRESH_DAYS = 7;    // CLAUDE.md §3.1
const STALE_DAYS = 90;   // WS6 ข้อ 3: ใบอายุ >1 ไตรมาส ต้องเข้าคิวแม้ราคาไม่ขยับ

function bucketOf(reason) {
  const r = String(reason);
  if (/^drift-gt-\d+pct$/.test(r)) return 'LIGHT';
  return BUCKET[r] || 'UNKNOWN';
}
function triage(flags, ctx) {
  const c = ctx || {};
  const staleDays = c.staleDays == null ? STALE_DAYS : c.staleDays;
  const freshDays = c.freshDays == null ? FRESH_DAYS : c.freshDays;
  return flags.map((f) => {
    let bucket = bucketOf(f.reason), escalated = null;
    const footerAge = c.footerAgeOf ? c.footerAgeOf(f.symbol) : null;
    if (bucket === 'PREPATCH') {
      const after = c.earningsAfterOf ? c.earningsAfterOf(f.symbol) : null;
      if (after) { bucket = 'LIGHT'; escalated = 'earnings'; }
      else if (footerAge != null && footerAge > staleDays) { bucket = 'LIGHT'; escalated = 'age'; }
    }
    const fresh = footerAge != null && footerAge <= freshDays;
    const skip = fresh && (bucket === 'LIGHT' || bucket === 'FULL') ? `สด ≤${freshDays} วัน (footer) — ไม่วิเคราะห์ซ้ำ (CLAUDE.md §3.1)` : null;
    const why = escalated === 'age' ? ` (ยกจาก PREPATCH: อายุ >${staleDays} วัน)` : escalated === 'earnings' ? ' (ยกจาก PREPATCH: งบออกหลังวิเคราะห์)' : '';
    return { ...f, bucket, escalated, action: ACTION[bucket] + why, footerAge, skip };
  });
}
/** ตัวที่ต้อง pre-patch ราคา: PREPATCH ทุกแถว (ราคาสดไม่มีโทษ) + LIGHT/FULL ที่ไม่ skip */
const prePatchList = (rows) => rows.filter((r) => r.bucket === 'PREPATCH' || (!r.skip && (r.bucket === 'LIGHT' || r.bucket === 'FULL'))).map((r) => r.symbol);
/** ตัวที่ต้องส่ง LLM (prep → spawn): LIGHT/FULL ที่ไม่ skip */
const llmList = (rows) => rows.filter((r) => !r.skip && (r.bucket === 'LIGHT' || r.bucket === 'FULL')).map((r) => r.symbol);

module.exports = { BUCKET, ACTION, FRESH_DAYS, STALE_DAYS, bucketOf, triage, prePatchList, llmList };
```

- [ ] **Step 3: ripple** —
  - `tools/queue/preflight.js:28-29`: `plan(flags, today, opts)` — `triage(flags, { footerAgeOf: …เดิม…, earningsAfterOf: (opts && opts.earningsAfterOf) || null })` (Task 17 ใส่ของจริง · ก่อนหน้านั้น null = ใช้อายุอย่างเดียว) · import `llmList`
  - `:86` บรรทัดสุดท้ายของ `manualSteps` → `` `${++n}. ต่อไป: npm run queue -- ship --prepatch (push ราคาที่ patch · PREPATCH ${rows.filter((r) => r.bucket === 'PREPATCH').length} ตัวจบตรงนี้) แล้ว npm run queue -- prep <SYM> ทีละตัวเฉพาะ ${llmList(rows).length} ตัวที่ต้องส่ง LLM: ${llmList(rows).join(' ') || '-'}` ``
  - `tools/queue/ship.js` `status()`: เพิ่ม `const prepatchOnly = rows.filter(([, r]) => r.bucket === 'PREPATCH');` · `idle`/`other` ใช้ `['LIGHT', 'FULL']` เดิม แต่ `other` เพิ่มเงื่อนไข `r.bucket !== 'PREPATCH'` · พิมพ์บรรทัดใหม่ `` `pre-patch อย่างเดียว (ไม่ส่ง LLM) ${prepatchOnly.length}: ${prepatchOnly.map(([k, r]) => k + (r.prepatchShippedAt ? '✓' : '')).join(' ') || '-'}` `` · ตัวนับหัว `X/Y` = `pushed.length + prepatchOnly.filter(([, r]) => r.prepatchShippedAt).length` / `rows.length`
  - `shipPrepatch()` ท้ายฟังก์ชัน (แทนคอมเมนต์ "ไม่ปิด issue ที่นี่"): `const st = S.load(); if (!Object.values(st.stocks).some((r) => !r.skip && ['LIGHT', 'FULL'].includes(r.bucket) && !r.shippedAt)) closeIssueIfEmpty();   // รอบที่มีแต่ PREPATCH: ไม่มี ship <SYM> ตามมา ⇒ ต้องปิด issue ตรงนี้` · queue-test: เคส `shipPrepatch` ที่มีอยู่ (ค้นหา `shipPrepatch`) เพิ่ม assertion ว่าเรียก `closeIssueIfEmpty` เมื่อ state มีแต่ PREPATCH (stub `gh` ผ่าน `PATH` ตามวิธีที่ไฟล์ใช้อยู่)
  - `SKILL.md:18` → `- \`mos-sign-flip\` → **ไม่ส่ง worker** (ระยะ 1 ข้อ D): runbook pre-patch ราคา + \`ship --prepatch\` จบ — cron เป็นเจ้าของช่องสรุป · preflight ยกเป็น UPDATE-LIGHT เองเมื่ออายุ >90 วัน หรือมีงบออกหลังวันวิเคราะห์ (แล้ว prep ยกเป็น UPDATE ถ้า EPS ต่าง >2%) · \`drift-gt-*\` → UPDATE-LIGHT` · `CLAUDE.md:128` bullet "เคลียร์คิว" เติมหลัง `ship --prepatch`: `(flip = จบตรงนี้ ไม่ spawn — ข้อ D)` · `docs/price-refresh.md:128` แถว `mos-sign-flip` คอลัมน์ "ทำอะไรต่อ" → "pre-patch อย่างเดียว (PREPATCH) · ยกเป็น UPDATE-LIGHT เมื่ออายุ >90 วัน/งบออก"

- [ ] **Step 4: รันให้ผ่าน + Commit** — `node test/queue-test.js` · `npm run verify`

```bash
git add tools/queue/triage.js tools/queue/preflight.js tools/queue/ship.js test/queue-test.js .claude/skills/stock-analyzer/SKILL.md CLAUDE.md docs/price-refresh.md
git commit -m "queue: mos-sign-flip → PREPATCH ไม่ส่ง LLM (ข้อ D) · ยกเป็น LIGHT เมื่ออายุ >90 วัน/งบออกหลังวิเคราะห์ · llmList · ship --prepatch ปิด issue เมื่อไม่มีแถว LLM

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: preflight — คิวตามอายุ (`age-gt-90d`) ทยอย N ตัว/รอบ ไม่รอราคา (WS6 ข้อ 3)

**Files:**
- Modify: `tools/queue/preflight.js:28-36` (`plan`) · `preflight()` (opts) · `renderTable` (คอลัมน์ escalated) · `tools/queue.js:22,31` (flag `--age N` · `--no-age`)
- Modify: `test/queue-test.js` (บล็อก plan/preflight ที่มีอยู่ — ค้นหา `P.plan(`)
- Create: `tools/analysis-age.js` (ย้าย `docs/superpowers/audit/2026-09-11-stock-analyzer/measure-analysis-age.js` มาเป็นเครื่องมือถาวร — spec §7 อ้าง `measure-analysis-age.js` เป็นวิธีวัด KPI)

**Interfaces:**
- Produces: `plan(flags, today, opts)` — `opts = { ageLimit (default 5) · listReports () → [SYM] · footerAgeOf · earningsAfterOf }` → คืน rows เดิม + แถวสังเคราะห์ `{ symbol, reason:'age-gt-90d', synthetic:true, footerAge }` สำหรับใบที่อายุ > `STALE_DAYS` และยังไม่อยู่ใน flags เรียงแก่สุดก่อน ตัดที่ `ageLimit` · `ageQueue(today, opts)` → `[{symbol, footerAge}]` ทั้งหมด (ไม่ตัด) สำหรับพิมพ์ "อายุเกิน 90 วัน N ใบ (รอบนี้เอา 5)" · `tools/analysis-age.js` export `ageBuckets(dir, today)` + CLI พิมพ์ตารางเดียวกับ metrics §6
- CLI: `npm run queue -- preflight [--age N] [--no-age]`

- [ ] **Step 1: เทส (ล้มก่อน)** — ในบล็อก plan ของ queue-test:

```js
  // คิวตามอายุ (WS6 ข้อ 3): ใบเกิน 90 วันเข้าคิวเองแม้ราคาไม่ขยับ · ทยอย ageLimit ตัว แก่สุดก่อน · ไม่ซ้ำกับที่ flag อยู่
  const ages = { OLD1: 200, OLD2: 150, OLD3: 95, MID: 60, FLAGGED: 300 };
  const rows = P.plan([{ symbol: 'FLAGGED', reason: 'drift-gt-15pct' }], '2026-09-12', { ageLimit: 2, listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] });
  const syn = rows.filter((r) => r.synthetic);
  ok(syn.map((r) => r.symbol).join(',') === 'OLD1,OLD2' && syn.every((r) => r.reason === 'age-gt-90d' && r.bucket === 'LIGHT'), 'plan: แถวอายุสังเคราะห์ 2 ตัวแก่สุด (ไม่รวม FLAGGED ที่มี flag อยู่แล้ว · MID ไม่ถึง 90)');
  ok(P.ageQueue('2026-09-12', { listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] }).length === 4, 'ageQueue: นับทุกใบเกิน 90 วัน (4) ก่อนตัด');
  ok(P.plan([], '2026-09-12', { ageLimit: 0, listReports: () => Object.keys(ages), footerAgeOf: (s) => ages[s] }).length === 0, 'plan: --no-age (ageLimit 0) ไม่เพิ่มแถว');
```

- [ ] **Step 2: โค้ด** — `tools/queue/preflight.js`:

```js
const { triage, prePatchList, llmList, STALE_DAYS } = require('./triage.js');
const listReportsFS = () => fs.readdirSync(path.join(ROOT, 'reports')).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '')).sort();
const footerAgeFS = (today) => (sym) => { const h = readReport(sym); const d = h && footerDate(h); return d ? ageDays(d.iso, today) : null; };

/** ใบที่อายุเกิน STALE_DAYS ทั้งหมด (แก่สุดก่อน) — WS6 ข้อ 3: trigger ตามเวลา ไม่ใช่ราคา */
function ageQueue(today, opts) {
  const o = opts || {};
  const ageOf = o.footerAgeOf || footerAgeFS(today);
  return (o.listReports || listReportsFS)().map((symbol) => ({ symbol, footerAge: ageOf(symbol) }))
    .filter((r) => r.footerAge != null && r.footerAge > STALE_DAYS).sort((a, b) => b.footerAge - a.footerAge);
}
function plan(flags, today, opts) {
  const o = opts || {};
  const ageOf = o.footerAgeOf || footerAgeFS(today);
  const limit = o.ageLimit == null ? 5 : o.ageLimit;
  const have = new Set(flags.map((f) => f.symbol));
  const extra = limit > 0 ? ageQueue(today, { ...o, footerAgeOf: ageOf }).filter((r) => !have.has(r.symbol)).slice(0, limit)
    .map((r) => ({ symbol: r.symbol, reason: 'age-gt-90d', synthetic: true, flaggedAt: today })) : [];
  const rows = triage([...flags, ...extra], { footerAgeOf: ageOf, earningsAfterOf: o.earningsAfterOf || null });
  for (const r of rows) {
    const h = readReport(r.symbol);
    const sm = h && readStockMeta(h);
    r.oldPrice = sm && Number.isFinite(sm.price) ? sm.price : null;
    r.currency = sm ? sm.currency : null;
  }
  return rows;
}
```

`preflight(opts)`: `const rows = plan(flags, today, { ageLimit: o.noAge ? 0 : (o.age == null ? 5 : o.age), earningsAfterOf: … (Task 17) });` · หลังพิมพ์ตาราง: `const aq = ageQueue(today); if (aq.length) console.log(`อายุเกิน ${STALE_DAYS} วัน ${aq.length} ใบ (รอบนี้เอา ${rows.filter((r) => r.synthetic).length} แก่สุด · --age N ปรับได้): ${aq.slice(0, 10).map((r) => `${r.symbol}(${r.footerAge}d)`).join(' ')}${aq.length > 10 ? ' …' : ''}`);` · `renderTable` เพิ่มคอลัมน์ "ที่มา" = `r.synthetic ? 'อายุ' : r.escalated || 'flag'` · export เพิ่ม `ageQueue` · `tools/queue.js`: usage บรรทัด preflight เพิ่ม `[--age N] [--no-age]` · `preflight({ …, age: val('--age') != null ? +val('--age') : null, noAge: has('--no-age') })` · `VALUE_FLAGS` เพิ่ม `'--age'`
- `tools/analysis-age.js` = เนื้อหา `measure-analysis-age.js` ที่ (ก) ใช้ `footerDate`/`ageDays` จาก `queue/footer-date.js` แทน parser ของตัวเอง (ข) `today` จาก argv หรือ `todayBangkok()` (ค) export `ageBuckets(dir, today)` · ลบไฟล์เดิมใน audit dir แล้วแก้ `metrics.md:104` ให้ชี้ `node tools/analysis-age.js`

- [ ] **Step 3: รันให้ผ่าน + Commit** — `node test/queue-test.js` · `node tools/analysis-age.js` (ตัวเลขใกล้ metrics §6) · `npm run verify`

```bash
git add tools/queue/preflight.js tools/queue.js test/queue-test.js tools/analysis-age.js docs/superpowers/audit/2026-09-11-stock-analyzer/metrics.md
git rm -q docs/superpowers/audit/2026-09-11-stock-analyzer/measure-analysis-age.js
git commit -m "queue: คิวตามอายุ >90 วัน (age-gt-90d) ทยอย --age N ต่อรอบ แก่สุดก่อน · tools/analysis-age.js ถาวร (WS6 ข้อ 3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: state ของคิวอยู่ที่ checkout หลัก — ใช้ร่วมทุก worktree บนเครื่อง (open-item #22)

**Files:**
- Modify: `tools/queue/state.js:12` · `test/queue-test.js` (บล็อก state)
- Modify: `docs/open-items.md` (#22 → ปิด พร้อมขอบเขต) · `tools/queue.js:1-13` คอมเมนต์หัวไฟล์

**Interfaces:**
- Produces: `resolveQueueDir(env, gitCommonDir)` (pure · export) — `env.QUEUE_DIR` ชนะ · ไม่งั้น `<git-common-dir>/../.queue` (worktree: `git rev-parse --git-common-dir` = `<checkout หลัก>/.git` ⇒ `.queue/` ของ checkout หลัก ซึ่ง `.gitignore` คุมอยู่แล้ว) · fallback `ROOT/.queue`
- ขอบเขต: ข้าม worktree บนเครื่องเดียว ✓ · ข้ามเครื่อง ✗ (เจ้าของใช้เครื่องเดียว — บันทึกใน open-items ว่าถ้าเปลี่ยนต้องย้าย state เข้า repo)

- [ ] **Step 1: เทส (ล้มก่อน)** —

```js
// ── state: .queue อยู่ที่ checkout หลัก (open-item #22 — worktree ใหม่ทุก session ทำให้รอบหาย) ──
{
  const S = require('../tools/queue/state.js');
  ok(S.resolveQueueDir({ QUEUE_DIR: '/x/q' }, '/a/b/.git') === '/x/q', 'resolveQueueDir: QUEUE_DIR ชนะ');
  ok(S.resolveQueueDir({}, '/a/b/.git') === path.join('/a/b', '.queue'), 'resolveQueueDir: git-common-dir absolute → <หลัก>/.queue');
  ok(S.resolveQueueDir({}, '.git') === path.join(ROOT, '.queue'), 'resolveQueueDir: checkout หลักเอง (.git relative) → ROOT/.queue');
  ok(S.resolveQueueDir({}, '') === path.join(ROOT, '.queue') && S.resolveQueueDir({}, null) === path.join(ROOT, '.queue'), 'resolveQueueDir: ไม่มี git → ROOT/.queue');
}
```

- [ ] **Step 2: โค้ด** — `tools/queue/state.js:12` แทนด้วย:

```js
const { run } = require('./sh.js');
/** โฟลเดอร์ state: env QUEUE_DIR (เทส) > <git-common-dir>/../.queue (checkout หลัก — ใช้ร่วมทุก worktree บนเครื่อง · open-item #22) > ROOT/.queue */
function resolveQueueDir(env, gitCommonDir) {
  if (env && env.QUEUE_DIR) return env.QUEUE_DIR;
  const common = gitCommonDir && String(gitCommonDir).trim();
  if (common) return path.join(path.resolve(ROOT, common), '..', '.queue');
  return path.join(ROOT, '.queue');
}
const DIR = resolveQueueDir(process.env, (() => { try { return run('git', ['rev-parse', '--git-common-dir']).out; } catch (_) { return ''; } })());
```

(ตรวจว่า `sh.js` ไม่ require `state.js` — ไม่งั้นวน) · export เพิ่ม `resolveQueueDir` · `tools/queue.js` คอมเมนต์หัว: `.queue/` → `.queue/ ของ checkout หลัก (ใช้ร่วมทุก worktree)` · `docs/open-items.md` #22 → ตาราง "ปิดแล้ว (ระยะ 1)" (สร้างหัวข้อใหม่ใต้ตารางระยะ 0): "state ย้ายไป `<checkout หลัก>/.queue` — ข้าม worktree ✓ ข้ามเครื่อง ✗ (ถ้าใช้หลายเครื่องต้องย้าย state เข้า repo)"

- [ ] **Step 3: รันให้ผ่าน + Commit** — `node test/queue-test.js` (บล็อกอื่นยังใช้ `QUEUE_DIR` temp) · ลองจริง: `node -e "console.log(require('./tools/queue/state.js').DIR)"` ใน worktree → path ใต้ `/Users/somchai.s/Downloads/stock/.queue`

```bash
git add tools/queue/state.js tools/queue.js test/queue-test.js docs/open-items.md
git commit -m "queue: state อยู่ที่ .queue ของ checkout หลัก (ใช้ร่วมทุก worktree) — open-item #22

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: nits ของ CLI จาก ledger ระยะ 0 — `--flag=value` · `--tags` ต้องมีค่า · trailer โมเดลไม่รู้จักต้องล้ม · ข้อความหลัง push ล้ม

**Files:**
- Modify: `tools/queue.js:16-19` (`val`/`has`/positional) · `tools/queue/ship.js:22` (`trailer`) · ข้อความ recovery ใน `shipStock` (ค้นหา `push ล้ม`)
- Test: `test/queue-test.js` (บล็อก CLI — ใช้ `sh.run('node', ['tools/queue.js', …])` ที่มีอยู่)

**Interfaces:**
- Produces: `tools/queue.js` รับทั้ง `--mode UPDATE` และ `--mode=UPDATE` · `--tags` ไม่มีค่า (ตามด้วย flag อื่น/ไม่มีอะไร) → error `--tags ต้องมีค่า` · `trailer(model)` โมเดลนอก `MODEL_NAME` → throw `โมเดล "${model}" ไม่รู้จัก — ป้าย Co-Authored-By ต้องตรงกับที่รันจริง` (เดิมเงียบเป็น Sonnet)

- [ ] **Step 1: เทส (ล้มก่อน)** —

```js
// ── CLI nits (ledger ระยะ 0): --flag=value · --tags ต้องมีค่า · trailer ไม่เดา ──
{
  const sh = require('../tools/queue/sh.js');
  const r1 = sh.run('node', ['tools/queue.js', 'prep']);                     // ไม่มี SYM → usage
  ok(r1.code !== 0 && /ใช้: npm run queue/.test(r1.out + r1.err), 'queue.js: prep ไม่มี SYM → usage');
  const r2 = sh.run('node', ['tools/queue.js', 'ship', 'AAPL', '--tags']);
  ok(r2.code !== 0 && /--tags ต้องมีค่า/.test(r2.out + r2.err), 'queue.js: --tags ไม่มีค่า → error ชัด (ไม่ใช่ garbage)');
  const r3 = sh.run('node', ['tools/queue.js', 'ship', 'AAPL', '--tags', '--force']);
  ok(r3.code !== 0 && /--tags ต้องมีค่า/.test(r3.out + r3.err), 'queue.js: --tags ตามด้วย flag → error');
  const Q = require('../tools/queue/ship.js');
  let threw = null; try { Q.trailer('haiku'); } catch (e) { threw = e.message; }
  ok(/ไม่รู้จัก/.test(threw || ''), 'trailer: โมเดลไม่รู้จัก → throw (ไม่เงียบเป็น Sonnet)');
  ok(/Sonnet 5/.test(Q.trailer('sonnet')) && /Opus 5/.test(Q.trailer('opus')), 'trailer: sonnet/opus ถูก');
}
```

(เคส `--flag=value` ทดสอบผ่าน `status --age=3`? — `status` ไม่รับ flag · ใช้ `preflight --no-patch --age=0 --allow-dirty` ไม่ได้เพราะยิง `git pull` ⇒ ทดสอบ `val` เป็นฟังก์ชันแทน: ย้าย `has/val/positional` ไป `tools/queue/args.js` export `parseArgs(argv)` → `{ cmd, sym, has(f), val(f) }` แล้วเทส `parseArgs(['prep','AAPL','--mode=UPDATE','--tags','a b']).val('--mode') === 'UPDATE'` และ `.val('--tags') === 'a b'`)

- [ ] **Step 2: โค้ด** — `tools/queue/args.js`:

```js
'use strict';
const VALUE_FLAGS = new Set(['--mode', '--model', '--brand', '--median-spec', '--tags', '--message', '--age']);
/** แยก argv ของ runbook: รับทั้ง --flag value และ --flag=value · flag ที่ต้องมีค่าแล้วไม่มี = error ชัด ไม่ใช่ garbage */
function parseArgs(argv) {
  const a = argv.flatMap((x) => (/^--[a-z-]+=/.test(x) ? [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)] : [x]));
  const cmd = a[0];
  const has = (f) => a.includes(f);
  const val = (f) => { const i = a.indexOf(f); if (i < 0) return null; const v = a[i + 1]; if (v == null || v.startsWith('--')) throw new Error(`${f} ต้องมีค่า`); return v; };
  const positional = a.slice(1).filter((x, i, arr) => !x.startsWith('--') && !VALUE_FLAGS.has(arr[i - 1]));
  return { cmd, has, val, positional, sym: (positional[0] || '').toUpperCase() };
}
module.exports = { parseArgs, VALUE_FLAGS };
```

`tools/queue.js:14-20` → `const { cmd, has, val, sym } = require('./queue/args.js').parseArgs(process.argv.slice(2));` · `val()` ที่ throw จะโผล่ผ่าน `.catch` ท้ายไฟล์ (`✗ --tags ต้องมีค่า`) — แต่ `case 'ship'` เรียก `val('--tags')` เฉพาะเมื่อมี → ให้เรียก `has('--tags') ? val('--tags') : null` · `ship.js:22`: `const trailer = (model) => { const n = MODEL_NAME[model]; if (!n) throw new Error(`โมเดล "${model}" ไม่รู้จัก — ป้าย Co-Authored-By ต้องตรงกับที่รันจริง (sonnet|opus)`); return `Co-Authored-By: Claude ${n} <noreply@anthropic.com>`; };` · `shipStock` ข้อความหลัง push ล้ม → `push ล้ม — commit อยู่แล้ว: แก้ conflict (ถ้ามี) แล้วรัน npm run queue -- ship ${sym} ซ้ำ (จะข้าม commit ไปทำ pull --rebase + push)` (ตรงกับ logic `pendingCommitFor` ที่มีอยู่)

- [ ] **Step 3: รันให้ผ่าน + Commit** — `node test/queue-test.js` · `npm run verify`

```bash
git add tools/queue/args.js tools/queue.js tools/queue/ship.js test/queue-test.js
git commit -m "queue: parseArgs (--flag=value · flag ที่ต้องมีค่า) · trailer โมเดลไม่รู้จัก throw · ข้อความหลัง push ล้ม (nits จาก review ระยะ 0)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: ปฏิทินงบรายสัปดาห์ — `tools/earnings-calendar.js` → `earnings-calendar.json` → preflight ยก flip เป็น LIGHT เมื่องบออกหลังวิเคราะห์ (WS6 ข้อ 2) — task สุดท้ายของ C · มี fallback

**Files:**
- Create: `tools/earnings-calendar.js` · `earnings-calendar.json` (committed · เขียนโดย workflow) · `.github/workflows/earnings-calendar.yml` · `test/earnings-calendar-test.js` (require จาก `test/queue-test.js` — ไม่เพิ่มขั้น verify)
- Modify: `tools/fetch-fundamentals.js:36-41` (แยก `yahooSession()` export) · `tools/queue/preflight.js` (`earningsAfterOf` จริง) · `docs/price-refresh.md` (หัวข้อใหม่สั้น ๆ ใต้ "Canary")

**Interfaces:**
- Produces:
  - `F.yahooSession()` → `{ cookie, crumb }` (ย้าย 6 บรรทัดจาก `fromYahoo` — `fromYahoo` เรียกใช้)
  - `EC.fetchNextEarnings(ysym, sess, fetchImpl = fetch)` → ISO `'YYYY-MM-DD'` | null (quoteSummary `modules=calendarEvents` → `calendarEvents.earnings.earningsDate[0].raw` epoch → วันที่ · ไม่มี = null)
  - `EC.roll(prev, next, todayISO)` → `{ last, next }` — ถ้า `prev.next` ผ่านไปแล้ว (`prev.next <= today`) `last = prev.next` · `next` = ค่าใหม่ (null ได้)
  - `EC.build({ symbols, prev, today, fetchNext })` → `{ updatedAt, symbols: { SYM: { last, next, src:'yahoo' } }, stats: { total, dated, nodate } }`
  - CLI `node tools/earnings-calendar.js --write` — symbols จาก `reports/*.html` ผ่าน `toYahooSymbol` (`update-prices.js` export) + `symbol-map.js` · `withRetry` จาก `dead-ticker-canary.js` · หน่วง 300 ms ต่อ call (908 call ≈ 5 นาที)
  - `preflight`: `earningsAfterOf = (sym) => { const e = cal.symbols[sym]; const fd = footerISO(sym); return e && e.last && fd ? fd < e.last : null; }` (อ่าน `earnings-calendar.json` ถ้ามี · ไม่มี = null ทุกตัว = นโยบายอายุอย่างเดียว)
- **Fallback (advisor):** รันครั้งแรกจริง (`--write` บนเครื่อง ก่อนตั้ง workflow) ถ้า `stats.nodate / stats.total > 0.20` → **ไม่ commit calendar** · ship ส่วน C ด้วยนโยบายอายุอย่างเดียว · เขียน open-items ข้อใหม่ "ปฏิทินงบ: Yahoo ให้วันที่ <80% (TH .BK ส่วนใหญ่ null) — หาแหล่งอื่น (SET/SA earningsDate)" · workflow ไม่เปิดใช้ (ไม่ commit yml)

- [ ] **Step 1: เทส offline (ล้มก่อน)** — `test/earnings-calendar-test.js` (export function รับ `ok` แบบ fixture-lint):

```js
'use strict';
module.exports = function earningsCalendarTest(ok) {
  const EC = require('../tools/earnings-calendar.js');
  ok(EC.roll({ last: null, next: '2026-08-01' }, '2026-11-01', '2026-09-12').last === '2026-08-01', 'roll: next ที่ผ่านไปแล้วกลายเป็น last');
  ok(EC.roll({ last: '2026-05-01', next: '2026-11-01' }, '2026-11-01', '2026-09-12').last === '2026-05-01', 'roll: next ยังไม่ถึง → last คงเดิม');
  ok(EC.roll(null, null, '2026-09-12').last === null && EC.roll(null, null, '2026-09-12').next === null, 'roll: ไม่มีข้อมูล → null ทั้งคู่ (นโยบายอายุอย่างเดียว)');
  const fetchNext = async (ysym) => ({ 'AAPL': '2026-10-29', 'ADVANC.BK': null })[ysym];
  return EC.build({ symbols: [['AAPL', 'AAPL'], ['ADVANC', 'ADVANC.BK']], prev: { symbols: { AAPL: { last: null, next: '2026-07-30' } } }, today: '2026-09-12', fetchNext, delayMs: 0 })
    .then((c) => {
      ok(c.symbols.AAPL.last === '2026-07-30' && c.symbols.AAPL.next === '2026-10-29', 'build: AAPL roll next เก่าเป็น last + next ใหม่');
      ok(c.symbols.ADVANC.last === null && c.symbols.ADVANC.next === null, 'build: ไม่มีวันที่ → null (ไม่ throw)');
      ok(c.stats.total === 2 && c.stats.dated === 1 && c.stats.nodate === 1 && /^\d{4}-\d{2}-\d{2}/.test(c.updatedAt), 'build: stats + updatedAt');
      // parser ของ quoteSummary
      const j = { quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ raw: 1793318400, fmt: '2026-10-29' }] } } }] } };
      return EC.fetchNextEarnings('AAPL', { cookie: 'c', crumb: 'x' }, async () => ({ ok: true, json: async () => j }));
    }).then((d) => ok(d === '2026-10-29', 'fetchNextEarnings: อ่าน earningsDate[0].raw → ISO'));
};
```

ใน `test/queue-test.js` ท้ายไฟล์ก่อน tally: `const pending = require('./earnings-calendar-test.js')(ok);` แล้วให้ tally รอ `Promise.resolve(pending)` (แบบเดียวกับ Task 4)

- [ ] **Step 2: โค้ด** — `tools/earnings-calendar.js`:

```js
#!/usr/bin/env node
'use strict';
/**
 * earnings-calendar.js — ปฏิทินงบต่อหุ้น (WS6 ข้อ 2: trigger LLM ตามเหตุการณ์ธุรกิจ ไม่ใช่ราคา)
 *   node tools/earnings-calendar.js --write   → earnings-calendar.json { updatedAt, symbols: { SYM: { last, next, src } }, stats }
 * แหล่ง: Yahoo quoteSummary modules=calendarEvents (crumb flow เดียวกับ fetch-fundamentals) · `next` = วันประกาศงบถัดไป
 * `last` = `next` ครั้งก่อนที่ผ่านไปแล้ว (roll รายสัปดาห์) — ไม่มีแหล่งไหนให้ "วันประกาศครั้งล่าสุด" ตรง ๆ จึงสะสมเอง
 * preflight ใช้: footer "ข้อมูล ณ" < last ⇒ งบออกหลังวิเคราะห์ ⇒ flip ยกเป็น UPDATE-LIGHT · last null ⇒ นโยบายอายุอย่างเดียว
 */
const fs = require('fs');
const path = require('path');
const { yahooSession } = require('./fetch-fundamentals.js');
const { withRetry } = require('./dead-ticker-canary.js');
const { toYahooSymbol } = require('./update-prices.js');
const { readStockMeta } = require('./report-meta.js');
const FILE = path.join(__dirname, '..', 'earnings-calendar.json');
const H = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };
const iso = (epoch) => new Date(epoch * 1000).toISOString().slice(0, 10);

async function fetchNextEarnings(ysym, sess, fetchImpl) {
  const f = fetchImpl || fetch;
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ysym)}?modules=calendarEvents&crumb=${encodeURIComponent(sess.crumb)}`;
  const r = await f(url, { headers: { ...H, cookie: sess.cookie } });
  if (!r.ok) throw new Error('quoteSummary HTTP ' + r.status);
  const j = await r.json();
  const res = j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
  const d = res && res.calendarEvents && res.calendarEvents.earnings && res.calendarEvents.earnings.earningsDate;
  const raw = Array.isArray(d) && d[0] && Number.isFinite(d[0].raw) ? d[0].raw : null;
  return raw ? iso(raw) : null;
}
function roll(prev, next, today) {
  const p = prev || { last: null, next: null };
  const last = p.next && p.next <= today ? p.next : (p.last || null);
  return { last, next: next || null };
}
async function build({ symbols, prev, today, fetchNext, delayMs }) {
  const out = { updatedAt: new Date().toISOString(), symbols: {}, stats: { total: 0, dated: 0, nodate: 0, failed: 0 } };
  const prevSyms = (prev && prev.symbols) || {};
  for (const [sym, ysym] of symbols) {
    out.stats.total++;
    let next = null;
    try { next = await fetchNext(ysym); } catch (e) { out.stats.failed++; }
    out.symbols[sym] = { ...roll(prevSyms[sym], next, today), src: 'yahoo' };
    if (next) out.stats.dated++; else out.stats.nodate++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return out;
}
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return { symbols: {} }; } }
async function main() {
  const write = process.argv.includes('--write');
  const reports = path.join(__dirname, '..', 'reports');
  const symbols = fs.readdirSync(reports).filter((f) => /\.html$/i.test(f)).map((f) => f.replace(/\.html$/i, '')).sort()
    .map((s) => { const sm = readStockMeta(fs.readFileSync(path.join(reports, s + '.html'), 'utf8')); return [s, toYahooSymbol(s, sm && sm.currency === 'THB')]; });
  const sess = await yahooSession();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const cal = await build({ symbols, prev: load(), today, fetchNext: (y) => withRetry(() => fetchNextEarnings(y, sess), 2), delayMs: 300 });
  console.log(`earnings-calendar: ${cal.stats.dated}/${cal.stats.total} มีวันที่ · ไม่มี ${cal.stats.nodate} · ล้ม ${cal.stats.failed}`);
  if (cal.stats.nodate / cal.stats.total > 0.2) console.log('⚠ วันที่ครอบคลุม <80% — นโยบายอายุอย่างเดียวยังเป็นหลัก (ดู open-items)');
  if (write) fs.writeFileSync(FILE, JSON.stringify(cal, null, 1) + '\n');
}
module.exports = { fetchNextEarnings, roll, build, load, FILE };
if (require.main === module) main().catch((e) => { console.error('✗', e.message); process.exit(1); });
```

(ตรวจลายเซ็นจริงของ `toYahooSymbol` และ `withRetry` ใน `update-prices.js`/`dead-ticker-canary.js` ก่อนใช้ — ปรับ argument ให้ตรง ไม่เดา) · `fetch-fundamentals.js:36-41` → `async function yahooSession() { …cookie/crumb… return { cookie, crumb }; }` แล้ว `fromYahoo` ใช้ `const { cookie, crumb } = await yahooSession();` · export เพิ่ม `yahooSession`

- [ ] **Step 3: preflight ใช้จริง** — `preflight.js`: `const EC = require('../earnings-calendar.js'); const cal = EC.load();` · `earningsAfterOf = (sym) => { const e = cal.symbols[sym]; if (!e || !e.last) return null; const h = readReport(sym); const fd = h && footerDate(h); return fd ? fd.iso < e.last : null; }` ส่งเข้า `plan(flags, today, { …, earningsAfterOf })` · แถวที่ `escalated === 'earnings'` ให้ preflight ใส่ `reason` เดิม (`mos-sign-flip`) แต่ตาราง "ที่มา" แสดง `earnings` · ถ้าอยากให้ใบที่ไม่ได้ flag แต่งบออกหลังวิเคราะห์เข้าคิวด้วย: เพิ่มใน `plan` แบบเดียวกับ age (`reason:'earnings-after-analysis'` · ใช้ `ageLimit` ร่วมกัน · เรียง last ใหม่สุดก่อน) — ทำเมื่อ calendar ผ่าน fallback เท่านั้น

- [ ] **Step 4: รันจริงครั้งแรก (network) + ตัดสิน fallback** — `rtk proxy node tools/earnings-calendar.js` (dry-run · ~5 นาที) → อ่านบรรทัด stats: `nodate/total ≤ 0.20` → `--write` แล้ว commit `earnings-calendar.json` + workflow (Step 5) · `> 0.20` → ไม่ commit json/yml · เพิ่ม open-item · Step 3 ยังคงอยู่ (calendar ไม่มี = null ทั้งหมด = อายุอย่างเดียว) · บันทึกตัวเลขจริงใน PR body

- [ ] **Step 5: workflow (เฉพาะเมื่อผ่าน fallback)** — `.github/workflows/earnings-calendar.yml` (โครงเดียวกับ `fundamentals-canary.yml`: จันทร์ 02:40 UTC · `permissions: contents: write` · `concurrency: group: earnings-calendar` · steps: checkout → setup-node 20 → `node tools/earnings-calendar.js --write` → commit `earnings-calendar.json` ด้วย identity bot แบบ `update-prices.yml:52-71` (scoped `git add earnings-calendar.json` · retry pull --rebase 3 ครั้ง)) · `docs/price-refresh.md` หัวข้อใหม่ 6 บรรทัดใต้ Canary: ไฟล์ · แหล่ง · roll · preflight ใช้อย่างไร · fallback

- [ ] **Step 6: รันให้ผ่าน + Commit + เปิด PR #C**

```bash
node test/queue-test.js && npm run verify
git add tools/earnings-calendar.js tools/fetch-fundamentals.js tools/queue/preflight.js test/earnings-calendar-test.js test/queue-test.js docs/price-refresh.md
git add earnings-calendar.json .github/workflows/earnings-calendar.yml   # เฉพาะเมื่อผ่าน fallback (Step 4)
git commit -m "queue: ปฏิทินงบรายสัปดาห์ (Yahoo calendarEvents → earnings-calendar.json · roll next→last) · preflight ยก flip เป็น LIGHT เมื่องบออกหลังวิเคราะห์ (WS6 ข้อ 2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p1-c-queue-policy
gh pr create --base claude/audit-p1-b-manifest --title "audit ระยะ 1 ส่วน C: นโยบายคิว — dead-band ±5 · ช่องสรุปเป็นโครงสร้างที่ cron เขียน · flip ไม่ส่ง LLM · คิวตามอายุ/ปฏิทินงบ · คิวถาวรข้าม worktree (WS6 · ข้อ D)" --body-file - <<'PRBODY'
## สรุป
- `MOS_FLIP_DEADBAND_PP` 3 → 5 · ช่องสรุป "ส่วนต่างจากราคา" = คลังคำคงที่ `MOS ~ ±X%` ที่ cron เขียนทั้งช่อง (`summaryPlan` healer #11 · W06 ใหม่ · ลบตัวเขียนเงื่อนไขเดิม)
- **⚠ diff มี reports/ <N> ใบ** (กวาดครั้งเดียว heal→build→preserve-dates→build · เปลี่ยนเฉพาะบรรทัด vcell · `updated` คงเดิม) → W06 51 → 0 (open-items #13 #19)
- triage: `mos-sign-flip` → PREPATCH ไม่ส่ง LLM · ยกเป็น LIGHT เมื่ออายุ >90 วัน/งบออกหลังวิเคราะห์ · คิวตามอายุ `--age N` · `ship --prepatch` ปิด issue เมื่อไม่มีแถว LLM
- state ที่ `<checkout หลัก>/.queue` (open-item #22) · parseArgs/trailer nits
- ปฏิทินงบ: ครอบคลุม <N>/<N> (<%>) — <ผ่าน fallback: commit json + workflow | ไม่ผ่าน: อายุอย่างเดียว + open-item>

## ทดสอบ
- `npm run verify` 14/14 · queue-test +<N> เคส · self-test W06 convergence

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

---

# ส่วน D — WS8 ข้อ 3/4: ตัวเลข/ตาราง gate generate จากโค้ด · docs-test · ลบส่วนซ้ำ (PR #D)

สาขา: `claude/audit-p1-d-docs-gen` (base = `claude/audit-p1-c-queue-policy`)

### Task 18: `tools/gen-docs.js` — ตาราง E/W · จำนวนรหัส · จำนวนขั้น verify · บล็อกขั้นใน pre-push generate จาก `CHECKS` + `package.json` (WS8 ข้อ 3)

**Files:**
- Create: `tools/gen-docs.js`
- Modify (ใส่ marker): `docs/quality-gate.md:6,9,167,172-236` · `CLAUDE.md:108-109` · `README.md` (ทุกที่ที่พิมพ์ "N ขั้น" — grep) · `docs/price-refresh.md:14` · `.githooks/pre-push:20-67`
- Test: `test/self-test.js` ไม่แตะ — เทสอยู่ใน Task 19

**Interfaces:**
- Produces: `node tools/gen-docs.js` (เขียน) · `node tools/gen-docs.js --check` (exit 1 + รายชื่อไฟล์ที่ไม่ตรง) · export `{ render(), check() → [{ file, why }] , TARGETS }`
- marker 5 ชนิด (HTML comment — มองไม่เห็นตอน render markdown · ใน shell script ใช้ `# gen:` ):
  - `<!-- gen:checks-table -->…<!-- /gen:checks-table -->` — ตาราง `| code | level | healer | ตรวจอะไร | เกณฑ์ + วิธีแก้ (ย่อ) |` — 4 คอลัมน์แรกจาก `CHECKS` (`id` · `level` · `healer || '—'` · `label`) เรียงตาม id (E ก่อน W) · **คอลัมน์ที่ 5 = prose ของคน** gen-docs อ่านค่าเดิมจากตารางที่มีอยู่ตาม `code` แล้วคงไว้ (รหัสใหม่ → ช่องว่าง `_(เติม)_` · รหัสที่หายจากโค้ด → แถวหาย)
  - `<!-- gen:counts -->47 error + 15 warning<!-- /gen:counts -->` (นับจาก `CHECKS`)
  - `<!-- gen:verify-steps -->14<!-- /gen:verify-steps -->` (นับจาก `package.json` `verify`) · `<!-- gen:verify-cron-steps -->5<!-- /gen:verify-cron-steps -->`
  - `<!-- gen:verify-chain -->\`update-prices-test\` → … → \`check-site\`<!-- /gen:verify-chain -->` (ชื่อขั้นจาก basename ตัดนามสกุล · `build.js` → `build`)
  - pre-push: `# gen:steps` … `# /gen:steps` — บล็อก `echo "<emoji> pre-push i/N: <label>…"` + `node <step> >/dev/null || block "<label>"` ต่อขั้น · `STEP_LABELS` ใน gen-docs = `{ 'test/update-prices-test.js': ['💰', 'unit-test cron ราคา (update-prices-test)', 'update-prices unit gate'], … }` ครบทุกขั้นปัจจุบัน 14 ขั้น (คัดจาก hook เดิม `:20-67` ตรง ๆ) · ขั้นใหม่ที่ไม่มี label → `check()` ล้มพร้อมบอกให้เติม
- ประโยคที่พิมพ์ตัวเลขเหล่านี้นอก marker = docs-test (Task 19) ฟ้อง

- [ ] **Step 1: เขียน `tools/gen-docs.js`** —

```js
#!/usr/bin/env node
'use strict';
/**
 * gen-docs.js — ตัวเลข/ตารางที่เคยพิมพ์มือใน docs ให้ generate จากโค้ด (spec WS8 ข้อ 3 · docs-audit: drift 6/6 ภายใน 2 สัปดาห์)
 *   node tools/gen-docs.js          เขียนทับเนื้อในระหว่าง marker
 *   node tools/gen-docs.js --check  exit 1 ถ้าไฟล์ไหนไม่ตรง (test/docs-test.js เรียก)
 * แหล่งความจริง: test/check-reports.js CHECKS (id/level/healer/label) · package.json scripts.verify / verify:cron
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHECKS } = require('../test/check-reports.js');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const steps = (s) => String(s || '').split('&&').map((x) => x.trim().replace(/^node /, '')).filter(Boolean);
const VERIFY = steps(pkg.scripts.verify), CRON = steps(pkg.scripts['verify:cron']);
const stepName = (s) => path.basename(s).replace(/\.js$/, '');
// ป้าย/อีโมจิของแต่ละขั้นใน pre-push (คัดจาก hook เดิม) — ขั้นใหม่ต้องเติมที่นี่ ไม่งั้น --check ล้ม
const STEP_LABELS = {
  'test/update-prices-test.js': ['💰', 'unit-test cron ราคา (update-prices-test)', 'update-prices unit gate'],
  'test/dead-ticker-test.js': ['☠', 'unit-test canary หุ้นตาย (dead-ticker-test)', 'dead-ticker canary unit gate'],
  'test/tag-apply-test.js': ['🏷', 'unit-test เครื่องมือเขียน tag (tag-apply-test)', 'tag-apply unit gate'],
  'test/queue-test.js': ['🧾', 'unit-test runbook คิว (queue-test)', 'queue runbook unit gate'],
  'test/tags-test.js': ['🏷', 'ข้อมูล tag (tags-test)', 'tags gate'],
  'test/check-reports.js': ['🔍', 'quality gate รายงาน (check-reports)', 'quality gate'],
  'test/self-test.js': ['🧪', 'meta-test ของ checker (self-test)', 'self-test'],
  'test/ohlc-test.js': ['📈', 'unit-test OHLC (ohlc-test)', 'ohlc gate'],
  'test/ta-engine-test.js': ['📉', 'unit-test TA engine (ta-engine-test)', 'ta-engine gate'],
  'build.js': ['🏗', 'build', 'build'],
  'test/build-test.js': ['🏗', 'build-test', 'build gate'],
  'test/engine-exec.js': ['⚙', 'engine-exec', 'engine-exec gate'],
  'test/skeleton-test.js': ['🦴', 'skeleton-test', 'skeleton gate'],
  'test/check-site.js': ['🌐', 'check-site', 'site gate'],
};
// ★ ตอนเขียนไฟล์นี้ครั้งแรก ให้คัด emoji/ข้อความจาก .githooks/pre-push บรรทัด 20-67 มาแทนค่าข้างบนให้ตรงของเดิมทุกขั้น

const errs = CHECKS.filter((c) => c.level === 'error'), warns = CHECKS.filter((c) => c.level === 'warn');
const sortId = (a, b) => (a.id[0] === b.id[0] ? a.id.localeCompare(b.id) : (a.id[0] === 'E' ? -1 : 1));

function checksTable(existing) {
  // คอลัมน์ที่ 5 (prose ของคน) อ่านจากตารางเดิมตาม code
  const prose = {};
  for (const line of String(existing || '').split('\n')) { const m = line.match(/^\|\s*([EW]\d\d)\s*\|(?:[^|]*\|){3}\s*(.*?)\s*\|\s*$/); if (m) prose[m[1]] = m[2]; }
  const rows = [...CHECKS].sort(sortId).map((c) => `| ${c.id} | ${c.level} | ${c.healer || '—'} | ${c.label} | ${prose[c.id] || '_(เติม)_'} |`);
  return ['| code | level | healer | ตรวจอะไร | เกณฑ์ + วิธีแก้ (ย่อ) |', '|---|---|---|---|---|', ...rows].join('\n');
}
function prepushBlock() {
  const n = VERIFY.length;
  return VERIFY.map((s, i) => {
    const L = STEP_LABELS[s];
    if (!L) throw new Error(`gen-docs: ขั้น ${s} ไม่มีป้ายใน STEP_LABELS — เติมก่อน`);
    return `echo "${L[0]} pre-push ${i + 1}/${n}: ${L[1]}…"\nnode ${s} >/dev/null || block "${L[2]}"`;
  }).join('\n\n');
}
const GEN = {
  'checks-table': (old) => checksTable(old),
  'counts': () => `${errs.length} error + ${warns.length} warning`,
  'verify-steps': () => String(VERIFY.length),
  'verify-cron-steps': () => String(CRON.length),
  'verify-chain': () => VERIFY.map((s) => `\`${stepName(s)}\``).join(' → '),
  'steps': () => prepushBlock(),
};
const TARGETS = ['docs/quality-gate.md', 'CLAUDE.md', 'README.md', 'docs/price-refresh.md', '.githooks/pre-push'];
const MARK = (name, sh) => sh
  ? new RegExp(`(# gen:${name}\\n)([\\s\\S]*?)(\\n# /gen:${name})`, 'g')
  : new RegExp(`(<!-- gen:${name} -->)([\\s\\S]*?)(<!-- /gen:${name} -->)`, 'g');
function render(file) {
  const sh = file.endsWith('pre-push');
  let text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  let used = 0;
  for (const [name, fn] of Object.entries(GEN)) {
    text = text.replace(MARK(name, sh), (m, a, old, z) => { used++; const body = fn(old); return sh ? `${a}${body}${z}` : (name === 'checks-table' ? `${a}\n${body}\n${z}` : `${a}${body}${z}`); });
  }
  return { text, used };
}
function check() {
  const out = [];
  for (const f of TARGETS) {
    const cur = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const { text, used } = render(f);
    if (!used) out.push({ file: f, why: 'ไม่มี marker gen: เลย' });
    else if (text !== cur) out.push({ file: f, why: 'เนื้อในระหว่าง marker ไม่ตรงโค้ด — รัน node tools/gen-docs.js' });
  }
  return out;
}
module.exports = { render, check, TARGETS, GEN, STEP_LABELS, VERIFY, CRON };
if (require.main === module) {
  if (process.argv.includes('--check')) { const bad = check(); for (const b of bad) console.error(`✗ ${b.file}: ${b.why}`); process.exit(bad.length ? 1 : 0); }
  for (const f of TARGETS) { const { text } = render(f); fs.writeFileSync(path.join(ROOT, f), text); console.log(`✎ ${f}`); }
}
```

- [ ] **Step 2: ใส่ marker** —
  - `docs/quality-gate.md:167` → `ตรวจ source reports/<SYMBOL>.html ทีละไฟล์ — <!-- gen:counts -->47 error + 15 warning<!-- /gen:counts --> (W16/W17/W19/W20 เป็น error ตั้งแต่ระยะ 1 — คงชื่อ W)` · `:169` หัวข้อ "### ตารางอ้างอิง code ครบชุด" คงไว้ · แทนบรรทัด `:172-236` (ตารางเดิม) ด้วย `<!-- gen:checks-table -->` + ตารางเดิม + `<!-- /gen:checks-table -->` (gen-docs จะแปลงเป็น 5 คอลัมน์และคง prose) · `:171` ประโยคอธิบาย 19 → ลบ (ตารางบอก level แล้ว) · `:6,9` "14 ขั้น" → `<!-- gen:verify-steps -->14<!-- /gen:verify-steps --> ขั้น`
  - `CLAUDE.md:108` → `<!-- gen:verify-steps -->14<!-- /gen:verify-steps --> ขั้น ต้องผ่านทั้งหมดก่อน push (pre-push hook บังคับซ้ำ) · cron ใช้ชุดย่อย \`verify:cron\` <!-- gen:verify-cron-steps -->5<!-- /gen:verify-cron-steps --> ขั้น …` · `:109` → `<!-- gen:verify-chain -->…<!-- /gen:verify-chain --> (check-reports = <!-- gen:counts -->47 error + 15 warning<!-- /gen:counts -->)` (ย้ายวงเล็บออกจากกลาง chain เพราะ chain ทั้งเส้น generate)
  - `README.md` / `docs/price-refresh.md:14`: ทุกที่ที่มี "N ขั้น" ของ verify → marker `verify-steps` · "5 ขั้น" ของ verify:cron → marker `verify-cron-steps`
  - `.githooks/pre-push`: บรรทัด 20-67 ครอบด้วย `# gen:steps` / `# /gen:steps` (คอมเมนต์ 2 บรรทัดเหนือขั้น 1 ย้ายขึ้นไปเหนือ marker) · คอมเมนต์ `:4` → `# ★ บล็อกขั้นข้างล่าง generate จาก package.json ด้วย node tools/gen-docs.js — ห้ามแก้มือ`

- [ ] **Step 3: รัน + ตรวจ** — `node tools/gen-docs.js` → 5 ไฟล์ · `git diff` ต้องเปลี่ยนเฉพาะ (ก) ตารางเป็น 5 คอลัมน์ + prose เดิมครบทุกรหัส (ตรวจ `rtk proxy git diff docs/quality-gate.md | grep -c '_(เติม)_'` = 0 — ถ้าไม่ใช่ 0 แปลว่า regex อ่าน prose เดิมพลาด แก้ `checksTable` ก่อน) (ข) ตัวเลข 47/15/14/5 (ค) pre-push บล็อกขั้นเหมือนเดิมทุกตัวอักษร (`git diff .githooks/pre-push` ต้องว่างหรือต่างเฉพาะ marker) · `node tools/gen-docs.js --check` exit 0 · `node test/queue-test.js` (mirror pre-push ยังผ่าน)

- [ ] **Step 4: Commit**

```bash
git add tools/gen-docs.js docs/quality-gate.md CLAUDE.md README.md docs/price-refresh.md .githooks/pre-push
git commit -m "docs: gen-docs.js — ตาราง E/W · จำนวนรหัส · จำนวนขั้น verify/verify:cron · บล็อกขั้น pre-push generate จาก CHECKS + package.json (WS8 ข้อ 3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 19: `test/docs-test.js` = verify ขั้นที่ 15 — gen-docs ตรงโค้ด + วลีต้องห้าม/ตัวเลขพิมพ์มือ = 0 (WS8 ข้อ 3 · phase0-exit §3)

**Files:**
- Create: `test/docs-test.js`
- Modify: `package.json` (`verify` เพิ่ม `node test/docs-test.js` หลัง `node test/queue-test.js` · `test:docs`) · `.githooks/pre-push` (ผ่าน gen-docs — เติม `STEP_LABELS['test/docs-test.js'] = ['📚', 'docs ↔ code (docs-test)', 'docs gate']`) · `test/queue-test.js:20-31` (assertion จำนวนขั้นอ่านจาก package.json อยู่แล้ว — ไม่ต้องแก้ · ยืนยัน)
- Modify: `CLAUDE.md` §8 ย่อหน้าใต้ chain — 1 บรรทัด: `docs-test` เข้า gate (ระยะ 1)

**Interfaces:**
- Produces: `node test/docs-test.js` — (ก) `require('../tools/gen-docs.js').check()` ว่าง (ข) วลีต้องห้าม 0 hit ในชุดไฟล์ docs (ค) ตัวเลข "N ขั้น" / "N error + M warning" นอก marker = 0 · exit 1 เมื่อไม่ผ่าน · พิมพ์ `✅ docs ตรงโค้ด`
- DOCS = `CLAUDE.md README.md docs/*.md .claude/skills/stock-analyzer/SKILL.md _template/agent-prompt.md .github/workflows/*.yml` (ไม่รวม `docs/superpowers/**` — เอกสาร audit ต้องอ้างข้อความเก่าได้) · โค้ด `tools/*.js test/*.js` ตรวจเฉพาะ pattern dead-band

- [ ] **Step 1: เขียนเทส** — `test/docs-test.js`:

```js
#!/usr/bin/env node
'use strict';
/**
 * docs-test — เอกสารต้องตรงโค้ด (spec WS8 ข้อ 3/4 · phase0-exit §3: sweep วลีขัดกันต้องเป็นเทส ไม่ใช่ grep มือ)
 *  (ก) ตัวเลข/ตารางระหว่าง marker gen: ตรงกับ CHECKS/package.json  (ข) วลีที่ถูกยกเลิกแล้วต้องไม่กลับมา  (ค) ตัวเลขที่ต้อง generate ห้ามพิมพ์มือนอก marker
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let n = 0, fails = 0;
const ok = (c, label, detail) => { n++; if (c) return; fails++; console.error(`✗ ${label}${detail ? ' — ' + detail : ''}`); };
const list = (dir, re) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)).map((f) => `${dir}/${f}`);
const DOCS = ['CLAUDE.md', 'README.md', ...list('docs', /\.md$/), '.claude/skills/stock-analyzer/SKILL.md', '_template/agent-prompt.md', ...list('.github/workflows', /\.yml$/)];
const CODE = [...list('tools', /\.js$/), ...list('test', /\.js$/)];

// (ก) gen-docs
const bad = require('../tools/gen-docs.js').check();
ok(bad.length === 0, 'gen-docs --check: ทุกไฟล์ตรงโค้ด', bad.map((b) => `${b.file}: ${b.why}`).join(' · '));

// (ข) วลีที่ยกเลิกแล้ว (phase0-exit §3 11 วลี + ระยะ 1) — hit = กฎเก่าหลุดกลับมา
const FORBIDDEN = [
  /\bsequential\b(?!.*tags\.json)/i, /เวฟ ≤3/, /Sonnet เป็น default ทุกชั้น/, /ห้าม controller\/worker เรียก advisor ตรง/, /ไม่มี Opus แล้ว/,
  /pre-assign สีแบรนด์เอง/, /= Opus 5 โดยไม่ตั้งใจ/, /52 code/, /\b13 ขั้น/, /\b11 ขั้น/, /8 ขั้นเดิม/,
  /ไม่มี lock/, /dead-band ±3/, /±3 จุด/, /flip ใน ±3/, /controller ต้อง pre-patch ทั้งชุด/, /worker ห้ามรัน update-prices/,
];
for (const f of DOCS) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((l, i) => { for (const re of FORBIDDEN) if (re.test(l)) ok(false, `วลีต้องห้ามใน ${f}:${i + 1}`, `${re} — "${l.trim().slice(0, 100)}"`); });
}
for (const f of CODE) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((l, i) => { if (/dead-band ±3|±3 จุด/.test(l)) ok(false, `dead-band 3 ค้างในโค้ด ${f}:${i + 1}`, l.trim().slice(0, 100)); });
}

// (ค) ตัวเลขที่ต้อง generate: "N ขั้น" ของ verify · "N error + M warning" — นอก marker = พิมพ์มือ
const stripGen = (t) => t.replace(/<!-- gen:[a-z-]+ -->[\s\S]*?<!-- \/gen:[a-z-]+ -->/g, '').replace(/# gen:steps[\s\S]*?# \/gen:steps/g, '');
for (const f of DOCS) {
  const t = stripGen(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const m1 = t.match(/(?:verify|ประตู cron|gate)[^\n]{0,40}?\b\d{1,2} ขั้น|\b\d{1,2} ขั้น[^\n]{0,40}?verify/g);
  ok(!m1, `${f}: "N ขั้น" ของ verify นอก marker`, m1 && m1.join(' | '));
  const m2 = t.match(/\d+ error \+ \d+ warning/g);
  ok(!m2, `${f}: "N error + M warning" นอก marker`, m2 && m2.join(' | '));
}
console.log(fails ? `\n✗ docs-test: ${fails} failed / ${n - fails} passed` : `\n✅ docs ตรงโค้ด (docs-test ${n} เคส)`);
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: รันให้ล้ม/ผ่าน** — `node test/docs-test.js` → คาดว่ามี hit ของ (ค) ในไฟล์ที่ยังพิมพ์ "14 ขั้น" นอก marker (เช่น `docs/quality-gate.md` ที่อื่น · `README.md`) → ใส่ marker เพิ่มหรือเปลี่ยนประโยคให้ไม่ระบุตัวเลข (เช่น "ทุกขั้นใน `npm run verify`") จนผ่าน · วลี (ข) ต้อง 0 ตั้งแต่แรก (ระยะ 0 ล้างแล้ว) — ถ้ามี hit ที่เป็นบริบทประวัติ (เช่น "เดิม ±3") ให้เขียนใหม่โดยไม่ใช้วลีต้องห้าม **ห้ามยกเว้นใน regex**

- [ ] **Step 3: เข้า verify (14 → 15)** — `package.json` `verify`: แทรก `&& node test/docs-test.js` หลัง `node test/queue-test.js` · เพิ่ม `"test:docs": "node test/docs-test.js"` · `tools/gen-docs.js` `STEP_LABELS` เพิ่ม `'test/docs-test.js': ['📚', 'docs ↔ code (docs-test)', 'docs gate']` · `node tools/gen-docs.js` (pre-push + ตัวเลข 15 ทุกที่) · `node test/queue-test.js` (mirror + ป้าย i/15) · `CLAUDE.md` §8 ย่อหน้า "self-test เข้า gate แล้ว" ต่อท้าย: ` · \`docs-test\` เข้า gate (ระยะ 1 — ตัวเลข/ตารางใน docs generate จาก \`tools/gen-docs.js\` แก้มือแล้ว verify ตก)`

- [ ] **Step 4: verify + Commit** — `npm run verify` 15/15

```bash
git add test/docs-test.js package.json tools/gen-docs.js .githooks/pre-push CLAUDE.md docs README.md
git commit -m "verify: docs-test ขั้นที่ 15 — gen-docs ตรงโค้ด · วลีที่ยกเลิก 0 · ตัวเลขพิมพ์มือนอก marker 0 (WS8 ข้อ 3 · phase0-exit §3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 20: `docs/orchestration.md` — ลบส่วนที่ซ้ำ CLAUDE.md §3/§5 เหลือกลไกที่ CLAUDE.md ชี้มา (WS8 ข้อ 4 · ข้อ F)

**Files:**
- Modify: `docs/orchestration.md:11-22` (§2) · `:24-30` (§3) · `:32-37` (§4) · `:63-65` (§6)
- Modify: `CLAUDE.md` §3 บรรทัดเปิด ("รายละเอียด+เหตุผลทั้งหมด → docs/orchestration.md") ให้ตรงกับสิ่งที่เหลือ

**Interfaces:**
- หลังแก้ `docs/orchestration.md` เหลือ: §1 ก่อนเริ่ม (ชี้ runbook) · §2 **กลไก courier** เท่านั้น (วิธี spawn courier subagent · prompt ที่ใช้ · ทำไม worker ห้ามเรียกตรง — CLAUDE.md §3.2/§7 ชี้มาที่นี่) · §5 analyze-wave (กลไก args/effort/ตัวอย่าง) · §7 เกร็ดต้นทุน · ส่วนที่เป็น **กฎ** (โมเดล · 1 หุ้น/agent · push รายตัว · ลดจำนวน) = 1 บรรทัดชี้ CLAUDE.md §3 ข้อ 2–5 / §5 — ไม่ทวนข้อความ

- [ ] **Step 1: ตัด** — §2 (`:11-22`): ลบทุกประโยคที่ทวนกฎโมเดล (Haiku/Sonnet/Opus/pin/probe) เหลือย่อหน้า courier: วิธีเรียก (`Agent` model sonnet · prompt "คุณคือ courier: เรียก advisor ด้วยคำถามต่อไปนี้แล้วคืนคำตอบ verbatim …") · เมื่อไรใช้ (หุ้นยาก · publish/skip กำกวม · context ใหญ่จน advisor unavailable) · courier ล้ม → หยุดถาม user · บรรทัดแรกของ §2: `> กติกาโมเดล/effort = CLAUDE.md §3.2 (ที่เดียว) — หัวข้อนี้มีแต่กลไก courier` · §3 (`:24-30`) → `## 3. Spawn` + 1 บรรทัด `กฎ 1 หุ้น/agent · ขนานได้ · verify รายแบตช์ = CLAUDE.md §3.3 · prompt = _template/agent-prompt.md · STEP 0 กัน cwd-stray อยู่ในไฟล์นั้น` (คงเฉพาะรายละเอียด cwd-stray ถ้ามีในหัวข้อนี้และไม่มีที่อื่น) · §4 (`:32-37`) → 1 บรรทัด `= CLAUDE.md §5 (worker ห้าม push · controller verify+push)` · §6 (`:63-65`) → ลบ (CLAUDE.md §3.5 มีแล้ว) · เลขหัวข้อเรียงใหม่ · `CLAUDE.md` §3 บรรทัดเปิด "รายละเอียด+เหตุผลทั้งหมด → `docs/orchestration.md`" → "กลไก courier/analyze-wave/ต้นทุน → `docs/orchestration.md` (กฎอยู่ที่นี่ที่เดียว)"

- [ ] **Step 2: ตรวจ** — `node test/docs-test.js` ผ่าน · `rtk proxy grep -c "Haiku\|pin \`model\`\|HEAD:main" docs/orchestration.md` → 0 (คำเหล่านี้คือกฎ ต้องอยู่ CLAUDE.md เท่านั้น) · `wc -l docs/orchestration.md` ลดลง (docs สั้นลง ไม่ยาวขึ้น — spec WS8)

- [ ] **Step 3: Commit + เปิด PR #D**

```bash
git add docs/orchestration.md CLAUDE.md
git commit -m "docs: orchestration.md เหลือกลไก courier/analyze-wave/ต้นทุน — กฎโมเดล/spawn/push ชี้ CLAUDE.md ที่เดียว (WS8 ข้อ 4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p1-d-docs-gen
gh pr create --base claude/audit-p1-c-queue-policy --title "audit ระยะ 1 ส่วน D: ตาราง/ตัวเลข gate generate จากโค้ด · docs-test เป็น verify ขั้น 15 · orchestration.md ลดซ้ำ (WS8 ข้อ 3/4)" --body-file - <<'PRBODY'
## สรุป
- `tools/gen-docs.js`: ตาราง E/W (คง prose ของคน) · 47/15 · จำนวนขั้น verify/verify:cron · บล็อกขั้นใน pre-push — generate จาก CHECKS + package.json (marker ใน 5 ไฟล์)
- `test/docs-test.js` = verify ขั้น 15: gen-docs ตรงโค้ด · วลีที่ยกเลิก 17 แพทเทิร์น = 0 · ตัวเลขพิมพ์มือนอก marker = 0
- `docs/orchestration.md` เหลือกลไก (courier · analyze-wave · ต้นทุน) — กฎอยู่ CLAUDE.md ที่เดียว (−<N> บรรทัด)

## ทดสอบ
- `npm run verify` 15/15 · `node tools/gen-docs.js --check` exit 0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

---

# ส่วน E — WS9(a) กับดัก vendor ที่ตรวจเชิงกลได้ + WS8 ข้อ 7 `test:prep` เข้า verify (PR #E)

สาขา: `claude/audit-p1-e-vendor-traps` (base = `claude/audit-p1-d-docs-gen`)

### Task 21: fetch-fundamentals — entity mismatch (6O) + SA market cap vs หุ้น×ราคา (WS9(a) · data-source-traps 6O · "SA cap ล้าหลัง")

**Files:**
- Modify: `tools/fetch-fundamentals.js` (ฟังก์ชันใหม่ 2 ตัว + พิมพ์ในบล็อก `[2b]` `:463` + export)
- Test: `test/prep-stock-test.js` (fixture `makeFinPage`/`makeStatsPayload` ที่มี)

**Interfaces:**
- Produces:
  - `entityMismatchLine(table, stats)` → string|null — `table` จาก `tableEpsTTM(finPages[0])` (`{ eps, ni, shares, from }`) · `stats` จาก `fromStatistics` (`{ sharesOut, … }`) · คำนวณ `eps2 = table.ni / stats.sharesOut` (หน่วยเดียวกัน: ni หน่วยเต็ม · sharesOut หน่วยเต็ม) · ถ้า `|eps2 − table.eps| / |table.eps| > ENTITY_MISMATCH_PCT (=40)` → `⚠ entity mismatch? NI[3] ÷ Shares[2b] = X แต่ EPS(dil)[3] = Y (ต่าง Z%) — กำไรบริษัทเก่า ÷ หุ้นบริษัทใหม่ (เคส VMRK) ⇒ ห้ามมีขา P/E จนยืนยัน XBRL` · ต่ำกว่าเกณฑ์/ข้อมูลไม่ครบ → null (หุ้นถัวเฉลี่ย vs คงเหลือต่างได้ −30..+11% — memory POET/AAOI — จึงตั้ง 40 ไม่ใช่ 25)
  - `capLine(stats, price, info)` → string|null — `info.marketCap` (SA quote `:98` ขอ key `marketCap` อยู่แล้ว) vs `stats.sharesOut × price` · ต่าง > CAP_WARN_PCT (=5) → `⚠ SA market cap ${cap} ≠ หุ้น ${sharesOut} × ราคา ${price} = ${calc} (ต่าง Z%) — SA cap ล้าหลัง quote ของตัวเอง ใช้ หุ้น×ราคา (memory: SA market cap ล้าหลัง)`
  - ทั้งสองบรรทัดพิมพ์ต่อจาก `statsLines` (`:463`) — เป็น WARN ไม่เปลี่ยน exit code (เหมือน Δ EPS ตาราง [3] — `prep-stock.js:50`) · export `entityMismatchLine, capLine, ENTITY_MISMATCH_PCT, CAP_WARN_PCT`
  - `tools/prep-stock.js` `parseDeltas` ไม่ต้องแกะ 2 บรรทัดนี้ (ไม่มีผลต่อ verdict) แต่ `tools/queue/prep.js` `extraBlock` ต้องคัดบรรทัด `⚠ entity mismatch` / `⚠ SA market cap` จาก output ไปใส่ในบล็อก "กับดักที่ prep พบ" ของ prompt (ค้นหาที่ `extraBlock` ใส่ `snap`)

- [ ] **Step 1: เทส (ล้มก่อน)** — ต่อท้าย `test/prep-stock-test.js` (ก่อน tally):

```js
// ---------- WS9(a) ระยะ 1: entity mismatch (6O) + SA cap vs หุ้น×ราคา ----------
{
  const vmrkFin = F.tableEpsTTM(makeFinPage({ datekey: ['TTM'], epsDiluted: [3.10], netIncome: [310e6], sharesDiluted: [100e6] }));   // EPS จริงของบริษัทเก่า
  const statsNew = { sharesOut: 400e6 };                                                                                                   // หุ้นบริษัทใหม่หลังควบรวม
  const l1 = F.entityMismatchLine(vmrkFin, statsNew);
  ok(l1 && /entity mismatch/.test(l1) && /VMRK/.test(l1) && /ห้ามมีขา P\/E/.test(l1), 'entityMismatchLine: NI÷Shares[2b] ต่างจาก EPS(dil) 75% → เตือน', l1);
  ok(F.entityMismatchLine(vmrkFin, { sharesOut: 110e6 }) == null, 'entityMismatchLine: ต่าง 10% (ถัวเฉลี่ย vs คงเหลือ) → เงียบ');
  ok(F.entityMismatchLine(vmrkFin, null) == null && F.entityMismatchLine({ eps: null }, statsNew) == null, 'entityMismatchLine: ข้อมูลไม่ครบ → null ไม่ throw');
  ok(F.ENTITY_MISMATCH_PCT === 40, 'ENTITY_MISMATCH_PCT = 40 (กว้างกว่าช่วงถัวเฉลี่ย/คงเหลือ −30..+11%)');
  const l2 = F.capLine({ sharesOut: 100e6 }, 50, { marketCap: 4.2e9 });
  ok(l2 && /SA market cap/.test(l2) && /หุ้น×ราคา|× ราคา/.test(l2), 'capLine: SA cap 4.2B vs 100M×50 = 5.0B (ต่าง 16%) → เตือน', l2);
  ok(F.capLine({ sharesOut: 100e6 }, 50, { marketCap: 5.1e9 }) == null, 'capLine: ต่าง 2% → เงียบ');
  ok(F.capLine({ sharesOut: 100e6 }, 50, {}) == null && F.capLine(null, 50, { marketCap: 1 }) == null, 'capLine: ไม่มี cap/ไม่มี stats → null');
}
```

(`marketCap` ของ SA อาจมาเป็น string "5.0B" — ให้ `capLine` ใช้ `asNum` ที่มี + รองรับ suffix B/M/T ผ่าน helper `amount(s)` ใหม่ · เทสเพิ่มเคส `{ marketCap: '4.2B' }`)

- [ ] **Step 2: โค้ด** — ใน `tools/fetch-fundamentals.js` ใต้ `statsLines`:

```js
const ENTITY_MISMATCH_PCT = 40;   // NI[3]÷Shares[2b] vs EPS(dil): ถัวเฉลี่ย↔คงเหลือต่างได้ −30..+11% (POET/AAOI) · VMRK ต่าง >70%
const CAP_WARN_PCT = 5;
const amount = (v) => { if (v == null) return null; if (typeof v === 'number') return v; const m = String(v).replace(/,/g, '').match(/^\s*\$?([0-9.]+)\s*([TBMK])?/i); if (!m) return null; const k = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[(m[2] || '').toUpperCase()] || 1; return parseFloat(m[1]) * k; };
/** 6O (data-source-traps): EPS ของ vendor หลังควบรวม = กำไรบริษัทเก่า ÷ หุ้นบริษัทใหม่ — จับด้วย NI[3] ÷ Shares[2b] vs EPS(dil) */
function entityMismatchLine(table, stats) {
  if (!table || !Number.isFinite(table.eps) || table.eps === 0 || !Number.isFinite(table.ni) || !stats || !(stats.sharesOut > 0)) return null;
  const eps2 = table.ni / stats.sharesOut;
  const d = Math.abs(eps2 - table.eps) / Math.abs(table.eps) * 100;
  if (d <= ENTITY_MISMATCH_PCT) return null;
  return `⚠ entity mismatch? NI[3] ÷ Shares[2b] = ${fmt(eps2)} แต่ EPS(dil)[3] = ${fmt(table.eps)} (ต่าง ${d.toFixed(0)}%) — กำไรบริษัทเก่า ÷ หุ้นบริษัทใหม่ (เคส VMRK 23 ส.ค. 69) ⇒ ห้ามมีขา P/E จนยืนยัน XBRL EarningsPerShareDiluted`;
}
/** SA market cap ล้าหลัง quote ของตัวเอง (memory data-source-traps) — เทียบกับ หุ้นคงเหลือ [2b] × ราคา */
function capLine(stats, price, info) {
  const cap = amount(info && info.marketCap);
  if (!stats || !(stats.sharesOut > 0) || !(price > 0) || !(cap > 0)) return null;
  const calc = stats.sharesOut * price;
  const d = Math.abs(calc - cap) / cap * 100;
  if (d <= CAP_WARN_PCT) return null;
  return `⚠ SA market cap ${fmtCell(cap, 'm')} ≠ หุ้น ${fmtCell(stats.sharesOut, 'm')}M × ราคา ${fmt(price)} = ${fmtCell(calc, 'm')} (ต่าง ${d.toFixed(0)}%) — SA cap ล้าหลัง quote ใช้ หุ้น×ราคา`;
}
```

ใน `main()` หลัง `for (const line of statsLines(…)) console.log(line);` (`:463`): `for (const l of [entityMismatchLine(table, stats), capLine(stats, sPrice || (y && y.price), s && s.info)]) if (l) console.log(l);` · export เพิ่ม · `tools/queue/prep.js` `parseVendor`/`extraBlock`: เก็บบรรทัดที่ขึ้นต้น `⚠ entity mismatch` / `⚠ SA market cap` ใส่ `traps[]` แล้วพิมพ์ในบล็อก prompt ใต้หัวข้อ `กับดักที่ prep พบ (ต้องจัดการก่อนเขียนเลข)` · เทสใน queue-test: `parseVendor` เจอ 2 บรรทัดนี้ → `traps.length === 2`

- [ ] **Step 3: รันให้ผ่าน + Commit** — `npm run test:prep` · `node test/queue-test.js`

```bash
git add tools/fetch-fundamentals.js tools/queue/prep.js test/prep-stock-test.js test/queue-test.js
git commit -m "prep: กับดัก vendor เชิงกล — entity mismatch NI[3]÷Shares[2b] vs EPS(dil) (6O) · SA market cap vs หุ้น×ราคา · ส่งเข้า prompt (WS9(a))

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 22: หน้า `/forecast/` — ปีงบของ EPS forward (WS9(a) "fwd EPS คนละปีงบ") — probe ครั้งเดียว + fixture + fallback

**Files:**
- Create: `test/fixtures/vendor/AAPL-forecast.json` (payload `__data.json` ที่ตัดให้เหลือ node ที่ใช้ — ≤50 KB) · `test/fixtures/README.md` (เติมหัวข้อ vendor)
- Modify: `tools/fetch-fundamentals.js` (`fromForecast` · `forecastLine` · พิมพ์ `[2c]`) · `test/prep-stock-test.js`
- Modify (fallback): `docs/open-items.md`

**Interfaces:**
- Produces: `fromForecast(symbol, th, fetchImpl)` → `{ years: [{ fy:'2026', eps:number }…] } | null` · `forecastLine(y, sa, fc)` → string|null: หา FY ที่ `epsFwd` ของ Yahoo (`y.epsFwd`) ใกล้ที่สุด (≤3%) แล้วพิมพ์ `[2c] forecast: FY2026e EPS x · FY2027e y — epsFwd ${v} ตรง FY${fy}e${fy !== ปีงบปัจจุบัน+1 ? ' ⚠ ไม่ใช่ปีงบถัดไป (vendor "forward" = FY ถัดไปอีกปี — ตรวจงวดก่อนใช้ใน FV)' : ''}` · หาไม่เจอ → `[2c] forecast: epsFwd ${v} ไม่ตรง FY ไหน (≤3%) — ตรวจงวดเองจาก /forecast/`
- **Fallback:** probe payload แล้วหา key ของตาราง EPS estimate ไม่เจอภายใน 30 นาที → บันทึก open-items "forecast: โครง __data.json หา key ไม่เจอ — เลื่อนไป WS9(b)" · ข้าม task นี้ทั้งหมด (ห้ามเดา)

- [ ] **Step 1: probe (network ครั้งเดียว)** —

```bash
curl -s -A 'Mozilla/5.0' 'https://stockanalysis.com/stocks/aapl/forecast/__data.json' -o /tmp/aapl-forecast.json && wc -c /tmp/aapl-forecast.json
rtk proxy node -e "const j=require('/tmp/aapl-forecast.json');const s=JSON.stringify(j);for(const k of ['epsEstimate','eps','estimates','forecast','revenue','fy','year']){const i=s.indexOf('\"'+k+'\"');console.log(k,i,i>=0?s.slice(i,i+160):'')}"
```

หา node ที่มี array ปีงบ + ค่า EPS estimate (โครง devalue เดียวกับ `fromStockAnalysis` — ใช้ `findObj(nodes, [keys])` + `resolveKeys` ที่มี) · เมื่อเจอ: ตัด payload ให้เหลือ `{ nodes: [ node นั้น ] }` เขียน `test/fixtures/vendor/AAPL-forecast.json` (ห้ามเก็บทั้งไฟล์ — fixture-lint ไม่เกี่ยวเพราะไม่ใช่ reports/)

- [ ] **Step 2: เทส (ล้มก่อน)** —

```js
// ---------- WS9(a): /forecast/ — ปีงบของ epsFwd ----------
{
  const payload = require('./fixtures/vendor/AAPL-forecast.json');
  return F.fromForecast('AAPL', false, async () => ({ ok: true, json: async () => payload })).then((fc) => {
    ok(fc && Array.isArray(fc.years) && fc.years.length >= 2 && fc.years.every((r) => /^\d{4}$/.test(r.fy) && Number.isFinite(r.eps)), 'fromForecast: อ่าน FY+EPS estimate ≥2 ปี จาก fixture', JSON.stringify(fc));
    const [a, b] = fc.years;
    ok(/FY\d{4}e/.test(F.forecastLine({ epsFwd: b.eps }, null, fc)) && /⚠/.test(F.forecastLine({ epsFwd: b.eps }, null, fc, a.fy)), 'forecastLine: epsFwd ตรง FY ถัดไปอีกปี → ⚠ ไม่ใช่ปีงบถัดไป');
    ok(!/⚠/.test(F.forecastLine({ epsFwd: a.eps }, null, fc, String(+a.fy - 1))), 'forecastLine: epsFwd ตรง FY ถัดไป → ไม่เตือน');
    ok(/ไม่ตรง FY ไหน/.test(F.forecastLine({ epsFwd: a.eps * 1.5 }, null, fc)), 'forecastLine: ไม่ตรงปีไหน → บอกให้ตรวจเอง');
  });
}
```

(`forecastLine(y, sa, fc, currentFY)` — `currentFY` = ปีงบล่าสุดที่ปิดจากตาราง [3] `datekey` · ให้ `main()` ส่งจาก `finPages[0]` · tally ของไฟล์รอ promise แบบ Task 4)

- [ ] **Step 3: โค้ด** — `fromForecast` ใช้ `saBases(symbol, th)` + `/forecast/__data.json` + `findObj/resolveKeys` ตาม key ที่ probe เจอ (เขียน key จริงลงคอมเมนต์พร้อมวันที่ probe) · `forecastLine` ตามสัญญา · `main()`: fetch ขนานกับหน้าอื่น (`Promise.all` ที่ `:430`) · พิมพ์บรรทัด `[2c]` หลัง `[2]` · export `fromForecast, forecastLine` · fixture README เติม: ที่มา URL · วันที่ · ตัดเหลือ node ไหน

- [ ] **Step 4: รันให้ผ่าน + Commit** — `npm run test:prep`

```bash
git add tools/fetch-fundamentals.js test/prep-stock-test.js test/fixtures/vendor/AAPL-forecast.json test/fixtures/README.md
git commit -m "prep: /forecast/ — ปีงบของ epsFwd (vendor forward = FY ถัดไปอีกปีได้) + fixture (WS9(a))

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 23: median-multiples ฉีด fetcher ได้ + `test/median-multiples-test.js` (open-item #4) + `test:prep` เข้า verify ขั้นที่ 16 (WS8 ข้อ 7)

**Files:**
- Modify: `tools/median-multiples.js:91` (`oneSymbol(spec, th, deps)`) · export
- Create: `test/median-multiples-test.js` (export function รับ `ok` · require จาก `test/prep-stock-test.js` — ไม่เพิ่มขั้น)
- Modify: `package.json` (`verify` เพิ่ม `node test/prep-stock-test.js` หลัง `docs-test`) · `tools/gen-docs.js` `STEP_LABELS` (`'test/prep-stock-test.js': ['🧮', 'unit-test prep-stock/medians (prep-stock-test)', 'prep-stock unit gate']`) · `.githooks/pre-push` (gen) · docs ผ่าน gen-docs · `docs/open-items.md` (#4 #8 ปิด)

**Interfaces:**
- Produces: `oneSymbol(spec, th, deps = { fetchFinPage, monthlyCloses, statementCurrency })` — เดิมเรียก global 3 ตัว → เรียกผ่าน `deps` (default = ของจริง) · เทสฉีด fixture · `report(r)` ไม่เปลี่ยน

- [ ] **Step 1: เทส (ล้มก่อน)** — `test/median-multiples-test.js`:

```js
'use strict';
/** median-multiples-test — offline (open-item #4: เครื่องมือของ controller ก็ต้องตรวจ — เคส AU 2,074x · CP ผสมสกุล 9–10 ก.ย. 69) */
module.exports = function medianTest(ok) {
  const MM = require('../tools/median-multiples.js');
  const fy = (y) => `${y}-12-31`;
  const page = { src: 'x', fd: {}, arr: [] };
  const finRowStub = { datekey: ['TTM', fy(2025), fy(2024), fy(2023), fy(2022), fy(2021)], epsDiluted: [5, 5, 4, 0.01, -2, 3] };
  // ราคาปิดรายเดือน 8 ปี คงที่ 100 → P/E = 100/EPS: 20 · 25 · 10,000 (สุดขั้ว) · ขาดทุน · 33.3
  const closes = { currency: 'USD', points: [] };
  for (let y = 2018; y <= 2026; y++) for (let m = 1; m <= 12; m++) closes.points.push({ t: Date.UTC(y, m - 1, 15) / 1000, c: 100 });
  const deps = { fetchFinPage: async () => page, monthlyCloses: async () => closes, statementCurrency: async () => 'USD', finRow: (p, keys) => finRowStub[keys[0]] || null };
  return MM.oneSymbol('X', false, deps).then((r) => {
    ok(r.rows.length === 5 && r.rows.every((x) => x.key !== 'TTM'), 'oneSymbol: ข้าม TTM · 5 FY');
    ok(r.rows.find((x) => x.key === fy(2022)).skip && /EPS ≤ 0/.test(r.rows.find((x) => x.key === fy(2022)).skip), 'ปี EPS ≤ 0 ถูกข้าม (ไม่เข้ามัธยฐาน)');
    ok(r.dropped.some((d) => d.key === fy(2023) && /สุดขั้ว/.test(d.outlier)), 'P/E 10,000x ถูกตัดเป็น outlier (เคส AU 2,074x)');
    ok(r.used.length === 3 && Math.abs(r.median - 25) < 1e-9, 'มัธยฐานจาก 3 ปีปกติ = 25x');
    ok(/มัธยฐาน/.test(MM.report(r)) && !/10000|10,000/.test(MM.report(r).split('★')[1] || ''), 'report: บรรทัด ★ ไม่มีค่าสุดขั้ว');
    return MM.oneSymbol('CP', false, { ...deps, statementCurrency: async () => 'CAD' });
  }).then((r) => {
    ok(r.median == null && r.curErr && /CAD/.test(r.curErr) && /USD/.test(r.curErr), 'ผสมสกุล (งบ CAD · ราคา USD) → median null + curErr (เคส CP)');
  }).then(() => MM.oneSymbol('Y', false, { ...deps, finRow: (p, keys) => ({ datekey: ['TTM', fy(2025), fy(2024)], epsDiluted: [5, 5, 4] })[keys[0]] })).then((r) => {
    ok(r.median == null && r.used.length === 2, `MIN_POINTS: 2 ปี < ${MM.MIN_POINTS} → median null`);
  });
};
```

(ถ้า `avgWindow`/`monthlyCloses` ใช้รูป `points` ต่างจากนี้ ให้ปรับ fixture ตามโครงจริงใน `tools/median-multiples.js:70-88` — ห้ามแก้โค้ดจริงให้เข้ากับเทส) · ใน `test/prep-stock-test.js` ก่อน tally: `const pendingMM = require('./median-multiples-test.js')(ok);` และรอ promise

- [ ] **Step 2: โค้ด** — `tools/median-multiples.js:91`: `async function oneSymbol(spec, th, deps) { const D = { fetchFinPage, monthlyCloses, statementCurrency, finRow, ...(deps || {}) }; …` แล้วแทนการเรียก 4 ตัวในฟังก์ชันด้วย `D.*` · export เดิม

- [ ] **Step 3: เข้า verify (15 → 16)** — `package.json` `verify`: `… && node test/docs-test.js && node test/prep-stock-test.js && …` · `gen-docs.js` `STEP_LABELS` เพิ่ม · `node tools/gen-docs.js` · `node test/queue-test.js` · `node test/docs-test.js` · `docs/open-items.md`: #4 → ปิด (median test) · #8 → ปิด (`test:prep` ใน verify) ในตาราง "ปิดแล้ว (ระยะ 1)"

- [ ] **Step 4: verify + Commit** — `npm run verify` 16/16

```bash
git add tools/median-multiples.js test/median-multiples-test.js test/prep-stock-test.js package.json tools/gen-docs.js .githooks/pre-push CLAUDE.md docs README.md
git commit -m "verify: prep-stock-test (+median-multiples-test ฉีด fetcher) ขั้นที่ 16 — open-items #4 #8

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 24: ปิด #7 (ป้าย "P/E เฉลี่ย ~N ปี" vs FY ที่มีจริง) และ #10 (แถว Shares ถัวเฉลี่ยติดป้าย) ด้วยโค้ด/เทส + เปิด PR #E

**Files:**
- Modify: `tools/queue/prep.js` (บันทึก `fyYears` ลง state) · `tools/queue/postcheck.js` (เทียบกับ manifest f55) · `test/queue-test.js` · `test/prep-stock-test.js` (#10) · `docs/open-items.md`

**Interfaces:**
- `prep`: นับ FY ที่มี EPS(dil) จริงจากตาราง [3] ใน output ของ fetch-fundamentals (บรรทัด `EPS(dil)` — จำนวนคอลัมน์ที่เป็นตัวเลข ไม่นับ TTM) → `S.update(sym, { fyYears: N })` + บรรทัดใน prompt `FY ที่มี EPS จริง: N ปี — ป้าย "P/E เฉลี่ย ~M ปี" ห้ามเกิน N`
- `postcheck`: `const f55 = ctx.mf.values.f55; if (f55 != null && rec.fyYears != null && f55 > rec.fyYears) issues.push(`การ์ด "P/E เฉลี่ย ~${f55} ปี" แต่ตาราง [3] มี EPS จริง ${rec.fyYears} ปี (เคส GABLE — นับคอลัมน์ก่อนเชื่อป้าย)`)`
- #10: เทสใน prep-stock-test ยืนยัน `F.SHARES_LABEL === 'Shares(wAvgDil)'` และ `printFinancialTable` พิมพ์ `SHARES_NOTE` เมื่อมีแถว shares (ใช้ fixture `amataFin`) → open-item ปิดด้วยเทส (โค้ดมีอยู่แล้วตั้งแต่ 17 ส.ค. 69 แต่ไม่มีอะไรคุม)

- [ ] **Step 1: เทส (ล้มก่อน)** — queue-test: `P.parseVendor(text)` ที่มีบรรทัด `EPS(dil)   5.10  4.80  4.20  -  -` → `fyYears === 3` · postcheck: เรียก `checkMeta`-style helper ใหม่ `checkFyYears(f55, fyYears)` → คืน issue เมื่อ 5 > 3 · null เมื่อ 3 ≤ 3 หรือข้อมูลขาด · prep-stock-test: เคส #10 ตามสัญญา

- [ ] **Step 2: โค้ด** — `prep.js` `parseVendor` เพิ่ม `fyYears` (นับ token ตัวเลขในบรรทัดที่ขึ้นต้น `EPS(dil)` หักคอลัมน์ TTM ถ้าหัวตารางมี) · `prep()` `S.update(…, fyYears)` + บรรทัดใน `extraBlock` · `postcheck.js` export `checkFyYears` + เรียกใน `postcheck()` · `docs/open-items.md` #7 #10 → ปิด (ระยะ 1)

- [ ] **Step 3: verify + Commit + เปิด PR #E**

```bash
npm run verify
git add tools/queue/prep.js tools/queue/postcheck.js test/queue-test.js test/prep-stock-test.js docs/open-items.md
git commit -m "prep/postcheck: นับ FY ที่มี EPS จริงเทียบป้าย \"P/E เฉลี่ย ~N ปี\" (#7) · เทสคุมป้ายแถว Shares ถัวเฉลี่ย (#10)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p1-e-vendor-traps
gh pr create --base claude/audit-p1-d-docs-gen --title "audit ระยะ 1 ส่วน E: กับดัก vendor เชิงกลใน prep (6O · SA cap · forecast FY) · median-multiples test · test:prep เข้า verify (WS9(a) · WS8 ข้อ 7)" --body-file - <<'PRBODY'
## สรุป
- fetch-fundamentals: entity mismatch NI[3]÷Shares[2b] vs EPS(dil) (VMRK) · SA market cap vs หุ้น×ราคา · `/forecast/` ปีงบของ epsFwd (fixture `test/fixtures/vendor/`) — ส่งเข้า prompt เป็น "กับดักที่ prep พบ"
- median-multiples ฉีด fetcher ได้ + เทส offline (AU 2,074x · CP ผสมสกุล · EPS ≤0 · MIN_POINTS) — open-item #4
- `test:prep` (+medians) = verify ขั้น 16 — open-item #8 · #7 #10 ปิดด้วยโค้ด/เทส

## ทดสอบ
- `npm run verify` 16/16 · prep-stock-test +<N>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

---

# ส่วน F — เกณฑ์จบระยะ 1 (spec §6) — วัดแล้วบันทึก (PR #F)

สาขา: `claude/audit-p1-f-exit` (base = `claude/audit-p1-e-vendor-traps`)

### Task 25: วัด 5 เกณฑ์ + `phase1-exit.md`

**Files:**
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/replay-queue.js` · `docs/superpowers/audit/2026-09-11-stock-analyzer/phase1-exit.md`
- Modify: `docs/superpowers/audit/2026-09-11-stock-analyzer/metrics.md` (§10 ใหม่: ผลระยะ 1)

**Interfaces:**
- เกณฑ์ (spec §6 แถว "1"): (1) gate พิมพ์ coverage ทุกไฟล์ (2) NEITHER 18 → 0 (3) UNVERIFIED WRITE 3 → 0 (4) W17/W19/W20 → E โดย cron ไม่ล้ม (5) คิว LLM ต่อสัปดาห์ลด ≥50%

- [ ] **Step 1: เกณฑ์ 1** — `rtk proxy node test/check-reports.js | grep -c 'ช่อง [0-9]*/68'` = 908 · บรรทัดสรุปมี `ช่องต่ำสุด` · บันทึก min/median ของ coverage (`grep -o 'ช่อง [0-9]*/68' | sort | uniq -c`)

- [ ] **Step 2: เกณฑ์ 2–3** — `node -e "const {FIELDS}=require('./tools/field-manifest.js');const n=FIELDS.filter(f=>f.binding==='deferred'||(!f.gate.length&&f.binding!=='pair'&&f.binding!=='presence'&&f.binding!=='cron'));console.log('ไม่มี binding:',n.map(f=>f.id))"` → ต้องเหลือเฉพาะ `f64` (deferred ระยะ 2 โดยข้อ A/B) · ตาราง 18 แถว NEITHER เดิม → binding ใหม่ (จาก `manifest-census.md`) · 3 แถว UNVERIFIED (f11 f12 f50) → `pair` + cron log found:false

- [ ] **Step 3: เกณฑ์ 4** — `SWEEP_DIR=<scratchpad>/sweep-p1 sh docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh` → `sweep fails=0` (บน main ของสาขา F ที่รวม A–E ทั้งหมด — ต่างจาก Task 5 ที่วัดบน A อย่างเดียว) · ตาราง 12 แถว

- [ ] **Step 4: เกณฑ์ 5 — replay** — `replay-queue.js`:

```js
#!/usr/bin/env node
'use strict';
/** replay คิว price-flags 8 snapshot ล่าสุดผ่าน triage ใหม่ (offline · จาก git history) — วัด "คิว LLM ลด ≥50%" (spec §6 ระยะ 1)
 *  กฎเก่า = ทุก LIGHT/FULL ที่ไม่ skip ส่ง LLM · กฎใหม่ = llmList (flip → PREPATCH เว้นอายุ >90 วัน — ไม่มีปฏิทินย้อนหลังจึงวัดเฉพาะกฎ flip) */
const { execSync } = require('child_process');
const T = require('../../../../tools/queue/triage.js');
const { footerDate, ageDays } = require('../../../../tools/queue/footer-date.js');
const shas = execSync('git log --since=2026-08-01 --format=%h|%ad --date=short -- price-flags.json', { encoding: 'utf8' }).trim().split('\n').slice(0, 8);
const OLD = { 'mos-sign-flip': 'LIGHT', 'drift-gt-15pct': 'LIGHT', 'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL' };
let sumOld = 0, sumNew = 0;
console.log('| snapshot | flags | LLM (กฎเก่า) | LLM (กฎใหม่) | ลด |\n|---|---|---|---|---|');
for (const line of shas) {
  const [sha, date] = line.split('|');
  let flags; try { flags = JSON.parse(execSync(`git show ${sha}:price-flags.json`, { encoding: 'utf8' })); } catch (_) { continue; }
  if (!Array.isArray(flags) || !flags.length) continue;
  const footerAgeOf = (sym) => { try { const h = execSync(`git show ${sha}:reports/${sym}.html`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); const d = footerDate(h); return d ? ageDays(d.iso, date) : null; } catch (_) { return null; } };
  const rows = T.triage(flags, { footerAgeOf });
  const oldLLM = rows.filter((r) => { const b = /^drift-gt-/.test(r.reason) ? 'LIGHT' : OLD[r.reason]; return b && !(r.footerAge != null && r.footerAge <= T.FRESH_DAYS); }).length;
  const newLLM = T.llmList(rows).length;
  sumOld += oldLLM; sumNew += newLLM;
  console.log(`| ${date} ${sha} | ${flags.length} | ${oldLLM} | ${newLLM} | ${oldLLM ? Math.round((1 - newLLM / oldLLM) * 100) : 0}% |`);
}
console.log(`\nรวม: กฎเก่า ${sumOld} · กฎใหม่ ${sumNew} · ลด ${Math.round((1 - sumNew / sumOld) * 100)}% (เกณฑ์ ≥50%)`);
process.exit(sumOld && 1 - sumNew / sumOld >= 0.5 ? 0 : 1);
```

`rtk proxy node docs/superpowers/audit/2026-09-11-stock-analyzer/replay-queue.js` → ตาราง + บรรทัดรวม (คาด ~65–80% จาก metrics §4: flip = 67–83% ของคิว · ส่วนที่ยกเป็น LIGHT เพราะอายุ >90 จะดึงกลับบางส่วน) · exit 0

- [ ] **Step 5: เขียน `phase1-exit.md`** — โครงเดียวกับ `phase0-exit.md`: §0 ตาราง 5 เกณฑ์ · §1–§5 หลักฐานต่อเกณฑ์ (คำสั่ง + ผล) · §6 KPI (spec §7: NEITHER/UNVERIFIED 0/0 · หุ้นที่ส่ง LLM/หุ้นที่ติด flag ≤40% · รหัส E/W ใหม่ในระยะ = W21 W22 (2 · ทั้งคู่ W) · ขั้น verify 16 · warning เปิด (W21/W22 ที่เพิ่งเห็น = หนี้ระยะ 3)) · §7 ยังเปิด (calendar fallback ถ้าเกิด · W22 หลายสิบใบ · f64 ระยะ 2 · เงื่อนไขก่อนระยะ 2: freeze การวิเคราะห์ใหม่ 1–2 วันตอน migrate) · `metrics.md` §10 สรุปตัวเลขเดียวกัน

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/audit/2026-09-11-stock-analyzer/replay-queue.js docs/superpowers/audit/2026-09-11-stock-analyzer/phase1-exit.md docs/superpowers/audit/2026-09-11-stock-analyzer/metrics.md
git commit -m "docs(audit): ผลวัดเกณฑ์จบระยะ 1 (coverage ทุกไฟล์ · NEITHER 0 · UNVERIFIED 0 · sweep หลัง W→E · replay คิว LLM −N%)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 26: open-items + spec/plan status + เปิด PR #F

**Files:**
- Modify: `docs/open-items.md` (ตาราง "ปิดแล้ว (ระยะ 1)" ครบ: #2 (f49 W22) · #4 · #7 · #8 · #9 (f41 W22) · #10 · #13 · #14 (roe rule) · #19 · #22 · #23 · ข้อใหม่จาก fallback ถ้ามี) · `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md` (หัวไฟล์: ระยะ 1 ผ่าน/ไม่ผ่าน + ลิงก์ phase1-exit)
- Modify: `.superpowers/sdd/progress.md` (ledger — git-excluded)

- [ ] **Step 1: อัปเดต open-items** — ย้ายแถวที่ปิดพร้อม "ปิดโดย Task N (PR #x)" · ที่เหลือ (#1 #5 #6 #11 #15 #16 #17 #20) คอลัมน์ "ปิดใน" ยังถูกต้องไหม (ระยะ 2/3/เจ้าของ) · W22 หนี้ที่เพิ่งเห็น = ข้อใหม่ "W22 ยิง N ใบ (กรอบ 52wk ค้าง · ป้าย FV) — ระยะ 3 fix-on-touch"

- [ ] **Step 2: Commit + PR #F**

```bash
git add docs/open-items.md docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md
git commit -m "docs: open-items หลังระยะ 1 (ปิด 11 ข้อ) · spec บันทึกผลเกณฑ์จบระยะ 1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p1-f-exit
gh pr create --base claude/audit-p1-e-vendor-traps --title "audit ระยะ 1 ส่วน F: ผลวัดเกณฑ์จบระยะ 1 + open-items" --body-file - <<'PRBODY'
ผลวัด 5 เกณฑ์จบระยะ 1 ตาม spec §6 อยู่ใน `docs/superpowers/audit/2026-09-11-stock-analyzer/phase1-exit.md` — ผ่านครบ → เขียนแผนระยะ 2 (data layer · ข้อ A/B) ได้ · open-items ปิด 11 ข้อ

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

---

# แผนถัดไป

| แผน | เข้าเงื่อนไขเมื่อ | หัวข้องานหลัก (spec §4/§6 · ข้อ A–F) |
|---|---|---|
| `…-phase2-data-layer.md` | PR #A–#F ระยะ 1 merge · `phase1-exit.md` ผ่าน 5 เกณฑ์ · manifest ครบ 68 ช่องพร้อม binding | ข้อ **A(ข)** + **B(ข)**: ตัวเลขทั้งหมด → `report-data`/`stock-meta` · skeleton/engine render ตอน build · prose ใช้ token (`{{px}}` `{{mos}}` …) · **manifest จากระยะ 1 = สเปกของ migrator** (ช่องไหน owner cron ต้องย้ายก่อน) · E date-gated สำหรับใบใหม่ (ห้ามพิมพ์ราคา/MOS/% ใน prose — f64 ปิดตรงนี้) · W21/W22 → E เมื่อ render จาก data (healer = build) · migrator 908 ใบ · freeze การวิเคราะห์ใหม่ 1–2 วัน · cron/gate เทียบ JSON ไม่ใช่ regex (parser-lint ขยายเป็น "regex ถอดค่าใน cron/gate = 0") · เกณฑ์จบ: สำเนาต่อค่า = 1 · regex ถอดค่าใน cron/gate = 0 · `--heal-derived` ไม่จำเป็น |
| `…-phase3-legacy-sweep.md` | ระยะ 2 จบ (ไม่งั้นเป็นลู่วิ่ง — spec WS7) | ข้อ **E(ข)**: เชิงกลกวาดครั้งเดียว (prose ราคาปัจจุบัน ≤786 · W15 97 · ค.ศ. 126 · footer อ่านไม่ออก 31 · **W22 ที่ระยะ 1 เพิ่งเห็น**) คัดด้วย git-history test ของ S10 · ดุลยพินิจ fix-on-touch ตามปฏิทินงบ (ขาเป้านักวิเคราะห์ 222 · สมอตาย 226 · หมวด 6 84 ใบ · ตระกูลเดียว 6 · EPS ค้าง ~23 · ใบอายุ >90 ผ่านคิวอายุของระยะ 1) · WS9(b) (8-K exhibit 99.1 · XBRL companyconcept · split events) · เกณฑ์จบ: prose ค้าง 0 · warning 0 · ใบ >90 วัน = 0 ตามนโยบาย |

---

## Self-review (ทำแล้วก่อน commit แผน)

- **Spec coverage ระยะ 1 (§6 แถว "1 · ปิดวงจรค้นพบ"):** WS1 manifest + coverage + parser เดียว → Task 6–9 ✓ · WS2 (2) ประตู cron → Task 1 ✓ · (3) E-policy เป็น check → Task 2 ✓ · (4) W→E → Task 3 + sweep Task 5/25 ✓ · (6) UNVERIFIED WRITE → Task 9 (W22 pair + log found:false — **ไม่ใช่ hard need() ตาม advisor**) ✓ · WS9(a) → Task 21–24 (6O · SA cap · Δ SA/Yahoo มีอยู่แล้วใน CROSS-VERIFY · fwd EPS FY · EPS ≤0 ในมัธยฐาน (เทส Task 23) · fixture prep/medians) ✓ · WS6 trigger ตามปฏิทิน + dead-band → Task 10, 13, 14, 17 ✓ · WS6 (1) cron เป็นเจ้าของช่องสรุป → Task 11–12 ✓ · WS8 (3) generate → Task 18–19 ✓ · (4) เจ้าของเดียว → Task 20 ✓ · (7) test:prep → Task 23 ✓ · WS4 #23 → Task 4 ✓ · #22 → Task 15 ✓ · เกณฑ์จบ 5 ข้อ → Task 25 ✓
- **ไม่ได้ทำในระยะ 1 (ตั้งใจ · อยู่ตารางแผนถัดไป):** f64 ราคาใน prose (ระยะ 2 token) · W21/W22 → E (ระยะ 2 เมื่อมี healer) · WS9(b) · WS7 · open-items #1 #5 #6 #11 #20
- **Placeholder scan:** ไม่มี TBD/TODO · ค่าที่ต้องวัดตอนรัน (census · จำนวนใบที่กวาด · ครอบคลุมปฏิทิน · % ลดของคิว) ระบุคำสั่งวัด + ที่บันทึก + เกณฑ์ตัดสิน · Task 22 มี fallback ชัดเมื่อ probe ไม่เจอโครง
- **ชื่อ/ลายเซ็นข้าม task:** `healer` field (T2) ← T3, T11, T18 · `RM.readStockMetaState/readReportData/readHeaderPrice/PX_PARTS_RE/RANGE52_RE/CUR_SRC` (T6) ← T8, T9, T11 · `DV.scenarioColumns/SCN_COL_OPEN` (T7) ← T8 (f37/f39 ผ่าน ctx.scenarios) · `DV.readSummaryCell` (T8) → `summaryPlan/fmtMos` (T11) ← W06, pass #11, f17/f18 · `MF.FIELDS/extractAll/coverage/checkPairs` (T8/T9) ← W21/W22, spotcheck, postcheck (T9, T24 f55) · `T.llmList/STALE_DAYS/escalated` (T13) ← T14, T17, replay (T25) · `plan(flags, today, opts)` (T14) ← T17 · `resolveQueueDir` (T15) · `parseArgs` (T16) ← T14 `--age` · `EC.load/build/roll` (T17) ← preflight · `gen-docs check()/STEP_LABELS` (T18) ← T19, T23 · `F.entityMismatchLine/capLine/fromForecast/forecastLine/yahooSession` (T17, T21, T22) · `oneSymbol(spec, th, deps)` (T23) — ตรงกันทุกจุดที่อ้าง
- **จำนวนขั้น verify:** 14 (เริ่ม) → 15 (T19 docs-test) → 16 (T23 prep-stock-test) — ทั้งสองครั้งแก้ package.json + gen-docs (pre-push) + queue-test ยืนยัน
