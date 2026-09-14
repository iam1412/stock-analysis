# Audit ระยะ 3 — ล้างหนี้เก่า (legacy sweep) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิด residue v1→v2 เท่าที่เชิงกลพิสูจน์ได้อย่างปลอดภัย เปิดเผยส่วนที่เหลือให้เจ้าของ/ดุลยพินิจตัดสิน แก้ของค้างที่ตั้งใจไว้แต่ระยะ 2 (#26 #27 #28 #30 #32 #38) และปิดเช็คพอยต์ #33/#40 ที่เจ้าของสั่งให้ตามต่อทันที

**Architecture:** งานทั้งหมดเป็นการแก้ `tools/migrate-v2.js` (root-cause bug 3 คลาส) + `tools/queue/*.js` + `tools/gen-docs.js` + `tools/median-multiples.js` + `.github/workflows/update-prices.yml` + `test/check-reports.js` (E44 PROSE_BOUND + V2TOKENS ส่วนขยาย) ไม่มีงานสร้างระบบใหม่ — ทุก task จบด้วยเทส/เกณฑ์วัดได้ ไม่เพิ่มกฎเป็นย่อหน้า (สอดคล้องข้อจำกัดสเปก §8)

**Tech Stack:** Node ≥20.19 zero-dep, `test/check-reports.js` gate, `npm run verify` 18 ขั้น, GitHub Actions cron

**Spec:** `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md` §6 แถว "3 · ล้างหนี้เก่า", §9 ข้อ E · อ้างอิงเพิ่ม: `docs/open-items.md` (แหล่งเดียวของของค้างโปรเจกต์), `docs/superpowers/plans/2026-09-12-stock-analyzer-audit-phase2-data-layer.md` (ตาราง "แผนถัดไป"), `docs/superpowers/audit/2026-09-11-stock-analyzer/migration-v2-census.md` (residue 43 ใบ รายชื่อเต็ม)

## Global Constraints

- worktree เดิม `/Users/somchai.s/Downloads/stock/.claude/worktrees/stock-analyzer-audit-9678cd` — ห้าม cd ไป repo หลัก
- ห้าม `git stash` เปล่า — ใช้ `git stash push -u -m "<tag>"` เท่านั้น
- ห้าม push ตรง main — PR + merge เท่านั้น, base เสมอ `main`, controller เป็นคนเปิด PR เอง
- pin `model` ทุก dispatch เสมอ (ห้าม Haiku, ห้ามปล่อย default)
- worker/subagent ห้ามเรียก `advisor` ตรง, ห้าม push, ห้าม `gh pr create`, ห้าม dispatch subagent, ห้ามรัน background process
- commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` · PR body ปิดท้าย `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- เอกสารภาษาไทย วันที่ พ.ศ. · timezone Asia/Bangkok
- ห้ามแก้ `reports/`, `dist/`, `reports.json`, `price-flags.json` นอกทางที่ตั้งไว้ (`tools/migrate-v2.js --write`, `tools/preserve-dates.js`, cron) — ห้ามส่ง `--write` ให้ migrate-v2 นอกงาน migration ที่ระบุใน task
- **ทุก task ที่แก้ `tools/migrate-v2.js` ต้องรัน `--cron-diff` (grid ราคา ×0.85–×1.15) ก่อนสั่ง `--write` จริงบนไฟล์ที่แก้ — ห้ามข้าม** (มาตรฐานเดียวกับ Task 14/14a ระยะ 2)
- แก้ `reports/` เป็นชุด (Task 2–5) ต้องท่า `heal → build → preserve-dates → build` ตามข้อจำกัดสเปก §8 — ห้าม `updated` เด้งพร้อมกันหลายร้อยใบ
- **จังหวะ cron สองจุดต้องผูกไว้ชัดในใจตลอดแผนนี้ (ห้ามลืมหลัง compaction):** (a) **#40 checkpoint** = รอบ cron ตามกำหนดเดิมที่กำลังจะรันวันนี้ ~04:4x UTC (~11:45–11:53 น. ไทย 15 ก.ย. 69, ~11 ชม.จากตอนเริ่มแผนนี้) — Task 13a อ่านผลรอบนี้ (b) **#33 verification** = รอบ cron แรกหลัง Task 7 merge เวลาใหม่ ซึ่งต้องเป็น**หลัง**รอบ (a) เท่านั้น (ห้าม merge Task 7 ก่อนรอบ (a) รัน — merge cron expression ใหม่ก่อนเวลาเดิมจะทำให้ GitHub Actions อ่าน schedule ใหม่จาก default branch แล้ว**ยกเลิกรอบ (a) ทั้งรอบ** เสียข้อมูล #40 กับ refresh ของทั้งคลัง 1 วัน) — Task 7 จึงต้อง merge **หลัง** Task 13a เท่านั้น
- Task 9 (E44 PROSE_BOUND) และ Task 12 (V2TOKENS extension) แตะกลไก cron/gate ที่ #40 กำลังพิสูจน์ — **ห้าม merge สองงานนี้ก่อน Task 13a อ่านผลรอบ (a) เสร็จ** ส่วน Task 2–6, 8, 10, 11 ไม่ต้องรอ (ไม่เพิ่ม blast radius ของ cron write-path)

## ★ คำตัดสินขอบเขต (ตัดสินก่อนเริ่ม — บันทึกใน ledger ด้วย)

**สิ่งที่ระยะ 3 นี้ "ปิด" ได้จริง (มีเครื่องมือวัด):** residue v1 บางส่วนที่เชิงกลพิสูจน์ได้ (คาดการณ์ 22/43 ใบ) · #26 #27 #28 #30 #32 #38 #31 #35 · เช็คพอยต์ #33/#40 · ส่วนขยาย V2TOKENS/E44 ที่มีเกณฑ์วัดชัด

**สิ่งที่ระยะ 3 นี้ "ไม่ปิด" โดยตั้งใจ — ส่งต่อ workflow ปกติ ("เคลียร์คิว price-flags" / "วิเคราะห์ X"), ไม่ใช่ของค้างที่ทำไม่เสร็จ:**
- **เกณฑ์จบสเปก "ใบอายุ >90 วัน = 0"** — median อายุ ณ 12 ก.ย. 69 คือ 57 วัน, 391 ใบอยู่ในช่วง 61–90 วัน ⇒ ต้อง re-analyze ต่อเนื่องตลอดไป ไม่ใช่งานครั้งเดียวที่ "เสร็จ" ได้ **Ruling: ไม่ตั้ง task สำหรับข้อนี้ในแผนนี้ — รายงานเป็น residual เชิงนโยบายในสรุปท้ายให้เจ้าของ** — ต้นทุนถ้าตัดสินผิด: ถ้าเจ้าของจริง ๆ ต้องการให้ "จบ" ข้อนี้ในระยะ 3 จะต้องสั่ง re-analyze ~300+ ใบเพิ่ม ซึ่งเป็นงานคนละขนาดกับที่เหลือทั้งหมดในแผนนี้รวมกัน
- **#5 #6 #11 #20 (WS7 fix-on-touch backlog)** — ผูกกับรอบเคลียร์คิว/ปฏิทินงบของแต่ละหุ้น ปิดเมื่อหุ้นนั้นถูกแตะจริง ไม่ใช่ sweep ได้
- **#37 (แปลง prose→token 5,293 จุด/907 ใบ)** — เกิดเองทุกครั้งที่ใบถูก re-analyze (E44 บังคับอยู่แล้ว) ไม่ใช่งาน sweep ชุดเดียว
- **#24 (ปฏิทินงบไทย)** — ต้องการแหล่งข้อมูลใหม่ (SET calendar/StockAnalysis) ที่ยังไม่มีในคลัง feasibility ไม่ทราบ — นอกเส้นทางวิกฤต
- **"ลบ v1 code path ออกจาก cron/gate/manifest"** — ขึ้นกับ v1=0 ซึ่งคาดว่าจะไม่ถึง 0 จริง (21/43 ใบเป็นความขัดแย้งข้อเท็จจริงเชิงมูลค่าที่เชิงกลตัดสินไม่ได้) **Ruling: วางเป็น task มีเงื่อนไข (Task 6) ไม่ใช่ deliverable ที่สัญญา**

