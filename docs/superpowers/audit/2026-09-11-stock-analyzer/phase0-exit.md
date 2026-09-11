# เกณฑ์จบระยะ 0 — ผลวัดจริง 12 ก.ย. 2569

> วัดบน worktree `stock-analyzer-audit-9678cd` branch `claude/audit-p0-e-exit` @ `1503a899` (Part A–D commit ครบแล้ว) · เวลาไทย (UTC+7)
> เกณฑ์ 4 ข้อมาจาก spec §6 แถว **"0 · หยุดเลือด"**: `docs/superpowers/specs/2026-09-11-stock-analyzer-audit-design.md`

## 0. สรุป — ผ่าน 4/4

| # | เกณฑ์ (spec §6) | ค่าที่วัดได้ | ผล |
|---|---|---|---|
| 1 | cron ไม่ขึ้นกับราคาของวัน (สุ่มไล่ราคา 0 fail) | 12/12 ราคา `verify` ผ่าน · **fails=0** · error 0 ทุกครั้ง | ✅ |
| 2 | ขั้นที่ controller ต้องจำ ≤5 | preflight **2** (สูงสุด 4) · prep **2** (สูงสุด 4) · postcheck **2** | ✅ |
| 3 | docs ขัดกัน 0 คู่ | ขัดกันจริง **0** (raw 2 hit = false positive ทั้งคู่) | ✅ |
| 4 | worker ไม่ได้รับคำสั่งขัดกัน | 11 บรรทัดที่เหลือมีขอบเขตชัดทุกบรรทัด (**แก้ 1 บรรทัดใน task นี้**) | ✅ |

---

## 1. เกณฑ์ 1 — cron ไม่ขึ้นกับราคาของวัน

เขียนราคาสังเคราะห์ 12 ค่า (×0.5 … ×3.0 ของราคาในไฟล์) ลง `reports/AAPL.html` + `reports/BBL.html` **ของจริง** ผ่าน `patchReport()` ซึ่งเป็นเส้นทางเดียวกับ cron แล้วรัน `npm run verify` ทั้ง 14 ขั้นทุกครั้ง · คืนไฟล์ด้วย `git checkout --` หลังทุกรอบ (ห้าม stash — worktree ใช้ stash stack ร่วมกัน)

```bash
SCR=<scratchpad ของ session>
cat > "$SCR/sweep.sh" <<'SH'
set -e
trap 'git checkout -- reports/AAPL.html reports/BBL.html reports.json' EXIT   # กันสคริปต์ตายกลางทางแล้วไฟล์ค้าง
fails=0
for p in $PRICES; do
  node -e "
const U=require('./tools/update-prices.js');const fs=require('fs');const {readStockMeta}=require('./tools/report-meta.js');
for(const s of ['AAPL','BBL']){const h=fs.readFileSync('reports/'+s+'.html','utf8');const px=readStockMeta(h).price*$p;
fs.writeFileSync('reports/'+s+'.html',U.patchReport(h,{newPrice:+px.toFixed(2),dateParts:{day:11,monIdx:8,yearCE:2026},chartData:null}).html)}"
  if npm run verify >"$SWEEP_DIR/sweep-$p.log" 2>&1; then echo "×$p ok"; else echo "×$p FAIL (ดู $SWEEP_DIR/sweep-$p.log)"; fails=$((fails+1)); fi
  git checkout -- reports/AAPL.html reports/BBL.html reports.json
done
echo "sweep fails=$fails"
SH
PRICES="0.5 0.7 0.85 0.95 1.0 1.05 1.15 1.3 1.5 1.8 2.2 3.0" SWEEP_DIR="$SCR" sh "$SCR/sweep.sh"
git status --short          # ต้องว่าง
```

ผลรัน (12 บรรทัด + สรุป):

```
×0.5 ok    ×0.7 ok    ×0.85 ok   ×0.95 ok
×1.0 ok    ×1.05 ok   ×1.15 ok   ×1.3 ok
×1.5 ok    ×1.8 ok    ×2.2 ok    ×3.0 ok
sweep fails=0
```

