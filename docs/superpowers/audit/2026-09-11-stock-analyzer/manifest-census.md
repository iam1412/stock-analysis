# Field manifest — census ทั้งคลัง (ระยะ 1 WS1 ข้อ 1–2)

- **วันที่:** 12 ก.ย. 2569 (เวลาไทย)
- **commit ที่วัด:** `88117675` (ก่อน commit ของงานนี้)
- **จำนวนไฟล์:** 908 ใบ (`reports/*.html` ทั้งหมด)
- **วิธีวัด:** `node tools/field-manifest.js --census` — เดินทุกไฟล์ผ่าน `expandReport()` แล้ว `buildCtx(html, file)`
  ของ gate จริง (`test/check-reports.js`) แล้วเรียก `extract(html, ctx)` ของทุกช่อง — **ctx เดียวกับที่ E/W code เห็น**
- **จำนวนช่อง: 70** — ไม่ใช่ 68 · code-audit §1.1 เดินเลขแถว #1–#68 แล้ว**แทรก** #25b/#63b ⇒ คำว่า "68 ช่อง"
  ในสเปก/แผนคือ *เลขแถวสูงสุด* ไม่ใช่จำนวนแถว (นับแถวในตารางจริง 12 ก.ย. 69 = 70) — **ห้ามตัดช่องทิ้งให้ครบ 68**

## กติกาตัดสิน `required` (Task 9 ใช้ตารางนี้)

| อัตราที่พบ | ตัดสิน |
|---|---|
| **≥ 99%** ของคลัง | `required: true` — ช่องที่ขาด = ของเสีย |
| **< 99%** | `required: false` (optional) — ไม่มีช่องนี้เป็นเรื่องปกติของรายงานบางใบ |
| **`extractor error` > 0** | **ห้ามตัดสิน** — ต้องแก้ extractor ให้คืน `{found:false}` แทนที่จะ throw ก่อน แล้ววัดใหม่ |

ผลรอบนี้: **`extractor error` = 0 ทุกช่อง** ⇒ ตัดสินได้ทั้งตาราง · แบ่งเป็น **≥99% 35 ช่อง · <99% 35 ช่อง**

> ในไฟล์ manifest ตอนนี้ `required` ยังเป็น `null` (ยังไม่ตัดสิน) ทุกช่อง **ยกเว้น**ช่องที่แผนสั่ง `false` ไว้ล่วงหน้า —
> Task 9 เป็นคนเขียนค่าจริงลงไปพร้อม `checkPairs` + W21/W22/W23

## ★ extractor 3 ตัวที่วัดรอบแรกได้ 0.0% เพราะตัวมันเองผิด (แก้แล้ว ก่อนตารางนี้)

ตัวเลข 0.0% บนช่องที่ code-audit ยืนยันว่ามีอยู่จริง = **การวัดพัง ไม่ใช่ข้อค้นพบ** — ไล่จนเจอเหตุทั้ง 3 ตัว:

| ช่อง | อาการ | เหตุ | หลังแก้ |
|---|---|---|---|
| f11 วันที่ทวนในวงเล็บ | 0.0% | `parsePriceDate()` รับ **HTML ที่ต้องสแกนหา anchor "ราคา"** ไม่ใช่สตริงวันที่เปล่า — ของเดิม slice วันที่ออกมาแล้วส่งเข้าไป ⇒ คืน `null` เสมอ | **0.8% (7 ใบ)** = AZN·CSGP·DPZ·HIG·PFE·PNC·SNNP ตรงกับที่ `price-date.js` ระบุไว้เองเป๊ะ |
| f12 disclaimer "ราคา ณ" | 0.0% | เหตุเดียวกัน (regex ดึงวันที่ออกมาก่อนแล้วค่อยส่ง) | **48.9% (444 ใบ)** |
| f63b "จาก ATH −X%" | 0.0% | คลังเขียน **% มาก่อน** (`~−34% จาก ATH`) รูป "จาก ATH −X%" ไม่มีในคลังเลย (0/908) | **1.0% (9 ใบ)** |

แก้ f11/f12 ด้วยการเพิ่ม wrapper ขั้นต่ำ `dateIso(hit)` ใน **โมดูลเจ้าของ** (`tools/price-date.js`) แล้วให้
`parsePriceDate` เรียกใช้ตัวเดียวกัน (พฤติกรรมเดิมไม่เปลี่ยน) — ไม่เขียน regex วันที่ซ้ำใน manifest

## ★ NEITHER 18 แถว → ได้เจ้าของแล้วทั้ง 18 (เกณฑ์จบ "NEITHER 18 → 0")

18 แถวที่ code-audit §1.1 ชี้ว่า "ไม่มี cron เขียน ไม่มี gate ตรวจ" ตอนนี้ผูกกับ manifest ครบทุกแถว —
`pair` = มีคู่ให้เทียบค่า (Task 9 ทำ `checkPairs`) · `presence` = ตรวจว่ามี/ไม่มี (ยังไม่เทียบค่า)

