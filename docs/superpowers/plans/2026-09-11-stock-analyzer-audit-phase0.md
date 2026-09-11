# แผนลงมือ audit ระบบวิเคราะห์หุ้น — ระยะ 0 "หยุดเลือด"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> spec: `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md` (เจ้าของเคาะ 11 ก.ย. 2569: A(ข) · B(ข) · C(ค) · D(ข) · E(ข) · F(ข))
> แผนนี้ = **ระยะ 0 จาก 4 ระยะ** (spec §6) — ระยะ 1–3 เขียนเป็นแผนแยกหลังระยะ 0 ขึ้น main (ดู §"แผนถัดไป" ท้ายไฟล์) เพราะงานระยะถัดไปยืนบนผลของระยะนี้ (quarantine → เลื่อน W→E · manifest → migration) เขียนขั้นตอนตอนนี้จะเป็นการเดา

**Goal:** ตัดวงจร "เจอบั๊กใหม่ทุกรอบเคลียร์คิว" ภายใน ~1 สัปดาห์ โดยทำให้ 24 ขั้นที่ controller ต้องจำเหลือ ≤5 · cron ไม่ล้มเพราะราคาของวัน · cron ล้มแบบ "1 ไฟล์" ไม่ใช่ "ทั้งวัน" · ไฟล์ร่วมมี lock · กฎที่ขัดกัน 17 คู่ = 0

**Architecture:** 5 ส่วน (A–E) ต่อกันเป็นลำดับ — A ย้าย fixture ของเทสออกจากรายงานจริง (ทุกอย่างหลังจากนี้ต้องยืนบน fixture ที่นิ่ง) → B เสริมความทนของ gate/cron + lock ไฟล์ร่วม → C สร้าง runbook `npm run queue` ที่ร้อย script ที่มีอยู่แล้วเข้าด้วยกันและ "พิมพ์" ขั้นที่ยังต้องทำเอง → D ล้างกฎที่ขัดกัน/ล้าสมัยและแยกขอบเขต controller/worker ใน CLAUDE.md → E วัดเกณฑ์จบระยะ 0 · ทุก task ส่งมอบเป็นโค้ด+เทส หรือ **ลบ** กฎ ไม่ใช่เพิ่มย่อหน้า

**Tech Stack:** Node ≥20.19 · ไม่มี dependency ใหม่ (`fs`/`path`/`child_process`/`Intl` เท่านั้น) · เทสแบบ `ok(cond, label)` ตามสไตล์ `test/*.js` เดิม · git worktree · GitHub CLI `gh` (login แล้วในเครื่อง — ใช้เฉพาะปิด issue)

## Global Constraints

- **ห้ามเพิ่ม E-code ใหม่ใน `test/check-reports.js` ตลอดระยะ 0** (spec §8: E ใหม่ = บล็อก cron ทั้งรีโปจนกว่า quarantine เสร็จ) — `patch-rejected` ใน Task 7 เป็น *reason ใน price-flags.json* ไม่ใช่ gate code · `EXPAND` ใน Task 3 เป็นผลของ runner เมื่อ `expandReport` ระเบิด (เดิม = crash ทั้งรอบ) ไม่ใช่รายการใน `CHECKS`
- แก้ `reports/` เป็นชุด **ต้องใช้ท่า `heal → build → preserve-dates → build`** — ระยะ 0 ไม่แตะเนื้อหารายงานเลย (Task 21 แตะ AAPL/BBL ชั่วคราวแล้ว `git checkout --` คืน ห้าม `git stash`)
- การเปลี่ยนโครงสร้าง (build.js / gate / cron / template / CLAUDE.md / docs) = **สรุปแล้วรอเจ้าของก่อน push** (CLAUDE.md §5) ⇒ ทุก task commit บนสาขาของส่วนนั้น เปิด PR ท้ายส่วน (A→B→C→D→E ตามลำดับ ส่วนถัดไป base จาก main หลัง merge) **ห้าม push ตรงเข้า main**
- font/ดีไซน์ไม่แตะ (DESIGN.md) · ป้าย `ai-model` เก่าห้ามย้อนแก้เป็นกลุ่ม · ห้าม Haiku · **pin `model` ทุก Agent/analyze-wave call**
- เอกสาร = ภาษาไทย ปี พ.ศ. · เวลา = Asia/Bangkok
- commit message ท้ายด้วย `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (commit ที่ runbook ทำแทน worker ใน Task 14 ใช้ชื่อโมเดล worker ตาม CLAUDE.md §5)
- คำสั่งที่นับ/รวมข้อมูลใน Bash ของ Claude ต้องนำหน้าด้วย `rtk proxy` (hook ตัดบรรทัดเงียบ ๆ)
- worktree: รันทุกคำสั่งจาก root ของ worktree · ห้าม `cd` ลง `/Users/somchai.s/Downloads/stock`
- **ขยับจากระยะ 1 มาระยะ 0 (ระบุไว้เพื่อให้เจ้าของเห็น):** Task 8 รวมค่าคงที่ dead-band ให้เหลือแหล่งเดียว (ค่ายังเป็น 3 — ข้อ D ±5 + ทาง "flip ไม่ส่ง LLM" อยู่ระยะ 1) และ Task 19 `docs/open-items.md` (ปิด R3 "ข้อเสนอหาย" ตั้งแต่ระยะ 0 เพราะระยะนี้จะผลิตข้อค้นพบใหม่)

## โครงไฟล์ที่เกิด/แก้ในระยะ 0

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `test/fixtures/{AAPL,BBL}.html` · `test/fixtures/index.js` · `test/fixtures/README.md` | fixture แช่แข็ง + วันที่ "วันนี้" คงที่ | 1 |
| `test/fixture-lint.js` | ห้าม test/*.js อ่าน reports/ เป็น fixture (allowlist 3 ไฟล์) | 2 |
| `test/check-reports.js` (`checkFile`) | runner ทน `expandReport` ระเบิด | 3 |
| `tools/lockfile.js` | `withLock` + `writeJsonAtomic` แหล่งเดียว | 4 |
| `tools/update-prices.js` · `tools/dead-ticker-canary.js` | flags RMW ใต้ lock · quarantine `patch-rejected` · export dead-band | 5, 7, 8 |
| `tools/pick-brand.js` · `tools/tag-apply.js` | เขียนใต้ lock | 6 |
| `test/queue-test.js` | เทส runbook (offline) = verify ขั้น 4/14 | 9–14 |
| `tools/queue.js` + `tools/queue/{sh,state,footer-date,market,triage,preflight,prep,postcheck,ship}.js` | runbook `npm run queue` | 10–14 |
| `.gitignore` (`.queue/`) | state/prompt ของรอบ อยู่นอก git | 9 |
| `CLAUDE.md` · `.claude/skills/stock-analyzer/SKILL.md` · `docs/*.md` · `README.md` · `.github/workflows/update-prices.yml` · `.claude/workflows/analyze-wave.js` | ล้างกฎขัดกัน/ล้าสมัย · role-scope | 9, 15–18 |
| `docs/open-items.md` | รายการค้าง 21 ข้อ + สถานะ (ของโปรเจกต์ ไม่ใช่ของ memory) | 19 |
| `docs/superpowers/audit/2026-09-11-stock-analyzer/phase0-exit.md` | ผลวัดเกณฑ์จบระยะ 0 | 21 |

---

# ส่วน A — WS3 fixture สังเคราะห์ (PR #A)

สาขา: `claude/audit-p0-a-fixtures` (base = main)

### Task 1: แช่แข็ง fixture AAPL/BBL และเลิกอ่านรายงานจริงในเทส

**Files:**
- Create: `test/fixtures/AAPL.html`, `test/fixtures/BBL.html`, `test/fixtures/index.js`, `test/fixtures/README.md`
- Modify: `test/update-prices-test.js:6-9`, `:156-158`, `:359` · `test/self-test.js:34-42`, `:258-270`

**Interfaces:**
- Produces: `require('./fixtures')` → `{ AAPL(): string, BBL(): string, PATH: { AAPL, BBL }, TODAY: 'YYYY-MM-DD' }` — Task 2, 3, 7, 12 ใช้

- [ ] **Step 1: คัดลอกรายงานปัจจุบันเป็น fixture และหาวันที่ราคาในไฟล์**

```bash
mkdir -p test/fixtures && cp reports/AAPL.html test/fixtures/AAPL.html && cp reports/BBL.html test/fixtures/BBL.html
rtk proxy node -e "const {buildCtx}=require('./test/check-reports');const {expandReport}=require('./build');for(const s of ['AAPL','BBL'])console.log(s,buildCtx(expandReport(require('fs').readFileSync('test/fixtures/'+s+'.html','utf8')),s+'.html').priceAge.iso)"
```
Expected: 2 บรรทัด `AAPL 2026-09-1x` / `BBL 2026-09-1x` — จด **วันที่ที่ช้ากว่า** ไว้ (= D)

- [ ] **Step 2: เขียน `test/fixtures/index.js`** (แทน `2026-09-12` ด้วย D+1 วัน)

```js
'use strict';
/**
 * fixture ของ gate/cron test — สำเนาแช่แข็งของรายงานจริง ณ วันที่ใน README.md
 * ★ ห้ามให้เทสใน verify อ่าน reports/*.html เป็น fixture (test/fixture-lint.js บังคับ):
 *   cron แก้ไฟล์จริงทุกวัน ⇒ เทสที่ยืนบนไฟล์จริงล้มตามราคาของวัน (22–24 ส.ค. 69 · run #54 2 ก.ย. 69)
 * ★ TODAY = วันถัดจากวันที่ราคาในไฟล์ — ตั้งเป็น STALE_TODAY ให้ E27/W09 ไม่เดินตามปฏิทินจริง
 *   (ไม่งั้น fixture "แก่" เกิน 120 วันแล้ว E27 ยิงเอง — เทสตกโดยโค้ดไม่ผิด)
 * แช่แข็งใหม่ = cp reports/<SYM>.html มาทับ + อัปเดต TODAY + README แล้วรัน npm run verify
 */
const fs = require('fs');
const path = require('path');
const PATH = { AAPL: path.join(__dirname, 'AAPL.html'), BBL: path.join(__dirname, 'BBL.html') };
module.exports = {
  PATH,
  AAPL: () => fs.readFileSync(PATH.AAPL, 'utf8'),
  BBL: () => fs.readFileSync(PATH.BBL, 'utf8'),
  TODAY: '2026-09-12',
};
```

- [ ] **Step 3: เขียน `test/fixtures/README.md`**

```markdown
# test/fixtures — fixture แช่แข็งของ gate/cron test

| ไฟล์ | ที่มา | แช่แข็งเมื่อ | วันที่ราคาในไฟล์ |
|---|---|---|---|
| AAPL.html | reports/AAPL.html | 11 ก.ย. 2569 | <ผล Step 1> |
| BBL.html | reports/BBL.html | 11 ก.ย. 2569 | <ผล Step 1> |

- `index.js` ส่ง html + `TODAY` (วันถัดจากวันที่ราคา) — เทสตั้ง `process.env.STALE_TODAY = TODAY` ก่อนเรียก gate
- แช่แข็งใหม่เมื่อโครงรายงานเปลี่ยนจน anchor ใน self-test หาไม่เจอ (self-test จะฟ้อง "mutation ไม่เปลี่ยนอะไร") — คัดลอกไฟล์จริงมาทับ + แก้ TODAY + ตารางนี้
- ห้ามแก้ตัวเลขในไฟล์เหล่านี้ด้วยมือ — เทสทุกตัว derive ค่าจากไฟล์ ณ ตอนรัน
```

- [ ] **Step 4: ชี้ `test/update-prices-test.js` ไป fixture** — แก้ 3 จุด

บรรทัด 6 (header comment): `fixture = reports/AAPL.html จริง` → `fixture = test/fixtures/AAPL.html (แช่แข็ง — ดู test/fixtures/README.md)`

บรรทัด 9 หลัง `const U = require(...)`: เพิ่ม
```js
const FX = require('./fixtures');
process.env.STALE_TODAY = FX.TODAY;   // gate ที่ Task 7 เรียกผ่าน gateAfterPatch ต้องไม่เดินตามปฏิทินจริง
```
บรรทัด 156–158: แทน
```js
// ⚠ ไฟล์ fixture ถูก cron แก้ทุกวัน — ห้าม assert ค่าปัจจุบันของไฟล์แบบ hard-code (ราคา/วันที่/FV)
// ให้อ่านค่าตั้งต้นจาก stock-meta ของ input แล้วเทียบเชิงสัมพัทธ์แทน
const aapl = fs.readFileSync(path.join(__dirname, '..', 'reports', 'AAPL.html'), 'utf8');
```
ด้วย
```js
// fixture แช่แข็ง (test/fixtures) — ยังคงกติกาเดิม: ห้าม hard-code ราคา/วันที่/FV อ่านจาก stock-meta ของ input แล้วเทียบเชิงสัมพัทธ์
const aapl = FX.AAPL();
```
บรรทัด 359: `const bbl = fs.readFileSync(path.join(__dirname, '..', 'reports', 'BBL.html'), 'utf8');` → `const bbl = FX.BBL();`

- [ ] **Step 5: ชี้ `test/self-test.js` ไป fixture + ตรึงวันนี้**

บรรทัด 36–38: แทน
```js
// ใช้รายงานจริงที่ผ่าน gate เป็น "ของดี" ฐาน แล้ว mutate เพื่อทดสอบ
const BASE_FILE = path.join(__dirname, '..', 'reports', 'BBL.html');
const base = expandReport(fs.readFileSync(BASE_FILE, 'utf8'));
```
ด้วย
```js
// ฐาน = fixture แช่แข็ง (test/fixtures/BBL.html) — ไม่ใช่ไฟล์จริงที่ cron แก้ทุกวัน (บทเรียน 22–24 ส.ค. 69)
const FX = require('./fixtures');
const BASE_FILE = FX.PATH.BBL;
const base = expandReport(FX.BBL());
process.env.STALE_TODAY = FX.TODAY;   // E27/W09 วัดจากวันนี้ที่ตรึงไว้ — ทุกเคสที่เปลี่ยนค่านี้ต้องคืนเป็น FX.TODAY
```
บรรทัด 262 และ 269: `delete process.env.STALE_TODAY;` → `process.env.STALE_TODAY = FX.TODAY;` (ทั้ง 2 จุด)

- [ ] **Step 6: รันเทสสองตัวที่แก้ แล้ว verify เต็ม**

```bash
node test/update-prices-test.js && node test/self-test.js && npm run verify
```
Expected: ทั้งสามจบด้วย exit 0 · self-test พิมพ์ `✅ checker เชื่อถือได้` · verify ผ่าน 13 ขั้น

- [ ] **Step 7: พิสูจน์ว่าเทสไม่ขึ้นกับไฟล์จริงแล้ว** — เขียนราคามั่วลง AAPL/BBL จริงชั่วคราว

```bash
rtk proxy node -e "const U=require('./tools/update-prices.js');const fs=require('fs');for(const [s,p] of [['AAPL',150],['BBL',250]]){const h=fs.readFileSync('reports/'+s+'.html','utf8');fs.writeFileSync('reports/'+s+'.html',U.patchReport(h,{newPrice:p,dateParts:{day:11,monIdx:8,yearCE:2026},chartData:null}).html)}" && node test/update-prices-test.js && node test/self-test.js; git checkout -- reports/AAPL.html reports/BBL.html
```
Expected: เทสทั้งคู่ exit 0 ทั้งที่ไฟล์จริงถูกเปลี่ยน · `git status --short` ว่างหลัง checkout

- [ ] **Step 8: Commit**

```bash
git add test/fixtures test/update-prices-test.js test/self-test.js
git commit -m "test: ย้าย fixture ของ update-prices-test/self-test ไป test/fixtures (แช่แข็ง — ไม่ขึ้นกับราคาของวัน)

WS3 ระยะ 0: cron ล้ม 22–24 ส.ค. + run #54 เพราะเทสใน verify อ่าน reports/AAPL,BBL จริงที่ cron เพิ่ง patch
STALE_TODAY ตรึงที่วันถัดจากวันที่ราคาใน fixture ให้ E27/W09 ไม่เดินตามปฏิทิน

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: lint กัน test/*.js กลับไปอ่าน reports/ เป็น fixture

**Files:**
- Create: `test/fixture-lint.js`
- Modify: `test/self-test.js` (ก่อนบรรทัดสรุปท้ายไฟล์ `console.log('\n' + '─'.repeat(50));`)

**Interfaces:**
- Produces: `module.exports = function fixtureLint(ok)` — เรียกจาก self-test เท่านั้น

- [ ] **Step 1: เขียนเทสที่ต้องตก (lint ยังไม่มี)** — ต่อท้าย `test/self-test.js` ก่อนบรรทัดสรุป

```js
// ── fixture-lint: เทสใน verify ห้ามอ่าน reports/*.html เป็น fixture (บทเรียน 22–24 ส.ค. · 2 ก.ย. 69) ──
require('./fixture-lint.js')(ok);
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/self-test.js
```
Expected: ระเบิด `Cannot find module './fixture-lint.js'`

- [ ] **Step 3: เขียน `test/fixture-lint.js`**

```js
'use strict';
/**
 * fixture-lint — เทสที่อยู่ใน `npm run verify` ห้ามอ่านไฟล์ใน reports/ เป็น fixture
 * เหตุผล: reports/*.html ถูก cron แก้ทุกวัน ⇒ เทสที่ยืนบนมันล้มตามราคาของวันโดยโค้ดไม่ผิด
 * (cron ล้ม 3 วัน 22–24 ส.ค. 69 เพราะ self-test ใช้ BBL · run #54 2 ก.ย. 69 เพราะ update-prices-test ใช้ AAPL)
 * allowlist = ไฟล์ที่ "ตั้งใจกวาดทั้งคลัง" (นั่นคือหน้าที่ของมัน ไม่ใช่ fixture)
 */
const fs = require('fs');
const path = require('path');

const ALLOW = new Set(['check-reports.js', 'check-site.js', 'engine-exec.js']);
// (a) readFileSync(... 'reports' ...) ในบรรทัดเดียว · (b) path.join(..., 'reports', '<SYM>.html') แม้ readFileSync อยู่คนละบรรทัด
const PATTERNS = [
  /readFileSync\([^)]*['"`]reports['"`]/,
  /['"`]reports['"`]\s*,\s*['"`][A-Za-z0-9.\-]+\.html['"`]/,
];

function scan(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    if (ALLOW.has(f)) continue;
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    const hits = [];
    lines.forEach((l, i) => { if (PATTERNS.some((re) => re.test(l))) hits.push(i + 1); });
    out.push({ file: f, hits });
  }
  return out;
}

module.exports = function fixtureLint(ok) {
  for (const { file, hits } of scan(__dirname))
    ok(hits.length === 0, `fixture-lint: ${file} ไม่อ่าน reports/ เป็น fixture` + (hits.length ? ` (บรรทัด ${hits.join(',')} — ย้ายไป test/fixtures/)` : ''));
};
module.exports.scan = scan;
module.exports.PATTERNS = PATTERNS;
```

- [ ] **Step 4: รันให้ผ่าน + ยืนยันว่า lint จับได้จริง**

```bash
node test/self-test.js | tail -3
rtk proxy node -e "const L=require('./test/fixture-lint.js');console.log(L.PATTERNS[1].test(\"path.join(__dirname, '..', 'reports', 'BBL.html')\"), L.PATTERNS[0].test(\"fs.readFileSync(path.join(__dirname, '..', 'reports', 'AAPL.html'), 'utf8')\"), L.PATTERNS.some(r=>r.test(\"fs.readdirSync(path.join(ROOT, 'reports'))\")))"
```
Expected: self-test `✅` · บรรทัดที่สอง `true true false` (จับสองรูปแบบเดิม · ไม่จับ corpus scan ของ tags-test)

- [ ] **Step 5: Commit + เปิด PR #A**

```bash
git add test/fixture-lint.js test/self-test.js
git commit -m "test: fixture-lint — verify ห้ามมีเทสที่อ่าน reports/ เป็น fixture (allowlist 3 ไฟล์ที่กวาดคลังโดยหน้าที่)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
npm run verify && git push -u origin claude/audit-p0-a-fixtures
gh pr create --title "audit ระยะ 0 ส่วน A: fixture แช่แข็งของ gate/cron test (WS3)" --body "$(cat <<'EOF'
## สรุป
- ย้าย fixture ของ `update-prices-test` / `self-test` จาก `reports/AAPL,BBL` (cron แก้ทุกวัน) ไป `test/fixtures/` แช่แข็ง + ตรึง `STALE_TODAY`
- เพิ่ม `test/fixture-lint.js` (รันใน self-test) กันเทสกลับไปอ่าน `reports/`
- ปิดคลาสเหตุการณ์ cron ล้ม 22–24 ส.ค. 69 และ run #54 (spec §3 T3 · §4 WS3)

## ทดสอบ
- `npm run verify` 13/13 · เขียนราคามั่วลง AAPL/BBL จริงแล้วเทสยังผ่าน (Task 1 Step 7)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR เปิด · **รอเจ้าของ merge ก่อนเริ่มส่วน B**

---
# ส่วน B — WS2(5)(1) gate/cron ทน 1 ไฟล์ + WS4 lock ไฟล์ร่วม (PR #B)

