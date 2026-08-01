# prep-stock.js — one-shot pre-fetch pack + cross-verify verdict

**วันที่:** 2 ส.ค. 2569 · **สถานะ:** อนุมัติแล้ว (ต่อจาก spec price-flags-noise-reduction ข้อ 3)

## ปัญหา

controller เตรียมหุ้น NEW ต้องรัน `fetch-fundamentals` + (worker รัน `fetch-facts` แยกอีก turn)
และ invariant "cross-source verify ราคา ≥2 แหล่ง / ต่าง >5% → หยุด" ยังพึ่งการอ่านตีความของ AI
ทั้งที่ตัวเลข Δ ถูกพิมพ์อยู่แล้วใน output ของ fetch-fundamentals

## การแก้: `tools/prep-stock.js <SYMBOL> [--th] [--update] [--brand "#rrggbb"]`

- **Orchestrator บาง ๆ** — spawn สคริปต์เดิมเป็น child process (`fetch-facts`, `fetch-fundamentals`,
  `pick-brand`) ไม่ refactor ของเดิม แต่ละตัวยังใช้เดี่ยวได้ · facts+fundamentals รันขนานกัน
- **Output ต่อกันเป็น block เดียว** พร้อมวางลง `{{FUNDAMENTALS}}` ของ agent-prompt:
  1. บรรทัด `CROSS-VERIFY` (verdict บนสุด — controller เห็นทันที)
  2. output ของ fetch-fundamentals ตามเดิม (Yahoo + SA + Δ + ตารางงบ 5 ปี)
  3. output ของ fetch-facts ตามเดิม (NEW เท่านั้น — `--update` ข้าม เพราะราคา/กราฟมาจาก
     `update-prices --force`)
  4. output ของ pick-brand `--auto` (เฉพาะเมื่อส่ง `--brand` — ปกติ worker เลือกสีแบรนด์เอง
     เพราะต้องรู้สีโลโก้บริษัท ซึ่งไม่ deterministic)
- **Verdict** (parse จากบรรทัด `Δ ราคา=X% · Δ EPS(TTM)=Y%` ที่ fetch-fundamentals พิมพ์ —
  format ของเราเอง มี unit test คุม):
  - ราคา: Δ ≤2% → ✅ ผ่าน · 2<Δ≤5% → ⚠ ตรวจเพิ่ม (วันที่ราคา/intraday ต่างกัน) ·
    **Δ >5% → 🛑 หยุดตาม invariant CLAUDE.md §2 + exit code 2** (controller เห็นใน Bash ทันที)
  - EPS: Δ ≤2% → ✅ · เกิน → ⚠ ขัดกัน — agent ตรวจ dil/basic/งวดก่อนเขียน (ไม่ hard-fail —
    ความต่าง EPS มีเหตุชอบธรรมหลายแบบ ให้คนตัดสิน) · เทียบไม่ได้ → ⚠
  - ได้แหล่งเดียว → ⚠ ต้อง cross-verify มือตาม fallback เดิม (exit 0 — เส้นทาง WebFetch targeted
    ยังใช้ได้)
- exit codes: `0` ปกติ/warn · `1` usage ผิด/ล้มทั้งหมด · `2` = ราคาขัดแหล่ง >5% (ห้ามเผยแพร่)

## Test (`test/prep-stock-test.js`, offline — npm run test:prep)

- `parseDeltas()`: อ่าน Δ จาก fixture string format จริง (ทั้งเคสมี Δ EPS / เทียบไม่ได้ / แหล่งเดียว)
- `verdict()`: ขอบเขต 2/5 เป๊ะ (2.0 ✅ · 2.1 ⚠ · 5.0 ⚠ · 5.1 🛑 exit 2) + เคส EPS + แหล่งเดียว
- `parseArgs()`: `--th`/`--update`/`--brand` + validation hex

## เอกสารที่ตามแก้

- CLAUDE.md §4 (controller pre-fetch) · docs/orchestration.md §3 · `_template/agent-prompt.md`
  (block มี FACTS → worker ห้ามรัน fetch-facts ซ้ำ) · SKILL.md STEP 1
