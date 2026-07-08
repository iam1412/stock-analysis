# ระบบนับยอดวิว + Like/Dislike (Worker + Durable Object)

> โครงสร้าง infra — ไม่ใช้ตอนวิเคราะห์หุ้นปกติ · รายละเอียด deploy อยู่ใน `DEPLOY.md`
> `CLAUDE.md §8` มีแค่ pointer มาที่นี่

นับ/แสดงยอดเข้าชม + 👍/👎 — footer ของแต่ละ report + ต่อการ์ดในหน้า index

- **โครงสร้าง:** เว็บยังเป็น static (ไฟล์ `.html` เสิร์ฟตรงจาก edge ไม่ผ่าน Worker) มี Worker เล็ก ๆ `src/worker.js`
  ส่งต่อ `/api/*` ให้ **Durable Object `Counters` instance เดียว** (`env.COUNTERS.idFromName('global')`, SQLite-backed)
  = **source of truth** นับเป๊ะ strongly-consistent ทั่วโลก (single-threaded → ไม่มี per-colo divergence / lost update)
  - `POST /api/views/<SYM>` = +1 view · `GET …/<SYM>` = อ่าน {count,likes,dislikes} · `GET /api/views` = batch `{SYM:{c,l,d}}` (แคช edge 60 วิ; cache miss = 1 RPC `all()` → page size ไม่กระทบ API)
  - `POST /api/vote/<SYM>?from=&to=` = โหวต (none|like|dislike); **server คิด delta เอง (∈ -1..1)** กัน client ยิงเลขมั่ว
- **เริ่มนับใหม่จาก 0** — ไม่ migrate เลขเก่า; DO เป็น source of truth ตั้งแต่ deploy แรก (DO SQL ใช้ placeholder `?` ธรรมดา รองรับ workerd ชัวร์)
- **D1 = mirror สำรอง:** เขียน best-effort (`waitUntil`) ไม่อ่านบน hot path — `mirrorD1()` ใน worker · เก็บเป็น backup เฉย ๆ (ไม่ต้อง setup) ถอดทิ้งทีหลังก็ได้ (ดู DEPLOY.md "ถอด D1")
- **rate limit:** binding `VOTE_LIMITER`/`VIEW_LIMITER` ที่ขอบ (กัน spam ก่อนใช้โควต้า DO) — ความไม่เป๊ะ per-colo ไม่กระทบยอดแล้ว เพราะตัวนับจริงอยู่ใน DO
- **กันบอต (`countable()` ใน worker):** view/vote นับเฉพาะคำขอ "จากหน้าเว็บเราเอง" (`Origin`/`Sec-Fetch-Site: same-origin`) + UA ไม่เข้าข่ายบอต (`BOT_RE`, รวม HeadlessChrome/curl/python ฯลฯ) — บอตได้ค่าปัจจุบัน (200) แต่ไม่ +1 · ชั้นแรกคือดีไซน์ JS-required (บอตไม่รัน JS ไม่ยิง POST อยู่แล้ว) · ระดับ Cloudflare Bot Management ต้องมี zone/แพ็กเสียเงิน
- **กันซ้ำ:** view = `sessionStorage` · vote = `localStorage` (toggle/สลับได้) · symbol = whitelist จาก `/reports.json`
- **inject ตอน build เฉพาะใน `dist/`** (เหมือน footer ติดต่อ) — `reports/<SYMBOL>.html` ต้นฉบับไม่ต้องแก้ · route/JSON เหมือนเดิม สคริปต์ที่ inject ไม่ต้องแก้
- **ผ่าน quality gate:** inline `<script>` + `fetch()` same-origin (ห้าม `<script src>`) · ทุก `getElementById` มี element รองรับ · ไม่มี top-level await
- **deploy ครั้งเดียว (บัญชี Cloudflare):** แค่ `wrangler deploy` (push → Workers Builds รันให้เอง) — `[[migrations]] new_sqlite_classes` สร้าง DO class ให้ เริ่มนับจาก 0 ไม่ต้องตั้ง secret/seed
  - ⚠️ migration ต้องเป็น **`new_sqlite_classes`** (ไม่ใช่ `new_classes`) — KV backend เก่าเป็น paid-only; SQLite-backed DO เท่านั้นที่ฟรี
- **ขอบเขต gate:** `npm run verify` ตรวจเฉพาะ static — Worker/DO ทดสอบผ่าน `wrangler dev` (ดู `DEPLOY.md`)
- ปรับจำนวนหุ้น/หน้า (pagination) ที่ `PAGE_SIZE` ใน `build.js` (ค่าเริ่มต้น 12)
