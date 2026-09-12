# test/fixtures — fixture แช่แข็งของ gate/cron test

| ไฟล์ | ที่มา | แช่แข็งเมื่อ | วันที่ราคาในไฟล์ |
|---|---|---|---|
| AAPL.html | reports/AAPL.html | 11 ก.ย. 2569 | 2026-09-10 |
| BBL.html | reports/BBL.html | 11 ก.ย. 2569 | 2026-09-04 |

- `index.js` ส่ง html + `TODAY` (วันถัดจากวันที่ราคา) — เทสตั้ง `process.env.STALE_TODAY = TODAY` ก่อนเรียก gate
- แช่แข็งใหม่เมื่อโครงรายงานเปลี่ยนจน anchor ใน self-test หาไม่เจอ (self-test จะฟ้อง "mutation ไม่เปลี่ยนอะไร") — คัดลอกไฟล์จริงมาทับ + แก้ TODAY + ตารางนี้
- ห้ามแก้ตัวเลขในไฟล์เหล่านี้ด้วยมือ — เทสทุกตัว derive ค่าจากไฟล์ ณ ตอนรัน

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
