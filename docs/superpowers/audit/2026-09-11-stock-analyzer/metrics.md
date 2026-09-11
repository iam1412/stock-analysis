# ตัวเลขที่วัดจริง — 11 ก.ย. 2569 (worktree `stock-analyzer-audit-9678cd` @ `042d1230`)

ทุกตัวเลขในข้อ 1 ของ spec มาจากคำสั่งด้านล่าง · รันซ้ำได้ · ใช้ `rtk proxy` กับคำสั่งที่นับ/รวมข้อมูล (rtk hook ตัดบรรทัดเงียบ ๆ)

## 1. Fix tax — commit ตั้งแต่ 11 ก.ค. 2569

```bash
rtk proxy git log --since=2026-07-11 --format='%s' | awk '{split($0,a,":"); k=a[1]; sub(/\(.*/,"",k); print k}' | sort | uniq -c | sort -rn
```
| prefix | จำนวน |
|---|---|
| analyze | 915 |
| fix | 89 |
| docs | 71 |
| price | 66 |
| chore | 50 |
| feat | 38 |
| build | 33 |
| test / style / ci | 8 / 8 / 8 |
| gate / gate+cron | 5 / 1 |
| อื่น ๆ (ui tags price-flags infra tools prose harden canary rename refactor plan perf guard) | ~26 |

รวม "แก้ระบบ" (ทุกอย่างที่ไม่ใช่ analyze/price/merge/ci) ≈ **320**

รายสัปดาห์ (ISO week · analyze / price / แก้ระบบ / merge+ci):
```
W28 57/1/17/0 · W29 234/9/28/0 · W30 56/7/0/1 · W31 143/7/39/1 · W32 177/7/59/0
W33 32/8/95/5 · W34 137/10/76/2 · W35 20/6/3/4 · W36 1/5/3/4 · W37 58/6/6/3
```
→ **W33 (10–16 ส.ค.) commit แก้ระบบ 95 > วิเคราะห์ 32**

## 2. การเกิดของรหัส gate

```bash
for c in E36 E37 E38 E39 E40 E41 E42 E43 W13 W14 W15 W16 W17 W18 W19 W20; do
  rtk proxy git log --format='%ad %h' --date=short -S"'$c'" -- test/check-reports.js | tail -1; done
```
| รหัส | วันเกิด |
|---|---|
| E36 E37 | 25 มิ.ย. 69 |
| E38 | 17 ก.ค. |
| E39 · E40 · W13 | 12–13 ส.ค. |
| W14 | 18 ส.ค. |
| **E41 E42 E43 W15 W16** | **19 ส.ค. (5 รหัสวันเดียว)** |
| W17 | 20 ส.ค. |
| W18 | 9 ก.ย. |
| W19 W20 | 11 ก.ย. |

รหัสทั้งหมดใน `test/check-reports.js`: **62** = 43 E + 19 W (W11 ว่าง — เลื่อนเป็น E36)

## 3. สถานะ gate ณ วันนี้

```bash
rtk proxy node test/check-reports.js   # 908/908 ผ่าน · error 0 · warning 149
```
| รหัส | จำนวน warning |
|---|---|
| W15 (% เป้าใน prose) | 97 |
| W06 (ประโยคส่วนต่างจากราคา) | 51 |
| W05 | 1 |

`npm run verify` 13 ขั้น: **6.5 วินาที** (`/usr/bin/time -p`)

## 4. องค์ประกอบคิว price-flags — snapshot ทุก commit ที่แตะไฟล์