## ★ กฎการตัดสิน residue 43 ใบต่อคลาส (Ruling — ตัดสินก่อนมอบให้ implementer)

| คลาส | ใบ | กฎ | เหตุผล / ต้นทุนถ้าผิด |
|---|---|---|---|
| site match ≠1 (legend/vcellTgt/vcellFv/summary) | 9: FANG MPC MU · BABA STX VRT · AEM BTG · MXL | **เชิงกล — แก้ migrator แล้ว migrate** | บั๊ก parser ล้วน ไม่ใช่ข้อขัดแย้งข้อมูล ต้นทุนผิด = migrate ผิดที่ (ต่ำ, gate จับซ้ำได้ทันที) |
| %/ปี ช่องไม่เท่าเดิม | 5: ACN JMT RS SCGD SNNP | **เชิงกล — แก้ migrator scenario-parser แล้ว migrate** | จำนวนคอลัมน์เปลี่ยนต้องเป็นบั๊กการนับ ไม่ใช่ค่าจริงต่าง — verify ด้วย `--cron-diff` ก่อนเขียน |
| ค่าไม่ตรงชั้น N (f36/f50 precision) | 4: AMKR LWLG MTI TMAN | **เชิงกล — ไม่ใช่บั๊ก migrator, เป็นความละเอียดที่เพิ่มขึ้นจากสถาปัตยกรรม v2 — migrate ตรง ๆ แล้วเปิดเผย** | รูปแบบสำมะโนคือ `v1 → v2` เช่น "f50 52→51.73": **v1 คือค่าที่ผู้เขียนปัดเศษเองตอนพิมพ์ (52), v2 คือ token ที่ render จาก `values` ตรง ๆ (51.73)** — token เป็นเจ้าของค่าตามสถาปัตยกรรมระยะ 2 (มติ A) ไม่มีบั๊ก over-round ให้ตามหา ต้นทุนถ้าตีความผิด (คิดว่าเป็นบั๊ก): เสียเวลาหาบั๊กที่ไม่มีจริง |
| cron-diff v1-unstable | 4: BNY PTG THCOM WWD | **รันซ้ำเทียบเสถียรภาพ v2-vs-v2 บนกริดเดิม (ไม่ใช่ v1-vs-v2)** — เสถียร → migrate, ไม่เสถียร → คง residue พร้อมเหตุผลใหม่ | v1 เคยเป็น baseline เปรียบเทียบตอนกริดไม่นิ่ง; ตอนนี้ v2 เป็น baseline ของระบบแล้ว (ระยะ 2 merge แล้ว) ความไม่นิ่งของ v1 เดิมไม่ใช่เหตุผลที่ยังใช้ได้ต่อ |
| legend≠FV >0.5% / mFair≠FV / FV ไม่ตรงกันเอง / กรอบ FV สองที่ | 21: (16+1+2+2) COHU CTAS DTM DXCM FORM GNTX HMPRO LPLA RELX SHANG SWK TER TT VLTO VRTX WFC SAPPE PNC TEAM ALLE POET | **ห้ามเชิงกลตัดสิน — คงเป็น v1, เขียนลงตารางเปิดเผยพร้อมทั้งสองค่า ส่งเป็น fix-on-touch queue** | นี่คือความขัดแย้งข้อเท็จจริงของมูลค่าเอง (TT: legend 447 vs FV 443 — Phase 2 เคยยกให้เจ้าของแล้ว) ไม่มีทางรู้ว่าค่าไหนถูกโดยไม่เปิดแหล่งข้อมูลปฐมภูมิ — auto-pick ผิดจะพลิกข้อสรุปถูก/แพงของหุ้นนั้นเงียบ ๆ ซึ่งเป็นความเสี่ยงที่ยอมรับไม่ได้ (invariant CLAUDE.md §2: gate ตรวจความจริงไม่ได้) |

คาดการณ์ผลลัพธ์: residue หลัง task 2–5 ≈ **21/43 ใบ** (ลงจาก 43) ถ้าทุกคลาสเชิงกลผ่านจริง — ถ้าบางไฟล์ในคลาสเชิงกลกลับมีเหตุผลอื่นซ่อนอยู่ (เช่น cron-diff ไม่นิ่งจริง) residue อาจสูงกว่านี้ ให้รายงานตัวเลขจริงในสรุปท้าย ไม่ใช่ตัวเลขคาดการณ์นี้

---

### Task 1: Setup — SDD workspace + ledger + pre-flight scan

**Files:** สร้าง `.superpowers/sdd/2026-09-15-stock-analyzer-audit-phase3-legacy-sweep/progress.md`

- [ ] รัน `scripts/sdd-workspace` ของ skill `subagent-driven-development` ชี้ไฟล์แผนนี้ เพื่อสร้าง workspace
- [ ] สร้าง `progress.md` บรรทัดแรก `# SDD ledger — plan: docs/superpowers/plans/2026-09-15-stock-analyzer-audit-phase3-legacy-sweep.md`
- [ ] บันทึกตาราง pre-flight scan: task คู่ไหนแตะไฟล์เดียวกัน (Task 2/3/4 ทั้งสามแก้ `tools/migrate-v2.js` คนละฟังก์ชัน — ต้องรันตามลำดับ ไม่ขนาน), Task 8/9 แตะ `test/check-reports.js` คนละ check (แก้ conflict ด้วยการรันตามลำดับเช่นกัน)
- [ ] บันทึก branch ที่จะใช้: `claude/audit-p3-<part>` ต่อ PR (ดู Task grouping ท้ายไฟล์)

---

### Task 2: Migrator fix — "site match ≠1" (9 ใบ)

**Files:**
- Modify: `tools/migrate-v2.js` (ฟังก์ชันค้นหา site: legend / vcellTgt / vcellFv / summary — grep `REQUIRED_SITES` และฟังก์ชัน `find*Site`/`locate*` ที่เกี่ยวข้อง)
- Test: `test/migrate-v2-test.js` (ถ้ายังไม่มีไฟล์นี้ ให้สร้างตามรูปแบบ `test/*-test.js` อื่นในคลัง — ดู `test/update-prices-test.js` เป็นแบบ)

**Interfaces:**
- Consumes: `migration-v2-census.md` รายชื่อ 9 ใบ: `site legend match ≠1` → FANG MPC MU (0 match); `site vcellTgt match ≠1` → BABA STX VRT (2 match); `site vcellFv match ≠1` → AEM BTG (0 match); `site summary match ≠1` → MXL (0 match)
- Produces: migrator ที่หา site เหล่านี้เจอ = 1 ครั้งพอดีในทั้ง 9 ใบ