สาขา: `claude/audit-p0-b-gate-lock` (base = main หลัง merge #A)

### Task 3: runner ของ check-reports ทน `expandReport` ระเบิด (WS2 ข้อ 5)

**Files:**
- Modify: `test/check-reports.js:806` (exports), `:809-830` (`main`)
- Test: `test/self-test.js` (ต่อท้ายก่อนบรรทัด `require('./fixture-lint.js')(ok);`)

**Interfaces:**
- Produces: `checkFile(absPath) → { name, symbol, ctx, errors, warnings, errTotal, errPass }` (รูปเดียวกับ `checkHtml`) · ไฟล์ที่ขยายไม่ได้ → `errors = [{ id: 'EXPAND', label: 'expandReport', msg }]` — Task 7 (quarantine) และ Task 13 (postcheck) ใช้ · **`EXPAND` ไม่ใช่ E-code ใหม่** (ไม่อยู่ใน `CHECKS` · แทนที่ crash เดิม)

- [ ] **Step 1: เขียนเทสที่ต้องตก** — ใน `test/self-test.js` ก่อนบรรทัด `require('./fixture-lint.js')(ok);`

```js
// ── runner: ไฟล์ที่ expandReport ระเบิดต้องนับเป็น error ของไฟล์นั้น ไม่ล้มทั้งรอบ (code-audit §6.A ข้อ 2) ──
{
  const { checkFile } = require('./check-reports');
  const os = require('os');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cr-')), 'BROKEN.html');
  fs.writeFileSync(tmp, '<!DOCTYPE html><html lang="th"><head><!--TEMPLATE:STYLE--></head><body></body></html>');
  let r = null, threw = false;
  try { r = checkFile(tmp); } catch (_) { threw = true; }
  ok(!threw && r && r.errors.length === 1 && r.errors[0].id === 'EXPAND', 'checkFile: expandReport throw → error EXPAND ของไฟล์นั้น ไม่ throw ออกมา' + (r ? ` (ได้ ${r.errors.map((e) => e.id).join(',')})` : ' (throw)'));
  ok(checkFile(FX.PATH.BBL).errors.length === 0, 'checkFile: fixture ดีผ่าน (เส้นทางปกติ = checkHtml)');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/self-test.js >/dev/null 2>&1; echo exit=$?
```
Expected: `exit=1` (`checkFile is not a function`)

- [ ] **Step 3: เพิ่ม `checkFile` และให้ `main` ใช้มัน** — ใน `test/check-reports.js` แทนบรรทัด 806

```js
/** ตรวจ 1 ไฟล์จาก path — expandReport ระเบิด = error ของไฟล์นั้น (id EXPAND) ไม่ใช่ crash ของทั้งรอบ
 *  (เดิม expandReport อยู่นอก try ของ main ⇒ ไฟล์เดียวที่ report-data เสียทำ cron ทั้งวันล้ม — code-audit §6.A) */
function checkFile(fp) {
  const name = path.basename(fp);
  let expanded;
  try { expanded = expandReport(fs.readFileSync(fp, 'utf8')); }
  catch (e) {
    const errTotal = CHECKS.filter((c) => c.level === 'error').length;
    return { name, symbol: name.replace(/\.html$/i, ''), ctx: null, errors: [{ id: 'EXPAND', label: 'expandReport', msg: e.message }], warnings: [], errTotal, errPass: errTotal - 1 };
  }
  return checkHtml(expanded, name);
}

module.exports = { checkHtml, checkFile, buildCtx, parseScenarios, firstNum, CHECKS, REPORTS_DIR, FISCAL_REF_SRC };
```
และใน `main()` แทนบรรทัด
```js
    const r = checkHtml(expandReport(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8')), f);
```
ด้วย
```js
    const r = checkFile(path.join(REPORTS_DIR, f));
```

- [ ] **Step 4: รันให้ผ่าน**

```bash
node test/self-test.js | tail -2 && node test/check-reports.js | tail -2
```
Expected: self-test `✅` · check-reports `✅ ผ่าน quality gate`

- [ ] **Step 5: Commit**

```bash
git add test/check-reports.js test/self-test.js
git commit -m "gate: check-reports.checkFile — ไฟล์ที่ expandReport ระเบิดนับเป็น error ของไฟล์นั้น ไม่ล้มทั้งรอบ (WS2 ข้อ 5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: `tools/lockfile.js` — lock แบบ mkdir + writeJsonAtomic แหล่งเดียว (WS4)

**Files:**
- Create: `tools/lockfile.js`
- Test: `test/update-prices-test.js` (ต่อท้ายก่อนบรรทัดสรุปผลท้ายไฟล์)

**Interfaces:**
- Produces: `withLock(file, fn, { waitMs }) → fn()` (sync · lock = โฟลเดอร์ `<file>.lock` · รอสูงสุด 60 วิ แล้ว **throw** · lock ค้าง >10 นาที = ยึดได้ · ปล่อยเสมอทั้ง `finally` และ `process.on('exit')`) · `writeJsonAtomic(file, text)` — Task 5, 6 ใช้

- [ ] **Step 1: เขียนเทสที่ต้องตก** — ต่อท้าย `test/update-prices-test.js` ก่อนบรรทัดสรุป (`console.log` ที่พิมพ์ `nOK`)

```js
// ---------- lockfile (WS4: seeds.json / price-flags.json / tags.json มีหลาย writer ไม่มี lock) ----------
{
  const L = require('../tools/lockfile.js');
  const os = require('os');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lock-')), 'state.json');
  let inside = 0;
  const r = L.withLock(f, () => { inside++; ok(fs.existsSync(f + '.lock'), 'withLock: ถือ lock ระหว่าง fn'); return 42; });
  ok(r === 42 && inside === 1 && !fs.existsSync(f + '.lock'), 'withLock: คืนค่าของ fn + ปล่อย lock หลังจบ');
  fs.mkdirSync(f + '.lock');                                   // จำลองอีก process ถืออยู่
  let threw = null; try { L.withLock(f, () => {}, { waitMs: 300 }); } catch (e) { threw = e; }
  ok(threw && /รอ lock/.test(threw.message), 'withLock: lock ถูกถือ → รอครบแล้ว throw (ห้ามข้ามเงียบ = คิวเพี้ยน)');
  const old = Date.now() / 1000 - 3600; fs.utimesSync(f + '.lock', old, old);   // lock ค้าง 1 ชม. = process ตาย
  ok(L.withLock(f, () => 'ok', { waitMs: 300 }) === 'ok' && !fs.existsSync(f + '.lock'), 'withLock: lock ค้างเกิน 10 นาที → ยึดได้แล้วปล่อย');
  let thrown = false; try { L.withLock(f, () => { throw new Error('x'); }); } catch (_) { thrown = true; }
  ok(thrown && !fs.existsSync(f + '.lock'), 'withLock: fn throw → ปล่อย lock เสมอ');
  L.writeJsonAtomic(f, '{"a":1}\n');
  ok(fs.readFileSync(f, 'utf8') === '{"a":1}\n' && !fs.readdirSync(path.dirname(f)).some((x) => x.includes('.tmp-')), 'writeJsonAtomic: เขียนผ่าน temp+rename ไม่ทิ้ง .tmp');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/update-prices-test.js 2>&1 | tail -3
```
Expected: `Cannot find module '../tools/lockfile.js'`

- [ ] **Step 3: เขียน `tools/lockfile.js`**

```js
'use strict';
/**
 * lockfile.js — lock ข้าม process สำหรับไฟล์ state ที่มีหลาย writer (WS4 ระยะ 0)
 *   price-flags.json  ← cron รายวัน · canary รายสัปดาห์ · controller pre-patch · worker --force
 *   tools/seeds.json  ← pick-brand.js (เดิม read→write เปล่า ๆ: 2 worker ขนาน = สีชนโดย gate มองไม่เห็น)
 *   tags.json         ← tag-apply.js
 * กลไก: mkdir `<file>.lock` (atomic บน POSIX/macOS/Linux) · EEXIST = มีคนถือ · รอแล้ว **throw** ไม่ข้ามเงียบ
 *   (ข้ามเงียบ = เขียน state ครึ่งเดียว = คิวเพี้ยน — แย่กว่าล้มดัง ๆ) · lock ที่ mtime เก่ากว่า STALE_MS = process ตายทิ้งไว้ ยึดได้
 * ★ ห้ามถือ lock คร่อมงานยาว (loop fetch 8 นาทีของ cron) — ถือเฉพาะช่วง read→merge→write (มิลลิวินาที)
 */
const fs = require('fs');
const path = require('path');

const STALE_MS = 10 * 60 * 1000;   // cron รอบเต็ม ~8 นาที ยังไม่ถึง — เกินนี้ถือว่าค้าง
const WAIT_MS = 60 * 1000;
const POLL_MS = 200;
const held = new Set();

process.on('exit', () => { for (const d of held) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } });

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function readPid(dir) { try { return fs.readFileSync(path.join(dir, 'pid'), 'utf8').trim(); } catch (_) { return '?'; } }

function tryAcquire(dir) {
  try { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'pid'), String(process.pid)); return true; }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  try {
    if (Date.now() - fs.statSync(dir).mtimeMs > STALE_MS) { fs.rmSync(dir, { recursive: true, force: true }); return tryAcquire(dir); }
  } catch (_) { /* หายไประหว่างเช็ค = อีกฝั่งปล่อยแล้ว รอบถัดไปได้เอง */ }
  return false;
}

/** รัน fn ใต้ lock ของ file (sync) · คืนค่าของ fn · รอเกิน waitMs → throw */
function withLock(file, fn, opts) {
  const waitMs = (opts && opts.waitMs) || WAIT_MS;
  const dir = `${file}.lock`;
  const t0 = Date.now();
  while (!tryAcquire(dir)) {
    if (Date.now() - t0 > waitMs) throw new Error(`รอ lock ${path.basename(dir)} เกิน ${Math.round(waitMs / 1000)} วิ — process อื่นถืออยู่ (pid ${readPid(dir)}) ยกเลิก ไม่เขียนทับ`);
    sleepSync(POLL_MS);
  }
  held.add(dir);
  try { return fn(); }
  finally { held.delete(dir); fs.rmSync(dir, { recursive: true, force: true }); }
}

/** เขียน state file แบบ atomic: temp ในโฟลเดอร์เดียวกัน (rename ข้าม filesystem ไม่ atomic) แล้ว rename ทับ
 *  ใส่ pid กันสองรอบเขียน temp ใบเดียวกัน · เขียนตรง ๆ แล้วถูกตัดกลางคัน = JSON ครึ่งใบ = loadFlags ล้มทั้งรอบถัดไป */
function writeJsonAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

module.exports = { withLock, writeJsonAtomic, STALE_MS, WAIT_MS };
```

- [ ] **Step 4: รันให้ผ่าน**

```bash
node test/update-prices-test.js 2>&1 | tail -2
```
Expected: ไม่มีบรรทัด `✗ withLock` / `✗ writeJsonAtomic`

- [ ] **Step 5: Commit**

```bash
git add tools/lockfile.js test/update-prices-test.js
git commit -m "tools: lockfile.js — withLock (mkdir lock · รอแล้ว throw · ยึด lock ค้าง) + writeJsonAtomic แหล่งเดียว (WS4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: price-flags.json อ่าน→รวม→เขียน ใต้ lock (cron + canary)

**Files:**
- Modify: `tools/update-prices.js:52-55` (import), `:602-618` (`loadFlags` รับ path · ลบ `writeJsonAtomic` local), หลัง `mergeFlags` (เพิ่ม `commitFlags`), `:874-885` (ท้าย `main`), `:904` (exports) · `tools/dead-ticker-canary.js:55-65` (ลบ local), `:242-250`
- Test: `test/update-prices-test.js`

**Interfaces:**
- Consumes: `withLock`, `writeJsonAtomic` จาก `tools/lockfile.js`
- Produces: `commitFlags({ file?, write, prevAll, evaluated, frozenAll, failed, quietSyms, aliveConfirmed, reportExists }) → flags[]` (export จาก update-prices) — อ่าน flags **ล่าสุด** ใต้ lock แล้วค่อย merge ⇒ flag ที่ canary/controller เขียนระหว่าง loop fetch 8 นาทีไม่หาย

- [ ] **Step 1: เขียนเทสที่ต้องตก** — ต่อท้าย `test/update-prices-test.js` (หลังบล็อก lockfile)

```js
// ---------- commitFlags: merge บนไฟล์ "ล่าสุด" ใต้ lock ไม่ใช่ snapshot ตอนเริ่มรอบ (WS4 · เคส flag ฟื้น/หาย 12 ส.ค. 69) ----------
{
  const os = require('os');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flags-')), 'price-flags.json');
  const snapshot = [{ symbol: 'AAA', reason: 'mos-sign-flip', flaggedAt: '2026-09-01' }];
  // ระหว่าง loop: canary เขียน not-on-exchange ของ ZZZ ลงไฟล์ (snapshot ตอนเริ่มรอบไม่มี)
  fs.writeFileSync(file, JSON.stringify(snapshot.concat([{ symbol: 'ZZZ', reason: 'not-on-exchange', flaggedAt: '2026-09-10' }])));
  const args = { file, prevAll: snapshot, evaluated: new Set(['AAA']), frozenAll: [], failed: [], quietSyms: new Set(), aliveConfirmed: new Set(), reportExists: new Set(['AAA', 'ZZZ']) };
  const flags = U.commitFlags({ ...args, write: true });
  ok(!flags.some((f) => f.symbol === 'AAA'), 'commitFlags: AAA ประเมินรอบนี้ไม่ freeze → หลุดคิว');
  ok(flags.some((f) => f.symbol === 'ZZZ' && f.reason === 'not-on-exchange'), 'commitFlags: flag ที่ canary เขียนระหว่าง loop ยังอยู่ (merge บนไฟล์ล่าสุด)');
  ok(JSON.parse(fs.readFileSync(file, 'utf8')).length === 1 && !fs.existsSync(file + '.lock'), 'commitFlags: เขียนไฟล์ + ปล่อย lock');
  const before = fs.readFileSync(file, 'utf8');
  ok(Array.isArray(U.commitFlags({ ...args, write: false })) && fs.readFileSync(file, 'utf8') === before, 'commitFlags: dry-run ไม่เขียนไฟล์');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/update-prices-test.js 2>&1 | tail -3
```
Expected: `U.commitFlags is not a function`

- [ ] **Step 3: แก้ `tools/update-prices.js`**

(ก) บรรทัด 52–55 เพิ่ม `const { withLock, writeJsonAtomic } = require('./lockfile.js');   // WS4: price-flags.json มีหลาย writer` และลบฟังก์ชัน `writeJsonAtomic` local (บรรทัด 610–618 พร้อมคอมเมนต์เหนือมัน)

(ข) `loadFlags` รับ path:
```js
function loadFlags(file = FLAGS) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Error(`อ่าน ${file} ไม่ได้ (${e.message}) — ไฟล์เสีย/เขียนค้าง ยกเลิกรอบนี้ ไม่เขียนทับคิวด้วยของว่าง`);
  }
}
```

(ค) เพิ่มหลัง `mergeFlags`:
```js
// ★ RMW ของคิวใต้ lock — อ่าน "ไฟล์ล่าสุด" ก่อน merge ไม่ใช่ snapshot ตอนเริ่มรอบ (prevAll ใช้แค่ตัดสิน deadAlready
//   ระหว่าง loop) ⇒ flag ที่ canary/controller/worker --force เขียนระหว่าง loop fetch ~8 นาทีไม่ถูกทับหาย
//   (เคสจริง 12 ส.ค. 69: worker ขนานรัน --force แล้ว flag ที่เคลียร์แล้วฟื้น — เดิมแก้ด้วยกฎ "controller pre-patch
//   ทั้งชุด process เดียว + ห้าม worker รัน" ซึ่งอยู่ใน memory เท่านั้น · ตอนนี้โค้ดกันเอง)
function commitFlags(p) {
  const file = p.file || FLAGS;
  return withLock(file, () => {
    const latest = p.write ? loadFlags(file) : p.prevAll;
    const prevFlags = latest.filter((f) => !((p.quietSyms.has(f.symbol) || p.aliveConfirmed.has(f.symbol)) && f.reason === 'not-on-exchange'));
    const merged = mergeFlags(prevFlags, p.evaluated, p.frozenAll.concat(p.failed.map((x) => ({ ...x, reportPrice: null, marketPrice: null, diffPct: null }))))
      .filter((f) => p.reportExists.has(String(f.symbol).toUpperCase()));
    if (p.write) writeJsonAtomic(file, JSON.stringify(merged, null, 2) + '\n');
    return merged;
  });
}
```

(ง) ใน `main()` ลบบรรทัด `const prevFlags = prevAll.filter(...)` และแทน
```js
  const flags = mergeFlags(prevFlags, evaluated, frozenAll.concat(failed.map((x) => ({ ...x, reportPrice: null, marketPrice: null, diffPct: null }))))
    .filter((f) => reportExists.has(String(f.symbol).toUpperCase()));
  if (WRITE) writeJsonAtomic(FLAGS, JSON.stringify(flags, null, 2) + '\n');
```
ด้วย
```js
  const flags = commitFlags({ write: WRITE, prevAll, evaluated, frozenAll, failed, quietSyms, aliveConfirmed, reportExists });
```
(คง `deadSyms` · `frozenAll` · `reportExists` · `evaluated` ไว้ตามเดิม)

(จ) เพิ่ม `commitFlags` ใน `module.exports`

- [ ] **Step 4: แก้ `tools/dead-ticker-canary.js`** — ลบ `writeJsonAtomic` local (บรรทัด 55–65 พร้อมคอมเมนต์) แล้วเพิ่ม `const { withLock, writeJsonAtomic } = require('./lockfile.js');` ใกล้ import อื่น · แทนบรรทัด 242–250 ด้วย

```js
  const reportExists = new Set(files.map((f) => f.replace(/\.html$/i, '').toUpperCase()));
  const flags = withLock(FLAGS, () => {   // WS4: อ่านล่าสุดใต้ lock — cron รายวัน/รันมืออาจเขียนคั่นระหว่าง scan
    const merged = mergeDeadFlags(loadJson(FLAGS, []), newFlags, [...alive.keys()], today)
      .filter((f) => reportExists.has(String(f.symbol).toUpperCase()));
    if (WRITE) writeJsonAtomic(FLAGS, JSON.stringify(merged, null, 2) + '\n');
    return merged;
  });
  if (WRITE) {
    cache._readme = 'ticker ที่ TradingView ใช้จริงต่อ symbol — dead-ticker-canary.js เขียนเอง (cache กันยิงหลายกระดานซ้ำ) ห้ามแก้มือ';
    writeJsonAtomic(CACHE, JSON.stringify(cache, null, 2) + '\n');
  }
```

- [ ] **Step 5: รันให้ผ่าน + dry-run ของจริง**

```bash
node test/update-prices-test.js 2>&1 | tail -2 && node test/dead-ticker-test.js 2>&1 | tail -1 && rtk proxy node tools/update-prices.js AAPL | tail -2 && git status --short && ls | grep -c "\.lock"
```
Expected: เทสผ่าน · dry-run พิมพ์ `[dry-run] อัปเดต …` (หรือ `ข้ามเพราะตลาดเปิด`) · `git status` ว่าง · ไม่มี `.lock` ค้าง (บรรทัดสุดท้าย `0`)

- [ ] **Step 6: Commit**

