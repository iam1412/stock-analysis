# test/fixtures — fixture แช่แข็งของ gate/cron test

| ไฟล์ | ที่มา | แช่แข็งเมื่อ | วันที่ราคาในไฟล์ |
|---|---|---|---|
| AAPL.html | reports/AAPL.html | 11 ก.ย. 2569 | 2026-09-10 |
| BBL.html | reports/BBL.html | 11 ก.ย. 2569 | 2026-09-04 |

- `index.js` ส่ง html + `TODAY` (วันถัดจากวันที่ราคา) — เทสตั้ง `process.env.STALE_TODAY = TODAY` ก่อนเรียก gate
- แช่แข็งใหม่เมื่อโครงรายงานเปลี่ยนจน anchor ใน self-test หาไม่เจอ (self-test จะฟ้อง "mutation ไม่เปลี่ยนอะไร") — คัดลอกไฟล์จริงมาทับ + แก้ TODAY + ตารางนี้
- ห้ามแก้ตัวเลขในไฟล์เหล่านี้ด้วยมือ — เทสทุกตัว derive ค่าจากไฟล์ ณ ตอนรัน