- [ ] **Step 1: root-cause ต่อใบ** — รัน `node tools/migrate-v2.js --dry-run FANG MPC MU BABA STX VRT AEM BTG MXL 2>&1` อ่าน error ที่แม่นยำ (migrator ควรพิมพ์ข้อความว่า site ไหนหาไม่เจอ/เจอกี่ครั้ง) แล้วเปิดไฟล์ `reports/<SYM>.html` จริงคู่กับ error เพื่อดูว่า HTML มีรูปแบบต่างจากที่ regex คาดไว้อย่างไร (ตัวอย่างที่คาดว่าจะเจอ: `match ≠1 (0)` = ไม่เจอเลย มักเป็นเพราะ markup มีช่องว่าง/attribute แทรกกลางที่ regex เดิมไม่รองรับ; `match ≠1 (2)` = เจอซ้ำเพราะมี element ที่หน้าตาเหมือนกันสองจุด (เช่น mobile+desktop duplicate) ต้องเพิ่มเงื่อนไขแยก)
- [ ] **Step 2: เขียนเทสจำลองแต่ละแพทเทิร์นที่พบ** ก่อนแก้โค้ด — ตัวอย่างโครงเทส (ปรับตามแพทเทิร์นจริงที่ Step 1 พบ):

```js
const assert = require('assert');
const { findRequiredSite } = require('../tools/migrate-v2.js');

function testFindSiteWithAttrGap() {
  const html = '<span class="legend" data-x="1">฿52.00</span>'; // ตัวอย่าง markup จริงที่ Step 1 พบว่า regex เดิมพลาด
  const hits = findRequiredSite(html, 'legend');
  assert.strictEqual(hits.length, 1, 'ต้องเจอ site legend ครั้งเดียว แม้มี attribute แทรก');
}
testFindSiteWithAttrGap();
console.log('migrate-v2 site-match tests passed');
```

- [ ] **Step 3: แก้ regex/ตัวค้นหาใน `tools/migrate-v2.js`** ให้ผ่านเทส Step 2 โดยไม่ทำ `REQUIRED_SITES`/`REQUIRED_TOKEN_SITES` เดิม (14 และ 7 ตามลำดับ) เปลี่ยนความหมาย — แก้เฉพาะความแม่นยำของการค้นหา
- [ ] **Step 4: รันเทส Step 2 ผ่าน** — `node test/migrate-v2-test.js`
- [ ] **Step 5: รัน `--cron-diff` บน 9 ใบ** — `node tools/migrate-v2.js --cron-diff FANG MPC MU BABA STX VRT AEM BTG MXL` (grid ×0.85–×1.15) ต้องไม่มี "ตก" (gate ตก/throw) — ถ้ามีใบไหนตก **อย่า migrate ใบนั้น** ทิ้งไว้เป็น residue พร้อมบันทึกเหตุผลใหม่ใน ledger
- [ ] **Step 6: `--write` เฉพาะใบที่ผ่าน Step 5** — `node tools/migrate-v2.js --write <ใบที่ผ่าน>`
- [ ] **Step 7: `npm run verify`** ต้องผ่านทั้ง 18 ขั้น (error 0)
- [ ] **Step 8: Commit** — 1 commit ต่อ fix โค้ด (`fix(migrate-v2): ...`) + 1 commit ต่อการ migrate ตามธรรมเนียมจริงของระยะ 2 (`migrate(v2): <SYMS> — site-match fix` — ดูตัวอย่าง `git log --oneline -- reports/ | grep migrate`)

**Report:** จำนวนใบที่ migrate สำเร็จจริง / residue ที่เหลือพร้อมเหตุผล

---

### Task 3: Migrator fix — "%/ปี ช่องไม่เท่าเดิม" (5 ใบ)

**Files:**
- Modify: `tools/migrate-v2.js` (scenario/`scnRet` parser — ฟังก์ชันที่ดึงตารางผลตอบแทนฉาก 3 ปี หมวด 6)
- Test: `test/migrate-v2-test.js` (ต่อจาก Task 2)

**Interfaces:**
- Consumes: ACN (v1 4 → v2 3 ช่อง) · JMT (v1 4 → v2 7) · RS (v1 0 → v2 3) · SCGD (v1 3 → v2 6) · SNNP (v1 3 → v2 6)
- Produces: จำนวนช่อง %/ปี ที่ migrate แล้วต้องเท่ากับจำนวนที่นับได้จริงในหน้า v1 ต้นฉบับ (เทียบด้วยตาด้วย ไม่ใช่แค่ gate เขียว — ตารางฉากไม่มี checker คุมจำนวนคอลัมน์)

- [ ] **Step 1: เปิด 5 ไฟล์ต้นฉบับ (ก่อนแก้ใด ๆ) เทียบ diff ที่ migrator เคยสร้าง** — ใช้ `git log --all --oneline -- reports/ACN.html | head` หา commit ก่อน migrate เดิม (ถ้าเคย dry-run ไปแล้วให้ดู log Task 14 ระยะ 2) เพื่อยืนยันจำนวนคอลัมน์จริงในหน้า v1 ปัจจุบัน (นับด้วยตา ไม่เชื่อตัวเลขในตารางสำมะโนอย่างเดียว เพราะมันมาจากรันจริงที่อาจมีบั๊กเดียวกัน)
- [ ] **Step 2: root-cause** — โฟกัสที่ "RS: 0→3" (จาก 0 คอลัมน์เป็น 3) น่าจะเป็นบั๊กคนละแบบจาก "ACN: 4→3" (คอลัมน์หาย 1) — แยกสองกรณี: (a) parser เดิมไม่เจอ pattern เลยในบางโครง HTML (RS) (b) parser เจอแต่แยกคอลัมน์ผิดจำนวน (ACN/JMT/SCGD/SNNP)
- [ ] **Step 3: เขียนเทสต่อกรณี** ตามรูปแบบ Task 2 Step 2 — ครอบทั้ง (a) และ (b)
- [ ] **Step 4: แก้ scenario parser ให้ผ่านเทส**
- [ ] **Step 5: รันเทสผ่าน**
- [ ] **Step 6: `--cron-diff` บน 5 ใบ** เช่นเดียวกับ Task 2 Step 5
- [ ] **Step 7: `--write` เฉพาะที่ผ่าน + เปิดไฟล์ v2 ที่ migrate แล้วเทียบจำนวนคอลัมน์กับต้นฉบับด้วยตาอีกครั้ง** (ย้ำ: ไม่มี checker คุมจำนวนคอลัมน์ — ต้องคนอ่าน)
- [ ] **Step 8: `npm run verify`**
- [ ] **Step 9: Commit** แยก fix/migrate เหมือน Task 2

**Report:** จำนวนใบสำเร็จ/residue คงเหลือ + ผลตรวจด้วยตา (คอลัมน์ตรงกับต้นฉบับจริงไหม)

---

### Task 4: Migrate "ค่าไม่ตรงชั้น N" — ไม่ใช่บั๊ก migrator, เป็นความละเอียดที่เพิ่มขึ้นจริง (4 ใบ)

**Files:**
- Modify: `reports/AMKR.html`, `reports/LWLG.html`, `reports/MTI.html`, `reports/TMAN.html` (ผ่าน `tools/migrate-v2.js --write` เท่านั้น — ห้ามแก้มือ)
- Create/append: บันทึกใน `docs/superpowers/audit/2026-09-11-stock-analyzer/phase3-residue-disclosure.md` (ร่วมกับ Task 6)

**Interfaces:**
- Consumes: AMKR (f50: v1=52 → v2=51.73) · LWLG (f50: v1=5.2 → v2=5.23) · MTI (f36/f50: v1=19 → v2=18.9) · TMAN (f36/f50: v1=10 → v2=10.3)
- Produces: 4 ใบ migrate เป็น v2 สำเร็จ + รายการ "ค่าที่ผู้อ่านจะเห็นเปลี่ยนเล็กน้อยหลัง migrate" เปิดเผยไว้