```bash
git add tools/update-prices.js tools/dead-ticker-canary.js test/update-prices-test.js
git commit -m "cron: price-flags.json อ่านล่าสุด→merge→เขียน ใต้ lock (commitFlags) ทั้ง cron และ canary — ปิด race ที่เคยแก้ด้วยกฎใน memory (WS4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: `pick-brand.js` และ `tag-apply.js` เขียนใต้ lock

**Files:**
- Modify: `tools/pick-brand.js:14-16`, `:29-30`, `:109-111`, ท้ายไฟล์ · `tools/tag-apply.js:154`
- Test: `test/update-prices-test.js` (pick-brand ขนาน 2 process)

- [ ] **Step 1: เขียนเทสที่ต้องตก — pick-brand 2 process พร้อมกันต้องไม่ทับกัน** ต่อท้าย `test/update-prices-test.js`

```js
// ---------- pick-brand ขนาน: seeds.json ต้องได้ทั้ง 2 entry และสีต้องไม่ชนกัน (WS4 · CLAUDE.md §10 เคสสีซ้ำโดย gate มองไม่เห็น) ----------
{
  const cp = require('child_process');
  const seedsFile = path.join(__dirname, '..', 'tools', 'seeds.json');
  const backup = fs.readFileSync(seedsFile, 'utf8');
  try {
    const script = path.join(__dirname, '..', 'tools', 'pick-brand.js');
    const a = cp.spawn(process.execPath, [script, 'ZZTESTA', '#1a73e8', '--auto'], { stdio: 'ignore' });
    const b = cp.spawn(process.execPath, [script, 'ZZTESTB', '#1a73e8', '--auto'], { stdio: 'ignore' });
    // เทสไฟล์นี้เป็น sync ทั้งไฟล์ — รอสองตัวจบด้วย Atomics.wait
    const done = new Int32Array(new SharedArrayBuffer(4));
    let left = 2;
    for (const c of [a, b]) c.on('exit', () => { if (--left === 0) { Atomics.store(done, 0, 1); Atomics.notify(done, 0); } });
    const t0 = Date.now();
    while (Atomics.load(done, 0) === 0 && Date.now() - t0 < 20000) Atomics.wait(done, 0, 0, 100);
    const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
    ok(seeds.ZZTESTA && seeds.ZZTESTB, 'pick-brand ขนาน: ได้ทั้ง 2 entry (ไม่มี entry ทับหาย)');
    ok(seeds.ZZTESTA && seeds.ZZTESTB && seeds.ZZTESTA !== seeds.ZZTESTB, 'pick-brand ขนาน: --auto สลับเฉดให้ตัวที่มาทีหลัง (เห็นสีของอีกตัวเพราะอ่านใต้ lock)');
  } finally { fs.writeFileSync(seedsFile, backup); }
  ok(fs.readFileSync(seedsFile, 'utf8') === backup, 'pick-brand ขนาน: คืน seeds.json เดิม');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
for i in 1 2 3; do node test/update-prices-test.js 2>&1 | grep "pick-brand ขนาน"; done
```
Expected: มีอย่างน้อย 1 บรรทัด `✗` ใน 3 รอบ (race เดิม — entry หาย หรือสีเท่ากัน)

- [ ] **Step 3: แก้ `tools/pick-brand.js`** — ครอบส่วนที่อ่าน→ตัดสิน→เขียน ด้วย lock

บรรทัด 14–16 เพิ่ม `const { withLock, writeJsonAtomic } = require('./lockfile.js');`
บรรทัด 29–30 แทน
```js
const seedsFile = path.join(__dirname, 'seeds.json');
const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
```
ด้วย
```js
const seedsFile = path.join(__dirname, 'seeds.json');
// ★ WS4: อ่าน→ตรวจชน→เขียน ต้องอยู่ใต้ lock เดียวกัน ไม่งั้น 2 worker ขนานมองไม่เห็นสีของกันและกัน
//   (เดิมเป็นกฎ "controller pre-assign สีเอง" ใน CLAUDE.md §3.3/§10 — ตอนนี้โค้ดกันเอง กฎนั้นถูกถอดใน Task 17)
withLock(seedsFile, () => {
const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
```
บรรทัด 111 `fs.writeFileSync(seedsFile, JSON.stringify(sorted, null, 2) + '\n');` → `writeJsonAtomic(seedsFile, JSON.stringify(sorted, null, 2) + '\n');`
ท้ายไฟล์ (หลัง `console.log(dot(...))` บรรทัดสุดท้าย) เพิ่ม
```js
});   // withLock — process.exit(1) ข้างในปล่อย lock ผ่าน process.on('exit') ของ lockfile.js
```
(ไม่ต้อง indent เนื้อในบล็อกใหม่ — คง diff ให้อ่านง่าย)

- [ ] **Step 4: แก้ `tools/tag-apply.js`** บรรทัดสุดท้าย

```js
if (require.main === module) require('./lockfile.js').withLock(T.TAGS_FILE, main);   // WS4: 2 controller ship พร้อมกันได้
```

- [ ] **Step 5: รันให้ผ่าน**

```bash
node test/update-prices-test.js 2>&1 | tail -2 && node test/tag-apply-test.js 2>&1 | tail -1 && node tools/pick-brand.js ZZTESTC "#1a73e8" --auto >/dev/null; git checkout -- tools/seeds.json; ls tools | grep -c "\.lock"
```
Expected: เทสผ่าน · pick-brand รันเดี่ยวได้ · ไม่มี `seeds.json.lock` ค้าง (`0`)

- [ ] **Step 6: Commit**

```bash
git add tools/pick-brand.js tools/tag-apply.js test/update-prices-test.js
git commit -m "tools: pick-brand/tag-apply เขียนใต้ lock — worker ขนานรันเองได้ ไม่ต้องให้ controller pre-assign สี (WS4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: quarantine รายไฟล์ใน cron — flag `patch-rejected` แทนล้มทั้งวัน (WS2 ข้อ 1)

**Files:**
- Modify: `tools/update-prices.js` (`gateAfterPatch` ใหม่หลัง `patchReport` · loop ใน `main` หลัง `patchReport` · `healDerived` ก่อน `writeFileSync` · exports) · `docs/price-refresh.md:121-135` (ตาราง reason) · `.claude/skills/stock-analyzer/SKILL.md` STEP 0 · `CLAUDE.md` §9 บรรทัด "freeze ลง price-flags.json เมื่อ:"
- Test: `test/update-prices-test.js`

**Interfaces:**
- Consumes: `checkHtml` (check-reports) · `expandReport` (build.js) — **lazy require ในฟังก์ชัน** (check-reports require ไฟล์นี้ตอนโหลดเพื่อ `mosBand`; require กลับที่หัวไฟล์ = cycle ที่ `module.exports` ยังว่าง ⇒ `mosBand` undefined)
- Produces: `gateAfterPatch(html, name) → { ok, codes: string[], detail: string }` (export)

- [ ] **Step 1: เขียนเทสที่ต้องตก** — ต่อท้าย `test/update-prices-test.js`

```js
// ---------- quarantine: patch แล้ว gate ตก = ไม่เขียนไฟล์ + flag patch-rejected (WS2 ข้อ 1 · code-audit §6.A) ----------
{
  const good = U.gateAfterPatch(aapl, 'AAPL.html');
  ok(good.ok && good.codes.length === 0, 'gateAfterPatch: fixture ดี → ok', good.detail);
  // ทำ .fv-box ไม่ตรง report-data.fv → E15 (ไม่ขึ้นกับราคา) — patchReport ยังทำงานได้ (ไม่แตะ fv-box)
  const bad = aapl.replace(/(class="fv-box"[\s\S]*?class="r">\s*\$?)([0-9][0-9.,]*)/, (m, a, v) => a + (parseFloat(v.replace(/,/g, '')) * 2).toFixed(0));
  ok(bad !== aapl, '(ตั้งฉาก) แก้ .fv-box ได้จริง');
  const patched = U.patchReport(bad, { newPrice: 301.5, dateParts: { day: 11, monIdx: 6, yearCE: 2026 }, chartData: null });
  const g = U.gateAfterPatch(patched.html, 'AAPL.html');
  ok(!g.ok && g.codes.includes('E15'), 'gateAfterPatch: ไฟล์ที่ patch แล้ว gate ตก → ok=false + รหัส', g.codes.join(','));
  ok(/E15/.test(g.detail) && g.detail.length <= 400, 'gateAfterPatch: detail มีรหัส + สั้นพอลง price-flags.json');
  const broken = U.gateAfterPatch('<!DOCTYPE html><html><head><!--TEMPLATE:STYLE--></head><body></body></html>', 'X.html');
  ok(!broken.ok && broken.codes[0] === 'EXPAND', 'gateAfterPatch: expandReport ระเบิด → EXPAND ไม่ throw');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/update-prices-test.js 2>&1 | tail -3
```
Expected: `U.gateAfterPatch is not a function`

- [ ] **Step 3: เพิ่ม `gateAfterPatch` ใน `tools/update-prices.js`** (วางหลัง `patchReport` ก่อนส่วน flags)

```js
// ---------- quarantine รายไฟล์ (WS2 ข้อ 1) ----------
// เดิม: patch 908 ไฟล์ → npm run verify ทั้งรีโป → ไฟล์เดียวตก = ทิ้ง patch ดีทั้งวัน (cron ล้ม 22–24 ส.ค. · 2 ก.ย. 69)
// ใหม่: ตรวจ gate ต่อไฟล์ทันทีหลัง patch — ตก = ไม่เขียนไฟล์นั้น + flag `patch-rejected` (คนอ่าน detail แล้วแก้) push ที่เหลือ
// ★ lazy require: test/check-reports.js require ไฟล์นี้ตอนโหลด (mosBand) — require กลับที่หัวไฟล์จะเป็น cycle
//   ที่ module.exports ของเรายังว่าง ⇒ mosBand undefined ใน gate
function gateAfterPatch(html, name) {
  const { checkHtml } = require('../test/check-reports.js');
  const { expandReport } = require('../build.js');
  let expanded;
  try { expanded = expandReport(html); }
  catch (e) { return { ok: false, codes: ['EXPAND'], detail: `EXPAND expandReport: ${e.message}`.slice(0, 400) }; }
  const r = checkHtml(expanded, name);
  if (!r.errors.length) return { ok: true, codes: [], detail: '' };
  const codes = [...new Set(r.errors.map((e) => e.id))];
  return { ok: false, codes, detail: r.errors.map((e) => `${e.id} ${e.msg}`).join(' ; ').slice(0, 400) };
}
```

- [ ] **Step 4: ใช้ใน loop ของ `main` และใน `healDerived`** — แทน

```js
      const r = patchReport(html, { newPrice: q.price, dateParts, chartData });
      if (!r.changed) { skipped.push(symbol); continue; }
      if (WRITE) fs.writeFileSync(fp, r.html);
```
ด้วย
```js
      const r = patchReport(html, { newPrice: q.price, dateParts, chartData });
      if (!r.changed) { skipped.push(symbol); continue; }
      const g = gateAfterPatch(r.html, f);
      if (!g.ok) {
        // ค้างอยู่ก่อน patch ไหม (รหัสเดียวกันยิงบนไฟล์เดิม) — บอกคนอ่านว่าเป็นหนี้เก่า ไม่ใช่ patch ทำพัง
        const pre = gateAfterPatch(html, f);
        const preExisting = !pre.ok && g.codes.every((c) => pre.codes.includes(c));
        if (FORCE) {
          // re-analysis/controller สั่งเอง: เขียนต่อ (verify ก่อน push จะจับ) แต่ต้องเห็นชัด ๆ ไม่ใช่เงียบ
          console.log(`⚠ ${symbol.padEnd(10)} gate ตก ${g.codes.join(',')}${preExisting ? ' (ค้างอยู่ก่อน patch)' : ''} — --force เขียนต่อ แต่ npm run verify จะไม่ผ่านจนกว่าจะแก้`);
        } else {
          frozen.push({ symbol, reason: 'patch-rejected', detail: `${g.codes.join(',')}${preExisting ? ' (ค้างก่อน patch)' : ' (patch ทำให้ตก)'} — ${g.detail}`, reportPrice: sm.price, marketPrice: round(q.price, 2), diffPct });
          console.log(`❄ ${symbol.padEnd(10)} freeze [patch-rejected] ${g.codes.join(',')}${preExisting ? ' (ค้างอยู่ก่อนแล้ว)' : ''} — ไม่เขียนไฟล์`);
          continue;
        }
      }
      if (WRITE) fs.writeFileSync(fp, r.html);
```
และใน `healDerived` แทน `if (opts.write) fs.writeFileSync(fp, r.html);` ด้วย
```js
    if (opts.write) {
      const g = gateAfterPatch(r.html, f);
      if (!g.ok) { console.log(`    ⛔ ไม่เขียน — gate ตก ${g.codes.join(',')} (${g.detail.slice(0, 120)})`); continue; }
      fs.writeFileSync(fp, r.html);
    }
```
เพิ่ม `gateAfterPatch` ใน `module.exports`

- [ ] **Step 5: รันให้ผ่าน + วัดเวลาที่เพิ่ม**

```bash
node test/update-prices-test.js 2>&1 | tail -2 && /usr/bin/time -p node tools/update-prices.js --heal-derived 2>&1 | tail -4
```
Expected: เทสผ่าน · heal dry-run จบโดยไม่เขียน · `real` < 60 วิ (gate ต่อไฟล์ ~7 ms × 908 × 2 ≈ 13 วิ)

- [ ] **Step 6: เพิ่ม reason ใหม่ในเอกสาร 3 จุด** (แถวเดียว/บรรทัดเดียวต่อไฟล์)

`docs/price-refresh.md` ตาราง reason — เพิ่มแถวหลัง `bad-chart`:
```
| `patch-rejected` | **patch แล้ว gate ตก** (เพิ่ม ระยะ 0 audit ก.ย. 2569 · `gateAfterPatch`) — ไม่เขียนไฟล์นั้น รอบนั้น push ที่เหลือตามปกติ · `detail` = รหัส E ที่ยิง + `(ค้างก่อน patch)` ถ้าไฟล์เดิมก็ตกอยู่แล้ว · triage = **แก้ไฟล์ให้ผ่าน `npm test -- <SYM>`** ไม่ใช่ re-analyze · `--force` ไม่ freeze แต่พิมพ์เตือน |
```
`SKILL.md` STEP 0 — เพิ่ม bullet หลัง `bad-price` / `bad-report-price`:
```
  - `patch-rejected` → cron patch ราคาแล้ว gate ตก (detail บอกรหัส) — **ไม่ใช่งานวิเคราะห์** แก้ไฟล์ให้ `npm test -- <SYM>` ผ่าน (detail บอก "ค้างก่อน patch" = หนี้เก่าของใบนั้น) แล้ว cron รอบถัดไป patch เอง
```
`CLAUDE.md` §9 บรรทัด `freeze ลง price-flags.json เมื่อ: ต่าง >15% / MOS พลิกเกิน dead-band ±3 จุด / สงสัย split` → ต่อท้ายด้วย ` / **patch แล้ว gate ตก (`patch-rejected` — กักกันรายไฟล์ ไม่ล้มทั้งวัน · ระยะ 0 audit)**`

- [ ] **Step 7: Commit**

```bash
git add tools/update-prices.js test/update-prices-test.js docs/price-refresh.md .claude/skills/stock-analyzer/SKILL.md CLAUDE.md
git commit -m "cron: quarantine รายไฟล์ — patch แล้ว gate ตก = flag patch-rejected ไม่เขียนไฟล์นั้น ไม่ล้มทั้งวัน (WS2 ข้อ 1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: dead-band ±3 มีเจ้าของไฟล์เดียว (ขั้นบันไดของข้อ D)

**Files:**
- Modify: `tools/update-prices.js:904` (export `MOS_FLIP_DEADBAND_PP`) · `test/check-reports.js:29`, `:46-52`

- [ ] **Step 1: export จาก update-prices** — เพิ่ม `MOS_FLIP_DEADBAND_PP` ใน `module.exports`

- [ ] **Step 2: import ใน check-reports** — บรรทัด 29 → `const { mosBand, MOS_FLIP_DEADBAND_PP } = require('../tools/update-prices.js');` · บรรทัด 46–52 แทนคอมเมนต์+ค่าคงที่ด้วย

```js
// ตัวเลขในช่อง "ส่วนต่างจากราคา" vs MOS ที่คำนวณสด (W06) — **ต้องเท่ากับ dead-band ของ cron เป๊ะ** (ค่าเดียวที่มีที่มา):
// cron ปล่อย flip ผ่านเมื่อทั้งเก่า-ใหม่อยู่ใน ±dead-band แล้ว sync ตัวเลขในช่องนี้เอง (17 ส.ค. 69) ⇒ ถ้าสองค่านี้ต่างกัน
// W06 จะยิงทุก flip ที่ cron ปล่อยผ่าน (เดิมพิมพ์ 3 แยกกัน 2 ไฟล์ — code-audit §3.1 · ข้อ D ของ spec จะขยับเป็น ±5 ที่เดียว)
const TOL_MOS_SUMMARY_PP = MOS_FLIP_DEADBAND_PP;
```

- [ ] **Step 3: verify + Commit + เปิด PR #B**

```bash
npm run verify && git add tools/update-prices.js test/check-reports.js && git commit -m "gate: W06 tolerance = MOS_FLIP_DEADBAND_PP ของ cron (แหล่งเดียว — ขั้นบันไดของข้อ D)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p0-b-gate-lock
gh pr create --title "audit ระยะ 0 ส่วน B: gate/cron ทน 1 ไฟล์ + lock ไฟล์ร่วม (WS2·WS4)" --body-file - <<'PRBODY'
## สรุป
- `check-reports.checkFile`: expandReport ระเบิด = error ของไฟล์นั้น ไม่ crash ทั้งรอบ
- `tools/lockfile.js` + price-flags/seeds/tags เขียนใต้ lock (merge บนไฟล์ล่าสุด) — กฎ "controller pre-patch/pre-assign" ใน memory ไม่จำเป็นอีก
- cron quarantine รายไฟล์: `patch-rejected` (docs 3 จุด)
- W06 tolerance import จาก cron (ขั้นบันไดข้อ D)

## ทดสอบ
- `npm run verify` 13/13 · เทสใหม่ใน update-prices-test / self-test · heal dry-run ทั้งคลัง <60 วิ

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```
Expected: verify ผ่าน · PR เปิด · **รอเจ้าของ merge ก่อนเริ่มส่วน C**

---
# ส่วน C — WS5 runbook `npm run queue` (PR #C)

สาขา: `claude/audit-p0-c-runbook` (base = main หลัง merge #B)

> เป้า: 24 ขั้นที่ controller ต้องจำ (docs-audit §5) → script ทำแทนทุกขั้นที่ไม่ใช่ดุลยพินิจ แล้ว **พิมพ์รายการขั้นที่ยังต้องทำเอง** ออกมาให้เห็นทุกครั้ง · script ย่อยมีครบแล้ว (prep-stock · median-multiples · spotcheck · update-prices · tag-apply · preserve-dates) ขาดแค่ตัวร้อย

### Task 9: เทส runbook เป็น verify ขั้นที่ 4/14 + ล้างตัวเลข "จำนวนขั้น" ที่พิมพ์มือทั้งหมด (C08 · S02–S05)

**Files:**
- Create: `test/queue-test.js`
- Modify: `package.json` (scripts) · `.githooks/pre-push` · `.gitignore` · `CLAUDE.md:69,106-107` · `docs/quality-gate.md:6,9-12` · `docs/price-refresh.md:15` · `docs/ta-chart.md:120` · `README.md:163+` · `.github/workflows/update-prices.yml:49` · `.claude/skills/stock-analyzer/SKILL.md:89`

**Interfaces:**
- Produces: `test/queue-test.js` exports `{ ok }` · Task 10–14 **แทรกเทสก่อนบล็อกสรุปท้ายไฟล์** · `npm run queue` = `node tools/queue.js` (ไฟล์เกิดใน Task 14)

- [ ] **Step 1: เขียน `test/queue-test.js`** — เทสแรก = ลำดับขั้น verify ใน package.json ต้องตรง pre-push (เดิมพิมพ์มือ 2 ที่)

```js
#!/usr/bin/env node
'use strict';
/**
 * queue-test.js — unit-test ของ runbook เคลียร์คิว (tools/queue.js + tools/queue/*) แบบ offline
 * + เทสความสอดคล้อง "ลำดับขั้น verify" ระหว่าง package.json กับ .githooks/pre-push (เดิมพิมพ์มือสองที่ — code-audit §3.1)
 * ★ ทุกเทสในไฟล์นี้ห้ามยิง network / ห้ามอ่าน reports/ (ใช้ test/fixtures + ข้อความจำลอง)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

let nOK = 0, nFail = 0;
function ok(cond, label, detail) {
  if (cond) { nOK++; return; }
  nFail++;
  console.error(`✗ ${label}${detail ? ' — ' + detail : ''}`);
}
const ROOT = path.join(__dirname, '..');
process.env.QUEUE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-'));   // state.js อ่านตอน require — ต้องตั้งก่อน require ทุก module ใน tools/queue

// ── 0) verify: package.json ↔ .githooks/pre-push ต้องเป็นลำดับเดียวกัน และป้าย N/N ตรงจำนวนจริง ──
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const steps = pkg.scripts.verify.split('&&').map((s) => s.trim().replace(/^node /, ''));
  const hook = fs.readFileSync(path.join(ROOT, '.githooks', 'pre-push'), 'utf8');
  const hookSteps = [...hook.matchAll(/^node (\S+)/gm)].map((m) => m[1]);
  ok(steps.length === hookSteps.length && steps.every((s, i) => s === hookSteps[i]), 'verify: ลำดับขั้นใน package.json = .githooks/pre-push', `pkg=${steps.join(' ')} · hook=${hookSteps.join(' ')}`);
  const n = steps.length;
  const labels = [...hook.matchAll(/pre-push (\d+)\/(\d+):/g)];
  ok(labels.length === n && labels.every((m, i) => +m[1] === i + 1 && +m[2] === n), 'verify: ป้าย i/N ใน pre-push ไล่เลขถูกและ N = จำนวนขั้นจริง', `n=${n} labels=${labels.map((m) => m[1] + '/' + m[2]).join(' ')}`);
  ok(steps.includes('test/queue-test.js'), 'verify: มี test/queue-test.js อยู่ในชุด');
}

// ─────────────────────────── (Task 10–14 แทรกเทสเหนือบรรทัดนี้) ───────────────────────────
console.log(`queue-test: ${nOK}/${nOK + nFail} ผ่าน`);
if (nFail) { console.log('❌ runbook มีบั๊ก'); process.exit(1); }
process.exit(0);
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/queue-test.js
```
Expected: `✗ verify: มี test/queue-test.js อยู่ในชุด` · exit 1

- [ ] **Step 3: `package.json`** — เพิ่ม 2 script และแทรกขั้นใน verify

```json
    "test:queue": "node test/queue-test.js",
    "queue": "node tools/queue.js",
```
และใน `"verify"` แทน `node test/tag-apply-test.js && node test/tags-test.js` ด้วย `node test/tag-apply-test.js && node test/queue-test.js && node test/tags-test.js`

- [ ] **Step 4: `.githooks/pre-push`** — แทรกหลังบล็อกขั้น tag-apply-test (ก่อนคอมเมนต์ของ tags-test)

```sh
echo "🧭 pre-push 4/14: unit-test runbook เคลียร์คิว + ลำดับขั้น verify (queue-test)…"
node test/queue-test.js || block "queue runbook unit gate"

```
แล้วไล่เลขป้ายทั้งไฟล์ใหม่:
```bash
node -e "const fs=require('fs');let s=fs.readFileSync('.githooks/pre-push','utf8');let i=0;s=s.replace(/pre-push \d+\/\d+:/g,()=>'pre-push '+(++i)+'/14:');fs.writeFileSync('.githooks/pre-push',s)" && rtk proxy grep -c "pre-push [0-9]*/14:" .githooks/pre-push
```
Expected: `14`

- [ ] **Step 5: `.gitignore`** — ต่อท้าย

```
# runbook เคลียร์คิว (npm run queue) — state ของรอบ + prompt ที่ประกอบให้ worker (per-machine)
.queue/
```

- [ ] **Step 6: ล้างตัวเลขจำนวนขั้นที่พิมพ์มือ (7 ไฟล์ — จาก `grep -rn "13 ขั้น\|11 ขั้น\|8 ขั้น\|52 code"`)**

| ไฟล์:บรรทัด | เดิม | ใหม่ |
|---|---|---|
| `CLAUDE.md:69` | `# 0. quality gate 13 ขั้น — error = ห้าม push` | `# 0. quality gate 14 ขั้น — error = ห้าม push` |
| `CLAUDE.md:106` | `13 ขั้น ต้องผ่านทั้งหมดก่อน push` | `14 ขั้น ต้องผ่านทั้งหมดก่อน push` |
| `CLAUDE.md:107` | `` `tag-apply-test` → `tags-test` `` | `` `tag-apply-test` → `queue-test` → `tags-test` `` |
| `docs/quality-gate.md:6` | `บังคับซ้ำ 13 ขั้น` | `บังคับซ้ำ 14 ขั้น` |
| `docs/quality-gate.md:9` | `ครบชุด 13 ขั้น: … tag-apply-test → tags-test` | `ครบชุด 14 ขั้น: … tag-apply-test → queue-test → tags-test` |
| `docs/quality-gate.md` หลังบรรทัด `npm run test:tagapply` | — | `npm run test:queue      # ชั้น runbook (unit-test tools/queue — offline: triage/footer-date/market/prompt/ship helpers + ลำดับขั้น verify ↔ pre-push)` |
| `docs/price-refresh.md:15` | `# gate 8 ขั้นเดิม — แดง = ไม่ push` | `# gate 14 ขั้น (รายการใน CLAUDE.md §8) — แดง = ไม่ push` |
| `docs/ta-chart.md:120` | `เขียวครบ 8 ขั้น` | `เขียวครบ (8 ขั้น ณ ตอนนั้น — ปัจจุบัน 14)` |
| `README.md:163` | `ตรวจ 11 ขั้นตามลำดับนี้` | `ตรวจ 14 ขั้นตามลำดับนี้` — และเพิ่มรายการ `**`queue-test.js`** (unit-test runbook เคลียร์คิว + ลำดับขั้น verify ↔ pre-push)` ต่อจากรายการ `tag-apply-test.js` แล้วไล่เลขข้อที่เหลือ |
| `.github/workflows/update-prices.yml:49` | `- name: Quality gate 11 ขั้น` | `- name: Quality gate 14 ขั้น` |
| `.claude/skills/stock-analyzer/SKILL.md:89` | `ตารางมีเกณฑ์+วิธีแก้ครบ 52 code แล้ว` | `ตารางมีเกณฑ์+วิธีแก้ครบทุก code แล้ว` |

- [ ] **Step 7: verify + Commit**

```bash
node test/queue-test.js && npm run verify && rtk proxy grep -rn "13 ขั้น\|11 ขั้น\|8 ขั้นเดิม\|52 code" CLAUDE.md docs README.md .githooks .github .claude | grep -v superpowers/ | wc -l
```
Expected: queue-test `3/3 ผ่าน` · verify 14 ขั้น · grep = `0`

```bash
git add test/queue-test.js package.json .githooks/pre-push .gitignore CLAUDE.md docs/quality-gate.md docs/price-refresh.md docs/ta-chart.md README.md .github/workflows/update-prices.yml .claude/skills/stock-analyzer/SKILL.md
git commit -m "test: queue-test เป็น verify ขั้น 4/14 (เทสลำดับขั้น package.json ↔ pre-push) + ล้างเลข 8/11/13 ขั้น และ '52 code' ที่พิมพ์มือ (C08 · S01–S05)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: โมดูลบริสุทธิ์ของ runbook — `sh` · `state` · `footer-date` · `market` · `triage`

**Files:**
- Create: `tools/queue/sh.js`, `tools/queue/state.js`, `tools/queue/footer-date.js`, `tools/queue/market.js`, `tools/queue/triage.js`
- Test: `test/queue-test.js`

**Interfaces (Task 11–14 ใช้):**
- `sh.run(cmd, args, opts) → { code, out, err }` (ไม่ throw) · `sh.must(cmd, args, what) → { code, out, err }` (throw เมื่อ code≠0) · `sh.ROOT`
- `state.load() → { startedAt, stocks: { [SYM]: rec } }` · `state.save(s)` · `state.update(SYM, patch) → rec` · `state.DIR/FILE/PREP_DIR` (env `QUEUE_DIR` override — เทสใช้)
- `footerDate(html) → { iso, era: 'BE'|'CE', day, month, yearCE, raw } | null` · `ageDays(iso, todayISO) → number` · `todayBangkok() → 'YYYY-MM-DD'`
- `usSessionOpen(now?) → bool` · `setSessionOpen(now?) → bool`
- `bucketOf(reason) → 'LIGHT'|'FULL'|'PLUMBING'|'REJECTED'|'DELIST'|'UNKNOWN'` · `triage(flags, { footerAgeOf, freshDays? }) → rows[]` (row = flag + `bucket, action, footerAge, skip`) · `prePatchList(rows) → SYM[]`

- [ ] **Step 1: เขียนเทสที่ต้องตก** — แทรกใน `test/queue-test.js` เหนือบรรทัด `// ─── (Task 10–14 แทรกเทสเหนือบรรทัดนี้)`

```js
// ── 1) footer-date: อ่าน "ข้อมูล ณ" ใน <footer> (พ.ศ./ค.ศ. · ย่อ/เต็ม) — ความสดต้องอ่านจาก footer ไม่ใช่ reports.json.updated (C15) ──
{
  const F = require('../tools/queue/footer-date.js');
  const wrap = (s) => `<body><p>ข้อมูล ณ FY2568 ในเนื้อหา</p><footer>สรุป · ข้อมูล ณ ${s} • ที่มา</footer></body>`;
  ok(F.footerDate(wrap('10 ก.ย. 2569')).iso === '2026-09-10' && F.footerDate(wrap('10 ก.ย. 2569')).era === 'BE', 'footerDate: พ.ศ. ย่อ');
  ok(F.footerDate(wrap('1 มกราคม 2026')).iso === '2026-01-01' && F.footerDate(wrap('1 มกราคม 2026')).era === 'CE', 'footerDate: ค.ศ. เต็ม');
  ok(F.footerDate(wrap('วันที่ 5 มิ.ย. 2569')).iso === '2026-06-05', 'footerDate: มีคำว่า "วันที่"');
  ok(F.footerDate('<footer>ไม่มีวันที่</footer>') === null && F.footerDate('<p>ข้อมูล ณ 1 ม.ค. 2569</p>') === null, 'footerDate: ไม่มี footer/ไม่มีวันที่ใน footer → null (ไม่หยิบจากเนื้อหา)');
  ok(F.ageDays('2026-09-01', '2026-09-11') === 10, 'ageDays: 10 วัน');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(F.todayBangkok()), 'todayBangkok: รูป ISO');
}

// ── 2) market: ตลาดเปิดอยู่ไหม (Intl + timeZone — ไม่คิด DST เอง) · --force ข้าม guard intraday ของ update-prices จึงต้องเช็คก่อน ──
{
  const M = require('../tools/queue/market.js');
  ok(M.usSessionOpen(new Date('2026-09-10T15:00:00Z')) === true, 'us: พฤ 11:00 EDT → เปิด');
  ok(M.usSessionOpen(new Date('2026-01-15T15:00:00Z')) === true, 'us: พฤ 10:00 EST (ฤดูหนาว) → เปิด');
  ok(M.usSessionOpen(new Date('2026-09-10T21:00:00Z')) === false, 'us: 17:00 EDT → ปิด');
  ok(M.usSessionOpen(new Date('2026-09-12T15:00:00Z')) === false, 'us: เสาร์ → ปิด');
  ok(M.setSessionOpen(new Date('2026-09-10T04:00:00Z')) === true && M.setSessionOpen(new Date('2026-09-10T10:00:00Z')) === false, 'set: 11:00 ICT เปิด · 17:00 ปิด');
}

// ── 3) triage: ครบทุก reason ที่ cron/canary เขียนได้ (C14 — เดิม 2 reason ไม่มีกฎที่ไหนเลย) ──
{
  const T = require('../tools/queue/triage.js');
  const want = { 'mos-sign-flip': 'LIGHT', 'drift-gt-15pct': 'LIGHT', 'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL', 'fetch-failed': 'PLUMBING', 'patch-failed': 'PLUMBING', 'no-stock-meta': 'PLUMBING', 'currency-mismatch': 'PLUMBING', 'bad-price': 'PLUMBING', 'bad-report-price': 'PLUMBING', 'patch-rejected': 'REJECTED', 'not-on-exchange': 'DELIST' };
  for (const [r, b] of Object.entries(want)) ok(T.bucketOf(r) === b, `bucketOf(${r}) = ${b}`, T.bucketOf(r));
  ok(T.bucketOf('drift-gt-10pct') === 'LIGHT' && T.bucketOf('อะไรก็ไม่รู้') === 'UNKNOWN', 'bucketOf: drift เกณฑ์อื่น = LIGHT · ไม่รู้จัก = UNKNOWN');
  const flags = [{ symbol: 'A', reason: 'mos-sign-flip' }, { symbol: 'B', reason: 'mos-sign-flip' }, { symbol: 'C', reason: 'not-on-exchange' }, { symbol: 'D', reason: 'suspect-split-or-data' }];
  const rows = T.triage(flags, { footerAgeOf: (s) => ({ A: 3, B: 40, C: 10, D: null })[s] });
  ok(rows[0].skip && /สด/.test(rows[0].skip) && !rows[1].skip, 'triage: LIGHT ที่ footer ≤7 วัน = ข้าม (ไม่วิเคราะห์ซ้ำ) · เกิน 7 = ทำ');
  ok(rows.every((r) => r.action && r.bucket), 'triage: ทุกแถวมี bucket + action');
  ok(T.prePatchList(rows).join(',') === 'B,D', 'prePatchList: เฉพาะ LIGHT/FULL ที่ไม่ข้าม (ไม่ pre-patch DELIST/PLUMBING)');
}

// ── 4) state: อ่าน/เขียน/update ใต้ QUEUE_DIR ชั่วคราว ──
{
  const S = require('../tools/queue/state.js');
  ok(S.load().stocks && Object.keys(S.load().stocks).length === 0, 'state: ไม่มีไฟล์ = ว่าง');
  S.update('AAA', { bucket: 'LIGHT', oldPrice: 10 });
  S.update('AAA', { prepAt: '2026-09-11' });
  const s = S.load();
  ok(s.stocks.AAA.bucket === 'LIGHT' && s.stocks.AAA.oldPrice === 10 && s.stocks.AAA.prepAt === '2026-09-11', 'state.update: merge field ไม่ทับของเดิม');
  ok(fs.existsSync(S.PREP_DIR) && S.FILE.startsWith(process.env.QUEUE_DIR), 'state: สร้าง prep/ ใต้ QUEUE_DIR');
}

// ── 5) sh: run ไม่ throw · must throw พร้อม exit code ──
{
  const sh = require('../tools/queue/sh.js');
  ok(sh.run('node', ['-e', 'process.exit(3)']).code === 3, 'sh.run: คืน exit code ไม่ throw');
  let threw = null; try { sh.must('node', ['-e', 'console.error("boom");process.exit(2)'], 'ทดสอบ'); } catch (e) { threw = e; }
  ok(threw && /ทดสอบ ล้ม \(exit 2\)/.test(threw.message) && /boom/.test(threw.message), 'sh.must: throw พร้อมชื่อขั้น + exit + stderr');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/queue-test.js 2>&1 | head -2
```
Expected: `Cannot find module '../tools/queue/footer-date.js'`

- [ ] **Step 3: เขียน `tools/queue/sh.js`**

```js
'use strict';
/** รันคำสั่งภายนอกแบบ sync จาก root ของรีโป (git · npm · node tools/*) — runbook ต้องการแค่ exit code + ข้อความ */
const cp = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

/** ไม่ throw — คืน { code, out, err } ให้ caller ตัดสิน */
function run(cmd, args, opts) {
  const r = cp.spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...(opts || {}) });
  return { code: r.status == null ? 1 : r.status, out: r.stdout || '', err: r.stderr || '' };
}
/** throw เมื่อ exit ≠ 0 พร้อมชื่อขั้น + ท้าย stderr/stdout (2,000 ตัวอักษร) — พอให้คนอ่านรู้ว่าอะไรพัง */
function must(cmd, args, what) {
  const r = run(cmd, args);
  if (r.code !== 0) throw new Error(`${what || cmd} ล้ม (exit ${r.code})\n${(r.err || r.out).trim().slice(-2000)}`);
  return r;
}
module.exports = { run, must, ROOT };
```

- [ ] **Step 4: เขียน `tools/queue/state.js`**

```js
'use strict';
/**
 * state ของรอบเคลียร์คิว — `.queue/state.json` (gitignore · per-machine · อยู่ข้ามหลาย session ไม่หายเหมือน scratchpad)
 * stocks[SYM] = { reason, bucket, oldPrice, currency, footerAge, skip, flaggedAt, prePatched, mode, model, effort, prepAt,
 *                 epsScreen, snapDeltas, postcheck: 'pass'|'review', postcheckAt, shippedAt }
 * env QUEUE_DIR = override โฟลเดอร์ (เทสใช้)
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./sh.js');

const DIR = process.env.QUEUE_DIR || path.join(ROOT, '.queue');
const FILE = path.join(DIR, 'state.json');
const PREP_DIR = path.join(DIR, 'prep');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return { startedAt: null, stocks: {} };
    throw new Error(`อ่าน ${FILE} ไม่ได้ (${e.message}) — ลบไฟล์แล้วรัน preflight ใหม่`);
  }
}
function save(s) {
  fs.mkdirSync(PREP_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(tmp, FILE);
  return s;
}
function update(sym, patch) {
  const s = load();
  s.stocks[sym] = { ...(s.stocks[sym] || {}), ...patch };
  save(s);
  return s.stocks[sym];
}
module.exports = { DIR, FILE, PREP_DIR, load, save, update };
```

- [ ] **Step 5: เขียน `tools/queue/footer-date.js`** (port จาก `docs/superpowers/audit/2026-09-11-stock-analyzer/measure-analysis-age.js`)

```js
'use strict';
/**
 * วันที่วิเคราะห์ = "ข้อมูล ณ <วัน> <เดือน> <ปี>" ใน <footer> เท่านั้น (preserve-dates.js ใช้จุดเดียวกัน)
 * ★ ห้ามใช้ reports.json.updated ตัดสินความสด — bulk freshHash ชนกันได้ (13 ใบ 9 ก.ย. 69 · C15)
 * ★ อ่านเฉพาะหลัง <footer> ตัวสุดท้าย — ในเนื้อหามีวลีเดียวกัน ("SET Factsheet ข้อมูล ณ FY2568")
 */
const TH = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
  'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4, 'พฤษภาคม': 5, 'มิถุนายน': 6, 'กรกฎาคม': 7, 'สิงหาคม': 8, 'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12,
};
const FOOTER_RE = /ข้อมูล\s*ณ\s*(?:วันที่\s*)?(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/;

function footerDate(html) {
  const s = String(html);
  const fi = s.lastIndexOf('<footer');
  if (fi < 0) return null;
  const m = s.slice(fi).match(FOOTER_RE);
  if (!m) return null;
  const month = TH[m[2]];
  if (!month) return null;
  let yearCE = +m[3];
  const era = yearCE > 2400 ? 'BE' : 'CE';
  if (era === 'BE') yearCE -= 543;
  const day = +m[1];
  return { iso: `${yearCE}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, era, day, month, yearCE, raw: m[0] };
}
const ageDays = (iso, todayISO) => Math.round((Date.parse(todayISO) - Date.parse(iso)) / 86400000);
const todayBangkok = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

