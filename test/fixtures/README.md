# test/fixtures — fixture แช่แข็งของ gate/cron test

| ไฟล์ | ที่มา | แช่แข็งเมื่อ | วันที่ราคาในไฟล์ |
|---|---|---|---|
| AAPL.html | reports/AAPL.html | 11 ก.ย. 2569 | 2026-09-10 |
| BBL.html | reports/BBL.html | 11 ก.ย. 2569 | 2026-09-04 |

- `index.js` ส่ง html + `TODAY` (วันถัดจากวันที่ราคา) — เทสตั้ง `process.env.STALE_TODAY = TODAY` ก่อนเรียก gate
- แช่แข็งใหม่เมื่อโครงรายงานเปลี่ยนจน anchor ใน self-test หาไม่เจอ (self-test จะฟ้อง "mutation ไม่เปลี่ยนอะไร") — คัดลอกไฟล์จริงมาทับ + แก้ TODAY + ตารางนี้
- ห้ามแก้ตัวเลขในไฟล์เหล่านี้ด้วยมือ — เทสทุกตัว derive ค่าจากไฟล์ ณ ตอนรัน

---

## `*-v2.html` — สำเนา v2 ของ fixture ด้านบน (ระยะ 2 ส่วน C · Task 9)

| ไฟล์ | ที่มา | แช่แข็งเมื่อ |
|---|---|---|
| AAPL-v2.html | `migrateOne(AAPL.html)` ผ่าน `tools/migrate-v2.js --fixture` | 13 ก.ย. 2569 |
| BBL-v2.html | `migrateOne(BBL.html)` ผ่าน `tools/migrate-v2.js --fixture` | 13 ก.ย. 2569 |

- ที่มา: **migrator สร้างไฟล์เอง** ไม่ใช่ copy/แก้มือ — คำสั่งที่ใช้จริง:
  ```bash
  node tools/migrate-v2.js --fixture
  ```
  อ่าน `test/fixtures/{AAPL,BBL}.html` (v1 ด้านบน — **ไม่ถูกแตะ**) → เขียน `test/fixtures/{AAPL,BBL}-v2.html` ข้าง ๆ
- แช่แข็งใหม่ = รันคำสั่งเดิมซ้ำ (v1 fixture เปลี่ยนเมื่อไหร่ ต้องรันคำสั่งนี้ใหม่ให้ v2 ตามทัน)
- ห้ามแก้ตัวเลขในไฟล์เหล่านี้ด้วยมือ (กติกาเดียวกับ v1 ด้านบน) — ใช้เป็นฐานของ self-test/update-prices-test ทาง v2 ในระยะ 2 ส่วน D

---

## รูปคลังจริงของ cron ทาง v2 (ระยะ 2 ส่วน D · fix wave M10)

final review ส่วน D พบว่าเทส cron ทาง v2 ทั้งหมดยืนบน AAPL/BBL เท่านั้น ⇒ ไม่มี fixture ไหนครอบรูปที่ทำให้พังจริงบนคลัง
ชุดนี้คัดจากใบที่ simulation ของ review ชี้ตรง ๆ — v1 = `cp reports/<SYM>.html` · v2 = migrator สร้างเอง

| v1 / v2 | รูปที่ครอบ | แช่แข็งเมื่อ | วันที่ราคาในไฟล์ | TODAY |
|---|---|---|---|---|
| DDOG.html / DDOG-v2.html | `stock-meta.pe` 75 ยืนบนฐาน adjusted ขณะ `values.eps` = GAAP (px/eps ≈ 450) — F1 | 14 ก.ย. 2569 | 2026-09-11 | 2026-09-12 |
| SRE.html / SRE-v2.html | การ์ดปันผลพิมพ์ DPS `$2.38→$2.48→$2.58` (ฐาน W19) ≠ `values.dps` 2.58 — F1 | 14 ก.ย. 2569 | 2026-09-11 | 2026-09-12 |
| FTV.html / FTV-v2.html | หมวด 6 รวมปันผล (`scnBasis.divIncluded:true`) — การอนุมานพลิกฐานที่ราคา ×1.005/×0.995/×1.09 — F2 | 14 ก.ย. 2569 | 2026-09-11 | 2026-09-12 |
| CASY.html / CASY-v2.html | หมวด 6 ไม่รวมปันผล (`divIncluded:false`) — พลิกที่ ×0.995/×0.915/×1.045 — F2 | 14 ก.ย. 2569 | 2026-09-11 | 2026-09-12 |
| DPZ.html / DPZ-v2.html | วงเล็บทวนวันที่มีคำขยาย `(11 ก.ย. 2569 ตลาดปิด)` ที่ migrator คง literal — F3 | 14 ก.ย. 2569 | 2026-09-11 | 2026-09-12 |