**Ruling (จากตาราง scoping ด้านบน):** รูปแบบสำมะโน `v1 → v2` หมายความว่า v1 (52, 5.2, 19, 10) คือค่าที่ผู้เขียนพิมพ์ปัดเศษเองตอนวิเคราะห์ ส่วน v2 (51.73, 5.23, 18.9, 10.3) คือค่าที่ token ดึงจาก `values` ตรง ๆ — **ไม่มีบั๊ก over-round ให้แก้ที่ migrator** token เป็นเจ้าของค่าตามสถาปัตยกรรม v2 (มติสเปก A) migrate ตรง ๆ ได้เลย ไม่ต้องหา root cause

- [ ] **Step 1: ยืนยันสมมติฐานก่อนลงมือ** — เปิด `reports/AMKR.html` ต้นฉบับหา f50 (ค่าที่พิมพ์จริงในหน้า = 52) เทียบกับ `values` ที่จะกลายเป็น token (51.73 จากสำมะโน) — ถ้าตรงกับที่ ruling บอกไว้ (v1=ปัดเศษเอง, v2=ค่าจริงจาก values) ไปต่อ Step 2 — **ถ้าไม่ตรง** (เช่นพบว่า values เองมีค่าอื่นที่ต่างจาก 51.73 อีก) ให้หยุด รายงานเป็น anomaly ใหม่ ไม่ใช่เดินตาม ruling นี้ต่อ
- [ ] **Step 2: `node tools/migrate-v2.js --cron-diff AMKR LWLG MTI TMAN`** (grid ×0.85–×1.15) ต้องไม่มีใบตก/throw
- [ ] **Step 3: `node tools/migrate-v2.js --write AMKR LWLG MTI TMAN`**
- [ ] **Step 4: `npm run verify`**
- [ ] **Step 5: บันทึกตาราง "ค่าที่เปลี่ยน" ต่อใบ** (v1 literal → v2 token value, ส่วนต่าง %) ไว้ให้ Task 6 รวมเข้า disclosure doc
- [ ] **Step 6: Commit** — `migrate(v2): AMKR LWLG MTI TMAN — ค่า f36/f50 เปลี่ยนจากปัดเศษ v1 เป็น values จริง (เปิดเผยใน phase3-residue-disclosure.md)`

**Report:** ยืนยัน/ปฏิเสธสมมติฐาน Step 1 ต่อใบ + ตารางค่าก่อน/หลัง

---

### Task 5: cron-diff v1-unstable — ประเมินใหม่ด้วย v2-as-baseline (4 ใบ)

**Files:**
- Modify: `tools/migrate-v2.js` (`--cron-diff` mode — เพิ่ม flag ใหม่หรือปรับ comparison ให้เทียบ v2-vs-v2 แทน v1-vs-v2 เมื่อสั่งเฉพาะใบเหล่านี้)
- Test: ใช้ script จริงรันตรง ไม่ต้อง unit test ใหม่ (เป็น diagnostic tool ไม่ใช่ transform)

**Interfaces:**
- Consumes: BNY (cron-diff v1-unstable meta:dividendYield,visible) · PTG THCOM (gate-warn:W22) · WWD (visible)
- Produces: ผลตัดสินต่อใบ — migrate ถ้า v2 เสถียรบนกริด, คง residue พร้อมเหตุผลใหม่ถ้าไม่เสถียร

- [ ] **Step 1: อ่านก่อนสร้างใหม่** — `--cron-diff` (ระยะ 2 Task 14/14a) แทบแน่นอนว่าคำนวณคอลัมน์ผลลัพธ์ฝั่ง v2 อยู่แล้วเพื่อเอาไปเทียบกับ v1 (เปิด source ของโหมดนี้ใน `tools/migrate-v2.js` อ่านก่อนเขียนโหมดใหม่) — ถ้ามีคอลัมน์ v2 อยู่แล้วให้ **อ่านผลคอลัมน์นั้นเฉพาะฝั่ง v2 โดยไม่เทียบกับ v1** แทนสร้างโหมดใหม่ทั้งดุ้น
- [ ] **Step 2: เกณฑ์ผ่านที่ถูกต้อง (ไม่ใช่ "รันซ้ำสองรอบแล้วต้องเหมือนกัน" — โค้ด deterministic รันซ้ำย่อมเหมือนกันเสมอ ไม่ใช่เทสที่มีความหมาย)** ไล่กริดราคา ×0.85–×1.15 ทีละ 0.005 (61 จุด) บน v2 draft แต่ละใบ ตรวจ 3 อย่างต่อจุด: (a) gate error = 0 (b) ไม่มี `patch-rejected`/throw (c) **sanity check ทิศทาง**: MOS ต้องขยับสวนทางกับราคาเสมอ (ราคาขึ้น → MOS ลด, ราคาลง → MOS เพิ่ม) — ถ้าจุดไหน MOS ขยับผิดทิศ หรือ error/throw เกิดขึ้น = v2 เองไม่เสถียร ไม่ใช่แค่ "ต่างจาก v1"
- [ ] **Step 3: เจาะ PTG/THCOM เป็นพิเศษ** — เหตุผลเดิมคือ `gate-warn:W22` ไม่ใช่ `visible`/`meta` เหมือน BNY/WWD ⇒ ให้ตรวจก่อนว่า W22 ที่ยิงคือ **legend≠FV แบบเดียวกับ 16 ใบในคลาสที่ห้ามเชิงกลตัดสิน** (ถ้าใช่ ต้องย้ายสองใบนี้ไปอยู่ในตารางเปิดเผยของ Task 6 แทน ไม่ใช่พยายามทำให้ผ่านที่นี่) หรือเป็นสัญญาณความไม่เสถียรของ cron path จริง (ถ้าใช่ ไปต่อ Step 2 ตามปกติ)
- [ ] **Step 4: ต่อใบที่ผ่าน Step 2 (และ Step 3 กรณี PTG/THCOM ยืนยันว่าไม่ใช่ legend≠FV)** — `--cron-diff` ปกติอีกรอบเพื่อความชัวร์ แล้ว `--write` + `npm run verify`
- [ ] **Step 5: ต่อใบที่ไม่ผ่าน** — บันทึกเหตุผลใหม่ใน ledger + คงเป็น v1 (ถ้าเป็นความไม่เสถียรจริงของ v2 ให้เปิด item ใหม่ใน `docs/open-items.md`; ถ้าเป็น legend≠FV ให้ย้ายเข้าตาราง Task 6 แทน)
- [ ] **Step 6: Commit** แยกต่อผลลัพธ์ (migrate สำเร็จ / ย้ายไปตาราง Task 6 / บั๊กใหม่ที่เปิด item)

**Report:** ต่อใบ 4 ใบ: migrate สำเร็จ หรือ residue พร้อมเหตุผลใหม่ + (ถ้ามี) open-item ใหม่ที่เปิด

---

### Task 6: เปิดเผย residue 21 ใบ + ปิด #36 แบบมีเงื่อนไข + สรุป census รอบใหม่

