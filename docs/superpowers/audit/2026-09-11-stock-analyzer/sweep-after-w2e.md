# Sweep ราคาสังเคราะห์หลังเลื่อน W16/W17/W19/W20 → error — ผลวัดจริง 12 ก.ย. 2569

> วัดบน worktree `stock-analyzer-audit-9678cd` branch `claude/audit-p1-a-cron-gate` @ `f6668704` (ก่อน commit ไฟล์นี้) · เวลาไทย (UTC+7)
> เกณฑ์มาจาก `phase0-exit.md` §6 ("★ เงื่อนไขก่อนระยะ 1"): ต้องรัน `sweep.sh` ซ้ำหลังเลื่อน W16/W17/W19/W20 → `level:'error'` และผูกเป็นเกณฑ์จบระยะ 1 — เดิม (phase0-exit §1) รันตอนสี่รหัสนี้ยังเป็น warning เฉย ๆ, sweep นี้คือรอบแรกที่รันหลังเลื่อนเป็น error

สคริปต์ = `docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh` (ย้ายจาก scratchpad ของ session ที่หายไปพร้อม phase0-exit §1 — ตอนนี้เก็บถาวรในเรโปแล้ว) เขียนราคาสังเคราะห์ 12 ค่า (×0.5 … ×3.0 ของราคาในไฟล์) ลง `reports/AAPL.html` + `reports/BBL.html` ของจริงผ่าน `patchReport()` (เส้นทางเดียวกับ cron) แล้วรัน `npm run verify` ทั้ง 14 ขั้นทุกครั้ง คืนไฟล์ด้วย `git checkout --` หลังทุกรอบ (ห้าม stash — worktree ใช้ stash stack ร่วมกัน)

## หมายเหตุการรัน — สองแบตช์

Bash tool ของ session นี้จำกัดเวลาต่อ call ที่ 10 นาที และ `npm run verify` แบบเต็ม (14 ขั้น) ต่อราคาใช้เวลา ~30–60 วิ ⇒ 12 ราคาต่อเนื่องเสี่ยงเกิน limit ของ **การเรียกเครื่องมือ** (ไม่ใช่ข้อจำกัดของ `sweep.sh` เอง) รอบแรกที่ลองรันเป็น background process ก็ถูก terminate ที่ ×1.15 เพราะ background process ตายไปพร้อม turn ของ agent — ไม่เกี่ยวกับ timeout ของ `sweep.sh`

จึงรันซ้ำเป็น **2 แบตช์ในโฟร์กราวด์** โดยตรง (คนละคำสั่ง `sh sweep.sh` คนละ `PRICES`) ใช้ `SWEEP_DIR` เดียวกันตลอด — **`sweep.sh` เองยังเป็นสคริปต์เดียวที่รันครบ 12 ราคาในคำสั่งเดียวได้ตามปกติ** (ตามที่ phase0-exit §1 พิสูจน์ไว้แล้ว และ Part F/Task 25 จะรันซ้ำแบบคำสั่งเดียว) การแบ่งแบตช์รอบนี้เป็นข้อจำกัดของเครื่องมือรัน ไม่ใช่การเปลี่ยนพฤติกรรมสคริปต์:

```bash
PRICES="0.5 0.7 0.85 0.95 1.0 1.05" SWEEP_DIR="$SCR" sh docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh
PRICES="1.15 1.3 1.5 1.8 2.2 3.0"   SWEEP_DIR="$SCR" sh docs/superpowers/audit/2026-09-11-stock-analyzer/sweep.sh
```

แต่ละแบตช์พิมพ์ `sweep fails=N` ของตัวเอง — **นับว่ารวม fails=0 ก็ต่อเมื่อทั้งสองแบตช์ได้ 0** (ครบ)

## ผลรัน (12 บรรทัด รวมสองแบตช์ + สรุปแต่ละแบตช์)

แบตช์ 1 (×0.5–×1.05):

```
×0.5 ok  error 0 • warning 151
×0.7 ok  error 0 • warning 151
×0.85 ok  error 0 • warning 150
×0.95 ok  error 0 • warning 150
×1.0 ok  error 0 • warning 149
×1.05 ok  error 0 • warning 149
sweep fails=0
```

แบตช์ 2 (×1.15–×3.0):

