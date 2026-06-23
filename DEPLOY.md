# Deploy ขึ้น Cloudflare Workers (Static Assets + Durable Object)

เว็บนี้เป็น static site — Cloudflare ดึงโค้ดจาก GitHub → รัน `npm run build` → `wrangler deploy`
เสิร์ฟไฟล์ในโฟลเดอร์ `dist/` เป็นเว็บ static (ไฟล์ `.html` เสิร์ฟตรงจาก edge ไม่ผ่าน Worker → ฟรี/ไม่จำกัด)

มี Worker เล็ก ๆ (`src/worker.js`) + **Durable Object** (`Counters`, SQLite-backed) เป็น **source of truth**
ของยอดวิว/ไลก์ — นับเป๊ะ strongly-consistent ทั่วโลก (instance เดียว) ทำงานเฉพาะเส้นทาง `/api/*`
(ดูหัวข้อ "ระบบนับยอดวิว" ด้านล่าง) · **D1** ตาราง `views` เดิมเหลือเป็นแค่ *mirror สำรอง* ชั่วคราว

## โครงสร้างโปรเจกต์

```
stock-analysis/
├─ reports/            ← วางไฟล์รายงานหุ้นแต่ละตัวไว้ที่นี่
│  ├─ GOOGL.html
│  └─ ...
├─ build.js            ← สคริปต์ build
├─ package.json        ← npm run build
├─ wrangler.toml       ← [assets] directory = "./dist"
├─ _headers            ← HTTP headers
└─ dist/               ← ผลลัพธ์ build (gitignore — Cloudflare สร้างเอง)
```

## build.js ทำอะไร

1. สแกนไฟล์รายงาน `reports/<SYMBOL>.html` ทั้งหมด
2. สร้างหน้า `index.html` (รวมรายงาน) จาก metadata ของแต่ละไฟล์
3. คัดลอกรายงานแบบ **flatten** ลง `dist/` + คัดลอก `_headers`

> **เพิ่มหุ้นใหม่:** วางไฟล์ `reports/<SYMBOL>.html` แล้ว push — หน้า index อัปเดตเองตอน build

## URL หลัง deploy

```
https://stock-ai.dotent.workers.dev/            → หน้ารวมรายงาน
https://stock-ai.dotent.workers.dev/GOOGL.html  → รายงาน GOOGL
https://stock-ai.dotent.workers.dev/GOOGL       → ได้เหมือนกัน (clean URL)
```

## รัน build ในเครื่อง (ทดสอบ)

```bash
npm run build      # หรือ: node build.js
open dist/index.html
```

ไม่ต้องติดตั้ง dependency ใด ๆ (ใช้แค่ Node.js ≥ 18)

---

## ตั้งค่าบน Cloudflare (UI ใหม่ — ใช้ Workers)

### 1. ลบโปรเจกต์เดิมที่พังก่อน (กันชื่อชนกัน)

**Workers & Pages** → คลิกโปรเจกต์ `stock-analysis` → **Settings** → ล่างสุด → **Delete**
(ลบให้หมดทุกตัวที่ชื่อ `stock-analysis`)

### 2. สร้าง Worker จาก GitHub

**Workers & Pages → Create → Workers → Import a repository** (หรือ "Deploy from Git")
→ เลือก repo `iam1412/stock-analysis`

### 3. ตั้งค่า build

| ช่อง | ค่า |
|------|-----|
| **Build command** | `npm run build` |
| **Deploy command** | `npx wrangler deploy` |
| **Branch** | `main` |

`wrangler.toml` มี `[assets] directory = "./dist"` อยู่แล้ว → `wrangler deploy` จะอัปโหลดไฟล์ใน `dist/` เป็นเว็บ static อัตโนมัติ

### 4. กด Save and Deploy

หลังจากนี้ทุกครั้งที่ push ขึ้น `main` → Cloudflare build & deploy ใหม่อัตโนมัติ

---

### Deploy ตรงจากเครื่อง (สำรอง)

```bash
npm install -g wrangler
wrangler login
npm run build
wrangler deploy        # อ่าน [assets] จาก wrangler.toml
```

ผูก custom domain ได้ที่ **Worker → Settings → Domains & Routes**

---

## ระบบนับยอดวิว + Like/Dislike (Worker + Durable Object)

แสดงยอดเข้าชม + 👍/👎 ในแต่ละหน้า report (footer) และต่อการ์ดในหน้า index (👁 + 👍 + 👎)