| id | ช่อง | binding | คู่เทียบ |
|---|---|---|---|
| f13 | footer "ข้อมูล ณ" | `presence` | — |
| f23 | การ์ดเป้านักวิเคราะห์ — ราคา | `presence` | — |
| f24 | เป้านักวิเคราะห์บน gauge scale | `pair` | → f23 (money) |
| f25 | rating นักวิเคราะห์ | `presence` | — |
| f25b | จำนวนสำนัก n= | `presence` | — |
| f32 | การ์ด BVPS | `presence` | — |
| f33 | การ์ด EPS (TTM) | `presence` | — |
| f41 | กรอบ 52 สัปดาห์ | `pair` | → f01 (contains, stale) |
| f46 | report-data.chart.fairLine | `pair` | → f44 (money) |
| f47 | legend "มูลค่าเหมาะสม $FV" | `pair` | → f44 (money) |
| f48 | การ์ด "โซนเริ่มทยอยสะสม < $FV" | `pair` | → f44 (money) |
| f49 | ป้าย gauge mFair "เหมาะสม $FV" | `pair` | → f44 (money) |
| f54 | vcell กรอบ (FV_LOW–FV_HIGH) | `pair` | → f43 (range) |
| f55 | การ์ด "P/E เฉลี่ย ~N ปี" | `pair` | → f04 (years, stale) |
| f58 | การ์ดกำไรสุทธิ / YoY | `presence` | — |
| f60 | การ์ดอัตรากำไรขั้นต้น | `presence` | — |
| f61 | การ์ด Beta | `presence` | — |
| f63b | "จาก ATH −X%" ใน prose | `presence` | — |

สรุป: **`pair` 8 แถว · `presence` 10 แถว** — ไม่เหลือแถวที่ไม่มีใครอ่าน
(binding ทั้ง manifest: `cron` 27 · `gate` 17 · `presence` 13 · `pair` 12 · `deferred` 1)

`deferred` 1 แถวคือ f64 (ราคาในร้อยแก้ว) — ตั้งใจเลื่อนไประยะ 2 ตามแผน ไม่ใช่ช่องที่ตกหล่น

## ตาราง census

