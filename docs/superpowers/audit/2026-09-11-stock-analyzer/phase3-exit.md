# ระยะ 3 — เกณฑ์จบ/checkpoint (วัดจริง)

## §1 — Task 13a: cron รอบเดิมวันนี้ (#40 checkpoint — พิสูจน์ write path จริงบนคลัง v2)

**Run:** [`34930505064`](https://github.com/iam1412/stock-analysis/actions/runs/34930505064) · schedule-triggered · 2026-09-15 04:52:32–05:00:58 UTC (~8.5 นาที) · conclusion: success
**Commit:** `135eeab3` "price: refresh 658 symbols (2026-09-15)" บน `main`

### ผลตรวจ 5 จุดตามแผน

1. **จำนวนที่ patch สำเร็จ**: `เขียนแล้ว อัปเดต 658 · ไม่เปลี่ยน 4 · ข้ามเพราะตลาดเปิด 234 · freeze 12 · error 0 (ทั้งหมด 908)` — ✓ ทั้งเว็บ 1729 บรรทัด
2. **patch-rejected / patch-failed บนคลัง v2**: **0 / 0** ทั้งคู่ (grep ทั้ง log)
3. **gate หลัง patch**: `check-reports` 908/908 · error 0 · warning 236 (ระดับเดียวกับ baseline หลัง Task 8/10/11 ที่ 235 — ต่างเพราะราคาขยับทำให้บางไฟล์ข้ามพ้น/เข้าเงื่อนไข W23 ตามราคาจริง ไม่ใช่ regression) · `check-site` error 0 warning 0
4. **สุ่ม `git show` 5 ไฟล์ v2 ที่ patch จริง** (AMKR/AAPL/WMT/BNY/WWD — รวม 2 ใบที่ migrate จาก Task 4/5 ของระยะ 3 เอง): มีแค่ hunk ของ `report-data.values`/`stock-meta` JSON, จุดกราฟ (`["ก.ย.26", px]`), `highlight` array (derive จากราคา), และการ์ด derived (`Forward P/E`, `Market Cap`, `P/BV`, `เงินปันผล %`) — **ไม่แตะ prose/EPS/FV เลยสักไฟล์** ตรงสัญญา cron 100%
5. **#33 (ยังไม่ merge Task 7 ตอนรอบนี้)**: วันนี้วันอังคาร (วันทำการ) รอบนี้รันขณะ SET ยังเปิดตามเวลาเดิม (04:52 UTC = 11:52 น. ไทย) ⇒ หุ้นไทยถูกข้าม 234 ตัว "ข้าม — ตลาดยังเปิด" ตามที่ #33 อธิบายไว้ — **นี่คือพฤติกรรมเดิมก่อนแก้ ยืนยันปัญหา #33 มีจริงตามที่วัดไว้** (ยังไม่ใช่ผลของ Task 7 ที่รอ merge อยู่)

### สรุป
✅ **#40 ผ่าน** — cron write path บนคลัง v2 865+ ใบ (ปัจจุบัน 883/908 หลัง Task 6) ทำงานถูกต้องบนราคาที่ขยับจริง ไม่มี regression ⇒ **Task 7 (PR #45), Task 9, Task 12 merge ได้แล้ว**

---

## §2 — Task 13b: cron รอบแรกที่เวลาใหม่ (#33 verification)

_รอ Task 7 merge ก่อน — จะเติมหลัง merge PR #45 และรอบ cron แรกที่เวลาใหม่รันจริง_