**Files:**
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/phase3-residue-disclosure.md`
- Modify: `docs/open-items.md` (ปิด/อัปเดต #36)
- Modify: `tools/migrate-v2.js --census` (รันซ้ำให้ block สำมะโนอัปเดตอัตโนมัติ ตามที่ออกแบบไว้แล้วใน Task 14 ระยะ 2)

**Interfaces:**
- Consumes: ผลจาก Task 2–5 (residue ที่เหลือจริงหลังพยายามเชิงกล)
- Produces: ตารางเปิดเผย 21 ใบ (หรือมากกว่าถ้า Task 2–5 มีใบตกเพิ่ม) พร้อมทั้งสองค่าที่ขัดกัน ให้เจ้าของ/ผู้วิเคราะห์รอบถัดไปตัดสิน

- [ ] **Step 1: รัน `node tools/migrate-v2.js --census`** ให้ตาราง residue อัปเดตอัตโนมัติใน `migration-v2-census.md`
- [ ] **Step 2: เขียน `phase3-residue-disclosure.md`** — ตารางต่อใบ (21 ใบ ambiguous class): ชื่อใบ, ค่า A (legend/mFair/fairLine ที่พิมพ์), ค่า B (report-data.fv/vcell), ส่วนต่าง %, คำแนะนำ "อย่าเชื่ออัตโนมัติ — ตรวจแหล่งปฐมภูมิตอน re-analyze"
- [ ] **Step 3: ตรวจนับ v1 residue จริงหลัง Task 2–5** — ถ้า = 0 (ไม่คาดว่าจะเกิด แต่ต้องเช็ค): ทำตาม #36 เดิม (`healer:'patchReport'` ไม่ใช่ `'build'`) ยก `W22` เป็น E — ถ้า > 0 (คาดว่าเป็นกรณีนี้): **ไม่ยกระดับ**, อัปเดต `docs/open-items.md` #36 ด้วยตัวเลข residue ใหม่ + อ้างอิง `phase3-residue-disclosure.md`
- [ ] **Step 4: `npm run verify`** (ถ้ามีการแก้ `test/check-reports.js` จาก Step 3)
- [ ] **Step 5: Commit + เปิด PR ส่วนนี้** (controller เปิดเอง — ดู PR grouping ท้ายไฟล์)

**Report:** ตัวเลข residue สุดท้าย, ตาราง 21+ ใบเปิดเผยครบ

---

### Task 7: #33 — เลื่อน cron schedule ให้พ้นช่วง SET เปิดตลาด

**Files:**
- Modify: `.github/workflows/update-prices.yml` (บรรทัด `cron:`)
- Modify: `docs/price-refresh.md`, `CLAUDE.md` §9 (ตัวเลขเวลาที่อ้างถึง)

**Interfaces:**
- Consumes: ประวัติ `gh run list --workflow update-prices.yml` (skew ที่วัดได้จริง — ดู Step 1)
- Produces: เวลา cron ใหม่ที่วัด worst-case skew แล้วยังอยู่หลัง US close (21:00 UTC = 4pm ET, ครอบคลุมทั้ง EDT/EST) และก่อน SET เปิด (03:00 UTC = 10:00 น. ไทย)

- [ ] **Step 1: วัด skew จริงจากประวัติ** — `rtk proxy gh run list --workflow update-prices.yml --limit 30 --json createdAt,event,status,conclusion` กรองเฉพาะ `event=="schedule"` เทียบ `createdAt` กับเวลาที่ config ตั้งไว้ (`17 0 * * *` UTC = 00:17) หา skew สูงสุดที่วัดได้ (ข้อมูลเดิมบอก 04:40–04:53 UTC = skew ~4.5 ชม. — ยืนยันด้วยข้อมูลจริง ไม่ใช่ตัวเลขเก่า)
- [ ] **Step 2: คำนวณเวลาตั้งค่าใหม่** — เผื่อ worst-case skew (ปัดขึ้นจากที่วัดได้ Step 1 อย่างน้อย 1 ชม.) ต้องยังจบ "เวลาไทยตั้งค่า" อยู่หลัง 21:00 UTC (04:00 น. ไทย) และก่อน 03:00 UTC (10:00 น. ไทย) — เช่นถ้า skew วัดได้ 4.5 ชม. ตั้งค่า config ที่ ~21:30–22:00 UTC เพื่อให้รันจริงตกอยู่ในช่วงปลอดภัย
- [ ] **Step 3: แก้ `cron:` ใน workflow file**
- [ ] **Step 4: อัปเดตเอกสาร** `docs/price-refresh.md` และ `CLAUDE.md` §9 ("07:17 น. ไทย" → เวลาใหม่ + หมายเหตุ skew ที่วัดจริง)
- [ ] **Step 5: ⛔ ห้าม merge PR นี้ก่อน Task 13a อ่านผลรอบ #40 (วันนี้ ~11:45–11:53 น. ไทย) เสร็จ** — merge cron expression ใหม่ก่อนรอบเดิมรันจะทำให้ GitHub Actions ยกเลิกรอบเดิมทั้งรอบ (อ่าน schedule จาก default branch ตอน trigger) เสียข้อมูล #40 + refresh ทั้งคลัง 1 วัน — เปิด PR ได้ทันที แต่ merge หลัง Task 13a เท่านั้น
- [ ] **Step 6: หลัง Task 13a เสร็จ — merge เอง อัตโนมัติ** (#33 มีคำสั่งเจ้าของชัดแล้วใน open-items "ต้องตามต่อทันที" — ไม่ต้องหยุดรอเจ้าของ) รายงานตัวเลข skew ที่วัดได้จริงไว้ใน PR body และในสรุปท้ายให้เจ้าของเห็นย้อนหลัง

**Report:** skew ที่วัดได้จริง (ไม่ใช่ของเดิม) + เวลาที่ตั้งใหม่ + เหตุผลว่าทำไมปลอดภัยทั้ง EDT/EST + เวลา merge จริง (ต้องหลัง Task 13a)

---

### Task 8: #38 — ขยาย FOOTER_RE (careful, task ของตัวเอง)

**Files:**
- Modify: `tools/queue/footer-date.js` (หรือไฟล์ที่เก็บ `FOOTER_RE` จริง — grep หาตำแหน่งนิยาม)
- Modify: `test/check-reports.js` (W24 — ผลกระทบต่อ bucket)
- Test: เพิ่มเคสใน `test/self-test.js` สำหรับ footer แบบเดือนล้วน (ไม่มีวันที่) และแบบช่วงวันที่

**Interfaces:**
- Consumes: 12 ใบจาก #38 ที่ footer อ่านไม่ได้ตอนนี้ — 11 v2 (AMATAV AMZN CHD CI FNF ILM MFEC PPG SABINA TKN TOST) + 1 v1 (MU)
- Produces: `FOOTER_RE` ที่ parse ได้ครบ 12 ใบ โดยไม่เปลี่ยนพฤติกรรมของใบที่ parse ได้อยู่แล้ว (908−12 ใบ)

- [ ] **Step 1: จัดกลุ่มรูปแบบ footer ที่อ่านไม่ได้** — จากข้อความจริงใน #38: เดือนล้วนไม่มีวัน ("ข้อมูล ณ มกราคม 2569"), ช่วงวันที่ข้ามเดือน/ปี ("31 ก.ค. – 2 ส.ค. 2026", "24 มิ.ย.–13 ส.ค. 2026"), เดือนย่อภาษาไทยมีจุด ("เม.ย. 2569")
- [ ] **Step 2: ตัดสินกฎ "เดือนล้วน" ใช้วันไหน** — **Ruling: ใช้วันที่ 1 ของเดือนนั้น** (ระมัดระวัง = ทำให้ดูเก่ากว่าความเป็นจริงเล็กน้อย ไม่ใช่ใหม่กว่า — ปลอดภัยกว่าเมื่อใช้ตัดสิน staleness 45/120 วัน) เหตุผล: ป้องกัน false-fresh ที่จะทำให้ระบบข้ามใบที่ควรถูก flag ให้ re-analyze
- [ ] **Step 3: เขียนเทสต่อรูปแบบ** ใน `test/self-test.js` ก่อนแก้ regex (ตามรูปแบบ TDD ของไฟล์นี้)
- [ ] **Step 4: แก้ `FOOTER_RE`** ให้ผ่านเทสใหม่ทั้งหมด โดยรันเทสเดิมทั้งไฟล์ผ่านด้วย (กัน regression กับ 896 ใบที่ parse ได้อยู่แล้ว)
- [ ] **Step 5: ตรวจผลกระทบต่อ preflight bucket** — รัน `npm run queue -- preflight --dry-run` (หรือ mode อ่านอย่างเดียวที่มีอยู่) เทียบ bucket ของ 12 ใบนี้ก่อน/หลัง (ตามคำเตือนใน #38: "12 ใบนี้จะพลิกจากอ่านไม่ออกเป็นอ่านออกและเก่า")
- [ ] **Step 6: `npm run verify`**
- [ ] **Step 7: Commit + เปิด PR** — สรุปการเปลี่ยน bucket ของ 12 ใบให้เจ้าของเห็นก่อน merge (ผลกระทบต่อคิวจริง)

**Report:** 12 ใบ parse ได้หมดไหม + bucket เปลี่ยนอย่างไรต่อใบ

---

### Task 9: #1 — เพิ่มแพทเทิร์น %/ปี เข้า E44 PROSE_BOUND (วัดคลังก่อนเปิดจริง)

**Files:**
- Modify: `tools/report-values.js` (`RV.PROSE_BOUND`)
- Test: `test/self-test.js` (เคสมิวเทชันของแพทเทิร์นใหม่)

**Interfaces:**
- Consumes: 6 แพทเทิร์นเดิม (`mosZone`, `mosZoneRev`, `px`, `fv`, `mos`, `tgt`) — เพิ่มแพทเทิร์นที่ 7 สำหรับ `%/ปี` (CAGR ของฉาก 3 ปี)
- Produces: `RV.proseBoundHits` วัดจำนวนจุดที่แพทเทิร์นใหม่จะยิงทั้งคลัง **ก่อน** เปิดเป็น E จริง (บทเรียน W18 — ห้ามเปิดเป็น error โดยไม่วัดคลังก่อน)

- [ ] **Step 1: เขียนแพทเทิร์น `%/ปี` เป็นชั้น "may-point-to-many" (exact-match เท่านั้น) — ห้ามเป็นชั้น "owning" ที่ยิงทุกครั้ง** ดูโครงสร้าง 2 ชั้นเดิมใน `PROSE_BOUND` (`mosZone`/`px` เป็น owning ยิงเสมอ · `fv`/`mos20`/`mos30`/`analystTgt` เป็น may-point-to-many ยิงเฉพาะค่าตรงเป๊ะ) — `%/ปี` ต้องอยู่กลุ่มหลัง เพราะป้าย "%/ปี" ใช้ซ้ำกับปันผล%/อัตราเติบโตสมมติฐานที่ไม่ผูกราคาด้วย ยิงแบบ owning จะ false-positive ใส่ตัวเลขที่ถูกต้องอยู่แล้ว — ยิงเฉพาะเมื่อค่าตรงกับ `values.scnRet` CAGR ของฉากนั้นเป๊ะเท่านั้น
- [ ] **Step 2: รัน `RV.proseBoundHits` วัดทั้งคลัง 908 ใบแบบ dry-run** (ไม่เปิด E44 จริง) — นับจุดที่จะยิง
- [ ] **Step 3: ตัดสินจากตัวเลข Step 2** — จำ: `E44` เป็น date-gated (`RV.PROSE_TOKEN_SINCE`) ⇒ การวัดคลัง 908 ใบทั้งหมดเป็นข้อมูล**เชิงบอกภาระงาน fix-on-touch ในอนาคต**เท่านั้น ไม่ใช่ตัวชี้ false-positive โดยตรง (ใบเก่าก่อนวันตัดไม่มีทางโดน E44 ไม่ว่าจำนวนจุดจะเท่าไหร่) — สิ่งที่ต้องเช็คจริงคือแพทเทิร์นยิง**เฉพาะจุดที่ตรงกับ `values.scnRet` CAGR เป๊ะ**ไม่ใช่ทุกที่ที่มีคำว่า "%/ปี" (verify ด้วยการสุ่มอ่าน 15–20 จุดที่ยิง) ถ้าสุ่มอ่านแล้วแม่นทุกจุด **Ruling: เปิดแพทเทิร์นนี้เป็นส่วนหนึ่งของ E44 ทันที** เพราะกลไก fix-on-touch เดียวกันรองรับได้อยู่แล้ว — ถ้าสุ่มอ่านเจอ false-positive (ยิงใส่ปันผล%/อัตราเติบโตที่ไม่ผูกราคา) **ให้หยุด ไม่เปิด แล้วบันทึกเหตุผลใน ledger + คง #1 เป็น open item ต่อ**
- [ ] **Step 4: ถ้าเปิด — เพิ่ม healer `proseTokensIfNew` ให้รู้จักแพทเทิร์นใหม่ด้วย** (ต้อง sync ทั้งสองจุดตามที่ #1 ระบุว่า "E44 และ healer proseTokens มองไม่เห็นจุดนี้" — แก้พร้อมกันทั้งคู่ ห้ามแก้แค่ checker)
- [ ] **Step 5: เขียนเคสมิวเทชันใน `test/self-test.js`**
- [ ] **Step 6: `npm run verify`**
- [ ] **Step 7: Commit + เปิด PR**

**Report:** จำนวนจุดที่วัดได้ทั้งคลัง + ตัดสินเปิด/ไม่เปิดพร้อมเหตุผล

---

### Task 10: Backlog queue/tooling — #26 #27 #28 #30 #32

**Files:**
- Modify: `tools/queue/preflight.js` (หรือไฟล์ state ที่เกี่ยวกับ synthetic age — #26)
- Modify: `tools/queue/ship.js` (guard `postcheck` — #27)
- Modify: `tools/queue/state.js` หรือไฟล์ที่มี `roundStart` (#28)
- Modify: `tools/gen-docs.js` (atomic write 5 targets — #30)
- Modify: `tools/median-multiples.js` (นับ FY column ให้ตรงกับ `fyYears` ของ `tools/fetch-fundamentals.js` — #32)

**Interfaces:**
- Consumes: ข้อความปัญหาเต็มจาก `docs/open-items.md` #26–#32 (อ่านตรงจากไฟล์ก่อนลงมือ — ห้ามเดา)
- Produces: 5 บั๊กเล็กแก้แยกกัน (แต่ dispatch เป็น batch เดียวตาม subagent-driven-development "Batch small same-shape work" — ทั้ง 5 เป็นงานแก้บั๊กเล็กจุดเดียวคนละไฟล์)

- [ ] **Step 1 (#26):** แก้ preflight ไม่ให้ synthetic-age row เสีย `model`/`prepAt`/`postcheck` เมื่อรันข้ามวันซ้ำในรอบเดียว — เขียนเทส reproduce ก่อน (จำลอง preflight สองรอบคนละวันในรอบเดียวกัน) แล้วแก้
- [ ] **Step 2 (#27):** ผูก guard `postcheck` ของ `shipStock` เข้ากับขอบเขตรอบ (`roundStart`) ไม่ให้ `postcheck:'pass'` ค้างข้ามรอบทำให้ `ship <SYM>` commit ได้โดยไม่ต้องสั่งใหม่ — เขียนเทส reproduce (ตั้ง postcheck pass รอบก่อน, เริ่มรอบใหม่, เรียก ship โดยไม่ postcheck ใหม่ ต้อง fail)
- [ ] **Step 3 (#28):** ตัดสินใจ `roundStart` ผูก `flaggedAt > prev` ต่อ — ข้อความ open-items เขียนว่า "ตั้งใจแบบระวังไว้ก่อน" **Ruling: ไม่แก้พฤติกรรม เปลี่ยนแค่ข้อความแจ้งเตือนให้ชัดขึ้น** ("ค้างจากรอบก่อน — ยังไม่นับเป็น flag ใหม่ของรอบนี้") ปิด item ด้วยเอกสาร ไม่ใช่โค้ด — เหตุผล: เปลี่ยนพฤติกรรมมีความเสี่ยงเปิดรอบซ้ำผิดจังหวะ ต้นทุนสูงกว่าประโยชน์ที่ยังไม่มีเคสจริงมายืนยัน
- [ ] **Step 4 (#30):** ทำให้ `gen-docs.js` เขียน 5 เป้าหมายแบบ atomic (เขียนไฟล์ชั่วคราวแล้ว rename แทนเขียนทับตรง) — เขียนเทส reproduce เดิม (จำลอง process ถูกขัดจังหวะกลางเขียน ไฟล์ต้องไม่ค้างครึ่งเดียว) ส่วน marker ที่ render เป็น HTML comment ที่มองเห็นได้ — **Ruling: รับสภาพตามที่ open-items ระบุไว้แล้ว ไม่แก้**
- [ ] **Step 5 (#32):** แก้ `median-multiples.js` ให้นับเฉพาะ FY ที่มี EPS(dil) จริง เหมือน `fyYears` ของ Task 24 ระยะ 1 (`tools/fetch-fundamentals.js`) แทนนับทุกคอลัมน์ FY — เขียนเทส reproduce (fixture ที่มี FY คอลัมน์ว่างบางปี ต้องนับตรงกับ `fyYears`)
- [ ] **Step 6:** รวมทุกไฟล์ที่แก้ (2,4,5 เป็นโค้ด; 1,3 มีทั้งโค้ด+เอกสาร) → `npm run verify`
- [ ] **Step 7:** อัปเดต `docs/open-items.md` ย้าย #26 #27 #28 #30 #32 ไปตาราง "ปิดแล้ว (ระยะ 3)" พร้อมอ้าง commit
- [ ] **Step 8:** Commit + เปิด PR

**Report:** ผลเทสแต่ละข้อ + รายการที่ปิด/รับสภาพ

---

### Task 11: WS9(b) เล็ก — #31 probe `--th forecast` + #35 `epsFwd===0`

**Files:**
- Modify: `tools/fetch-fundamentals.js` (`forecastLine`, เส้นทาง `--th`)
- Test: `test/prep-stock-test.js`

**Interfaces:**
- Consumes: #31 (เส้นทาง `/forecast/` แบบ `--th` ยังไม่เคย probe กับของจริง) · #35 (`epsFwd === 0` ถูกตีความเป็น "ไม่มีค่า" ทั้งที่อาจเป็น forward estimate จริงที่เท่ากับ 0)
- Produces: ยืนยันว่า `--th` ทำงานจริงหรือพัง (ถ้าพังเปิด item ใหม่) · แยกกรณี "ไม่มีข้อมูล" ออกจาก "estimate = 0 จริง" ด้วย sentinel ที่ต่างกัน (เช่น `null` vs `0`) แทนเช็ค falsy เดียว

- [ ] **Step 1 (#31):** รัน `node tools/fetch-fundamentals.js --th <หุ้นไทย 1 ตัวที่มี forward estimate>` จริง (เลือกหุ้นจาก reports/ ที่เป็น `.BK`) สังเกต error/ผลลัพธ์ — ถ้าใช้งานได้ปกติ ปิด item เฉย ๆ (ไม่ต้องแก้โค้ด) — ถ้าพัง เขียนเทส reproduce แล้วแก้
- [ ] **Step 2 (#35):** เปลี่ยน `forecastLine` ให้เช็ค `epsFwd == null` (หรือ sentinel ที่ชัดเจนว่า "vendor ไม่ส่งค่ามา") แทน `epsFwd === 0` — เขียนเทสยืนยันทั้งสองกรณี: vendor ไม่ส่ง (พิมพ์ "ไม่มี epsFwd") vs vendor ส่ง 0 จริง (พิมพ์ค่า 0)
- [ ] **Step 3:** `npm run verify` + `npm run test:prep`
- [ ] **Step 4:** อัปเดต `docs/open-items.md` ปิด #31 #35
- [ ] **Step 5:** Commit + เปิด PR

**Report:** ผล probe #31 จริง + การแยก sentinel ของ #35

---

### Task 12: V2TOKENS extension — ขยายไป FV-bound sites (carry-forward จากระยะ 2)

**Files:**
- Modify: `tools/report-values.js` (`RV.REQUIRED_TOKEN_SITES` — เพิ่ม site จาก `REQUIRED_SITES` เดิม 14 ช่องที่ยังไม่อยู่ใน 7 ช่องบังคับตอนนี้)
- Modify: `test/check-reports.js` (`V2TOKENS`)
- Test: `test/self-test.js` (มิวเทชันเคสใหม่ต่อ site ที่เพิ่ม)

**Interfaces:**
- Consumes: `REQUIRED_SITES` (migrator, 14 ช่อง กว้างกว่า) vs `REQUIRED_TOKEN_SITES` (gate, 7 ช่องตอนนี้) — ส่วนต่างคือ FV-bound sites ที่ migrator ผูก token ไว้แล้วแต่ gate ยังไม่บังคับ
- Produces: `V2TOKENS` ครอบ FV-bound sites เพิ่ม โดยไม่ทำให้ไฟล์ v2 ที่ผ่านอยู่ 865 ใบตกใหม่ (ถ้าตก = migrator ยุคก่อนไม่ได้ผูก token จริงที่ site นั้น ต้องแก้ migrator ก่อนไม่ใช่ขยาย gate ก่อน)

- [ ] **Step 1:** เทียบ `REQUIRED_SITES` (migrator) กับ `REQUIRED_TOKEN_SITES` (gate) หา field ที่อยู่ใน 14 แต่ไม่อยู่ใน 7 — list ออกมาก่อนแก้อะไร
- [ ] **Step 2:** รัน `test/check-reports.js` เพิ่ม field ใหม่ทีละตัวแบบ dry-run (ไม่ commit) บนคลัง 865 ใบ v2 ดูว่ามีใบไหนตกไหม
- [ ] **Step 3:** ต่อ field ที่ทุกใบผ่าน → เพิ่มเข้า `V2TOKENS` จริง พร้อมเทสมิวเทชันใหม่ (ตามรูปแบบ 7 เคสเดิมใน `test/self-test.js`)
- [ ] **Step 4:** ต่อ field ที่มีใบตก → **ไม่เพิ่มรอบนี้** บันทึกรายชื่อใบที่ตกไว้เป็น item ใหม่ใน `docs/open-items.md` (migrator ต้องแก้ก่อน)
- [ ] **Step 5:** `npm run verify` เต็ม 908 ใบ
- [ ] **Step 6:** Commit + เปิด PR

**Report:** field ที่ขยายสำเร็จ / field ที่ค้างพร้อมใบที่ตก

---

### Task 13a: #40/#34 checkpoint — cron รอบเดิมวันนี้ (~11:45–11:53 น. ไทย 15 ก.ย. 69, gate สำหรับ Task 7/9/12)

**Files:** ไม่มีไฟล์โค้ดที่ต้องแก้ (เป็น controller-only verification checkpoint — **ไม่ dispatch subagent**, controller ทำเอง)

**Interfaces:**
- Consumes: cron run ตามกำหนดเดิม (`17 0 * * *` UTC ตั้งไว้ แต่รันจริง ~04:4x UTC) ที่กำลังจะทำงานวันนี้ — **รอบสุดท้ายก่อน Task 7 เปลี่ยนเวลา**
- Produces: `phase3-exit.md` §1 พิสูจน์ write path จริงบน v2 865 ใบ (ไม่ใช่แค่ offline `--cron-diff`) — เป็นเงื่อนไข merge ของ Task 7 (ห้าม merge ก่อนรอบนี้จบ) และ Task 9/12 (แตะ cron/gate mechanism เดียวกัน)

- [ ] **Step 1:** ตั้ง ScheduleWakeup ให้ปลุกหลัง ~12:10 น. ไทย วันนี้ (เผื่อ buffer จากเวลารันจริงที่เคยวัด ~11:45–11:53) — ระหว่างรอ ทำ Task 1–6, 8, 10, 11 ต่อได้ตามปกติ (ไม่ต้องรอ)
- [ ] **Step 2:** `rtk proxy gh run list --workflow update-prices.yml --limit 3 --json databaseId,conclusion,createdAt` หา run ของวันนี้
- [ ] **Step 3:** ตรวจ log ของ run นั้น — นับ `✓` (patch สำเร็จ) บนไฟล์ v2, ตรวจ `patch-rejected`/`patch-failed` = เท่าไหร่ (คาดหวัง 0 หรือมีเหตุผลตรงกับ freeze rule ที่รู้จัก)
- [ ] **Step 4:** สุ่ม `git show` 5 ไฟล์ v2 ที่ถูก patch จริงในรอบนั้น ยืนยันว่ามีแค่ hunk ของ `report-data`/`stock-meta`/การ์ด literal เปลี่ยน (ไม่กระทบ prose/EPS/FV ตามสัญญา cron)
- [ ] **Step 5:** เขียนผลลง `docs/superpowers/audit/2026-09-11-stock-analyzer/phase3-exit.md` §1 (คู่กับ §5.4 เดิมของระยะ 2)
- [ ] **Step 6:** ปิด #40 ใน `docs/open-items.md` · **แจ้งสถานะ "ผ่านแล้ว — Task 7/9/12 merge ได้"**

**Report:** ผลตรวจ 4 จุดข้างบนพร้อมหลักฐาน (run id, ตัวเลข, ชื่อไฟล์ที่ตรวจ)

---

### Task 13b: #33 verification — cron รอบแรกที่เวลาใหม่ (หลัง Task 7 merge)

**Files:** ไม่มีไฟล์โค้ดที่ต้องแก้ (controller-only)

**Interfaces:**
- Consumes: cron run แรกหลัง Task 7 merge เวลาใหม่ — ถ้า Task 7 merge วันนี้หลัง Task 13a (~12:xx น. ไทย) รอบแรกที่เวลาใหม่จะเป็นรอบ **พรุ่งนี้ (16 ก.ย. 69)** ตามเวลาที่ตั้งใหม่
- Produces: ยืนยัน #33 แก้จริง — cron รันหลัง SET/US ปิดทั้งคู่ ไม่ข้ามหุ้นไทยเพราะตลาดเปิด

- [ ] **Step 1:** ตั้ง ScheduleWakeup ให้ปลุกหลังเวลา cron ใหม่ที่ Task 7 ตั้งไว้จริง + buffer ~30 นาที
- [ ] **Step 2:** `rtk proxy gh run list --workflow update-prices.yml --limit 3 --json databaseId,conclusion,createdAt` หา run แรกที่เวลาใหม่
- [ ] **Step 3:** นับจำนวน "ข้าม — ตลาดยังเปิด" ในรอบนี้ — ถ้าวันนั้นไม่ใช่วันหยุดสองตลาด ต้องเห็นหุ้นไทย (.BK) อยู่ในรายการ patch จริง ไม่ใช่ข้ามทั้งหมดแบบเดิม (230 ครั้ง/วันที่วัดไว้ก่อนแก้)
- [ ] **Step 4:** เขียนผลลง `phase3-exit.md` §2 (คู่กับ §1 จาก Task 13a)
- [ ] **Step 5:** ปิด #33 #34 ใน `docs/open-items.md`

**Report:** จำนวนหุ้นไทยที่ patch ได้จริงในรอบนี้ vs ก่อนแก้ (230 ข้าม/วัน)

---

### Task 14: Final review + phase3-exit.md + memory + close-out

**Files:**
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/phase3-exit.md` (รวม §1/§2 จาก Task 13a/13b + สรุปทุก task)
- Modify: `docs/open-items.md` (ย้ายรายการที่ปิดทั้งหมดไปตาราง "ปิดแล้ว (ระยะ 3)")
- Modify: memory `audit-phase2-2026-09.md` → เปลี่ยนชื่อ/เขียนใหม่เป็นการปิดระยะ 3 หรือสร้างไฟล์ใหม่ `audit-phase3-2026-09.md` ตามรูปแบบเดิม
- Modify: `MEMORY.md` index