| id | ช่อง | binding | พบ | อัตรา | extractor error | required |
|---|---|---|---|---|---|---|
| f01 | .px ราคา header | cron | 908/908 | 100.0% | 0 | null |
| f02 | stock-meta.price | cron | 908/908 | 100.0% | 0 | null |
| f03 | report-data.gauge.cur | cron | 908/908 | 100.0% | 0 | null |
| f04 | report-data.chart.data[] | cron | 908/908 | 100.0% | 0 | null |
| f05 | chart.min/max/grid | cron | 908/908 | 100.0% | 0 | null |
| f06 | chart.highlight | cron | 908/908 | 100.0% | 0 | null |
| f07 | gauge.min/max | cron | 908/908 | 100.0% | 0 | null |
| f08 | theme.chgBg/chgColor | cron | 908/908 | 100.0% | 0 | null |
| f09 | .chg ป้าย % รอบปี | cron | 908/908 | 100.0% | 0 | null |
| f10 | วันที่ราคา (px-meta) | cron | 908/908 | 100.0% | 0 | null |
| f11 | วันที่ทวนในวงเล็บ (คนละศักราช) | pair | 7/908 | 0.8% | 0 | false |
| f12 | disclaimer "ราคา ณ" | pair | 444/908 | 48.9% | 0 | null |
| f13 | footer "ข้อมูล ณ" | presence | 896/908 | 98.7% | 0 | null |
| f14 | pxIn value | cron | 908/908 | 100.0% | 0 | null |
| f15 | MOS .big | cron | 908/908 | 100.0% | 0 | null |
| f16 | stock-meta.mos/upside | cron | 908/908 | 100.0% | 0 | null |
| f17 | vcell ส่วนต่างจากราคา — ตัวเลข | cron | 905/908 | 99.7% | 0 | null |
| f18 | vcell ส่วนต่างจากราคา — ข้อความ | cron | 907/908 | 99.9% | 0 | null |
| f19 | class mos-verdict | cron | 908/908 | 100.0% | 0 | null |
| f20 | การ์ด P/E | cron | 558/908 | 61.5% | 0 | false |
| f21 | stock-meta.pe | cron | 831/908 | 91.5% | 0 | false |
| f22 | การ์ดเป้านักวิเคราะห์ — % | cron | 112/908 | 12.3% | 0 | false |
| f23 | การ์ดเป้านักวิเคราะห์ — ราคา | presence | 112/908 | 12.3% | 0 | false |
| f24 | เป้านักวิเคราะห์บน gauge scale | pair | 832/908 | 91.6% | 0 | false |
| f25 | rating นักวิเคราะห์ | presence | 462/908 | 50.9% | 0 | false |
| f25b | จำนวนสำนัก n= | presence | 90/908 | 9.9% | 0 | false |
| f26 | การ์ด Market Cap | cron | 875/908 | 96.4% | 0 | false |
| f27 | จำนวนหุ้น (.d ของ Market Cap) | presence | 875/908 | 96.4% | 0 | false |
| f28 | การ์ด P/S | cron | 13/908 | 1.4% | 0 | false |
| f29 | การ์ดปันผล % | cron | 645/908 | 71.0% | 0 | false |
| f30 | stock-meta.dividendYield | cron | 839/908 | 92.4% | 0 | false |
| f31 | การ์ด P/BV | cron | 530/908 | 58.4% | 0 | false |
| f32 | การ์ด BVPS | presence | 600/908 | 66.1% | 0 | false |
| f33 | การ์ด EPS (TTM) | presence | 841/908 | 92.6% | 0 | false |
| f34 | หมวด 6 ผลตอบแทนรวม % | cron | 795/908 | 87.6% | 0 | false |
| f35 | หมวด 6 %/ปี | cron | 267/908 | 29.4% | 0 | false |
| f36 | หมวด 6 "จากจุดเข้า" | cron | 907/908 | 99.9% | 0 | false |
| f37 | หมวด 6 ราคาเป้า 3 ฉาก | gate | 908/908 | 100.0% | 0 | null |
| f38 | หมวด 6 class ret pos/neg | presence | 908/908 | 100.0% | 0 | false |
| f39 | หมวด 6 ปันผลรวม 3 ปี | presence | 788/908 | 86.8% | 0 | false |
| f40 | หมวด 6 EPS ฐาน | gate | 775/908 | 85.4% | 0 | null |
| f41 | กรอบ 52 สัปดาห์ | pair | 792/908 | 87.2% | 0 | null |
| f42 | บรรทัดที่มา | gate | 908/908 | 100.0% | 0 | null |
| f43 | .fv-box .r FV | gate | 908/908 | 100.0% | 0 | null |
| f44 | report-data.fv (const FV) | gate | 908/908 | 100.0% | 0 | null |
| f45 | report-data.gauge.fair | pair | 908/908 | 100.0% | 0 | null |
| f46 | report-data.chart.fairLine | pair | 908/908 | 100.0% | 0 | null |
| f47 | legend "มูลค่าเหมาะสม $FV" | pair | 905/908 | 99.7% | 0 | null |
| f48 | การ์ด "โซนเริ่มทยอยสะสม < $FV" | pair | 898/908 | 98.9% | 0 | null |
| f49 | ป้าย gauge mFair "เหมาะสม $FV" | pair | 906/908 | 99.8% | 0 | null |
| f50 | ป้าย gauge mCur "ปัจจุบัน $px" | pair | 908/908 | 100.0% | 0 | null |
| f51 | gauge scale MOS20/MOS30 | gate | 908/908 | 100.0% | 0 | null |
| f52 | การ์ดจุดซื้อ MOS20/MOS30 | gate | 908/908 | 100.0% | 0 | null |
| f53 | gauge scale กรอบบน FV | gate | 774/908 | 85.2% | 0 | null |
| f54 | vcell กรอบ (FV_LOW–FV_HIGH) | pair | 899/908 | 99.0% | 0 | null |
| f55 | การ์ด "P/E เฉลี่ย ~N ปี" | pair | 514/908 | 56.6% | 0 | false |
| f56 | การ์ด ROE / ROA | gate | 745/908 | 82.0% | 0 | false |
| f57 | stock-meta.roe | gate | 790/908 | 87.0% | 0 | false |
| f58 | การ์ดกำไรสุทธิ / YoY | presence | 760/908 | 83.7% | 0 | false |
| f59 | การ์ดรายได้ TTM | gate | 866/908 | 95.4% | 0 | false |
| f60 | การ์ดอัตรากำไรขั้นต้น | presence | 411/908 | 45.3% | 0 | false |
| f61 | การ์ด Beta | presence | 508/908 | 55.9% | 0 | false |
| f62 | .mval ต่อวิธี | gate | 908/908 | 100.0% | 0 | null |
| f63 | .mdesc ตัวคูณ | gate | 908/908 | 100.0% | 0 | null |
| f63b | "จาก ATH −X%" ใน prose | presence | 9/908 | 1.0% | 0 | false |
| f64 | ราคาใน prose | deferred | 798/908 | 87.9% | 0 | false |
| f65 | % ของราคาเป้าใน prose | gate | 379/908 | 41.7% | 0 | false |
| f66 | meta ai-model | gate | 908/908 | 100.0% | 0 | null |
| f67 | .sub คำโปรย | gate | 908/908 | 100.0% | 0 | null |
| f68 | tags (sidecar) | gate | 908/908 | 100.0% | 0 | false |