module.exports = { footerDate, ageDays, todayBangkok, FOOTER_RE, TH };
```

- [ ] **Step 6: เขียน `tools/queue/market.js`**

```js
'use strict';
/**
 * ตลาดเปิดอยู่ไหม — เช็คก่อน pre-patch ด้วย --force เพราะ --force ข้าม guard intraday ของ update-prices เอง
 * (บทเรียน 9 ก.ย. 69: pre-patch ตอนเย็นไทย = กลาง session US ⇒ ประทับราคา intraday ทั้งชุด)
 * ใช้ Intl + timeZone ตรง ๆ ไม่คิด DST เอง · ไม่รู้วันหยุด (ตัวตัดสินจริงคือ isIntradayQuote ใน update-prices — นี่แค่กันพลาดหยาบ ๆ)
 */
function partsIn(tz, d) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const o = {};
  for (const p of f.formatToParts(d || new Date())) o[p.type] = p.value;
  return { dow: o.weekday, min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
}
const weekend = (p) => p.dow === 'Sat' || p.dow === 'Sun';
/** NYSE/NASDAQ 09:30–16:00 ET จันทร์–ศุกร์ */
function usSessionOpen(now) { const p = partsIn('America/New_York', now); return !weekend(p) && p.min >= 9 * 60 + 30 && p.min < 16 * 60; }
/** SET 10:00–16:30 ICT (พักเที่ยงยังนับว่าเปิด — ราคาไม่ใช่ราคาปิด) */
function setSessionOpen(now) { const p = partsIn('Asia/Bangkok', now); return !weekend(p) && p.min >= 10 * 60 && p.min < 16 * 60 + 30; }
module.exports = { usSessionOpen, setSessionOpen, partsIn };
```

- [ ] **Step 7: เขียน `tools/queue/triage.js`**

```js
'use strict';
/**
 * triage คิว price-flags ตาม reason — **ครบทุก reason ที่ tools/update-prices.js + dead-ticker-canary.js เขียนได้**
 * (docs-audit C14: เดิม no-stock-meta / currency-mismatch ไม่มีกฎที่ไหนเลย · patch-rejected เพิ่มระยะ 0)
 * เพิ่ม reason ใหม่ในโค้ด cron = ต้องเพิ่มที่นี่ (queue-test ยิงทุก reason)
 */
const BUCKET = {
  'mos-sign-flip': 'LIGHT', 'drift-gt-15pct': 'LIGHT',
  'suspect-split-or-data': 'FULL', 'bad-chart': 'FULL',
  'fetch-failed': 'PLUMBING', 'patch-failed': 'PLUMBING', 'no-stock-meta': 'PLUMBING', 'currency-mismatch': 'PLUMBING', 'bad-price': 'PLUMBING', 'bad-report-price': 'PLUMBING',
  'patch-rejected': 'REJECTED', 'not-on-exchange': 'DELIST',
};
const ACTION = {
  LIGHT: 'UPDATE-LIGHT (SKILL 5C) — runbook pre-patch ราคาให้แล้ว',
  FULL: 'UPDATE เต็ม — ตรวจ split/ticker ก่อนเขียนเลข (bad-chart: ดูฐาน chart.data ในไฟล์ก่อน — SKILL STEP 0)',
  PLUMBING: 'ไม่ใช้ agent — symbol-map / stock-meta / ราคาในไฟล์ / เช็คเพิกถอน (SKILL STEP 0)',
  REJECTED: 'cron patch แล้ว gate ตก — อ่าน detail แก้ไฟล์ให้ npm test ผ่าน (ไม่ใช่ re-analyze)',
  DELIST: 'ยืนยันแหล่งปฐมภูมิ → ลบรายงาน + tag-apply --prune · ยังเทรด → update-prices --alive · ห้าม re-analyze',
  UNKNOWN: 'reason ไม่รู้จัก — เพิ่มใน tools/queue/triage.js',
};
const FRESH_DAYS = 7;   // CLAUDE.md §3.1

function bucketOf(reason) {
  const r = String(reason);
  if (/^drift-gt-\d+pct$/.test(r)) return 'LIGHT';
  return BUCKET[r] || 'UNKNOWN';
}
function triage(flags, ctx) {
  const c = ctx || {};
  return flags.map((f) => {
    const bucket = bucketOf(f.reason);
    const footerAge = c.footerAgeOf ? c.footerAgeOf(f.symbol) : null;
    const fresh = footerAge != null && footerAge <= (c.freshDays == null ? FRESH_DAYS : c.freshDays);
    const skip = fresh && (bucket === 'LIGHT' || bucket === 'FULL') ? `สด ≤${FRESH_DAYS} วัน (footer) — ไม่วิเคราะห์ซ้ำ (CLAUDE.md §3.1)` : null;
    return { ...f, bucket, action: ACTION[bucket], footerAge, skip };
  });
}
const prePatchList = (rows) => rows.filter((r) => !r.skip && (r.bucket === 'LIGHT' || r.bucket === 'FULL')).map((r) => r.symbol);

module.exports = { BUCKET, ACTION, FRESH_DAYS, bucketOf, triage, prePatchList };
```

- [ ] **Step 8: รันให้ผ่าน + Commit**

```bash
node test/queue-test.js && git add tools/queue test/queue-test.js && git commit -m "runbook: โมดูลบริสุทธิ์ sh/state/footer-date/market/triage (ครบ 12 reason — C14 · ความสดจาก footer — C15)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Expected: `queue-test: N/N ผ่าน`

### Task 11: `queue preflight` — pull · triage · snapshot ราคาเดิม · pre-patch ทั้งชุด · พิมพ์ขั้นที่ต้องทำเอง

**Files:**
- Create: `tools/queue/preflight.js`
- Test: `test/queue-test.js`

**Interfaces:**
- Consumes: Task 10 ทั้งหมด · `readStockMeta` (`tools/report-meta.js`) · `node tools/update-prices.js --write --force <SYM…>`
- Produces: `preflight(opts) → rows[]` · pure: `patchTargets(rows, { usOpen, setOpen, allowIntraday }) → { target, skippedUS, skippedTH }` · `renderTable(rows) → string` · `manualSteps(rows) → string` · state: `stocks[SYM].{reason,bucket,oldPrice,currency,footerAge,skip,flaggedAt,prePatched}`

- [ ] **Step 1: เขียนเทสที่ต้องตก**

```js
// ── 6) preflight (ส่วนบริสุทธิ์): เลือกตัวที่จะ pre-patch ตามตลาดที่เปิด · ตาราง · ขั้นที่ต้องทำเอง ──
{
  const P = require('../tools/queue/preflight.js');
  const rows = [
    { symbol: 'US1', reason: 'mos-sign-flip', bucket: 'LIGHT', currency: 'USD', action: 'x', skip: null, reportPrice: 10, marketPrice: 11, diffPct: 10, flaggedAt: '2026-09-01', footerAge: 30 },
    { symbol: 'TH1', reason: 'drift-gt-15pct', bucket: 'LIGHT', currency: 'THB', action: 'x', skip: null },
    { symbol: 'US2', reason: 'not-on-exchange', bucket: 'DELIST', currency: 'USD', action: 'x', skip: null },
    { symbol: 'US3', reason: 'mos-sign-flip', bucket: 'LIGHT', currency: 'USD', action: 'x', skip: 'สด' },
    { symbol: 'US4', reason: 'fetch-failed', bucket: 'PLUMBING', currency: 'USD', action: 'x', skip: null },
  ];
  const t1 = P.patchTargets(rows, { usOpen: false, setOpen: false, allowIntraday: false });
  ok(t1.target.join(',') === 'US1,TH1' && !t1.skippedUS.length, 'patchTargets: ตลาดปิดหมด → LIGHT/FULL ที่ไม่ข้ามทั้งหมด');
  const t2 = P.patchTargets(rows, { usOpen: true, setOpen: false, allowIntraday: false });
  ok(t2.target.join(',') === 'TH1' && t2.skippedUS.join(',') === 'US1', 'patchTargets: US เปิด → ข้าม US (--force ข้าม guard intraday เอง)');
  const t3 = P.patchTargets(rows, { usOpen: true, setOpen: true, allowIntraday: true });
  ok(t3.target.join(',') === 'US1,TH1', 'patchTargets: --allow-intraday → ไม่ข้าม');
  const table = P.renderTable(rows);
  ok(/US1/.test(table) && /10→11/.test(table) && /30d/.test(table) && table.split('\n').length === rows.length + 1, 'renderTable: 1 แถว/flag + หัวตาราง');
  const man = P.manualSteps(rows);
  ok(/probe โมเดล/.test(man) && /US2/.test(man) && /US4\[fetch-failed\]/.test(man) && /prep <SYM>/.test(man), 'manualSteps: probe · DELIST · PLUMBING · ขั้นถัดไป');
  ok(man.split('\n').filter((l) => /^\d+\./.test(l)).length <= 5, 'manualSteps: ขั้นที่ต้องทำเอง ≤5 (KPI ระยะ 0)');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/queue-test.js 2>&1 | head -2
```
Expected: `Cannot find module '../tools/queue/preflight.js'`

- [ ] **Step 3: เขียน `tools/queue/preflight.js`**

```js
'use strict';
/**
 * preflight — ขั้น A1–A9 ของรอบเคลียร์คิว (docs-audit §5) ที่ script ทำแทนได้:
 *   pull --rebase · อ่านคิว · triage ครบทุก reason · ความสดจาก footer · snapshot ราคาเดิมลง state (postcheck ใช้ grep ราคาค้าง)
 *   · pre-patch ราคา LIGHT/FULL ทั้งชุดใน process เดียว (ไม่ pre-patch ระหว่างตลาดเปิด) · พิมพ์ขั้นที่ยังต้องทำเอง
 * ★ ไม่ทำแทน: probe โมเดล (ต้อง spawn subagent) · ยืนยันเพิกถอน · แก้ plumbing · ตัดสินใจกำกวม
 */
const fs = require('fs');
const path = require('path');
const { run, must, ROOT } = require('./sh.js');
const S = require('./state.js');
const { footerDate, ageDays, todayBangkok } = require('./footer-date.js');
const { usSessionOpen, setSessionOpen } = require('./market.js');
const { triage, prePatchList } = require('./triage.js');
const { readStockMeta } = require('../report-meta.js');

const REPORTS = path.join(ROOT, 'reports');
const FLAGS = path.join(ROOT, 'price-flags.json');

const readReport = (sym) => { const fp = path.join(REPORTS, sym + '.html'); return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null; };
function loadFlags() {
  try { return JSON.parse(fs.readFileSync(FLAGS, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw new Error(`อ่าน price-flags.json ไม่ได้ (${e.message})`); }
}

/** triage + เติมราคาเดิม/สกุลจาก stock-meta ของไฟล์ (อ่านดิสก์ — ส่วนที่เทสไม่ครอบ) */
function plan(flags, today) {
  const rows = triage(flags, { footerAgeOf: (sym) => { const h = readReport(sym); const d = h && footerDate(h); return d ? ageDays(d.iso, today) : null; } });
  for (const r of rows) {
    const h = readReport(r.symbol);
    const sm = h && readStockMeta(h);
    r.oldPrice = sm && Number.isFinite(sm.price) ? sm.price : null;
    r.currency = sm ? sm.currency : null;
  }
  return rows;
}

/** เลือกตัวที่ pre-patch ได้ตอนนี้ — ตลาดของสกุลนั้นเปิดอยู่ = ข้าม (--force ของ update-prices ข้าม guard intraday เอง) */
function patchTargets(rows, m) {
  const cur = new Map(rows.map((r) => [r.symbol, r.currency]));
  const out = { target: [], skippedUS: [], skippedTH: [] };
  for (const sym of prePatchList(rows)) {
    const th = cur.get(sym) === 'THB';
    if (!m.allowIntraday && !th && m.usOpen) { out.skippedUS.push(sym); continue; }
    if (!m.allowIntraday && th && m.setOpen) { out.skippedTH.push(sym); continue; }
    out.target.push(sym);
  }
  return out;
}

function renderTable(rows) {
  const L = ['symbol     reason                  bucket    ใบ→ตลาด            ต่าง   ตั้งแต่     footer  การทำ'];
  for (const r of rows) {
    const px = `${r.reportPrice ?? '-'}→${r.marketPrice ?? '-'}`;
    L.push(`${r.symbol.padEnd(10)} ${String(r.reason).padEnd(23)} ${String(r.bucket).padEnd(9)} ${px.padEnd(18)} ${String(r.diffPct != null ? r.diffPct + '%' : '').padStart(6)} ${String(r.flaggedAt || '').padEnd(11)} ${String(r.footerAge != null ? r.footerAge + 'd' : '?').padStart(5)}  ${r.skip || r.action}`);
  }
  return L.join('\n');
}

/** ★ รายการขั้นที่ script ทำแทนไม่ได้ — พิมพ์ทุกครั้ง นี่คือตัววัด "ขั้นที่ต้องจำ ≤5" (KPI ระยะ 0) */
function manualSteps(rows) {
  const L = ['\n── ขั้นที่ต้องทำเอง (script ทำแทนไม่ได้) ──'];
  let n = 0;
  L.push(`${++n}. probe โมเดล: spawn subagent ไม่ใส่ model ให้ตอบบรรทัด "You are powered by the model named …" (CLAUDE.md §3.2) แล้ว pin ทุก call`);
  const d = rows.filter((r) => r.bucket === 'DELIST');
  if (d.length) L.push(`${++n}. DELIST ${d.map((r) => r.symbol).join(' ')}: ยืนยันแหล่งปฐมภูมิ (SEC Form 25/8-K · ประกาศตลาด) → ลบรายงาน + node tools/tag-apply.js --prune · ยังเทรด → node tools/update-prices.js --write --alive <SYM>`);
  const p = rows.filter((r) => r.bucket === 'PLUMBING' || r.bucket === 'REJECTED' || r.bucket === 'UNKNOWN');
  if (p.length) L.push(`${++n}. ${p.map((r) => `${r.symbol}[${r.reason}]`).join(' ')}: แก้ตามคอลัมน์ "การทำ" ไม่ spawn agent`);
  L.push(`${++n}. ต่อไป: npm run queue -- prep <SYM> ทีละตัว (ตัวที่ไม่มี "สด" ในคอลัมน์การทำ)`);
  return L.join('\n');
}

function preflight(opts) {
  const o = opts || {};
  if (run('git', ['status', '--porcelain']).out.trim() && !o.allowDirty)
    throw new Error('working tree ไม่สะอาด — commit ก่อน (CLAUDE.md §5: commit ก่อน pull --rebase) หรือใส่ --allow-dirty ถ้าตั้งใจ');
  must('git', ['pull', '--rebase', 'origin', 'main'], 'git pull --rebase');
  const today = todayBangkok();
  const flags = loadFlags();
  const rows = plan(flags, today);
  console.log(`\n=== คิว price-flags ${flags.length} รายการ · ${today} ===\n${renderTable(rows)}`);
  const s = S.load();
  s.startedAt = s.startedAt || today;
  for (const r of rows) s.stocks[r.symbol] = { ...(s.stocks[r.symbol] || {}), reason: r.reason, bucket: r.bucket, oldPrice: r.oldPrice, currency: r.currency, footerAge: r.footerAge, skip: r.skip, flaggedAt: r.flaggedAt || null };
  const t = patchTargets(rows, { usOpen: usSessionOpen(), setOpen: setSessionOpen(), allowIntraday: !!o.allowIntraday });
  if (t.skippedUS.length) console.log(`\n⏳ ตลาด US เปิดอยู่ — ไม่ pre-patch ${t.skippedUS.join(' ')} (ราคา intraday · --force ข้าม guard ของ update-prices เอง — บทเรียน 9 ก.ย. 69) · ต้องการจริงใส่ --allow-intraday`);
  if (t.skippedTH.length) console.log(`\n⏳ SET เปิดอยู่ — ไม่ pre-patch ${t.skippedTH.join(' ')} · --allow-intraday ถ้าจงใจ`);
  if (t.target.length && !o.noPatch) {
    console.log(`\n▶ pre-patch ราคา ${t.target.length} ตัวใน process เดียว (lock กันคิวเพี้ยนแล้ว — WS4)`);
    const r = run('node', ['tools/update-prices.js', '--write', '--force', ...t.target]);
    process.stdout.write(r.out);
    if (r.code !== 0) throw new Error('pre-patch ล้ม: ' + (r.err || r.out).slice(-1000));
    for (const sym of t.target) s.stocks[sym].prePatched = today;
  } else if (t.target.length) console.log(`\n(--no-patch) คำสั่งที่จะรัน: node tools/update-prices.js --write --force ${t.target.join(' ')}`);
  S.save(s);
  console.log(manualSteps(rows));
  return rows;
}

module.exports = { preflight, plan, patchTargets, renderTable, manualSteps, loadFlags };
```

- [ ] **Step 4: รันให้ผ่าน + ลองกับคิวจริงแบบไม่แตะ**

```bash
node test/queue-test.js && rtk proxy node -e "require('./tools/queue/preflight.js')" && node -e "
const P=require('./tools/queue/preflight.js');const rows=P.plan(P.loadFlags(), require('./tools/queue/footer-date.js').todayBangkok());console.log(P.renderTable(rows));console.log(P.manualSteps(rows));console.log('UNKNOWN:',rows.filter(r=>r.bucket==='UNKNOWN').length)"
```
Expected: เทสผ่าน · ตารางคิวจริงพิมพ์ครบทุกแถว · `UNKNOWN: 0`

- [ ] **Step 5: Commit**