```
×1.15 ok  error 0 • warning 150
×1.3 ok  error 0 • warning 150
×1.5 ok  error 0 • warning 150
×1.8 ok  error 0 • warning 150
×2.2 ok  error 0 • warning 150
×3.0 ok  error 0 • warning 150
sweep fails=0
```

**รวม: 12/12 ราคาผ่าน · sweep fails=0 ทั้งสองแบตช์**

หลังจบทั้งสองแบตช์ — `git status --short` มีแค่ไฟล์ใหม่สองไฟล์ของ task นี้ (`sweep.sh` ที่ commit ไปก่อนหน้า + `sweep-after-w2e.md` นี้เอง) ไม่มีไฟล์ใน `reports/` หรือ `reports.json` ค้าง และ `git diff --stat reports.json` ว่าง — ไฟล์ถูก `git checkout --` คืนครบทุกรอบ (14 รอบ: 12 ครั้งท้าย loop + trap EXIT 1 ครั้งต่อแบตช์ (2 แบตช์))

## สถานะ gate ต่อราคา (บรรทัดสรุปของ `check-reports` ในแต่ละ log — บรรทัดแรกที่ตรงแพทเทิร์น `error N • warning N`)

| ตัวคูณราคา | ผล | ตัวคูณราคา | ผล |
|---|---|---|---|
| ×0.5 | error 0 · warning 151 | ×1.15 | error 0 · warning 150 |
| ×0.7 | error 0 · warning 151 | ×1.3 | error 0 · warning 150 |
| ×0.85 | error 0 · warning 150 | ×1.5 | error 0 · warning 150 |
| ×0.95 | error 0 · warning 150 | ×1.8 | error 0 · warning 150 |
| **×1.0 (ราคาจริง)** | **error 0 · warning 149** | ×2.2 | error 0 · warning 150 |
| ×1.05 | error 0 · warning 149 | ×3.0 | error 0 · warning 150 |

`check-site` (ขั้นสุดท้ายของ `npm run verify` ที่ตรวจ `dist/`) รายงาน `error 0 • warning 0` ในทุก log ทั้ง 12 ราคาเช่นกัน (ตรวจแยกแล้วว่าไม่ใช่ log ที่ตัดตอน)

**อ่านผล:** `error` = 0 ทุกราคา รวมถึงหลังเลื่อน **W16/W17/W19/W20 → error** ⇒ ไม่มีราคาสังเคราะห์ไหนทำให้ทั้งสี่รหัสนี้ (หรือรหัส error อื่น) ยิงผิดจังหวะ — นี่คือสิ่งที่เกณฑ์ระยะ 1 ต้องพิสูจน์ (phase0-exit §6: "ต้องรัน sweep.sh ซ้ำหลังเลื่อนเป็น E … ไม่งั้นได้ cron ที่ล้มตามราคาอีกรอบ") ตัวเลข `warning` (149→150/151) ที่เหลือขยับเหมือน phase0-exit §1 เป๊ะ (คลาส W06/W15 ของ AAPL/BBL เอง ซึ่งไม่ใช่ 4 รหัสที่เพิ่งเลื่อน) ยืนยันว่า healer/checker ของ W16/W17/W19/W20 สมมาตรกันตลอดช่วงราคาที่กวาด (×0.5–×3.0) ไม่ต้องแก้ `plan`/healer เพิ่ม

## เกณฑ์จบระยะ 1 (จาก phase0-exit §6)

- [x] รัน `sweep.sh` ซ้ำหลังเลื่อน W16/W17/W19/W20 → error
- [x] `sweep fails=0` (ครบทั้งสองแบตช์ = 12/12 ราคา)
- [x] ไม่มีรหัสไหนใน 4 รหัสที่เพิ่งเลื่อนต้องเลื่อนกลับเป็น warn
- [x] `git status --short` สะอาด (ไม่นับไฟล์ใหม่ของ task นี้เอง) · `git diff --stat reports.json` ว่าง

commit ที่วัด: `f6668704` (HEAD ของ `claude/audit-p1-a-cron-gate` ก่อน commit ไฟล์นี้ — commit ที่ยกระดับ W16/W17/W19/W20 → error รวมอยู่ในประวัติของ branch นี้แล้ว) · วันที่วัด: 12 ก.ย. 2569