`git status --short` หลังจบ = **ว่าง** (ไม่มีไฟล์ค้าง · `reports.json` ที่ build เขียนก็ถูกคืน)

สถานะ gate ต่อราคา (บรรทัดสรุปของ `check-reports` ในแต่ละ log):

| ตัวคูณราคา | ผล | ตัวคูณราคา | ผล |
|---|---|---|---|
| ×0.5 | error 0 · warning 151 | ×1.15 | error 0 · warning 150 |
| ×0.7 | error 0 · warning 151 | ×1.3 | error 0 · warning 150 |
| ×0.85 | error 0 · warning 150 | ×1.5 | error 0 · warning 150 |
| ×0.95 | error 0 · warning 150 | ×1.8 | error 0 · warning 150 |
| **×1.0 (ราคาจริง)** | **error 0 · warning 149** | ×2.2 | error 0 · warning 150 |
| ×1.05 | error 0 · warning 149 | ×3.0 | error 0 · warning 150 |

**อ่านผล:** `error` = 0 ทุกราคา ⇒ ไม่มีราคาไหนทำให้ประตูล้ม — นี่คือสิ่งที่เกณฑ์วัด · `warning` ขยับ 149→150/151 ตามราคาที่ไล่ (คลาส W06/W15 ของ AAPL/BBL เอง) ซึ่ง**ไม่บล็อก** cron ตามนิยาม W-code · ก่อนระยะ 0 เคสแบบนี้ล้มจริง 2 คลาส (self-test ผูก BBL วันนั้น · `update-prices-test` ผูก AAPL ที่ CI patch ก่อน verify) — ปิดด้วย fixture แช่แข็ง `test/fixtures/` (Task 1–2) + quarantine `patch-rejected` รายไฟล์ (Task 7)

---

## 2. เกณฑ์ 2 — ขั้นที่ต้องจำ ≤5

runbook พิมพ์ "ขั้นที่ต้องทำเอง" ท้ายทุกคำสั่ง ⇒ สิ่งที่ต้อง**จำ**เหลือแค่ชื่อคำสั่งเดียว (`npm run queue -- …`) ที่เหลืออ่านจากหน้าจอ

| ขั้นตอน | บรรทัด `N.` ที่พิมพ์ | สูงสุดตามโค้ด | คำสั่งที่ใช้วัด |
|---|---|---|---|
| `preflight` | **2** (คิวว่าง ณ วันวัด) | 4 (`+DELIST` `+PLUMBING`) | `node -e "…P.manualSteps(P.plan(P.loadFlags(), todayBangkok()))"` |
| `prep <SYM>` | **2** | 4 (`+หุ้นยาก` `+NEW เลือกสีแบรนด์`) | อ่านจาก `tools/queue/prep.js:230-235` (ไม่รันจริง — `prep` ยิง network) |
| `postcheck <SYM>` | **2** (คงที่) | 2 | อ่านจาก `tools/queue/postcheck.js:75-77` |

ผล `preflight` จริง (เรียกฟังก์ชันบริสุทธิ์ ไม่แตะ network/`git pull`):

```
── ขั้นที่ต้องทำเอง (script ทำแทนไม่ได้) ──
1. probe โมเดล: spawn subagent ไม่ใส่ model … (CLAUDE.md §3.2) แล้ว pin ทุก call
2. ต่อไป: npm run queue -- ship --prepatch … แล้ว npm run queue -- prep <SYM> ทีละตัว
```

> **หมายเหตุการตีความ:** เกณฑ์ spec คือ "ขั้นที่ต้องจำ" **ต่อขั้นตอน** — ทุกขั้นตอน ≤5 ✅ · ถ้านับรวมทั้งรอบแบบแย่ที่สุด (4+4+2) = 10 บรรทัดที่ต้อง**อ่าน** แต่ทั้งหมดถูก script พิมพ์ให้พร้อมบริบท ไม่ใช่ความจำ — เทียบ baseline 24 ขั้นที่ต้องจำล้วน (metrics §7)