- คำสั่งที่ใช้จริง (อ่าน `test/fixtures/<SYM>.html` → เขียน `<SYM>-v2.html` ข้าง ๆ · all-or-nothing):
  ```bash
  node tools/migrate-v2.js --fixture DDOG SRE FTV DPZ CASY
  ```
  ไม่ระบุ symbol = `AAPL BBL` เหมือนเดิม · symbol ต้องลงทะเบียนใน `index.js` (`SYMS` + `TODAY_OF`) ก่อน
- `test/migrate-v2-test.js` ยืนยัน `migrateOne(v1).out === <SYM>-v2.html` เป๊ะไบต์ (แบบ AAPL/BBL) + ตรึง "รูป" ของแต่ละใบไว้
  (รูปหาย = เทสของ fix wave ผ่านลอย ๆ) · แช่แข็งใหม่ = cp + รันคำสั่งเดิม + อัปเดตตารางนี้

---

## `vendor/` — payload ดิบของแหล่งข้อมูล (ให้เทส parser รันแบบ offline)

| ไฟล์ | ที่มา (URL) | probe เมื่อ | ตัดเหลือ |
|---|---|---|---|
| `vendor/AAPL-forecast.json` | `https://stockanalysis.com/stocks/aapl/forecast/__data.json` | 12 ก.ย. 2569 | `nodes[2]` — node เดียวที่มีคีย์ `estimates` (12.2 KB จากเต็ม 14.0 KB) |

- ใช้โดย `test/prep-stock-test.js` (WS9(a) — `fromForecast`/`forecastLine` ใน `tools/fetch-fundamentals.js` ฉีด `fetchImpl` ปลอมแทน network)
- คีย์ที่ parser อ่าน: `nodes[2].data[0].estimates` → `.stats.annual.{epsThis,epsNext}.this` (EPS ประมาณการ ฐาน adjusted)
  \+ `.table.annual.{fiscalYear[], lastDate}` (ป้ายปีงบ + index ของปีงบสุดท้ายที่ปิดแล้ว) · ช่อง eps ของปีอนาคตในตารางเป็น `"[PRO]"` จึงต้องอ่านค่าจาก `stats`
- เทสไม่ hard-code ตัวเลขจาก payload — ทุกเคส derive จากไฟล์ (ปีงบผูกกับ `lastDate`) ⇒ refresh แล้วยังเขียวถ้าโครงไม่เปลี่ยน
- refresh (เมื่อ SA เปลี่ยนโครง แล้วเทสฟ้องว่า parse ไม่ได้):

```bash
curl -s -A 'Mozilla/5.0' 'https://stockanalysis.com/stocks/aapl/forecast/__data.json' -o /tmp/f.json
node -e "const j=require('/tmp/f.json');const i=j.nodes.findIndex((n)=>n&&Array.isArray(n.data)&&n.data[0]&&typeof n.data[0]==='object'&&'estimates' in n.data[0]);if(i<0)throw new Error('ไม่เจอ node ที่มี estimates — โครงเปลี่ยน ต้อง probe ใหม่');require('fs').writeFileSync('test/fixtures/vendor/AAPL-forecast.json',JSON.stringify({type:'data',nodes:[j.nodes[i]]})+'\n')"
```