```bash
git add tools/queue/preflight.js test/queue-test.js
git commit -m "runbook: queue preflight — pull·triage·snapshot ราคาเดิม·pre-patch ทั้งชุด (กันตลาดเปิด)·พิมพ์ขั้นที่ต้องทำเอง

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: `queue prep <SYM>` — prep-stock + มัธยฐาน (sanity) + EPS screen + diff snapshot vendor + ประกอบ prompt

**Files:**
- Create: `tools/queue/prep.js`
- Modify: `tools/median-multiples.js:180` (export `report`)
- Test: `test/queue-test.js`

**Interfaces:**
- Consumes: `prep-stock.js` (child process · exit 2 = หยุด) · `median-multiples.oneSymbol(spec, th)` + `report(r)` · `derived-values.{targetCells,yieldPlan,pbvPlan}` · `check-reports.buildCtx` · `build.expandReport` · `tag-lib.{loadTags,tagsOf}` · `_template/agent-prompt.md`
- Produces: `prep(sym, opts) → { file, mode, model, effort, hard }` · pure: `parseVendor(text)` · `snapshotDiff(html, ctx, vend) → string[]` · `assemblePrompt(template, vals, extra) → string` · `extraBlock(info) → string` · `hardStock(rec, ctx, vend) → { hard, why }` · ไฟล์ `.queue/prep/<SYM>.md` = prompt พร้อมส่ง Agent/analyze-wave · state: `{mode, model, effort, prepAt, epsScreen, snapDeltas}`

- [ ] **Step 1: export `report` จาก median-multiples** — บรรทัด 180: `module.exports = { oneSymbol, avgWindow, monthlyCloses, report, MIN_POINTS };` (หัวบล็อก `=== ตัวคูณมัธยฐานย้อนหลัง` ต้องออกจากฟังก์ชันเดิม — worker หาบล็อกด้วยชื่อนี้)

- [ ] **Step 2: เขียนเทสที่ต้องตก**

```js
// ── 7) prep (ส่วนบริสุทธิ์): parseVendor · snapshotDiff · assemblePrompt · hardStock ──
{
  const Pp = require('../tools/queue/prep.js');
  const FX = require('./fixtures');
  const { expandReport } = require('../build.js');
  const { buildCtx } = require('./check-reports.js');
  const PREP_OUT = `=== PREP AAPL (UPDATE) — วางทั้ง block ลง {{FUNDAMENTALS}} ===
✅ ราคา 2 แหล่งต่าง 0.12% (≤2%) — ผ่าน
⚠ EPS(TTM) ต่าง 3.4% (>2%) — ขัดกัน

=== FUNDAMENTALS AAPL (US) — 2 แหล่งอิสระสำหรับ cross-verify (SKILL STEP 2) ===
[1] Yahoo quoteSummary (AAPL):
    price=301.5 epsTTM=7.12 epsFwd=8.01 PE=42.3 fwdPE=37.6 divYield=0.35% target=310.5 (n=38) 52wk=223.78–344.57 ROE=150.2%
[2] StockAnalysis (quote/aapl):
    price=301.5 (ณ Sep 10) epsTTM=7.36 PE=41 fwdPE=37.6 div=1.04 (yield=0.35) target=312 (41) 52wk=224–344.6 earnings=Oct 30
Δ ราคา=0.12% · Δ EPS(TTM)=3.4% — เกณฑ์`;
  const v = Pp.parseVendor(PREP_OUT);
  ok(v.epsTTM === 7.36 && v.target === 312 && v.analysts === 41 && v.lo52 === 224 && v.hi52 === 344.6, 'parseVendor: ใช้ StockAnalysis ก่อน', JSON.stringify(v));
  ok(Math.abs(v.divYieldPct - 0.35) < 1e-9 && v.priceWarn === false && v.priceStop === false, 'parseVendor: yield เป็น % · ธง ราคาขัด');
  const vy = Pp.parseVendor(PREP_OUT.replace(/\[2\] StockAnalysis[^\n]*\n[^\n]*\n/, ''));
  ok(vy.epsTTM === 7.12 && vy.analysts === 38 && Math.abs(vy.divYieldPct - 0.35) < 1e-9, 'parseVendor: ไม่มี SA → ถอยไป Yahoo');

  const html = FX.AAPL();
  const ctx = buildCtx(expandReport(html), 'AAPL.html');
  const same = Pp.snapshotDiff(html, ctx, { lo52: null, hi52: null, target: null, divYieldPct: null });
  ok(same.every((s) => !/·\s*vendor/.test(s)), 'snapshotDiff: vendor ไม่มีค่า → ไม่ฟ้องส่วนต่าง');
  const far = Pp.snapshotDiff(html, ctx, { lo52: 1, hi52: 2, target: 1, analysts: 9, divYieldPct: 9 });
  ok(far.some((s) => /กรอบ 52 สัปดาห์/.test(s)) && far.some((s) => /เป้านักวิเคราะห์|อ่านกรอบ/.test(s)), 'snapshotDiff: ค่าต่างมาก → ฟ้อง 52wk/เป้า (คลาสที่ 4 price-derived-staleness)', far.join(' | '));

  const tpl = fs.readFileSync(path.join(ROOT, '_template', 'agent-prompt.md'), 'utf8');
  const p = Pp.assemblePrompt(tpl, { SYMBOL: 'AAPL', MARKET: 'US', MODE: 'UPDATE-LIGHT', WORKTREE: '/wt', CURRENT_TAGS: 'consumer-tech', MEDIANS: '=== ตัวคูณมัธยฐานย้อนหลัง: AAPL ===\n  ★ มัธยฐาน 28.0x', FUNDAMENTALS: PREP_OUT }, Pp.extraBlock({ sym: 'AAPL', mode: 'UPDATE-LIGHT', prePatched: '2026-09-11', oldPrice: 297.21, price: 301.5, baseEPS: 7.1, epsTTM: 7.36, epsScreen: 3.66, snap: ['เป้า ใบ 300 · vendor 312'], medWarn: [], hard: false, hardWhy: '' }));
  ok(!/\{\{(SYMBOL|MARKET|MODE|WORKTREE|CURRENT_TAGS|MEDIANS|FUNDAMENTALS)\}\}/.test(p), 'assemblePrompt: แทนครบ 7 token');
  ok(/บันทึกจาก runbook/.test(p) && /ห้ามรัน update-prices ซ้ำ/.test(p) && /ยกระดับเป็น UPDATE เต็ม/.test(p) && /เป้า ใบ 300/.test(p) && /ห้ามเรียก advisor ตรง/.test(p), 'assemblePrompt: บล็อกท้าย = ราคา patch แล้ว · EPS screen · snapshot · ข้อห้าม');
  let threw = false; try { Pp.assemblePrompt(tpl, { SYMBOL: 'X' }, ''); } catch (_) { threw = true; }
  ok(threw, 'assemblePrompt: ขาด token → throw (ไม่ส่ง prompt ที่มี {{…}} ค้าง)');

  ok(Pp.hardStock({ bucket: 'FULL' }, ctx, v).hard === true, 'hardStock: suspect-split/bad-chart = ยาก');
  ok(Pp.hardStock({ bucket: 'LIGHT' }, { baseEPS: -1.2 }, v).hard === true && /pre-profit/.test(Pp.hardStock({ bucket: 'LIGHT' }, { baseEPS: -1.2 }, v).why), 'hardStock: EPS ฐาน ≤ 0 = pre-profit = ยาก');
  ok(Pp.hardStock({ bucket: 'LIGHT' }, ctx, v).hard === false, 'hardStock: LIGHT ปกติ = ไม่ยาก (Sonnet/medium)');
}
```

- [ ] **Step 3: รันให้เห็นว่าตก**

```bash
node test/queue-test.js 2>&1 | head -2
```
Expected: `Cannot find module '../tools/queue/prep.js'`

- [ ] **Step 4: เขียน `tools/queue/prep.js`**

```js
'use strict';
/**
 * prep <SYM> — ขั้น B1–B8 + A8/A9 ของรอบเคลียร์คิว (docs-audit §5) ในคำสั่งเดียว:
 *   สกุล→--th เอง · prep-stock (exit 2 = หยุด) · มัธยฐานตัวคูณ + sanity (สุดขั้ว/ผสมสกุล — บทเรียน 10 ก.ย. 69)
 *   · EPS screen ใบ vs vendor (>2% ⇒ UPDATE เต็ม — SKILL 5C ข้อ 2 · prep-stock ไม่เทียบกับใบ) · diff snapshot vendor
 *   (เป้า+n / 52wk / ปันผล — คลาสที่ 4 ของ price-derived-staleness เดิมอยู่ใน memory เท่านั้น) · tags ปัจจุบัน
 *   · ประกอบ prompt จาก _template/agent-prompt.md + บล็อกบันทึก → .queue/prep/<SYM>.md
 * ★ ไม่ทำแทน: spawn worker (controller ทำ พร้อม pin model) · courier/advisor ของหุ้นยาก · เลือกสีแบรนด์ NEW (--brand)
 */
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./sh.js');
const S = require('./state.js');
const { todayBangkok } = require('./footer-date.js');
const { readStockMeta } = require('../report-meta.js');
const DV = require('../derived-values.js');
const T = require('../tag-lib.js');

const REPORTS = path.join(ROOT, 'reports');
const TEMPLATE = path.join(ROOT, '_template', 'agent-prompt.md');
const TOKENS = ['SYMBOL', 'MARKET', 'MODE', 'WORKTREE', 'CURRENT_TAGS', 'MEDIANS', 'FUNDAMENTALS'];
const EPS_SCREEN_PCT = 2;   // SKILL 5C ข้อ 2

const num = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(/[,%]/g, '')); return Number.isFinite(n) ? n : null; };
const asPct = (v) => (v != null && v < 0.3 ? v * 100 : v);   // vendor บางเจ้าส่ง yield เป็นสัดส่วน (0.0035) บางเจ้าเป็น % (0.35)
const pctDiff = (a, b) => (a != null && b ? Math.abs(a - b) / Math.abs(b) * 100 : null);

/** ถอดค่าจาก stdout ของ prep-stock (บรรทัด [1] Yahoo / [2] StockAnalysis ของ fetch-fundamentals) — SA ก่อน Yahoo */
function parseVendor(text) {
  const y = text.match(/\[1\] Yahoo[^\n]*\n\s*price=(\S+) epsTTM=(\S+) epsFwd=(\S+) PE=(\S+) fwdPE=(\S+) divYield=(\S+) target=(\S+)(?: \(n=(\d+)\))? 52wk=(\S+)–(\S+)/);
  const s = text.match(/\[2\] StockAnalysis[^\n]*\n\s*price=(\S+)(?: \(ณ [^)]*\))? epsTTM=(\S+) PE=(\S+) fwdPE=(\S+) div=(\S+)(?: \(yield=(\S+)\))? target=(\S+)(?: \((\d+)\))? 52wk=(\S+)–(\S+)/);
  const pick = (a, b) => (a != null ? a : b);
  return {
    epsTTM: pick(s && num(s[2]), y && num(y[2])),
    target: pick(s && num(s[7]), y && num(y[7])),
    analysts: pick(s && num(s[8]), y && num(y[8])),
    lo52: pick(s && num(s[9]), y && num(y[9])),
    hi52: pick(s && num(s[10]), y && num(y[10])),
    divYieldPct: pick(s && asPct(num(s[6])), y && asPct(num(y[6]))),
    priceStop: /🛑/.test(text),
    priceWarn: /⚠ ราคา 2 แหล่งต่าง/.test(text),
  };
}

/** snapshot vendor ที่พิมพ์ในใบ vs vendor ตอนนี้ — คืนรายการที่ต่างเกินเกณฑ์ (ให้ worker อัปเดตพร้อมกัน) */
function snapshotDiff(html, ctx, v) {
  const out = [];
  const m52 = html.match(/กรอบ 52 สัปดาห์\s*(?:[฿$]|C\$)?\s*([0-9][0-9.,]*)\s*[–\-]\s*(?:[฿$]|C\$)?\s*([0-9][0-9.,]*)/);
  if (!m52) out.push('อ่านกรอบ 52 สัปดาห์ในใบไม่ได้ — เทียบกับ FUNDAMENTALS เอง');
  else if (v.lo52 != null && v.hi52 != null) {
    const lo = num(m52[1]), hi = num(m52[2]);
    if (pctDiff(lo, v.lo52) > 3 || pctDiff(hi, v.hi52) > 3) out.push(`กรอบ 52 สัปดาห์ ใบ ${lo}–${hi} · vendor ${v.lo52}–${v.hi52}`);
  }
  for (const t of DV.targetCells(html))
    if (v.target != null && pctDiff(t.target, v.target) > 2) out.push(`เป้านักวิเคราะห์ (${t.label}) ใบ ${t.target} · vendor ${v.target}${v.analysts != null ? ` (n=${v.analysts})` : ''}`);
  const px = ctx && ctx.px;
  const yp = px > 0 ? DV.yieldPlan(html, px) : null;
  if (yp && yp.cards.length && v.divYieldPct != null && Math.abs(yp.cards[0].shown - v.divYieldPct) > 0.3) out.push(`ปันผล % ใบ ${yp.cards[0].shown} · vendor ${v.divYieldPct}`);
  const pb = px > 0 ? DV.pbvPlan(html, px) : [];
  if (pb.length) out.push(`P/BV ใบ ${pb[0].shown}x — ตรวจกับ BVPS/ราคาใน FUNDAMENTALS เอง (vendor ไม่ส่งค่านี้ในบล็อก)`);
  return out;
}

/** หุ้นยากตามเกณฑ์ CLAUDE.md §3.2 ที่ตัดสินจากข้อมูลที่มี — IPO/spinoff/cyclical ยังต้องคนดู */
function hardStock(rec, ctx, v) {
  const why = [];
  if (rec && rec.bucket === 'FULL') why.push(`${rec.reason || 'split/chart'}`);
  if (ctx && ctx.baseEPS != null && ctx.baseEPS <= 0) why.push('pre-profit (EPS ฐาน ≤ 0)');
  if (v && v.priceWarn) why.push('ราคา cross-source ต่าง 2–5%');
  return { hard: why.length > 0, why: why.join(' · ') };
}

function assemblePrompt(template, vals, extra) {
  const found = new Set((template.match(/\{\{([A-Z_]+)\}\}/g) || []).map((t) => t.slice(2, -2)));
  for (const k of found) if (!TOKENS.includes(k)) throw new Error(`template มี token ที่ runbook ไม่รู้จัก: {{${k}}} — เพิ่มใน tools/queue/prep.js`);
  let out = template;
  for (const k of TOKENS) {
    if (vals[k] == null) throw new Error(`ขาดค่า {{${k}}}`);
    out = out.split(`{{${k}}}`).join(String(vals[k]));
  }
  return `${out}\n\n${extra}\n`;
}

function extraBlock(i) {
  const L = ['=== บันทึกจาก runbook (controller) — อ่านก่อนเริ่ม ==='];
  L.push(`- โหมด **${i.mode}** · ${i.prePatched
    ? `ราคาในไฟล์ patch แล้ว ${i.prePatched} (${i.oldPrice ?? '?'} → ${i.price ?? '?'}) ⇒ **ห้ามรัน update-prices ซ้ำ** ยกเว้น SKILL 5B ข้อ 3 (แก้ fairValue — ปลอดภัยแล้วเพราะ lock)`
    : `ราคายังไม่ได้ pre-patch (ตลาดเปิด/ข้าม) — โหมด UPDATE รัน \`node tools/update-prices.js --write --force ${i.sym}\` ตาม SKILL STEP 1 ได้`}`);
  if (i.epsScreen != null) L.push(`- EPS ในใบ ${i.baseEPS} vs vendor ${i.epsTTM} = ต่าง ${i.epsScreen.toFixed(1)}% → ${i.epsScreen <= EPS_SCREEN_PCT ? 'FV เดิมยืนได้ (UPDATE-LIGHT ตาม 5C ข้อ 2)' : '**ยกระดับเป็น UPDATE เต็ม** (5C ข้อ 2) — ตรวจ dil/basic/งวดตาม STEP 2 ก่อน'}`);
  else L.push('- EPS screen: เทียบไม่ได้ (อ่าน EPS ฐานในใบหรือ vendor ไม่ได้) — ตรวจเองตาม STEP 2');
  L.push(i.snap.length
    ? `- snapshot vendor ที่ค้างในใบ (อัปเดตพร้อมกัน — คลาสที่ 4 ของ price-derived-staleness):\n${i.snap.map((s) => '    · ' + s).join('\n')}`
    : '- snapshot vendor (เป้า/52wk/ปันผล) ตรงกับใบแล้ว');
  if (i.medWarn.length) L.push(`- มัธยฐานตัวคูณ: ${i.medWarn.join(' · ')}`);
  if (i.hard) L.push(`- **หุ้นยาก** (${i.hardWhy}) → controller ปรึกษา advisor แล้ววางแนวทางตรงนี้ก่อน spawn:\n    <ยังไม่ได้วาง — ถ้าเห็นบรรทัดนี้ใน prompt แปลว่า controller ข้ามขั้น>`);
  L.push('- ห้าม push · ห้ามเขียน tags.json · ห้ามเรียก advisor ตรง (ข้อห้ามเชิงนโยบาย — agent-prompt ว่าไว้แล้ว) · pick-brand/update-prices มี lock แล้ว รันตาม SKILL ได้เมื่อจำเป็น');
  return L.join('\n');
}

async function medianBlock(spec, th) {
  const MM = require('../median-multiples.js');
  const warn = [];
  let text;
  try {
    const r = await MM.oneSymbol(spec, th);
    text = MM.report(r);
    if (r.curErr) warn.push('ผสมสกุลเงิน — รัน prep ใหม่ด้วย --median-spec SYM:<ticker กระดานท้องถิ่น> (เคส CP/UMC 9 ก.ย. 69)');
    if (r.median != null && (r.median > 60 || r.median < 3)) warn.push(`มัธยฐาน ${r.median.toFixed(1)}x นอกย่าน 3–60x — อ่านรายปีก่อนวาง (เคส 2,074x 10 ก.ย. 69)`);
    if (r.dropped.length) warn.push(`ตัดปีผิดปกติ ${r.dropped.length} จุด: ${r.dropped.map((d) => `${d.key} ${d.outlier}`).join(' · ')}`);
  } catch (e) {
    text = `=== ตัวคูณมัธยฐานย้อนหลัง: ${spec} ===\n  ✗ ดึงไม่สำเร็จ: ${e.message}\n  ⇒ **ห้ามเดาตัวคูณจากค่าปัจจุบัน** — ใช้ peer ที่วัดจริง หรือตระกูลอื่นเป็นขาแทน`;
    warn.push('ดึงมัธยฐานไม่ได้ — worker ต้องใช้ตระกูลอื่น/peer ที่วัดจริง');
  }
  return { text, warn };
}

async function prep(sym, opts) {
  const o = opts || {};
  const fp = path.join(REPORTS, sym + '.html');
  const exists = fs.existsSync(fp);
  const html = exists ? fs.readFileSync(fp, 'utf8') : '';
  const sm = exists ? readStockMeta(html) : null;
  const th = exists ? (sm && sm.currency === 'THB') : !!o.th;
  const rec = S.load().stocks[sym] || {};
  const mode = o.mode || (!exists ? 'NEW' : rec.bucket === 'LIGHT' ? 'UPDATE-LIGHT' : 'UPDATE');

  // 1. prep-stock ครั้งเดียว (มัน spawn fetch-fundamentals + fetch-facts ให้แล้ว — ห้ามดึงซ้ำ)
  const ps = run('node', ['tools/prep-stock.js', sym, ...(th ? ['--th'] : []), ...(mode !== 'NEW' ? ['--update'] : []), ...(o.brand ? ['--brand', o.brand] : [])]);
  process.stdout.write(ps.out + '\n');
  if (ps.code === 2) throw new Error(`prep-stock exit 2 — ราคาขัดแหล่ง >5% หรือ bad-chart: **หยุด ห้าม spawn** ถามเจ้าของ (CLAUDE.md §2)`);
  if (ps.code !== 0) throw new Error('prep-stock ล้ม: ' + (ps.err || ps.out).slice(-800));
  const vend = parseVendor(ps.out);

  // 2. มัธยฐานตัวคูณ (structured) + sanity
  const med = await medianBlock(o.medianSpec || sym, th);

  // 3. EPS screen + 4. snapshot diff (เฉพาะใบเดิม)
  let ctx = null, epsScreen = null, snap = [];
  if (exists) {
    const { buildCtx } = require('../../test/check-reports.js');
    const { expandReport } = require('../../build.js');
    ctx = buildCtx(expandReport(html), sym + '.html');
    epsScreen = pctDiff(ctx.baseEPS, vend.epsTTM);
    snap = snapshotDiff(html, ctx, vend);
  }

  // 5. tags · 6. ยาก/โมเดล/effort
  const tags = T.tagsOf(sym, T.loadTags()).join(' ');
  const hs = hardStock(rec, ctx, vend);
  const model = o.model || (hs.hard ? 'opus' : 'sonnet');
  const effort = hs.hard ? 'high' : 'medium';

  // 7. ประกอบ prompt
  const prompt = assemblePrompt(fs.readFileSync(TEMPLATE, 'utf8'),
    { SYMBOL: sym, MARKET: th ? 'TH' : 'US', MODE: mode, WORKTREE: ROOT, CURRENT_TAGS: tags, MEDIANS: med.text, FUNDAMENTALS: ps.out },
    extraBlock({ sym, mode, prePatched: rec.prePatched, oldPrice: rec.oldPrice, price: sm && sm.price, baseEPS: ctx && ctx.baseEPS, epsTTM: vend.epsTTM, epsScreen, snap, medWarn: med.warn, hard: hs.hard, hardWhy: hs.why }));
  fs.mkdirSync(S.PREP_DIR, { recursive: true });
  const file = path.join(S.PREP_DIR, sym + '.md');
  fs.writeFileSync(file, prompt);
  S.update(sym, { mode, model, effort, prepAt: todayBangkok(), epsScreen, snapDeltas: snap.length, currency: th ? 'THB' : 'USD' });

  console.log(`\n=== prep ${sym} เสร็จ → ${path.relative(ROOT, file)} ===`);
  console.log(`โหมด ${mode} · model **${model}** · effort ${effort}${hs.hard ? ` · หุ้นยาก: ${hs.why}` : ''}`);
  if (epsScreen != null) console.log(`EPS screen: ${epsScreen.toFixed(1)}% ${epsScreen > EPS_SCREEN_PCT ? '⇒ UPDATE เต็ม' : '(ผ่าน)'}`);
  if (snap.length) console.log(`snapshot vendor ค้าง ${snap.length} จุด (อยู่ใน prompt แล้ว)`);
  if (med.warn.length) console.log(`⚠ มัธยฐาน: ${med.warn.join(' · ')}`);
  console.log('\n── ขั้นที่ต้องทำเอง ──');
  let n = 0;
  if (hs.hard) console.log(`${++n}. หุ้นยาก: ปรึกษา advisor แล้วแทนบรรทัด "<ยังไม่ได้วาง …>" ใน prompt ด้วยแนวทาง`);
  if (mode === 'NEW' && !o.brand) console.log(`${++n}. NEW: เลือกสีแบรนด์จาก tools/brand-colors.md แล้วรัน prep ใหม่ด้วย --brand "#hex" (หรือให้ worker รัน pick-brand เอง — มี lock แล้ว)`);
  console.log(`${++n}. spawn worker 1 ตัว: prompt = ไฟล์ข้างบน · pin model:"${model}" · effort ${effort} (Agent tool หรือ analyze-wave stocks=[1 ตัว])`);
  console.log(`${++n}. worker คืนงานแล้ว → npm run queue -- postcheck ${sym} --model ${model}`);
  return { file, mode, model, effort, hard: hs.hard };
}

module.exports = { prep, parseVendor, snapshotDiff, assemblePrompt, extraBlock, hardStock, medianBlock, TOKENS, EPS_SCREEN_PCT };
```

- [ ] **Step 5: รันให้ผ่าน + ลองกับหุ้นจริง 1 ตัวจากคิว (ยิง network — ครั้งเดียว)**

```bash
node test/queue-test.js && rtk proxy node tools/queue.js prep KLAC 2>/dev/null || rtk proxy node -e "require('./tools/queue/prep.js').prep('KLAC',{}).then(r=>console.log(r))" && head -5 .queue/prep/KLAC.md && rtk proxy grep -c "บันทึกจาก runbook" .queue/prep/KLAC.md
```
Expected: เทสผ่าน · ไฟล์ prompt เกิด · มีบล็อกบันทึก 1 ครั้ง · ไม่มี `{{` ค้างนอกบล็อก FUNDAMENTALS/BRAND

- [ ] **Step 6: Commit**

```bash
git add tools/queue/prep.js tools/median-multiples.js test/queue-test.js
git commit -m "runbook: queue prep — prep-stock·มัธยฐาน+sanity·EPS screen·diff snapshot vendor·ประกอบ prompt → .queue/prep/<SYM>.md (A8/A9/B1–B8 ออกจากความจำ)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: `queue postcheck <SYM>` — gate + spotcheck + ราคาค้าง + ai-model + pe/roe + วันที่ footer

**Files:**
- Create: `tools/queue/postcheck.js`
- Test: `test/queue-test.js`

**Interfaces:**
- Consumes: `node test/check-reports.js <SYM>` (exit code) · `node tools/spotcheck.js <SYM>` · `check-reports.{checkFile,buildCtx}` · state `{oldPrice, model}`
- Produces: `postcheck(sym, opts) → { issues: string[], notes: string[] }` · pure: `findOldPrice(html, oldPrice) → [{line,text}]` · `checkMeta(ctx, model) → string[]` · state `{postcheck:'pass'|'review', postcheckAt}`

- [ ] **Step 1: เขียนเทสที่ต้องตก**

```js
// ── 8) postcheck (ส่วนบริสุทธิ์): ราคาเก่าค้างในเนื้อความ · ai-model · pe null เมื่อขาดทุน · footer วันนี้/พ.ศ. ──
{
  const Pc = require('../tools/queue/postcheck.js');
  const html = '<p>ราคาปัจจุบัน $297.21 ยังถูก</p>\n<script id="stock-meta">{"price":297.21}</script>\n<p>เป้า $320</p>\n<p>จากจุดเข้า $297</p>';
  const hits = Pc.findOldPrice(html, 297.21);
  ok(hits.length === 2 && hits[0].line === 1 && hits[1].line === 4, 'findOldPrice: จับทั้งทศนิยมและจำนวนเต็ม · ข้ามบล็อก stock-meta', JSON.stringify(hits));
  ok(Pc.findOldPrice(html, null).length === 0, 'findOldPrice: ไม่มีราคาเดิม → ว่าง');
  const ctxLoss = { aiModel: 'Claude Sonnet 5', baseEPS: -0.5, sm: { ok: true, data: { pe: 12, roe: 4.1 } } };
  const m1 = Pc.checkMeta(ctxLoss, 'sonnet', { iso: '2026-09-11', era: 'BE' }, '2026-09-11');
  ok(m1.some((s) => /stock-meta\.pe/.test(s)) && !m1.some((s) => /ai-model/.test(s)), 'checkMeta: EPS ≤ 0 แต่ pe ไม่ null → issue · ai-model ตรง → ไม่ฟ้อง', m1.join('|'));
  const m2 = Pc.checkMeta({ aiModel: 'Claude Sonnet 5', baseEPS: 5, sm: { ok: true, data: { pe: 20, roe: 10 } } }, 'opus', { iso: '2026-09-10', era: 'CE' }, '2026-09-11');
  ok(m2.some((s) => /ai-model/.test(s)) && m2.some((s) => /footer.*ไม่ใช่วันนี้/.test(s)) && m2.some((s) => /ค\.ศ\./.test(s)), 'checkMeta: ai-model ไม่ตรง spawn · footer ไม่ใช่วันนี้ · ค.ศ.', m2.join('|'));
  ok(Pc.checkMeta({ aiModel: 'Claude Opus 5', baseEPS: 5, sm: { ok: true, data: { pe: 20, roe: 10 } } }, 'opus', { iso: '2026-09-11', era: 'BE' }, '2026-09-11').length === 0, 'checkMeta: ทุกอย่างตรง → ว่าง');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/queue-test.js 2>&1 | head -2
```
Expected: `Cannot find module '../tools/queue/postcheck.js'`

- [ ] **Step 3: เขียน `tools/queue/postcheck.js`**

```js
'use strict';
/**
 * postcheck <SYM> — ขั้น C1–C3 · C10–C11 + สิ่งที่ memory สั่งให้ controller ดูเอง (docs-audit §5):
 *   npm test -- SYM (0 error) · spotcheck · grep ราคาเดิมค้างทั้งไฟล์ (gate มองไม่เห็น prose) · ai-model ตรงกับที่ spawn
 *   · EPS ฐาน ≤ 0 ⇒ stock-meta.pe ต้อง null (roe = เตือน) · footer "ข้อมูล ณ" = วันนี้ + พ.ศ.
 * ★ ไม่ทำแทน: ชั้น 0 valuation (cluster/|MOS|>40%/สมอตาย/ตระกูลเดียว) — คนอ่าน spotcheck + W18/W05 เอง
 */
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./sh.js');
const S = require('./state.js');
const { footerDate, todayBangkok } = require('./footer-date.js');

const REPORTS = path.join(ROOT, 'reports');
const MODEL_RE = { sonnet: /sonnet/i, opus: /opus/i };

/** ราคาเดิม (ก่อน pre-patch) ที่ยังโผล่ในเนื้อความ — ทั้งรูปทศนิยม/จำนวนเต็ม/มี comma · ข้ามบล็อก JSON */
function findOldPrice(html, oldPrice) {
  if (!(oldPrice > 0)) return [];
  const forms = new Set([String(oldPrice), oldPrice.toFixed(2), oldPrice.toFixed(1), String(Math.round(oldPrice)), oldPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })]);
  const re = new RegExp(`(?:[฿$]|C\\$)\\s*(?:${[...forms].map((f) => f.replace(/[.]/g, '\\.')).join('|')})(?![0-9])`);
  const hits = [];
  String(html).split('\n').forEach((l, i) => {
    if (/id="(stock-meta|report-data)"/.test(l)) return;
    if (re.test(l)) hits.push({ line: i + 1, text: l.trim().slice(0, 140) });
  });
  return hits;
}