---

## 3. เกณฑ์ 3 — docs ขัดกัน 0 คู่

grep 11 วลีที่ Task 15–18 ลบ/แก้ รวมครั้งเดียว (ไม่รวม `superpowers/` ซึ่งเป็นเอกสาร audit ที่ต้องอ้างข้อความเก่า):

```bash
rtk proxy grep -rn "sequential\|เวฟ ≤3\|Sonnet เป็น default ทุกชั้น\|ห้าม controller/worker เรียก advisor ตรง\|ไม่มี Opus แล้ว\|pre-assign สีแบรนด์เอง\|= Opus 5 โดยไม่ตั้งใจ\|52 code\|13 ขั้น\|11 ขั้น\|8 ขั้นเดิม" \
  CLAUDE.md docs README.md .claude _template .githooks .github tools/update-prices.js | grep -v superpowers/
```

ได้ **2 hit — false positive ทั้งคู่ · ขัดกันจริง 0**

| hit | ข้อความ | ตัดสิน |
|---|---|---|
| `docs/templates.md:249` | "…ให้ controller รันคำสั่งข้างต้นแบบ sequential (มี worker พร้อมกันหลายตัว = controller รันทีละตัว ห้ามขนาน)" | **ยอมรับ** — คนละเรื่องกับกฎ "spawn worker แบบ sequential" ที่ถูกยกเลิก · อันนี้คือการเขียน `tags.json` ทีละคำสั่ง (Task 18 review ตัดสินให้คงไว้) |
| `_template/vendor/LICENSE-lightweight-charts:163` | "…incidental, or con**sequential** damages…" | **ยอมรับ** — คำว่า `consequential` ในไฟล์ license ของ vendor · ไม่ใช่กฎของโปรเจกต์ |

baseline = **17 คู่ที่ขัดกัน** (docs-audit / metrics §7) → **0**

---

## 4. เกณฑ์ 4 — worker ไม่ได้รับคำสั่งขัดกัน

`CLAUDE.md` ถูก inject ให้ทั้ง controller และ worker (วัดจริง 11 ก.ย. 69 · metrics §8) ⇒ ทุกคำสั่ง push/advisor/pick-brand ต้อง**ระบุบทบาท** ไม่งั้น worker อ่านแล้วทำตาม

```bash
rtk proxy grep -n "push\|advisor\|pick-brand" CLAUDE.md \
 | grep -v "\[controller\]\|worker ห้าม\|worker/subagent ห้าม\|ห้าม push\|ห้ามเรียก\|worker รัน pick-brand เองได้"
```

ก่อนแก้ = 12 บรรทัด · หลังแก้ = **11 บรรทัด** จำแนกได้ครบทุกบรรทัด:

| บรรทัด | §ที่อยู่ | ชนิด |
|---|---|---|
| 47 · 67 · 75 · 78 · 84 · 127 · 128 | §3 · §5 · §9 | อยู่ใต้หัวข้อ **[controller]** ✅ |
| 31 | §2 | มีวงเล็บกำกับในบรรทัด: "(§5 — controller/session หลักเท่านั้น · worker คืนงานให้ controller push)" ✅ |
| 136 | §10 | **อนุญาต worker โดยชัดแจ้ง**: "worker ขนานรันเองได้ตาม SKILL 5A" (มี lock แล้ว — Task 6) ✅ — ตัวกรองใน brief เขียนว่า `worker รัน pick-brand เองได้` แต่ข้อความจริงคือ `worker ขนานรันเองได้` จึงยังโผล่ในผล grep (ตัวกรองไม่ตรง ไม่ใช่ปัญหาของกฎ) |
| 91 · 108 | §6 · §8 | **บรรยาย ไม่ใช่คำสั่ง** — "Cloudflare deploy อัตโนมัติเมื่อ push เข้า main" / "14 ขั้นต้องผ่านก่อน push" ✅ |