```bash
for sha in $(rtk proxy git log --since=2026-07-11 --format='%h' -- price-flags.json); do
  rtk proxy git show $sha:price-flags.json | node -e '…นับ reason…'; done
```
ตัวอย่าง (วันที่ · ขนาด · reason):
```
09-09  27  mos-sign-flip 19 · drift 6 · suspect-split 2
09-05  21  mos-sign-flip 14 · drift 6 · suspect-split 1
08-29  20  mos-sign-flip 14 · drift 4 · suspect-split 2
08-20  12  mos-sign-flip 10 · drift 1 · not-on-exchange 1
08-13  11  mos-sign-flip 8 · drift 2 · suspect-split 1
08-09  40  mos-sign-flip 19 · drift 13 · suspect-split 8
08-01  23  mos-sign-flip 17 · outside-gauge 4 · drift 2   (ก่อน dead-band ±3)
```
→ `mos-sign-flip` = **67–83%** ของคิวในทุก snapshot ตั้งแต่กลาง ส.ค. (13 ส.ค. 73% · 20 ส.ค. 83% · 29 ส.ค. 70% · 5 ก.ย. 67% · 9 ก.ย. 70%) · รอบ 9 ส.ค. = 47% (drift/split หนักหลังหยุดยาว)

## 4b. session ตั้งแต่ 9 ส.ค. (จาก incidents-A + incidents-B)

| ช่วง | รอบเคลียร์คิว | ซ่อม/นโยบาย/เดี่ยว | turn | ชม. งานจริง |
|---|---|---|---|---|
| 9–20 ส.ค. (A) | 6 | 7 | 4,830 | ~34 |
| 23 ส.ค.–11 ก.ย. (B) | 4 | 6 (ซ่อม 4 · นโยบาย 1 · วิเคราะห์เดี่ยว 1) | 1,897 | 12.0 |
| **รวม 23 session** | **10** | **13** | **~6,700** | **~46** |

## 5. หนี้เก่าในคลัง

```bash
node tools/spotcheck.js $(node -e "console.log(require('fs').readdirSync('reports').filter(f=>f.endsWith('.html')).map(f=>f.slice(0,-5)).join(' '))")
```
| ตัวชี้ (spotcheck โหมดต่อหุ้น ทุกใบ) | รายการ | ใบ |
|---|---|---|
| ขา FV ห่างราคา ≤3% (สมอตาย?) | 266 | 226 |
| ขา FV ยืนบนเป้านักวิเคราะห์ | 233 | 222 |
| "ราคาปัจจุบัน $X" ใน prose ≠ ราคาไฟล์ (>0.5%) | 846 | **786** |
| รวม | 1,345 | 840/908 |

## 6. อายุการวิเคราะห์ (footer "ข้อมูล ณ")

```bash
node docs/superpowers/audit/2026-09-11-stock-analyzer/measure-analysis-age.js
```
| ช่วงอายุ | ใบ |
|---|---|
| ≤7 วัน | 43 |
| 8–30 | 140 |
| 31–60 | 301 |
| **61–90** | **391** |
| 91–120 | 0 |
| >120 | 2 (SNA 441 · BAM 249) |
| อ่านไม่ออก | 31 |

มัธยฐาน **57 วัน** · footer ปี พ.ศ. 751 / ค.ศ. 126

## 7. โครงสร้าง (จาก code-audit / docs-audit)

- ช่องตัวเลขใน matrix: 68 · NEITHER 18 · UNVERIFIED WRITE 3 · WARN-ONLY 11
- regex literal: check-reports 168 · build 165 · derived-values 136 · check-site 98 · update-prices 69
- `return null` ใน check-reports: 66 · ทางออกเงียบใน patchDerived: 39
- สำเนา regex บล็อก stock-meta ใน production: 8 · regex ราคา `.px`: 6 (4 คำศัพท์สกุลเงิน)
- ขนาดไฟล์: check-reports 272→832 · update-prices 357→906 · derived-values 0→910 (23 วัน)
- ขั้นตอน controller ต่อรอบ: 42 (script จริง 4 · script ที่ต้องจำไปรัน 10 · จำล้วน 24)
- กฎ worker 46: ไม่มีโค้ดบังคับ 26 · ไม่อยู่ในทางอ่าน 19 · ขัดกัน 17 คู่ · ล้าสมัย 16 · ซ้ำ ≥3 ที่ 9 กลุ่ม (≥5 ที่ drift 6/6)

## 8. บริบทที่ worker ได้จริง (probe 11 ก.ย. 69 · Agent tool · pin sonnet · cwd = worktree)