/** ตรวจ meta ที่ gate ไม่รู้: ai-model vs โมเดลที่ spawn · pe/roe เมื่อขาดทุน · footer */
function checkMeta(ctx, model, fd, today) {
  const issues = [];
  if (model && ctx.aiModel && MODEL_RE[model] && !MODEL_RE[model].test(ctx.aiModel)) issues.push(`ai-model "${ctx.aiModel}" ไม่ตรงโมเดลที่ spawn (${model}) — worker ต้องประทับรุ่นที่รันจริง`);
  const sm = ctx.sm && ctx.sm.ok ? ctx.sm.data : null;
  if (ctx.baseEPS != null && ctx.baseEPS <= 0 && sm) {
    if (sm.pe !== null && sm.pe !== undefined) issues.push(`EPS ฐาน ${ctx.baseEPS} ≤ 0 แต่ stock-meta.pe = ${sm.pe} (ต้อง null)`);
    if (sm.roe !== null && sm.roe !== undefined && sm.roe > 0) issues.push(`EPS ฐาน ≤ 0 แต่ stock-meta.roe = ${sm.roe} — ตรวจว่าขาดทุนสุทธิไหม (ถ้าใช่ต้อง null — เคส OKJ)`);
  }
  if (!fd) issues.push('อ่านวันที่ footer "ข้อมูล ณ" ไม่ได้');
  else {
    if (fd.iso !== today) issues.push(`footer "ข้อมูล ณ" = ${fd.iso} ไม่ใช่วันนี้ ${today} (re-analysis ทุกโหมดต้องขยับ footer — SKILL 5B/5C)`);
    if (fd.era !== 'BE') issues.push('footer ใช้ปี ค.ศ. — กติกา พ.ศ. (CLAUDE.md §7)');
  }
  return issues;
}

function postcheck(sym, opts) {
  const o = opts || {};
  const fp = path.join(REPORTS, sym + '.html');
  if (!fs.existsSync(fp)) throw new Error(`ไม่มี reports/${sym}.html — worker ยังไม่ได้เขียน (หรือเขียนผิดที่ — ดู STEP 0 cwd-stray)`);
  const rec = S.load().stocks[sym] || {};
  const issues = [], notes = [];

  const t = run('node', ['test/check-reports.js', sym]);
  process.stdout.write(t.out);
  if (t.code !== 0) issues.push('npm test ตก (มี error) — แก้ก่อน');
  const sp = run('node', ['tools/spotcheck.js', sym]);
  process.stdout.write(sp.out);
  if (/▸/.test(sp.out)) notes.push('spotcheck มีรายการให้อ่าน (ด้านบน) — ตัดสินเอง ไม่ใช่ gate');

  const html = fs.readFileSync(fp, 'utf8');
  const hits = findOldPrice(html, rec.oldPrice);
  if (hits.length) issues.push(`ราคาเดิม ${rec.oldPrice} ยังโผล่ ${hits.length} จุด:\n` + hits.map((h) => `    L${h.line}: ${h.text}`).join('\n'));

  const { buildCtx } = require('../../test/check-reports.js');
  const { expandReport } = require('../../build.js');
  const ctx = buildCtx(expandReport(html), sym + '.html');
  issues.push(...checkMeta(ctx, o.model || rec.model, footerDate(html), todayBangkok()));

  const verdict = issues.length ? 'review' : 'pass';
  S.update(sym, { postcheck: verdict, postcheckAt: todayBangkok() });
  console.log(`\n=== postcheck ${sym}: ${verdict === 'pass' ? '✅ ผ่าน' : `⚠ ต้องดู ${issues.length} ข้อ`} ===`);
  for (const i of issues) console.log('  ✗ ' + i);
  for (const n of notes) console.log('  · ' + n);
  console.log('\n── ขั้นที่ต้องทำเอง ──');
  console.log('1. ชั้น 0 valuation (CLAUDE.md §8): cluster check · |MOS| >40% มีพยาน · W18/W05 · การ์ด EV/Sales·EV/EBITDA·DCF ไม่มี gate อ่านเอง');
  console.log(`2. ตัดสิน publish/skip${issues.length ? ' (แก้ issue ข้างบนก่อน หรือ re-dispatch)' : ''} → npm run queue -- ship ${sym} [--tags "…"]`);
  return { issues, notes };
}

module.exports = { postcheck, findOldPrice, checkMeta };
```

- [ ] **Step 4: รันให้ผ่าน + Commit**

```bash
node test/queue-test.js && git add tools/queue/postcheck.js test/queue-test.js && git commit -m "runbook: queue postcheck — gate·spotcheck·ราคาเดิมค้าง·ai-model·pe/roe เมื่อขาดทุน·footer วันนี้ พ.ศ. (C1–C3/C10–C11 + กฎใน memory)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: `queue ship` · `status` · dispatcher `tools/queue.js` · ปิด issue เมื่อคิวว่าง · docs ชี้มาที่ runbook

**Files:**
- Create: `tools/queue/ship.js`, `tools/queue.js`
- Modify: `CLAUDE.md` §9 bullet "เคลียร์คิว price-flags" · `docs/orchestration.md` §1 · `docs/price-refresh.md:156` (bullet เคลียร์คิว)
- Test: `test/queue-test.js`

**Interfaces:**
- Consumes: state `{mode, model, postcheck}` · `npm run verify` · `tools/preserve-dates.js` · `tools/tag-apply.js` · `gh issue list/close`
- Produces: `shipStock(sym, { tags, message, force })` · `shipPrepatch()` · `status()` · pure: `commitMessage(sym, rec, sm) → string` · `trailer(model) → string` · CLI `npm run queue -- <preflight|prep|postcheck|ship|status>`

- [ ] **Step 1: เขียนเทสที่ต้องตก**

```js
// ── 9) ship (ส่วนบริสุทธิ์): commit message ตาม CLAUDE.md §5 (1 commit = 1 หุ้น · add/update · trailer ตามโมเดล worker) ──
{
  const Sh = require('../tools/queue/ship.js');
  ok(Sh.commitMessage('AAPL', { mode: 'UPDATE-LIGHT' }, { mos: 3.9 }) === 'analyze: update AAPL — UPDATE-LIGHT (MOS +3.9%)', 'commitMessage: update + MOS');
  ok(Sh.commitMessage('NEWCO', { mode: 'NEW' }, { mos: -12 }) === 'analyze: add NEWCO — NEW (MOS −12%)', 'commitMessage: NEW = add · เครื่องหมายลบ');
  ok(Sh.commitMessage('X', {}, null) === 'analyze: update X — UPDATE', 'commitMessage: ไม่มี mos/mode → ค่าตั้งต้น');
  ok(Sh.trailer('opus') === 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>' && Sh.trailer(undefined) === 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>', 'trailer: ตามโมเดล worker · ค่าตั้งต้น Sonnet 5 (CLAUDE.md §5)');
  ok(/analyze: update|analyze: add/.test(Sh.commitMessage('A', { mode: 'UPDATE' }, {})) && Sh.STOCK_FILES('A').includes('reports/A.html') && !Sh.STOCK_FILES('A').includes('-A'), 'STOCK_FILES: รายการไฟล์ที่ add ชัดเจน (ไม่ใช่ git add -A)');
}
// ── 10) dispatcher: usage เมื่อไม่มีคำสั่ง · exit 1 ──
{
  const sh = require('../tools/queue/sh.js');
  const r = sh.run('node', ['tools/queue.js']);
  ok(r.code === 1 && /preflight/.test(r.err) && /postcheck/.test(r.err) && /ship/.test(r.err), 'queue.js: ไม่มีคำสั่ง → usage + exit 1');
  const r2 = sh.run('node', ['tools/queue.js', 'status']);
  ok(r2.code === 0 && /ยังไม่เริ่ม|push แล้ว/.test(r2.out), 'queue.js status: รันได้บน state ว่าง');
}
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
node test/queue-test.js 2>&1 | head -2
```
Expected: `Cannot find module '../tools/queue/ship.js'`

- [ ] **Step 3: เขียน `tools/queue/ship.js`**

```js
'use strict';
/**
 * ship — ขั้น D1–D4 + ปิด issue + build/preserve-dates สำหรับ pre-patch ล้วน (docs-audit §5: preserve-dates อยู่แค่ใน cron)
 *   ship <SYM>: tag-apply (ถ้ามี) → verify → preserve-dates+build (กัน `updated` ของใบที่แค่ pre-patch เด้ง) → add ไฟล์ที่ระบุ
 *               → commit 1 หุ้น (CLAUDE.md §5) → pull --rebase → push HEAD:main → ปิด issue ถ้าคิวว่าง
 *   ship --prepatch: ใบที่ pre-patch แล้วไม่ได้วิเคราะห์ใหม่ → build → preserve-dates → build → verify → commit "price: …" → push
 * ★ ไม่ทำแทน: ตัดสิน publish/skip (postcheck ต้อง pass หรือ --force หลังรีวิวเอง)
 */
const fs = require('fs');
const path = require('path');
const { run, must, ROOT } = require('./sh.js');
const S = require('./state.js');
const { todayBangkok } = require('./footer-date.js');
const { readStockMeta } = require('../report-meta.js');

const FLAGS = path.join(ROOT, 'price-flags.json');
const TITLE = 'Price-refresh flags — หุ้นรอ re-analysis';   // ต้องตรงกับ update-prices.yml / dead-ticker-canary.yml
const MODEL_NAME = { sonnet: 'Sonnet 5', opus: 'Opus 5' };
const STOCK_FILES = (sym) => [`reports/${sym}.html`, 'tags.json', 'tools/seeds.json', 'price-flags.json', 'reports.json'];

const trailer = (model) => `Co-Authored-By: Claude ${MODEL_NAME[model] || 'Sonnet 5'} <noreply@anthropic.com>`;
function commitMessage(sym, rec, sm) {
  const mode = (rec && rec.mode) || 'UPDATE';
  const mos = sm && Number.isFinite(sm.mos) ? ` (MOS ${sm.mos < 0 ? '−' : '+'}${Math.abs(sm.mos)}%)` : '';
  return `analyze: ${mode === 'NEW' ? 'add' : 'update'} ${sym} — ${mode}${mos}`;
}
function verify() { console.log('▶ npm run verify'); must('npm', ['run', 'verify'], 'npm run verify'); }
function keepDates() { must('node', ['tools/preserve-dates.js'], 'preserve-dates'); must('npm', ['run', 'build'], 'build'); }
function pushWithRebase() {
  must('git', ['pull', '--rebase', 'origin', 'main'], 'git pull --rebase');
  must('git', ['push', 'origin', 'HEAD:main'], 'git push HEAD:main');
}
function closeIssueIfEmpty() {
  let n = 0;
  try { n = JSON.parse(fs.readFileSync(FLAGS, 'utf8')).length; }
  catch (e) { if (e.code !== 'ENOENT') { console.log('⚠ อ่าน price-flags.json ไม่ได้ — ไม่แตะ issue'); return; } }
  if (n) { console.log(`คิวเหลือ ${n} — issue คงเปิด`); return; }
  const q = run('gh', ['issue', 'list', '--state', 'open', '--search', `in:title "${TITLE}"`, '--json', 'number', '--jq', '.[0].number']);
  const num = q.out.trim();
  if (q.code !== 0 || !num) { console.log('issue คิว: ไม่มีที่เปิดอยู่ หรือ gh ใช้ไม่ได้ — ข้าม (cron รอบถัดไปปิดให้)'); return; }
  const c = run('gh', ['issue', 'close', num, '--comment', 'คิวเคลียร์หมดแล้ว ✅ (ปิดโดย npm run queue ship)']);
  console.log(c.code === 0 ? `✅ ปิด issue #${num}` : `⚠ ปิด issue #${num} ไม่สำเร็จ: ${c.err.slice(0, 200)}`);
}

function shipStock(sym, opts) {
  const o = opts || {};
  const rec = S.load().stocks[sym] || {};
  if (rec.postcheck !== 'pass' && !o.force) throw new Error(`${sym}: postcheck ยังไม่ผ่าน (${rec.postcheck || 'ยังไม่รัน'}) — รัน npm run queue -- postcheck ${sym} ก่อน หรือ --force ถ้ารีวิวเองแล้ว`);
  if (o.tags) must('node', ['tools/tag-apply.js', sym, ...o.tags.split(/\s+/).filter(Boolean)], 'tag-apply');
  verify();
  keepDates();
  const files = STOCK_FILES(sym).filter((f) => fs.existsSync(path.join(ROOT, f)));
  must('git', ['add', '--', ...files], 'git add');
  if (run('git', ['diff', '--cached', '--quiet']).code === 0) throw new Error(`ไม่มีอะไรให้ commit — worker ยังไม่ได้เขียน reports/${sym}.html? (เช็ค cwd-stray)`);
  const sm = readStockMeta(fs.readFileSync(path.join(ROOT, 'reports', sym + '.html'), 'utf8'));
  const msg = o.message || commitMessage(sym, rec, sm);
  must('git', ['commit', '-q', '-m', `${msg}\n\n${trailer(rec.model)}`], 'git commit');
  pushWithRebase();
  S.update(sym, { shippedAt: todayBangkok() });
  console.log(`✅ ${sym} push แล้ว: ${msg}`);
  closeIssueIfEmpty();
}

function shipPrepatch() {
  const changed = run('git', ['diff', '--name-only', '--', 'reports']).out.trim().split('\n').filter(Boolean);
  if (!changed.length) { console.log('ไม่มีไฟล์ใน reports/ ที่เปลี่ยน — ไม่มีอะไรจะ ship'); return; }
  must('npm', ['run', 'build'], 'build');
  keepDates();
  verify();
  must('git', ['add', '--', 'reports', 'reports.json', 'price-flags.json'], 'git add');
  must('git', ['commit', '-q', '-m', `price: pre-patch ${changed.length} symbols (manual queue run ${todayBangkok()})\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`], 'git commit');
  pushWithRebase();
  console.log(`✅ pre-patch ${changed.length} ใบ push แล้ว (วันที่วิเคราะห์คงเดิมผ่าน preserve-dates)`);
  closeIssueIfEmpty();
}

/** X/Y ตาม memory feedback-progress-counter: push แล้ว / รอ push / ยังไม่เริ่ม */
function status() {
  const s = S.load();
  const rows = Object.entries(s.stocks);
  const pushed = rows.filter(([, r]) => r.shippedAt).map(([k]) => k);
  const waiting = rows.filter(([, r]) => !r.shippedAt && r.postcheck === 'pass').map(([k]) => k);
  const review = rows.filter(([, r]) => !r.shippedAt && r.postcheck === 'review').map(([k]) => k);
  const prepped = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && r.prepAt).map(([k]) => k);
  const idle = rows.filter(([, r]) => !r.shippedAt && !r.postcheck && !r.prepAt && !r.skip && ['LIGHT', 'FULL'].includes(r.bucket)).map(([k]) => k);
  const other = rows.filter(([, r]) => !r.shippedAt && (r.skip || !['LIGHT', 'FULL'].includes(r.bucket))).map(([k, r]) => `${k}[${r.skip ? 'สด' : r.bucket}]`);
  console.log(`รอบเริ่ม ${s.startedAt || '-'} · ${pushed.length}/${rows.length}`);
  console.log(`push แล้ว ${pushed.length}: ${pushed.join(' ') || '-'}`);
  console.log(`รอ push ${waiting.length}: ${waiting.join(' ') || '-'}`);
  console.log(`postcheck ต้องดู ${review.length}: ${review.join(' ') || '-'}`);
  console.log(`prep แล้วรอ worker ${prepped.length}: ${prepped.join(' ') || '-'}`);
  console.log(`ยังไม่เริ่ม ${idle.length}: ${idle.join(' ') || '-'}`);
  console.log(`ไม่ใช้ agent/ข้าม ${other.length}: ${other.join(' ') || '-'}`);
}

module.exports = { shipStock, shipPrepatch, status, commitMessage, trailer, closeIssueIfEmpty, STOCK_FILES, TITLE };
```

- [ ] **Step 4: เขียน `tools/queue.js`**

```js
#!/usr/bin/env node
'use strict';
/**
 * queue.js — runbook รอบ "เคลียร์คิว price-flags" (WS5 · แทนขั้นความจำ 24 ขั้นใน docs-audit §5)
 *   npm run queue -- preflight              pull --rebase · triage · snapshot ราคาเดิม · pre-patch ทั้งชุด · พิมพ์ขั้นที่ต้องทำเอง
 *   npm run queue -- prep <SYM>             prep-stock + มัธยฐาน + EPS screen + snapshot diff → .queue/prep/<SYM>.md (prompt)
 *   npm run queue -- postcheck <SYM>        gate + spotcheck + ราคาค้าง + ai-model + pe/roe + footer
 *   npm run queue -- ship <SYM> [--tags …]  verify → commit 1 หุ้น → push · ปิด issue เมื่อคิวว่าง
 *   npm run queue -- ship --prepatch        ใบที่ pre-patch ล้วน → build/preserve-dates/build → push
 *   npm run queue -- status                 X/Y push แล้ว / รอ push / ยังไม่เริ่ม
 * สิ่งที่ยังต้องทำเอง (script พิมพ์บอกทุกครั้ง): probe โมเดล · courier/advisor หุ้นยาก · spawn worker (pin model) · ยืนยันเพิกถอน · ชั้น 0 valuation · publish/skip
 */
const argv = process.argv.slice(2);
const cmd = argv[0];
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const VALUE_FLAGS = new Set(['--mode', '--model', '--brand', '--median-spec', '--tags', '--message']);
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !VALUE_FLAGS.has(arr[i - 1]));
const sym = (positional[0] || '').toUpperCase();
const usage = `ใช้: npm run queue -- <คำสั่ง> [ตัวเลือก]
  preflight [--no-patch] [--allow-intraday] [--allow-dirty]
  prep <SYM> [--mode NEW|UPDATE|UPDATE-LIGHT] [--model sonnet|opus] [--brand "#hex"] [--median-spec SYM:TICKER] [--th]
  postcheck <SYM> [--model sonnet|opus]
  ship <SYM> [--tags "slug slug"] [--message "…"] [--force]   |   ship --prepatch
  status`;