**สถาปัตยกรรม** (ดู `src/worker.js`):
- ไฟล์ `.html` ยังเสิร์ฟตรงจาก edge cache — Worker ไม่ถูกเรียก (`run_worker_first=false`)
- มีเฉพาะ `/api/*` ที่เรียก Worker → ส่งต่อให้ **Durable Object `Counters` instance เดียว** (`idFromName('global')`)
  ทุก isolate/colo ชี้มาที่เดียวกัน → single-threaded SQLite → **นับเป๊ะ ไม่มี per-colo divergence**:
  - `POST /api/views/<SYM>` → +1 view, คืน `{count, likes, dislikes}` (report เปิดครั้งแรกของ session)
  - `GET  /api/views/<SYM>` → อ่าน `{count, likes, dislikes}`
  - `GET  /api/views` → batch ทุกตัว `{SYM:{c,l,d}}` (index ยิงครั้งเดียว/โหลด — แคช edge 60 วิ; cache miss = 1 RPC `all()`)
  - `POST /api/vote/<SYM>?from=&to=` → โหวต (from/to ∈ none|like|dislike); **server คำนวณ delta เอง (∈ -1..1)** กัน client ยิงเลขมั่ว
- กันนับวิวซ้ำด้วย `sessionStorage` · กันโหวตซ้ำด้วย `localStorage` (toggle/สลับได้) · กัน symbol ขยะด้วย whitelist จาก `/reports.json`
- **rate limit** (binding `VOTE_LIMITER` 5/60วิ, `VIEW_LIMITER` 30/60วิ) ยังอยู่ที่ขอบ — เป็นด่านกัน spam ก่อนใช้โควต้า DO
  (ความ "ไม่เป๊ะ per-colo" ของมันไม่กระทบยอดอีกต่อไป เพราะตัวนับจริงอยู่ใน DO ที่ double-count ไม่ได้)
- **เริ่มนับใหม่จาก 0** — ไม่ migrate เลขเก่า; DO เป็น source of truth ตั้งแต่ deploy แรก
- **D1 = mirror สำรอง**: ทุก view/vote เขียน D1 แบบ best-effort (`waitUntil`) ไม่อ่านกลับบน hot path —
  เก็บไว้เป็น backup เฉย ๆ (ไม่ต้อง setup) · จะถอดทิ้งทีหลังก็ได้ (ดู "ถอด D1" ท้ายหัวข้อ)

**Deploy ครั้งเดียว (ต้องใช้บัญชี Cloudflare) — แค่ deploy จบ ไม่ต้องตั้ง secret/seed:**

```bash
npx wrangler login
npx wrangler deploy   # [[migrations]] new_sqlite_classes=["Counters"] จะสร้าง DO class ให้เอง (SQLite, ฟรี)
                      # เริ่มนับจาก 0 ทันที — view/like/dislike ทำงานครบ
```

> ⚠️ migration ต้องเป็น **`new_sqlite_classes`** (ไม่ใช่ `new_classes`) — KV backend แบบเก่าเป็น **paid-only**;
> มีแต่ SQLite-backed DO ที่สร้างได้บน Free plan · deploy ครั้งแรกสร้าง class เอง ไม่ต้องรันคำสั่งแยก
> (push ขึ้น GitHub → Workers Builds รัน `wrangler deploy` ให้เองอยู่แล้ว ไม่ต้องรันมือ)

**ทดสอบในเครื่อง:**

```bash
npm run build
npx wrangler dev          # workerd จริง + SQLite DO local → เปิด http://localhost:8787/GOOGL เห็นตัวนับเด้ง
# ยิง: curl -X POST localhost:8787/api/views/GOOGL ; curl localhost:8787/api/views
```

**โควต้า Free plan (เหลือเฟือ — ใช้ ~1–4%):** DO ~100,000 req/วัน · เขียน ~100,000 แถว/วัน (1 แถว/การเขียน ไม่มี amplification) ·
อ่าน ~5M แถว/วัน · storage 5GB · compute ~13,000 GB-s/วัน — เงื่อนไขเดียวที่ต้องรักษา = **อย่าถอด edge cache 60 วิ ออกจาก `GET /api/views`**
(ไฟล์ static ไม่นับโควต้า) · `npm run verify` ตรวจเฉพาะ static — ตัว Worker/DO ทดสอบผ่าน `wrangler dev`

**ถอด D1 (ออปชัน — ทำเมื่อไม่อยากเก็บ backup แล้ว):** ลบโค้ด `mirrorD1()` + การเรียกใน `src/worker.js`,
ลบบล็อก `[[d1_databases]]` ใน `wrangler.toml`, ลบ `schema.sql`/`migrate-votes.sql` + สคริปต์ `d1:*` ใน `package.json`
แล้วค่อยลบ D1 database ใน dashboard — หลังจากนั้น DO เป็นที่เก็บข้อมูลที่เดียวล้วน ๆ