- [ ] **Step 1:** whole-branch final review บนโมเดลแรงสุดที่มี (ตาม subagent-driven-development — final review ใช้โมเดลแรงกว่า task review ปกติ)
- [ ] **Step 2:** แก้ finding จาก final review (ถ้ามี) 1 รอบ + scoped re-review
- [ ] **Step 3:** เขียน `phase3-exit.md` สรุปเกณฑ์วัดได้จริงทุกข้อ (residue ก่อน/หลัง, #33 skew วัดจริง, #38 12 ใบ, #1 เปิด/ไม่เปิด, backlog #26-32 ปิดกี่ข้อ, V2TOKENS ขยายกี่ field) — **ห้ามอ้างเกณฑ์ที่ระยะนี้ไม่ได้ทำ** (เช่น "ใบอายุ>90วัน=0") เป็น "จบแล้ว"
- [ ] **Step 4:** อัปเดต `docs/open-items.md` ให้ตรงสภาพจริงทั้งหมด
- [ ] **Step 5:** เขียน memory ไฟล์ใหม่/แก้ไฟล์เดิมให้สะท้อนสถานะจบระยะ 3
- [ ] **Step 6:** ลบ workspace ของแผนนี้ (`.superpowers/sdd/2026-09-15-...`) ตามขั้นปิดของ skill subagent-driven-development — **แต่คัด ledger (`progress.md`) ทุกบรรทัดที่มีคำว่า "Ruling"/"RETRACTION"/"CORRECTION" ออกมาเก็บเป็น `phase3-rulings.txt` ก่อนลบ** (ใช้ประกอบสรุปท้ายให้เจ้าของ)
- [ ] **Step 7:** Commit สุดท้าย + เปิด PR ปิดระยะ

---

## PR Grouping (แนะนำ — ปรับได้ตามจริงถ้า task ไหนเล็กจนควรรวม)

| PR | Tasks | เหตุผลจัดกลุ่ม |
|---|---|---|
| ส่วน A | 1–5 | migrator fix + residue resolution ทั้งหมด แตะไฟล์เดียวกัน (`tools/migrate-v2.js`) ต่อเนื่องกัน |
| ส่วน B | 6, 7 | เปิดเผย residue + cron reschedule — เปิด PR ได้ทันที แต่ **Task 7 merge ต้องรอ Task 13a จบก่อน** (ดู Global Constraints) |
| ส่วน C | 8, 9 | E44/FOOTER_RE ขยาย — กระทบ gate/healer ร่วมกัน · **Task 9 merge ต้องรอ Task 13a จบก่อน** |
| ส่วน D | 10, 11 | backlog เล็กทั้งหมด (queue/gen-docs/median-multiples/fetch-fundamentals) — merge ได้ทันที ไม่ต้องรอ |
| ส่วน E | 12 | V2TOKENS extension แยกเพราะกระทบ gate เต็มคลัง · **merge ต้องรอ Task 13a จบก่อน** |
| ส่วน F | 13a, 13b, 14 | checkpoint (13a วันนี้ ~11h, gate ของ B/C/E) + checkpoint (13b พรุ่งนี้ หลัง Task 7 merge) + ปิดระยะ |

ทุก PR: controller เปิดเอง, base `main`, CI เขียวก่อน merge, อัปเดต `docs/open-items.md`/ledger ทันทีหลัง merge แต่ละ PR (ไม่รอสะสม)