(async () => {
  switch (cmd) {
    case 'preflight': require('./queue/preflight.js').preflight({ noPatch: has('--no-patch'), allowIntraday: has('--allow-intraday'), allowDirty: has('--allow-dirty') }); break;
    case 'prep': if (!sym) throw new Error(usage); await require('./queue/prep.js').prep(sym, { mode: val('--mode'), model: val('--model'), brand: val('--brand'), medianSpec: val('--median-spec'), th: has('--th') }); break;
    case 'postcheck': if (!sym) throw new Error(usage); process.exitCode = require('./queue/postcheck.js').postcheck(sym, { model: val('--model') }).issues.length ? 1 : 0; break;
    case 'ship': {
      const sh = require('./queue/ship.js');
      if (has('--prepatch')) sh.shipPrepatch();
      else if (sym) sh.shipStock(sym, { tags: val('--tags'), message: val('--message'), force: has('--force') });
      else throw new Error(usage);
      break;
    }
    case 'status': require('./queue/ship.js').status(); break;
    default: console.error(usage); process.exit(1);
  }
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
```

- [ ] **Step 5: รันให้ผ่าน**

```bash
node test/queue-test.js && npm run queue -- status && npm run queue -- preflight --no-patch --allow-dirty | tail -8
```
Expected: เทสผ่าน · status พิมพ์ 6 บรรทัด · preflight พิมพ์ตารางคิวจริง + ขั้นที่ต้องทำเอง ≤5 ข้อ

- [ ] **Step 6: ให้เอกสารชี้มาที่ runbook (แทนที่ ไม่เพิ่ม)**

`CLAUDE.md` §9 bullet ที่ขึ้นต้น `**"เคลียร์คิว price-flags"** = **triage ตาม `reason` ก่อน** …` → แทนทั้ง bullet ด้วย
```
- **"เคลียร์คิว price-flags"** = รัน runbook `npm run queue -- preflight` → ต่อหุ้น `prep <SYM>` → spawn worker (pin model) → `postcheck <SYM>` → `ship <SYM>` → ท้ายรอบ `ship --prepatch` (คำสั่งเดียวทำ pull/triage ครบทุก reason/pre-patch/prep-stock/มัธยฐาน/EPS screen/snapshot/ประกอบ prompt/gate/spotcheck/verify/commit รายหุ้น/push/ปิด issue — และ**พิมพ์ขั้นที่ยังต้องทำเอง**ทุกครั้ง) · เกณฑ์ triage ต่อ reason = `tools/queue/triage.js` (queue-test บังคับให้ครบทุก reason) + คำอธิบายใน SKILL STEP 0 · flag ราคาหายเองเมื่อรายงานสด/ไฟล์ถูกลบ · `not-on-exchange` ถอนได้แค่ TradingView เจอ ticker กลับมา · ไฟล์ถูกลบ · หรือ `--alive <SYM>` (`--force` ไม่เคลียร์ — ตั้งใจ)
```
`docs/orchestration.md` §1 → แทนทั้ง section ด้วย
```
## 1. ก่อนเริ่ม — กันซ้ำ + ความสด

`npm run queue -- preflight` ทำให้: `git pull --rebase origin main` · อ่านคิว · **ความสดอ่านจากวันที่ footer "ข้อมูล ณ" ของแต่ละใบ** (ไม่ใช่ `reports.json.updated` — bulk freshHash ชนกันได้ 13 ใบ 9 ก.ย. 2569) · สด ≤7 วัน = ข้าม (ธีม/โควตา → หาตัวใหม่ · ระบุชื่อ → ข้ามพร้อมแจ้ง) · เกิน 7 วัน = UPDATE · ยังไม่มี = NEW · จากคิว price-flags → triage ตาม `tools/queue/triage.js` (LIGHT / FULL / PLUMBING / REJECTED / DELIST)
กันซ้ำข้าม session = push รายตัวผ่าน `npm run queue -- ship <SYM>` (pull --rebase มากับลำดับ push ของทุกตัวอยู่แล้ว)
```
`docs/price-refresh.md:156` bullet `**เคลียร์คิว:** …` → แทนด้วย
```
- **เคลียร์คิว:** `npm run queue -- preflight` แล้วทำตามที่ script พิมพ์ (CLAUDE.md §9) · หุ้นยาก (suspect-split/bad-chart/pre-profit/ราคาขัด 2–5%) prep จะแนะนำ `model:"opus"` + effort high และเตือนให้ controller ปรึกษา `advisor` ก่อน spawn (CLAUDE.md §3.2/§7) · ปล่อยค้าง = วันที่ราคาเก่าลงจนโดน staleness gate (warn 45 / error 120 วัน)
```

- [ ] **Step 7: verify + Commit + เปิด PR #C**

```bash
npm run verify && git add tools/queue.js tools/queue/ship.js test/queue-test.js CLAUDE.md docs/orchestration.md docs/price-refresh.md && git commit -m "runbook: queue ship/status + dispatcher npm run queue — commit 1 หุ้น·preserve-dates·push·ปิด issue · docs ชี้มาที่ runbook (WS5 v1 ครบ)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p0-c-runbook
gh pr create --title "audit ระยะ 0 ส่วน C: runbook npm run queue (WS5)" --body-file - <<'PRBODY'
## สรุป
- `npm run queue -- preflight|prep|postcheck|ship|status` ร้อย script ที่มีอยู่ (prep-stock · median-multiples · spotcheck · update-prices · tag-apply · preserve-dates) แทน 24 ขั้นที่ต้อง "จำ" (docs-audit §5) และ**พิมพ์ขั้นที่ยังต้องทำเอง**ทุกครั้ง (≤5)
- triage ครบ 12 reason (C14) · ความสดจาก footer (C15) · กันตลาดเปิดก่อน `--force` (S08) · EPS screen + diff snapshot vendor (กฎที่เคยอยู่ใน memory เท่านั้น) · sanity มัธยฐาน (10 ก.ย.)
- `test/queue-test.js` = verify ขั้น 4/14 + เทสลำดับขั้น package.json ↔ pre-push · ล้างเลข 8/11/13 ขั้น ทุกไฟล์ (C08)

## ทดสอบ
- `npm run verify` 14/14 · `preflight --no-patch` บนคิวจริง UNKNOWN = 0 · `prep` 1 ตัวจริง

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```
Expected: PR เปิด · **รอเจ้าของ merge ก่อนเริ่มส่วน D**

---
# ส่วน D — WS8(1)(2)(5)(6) ล้างกฎขัดกัน/ล้าสมัย · role-scope CLAUDE.md · open-items · probe (PR #D)

สาขา: `claude/audit-p0-d-rules` (base = main หลัง merge #C)

> หลักทุก task ในส่วนนี้: **แทน** ข้อความเดิม ไม่เพิ่มย่อหน้า · ทุกการแก้อ้าง ID ใน `docs/superpowers/audit/2026-09-11-stock-analyzer/docs-audit.md` §1–2 · คำตัดสินที่ล็อกไว้แล้ว (ไม่ต้องตัดสินซ้ำ): **C04** = "default ไม่แน่นอน ⇒ pin เสมอ" · **C05** = CLAUDE.md ถูก (controller เรียก advisor ตรงได้) · **C06/C11** = race ปิดด้วย lock แล้ว ⇒ worker รัน update-prices (เฉพาะ 5B ข้อ 3) / pick-brand ได้ · **C12** = §3.3 คือโหมดขนาน §3.4 คือโหมดทีละตัว · **C10** = กฎ พ.ศ. คงไว้สำหรับใบใหม่ + ระบุว่า gate รับสองปฏิทินโดยตั้งใจ (ใบเก่า ค.ศ. 126 ใบ → ระยะ 3)

### Task 15: กฎที่ล้าสมัยฝั่งโค้ด — คอมเมนต์ `--force` ใน update-prices · `analyze-wave` บังคับ 1 หุ้น/run

**Files:**
- Modify: `tools/update-prices.js:622` (S09/C07) · `.claude/workflows/analyze-wave.js:3,8,17-21` (C01/C16/S10/S13)

- [ ] **Step 1: `tools/update-prices.js:622`** — แทนคอมเมนต์ `// ถอนได้ 3 ทาง: TradingView เจอ ticker กลับมา · รายงานถูกลบ · \`--force <SYM>\` (ยืนยันด้วยมือ)` ด้วย `// ถอนได้ 3 ทาง: TradingView เจอ ticker กลับมา · รายงานถูกลบ · \`--alive <SYM>\` (ยืนยันด้วยมือ — ไม่ใช่ --force: SKILL สั่ง --force ทุก re-analysis)`

- [ ] **Step 2: `.claude/workflows/analyze-wave.js`** — บรรทัด 3 `description` → `'รันวิเคราะห์หุ้น 1 ตัว/run (บังคับในโค้ด) พร้อมคุม effort/model ของ worker — รันหลาย run ขนานได้'` · ลบบรรทัด 8 (`// sequential ตามกติกา CLAUDE.md §3 — ห้าม parallel …`) · หลัง `const stocks = …` เพิ่ม

```js
// ★ ข้อห้ามจริง = "หลายหุ้นใน 1 run" (เลขปนข้ามหุ้น — ตัวร้าย #1) — เดิมเป็นแค่ข้อความใน whenToUse (docs-audit S13) ตอนนี้บังคับ
if (Array.isArray(stocks) && stocks.length > 1) {
  return { error: `stocks[] ต้องมี 1 ตัวเสมอ (ได้ ${stocks.length}) — spawn หลาย run ขนานแทน (CLAUDE.md §3.3)` }
}
```

- [ ] **Step 3: ยืนยันไม่มีคำว่า sequential ค้าง + Commit**

```bash
rtk proxy grep -n "sequential\|--force <SYM>\` (ยืนยัน" .claude/workflows/analyze-wave.js tools/update-prices.js | wc -l
git add tools/update-prices.js .claude/workflows/analyze-wave.js
git commit -m "docs(code): ลบคอมเมนต์ล้าสมัย (--force ปลด not-on-exchange · sequential) + analyze-wave บังคับ stocks.length===1 (S09 S10 S13 C16)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Expected: grep = `0`

### Task 16: `SKILL.md` — กฎที่ worker อ่านตรง (C02 C06 C09 C14 C15 S11)

**Files:**
- Modify: `.claude/skills/stock-analyzer/SKILL.md:9`, `:32`, `:38`, STEP 0 (bullet `fetch-failed`), `:123`

- [ ] **Step 1: แก้ตามตาราง**

| บรรทัด | เดิม | ใหม่ |
|---|---|---|
| 9 | `กติกา orchestration (เวฟ ≤3 / sequential / push รายตัว / โมเดล / ห้าม Haiku) อยู่ \`CLAUDE.md §3–5\` + \`docs/orchestration.md\`` | `กติกา orchestration (โมเดล / ห้าม Haiku / controller เป็นคน push) อยู่ \`CLAUDE.md §3–5\` + \`docs/orchestration.md\` — รอบเคลียร์คิวใช้ runbook \`npm run queue\`` |
| 32 | `- ความสด: \`reports.json\` ฟิลด์ \`updated\` ≤7 วัน → ไม่วิเคราะห์ซ้ำ (กติกา dedup อยู่ CLAUDE.md §3.1)` | `- ความสด: วันที่ footer "ข้อมูล ณ" ≤7 วัน → ไม่วิเคราะห์ซ้ำ (runbook preflight เช็คให้ · \`reports.json.updated\` ใช้ไม่ได้ — freshHash ชนกัน 9 ก.ย. 69 · กติกา dedup อยู่ CLAUDE.md §3.1)` |
| 38 | `- UPDATE → \`node tools/update-prices.js --write --force <SYMBOL>\` — patch ราคา …` | `- UPDATE → ราคา/กราฟ/MOS ถูก patch มาแล้วโดย runbook (บล็อก "บันทึกจาก runbook" ใน prompt บอกไว้) — **รันซ้ำเฉพาะเมื่อบันทึกบอกว่ายังไม่ได้ patch**: \`node tools/update-prices.js --write --force <SYMBOL>\` (ปลอดภัยแล้ว — price-flags มี lock) — patch ราคา …` (คงข้อความส่วนหลังเดิม) |
| STEP 0 หลัง bullet `fetch-failed` / `patch-failed` | — | `  - \`no-stock-meta\` / \`currency-mismatch\` → plumbing เช่นกัน: บล็อก \`stock-meta\` หาย/JSON เสีย หรือ \`currency\` ไม่ตรง Yahoo (ADR/ticker ผิดกระดาน) — แก้ในไฟล์/\`symbol-map\` ไม่ใช้ agent` |
| 123 | `1. **batch เดียว**: \`node tools/update-prices.js --write --force <SYM>\` + \`node tools/fetch-fundamentals.js …\`` | `1. **batch เดียว**: (ราคา patch แล้วโดย runbook — ห้ามรัน update-prices ซ้ำ เว้นแต่บันทึกใน prompt บอกว่ายังไม่ได้ patch) + \`node tools/fetch-fundamentals.js …\`` (คงส่วนที่เหลือ) |

- [ ] **Step 2: ยืนยัน + Commit**

```bash
rtk proxy grep -n "เวฟ ≤3\|sequential\|reports.json\` ฟิลด์ \`updated\`\|52 code" .claude/skills/stock-analyzer/SKILL.md | wc -l && npm run verify >/dev/null && echo verify-ok
git add .claude/skills/stock-analyzer/SKILL.md
git commit -m "docs(skill): ลบ 'เวฟ ≤3/sequential' · ความสดจาก footer · triage no-stock-meta/currency-mismatch · update-prices เฉพาะเมื่อ runbook ยังไม่ patch (C02 C06 C14 C15 S11)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Expected: grep = `0` · `verify-ok`

### Task 17: `CLAUDE.md` — role-scope + C04 C12 C15 + ถอดกฎ pre-assign/pre-patch ที่ lock แทนแล้ว

**Files:**
- Modify: `CLAUDE.md` (หัวไฟล์ · §3 · §5 · §10)

- [ ] **Step 1: preamble — ใครอ่านไฟล์นี้** หลังบรรทัด `deploy อัตโนมัติบน **Cloudflare Workers (Static Assets)** ผ่านการเชื่อม GitHub` เพิ่ม

```
> **ไฟล์นี้ถูก inject ให้ทั้ง session หลัก (controller) และ subagent (worker) — วัดจริง 11 ก.ย. 69** · หัวข้อที่ติดป้าย **[controller]** เป็นงานของ session หลักเท่านั้น **worker ห้ามทำตาม** (worker ยึด `_template/agent-prompt.md` + SKILL.md · โดยเฉพาะ: worker ห้าม push · ห้ามเรียก advisor ตรง · ห้ามเขียน tags.json) · หัวข้อไม่ติดป้าย = ใช้ทั้งสองบทบาท
```

- [ ] **Step 2: ติดป้ายหัวข้อ** — `## 3. วิเคราะห์หลายตัว / เป็นกลุ่ม (parallel agents)` → `## 3. [controller] วิเคราะห์หลายตัว / เป็นกลุ่ม (parallel agents)` · `## 5. Auto-push (กฎสำคัญ)` → `## 5. [controller] Auto-push (กฎสำคัญ — worker ห้าม push)` · `## 9. Price refresh อัตโนมัติ (cron)` → `## 9. [controller] Price refresh อัตโนมัติ (cron) + คิว`

- [ ] **Step 3: §3.1 ความสด (C15)** — `→ อ่าน \`reports.json\` — สด ≤7 วัน **ไม่ทำซ้ำ**` → `→ อ่านวันที่ footer "ข้อมูล ณ" ของแต่ละใบ (runbook \`preflight\` ทำให้ · \`reports.json.updated\` ใช้ตัดสินไม่ได้ — freshHash ชนกัน 13 ใบ 9 ก.ย. 69) — สด ≤7 วัน **ไม่ทำซ้ำ**`

- [ ] **Step 4: §3.2 โมเดล (C04)** — แทน `⇒ default ที่ไม่ pin = **Opus 5** — ผิดกติกาเพราะ "ไม่ได้ตั้งใจ" (จ่ายราคา Opus ให้หุ้นธรรมดาโดยไม่รู้ตัว + ป้าย \`ai-model\` เพี้ยนจากที่วางแผน) ไม่ใช่เพราะ Opus ต้องห้าม` ด้วย `⇒ default ที่ไม่ pin **ไม่แน่นอน** (วัดจริง 8 ส.ค. 69 = Opus 5 · 11 ก.ย. 69 = Sonnet 5 — ผลต่างกันคนละวัน) ⇒ ผิดกติกาเพราะ "ไม่รู้ว่าได้อะไร" (ค่าใช้จ่าย + ป้าย \`ai-model\` ไม่ตรงแผน) ไม่ใช่เพราะ Opus ต้องห้าม` · และ `docs/orchestration.md:18,:59` แก้ทำนองเดียวกันใน Task 18

- [ ] **Step 5: §3.3 / §3.4 (C12 + ถอด pre-assign)** — ขึ้นต้น bullet 3 ด้วย `**(โหมดขนาน)** ` และ bullet 4 ด้วย `**(โหมดทีละตัว)** ` · ใน bullet 3 แทน `**ก่อนขนานต้องทำ 2 อย่าง**: controller pre-assign สีแบรนด์เอง (seeds.json race — §10) + verify/push **รายแบตช์** ไม่ใช่รายตัว` ด้วย `**ก่อนขนานต้องทำ 1 อย่าง**: verify/push **รายแบตช์** ไม่ใช่รายตัว (สีแบรนด์/price-flags/tags มี lock แล้ว — \`tools/lockfile.js\` ระยะ 0 audit — worker รัน pick-brand เองได้)`

- [ ] **Step 6: §10 pick-brand** — แทนทั้ง bullet `⚠️ **\`tools/pick-brand.js\` ไม่ปลอดภัยเมื่อรันขนาน** — … (ดู §3.3)` ด้วย `- \`tools/pick-brand.js\` อ่าน→ตรวจชน→เขียน \`seeds.json\` ใต้ lock (\`tools/lockfile.js\` · ระยะ 0 audit ก.ย. 69) — worker ขนานรันเองได้ตาม SKILL 5A · เดิม (ก่อน lock) 2 ตัวขนาน = สีเดียวกันโดย gate จับไม่ได้ จึงเคยบังคับให้ controller pre-assign — กฎนั้นยกเลิก`

- [ ] **Step 7: §4 pre-fetch** — `controller **pre-fetch \`node tools/prep-stock.js <SYM> [--th] [--update]\` เสมอ** แล้ววางทั้ง block ใน \`{{FUNDAMENTALS}}\`` → `controller **pre-fetch ผ่าน \`npm run queue -- prep <SYM>\` เสมอ** (รัน prep-stock + median-multiples + EPS screen + snapshot vendor แล้วประกอบ prompt ให้ที่ \`.queue/prep/<SYM>.md\`)` (คงส่วน exit 2 ไว้)

- [ ] **Step 8: ยืนยันคู่ขัดกันหาย + Commit**

```bash
rtk proxy grep -n "pre-assign สีแบรนด์เอง\|default ที่ไม่ pin = \*\*Opus\|อ่าน \`reports.json\` — สด" CLAUDE.md | wc -l && npm run verify >/dev/null && echo verify-ok
git add CLAUDE.md
git commit -m "docs(CLAUDE.md): role-scope [controller] + preamble worker · C04 default ไม่แน่นอน · C12 โหมดขนาน/ทีละตัว · C15 ความสดจาก footer · ถอดกฎ pre-assign สี (lock แทน)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Expected: grep = `0`

### Task 18: `docs/orchestration.md` · `price-refresh.md` · `templates.md` · `counters.md` (C01 C03 C05 C11 C13 S06 S07 S08 S10)

**Files:**
- Modify: `docs/orchestration.md:17-20`, `:27`, `:31-34`, `:45-47`, `:59-64` · `docs/price-refresh.md:3` · `docs/templates.md:3` · `docs/counters.md:4`

- [ ] **Step 1: `docs/orchestration.md` §2 (C03 C05 S07 S08)**

| บรรทัด | เดิม | ใหม่ |
|---|---|---|
| 17 | `- **Sonnet เป็น default ทุกชั้น**: controller=Sonnet, worker=Sonnet (\`model:"sonnet"\`) — ตราบใดที่ …` | `- **Sonnet = default ของ worker ส่วนใหญ่** (\`model:"sonnet"\`) — ตราบใดที่ …` (คงส่วนหลัง) |
| 18 | `… ปล่อย default = Opus 5 โดยไม่ตั้งใจ (harness กรอง \`CLAUDE_CODE_SUBAGENT_MODEL\` ทิ้ง) …` | `… ปล่อย default = ไม่แน่นอน (วัด 8 ส.ค. 69 Opus · 11 ก.ย. 69 Sonnet — harness กรอง \`CLAUDE_CODE_SUBAGENT_MODEL\` ทิ้ง) …` |
| 19 | `- **หุ้นยาก** (…) → worker ยังเป็น Sonnet แต่ตั้ง \`effort:"high"\` + **controller ปรึกษา \`advisor\` ผ่าน courier subagent ก่อน spawn**: …` | `- **หุ้นยาก** (…) → \`model:"opus"\` + \`effort:"high"\` (CLAUDE.md §3.2) + **controller ปรึกษา \`advisor\` ก่อน spawn** (เรียกตรงได้ — CLAUDE.md §7 · courier ใช้เมื่อ context ของ controller ใหญ่จน advisor ตอบ unavailable): …` (คงส่วนหลัง) |
| 20 | `→ **ห้าม controller/worker เรียก advisor ตรง ๆ** · วิธีที่ถูก: controller spawn **courier subagent** — …` | `→ **worker ห้ามเรียก advisor ตรง** (นโยบาย — agent-prompt กำกับ) · controller เรียกตรงได้ (CLAUDE.md §7) · เมื่อ transcript ของ controller ใหญ่จน advisor ตอบ unavailable ให้ spawn **courier subagent** — …` (คงส่วนหลัง) |

- [ ] **Step 2: §3 หัวข้อ + sequential (C01 S10)** — บรรทัด 27 `## 3. Spawn — 1 หุ้น/agent · sequential` → `## 3. Spawn — 1 หุ้น/agent (ขนานหลาย run ได้)` · บรรทัด 31–34 (`★ ~~SEQUENTIAL (บังคับ)~~ → ยกเลิกแล้ว …` ทั้ง bullet) → แทนด้วย bullet เดียว `- **1 หุ้น/run บังคับในโค้ดแล้ว** (\`analyze-wave.js\` คืน error ถ้า \`stocks.length > 1\` — ระยะ 0 audit) · spawn หลาย run ขนานได้ (วัดจริง 40 ตัว N=3→6 ไม่เจอ rate limit) ตามเงื่อนไข §5 ข้อ 2 · rate limit ที่ worker ทุกตัวใช้ร่วมกันคือคอขวด (US-GAP W19–W21) ⇒ เจอเมื่อไหร่หาร N ครึ่ง re-run เฉพาะที่ล้ม` · บรรทัด 36 ลบวลี `sequential + push รายตัว (ข้อ 4) ทำให้ blast radius = 1 หุ้นอยู่แล้ว ·` · บรรทัด 42 `เหตุผล per-wave เดิม … หมดไปตั้งแต่บังคับ **sequential**` → `เหตุผล per-wave เดิม … ไม่มีในโหมดทีละตัว (โหมดขนานดู §5 ข้อ 2)`

- [ ] **Step 3: §5 (C04 C11 S10)** — บรรทัด 47 `(sequential ในตัว script แล้ว)` → `(script บังคับ 1 หุ้น/run)` · บรรทัด 59–60 แทน `⇒ **ไม่ pin = ได้ Opus 5 โดยไม่ตั้งใจ** (…)` ด้วย `⇒ **ไม่ pin = ไม่รู้ว่าได้อะไร** (วัด 8 ส.ค. 69 Opus · 11 ก.ย. 69 Sonnet)` · ข้อ 1 ของ "เงื่อนไขบังคับ 3 ข้อ" (`**controller pre-assign สีแบรนด์เอง** … โดยไม่มีใครจับได้`) → แทนด้วย `1. ~~pre-assign สีแบรนด์~~ — ยกเลิก: \`pick-brand.js\` เขียน \`seeds.json\` ใต้ lock แล้ว (ระยะ 0 audit) worker รันเองได้` · ข้อ 2 คงเดิม (verify/push รายแบตช์) · ข้อ 3 คงเดิม (ramp)

- [ ] **Step 4: pointer §ผิด (C13)** — `docs/price-refresh.md:3` `\`CLAUDE.md §10\`` → `\`CLAUDE.md §9\`` · `docs/templates.md:3` `\`CLAUDE.md §9\`` → `\`CLAUDE.md §10\`` · `docs/counters.md:4` `\`CLAUDE.md §8\`` → `\`CLAUDE.md §10\``

- [ ] **Step 5: ยืนยัน + Commit**

```bash
rtk proxy grep -rn "sequential\|Sonnet เป็น default ทุกชั้น\|ห้าม controller/worker เรียก advisor ตรง\|ไม่มี Opus แล้ว\|pre-assign สีแบรนด์เอง\|= Opus 5 โดยไม่ตั้งใจ" CLAUDE.md docs .claude _template | grep -v superpowers/ | wc -l
git add docs/orchestration.md docs/price-refresh.md docs/templates.md docs/counters.md
git commit -m "docs: orchestration/price-refresh/templates/counters — ลบ sequential·Sonnet ทุกชั้น·ห้าม controller เรียก advisor·pre-assign สี · pointer § ให้ถูก (C01 C03 C05 C11 C13 S06–S08 S10)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Expected: grep = `0`

### Task 19: `docs/open-items.md` — รายการค้าง 21 ข้อจาก memory มาอยู่ในรีโปพร้อมสถานะ + แก้ memory ที่ล้าสมัย (C17 S05 S14)

**Files:**
- Create: `docs/open-items.md`
- Modify (นอกรีโป — ไม่มี commit): `~/.claude/projects/-Users-somchai-s-Downloads-stock/memory/MEMORY.md` (บรรทัด fv-family · price-refresh-cron) · `…/memory/fv-family-weighting-0-4c-bis.md:15` · `…/memory/price-refresh-cron.md:18`

- [ ] **Step 1: เขียน `docs/open-items.md`** (สถานะจากแผนนี้ — ทุกข้อชี้ task/ระยะที่ปิด)

```markdown
# Open items — ของค้างของโปรเจกต์ (ย้ายจาก memory 11 ก.ย. 2569 · docs-audit §6)

> memory เป็นของ session ไม่ใช่ของโปรเจกต์ — ข้อเสนอที่อยู่แต่ใน memory เคยหาย (29 ส.ค. → ระเบิด 9 ก.ย.) · ไฟล์นี้คือที่เดียวที่บันทึกของค้าง · ปิดแล้ว = ย้ายไปตาราง "ปิดแล้ว" พร้อม commit/PR · เพิ่มใหม่ = 1 แถว ไม่เขียนย่อหน้า

## เปิดอยู่

| # | รายการ | ที่มา | ปิดใน |
|---|---|---|---|
| 1 | `%/ปี` ในประโยคสรุปหมวด 6 เป็น prose — ไม่มี warning/ตัวซ่อม | price-derived-staleness:113 | ระยะ 1 WS1 manifest (ช่อง #35b) · ระยะ 2 token |
| 2 | ป้าย marker gauge "เหมาะสม" ไม่มี gate (ICLR) | price-derived-staleness:175 | ระยะ 1 WS1 (NEITHER #49) |
| 4 | median-multiples ส่งค่าผิด 2 คลาส (สุดขั้ว · ผสมสกุล) — sanity ใน runbook แล้ว **แต่ยังไม่มี fixture test ของตัวมันเอง** | price-derived-staleness:163 | ระยะ 1 WS9 |
| 5 | W05 มองไม่เห็น "สองขาตระกูลเดียว" (WWD) | price-derived-staleness:174 | ระยะ 1 WS1/WS9 |
| 6 | การ์ด EV/Sales · EV/EBITDA · DCF ไม่มี checker | data-source-traps:258 | ระยะ 1 WS1 (NEITHER #62) |
| 7 | E41 ข้ามป้าย "P/E เฉลี่ย ~N ปี" — ป้ายอ้างช่วงยาวกว่าอายุหุ้น (GABLE) | data-source-traps:271 | ระยะ 1 WS9(a) นับคอลัมน์ FY จริง |
| 8 | `test:prep` ไม่อยู่ใน verify | data-source-traps:230 | ระยะ 1 WS8(7) |
| 9 | bad-chart ผสมฐาน gate มองไม่เห็น (E36 ผิดพร้อมกัน) | data-source-traps:69 | ระยะ 1 WS1 (52wk เป็นช่องที่ตรวจ) |
| 10 | ห้ามวาง shares ถัวเฉลี่ยลง prompt (CAMT) | data-source-traps:120 | ระยะ 1 WS9(a) ให้ prep-stock ติดป้ายแถว |
| 11 | 6 ใบสองขาตระกูลเดียว ยังไม่แก้ | fv-family-weighting:22 | ระยะ 3 WS7 fix-on-touch (ลิสต์ในไฟล์ memory) |
| 13 | BBL ช่องสรุป "+2.1% (เกือบเต็มมูลค่า)" เครื่องหมาย/คำขัดกัน | price-refresh-cron:47 | ระยะ 1 WS6 (D: cron เป็นเจ้าของคำบอกทิศ) |
| 14 | `stock-meta.roe` ต้อง null เมื่อขาดทุน (OKJ) — postcheck เตือนแล้ว ยังไม่มี gate | bulk-stock-analysis-workflow:81 | ระยะ 1 WS1 |
| 15 | คำขอคำศัพท์ 49 รายการใน `tags.json.requests` รอเจ้าของ | tag-system-2026-08:19 | เจ้าของรีวิว |
| 16 | `stock-ai.dotent.workers.dev` ยังเปิด (`workers_dev=true` ห้ามลบ) traffic ไม่ cache | workers-dev-cache-inert:21 | ไม่ทำ (บันทึกไว้) |
| 17 | ไม่มี `x-cache` header — วินิจฉัย cache จากเวลาอย่างเดียว | workers-dev-cache-inert:20 | ไม่ทำ (บันทึกไว้) |
| 18 | เส้นทาง `analyze-wave` (Workflow) inject CLAUDE.md ไหม · default model ทางนี้ | ai-model-stamping:20 | **Task 20** |
| 19 | W06 ยิง 553/908 (61%) ก่อน 17 ส.ค. — คำบอกทิศต้องคน · ตอนนี้เหลือ 51 | data-source-traps:166 | ระยะ 1 WS6 (D) |
| 20 | ~23 ใบ EPS ค้าง >2% (HSY SNNP COP NUE CF …) | data-source-traps:153 | ระยะ 3 WS7 ตามปฏิทินงบ (WS6 trigger) |

## ปิดแล้ว (ระยะ 0)

| # | รายการ | ปิดโดย |
|---|---|---|
| 3 | controller ต้อง diff เป้า/52wk/ปันผล/P-BV กับ prep ก่อน dispatch — อยู่แต่ใน memory | `npm run queue -- prep` (Task 12) |
| 12 | MEMORY.md บอกว่าเคส MC ใน quality-gate.md ผิด ทั้งที่แก้แล้ว | Task 19 Step 2 (memory) |
| 21 | fixture ของ self-test/update-prices-test ผูกกับ BBL/AAPL จริง | Task 1–2 (PR #A) |
```

- [ ] **Step 2: แก้ memory (นอกรีโป — แจ้งเจ้าของในสรุป PR)**
  - `MEMORY.md` บรรทัด `[FV family weighting 0.4c-bis]` — ลบวลี `★ เคส MC ใน quality-gate.md เขียนผิด (฿12.84 ไม่ใช่ ฿13.29)` → แทนด้วย `เคส MC ใน quality-gate.md แก้แล้ว (฿12.84)`
  - `fv-family-weighting-0-4c-bis.md:15` — บรรทัด `★ \`docs/quality-gate.md\` **เขียนขัดกันเองตรงเคส MC**` → `เคส MC ใน docs/quality-gate.md:103–104 แก้เป็น ฿12.84 แล้ว (มีหมายเหตุห้ามย้อน)`
  - `MEMORY.md` บรรทัด `[Price-refresh cron]` — `verify 11 ขั้น — self-test = ขั้น 4` → `verify 14 ขั้น (รายการใน CLAUDE.md §8 · queue-test ขั้น 4 · self-test ขั้น 7)` · `price-refresh-cron.md:18` ทำนองเดียวกัน
  - `MEMORY.md` บรรทัด `[Bulk stock analysis workflow]` — เติมท้าย `; ★ ระยะ 0 audit (ก.ย. 69): กฎ "controller pre-patch ทั้งชุด/pre-assign สี/ห้าม worker รัน update-prices" ถูกแทนด้วย lock (tools/lockfile.js) + runbook npm run queue — ดู docs/open-items.md`

- [ ] **Step 3: Commit**

```bash
git add docs/open-items.md
git commit -m "docs: open-items.md — ของค้าง 21 ข้อจาก memory มาอยู่ในรีโปพร้อมสถานะ/ระยะที่ปิด (WS8 ข้อ 5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 20: probe เส้นทาง `analyze-wave` — inject CLAUDE.md ไหม · default model (WS8 ข้อ 6 · open-item #18)

**Files:**
- Modify: `docs/open-items.md` (แถว #18 → ปิดแล้ว พร้อมผล) · `CLAUDE.md` §3.2 บรรทัด C04 (เติมผลของเส้นทาง Workflow)

> ★ ต้องใช้ Workflow tool ซึ่ง**ต้องได้รับคำสั่งจากเจ้าของโดยตรง** ("รัน workflow analyze-wave probe") — controller ห้ามเรียกเองจากแผนนี้ · ถ้าเจ้าของไม่สั่ง ให้บันทึกใน open-items ว่า "รอเจ้าของสั่ง probe" แล้วข้าม

- [ ] **Step 1: ขอให้เจ้าของสั่ง** — ข้อความที่ต้องได้จากเจ้าของ: `รัน workflow analyze-wave probe`

- [ ] **Step 2: รัน (หลังได้คำสั่ง)** — เรียก Workflow `analyze-wave` ด้วย args (ไม่ใส่ `model` เพื่อวัด default ของเส้นทางนี้ด้วย):

```json
{ "stocks": [ { "label": "probe", "prompt": "ตอบ 3 บรรทัดเท่านั้น ห้ามอ่านไฟล์ ห้ามรันคำสั่ง ห้ามใช้ tool ใด ๆ:\n1. บรรทัด \"You are powered by the model named …\" จาก system prompt ของคุณ (คัดลอกตรง ๆ)\n2. ใน system prompt/system-reminder ของคุณ มีเนื้อหาไฟล์ CLAUDE.md ของโปรเจกต์ (ขึ้นต้น \"# Stock Analysis — Project Rules\") ไหม — ตอบ ใช่/ไม่ และถ้าใช่ให้อ้างชื่อหัวข้อ ## แรกที่เห็น\n3. มี MEMORY.md index (บรรทัดขึ้นต้น \"- [\") ไหม — ตอบ ใช่/ไม่ พร้อมจำนวนบรรทัดโดยประมาณ" } ], "effort": "low" }
```

- [ ] **Step 3: บันทึกผล** — `docs/open-items.md` ย้าย #18 ไปตาราง "ปิดแล้ว" พร้อม 3 คำตอบ + วันที่ · `CLAUDE.md` §3.2 บรรทัด C04 ต่อท้าย `· เส้นทาง analyze-wave ไม่ pin = <ผล>` · ถ้าเส้นทางนี้ **ไม่** inject CLAUDE.md ให้เติมใน preamble (Task 17 Step 1) ว่า "worker ผ่าน analyze-wave ไม่ได้ไฟล์นี้" (เปลี่ยนน้ำหนักของ role-scope)

- [ ] **Step 4: Commit + เปิด PR #D**

```bash
git add docs/open-items.md CLAUDE.md
git commit -m "docs: ผล probe เส้นทาง analyze-wave (open-item #18 · C04)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p0-d-rules
gh pr create --title "audit ระยะ 0 ส่วน D: ล้างกฎขัดกัน/ล้าสมัย · role-scope CLAUDE.md · open-items (WS8)" --body-file - <<'PRBODY'
## สรุป
- แก้ 17 คู่ขัดกัน + 16 ข้อล้าสมัย (docs-audit §1–2) — ทุกข้อ "แทน" ไม่ "เพิ่ม" · `analyze-wave` บังคับ 1 หุ้น/run ในโค้ด
- CLAUDE.md: preamble บอกว่า worker ก็ได้ไฟล์นี้ + ป้าย [controller] ที่ §3/§5/§9 · C04 "default ไม่แน่นอน ⇒ pin เสมอ" · C12 โหมดขนาน/ทีละตัว · ถอดกฎ pre-assign สี/pre-patch (lock แทนแล้ว)
- `docs/open-items.md` = ของค้าง 21 ข้อจาก memory (3 ข้อปิดในระยะ 0) · probe analyze-wave (ถ้าเจ้าของสั่ง)
- **นอกรีโป:** แก้ memory 4 จุด (C17 · จำนวนขั้น · กฎที่ lock แทน)

## ทดสอบ
- `npm run verify` 14/14 · grep คู่ขัดกันทั้ง 6 วลี = 0 (Task 15–18 Step สุดท้าย)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

---

# ส่วน E — เกณฑ์จบระยะ 0 (spec §6) — วัดแล้วบันทึก (PR #E)

สาขา: `claude/audit-p0-e-exit` (base = main หลัง merge #D)

### Task 21: วัด 4 เกณฑ์ + บันทึก `phase0-exit.md`

**Files:**
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/phase0-exit.md`
- Modify: `docs/superpowers/audit/2026-09-11-stock-analyzer/metrics.md` (§9 ใหม่: baseline → หลังระยะ 0)

- [ ] **Step 1: เกณฑ์ 1 — cron ไม่ขึ้นกับราคาของวัน (ไล่ราคา 0 fail)** — เขียนราคาสุ่ม 12 ค่าลง AAPL/BBL จริงแล้ว verify ทุกครั้ง คืนไฟล์ด้วย `git checkout --` (ห้าม stash)

```bash
cat > /tmp/sweep.sh <<'SH'
set -e
fails=0
for p in 0.5 0.7 0.85 0.95 1.0 1.05 1.15 1.3 1.5 1.8 2.2 3.0; do
  node -e "
const U=require('./tools/update-prices.js');const fs=require('fs');const {readStockMeta}=require('./tools/report-meta.js');
for(const s of ['AAPL','BBL']){const h=fs.readFileSync('reports/'+s+'.html','utf8');const px=readStockMeta(h).price*$p;
fs.writeFileSync('reports/'+s+'.html',U.patchReport(h,{newPrice:+px.toFixed(2),dateParts:{day:11,monIdx:8,yearCE:2026},chartData:null}).html)}"
  if npm run verify >/tmp/sweep-$p.log 2>&1; then echo "×$p ok"; else echo "×$p FAIL (ดู /tmp/sweep-$p.log)"; fails=$((fails+1)); fi
  git checkout -- reports/AAPL.html reports/BBL.html reports.json
done
echo "sweep fails=$fails"
SH
sh /tmp/sweep.sh 2>&1 | tail -13 && git status --short | wc -l
```
Expected: 12 บรรทัด `ok` · `sweep fails=0` · `git status` = 0 (ไม่มีไฟล์ค้าง)

- [ ] **Step 2: เกณฑ์ 2 — ขั้นที่ต้องจำ ≤5** — นับบรรทัด `N.` ในผล `manualSteps`/`prep`/`postcheck`

```bash
npm run queue -- preflight --no-patch --allow-dirty 2>&1 | sed -n '/ขั้นที่ต้องทำเอง/,$p' | grep -c "^[0-9]\."
```
Expected: ≤5 (บันทึกตัวเลขจริง) · prep/postcheck พิมพ์ ≤4 และ ≤2 ตามลำดับ (จาก Task 12/13)

- [ ] **Step 3: เกณฑ์ 3 — docs ขัดกัน 0 คู่** — grep 8 วลีจาก Task 15–18 รวมกันครั้งเดียว

```bash
rtk proxy grep -rn "sequential\|เวฟ ≤3\|Sonnet เป็น default ทุกชั้น\|ห้าม controller/worker เรียก advisor ตรง\|ไม่มี Opus แล้ว\|pre-assign สีแบรนด์เอง\|= Opus 5 โดยไม่ตั้งใจ\|52 code\|13 ขั้น\|11 ขั้น\|8 ขั้นเดิม" CLAUDE.md docs README.md .claude _template .githooks .github tools/update-prices.js | grep -v superpowers/ | wc -l
```
Expected: `0`

- [ ] **Step 4: เกณฑ์ 4 — worker ไม่ได้รับคำสั่งขัดกัน** — อ่าน CLAUDE.md ทั้งไฟล์หา "push" / "advisor" / "pick-brand" แล้วยืนยันว่าทุกจุดที่สั่งให้ทำอยู่ใต้หัวข้อ `[controller]` หรือมีวงเล็บกำกับ worker ห้าม

```bash
rtk proxy grep -n "push\|advisor\|pick-brand" CLAUDE.md | grep -v "\[controller\]\|worker ห้าม\|worker/subagent ห้าม\|ห้าม push\|ห้ามเรียก\|worker รัน pick-brand เองได้" 
```
Expected: ทุกบรรทัดที่เหลืออยู่ใน §3/§5/§9 (หัวข้อ [controller]) — ถ้ามีบรรทัดนอกนั้นที่สั่ง push/advisor โดยไม่กำกับ → แก้ใน task นี้

- [ ] **Step 5: เขียน `phase0-exit.md` + อัปเดต metrics.md §9** — ตาราง 4 เกณฑ์ (ค่าที่วัด · ผ่าน/ไม่ผ่าน · คำสั่งที่ใช้) + KPI จาก spec §7 ที่วัดได้ตอนนี้ (ขั้นที่ต้องจำ 24 → N · docs ขัดกัน 17 → 0 · fixture ผูกไฟล์จริง 2 → 0) + สิ่งที่ยังเปิด (open-items) + วันที่วัด

- [ ] **Step 6: Commit + PR #E**

```bash
git add docs/superpowers/audit/2026-09-11-stock-analyzer/phase0-exit.md docs/superpowers/audit/2026-09-11-stock-analyzer/metrics.md
git commit -m "docs(audit): ผลวัดเกณฑ์จบระยะ 0 (sweep ราคา 0 fail · ขั้นที่ต้องจำ · docs ขัดกัน 0)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -u origin claude/audit-p0-e-exit
gh pr create --title "audit ระยะ 0 ส่วน E: ผลวัดเกณฑ์จบระยะ 0" --body-file - <<'PRBODY'
ผลวัด 4 เกณฑ์จบระยะ 0 ตาม spec §6 อยู่ใน `docs/superpowers/audit/2026-09-11-stock-analyzer/phase0-exit.md` — ถ้าผ่านครบ เริ่มเขียนแผนระยะ 1 ได้

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
```

---

# แผนถัดไป (เขียนเป็นไฟล์แผนแยกหลังระยะ 0 ผ่านเกณฑ์จบ)

| แผน | เข้าเงื่อนไขเมื่อ | หัวข้องานหลัก (จาก spec §4/§6 · การตัดสินใจ A–F) |
|---|---|---|
| `…-phase1-discovery-loop.md` | PR #A–#E merge · `phase0-exit.md` ผ่าน 4 เกณฑ์ | **WS1** field manifest จาก code-audit §1.1 (68 ช่อง) → gate พิมพ์ coverage ต่อไฟล์ · NEITHER 18 → 0 · UNVERIFIED WRITE 3 → 0 (`need()` + check) · parser หมวด 6 ชุดเดียว · **WS2** (2) แยกประตู cron (ตรวจเฉพาะสิ่งที่ cron แตะ) กับประตู push · (3) กฎ "E ใหม่ = healer + quarantine" เป็น check ใน self-test · (4) เลื่อน W17/W19/W20/W16 → E (ข้อ **C(ค)**) · (6) UNVERIFIED WRITE · **WS6** ข้อ **D(ข)**: dead-band → ±5 ที่ `MOS_FLIP_DEADBAND_PP` ที่เดียว (Task 8 เตรียมไว้) · cron เป็นเจ้าของคำบอกทิศในช่องสรุปจากคลังคำคงที่ (ต้องทำช่องเป็นโครงสร้าง — ผูกกับ A) · trigger LLM ตามปฏิทินงบ/EPS ต่าง >2%/corporate action ไม่ใช่ราคา · **WS8** (3) จำนวนขั้น/รหัส/ตาราง E-W generate จาก `package.json` + `CHECKS` (self-test ตรวจ) · (4) ทุกกฎมีไฟล์เจ้าของเดียว · (7) `test:prep` เข้า verify · **WS9(a)** กับดัก vendor ที่ตรวจเชิงกลได้ (6O entity mismatch · cap vs หุ้น×ราคา · Δ SA/Yahoo · fwd EPS คนละปีงบ · FY ที่ EPS ≤0) + fixture test ของ prep-stock/median-multiples · เกณฑ์จบ: coverage พิมพ์ทุกไฟล์ · W→E ได้โดย cron ไม่ล้ม · คิว LLM/สัปดาห์ −50% |
| `…-phase2-data-layer.md` | ระยะ 1 จบ · manifest ครบ | ข้อ **A(ข)** + **B(ข)**: ตัวเลขทั้งหมด → `report-data`/`stock-meta` · skeleton/engine render ตอน build · prose ใช้ token (`{{px}}` `{{mos}}` …) · E date-gated สำหรับใบใหม่ (ห้ามพิมพ์ราคา/MOS/% ใน prose) · migrator 908 ใบ (แบบ migrate.js/annual-chg) · freeze การวิเคราะห์ใหม่ 1–2 วัน · cron/gate เทียบ JSON ไม่ใช่ regex · เกณฑ์จบ: สำเนาต่อค่า = 1 · regex ถอดค่าใน cron/gate = 0 · `--heal-derived` ไม่จำเป็น |
| `…-phase3-legacy-sweep.md` | ระยะ 2 จบ (ไม่งั้นเป็นลู่วิ่ง — spec WS7) | ข้อ **E(ข)**: เชิงกลกวาดครั้งเดียว (prose ราคาปัจจุบัน ≤786 · W15 97 · ค.ศ. 126 · footer อ่านไม่ออก 31) คัดด้วย git-history test ของ S10 · ท่า `heal → build → preserve-dates → build` · ดุลยพินิจ fix-on-touch ตามปฏิทินงบ (ขาเป้านักวิเคราะห์ 222 · สมอตาย 226 · หมวด 6 84 ใบ · ตระกูลเดียว 6 · W06 51 · EPS ค้าง ~23) · WS9(b) · เกณฑ์จบ: prose ค้าง 0 · warning 0 · ใบ >90 วัน = 0 ตามนโยบาย |

---

## Self-review (ทำแล้วก่อน commit แผน)

- **Spec coverage ระยะ 0 (§6 แถว "0 · หยุดเลือด"):** WS5 v1 preflight/prep/postcheck/ship → Task 9–14 ✓ · WS3 → Task 1–2 ✓ · WS2 (1) quarantine → Task 7 ✓ · (5) try/catch → Task 3 ✓ · (7) ปิด issue จากรันมือ → Task 14 ✓ · WS8 (1) 17+16 → Task 15–18 ✓ · (2) role-scope → Task 17 ✓ · WS4 → Task 4–6 ✓ · WS8 (6) probe → Task 20 ✓ · เกณฑ์จบ 4 ข้อ → Task 21 ✓ · เพิ่มจากระยะ 1 (ระบุแล้ว): Task 8 (dead-band แหล่งเดียว) · Task 19 (open-items)
- **ไม่ได้ทำในระยะ 0 (ตั้งใจ · อยู่ตารางแผนถัดไป):** WS2 (2)(3)(4)(6) · WS1 · WS6 ±5/ไม่ส่ง LLM · WS8 (3)(4)(7) · WS9 · WS7
- **Placeholder scan:** ไม่มี TBD/TODO · ทุก step ที่แก้โค้ดมีโค้ด · ค่าที่ต้องวัดตอนรัน (วันที่ราคาใน fixture · ผล probe · ตัวเลขเกณฑ์จบ) ระบุคำสั่งวัดและที่บันทึก
- **ชื่อ/ลายเซ็นข้าม task:** `FX.{AAPL,BBL,PATH,TODAY}` (T1) ← T2,T3,T7,T12 · `checkFile` (T3) ← T7 ผ่าน `checkHtml`+`expandReport` lazy · `withLock/writeJsonAtomic` (T4) ← T5,T6 · `commitFlags` (T5) · `gateAfterPatch` (T7) · `MOS_FLIP_DEADBAND_PP` export (T8) · `sh.run/must/ROOT` · `state.load/save/update/PREP_DIR` · `footerDate/ageDays/todayBangkok` · `usSessionOpen/setSessionOpen` · `bucketOf/triage/prePatchList` (T10) ← T11–T14 · `patchTargets/renderTable/manualSteps/plan/loadFlags` (T11) · `parseVendor/snapshotDiff/assemblePrompt/extraBlock/hardStock/medianBlock` (T12) ต้อง export `report` จาก median-multiples · `findOldPrice/checkMeta/postcheck` (T13) · `commitMessage/trailer/STOCK_FILES/shipStock/shipPrepatch/status` (T14) — ตรงกันทุกจุดที่อ้าง
