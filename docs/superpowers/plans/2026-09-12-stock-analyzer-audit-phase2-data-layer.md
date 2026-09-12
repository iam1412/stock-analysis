# แผนลงมือ audit ระบบวิเคราะห์หุ้น — ระยะ 2 "แก้ต้นตอ" (data layer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> spec: `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md` (เจ้าของเคาะ 11 ก.ย. 2569: **A(ข)** ย้ายตัวเลขเข้า data layer แล้ว build render · **B(ข)** prose ของใบใหม่ห้ามพิมพ์ตัวเลขผูกราคา = E แบบ date-gated · C(ค) · D(ข) · E(ข) · F(ข))
> ระยะ 1 merge เข้า `main` แล้ว 12 ก.ย. 2569 (PR #31–#36 · main `54bf0076`) · เกณฑ์จบระยะ 1 ผ่าน 5/5 (`docs/superpowers/audit/2026-09-11-stock-analyzer/phase1-exit.md`) · แผนระยะ 1 = `docs/superpowers/plans/2026-09-12-stock-analyzer-audit-phase1.md` · ผลสำรวจก่อนเขียนแผนนี้ = `.superpowers/sdd/2026-09-12-stock-analyzer-audit-phase1/phase2-orientation.md` (สรุปสาระที่ใช้แล้วในแผนนี้ — ไม่ต้องอ่านซ้ำ)
> แผนนี้ = **ระยะ 2 จาก 4** (spec §6 แถว "2 · แก้ต้นตอ") — ระยะ 3 (กวาดหนี้เก่า · ข้อ E) เขียนเป็นแผนแยกหลังระยะ 2 ขึ้น main (ดู §"แผนถัดไป" ท้ายไฟล์)

**Goal:** ตัวเลขที่ "ผูกกับราคา/FV" ทุกตัวในรายงานมี**สำเนาเดียว**อยู่ใน `report-data` (schema v2 · `values`) แล้ว build render ลง HTML ผ่าน token `{{rd:…}}` ⇒ cron แก้ JSON ที่เดียว · gate เทียบ JSON ไม่ใช่ regex บนสำเนา · `--heal-derived` ไม่จำเป็นบนใบ v2 · ใบใหม่ห้ามพิมพ์ราคา/FV/MOS/% ผูกราคาใน prose (E แบบ date-gated + healer)

**Architecture:** 6 ส่วน (A–F) ต่อกันเป็น PR stack แบบเดียวกับระยะ 0/1 — **A** schema v2 + ตัว render (`tools/report-values.js` · `expandReport` เติม token ก่อน `decorateReport`) ยังไม่แตะคลัง → **B** skeleton v2 + สัญญา worker (SKILL/templates/agent-prompt · `apply-edits --set` · prep เทียบ JSON↔vendor) → **C** migrator (dry-run · round-trip 2 ชั้น · census) + fixture v2 จาก fixture แช่แข็ง → **D** cron/gate **dual-mode** (v1 = ทางเดิมทุกบรรทัด · v2 = อ่าน/เขียน JSON เท่านั้น) + เทส "ทาง v2 ไม่ใช้ regex สำเนา" + E-policy `build` เป็น healer → **E** ย้ายคลัง 908 ใบเป็นแบตช์ (หยุด cron ชั่วคราว · `build → preserve-dates → build` ต่อแบตช์ · วันที่ footer/updated ไม่ขยับ · residue เป็นรายชื่อพร้อมเหตุผล) → **F** นโยบาย prose B(ข) (E44 date-gated + healer `proseTokens`) + เอกสาร + ผลวัดเกณฑ์จบ
★ **ลำดับบังคับ: D ต้อง merge เข้า main ก่อน E เริ่มเขียนคลัง** — cron รายวันบน main รัน `patchReport` ตัวปัจจุบัน ถ้าใบ v2 ขึ้น main ก่อน cron รู้จัก v2 จะได้ `patch-failed` ทั้งชุด (`need('.px')` ไม่เจอ)

**Tech Stack:** Node ≥20.19 · ไม่มี dependency ใหม่ · เทสแบบ `ok(cond, label)` ตามสไตล์ `test/*.js` · fixture แช่แข็ง `test/fixtures/` (+ `AAPL-v2.html`/`BBL-v2.html` ใหม่) · git worktree · `gh` CLI

**Spec:** `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md` §2 R1 · §4 WS1 ข้อ (4) · WS2 ข้อ 3 (E-policy) · §6 แถวระยะ 2 (เกณฑ์จบ: สำเนาต่อค่า = 1 · regex ถอดค่าจาก HTML = 0 ใน cron/gate · `--heal-derived` ไม่จำเป็นอีก) · §8 ข้อจำกัด · §9 ข้อ A(ข) B(ข)

## Global Constraints

- **Dual-mode ตลอดระยะ 2**: ไฟล์ที่ `report-data.v === 2` (มี `values`) = ทาง v2 · ไฟล์อื่น = ทาง v1 **ทุกบรรทัดเหมือนเดิม** (ห้ามแก้พฤติกรรม v1 แม้เล็กน้อย — `update-prices-test.js`/`self-test.js` ชุดเดิมต้องผ่านโดยไม่แก้ค่าคาดหวัง) · โค้ด v1 ลบทิ้งได้เมื่อ v1 ในคลัง = 0 เท่านั้น (ระยะ 3)
- **ตัวเลขใน `values` เก็บดิบ (number) ไม่เก็บสตริงที่พิมพ์แล้ว** — render รูปมาตรฐานตอน build (`fmtPrice` 2 ตำแหน่ง+comma ≥1000 · `fmtMos` เครื่องหมาย + / − (U+2212) · วันที่ พ.ศ. เดือนย่อ · Market Cap หน่วยตามสกุล) · ยอมให้ข้อความที่มองเห็นเปลี่ยน**เฉพาะรูป** (ทศนิยม/comma/เครื่องหมาย/ศักราช) ไม่ใช่ค่า
- **สำเนาเดียวใน JSON ด้วย**: v2 ห้ามมี `gauge.cur` / `gauge.fair` / `chart.fairLine` (engine ใช้ `values.px` / `fv`) · `stock-meta` ยังเป็น**กระจก**สำหรับ index (cron เขียน price/mos/upside/pe/dividendYield จากค่า derive · E30/E41/W10 ตรวจกระจกเทียบ JSON)
- **token = `{{rd:<key>}}`** (ตัวพิมพ์เล็ก มี prefix) · token ของ worker ยังเป็น `{{UPPER}}` · E13 (`\{\{\s*\w+\s*\}\}`) **ไม่** จับ `rd:` ⇒ `renderValues` ต้อง throw เองเมื่อเหลือ `{{rd:` หรือ key ไม่รู้จัก — เป็นยามตัวเดียว
- **ขอบเขต "สำเนา" ที่ย้ายในระยะ 2 = ช่องที่ค่าเป็นฟังก์ชันของราคา/FV** (รายการ `COPY_FIELDS` ใน Task 7): ทุกช่อง owner cron (f01 f02 f09–f12 f14–f22 f26 f28–f31 f34–f36) + สำเนา FV (f43–f54) · **ช่องที่ worker เขียนครั้งเดียวและมีสำเนาเดียวอยู่แล้ว** (EPS/BVPS/Beta/รายได้/กำไร/ตัวคูณใน `.mdesc`/ตัวเลขใน `.d`) **คงเป็น literal** — ไม่ใช่สำเนา ไม่ต้องย้าย · เกณฑ์จบ "regex = 0" วัดบน**รายการนี้**เท่านั้น (เทส `test/v2-path-test.js` Task 12)
- **การ์ดที่ derive จากราคา (P/E · Market Cap · P/S · ปันผล % · P/BV) เป็น token ได้เฉพาะเมื่อตัว plan เดิมตัดสินฐานได้** (`peCards`/`mcapCards`/`psCards`/`yieldPlan`/`pbvPlan` ให้ฐานเดียว) — ตัดสินไม่ได้ = คง literal (สถานะเดิม: วันนี้ cron ก็ไม่แตะอยู่แล้ว) · ใบยังเป็น v2 ได้ · **ช่องบังคับของ v2** (ต้องเป็น token ครบจึงย้าย): f01 f09 f10 f14 f15 f17 f18 f19 f43 f47 f49 f50 f52 f54 (+f12 ถ้ามี · f51/f53/f24 ถ้ามี scale)
- **การย้ายคลัง (ส่วน E) = แก้ `reports/` เป็นชุดครั้งเดียวของระยะนี้** ด้วยท่า `migrate --write --batch → build → preserve-dates → build → verify → commit` ต่อแบตช์ (≈100 ใบ · 1 commit = 1 แบตช์ ให้ `git revert` สะอาด) · migrator **ห้ามแตะ `<footer>`** — assert `footerDate(ก่อน) === footerDate(หลัง)` และ `reports.json.updated` ไม่ขยับทุกใบที่ย้าย · task อื่นห้ามแตะเนื้อหารายงาน (เทสที่ต้องแตะไฟล์จริง → `git checkout --` คืน ห้าม `git stash`)
- **หยุด cron ระหว่างย้ายคลัง**: ก่อนแบตช์แรกของส่วน E รัน `gh workflow disable update-prices.yml` · เปิดคืน `gh workflow enable update-prices.yml` ทันทีที่ PR ส่วน E merge (บันทึกใน ledger ทั้งสองครั้ง) — บทเรียน PR #33 (cron push ทับกลาง stack)
- **E-code ใหม่ต้องมาคู่ healer + เคส convergence** (self-test E-policy ระยะ 1) — ระยะ 2 เพิ่ม healer ที่รู้จัก 2 ชื่อ: `'build'` (= render จาก JSON · ใช้กับ W21/W22 เมื่อยกเป็น E) และ `'proseTokens'` (E44) · **W21/W22 ยกเป็น E เฉพาะเมื่อ v1 ในคลัง = 0** หลังส่วน E — ถ้ามี residue ให้เลื่อนไประยะ 3 (open-item) ห้ามยกทั้งที่ยังมี v1
- การเปลี่ยนโครงสร้าง (build.js / gate / cron / template / CLAUDE.md / docs) = **สรุปแล้วรอเจ้าของก่อน push** (CLAUDE.md §5) ⇒ ทุก task commit บนสาขาของส่วนนั้น เปิด PR ท้ายส่วน (A→B→C→D→E→F stack กัน · merge ด้วย **merge commit ไม่ squash**) **ห้าม push ตรงเข้า main**
- font/ดีไซน์ไม่แตะ (DESIGN.md) · ป้าย `ai-model` เก่าห้ามย้อนแก้ · ห้าม Haiku · **pin `model` ทุก Agent call** · worker/subagent ห้ามเรียก `advisor` ตรง ห้าม push
- เอกสาร = ภาษาไทย ปี พ.ศ. · เวลา = Asia/Bangkok · commit message ท้ายด้วย `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (ไม่ว่าจะเห็น attribution อื่นใน session ของตัวเอง)
- คำสั่งที่นับ/รวมข้อมูลใน Bash ต้องนำหน้าด้วย `rtk proxy` · รันทุกคำสั่งจาก root ของ worktree · ห้าม `cd` ลง `/Users/somchai.s/Downloads/stock` · ห้ามใช้ background process ใน subagent (คำสั่งยาวใช้ timeout ≤600 s ต่อครั้ง แบ่งชุด)
- **regex ที่อ่านบล็อกฝัง/ช่องสำเนาต้องมีเจ้าของเดียว** (`tools/report-meta.js` · `tools/derived-values.js` · parser-lint บังคับ) — migrator (Task 7) **ห่อ** regex เจ้าของเดิมสำหรับจุดที่มีตัวเขียนอยู่แล้ว · regex ใหม่เขียนได้เฉพาะจุดที่วันนี้มีแต่ตัวอ่าน (legend/mFair/scale/การ์ดจุดซื้อ/โซน/vcell) และต้องอยู่ใน `tools/migrate-v2.js` ที่เดียว (ใช้ครั้งเดียวแล้วเลิก)
- ทุกครั้งที่จำนวนขั้น `npm run verify` เปลี่ยน (Task 12: 17→18 — ★ แก้ 12 ก.ย. 2569 หลัง Part B final review: `report-values-test.js` ถูกย้ายเข้า verify ไปแล้วตั้งแต่ Task 5 จริง (ไม่ใช่ Task 12 ตามแผนเดิม) ⇒ verify วันนี้ = 17 ไม่ใช่ 16 · Task 12 จึงเหลือแค่เพิ่ม `v2-path-test.js` เป็นขั้นใหม่ 1 ขั้น ไม่ใช่พับ `report-values-test.js` เข้าไปด้วย ดู Task 12) ต้องแก้ `package.json` + `.githooks/pre-push` (ผ่าน `node tools/gen-docs.js`) + assertion ใน `test/queue-test.js` พร้อมกัน · `docs-test` ต้องผ่าน
- network ห้ามใช้ในทุก task (ไม่มี task ไหนต้อง fetch) — เทสทุกตัว offline

## โครงไฟล์ที่เกิด/แก้ในระยะ 2

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `tools/report-values.js` (ใหม่) | schema `values` v2 · `validateValues` · `derive` · `TOKENS` · `renderValues` · ตัว format มาตรฐาน (`fmtPrice`/`fmtBig`/`annualChg`/`mosBand` ย้ายมาจาก cron) · `PROSE_TOKEN_SINCE` | 1, 17 |
| `test/report-values-test.js` (ใหม่) | unit-test ของไฟล์บน · เข้า verify | 1 |
| `build.js` (`validateReportData` strict v2 · `expandReport` render token · `renderEngine` ใช้ values.px/fv) · `test/build-test.js` | build render จาก data | 2 |
| `_template/skeleton-{th,us}.html` (v2) · `test/skeleton-test.js` | โครงต้นแบบ v2 (token `{{rd:…}}` ในทุกช่องสำเนา · report-data เป็น JSON template) | 4 |
| `tools/apply-edits.js` (`--set/--del` JSON path) · `docs/templates.md` · `.claude/skills/stock-analyzer/SKILL.md` · `_template/agent-prompt.md` · `CLAUDE.md` §10 | สัญญา worker v2 | 5 |
| `tools/queue/prep.js` (`snapshotDiff` อ่าน values) · `test/queue-test.js` | prep เทียบ JSON↔vendor | 6 |
| `tools/migrate-v2.js` (ใหม่) · `test/migrate-v2-test.js` (ใหม่) | migrator v1→v2 dry-run/write · round-trip 2 ชั้น · census | 7, 8 |
| `test/fixtures/AAPL-v2.html` · `BBL-v2.html` · `index.js` · `README.md` | fixture v2 (ผลของ migrator บน fixture แช่แข็ง) | 9 |
| `test/check-reports.js` (`buildCtx` v2 · `V1_READ` · `ctx.source` · manifest v2) · `tools/field-manifest.js` (ฟิลด์ `v2` · f69 · N_FIELDS 71) · `test/self-test.js` (บล็อก v2 · HEALERS) | gate dual-mode | 10, 13 |
| `tools/update-prices.js` (`patchReport` ทาง v2 · `healDerived` ข้าม v2) · `test/update-prices-test.js` | cron dual-mode | 11 |
| `test/v2-path-test.js` (ใหม่) · `test/parser-lint.js` · `package.json` · `.githooks/pre-push` · `test/queue-test.js` | พิสูจน์ "ทาง v2 ไม่ใช้ regex สำเนา" · verify 18 ขั้น | 12 |
| `reports/*.html` (908) · `reports.json` · `docs/superpowers/audit/2026-09-11-stock-analyzer/migration-v2-census.md` (+`.json`) | ย้ายคลัง | 14, 15 |
| `test/check-reports.js` (W21/W22 → E ถ้า v1 = 0) · `test/self-test.js` · `docs/open-items.md` | promotion ตามเงื่อนไข | 16 |
| `test/check-reports.js` (E44) · `tools/derived-values.js` (`proseTokens`) · `tools/update-prices.js` · `test/self-test.js` · `docs/quality-gate.md` | นโยบาย prose B(ข) | 17 |
| `docs/superpowers/audit/2026-09-11-stock-analyzer/phase2-exit.md` · `metrics.md` §11 · `docs/open-items.md` · spec header | ผลวัดเกณฑ์จบ | 18 |

## Schema v2 (อ้างอิงร่วมทุก task — ค่าจริงอยู่ใน Task 1)

```jsonc
<script type="application/json" id="report-data">
{
  "v": 2,
  "fv": 195,                       // เจ้าของเดียวของ FV (เดิมมี 9 สำเนา)
  "values": {
    "px": 188,                     // cron · ราคาปิดล่าสุด (2 ตำแหน่ง)
    "priceDate": "2026-09-11",     // cron · ISO ค.ศ. เสมอ (ตัวเก็บ) · render ตาม dateEra
    "dateEra": "BE",               // worker/migrator · "BE" → "11 ก.ย. 2569" · "CE" → "11 ก.ย. 2026" — ศักราชเดิมของไฟล์ (ใบใหม่ = BE)
    "chgSuffix": "รอบปี",          // worker · "รอบปี" | "ตั้งแต่ IPO" — ตัวเลข % คิดจาก chart.data ตอน render
    "fvLow": 180, "fvHigh": 210,   // worker · กรอบ FV (null = ไม่มี)
    "analystTgt": 205,             // worker · เป้านักวิเคราะห์ (null = ไม่มี)
    "eps": 21.7,                   // worker · ฐาน EPS ของการ์ด P/E ที่ใช้ token (null = การ์ดเป็น literal)
    "shares": 1909000000,          // worker · จำนวนหุ้นทั้งหมด (หุ้น ไม่ใช่ล้าน) → Market Cap
    "revenue": 140000000000,       // worker · รายได้ TTM หน่วยเต็ม สกุลรายงาน → P/S
    "dps": 12, "bvps": 260,        // worker · → ปันผล % · P/BV
    "baseEps": 21.7,               // worker · EPS ฐานหมวด 6 (hint)
    "scenarios": [ { "tgt": 160, "div": 36 }, { "tgt": 230, "div": 36 }, { "tgt": 300, "div": 36 } ],  // bear/base/bull · div = ปันผลรวม N ปี (null = ไม่มีแถว)
    "scnBasis": { "years": 3, "divIncluded": true, "perYear": "cagr" }   // perYear: "cagr" | "linear" | null (ไม่โชว์ %/ปี)
  },
  "theme": { … 11 คีย์เดิม … },
  "chart": { "data": [...], "min": 120, "max": 240, "grid": [...], "currency": "฿", "highlight": [3, 9] },   // ★ ไม่มี fairLine
  "gauge": { "min": 120, "max": 240, "fairLabelTop": "-58px" }                                             // ★ ไม่มี cur/fair
}
</script>
```

token ที่ renderer รู้จัก (Task 1 `TOKENS`) — ตัวไหน derive จากอะไร:

| token | render | ต้องมีใน values |
|---|---|---|
| `{{rd:px}}` | `฿188.00` (สกุลจาก `stock-meta.currency`) | px |
| `{{rd:pxNum}}` | `188` (ค่าตั้งต้น `pxIn`) | px |
| `{{rd:priceDate}}` | `11 ก.ย. 2569` (BE) · `11 ก.ย. 2026` (CE) — ศักราชตาม `dateEra` ไม่ใช่ค่าคงที่ของระบบ | priceDate · dateEra |
| `{{rd:chg}}` | `▲ +12.3% (รอบปี)` — `annualChg(chart.data, '(' + chgSuffix + ')')` | chgSuffix |
| `{{rd:fv}}` `{{rd:fvLow}}` `{{rd:fvHigh}}` | `฿195.00` … | fv · fvLow · fvHigh |
| `{{rd:mos}}` | `+4%` (`fmtMos((fv−px)/fv×100)`) | — |
| `{{rd:mosClass}}` | `bad` / `ok` / `good` (`mosBand`) | — |
| `{{rd:mos20}}` `{{rd:mos30}}` | `฿156.00` / `฿136.50` (fv×0.8 / ×0.7) | — |
| `{{rd:upside}}` | `+4%` | — |
| `{{rd:analystTgt}}` `{{rd:analystPct}}` | `฿205.00` / `+9%` ((tgt−px)/px) | analystTgt |
| `{{rd:pe}}` | `8.7` (px/eps · 1 ตำแหน่ง · ไม่มี x) | eps |
| `{{rd:mcap}}` | `฿3.59 แสนล้าน` / `$3.21T` (`fmtBig`) | shares |
| `{{rd:ps}}` | `2.6` (px×shares/revenue · 1 ตำแหน่ง) | shares · revenue |
| `{{rd:yield}}` | `6.4%` (dps/px×100 · 1 ตำแหน่ง) | dps |
| `{{rd:pbv}}` | `0.72` (px/bvps · 2 ตำแหน่ง) | bvps |
| `{{rd:baseEps}}` | `฿21.70` | baseEps |
| `{{rd:scnNote}}` | ` • รวมปันผล` เมื่อ `scnBasis.divIncluded` ไม่งั้น `` | scnBasis |
| `{{rd:sc1tgt}}` … `sc3tgt` | `฿160.00` | scenarios |
| `{{rd:sc1div}}` … | `฿36.00` | scenarios[i].div |
| `{{rd:sc1ret}}` … | `+4% (+1.4%/ปี)` — total = (tgt + div·[divIncluded] − px)/px · %/ปี ตาม perYear | scenarios · scnBasis |
| `{{rd:sc1retClass}}` … | `pos` / `neg` | scenarios |

★ ตัวอย่างในตาราง = ค่าที่ `fmtMos` ปัด (≥2% → 0 ตำแหน่ง)

---

# ส่วน A — schema v2 + ตัว render (ยังไม่แตะคลัง)

สาขา `claude/audit-p2-a-renderer` จาก `main` · PR ท้ายส่วน

### Task 1: `tools/report-values.js` — schema · validate · derive · render

**Files:**
- Create: `tools/report-values.js`
- Create: `test/report-values-test.js`
- Modify: `tools/update-prices.js` (ย้าย `FLAT_PP` · `mosBand` · `fmtPrice` · `annualChg` ไปไฟล์ใหม่ แล้ว import กลับ — **ชื่อ export เดิมของ update-prices ต้องยังอยู่ครบ** เพราะ `test/check-reports.js`/เทสอื่น import `mosBand`/`fmtPrice`/`annualChg` จากที่นั่น)
- Modify: `package.json` (`"test:values": "node test/report-values-test.js"` — ยังไม่เข้า verify · Task 12 ใส่)

**Interfaces:**
- Consumes: `DV.fmtMos` · `PD.renderThaiDate(day, monIdx, yearCE, isBE, hasDay)` · `PD.THAI_MONTHS` · `RM` ไม่ต้อง
- Produces (ทุก task หลังจากนี้ใช้ชื่อเหล่านี้ตรง ๆ):
  - `CUR_SYMBOL = { USD: '$', THB: '฿' }`
  - `VALUE_KEYS` (object) · `isV2(rd)` → boolean (`rd && rd.v === 2`)
  - `validateValues(rd, sm)` → throw เมื่อผิด · คืน `rd.values`
  - `derive(rd, sm)` → object `{ cur, px, fv, mos, mosText, mosShown, mosClass, upside, mos20, mos30, chg:{text,dir,pct}, priceDate:{iso,day,monIdx,yearCE,text}, pe, mcap, ps, yield, pbv, analystPct, scenarios:[{tgt,div,total,perYear,cls}], values }`
  - `TOKENS` (map key → fn(d)) · `renderValues(html, rd, sm)` → html · throw เมื่อ key ไม่รู้จัก / เหลือ `{{rd:` / ใช้ token ที่ค่าเป็น null
  - `fmtPrice(p)` · `fmtBig(v, cur)` · `annualChg(data, suffix)` · `mosBand(mos)` · `FLAT_PP` · `isoOf({day, monIdx, yearCE})` → `'YYYY-MM-DD'` · `parseIso(iso)` → `{day, monIdx, yearCE}`
  - `COPY_TOKENS` = Object.keys(TOKENS)

- [ ] **Step 1: เขียนเทสก่อน** — `test/report-values-test.js`

```js
'use strict';
const assert = (c, m) => { n++; if (c) return; fails++; console.error('✗ ' + m); };
let n = 0, fails = 0;
const RV = require('../tools/report-values.js');

const sm = { symbol: 'BBL', currency: 'THB', price: 188, fairValue: 195, mos: 3.6, upside: 3.7, pe: 8.67, dividendYield: 6.4, roe: 7.3 };
const rd = () => ({
  v: 2, fv: 195,
  values: { px: 188, priceDate: '2026-09-11', dateEra: 'BE', chgSuffix: 'รอบปี', fvLow: 180, fvHigh: 210, analystTgt: 205, eps: 21.7,
    shares: 1909000000, revenue: 140e9, dps: 12, bvps: 260, baseEps: 21.7,
    scenarios: [{ tgt: 160, div: 36 }, { tgt: 230, div: 36 }, { tgt: 300, div: 36 }], scnBasis: { years: 3, divIncluded: true, perYear: 'cagr' } },
  theme: { accent: '#1a73e8', chgBg: 'var(--green-soft)', chgColor: '#137333' },
  chart: { data: [['ก.ย.25', 150], ['ต.ค.25', 160], ['ก.ย.26', 188]], min: 120, max: 240, grid: [150, 200], currency: '฿', highlight: [0, 2] },
  gauge: { min: 120, max: 240 },
});

// ── derive ──
{
  const d = RV.derive(rd(), sm);
  assert(d.cur === '฿', 'cur จาก stock-meta.currency');
  assert(Math.abs(d.mos - 3.59) < 0.01 && d.mosText === '+3.6%' && d.mosShown === 3.6, 'mos/mosText/mosShown ' + d.mosText);
  assert(d.mosClass === 'bad', 'mosClass bad (<10)');
  assert(d.mos20 === 156 && d.mos30 === 136.5, 'mos20/30');
  assert(d.chg.text === '▲ +25.3% (รอบปี)' && d.chg.dir === 'up', 'chg จาก chart.data: ' + d.chg.text);
  assert(d.priceDate.text === '11 ก.ย. 2569', 'priceDate พ.ศ.: ' + d.priceDate.text);
  assert(Math.abs(d.pe - 188 / 21.7) < 1e-9 && Math.abs(d.mcap - 188 * 1909e6) < 1 && Math.abs(d.yield - 12 / 188 * 100) < 1e-9 && Math.abs(d.pbv - 188 / 260) < 1e-9, 'pe/mcap/yield/pbv');
  assert(Math.abs(d.ps - 188 * 1909e6 / 140e9) < 1e-9, 'ps');
  assert(Math.abs(d.analystPct - (205 - 188) / 188 * 100) < 1e-9, 'analystPct');
  const s = d.scenarios;
  assert(s.length === 3 && Math.abs(s[0].total - ((160 + 36 - 188) / 188 * 100)) < 1e-9 && s[0].cls === 'pos', 'scenario total รวมปันผล: ' + s[0].total);
  assert(Math.abs(s[0].perYear - ((Math.pow(1 + s[0].total / 100, 1 / 3) - 1) * 100)) < 1e-9, 'perYear cagr');
}
// ── perYear linear / ไม่รวมปันผล / ไม่มี %/ปี ──
{
  const r = rd(); r.values.scnBasis = { years: 3, divIncluded: false, perYear: 'linear' };
  const s = RV.derive(r, sm).scenarios[0];
  assert(Math.abs(s.total - (160 - 188) / 188 * 100) < 1e-9 && s.cls === 'neg' && Math.abs(s.perYear - s.total / 3) < 1e-9, 'ไม่รวมปันผล + linear');
  r.values.scnBasis.perYear = null;
  assert(RV.derive(r, sm).scenarios[0].perYear === null, 'perYear null');
}
// ── TOKENS / renderValues ──
{
  const html = '<div class="px">{{rd:px}}</div> <div class="big">{{rd:mos}}</div> class="mos-verdict {{rd:mosClass}}" '
    + 'value="{{rd:pxNum}}" ราคา ณ {{rd:priceDate}} <div class="chg">{{rd:chg}}</div> {{rd:fv}} {{rd:fvLow}}–{{rd:fvHigh}} '
    + '{{rd:mos20}} {{rd:mos30}} {{rd:analystTgt}} ({{rd:analystPct}}) {{rd:pe}}x {{rd:mcap}} {{rd:ps}}x {{rd:yield}} {{rd:pbv}}x '
    + '~{{rd:baseEps}}{{rd:scnNote}} {{rd:sc1tgt}} <div class="ret {{rd:sc1retClass}}">{{rd:sc1ret}}</div> ~{{rd:sc1div}} {{rd:upside}}';
  const out = RV.renderValues(html, rd(), sm);
  assert(out.includes('<div class="px">฿188.00</div>'), 'px render: ' + out.slice(0, 40));
  assert(out.includes('<div class="big">+4%</div>') && out.includes('mos-verdict bad"'), 'mos/mosClass');
  assert(out.includes('value="188"') && out.includes('ราคา ณ 11 ก.ย. 2569'), 'pxNum/priceDate');
  assert(out.includes('▲ +25.3% (รอบปี)'), 'chg');
  assert(out.includes('฿195.00 ฿180.00–฿210.00 ฿156.00 ฿136.50 ฿205.00 (+9%)'), 'fv/กรอบ/mos20/30/analyst: ' + out);
  assert(out.includes(' 8.7x ') && out.includes('฿3.59 แสนล้าน') && out.includes(' 2.6x ') && out.includes(' 6.4% ') && out.includes(' 0.72x '), 'การ์ด derive: ' + out);
  assert(out.includes('~฿21.70 • รวมปันผล ฿160.00'), 'baseEps + scnNote + sc1tgt');
  assert(/class="ret pos">\+4% \(\+1\.4%\/ปี\)<\/div> ~฿36\.00/.test(out), 'sc1ret/class/div: ' + out);
  assert(out.includes('+3.7%'), 'upside');
  assert(!/\{\{rd:/.test(out), 'ไม่เหลือ token');
}
// ── ยาม ──
{
  let threw = '';
  try { RV.renderValues('{{rd:nope}}', rd(), sm); } catch (e) { threw = e.message; }
  assert(/ไม่รู้จัก/.test(threw), 'key ไม่รู้จัก throw: ' + threw);
  threw = '';
  const r = rd(); r.values.analystTgt = null;
  try { RV.renderValues('{{rd:analystTgt}}', r, sm); } catch (e) { threw = e.message; }
  assert(/analystTgt/.test(threw), 'token ที่ค่าเป็น null throw: ' + threw);
  threw = '';
  try { RV.renderValues('{{rd:sc1 tgt}}', rd(), sm); } catch (e) { threw = e.message; }
  assert(/เหลือ/.test(threw), 'token รูปผิด (เหลือ {{rd:) throw: ' + threw);
}
// ── validateValues ──
{
  const bad = (mut, re, label) => { const r = rd(); mut(r); let t = ''; try { RV.validateValues(r, sm); } catch (e) { t = e.message; } assert(re.test(t), label + ': ' + t); };
  RV.validateValues(rd(), sm);
  bad((r) => { r.values.bogus = 1; }, /bogus/, 'คีย์แปลกใน values');
  bad((r) => { r.values.px = '188'; }, /px/, 'px ไม่ใช่ number');
  bad((r) => { r.values.priceDate = '11 ก.ย. 2569'; }, /priceDate/, 'priceDate ไม่ใช่ ISO');
  bad((r) => { r.values.chgSuffix = 'YTD'; }, /chgSuffix/, 'chgSuffix นอกรายการ');
  bad((r) => { r.gauge.cur = 188; }, /gauge\.cur/, 'v2 ห้ามมี gauge.cur');
  bad((r) => { r.gauge.fair = 195; }, /gauge\.fair/, 'v2 ห้ามมี gauge.fair');
  bad((r) => { r.chart.fairLine = 195; }, /fairLine/, 'v2 ห้ามมี chart.fairLine');
  bad((r) => { r.values.scenarios = [{ tgt: 1 }]; }, /scenarios/, 'scenarios ต้อง 3 ฉาก');
  bad((r) => { r.values.scnBasis.perYear = 'x'; }, /perYear/, 'perYear นอกรายการ');
  bad((r) => { r.values.shares = 12; }, /shares/, 'shares ต้อง ≥ 1e5 (หุ้นทั้งบริษัท ไม่ใช่ล้านหุ้น)');
  let t = ''; try { RV.validateValues(rd(), { ...sm, currency: 'CAD' }); } catch (e) { t = e.message; }
  assert(/currency/.test(t), 'currency นอก USD/THB: ' + t);
  assert(RV.isV2(rd()) && !RV.isV2({ fv: 1 }) && !RV.isV2(null), 'isV2');
}
// ── format helpers ──
{
  assert(RV.fmtPrice(1234.5) === '1,234.50' && RV.fmtPrice(0.85) === '0.85', 'fmtPrice');
  assert(RV.fmtBig(3.21e12, '$') === '$3.21T' && RV.fmtBig(4.52e10, '$') === '$45.2B' && RV.fmtBig(8.5e8, '$') === '$850M', 'fmtBig USD: ' + RV.fmtBig(4.52e10, '$'));
  assert(RV.fmtBig(3.59e11, '฿') === '฿3.59 แสนล้าน' && RV.fmtBig(8.288e9, '฿') === '฿8.29 พันล้าน' && RV.fmtBig(1.2e12, '฿') === '฿1.20 ล้านล้าน', 'fmtBig THB: ' + RV.fmtBig(8.288e9, '฿'));
  assert(RV.isoOf({ day: 3, monIdx: 0, yearCE: 2026 }) === '2026-01-03', 'isoOf');
  const p = RV.parseIso('2026-09-11'); assert(p.day === 11 && p.monIdx === 8 && p.yearCE === 2026, 'parseIso');
  assert(RV.annualChg([['a', 100], ['b', 100.5]], 'รอบปี').text === '≈ ทรงตัว รอบปี', 'annualChg flat (FLAT_PP 0.75)');
  assert(RV.mosBand(9.9) === 'bad' && RV.mosBand(10) === 'ok' && RV.mosBand(20) === 'good', 'mosBand');
}
console.log(`report-values-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: รันให้ตก** — `node test/report-values-test.js` → `Cannot find module`

- [ ] **Step 3: เขียน `tools/report-values.js`**

```js
'use strict';
/**
 * report-values.js — ระยะ 2 (data layer · spec A(ข)) **เจ้าของเดียว** ของ:
 *   • schema `report-data.values` (v2)  • ตัวตรวจ `validateValues`  • ค่าที่ derive จากราคา/FV (`derive`)
 *   • token `{{rd:<key>}}` ที่ build render ลง HTML (`renderValues`)  • รูปแบบตัวเลขมาตรฐาน (fmtPrice/fmtBig/fmtMos/วันที่ พ.ศ.)
 * เดิมตัวเลขเดียวกันมีสำเนา 7–10 จุดใน HTML (ราคา ×7 · FV ×9 · MOS ×3) แล้ว cron ต้อง regex-replace ทีละจุด
 * ⇒ ว2: เก็บดิบใน values ที่เดียว · render ตอน build · cron แก้ JSON · gate อ่าน JSON
 * ★ ห้าม require build.js / update-prices.js / check-reports.js (กัน cycle — ทั้งสามชั้น require ไฟล์นี้)
 */
const DV = require('./derived-values.js');
const PD = require('./price-date.js');

const CUR_SYMBOL = { USD: '$', THB: '฿' };
const FLAT_PP = 0.75;        // |% รอบปี| < 0.75 → "ทรงตัว" (ย้ายจาก update-prices.js — ค่าเดิม ห้ามเปลี่ยน)
const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
const mosBand = (mos) => (mos < 10 ? 'bad' : mos < 20 ? 'ok' : 'good');   // ย้ายจาก update-prices.js (W04/agent-prompt ใช้กติกาเดียวกัน)
// format ราคาสำหรับโชว์: 2 ตำแหน่งเสมอ + comma เมื่อ ≥1000 (ย้ายจาก update-prices.js)
function fmtPrice(p) {
  const s = round(p, 2).toFixed(2);
  const [i, d] = s.split('.');
  return (Math.abs(p) >= 1000 ? Number(i).toLocaleString('en-US') : i) + '.' + d;
}
// ป้าย % รอบปี จากจุดแรก→จุดท้ายของกราฟ (ย้ายจาก update-prices.js — ข้อความ/เกณฑ์เดิมเป๊ะ)
function annualChg(data, suffix) {
  const first = data[0][1], last = data[data.length - 1][1];
  let pct = first > 0 ? (last - first) / first * 100 : null;
  if (pct == null || Math.abs(pct) < FLAT_PP) return { text: `≈ ทรงตัว ${suffix}`, dir: 'flat', pct };
  if (pct > 0) return { text: `▲ +${pct.toFixed(1)}% ${suffix}`, dir: 'up', pct };
  return { text: `▼ −${Math.abs(pct).toFixed(1)}% ${suffix}`, dir: 'down', pct };
}
// Market Cap แบบมาตรฐานต่อสกุล — เลือกหน่วยใหญ่สุดที่ ≤ ค่า · 3 หลักมีนัย (≥100 → 0 ตำแหน่ง · ≥10 → 1 · ไม่งั้น 2)
const BIG_UNITS = {
  '$': [['T', 1e12], ['B', 1e9], ['M', 1e6]],
  '฿': [[' ล้านล้าน', 1e12], [' แสนล้าน', 1e11], [' หมื่นล้าน', 1e10], [' พันล้าน', 1e9], [' ล้าน', 1e6]],
};
function fmtBig(v, cur) {
  const units = BIG_UNITS[cur] || BIG_UNITS['$'];
  const [u, sc] = units.find(([, s]) => v >= s) || units[units.length - 1];
  const n = v / sc;
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return cur + s + u;
}
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = ({ day, monIdx, yearCE }) => `${yearCE}-${pad2(monIdx + 1)}-${pad2(day)}`;
function parseIso(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso)); if (!m) return null; return { yearCE: +m[1], monIdx: +m[2] - 1, day: +m[3] }; }