- "You are powered by the model named Sonnet 5"
- ได้ `CLAUDE.md` โปรเจกต์ทั้งฉบับ (กรอบ: "These instructions OVERRIDE any default behavior and you MUST follow them exactly as written")
- ได้ `MEMORY.md` index 27 บรรทัด · **ไม่ได้** เนื้อไฟล์ memory ย่อย · **ไม่ได้** SKILL.md · ได้ `~/.claude/CLAUDE.md` + `RTK.md`
- เส้นทาง `analyze-wave` (Workflow `agent()`) **ยังไม่ได้ probe**

## 9. ผลวัดเกณฑ์จบระยะ 0 — 12 ก.ย. 2569 (branch `claude/audit-p0-e-exit` @ `1503a899`)

> รายละเอียด/คำสั่งเต็ม + การจำแนกทุกบรรทัด → `phase0-exit.md` (ไฟล์เดียวกับโฟลเดอร์นี้)

| เกณฑ์ (spec §6 "0 · หยุดเลือด") | baseline 11 ก.ย. | วัดได้ 12 ก.ย. | คำสั่ง |
|---|---|---|---|
| cron ไม่ขึ้นกับราคาของวัน | cron ล้ม ~2 วัน/เดือน (3 ครั้งจาก fixture ผูกราคา) | **12/12 ราคา verify ผ่าน · fails=0 · error 0 ทุกครั้ง** (warning 149→150/151 = W-code ไม่บล็อก) | `sweep.sh` ไล่ ×0.5…×3.0 ผ่าน `patchReport()` ลง `reports/{AAPL,BBL}.html` จริง + `npm run verify` ทุกรอบ + `git checkout --` คืนไฟล์ (มี `trap … EXIT`) |
| ขั้นที่ controller ต้องจำ | 24 (จำล้วน · metrics §7) | **preflight 2 · prep 2 · postcheck 2** (สูงสุดตามโค้ด 4/4/2) | `node -e "P.manualSteps(P.plan(P.loadFlags(), todayBangkok()))"` · prep/postcheck อ่านจาก `tools/queue/prep.js:230-235`, `postcheck.js:75-77` |
| docs ขัดกัน | 17 คู่ | **0** (raw 2 hit = false positive: `templates.md:249` "sequential" ของ tag-apply · vendor LICENSE "con*sequential*") | `grep -rn` 11 วลี ใน `CLAUDE.md docs README.md .claude _template .githooks .github tools/update-prices.js` ตัด `superpowers/` |
| worker ไม่ได้รับคำสั่งขัดกัน | — (กฎ worker 46 ข้อ · ขัดกัน 17 คู่) | **11 บรรทัดเหลือ มีขอบเขตครบ** — 7 ใต้หัวข้อ `[controller]` · 1 วงเล็บกำกับในบรรทัด · 1 อนุญาต worker ชัดแจ้ง · 2 บรรยาย · **แก้ 1 วลี** (`CLAUDE.md:58` §4 ไม่ติดป้ายบทบาท) | `grep -n "push\|advisor\|pick-brand" CLAUDE.md` แล้วกรองวลีกำกับบทบาท |

ตัวเลขอื่นที่ขยับในระยะ 0: ขั้น `npm run verify` **13 → 14** (+`queue-test`) · fixture ที่ผูกไฟล์รายงานจริง **2 → 0** (`test/fixtures/`) · รหัส E/W ใหม่ **0** (spec §8 ห้ามเพิ่ม E ก่อน quarantine ครบ) · `docs/open-items.md` เปิด **18** ปิดแล้ว **3**

**เงื่อนไขก่อนระยะ 1:** W-code ที่ขึ้นกับราคายังขยับตามราคา (149→151 ระหว่าง sweep) — เลื่อน W→E เมื่อไรต้องรัน sweep ซ้ำเป็นเกณฑ์จบระยะ 1 · ยังไม่ได้วัด: เส้นทาง `analyze-wave` (Workflow) — Task 20 รอเจ้าของสั่ง (open-items #18) · KPI รอบเคลียร์คิวจริง (ปัญหาที่คนจับ · re-dispatch · turn/หุ้น) ต้องรอรอบถัดไป