**ที่แก้ใน task นี้ (1 วลี):** `CLAUDE.md:58` (§4 Token discipline — หัวข้อ**ไม่**ติดป้าย [controller] และ preamble บรรทัด 6 บอกว่าหัวข้อไม่ติดป้าย = ใช้ทั้งสองบทบาท) เดิมเขียน `คุมตัวเอง: รวม verify+push เป็น Bash เดียว` — ขอบเขตมาจากคำนำของลิสต์ ("ที่ controller คุมเองเพิ่ม:") บรรทัดเหนือขึ้นไปเท่านั้น ซึ่งเป็นคลาสเดียวกับที่ Part D ไล่ลบ ⇒ เติมเป็น `คุมตัวเอง (controller · worker ห้าม push §5): …`

---

## 5. KPI — baseline → หลังระยะ 0 (spec §7)

| KPI | baseline (11 ก.ย. 69) | หลังระยะ 0 (12 ก.ย. 69) | เป้า spec |
|---|---|---|---|
| ขั้นที่ controller ต้องจำ | 24 | **≤2 ต่อขั้นตอน** (สูงสุด 4) | ≤5 ✅ |
| docs ขัดกัน | 17 คู่ | **0** (raw 2 = false positive) | 0 ✅ |
| fixture ผูกไฟล์รายงานจริง | 2 (`self-test` · `update-prices-test`) | **0** (`test/fixtures/{AAPL,BBL}.html` แช่แข็ง) | 0 ✅ |
| วันที่ cron ล้ม/เดือน | ~2 | **0 ใน 12 ราคาสังเคราะห์** (ยังต้องดูของจริงต่อไป) | 0 |
| ขั้น `npm run verify` | 13 | **14** (+`queue-test`) | — |
| warning เปิดอยู่ | 149 | **149** (ระยะ 0 ไม่แตะหนี้เก่า — เป็นงานระยะ 3) | 0 ที่ระยะ 3 |
| รหัส E/W ใหม่ในระยะ 0 | — | **0** (spec §8 ห้ามเพิ่ม E ก่อน quarantine ครบ) | ≤1/เดือน ✅ |

KPI ที่ยัง**วัดไม่ได้จนกว่าจะเคลียร์คิวรอบจริง**: ปัญหาที่คนจับได้ต่อรอบ · re-dispatch/จำนวนหุ้น · turn ต่อหุ้น — runbook `ship` พิมพ์สรุปท้ายรอบให้แล้ว

---

## 6. ยังเปิด

- **Task 20 — probe เส้นทาง `analyze-wave` (Workflow) ยังไม่ได้รัน** (`docs/open-items.md` #18): Workflow tool ต้องได้รับคำสั่งจากเจ้าของโดยตรง ⇒ ยังไม่รู้ว่าเส้นทางนี้ inject `CLAUDE.md` ไหม + default model คืออะไร · ผลกระทบ: กฎ "pin `model` ทุก call" ยังต้องถือไว้ (ซึ่งก็ถือแล้ว) — **ขอเจ้าของสั่ง "รัน workflow analyze-wave probe"**
- **`docs/open-items.md`: เปิดอยู่ 18 รายการ · ปิดในระยะ 0 แล้ว 3 รายการ** (#3 diff vendor snapshot · #12 memory ผิด · #21 fixture ผูกไฟล์จริง) — ที่เหลือถูกจ่ายให้ระยะ 1–3 ในคอลัมน์ "ปิดใน" ครบทุกแถว
- **minor ที่เลื่อนโดยตั้งใจ** จาก code review ทั้ง 19 task บันทึกอยู่ใน `.superpowers/sdd/progress.md` (ท้ายบรรทัดของแต่ละ task) — ไม่มีข้อไหนเป็น Critical/Important ที่ค้าง
- เกณฑ์ 1 วัดด้วย**ราคาสังเคราะห์**บนหุ้น 2 ตัว — พิสูจน์ว่า gate ไม่ผูกกับราคาของวัน แต่ไม่ได้พิสูจน์ว่า cron จะไม่ล้มด้วยเหตุอื่น (network · vendor เปลี่ยนรูปแบบ) · ตัวจริงต้องดู 30 วันข้างหน้า