const isV2 = (rd) => !!(rd && typeof rd === 'object' && rd.v === 2);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const CHG_SUFFIX = ['รอบปี', 'ตั้งแต่ IPO'];
const PER_YEAR = ['cagr', 'linear', null];
// schema ของ values — req = ต้องมี · opt = มีได้/null ได้ (token ที่อ้างค่า null จะ throw ตอน render)
const VALUE_KEYS = {
  px: { req: true, check: (v) => isNum(v) && v > 0, why: 'ต้องเป็นตัวเลข > 0' },
  priceDate: { req: true, check: (v) => !!parseIso(v), why: 'ต้องเป็น ISO "YYYY-MM-DD" (ค.ศ.)' },
  chgSuffix: { req: true, check: (v) => CHG_SUFFIX.includes(v), why: `ต้องเป็นหนึ่งใน ${JSON.stringify(CHG_SUFFIX)}` },
  fvLow: { check: (v) => isNum(v) && v > 0 }, fvHigh: { check: (v) => isNum(v) && v > 0 },
  analystTgt: { check: (v) => isNum(v) && v > 0 },
  eps: { check: isNum }, shares: { check: (v) => isNum(v) && v >= 1e5, why: 'จำนวนหุ้นทั้งบริษัท (หุ้น ไม่ใช่ล้านหุ้น) ≥ 1e5' },
  revenue: { check: (v) => isNum(v) && v > 0 }, dps: { check: (v) => isNum(v) && v >= 0 }, bvps: { check: (v) => isNum(v) && v > 0 },
  baseEps: { check: isNum },
  scenarios: { check: (v) => Array.isArray(v) && v.length === 3 && v.every((s) => s && typeof s === 'object' && isNum(s.tgt) && s.tgt > 0 && (s.div == null || (isNum(s.div) && s.div >= 0)) && Object.keys(s).every((k) => k === 'tgt' || k === 'div')), why: 'ต้องเป็น 3 ฉาก [{tgt, div|null}] (bear/base/bull)' },
  scnBasis: { check: (v) => v && typeof v === 'object' && Number.isInteger(v.years) && v.years >= 1 && v.years <= 10 && typeof v.divIncluded === 'boolean' && PER_YEAR.includes(v.perYear) && Object.keys(v).every((k) => ['years', 'divIncluded', 'perYear'].includes(k)), why: 'ต้องเป็น {years:1..10, divIncluded:boolean, perYear:"cagr"|"linear"|null}' },
};
function validateValues(rd, sm) {
  if (!isV2(rd)) throw new Error('report-data.v ต้องเป็น 2 จึงมี values');
  const v = rd.values;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('report-data.values ต้องเป็น object');
  for (const k of Object.keys(v)) if (!VALUE_KEYS[k]) throw new Error(`report-data.values.${k} ไม่อยู่ใน schema v2 (คีย์ที่รู้จัก: ${Object.keys(VALUE_KEYS).join(', ')})`);
  for (const [k, spec] of Object.entries(VALUE_KEYS)) {
    const has = v[k] != null;
    if (spec.req && !has) throw new Error(`report-data.values.${k} ต้องมี (v2)`);
    if (has && !spec.check(v[k])) throw new Error(`report-data.values.${k} ${spec.why || 'ค่าไม่ถูกต้อง'} — พบ ${JSON.stringify(v[k])}`);
  }
  if (!isNum(rd.fv) || rd.fv <= 0) throw new Error('report-data.fv ต้องเป็นตัวเลข > 0');
  if (rd.gauge && rd.gauge.cur != null) throw new Error('v2 ห้ามมี gauge.cur — engine ใช้ values.px (สำเนาเดียว)');
  if (rd.gauge && rd.gauge.fair != null) throw new Error('v2 ห้ามมี gauge.fair — engine ใช้ fv (สำเนาเดียว)');
  if (rd.chart && rd.chart.fairLine != null) throw new Error('v2 ห้ามมี chart.fairLine — engine ใช้ fv (สำเนาเดียว)');
  if (!sm || !CUR_SYMBOL[sm.currency]) throw new Error(`stock-meta.currency ต้องเป็น USD/THB (สัญลักษณ์หน้าราคา render จากตรงนี้) — พบ ${JSON.stringify(sm && sm.currency)}`);
  return v;
}
function derive(rd, sm) {
  const v = rd.values, fv = rd.fv, px = v.px, cur = CUR_SYMBOL[sm.currency];
  const mos = (fv - px) / fv * 100, upside = (fv - px) / px * 100;
  const mosText = DV.fmtMos(mos);
  const pd = parseIso(v.priceDate);
  const b = v.scnBasis || { years: 3, divIncluded: false, perYear: null };
  const scenarios = (v.scenarios || []).map((s) => {
    const total = (s.tgt + (b.divIncluded && s.div ? s.div : 0) - px) / px * 100;
    const perYear = b.perYear === 'cagr' ? (Math.pow(1 + total / 100, 1 / b.years) - 1) * 100 : b.perYear === 'linear' ? total / b.years : null;
    return { tgt: s.tgt, div: s.div == null ? null : s.div, total, perYear, cls: total >= 0 ? 'pos' : 'neg' };
  });
  return {
    cur, px, fv, mos, mosText, mosShown: parseFloat(mosText.replace('−', '-')), mosClass: mosBand(mos), upside,
    mos20: round(fv * 0.8, 2), mos30: round(fv * 0.7, 2),
    chg: annualChg(rd.chart.data, v.chgSuffix),
    priceDate: { ...pd, iso: v.priceDate, text: PD.renderThaiDate(pd.day, pd.monIdx, pd.yearCE, true) },
    pe: isNum(v.eps) && v.eps > 0 ? px / v.eps : null,
    mcap: isNum(v.shares) ? px * v.shares : null,
    ps: isNum(v.shares) && isNum(v.revenue) ? px * v.shares / v.revenue : null,
    yield: isNum(v.dps) ? v.dps / px * 100 : null,
    pbv: isNum(v.bvps) ? px / v.bvps : null,
    analystPct: isNum(v.analystTgt) ? (v.analystTgt - px) / px * 100 : null,
    scenarios, scnBasis: v.scnBasis || null, values: v,
  };
}
const need = (val, key) => { if (val == null) throw new Error(`report-data.values.${key} ต้องมีค่าเมื่อใช้ token ที่อ้างถึง`); return val; };
const money = (d, val, key) => d.cur + fmtPrice(need(val, key));
const ret = (s) => DV.fmtMos(s.total) + (s.perYear == null ? '' : ` (${DV.fmtMos(s.perYear)}/ปี)`);
const scn = (d, i) => need(d.scenarios[i], 'scenarios');
const TOKENS = {
  px: (d) => money(d, d.px, 'px'), pxNum: (d) => String(d.px), priceDate: (d) => d.priceDate.text, chg: (d) => d.chg.text,
  fv: (d) => money(d, d.fv, 'fv'), fvLow: (d) => money(d, d.values.fvLow, 'fvLow'), fvHigh: (d) => money(d, d.values.fvHigh, 'fvHigh'),
  mos: (d) => d.mosText, mosClass: (d) => d.mosClass, mos20: (d) => money(d, d.mos20, 'mos20'), mos30: (d) => money(d, d.mos30, 'mos30'),
  upside: (d) => DV.fmtMos(d.upside),
  analystTgt: (d) => money(d, d.values.analystTgt, 'analystTgt'), analystPct: (d) => DV.fmtMos(need(d.analystPct, 'analystTgt')),
  pe: (d) => need(d.pe, 'eps').toFixed(1), mcap: (d) => fmtBig(need(d.mcap, 'shares'), d.cur), ps: (d) => need(d.ps, 'shares/revenue').toFixed(1),
  yield: (d) => need(d.yield, 'dps').toFixed(1) + '%', pbv: (d) => need(d.pbv, 'bvps').toFixed(2),
  baseEps: (d) => money(d, d.values.baseEps, 'baseEps'), scnNote: (d) => (d.scnBasis && d.scnBasis.divIncluded ? ' • รวมปันผล' : ''),
};
for (const i of [0, 1, 2]) {
  TOKENS[`sc${i + 1}tgt`] = (d) => money(d, scn(d, i).tgt, `scenarios[${i}].tgt`);
  TOKENS[`sc${i + 1}div`] = (d) => money(d, scn(d, i).div, `scenarios[${i}].div`);
  TOKENS[`sc${i + 1}ret`] = (d) => ret(scn(d, i));
  TOKENS[`sc${i + 1}retClass`] = (d) => scn(d, i).cls;
}
const TOKEN_RE = /\{\{rd:([A-Za-z0-9]+)\}\}/g;
function renderValues(html, rd, sm) {
  const d = derive(rd, sm);
  const out = String(html).replace(TOKEN_RE, (m, k) => {
    const f = TOKENS[k];
    if (!f) throw new Error(`token {{rd:${k}}} ไม่รู้จัก (มี: ${Object.keys(TOKENS).join(', ')})`);
    return String(f(d));
  });
  const left = out.match(/\{\{rd:[^}]{0,40}/);
  if (left) throw new Error(`เหลือ token {{rd:…}} ที่ render ไม่ได้: ${left[0]}`);
  return out;
}
module.exports = { CUR_SYMBOL, FLAT_PP, VALUE_KEYS, CHG_SUFFIX, isV2, validateValues, derive, TOKENS, COPY_TOKENS: Object.keys(TOKENS), renderValues,
  fmtPrice, fmtBig, annualChg, mosBand, isoOf, parseIso };
```

- [ ] **Step 4: รันเทสให้ผ่าน** — `node test/report-values-test.js` → `N/N ผ่าน` · ถ้าเคส `fmtBig`/`ret` ตกเพราะการปัด ให้แก้**เทส**เฉพาะเมื่อผลลัพธ์ตรงกติกาที่หัวตารางบอก (2 ตำแหน่ง/1 ตำแหน่ง) ไม่ใช่แก้กติกา

- [ ] **Step 5: ย้ายค่าคงที่/ฟังก์ชันออกจาก cron** — ใน `tools/update-prices.js` ลบนิยาม `FLAT_PP` · `mosBand` · `fmtPrice` · `annualChg` (ค้นด้วยข้อความ `const FLAT_PP = 0.75` · `const mosBand = (mos) =>` · `function fmtPrice(p)` · `function annualChg(data, suffix)`) แล้วเติมหลัง require อื่น ๆ:

```js
const RV = require('./report-values.js');   // ระยะ 2: format/derive มาตรฐานอยู่ที่นี่ (เจ้าของเดียว) — cron ใช้ร่วมกับ build/gate
const { FLAT_PP, mosBand, fmtPrice, annualChg } = RV;
```
`module.exports` ของ update-prices **คงชื่อ `mosBand, fmtPrice, annualChg` ไว้เหมือนเดิม** (re-export) · รัน `node test/update-prices-test.js` และ `node test/check-reports.js BBL` ต้องผ่านเท่าเดิม

- [ ] **Step 6: Commit**

```bash
git add tools/report-values.js test/report-values-test.js tools/update-prices.js package.json
git commit -m "feat(data-layer): tools/report-values.js — schema values v2 · validate · derive · token {{rd:…}} · ย้าย fmtPrice/annualChg/mosBand ออกจาก cron (ระยะ 2 ส่วน A)"
```

### Task 2: `expandReport` render token จาก values · validator v2 strict · engine ใช้ values.px/fv

**Files:**
- Modify: `build.js` (`validateReportData` · `renderEngine` · `expandReport`)
- Modify: `test/build-test.js`

**Interfaces:**
- Consumes: `RV.isV2/validateValues/renderValues` (Task 1) · `RM.readStockMeta`
- Produces: `expandReport(html)` — v2: **validate → renderValues → STYLE/ENGINE** · v1: เหมือนเดิมทุกบรรทัด · export เพิ่ม `RV_SOURCE_SENTINEL`? ไม่ — ไม่มี export ใหม่

- [ ] **Step 1: เทสก่อน** — เติมท้าย `test/build-test.js` (ใช้ helper `ok` ของไฟล์นั้น · อ่านชื่อ helper จริงก่อน):

```js
// ── ระยะ 2: expandReport v2 render token จาก values ──
{
  const { expandReport } = require('../build.js');
  const rdV2 = JSON.stringify({ v: 2, fv: 195, values: { px: 188, priceDate: '2026-09-11', dateEra: 'BE', chgSuffix: 'รอบปี' },
    theme: { accent: '#1a73e8', chgBg: 'var(--green-soft)', chgColor: '#137333' },
    chart: { data: [['ก.ย.25', 150], ['ก.ย.26', 188]], min: 120, max: 240, grid: [150, 200], currency: '฿', highlight: [0, 1] }, gauge: { min: 120, max: 240 } });
  const src = (rd, body) => `<html><head><script type="application/json" id="stock-meta">{"symbol":"X","currency":"THB","price":188,"fairValue":195,"mos":3.6,"upside":3.7,"pe":null,"dividendYield":null,"roe":null}</script>\n<script type="application/json" id="report-data">${rd}</script><!--TEMPLATE:STYLE--></head><body>${body}<!--TEMPLATE:ENGINE--></body></html>`;
  const out = expandReport(src(rdV2, '<div class="px">{{rd:px}}</div><div class="big">{{rd:mos}}</div>'));
  ok(out.includes('<div class="px">฿188.00</div>') && out.includes('<div class="big">+4%</div>'), 'v2: token ใน body ถูก render จาก values');
  ok(/gpos\(188\)/.test(out) && /gpos\(195\)/.test(out) && /const FV=195\b/.test(out), 'v2: engine bake gauge cur/fair/FV จาก values.px/fv (ไม่มี gauge.cur ใน JSON)');
  ok(/const fy=ys\(195\)/.test(out), 'v2: fairLine ของกราฟ = fv');
  let t = ''; try { expandReport(src(rdV2, '<p>{{rd:nope}}</p>')); } catch (e) { t = e.message; }
  ok(/ไม่รู้จัก/.test(t), 'v2: token ไม่รู้จัก → throw: ' + t);
  t = ''; try { expandReport(src(rdV2.replace('"v":2', '"v":2,"bogus":1'), '')); } catch (e) { t = e.message; }
  ok(/bogus/.test(t), 'v2: คีย์แปลกระดับบนของ report-data → throw');
  t = ''; try { expandReport(src(rdV2.replace('"gauge":{"min":120,"max":240}', '"gauge":{"min":120,"max":240,"cur":188}'), '')); } catch (e) { t = e.message; }
  ok(/gauge\.cur/.test(t), 'v2: gauge.cur มี → throw');
  // v1 ยังเหมือนเดิม: token {{rd:…}} ในไฟล์ v1 ไม่ถูกแตะ (ไม่มี values ให้ render) และไม่ throw
  const rdV1 = JSON.stringify({ fv: 195, theme: { accent: '#1a73e8', chgBg: 'var(--green-soft)', chgColor: '#137333' },
    chart: { data: [['ก.ย.25', 150], ['ก.ย.26', 188]], min: 120, max: 240, grid: [150, 200], fairLine: 195, currency: '฿', highlight: [0, 1] }, gauge: { min: 120, max: 240, cur: 188, fair: 195 } });
  const o1 = expandReport(src(rdV1, '<div class="px">฿188.00</div>{{rd:px}}'));
  ok(o1.includes('{{rd:px}}') && /gpos\(188\)/.test(o1), 'v1: identity ของ body (token ไม่ถูก render) + engine เดิม');
}
```

- [ ] **Step 2: รันให้ตก** — `node test/build-test.js` → เคส v2 ตก

- [ ] **Step 3: แก้ `build.js`**

(ก) หัวไฟล์ (ใกล้ `const RM = require(...)`) เพิ่ม `const RV = require('./tools/report-values.js');`

(ข) `validateReportData(d)` — หลังบรรทัด `if (!d || typeof d !== 'object' || Array.isArray(d)) throw …` เพิ่ม:

```js
  // ── ระยะ 2: v2 = strict keys + values (validateValues ตรวจ values/fv/ห้าม gauge.cur ฯลฯ — ตรงนี้ตรวจแค่ "โครง") ──
  const V2 = RV.isV2(d);
  if (V2) {
    const TOP = ['v', 'fv', 'values', 'theme', 'chart', 'gauge'];
    for (const k of Object.keys(d)) if (!TOP.includes(k)) throw new Error(`report-data.${k} ไม่อยู่ใน schema v2 (คีย์ระดับบนที่รู้จัก: ${TOP.join(', ')})`);
    const CH = ['data', 'min', 'max', 'grid', 'currency', 'highlight', 'gridFmt', 'dataFmt'], GA = ['min', 'max', 'fairLabelTop'];
    for (const k of Object.keys(d.chart || {})) if (!CH.includes(k)) throw new Error(`report-data.chart.${k} ไม่อยู่ใน schema v2`);
    for (const k of Object.keys(d.gauge || {})) if (!GA.includes(k)) throw new Error(`report-data.gauge.${k} ไม่อยู่ใน schema v2 (cur/fair ย้ายไป values.px/fv)`);
    const TH = Object.keys(THEME_DEFAULTS);
    for (const k of Object.keys(d.theme || {})) if (!TH.includes(k)) throw new Error(`report-data.theme.${k} ไม่อยู่ใน schema v2`);
  }
```
แล้วแก้ 3 บรรทัด `need(c.fairLine, 'chart.fairLine')` · `need(g.cur, 'gauge.cur'); need(g.fair, 'gauge.fair')` ให้เป็น `if (!V2) …` (v1 บังคับเหมือนเดิม · v2 ห้ามมี — validateValues ตรวจฝั่งห้าม)

(ค) `renderEngine(data)` — ก่อนสร้าง map `__RD_*__` เพิ่ม:

```js
  // v2: ราคา/FV มีสำเนาเดียว (values.px / fv) — engine bake จากตรงนั้น · v1: จาก gauge.cur/fair/chart.fairLine เหมือนเดิม
  const V2 = RV.isV2(data);
  const curPx = V2 ? data.values.px : g.cur, fairPx = V2 ? data.fv : g.fair, fairLine = V2 ? data.fv : c.fairLine;
```
แล้วใช้ `String(fairLine)` แทน `String(c.fairLine)` ที่ `__RD_FAIRLINE__` · `String(curPx)` แทน `String(g.cur)` ที่ `__RD_CUR__` · `String(fairPx)` แทน `String(g.fair)` ที่ `__RD_FAIR__` (ค้นด้วยข้อความ `__RD_FAIRLINE__: String(c.fairLine)` และ `__RD_CUR__: String(g.cur), __RD_FAIR__: String(g.fair)`)

(ง) `expandReport(html)` — หลัง `validateReportData(data);` เพิ่ม:

```js
  // ── ระยะ 2: v2 render ตัวเลขทุกสำเนาจาก values ก่อนแทน marker (decorateReport/injectTA ทำงานบนผลลัพธ์นี้) ──
  let body = html;
  if (RV.isV2(data)) {
    const sm = RM.readStockMeta(html);
    RV.validateValues(data, sm);
    body = RV.renderValues(html, data, sm);
  }
```
และเปลี่ยน `return html.replace('<!--TEMPLATE:STYLE-->'…` เป็น `return body.replace(…`

- [ ] **Step 4: รันให้ผ่าน** — `node test/build-test.js` · `npm run build` (คลังทั้งหมดยังเป็น v1 → identity) · `node test/engine-exec.js` · `node test/check-site.js` ผ่านเท่าเดิม

- [ ] **Step 5: Commit**

```bash
git add build.js test/build-test.js
git commit -m "feat(build): expandReport v2 — validate strict · render {{rd:…}} จาก values ก่อน marker · engine bake cur/fair/fairLine จาก values.px/fv (ระยะ 2 ส่วน A)"
```

### Task 3: gate ต้องเห็น v2 อย่างน้อยไม่พัง + PR ส่วน A

**Files:**
- Modify: `test/check-reports.js` (`buildCtx`: บรรทัดที่อ่าน `constFV` — คง regex เดิม (bake แล้วเหมือนกัน) · **ไม่มีอย่างอื่น** — dual-mode เต็มทำใน Task 10)
- Modify: `docs/templates.md` (หัวข้อใหม่สั้น ๆ "schema v2 (ระยะ 2 — ยังไม่เปิดใช้กับคลังจนกว่าส่วน E)" ชี้ตาราง token ในแผนนี้ · ห้ามใส่ตัวเลข gate ที่ gen-docs เป็นเจ้าของ)

> ★ **Task 3 นี้ทำเสร็จแล้ว (merge เข้า main พร้อม Part A)** — Step 1 ด้านล่างคือ**บันทึกสิ่งที่ทำไปแล้ว** ไม่ใช่สูตรให้รันซ้ำ: สนิปเป็ต v2 ขั้นต่ำในนี้เขียนก่อนที่ `values.dateEra` จะถูกบังคับเป็น `req: true` (ดู Task 1 — คอมมิต `e63a4e57` แก้ตามหลัง) ⇒ **ขาด `dateEra`** และวันนี้จะ throw จาก `validateValues` ถ้ามีใครก๊อปไปรันตรง ๆ · ใส่ `"dateEra":"BE"` เพิ่มในบล็อก `values` ก่อนรัน (ตัวอย่างที่แก้แล้วอยู่ในบรรทัดถัดไป) — Task 10 ที่อ้างผลลัพธ์นี้เป็น baseline ก็ต้องใส่ `dateEra` เช่นกัน

- [x] **Step 1 (ทำแล้ว): ตรวจว่า gate อ่านไฟล์ v2 ที่ render แล้วได้โดยไม่ crash** — สร้างไฟล์ชั่วคราวใน scratchpad (ไม่ใช่ใน `reports/`) จาก `test/fixtures/BBL.html` แก้มือให้เป็น v2 ขั้นต่ำ: เพิ่ม `"v":2,"values":{"px":<sm.price>,"priceDate":"2026-09-10","dateEra":"BE","chgSuffix":"รอบปี"}` (★ ต้องมี `dateEra` — ดูหมายเหตุด้านบน) · ลบ `gauge.cur/gauge.fair/chart.fairLine` · แทน `<div class="px">฿…` ด้วย `{{rd:px}}` ตาม PX_PARTS_RE → รัน:

```bash
node -e "const {expandReport}=require('./build.js');const {checkHtml}=require('./test/check-reports.js');const h=require('fs').readFileSync(process.argv[1],'utf8');const r=checkHtml(expandReport(h),'BBL.html');console.log(r.errors.map(e=>e.id+' '+e.msg).join('\n')||'errors 0')" <scratch>/BBL-v2min.html
```
คาดหวัง: error 0 หรือเฉพาะรหัสที่อธิบายได้ (เช่น E30 ถ้าราคา header ที่ render ต่างจาก stock-meta) — จดผลลง report (Task 10 ใช้เป็น baseline)

- [x] **Step 2 (ทำแล้ว): `npm run verify` ผ่าน 16 ขั้น** (คลังยังเป็น v1 ทั้งหมด — ตอนนั้น `report-values-test.js` ยังไม่เข้า verify ตามแผน Task 1 เดิม จึงถูกต้อง ณ เวลานั้น; verify วันนี้ = 17 ขั้นแล้ว ดูหมายเหตุ §"Global Constraints")

- [ ] **Step 3: Commit + PR**

```bash
git add docs/templates.md
git commit -m "docs(templates): schema report-data v2 + ตาราง token (ระยะ 2 ส่วน A — ยังไม่เปิดใช้กับคลัง)"
gh pr create --base main --head claude/audit-p2-a-renderer --title "audit ระยะ 2 ส่วน A — schema report-data v2 + build render token จาก values" --body "…สรุป Task 1–3 · verify 16/16 · คลังไม่เปลี่ยน (v1 identity)…

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

# ส่วน B — skeleton v2 + สัญญา worker

สาขา `claude/audit-p2-b-skeleton` จาก A

### Task 4: skeleton v2 (TH/US) + skeleton-test

**Files:**
- Modify: `_template/skeleton-th.html` · `_template/skeleton-us.html`
- Modify: `test/skeleton-test.js`

**Interfaces:**
- Consumes: token ใน `RV.TOKENS`
- Produces: skeleton ที่ worker กรอกเฉพาะ `{{UPPER}}` · ทุกช่องสำเนาเป็น `{{rd:…}}` · token worker ที่**หายไป**: `PRICE_DATE` · `CHANGE` · `MOS_SIGNED` · `MOS_CLASS` · `MOS20` · `MOS30` · `SC1_RET`…`SC3_RET` · `ACCENT` (legend ใช้ `theme.accent` ผ่าน CSS var `var(--blue)` แทน) · token worker ที่**เพิ่ม**: `PRICE_DATE_ISO` · `DATE_ERA` · `CHG_SUFFIX` · `SHARES_N` · `REVENUE_N` · `DPS` · `EPS_NUM` · `BVPS_NUM` · `SCN_DIV_INCLUDED` · `SCN_PER_YEAR` · `GAUGE_MIN` · `GAUGE_MAX` · `THEME_JSON` · `CHART_JSON`

- [ ] **Step 1: แก้ skeleton ทั้งสองไฟล์** (US แสดง · TH ต่างเฉพาะ ฿ / SET / `"currency":"THB"` / step ของ input) — จุดที่เปลี่ยน (เลขบรรทัดอ้าง `skeleton-us.html` ปัจจุบัน · หาโดยข้อความ):

| เดิม | ใหม่ |
|---|---|
| L27 `stock-meta` | คงเดิม (กระจก — worker กรอกเลข `{{PRICE}} {{FV}} {{MOS}} {{UPSIDE}} {{PE}} {{DIV_YIELD}} {{ROE}}` · E30/E41/W10 ตรวจกับ values) |
| L29–40 comment + `{{REPORT_DATA}}` | บล็อก JSON template ด้านล่าง (worker กรอก token ทีละค่า ไม่เขียน JSON เอง · `chart` ทั้งก้อนวางจาก fetch-facts เป็น `{{CHART_JSON}}` · `theme` จาก pick-brand เป็น `{{THEME_JSON}}`) |
| L60 `<div class="px">${{PRICE}}<small>` | `<div class="px">{{rd:px}}<small>` |
| L65 `{{CHANGE}}` | `{{rd:chg}}` |
| L67 `ราคา ณ {{PRICE_DATE}}` | `ราคา ณ {{rd:priceDate}}` |
| L82 Market Cap `.v {{MKT_CAP}}` · `.d {{SHARES}}` | `.v {{rd:mcap}}` · `.d` คง `{{SHARES}}` (ข้อความอธิบาย เช่น "1.91 พันล้านหุ้น") |
| L83 P/E (TTM) `.v {{PE}}x` | `.v {{rd:pe}}x` · `.d` คง `EPS TTM ${{EPS_TTM}} …` |
| การ์ด P/BV `.v {{PBV}}` | `.v {{rd:pbv}}x` · `.d` คง BVPS |
| การ์ดเงินปันผล `.v {{DIV_YIELD}}%` | `.v {{rd:yield}}` · `.d` คง DPS |
| L110 legend `มูลค่าเหมาะสม ${{FV}}` | `มูลค่าเหมาะสม {{rd:fv}}` · `<i style="background:{{ACCENT}}">` → `<i style="background:var(--blue)">` |
| L139 `กรอบ ${{FV_LOW}} – ${{FV_HIGH}}` · L140 `.r ${{FV}}` | `กรอบ {{rd:fvLow}} – {{rd:fvHigh}}` · `.r {{rd:fv}}` |
| L155–156 mCur/mFair | `ปัจจุบัน {{rd:px}}` · `เหมาะสม {{rd:fv}}` |
| L159–163 scale | `{{rd:mos30}}` · `{{rd:mos20}}` · `{{rd:fv}}` · `{{rd:analystTgt}}` · `{{rd:fvHigh}}` |
| L177–178 verdict | `class="mos-verdict {{rd:mosClass}}"` · `.big {{rd:mos}}` |
| L182–184 การ์ดจุดซื้อ/โซน | `{{rd:mos20}}` · `{{rd:mos30}}` · `&lt; {{rd:fv}}` |
| L189 `value="{{PRICE}}"` | `value="{{rd:pxNum}}"` |
| L198 hint | `จากจุดเข้า {{rd:px}} • EPS ฐาน ~{{rd:baseEps}}{{rd:scnNote}}` |
| L203/216/229 `.tgt ${{SCn_TGT}}` · L204/217/230 `.ret` | `.tgt {{rd:scNtgt}}` · `<div class="ret {{rd:scNretClass}}">{{rd:scNret}}</div>` |
| L208/221/234 `~${{SCn_DIV}}` | `~{{rd:scNdiv}}` |
| L273–275 vcell | `{{rd:fv}} <span …>({{rd:fvLow}}–{{rd:fvHigh}})</span>` · `MOS ~ {{rd:mos}}` · `~{{rd:analystTgt}} ({{ANALYST_RATING}})` |
| L287 `{{DISCLAIMER_SOURCES}}` | คง · ถ้าประโยค "ราคา ณ …" อยู่ในนั้น ให้ comment กำกับว่าใช้ `{{rd:priceDate}}` |
| comment "วิธีใช้" หัวไฟล์ | เพิ่ม 3 บรรทัด: `{{rd:…}}` = build render ห้ามกรอก · ตัวเลขผูกราคาใน prose ต้องใช้ `{{rd:px}} {{rd:fv}} {{rd:mos}} {{rd:mos20}} {{rd:mos30}} {{rd:analystTgt}} {{rd:analystPct}} {{rd:upside}}` (E44) · ค่าที่ไม่มี (ไม่มีปันผล/ไม่มีเป้า) ใส่ `null` ใน values แล้ว**ตัดการ์ด/token ที่อ้างค่านั้นออก** |

บล็อก report-data ใหม่ (US · TH เปลี่ยน `"currency"` ใน chart เป็น ฿ ผ่าน fetch-facts อยู่แล้ว):

```html
<script type="application/json" id="report-data">
{
  "v": 2,
  "fv": {{FV}},
  "values": {
    "px": {{PRICE}}, "priceDate": "{{PRICE_DATE_ISO}}", "dateEra": "{{DATE_ERA}}", "chgSuffix": "{{CHG_SUFFIX}}",
    "fvLow": {{FV_LOW}}, "fvHigh": {{FV_HIGH}}, "analystTgt": {{ANALYST_TGT}},
    "eps": {{EPS_NUM}}, "shares": {{SHARES_N}}, "revenue": {{REVENUE_N}}, "dps": {{DPS}}, "bvps": {{BVPS_NUM}},
    "baseEps": {{BASE_EPS}},
    "scenarios": [ { "tgt": {{SC1_TGT}}, "div": {{SC1_DIV}} }, { "tgt": {{SC2_TGT}}, "div": {{SC2_DIV}} }, { "tgt": {{SC3_TGT}}, "div": {{SC3_DIV}} } ],
    "scnBasis": { "years": 3, "divIncluded": {{SCN_DIV_INCLUDED}}, "perYear": "{{SCN_PER_YEAR}}" }
  },
  "theme": {{THEME_JSON}},
  "chart": {{CHART_JSON}},
  "gauge": { "min": {{GAUGE_MIN}}, "max": {{GAUGE_MAX}} }
}
</script>
```
comment เหนือบล็อก: `PRICE_DATE_ISO` = วันที่ราคาแบบ ค.ศ. `YYYY-MM-DD` (จาก fetch-facts) · `DATE_ERA` = ศักราชที่ **แสดง** วันที่นั้น — ใบใหม่ใส่ `BE` เสมอ (CLAUDE.md §7 วันที่ในรายงานใช้ปี พ.ศ.) · `CE` มีไว้ให้ migrator รักษาหน้าตาเดิมของใบที่เขียน ค.ศ. เท่านั้น · `CHG_SUFFIX` = `รอบปี` หรือ `ตั้งแต่ IPO` · `SHARES_N` = จำนวนหุ้นทั้งหมดเป็น "หุ้น" (1.91 พันล้าน → `1910000000`) · `REVENUE_N` = รายได้ TTM หน่วยเต็มสกุลรายงาน · `EPS_NUM/BVPS_NUM/DPS` = ตัวเลขล้วน (null ถ้าไม่มี → ตัดการ์ดนั้น) · `SCN_DIV_INCLUDED` = `true` เมื่อผลตอบแทนฉากรวมปันผล · `SCN_PER_YEAR` = `cagr` (ค่าตั้งต้น) — ★ **ห้ามมี `chart.fairLine`/`gauge.cur`/`gauge.fair`** (build throw)

- [ ] **Step 2: แก้ `test/skeleton-test.js`** — (1) ตัวกรอก (`fill`/case object ใกล้บรรทัด 49–51) กรอก token worker ชุดใหม่ (`PRICE_DATE_ISO: '2026-09-11'` · `CHG_SUFFIX: 'รอบปี'` · `SHARES_N: 1910000000` · `REVENUE_N: 4e11` · `EPS_NUM` · `BVPS_NUM` · `DPS` · `SCN_DIV_INCLUDED: true` · `SCN_PER_YEAR: 'cagr'` · `THEME_JSON` = JSON ของ theme ตัวอย่างใน `docs/templates.md` · `CHART_JSON` = chart ตัวอย่าง **ไม่มี fairLine** · `GAUGE_MIN/MAX`) และลบ token ที่หายไป (2) assertion `tpl.includes(`>${cs.cur}{{PRICE}}<`)` (บรรทัด 188) → `tpl.includes('<div class="px">{{rd:px}}<')` (3) เพิ่ม: หลัง `expandReport(filled)` → `ok(expanded.includes(cs.cur + RV.fmtPrice(b.price)), 'ราคา header render จาก values')` · `ok(!/\{\{rd:/.test(expanded), 'ไม่เหลือ {{rd:}}')` · เคส MOS ติดลบ (บรรทัด 219) ยังต้องผ่าน: `.big` render เป็น `−12%` (4) เคสใหม่: filled ที่ `analystTgt: null` แต่ยังมี `{{rd:analystTgt}}` → `expandReport` throw (พิสูจน์ว่ายาม null ทำงานบน skeleton จริง) (5) `tokensIn(tpl)` ต้องนับเฉพาะ `\{\{([A-Z_0-9]+)\}\}` (token worker) — `{{rd:…}}` ไม่ใช่ของ worker

- [ ] **Step 3: รัน** — `node test/skeleton-test.js` ผ่าน · `npm run verify` ผ่าน (skeleton-test ขั้น 15)

- [ ] **Step 4: Commit**

```bash
git add _template/skeleton-th.html _template/skeleton-us.html test/skeleton-test.js
git commit -m "feat(skeleton): โครง v2 — ช่องสำเนาทุกจุดเป็น {{rd:…}} · report-data เป็น JSON template ที่ worker กรอกทีละค่า · skeleton-test ตรวจ render จาก values (ระยะ 2 ส่วน B)"
```

### Task 5: สัญญา worker v2 — `apply-edits --set` · SKILL 5A/5B · templates.md · agent-prompt · CLAUDE.md §10

**Files:**
- Modify: `tools/apply-edits.js` (โหมด `--set <path>=<json>` / `--del <path>` บนบล็อก `report-data` · ใช้ร่วมกับบล็อก `@@` ใน stdin ได้ · all-or-nothing เหมือนเดิม)
- Modify: `.claude/skills/stock-analyzer/SKILL.md` (STEP 5A ข้อ 3 · STEP 5B ข้อ 2–3) · `docs/templates.md` (§"ตัวอย่าง filled (NEW)" เป็น v2 · ตาราง token) · `_template/agent-prompt.md` (บรรทัด NEW/UPDATE) · `CLAUDE.md` §10 (1 บรรทัด: "รายงาน v2: ตัวเลขผูกราคาอยู่ใน `report-data.values` — แก้ด้วย `apply-edits --set` · prose ใช้ `{{rd:…}}`")
- Test: `test/queue-test.js` (มี unit-test ของ apply-edits อยู่ไหม? ถ้าไม่มี เพิ่มบล็อก `apply-edits --set` 4 เคสในไฟล์นั้น)

- [ ] **Step 1: เทส `--set/--del`** (ต่อท้าย `test/queue-test.js` ใช้ `ok` ของไฟล์) — เขียนไฟล์ชั่วคราวใน `os.tmpdir()` ที่มีบล็อก report-data v2 ขั้นต่ำ แล้ว `execFileSync('node', ['tools/apply-edits.js', tmp, '--set', 'values.eps=9.57', '--set', 'fv=210', '--del', 'values.analystTgt'])` → อ่านกลับ: `values.eps === 9.57` · `fv === 210` · ไม่มี `analystTgt` · serialize ด้วย `styledRD` (จุดกราฟบรรทัดเดียว) · เคสผิด: `--set values.px=abc` → exit 1 ไม่เขียน · `--set nope.x=1` (path ไม่มีแม่) → exit 1 · `--set` บนไฟล์ v1 (ไม่มี values) → exit 1 ข้อความ "ไฟล์ v1"

- [ ] **Step 2: แก้ `apply-edits.js`** — parse argv หลังชื่อไฟล์: `--set k=v` (v = `JSON.parse`; ล้มเหลว → ลองเป็น number/true/false/null · ไม่ผ่านทั้งคู่ = error) · `--del k` · path แบบ `a.b.c` (ไม่รองรับ index array นอกจาก `scenarios.0.tgt`) · ถ้ามี `--set/--del` ให้ทำบน JSON ของ `RM.REPORT_DATA_PARTS_RE` (require `./report-meta.js`) **หลัง** apply บล็อก `@@` (ถ้า stdin ว่างและมี `--set` ก็ทำงานได้) · serialize ด้วย `styledRD` — ย้าย `styledRD` จาก `update-prices.js` ไป `report-values.js` (export) แล้วให้ update-prices/migrate-annual-chg import (คง export เดิมของ update-prices) · validate หลังแก้: `RV.validateValues(rd, RM.readStockMeta(html))` ผ่านจึงเขียน

- [ ] **Step 3: เอกสาร** —
  - SKILL 5A ข้อ 3: แทนย่อหน้า `{{MOS}}`/`{{MOS_SIGNED}}` และ "เลขเดียวกันต้องพิมพ์ตรงกันทุกจุด" ด้วย: "**v2:** ตัวเลขผูกราคา/FV กรอก**ครั้งเดียว**ใน `report-data.values` (+`fv`) · ช่องที่เป็น `{{rd:…}}` ห้ามกรอก build render ให้ · prose ที่ต้องอ้างราคา/FV/MOS/เป้า ใช้ token (`{{rd:px}} {{rd:fv}} {{rd:mos}} {{rd:mos20}} {{rd:mos30}} {{rd:analystTgt}} {{rd:analystPct}} {{rd:upside}}`) — E44 บล็อกใบใหม่ที่พิมพ์เลขผูกราคาใน prose · `stock-meta` ยังเป็นกระจก กรอกให้ตรง values (E30)"
  - SKILL 5B ข้อ 2–3: "แก้ตัวเลขผูกราคา = `node tools/apply-edits.js reports/<SYM>.html --set fv=<ใหม่> --set values.eps=<ใหม่> …` (บล็อก `@@` ใช้กับ prose/การ์ดที่เป็น literal เหมือนเดิม) · หลังแก้ `fv` **ไม่ต้อง**รัน update-prices ซ้ำ (MOS/upside/ป้าย render เอง) — แต่ `stock-meta.fairValue/mos/upside` ต้อง set ให้ตรง: `--set-meta fairValue=<ใหม่>`" — ★ เพิ่มโหมด `--set-meta k=v` (บล็อก stock-meta) ใน Step 2 ด้วย (ทดสอบ 1 เคส)
  - templates.md §ตัวอย่าง filled (NEW): เปลี่ยนบล็อก report-data เป็น v2 (ตัวอย่างค่าจริงของ BBL ตาม schema ในแผนนี้) · ตาราง token 28 แถวจากหัวแผน · หมายเหตุ "ใบ v1 (ก่อนย้ายคลัง) ยังใช้กติกาเดิม"
  - agent-prompt.md บรรทัด NEW: เติม "ตัวเลขผูกราคาอยู่ใน `report-data.values` ครั้งเดียว · prose ใช้ `{{rd:…}}`" · บรรทัด UPDATE: "`apply-edits --set`"
  - CLAUDE.md §10 บรรทัดแรก (content-only template): เติมประโยคเดียวตามหัวข้อ Files
  - `docs-test` (ข) วลีต้องห้าม: เพิ่ม `เลขเดียวกันต้องพิมพ์ตรงกันทุกจุด` (กติกาที่ยกเลิก) — ตรวจว่าไม่เหลือใน DOCS นอก marker

- [ ] **Step 4: รัน** — `node test/queue-test.js` · `node test/docs-test.js` · `npm run verify`

- [ ] **Step 5: Commit**

```bash
git add tools/apply-edits.js tools/report-values.js tools/update-prices.js tools/migrate-annual-chg.js .claude/skills/stock-analyzer/SKILL.md docs/templates.md _template/agent-prompt.md CLAUDE.md test/queue-test.js test/docs-test.js
git commit -m "feat(worker): สัญญา v2 — apply-edits --set/--del/--set-meta บน JSON · SKILL 5A/5B · templates filled v2 · agent-prompt · CLAUDE.md §10 (ระยะ 2 ส่วน B)"
```

### Task 6: prep เทียบ JSON↔vendor สำหรับใบ v2 + PR ส่วน B

**Files:**
- Modify: `tools/queue/prep.js` (`snapshotDiff` — ค้น `function snapshotDiff`): เมื่อ `RV.isV2(rd)` ให้เทียบ `values.analystTgt` (แทน `DV.targetCells`) · `values.dps/px` → yield (แทน `yieldPlan`) · `values.bvps` (แทน `pbvPlan`) · `RANGE52_RE` คงเดิม (f41 ยัง literal) · ข้อความ diff ระบุ "values.<key>" ให้ worker รู้ว่าต้องแก้ด้วย `--set`
- Test: `test/queue-test.js` — เคส `snapshotDiff` บน HTML v2 ขั้นต่ำ (มี values.analystTgt 205 vs vendor 220 → รายงาน `values.analystTgt 205 → 220`)

- [ ] **Step 1: เทสก่อน → ตก → แก้ → ผ่าน** (รูปแบบเดียวกับ Task 5)
- [ ] **Step 2: `npm run verify`** ผ่าน
- [ ] **Step 3: Commit** — worker/task จบที่ commit **ห้าม push ห้ามเปิด PR เอง** (controller เท่านั้นที่ push/เปิด PR — CLAUDE.md §5/§7)

```bash
git add tools/queue/prep.js test/queue-test.js
git commit -m "feat(prep): snapshotDiff เทียบ values↔vendor บนใบ v2 (ระยะ 2 ส่วน B)"
```
**controller** เปิด PR ส่วน B เอง (หลัง Task 5–6 ทุก commit ของสาขานี้เสร็จ): `gh pr create --base main --head claude/audit-p2-b-skeleton --title "audit ระยะ 2 ส่วน B — skeleton v2 + สัญญา worker (apply-edits --set · SKILL · templates)" --body "…" ` — ★ base = `main` ตรง ๆ (ไม่ใช่ `claude/audit-p2-a-renderer` แล้ว เพราะส่วน A merge เข้า main ไปแล้วตอนที่สาขา B branch ออกมา — เดิมข้อความ "หลัง A merge เข้า main ให้ retarget PR B เป็น main ก่อน merge" คือ note ไว้กันเผื่อ merge ไม่ทัน ตอนนี้ A merge แล้วจริงจึงใช้ main ได้เลยไม่ต้อง retarget)


---

# ส่วน C — migrator v1→v2 (dry-run เท่านั้น) + fixture v2

สาขา `claude/audit-p2-c-migrator` จาก B · **ห้ามเขียน `reports/` ในส่วนนี้** (เขียนคลังจริง = ส่วน E หลัง D merge)

### Task 7: `tools/migrate-v2.js` — สกัด values · แทน token · round-trip 2 ชั้น · census

**Files:**
- Create: `tools/migrate-v2.js`
- Create: `test/migrate-v2-test.js`

**Interfaces:**
- Consumes: `expandReport` (build.js) · `checkHtml`/`buildCtx` (check-reports) · `MF.FIELDS/extractAll` · `RM.*_PARTS_RE` · `DV.peCards/mcapCards/psCards/yieldPlan/pbvPlan/scenarioPlan/scenarioBlock/SUMMARY_RE/MOS_BIG_RE/targetCells/cardRe` · `PD.findPriceDate/findRestatedDate/findDiscPriceDate/dateIso` · `RV.*` · `footerDate` (queue/footer-date) · `styledRD` (report-values หลัง Task 5)
- Produces: `migrateOne(src, name, opts)` → `{ ok: boolean, reason?: string, out?: string, values?, sites: { tokenised: string[], literal: string[] }, compare: { field, a, b, ok }[], notes: string[] }` · `COPY_FIELDS` (array id) · `TOLERANCE` (map id → fn(a,b) → bool) · `values.dateEra` = ศักราชเดิมของไฟล์ (`'BE'`/`'CE'`) — migrator ต้องเก็บ ไม่ใช่บังคับ พ.ศ. · CLI `node tools/migrate-v2.js [SYM…] [--write] [--batch i --size N] [--census <dir>]`

- [ ] **Step 1: เทสก่อน** — `test/migrate-v2-test.js` บน `test/fixtures/{AAPL,BBL}.html` (v1 แช่แข็ง):

```js
'use strict';
let n = 0, fails = 0;
const ok = (c, m, d) => { n++; if (c) return; fails++; console.error('✗ ' + m + (d ? ' — ' + d : '')); };
const FX = require('./fixtures');
const { migrateOne, COPY_FIELDS } = require('../tools/migrate-v2.js');
const { expandReport } = require('../build.js');
const { checkHtml } = require('../test/check-reports.js');
const RM = require('../tools/report-meta.js');
const RV = require('../tools/report-values.js');
const { footerDate } = require('../tools/queue/footer-date.js');

for (const sym of ['AAPL', 'BBL']) {
  const src = FX[sym]();
  const r = migrateOne(src, sym + '.html', { today: FX.TODAY });
  ok(r.ok, `${sym}: migrate ได้`, r.reason);
  if (!r.ok) continue;
  const rd = RM.readReportData(r.out).data;
  ok(RV.isV2(rd) && rd.values && rd.values.px === RM.readStockMeta(src).price, `${sym}: values.px = stock-meta.price เดิม`);
  ok(rd.gauge.cur === undefined && rd.gauge.fair === undefined && rd.chart.fairLine === undefined, `${sym}: ลบ gauge.cur/fair/fairLine`);
  ok(JSON.stringify(RM.readStockMeta(r.out)) === JSON.stringify(RM.readStockMeta(src)), `${sym}: stock-meta ไม่เปลี่ยน`);
  ok(footerDate(r.out).iso === footerDate(src).iso && /<footer[\s\S]*<\/footer>/.exec(r.out)[0] === /<footer[\s\S]*<\/footer>/.exec(src)[0], `${sym}: footer ไม่ถูกแตะ`);
  ok(!RM.PX_RE.test(r.out) && r.out.includes('<div class="px">{{rd:px}}'), `${sym}: .px เป็น token`);
  ok(/class="mos-verdict \{\{rd:mosClass\}\}"/.test(r.out) && r.out.includes('<div class="big">{{rd:mos}}</div>') && r.out.includes('MOS ~ {{rd:mos}}'), `${sym}: verdict/big/summary เป็น token`);
  ok(/id="pxIn"[^>]*value="\{\{rd:pxNum\}\}"/.test(r.out), `${sym}: pxIn เป็น token`);
  const exp = expandReport(r.out);
  ok(!/\{\{rd:/.test(exp), `${sym}: expand แล้วไม่เหลือ token`);
  const g = checkHtml(exp, sym + '.html', { today: FX.TODAY });
  ok(g.errors.length === 0, `${sym}: gate หลัง migrate error 0`, g.errors.map((e) => e.id + ' ' + e.msg).join(' | '));
  ok(r.compare.every((c) => c.ok), `${sym}: ค่าทุกช่องใน COPY_FIELDS ตรงกัน (ชั้น 1)`, r.compare.filter((c) => !c.ok).map((c) => `${c.field} ${c.a}→${c.b}`).join(' | '));
  ok(r.masked === true, `${sym}: ข้อความที่มองเห็นต่างเฉพาะรูปตัวเลข (ชั้น 2)`, r.maskedDiff);
  // idempotent: migrate ซ้ำบนผลลัพธ์ = ข้าม
  const r2 = migrateOne(r.out, sym + '.html', { today: FX.TODAY });
  ok(!r2.ok && /v2 แล้ว/.test(r2.reason), `${sym}: migrate ซ้ำ = ข้าม`);
}
// mismatch → ไม่ย้าย: ปลอมให้ .big ไม่ตรง (FV−px)/FV
{
  const src = FX.BBL().replace(/<div class="big">[^<]*<\/div>/, '<div class="big">+40%</div>');
  const r = migrateOne(src, 'BBL.html', { today: FX.TODAY });
  ok(!r.ok && /gate ตกก่อน|E16/.test(r.reason), 'ใบที่ gate ตกอยู่ก่อน = ไม่ย้าย: ' + r.reason);
}
// ช่องบังคับหาย → ไม่ย้าย
{
  const src = FX.BBL().replace(/<div class="big">[^<]*<\/div>/, '<div class="big"></div>');
  const r = migrateOne(src, 'BBL.html', { today: FX.TODAY });
  ok(!r.ok, 'ช่องบังคับ (.big) หาย = ไม่ย้าย: ' + r.reason);
}
ok(COPY_FIELDS.includes('f01') && COPY_FIELDS.includes('f54') && !COPY_FIELDS.includes('f33'), 'COPY_FIELDS = ช่องผูกราคา/FV เท่านั้น (ไม่รวม f33 EPS card)');
console.log(`migrate-v2-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
```
★ `checkHtml(html, name, opts)` — ตรวจว่ารับ `opts.today` ไหม (E27/W09 ใช้ STALE_TODAY จาก env ใน fixture-lint?) · ถ้าไม่รับ ให้ตั้ง `process.env.STALE_TODAY = FX.TODAY` ก่อน require ตามแบบ `test/self-test.js` (อ่านหัวไฟล์นั้น)

- [ ] **Step 2: รันให้ตก** — `node test/migrate-v2-test.js`

- [ ] **Step 3: เขียน `tools/migrate-v2.js`** — โครง:

```js
#!/usr/bin/env node
'use strict';
/**
 * migrate-v2.js — แปลงรายงาน content-only (v1: ตัวเลขสำเนาใน HTML) → v2 (สำเนาเดียวใน report-data.values · build render)
 * ระยะ 2 ส่วน C/E · spec A(ข) · manifest ระยะ 1 = สเปกของตัวนี้ (COPY_FIELDS)
 *
 * ต่อไฟล์: gate ต้องผ่านก่อน → สกัด values จาก extractor เจ้าของเดิม → แทนทุกจุดสำเนาด้วย {{rd:…}} → เขียน JSON v2
 *   → round-trip 2 ชั้น: (1) manifest บน expand(v1) เทียบ expand(v2) ทุกช่องใน COPY_FIELDS ตาม TOLERANCE
 *                         (2) ข้อความที่มองเห็น mask ตัวเลขแล้วต้องเท่ากัน (ต่างได้เฉพาะรูปตัวเลข)
 *   → gate บน expand(v2) error 0 → footer/stock-meta ไม่เปลี่ยน → จึงเขียน
 * ตัดสินไม่ได้ (ฐานการ์ดหลายตัว/หมวด 6 อ่านไม่ชัด) = การ์ดนั้นคง literal (สถานะเดิม) · ช่องบังคับหาย/ไม่ตรง = ไม่ย้ายทั้งใบ (residue)
 *
 *   node tools/migrate-v2.js AAPL BBL            # dry-run รายตัว
 *   node tools/migrate-v2.js --batch 0 --size 100 --write --census docs/superpowers/audit/2026-09-11-stock-analyzer/
 * ★ หลัง --write: npm run build → node tools/preserve-dates.js → npm run build → npm run verify → commit (1 commit = 1 แบตช์)
 */
```
ส่วนสำคัญที่ต้องมี (เขียนเป็นฟังก์ชันแยก · ทุก regex ใหม่อยู่ในไฟล์นี้เท่านั้น):

```js
const COPY_FIELDS = ['f01', 'f02', 'f09', 'f10', 'f11', 'f12', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f26', 'f28', 'f29', 'f30', 'f31',
  'f34', 'f35', 'f36', 'f43', 'f44', 'f45', 'f46', 'f47', 'f48', 'f49', 'f50', 'f51', 'f52', 'f53', 'f54'];
const REQUIRED_SITES = ['px', 'chg', 'priceDate', 'pxIn', 'big', 'summary', 'verdict', 'fvBox', 'legend', 'mFair', 'mCur', 'mos20card', 'mos30card', 'vcellFv'];
// เกณฑ์ "ค่าเท่ากัน" ต่อช่อง (a = v1, b = v2 หลัง render) — ค่าตั้งต้น: สัมพัทธ์ 0.5% หรือครึ่งหน่วยของทศนิยมที่หยาบกว่า
const near = (a, b, rel, abs) => Math.abs(a - b) <= Math.max(rel * Math.abs(a), abs);
const TOLERANCE = {
  default: (a, b) => near(a, b, 0.005, 0.005),
  f09: (a, b) => a === b || near(numOf(a), numOf(b), 0, 0.15),          // ป้าย .chg: ข้อความ (ทิศ+suffix เท่ากัน) ตัวเลขต่างได้ 0.1 (คิดใหม่จาก chart.data)
  f10: (a, b) => a === b, f11: (a, b) => true, f12: (a, b) => a == null || b == null || a.slice(0, 7) === b.slice(0, 7),   // f11 หายได้ (v2 ไม่ทวนวงเล็บ) · f12 ระดับเดือน → ระดับวัน
  f15: (a, b) => near(a, b, 0, 0.55), f17: (a, b) => near(a, b, 0, 0.55),  // MOS โชว์ 0/1 ตำแหน่ง
  f16: (a, b) => JSON.stringify(a) === JSON.stringify(b), f18: (a, b) => a === b, f19: (a, b) => a === b,
  f20: (a, b) => near(a, b, 0.01, 0.06), f21: (a, b) => a == null ? b == null : near(a, b, 0.01, 0.06),
  f22: (a, b) => near(a, b, 0, 0.55), f26: (a, b) => near(a, b, 0.03, 0), f28: (a, b) => near(a, b, 0.03, 0.06),
  f29: (a, b) => near(a, b, 0, 0.06), f30: (a, b) => a == null ? b == null : near(a, b, 0, 0.06), f31: (a, b) => near(a, b, 0.01, 0.006),
  f34: (a, b) => arrNear(a, b, 1.0), f35: (a, b) => arrNear(a, b, 1.0), f36: (a, b) => near(a, b, 0.005, 0.005),
  f51: (a, b) => arrNear(a, b, 0.006), f54: (a, b) => arrNear(a, b, 0.006), f16_: null,
};
```
(`arrNear(a,b,abs)` = ความยาวเท่ากันและทุกคู่ `|a−b| ≤ abs` หรือ null ทั้งคู่ · `numOf(text)` = ตัวเลขแรกในข้อความ)

`extractValues(src, ctx)` → `{ values, fv, sites }`:
- `px = ctx.px` (ต้องมี · ต้องใกล้ `sm.price` ≤0.02 ไม่งั้น reason `ราคา header ≠ stock-meta`)
- `priceDate`: `hit = PD.findPriceDate(header)` ต้องมีวัน (`hit.day`) → `RV.isoOf({day, monIdx, yearCE: hit.isBE ? hit.year-543 : hit.year})` (ดู `PD.dateIso(hit)` ว่าให้ ISO ตรง ๆ ไหม — ใช้ตัวนั้นถ้ามี) · ไม่มีวัน → reason `วันที่ราคาระดับเดือน`
- `dateEra`: `PD.findPriceDate(header).isBE ? 'BE' : 'CE'` — ★ **ห้าม hard-code `'BE'`** (คลัง 12 ก.ย. 69: หัวรายงาน BE 737 / CE 171 · บล็อก disc BE 364 / CE 57) ไม่งั้น migration เขียนวันที่ที่คนเห็นใหม่ 171 ใบ โดย masked text diff จับไม่ได้ (ตัวเลขถูก mask) · **7 ใบที่ศักราชของ disc ต่างจากหัวรายงาน** ถูก normalize เป็นศักราชของหัวรายงาน (site `disc` กับ `priceDate` render จาก `{{rd:priceDate}}` ตัวเดียวกัน จึงเป็นศักราชเดียวกันเสมอหลังย้าย) — ต้องลงรายชื่อใน census เป็น note `dateEra normalize`
- `chgSuffix`: `/IPO/.test(ctx.chg) ? 'ตั้งแต่ IPO' : 'รอบปี'`
- `fv = rd.fv` — ต้องใกล้ `ctx.fvBox` และ `sm.fairValue` และ `rd.gauge.fair` และ `rd.chart.fairLine` (สัมพัทธ์ 1%) ไม่งั้น reason `FV ไม่ตรงกันเอง`
- `fvLow/fvHigh` จาก `ctx.mf.values.f54` (คู่ [low, high]) · ถ้า f54 ไม่มีแต่ fv-box มี "กรอบ X – Y" ให้อ่านจากตรงนั้น (regex `FVBOX_RANGE_RE` ด้านล่าง) · ทั้งสองแหล่งต้องตรงกัน (0.6%) ไม่งั้น reason
- `analystTgt` จาก `DV.targetCells(src)[0].target` (ถ้ามี) · ต้องตรง f24 (scale) ถ้ามี · vcell "เป้านักวิเคราะห์" ถ้ามีต้องตรง
- `eps`: `cards = DV.peCards(src)` → เลือกการ์ดที่ `label` ตรง `/P\/E \(TTM\)/i` (ไม่มี → การ์ดแรก) · ถ้า `eps.length === 1` และ `DV.nearPE(shown, px/eps)` (ดูชื่อ/ลายเซ็นจริง) → `eps` = ค่านั้น + site `peCard` · ไม่งั้น literal
- `shares`: `DV.mcapCards(src, px)` ยาว 1 → `.shares` + site `mcapCard` · `revenue`: `DV.psCards(src)` ยาว 1 → `.revenue` (ต้องมี shares ด้วย) + site `psCard` · `dps`: `DV.yieldPlan(src, px).cards` ยาว 1 → `.base` + site `yieldCard` · `bvps`: `DV.pbvPlan(src, px)` ยาว 1 และ `items.length === 1` → `.base` + site `pbvCard`
- `baseEps = ctx.baseEPS` (มี hint "EPS ฐาน") · `scenarios`/`scnBasis`: `p = DV.scenarioPlan(src, px)` → ถ้า `p`: `tgt = p.block.cols[i].tgt` · `div = p.block.cols[i].dps` · `divIncluded = p.conv === 'div'` · `perYear` = ถ้าทุก item มี `py` → ชนิดจากตัวจำแนก CAGR/linear ของ plan (ดูฟิลด์จริงใน `scenarioPlan` — บรรทัด `conv: dC <= dL ? 'cagr' : 'linear'`; เก็บผลไว้ต่อ item แล้วใช้เสียงข้างมาก) · ไม่มี py → `null` · `years = p.years` · site `scn` · `p == null` → คง literal ทั้งหมวด 6 (ไม่มี scenarios ใน values · hint ราคาเข้า**ยังเป็น token** เพราะเป็นสำเนาราคา · `{{rd:scnNote}}` ไม่ใช้)

`tokenise(src, values, sites)` → HTML ที่แทนแล้ว — ตาราง site (regex ใหม่ทั้งหมดอยู่ที่นี่ · ตัวที่มีเจ้าของใช้ของเจ้าของ):

| site | หา | แทนด้วย |
|---|---|---|
| px | `RM.PX_PARTS_RE` | `<div class="px">{{rd:px}}` (แทนทั้ง match) |
| priceDate | `PD.findPriceDate(header)` → slice `[index, index+length)` ใน header · ถ้ามี `findRestatedDate` → **ลบ** วงเล็บทวน: ตัดตั้งแต่ `(` ก่อนหน้า (ที่ `pre` ของ restate) ถึง `)` ตัวแรกหลัง restate | `{{rd:priceDate}}` |
| disc | `allDiscDates` — ★ ฟังก์ชันนี้อยู่ใน update-prices.js (ไม่ export) → **ย้ายไป `tools/price-date.js` แล้ว export** (cron import กลับ) · แทนทุก hit จากขวาไปซ้าย | `{{rd:priceDate}}` |
| chg | `/<div class="chg"[^>]*>[\s\S]*?<\/div>/i` | `<div class="chg">{{rd:chg}}</div>` |
| mCur | `RM.MCUR_LABEL_PARTS_RE` | `$1` โดยตัดสกุล/ช่องว่างท้ายออก แล้วต่อ `{{rd:px}}` — ให้ผลเป็น `id="mCur"><div class="lab">ปัจจุบัน {{rd:px}}` |
| big | `DV.MOS_BIG_RE` | `<div class="big">{{rd:mos}}</div>` |
| verdict | `RM.VERDICT_CLASS_RE` | `class="mos-verdict {{rd:mosClass}}"` |
| pxIn | `/(id="pxIn"[^>]*\bvalue=")[^"]*(")/` | `$1{{rd:pxNum}}$2` |
| summary | `DV.SUMMARY_RE` | `$1MOS ~ {{rd:mos}}$3` |
| fvBox | `FVBOX_R_RE = /(class="fv-box"[\s\S]*?<div class="r">)\s*(?:C\$|[฿$])?\s*[\d.,]+\s*(<\/div>)/` | `$1{{rd:fv}}$2` |
| fvBoxRange | `FVBOX_RANGE_RE = /(class="fv-box"[\s\S]*?กรอบ\s*)(?:C\$|[฿$])?\s*[\d.,]+(\s*(?:–|-|&ndash;)\s*)(?:C\$|[฿$])?\s*[\d.,]+/` (ถ้ามี) | `$1{{rd:fvLow}}$2{{rd:fvHigh}}` |
| legend | `LEGEND_RE = /(<div class="legend">[\s\S]*?มูลค่าเหมาะสม\s*)(?:C\$|[฿$])?\s*[\d.,]+(\s*<\/span>)/` | `$1{{rd:fv}}$2` |
| mFair | `MFAIR_RE = /(id="mFair"><div class="lab"[^>]*>เหมาะสม\s*)(?:C\$|[฿$])?\s*[\d.,]+/` | `$1{{rd:fv}}` |
| scale | ใน `<div class="scale">…</div>` (segment เดียวกับ ctx.scaleNums) แต่ละ `<span…>VALUE<br><small>LABEL</small></span>`: LABEL `/MOS 30/` → `{{rd:mos30}}` · `/MOS 20/` → mos20 · `/Fair Value/` → fv · `/เป้า.*Analyst/` → analystTgt (ต้องมี values.analystTgt) · `/กรอบบน/` → fvHigh (ต้องมี) · LABEL อื่น → คง literal + note · ค่าเดิมต้องตรง derive (0.6%) ไม่งั้น reason `scale ไม่ตรง` | ตามป้าย |
| mos20card / mos30card | `/(จุดซื้อ MOS 20%<\/div>\s*<div class="v[^"]*">)[^<]*(<)/` (30 เช่นกัน) | `$1{{rd:mos20}}$2` |
| zone | `/(โซนเริ่มทยอยสะสม<\/div>\s*<div class="v[^"]*">(?:&lt;|<)\s*)(?:C\$|[฿$])?\s*[\d.,]+/` | `$1{{rd:fv}}` |
| vcellFv | `/(<div class="k">มูลค่าเหมาะสม<\/div>\s*<div class="v"[^>]*>)\s*(?:C\$|[฿$])?\s*[\d.,]+(\s*<span[^>]*>\()(?:C\$|[฿$])?\s*[\d.,]+([–\-])(?:C\$|[฿$])?\s*[\d.,]+(\)<\/span>)/` · ถ้าไม่มี span กรอบ: `/(<div class="k">มูลค่าเหมาะสม<\/div>\s*<div class="v"[^>]*>)\s*(?:C\$|[฿$])?\s*[\d.,]+/` | `$1{{rd:fv}}$2{{rd:fvLow}}$3{{rd:fvHigh}}$4` / `$1{{rd:fv}}` |
| vcellTgt | `/(<div class="k">เป้านักวิเคราะห์[^<]*<\/div>\s*<div class="v"[^>]*>\s*~?)(?:C\$|[฿$])?\s*[\d.,]+/` (ต้องมี analystTgt) | `$1{{rd:analystTgt}}` |
| tgtCard | การ์ดที่ `DV.targetCells` เจอ: ใน `.v` แทน `MONEY_PCT_SRC` match แรก | `{{rd:analystTgt}} ({{rd:analystPct}})` (คงข้อความรอบนอก เช่น "n=32") |
| peCard / mcapCard / psCard / yieldCard / pbvCard | `.v` ของการ์ดที่เลือก (ใช้ `DV.cardRe()` วนหา label เดียวกับที่ plan คืน) · แทน**เฉพาะตัวเลข**: P/E `N x` → `{{rd:pe}}x` · mcap จำนวนเงิน+หน่วย → `{{rd:mcap}}` · P/S → `{{rd:ps}}x` · yield `N %` → `{{rd:yield}}` · P/BV `N x` → `{{rd:pbv}}x` | |
| hint | `DV.scenarioBlock(src).hint.at/num` → slice · `EPS ฐาน\s*~?\s*[฿$]?\s*[\d.,]+` → `EPS ฐาน ~{{rd:baseEps}}` · ท้าย hint ` • รวมปันผล` (ถ้ามีและ scn ตัดสินได้) → `{{rd:scnNote}}` | `{{rd:px}}` |
| scn | `DV.scenarioBlock(src).cols[i]`: `.tgt` (regex `SCN_TGT_RE` ในคอลัมน์) → `{{rd:scNtgt}}` · `.ret` ที่ `at/text` → `<div class="ret {{rd:scNretClass}}">{{rd:scNret}}</div>` (แทนทั้ง div ด้วย `SCN_RET_RE` ในคอลัมน์) · แถวปันผล `SCN_DPS_RE` → `~{{rd:scNdiv}}` (ถ้า div ไม่ null) | |

★ ทำ replacement **จากท้ายไฟล์ไปหัวไฟล์** เมื่อใช้ index (hint/ret/date) · replacement ที่ใช้ regex ทำหลังชุด index · ทุก site ที่ทำต้อง**ยืนยันว่า match ครั้งเดียว** (นับ `matchAll` = 1) ไม่งั้น reason `site <name> match ≠ 1`

`writeJson(src2, rd, values, fv)`: `rd.v = 2; rd.fv = fv; rd.values = values (ตัดคีย์ null ทิ้ง ยกเว้น scenarios[].div ที่ null ได้)`; ลบ `gauge.cur/gauge.fair/chart.fairLine` และ**คีย์นอก schema** (`symbol/currency/name/price/fairValue/mos/upside` ระดับบน · `gauge.mos30/mos20/fv_high/analyst_tgt/spans` · `theme.accentLight`) — บันทึกใน notes · เขียนคืนด้วย `RM.REPORT_DATA_PARTS_RE` + `RV.styledRD` · ลำดับคีย์: v, fv, values, theme, chart, gauge

`verify(src, out, name, ctx0, gate0)` → 2 ชั้น + gate + invariants:
```js
const exp0 = expandReport(src), exp1 = expandReport(out);            // exp0 = ของเดิม
const c0 = buildCtx(exp0, name), c1 = buildCtx(exp1, name);
const compare = COPY_FIELDS.map((f) => { const a = c0.mf.values[f], b = c1.mf.values[f]; const fn = TOLERANCE[f] || TOLERANCE.default;
  const ok = (a == null && b == null) || (a != null && b != null && (typeof a === 'number' && typeof b === 'number' ? fn(a, b) : (Array.isArray(a) || typeof a === 'string' ? fn(a, b) : JSON.stringify(a) === JSON.stringify(b))));
  return { field: f, a, b, ok }; });
// ชั้น 2: ข้อความที่มองเห็น mask ตัวเลข/เครื่องหมาย + ตัดช่อง ret/.chg/วันที่ header ที่รูปเปลี่ยนโดยตั้งใจ
const mask = (h) => visibleText(h).replace(/[−–]/g, '-').replace(/[0-9][0-9.,]*/g, '#').replace(/[~≈]/g, '').replace(/\s+/g, ' ').trim();
const strip = (h) => h.replace(/<div class="ret[^"]*">[\s\S]*?<\/div>/g, '<div class="ret"></div>').replace(/<div class="chg"[^>]*>[\s\S]*?<\/div>/i, '<div class="chg"></div>')
  .replace(/ราคา ณ[^<]*/g, 'ราคา ณ').replace(/ • รวมปันผล/g, '');
const masked = mask(strip(exp0)) === mask(strip(exp1));
```
(`visibleText` = ตัดแท็ก/script/style เหมือน `visible()` ของ check-reports — export ตัวนั้นถ้ายังไม่ export) · gate: `checkHtml(exp1).errors.length === 0` · `footerDate` เท่า + `<footer>` ก้อนเดิม byte-equal · `readStockMeta` เท่า · ผลรวม: `ok = compare.every(ok) && masked && gateOk && footerOk && smOk`

CLI: รายชื่อไฟล์ `reports/*.html` เรียงชื่อ · `--batch i --size N` = slice · ต่อไฟล์พิมพ์ `✓ SYM (tokenised 19 · literal 2: peCard,yieldCard)` หรือ `✗ SYM: <reason>` · `--write` เขียนเฉพาะ ok · `--census <dir>` เขียน `migration-v2-census.json` (append ต่อแบตช์: `{ batch, files: [{sym, ok, reason, tokenised, literal, notes}], at }`) และ render `migration-v2-census.md` (ตารางสรุป: ย้ายแล้ว/ยัง · เหตุผล residue นับต่อชนิด · site literal นับต่อชนิด · 10 ใบตัวอย่างต่อชนิด · **รายชื่อใบที่ note `dateEra normalize`** — 7 ใบที่ศักราช disc ≠ หัวรายงาน ต้องอยู่ครบในตารางนี้ให้คนไล่ดูได้)

- [ ] **Step 4: รันเทสให้ผ่าน** — `node test/migrate-v2-test.js` · แล้ว dry-run ทั้งคลัง (ไม่เขียน):

```bash
rtk proxy node tools/migrate-v2.js --census /private/tmp/claude-501/…/scratchpad/ > /private/tmp/claude-501/…/scratchpad/migrate-dry.txt; rtk proxy grep -c '^✓' …/migrate-dry.txt; rtk proxy grep '^✗' …/migrate-dry.txt | sed 's/^✗ [A-Z0-9.]*: //' | sort | uniq -c | sort -rn | head -20
```
บันทึกตัวเลข (ย้ายได้ N/908 · เหตุผล residue ต่อชนิด) ลง report ของ task — **เป้า ≥ 850/908 dry-run ผ่าน** · ต่ำกว่านั้นให้ดูเหตุผล 3 อันดับแรกแล้วแก้ migrator (ไม่ใช่แก้รายงาน) ก่อนปิด task · ห้าม `--write`

- [ ] **Step 5: Commit**

```bash
git add tools/migrate-v2.js test/migrate-v2-test.js tools/price-date.js tools/update-prices.js
git commit -m "feat(migrate-v2): migrator v1→v2 — สกัด values จาก extractor เจ้าของเดิม · แทน token · round-trip 2 ชั้น + gate ต่อไฟล์ · census (ระยะ 2 ส่วน C · dry-run ทั้งคลัง N/908)"
```

### Task 8: เทส migrator กับเคสขอบ + parser-lint รับรู้ไฟล์ใหม่

**Files:**
- Modify: `test/migrate-v2-test.js` (เพิ่มเคส) · `test/parser-lint.js` (SKIP เพิ่ม `tools/migrate-v2.js`? **ไม่** — migrate-v2 ต้องไม่มีสำเนา regex stock-meta/report-data/.px อยู่แล้ว (ใช้ RM) · ถ้า parser-lint ฟ้อง = แก้ migrate-v2)

- [ ] **Step 1: เคสเพิ่ม** (บน BBL/AAPL แก้ด้วย string replace ใน test):
  - หมวด 6 ตัดสินไม่ได้ (ทำ `.ret` คอลัมน์ bear เป็นข้อความว่าง) → `r.ok === true` · `values.scenarios === undefined` · hint ราคาเข้ายังเป็น `{{rd:px}}` · `.ret` คง literal · site literal มี `scn`
  - การ์ด P/E สองฐาน (แก้ `.d` เป็น "EPS GAAP $8.73 • Adj. $13.1") → `values.eps === undefined` · การ์ดคง literal · ok true
  - วันที่ราคา + วงเล็บทวน (เติม ` (11 ก.ย. 2569)` หลังวันที่ใน header ของ AAPL ถ้ายังไม่มี) → ผลลัพธ์ header ไม่มีวงเล็บ · f11 ใน compare = ok (v2 ไม่มี · TOLERANCE f11 = true)
  - stock-meta.price ≠ header (แก้ header เป็นราคาอื่น 5%) → `!r.ok` reason `ราคา header ≠ stock-meta`
  - `.px` มีช่องว่าง "$ 193.50" → `!r.ok` (PX_PARTS_RE ไม่ match — ตรงกับที่ cron ก็เขียนไม่ได้) reason `site px match ≠ 1`
- [ ] **Step 2: ผ่าน** · `node test/parser-lint.js` ไม่ฟ้อง (รันผ่าน self-test หรือเรียกตรงตามที่ไฟล์นั้นถูกเรียก — ดู `test/self-test.js` ว่า parser-lint ถูก require ที่ไหน)
- [ ] **Step 3: Commit** — `git commit -m "test(migrate-v2): เคสขอบ — หมวด 6/การ์ดตัดสินไม่ได้คง literal · วงเล็บทวนถูกตัด · ราคาไม่ตรง/px มีช่องว่าง = ไม่ย้าย"`

### Task 9: fixture v2 + PR ส่วน C

**Files:**
- Create: `test/fixtures/AAPL-v2.html` · `test/fixtures/BBL-v2.html` (= `migrateOne(fixture v1).out` · **ไม่แตะ v1**)
- Modify: `test/fixtures/index.js` (`PATH.AAPL_V2/BBL_V2` · `AAPL_V2()`/`BBL_V2()` · TODAY เดิม) · `test/fixtures/README.md` (ที่มา: สร้างจาก v1 ด้วย `node tools/migrate-v2.js --fixture` วันที่ … · วิธีแช่แข็งใหม่ = รันคำสั่งเดิม) · `tools/migrate-v2.js` (`--fixture` = อ่าน `test/fixtures/{AAPL,BBL}.html` เขียน `-v2.html` — ใช้แทนการ copy มือ) · `test/fixture-lint.js` (ถ้ามีกฎชื่อไฟล์ ให้รับ `-v2`)

- [ ] **Step 1**: `node tools/migrate-v2.js --fixture` → 2 ไฟล์ · `git diff --stat` ต้องแสดงแค่ไฟล์ใหม่
- [ ] **Step 2**: เทส sanity ใน `test/migrate-v2-test.js`: `FX.BBL_V2()` expand แล้ว gate error 0 · `RV.isV2` · ค่า `values.px === RM.readStockMeta(FX.BBL()).price`
- [ ] **Step 3**: `npm run verify` (ยัง 17 ขั้น — `report-values-test.js` เข้า verify ไปแล้วตั้งแต่ Task 5 จริง (ไม่ใช่ 16 ตามแผนเดิม) · `migrate-v2-test`/`v2-path-test` เข้า verify ใน Task 12 → 17→18)
- [ ] **Step 4: Commit** — worker/task จบที่ commit **ห้าม push ห้ามเปิด PR เอง** (controller เท่านั้นที่ push/เปิด PR — CLAUDE.md §5/§7)

```bash
git add test/fixtures tools/migrate-v2.js test/migrate-v2-test.js
git commit -m "test(fixtures): AAPL-v2/BBL-v2 จาก migrator (--fixture) — ฐานของ self-test/update-prices-test ทาง v2 (ระยะ 2 ส่วน C)"
```
**controller** เปิด PR ส่วน C เอง: `gh pr create --base main --head claude/audit-p2-c-migrator --title "audit ระยะ 2 ส่วน C — migrator v1→v2 (dry-run · round-trip 2 ชั้น · census) + fixture v2" --body "…dry-run ทั้งคลัง N/908 · residue ตามชนิด … · **ยังไม่เขียนคลัง**"` — ★ base = `main` (ไม่ใช่ `claude/audit-p2-b-skeleton`) เพราะส่วน B merge เข้า main แล้วก่อนสาขา C จะ branch ออก (ระยะ 2 merge ทีละส่วนเข้า main ไม่ได้ stack กันเป็นสาขาซ้อนสาขาอีกต่อไป — ดู CONTEXT ของ fix wave นี้)

---

# ส่วน D — cron/gate dual-mode + พิสูจน์ "ทาง v2 ไม่ใช้ regex สำเนา" + E-policy

สาขา `claude/audit-p2-d-dual-mode` จาก C · **ต้อง merge เข้า main ก่อนส่วน E เริ่ม** · ก่อนเริ่ม Task 10 ตรวจ `gh run list --workflow=update-prices.yml --limit 2` — run ของ 13 ก.ย. (แรกบนโค้ด C–E ระยะ 1) ต้อง success ไม่งั้นแก้ก่อน (open-item #34)

### Task 10: gate — `buildCtx` อ่านสำเนาจาก JSON เมื่อ v2 · `V1_READ` · `ctx.source` · manifest v2

**Files:**
- Modify: `test/check-reports.js` (`buildCtx` · `checkHtml(html, name, opts)` รับ `opts.source` · export `V1_READ`, `visible`)
- Modify: `tools/field-manifest.js` (ฟิลด์ `v2` ต่อแถว · f69 · `N_FIELDS` 71 · `extractAll` ข้ามแถว `v2: null` บนไฟล์ v2)
- Modify: `test/self-test.js` (assertion N_FIELDS/census ถ้ามี · เคส W21 บนไฟล์ v2 ไม่ฟ้องช่องที่ `v2: null`)
- Modify: `docs/superpowers/audit/2026-09-11-stock-analyzer/manifest-census.md` (หมายเหตุ f69 + ความหมาย v2)

**Interfaces:**
- Produces: `V1_READ = { px(html), fvBox(html), mosBig(html), pxInput(html), chg(html), priceAge(header), scaleNums(html), baseEPS(html) }` (ตัวอ่าน v1 ที่ย้ายออกมาจาก object literal ของ ctx — โค้ดเดิมทุกตัว) · `ctx.v2` (boolean) · `ctx.dv` (ผล `RV.derive` หรือ null) · `ctx.source` (HTML ก่อน expand หรือ html เดียวกันถ้าไม่ส่ง) · manifest แถวมี `v2: undefined | null | fn(h, c)`

- [ ] **Step 1: เทสก่อน** (ต่อท้าย `test/self-test.js` บล็อกใหม่ `// ── ระยะ 2: gate ทาง v2 ──` ใช้ `FX.BBL_V2()`):

```js
{
  const RV = require('../tools/report-values.js');
  const base2 = expandReport(FX.BBL_V2());
  const c = buildCtx(base2, 'BBL.html');
  ok(c.v2 === true && c.dv && c.px === c.dv.px && c.fvBox === c.dv.fv && c.mosBig === c.dv.mosShown && c.pxInput === c.dv.px, 'v2: ctx.px/fvBox/mosBig/pxInput มาจาก values (derive)');
  ok(c.priceAge && c.priceAge.iso === RM.readReportData(FX.BBL_V2()).data.values.priceDate, 'v2: ctx.priceAge จาก values.priceDate');
  ok(c.chg === c.dv.chg.text, 'v2: ctx.chg จาก chart.data');
  const r = checkHtml(base2, 'BBL.html');
  ok(r.errors.length === 0, 'v2 fixture ผ่าน gate', r.errors.map((e) => e.id).join(','));
  ok(r.coverage.n === 71 - MF.FIELDS.filter((f) => f.v2 === null).length, 'v2: coverage denominator ตัดแถวที่ไม่มีใน v2');
  // mutate JSON แล้ว check ต้องยิง (พิสูจน์ว่าอ่าน JSON ไม่ใช่ HTML): ราคา stock-meta ≠ values.px → E30
  const m1 = expandReport(mutJson('stock-meta', (d) => { d.price = d.price * 1.5; })(FX.BBL_V2()));
  ok(errIds(checkHtml(m1, 'BBL.html')).has('E30'), 'v2: stock-meta.price ≠ values.px → E30');
  const m2 = expandReport(mutJson('report-data', (d) => { d.values.px = d.values.px * 0.5; })(FX.BBL_V2()));
  const r2 = checkHtml(m2, 'BBL.html');
  ok(errIds(r2).has('E30') && !errIds(r2).has('E16') && !errIds(r2).has('E23'), 'v2: เปลี่ยน values.px → E30 (กระจก) ยิง แต่ E16/E23 (สำเนา) เงียบเพราะ render จากค่าเดียวกัน');
  ok(!allIds(r2).has('W04') && !allIds(r2).has('W06'), 'v2: W04/W06 เงียบเสมอ (class/ช่องสรุป render จาก MOS เดียวกัน)');
}
```
(`MF`/`RM`/`mutJson`/`errIds`/`allIds` มีในไฟล์แล้ว — ตรวจชื่อจริง)

- [ ] **Step 2: รันให้ตก**

- [ ] **Step 3: แก้ `check-reports.js`** — (ก) ย้ายตัวอ่าน v1 ที่จะถูกแทนออกเป็น object ระดับไฟล์ (โค้ดเดิมทีละตัว ไม่แก้ regex):

```js
// ระยะ 2: ตัวอ่าน "สำเนาใน HTML" ของไฟล์ v1 — ทาง v2 ไม่เรียกตัวไหนในนี้เลย (test/v2-path-test.js พิสูจน์โดยแทนทั้ง object ด้วยตัว throw)
const V1_READ = {
  px: (html) => { const p = RM.readHeaderPrice(html); return p ? p.price : null; },
  fvBox: (html) => { const i = html.indexOf('class="fv-box"'); return i === -1 ? null : firstNum(grab(/class="r">([\s\S]*?)<\/div>/, html.slice(i))); },
  mosBig: (html) => firstNum(grab(/class="big">([\s\S]*?)<\/div>/, html)),
  pxInput: (html) => firstNum(grab(/id="pxIn"[^>]*value="([^"]*)"/, html)),
  chg: (html) => { const m = html.match(/<div class="chg"[^>]*>([\s\S]*?)<\/div>/i); return m ? stripTags(m[1]).replace(/\s+/g, ' ').trim() : null; },
  priceAge: (header) => parsePriceAge(header),
  baseEPS: (html) => firstNum(grab(/EPS ฐาน\s*~?\s*[฿$]?\s*([0-9.]+)/, norm(html))),
};
```
(ข) ใน `buildCtx` หลัง `const fvIdx = …` เพิ่ม:

```js
  const rdS = RM.readReportData(html), smS = RM.readStockMetaState(html);
  const v2 = rdS.ok && RV.isV2(rdS.data) && smS.ok && !!smS.data;
  let dv = null;
  if (v2) { try { dv = RV.derive(rdS.data, smS.data); } catch (e) { dv = null; } }   // derive ระเบิด = ถือเป็น v1 อ่านจาก HTML (E29/EXPAND จะพูดเอง)
  const V2 = v2 && dv;
```
แล้วในตัว ctx: `px: V2 ? dv.px : V1_READ.px(html)` · `fvBox: V2 ? dv.fv : V1_READ.fvBox(html)` · `mosBig: V2 ? dv.mosShown : V1_READ.mosBig(html)` · `pxInput: V2 ? dv.px : V1_READ.pxInput(html)` · `chg: V2 ? dv.chg.text : V1_READ.chg(html)` · `priceAge: V2 ? priceAgeFromIso(rdS.data.values.priceDate) : V1_READ.priceAge(header)` (เขียน `priceAgeFromIso(iso)` ให้คืน object รูปเดียวกับ `parsePriceAge` — อ่านรูปนั้นจากโค้ด: ต้องมี `iso` และฟิลด์ที่ E27/W09 ใช้) · `baseEPS: V2 && dv.values.baseEps != null ? dv.values.baseEps : V1_READ.baseEPS(html)` · `sm: smS` · `rd: rdS` · เพิ่ม `v2: !!V2, dv: V2 ? dv : null, source: (o.source != null ? o.source : html)`
(ค) `checkHtml(html, name, opts)` ส่ง `opts` เข้า `buildCtx` (ดูลายเซ็นปัจจุบัน — ถ้า `checkHtml(html, name)` ให้เพิ่มพารามิเตอร์ที่ 3) · `checkFile` ส่ง `{ source: raw }` · export `V1_READ`, `visible`
(ง) `tools/field-manifest.js`: เพิ่ม option `v2` ให้ `F()` (`v2: o.v2`) และตั้งค่า: `f03` `v2: (h, c) => R(c.dv.px)` · `f45`/`f46` `v2: null` · `f11` `v2: null` · `f10` `v2: (h,c)=>R(c.priceAge && c.priceAge.iso)` (เหมือนเดิม — ctx จัดการ) · แถวอื่นไม่ต้องตั้ง (extract เดิมทำงานบน HTML ที่ render แล้ว) · เพิ่มแถว `F('f69', 'stock-meta.fairValue', { cadence: 'write-once', owner: 'worker', gate: ['E30'], healer: null, binding: 'pair', pair: { with: 'f44', how: 'money' }, required: true, extract: (h, c) => R(sm(c) && sm(c).fairValue) })` · `N_FIELDS = 71` · `extractAll(html, ctx)`: ถ้า `ctx.v2` และแถวมี `v2 === null` → ข้าม (ไม่ใส่ใน found/missing/skipped · นับใน `omitted`) · ถ้า `v2` เป็น fn → ใช้แทน `extract` · coverage `n` = FIELDS.length − omitted
(จ) `test/self-test.js` บรรทัดที่ยืนยัน `N_FIELDS`/จำนวนแถว 70 → 71 · `manifest-census.md` เติมหมายเหตุ

- [ ] **Step 4: รันให้ผ่าน** — `node test/self-test.js` (ทั้งบล็อกเก่า v1 และใหม่ v2) · `node test/check-reports.js` ทั้งคลัง (v1 ทั้งหมด — ผลต้องเท่าเดิม: error 0 · warning count เท่าก่อนแก้ ±0 — จดตัวเลขก่อน/หลัง)

- [ ] **Step 5: Commit**

```bash
git add test/check-reports.js tools/field-manifest.js test/self-test.js docs/superpowers/audit/2026-09-11-stock-analyzer/manifest-census.md
git commit -m "feat(gate): buildCtx dual-mode — v2 อ่านสำเนาจาก values (derive) · V1_READ แยกตัวอ่าน HTML · ctx.source · manifest v2 (f69 · N_FIELDS 71 · แถวที่ไม่มีใน v2) (ระยะ 2 ส่วน D)"
```

### Task 11: cron — `patchReport` ทาง v2 เขียนเฉพาะ JSON · `healDerived` ข้าม v2

**Files:**
- Modify: `tools/update-prices.js` (`patchReport` · `healDerived` · main loop ส่วน freeze `mos-sign-flip` ใช้ fv ของ v2)
- Modify: `test/update-prices-test.js` (บล็อกใหม่บน `FX.AAPL_V2()`)

- [ ] **Step 1: เทสก่อน** (ต่อท้าย `test/update-prices-test.js` · ใช้ `ok`/fixture ของไฟล์ · อ่านบล็อก "patchReport กับ AAPL จริง" (บรรทัด ~164) เพื่อรู้รูป `p` ที่ส่งเข้า `patchReport` และ `dateParts`):

```js
// ---------- ระยะ 2: patchReport ทาง v2 = แก้ JSON เท่านั้น ----------
{
  const RV = require('../tools/report-values.js');
  const src = FX.AAPL_V2();
  const rd0 = RM.readReportData(src).data, sm0 = RM.readStockMeta(src);
  const newPrice = rd0.values.px * 1.1;
  const dateParts = { day: 12, monIdx: 8, yearCE: 2026 };
  const chartData = rd0.chart.data.map((d) => [d[0], d[1]]); chartData[chartData.length - 1][1] = Math.round(newPrice * 100) / 100;
  const r = patchReport(src, { newPrice, dateParts, chartData });
  const rd1 = RM.readReportData(r.html).data, sm1 = RM.readStockMeta(r.html);
  ok(rd1.values.px === Math.round(newPrice * 100) / 100 && rd1.values.priceDate === '2026-09-12', 'v2: values.px/priceDate ถูกเขียน');
  ok(rd1.gauge.cur === undefined && rd1.gauge.fair === undefined && rd1.chart.fairLine === undefined, 'v2: ไม่สร้าง gauge.cur/fair/fairLine กลับมา');
  ok(sm1.price === rd1.values.px && Math.abs(sm1.mos - Math.round((rd1.fv - rd1.values.px) / rd1.fv * 1000) / 10) < 1e-9, 'v2: stock-meta.price/mos กระจกจาก values/fv');
  ok(rd1.values.eps == null || Math.abs(sm1.pe - Math.round(rd1.values.px / rd1.values.eps * 100) / 100) < 1e-9, 'v2: stock-meta.pe = px/eps (2 ตำแหน่ง) เมื่อมี eps');
  ok(rd1.values.dps == null || Math.abs(sm1.dividendYield - Math.round(rd1.values.dps / rd1.values.px * 1000) / 10) < 1e-9, 'v2: stock-meta.dividendYield = dps/px (1 ตำแหน่ง) เมื่อมี dps');
  // HTML นอกสองบล็อก JSON ต้องไม่เปลี่ยนแม้แต่ byte เดียว
  const strip = (h) => h.replace(RM.REPORT_DATA_RE, '').replace(RM.STOCK_META_RE, '');
  ok(strip(r.html) === strip(src), 'v2: นอกบล็อก JSON ไม่ถูกแตะ');
  ok(r.derived.length === 0 && r.notes.length === 0, 'v2: ไม่มี pass derived/notes (ไม่มีอะไรให้ regex)');
  ok(r.chg && r.chg.dir && typeof r.mos === 'number', 'v2: คืน chg/mos สำหรับ log/freeze เหมือน v1');
  // render แล้ว gate ผ่าน และราคาใหม่โผล่ใน header
  const exp = expandReport(r.html);
  ok(exp.includes('<div class="px">$' + RV.fmtPrice(newPrice)), 'v2: ราคาใหม่ render ใน header');
  ok(gateAfterPatch(r.html, 'AAPL.html').ok, 'v2: gateAfterPatch ผ่านหลัง patch');
  // ราคาหลุดขอบ gauge → ขยายขอบ (ใช้ values.px)
  const big = patchReport(src, { newPrice: rd0.gauge.max * 1.2, dateParts, chartData: null });
  ok(RM.readReportData(big.html).data.gauge.max > rd0.gauge.max, 'v2: gauge auto-rescale ใช้ values.px');
}
```

- [ ] **Step 2: รันให้ตก**

- [ ] **Step 3: แก้ `patchReport`** — หลัง `const rd = JSON.parse(rdM[2]); if (!rd.chart …) throw` แทรก:

```js
  const V2 = RV.isV2(rd);
  // v2: FV เจ้าของเดียว = report-data.fv (stock-meta.fairValue เป็นกระจก) · v1: เหมือนเดิม (stock-meta.fairValue)
  const fv = V2 ? rd.fv : sm.fairValue;
```
(ย้ายบรรทัด `const fv = sm.fairValue;` เดิมมาเป็นบรรทัดนี้ · `mos/upside` คำนวณจาก `fv` ตามเดิม) · ในบล็อก gauge auto-rescale: `const curPx = V2 ? round(newPrice, 2) : rd.gauge.cur;` และใช้ `curPx` แทน `rd.gauge.cur` ในเงื่อนไข/สูตร · บรรทัด `rd.gauge.cur = round(newPrice, 2)` → `if (!V2) rd.gauge.cur = round(newPrice, 2);` · หลังคำนวณ theme/chg และ**ก่อน** `let out = html.replace(RM.REPORT_DATA_PARTS_RE …` แทรก:

```js
  if (V2) {
    // ── ทาง v2: เขียน 2 บล็อก JSON เท่านั้น — ทุกสำเนาใน HTML render ตอน build จาก values (ระยะ 2 ส่วน D) ──
    rd.values.px = round(newPrice, 2);
    rd.values.priceDate = RV.isoOf(dateParts);
    let out2 = html.replace(RM.REPORT_DATA_PARTS_RE, (m, a, body, z) => a + '\n' + styledRD(rd) + '\n' + z);
    const d = RV.derive(rd, sm);
    sm.price = d.px; sm.mos = round(d.mos, 1); sm.upside = round(d.upside, 1);
    if (d.pe != null) sm.pe = round(d.pe, 2);
    if (d.yield != null) sm.dividendYield = round(d.yield, 1);
    need(RM.STOCK_META_PARTS_RE, 'stock-meta (เขียนกลับ)');
    out2 = out2.replace(RM.STOCK_META_PARTS_RE, (m, a, b, z) => a + '\n' + JSON.stringify(sm) + '\n' + z);
    return { html: out2, changed: out2 !== html, chg, mos: round(d.mos, 1), derived: [], notes: [] };
  }
```
(`sm.pe`/`dividendYield` แตะเฉพาะเมื่อ values มีฐาน — ใบที่ `pe: null` ตั้งใจ (ขาดทุน) ต้องคง null: เพิ่มเงื่อนไข `if (d.pe != null && sm.pe != null)` และ yield เช่นกัน)
- `healDerived`: ในลูป หลังอ่าน html เพิ่ม `if (RV.isV2(RM.readReportData(html).data)) { skippedV2++; continue; }` และพิมพ์ `ข้าม v2 N ใบ (render จาก values — ไม่มีอะไรให้ซ่อม)` ท้ายสรุป
- main loop: จุดที่คำนวณ `mosOld` สำหรับ freeze `mos-sign-flip` (ค้น `MOS_FLIP_DEADBAND_PP`) — `mosOld` มาจาก `sm.mos` (กระจก) ใช้ได้ทั้งสองทาง ไม่ต้องแก้ · ยืนยันด้วยการอ่านโค้ด แล้วจดใน report

- [ ] **Step 4: รันให้ผ่าน** — `node test/update-prices-test.js` (บล็อกเดิมทั้งหมด + ใหม่) · dry-run cron แบบ offline ไม่ได้ (ต้อง fetch) — ใช้ `--heal-derived` (dry-run) ทั้งคลัง: ผลต้อง "0 ใบมีค่าค้าง" หรือเท่าก่อนแก้

- [ ] **Step 5: Commit**

```bash
git add tools/update-prices.js test/update-prices-test.js
git commit -m "feat(cron): patchReport dual-mode — v2 เขียน values.px/priceDate + กระจก stock-meta เท่านั้น (ไม่แตะ HTML · ไม่มี pass derived) · healDerived ข้าม v2 (ระยะ 2 ส่วน D)"
```

### Task 12: `test/v2-path-test.js` — พิสูจน์ regex สำเนา = 0 บนทาง v2 · verify 17→18 ขั้น

> ★ **แก้ 12 ก.ย. 2569 (Part B final review, fix wave):** ย่อหน้า Files เดิมของ Task นี้สมมติว่า verify วันนี้ยังเป็น 16
> ขั้นและ `report-values-test.js` ยังไม่เข้า chain — ทั้งสองข้อไม่จริงแล้ว: `report-values-test.js` ถูกย้ายเข้า
> `package.json`'s `verify` ไปแล้วจริงตั้งแต่ Task 5 (นอกแผนเดิม) ⇒ verify วันนี้ = **17** ขั้น และ `report-values-test.js`
> เป็นขั้นของตัวเองอยู่แล้ว **ห้ามพับเข้า `v2-path-test.js`** อีก (พับซ้ำ = รันซ้ำสองรอบ หรือแย่กว่านั้นถ้าลบขั้นเดิมของ Part B
> ทิ้งเพื่อให้เลขขั้นลงตัว) — เหลือแค่ `migrate-v2-test.js` (Task 7–9 ของ Part C) ที่ยังไม่เข้า chain จริง ดังนั้น
> `test/v2-path-test.js` เป็น **ขั้นใหม่ 1 ขั้นเดียว** (require แค่ `migrate-v2-test.js` เข้ามา ไม่ require
> `report-values-test.js`) ⇒ verify **17 → 18** ขั้น (ไม่ใช่ 16→17)

**Files:**
- Create: `test/v2-path-test.js`
- Modify: `package.json` (verify: แทรก `node test/v2-path-test.js` **ต่อจาก `node test/report-values-test.js`** (ขั้นเดิมของ Part B — คงไว้ที่เดิม ไม่แตะ) — `v2-path-test.js` เอง `require` เฉพาะ `migrate-v2-test.js` เข้ามารัน (ให้ `migrate-v2-test.js` export ฟังก์ชัน `run()` และรันเองเมื่อ `require.main === module` — `report-values-test.js` **ไม่ต้องแก้** เพราะไม่ถูก require ซ้ำจากที่นี่) ⇒ verify 17 → **18** ขั้น) · `tools/gen-docs.js` (`STEP_LABELS['test/v2-path-test.js'] = ['🧬', 'ทาง v2 ไม่ใช้ regex สำเนา + migrator unit (v2-path-test)', 'v2 data-layer gate', {}]`) · `.githooks/pre-push` (regen) · `test/queue-test.js` (assertion จำนวนขั้น 17 → 18) · docs ผ่าน `node tools/gen-docs.js`

- [ ] **Step 1: เขียน `test/v2-path-test.js`**

```js
'use strict';
/**
 * v2-path-test — เกณฑ์จบระยะ 2 ข้อ "regex ถอดค่าจาก HTML = 0 ใน cron/gate" วัดบนทาง v2:
 *   แทนตัวอ่านสำเนาทุกตัว (V1_READ ของ gate · RM/DV regex ที่ cron ใช้เขียน HTML) ด้วยฟังก์ชัน/regex ที่ throw หรือไม่ match
 *   แล้ว gate + cron บน fixture v2 ต้องทำงานได้ครบ ⇒ พิสูจน์ว่าทาง v2 ไม่แตะตัวอ่านเหล่านั้นเลย
 */
let n = 0, fails = 0;
const ok = (c, m, d) => { n++; if (c) return; fails++; console.error('✗ ' + m + (d ? ' — ' + d : '')); };
// ★ ไม่ require('./report-values-test.js') ที่นี่ — มันเป็นขั้นของตัวเองใน verify อยู่แล้ว (Part B/Task 5)
//   require ซ้ำจะรันเคสเดิมสองรอบใน verify เดียว (เปลืองเวลาเฉย ๆ ไม่ใช่บั๊กที่ทำให้ตก แต่ผิดเจตนา "1 เทส 1 ขั้น")
require('./migrate-v2-test.js').run(ok);
const FX = require('./fixtures');
const CR = require('./check-reports.js');
const RM = require('../tools/report-meta.js');
const DV = require('../tools/derived-values.js');
const UP = require('../tools/update-prices.js');
const { expandReport } = require('../build.js');
const boom = (name) => () => { throw new Error('ทาง v2 ห้ามเรียกตัวอ่านสำเนา: ' + name); };
const NEVER = /(?!)/;
// ── gate ──
{
  const saved = { ...CR.V1_READ };
  for (const k of Object.keys(CR.V1_READ)) CR.V1_READ[k] = boom('V1_READ.' + k);
  const rmSaved = { PX_RE: RM.PX_RE, MCUR_LABEL_RE: RM.MCUR_LABEL_RE, VERDICT_CLASS_RE: RM.VERDICT_CLASS_RE };
  RM.PX_RE = NEVER; RM.MCUR_LABEL_RE = NEVER; RM.VERDICT_CLASS_RE = NEVER;
  const dvSaved = { MOS_BIG_RE: DV.MOS_BIG_RE, SUMMARY_RE: DV.SUMMARY_RE };
  DV.MOS_BIG_RE = NEVER; DV.SUMMARY_RE = NEVER;
  let r, err = '';
  try { r = CR.checkHtml(expandReport(FX.BBL_V2()), 'BBL.html'); } catch (e) { err = e.message; }
  ok(!err, 'gate ทาง v2 ไม่เรียก V1_READ/regex สำเนา', err);
  ok(r && r.errors.length === 0, 'gate ทาง v2 error 0 โดยไม่มีตัวอ่านสำเนา', r && r.errors.map((e) => e.id + ' ' + e.msg).join(' | '));
  ok(r && r.ctx.px > 0 && r.ctx.fvBox > 0 && r.ctx.mosBig != null && r.ctx.pxInput > 0 && r.ctx.chg && r.ctx.priceAge, 'ctx สำเนาทุกตัวมีค่า (มาจาก JSON)');
  Object.assign(CR.V1_READ, saved); Object.assign(RM, rmSaved); Object.assign(DV, dvSaved);
  // sanity: บน v1 ตัว throw ต้องระเบิดจริง (ไม่งั้นเทสนี้พิสูจน์อะไรไม่ได้)
  CR.V1_READ.px = boom('px');
  let threw = false; try { CR.buildCtx(expandReport(FX.BBL()), 'BBL.html'); } catch (e) { threw = true; }
  ok(threw, 'sanity: v1 ยังเรียก V1_READ.px (ตัว throw ระเบิด)');
  CR.V1_READ.px = saved.px;
}
// ── cron ──
{
  const src = FX.AAPL_V2();
  const rd = RM.readReportData(src).data;
  const rmSaved = { PX_PARTS_RE: RM.PX_PARTS_RE, MCUR_LABEL_PARTS_RE: RM.MCUR_LABEL_PARTS_RE, VERDICT_CLASS_RE: RM.VERDICT_CLASS_RE };
  RM.PX_PARTS_RE = NEVER; RM.MCUR_LABEL_PARTS_RE = NEVER; RM.VERDICT_CLASS_RE = NEVER;
  const dvSaved = { MOS_BIG_RE: DV.MOS_BIG_RE, patchDerived: DV.patchDerived };
  DV.MOS_BIG_RE = NEVER; DV.patchDerived = boom('patchDerived');
  let r, err = '';
  try { r = UP.patchReport(src, { newPrice: rd.values.px * 1.05, dateParts: { day: 12, monIdx: 8, yearCE: 2026 }, chartData: null }); } catch (e) { err = e.message; }
  ok(!err && r && r.changed, 'cron ทาง v2 ไม่ใช้ regex เขียน HTML/patchDerived', err);
  Object.assign(RM, rmSaved); Object.assign(DV, dvSaved);
  // sanity: v1 ต้องระเบิด
  RM.PX_PARTS_RE = NEVER;
  let threw = false; try { UP.patchReport(FX.AAPL(), { newPrice: 100, dateParts: { day: 12, monIdx: 8, yearCE: 2026 }, chartData: null }); } catch (e) { threw = true; }
  ok(threw, 'sanity: v1 ยังใช้ PX_PARTS_RE (need() ระเบิด)');
  RM.PX_PARTS_RE = rmSaved.PX_PARTS_RE;
}
console.log(`v2-path-test: ${n - fails}/${n} ผ่าน`);
process.exit(fails ? 1 : 0);
```
★ ข้อควรระวัง: ถ้า `update-prices.js`/`check-reports.js` destructure `const { PX_RE } = RM` ตอนโหลด การแทน `RM.PX_RE` ภายหลังจะไม่มีผล ⇒ ต้องอ้างผ่าน `RM.PX_RE` ณ จุดใช้ (แก้จุด destructure ให้เป็น `RM.x` — ค้น `= require('./report-meta.js')`/`require('../tools/report-meta.js')` ทุกไฟล์ที่เกี่ยว) · เช่นเดียวกับ `MOS_BIG_RE`/`fmtMos` ที่ cron `const { MOS_BIG_RE, fmtMos } = DV`? → เปลี่ยนเป็น `DV.MOS_BIG_RE` ณ จุดใช้ · sanity 2 เคสท้ายพิสูจน์ว่าการแทนมีผลจริง

- [ ] **Step 2: ปรับ `migrate-v2-test.js`** ให้ `module.exports = { run }` + `if (require.main === module) { … }` (ผลรวม n/fails คืนผ่าน `ok` ที่รับเข้ามา) — **`report-values-test.js` ไม่ต้องแก้** (ไม่ถูก require จาก `v2-path-test.js` แล้ว ดูหมายเหตุแก้ 12 ก.ย. 2569 ด้านบน)
- [ ] **Step 3: verify 18 ขั้น** — `package.json` · `node tools/gen-docs.js` (เขียน pre-push + docs) · `test/queue-test.js` 17→18 · `node test/docs-test.js` · `npm run verify` ผ่าน 18/18
- [ ] **Step 4: Commit**

```bash
git add test/v2-path-test.js test/migrate-v2-test.js package.json tools/gen-docs.js .githooks/pre-push test/queue-test.js CLAUDE.md README.md docs/quality-gate.md docs/price-refresh.md
git commit -m "test(v2-path): พิสูจน์ทาง v2 ไม่ใช้ regex สำเนา (gate+cron บน fixture v2 โดยตัวอ่านสำเนาถูกแทนด้วย throw) · verify 18 ขั้น (ระยะ 2 ส่วน D)"
```

### Task 13: E-policy v2 — healer `build` · เคส convergence ผ่าน render · PR ส่วน D

**Files:**
- Modify: `test/self-test.js` (HEALERS += 'build' · `convV2(id, mutJsonFn, desc)` = mutate JSON ของ fixture v2 → expand → check ยิง → "healer" = **ไม่มีอะไรต้องทำ** เพราะ render จาก JSON เดียวกัน ⇒ นิยาม convergence ของ 'build' = "ค่าเสียใน JSON ทำให้ check ยิง · แก้ JSON แล้ว expand ใหม่ → เงียบ" · ลงทะเบียน `CONVERGED` สำหรับ W21/W22 (เตรียมไว้สำหรับ Task 16) — ห้ามยก level ใน task นี้)
- Modify: `docs/quality-gate.md` (marker gen: `gen:healers` ถ้าตารางมี healer column · ไม่งั้น prose 1 บรรทัด: "healer `build` = render จาก values (ใบ v2)")

- [ ] **Step 1**: เพิ่มใน `self-test.js` บล็อก E-policy: `const HEALERS = new Set(['patchReport', 'build', ...])` · เคส: `convV2('W22', (d) => { d.values.fvLow = d.fv * 2; }, 'fvLow > fv ใน JSON')` — ต้องยืนยันก่อนว่า f54 pair `how:'range'` ยิงเมื่อ low > fv (ถ้าไม่ ให้เลือกคู่ที่ยิงแน่ เช่น f69 stock-meta.fairValue vs f44: `mutJson('stock-meta', d => d.fairValue *= 1.5)` → W22 ยิง · แก้กลับ → เงียบ) · `convV2('W21', (d) => { delete d.values.px; }, …)` → expand throw (EXPAND) — W21 ไม่ยิงเพราะ expand ล้ม ⇒ ใช้เคส "ช่องบังคับ literal หาย" แทน (ลบ `<div class="sub">` → f67 required หาย → W21) · healer = worker (ไม่ใช่ build) ⇒ **W21 ยังคง healer null · ยกเป็น E ไม่ได้ในระยะนี้ — จดใน report + Task 16 ตัดสินเฉพาะ W22**
- [ ] **Step 2**: `npm run verify` 17/17
- [ ] **Step 3: Commit + PR ส่วน D → merge เข้า main (หลัง A/B/C) ก่อนเริ่มส่วน E**

```bash
git add test/self-test.js docs/quality-gate.md
git commit -m "test(self-test): E-policy รู้จัก healer build (render จาก values) + convergence ทาง v2 ของ W22 (ระยะ 2 ส่วน D)"
gh pr create --base claude/audit-p2-c-migrator --head claude/audit-p2-d-dual-mode --title "audit ระยะ 2 ส่วน D — cron/gate dual-mode (v2 อ่าน/เขียน JSON เท่านั้น) + v2-path-test + E-policy build" --body "…

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

# ส่วน E — ย้ายคลัง 908 ใบ (แบตช์ · หยุด cron · residue เป็นรายชื่อ)

สาขา `claude/audit-p2-e-migrate` จาก **main หลัง D merge** (ไม่ stack — ต้องมี cron v2 บน main ก่อน) · เริ่มได้เมื่อ `git log origin/main --oneline -1` มี merge ของ PR ส่วน D

### Task 14: หยุด cron · ย้ายคลังเป็นแบตช์ · วันที่ไม่ขยับ

**Files:**
- Modify: `reports/*.html` (เฉพาะใบที่ migrator ผ่าน) · `reports.json` (build เขียน — `updated` ต้องไม่ขยับ)
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/migration-v2-census.json` · `.md` (migrator `--census`)

- [ ] **Step 0: ก่อนเขียนอะไร** — (1) `git fetch && git merge --ff-only origin/main` (รับ cron push ล่าสุด) · (2) `gh workflow disable update-prices.yml` แล้ว `gh workflow list` ยืนยัน (ledger: "cron หยุด <เวลา>") · (3) `npm run verify` 17/17 บนสถานะเริ่ม · (4) จด baseline: `node -e "const j=require('./reports.json');console.log(JSON.stringify(Object.fromEntries((j.reports||j).map(r=>[r.symbol,r.updated]))))" > <scratch>/updated-before.json` (ดูรูป reports.json จริงก่อน) · (5) `rtk proxy node test/check-reports.js | tail -3` จด error/warning รวม
- [ ] **Step 1: dry-run ทั้งคลังอีกครั้งบนโค้ด main** — `rtk proxy node tools/migrate-v2.js --census <scratch>/ | tail -5` · ตัวเลขต้องไม่แย่กว่า Task 7 (ถ้าแย่กว่า = คลังเปลี่ยนจาก cron หลัง C — ดูเหตุผลก่อน)
- [ ] **Step 2: วนแบตช์** (ขนาด 100 · 10 แบตช์ · ทีละคำสั่ง ห้าม background · timeout 600 s ต่อคำสั่ง):

```bash
# แบตช์ i (0..9)
node tools/migrate-v2.js --batch i --size 100 --write --census docs/superpowers/audit/2026-09-11-stock-analyzer/ \
 && npm run build > /dev/null && node tools/preserve-dates.js && npm run build > /dev/null \
 && node -e "const b=require('<scratch>/updated-before.json');const j=require('./reports.json');const rs=(j.reports||j);let bad=[];for(const r of rs){if(b[r.symbol]&&b[r.symbol]!==r.updated)bad.push(r.symbol+' '+b[r.symbol]+'→'+r.updated)}if(bad.length){console.error('updated ขยับ',bad.length,bad.slice(0,5));process.exit(1)}console.log('updated คงเดิมทุกใบ')" \
 && npm run verify > <scratch>/verify-i.txt 2>&1; tail -3 <scratch>/verify-i.txt
git add reports reports.json docs/superpowers/audit/2026-09-11-stock-analyzer/migration-v2-census.*
git commit -m "migrate(v2): แบตช์ i/10 (<SYM แรก>–<SYM ท้าย>) — ย้าย N ใบ · ข้าม M (census)"
```
★ ถ้า verify ตกในแบตช์ใด: ห้ามแก้รายงานมือ · `git checkout -- reports reports.json` คืนทั้งแบตช์ · หาสาเหตุใน migrator/gate (เทสใน Task 7/8 ต้องเพิ่มเคสนั้น) · แก้โค้ด commit แยก · รันแบตช์นั้นใหม่ · ถ้าเป็นใบเดี่ยว ๆ ที่ผ่าน round-trip แต่ verify ทั้งรีโปตก (เช่น check-site) ให้เพิ่มเหตุผล residue ใน migrator (`--exclude SYM` เขียนลง census) ไม่ใช่ข้าม verify
- [ ] **Step 3: หลังครบ 10 แบตช์** — `rtk proxy node -e "…นับ v2/v1 ในคลัง…"`: พิมพ์ `v2 N · v1 M` · `rtk proxy node test/check-reports.js | tail -3` (error 0 · warning เทียบ baseline — W22/W23 ควร**ลด**เพราะสำเนาหายไป) · census.md สรุปสุดท้าย: ย้าย N/908 · residue M พร้อมเหตุผลต่อชนิด + รายชื่อ (เป็น input ของระยะ 3) · site literal ต่อชนิด (peCard/yieldCard/scn …) พร้อมนับ
- [ ] **Step 4: Commit census + push สาขา** — (ยังไม่เปิด cron: เปิดหลัง PR merge ใน Task 15)

### Task 15: PR ส่วน E → merge → เปิด cron · ตรวจ cron รอบแรกบน v2

- [ ] **Step 1**: `gh pr create --base main --head claude/audit-p2-e-migrate --title "audit ระยะ 2 ส่วน E — ย้ายคลังเป็น report-data v2 (N/908 · residue M)" --body "…ตาราง census · updated ไม่ขยับ 908/908 · verify 17/17 ทุกแบตช์ · **cron ถูก disable ตั้งแต่ <เวลา> — เปิดคืนทันทีหลัง merge**

🤖 Generated with [Claude Code](https://claude.com/claude-code)"` · รอ CI (`gh pr checks N --watch`) · merge (`--merge`)
- [ ] **Step 2**: `gh workflow enable update-prices.yml` · `gh workflow run update-prices.yml` (ถ้าเป็นเวลาตลาดเปิด US จะเห็น "ข้ามเพราะตลาดเปิด" — ไม่ใช่ของเสีย · ใบไทยได้ patch) · `gh run watch` จนจบ → ต้อง success · อ่าน log: จำนวน patch ✓ / freeze ตาม reason · **`patch-failed` ต้อง 0 บนใบ v2** (ถ้าไม่ 0 = บั๊กทาง v2 → แก้ก่อนปิด task · ledger)
- [ ] **Step 3**: หลัง cron push → `git fetch && git merge --ff-only origin/main` ในสาขาถัดไป · ตรวจสุ่ม 5 ใบ v2 ที่ถูก patch: `git show HEAD -- reports/<SYM>.html | rtk proxy grep '^[+-]' | rtk proxy grep -v '^[+-][+-]'` ต้องเห็น**เฉพาะ**บรรทัดใน report-data/stock-meta (ไม่มี `.px`/`.big`/`.chg` ใน diff) — จดใน report

### Task 16: W22 → E (เฉพาะเมื่อ v1 = 0) · ไม่งั้น open-item

**Files:** `test/check-reports.js` · `test/self-test.js` · `docs/open-items.md` · (docs ผ่าน gen-docs)

- [ ] **Step 1**: นับ v1 ในคลังหลัง merge E · **ถ้า v1 = 0**: W22 `level: 'error'` (คงชื่อ · healer `'build'` · ปลดล็อกบรรทัด self-test "W21/W22/W23 ต้องเป็น warn" เฉพาะ W22 · convergence จาก Task 13) · `node tools/gen-docs.js` (นับ error/warn เปลี่ยน 47+18 → 48+17) · verify 17/17 · **ถ้า v1 > 0**: ไม่แตะ level · เขียน open-item ใหม่ "#36 W22 → E รอ v1 = 0 (residue M ใบ: <รายชื่อสั้น/ชนิด>)" · W21 คง warn ทั้งสองกรณี (healer = worker · จดใน open-item เดียวกัน)
- [ ] **Step 2**: `docs/open-items.md` ปิด/อัปเดตข้อที่ระยะ 2 แก้ (อย่างน้อย #14 f14 roe rule — ตรวจว่า f57 rule ทำงานบน v2 ไหม · #13/#33 ไม่เกี่ยว)
- [ ] **Step 3: Commit** (สาขา `claude/audit-p2-f-prose` — task นี้ commit บนสาขา F เพื่อไม่เปิด PR เพิ่ม)

---

# ส่วน F — นโยบาย prose B(ข) (E44 date-gated + healer) · เอกสาร · ผลวัดเกณฑ์จบ

สาขา `claude/audit-p2-f-prose` จาก main (หลัง E)

### Task 17: E44 — ใบใหม่ห้ามพิมพ์ตัวเลขผูกราคาใน prose · healer `proseTokens`

**Files:**
- Modify: `tools/report-values.js` (`PROSE_TOKEN_SINCE = '<วันที่ merge ส่วน F เป็น ISO>'` · `PROSE_BOUND = [ {re, token} … ]` · `proseTokens(src, rd, sm)` → `{ html, changes }`)
- Modify: `test/check-reports.js` (E44 `healer: 'proseTokens'`) · `test/self-test.js` (HEALERS += 'proseTokens' · conv บน `FX.BBL_V2()` **source** (ไม่ expand) ผ่าน `checkHtml(expand(h), 'BBL.html', { source: h })`) · `tools/update-prices.js` (ทาง v2 หลังเขียน JSON: `const pt = RV.proseTokens(out2, rd, sm); out2 = pt.html; derived = pt.changes` — cron ทำได้เพราะ**เนื้อหาไม่เปลี่ยน**: แทนเฉพาะ literal ที่เท่ากับค่าที่ render ณ ตอนนั้น) · `docs/quality-gate.md` (แถว E44 ผ่าน gen:checks-table + prose วิธีแก้) · `.claude/skills/stock-analyzer/SKILL.md` (STEP 5A: E44)

**Interfaces:**
- `PROSE_BOUND` (regex ที่จับ "ประโยคผูกราคา" ใน prose — ห่อของเดิม): (1) `f64`: `/(ราคา(?:ปัจจุบัน|ล่าสุด|ตลาด)|จุดเข้า|ที่ราคา)\s*~?\s*(C\$|[฿$])\s*([\d.,]+)/g` → `{{rd:px}}` (2) `/(มูลค่าเหมาะสม|Fair Value|FV)\s*(?:เฉลี่ย)?\s*~?\s*(C\$|[฿$])\s*([\d.,]+)/g` → `{{rd:fv}}` (3) `/(MOS\s*(?:20|30)%?[^<\d]{0,20})(C\$|[฿$])\s*([\d.,]+)/g` → mos20/mos30 ตามเลข (4) `/(MOS|ส่วนเผื่อ|margin of safety)[^<\d]{0,20}([+\-−]?\d+(?:\.\d+)?)\s*%/g` → `{{rd:mos}}` (5) `DV.MONEY_PCT_SRC` ที่ผ่าน guard `TGT_LABEL_STRICT`/`QUOTE_CONTEXT`/`PCT_NOT_VS_PRICE` แบบ pass #4 → `{{rd:analystTgt}} ({{rd:analystPct}})` · ทุกตัวสแกนเฉพาะใน `<p>`/`<li>`/`.txt`/`.hint` (ไม่ใช่การ์ด/JSON)
- `proseTokens(src, rd, sm)`: สำหรับแต่ละ match ถ้า `parseFloat(ตัวเลข)` เท่ากับค่าที่ render (px/fv/mos20/mos30/mos/analystTgt ตาม tolerance ครึ่งหน่วยของทศนิยมที่พิมพ์) → แทนด้วย token (คง prefix/คำ) · ไม่เท่า → ไม่แตะ (ระยะ 3 จัดการ) · idempotent
- E44: `fn: (c) => { if (!c.v2) return null; const f = footerDate(c.source); if (!f || f.iso < RV.PROSE_TOKEN_SINCE) return null; const hits = RV.proseBoundHits(c.source); return hits.length ? \`prose ผูกราคา ${hits.length} จุด (ใบวิเคราะห์หลัง ${RV.PROSE_TOKEN_SINCE} ต้องใช้ {{rd:…}}): ${hits.slice(0,3).map(h=>h.text).join(' · ')}\` : null; }` · `level: 'error'` · `healer: 'proseTokens'` · ใบ v1/ใบเก่า = W15 เหมือนเดิม

- [ ] **Step 1: เทสก่อน** — `test/report-values-test.js`: `proseBoundHits('<p>ราคาปัจจุบัน $188.00 สูงกว่า FV $195</p>')` = 2 hits · `proseTokens` บน fixture v2 ที่แทรก `<p>ราคาปัจจุบัน ฿<px จริง> … มูลค่าเหมาะสม ฿<fv จริง> … เป้า ฿999 (+400%)</p>` → 2 จุดถูกแทน (px/fv) · เป้า 999 ไม่แตะ (ไม่ตรง values) · รันซ้ำ = ไม่เปลี่ยน · `self-test`: conv E44: mutate source (แทรก `<p>` ข้างบน + ตั้ง footer date = วันนี้) → E44 ยิง → `proseTokens` → เงียบ + idempotent · ใบ footer เก่ากว่า SINCE → E44 เงียบ (W15 ยิงแทนถ้าเข้าเกณฑ์)
- [ ] **Step 2: รันให้ตก → เขียน → ผ่าน** · `npm run verify` 17/17 (E44 ต้องไม่ยิงบนคลัง: ใบทั้งหมด footer < SINCE) · `gen-docs` (48 error)
- [ ] **Step 3: Commit**

```bash
git add tools/report-values.js test/check-reports.js test/self-test.js tools/update-prices.js test/report-values-test.js docs/quality-gate.md .claude/skills/stock-analyzer/SKILL.md CLAUDE.md README.md
git commit -m "feat(gate): E44 prose ผูกราคาในใบใหม่ (date-gated ตั้งแต่ <SINCE>) + healer proseTokens (แทน literal ที่เท่าค่าปัจจุบันด้วย {{rd:…}} · cron รันบนใบ v2) (ระยะ 2 ส่วน F · spec B(ข))"
```

### Task 18: ผลวัดเกณฑ์จบระยะ 2 · docs · PR ส่วน F

**Files:**
- Create: `docs/superpowers/audit/2026-09-11-stock-analyzer/phase2-exit.md`
- Modify: `metrics.md` (§11 ระยะ 2) · `docs/open-items.md` · spec header (บรรทัด "ระยะ 2 ผ่านเกณฑ์จบ …") · `docs/price-refresh.md` (cron ทาง v2 · `--heal-derived` ใช้กับ v1 เท่านั้น) · `docs/templates.md` (ลบป้าย "ยังไม่เปิดใช้") · `CLAUDE.md` §9 (1 ประโยค: ใบ v2 cron แก้ JSON เท่านั้น)

- [ ] **Step 1: วัด 3 เกณฑ์ (spec §6 แถว 2)** — เขียนสคริปต์ใน `phase2-exit.md` (คำสั่งที่รันซ้ำได้):
  1. **สำเนาต่อค่า = 1**: บนใบ v2 ทุกใบ นับใน**source** ว่าไม่มีตัวเลข literal ของ px/fv ใน site บังคับ (ทุก REQUIRED_SITES เป็น token) — `rtk proxy node -e` วน reports ตรวจ `PX_RE`/`MOS_BIG_RE`/`SUMMARY_RE`/… ไม่ match ตัวเลขบนใบ v2 → พิมพ์ `v2 N ใบ · ใบที่ยังมี literal ใน site บังคับ 0`
  2. **regex ถอดค่า = 0 ใน cron/gate (ทาง v2)**: `test/v2-path-test.js` ผ่าน (อ้าง run)
  3. **`--heal-derived` ไม่จำเป็น**: `node tools/update-prices.js --heal-derived` → `0 ใบมีค่าค้าง · ข้าม v2 N ใบ` (ถ้า v1 residue มีค่าค้าง = งานระยะ 3 ระบุจำนวน)
  - เพิ่ม: coverage `ช่องต่ำสุด` ก่อน/หลัง · warning รวม ก่อน/หลัง (W22/W23 ลดกี่ใบ) · residue M พร้อมชนิด · cron รอบแรกบน v2: patch ✓ N · patch-failed 0
- [ ] **Step 2: docs** ตามรายการ Files · `node tools/gen-docs.js` · `node test/docs-test.js`
- [ ] **Step 3: `npm run verify` 17/17 · Commit · PR ส่วน F → merge**

```bash
git add docs CLAUDE.md
git commit -m "docs(audit): ผลวัดเกณฑ์จบระยะ 2 (3/3) · open-items · price-refresh/templates/CLAUDE.md ทาง v2 (ระยะ 2 ส่วน F)"
gh pr create --base main --head claude/audit-p2-f-prose --title "audit ระยะ 2 ส่วน F — E44 prose date-gated + healer · ผลวัดเกณฑ์จบระยะ 2" --body "…

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

# แผนถัดไป

| แผน | เข้าเงื่อนไขเมื่อ | หัวข้องานหลัก |
|---|---|---|
| `…-phase3-legacy-sweep.md` | PR ส่วน A–F ระยะ 2 merge · `phase2-exit.md` ผ่าน 3 เกณฑ์ · census residue มีรายชื่อ | ข้อ **E(ข)**: (1) residue v1 M ใบ → แก้ต้นเหตุรายชนิด (วงเล็บทวน/วันที่ระดับเดือน/ราคาไม่ตรง/site match ≠ 1) แล้ว migrate ซ้ำ → v1 = 0 → ลบโค้ดทาง v1 ใน cron/gate/manifest (`V1_READ` · patchReport HTML writes · patchDerived pass ที่เหลือ · fixture v1) · W22 → E (ถ้ายังไม่ยก) (2) prose เก่า: `proseTokens` แทนได้เฉพาะที่เท่าค่าปัจจุบัน — ที่เหลือ (ราคาค้าง ≤786 ใบ · W15 · ค.ศ. 126 · footer อ่านไม่ออก 31 · W23 109) กวาดเชิงกลด้วย git-history test แบบ S10 (ค่า ณ commit ที่เขียน → token) · ดุลยพินิจ fix-on-touch ตามปฏิทินงบ (ขาเป้านักวิเคราะห์/สมอตาย/หมวด 6 ตัดสินไม่ได้/การ์ด literal) (3) WS9(b) · open-items #24 #33 (ย้ายเวลา cron) #34 · เกณฑ์จบ: prose ราคาค้าง 0 · warning 0 · ใบ >90 วัน = 0 ตามนโยบาย |

---

## Self-review (ทำแล้วก่อน commit แผน)

- **Spec coverage ระยะ 2 (§6 แถว "2 · แก้ต้นตอ"):** migrate ตัวเลขเข้า data layer → Task 1 (schema) + 7–9 (migrator) + 14 (คลัง) ✓ · skeleton/engine render → Task 2 (expandReport/engine) + 4 (skeleton) ✓ · cron/gate เทียบ JSON → Task 10–12 ✓ · prose ใช้ token → Task 4/5 (skeleton/SKILL) + 17 (E44 + healer) ✓ · เกณฑ์จบ 3 ข้อ → Task 18 (วัดซ้ำได้) ✓ · B(ข) date-gated E → Task 17 ✓ · WS2 ข้อ 3 E-policy (healer + convergence) → Task 13/17 ✓ · WS1 ข้อ (4) "manifest = สเปกของ migrator" → COPY_FIELDS/TOLERANCE ใน Task 7 ✓ · spec §8 "ห้ามดันวันที่ทั้งคลัง" → Task 14 assert updated ✓
- **ตั้งใจไม่ทำในระยะ 2 (อยู่ตารางแผนถัดไป):** ลบโค้ดทาง v1 · prose เก่าที่ค่าไม่ตรงปัจจุบัน · การ์ด/หมวด 6 ที่ตัดสินไม่ได้ · W21 → E (healer เป็นคน) · ย้ายช่อง worker ที่มีสำเนาเดียว (EPS/BVPS/…) เข้า values (ไม่ใช่สำเนา — YAGNI)
- **Placeholder scan:** ไม่มี TBD/TODO · ทุก step ที่เป็นโค้ดมีโค้ด · จุดที่ต้องอ่านลายเซ็นจริงระบุ "ค้นด้วยข้อความ …"/"ดูฟิลด์จริง" พร้อมชื่อฟังก์ชัน (scenarioPlan return · parsePriceAge shape · checkHtml opts · reports.json shape) — implementer ตัดสินจากโค้ด ไม่ใช่เดา
- **Type consistency:** `RV.isV2/validateValues/derive/renderValues/TOKENS/fmtPrice/fmtBig/annualChg/mosBand/isoOf/parseIso/styledRD(หลัง Task 5)/proseTokens/proseBoundHits/PROSE_TOKEN_SINCE` ใช้ชื่อเดียวกันใน Task 1/2/4/5/7/10/11/12/17 ✓ · `derive().mosShown` ใช้ที่ Task 10 ctx.mosBig และ Task 1 เทส ✓ · `V1_READ` (Task 10) = ที่ Task 12 แทน ✓ · `COPY_FIELDS/TOLERANCE/REQUIRED_SITES/migrateOne/--fixture/--census/--batch` (Task 7) = ที่ Task 8/9/14 ใช้ ✓ · `ctx.source` (Task 10) = ที่ E44 (Task 17) ใช้ ✓ · fixture `FX.AAPL_V2()/BBL_V2()` (Task 9) = Task 10–13/17 ✓ · verify 17→18 ที่ Task 12 เท่านั้น (17 ขั้นวันนี้มาจาก `report-values-test.js` ที่ Task 5 เพิ่มไปแล้วนอกแผนเดิม — แก้ 12 ก.ย. 2569 ดู Task 12) ✓
- **ลำดับ/ความเสี่ยงที่ตรวจแล้ว:** D merge ก่อน E (cron รู้จัก v2 ก่อนมีใบ v2 บน main) ✓ · cron หยุดระหว่าง E + เปิดคืนหลัง merge ✓ · E13 ไม่จับ `rd:` → renderer throw เอง (Task 1 เทส) ✓ · gauge.cur/fair/fairLine ห้ามมีใน v2 (validator + migrator ลบ + cron ไม่สร้างกลับ — เทส Task 11) ✓ · freshHash ยังรวม report-data → build→preserve-dates→build ต่อแบตช์ + assert updated ✓ · `checkHtml` ทำงานบน expanded — E44 ใช้ `ctx.source` ✓ · การแทน `RM.X`/`DV.X` ใน v2-path-test ต้องไม่ถูก destructure ตอนโหลด (Task 12 ระบุ + sanity 2 เคส) ✓
