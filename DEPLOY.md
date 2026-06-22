# Deploy ขึ้น Cloudflare Workers (Static Assets + D1)

เว็บนี้เป็น static site — Cloudflare ดึงโค้ดจาก GitHub → รัน `npm run build` → `wrangler deploy`
เสิร์ฟไฟล์ในโฟลเดอร์ `dist/` เป็นเว็บ static (ไฟล์ `.html` เสิร์ฟตรงจาก edge ไม่ผ่าน Worker → ฟรี/ไม่จำกัด)

มี Worker เล็ก ๆ (`src/worker.js`) + ฐานข้อมูล **D1** สำหรับ **นับยอดวิว** เท่านั้น —
ทำงานเฉพาะเส้นทาง `/api/views/*` (ดูหัวข้อ "ระบบนับยอดวิว" ด้านล่าง)

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

## ระบบนับยอดวิว + Like/Dislike (Cloudflare Worker + D1)

แสดงยอดเข้าชม + 👍/👎 ในแต่ละหน้า report (footer) และต่อการ์ดในหน้า index (👁 + 👍)

**สถาปัตยกรรม** (ดู `src/worker.js`):
- ไฟล์ `.html` ยังเสิร์ฟตรงจาก edge cache — Worker ไม่ถูกเรียก (`run_worker_first=false`)
- มีเฉพาะ `/api/*` ที่เรียก Worker → query D1 (ตาราง `views`: `count`, `likes`, `dislikes`):
  - `POST /api/views/<SYM>` → +1 view, คืน `{count, likes, dislikes}` (report เปิดครั้งแรกของ session)
  - `GET  /api/views/<SYM>` → อ่าน `{count, likes, dislikes}`
  - `GET  /api/views` → batch ทุกตัว `{SYM:{c,l,d}}` (index ยิงครั้งเดียว/โหลด — แคช edge 60 วิ)
  - `POST /api/vote/<SYM>?from=&to=` → โหวต (from/to ∈ none|like|dislike); **server คำนวณ delta เอง (∈ -1..1)** กัน client ยิงเลขมั่ว
- กันนับวิวซ้ำด้วย `sessionStorage` · กันโหวตซ้ำด้วย `localStorage` (toggle/สลับได้) · กัน symbol ขยะด้วย whitelist จาก `/reports.json`

**ตั้งค่าครั้งแรก (ครั้งเดียว — ต้องใช้บัญชี Cloudflare):**

```bash
npx wrangler login
npx wrangler d1 create stockai_d1          # → คัด database_id มาใส่ wrangler.toml

# ตารางใหม่ (ยังไม่เคยสร้าง):
npm run d1:init:remote                    # = d1 execute stockai_d1 --remote --file=./schema.sql (มีคอลัมน์ count/likes/dislikes ครบ)

# ★ ตารางเดิมที่สร้างไว้ก่อนมี Like/Dislike → เพิ่มคอลัมน์:
npm run d1:migrate:remote                 # ALTER TABLE เพิ่ม likes/dislikes (เจอ "duplicate column" = มีแล้ว ข้ามได้)
```

> ⚠️ Workers Builds (auto-deploy จาก GitHub) **ไม่รัน migration ให้** → ต้อง `d1 execute` เองครั้งแรก
> ตารางคงอยู่ถาวรหลังจากนั้น; การ push ครั้งต่อ ๆ ไป deploy ตามปกติ (อ่าน binding D1 จาก `wrangler.toml`)
> **คอลัมน์ `likes`/`dislikes` ต้องมีก่อน** ไม่งั้น query view/vote จะ error (ตัวนับ/ปุ่มจะซ่อนเงียบ ๆ — เว็บไม่พัง แต่ไม่ทำงาน)

**ทดสอบในเครื่อง:**

```bash
npx wrangler d1 execute stockai_d1 --local --file=./schema.sql   # สร้างตาราง local
npm run build
npx wrangler dev          # เปิด http://localhost:8787/GOOGL → เห็นตัวนับเด้ง
```

**โควต้า Free plan:** D1 เขียน 100,000 แถว/วัน · Worker 100,000 req/วัน → รองรับ ~100,000 วิว/วัน
(ไฟล์ static ไม่นับโควต้า) · `npm run verify` ตรวจเฉพาะ static — ตัว Worker ทดสอบผ่าน `wrangler dev`
