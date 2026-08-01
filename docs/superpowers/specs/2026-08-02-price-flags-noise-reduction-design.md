# ลดคิว price-flags noise: MOS dead-band + gauge auto-rescale

**วันที่:** 2 ส.ค. 2569 · **สถานะ:** อนุมัติแล้ว (user เคาะ dead-band ±3 ตาม W06)

## ปัญหา

คิว `price-flags.json` ณ 1 ส.ค. 2569 มี 23 ตัว — 17 ตัวเป็น `mos-sign-flip` และ 4 ตัวเป็น
`outside-gauge-range` ซึ่งส่วนใหญ่ราคาขยับ <2% (DUK −0.7%, AMP 0.3%, AMGN 0.8%)
แต่ละ flag เผา UPDATE-LIGHT agent ~11 turns/0.7M cacheR ทั้งที่เนื้อหาวิเคราะห์ไม่เปลี่ยน
และหุ้นที่แกว่งรอบ FV จะ flip เข้าคิวซ้ำเรื่อย ๆ (recurring cost)

## การแก้ (ทั้งหมดใน `tools/update-prices.js` — build-time cron, ไม่มีส่วน Worker/runtime)

### 1. Dead-band สำหรับ mos-sign-flip

- ค่าคงที่ `MOS_FLIP_DEADBAND_PP = 3` — ตรงกับ dead-band ±3% ของ gate W06
  (prose "ถูก/แพงเล็กน้อย" ไม่ขัด gate ในช่วงนี้ · W04 ไม่เปลี่ยน band เพราะ |MOS|<10 ทั้งสองฝั่ง = "bad")
- ใน `decide()`: MOS พลิกเครื่องหมาย **และ** (|MOS เก่า| ≤ 3 จุด **และ** |MOS ใหม่| ≤ 3 จุด)
  → ไม่ freeze, patch ผ่าน (patcher เขียนเครื่องหมาย −/+ ตามค่าจริงอยู่แล้ว)
- ฝั่งใดฝั่งหนึ่งเกิน 3 จุด → freeze `mos-sign-flip` เหมือนเดิม (เรื่องราวเปลี่ยนจริง ให้ AI ดู)

### 2. Gauge auto-rescale แทน freeze `outside-gauge-range`

- ตัดเหตุ freeze `outside-gauge-range` ออกจาก `decide()` — drift ใหญ่จริงโดนเกณฑ์ 15%/25% ก่อนเสมอ
- ใน `patchReport()`: ราคาทะลุ `gauge.max` → `max = ceil(ราคา×1.05)` (คงจำนวนทศนิยมเดิมของขอบ) ·
  หลุด `gauge.min` → `min = floor(ราคา×0.95)` — ขยายอย่างเดียว ไม่หด, `fair`/ป้าย scale ไม่แตะ
- ตำแหน่ง marker คำนวณโดย engine จาก `report-data.gauge` ล้วน ๆ (`_template/engine.js` gpos) —
  แก้ JSON จุดเดียวพอ · ×1.05 ทำให้ราคาอยู่ในขอบแบบ strict → warning check-site
  "marker นอกช่วง gauge" หายด้วย
- คำเตือน `--force` เดิม ("แก้ gauge min/max เองด้วย") หมดความจำเป็น — ลบ

### 3. Test (`test/update-prices-test.js`)

- flip ใน dead-band → update · flip เกิน dead-band (ฝั่งเดียวหรือสองฝั่ง) → freeze · ขอบเขต 3.0 จุดพอดี → update
- ราคานอก gauge → `decide()` update · `patchReport()` ขยาย bounds ถูกฝั่ง อีกฝั่งคงเดิม · เครื่องหมาย `.big` พลิกตามค่าจริง
- `--force` พฤติกรรมเดิมทุกเคส

## ผลที่คาด

- คิวปัจจุบันเหลือเฉพาะตัวที่ AI จำเป็น (AMZN +15.3%, RDDT −21% + flip ที่เกิน dead-band)
- flag เดิมเคลียร์ตัวเองในรอบ cron ถัดไปตาม snapshot logic ของ `mergeFlags` — ไม่ต้องล้างมือ
- เอกสารที่ต้องตามแก้: header comment ใน update-prices.js · `docs/price-refresh.md` · CLAUDE.md §9
